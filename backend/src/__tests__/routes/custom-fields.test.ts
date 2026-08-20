/**
 * Eigen velden: een vereniging kan zelf velden toevoegen aan leden,
 * concerten, instrumenten en zo meer.
 *
 * Het zwaartepunt ligt hier bij de zichtbaarheid. Een veld kan op admin_only
 * of self_only staan, en dan hoort de inhoud ook echt niet in het antwoord te
 * staan - niet leeg, maar helemaal weg. Daar gaan de meeste tests over, samen
 * met wie een veld mag bewerken.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import customFieldsRoutes from '../../routes/custom-fields';
import { errorHandler } from '../../middleware/errorHandler';
import {
  createTestAssociation,
  createTestEnvironment,
  createTestUser,
  generateTestToken,
  TestAssociation,
  TestUser,
} from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api/custom-fields', customFieldsRoutes);
app.use(errorHandler);

describe('eigen velden', () => {
  let vereniging: TestAssociation;
  let beheerderToken: string;
  let lid: TestUser;
  let lidToken: string;
  let commissieToken: string;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    beheerderToken = omgeving.adminToken;
    lid = omgeving.memberUser;
    lidToken = omgeving.memberToken;
    commissieToken = omgeving.musicCommitteeToken;
  });

  type Methode = 'get' | 'post' | 'patch' | 'delete';
  const als = (token: string, methode: Methode, pad: string) =>
    request(app)[methode](`/api/custom-fields${pad}`).set('Authorization', `Bearer ${token}`);
  const alsBeheerder = (methode: Methode, pad: string) => als(beheerderToken, methode, pad);
  const alsLid = (methode: Methode, pad: string) => als(lidToken, methode, pad);

  async function maakVeld(overrides: Record<string, unknown> = {}): Promise<string> {
    const antwoord = await alsBeheerder('post', '/definitions').send({
      entityType: 'user',
      fieldKey: 'lidnummer',
      fieldLabel: 'Lidnummer',
      fieldType: 'text',
      ...overrides,
    });
    expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);
    return antwoord.body.id;
  }

  async function zetWaarde(entityId: string, waarden: Record<string, unknown>, token = beheerderToken) {
    return als(token, 'post', '/values').send({ entityType: 'user', entityId, values: waarden });
  }

  describe('velddefinities', () => {
    it('begint met een lege lijst', async () => {
      const antwoord = await alsLid('get', '/definitions');
      expect(antwoord.status).toBe(200);
      expect(antwoord.body).toEqual([]);
    });

    it('maakt een veld aan', async () => {
      await maakVeld({ description: 'Nummer uit de ledenadministratie' });

      const antwoord = await alsLid('get', '/definitions');
      expect(antwoord.body).toHaveLength(1);
      expect(antwoord.body[0]).toMatchObject({
        entityType: 'user',
        fieldKey: 'lidnummer',
        fieldLabel: 'Lidnummer',
        fieldType: 'text',
        visibility: 'all',
        isRequired: false,
      });
    });

    it('bewaart de keuzelijst van een keuzeveld', async () => {
      await maakVeld({
        fieldKey: 'stemgroep',
        fieldLabel: 'Stemgroep',
        fieldType: 'select',
        fieldOptions: ['sopraan', 'alt', 'tenor', 'bas'],
      });

      const antwoord = await alsLid('get', '/definitions');
      expect(antwoord.body[0].fieldOptions).toEqual(['sopraan', 'alt', 'tenor', 'bas']);
    });

    it('weigert een sleutel met hoofdletters of spaties', async () => {
      for (const sleutel of ['Lidnummer', 'lid nummer', '1nummer', 'lid-nummer']) {
        const antwoord = await alsBeheerder('post', '/definitions').send({
          entityType: 'user',
          fieldKey: sleutel,
          fieldLabel: 'Iets',
          fieldType: 'text',
        });
        expect(antwoord.status, sleutel).toBe(400);
      }
    });

    it('weigert een soort entiteit die niet bestaat', async () => {
      const antwoord = await alsBeheerder('post', '/definitions').send({
        entityType: 'bestuur',
        fieldKey: 'iets',
        fieldLabel: 'Iets',
        fieldType: 'text',
      });
      expect(antwoord.status).toBe(400);
    });

    it('weigert een veldsoort die niet bestaat', async () => {
      const antwoord = await alsBeheerder('post', '/definitions').send({
        entityType: 'user',
        fieldKey: 'iets',
        fieldLabel: 'Iets',
        fieldType: 'kleurenkiezer',
      });
      expect(antwoord.status).toBe(400);
    });

    it('weigert twee velden met dezelfde sleutel', async () => {
      await maakVeld();

      const tweede = await alsBeheerder('post', '/definitions').send({
        entityType: 'user',
        fieldKey: 'lidnummer',
        fieldLabel: 'Nog een lidnummer',
        fieldType: 'text',
      });
      expect(tweede.status).toBe(409);
    });

    it('laat dezelfde sleutel wel toe bij een andere entiteit', async () => {
      await maakVeld();

      const antwoord = await alsBeheerder('post', '/definitions').send({
        entityType: 'concert',
        fieldKey: 'lidnummer',
        fieldLabel: 'Lidnummer',
        fieldType: 'text',
      });
      expect(antwoord.status).toBe(201);
    });

    it('houdt een gewoon lid van het aanmaken af', async () => {
      const antwoord = await alsLid('post', '/definitions').send({
        entityType: 'user',
        fieldKey: 'iets',
        fieldLabel: 'Iets',
        fieldType: 'text',
      });
      expect(antwoord.status).toBe(403);
    });

    it('filtert op entiteit', async () => {
      await maakVeld();
      await maakVeld({ entityType: 'concert', fieldKey: 'zaalhuur', fieldLabel: 'Zaalhuur' });

      const antwoord = await alsLid('get', '/definitions?entityType=concert');
      expect(antwoord.body).toHaveLength(1);
      expect(antwoord.body[0].fieldKey).toBe('zaalhuur');
    });

    it('toont geen veld van een andere vereniging', async () => {
      await maakVeld();
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      db.prepare(
        `INSERT INTO custom_field_definitions (id, association_id, entity_type, field_key, field_label, field_type)
         VALUES (?, ?, 'user', 'geheim', 'Geheim', 'text')`,
      ).run(uuidv4(), andere.id);

      const antwoord = await alsLid('get', '/definitions');
      expect(antwoord.body.map((d: { fieldKey: string }) => d.fieldKey)).toEqual(['lidnummer']);
    });

    it('werkt een veld bij', async () => {
      const id = await maakVeld();

      const antwoord = await alsBeheerder('patch', `/definitions/${id}`).send({
        fieldLabel: 'Verenigingsnummer',
        isRequired: true,
      });
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);

      const lijst = await alsLid('get', '/definitions');
      expect(lijst.body[0]).toMatchObject({ fieldLabel: 'Verenigingsnummer', isRequired: true, fieldKey: 'lidnummer' });
    });

    it('werkt geen veld van een andere vereniging bij', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const vreemd = uuidv4();
      db.prepare(
        `INSERT INTO custom_field_definitions (id, association_id, entity_type, field_key, field_label, field_type)
         VALUES (?, ?, 'user', 'geheim', 'Geheim', 'text')`,
      ).run(vreemd, andere.id);

      expect((await alsBeheerder('patch', `/definitions/${vreemd}`).send({ fieldLabel: 'Gekaapt' })).status).toBe(404);
    });

    it('markeert een veld als verwijderd zonder de rij weg te gooien', async () => {
      const id = await maakVeld();

      expect((await alsBeheerder('delete', `/definitions/${id}`)).status).toBe(200);
      expect((await alsLid('get', '/definitions')).body).toEqual([]);
      expect(db.prepare('SELECT id FROM custom_field_definitions WHERE id = ?').get(id)).toBeDefined();
    });

    it('verwijdert een veld niet twee keer', async () => {
      const id = await maakVeld();
      await alsBeheerder('delete', `/definitions/${id}`);
      expect((await alsBeheerder('delete', `/definitions/${id}`)).status).toBe(404);
    });

    it('geeft 400 voor een entiteit die niet bestaat bij het opvragen per soort', async () => {
      expect((await alsLid('get', '/definitions/bestuur')).status).toBe(400);
    });
  });

  describe('zichtbaarheid', () => {
    it('verbergt een admin_only veld voor een gewoon lid', async () => {
      await maakVeld({ fieldKey: 'notitie', fieldLabel: 'Interne notitie', visibility: 'admin_only' });

      const beheerder = await alsBeheerder('get', '/definitions/user');
      expect(beheerder.body.map((d: { fieldKey: string }) => d.fieldKey)).toEqual(['notitie']);

      const alsGewoonLid = await alsLid('get', '/definitions/user');
      expect(alsGewoonLid.body).toEqual([]);
    });

    it('toont een committee_plus veld aan de muziekcommissie maar niet aan een lid', async () => {
      await maakVeld({ fieldKey: 'partij', fieldLabel: 'Partij', visibility: 'committee_plus' });

      const commissie = await als(commissieToken, 'get', '/definitions/user');
      expect(commissie.body).toHaveLength(1);
      expect((await alsLid('get', '/definitions/user')).body).toEqual([]);
    });

    it('laat een admin_only waarde helemaal uit het antwoord', async () => {
      await maakVeld({ fieldKey: 'notitie', fieldLabel: 'Interne notitie', visibility: 'admin_only' });
      await zetWaarde(lid.id, { notitie: 'Loopt achter met contributie' });

      const beheerder = await alsBeheerder('get', `/values/user/${lid.id}`);
      expect(beheerder.body.values.notitie).toBe('Loopt achter met contributie');

      const eigenBlik = await alsLid('get', `/values/user/${lid.id}`);
      expect(eigenBlik.body.values).not.toHaveProperty('notitie');
      expect(JSON.stringify(eigenBlik.body)).not.toContain('contributie');
    });

    it('laat een self_only waarde alleen aan de eigenaar zien', async () => {
      await maakVeld({ fieldKey: 'dieet', fieldLabel: 'Dieetwensen', visibility: 'self_only' });
      await zetWaarde(lid.id, { dieet: 'notenallergie' });

      const eigenaar = await alsLid('get', `/values/user/${lid.id}`);
      expect(eigenaar.body.values.dieet).toBe('notenallergie');

      const anderLid = createTestUser(vereniging.id, { email: `ander-${uuidv4()}@test.nl` });
      const anderBlik = await request(app)
        .get(`/api/custom-fields/values/user/${lid.id}`)
        .set('Authorization', `Bearer ${generateTestToken(anderLid)}`);

      expect(anderBlik.body.values).not.toHaveProperty('dieet');
      expect(JSON.stringify(anderBlik.body)).not.toContain('notenallergie');
    });
  });

  describe('waarden opslaan', () => {
    it('slaat een waarde op en leest hem terug', async () => {
      await maakVeld();
      const antwoord = await zetWaarde(lid.id, { lidnummer: 'L-0042' });
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);

      const waarden = await alsBeheerder('get', `/values/user/${lid.id}`);
      expect(waarden.body.values.lidnummer).toBe('L-0042');
      expect(waarden.body.meta.lidnummer).toMatchObject({ label: 'Lidnummer', type: 'text' });
    });

    it('overschrijft een bestaande waarde in plaats van er een tweede te maken', async () => {
      await maakVeld();
      await zetWaarde(lid.id, { lidnummer: 'L-0042' });
      await zetWaarde(lid.id, { lidnummer: 'L-0043' });

      expect((await alsBeheerder('get', `/values/user/${lid.id}`)).body.values.lidnummer).toBe('L-0043');
      const aantal = db.prepare('SELECT COUNT(*) AS n FROM custom_field_values WHERE entity_id = ?').get(lid.id) as {
        n: number;
      };
      expect(aantal.n).toBe(1);
    });

    it('slaat elk soort waarde in de juiste kolom op', async () => {
      await maakVeld({ fieldKey: 'leeftijd', fieldLabel: 'Leeftijd', fieldType: 'number' });
      await maakVeld({ fieldKey: 'sinds', fieldLabel: 'Lid sinds', fieldType: 'date' });
      await maakVeld({ fieldKey: 'rijbewijs', fieldLabel: 'Rijbewijs', fieldType: 'boolean' });
      await maakVeld({ fieldKey: 'talen', fieldLabel: 'Talen', fieldType: 'multiselect' });

      await zetWaarde(lid.id, {
        leeftijd: 34,
        sinds: '2019-09-01',
        rijbewijs: true,
        talen: ['nl', 'de'],
      });

      const waarden = (await alsBeheerder('get', `/values/user/${lid.id}`)).body.values;
      expect(waarden).toMatchObject({
        leeftijd: 34,
        sinds: '2019-09-01',
        rijbewijs: true,
        talen: ['nl', 'de'],
      });
    });

    it('slaat een onbekende sleutel stilzwijgend over', async () => {
      await maakVeld();
      const antwoord = await zetWaarde(lid.id, { lidnummer: 'L-1', bestaatniet: 'x' });

      expect(antwoord.status).toBe(200);
      const waarden = (await alsBeheerder('get', `/values/user/${lid.id}`)).body.values;
      expect(waarden).not.toHaveProperty('bestaatniet');
    });

    it('weigert een lege waarde in een verplicht veld', async () => {
      await maakVeld({ isRequired: true });

      const antwoord = await zetWaarde(lid.id, { lidnummer: '' });
      expect(antwoord.status).toBe(400);
    });

    it('houdt zich aan het opgegeven patroon', async () => {
      await maakVeld({ validationRegex: '^L-\\d{4}$' });

      expect((await zetWaarde(lid.id, { lidnummer: 'L-0042' })).status).toBe(200);
      expect((await zetWaarde(lid.id, { lidnummer: 'onzin' })).status).toBe(400);
    });

    it('weigert een waarde die al bij iemand anders staat als het veld uniek is', async () => {
      await maakVeld({ isUnique: true });
      const anderLid = createTestUser(vereniging.id, { email: `uniek-${uuidv4()}@test.nl` });
      await zetWaarde(anderLid.id, { lidnummer: 'L-0042' });

      const antwoord = await zetWaarde(lid.id, { lidnummer: 'L-0042' });
      expect(antwoord.status).toBe(409);
    });

    it('laat dezelfde waarde bij dezelfde persoon wel toe als het veld uniek is', async () => {
      await maakVeld({ isUnique: true });
      await zetWaarde(lid.id, { lidnummer: 'L-0042' });

      expect((await zetWaarde(lid.id, { lidnummer: 'L-0042' })).status).toBe(200);
    });

    it('laat een lid zijn eigen veld bewerken als dat mag', async () => {
      await maakVeld({ fieldKey: 'dieet', fieldLabel: 'Dieetwensen', selfEditable: true });

      const antwoord = await zetWaarde(lid.id, { dieet: 'vegetarisch' }, lidToken);
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
    });

    it('laat een lid het veld van iemand anders niet bewerken', async () => {
      await maakVeld({ fieldKey: 'dieet', fieldLabel: 'Dieetwensen', selfEditable: true });
      const anderLid = createTestUser(vereniging.id, { email: `ander2-${uuidv4()}@test.nl` });

      const antwoord = await zetWaarde(anderLid.id, { dieet: 'vegetarisch' }, lidToken);
      expect(antwoord.status).toBe(403);
    });

    it('laat een lid een veld dat niet zelf-bewerkbaar is met rust', async () => {
      await maakVeld();

      const antwoord = await zetWaarde(lid.id, { lidnummer: 'L-9999' }, lidToken);
      expect(antwoord.status).toBe(403);
    });

    it('laat de muziekcommissie geen admin_only veld bewerken', async () => {
      await maakVeld({ fieldKey: 'notitie', fieldLabel: 'Interne notitie', visibility: 'admin_only' });

      const antwoord = await zetWaarde(lid.id, { notitie: 'iets' }, commissieToken);
      expect(antwoord.status).toBe(403);
    });

    it('gebruikt geen veld van een andere vereniging', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      db.prepare(
        `INSERT INTO custom_field_definitions (id, association_id, entity_type, field_key, field_label, field_type)
         VALUES (?, ?, 'user', 'geheim', 'Geheim', 'text')`,
      ).run(uuidv4(), andere.id);

      const antwoord = await zetWaarde(lid.id, { geheim: 'x' });
      expect(antwoord.status).toBe(200);

      const aantal = db.prepare('SELECT COUNT(*) AS n FROM custom_field_values').get() as { n: number };
      expect(aantal.n).toBe(0);
    });
  });

  describe('waarden verwijderen', () => {
    it('verwijdert een waarde', async () => {
      await maakVeld();
      await zetWaarde(lid.id, { lidnummer: 'L-0042' });

      expect((await alsBeheerder('delete', `/values/user/${lid.id}/lidnummer`)).status).toBe(200);
      expect((await alsBeheerder('get', `/values/user/${lid.id}`)).body.values.lidnummer).toBeNull();
    });

    it('geeft 404 voor een veld dat niet bestaat', async () => {
      expect((await alsBeheerder('delete', `/values/user/${lid.id}/bestaatniet`)).status).toBe(404);
    });

    it('geeft 404 als er geen waarde staat', async () => {
      await maakVeld();
      expect((await alsBeheerder('delete', `/values/user/${lid.id}/lidnummer`)).status).toBe(404);
    });

    it('laat verwijderen alleen aan een beheerder over', async () => {
      await maakVeld();
      await zetWaarde(lid.id, { lidnummer: 'L-0042' });

      expect((await alsLid('delete', `/values/user/${lid.id}/lidnummer`)).status).toBe(403);
    });
  });

  it('vraagt overal om een geldige aanmelding', async () => {
    expect((await request(app).get('/api/custom-fields/definitions')).status).toBe(401);
    expect((await request(app).post('/api/custom-fields/values').send({})).status).toBe(401);
  });
});
