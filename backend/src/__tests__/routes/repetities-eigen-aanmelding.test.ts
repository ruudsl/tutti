/**
 * De eigen aan- of afmelding in de lijst met repetities.
 *
 * Een lid kon zich alleen aan- of afmelden door eerst een repetitie te openen;
 * in de lijst en op het dashboard stond niet eens of hij al gereageerd had.
 * GET /rehearsals en GET /rehearsals/upcoming geven nu per repetitie
 * `my_status` mee: de status van de aanvrager zelf, of null.
 *
 * Wat hier vastligt: het is de eigen status, niet die van een ander lid.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import app from '../testApp';
import { createTestEnvironment } from '../testUtils';

let omgeving: ReturnType<typeof createTestEnvironment>;
let aangemeld: string;
let afgemeld: string;
let open: string;

function repetitie(datum: string) {
  const id = uuidv4();
  db.prepare(
    "INSERT INTO rehearsals (id, association_id, date, start_time, end_time) VALUES (?, ?, ?, '19:30', '22:00')",
  ).run(id, omgeving.association.id, datum);
  return id;
}

function meld(rehearsalId: string, userId: string, status: 'accepted' | 'declined') {
  db.prepare(
    "INSERT INTO rehearsal_attendance (id, rehearsal_id, user_id, member_name, status) VALUES (?, ?, ?, 'Lid', ?)",
  ).run(uuidv4(), rehearsalId, userId, status);
}

beforeEach(() => {
  omgeving = createTestEnvironment();
  aangemeld = repetitie('2099-01-05');
  afgemeld = repetitie('2099-01-12');
  open = repetitie('2099-01-19');
  meld(aangemeld, omgeving.memberUser.id, 'accepted');
  meld(afgemeld, omgeving.memberUser.id, 'declined');
  // Een ander lid heeft zich voor de open repetitie aangemeld; dat is niet
  // de status van het lid zelf.
  meld(open, omgeving.adminUser.id, 'accepted');
});

const statussen = (rijen: { id: string; my_status: string | null }[]) =>
  Object.fromEntries(rijen.map((r) => [r.id, r.my_status]));

describe('de eigen aanmelding in de lijst met repetities', () => {
  it('staat bij elke repetitie in GET /rehearsals', async () => {
    const antwoord = await request(app).get('/api/rehearsals').set('Authorization', `Bearer ${omgeving.memberToken}`);

    expect(antwoord.status).toBe(200);
    expect(statussen(antwoord.body)).toMatchObject({ [aangemeld]: 'accepted', [afgemeld]: 'declined', [open]: null });
  });

  it('staat ook bij de komende repetities op het dashboard', async () => {
    const antwoord = await request(app)
      .get('/api/rehearsals/upcoming?limit=5')
      .set('Authorization', `Bearer ${omgeving.memberToken}`);

    expect(statussen(antwoord.body)).toMatchObject({ [aangemeld]: 'accepted', [afgemeld]: 'declined', [open]: null });
  });

  it('is voor ieder zijn eigen status', async () => {
    const antwoord = await request(app).get('/api/rehearsals').set('Authorization', `Bearer ${omgeving.adminToken}`);

    expect(statussen(antwoord.body)).toMatchObject({ [aangemeld]: null, [afgemeld]: null, [open]: 'accepted' });
  });
});
