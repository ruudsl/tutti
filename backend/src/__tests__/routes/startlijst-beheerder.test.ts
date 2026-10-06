/**
 * GET /api/settings/startlijst: wat de beheerder van een nieuwe vereniging
 * nog moet doen (services/startlijst.ts).
 *
 * Wat hier vastligt:
 * - een verse vereniging heeft alles nog open;
 * - elke stap gaat vanzelf op gedaan zodra de gegevens er zijn, en terug als
 *   ze verdwijnen (de SMTP gaat uit);
 * - e-mail telt ook als de installatie zelf een SMTP_HOST heeft;
 * - wat een andere vereniging doet, telt niet mee;
 * - alleen voor de beheerder.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import settingsRoutes from '../../routes/settings';
import { errorHandler } from '../../middleware/errorHandler';
import { createTestAssociation, createTestEnvironment, createTestOrchestra } from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api/settings', settingsRoutes);
app.use(errorHandler);

let omgeving: ReturnType<typeof createTestEnvironment>;
const eerderSmtp = process.env.SMTP_HOST;

beforeEach(() => {
  delete process.env.SMTP_HOST;
  omgeving = createTestEnvironment();
  // createTestEnvironment maakt ook leden aan; voor een verse vereniging
  // zijn die er nog niet.
  db.prepare('UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE association_id = ? AND id != ?').run(
    omgeving.association.id,
    omgeving.adminUser.id,
  );
});

afterEach(() => {
  if (eerderSmtp === undefined) delete process.env.SMTP_HOST;
  else process.env.SMTP_HOST = eerderSmtp;
});

async function stappen(token = omgeving.adminToken): Promise<Record<string, boolean>> {
  const antwoord = await request(app).get('/api/settings/startlijst').set('Authorization', `Bearer ${token}`);
  expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
  return Object.fromEntries(
    (antwoord.body.stappen as { sleutel: string; gedaan: boolean }[]).map((s) => [s.sleutel, s.gedaan]),
  );
}

describe('de startlijst van de beheerder', () => {
  it('heeft bij een verse vereniging alles nog open', async () => {
    expect(await stappen()).toEqual({
      email: false,
      tweestap: false,
      modules: false,
      orkesten: false,
      leden: false,
      repetities: false,
      bewaartermijnen: false,
    });
  });

  it('vinkt elke stap af aan de hand van de gegevens', async () => {
    const id = omgeving.association.id;
    db.prepare("UPDATE associations SET smtp_enabled = 1, smtp_host = 'smtp.voorbeeld.nl' WHERE id = ?").run(id);
    db.prepare('UPDATE users SET mfa_enabled = 1 WHERE id = ?').run(omgeving.adminUser.id);
    db.prepare(
      "INSERT INTO association_modules (id, association_id, module_key, enabled, updated_by) VALUES (?, ?, 'wiki', 1, ?)",
    ).run(uuidv4(), id, omgeving.adminUser.id);
    createTestOrchestra(id);
    db.prepare('UPDATE users SET deleted_at = NULL WHERE id = ?').run(omgeving.memberUser.id);
    db.prepare(
      "INSERT INTO rehearsals (id, association_id, date, start_time, end_time) VALUES (?, ?, '2099-01-05', '19:30', '22:00')",
    ).run(uuidv4(), id);
    db.prepare(
      "INSERT INTO data_retention_settings (id, association_id, data_type, retention_days) VALUES (?, ?, 'audit_logs', 365)",
    ).run(uuidv4(), id);

    expect(Object.values(await stappen()).every(Boolean)).toBe(true);
  });

  it('zet e-mail terug op open als de SMTP uit gaat', async () => {
    db.prepare("UPDATE associations SET smtp_enabled = 1, smtp_host = 'smtp.voorbeeld.nl' WHERE id = ?").run(
      omgeving.association.id,
    );
    expect((await stappen()).email).toBe(true);

    db.prepare('UPDATE associations SET smtp_enabled = 0 WHERE id = ?').run(omgeving.association.id);
    expect((await stappen()).email).toBe(false);
  });

  it('telt de SMTP van de installatie mee', async () => {
    process.env.SMTP_HOST = 'smtp.installatie.nl';

    expect((await stappen()).email).toBe(true);
  });

  it('kijkt niet naar een andere vereniging', async () => {
    const ander = createTestAssociation();
    db.prepare("UPDATE associations SET smtp_enabled = 1, smtp_host = 'smtp.ander.nl' WHERE id = ?").run(ander.id);
    createTestOrchestra(ander.id);

    const uitkomst = await stappen();

    expect(uitkomst.email).toBe(false);
    expect(uitkomst.orkesten).toBe(false);
  });

  it('is alleen voor de beheerder', async () => {
    db.prepare('UPDATE users SET deleted_at = NULL WHERE id = ?').run(omgeving.memberUser.id);
    const antwoord = await request(app)
      .get('/api/settings/startlijst')
      .set('Authorization', `Bearer ${omgeving.memberToken}`);

    expect(antwoord.status).toBe(403);
  });
});
