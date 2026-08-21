/**
 * Onderhoud van instrumenten.
 *
 * Twee dingen wegen hier het zwaarst. Het eerste is de verenigingsgrens: het
 * equipment_maintenance_log heeft zelf geen association_id, dus de grens loopt
 * volledig via het instrument waar de regel aan hangt. Zowel de POST die een
 * onderhoudsbeurt vastlegt als de GET die de historie opvraagt krijgt het id
 * van dat instrument uit de aanvraag, en beide moeten het tegen de eigen
 * vereniging houden.
 *
 * Het tweede is wie wat mag. Iedereen mag de planning zien - dat is
 * praktisch - maar kosten inzien en onderhoud vastleggen is voor de beheerder
 * en de materiaalcommissie. En /check-all raakt alle verenigingen tegelijk;
 * daar is de beheerder van een enkele vereniging te weinig voor.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import '../setup';

// De meldingen zelf zijn hier niet het onderwerp; wel aan wie ze gericht zijn.
vi.mock('../../services/notifications', () => ({
  sendNotification: vi.fn().mockResolvedValue({ success: true, channels: [] }),
  notifyAssociation: vi.fn().mockResolvedValue({ sent: 0, errors: 0 }),
}));

import db from '../../database/connection';
import maintenanceRoutes from '../../routes/maintenance';
import { errorHandler } from '../../middleware/errorHandler';
import { sendNotification } from '../../services/notifications';
import {
  createTestAssociation,
  createTestEnvironment,
  createTestUser,
  generateTestToken,
  TestAssociation,
  TestUser,
} from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api/maintenance', maintenanceRoutes);
app.use(errorHandler);

const gemeldAan = () => (sendNotification as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0].userId);

describe('onderhoud', () => {
  let vereniging: TestAssociation;
  let beheerder: TestUser;
  let beheerderToken: string;
  let lidToken: string;
  let materiaalcommissie: TestUser;
  let materiaalcommissieToken: string;

  beforeEach(() => {
    vi.clearAllMocks();
    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    beheerder = omgeving.adminUser;
    beheerderToken = omgeving.adminToken;
    lidToken = omgeving.memberToken;
    materiaalcommissie = createTestUser(vereniging.id, {
      email: `materiaal-${uuidv4()}@test.nl`,
      role: 'equipment_committee',
    });
    materiaalcommissieToken = generateTestToken(materiaalcommissie);
  });

  type Methode = 'get' | 'post';
  const als = (token: string, methode: Methode, pad: string) =>
    request(app)[methode](`/api/maintenance${pad}`).set('Authorization', `Bearer ${token}`);
  const alsBeheerder = (methode: Methode, pad: string) => als(beheerderToken, methode, pad);
  const alsLid = (methode: Methode, pad: string) => als(lidToken, methode, pad);

  /** Een datum n dagen vanaf vandaag als YYYY-MM-DD. */
  function overDagen(n: number): string {
    return new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  }

  function maakInstrument(
    associationId: string,
    overrides: {
      instrumentType?: string;
      status?: string;
      nextMaintenanceDate?: string | null;
      intervalMonths?: number;
    } = {},
  ): string {
    const id = uuidv4();
    db.prepare(
      `INSERT INTO equipment (id, association_id, instrument_type, brand_model, status, maintenance_interval_months, next_maintenance_date)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      associationId,
      overrides.instrumentType || 'Trompet',
      'Yamaha',
      overrides.status || 'available',
      overrides.intervalMonths ?? 12,
      overrides.nextMaintenanceDate === undefined ? overDagen(5) : overrides.nextMaintenanceDate,
    );
    return id;
  }

  function logRegels(equipmentId: string): { description: string; cost: number | null; created_by: string }[] {
    return db
      .prepare('SELECT description, cost, created_by FROM equipment_maintenance_log WHERE equipment_id = ?')
      .all(equipmentId) as { description: string; cost: number | null; created_by: string }[];
  }

  function schrijfLog(equipmentId: string, datum: string, kosten: number): void {
    db.prepare(
      `INSERT INTO equipment_maintenance_log (id, equipment_id, maintenance_date, description, cost)
       VALUES (?, ?, ?, 'Grote beurt', ?)`,
    ).run(uuidv4(), equipmentId, datum, kosten);
  }

  describe('planning opvragen', () => {
    it('noemt instrumenten die binnenkort onderhoud nodig hebben', async () => {
      maakInstrument(vereniging.id, { instrumentType: 'Trompet', nextMaintenanceDate: overDagen(5) });

      const antwoord = await alsLid('get', '/upcoming');
      expect(antwoord.status).toBe(200);
      expect(antwoord.body.map((i: { instrumentType: string }) => i.instrumentType)).toEqual(['Trompet']);
    });

    it('noemt geen instrument van een andere vereniging', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      maakInstrument(andere.id, { instrumentType: 'Hoorn van de buren', nextMaintenanceDate: overDagen(5) });

      expect((await alsLid('get', '/upcoming')).body).toEqual([]);
      expect((await alsLid('get', '/schedule')).body).toEqual([]);
    });

    it('kijkt niet verder vooruit dan gevraagd', async () => {
      maakInstrument(vereniging.id, { instrumentType: 'Tuba', nextMaintenanceDate: overDagen(100) });

      expect((await alsLid('get', '/upcoming')).body).toEqual([]);
      expect((await alsLid('get', '/upcoming?days=200')).body).toHaveLength(1);
    });

    it('laat afgeschreven instrumenten weg', async () => {
      maakInstrument(vereniging.id, { status: 'written_off', nextMaintenanceDate: overDagen(5) });

      expect((await alsLid('get', '/upcoming')).body).toEqual([]);
    });

    it('noemt instrumenten waarvan de datum verstreken is bij het achterstallige onderhoud', async () => {
      maakInstrument(vereniging.id, { instrumentType: 'Klarinet', nextMaintenanceDate: overDagen(-10) });
      maakInstrument(vereniging.id, { instrumentType: 'Fluit', nextMaintenanceDate: overDagen(5) });

      const antwoord = await alsLid('get', '/overdue');
      expect(antwoord.body.map((i: { instrumentType: string }) => i.instrumentType)).toEqual(['Klarinet']);
      expect(antwoord.body[0].isOverdue).toBe(true);
    });

    it('houdt het achterstallige onderhoud van de buren buiten beeld', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      maakInstrument(andere.id, { nextMaintenanceDate: overDagen(-10) });

      expect((await alsLid('get', '/overdue')).body).toEqual([]);
    });

    it('geeft de volledige planning van de eigen vereniging', async () => {
      maakInstrument(vereniging.id, { instrumentType: 'Sax', nextMaintenanceDate: overDagen(200) });

      const antwoord = await alsLid('get', '/schedule');
      expect(antwoord.body.map((i: { instrumentType: string }) => i.instrumentType)).toEqual(['Sax']);
    });

    it('weigert een verzoek zonder geldig token', async () => {
      expect((await request(app).get('/api/maintenance/upcoming')).status).toBe(401);
    });
  });

  describe('kosten', () => {
    it('telt alleen de kosten van de eigen vereniging', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const eigen = maakInstrument(vereniging.id);
      const vreemd = maakInstrument(andere.id);
      schrijfLog(eigen, '2026-03-01', 100);
      schrijfLog(vreemd, '2026-03-01', 999);

      const antwoord = await alsBeheerder('get', '/costs');
      expect(antwoord.status).toBe(200);
      expect(antwoord.body.total).toBe(100);
      expect(antwoord.body.count).toBe(1);
      expect(antwoord.body.byEquipment.map((e: { equipmentId: string }) => e.equipmentId)).toEqual([eigen]);
    });

    it('houdt zich aan de gevraagde periode', async () => {
      const eigen = maakInstrument(vereniging.id);
      schrijfLog(eigen, '2026-01-15', 50);
      schrijfLog(eigen, '2026-06-15', 75);

      const antwoord = await alsBeheerder('get', '/costs?startDate=2026-06-01&endDate=2026-12-31');
      expect(antwoord.body.total).toBe(75);
      expect(antwoord.body.count).toBe(1);
    });

    it('laat de materiaalcommissie de kosten zien', async () => {
      expect((await als(materiaalcommissieToken, 'get', '/costs')).status).toBe(200);
    });

    it('weigert een gewoon lid inzage in de kosten', async () => {
      expect((await alsLid('get', '/costs')).status).toBe(403);
    });
  });

  describe('onderhoud vastleggen', () => {
    const beurt = (equipmentId: string, overrides: Record<string, unknown> = {}) => ({
      equipmentId,
      maintenanceDate: '2026-05-01',
      description: 'Ventielen gesmeerd',
      cost: 45.5,
      ...overrides,
    });

    it('schrijft de beurt weg op naam van de gebruiker', async () => {
      const id = maakInstrument(vereniging.id);

      const antwoord = await alsBeheerder('post', '/log').send(beurt(id));
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);
      expect(antwoord.body.id).toBeTruthy();

      expect(logRegels(id)).toEqual([{ description: 'Ventielen gesmeerd', cost: 45.5, created_by: beheerder.id }]);
    });

    it('zet de datum van het volgende onderhoud vooruit', async () => {
      const id = maakInstrument(vereniging.id, { intervalMonths: 6 });

      await alsBeheerder('post', '/log').send(beurt(id, { maintenanceDate: '2026-05-01' }));

      const rij = db
        .prepare('SELECT last_maintenance_date, next_maintenance_date FROM equipment WHERE id = ?')
        .get(id) as { last_maintenance_date: string; next_maintenance_date: string };
      expect(rij.last_maintenance_date).toBe('2026-05-01');
      expect(rij.next_maintenance_date).toBe('2026-11-01');
    });

    it('laat de materiaalcommissie onderhoud vastleggen', async () => {
      const id = maakInstrument(vereniging.id);
      expect((await als(materiaalcommissieToken, 'post', '/log').send(beurt(id))).status).toBe(201);
    });

    it('weigert een gewoon lid dat onderhoud wil vastleggen', async () => {
      const id = maakInstrument(vereniging.id);

      expect((await alsLid('post', '/log').send(beurt(id))).status).toBe(403);
      expect(logRegels(id)).toEqual([]);
    });

    it('weigert een instrument van een andere vereniging', async () => {
      // equipment_maintenance_log heeft geen eigen association_id: als het id
      // uit de body ongecontroleerd doorgeschoven werd, zou een beheerder
      // regels aan het instrument van de buren kunnen hangen.
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const vreemd = maakInstrument(andere.id);

      const antwoord = await alsBeheerder('post', '/log').send(beurt(vreemd));
      expect(antwoord.status).toBe(404);
      expect(logRegels(vreemd)).toEqual([]);
    });

    it('weigert een instrument dat niet bestaat', async () => {
      expect((await alsBeheerder('post', '/log').send(beurt(uuidv4()))).status).toBe(404);
    });

    it('weigert een aanvraag zonder beschrijving of datum', async () => {
      const id = maakInstrument(vereniging.id);

      expect((await alsBeheerder('post', '/log').send(beurt(id, { description: '' }))).status).toBe(400);
      expect((await alsBeheerder('post', '/log').send(beurt(id, { maintenanceDate: '' }))).status).toBe(400);
      expect((await alsBeheerder('post', '/log').send(beurt(id, { equipmentId: 'geen-uuid' }))).status).toBe(400);
      expect(logRegels(id)).toEqual([]);
    });
  });

  describe('historie opvragen', () => {
    it('geeft de regels met het totaalbedrag', async () => {
      const id = maakInstrument(vereniging.id);
      schrijfLog(id, '2026-01-10', 30);
      schrijfLog(id, '2026-04-10', 20);

      const antwoord = await alsLid('get', `/log/${id}`);
      expect(antwoord.status).toBe(200);
      expect(antwoord.body.logs).toHaveLength(2);
      expect(antwoord.body.totalCost).toBe(50);
      expect(antwoord.body.maintenanceCount).toBe(2);
      // Nieuwste beurt bovenaan.
      expect(antwoord.body.logs[0].maintenanceDate).toBe('2026-04-10');
    });

    it('geeft 404 voor het instrument van een andere vereniging', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const vreemd = maakInstrument(andere.id);
      schrijfLog(vreemd, '2026-01-10', 30);

      const antwoord = await alsLid('get', `/log/${vreemd}`);
      expect(antwoord.status).toBe(404);
      expect(antwoord.body.logs).toBeUndefined();
    });

    it('weigert een verzoek zonder geldig token', async () => {
      const id = maakInstrument(vereniging.id);
      expect((await request(app).get(`/api/maintenance/log/${id}`)).status).toBe(401);
    });
  });

  describe('controle handmatig draaien', () => {
    it('meldt achterstallig onderhoud aan de beheerder en de materiaalcommissie', async () => {
      maakInstrument(vereniging.id, { nextMaintenanceDate: overDagen(-10) });

      const antwoord = await alsBeheerder('post', '/check');
      expect(antwoord.status).toBe(200);
      expect(antwoord.body.notificationsSent).toBe(2);
      expect(gemeldAan().sort()).toEqual([beheerder.id, materiaalcommissie.id].sort());
    });

    it('meldt niets aan leden van een andere vereniging', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const vreemdeBeheerder = createTestUser(andere.id, { email: `buur-${uuidv4()}@test.nl`, role: 'admin' });
      maakInstrument(vereniging.id, { nextMaintenanceDate: overDagen(-10) });
      maakInstrument(andere.id, { nextMaintenanceDate: overDagen(-10) });

      await alsBeheerder('post', '/check');

      expect(gemeldAan()).not.toContain(vreemdeBeheerder.id);
    });

    it('weigert een gewoon lid en de materiaalcommissie', async () => {
      expect((await alsLid('post', '/check')).status).toBe(403);
      expect((await als(materiaalcommissieToken, 'post', '/check')).status).toBe(403);
      expect(gemeldAan()).toEqual([]);
    });
  });

  describe('controle voor alle verenigingen', () => {
    function maakSuperAdmin(): string {
      const superAdmin = createTestUser(vereniging.id, { email: `super-${uuidv4()}@test.nl`, role: 'admin' });
      db.prepare('INSERT INTO super_admins (id, user_id) VALUES (?, ?)').run(uuidv4(), superAdmin.id);
      return generateTestToken(superAdmin);
    }

    it('weigert de beheerder van een enkele vereniging', async () => {
      // /check-all draait de controle voor alle verenigingen en stuurt daarbij
      // meldingen naar hun leden. requireRole('admin') is verenigingsgebonden
      // en dus te ruim voor een handeling die over de grens heen gaat.
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const vreemdeBeheerder = createTestUser(andere.id, { email: `buur-${uuidv4()}@test.nl`, role: 'admin' });
      maakInstrument(andere.id, { nextMaintenanceDate: overDagen(-10) });

      const antwoord = await alsBeheerder('post', '/check-all');
      expect(antwoord.status).toBe(403);
      expect(gemeldAan()).not.toContain(vreemdeBeheerder.id);
    });

    it('laat een super admin de controle voor alle verenigingen draaien', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const vreemdeBeheerder = createTestUser(andere.id, { email: `buur-${uuidv4()}@test.nl`, role: 'admin' });
      maakInstrument(andere.id, { nextMaintenanceDate: overDagen(-10) });

      const antwoord = await als(maakSuperAdmin(), 'post', '/check-all');
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      expect(gemeldAan()).toContain(vreemdeBeheerder.id);
    });

    it('weigert een gewoon lid', async () => {
      expect((await alsLid('post', '/check-all')).status).toBe(403);
    });
  });
});
