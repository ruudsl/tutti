/**
 * Tests voor de opstelling-api (secties, plaatsen en meldingen).
 *
 * De functies in seating.ts zetten een pad in elkaar, geven een body mee en
 * leveren `response.data` terug. Daarom wordt hier op het pad, de methode, de
 * body en de queryreeks getoetst - een typefout daarin geeft geen foutmelding
 * maar een leeg scherm. De routes zijn vergeleken met
 * backend/src/routes/seating.ts (gemount op /api/seating) en
 * backend/src/routes/seating-notifications.ts (op /api/seating-notifications).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
} from '../seating';

beforeEach(() => startNepserver());
afterEach(() => stopNepserver());

// ===========================================
// SECTIES
// ===========================================

describe('secties', () => {
  it('getSeatingSections bevraagt de secties van een orkest', async () => {
    antwoordMet([{ id: 's1', name: 'Klarinetten', rowNumber: 2 }]);
    const secties = await getSeatingSections('o1');

    expect(laatsteVerzoek().methode).toBe('get');
    expect(laatsteVerzoek().pad).toBe('/seating/sections/o1');
    expect(secties).toHaveLength(1);
  });

  it('getSeatingSections geeft een lege lijst terug als er nog niets is ingericht', async () => {
    antwoordMet([]);
    await expect(getSeatingSections('o1')).resolves.toEqual([]);
  });

  it('createDefaultSeatingLayout post op de default-route zonder body', async () => {
    antwoordMet({ message: 'Standaardopstelling aangemaakt' });
    await createDefaultSeatingLayout('o1');

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/seating/sections/o1/default');
    expect(verzoek.body).toBeUndefined();
  });

  it('createSeatingSection post naar /seating/sections met het orkest in de body', async () => {
    antwoordMet({ id: 's9', message: 'Sectie aangemaakt' });
    await createSeatingSection({ orchestraId: 'o1', name: 'Trompetten', rowNumber: 3, instrumentIds: ['i1', 'i2'] });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    // Het orkest zit hier in de body, niet in het pad.
    expect(verzoek.pad).toBe('/seating/sections');
    expect(verzoek.body).toEqual({
      orchestraId: 'o1',
      name: 'Trompetten',
      rowNumber: 3,
      instrumentIds: ['i1', 'i2'],
    });
  });

  it('createSeatingSection stuurt rijnummer 0 mee in plaats van het weg te laten', async () => {
    antwoordMet({ id: 's9', message: '' });
    await createSeatingSection({ orchestraId: 'o1', name: 'Dirigent', rowNumber: 0 });

    expect(laatsteVerzoek().body).toEqual({ orchestraId: 'o1', name: 'Dirigent', rowNumber: 0 });
  });

  it('updateSeatingSection gebruikt PUT op /seating/sections/:id', async () => {
    antwoordMet({ message: 'Bijgewerkt' });
    await updateSeatingSection('s1', { name: 'Hoorns', rowNumber: 4 });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('put');
    expect(verzoek.pad).toBe('/seating/sections/s1');
    expect(verzoek.body).toEqual({ name: 'Hoorns', rowNumber: 4 });
  });

  it('updateSeatingSection kan de instrumentenlijst leegmaken', async () => {
    antwoordMet({ message: '' });
    await updateSeatingSection('s1', { instrumentIds: [] });

    // Een lege array is iets anders dan "niet meegestuurd": zo koppel je alle
    // instrumenten los van de sectie.
    expect(laatsteVerzoek().body).toEqual({ instrumentIds: [] });
  });

  it('deleteSeatingSection verwijdert een enkele sectie', async () => {
    antwoordMet({ message: 'Verwijderd' });
    await deleteSeatingSection('s1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/seating/sections/s1');
  });

  it('deleteAllSeatingSections gebruikt de orchestra-route en niet het sectie-id', async () => {
    antwoordMet({ message: 'Alles verwijderd' });
    await deleteAllSeatingSections('o1');

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('delete');
    // Zonder het extra segment 'orchestra' wist je hier de sectie met dat id.
    expect(verzoek.pad).toBe('/seating/sections/orchestra/o1');
  });

  it('laat een 403 door voor wie geen beheerder is', async () => {
    antwoordMetFout(403, { error: 'Geen toegang.' });

    await expect(deleteAllSeatingSections('o1')).rejects.toMatchObject({ response: { status: 403 } });
  });
});

// ===========================================
// PLAATSTOEWIJZINGEN
// ===========================================

describe('plaatstoewijzingen', () => {
  it('getSeatingAssignments bevraagt de toewijzingen van een orkest', async () => {
    antwoordMet([]);
    await getSeatingAssignments('o1');

    expect(laatsteVerzoek().pad).toBe('/seating/assignments/o1');
  });

  it('createSeatingAssignment post de toewijzing', async () => {
    antwoordMet({ id: 'a1', message: 'Toegewezen' });
    await createSeatingAssignment({
      orchestraId: 'o1',
      userId: 'u1',
      sectionId: 's1',
      positionInSection: 2,
      seatLabel: '2A',
      notes: 'Links van de dirigent',
    });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/seating/assignments');
    expect(verzoek.body).toEqual({
      orchestraId: 'o1',
      userId: 'u1',
      sectionId: 's1',
      positionInSection: 2,
      seatLabel: '2A',
      notes: 'Links van de dirigent',
    });
  });

  it('createSeatingAssignment stuurt positie 0 mee', async () => {
    antwoordMet({ id: 'a1', message: '' });
    await createSeatingAssignment({ orchestraId: 'o1', userId: 'u1', sectionId: 's1', positionInSection: 0 });

    expect(laatsteVerzoek().body).toMatchObject({ positionInSection: 0 });
  });

  it('updateSeatingAssignment gebruikt PUT met het toewijzings-id', async () => {
    antwoordMet({ message: 'Bijgewerkt' });
    await updateSeatingAssignment('a1', { sectionId: 's2', positionInSection: 1 });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('put');
    expect(verzoek.pad).toBe('/seating/assignments/a1');
    expect(verzoek.body).toEqual({ sectionId: 's2', positionInSection: 1 });
  });

  it('deleteSeatingAssignment verwijdert een toewijzing', async () => {
    antwoordMet({ message: 'Verwijderd' });
    await deleteSeatingAssignment('a1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/seating/assignments/a1');
  });

  it('bulkUpdateSeatingAssignments zet het orkest in het pad en de lijst onder assignments', async () => {
    antwoordMet({ message: 'Bijgewerkt' });
    await bulkUpdateSeatingAssignments('o1', [
      { userId: 'u1', sectionId: 's1', positionInSection: 1 },
      { userId: 'u2', sectionId: 's1', positionInSection: 2 },
    ]);

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('put');
    expect(verzoek.pad).toBe('/seating/assignments/bulk/o1');
    // De backend leest req.body.assignments.
    expect(verzoek.body).toEqual({
      assignments: [
        { userId: 'u1', sectionId: 's1', positionInSection: 1 },
        { userId: 'u2', sectionId: 's1', positionInSection: 2 },
      ],
    });
  });

  it('bulkUpdateSeatingAssignments stuurt een lege lijst als er niets toegewezen is', async () => {
    antwoordMet({ message: '' });
    await bulkUpdateSeatingAssignments('o1', []);

    expect(laatsteVerzoek().body).toEqual({ assignments: [] });
  });
});

// ===========================================
// BUURVOORKEUREN
// ===========================================

describe('buurvoorkeuren', () => {
  it('getSeatingNeighbors bevraagt de voorkeuren van een orkest', async () => {
    antwoordMet([]);
    await getSeatingNeighbors('o1');

    expect(laatsteVerzoek().pad).toBe('/seating/neighbors/o1');
  });

  it.each(['preferred', 'avoid'] as const)('createSeatingNeighbor stuurt de voorkeur %s mee', async (voorkeur) => {
    antwoordMet({ id: 'n1', message: 'Opgeslagen' });
    await createSeatingNeighbor({ orchestraId: 'o1', userId: 'u1', neighborUserId: 'u2', preference: voorkeur });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/seating/neighbors');
    expect(verzoek.body).toEqual({
      orchestraId: 'o1',
      userId: 'u1',
      neighborUserId: 'u2',
      preference: voorkeur,
    });
  });

  it('deleteSeatingNeighbor verwijdert een voorkeur', async () => {
    antwoordMet({ message: 'Verwijderd' });
    await deleteSeatingNeighbor('n1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/seating/neighbors/n1');
  });
});

// ===========================================
// REPETITIE-OPSTELLING
// ===========================================

describe('repetitie-opstelling', () => {
  it('getRehearsalSeating bevraagt de plaatsen van een repetitie', async () => {
    antwoordMet([]);
    await getRehearsalSeating('r1');

    expect(laatsteVerzoek().pad).toBe('/seating/rehearsal/r1');
  });

  it('generateRehearsalSeating post op de generate-route zonder body', async () => {
    antwoordMet({ message: 'Opstelling gegenereerd', memberCount: 42 });
    const resultaat = await generateRehearsalSeating('r1');

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/seating/rehearsal/r1/generate');
    expect(verzoek.body).toBeUndefined();
    expect(resultaat.memberCount).toBe(42);
  });

  it('updateRehearsalSeat zet repetitie en plaats in het pad', async () => {
    antwoordMet({ message: 'Verplaatst' });
    await updateRehearsalSeat('r1', 'seat1', { rowNumber: 3, positionInRow: 5 });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('put');
    // Het segment 'seat' hoort er tussen te staan (zie de backend-route).
    expect(verzoek.pad).toBe('/seating/rehearsal/r1/seat/seat1');
    expect(verzoek.body).toEqual({ rowNumber: 3, positionInRow: 5 });
  });

  it('updateRehearsalSeat stuurt rij 0 en positie 0 mee', async () => {
    antwoordMet({ message: '' });
    await updateRehearsalSeat('r1', 'seat1', { rowNumber: 0, positionInRow: 0 });

    expect(laatsteVerzoek().body).toEqual({ rowNumber: 0, positionInRow: 0 });
  });
});

describe('getSeatingChart', () => {
  it('bevraagt de plattegrond van een orkest zonder repetitie', async () => {
    antwoordMet({ sections: [], assignments: [] });
    await getSeatingChart('o1');

    const verzoek = laatsteVerzoek();
    expect(verzoek.pad).toBe('/seating/chart/o1');
    expect(verzoek.queryreeks).toBe('');
  });

  it('geeft de repetitie mee als queryparameter', async () => {
    antwoordMet({ sections: [], assignments: [] });
    await getSeatingChart('o1', 'r1');

    expect(laatsteVerzoek().query.get('rehearsalId')).toBe('r1');
    expect(laatsteVerzoek().queryreeks).toBe('rehearsalId=r1');
  });

  it('laat een 404 door in plaats van een lege plattegrond te verzinnen', async () => {
    antwoordMetFout(404, { error: 'Orkest niet gevonden.' });

    await expect(getSeatingChart('o1')).rejects.toMatchObject({ response: { status: 404 } });
  });
});

// ===========================================
// MELDINGEN
// ===========================================

describe('meldingsinstellingen', () => {
  it('getSeatingNotificationSettings bevraagt de instellingen per orkest', async () => {
    antwoordMet({ id: 'set1', orchestra_id: 'o1', notification_type: 'webhook' });
    await getSeatingNotificationSettings('o1');

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('get');
    // Let op: dit is een eigen mount (/api/seating-notifications), geen
    // subpad van /api/seating.
    expect(verzoek.pad).toBe('/seating-notifications/settings/o1');
  });

  it('getSeatingNotificationSettings geeft null door als er nog niets is ingesteld', async () => {
    antwoordMet(null);

    await expect(getSeatingNotificationSettings('o1')).resolves.toBeNull();
  });

  it('saveSeatingNotificationSettings gebruikt PUT en houdt de veldnamen met liggend streepje aan', async () => {
    antwoordMet({ id: 'set1' });
    await saveSeatingNotificationSettings('o1', {
      notification_type: 'whatsapp',
      twilio_account_sid: 'AC-test-0000',
      twilio_auth_token: 'testtoken',
      twilio_whatsapp_from: '+31600000000',
      twilio_whatsapp_to: '+31611111111',
      minutes_before: 60,
      enabled: true,
      include_image: false,
      message_template: 'Opstelling voor {{repetitie}}',
    });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('put');
    expect(verzoek.pad).toBe('/seating-notifications/settings/o1');
    // De backend leest deze snake_case-namen letterlijk uit req.body.
    expect(verzoek.body).toEqual({
      notification_type: 'whatsapp',
      twilio_account_sid: 'AC-test-0000',
      twilio_auth_token: 'testtoken',
      twilio_whatsapp_from: '+31600000000',
      twilio_whatsapp_to: '+31611111111',
      minutes_before: 60,
      enabled: true,
      include_image: false,
      message_template: 'Opstelling voor {{repetitie}}',
    });
  });

  it('saveSeatingNotificationSettings stuurt enabled false en minutes_before 0 mee', async () => {
    antwoordMet({ id: 'set1' });
    await saveSeatingNotificationSettings('o1', {
      notification_type: 'webhook',
      webhook_url: 'https://haken.example/opstelling',
      minutes_before: 0,
      enabled: false,
      include_image: true,
    });

    // Uitzetten is een waarde, geen ontbrekend veld.
    expect(laatsteVerzoek().body).toMatchObject({ enabled: false, minutes_before: 0 });
  });

  it('deleteSeatingNotificationSettings verwijdert de instellingen', async () => {
    antwoordMet({ success: true });
    await deleteSeatingNotificationSettings('o1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/seating-notifications/settings/o1');
  });

  it('getSeatingNotificationLogs bevraagt het logboek per repetitie', async () => {
    antwoordMet([]);
    await getSeatingNotificationLogs('r1');

    expect(laatsteVerzoek().pad).toBe('/seating-notifications/logs/r1');
  });

  it('sendSeatingNotification post naar de send-route met de afbeelding in de body', async () => {
    antwoordMet({ success: true, message: 'Verstuurd' });
    await sendSeatingNotification('r1', 'data:image/png;base64,AAAA');

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/seating-notifications/send/r1');
    expect(verzoek.body).toEqual({ imageBase64: 'data:image/png;base64,AAAA' });
  });

  it('sendSeatingNotification stuurt een lege body als er geen afbeelding is', async () => {
    antwoordMet({ success: true, message: '' });
    await sendSeatingNotification('r1');

    expect(laatsteVerzoek().body).toEqual({});
  });

  it('testTwilioConnection post de vier Twilio-velden', async () => {
    antwoordMet({ success: true, message: 'Test message sent successfully' });
    await testTwilioConnection({
      account_sid: 'AC-test-0000',
      auth_token: 'testtoken',
      whatsapp_from: '+31600000000',
      whatsapp_to: '+31611111111',
    });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/seating-notifications/test-twilio');
    // De backend weigert met 400 zodra een van deze vier ontbreekt.
    expect(verzoek.body).toEqual({
      account_sid: 'AC-test-0000',
      auth_token: 'testtoken',
      whatsapp_from: '+31600000000',
      whatsapp_to: '+31611111111',
    });
  });

  it('laat de 400 van een onvolledige Twilio-test doorkomen', async () => {
    antwoordMetFout(400, { error: 'All Twilio fields are required' });

    await expect(
      testTwilioConnection({ account_sid: '', auth_token: '', whatsapp_from: '', whatsapp_to: '' }),
    ).rejects.toMatchObject({ response: { status: 400, data: { error: 'All Twilio fields are required' } } });
  });
});

// ===========================================
// ALGEMEEN GEDRAG
// ===========================================

describe('algemeen gedrag van de opstelling-api', () => {
  it('stuurt precies een verzoek per aanroep', async () => {
    antwoordMet([]);
    await getSeatingSections('o1');

    expect(alleVerzoeken()).toHaveLength(1);
  });

  it('werpt bij een netwerkfout zonder respons', async () => {
    antwoordMetNetwerkfout();

    await expect(getSeatingAssignments('o1')).rejects.toMatchObject({ code: 'ERR_NETWORK' });
  });

  it('werpt als het verzoek in de tijdslimiet loopt', async () => {
    antwoordMetTijdslimiet();

    await expect(getSeatingChart('o1')).rejects.toMatchObject({ code: 'ECONNABORTED' });
  });

  it('geeft een leeg antwoordlichaam door als lege string', async () => {
    antwoordMet('', { status: 204 });

    await expect(deleteSeatingSection('s1')).resolves.toBe('');
  });
});
