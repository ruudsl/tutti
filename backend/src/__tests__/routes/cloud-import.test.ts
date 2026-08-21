/**
 * Muziek importeren uit OneDrive en Google Drive.
 *
 * 423 regels zonder test, met twee gaten in de verenigingsgrens.
 *
 * GET /cloud-import/config gebruikte de aanvrager niet eens - de parameter
 * heette `_req` - en deed `FROM associations LIMIT 1`. Elk ingelogd lid van
 * elke vereniging kreeg zo de instellingen van de eerst aangemaakte vereniging
 * terug, inclusief google_drive_api_key. Datzelfde veld staat in settings.ts
 * achter requireRole('admin') en de ip-controle; hier lag het open voor
 * iedereen met een account.
 *
 * En listId kwam rauw uit de body de INSERT in. music_lists heeft geen
 * association_id - de grens loopt via het orkest - dus een lijst-id van een
 * andere vereniging werd gewoon geaccepteerd. De geimporteerde stukken
 * belandden dan op de repertoirelijst van die vereniging, en haar leden
 * kregen er een melding over.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import '../setup';
import db from '../../database/connection';
import cloudImportRoutes from '../../routes/cloud-import';
import { errorHandler } from '../../middleware/errorHandler';
import {
  createTestEnvironment,
  createTestAssociation,
  createTestOrchestra,
  createTestUser,
  generateTestToken,
  TestAssociation,
  TestUser,
} from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api/cloud-import', cloudImportRoutes);
app.use(errorHandler);

describe('importeren uit de cloud', () => {
  let vereniging: TestAssociation;
  let beheerder: TestUser;
  let beheerderToken: string;
  let lid: TestUser;
  let lidToken: string;

  let andereVereniging: TestAssociation;
  let andereBeheerder: TestUser;
  let andereBeheerderToken: string;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    beheerder = omgeving.adminUser;
    beheerderToken = omgeving.adminToken;
    lid = omgeving.memberUser;
    lidToken = omgeving.memberToken;

    andereVereniging = createTestAssociation({ name: 'Andere vereniging' });
    andereBeheerder = createTestUser(andereVereniging.id, { email: 'beheer@elders.nl', role: 'admin' });
    andereBeheerderToken = generateTestToken(andereBeheerder);
  });

  function zetCloudInstellingen(associationId: string, sleutel: string, clientId: string) {
    db.prepare(
      `UPDATE associations
         SET google_drive_api_key = ?, google_drive_client_id = ?, google_drive_enabled = 1,
             microsoft_client_id = ?, microsoft_tenant_id = 'tenant', microsoft_enabled = 1
       WHERE id = ?`,
    ).run(sleutel, clientId, clientId, associationId);
  }

  const config = (token: string) =>
    request(app).get('/api/cloud-import/config').set('Authorization', `Bearer ${token}`);

  describe('de instellingen opvragen', () => {
    it('geeft de instellingen van de eigen vereniging', async () => {
      zetCloudInstellingen(vereniging.id, 'sleutel-van-ons', 'client-van-ons');
      zetCloudInstellingen(andereVereniging.id, 'sleutel-van-hun', 'client-van-hun');

      const antwoord = await config(beheerderToken);
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      expect(JSON.stringify(antwoord.body)).toContain('sleutel-van-ons');
      expect(JSON.stringify(antwoord.body)).not.toContain('sleutel-van-hun');
    });

    it('geeft aan de andere vereniging haar eigen sleutel', async () => {
      zetCloudInstellingen(vereniging.id, 'sleutel-van-ons', 'client-van-ons');
      zetCloudInstellingen(andereVereniging.id, 'sleutel-van-hun', 'client-van-hun');

      const antwoord = await config(andereBeheerderToken);
      expect(JSON.stringify(antwoord.body)).toContain('sleutel-van-hun');
      expect(JSON.stringify(antwoord.body)).not.toContain('sleutel-van-ons');
    });

    it('is niet voor een gewoon lid', async () => {
      // Wie niet mag importeren heeft de sleutels om te importeren ook niet
      // nodig; de importroutes vragen dezelfde rol.
      expect((await config(lidToken)).status).toBe(403);
    });

    it('weigert een verzoek zonder token', async () => {
      expect((await request(app).get('/api/cloud-import/config')).status).toBe(401);
    });
  });

  describe('een lijst van een andere vereniging', () => {
    const importeer = (token: string, listId: string) =>
      request(app)
        .post('/api/cloud-import/onedrive')
        .set('Authorization', `Bearer ${token}`)
        .send({
          files: [{ downloadUrl: 'https://graph.microsoft.com/x', name: 'Trompet 1.pdf' }],
          accessToken: 'test-token',
          listId,
        });

    function maakLijst(associationId: string, naam: string): string {
      const orkest = createTestOrchestra(associationId, { name: `Orkest ${naam}` });
      const id = `lijst-${naam}`;
      db.prepare('INSERT INTO music_lists (id, name, orchestra_id) VALUES (?, ?, ?)').run(id, naam, orkest.id);
      return id;
    }

    it('wordt geweigerd', async () => {
      const hunLijst = maakLijst(andereVereniging.id, 'hun');
      const antwoord = await importeer(beheerderToken, hunLijst);
      expect(antwoord.status).toBe(404);
    });

    it('levert geen enkel stuk op die lijst op', async () => {
      const hunLijst = maakLijst(andereVereniging.id, 'hun');
      await importeer(beheerderToken, hunLijst);

      const gekoppeld = db
        .prepare('SELECT COUNT(*) as aantal FROM music_list_pieces WHERE music_list_id = ?')
        .get(hunLijst) as { aantal: number };
      expect(gekoppeld.aantal).toBe(0);
    });

    it('weigert een lijst die niet bestaat', async () => {
      expect((await importeer(beheerderToken, 'bestaat-niet')).status).toBe(404);
    });

    it('weigert een zacht verwijderde lijst van de eigen vereniging', async () => {
      const onzeLijst = maakLijst(vereniging.id, 'ons');
      db.prepare('UPDATE music_lists SET deleted_at = ? WHERE id = ?').run('2026-01-01 12:00:00', onzeLijst);

      expect((await importeer(beheerderToken, onzeLijst)).status).toBe(404);
    });

    it('is niet voor een gewoon lid', async () => {
      const onzeLijst = maakLijst(vereniging.id, 'ons');
      expect((await importeer(lidToken, onzeLijst)).status).toBe(403);
    });
  });
});
