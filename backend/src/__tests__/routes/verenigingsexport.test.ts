/**
 * GET /api/backup/vereniging: een kopie van de gegevens van de eigen
 * vereniging, voor de beheerder (services/verenigingsExport.ts).
 *
 * Wat hier vastligt:
 * - de beheerder krijgt een ZIP met de rijen en bestanden van zijn
 *   vereniging, ook uit tabellen die alleen via een andere tabel bij de
 *   vereniging horen (aanwezigheid bij een repetitie);
 * - **geen spoor van een andere vereniging**: geen enkel bestand in het
 *   archief noemt haar id of de ids van haar rijen, en haar bladmuziek zit er
 *   niet in;
 * - geen geheimen: geen wachtwoord-hash, geen SMTP-wachtwoord, geen code van
 *   een kaartje, en geen sessies;
 * - alleen voor de beheerder.
 */

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const tijdelijk = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeFs = require('fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeOs = require('os');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodePath = require('path');
  const map = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), 'tutti-export-'));
  const eerder = process.env.UPLOAD_DIR;
  process.env.UPLOAD_DIR = map;
  return { map: map as string, eerder };
});

import '../setup';
import db from '../../database/connection';
import backupRoutes from '../../routes/backup';
import { errorHandler } from '../../middleware/errorHandler';
import { createTestAssociation, createTestUser, generateTestToken, createTestMusicPiece } from '../testUtils';
import { maakExportPlan } from '../../services/verenigingsExport';

const app = express();
app.use('/api/backup', backupRoutes);
app.use(errorHandler);

afterAll(() => {
  if (tijdelijk.eerder === undefined) delete process.env.UPLOAD_DIR;
  else process.env.UPLOAD_DIR = tijdelijk.eerder;
  fs.rmSync(tijdelijk.map, { recursive: true, force: true });
});

/** Een vereniging met een beheerder, een lid, een repetitie met aanwezigheid, een kaartje en een stuk bladmuziek. */
function vulVereniging(label: string) {
  const vereniging = createTestAssociation();
  db.prepare("UPDATE associations SET smtp_pass = 'geheim-smtp' WHERE id = ?").run(vereniging.id);
  const beheerder = createTestUser(vereniging.id, { email: `beheer-${label}@voorbeeld.nl`, role: 'admin' });
  const lid = createTestUser(vereniging.id, { email: `lid-${label}@voorbeeld.nl` });

  const repetitie = uuidv4();
  db.prepare(
    "INSERT INTO rehearsals (id, association_id, date, start_time, end_time) VALUES (?, ?, '2026-11-01', '19:30', '22:00')",
  ).run(repetitie, vereniging.id);
  const aanwezigheid = uuidv4();
  db.prepare(
    "INSERT INTO rehearsal_attendance (id, rehearsal_id, user_id, member_name, status) VALUES (?, ?, ?, 'Lid', 'accepted')",
  ).run(aanwezigheid, repetitie, lid.id);

  const concert = uuidv4();
  db.prepare("INSERT INTO concerts (id, association_id, name, date) VALUES (?, ?, 'Concert', '2026-12-01')").run(
    concert,
    vereniging.id,
  );
  const kaartsoort = uuidv4();
  db.prepare("INSERT INTO ticket_types (id, concert_id, name, price, quantity) VALUES (?, ?, 'Regulier', 10, 10)").run(
    kaartsoort,
    concert,
  );
  const bestelling = uuidv4();
  db.prepare(
    "INSERT INTO ticket_orders (id, concert_id, total, status, buyer_name, buyer_email) VALUES (?, ?, 10, 'paid', 'Koper', 'k@v.nl')",
  ).run(bestelling, concert);
  db.prepare(
    "INSERT INTO tickets (id, ticket_type_id, order_id, buyer_name, buyer_email, qr_code, status) VALUES (?, ?, ?, 'Koper', 'k@v.nl', ?, 'valid')",
  ).run(uuidv4(), kaartsoort, bestelling, `GEHEIME-KAARTCODE-${label}`);

  db.prepare(
    "INSERT INTO user_sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, '2999-01-01T00:00:00.000Z')",
  ).run(uuidv4(), lid.id, `sessie-${label}`);

  const stuk = createTestMusicPiece(vereniging.id, { filePath: `stuk-${label}.pdf` });
  fs.writeFileSync(path.join(tijdelijk.map, `stuk-${label}.pdf`), `%PDF-1.4 ${label}`);

  return {
    vereniging,
    beheerderToken: generateTestToken(beheerder),
    lidToken: generateTestToken(lid),
    ids: [vereniging.id, beheerder.id, lid.id, repetitie, aanwezigheid, concert, bestelling, stuk.id],
  };
}

async function exporteer(token: string) {
  return request(app)
    .get('/api/backup/vereniging')
    .set('Authorization', `Bearer ${token}`)
    .buffer(true)
    .parse((res, klaar) => {
      const delen: Buffer[] = [];
      res.on('data', (deel: Buffer) => delen.push(deel));
      res.on('end', () => klaar(null, Buffer.concat(delen)));
    });
}

const json = (zip: AdmZip, naam: string) => JSON.parse(zip.readAsText(naam)) as Record<string, unknown>[];

describe('gegevens van de vereniging downloaden', () => {
  let a: ReturnType<typeof vulVereniging>;
  let b: ReturnType<typeof vulVereniging>;

  beforeEach(() => {
    a = vulVereniging('a');
    b = vulVereniging('b');
  });

  it('geeft de beheerder een ZIP met de gegevens van de eigen vereniging', async () => {
    const antwoord = await exporteer(a.beheerderToken);

    expect(antwoord.status).toBe(200);
    expect(antwoord.headers['content-type']).toBe('application/zip');
    const zip = new AdmZip(antwoord.body as Buffer);
    const namen = zip.getEntries().map((e) => e.entryName);

    expect(namen).toEqual(
      expect.arrayContaining(['LEESMIJ.txt', 'manifest.json', 'gegevens/rehearsal_attendance.json']),
    );
    expect(json(zip, 'gegevens/associations.json').map((r) => r.id)).toEqual([a.vereniging.id]);
    expect(json(zip, 'gegevens/rehearsal_attendance.json')).toHaveLength(1);
    expect(namen).toContain('bestanden/bladmuziek/stuk-a.pdf');
  });

  it('bevat geen spoor van een andere vereniging', async () => {
    const zip = new AdmZip((await exporteer(a.beheerderToken)).body as Buffer);

    for (const entry of zip.getEntries()) {
      const inhoud = entry.getData().toString('utf-8');
      for (const id of b.ids) {
        expect(inhoud, `${entry.entryName} noemt ${id}`).not.toContain(id);
      }
    }
    expect(zip.getEntries().map((e) => e.entryName)).not.toContain('bestanden/bladmuziek/stuk-b.pdf');
  });

  it('laat geheimen en sessies weg', async () => {
    const zip = new AdmZip((await exporteer(a.beheerderToken)).body as Buffer);
    const alles = zip
      .getEntries()
      .map((e) => e.getData().toString('utf-8'))
      .join('\n');

    expect(alles).not.toContain('geheim-smtp');
    expect(alles).not.toContain('GEHEIME-KAARTCODE-a');
    expect(alles).not.toContain('sessie-a');
    expect(json(zip, 'gegevens/users.json').every((u) => !('password_hash' in u))).toBe(true);

    const manifest = JSON.parse(zip.readAsText('manifest.json'));
    expect(manifest.nietMeegenomen).toEqual(expect.arrayContaining(['user_sessions', 'notifications']));
  });

  it('is alleen voor de beheerder', async () => {
    expect((await exporteer(a.lidToken)).status).toBe(403);
    expect((await request(app).get('/api/backup/vereniging')).status).toBe(401);
  });
});

describe('het exportplan', () => {
  it('filtert elke tabel die meegaat op de vereniging', () => {
    for (const { tabel, voorwaarde } of maakExportPlan().tabellen) {
      expect(voorwaarde, tabel).toContain('?');
    }
  });

  it('neemt platformtabellen en tabellen met alleen geheimen nooit mee', () => {
    const mee = maakExportPlan().tabellen.map((t) => t.tabel);
    for (const tabel of [
      'super_admins',
      'user_sessions',
      'password_reset_tokens',
      'mfa_recovery_codes',
      'migrations',
    ]) {
      expect(mee, tabel).not.toContain(tabel);
    }
  });
});
