/**
 * Het venster voor metagegevens van een titel: invullen, opzoeken en bewaren.
 *
 * De test ernaast gaat over het zoekmenu naast het titelveld. De rest van het
 * venster stond nergens vast, terwijl daar het werk zit: de uitgebreide
 * metagegevens die apart opgehaald worden en zichzelf openklappen zodra er iets
 * in staat, de MusicaInfo-opzoekfunctie in drie stappen, en het bewaren dat
 * afhankelijk van dat openklappen één of twee verzoeken doet.
 *
 * Wat het venster teruggeeft aan de pagina eromheen is een vast vormgegeven
 * bundel: duur als aantal seconden, lege velden als "niets". Dat wordt hier
 * per veld nagelopen, want een pagina die dit venster gebruikt rekent erop.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TitleMetadataModal } from '../TitleMetadataModal';
import * as api from '../../api';
import type { MusicTitle } from '../../types';

vi.mock('../../api');

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel, i18n: { language: 'nl' } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

vi.mock('../MusicXMLUpload', () => ({
  MusicXMLUpload: () => <div data-testid="musicxml-upload" />,
}));

vi.mock('../InstrumentPicker', () => ({
  InstrumentPicker: () => <div data-testid="instrumentkiezer" />,
}));

vi.mock('../GenrePicker', () => ({
  GenrePicker: () => <div data-testid="genrekiezer" />,
}));

const { houder, bewaarUitgebreid } = vi.hoisted(() => ({
  houder: { uitgebreid: undefined as unknown, laden: false },
  bewaarUitgebreid: vi.fn(),
}));

vi.mock('../../hooks/useVocabulary', () => ({
  useTitleMetadata: () => ({ data: houder.uitgebreid, isLoading: houder.laden }),
  useUpdateTitleMetadata: () => ({ mutateAsync: bewaarUitgebreid }),
}));

const GENRES = [
  { id: 'genre-1', name: 'Klassiek' },
  { id: 'genre-2', name: 'Pop' },
];

function maakTitel(overschrijving: Partial<MusicTitle> = {}): MusicTitle {
  return {
    id: 'titel-1',
    title: 'Also sprach Zarathustra',
    arranger: 'Strauss',
    pieceCount: 1,
    youtubeUrl: null,
    description: null,
    durationSeconds: 225,
    grade: '4',
    genres: [{ id: 'genre-1', name: 'Klassiek' }],
    isShared: false,
    internalNotes: null,
    ...overschrijving,
  } as MusicTitle;
}

function toon(overschrijving: Partial<MusicTitle> = {}) {
  const bewaren = vi.fn().mockResolvedValue(undefined);
  const sluiten = vi.fn();
  const gebruiker = userEvent.setup();
  render(
    <TitleMetadataModal
      title={maakTitel(overschrijving)}
      genres={GENRES as never}
      onClose={sluiten}
      onSave={bewaren}
      extraFields={<p>extra veld van de pagina</p>}
    />,
  );
  return { gebruiker, bewaren, sluiten };
}

/** De aankruisvakjes van de genres staan op `display: none`; zoek via de label. */
function genrevakje(naam: string): HTMLInputElement {
  const groep = screen.getByRole('group', { name: 'titles.genres' });
  return within(groep).getByText(naam).querySelector('input') as HTMLInputElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  houder.uitgebreid = undefined;
  houder.laden = false;
  vi.stubGlobal('alert', vi.fn());
});

describe('TitleMetadataModal - het formulier vullen', () => {
  it('vult de velden met wat er over de titel bekend is', () => {
    toon();

    expect(screen.getByLabelText('myMusic.table.title')).toHaveValue('Also sprach Zarathustra');
    expect(screen.getByLabelText('titles.arranger')).toHaveValue('Strauss');
    expect(screen.getByLabelText('titles.durationFormat')).toHaveValue('3:45');
    expect(screen.getByLabelText('titles.difficulty')).toHaveValue('4');
    expect(genrevakje('Klassiek')).toBeChecked();
  });

  it('laat de duur leeg als die niet bekend is', () => {
    toon({ durationSeconds: 0 });

    expect(screen.getByLabelText('titles.durationFormat')).toHaveValue('');
  });

  it('toont de extra velden die de pagina eromheen meegeeft', () => {
    toon();

    expect(screen.getByText('extra veld van de pagina')).toBeInTheDocument();
  });

  it('sluit met de annuleerknop', async () => {
    const { gebruiker, sluiten } = toon();

    await gebruiker.click(screen.getByRole('button', { name: 'common.cancel' }));

    expect(sluiten).toHaveBeenCalledTimes(1);
  });
});

describe('TitleMetadataModal - bewaren', () => {
  it('geeft de ingevulde gegevens in vaste vorm terug aan de pagina', async () => {
    const { gebruiker, bewaren } = toon();

    await gebruiker.clear(screen.getByLabelText('titles.durationFormat'));
    await gebruiker.type(screen.getByLabelText('titles.durationFormat'), '4:00');
    await gebruiker.type(screen.getByLabelText('titles.description'), 'Openingsnummer');
    await gebruiker.type(screen.getByLabelText('titles.internalNotes'), 'Partij 3 ontbreekt');
    await gebruiker.click(screen.getByRole('checkbox', { name: /titles\.sharingAllowed/ }));
    await gebruiker.click(genrevakje('Pop').parentElement as HTMLElement);
    await gebruiker.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(bewaren).toHaveBeenCalled());
    expect(bewaren).toHaveBeenCalledWith({
      youtubeUrl: null,
      description: 'Openingsnummer',
      durationSeconds: 240,
      grade: '4',
      genreIds: ['genre-1', 'genre-2'],
      isShared: true,
      internalNotes: 'Partij 3 ontbreekt',
    });
  });

  it('geeft leeggemaakte velden terug als "niets" en niet als lege tekst', async () => {
    const { gebruiker, bewaren } = toon();

    await gebruiker.clear(screen.getByLabelText('titles.difficulty'));
    await gebruiker.clear(screen.getByLabelText('titles.durationFormat'));
    await gebruiker.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(bewaren).toHaveBeenCalled());
    expect(bewaren.mock.calls[0][0]).toMatchObject({
      grade: null,
      description: null,
      internalNotes: null,
      durationSeconds: 0,
    });
  });

  it('zet een genre weer uit', async () => {
    const { gebruiker, bewaren } = toon();

    await gebruiker.click(genrevakje('Klassiek').parentElement as HTMLElement);
    await gebruiker.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(bewaren).toHaveBeenCalled());
    expect(bewaren.mock.calls[0][0]).toMatchObject({ genreIds: [] });
  });

  it('houdt de bewaarknop uit terwijl er bewaard wordt', () => {
    render(
      <TitleMetadataModal
        title={maakTitel()}
        genres={GENRES as never}
        onClose={vi.fn()}
        onSave={vi.fn()}
        saving
      />,
    );

    expect(screen.getByRole('button', { name: /common\.save/ })).toBeDisabled();
  });
});

describe('TitleMetadataModal - YouTube', () => {
  it('houdt de ophaalknop uit zolang er geen verwijzing staat', async () => {
    const { gebruiker } = toon();

    expect(screen.getByRole('button', { name: 'titles.fetchVideoInfo' })).toBeDisabled();

    await gebruiker.type(screen.getByLabelText('titles.youtubeUrl'), 'https://youtu.be/abc');

    expect(screen.getByRole('button', { name: 'titles.fetchVideoInfo' })).toBeEnabled();
  });

  it('toont titel en maker van de video, en laat ze weer los bij een nieuwe verwijzing', async () => {
    vi.mocked(api.getYouTubeMeta).mockResolvedValue({ title: 'Zarathustra live', author: 'Wiener Phil' } as never);
    const { gebruiker } = toon();

    await gebruiker.type(screen.getByLabelText('titles.youtubeUrl'), 'https://youtu.be/abc');
    await gebruiker.click(screen.getByRole('button', { name: 'titles.fetchVideoInfo' }));
    expect(await screen.findByText('Zarathustra live')).toBeInTheDocument();

    await gebruiker.type(screen.getByLabelText('titles.youtubeUrl'), 'd');

    expect(screen.queryByText('Zarathustra live')).not.toBeInTheDocument();
  });

  it('meldt het als de video niet op te halen is', async () => {
    vi.mocked(api.getYouTubeMeta).mockRejectedValue({ response: { data: { error: 'video is privé' } } });
    const { gebruiker } = toon();

    await gebruiker.type(screen.getByLabelText('titles.youtubeUrl'), 'https://youtu.be/abc');
    await gebruiker.click(screen.getByRole('button', { name: 'titles.fetchVideoInfo' }));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('video is privé'));
  });

  it('stuurt de ingevulde verwijzing mee bij het bewaren', async () => {
    const { gebruiker, bewaren } = toon();

    await gebruiker.type(screen.getByLabelText('titles.youtubeUrl'), 'https://youtu.be/abc');
    await gebruiker.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(bewaren).toHaveBeenCalled());
    expect(bewaren.mock.calls[0][0]).toMatchObject({ youtubeUrl: 'https://youtu.be/abc' });
  });
});

describe('TitleMetadataModal - opzoeken op MusicaInfo', () => {
  const TREFFER = {
    articleNumber: 'A-123',
    title: 'Also sprach Zarathustra',
    composer: 'Richard Strauss',
    arranger: 'De Haske',
  };

  function zetZoekenKlaar(treffers: unknown[]) {
    vi.mocked(api.searchMusicaInfo).mockResolvedValue({
      results: treffers,
      searchUrl: 'https://musicainfo.example/zoek',
    } as never);
  }

  it('toont de gevonden regels', async () => {
    zetZoekenKlaar([TREFFER]);
    const { gebruiker } = toon();

    await gebruiker.click(screen.getByRole('button', { name: 'titles.musicaInfoSearch' }));

    expect(await screen.findByText(/Richard Strauss/)).toBeInTheDocument();
    expect(api.searchMusicaInfo).toHaveBeenCalledWith('Also sprach Zarathustra');
  });

  it('meldt het als er niets gevonden is, met een verwijzing om zelf te kijken', async () => {
    zetZoekenKlaar([]);
    const { gebruiker } = toon();

    await gebruiker.click(screen.getByRole('button', { name: 'titles.musicaInfoSearch' }));

    expect(await screen.findByText('titles.musicaInfoNoResults')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'titles.musicaInfoOpenManually' })).toHaveAttribute(
      'href',
      'https://musicainfo.example/zoek',
    );
  });

  it('meldt een mislukte zoekopdracht', async () => {
    vi.mocked(api.searchMusicaInfo).mockRejectedValue({ response: { data: { error: 'site onbereikbaar' } } });
    const { gebruiker } = toon();

    await gebruiker.click(screen.getByRole('button', { name: 'titles.musicaInfoSearch' }));

    expect(await screen.findByText('site onbereikbaar')).toBeInTheDocument();
  });

  it('neemt duur en moeilijkheidsgraad over uit een gevonden regel', async () => {
    zetZoekenKlaar([TREFFER]);
    vi.mocked(api.getMusicaInfoDetail).mockResolvedValue({
      articleNumber: 'A-123',
      title: 'Also sprach Zarathustra',
      composer: 'Richard Strauss',
      arranger: 'De Haske',
      duration: '9:30',
      difficulty: '5',
      publisher: 'De Haske',
    } as never);
    const { gebruiker } = toon();

    await gebruiker.click(screen.getByRole('button', { name: 'titles.musicaInfoSearch' }));
    await gebruiker.click(await screen.findByRole('button', { name: 'titles.musicaInfoSelect' }));
    expect(await screen.findByText('titles.musicaInfoPublisher: De Haske')).toBeInTheDocument();

    await gebruiker.click(screen.getByRole('button', { name: 'titles.musicaInfoApply' }));

    expect(screen.getByLabelText('titles.durationFormat')).toHaveValue('9:30');
    expect(screen.getByLabelText('titles.difficulty')).toHaveValue('5');
    // Na het overnemen is de opzoeklijst opgeruimd.
    expect(screen.queryByRole('button', { name: 'titles.musicaInfoApply' })).not.toBeInTheDocument();
  });

  it('laat een opgevraagde regel weer los zonder iets over te nemen', async () => {
    zetZoekenKlaar([TREFFER]);
    vi.mocked(api.getMusicaInfoDetail).mockResolvedValue({
      articleNumber: 'A-123',
      title: 'Also sprach Zarathustra',
      duration: '9:30',
    } as never);
    const { gebruiker } = toon();

    await gebruiker.click(screen.getByRole('button', { name: 'titles.musicaInfoSearch' }));
    await gebruiker.click(await screen.findByRole('button', { name: 'titles.musicaInfoSelect' }));
    // "Annuleren" staat er twee keer: onderaan het venster en naast de
    // opgevraagde regel. Die tweede staat naast de overneemknop.
    const overnemen = await screen.findByRole('button', { name: 'titles.musicaInfoApply' });
    await gebruiker.click(
      within(overnemen.parentElement as HTMLElement).getByRole('button', { name: 'common.cancel' }),
    );

    // De duur is niet overgenomen; de gevonden regels staan er weer.
    expect(screen.getByLabelText('titles.durationFormat')).toHaveValue('3:45');
    expect(screen.getByRole('button', { name: 'titles.musicaInfoSelect' })).toBeInTheDocument();
  });

  it('meldt het als een gevonden regel niet op te vragen is', async () => {
    zetZoekenKlaar([TREFFER]);
    vi.mocked(api.getMusicaInfoDetail).mockRejectedValue({ response: { data: { error: 'regel bestaat niet' } } });
    const { gebruiker } = toon();

    await gebruiker.click(screen.getByRole('button', { name: 'titles.musicaInfoSearch' }));
    await gebruiker.click(await screen.findByRole('button', { name: 'titles.musicaInfoSelect' }));

    expect(await screen.findByText('regel bestaat niet')).toBeInTheDocument();
  });
});

describe('TitleMetadataModal - uitgebreide metagegevens', () => {
  it('houdt het vak dicht tot er op de kop geklikt wordt', async () => {
    const { gebruiker } = toon();

    expect(screen.queryByLabelText('metadata.workNumber')).not.toBeInTheDocument();

    await gebruiker.click(screen.getByText('metadata.extendedMetadata'));

    expect(screen.getByLabelText('metadata.workNumber')).toBeInTheDocument();
    expect(screen.getByTestId('musicxml-upload')).toBeInTheDocument();
    expect(screen.getByTestId('instrumentkiezer')).toBeInTheDocument();
    expect(screen.getByTestId('genrekiezer')).toBeInTheDocument();
  });

  it('klapt zichzelf open zodra er al uitgebreide gegevens bewaard zijn', async () => {
    houder.uitgebreid = {
      metadata: { workNumber: 'Op. 30', movementNumber: 2, movementTitle: 'Allegro', lyricist: 'Nietzsche' },
      instruments: [{ uri: 'mo:trumpet', count: 3, isOptional: false, label: { nl: 'Trompet', en: 'Trumpet' } }],
      genres: [{ uri: 'jskos:klassiek' }],
    };
    toon();

    expect(await screen.findByLabelText('metadata.workNumber')).toHaveValue('Op. 30');
    expect(screen.getByLabelText('metadata.movementNumber')).toHaveValue(2);
    expect(screen.getByLabelText('metadata.movementTitle')).toHaveValue('Allegro');
    expect(screen.getByLabelText('metadata.lyricist')).toHaveValue('Nietzsche');
  });

  it('merkt aan dat er uit MusicXML gelezen gegevens zijn', async () => {
    houder.uitgebreid = { metadata: { parts: [{ id: 'P1' }] }, instruments: [], genres: [] };
    toon();

    expect(await screen.findByText('MusicXML')).toBeInTheDocument();
  });

  it('bewaart de uitgebreide gegevens apart, vóór de gewone', async () => {
    const { gebruiker, bewaren } = toon();

    await gebruiker.click(screen.getByText('metadata.extendedMetadata'));
    await gebruiker.type(screen.getByLabelText('metadata.workNumber'), 'Op. 30');
    await gebruiker.type(screen.getByLabelText('metadata.movementNumber'), '2');
    await gebruiker.type(screen.getByLabelText('metadata.movementTitle'), 'Allegro');
    await gebruiker.type(screen.getByLabelText('metadata.lyricist'), 'Nietzsche');
    await gebruiker.type(screen.getByLabelText('metadata.rights'), 'Public Domain');
    await gebruiker.type(screen.getByLabelText('metadata.source'), 'IMSLP');
    await gebruiker.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(bewaarUitgebreid).toHaveBeenCalled());
    expect(bewaarUitgebreid).toHaveBeenCalledWith({
      titleId: 'titel-1',
      metadata: {
        workNumber: 'Op. 30',
        movementNumber: 2,
        movementTitle: 'Allegro',
        lyricist: 'Nietzsche',
        rights: 'Public Domain',
        source: 'IMSLP',
        instruments: [],
        genres: [],
      },
    });
    await waitFor(() => expect(bewaren).toHaveBeenCalled());
  });

  it('doet geen apart verzoek als het vak dicht blijft', async () => {
    const { gebruiker, bewaren } = toon();

    await gebruiker.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(bewaren).toHaveBeenCalled());
    expect(bewaarUitgebreid).not.toHaveBeenCalled();
  });

  it('doet geen apart verzoek voor een titel zonder nummer', async () => {
    const { gebruiker, bewaren } = toon({ id: null as unknown as string });

    await gebruiker.click(screen.getByText('metadata.extendedMetadata'));
    await gebruiker.type(screen.getByLabelText('metadata.workNumber'), 'Op. 30');
    await gebruiker.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(bewaren).toHaveBeenCalled());
    expect(bewaarUitgebreid).not.toHaveBeenCalled();
  });
});
