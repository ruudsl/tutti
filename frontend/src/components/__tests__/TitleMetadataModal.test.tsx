/**
 * Het zoekmenu in het bewerkvenster voor metagegevens.
 *
 * Dit venster is een tweede, nog steeds gebruikte kopie van hetzelfde menu dat
 * ook in pages/MusicTitles/TitleMetaModal.tsx staat. Daar is het al gerepareerd;
 * hier stond de oude truc nog: de klikafhandelaar zette
 * `nextElementSibling.style.display`, en de achtergrondkleur werd met de hand op
 * `white` teruggezet. Twee gevolgen die deze tests vastleggen:
 *   - het menu stond altijd in de boom, alleen onzichtbaar, en ging nooit
 *     vanzelf dicht;
 *   - de kleuren waren vast licht, dus in het donkere thema een wit vlak.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TitleMetadataModal } from '../TitleMetadataModal';
import * as api from '../../api';
import type { MusicaInfoDetail, MusicaInfoSearchResult } from '../../api';
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

vi.mock('../../hooks/useVocabulary', () => ({
  useTitleMetadata: () => ({ data: undefined, isLoading: false }),
  useUpdateTitleMetadata: () => ({ mutateAsync: vi.fn() }),
}));

function maakTitel(overschrijving: Partial<MusicTitle> = {}): MusicTitle {
  return {
    id: 'titel-1',
    title: 'Also sprach Zarathustra',
    arranger: null,
    pieceCount: 1,
    youtubeUrl: null,
    description: null,
    durationSeconds: 0,
    grade: null,
    genres: [],
    isShared: false,
    internalNotes: null,
    ...overschrijving,
  } as MusicTitle;
}

function toon(genres: { id: string; name: string }[] = []) {
  return render(
    <TitleMetadataModal
      title={maakTitel()}
      genres={genres as never}
      onClose={vi.fn()}
      onSave={vi.fn().mockResolvedValue(undefined)}
    />,
  );
}

describe('TitleMetadataModal - zoekmenu', () => {
  it('houdt het zoekmenu buiten de boom tot er geklikt wordt', async () => {
    const gebruiker = userEvent.setup();
    toon();

    const venster = await screen.findByRole('dialog');

    // Dicht betekent: er niet zijn. Vroeger stond het menu er altijd, met
    // alleen een display:none dat langs React heen gezet werd - vandaar dat
    // hier op de tekst gezocht wordt en niet op de rol: een verborgen
    // verwijzing valt wel uit de toegankelijkheidsboom, maar staat nog in de
    // opmaak.
    expect(within(venster).queryByText('De Haske')).not.toBeInTheDocument();

    await gebruiker.click(within(venster).getByTitle('titles.searchOnSites'));

    expect(within(venster).getByRole('link', { name: 'De Haske' })).toBeInTheDocument();
  });

  it('sluit het zoekmenu bij een klik erbuiten', async () => {
    const gebruiker = userEvent.setup();
    toon();

    const venster = await screen.findByRole('dialog');
    await gebruiker.click(within(venster).getByTitle('titles.searchOnSites'));
    expect(within(venster).getByRole('link', { name: 'De Haske' })).toBeInTheDocument();

    await gebruiker.click(within(venster).getByText('titles.durationFormat'));

    await waitFor(() => expect(within(venster).queryByRole('link', { name: 'De Haske' })).not.toBeInTheDocument());
  });

  it('geeft het zoekmenu een achtergrond uit het thema in plaats van vast wit', async () => {
    const gebruiker = userEvent.setup();
    toon();

    const venster = await screen.findByRole('dialog');
    await gebruiker.click(within(venster).getByTitle('titles.searchOnSites'));

    const menu = within(venster).getByRole('link', { name: 'De Haske' }).parentElement!;
    expect(menu.style.background).toBe('var(--surface)');
    expect(menu.getAttribute('style')).not.toMatch(/white|#fff/i);
  });

  it('zet een aangewezen regel na loslaten terug op doorzichtig, niet op wit', async () => {
    const gebruiker = userEvent.setup();
    toon();

    const venster = await screen.findByRole('dialog');
    await gebruiker.click(within(venster).getByTitle('titles.searchOnSites'));

    const verwijzing = within(venster).getByRole('link', { name: 'De Haske' });
    await gebruiker.hover(verwijzing);
    expect(verwijzing.style.background).toBe('var(--surface-hover)');

    await gebruiker.unhover(verwijzing);
    expect(verwijzing.style.background).toBe('transparent');
  });
});

describe('TitleMetadataModal - kleuren in het MusicaInfo-blok', () => {
  const resultaat: MusicaInfoSearchResult = {
    articleNumber: '12345',
    title: 'Gevonden titel',
    composer: 'Richard Strauss',
    arranger: '',
    detailUrl: 'https://example.test/12345',
    publisher: 'De Haske',
    duration: '9:30',
    difficulty: '5',
  };

  const gegevens: MusicaInfoDetail = { ...resultaat, durationSeconds: 570, instrumentation: 'Harmonie' };

  const zoekantwoord = {
    query: 'Gevonden titel',
    resultCount: 1,
    results: [resultaat],
    searchUrl: 'https://example.test/zoek',
  };

  it('licht een aangewezen zoekresultaat op met het vlak uit het thema', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(api.searchMusicaInfo).mockResolvedValue(zoekantwoord);
    toon();

    await gebruiker.click(await screen.findByText('titles.musicaInfoSearch'));

    const rij = (await screen.findByText('Gevonden titel')).parentElement!.parentElement!;
    await gebruiker.hover(rij);
    expect(rij.style.background).toBe('var(--surface-hover)');

    await gebruiker.unhover(rij);
    expect(rij.style.background).toBe('transparent');
  });

  it('geeft het vlak met de gevonden gegevens geen vaste witte achtergrond', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(api.searchMusicaInfo).mockResolvedValue(zoekantwoord);
    vi.mocked(api.getMusicaInfoDetail).mockResolvedValue(gegevens);
    toon();

    await gebruiker.click(await screen.findByText('titles.musicaInfoSearch'));
    await gebruiker.click(await screen.findByText('Gevonden titel'));

    const vlak = (await screen.findByText('titles.musicaInfoApply')).closest('div')!.parentElement!;
    expect(vlak.style.background).toBe('var(--surface)');
    expect(vlak.getAttribute('style')).not.toMatch(/white|#fff/i);
  });
});

/**
 * De labels van dit venster wezen hun veld niet aan: `<label
 * className="form-label">` stond náást het veld, zonder `htmlFor` en zonder
 * `id`. Een schermlezer meldde dan een bewerkbaar veld zonder te zeggen wat
 * erin moet, en een test kon het veld niet op naam vinden. De gewone velden
 * lopen nu via `FormField`.
 *
 * Drie velden zijn met de hand gekoppeld, omdat er meer in de `form-group`
 * staat dan label plus veld: bij de titel en bij de YouTube-verwijzing zit het
 * veld samen met een knop in een flex-omhulsel, en onder de interne notities
 * staat een hulptekst. Die drie staan hier apart in, want handwerk raakt eerder
 * zoek dan een component.
 */
describe('TitleMetadataModal - labels gekoppeld aan hun veld', () => {
  it('vindt de velden van het venster op hun labeltekst', async () => {
    toon();
    await screen.findByRole('dialog');

    expect(screen.getByLabelText('titles.durationFormat')).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('titles.difficulty')).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('titles.description').tagName).toBe('TEXTAREA');
  });

  it('koppelt ook het arrangeursveld, dat er alleen bij een arrangeur is', async () => {
    render(
      <TitleMetadataModal
        title={maakTitel({ arranger: 'Johan de Meij' })}
        genres={[]}
        onClose={vi.fn()}
        onSave={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    await screen.findByRole('dialog');

    expect(screen.getByLabelText('titles.arranger')).toHaveValue('Johan de Meij');
  });

  it('koppelt de velden in het uitgeklapte metagegevensblok', async () => {
    const gebruiker = userEvent.setup();
    toon();
    const venster = await screen.findByRole('dialog');

    await gebruiker.click(within(venster).getByText('metadata.extendedMetadata'));

    expect(screen.getByLabelText('metadata.workNumber')).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('metadata.movementNumber')).toHaveAttribute('type', 'number');
    expect(screen.getByLabelText('metadata.movementTitle')).toBeInTheDocument();
    expect(screen.getByLabelText('metadata.lyricist')).toBeInTheDocument();
    expect(screen.getByLabelText('metadata.rights')).toBeInTheDocument();
    expect(screen.getByLabelText('metadata.source')).toBeInTheDocument();
  });

  it('zet de aanwijzer in het veld bij een klik op het label', async () => {
    const gebruiker = userEvent.setup();
    toon();
    await screen.findByRole('dialog');

    await gebruiker.click(screen.getByText('titles.difficulty'));
    await gebruiker.keyboard('4');

    expect(screen.getByLabelText('titles.difficulty')).toHaveValue('4');
  });

  it('koppelt de drie handmatige velden, met verwijzing naar de hulptekst', async () => {
    toon();
    await screen.findByRole('dialog');

    expect(screen.getByLabelText('myMusic.table.title')).toHaveValue('Also sprach Zarathustra');
    expect(screen.getByLabelText('titles.youtubeUrl')).toHaveAttribute('type', 'url');

    const notities = screen.getByLabelText('titles.internalNotes');
    expect(notities.tagName).toBe('TEXTAREA');
    expect(notities).toHaveAccessibleDescription('titles.internalNotesHelp');
  });
});

/**
 * De kop boven de genrevakjes is geen veldlabel.
 *
 * Er stond een `<label className="form-label">` boven een raster met
 * aankruisvakjes. Zo'n kop kan geen `htmlFor` krijgen: er is niet één veld om
 * naar te wijzen, en elk vakje heeft binnenin al zijn eigen label. Een
 * schermlezer kondigde daar dus "label" aan zonder dat er iets te bedienen
 * viel, en de vakjes hoorden bij niets.
 *
 * De kop is een `<span>` geworden - dezelfde klasse, dus dezelfde opmaak - en
 * benoemt nu de groep als geheel, via `role="group"` met `aria-labelledby`.
 */
describe('TitleMetadataModal - de kop boven de genrevakjes', () => {
  const GENRES = [
    { id: 'gen-1', name: 'Marsen' },
    { id: 'gen-2', name: 'Filmmuziek' },
  ];

  it('zet geen <label> boven het vakjesraster', async () => {
    toon(GENRES);
    const venster = await screen.findByRole('dialog');

    const kop = within(venster).getByText('titles.genres');
    expect(kop.tagName).toBe('SPAN');
    expect(kop.closest('label')).toBeNull();
    // Maar het ziet er nog precies hetzelfde uit.
    expect(kop).toHaveClass('form-label');
  });

  it('benoemt in plaats daarvan de groep vakjes als geheel', async () => {
    toon(GENRES);
    const venster = await screen.findByRole('dialog');

    const groep = within(venster).getByRole('group', { name: 'titles.genres' });
    expect(within(groep).getAllByRole('checkbox', { hidden: true })).toHaveLength(GENRES.length);
  });
});
