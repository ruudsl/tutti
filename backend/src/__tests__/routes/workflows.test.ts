/**
 * Workflow-automatisering: regels die bij een gebeurtenis of op een tijdstip
 * iets doen - een mail sturen, een taak aanmaken, een veld bijwerken.
 *
 * 533 regels zonder test. Wat hier misgaat is niet zichtbaar op een scherm: een
 * workflow doet iets uit zichzelf, en aan wie. Drie dingen kwamen boven water.
 *
 * De twee routes die een trigger of een actie verwijderen keken alleen naar het
 * workflow-id uit het pad, niet naar de vereniging. Elke beheerder kon daarmee
 * de automatisering van een andere vereniging uit elkaar halen - de buurroutes
 * die een trigger of actie toevoegen doen die controle wel.
 *
 * En de twee routes waarmee de planning wordt afgetrapt draaiden de workflows
 * van alle verenigingen tegelijk. Een beheerder van de ene vereniging kon
 * daarmee de mails en meldingen van elke andere vereniging laten afgaan, zo
 * vaak als hij het verzoek herhaalde.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import workflowRoutes from '../../routes/workflows';
import { errorHandler } from '../../middleware/errorHandler';
import {
  createTestEnvironment,
  createTestAssociation,
  createTestUser,
  generateTestToken,
  TestAssociation,
  TestUser,
} from '../testUtils';

vi.mock('../../services/workflowEngine', () => ({
  executeWorkflow: vi.fn(async () => ({ success: true, executionId: 'uitvoering-1' })),
  processScheduledWorkflows: vi.fn(),
  processDateFieldWorkflows: vi.fn(),
}));

const app = express();
app.use(express.json());
app.use('/api/workflows', workflowRoutes);
app.use(errorHandler);

describe('workflows', () => {
  let vereniging: TestAssociation;
  let beheerder: TestUser;
  let beheerderToken: string;
  let lidToken: string;

  let andereVereniging: TestAssociation;
  let andereBeheerderToken: string;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    beheerder = omgeving.adminUser;
    beheerderToken = omgeving.adminToken;
    lidToken = omgeving.memberToken;

    andereVereniging = createTestAssociation({ name: `Elders-${uuidv4()}` });
    const andereBeheerder = createTestUser(andereVereniging.id, {
      email: `beheerder-${uuidv4()}@elders.nl`,
      role: 'admin',
    });
    andereBeheerderToken = generateTestToken(andereBeheerder);
  });

  type Methode = 'get' | 'post' | 'patch' | 'delete';
  const als = (token: string, methode: Methode, pad: string) =>
    request(app)[methode](`/api/workflows${pad}`).set('Authorization', `Bearer ${token}`);
  const alsBeheerder = (methode: Methode, pad: string) => als(beheerderToken, methode, pad);

  const geldigeWorkflow = {
    name: 'Herinnering voor het concert',
    description: 'Stuur drie dagen van tevoren een mail',
    triggers: [{ triggerType: 'date_field', dateFieldEntity: 'concerts', dateFieldName: 'date', daysBefore: 3 }],
    actions: [{ actionType: 'send_email', config: { subject: 'Bijna zover' } }],
  };

  async function maakWorkflow(overrides: Record<string, unknown> = {}): Promise<string> {
    const antwoord = await alsBeheerder('post', '/').send({ ...geldigeWorkflow, ...overrides });
    expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);
    return antwoord.body.id;
  }

  /** Een workflow van een andere vereniging, rechtstreeks in de database. */
  function maakWorkflowElders(): { id: string; triggerId: string; actionId: string } {
    const id = uuidv4();
    const maker = createTestUser(andereVereniging.id, { email: `maker-${uuidv4()}@elders.nl` });
    db.prepare('INSERT INTO workflows (id, association_id, name, created_by) VALUES (?, ?, ?, ?)').run(
      id,
      andereVereniging.id,
      'Automatisering van een ander',
      maker.id,
    );

    const triggerId = uuidv4();
    db.prepare('INSERT INTO workflow_triggers (id, workflow_id, trigger_type) VALUES (?, ?, ?)').run(
      triggerId,
      id,
      'manual',
    );

    const actionId = uuidv4();
    db.prepare(
      'INSERT INTO workflow_actions (id, workflow_id, action_type, action_order, config) VALUES (?, ?, ?, ?, ?)',
    ).run(actionId, id, 'send_email', 0, '{}');

    return { id, triggerId, actionId };
  }

  describe('toegang', () => {
    it('weigert een verzoek zonder token', async () => {
      expect((await request(app).get('/api/workflows')).status).toBe(401);
    });

    it('is niet voor een gewoon lid', async () => {
      expect((await als(lidToken, 'get', '/')).status).toBe(403);
    });
  });

  describe('aanmaken en opvragen', () => {
    it('maakt een workflow met een trigger en een actie', async () => {
      const id = await maakWorkflow();
      const antwoord = await alsBeheerder('get', `/${id}`);

      expect(antwoord.status).toBe(200);
      expect(antwoord.body.name).toBe('Herinnering voor het concert');
      expect(antwoord.body.triggers).toHaveLength(1);
      expect(antwoord.body.actions).toHaveLength(1);
    });

    it('staat standaard aan', async () => {
      const id = await maakWorkflow();
      expect((await alsBeheerder('get', `/${id}`)).body.isActive).toBe(true);
    });

    it('weigert een workflow zonder trigger', async () => {
      const antwoord = await alsBeheerder('post', '/').send({ ...geldigeWorkflow, triggers: [] });
      expect(antwoord.status).toBe(400);
    });

    it('weigert een workflow zonder actie', async () => {
      const antwoord = await alsBeheerder('post', '/').send({ ...geldigeWorkflow, actions: [] });
      expect(antwoord.status).toBe(400);
    });

    it('weigert een onbekend soort actie', async () => {
      const antwoord = await alsBeheerder('post', '/').send({
        ...geldigeWorkflow,
        actions: [{ actionType: 'raket_lanceren', config: {} }],
      });
      expect(antwoord.status).toBe(400);
    });

    it('telt de triggers en acties in het overzicht', async () => {
      await maakWorkflow();
      const lijst = await alsBeheerder('get', '/');
      expect(lijst.body[0]).toMatchObject({ triggerCount: 1, actionCount: 1 });
    });

    it('toont geen workflow van een andere vereniging in het overzicht', async () => {
      maakWorkflowElders();
      const lijst = await alsBeheerder('get', '/');
      expect(lijst.body).toEqual([]);
    });

    it('geeft een workflow van een andere vereniging niet vrij', async () => {
      const elders = maakWorkflowElders();
      expect((await alsBeheerder('get', `/${elders.id}`)).status).toBe(404);
    });
  });

  describe('bijwerken en verwijderen', () => {
    it('werkt de naam bij', async () => {
      const id = await maakWorkflow();
      expect((await alsBeheerder('patch', `/${id}`).send({ name: 'Nieuwe naam' })).status).toBe(200);
      expect((await alsBeheerder('get', `/${id}`)).body.name).toBe('Nieuwe naam');
    });

    it('zet een workflow uit zonder hem te verwijderen', async () => {
      const id = await maakWorkflow();
      await alsBeheerder('patch', `/${id}`).send({ isActive: false });
      expect((await alsBeheerder('get', `/${id}`)).body.isActive).toBe(false);
    });

    it('laat de omschrijving staan als die niet wordt meegestuurd', async () => {
      const id = await maakWorkflow();
      await alsBeheerder('patch', `/${id}`).send({ name: 'Alleen de naam' });
      expect((await alsBeheerder('get', `/${id}`)).body.description).toBe('Stuur drie dagen van tevoren een mail');
    });

    it('werkt een workflow van een andere vereniging niet bij', async () => {
      const elders = maakWorkflowElders();
      expect((await alsBeheerder('patch', `/${elders.id}`).send({ name: 'Gekaapt' })).status).toBe(404);

      const rij = db.prepare('SELECT name FROM workflows WHERE id = ?').get(elders.id) as { name: string };
      expect(rij.name).toBe('Automatisering van een ander');
    });

    it('verwijdert zacht: de workflow verdwijnt uit het overzicht maar blijft in de database', async () => {
      const id = await maakWorkflow();
      expect((await alsBeheerder('delete', `/${id}`)).status).toBe(200);
      expect((await alsBeheerder('get', '/')).body).toEqual([]);

      const rij = db.prepare('SELECT deleted_at FROM workflows WHERE id = ?').get(id) as { deleted_at: string };
      expect(rij.deleted_at).not.toBeNull();
    });

    it('verwijdert een workflow van een andere vereniging niet', async () => {
      const elders = maakWorkflowElders();
      expect((await alsBeheerder('delete', `/${elders.id}`)).status).toBe(404);
    });

    it('geeft 404 bij een tweede verwijdering', async () => {
      const id = await maakWorkflow();
      await alsBeheerder('delete', `/${id}`);
      expect((await alsBeheerder('delete', `/${id}`)).status).toBe(404);
    });
  });

  describe('triggers', () => {
    it('voegt een trigger toe', async () => {
      const id = await maakWorkflow();
      const antwoord = await alsBeheerder('post', `/${id}/triggers`).send({ triggerType: 'manual' });

      expect(antwoord.status).toBe(201);
      expect((await alsBeheerder('get', `/${id}`)).body.triggers).toHaveLength(2);
    });

    it('voegt geen trigger toe aan een workflow van een andere vereniging', async () => {
      const elders = maakWorkflowElders();
      const antwoord = await alsBeheerder('post', `/${elders.id}/triggers`).send({ triggerType: 'manual' });
      expect(antwoord.status).toBe(404);
    });

    it('verwijdert een eigen trigger', async () => {
      const id = await maakWorkflow();
      const triggerId = (await alsBeheerder('get', `/${id}`)).body.triggers[0].id;

      expect((await alsBeheerder('delete', `/${id}/triggers/${triggerId}`)).status).toBe(200);
      expect((await alsBeheerder('get', `/${id}`)).body.triggers).toHaveLength(0);
    });

    it('verwijdert geen trigger van een andere vereniging', async () => {
      const elders = maakWorkflowElders();

      const antwoord = await alsBeheerder('delete', `/${elders.id}/triggers/${elders.triggerId}`);
      expect(antwoord.status).toBe(404);

      const rij = db.prepare('SELECT id FROM workflow_triggers WHERE id = ?').get(elders.triggerId);
      expect(rij).toBeDefined();
    });

    it('geeft 404 voor een trigger die niet bij deze workflow hoort', async () => {
      const eerste = await maakWorkflow();
      const tweede = await maakWorkflow({ name: 'Tweede' });
      const triggerVanTweede = (await alsBeheerder('get', `/${tweede}`)).body.triggers[0].id;

      expect((await alsBeheerder('delete', `/${eerste}/triggers/${triggerVanTweede}`)).status).toBe(404);
    });
  });

  describe('acties', () => {
    it('voegt een actie toe achteraan de rij', async () => {
      const id = await maakWorkflow();
      await alsBeheerder('post', `/${id}/actions`).send({ actionType: 'create_task', config: { title: 'Bellen' } });

      const acties = (await alsBeheerder('get', `/${id}`)).body.actions;
      expect(acties).toHaveLength(2);
      expect(acties[1].actionType).toBe('create_task');
    });

    it('voegt geen actie toe aan een workflow van een andere vereniging', async () => {
      const elders = maakWorkflowElders();
      const antwoord = await alsBeheerder('post', `/${elders.id}/actions`).send({
        actionType: 'send_email',
        config: {},
      });
      expect(antwoord.status).toBe(404);
    });

    it('verwijdert een eigen actie', async () => {
      const id = await maakWorkflow();
      const actionId = (await alsBeheerder('get', `/${id}`)).body.actions[0].id;

      expect((await alsBeheerder('delete', `/${id}/actions/${actionId}`)).status).toBe(200);
      expect((await alsBeheerder('get', `/${id}`)).body.actions).toHaveLength(0);
    });

    it('verwijdert geen actie van een andere vereniging', async () => {
      const elders = maakWorkflowElders();

      const antwoord = await alsBeheerder('delete', `/${elders.id}/actions/${elders.actionId}`);
      expect(antwoord.status).toBe(404);

      const rij = db.prepare('SELECT id FROM workflow_actions WHERE id = ?').get(elders.actionId);
      expect(rij).toBeDefined();
    });
  });

  describe('handmatig draaien', () => {
    it('draait een eigen workflow', async () => {
      const id = await maakWorkflow();
      const antwoord = await alsBeheerder('post', `/${id}/run`);
      expect(antwoord.status).toBe(200);
      expect(antwoord.body.executionId).toBe('uitvoering-1');
    });

    it('draait geen workflow van een andere vereniging', async () => {
      const elders = maakWorkflowElders();
      expect((await alsBeheerder('post', `/${elders.id}/run`)).status).toBe(404);
    });
  });

  describe('de planning aftrappen', () => {
    it('is niet voor een gewoon lid', async () => {
      expect((await als(lidToken, 'post', '/process/scheduled')).status).toBe(403);
    });

    it('draait alleen de workflows van de eigen vereniging', async () => {
      const { processScheduledWorkflows } = await import('../../services/workflowEngine');

      const antwoord = await alsBeheerder('post', '/process/scheduled');
      expect(antwoord.status).toBe(200);

      // Zonder vereniging erbij draait dit de automatisering van elke
      // vereniging op de installatie - en dat betekent mails en meldingen
      // bij mensen die er niets mee te maken hebben.
      expect(processScheduledWorkflows).toHaveBeenCalledWith(vereniging.id);
    });

    it('trapt de datumvelden ook alleen voor de eigen vereniging af', async () => {
      const { processDateFieldWorkflows } = await import('../../services/workflowEngine');

      await als(andereBeheerderToken, 'post', '/process/date-fields');
      expect(processDateFieldWorkflows).toHaveBeenCalledWith(andereVereniging.id);
    });
  });

  describe('uitvoeringsgeschiedenis', () => {
    it('geeft de geschiedenis van een eigen workflow', async () => {
      const id = await maakWorkflow();
      db.prepare(
        'INSERT INTO workflow_executions (id, workflow_id, status, triggered_by_user_id) VALUES (?, ?, ?, ?)',
      ).run(uuidv4(), id, 'completed', beheerder.id);

      const antwoord = await alsBeheerder('get', `/${id}/executions`);
      expect(antwoord.status).toBe(200);
      expect(antwoord.body.executions).toHaveLength(1);
    });

    it('geeft de geschiedenis van een andere vereniging niet', async () => {
      const elders = maakWorkflowElders();
      expect((await alsBeheerder('get', `/${elders.id}/executions`)).status).toBe(404);
    });
  });
});
