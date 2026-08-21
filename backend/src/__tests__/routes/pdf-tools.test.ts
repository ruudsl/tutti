/**
 * Gereedschap voor bladmuziek: splitsen, samenvoegen, draaien.
 *
 * 595 regels zonder test. Het resultaat van zo'n bewerking gaat naar een
 * tijdelijke map en de bestandsnaam komt terug in het antwoord. Die map is
 * gedeeld door alle verenigingen, en de drie routes die er weer uit lezen
 * namen een naam aan zonder te kijken van wie het bestand was:
 *
 * | route | wat er kon |
 * | --- | --- |
 * | GET /pdf-tools/download/:filename | andermans resultaat downloaden |
 * | POST /pdf-tools/download-zip | idem, meerdere tegelijk in een zip |
 * | POST /pdf-tools/save-as-music-piece | andermans resultaat als eigen partij in de bibliotheek opnemen |
 *
 * Die laatste is de scherpste: dan staat de bladmuziek van een andere
 * vereniging voorgoed in je eigen archief.
 *
 * De naam draagt de eigenaar nu mee. Dat scheelt een tabel voor bestanden die
 * na een uur worden opgeruimd, en het overleeft een herstart.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import pdfToolsRoutes from '../../routes/pdf-tools';
import { errorHandler } from '../../middleware/errorHandler';
import db from '../../database/connection';
import {
  createTestEnvironment,
  createTestAssociation,
  createTestOrchestra,
  createTestUser,
  generateTestToken,
  TestAssociation,
  TestUser,
} from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api/pdf-tools', pdfToolsRoutes);
app.use(errorHandler);

const TEMP_DIR = process.env.TEMP_DIR || path.join(__dirname, '../../../temp');

const MINIMALE_PDF = Buffer.from(
  '%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 99 99]>>endobj\n' +
    'trailer<</Root 1 0 R>>\n',
  'utf-8',
);

describe('bladmuziekgereedschap', () => {
  let vereniging: TestAssociation;
  let commissielid: TestUser;
  let commissieToken: string;
  let lid: TestUser;
  let lidToken: string;

  let andereVereniging: TestAssociation;
  let andereCommissielid: TestUser;
  let andereCommissieToken: string;

  const aangemaakt: string[] = [];

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    commissielid = omgeving.musicCommitteeUser;
    commissieToken = omgeving.musicCommitteeToken;
    lid = omgeving.memberUser;
    lidToken = omgeving.memberToken;

    andereVereniging = createTestAssociation({ name: 'Andere vereniging' });
    andereCommissielid = createTestUser(andereVereniging.id, {
      email: 'commissie@elders.nl',
      role: 'music_committee',
    });
    andereCommissieToken = generateTestToken(andereCommissielid);
  });

  afterEach(() => {
    for (const pad of aangemaakt.splice(0)) {
      if (fs.existsSync(pad)) fs.unlinkSync(pad);
    }
  });

  /** Legt een tijdelijk bestand neer alsof de bewerking het net heeft gemaakt. */
  function legTijdelijkBestandNeer(eigenaar: TestUser, basisnaam = 'resultaat.pdf'): string {
    const naam = `${eigenaar.id}_${uuidv4()}_${basisnaam}`;
    if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
    const pad = path.join(TEMP_DIR, naam);
    fs.writeFileSync(pad, MINIMALE_PDF);
    aangemaakt.push(pad);
    return naam;
  }

  const haalOp = (token: string, naam: string) =>
    request(app)
      .get(`/api/pdf-tools/download/${encodeURIComponent(naam)}`)
      .set('Authorization', `Bearer ${token}`);

  describe('een eigen resultaat downloaden', () => {
    it('lukt voor wie het bestand heeft gemaakt', async () => {
      const naam = legTijdelijkBestandNeer(commissielid);
      const antwoord = await haalOp(commissieToken, naam);
      expect(antwoord.status).toBe(200);
    });

    it('geeft de oorspronkelijke naam terug, zonder eigenaar en volgnummer ervoor', async () => {
      const naam = legTijdelijkBestandNeer(commissielid, 'Mars der Medici.pdf');
      const antwoord = await haalOp(commissieToken, naam);
      expect(antwoord.headers['content-disposition']).toContain('Mars der Medici.pdf');
    });

    it('lukt niet voor een ander lid van de eigen vereniging', async () => {
      const naam = legTijdelijkBestandNeer(commissielid);
      expect((await haalOp(lidToken, naam)).status).toBe(404);
    });

    it('lukt niet voor iemand van een andere vereniging', async () => {
      const naam = legTijdelijkBestandNeer(commissielid);
      expect((await haalOp(andereCommissieToken, naam)).status).toBe(404);
    });

    it('geeft 404 voor een bestand dat niet bestaat', async () => {
      expect((await haalOp(commissieToken, `${commissielid.id}_${uuidv4()}_weg.pdf`)).status).toBe(404);
    });

    it('laat zich niet uit de tijdelijke map sturen', async () => {
      expect((await haalOp(commissieToken, '../../etc/passwd')).status).toBe(404);
    });

    it('weigert een verzoek zonder token', async () => {
      const naam = legTijdelijkBestandNeer(commissielid);
      expect((await request(app).get(`/api/pdf-tools/download/${naam}`)).status).toBe(401);
    });

    it('helpt niet om de eigen id voor andermans bestand te plakken', async () => {
      // De naam op schijf hoort bij het andere lid; er voor je eigen id
      // zetten levert een naam op die niet bestaat.
      const naam = legTijdelijkBestandNeer(andereCommissielid);
      const verzonnen = `${commissielid.id}_${naam}`;
      expect((await haalOp(commissieToken, verzonnen)).status).toBe(404);
    });
  });

  describe('meerdere bestanden als zip', () => {
    const zip = (token: string, filepaths: string[]) =>
      request(app).post('/api/pdf-tools/download-zip').set('Authorization', `Bearer ${token}`).send({ filepaths });

    it('is niet voor een gewoon lid', async () => {
      expect((await zip(lidToken, ['iets.pdf'])).status).toBe(403);
    });

    it('weigert een lege lijst', async () => {
      expect((await zip(commissieToken, [])).status).toBe(400);
    });

    it('laat andermans bestand weg', async () => {
      const vanAnder = legTijdelijkBestandNeer(andereCommissielid);
      const antwoord = await zip(commissieToken, [vanAnder]);
      expect(antwoord.status).toBe(404);
    });

    it('neemt alleen de eigen bestanden mee', async () => {
      const eigen = legTijdelijkBestandNeer(commissielid);
      const vanAnder = legTijdelijkBestandNeer(andereCommissielid);

      const antwoord = await zip(commissieToken, [eigen, vanAnder]);
      expect(antwoord.status).toBe(200);
      expect(antwoord.headers['content-type']).toContain('zip');
    });
  });

  describe('opnemen in de bibliotheek', () => {
    const opslaan = (token: string, filepath: string) =>
      request(app)
        .post('/api/pdf-tools/save-as-music-piece')
        .set('Authorization', `Bearer ${token}`)
        .send({ filepath, filename: 'partij.pdf', title: 'Een stuk' });

    it('is niet voor een gewoon lid', async () => {
      const naam = legTijdelijkBestandNeer(lid);
      expect((await opslaan(lidToken, naam)).status).toBe(403);
    });

    it('neemt andermans resultaat niet op', async () => {
      const vanAnder = legTijdelijkBestandNeer(andereCommissielid);
      const antwoord = await opslaan(commissieToken, vanAnder);
      expect(antwoord.status).toBe(404);

      const partijen = db
        .prepare('SELECT COUNT(*) as aantal FROM music_pieces WHERE association_id = ?')
        .get(vereniging.id) as { aantal: number };
      expect(partijen.aantal).toBe(0);
    });

    it('vraagt om een bestandsnaam', async () => {
      const antwoord = await request(app)
        .post('/api/pdf-tools/save-as-music-piece')
        .set('Authorization', `Bearer ${commissieToken}`)
        .send({ title: 'Zonder bestand' });
      expect(antwoord.status).toBe(400);
    });

    it('zet de partij niet op een lijst van een andere vereniging', async () => {
      // De listId komt uit de aanvraag en werd rechtstreeks in
      // music_list_pieces geschreven. Zo belandde een eigen partij op de
      // repertoirelijst van een vreemd orkest - cloud-import.ts controleert dit
      // wel, deze route niet.
      const hunOrkest = createTestOrchestra(andereVereniging.id);
      const hunLijst = uuidv4();
      db.prepare('INSERT INTO music_lists (id, orchestra_id, name) VALUES (?, ?, ?)').run(
        hunLijst,
        hunOrkest.id,
        'Hun lijst',
      );
      const naam = legTijdelijkBestandNeer(commissielid);

      const antwoord = await request(app)
        .post('/api/pdf-tools/save-as-music-piece')
        .set('Authorization', `Bearer ${commissieToken}`)
        .send({ filepath: naam, filename: 'partij.pdf', title: 'Een stuk', listId: hunLijst });

      expect(antwoord.status).toBe(404);
      const opLijst = db
        .prepare('SELECT COUNT(*) as aantal FROM music_list_pieces WHERE music_list_id = ?')
        .get(hunLijst) as { aantal: number };
      expect(opLijst.aantal).toBe(0);
    });

    it('zet de partij wel op een eigen lijst', async () => {
      const eigenOrkest = createTestOrchestra(vereniging.id);
      const eigenLijst = uuidv4();
      db.prepare('INSERT INTO music_lists (id, orchestra_id, name) VALUES (?, ?, ?)').run(
        eigenLijst,
        eigenOrkest.id,
        'Eigen lijst',
      );
      const naam = legTijdelijkBestandNeer(commissielid);

      const antwoord = await request(app)
        .post('/api/pdf-tools/save-as-music-piece')
        .set('Authorization', `Bearer ${commissieToken}`)
        .send({ filepath: naam, filename: 'partij.pdf', title: 'Een stuk', listId: eigenLijst });

      expect(antwoord.status).toBe(200);
      const opLijst = db
        .prepare('SELECT COUNT(*) as aantal FROM music_list_pieces WHERE music_list_id = ?')
        .get(eigenLijst) as { aantal: number };
      expect(opLijst.aantal).toBe(1);
    });
  });
});
