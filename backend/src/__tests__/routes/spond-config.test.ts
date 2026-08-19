/**
 * De Spond-koppeling bijwerken zonder het wachtwoord opnieuw te typen.
 *
 * Het bewerkscherm vult het e-mailadres in maar laat het wachtwoordveld leeg,
 * omdat het opgeslagen wachtwoord versleuteld in de database staat en niet
 * terug te tonen is. De route eiste beide velden, dus wie alleen een andere
 * groep koos kreeg "wachtwoord verplicht" terug - en zonder groep verschijnen
 * de synchroniseerknoppen niet, waardoor de koppeling onbruikbaar bleef.
 *
 * Leeg laten betekent nu: houd het bestaande wachtwoord. Er wordt nog steeds
 * echt ingelogd bij Spond, met dat opgeslagen wachtwoord, zodat een koppeling
 * die het niet meer doet niet stilletjes blijft staan.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import rateLimit from 'express-rate-limit';
import '../setup';
import db from '../../database/connection';
import spondRoutes from '../../routes/spond';
import { errorHandler } from '../../middleware/errorHandler';
import { createTestEnvironment } from '../testUtils';
import { decryptPassword } from '../../services/spond';

/**
 * Een eigen app in plaats van de gedeelde test-app. De Spond-routes staan daar
 * niet in, en ze erbij zetten trekt het hele bestand de dekkingsmeting in
 * zonder dat die tests het afdekken.
 *
 * De rate limiter volgt index.ts, waar er een op /api staat. Zonder hem is dit
 * een route met een autorisatiecheck en geen limiet, en dat is precies het
 * patroon dat de beveiligingsanalyse aanmerkt. De grens staat zo hoog dat geen
 * enkele test hem raakt.
 */
const app = express();
app.use(express.json());
app.use('/api', rateLimit({ windowMs: 60_000, limit: 10_000 }));
app.use('/api/spond', spondRoutes);
app.use(errorHandler);

let adminToken: string;
let associationId: string;

function spondAntwoordt(status = 200, body: unknown = { loginToken: 'test-token' }) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(body),
      json: async () => body,
    })),
  );
}

beforeEach(() => {
  const omgeving = createTestEnvironment();
  adminToken = omgeving.adminToken;
  associationId = omgeving.association.id;
  db.prepare('DELETE FROM spond_config WHERE association_id = ?').run(associationId);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function stelIn(body: Record<string, unknown>) {
  return request(app).put('/api/spond/config').set('Authorization', `Bearer ${adminToken}`).send(body);
}

describe('Spond-configuratie opslaan', () => {
  it('slaat een nieuwe koppeling op', async () => {
    spondAntwoordt();

    const res = await stelIn({ username: 'iemand@example.com', password: 'Geheim123', syncEnabled: true });

    expect(res.status).toBe(200);
    const rij = db
      .prepare('SELECT username, password_encrypted FROM spond_config WHERE association_id = ?')
      .get(associationId) as any;
    expect(rij.username).toBe('iemand@example.com');
    expect(decryptPassword(rij.password_encrypted)).toBe('Geheim123');
  });

  it('eist een wachtwoord als er nog niets staat', async () => {
    spondAntwoordt();

    const res = await stelIn({ username: 'iemand@example.com', syncEnabled: true });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('wachtwoord');
  });

  it('wijzigt de groep zonder dat het wachtwoord opnieuw wordt getypt', async () => {
    spondAntwoordt();
    await stelIn({ username: 'iemand@example.com', password: 'Geheim123', syncEnabled: true });

    const res = await stelIn({ username: 'iemand@example.com', groupId: 'groep-42', syncEnabled: true });

    expect(res.status).toBe(200);
    const rij = db
      .prepare('SELECT group_id, password_encrypted FROM spond_config WHERE association_id = ?')
      .get(associationId) as any;
    expect(rij.group_id).toBe('groep-42');
    // Het opgeslagen wachtwoord hoort ongemoeid te blijven, niet overschreven
    // met een lege waarde.
    expect(decryptPassword(rij.password_encrypted)).toBe('Geheim123');
  });

  it('controleert bij hergebruik nog steeds echt bij Spond', async () => {
    spondAntwoordt();
    await stelIn({ username: 'iemand@example.com', password: 'Geheim123', syncEnabled: true });

    // Spond weigert nu; een koppeling die het niet meer doet mag niet
    // stilletjes blijven staan alsof er niets aan de hand is.
    spondAntwoordt(401, 'Unauthorized');
    const res = await stelIn({ username: 'iemand@example.com', groupId: 'groep-42', syncEnabled: true });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('af');
  });

  it('eist wel een wachtwoord bij een ander e-mailadres', async () => {
    spondAntwoordt();
    await stelIn({ username: 'iemand@example.com', password: 'Geheim123', syncEnabled: true });

    // Anders zou een tweede account de opgeslagen gegevens van het eerste
    // kunnen hergebruiken.
    const res = await stelIn({ username: 'iemandanders@example.com', groupId: 'groep-42' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('wachtwoord');
  });

  it('vervangt het wachtwoord wel als er een nieuw wordt meegegeven', async () => {
    spondAntwoordt();
    await stelIn({ username: 'iemand@example.com', password: 'Geheim123', syncEnabled: true });

    const res = await stelIn({ username: 'iemand@example.com', password: 'Nieuw456', syncEnabled: true });

    expect(res.status).toBe(200);
    const rij = db
      .prepare('SELECT password_encrypted FROM spond_config WHERE association_id = ?')
      .get(associationId) as any;
    expect(decryptPassword(rij.password_encrypted)).toBe('Nieuw456');
  });
});
