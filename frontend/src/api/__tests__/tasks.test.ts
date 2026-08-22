/**
 * Tests voor de taken-api.
 *
 * De functies in tasks.ts bouwen zelf hun queryreeks en pad. Er wordt hier op
 * pad, methode, body en queryreeks getoetst - een typefout daarin geeft geen
 * foutmelding maar een leeg scherm of een filter die niets doet. De routes zijn
 * vergeleken met backend/src/routes/tasks.ts (gekoppeld op /api/tasks).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
  getTaskLists,
  createTaskList,
  updateTaskList,
  deleteTaskList,
  getTasks,
  getTask,
  createTask,
  updateTask,
  deleteTask,
  addChecklistItem,
  updateChecklistItem,
  deleteChecklistItem,
  addTaskComment,
  deleteTaskComment,
  getTaskTemplates,
  createTaskTemplate,
  updateTaskTemplate,
  deleteTaskTemplate,
  createTaskFromTemplate,
  applyTaskTemplate,
  getTaskSummary,
} from '../tasks';

beforeEach(() => startNepserver());
afterEach(() => {
  stopNepserver();
  vi.restoreAllMocks();
});

// ===========================================
// TAKENLIJSTEN
// ===========================================

describe('takenlijsten', () => {
  it('getTaskLists bevraagt /tasks/lists', async () => {
    antwoordMet([{ id: 'tl1', name: 'Bestuur', openCount: 2, totalCount: 5 }]);
    const lijsten = await getTaskLists();

    expect(laatsteVerzoek().methode).toBe('get');
    // 'lists' mag geen taak-id worden; in de backend staat deze route daarom
    // voor /:id geregistreerd.
    expect(laatsteVerzoek().pad).toBe('/tasks/lists');
    expect(lijsten).toHaveLength(1);
  });

  it('getTaskLists geeft een lege lijst terug zonder te vallen', async () => {
    antwoordMet([]);
    await expect(getTaskLists()).resolves.toEqual([]);
  });

  it('createTaskList stuurt naam, kleur en pictogram mee', async () => {
    antwoordMet({ id: 'tl1', message: 'Lijst aangemaakt.' });

    await createTaskList({
      name: 'Concertorganisatie',
      description: 'Alles rond het concert',
      color: '#ff8800',
      icon: 'muziek',
    });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/tasks/lists');
    expect(verzoek.body).toEqual({
      name: 'Concertorganisatie',
      description: 'Alles rond het concert',
      color: '#ff8800',
      icon: 'muziek',
    });
  });

  it('updateTaskList gebruikt PUT op /tasks/lists/:id', async () => {
    antwoordMet({ message: 'Bijgewerkt.' });

    await updateTaskList('tl1', { name: 'Concert 2027' });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('put');
    expect(verzoek.pad).toBe('/tasks/lists/tl1');
    expect(verzoek.body).toEqual({ name: 'Concert 2027' });
  });

  it('deleteTaskList verwijdert een lijst', async () => {
    antwoordMet({ message: 'Verwijderd.' });
    await deleteTaskList('tl1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/tasks/lists/tl1');
  });

  it('deleteTaskList laat een 400 door wanneer er nog taken in staan', async () => {
    antwoordMetFout(400, { error: 'Lijst bevat nog taken.' });

    await expect(deleteTaskList('tl1')).rejects.toMatchObject({ response: { status: 400 } });
  });
});

// ===========================================
// TAKEN OPHALEN
// ===========================================

describe('getTasks', () => {
  it('haalt de taken op zonder vraagteken als er geen filters zijn', async () => {
    antwoordMet([]);
    await getTasks();

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('get');
    expect(verzoek.pad).toBe('/tasks');
    expect(verzoek.queryreeks).toBe('');
  });

  it('zet alle filters in de queryreeks', async () => {
    antwoordMet([]);

    await getTasks({
      status: 'in_progress',
      priority: 'high',
      listId: 'tl1',
      assignedTo: 'u1',
      search: 'programma',
      showCompleted: true,
    });

    const { query } = laatsteVerzoek();
    // De backend leest exact deze namen uit req.query.
    expect(query.get('status')).toBe('in_progress');
    expect(query.get('priority')).toBe('high');
    expect(query.get('listId')).toBe('tl1');
    expect(query.get('assignedTo')).toBe('u1');
    expect(query.get('search')).toBe('programma');
    expect(query.get('showCompleted')).toBe('true');
  });

  it('laat showCompleted weg als het uit staat', async () => {
    antwoordMet([]);
    await getTasks({ showCompleted: false, status: 'todo' });

    // De backend verbergt afgeronde taken zolang showCompleted ontbreekt of
    // 'false' is; weglaten geeft hetzelfde resultaat en houdt de url kort.
    expect(laatsteVerzoek().queryreeks).toBe('status=todo');
  });

  it('stuurt showCompleted als tekst true, want de backend vergelijkt met de string', async () => {
    antwoordMet([]);
    await getTasks({ showCompleted: true });

    expect(laatsteVerzoek().queryreeks).toBe('showCompleted=true');
  });

  it('geeft de bijzondere waarde none voor listId ongewijzigd door', async () => {
    antwoordMet([]);
    await getTasks({ listId: 'none' });

    // De backend leest 'none' als "taken zonder lijst"; die waarde mag hier
    // niet weggefilterd worden.
    expect(laatsteVerzoek().query.get('listId')).toBe('none');
  });

  it('codeert een zoekterm met ampersand, spatie en procentteken', async () => {
    antwoordMet([]);
    await getTasks({ search: 'kaartverkoop & pers 100%' });

    const { queryreeks, query } = laatsteVerzoek();
    expect(queryreeks).not.toContain('& pers');
    expect(queryreeks).toContain('%26');
    expect(queryreeks).toContain('100%25');
    expect(query.get('search')).toBe('kaartverkoop & pers 100%');
  });

  it('geeft een lege takenlijst terug zonder te vallen', async () => {
    antwoordMet([]);
    await expect(getTasks()).resolves.toEqual([]);
  });

  it('werpt bij een 401 en levert geen lege lijst op', async () => {
    antwoordMetFout(401, { error: 'Niet ingelogd.' });

    await expect(getTasks()).rejects.toMatchObject({ response: { status: 401 } });
  });
});

// ===========================================
// TAKEN BEHEREN
// ===========================================

describe('taken beheren', () => {
  it('getTask haalt een taak met checklist, reacties en toewijzingen op', async () => {
    const taak = {
      id: 't1',
      title: 'Programmaboekje maken',
      status: 'todo',
      priority: 'high',
      checklist: [{ id: 'c1', content: 'Teksten verzamelen', isCompleted: false, sortOrder: 0 }],
      comments: [],
      assignments: [{ userId: 'u1', userName: 'Jan', assignedAt: '2026-08-01T10:00:00Z' }],
    };
    antwoordMet(taak);

    const resultaat = await getTask('t1');

    expect(laatsteVerzoek().pad).toBe('/tasks/t1');
    expect(resultaat).toEqual(taak);
  });

  it('getTask laat een 404 door in plaats van undefined te leveren', async () => {
    antwoordMetFout(404, { error: 'Taak niet gevonden.' });

    await expect(getTask('t9')).rejects.toMatchObject({ response: { status: 404 } });
  });

  it('createTask stuurt alle velden van een nieuwe taak mee', async () => {
    antwoordMet({ id: 't1', message: 'Taak aangemaakt.' });

    await createTask({
      title: 'Programmaboekje maken',
      description: 'Inclusief toelichting per stuk',
      taskListId: 'tl1',
      priority: 'high',
      dueDate: '2026-09-01',
      reminderAt: '2026-08-25T09:00:00.000Z',
      estimatedHours: 6,
      assignedTo: 'u1',
      relatedEntityType: 'concert',
      relatedEntityId: 'c1',
    });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/tasks');
    expect(verzoek.body).toEqual({
      title: 'Programmaboekje maken',
      description: 'Inclusief toelichting per stuk',
      taskListId: 'tl1',
      priority: 'high',
      dueDate: '2026-09-01',
      reminderAt: '2026-08-25T09:00:00.000Z',
      estimatedHours: 6,
      assignedTo: 'u1',
      relatedEntityType: 'concert',
      relatedEntityId: 'c1',
    });
  });

  it('createTask stuurt alleen de titel als er verder niets ingevuld is', async () => {
    antwoordMet({ id: 't1', message: 'Taak aangemaakt.' });
    await createTask({ title: 'Snelle notitie' });

    expect(laatsteVerzoek().body).toEqual({ title: 'Snelle notitie' });
  });

  it('updateTask gebruikt PUT op /tasks/:id', async () => {
    antwoordMet({ message: 'Taak bijgewerkt.' });

    await updateTask('t1', { status: 'done', actualHours: 5 });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('put');
    expect(verzoek.pad).toBe('/tasks/t1');
    expect(verzoek.body).toEqual({ status: 'done', actualHours: 5 });
  });

  it('updateTask stuurt null mee om een toewijzing of einddatum te wissen', async () => {
    antwoordMet({ message: 'Taak bijgewerkt.' });

    await updateTask('t1', { assignedTo: null, dueDate: null, taskListId: null });

    // null is betekenisvol: het veld leegmaken. Weglaten zou de oude waarde
    // laten staan.
    expect(laatsteVerzoek().body).toEqual({ assignedTo: null, dueDate: null, taskListId: null });
  });

  it('deleteTask verwijdert een taak', async () => {
    antwoordMet({ message: 'Verwijderd.' });
    await deleteTask('t1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/tasks/t1');
  });
});

// ===========================================
// CHECKLIST
// ===========================================

describe('checklist', () => {
  it('addChecklistItem verpakt de tekst in een object', async () => {
    antwoordMet({ id: 'c1', content: 'Teksten verzamelen', isCompleted: false, message: 'Toegevoegd.' });

    await addChecklistItem('t1', 'Teksten verzamelen');

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/tasks/t1/checklist');
    // De backend leest req.body.content; een kale string zou niet aankomen.
    expect(verzoek.body).toEqual({ content: 'Teksten verzamelen' });
  });

  it('updateChecklistItem zet taak en punt allebei in het pad', async () => {
    antwoordMet({ message: 'Bijgewerkt.' });

    await updateChecklistItem('t1', 'c1', { isCompleted: true });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('put');
    expect(verzoek.pad).toBe('/tasks/t1/checklist/c1');
    expect(verzoek.body).toEqual({ isCompleted: true });
  });

  it('updateChecklistItem stuurt isCompleted false mee in plaats van het veld weg te laten', async () => {
    antwoordMet({ message: 'Bijgewerkt.' });

    await updateChecklistItem('t1', 'c1', { isCompleted: false });

    // false betekent hier "vinkje weer weghalen"; weglaten zou niets doen.
    expect(laatsteVerzoek().body).toEqual({ isCompleted: false });
  });

  it('updateChecklistItem kan ook alleen de tekst wijzigen', async () => {
    antwoordMet({ message: 'Bijgewerkt.' });
    await updateChecklistItem('t1', 'c1', { content: 'Teksten nakijken' });

    expect(laatsteVerzoek().body).toEqual({ content: 'Teksten nakijken' });
  });

  it('deleteChecklistItem verwijdert een punt', async () => {
    antwoordMet({ message: 'Verwijderd.' });
    await deleteChecklistItem('t1', 'c1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/tasks/t1/checklist/c1');
  });
});

// ===========================================
// REACTIES
// ===========================================

describe('reacties op taken', () => {
  it('addTaskComment verpakt de tekst in een object', async () => {
    antwoordMet({ id: 'r1', content: 'Ik pak dit op', authorName: 'Jan', message: 'Reactie geplaatst.' });

    const reactie = await addTaskComment('t1', 'Ik pak dit op');

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/tasks/t1/comments');
    expect(verzoek.body).toEqual({ content: 'Ik pak dit op' });
    expect(reactie.id).toBe('r1');
  });

  it('deleteTaskComment zet taak en reactie allebei in het pad', async () => {
    antwoordMet({ message: 'Verwijderd.' });
    await deleteTaskComment('t1', 'r1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/tasks/t1/comments/r1');
  });

  it('deleteTaskComment laat een 403 door voor wie niet de schrijver is', async () => {
    antwoordMetFout(403, { error: 'Geen toegang.' });

    await expect(deleteTaskComment('t1', 'r1')).rejects.toMatchObject({ response: { status: 403 } });
  });
});

// ===========================================
// SJABLONEN
// ===========================================

describe('sjablonen', () => {
  it('getTaskTemplates bevraagt het vaste pad /tasks/templates', async () => {
    antwoordMet([]);
    await getTaskTemplates();

    // 'templates' mag geen taak-id worden; in de backend staat deze route
    // daarom voor /:id geregistreerd.
    expect(laatsteVerzoek().pad).toBe('/tasks/templates');
  });

  it('createTaskTemplate stuurt de checklistpunten als lijst tekst mee', async () => {
    antwoordMet({ id: 's1', message: 'Sjabloon aangemaakt.' });

    await createTaskTemplate({
      name: 'Concertvoorbereiding',
      description: 'Vaste stappen',
      taskListId: 'tl1',
      priority: 'medium',
      estimatedHours: 4,
      checklistItems: ['Zaal boeken', 'Programma vaststellen', 'Publiciteit'],
    });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/tasks/templates');
    expect(verzoek.body).toEqual({
      name: 'Concertvoorbereiding',
      description: 'Vaste stappen',
      taskListId: 'tl1',
      priority: 'medium',
      estimatedHours: 4,
      checklistItems: ['Zaal boeken', 'Programma vaststellen', 'Publiciteit'],
    });
  });

  it('createTaskTemplate stuurt een lege checklist mee zoals hij is', async () => {
    antwoordMet({ id: 's1', message: 'Sjabloon aangemaakt.' });
    await createTaskTemplate({ name: 'Leeg sjabloon', checklistItems: [] });

    expect(laatsteVerzoek().body).toEqual({ name: 'Leeg sjabloon', checklistItems: [] });
  });

  it('updateTaskTemplate gebruikt PUT op /tasks/templates/:id', async () => {
    antwoordMet({ message: 'Bijgewerkt.' });

    await updateTaskTemplate('s1', { name: 'Concertvoorbereiding 2027' });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('put');
    expect(verzoek.pad).toBe('/tasks/templates/s1');
  });

  it('deleteTaskTemplate verwijdert een sjabloon', async () => {
    antwoordMet({ message: 'Verwijderd.' });
    await deleteTaskTemplate('s1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/tasks/templates/s1');
  });

  it('createTaskFromTemplate post op de create-task-route van het sjabloon', async () => {
    antwoordMet({ id: 't1', title: 'Concertvoorbereiding', message: 'Taak aangemaakt.' });

    const resultaat = await createTaskFromTemplate('s1', {
      title: 'Concert juni',
      assignedTo: 'u1',
      dueDate: '2026-06-01',
    });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/tasks/templates/s1/create-task');
    expect(verzoek.body).toEqual({ title: 'Concert juni', assignedTo: 'u1', dueDate: '2026-06-01' });
    expect(resultaat.id).toBe('t1');
  });

  it('createTaskFromTemplate stuurt een leeg object mee als er niets is opgegeven', async () => {
    antwoordMet({ id: 't1', title: 'Concertvoorbereiding', message: 'Taak aangemaakt.' });
    await createTaskFromTemplate('s1');

    expect(laatsteVerzoek().body).toEqual({});
  });

  it('applyTaskTemplate post op /tasks/templates/:id/apply', async () => {
    antwoordMet({ tasks: [{ id: 't1', title: 'Zaal boeken' }], message: 'Sjabloon toegepast.' });

    await applyTaskTemplate('s1', { listId: 'tl1' });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    // Let op: de backend kent alleen /templates/:id/create-task. Deze route
    // bestaat daar niet; zie het rapport bij deze tak.
    expect(verzoek.pad).toBe('/tasks/templates/s1/apply');
    expect(verzoek.body).toEqual({ listId: 'tl1' });
  });

  it('applyTaskTemplate laat een 404 doorkomen in plaats van een lege takenlijst', async () => {
    antwoordMetFout(404, { error: 'Not found' });

    await expect(applyTaskTemplate('s1')).rejects.toMatchObject({ response: { status: 404 } });
  });
});

// ===========================================
// SAMENVATTING
// ===========================================

describe('getTaskSummary', () => {
  it('bevraagt het vaste pad /tasks/summary', async () => {
    antwoordMet({ statusSummary: {}, totalOpen: 0, myTasks: [], overdueTasks: [], recentCompleted: [] });
    await getTaskSummary();

    // 'summary' mag geen taak-id worden; in de backend staat deze route
    // daarom voor /:id geregistreerd.
    expect(laatsteVerzoek().methode).toBe('get');
    expect(laatsteVerzoek().pad).toBe('/tasks/summary');
  });

  it('geeft de samenvatting ongewijzigd door, inclusief geneste lijsten', async () => {
    const samenvatting = {
      statusSummary: { todo: 3, in_progress: 1, review: 0, done: 8, cancelled: 0 },
      totalOpen: 4,
      myTasks: [{ id: 't1', title: 'Programmaboekje', status: 'todo', priority: 'high', listName: 'Bestuur' }],
      overdueTasks: [{ id: 't2', title: 'Zaal boeken', status: 'todo', priority: 'urgent', dueDate: '2026-08-01' }],
      recentCompleted: [],
    };
    antwoordMet(samenvatting);

    await expect(getTaskSummary()).resolves.toEqual(samenvatting);
  });

  it('geeft een lege samenvatting door zonder te vallen', async () => {
    antwoordMet({ statusSummary: {}, totalOpen: 0, myTasks: [], overdueTasks: [], recentCompleted: [] });

    const samenvatting = await getTaskSummary();
    expect(samenvatting.myTasks).toEqual([]);
    expect(samenvatting.totalOpen).toBe(0);
  });
});

// ===========================================
// ALGEMEEN GEDRAG
// ===========================================

describe('algemeen gedrag van de taken-api', () => {
  it('stuurt precies een verzoek per aanroep', async () => {
    antwoordMet([]);
    await getTasks();

    expect(alleVerzoeken()).toHaveLength(1);
  });

  it('werpt bij een netwerkfout zonder respons', async () => {
    antwoordMetNetwerkfout();

    await expect(getTasks()).rejects.toMatchObject({ code: 'ERR_NETWORK' });
  });

  it('werpt als het verzoek in de tijdslimiet loopt', async () => {
    antwoordMetTijdslimiet();

    await expect(getTasks()).rejects.toMatchObject({ code: 'ECONNABORTED' });
  });

  it('geeft een leeg antwoordlichaam door als lege string in plaats van te vallen', async () => {
    antwoordMet('', { status: 204 });

    await expect(deleteTask('t1')).resolves.toBe('');
  });

  it('geeft null door zoals het binnenkomt', async () => {
    antwoordMet(null);

    await expect(getTask('t1')).resolves.toBeNull();
  });
});
