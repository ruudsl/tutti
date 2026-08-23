/**
 * Streaminglinks bij een muziekstuk beheren.
 *
 * Het venster doet drie dingen: het toont de links die er al zijn, het laat er
 * met de hand een YouTube Music-adres bij typen, en het zoekt nummers op bij
 * Spotify of Apple Music. Wat de gebruiker intypt komt in een `href` terecht,
 * en dat is de reden dat een ongeldige link hier een eigen hoofdstuk heeft: een
 * adres dat met `javascript:` begint is geen streaminglink maar code die
 * uitgevoerd wordt zodra iemand erop klikt.
 *
 * Er gaat geen enkel verzoek de deur uit in deze tests; de api-laag is
 * vervangen door een dubbelganger.
 */

import '@testing-library/jest-dom';
import type { ReactNode } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StreamingLinkEditor } from '../StreamingLinkEditor';
import { searchStreamingTracks, updateStreamingLinks, getStreamingStatus } from '../../api';
import { showError, showSuccess } from '../../utils/toast';

vi.mock('../../api', () => ({
  searchStreamingTracks: vi.fn(),
  updateStreamingLinks: vi.fn(),
  getStreamingStatus: vi.fn(),
}));

vi.mock('../../utils/toast', () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel, i18n: { language: 'nl' } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

const zoeken = vi.mocked(searchStreamingTracks);
const opslaan = vi.mocked(updateStreamingLinks);
const status = vi.mocked(getStreamingStatus);

/** Elk geluid dat het venster probeert af te spelen, zonder echte speler. */
const geluiden: { src: string; play: ReturnType<typeof vi.fn>; pause: ReturnType<typeof vi.fn> }[] = [];

function nummer(overschrijving: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'nr-1',
    name: 'Also sprach Zarathustra',
    artist: 'Berliner Philharmoniker',
    album: 'Strauss',
    albumArt: null,
    durationMs: 210000,
    previewUrl: null,
    url: 'https://open.spotify.com/track/nr-1',
    platform: 'spotify' as const,
    ...overschrijving,
  };
}

function Omhulsel({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function toon(eigenschappen: Partial<Parameters<typeof StreamingLinkEditor>[0]> = {}) {
  const sluiten = vi.fn();
  const bewaard = vi.fn();
  render(
    <Omhulsel>
      <StreamingLinkEditor
        titleId="titel-1"
        titleName="Also sprach Zarathustra"
        onClose={sluiten}
        onSave={bewaard}
        {...eigenschappen}
      />
    </Omhulsel>,
  );
  return { sluiten, bewaard };
}

beforeEach(() => {
  vi.clearAllMocks();
  geluiden.length = 0;
  status.mockResolvedValue({ spotify: true, appleMusic: true });
  opslaan.mockResolvedValue({ message: 'ok', links: {} } as never);

  vi.stubGlobal(
    'Audio',
    class {
      volume = 1;
      onended: (() => void) | null = null;
      onerror: (() => void) | null = null;
      play = vi.fn();
      pause = vi.fn();
      constructor(public src: string) {
        geluiden.push(this as never);
      }
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('StreamingLinkEditor - de links die er al zijn', () => {
  it('meldt het als er nog geen enkele link is', () => {
    toon();

    expect(screen.getByText('streaming.noLinks')).toBeInTheDocument();
  });

  it('toont elke link met een verwijzing naar de dienst', async () => {
    toon({
      currentLinks: {
        spotify_url: 'https://open.spotify.com/track/abc',
        apple_music_url: 'https://music.apple.com/nl/album/abc',
        youtube_music_url: 'https://music.youtube.com/watch?v=abc',
      },
    });

    expect(screen.queryByText('streaming.noLinks')).not.toBeInTheDocument();
    // De naam van de dienst staat twee keer op het scherm: als kopje boven de
    // link en op de knop van de zoekbalk. Hier gaat het om het kopje.
    expect(screen.getByText('Spotify', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('Apple Music', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('YouTube Music', { selector: 'span' })).toBeInTheDocument();

    const verwijzingen = screen.getAllByRole('link', { name: 'streaming.openLink' });
    expect(verwijzingen.map((a) => a.getAttribute('href'))).toEqual([
      'https://open.spotify.com/track/abc',
      'https://music.apple.com/nl/album/abc',
      'https://music.youtube.com/watch?v=abc',
    ]);
  });

  it('haalt een link weg en slaat de rest zonder die link op', async () => {
    const gebruiker = userEvent.setup();
    toon({
      currentLinks: {
        spotify_url: 'https://open.spotify.com/track/abc',
        spotify_preview_url: 'https://p.scdn.co/abc.mp3',
        youtube_music_url: 'https://music.youtube.com/watch?v=abc',
      },
    });

    const spotifyRegel = screen.getByText('Spotify', { selector: 'span' }).closest('div')!.parentElement!;
    await gebruiker.click(within(spotifyRegel).getByRole('button', { name: 'common.delete' }));

    expect(screen.queryByText('Spotify', { selector: 'span' })).not.toBeInTheDocument();

    await gebruiker.click(screen.getByRole('button', { name: 'common.save' }));

    // Ook het voorbeluisteradres van Spotify hoort mee te verdwijnen.
    await waitFor(() =>
      expect(opslaan).toHaveBeenCalledWith('titel-1', { youtube_music_url: 'https://music.youtube.com/watch?v=abc' }),
    );
  });
});

describe('StreamingLinkEditor - een adres met de hand invullen', () => {
  it('slaat een ingetypt YouTube Music-adres op', async () => {
    const gebruiker = userEvent.setup();
    const { sluiten, bewaard } = toon();

    await gebruiker.type(
      screen.getByPlaceholderText('streaming.youtubeMusicUrlPlaceholder'),
      'https://music.youtube.com/watch?v=abc',
    );
    await gebruiker.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() =>
      expect(opslaan).toHaveBeenCalledWith('titel-1', { youtube_music_url: 'https://music.youtube.com/watch?v=abc' }),
    );
    expect(showSuccess).toHaveBeenCalledWith('streaming.linksSaved');
    expect(bewaard).toHaveBeenCalled();
    expect(sluiten).toHaveBeenCalled();
  });

  it('laat een leeggemaakt veld geen lege tekst achter', async () => {
    const gebruiker = userEvent.setup();
    toon({ currentLinks: { youtube_music_url: 'https://music.youtube.com/watch?v=abc' } });

    await gebruiker.clear(screen.getByPlaceholderText('streaming.youtubeMusicUrlPlaceholder'));
    await gebruiker.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(opslaan).toHaveBeenCalledWith('titel-1', { youtube_music_url: undefined }));
  });

  /**
   * BEWIJS. Het veld draagt `type="url"`, maar er staat geen formulier omheen
   * en er wordt niets ingediend: opslaan is een gewone klik op een knop. De
   * browser komt er dus nooit aan te pas en het veld controleerde niets. Alles
   * wat iemand intypte ging zo naar de server en kwam er als `href` weer uit.
   *
   * Zonder de reparatie is deze test rood: `updateStreamingLinks` werd
   * aangeroepen met `javascript:alert(1)` en er verscheen geen melding.
   */
  it('weigert een adres dat geen webadres is en slaat niets op', async () => {
    const gebruiker = userEvent.setup();
    const { sluiten } = toon();

    await gebruiker.type(screen.getByPlaceholderText('streaming.youtubeMusicUrlPlaceholder'), 'javascript:alert(1)');
    await gebruiker.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('errors.invalidUrl'));
    expect(opslaan).not.toHaveBeenCalled();
    expect(sluiten).not.toHaveBeenCalled();
  });

  /**
   * BEWIJS, zelfde reparatie. Ook gewone onzin - iets zonder schema - is geen
   * bruikbare link; die hoorde niet opgeslagen te worden.
   */
  it('weigert ook tekst die helemaal geen adres is', async () => {
    const gebruiker = userEvent.setup();
    toon();

    await gebruiker.type(screen.getByPlaceholderText('streaming.youtubeMusicUrlPlaceholder'), 'muziek.youtube');
    await gebruiker.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('errors.invalidUrl'));
    expect(opslaan).not.toHaveBeenCalled();
  });

  /**
   * BEWIJS, zelfde reparatie aan de andere kant. Een onveilig adres dat al in
   * de gegevens staat - opgeslagen voordat er gecontroleerd werd - mag ook bij
   * het tonen geen aanklikbare verwijzing worden.
   *
   * Zonder de reparatie is deze test rood: er stond een `<a>` met
   * `href="javascript:alert(1)"` op het scherm.
   */
  it('maakt van een onveilig adres uit de gegevens geen aanklikbare verwijzing', () => {
    toon({ currentLinks: { youtube_music_url: 'javascript:alert(1)' } });

    expect(screen.getByText('YouTube Music')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'streaming.openLink' })).not.toBeInTheDocument();
    expect(document.querySelector('a[href^="javascript:"]')).toBeNull();
  });

  /**
   * BEWIJS, zelfde reparatie. Wie iets fouts intypt hoort dat te zien voordat
   * hij op opslaan drukt.
   */
  it('markeert het veld als het ingetypte adres niet deugt', async () => {
    const gebruiker = userEvent.setup();
    toon();

    const veld = screen.getByPlaceholderText('streaming.youtubeMusicUrlPlaceholder');
    expect(veld).toHaveAttribute('aria-invalid', 'false');

    await gebruiker.type(veld, 'javascript:alert(1)');
    expect(veld).toHaveAttribute('aria-invalid', 'true');

    await gebruiker.clear(veld);
    await gebruiker.type(veld, 'https://music.youtube.com/watch?v=abc');
    expect(veld).toHaveAttribute('aria-invalid', 'false');
  });
});

describe('StreamingLinkEditor - zoeken bij de diensten', () => {
  it('begint met de titel van het stuk in het zoekveld', () => {
    toon();

    expect(screen.getByPlaceholderText('streaming.searchPlaceholder')).toHaveValue('Also sprach Zarathustra');
  });

  it('zoekt met de componist erbij en toont de gevonden nummers', async () => {
    const gebruiker = userEvent.setup();
    zoeken.mockResolvedValue({ results: [nummer(), nummer({ id: 'nr-2', name: 'Tweede', durationMs: 65000 })] });
    toon({ composer: 'Richard Strauss' });

    await gebruiker.click(screen.getByRole('button', { name: 'common.search' }));

    expect(zoeken).toHaveBeenCalledWith('Also sprach Zarathustra', 'spotify', 'Richard Strauss');
    expect(await screen.findByText('Tweede')).toBeInTheDocument();
    expect(screen.getAllByText('Berliner Philharmoniker - Strauss')).toHaveLength(2);
    // De speelduur staat er in minuten en seconden, met een nul ervoor waar dat hoort.
    expect(screen.getByText('3:30')).toBeInTheDocument();
    expect(screen.getByText('1:05')).toBeInTheDocument();
  });

  it('zoekt ook met de Enter-toets', async () => {
    const gebruiker = userEvent.setup();
    zoeken.mockResolvedValue({ results: [] });
    toon();

    await gebruiker.type(screen.getByPlaceholderText('streaming.searchPlaceholder'), '{Enter}');

    await waitFor(() => expect(zoeken).toHaveBeenCalled());
  });

  it('houdt de zoekknop op slot zolang er niets ingevuld is', async () => {
    const gebruiker = userEvent.setup();
    toon({ titleName: '' });

    expect(screen.getByRole('button', { name: 'common.search' })).toBeDisabled();

    await gebruiker.type(screen.getByPlaceholderText('streaming.searchPlaceholder'), 'iets');
    expect(screen.getByRole('button', { name: 'common.search' })).toBeEnabled();
  });

  it('meldt de fout van de dienst als het zoeken mislukt', async () => {
    const gebruiker = userEvent.setup();
    zoeken.mockRejectedValue({ response: { data: { error: 'Spotify antwoordt niet' } } });
    toon();

    await gebruiker.click(screen.getByRole('button', { name: 'common.search' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('Spotify antwoordt niet'));
  });

  it('zet een gekozen nummer bij de links en ruimt de zoekuitslag op', async () => {
    const gebruiker = userEvent.setup();
    zoeken.mockResolvedValue({
      results: [nummer({ previewUrl: 'https://p.scdn.co/nr-1.mp3' })],
    });
    toon();

    await gebruiker.click(screen.getByRole('button', { name: 'common.search' }));
    await gebruiker.click(await screen.findByRole('button', { name: 'common.select' }));

    expect(screen.queryByText('Also sprach Zarathustra')).not.toBeInTheDocument();
    expect(screen.getByText('Spotify', { selector: 'span' })).toBeInTheDocument();

    await gebruiker.click(screen.getByRole('button', { name: 'common.save' }));
    await waitFor(() =>
      expect(opslaan).toHaveBeenCalledWith('titel-1', {
        spotify_url: 'https://open.spotify.com/track/nr-1',
        spotify_preview_url: 'https://p.scdn.co/nr-1.mp3',
      }),
    );
  });

  it('zet een gekozen nummer van Apple Music bij de Apple-links', async () => {
    const gebruiker = userEvent.setup();
    zoeken.mockResolvedValue({
      results: [nummer({ platform: 'apple', url: 'https://music.apple.com/nl/album/nr-1', previewUrl: null })],
    });
    toon();

    await gebruiker.click(screen.getByRole('button', { name: 'Apple Music' }));
    await gebruiker.click(screen.getByRole('button', { name: 'common.search' }));
    await gebruiker.click(await screen.findByRole('button', { name: 'common.select' }));
    await gebruiker.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() =>
      expect(opslaan).toHaveBeenCalledWith('titel-1', {
        apple_music_url: 'https://music.apple.com/nl/album/nr-1',
        apple_music_preview_url: undefined,
      }),
    );
  });

  it('zet een dienst die niet ingericht is op slot', async () => {
    status.mockResolvedValue({ spotify: true, appleMusic: false });
    toon();

    // Zolang de stand van de diensten onderweg is staan beide knoppen op slot;
    // pas daarna hoort alleen Apple Music op slot te blijven.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Spotify' })).toBeEnabled());
    expect(screen.getByRole('button', { name: 'Apple Music' })).toBeDisabled();
    expect(screen.queryByText('streaming.noServicesConfigured')).not.toBeInTheDocument();
  });

  it('legt uit dat er geen enkele dienst ingericht is', async () => {
    status.mockResolvedValue({ spotify: false, appleMusic: false });
    toon();

    expect(await screen.findByText('streaming.noServicesConfigured')).toBeInTheDocument();
  });

  it('speelt een voorbeeld af en stopt het bij de tweede klik', async () => {
    const gebruiker = userEvent.setup();
    zoeken.mockResolvedValue({ results: [nummer({ previewUrl: 'https://p.scdn.co/nr-1.mp3' })] });
    toon();

    await gebruiker.click(screen.getByRole('button', { name: 'common.search' }));
    const knop = await screen.findByRole('button', { name: '▶' });

    await gebruiker.click(knop);
    expect(geluiden).toHaveLength(1);
    expect(geluiden[0].src).toBe('https://p.scdn.co/nr-1.mp3');
    expect(geluiden[0].play).toHaveBeenCalled();

    await gebruiker.click(await screen.findByRole('button', { name: '⏹' }));
    expect(geluiden[0].pause).toHaveBeenCalled();
    expect(await screen.findByRole('button', { name: '▶' })).toBeInTheDocument();
  });

  it('zet geen afspeelknop bij een nummer zonder voorbeeld', async () => {
    const gebruiker = userEvent.setup();
    zoeken.mockResolvedValue({ results: [nummer({ previewUrl: null })] });
    toon();

    await gebruiker.click(screen.getByRole('button', { name: 'common.search' }));

    await screen.findByRole('button', { name: 'common.select' });
    expect(screen.queryByRole('button', { name: '▶' })).not.toBeInTheDocument();
  });
});

describe('StreamingLinkEditor - opslaan en sluiten', () => {
  it('sluit zonder op te slaan bij annuleren', async () => {
    const gebruiker = userEvent.setup();
    const { sluiten } = toon();

    await gebruiker.click(screen.getByRole('button', { name: 'common.cancel' }));

    expect(sluiten).toHaveBeenCalled();
    expect(opslaan).not.toHaveBeenCalled();
  });

  it('houdt het venster open als het opslaan mislukt', async () => {
    const gebruiker = userEvent.setup();
    opslaan.mockRejectedValue({ response: { data: { error: 'Mag niet' } } });
    const { sluiten, bewaard } = toon();

    await gebruiker.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('Mag niet'));
    expect(sluiten).not.toHaveBeenCalled();
    expect(bewaard).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'common.save' })).toBeEnabled();
  });

  it('valt terug op een eigen melding als de server er geen meegeeft', async () => {
    const gebruiker = userEvent.setup();
    opslaan.mockRejectedValue(new Error('kapot'));
    toon();

    await gebruiker.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('streaming.saveError'));
  });
});
