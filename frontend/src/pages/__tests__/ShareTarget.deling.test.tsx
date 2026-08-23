/**
 * De pagina waar een gedeeld bestand of een gedeelde tekst binnenkomt.
 *
 * ShareTarget.tsx is het landingspunt van de deel-actie van het besturings-
 * systeem: iemand kiest in een andere app "delen" en komt hier uit. De pagina
 * heeft geen knoppen - hij doet zijn werk in een effect en verwijst daarna
 * door. Juist daarom is hij zonder tests riskant: gaat er iets mis in dat
 * effect, dan blijft de gebruiker naar een draaiend wieltje kijken zonder dat
 * er ergens iets rood wordt.
 *
 * Wat hier vastligt is wat de gebruiker ziet en waar hij terechtkomt:
 *   - gedeelde tekst komt als tekst aan en gaat naar /my-music, met de inhoud
 *     mee in de navigatiestaat;
 *   - gedeelde bestanden worden geüpload, de kaart meldt dát, en de cache
 *     wordt geleegd zodat hetzelfde bestand niet bij het volgende bezoek nog
 *     eens langskomt;
 *   - is er niets gedeeld, dan zegt de pagina dat en stuurt hij naar de
 *     startpagina;
 *   - loopt er iets stuk - een browser zonder CacheStorage, een upload die
 *     faalt - dan komt er een melding en geen wit scherm.
 *
 * De timers worden met neptijd gedraaid. Dat is hier geen kunstje: de
 * doorverwijzing is het enige zichtbare gevolg van de meeste paden, en met
 * echte tijd zou elke test anderhalve tot twee seconden stilstaan.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import ShareTarget from '../ShareTarget';
import { uploadSharedPdf } from '../../api/music';
import { showError, showSuccess } from '../../utils/toast';

const navigeer = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigeer,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../utils/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));

vi.mock('../../api/music', () => ({ uploadSharedPdf: vi.fn() }));

vi.mock('../../components/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icoon-${name}`} />,
}));

/** Zet window.location.href zonder dat jsdom echt navigeert. */
function metAdres(adres: string) {
  window.history.replaceState({}, '', adres);
}

/**
 * Een nep-CacheStorage met nul of meer opgeslagen deelverzoeken.
 *
 * De echte deel-actie zet het POST-verzoek van het besturingssysteem in de
 * cache `share-target-cache`; de pagina haalt het daar op. jsdom kent
 * `caches` helemaal niet, dus zonder deze dubbelganger loopt elke test in de
 * foutafhandeling.
 */
function zetCacheOp(bestanden: File[][]) {
  const sleutels = bestanden.map((_, i) => `verzoek-${i}` as unknown as Request);
  const verwijderd: unknown[] = [];
  const cache = {
    keys: vi.fn(async () => sleutels),
    match: vi.fn(async (verzoek: unknown) => {
      const index = sleutels.indexOf(verzoek as Request);
      if (index < 0) return undefined;
      const formulier = new FormData();
      for (const bestand of bestanden[index]) formulier.append('files', bestand);
      return { formData: async () => formulier };
    }),
    delete: vi.fn(async (verzoek: unknown) => {
      verwijderd.push(verzoek);
      return true;
    }),
  };
  (globalThis as any).caches = { open: vi.fn(async () => cache) };
  return { cache, verwijderd };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  metAdres('/share-target');
  delete (globalThis as any).caches;
});

afterEach(() => {
  vi.useRealTimers();
  delete (globalThis as any).caches;
});

/**
 * Laat de wachtende beloftes in het effect aflopen.
 *
 * `handleSharedContent` is async en wordt niet afgewacht door het effect, dus
 * na `render` staat er nog een rij microtaken open. `advanceTimersByTimeAsync`
 * loopt die af én zet de klok vooruit, wat precies is wat hier nodig is.
 */
async function laatEffectAflopen(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('ShareTarget - gedeelde tekst', () => {
  it('meldt de ontvangen tekst en stuurt hem mee naar mijn muziek', async () => {
    metAdres('/share-target?title=Mars&text=Kijk%20eens&url=https%3A%2F%2Fvoorbeeld.nl');

    render(<ShareTarget />);
    await laatEffectAflopen();

    expect(screen.getByText('shareTarget.success')).toBeInTheDocument();
    expect(screen.getByText('shareTarget.receivedText')).toBeInTheDocument();

    // De doorverwijzing hoort pas na anderhalve seconde te komen, zodat de
    // gebruiker de bevestiging nog leest.
    expect(navigeer).not.toHaveBeenCalled();
    await laatEffectAflopen(1500);

    expect(navigeer).toHaveBeenCalledWith('/my-music', {
      state: { sharedContent: { title: 'Mars', text: 'Kijk eens', url: 'https://voorbeeld.nl' } },
    });
  });

  it('kijkt niet in de cache als er al tekst gedeeld is', async () => {
    metAdres('/share-target?text=alleen%20tekst');
    const { cache } = zetCacheOp([]);

    render(<ShareTarget />);
    await laatEffectAflopen(1500);

    expect(cache.keys).not.toHaveBeenCalled();
    expect(uploadSharedPdf).not.toHaveBeenCalled();
  });
});

describe('ShareTarget - gedeelde bestanden', () => {
  it('uploadt elk bestand, meldt dat in de kaart en leegt de cache', async () => {
    const partij = new File(['%PDF-'], 'partij.pdf', { type: 'application/pdf' });
    const tweede = new File(['%PDF-'], 'tweede.pdf', { type: 'application/pdf' });
    const { cache, verwijderd } = zetCacheOp([[partij, tweede]]);
    vi.mocked(uploadSharedPdf).mockResolvedValue({ id: 'x' });

    render(<ShareTarget />);
    await laatEffectAflopen();

    expect(uploadSharedPdf).toHaveBeenCalledTimes(2);
    expect(vi.mocked(uploadSharedPdf).mock.calls.map(([b]) => (b as File).name)).toEqual([
      'partij.pdf',
      'tweede.pdf',
    ]);

    // Het verzoek moet uit de cache, anders komt hetzelfde bestand bij het
    // volgende bezoek aan deze pagina nog een keer voorbij.
    expect(cache.delete).toHaveBeenCalledTimes(1);
    expect(verwijderd).toHaveLength(1);

    // BEWIJS - rood zonder de reparatie in ShareTarget.tsx.
    // De kaart zette wel `status` op 'success' maar nooit `message`, dus stond
    // er "Gelukt!" met een lege regel eronder. Zonder `setMessage(gelukt)`
    // faalt deze regel; de toast erboven was al groen.
    expect(screen.getByText('shareTarget.filesUploaded')).toBeInTheDocument();
    expect(showSuccess).toHaveBeenCalledWith('shareTarget.filesUploaded');

    await laatEffectAflopen(2000);
    // Alleen het doel telt hier; of er een lege staat achteraan meegaat is
    // geen gedrag dat de gebruiker merkt.
    expect(navigeer.mock.calls.map(([doel]) => doel)).toEqual(['/my-music']);
  });

  it('toont een melding en geen wit scherm als het uploaden mislukt', async () => {
    zetCacheOp([[new File(['%PDF-'], 'stuk.pdf', { type: 'application/pdf' })]]);
    vi.mocked(uploadSharedPdf).mockRejectedValue(new Error('413'));

    render(<ShareTarget />);
    await laatEffectAflopen();

    expect(screen.getByText('shareTarget.failed')).toBeInTheDocument();
    expect(screen.getByText('shareTarget.error')).toBeInTheDocument();
    expect(showError).toHaveBeenCalledWith('errors.generic');
  });
});

describe('ShareTarget - niets bruikbaars', () => {
  it('zegt dat er niets gedeeld is en gaat terug naar de startpagina', async () => {
    zetCacheOp([]);

    render(<ShareTarget />);
    await laatEffectAflopen();

    expect(screen.getByText('shareTarget.failed')).toBeInTheDocument();
    expect(screen.getByText('shareTarget.noContent')).toBeInTheDocument();

    await laatEffectAflopen(2000);
    expect(navigeer.mock.calls.map(([doel]) => doel)).toEqual(['/']);
  });

  it('overleeft een browser zonder CacheStorage', async () => {
    // `caches` staat hier bewust niet in globalThis - net als in een browser
    // zonder beveiligde context. De verwijzing gooit dan een ReferenceError,
    // en die hoort in de foutafhandeling te belanden in plaats van als
    // onbehandelde fout de pagina leeg te laten.
    render(<ShareTarget />);
    await laatEffectAflopen();

    expect(screen.getByText('shareTarget.failed')).toBeInTheDocument();
    expect(screen.getByText('shareTarget.error')).toBeInTheDocument();
  });
});

describe('ShareTarget - vertrek voor de doorverwijzing', () => {
  it('verwijst niet meer door als de gebruiker de pagina zelf verlaten heeft', async () => {
    metAdres('/share-target?text=iets');

    const { unmount } = render(<ShareTarget />);
    await laatEffectAflopen();
    expect(screen.getByText('shareTarget.success')).toBeInTheDocument();

    // De gebruiker klikt binnen die anderhalve seconde zelf iets in het menu
    // aan; deze pagina verdwijnt daarmee.
    unmount();
    await laatEffectAflopen(5000);

    // BEWIJS - rood zonder de reparatie in ShareTarget.tsx.
    // De timers werden nergens opgeruimd, dus de wachtende doorverwijzing
    // sprong alsnog naar /my-music - weg van de pagina die de gebruiker net
    // zelf gekozen had.
    expect(navigeer).not.toHaveBeenCalled();
  });

  it('verwijst niet meer door als de pagina verdwijnt terwijl er nog geüpload wordt', async () => {
    let losMaken: (waarde: { id: string }) => void = () => {};
    zetCacheOp([[new File(['%PDF-'], 'traag.pdf', { type: 'application/pdf' })]]);
    vi.mocked(uploadSharedPdf).mockReturnValue(
      new Promise((resolve) => {
        losMaken = resolve;
      }),
    );

    const { unmount } = render(<ShareTarget />);
    await laatEffectAflopen();

    // De pagina verdwijnt terwijl de upload nog loopt: de teller wordt hierna
    // pas gezet, dus alleen een clearTimeout in de opruiming zou hem missen.
    unmount();
    await act(async () => {
      losMaken({ id: 'x' });
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(navigeer).not.toHaveBeenCalled();
  });
});
