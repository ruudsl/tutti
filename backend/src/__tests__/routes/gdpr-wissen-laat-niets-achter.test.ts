/**
 * Een AVG-verwijdering laat niets meer achter dat naar het lid wijst.
 *
 * Het goedkeuren van een verwijderverzoek haalde rijen weg en anonimiseerde de
 * gebruiker, maar liet staan:
 *
 * - de profielfoto op schijf (de database bewaart alleen het pad);
 * - telefoonnummers: de WhatsApp-koppeling, een lopende verificatie, het
 *   noodnummer bij een reis, het nummer als chauffeur, een eigen veld;
 * - het Google-token van de agendakoppeling - en bij Google zelf bleef de
 *   toestemming geldig;
 * - naam en e-mailadres in het auditlogboek.
 *
 * Het auditlogboek wordt gepseudonimiseerd, niet gewist (docs/PIA.md heeft
 * hier geen besluit over dat iets anders voorschrijft): de regels blijven.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import logger from '../../utils/logger';
import config from '../../config';
import gdprRoutes from '../../routes/gdpr';
import { errorHandler } from '../../middleware/errorHandler';
import { wisLeden } from '../../scheduler/gdpr-cleanup';
import { createTestEnvironment, createTestUser, TestUser } from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api/gdpr', gdprRoutes);
app.use(errorHandler);

const fotoMap = path.resolve(config.uploadDir, 'profile-photos');

let lid: TestUser;
let beheerder: TestUser;
let beheerderToken: string;
let verenigingId: string;
let fotoPad: string;
let fetchNep: ReturnType<typeof vi.fn>;

function maakVerzoek(userId = lid.id): string {
  const id = uuidv4();
  db.prepare("INSERT INTO deletion_requests (id, user_id, reason, status) VALUES (?, ?, 'Ik stop', 'pending')").run(
    id,
    userId,
  );
  return id;
}

const goedkeuren = (verzoekId: string) =>
  request(app)
    .post(`/api/gdpr/deletion-requests/${verzoekId}/process`)
    .set('Authorization', `Bearer ${beheerderToken}`)
    .send({ action: 'approve' });

function telRijen(sql: string, ...params: unknown[]): number {
  return (db.prepare(sql).get(...params) as { n: number }).n;
}

beforeEach(() => {
  const omgeving = createTestEnvironment();
  lid = omgeving.memberUser;
  beheerder = omgeving.adminUser;
  beheerderToken = omgeving.adminToken;
  verenigingId = omgeving.association.id;

  fs.mkdirSync(fotoMap, { recursive: true });
  fotoPad = path.join(fotoMap, `profile-avgtest-${uuidv4()}.jpg`);
  fs.writeFileSync(fotoPad, 'foto');
  db.prepare('UPDATE users SET profile_photo_path = ? WHERE id = ?').run(fotoPad, lid.id);

  fetchNep = vi.fn(async () => new Response('', { status: 200 }));
  vi.stubGlobal('fetch', fetchNep);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fs.rmSync(fotoPad, { force: true });
});

describe('AVG-verwijdering: de profielfoto', () => {
  it('haalt het bestand van schijf en het pad uit de database', async () => {
    const res = await goedkeuren(maakVerzoek());

    expect(res.status).toBe(200);
    expect(fs.existsSync(fotoPad)).toBe(false);
    const rij = db.prepare('SELECT profile_photo_path FROM users WHERE id = ?').get(lid.id) as {
      profile_photo_path: string | null;
    };
    expect(rij.profile_photo_path).toBeNull();
  });

  it('haalt ook de foto weg als de opruimtaak een lid definitief wist', () => {
    db.prepare("UPDATE users SET status = 'deleted', deleted_at = datetime('now', '-400 days') WHERE id = ?").run(
      lid.id,
    );

    expect(wisLeden([lid.id]).gewist).toEqual([lid.id]);
    expect(fs.existsSync(fotoPad)).toBe(false);
  });

  it('haalt de foto ook weg bij een lid dat niet definitief te wissen is', () => {
    // Een chatbericht houdt het wissen van de rij tegen (docs/PIA.md §6). De
    // foto hoort dan toch weg.
    db.prepare("INSERT INTO chat_messages (id, association_id, user_id, content) VALUES (?, ?, ?, 'hallo')").run(
      uuidv4(),
      verenigingId,
      lid.id,
    );

    expect(wisLeden([lid.id]).geblokkeerd).toEqual([lid.id]);
    expect(fs.existsSync(fotoPad)).toBe(false);
    const rij = db.prepare('SELECT profile_photo_path FROM users WHERE id = ?').get(lid.id) as {
      profile_photo_path: string | null;
    };
    expect(rij.profile_photo_path).toBeNull();
  });

  it('verwijdert geen bestand buiten de map met profielfoto’s', async () => {
    const elders = path.resolve(config.uploadDir, `niet-van-het-lid-${uuidv4()}.jpg`);
    fs.writeFileSync(elders, 'iets anders');
    db.prepare('UPDATE users SET profile_photo_path = ? WHERE id = ?').run(
      path.join(fotoMap, '..', path.basename(elders)),
      lid.id,
    );

    try {
      await goedkeuren(maakVerzoek());
      expect(fs.existsSync(elders)).toBe(true);
    } finally {
      fs.rmSync(elders, { force: true });
    }
  });
});

describe('AVG-verwijdering: telefoonnummers', () => {
  it('haalt nummers weg uit koppelingen, reizen, vervoer en eigen velden', async () => {
    db.prepare(
      "INSERT INTO user_notification_channels (id, user_id, channel_type, channel_id, verified) VALUES (?, ?, 'whatsapp', '+31612345678', 1)",
    ).run(uuidv4(), lid.id);
    db.prepare(
      "INSERT INTO whatsapp_verifications (id, user_id, phone_number, code, expires_at) VALUES (?, ?, '+31612345678', '123456', datetime('now', '+1 hour'))",
    ).run(uuidv4(), lid.id);

    const reisId = uuidv4();
    db.prepare(
      "INSERT INTO tours (id, association_id, name, start_date, end_date, created_by) VALUES (?, ?, 'Concertreis', '2027-05-01', '2027-05-05', ?)",
    ).run(reisId, verenigingId, beheerder.id);
    db.prepare(
      "INSERT INTO tour_participants (id, tour_id, user_id, emergency_contact, emergency_phone) VALUES (?, ?, ?, 'Moeder', '+31687654321')",
    ).run(uuidv4(), reisId, lid.id);

    const evenementId = uuidv4();
    db.prepare(
      "INSERT INTO events (id, association_id, name, start_datetime) VALUES (?, ?, 'Optocht', '2027-06-01T10:00:00Z')",
    ).run(evenementId, verenigingId);
    db.prepare(
      "INSERT INTO event_transport (id, event_id, driver_user_id, driver_name, driver_phone) VALUES (?, ?, ?, 'Member User', '+31611112222')",
    ).run(uuidv4(), evenementId, lid.id);

    const veldId = uuidv4();
    db.prepare(
      "INSERT INTO custom_field_definitions (id, association_id, entity_type, field_key, field_label, field_type) VALUES (?, ?, 'user', 'mobiel', 'Mobiel', 'phone')",
    ).run(veldId, verenigingId);
    db.prepare(
      "INSERT INTO custom_field_values (id, field_definition_id, entity_type, entity_id, value_text) VALUES (?, ?, 'user', ?, '+31699998888')",
    ).run(uuidv4(), veldId, lid.id);

    const res = await goedkeuren(maakVerzoek());
    expect(res.status, JSON.stringify(res.body)).toBe(200);

    expect(telRijen('SELECT COUNT(*) AS n FROM user_notification_channels WHERE user_id = ?', lid.id)).toBe(0);
    expect(telRijen('SELECT COUNT(*) AS n FROM whatsapp_verifications WHERE user_id = ?', lid.id)).toBe(0);
    expect(
      db.prepare('SELECT emergency_contact, emergency_phone FROM tour_participants WHERE user_id = ?').get(lid.id),
    ).toEqual({ emergency_contact: null, emergency_phone: null });
    expect(db.prepare('SELECT driver_phone FROM event_transport WHERE driver_user_id = ?').get(lid.id)).toEqual({
      driver_phone: null,
    });
    expect(
      telRijen("SELECT COUNT(*) AS n FROM custom_field_values WHERE entity_type = 'user' AND entity_id = ?", lid.id),
    ).toBe(0);
  });

  it('laat de eigen velden van een lid in een andere vereniging staan', async () => {
    // Een id is uniek, maar de verwijdering hoort toch binnen de eigen
    // vereniging te blijven: een veld van een andere vereniging raakt ze niet.
    const anderLid = createTestUser(verenigingId, { email: 'ander@test.com' });
    const veldId = uuidv4();
    db.prepare(
      "INSERT INTO custom_field_definitions (id, association_id, entity_type, field_key, field_label, field_type) VALUES (?, ?, 'user', 'mobiel', 'Mobiel', 'phone')",
    ).run(veldId, verenigingId);
    db.prepare(
      "INSERT INTO custom_field_values (id, field_definition_id, entity_type, entity_id, value_text) VALUES (?, ?, 'user', ?, '+31600000000')",
    ).run(uuidv4(), veldId, anderLid.id);

    await goedkeuren(maakVerzoek());

    expect(telRijen('SELECT COUNT(*) AS n FROM custom_field_values WHERE entity_id = ?', anderLid.id)).toBe(1);
  });
});

describe('AVG-verwijdering: de Google-agendakoppeling', () => {
  function koppelGoogle() {
    db.prepare(
      `INSERT INTO user_calendar_settings (id, user_id, feed_token, google_refresh_token, google_access_token)
       VALUES (?, ?, 'feed', 'ververs-token-van-lid', 'toegang-token-van-lid')`,
    ).run(uuidv4(), lid.id);
  }

  it('haalt het token weg en trekt de toestemming in bij Google', async () => {
    koppelGoogle();

    const res = await goedkeuren(maakVerzoek());

    expect(res.status).toBe(200);
    expect(telRijen('SELECT COUNT(*) AS n FROM user_calendar_settings WHERE user_id = ?', lid.id)).toBe(0);
    expect(fetchNep).toHaveBeenCalledTimes(1);
    const [adres, init] = fetchNep.mock.calls[0] as [string, RequestInit];
    expect(String(adres)).toBe('https://oauth2.googleapis.com/revoke');
    expect(init.method).toBe('POST');
    expect(String(init.body)).toContain('token=ververs-token-van-lid');
    // Met een tijdslimiet: beschermdeFetch geeft altijd een signaal mee.
    expect(init.signal).toBeDefined();
  });

  it('probeert het intrekken één keer, ook als Google tijdelijk niet antwoordt', async () => {
    koppelGoogle();
    fetchNep.mockImplementation(async () => new Response('', { status: 503 }));

    const res = await goedkeuren(maakVerzoek());

    expect(res.status).toBe(200);
    expect(fetchNep).toHaveBeenCalledTimes(1);
  });

  it('wist het lid ook als het intrekken mislukt, en zet dat in het logboek', async () => {
    koppelGoogle();
    fetchNep.mockImplementation(async () => {
      throw new TypeError('fetch failed');
    });

    const res = await goedkeuren(maakVerzoek());

    expect(res.status).toBe(200);
    expect(telRijen('SELECT COUNT(*) AS n FROM user_calendar_settings WHERE user_id = ?', lid.id)).toBe(0);
    const rij = db.prepare('SELECT status FROM users WHERE id = ?').get(lid.id) as { status: string };
    expect(rij.status).toBe('deleted');

    const waarschuwingen = vi.mocked(logger.warn).mock.calls.map(([melding]) => String(melding));
    expect(waarschuwingen.some((m) => m.includes('Google'))).toBe(true);
    // Het token zelf hoort niet in het logboek.
    expect(JSON.stringify(vi.mocked(logger.warn).mock.calls)).not.toContain('ververs-token-van-lid');
  });

  it('roept Google niet aan zonder koppeling', async () => {
    await goedkeuren(maakVerzoek());

    expect(fetchNep).not.toHaveBeenCalled();
  });
});

describe('AVG-verwijdering: het auditlogboek', () => {
  function auditregel(userId: string, entityId: string, naam: string, wijzigingen: unknown, vereniging = verenigingId) {
    const id = uuidv4();
    db.prepare(
      `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, entity_name, changes, association_id)
       VALUES (?, ?, 'update', 'user', ?, ?, ?, ?)`,
    ).run(id, userId, entityId, naam, JSON.stringify(wijzigingen), vereniging);
    return id;
  }

  it('vervangt naam en e-mailadres door een pseudoniem en laat de regels staan', async () => {
    const doorBeheerder = auditregel(beheerder.id, lid.id, 'Member User', {
      email: 'Member@Test.com',
      onboarding: true,
    });
    const doorLid = auditregel(lid.id, lid.id, 'Member User', undefined);

    await goedkeuren(maakVerzoek());

    const rijen = db
      .prepare('SELECT id, user_id, entity_name, changes FROM audit_logs WHERE id IN (?, ?) ORDER BY id')
      .all(doorBeheerder, doorLid) as { id: string; user_id: string; entity_name: string; changes: string | null }[];
    expect(rijen).toHaveLength(2);

    const tekst = JSON.stringify(rijen).toLowerCase();
    expect(tekst).not.toContain('member user');
    expect(tekst).not.toContain('member@test.com');

    const vanBeheerder = rijen.find((r) => r.id === doorBeheerder)!;
    expect(vanBeheerder.user_id).toBe(beheerder.id);
    expect(vanBeheerder.entity_name).toBe('Deleted User');
    expect(JSON.parse(vanBeheerder.changes!)).toEqual({
      email: `deleted_${lid.id}@deleted.local`,
      onboarding: true,
    });
  });

  it('laat regels over andere leden en andere verenigingen ongemoeid', async () => {
    const ander = createTestUser(verenigingId, { email: 'ander@test.com', firstName: 'Ander', lastName: 'Lid' });
    const overAnder = auditregel(beheerder.id, ander.id, 'Ander Lid', { opmerking: 'niet Member User' });

    await goedkeuren(maakVerzoek());

    const rij = db.prepare('SELECT entity_name, changes FROM audit_logs WHERE id = ?').get(overAnder) as {
      entity_name: string;
      changes: string;
    };
    expect(rij.entity_name).toBe('Ander Lid');
    expect(JSON.parse(rij.changes)).toEqual({ opmerking: 'niet Member User' });
  });
});
