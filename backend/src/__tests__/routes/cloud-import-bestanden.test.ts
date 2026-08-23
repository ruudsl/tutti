/**
 * Wat er gebeurt met een bestand dat uit OneDrive of Google Drive komt.
 *
 * Het bestaande cloud-import.test.ts dekt de verenigingsgrens: de instellingen
 * en de muzieklijst. Wat daar niet in staat is de weg die een bestand zelf
 * aflegt - en dat is het grootste deel van dit bestand. De server haalt een
 * adres op dat uit de aanvraag komt, kijkt of het antwoord echt een pdf is,
 * zet het op schijf en leidt uit de bestandsnaam af om welk stuk en welk
 * instrument het gaat.
 *
 * Twee dingen zijn hier belangrijker dan het gelukte pad:
 *
 *  1. Welke adressen de server voor een aanvrager mag ophalen. Zonder die
 *     lijst is dit een open doorgeefluik naar elk adres dat de server kan
 *     bereiken, inclusief het eigen netwerk.
 *  2. Dat een mislukt bestand niet als gelukt wordt gemeld. De fout per
 *     bestand komt in `errors` terecht en de route antwoordt gewoon 201; wie
 *     alleen naar de statuscode kijkt ziet een stille storing niet.
 *
 * Er gaat geen enkel verzoek het netwerk op: `fetch` is vervangen.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import fs from 'fs';
import path from 'path';
import '../setup';
import db from '../../database/connection';
import cloudImportRoutes from '../../routes/cloud-import';
import { errorHandler } from '../../middleware/errorHandler';
import {
  createTestEnvironment,
  createTestAssociation,
  createTestInstrument,
  createTestOrchestra,
  createTestUser,
  generateTestToken,
  TestAssociation,
  TestUser,
} from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api/cloud-import', cloudImportRoutes);
app.use(errorHandler);

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '../../../uploads');

/** De eerste bytes waar isPdf op controleert. */
const PDF = Buffer.from('%PDF-1.7\nechte inhoud');
const GEEN_PDF = Buffer.from('<html>helemaal geen pdf</html>');

describe('een bestand uit de cloud binnenhalen', () => {
  let vereniging: TestAssociation;
  let beheerder: TestUser;
  let beheerderToken: string;
  let lidToken: string;
  let muziekcommissieToken: string;

  let andereVereniging: TestAssociation;
  let nep: ReturnType<typeof vi.fn>;
  /** Bestanden die de route op schijf heeft gezet, zodat ze na afloop weg kunnen. */
  let achtergelaten: string[];

  /** Laat elk opgehaald adres hetzelfde antwoord geven. */
  function serverGeeft(body: Buffer, opties: { status?: number; contentLength?: string | null } = {}) {
    const status = opties.status ?? 200;
    nep.mockImplementation(async () => ({
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : 'Fout',
      headers: { get: (naam: string) => (naam === 'content-length' ? (opties.contentLength ?? null) : null) },
      arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
    }));
  }

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    beheerder = omgeving.adminUser;
    beheerderToken = omgeving.adminToken;
    lidToken = omgeving.memberToken;
    muziekcommissieToken = omgeving.musicCommitteeToken;

    andereVereniging = createTestAssociation({ name: 'Andere vereniging' });

    achtergelaten = [];

    nep = vi.fn();
    serverGeeft(PDF);
    vi.stubGlobal('fetch', nep);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    // De route schrijft echte bestanden weg; die horen niet in de werkmap
    // achter te blijven.
    for (const bestand of db.prepare('SELECT file_path FROM music_pieces').all() as { file_path: string }[]) {
      try {
        fs.unlinkSync(path.join(UPLOAD_DIR, bestand.file_path));
      } catch {
        /* al weg */
      }
    }
    for (const pad of achtergelaten) {
      try {
        fs.unlinkSync(pad);
      } catch {
        /* al weg */
      }
    }
  });

  const onedrive = (token: string, body: Record<string, unknown>) =>
    request(app).post('/api/cloud-import/onedrive').set('Authorization', `Bearer ${token}`).send(body);

  const googleDrive = (token: string, body: Record<string, unknown>) =>
    request(app).post('/api/cloud-import/google-drive').set('Authorization', `Bearer ${token}`).send(body);

  const eenBestand = (naam: string, downloadUrl = 'https://graph.microsoft.com/v1.0/x/content') => ({
    files: [{ id: 'drive-id-1', name: naam, downloadUrl }],
    accessToken: 'ms-token',
  });

  /** De melding wordt los van het antwoord verstuurd; even wachten tot hij er is. */
  async function wachtOpMelding(userId: string, pogingen = 50): Promise<void> {
    for (let i = 0; i < pogingen; i++) {
      const rij = db.prepare('SELECT COUNT(*) as n FROM notifications WHERE user_id = ?').get(userId) as { n: number };
      if (rij.n > 0) return;
      await new Promise((r) => setTimeout(r, 10));
    }
  }

  const stukken = () =>
    db.prepare('SELECT * FROM music_pieces ORDER BY title').all() as Record<string, string | null>[];

  describe('wat de aanvraag moet bevatten', () => {
    it('vraagt om een lijst met bestanden', async () => {
      expect((await onedrive(beheerderToken, { accessToken: 'x' })).status).toBe(400);
    });

    it('weigert een lege lijst', async () => {
      expect((await onedrive(beheerderToken, { files: [], accessToken: 'x' })).status).toBe(400);
    });

    it('weigert iets dat geen lijst is', async () => {
      // `files` komt uit de body en wordt met .map() bewerkt; een tekst of een
      // object hoort hier af te ketsen en niet verderop om te vallen.
      expect((await onedrive(beheerderToken, { files: 'een.pdf', accessToken: 'x' })).status).toBe(400);
      expect((await onedrive(beheerderToken, { files: { name: 'een.pdf' }, accessToken: 'x' })).status).toBe(400);
    });

    it('vraagt om een toegangstoken voor Microsoft', async () => {
      const antwoord = await onedrive(beheerderToken, { files: [{ id: 'a', name: 'b.pdf' }] });
      expect(antwoord.status).toBe(400);
      expect(antwoord.body.error).toMatch(/Microsoft/);
    });

    it('vraagt om een toegangstoken voor Google', async () => {
      const antwoord = await googleDrive(beheerderToken, { files: [{ id: 'a', name: 'b.pdf' }] });
      expect(antwoord.status).toBe(400);
      expect(antwoord.body.error).toMatch(/Google/);
    });

    it('haalt niets op als de aanvraag al onvolledig is', async () => {
      await onedrive(beheerderToken, { files: [], accessToken: 'x' });
      expect(nep).not.toHaveBeenCalled();
    });
  });

  describe('het stuk dat eruit komt', () => {
    it('slaat het op bij de eigen vereniging', async () => {
      const antwoord = await onedrive(beheerderToken, eenBestand('Mars.pdf'));
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);

      const [stuk] = stukken();
      expect(stuk.association_id).toBe(vereniging.id);
      expect(stuk.original_filename).toBe('Mars.pdf');
    });

    it('leest titel, arrangeur, instrument, stemming, groep en sleutel uit de naam', async () => {
      await onedrive(beheerderToken, eenBestand('Ouverture_Jansen_Trompet_Bb_1_sol.pdf'));

      const [stuk] = stukken();
      expect(stuk.title).toBe('Ouverture');
      expect(stuk.arranger).toBe('Jansen');
      expect(stuk.tuning).toBe('Bb');
      expect(stuk.group_number).toBe('1');
      expect(stuk.clef).toBe('sol');
    });

    it('gebruikt de hele bestandsnaam als titel wanneer er geen streepjes in staan', async () => {
      await onedrive(beheerderToken, eenBestand('Zonder scheiding.pdf'));
      expect(stukken()[0].title).toBe('Zonder scheiding');
    });

    it('herkent een instrument op naam, ongeacht hoofdletters', async () => {
      const trompet = createTestInstrument({ name: 'Trompet' });
      const antwoord = await onedrive(beheerderToken, eenBestand('Mars_Jansen_TROMPET.pdf'));

      expect(antwoord.body.uploaded[0].instrumentFound).toBe(true);
      expect(stukken()[0].instrument_id).toBe(trompet.id);
    });

    it('herkent een instrument ook via een alias', async () => {
      const trompet = createTestInstrument({ name: 'Trompet' });
      db.prepare('INSERT INTO instrument_aliases (id, instrument_id, alias) VALUES (?, ?, ?)').run(
        'alias-1',
        trompet.id,
        'cornet',
      );

      const antwoord = await onedrive(beheerderToken, eenBestand('Mars_Jansen_Cornet.pdf'));
      expect(antwoord.body.uploaded[0].instrumentId).toBe(trompet.id);
    });

    it('laat het instrument leeg als het onbekend is, maar importeert wel', async () => {
      const antwoord = await onedrive(beheerderToken, eenBestand('Mars_Jansen_Bestaatniet.pdf'));

      expect(antwoord.status).toBe(201);
      expect(antwoord.body.uploaded[0].instrumentFound).toBe(false);
      expect(stukken()[0].instrument_id).toBeNull();
    });

    it('noteert wie het stuk heeft geimporteerd', async () => {
      const antwoord = await onedrive(beheerderToken, eenBestand('Mars.pdf'));
      expect(antwoord.status).toBe(201);
      expect(stukken()[0].uploaded_by).toBe(beheerder.id);
    });
  });

  describe('welke adressen de server mag ophalen', () => {
    /** Importeer een bestand met dit downloadadres en geef de foutmelding terug. */
    async function foutBij(url: string): Promise<{ status: number; fout: string | undefined }> {
      const antwoord = await onedrive(beheerderToken, eenBestand('Mars.pdf', url));
      return { status: antwoord.status, fout: antwoord.body.errors?.[0]?.error };
    }

    it('accepteert de hosts van Microsoft en Google', async () => {
      for (const url of [
        'https://graph.microsoft.com/v1.0/x/content',
        'https://onedrive.live.com/download?x=1',
        'https://harmonie.sharepoint.com/x.pdf',
        'https://abc.1drv.com/x.pdf',
        'https://www.googleapis.com/drive/v3/files/x?alt=media',
        'https://drive.google.com/uc?id=x',
      ]) {
        const { status, fout } = await foutBij(url);
        expect(status, url).toBe(201);
        expect(fout, url).toBeUndefined();
      }
    });

    it('weigert een willekeurige andere host', async () => {
      const { fout } = await foutBij('https://kwaadaardig.example/mars.pdf');
      expect(fout).toMatch(/host is not allowed/);
    });

    it('weigert een adres binnen het eigen netwerk', async () => {
      for (const url of ['https://127.0.0.1/admin', 'https://169.254.169.254/latest/meta-data/', 'https://localhost/']) {
        expect((await foutBij(url)).fout, url).toMatch(/host is not allowed/);
      }
    });

    it('weigert een host die de toegestane naam alleen als voorvoegsel draagt', async () => {
      // graph.microsoft.com.kwaadaardig.example is een adres van de aanvaller;
      // de lijst mag daar niet in trappen.
      expect((await foutBij('https://graph.microsoft.com.kwaadaardig.example/x')).fout).toMatch(/host is not allowed/);
      expect((await foutBij('https://nietsharepoint.com/x')).fout).toMatch(/host is not allowed/);
    });

    it('weigert een adres zonder https', async () => {
      expect((await foutBij('http://graph.microsoft.com/x')).fout).toMatch(/HTTPS/);
      expect((await foutBij('file:///etc/passwd')).fout).toMatch(/HTTPS/);
    });

    it('weigert een adres met inloggegevens erin', async () => {
      expect((await foutBij('https://gebruiker:geheim@graph.microsoft.com/x')).fout).toMatch(/credentials/);
    });

    it('weigert iets dat helemaal geen adres is', async () => {
      expect((await foutBij('dit is geen adres')).fout).toMatch(/Invalid download URL/);
    });

    it('haalt een geweigerd adres niet op', async () => {
      await foutBij('https://kwaadaardig.example/mars.pdf');
      expect(nep).not.toHaveBeenCalled();
    });

    it('laat geen stuk achter voor een geweigerd adres', async () => {
      await foutBij('https://kwaadaardig.example/mars.pdf');
      expect(stukken()).toHaveLength(0);
    });
  });

  describe('het toegangstoken', () => {
    it('gaat mee naar een adres dat de route zelf opbouwt', async () => {
      await onedrive(beheerderToken, { files: [{ id: 'item-42', name: 'Mars.pdf' }], accessToken: 'ms-token' });

      expect(String(nep.mock.calls[0][0])).toContain('item-42');
      expect(nep.mock.calls[0][1].headers.Authorization).toBe('Bearer ms-token');
    });

    it('gaat niet mee naar een adres dat de aanvrager zelf aanlevert', async () => {
      // De aanvrager geeft hier zelf een downloadadres op. Dat adres komt uit
      // de body en de route stuurt er bewust geen token naartoe.
      await onedrive(beheerderToken, eenBestand('Mars.pdf'));
      expect(nep.mock.calls[0][1].headers.Authorization).toBeUndefined();
    });

    it('gaat bij Google Drive wel mee, want de route bouwt daar altijd zelf het adres', async () => {
      await googleDrive(beheerderToken, { files: [{ id: 'g-7', name: 'Mars.pdf' }], accessToken: 'g-token' });

      const adres = new URL(String(nep.mock.calls[0][0]));
      expect(adres.hostname).toBe('www.googleapis.com');
      expect(adres.pathname).toContain('g-7');
      expect(nep.mock.calls[0][1].headers.Authorization).toBe('Bearer g-token');
    });

    it('negeert een downloadadres dat bij Google Drive wordt meegestuurd', async () => {
      await googleDrive(beheerderToken, {
        files: [{ id: 'g-7', name: 'Mars.pdf', downloadUrl: 'https://kwaadaardig.example/x' }],
        accessToken: 'g-token',
      });
      expect(new URL(String(nep.mock.calls[0][0])).hostname).toBe('www.googleapis.com');
    });

    it('codeert een bestands-id zodat het het adres niet kan omzetten', async () => {
      await googleDrive(beheerderToken, {
        files: [{ id: '../../../v1/kwaad?x=', name: 'Mars.pdf' }],
        accessToken: 'g-token',
      });

      const adres = new URL(String(nep.mock.calls[0][0]));
      expect(adres.hostname).toBe('www.googleapis.com');
      expect(adres.pathname).toBe('/drive/v3/files/..%2F..%2F..%2Fv1%2Fkwaad%3Fx%3D');
    });
  });

  describe('een antwoord dat niet deugt', () => {
    it('weigert iets dat geen pdf is', async () => {
      serverGeeft(GEEN_PDF);
      const antwoord = await onedrive(beheerderToken, eenBestand('Mars.pdf'));

      expect(antwoord.status).toBe(201);
      expect(antwoord.body.errors[0].error).toMatch(/not a valid PDF/);
      expect(stukken()).toHaveLength(0);
    });

    it('meldt een mislukte download met de statuscode erbij', async () => {
      serverGeeft(PDF, { status: 403 });
      const antwoord = await onedrive(beheerderToken, eenBestand('Mars.pdf'));

      expect(antwoord.body.errors[0].error).toMatch(/Download failed: 403/);
      expect(stukken()).toHaveLength(0);
    });

    it('weigert een bestand dat volgens de kop te groot is', async () => {
      serverGeeft(PDF, { contentLength: String(60 * 1024 * 1024) });
      const antwoord = await onedrive(beheerderToken, eenBestand('Mars.pdf'));

      expect(antwoord.body.errors[0].error).toMatch(/exceeds maximum size/);
      expect(nep).toHaveBeenCalledOnce();
      expect(stukken()).toHaveLength(0);
    });

    it('meldt de naam van het bestand dat misging', async () => {
      serverGeeft(GEEN_PDF);
      const antwoord = await onedrive(beheerderToken, eenBestand('Concertmars.pdf'));
      expect(antwoord.body.errors[0].filename).toBe('Concertmars.pdf');
    });

    it('zegt niet dat het gelukt is als er niets geimporteerd is', async () => {
      // De route antwoordt 201 ook wanneer elk bestand strandde. Het aantal in
      // het bericht is dan het enige dat de storing verraadt, dus dat moet
      // kloppen.
      serverGeeft(GEEN_PDF);
      const antwoord = await onedrive(beheerderToken, eenBestand('Mars.pdf'));

      expect(antwoord.body.uploaded).toHaveLength(0);
      expect(antwoord.body.message).toContain('0 bestanden');
    });

    it('houdt de goede bestanden over als er ook een fout bij zit', async () => {
      let beurt = 0;
      nep.mockImplementation(async () => {
        const body = beurt++ === 0 ? PDF : GEEN_PDF;
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: { get: () => null },
          arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
        };
      });

      const antwoord = await onedrive(beheerderToken, {
        files: [
          { id: '1', name: 'Goed.pdf', downloadUrl: 'https://graph.microsoft.com/a' },
          { id: '2', name: 'Fout.pdf', downloadUrl: 'https://graph.microsoft.com/b' },
        ],
        accessToken: 'ms-token',
      });

      expect(antwoord.body.uploaded).toHaveLength(1);
      expect(antwoord.body.uploaded[0].filename).toBe('Goed.pdf');
      expect(antwoord.body.errors).toHaveLength(1);
      expect(stukken()).toHaveLength(1);
    });
  });

  describe('de muzieklijst', () => {
    function maakLijst(associationId: string, naam: string): string {
      const orkest = createTestOrchestra(associationId, { name: `Orkest ${naam}` });
      const id = `lijst-${naam}`;
      db.prepare('INSERT INTO music_lists (id, name, orchestra_id) VALUES (?, ?, ?)').run(id, naam, orkest.id);
      return id;
    }

    it('zet het stuk op de lijst van de eigen vereniging', async () => {
      const lijst = maakLijst(vereniging.id, 'ons');
      const antwoord = await onedrive(beheerderToken, { ...eenBestand('Mars.pdf'), listId: lijst });

      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);
      const gekoppeld = db
        .prepare('SELECT music_piece_id FROM music_list_pieces WHERE music_list_id = ?')
        .all(lijst) as { music_piece_id: string }[];
      expect(gekoppeld).toHaveLength(1);
      expect(gekoppeld[0].music_piece_id).toBe(antwoord.body.uploaded[0].id);
    });

    it('importeert ook zonder lijst', async () => {
      const antwoord = await onedrive(beheerderToken, eenBestand('Mars.pdf'));
      expect(antwoord.status).toBe(201);
      expect(db.prepare('SELECT COUNT(*) as n FROM music_list_pieces').get()).toEqual({ n: 0 });
    });

    it('haalt niets op wanneer de lijst niet van deze vereniging is', async () => {
      // De controle staat voor de downloads; anders zou de server nog wel het
      // netwerk op gaan voor een aanvraag die toch afketst.
      const hunLijst = maakLijst(andereVereniging.id, 'hun');
      const antwoord = await onedrive(beheerderToken, { ...eenBestand('Mars.pdf'), listId: hunLijst });

      expect(antwoord.status).toBe(404);
      expect(nep).not.toHaveBeenCalled();
    });

    it('meldt het nieuwe stuk bij de orkesten van de eigen vereniging', async () => {
      // Zonder lijst gaat de melding naar alle orkesten van de vereniging van
      // de aanvrager. Die van een andere vereniging horen er niets over.
      const onsOrkest = createTestOrchestra(vereniging.id, { name: 'Ons orkest' });
      const hunOrkest = createTestOrchestra(andereVereniging.id, { name: 'Hun orkest' });
      const onsLid = createTestUser(vereniging.id, { email: 'speler@ons.nl' });
      const hunLid = createTestUser(andereVereniging.id, { email: 'speler@hun.nl' });
      db.prepare('INSERT INTO user_orchestras (user_id, orchestra_id) VALUES (?, ?)').run(onsLid.id, onsOrkest.id);
      db.prepare('INSERT INTO user_orchestras (user_id, orchestra_id) VALUES (?, ?)').run(hunLid.id, hunOrkest.id);

      expect((await onedrive(beheerderToken, eenBestand('Mars.pdf'))).status).toBe(201);
      await wachtOpMelding(onsLid.id);

      const ontvangers = (
        db.prepare("SELECT user_id FROM notifications WHERE type = 'new_music'").all() as { user_id: string }[]
      ).map((r) => r.user_id);
      expect(ontvangers).toContain(onsLid.id);
      expect(ontvangers).not.toContain(hunLid.id);
    });

    it('vraagt om een lijst met bestanden, ook bij Google Drive', async () => {
      expect((await googleDrive(beheerderToken, { files: [], accessToken: 'g' })).status).toBe(400);
    });

    it('geldt ook voor Google Drive', async () => {
      const hunLijst = maakLijst(andereVereniging.id, 'hun');
      const antwoord = await googleDrive(beheerderToken, {
        files: [{ id: 'g-1', name: 'Mars.pdf' }],
        accessToken: 'g-token',
        listId: hunLijst,
      });
      expect(antwoord.status).toBe(404);
    });
  });

  describe('wie mag importeren', () => {
    it('laat de muziekcommissie erbij', async () => {
      expect((await onedrive(muziekcommissieToken, eenBestand('Mars.pdf'))).status).toBe(201);
      expect((await googleDrive(muziekcommissieToken, eenBestand('Mars2.pdf'))).status).toBe(201);
    });

    it('houdt een gewoon lid tegen', async () => {
      expect((await onedrive(lidToken, eenBestand('Mars.pdf'))).status).toBe(403);
      expect((await googleDrive(lidToken, eenBestand('Mars.pdf'))).status).toBe(403);
    });

    it('haalt voor een gewoon lid niets op', async () => {
      await onedrive(lidToken, eenBestand('Mars.pdf'));
      expect(nep).not.toHaveBeenCalled();
    });

    it('weigert een verzoek zonder token', async () => {
      expect((await request(app).post('/api/cloud-import/onedrive').send(eenBestand('Mars.pdf'))).status).toBe(401);
      expect((await request(app).post('/api/cloud-import/google-drive').send(eenBestand('Mars.pdf'))).status).toBe(401);
    });

    it('weigert een lid van een andere vereniging op dezelfde manier', async () => {
      const hunLid = createTestUser(andereVereniging.id, { email: 'lid@elders.nl' });
      expect((await onedrive(generateTestToken(hunLid), eenBestand('Mars.pdf'))).status).toBe(403);
    });
  });
});
