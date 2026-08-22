/**
 * Tests voor de muziek-api.
 *
 * music.ts praat met drie routerbestanden: backend/src/routes/music-lists.ts,
 * music-pieces.ts en thumbnails.ts. Er wordt hier op pad, methode, body en
 * queryreeks getoetst - een typefout daarin geeft geen foutmelding maar een
 * leeg scherm. Daarnaast wordt getoetst wat er met het antwoord gebeurt: het
 * uitpakken van `data`, downloadnamen en blob-urls.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  startNepserver,
  stopNepserver,
  antwoordMet,
  antwoordMetFout,
  antwoordMetNetwerkfout,
  antwoordMetTijdslimiet,
  laatsteVerzoek,
  alleVerzoeken,
} from './nepserver';
import {
  getMusicLists,
  getMyMusicLists,
  getMusicList,
  createMusicList,
  updateMusicList,
  downloadProgramPdf,
  deleteMusicList,
  addPieceToList,
  removePieceFromList,
  addTitleToList,
  removeTitleFromList,
  reorderMusicLists,
  toggleMusicListActive,
  reorderTitlesInList,
  getMusicPieces,
  getMusicPiecesPaginated,
  getMyMusicPieces,
  getMusicTitles,
  uploadMusicPieces,
  uploadMusicPiecesZip,
  refreshInstrumentLinks,
  updateMusicPiece,
  deleteMusicPiece,
  deleteMusicPiecesBulk,
  restoreMusicPiece,
  downloadMusicPiece,
  shareMusicPiece,
  getSharedMusicPieces,
  getYouTubeMeta,
  getTitleMeta,
  updateTitleMeta,
  bulkUpdatePieces,
  bulkDeletePieces,
  uploadTitleMp3,
  deleteTitleMp3,
  getPdfThumbnailUrl,
  getPdfInfo,
  getMp3Url,
  getMp3Blob,
  createMp3BlobUrl,
  revokeBlobUrl,
} from '../music';

beforeEach(() => startNepserver());
afterEach(() => {
  stopNepserver();
  vi.restoreAllMocks();
});

/** Vangt de aangemaakte downloadlink op; jsdom kent createObjectURL niet. */
function vangDownloadOp() {
  const anker = document.createElement('a');
  const klik = vi.spyOn(anker, 'click').mockImplementation(() => {});
  vi.spyOn(document, 'createElement').mockReturnValue(anker);
  const maakUrl = vi.fn(() => 'blob:nep');
  const geefVrij = vi.fn();
  Object.defineProperty(window.URL, 'createObjectURL', { value: maakUrl, configurable: true, writable: true });
  Object.defineProperty(window.URL, 'revokeObjectURL', { value: geefVrij, configurable: true, writable: true });
  return { anker, klik, maakUrl, geefVrij };
}

// ===========================================
// MUZIEKLIJSTEN
// ===========================================

describe('muzieklijsten ophalen', () => {
  it('getMusicLists bevraagt de orkestroute', async () => {
    antwoordMet([{ id: 'l1', name: 'Concert 2026' }]);
    const lijsten = await getMusicLists('o1');

    expect(laatsteVerzoek().methode).toBe('get');
    expect(laatsteVerzoek().pad).toBe('/music-lists/orchestra/o1');
    expect(lijsten).toHaveLength(1);
  });

  it('getMusicLists geeft een lege lijst terug zonder te vallen', async () => {
    antwoordMet([]);
    await expect(getMusicLists('o1')).resolves.toEqual([]);
  });

  it('getMyMusicLists bevraagt het vaste pad /music-lists/my-lists', async () => {
    antwoordMet([]);
    await getMyMusicLists();

    // 'my-lists' mag niet als lijst-id gelezen worden; in de backend staat
    // deze route daarom voor /:id geregistreerd.
    expect(laatsteVerzoek().pad).toBe('/music-lists/my-lists');
  });

  it('getMusicList haalt een lijst met stukken op', async () => {
    antwoordMet({ id: 'l1', name: 'Concert', pieces: [{ id: 's1', title: 'Mars' }] });
    const lijst = await getMusicList('l1');

    expect(laatsteVerzoek().pad).toBe('/music-lists/l1');
    expect(lijst.pieces).toHaveLength(1);
  });

  it('getMusicList laat een 404 door in plaats van undefined te leveren', async () => {
    antwoordMetFout(404, { error: 'Lijst niet gevonden.' });

    await expect(getMusicList('l9')).rejects.toMatchObject({ response: { status: 404 } });
  });
});

describe('muzieklijsten beheren', () => {
  it('createMusicList voegt naam, orkest en de opties samen in een body', async () => {
    antwoordMet({ id: 'l1' });

    await createMusicList('Nieuwjaarsconcert', 'o1', {
      listType: 'concert',
      concertDate: '2027-01-08',
      concertLocation: 'Grote kerk',
    });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/music-lists');
    // createMusicListSchema leest name, orchestraId, listType, concertDate
    // en concertLocation.
    expect(verzoek.body).toEqual({
      name: 'Nieuwjaarsconcert',
      orchestraId: 'o1',
      listType: 'concert',
      concertDate: '2027-01-08',
      concertLocation: 'Grote kerk',
    });
  });

  it('createMusicList stuurt alleen naam en orkest als er geen opties zijn', async () => {
    antwoordMet({ id: 'l1' });
    await createMusicList('Repertoire', 'o1');

    expect(laatsteVerzoek().body).toEqual({ name: 'Repertoire', orchestraId: 'o1' });
  });

  it('createMusicList stuurt null mee om een concertdatum te wissen', async () => {
    antwoordMet({ id: 'l1' });
    await createMusicList('Repertoire', 'o1', { concertDate: null });

    // Het schema staat null uitdrukkelijk toe; weglaten zou iets anders betekenen.
    expect(laatsteVerzoek().body).toEqual({ name: 'Repertoire', orchestraId: 'o1', concertDate: null });
  });

  it('updateMusicList gebruikt PUT op /music-lists/:id', async () => {
    antwoordMet({ message: 'Bijgewerkt.' });

    await updateMusicList('l1', { name: 'Concert 2027', listType: 'concert' });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('put');
    expect(verzoek.pad).toBe('/music-lists/l1');
    expect(verzoek.body).toEqual({ name: 'Concert 2027', listType: 'concert' });
  });

  it('deleteMusicList verwijdert een lijst', async () => {
    antwoordMet({ message: 'Verwijderd.' });
    await deleteMusicList('l1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/music-lists/l1');
  });

  it('reorderMusicLists gebruikt het vaste pad /music-lists/reorder', async () => {
    antwoordMet({ message: 'Volgorde bijgewerkt.' });

    await reorderMusicLists('o1', ['l2', 'l1']);

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('put');
    // 'reorder' mag geen lijst-id worden; in de backend staat deze route
    // daarom voor /:id geregistreerd.
    expect(verzoek.pad).toBe('/music-lists/reorder');
    expect(verzoek.body).toEqual({ orchestraId: 'o1', listIds: ['l2', 'l1'] });
  });

  it('toggleMusicListActive gebruikt PATCH, niet PUT', async () => {
    antwoordMet({ isActive: false });

    const resultaat = await toggleMusicListActive('l1');

    const verzoek = laatsteVerzoek();
    // De backend registreert deze route als PATCH; met PUT komt het verzoek
    // nergens aan.
    expect(verzoek.methode).toBe('patch');
    expect(verzoek.pad).toBe('/music-lists/l1/toggle-active');
    expect(resultaat.isActive).toBe(false);
  });

  it('reorderTitlesInList stuurt de titelvolgorde mee', async () => {
    antwoordMet({ message: 'Volgorde bijgewerkt.' });

    await reorderTitlesInList('l1', ['Mars', 'Wals']);

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('put');
    expect(verzoek.pad).toBe('/music-lists/l1/reorder-titles');
    // reorderPiecesInListSchema leest titleOrder.
    expect(verzoek.body).toEqual({ titleOrder: ['Mars', 'Wals'] });
  });

  it('downloadProgramPdf vraagt het programma als blob op', async () => {
    antwoordMet('%PDF-1.4');

    const pdf = await downloadProgramPdf('l1');

    const verzoek = laatsteVerzoek();
    expect(verzoek.pad).toBe('/music-lists/l1/program-pdf');
    expect(verzoek.responseType).toBe('blob');
    expect(pdf).toBe('%PDF-1.4');
  });
});

describe('stukken en titels in een lijst', () => {
  it('addPieceToList stuurt het stuk-id in de body', async () => {
    antwoordMet({ message: 'Toegevoegd.' });

    await addPieceToList('l1', 's1');

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/music-lists/l1/pieces');
    // addPieceToListSchema leest pieceId.
    expect(verzoek.body).toEqual({ pieceId: 's1' });
  });

  it('removePieceFromList zet lijst en stuk allebei in het pad', async () => {
    antwoordMet({ message: 'Verwijderd.' });
    await removePieceFromList('l1', 's1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/music-lists/l1/pieces/s1');
  });

  it('addTitleToList stuurt de titel in de body', async () => {
    antwoordMet({ added: 3, total: 12 });

    const resultaat = await addTitleToList('l1', 'Slavische dans');

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/music-lists/l1/titles');
    expect(verzoek.body).toEqual({ title: 'Slavische dans' });
    expect(resultaat.added).toBe(3);
  });

  it('removeTitleFromList stuurt de titel mee in de body van een DELETE', async () => {
    antwoordMet({ removed: 4 });

    const resultaat = await removeTitleFromList('l1', 'Slavische dans');

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('delete');
    expect(verzoek.pad).toBe('/music-lists/l1/titles');
    // De backend leest hier req.body.title; een queryparameter zou daar niet
    // aankomen.
    expect(verzoek.body).toEqual({ title: 'Slavische dans' });
    expect(resultaat.removed).toBe(4);
  });

  it('removeTitleFromList houdt een titel met leestekens heel', async () => {
    antwoordMet({ removed: 1 });
    await removeTitleFromList('l1', 'Ouverture "1812" & finale');

    expect(laatsteVerzoek().body).toEqual({ title: 'Ouverture "1812" & finale' });
  });
});

// ===========================================
// MUZIEKSTUKKEN
// ===========================================

describe('getMusicPieces', () => {
  it('zet de filters in de queryreeks', async () => {
    antwoordMet([]);
    await getMusicPieces({ search: 'mars', instrumentId: 'i1', listId: 'l1' });

    const { pad, query } = laatsteVerzoek();
    expect(pad).toBe('/music-pieces');
    expect(query.get('search')).toBe('mars');
    expect(query.get('instrumentId')).toBe('i1');
    expect(query.get('listId')).toBe('l1');
  });

  it('stuurt geen queryreeks mee zonder filters', async () => {
    antwoordMet([]);
    await getMusicPieces();

    expect(laatsteVerzoek().queryreeks).toBe('');
  });

  it('laat een filter die niet ingevuld is weg', async () => {
    antwoordMet([]);
    await getMusicPieces({ search: 'mars', instrumentId: undefined });

    expect(laatsteVerzoek().queryreeks).toBe('search=mars');
  });

  it('codeert een zoekterm met spatie en ampersand', async () => {
    antwoordMet([]);
    await getMusicPieces({ search: 'Bach & Händel' });

    const { queryreeks, query } = laatsteVerzoek();
    expect(queryreeks).not.toContain('& H');
    expect(query.get('search')).toBe('Bach & Händel');
  });

  it('geeft een lege lijst terug zonder te vallen', async () => {
    antwoordMet([]);
    await expect(getMusicPieces()).resolves.toEqual([]);
  });
});

describe('getMusicPiecesPaginated', () => {
  it('stuurt pagina en paginagrootte mee onder de namen die de backend leest', async () => {
    antwoordMet({ data: [], total: 0, page: 2, pageSize: 50, totalPages: 0 });

    await getMusicPiecesPaginated({ page: 2, pageSize: 50, search: 'mars' });

    const { pad, query } = laatsteVerzoek();
    expect(pad).toBe('/music-pieces');
    // Deze route leest zelf page en pageSize uit req.query (anders dan de
    // gedeelde getPaginationParams, die limit leest).
    expect(query.get('page')).toBe('2');
    expect(query.get('pageSize')).toBe('50');
    expect(query.get('search')).toBe('mars');
  });

  it('geeft het gepagineerde antwoord ongewijzigd door', async () => {
    const antwoord = { data: [{ id: 's1' }], total: 1, page: 1, pageSize: 50, totalPages: 1 };
    antwoordMet(antwoord);

    await expect(getMusicPiecesPaginated({ page: 1 })).resolves.toEqual(antwoord);
  });
});

describe('overige lijsten met stukken', () => {
  it('getMyMusicPieces bevraagt /music-pieces/my-pieces', async () => {
    antwoordMet([]);
    await getMyMusicPieces();

    expect(laatsteVerzoek().pad).toBe('/music-pieces/my-pieces');
  });

  it('getSharedMusicPieces bevraagt /music-pieces/shared', async () => {
    antwoordMet([]);
    await getSharedMusicPieces();

    expect(laatsteVerzoek().pad).toBe('/music-pieces/shared');
  });

  it('getMusicTitles zet de filters in de queryreeks', async () => {
    antwoordMet([]);
    await getMusicTitles({ search: 'wals', listId: 'l1', genreId: 'g1' });

    const { pad, query } = laatsteVerzoek();
    expect(pad).toBe('/music-pieces/titles');
    expect(query.get('search')).toBe('wals');
    expect(query.get('listId')).toBe('l1');
    expect(query.get('genreId')).toBe('g1');
  });

  it('getMusicTitles geeft een lege titellijst terug zonder te vallen', async () => {
    antwoordMet([]);
    await expect(getMusicTitles()).resolves.toEqual([]);
  });
});

describe('muziekstukken beheren', () => {
  it('updateMusicPiece gebruikt PUT op /music-pieces/:id', async () => {
    antwoordMet({ message: 'Bijgewerkt.' });

    await updateMusicPiece('s1', { title: 'Mars', arranger: 'Van der Roost', instrumentId: 'i1' });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('put');
    expect(verzoek.pad).toBe('/music-pieces/s1');
    expect(verzoek.body).toEqual({ title: 'Mars', arranger: 'Van der Roost', instrumentId: 'i1' });
  });

  it('deleteMusicPiece verwijdert een stuk', async () => {
    antwoordMet({ message: 'Verwijderd.' });
    await deleteMusicPiece('s1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/music-pieces/s1');
  });

  it('restoreMusicPiece zet een verwijderd stuk terug', async () => {
    antwoordMet({ message: 'Teruggezet.' });
    await restoreMusicPiece('s1');

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/music-pieces/s1/restore');
    expect(verzoek.body).toBeUndefined();
  });

  it('deleteMusicPiecesBulk post de ids naar /bulk-delete', async () => {
    antwoordMet({ count: 3 });

    const resultaat = await deleteMusicPiecesBulk(['s1', 's2', 's3']);

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/music-pieces/bulk-delete');
    // Deze route leest `ids`, terwijl DELETE /bulk `pieceIds` leest.
    expect(verzoek.body).toEqual({ ids: ['s1', 's2', 's3'] });
    expect(resultaat.count).toBe(3);
  });

  it('bulkUpdatePieces stuurt de ids en de wijzigingen apart mee', async () => {
    antwoordMet({ message: 'Bijgewerkt.', updated: 2 });

    await bulkUpdatePieces(['s1', 's2'], { instrumentId: 'i1', addToListId: 'l1' });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('put');
    expect(verzoek.pad).toBe('/music-pieces/bulk');
    // bulkUpdatePiecesSchema verwacht updates als apart object.
    expect(verzoek.body).toEqual({ pieceIds: ['s1', 's2'], updates: { instrumentId: 'i1', addToListId: 'l1' } });
  });

  it('bulkUpdatePieces stuurt instrumentId null mee om de koppeling te wissen', async () => {
    antwoordMet({ message: 'Bijgewerkt.', updated: 1 });

    await bulkUpdatePieces(['s1'], { instrumentId: null });

    expect(laatsteVerzoek().body).toEqual({ pieceIds: ['s1'], updates: { instrumentId: null } });
  });

  it('bulkDeletePieces stuurt de ids mee in de body van een DELETE', async () => {
    antwoordMet({ message: 'Verwijderd.', deleted: 2 });

    const resultaat = await bulkDeletePieces(['s1', 's2']);

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('delete');
    expect(verzoek.pad).toBe('/music-pieces/bulk');
    expect(verzoek.body).toEqual({ pieceIds: ['s1', 's2'] });
    expect(resultaat.deleted).toBe(2);
  });

  it('shareMusicPiece stuurt de vereniging mee', async () => {
    antwoordMet({ message: 'Gedeeld.' });

    await shareMusicPiece('s1', 'v2');

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/music-pieces/s1/share');
    expect(verzoek.body).toEqual({ associationId: 'v2' });
  });

  it('refreshInstrumentLinks post zonder body', async () => {
    antwoordMet({ updated: 5, alreadyLinked: 10, notFound: 1, total: 16 });

    const resultaat = await refreshInstrumentLinks();

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/music-pieces/refresh-instruments');
    expect(verzoek.body).toBeUndefined();
    expect(resultaat.total).toBe(16);
  });
});

// ===========================================
// UPLOADS
// ===========================================

describe('uploads', () => {
  it('uploadMusicPieces stuurt de bestanden als formulier mee', async () => {
    antwoordMet({ uploaded: [{ id: 's1' }] });

    await uploadMusicPieces(
      [new File(['a'], 'trompet.pdf', { type: 'application/pdf' }), new File(['b'], 'hoorn.pdf')],
      'l1',
      { 'trompet.pdf': 'https://youtu.be/abc' },
    );

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/music-pieces/upload');
    expect(verzoek.headers['Content-Type']).toBe('multipart/form-data');

    const formulier = verzoek.body as FormData;
    expect(formulier).toBeInstanceOf(FormData);
    // De backend leest req.files onder de naam 'files' (meervoud).
    expect(formulier.getAll('files')).toHaveLength(2);
    expect(formulier.get('listId')).toBe('l1');
    // youtubeUrls gaat als JSON-tekst mee; de backend parseert die zelf.
    expect(formulier.get('youtubeUrls')).toBe('{"trompet.pdf":"https://youtu.be/abc"}');
  });

  it('uploadMusicPieces laat listId weg als er geen lijst gekozen is', async () => {
    antwoordMet({ uploaded: [] });

    await uploadMusicPieces([new File(['a'], 'los.pdf')]);

    const formulier = laatsteVerzoek().body as FormData;
    expect(formulier.has('listId')).toBe(false);
    expect(formulier.has('youtubeUrls')).toBe(false);
  });

  it('uploadMusicPiecesZip stuurt het zipbestand onder de naam zip mee', async () => {
    antwoordMet({ uploaded: [], skipped: [] });

    await uploadMusicPiecesZip(new File(['pk'], 'partijen.zip', { type: 'application/zip' }), 'l1');

    const verzoek = laatsteVerzoek();
    expect(verzoek.pad).toBe('/music-pieces/upload-zip');
    const formulier = verzoek.body as FormData;
    expect(formulier.get('zip')).toBeInstanceOf(File);
    expect(formulier.get('listId')).toBe('l1');
  });

  it('uploadTitleMp3 stuurt het bestand onder de naam mp3 mee', async () => {
    antwoordMet({ message: 'MP3 bestand geüpload.', mp3FilePath: '123-abc.mp3' });

    const resultaat = await uploadTitleMp3('t1', new File(['id3'], 'opname.mp3', { type: 'audio/mpeg' }));

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/music-pieces/title-mp3/t1');
    expect((verzoek.body as FormData).get('mp3')).toBeInstanceOf(File);
    expect(resultaat.mp3FilePath).toBe('123-abc.mp3');
  });

  it('deleteTitleMp3 verwijdert de opname bij een titel', async () => {
    antwoordMet({ message: 'Verwijderd.' });
    await deleteTitleMp3('t1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/music-pieces/title-mp3/t1');
  });

  it('uploadMusicPieces laat een te groot bestand als fout doorkomen', async () => {
    antwoordMetFout(413, { error: 'Bestand is te groot.' });

    await expect(uploadMusicPieces([new File(['x'], 'groot.pdf')])).rejects.toMatchObject({
      response: { status: 413 },
    });
  });
});

// ===========================================
// TITELGEGEVENS
// ===========================================

describe('titelgegevens', () => {
  it('getTitleMeta codeert de titel in het pad', async () => {
    antwoordMet({ title: 'Mars & Wals', arranger: null, genres: [] });

    await getTitleMeta('Mars & Wals');

    const { pad } = laatsteVerzoek();
    // Zonder codering knipt de server het pad af op de ampersand.
    expect(pad).toBe('/music-pieces/title-meta/Mars%20%26%20Wals');
  });

  it('getTitleMeta zet de arrangeur gecodeerd in de queryreeks', async () => {
    antwoordMet({ title: 'Mars', arranger: 'Van der Roost', genres: [] });

    await getTitleMeta('Mars', 'Van der Roost');

    const verzoek = laatsteVerzoek();
    expect(verzoek.pad).toBe('/music-pieces/title-meta/Mars?arranger=Van%20der%20Roost');
    expect(verzoek.query.get('arranger')).toBe('Van der Roost');
  });

  it('getTitleMeta laat de queryreeks weg zonder arrangeur', async () => {
    antwoordMet({ title: 'Mars', arranger: null, genres: [] });
    await getTitleMeta('Mars');

    expect(laatsteVerzoek().queryreeks).toBe('');
  });

  it('getTitleMeta laat de queryreeks ook weg bij arrangeur null', async () => {
    antwoordMet({ title: 'Mars', arranger: null, genres: [] });
    await getTitleMeta('Mars', null);

    expect(laatsteVerzoek().queryreeks).toBe('');
  });

  it('updateTitleMeta gebruikt PUT op het vaste pad /title-meta', async () => {
    antwoordMet({ id: 't1' });

    await updateTitleMeta({
      title: 'Mars',
      arranger: 'Van der Roost',
      youtubeUrl: 'https://youtu.be/abc',
      durationSeconds: 240,
      genreIds: ['g1', 'g2'],
      isShared: true,
    });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('put');
    // De titel staat hier in de body, niet in het pad.
    expect(verzoek.pad).toBe('/music-pieces/title-meta');
    expect(verzoek.body).toEqual({
      title: 'Mars',
      arranger: 'Van der Roost',
      youtubeUrl: 'https://youtu.be/abc',
      durationSeconds: 240,
      genreIds: ['g1', 'g2'],
      isShared: true,
    });
  });

  it('updateTitleMeta stuurt een lege youtubeUrl mee om hem te wissen', async () => {
    antwoordMet({ id: 't1' });
    await updateTitleMeta({ title: 'Mars', youtubeUrl: '' });

    // Het schema staat de lege string uitdrukkelijk toe (or(z.literal(''))).
    expect(laatsteVerzoek().body).toEqual({ title: 'Mars', youtubeUrl: '' });
  });

  it('getYouTubeMeta stuurt de url als queryparameter', async () => {
    antwoordMet({ title: 'Mars', author: 'Kanaal', thumbnailUrl: '', videoId: 'abc' });

    await getYouTubeMeta('https://www.youtube.com/watch?v=abc&t=30');

    const verzoek = laatsteVerzoek();
    expect(verzoek.pad).toBe('/music-pieces/youtube-meta');
    // De hele url hoort als een parameter aan te komen, inclusief de eigen
    // vraagteken en ampersand.
    expect(verzoek.query.get('url')).toBe('https://www.youtube.com/watch?v=abc&t=30');
  });
});

// ===========================================
// DOWNLOADEN EN AFSPELEN
// ===========================================

describe('downloadMusicPiece', () => {
  it('vraagt het bestand als blob op en gebruikt de naam uit de kopregel', async () => {
    const { anker, klik, maakUrl, geefVrij } = vangDownloadOp();
    // De browser levert kopregelnamen in kleine letters aan; downloadMusicPiece
    // leest daarom response.headers['content-disposition'].
    antwoordMet('%PDF-1.4', { headers: { 'content-disposition': 'attachment; filename="Mars in Bes.pdf"' } });

    await downloadMusicPiece('s1');

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('get');
    expect(verzoek.pad).toBe('/music-pieces/s1/download');
    expect(verzoek.responseType).toBe('blob');
    expect(anker.download).toBe('Mars in Bes.pdf');
    expect(klik).toHaveBeenCalledTimes(1);
    expect(maakUrl).toHaveBeenCalledTimes(1);
    expect(geefVrij).toHaveBeenCalledWith('blob:nep');
  });

  it('leest ook een naam zonder aanhalingstekens', async () => {
    const { anker } = vangDownloadOp();
    antwoordMet('%PDF-1.4', { headers: { 'content-disposition': 'attachment; filename=mars.pdf' } });

    await downloadMusicPiece('s1');

    expect(anker.download).toBe('mars.pdf');
  });

  it('gebruikt de gecodeerde naam als de titel niet-ascii tekens bevat', async () => {
    const { anker } = vangDownloadOp();
    // Express stuurt bij zulke namen twee vormen mee: filename met vraagtekens
    // op de plek van de bijzondere tekens, en filename* met de echte naam.
    antwoordMet('%PDF-1.4', {
      headers: {
        'content-disposition': 'attachment; filename="Ma?ana.pdf"; filename*=UTF-8\'\'Ma%C3%B1ana.pdf',
      },
    });

    await downloadMusicPiece('s1');

    // filename* hoort te winnen; anders bewaart de gebruiker "Ma?ana.pdf",
    // een naam die Windows niet eens accepteert.
    expect(anker.download).toBe('Mañana.pdf');
  });

  it('gebruikt filename* ook als dat de enige vorm in de kopregel is', async () => {
    const { anker } = vangDownloadOp();
    antwoordMet('%PDF-1.4', {
      headers: { 'content-disposition': "attachment; filename*=UTF-8''Sinfon%C3%ADa.pdf" },
    });

    await downloadMusicPiece('s1');

    expect(anker.download).toBe('Sinfonía.pdf');
  });

  it('valt terug op muziekstuk.pdf als de kopregel ontbreekt', async () => {
    const { anker } = vangDownloadOp();
    antwoordMet('%PDF-1.4');

    await downloadMusicPiece('s1');

    expect(anker.download).toBe('muziekstuk.pdf');
  });

  it('zet geen download klaar als de server een 403 geeft', async () => {
    const { klik, geefVrij } = vangDownloadOp();
    antwoordMetFout(403, { error: 'Je hebt geen toegang tot dit muziekstuk.' });

    await expect(downloadMusicPiece('s1')).rejects.toMatchObject({ response: { status: 403 } });
    expect(klik).not.toHaveBeenCalled();
    expect(geefVrij).not.toHaveBeenCalled();
  });
});

describe('mp3 en miniaturen', () => {
  it('getMp3Blob vraagt de opname als blob op', async () => {
    antwoordMet('ID3');

    const blob = await getMp3Blob('123-abc.mp3');

    const verzoek = laatsteVerzoek();
    expect(verzoek.pad).toBe('/music-pieces/mp3/123-abc.mp3');
    expect(verzoek.responseType).toBe('blob');
    expect(blob).toBe('ID3');
  });

  it('createMp3BlobUrl maakt een blob-url van de opname', async () => {
    const maakUrl = vi.fn(() => 'blob:opname');
    Object.defineProperty(window.URL, 'createObjectURL', { value: maakUrl, configurable: true, writable: true });
    antwoordMet('ID3');

    const url = await createMp3BlobUrl('123-abc.mp3');

    expect(url).toBe('blob:opname');
    expect(maakUrl).toHaveBeenCalledTimes(1);
  });

  it('revokeBlobUrl geeft alleen blob-urls vrij', () => {
    const geefVrij = vi.fn();
    Object.defineProperty(window.URL, 'revokeObjectURL', { value: geefVrij, configurable: true, writable: true });

    revokeBlobUrl('blob:opname');
    revokeBlobUrl('https://voorbeeld.nl/opname.mp3');

    // Een gewone url vrijgeven doet niets nuttigs en zou in sommige browsers
    // een fout geven.
    expect(geefVrij).toHaveBeenCalledTimes(1);
    expect(geefVrij).toHaveBeenCalledWith('blob:opname');
  });

  it('getMp3Url zet het token in de queryreeks (verouderd pad)', () => {
    localStorage.setItem('token', 'nep-token');

    const url = getMp3Url('123-abc.mp3');

    expect(url).toBe('/api/music-pieces/mp3/123-abc.mp3?token=nep-token');
    localStorage.removeItem('token');
  });

  it('getPdfThumbnailUrl codeert de bestandsnaam en laat lege opties weg', () => {
    expect(getPdfThumbnailUrl('mars in bes.pdf')).toBe('/api/thumbnails/mars%20in%20bes.pdf');
  });

  it('getPdfThumbnailUrl zet pagina en formaat in de queryreeks', () => {
    expect(getPdfThumbnailUrl('mars.pdf', { page: 2, size: 'large' })).toBe(
      '/api/thumbnails/mars.pdf?page=2&size=large',
    );
  });

  it('getPdfThumbnailUrl laat pagina 0 weg, want paginanummers beginnen bij 1', () => {
    expect(getPdfThumbnailUrl('mars.pdf', { page: 0 })).toBe('/api/thumbnails/mars.pdf');
  });

  it('getPdfInfo codeert de bestandsnaam in het pad', async () => {
    antwoordMet({ filename: 'mars in bes.pdf', pageCount: 3 });

    const info = await getPdfInfo('mars in bes.pdf');

    expect(laatsteVerzoek().pad).toBe('/thumbnails/mars%20in%20bes.pdf/info');
    expect(info.pageCount).toBe(3);
  });
});

// ===========================================
// ALGEMEEN GEDRAG
// ===========================================

describe('algemeen gedrag van de muziek-api', () => {
  it('stuurt precies een verzoek per aanroep', async () => {
    antwoordMet([]);
    await getMyMusicPieces();

    expect(alleVerzoeken()).toHaveLength(1);
  });

  it('werpt bij een netwerkfout zonder respons', async () => {
    antwoordMetNetwerkfout();

    await expect(getMyMusicPieces()).rejects.toMatchObject({ code: 'ERR_NETWORK' });
  });

  it('werpt als het verzoek in de tijdslimiet loopt', async () => {
    antwoordMetTijdslimiet();

    await expect(getMyMusicPieces()).rejects.toMatchObject({ code: 'ECONNABORTED' });
  });

  it('geeft null door zoals het binnenkomt', async () => {
    antwoordMet(null);

    await expect(getMusicList('l1')).resolves.toBeNull();
  });

  it('laat een 500 door in plaats van een lege lijst te leveren', async () => {
    antwoordMetFout(500, { error: 'Interne fout' });

    await expect(getMusicLists('o1')).rejects.toMatchObject({ response: { status: 500 } });
  });
});
