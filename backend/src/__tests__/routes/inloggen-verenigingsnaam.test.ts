/**
 * De naam van de vereniging bij het inloggen.
 *
 * De kop van de app toont de naam van de vereniging. Die kwam alleen uit
 * GET /settings, en die weigert de server zolang een lid eerst een eigen
 * wachtwoord moet kiezen. Bij de eerste keer inloggen stond er dan "Tutti" in
 * plaats van de naam van de eigen vereniging. Het inlogantwoord geeft hem nu
 * zelf mee, net als GET /auth/me: de weergavenaam als die er is.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import '../setup';
import db from '../../database/connection';
import app from '../testApp';
import { createTestEnvironment, TestUser } from '../testUtils';

describe('de naam van de vereniging bij het inloggen', () => {
  let lid: TestUser;
  let associationId: string;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    lid = omgeving.memberUser;
    associationId = omgeving.association.id;
    db.prepare(
      "UPDATE associations SET name = 'harmonie-sint-jan', display_name = 'Harmonie Sint Jan' WHERE id = ?",
    ).run(associationId);
  });

  const logIn = () => request(app).post('/api/auth/login').send({ email: lid.email, password: lid.password });

  it('staat in het inlogantwoord, als weergavenaam', async () => {
    const antwoord = await logIn();

    expect(antwoord.status).toBe(200);
    expect(antwoord.body.user.associationName).toBe('Harmonie Sint Jan');
  });

  it('staat er ook als het lid eerst een eigen wachtwoord moet kiezen', async () => {
    db.prepare('UPDATE users SET moet_wachtwoord_wijzigen = 1 WHERE id = ?').run(lid.id);

    const antwoord = await logIn();

    expect(antwoord.body.user.mustChangePassword).toBe(true);
    expect(antwoord.body.user.associationName).toBe('Harmonie Sint Jan');
  });

  it('valt terug op de naam zonder weergavenaam, ook in /auth/me', async () => {
    db.prepare('UPDATE associations SET display_name = NULL WHERE id = ?').run(associationId);

    const antwoord = await logIn();
    const ik = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${antwoord.body.token}`);

    expect(antwoord.body.user.associationName).toBe('harmonie-sint-jan');
    expect(ik.body.associationName).toBe('harmonie-sint-jan');
  });
});
