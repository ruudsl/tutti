/**
 * Invalverzoeken: het orkest mist een trompettist voor het concert van
 * zaterdag en nodigt externe muzikanten uit.
 *
 * Het zwaartepunt ligt bij de bezettingstelling. Zolang die klopt weet het
 * bestuur of de plek bezet is; klopt hij niet, dan staat er zaterdag niemand.
 * Daar zat ook een gat: de telling werd alleen bijgewerkt bij een toezegging.
 * Zegde iemand die al had toegezegd daarna af, dan bleef het verzoek op
 * "gevuld" staan.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import replacementRoutes from '../../routes/replacement-requests';
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
app.use('/api/replacement-requests', replacementRoutes);
app.use(errorHandler);

describe('invalverzoeken', () => {
  let vereniging: TestAssociation;
  let beheerderToken: string;
  let lid: TestUser;
  let lidToken: string;
  let trompet: TestInstrument;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    beheerderToken = omgeving.adminToken;
    lid = omgeving.memberUser;
    lidToken = omgeving.memberToken;
    trompet = createTestInstrument({ name: `Trompet-${uuidv4().slice(0, 8)}` });
  });

  type Methode = 'get' | 'post' | 'put' | 'delete';
  const als = (token: string, methode: Methode, pad: string) =>
    request(app)[methode](`/api/replacement-requests${pad}`).set('Authorization', `Bearer ${token}`);
  const alsBeheerder = (methode: Methode, pad: string) => als(beheerderToken, methode, pad);
  const alsLid = (methode: Methode, pad: string) => als(lidToken, methode, pad);

  function maakConcert(associationId = vereniging.id): string {
    const id = uuidv4();
    db.prepare(
      "INSERT INTO concerts (id, association_id, name, date, location) VALUES (?, ?, 'Najaarsconcert', '2026-11-14', 'Kerk')",
    ).run(id, associationId);
    return id;
  }

  function maakMuzikant(overrides: Record<string, unknown> = {}): string {
    const id = uuidv4();
    const w = {
      association_id: vereniging.id,
      first_name: 'Sanne',
      last_name: 'de Vries',
      musician_type: 'substitute',
      is_active: 1,
      instrument_id: trompet.id as string | null,
      ...overrides,
    };
    db.prepare(
      `INSERT INTO external_musicians (id, association_id, first_name, last_name, email, musician_type, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, w.association_id, w.first_name, w.last_name, `${id}@test.nl`, w.musician_type, w.is_active);

    if (w.instrument_id) {
      db.prepare(
        `INSERT INTO external_musician_instruments (id, external_musician_id, instrument_id, is_primary)
         VALUES (?, ?, ?, 1)`,
      ).run(uuidv4(), id, w.instrument_id);
    }
    return id;
  }

  async function maakVerzoek(overrides: Record<string, unknown> = {}): Promise<{ id: string; concertId: string }> {
    const concertId = (overrides.eventId as string) ?? maakConcert();
    const antwoord = await alsBeheerder('post', '/').send({
      eventType: 'concert',
      eventId: concertId,
      eventDate: '2026-11-14',
      instrumentId: trompet.id,
      ...overrides,
    });
    expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);
    return { id: antwoord.body.id, concertId };
  }

  async function nodigUit(verzoekId: string, muzikantId: string) {
    return alsBeheerder('post', `/${verzoekId}/invite`).send({ externalMusicianId: muzikantId });
  }

  function verzoekRij(id: string): { status: string; positions_filled: number } {
    return db.prepare('SELECT status, positions_filled FROM replacement_requests WHERE id = ?').get(id) as {
      status: string;
      positions_filled: number;
    };
  }

  describe('verzoeken aanmaken', () => {
    it('begint met een lege lijst', async () => {
      const antwoord = await alsLid('get', '/');
      expect(antwoord.status).toBe(200);
      expect(antwoord.body).toEqual([]);
    });

    it('maakt een verzoek met standaardwaarden', async () => {
      const { id } = await maakVerzoek();

      const antwoord = await alsLid('get', `/${id}`);
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      expect(antwoord.body).toMatchObject({
        eventType: 'concert',
        eventName: 'Najaarsconcert',
        eventLocation: 'Kerk',
        positionsNeeded: 1,
        positionsFilled: 0,
        urgency: 'normal',
        status: 'open',
      });
    });

    it('neemt urgentie en aantal plekken over', async () => {
      const { id } = await maakVerzoek({ positionsNeeded: 3, urgency: 'critical', notes: 'Liefst met eigen partij' });

      const antwoord = await alsLid('get', `/${id}`);
      expect(antwoord.body).toMatchObject({
        positionsNeeded: 3,
        urgency: 'critical',
        notes: 'Liefst met eigen partij',
      });
    });

    it('weigert een urgentie die niet bestaat', async () => {
      const antwoord = await alsBeheerder('post', '/').send({
        eventType: 'concert',
        eventId: maakConcert(),
        eventDate: '2026-11-14',
        instrumentId: trompet.id,
        urgency: 'paniek',
      });
      expect(antwoord.status).toBe(400);
    });

    it('weigert nul plekken', async () => {
      const antwoord = await alsBeheerder('post', '/').send({
        eventType: 'concert',
        eventId: maakConcert(),
        eventDate: '2026-11-14',
        instrumentId: trompet.id,
        positionsNeeded: 0,
      });
      expect(antwoord.status).toBe(400);
    });

    it('weigert een concert dat niet bestaat', async () => {
      const antwoord = await alsBeheerder('post', '/').send({
        eventType: 'concert',
        eventId: uuidv4(),
        eventDate: '2026-11-14',
        instrumentId: trompet.id,
      });
      expect(antwoord.status).toBe(404);
    });

    it('weigert een concert van een andere vereniging', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const antwoord = await alsBeheerder('post', '/').send({
        eventType: 'concert',
        eventId: maakConcert(andere.id),
        eventDate: '2026-11-14',
        instrumentId: trompet.id,
      });
      expect(antwoord.status).toBe(404);
    });

    it('weigert een tweede verzoek voor hetzelfde instrument bij hetzelfde concert', async () => {
      const { concertId } = await maakVerzoek();

      const tweede = await alsBeheerder('post', '/').send({
        eventType: 'concert',
        eventId: concertId,
        eventDate: '2026-11-14',
        instrumentId: trompet.id,
      });
      expect(tweede.status).toBe(409);
    });

    it('laat een nieuw verzoek toe nadat het vorige is geannuleerd', async () => {
      const { id, concertId } = await maakVerzoek();
      await alsBeheerder('delete', `/${id}`);

      const tweede = await alsBeheerder('post', '/').send({
        eventType: 'concert',
        eventId: concertId,
        eventDate: '2026-11-14',
        instrumentId: trompet.id,
      });
      expect(tweede.status).toBe(201);
    });

    it('houdt een gewoon lid van het aanmaken af', async () => {
      const antwoord = await alsLid('post', '/').send({
        eventType: 'concert',
        eventId: maakConcert(),
        eventDate: '2026-11-14',
        instrumentId: trompet.id,
      });
      expect(antwoord.status).toBe(403);
    });
  });

  describe('overzicht en filters', () => {
    it('toont geen verzoek van een andere vereniging', async () => {
      await maakVerzoek();
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const maker = createTestUser(andere.id, { email: `inval-${uuidv4()}@test.nl`, role: 'admin' });
      db.prepare(
        `INSERT INTO replacement_requests (id, association_id, event_type, event_id, event_date, instrument_id, created_by)
         VALUES (?, ?, 'concert', ?, '2026-11-14', ?, ?)`,
      ).run(uuidv4(), andere.id, maakConcert(andere.id), trompet.id, maker.id);

      const antwoord = await alsLid('get', '/');
      expect(antwoord.body).toHaveLength(1);
    });

    it('filtert op urgentie en op status', async () => {
      await maakVerzoek({ urgency: 'critical' });
      const tweede = await maakVerzoek({ eventId: maakConcert(), urgency: 'low' });
      await alsBeheerder('delete', `/${tweede.id}`);

      expect((await alsLid('get', '/?urgency=critical')).body).toHaveLength(1);
      expect((await alsLid('get', '/?status=cancelled')).body).toHaveLength(1);
    });

    it('telt de uitnodigingen bij het verzoek', async () => {
      const { id } = await maakVerzoek();
      await nodigUit(id, maakMuzikant());

      const antwoord = await alsLid('get', '/');
      expect(antwoord.body[0]).toMatchObject({ assignmentCount: 1, confirmedCount: 0 });
    });

    it('geeft 404 voor een verzoek van een andere vereniging', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const maker = createTestUser(andere.id, { email: `inval2-${uuidv4()}@test.nl`, role: 'admin' });
      const vreemd = uuidv4();
      db.prepare(
        `INSERT INTO replacement_requests (id, association_id, event_type, event_id, event_date, instrument_id, created_by)
         VALUES (?, ?, 'concert', ?, '2026-11-14', ?, ?)`,
      ).run(vreemd, andere.id, maakConcert(andere.id), trompet.id, maker.id);

      expect((await alsLid('get', `/${vreemd}`)).status).toBe(404);
    });
  });

  describe('bijwerken en annuleren', () => {
    it('werkt urgentie en notitie bij', async () => {
      const { id } = await maakVerzoek();

      const antwoord = await alsBeheerder('put', `/${id}`).send({ urgency: 'high', notes: 'Wordt lastig' });
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);

      const na = await alsLid('get', `/${id}`);
      expect(na.body).toMatchObject({ urgency: 'high', notes: 'Wordt lastig' });
    });

    it('werkt geen verzoek van een andere vereniging bij', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const maker = createTestUser(andere.id, { email: `inval3-${uuidv4()}@test.nl`, role: 'admin' });
      const vreemd = uuidv4();
      db.prepare(
        `INSERT INTO replacement_requests (id, association_id, event_type, event_id, event_date, instrument_id, created_by)
         VALUES (?, ?, 'concert', ?, '2026-11-14', ?, ?)`,
      ).run(vreemd, andere.id, maakConcert(andere.id), trompet.id, maker.id);

      expect((await alsBeheerder('put', `/${vreemd}`).send({ urgency: 'low' })).status).toBe(404);
    });

    it('annuleert een verzoek zonder de rij weg te gooien', async () => {
      const { id } = await maakVerzoek();

      expect((await alsBeheerder('delete', `/${id}`)).status).toBe(200);
      expect(verzoekRij(id).status).toBe('cancelled');
    });

    it('annuleert geen verzoek van een andere vereniging', async () => {
      expect((await alsBeheerder('delete', `/${uuidv4()}`)).status).toBe(404);
    });
  });

  describe('muzikanten uitnodigen', () => {
    it('nodigt een muzikant uit', async () => {
      const { id } = await maakVerzoek();
      const muzikantId = maakMuzikant();

      const antwoord = await nodigUit(id, muzikantId);
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);

      const verzoek = await alsLid('get', `/${id}`);
      expect(verzoek.body.assignments).toHaveLength(1);
      expect(verzoek.body.assignments[0]).toMatchObject({ firstName: 'Sanne', status: 'pending' });
    });

    it('nodigt dezelfde muzikant niet twee keer uit', async () => {
      const { id } = await maakVerzoek();
      const muzikantId = maakMuzikant();
      await nodigUit(id, muzikantId);

      expect((await nodigUit(id, muzikantId)).status).toBe(409);
    });

    it('nodigt niemand uit voor een geannuleerd verzoek', async () => {
      const { id } = await maakVerzoek();
      await alsBeheerder('delete', `/${id}`);

      expect((await nodigUit(id, maakMuzikant())).status).toBe(400);
    });

    it('nodigt geen muzikant van een andere vereniging uit', async () => {
      const { id } = await maakVerzoek();
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });

      expect((await nodigUit(id, maakMuzikant({ association_id: andere.id }))).status).toBe(404);
    });

    it('nodigt geen muzikant uit die niet meer actief is', async () => {
      const { id } = await maakVerzoek();

      expect((await nodigUit(id, maakMuzikant({ is_active: 0 }))).status).toBe(404);
    });

    it('meldt dat er geen e-mail uitgaat', async () => {
      const { id } = await maakVerzoek();
      const antwoord = await nodigUit(id, maakMuzikant());

      expect(antwoord.body.message).toContain('handmatig');
    });
  });

  describe('de bezettingstelling', () => {
    async function verzoekMetTweeUitnodigingen(positionsNeeded = 1) {
      const { id } = await maakVerzoek({ positionsNeeded });
      const eerste = await nodigUit(id, maakMuzikant());
      const tweede = await nodigUit(id, maakMuzikant({ first_name: 'Pim' }));
      return { id, eerste: eerste.body.id as string, tweede: tweede.body.id as string };
    }

    it('zet het verzoek op gevuld zodra er genoeg toezeggingen zijn', async () => {
      const { id, eerste } = await verzoekMetTweeUitnodigingen();

      const antwoord = await alsBeheerder('put', `/${id}/assignments/${eerste}`).send({ status: 'confirmed' });
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);

      expect(verzoekRij(id)).toMatchObject({ status: 'filled', positions_filled: 1 });
    });

    it('zet het verzoek op deels gevuld bij te weinig toezeggingen', async () => {
      const { id, eerste } = await verzoekMetTweeUitnodigingen(2);
      await alsBeheerder('put', `/${id}/assignments/${eerste}`).send({ status: 'confirmed' });

      expect(verzoekRij(id)).toMatchObject({ status: 'partially_filled', positions_filled: 1 });
    });

    it('zet het verzoek weer open als de toezegging wordt ingetrokken', async () => {
      const { id, eerste } = await verzoekMetTweeUitnodigingen();
      await alsBeheerder('put', `/${id}/assignments/${eerste}`).send({ status: 'confirmed' });
      expect(verzoekRij(id).status).toBe('filled');

      // Hier ging het mis: de telling werd alleen bijgewerkt bij 'confirmed',
      // dus na een afzegging bleef het verzoek op 'filled' staan.
      await alsBeheerder('put', `/${id}/assignments/${eerste}`).send({ status: 'declined' });

      expect(verzoekRij(id)).toMatchObject({ status: 'open', positions_filled: 0 });
    });

    it('telt terug naar deels gevuld als een van de twee afzegt', async () => {
      const { id, eerste, tweede } = await verzoekMetTweeUitnodigingen(2);
      await alsBeheerder('put', `/${id}/assignments/${eerste}`).send({ status: 'confirmed' });
      await alsBeheerder('put', `/${id}/assignments/${tweede}`).send({ status: 'confirmed' });
      expect(verzoekRij(id).status).toBe('filled');

      await alsBeheerder('put', `/${id}/assignments/${tweede}`).send({ status: 'declined' });

      expect(verzoekRij(id)).toMatchObject({ status: 'partially_filled', positions_filled: 1 });
    });

    it('laat een geannuleerd verzoek geannuleerd', async () => {
      const { id, eerste } = await verzoekMetTweeUitnodigingen();
      await alsBeheerder('delete', `/${id}`);

      await alsBeheerder('put', `/${id}/assignments/${eerste}`).send({ status: 'confirmed' });

      expect(verzoekRij(id).status).toBe('cancelled');
    });

    it('noteert wanneer er is gereageerd', async () => {
      const { id, eerste } = await verzoekMetTweeUitnodigingen();
      await alsBeheerder('put', `/${id}/assignments/${eerste}`).send({ status: 'confirmed' });

      const rij = db.prepare('SELECT responded_at FROM replacement_assignments WHERE id = ?').get(eerste) as {
        responded_at: string | null;
      };
      expect(rij.responded_at).not.toBeNull();
    });

    it('telt een optreden mee bij de muzikant zodra het is afgerond', async () => {
      const { id } = await maakVerzoek();
      const muzikantId = maakMuzikant();
      const uitnodiging = await nodigUit(id, muzikantId);

      await alsBeheerder('put', `/${id}/assignments/${uitnodiging.body.id}`).send({ status: 'completed' });

      const rij = db
        .prepare('SELECT total_performances, last_played_date FROM external_musicians WHERE id = ?')
        .get(muzikantId) as { total_performances: number; last_played_date: string };
      expect(rij).toMatchObject({ total_performances: 1, last_played_date: '2026-11-14' });
    });

    it('legt het afgesproken bedrag vast', async () => {
      const { id, eerste } = await verzoekMetTweeUitnodigingen();

      await alsBeheerder('put', `/${id}/assignments/${eerste}`).send({ status: 'confirmed', feeAmount: 75 });

      const verzoek = await alsLid('get', `/${id}`);
      const uitnodiging = verzoek.body.assignments.find((a: { id: string }) => a.id === eerste);
      expect(uitnodiging.feeAmount).toBe(75);
    });

    it('weigert een status die niet bestaat', async () => {
      const { id, eerste } = await verzoekMetTweeUitnodigingen();
      expect((await alsBeheerder('put', `/${id}/assignments/${eerste}`).send({ status: 'misschien' })).status).toBe(
        400,
      );
    });

    it('geeft 404 voor een uitnodiging die niet bij dit verzoek hoort', async () => {
      const { id } = await verzoekMetTweeUitnodigingen();
      expect((await alsBeheerder('put', `/${id}/assignments/${uuidv4()}`).send({ status: 'confirmed' })).status).toBe(
        404,
      );
    });

    it('werkt geen uitnodiging bij via een verzoek van een andere vereniging', async () => {
      const { id, eerste } = await verzoekMetTweeUitnodigingen();
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const andereBeheerder = createTestUser(andere.id, { email: `inv-${uuidv4()}@test.nl`, role: 'admin' });

      const antwoord = await request(app)
        .put(`/api/replacement-requests/${id}/assignments/${eerste}`)
        .set('Authorization', `Bearer ${generateTestToken(andereBeheerder)}`)
        .send({ status: 'confirmed' });

      expect(antwoord.status).toBe(404);
    });
  });

  describe('voorstellen', () => {
    it('stelt muzikanten voor die dit instrument spelen', async () => {
      const { id, concertId } = await maakVerzoek();
      expect(id).toBeTruthy();
      maakMuzikant();
      maakMuzikant({ first_name: 'Pim' });

      const antwoord = await alsLid('get', `/suggestions/${concertId}`);
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      expect(antwoord.body).toHaveLength(1);
      expect(antwoord.body[0].suggestedMusicians).toHaveLength(2);
    });

    it('laat een muzikant weg die al is uitgenodigd', async () => {
      const { id, concertId } = await maakVerzoek();
      const muzikantId = maakMuzikant();
      maakMuzikant({ first_name: 'Pim' });
      await nodigUit(id, muzikantId);

      const antwoord = await alsLid('get', `/suggestions/${concertId}`);
      expect(antwoord.body[0].suggestedMusicians.map((m: { firstName: string }) => m.firstName)).toEqual(['Pim']);
    });

    it('laat een muzikant weg die dit instrument niet speelt', async () => {
      const { concertId } = await maakVerzoek();
      const hoorn = createTestInstrument({ name: `Hoorn-${uuidv4().slice(0, 8)}` });
      maakMuzikant({ first_name: 'Alleen hoorn', instrument_id: hoorn.id });

      const antwoord = await alsLid('get', `/suggestions/${concertId}`);
      expect(antwoord.body[0].suggestedMusicians).toEqual([]);
    });

    it('laat een muzikant weg die niet meer actief is', async () => {
      const { concertId } = await maakVerzoek();
      maakMuzikant({ is_active: 0 });

      const antwoord = await alsLid('get', `/suggestions/${concertId}`);
      expect(antwoord.body[0].suggestedMusicians).toEqual([]);
    });

    it('stelt niets voor als het verzoek al gevuld is', async () => {
      const { id, concertId } = await maakVerzoek();
      const uitnodiging = await nodigUit(id, maakMuzikant());
      await alsBeheerder('put', `/${id}/assignments/${uitnodiging.body.id}`).send({ status: 'confirmed' });

      const antwoord = await alsLid('get', `/suggestions/${concertId}`);
      expect(antwoord.body).toEqual([]);
    });

    it('stelt niets voor bij een concert van een andere vereniging', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      expect((await alsLid('get', `/suggestions/${maakConcert(andere.id)}`)).body).toEqual([]);
    });
  });

  it('vraagt overal om een geldige aanmelding', async () => {
    expect(lid.id).toBeTruthy();
    expect((await request(app).get('/api/replacement-requests')).status).toBe(401);
    expect((await request(app).post('/api/replacement-requests').send({})).status).toBe(401);
  });
});
