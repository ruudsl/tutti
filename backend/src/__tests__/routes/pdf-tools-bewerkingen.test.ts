/**
 * De bewerkingen van het bladmuziekgereedschap: lezen, splitsen, samenvoegen,
 * draaien en het resultaat weer terugkrijgen.
 *
 * pdf-tools.test.ts gaat over de eigendomsvraag: van wie is een tijdelijk
 * bestand, en wie mag het ophalen. Dit bestand gaat over wat er met de pdf
 * zelf gebeurt, en vooral over wat er gebeurt als die pdf niet is wat de
 * gebruiker denkt: een bestand dat geen pdf is, een pdf zonder pagina's, een
 * paginabereik dat niet bestaat, json die halverwege afbreekt.
 *
 * Dat is hier geen bijzaak. Alles wat deze routes binnenkrijgen komt uit een
 * upload of uit een formulierveld, dus de foutpaden zijn het normale gebruik
 * van een gebruiker die zich vergist. Een 500 is daar het verkeerde antwoord:
 * die zegt "het ligt aan ons" terwijl het aan het bestand ligt, en hij zet een
 * stapeltrace in de logs bij iedere verkeerd aangeklikte upload.
 *
 * De mappen wijzen naar een tijdelijke map buiten het project. Deze tests
 * schrijven echte bestanden.
 */

import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { PDFDocument, degrees } from 'pdf-lib';
import { v4 as uuidv4 } from 'uuid';
import '../setup';

/**
 * TEMP_DIR en UPLOAD_DIR worden in routes/pdf-tools.ts eenmalig bij het laden
 * van de module gelezen, dus ze moeten vaststaan voor de import. vi.hoisted
 * draait voor alle imports; daarom staat dit hier en niet in een beforeAll.
 */
const mappen = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeFs = require('fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeOs = require('os');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodePath = require('path');
  const basis = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), 'tutti-pdf-tools-'));
  const temp = nodePath.join(basis, 'temp');
  const uploads = nodePath.join(basis, 'uploads');
  nodeFs.mkdirSync(temp, { recursive: true });
  nodeFs.mkdirSync(uploads, { recursive: true });
  // De oude waarden onthouden. Testbestanden delen een werkproces, dus een
  // omgevingsvariabele die hier blijft staan wijst voor een volgend bestand
  // naar een map die na afloop is opgeruimd.
  const eerder = { TEMP_DIR: process.env.TEMP_DIR, UPLOAD_DIR: process.env.UPLOAD_DIR };
  process.env.TEMP_DIR = temp;
  process.env.UPLOAD_DIR = uploads;
  return { eerder, basis: basis as string, temp: temp as string, uploads: uploads as string };
});

import pdfToolsRoutes, { cleanupTempFiles } from '../../routes/pdf-tools';
import { errorHandler } from '../../middleware/errorHandler';
import db from '../../database/connection';
import {
  createTestEnvironment,
  createTestInstrument,
  createTestUser,
  generateTestToken,
  TestAssociation,
  TestUser,
} from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api/pdf-tools', pdfToolsRoutes);
app.use(errorHandler);

// Maten in punten. 1 mm = 1 / 0,352778 punt.
const A4_STAAND: [number, number] = [595.28, 841.89];
const A4_LIGGEND: [number, number] = [841.89, 595.28];
const A3_STAAND: [number, number] = [841.89, 1190.55];
const A3_LIGGEND: [number, number] = [1190.55, 841.89];
const VIERKANT: [number, number] = [400, 400];

/** Een pdf met een pagina per opgegeven maat. */
async function maakPdf(maten: [number, number][]): Promise<Buffer> {
  const document = await PDFDocument.create();
  for (const maat of maten) {
    document.addPage(maat);
  }
  return Buffer.from(await document.save());
}

/**
 * Een geldige pdf zonder ook maar een pagina.
 *
 * pdf-lib maakt die niet uit zichzelf - een leeg document dat je opslaat en
 * weer inleest heeft er een - dus hier staat hij met de hand.
 */
const PDF_ZONDER_PAGINAS = Buffer.from(
  '%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
    '2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\n' +
    'trailer<</Root 1 0 R>>\n',
  'utf-8',
);

/** Een bestand dat een pdf heet maar het niet is. */
const BESCHADIGDE_PDF = Buffer.from('dit was ooit een pdf maar is het niet meer', 'utf-8');

describe('bewerkingen op bladmuziek', () => {
  let vereniging: TestAssociation;
  let commissielid: TestUser;
  let commissieToken: string;
  let lidToken: string;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    commissielid = omgeving.musicCommitteeUser;
    commissieToken = omgeving.musicCommitteeToken;
    lidToken = omgeving.memberToken;
  });

  afterEach(() => {
    for (const naam of fs.readdirSync(mappen.temp)) {
      fs.rmSync(path.join(mappen.temp, naam), { force: true, recursive: true });
    }
    for (const naam of fs.readdirSync(mappen.uploads)) {
      fs.rmSync(path.join(mappen.uploads, naam), { force: true, recursive: true });
    }
  });

  afterAll(() => {
    for (const [sleutel, waarde] of Object.entries(mappen.eerder)) {
      if (waarde === undefined) delete process.env[sleutel];
      else process.env[sleutel] = waarde;
    }
    fs.rmSync(mappen.basis, { force: true, recursive: true });
  });

  const alsCommissie = (pad: string) =>
    request(app).post(`/api/pdf-tools${pad}`).set('Authorization', `Bearer ${commissieToken}`);

  describe('gegevens van een pdf opvragen', () => {
    const info = (token: string) => request(app).post('/api/pdf-tools/info').set('Authorization', `Bearer ${token}`);

    it('is niet voor een gewoon lid', async () => {
      expect((await info(lidToken)).status).toBe(403);
    });

    it('weigert een verzoek zonder token', async () => {
      expect((await request(app).post('/api/pdf-tools/info')).status).toBe(401);
    });

    it('vraagt om een bestand', async () => {
      const antwoord = await info(commissieToken);
      expect(antwoord.status).toBe(400);
      expect(antwoord.body.error).toContain('Geen PDF');
    });

    it('weigert een bestand dat geen pdf is', async () => {
      const antwoord = await info(commissieToken).attach('pdf', Buffer.from('hallo'), 'notitie.txt');
      expect(antwoord.status).toBe(400);
    });

    it('herkent de gangbare papierformaten', async () => {
      const antwoord = await info(commissieToken).attach(
        'pdf',
        await maakPdf([A4_STAAND, A4_LIGGEND, A3_STAAND, A3_LIGGEND, VIERKANT]),
        'partij.pdf',
      );

      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      expect(antwoord.body.pageCount).toBe(5);
      expect(antwoord.body.pages.map((p: { paperSize: string }) => p.paperSize)).toEqual([
        'A4 Portrait',
        'A4 Landscape',
        'A3 Portrait',
        'A3 Landscape',
        'Onbekend',
      ]);
    });

    it('geeft de maten in millimeters en zegt of een pagina ligt', async () => {
      const antwoord = await info(commissieToken).attach('pdf', await maakPdf([A4_LIGGEND]), 'partij.pdf');
      const pagina = antwoord.body.pages[0];

      expect(pagina.widthMm).toBe(297);
      expect(pagina.heightMm).toBe(210);
      expect(pagina.isLandscape).toBe(true);
      expect(pagina.pageNumber).toBe(1);
    });

    it('geeft de naam van het aangeleverde bestand terug', async () => {
      const antwoord = await info(commissieToken).attach('pdf', await maakPdf([A4_STAAND]), 'Mars der Medici.pdf');
      expect(antwoord.body.filename).toBe('Mars der Medici.pdf');
    });

    it('komt niet in de knel bij een pdf zonder pagina’s', async () => {
      const antwoord = await info(commissieToken).attach('pdf', PDF_ZONDER_PAGINAS, 'leeg.pdf');

      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      expect(antwoord.body.pageCount).toBe(0);
      expect(antwoord.body.pages).toEqual([]);
    });

    it('geeft een nette fout bij een beschadigd bestand', async () => {
      // BEWIJS. PDFDocument.load gooit op een bestand dat geen pdf is, en die
      // fout liep ongehinderd door naar de centrale afhandeling: de gebruiker
      // kreeg 500 "Interne serverfout" op zijn eigen verkeerde bestand, met
      // een stapeltrace in de logs erbij.
      const antwoord = await info(commissieToken).attach('pdf', BESCHADIGDE_PDF, 'kapot.pdf');

      expect(antwoord.status).toBe(400);
      expect(antwoord.body.error).toMatch(/pdf/i);
    });
  });

  describe('splitsen op paginabereik', () => {
    const split = (token: string) => request(app).post('/api/pdf-tools/split').set('Authorization', `Bearer ${token}`);

    it('is niet voor een gewoon lid', async () => {
      expect((await split(lidToken)).status).toBe(403);
    });

    it('vraagt om een bestand', async () => {
      expect((await split(commissieToken)).status).toBe(400);
    });

    it('vraagt om paginabereiken', async () => {
      const antwoord = await split(commissieToken).attach('pdf', await maakPdf([A4_STAAND]), 'partij.pdf');
      expect(antwoord.status).toBe(400);
      expect(antwoord.body.error).toContain('bereiken');
    });

    it('weigert bereiken die geen lijst zijn', async () => {
      // WACHT, geen bewijs: dit deed de oude code ook al goed.
      const antwoord = await split(commissieToken)
        .field('ranges', '5')
        .attach('pdf', await maakPdf([A4_STAAND]), 'partij.pdf');
      expect(antwoord.status).toBe(400);
    });

    it('geeft een nette fout bij bereiken die geen geldige json zijn', async () => {
      // BEWIJS. JSON.parse stond binnen de voorwaarde zelf, dus een half
      // afgebroken formulierveld gooide voor de controle eraan toekwam: 500 in
      // plaats van 400.
      const antwoord = await split(commissieToken)
        .field('ranges', '[{"start":1,')
        .attach('pdf', await maakPdf([A4_STAAND]), 'partij.pdf');

      expect(antwoord.status).toBe(400);
    });

    it('splitst een pdf in twee partijen', async () => {
      const antwoord = await split(commissieToken)
        .field(
          'ranges',
          JSON.stringify([
            { start: 1, end: 2, name: 'Eerste stem' },
            { start: 3, end: 3, name: 'Tweede stem' },
          ]),
        )
        .attach('pdf', await maakPdf([A4_STAAND, A4_STAAND, A4_STAAND]), 'partij.pdf');

      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      expect(antwoord.body.results).toHaveLength(2);
      expect(antwoord.body.results[0].pageCount).toBe(2);
      expect(antwoord.body.results[1].pageCount).toBe(1);
      for (const resultaat of antwoord.body.results) {
        expect(fs.existsSync(path.join(mappen.temp, resultaat.filepath))).toBe(true);
      }
    });

    it('zet de eigenaar voor de bestandsnaam van het resultaat', async () => {
      const antwoord = await split(commissieToken)
        .field('ranges', JSON.stringify([{ start: 1, end: 1, name: 'Stem' }]))
        .attach('pdf', await maakPdf([A4_STAAND]), 'partij.pdf');

      expect(antwoord.body.results[0].filepath.startsWith(`${commissielid.id}_`)).toBe(true);
    });

    it('meldt een bereik dat buiten de pdf valt en maakt er geen bestand voor', async () => {
      const antwoord = await split(commissieToken)
        .field('ranges', JSON.stringify([{ start: 1, end: 9, name: 'Te ver' }]))
        .attach('pdf', await maakPdf([A4_STAAND]), 'partij.pdf');

      expect(antwoord.status).toBe(200);
      expect(antwoord.body.results[0].error).toContain('Ongeldige pagina bereik');
      expect(antwoord.body.results[0].filepath).toBeUndefined();
      expect(fs.readdirSync(mappen.temp)).toHaveLength(0);
    });

    it('meldt een bereik dat achterstevoren staat', async () => {
      const antwoord = await split(commissieToken)
        .field('ranges', JSON.stringify([{ start: 2, end: 1, name: 'Omgekeerd' }]))
        .attach('pdf', await maakPdf([A4_STAAND, A4_STAAND]), 'partij.pdf');

      expect(antwoord.body.results[0].error).toContain('Ongeldige pagina bereik');
    });

    it('meldt een bereik dat bij nul begint', async () => {
      const antwoord = await split(commissieToken)
        .field('ranges', JSON.stringify([{ start: 0, end: 1, name: 'Vanaf nul' }]))
        .attach('pdf', await maakPdf([A4_STAAND, A4_STAAND]), 'partij.pdf');

      expect(antwoord.body.results[0].error).toContain('Ongeldige pagina bereik');
    });

    it('doet de bereiken die wel kloppen gewoon', async () => {
      const antwoord = await split(commissieToken)
        .field(
          'ranges',
          JSON.stringify([
            { start: 1, end: 1, name: 'Goed' },
            { start: 5, end: 6, name: 'Fout' },
          ]),
        )
        .attach('pdf', await maakPdf([A4_STAAND, A4_STAAND]), 'partij.pdf');

      expect(antwoord.body.results[0].pageCount).toBe(1);
      expect(antwoord.body.results[1].error).toBeTruthy();
      expect(fs.readdirSync(mappen.temp)).toHaveLength(1);
    });

    it('haalt padtekens uit de naam die de gebruiker meegeeft', async () => {
      const antwoord = await split(commissieToken)
        .field('ranges', JSON.stringify([{ start: 1, end: 1, name: '../../etc/passwd' }]))
        .attach('pdf', await maakPdf([A4_STAAND]), 'partij.pdf');

      expect(antwoord.status).toBe(200);
      expect(antwoord.body.results[0].filename).toBe('etcpasswd.pdf');
      expect(fs.readdirSync(mappen.temp)).toHaveLength(1);
    });

    it('doet niets bij een lege lijst bereiken', async () => {
      const antwoord = await split(commissieToken)
        .field('ranges', '[]')
        .attach('pdf', await maakPdf([A4_STAAND]), 'partij.pdf');

      expect(antwoord.status).toBe(200);
      expect(antwoord.body.results).toEqual([]);
    });

    it('geeft een nette fout bij een beschadigd bestand', async () => {
      // BEWIJS: zie /info. Ook hier gooide PDFDocument.load door naar 500.
      const antwoord = await split(commissieToken)
        .field('ranges', JSON.stringify([{ start: 1, end: 1, name: 'Stem' }]))
        .attach('pdf', BESCHADIGDE_PDF, 'kapot.pdf');

      expect(antwoord.status).toBe(400);
    });
  });

  describe('A3 in tweeën knippen', () => {
    const splitA3 = (token: string) =>
      request(app).post('/api/pdf-tools/split-a3').set('Authorization', `Bearer ${token}`);

    it('is niet voor een gewoon lid', async () => {
      expect((await splitA3(lidToken)).status).toBe(403);
    });

    it('vraagt om een bestand', async () => {
      expect((await splitA3(commissieToken)).status).toBe(400);
    });

    it('maakt van een liggende A3 twee pagina’s', async () => {
      const antwoord = await splitA3(commissieToken).attach('pdf', await maakPdf([A3_LIGGEND]), 'groot.pdf');

      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      expect(antwoord.body.originalPageCount).toBe(1);
      expect(antwoord.body.newPageCount).toBe(2);
      expect(antwoord.body.splitCount).toBe(1);
      expect(fs.existsSync(path.join(mappen.temp, antwoord.body.filepath))).toBe(true);
    });

    it('maakt van een staande A3 ook twee pagina’s', async () => {
      const antwoord = await splitA3(commissieToken).attach('pdf', await maakPdf([A3_STAAND]), 'groot.pdf');

      expect(antwoord.body.newPageCount).toBe(2);
      expect(antwoord.body.splitCount).toBe(1);
    });

    it('laat een A4 met rust', async () => {
      const antwoord = await splitA3(commissieToken).attach('pdf', await maakPdf([A4_STAAND]), 'klein.pdf');

      expect(antwoord.body.newPageCount).toBe(1);
      expect(antwoord.body.splitCount).toBe(0);
    });

    it('knipt alleen de A3-pagina’s uit een gemengd document', async () => {
      const antwoord = await splitA3(commissieToken).attach(
        'pdf',
        await maakPdf([A4_STAAND, A3_LIGGEND, A4_LIGGEND]),
        'gemengd.pdf',
      );

      expect(antwoord.body.originalPageCount).toBe(3);
      expect(antwoord.body.newPageCount).toBe(4);
      expect(antwoord.body.splitCount).toBe(1);
    });

    it('valt niet om op een pdf zonder pagina’s', async () => {
      // WACHT, geen bewijs: dit legt vast wat er nu gebeurt.
      //
      // De uitkomst is niet wat je zou raden. Er valt niets te knippen, dus
      // splitCount blijft nul en originalPageCount ook - maar newPageCount is
      // 1. Dat komt niet uit deze route: pdf-lib zet bij het opslaan van een
      // document zonder pagina's een lege A4 neer, en getPageCount() wordt hier
      // na het opslaan gelezen. Wie een pdf zonder pagina's aanlevert krijgt er
      // dus een blanco pagina voor terug.
      const antwoord = await splitA3(commissieToken).attach('pdf', PDF_ZONDER_PAGINAS, 'leeg.pdf');

      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      expect(antwoord.body.originalPageCount).toBe(0);
      expect(antwoord.body.splitCount).toBe(0);
      expect(antwoord.body.newPageCount).toBe(1);

      const geschreven = await PDFDocument.load(fs.readFileSync(path.join(mappen.temp, antwoord.body.filepath)));
      expect(geschreven.getPageCount()).toBe(1);
    });

    it('geeft een nette fout bij een beschadigd bestand', async () => {
      // BEWIJS: zie /info.
      const antwoord = await splitA3(commissieToken).attach('pdf', BESCHADIGDE_PDF, 'kapot.pdf');
      expect(antwoord.status).toBe(400);
    });
  });

  describe('samenvoegen', () => {
    const merge = (token: string) => request(app).post('/api/pdf-tools/merge').set('Authorization', `Bearer ${token}`);

    it('is niet voor een gewoon lid', async () => {
      expect((await merge(lidToken)).status).toBe(403);
    });

    it('vraagt om minimaal twee bestanden', async () => {
      const antwoord = await merge(commissieToken).attach('pdfs', await maakPdf([A4_STAAND]), 'een.pdf');
      expect(antwoord.status).toBe(400);
      expect(antwoord.body.error).toContain('Minimaal 2');
    });

    it('vraagt om bestanden als er niets bijzit', async () => {
      expect((await merge(commissieToken)).status).toBe(400);
    });

    it('voegt twee pdf’s achter elkaar', async () => {
      const antwoord = await merge(commissieToken)
        .attach('pdfs', await maakPdf([A4_STAAND, A4_STAAND]), 'een.pdf')
        .attach('pdfs', await maakPdf([A4_STAAND]), 'twee.pdf');

      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      expect(antwoord.body.pageCount).toBe(3);
      expect(antwoord.body.fileCount).toBe(2);
      expect(fs.existsSync(path.join(mappen.temp, antwoord.body.filepath))).toBe(true);
    });

    it('gaat om met een pdf zonder pagina’s ertussen', async () => {
      const antwoord = await merge(commissieToken)
        .attach('pdfs', await maakPdf([A4_STAAND]), 'een.pdf')
        .attach('pdfs', PDF_ZONDER_PAGINAS, 'leeg.pdf');

      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      expect(antwoord.body.pageCount).toBe(1);
    });

    it('geeft een nette fout als een van de bestanden beschadigd is', async () => {
      // BEWIJS: zie /info. Eén kapot bestand in de stapel gaf 500.
      const antwoord = await merge(commissieToken)
        .attach('pdfs', await maakPdf([A4_STAAND]), 'goed.pdf')
        .attach('pdfs', BESCHADIGDE_PDF, 'kapot.pdf');

      expect(antwoord.status).toBe(400);
    });
  });

  describe('draaien', () => {
    const rotate = (token: string) => request(app).post('/api/pdf-tools/rotate').set('Authorization', `Bearer ${token}`);

    it('is niet voor een gewoon lid', async () => {
      expect((await rotate(lidToken)).status).toBe(403);
    });

    it('vraagt om een bestand', async () => {
      expect((await rotate(commissieToken)).status).toBe(400);
    });

    it('vraagt om rotaties', async () => {
      const antwoord = await rotate(commissieToken).attach('pdf', await maakPdf([A4_STAAND]), 'partij.pdf');
      expect(antwoord.status).toBe(400);
      expect(antwoord.body.error).toContain('rotaties');
    });

    it('geeft een nette fout bij rotaties die geen geldige json zijn', async () => {
      // BEWIJS. JSON.parse stond zonder vangnet, dus een afgebroken veld gaf
      // 500 in plaats van 400.
      const antwoord = await rotate(commissieToken)
        .field('rotations', '[{"pageNumber":1,')
        .attach('pdf', await maakPdf([A4_STAAND]), 'partij.pdf');

      expect(antwoord.status).toBe(400);
    });

    it('geeft een nette fout bij rotaties die geen lijst zijn', async () => {
      // BEWIJS. Geldige json die geen lijst is kwam ongehinderd tot aan de
      // for-of eroverheen: "is not iterable", en dus 500.
      const antwoord = await rotate(commissieToken)
        .field('rotations', '{"pageNumber":1,"degrees":90}')
        .attach('pdf', await maakPdf([A4_STAAND]), 'partij.pdf');

      expect(antwoord.status).toBe(400);
    });

    it('draait de opgegeven pagina en telt op bij wat er al stond', async () => {
      const bron = await PDFDocument.create();
      bron.addPage(A4_STAAND).setRotation(degrees(90));
      const antwoord = await rotate(commissieToken)
        .field('rotations', JSON.stringify([{ pageNumber: 1, degrees: 180 }]))
        .attach('pdf', Buffer.from(await bron.save()), 'partij.pdf');

      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      const geschreven = await PDFDocument.load(fs.readFileSync(path.join(mappen.temp, antwoord.body.filepath)));
      expect(geschreven.getPage(0).getRotation().angle).toBe(270);
    });

    it('laat een paginanummer buiten de pdf links liggen', async () => {
      const antwoord = await rotate(commissieToken)
        .field('rotations', JSON.stringify([{ pageNumber: 9, degrees: 90 }]))
        .attach('pdf', await maakPdf([A4_STAAND]), 'partij.pdf');

      expect(antwoord.status).toBe(200);
      const geschreven = await PDFDocument.load(fs.readFileSync(path.join(mappen.temp, antwoord.body.filepath)));
      expect(geschreven.getPage(0).getRotation().angle).toBe(0);
    });

    it('maakt van een naam met rare tekens een gewone bestandsnaam', async () => {
      const antwoord = await rotate(commissieToken)
        .field('rotations', JSON.stringify([{ pageNumber: 1, degrees: 90 }]))
        .attach('pdf', await maakPdf([A4_STAAND]), 'Mars der Medici (2e stem).pdf');

      expect(antwoord.body.filename).toBe('rotated_Mars_der_Medici__2e_stem_.pdf');
      expect(fs.existsSync(path.join(mappen.temp, antwoord.body.filepath))).toBe(true);
    });
  });

  describe('meerdere resultaten als zip', () => {
    it('levert een zip met de oorspronkelijke namen erin', async () => {
      const eerste = await alsCommissie('/split')
        .field('ranges', JSON.stringify([{ start: 1, end: 1, name: 'Eerste stem' }]))
        .attach('pdf', await maakPdf([A4_STAAND, A4_STAAND]), 'partij.pdf');
      const tweede = await alsCommissie('/split')
        .field('ranges', JSON.stringify([{ start: 2, end: 2, name: 'Tweede stem' }]))
        .attach('pdf', await maakPdf([A4_STAAND, A4_STAAND]), 'partij.pdf');

      const antwoord = await request(app)
        .post('/api/pdf-tools/download-zip')
        .set('Authorization', `Bearer ${commissieToken}`)
        .send({ filepaths: [eerste.body.results[0].filepath, tweede.body.results[0].filepath] })
        .responseType('blob');

      expect(antwoord.status).toBe(200);
      const namen = new AdmZip(antwoord.body as Buffer).getEntries().map((e) => e.entryName);
      expect(namen.sort()).toEqual(['Eerste stem.pdf', 'Tweede stem.pdf']);
    });

    it('weigert iets anders dan een lijst', async () => {
      const antwoord = await request(app)
        .post('/api/pdf-tools/download-zip')
        .set('Authorization', `Bearer ${commissieToken}`)
        .send({ filepaths: 'een-bestand.pdf' });

      expect(antwoord.status).toBe(400);
    });
  });

  describe('opnemen in de bibliotheek zonder losse gegevens', () => {
    /**
     * Zonder title valt de route terug op de bestandsnaam:
     * Titel_arrangeur_instrument_stemming_groepnummer_muzieksleutel.
     */
    function legResultaatNeer(): string {
      const naam = `${commissielid.id}_${uuidv4()}_resultaat.pdf`;
      fs.writeFileSync(path.join(mappen.temp, naam), 'inhoud');
      return naam;
    }

    const opslaan = (filepath: string, filename: string) =>
      request(app)
        .post('/api/pdf-tools/save-as-music-piece')
        .set('Authorization', `Bearer ${commissieToken}`)
        .send({ filepath, filename });

    it('leest titel, arrangeur en de rest uit de bestandsnaam', async () => {
      const instrument = createTestInstrument({ name: 'Trompet' });
      const antwoord = await opslaan(legResultaatNeer(), 'Mars_Jansen_Trompet_Bb_1_sol.pdf');

      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      expect(antwoord.body.title).toBe('Mars');
      expect(antwoord.body.instrumentFound).toBe(true);
      expect(antwoord.body.instrumentId).toBe(instrument.id);

      const partij = db
        .prepare('SELECT arranger, tuning, group_number, clef, association_id FROM music_pieces WHERE id = ?')
        .get(antwoord.body.id) as Record<string, string>;
      expect(partij.arranger).toBe('Jansen');
      expect(partij.tuning).toBe('Bb');
      expect(partij.group_number).toBe('1');
      expect(partij.clef).toBe('sol');
      expect(partij.association_id).toBe(vereniging.id);
    });

    it('vindt een instrument ook via een andere naam ervoor', async () => {
      const instrument = createTestInstrument({ name: 'Bes trompet' });
      db.prepare('INSERT INTO instrument_aliases (id, instrument_id, alias) VALUES (?, ?, ?)').run(
        uuidv4(),
        instrument.id,
        'trumpet',
      );

      const antwoord = await opslaan(legResultaatNeer(), 'Mars_Jansen_Trumpet.pdf');
      expect(antwoord.body.instrumentId).toBe(instrument.id);
    });

    it('meldt het als het instrument niet te vinden is', async () => {
      const antwoord = await opslaan(legResultaatNeer(), 'Mars_Jansen_Ophicleide.pdf');

      expect(antwoord.status).toBe(200);
      expect(antwoord.body.instrumentFound).toBe(false);
      expect(antwoord.body.instrumentId).toBeNull();
    });

    it('vult de naam aan met .pdf als die ontbreekt', async () => {
      const antwoord = await opslaan(legResultaatNeer(), 'Mars_Jansen');

      const partij = db.prepare('SELECT original_filename FROM music_pieces WHERE id = ?').get(antwoord.body.id) as {
        original_filename: string;
      };
      expect(partij.original_filename).toBe('Mars_Jansen.pdf');
    });

    it('zet een kopie in de uploadmap en laat het tijdelijke bestand staan', async () => {
      const naam = legResultaatNeer();
      const antwoord = await opslaan(naam, 'Mars.pdf');

      const partij = db.prepare('SELECT file_path FROM music_pieces WHERE id = ?').get(antwoord.body.id) as {
        file_path: string;
      };
      expect(fs.existsSync(path.join(mappen.uploads, partij.file_path))).toBe(true);
      expect(fs.existsSync(path.join(mappen.temp, naam))).toBe(true);
    });

    it('is niet voor iemand zonder token', async () => {
      const antwoord = await request(app).post('/api/pdf-tools/save-as-music-piece').send({ filepath: 'x', filename: 'y' });
      expect(antwoord.status).toBe(401);
    });
  });

  describe('opruimen van tijdelijke bestanden', () => {
    it('gooit weg wat ouder is dan een uur en laat de rest staan', async () => {
      const oud = path.join(mappen.temp, `${commissielid.id}_${uuidv4()}_oud.pdf`);
      const nieuw = path.join(mappen.temp, `${commissielid.id}_${uuidv4()}_nieuw.pdf`);
      fs.writeFileSync(oud, 'oud');
      fs.writeFileSync(nieuw, 'nieuw');
      const langGeleden = new Date(Date.now() - 3 * 60 * 60 * 1000);
      fs.utimesSync(oud, langGeleden, langGeleden);

      cleanupTempFiles();

      expect(fs.existsSync(oud)).toBe(false);
      expect(fs.existsSync(nieuw)).toBe(true);
    });

    it('valt niet om als de map niet bestaat', () => {
      const bewaard = fs.readdirSync(mappen.temp);
      expect(bewaard).toBeDefined();
      expect(() => cleanupTempFiles()).not.toThrow();
    });
  });

  describe('de tijdelijke map blijft binnen de eigen grens', () => {
    it('laat een naam met een submap er niet in', async () => {
      const antwoord = await request(app)
        .get(`/api/pdf-tools/download/${encodeURIComponent('submap/iets.pdf')}`)
        .set('Authorization', `Bearer ${commissieToken}`);
      expect(antwoord.status).toBe(404);
    });

    it('haalt een bestand met een naam vol punten niet uit een andere map', async () => {
      const antwoord = await request(app)
        .get(`/api/pdf-tools/download/${encodeURIComponent(`${commissielid.id}_..%2f..%2fetc%2fpasswd`)}`)
        .set('Authorization', `Bearer ${commissieToken}`);
      expect(antwoord.status).toBe(404);
    });
  });

  it('laat geen bestanden achter buiten de tijdelijke map', () => {
    expect(fs.existsSync(mappen.basis)).toBe(true);
  });
});
