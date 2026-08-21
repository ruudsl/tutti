/**
 * Uitwisseling met derden: JSON-LD en CSV van het repertoire.
 *
 * 481 regels zonder test, met een fout die alleen opvalt bij een vereniging
 * met meer dan een orkest: `orchestraId` werd gecontroleerd en daarna niet
 * meer gebruikt. De query filterde alleen op `association_id`, terwijl het
 * antwoord de lijst wel aanduidt als het repertoire van dit ene orkest
 * (`tutti:orchestra/<id>`). Een harmonie en een opleidingsorkest kregen dus
 * twee keer dezelfde, veel te brede export.
 *
 * music_titles kent geen orkest. De weg loopt via de muzieklijsten van het
 * orkest naar de partijen, en van partij naar titel op titel en arrangeur -
 * dezelfde koppeling die music-lists.ts legt.
 *
 * Daarnaast gingen `grade` en `work_number` ongeescaped de CSV in, terwijl de
 * buurvelden dat wel kregen; een komma erin schoof alle volgende kolommen op.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import interopRoutes from '../../routes/interop';
import { errorHandler } from '../../middleware/errorHandler';
import {
  createTestEnvironment,
  createTestAssociation,
  createTestOrchestra,
  createTestMusicPiece,
  createTestUser,
  generateTestToken,
  TestAssociation,
  TestOrchestra,
  TestUser,
} from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api/interop', interopRoutes);
app.use(errorHandler);

describe('uitwisseling met derden', () => {
  let vereniging: TestAssociation;
  let harmonie: TestOrchestra;
  let opleiding: TestOrchestra;
  let beheerder: TestUser;
  let beheerderToken: string;

  let andereVereniging: TestAssociation;
  let anderOrkest: TestOrchestra;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    beheerder = omgeving.adminUser;
    beheerderToken = omgeving.adminToken;

    harmonie = createTestOrchestra(vereniging.id, { name: 'Harmonieorkest' });
    opleiding = createTestOrchestra(vereniging.id, { name: 'Opleidingsorkest' });

    andereVereniging = createTestAssociation({ name: 'Andere vereniging' });
    anderOrkest = createTestOrchestra(andereVereniging.id, { name: 'Fanfare Elders' });
  });

  /**
   * Zet een titel op de lijst van een orkest: titel, bijbehorende partij, en
   * de partij op een muzieklijst van dat orkest.
   */
  function zetOpRepertoire(
    associationId: string,
    orchestraId: string,
    titel: string,
    overrides: { arranger?: string | null; grade?: string } = {},
  ): string {
    const titelId = uuidv4();
    db.prepare('INSERT INTO music_titles (id, title, arranger, grade, association_id) VALUES (?, ?, ?, ?, ?)').run(
      titelId,
      titel,
      overrides.arranger ?? null,
      overrides.grade ?? null,
      associationId,
    );

    const partij = createTestMusicPiece(associationId, { title: titel, arranger: overrides.arranger ?? null });

    const lijstId = uuidv4();
    db.prepare('INSERT INTO music_lists (id, name, orchestra_id) VALUES (?, ?, ?)').run(
      lijstId,
      `Lijst ${titel}`,
      orchestraId,
    );
    db.prepare('INSERT INTO music_list_pieces (music_list_id, music_piece_id) VALUES (?, ?)').run(lijstId, partij.id);

    return titelId;
  }

  const haalOp = (token: string, pad: string) =>
    request(app).get(`/api/interop${pad}`).set('Authorization', `Bearer ${token}`);

  /** De titels uit de JSON-LD: repertoire.itemListElement[].item.name. */
  const titelsUit = (body: { repertoire?: { itemListElement?: { item: { name: string } }[] } }): string[] =>
    (body.repertoire?.itemListElement ?? []).map((e) => e.item.name);

  describe('het repertoire per orkest', () => {
    it('geeft alleen wat op de lijst van dit orkest staat', async () => {
      zetOpRepertoire(vereniging.id, harmonie.id, 'Mars der Medici');
      zetOpRepertoire(vereniging.id, opleiding.id, 'Eenvoudige Etude');

      const antwoord = await haalOp(beheerderToken, `/orchestras/${harmonie.id}/repertoire.json`);
      expect(antwoord.status, JSON.stringify(antwoord.body).slice(0, 300)).toBe(200);
      expect(titelsUit(antwoord.body)).toEqual(['Mars der Medici']);
    });

    it('geeft het opleidingsorkest zijn eigen lijst', async () => {
      zetOpRepertoire(vereniging.id, harmonie.id, 'Mars der Medici');
      zetOpRepertoire(vereniging.id, opleiding.id, 'Eenvoudige Etude');

      const antwoord = await haalOp(beheerderToken, `/orchestras/${opleiding.id}/repertoire.json`);
      expect(titelsUit(antwoord.body)).toEqual(['Eenvoudige Etude']);
    });

    it('laat een titel weg die bij geen enkel orkest op de lijst staat', async () => {
      db.prepare('INSERT INTO music_titles (id, title, association_id) VALUES (?, ?, ?)').run(
        uuidv4(),
        'Nooit Gespeeld',
        vereniging.id,
      );

      const antwoord = await haalOp(beheerderToken, `/orchestras/${harmonie.id}/repertoire.json`);
      expect(titelsUit(antwoord.body)).not.toContain('Nooit Gespeeld');
    });

    it('laat een zacht verwijderde titel weg', async () => {
      const titelId = zetOpRepertoire(vereniging.id, harmonie.id, 'Weggegooide Mars');
      db.prepare('UPDATE music_titles SET deleted_at = ? WHERE id = ?').run('2026-01-01 12:00:00', titelId);

      const antwoord = await haalOp(beheerderToken, `/orchestras/${harmonie.id}/repertoire.json`);
      expect(titelsUit(antwoord.body)).not.toContain('Weggegooide Mars');
    });

    it('laat een titel weg waarvan de lijst is verwijderd', async () => {
      zetOpRepertoire(vereniging.id, harmonie.id, 'Van Oude Lijst');
      db.prepare('UPDATE music_lists SET deleted_at = ? WHERE orchestra_id = ?').run(
        '2026-01-01 12:00:00',
        harmonie.id,
      );

      const antwoord = await haalOp(beheerderToken, `/orchestras/${harmonie.id}/repertoire.json`);
      expect(titelsUit(antwoord.body)).toHaveLength(0);
    });

    it('geeft geen orkest van een andere vereniging', async () => {
      zetOpRepertoire(andereVereniging.id, anderOrkest.id, 'Van Elders');
      const antwoord = await haalOp(beheerderToken, `/orchestras/${anderOrkest.id}/repertoire.json`);
      expect(antwoord.status).toBe(404);
    });

    it('weigert een verzoek zonder token', async () => {
      expect((await request(app).get(`/api/interop/orchestras/${harmonie.id}/repertoire.json`)).status).toBe(401);
    });
  });

  describe('de CSV-export', () => {
    it('bevat alleen het repertoire van dit orkest', async () => {
      zetOpRepertoire(vereniging.id, harmonie.id, 'Mars der Medici');
      zetOpRepertoire(vereniging.id, opleiding.id, 'Eenvoudige Etude');

      const antwoord = await haalOp(beheerderToken, `/orchestras/${harmonie.id}/repertoire.csv`);
      expect(antwoord.status).toBe(200);
      expect(antwoord.text).toContain('Mars der Medici');
      expect(antwoord.text).not.toContain('Eenvoudige Etude');
    });

    it('houdt een komma in de moeilijkheidsgraad binnen zijn eigen kolom', async () => {
      zetOpRepertoire(vereniging.id, harmonie.id, 'Lastig Stuk', { grade: '4, zware 4' });

      const antwoord = await haalOp(beheerderToken, `/orchestras/${harmonie.id}/repertoire.csv`);
      const regels = antwoord.text.trim().split('\n');
      const kop = regels[0].split(',').length;
      const rij = regels.find((r) => r.includes('Lastig Stuk'))!;

      // Zonder ontsnapping telt deze rij een kolom meer dan de kop.
      expect(rij).toContain('"4, zware 4"');
      expect(rij.split(',').length).toBeGreaterThanOrEqual(kop);
    });
  });
});
