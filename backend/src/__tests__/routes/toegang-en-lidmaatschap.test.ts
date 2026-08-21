/**
 * De grens tussen "beheerder van een vereniging" en "toegang tot een account".
 *
 * Vier dingen die uit elkaar lagen en dat niet hadden moeten doen:
 *
 *   - `users.status` bepaalt of je binnenkomt, maar werd bij het inloggen
 *     nergens gelezen. Een lid uit dienst nemen zette status op 'inactive' en
 *     dat lid kon daarna gewoon opnieuw inloggen.
 *   - `user_associations.role` is de rol in die ene vereniging, maar
 *     switch-association muntte het nieuwe token uit de globale `users.role`.
 *   - Een lid uit een vereniging verwijderen zette alleen
 *     `user_associations.status`, terwijl elke andere route op
 *     `users.association_id` filtert.
 *   - `orchestraIds` uit de aanvraag werd alleen als uuid gevalideerd, niet
 *     tegen de eigen vereniging.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import authRoutes from '../../routes/auth';
import usersRoutes from '../../routes/users';
import multiAssociationRoutes from '../../routes/multi-association';
import { errorHandler } from '../../middleware/errorHandler';
import {
  createTestAssociation,
  createTestOrchestra,
  createTestUser,
  generateTestToken,
  createTestEnvironment,
} from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api', rateLimit({ windowMs: 60_000, limit: 10_000 }));
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/multi-association', multiAssociationRoutes);
app.use(errorHandler);

let adminToken: string;
let associationId: string;

beforeEach(() => {
  const omgeving = createTestEnvironment();
  adminToken = omgeving.adminToken;
  associationId = omgeving.association.id;
});

/** Een lid met een wachtwoord dat we kennen, zodat we er echt mee kunnen inloggen. */
function lidMetWachtwoord(email: string, wachtwoord: string, associatie = associationId) {
  const lid = createTestUser(associatie, { email, role: 'member' });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(wachtwoord, 10), lid.id);
  return lid;
}

describe('Inloggen kijkt naar de status van het account', () => {
  it('laat een actief lid gewoon binnen', async () => {
    lidMetWachtwoord('actief@test.com', 'GeheimWachtwoord1!');

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'actief@test.com', password: 'GeheimWachtwoord1!' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });

  it('weigert een lid dat uit dienst is', async () => {
    const lid = lidMetWachtwoord('vertrokken@test.com', 'GeheimWachtwoord1!');
    db.prepare("UPDATE users SET status = 'inactive' WHERE id = ?").run(lid.id);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'vertrokken@test.com', password: 'GeheimWachtwoord1!' });

    expect(res.status).toBe(403);
    expect(res.body.token).toBeUndefined();
  });

  it('verklapt niet welke adressen uit dienst zijn', async () => {
    // De statuscontrole staat na de wachtwoordcontrole. Zou hij ervoor staan,
    // dan kon iedereen met een lijst adressen zien welke er bestaan.
    const lid = lidMetWachtwoord('stil@test.com', 'GeheimWachtwoord1!');
    db.prepare("UPDATE users SET status = 'inactive' WHERE id = ?").run(lid.id);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'stil@test.com', password: 'FoutWachtwoord1!' });

    expect(res.status).toBe(401);
  });

  it('laat een gepromoveerd contact wel binnen', async () => {
    // Een contact dat gebruiker wordt krijgt status 'pending' met een
    // wachtwoord dat niemand kent. Dat pad loopt via 'wachtwoord vergeten' en
    // moet open blijven.
    const lid = lidMetWachtwoord('nieuw@test.com', 'GeheimWachtwoord1!');
    db.prepare("UPDATE users SET status = 'pending' WHERE id = ?").run(lid.id);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nieuw@test.com', password: 'GeheimWachtwoord1!' });

    expect(res.status).toBe(200);
  });
});

describe('Een verlopen reset-link werkt niet meer', () => {
  it('weigert een token dat een uur geleden verliep', async () => {
    // De vervaltijd staat als ISO-string in de database en werd met
    // datetime('now') vergeleken. Omdat 'T' groter is dan een spatie won de
    // ISO-vorm altijd zolang de datum gelijk was: het token bleef geldig tot
    // middernacht UTC in plaats van een uur.
    const lid = lidMetWachtwoord('reset@test.com', 'GeheimWachtwoord1!');
    const token = 'a'.repeat(64);
    const gehasht = crypto.createHash('sha256').update(token).digest('hex');
    const eenUurGeleden = new Date(Date.now() - 3600_000).toISOString();

    db.prepare('INSERT INTO password_reset_tokens (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)').run(
      uuidv4(),
      lid.id,
      gehasht,
      eenUurGeleden,
    );

    const res = await request(app).post('/api/auth/reset-password').send({ token, newPassword: 'NieuwWachtwoord1!' });

    expect(res.status).toBe(400);

    // En het wachtwoord is echt niet veranderd.
    const na = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(lid.id) as { password_hash: string };
    expect(bcrypt.compareSync('GeheimWachtwoord1!', na.password_hash)).toBe(true);
  });

  it('accepteert een token dat nog geldig is', async () => {
    const lid = lidMetWachtwoord('reset2@test.com', 'GeheimWachtwoord1!');
    const token = 'b'.repeat(64);
    const gehasht = crypto.createHash('sha256').update(token).digest('hex');
    const overEenUur = new Date(Date.now() + 3600_000).toISOString();

    db.prepare('INSERT INTO password_reset_tokens (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)').run(
      uuidv4(),
      lid.id,
      gehasht,
      overEenUur,
    );

    const res = await request(app).post('/api/auth/reset-password').send({ token, newPassword: 'NieuwWachtwoord1!' });

    expect(res.status).toBe(200);
  });
});

describe('Een orkest van een andere vereniging is geen keuze', () => {
  it('weigert het bij het aanmaken van een lid', async () => {
    const andere = createTestAssociation();
    const hunOrkest = createTestOrchestra(andere.id);

    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: 'nieuwlid@test.com',
        password: 'GeheimWachtwoord1!',
        firstName: 'Nieuw',
        lastName: 'Lid',
        role: 'member',
        orchestraIds: [hunOrkest.id],
      });

    expect(res.status).toBe(400);
    const koppelingen = db
      .prepare('SELECT COUNT(*) as n FROM user_orchestras WHERE orchestra_id = ?')
      .get(hunOrkest.id) as { n: number };
    expect(koppelingen.n).toBe(0);
  });

  it('weigert het bij het bijwerken van een lid', async () => {
    const andere = createTestAssociation();
    const hunOrkest = createTestOrchestra(andere.id);
    const lid = createTestUser(associationId, { email: 'eigenlid@test.com', role: 'member' });

    const res = await request(app)
      .put(`/api/users/${lid.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ orchestraIds: [hunOrkest.id] });

    expect(res.status).toBe(400);
  });

  it('laat een eigen orkest gewoon toe', async () => {
    const eigenOrkest = createTestOrchestra(associationId);
    const lid = createTestUser(associationId, { email: 'eigenlid2@test.com', role: 'member' });

    const res = await request(app)
      .put(`/api/users/${lid.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ orchestraIds: [eigenOrkest.id] });

    expect(res.status).toBe(200);
  });
});

describe('Wisselen van vereniging neemt de rol van die vereniging', () => {
  it('een beheerder bij A is gewoon lid bij B', async () => {
    const b = createTestAssociation();
    const beheerderA = createTestUser(associationId, { email: 'beheerder-a@test.com', role: 'admin' });
    db.prepare(
      "INSERT INTO user_associations (user_id, association_id, role, status) VALUES (?, ?, 'member', 'active')",
    ).run(beheerderA.id, b.id);

    const res = await request(app)
      .post('/api/multi-association/switch-association')
      .set('Authorization', `Bearer ${generateTestToken(beheerderA)}`)
      .send({ associationId: b.id });

    expect(res.status).toBe(200);
    const payload = jwt.decode(res.body.token) as { role: string; associationId: string };
    expect(payload.role).toBe('member');
  });

  it('en kan bij B dan ook geen leden beheren', async () => {
    const b = createTestAssociation();
    const beheerderA = createTestUser(associationId, { email: 'beheerder-a2@test.com', role: 'admin' });
    db.prepare(
      "INSERT INTO user_associations (user_id, association_id, role, status) VALUES (?, ?, 'member', 'active')",
    ).run(beheerderA.id, b.id);

    const wissel = await request(app)
      .post('/api/multi-association/switch-association')
      .set('Authorization', `Bearer ${generateTestToken(beheerderA)}`)
      .send({ associationId: b.id });

    const res = await request(app).get('/api/users').set('Authorization', `Bearer ${wissel.body.token}`);

    expect(res.status).toBe(403);
  });

  it('houdt de eigen rol als er geen lidmaatschapsrij is', async () => {
    // Je eigen vereniging heeft die rij niet - die ontstaat alleen bij een
    // uitnodiging. Wisselen naar jezelf mag je rol dus niet wegnemen.
    const beheerder = createTestUser(associationId, { email: 'beheerder-eigen@test.com', role: 'admin' });

    const res = await request(app)
      .post('/api/multi-association/switch-association')
      .set('Authorization', `Bearer ${generateTestToken(beheerder)}`)
      .send({ associationId });

    expect(res.status).toBe(200);
    const payload = jwt.decode(res.body.token) as { role: string };
    expect(payload.role).toBe('admin');
  });
});

describe('Een lid verwijderen verwijdert het echt', () => {
  it('haalt het lid ook uit users.association_id', async () => {
    const lid = createTestUser(associationId, { email: 'weg@test.com', role: 'member' });
    db.prepare(
      "INSERT INTO user_associations (user_id, association_id, role, status) VALUES (?, ?, 'member', 'active')",
    ).run(lid.id, associationId);

    const res = await request(app)
      .delete(`/api/multi-association/members/${lid.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const na = db.prepare('SELECT association_id FROM users WHERE id = ?').get(lid.id) as {
      association_id: string | null;
    };
    expect(na.association_id).not.toBe(associationId);
  });

  it('zet het lid terug naar een vereniging waar hij nog wel lid is', async () => {
    const b = createTestAssociation();
    const lid = createTestUser(associationId, { email: 'weg2@test.com', role: 'member' });
    db.prepare(
      "INSERT INTO user_associations (user_id, association_id, role, status) VALUES (?, ?, 'member', 'active')",
    ).run(lid.id, associationId);
    db.prepare(
      "INSERT INTO user_associations (user_id, association_id, role, status) VALUES (?, ?, 'member', 'active')",
    ).run(lid.id, b.id);

    await request(app).delete(`/api/multi-association/members/${lid.id}`).set('Authorization', `Bearer ${adminToken}`);

    const na = db.prepare('SELECT association_id FROM users WHERE id = ?').get(lid.id) as {
      association_id: string | null;
    };
    expect(na.association_id).toBe(b.id);
  });
});
