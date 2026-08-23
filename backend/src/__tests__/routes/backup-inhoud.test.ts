/**
 * Wat er in een reservekopie zit, en wat terugzetten aanraakt.
 *
 * backup.test.ts legt vast wie er bij deze drie routes mag: super-admin, niet
 * de beheerder van een vereniging. Dit bestand laat zien waarom dat de enige
 * juiste grens is - want de vraag "kan een beheerder van vereniging A een
 * reservekopie maken of terugzetten die gegevens van B bevat?" heeft geen
 * antwoord dat over inhoud gaat. De reservekopie is het databasebestand plus
 * de hele uploadmap, en dat is per definitie de hele installatie:
 *
 * - er zit geen enkele filter op association_id in;
 * - de partijen van alle verenigingen liggen in dezelfde uploadmap;
 * - terugzetten schrijft dat databasebestand er in zijn geheel overheen.
 *
 * Er valt dus niets af te bakenen per vereniging: de rechtencontrole aan de
 * voorkant is de hele bescherming. De tests hieronder maken dat zichtbaar in
 * plaats van het te beweren, zodat iemand die deze routes ooit terugzet op
 * requireRole('admin') meteen ziet wat hij daarmee weggeeft.
 *
 * Alle paden wijzen naar een tijdelijke map: config.dbPath is vervangen, en
 * UPLOAD_DIR, MP3_UPLOAD_DIR en BACKUP_DIR staan in de omgeving. Er wordt
 * niets in de projectmap of in data/ aangeraakt.
 */

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { v4 as uuidv4 } from 'uuid';
import '../setup';

const tijdelijk = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeFs = require('fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeOs = require('os');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodePath = require('path');
  const basis = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), 'tutti-backup-route-'));
  const uploads = nodePath.join(basis, 'uploads');
  const mp3 = nodePath.join(uploads, 'mp3');
  const backups = nodePath.join(basis, 'backups');
  nodeFs.mkdirSync(mp3, { recursive: true });
  nodeFs.mkdirSync(backups, { recursive: true });
  // De oude waarden onthouden. Testbestanden delen een werkproces, dus een
  // omgevingsvariabele die hier blijft staan wijst voor een volgend bestand
  // naar een map die na afloop is opgeruimd.
  const eerder = {
    UPLOAD_DIR: process.env.UPLOAD_DIR,
    MP3_UPLOAD_DIR: process.env.MP3_UPLOAD_DIR,
    BACKUP_DIR: process.env.BACKUP_DIR,
  };
  process.env.UPLOAD_DIR = uploads;
  process.env.MP3_UPLOAD_DIR = mp3;
  process.env.BACKUP_DIR = backups;
  return {
    eerder,
    basis: basis as string,
    uploads: uploads as string,
    mp3: mp3 as string,
    backups: backups as string,
    databasePad: nodePath.join(basis, 'harmonie.db') as string,
  };
});

// config wordt op moduleniveau ingelezen; alleen het pad naar de database
// wijzigt, de rest van de instellingen blijft echt.
vi.mock('../../config', async (importOriginal) => {
  const echt = (await importOriginal()) as { default: Record<string, unknown>; config: Record<string, unknown> };
  return {
    ...echt,
    default: { ...echt.default, dbPath: tijdelijk.databasePad },
    config: { ...echt.config, dbPath: tijdelijk.databasePad },
  };
});

import db from '../../database/connection';
import backupRoutes from '../../routes/backup';
import { errorHandler } from '../../middleware/errorHandler';
import {
  createTestAssociation,
  createTestEnvironment,
  createTestMusicPiece,
  createTestUser,
  generateTestToken,
  TestAssociation,
  TestUser,
} from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api/backup', backupRoutes);
app.use(errorHandler);

/**
 * De testdatabase leeft in het geheugen en kent flush() noch reload(); de
 * echte wrapper wel, en de routes roepen ze aan. Hier staan ze als lege
 * plaatsvervanger, zodat de rest van de route gewoon doorloopt.
 */
const doorgespoeld = vi.fn();
const herladen = vi.fn().mockResolvedValue(undefined);
(db as unknown as Record<string, unknown>).flush = doorgespoeld;
(db as unknown as Record<string, unknown>).reload = herladen;

const SQLITE_KOP = Buffer.from('SQLite format 3\0', 'latin1');

/** Een bestand dat een echte SQLite-database lijkt, met een herkenbaar merk erin. */
function nepDatabase(merk: string): Buffer {
  return Buffer.concat([SQLITE_KOP, Buffer.from(merk.padEnd(64, ' '), 'utf-8')]);
}

function leegMap(map: string): void {
  if (!fs.existsSync(map)) return;
  for (const naam of fs.readdirSync(map)) {
    const pad = path.join(map, naam);
    if (fs.statSync(pad).isDirectory() && pad === tijdelijk.mp3) {
      leegMap(pad);
      continue;
    }
    fs.rmSync(pad, { force: true, recursive: true });
  }
}

describe('inhoud van de reservekopie', () => {
  let vereniging: TestAssociation;
  let andereVereniging: TestAssociation;
  let superAdmin: TestUser;
  let superAdminToken: string;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    andereVereniging = createTestAssociation({ name: 'Andere vereniging' });

    superAdmin = createTestUser(vereniging.id, { email: 'super@test.nl', role: 'admin' });
    superAdminToken = generateTestToken(superAdmin);
    db.prepare('INSERT INTO super_admins (id, user_id) VALUES (?, ?)').run(uuidv4(), superAdmin.id);

    leegMap(tijdelijk.uploads);
    leegMap(tijdelijk.backups);
    fs.rmSync(tijdelijk.databasePad, { force: true });
    doorgespoeld.mockClear();
    herladen.mockClear();
  });

  afterAll(() => {
    for (const [sleutel, waarde] of Object.entries(tijdelijk.eerder)) {
      if (waarde === undefined) delete process.env[sleutel];
      else process.env[sleutel] = waarde;
    }
    fs.rmSync(tijdelijk.basis, { force: true, recursive: true });
  });

  /** Legt een partij neer: een rij in music_pieces en het bestand erbij. */
  function legPartijNeer(associationId: string, opgeslagenNaam: string, oorspronkelijkeNaam: string): void {
    createTestMusicPiece(associationId, { filePath: opgeslagenNaam, originalFilename: oorspronkelijkeNaam });
    fs.writeFileSync(path.join(tijdelijk.uploads, opgeslagenNaam), `inhoud van ${oorspronkelijkeNaam}`);
  }

  /** Legt een mp3 neer: een rij in music_titles en het bestand erbij. */
  function legMp3Neer(associationId: string, opgeslagenNaam: string, titel: string): void {
    db.prepare('INSERT INTO music_titles (id, title, mp3_file_path, association_id) VALUES (?, ?, ?, ?)').run(
      uuidv4(),
      titel,
      opgeslagenNaam,
      associationId,
    );
    fs.writeFileSync(path.join(tijdelijk.mp3, opgeslagenNaam), `klank van ${titel}`);
  }

  const alsSuperAdmin = (methode: 'get' | 'post', pad: string) =>
    request(app)[methode](`/api/backup${pad}`).set('Authorization', `Bearer ${superAdminToken}`);

  async function haalReservekopieOp(): Promise<AdmZip> {
    const antwoord = await alsSuperAdmin('get', '/').responseType('blob');
    expect(antwoord.status, antwoord.text).toBe(200);
    return new AdmZip(antwoord.body as Buffer);
  }

  describe('de reservekopie gaat over de hele installatie', () => {
    it('neemt het databasebestand ongefilterd mee', async () => {
      fs.writeFileSync(tijdelijk.databasePad, nepDatabase('database van alle verenigingen'));

      const zip = await haalReservekopieOp();
      const ingang = zip.getEntry('database/harmonie.db');

      expect(ingang).toBeTruthy();
      expect(ingang!.getData().toString('utf-8')).toContain('database van alle verenigingen');
    });

    it('neemt de partijen van elke vereniging mee, niet alleen die van de aanvrager', async () => {
      legPartijNeer(vereniging.id, 'onze.pdf', 'Mars der Medici.pdf');
      legPartijNeer(andereVereniging.id, 'hunne.pdf', 'Hun geheime stuk.pdf');

      const namen = (await haalReservekopieOp()).getEntries().map((e) => e.entryName);

      expect(namen).toContain('uploads/Mars der Medici.pdf');
      expect(namen).toContain('uploads/Hun geheime stuk.pdf');
    });

    it('neemt ook de opnames van elke vereniging mee', async () => {
      legMp3Neer(vereniging.id, 'onze.mp3', 'Ons nummer');
      legMp3Neer(andereVereniging.id, 'hunne.mp3', 'Hun nummer');

      const namen = (await haalReservekopieOp()).getEntries().map((e) => e.entryName);

      expect(namen).toContain('uploads/mp3/Ons nummer.mp3');
      expect(namen).toContain('uploads/mp3/Hun nummer.mp3');
    });

    it('legt in het manifest van beide verenigingen vast hoe de bestanden heten', async () => {
      legPartijNeer(vereniging.id, 'onze.pdf', 'Onze partij.pdf');
      legPartijNeer(andereVereniging.id, 'hunne.pdf', 'Hun partij.pdf');

      const zip = await haalReservekopieOp();
      const manifest = JSON.parse(zip.getEntry('manifest.json')!.getData().toString('utf-8'));

      expect(manifest.version).toBe(1);
      const opgeslagen = manifest.pdfs.map((p: { storedName: string }) => p.storedName).sort();
      expect(opgeslagen).toEqual(['hunne.pdf', 'onze.pdf']);
    });

    it('spoelt de database naar schijf voordat hij hem inpakt', async () => {
      // Zonder dit staat de laatste wijziging nog in het geheugen en zit hij
      // niet in de reservekopie.
      fs.writeFileSync(tijdelijk.databasePad, nepDatabase('x'));
      await haalReservekopieOp();
      expect(doorgespoeld).toHaveBeenCalled();
    });

    it('werkt ook als er nog geen databasebestand op schijf staat', async () => {
      const zip = await haalReservekopieOp();
      expect(zip.getEntry('database/harmonie.db')).toBeNull();
      expect(zip.getEntry('manifest.json')).toBeTruthy();
    });

    it('geeft een bestandsnaam met een tijdstempel mee', async () => {
      const antwoord = await alsSuperAdmin('get', '/').responseType('blob');
      expect(antwoord.headers['content-disposition']).toMatch(/harmonie-backup-\d{4}-\d{2}-\d{2}T/);
      expect(antwoord.headers['content-type']).toContain('zip');
    });
  });

  describe('namen in de reservekopie', () => {
    it('houdt een bestand zonder rij in de database onder zijn opgeslagen naam', async () => {
      fs.writeFileSync(path.join(tijdelijk.uploads, 'zwerver.pdf'), 'losse partij');

      const namen = (await haalReservekopieOp()).getEntries().map((e) => e.entryName);
      expect(namen).toContain('uploads/zwerver.pdf');
    });

    it('geeft twee partijen met dezelfde oorspronkelijke naam een volgnummer', async () => {
      legPartijNeer(vereniging.id, 'een.pdf', 'Mars.pdf');
      legPartijNeer(andereVereniging.id, 'twee.pdf', 'Mars.pdf');

      const namen = (await haalReservekopieOp())
        .getEntries()
        .map((e) => e.entryName)
        .filter((n) => n.startsWith('uploads/'));

      expect(namen.sort()).toEqual(['uploads/Mars (1).pdf', 'uploads/Mars.pdf']);
    });

    it('laat andere bestanden dan pdf en mp3 buiten de reservekopie', async () => {
      fs.writeFileSync(path.join(tijdelijk.uploads, 'aantekening.txt'), 'niet meenemen');

      const namen = (await haalReservekopieOp()).getEntries().map((e) => e.entryName);
      expect(namen).not.toContain('uploads/aantekening.txt');
    });
  });

  describe('de omvangsopgave', () => {
    it('telt database, partijen en opnames apart en bij elkaar op', async () => {
      fs.writeFileSync(tijdelijk.databasePad, Buffer.alloc(1024));
      legPartijNeer(vereniging.id, 'een.pdf', 'Een.pdf');
      legMp3Neer(vereniging.id, 'een.mp3', 'Een');

      const antwoord = await alsSuperAdmin('get', '/info');

      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      expect(antwoord.body.database.size).toBe(1024);
      expect(antwoord.body.database.sizeFormatted).toBe('1 KB');
      expect(antwoord.body.pdfFiles.count).toBe(1);
      expect(antwoord.body.mp3Files.count).toBe(1);
      expect(antwoord.body.total.size).toBe(
        antwoord.body.database.size + antwoord.body.pdfFiles.size + antwoord.body.mp3Files.size,
      );
    });

    it('meldt nul bytes als er nog niets staat', async () => {
      const antwoord = await alsSuperAdmin('get', '/info');

      expect(antwoord.body.database.size).toBe(0);
      expect(antwoord.body.total.sizeFormatted).toBe('0 B');
      expect(antwoord.body.pdfFiles.count).toBe(0);
    });
  });

  describe('terugzetten', () => {
    /** Bouwt een zipbestand op zoals de aanleveraar het aanbiedt. */
    function bouwZip(ingangen: Record<string, Buffer | string>, mappen: string[] = []): Buffer {
      const zip = new AdmZip();
      for (const map of mappen) {
        zip.addFile(map.endsWith('/') ? map : `${map}/`, Buffer.alloc(0));
      }
      for (const [naam, inhoud] of Object.entries(ingangen)) {
        zip.addFile(naam, typeof inhoud === 'string' ? Buffer.from(inhoud, 'utf-8') : inhoud);
      }
      return zip.toBuffer();
    }

    const terugzetten = (inhoud: Buffer, naam = 'backup.zip') =>
      alsSuperAdmin('post', '/restore').attach('backup', inhoud, naam);

    it('weigert een bestand dat geen zip is met een nette fout', async () => {
      // BEWIJS. De fileFilter van multer gooide een gewone Error, en die kent
      // de centrale afhandeling niet: de aanleveraar kreeg 500 "Interne
      // serverfout" terwijl er niets aan de server mankeerde.
      const antwoord = await terugzetten(Buffer.from('gewoon tekst'), 'aantekening.txt');

      expect(antwoord.status).toBe(400);
      expect(antwoord.body.error).toContain('ZIP');
    });

    it('zet partijen en opnames terug', async () => {
      const antwoord = await terugzetten(
        bouwZip({ 'uploads/Partij.pdf': 'partij', 'uploads/mp3/Nummer.mp3': 'klank' }),
      );

      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      expect(antwoord.body.restored).toEqual({ database: false, pdfFiles: 1, mp3Files: 1 });
      expect(fs.existsSync(path.join(tijdelijk.uploads, 'Partij.pdf'))).toBe(true);
      expect(fs.existsSync(path.join(tijdelijk.mp3, 'Nummer.mp3'))).toBe(true);
    });

    it('slaat mappen in het zipbestand over', async () => {
      const antwoord = await terugzetten(bouwZip({ 'uploads/Partij.pdf': 'partij' }, ['uploads', 'uploads/mp3']));
      expect(antwoord.body.restored.pdfFiles).toBe(1);
    });

    it('gebruikt het manifest om de opgeslagen naam terug te vinden', async () => {
      const manifest = {
        version: 1,
        pdfs: [{ storedName: 'abc123.pdf', archiveName: 'Mars der Medici.pdf' }],
        mp3s: [{ storedName: 'def456.mp3', archiveName: 'Ons nummer.mp3' }],
      };
      await terugzetten(
        bouwZip({
          'manifest.json': JSON.stringify(manifest),
          'uploads/Mars der Medici.pdf': 'partij',
          'uploads/mp3/Ons nummer.mp3': 'klank',
        }),
      );

      expect(fs.existsSync(path.join(tijdelijk.uploads, 'abc123.pdf'))).toBe(true);
      expect(fs.existsSync(path.join(tijdelijk.mp3, 'def456.mp3'))).toBe(true);
      expect(fs.existsSync(path.join(tijdelijk.uploads, 'Mars der Medici.pdf'))).toBe(false);
    });

    it('schrijft niets buiten de doelmap als het manifest daarom vraagt', async () => {
      // De namen in manifest.json komen uit het aangeleverde zipbestand en zijn
      // dus door de aanleveraar bepaald. De controle op padverkeer die naar de
      // naam van de zip-ingang kijkt raakt storedName niet.
      const manifest = {
        version: 1,
        pdfs: [{ storedName: '../ontsnapt.pdf', archiveName: 'Partij.pdf' }],
        mp3s: [],
      };
      const antwoord = await terugzetten(
        bouwZip({ 'manifest.json': JSON.stringify(manifest), 'uploads/Partij.pdf': 'partij' }),
      );

      expect(antwoord.status).toBe(200);
      expect(antwoord.body.restored.pdfFiles).toBe(0);
      expect(fs.existsSync(path.join(tijdelijk.basis, 'ontsnapt.pdf'))).toBe(false);
    });

    it('slaat een zip-ingang over die uit de map wijst', async () => {
      // AdmZip haalt een pad met '..' erin er zelf al uit bij het schrijven,
      // dus zo'n zipbestand is er niet mee te maken. Een aanleveraar die dit
      // probeert gebruikt geen AdmZip, dus de naam wordt hier na afloop in de
      // ruwe bytes teruggezet - hij komt twee keer voor, in de lokale kop en in
      // de centrale map, en is even lang als de naam die erin stond.
      const opvulling = 'xx/uploads/Ontsnapt.pdf';
      const echteNaam = '../uploads/Ontsnapt.pdf';
      const bytes = bouwZip({ [opvulling]: 'partij' });
      let positie = bytes.indexOf(opvulling, 0, 'latin1');
      while (positie !== -1) {
        bytes.write(echteNaam, positie, 'latin1');
        positie = bytes.indexOf(opvulling, positie + 1, 'latin1');
      }

      const antwoord = await terugzetten(bytes);

      expect(antwoord.status).toBe(200);
      expect(antwoord.body.restored.pdfFiles).toBe(0);
      expect(fs.existsSync(path.join(tijdelijk.uploads, 'Ontsnapt.pdf'))).toBe(false);
      expect(fs.existsSync(path.join(tijdelijk.basis, 'Ontsnapt.pdf'))).toBe(false);
    });

    it('valt terug op de oude manier als het manifest onleesbaar is', async () => {
      const antwoord = await terugzetten(
        bouwZip({ 'manifest.json': '{dit is geen json', 'uploads/Partij.pdf': 'partij' }),
      );

      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      expect(antwoord.body.restored.pdfFiles).toBe(1);
      expect(fs.existsSync(path.join(tijdelijk.uploads, 'Partij.pdf'))).toBe(true);
    });

    it('valt ook terug als het manifest wel json is maar de lijsten mist', async () => {
      // BEWIJS. Het vangnet om JSON.parse heen ving alleen kapotte json op. Een
      // manifest dat wél json is maar geen pdfs- en mp3s-lijst heeft - een
      // afgeknot bestand, een reservekopie uit een andere versie - liep stuk op
      // `for (const m of manifest.pdfs)`. Die fout werd door de buitenste catch
      // omgezet in 500, en het terugzetten stopte in zijn geheel: geen
      // database, geen partijen, geen opnames. De momentopname was op dat
      // moment al gemaakt, dus de beheerder hield een half karwei over met
      // alleen "Fout bij herstellen van backup." als uitleg.
      const antwoord = await terugzetten(
        bouwZip({ 'manifest.json': JSON.stringify({ version: 2 }), 'uploads/Partij.pdf': 'partij' }),
      );

      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      expect(antwoord.body.restored.pdfFiles).toBe(1);
    });

    it('negeert manifestregels die geen bruikbare namen bevatten', async () => {
      // BEWIJS. storedName ging rechtstreeks path.basename in. Een getal in
      // plaats van een naam gaf daar een TypeError, met dezelfde 500 en
      // hetzelfde halve karwei tot gevolg.
      const manifest = {
        version: 1,
        pdfs: [{ storedName: 42, archiveName: 'Partij.pdf' }],
        mp3s: [],
      };
      const antwoord = await terugzetten(
        bouwZip({ 'manifest.json': JSON.stringify(manifest), 'uploads/Partij.pdf': 'partij' }),
      );

      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      expect(antwoord.body.restored.pdfFiles).toBe(1);
      expect(fs.existsSync(path.join(tijdelijk.uploads, 'Partij.pdf'))).toBe(true);
    });

    it('weigert een reservekopie waarvan de database geen database is', async () => {
      fs.writeFileSync(tijdelijk.databasePad, nepDatabase('de echte'));

      const antwoord = await terugzetten(bouwZip({ 'database/harmonie.db': 'dit is geen sqlite' }));

      expect(antwoord.status).toBe(400);
      expect(antwoord.body.error).toContain('SQLite');
      expect(fs.readFileSync(tijdelijk.databasePad).toString('utf-8')).toContain('de echte');
    });

    it('weigert ook een database die te kort is om te herkennen', async () => {
      const antwoord = await terugzetten(bouwZip({ 'database/harmonie.db': 'SQLite' }));
      expect(antwoord.status).toBe(400);
    });

    it('schrijft de database van de aanleveraar over de bestaande heen', async () => {
      // Dit is de kern van de verenigingsvraag. Er wordt niets samengevoegd en
      // niets gefilterd: het aangeleverde bestand komt er in zijn geheel voor
      // in de plaats, dus voor alle verenigingen op de installatie tegelijk.
      fs.writeFileSync(tijdelijk.databasePad, nepDatabase('de bestaande installatie'));

      const antwoord = await terugzetten(
        bouwZip({ 'database/harmonie.db': nepDatabase('meegebrachte database') }),
      );

      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      expect(antwoord.body.restored.database).toBe(true);
      expect(fs.readFileSync(tijdelijk.databasePad).toString('utf-8')).toContain('meegebrachte database');
    });

    it('maakt eerst een momentopname van de bestaande database', async () => {
      fs.writeFileSync(tijdelijk.databasePad, nepDatabase('de bestaande installatie'));

      await terugzetten(bouwZip({ 'database/harmonie.db': nepDatabase('meegebrachte database') }));

      const momentopnames = fs.readdirSync(path.join(tijdelijk.backups, 'pre-restore'));
      expect(momentopnames).toHaveLength(1);
      const bewaard = fs.readFileSync(path.join(tijdelijk.backups, 'pre-restore', momentopnames[0]));
      expect(bewaard.toString('utf-8')).toContain('de bestaande installatie');
    });

    it('leest de database opnieuw in nadat hij is teruggezet', async () => {
      // Zonder dit houdt de draaiende sql.js-instantie zijn oude kopie vast en
      // schrijft de eerstvolgende save() de teruggezette database weer weg.
      fs.writeFileSync(tijdelijk.databasePad, nepDatabase('oud'));
      await terugzetten(bouwZip({ 'database/harmonie.db': nepDatabase('nieuw') }));

      expect(herladen).toHaveBeenCalled();
    });

    it('leest niets opnieuw in als er geen database in de reservekopie zat', async () => {
      await terugzetten(bouwZip({ 'uploads/Partij.pdf': 'partij' }));
      expect(herladen).not.toHaveBeenCalled();
    });

    it('maakt de doelmappen aan als ze er nog niet zijn', async () => {
      fs.rmSync(tijdelijk.uploads, { force: true, recursive: true });

      const antwoord = await terugzetten(bouwZip({ 'uploads/Partij.pdf': 'partij' }));

      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      expect(fs.existsSync(tijdelijk.mp3)).toBe(true);
    });
  });
});
