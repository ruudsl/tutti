/**
 * Leden en de muziekbibliotheek inlezen uit een spreadsheet (WP11):
 * routes/importeren.ts en services/importeren.ts.
 *
 * Wat hier vastligt:
 * - het voorbeeld verandert niets, de import alleen wat `nieuw` is;
 * - wat er al is wordt overgeslagen, ook bij een tweede keer importeren;
 * - de verenigingsgrens: een adres uit een andere vereniging wordt niet
 *   overgenomen of gekoppeld, orkesten van een ander worden niet gevonden;
 * - de ledengrens van het abonnement;
 * - wie het mag.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import bcrypt from 'bcryptjs';
import '../setup';
import db from '../../database/connection';
import importerenRoutes from '../../routes/importeren';
import { errorHandler } from '../../middleware/errorHandler';
import { leesDuur } from '../../services/importeren';
import {
  createTestAssociation,
  createTestEnvironment,
  createTestInstrument,
  createTestOrchestra,
  createTestUser,
  TestAssociation,
} from '../testUtils';

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use('/api/import', importerenRoutes);
app.use(errorHandler);

let vereniging: TestAssociation;
let beheerderToken: string;
let lidToken: string;
let muziekcommissieToken: string;

beforeEach(() => {
  const omgeving = createTestEnvironment();
  vereniging = omgeving.association;
  beheerderToken = omgeving.adminToken;
  lidToken = omgeving.memberToken;
  muziekcommissieToken = omgeving.musicCommitteeToken;
});

const stuur = (token: string, pad: string, csv: string) =>
  request(app).post(`/api/import${pad}`).set('Authorization', `Bearer ${token}`).send({ csv });

const ledenVan = (associationId: string) =>
  db
    .prepare('SELECT email, first_name, last_name, role FROM users WHERE association_id = ? ORDER BY email')
    .all(associationId) as { email: string; first_name: string; last_name: string; role: string }[];

describe('leden importeren', () => {
  const LEDEN = [
    'Voornaam;Tussenvoegsel;Achternaam;E-mail;Instrument;Orkest;Rol',
    'Anna;;Jansen;anna@voorbeeld.nl;Trompet;Harmonie;',
    'Bram;de;Vries;Bram@Voorbeeld.nl;Hoorn, Tuba;Harmonie, Jeugdorkest;Dirigent',
  ].join('\n');

  beforeEach(() => {
    createTestInstrument({ name: 'Trompet' });
    createTestInstrument({ name: 'Hoorn' });
    createTestOrchestra(vereniging.id, { name: 'Harmonie' });
  });

  it('laat in het voorbeeld zien wat er zou gebeuren, zonder iets te veranderen', async () => {
    const antwoord = await stuur(beheerderToken, '/leden/voorbeeld', LEDEN);

    expect(antwoord.status).toBe(200);
    expect(antwoord.body.tellingen).toEqual({ nieuw: 2, bestaat: 0, bijwerken: 0, fout: 0 });
    expect(antwoord.body.kolommen).toMatchObject({ voornaam: 'Voornaam', email: 'E-mail', orkesten: 'Orkest' });
    const [anna, bram] = antwoord.body.regels;
    expect(anna).toMatchObject({ rij: 2, status: 'nieuw', gegevens: { email: 'anna@voorbeeld.nl', rol: 'member' } });
    expect(bram.gegevens).toMatchObject({ achternaam: 'de Vries', email: 'bram@voorbeeld.nl', rol: 'conductor' });
    // Wat niet gevonden wordt is een waarschuwing, geen fout.
    expect(bram.waarschuwingen).toEqual([
      'Instrument "Tuba" is niet gevonden en wordt overgeslagen.',
      'Orkest "Jeugdorkest" bestaat niet in deze vereniging en wordt overgeslagen.',
    ]);
    // De interne id's gaan niet naar de browser.
    expect(bram.gegevens).not.toHaveProperty('instrumentIds');

    expect(ledenVan(vereniging.id).map((l) => l.email)).not.toContain('anna@voorbeeld.nl');
  });

  it('importeert de nieuwe leden met instrumenten en orkesten', async () => {
    const antwoord = await stuur(beheerderToken, '/leden', LEDEN);

    expect(antwoord.status).toBe(201);
    expect(antwoord.body.geimporteerd).toBe(2);

    const bram = db
      .prepare('SELECT id, first_name, last_name, role, status FROM users WHERE email = ?')
      .get('bram@voorbeeld.nl') as { id: string; first_name: string; last_name: string; role: string; status: string };
    expect(bram).toMatchObject({ first_name: 'Bram', last_name: 'de Vries', role: 'conductor', status: 'active' });

    const instrumenten = db
      .prepare(
        'SELECT i.name FROM user_instruments ui JOIN instruments i ON i.id = ui.instrument_id WHERE ui.user_id = ?',
      )
      .all(bram.id) as { name: string }[];
    expect(instrumenten.map((i) => i.name)).toEqual(['Hoorn']);

    const orkesten = db
      .prepare('SELECT o.name FROM user_orchestras uo JOIN orchestras o ON o.id = uo.orchestra_id WHERE uo.user_id = ?')
      .all(bram.id) as { name: string }[];
    expect(orkesten.map((o) => o.name)).toEqual(['Harmonie']);
  });

  it('geeft geïmporteerde leden een wachtwoord dat niemand kent', async () => {
    await stuur(beheerderToken, '/leden', LEDEN);

    const { password_hash } = db
      .prepare('SELECT password_hash FROM users WHERE email = ?')
      .get('anna@voorbeeld.nl') as {
      password_hash: string;
    };
    expect(password_hash).toMatch(/^\$2[aby]\$10\$/);
    for (const gok of ['', 'anna@voorbeeld.nl', 'welkom', 'testpassword123']) {
      expect(await bcrypt.compare(gok, password_hash)).toBe(false);
    }
  });

  it('slaat bij een tweede import over wat er al is', async () => {
    await stuur(beheerderToken, '/leden', LEDEN);
    const antwoord = await stuur(beheerderToken, '/leden', LEDEN);

    expect(antwoord.status).toBe(200);
    expect(antwoord.body.geimporteerd).toBe(0);
    expect(antwoord.body.tellingen).toEqual({ nieuw: 0, bestaat: 2, bijwerken: 0, fout: 0 });
    expect(ledenVan(vereniging.id).filter((l) => l.email.endsWith('@voorbeeld.nl'))).toHaveLength(2);
  });

  it('meldt per regel wat er mis is en importeert de rest', async () => {
    const csv = [
      'Voornaam;Achternaam;E-mail;Rol',
      'Anna;Jansen;anna@voorbeeld.nl;',
      ';Zonder;zonder@voorbeeld.nl;',
      'Carla;Kapot;geen-adres;',
      'Dirk;Dubbel;ANNA@voorbeeld.nl;',
      'Eva;Rol;eva@voorbeeld.nl;Koning',
    ].join('\n');

    const antwoord = await stuur(beheerderToken, '/leden', csv);

    expect(antwoord.body.geimporteerd).toBe(1);
    const fouten = Object.fromEntries(
      antwoord.body.regels
        .filter((r: { status: string }) => r.status === 'fout')
        .map((r: { rij: number; fouten: string[] }) => [r.rij, r.fouten]),
    );
    expect(fouten).toEqual({
      3: ['Voornaam ontbreekt.'],
      4: ['"geen-adres" is geen geldig e-mailadres.'],
      5: ['Dit e-mailadres staat eerder in het bestand.'],
      6: ['Onbekende rol "Koning".'],
    });
  });

  it('neemt geen adres over dat bij een andere vereniging hoort', async () => {
    const andere = createTestAssociation({ name: 'Andere vereniging' });
    createTestUser(andere.id, { email: 'elders@voorbeeld.nl' });

    const antwoord = await stuur(beheerderToken, '/leden', 'Voornaam;Achternaam;E-mail\nEl;Ders;elders@voorbeeld.nl');

    expect(antwoord.body.geimporteerd).toBe(0);
    expect(antwoord.body.regels[0]).toMatchObject({
      status: 'fout',
      fouten: ['Dit e-mailadres is al in gebruik bij een ander account.'],
    });
    // Het bestaande account blijft van de andere vereniging.
    expect(db.prepare('SELECT association_id FROM users WHERE email = ?').get('elders@voorbeeld.nl')).toEqual({
      association_id: andere.id,
    });
  });

  it('vindt geen orkest van een andere vereniging, ook niet bij dezelfde naam', async () => {
    const andere = createTestAssociation({ name: 'Andere vereniging' });
    createTestOrchestra(andere.id, { name: 'Fanfare' });

    const antwoord = await stuur(
      beheerderToken,
      '/leden',
      'Voornaam;Achternaam;E-mail;Orkest\nAnna;Jansen;anna@voorbeeld.nl;Fanfare',
    );

    expect(antwoord.body.regels[0].waarschuwingen).toEqual([
      'Orkest "Fanfare" bestaat niet in deze vereniging en wordt overgeslagen.',
    ]);
    const { id } = db.prepare('SELECT id FROM users WHERE email = ?').get('anna@voorbeeld.nl') as { id: string };
    expect(db.prepare('SELECT COUNT(*) AS n FROM user_orchestras WHERE user_id = ?').get(id)).toEqual({ n: 0 });
  });

  it('importeert niet boven de ledengrens van het abonnement', async () => {
    // De testomgeving heeft drie leden; er kan er nog één bij.
    db.prepare('UPDATE associations SET max_members = 4 WHERE id = ?').run(vereniging.id);

    const antwoord = await stuur(beheerderToken, '/leden', LEDEN);

    expect(antwoord.body.geimporteerd).toBe(1);
    expect(antwoord.body.regels[1]).toMatchObject({
      status: 'fout',
      fouten: ['Boven de ledengrens van het abonnement.'],
    });
  });

  it('weigert een bestand zonder e-mailkolom, met de namen die wel herkend worden', async () => {
    const antwoord = await stuur(beheerderToken, '/leden/voorbeeld', 'Voornaam;Achternaam\nAnna;Jansen');

    expect(antwoord.status).toBe(400);
    expect(antwoord.body.error).toMatch(/email \(E-mail, Email, E-mailadres\)/);
  });

  it('herkent Engelse en Duitse kolomnamen', async () => {
    const engels = await stuur(beheerderToken, '/leden/voorbeeld', 'First name,Last name,Email\nAnna,Jansen,a@x.nl');
    const duits = await stuur(
      beheerderToken,
      '/leden/voorbeeld',
      'Vorname;Nachname;E-Mail-Adresse\nAnna;Jansen;a@x.nl',
    );

    expect(engels.body.tellingen.nieuw).toBe(1);
    expect(duits.body.tellingen.nieuw).toBe(1);
  });

  it('is alleen voor de beheerder', async () => {
    expect((await stuur(muziekcommissieToken, '/leden/voorbeeld', LEDEN)).status).toBe(403);
    expect((await stuur(lidToken, '/leden', LEDEN)).status).toBe(403);
    expect((await request(app).post('/api/import/leden').send({ csv: LEDEN })).status).toBe(401);
  });
});

describe('de muziekbibliotheek importeren', () => {
  const TITELS = [
    'Titel;Componist;Arrangeur;Duur;Graad;Genre',
    'Bolero;Maurice Ravel;Jan de Haan;15:30;4;Classical',
    'Mars der Medici;Johan Wichers;;4 min;2;Onbekend genre',
    'Bolero;Maurice Ravel;;;;',
  ].join('\n');

  it('importeert titels met duur en genre, en ziet een andere arrangeur als een andere titel', async () => {
    db.prepare("INSERT OR IGNORE INTO genres (id, name) VALUES ('genre-klassiek', 'Classical')").run();

    const antwoord = await stuur(muziekcommissieToken, '/muziektitels', TITELS);

    expect(antwoord.status).toBe(201);
    expect(antwoord.body.geimporteerd).toBe(3);
    expect(antwoord.body.regels[1].waarschuwingen).toEqual([
      'Genre "Onbekend genre" is niet gevonden en wordt overgeslagen.',
    ]);

    const bolero = db
      .prepare(
        "SELECT id, composer, arranger, duration_seconds, grade FROM music_titles WHERE title = 'Bolero' AND arranger = 'Jan de Haan' AND association_id = ?",
      )
      .get(vereniging.id) as { id: string; duration_seconds: number; grade: string };
    expect(bolero).toMatchObject({ composer: 'Maurice Ravel', duration_seconds: 930, grade: '4' });
    const genre = db.prepare('SELECT genre_id FROM music_title_genres WHERE music_title_id = ?').all(bolero.id);
    expect(genre.length).toBe(1);
  });

  it('slaat een titel over die de vereniging al heeft, maar niet een titel van een andere vereniging', async () => {
    const andere = createTestAssociation({ name: 'Andere vereniging' });
    db.prepare(
      "INSERT INTO music_titles (id, title, arranger, association_id) VALUES ('t-eigen', 'Bolero', 'Jan de Haan', ?)",
    ).run(vereniging.id);
    db.prepare(
      "INSERT INTO music_titles (id, title, arranger, association_id) VALUES ('t-ander', 'Mars der Medici', NULL, ?)",
    ).run(andere.id);

    const antwoord = await stuur(beheerderToken, '/muziektitels/voorbeeld', TITELS);

    expect(antwoord.body.regels.map((r: { status: string }) => r.status)).toEqual(['bestaat', 'nieuw', 'nieuw']);
  });

  it('leest de repertoire-export terug', async () => {
    // De kopregel van GET /interop/orchestras/:id/repertoire.csv.
    const csv = 'ID,Titel,Componist,Arrangeur,Duur (sec),Graad,Werk nummer,Deel\nabc,Bolero,Ravel,,930,4,,\n';

    const antwoord = await stuur(beheerderToken, '/muziektitels/voorbeeld', csv);

    expect(antwoord.body.genegeerd).toEqual(['ID', 'Werk nummer', 'Deel']);
    expect(antwoord.body.regels[0].gegevens).toMatchObject({ titel: 'Bolero', duurSeconden: 930 });
  });

  it('is niet voor een gewoon lid', async () => {
    expect((await stuur(lidToken, '/muziektitels', TITELS)).status).toBe(403);
  });
});

describe('een speelduur lezen', () => {
  it.each([
    ['5:30', 330],
    ['1:05:30', 3930],
    ['330', 330],
    ['4 min', 240],
    ['5,5 min', 330],
  ])('%s is %i seconden', (tekst, seconden) => {
    expect(leesDuur(tekst)).toBe(seconden);
  });

  it('geeft niets terug voor wat niet te lezen is', () => {
    expect(leesDuur('ongeveer vijf minuten')).toBeUndefined();
    expect(leesDuur('')).toBeUndefined();
  });
});
