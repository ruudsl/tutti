/**
 * Uitgeven en uitlenen alleen aan leden van de eigen vereniging.
 *
 * Uniformen, apparatuur en instrumenten controleerden wel dat het onderdeel van
 * de eigen vereniging was, maar niet de gebruiker uit de body. Een beheerder
 * van vereniging A kon zo een jas, mengpaneel of trompet op naam van een lid
 * van vereniging B zetten - en kreeg daarna in het overzicht diens naam en
 * e-mailadres terug.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import uniformsRoutes from '../../routes/uniforms';
import equipmentRoutes from '../../routes/equipment';
import instrumentAssetsRoutes from '../../routes/instrument-assets';
import { errorHandler } from '../../middleware/errorHandler';
import { createTestAssociation, createTestEnvironment, createTestUser, TestAssociation, TestUser } from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api/uniforms', uniformsRoutes);
app.use('/api/equipment', equipmentRoutes);
app.use('/api/instrument-assets', instrumentAssetsRoutes);
app.use(errorHandler);

describe('uitgeven en uitlenen blijft binnen de vereniging', () => {
  let vereniging: TestAssociation;
  let lid: TestUser;
  let token: string;
  let buitenstaander: TestUser;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    lid = omgeving.memberUser;
    token = omgeving.adminToken;

    const andere = createTestAssociation({ name: 'Andere vereniging' });
    buitenstaander = createTestUser(andere.id, { email: `buiten-${uuidv4()}@elders.nl`, role: 'member' });
  });

  const post = (pad: string) => request(app).post(pad).set('Authorization', `Bearer ${token}`);
  const put = (pad: string) => request(app).put(pad).set('Authorization', `Bearer ${token}`);
  const get = (pad: string) => request(app).get(pad).set('Authorization', `Bearer ${token}`);

  function maakUniformOnderdeel(): string {
    const id = uuidv4();
    db.prepare(
      `INSERT INTO uniform_items (id, association_id, item_type, condition, status)
       VALUES (?, ?, 'jacket', 'good', 'available')`,
    ).run(id, vereniging.id);
    return id;
  }

  function maakApparaat(): string {
    const id = uuidv4();
    db.prepare(
      `INSERT INTO equipment_items (id, association_id, name, equipment_type, inventory_number, status, condition, is_loanable)
       VALUES (?, ?, 'Mengpaneel', 'audio', ?, 'available', 'good', 1)`,
    ).run(id, vereniging.id, `EQ-${uuidv4()}`);
    return id;
  }

  function maakInstrument(): string {
    const id = uuidv4();
    db.prepare(
      `INSERT INTO instrument_assets (id, association_id, name, instrument_type, category, status, condition)
       VALUES (?, ?, 'Trompet', 'trompet', 'brass', 'available', 'good')`,
    ).run(id, vereniging.id);
    return id;
  }

  describe('uniformen', () => {
    it('geeft geen onderdeel uit aan een lid van een andere vereniging', async () => {
      const onderdeel = maakUniformOnderdeel();

      const antwoord = await post(`/api/uniforms/items/${onderdeel}/assign`).send({
        userId: buitenstaander.id,
        assignedDate: '2026-09-01',
      });
      expect(antwoord.status).toBe(400);

      const rij = db.prepare('SELECT status, current_user_id FROM uniform_items WHERE id = ?').get(onderdeel) as {
        status: string;
        current_user_id: string | null;
      };
      expect(rij).toEqual({ status: 'available', current_user_id: null });

      const detail = await get(`/api/uniforms/items/${onderdeel}`);
      expect(JSON.stringify(detail.body)).not.toContain(buitenstaander.email);
    });

    it('geeft een onderdeel wel uit aan een eigen lid', async () => {
      const onderdeel = maakUniformOnderdeel();
      const antwoord = await post(`/api/uniforms/items/${onderdeel}/assign`).send({
        userId: lid.id,
        assignedDate: '2026-09-01',
      });
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);
    });

    it('geeft een onderdeel ook uit aan een lid dat via user_associations meedoet', async () => {
      db.prepare(
        `INSERT INTO user_associations (user_id, association_id, role, status) VALUES (?, ?, 'member', 'active')`,
      ).run(buitenstaander.id, vereniging.id);

      const onderdeel = maakUniformOnderdeel();
      const antwoord = await post(`/api/uniforms/items/${onderdeel}/assign`).send({
        userId: buitenstaander.id,
        assignedDate: '2026-09-01',
      });
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);
    });

    it('zet bij aanmaken geen lid van een andere vereniging als drager', async () => {
      const antwoord = await post('/api/uniforms/items').send({ itemType: 'jacket', currentUserId: buitenstaander.id });
      expect(antwoord.status).toBe(400);

      const aantal = db
        .prepare('SELECT COUNT(*) as n FROM uniform_items WHERE current_user_id = ?')
        .get(buitenstaander.id) as { n: number };
      expect(aantal.n).toBe(0);
    });

    it('zet bij bijwerken geen lid van een andere vereniging als drager', async () => {
      const onderdeel = maakUniformOnderdeel();

      const antwoord = await put(`/api/uniforms/items/${onderdeel}`).send({ currentUserId: buitenstaander.id });
      expect(antwoord.status).toBe(400);

      const rij = db.prepare('SELECT current_user_id FROM uniform_items WHERE id = ?').get(onderdeel) as {
        current_user_id: string | null;
      };
      expect(rij.current_user_id).toBeNull();
    });
  });

  describe('apparatuur', () => {
    it('leent niets uit aan een lid van een andere vereniging', async () => {
      const apparaat = maakApparaat();

      const antwoord = await post('/api/equipment/loans').send({ equipmentId: apparaat, userId: buitenstaander.id });
      expect(antwoord.status).toBe(400);

      const aantal = db.prepare('SELECT COUNT(*) as n FROM equipment_item_loans').get() as { n: number };
      expect(aantal.n).toBe(0);

      const uitleningen = await get('/api/equipment/loans');
      expect(JSON.stringify(uitleningen.body)).not.toContain(buitenstaander.email);
    });

    it('leent wel uit aan een eigen lid', async () => {
      const apparaat = maakApparaat();
      const antwoord = await post('/api/equipment/loans').send({ equipmentId: apparaat, userId: lid.id });
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);
    });
  });

  describe('instrumenten', () => {
    it('leent geen instrument uit aan een lid van een andere vereniging', async () => {
      const instrument = maakInstrument();

      const antwoord = await post(`/api/instrument-assets/${instrument}/loans`).send({
        borrowerUserId: buitenstaander.id,
        loanDate: '2026-09-01',
        conditionAtLoan: 'good',
      });
      expect(antwoord.status).toBe(400);

      const rij = db
        .prepare('SELECT status, assigned_to_user_id FROM instrument_assets WHERE id = ?')
        .get(instrument) as {
        status: string;
        assigned_to_user_id: string | null;
      };
      expect(rij).toEqual({ status: 'available', assigned_to_user_id: null });
    });

    it('leent wel uit aan een eigen lid', async () => {
      const instrument = maakInstrument();
      const antwoord = await post(`/api/instrument-assets/${instrument}/loans`).send({
        borrowerUserId: lid.id,
        loanDate: '2026-09-01',
        conditionAtLoan: 'good',
      });
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);
    });
  });
});
