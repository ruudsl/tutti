/**
 * Tests voor de projecten-api.
 *
 * Een project bundelt concerten, repetities, leden en een programma. De
 * api-laag is hier niet meer dan het aan elkaar plakken van paden, en juist
 * daar zit het gevaar: niets verbindt `api.post('/projects/1/rehearsals')` met
 * de vraag of de server die route ooit geregistreerd heeft. Een verkeerd pad
 * geeft geen typefout, geen waarschuwing en geen rode test - alleen een
 * knop die het niet doet.
 *
 * Twee dingen worden hier dus vastgelegd. Ten eerste het gewone werk: welk
 * werkwoord, welk pad, welke body, en of de filters onder de naam meegaan die
 * de server leest (`type`, niet `projectType`). Ten tweede, en belangrijker:
 * elk pad dat deze module verstuurt wordt vergeleken met de routes die
 * werkelijk in backend/src/routes/projects.ts staan.
 *
 * Die tweede toets legde drie functies bloot die een route aanriepen die er
 * niet was: een repetitie koppelen, een repetitie ontkoppelen en het programma
 * herordenen. De tabel project_rehearsals bestond en werd bij het ophalen van
 * een project uitgelezen, maar geen enkele route schreef er ooit een rij in -
 * die knoppen hebben nooit gewerkt. Die routes staan er inmiddels, en het
 * laatste blok eist nu van elke functie dat haar pad aan de serverkant bestaat.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { startNepserver, stopNepserver, antwoordMet, antwoordMetFout, laatsteVerzoek } from './nepserver';
import { serverroutes, serverBiedtAan } from './serverroutes';
import * as projectenApi from '../projects';
import {
  getProjects,
  getProject,
  createProject,
  updateProject,
  updateProjectStatus,
  deleteProject,
  addProjectMember,
  removeProjectMember,
  addSetlistItem,
  removeSetlistItem,
  linkConcertToProject,
  unlinkConcertFromProject,
  linkRehearsalToProject,
  unlinkRehearsalFromProject,
  reorderProjectSetlist,
} from '../projects';

beforeEach(() => startNepserver());
afterEach(() => stopNepserver());

describe('lijst en detail', () => {
  it('stuurt de filters mee onder de namen die de server uitleest', async () => {
    antwoordMet([]);

    await getProjects({ status: 'active', type: 'festival', orchestraId: 'ork-2' });

    // backend/src/routes/projects.ts leest `status`, `type` en `orchestraId`.
    // Zou de frontend hier `projectType` sturen, dan filtert de server niet en
    // krijgt de gebruiker stilzwijgend alle projecten - geen fout, wel het
    // verkeerde antwoord.
    const query = laatsteVerzoek().query;
    expect(query.get('status')).toBe('active');
    expect(query.get('type')).toBe('festival');
    expect(query.get('orchestraId')).toBe('ork-2');
  });

  it('laat lege filters weg in plaats van ze als lege tekst mee te sturen', async () => {
    antwoordMet([]);

    await getProjects();

    // Een meegestuurde `status=` zou aan de serverkant waar zijn en op een
    // lege statuskolom filteren: nul projecten in plaats van alle.
    expect(laatsteVerzoek().queryreeks).toBe('');
  });

  it('geeft de tellingen uit de lijst ongewijzigd door', async () => {
    // De lijst is de enige plek waar memberCount en concertCount vandaan komen;
    // de detailroute geeft ze niet terug. Het scherm Projects.tsx toont ze.
    antwoordMet([
      { id: 'p1', name: 'Kerstconcert', status: 'active', memberCount: 34, concertCount: 2, rehearsalCount: 11 },
    ]);

    const projecten = await getProjects();

    expect(projecten[0].memberCount).toBe(34);
    expect(projecten[0].concertCount).toBe(2);
  });

  it('haalt één project op zijn id op en levert de geneste lijsten door', async () => {
    antwoordMet({
      id: 'p1',
      name: 'Kerstconcert',
      members: [{ id: 'l1', userId: 'g1', firstName: 'Anna', lastName: 'de Groot' }],
      concerts: [{ id: 'c1', name: 'Kerst', date: '2026-12-20', sortOrder: 0 }],
      rehearsals: [{ id: 'r1', date: '2026-12-01', startTime: '20:00', endTime: '22:00', sortOrder: 0 }],
      setlist: [{ id: 's1', customTitle: 'Stille Nacht', sortOrder: 0 }],
    });

    const project = await getProject('p1');

    expect(laatsteVerzoek().methode).toBe('get');
    expect(laatsteVerzoek().pad).toBe('/projects/p1');
    expect(project.members[0].firstName).toBe('Anna');
    expect(project.setlist[0].customTitle).toBe('Stille Nacht');
  });

  it('laat een 404 door in plaats van hem als leeg project te verpakken', async () => {
    antwoordMetFout(404, { error: 'Project niet gevonden' });

    await expect(getProject('bestaat-niet')).rejects.toMatchObject({
      response: { status: 404 },
    });
  });
});

describe('aanmaken en wijzigen', () => {
  it('maakt een project aan met de opgegeven gegevens', async () => {
    antwoordMet({ id: 'p9', message: 'Project aangemaakt' });

    const antwoord = await createProject({ name: 'Zomertour', projectType: 'tour', budget: 2500 });

    expect(laatsteVerzoek().methode).toBe('post');
    expect(laatsteVerzoek().pad).toBe('/projects');
    expect(laatsteVerzoek().body).toEqual({ name: 'Zomertour', projectType: 'tour', budget: 2500 });
    expect(antwoord.id).toBe('p9');
  });

  it('wijzigt met PATCH, want de server kent op dit pad geen PUT', async () => {
    antwoordMet({ message: 'Bijgewerkt' });

    await updateProject('p1', { notes: 'Bus geregeld.' });

    expect(laatsteVerzoek().methode).toBe('patch');
    expect(laatsteVerzoek().pad).toBe('/projects/p1');
  });

  it('zet de status via de eigen route, niet via het gewone wijzigen', async () => {
    antwoordMet({ message: 'Status bijgewerkt' });

    await updateProjectStatus('p1', 'completed');

    expect(laatsteVerzoek().methode).toBe('patch');
    expect(laatsteVerzoek().pad).toBe('/projects/p1/status');
    expect(laatsteVerzoek().body).toEqual({ status: 'completed' });
  });

  it('verwijdert een project', async () => {
    antwoordMet({ message: 'Verwijderd' });

    await deleteProject('p1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/projects/p1');
  });
});

describe('leden, concerten en programma', () => {
  it('voegt een lid toe met gebruiker en rol in de body', async () => {
    antwoordMet({ id: 'l5', message: 'Lid toegevoegd' });

    await addProjectMember('p1', 'g7', 'soloist');

    expect(laatsteVerzoek().pad).toBe('/projects/p1/members');
    expect(laatsteVerzoek().body).toEqual({ userId: 'g7', role: 'soloist' });
  });

  it('verwijdert een lid op zijn lidmaatschaps-id, niet op zijn gebruikers-id', async () => {
    antwoordMet({ message: 'Verwijderd' });

    await removeProjectMember('p1', 'l5');

    // De server zoekt in project_members op de id van de rij. Wie hier de
    // userId doorgeeft krijgt een 404 op een lid dat wel degelijk bestaat.
    expect(laatsteVerzoek().pad).toBe('/projects/p1/members/l5');
  });

  it('voegt een programmaonderdeel toe', async () => {
    antwoordMet({ id: 's3', message: 'Toegevoegd' });

    await addSetlistItem('p1', { customTitle: 'Eigen arrangement', durationMinutes: 7 });

    expect(laatsteVerzoek().methode).toBe('post');
    expect(laatsteVerzoek().pad).toBe('/projects/p1/setlist');
    expect(laatsteVerzoek().body).toEqual({ customTitle: 'Eigen arrangement', durationMinutes: 7 });
  });

  it('verwijdert een programmaonderdeel', async () => {
    antwoordMet({ message: 'Verwijderd' });

    await removeSetlistItem('p1', 's3');

    expect(laatsteVerzoek().pad).toBe('/projects/p1/setlist/s3');
  });

  it('koppelt een concert via de body, en ontkoppelt via het pad', async () => {
    antwoordMet({ message: 'Gekoppeld' });
    await linkConcertToProject('p1', 'c4');
    expect(laatsteVerzoek().methode).toBe('post');
    expect(laatsteVerzoek().pad).toBe('/projects/p1/concerts');
    expect(laatsteVerzoek().body).toEqual({ concertId: 'c4' });

    antwoordMet({ message: 'Ontkoppeld' });
    await unlinkConcertFromProject('p1', 'c4');
    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/projects/p1/concerts/c4');
  });

  it('koppelt een repetitie via de body, en ontkoppelt via het pad', async () => {
    antwoordMet({ message: 'Gekoppeld' });
    await linkRehearsalToProject('p1', 'r4');
    expect(laatsteVerzoek().methode).toBe('post');
    expect(laatsteVerzoek().pad).toBe('/projects/p1/rehearsals');
    // De server leest `rehearsalId`; een andere naam laat zijn schema afketsen
    // op een 400 die niets zegt over wat er ontbreekt.
    expect(laatsteVerzoek().body).toEqual({ rehearsalId: 'r4' });

    antwoordMet({ message: 'Ontkoppeld' });
    await unlinkRehearsalFromProject('p1', 'r4');
    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/projects/p1/rehearsals/r4');
  });

  it("herordent het programma met PUT en de volledige lijst id's", async () => {
    antwoordMet({ message: 'Setlist herordend' });

    await reorderProjectSetlist('p1', ['s3', 's1', 's2']);

    // De volgorde in de lijst is de nieuwe volgorde; de server weigert een
    // lijst die niet precies de items van het project bevat, dus hier hoort
    // niets gefilterd of ontdubbeld te worden.
    expect(laatsteVerzoek().methode).toBe('put');
    expect(laatsteVerzoek().pad).toBe('/projects/p1/setlist/reorder');
    expect(laatsteVerzoek().body).toEqual({ itemIds: ['s3', 's1', 's2'] });
  });

  it('laat een 400 op een onvolledige lijst door aan de aanroeper', async () => {
    antwoordMetFout(400, { error: 'De lijst moet precies de items van dit project bevatten' });

    await expect(reorderProjectSetlist('p1', ['s1'])).rejects.toMatchObject({ response: { status: 400 } });
  });
});

describe('de paden komen overeen met wat de server aanbiedt', () => {
  const routes = serverroutes('projects.ts');

  const aanroepen: [string, () => Promise<unknown>][] = [
    ['getProjects', () => getProjects()],
    ['getProject', () => getProject('p1')],
    ['createProject', () => createProject({ name: 'X' })],
    ['updateProject', () => updateProject('p1', {})],
    ['updateProjectStatus', () => updateProjectStatus('p1', 'active')],
    ['deleteProject', () => deleteProject('p1')],
    ['addProjectMember', () => addProjectMember('p1', 'g1', 'lid')],
    ['removeProjectMember', () => removeProjectMember('p1', 'l1')],
    ['addSetlistItem', () => addSetlistItem('p1', {})],
    ['removeSetlistItem', () => removeSetlistItem('p1', 's1')],
    ['linkConcertToProject', () => linkConcertToProject('p1', 'c1')],
    ['unlinkConcertFromProject', () => unlinkConcertFromProject('p1', 'c1')],
    ['linkRehearsalToProject', () => linkRehearsalToProject('p1', 'r1')],
    ['unlinkRehearsalFromProject', () => unlinkRehearsalFromProject('p1', 'r1')],
    ['reorderProjectSetlist', () => reorderProjectSetlist('p1', ['s1'])],
  ];

  it.each(aanroepen)('%s raakt een bestaande route in backend/src/routes/projects.ts', async (_naam, aanroep) => {
    antwoordMet({});
    await aanroep().catch(() => undefined);
    const { methode, pad } = laatsteVerzoek();

    expect(serverBiedtAan(routes, '/projects', methode, pad)).toBe(true);
  });

  it('laat geen enkele functie uit de module ongetoetst', async () => {
    // De lijst hierboven wordt met de hand bijgehouden, en dat is precies waar
    // dit misgaat: wie een functie met een verzonnen pad toevoegt en hem hier
    // vergeet, ziet niets. Dan is de toets hierboven groen over veertien van de
    // vijftien functies en zegt niemand er iets van.
    const geexporteerd = Object.entries(projectenApi)
      .filter(([, waarde]) => typeof waarde === 'function')
      .map(([naam]) => naam);
    const getoetst = aanroepen.map(([naam]) => naam);

    expect([...geexporteerd].sort()).toEqual([...getoetst].sort());
  });
});
