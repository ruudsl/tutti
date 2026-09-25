/**
 * Kan de sessie niet worden nagekeken, dan komt het verzoek niet binnen.
 *
 * Bij een databasefout in de sessiecontrole werd de controle overgeslagen en
 * ging het verzoek gewoon door, met de rol uit het token. Juist dan kwam een
 * ingetrokken sessie of een lid uit dienst dus binnen.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express, { Response } from 'express';
import '../setup';

const storing = vi.hoisted(() => ({ aan: false }));

vi.mock('../../utils/sessionStore', async (importOriginal) => {
  const echt = await importOriginal<typeof import('../../utils/sessionStore')>();
  return {
    ...echt,
    findSessionByTokenHash: (hash: string) => {
      if (storing.aan) throw new Error('database niet beschikbaar');
      return echt.findSessionByTokenHash(hash);
    },
  };
});

import { authenticateToken, optionalAuth, AuthRequest } from '../../middleware/auth';
import { createTestEnvironment } from '../testUtils';

const app = express();
const wieBenIk = (req: AuthRequest, res: Response) => res.json(req.user ?? null);
app.get('/ik', authenticateToken, wieBenIk);
app.get('/misschien', optionalAuth, wieBenIk);

describe('sessiecontrole bij een databasefout', () => {
  let token: string;

  beforeEach(() => {
    token = createTestEnvironment().memberToken;
  });

  afterEach(() => {
    storing.aan = false;
  });

  it('laat een verzoek met een geldig token gewoon door als alles werkt', async () => {
    expect((await request(app).get('/ik').set('Authorization', `Bearer ${token}`)).status).toBe(200);
  });

  it('weigert het verzoek in plaats van de controle over te slaan', async () => {
    storing.aan = true;

    const antwoord = await request(app).get('/ik').set('Authorization', `Bearer ${token}`);

    expect(antwoord.status).toBe(503);
    expect(antwoord.body).toHaveProperty('error');
  });

  it('hangt bij optionele aanmelding dan geen gebruiker aan het verzoek', async () => {
    storing.aan = true;

    const antwoord = await request(app).get('/misschien').set('Authorization', `Bearer ${token}`);

    expect(antwoord.status).toBe(200);
    expect(antwoord.body).toBeNull();
  });
});
