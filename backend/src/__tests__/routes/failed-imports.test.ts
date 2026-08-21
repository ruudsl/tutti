/**
 * Mislukte imports opnieuw proberen.
 *
 * Dit bestand had geen tests. Het gaat om een herstelpoging die een partij
 * alsnog in de bibliotheek zet, en die daarbij de `list_id` gebruikt die ooit
 * met de mislukte import is meegekomen uit een aanvraag. Die id werd sindsdien
 * nooit gecontroleerd, dus een herstelpoging kon een partij op de
 * repertoirelijst van een vreemd orkest zetten.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import failedImportsRoutes from '../../routes/failed-imports';
import { errorHandler } from '../../middleware/errorHandler';
import { createTestAssociation, createTestEnvironment, createTestOrchestra, TestAssociation } from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api/failed-imports', failedImportsRoutes);
app.use(errorHandler);

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '../../../uploads');

let vereniging: TestAssociation;
let adminToken: string;
const neergezet: string[] = [];

beforeEach(() => {
  const omgeving = createTestEnvironment();
  vereniging = omgeving.association;
  adminToken = omgeving.adminToken;
});

afterEach(() => {
  for (const naam of neergezet.splice(0)) {
    try {
      fs.unlinkSync(path.join(UPLOAD_DIR, naam));
    } catch {
      // Al weg, of nooit aangemaakt - niets aan de hand.
    }
  }
});

/** De herstelpoging eist dat het oorspronkelijke bestand er nog staat. */
function legBestandNeer(): string {
  const naam = `test-${uuidv4()}.pdf`;
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.writeFileSync(path.join(UPLOAD_DIR, naam), '%PDF-1.4 testbestand');
  neergezet.push(naam);
  return naam;
}

function maakMislukteImport(listId: string | null): string {
  const id = uuidv4();
  db.prepare(
    `INSERT INTO failed_imports (id, association_id, original_filename, file_path, import_type,
                                 error_message, list_id, status)
     VALUES (?, ?, ?, ?, 'pdf', ?, ?, 'failed')`,
  ).run(id, vereniging.id, 'Mars - Trompet.pdf', legBestandNeer(), 'Instrument niet herkend', listId);
  return id;
}

function maakLijst(associationId: string, naam: string): string {
  const orkest = createTestOrchestra(associationId, { name: `Orkest ${naam}` });
  const id = uuidv4();
  db.prepare('INSERT INTO music_lists (id, orchestra_id, name) VALUES (?, ?, ?)').run(id, orkest.id, naam);
  return id;
}

const opnieuwProberen = (id: string) =>
  request(app).post(`/api/failed-imports/${id}/retry`).set('Authorization', `Bearer ${adminToken}`);

describe('Een mislukte import opnieuw proberen', () => {
  it('maakt de partij alsnog aan', async () => {
    const res = await opnieuwProberen(maakMislukteImport(null));

    expect(res.status).toBe(200);
    const partijen = db
      .prepare('SELECT COUNT(*) as aantal FROM music_pieces WHERE association_id = ?')
      .get(vereniging.id) as { aantal: number };
    expect(partijen.aantal).toBe(1);
  });

  it('zet de partij op de eigen lijst waar hij voor bedoeld was', async () => {
    const eigenLijst = maakLijst(vereniging.id, 'Eigen lijst');

    const res = await opnieuwProberen(maakMislukteImport(eigenLijst));

    expect(res.status).toBe(200);
    const opLijst = db
      .prepare('SELECT COUNT(*) as aantal FROM music_list_pieces WHERE music_list_id = ?')
      .get(eigenLijst) as { aantal: number };
    expect(opLijst.aantal).toBe(1);
  });

  it('zet hem niet op een lijst van een andere vereniging', async () => {
    const andere = createTestAssociation({ name: 'Fanfare De Eendracht' });
    const hunLijst = maakLijst(andere.id, 'Hun lijst');

    const res = await opnieuwProberen(maakMislukteImport(hunLijst));

    // De partij zelf hoort gewoon aangemaakt te worden - alleen het koppelen
    // aan die vreemde lijst gaat niet door.
    expect(res.status).toBe(200);
    const opLijst = db
      .prepare('SELECT COUNT(*) as aantal FROM music_list_pieces WHERE music_list_id = ?')
      .get(hunLijst) as { aantal: number };
    expect(opLijst.aantal).toBe(0);
  });

  it('vindt de mislukte import van een andere vereniging niet', async () => {
    const andere = createTestAssociation({ name: 'Harmonie Sint Cecilia' });
    const id = uuidv4();
    db.prepare(
      `INSERT INTO failed_imports (id, association_id, original_filename, file_path, import_type,
                                   error_message, status)
       VALUES (?, ?, ?, ?, 'pdf', ?, 'failed')`,
    ).run(id, andere.id, 'Hun bestand.pdf', legBestandNeer(), 'Iets ging mis');

    expect((await opnieuwProberen(id)).status).toBe(404);
  });

  it('weigert een import die al hersteld is', async () => {
    const id = maakMislukteImport(null);
    db.prepare("UPDATE failed_imports SET status = 'recovered' WHERE id = ?").run(id);

    expect((await opnieuwProberen(id)).status).toBe(400);
  });

  it('weigert het als het bestand weg is', async () => {
    const id = maakMislukteImport(null);
    const rij = db.prepare('SELECT file_path FROM failed_imports WHERE id = ?').get(id) as { file_path: string };
    fs.unlinkSync(path.join(UPLOAD_DIR, rij.file_path));

    expect((await opnieuwProberen(id)).status).toBe(400);
  });
});
