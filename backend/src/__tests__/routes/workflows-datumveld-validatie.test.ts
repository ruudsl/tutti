/**
 * Een datumveld-trigger wordt bij het opslaan gecontroleerd.
 *
 * `date_field_entity` en `date_field_name` gaan in de motor rechtstreeks de
 * query in: een kolomnaam kan niet als parameter. De route nam ze aan als
 * willekeurige tekst. Nu moet de soort entiteit bekend zijn en moet de tabel
 * de kolom echt hebben - bij aanmaken, bij een losse trigger en bij het
 * bijwerken van een bestaande.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import '../setup';
import db from '../../database/connection';
import workflowRoutes from '../../routes/workflows';
import { errorHandler } from '../../middleware/errorHandler';
import { createTestEnvironment } from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api/workflows', workflowRoutes);
app.use(errorHandler);

describe('workflows: een datumveld-trigger wordt gecontroleerd', () => {
  let token: string;

  beforeEach(() => {
    token = createTestEnvironment().adminToken;
  });

  const als = (methode: 'post' | 'patch', pad: string) =>
    request(app)[methode](`/api/workflows${pad}`).set('Authorization', `Bearer ${token}`);

  const workflowMet = (trigger: Record<string, unknown>) => ({
    name: 'Herinnering',
    triggers: [trigger],
    actions: [{ actionType: 'send_email', config: { subject: 'x' } }],
  });

  const geldig = { triggerType: 'date_field', dateFieldEntity: 'concert', dateFieldName: 'date', daysBefore: 3 };

  it('neemt een bestaande kolom aan', async () => {
    const antwoord = await als('post', '/').send(workflowMet(geldig));
    expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);
  });

  it('weigert een veldnaam met sql erin', async () => {
    const antwoord = await als('post', '/').send(
      workflowMet({ ...geldig, dateFieldName: 'date) OR 1=1 OR DATE(date' }),
    );
    expect(antwoord.status).toBe(400);

    const aantal = db.prepare('SELECT COUNT(*) as n FROM workflow_triggers').get() as { n: number };
    expect(aantal.n).toBe(0);
  });

  it('weigert een kolom die de tabel niet heeft', async () => {
    expect((await als('post', '/').send(workflowMet({ ...geldig, dateFieldName: 'startDate' }))).status).toBe(400);
  });

  it('weigert een onbekende soort entiteit', async () => {
    expect((await als('post', '/').send(workflowMet({ ...geldig, dateFieldEntity: 'sqlite_master' }))).status).toBe(
      400,
    );
  });

  it('weigert een datumveld-trigger zonder veld', async () => {
    expect((await als('post', '/').send(workflowMet({ triggerType: 'date_field' }))).status).toBe(400);
  });

  it('laat andere soorten trigger met rust', async () => {
    expect((await als('post', '/').send(workflowMet({ triggerType: 'manual' }))).status).toBe(201);
  });

  it('controleert ook een losse trigger', async () => {
    const id = (await als('post', '/').send(workflowMet({ triggerType: 'manual' }))).body.id;

    const fout = await als('post', `/${id}/triggers`).send({ ...geldig, dateFieldName: 'x; DROP TABLE users' });
    expect(fout.status).toBe(400);

    const goed = await als('post', `/${id}/triggers`).send(geldig);
    expect(goed.status).toBe(201);
  });

  it('controleert bij bijwerken de trigger zoals hij wordt', async () => {
    const id = (await als('post', '/').send(workflowMet(geldig))).body.id;
    const trigger = db.prepare('SELECT id FROM workflow_triggers WHERE workflow_id = ?').get(id) as { id: string };

    const fout = await als('patch', `/${id}/triggers/${trigger.id}`).send({ dateFieldName: 'bestaat_niet' });
    expect(fout.status).toBe(400);

    const rij = db.prepare('SELECT date_field_name FROM workflow_triggers WHERE id = ?').get(trigger.id) as {
      date_field_name: string;
    };
    expect(rij.date_field_name).toBe('date');

    // Een wissel naar een andere soort entiteit moet bij de bestaande kolom
    // passen.
    expect((await als('patch', `/${id}/triggers/${trigger.id}`).send({ dateFieldEntity: 'task' })).status).toBe(400);
    expect(
      (await als('patch', `/${id}/triggers/${trigger.id}`).send({ dateFieldEntity: 'task', dateFieldName: 'due_date' }))
        .status,
    ).toBe(200);
  });

  it('controleert een wissel naar date_field', async () => {
    const id = (await als('post', '/').send(workflowMet({ triggerType: 'manual' }))).body.id;
    const trigger = db.prepare('SELECT id FROM workflow_triggers WHERE workflow_id = ?').get(id) as { id: string };

    expect((await als('patch', `/${id}/triggers/${trigger.id}`).send({ triggerType: 'date_field' })).status).toBe(400);
  });
});
