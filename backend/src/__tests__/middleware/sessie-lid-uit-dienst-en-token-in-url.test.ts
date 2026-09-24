/**
 * De aanmeldcontrole kijkt of het lid nog bestaat en nog actief is.
 *
 * Een bekende, niet-ingetrokken sessie werd geaccepteerd zonder naar het lid
 * te kijken: een verwijderd of uit dienst genomen lid bleef binnen zolang het
 * intrekken van zijn sessies was overgeslagen of mislukt. Alleen tokens zonder
 * sessierij werden tegen de gebruikerstabel gehouden.
 *
 * Daarnaast: een volledig token in de querystring (?token=) geldt alleen nog
 * bij GET en HEAD. De frontend gebruikt het nog voor <audio src>; voor een
 * verzoek dat iets wijzigt hoort het token in de kopregel.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express, { Response } from 'express';
import '../setup';
import db from '../../database/connection';
import { authenticateToken, optionalAuth, AuthRequest } from '../../middleware/auth';
import { registerSession } from '../../utils/sessionStore';
import { createTestEnvironment, TestUser } from '../testUtils';

const app = express();
app.use(express.json());
const wieBenIk = (req: AuthRequest, res: Response) => res.json(req.user ?? null);
app.get('/ik', authenticateToken, wieBenIk);
app.post('/ik', authenticateToken, wieBenIk);
app.get('/misschien', optionalAuth, wieBenIk);
app.post('/misschien', optionalAuth, wieBenIk);

describe('status van het lid bij het aanmelden', () => {
  let beheerder: TestUser;
  let beheerderToken: string;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    beheerder = omgeving.adminUser;
    beheerderToken = omgeving.adminToken;
    registerSession(beheerder.id, beheerderToken, '127.0.0.1', 'test');
  });

  const alsBeheerder = (pad: string) => request(app).get(pad).set('Authorization', `Bearer ${beheerderToken}`);

  it('weigert een bekende sessie van een lid dat uit dienst is', async () => {
    db.prepare("UPDATE users SET status = 'inactive' WHERE id = ?").run(beheerder.id);

    expect((await alsBeheerder('/ik')).status).toBe(401);
  });

  it('weigert een bekende sessie van een verwijderd lid', async () => {
    db.prepare('UPDATE users SET deleted_at = ? WHERE id = ?').run(new Date().toISOString(), beheerder.id);

    expect((await alsBeheerder('/ik')).status).toBe(401);
  });

  it('laat een lid met status pending binnen, net als het wachtwoordpad', async () => {
    db.prepare("UPDATE users SET status = 'pending' WHERE id = ?").run(beheerder.id);

    expect((await alsBeheerder('/ik')).status).toBe(200);
  });

  it('hangt bij optionele aanmelding geen lid aan het verzoek dat uit dienst is', async () => {
    db.prepare("UPDATE users SET status = 'inactive' WHERE id = ?").run(beheerder.id);

    const antwoord = await request(app).get('/misschien').set('Authorization', `Bearer ${beheerderToken}`);
    expect(antwoord.body).toBeNull();
  });

  describe('een volledig token in de URL', () => {
    it('werkt nog bij GET', async () => {
      const antwoord = await request(app).get(`/ik?token=${beheerderToken}`);
      expect(antwoord.status).toBe(200);
    });

    it('werkt niet bij POST', async () => {
      const antwoord = await request(app).post(`/ik?token=${beheerderToken}`).send({});
      expect(antwoord.status).toBe(401);
    });

    it('meldt bij optionele aanmelding via POST niemand aan', async () => {
      const antwoord = await request(app).post(`/misschien?token=${beheerderToken}`).send({});
      expect(antwoord.body).toBeNull();
    });
  });
});
