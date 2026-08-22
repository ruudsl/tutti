/**
 * Tests voor de peilingen-api.
 *
 * De functies in polls.ts bouwen zelf hun queryreeks en pad. Er wordt hier op
 * pad, methode, body en queryreeks getoetst - een typefout daarin geeft geen
 * foutmelding maar een leeg scherm. De routes zijn vergeleken met
 * backend/src/routes/polls.ts (gekoppeld op /api/polls).
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
  getPolls,
  getPoll,
  createPoll,
  updatePoll,
  changePollStatus,
  deletePoll,
  addPollOption,
  updatePollOption,
  deletePollOption,
  reorderPollOptions,
  submitVote,
  retractVote,
  getPollComments,
  addPollComment,
  updatePollComment,
  deletePollComment,
  sendPollReminder,
  createRehearsalFromPoll,
} from '../polls';

beforeEach(() => startNepserver());
afterEach(() => {
  stopNepserver();
  vi.restoreAllMocks();
});

// ===========================================
// PEILINGEN OPHALEN
// ===========================================

describe('getPolls', () => {
  it('haalt de peilingen op zonder vraagteken als er geen filters zijn', async () => {
    antwoordMet([{ id: 'p1', title: 'Repetitiedag' }]);
    const peilingen = await getPolls();

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('get');
    // Zonder filters hoort er geen kaal vraagteken aan het pad te hangen.
    expect(verzoek.pad).toBe('/polls');
    expect(verzoek.queryreeks).toBe('');
    expect(peilingen).toHaveLength(1);
  });

  it('zet alle drie de filters in de queryreeks', async () => {
    antwoordMet([]);
    await getPolls({ status: 'active', createdBy: 'u1', search: 'repetitie' });

    const { query, pad } = laatsteVerzoek();
    expect(pad.startsWith('/polls?')).toBe(true);
    // De backend leest status, createdBy en search uit req.query.
    expect(query.get('status')).toBe('active');
    expect(query.get('createdBy')).toBe('u1');
    expect(query.get('search')).toBe('repetitie');
  });

  it('laat een filter die niet ingevuld is weg', async () => {
    antwoordMet([]);
    await getPolls({ status: 'closed', search: undefined });

    expect(laatsteVerzoek().queryreeks).toBe('status=closed');
  });

  it('codeert een zoekterm met ampersand, spatie en procentteken', async () => {
    antwoordMet([]);
    await getPolls({ search: 'zaterdag & zondag 100%' });

    const { queryreeks, query } = laatsteVerzoek();
    expect(queryreeks).not.toContain('& zondag');
    expect(queryreeks).toContain('%26');
    expect(queryreeks).toContain('100%25');
    expect(query.get('search')).toBe('zaterdag & zondag 100%');
  });

  it('geeft een lege lijst terug als er geen peilingen zijn', async () => {
    antwoordMet([]);
    await expect(getPolls()).resolves.toEqual([]);
  });

  it('werpt bij een 401 en levert geen lege lijst op', async () => {
    antwoordMetFout(401, { error: 'Niet ingelogd.' });

    await expect(getPolls()).rejects.toMatchObject({ response: { status: 401 } });
  });
});

describe('getPoll', () => {
  it('haalt een peiling met opties en reacties op', async () => {
    const peiling = {
      id: 'p1',
      title: 'Repetitiedag',
      pollType: 'single',
      status: 'active',
      options: [{ id: 'o1', text: 'Dinsdag', sortOrder: 0, voteCount: 3 }],
      totalVoters: 3,
      userVotes: [{ optionId: 'o1' }],
      canSeeResults: true,
      comments: [],
    };
    antwoordMet(peiling);

    const resultaat = await getPoll('p1');

    expect(laatsteVerzoek().pad).toBe('/polls/p1');
    expect(resultaat).toEqual(peiling);
  });

  it('geeft een peiling zonder uitgebrachte stemmen ongewijzigd door', async () => {
    antwoordMet({ id: 'p1', options: [], userVotes: [], comments: [], totalVoters: 0, canSeeResults: false });

    const peiling = await getPoll('p1');
    expect(peiling.userVotes).toEqual([]);
    expect(peiling.canSeeResults).toBe(false);
  });

  it('laat een 403 door wanneer de peiling niet voor deze gebruiker is', async () => {
    antwoordMetFout(403, { error: 'Je hebt geen toegang tot deze poll.' });

    await expect(getPoll('p1')).rejects.toMatchObject({
      response: { status: 403, data: { error: 'Je hebt geen toegang tot deze poll.' } },
    });
  });
});

// ===========================================
// PEILINGEN BEHEREN
// ===========================================

describe('createPoll', () => {
  it('stuurt de peiling met opties in een keer mee', async () => {
    antwoordMet({ id: 'p1', message: 'Poll aangemaakt.' });

    await createPoll({
      title: 'Repetitiedag',
      description: 'Welke dag komt het beste uit?',
      pollType: 'multiple',
      isAnonymous: true,
      showResultsBeforeClose: false,
      allowComments: true,
      maxSelections: 2,
      startsAt: '2026-09-01T00:00:00.000Z',
      endsAt: '2026-09-08T00:00:00.000Z',
      targetOrchestras: ['o1'],
      targetRoles: ['member'],
      options: [{ text: 'Dinsdag' }, { text: 'Donderdag', description: 'Na de fanfare' }],
    });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/polls');
    const body = verzoek.body as { options: Record<string, unknown>[]; targetOrchestras: string[] };
    // createPollSchema leest targetOrchestras (meervoud) en options.
    expect(body.targetOrchestras).toEqual(['o1']);
    expect(body.options).toEqual([{ text: 'Dinsdag' }, { text: 'Donderdag', description: 'Na de fanfare' }]);
  });

  it('stuurt isAnonymous false mee in plaats van het veld weg te laten', async () => {
    antwoordMet({ id: 'p1', message: 'Poll aangemaakt.' });

    await createPoll({ title: 'Kort', pollType: 'single', isAnonymous: false, options: [{ text: 'Ja' }] });

    expect(laatsteVerzoek().body).toEqual({
      title: 'Kort',
      pollType: 'single',
      isAnonymous: false,
      options: [{ text: 'Ja' }],
    });
  });

  it('laat een validatiefout van de server doorkomen', async () => {
    antwoordMetFout(400, { error: 'Minimaal twee opties vereist.' });

    await expect(createPoll({ title: 'Leeg', pollType: 'single', options: [] })).rejects.toMatchObject({
      response: { status: 400, data: { error: 'Minimaal twee opties vereist.' } },
    });
  });
});

describe('updatePoll', () => {
  it('gebruikt PUT op /polls/:id', async () => {
    antwoordMet({ message: 'Poll bijgewerkt.' });

    await updatePoll('p1', { title: 'Repetitiedag (herzien)', maxSelections: 3 });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('put');
    expect(verzoek.pad).toBe('/polls/p1');
    expect(verzoek.body).toEqual({ title: 'Repetitiedag (herzien)', maxSelections: 3 });
  });

  it('stuurt null mee om een einddatum te wissen', async () => {
    antwoordMet({ message: 'Poll bijgewerkt.' });

    await updatePoll('p1', { endsAt: null, maxSelections: null });

    // null is hier betekenisvol: het veld leegmaken. Weglaten zou de oude
    // waarde laten staan.
    expect(laatsteVerzoek().body).toEqual({ endsAt: null, maxSelections: null });
  });
});

describe('changePollStatus', () => {
  it.each(['draft', 'active', 'closed', 'archived'] as const)('stuurt status %s in de body mee', async (status) => {
    antwoordMet({ message: 'Status gewijzigd.' });

    await changePollStatus('p1', status);

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    // Eigen route: de status gaat niet als PUT op /polls/:id mee.
    expect(verzoek.pad).toBe('/polls/p1/status');
    expect(verzoek.body).toEqual({ status });
  });

  it('laat een 400 door bij een ongeldige overgang', async () => {
    antwoordMetFout(400, { error: 'Ongeldige statusovergang.' });

    await expect(changePollStatus('p1', 'draft')).rejects.toMatchObject({ response: { status: 400 } });
  });
});

describe('deletePoll', () => {
  it('verwijdert een peiling', async () => {
    antwoordMet({ message: 'Poll verwijderd.' });
    await deletePoll('p1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/polls/p1');
  });
});

// ===========================================
// OPTIES
// ===========================================

describe('opties', () => {
  it('addPollOption post de optie onder de peiling', async () => {
    antwoordMet({ id: 'o1', message: 'Optie toegevoegd.' });

    await addPollOption('p1', { text: 'Vrijdag', description: 'Alleen even weken' });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/polls/p1/options');
    expect(verzoek.body).toEqual({ text: 'Vrijdag', description: 'Alleen even weken' });
  });

  it('updatePollOption zet peiling en optie allebei in het pad', async () => {
    antwoordMet({ message: 'Optie bijgewerkt.' });

    await updatePollOption('p1', 'o1', { text: 'Vrijdagavond' });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('put');
    expect(verzoek.pad).toBe('/polls/p1/options/o1');
    expect(verzoek.body).toEqual({ text: 'Vrijdagavond' });
  });

  it('deletePollOption verwijdert een optie', async () => {
    antwoordMet({ message: 'Optie verwijderd.' });
    await deletePollOption('p1', 'o1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/polls/p1/options/o1');
  });

  it('reorderPollOptions gebruikt het vaste pad /options/reorder', async () => {
    antwoordMet({ message: 'Volgorde bijgewerkt.' });

    await reorderPollOptions('p1', ['o2', 'o1', 'o3']);

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('put');
    // 'reorder' mag geen optie-id worden; in de backend staat deze route
    // daarom voor /:pollId/options/:optionId geregistreerd.
    expect(verzoek.pad).toBe('/polls/p1/options/reorder');
    expect(verzoek.body).toEqual({ optionIds: ['o2', 'o1', 'o3'] });
  });

  it('reorderPollOptions houdt de volgorde van de lijst aan', async () => {
    antwoordMet({ message: 'Volgorde bijgewerkt.' });
    await reorderPollOptions('p1', ['o3', 'o2', 'o1']);

    const body = laatsteVerzoek().body as { optionIds: string[] };
    expect(body.optionIds).toEqual(['o3', 'o2', 'o1']);
  });

  it('addPollOption laat een 400 door wanneer de peiling niet meer in concept staat', async () => {
    antwoordMetFout(400, { error: 'Poll is niet meer aan te passen.' });

    await expect(addPollOption('p1', { text: 'Te laat' })).rejects.toMatchObject({ response: { status: 400 } });
  });
});

// ===========================================
// STEMMEN
// ===========================================

describe('submitVote', () => {
  it('stuurt de gekozen opties mee', async () => {
    antwoordMet({ message: 'Stem succesvol uitgebracht.' });

    await submitVote('p1', { optionIds: ['o1'] });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/polls/p1/vote');
    // voteSchema leest optionIds; ranks blijft weg bij een gewone stem.
    expect(verzoek.body).toEqual({ optionIds: ['o1'] });
  });

  it('stuurt de rangorde mee als kaart van optie naar plaats', async () => {
    antwoordMet({ message: 'Stem succesvol uitgebracht.' });

    await submitVote('p1', { optionIds: ['o1', 'o2', 'o3'], ranks: { o1: 1, o2: 2, o3: 3 } });

    expect(laatsteVerzoek().body).toEqual({
      optionIds: ['o1', 'o2', 'o3'],
      ranks: { o1: 1, o2: 2, o3: 3 },
    });
  });

  it('laat een 400 door wanneer er al gestemd is', async () => {
    antwoordMetFout(400, { error: 'Je hebt al gestemd op deze poll.' });

    await expect(submitVote('p1', { optionIds: ['o1'] })).rejects.toMatchObject({
      response: { status: 400, data: { error: 'Je hebt al gestemd op deze poll.' } },
    });
  });

  it('laat een 400 door wanneer de peiling gesloten is', async () => {
    antwoordMetFout(400, { error: 'Deze poll is gesloten.' });

    await expect(submitVote('p1', { optionIds: ['o1'] })).rejects.toMatchObject({ response: { status: 400 } });
  });
});

describe('retractVote', () => {
  it('trekt de eigen stem in met DELETE op dezelfde stemroute', async () => {
    antwoordMet({ message: 'Stem ingetrokken.' });

    await retractVote('p1');

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('delete');
    expect(verzoek.pad).toBe('/polls/p1/vote');
  });
});

// ===========================================
// REACTIES
// ===========================================

describe('reacties', () => {
  it('getPollComments haalt de reacties op', async () => {
    antwoordMet([{ id: 'r1', content: 'Dinsdag kan ik niet', authorName: 'Jan' }]);
    const reacties = await getPollComments('p1');

    expect(laatsteVerzoek().methode).toBe('get');
    expect(laatsteVerzoek().pad).toBe('/polls/p1/comments');
    expect(reacties).toHaveLength(1);
  });

  it('getPollComments geeft een lege reactielijst terug zonder te vallen', async () => {
    antwoordMet([]);
    await expect(getPollComments('p1')).resolves.toEqual([]);
  });

  it('addPollComment stuurt de tekst mee', async () => {
    antwoordMet({ id: 'r1', content: 'Prima', message: 'Reactie geplaatst.' });

    await addPollComment('p1', { content: 'Prima' });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/polls/p1/comments');
    expect(verzoek.body).toEqual({ content: 'Prima' });
  });

  it('addPollComment stuurt parentId mee bij een antwoord op een reactie', async () => {
    antwoordMet({ id: 'r2', content: 'Eens', message: 'Reactie geplaatst.' });

    await addPollComment('p1', { content: 'Eens', parentId: 'r1' });

    // commentSchema leest parentId; zonder dat veld komt het antwoord los
    // onder de peiling te hangen in plaats van onder de reactie.
    expect(laatsteVerzoek().body).toEqual({ content: 'Eens', parentId: 'r1' });
  });

  it('updatePollComment verpakt de tekst in een object', async () => {
    antwoordMet({ message: 'Reactie bijgewerkt.' });

    await updatePollComment('p1', 'r1', 'Toch niet');

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('put');
    expect(verzoek.pad).toBe('/polls/p1/comments/r1');
    // De backend leest req.body.content; een kale string zou niet aankomen.
    expect(verzoek.body).toEqual({ content: 'Toch niet' });
  });

  it('deletePollComment verwijdert een reactie', async () => {
    antwoordMet({ message: 'Reactie verwijderd.' });
    await deletePollComment('p1', 'r1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/polls/p1/comments/r1');
  });

  it('deletePollComment laat een 403 door voor wie niet de schrijver is', async () => {
    antwoordMetFout(403, { error: 'Geen toegang.' });

    await expect(deletePollComment('p1', 'r1')).rejects.toMatchObject({ response: { status: 403 } });
  });
});

// ===========================================
// HERINNERING EN REPETITIE
// ===========================================

describe('sendPollReminder', () => {
  it('post op de herinneringsroute zonder body', async () => {
    antwoordMet({ message: 'Herinnering verstuurd.', sent: 7 });

    const resultaat = await sendPollReminder('p1');

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/polls/p1/remind');
    expect(verzoek.body).toBeUndefined();
    expect(resultaat.sent).toBe(7);
  });

  it('geeft nul verstuurde herinneringen door zonder er iets van te maken', async () => {
    antwoordMet({ message: 'Iedereen heeft al gestemd.', sent: 0 });

    await expect(sendPollReminder('p1')).resolves.toEqual({ message: 'Iedereen heeft al gestemd.', sent: 0 });
  });
});

describe('createRehearsalFromPoll', () => {
  it('stuurt orkest, locatie en notitie mee', async () => {
    antwoordMet({
      message: 'Repetitie aangemaakt.',
      rehearsalId: 'rep1',
      date: '2026-09-15',
      winningOption: 'Dinsdag 15 september',
      voteCount: 12,
    });

    const resultaat = await createRehearsalFromPoll('p1', {
      orchestraId: 'o1',
      location: 'Grote zaal',
      notes: 'Neem de marsmap mee',
    });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/polls/p1/create-rehearsal');
    // De backend leest orchestraId, location en notes uit req.body.
    expect(verzoek.body).toEqual({ orchestraId: 'o1', location: 'Grote zaal', notes: 'Neem de marsmap mee' });
    expect(resultaat.rehearsalId).toBe('rep1');
  });

  it('stuurt een leeg object mee als er niets is opgegeven', async () => {
    antwoordMet({ message: 'Repetitie aangemaakt.', rehearsalId: 'rep1', date: '', winningOption: '', voteCount: 0 });

    await createRehearsalFromPoll('p1');

    // Een ontbrekende body zou de backend als leeg verzoek binnenkrijgen; hier
    // wordt bewust een leeg object gestuurd.
    expect(laatsteVerzoek().body).toEqual({});
  });

  it('laat een 400 door wanneer er geen duidelijke winnaar is', async () => {
    antwoordMetFout(400, { error: 'Geen duidelijke winnende optie.' });

    await expect(createRehearsalFromPoll('p1')).rejects.toMatchObject({
      response: { status: 400, data: { error: 'Geen duidelijke winnende optie.' } },
    });
  });
});

// ===========================================
// ALGEMEEN GEDRAG
// ===========================================

describe('algemeen gedrag van de peilingen-api', () => {
  it('stuurt precies een verzoek per aanroep', async () => {
    antwoordMet([]);
    await getPolls();

    expect(alleVerzoeken()).toHaveLength(1);
  });

  it('werpt bij een netwerkfout zonder respons', async () => {
    antwoordMetNetwerkfout();

    await expect(getPolls()).rejects.toMatchObject({ code: 'ERR_NETWORK' });
  });

  it('werpt als het verzoek in de tijdslimiet loopt', async () => {
    antwoordMetTijdslimiet();

    await expect(getPolls()).rejects.toMatchObject({ code: 'ECONNABORTED' });
  });

  it('geeft een leeg antwoordlichaam door als lege string in plaats van te vallen', async () => {
    antwoordMet('', { status: 204 });

    await expect(deletePoll('p1')).resolves.toBe('');
  });

  it('geeft null door zoals het binnenkomt', async () => {
    antwoordMet(null);

    await expect(getPoll('p1')).resolves.toBeNull();
  });
});
