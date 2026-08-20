/**
 * Muziek delen tussen verenigingen.
 *
 * Vier regels dragen het geheel, en die worden hier stuk voor stuk vastgelegd.
 *
 * **Koppelen gaat via een code.** Er is bewust geen lijst van verenigingen op
 * het platform - die stond er wel, en is met deze wijziging weggehaald. Je
 * maakt een code, geeft die buiten Tutti om door, en de ander voert hem in. Zo
 * weet je altijd met wie je gekoppeld bent.
 *
 * **Delen gaat per titel, met uitzonderingen.** Een stuk wordt opengezet voor
 * bepaalde gekoppelde verenigingen; losse partijen kunnen daarvan worden
 * uitgesloten. Zo'n uitzondering geldt voor alle partners tegelijk.
 *
 * **Een bestand komt er niet vanzelf uit.** Een partner ziet de catalogus. Voor
 * het bestand zelf dient hij een verzoek in en beslist de eigenaar per keer.
 * De toegang wordt bij elke download opnieuw getoetst: een deling kan zijn
 * ingetrokken, een koppeling beeindigd of de termijn verlopen sinds die
 * goedkeuring.
 *
 * **Oproepen.** Een vereniging die een stuk zoekt plaatst een oproep; alleen
 * gekoppelde verenigingen zien hem, en alleen de muziekcommissie antwoordt.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import sharingRoutes from '../../routes/music-sharing';
import { errorHandler } from '../../middleware/errorHandler';
import {
  createTestAssociation,
  createTestInstrument,
  createTestMusicPiece,
  createTestUser,
  generateTestToken,
  TestAssociation,
  TestUser,
} from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api/music-sharing', sharingRoutes);
app.use(errorHandler);

describe('muziek delen tussen verenigingen', () => {
  let ons: TestAssociation;
  let onzeCommissie: TestUser;
  let onsToken: string;
  let onsLid: TestUser;
  let onsLidToken: string;

  let hun: TestAssociation;
  let hunCommissie: TestUser;
  let hunToken: string;

  let derde: TestAssociation;
  let derdeCommissie: TestUser;
  let derdeToken: string;

  beforeEach(() => {
    ons = createTestAssociation({ name: 'Harmonie Ons Genoegen' });
    onzeCommissie = createTestUser(ons.id, { email: 'mc@ons.nl', role: 'music_committee' });
    onsToken = generateTestToken(onzeCommissie);
    onsLid = createTestUser(ons.id, { email: 'lid@ons.nl', role: 'member' });
    onsLidToken = generateTestToken(onsLid);

    hun = createTestAssociation({ name: 'Fanfare Sint Cecilia' });
    hunCommissie = createTestUser(hun.id, { email: 'mc@hun.nl', role: 'music_committee' });
    hunToken = generateTestToken(hunCommissie);

    derde = createTestAssociation({ name: 'Brassband Excelsior' });
    derdeCommissie = createTestUser(derde.id, { email: 'mc@derde.nl', role: 'music_committee' });
    derdeToken = generateTestToken(derdeCommissie);
  });

  type Methode = 'get' | 'post' | 'put' | 'patch' | 'delete';
  const als = (token: string, methode: Methode, pad: string) =>
    request(app)[methode](`/api/music-sharing${pad}`).set('Authorization', `Bearer ${token}`);

  /** Koppelt twee verenigingen door een code te maken en in te wisselen. */
  async function koppel(vanToken: string, naarToken: string): Promise<void> {
    const code = await als(vanToken, 'post', '/link-code');
    expect(code.status, JSON.stringify(code.body)).toBe(201);
    const inwisselen = await als(naarToken, 'post', '/link-code/redeem').send({ code: code.body.code });
    expect(inwisselen.status, JSON.stringify(inwisselen.body)).toBe(200);
  }

  /** Een muziektitel met een of meer partijen eronder. */
  function maakTitel(
    associationId: string,
    titel: string,
    opties: { arranger?: string | null; internalNotes?: string } = {},
  ): string {
    const id = uuidv4();
    db.prepare(
      `INSERT INTO music_titles (id, title, composer, arranger, association_id, internal_notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(id, titel, 'Een Componist', opties.arranger ?? null, associationId, opties.internalNotes ?? null);
    return id;
  }

  function maakPartij(associationId: string, titel: string, instrumentNaam: string, arranger: string | null = null) {
    const instrument = createTestInstrument({ name: instrumentNaam });
    return createTestMusicPiece(associationId, { title: titel, arranger, instrumentId: instrument.id });
  }

  describe('koppelen met een code', () => {
    it('maakt een code aan met een vervaldatum', async () => {
      const antwoord = await als(onsToken, 'post', '/link-code');
      expect(antwoord.status).toBe(201);
      expect(antwoord.body.code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
      expect(new Date(antwoord.body.expiresAt).getTime()).toBeGreaterThan(Date.now());
    });

    it('laat een gewoon lid geen code maken', async () => {
      expect((await als(onsLidToken, 'post', '/link-code')).status).toBe(403);
    });

    it('koppelt twee verenigingen', async () => {
      await koppel(onsToken, hunToken);

      const onzePartners = await als(onsToken, 'get', '/partners');
      const hunPartners = await als(hunToken, 'get', '/partners');

      expect(onzePartners.body.map((p: { id: string }) => p.id)).toEqual([hun.id]);
      expect(hunPartners.body.map((p: { id: string }) => p.id)).toEqual([ons.id]);
    });

    it('trekt een oudere ongebruikte code in', async () => {
      const eerste = await als(onsToken, 'post', '/link-code');
      await als(onsToken, 'post', '/link-code');

      const antwoord = await als(hunToken, 'post', '/link-code/redeem').send({ code: eerste.body.code });
      expect(antwoord.status).toBe(400);
      expect(antwoord.body.error).toContain('bestaat niet');
    });

    it('gebruikt een code maar een keer', async () => {
      const code = await als(onsToken, 'post', '/link-code');
      await als(hunToken, 'post', '/link-code/redeem').send({ code: code.body.code });

      const tweede = await als(derdeToken, 'post', '/link-code/redeem').send({ code: code.body.code });
      expect(tweede.status).toBe(400);
      expect(tweede.body.error).toContain('al gebruikt');
    });

    it('weigert een verlopen code', async () => {
      const code = await als(onsToken, 'post', '/link-code');
      db.prepare('UPDATE association_link_codes SET expires_at = ? WHERE code = ?').run(
        new Date(Date.now() - 1000).toISOString(),
        code.body.code,
      );

      const antwoord = await als(hunToken, 'post', '/link-code/redeem').send({ code: code.body.code });
      expect(antwoord.status).toBe(400);
      expect(antwoord.body.error).toContain('verlopen');
    });

    it('weigert de code van je eigen vereniging', async () => {
      const code = await als(onsToken, 'post', '/link-code');
      const antwoord = await als(onsToken, 'post', '/link-code/redeem').send({ code: code.body.code });
      expect(antwoord.status).toBe(400);
      expect(antwoord.body.error).toContain('eigen vereniging');
    });

    it('meldt dat je al gekoppeld bent', async () => {
      await koppel(onsToken, hunToken);
      const nieuw = await als(onsToken, 'post', '/link-code');
      const antwoord = await als(hunToken, 'post', '/link-code/redeem').send({ code: nieuw.body.code });

      expect(antwoord.status).toBe(400);
      expect(antwoord.body.error).toContain('al gekoppeld');
    });

    it('leest een code met kleine letters en spaties eromheen ook', async () => {
      const code = await als(onsToken, 'post', '/link-code');
      const antwoord = await als(hunToken, 'post', '/link-code/redeem').send({
        code: `  ${code.body.code.toLowerCase()}  `,
      });
      expect(antwoord.status).toBe(200);
      expect(antwoord.body.partnerNaam).toBe('Harmonie Ons Genoegen');
    });

    it('beeindigt een koppeling', async () => {
      await koppel(onsToken, hunToken);
      const antwoord = await als(onsToken, 'delete', `/partners/${hun.id}`);
      expect(antwoord.status).toBe(200);

      expect((await als(onsToken, 'get', '/partners')).body).toEqual([]);
      expect((await als(hunToken, 'get', '/partners')).body).toEqual([]);
    });

    it('meldt netjes dat er geen koppeling is om te beeindigen', async () => {
      expect((await als(onsToken, 'delete', `/partners/${hun.id}`)).status).toBe(404);
    });
  });

  describe('delen per titel', () => {
    let titelId: string;

    beforeEach(async () => {
      await koppel(onsToken, hunToken);
      titelId = maakTitel(ons.id, 'Mars der Medici');
    });

    it('deelt een titel met een gekoppelde vereniging', async () => {
      const antwoord = await als(onsToken, 'put', `/titles/${titelId}/shares`).send({ partnerIds: [hun.id] });
      expect(antwoord.status).toBe(200);

      const overzicht = await als(onsToken, 'get', `/titles/${titelId}`);
      expect(overzicht.body.sharedWith.map((v: { id: string }) => v.id)).toEqual([hun.id]);
    });

    it('weigert delen met een vereniging waarmee je niet gekoppeld bent', async () => {
      const antwoord = await als(onsToken, 'put', `/titles/${titelId}/shares`).send({ partnerIds: [derde.id] });
      expect(antwoord.status).toBe(400);
      expect(antwoord.body.error).toContain('niet gekoppeld');
    });

    it('vervangt de hele lijst', async () => {
      await koppel(onsToken, derdeToken);
      await als(onsToken, 'put', `/titles/${titelId}/shares`).send({ partnerIds: [hun.id, derde.id] });
      await als(onsToken, 'put', `/titles/${titelId}/shares`).send({ partnerIds: [derde.id] });

      const overzicht = await als(onsToken, 'get', `/titles/${titelId}`);
      expect(overzicht.body.sharedWith.map((v: { id: string }) => v.id)).toEqual([derde.id]);
    });

    it('stopt delen met een lege lijst', async () => {
      await als(onsToken, 'put', `/titles/${titelId}/shares`).send({ partnerIds: [hun.id] });
      await als(onsToken, 'put', `/titles/${titelId}/shares`).send({ partnerIds: [] });

      expect((await als(onsToken, 'get', `/titles/${titelId}`)).body.sharedWith).toEqual([]);
    });

    it('kent de titel van een andere vereniging niet', async () => {
      const vanHun = maakTitel(hun.id, 'Hun Stuk');
      expect((await als(onsToken, 'get', `/titles/${vanHun}`)).status).toBe(404);
      expect((await als(onsToken, 'put', `/titles/${vanHun}/shares`).send({ partnerIds: [] })).status).toBe(404);
    });

    it('laat een gewoon lid het delen niet inrichten', async () => {
      expect((await als(onsLidToken, 'put', `/titles/${titelId}/shares`).send({ partnerIds: [] })).status).toBe(403);
    });

    it('somt de partijen bij de titel op', async () => {
      maakPartij(ons.id, 'Mars der Medici', 'Trompet');
      maakPartij(ons.id, 'Mars der Medici', 'Klarinet');

      const overzicht = await als(onsToken, 'get', `/titles/${titelId}`);
      expect(overzicht.body.parts.map((p: { instrumentName: string }) => p.instrumentName).sort()).toEqual([
        'Klarinet',
        'Trompet',
      ]);
    });

    it('houdt partijen van een gelijknamig stuk met een andere arrangeur erbuiten', async () => {
      maakPartij(ons.id, 'Mars der Medici', 'Trompet');
      maakPartij(ons.id, 'Mars der Medici', 'Bugel', 'Andere Arrangeur');

      const overzicht = await als(onsToken, 'get', `/titles/${titelId}`);
      expect(overzicht.body.parts).toHaveLength(1);
    });
  });

  describe('partijen uitsluiten', () => {
    let titelId: string;
    let partituur: { id: string };

    beforeEach(async () => {
      await koppel(onsToken, hunToken);
      titelId = maakTitel(ons.id, 'Mars der Medici');
      partituur = maakPartij(ons.id, 'Mars der Medici', 'Partituur');
      maakPartij(ons.id, 'Mars der Medici', 'Trompet');
      await als(onsToken, 'put', `/titles/${titelId}/shares`).send({ partnerIds: [hun.id] });
    });

    it('markeert een partij als uitgesloten', async () => {
      const antwoord = await als(onsToken, 'post', `/pieces/${partituur.id}/exclude`).send({
        reason: 'Dirigentenpartituur',
      });
      expect(antwoord.status).toBe(201);

      const overzicht = await als(onsToken, 'get', `/titles/${titelId}`);
      const rij = overzicht.body.parts.find((p: { id: string }) => p.id === partituur.id);
      expect(rij.uitgesloten).toBe(true);
    });

    it('houdt een uitgesloten partij uit de catalogus van de partner', async () => {
      await als(onsToken, 'post', `/pieces/${partituur.id}/exclude`);

      const bijHun = await als(hunToken, 'get', `/catalog/${titelId}`);
      expect(bijHun.body.parts.map((p: { instrumentName: string }) => p.instrumentName)).toEqual(['Trompet']);
    });

    it('draait de uitsluiting terug', async () => {
      await als(onsToken, 'post', `/pieces/${partituur.id}/exclude`);
      await als(onsToken, 'delete', `/pieces/${partituur.id}/exclude`);

      const bijHun = await als(hunToken, 'get', `/catalog/${titelId}`);
      expect(bijHun.body.parts).toHaveLength(2);
    });

    it('kent de partij van een andere vereniging niet', async () => {
      const vanHun = maakPartij(hun.id, 'Hun Stuk', 'Trompet');
      expect((await als(onsToken, 'post', `/pieces/${vanHun.id}/exclude`)).status).toBe(404);
    });
  });

  describe('de catalogus van een partner', () => {
    let titelId: string;

    beforeEach(async () => {
      await koppel(onsToken, hunToken);
      titelId = maakTitel(ons.id, 'Mars der Medici', { internalNotes: 'Ligt achterin de kast' });
      await als(onsToken, 'put', `/titles/${titelId}/shares`).send({ partnerIds: [hun.id] });
    });

    it('toont wat er met ons gedeeld is', async () => {
      const antwoord = await als(hunToken, 'get', '/catalog');
      expect(antwoord.status).toBe(200);
      expect(antwoord.body).toHaveLength(1);
      expect(antwoord.body[0]).toMatchObject({ title: 'Mars der Medici', associationName: 'Harmonie Ons Genoegen' });
    });

    it('geeft de interne notities niet mee', async () => {
      const antwoord = await als(hunToken, 'get', '/catalog');
      expect(JSON.stringify(antwoord.body)).not.toContain('achterin de kast');
    });

    it('toont niets aan een vereniging die niet gekoppeld is', async () => {
      expect((await als(derdeToken, 'get', '/catalog')).body).toEqual([]);
    });

    it('toont een stuk niet dat wel bestaat maar niet gedeeld is', async () => {
      maakTitel(ons.id, 'Niet Gedeeld');
      const antwoord = await als(hunToken, 'get', '/catalog');
      expect(antwoord.body.map((t: { title: string }) => t.title)).toEqual(['Mars der Medici']);
    });

    it('stopt met tonen zodra de koppeling wordt beeindigd', async () => {
      await als(onsToken, 'delete', `/partners/${hun.id}`);
      expect((await als(hunToken, 'get', '/catalog')).body).toEqual([]);
      expect((await als(hunToken, 'get', `/catalog/${titelId}`)).status).toBe(404);
    });

    it('stopt met tonen zodra de deling wordt ingetrokken', async () => {
      await als(onsToken, 'put', `/titles/${titelId}/shares`).send({ partnerIds: [] });
      expect((await als(hunToken, 'get', '/catalog')).body).toEqual([]);
    });

    it('toont een verwijderd stuk niet', async () => {
      db.prepare('UPDATE music_titles SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?').run(titelId);
      expect((await als(hunToken, 'get', '/catalog')).body).toEqual([]);
    });

    it('zoekt op titel en componist', async () => {
      const tweede = maakTitel(ons.id, 'Toccata');
      await als(onsToken, 'put', `/titles/${tweede}/shares`).send({ partnerIds: [hun.id] });

      const gevonden = await als(hunToken, 'get', '/catalog?q=toccata');
      expect(gevonden.body.map((t: { title: string }) => t.title)).toEqual(['Toccata']);
    });

    it('laat elk lid de catalogus inzien', async () => {
      const hunLid = createTestUser(hun.id, { email: 'lid@hun.nl', role: 'member' });
      const antwoord = await als(generateTestToken(hunLid), 'get', '/catalog');
      expect(antwoord.status).toBe(200);
      expect(antwoord.body).toHaveLength(1);
    });
  });

  describe('een bestand opvragen', () => {
    let titelId: string;
    let trompet: { id: string };

    beforeEach(async () => {
      await koppel(onsToken, hunToken);
      titelId = maakTitel(ons.id, 'Mars der Medici');
      trompet = maakPartij(ons.id, 'Mars der Medici', 'Trompet');
      await als(onsToken, 'put', `/titles/${titelId}/shares`).send({ partnerIds: [hun.id] });
    });

    const vraagAan = () => als(hunToken, 'post', '/requests').send({ pieceId: trompet.id, message: 'Graag!' });

    it('dient een verzoek in', async () => {
      const antwoord = await vraagAan();
      expect(antwoord.status).toBe(201);
      expect(antwoord.body.status).toBe('pending');
    });

    it('laat geen tweede verzoek voor dezelfde partij lopen', async () => {
      await vraagAan();
      const tweede = await vraagAan();
      expect(tweede.status).toBe(409);
    });

    it('weigert een verzoek voor een partij die niet met ons gedeeld is', async () => {
      const antwoord = await als(derdeToken, 'post', '/requests').send({ pieceId: trompet.id });
      expect(antwoord.status).toBe(404);
    });

    it('weigert een verzoek voor een uitgesloten partij', async () => {
      await als(onsToken, 'post', `/pieces/${trompet.id}/exclude`);
      const antwoord = await vraagAan();
      expect(antwoord.status).toBe(404);
    });

    it('toont het verzoek bij de eigenaar en bij de vrager', async () => {
      await vraagAan();

      const binnen = await als(onsToken, 'get', '/requests/incoming');
      const buiten = await als(hunToken, 'get', '/requests/outgoing');

      expect(binnen.body).toHaveLength(1);
      expect(binnen.body[0]).toMatchObject({
        status: 'pending',
        instrumentName: 'Trompet',
        requestingAssociationName: 'Fanfare Sint Cecilia',
      });
      expect(buiten.body).toHaveLength(1);
      expect(buiten.body[0].ownerAssociationName).toBe('Harmonie Ons Genoegen');
    });

    it('toont het verzoek niet bij een derde vereniging', async () => {
      await vraagAan();
      expect((await als(derdeToken, 'get', '/requests/incoming')).body).toEqual([]);
    });

    it('keurt een verzoek goed met een termijn', async () => {
      const verzoek = await vraagAan();
      const antwoord = await als(onsToken, 'post', `/requests/${verzoek.body.id}/approve`).send({ dagen: 7 });

      expect(antwoord.status).toBe(200);
      expect(new Date(antwoord.body.accessExpiresAt).getTime()).toBeGreaterThan(Date.now());
    });

    it('wijst een verzoek af en laat het staan', async () => {
      const verzoek = await vraagAan();
      await als(onsToken, 'post', `/requests/${verzoek.body.id}/reject`).send({ note: 'Gekocht arrangement.' });

      const binnen = await als(onsToken, 'get', '/requests/incoming');
      expect(binnen.body[0]).toMatchObject({ status: 'rejected', decisionNote: 'Gekocht arrangement.' });
    });

    it('laat de vrager niet zijn eigen verzoek goedkeuren', async () => {
      const verzoek = await vraagAan();
      expect((await als(hunToken, 'post', `/requests/${verzoek.body.id}/approve`)).status).toBe(404);
    });

    it('beslist niet twee keer over hetzelfde verzoek', async () => {
      const verzoek = await vraagAan();
      await als(onsToken, 'post', `/requests/${verzoek.body.id}/approve`);
      expect((await als(onsToken, 'post', `/requests/${verzoek.body.id}/reject`)).status).toBe(404);
    });

    it('trekt een eigen verzoek in', async () => {
      const verzoek = await vraagAan();
      expect((await als(hunToken, 'delete', `/requests/${verzoek.body.id}`)).status).toBe(200);
      expect((await als(onsToken, 'get', '/requests/incoming?status=pending')).body).toEqual([]);
    });

    it('trekt het verzoek van een ander niet in', async () => {
      const verzoek = await vraagAan();
      expect((await als(onsToken, 'delete', `/requests/${verzoek.body.id}`)).status).toBe(404);
    });

    it('toont de stand van het verzoek in de catalogus', async () => {
      const verzoek = await vraagAan();
      await als(onsToken, 'post', `/requests/${verzoek.body.id}/approve`);

      const detail = await als(hunToken, 'get', `/catalog/${titelId}`);
      expect(detail.body.parts[0].request).toMatchObject({ status: 'approved' });
    });
  });

  describe('het vrijgegeven bestand ophalen', () => {
    let titelId: string;
    let trompet: { id: string };
    let verzoekId: string;

    beforeEach(async () => {
      await koppel(onsToken, hunToken);
      titelId = maakTitel(ons.id, 'Mars der Medici');
      trompet = maakPartij(ons.id, 'Mars der Medici', 'Trompet');
      await als(onsToken, 'put', `/titles/${titelId}/shares`).send({ partnerIds: [hun.id] });
      const verzoek = await als(hunToken, 'post', '/requests').send({ pieceId: trompet.id });
      verzoekId = verzoek.body.id;
    });

    /**
     * Het bestand staat niet op schijf in een test, dus een geslaagde controle
     * eindigt op "bestand niet gevonden". Dat is precies het onderscheid dat
     * hier telt: 'Geen toegang' betekent dat de regels het tegenhielden.
     */
    const toegangGeweigerd = async (token: string) => {
      const antwoord = await als(token, 'get', `/requests/${verzoekId}/download`);
      expect(antwoord.status).toBe(404);
      return antwoord.body.error as string;
    };

    it('laat een openstaand verzoek niets ophalen', async () => {
      expect(await toegangGeweigerd(hunToken)).toContain('Geen toegang');
    });

    it('komt na goedkeuring voorbij de toegangscontrole', async () => {
      await als(onsToken, 'post', `/requests/${verzoekId}/approve`);
      expect(await toegangGeweigerd(hunToken)).toContain('Bestand niet gevonden');
    });

    it('weigert zodra de termijn verlopen is', async () => {
      await als(onsToken, 'post', `/requests/${verzoekId}/approve`);
      db.prepare('UPDATE music_file_requests SET access_expires_at = ? WHERE id = ?').run(
        '2000-01-01 00:00:00',
        verzoekId,
      );
      expect(await toegangGeweigerd(hunToken)).toContain('Geen toegang');
    });

    it('weigert zodra de deling wordt ingetrokken', async () => {
      await als(onsToken, 'post', `/requests/${verzoekId}/approve`);
      await als(onsToken, 'put', `/titles/${titelId}/shares`).send({ partnerIds: [] });
      expect(await toegangGeweigerd(hunToken)).toContain('Geen toegang');
    });

    it('weigert zodra de koppeling wordt beeindigd', async () => {
      await als(onsToken, 'post', `/requests/${verzoekId}/approve`);
      await als(onsToken, 'delete', `/partners/${hun.id}`);
      expect(await toegangGeweigerd(hunToken)).toContain('Geen toegang');
    });

    it('weigert zodra de partij alsnog wordt uitgesloten', async () => {
      await als(onsToken, 'post', `/requests/${verzoekId}/approve`);
      await als(onsToken, 'post', `/pieces/${trompet.id}/exclude`);
      expect(await toegangGeweigerd(hunToken)).toContain('Geen toegang');
    });

    it('geeft een andere vereniging geen toegang tot dit verzoek', async () => {
      await als(onsToken, 'post', `/requests/${verzoekId}/approve`);
      expect(await toegangGeweigerd(derdeToken)).toContain('Geen toegang');
    });
  });

  describe('oproepen', () => {
    const geldigeOproep = {
      title: 'Adagio for Strings',
      composer: 'Samuel Barber',
      description: 'Wij zoeken de partijen voor harmonie.',
      referenceUrl: 'https://www.youtube.com/watch?v=izQsgE0L450',
    };

    it('plaatst een oproep', async () => {
      const antwoord = await als(onsToken, 'post', '/wanted').send(geldigeOproep);
      expect(antwoord.status).toBe(201);

      const lijst = await als(onsToken, 'get', '/wanted');
      expect(lijst.body[0]).toMatchObject({
        title: 'Adagio for Strings',
        referenceUrl: 'https://www.youtube.com/watch?v=izQsgE0L450',
        status: 'open',
        replyCount: 0,
      });
    });

    it('weigert een verwijzing die geen webadres is', async () => {
      const antwoord = await als(onsToken, 'post', '/wanted').send({
        ...geldigeOproep,
        referenceUrl: 'javascript:alert(1)',
      });
      expect(antwoord.status).toBe(400);
    });

    it('weigert een oproep zonder titel', async () => {
      expect((await als(onsToken, 'post', '/wanted').send({ title: '' })).status).toBe(400);
    });

    it('laat een gewoon lid geen oproep plaatsen', async () => {
      expect((await als(onsLidToken, 'post', '/wanted').send(geldigeOproep)).status).toBe(403);
    });

    it('toont de oproep aan een gekoppelde vereniging', async () => {
      await koppel(onsToken, hunToken);
      await als(onsToken, 'post', '/wanted').send(geldigeOproep);

      const bijHun = await als(hunToken, 'get', '/wanted');
      expect(bijHun.body.map((o: { title: string }) => o.title)).toEqual(['Adagio for Strings']);
      expect(bijHun.body[0].associationName).toBe('Harmonie Ons Genoegen');
    });

    it('toont de oproep niet aan een vereniging die niet gekoppeld is', async () => {
      await als(onsToken, 'post', '/wanted').send(geldigeOproep);
      expect((await als(derdeToken, 'get', '/wanted')).body).toEqual([]);
    });

    it('filtert op stand', async () => {
      const oproep = await als(onsToken, 'post', '/wanted').send(geldigeOproep);
      await als(onsToken, 'post', '/wanted').send({ ...geldigeOproep, title: 'Nog Een' });
      await als(onsToken, 'patch', `/wanted/${oproep.body.id}`).send({ status: 'resolved' });

      const open = await als(onsToken, 'get', '/wanted?status=open');
      expect(open.body.map((o: { title: string }) => o.title)).toEqual(['Nog Een']);
    });

    it('werkt de eigen oproep bij zonder de rest te wissen', async () => {
      const oproep = await als(onsToken, 'post', '/wanted').send(geldigeOproep);
      await als(onsToken, 'patch', `/wanted/${oproep.body.id}`).send({ description: 'Alleen de partituur nog.' });

      const lijst = await als(onsToken, 'get', '/wanted');
      expect(lijst.body[0]).toMatchObject({
        title: 'Adagio for Strings',
        composer: 'Samuel Barber',
        description: 'Alleen de partituur nog.',
      });
    });

    it('werkt de oproep van een ander niet bij', async () => {
      await koppel(onsToken, hunToken);
      const oproep = await als(onsToken, 'post', '/wanted').send(geldigeOproep);
      expect((await als(hunToken, 'patch', `/wanted/${oproep.body.id}`).send({ status: 'closed' })).status).toBe(404);
    });

    it('verwijdert de eigen oproep', async () => {
      const oproep = await als(onsToken, 'post', '/wanted').send(geldigeOproep);
      expect((await als(onsToken, 'delete', `/wanted/${oproep.body.id}`)).status).toBe(200);
      expect((await als(onsToken, 'get', '/wanted')).body).toEqual([]);
    });

    it('verwijdert de oproep van een ander niet', async () => {
      await koppel(onsToken, hunToken);
      const oproep = await als(onsToken, 'post', '/wanted').send(geldigeOproep);
      expect((await als(hunToken, 'delete', `/wanted/${oproep.body.id}`)).status).toBe(404);
    });
  });

  describe('antwoorden op een oproep', () => {
    let oproepId: string;

    beforeEach(async () => {
      await koppel(onsToken, hunToken);
      const oproep = await als(onsToken, 'post', '/wanted').send({ title: 'Adagio for Strings' });
      oproepId = oproep.body.id;
    });

    it('antwoordt vanuit een gekoppelde vereniging', async () => {
      const antwoord = await als(hunToken, 'post', `/wanted/${oproepId}/replies`).send({
        body: 'Wij hebben dit liggen, stuur maar een verzoek.',
      });
      expect(antwoord.status).toBe(201);

      const antwoorden = await als(onsToken, 'get', `/wanted/${oproepId}/replies`);
      expect(antwoorden.body).toHaveLength(1);
      expect(antwoorden.body[0]).toMatchObject({
        associationName: 'Fanfare Sint Cecilia',
        body: 'Wij hebben dit liggen, stuur maar een verzoek.',
      });
    });

    it('telt de antwoorden mee in de lijst', async () => {
      await als(hunToken, 'post', `/wanted/${oproepId}/replies`).send({ body: 'Wij hebben dit.' });
      const lijst = await als(onsToken, 'get', '/wanted');
      expect(lijst.body[0].replyCount).toBe(1);
    });

    it('wijst een eigen titel aan', async () => {
      const titelId = maakTitel(hun.id, 'Adagio for Strings');
      const antwoord = await als(hunToken, 'post', `/wanted/${oproepId}/replies`).send({
        body: 'Deze bedoel je vast.',
        musicTitleId: titelId,
      });
      expect(antwoord.status).toBe(201);
    });

    it('wijst geen titel aan die niet van de eigen vereniging is', async () => {
      const vanOns = maakTitel(ons.id, 'Ons Stuk');
      const antwoord = await als(hunToken, 'post', `/wanted/${oproepId}/replies`).send({
        body: 'Deze?',
        musicTitleId: vanOns,
      });
      expect(antwoord.status).toBe(400);
    });

    it('laat een niet-gekoppelde vereniging niet antwoorden of meelezen', async () => {
      expect((await als(derdeToken, 'post', `/wanted/${oproepId}/replies`).send({ body: 'Hoi' })).status).toBe(404);
      expect((await als(derdeToken, 'get', `/wanted/${oproepId}/replies`)).status).toBe(404);
    });

    it('laat een gewoon lid niet antwoorden maar wel meelezen', async () => {
      await als(hunToken, 'post', `/wanted/${oproepId}/replies`).send({ body: 'Wij hebben dit.' });

      expect((await als(onsLidToken, 'post', `/wanted/${oproepId}/replies`).send({ body: 'Ik ook' })).status).toBe(403);
      expect((await als(onsLidToken, 'get', `/wanted/${oproepId}/replies`)).status).toBe(200);
    });

    it('weigert een leeg antwoord', async () => {
      expect((await als(hunToken, 'post', `/wanted/${oproepId}/replies`).send({ body: '   ' })).status).toBe(400);
    });
  });

  describe('overzicht', () => {
    it('toont per partner welke stukken gedeeld worden', async () => {
      await koppel(onsToken, hunToken);
      await koppel(onsToken, derdeToken);

      const eerste = maakTitel(ons.id, 'Mars der Medici');
      const tweede = maakTitel(ons.id, 'Toccata');
      await als(onsToken, 'put', `/titles/${eerste}/shares`).send({ partnerIds: [hun.id, derde.id] });
      await als(onsToken, 'put', `/titles/${tweede}/shares`).send({ partnerIds: [hun.id] });

      const antwoord = await als(onsToken, 'get', '/overview');
      expect(antwoord.status).toBe(200);

      const perNaam = Object.fromEntries(
        antwoord.body.partners.map((p: { partnerName: string; titles: { title: string }[] }) => [
          p.partnerName,
          p.titles.map((t) => t.title).sort(),
        ]),
      );
      expect(perNaam).toEqual({
        'Brassband Excelsior': ['Mars der Medici'],
        'Fanfare Sint Cecilia': ['Mars der Medici', 'Toccata'],
      });
    });

    it('noemt ook een partner waarmee niets gedeeld wordt', async () => {
      await koppel(onsToken, hunToken);
      const antwoord = await als(onsToken, 'get', '/overview');
      expect(antwoord.body.partners).toEqual([
        expect.objectContaining({ partnerName: 'Fanfare Sint Cecilia', titles: [] }),
      ]);
    });

    it('somt de uitgesloten partijen op', async () => {
      await koppel(onsToken, hunToken);
      maakTitel(ons.id, 'Mars der Medici');
      const partituur = maakPartij(ons.id, 'Mars der Medici', 'Partituur');
      await als(onsToken, 'post', `/pieces/${partituur.id}/exclude`).send({ reason: 'Dirigentenpartituur' });

      const antwoord = await als(onsToken, 'get', '/overview');
      expect(antwoord.body.excludedParts).toEqual([
        expect.objectContaining({ instrumentName: 'Partituur', reason: 'Dirigentenpartituur' }),
      ]);
    });

    it('laat een gewoon lid er niet bij', async () => {
      expect((await als(onsLidToken, 'get', '/overview')).status).toBe(403);
    });
  });
});
