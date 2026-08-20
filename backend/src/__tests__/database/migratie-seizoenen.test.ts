/**
 * Een migratie die een tabel herbouwt mag de kinderen niet meenemen.
 *
 * connection.ts zet PRAGMA foreign_keys = ON. DROP TABLE voert dan eerst een
 * impliciete DELETE uit, en die laat ON DELETE CASCADE en ON DELETE SET NULL
 * afgaan op elke tabel die naar de gedropte tabel verwijst. Migratie
 * 20260820000005 bouwt seasons opnieuw op, en drie tabellen verwijzen daarnaar:
 *
 *   season_events            ON DELETE CASCADE    -> alle rijen weg
 *   attendance_stats         ON DELETE SET NULL   -> koppeling weg
 *   section_attendance_stats ON DELETE SET NULL   -> koppeling weg
 *
 * Dat ging in de eerste versie van die migratie ook echt mis, en het viel niet
 * op omdat migraties in de tests tegen een lege database draaien: er was niets
 * om kwijt te raken. Deze test zet er daarom eerst gegevens in.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import { up as herbouwSeizoenen } from '../../migrations/20260820000005_seasons_status_en_events';

/** Zet seasons terug in de vorm van vóór de migratie. */
function herstelOudeSeizoenstabel(): void {
  db.prepare('DROP TABLE IF EXISTS seasons').run();
  db.prepare(
    `CREATE TABLE seasons (
      id TEXT PRIMARY KEY,
      association_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      status TEXT DEFAULT 'planning' CHECK(status IN ('planning', 'active', 'completed', 'archived')),
      budget REAL,
      notes TEXT,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      template_id TEXT,
      budget_total REAL,
      budget_allocated REAL DEFAULT 0,
      FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    )`,
  ).run();
}

function tel(tabel: string, waar = '1=1'): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM ${tabel} WHERE ${waar}`).get() as { n: number }).n;
}

describe('de seizoensmigratie laat de gekoppelde gegevens staan', () => {
  let verenigingId: string;
  let seizoenId: string;

  beforeEach(() => {
    verenigingId = uuidv4();
    db.prepare('INSERT INTO associations (id, name) VALUES (?, ?)').run(verenigingId, `Test ${verenigingId}`);

    herstelOudeSeizoenstabel();

    seizoenId = uuidv4();
    db.prepare(
      `INSERT INTO seasons (id, association_id, name, start_date, end_date, status)
       VALUES (?, ?, 'Seizoen 2026-2027', '2026-09-01', '2027-06-30', 'planning')`,
    ).run(seizoenId, verenigingId);

    db.prepare(
      `INSERT INTO season_events (id, season_id, event_type, event_id, planned_date)
       VALUES (?, ?, 'concert', ?, '2026-12-20')`,
    ).run(uuidv4(), seizoenId, uuidv4());
    db.prepare(
      `INSERT INTO season_events (id, season_id, event_type, event_id, planned_date)
       VALUES (?, ?, 'rehearsal', ?, '2026-09-08')`,
    ).run(uuidv4(), seizoenId, uuidv4());
  });

  it('begint met evenementen die aan het seizoen hangen', () => {
    expect(tel('season_events', `season_id = '${seizoenId}'`)).toBe(2);
  });

  it('laat de evenementen van het seizoen staan', () => {
    herbouwSeizoenen();

    // Hier ging het mis: de impliciete DELETE van DROP TABLE liet de cascade
    // afgaan en de teller stond daarna op nul.
    expect(tel('season_events', `season_id = '${seizoenId}'`)).toBe(2);
  });

  it('houdt de soorten evenementen intact', () => {
    herbouwSeizoenen();

    const soorten = (
      db.prepare('SELECT event_type FROM season_events WHERE season_id = ? ORDER BY event_type').all(seizoenId) as {
        event_type: string;
      }[]
    ).map((r) => r.event_type);
    expect(soorten).toEqual(['concert', 'rehearsal']);
  });

  it('houdt de koppeling in de aanwezigheidsstatistiek intact', () => {
    const statId = uuidv4();
    const gebruikerId = uuidv4();
    db.prepare(
      "INSERT INTO users (id, association_id, email, password_hash, first_name, last_name) VALUES (?, ?, ?, 'x', 'Test', 'Lid')",
    ).run(gebruikerId, verenigingId, `stat-${gebruikerId}@test.nl`);
    db.prepare(
      `INSERT INTO attendance_stats (id, association_id, user_id, period_type, period_start, period_end, season_id)
       VALUES (?, ?, ?, 'season', '2026-09-01', '2027-06-30', ?)`,
    ).run(statId, verenigingId, gebruikerId, seizoenId);

    herbouwSeizoenen();

    const rij = db.prepare('SELECT season_id FROM attendance_stats WHERE id = ?').get(statId) as {
      season_id: string | null;
    };
    expect(rij.season_id).toBe(seizoenId);
  });

  it('houdt de koppeling in de sectiestatistiek intact', () => {
    const statId = uuidv4();
    db.prepare(
      `INSERT INTO section_attendance_stats (id, association_id, section_id, period_type, period_start, period_end, season_id)
       VALUES (?, ?, ?, 'season', '2026-09-01', '2027-06-30', ?)`,
    ).run(statId, verenigingId, uuidv4(), seizoenId);

    herbouwSeizoenen();

    const rij = db.prepare('SELECT season_id FROM section_attendance_stats WHERE id = ?').get(statId) as {
      season_id: string | null;
    };
    expect(rij.season_id).toBe(seizoenId);
  });

  it('zet planning om naar draft en houdt het seizoen zelf heel', () => {
    herbouwSeizoenen();

    const rij = db.prepare('SELECT name, status, start_date FROM seasons WHERE id = ?').get(seizoenId) as {
      name: string;
      status: string;
      start_date: string;
    };
    expect(rij).toMatchObject({ name: 'Seizoen 2026-2027', status: 'draft', start_date: '2026-09-01' });
  });

  it('doet niets meer als hij al eerder is gedraaid', () => {
    herbouwSeizoenen();
    herbouwSeizoenen();

    expect(tel('season_events', `season_id = '${seizoenId}'`)).toBe(2);
    expect(tel('seasons', `id = '${seizoenId}'`)).toBe(1);
  });
});
