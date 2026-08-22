/**
 * Tests voor de workflows-api.
 *
 * De functies in workflows.ts zetten een pad in elkaar, geven een body mee en
 * leveren `response.data` terug. Daarom wordt hier op het pad, de methode, de
 * body en de queryreeks getoetst - een typefout daarin geeft geen foutmelding
 * maar een leeg scherm. De routes zijn vergeleken met
 * backend/src/routes/workflows.ts (gemount op /api/workflows in index.ts).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  startNepserver,
  stopNepserver,
  antwoordMet,
  antwoordMetFout,
  antwoordMetNetwerkfout,
  antwoordMetTijdslimiet,
  laatsteVerzoek,
  alleVerzoeken,
} from './nepserver';
import {
  getWorkflows,
  getWorkflow,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  addWorkflowTrigger,
  removeWorkflowTrigger,
  addWorkflowAction,
  removeWorkflowAction,
  updateWorkflowTrigger,
  updateWorkflowAction,
  runWorkflow,
  getWorkflowExecutions,
  getAvailableEvents,
} from '../workflows';

beforeEach(() => startNepserver());
afterEach(() => stopNepserver());

// ===========================================
// WORKFLOWS
// ===========================================

describe('getWorkflows', () => {
  it('bevraagt /workflows', async () => {
    antwoordMet([{ id: 'w1', name: 'Herinnering repetitie' }]);
    const workflows = await getWorkflows();

    expect(laatsteVerzoek().methode).toBe('get');
    expect(laatsteVerzoek().pad).toBe('/workflows');
    expect(workflows).toHaveLength(1);
  });

  it('geeft een lege lijst terug als er nog niets is ingericht', async () => {
    antwoordMet([]);
    await expect(getWorkflows()).resolves.toEqual([]);
  });

  it('laat een 403 door voor wie geen beheerder is', async () => {
    // De hele router zit achter requireRole('admin').
    antwoordMetFout(403, { error: 'Geen toegang.' });

    await expect(getWorkflows()).rejects.toMatchObject({ response: { status: 403 } });
  });
});

describe('getWorkflow', () => {
  it('haalt een workflow op via /workflows/:id', async () => {
    antwoordMet({ id: 'w1', name: 'Herinnering', triggers: [], actions: [] });
    const workflow = await getWorkflow('w1');

    expect(laatsteVerzoek().pad).toBe('/workflows/w1');
    expect(workflow.name).toBe('Herinnering');
  });

  it('geeft triggers en acties ongewijzigd door', async () => {
    const antwoord = {
      id: 'w1',
      name: 'Herinnering',
      isActive: true,
      runOncePerEntity: false,
      triggerCount: 1,
      actionCount: 1,
      executionCount: 4,
      failedCount: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      createdBy: 'u1',
      triggers: [{ id: 'tr1', triggerType: 'date_field', daysBefore: 2, timeOfDay: '09:00', isActive: true }],
      actions: [{ id: 'ac1', actionType: 'send_email', actionOrder: 1, config: { subject: 'Hoi' }, isActive: true }],
    };
    antwoordMet(antwoord);

    await expect(getWorkflow('w1')).resolves.toEqual(antwoord);
  });

  it('laat een 404 door in plaats van hem als leeg resultaat te verpakken', async () => {
    antwoordMetFout(404, { error: 'Workflow not found' });

    await expect(getWorkflow('bestaat-niet')).rejects.toMatchObject({
      response: { status: 404, data: { error: 'Workflow not found' } },
    });
  });

  it('werpt bij een netwerkfout zonder respons', async () => {
    antwoordMetNetwerkfout();

    await expect(getWorkflow('w1')).rejects.toMatchObject({ code: 'ERR_NETWORK' });
  });

  it('werpt als het verzoek in de tijdslimiet loopt', async () => {
    antwoordMetTijdslimiet();

    await expect(getWorkflow('w1')).rejects.toMatchObject({ code: 'ECONNABORTED' });
  });
});

describe('createWorkflow', () => {
  it('post de workflow met triggers en acties in een keer', async () => {
    antwoordMet({ id: 'w9', message: 'Workflow aangemaakt' });

    await createWorkflow({
      name: 'Herinnering concert',
      description: 'Mail twee dagen vooraf',
      isActive: true,
      runOncePerEntity: true,
      triggers: [
        {
          triggerType: 'date_field',
          dateFieldEntity: 'concerts',
          dateFieldName: 'date',
          daysBefore: 2,
          timeOfDay: '09:00',
        },
      ],
      actions: [{ actionType: 'send_email', actionOrder: 1, config: { subject: 'Bijna zover' } }],
    });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/workflows');
    // createWorkflowSchema eist minstens een trigger en een actie in dezelfde
    // body; los aanmaken kan hier niet.
    expect(verzoek.body).toEqual({
      name: 'Herinnering concert',
      description: 'Mail twee dagen vooraf',
      isActive: true,
      runOncePerEntity: true,
      triggers: [
        {
          triggerType: 'date_field',
          dateFieldEntity: 'concerts',
          dateFieldName: 'date',
          daysBefore: 2,
          timeOfDay: '09:00',
        },
      ],
      actions: [{ actionType: 'send_email', actionOrder: 1, config: { subject: 'Bijna zover' } }],
    });
  });

  it('stuurt isActive false mee in plaats van het weg te laten', async () => {
    antwoordMet({ id: 'w9', message: '' });
    await createWorkflow({
      name: 'Uit',
      isActive: false,
      triggers: [{ triggerType: 'manual' }],
      actions: [{ actionType: 'delay', actionOrder: 1, config: { minutes: 5 } }],
    });

    expect(laatsteVerzoek().body).toMatchObject({ isActive: false });
  });

  it('houdt een geneste config met voorwaarden intact', async () => {
    antwoordMet({ id: 'w9', message: '' });
    await createWorkflow({
      name: 'Met voorwaarden',
      triggers: [{ triggerType: 'event', eventName: 'concert.created', conditions: { veld: { gelijk: 'gala' } } }],
      actions: [
        {
          actionType: 'webhook',
          actionOrder: 1,
          config: { url: 'https://haken.example/x', headers: { 'X-Test': '1' } },
        },
      ],
    });

    const body = laatsteVerzoek().body as Record<string, any>;
    // De backend slaat config en conditions als JSON op; platslaan of
    // verstringen aan deze kant zou dubbel gecodeerde velden opleveren.
    expect(body.triggers[0].conditions).toEqual({ veld: { gelijk: 'gala' } });
    expect(body.actions[0].config.headers).toEqual({ 'X-Test': '1' });
  });

  it('geeft een validatiefout van de server door', async () => {
    antwoordMetFout(400, { error: 'Minstens een trigger is verplicht.' });

    await expect(createWorkflow({ name: 'Leeg', triggers: [], actions: [] })).rejects.toMatchObject({
      response: { status: 400, data: { error: 'Minstens een trigger is verplicht.' } },
    });
  });
});

describe('updateWorkflow', () => {
  it('gebruikt PATCH, niet PUT', async () => {
    antwoordMet({ message: 'Bijgewerkt' });
    await updateWorkflow('w1', { isActive: false });

    const verzoek = laatsteVerzoek();
    // De backend heeft alleen PATCH /:id voor workflows.
    expect(verzoek.methode).toBe('patch');
    expect(verzoek.pad).toBe('/workflows/w1');
    expect(verzoek.body).toEqual({ isActive: false });
  });
});

describe('deleteWorkflow', () => {
  it('verwijdert een workflow', async () => {
    antwoordMet({ message: 'Verwijderd' });
    await deleteWorkflow('w1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/workflows/w1');
  });
});

// ===========================================
// TRIGGERS EN ACTIES
// ===========================================

describe('triggers', () => {
  it('addWorkflowTrigger post op /workflows/:id/triggers', async () => {
    antwoordMet({ id: 'tr9', message: 'Trigger toegevoegd' });
    await addWorkflowTrigger('w1', { triggerType: 'schedule', scheduleCron: '0 9 * * 1' });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/workflows/w1/triggers');
    expect(verzoek.body).toEqual({ triggerType: 'schedule', scheduleCron: '0 9 * * 1' });
  });

  it('addWorkflowTrigger stuurt daysBefore 0 mee in plaats van het weg te laten', async () => {
    antwoordMet({ id: 'tr9', message: '' });
    await addWorkflowTrigger('w1', { triggerType: 'date_field', dateFieldName: 'date', daysBefore: 0 });

    // 0 betekent "op de dag zelf" en is dus iets anders dan niets meesturen.
    expect(laatsteVerzoek().body).toMatchObject({ daysBefore: 0 });
  });

  it('removeWorkflowTrigger verwijdert de juiste trigger', async () => {
    antwoordMet({ message: 'Verwijderd' });
    await removeWorkflowTrigger('w1', 'tr1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/workflows/w1/triggers/tr1');
  });

  it('updateWorkflowTrigger stuurt een PATCH naar de trigger', async () => {
    antwoordMet({ message: 'Bijgewerkt' });
    await updateWorkflowTrigger('w1', 'tr1', { timeOfDay: '08:30' });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('patch');
    expect(verzoek.pad).toBe('/workflows/w1/triggers/tr1');
    expect(verzoek.body).toEqual({ timeOfDay: '08:30' });
    // LET OP: backend/src/routes/workflows.ts kent voor deze route alleen een
    // DELETE. De PATCH belandt dus in de 404-afhandeling. Deze test legt vast
    // wat de frontend nu verstuurt; de route moet aan serverkant nog gemaakt
    // worden.
  });
});

describe('acties', () => {
  it('addWorkflowAction post op /workflows/:id/actions', async () => {
    antwoordMet({ id: 'ac9', message: 'Actie toegevoegd' });
    await addWorkflowAction('w1', {
      actionType: 'send_notification',
      actionOrder: 2,
      config: { title: 'Let op' },
    });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/workflows/w1/actions');
    expect(verzoek.body).toEqual({
      actionType: 'send_notification',
      actionOrder: 2,
      config: { title: 'Let op' },
    });
  });

  it('addWorkflowAction stuurt een lege config mee als object', async () => {
    antwoordMet({ id: 'ac9', message: '' });
    await addWorkflowAction('w1', { actionType: 'delay', actionOrder: 1, config: {} });

    // actionSchema eist het veld config; weglaten geeft een 400.
    expect(laatsteVerzoek().body).toEqual({ actionType: 'delay', actionOrder: 1, config: {} });
  });

  it('removeWorkflowAction verwijdert de juiste actie', async () => {
    antwoordMet({ message: 'Verwijderd' });
    await removeWorkflowAction('w1', 'ac1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/workflows/w1/actions/ac1');
  });

  it('updateWorkflowAction stuurt een PATCH naar de actie', async () => {
    antwoordMet({ message: 'Bijgewerkt' });
    await updateWorkflowAction('w1', 'ac1', { config: { subject: 'Ander onderwerp' } });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('patch');
    expect(verzoek.pad).toBe('/workflows/w1/actions/ac1');
    expect(verzoek.body).toEqual({ config: { subject: 'Ander onderwerp' } });
    // LET OP: ook deze route kent aan serverkant alleen een DELETE; zie de
    // opmerking bij updateWorkflowTrigger.
  });
});

// ===========================================
// UITVOEREN
// ===========================================

describe('runWorkflow', () => {
  it('post zonder body op de run-route', async () => {
    antwoordMet({ executionId: 'e1', message: 'Gestart' });
    const resultaat = await runWorkflow('w1');

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/workflows/w1/run');
    expect(verzoek.body).toBeUndefined();
    expect(resultaat.executionId).toBe('e1');
  });

  it('laat een 400 door als de workflow niet handmatig gestart mag worden', async () => {
    antwoordMetFout(400, { error: 'Workflow is niet actief.' });

    await expect(runWorkflow('w1')).rejects.toMatchObject({ response: { status: 400 } });
  });
});

describe('getWorkflowExecutions', () => {
  it('zet limiet en beginpunt in de queryreeks', async () => {
    antwoordMet({ executions: [], total: 0, limit: 25, offset: 50 });
    await getWorkflowExecutions('w1', { limit: 25, offset: 50 });

    const { pad, query } = laatsteVerzoek();
    expect(pad).toBe('/workflows/w1/executions');
    expect(query.get('limit')).toBe('25');
    expect(query.get('offset')).toBe('50');
  });

  it('stuurt geen queryreeks mee zonder parameters', async () => {
    antwoordMet({ executions: [], total: 0, limit: 50, offset: 0 });
    await getWorkflowExecutions('w1');

    expect(laatsteVerzoek().queryreeks).toBe('');
  });

  it('stuurt offset 0 mee in plaats van het weg te laten', async () => {
    antwoordMet({ executions: [], total: 0, limit: 50, offset: 0 });
    await getWorkflowExecutions('w1', { offset: 0 });

    expect(laatsteVerzoek().query.get('offset')).toBe('0');
  });

  it('geeft de uitvoeringen met paginering ongewijzigd door', async () => {
    const antwoord = {
      executions: [
        {
          id: 'e1',
          triggeredBy: 'schedule',
          status: 'completed',
          startedAt: '2026-01-01T09:00:00.000Z',
          completedAt: '2026-01-01T09:00:01.000Z',
          createdAt: '2026-01-01T09:00:00.000Z',
        },
      ],
      total: 1,
      limit: 50,
      offset: 0,
    };
    antwoordMet(antwoord);

    await expect(getWorkflowExecutions('w1')).resolves.toEqual(antwoord);
  });
});

describe('getAvailableEvents', () => {
  it('bevraagt /workflows/events/available', async () => {
    antwoordMet([{ name: 'concert.created', label: 'Concert aangemaakt', entity: 'concerts' }]);
    const gebeurtenissen = await getAvailableEvents();

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('get');
    // Twee segmenten, dus dit botst niet met /:id; wel met /:id/executions als
    // het tweede segment 'executions' zou heten.
    expect(verzoek.pad).toBe('/workflows/events/available');
    expect(gebeurtenissen[0].name).toBe('concert.created');
  });

  it('geeft een lege lijst terug zonder te vallen', async () => {
    antwoordMet([]);
    await expect(getAvailableEvents()).resolves.toEqual([]);
  });
});

// ===========================================
// ALGEMEEN GEDRAG
// ===========================================

describe('algemeen gedrag van de workflows-api', () => {
  it('stuurt precies een verzoek per aanroep', async () => {
    antwoordMet([]);
    await getWorkflows();

    expect(alleVerzoeken()).toHaveLength(1);
  });

  it('geeft een leeg antwoordlichaam door als lege string', async () => {
    antwoordMet('', { status: 204 });

    await expect(deleteWorkflow('w1')).resolves.toBe('');
  });

  it('laat een 500 door in plaats van undefined te leveren', async () => {
    antwoordMetFout(500, { error: 'Interne fout' });

    await expect(getWorkflows()).rejects.toMatchObject({ response: { status: 500 } });
  });
});
