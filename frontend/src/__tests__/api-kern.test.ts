/**
 * Tests voor het eerste deel van src/api.ts: inloggen, instrumenten, orkesten,
 * muzieklijsten, muziekstukken, verenigingen, genres, back-ups, meldingen,
 * leningen en instellingen.
 *
 * De functies zijn dun - ze zetten een pad in elkaar, geven een body mee en
 * leveren response.data terug. Juist daarom wordt hier op pad, methode, body en
 * queryreeks getoetst: een typefout daarin geeft geen foutmelding maar een leeg
 * scherm. Elke route is vergeleken met het bijbehorende bestand in
 * backend/src/routes/.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { startNepserver, stopNepserver, antwoordMet, antwoordMetFout, laatsteVerzoek } from './nepserver-api';
import {
  login,
  getProfile,
  changePassword,
  requestPasswordReset,
  validateResetToken,
  resetPassword,
  setupMfa,
  enableMfa,
  disableMfa,
  getMfaStatus,
  getInstruments,
  createInstrument,
  updateInstrument,
  deleteInstrument,
  addInstrumentAlias,
  deleteInstrumentAlias,
  getOrchestras,
  getOrchestra,
  createOrchestra,
  updateOrchestra,
  deleteOrchestra,
  getMusicLists,
  getMyMusicLists,
  getMusicList,
  createMusicList,
  updateMusicList,
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
  refreshInstrumentLinks,
  updateMusicPiece,
  deleteMusicPiece,
  deleteMusicPiecesBulk,
  restoreMusicPiece,
  shareMusicPiece,
  getSharedMusicPieces,
  getYouTubeMeta,
  getTitleMeta,
  updateTitleMeta,
  deleteTitleMp3,
  bulkUpdatePieces,
  bulkDeletePieces,
  getAssociations,
  getCurrentAssociation,
  updateCurrentAssociation,
  createAssociation,
  getGenres,
  createGenre,
  updateGenre,
  deleteGenre,
  getBackupInfo,
  getIssues,
  getMyIssues,
  getIssueStats,
  createIssue,
  updateIssueStatus,
  deleteIssue,
  getLoans,
  createLoan,
  updateLoan,
  returnLoan,
  deleteLoan,
  getActivityStats,
  logActivity,
  getRecentActivity,
  getSettings,
  updateSettings,
  removeLogo,
  updateTheme,
  revokeBlobUrl,
} from '../api';

beforeEach(() => startNepserver());
afterEach(() => {
  stopNepserver();
  vi.restoreAllMocks();
});

describe('inloggen en wachtwoord', () => {
  it('login stuurt e-mailadres, wachtwoord en tweefactorcode naar /auth/login', async () => {
    antwoordMet({ token: 'jwt', user: { id: 'u1' } });
    const resultaat = await login('jan@example.com', 'geheim', '123456');

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/auth/login');
    expect(verzoek.body).toEqual({ email: 'jan@example.com', password: 'geheim', mfaCode: '123456' });
    expect(resultaat).toEqual({ token: 'jwt', user: { id: 'u1' } });
  });

  it('login laat mfaCode weg als die er niet is', async () => {
    antwoordMet({ token: 'jwt' });
    await login('jan@example.com', 'geheim');

    expect(Object.keys(laatsteVerzoek().body as object).sort()).toEqual(['email', 'password']);
  });

  it('getProfile haalt het eigen profiel op', async () => {
    antwoordMet({ id: 'u1' });
    await getProfile();

    expect(laatsteVerzoek().methode).toBe('get');
    expect(laatsteVerzoek().pad).toBe('/auth/me');
  });

  it('changePassword stuurt beide wachtwoorden mee', async () => {
    antwoordMet({});
    await changePassword('oud-wachtwoord', 'nieuw-wachtwoord');

    const verzoek = laatsteVerzoek();
    expect(verzoek.pad).toBe('/auth/change-password');
    expect(verzoek.body).toEqual({ currentPassword: 'oud-wachtwoord', newPassword: 'nieuw-wachtwoord' });
  });

  it('requestPasswordReset stuurt alleen het e-mailadres', async () => {
    antwoordMet({ message: 'verstuurd' });
    await requestPasswordReset('jan@example.com');

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/auth/forgot-password');
    expect(verzoek.body).toEqual({ email: 'jan@example.com' });
  });

  it('validateResetToken zet het token in de queryreeks', async () => {
    antwoordMet({ valid: true });
    await validateResetToken('abc123');

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('get');
    expect(verzoek.query.get('token')).toBe('abc123');
  });

  // Vastgelegd, niet goedgekeurd: het token wordt met een sjabloonreeks in het
  // pad geplakt zonder encodeURIComponent. Een token met een & of een + erin
  // komt daardoor verminkt aan.
  it('codeert een token met bijzondere tekens niet', async () => {
    antwoordMet({ valid: false });
    await validateResetToken('a+b&c=d');

    expect(laatsteVerzoek().queryreeks).toBe('token=a+b&c=d');
  });

  it('resetPassword stuurt token en nieuw wachtwoord', async () => {
    antwoordMet({ message: 'gelukt' });
    await resetPassword('abc123', 'nieuw-wachtwoord');

    const verzoek = laatsteVerzoek();
    expect(verzoek.pad).toBe('/auth/reset-password');
    expect(verzoek.body).toEqual({ token: 'abc123', newPassword: 'nieuw-wachtwoord' });
  });
});

describe('tweefactor', () => {
  it('setupMfa doet een POST zonder body', async () => {
    antwoordMet({ secret: 's', qrCode: 'q' });
    await setupMfa();

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/auth/mfa/setup');
    expect(verzoek.body).toBeUndefined();
  });

  it('enableMfa stuurt de code mee', async () => {
    antwoordMet({ message: 'aan', mfaEnabled: true });
    await enableMfa('123456');

    expect(laatsteVerzoek().pad).toBe('/auth/mfa/enable');
    expect(laatsteVerzoek().body).toEqual({ code: '123456' });
  });

  it('disableMfa stuurt wachtwoord en optioneel de code', async () => {
    antwoordMet({ message: 'uit', mfaEnabled: false });
    await disableMfa('geheim', '123456');
    expect(laatsteVerzoek().body).toEqual({ password: 'geheim', code: '123456' });

    antwoordMet({ message: 'uit', mfaEnabled: false });
    await disableMfa('geheim');
    expect(Object.keys(laatsteVerzoek().body as object)).toEqual(['password']);
  });

  it('getMfaStatus vraagt de stand op', async () => {
    antwoordMet({ mfaEnabled: true });
    await getMfaStatus();

    expect(laatsteVerzoek().methode).toBe('get');
    expect(laatsteVerzoek().pad).toBe('/auth/mfa/status');
  });
});

describe('instrumenten', () => {
  it('getInstruments haalt de lijst op', async () => {
    antwoordMet([{ id: 'i1', name: 'Trompet' }]);
    await expect(getInstruments()).resolves.toEqual([{ id: 'i1', name: 'Trompet' }]);
    expect(laatsteVerzoek().pad).toBe('/instruments');
  });

  it('createInstrument stuurt naam, stemming, sleutel en aliassen', async () => {
    antwoordMet({ id: 'i1' });
    await createInstrument('Trompet', 'Bes', 'G', ['Trumpet']);

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/instruments');
    expect(verzoek.body).toEqual({ name: 'Trompet', tuning: 'Bes', clef: 'G', aliases: ['Trumpet'] });
  });

  // updateInstrument kent geen aliassen-parameter, anders dan createInstrument.
  // Dat is geen fout, maar wel iets om vast te leggen: wie hier een vierde
  // argument meegeeft, ziet het stilzwijgend verdwijnen.
  it('updateInstrument stuurt alleen naam, stemming en sleutel', async () => {
    antwoordMet({});
    await updateInstrument('i1', 'Trompet', 'Bes', 'G');

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('put');
    expect(verzoek.pad).toBe('/instruments/i1');
    expect(verzoek.body).toEqual({ name: 'Trompet', tuning: 'Bes', clef: 'G' });
  });

  it('deleteInstrument verwijdert op id', async () => {
    antwoordMet({});
    await deleteInstrument('i1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/instruments/i1');
  });

  it('addInstrumentAlias hangt de alias onder het instrument', async () => {
    antwoordMet({ id: 'a1' });
    await addInstrumentAlias('i1', 'Trumpet in Bb');

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/instruments/i1/aliases');
    expect(verzoek.body).toEqual({ alias: 'Trumpet in Bb' });
  });

  it('deleteInstrumentAlias gebruikt beide ids in het pad', async () => {
    antwoordMet({});
    await deleteInstrumentAlias('i1', 'a1');

    expect(laatsteVerzoek().pad).toBe('/instruments/i1/aliases/a1');
  });
});

describe('orkesten', () => {
  it('getOrchestras haalt de lijst op', async () => {
    antwoordMet([]);
    await getOrchestras();
    expect(laatsteVerzoek().pad).toBe('/orchestras');
  });

  it('getOrchestra haalt één orkest met leden en lijsten op', async () => {
    antwoordMet({ id: 'o1', members: [], lists: [] });
    await getOrchestra('o1');
    expect(laatsteVerzoek().pad).toBe('/orchestras/o1');
  });

  it('createOrchestra stuurt alleen de naam', async () => {
    antwoordMet({ id: 'o1' });
    await createOrchestra('Harmonie');

    expect(laatsteVerzoek().methode).toBe('post');
    expect(laatsteVerzoek().body).toEqual({ name: 'Harmonie' });
  });

  it('updateOrchestra en deleteOrchestra gebruiken het id in het pad', async () => {
    antwoordMet({});
    await updateOrchestra('o1', 'Nieuwe naam');
    expect(laatsteVerzoek().methode).toBe('put');
    expect(laatsteVerzoek().pad).toBe('/orchestras/o1');
    expect(laatsteVerzoek().body).toEqual({ name: 'Nieuwe naam' });

    antwoordMet({});
    await deleteOrchestra('o1');
    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/orchestras/o1');
  });
});

describe('muzieklijsten', () => {
  it('getMusicLists haalt de lijsten van een orkest op', async () => {
    antwoordMet([]);
    await getMusicLists('o1');
    expect(laatsteVerzoek().pad).toBe('/music-lists/orchestra/o1');
  });

  it('getMyMusicLists en getMusicList gebruiken hun eigen paden', async () => {
    antwoordMet([]);
    await getMyMusicLists();
    expect(laatsteVerzoek().pad).toBe('/music-lists/my-lists');

    antwoordMet({ id: 'l1', pieces: [] });
    await getMusicList('l1');
    expect(laatsteVerzoek().pad).toBe('/music-lists/l1');
  });

  it('createMusicList voegt de opties bij naam en orkest', async () => {
    antwoordMet({ id: 'l1' });
    await createMusicList('Concert 2026', 'o1', {
      listType: 'concert',
      concertDate: '2026-05-01',
      concertLocation: 'De Kegel',
    });

    expect(laatsteVerzoek().body).toEqual({
      name: 'Concert 2026',
      orchestraId: 'o1',
      listType: 'concert',
      concertDate: '2026-05-01',
      concertLocation: 'De Kegel',
    });
  });

  it('createMusicList stuurt zonder opties alleen naam en orkest', async () => {
    antwoordMet({ id: 'l1' });
    await createMusicList('Repertoire', 'o1');

    expect(laatsteVerzoek().body).toEqual({ name: 'Repertoire', orchestraId: 'o1' });
  });

  it('updateMusicList gebruikt PUT op het lijst-id', async () => {
    antwoordMet({});
    await updateMusicList('l1', { name: 'Hernoemd', listType: 'regular' });

    expect(laatsteVerzoek().methode).toBe('put');
    expect(laatsteVerzoek().pad).toBe('/music-lists/l1');
    expect(laatsteVerzoek().body).toEqual({ name: 'Hernoemd', listType: 'regular' });
  });

  it('deleteMusicList verwijdert de lijst', async () => {
    antwoordMet({});
    await deleteMusicList('l1');
    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/music-lists/l1');
  });

  it('addPieceToList en removePieceFromList werken op dezelfde deelroute', async () => {
    antwoordMet({});
    await addPieceToList('l1', 'p1');
    expect(laatsteVerzoek().methode).toBe('post');
    expect(laatsteVerzoek().pad).toBe('/music-lists/l1/pieces');
    expect(laatsteVerzoek().body).toEqual({ pieceId: 'p1' });

    antwoordMet({});
    await removePieceFromList('l1', 'p1');
    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/music-lists/l1/pieces/p1');
  });

  it('addTitleToList stuurt de titel als body', async () => {
    antwoordMet({ added: 4, total: 12 });
    const resultaat = await addTitleToList('l1', 'Also sprach Zarathustra');

    expect(laatsteVerzoek().pad).toBe('/music-lists/l1/titles');
    expect(laatsteVerzoek().body).toEqual({ title: 'Also sprach Zarathustra' });
    expect(resultaat).toEqual({ added: 4, total: 12 });
  });

  // Een DELETE mét body. Dat is ongebruikelijk genoeg om vast te leggen: als
  // iemand dit ooit naar { params: ... } verbouwt, verdwijnt de titel en
  // verwijdert de route niets meer.
  it('removeTitleFromList stuurt de titel in de body van de DELETE', async () => {
    antwoordMet({ removed: 4 });
    await removeTitleFromList('l1', 'Also sprach Zarathustra');

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('delete');
    expect(verzoek.pad).toBe('/music-lists/l1/titles');
    expect(verzoek.body).toEqual({ title: 'Also sprach Zarathustra' });
  });

  it('reorderMusicLists gebruikt een vaste route, niet het lijst-id', async () => {
    antwoordMet({});
    await reorderMusicLists('o1', ['l2', 'l1']);

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('put');
    expect(verzoek.pad).toBe('/music-lists/reorder');
    expect(verzoek.body).toEqual({ orchestraId: 'o1', listIds: ['l2', 'l1'] });
  });

  it('toggleMusicListActive gebruikt PATCH', async () => {
    antwoordMet({ isActive: false });
    await toggleMusicListActive('l1');

    expect(laatsteVerzoek().methode).toBe('patch');
    expect(laatsteVerzoek().pad).toBe('/music-lists/l1/toggle-active');
  });

  it('reorderTitlesInList stuurt de nieuwe volgorde', async () => {
    antwoordMet({ message: 'ok' });
    await reorderTitlesInList('l1', ['b', 'a']);

    expect(laatsteVerzoek().pad).toBe('/music-lists/l1/reorder-titles');
    expect(laatsteVerzoek().body).toEqual({ titleOrder: ['b', 'a'] });
  });
});

describe('muziekstukken', () => {
  it('getMusicPieces zet de filters in de queryreeks', async () => {
    antwoordMet([]);
    await getMusicPieces({ search: 'mars & meer', instrumentId: 'i1', listId: 'l1' });

    const verzoek = laatsteVerzoek();
    expect(verzoek.pad).toBe('/music-pieces');
    expect(verzoek.query.get('search')).toBe('mars & meer');
    // De ampersand moet gecodeerd zijn, anders knipt de server de zoekterm af.
    // Axios codeert een spatie in een parameter als +, niet als %20.
    expect(verzoek.queryreeks).toContain('mars+%26+meer');
    expect(verzoek.query.get('instrumentId')).toBe('i1');
  });

  it('getMusicPieces stuurt zonder filters een kale queryreeks', async () => {
    antwoordMet([]);
    await getMusicPieces();

    expect(laatsteVerzoek().queryreeks).toBe('');
  });

  it('getMusicPiecesPaginated gebruikt hetzelfde pad met page en pageSize', async () => {
    antwoordMet({ data: [], total: 0, page: 1, pageSize: 25, totalPages: 0 });
    await getMusicPiecesPaginated({ page: 2, pageSize: 25, search: 'mars' });

    const verzoek = laatsteVerzoek();
    expect(verzoek.pad).toBe('/music-pieces');
    expect(verzoek.query.get('page')).toBe('2');
    expect(verzoek.query.get('pageSize')).toBe('25');
  });

  it('getMyMusicPieces en getSharedMusicPieces hebben eigen routes', async () => {
    antwoordMet([]);
    await getMyMusicPieces();
    expect(laatsteVerzoek().pad).toBe('/music-pieces/my-pieces');

    antwoordMet([]);
    await getSharedMusicPieces();
    expect(laatsteVerzoek().pad).toBe('/music-pieces/shared');
  });

  it('getMusicTitles filtert op zoekterm, lijst en genre', async () => {
    antwoordMet([]);
    await getMusicTitles({ search: 'mars', listId: 'l1', genreId: 'g1' });

    const verzoek = laatsteVerzoek();
    expect(verzoek.pad).toBe('/music-pieces/titles');
    expect(verzoek.query.get('genreId')).toBe('g1');
  });

  it('refreshInstrumentLinks doet een POST zonder body', async () => {
    antwoordMet({ updated: 1, alreadyLinked: 2, notFound: 0, total: 3 });
    await refreshInstrumentLinks();

    expect(laatsteVerzoek().methode).toBe('post');
    expect(laatsteVerzoek().pad).toBe('/music-pieces/refresh-instruments');
  });

  it('updateMusicPiece stuurt alleen de meegegeven velden', async () => {
    antwoordMet({});
    await updateMusicPiece('p1', { title: 'Nieuwe titel', isShared: true });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('put');
    expect(verzoek.pad).toBe('/music-pieces/p1');
    expect(verzoek.body).toEqual({ title: 'Nieuwe titel', isShared: true });
  });

  it('deleteMusicPiece en restoreMusicPiece horen bij elkaar', async () => {
    antwoordMet({});
    await deleteMusicPiece('p1');
    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/music-pieces/p1');

    antwoordMet({});
    await restoreMusicPiece('p1');
    expect(laatsteVerzoek().methode).toBe('post');
    expect(laatsteVerzoek().pad).toBe('/music-pieces/p1/restore');
  });

  it('deleteMusicPiecesBulk gebruikt een POST-route, geen DELETE', async () => {
    antwoordMet({ count: 3 });
    await deleteMusicPiecesBulk(['p1', 'p2', 'p3']);

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/music-pieces/bulk-delete');
    expect(verzoek.body).toEqual({ ids: ['p1', 'p2', 'p3'] });
  });

  it('bulkUpdatePieces stuurt ids en wijzigingen apart', async () => {
    antwoordMet({ message: 'ok', updated: 2 });
    await bulkUpdatePieces(['p1', 'p2'], { instrumentId: 'i1', addToListId: 'l1' });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('put');
    expect(verzoek.pad).toBe('/music-pieces/bulk');
    expect(verzoek.body).toEqual({ pieceIds: ['p1', 'p2'], updates: { instrumentId: 'i1', addToListId: 'l1' } });
  });

  it('bulkDeletePieces stuurt de ids in de body van de DELETE', async () => {
    antwoordMet({ message: 'ok', deleted: 2 });
    await bulkDeletePieces(['p1', 'p2']);

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('delete');
    expect(verzoek.pad).toBe('/music-pieces/bulk');
    expect(verzoek.body).toEqual({ pieceIds: ['p1', 'p2'] });
  });

  it('shareMusicPiece deelt met een vereniging', async () => {
    antwoordMet({});
    await shareMusicPiece('p1', 'v2');

    expect(laatsteVerzoek().pad).toBe('/music-pieces/p1/share');
    expect(laatsteVerzoek().body).toEqual({ associationId: 'v2' });
  });

  it('getYouTubeMeta zet de url in de queryreeks in plaats van in het pad', async () => {
    antwoordMet({ title: 't', author: 'a', thumbnailUrl: 'u', videoId: 'v' });
    await getYouTubeMeta('https://youtu.be/abc?t=30');

    const verzoek = laatsteVerzoek();
    expect(verzoek.pad).toBe('/music-pieces/youtube-meta');
    expect(verzoek.query.get('url')).toBe('https://youtu.be/abc?t=30');
    // De url zit vol tekens die de queryreeks zouden breken; die horen
    // gecodeerd te zijn.
    expect(verzoek.queryreeks).not.toContain('https://');
  });

  it('getTitleMeta codeert de titel in het pad', async () => {
    antwoordMet({ title: 'Sing, Sing, Sing' });
    await getTitleMeta('Sing, Sing, Sing');

    const verzoek = laatsteVerzoek();
    expect(verzoek.pad).toBe('/music-pieces/title-meta/Sing%2C%20Sing%2C%20Sing');
    expect(verzoek.queryreeks).toBe('');
  });

  it('getTitleMeta hangt een gecodeerde arrangeur aan de queryreeks', async () => {
    antwoordMet({ title: 'Mars' });
    await getTitleMeta('Mars', 'Jan & Piet');

    const verzoek = laatsteVerzoek();
    expect(verzoek.pad).toBe('/music-pieces/title-meta/Mars?arranger=Jan%20%26%20Piet');
    expect(verzoek.query.get('arranger')).toBe('Jan & Piet');
  });

  it('getTitleMeta laat de queryreeks weg bij een lege arrangeur', async () => {
    antwoordMet({ title: 'Mars' });
    await getTitleMeta('Mars', null);

    expect(laatsteVerzoek().pad).toBe('/music-pieces/title-meta/Mars');
  });

  it('updateTitleMeta gebruikt PUT op de vaste route', async () => {
    antwoordMet({ id: 't1' });
    await updateTitleMeta({ title: 'Mars', arranger: 'Jan', genreIds: ['g1'] });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('put');
    expect(verzoek.pad).toBe('/music-pieces/title-meta');
    expect(verzoek.body).toEqual({ title: 'Mars', arranger: 'Jan', genreIds: ['g1'] });
  });

  it('deleteTitleMp3 verwijdert de mp3 van een titel', async () => {
    antwoordMet({});
    await deleteTitleMp3('t1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/music-pieces/title-mp3/t1');
  });
});

describe('revokeBlobUrl', () => {
  it('geeft alleen blob-adressen vrij', () => {
    const vrijgeven = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    revokeBlobUrl('blob:http://localhost/abc');
    expect(vrijgeven).toHaveBeenCalledWith('blob:http://localhost/abc');

    // Een gewone url vrijgeven is zinloos en zou in sommige browsers een fout
    // opleveren; die moet er dus niet doorheen glippen.
    revokeBlobUrl('/api/music-pieces/mp3/stuk.mp3');
    expect(vrijgeven).toHaveBeenCalledTimes(1);
  });
});

describe('verenigingen en genres', () => {
  it('getAssociations en getCurrentAssociation', async () => {
    antwoordMet([]);
    await getAssociations();
    expect(laatsteVerzoek().pad).toBe('/associations');

    antwoordMet({ id: 'v1' });
    await getCurrentAssociation();
    expect(laatsteVerzoek().pad).toBe('/associations/current');
  });

  it('updateCurrentAssociation gebruikt PUT op /associations/current', async () => {
    antwoordMet({});
    await updateCurrentAssociation('Nieuwe naam');

    expect(laatsteVerzoek().methode).toBe('put');
    expect(laatsteVerzoek().pad).toBe('/associations/current');
    expect(laatsteVerzoek().body).toEqual({ name: 'Nieuwe naam' });
  });

  it('createAssociation maakt een nieuwe vereniging', async () => {
    antwoordMet({ id: 'v2' });
    await createAssociation('Fanfare');

    expect(laatsteVerzoek().methode).toBe('post');
    expect(laatsteVerzoek().body).toEqual({ name: 'Fanfare' });
  });

  it('de genre-routes gebruiken naam en id', async () => {
    antwoordMet([]);
    await getGenres();
    expect(laatsteVerzoek().pad).toBe('/genres');

    antwoordMet({ id: 'g1' });
    await createGenre('Mars');
    expect(laatsteVerzoek().body).toEqual({ name: 'Mars' });

    antwoordMet({});
    await updateGenre('g1', 'Marsen');
    expect(laatsteVerzoek().methode).toBe('put');
    expect(laatsteVerzoek().pad).toBe('/genres/g1');

    antwoordMet({});
    await deleteGenre('g1');
    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/genres/g1');
  });
});

describe('back-up', () => {
  it('getBackupInfo haalt de omvang op', async () => {
    antwoordMet({ database: { size: 1, sizeFormatted: '1 B' } });
    await getBackupInfo();

    expect(laatsteVerzoek().pad).toBe('/backup/info');
  });
});

describe('meldkamer', () => {
  it('getIssues filtert op status en stuk', async () => {
    antwoordMet([]);
    await getIssues({ status: 'open', pieceId: 'p1' });

    const verzoek = laatsteVerzoek();
    expect(verzoek.pad).toBe('/issues');
    expect(verzoek.query.get('status')).toBe('open');
    expect(verzoek.query.get('pieceId')).toBe('p1');
  });

  it('getMyIssues en getIssueStats hebben eigen routes', async () => {
    antwoordMet([]);
    await getMyIssues();
    expect(laatsteVerzoek().pad).toBe('/issues/my-issues');

    antwoordMet({ total: 0, open: 0, in_review: 0, resolved: 0, rejected: 0 });
    await getIssueStats();
    expect(laatsteVerzoek().pad).toBe('/issues/stats');
  });

  it('createIssue stuurt de melding als body', async () => {
    antwoordMet({ id: 'm1' });
    await createIssue({ musicPieceId: 'p1', pageNumber: 3, measureNumber: '12a', description: 'Maat ontbreekt' });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/issues');
    expect(verzoek.body).toEqual({
      musicPieceId: 'p1',
      pageNumber: 3,
      measureNumber: '12a',
      description: 'Maat ontbreekt',
    });
  });

  it('updateIssueStatus gebruikt PATCH op de status-deelroute', async () => {
    antwoordMet({ id: 'm1' });
    await updateIssueStatus('m1', 'resolved', 'Nieuwe partij geplaatst');

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('patch');
    expect(verzoek.pad).toBe('/issues/m1/status');
    expect(verzoek.body).toEqual({ status: 'resolved', resolutionNotes: 'Nieuwe partij geplaatst' });
  });

  it('deleteIssue verwijdert de melding', async () => {
    antwoordMet({});
    await deleteIssue('m1');
    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/issues/m1');
  });
});

describe('leningen', () => {
  it('getLoans filtert op status', async () => {
    antwoordMet([]);
    await getLoans({ status: 'active' });

    expect(laatsteVerzoek().pad).toBe('/loans');
    expect(laatsteVerzoek().query.get('status')).toBe('active');
  });

  it('createLoan stuurt de leengegevens', async () => {
    antwoordMet({ id: 'u1' });
    await createLoan({
      musicTitleId: 't1',
      borrowerName: 'Fanfare Oost',
      borrowerEmail: 'info@example.com',
      expectedReturn: '2026-09-01',
    });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/loans');
    expect(verzoek.body).toEqual({
      musicTitleId: 't1',
      borrowerName: 'Fanfare Oost',
      borrowerEmail: 'info@example.com',
      expectedReturn: '2026-09-01',
    });
  });

  it('updateLoan, returnLoan en deleteLoan gebruiken het leen-id', async () => {
    antwoordMet({ id: 'u1' });
    await updateLoan('u1', { notes: 'Verlengd' });
    expect(laatsteVerzoek().methode).toBe('put');
    expect(laatsteVerzoek().pad).toBe('/loans/u1');

    antwoordMet({ id: 'u1' });
    await returnLoan('u1');
    expect(laatsteVerzoek().methode).toBe('post');
    expect(laatsteVerzoek().pad).toBe('/loans/u1/return');

    antwoordMet({});
    await deleteLoan('u1');
    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/loans/u1');
  });
});

describe('activiteit', () => {
  it('getActivityStats geeft de periode mee', async () => {
    antwoordMet({ topPieces: [], recentActivity: [], userActivity: [] });
    await getActivityStats('month');

    expect(laatsteVerzoek().pad).toBe('/activity/stats');
    expect(laatsteVerzoek().query.get('period')).toBe('month');
  });

  it('logActivity stuurt soort, entiteit en id', async () => {
    antwoordMet({});
    await logActivity('download', 'music_piece', 'p1');

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/activity/log');
    expect(verzoek.body).toEqual({ actionType: 'download', entityType: 'music_piece', entityId: 'p1' });
  });

  // De backend kent geen /activity/recent. De route heet /activity/feed
  // (backend/src/routes/activity.ts). Een verzoek naar /activity/recent valt
  // in de notFoundHandler, dus het dashboardblokje "recente activiteit" krijgt
  // een 404 in plaats van gegevens.
  it('getRecentActivity vraagt de feed op, niet een niet-bestaande /recent', async () => {
    antwoordMet([]);
    await getRecentActivity(5);

    const verzoek = laatsteVerzoek();
    expect(verzoek.pad).toBe('/activity/feed');
    expect(verzoek.query.get('limit')).toBe('5');
  });

  it('getRecentActivity gebruikt vijf als standaardaantal', async () => {
    antwoordMet([]);
    await getRecentActivity();

    expect(laatsteVerzoek().query.get('limit')).toBe('5');
  });

  // De feed levert de kolomnamen uit de database; het beloofde type is
  // camelCase. Zonder omzetting is elk van deze vier velden `undefined` bij de
  // aanroeper, terwijl het type zegt dat ze er zijn - een leeg scherm zonder
  // enige foutmelding.
  it('getRecentActivity zet de kolomnamen van de feed om naar het beloofde type', async () => {
    antwoordMet([
      {
        id: 'a1',
        action_type: 'update',
        entity_type: 'music_title',
        entity_id: 't1',
        entity_name: 'Also sprach Zarathustra',
        created_at: '2026-08-22T09:00:00.000Z',
        user_name: 'Ria de Vries',
      },
    ]);

    const regels = await getRecentActivity();

    expect(regels).toEqual([
      {
        id: 'a1',
        actionType: 'update',
        entityType: 'music_title',
        entityName: 'Also sprach Zarathustra',
        createdAt: '2026-08-22T09:00:00.000Z',
      },
    ]);
  });

  // entity_name is in de feed een CASE die NULL oplevert zodra het geen
  // muziektitel of muziekstuk betreft. Het type zegt `entityName?`, dus dat
  // hoort undefined te worden en geen null.
  it('getRecentActivity maakt van een ontbrekende naam undefined en niet null', async () => {
    antwoordMet([
      {
        id: 'a2',
        action_type: 'create',
        entity_type: 'rehearsal',
        entity_id: 'r1',
        entity_name: null,
        created_at: '2026-08-22T10:00:00.000Z',
        user_name: 'Ria de Vries',
      },
    ]);

    const [regel] = await getRecentActivity();

    // Ook de rest van de regel wordt hier getoetst. Alleen `entityName` nakijken
    // zou niets bewijzen: bij de niet-omgezette vorm bestaat dat veld helemaal
    // niet en is het dus óók undefined, waardoor de test groen zou zijn terwijl
    // de omzetting ontbreekt.
    expect(regel).toEqual({
      id: 'a2',
      actionType: 'create',
      entityType: 'rehearsal',
      entityName: undefined,
      createdAt: '2026-08-22T10:00:00.000Z',
    });
  });

  // Een server die bij een fout een object in plaats van een lijst teruggeeft,
  // mag het dashboard niet laten omvallen op `data.map is not a function`.
  it('getRecentActivity geeft een lege lijst als het antwoord geen lijst is', async () => {
    antwoordMet({ error: 'Er ging iets mis.' });

    await expect(getRecentActivity()).resolves.toEqual([]);
  });
});

describe('instellingen', () => {
  it('getSettings en updateSettings gebruiken /settings', async () => {
    antwoordMet({ displayName: 'Harmonie' });
    await getSettings();
    expect(laatsteVerzoek().pad).toBe('/settings');

    antwoordMet({});
    await updateSettings({ displayName: 'Nieuwe naam' });
    expect(laatsteVerzoek().methode).toBe('put');
    expect(laatsteVerzoek().body).toEqual({ displayName: 'Nieuwe naam' });
  });

  it('removeLogo verwijdert het logo', async () => {
    antwoordMet({});
    await removeLogo();

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/settings/logo');
  });

  it('updateTheme verpakt het thema in een object', async () => {
    antwoordMet({});
    await updateTheme({ primaryColor: '#123456' } as never);

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('put');
    expect(verzoek.pad).toBe('/settings/theme');
    expect(verzoek.body).toEqual({ theme: { primaryColor: '#123456' } });
  });

  it('updateTheme kan het thema ook wissen', async () => {
    antwoordMet({});
    await updateTheme(null);

    expect(laatsteVerzoek().body).toEqual({ theme: null });
  });
});

describe('foutafhandeling van de dunne functies', () => {
  it('laat een 404 door in plaats van hem als leeg resultaat te verpakken', async () => {
    antwoordMetFout(404, { error: 'Lijst niet gevonden' });

    await expect(getMusicList('bestaat-niet')).rejects.toMatchObject({
      response: { status: 404, data: { error: 'Lijst niet gevonden' } },
    });
  });

  it('laat een validatiefout van de server door met de melding erbij', async () => {
    antwoordMetFout(400, { error: 'Naam is verplicht' });

    await expect(createGenre('')).rejects.toMatchObject({
      response: { status: 400, data: { error: 'Naam is verplicht' } },
    });
  });
});
