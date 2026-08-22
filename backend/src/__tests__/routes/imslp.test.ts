/**
 * Bladmuziek zoeken en importeren bij IMSLP (routes/imslp.ts).
 *
 * Deze route haalt een bestand op bij een partij buiten onze deur en schrijft
 * het resultaat in de bibliotheek van de vereniging weg. Daar zitten drie
 * risico's aan, en die staan hieronder vastgelegd:
 *
 *  1. Het adres om te downloaden komt uit de aanvraag. Zonder grens kan een
 *     ingelogde gebruiker de server een intern adres laten ophalen (SSRF).
 *     services/imslp.ts houdt een vaste lijst adressen aan; de tests hier
 *     controleren dat de route die grens ook echt oplevert en dat er bij een
 *     geweigerd adres geen enkel netwerkverzoek uitgaat.
 *  2. Wat er terugkomt is netwerkverkeer en dus onbetrouwbaar: geen pdf, veel
 *     te groot, of een storing bij IMSLP. Een fout aan die kant hoort bij onze
 *     gebruiker als 502 te landen, niet als 500 - dat laatste wijst naar ons.
 *  3. Wegschrijven gebeurt in de vereniging van de aanvrager en alleen door de
 *     muziekcommissie of een beheerder.
 *
 * Het netwerk wordt nooit echt benaderd: de dienst is gemockt, en waar de
 * echte grenscontrole aan bod komt draait die tegen een vervangen `fetch`.
 */

import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import fs from 'fs';
import path from 'path';
import '../setup';
import db from '../../database/connection';

/**
 * UPLOAD_DIR wordt in routes/imslp.ts eenmalig bij het laden van de module
 * gelezen, dus de omgevingsvariabele moet vaststaan voor de import. vi.hoisted
 * draait voor alle imports; daarom staat het hier en niet in een beforeAll.
 */
const uploadDir = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeFs = require('fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeOs = require('os');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodePath = require('path');
  const dir = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), 'imslp-route-test-'));
  process.env.UPLOAD_DIR = dir;
  return dir as string;
});

vi.mock('../../services/imslp', async () => {
  const echt = await vi.importActual<typeof import('../../services/imslp')>('../../services/imslp');
  return {
    ...echt,
    searchImslp: vi.fn(),
    getWorkDetails: vi.fn(),
    downloadPdf: vi.fn(),
  };
});

import { searchImslp, getWorkDetails, downloadPdf } from '../../services/imslp';
import imslpRoutes from '../../routes/imslp';
import { errorHandler } from '../../middleware/errorHandler';
import {
  createTestEnvironment,
  createTestAssociation,
  createTestUser,
  generateTestToken,
  TestAssociation,
  TestUser,
} from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api/imslp', imslpRoutes);
app.use(errorHandler);

const zoek = vi.mocked(searchImslp);
const werkDetails = vi.mocked(getWorkDetails);
const download = vi.mocked(downloadPdf);

/** Een minimale, geldige pdf: de controle in de route kijkt naar de magische bytes. */
const PDF = Buffer.from('%PDF-1.4\n%%EOF\n', 'latin1');

/** Een antwoord dat genoeg lijkt op fetch's Response voor services/imslp.ts. */
function antwoord(opties: {
  status?: number;
  contentType?: string;
  body?: Buffer | string;
  location?: string;
}): unknown {
  const status = opties.status ?? 200;
  const inhoud = opties.body ?? PDF;
  const buffer = Buffer.isBuffer(inhoud) ? inhoud : Buffer.from(inhoud, 'utf-8');
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (naam: string) => {
        if (naam.toLowerCase() === 'content-type') return opties.contentType ?? 'application/pdf';
        if (naam.toLowerCase() === 'location') return opties.location ?? null;
        return null;
      },
    },
    text: async () => buffer.toString('utf-8'),
    arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  };
}

describe('IMSLP-route', () => {
  let vereniging: TestAssociation;
  let beheerderToken: string;
  let lidToken: string;
  let commissie: TestUser;
  let commissieToken: string;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    beheerderToken = omgeving.adminToken;
    lidToken = omgeving.memberToken;
    commissie = omgeving.musicCommitteeUser;
    commissieToken = omgeving.musicCommitteeToken;

    zoek.mockReset();
    werkDetails.mockReset();
    download.mockReset();
    for (const bestand of fs.readdirSync(uploadDir)) fs.rmSync(path.join(uploadDir, bestand), { force: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(() => {
    fs.rmSync(uploadDir, { recursive: true, force: true });
  });

  function bestandenInUploadmap(): string[] {
    return fs.readdirSync(uploadDir);
  }

  function importeer(token: string, body: Record<string, unknown>) {
    return request(app).post('/api/imslp/import').set('Authorization', `Bearer ${token}`).send(body);
  }

  describe('GET /api/imslp/search', () => {
    it('weigert een aanvraag zonder token', async () => {
      const res = await request(app).get('/api/imslp/search?q=Mozart');

      expect(res.status).toBe(401);
      expect(zoek).not.toHaveBeenCalled();
    });

    it('eist een zoekterm', async () => {
      const res = await request(app).get('/api/imslp/search?q=%20%20').set('Authorization', `Bearer ${lidToken}`);

      expect(res.status).toBe(400);
      expect(zoek).not.toHaveBeenCalled();
    });

    it('geeft een 400 bij een zoekterm die twee keer meegestuurd wordt', async () => {
      // ?q=a&q=b levert een lijst op in plaats van tekst. Zonder controle
      // struikelt .trim() daarover en wordt een verkeerde aanvraag een 500.
      const res = await request(app).get('/api/imslp/search?q=a&q=b').set('Authorization', `Bearer ${lidToken}`);

      expect(res.status).toBe(400);
      expect(zoek).not.toHaveBeenCalled();
    });

    it('negeert een componist die twee keer meegestuurd wordt', async () => {
      zoek.mockResolvedValue({ works: [], totalCount: 0, searchUrl: 'https://imslp.org/x' });

      const res = await request(app)
        .get('/api/imslp/search?q=Requiem&composer=a&composer=b')
        .set('Authorization', `Bearer ${lidToken}`);

      expect(res.status).toBe(200);
      expect(zoek).toHaveBeenCalledWith('Requiem', undefined);
    });

    it('geeft de zoekterm en de componist door en levert het resultaat terug', async () => {
      zoek.mockResolvedValue({
        works: [{ id: 'W1', title: 'Requiem' } as any],
        totalCount: 1,
        searchUrl: 'https://imslp.org/x',
      });

      const res = await request(app)
        .get('/api/imslp/search?q=%20Requiem%20&composer=Mozart')
        .set('Authorization', `Bearer ${lidToken}`);

      expect(res.status).toBe(200);
      expect(res.body.totalCount).toBe(1);
      expect(zoek).toHaveBeenCalledWith('Requiem', 'Mozart');
    });

    it('maakt van een storing bij IMSLP geen 500 maar een 502', async () => {
      // Een fout aan de kant van IMSLP is geen fout van ons. Zou hij als 500
      // doorkomen, dan gaat de gebruiker (en de monitoring) op zoek naar een
      // defect dat hier niet zit.
      zoek.mockRejectedValue(new Error('IMSLP API error: 500'));

      const res = await request(app).get('/api/imslp/search?q=Mozart').set('Authorization', `Bearer ${lidToken}`);

      expect(res.status).toBe(502);
    });
  });

  describe('GET /api/imslp/work/:id', () => {
    it('weigert een aanvraag zonder token', async () => {
      const res = await request(app).get('/api/imslp/work/123');

      expect(res.status).toBe(401);
    });

    it('geeft de details van het werk terug', async () => {
      werkDetails.mockResolvedValue({ id: '123', title: 'Requiem', scores: [] } as any);

      const res = await request(app).get('/api/imslp/work/123').set('Authorization', `Bearer ${lidToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: '123', title: 'Requiem' });
      expect(werkDetails).toHaveBeenCalledWith('123');
    });

    it('meldt een onbekend werk als niet gevonden', async () => {
      werkDetails.mockResolvedValue(null);

      const res = await request(app).get('/api/imslp/work/999').set('Authorization', `Bearer ${lidToken}`);

      expect(res.status).toBe(404);
    });

    it('maakt van een trage of stukke IMSLP-server geen 500 maar een 502', async () => {
      werkDetails.mockRejectedValue(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }));

      const res = await request(app).get('/api/imslp/work/123').set('Authorization', `Bearer ${lidToken}`);

      expect(res.status).toBe(502);
    });
  });

  describe('POST /api/imslp/import - rechten en invoer', () => {
    it('weigert een aanvraag zonder token', async () => {
      const res = await request(app).post('/api/imslp/import').send({ fileUrl: 'https://imslp.org/a.pdf', title: 'X' });

      expect(res.status).toBe(401);
      expect(download).not.toHaveBeenCalled();
    });

    it('eist een adres en een titel', async () => {
      expect((await importeer(commissieToken, { title: 'X' })).status).toBe(400);
      expect((await importeer(commissieToken, { fileUrl: 'https://imslp.org/a.pdf' })).status).toBe(400);
      expect(download).not.toHaveBeenCalled();
    });

    it('laat een gewoon lid niet importeren, en downloadt dan ook niets', async () => {
      const res = await importeer(lidToken, { fileUrl: 'https://imslp.org/a.pdf', title: 'Requiem' });

      expect(res.status).toBe(403);
      // De rolcontrole hoort voor het netwerkverzoek te komen: anders kan een
      // lid de server toch laten ophalen wat hij wil.
      expect(download).not.toHaveBeenCalled();
      expect(bestandenInUploadmap()).toEqual([]);
    });
  });

  describe('POST /api/imslp/import - wegschrijven', () => {
    it('slaat het bestand op en legt titel, partij en logregel in de eigen vereniging vast', async () => {
      download.mockResolvedValue(PDF);

      const res = await importeer(commissieToken, {
        fileUrl: 'https://imslp.org/files/requiem.pdf',
        title: 'Requiem',
        composer: 'Mozart',
        arranger: 'De Haan',
        imslpWorkId: '4711',
        imslpPermalink: 'https://imslp.org/wiki/Requiem',
      });

      expect(res.status).toBe(200);
      expect(download).toHaveBeenCalledWith('https://imslp.org/files/requiem.pdf');

      const titel = db.prepare('SELECT * FROM music_titles WHERE id = ?').get(res.body.musicTitleId) as any;
      expect(titel).toMatchObject({
        title: 'Requiem',
        composer: 'Mozart',
        arranger: 'De Haan',
        association_id: vereniging.id,
        imslp_work_id: '4711',
      });

      const partij = db.prepare('SELECT * FROM music_pieces WHERE id = ?').get(res.body.musicPieceId) as any;
      expect(partij).toMatchObject({
        title: 'Requiem',
        association_id: vereniging.id,
        imslp_source: 'https://imslp.org/wiki/Requiem',
      });
      expect(partij.instrument_id).toBeTruthy();

      const log = db
        .prepare(`SELECT * FROM activity_log WHERE entity_id = ? AND entity_type = 'music_piece'`)
        .get(res.body.musicPieceId) as any;
      expect(log).toMatchObject({ user_id: commissie.id, action_type: 'import' });

      expect(bestandenInUploadmap()).toEqual([res.body.filename]);
      expect(fs.readFileSync(path.join(uploadDir, res.body.filename))).toEqual(PDF);
    });

    it('houdt de bestandsnaam binnen de uploadmap, ook bij een titel vol padtekens', async () => {
      download.mockResolvedValue(PDF);

      const res = await importeer(beheerderToken, {
        fileUrl: 'https://imslp.org/files/x.pdf',
        title: '../../etc/passwd',
        arranger: '../..',
      });

      expect(res.status).toBe(200);
      expect(res.body.filename).not.toContain('/');
      expect(res.body.filename).not.toContain('..');
      expect(path.dirname(path.resolve(uploadDir, res.body.filename))).toBe(uploadDir);
    });

    it('vult een bestaande titel met hetzelfde arrangement aan in plaats van er een tweede te maken', async () => {
      download.mockResolvedValue(PDF);

      const eerste = await importeer(commissieToken, {
        fileUrl: 'https://imslp.org/files/a.pdf',
        title: 'Requiem',
        arranger: 'De Haan',
      });
      const tweede = await importeer(commissieToken, {
        fileUrl: 'https://imslp.org/files/b.pdf',
        title: 'Requiem',
        arranger: 'De Haan',
        composer: 'Mozart',
        imslpWorkId: '4711',
      });

      expect(tweede.body.musicTitleId).toBe(eerste.body.musicTitleId);
      const titels = db.prepare('SELECT * FROM music_titles WHERE association_id = ?').all(vereniging.id) as any[];
      expect(titels).toHaveLength(1);
      // COALESCE: wat de eerste keer leeg bleef wordt alsnog ingevuld.
      expect(titels[0]).toMatchObject({ composer: 'Mozart', imslp_work_id: '4711' });
    });

    it('maakt voor een ander arrangement van hetzelfde werk een eigen titel aan', async () => {
      // music_titles is uniek op (title, arranger, association_id). Zoeken op
      // alleen de titel zou het arrangement zonder arrangeur overschrijven met
      // de gegevens van een heel ander arrangement.
      download.mockResolvedValue(PDF);

      const zonder = await importeer(commissieToken, { fileUrl: 'https://imslp.org/files/a.pdf', title: 'Requiem' });
      const met = await importeer(commissieToken, {
        fileUrl: 'https://imslp.org/files/b.pdf',
        title: 'Requiem',
        arranger: 'De Haan',
      });

      expect(met.body.musicTitleId).not.toBe(zonder.body.musicTitleId);
      const titels = db.prepare('SELECT arranger FROM music_titles WHERE title = ?').all('Requiem') as any[];
      expect(titels.map((t) => t.arranger).sort()).toEqual(['De Haan', null]);
    });

    it('gebruikt de gelijknamige titel van een andere vereniging niet', async () => {
      const andereVereniging = createTestAssociation({ name: 'Andere vereniging' });
      const andereCommissie = createTestUser(andereVereniging.id, {
        email: 'muziek@elders.nl',
        role: 'music_committee',
      });
      download.mockResolvedValue(PDF);

      const eerste = await importeer(commissieToken, { fileUrl: 'https://imslp.org/files/a.pdf', title: 'Requiem' });
      const tweede = await importeer(generateTestToken(andereCommissie), {
        fileUrl: 'https://imslp.org/files/a.pdf',
        title: 'Requiem',
      });

      expect(tweede.body.musicTitleId).not.toBe(eerste.body.musicTitleId);
      const partij = db
        .prepare('SELECT association_id FROM music_pieces WHERE id = ?')
        .get(tweede.body.musicPieceId) as any;
      expect(partij.association_id).toBe(andereVereniging.id);
    });
  });

  describe('POST /api/imslp/import - onbetrouwbaar antwoord van IMSLP', () => {
    it('slaat niets op als het gedownloade bestand geen pdf is', async () => {
      // Wie een .pdf-adres opgeeft dat in werkelijkheid html of iets uitvoerbaars
      // teruggeeft, mag dat niet als bladmuziek in de bibliotheek krijgen.
      download.mockResolvedValue(Buffer.from('<html>Toegang geweigerd</html>', 'utf-8'));

      const res = await importeer(commissieToken, { fileUrl: 'https://imslp.org/files/a.pdf', title: 'Requiem' });

      expect(res.status).toBe(502);
      expect(bestandenInUploadmap()).toEqual([]);
      expect(db.prepare('SELECT COUNT(*) as n FROM music_pieces').get()).toMatchObject({ n: 0 });
      expect(db.prepare('SELECT COUNT(*) as n FROM music_titles').get()).toMatchObject({ n: 0 });
    });

    it('slaat niets op als het gedownloade bestand te groot is', async () => {
      const teGroot = Buffer.concat([PDF, Buffer.alloc(50 * 1024 * 1024)]);
      download.mockResolvedValue(teGroot);

      const res = await importeer(commissieToken, { fileUrl: 'https://imslp.org/files/a.pdf', title: 'Requiem' });

      expect(res.status).toBe(502);
      expect(bestandenInUploadmap()).toEqual([]);
      expect(db.prepare('SELECT COUNT(*) as n FROM music_pieces').get()).toMatchObject({ n: 0 });
    });

    it('geeft een mislukte download door als 502 en laat de bibliotheek ongemoeid', async () => {
      download.mockRejectedValue(new Error('Failed to download PDF: 503'));

      const res = await importeer(commissieToken, { fileUrl: 'https://imslp.org/files/a.pdf', title: 'Requiem' });

      expect(res.status).toBe(502);
      expect(res.body.error).toMatch(/Failed to download PDF/);
      expect(db.prepare('SELECT COUNT(*) as n FROM music_titles').get()).toMatchObject({ n: 0 });
    });
  });

  /**
   * Hier draait de echte downloadPdf uit services/imslp.ts, met een vervangen
   * `fetch`. Alleen zo is te zien dat een geweigerd adres ook echt geen
   * netwerkverzoek oplevert - met een gemockte dienst zou dat niet blijken.
   */
  describe('POST /api/imslp/import - het adres komt uit de aanvraag (SSRF)', () => {
    let nep: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
      const echt = await vi.importActual<typeof import('../../services/imslp')>('../../services/imslp');
      download.mockImplementation(echt.downloadPdf);
      nep = vi.fn(async () => antwoord({}));
      vi.stubGlobal('fetch', nep);
    });

    it.each([
      ['een intern adres', 'http://169.254.169.254/latest/meta-data/iam/'],
      ['localhost op een andere poort', 'http://127.0.0.1:9200/_search'],
      ['een adres binnen het netwerk', 'https://192.168.1.10/admin.pdf'],
      ['een vreemde host', 'https://kwaadaardig.example.com/score.pdf'],
      ['een host die op imslp.org lijkt', 'https://imslp.org.example.com/score.pdf'],
      ['imslp.org als inlognaam voor een andere host', 'https://imslp.org@kwaadaardig.example.com/score.pdf'],
      ['een file-adres', 'file:///etc/passwd'],
      ['geen adres', 'zomaar wat tekst'],
    ])('weigert %s zonder er ook maar heen te gaan', async (_naam, adres) => {
      const res = await importeer(commissieToken, { fileUrl: adres, title: 'Requiem' });

      expect(res.status).toBe(502);
      expect(nep).not.toHaveBeenCalled();
      expect(bestandenInUploadmap()).toEqual([]);
      expect(db.prepare('SELECT COUNT(*) as n FROM music_pieces').get()).toMatchObject({ n: 0 });
    });

    it('volgt een doorverwijzing naar een intern adres niet', async () => {
      // Een toegestane host mag de server niet alsnog naar binnen sturen:
      // elke stap gaat opnieuw langs de lijst met toegestane adressen.
      nep.mockImplementationOnce(async () => antwoord({ status: 302, location: 'http://169.254.169.254/' }));

      const res = await importeer(commissieToken, {
        fileUrl: 'https://imslp.org/files/requiem.pdf',
        title: 'Requiem',
      });

      expect(res.status).toBe(502);
      expect(nep).toHaveBeenCalledTimes(1);
      expect(bestandenInUploadmap()).toEqual([]);
    });

    it('haalt een toegestaan adres wel op en bewaart het pad uit de aanvraag', async () => {
      const res = await importeer(commissieToken, {
        fileUrl: 'https://ks4.imslp.net/files/imglnks/usimg/requiem.pdf?download=1',
        title: 'Requiem',
      });

      expect(res.status).toBe(200);
      expect(nep).toHaveBeenCalledTimes(1);
      expect(String(nep.mock.calls[0][0])).toBe('https://ks4.imslp.net/files/imglnks/usimg/requiem.pdf?download=1');
      expect(bestandenInUploadmap()).toHaveLength(1);
    });
  });
});
