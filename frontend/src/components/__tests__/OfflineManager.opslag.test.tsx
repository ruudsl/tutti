/**
 * Het beheer van de offline-opslag.
 *
 * Dit venster wordt gebruikt op de gedeelde tablet in de repetitieruimte: een
 * lid kijkt wat er op het apparaat staat, gooit weg wat het niet meer nodig
 * heeft, en drukt aan het eind op "alles wissen" voordat het de tablet
 * doorgeeft. Die knop moet dus ook echt alles wissen - eerder ging hij alleen
 * over de bestandscache, terwijl de gegevens in IndexedDB (het ledenprofiel,
 * de partituurgegevens en de nog niet verstuurde synchronisatiewachtrij)
 * gewoon bleven staan.
 *
 * Alle browservoorzieningen zijn nagemaakt: de cache-opslag, `fetch` en de
 * IndexedDB-laag. Geen enkele test kijkt naar de echte browserstaat.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OfflineManager, cacheForOffline, isAvailableOffline, removeFromOffline } from '../OfflineManager';
import * as offlineOpslag from '../../lib/offlineStorage';
import { showSuccess, showError } from '../../utils/toast';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel, i18n: { language: 'nl' } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

vi.mock('../../utils/toast', () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

/**
 * De nagemaakte IndexedDB-laag houdt een wachtrij bij, zodat een test kan zien
 * dat die er na "alles wissen" niet meer is.
 */
let wachtrij: string[] = [];
vi.mock('../../lib/offlineStorage', () => ({
  clearAllData: vi.fn(),
}));

/** Nagemaakte cache-opslag: een map met cachenaam -> url -> aantal bytes. */
function zetCacheOpslag(inhoud: Record<string, Record<string, number>>) {
  const opslag = new Map<string, Map<string, number>>();
  for (const [naam, bestanden] of Object.entries(inhoud)) {
    opslag.set(naam, new Map(Object.entries(bestanden)));
  }

  const sleutelVan = (verzoek: unknown) => (typeof verzoek === 'string' ? verzoek : (verzoek as { url: string }).url);

  const open = vi.fn(async (naam: string) => {
    if (!opslag.has(naam)) opslag.set(naam, new Map());
    const cache = opslag.get(naam)!;
    return {
      keys: async () => [...cache.keys()].map((url) => ({ url })),
      match: async (verzoek: unknown) => {
        const url = sleutelVan(verzoek);
        if (!cache.has(url)) return undefined;
        const inhoudVanBestand = new Blob(['x'.repeat(cache.get(url)!)]);
        return { clone: () => ({ blob: async () => inhoudVanBestand }) };
      },
      delete: async (verzoek: unknown) => cache.delete(sleutelVan(verzoek)),
      put: async (verzoek: unknown, _respons: unknown) => {
        cache.set(sleutelVan(verzoek), 1);
      },
    };
  });

  vi.stubGlobal('caches', { open });
  return { opslag, open };
}

const PDF = 'https://tutti.example/files/Also%20sprach%20Zarathustra.pdf';
const PDF2 = 'https://tutti.example/files/Marsboek.pdf';
const AUDIO = 'https://tutti.example/files/opname.mp3';

function standaardOpslag() {
  return zetCacheOpslag({
    'pdf-cache': { [PDF]: 2048, [PDF2]: 512 },
    'music-cache': { [AUDIO]: 3 * 1024 * 1024 },
    'api-cache': { 'https://tutti.example/api/members': 100 },
  });
}

async function toon(alsGesloten = vi.fn()) {
  const gebruiker = userEvent.setup();
  render(<OfflineManager isOpen onClose={alsGesloten} />);
  await waitFor(() => expect(screen.queryByText('offline.totalSize:')).not.toBeNull());
  return { gebruiker, alsGesloten };
}

beforeEach(() => {
  vi.clearAllMocks();
  wachtrij = ['repetitie-aanwezigheid-1', 'aantekening-2'];
  vi.mocked(offlineOpslag.clearAllData).mockImplementation(async () => {
    wachtrij = [];
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('offline-opslag - wat er op dit apparaat staat', () => {
  it('toont de bewaarde bestanden met hun grootte en het totaal', async () => {
    standaardOpslag();
    await toon();

    expect(screen.getByText('Also sprach Zarathustra.pdf')).toBeInTheDocument();
    expect(screen.getByText('Marsboek.pdf')).toBeInTheDocument();
    expect(screen.getByText('opname.mp3')).toBeInTheDocument();
    expect(screen.getByText('2.0 KB')).toBeInTheDocument();
    expect(screen.getByText('512 B')).toBeInTheDocument();
    // Twee keer 3.0 MB: de opname zelf, en het totaal dat door de opname wordt
    // bepaald.
    expect(screen.getAllByText('3.0 MB')).toHaveLength(2);
    // Het totaal telt de drie bestanden bij elkaar op (2048 + 512 + 3 MB).
    expect(screen.getByText('offline.totalSize:').parentElement).toHaveTextContent('offline.totalSize: 3.0 MB');

    // De api-cache hoort niet in deze lijst thuis: dat zijn geen bestanden van
    // de gebruiker.
    expect(screen.queryByText('members')).not.toBeInTheDocument();
    // Een pdf krijgt een ander pictogram dan een opname.
    expect(screen.getAllByTestId('icon-fileText')).toHaveLength(2);
    expect(screen.getAllByTestId('icon-music')).toHaveLength(1);
  });

  it('noemt een bestand zonder bruikbare naam "Unknown" in plaats van om te vallen', async () => {
    zetCacheOpslag({ 'pdf-cache': { 'niet-eens-een-url': 42 }, 'music-cache': {} });
    await toon();

    expect(screen.getByText('Unknown')).toBeInTheDocument();
    // Twee keer 42 B: het bestand zelf en het totaal.
    expect(screen.getAllByText('42 B')).toHaveLength(2);
  });

  it('zegt eerlijk dat er niets bewaard is als de opslag leeg is', async () => {
    zetCacheOpslag({ 'pdf-cache': {}, 'music-cache': {} });
    await toon();

    expect(screen.getByText('offline.noItems')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /common\.selectAll/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /offline\.clearAll/ })).not.toBeInTheDocument();
  });

  it('raakt de opslag niet aan zolang het venster dicht is', () => {
    const { open } = standaardOpslag();
    render(<OfflineManager isOpen={false} onClose={vi.fn()} />);

    expect(open).not.toHaveBeenCalled();
    expect(screen.queryByText('offline.manager')).not.toBeInTheDocument();
  });

  /**
   * WACHT, geen bewijs: ook zonder reparatie blijft de component staan als de
   * cache-opslag ontbreekt. Deze test legt dat gedrag vast, zodat een latere
   * wijziging het niet stilletjes weghaalt - op een tablet met sitegegevens uit
   * mag dit venster niet omvallen.
   */
  it('blijft staan als de browser geen cache-opslag heeft', async () => {
    vi.stubGlobal('caches', undefined);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<OfflineManager isOpen onClose={vi.fn()} />);

    expect(await screen.findByText('offline.noItems')).toBeInTheDocument();
    expect(screen.getByText('offline.manager')).toBeInTheDocument();
  });
});

describe('offline-opslag - losse bestanden weggooien', () => {
  it('verwijdert het aangevinkte bestand en laat de rest staan', async () => {
    const { opslag } = standaardOpslag();
    const { gebruiker } = await toon();

    await gebruiker.click(screen.getByText('Marsboek.pdf'));
    const verwijderknop = await screen.findByRole('button', { name: /common\.delete \(1\)/ });
    await gebruiker.click(verwijderknop);

    await waitFor(() => expect(screen.queryByText('Marsboek.pdf')).not.toBeInTheDocument());
    expect(opslag.get('pdf-cache')!.has(PDF2)).toBe(false);
    expect(opslag.get('pdf-cache')!.has(PDF)).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('offline.deleted');
    // De selectie is opgeruimd, dus de verwijderknop is weg.
    expect(screen.queryByRole('button', { name: /common\.delete/ })).not.toBeInTheDocument();
  });

  /**
   * BEWIJS bij de reparatie van het vinkje in de lijst.
   *
   * Elk bestand heeft een vinkje, maar dat vinkje deed niets: het had een lege
   * onChange en hield met stopPropagation ook de klik op de regel tegen. Wie
   * dus op het vinkje mikte - de meest voor de hand liggende plek - zag het
   * even aanslaan en meteen weer terugspringen, en kon niets verwijderen. Alleen
   * een klik naast het vinkje werkte.
   *
   * Zonder de reparatie is deze test rood: de verwijderknop verscheen niet,
   * want er was niets geselecteerd.
   */
  it('selecteert een bestand met een klik op het vinkje zelf', async () => {
    standaardOpslag();
    const { gebruiker } = await toon();

    const regels = screen.getAllByRole('checkbox');
    await gebruiker.click(regels[1]);

    expect(await screen.findByRole('button', { name: /common\.delete \(1\)/ })).toBeInTheDocument();
    expect(regels[1]).toBeChecked();
    // Alleen dat ene bestand, dus de klik heeft niet ook de regel eronder geraakt.
    expect(regels[0]).not.toBeChecked();
    expect(regels[2]).not.toBeChecked();
  });

  it('haalt het vinkje er met een tweede klik weer af', async () => {
    standaardOpslag();
    const { gebruiker } = await toon();

    await gebruiker.click(screen.getByText('Marsboek.pdf'));
    expect(await screen.findByRole('button', { name: /common\.delete \(1\)/ })).toBeInTheDocument();

    await gebruiker.click(screen.getByText('Marsboek.pdf'));
    await waitFor(() => expect(screen.queryByRole('button', { name: /common\.delete/ })).not.toBeInTheDocument());
  });

  it('selecteert alles en laat de selectie weer los', async () => {
    standaardOpslag();
    const { gebruiker } = await toon();

    await gebruiker.click(screen.getByRole('button', { name: 'common.selectAll' }));
    expect(await screen.findByRole('button', { name: /common\.delete \(3\)/ })).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox').filter((v) => (v as HTMLInputElement).checked)).toHaveLength(3);

    await gebruiker.click(screen.getByRole('button', { name: 'common.deselectAll' }));
    expect(screen.queryByRole('button', { name: /common\.delete/ })).not.toBeInTheDocument();
  });

  it('verwijdert alle aangevinkte bestanden in één keer', async () => {
    const { opslag } = standaardOpslag();
    const { gebruiker } = await toon();

    await gebruiker.click(screen.getByRole('button', { name: 'common.selectAll' }));
    await gebruiker.click(await screen.findByRole('button', { name: /common\.delete \(3\)/ }));

    await waitFor(() => expect(screen.getByText('offline.noItems')).toBeInTheDocument());
    expect(opslag.get('pdf-cache')!.size).toBe(0);
    expect(opslag.get('music-cache')!.size).toBe(0);
    // De api-cache blijft bij het verwijderen van losse bestanden buiten schot.
    expect(opslag.get('api-cache')!.size).toBe(1);
  });

  it('meldt het als verwijderen mislukt en houdt het bestand in de lijst', async () => {
    standaardOpslag();
    const kapotteOpslag = {
      open: vi.fn(async () => ({
        keys: async () => [],
        match: async () => undefined,
        delete: async () => {
          throw new Error('opslag geweigerd');
        },
        put: async () => {},
      })),
    };
    const { gebruiker } = await toon();
    vi.stubGlobal('caches', kapotteOpslag);

    await gebruiker.click(screen.getByText('Marsboek.pdf'));
    await gebruiker.click(await screen.findByRole('button', { name: /common\.delete \(1\)/ }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('errors.generic'));
    expect(screen.getByText('Marsboek.pdf')).toBeInTheDocument();
    expect(showSuccess).not.toHaveBeenCalled();
  });
});

describe('offline-opslag - alles wissen op een gedeeld apparaat', () => {
  /**
   * BEWIJS bij de reparatie in OfflineManager.clearAllCache.
   *
   * De knop heet "alles wissen" en de melding erna zegt "offline opslag
   * gewist", maar hij liep alleen langs de drie cachenamen. Alles wat in
   * IndexedDB staat - het profiel van het vorige lid, de gegevens van de vorige
   * vereniging en de nog niet verstuurde synchronisatiewachtrij - bleef staan.
   * Op de gedeelde tablet zag de volgende gebruiker die gegevens dus gewoon
   * terug, terwijl de vorige net had gelezen dat alles gewist was.
   *
   * Zonder de reparatie is deze test rood op de regel met clearAllData: die
   * werd nooit aangeroepen, en de wachtrij was na afloop nog gevuld.
   */
  it('wist naast de bestandscache ook de gegevens en de wachtrij in IndexedDB', async () => {
    const { opslag } = standaardOpslag();
    const { gebruiker } = await toon();

    await gebruiker.click(screen.getByRole('button', { name: 'offline.clearAll' }));

    await waitFor(() => expect(offlineOpslag.clearAllData).toHaveBeenCalledTimes(1));
    expect(wachtrij).toEqual([]);
    expect(opslag.get('pdf-cache')!.size).toBe(0);
    expect(opslag.get('music-cache')!.size).toBe(0);
    // Ook de api-cache gaat mee: daar staan de antwoorden van de vorige
    // vereniging in.
    expect(opslag.get('api-cache')!.size).toBe(0);
    expect(showSuccess).toHaveBeenCalledWith('offline.cleared');
    expect(await screen.findByText('offline.noItems')).toBeInTheDocument();
  });

  /**
   * BEWIJS bij dezelfde reparatie, vanaf de andere kant.
   *
   * Lukt het legen van IndexedDB niet, dan mag er geen "gewist" op het scherm
   * komen: de gebruiker geeft dan een tablet door die nog vol staat. Zonder de
   * reparatie is deze test rood, want de oude code raakte IndexedDB niet aan en
   * meldde altijd succes.
   */
  it('meldt een fout in plaats van succes als IndexedDB niet leeggemaakt kan worden', async () => {
    standaardOpslag();
    vi.mocked(offlineOpslag.clearAllData).mockRejectedValue(new Error('opslag geblokkeerd'));
    const { gebruiker } = await toon();

    await gebruiker.click(screen.getByRole('button', { name: 'offline.clearAll' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('errors.generic'));
    expect(showSuccess).not.toHaveBeenCalled();
  });

  it('sluit het venster met de sluitknoppen en met een klik ernaast', async () => {
    standaardOpslag();
    const { gebruiker, alsGesloten } = await toon();

    // Een klik in het venster zelf sluit juist niet.
    await gebruiker.click(screen.getByText('offline.manager'));
    expect(alsGesloten).not.toHaveBeenCalled();

    await gebruiker.click(screen.getByRole('button', { name: 'common.close' }));
    expect(alsGesloten).toHaveBeenCalledTimes(1);

    await gebruiker.click(screen.getByLabelText('Sluiten'));
    expect(alsGesloten).toHaveBeenCalledTimes(2);

    await gebruiker.click(document.querySelector('.modal-overlay') as HTMLElement);
    expect(alsGesloten).toHaveBeenCalledTimes(3);
  });
});

describe('offline-opslag - bestanden klaarzetten en terugvinden', () => {
  it('zet een partituur in de pdf-cache en een opname in de muziekcache', async () => {
    const { opslag } = zetCacheOpslag({});
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true })),
    );

    expect(await cacheForOffline(PDF)).toBe(true);
    expect(await cacheForOffline(AUDIO)).toBe(true);

    expect(opslag.get('pdf-cache')!.has(PDF)).toBe(true);
    expect(opslag.get('music-cache')!.has(AUDIO)).toBe(true);
  });

  it('zet niets klaar als de server het bestand niet geeft', async () => {
    const { opslag } = zetCacheOpslag({});
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false })),
    );

    expect(await cacheForOffline(PDF)).toBe(false);
    expect(opslag.get('pdf-cache')).toBeUndefined();
  });

  it('geeft geen fout door als het netwerk helemaal wegvalt', async () => {
    zetCacheOpslag({});
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );

    expect(await cacheForOffline(PDF)).toBe(false);
  });

  it('weet welke partituur offline beschikbaar is en welke niet', async () => {
    zetCacheOpslag({ 'pdf-cache': { [PDF]: 10 } });

    expect(await isAvailableOffline(PDF)).toBe(true);
    expect(await isAvailableOffline(PDF2)).toBe(false);
  });

  it('haalt een partituur weer uit de offline-opslag', async () => {
    const { opslag } = zetCacheOpslag({ 'pdf-cache': { [PDF]: 10 } });

    expect(await removeFromOffline(PDF)).toBe(true);
    expect(opslag.get('pdf-cache')!.has(PDF)).toBe(false);
    // Een tweede poging meldt netjes dat er niets te verwijderen viel.
    expect(await removeFromOffline(PDF)).toBe(false);
  });

  it('meldt geen beschikbaarheid als de cache-opslag ontbreekt', async () => {
    vi.stubGlobal('caches', undefined);

    expect(await isAvailableOffline(PDF)).toBe(false);
    expect(await removeFromOffline(PDF)).toBe(false);
  });
});
