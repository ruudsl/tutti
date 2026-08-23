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
 * Die tweede toets legt drie functies bloot die een route aanroepen die er
 * niet is - zie het laatste blok. De koppeling project-repetitie wordt in het
 * scherm aangeboden, de tabel project_rehearsals bestaat en wordt bij het
 * ophalen van een project uitgelezen, maar er is nergens een route die er ooit
 * een rij in schrijft. Hetzelfde geldt voor het herordenen van het programma.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { startNepserver, stopNepserver, antwoordMet, antwoordMetFout, laatsteVerzoek } from './nepserver';
import { serverroutes, serverBiedtAan } from './serverroutes';
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
});

describe('de paden komen overeen met wat de server aanbiedt', () => {
  const routes = serverroutes('projects.ts');

  /** Laat elke functie één verzoek doen en geef terug wat er over de lijn gaat. */
  async function verstuurd(aanroep: () => Promise<unknown>): Promise<{ methode: string; pad: string }> {
    antwoordMet({});
    await aanroep().catch(() => undefined);
    return { methode: laatsteVerzoek().methode, pad: laatsteVerzoek().pad };
  }

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

  it('kent precies drie functies die een route aanroepen die de server niet heeft', async () => {
    const zonderRoute: string[] = [];
    for (const [naam, aanroep] of aanroepen) {
      const { methode, pad } = await verstuurd(aanroep);
      if (!serverBiedtAan(routes, '/projects', methode, pad)) {
        zonderRoute.push(`${naam}: ${methode.toUpperCase()} ${pad}`);
      }
    }

    // Dit is geen wens maar een meting, en de uitkomst is een echte fout die
    // niet in de frontend te repareren valt: de routes moeten in de backend
    // gemaakt worden. Zolang dat niet gebeurd is, staat hier zwart op wit
    // welke drie het zijn, zodat niemand denkt dat deze knoppen werken.
    //
    // - POST   /projects/:id/rehearsals            (repetitie koppelen)
    // - DELETE /projects/:id/rehearsals/:id        (repetitie ontkoppelen)
    // - PUT    /projects/:id/setlist/reorder       (programma herordenen)
    //
    // De tabel project_rehearsals bestaat en wordt in GET /projects/:id
    // uitgelezen, maar geen enkele route schrijft erin. De koppeling is dus
    // niet stuk gegaan: ze heeft nooit gewerkt.
    //
    // Zodra de backend die routes krijgt, wordt deze lijst korter en gaat deze
    // test rood. Dat is de bedoeling: dan mag hij weg.
    expect(zonderRoute).toEqual([
      'linkRehearsalToProject: POST /projects/p1/rehearsals',
      'unlinkRehearsalFromProject: DELETE /projects/p1/rehearsals/r1',
      'reorderProjectSetlist: PUT /projects/p1/setlist/reorder',
    ]);
  });

  it('vindt voor alle overige functies wél een route', async () => {
    const gedekt: string[] = [];
    for (const [naam, aanroep] of aanroepen) {
      const { methode, pad } = await verstuurd(aanroep);
      if (serverBiedtAan(routes, '/projects', methode, pad)) gedekt.push(naam);
    }

    expect(gedekt).toHaveLength(aanroepen.length - 3);
  });
});
