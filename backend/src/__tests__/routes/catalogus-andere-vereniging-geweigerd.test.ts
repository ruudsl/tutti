/**
 * Een verzoek mag alleen verwijzen naar een instrument of genre dat de
 * vereniging mag gebruiken: een standaarditem (`association_id` leeg) of een
 * eigen item. Een eigen item van een andere vereniging is voor deze vereniging
 * onbekend en wordt met een 400 geweigerd, vóórdat er iets wordt weggeschreven
 * (services/catalogus.ts, `eisBruikbaar`).
 *
 * Een steekproef van de routes die een instrument- of genre-id uit het verzoek
 * wegschrijven: de instrumenten van een lid, de genres van een muziektitel,
 * de instrumenten van een externe muzikant en die van een opstellingssectie.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import usersRoutes from '../../routes/users';
import musicPiecesRoutes from '../../routes/music-pieces';
import externalMusiciansRoutes from '../../routes/external-musicians';
import seatingRoutes from '../../routes/seating';
import { errorHandler } from '../../middleware/errorHandler';
import { invalidateAllCache } from '../../middleware/cache';
import { createTestAssociation, createTestEnvironment, createTestOrchestra, TestUser } from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api/users', usersRoutes);
app.use('/api/music-pieces', musicPiecesRoutes);
app.use('/api/external-musicians', externalMusiciansRoutes);
app.use('/api/seating', seatingRoutes);
app.use(errorHandler);

let verenigingId: string;
let beheerder: string;
let lid: TestUser;

/** Instrumenten: standaard, eigen van deze vereniging, eigen van een andere. */
let standaardInstrument: string;
let eigenInstrument: string;
let vreemdInstrument: string;

/** Genres: standaard, eigen van deze vereniging, eigen van een andere. */
let standaardGenre: string;
let eigenGenre: string;
let vreemdGenre: string;

function instrument(naam: string, associationId: string | null): string {
  const id = uuidv4();
  db.prepare("INSERT INTO instruments (id, name, tuning, clef, association_id) VALUES (?, ?, 'Bb', 'sol', ?)").run(
    id,
    naam,
    associationId,
  );
  return id;
}

function genre(naam: string, associationId: string | null): string {
  const id = uuidv4();
  db.prepare('INSERT INTO genres (id, name, association_id) VALUES (?, ?, ?)').run(id, naam, associationId);
  return id;
}

beforeEach(() => {
  invalidateAllCache();
  const omgeving = createTestEnvironment();
  verenigingId = omgeving.association.id;
  beheerder = omgeving.adminToken;
  lid = omgeving.memberUser;
  const andere = createTestAssociation({ name: 'Fanfare Elders' });

  standaardInstrument = instrument('Trompet', null);
  eigenInstrument = instrument('Alpenhoorn', verenigingId);
  vreemdInstrument = instrument('Doedelzak', andere.id);

  standaardGenre = genre('Mars', null);
  eigenGenre = genre('Kermismuziek', verenigingId);
  vreemdGenre = genre('Carnaval', andere.id);
});

type Methode = 'post' | 'put';
const als = (methode: Methode, pad: string) => request(app)[methode](pad).set('Authorization', `Bearer ${beheerder}`);

describe('instrumenten van een lid', () => {
  const instrumentenVanLid = () =>
    (
      db.prepare('SELECT instrument_id FROM user_instruments WHERE user_id = ?').all(lid.id) as {
        instrument_id: string;
      }[]
    )
      .map((r) => r.instrument_id)
      .sort();

  it('weigert een eigen instrument van een andere vereniging en laat de bestaande instrumenten staan', async () => {
    db.prepare('INSERT INTO user_instruments (user_id, instrument_id) VALUES (?, ?)').run(lid.id, standaardInstrument);

    const res = await als('put', `/api/users/${lid.id}`).send({ instrumentIds: [eigenInstrument, vreemdInstrument] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Onbekend instrument.');
    expect(instrumentenVanLid()).toEqual([standaardInstrument]);
  });

  it('weigert bij een nieuw lid een eigen instrument van een andere vereniging en maakt het lid niet aan', async () => {
    const res = await als('post', '/api/users').send({
      email: 'nieuw@test.com',
      password: 'geheim123',
      firstName: 'Nieuw',
      lastName: 'Lid',
      instrumentIds: [vreemdInstrument],
    });

    expect(res.status).toBe(400);
    expect(db.prepare('SELECT 1 FROM users WHERE email = ?').get('nieuw@test.com')).toBeUndefined();
  });

  it('accepteert een standaardinstrument en een eigen instrument', async () => {
    const res = await als('put', `/api/users/${lid.id}`).send({
      instrumentIds: [standaardInstrument, eigenInstrument],
    });

    expect(res.status).toBe(200);
    expect(instrumentenVanLid()).toEqual([standaardInstrument, eigenInstrument].sort());
  });
});

describe('genres van een muziektitel', () => {
  const genresVanTitel = (titel: string) =>
    (
      db
        .prepare(
          `SELECT mtg.genre_id FROM music_title_genres mtg
           JOIN music_titles mt ON mt.id = mtg.music_title_id
           WHERE mt.title = ? AND mt.association_id = ?`,
        )
        .all(titel, verenigingId) as { genre_id: string }[]
    )
      .map((r) => r.genre_id)
      .sort();

  it('weigert een eigen genre van een andere vereniging en maakt de titel niet aan', async () => {
    const res = await als('put', '/api/music-pieces/title-meta').send({
      title: 'Florentiner Marsch',
      genreIds: [standaardGenre, vreemdGenre],
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Onbekend genre.');
    expect(
      db
        .prepare('SELECT 1 FROM music_titles WHERE title = ? AND association_id = ?')
        .get('Florentiner Marsch', verenigingId),
    ).toBeUndefined();
  });

  it('accepteert een standaardgenre en een eigen genre', async () => {
    const res = await als('put', '/api/music-pieces/title-meta').send({
      title: 'Florentiner Marsch',
      genreIds: [standaardGenre, eigenGenre],
    });

    expect(res.status).toBe(200);
    expect(genresVanTitel('Florentiner Marsch')).toEqual([standaardGenre, eigenGenre].sort());
  });
});

describe('instrumenten van een externe muzikant', () => {
  const nieuweMuzikant = (instrumentIds: string[]) =>
    als('post', '/api/external-musicians').send({
      firstName: 'Invaller',
      lastName: 'Van Buiten',
      musicianType: 'substitute',
      instruments: instrumentIds.map((instrumentId) => ({ instrumentId })),
    });

  it('weigert een eigen instrument van een andere vereniging en maakt de muzikant niet aan', async () => {
    const res = await nieuweMuzikant([standaardInstrument, vreemdInstrument]);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Onbekend instrument.');
    expect(db.prepare('SELECT 1 FROM external_musicians WHERE association_id = ?').get(verenigingId)).toBeUndefined();
  });

  it('weigert een eigen instrument van een andere vereniging bij een bestaande muzikant', async () => {
    const id = (await nieuweMuzikant([])).body.id;

    const res = await als('post', `/api/external-musicians/${id}/instruments`).send({ instrumentId: vreemdInstrument });

    expect(res.status).toBe(400);
    expect(
      db.prepare('SELECT 1 FROM external_musician_instruments WHERE external_musician_id = ?').get(id),
    ).toBeUndefined();
  });

  it('accepteert een standaardinstrument en een eigen instrument', async () => {
    const res = await nieuweMuzikant([standaardInstrument, eigenInstrument]);

    expect(res.status).toBe(201);
    const gekoppeld = (
      db
        .prepare('SELECT instrument_id FROM external_musician_instruments WHERE external_musician_id = ?')
        .all(res.body.id) as { instrument_id: string }[]
    )
      .map((r) => r.instrument_id)
      .sort();
    expect(gekoppeld).toEqual([standaardInstrument, eigenInstrument].sort());
  });
});

describe('instrumenten van een opstellingssectie', () => {
  it('weigert een eigen instrument van een andere vereniging en maakt de sectie niet aan', async () => {
    const orkest = createTestOrchestra(verenigingId);

    const res = await als('post', '/api/seating/sections').send({
      orchestraId: orkest.id,
      name: 'Rij 1',
      rowNumber: 1,
      instrumentIds: [vreemdInstrument],
    });

    expect(res.status).toBe(400);
    expect(db.prepare('SELECT 1 FROM seating_sections WHERE orchestra_id = ?').get(orkest.id)).toBeUndefined();
  });

  it('weigert een eigen instrument van een andere vereniging bij het bijwerken en laat de sectie ongemoeid', async () => {
    const orkest = createTestOrchestra(verenigingId);
    const sectie = (
      await als('post', '/api/seating/sections').send({
        orchestraId: orkest.id,
        name: 'Rij 1',
        rowNumber: 1,
        instrumentIds: [standaardInstrument],
      })
    ).body.id;

    const res = await als('put', `/api/seating/sections/${sectie}`).send({
      name: 'Gekaapt',
      instrumentIds: [vreemdInstrument],
    });

    expect(res.status).toBe(400);
    expect((db.prepare('SELECT name FROM seating_sections WHERE id = ?').get(sectie) as { name: string }).name).toBe(
      'Rij 1',
    );
    expect(
      db.prepare('SELECT instrument_id FROM seating_section_instruments WHERE section_id = ?').all(sectie),
    ).toEqual([{ instrument_id: standaardInstrument }]);
  });

  it('accepteert een standaardinstrument en een eigen instrument', async () => {
    const orkest = createTestOrchestra(verenigingId);

    const res = await als('post', '/api/seating/sections').send({
      orchestraId: orkest.id,
      name: 'Rij 1',
      rowNumber: 1,
      instrumentIds: [standaardInstrument, eigenInstrument],
    });

    expect(res.status).toBe(201);
    const gekoppeld = (
      db.prepare('SELECT instrument_id FROM seating_section_instruments WHERE section_id = ?').all(res.body.id) as {
        instrument_id: string;
      }[]
    )
      .map((r) => r.instrument_id)
      .sort();
    expect(gekoppeld).toEqual([standaardInstrument, eigenInstrument].sort());
  });
});
