/**
 * Peilingen: wie wat ziet, wie mag stemmen, en wat er met reacties gebeurt.
 *
 * polls.test.ts dekt het datumpeiling-pad en de repetitie die daaruit
 * ontstaat. Dit bestand pakt de rest: de lijst met haar filters en
 * doelgroepen, het uitlezen van een enkele peiling, het bewerken van opties,
 * het stemmen zelf, de reacties, en de herinnering aan wie nog niet gestemd
 * heeft.
 *
 * De nadruk ligt op de foutpaden en op de verenigingsgrens. Peilingen zijn
 * een van de weinige plekken waar een gewoon lid zelf schrijft (stemmen,
 * reageren), dus de vraag "wie mag dit, en op wiens gegevens" is hier de kern.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import request from 'supertest';
import '../setup';
import testDb from '../testDb';
import app from '../testApp';
import { invalidateAllCache } from '../../middleware/cache';
import {
  createTestEnvironment,
  createTestAssociation,
  createTestOrchestra,
  createTestUser,
  generateTestToken,
  TestAssociation,
  TestOrchestra,
  TestUser,
} from '../testUtils';

interface PeilingOpties {
  associationId: string;
  createdBy: string;
  title?: string;
  description?: string | null;
  status?: 'draft' | 'active' | 'closed' | 'archived';
  pollType?: 'single' | 'multiple' | 'ranked';
  isAnonymous?: boolean;
  showResultsBeforeClose?: boolean;
  allowComments?: boolean;
  maxSelections?: number | null;
  startsAt?: string | null;
  endsAt?: string | null;
  targetOrchestras?: string[] | null;
  targetRoles?: string[] | null;
  isDatePoll?: boolean;
  autoCreateRehearsal?: boolean;
  targetOrchestraId?: string | null;
}

describe('Peilingen - toegang, stemmen en reacties', () => {
  let vereniging: TestAssociation;
  let orkest: TestOrchestra;
  let beheerder: TestUser;
  let beheerderToken: string;
  let lid: TestUser;
  let lidToken: string;
  let muziekcommissie: TestUser;
  let muziekcommissieToken: string;

  let andereVereniging: TestAssociation;
  let anderOrkest: TestOrchestra;
  let andereBeheerder: TestUser;
  let andereBeheerderToken: string;

  beforeEach(() => {
    // De lijstroute cachet per gebruiker een minuut lang. De cache leeft
    // buiten de testdatabase en overleeft dus de reset in setup.ts.
    invalidateAllCache();

    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    beheerder = omgeving.adminUser;
    beheerderToken = omgeving.adminToken;
    lid = omgeving.memberUser;
    lidToken = omgeving.memberToken;
    muziekcommissie = omgeving.musicCommitteeUser;
    muziekcommissieToken = omgeving.musicCommitteeToken;
    orkest = createTestOrchestra(vereniging.id, { name: 'Harmonieorkest' });

    andereVereniging = createTestAssociation({ name: 'Fanfare Elders' });
    anderOrkest = createTestOrchestra(andereVereniging.id, { name: 'Fanfare Elders A' });
    andereBeheerder = createTestUser(andereVereniging.id, { email: 'beheer@elders.nl', role: 'admin' });
    andereBeheerderToken = generateTestToken(andereBeheerder);
  });

  /** Zet een peiling rechtstreeks in de database, zodat elke toestand bereikbaar is. */
  function maakPeiling(opties: PeilingOpties): string {
    const id = uuidv4();
    testDb
      .prepare(
        `INSERT INTO polls (
           id, association_id, title, description, poll_type, status,
           is_anonymous, show_results_before_close, allow_comments, max_selections,
           starts_at, ends_at, target_orchestras, target_roles,
           is_date_poll, auto_create_rehearsal, target_orchestra_id, created_by
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        opties.associationId,
        opties.title ?? 'Peiling',
        opties.description ?? null,
        opties.pollType ?? 'single',
        opties.status ?? 'active',
        opties.isAnonymous ? 1 : 0,
        opties.showResultsBeforeClose ? 1 : 0,
        opties.allowComments === false ? 0 : 1,
        opties.maxSelections ?? null,
        opties.startsAt ?? null,
        opties.endsAt ?? null,
        opties.targetOrchestras ? JSON.stringify(opties.targetOrchestras) : null,
        opties.targetRoles ? JSON.stringify(opties.targetRoles) : null,
        opties.isDatePoll ? 1 : 0,
        opties.autoCreateRehearsal ? 1 : 0,
        opties.targetOrchestraId ?? null,
        opties.createdBy,
      );
    return id;
  }

  /** Voeg een optie toe en geef het id terug. */
  function maakOptie(pollId: string, tekst: string, volgorde = 0, waarde: string | null = null): string {
    const id = uuidv4();
    testDb
      .prepare(
        `INSERT INTO poll_options (id, poll_id, option_text, option_value, sort_order)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(id, pollId, tekst, waarde, volgorde);
    return id;
  }

  /** Een peiling met twee opties; de meest gebruikte opzet. */
  function peilingMetOpties(opties: Partial<PeilingOpties> = {}): { pollId: string; optieA: string; optieB: string } {
    const pollId = maakPeiling({ associationId: vereniging.id, createdBy: beheerder.id, ...opties });
    return { pollId, optieA: maakOptie(pollId, 'Optie A', 0), optieB: maakOptie(pollId, 'Optie B', 1) };
  }

  function stem(pollId: string, optionId: string, userId: string): void {
    testDb
      .prepare('INSERT INTO poll_votes (id, poll_id, option_id, user_id) VALUES (?, ?, ?, ?)')
      .run(uuidv4(), pollId, optionId, userId);
  }

  function zetInOrkest(userId: string, orchestraId: string): void {
    testDb.prepare('INSERT INTO user_orchestras (user_id, orchestra_id) VALUES (?, ?)').run(userId, orchestraId);
  }

  function maakReactie(pollId: string, userId: string, inhoud = 'Mijn reactie'): string {
    const id = uuidv4();
    testDb
      .prepare('INSERT INTO poll_comments (id, poll_id, user_id, content) VALUES (?, ?, ?, ?)')
      .run(id, pollId, userId, inhoud);
    return id;
  }

  const als = (token: string, methode: 'get' | 'post' | 'put' | 'delete', pad: string) =>
    request(app)[methode](`/api/polls${pad}`).set('Authorization', `Bearer ${token}`);

  // =====================================================
  // GET /api/polls
  // =====================================================

  describe('de lijst met peilingen', () => {
    it('geeft geen peilingen van een andere vereniging', async () => {
      maakPeiling({ associationId: andereVereniging.id, createdBy: andereBeheerder.id, title: 'Elders' });
      maakPeiling({ associationId: vereniging.id, createdBy: beheerder.id, title: 'Hier' });

      const antwoord = await als(beheerderToken, 'get', '/');

      expect(antwoord.status).toBe(200);
      expect(antwoord.body.map((p: { title: string }) => p.title)).toEqual(['Hier']);
    });

    it('verbergt concepten voor een gewoon lid', async () => {
      maakPeiling({ associationId: vereniging.id, createdBy: beheerder.id, title: 'Concept', status: 'draft' });
      maakPeiling({ associationId: vereniging.id, createdBy: beheerder.id, title: 'Loopt', status: 'active' });

      const antwoord = await als(lidToken, 'get', '/');

      expect(antwoord.body.map((p: { title: string }) => p.title)).toEqual(['Loopt']);
    });

    it('verbergt gearchiveerde peilingen voor een gewoon lid', async () => {
      maakPeiling({ associationId: vereniging.id, createdBy: beheerder.id, title: 'Oud', status: 'archived' });

      const antwoord = await als(lidToken, 'get', '/');

      expect(antwoord.body).toEqual([]);
    });

    it('toont concepten wel aan een beheerder', async () => {
      maakPeiling({ associationId: vereniging.id, createdBy: beheerder.id, title: 'Concept', status: 'draft' });

      const antwoord = await als(beheerderToken, 'get', '/');

      expect(antwoord.body.map((p: { title: string }) => p.title)).toEqual(['Concept']);
    });

    it('filtert op status', async () => {
      maakPeiling({ associationId: vereniging.id, createdBy: beheerder.id, title: 'Loopt', status: 'active' });
      maakPeiling({ associationId: vereniging.id, createdBy: beheerder.id, title: 'Dicht', status: 'closed' });

      const antwoord = await als(beheerderToken, 'get', '/?status=closed');

      expect(antwoord.body.map((p: { title: string }) => p.title)).toEqual(['Dicht']);
    });

    it('filtert op maker', async () => {
      maakPeiling({ associationId: vereniging.id, createdBy: beheerder.id, title: 'Van beheerder' });
      maakPeiling({ associationId: vereniging.id, createdBy: muziekcommissie.id, title: 'Van commissie' });

      const antwoord = await als(beheerderToken, 'get', `/?createdBy=${muziekcommissie.id}`);

      expect(antwoord.body.map((p: { title: string }) => p.title)).toEqual(['Van commissie']);
    });

    it('zoekt in de titel', async () => {
      maakPeiling({ associationId: vereniging.id, createdBy: beheerder.id, title: 'Uniformkleur' });
      maakPeiling({ associationId: vereniging.id, createdBy: beheerder.id, title: 'Repetitiedag' });

      const antwoord = await als(beheerderToken, 'get', '/?search=uniform');

      expect(antwoord.body.map((p: { title: string }) => p.title)).toEqual(['Uniformkleur']);
    });

    it('zoekt ook in de omschrijving', async () => {
      maakPeiling({
        associationId: vereniging.id,
        createdBy: beheerder.id,
        title: 'Zonder trefwoord in de titel',
        description: 'Gaat over de zomerstop',
      });

      const antwoord = await als(beheerderToken, 'get', '/?search=zomerstop');

      expect(antwoord.body).toHaveLength(1);
    });

    it('verbergt een peiling die op een andere rol gericht is', async () => {
      maakPeiling({
        associationId: vereniging.id,
        createdBy: beheerder.id,
        title: 'Alleen bestuur',
        targetRoles: ['admin'],
      });

      const antwoord = await als(lidToken, 'get', '/');

      expect(antwoord.body).toEqual([]);
    });

    it('toont een peiling die op de eigen rol gericht is', async () => {
      maakPeiling({
        associationId: vereniging.id,
        createdBy: beheerder.id,
        title: 'Voor leden',
        targetRoles: ['member'],
      });

      const antwoord = await als(lidToken, 'get', '/');

      expect(antwoord.body).toHaveLength(1);
    });

    it('verbergt een peiling voor een orkest waar het lid niet in speelt', async () => {
      maakPeiling({
        associationId: vereniging.id,
        createdBy: beheerder.id,
        title: 'Alleen harmonie',
        targetOrchestras: [orkest.id],
      });

      const antwoord = await als(lidToken, 'get', '/');

      expect(antwoord.body).toEqual([]);
    });

    it('toont die peiling wel aan een lid van dat orkest', async () => {
      zetInOrkest(lid.id, orkest.id);
      maakPeiling({
        associationId: vereniging.id,
        createdBy: beheerder.id,
        title: 'Alleen harmonie',
        targetOrchestras: [orkest.id],
      });

      const antwoord = await als(lidToken, 'get', '/');

      expect(antwoord.body).toHaveLength(1);
    });

    it('meldt of de gebruiker zelf al gestemd heeft', async () => {
      const { pollId, optieA } = peilingMetOpties({ title: 'Gestemd' });
      const tweede = peilingMetOpties({ title: 'Nog niet' });
      stem(pollId, optieA, lid.id);

      const antwoord = await als(lidToken, 'get', '/');
      const perId = Object.fromEntries(antwoord.body.map((p: { id: string; hasVoted: boolean }) => [p.id, p.hasVoted]));

      expect(perId[pollId]).toBe(true);
      expect(perId[tweede.pollId]).toBe(false);
    });

    it('telt de stem van een ander niet als de eigen stem', async () => {
      const { pollId, optieA } = peilingMetOpties();
      stem(pollId, optieA, beheerder.id);

      const antwoord = await als(lidToken, 'get', '/');

      expect(antwoord.body[0].hasVoted).toBe(false);
      expect(antwoord.body[0].voteCount).toBe(1);
    });

    it('weigert een gebruiker zonder vereniging', async () => {
      const zwevend = createTestUser(vereniging.id, { email: 'zwevend@test.nl' });
      const token = generateTestToken({ ...zwevend, associationId: null as unknown as string });

      const antwoord = await als(token, 'get', '/');

      expect(antwoord.status).toBe(400);
    });

    it('weigert een verzoek zonder token', async () => {
      expect((await request(app).get('/api/polls')).status).toBe(401);
    });
  });

  // =====================================================
  // GET /api/polls/:id
  // =====================================================

  describe('een enkele peiling opvragen', () => {
    it('geeft 404 voor een onbekende peiling', async () => {
      expect((await als(beheerderToken, 'get', `/${uuidv4()}`)).status).toBe(404);
    });

    it('geeft 404 voor een peiling van een andere vereniging', async () => {
      const elders = maakPeiling({ associationId: andereVereniging.id, createdBy: andereBeheerder.id });

      expect((await als(beheerderToken, 'get', `/${elders}`)).status).toBe(404);
    });

    it('weigert een lid dat buiten de doelgroep valt', async () => {
      const { pollId } = peilingMetOpties({ targetRoles: ['admin'] });

      expect((await als(lidToken, 'get', `/${pollId}`)).status).toBe(403);
    });

    it('laat de maker zijn eigen gerichte peiling wel zien', async () => {
      const { pollId } = peilingMetOpties({ createdBy: lid.id, targetRoles: ['admin'] });

      expect((await als(lidToken, 'get', `/${pollId}`)).status).toBe(200);
    });

    it('verzwijgt de uitslag zolang de peiling loopt', async () => {
      const { pollId, optieA } = peilingMetOpties();
      stem(pollId, optieA, beheerder.id);

      const antwoord = await als(lidToken, 'get', `/${pollId}`);

      expect(antwoord.body.canSeeResults).toBe(false);
      expect(antwoord.body.options[0].voteCount).toBeUndefined();
      expect(antwoord.body.totalVoters).toBe(1);
    });

    /**
     * canSeeResults kwam als 1 uit de route in plaats van als true:
     * show_results_before_close is in SQLite een integer en werd zonder
     * omzetting doorgegeven, terwijl elk ander booleaans veld in datzelfde
     * antwoord wel met !! wordt omgezet en de frontend het type als boolean
     * declareert (frontend/src/api/polls.ts).
     *
     * Zonder de omzetting in routes/polls.ts is deze test rood:
     * "expected 1 to be true".
     */
    it('toont de uitslag als dat expliciet is aangezet', async () => {
      const { pollId, optieA } = peilingMetOpties({ showResultsBeforeClose: true });
      stem(pollId, optieA, beheerder.id);

      const antwoord = await als(lidToken, 'get', `/${pollId}`);

      expect(antwoord.body.canSeeResults).toBe(true);
      expect(antwoord.body.options[0].voteCount).toBe(1);
    });

    it('toont de uitslag na sluiten', async () => {
      const { pollId, optieA } = peilingMetOpties({ status: 'closed' });
      stem(pollId, optieA, beheerder.id);

      const antwoord = await als(lidToken, 'get', `/${pollId}`);

      expect(antwoord.body.canSeeResults).toBe(true);
    });

    it('noemt de stemmers bij een open peiling aan de beheerder', async () => {
      const { pollId, optieA } = peilingMetOpties();
      stem(pollId, optieA, lid.id);

      const antwoord = await als(beheerderToken, 'get', `/${pollId}`);

      expect(antwoord.body.options[0].voters).toEqual([{ id: lid.id, name: 'Member User' }]);
    });

    it('noemt geen stemmers bij een anonieme peiling', async () => {
      const { pollId, optieA } = peilingMetOpties({ isAnonymous: true });
      stem(pollId, optieA, lid.id);

      const antwoord = await als(beheerderToken, 'get', `/${pollId}`);

      expect(antwoord.body.options[0].voters).toBeUndefined();
      expect(antwoord.body.options[0].voteCount).toBe(1);
      expect(JSON.stringify(antwoord.body)).not.toContain(lid.id);
    });

    it('geeft de eigen stem terug', async () => {
      const { pollId, optieA } = peilingMetOpties();
      stem(pollId, optieA, lid.id);

      const antwoord = await als(lidToken, 'get', `/${pollId}`);

      expect(antwoord.body.hasVoted).toBe(true);
      expect(antwoord.body.userVotes).toEqual([{ optionId: optieA, rank: null }]);
    });

    it('laat verwijderde reacties weg', async () => {
      const { pollId } = peilingMetOpties();
      maakReactie(pollId, lid.id, 'Blijft staan');
      const weg = maakReactie(pollId, lid.id, 'Weggehaald');
      testDb.prepare('UPDATE poll_comments SET deleted_at = ? WHERE id = ?').run(new Date().toISOString(), weg);

      const antwoord = await als(lidToken, 'get', `/${pollId}`);

      expect(antwoord.body.comments.map((c: { content: string }) => c.content)).toEqual(['Blijft staan']);
    });

    it('geeft geen reacties terug als die uit staan', async () => {
      const { pollId } = peilingMetOpties({ allowComments: false });
      maakReactie(pollId, lid.id);

      const antwoord = await als(lidToken, 'get', `/${pollId}`);

      expect(antwoord.body.comments).toEqual([]);
    });
  });

  // =====================================================
  // PUT /api/polls/:id
  // =====================================================

  describe('een peiling bewerken', () => {
    it('geeft 404 voor een peiling van een andere vereniging', async () => {
      const elders = maakPeiling({ associationId: andereVereniging.id, createdBy: andereBeheerder.id });

      const antwoord = await als(beheerderToken, 'put', `/${elders}`).send({ title: 'Overgenomen' });

      expect(antwoord.status).toBe(404);
      const rij = testDb.prepare('SELECT title FROM polls WHERE id = ?').get(elders) as { title: string };
      expect(rij.title).not.toBe('Overgenomen');
    });

    it('weigert het bewerken van een gesloten peiling', async () => {
      const { pollId } = peilingMetOpties({ status: 'closed' });

      const antwoord = await als(beheerderToken, 'put', `/${pollId}`).send({ title: 'Toch nog' });

      expect(antwoord.status).toBe(400);
    });

    it('werkt titel en omschrijving bij', async () => {
      const { pollId } = peilingMetOpties();

      await als(beheerderToken, 'put', `/${pollId}`).send({ title: 'Nieuwe titel', description: 'Toelichting' });

      const rij = testDb.prepare('SELECT title, description FROM polls WHERE id = ?').get(pollId) as {
        title: string;
        description: string;
      };
      expect(rij).toEqual({ title: 'Nieuwe titel', description: 'Toelichting' });
    });

    it('werkt de doelgroep bij', async () => {
      const { pollId } = peilingMetOpties();

      await als(beheerderToken, 'put', `/${pollId}`).send({ targetRoles: ['conductor'] });

      const rij = testDb.prepare('SELECT target_roles FROM polls WHERE id = ?').get(pollId) as {
        target_roles: string;
      };
      expect(JSON.parse(rij.target_roles)).toEqual(['conductor']);
    });

    it('verandert niets bij een leeg verzoek', async () => {
      const { pollId } = peilingMetOpties({ title: 'Ongewijzigd' });
      const voor = testDb.prepare('SELECT * FROM polls WHERE id = ?').get(pollId);

      const antwoord = await als(beheerderToken, 'put', `/${pollId}`).send({});

      expect(antwoord.status).toBe(200);
      expect(testDb.prepare('SELECT * FROM polls WHERE id = ?').get(pollId)).toEqual(voor);
    });

    it('weigert een lege titel', async () => {
      const { pollId } = peilingMetOpties();

      expect((await als(beheerderToken, 'put', `/${pollId}`).send({ title: '' })).status).toBe(400);
    });

    it('weigert een gewoon lid', async () => {
      const { pollId } = peilingMetOpties();

      expect((await als(lidToken, 'put', `/${pollId}`).send({ title: 'Mag niet' })).status).toBe(403);
    });
  });

  // =====================================================
  // DELETE /api/polls/:id
  // =====================================================

  describe('een peiling verwijderen', () => {
    it('verwijdert de peiling met haar opties en stemmen', async () => {
      const { pollId, optieA } = peilingMetOpties();
      stem(pollId, optieA, lid.id);

      const antwoord = await als(beheerderToken, 'delete', `/${pollId}`);

      expect(antwoord.status).toBe(200);
      expect(testDb.prepare('SELECT COUNT(*) as n FROM polls WHERE id = ?').get(pollId)).toEqual({ n: 0 });
      expect(testDb.prepare('SELECT COUNT(*) as n FROM poll_options WHERE poll_id = ?').get(pollId)).toEqual({ n: 0 });
      expect(testDb.prepare('SELECT COUNT(*) as n FROM poll_votes WHERE poll_id = ?').get(pollId)).toEqual({ n: 0 });
    });

    it('laat een peiling van een andere vereniging staan', async () => {
      const elders = maakPeiling({ associationId: andereVereniging.id, createdBy: andereBeheerder.id });

      const antwoord = await als(beheerderToken, 'delete', `/${elders}`);

      expect(antwoord.status).toBe(404);
      expect(testDb.prepare('SELECT COUNT(*) as n FROM polls WHERE id = ?').get(elders)).toEqual({ n: 1 });
    });

    it('weigert een gewoon lid', async () => {
      const { pollId } = peilingMetOpties();

      expect((await als(lidToken, 'delete', `/${pollId}`)).status).toBe(403);
    });
  });

  // =====================================================
  // Opties
  // =====================================================

  describe('opties beheren', () => {
    it('voegt een optie toe achter de bestaande', async () => {
      const { pollId } = peilingMetOpties({ status: 'draft' });

      const antwoord = await als(beheerderToken, 'post', `/${pollId}/options`).send({ text: 'Optie C' });

      expect(antwoord.status).toBe(201);
      const volgorde = testDb.prepare('SELECT sort_order FROM poll_options WHERE id = ?').get(antwoord.body.id) as {
        sort_order: number;
      };
      expect(volgorde.sort_order).toBe(2);
    });

    it('weigert een optie toevoegen aan een lopende peiling', async () => {
      const { pollId } = peilingMetOpties({ status: 'active' });

      const antwoord = await als(beheerderToken, 'post', `/${pollId}/options`).send({ text: 'Te laat' });

      expect(antwoord.status).toBe(400);
    });

    it('weigert een lege optietekst', async () => {
      const { pollId } = peilingMetOpties({ status: 'draft' });

      expect((await als(beheerderToken, 'post', `/${pollId}/options`).send({ text: '' })).status).toBe(400);
    });

    it('voegt geen optie toe aan een peiling van een andere vereniging', async () => {
      const elders = maakPeiling({
        associationId: andereVereniging.id,
        createdBy: andereBeheerder.id,
        status: 'draft',
      });

      const antwoord = await als(beheerderToken, 'post', `/${elders}/options`).send({ text: 'Ingeslopen' });

      expect(antwoord.status).toBe(404);
      expect(testDb.prepare('SELECT COUNT(*) as n FROM poll_options WHERE poll_id = ?').get(elders)).toEqual({ n: 0 });
    });

    it('werkt een optietekst bij', async () => {
      const { pollId, optieA } = peilingMetOpties({ status: 'draft' });

      await als(beheerderToken, 'put', `/${pollId}/options/${optieA}`).send({ text: 'Andere tekst' });

      const rij = testDb.prepare('SELECT option_text FROM poll_options WHERE id = ?').get(optieA) as {
        option_text: string;
      };
      expect(rij.option_text).toBe('Andere tekst');
    });

    it('geeft 404 voor een optie die bij een andere peiling hoort', async () => {
      const eerste = peilingMetOpties({ status: 'draft' });
      const tweede = peilingMetOpties({ status: 'draft' });

      const antwoord = await als(beheerderToken, 'put', `/${eerste.pollId}/options/${tweede.optieA}`).send({
        text: 'Verkeerde peiling',
      });

      expect(antwoord.status).toBe(404);
    });

    it('weigert het bewerken van een optie in een lopende peiling', async () => {
      const { pollId, optieA } = peilingMetOpties({ status: 'active' });

      const antwoord = await als(beheerderToken, 'put', `/${pollId}/options/${optieA}`).send({ text: 'Te laat' });

      expect(antwoord.status).toBe(400);
    });

    it('weigert een optie te verwijderen als er dan minder dan twee overblijven', async () => {
      const { pollId, optieA } = peilingMetOpties({ status: 'draft' });

      const antwoord = await als(beheerderToken, 'delete', `/${pollId}/options/${optieA}`);

      expect(antwoord.status).toBe(400);
      expect(testDb.prepare('SELECT COUNT(*) as n FROM poll_options WHERE poll_id = ?').get(pollId)).toEqual({ n: 2 });
    });

    it('verwijdert een optie als er drie zijn', async () => {
      const { pollId, optieA } = peilingMetOpties({ status: 'draft' });
      maakOptie(pollId, 'Optie C', 2);

      const antwoord = await als(beheerderToken, 'delete', `/${pollId}/options/${optieA}`);

      expect(antwoord.status).toBe(200);
      expect(testDb.prepare('SELECT COUNT(*) as n FROM poll_options WHERE poll_id = ?').get(pollId)).toEqual({ n: 2 });
    });

    it('weigert een optie te verwijderen uit een lopende peiling', async () => {
      const { pollId, optieA } = peilingMetOpties({ status: 'active' });
      maakOptie(pollId, 'Optie C', 2);

      expect((await als(beheerderToken, 'delete', `/${pollId}/options/${optieA}`)).status).toBe(400);
    });

    it('herschikt de opties', async () => {
      const { pollId, optieA, optieB } = peilingMetOpties({ status: 'draft' });

      const antwoord = await als(beheerderToken, 'put', `/${pollId}/options/reorder`).send({
        optionIds: [optieB, optieA],
      });

      expect(antwoord.status).toBe(200);
      const volgorde = testDb
        .prepare('SELECT id FROM poll_options WHERE poll_id = ? ORDER BY sort_order')
        .all(pollId) as { id: string }[];
      expect(volgorde.map((o) => o.id)).toEqual([optieB, optieA]);
    });

    it('weigert een herschikking zonder lijst', async () => {
      const { pollId } = peilingMetOpties({ status: 'draft' });

      expect((await als(beheerderToken, 'put', `/${pollId}/options/reorder`).send({})).status).toBe(400);
    });

    it('herschikt niets in een peiling van een andere vereniging', async () => {
      const elders = maakPeiling({
        associationId: andereVereniging.id,
        createdBy: andereBeheerder.id,
        status: 'draft',
      });
      const eersteOptie = maakOptie(elders, 'Elders A', 0);
      maakOptie(elders, 'Elders B', 1);

      const antwoord = await als(beheerderToken, 'put', `/${elders}/options/reorder`).send({
        optionIds: [eersteOptie],
      });

      expect(antwoord.status).toBe(404);
      const rij = testDb.prepare('SELECT sort_order FROM poll_options WHERE id = ?').get(eersteOptie) as {
        sort_order: number;
      };
      expect(rij.sort_order).toBe(0);
    });

    it('weigert een gewoon lid bij het beheren van opties', async () => {
      const { pollId, optieA } = peilingMetOpties({ status: 'draft' });

      expect((await als(lidToken, 'post', `/${pollId}/options`).send({ text: 'x' })).status).toBe(403);
      expect((await als(lidToken, 'put', `/${pollId}/options/${optieA}`).send({ text: 'x' })).status).toBe(403);
      expect((await als(lidToken, 'delete', `/${pollId}/options/${optieA}`)).status).toBe(403);
    });
  });

  // =====================================================
  // Stemmen
  // =====================================================

  describe('stemmen', () => {
    it('legt de stem vast', async () => {
      const { pollId, optieA } = peilingMetOpties();

      const antwoord = await als(lidToken, 'post', `/${pollId}/vote`).send({ optionIds: [optieA] });

      expect(antwoord.status).toBe(200);
      const stemmen = testDb.prepare('SELECT option_id, user_id FROM poll_votes WHERE poll_id = ?').all(pollId);
      expect(stemmen).toEqual([{ option_id: optieA, user_id: lid.id }]);
    });

    it('geeft 404 voor een peiling van een andere vereniging', async () => {
      const elders = maakPeiling({ associationId: andereVereniging.id, createdBy: andereBeheerder.id });
      const optie = maakOptie(elders, 'Elders A', 0);

      const antwoord = await als(lidToken, 'post', `/${elders}/vote`).send({ optionIds: [optie] });

      expect(antwoord.status).toBe(404);
      expect(testDb.prepare('SELECT COUNT(*) as n FROM poll_votes WHERE poll_id = ?').get(elders)).toEqual({ n: 0 });
    });

    it('weigert stemmen op een concept', async () => {
      const { pollId, optieA } = peilingMetOpties({ status: 'draft' });

      expect((await als(lidToken, 'post', `/${pollId}/vote`).send({ optionIds: [optieA] })).status).toBe(400);
    });

    it('weigert stemmen op een gesloten peiling', async () => {
      const { pollId, optieA } = peilingMetOpties({ status: 'closed' });

      expect((await als(lidToken, 'post', `/${pollId}/vote`).send({ optionIds: [optieA] })).status).toBe(400);
    });

    it('weigert een lid buiten de doelgroep', async () => {
      const { pollId, optieA } = peilingMetOpties({ targetRoles: ['admin'] });

      const antwoord = await als(lidToken, 'post', `/${pollId}/vote`).send({ optionIds: [optieA] });

      expect(antwoord.status).toBe(403);
      expect(testDb.prepare('SELECT COUNT(*) as n FROM poll_votes WHERE poll_id = ?').get(pollId)).toEqual({ n: 0 });
    });

    it('weigert stemmen voordat de peiling opengaat', async () => {
      const morgen = new Date(Date.now() + 86400000).toISOString();
      const { pollId, optieA } = peilingMetOpties({ startsAt: morgen });

      expect((await als(lidToken, 'post', `/${pollId}/vote`).send({ optionIds: [optieA] })).status).toBe(400);
    });

    it('weigert stemmen nadat de sluitingstijd voorbij is', async () => {
      const gisteren = new Date(Date.now() - 86400000).toISOString();
      const { pollId, optieA } = peilingMetOpties({ endsAt: gisteren });

      expect((await als(lidToken, 'post', `/${pollId}/vote`).send({ optionIds: [optieA] })).status).toBe(400);
    });

    it('weigert twee opties bij een enkelvoudige peiling', async () => {
      const { pollId, optieA, optieB } = peilingMetOpties({ pollType: 'single' });

      const antwoord = await als(lidToken, 'post', `/${pollId}/vote`).send({ optionIds: [optieA, optieB] });

      expect(antwoord.status).toBe(400);
    });

    it('weigert meer opties dan toegestaan bij een meervoudige peiling', async () => {
      const { pollId, optieA, optieB } = peilingMetOpties({ pollType: 'multiple', maxSelections: 1 });

      const antwoord = await als(lidToken, 'post', `/${pollId}/vote`).send({ optionIds: [optieA, optieB] });

      expect(antwoord.status).toBe(400);
    });

    it('staat meerdere opties toe binnen het maximum', async () => {
      const { pollId, optieA, optieB } = peilingMetOpties({ pollType: 'multiple', maxSelections: 2 });

      const antwoord = await als(lidToken, 'post', `/${pollId}/vote`).send({ optionIds: [optieA, optieB] });

      expect(antwoord.status).toBe(200);
      expect(testDb.prepare('SELECT COUNT(*) as n FROM poll_votes WHERE poll_id = ?').get(pollId)).toEqual({ n: 2 });
    });

    it('weigert een optie die bij een andere peiling hoort', async () => {
      const eerste = peilingMetOpties();
      const tweede = peilingMetOpties();

      const antwoord = await als(lidToken, 'post', `/${eerste.pollId}/vote`).send({ optionIds: [tweede.optieA] });

      expect(antwoord.status).toBe(400);
      expect(testDb.prepare('SELECT COUNT(*) as n FROM poll_votes').get()).toEqual({ n: 0 });
    });

    it('weigert een tweede stem van dezelfde persoon', async () => {
      const { pollId, optieA, optieB } = peilingMetOpties({ pollType: 'multiple' });
      await als(lidToken, 'post', `/${pollId}/vote`).send({ optionIds: [optieA] });

      const antwoord = await als(lidToken, 'post', `/${pollId}/vote`).send({ optionIds: [optieB] });

      expect(antwoord.status).toBe(400);
      expect(testDb.prepare('SELECT COUNT(*) as n FROM poll_votes WHERE poll_id = ?').get(pollId)).toEqual({ n: 1 });
    });

    it('weigert een lege keuze', async () => {
      const { pollId } = peilingMetOpties();

      expect((await als(lidToken, 'post', `/${pollId}/vote`).send({ optionIds: [] })).status).toBe(400);
    });

    it('slaat de rangorde op bij een gerangschikte peiling', async () => {
      const { pollId, optieA, optieB } = peilingMetOpties({ pollType: 'ranked' });

      const antwoord = await als(lidToken, 'post', `/${pollId}/vote`).send({
        optionIds: [optieA, optieB],
        ranks: { [optieA]: 1, [optieB]: 2 },
      });

      expect(antwoord.status).toBe(200);
      const rangen = testDb
        .prepare('SELECT option_id, rank_position FROM poll_votes WHERE poll_id = ? ORDER BY rank_position')
        .all(pollId);
      expect(rangen).toEqual([
        { option_id: optieA, rank_position: 1 },
        { option_id: optieB, rank_position: 2 },
      ]);
    });

    it('trekt een stem in', async () => {
      const { pollId, optieA } = peilingMetOpties();
      stem(pollId, optieA, lid.id);

      const antwoord = await als(lidToken, 'delete', `/${pollId}/vote`);

      expect(antwoord.status).toBe(200);
      expect(testDb.prepare('SELECT COUNT(*) as n FROM poll_votes WHERE poll_id = ?').get(pollId)).toEqual({ n: 0 });
    });

    it('raakt de stem van een ander niet bij het intrekken', async () => {
      const { pollId, optieA } = peilingMetOpties();
      stem(pollId, optieA, lid.id);
      stem(pollId, optieA, beheerder.id);

      await als(lidToken, 'delete', `/${pollId}/vote`);

      const over = testDb.prepare('SELECT user_id FROM poll_votes WHERE poll_id = ?').all(pollId);
      expect(over).toEqual([{ user_id: beheerder.id }]);
    });

    it('meldt het als er niets in te trekken valt', async () => {
      const { pollId } = peilingMetOpties();

      expect((await als(lidToken, 'delete', `/${pollId}/vote`)).status).toBe(400);
    });

    it('weigert intrekken bij een gesloten peiling', async () => {
      const { pollId, optieA } = peilingMetOpties({ status: 'closed' });
      stem(pollId, optieA, lid.id);

      const antwoord = await als(lidToken, 'delete', `/${pollId}/vote`);

      expect(antwoord.status).toBe(400);
      expect(testDb.prepare('SELECT COUNT(*) as n FROM poll_votes WHERE poll_id = ?').get(pollId)).toEqual({ n: 1 });
    });

    it('geeft 404 bij intrekken op een peiling van een andere vereniging', async () => {
      const elders = maakPeiling({ associationId: andereVereniging.id, createdBy: andereBeheerder.id });

      expect((await als(lidToken, 'delete', `/${elders}/vote`)).status).toBe(404);
    });
  });

  // =====================================================
  // Reacties
  // =====================================================

  describe('reacties', () => {
    it('plaatst een reactie', async () => {
      const { pollId } = peilingMetOpties();

      const antwoord = await als(lidToken, 'post', `/${pollId}/comments`).send({ content: 'Goed idee' });

      expect(antwoord.status).toBe(201);
      expect(antwoord.body.authorName).toBe('Member User');
    });

    it('weigert een lege reactie', async () => {
      const { pollId } = peilingMetOpties();

      expect((await als(lidToken, 'post', `/${pollId}/comments`).send({ content: '' })).status).toBe(400);
    });

    it('weigert een reactie als reacties uit staan', async () => {
      const { pollId } = peilingMetOpties({ allowComments: false });

      const antwoord = await als(lidToken, 'post', `/${pollId}/comments`).send({ content: 'Toch iets' });

      expect(antwoord.status).toBe(400);
      expect(testDb.prepare('SELECT COUNT(*) as n FROM poll_comments WHERE poll_id = ?').get(pollId)).toEqual({ n: 0 });
    });

    it('weigert een reactie van iemand buiten de doelgroep', async () => {
      const { pollId } = peilingMetOpties({ targetRoles: ['admin'] });

      expect((await als(lidToken, 'post', `/${pollId}/comments`).send({ content: 'Hoi' })).status).toBe(403);
    });

    it('weigert een antwoord op een onbekende reactie', async () => {
      const { pollId } = peilingMetOpties();

      const antwoord = await als(lidToken, 'post', `/${pollId}/comments`).send({
        content: 'Antwoord',
        parentId: uuidv4(),
      });

      expect(antwoord.status).toBe(404);
    });

    it('weigert een antwoord op een reactie uit een andere peiling', async () => {
      const eerste = peilingMetOpties();
      const tweede = peilingMetOpties();
      const elders = maakReactie(tweede.pollId, lid.id);

      const antwoord = await als(lidToken, 'post', `/${eerste.pollId}/comments`).send({
        content: 'Antwoord',
        parentId: elders,
      });

      expect(antwoord.status).toBe(404);
    });

    it('koppelt een antwoord aan de bovenliggende reactie', async () => {
      const { pollId } = peilingMetOpties();
      const ouder = maakReactie(pollId, beheerder.id);

      const antwoord = await als(lidToken, 'post', `/${pollId}/comments`).send({
        content: 'Mee eens',
        parentId: ouder,
      });

      expect(antwoord.status).toBe(201);
      expect(antwoord.body.parentId).toBe(ouder);
    });

    it('geeft een lege lijst als reacties uit staan', async () => {
      const { pollId } = peilingMetOpties({ allowComments: false });
      maakReactie(pollId, lid.id);

      const antwoord = await als(lidToken, 'get', `/${pollId}/comments`);

      expect(antwoord.status).toBe(200);
      expect(antwoord.body).toEqual([]);
    });

    it('geeft 404 op de reacties van een peiling van een andere vereniging', async () => {
      const elders = maakPeiling({ associationId: andereVereniging.id, createdBy: andereBeheerder.id });
      maakReactie(elders, andereBeheerder.id, 'Intern bij de buren');

      const antwoord = await als(beheerderToken, 'get', `/${elders}/comments`);

      expect(antwoord.status).toBe(404);
      expect(JSON.stringify(antwoord.body)).not.toContain('Intern bij de buren');
    });

    it('laat de schrijver zijn eigen reactie bewerken', async () => {
      const { pollId } = peilingMetOpties();
      const reactie = maakReactie(pollId, lid.id, 'Eerste versie');

      const antwoord = await als(lidToken, 'put', `/${pollId}/comments/${reactie}`).send({ content: 'Tweede versie' });

      expect(antwoord.status).toBe(200);
      const rij = testDb.prepare('SELECT content FROM poll_comments WHERE id = ?').get(reactie) as { content: string };
      expect(rij.content).toBe('Tweede versie');
    });

    it('weigert een lid dat de reactie van een ander bewerkt', async () => {
      const { pollId } = peilingMetOpties();
      const reactie = maakReactie(pollId, beheerder.id, 'Van de beheerder');

      const antwoord = await als(lidToken, 'put', `/${pollId}/comments/${reactie}`).send({ content: 'Gekaapt' });

      expect(antwoord.status).toBe(403);
      const rij = testDb.prepare('SELECT content FROM poll_comments WHERE id = ?').get(reactie) as { content: string };
      expect(rij.content).toBe('Van de beheerder');
    });

    it('laat een beheerder de reactie van een lid bewerken', async () => {
      const { pollId } = peilingMetOpties();
      const reactie = maakReactie(pollId, lid.id);

      expect(
        (await als(beheerderToken, 'put', `/${pollId}/comments/${reactie}`).send({ content: 'Aangepast' })).status,
      ).toBe(200);
    });

    it('weigert een lege bewerking', async () => {
      const { pollId } = peilingMetOpties();
      const reactie = maakReactie(pollId, lid.id, 'Blijft');

      expect((await als(lidToken, 'put', `/${pollId}/comments/${reactie}`).send({ content: '   ' })).status).toBe(400);
    });

    it('trimt de bewerkte inhoud', async () => {
      const { pollId } = peilingMetOpties();
      const reactie = maakReactie(pollId, lid.id);

      await als(lidToken, 'put', `/${pollId}/comments/${reactie}`).send({ content: '  met spaties  ' });

      const rij = testDb.prepare('SELECT content FROM poll_comments WHERE id = ?').get(reactie) as { content: string };
      expect(rij.content).toBe('met spaties');
    });

    it('houdt de beheerder van een andere vereniging weg bij het bewerken', async () => {
      const { pollId } = peilingMetOpties();
      const reactie = maakReactie(pollId, lid.id, 'Van ons');

      const antwoord = await als(andereBeheerderToken, 'put', `/${pollId}/comments/${reactie}`).send({
        content: 'Overschreven',
      });

      expect(antwoord.status).toBe(404);
      const rij = testDb.prepare('SELECT content FROM poll_comments WHERE id = ?').get(reactie) as { content: string };
      expect(rij.content).toBe('Van ons');
    });

    it('houdt de beheerder van een andere vereniging weg bij het verwijderen', async () => {
      const { pollId } = peilingMetOpties();
      const reactie = maakReactie(pollId, lid.id);

      const antwoord = await als(andereBeheerderToken, 'delete', `/${pollId}/comments/${reactie}`);

      expect(antwoord.status).toBe(404);
      const rij = testDb.prepare('SELECT deleted_at FROM poll_comments WHERE id = ?').get(reactie) as {
        deleted_at: string | null;
      };
      expect(rij.deleted_at).toBeNull();
    });

    it('verwijdert een reactie zacht', async () => {
      const { pollId } = peilingMetOpties();
      const reactie = maakReactie(pollId, lid.id);

      const antwoord = await als(lidToken, 'delete', `/${pollId}/comments/${reactie}`);

      expect(antwoord.status).toBe(200);
      const rij = testDb.prepare('SELECT deleted_at FROM poll_comments WHERE id = ?').get(reactie) as {
        deleted_at: string | null;
      };
      expect(rij.deleted_at).not.toBeNull();
    });

    it('weigert een lid dat de reactie van een ander verwijdert', async () => {
      const { pollId } = peilingMetOpties();
      const reactie = maakReactie(pollId, beheerder.id);

      expect((await als(lidToken, 'delete', `/${pollId}/comments/${reactie}`)).status).toBe(403);
    });

    it('geeft 404 voor een al verwijderde reactie', async () => {
      const { pollId } = peilingMetOpties();
      const reactie = maakReactie(pollId, lid.id);
      await als(lidToken, 'delete', `/${pollId}/comments/${reactie}`);

      expect((await als(lidToken, 'delete', `/${pollId}/comments/${reactie}`)).status).toBe(404);
    });
  });

  // =====================================================
  // Herinneringen
  // =====================================================

  describe('herinnering aan wie nog niet gestemd heeft', () => {
    it('stuurt naar wie nog niet gestemd heeft en slaat de rest over', async () => {
      const { pollId, optieA } = peilingMetOpties();
      stem(pollId, optieA, lid.id);

      const antwoord = await als(beheerderToken, 'post', `/${pollId}/remind`);

      expect(antwoord.status).toBe(200);
      // beheerder en muziekcommissie hebben nog niet gestemd, lid wel.
      expect(antwoord.body.sent).toBe(2);
    });

    it('meldt het als iedereen al gestemd heeft', async () => {
      const { pollId, optieA } = peilingMetOpties();
      for (const persoon of [beheerder, lid, muziekcommissie]) {
        stem(pollId, optieA, persoon.id);
      }

      const antwoord = await als(beheerderToken, 'post', `/${pollId}/remind`);

      expect(antwoord.status).toBe(200);
      expect(antwoord.body.sent).toBe(0);
    });

    it('slaat leden zonder actieve status over', async () => {
      const { pollId } = peilingMetOpties();
      testDb.prepare("UPDATE users SET status = 'inactive' WHERE id = ?").run(lid.id);

      const antwoord = await als(beheerderToken, 'post', `/${pollId}/remind`);

      expect(antwoord.body.sent).toBe(2);
    });

    it('herinnert niemand van een andere vereniging', async () => {
      const { pollId } = peilingMetOpties();
      createTestUser(andereVereniging.id, { email: 'lid@elders.nl' });

      const antwoord = await als(beheerderToken, 'post', `/${pollId}/remind`);

      expect(antwoord.body.sent).toBe(3);
    });

    it('beperkt de herinnering tot de doelorkesten', async () => {
      zetInOrkest(lid.id, orkest.id);
      const { pollId } = peilingMetOpties({ targetOrchestras: [orkest.id] });

      const antwoord = await als(beheerderToken, 'post', `/${pollId}/remind`);

      expect(antwoord.body.sent).toBe(1);
    });

    it('beperkt de herinnering tot de doelrollen', async () => {
      const { pollId } = peilingMetOpties({ targetRoles: ['member'] });

      const antwoord = await als(beheerderToken, 'post', `/${pollId}/remind`);

      expect(antwoord.body.sent).toBe(1);
    });

    it('weigert een herinnering op een peiling die niet loopt', async () => {
      const { pollId } = peilingMetOpties({ status: 'draft' });

      expect((await als(beheerderToken, 'post', `/${pollId}/remind`)).status).toBe(400);
    });

    it('geeft 404 voor een peiling van een andere vereniging', async () => {
      const elders = maakPeiling({ associationId: andereVereniging.id, createdBy: andereBeheerder.id });

      expect((await als(beheerderToken, 'post', `/${elders}/remind`)).status).toBe(404);
    });

    it('weigert een gewoon lid', async () => {
      const { pollId } = peilingMetOpties();

      expect((await als(lidToken, 'post', `/${pollId}/remind`)).status).toBe(403);
    });
  });

  // =====================================================
  // Repetitie uit de winnende optie
  // =====================================================

  describe('repetitie aanmaken uit de winnende optie', () => {
    /**
     * Een gesloten peiling met een tekstoptie waar een datum in staat.
     *
     * De winnende optie wordt gekozen op stemmental; bij een gelijke stand
     * ligt de volgorde niet vast. De datumoptie krijgt daarom een stem, zodat
     * de test niet afhangt van hoe SQLite de gelijkspel-rijen teruggeeft.
     */
    function geslotenPeilingMetTekst(tekst: string): string {
      const pollId = maakPeiling({ associationId: vereniging.id, createdBy: beheerder.id, status: 'closed' });
      const datumOptie = maakOptie(pollId, tekst, 0);
      maakOptie(pollId, 'Kan niet', 1);
      stem(pollId, datumOptie, lid.id);
      return pollId;
    }

    it('herkent DD-MM-YYYY in de optietekst', async () => {
      const pollId = geslotenPeilingMetTekst('Dinsdag 15-09-2026');

      const antwoord = await als(beheerderToken, 'post', `/${pollId}/create-rehearsal`).send({});

      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      expect(antwoord.body.date).toBe('2026-09-15');
    });

    it('herkent DD/MM/YYYY in de optietekst', async () => {
      const pollId = geslotenPeilingMetTekst('Dinsdag 15/09/2026');

      const antwoord = await als(beheerderToken, 'post', `/${pollId}/create-rehearsal`).send({});

      expect(antwoord.body.date).toBe('2026-09-15');
    });

    it('weigert een optie zonder herkenbare datum', async () => {
      const pollId = geslotenPeilingMetTekst('Ergens in het najaar');

      const antwoord = await als(beheerderToken, 'post', `/${pollId}/create-rehearsal`).send({});

      expect(antwoord.status).toBe(400);
      expect(testDb.prepare('SELECT COUNT(*) as n FROM rehearsal_instances').get()).toEqual({ n: 0 });
    });

    it('weigert een peiling zonder opties', async () => {
      const pollId = maakPeiling({ associationId: vereniging.id, createdBy: beheerder.id, status: 'closed' });

      expect((await als(beheerderToken, 'post', `/${pollId}/create-rehearsal`).send({})).status).toBe(400);
    });

    it('weigert een orkest van een andere vereniging', async () => {
      const pollId = geslotenPeilingMetTekst('Dinsdag 2026-09-15');

      const antwoord = await als(beheerderToken, 'post', `/${pollId}/create-rehearsal`).send({
        orchestraId: anderOrkest.id,
      });

      expect(antwoord.status).toBe(404);
      expect(testDb.prepare('SELECT COUNT(*) as n FROM rehearsal_instances').get()).toEqual({ n: 0 });
    });

    it('kiest de optie met de meeste stemmen', async () => {
      const pollId = maakPeiling({ associationId: vereniging.id, createdBy: beheerder.id, status: 'closed' });
      maakOptie(pollId, 'Dinsdag 2026-09-15', 0);
      const populair = maakOptie(pollId, 'Dinsdag 2026-09-22', 1);
      stem(pollId, populair, lid.id);
      stem(pollId, populair, muziekcommissie.id);

      const antwoord = await als(beheerderToken, 'post', `/${pollId}/create-rehearsal`).send({});

      expect(antwoord.body.date).toBe('2026-09-22');
      expect(antwoord.body.voteCount).toBe(2);
    });
  });

  // =====================================================
  // De verenigingsgrens rond het doelorkest
  // =====================================================

  describe('het doelorkest van een peiling', () => {
    /**
     * Het orkest-id uit het verzoek belandt als orchestra_id in
     * rehearsal_instances terwijl association_id die van de aanvrager wordt.
     * POST /:id/create-rehearsal controleert daar al op, met in de code de
     * toelichting dat er anders "een repetitie [ontstaat] die bij twee
     * verenigingen tegelijk hoort en in geen enkel orkestfilter thuis is".
     *
     * Bij het aanmaken van de peiling zat die controle niet: targetOrchestraId
     * ging ongezien de database in en het automatische pad in POST /:id/status
     * maakte er bij het sluiten alsnog zo'n repetitie mee aan.
     *
     * Zonder de reparatie in routes/polls.ts zijn beide tests hieronder rood:
     * de eerste krijgt 201 in plaats van 404, de tweede vindt een
     * rehearsal_instance met orchestra_id van de andere vereniging.
     */
    it('weigert een doelorkest van een andere vereniging bij het aanmaken', async () => {
      const antwoord = await als(beheerderToken, 'post', '/').send({
        title: 'Repetitiedag',
        isDatePoll: true,
        autoCreateRehearsal: true,
        targetOrchestraId: anderOrkest.id,
        options: [
          { text: 'Dinsdag', value: '2026-09-15' },
          { text: 'Woensdag', value: '2026-09-16' },
        ],
      });

      expect(antwoord.status).toBe(404);
      expect(testDb.prepare('SELECT COUNT(*) as n FROM polls').get()).toEqual({ n: 0 });
    });

    it('weigert een doelorkestenlijst met een orkest van een andere vereniging', async () => {
      const antwoord = await als(beheerderToken, 'post', '/').send({
        title: 'Repetitiedag',
        targetOrchestras: [orkest.id, anderOrkest.id],
        options: [{ text: 'Ja' }, { text: 'Nee' }],
      });

      expect(antwoord.status).toBe(404);
      expect(testDb.prepare('SELECT COUNT(*) as n FROM polls').get()).toEqual({ n: 0 });
    });

    it('maakt bij het sluiten geen repetitie voor een orkest van een andere vereniging', async () => {
      // Een peiling zoals die er vóór de controle bij het aanmaken in kon
      // staan: eigen vereniging, maar een orkest van de buren als doel.
      const pollId = maakPeiling({
        associationId: vereniging.id,
        createdBy: beheerder.id,
        status: 'active',
        isDatePoll: true,
        autoCreateRehearsal: true,
        targetOrchestraId: anderOrkest.id,
      });
      const winnaar = maakOptie(pollId, 'Dinsdag', 0, '2026-09-15');
      maakOptie(pollId, 'Woensdag', 1, '2026-09-16');
      stem(pollId, winnaar, lid.id);

      const antwoord = await als(beheerderToken, 'post', `/${pollId}/status`).send({ status: 'closed' });

      expect(antwoord.status).toBe(200);
      expect(antwoord.body.createdRehearsalId).toBeNull();
      expect(testDb.prepare('SELECT COUNT(*) as n FROM rehearsal_instances').get()).toEqual({ n: 0 });
    });

    it('laat het eigen orkest ongemoeid', async () => {
      const antwoord = await als(beheerderToken, 'post', '/').send({
        title: 'Repetitiedag',
        isDatePoll: true,
        autoCreateRehearsal: true,
        targetOrchestraId: orkest.id,
        options: [
          { text: 'Dinsdag', value: '2026-09-15' },
          { text: 'Woensdag', value: '2026-09-16' },
        ],
      });

      expect(antwoord.status).toBe(201);
    });
  });
});
