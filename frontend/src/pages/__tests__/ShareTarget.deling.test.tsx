/**
 * De pagina waar een gedeelde PDF binnenkomt.
 *
 * ShareTarget.tsx is het landingspunt van de deel-actie van het besturings-
 * systeem: iemand kiest in een andere app "delen" en komt hier uit. De
 * service worker (sw-custom.ts) heeft het formulier in de cache
 * `share-target-cache` gezet; de pagina haalt de PDF's eruit en zet ze klaar
 * op de uploadpagina, waar de gebruiker orkest en lijst kiest.
 *
 * Eerder uploadde de pagina zelf naar `/api/upload/pdf`, een route die op de
 * server nooit heeft bestaan: elke gedeelde PDF liep op een 404 stuk.
 *
 * Wat hier vastligt:
 *   - PDF's gaan mee naar /upload, en de cache is daarna leeg;
 *   - wat geen PDF is, valt af; zonder PDF een melding;
 *   - wie niet mag uploaden krijgt een melding, en de cache wordt ook dan
 *     geleegd;
 *   - niet ingelogd: naar het inlogscherm, met de weg terug hierheen;
 *   - een browser zonder CacheStorage of een kapotte cache geeft een melding,
 *     geen draaiend wieltje.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import ShareTarget from '../ShareTarget';
import { showError } from '../../utils/toast';

const navigeer = vi.fn();
const { gebruiker } = vi.hoisted(() => ({ gebruiker: { huidig: null as null | { role: string } } }));

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigeer,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../utils/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: gebruiker.huidig }),
}));

vi.mock('../../components/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icoon-${name}`} />,
}));

/** Een nep-CacheStorage met nul of meer opgeslagen deelverzoeken. jsdom kent `caches` niet. */
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

const pdf = (naam: string) => new File(['%PDF-1.4'], naam, { type: 'application/pdf' });

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  gebruiker.huidig = { role: 'music_committee' };
  delete (globalThis as any).caches;
});

afterEach(() => {
  vi.useRealTimers();
  delete (globalThis as any).caches;
});

/** Laat de beloftes in het effect aflopen en zet de klok zo nodig vooruit. */
async function laatEffectAflopen(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('ShareTarget - gedeelde PDF', () => {
  it('zet de PDF’s uit alle verzoeken klaar op de uploadpagina en leegt de cache', async () => {
    const { verwijderd } = zetCacheOp([[pdf('partij.pdf')], [pdf('tweede.pdf')]]);

    render(<ShareTarget />);
    await laatEffectAflopen();

    expect(navigeer).toHaveBeenCalledTimes(1);
    const [doel, opties] = navigeer.mock.calls[0];
    expect(doel).toBe('/upload');
    expect(opties.replace).toBe(true);
    expect((opties.state.gedeeldeBestanden as File[]).map((b) => b.name)).toEqual(['partij.pdf', 'tweede.pdf']);
    expect(verwijderd).toHaveLength(2);
  });

  it('laat wat geen PDF is vallen', async () => {
    zetCacheOp([[pdf('partij.pdf'), new File(['x'], 'foto.jpg', { type: 'image/jpeg' })]]);

    render(<ShareTarget />);
    await laatEffectAflopen();

    const [, opties] = navigeer.mock.calls[0];
    expect((opties.state.gedeeldeBestanden as File[]).map((b) => b.name)).toEqual(['partij.pdf']);
  });

  it('meldt het als er alleen iets anders dan een PDF gedeeld is', async () => {
    zetCacheOp([[new File(['x'], 'foto.jpg', { type: 'image/jpeg' })]]);

    render(<ShareTarget />);
    await laatEffectAflopen();

    expect(screen.getByText('shareTarget.geenPdf')).toBeInTheDocument();
    await laatEffectAflopen(2500);
    expect(navigeer).toHaveBeenCalledWith('/', { replace: true });
  });
});

describe('ShareTarget - wie het mag', () => {
  it('stuurt wie niet ingelogd is naar het inlogscherm, met de weg terug', async () => {
    gebruiker.huidig = null;
    const { cache } = zetCacheOp([[pdf('partij.pdf')]]);

    render(<ShareTarget />);
    await laatEffectAflopen();

    expect(navigeer).toHaveBeenCalledWith('/login', { replace: true, state: { terug: '/share-target' } });
    // De bestanden blijven staan tot na het inloggen.
    expect(cache.delete).not.toHaveBeenCalled();
  });

  it('meldt het aan een lid dat niet mag uploaden, en leegt de cache toch', async () => {
    gebruiker.huidig = { role: 'member' };
    const { verwijderd } = zetCacheOp([[pdf('partij.pdf')]]);

    render(<ShareTarget />);
    await laatEffectAflopen();

    expect(screen.getByText('shareTarget.geenRechten')).toBeInTheDocument();
    expect(verwijderd).toHaveLength(1);
    expect(navigeer).not.toHaveBeenCalledWith('/upload', expect.anything());
  });
});

describe('ShareTarget - niets bruikbaars of een fout', () => {
  it('zegt dat er niets gedeeld is en gaat terug naar de startpagina', async () => {
    zetCacheOp([]);

    render(<ShareTarget />);
    await laatEffectAflopen();

    expect(screen.getByText('shareTarget.noContent')).toBeInTheDocument();
    expect(navigeer).not.toHaveBeenCalled();
    await laatEffectAflopen(2500);
    expect(navigeer).toHaveBeenCalledWith('/', { replace: true });
  });

  it('overleeft een browser zonder CacheStorage', async () => {
    render(<ShareTarget />);
    await laatEffectAflopen();

    expect(screen.getByText('shareTarget.noContent')).toBeInTheDocument();
  });

  it('geeft een melding en geen draaiend wieltje als de cache stukgaat', async () => {
    (globalThis as any).caches = { open: vi.fn(async () => Promise.reject(new Error('stuk'))) };
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<ShareTarget />);
    await laatEffectAflopen();

    expect(screen.getByText('shareTarget.error')).toBeInTheDocument();
    expect(showError).toHaveBeenCalledWith('shareTarget.error');
  });

  it('verwijst niet meer door als de gebruiker de pagina zelf verlaten heeft', async () => {
    zetCacheOp([]);

    const { unmount } = render(<ShareTarget />);
    await laatEffectAflopen();
    unmount();
    await laatEffectAflopen(2500);

    expect(navigeer).not.toHaveBeenCalled();
  });
});
