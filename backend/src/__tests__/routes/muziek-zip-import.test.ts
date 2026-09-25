/**
 * De zip-import van bladmuziek (POST /music-pieces/upload-zip).
 *
 * De import pakt de bestanden sinds september 2026 asynchroon uit en schrijft
 * ze asynchroon weg; synchroon hield een grote zip het hele proces seconden
 * vast. Dat vroeg om een andere volgorde: eerst alle bestanden op schijf, dan
 * de rijen in één transactie. Wat hier vastligt is dat die volgorde niets
 * achterlaat: een bestand dat niet in de database komt, gaat weer van schijf.
 * Dat was eerder ook niet zo - een mislukte rij liet zijn bestand staan, voor
 * niemand vindbaar en door niets opgeruimd.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import '../setup';
import db from '../../database/connection';
import app from '../testApp';
import { createTestEnvironment, TestAssociation } from '../testUtils';
import { ZIP_MAX_PER_BESTAND, ZIP_MAX_TOTAAL } from '../../routes/music-pieces';

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '../../../uploads');

/** Een klein geldig pdf-bestand met een eigen herkenbare regel erin. */
function pdf(kenmerk: string): Buffer {
  return Buffer.from(
    '%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
      '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
      '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 99 99]>>endobj\n' +
      `% ${kenmerk}\ntrailer<</Root 1 0 R>>\n`,
    'utf-8',
  );
}

/** De pdf-bestanden die nu in de uploadmap staan. */
function bestandenOpSchijf(): Set<string> {
  if (!fs.existsSync(UPLOAD_DIR)) return new Set();
  return new Set(fs.readdirSync(UPLOAD_DIR).filter((naam) => naam.endsWith('.pdf')));
}

function stukkenVan(associationId: string) {
  return db
    .prepare('SELECT title, file_path, original_filename FROM music_pieces WHERE association_id = ? ORDER BY title')
    .all(associationId) as { title: string; file_path: string; original_filename: string }[];
}

describe('de zip-import van bladmuziek', () => {
  let vereniging: TestAssociation;
  let beheerderToken: string;
  let vooraf: Set<string>;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    beheerderToken = omgeving.adminToken;
    vooraf = bestandenOpSchijf();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Alleen wat deze test zelf heeft neergelegd.
    for (const naam of bestandenOpSchijf()) {
      if (!vooraf.has(naam)) fs.unlinkSync(path.join(UPLOAD_DIR, naam));
    }
  });

  const nieuweBestanden = () => [...bestandenOpSchijf()].filter((naam) => !vooraf.has(naam));

  const importeer = (zip: AdmZip) =>
    request(app)
      .post('/api/music-pieces/upload-zip')
      .set('Authorization', `Bearer ${beheerderToken}`)
      .attach('file', zip.toBuffer(), 'partijen.zip');

  it('zet elk pdf-bestand uit de zip met zijn eigen inhoud op schijf', async () => {
    const zip = new AdmZip();
    zip.addFile('Mars der Medici - Trompet 1.pdf', pdf('mars'));
    zip.addFile('Ouverture - Hoorn 2.pdf', pdf('ouverture'));

    const antwoord = await importeer(zip);

    expect(antwoord.status).toBe(201);
    expect(antwoord.body.uploaded).toHaveLength(2);
    expect(antwoord.body.errors).toBeUndefined();

    const stukken = stukkenVan(vereniging.id);
    expect(stukken.map((s) => s.original_filename).sort()).toEqual([
      'Mars der Medici - Trompet 1.pdf',
      'Ouverture - Hoorn 2.pdf',
    ]);
    for (const stuk of stukken) {
      const inhoud = fs.readFileSync(path.join(UPLOAD_DIR, stuk.file_path), 'utf-8');
      expect(inhoud).toContain(stuk.original_filename.startsWith('Mars') ? '% mars' : '% ouverture');
    }
    expect(nieuweBestanden().sort()).toEqual(stukken.map((s) => s.file_path).sort());
  });

  it('meldt een bestand dat geen pdf is en schrijft het niet weg', async () => {
    const zip = new AdmZip();
    zip.addFile('Mars der Medici - Trompet 1.pdf', pdf('mars'));
    zip.addFile('Vermomd - Trompet 2.pdf', Buffer.from('dit is tekst, geen pdf'));

    const antwoord = await importeer(zip);

    expect(antwoord.status).toBe(201);
    expect(antwoord.body.uploaded).toHaveLength(1);
    expect(antwoord.body.errors).toEqual([
      { filename: 'Vermomd - Trompet 2.pdf', error: 'Bestand is geen geldige PDF.' },
    ]);
    expect(nieuweBestanden()).toHaveLength(1);
  });

  it('slaat een beschadigd bestand in de zip over en neemt de rest wel op', async () => {
    const zip = new AdmZip();
    zip.addFile('Mars der Medici - Trompet 1.pdf', pdf('mars'));
    zip.addFile('Beschadigd - Trompet 2.pdf', pdf('beschadigd'));
    // Ongecomprimeerd opslaan, zodat de inhoud letterlijk in de zip staat en
    // één byte ervan te beschadigen is zonder de pdf-kop te raken.
    zip.getEntry('Beschadigd - Trompet 2.pdf')!.header.method = 0;
    const bytes = zip.toBuffer();
    const plek = bytes.indexOf('% beschadigd');
    expect(plek).toBeGreaterThan(0);
    bytes[plek + 2] = 'B'.charCodeAt(0);

    const antwoord = await request(app)
      .post('/api/music-pieces/upload-zip')
      .set('Authorization', `Bearer ${beheerderToken}`)
      .attach('file', bytes, 'partijen.zip');

    expect(antwoord.status).toBe(201);
    expect(antwoord.body.uploaded.map((u: { filename: string }) => u.filename)).toEqual([
      'Mars der Medici - Trompet 1.pdf',
    ]);
    expect(antwoord.body.errors).toHaveLength(1);
    expect(antwoord.body.errors[0].filename).toBe('Beschadigd - Trompet 2.pdf');
    expect(nieuweBestanden()).toHaveLength(1);
  });

  it('laat geen bestand op schijf achter als de rij in de database niet lukt', async () => {
    const zip = new AdmZip();
    zip.addFile('Mars der Medici - Trompet 1.pdf', pdf('mars'));
    zip.addFile('Ouverture - Hoorn 2.pdf', pdf('ouverture'));

    // De rij voor de ouverture wordt geweigerd; de mars komt gewoon binnen.
    const echtePrepare = db.prepare.bind(db);
    vi.spyOn(db, 'prepare').mockImplementation((sql: string) => {
      const statement = echtePrepare(sql);
      if (!sql.includes('INSERT INTO music_pieces')) return statement;
      return {
        ...statement,
        run: (...waarden: unknown[]) => {
          if (waarden.includes('Ouverture - Hoorn 2.pdf')) throw new Error('schijf vol');
          return statement.run(...(waarden as never[]));
        },
      } as typeof statement;
    });

    const antwoord = await importeer(zip);

    expect(antwoord.status).toBe(201);
    expect(antwoord.body.uploaded).toHaveLength(1);
    expect(antwoord.body.errors).toEqual([{ filename: 'Ouverture - Hoorn 2.pdf', error: 'schijf vol' }]);

    const stukken = stukkenVan(vereniging.id);
    expect(stukken).toHaveLength(1);
    expect(nieuweBestanden()).toEqual([stukken[0].file_path]);
  });

  describe('grenzen aan de uitgepakte grootte', () => {
    /** Een pdf-kop gevolgd door nullen: pakt samen tot bijna niets. */
    const opgeblazen = (grootte: number) => Buffer.concat([Buffer.from('%PDF-1.1\n'), Buffer.alloc(grootte)]);

    /** Overschrijf de opgegeven uitgepakte grootte in alle koppen van de zip. */
    function zetOpgegevenGrootte(bytes: Buffer, grootte: number): Buffer {
      for (let i = 0; i + 4 <= bytes.length; i++) {
        const handtekening = bytes.readUInt32LE(i);
        if (handtekening === 0x04034b50) bytes.writeUInt32LE(grootte, i + 22);
        if (handtekening === 0x02014b50) bytes.writeUInt32LE(grootte, i + 24);
      }
      return bytes;
    }

    const importeerBytes = (bytes: Buffer) =>
      request(app)
        .post('/api/music-pieces/upload-zip')
        .set('Authorization', `Bearer ${beheerderToken}`)
        .attach('file', bytes, 'partijen.zip');

    it('weigert een kleine zip die uitgepakt groter is dan de grens per bestand', async () => {
      const zip = new AdmZip();
      zip.addFile('Mars der Medici - Trompet 1.pdf', pdf('mars'));
      zip.addFile('Opgeblazen - Trompet 2.pdf', opgeblazen(ZIP_MAX_PER_BESTAND + 1));
      const bytes = zip.toBuffer();
      expect(bytes.length).toBeLessThan(1024 * 1024);

      const antwoord = await importeerBytes(bytes);

      expect(antwoord.status).toBe(413);
      expect(stukkenVan(vereniging.id)).toEqual([]);
      expect(nieuweBestanden()).toEqual([]);
    });

    it('weigert een zip waarvan de opgegeven groottes samen boven de totale grens komen', async () => {
      const zip = new AdmZip();
      const aantal = Math.floor(ZIP_MAX_TOTAAL / ZIP_MAX_PER_BESTAND) + 1;
      for (let i = 0; i < aantal; i++) zip.addFile(`Stuk ${i} - Trompet 1.pdf`, pdf(`stuk ${i}`));
      const bytes = zetOpgegevenGrootte(zip.toBuffer(), ZIP_MAX_PER_BESTAND);

      const antwoord = await importeerBytes(bytes);

      expect(antwoord.status).toBe(413);
      expect(nieuweBestanden()).toEqual([]);
    });

    it('stopt bij de grens ook als de kop van de zip over de grootte liegt', async () => {
      const zip = new AdmZip();
      zip.addFile('Mars der Medici - Trompet 1.pdf', pdf('mars'));
      zip.addFile('Opgeblazen - Trompet 2.pdf', opgeblazen(ZIP_MAX_PER_BESTAND + 1));
      // De kop zegt dat elk bestand een kilobyte is; de controle vooraf gaat
      // dus goed en pas het uitpakken zelf kan de grens bewaken.
      const bytes = zetOpgegevenGrootte(zip.toBuffer(), 1024);

      const antwoord = await importeerBytes(bytes);

      expect(antwoord.status).toBe(413);
      expect(stukkenVan(vereniging.id)).toEqual([]);
      expect(nieuweBestanden()).toEqual([]);
    });
  });
});
