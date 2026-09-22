/**
 * Wie mag een realtime verbinding openen? Dezelfde mensen, met hetzelfde
 * token en onder dezelfde voorwaarden, als wie een gewoon API-verzoek mag doen.
 *
 * Tot september 2026 keek de websocket alleen of het token ondertekend was.
 * Een sessie die na afmelden of een wachtwoordwijziging was beëindigd, bleef
 * hier dus werken - met chatberichten en meldingen erbij. En de sleutel kwam
 * uit de omgeving met 'dev-secret' als terugval, in plaats van uit config.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import config from '../config';
import db from '../database/connection';
import { generateToken } from '../middleware/auth';
import { generateDownloadToken } from '../utils/downloadToken';
import { revokeUserSessions } from '../utils/sessionStore';
import { authenticeerSocket, AuthenticatedSocket } from '../websocket';
import { createTestEnvironment, TestUser } from './testUtils';

let lid: TestUser;

beforeEach(() => {
  lid = createTestEnvironment().memberUser;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function inlogtoken(gebruiker: TestUser): string {
  return generateToken({
    id: gebruiker.id,
    email: gebruiker.email,
    role: gebruiker.role,
    association_id: gebruiker.associationId,
  });
}

/** Voert de aanmeldstap uit en geeft de socket en de eventuele weigering terug. */
function meldAan(token: unknown) {
  const socket = {
    handshake: { auth: { token }, headers: { 'user-agent': 'test' }, address: '127.0.0.1' },
  } as unknown as AuthenticatedSocket;
  let fout: Error | undefined;
  let doorgelaten = false;
  authenticeerSocket(socket, (f) => {
    fout = f;
    doorgelaten = !f;
  });
  return { socket, fout, doorgelaten };
}

describe('realtime aanmelden', () => {
  it('laat een gewoon inlogtoken binnen en zet gebruiker en vereniging op de socket', () => {
    const { socket, doorgelaten } = meldAan(inlogtoken(lid));

    expect(doorgelaten).toBe(true);
    expect(socket.userId).toBe(lid.id);
    expect(socket.associationId).toBe(lid.associationId);
  });

  it('gebruikt de sleutel uit config, ook zonder JWT_SECRET in de omgeving', () => {
    // Lokaal ontwikkelen zonder .env: config valt terug op zijn eigen sleutel,
    // de websocket viel terug op 'dev-secret'. Dan weigerde realtime iedereen.
    vi.stubEnv('JWT_SECRET', '');

    expect(meldAan(inlogtoken(lid)).doorgelaten).toBe(true);
  });

  it('weigert een token waarvan de sessie is beëindigd', () => {
    const token = inlogtoken(lid);
    expect(meldAan(token).doorgelaten).toBe(true);

    // Wat afmelden overal, en een wachtwoordwijziging op de andere apparaten, doet.
    revokeUserSessions(lid.id);

    const { fout } = meldAan(token);
    expect(fout?.message).toBe('Invalid token');
  });

  it('weigert een token van een gebruiker die er niet meer is', () => {
    const token = inlogtoken(lid);
    db.prepare("UPDATE users SET deleted_at = datetime('now') WHERE id = ?").run(lid.id);

    expect(meldAan(token).fout?.message).toBe('Invalid token');
  });

  it('weigert een downloadtoken - dat is er voor één bestand, vijf minuten lang', () => {
    const token = generateDownloadToken(lid.id, lid.associationId, lid.role, lid.email);

    expect(meldAan(token).fout?.message).toBe('Invalid token');
  });

  it('weigert een gastbestel-token van de kaartverkoop', () => {
    const token = jwt.sign(
      {
        type: 'guest_checkout',
        email: 'gast@example.com',
        name: 'Gast',
        authProvider: 'google',
        exp: Math.floor(Date.now() / 1000) + 600,
      },
      config.jwtSecret,
    );

    expect(meldAan(token).fout?.message).toBe('Invalid token');
  });

  it('weigert een token met een andere sleutel', () => {
    const token = jwt.sign({ id: lid.id, associationId: lid.associationId }, 'een-andere-sleutel-van-32-tekens!!');

    expect(meldAan(token).fout?.message).toBe('Invalid token');
  });

  it('vraagt om een token als er geen is', () => {
    expect(meldAan(undefined).fout?.message).toBe('Authentication required');
    expect(meldAan({ geen: 'tekst' }).fout?.message).toBe('Authentication required');
  });
});
