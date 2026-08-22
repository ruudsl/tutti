/**
 * Tests voor het laatste deel van src/api.ts: opstelling, onboarding,
 * favorieten, oefenen, recent bekeken, annotaties, sessies, agenda,
 * meldingskanalen, streaming, kaartverkoop, gastenlijst, betaalinstellingen,
 * kaartoverdracht, mislukte imports, seizoenen, feestdagen en de podiumplot.
 *
 * Pad, methode, body en queryreeks per functie, vergeleken met de routes in
 * backend/src/routes/.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { startNepserver, stopNepserver, antwoordMet, antwoordMetFout, laatsteVerzoek } from './nepserver-api';
import {
  getSeatingSections,
  createDefaultSeatingLayout,
  createSeatingSection,
  updateSeatingSection,
  deleteSeatingSection,
  deleteAllSeatingSections,
  getSeatingAssignments,
  createSeatingAssignment,
  updateSeatingAssignment,
  deleteSeatingAssignment,
  bulkUpdateSeatingAssignments,
  getSeatingNeighbors,
  createSeatingNeighbor,
  deleteSeatingNeighbor,
  getRehearsalSeating,
  generateRehearsalSeating,
  updateRehearsalSeat,
  getSeatingChart,
  getSeatingNotificationSettings,
  saveSeatingNotificationSettings,
  deleteSeatingNotificationSettings,
  getSeatingNotificationLogs,
  sendSeatingNotification,
  testTwilioConnection,
  onboardMember,
  getM365GroupMappings,
  createM365GroupMapping,
  updateM365GroupMapping,
  deleteM365GroupMapping,
  getInstrumentJobTitleMappings,
  createInstrumentJobTitleMapping,
  updateInstrumentJobTitleMapping,
  deleteInstrumentJobTitleMapping,
  getPendingSpondLinks,
  deletePendingSpondLink,
  getOnboardingTasks,
  retryEmailForwarding,
  offboardMember,
  reactivateMember,
  getInactiveMembers,
  getFavorites,
  addFavorite,
  removeFavorite,
  checkFavorite,
  getPracticeLogs,
  getPracticeStats,
  logPractice,
  deletePracticeLog,
  getRecentViews,
  recordView,
  clearRecentViews,
  getAnnotations,
  createAnnotation,
  updateAnnotation,
  deleteAnnotation,
  deleteAllAnnotations,
  getSessions,
  revokeSession,
  revokeAllSessions,
  getCalendarSettings,
  updateCalendarSettings,
  regenerateCalendarFeed,
  startGoogleAuth,
  disconnectGoogle,
  syncGoogleCalendar,
  getNotificationChannels,
  getNotificationPreferences,
  updateNotificationPreferences,
  getTelegramLinkUrl,
  getTelegramStatus,
  unlinkTelegram,
  linkWhatsApp,
  verifyWhatsApp,
  getWhatsAppStatus,
  unlinkWhatsApp,
  getStreamingStatus,
  searchStreamingTracks,
  getStreamingLinks,
  updateStreamingLinks,
  deleteStreamingLink,
  getConcertTickets,
  createTicketOrder,
  getTicketOrder,
  payTicketOrder,
  getTicketByCode,
  validateTicket,
  getMyTickets,
  createTicketType,
  updateTicketType,
  deleteTicketType,
  getConcertTicketStats,
  getConcertAttendees,
  getSeatHeatmapData,
  cancelTicket,
  refundOrder,
  mockPayment,
  getTicketDashboard,
  getTicketSales,
  getPaymentDetails,
  getSalesPredictions,
  getScannedTickets,
  getGuestList,
  addGuest,
  updateGuest,
  deleteGuest,
  sendGuestTickets,
  sendAllGuestTickets,
  getPaymentSettings,
  updatePaymentSettings,
  updatePaymentMethodFee,
  connectMollie,
  disconnectMollie,
  setMollieMode,
  deleteMollieKey,
  getMollieStatus,
  testMollieConnection,
  getTransferableTickets,
  initiateTicketTransfer,
  getPendingTransfers,
  cancelTicketTransfer,
  acceptTicketTransfer,
  getTransferByCode,
  getTransferHistory,
  getFailedImports,
  getFailedImportStats,
  retryFailedImport,
  dismissFailedImport,
  deleteFailedImport,
  bulkDismissFailedImports,
  getSeasonTemplates,
  createSeasonTemplate,
  updateSeasonTemplate,
  deleteSeasonTemplate,
  getSeasons,
  getSeason,
  createSeason,
  updateSeason,
  deleteSeason,
  addSeasonEvent,
  removeSeasonEvent,
  generateSeasonEvents,
  getHolidays,
  getUpcomingHolidays,
  checkHolidayDate,
  syncHolidays,
  createCustomHoliday,
  updateCustomHoliday,
  deleteCustomHoliday,
  getHolidaySettings,
  updateHolidaySettings,
  getStageLayouts,
  getStageLayout,
  createStageLayout,
  updateStageLayout,
  deleteStageLayout,
  duplicateStageLayout,
  getConcertStage,
  saveConcertStage,
  deleteConcertStage,
  getPrintableSeatCards,
} from '../api';

beforeEach(() => startNepserver());
afterEach(() => stopNepserver());

describe('opstelling', () => {
  it('de secties hangen aan het orkest', async () => {
    antwoordMet([]);
    await getSeatingSections('o1');
    expect(laatsteVerzoek().pad).toBe('/seating/sections/o1');

    antwoordMet({ message: 'ok' });
    await createDefaultSeatingLayout('o1');
    expect(laatsteVerzoek().methode).toBe('post');
    expect(laatsteVerzoek().pad).toBe('/seating/sections/o1/default');

    antwoordMet({ id: 's1', message: 'ok' });
    await createSeatingSection({ orchestraId: 'o1', name: 'Klarinetten', rowNumber: 2, instrumentIds: ['i1'] });
    expect(laatsteVerzoek().pad).toBe('/seating/sections');
    expect(laatsteVerzoek().body).toEqual({
      orchestraId: 'o1',
      name: 'Klarinetten',
      rowNumber: 2,
      instrumentIds: ['i1'],
    });

    antwoordMet({ message: 'ok' });
    await updateSeatingSection('s1', { rowNumber: 3 });
    expect(laatsteVerzoek().methode).toBe('put');
    expect(laatsteVerzoek().pad).toBe('/seating/sections/s1');

    antwoordMet({ message: 'ok' });
    await deleteSeatingSection('s1');
    expect(laatsteVerzoek().pad).toBe('/seating/sections/s1');
  });

  // Let op het verschil: deleteSeatingSection werkt op een sectie-id,
  // deleteAllSeatingSections op een orkest-id via een eigen deelpad. Zonder dat
  // extra 'orchestra' zou het orkest-id als sectie-id gelezen worden en zou er
  // niets gebeuren.
  it('deleteAllSeatingSections gebruikt het orkest-deelpad', async () => {
    antwoordMet({ message: 'ok' });
    await deleteAllSeatingSections('o1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/seating/sections/orchestra/o1');
  });

  it('de plaatsingen kennen ophalen, aanmaken, wijzigen, wissen en bulk', async () => {
    antwoordMet([]);
    await getSeatingAssignments('o1');
    expect(laatsteVerzoek().pad).toBe('/seating/assignments/o1');

    antwoordMet({ id: 'p1', message: 'ok' });
    await createSeatingAssignment({ orchestraId: 'o1', userId: 'u1', sectionId: 's1', positionInSection: 1 });
    expect(laatsteVerzoek().pad).toBe('/seating/assignments');

    antwoordMet({ message: 'ok' });
    await updateSeatingAssignment('p1', { positionInSection: 2 });
    expect(laatsteVerzoek().methode).toBe('put');
    expect(laatsteVerzoek().pad).toBe('/seating/assignments/p1');

    antwoordMet({ message: 'ok' });
    await deleteSeatingAssignment('p1');
    expect(laatsteVerzoek().methode).toBe('delete');

    antwoordMet({ message: 'ok' });
    await bulkUpdateSeatingAssignments('o1', [{ userId: 'u1', sectionId: 's1', positionInSection: 1 }]);
    expect(laatsteVerzoek().methode).toBe('put');
    expect(laatsteVerzoek().pad).toBe('/seating/assignments/bulk/o1');
    expect(laatsteVerzoek().body).toEqual({
      assignments: [{ userId: 'u1', sectionId: 's1', positionInSection: 1 }],
    });
  });

  it('de buurvoorkeuren hangen onder /seating/neighbors', async () => {
    antwoordMet([]);
    await getSeatingNeighbors('o1');
    expect(laatsteVerzoek().pad).toBe('/seating/neighbors/o1');

    antwoordMet({ id: 'b1', message: 'ok' });
    await createSeatingNeighbor({ orchestraId: 'o1', userId: 'u1', neighborUserId: 'u2', preference: 'avoid' });
    expect(laatsteVerzoek().body).toEqual({
      orchestraId: 'o1',
      userId: 'u1',
      neighborUserId: 'u2',
      preference: 'avoid',
    });

    antwoordMet({ message: 'ok' });
    await deleteSeatingNeighbor('b1');
    expect(laatsteVerzoek().pad).toBe('/seating/neighbors/b1');
  });

  it('de repetitieopstelling hangt aan de repetitie', async () => {
    antwoordMet([]);
    await getRehearsalSeating('r1');
    expect(laatsteVerzoek().pad).toBe('/seating/rehearsal/r1');

    antwoordMet({ message: 'ok', memberCount: 40 });
    await generateRehearsalSeating('r1');
    expect(laatsteVerzoek().methode).toBe('post');
    expect(laatsteVerzoek().pad).toBe('/seating/rehearsal/r1/generate');

    antwoordMet({ message: 'ok' });
    await updateRehearsalSeat('r1', 'z1', { rowNumber: 2, positionInRow: 4 });
    expect(laatsteVerzoek().methode).toBe('put');
    expect(laatsteVerzoek().pad).toBe('/seating/rehearsal/r1/seat/z1');
    expect(laatsteVerzoek().body).toEqual({ rowNumber: 2, positionInRow: 4 });
  });

  it('getSeatingChart stuurt de repetitie alleen mee als die er is', async () => {
    antwoordMet({});
    await getSeatingChart('o1');
    expect(laatsteVerzoek().pad).toBe('/seating/chart/o1');
    expect(laatsteVerzoek().queryreeks).toBe('');

    antwoordMet({});
    await getSeatingChart('o1', 'r1');
    expect(laatsteVerzoek().query.get('rehearsalId')).toBe('r1');
  });
});

describe('meldingen bij de opstelling', () => {
  it('de instellingen hangen aan het orkest', async () => {
    antwoordMet(null);
    await getSeatingNotificationSettings('o1');
    expect(laatsteVerzoek().pad).toBe('/seating-notifications/settings/o1');

    antwoordMet({});
    await saveSeatingNotificationSettings('o1', {
      notification_type: 'webhook',
      webhook_url: 'https://example.com/hook',
      minutes_before: 60,
      enabled: true,
      include_image: false,
    });
    expect(laatsteVerzoek().methode).toBe('put');
    expect((laatsteVerzoek().body as Record<string, unknown>).minutes_before).toBe(60);

    antwoordMet({ success: true });
    await deleteSeatingNotificationSettings('o1');
    expect(laatsteVerzoek().methode).toBe('delete');
  });

  it('de logboeken en het versturen hangen aan de repetitie', async () => {
    antwoordMet([]);
    await getSeatingNotificationLogs('r1');
    expect(laatsteVerzoek().pad).toBe('/seating-notifications/logs/r1');

    antwoordMet({ success: true, message: 'ok' });
    await sendSeatingNotification('r1', 'data:image/png;base64,AAA');
    expect(laatsteVerzoek().methode).toBe('post');
    expect(laatsteVerzoek().pad).toBe('/seating-notifications/send/r1');
    expect(laatsteVerzoek().body).toEqual({ imageBase64: 'data:image/png;base64,AAA' });
  });

  it('testTwilioConnection stuurt de gegevens van de proefverbinding', async () => {
    antwoordMet({ success: true, message: 'ok' });
    await testTwilioConnection({
      account_sid: 'AC123',
      auth_token: 'proefsleutel',
      whatsapp_from: '+3110000000',
      whatsapp_to: '+3120000000',
    });

    const verzoek = laatsteVerzoek();
    expect(verzoek.pad).toBe('/seating-notifications/test-twilio');
    expect((verzoek.body as Record<string, unknown>).whatsapp_to).toBe('+3120000000');
  });
});

describe('onboarding', () => {
  it('onboardMember stuurt JSON als er geen profielfoto is', async () => {
    antwoordMet({ success: true, userId: 'u1' });
    await onboardMember({ firstName: 'Jan', lastName: 'Jansen', email: 'jan@example.com', instrumentIds: ['i1'] });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/onboarding/member');
    expect(verzoek.body).toEqual({
      firstName: 'Jan',
      lastName: 'Jansen',
      email: 'jan@example.com',
      instrumentIds: ['i1'],
    });
  });

  it('onboardMember schakelt over op FormData zodra er een foto bij zit', async () => {
    antwoordMet({ success: true, userId: 'u1' });
    const foto = new File(['x'], 'jan.png', { type: 'image/png' });
    await onboardMember({
      firstName: 'Jan',
      lastName: 'Jansen',
      email: 'jan@example.com',
      instrumentIds: ['i1'],
      orchestraIds: ['o1'],
      createM365Account: true,
      profilePhoto: foto,
    });

    const verzoek = laatsteVerzoek();
    const body = verzoek.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get('firstName')).toBe('Jan');
    // Lijsten gaan als JSON-tekst mee, want FormData kent geen arrays.
    expect(body.get('instrumentIds')).toBe('["i1"]');
    expect(body.get('orchestraIds')).toBe('["o1"]');
    // Vinkjes gaan als de tekst 'true' mee, en alleen als ze aanstaan.
    expect(body.get('createM365Account')).toBe('true');
    expect(body.get('addToPercussionGroup')).toBeNull();
    expect(body.get('profilePhoto')).toBeInstanceOf(File);
  });

  it('onboardMember zet ook de optionele velden in de FormData', async () => {
    antwoordMet({ success: true, userId: 'u1' });
    await onboardMember({
      firstName: 'Jan',
      lastName: 'Jansen',
      email: 'jan@example.com',
      privateEmail: 'jan.prive@example.com',
      m365Password: 'tijdelijk-wachtwoord',
      addToPercussionGroup: true,
      profilePhoto: new File(['x'], 'jan.png', { type: 'image/png' }),
    });

    const body = laatsteVerzoek().body as FormData;
    expect(body.get('privateEmail')).toBe('jan.prive@example.com');
    expect(body.get('m365Password')).toBe('tijdelijk-wachtwoord');
    expect(body.get('addToPercussionGroup')).toBe('true');
    // Zonder instrumenten of orkesten horen die velden helemaal weg te blijven,
    // anders leest de backend een lege tekst als lijst.
    expect(body.get('instrumentIds')).toBeNull();
    expect(body.get('orchestraIds')).toBeNull();
  });

  it('de M365-groepen en functietitels hebben eigen routes', async () => {
    antwoordMet([]);
    await getM365GroupMappings();
    expect(laatsteVerzoek().pad).toBe('/onboarding/m365-groups');

    antwoordMet({ id: 'g1', message: 'ok' });
    await createM365GroupMapping({ orchestraId: 'o1', groupName: 'Harmonie', groupType: 'orchestra' });
    expect(laatsteVerzoek().methode).toBe('post');

    antwoordMet({ message: 'ok' });
    await updateM365GroupMapping('g1', 'Harmonie 2026');
    expect(laatsteVerzoek().methode).toBe('put');
    expect(laatsteVerzoek().body).toEqual({ groupName: 'Harmonie 2026' });

    antwoordMet({ message: 'ok' });
    await deleteM365GroupMapping('g1');
    expect(laatsteVerzoek().pad).toBe('/onboarding/m365-groups/g1');

    antwoordMet([]);
    await getInstrumentJobTitleMappings();
    expect(laatsteVerzoek().pad).toBe('/onboarding/job-titles');

    antwoordMet({ id: 'j1', message: 'ok' });
    await createInstrumentJobTitleMapping({ instrumentId: 'i1', jobTitle: 'Trompettist' });
    expect(laatsteVerzoek().body).toEqual({ instrumentId: 'i1', jobTitle: 'Trompettist' });

    antwoordMet({ message: 'ok' });
    await updateInstrumentJobTitleMapping('j1', 'Solotrompettist');
    expect(laatsteVerzoek().body).toEqual({ jobTitle: 'Solotrompettist' });

    antwoordMet({ message: 'ok' });
    await deleteInstrumentJobTitleMapping('j1');
    expect(laatsteVerzoek().pad).toBe('/onboarding/job-titles/j1');
  });

  it('de openstaande Spond-koppelingen en taken hangen onder /onboarding', async () => {
    antwoordMet([]);
    await getPendingSpondLinks();
    expect(laatsteVerzoek().pad).toBe('/onboarding/pending-links');

    antwoordMet({ message: 'ok' });
    await deletePendingSpondLink('k1');
    expect(laatsteVerzoek().pad).toBe('/onboarding/pending-links/k1');

    antwoordMet([]);
    await getOnboardingTasks('u1');
    expect(laatsteVerzoek().pad).toBe('/onboarding/tasks/u1');

    antwoordMet({ success: true, message: 'ok' });
    await retryEmailForwarding('u1');
    expect(laatsteVerzoek().methode).toBe('post');
    expect(laatsteVerzoek().pad).toBe('/onboarding/retry-email-forwarding/u1');
  });

  it('offboardMember stuurt de keuze over M365 mee', async () => {
    antwoordMet({ success: true, m365Removed: true, m365Error: null, message: 'ok', notes: [] });
    await offboardMember('u1', true);

    const verzoek = laatsteVerzoek();
    expect(verzoek.pad).toBe('/onboarding/offboard/u1');
    expect(verzoek.body).toEqual({ removeFromM365: true });
  });

  it('reactivateMember en getInactiveMembers horen bij het uitschrijven', async () => {
    antwoordMet({ success: true, message: 'ok' });
    await reactivateMember('u1');
    expect(laatsteVerzoek().pad).toBe('/onboarding/reactivate/u1');

    antwoordMet([]);
    await getInactiveMembers();
    expect(laatsteVerzoek().pad).toBe('/onboarding/inactive-members');
  });
});

describe('favorieten, oefenen en recent bekeken', () => {
  it('de favorieten werken op het titel-id', async () => {
    antwoordMet([]);
    await getFavorites();
    expect(laatsteVerzoek().pad).toBe('/favorites');

    antwoordMet({ message: 'ok' });
    await addFavorite('t1');
    expect(laatsteVerzoek().methode).toBe('post');
    expect(laatsteVerzoek().body).toEqual({ musicTitleId: 't1' });

    antwoordMet({ message: 'ok' });
    await removeFavorite('t1');
    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/favorites/t1');

    antwoordMet({ isFavorite: true });
    await checkFavorite('t1');
    expect(laatsteVerzoek().pad).toBe('/favorites/check/t1');
  });

  it('de oefenlogboeken hangen onder /practice', async () => {
    antwoordMet([]);
    await getPracticeLogs('t1');
    expect(laatsteVerzoek().pad).toBe('/practice');
    expect(laatsteVerzoek().query.get('musicTitleId')).toBe('t1');

    antwoordMet({});
    await getPracticeStats();
    expect(laatsteVerzoek().pad).toBe('/practice/stats');

    antwoordMet({ id: 'o1', message: 'ok' });
    await logPractice('t1', 45, 'langzaam gestudeerd');
    expect(laatsteVerzoek().methode).toBe('post');
    expect(laatsteVerzoek().body).toEqual({
      musicTitleId: 't1',
      durationMinutes: 45,
      notes: 'langzaam gestudeerd',
    });

    antwoordMet({ message: 'ok' });
    await deletePracticeLog('o1');
    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/practice/o1');
  });

  it('recent bekeken kent ophalen, vastleggen en wissen', async () => {
    antwoordMet([]);
    await getRecentViews('music_title', 10);
    expect(laatsteVerzoek().pad).toBe('/recent');
    expect(laatsteVerzoek().query.get('type')).toBe('music_title');
    expect(laatsteVerzoek().query.get('limit')).toBe('10');

    antwoordMet({ message: 'ok' });
    await recordView('music_title', 't1', 'Mars');
    expect(laatsteVerzoek().methode).toBe('post');
    expect(laatsteVerzoek().body).toEqual({ itemType: 'music_title', itemId: 't1', itemTitle: 'Mars' });

    antwoordMet({ message: 'ok' });
    await clearRecentViews();
    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/recent');
  });
});

describe('annotaties', () => {
  it('getAnnotations filtert op paginanummer', async () => {
    antwoordMet([]);
    await getAnnotations('p1', 3);

    const verzoek = laatsteVerzoek();
    expect(verzoek.pad).toBe('/annotations/piece/p1');
    expect(verzoek.query.get('pageNumber')).toBe('3');
  });

  it('createAnnotation stuurt de volledige annotatie', async () => {
    antwoordMet({ id: 'a1', message: 'ok' });
    await createAnnotation({
      musicPieceId: 'p1',
      pageNumber: 2,
      annotationType: 'highlight',
      xPosition: 0.25,
      yPosition: 0.5,
      color: '#ffff00',
    });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/annotations');
    expect(verzoek.body).toEqual({
      musicPieceId: 'p1',
      pageNumber: 2,
      annotationType: 'highlight',
      xPosition: 0.25,
      yPosition: 0.5,
      color: '#ffff00',
    });
  });

  // deleteAnnotation wist één annotatie, deleteAllAnnotations alle annotaties
  // van een stuk. Ze verschillen alleen in het deelpad 'piece', dus een
  // verwisseling wist per ongeluk alles.
  it('deleteAnnotation en deleteAllAnnotations gebruiken verschillende paden', async () => {
    antwoordMet({ message: 'ok' });
    await updateAnnotation('a1', { content: 'let op' });
    expect(laatsteVerzoek().methode).toBe('put');
    expect(laatsteVerzoek().pad).toBe('/annotations/a1');

    antwoordMet({ message: 'ok' });
    await deleteAnnotation('a1');
    expect(laatsteVerzoek().pad).toBe('/annotations/a1');

    antwoordMet({ message: 'ok', deleted: 12 });
    await deleteAllAnnotations('p1');
    expect(laatsteVerzoek().pad).toBe('/annotations/piece/p1');
  });
});

describe('sessies', () => {
  // /sessions/all moet in de backend bóven /sessions/:id staan, anders wordt
  // 'all' als sessie-id gelezen. Aan deze kant leggen we alleen vast dat de
  // twee routes niet door elkaar lopen.
  it('revokeSession werkt op één sessie, revokeAllSessions op alle', async () => {
    antwoordMet([]);
    await getSessions();
    expect(laatsteVerzoek().pad).toBe('/sessions');

    antwoordMet({ message: 'ok' });
    await revokeSession('s1');
    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/sessions/s1');

    antwoordMet({ message: 'ok', revokedCount: 3 });
    await revokeAllSessions();
    expect(laatsteVerzoek().pad).toBe('/sessions/all');
  });
});

describe('agenda', () => {
  it('de instellingen en de feed hangen onder /calendar', async () => {
    antwoordMet({});
    await getCalendarSettings();
    expect(laatsteVerzoek().pad).toBe('/calendar/settings');

    antwoordMet({});
    await updateCalendarSettings({ includeRehearsals: true, includeConcerts: false });
    expect(laatsteVerzoek().methode).toBe('put');
    expect(laatsteVerzoek().body).toEqual({ includeRehearsals: true, includeConcerts: false });

    antwoordMet({ feedUrl: 'https://example.com/f.ics', message: 'ok' });
    await regenerateCalendarFeed();
    expect(laatsteVerzoek().methode).toBe('post');
    expect(laatsteVerzoek().pad).toBe('/calendar/feed/regenerate');
  });

  it('de Google-koppeling gebruikt drie POST-routes', async () => {
    antwoordMet({ authUrl: 'https://accounts.google.com/...' });
    await startGoogleAuth();
    expect(laatsteVerzoek().methode).toBe('post');
    expect(laatsteVerzoek().pad).toBe('/calendar/google/auth');

    antwoordMet({});
    await disconnectGoogle();
    expect(laatsteVerzoek().pad).toBe('/calendar/google/disconnect');

    antwoordMet({ message: 'ok', synced: 3, failed: 0, total: 3 });
    await syncGoogleCalendar();
    expect(laatsteVerzoek().pad).toBe('/calendar/google/sync');
  });
});

describe('meldingskanalen', () => {
  it('de kanalen en voorkeuren hangen onder /notification-channels', async () => {
    antwoordMet([]);
    await getNotificationChannels();
    expect(laatsteVerzoek().pad).toBe('/notification-channels/channels');

    antwoordMet({});
    await getNotificationPreferences();
    expect(laatsteVerzoek().pad).toBe('/notification-channels/preferences');

    antwoordMet({});
    await updateNotificationPreferences({ emailEnabled: true, newMusic: false });
    expect(laatsteVerzoek().methode).toBe('put');
    expect(laatsteVerzoek().body).toEqual({ emailEnabled: true, newMusic: false });
  });

  it('het koppelen van Telegram loopt via een code', async () => {
    antwoordMet({ code: 'ABC123', url: 'https://t.me/...', expiresIn: 600 });
    await getTelegramLinkUrl();
    expect(laatsteVerzoek().methode).toBe('post');
    expect(laatsteVerzoek().pad).toBe('/notification-channels/telegram/link');

    antwoordMet({ linked: true, verified: true, linkedAt: null });
    await getTelegramStatus();
    expect(laatsteVerzoek().pad).toBe('/notification-channels/telegram/status');

    antwoordMet({});
    await unlinkTelegram();
    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/notification-channels/telegram/unlink');
  });

  it('het koppelen van WhatsApp gaat in twee stappen', async () => {
    antwoordMet({ message: 'ok', phoneNumber: '+3161234567', expiresIn: 600 });
    await linkWhatsApp('+3161234567');
    expect(laatsteVerzoek().pad).toBe('/notification-channels/whatsapp/link');
    expect(laatsteVerzoek().body).toEqual({ phoneNumber: '+3161234567' });

    antwoordMet({});
    await verifyWhatsApp('123456');
    expect(laatsteVerzoek().pad).toBe('/notification-channels/whatsapp/verify');
    expect(laatsteVerzoek().body).toEqual({ code: '123456' });

    antwoordMet({ linked: true, verified: true, phoneNumber: null, linkedAt: null });
    await getWhatsAppStatus();
    expect(laatsteVerzoek().pad).toBe('/notification-channels/whatsapp/status');

    antwoordMet({});
    await unlinkWhatsApp();
    expect(laatsteVerzoek().methode).toBe('delete');
  });
});

describe('streaming', () => {
  it('searchStreamingTracks gebruikt q en geeft platform en limiet mee', async () => {
    antwoordMet({ spotify: true, appleMusic: false });
    await getStreamingStatus();
    expect(laatsteVerzoek().pad).toBe('/streaming/status');

    antwoordMet({ results: [] });
    await searchStreamingTracks('bolero', 'spotify', 'Ravel', 5);

    const verzoek = laatsteVerzoek();
    expect(verzoek.pad).toBe('/streaming/search');
    expect(verzoek.query.get('q')).toBe('bolero');
    expect(verzoek.query.get('platform')).toBe('spotify');
    expect(verzoek.query.get('composer')).toBe('Ravel');
    expect(verzoek.query.get('limit')).toBe('5');
  });

  it('de koppelingen per titel kennen ophalen, opslaan en wissen', async () => {
    antwoordMet({});
    await getStreamingLinks('t1');
    expect(laatsteVerzoek().pad).toBe('/streaming/music-titles/t1/links');

    antwoordMet({ message: 'ok', links: {} });
    await updateStreamingLinks('t1', { spotify_url: 'https://open.spotify.com/track/1' });
    expect(laatsteVerzoek().methode).toBe('post');
    expect(laatsteVerzoek().body).toEqual({ spotify_url: 'https://open.spotify.com/track/1' });

    antwoordMet({});
    await deleteStreamingLink('t1', 'youtube');
    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/streaming/music-titles/t1/links/youtube');
  });
});

describe('kaartverkoop', () => {
  it('de publieke routes hangen aan het concert', async () => {
    antwoordMet({ concert: {}, ticketTypes: [] });
    await getConcertTickets('c1');
    expect(laatsteVerzoek().pad).toBe('/concerts/c1/tickets');

    antwoordMet({ orderId: 'b1', total: 2500, expiresAt: '', items: [] });
    await createTicketOrder('c1', {
      items: [{ ticketTypeId: 'k1', quantity: 2 }],
      buyerName: 'Jan',
      buyerEmail: 'jan@example.com',
    });
    expect(laatsteVerzoek().pad).toBe('/concerts/c1/tickets/order');
    expect(laatsteVerzoek().body).toEqual({
      items: [{ ticketTypeId: 'k1', quantity: 2 }],
      buyerName: 'Jan',
      buyerEmail: 'jan@example.com',
    });
  });

  it('de bestelling en de betaling hangen onder /tickets/orders', async () => {
    antwoordMet({});
    await getTicketOrder('b1');
    expect(laatsteVerzoek().pad).toBe('/tickets/orders/b1');

    antwoordMet({ paymentId: 'tr1', checkoutUrl: 'https://mollie...' });
    await payTicketOrder('b1', { method: 'ideal', returnUrl: 'https://example.com/klaar' });
    expect(laatsteVerzoek().methode).toBe('post');
    expect(laatsteVerzoek().pad).toBe('/tickets/orders/b1/pay');
    expect(laatsteVerzoek().body).toEqual({ method: 'ideal', returnUrl: 'https://example.com/klaar' });

    antwoordMet({ success: true, message: 'ok' });
    await refundOrder('b1', 'concert afgelast');
    expect(laatsteVerzoek().pad).toBe('/tickets/orders/b1/refund');
    expect(laatsteVerzoek().body).toEqual({ reason: 'concert afgelast' });

    antwoordMet({ success: true });
    await mockPayment('b1', 'cancel');
    expect(laatsteVerzoek().pad).toBe('/tickets/orders/b1/mock-payment');
    expect(laatsteVerzoek().body).toEqual({ action: 'cancel' });
  });

  it('een kaartje opzoeken en scannen gaat op code', async () => {
    antwoordMet({});
    await getTicketByCode('ABC-123');
    expect(laatsteVerzoek().pad).toBe('/tickets/ABC-123');

    antwoordMet({ valid: true });
    await validateTicket('ABC-123', 'c1');
    expect(laatsteVerzoek().methode).toBe('post');
    expect(laatsteVerzoek().pad).toBe('/tickets/ABC-123/validate');
    expect(laatsteVerzoek().body).toEqual({ concertId: 'c1' });

    antwoordMet([]);
    await getMyTickets();
    expect(laatsteVerzoek().pad).toBe('/tickets/my');

    antwoordMet({ success: true, message: 'ok' });
    await cancelTicket('k1');
    expect(laatsteVerzoek().pad).toBe('/tickets/k1/cancel');
  });

  // De kaartsoorten worden ONDER het concert aangemaakt maar op hun eigen
  // route gewijzigd en verwijderd. Dat verschil is makkelijk te missen.
  it('de kaartsoorten gebruiken twee verschillende basispaden', async () => {
    antwoordMet({});
    await createTicketType('c1', { name: 'Standaard', price: 1250, quantity: 200 });
    expect(laatsteVerzoek().pad).toBe('/concerts/c1/ticket-types');

    antwoordMet({ success: true });
    await updateTicketType('k1', { price: 1500 });
    expect(laatsteVerzoek().methode).toBe('put');
    expect(laatsteVerzoek().pad).toBe('/ticket-types/k1');

    antwoordMet({ success: true });
    await deleteTicketType('k1');
    expect(laatsteVerzoek().pad).toBe('/ticket-types/k1');
  });

  it('de beheeroverzichten hangen deels aan het concert en deels aan /tickets', async () => {
    antwoordMet({});
    await getConcertTicketStats('c1');
    expect(laatsteVerzoek().pad).toBe('/concerts/c1/ticket-stats');

    antwoordMet([]);
    await getConcertAttendees('c1');
    expect(laatsteVerzoek().pad).toBe('/concerts/c1/attendees');

    antwoordMet({});
    await getSeatHeatmapData('c1');
    expect(laatsteVerzoek().pad).toBe('/concerts/c1/seats/heatmap-data');

    antwoordMet({});
    await getSalesPredictions('c1');
    expect(laatsteVerzoek().pad).toBe('/concerts/c1/tickets/predictions');

    antwoordMet({});
    await getScannedTickets('c1');
    expect(laatsteVerzoek().pad).toBe('/concerts/c1/scanned-tickets');

    antwoordMet({});
    await getTicketDashboard('c1');
    expect(laatsteVerzoek().pad).toBe('/tickets/dashboard/c1');

    antwoordMet({});
    await getPaymentDetails('b1');
    expect(laatsteVerzoek().pad).toBe('/tickets/sales/b1/payment-details');
  });

  it('getTicketSales geeft alle filters mee als queryreeks', async () => {
    antwoordMet({});
    await getTicketSales({
      concertId: 'c1',
      status: 'paid',
      startDate: '2026-01-01',
      endDate: '2026-02-01',
      page: 2,
      limit: 50,
    });

    const verzoek = laatsteVerzoek();
    expect(verzoek.pad).toBe('/tickets/sales');
    expect(verzoek.query.get('status')).toBe('paid');
    expect(verzoek.query.get('page')).toBe('2');
    expect(verzoek.query.get('limit')).toBe('50');
  });
});

describe('gastenlijst', () => {
  it('de lijst hangt aan het concert, de losse gast op zijn eigen route', async () => {
    antwoordMet({});
    await getGuestList('c1', { page: 1, limit: 25, search: 'jan', ticketsSent: false });
    expect(laatsteVerzoek().pad).toBe('/concerts/c1/guest-list');
    expect(laatsteVerzoek().query.get('ticketsSent')).toBe('false');

    antwoordMet({});
    await addGuest('c1', { name: 'Jan', email: 'jan@example.com', ticketCount: 2 });
    expect(laatsteVerzoek().methode).toBe('post');
    expect(laatsteVerzoek().pad).toBe('/concerts/c1/guest-list');

    antwoordMet({});
    await updateGuest('g1', { ticketCount: 3 });
    expect(laatsteVerzoek().methode).toBe('put');
    expect(laatsteVerzoek().pad).toBe('/guest-list/g1');

    antwoordMet({});
    await deleteGuest('g1');
    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/guest-list/g1');
  });

  it('kaarten versturen kan per gast of voor de hele lijst', async () => {
    antwoordMet({ success: true, orderId: 'b1', ticketCount: 2, tickets: [] });
    await sendGuestTickets('g1');
    expect(laatsteVerzoek().pad).toBe('/guest-list/g1/send-tickets');

    antwoordMet({ success: true, sent: 4, failed: 0 });
    await sendAllGuestTickets('c1');
    expect(laatsteVerzoek().pad).toBe('/concerts/c1/guest-list/send-all');
  });
});

describe('betaalinstellingen', () => {
  it('de instellingen en de tarieven hangen onder /payment-settings', async () => {
    antwoordMet({});
    await getPaymentSettings();
    expect(laatsteVerzoek().pad).toBe('/payment-settings');

    antwoordMet({ success: true });
    await updatePaymentSettings({ passFeesToCustomer: true });
    expect(laatsteVerzoek().methode).toBe('put');
    expect(laatsteVerzoek().body).toEqual({ passFeesToCustomer: true });

    antwoordMet({ success: true });
    await updatePaymentMethodFee('ideal', { customerFee: 35, isEnabled: true });
    expect(laatsteVerzoek().pad).toBe('/payment-settings/fees/ideal');
    expect(laatsteVerzoek().body).toEqual({ customerFee: 35, isEnabled: true });
  });

  it('de Mollie-koppeling kent verbinden, wisselen en loskoppelen', async () => {
    antwoordMet({
      success: true,
      profileId: 'pf1',
      organisationName: 'Harmonie',
      canReceivePayments: true,
      mode: 'test',
    });
    await connectMollie('proefsleutel-abc', 'test');
    expect(laatsteVerzoek().methode).toBe('post');
    expect(laatsteVerzoek().pad).toBe('/payment-settings/mollie/connect');
    expect(laatsteVerzoek().body).toEqual({ apiKey: 'proefsleutel-abc', mode: 'test' });

    antwoordMet({ success: true, mode: 'live' });
    await setMollieMode('live');
    expect(laatsteVerzoek().methode).toBe('put');
    expect(laatsteVerzoek().pad).toBe('/payment-settings/mollie/mode');
    expect(laatsteVerzoek().body).toEqual({ mode: 'live' });

    // De sleutel zit in het pad, niet in de body: /key/live en /key/test wissen
    // elk maar één van de twee.
    antwoordMet({ success: true });
    await deleteMollieKey('test');
    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/payment-settings/mollie/key/test');

    antwoordMet({ success: true });
    await disconnectMollie();
    expect(laatsteVerzoek().methode).toBe('post');
    expect(laatsteVerzoek().pad).toBe('/payment-settings/mollie/disconnect');

    antwoordMet({});
    await getMollieStatus();
    expect(laatsteVerzoek().pad).toBe('/payment-settings/mollie/status');

    antwoordMet({ connected: true, canReceivePayments: true, canReceivePayouts: true });
    await testMollieConnection();
    expect(laatsteVerzoek().methode).toBe('get');
    expect(laatsteVerzoek().pad).toBe('/payment-settings/mollie/test');
  });
});

describe('kaartoverdracht', () => {
  it('de overdrachtsroutes staan naast elkaar onder /tickets', async () => {
    antwoordMet([]);
    await getTransferableTickets();
    expect(laatsteVerzoek().pad).toBe('/tickets/transferable');

    antwoordMet({ transfer: {}, message: 'ok' });
    await initiateTicketTransfer('k1', { recipientEmail: 'piet@example.com', recipientName: 'Piet' });
    expect(laatsteVerzoek().methode).toBe('post');
    expect(laatsteVerzoek().pad).toBe('/tickets/k1/transfer');
    expect(laatsteVerzoek().body).toEqual({ recipientEmail: 'piet@example.com', recipientName: 'Piet' });

    antwoordMet([]);
    await getPendingTransfers();
    expect(laatsteVerzoek().pad).toBe('/tickets/transfers');

    antwoordMet({ success: true, message: 'ok' });
    await cancelTicketTransfer('o1');
    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/tickets/transfers/o1');

    antwoordMet({ success: true, ticket: {}, message: 'ok' });
    await acceptTicketTransfer('CODE-1');
    expect(laatsteVerzoek().methode).toBe('post');
    expect(laatsteVerzoek().pad).toBe('/tickets/transfers/CODE-1/accept');

    antwoordMet({});
    await getTransferByCode('CODE-1');
    expect(laatsteVerzoek().pad).toBe('/tickets/transfers/CODE-1');

    // /tickets/transfers/history moet in de backend bóven
    // /tickets/transfers/:transferCode staan, anders wordt 'history' als code
    // gelezen. Hier leggen we vast dat het geen deelpad van een code is.
    antwoordMet([]);
    await getTransferHistory();
    expect(laatsteVerzoek().pad).toBe('/tickets/transfers/history');
  });
});

describe('mislukte imports', () => {
  it('getFailedImports stuurt de status alleen mee als die is opgegeven', async () => {
    antwoordMet([]);
    await getFailedImports();
    expect(laatsteVerzoek().pad).toBe('/failed-imports');
    expect(laatsteVerzoek().queryreeks).toBe('');

    antwoordMet([]);
    await getFailedImports('failed');
    expect(laatsteVerzoek().query.get('status')).toBe('failed');
  });

  it('opnieuw proberen, negeren en verwijderen hebben eigen routes', async () => {
    antwoordMet({});
    await getFailedImportStats();
    expect(laatsteVerzoek().pad).toBe('/failed-imports/stats');

    antwoordMet({ message: 'ok' });
    await retryFailedImport('f1');
    expect(laatsteVerzoek().methode).toBe('post');
    expect(laatsteVerzoek().pad).toBe('/failed-imports/f1/retry');

    antwoordMet({ message: 'ok' });
    await dismissFailedImport('f1');
    expect(laatsteVerzoek().pad).toBe('/failed-imports/f1/dismiss');

    antwoordMet({ message: 'ok' });
    await deleteFailedImport('f1');
    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/failed-imports/f1');

    antwoordMet({ message: 'ok', dismissed: 2 });
    await bulkDismissFailedImports(['f1', 'f2']);
    expect(laatsteVerzoek().pad).toBe('/failed-imports/bulk-dismiss');
    expect(laatsteVerzoek().body).toEqual({ ids: ['f1', 'f2'] });
  });
});

describe('seizoenen', () => {
  it('de sjablonen hangen onder /seasons/templates', async () => {
    antwoordMet([]);
    await getSeasonTemplates();
    expect(laatsteVerzoek().pad).toBe('/seasons/templates');

    antwoordMet({ id: 's1', message: 'ok' });
    await createSeasonTemplate({ name: 'Standaardseizoen', defaultRehearsalDay: 3 });
    expect(laatsteVerzoek().methode).toBe('post');
    expect(laatsteVerzoek().body).toEqual({ name: 'Standaardseizoen', defaultRehearsalDay: 3 });

    antwoordMet({ message: 'ok' });
    await updateSeasonTemplate('s1', { name: 'Aangepast' });
    expect(laatsteVerzoek().methode).toBe('put');
    expect(laatsteVerzoek().pad).toBe('/seasons/templates/s1');

    antwoordMet({ message: 'ok' });
    await deleteSeasonTemplate('s1');
    expect(laatsteVerzoek().pad).toBe('/seasons/templates/s1');
  });

  it('de seizoenen zelf hangen onder /seasons', async () => {
    antwoordMet([]);
    await getSeasons('active');
    expect(laatsteVerzoek().pad).toBe('/seasons');
    expect(laatsteVerzoek().query.get('status')).toBe('active');

    antwoordMet([]);
    await getSeasons();
    expect(laatsteVerzoek().queryreeks).toBe('');

    antwoordMet({});
    await getSeason('z1');
    expect(laatsteVerzoek().pad).toBe('/seasons/z1');

    antwoordMet({ id: 'z1', message: 'ok' });
    await createSeason({ name: '2026/2027', startDate: '2026-09-01', endDate: '2027-06-30' });
    expect(laatsteVerzoek().body).toEqual({
      name: '2026/2027',
      startDate: '2026-09-01',
      endDate: '2027-06-30',
    });

    antwoordMet({ message: 'ok' });
    await updateSeason('z1', { status: 'active' });
    expect(laatsteVerzoek().methode).toBe('put');

    antwoordMet({ message: 'ok' });
    await deleteSeason('z1');
    expect(laatsteVerzoek().methode).toBe('delete');
  });

  it('de gebeurtenissen en het genereren hangen onder het seizoen', async () => {
    antwoordMet({ id: 'g1', message: 'ok' });
    await addSeasonEvent('z1', { eventType: 'concert', plannedDate: '2026-12-20', budgetAmount: 500 });
    expect(laatsteVerzoek().pad).toBe('/seasons/z1/events');

    antwoordMet({ message: 'ok' });
    await removeSeasonEvent('z1', 'g1');
    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/seasons/z1/events/g1');

    antwoordMet({ message: 'ok', rehearsalCount: 30, concertCount: 2, rehearsalDates: [], concertNames: [] });
    await generateSeasonEvents('z1', { rehearsalDay: 3, generateRehearsals: true, excludeDates: ['2026-12-25'] });
    expect(laatsteVerzoek().methode).toBe('post');
    expect(laatsteVerzoek().pad).toBe('/seasons/z1/generate');
    expect(laatsteVerzoek().body).toEqual({
      rehearsalDay: 3,
      generateRehearsals: true,
      excludeDates: ['2026-12-25'],
    });
  });
});

describe('feestdagen', () => {
  it('getHolidays geeft jaar of datumbereik mee', async () => {
    antwoordMet({ holidays: [], settings: {}, meta: {} });
    await getHolidays({ year: 2026 });
    expect(laatsteVerzoek().pad).toBe('/holidays');
    expect(laatsteVerzoek().query.get('year')).toBe('2026');

    antwoordMet({ holidays: [], settings: {}, meta: {} });
    await getHolidays({ startDate: '2026-01-01', endDate: '2026-12-31' });
    expect(laatsteVerzoek().query.get('startDate')).toBe('2026-01-01');
  });

  it('de losse feestdagroutes gebruiken hun eigen deelpad', async () => {
    antwoordMet([]);
    await getUpcomingHolidays(5);
    expect(laatsteVerzoek().pad).toBe('/holidays/upcoming');
    expect(laatsteVerzoek().query.get('limit')).toBe('5');

    antwoordMet({ isHoliday: false, holiday: null });
    await checkHolidayDate('2026-04-27');
    expect(laatsteVerzoek().pad).toBe('/holidays/check');
    expect(laatsteVerzoek().query.get('date')).toBe('2026-04-27');

    // syncHolidays is een GET, ook al haalt hij gegevens op bij een externe
    // bron. Dat komt overeen met backend/src/routes/holidays.ts.
    antwoordMet({ message: 'ok', count: 12, year: 2026 });
    await syncHolidays(2026);
    expect(laatsteVerzoek().methode).toBe('get');
    expect(laatsteVerzoek().pad).toBe('/holidays/sync');
    expect(laatsteVerzoek().query.get('year')).toBe('2026');
  });

  it('eigen feestdagen kennen aanmaken, wijzigen en wissen', async () => {
    antwoordMet({});
    await createCustomHoliday({ name: 'Studieweekend', startDate: '2026-03-06', endDate: '2026-03-08' });
    expect(laatsteVerzoek().methode).toBe('post');
    expect(laatsteVerzoek().pad).toBe('/holidays');

    antwoordMet({ message: 'ok' });
    await updateCustomHoliday('f1', { name: 'Studieweekend 2026' });
    expect(laatsteVerzoek().methode).toBe('put');
    expect(laatsteVerzoek().pad).toBe('/holidays/f1');

    antwoordMet({ message: 'ok' });
    await deleteCustomHoliday('f1');
    expect(laatsteVerzoek().methode).toBe('delete');
  });

  it('de instellingen zitten op /holidays/settings, niet op /holidays/:id', async () => {
    antwoordMet({});
    await getHolidaySettings();
    expect(laatsteVerzoek().pad).toBe('/holidays/settings');

    antwoordMet({ message: 'ok', settings: {} });
    await updateHolidaySettings({ region: 'zuid', autoBlockRehearsals: true });
    expect(laatsteVerzoek().methode).toBe('put');
    expect(laatsteVerzoek().pad).toBe('/holidays/settings');
    expect(laatsteVerzoek().body).toEqual({ region: 'zuid', autoBlockRehearsals: true });
  });
});

describe('podiumplot', () => {
  it('getStageLayouts stuurt includeTemplates als tekst mee', async () => {
    // De waarde gaat als 'true' of 'false' mee, niet als boolean. Een boolean
    // false zou in de queryreeks als de tekst 'false' terechtkomen en aan de
    // serverkant juist als waarheid gelezen kunnen worden; hier is het
    // expliciet gemaakt.
    antwoordMet([]);
    await getStageLayouts();
    expect(laatsteVerzoek().pad).toBe('/stage-layouts');
    expect(laatsteVerzoek().query.get('includeTemplates')).toBe('false');

    antwoordMet([]);
    await getStageLayouts(true);
    expect(laatsteVerzoek().query.get('includeTemplates')).toBe('true');
  });

  it('de plots kennen ophalen, aanmaken, wijzigen, wissen en dupliceren', async () => {
    antwoordMet({});
    await getStageLayout('pl1');
    expect(laatsteVerzoek().pad).toBe('/stage-layouts/pl1');

    antwoordMet({ id: 'pl1', message: 'ok' });
    await createStageLayout({ name: 'Grote zaal', stageWidth: 12, stageDepth: 8 });
    expect(laatsteVerzoek().methode).toBe('post');
    expect(laatsteVerzoek().body).toEqual({ name: 'Grote zaal', stageWidth: 12, stageDepth: 8 });

    antwoordMet({ message: 'ok' });
    await updateStageLayout('pl1', { name: 'Grote zaal 2026' });
    expect(laatsteVerzoek().methode).toBe('put');

    antwoordMet({ message: 'ok' });
    await deleteStageLayout('pl1');
    expect(laatsteVerzoek().methode).toBe('delete');

    antwoordMet({ id: 'pl2', message: 'ok' });
    await duplicateStageLayout('pl1', 'Kopie');
    expect(laatsteVerzoek().pad).toBe('/stage-layouts/pl1/duplicate');
    expect(laatsteVerzoek().body).toEqual({ name: 'Kopie' });
  });

  it('de plot van een concert hangt onder het concert', async () => {
    antwoordMet({});
    await getConcertStage('c1');
    expect(laatsteVerzoek().pad).toBe('/concerts/c1/stage');

    antwoordMet({ message: 'ok' });
    await saveConcertStage('c1', 'pl1', { z1: { userId: 'u1' } as never });
    expect(laatsteVerzoek().methode).toBe('put');
    expect(laatsteVerzoek().pad).toBe('/concerts/c1/stage');
    expect(laatsteVerzoek().body).toEqual({ layoutId: 'pl1', assignments: { z1: { userId: 'u1' } } });

    antwoordMet({ message: 'ok' });
    await deleteConcertStage('c1');
    expect(laatsteVerzoek().methode).toBe('delete');

    antwoordMet({});
    await getPrintableSeatCards('c1');
    expect(laatsteVerzoek().pad).toBe('/concerts/c1/stage/print');
  });

  it('laat een 404 van de podiumplot door', async () => {
    antwoordMetFout(404, { error: 'Podiumplot niet gevonden' });

    await expect(getStageLayout('bestaat-niet')).rejects.toMatchObject({
      response: { status: 404, data: { error: 'Podiumplot niet gevonden' } },
    });
  });
});
