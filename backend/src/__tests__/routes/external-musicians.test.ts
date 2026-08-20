/**
 * Externe muzikanten: oud-leden, invallers en gastspelers die het orkest
 * erbij vraagt.
 *
 * Dit is een adresboek van mensen die géén lid zijn: naam, e-mailadres,
 * telefoonnummer en een beoordeling. Dat maakt de verenigingsgrens hier
 * zwaarder dan gewoonlijk - die gegevens horen bij één vereniging en nergens
 * anders. Daarnaast gaat het over de koppeling met instrumenten, want daarop
 * wordt gezocht als er zaterdag een trompettist mist.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import externalMusiciansRoutes from '../../routes/external-musicians';
import { errorHandler } from '../../middleware/errorHandler';
import {
  createTestAssociation,
  createTestEnvironment,
  createTestInstrument,
  createTestUser,
  generateTestToken,
  TestAssociation,
  TestInstrument,
  TestUser,
} from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api/external-musicians', externalMusiciansRoutes);
app.use(errorHandler);

describe('externe muzikanten', () => {
  let vereniging: TestAssociation;
  let beheerderToken: string;
  let lid: TestUser;
  let lidToken: string;
  let trompet: TestInstrument;
  let hoorn: TestInstrument;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    beheerderToken = omgeving.adminToken;
    lid = omgeving.memberUser;
    lidToken = omgeving.memberToken;
    trompet = createTestInstrument({ name: `Trompet-${uuidv4().slice(0, 8)}` });
    hoorn = createTestInstrument({ name: `Hoorn-${uuidv4().slice(0, 8)}` });
  });

  type Methode = 'get' | 'post' | 'put' | 'delete';
  const als = (token: string, methode: Methode, pad: string) =>
    request(app)[methode](`/api/external-musicians${pad}`).set('Authorization', `Bearer ${token}`);
  const alsBeheerder = (methode: Methode, pad: string) => als(beheerderToken, methode, pad);
  const alsLid = (methode: Methode, pad: string) => als(lidToken, methode, pad);

  const sanne = {
    firstName: 'Sanne',
    lastName: 'de Vries',
    email: 'sanne@example.nl',
    phone: '0612345678',
    musicianType: 'substitute' as const,
  };

  async function maakMuzikant(overrides: Record<string, unknown> = {}): Promise<string> {
    const antwoord = await alsBeheerder('post', '/').send({ ...sanne, ...overrides });
    expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);
    return antwoord.body.id;
  }

  /** Een muzikant van een andere vereniging, rechtstreeks in de database. */
  function vreemdeMuzikant(associationId: string): string {
    const id = uuidv4();
    db.prepare(
      `INSERT INTO external_musicians (id, association_id, first_name, last_name, email, musician_type)
       VALUES (?, ?, 'Buur', 'Man', 'buur@example.nl', 'guest')`,
    ).run(id, associationId);
    return id;
  }

  describe('toevoegen', () => {
    it('voegt een muzikant toe', async () => {
      const id = await maakMuzikant();

      const antwoord = await alsLid('get', `/${id}`);
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      expect(antwoord.body).toMatchObject({
        firstName: 'Sanne',
        lastName: 'de Vries',
        email: 'sanne@example.nl',
        musicianType: 'substitute',
        isActive: true,
        totalPerformances: 0,
      });
    });

    it('voegt meteen instrumenten toe', async () => {
      const id = await maakMuzikant({
        instruments: [
          { instrumentId: trompet.id, skillLevel: 'professional', isPrimary: true },
          { instrumentId: hoorn.id, skillLevel: 'intermediate' },
        ],
      });

      const antwoord = await alsLid('get', `/${id}`);
      expect(antwoord.body.instruments).toHaveLength(2);
      expect(antwoord.body.instruments[0]).toMatchObject({
        instrumentId: trompet.id,
        skillLevel: 'professional',
        isPrimary: true,
      });
    });

    it('weigert een muzikant zonder naam', async () => {
      expect((await alsBeheerder('post', '/').send({ ...sanne, firstName: '' })).status).toBe(400);
      expect((await alsBeheerder('post', '/').send({ ...sanne, lastName: '' })).status).toBe(400);
    });

    it('weigert een ongeldig e-mailadres', async () => {
      expect((await alsBeheerder('post', '/').send({ ...sanne, email: 'geen adres' })).status).toBe(400);
    });

    it('weigert een soort muzikant die niet bestaat', async () => {
      expect((await alsBeheerder('post', '/').send({ ...sanne, musicianType: 'dirigent' })).status).toBe(400);
    });

    it('weigert een beoordeling buiten één tot vijf', async () => {
      expect((await alsBeheerder('post', '/').send({ ...sanne, rating: 0 })).status).toBe(400);
      expect((await alsBeheerder('post', '/').send({ ...sanne, rating: 6 })).status).toBe(400);
    });

    it('weigert een vaardigheidsniveau dat niet bestaat', async () => {
      const antwoord = await alsBeheerder('post', '/').send({
        ...sanne,
        instruments: [{ instrumentId: trompet.id, skillLevel: 'redelijk' }],
      });
      expect(antwoord.status).toBe(400);
    });

    it('houdt een gewoon lid van het toevoegen af', async () => {
      expect((await alsLid('post', '/').send(sanne)).status).toBe(403);
    });
  });

  describe('overzicht en zoeken', () => {
    it('begint met een lege lijst', async () => {
      const antwoord = await alsLid('get', '/');
      expect(antwoord.status).toBe(200);
      expect(antwoord.body).toEqual([]);
    });

    it('noemt de instrumenten in het overzicht', async () => {
      await maakMuzikant({ instruments: [{ instrumentId: trompet.id, isPrimary: true }] });

      const antwoord = await alsLid('get', '/');
      expect(antwoord.body[0].instrumentNames).toContain(trompet.name);
    });

    it('filtert op soort muzikant', async () => {
      await maakMuzikant();
      await maakMuzikant({ firstName: 'Piet', musicianType: 'alumni' });

      const antwoord = await alsLid('get', '/?type=alumni');
      expect(antwoord.body).toHaveLength(1);
      expect(antwoord.body[0].firstName).toBe('Piet');
    });

    it('filtert op instrument', async () => {
      await maakMuzikant({ instruments: [{ instrumentId: trompet.id }] });
      await maakMuzikant({ firstName: 'Piet', instruments: [{ instrumentId: hoorn.id }] });

      const antwoord = await alsLid('get', `/?instrumentId=${hoorn.id}`);
      expect(antwoord.body).toHaveLength(1);
      expect(antwoord.body[0].firstName).toBe('Piet');
    });

    it('filtert op actief', async () => {
      const id = await maakMuzikant();
      await maakMuzikant({ firstName: 'Piet' });
      await alsBeheerder('delete', `/${id}`);

      expect((await alsLid('get', '/?isActive=false')).body).toHaveLength(1);
      expect((await alsLid('get', '/?isActive=true')).body).toHaveLength(1);
    });

    it('zoekt op naam en op e-mailadres', async () => {
      await maakMuzikant();
      await maakMuzikant({ firstName: 'Piet', lastName: 'Jansen', email: 'piet@example.nl' });

      expect((await alsLid('get', '/?search=Jansen')).body).toHaveLength(1);
      expect((await alsLid('get', '/?search=sanne@')).body).toHaveLength(1);
    });

    it('zoekt ongeacht hoofdletters', async () => {
      await maakMuzikant();
      expect((await alsLid('get', '/?search=SANNE')).body).toHaveLength(1);
    });

    it('toont geen muzikant van een andere vereniging', async () => {
      await maakMuzikant();
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      vreemdeMuzikant(andere.id);

      const antwoord = await alsLid('get', '/');
      expect(antwoord.body).toHaveLength(1);
      expect(antwoord.body[0].firstName).toBe('Sanne');
    });

    it('geeft 404 voor een muzikant van een andere vereniging', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      expect((await alsLid('get', `/${vreemdeMuzikant(andere.id)}`)).status).toBe(404);
    });
  });

  describe('zoeken op instrument', () => {
    it('vraagt om een instrument', async () => {
      expect((await alsLid('get', '/search')).status).toBe(400);
    });

    it('vindt de muzikanten die dat instrument spelen', async () => {
      await maakMuzikant({ instruments: [{ instrumentId: trompet.id, skillLevel: 'professional', isPrimary: true }] });
      await maakMuzikant({ firstName: 'Piet', instruments: [{ instrumentId: hoorn.id }] });

      const antwoord = await alsLid('get', `/search?instrument=${trompet.id}`);
      expect(antwoord.status).toBe(200);
      expect(antwoord.body).toHaveLength(1);
      expect(antwoord.body[0]).toMatchObject({
        firstName: 'Sanne',
        skillLevel: 'professional',
        isPrimary: true,
        instrumentName: trompet.name,
      });
    });

    it('filtert op vaardigheidsniveau', async () => {
      await maakMuzikant({ instruments: [{ instrumentId: trompet.id, skillLevel: 'beginner' }] });
      await maakMuzikant({
        firstName: 'Piet',
        instruments: [{ instrumentId: trompet.id, skillLevel: 'professional' }],
      });

      const antwoord = await alsLid('get', `/search?instrument=${trompet.id}&skillLevel=professional`);
      expect(antwoord.body).toHaveLength(1);
      expect(antwoord.body[0].firstName).toBe('Piet');
    });

    it('laat desgevraagd de niet-actieve muzikanten weg', async () => {
      const id = await maakMuzikant({ instruments: [{ instrumentId: trompet.id }] });
      await alsBeheerder('delete', `/${id}`);

      expect((await alsLid('get', `/search?instrument=${trompet.id}`)).body).toHaveLength(1);
      expect((await alsLid('get', `/search?instrument=${trompet.id}&activeOnly=true`)).body).toEqual([]);
    });

    it('vindt niets van een andere vereniging', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const vreemd = vreemdeMuzikant(andere.id);
      db.prepare(
        'INSERT INTO external_musician_instruments (id, external_musician_id, instrument_id) VALUES (?, ?, ?)',
      ).run(uuidv4(), vreemd, trompet.id);

      expect((await alsLid('get', `/search?instrument=${trompet.id}`)).body).toEqual([]);
    });
  });

  describe('bijwerken', () => {
    it('werkt een enkel veld bij en laat de rest staan', async () => {
      const id = await maakMuzikant();

      const antwoord = await alsBeheerder('put', `/${id}`).send({ phone: '0698765432' });
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);

      const na = await alsLid('get', `/${id}`);
      expect(na.body).toMatchObject({ phone: '0698765432', firstName: 'Sanne', email: 'sanne@example.nl' });
    });

    it('legt een beoordeling vast', async () => {
      const id = await maakMuzikant();
      await alsBeheerder('put', `/${id}`).send({ rating: 5 });

      expect((await alsLid('get', `/${id}`)).body.rating).toBe(5);
    });

    it('vervangt de instrumenten wanneer die worden meegestuurd', async () => {
      const id = await maakMuzikant({ instruments: [{ instrumentId: trompet.id }] });

      await alsBeheerder('put', `/${id}`).send({
        instruments: [{ instrumentId: hoorn.id, skillLevel: 'advanced', isPrimary: true }],
      });

      const na = await alsLid('get', `/${id}`);
      expect(na.body.instruments).toHaveLength(1);
      expect(na.body.instruments[0]).toMatchObject({ instrumentId: hoorn.id, skillLevel: 'advanced' });
    });

    it('laat de instrumenten staan als ze niet worden meegestuurd', async () => {
      const id = await maakMuzikant({ instruments: [{ instrumentId: trompet.id }] });

      await alsBeheerder('put', `/${id}`).send({ phone: '0600000000' });

      expect((await alsLid('get', `/${id}`)).body.instruments).toHaveLength(1);
    });

    it('haalt alle instrumenten weg bij een lege lijst', async () => {
      const id = await maakMuzikant({ instruments: [{ instrumentId: trompet.id }] });

      await alsBeheerder('put', `/${id}`).send({ instruments: [] });

      expect((await alsLid('get', `/${id}`)).body.instruments).toEqual([]);
    });

    it('werkt geen muzikant van een andere vereniging bij', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const vreemd = vreemdeMuzikant(andere.id);

      expect((await alsBeheerder('put', `/${vreemd}`).send({ firstName: 'Gekaapt' })).status).toBe(404);
      const rij = db.prepare('SELECT first_name FROM external_musicians WHERE id = ?').get(vreemd) as {
        first_name: string;
      };
      expect(rij.first_name).toBe('Buur');
    });

    it('houdt een gewoon lid van het bijwerken af', async () => {
      const id = await maakMuzikant();
      expect((await alsLid('put', `/${id}`).send({ phone: '0600000000' })).status).toBe(403);
    });
  });

  describe('op non-actief zetten', () => {
    it('zet de muzikant op non-actief zonder de rij weg te gooien', async () => {
      const id = await maakMuzikant();

      expect((await alsBeheerder('delete', `/${id}`)).status).toBe(200);
      expect((await alsLid('get', `/${id}`)).body.isActive).toBe(false);
      expect(db.prepare('SELECT id FROM external_musicians WHERE id = ?').get(id)).toBeDefined();
    });

    it('zet geen muzikant van een andere vereniging op non-actief', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      expect((await alsBeheerder('delete', `/${vreemdeMuzikant(andere.id)}`)).status).toBe(404);
    });

    it('laat dat alleen aan het bestuur of de muziekcommissie over', async () => {
      const id = await maakMuzikant();
      expect((await alsLid('delete', `/${id}`)).status).toBe(403);
    });
  });

  describe('instrumenten los toevoegen en weghalen', () => {
    it('voegt een instrument toe', async () => {
      const id = await maakMuzikant();

      const antwoord = await alsBeheerder('post', `/${id}/instruments`).send({
        instrumentId: trompet.id,
        skillLevel: 'advanced',
        isPrimary: true,
      });
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);

      const na = await alsLid('get', `/${id}`);
      expect(na.body.instruments[0]).toMatchObject({ instrumentId: trompet.id, skillLevel: 'advanced' });
    });

    it('voegt hetzelfde instrument niet twee keer toe', async () => {
      const id = await maakMuzikant({ instruments: [{ instrumentId: trompet.id }] });

      const antwoord = await alsBeheerder('post', `/${id}/instruments`).send({ instrumentId: trompet.id });
      expect(antwoord.status).toBe(409);
    });

    it('voegt geen instrument toe aan een muzikant van een andere vereniging', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const antwoord = await alsBeheerder('post', `/${vreemdeMuzikant(andere.id)}/instruments`).send({
        instrumentId: trompet.id,
      });
      expect(antwoord.status).toBe(404);
    });

    it('haalt een instrument weg', async () => {
      const id = await maakMuzikant({ instruments: [{ instrumentId: trompet.id }, { instrumentId: hoorn.id }] });

      expect((await alsBeheerder('delete', `/${id}/instruments/${trompet.id}`)).status).toBe(200);

      const na = await alsLid('get', `/${id}`);
      expect(na.body.instruments.map((i: { instrumentId: string }) => i.instrumentId)).toEqual([hoorn.id]);
    });

    it('geeft 404 voor een instrument dat de muzikant niet speelt', async () => {
      const id = await maakMuzikant();
      expect((await alsBeheerder('delete', `/${id}/instruments/${trompet.id}`)).status).toBe(404);
    });

    it('haalt geen instrument weg bij een muzikant van een andere vereniging', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const vreemd = vreemdeMuzikant(andere.id);
      db.prepare(
        'INSERT INTO external_musician_instruments (id, external_musician_id, instrument_id) VALUES (?, ?, ?)',
      ).run(uuidv4(), vreemd, trompet.id);

      const andereBeheerder = createTestUser(vereniging.id, { email: `ext-${uuidv4()}@test.nl`, role: 'admin' });
      const antwoord = await request(app)
        .delete(`/api/external-musicians/${vreemd}/instruments/${trompet.id}`)
        .set('Authorization', `Bearer ${generateTestToken(andereBeheerder)}`);

      expect(antwoord.status).toBe(404);
      const aantal = db
        .prepare('SELECT COUNT(*) AS n FROM external_musician_instruments WHERE external_musician_id = ?')
        .get(vreemd) as { n: number };
      expect(aantal.n).toBe(1);
    });
  });

  it('vraagt overal om een geldige aanmelding', async () => {
    expect(lid.id).toBeTruthy();
    expect((await request(app).get('/api/external-musicians')).status).toBe(401);
    expect((await request(app).post('/api/external-musicians').send(sanne)).status).toBe(401);
  });
});
