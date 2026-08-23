/**
 * Het bewerkvenster van de titelpagina: metagegevens invullen, opzoeken en
 * bewaren.
 *
 * De karakteriseringstest ernaast legt vast wat de tabel doet - filteren,
 * uitklappen, het venster van honderd rijen. Wat er ná een klik op het potlood
 * gebeurt was nergens vastgelegd, en juist daar zit het meeste werk van deze
 * pagina: de MusicaInfo-opzoekfunctie in drie stappen (zoeken, een regel
 * opvragen, overnemen), het ophalen van de YouTube-gegevens, een mp3 die vóór
 * het bewaren nog niet weg kan omdat de titel nog geen nummer heeft, en het
 * bewaren zelf.
 *
 * Alles loopt hier via het scherm: er wordt niet in de toestandsmachine
 * geprikt, maar geklikt en getypt zoals een gebruiker dat doet.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import MusicTitles from '../MusicTitles';
import * as api from '../../api';
import type { MusicTitle } from '../../types';

vi.mock('../../api');

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

const { bevestig } = vi.hoisted(() => ({ bevestig: vi.fn() }));
vi.mock('../../hooks/useConfirm', () => ({ useConfirm: () => bevestig }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../components/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

vi.mock('../../components/Skeleton', () => ({
  SkeletonTable: () => <div data-testid="skelet-tabel" />,
}));

vi.mock('../../components/StreamingLinks', () => ({
  StreamingLinks: () => <div data-testid="streamingverwijzingen" />,
}));

vi.mock('../../components/StreamingLinkEditor', () => ({
  StreamingLinkEditor: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="streamingbewerker">
      <button type="button" onClick={onClose}>
        sluit streamingbewerker
      </button>
    </div>
  ),
}));

vi.mock('../../components/ImslpSearch', () => ({
  ImslpSearch: ({ onClose, initialQuery }: { onClose: () => void; initialQuery: string }) => (
    <div data-testid="imslp-zoeken">
      <span>zoekt: {initialQuery}</span>
      <button type="button" onClick={onClose}>
        sluit imslp
      </button>
    </div>
  ),
}));

vi.mock('../../utils/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));

import { showSuccess, showError } from '../../utils/toast';

function maakTitel(overschrijving: Partial<MusicTitle> = {}): MusicTitle {
  return {
    id: 'titel-1',
    title: 'Also sprach Zarathustra',
    arranger: 'Strauss',
    pieceCount: 12,
    youtubeUrl: null,
    description: 'Openingsnummer',
    durationSeconds: 225,
    grade: '4',
    instruments: [],
    genres: [{ id: 'genre-1', name: 'Klassiek' }],
    lists: [],
    ...overschrijving,
  } as MusicTitle;
}

const GENRES = [
  { id: 'genre-1', name: 'Klassiek' },
  { id: 'genre-2', name: 'Pop' },
];

const houder: { titels: MusicTitle[] } = { titels: [] };

function zetApiKlaar(): void {
  const leeg = vi.fn().mockResolvedValue([]);
  for (const naam of Object.keys(api)) {
    const functie = (api as Record<string, unknown>)[naam];
    if (typeof functie === 'function') {
      vi.mocked(functie as (...args: unknown[]) => unknown).mockImplementation(leeg);
    }
  }
  vi.mocked(api.getMusicTitles).mockImplementation(async () => houder.titels);
  vi.mocked(api.getGenres).mockResolvedValue(GENRES);
  vi.mocked(api.getMp3Url).mockImplementation((pad: string) => `/mp3/${pad}`);
  vi.mocked(api.updateTitleMeta).mockResolvedValue({ id: 'titel-1' } as never);
}

function wikkel({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Open het bewerkvenster van de eerste titel, zoals via het potlood. */
async function openBewerkvenster() {
  const gebruiker = userEvent.setup();
  render(<MusicTitles />, { wrapper: wikkel });
  await gebruiker.click(await screen.findByRole('button', { name: 'Bewerk metadata' }));
  return gebruiker;
}

beforeEach(() => {
  vi.clearAllMocks();
  houder.titels = [maakTitel()];
  bevestig.mockResolvedValue(true);
  zetApiKlaar();
});

describe('titelpagina - het bewerkvenster openen', () => {
  it('vult het formulier met wat er al over de titel bekend is', async () => {
    await openBewerkvenster();

    expect(screen.getByLabelText('myMusic.table.title')).toHaveValue('Also sprach Zarathustra');
    expect(screen.getByLabelText('titles.arranger')).toHaveValue('Strauss');
    // 225 seconden staat als 3:45 in het veld.
    expect(screen.getByLabelText('titles.durationFormat')).toHaveValue('3:45');
    expect(screen.getByLabelText('titles.difficulty')).toHaveValue('4');
    expect(screen.getByLabelText('titles.description')).toHaveValue('Openingsnummer');
  });

  it('laat het arrangeurveld weg bij een titel zonder arrangeur', async () => {
    houder.titels = [maakTitel({ arranger: null })];
    await openBewerkvenster();

    expect(screen.queryByLabelText('titles.arranger')).not.toBeInTheDocument();
  });

  it('sluit het venster met de annuleerknop', async () => {
    const gebruiker = await openBewerkvenster();

    await gebruiker.click(screen.getByRole('button', { name: 'common.cancel' }));

    expect(screen.queryByLabelText('titles.durationFormat')).not.toBeInTheDocument();
  });
});

describe('titelpagina - genres aan- en uitzetten', () => {
  it('zet een genre aan en het al gekozen genre uit', async () => {
    const gebruiker = await openBewerkvenster();
    const groep = screen.getByRole('group', { name: 'titles.genres' });
    // De vakjes zelf staan op `display: none`; de omhullende label is wat de
    // gebruiker ziet en aanklikt, dus zo worden ze hier ook opgezocht.
    const vakje = (naam: string) => within(groep).getByText(naam).querySelector('input') as HTMLInputElement;

    expect(vakje('Klassiek')).toBeChecked();
    expect(vakje('Pop')).not.toBeChecked();

    await gebruiker.click(within(groep).getByText('Pop'));
    expect(vakje('Pop')).toBeChecked();

    await gebruiker.click(within(groep).getByText('Klassiek'));
    expect(vakje('Klassiek')).not.toBeChecked();
  });
});

describe('titelpagina - YouTube-gegevens ophalen', () => {
  it('houdt de ophaalknop uit zolang er geen verwijzing staat', async () => {
    const gebruiker = await openBewerkvenster();
    const knop = screen.getByRole('button', { name: 'titles.fetchVideoInfo' });

    expect(knop).toBeDisabled();

    await gebruiker.type(screen.getByLabelText('titles.youtubeUrl'), 'https://youtu.be/abc');

    expect(screen.getByRole('button', { name: 'titles.fetchVideoInfo' })).toBeEnabled();
  });

  it('toont titel en maker van de video na het ophalen', async () => {
    vi.mocked(api.getYouTubeMeta).mockResolvedValue({ title: 'Zarathustra live', author: 'Wiener Phil' } as never);
    const gebruiker = await openBewerkvenster();

    await gebruiker.type(screen.getByLabelText('titles.youtubeUrl'), 'https://youtu.be/abc');
    await gebruiker.click(screen.getByRole('button', { name: 'titles.fetchVideoInfo' }));

    expect(await screen.findByText('Zarathustra live')).toBeInTheDocument();
    expect(screen.getByText(/Wiener Phil/)).toBeInTheDocument();
    expect(api.getYouTubeMeta).toHaveBeenCalledWith('https://youtu.be/abc');
  });

  it('meldt het als de video niet op te halen is', async () => {
    vi.mocked(api.getYouTubeMeta).mockRejectedValue({ response: { data: { error: 'video is privé' } } });
    const gebruiker = await openBewerkvenster();

    await gebruiker.type(screen.getByLabelText('titles.youtubeUrl'), 'https://youtu.be/abc');
    await gebruiker.click(screen.getByRole('button', { name: 'titles.fetchVideoInfo' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('video is privé'));
  });

  it('laat de eerder opgehaalde gegevens los zodra de verwijzing verandert', async () => {
    vi.mocked(api.getYouTubeMeta).mockResolvedValue({ title: 'Zarathustra live', author: 'Wiener Phil' } as never);
    const gebruiker = await openBewerkvenster();

    await gebruiker.type(screen.getByLabelText('titles.youtubeUrl'), 'https://youtu.be/abc');
    await gebruiker.click(screen.getByRole('button', { name: 'titles.fetchVideoInfo' }));
    expect(await screen.findByText('Zarathustra live')).toBeInTheDocument();

    await gebruiker.type(screen.getByLabelText('titles.youtubeUrl'), 'd');

    expect(screen.queryByText('Zarathustra live')).not.toBeInTheDocument();
  });
});

describe('titelpagina - opzoeken op MusicaInfo', () => {
  const TREFFER = {
    articleNumber: 'A-123',
    title: 'Also sprach Zarathustra',
    composer: 'Richard Strauss',
    arranger: 'De Haske',
  };

  it('toont de gevonden regels na het zoeken', async () => {
    vi.mocked(api.searchMusicaInfo).mockResolvedValue({
      results: [TREFFER],
      searchUrl: 'https://musicainfo.example/zoek',
    } as never);
    const gebruiker = await openBewerkvenster();

    await gebruiker.click(screen.getByRole('button', { name: 'titles.musicaInfoSearch' }));

    expect(await screen.findByText(/Richard Strauss/)).toBeInTheDocument();
    expect(api.searchMusicaInfo).toHaveBeenCalledWith('Also sprach Zarathustra');
  });

  it('meldt het als er niets gevonden is, met een verwijzing om zelf te kijken', async () => {
    vi.mocked(api.searchMusicaInfo).mockResolvedValue({
      results: [],
      searchUrl: 'https://musicainfo.example/zoek',
    } as never);
    const gebruiker = await openBewerkvenster();

    await gebruiker.click(screen.getByRole('button', { name: 'titles.musicaInfoSearch' }));

    expect(await screen.findByText('titles.musicaInfoNoResults')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'titles.musicaInfoOpenManually' })).toHaveAttribute(
      'href',
      'https://musicainfo.example/zoek',
    );
  });

  it('meldt een mislukte zoekopdracht', async () => {
    vi.mocked(api.searchMusicaInfo).mockRejectedValue({ response: { data: { error: 'site onbereikbaar' } } });
    const gebruiker = await openBewerkvenster();

    await gebruiker.click(screen.getByRole('button', { name: 'titles.musicaInfoSearch' }));

    expect(await screen.findByText('site onbereikbaar')).toBeInTheDocument();
  });

  it('neemt duur en moeilijkheidsgraad over uit een gevonden regel', async () => {
    vi.mocked(api.searchMusicaInfo).mockResolvedValue({
      results: [TREFFER],
      searchUrl: 'https://musicainfo.example/zoek',
    } as never);
    vi.mocked(api.getMusicaInfoDetail).mockResolvedValue({
      articleNumber: 'A-123',
      title: 'Also sprach Zarathustra',
      composer: 'Richard Strauss',
      duration: '9:30',
      difficulty: '5',
    } as never);
    const gebruiker = await openBewerkvenster();

    await gebruiker.click(screen.getByRole('button', { name: 'titles.musicaInfoSearch' }));
    await gebruiker.click(await screen.findByRole('button', { name: 'titles.musicaInfoSelect' }));

    await waitFor(() => expect(api.getMusicaInfoDetail).toHaveBeenCalledWith('A-123'));
    await gebruiker.click(await screen.findByRole('button', { name: 'titles.musicaInfoApply' }));

    expect(screen.getByLabelText('titles.durationFormat')).toHaveValue('9:30');
    expect(screen.getByLabelText('titles.difficulty')).toHaveValue('5');
  });

  it('meldt het als een gevonden regel niet op te vragen is', async () => {
    vi.mocked(api.searchMusicaInfo).mockResolvedValue({
      results: [TREFFER],
      searchUrl: 'https://musicainfo.example/zoek',
    } as never);
    vi.mocked(api.getMusicaInfoDetail).mockRejectedValue({ response: { data: { error: 'regel bestaat niet' } } });
    const gebruiker = await openBewerkvenster();

    await gebruiker.click(screen.getByRole('button', { name: 'titles.musicaInfoSearch' }));
    await gebruiker.click(await screen.findByRole('button', { name: 'titles.musicaInfoSelect' }));

    expect(await screen.findByText('regel bestaat niet')).toBeInTheDocument();
  });
});

describe('titelpagina - de mp3', () => {
  it('bewaart een gekozen mp3 meteen bij een titel die al bestaat', async () => {
    vi.mocked(api.uploadTitleMp3).mockResolvedValue({ mp3FilePath: 'zarathustra.mp3' } as never);
    const gebruiker = await openBewerkvenster();

    const veld = document.querySelector('input[type="file"]') as HTMLInputElement;
    await gebruiker.upload(veld, new File(['klank'], 'opname.mp3', { type: 'audio/mpeg' }));

    await waitFor(() => expect(api.uploadTitleMp3).toHaveBeenCalled());
    expect(vi.mocked(api.uploadTitleMp3).mock.calls[0][0]).toBe('titel-1');
    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith('titles.mp3Uploaded'));
    // De speler staat er nu, met de weggooiknop ernaast.
    expect(await screen.findByRole('button', { name: 'common.delete' })).toBeInTheDocument();
  });

  it('meldt een mislukte mp3-verzending', async () => {
    vi.mocked(api.uploadTitleMp3).mockRejectedValue({ response: { data: { error: 'bestand te groot' } } });
    const gebruiker = await openBewerkvenster();

    const veld = document.querySelector('input[type="file"]') as HTMLInputElement;
    await gebruiker.upload(veld, new File(['klank'], 'opname.mp3', { type: 'audio/mpeg' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('bestand te groot'));
  });

  it('houdt de mp3 vast tot het bewaren als de titel nog geen nummer heeft', async () => {
    houder.titels = [maakTitel({ id: null as unknown as string })];
    const gebruiker = await openBewerkvenster();

    const veld = document.querySelector('input[type="file"]') as HTMLInputElement;
    await gebruiker.upload(veld, new File(['klank'], 'opname.mp3', { type: 'audio/mpeg' }));

    // Nog niets verstuurd: de naam staat klaar in het venster.
    expect(api.uploadTitleMp3).not.toHaveBeenCalled();
    expect(screen.getByText('opname.mp3')).toBeInTheDocument();
  });

  it('legt een klaargezette mp3 weer weg', async () => {
    houder.titels = [maakTitel({ id: null as unknown as string })];
    const gebruiker = await openBewerkvenster();
    const veld = document.querySelector('input[type="file"]') as HTMLInputElement;
    await gebruiker.upload(veld, new File(['klank'], 'opname.mp3', { type: 'audio/mpeg' }));

    // De weggooiknop naast een klaargezet bestand draagt een kruisje als
    // opschrift, niet het pictogram van de bewaarde mp3.
    await gebruiker.click(screen.getByRole('button', { name: '×' }));

    expect(screen.queryByText('opname.mp3')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /titles\.selectMp3/ })).toBeInTheDocument();
  });

  it('gooit een bewaarde mp3 weg na bevestiging', async () => {
    vi.mocked(api.uploadTitleMp3).mockResolvedValue({ mp3FilePath: 'zarathustra.mp3' } as never);
    const gebruiker = await openBewerkvenster();
    const veld = document.querySelector('input[type="file"]') as HTMLInputElement;
    await gebruiker.upload(veld, new File(['klank'], 'opname.mp3', { type: 'audio/mpeg' }));

    await gebruiker.click(await screen.findByRole('button', { name: 'common.delete' }));

    await waitFor(() => expect(api.deleteTitleMp3).toHaveBeenCalledWith('titel-1'));
    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith('titles.mp3Deleted'));
  });

  it('gooit niets weg als de bevestiging afgewezen wordt', async () => {
    bevestig.mockResolvedValue(false);
    vi.mocked(api.uploadTitleMp3).mockResolvedValue({ mp3FilePath: 'zarathustra.mp3' } as never);
    const gebruiker = await openBewerkvenster();
    const veld = document.querySelector('input[type="file"]') as HTMLInputElement;
    await gebruiker.upload(veld, new File(['klank'], 'opname.mp3', { type: 'audio/mpeg' }));

    await gebruiker.click(await screen.findByRole('button', { name: 'common.delete' }));

    expect(api.deleteTitleMp3).not.toHaveBeenCalled();
  });
});

describe('titelpagina - bewaren', () => {
  it('stuurt de ingevulde metagegevens op en sluit het venster', async () => {
    const gebruiker = await openBewerkvenster();

    await gebruiker.clear(screen.getByLabelText('titles.durationFormat'));
    await gebruiker.type(screen.getByLabelText('titles.durationFormat'), '4:00');
    await gebruiker.type(screen.getByLabelText('titles.internalNotes'), 'Partij 3 ontbreekt');
    await gebruiker.click(screen.getByRole('checkbox', { name: /titles\.sharingAllowed/ }));
    await gebruiker.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(api.updateTitleMeta).toHaveBeenCalled());
    expect(vi.mocked(api.updateTitleMeta).mock.calls[0][0]).toMatchObject({
      title: 'Also sprach Zarathustra',
      arranger: 'Strauss',
      durationSeconds: 240,
      internalNotes: 'Partij 3 ontbreekt',
      isShared: true,
      genreIds: ['genre-1'],
    });
    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith('titles.metadataSaved'));
    await waitFor(() => expect(screen.queryByLabelText('titles.durationFormat')).not.toBeInTheDocument());
  });

  it('stuurt een klaargezette mp3 mee zodra de titel een nummer heeft', async () => {
    houder.titels = [maakTitel({ id: null as unknown as string })];
    vi.mocked(api.uploadTitleMp3).mockResolvedValue({ mp3FilePath: 'nieuw.mp3' } as never);
    const gebruiker = await openBewerkvenster();

    const veld = document.querySelector('input[type="file"]') as HTMLInputElement;
    await gebruiker.upload(veld, new File(['klank'], 'opname.mp3', { type: 'audio/mpeg' }));
    await gebruiker.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(api.uploadTitleMp3).toHaveBeenCalled());
    // Het nummer komt uit het antwoord op het bewaren, niet uit de titel.
    expect(vi.mocked(api.uploadTitleMp3).mock.calls[0][0]).toBe('titel-1');
    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith('titles.metadataSaved + MP3'));
  });

  it('bewaart de metagegevens ook als de mp3 daarna misgaat', async () => {
    houder.titels = [maakTitel({ id: null as unknown as string })];
    vi.mocked(api.uploadTitleMp3).mockRejectedValue({ response: { data: { error: 'schijf vol' } } });
    const gebruiker = await openBewerkvenster();

    const veld = document.querySelector('input[type="file"]') as HTMLInputElement;
    await gebruiker.upload(veld, new File(['klank'], 'opname.mp3', { type: 'audio/mpeg' }));
    await gebruiker.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith('titles.metadataSaved'));
    await waitFor(() => expect(showError).toHaveBeenCalledWith('titles.errorUploadMp3: schijf vol'));
  });

  it('meldt een mislukt bewaren en houdt het venster open', async () => {
    vi.mocked(api.updateTitleMeta).mockRejectedValue({ response: { data: { error: 'titel bestaat niet meer' } } });
    const gebruiker = await openBewerkvenster();

    await gebruiker.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('titel bestaat niet meer'));
    expect(screen.getByLabelText('titles.durationFormat')).toBeInTheDocument();
  });
});

describe('titelpagina - de vensters achter het bewerkvenster', () => {
  it('opent de streamingbewerker en sluit hem weer', async () => {
    const gebruiker = await openBewerkvenster();

    await gebruiker.click(screen.getByRole('button', { name: 'streaming.manageLinks' }));
    expect(screen.getByTestId('streamingbewerker')).toBeInTheDocument();

    await gebruiker.click(screen.getByRole('button', { name: 'sluit streamingbewerker' }));
    expect(screen.queryByTestId('streamingbewerker')).not.toBeInTheDocument();
  });

  it('opent het IMSLP-venster met de titel als zoekwoord', async () => {
    const gebruiker = await openBewerkvenster();

    await gebruiker.click(screen.getByRole('button', { name: 'titles.searchOnSites' }));
    await gebruiker.click(screen.getByRole('button', { name: 'imslp.findOnImslp' }));

    expect(screen.getByTestId('imslp-zoeken')).toBeInTheDocument();
    expect(screen.getByText('zoekt: Also sprach Zarathustra')).toBeInTheDocument();

    await gebruiker.click(screen.getByRole('button', { name: 'sluit imslp' }));
    expect(screen.queryByTestId('imslp-zoeken')).not.toBeInTheDocument();
  });
});

describe('titelpagina - filters wissen', () => {
  it('toont de wisknop pas zodra er gefilterd is en maakt beide filters leeg', async () => {
    const gebruiker = userEvent.setup();
    render(<MusicTitles />, { wrapper: wikkel });
    await screen.findByPlaceholderText('titles.searchPlaceholder');

    expect(screen.queryByRole('button', { name: 'titles.clearFilters' })).not.toBeInTheDocument();

    await gebruiker.type(screen.getByPlaceholderText('titles.searchPlaceholder'), 'bolero');
    await gebruiker.selectOptions(screen.getByRole('combobox'), 'genre-2');

    await gebruiker.click(screen.getByRole('button', { name: 'titles.clearFilters' }));

    expect(screen.getByPlaceholderText('titles.searchPlaceholder')).toHaveValue('');
    expect(screen.getByRole('combobox')).toHaveValue('');
  });
});
