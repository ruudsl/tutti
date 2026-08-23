/**
 * Concerten: de foutpaden, de verenigingsgrens en de afgeleide gegevens.
 *
 * Het bestaande concerts.test.ts controleert vooral of een route bestaat en of
 * hij authenticatie eist; grote stukken van de route bleven ongelezen. Dit
 * bestand pakt de rest: het beheer van de concertsoorten, de statistiek, de
 * opkomstvoorspelling, het programma met een set, de export van dat programma,
 * de media, de bezetting en de gescande kaarten.
 *
 * De rode draad is telkens dezelfde vraag: wat gebeurt er bij een concert van
 * een andere vereniging. Een geneste bron (programma-item, media, bezetting)
 * hoort niet bereikbaar te zijn via de eigen vereniging, en een lid van een
 * andere vereniging hoort niet in de eigen bezetting te belanden.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import concertsRoutes from '../../routes/concerts';
import { errorHandler } from '../../middleware/errorHandler';
import {
  createTestEnvironment,
  createTestAssociation,
  createTestUser,
  createTestInstrument,
  addInstrumentToUser,
  generateTestToken,
  TestAssociation,
  TestUser,
} from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api/concerts', concertsRoutes);
app.use(errorHandler);

let vereniging: TestAssociation;
let beheerder: TestUser;
let beheerderToken: string;
let lid: TestUser;
let lidToken: string;
let muziekcommissieToken: string;

let andereVereniging: TestAssociation;
let andereBeheerder: TestUser;
let andereBeheerderToken: string;

beforeEach(() => {
  const omgeving = createTestEnvironment();
  vereniging = omgeving.association;
  beheerder = omgeving.adminUser;
  beheerderToken = omgeving.adminToken;
  lid = omgeving.memberUser;
  lidToken = omgeving.memberToken;
  muziekcommissieToken = omgeving.musicCommitteeToken;

  andereVereniging = createTestAssociation({ name: 'Fanfare Elders' });
  andereBeheerder = createTestUser(andereVereniging.id, {
    email: 'beheerder@elders.test',
    firstName: 'Elders',
    lastName: 'Beheerder',
    role: 'admin',
  });
  andereBeheerderToken = generateTestToken(andereBeheerder);
});

const alsBeheerder = (methode: 'get' | 'post' | 'put' | 'delete', pad: string) =>
  request(app)[methode](`/api/concerts${pad}`).set('Authorization', `Bearer ${beheerderToken}`);

const alsLid = (methode: 'get' | 'post' | 'put' | 'delete', pad: string) =>
  request(app)[methode](`/api/concerts${pad}`).set('Authorization', `Bearer ${lidToken}`);

const alsVreemde = (methode: 'get' | 'post' | 'put' | 'delete', pad: string) =>
  request(app)[methode](`/api/concerts${pad}`).set('Authorization', `Bearer ${andereBeheerderToken}`);

/** Zet een concert rechtstreeks in de database, ook voor een andere vereniging. */
function maakConcert(
  associationId: string,
  createdBy: string | null,
  overschrijf: Partial<{ id: string; name: string; date: string; location: string; concertType: string }> = {},
): string {
  const id = overschrijf.id ?? uuidv4();
  db.prepare(
    `INSERT INTO concerts (id, association_id, name, date, location, concert_type, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    associationId,
    overschrijf.name ?? 'Testconcert',
    overschrijf.date ?? '2026-05-01',
    overschrijf.location ?? 'De Harmonie',
    overschrijf.concertType ?? 'concert',
    createdBy,
  );
  return id;
}

function maakProgrammaItem(
  concertId: string,
  overschrijf: Partial<{ id: string; title: string; arranger: string; sortOrder: number; partOfSet: string }> = {},
): string {
  const id = overschrijf.id ?? uuidv4();
  db.prepare(
    `INSERT INTO concert_program (id, concert_id, title, arranger, sort_order, part_of_set)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    concertId,
    overschrijf.title ?? 'Ouverture',
    overschrijf.arranger ?? null,
    overschrijf.sortOrder ?? 0,
    overschrijf.partOfSet ?? null,
  );
  return id;
}

function maakBezetting(concertId: string, memberName: string, userId: string | null = null): string {
  const id = uuidv4();
  db.prepare(
    `INSERT INTO concert_attendance (id, concert_id, user_id, member_name, instrument_played)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(id, concertId, userId, memberName, 'Trompet');
  return id;
}

// ===========================================
// CONCERTSOORTEN
// ===========================================

describe('concertsoorten', () => {
  it('houdt de beheerslijst weg bij een gewoon lid', async () => {
    const res = await alsLid('get', '/concert-types');
    expect(res.status).toBe(403);
  });

  it('geeft de eigen soorten plus de standaardlijst terug', async () => {
    const aangemaakt = await alsBeheerder('post', '/concert-types').send({
      value: 'matinee',
      label: 'Matineeconcert',
      sortOrder: 3,
    });
    expect(aangemaakt.status).toBe(201);

    const res = await alsBeheerder('get', '/concert-types');
    expect(res.status).toBe(200);
    expect(res.body.types).toHaveLength(1);
    expect(res.body.types[0]).toMatchObject({ value: 'matinee', label: 'Matineeconcert', sortOrder: 3 });
    expect(res.body.defaults.length).toBeGreaterThan(0);
  });

  it('weigert een soort zonder waarde of etiket', async () => {
    const zonderWaarde = await alsBeheerder('post', '/concert-types').send({ label: 'Alleen etiket' });
    expect(zonderWaarde.status).toBe(400);

    const zonderEtiket = await alsBeheerder('post', '/concert-types').send({ value: 'alleen-waarde' });
    expect(zonderEtiket.status).toBe(400);
  });

  it('weigert twee soorten met dezelfde waarde binnen een vereniging', async () => {
    await alsBeheerder('post', '/concert-types').send({ value: 'matinee', label: 'Matinee' });
    const tweede = await alsBeheerder('post', '/concert-types').send({ value: 'matinee', label: 'Andere naam' });
    expect(tweede.status).toBe(409);
  });

  it('laat dezelfde waarde wel toe bij een andere vereniging', async () => {
    await alsBeheerder('post', '/concert-types').send({ value: 'matinee', label: 'Matinee' });
    const elders = await alsVreemde('post', '/concert-types').send({ value: 'matinee', label: 'Matinee' });
    expect(elders.status).toBe(201);
  });

  it('werkt een soort bij en laat de rest staan', async () => {
    const gemaakt = await alsBeheerder('post', '/concert-types').send({ value: 'matinee', label: 'Matinee' });

    const res = await alsBeheerder('put', `/concert-types/${gemaakt.body.id}`).send({ label: 'Matineeconcert' });
    expect(res.status).toBe(200);

    const lijst = await alsBeheerder('get', '/concert-types');
    expect(lijst.body.types[0]).toMatchObject({ value: 'matinee', label: 'Matineeconcert' });
  });

  it('werkt de soort van een andere vereniging niet bij', async () => {
    const gemaakt = await alsBeheerder('post', '/concert-types').send({ value: 'matinee', label: 'Matinee' });

    const res = await alsVreemde('put', `/concert-types/${gemaakt.body.id}`).send({ label: 'Gekaapt' });
    expect(res.status).toBe(404);

    const lijst = await alsBeheerder('get', '/concert-types');
    expect(lijst.body.types[0].label).toBe('Matinee');
  });

  it('weigert een wijziging naar een waarde die al bezet is', async () => {
    await alsBeheerder('post', '/concert-types').send({ value: 'matinee', label: 'Matinee' });
    const tweede = await alsBeheerder('post', '/concert-types').send({ value: 'serenade', label: 'Serenade' });

    const res = await alsBeheerder('put', `/concert-types/${tweede.body.id}`).send({ value: 'matinee' });
    expect(res.status).toBe(409);
  });

  it('verwijdert alleen een eigen soort', async () => {
    const gemaakt = await alsBeheerder('post', '/concert-types').send({ value: 'matinee', label: 'Matinee' });

    const vreemd = await alsVreemde('delete', `/concert-types/${gemaakt.body.id}`);
    expect(vreemd.status).toBe(404);

    const eigen = await alsBeheerder('delete', `/concert-types/${gemaakt.body.id}`);
    expect(eigen.status).toBe(200);

    const nogmaals = await alsBeheerder('delete', `/concert-types/${gemaakt.body.id}`);
    expect(nogmaals.status).toBe(404);
  });

  it('zet de standaardsoorten klaar, maar maar een keer', async () => {
    const eerste = await alsBeheerder('post', '/concert-types/init-defaults').send({});
    expect(eerste.status).toBe(201);

    const lijst = await alsBeheerder('get', '/concert-types');
    expect(lijst.body.types.length).toBeGreaterThan(5);

    const tweede = await alsBeheerder('post', '/concert-types/init-defaults').send({});
    expect(tweede.status).toBe(400);
  });

  it('toont de standaardlijst zolang er geen eigen soorten zijn, en daarna de eigen', async () => {
    const standaard = await alsLid('get', '/types');
    expect(standaard.status).toBe(200);
    expect(standaard.body.concertTypes.map((t: any) => t.value)).toContain('christmas');
    expect(standaard.body.mediaTypes.map((t: any) => t.value)).toContain('poster');

    await alsBeheerder('post', '/concert-types').send({ value: 'matinee', label: 'Matinee' });

    const eigen = await alsLid('get', '/types');
    expect(eigen.body.concertTypes).toEqual([{ value: 'matinee', label: 'Matinee' }]);
  });
});

// ===========================================
// STATISTIEK EN JAREN
// ===========================================

describe('statistiek', () => {
  it('telt alleen de eigen concerten en negeert verwijderde', async () => {
    const eersteId = maakConcert(vereniging.id, beheerder.id, { date: '2025-03-01', concertType: 'christmas' });
    maakConcert(vereniging.id, beheerder.id, { date: '2026-03-01', concertType: 'christmas' });
    maakConcert(andereVereniging.id, andereBeheerder.id, { date: '2026-03-01', concertType: 'christmas' });

    const verwijderdId = maakConcert(vereniging.id, beheerder.id, { date: '2024-01-01' });
    db.prepare('UPDATE concerts SET deleted_at = ? WHERE id = ?').run(new Date().toISOString(), verwijderdId);

    maakProgrammaItem(eersteId, { title: 'Mars der Medici' });
    maakProgrammaItem(eersteId, { title: 'mars der medici', sortOrder: 1 });

    const res = await alsLid('get', '/statistics');
    expect(res.status).toBe(200);
    expect(res.body.totalConcerts).toBe(2);
    expect(res.body.concertsPerYear).toEqual(
      expect.arrayContaining([
        { year: '2026', count: 1 },
        { year: '2025', count: 1 },
      ]),
    );
    // Twee keer hetzelfde stuk, alleen anders geschreven, telt als een stuk.
    expect(res.body.mostPlayedPieces).toHaveLength(1);
    expect(res.body.mostPlayedPieces[0].playCount).toBe(2);
    expect(res.body.concertsPerType).toEqual([{ type: 'christmas', count: 2 }]);
  });

  it('geeft de jaren met concerten, aflopend en zonder de verwijderde', async () => {
    maakConcert(vereniging.id, beheerder.id, { date: '2024-06-01' });
    maakConcert(vereniging.id, beheerder.id, { date: '2026-06-01' });
    maakConcert(andereVereniging.id, andereBeheerder.id, { date: '2019-06-01' });

    const weg = maakConcert(vereniging.id, beheerder.id, { date: '2021-06-01' });
    db.prepare('UPDATE concerts SET deleted_at = ? WHERE id = ?').run(new Date().toISOString(), weg);

    const res = await alsLid('get', '/years');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(['2026', '2024']);
  });
});

// ===========================================
// OPKOMSTVOORSPELLING
// ===========================================

describe('opkomstvoorspelling', () => {
  it('is niet voor een gewoon lid', async () => {
    const id = maakConcert(vereniging.id, beheerder.id);
    const res = await alsLid('get', `/${id}/attendance-prediction`);
    expect(res.status).toBe(403);
  });

  it('geeft 404 voor een onbekend concert', async () => {
    const res = await alsBeheerder('get', `/${uuidv4()}/attendance-prediction`);
    expect(res.status).toBe(404);
  });

  it('geeft 404 voor een concert van een andere vereniging', async () => {
    const id = maakConcert(andereVereniging.id, andereBeheerder.id);
    const res = await alsBeheerder('get', `/${id}/attendance-prediction`);
    expect(res.status).toBe(404);
  });

  it('rekent met de eigen geschiedenis van elk lid', async () => {
    const trompet = createTestInstrument({ name: 'Trompet' });
    addInstrumentToUser(lid.id, trompet.id);

    // Drie concerten in het verleden, met dezelfde soort en dezelfde weekdag
    // als het concert waarvoor we voorspellen, zodat alle drie de
    // bijstellingen (soort, dag, seizoen) gegevens hebben om mee te rekenen.
    for (const datum of ['2020-05-02', '2021-05-01', '2022-05-07']) {
      const oud = maakConcert(vereniging.id, beheerder.id, { date: datum, concertType: 'concert' });
      maakBezetting(oud, `${lid.firstName} ${lid.lastName}`, lid.id);
    }

    // Het concert waarvoor we voorspellen ligt in de toekomst en moet dat ook
    // blijven: de teller van "concerten tot nu toe" kijkt naar date('now'),
    // dus een datum die intussen verstreken is telt zichzelf mee en verandert
    // elke uitkomst hieronder.
    const komend = maakConcert(vereniging.id, beheerder.id, { date: '2035-05-05', concertType: 'concert' });

    const res = await alsBeheerder('get', `/${komend}/attendance-prediction`);
    expect(res.status).toBe(200);
    expect(res.body.concert.id).toBe(komend);
    expect(res.body.prediction.totalMembers).toBe(3);
    expect(res.body.members).toHaveLength(3);

    const voorspeldLid = res.body.members.find((m: any) => m.memberId === lid.id);
    expect(voorspeldLid.instrument).toBe('Trompet');
    // Dit lid was er bij alle drie de concerten uit het verleden, dus de kans
    // hoort hoog te zijn.
    expect(voorspeldLid.totalConcerts).toBe(3);
    expect(voorspeldLid.attendedConcerts).toBe(3);
    expect(voorspeldLid.attendanceProbability).toBeGreaterThanOrEqual(0.8);

    // Alle drie de bijstellingen hebben gegevens, dus alle drie horen ze in de
    // toelichting te staan.
    expect(voorspeldLid.factors.map((f: any) => f.name)).toEqual([
      'Concert type: concert',
      'Dag: zaterdag',
      'Seizoen: Q2 (apr-jun)',
    ]);

    // Een lid dat er nooit bij was zit lager.
    const onbekend = res.body.members.find((m: any) => m.memberId !== lid.id);
    expect(onbekend.attendedConcerts).toBe(0);
    expect(onbekend.attendanceProbability).toBeLessThan(voorspeldLid.attendanceProbability);
    expect(onbekend.instrument).toBeNull();

    // De verdeling per instrument bevat zowel de trompet als de restgroep.
    const instrumenten = res.body.prediction.byInstrument.map((i: any) => i.instrument);
    expect(instrumenten).toContain('Trompet');
    expect(instrumenten).toContain('Onbekend');
  });

  it('laat inactieve leden buiten de voorspelling', async () => {
    db.prepare("UPDATE users SET status = 'inactive' WHERE id = ?").run(lid.id);

    const id = maakConcert(vereniging.id, beheerder.id, { date: '2026-05-02' });
    const res = await alsBeheerder('get', `/${id}/attendance-prediction`);

    expect(res.status).toBe(200);
    expect(res.body.members.map((m: any) => m.memberId)).not.toContain(lid.id);
    expect(res.body.prediction.totalMembers).toBe(2);
  });
});

// ===========================================
// STUKGESCHIEDENIS
// ===========================================

describe('stukgeschiedenis', () => {
  it('vindt een stuk ongeacht hoofdletters en zet het nieuwste vooraan', async () => {
    const oud = maakConcert(vereniging.id, beheerder.id, { date: '2020-01-01', name: 'Oud concert' });
    const nieuw = maakConcert(vereniging.id, beheerder.id, { date: '2024-01-01', name: 'Nieuw concert' });
    maakProgrammaItem(oud, { title: 'Mars der Medici' });
    maakProgrammaItem(nieuw, { title: 'MARS DER MEDICI' });

    const res = await alsLid('get', `/piece-history/${encodeURIComponent('mars der medici')}`);
    expect(res.status).toBe(200);
    expect(res.body.playCount).toBe(2);
    expect(res.body.lastPlayed).toBe('2024-01-01');
    expect(res.body.history[0].concertName).toBe('Nieuw concert');
  });

  it('telt het stuk van een andere vereniging niet mee', async () => {
    const elders = maakConcert(andereVereniging.id, andereBeheerder.id);
    maakProgrammaItem(elders, { title: 'Geheime Mars' });

    const res = await alsLid('get', `/piece-history/${encodeURIComponent('Geheime Mars')}`);
    expect(res.status).toBe(200);
    expect(res.body.playCount).toBe(0);
    expect(res.body.lastPlayed).toBeNull();
  });
});

// ===========================================
// BUMA/STEMRA-EXPORT
// ===========================================

describe('buma/stemra-export', () => {
  it('valt zonder datums terug op het afgelopen jaar', async () => {
    const vandaag = new Date();
    const binnenBereik = new Date(vandaag.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const buitenBereik = '2000-01-01';

    const recent = maakConcert(vereniging.id, beheerder.id, { date: binnenBereik, name: 'Recent' });
    const oud = maakConcert(vereniging.id, beheerder.id, { date: buitenBereik, name: 'Lang geleden' });
    maakProgrammaItem(recent, { title: 'Recent stuk' });
    maakProgrammaItem(oud, { title: 'Oud stuk' });

    const res = await alsLid('get', '/buma-stemra-export');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Recent stuk');
    expect(res.text).not.toContain('Oud stuk');
    expect(res.text).toContain('Totaal stukken,1');
  });

  it('vult de speelduur uit de muziektitel aan en telt hem op', async () => {
    const titelId = uuidv4();
    db.prepare(
      `INSERT INTO music_titles (id, title, composer, arranger, duration_seconds, association_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(titelId, 'Fanfare', 'Componist', 'Arrangeur', 125, vereniging.id);

    const concertId = maakConcert(vereniging.id, beheerder.id, { date: '2026-02-01' });
    db.prepare(
      `INSERT INTO concert_program (id, concert_id, music_title_id, title, sort_order)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(uuidv4(), concertId, titelId, 'Fanfare', 0);

    const res = await alsLid('get', '/buma-stemra-export?startDate=2026-01-01&endDate=2026-12-31');
    expect(res.status).toBe(200);
    // 125 seconden is 2:05, en dat is ook de totale speelduur.
    expect(res.text).toContain('2:05');
    expect(res.text).toContain('Totale speelduur,2:05');
    // Componist en arrangeur komen uit de muziektitel als het programma-item
    // ze zelf niet heeft.
    expect(res.text).toContain('Componist');
    expect(res.text).toContain('Arrangeur');
  });

  it('exporteert de concerten van een andere vereniging niet', async () => {
    const elders = maakConcert(andereVereniging.id, andereBeheerder.id, { date: '2026-02-01' });
    maakProgrammaItem(elders, { title: 'Stuk van elders' });

    const res = await alsLid('get', '/buma-stemra-export?startDate=2026-01-01&endDate=2026-12-31');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Stuk van elders');
    expect(res.text).toContain('Totaal stukken,0');
  });

  it('overleeft een onzinnige datum in de queryreeks', async () => {
    maakConcert(vereniging.id, beheerder.id, { date: '2026-02-01' });

    // Er zit geen datumcontrole tussen req.query en de query, dus dit belandt
    // ongefilterd in de SQL-parameter, in de samenvatting en in de
    // bestandsnaam. Een lege export is een prima antwoord; een 500 niet.
    const res = await alsLid('get', '/buma-stemra-export?startDate=geen-datum&endDate=ook-niet');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Totaal stukken,0');
  });

  it('overleeft een datum die twee keer wordt meegegeven', async () => {
    maakConcert(vereniging.id, beheerder.id, { date: '2026-02-01' });

    // WACHT, geen bewijs: op de oude code was dit ook groen. `req.query
    // .startDate as string` liegt hier wel - bij twee keer dezelfde parameter
    // geeft Express een array - maar sql.js bindt een array als blob in plaats
    // van te weigeren. Het antwoord was dus 200, met een stilzwijgend lege
    // aangifte en "2026-01-01,2026-03-01" in de periode-regel. Deze test staat
    // er om de statuscode vast te leggen; de vorm hieronder is het bewijs.
    const res = await alsLid('get', '/buma-stemra-export?startDate=2026-01-01&startDate=2026-03-01');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Periode,');
  });

  it('overleeft een datum die als object wordt meegegeven', async () => {
    maakConcert(vereniging.id, beheerder.id, { date: '2026-02-01' });

    // BEWIJS. De uitgebreide queryparser van Express maakt van `startDate[x]=1`
    // een object. Dat object ging ongecontroleerd naar de SQL-binding, en
    // sql.js weigert een object als parameter ("tried to bind a value of an
    // unknown type"). De gebruiker kreeg daardoor een foutmelding 500 in plaats
    // van zijn aangifte. Zonder de controle in de route faalt deze test met
    // status 500; nagemeten met de methode uit de opdracht (eigen bestand
    // opzij, `git checkout HEAD -- src/routes/concerts.ts`, test gedraaid,
    // bestand teruggezet).
    const res = await alsLid('get', '/buma-stemra-export?startDate[x]=1');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Periode,');
  });
});

// ===========================================
// LIJST, DETAIL EN LEVENSLOOP
// ===========================================

describe('concertlijst', () => {
  it('filtert op zoekterm, jaar en soort', async () => {
    maakConcert(vereniging.id, beheerder.id, { name: 'Kerstconcert', date: '2025-12-20', concertType: 'christmas' });
    maakConcert(vereniging.id, beheerder.id, { name: 'Zomerconcert', date: '2026-07-01', concertType: 'summer' });
    maakConcert(vereniging.id, beheerder.id, {
      name: 'Nieuwjaarsconcert',
      date: '2026-01-05',
      concertType: 'new_year',
    });

    const opNaam = await alsLid('get', '/?search=kerst');
    expect(opNaam.status).toBe(200);
    expect(opNaam.body.data).toHaveLength(1);
    expect(opNaam.body.data[0].name).toBe('Kerstconcert');

    const opLocatie = await alsLid('get', '/?search=harmonie');
    expect(opLocatie.body.data).toHaveLength(3);

    const opJaar = await alsLid('get', '/?year=2026');
    expect(opJaar.body.data).toHaveLength(2);

    const opSoort = await alsLid('get', '/?concertType=summer');
    expect(opSoort.body.data).toHaveLength(1);
    expect(opSoort.body.data[0].concertType).toBe('summer');
  });

  it('toont de toegankelijkheidsvlag alleen als er iets is ingevuld', async () => {
    const kaal = maakConcert(vereniging.id, beheerder.id, { name: 'Kaal' });
    const uitgebreid = maakConcert(vereniging.id, beheerder.id, { name: 'Uitgebreid' });
    db.prepare('UPDATE concerts SET wheelchair_spaces = 4, hearing_loop_available = 1 WHERE id = ?').run(uitgebreid);

    const res = await alsLid('get', '/?search=');
    expect(res.status).toBe(200);

    const rijen: Record<string, any> = {};
    for (const rij of res.body.data) rijen[rij.id] = rij;

    expect(rijen[kaal].hasAccessibilityInfo).toBe(false);
    expect(rijen[kaal].hearingLoopAvailable).toBe(false);
    expect(rijen[uitgebreid].hasAccessibilityInfo).toBe(true);
    expect(rijen[uitgebreid].hearingLoopAvailable).toBe(true);
    expect(rijen[uitgebreid].wheelchairSpaces).toBe(4);
  });

  it('telt het programma, de media en de bezetting per concert mee', async () => {
    const id = maakConcert(vereniging.id, beheerder.id);
    maakProgrammaItem(id, { title: 'Een' });
    maakProgrammaItem(id, { title: 'Twee', sortOrder: 1 });
    maakBezetting(id, 'Jan de Vries');
    db.prepare('INSERT INTO concert_media (id, concert_id, media_type, url) VALUES (?, ?, ?, ?)').run(
      uuidv4(),
      id,
      'photo',
      'https://voorbeeld.test/foto.jpg',
    );

    const res = await alsLid('get', '/');
    const rij = res.body.data.find((c: any) => c.id === id);
    expect(rij.programCount).toBe(2);
    expect(rij.attendanceCount).toBe(1);
    expect(rij.mediaCount).toBe(1);
    expect(rij.createdBy).toMatchObject({ id: beheerder.id, firstName: 'Admin' });
  });

  it('laat createdBy leeg als de maker niet meer bestaat', async () => {
    const id = maakConcert(vereniging.id, null);

    const res = await alsLid('get', '/');
    const rij = res.body.data.find((c: any) => c.id === id);
    expect(rij.createdBy).toBeNull();
  });
});

describe('concertdetail', () => {
  it('geeft 404 voor een concert van een andere vereniging', async () => {
    const id = maakConcert(andereVereniging.id, andereBeheerder.id);
    const res = await alsLid('get', `/${id}`);
    expect(res.status).toBe(404);
  });

  it('geeft het programma, de media en de bezetting mee', async () => {
    const id = maakConcert(vereniging.id, beheerder.id, { name: 'Voorjaarsconcert' });

    const titelId = uuidv4();
    db.prepare(
      `INSERT INTO music_titles (id, title, composer, youtube_url, duration_seconds, association_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(titelId, 'Fanfare', 'Uit de titel', 'https://youtu.be/xyz', 90, vereniging.id);

    db.prepare(
      `INSERT INTO concert_program (id, concert_id, music_title_id, title, sort_order, part_of_set)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(uuidv4(), id, titelId, 'Fanfare', 0, 'Blok 1');

    db.prepare('INSERT INTO concert_media (id, concert_id, media_type, url, uploaded_by) VALUES (?, ?, ?, ?, ?)').run(
      uuidv4(),
      id,
      'poster',
      'https://voorbeeld.test/poster.png',
      beheerder.id,
    );
    db.prepare('INSERT INTO concert_media (id, concert_id, media_type, url) VALUES (?, ?, ?, ?)').run(
      uuidv4(),
      id,
      'video',
      'https://voorbeeld.test/video.mp4',
    );

    maakBezetting(id, `${lid.firstName} ${lid.lastName}`, lid.id);
    maakBezetting(id, 'Losse invaller', null);

    const res = await alsLid('get', `/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Voorjaarsconcert');

    expect(res.body.program).toHaveLength(1);
    // De componist staat niet op het programma-item maar op de muziektitel.
    expect(res.body.program[0]).toMatchObject({
      title: 'Fanfare',
      composer: 'Uit de titel',
      partOfSet: 'Blok 1',
      youtubeUrl: 'https://youtu.be/xyz',
      durationSeconds: 90,
    });

    expect(res.body.media).toHaveLength(2);
    const metUploader = res.body.media.find((m: any) => m.mediaType === 'poster');
    const zonderUploader = res.body.media.find((m: any) => m.mediaType === 'video');
    expect(metUploader.uploadedBy).toMatchObject({ id: beheerder.id });
    expect(zonderUploader.uploadedBy).toBeNull();

    expect(res.body.attendance).toHaveLength(2);
    const metGebruiker = res.body.attendance.find((a: any) => a.memberName !== 'Losse invaller');
    const zonderGebruiker = res.body.attendance.find((a: any) => a.memberName === 'Losse invaller');
    expect(metGebruiker.user).toMatchObject({ id: lid.id, email: lid.email });
    expect(zonderGebruiker.user).toBeNull();
  });
});

describe('concert aanmaken, wijzigen en verwijderen', () => {
  it('laat een gewoon lid geen concert aanmaken', async () => {
    const res = await alsLid('post', '/').send({ name: 'Stiekem concert', date: '2026-09-01' });
    expect(res.status).toBe(403);
  });

  it('weigert een concert zonder naam of datum', async () => {
    const zonderNaam = await alsBeheerder('post', '/').send({ name: '', date: '2026-09-01' });
    expect(zonderNaam.status).toBe(400);

    const zonderDatum = await alsBeheerder('post', '/').send({ name: 'Zonder datum' });
    expect(zonderDatum.status).toBe(400);
  });

  it('weigert een onbruikbaar contactadres bij de toegankelijkheid', async () => {
    const res = await alsBeheerder('post', '/').send({
      name: 'Concert',
      date: '2026-09-01',
      accessibilityContactEmail: 'geen adres',
    });
    expect(res.status).toBe(400);
  });

  it('maakt een concert met een datum in het verleden gewoon aan', async () => {
    // Een concert van vorig jaar is geen fout: de bezetting wordt vaak pas
    // achteraf ingevoerd. Deze test legt dat vast, zodat een latere
    // datumcontrole op het heden niet ongemerkt het archief blokkeert.
    const res = await alsBeheerder('post', '/').send({ name: 'Concert van toen', date: '2019-11-11' });
    expect(res.status).toBe(201);

    const detail = await alsLid('get', `/${res.body.id}`);
    expect(detail.body.date).toBe('2019-11-11');
  });

  it('bewaart de toegankelijkheidsgegevens', async () => {
    const res = await alsBeheerder('post', '/').send({
      name: 'Toegankelijk concert',
      date: '2026-09-01',
      wheelchairSpaces: 6,
      companionSpaces: 6,
      hearingLoopAvailable: true,
      accessibleParkingInfo: 'Naast de ingang',
      accessibilityContactEmail: 'toegang@voorbeeld.test',
    });
    expect(res.status).toBe(201);

    const detail = await alsLid('get', `/${res.body.id}`);
    expect(detail.body).toMatchObject({
      wheelchairSpaces: 6,
      companionSpaces: 6,
      hearingLoopAvailable: true,
      accessibleParkingInfo: 'Naast de ingang',
      accessibilityContactEmail: 'toegang@voorbeeld.test',
    });
  });

  it('wijzigt het concert van een andere vereniging niet', async () => {
    const id = maakConcert(andereVereniging.id, andereBeheerder.id, { name: 'Van elders' });

    const res = await alsBeheerder('put', `/${id}`).send({ name: 'Gekaapt' });
    expect(res.status).toBe(404);

    const rij = db.prepare('SELECT name FROM concerts WHERE id = ?').get(id) as any;
    expect(rij.name).toBe('Van elders');
  });

  it('laat velden die niet worden meegestuurd ongemoeid', async () => {
    const id = maakConcert(vereniging.id, beheerder.id, { name: 'Origineel', location: 'De Harmonie' });

    const res = await alsBeheerder('put', `/${id}`).send({ name: 'Nieuwe naam' });
    expect(res.status).toBe(200);

    const detail = await alsLid('get', `/${id}`);
    expect(detail.body.name).toBe('Nieuwe naam');
    expect(detail.body.location).toBe('De Harmonie');
  });

  it('laat de muziekcommissie wel wijzigen maar niet verwijderen', async () => {
    const id = maakConcert(vereniging.id, beheerder.id);

    const wijzig = await request(app)
      .put(`/api/concerts/${id}`)
      .set('Authorization', `Bearer ${muziekcommissieToken}`)
      .send({ notes: 'Aantekening van de commissie' });
    expect(wijzig.status).toBe(200);

    const verwijder = await request(app)
      .delete(`/api/concerts/${id}`)
      .set('Authorization', `Bearer ${muziekcommissieToken}`);
    expect(verwijder.status).toBe(403);
  });

  it('verwijdert zacht: het concert verdwijnt uit lijst en detail', async () => {
    const id = maakConcert(vereniging.id, beheerder.id);

    const res = await alsBeheerder('delete', `/${id}`);
    expect(res.status).toBe(200);

    const detail = await alsLid('get', `/${id}`);
    expect(detail.status).toBe(404);

    const lijst = await alsLid('get', '/');
    expect(lijst.body.data.map((c: any) => c.id)).not.toContain(id);

    // De rij bestaat nog, met een tijdstempel; de opruimer haalt hem later weg.
    const rij = db.prepare('SELECT deleted_at FROM concerts WHERE id = ?').get(id) as any;
    expect(rij.deleted_at).toBeTruthy();

    const nogmaals = await alsBeheerder('delete', `/${id}`);
    expect(nogmaals.status).toBe(404);
  });

  it('verwijdert het concert van een andere vereniging niet', async () => {
    const id = maakConcert(andereVereniging.id, andereBeheerder.id);

    const res = await alsBeheerder('delete', `/${id}`);
    expect(res.status).toBe(404);

    const rij = db.prepare('SELECT deleted_at FROM concerts WHERE id = ?').get(id) as any;
    expect(rij.deleted_at).toBeNull();
  });
});

// ===========================================
// PROGRAMMA
// ===========================================

describe('concertprogramma', () => {
  it('nummert een nieuw item achter het laatste', async () => {
    const id = maakConcert(vereniging.id, beheerder.id);

    const eerste = await alsBeheerder('post', `/${id}/program`).send({ title: 'Ouverture' });
    expect(eerste.status).toBe(201);
    const tweede = await alsBeheerder('post', `/${id}/program`).send({ title: 'Intermezzo' });
    expect(tweede.status).toBe(201);

    const detail = await alsLid('get', `/${id}`);
    expect(detail.body.program.map((p: any) => p.title)).toEqual(['Ouverture', 'Intermezzo']);
    // BEWIJS. Op de oude code kwam hier [0, 0] uit: `sortOrder` had in het
    // aanmaakschema een `.default(0)`, zodat zod het veld invulde voordat de
    // route ernaar keek en `data.sortOrder ?? (maxOrder.max_order ?? -1) + 1`
    // nooit voorbij de linkerkant kwam.
    expect(detail.body.program.map((p: any) => p.sortOrder)).toEqual([0, 1]);
  });

  it('zet een nieuw stuk achteraan, ook na een herschikking', async () => {
    const id = maakConcert(vereniging.id, beheerder.id);
    const een = maakProgrammaItem(id, { title: 'Een', sortOrder: 0 });
    const twee = maakProgrammaItem(id, { title: 'Twee', sortOrder: 1 });

    // Na het slepen staan de volgnummers niet meer op 0 en 1 maar op 10 en 20.
    const herschik = await alsBeheerder('put', `/${id}/program/reorder`).send({
      items: [
        { id: een, sortOrder: 10 },
        { id: twee, sortOrder: 20 },
      ],
    });
    expect(herschik.status).toBe(200);

    const nieuw = await alsBeheerder('post', `/${id}/program`).send({ title: 'Toegift' });
    expect(nieuw.status).toBe(201);

    // BEWIJS. Dit is waar de standaardwaarde van hierboven pijn deed: het
    // nieuwe stuk kreeg volgnummer 0 en sprong daarmee naar de kop van het
    // programma, in plaats van achter het laatste stuk te komen. Op de oude
    // code stond 'Toegift' hier vooraan.
    const detail = await alsLid('get', `/${id}`);
    expect(detail.body.program.map((p: any) => p.title)).toEqual(['Een', 'Twee', 'Toegift']);
    expect(detail.body.program[2].sortOrder).toBe(21);
  });

  it('houdt zich aan een volgnummer dat wel wordt meegegeven', async () => {
    const id = maakConcert(vereniging.id, beheerder.id);
    maakProgrammaItem(id, { title: 'Een', sortOrder: 5 });

    const res = await alsBeheerder('post', `/${id}/program`).send({ title: 'Vooraf', sortOrder: 0 });
    expect(res.status).toBe(201);

    const detail = await alsLid('get', `/${id}`);
    expect(detail.body.program.map((p: any) => p.title)).toEqual(['Vooraf', 'Een']);
  });

  it('weigert een programma-item zonder titel', async () => {
    const id = maakConcert(vereniging.id, beheerder.id);
    const res = await alsBeheerder('post', `/${id}/program`).send({ title: '' });
    expect(res.status).toBe(400);
  });

  it('voegt geen item toe aan het concert van een andere vereniging', async () => {
    const id = maakConcert(andereVereniging.id, andereBeheerder.id);
    const res = await alsBeheerder('post', `/${id}/program`).send({ title: 'Ingeslopen' });
    expect(res.status).toBe(404);
  });

  it('herschikt het programma', async () => {
    const id = maakConcert(vereniging.id, beheerder.id);
    const een = maakProgrammaItem(id, { title: 'Een', sortOrder: 0 });
    const twee = maakProgrammaItem(id, { title: 'Twee', sortOrder: 1 });

    const res = await alsBeheerder('put', `/${id}/program/reorder`).send({
      items: [
        { id: een, sortOrder: 1 },
        { id: twee, sortOrder: 0 },
      ],
    });
    expect(res.status).toBe(200);

    const detail = await alsLid('get', `/${id}`);
    expect(detail.body.program.map((p: any) => p.title)).toEqual(['Twee', 'Een']);
  });

  it('weigert herschikken zonder lijst en bij een vreemd concert', async () => {
    const id = maakConcert(vereniging.id, beheerder.id);

    const zonderLijst = await alsBeheerder('put', `/${id}/program/reorder`).send({ items: 'nee' });
    expect(zonderLijst.status).toBe(400);

    const elders = maakConcert(andereVereniging.id, andereBeheerder.id);
    const vreemd = await alsBeheerder('put', `/${elders}/program/reorder`).send({ items: [] });
    expect(vreemd.status).toBe(404);
  });

  it('wijzigt een programma-item alleen binnen de eigen vereniging', async () => {
    const id = maakConcert(vereniging.id, beheerder.id);
    const itemId = maakProgrammaItem(id, { title: 'Ouverture' });

    const vreemd = await alsVreemde('put', `/${id}/program/${itemId}`).send({ title: 'Gekaapt' });
    expect(vreemd.status).toBe(404);

    const eigen = await alsBeheerder('put', `/${id}/program/${itemId}`).send({ title: 'Ouverture 1812' });
    expect(eigen.status).toBe(200);

    const detail = await alsLid('get', `/${id}`);
    expect(detail.body.program[0].title).toBe('Ouverture 1812');
  });

  it('verwijdert een programma-item alleen binnen de eigen vereniging', async () => {
    const id = maakConcert(vereniging.id, beheerder.id);
    const itemId = maakProgrammaItem(id);

    const vreemd = await alsVreemde('delete', `/${id}/program/${itemId}`);
    expect(vreemd.status).toBe(404);

    const eigen = await alsBeheerder('delete', `/${id}/program/${itemId}`);
    expect(eigen.status).toBe(200);

    const nogmaals = await alsBeheerder('delete', `/${id}/program/${itemId}`);
    expect(nogmaals.status).toBe(404);
  });

  it('exporteert het programma als tekst, met de sets en de arrangeur', async () => {
    const id = maakConcert(vereniging.id, beheerder.id, { name: 'Voorjaarsconcert', location: 'De Kegel' });
    maakProgrammaItem(id, { title: 'Openingsmars', sortOrder: 0 });
    maakProgrammaItem(id, { title: 'Suite deel 1', sortOrder: 1, partOfSet: 'Suite' });
    maakProgrammaItem(id, { title: 'Suite deel 2', sortOrder: 2, partOfSet: 'Suite' });
    maakProgrammaItem(id, { title: 'Slotstuk', sortOrder: 3, arranger: 'J. Jansen' });

    const res = await alsLid('get', `/${id}/program/export`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.headers['content-disposition']).toContain('attachment');

    expect(res.text).toContain('Voorjaarsconcert');
    expect(res.text).toContain('2026-05-01 - De Kegel');
    expect(res.text).toContain('1. Openingsmars');
    // De setnaam staat een keer boven de twee delen, niet bij elk deel.
    expect(res.text.match(/\nSuite\n/g)).toHaveLength(1);
    expect(res.text).toContain('4. Slotstuk (arr. J. Jansen)');
  });

  it('exporteert het programma van een andere vereniging niet', async () => {
    const id = maakConcert(andereVereniging.id, andereBeheerder.id);
    const res = await alsLid('get', `/${id}/program/export`);
    expect(res.status).toBe(404);
  });
});

// ===========================================
// MEDIA
// ===========================================

describe('concertmedia', () => {
  it('voegt media toe en weigert een onbruikbare verwijzing', async () => {
    const id = maakConcert(vereniging.id, beheerder.id);

    const goed = await alsBeheerder('post', `/${id}/media`).send({
      mediaType: 'photo',
      url: 'https://voorbeeld.test/foto.jpg',
      description: 'Groepsfoto',
    });
    expect(goed.status).toBe(201);

    const geenUrl = await alsBeheerder('post', `/${id}/media`).send({ mediaType: 'photo', url: 'geen url' });
    expect(geenUrl.status).toBe(400);

    const geenSoort = await alsBeheerder('post', `/${id}/media`).send({ mediaType: '' });
    expect(geenSoort.status).toBe(400);
  });

  it('voegt geen media toe aan het concert van een andere vereniging', async () => {
    const id = maakConcert(andereVereniging.id, andereBeheerder.id);
    const res = await alsBeheerder('post', `/${id}/media`).send({ mediaType: 'photo' });
    expect(res.status).toBe(404);
  });

  it('verwijdert media alleen binnen de eigen vereniging', async () => {
    const id = maakConcert(vereniging.id, beheerder.id);
    const gemaakt = await alsBeheerder('post', `/${id}/media`).send({ mediaType: 'photo' });

    const vreemd = await alsVreemde('delete', `/${id}/media/${gemaakt.body.id}`);
    expect(vreemd.status).toBe(404);

    const eigen = await alsBeheerder('delete', `/${id}/media/${gemaakt.body.id}`);
    expect(eigen.status).toBe(200);

    const nogmaals = await alsBeheerder('delete', `/${id}/media/${gemaakt.body.id}`);
    expect(nogmaals.status).toBe(404);
  });
});

// ===========================================
// BEZETTING
// ===========================================

describe('concertbezetting', () => {
  it('weigert een aanmelding zonder naam', async () => {
    const id = maakConcert(vereniging.id, beheerder.id);
    const res = await alsBeheerder('post', `/${id}/attendance`).send({ memberName: '' });
    expect(res.status).toBe(400);
  });

  it('weigert een lid van een andere vereniging', async () => {
    const id = maakConcert(vereniging.id, beheerder.id);

    const res = await alsBeheerder('post', `/${id}/attendance`).send({
      userId: andereBeheerder.id,
      memberName: 'Elders Beheerder',
    });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Lid niet gevonden.');
  });

  it('weigert hetzelfde lid twee keer', async () => {
    const id = maakConcert(vereniging.id, beheerder.id);

    const eerste = await alsBeheerder('post', `/${id}/attendance`).send({
      userId: lid.id,
      memberName: `${lid.firstName} ${lid.lastName}`,
      instrumentPlayed: 'Trompet',
    });
    expect(eerste.status).toBe(201);

    const tweede = await alsBeheerder('post', `/${id}/attendance`).send({
      userId: lid.id,
      memberName: `${lid.firstName} ${lid.lastName}`,
    });
    expect(tweede.status).toBe(409);
  });

  it('laat een losse naam zonder lid-id wel meerdere keren toe', async () => {
    const id = maakConcert(vereniging.id, beheerder.id);

    const eerste = await alsBeheerder('post', `/${id}/attendance`).send({ memberName: 'Invaller' });
    const tweede = await alsBeheerder('post', `/${id}/attendance`).send({ memberName: 'Invaller' });
    expect(eerste.status).toBe(201);
    expect(tweede.status).toBe(201);
  });

  it('voegt geen bezetting toe aan het concert van een andere vereniging', async () => {
    const id = maakConcert(andereVereniging.id, andereBeheerder.id);
    const res = await alsBeheerder('post', `/${id}/attendance`).send({ memberName: 'Iemand' });
    expect(res.status).toBe(404);
  });

  it('weigert een lege lijst bij het bulkgewijs aanmelden', async () => {
    const id = maakConcert(vereniging.id, beheerder.id);

    const leeg = await alsBeheerder('post', `/${id}/attendance/bulk`).send({ userIds: [] });
    expect(leeg.status).toBe(400);

    const geenLijst = await alsBeheerder('post', `/${id}/attendance/bulk`).send({ userIds: 'iedereen' });
    expect(geenLijst.status).toBe(400);
  });

  it('meldt niemand bulkgewijs aan bij het concert van een andere vereniging', async () => {
    const id = maakConcert(andereVereniging.id, andereBeheerder.id);

    const res = await alsBeheerder('post', `/${id}/attendance/bulk`).send({ userIds: [beheerder.id] });
    expect(res.status).toBe(404);

    const aantal = db.prepare('SELECT COUNT(*) as n FROM concert_attendance WHERE concert_id = ?').get(id) as any;
    expect(aantal.n).toBe(0);
  });

  it('meldt bij bulk alleen de leden van de eigen vereniging aan', async () => {
    const trompet = createTestInstrument({ name: 'Trompet' });
    addInstrumentToUser(lid.id, trompet.id);

    const id = maakConcert(vereniging.id, beheerder.id);

    const res = await alsBeheerder('post', `/${id}/attendance/bulk`).send({
      userIds: [lid.id, andereBeheerder.id],
    });
    expect(res.status).toBe(201);
    expect(res.body.count).toBe(1);

    const detail = await alsLid('get', `/${id}`);
    expect(detail.body.attendance).toHaveLength(1);
    expect(detail.body.attendance[0].user.id).toBe(lid.id);
    expect(detail.body.attendance[0].instrumentPlayed).toBe('Trompet');
  });

  it('wijzigt en verwijdert een bezettingsrij alleen binnen de eigen vereniging', async () => {
    const id = maakConcert(vereniging.id, beheerder.id);
    const bezettingId = maakBezetting(id, 'Jan de Vries');

    const vreemdeWijziging = await alsVreemde('put', `/${id}/attendance/${bezettingId}`).send({
      memberName: 'Gekaapt',
    });
    expect(vreemdeWijziging.status).toBe(404);

    const eigenWijziging = await alsBeheerder('put', `/${id}/attendance/${bezettingId}`).send({
      instrumentPlayed: 'Bugel',
    });
    expect(eigenWijziging.status).toBe(200);

    const detail = await alsLid('get', `/${id}`);
    expect(detail.body.attendance[0]).toMatchObject({ memberName: 'Jan de Vries', instrumentPlayed: 'Bugel' });

    const vreemdeVerwijdering = await alsVreemde('delete', `/${id}/attendance/${bezettingId}`);
    expect(vreemdeVerwijdering.status).toBe(404);

    const eigenVerwijdering = await alsBeheerder('delete', `/${id}/attendance/${bezettingId}`);
    expect(eigenVerwijdering.status).toBe(200);

    const nogmaals = await alsBeheerder('delete', `/${id}/attendance/${bezettingId}`);
    expect(nogmaals.status).toBe(404);
  });
});

// ===========================================
// GESCANDE KAARTEN
// ===========================================

describe('gescande kaarten', () => {
  function maakKaart(
    concertId: string,
    ticketTypeId: string,
    orderId: string,
    overschrijf: Partial<{ usedAt: string | null; validatedBy: string | null; buyerName: string }> = {},
  ) {
    db.prepare(
      `INSERT INTO tickets (id, ticket_type_id, order_id, buyer_name, buyer_email, status, qr_code, seat_info, used_at, validated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      uuidv4(),
      ticketTypeId,
      orderId,
      overschrijf.buyerName ?? 'Jan de Vries',
      'jan@voorbeeld.test',
      'used',
      `qr-${uuidv4()}`,
      'Rij 3, stoel 12',
      overschrijf.usedAt === undefined ? '2026-05-01T20:00:00.000Z' : overschrijf.usedAt,
      overschrijf.validatedBy ?? null,
    );
  }

  function maakKaartsoort(concertId: string) {
    const ticketTypeId = uuidv4();
    const orderId = uuidv4();
    db.prepare('INSERT INTO ticket_types (id, concert_id, name, price, quantity) VALUES (?, ?, ?, ?, ?)').run(
      ticketTypeId,
      concertId,
      'Voorverkoop',
      12.5,
      100,
    );
    db.prepare(
      `INSERT INTO ticket_orders (id, concert_id, total, status, buyer_name, buyer_email)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(orderId, concertId, 12.5, 'paid', 'Jan de Vries', 'jan@voorbeeld.test');
    return { ticketTypeId, orderId };
  }

  it('is niet voor de muziekcommissie', async () => {
    const id = maakConcert(vereniging.id, beheerder.id);
    const res = await request(app)
      .get(`/api/concerts/${id}/scanned-tickets`)
      .set('Authorization', `Bearer ${muziekcommissieToken}`);
    expect(res.status).toBe(403);
  });

  it('geeft 404 voor een concert van een andere vereniging', async () => {
    const id = maakConcert(andereVereniging.id, andereBeheerder.id);
    const res = await alsBeheerder('get', `/${id}/scanned-tickets`);
    expect(res.status).toBe(404);
  });

  it('telt alleen de gescande kaarten en rekent het percentage uit', async () => {
    const id = maakConcert(vereniging.id, beheerder.id, { name: 'Kerstconcert' });
    const { ticketTypeId, orderId } = maakKaartsoort(id);

    maakKaart(id, ticketTypeId, orderId, { validatedBy: beheerder.id });
    maakKaart(id, ticketTypeId, orderId, { buyerName: 'Zonder controleur' });
    maakKaart(id, ticketTypeId, orderId, { usedAt: null, buyerName: 'Niet gescand' });
    maakKaart(id, ticketTypeId, orderId, { usedAt: null, buyerName: 'Ook niet gescand' });

    const res = await alsBeheerder('get', `/${id}/scanned-tickets`);
    expect(res.status).toBe(200);
    expect(res.body.concert.name).toBe('Kerstconcert');
    expect(res.body.summary).toMatchObject({ totalTickets: 4, scannedCount: 2, scanPercentage: 50 });
    expect(res.body.scannedTickets).toHaveLength(2);

    const metControleur = res.body.scannedTickets.find((t: any) => t.validatedBy !== null);
    expect(metControleur.validatedBy).toBe('Admin User');
    expect(metControleur.ticketTypeName).toBe('Voorverkoop');
    expect(metControleur.ticketPrice).toBe(12.5);
    expect(metControleur.seatInfo).toBe('Rij 3, stoel 12');

    const zonderControleur = res.body.scannedTickets.find((t: any) => t.buyerName === 'Zonder controleur');
    expect(zonderControleur.validatedBy).toBeNull();
  });

  it('geeft nul procent bij een concert zonder kaarten', async () => {
    const id = maakConcert(vereniging.id, beheerder.id);
    const res = await alsBeheerder('get', `/${id}/scanned-tickets`);
    expect(res.status).toBe(200);
    expect(res.body.summary).toMatchObject({ totalTickets: 0, scannedCount: 0, scanPercentage: 0 });
  });
});
