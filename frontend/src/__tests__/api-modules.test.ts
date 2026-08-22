/**
 * Tests voor de moduledelen van src/api.ts: repetities, Spond, Microsoft,
 * koppelingen met derden, apparatuur, uniformen, concerten en de Entra-sync.
 *
 * Ook hier gaat het om pad, methode, body en queryreeks. Elke route is
 * vergeleken met het bijbehorende bestand in backend/src/routes/. Waar de
 * frontend een route aanroept die de backend niet kent, staat dat er met zoveel
 * woorden bij - die tests leggen het huidige gedrag vast, ze keuren het niet goed.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { startNepserver, stopNepserver, antwoordMet, laatsteVerzoek } from './nepserver-api';
import {
  getRehearsals,
  getRehearsal,
  createRehearsal,
  updateRehearsal,
  deleteRehearsal,
  updateRehearsalPieces,
  getDefaultDays,
  addDefaultDay,
  updateDefaultDay,
  deleteDefaultDay,
  generateRehearsals,
  getAttendanceSummary,
  getUpcomingRehearsals,
  getSpondConfig,
  saveSpondConfig,
  removeSpondConfig,
  getSpondGroups,
  syncSpond,
  syncSpondRehearsal,
  getSpondOrchestraGroups,
  setSpondOrchestraGroup,
  getSpondMemberLinks,
  createSpondMemberLink,
  deleteSpondMemberLink,
  updateMyAttendance,
  getMyAttendanceStatus,
  getMicrosoftEnabled,
  getMicrosoftLoginUrl,
  microsoftCallback,
  getMicrosoftConfig,
  saveMicrosoftConfig,
  removeMicrosoftConfig,
  getSmtpConfig,
  saveSmtpConfig,
  removeSmtpConfig,
  testSmtpConfig,
  getTelegramConfig,
  saveTelegramConfig,
  deleteTelegramConfig,
  getWhatsAppConfig,
  saveWhatsAppConfig,
  deleteWhatsAppConfig,
  getChangelog,
  savePdfAsMusicPiece,
  searchMusicaInfo,
  getMusicaInfoDetail,
  searchImslp,
  getImslpWorkDetails,
  importFromImslp,
  getCloudImportConfig,
  importFromOneDrive,
  importFromGoogleDrive,
  getGoogleDriveSettings,
  updateGoogleDriveSettings,
  deleteGoogleDriveSettings,
  getEquipmentTypes,
  getMaintenanceAlerts,
  getEquipment,
  getEquipmentItem,
  createEquipment,
  updateEquipment,
  deleteEquipment,
  addEquipmentDamageLog,
  updateEquipmentDamageLog,
  deleteEquipmentDamageLog,
  createEquipmentLoan,
  returnEquipmentLoan,
  recordEquipmentMaintenance,
  getUniformItemTypes,
  searchUniformsBySize,
  getUniformAvailabilityBySize,
  getUniformItems,
  getUniformItem,
  createUniformItem,
  createUniformItemsBulk,
  updateUniformItem,
  deleteUniformItem,
  assignUniformItem,
  returnUniformItem,
  getUniformSets,
  getUniformSet,
  createUniformSet,
  updateUniformSet,
  deleteUniformSet,
  getUserUniforms,
  getConcertTypes,
  getAdminConcertTypes,
  createConcertType,
  updateConcertType,
  deleteConcertType,
  initDefaultConcertTypes,
  getConcertStatistics,
  getPieceHistory,
  getConcerts,
  getConcertYears,
  getConcert,
  createConcert,
  updateConcert,
  deleteConcert,
  addConcertProgramItem,
  updateConcertProgramItem,
  deleteConcertProgramItem,
  reorderConcertProgram,
  addConcertMedia,
  deleteConcertMedia,
  addConcertAttendance,
  addConcertAttendanceBulk,
  updateConcertAttendance,
  deleteConcertAttendance,
  getJobTitleMappings,
  createJobTitleMapping,
  updateJobTitleMapping,
  deleteJobTitleMapping,
  getEntraUsers,
  importEntraUsers,
  syncEntraUsers,
  syncEntraPhotos,
  getAuditLogs,
} from '../api';

beforeEach(() => startNepserver());
afterEach(() => stopNepserver());

describe('repetities', () => {
  it('getRehearsals stuurt alleen de opgegeven datumgrenzen mee', async () => {
    antwoordMet([]);
    await getRehearsals('2026-01-01', '2026-06-30');

    const verzoek = laatsteVerzoek();
    expect(verzoek.pad).toBe('/rehearsals');
    expect(verzoek.query.get('startDate')).toBe('2026-01-01');
    expect(verzoek.query.get('endDate')).toBe('2026-06-30');
  });

  it('getRehearsals laat lege grenzen helemaal weg', async () => {
    antwoordMet([]);
    await getRehearsals();
    expect(laatsteVerzoek().queryreeks).toBe('');

    antwoordMet([]);
    await getRehearsals(undefined, '2026-06-30');
    expect(laatsteVerzoek().queryreeks).toBe('endDate=2026-06-30');
  });

  it('getRehearsal, updateRehearsal en deleteRehearsal gebruiken het id', async () => {
    antwoordMet({ id: 'r1' });
    await getRehearsal('r1');
    expect(laatsteVerzoek().pad).toBe('/rehearsals/r1');

    antwoordMet({});
    await updateRehearsal('r1', { date: '2026-01-07', startTime: '20:00', endTime: '22:00' });
    expect(laatsteVerzoek().methode).toBe('put');
    expect(laatsteVerzoek().pad).toBe('/rehearsals/r1');

    antwoordMet({});
    await deleteRehearsal('r1');
    expect(laatsteVerzoek().methode).toBe('delete');
  });

  it('createRehearsal stuurt de repetitie als body', async () => {
    antwoordMet({ id: 'r1' });
    await createRehearsal({
      date: '2026-01-07',
      startTime: '20:00',
      endTime: '22:00',
      location: 'De Zaal',
      orchestraId: 'o1',
    });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/rehearsals');
    expect(verzoek.body).toEqual({
      date: '2026-01-07',
      startTime: '20:00',
      endTime: '22:00',
      location: 'De Zaal',
      orchestraId: 'o1',
    });
  });

  it('updateRehearsalPieces verpakt de stukken in een object', async () => {
    antwoordMet({});
    await updateRehearsalPieces('r1', [{ title: 'Mars', notes: 'vanaf maat 40' }]);

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('put');
    expect(verzoek.pad).toBe('/rehearsals/r1/pieces');
    expect(verzoek.body).toEqual({ pieces: [{ title: 'Mars', notes: 'vanaf maat 40' }] });
  });

  it('de standaarddagen hangen onder /rehearsals/default-days', async () => {
    antwoordMet([]);
    await getDefaultDays();
    expect(laatsteVerzoek().pad).toBe('/rehearsals/default-days');

    antwoordMet({ id: 'd1' });
    await addDefaultDay({ dayOfWeek: 3, startTime: '20:00', endTime: '22:00' });
    expect(laatsteVerzoek().methode).toBe('post');
    expect(laatsteVerzoek().body).toEqual({ dayOfWeek: 3, startTime: '20:00', endTime: '22:00' });

    antwoordMet({});
    await updateDefaultDay('d1', { dayOfWeek: 4, startTime: '19:30', endTime: '21:30' });
    expect(laatsteVerzoek().methode).toBe('put');
    expect(laatsteVerzoek().pad).toBe('/rehearsals/default-days/d1');

    antwoordMet({});
    await deleteDefaultDay('d1');
    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/rehearsals/default-days/d1');
  });

  it('generateRehearsals stuurt de periode als body', async () => {
    antwoordMet({ count: 20 });
    await generateRehearsals('2026-01-01', '2026-06-30');

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/rehearsals/generate');
    expect(verzoek.body).toEqual({ startDate: '2026-01-01', endDate: '2026-06-30' });
  });

  it('getAttendanceSummary stuurt het orkest alleen mee als het is opgegeven', async () => {
    antwoordMet({ members: [], rehearsalCount: 0, from: '', to: '' });
    await getAttendanceSummary('2026-01-01', '2026-06-30');
    expect(laatsteVerzoek().pad).toBe('/rehearsals/attendance/summary');
    expect(laatsteVerzoek().query.has('orchestraId')).toBe(false);

    antwoordMet({ members: [], rehearsalCount: 0, from: '', to: '' });
    await getAttendanceSummary('2026-01-01', '2026-06-30', 'o1');
    expect(laatsteVerzoek().query.get('orchestraId')).toBe('o1');
  });

  it('getUpcomingRehearsals gebruikt drie als standaardaantal', async () => {
    antwoordMet([]);
    await getUpcomingRehearsals();
    expect(laatsteVerzoek().pad).toBe('/rehearsals/upcoming');
    expect(laatsteVerzoek().query.get('limit')).toBe('3');

    antwoordMet([]);
    await getUpcomingRehearsals(10);
    expect(laatsteVerzoek().query.get('limit')).toBe('10');
  });
});

describe('Spond', () => {
  it('de configuratie kent ophalen, opslaan en wissen', async () => {
    antwoordMet({});
    await getSpondConfig();
    expect(laatsteVerzoek().pad).toBe('/spond/config');

    antwoordMet({});
    await saveSpondConfig({ username: 'jan', password: 'geheim', groupId: 'g1', syncEnabled: true });
    expect(laatsteVerzoek().methode).toBe('put');
    expect(laatsteVerzoek().body).toEqual({
      username: 'jan',
      password: 'geheim',
      groupId: 'g1',
      syncEnabled: true,
    });

    antwoordMet({});
    await removeSpondConfig();
    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/spond/config');
  });

  it('syncSpond synchroniseert alles, syncSpondRehearsal één repetitie', async () => {
    antwoordMet({});
    await syncSpond();
    expect(laatsteVerzoek().methode).toBe('post');
    expect(laatsteVerzoek().pad).toBe('/spond/sync');

    antwoordMet({ message: 'ok', attendanceCount: 12 });
    await syncSpondRehearsal('r1');
    expect(laatsteVerzoek().pad).toBe('/spond/sync/r1');
  });

  it('getSpondGroups haalt de groepen op', async () => {
    antwoordMet([]);
    await getSpondGroups();
    expect(laatsteVerzoek().pad).toBe('/spond/groups');
  });

  it('setSpondOrchestraGroup kan de koppeling ook wissen met null', async () => {
    antwoordMet([]);
    await getSpondOrchestraGroups();
    expect(laatsteVerzoek().pad).toBe('/spond/orchestra-groups');

    antwoordMet({});
    await setSpondOrchestraGroup('o1', 'g1', 'Harmonie');
    expect(laatsteVerzoek().methode).toBe('put');
    expect(laatsteVerzoek().pad).toBe('/spond/orchestra-groups/o1');
    expect(laatsteVerzoek().body).toEqual({ spondGroupId: 'g1', spondGroupName: 'Harmonie' });

    antwoordMet({});
    await setSpondOrchestraGroup('o1', null);
    expect(laatsteVerzoek().body).toEqual({ spondGroupId: null });
  });

  it('de ledenkoppelingen gebruiken /spond/member-links', async () => {
    antwoordMet([]);
    await getSpondMemberLinks();
    expect(laatsteVerzoek().pad).toBe('/spond/member-links');

    antwoordMet({});
    await createSpondMemberLink('sm1', 'u1', 'Jan Jansen');
    expect(laatsteVerzoek().methode).toBe('post');
    expect(laatsteVerzoek().body).toEqual({ spondMemberId: 'sm1', userId: 'u1', spondMemberName: 'Jan Jansen' });

    antwoordMet({});
    await deleteSpondMemberLink('k1');
    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/spond/member-links/k1');
  });

  it('updateMyAttendance en getMyAttendanceStatus horen bij één repetitie', async () => {
    antwoordMet({ message: 'ok', status: 'accepted', spondSynced: true });
    await updateMyAttendance('r1', true);
    expect(laatsteVerzoek().methode).toBe('put');
    expect(laatsteVerzoek().pad).toBe('/spond/attendance/r1');
    expect(laatsteVerzoek().body).toEqual({ accepted: true });

    antwoordMet({ status: 'accepted', canSyncToSpond: true });
    await getMyAttendanceStatus('r1');
    expect(laatsteVerzoek().pad).toBe('/spond/attendance/r1/my-status');
  });
});

describe('Microsoft-aanmelding', () => {
  it('getMicrosoftEnabled stuurt de slug alleen mee als die er is', async () => {
    antwoordMet({ enabled: true });
    await getMicrosoftEnabled();
    expect(laatsteVerzoek().pad).toBe('/auth/microsoft/enabled');
    expect(laatsteVerzoek().queryreeks).toBe('');

    antwoordMet({ enabled: true });
    await getMicrosoftEnabled('harmonie');
    expect(laatsteVerzoek().query.get('slug')).toBe('harmonie');
  });

  it('getMicrosoftLoginUrl haalt het aanmeldadres op, met of zonder slug', async () => {
    antwoordMet({ authUrl: 'https://login.microsoftonline.com/...' });
    await getMicrosoftLoginUrl('harmonie');

    expect(laatsteVerzoek().pad).toBe('/auth/microsoft/login');
    expect(laatsteVerzoek().query.get('slug')).toBe('harmonie');

    // Zonder slug gaat er helemaal geen params-object mee; de queryreeks moet
    // dan leeg zijn en niet 'slug=undefined' bevatten.
    antwoordMet({ authUrl: 'https://login.microsoftonline.com/...' });
    await getMicrosoftLoginUrl();
    expect(laatsteVerzoek().queryreeks).toBe('');
  });

  it('microsoftCallback wisselt code en state om voor een sessie', async () => {
    antwoordMet({ token: 'jwt' });
    await microsoftCallback('code-123', 'state-456');

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/auth/microsoft/callback');
    expect(verzoek.body).toEqual({ code: 'code-123', state: 'state-456' });
  });

  it('de configuratie kent ophalen, opslaan en wissen', async () => {
    antwoordMet({});
    await getMicrosoftConfig();
    expect(laatsteVerzoek().pad).toBe('/auth/microsoft/config');

    antwoordMet({});
    await saveMicrosoftConfig({ clientId: 'c', clientSecret: 's', tenantId: 't', enabled: true });
    expect(laatsteVerzoek().methode).toBe('put');

    antwoordMet({});
    await removeMicrosoftConfig();
    expect(laatsteVerzoek().methode).toBe('delete');
  });
});

describe('koppelingen met derden', () => {
  it('de SMTP-instellingen hangen onder /settings/smtp', async () => {
    antwoordMet({});
    await getSmtpConfig();
    expect(laatsteVerzoek().pad).toBe('/settings/smtp');

    antwoordMet({});
    await saveSmtpConfig({
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      user: 'jan',
      from: 'noreply@example.com',
      enabled: true,
    });
    expect(laatsteVerzoek().methode).toBe('put');
    expect((laatsteVerzoek().body as Record<string, unknown>).port).toBe(587);

    antwoordMet({});
    await removeSmtpConfig();
    expect(laatsteVerzoek().methode).toBe('delete');

    antwoordMet({ message: 'verstuurd' });
    await testSmtpConfig();
    expect(laatsteVerzoek().methode).toBe('post');
    expect(laatsteVerzoek().pad).toBe('/settings/smtp/test');
  });

  it('Telegram en WhatsApp gebruiken hun eigen instellingsroutes', async () => {
    antwoordMet({});
    await getTelegramConfig();
    expect(laatsteVerzoek().pad).toBe('/settings/telegram');

    antwoordMet({ message: 'ok' });
    await saveTelegramConfig({ enabled: true });
    expect(laatsteVerzoek().methode).toBe('put');
    expect(laatsteVerzoek().body).toEqual({ enabled: true });

    antwoordMet({ message: 'ok' });
    await deleteTelegramConfig();
    expect(laatsteVerzoek().methode).toBe('delete');

    antwoordMet({});
    await getWhatsAppConfig();
    expect(laatsteVerzoek().pad).toBe('/settings/whatsapp');

    antwoordMet({ message: 'ok' });
    await saveWhatsAppConfig({ provider: 'meta', enabled: true, meta: { phoneNumberId: '123' } });
    expect(laatsteVerzoek().body).toEqual({ provider: 'meta', enabled: true, meta: { phoneNumberId: '123' } });

    antwoordMet({ message: 'ok' });
    await deleteWhatsAppConfig();
    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/settings/whatsapp');
  });

  it('getChangelog geeft de taal mee', async () => {
    antwoordMet({ content: '# Changelog' });
    await getChangelog('nl');

    expect(laatsteVerzoek().pad).toBe('/changelog');
    expect(laatsteVerzoek().query.get('lang')).toBe('nl');
  });

  it('savePdfAsMusicPiece plakt de metagegevens plat naast pad en bestandsnaam', async () => {
    antwoordMet({ success: true, id: 'p1', title: 'Mars', instrumentFound: true });
    await savePdfAsMusicPiece('/tmp/x.pdf', 'x.pdf', 'l1', { title: 'Mars', instrumentId: 'i1' });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/pdf-tools/save-as-music-piece');
    expect(verzoek.body).toEqual({
      filepath: '/tmp/x.pdf',
      filename: 'x.pdf',
      listId: 'l1',
      title: 'Mars',
      instrumentId: 'i1',
    });
  });

  it('searchMusicaInfo gebruikt q als parameternaam', async () => {
    antwoordMet({ query: 'mars', resultCount: 0, results: [], searchUrl: '' });
    await searchMusicaInfo('mars');

    const verzoek = laatsteVerzoek();
    expect(verzoek.pad).toBe('/musicainfo/search');
    expect(verzoek.query.get('q')).toBe('mars');
  });

  it('getMusicaInfoDetail zoekt op artikelnummer', async () => {
    antwoordMet({});
    await getMusicaInfoDetail('12345');

    expect(laatsteVerzoek().pad).toBe('/musicainfo/detail');
    expect(laatsteVerzoek().query.get('artnr')).toBe('12345');
  });

  it('searchImslp stuurt de componist alleen mee als die is opgegeven', async () => {
    antwoordMet({ works: [], totalCount: 0, searchUrl: '' });
    await searchImslp('symphony');
    expect(laatsteVerzoek().query.has('composer')).toBe(false);

    antwoordMet({ works: [], totalCount: 0, searchUrl: '' });
    await searchImslp('symphony', 'Beethoven');
    expect(laatsteVerzoek().query.get('q')).toBe('symphony');
    expect(laatsteVerzoek().query.get('composer')).toBe('Beethoven');
  });

  it('getImslpWorkDetails en importFromImslp gebruiken hun eigen route', async () => {
    antwoordMet({});
    await getImslpWorkDetails('w1');
    expect(laatsteVerzoek().pad).toBe('/imslp/work/w1');

    antwoordMet({});
    await importFromImslp({ fileUrl: 'https://imslp.org/x.pdf', title: 'Symfonie 5' });
    expect(laatsteVerzoek().methode).toBe('post');
    expect(laatsteVerzoek().pad).toBe('/imslp/import');
    expect(laatsteVerzoek().body).toEqual({ fileUrl: 'https://imslp.org/x.pdf', title: 'Symfonie 5' });
  });

  it('de cloudimport kent OneDrive en Google Drive apart', async () => {
    antwoordMet({});
    await getCloudImportConfig();
    expect(laatsteVerzoek().pad).toBe('/cloud-import/config');

    antwoordMet({ message: 'ok', uploaded: [] });
    await importFromOneDrive({ files: [{ id: 'f1', name: 'x.pdf' }], accessToken: 'at', listId: 'l1' });
    expect(laatsteVerzoek().pad).toBe('/cloud-import/onedrive');
    expect(laatsteVerzoek().body).toEqual({
      files: [{ id: 'f1', name: 'x.pdf' }],
      accessToken: 'at',
      listId: 'l1',
    });

    antwoordMet({ message: 'ok', uploaded: [] });
    await importFromGoogleDrive({ files: [], accessToken: 'at' });
    expect(laatsteVerzoek().pad).toBe('/cloud-import/google-drive');
  });

  it('de Google Drive-instellingen hangen onder /settings/google-drive', async () => {
    antwoordMet({});
    await getGoogleDriveSettings();
    expect(laatsteVerzoek().pad).toBe('/settings/google-drive');

    antwoordMet({ message: 'ok' });
    await updateGoogleDriveSettings({ clientId: 'c', apiKey: 'k', enabled: true });
    expect(laatsteVerzoek().methode).toBe('put');

    antwoordMet({ message: 'ok' });
    await deleteGoogleDriveSettings();
    expect(laatsteVerzoek().methode).toBe('delete');
  });
});

/**
 * Apparatuur.
 *
 * LET OP: dit hele blok is uit de pas gelopen met backend/src/routes/equipment.ts.
 * De backend kent daar:
 *   GET/POST /categories, DELETE /categories/:id
 *   GET /, GET /loans, GET /stats, GET /types, GET /:id
 *   POST /, PATCH /:id, DELETE /:id
 *   POST /loans, PATCH /loans/:id/return
 *   POST /:id/maintenance
 *   GET/POST /:id/damage, PATCH/DELETE /:id/damage/:reportId
 *
 * De functies hieronder roepen deels routes aan die daar niet tussen staan, en
 * de velden in de body zijn ook andere (de backend wil name en equipmentType,
 * de frontend stuurt instrumentType en brandModel). De tests leggen vast wat er
 * nu verstuurd wordt; ze zeggen niets over of dat goed is.
 */
describe('apparatuur', () => {
  it('getEquipmentTypes en getEquipment komen wel bij de backend aan', async () => {
    antwoordMet([]);
    await getEquipmentTypes();
    expect(laatsteVerzoek().pad).toBe('/equipment/types');

    antwoordMet({ data: [], total: 0, page: 1, limit: 25 });
    await getEquipment({ search: 'trompet', status: 'available', type: 'instrument' });
    const verzoek = laatsteVerzoek();
    expect(verzoek.pad).toBe('/equipment');
    expect(verzoek.query.get('search')).toBe('trompet');
    expect(verzoek.query.get('status')).toBe('available');

    antwoordMet({ id: 'e1' });
    await getEquipmentItem('e1');
    expect(laatsteVerzoek().pad).toBe('/equipment/e1');

    antwoordMet({});
    await deleteEquipment('e1');
    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/equipment/e1');
  });

  // /equipment/maintenance-alerts bestaat niet. Express matcht dit op GET /:id
  // met id 'maintenance-alerts' en antwoordt met 404 'Apparatuur niet
  // gevonden'. Het onderhoudsblok blijft dus leeg.
  it('getMaintenanceAlerts vraagt een route op die de backend niet kent', async () => {
    antwoordMet([]);
    await getMaintenanceAlerts();

    expect(laatsteVerzoek().pad).toBe('/equipment/maintenance-alerts');
  });

  // De backend verwacht { name, equipmentType, ... }; dit stuurt
  // { instrumentType, brandModel, ... } en loopt daar op een 400 vast.
  it('createEquipment stuurt de oude veldnamen', async () => {
    antwoordMet({ id: 'e1' });
    await createEquipment({ instrumentType: 'Trompet', brandModel: 'Yamaha', status: 'available' });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/equipment');
    expect(verzoek.body).toEqual({ instrumentType: 'Trompet', brandModel: 'Yamaha', status: 'available' });
  });

  // De backend kent alleen PATCH /:id, geen PUT. Een wijziging aan apparatuur
  // komt dus nooit aan.
  it('updateEquipment gebruikt PUT waar de backend PATCH verwacht', async () => {
    antwoordMet({});
    await updateEquipment('e1', { notes: 'Klep hersteld' });

    expect(laatsteVerzoek().methode).toBe('put');
    expect(laatsteVerzoek().pad).toBe('/equipment/e1');
  });

  // De backend noemt dit /:id/damage, niet /:id/damage-logs.
  it('de schadelogboeken gebruiken een pad dat de backend niet kent', async () => {
    antwoordMet({ id: 's1' });
    await addEquipmentDamageLog('e1', { date: '2026-02-01', description: 'Deuk in de beker' });
    expect(laatsteVerzoek().methode).toBe('post');
    expect(laatsteVerzoek().pad).toBe('/equipment/e1/damage-logs');

    antwoordMet({});
    await updateEquipmentDamageLog('e1', 's1', { status: 'repaired' });
    expect(laatsteVerzoek().methode).toBe('put');
    expect(laatsteVerzoek().pad).toBe('/equipment/e1/damage-logs/s1');

    antwoordMet({});
    await deleteEquipmentDamageLog('e1', 's1');
    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/equipment/e1/damage-logs/s1');
  });

  // De backend heeft POST /equipment/loans met equipmentId in de body en
  // PATCH /equipment/loans/:id/return. Beide aanroepen hieronder lopen dood.
  it('de uitleenroutes zetten het apparaat-id in het pad in plaats van in de body', async () => {
    antwoordMet({ id: 'u1' });
    await createEquipmentLoan('e1', { userId: 'u1', loanDate: '2026-02-01' });
    expect(laatsteVerzoek().pad).toBe('/equipment/e1/loans');
    expect(laatsteVerzoek().body).toEqual({ userId: 'u1', loanDate: '2026-02-01' });

    antwoordMet({});
    await returnEquipmentLoan('e1', 'u1', { returnDate: '2026-03-01' });
    expect(laatsteVerzoek().methode).toBe('post');
    expect(laatsteVerzoek().pad).toBe('/equipment/e1/loans/u1/return');
  });

  // De backend noemt dit /:id/maintenance.
  it('recordEquipmentMaintenance gebruikt /record-maintenance', async () => {
    antwoordMet({ nextMaintenanceDate: '2026-08-01' });
    await recordEquipmentMaintenance('e1', { date: '2026-02-01', notes: 'Groot onderhoud' });

    expect(laatsteVerzoek().pad).toBe('/equipment/e1/record-maintenance');
  });
});

describe('uniformen', () => {
  it('de zoekroutes gebruiken hun eigen deelpaden', async () => {
    antwoordMet([]);
    await getUniformItemTypes();
    expect(laatsteVerzoek().pad).toBe('/uniforms/item-types');

    antwoordMet([]);
    await searchUniformsBySize('52', 'jas');
    expect(laatsteVerzoek().pad).toBe('/uniforms/size-search');
    expect(laatsteVerzoek().query.get('size')).toBe('52');
    expect(laatsteVerzoek().query.get('itemType')).toBe('jas');

    antwoordMet([]);
    await getUniformAvailabilityBySize('jas');
    expect(laatsteVerzoek().pad).toBe('/uniforms/available-by-size');
    expect(laatsteVerzoek().query.get('itemType')).toBe('jas');
  });

  it('de kledingstukken hangen onder /uniforms/items', async () => {
    antwoordMet({ data: [], total: 0, page: 1, limit: 25 });
    await getUniformItems({ search: 'jas', status: 'available', itemType: 'jas', size: '52' });
    expect(laatsteVerzoek().pad).toBe('/uniforms/items');
    expect(laatsteVerzoek().query.get('size')).toBe('52');

    antwoordMet({ id: 'k1' });
    await getUniformItem('k1');
    expect(laatsteVerzoek().pad).toBe('/uniforms/items/k1');

    antwoordMet({ id: 'k1' });
    await createUniformItem({ itemType: 'jas', sizeStandard: '52', color: 'blauw' });
    expect(laatsteVerzoek().methode).toBe('post');
    expect(laatsteVerzoek().body).toEqual({ itemType: 'jas', sizeStandard: '52', color: 'blauw' });

    antwoordMet({ ids: ['k1', 'k2'], count: 2 });
    await createUniformItemsBulk({ itemType: 'jas', count: 2 });
    expect(laatsteVerzoek().pad).toBe('/uniforms/items/bulk');
    expect(laatsteVerzoek().body).toEqual({ itemType: 'jas', count: 2 });

    antwoordMet({});
    await updateUniformItem('k1', { condition: 'fair' });
    expect(laatsteVerzoek().methode).toBe('put');
    expect(laatsteVerzoek().pad).toBe('/uniforms/items/k1');

    antwoordMet({});
    await deleteUniformItem('k1');
    expect(laatsteVerzoek().methode).toBe('delete');
  });

  it('uitgeven en innemen zijn beide een POST op het kledingstuk', async () => {
    antwoordMet({ id: 't1' });
    await assignUniformItem('k1', { userId: 'u1', assignedDate: '2026-02-01' });
    expect(laatsteVerzoek().pad).toBe('/uniforms/items/k1/assign');
    expect(laatsteVerzoek().body).toEqual({ userId: 'u1', assignedDate: '2026-02-01' });

    antwoordMet({});
    await returnUniformItem('k1', { returnedDate: '2026-06-01', conditionAtReturn: 'good' });
    expect(laatsteVerzoek().methode).toBe('post');
    expect(laatsteVerzoek().pad).toBe('/uniforms/items/k1/return');
  });

  it('de sets en de kledingstukken per lid hebben eigen routes', async () => {
    antwoordMet([]);
    await getUniformSets();
    expect(laatsteVerzoek().pad).toBe('/uniforms/sets');

    antwoordMet({ id: 's1' });
    await getUniformSet('s1');
    expect(laatsteVerzoek().pad).toBe('/uniforms/sets/s1');

    antwoordMet({ id: 's1' });
    await createUniformSet({ name: 'Gala', requirements: [{ itemType: 'jas', quantity: 1 }] });
    expect(laatsteVerzoek().body).toEqual({ name: 'Gala', requirements: [{ itemType: 'jas', quantity: 1 }] });

    antwoordMet({});
    await updateUniformSet('s1', { name: 'Gala 2026' });
    expect(laatsteVerzoek().methode).toBe('put');

    antwoordMet({});
    await deleteUniformSet('s1');
    expect(laatsteVerzoek().methode).toBe('delete');

    antwoordMet([]);
    await getUserUniforms('u1');
    expect(laatsteVerzoek().pad).toBe('/uniforms/user/u1');
  });
});

describe('concerten', () => {
  it('de soortenlijsten zitten op twee verschillende routes', async () => {
    // /concerts/types levert de keuzelijsten voor het formulier,
    // /concerts/concert-types is het beheerscherm. Ze verwisselen levert een
    // leeg keuzemenu op zonder foutmelding.
    antwoordMet({ concertTypes: [], mediaTypes: [] });
    await getConcertTypes();
    expect(laatsteVerzoek().pad).toBe('/concerts/types');

    antwoordMet({ types: [], defaults: [] });
    await getAdminConcertTypes();
    expect(laatsteVerzoek().pad).toBe('/concerts/concert-types');
  });

  it('de beheerroutes voor concertsoorten kennen aanmaken, wijzigen en wissen', async () => {
    antwoordMet({ id: 'ct1', message: 'ok' });
    await createConcertType('gala', 'Galaconcert', 3);
    expect(laatsteVerzoek().methode).toBe('post');
    expect(laatsteVerzoek().body).toEqual({ value: 'gala', label: 'Galaconcert', sortOrder: 3 });

    antwoordMet({ message: 'ok' });
    await updateConcertType('ct1', { label: 'Gala' });
    expect(laatsteVerzoek().methode).toBe('put');
    expect(laatsteVerzoek().pad).toBe('/concerts/concert-types/ct1');

    antwoordMet({ message: 'ok' });
    await deleteConcertType('ct1');
    expect(laatsteVerzoek().methode).toBe('delete');

    antwoordMet({ message: 'ok' });
    await initDefaultConcertTypes();
    expect(laatsteVerzoek().methode).toBe('post');
    expect(laatsteVerzoek().pad).toBe('/concerts/concert-types/init-defaults');
  });

  it('getPieceHistory codeert de titel in het pad', async () => {
    antwoordMet({});
    await getPieceHistory('Sing, Sing, Sing');

    expect(laatsteVerzoek().pad).toBe('/concerts/piece-history/Sing%2C%20Sing%2C%20Sing');
  });

  it('getConcerts, getConcertYears en getConcertStatistics', async () => {
    antwoordMet({ data: [], total: 0, page: 1, limit: 25 });
    await getConcerts({ search: 'nieuwjaar', year: '2026', concertType: 'gala' });
    expect(laatsteVerzoek().pad).toBe('/concerts');
    expect(laatsteVerzoek().query.get('year')).toBe('2026');

    antwoordMet([]);
    await getConcertYears();
    expect(laatsteVerzoek().pad).toBe('/concerts/years');

    antwoordMet({});
    await getConcertStatistics();
    expect(laatsteVerzoek().pad).toBe('/concerts/statistics');
  });

  it('een concert aanmaken, wijzigen, ophalen en verwijderen', async () => {
    antwoordMet({ id: 'c1' });
    await createConcert({ name: 'Nieuwjaarsconcert', date: '2026-01-10', location: 'De Kegel' });
    expect(laatsteVerzoek().methode).toBe('post');
    expect(laatsteVerzoek().body).toEqual({
      name: 'Nieuwjaarsconcert',
      date: '2026-01-10',
      location: 'De Kegel',
    });

    antwoordMet({ id: 'c1' });
    await getConcert('c1');
    expect(laatsteVerzoek().pad).toBe('/concerts/c1');

    antwoordMet({});
    await updateConcert('c1', { notes: 'Zaal een uur eerder open' });
    expect(laatsteVerzoek().methode).toBe('put');

    antwoordMet({});
    await deleteConcert('c1');
    expect(laatsteVerzoek().methode).toBe('delete');
  });

  it('de programmaonderdelen hangen onder het concert', async () => {
    antwoordMet({ id: 'pr1' });
    await addConcertProgramItem('c1', { title: 'Mars', sortOrder: 1 });
    expect(laatsteVerzoek().pad).toBe('/concerts/c1/program');

    antwoordMet({});
    await updateConcertProgramItem('c1', 'pr1', { notes: 'met solist' });
    expect(laatsteVerzoek().methode).toBe('put');
    expect(laatsteVerzoek().pad).toBe('/concerts/c1/program/pr1');

    antwoordMet({});
    await deleteConcertProgramItem('c1', 'pr1');
    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/concerts/c1/program/pr1');

    antwoordMet({});
    await reorderConcertProgram('c1', [{ id: 'pr2', sortOrder: 1 }]);
    expect(laatsteVerzoek().methode).toBe('put');
    expect(laatsteVerzoek().pad).toBe('/concerts/c1/program/reorder');
    expect(laatsteVerzoek().body).toEqual({ items: [{ id: 'pr2', sortOrder: 1 }] });
  });

  it('media en aanwezigheid hangen ook onder het concert', async () => {
    antwoordMet({ id: 'm1' });
    await addConcertMedia('c1', { mediaType: 'photo', url: 'https://example.com/f.jpg' });
    expect(laatsteVerzoek().pad).toBe('/concerts/c1/media');

    antwoordMet({});
    await deleteConcertMedia('c1', 'm1');
    expect(laatsteVerzoek().pad).toBe('/concerts/c1/media/m1');

    antwoordMet({ id: 'a1' });
    await addConcertAttendance('c1', { memberName: 'Jan Jansen', instrumentPlayed: 'Trompet' });
    expect(laatsteVerzoek().pad).toBe('/concerts/c1/attendance');

    antwoordMet({ ids: ['a1'], count: 1 });
    await addConcertAttendanceBulk('c1', ['u1', 'u2']);
    expect(laatsteVerzoek().pad).toBe('/concerts/c1/attendance/bulk');
    expect(laatsteVerzoek().body).toEqual({ userIds: ['u1', 'u2'] });

    antwoordMet({});
    await updateConcertAttendance('c1', 'a1', { notes: 'tweede helft' });
    expect(laatsteVerzoek().methode).toBe('put');
    expect(laatsteVerzoek().pad).toBe('/concerts/c1/attendance/a1');

    antwoordMet({});
    await deleteConcertAttendance('c1', 'a1');
    expect(laatsteVerzoek().methode).toBe('delete');
  });
});

describe('Entra-synchronisatie', () => {
  it('de functietoewijzingen hangen onder /entra/mappings', async () => {
    antwoordMet([]);
    await getJobTitleMappings();
    expect(laatsteVerzoek().pad).toBe('/entra/mappings');

    antwoordMet({ id: 'k1', message: 'ok' });
    await createJobTitleMapping({ jobTitle: 'Trompettist', instrumentId: 'i1' });
    expect(laatsteVerzoek().methode).toBe('post');
    expect(laatsteVerzoek().body).toEqual({ jobTitle: 'Trompettist', instrumentId: 'i1' });

    antwoordMet({});
    await updateJobTitleMapping('k1', 'i2');
    expect(laatsteVerzoek().methode).toBe('put');
    expect(laatsteVerzoek().pad).toBe('/entra/mappings/k1');
    expect(laatsteVerzoek().body).toEqual({ instrumentId: 'i2' });

    antwoordMet({});
    await deleteJobTitleMapping('k1');
    expect(laatsteVerzoek().methode).toBe('delete');
  });

  it('de gebruikersroutes kennen ophalen, importeren en synchroniseren', async () => {
    antwoordMet({ users: [] });
    await getEntraUsers();
    expect(laatsteVerzoek().pad).toBe('/entra/users');

    antwoordMet({ message: 'ok', imported: 2, skipped: 0, errors: [] });
    await importEntraUsers(['e1', 'e2']);
    expect(laatsteVerzoek().pad).toBe('/entra/users/import');
    expect(laatsteVerzoek().body).toEqual({ userIds: ['e1', 'e2'] });

    // createNew staat standaard uit; dat verschil bepaalt of de sync nieuwe
    // leden aanmaakt of alleen bestaande bijwerkt.
    antwoordMet({ message: 'ok', updated: 1, created: 0, skipped: 0 });
    await syncEntraUsers();
    expect(laatsteVerzoek().body).toEqual({ createNew: false });

    antwoordMet({ message: 'ok', updated: 1, created: 1, skipped: 0 });
    await syncEntraUsers(true);
    expect(laatsteVerzoek().body).toEqual({ createNew: true });

    antwoordMet({ message: 'ok', synced: 1, skipped: 0, failed: 0 });
    await syncEntraPhotos();
    expect(laatsteVerzoek().methode).toBe('post');
    expect(laatsteVerzoek().pad).toBe('/entra/sync-photos');
  });
});

describe('auditlogboek', () => {
  it('getAuditLogs geeft alle filters mee als queryreeks', async () => {
    antwoordMet({ logs: [], total: 0, page: 1, pageSize: 25 });
    await getAuditLogs({
      page: 2,
      pageSize: 25,
      action: 'delete',
      entityType: 'music_piece',
      userId: 'u1',
      dateFrom: '2026-01-01',
      dateTo: '2026-02-01',
    });

    const verzoek = laatsteVerzoek();
    expect(verzoek.pad).toBe('/audit-logs');
    expect(verzoek.query.get('action')).toBe('delete');
    expect(verzoek.query.get('entityType')).toBe('music_piece');
    expect(verzoek.query.get('dateFrom')).toBe('2026-01-01');
  });
});
