/**
 * De automatische opschoning per gegevenssoort.
 *
 * Drie van de zes soorten liepen stuk op kolommen die niet bestaan:
 * practice_logs werd opgeruimd op ended_at (de tabel kent practiced_at),
 * audio_recordings op user_id (dat is recorded_by) en verwijderde accounts op
 * users.updated_at (die kolom bestaat niet). De planner vangt de fout per soort
 * op en logt hem alleen, dus de opschoning bleef stil achterwege terwijl de
 * beheerder in het scherm las dat hij aanstond.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import testDb from '../testDb';
import { createTestAssociation, createTestEnvironment, createTestUser, TestAssociation, TestUser } from '../testUtils';
import { triggerCleanup } from '../../scheduler/gdpr-cleanup';

function isoDagenGeleden(dagen: number): string {
  const d = new Date();
  d.setDate(d.getDate() - dagen);
  return d.toISOString();
}

function stelBewaartermijnIn(associationId: string, dataType: string, dagen: number): void {
  testDb
    .prepare(
      `INSERT INTO data_retention_settings (id, association_id, data_type, retention_days, auto_delete)
       VALUES (?, ?, ?, ?, 1)`,
    )
    .run(uuidv4(), associationId, dataType, dagen);
}

function maakTitel(associationId: string): string {
  const id = uuidv4();
  testDb.prepare("INSERT INTO music_titles (id, title, association_id) VALUES (?, 'Mars', ?)").run(id, associationId);
  return id;
}

function maakOefenlogboek(userId: string, titelId: string, datum: string): string {
  const id = uuidv4();
  testDb
    .prepare(
      'INSERT INTO practice_logs (id, user_id, music_title_id, duration_minutes, practiced_at) VALUES (?, ?, ?, 30, ?)',
    )
    .run(id, userId, titelId, datum);
  return id;
}

function aantal(sql: string, ...params: unknown[]): number {
  const rij = testDb.prepare(sql).get(...params) as { n: number };
  return rij.n;
}

describe('Automatische opschoning per gegevenssoort', () => {
  let vereniging: TestAssociation;
  let lid: TestUser;
  let titelId: string;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    lid = omgeving.memberUser;
    titelId = maakTitel(vereniging.id);
    testDb.prepare('DELETE FROM data_retention_settings').run();
  });

  it('ruimt oefenlogboeken op die ouder zijn dan de bewaartermijn', async () => {
    const oud = maakOefenlogboek(lid.id, titelId, isoDagenGeleden(400));
    const recent = maakOefenlogboek(lid.id, titelId, isoDagenGeleden(10));

    stelBewaartermijnIn(vereniging.id, 'practice_logs', 365);
    await triggerCleanup();

    expect(aantal('SELECT COUNT(*) AS n FROM practice_logs WHERE id = ?', oud)).toBe(0);
    expect(aantal('SELECT COUNT(*) AS n FROM practice_logs WHERE id = ?', recent)).toBe(1);
  });

  it('ruimt oude opnamen op van leden van de vereniging', async () => {
    const oud = uuidv4();
    const recent = uuidv4();
    for (const [id, datum] of [
      [oud, isoDagenGeleden(400)],
      [recent, isoDagenGeleden(10)],
    ]) {
      testDb
        .prepare(
          `INSERT INTO audio_recordings (id, association_id, title, file_path, file_size, duration_seconds, recorded_by, created_at)
           VALUES (?, ?, 'Opname', '/tmp/o.mp3', 1024, 60, ?, ?)`,
        )
        .run(id, vereniging.id, lid.id, datum);
    }

    stelBewaartermijnIn(vereniging.id, 'audio_recordings', 365);
    await triggerCleanup();

    expect(aantal('SELECT COUNT(*) AS n FROM audio_recordings WHERE id = ?', oud)).toBe(0);
    expect(aantal('SELECT COUNT(*) AS n FROM audio_recordings WHERE id = ?', recent)).toBe(1);
  });

  it('verwijdert accounts die lang genoeg op verwijderd staan', async () => {
    const lang = createTestUser(vereniging.id, { email: `weg-${uuidv4()}@test.nl` });
    const kort = createTestUser(vereniging.id, { email: `net-${uuidv4()}@test.nl` });
    testDb
      .prepare("UPDATE users SET status = 'deleted', deleted_at = ? WHERE id = ?")
      .run(isoDagenGeleden(100), lang.id);
    testDb.prepare("UPDATE users SET status = 'deleted', deleted_at = ? WHERE id = ?").run(isoDagenGeleden(5), kort.id);

    stelBewaartermijnIn(vereniging.id, 'deleted_users', 30);
    await triggerCleanup();

    expect(aantal('SELECT COUNT(*) AS n FROM users WHERE id = ?', lang.id)).toBe(0);
    expect(aantal('SELECT COUNT(*) AS n FROM users WHERE id = ?', kort.id)).toBe(1);
  });

  it('laat een actief account met rust, hoe oud ook', async () => {
    stelBewaartermijnIn(vereniging.id, 'deleted_users', 30);
    await triggerCleanup();
    expect(aantal('SELECT COUNT(*) AS n FROM users WHERE id = ?', lid.id)).toBe(1);
  });

  it('blijft van de gegevens van een andere vereniging af', async () => {
    const andereVereniging = createTestAssociation();
    const anderLid = createTestUser(andereVereniging.id, { email: `ander-${uuidv4()}@test.nl` });
    const andereTitel = maakTitel(andereVereniging.id);
    const vanAnder = maakOefenlogboek(anderLid.id, andereTitel, isoDagenGeleden(400));

    stelBewaartermijnIn(vereniging.id, 'practice_logs', 365);
    await triggerCleanup();

    expect(aantal('SELECT COUNT(*) AS n FROM practice_logs WHERE id = ?', vanAnder)).toBe(1);
  });

  it('doet niets wanneer automatisch opruimen uitstaat', async () => {
    const oud = maakOefenlogboek(lid.id, titelId, isoDagenGeleden(400));
    testDb
      .prepare(
        `INSERT INTO data_retention_settings (id, association_id, data_type, retention_days, auto_delete)
         VALUES (?, ?, 'practice_logs', 365, 0)`,
      )
      .run(uuidv4(), vereniging.id);

    await triggerCleanup();
    expect(aantal('SELECT COUNT(*) AS n FROM practice_logs WHERE id = ?', oud)).toBe(1);
  });

  it('meldt per gegevenssoort hoeveel er is opgeruimd', async () => {
    maakOefenlogboek(lid.id, titelId, isoDagenGeleden(400));
    stelBewaartermijnIn(vereniging.id, 'practice_logs', 365);

    const resultaten = await triggerCleanup();
    const oefenlogboek = resultaten.find((r) => r.data_type === 'practice_logs');
    expect(oefenlogboek?.deleted_count).toBe(1);
  });
});
