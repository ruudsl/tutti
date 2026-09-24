/**
 * Het logo van een vereniging: wat er binnenkomt en hoe het teruggaat.
 *
 * GET /settings/logo/:bestand is openbaar - het inlogscherm toont het logo
 * zonder token - en draait op het domein van Tutti. De opslag nam de extensie
 * van de uploader over en keek alleen naar het mimetype dat de browser
 * meestuurde; sendFile koos het Content-Type bij die extensie. Een beheerder
 * die "logo.html" met mimetype image/png instuurde, kreeg een pagina op het
 * Tutti-domein waarvan het script draaide bij iedereen die de link opende.
 *
 * Wat hoort: het soort bestand volgt uit de inhoud, de extensie uit dat
 * soort, en het Content-Type bij serveren komt uit een vaste lijst met
 * `nosniff` erbij. Wat geen afbeelding is, komt nooit als html terug.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import fs from 'fs';
import path from 'path';
import '../setup';
import db from '../../database/connection';
import config from '../../config';
import settingsRoutes from '../../routes/settings';
import { errorHandler } from '../../middleware/errorHandler';
import { createTestEnvironment, TestAssociation } from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api/settings', settingsRoutes);
app.use(errorHandler);

const logoMap = path.resolve(config.uploadDir, 'logos');

// Een echte PNG van 1 bij 1 beeldpunt.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const HTML = Buffer.from('<!doctype html><html><body><script>fetch("/api/auth/me")</script></body></html>');
const SVG = Buffer.from(
  '<?xml version="1.0"?>\n<!-- logo -->\n<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>',
);

describe('logo van een vereniging', () => {
  let vereniging: TestAssociation;
  let beheerderToken: string;
  const aangemaakt: string[] = [];

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    beheerderToken = omgeving.adminToken;
  });

  afterEach(() => {
    const rij = db.prepare('SELECT logo_path FROM associations WHERE id = ?').get(vereniging.id) as
      { logo_path: string | null } | undefined;
    for (const bestand of [...aangemaakt.splice(0), rij?.logo_path].filter(Boolean) as string[]) {
      fs.rmSync(bestand, { force: true });
    }
  });

  const upload = (inhoud: Buffer, bestandsnaam: string, contentType: string) =>
    request(app)
      .post('/api/settings/logo')
      .set('Authorization', `Bearer ${beheerderToken}`)
      .attach('logo', inhoud, { filename: bestandsnaam, contentType });

  const logoPad = () =>
    (db.prepare('SELECT logo_path FROM associations WHERE id = ?').get(vereniging.id) as { logo_path: string | null })
      .logo_path;

  /** Een bestand zoals een eerdere upload het kan hebben achtergelaten. */
  const legNeer = (bestandsnaam: string, inhoud: Buffer) => {
    fs.mkdirSync(logoMap, { recursive: true });
    const pad = path.join(logoMap, bestandsnaam);
    fs.writeFileSync(pad, inhoud);
    aangemaakt.push(pad);
    return bestandsnaam;
  };

  describe('uploaden', () => {
    it('weigert html, ook als de browser zegt dat het een png is', async () => {
      const voor = fs.existsSync(logoMap) ? fs.readdirSync(logoMap) : [];
      const antwoord = await upload(HTML, 'logo.html', 'image/png');

      expect(antwoord.status).toBe(400);
      expect(logoPad()).toBeNull();
      // Ook het voorlopige bestand van multer is weer weg.
      expect(fs.readdirSync(logoMap).filter((naam) => !voor.includes(naam))).toEqual([]);
    });

    it('weigert een html-pagina waar een svg in staat', async () => {
      const inhoud = Buffer.from('<html><body><svg></svg><script>alert(1)</script></body></html>');
      const antwoord = await upload(inhoud, 'logo.svg', 'image/svg+xml');

      expect(antwoord.status).toBe(400);
      expect(logoPad()).toBeNull();
    });

    it('neemt de extensie uit de inhoud, niet uit de bestandsnaam', async () => {
      const antwoord = await upload(PNG, 'logo.html', 'text/html');

      expect(antwoord.status).toBe(200);
      expect(antwoord.body.logoUrl).toMatch(/\.png$/);
      expect(logoPad()).toMatch(/\.png$/);
    });

    it('bewaart het bestand ongewijzigd', async () => {
      await upload(PNG, 'logo.png', 'image/png');

      expect(fs.readFileSync(logoPad() ?? '')).toEqual(PNG);
    });
  });

  describe('serveren', () => {
    it('serveert een png als image/png met nosniff', async () => {
      const { body } = await upload(PNG, 'logo.png', 'image/png');

      const antwoord = await request(app).get(body.logoUrl);

      expect(antwoord.status).toBe(200);
      expect(antwoord.headers['content-type']).toBe('image/png');
      expect(antwoord.headers['x-content-type-options']).toBe('nosniff');
    });

    it('serveert een bestaand logo met de extensie .html nooit als html', async () => {
      const naam = legNeer('logo-oud-aanval.html', HTML);

      const antwoord = await request(app).get(`/api/settings/logo/${naam}`);

      expect(antwoord.headers['content-type'] ?? '').not.toMatch(/html|javascript/);
      expect(antwoord.text ?? '').not.toContain('<script>');
      expect(antwoord.status).toBe(404);
    });

    it('serveert html achter een afbeeldingsextensie niet', async () => {
      const naam = legNeer('logo-vermomd.png', HTML);

      const antwoord = await request(app).get(`/api/settings/logo/${naam}`);

      expect(antwoord.status).toBe(404);
    });

    it('serveert een bestaande png met een vreemde extensie als png', async () => {
      const naam = legNeer('logo-oud.bin', PNG);

      const antwoord = await request(app).get(`/api/settings/logo/${naam}`);

      expect(antwoord.status).toBe(200);
      expect(antwoord.headers['content-type']).toBe('image/png');
    });

    it('serveert een svg als bijlage, met een CSP zonder script', async () => {
      const { body, status } = await upload(SVG, 'logo.svg', 'image/svg+xml');
      expect(status).toBe(200);
      expect(body.logoUrl).toMatch(/\.svg$/);

      const antwoord = await request(app).get(body.logoUrl);

      expect(antwoord.status).toBe(200);
      expect(antwoord.headers['content-type']).toBe('image/svg+xml');
      expect(antwoord.headers['x-content-type-options']).toBe('nosniff');
      expect(antwoord.headers['content-disposition']).toMatch(/^attachment/);
      expect(antwoord.headers['content-security-policy']).toMatch(/default-src 'none'/);
      expect(antwoord.headers['content-security-policy']).toMatch(/sandbox/);
    });
  });
});
