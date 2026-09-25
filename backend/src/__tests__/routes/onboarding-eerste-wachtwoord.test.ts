/**
 * Het tijdelijke wachtwoord van een nieuw lid.
 *
 * Bij het aanmelden (POST /onboarding/member) ging het wachtwoord leesbaar mee
 * in onboarding_tasks.metadata. Elke beheerder kon het daar later nog opvragen,
 * en het stond in elke reservekopie - ook als het lid het nooit had gewijzigd
 * en het dus nog zijn wachtwoord was.
 *
 * Nu: één keer in het antwoord, nergens bewaard, en het lid moet het bij de
 * eerste keer inloggen wijzigen (users.moet_wachtwoord_wijzigen). Een
 * migratie wist wat er al stond.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import express from 'express';
import '../setup';
import db from '../../database/connection';
import app from '../testApp';
import onboardingRoutes from '../../routes/onboarding';
import { errorHandler } from '../../middleware/errorHandler';
import { createTestEnvironment, createTestUser, TestAssociation } from '../testUtils';
import { up, down } from '../../migrations/20260925000001_eerste_wachtwoord_niet_bewaren';

const onboardingApp = express();
onboardingApp.use(express.json());
onboardingApp.use('/api/onboarding', onboardingRoutes);
onboardingApp.use(errorHandler);

describe('Het tijdelijke wachtwoord van een nieuw lid', () => {
  let vereniging: TestAssociation;
  let beheerderToken: string;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    beheerderToken = omgeving.adminToken;
  });

  async function meldAan(email = 'nieuw.lid@vereniging.nl') {
    const antwoord = await request(onboardingApp)
      .post('/api/onboarding/member')
      .set('Authorization', `Bearer ${beheerderToken}`)
      .send({ firstName: 'Nieuw', lastName: 'Lid', email });
    expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);
    return antwoord;
  }

  describe('bij het aanmelden', () => {
    it('staat één keer in het antwoord, en niet in een cache', async () => {
      const antwoord = await meldAan();

      expect(typeof antwoord.body.tempPassword).toBe('string');
      expect(antwoord.body.tempPassword.length).toBeGreaterThanOrEqual(12);
      expect(antwoord.body.mustChangePassword).toBe(true);
      expect(antwoord.headers['cache-control']).toBe('no-store');
    });

    it('wordt niet bewaard bij de taken van het lid', async () => {
      const antwoord = await meldAan();
      const wachtwoord: string = antwoord.body.tempPassword;

      const rijen = db
        .prepare('SELECT task_type, metadata, error_message FROM onboarding_tasks WHERE user_id = ?')
        .all(antwoord.body.userId) as { task_type: string; metadata: string | null; error_message: string | null }[];
      expect(rijen.length).toBeGreaterThan(0);
      expect(JSON.stringify(rijen)).not.toContain(wachtwoord);
      expect(JSON.stringify(rijen)).not.toContain('tempPassword');

      const taken = await request(onboardingApp)
        .get(`/api/onboarding/tasks/${antwoord.body.userId}`)
        .set('Authorization', `Bearer ${beheerderToken}`);
      expect(taken.status).toBe(200);
      expect(JSON.stringify(taken.body)).not.toContain(wachtwoord);
    });

    it('zet de vlag dat het lid zijn wachtwoord moet wijzigen', async () => {
      const antwoord = await meldAan();

      const rij = db.prepare('SELECT moet_wachtwoord_wijzigen FROM users WHERE id = ?').get(antwoord.body.userId) as {
        moet_wachtwoord_wijzigen: number;
      };
      expect(rij.moet_wachtwoord_wijzigen).toBe(1);
    });
  });

  describe('bij het inloggen', () => {
    it('meldt dat het wachtwoord gewijzigd moet worden, bij inloggen en in /me', async () => {
      const aangemeld = await meldAan();

      const login = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nieuw.lid@vereniging.nl', password: aangemeld.body.tempPassword });
      expect(login.status).toBe(200);
      expect(login.body.user.mustChangePassword).toBe(true);

      const ik = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${login.body.token}`);
      expect(ik.body.mustChangePassword).toBe(true);
    });

    it('meldt het niet voor een lid met een eigen wachtwoord', async () => {
      const lid = createTestUser(vereniging.id, { email: 'gewoon@vereniging.nl' });

      const login = await request(app).post('/api/auth/login').send({ email: lid.email, password: lid.password });
      expect(login.body.user.mustChangePassword).toBe(false);
    });

    it('vervalt zodra het lid zijn wachtwoord wijzigt', async () => {
      const aangemeld = await meldAan();
      const login = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nieuw.lid@vereniging.nl', password: aangemeld.body.tempPassword });

      const gewijzigd = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${login.body.token}`)
        .send({ currentPassword: aangemeld.body.tempPassword, newPassword: 'MijnEigenWachtwoord!2026' });
      expect(gewijzigd.status, JSON.stringify(gewijzigd.body)).toBe(200);

      const ik = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${login.body.token}`);
      expect(ik.body.mustChangePassword).toBe(false);
    });

    it('vervalt ook na herstel via een resetlink', async () => {
      const aangemeld = await meldAan();
      const vlag = () =>
        (
          db.prepare('SELECT moet_wachtwoord_wijzigen AS v FROM users WHERE id = ?').get(aangemeld.body.userId) as {
            v: number;
          }
        ).v;
      expect(vlag()).toBe(1);
      const token = 'resetlink-voor-nieuw-lid';
      db.prepare(`INSERT INTO password_reset_tokens (id, user_id, token, expires_at, used) VALUES (?, ?, ?, ?, 0)`).run(
        'reset-1',
        aangemeld.body.userId,
        crypto.createHash('sha256').update(token).digest('hex'),
        new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      );

      const hersteld = await request(app)
        .post('/api/auth/reset-password')
        .send({ token, newPassword: 'MijnEigenWachtwoord!2026' });
      expect(hersteld.status).toBe(200);
      expect(vlag()).toBe(0);
    });
  });

  describe('de migratie voor wat er al stond', () => {
    function taak(id: string, userId: string, metadata: string | null) {
      db.prepare(
        `INSERT INTO onboarding_tasks (id, user_id, association_id, task_type, status, metadata)
         VALUES (?, ?, ?, 'harmonie_create', 'completed', ?)`,
      ).run(id, userId, vereniging.id, metadata);
    }

    it('wist bewaarde wachtwoorden en laat de rest van de metadata staan', () => {
      const lid = createTestUser(vereniging.id, { email: 'oud@vereniging.nl' });
      taak('t1', lid.id, JSON.stringify({ tempPassword: 'Oud-Wachtwoord-1' }));
      taak('t2', lid.id, JSON.stringify({ tempPassword: 'Oud-Wachtwoord-2', bron: 'wizard' }));
      taak('t3', lid.id, JSON.stringify({ privateEmail: 'prive@example.org' }));
      taak('t4', lid.id, '{kapot tempPassword');

      up();

      const rijen = db.prepare('SELECT id, metadata FROM onboarding_tasks ORDER BY id').all() as {
        id: string;
        metadata: string | null;
      }[];
      expect(rijen).toEqual([
        { id: 't1', metadata: null },
        { id: 't2', metadata: JSON.stringify({ bron: 'wizard' }) },
        { id: 't3', metadata: JSON.stringify({ privateEmail: 'prive@example.org' }) },
        { id: 't4', metadata: null },
      ]);
    });

    it('laat leden die hun wachtwoord nooit wijzigden dat alsnog doen', () => {
      const nooitGewijzigd = createTestUser(vereniging.id, { email: 'nooit@vereniging.nl' });
      const alGewijzigd = createTestUser(vereniging.id, { email: 'wel@vereniging.nl' });
      db.prepare('UPDATE users SET password_changed_at = ? WHERE id = ?').run(new Date().toISOString(), alGewijzigd.id);
      taak('t1', nooitGewijzigd.id, JSON.stringify({ tempPassword: 'a' }));
      taak('t2', alGewijzigd.id, JSON.stringify({ tempPassword: 'b' }));

      up();

      const vlag = (id: string) =>
        (db.prepare('SELECT moet_wachtwoord_wijzigen AS v FROM users WHERE id = ?').get(id) as { v: number }).v;
      expect(vlag(nooitGewijzigd.id)).toBe(1);
      expect(vlag(alGewijzigd.id)).toBe(0);
    });

    it('is heen, terug en weer heen te draaien', () => {
      const kolommen = () => (db.prepare('PRAGMA table_info(users)').all() as { name: string }[]).map((k) => k.name);

      down();
      expect(kolommen()).not.toContain('moet_wachtwoord_wijzigen');

      up();
      expect(kolommen()).toContain('moet_wachtwoord_wijzigen');
      up();
      expect(kolommen().filter((k) => k === 'moet_wachtwoord_wijzigen')).toHaveLength(1);
    });
  });
});
