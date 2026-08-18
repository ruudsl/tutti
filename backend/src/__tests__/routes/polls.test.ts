/**
 * Integration tests for the polls routes.
 *
 * De nadruk ligt op datumpeilingen en de repetitie die daaruit ontstaat: dat
 * pad schreef via twee verschillende INSERTs naar rehearsal_instances, met
 * verschillende kolomsets en verschillende datumformaten, en steunde op
 * kolommen die nooit zijn aangemaakt.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import request from 'supertest';
import '../setup';
import testDb from '../testDb';
import app from '../testApp';
import { createTestEnvironment, createTestOrchestra, TestAssociation, TestOrchestra, TestUser } from '../testUtils';

interface RehearsalInstanceRow {
  id: string;
  association_id: string | null;
  orchestra_id: string | null;
  date: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  status: string;
  notes: string | null;
  created_by: string | null;
}

const WINNING_DATE = '2026-09-15';
const LOSING_DATE = '2026-09-22';

describe('Polls Routes', () => {
  let association: TestAssociation;
  let orchestra: TestOrchestra;
  let adminUser: TestUser;
  let adminToken: string;
  let memberUser: TestUser;
  let memberToken: string;

  beforeEach(() => {
    const env = createTestEnvironment();
    association = env.association;
    adminUser = env.adminUser;
    adminToken = env.adminToken;
    memberUser = env.memberUser;
    memberToken = env.memberToken;
    orchestra = createTestOrchestra(association.id);
  });

  /** Maak een datumpeiling met twee datumopties via de API. */
  async function createDatePoll(overrides: Record<string, unknown> = {}) {
    const response = await request(app)
      .post('/api/polls')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Nieuwe repetitiedag',
        pollType: 'single',
        isDatePoll: true,
        autoCreateRehearsal: true,
        targetOrchestraId: orchestra.id,
        options: [
          { text: `Dinsdag ${WINNING_DATE}`, value: WINNING_DATE },
          { text: `Dinsdag ${LOSING_DATE}`, value: LOSING_DATE },
        ],
        ...overrides,
      });

    expect(response.status).toBe(201);
    return response.body.id as string;
  }

  /** Zet de peiling op actief en breng één stem uit op de winnende datum. */
  async function activateAndVote(pollId: string) {
    await request(app)
      .post(`/api/polls/${pollId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'active' });

    const winning = testDb
      .prepare('SELECT id FROM poll_options WHERE poll_id = ? AND option_value = ?')
      .get(pollId, WINNING_DATE) as { id: string };

    const vote = await request(app)
      .post(`/api/polls/${pollId}/vote`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ optionIds: [winning.id] });

    expect(vote.status).toBeLessThan(400);
  }

  function rehearsalInstances(): RehearsalInstanceRow[] {
    return testDb.prepare('SELECT * FROM rehearsal_instances ORDER BY created_at').all() as RehearsalInstanceRow[];
  }

  describe('POST /api/polls', () => {
    it('creates a poll', async () => {
      const response = await request(app)
        .post('/api/polls')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Uniformkleur',
          options: [{ text: 'Blauw' }, { text: 'Rood' }],
        });

      expect(response.status).toBe(201);
      expect(response.body.id).toBeTruthy();
    });

    it('persists the date-poll columns', async () => {
      const pollId = await createDatePoll();

      const poll = testDb.prepare('SELECT * FROM polls WHERE id = ?').get(pollId) as Record<string, unknown>;

      expect(poll.is_date_poll).toBe(1);
      expect(poll.auto_create_rehearsal).toBe(1);
      expect(poll.target_orchestra_id).toBe(orchestra.id);
    });

    it('stores the machine-readable option value', async () => {
      const pollId = await createDatePoll();

      const values = testDb
        .prepare('SELECT option_value FROM poll_options WHERE poll_id = ? ORDER BY sort_order')
        .all(pollId) as { option_value: string }[];

      expect(values.map((v) => v.option_value)).toEqual([WINNING_DATE, LOSING_DATE]);
    });

    it('requires at least two options', async () => {
      const response = await request(app)
        .post('/api/polls')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Te weinig opties', options: [{ text: 'Enige optie' }] });

      expect(response.status).toBe(400);
    });

    it('rejects a regular member', async () => {
      const response = await request(app)
        .post('/api/polls')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ title: 'Mag niet', options: [{ text: 'A' }, { text: 'B' }] });

      expect(response.status).toBe(403);
    });

    it('requires authentication', async () => {
      const response = await request(app).post('/api/polls').send({ title: 'x', options: [] });

      expect(response.status).toBe(401);
    });
  });

  describe('closing a date poll', () => {
    it('creates a rehearsal for the winning date', async () => {
      const pollId = await createDatePoll();
      await activateAndVote(pollId);

      const response = await request(app)
        .post(`/api/polls/${pollId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'closed' });

      expect(response.status).toBe(200);

      const rows = rehearsalInstances();
      expect(rows).toHaveLength(1);
      expect(rows[0].date).toBe(WINNING_DATE);
      expect(rows[0].orchestra_id).toBe(orchestra.id);
    });

    it('always fills association_id, so the rehearsal belongs to a tenant', async () => {
      const pollId = await createDatePoll();
      await activateAndVote(pollId);

      await request(app)
        .post(`/api/polls/${pollId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'closed' });

      expect(rehearsalInstances()[0].association_id).toBe(association.id);
    });

    it('stores the date as YYYY-MM-DD, not as a full timestamp', async () => {
      const pollId = await createDatePoll();
      await activateAndVote(pollId);

      await request(app)
        .post(`/api/polls/${pollId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'closed' });

      expect(rehearsalInstances()[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('falls back to the default start and end time', async () => {
      const pollId = await createDatePoll();
      await activateAndVote(pollId);

      await request(app)
        .post(`/api/polls/${pollId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'closed' });

      const row = rehearsalInstances()[0];
      expect(row.start_time).toBe('19:30');
      expect(row.end_time).toBe('22:00');
      expect(row.status).toBe('scheduled');
    });

    it('uses the orchestra default rehearsal times when they are configured', async () => {
      testDb
        .prepare(
          `INSERT INTO rehearsal_default_days (id, association_id, orchestra_id, day_of_week, start_time, end_time, location)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(uuidv4(), association.id, orchestra.id, 2, '20:00', '22:15', 'Dorpshuis');

      const pollId = await createDatePoll();
      await activateAndVote(pollId);

      await request(app)
        .post(`/api/polls/${pollId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'closed' });

      const row = rehearsalInstances()[0];
      expect(row.start_time).toBe('20:00');
      expect(row.end_time).toBe('22:15');
      expect(row.location).toBe('Dorpshuis');
    });

    it('prefers the orchestra-specific default over the association-wide one', async () => {
      testDb
        .prepare(
          `INSERT INTO rehearsal_default_days (id, association_id, orchestra_id, day_of_week, start_time, end_time, location)
           VALUES (?, ?, NULL, ?, ?, ?, ?)`,
        )
        .run(uuidv4(), association.id, 1, '18:00', '20:00', 'Verenigingszaal');
      testDb
        .prepare(
          `INSERT INTO rehearsal_default_days (id, association_id, orchestra_id, day_of_week, start_time, end_time, location)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(uuidv4(), association.id, orchestra.id, 2, '20:00', '22:15', 'Dorpshuis');

      const pollId = await createDatePoll();
      await activateAndVote(pollId);

      await request(app)
        .post(`/api/polls/${pollId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'closed' });

      expect(rehearsalInstances()[0].start_time).toBe('20:00');
    });

    it('does not create a second rehearsal when the poll is closed again', async () => {
      const pollId = await createDatePoll();
      await activateAndVote(pollId);

      for (const status of ['closed', 'archived', 'closed']) {
        await request(app)
          .post(`/api/polls/${pollId}/status`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ status });
      }

      expect(rehearsalInstances()).toHaveLength(1);
    });

    it('creates nothing when auto-create is off', async () => {
      const pollId = await createDatePoll({ autoCreateRehearsal: false });
      await activateAndVote(pollId);

      await request(app)
        .post(`/api/polls/${pollId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'closed' });

      expect(rehearsalInstances()).toHaveLength(0);
    });

    it('creates nothing for a poll that is not a date poll', async () => {
      const pollId = await createDatePoll({ isDatePoll: false });
      await activateAndVote(pollId);

      await request(app)
        .post(`/api/polls/${pollId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'closed' });

      expect(rehearsalInstances()).toHaveLength(0);
    });

    it('rejects an unknown status', async () => {
      const pollId = await createDatePoll();

      const response = await request(app)
        .post(`/api/polls/${pollId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'onzin' });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/polls/:id/create-rehearsal', () => {
    /** Sluit een peiling zonder auto-aanmaak, zodat het expliciete endpoint het werk doet. */
    async function closedPollWithoutAutoCreate() {
      const pollId = await createDatePoll({ autoCreateRehearsal: false });
      await activateAndVote(pollId);
      await request(app)
        .post(`/api/polls/${pollId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'closed' });
      return pollId;
    }

    it('creates a rehearsal from the winning option', async () => {
      const pollId = await closedPollWithoutAutoCreate();

      const response = await request(app)
        .post(`/api/polls/${pollId}/create-rehearsal`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ orchestraId: orchestra.id });

      expect(response.status).toBe(200);
      expect(response.body.rehearsalId).toBeTruthy();
      expect(rehearsalInstances()).toHaveLength(1);
    });

    it('writes the same row shape as the automatic path', async () => {
      const pollId = await closedPollWithoutAutoCreate();

      await request(app)
        .post(`/api/polls/${pollId}/create-rehearsal`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ orchestraId: orchestra.id });

      const row = rehearsalInstances()[0];
      expect(row.association_id).toBe(association.id);
      expect(row.orchestra_id).toBe(orchestra.id);
      expect(row.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(row.start_time).toBe('19:30');
      expect(row.end_time).toBe('22:00');
      expect(row.status).toBe('scheduled');
      expect(row.created_by).toBe(adminUser.id);
    });

    it('returns the date in the same format that is stored', async () => {
      const pollId = await closedPollWithoutAutoCreate();

      const response = await request(app)
        .post(`/api/polls/${pollId}/create-rehearsal`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ orchestraId: orchestra.id });

      expect(response.body.date).toBe(rehearsalInstances()[0].date);
    });

    it('produces a row the duplicate check of the automatic path recognises', async () => {
      const pollId = await closedPollWithoutAutoCreate();

      await request(app)
        .post(`/api/polls/${pollId}/create-rehearsal`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ orchestraId: orchestra.id });

      const row = rehearsalInstances()[0];
      const found = testDb
        .prepare('SELECT id FROM rehearsal_instances WHERE association_id = ? AND orchestra_id = ? AND date = ?')
        .get(association.id, orchestra.id, row.date);

      expect(found).toBeDefined();
    });

    it('accepts an explicit location and notes', async () => {
      const pollId = await closedPollWithoutAutoCreate();

      await request(app)
        .post(`/api/polls/${pollId}/create-rehearsal`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ orchestraId: orchestra.id, location: 'Kerk', notes: 'Extra repetitie' });

      const row = rehearsalInstances()[0];
      expect(row.location).toBe('Kerk');
      expect(row.notes).toBe('Extra repetitie');
    });

    it('refuses while the poll is still open', async () => {
      const pollId = await createDatePoll({ autoCreateRehearsal: false });
      await activateAndVote(pollId);

      const response = await request(app)
        .post(`/api/polls/${pollId}/create-rehearsal`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(response.status).toBe(400);
    });

    it('rejects a regular member', async () => {
      const pollId = await closedPollWithoutAutoCreate();

      const response = await request(app)
        .post(`/api/polls/${pollId}/create-rehearsal`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({});

      expect(response.status).toBe(403);
    });

    it('returns 404 for a poll of another association', async () => {
      const otherAssociation = uuidv4();
      testDb.prepare('INSERT INTO associations (id, name) VALUES (?, ?)').run(otherAssociation, 'Andere vereniging');
      const foreignPoll = uuidv4();
      testDb
        .prepare(
          `INSERT INTO polls (id, association_id, title, status, created_by)
           VALUES (?, ?, ?, 'closed', ?)`,
        )
        .run(foreignPoll, otherAssociation, 'Peiling elders', memberUser.id);

      const response = await request(app)
        .post(`/api/polls/${foreignPoll}/create-rehearsal`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(response.status).toBe(404);
    });
  });
});
