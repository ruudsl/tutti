/**
 * Een profielfoto komt altijd terug als afbeelding, nooit als script of pagina.
 *
 * De foto werd opgeslagen met de extensie die de client meestuurde en met
 * res.sendFile geserveerd, dat het Content-Type uit die extensie afleidt. De
 * controle op de eerste bytes liet een GIF-polyglot door - `GIF89a/*…*\/=1;`
 * gevolgd door JavaScript is zowel een geldig GIF-begin als geldig script.
 * Met `.js` of `.html` als naam kwam dat terug als script of pagina op ons
 * eigen domein (stored XSS), en met `Cache-Control: public` ook nog in
 * gedeelde caches.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import fs from 'fs';
import path from 'path';
import '../setup';
import db from '../../database/connection';
import config from '../../config';
import usersRoutes from '../../routes/users';
import { errorHandler } from '../../middleware/errorHandler';
import { createTestEnvironment, TestUser } from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api/users', usersRoutes);
app.use(errorHandler);

const fotoMap = path.resolve(config.uploadDir, 'profile-photos');

/** Geldig GIF-begin en tegelijk geldig JavaScript. */
const POLYGLOT = Buffer.from('GIF89a/*\x00\x00\x00\x00*/=1;alert(document.domain);//', 'latin1');

describe('profielfoto: inhoud bepaalt het type', () => {
  let lid: TestUser;
  let beheerderToken: string;
  const opgeruimd: string[] = [];

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    lid = omgeving.memberUser;
    beheerderToken = omgeving.adminToken;
    fs.mkdirSync(fotoMap, { recursive: true });
  });

  afterEach(() => {
    const rij = db.prepare('SELECT profile_photo_path FROM users WHERE id = ?').get(lid.id) as
      { profile_photo_path: string | null } | undefined;
    for (const bestand of [...opgeruimd.splice(0), rij?.profile_photo_path]) {
      if (bestand && fs.existsSync(bestand)) fs.unlinkSync(bestand);
    }
  });

  function zetOudeFoto(naam: string, inhoud: Buffer): void {
    const bestand = path.join(fotoMap, naam);
    fs.writeFileSync(bestand, inhoud);
    opgeruimd.push(bestand);
    db.prepare('UPDATE users SET profile_photo_path = ? WHERE id = ?').run(bestand, lid.id);
  }

  const haalFoto = () =>
    request(app).get(`/api/users/${lid.id}/photo`).set('Authorization', `Bearer ${beheerderToken}`);

  it('slaat een upload op met de extensie van de inhoud, niet die van de client', async () => {
    const antwoord = await request(app)
      .post(`/api/users/${lid.id}/photo`)
      .set('Authorization', `Bearer ${beheerderToken}`)
      .attach('photo', POLYGLOT, { filename: 'foto.js', contentType: 'image/png' });

    expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);

    const rij = db.prepare('SELECT profile_photo_path FROM users WHERE id = ?').get(lid.id) as {
      profile_photo_path: string;
    };
    expect(path.extname(rij.profile_photo_path)).toBe('.gif');
    expect(fs.existsSync(rij.profile_photo_path)).toBe(true);
  });

  it('serveert een geüploade polyglot als image/gif, met nosniff en private', async () => {
    await request(app)
      .post(`/api/users/${lid.id}/photo`)
      .set('Authorization', `Bearer ${beheerderToken}`)
      .attach('photo', POLYGLOT, { filename: 'foto.js', contentType: 'image/png' });

    const antwoord = await haalFoto();

    expect(antwoord.status).toBe(200);
    expect(antwoord.headers['content-type']).toBe('image/gif');
    expect(antwoord.headers['x-content-type-options']).toBe('nosniff');
    expect(antwoord.headers['cache-control']).toMatch(/private/);
    expect(antwoord.headers['cache-control']).not.toMatch(/public/);
  });

  it('serveert een oude foto met extensie .js als afbeelding, niet als script', async () => {
    zetOudeFoto('profile-oud.js', POLYGLOT);

    const antwoord = await haalFoto();

    expect(antwoord.status).toBe(200);
    expect(antwoord.headers['content-type']).toBe('image/gif');
    expect(antwoord.headers['x-content-type-options']).toBe('nosniff');
  });

  it('serveert een oud bestand dat geen afbeelding is helemaal niet', async () => {
    zetOudeFoto('profile-oud.html', Buffer.from('<html><script>alert(1)</script></html>'));

    const antwoord = await haalFoto();

    expect(antwoord.status).toBe(404);
    expect(antwoord.headers['content-type']).not.toMatch(/html|javascript/);
  });

  it('weigert een SVG, ook met een afbeeldingstype', async () => {
    const antwoord = await request(app)
      .post(`/api/users/${lid.id}/photo`)
      .set('Authorization', `Bearer ${beheerderToken}`)
      .attach('photo', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), {
        filename: 'foto.png',
        contentType: 'image/png',
      });

    expect(antwoord.status).toBe(400);
    const rij = db.prepare('SELECT profile_photo_path FROM users WHERE id = ?').get(lid.id) as {
      profile_photo_path: string | null;
    };
    expect(rij.profile_photo_path).toBeNull();
  });
});
