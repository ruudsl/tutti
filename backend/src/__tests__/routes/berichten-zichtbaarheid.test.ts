/**
 * Wie ziet welk bericht, en wie mag erop reageren.
 *
 * posts.test.ts dekt het aanmaken, tonen en verwijderen af. Wat daar niet in
 * staat is de vraag die bij een berichtenbord het meest misgaat: een bericht
 * dat voor een deel van de leden bedoeld is en bij de rest terechtkomt. Een
 * bericht heeft twee filters over elkaar heen - de toestand (concept, gepland,
 * gepubliceerd, gearchiveerd) en de doelgroep (orkesten en rollen) - en beide
 * moeten kloppen voordat een lid het te zien krijgt.
 *
 * Daarnaast de verenigingsgrens: berichten, categorieen en reacties horen bij
 * een vereniging, en geen van drieen mag over die grens heen te bereiken zijn.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import postsRoutes, { processScheduledPosts } from '../../routes/posts';
import { errorHandler } from '../../middleware/errorHandler';
import {
  createTestAssociation,
  createTestUser,
  createTestOrchestra,
  addUserToOrchestra,
  generateTestToken,
  createTestEnvironment,
  TestUser,
} from '../testUtils';

// Berichten sturen zelf geen mail, maar de route-boom trekt de mailer wel
// binnen. Afvangen dus; er hoort tijdens het testen niets de deur uit te gaan.
vi.mock('../../utils/email', () => ({
  sendEmail: vi.fn().mockResolvedValue(true),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(true),
}));

const app = express();
app.use(express.json());
app.use('/api', rateLimit({ windowMs: 60_000, limit: 10_000 }));
app.use('/api/posts', postsRoutes);
app.use(errorHandler);

let adminToken: string;
let memberToken: string;
let associationId: string;
let adminUser: TestUser;
let memberUser: TestUser;

beforeEach(() => {
  const omgeving = createTestEnvironment();
  adminToken = omgeving.adminToken;
  memberToken = omgeving.memberToken;
  associationId = omgeving.association.id;
  adminUser = omgeving.adminUser;
  memberUser = omgeving.memberUser;
});

const alsAdmin = (methode: 'get' | 'post' | 'put' | 'delete', pad: string) =>
  request(app)[methode](`/api/posts${pad}`).set('Authorization', `Bearer ${adminToken}`);

const alsLid = (methode: 'get' | 'post' | 'put' | 'delete', pad: string) =>
  request(app)[methode](`/api/posts${pad}`).set('Authorization', `Bearer ${memberToken}`);

const met = (token: string, methode: 'get' | 'post' | 'put' | 'delete', pad: string) =>
  request(app)[methode](`/api/posts${pad}`).set('Authorization', `Bearer ${token}`);

async function maakBericht(overschrijf: Record<string, unknown> = {}) {
  const res = await alsAdmin('post', '/').send({
    title: `Uitnodiging jaarvergadering ${uuidv4().slice(0, 8)}`,
    content: 'Beste leden, hierbij de uitnodiging.',
    status: 'published',
    ...overschrijf,
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.id as string;
}

/** De id's van de berichten die deze lezer in het overzicht terugkrijgt. */
async function overzichtVoor(token: string, zoekterm = ''): Promise<string[]> {
  const res = await met(token, 'get', `/${zoekterm}`);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return (res.body as { id: string }[]).map((p) => p.id);
}

/** Een tweede vereniging met een beheerder en een lid. */
function andereVereniging(kenmerk: string) {
  const vereniging = createTestAssociation();
  const beheerder = createTestUser(vereniging.id, {
    email: `beheerder-${kenmerk}-${uuidv4()}@anders.test`,
    role: 'admin',
  });
  const lid = createTestUser(vereniging.id, { email: `lid-${kenmerk}-${uuidv4()}@anders.test` });
  return {
    vereniging,
    beheerder,
    lid,
    token: generateTestToken(beheerder),
    lidToken: generateTestToken(lid),
  };
}

describe('Toestand van een bericht', () => {
  it('laat een gewoon lid een bericht zien dat vandaag gepubliceerd is', async () => {
    /**
     * BEWIJS van een echte fout, hersteld in GET /.
     *
     * Voor een gewoon lid stond er in de query
     *   `p.published_at <= datetime('now')`.
     * published_at gaat er als ISO 8601 in - `2026-08-23T14:20:53.571Z` - en
     * datetime('now') levert `2026-08-23 14:20:53`. SQLite heeft geen
     * datumtype, dus dit is een tekstvergelijking, en op plek tien staat een
     * 'T' tegenover een spatie. 'T' is 0x54 en de spatie 0x20, dus zodra de
     * datum gelijk is, is het opgeslagen tijdstip altijd de grotere tekst en is
     * de vergelijking onwaar - ongeacht de klok.
     *
     * Gevolg: elk bericht dat vandaag gepubliceerd werd viel voor elk gewoon
     * lid buiten het overzicht, en verscheen pas na middernacht UTC, wanneer de
     * datum zelf gaat verschillen. Juist het nieuwste bericht was het bericht
     * dat niemand zag. De losse route GET /:idOrSlug kijkt niet naar
     * published_at, dus via een rechtstreekse link was het bericht wel te
     * lezen - wat het lastig te zien maakte.
     *
     * De waarden zijn nagemeten in de testdatabase:
     *   datetime('now') = '2026-08-23 14:20:53'
     *   published_at    = '2026-08-23T14:20:53.571Z'
     *
     * Rood aangetoond op de oude code: eigen bestand naar de scratchpad,
     * `git checkout HEAD -- src/routes/posts.ts`, dit testbestand gedraaid.
     * Negen tests faalden, waarvan vijf op deze fout: deze, "markeert een
     * gepubliceerd bericht als gelezen", "laat een bericht voor een orkest
     * alleen bij dat orkest zien", "eist bij orkest en rol samen dat beide
     * kloppen" en "laat een bericht zonder doelgroep aan iedereen zien". Alle
     * vijf kregen een leeg overzicht terug. Daarna de kopie teruggezet.
     */
    const id = await maakBericht();

    expect(await overzichtVoor(memberToken)).toContain(id);
    expect((await alsLid('get', `/${id}`)).status).toBe(200);
  });

  it('laat een bericht van gisteren ook zien', async () => {
    // De tegenhanger van de test hierboven: op een oudere datum ging de
    // vergelijking wel goed, want dan verschilt het jaartal of de dag al voor
    // plek tien. Daardoor leek het overzicht te werken zolang je maar niet naar
    // het nieuwste bericht keek.
    const id = await maakBericht();
    const gisteren = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    db.prepare('UPDATE posts SET published_at = ? WHERE id = ?').run(gisteren, id);

    expect(await overzichtVoor(memberToken)).toContain(id);
  });

  it('houdt een concept weg bij een gewoon lid', async () => {
    const id = await maakBericht({ status: 'draft' });

    expect(await overzichtVoor(memberToken)).not.toContain(id);
    expect((await alsLid('get', `/${id}`)).status).toBe(404);
  });

  it('houdt een gearchiveerd bericht weg bij een gewoon lid', async () => {
    const id = await maakBericht({ status: 'archived' });

    expect(await overzichtVoor(memberToken)).not.toContain(id);
    expect((await alsLid('get', `/${id}`)).status).toBe(404);
  });

  it('houdt een gepland bericht weg tot het zover is', async () => {
    // Een bericht dat vooruit is klaargezet mag niet alvast te lezen zijn; dan
    // is inplannen zinloos.
    const id = await maakBericht({ status: 'scheduled', scheduledAt: '2030-01-01T10:00:00.000Z' });

    expect(await overzichtVoor(memberToken)).not.toContain(id);
    expect((await alsLid('get', `/${id}`)).status).toBe(404);
  });

  it('houdt een gepubliceerd bericht met een toekomstige datum weg', async () => {
    const id = await maakBericht({ status: 'published' });
    db.prepare("UPDATE posts SET published_at = '2099-01-01T10:00:00.000Z' WHERE id = ?").run(id);

    expect(await overzichtVoor(memberToken)).not.toContain(id);
  });

  it('laat een beheerder ook de concepten zien', async () => {
    const concept = await maakBericht({ status: 'draft' });
    const gepubliceerd = await maakBericht();

    const alles = await overzichtVoor(adminToken);
    expect(alles).toContain(concept);
    expect(alles).toContain(gepubliceerd);
  });

  it('laat de schrijver zijn eigen concept zien', async () => {
    // De schrijver hoeft geen beheerder te zijn; een dirigent die een stuk
    // voorbereidt moet zijn eigen tekst kunnen teruglezen.
    const dirigent = createTestUser(associationId, { email: 'dirigent@test.com', role: 'conductor' });
    const id = uuidv4();
    db.prepare(
      `INSERT INTO posts (id, association_id, title, slug, content, status, created_by)
       VALUES (?, ?, ?, ?, ?, 'draft', ?)`,
    ).run(id, associationId, 'Eigen concept', `eigen-concept-${id.slice(0, 8)}`, 'Nog niet af.', dirigent.id);

    const eigen = await met(generateTestToken(dirigent), 'get', `/${id}`);
    expect(eigen.status).toBe(200);

    // En een ander lid nog steeds niet.
    expect((await alsLid('get', `/${id}`)).status).toBe(404);
  });

  it('telt de weergaven alleen bij een gepubliceerd bericht', async () => {
    const concept = await maakBericht({ status: 'draft' });
    await alsAdmin('get', `/${concept}`);

    const rij = db.prepare('SELECT view_count FROM posts WHERE id = ?').get(concept) as { view_count: number };
    expect(rij.view_count).toBe(0);
  });

  it('markeert een gepubliceerd bericht als gelezen', async () => {
    const id = await maakBericht();

    expect((await overzichtVoor(memberToken)).length).toBeGreaterThan(0);
    expect((await alsLid('get', '/')).body.find((p: { id: string }) => p.id === id).isRead).toBe(false);

    await alsLid('get', `/${id}`);

    // De lijst is een minuut in cache per gebruiker; lees hem daarom uit de
    // database in plaats van via de route.
    const gelezen = db
      .prepare('SELECT post_id FROM post_reads WHERE post_id = ? AND user_id = ?')
      .get(id, memberUser.id);
    expect(gelezen).toBeTruthy();
  });

  it('vindt een bericht ook op zijn slug', async () => {
    const res = await alsAdmin('post', '/').send({
      title: 'Op slug te vinden',
      content: 'Inhoud',
      slug: 'op-slug-te-vinden',
      status: 'published',
    });

    const opgehaald = await alsLid('get', '/op-slug-te-vinden');
    expect(opgehaald.status).toBe(200);
    expect(opgehaald.body.id).toBe(res.body.id);
  });
});

describe('Doelgroep van een bericht', () => {
  it('laat een bericht voor een rol alleen bij die rol zien', async () => {
    const id = await maakBericht({ targetRoles: ['admin'] });

    expect(await overzichtVoor(memberToken)).not.toContain(id);
    const los = await alsLid('get', `/${id}`);
    expect(los.status).toBe(403);
    expect(los.body.error).toContain('geen toegang');
  });

  it('laat een bericht voor een orkest alleen bij dat orkest zien', async () => {
    const harmonie = createTestOrchestra(associationId, { name: 'Harmonie' });
    const drumband = createTestOrchestra(associationId, { name: 'Drumband' });
    const speler = createTestUser(associationId, { email: 'harmonielid@test.com' });
    addUserToOrchestra(speler.id, harmonie.id);
    addUserToOrchestra(memberUser.id, drumband.id);

    const id = await maakBericht({ targetOrchestras: [harmonie.id] });

    expect(await overzichtVoor(generateTestToken(speler))).toContain(id);
    expect(await overzichtVoor(memberToken)).not.toContain(id);
  });

  it('laat een lid zonder orkest een orkestbericht niet zien', async () => {
    const harmonie = createTestOrchestra(associationId, { name: 'Harmonie' });
    const id = await maakBericht({ targetOrchestras: [harmonie.id] });

    expect(await overzichtVoor(memberToken)).not.toContain(id);
  });

  it('eist bij orkest en rol samen dat beide kloppen', async () => {
    const harmonie = createTestOrchestra(associationId, { name: 'Harmonie' });
    const juisteRolVerkeerdOrkest = createTestUser(associationId, {
      email: 'wel-rol-geen-orkest@test.com',
      role: 'conductor',
    });
    const beide = createTestUser(associationId, { email: 'beide@test.com', role: 'conductor' });
    addUserToOrchestra(beide.id, harmonie.id);

    const id = await maakBericht({ targetRoles: ['conductor'], targetOrchestras: [harmonie.id] });

    expect(await overzichtVoor(generateTestToken(beide))).toContain(id);
    expect(await overzichtVoor(generateTestToken(juisteRolVerkeerdOrkest))).not.toContain(id);
  });

  it('laat een bericht zonder doelgroep aan iedereen zien', async () => {
    const id = await maakBericht({ targetRoles: [], targetOrchestras: [] });

    expect(await overzichtVoor(memberToken)).toContain(id);
  });

  it('laat de beheerder een bericht met doelgroep gewoon zien', async () => {
    // Anders kan een beheerder een bericht niet nakijken dat hij niet zelf
    // ontvangt.
    const id = await maakBericht({ targetRoles: ['conductor'] });

    expect(await overzichtVoor(adminToken)).toContain(id);
    expect((await alsAdmin('get', `/${id}`)).status).toBe(200);
  });

  it('geeft de doelgroep terug bij het bericht', async () => {
    const harmonie = createTestOrchestra(associationId, { name: 'Harmonie' });
    const id = await maakBericht({ targetRoles: ['admin'], targetOrchestras: [harmonie.id] });

    const res = await alsAdmin('get', `/${id}`);
    expect(res.body.targetRoles).toEqual(['admin']);
    expect(res.body.targetOrchestras).toEqual([harmonie.id]);
  });
});

describe('Scheiding tussen verenigingen', () => {
  it('toont in het overzicht geen bericht van een andere vereniging', async () => {
    const id = await maakBericht();
    const vreemd = andereVereniging('overzicht');

    expect(await overzichtVoor(vreemd.token)).toEqual([]);
    expect(await overzichtVoor(vreemd.lidToken)).not.toContain(id);
  });

  it('wijzigt het bericht van een andere vereniging niet', async () => {
    const id = await maakBericht({ title: 'Van ons' });
    const vreemd = andereVereniging('wijzigen');

    const res = await met(vreemd.token, 'put', `/${id}`).send({ title: 'Overgenomen' });
    expect(res.status).toBe(404);

    const rij = db.prepare('SELECT title FROM posts WHERE id = ?').get(id) as { title: string };
    expect(rij.title).toBe('Van ons');
  });

  it('laat dezelfde slug bij twee verenigingen naast elkaar bestaan', async () => {
    // De slug is uniek binnen een vereniging, niet daarbuiten; anders bepaalt
    // de ene vereniging welke adressen de andere nog mag gebruiken.
    await alsAdmin('post', '/').send({ title: 'Nieuws', content: 'Iets', slug: 'nieuws' });
    const vreemd = andereVereniging('slug');

    const res = await met(vreemd.token, 'post', '/').send({ title: 'Nieuws', content: 'Iets', slug: 'nieuws' });
    expect(res.status).toBe(201);
    expect(res.body.slug).toBe('nieuws');
  });

  it('laat een bericht niet in de categorie van een andere vereniging hangen', async () => {
    /**
     * BEWIJS van een echte fout, hersteld in POST / en PUT /:id.
     *
     * categoryIds ging ongecontroleerd de koppeltabel in. De enige rem was de
     * externe sleutel naar post_categories: de categorie moest bestaan, maar
     * niet bij de eigen vereniging horen. Vereniging A kon dus een bericht aan
     * een categorie van vereniging B hangen.
     *
     * Dat is aan twee kanten mis. Het bericht van A geeft bij het ophalen de
     * naam, slug en kleur van B's categorie terug - gegevens van een andere
     * vereniging. En de tellerkolom postCount in B's categorieenoverzicht telt
     * dat bericht mee, dus B ziet een aantal dat niet bij zijn eigen berichten
     * hoort.
     *
     * Rood aangetoond op de oude code: eigen bestand naar de scratchpad,
     * `git checkout HEAD -- src/routes/posts.ts`, dit testbestand gedraaid.
     * Deze test faalde met 201 in plaats van 400, en de koppeling stond in
     * post_category_mapping. Daarna de kopie teruggezet.
     */
    const vreemd = andereVereniging('categorie');
    const vreemdeCategorie = uuidv4();
    db.prepare('INSERT INTO post_categories (id, association_id, name, slug) VALUES (?, ?, ?, ?)').run(
      vreemdeCategorie,
      vreemd.vereniging.id,
      'Bestuursmededelingen',
      'bestuur',
    );

    const res = await alsAdmin('post', '/').send({
      title: 'Kaping',
      content: 'Iets',
      categoryIds: [vreemdeCategorie],
    });

    expect(res.status).toBe(400);
    expect(
      db.prepare('SELECT post_id FROM post_category_mapping WHERE category_id = ?').get(vreemdeCategorie),
    ).toBeFalsy();
  });

  it('hangt bij een wijziging geen categorie van een andere vereniging aan', async () => {
    const id = await maakBericht();
    const vreemd = andereVereniging('categorie-wijzig');
    const vreemdeCategorie = uuidv4();
    db.prepare('INSERT INTO post_categories (id, association_id, name, slug) VALUES (?, ?, ?, ?)').run(
      vreemdeCategorie,
      vreemd.vereniging.id,
      'Bestuursmededelingen',
      'bestuur',
    );

    const res = await alsAdmin('put', `/${id}`).send({ categoryIds: [vreemdeCategorie] });
    expect(res.status).toBe(400);
    expect(db.prepare('SELECT post_id FROM post_category_mapping WHERE post_id = ?').get(id)).toBeFalsy();
  });

  it('weigert een categorie die helemaal niet bestaat', async () => {
    const res = await alsAdmin('post', '/').send({
      title: 'Onbekende categorie',
      content: 'Iets',
      categoryIds: [uuidv4()],
    });
    expect(res.status).toBe(400);
  });
});

describe('Bericht aanmaken en wijzigen', () => {
  it('leidt een slug af uit de titel', async () => {
    const res = await alsAdmin('post', '/').send({
      title: 'Concert in de Sint-Janskerk!',
      content: 'Iets',
    });
    expect(res.body.slug).toBe('concert-in-de-sint-janskerk');
  });

  it('maakt een tweede bericht met dezelfde titel uniek', async () => {
    const eerste = await alsAdmin('post', '/').send({ title: 'Jaarvergadering', content: 'Iets' });
    const tweede = await alsAdmin('post', '/').send({ title: 'Jaarvergadering', content: 'Iets' });

    expect(tweede.status).toBe(201);
    expect(tweede.body.slug).not.toBe(eerste.body.slug);
    expect(tweede.body.slug).toContain('jaarvergadering-');
  });

  it('weigert bij een wijziging een slug die al in gebruik is', async () => {
    await alsAdmin('post', '/').send({ title: 'Eerste', content: 'Iets', slug: 'bezet' });
    const tweede = await maakBericht({ slug: 'vrij' });

    const res = await alsAdmin('put', `/${tweede}`).send({ slug: 'bezet' });
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('al in gebruik');
  });

  it('laat een bericht zijn eigen slug houden bij een wijziging', async () => {
    const id = await maakBericht({ slug: 'blijft-gelijk' });

    expect((await alsAdmin('put', `/${id}`).send({ slug: 'blijft-gelijk' })).status).toBe(200);
  });

  it('eist een publicatiedatum bij een gepland bericht', async () => {
    const res = await alsAdmin('post', '/').send({
      title: 'Zonder datum',
      content: 'Iets',
      status: 'scheduled',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Publicatiedatum');
  });

  it('eist ook bij een wijziging een publicatiedatum voor een gepland bericht', async () => {
    const id = await maakBericht({ status: 'draft' });

    const res = await alsAdmin('put', `/${id}`).send({ status: 'scheduled' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Publicatiedatum');
  });

  it('zet de publicatiedatum bij het publiceren', async () => {
    const id = await maakBericht({ status: 'draft' });
    expect(
      (db.prepare('SELECT published_at FROM posts WHERE id = ?').get(id) as { published_at: null }).published_at,
    ).toBeNull();

    await alsAdmin('put', `/${id}`).send({ status: 'published' });

    const rij = db.prepare('SELECT status, published_at FROM posts WHERE id = ?').get(id) as {
      status: string;
      published_at: string | null;
    };
    expect(rij.status).toBe('published');
    expect(rij.published_at).toBeTruthy();
  });

  it('laat een gepubliceerd bericht niet terugvallen op concept bij een kleine wijziging', async () => {
    // Dit is waar het wijzigingsschema voor is: `status` heeft een standaard
    // van 'draft', en zonder die schil kwam die standaard bij elke wijziging
    // mee en zette een gepubliceerd bericht terug op concept.
    const id = await maakBericht({ status: 'published' });

    expect((await alsAdmin('put', `/${id}`).send({ title: 'Alleen de titel' })).status).toBe(200);

    const rij = db.prepare('SELECT status FROM posts WHERE id = ?').get(id) as { status: string };
    expect(rij.status).toBe('published');
  });

  it('bewaart elk gewijzigd veld van een bericht', async () => {
    // Een volledige bewerking moet ook echt volledig aankomen. De PUT bouwt de
    // UPDATE veld voor veld op; een vergeten regel valt alleen op als je alle
    // velden tegelijk verzet en terugleest.
    const harmonie = createTestOrchestra(associationId, { name: 'Harmonie' });
    const id = await maakBericht({ isPinned: false, isFeatured: false, allowComments: true });

    const res = await alsAdmin('put', `/${id}`).send({
      excerpt: 'Nieuwe samenvatting',
      content: 'Nieuwe inhoud',
      contentFormat: 'html',
      featuredImage: '/uploads/omslag.jpg',
      isPinned: true,
      isFeatured: true,
      allowComments: false,
      targetOrchestras: [harmonie.id],
      targetRoles: ['conductor'],
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);

    const opgehaald = await alsAdmin('get', `/${id}`);
    expect(opgehaald.body).toMatchObject({
      excerpt: 'Nieuwe samenvatting',
      content: 'Nieuwe inhoud',
      contentFormat: 'html',
      featuredImage: '/uploads/omslag.jpg',
      isPinned: true,
      isFeatured: true,
      allowComments: false,
      targetOrchestras: [harmonie.id],
      targetRoles: ['conductor'],
    });
  });

  it('maakt een bericht met een lege doelgroep weer voor iedereen zichtbaar', async () => {
    // Een bericht dat eerst voor een orkest was moet weer voor de hele
    // vereniging kunnen worden; anders is een doelgroep instellen onomkeerbaar.
    //
    // Leegmaken gaat met een lege lijst, niet met null: het schema laat voor
    // deze velden alleen een lijst van uuid's toe. De opgeslagen waarde blijft
    // daarna '[]' in plaats van NULL, en canUserSeePost slaat een lijst met
    // lengte nul over - het bericht is dus weer voor iedereen.
    const harmonie = createTestOrchestra(associationId, { name: 'Harmonie' });
    const id = await maakBericht({ targetOrchestras: [harmonie.id], targetRoles: ['conductor'] });
    expect(await overzichtVoor(memberToken)).not.toContain(id);

    const res = await alsAdmin('put', `/${id}`).send({ targetOrchestras: [], targetRoles: [] });
    expect(res.status, JSON.stringify(res.body)).toBe(200);

    const verseLezer = createTestUser(associationId, { email: 'weer-zichtbaar@test.com' });
    expect(await overzichtVoor(generateTestToken(verseLezer))).toContain(id);

    const opgehaald = await alsAdmin('get', `/${id}`);
    expect(opgehaald.body.targetOrchestras).toEqual([]);
    expect(opgehaald.body.targetRoles).toEqual([]);
  });

  it('weigert null als doelgroep', async () => {
    // Zodat duidelijk blijft dat de lege lijst hierboven de bedoelde weg is en
    // null gewoon een ongeldige waarde.
    const id = await maakBericht();

    expect((await alsAdmin('put', `/${id}`).send({ targetRoles: null })).status).toBe(400);
  });

  it('weigert een wijziging met een onbekende toestand', async () => {
    const id = await maakBericht();

    expect((await alsAdmin('put', `/${id}`).send({ status: 'half-af' })).status).toBe(400);
  });

  it('laat een leeg wijzigingsverzoek het bericht ongemoeid', async () => {
    const id = await maakBericht({ title: 'Blijft zo' });

    expect((await alsAdmin('put', `/${id}`).send({})).status).toBe(200);
    expect((db.prepare('SELECT title FROM posts WHERE id = ?').get(id) as { title: string }).title).toBe('Blijft zo');
  });

  it('meldt netjes dat een onbekend bericht niet te wijzigen is', async () => {
    expect((await alsAdmin('put', `/${uuidv4()}`).send({ title: 'Iets' })).status).toBe(404);
  });

  it('bewaart de instellingen vastgezet, uitgelicht en reacties uit', async () => {
    const id = await maakBericht({ isPinned: true, isFeatured: true, allowComments: false, excerpt: 'Kort' });

    const res = await alsAdmin('get', `/${id}`);
    expect(res.body).toMatchObject({
      isPinned: true,
      isFeatured: true,
      allowComments: false,
      excerpt: 'Kort',
    });
  });

  it('laat een gewoon lid geen bericht wijzigen of verwijderen', async () => {
    const id = await maakBericht();

    expect((await alsLid('put', `/${id}`).send({ title: 'Mag niet' })).status).toBe(403);
    expect((await alsLid('delete', `/${id}`)).status).toBe(403);
  });
});

describe('Filters op het overzicht', () => {
  it('filtert voor een beheerder op toestand', async () => {
    const concept = await maakBericht({ status: 'draft' });
    const gepubliceerd = await maakBericht();

    const res = await alsAdmin('get', '/?status=draft');
    const ids = (res.body as { id: string }[]).map((p) => p.id);
    expect(ids).toContain(concept);
    expect(ids).not.toContain(gepubliceerd);
  });

  it('negeert de toestandsfilter bij een gewoon lid', async () => {
    // Anders is ?status=draft een sluiproute naar de concepten.
    const concept = await maakBericht({ status: 'draft' });

    expect(await overzichtVoor(memberToken, '?status=draft')).not.toContain(concept);
  });

  it('filtert op zoekterm in titel en inhoud', async () => {
    const gezocht = await maakBericht({ title: 'Kerstconcert in de kerk', content: 'Iets' });
    const anders = await maakBericht({ title: 'Zomerkamp', content: 'Iets anders' });

    const opTitel = await overzichtVoor(adminToken, '?search=Kerstconcert');
    expect(opTitel).toContain(gezocht);
    expect(opTitel).not.toContain(anders);

    const opInhoud = await overzichtVoor(adminToken, '?search=anders');
    expect(opInhoud).toContain(anders);
  });

  it('filtert op uitgelicht en vastgezet', async () => {
    const uitgelicht = await maakBericht({ isFeatured: true });
    const vastgezet = await maakBericht({ isPinned: true });
    const gewoon = await maakBericht();

    const opUitgelicht = await overzichtVoor(adminToken, '?featured=true');
    expect(opUitgelicht).toEqual([uitgelicht]);

    const opVastgezet = await overzichtVoor(adminToken, '?pinned=true');
    expect(opVastgezet).toEqual([vastgezet]);
    expect(gewoon).toBeTruthy();
  });

  it('zet een vastgezet bericht bovenaan', async () => {
    await maakBericht({ title: 'Gewoon bericht' });
    const vastgezet = await maakBericht({ title: 'Belangrijk', isPinned: true });

    const ids = await overzichtVoor(adminToken);
    expect(ids[0]).toBe(vastgezet);
  });

  it('filtert op categorie', async () => {
    const categorie = await alsAdmin('post', '/categories').send({ name: 'Concerten', slug: 'concerten' });
    const inCategorie = await maakBericht({ categoryIds: [categorie.body.id] });
    const erbuiten = await maakBericht();

    const ids = await overzichtVoor(adminToken, `?category=${categorie.body.id}`);
    expect(ids).toEqual([inCategorie]);
    expect(erbuiten).toBeTruthy();
  });

  it('geeft de categorieen en het aantal reacties mee in het overzicht', async () => {
    const categorie = await alsAdmin('post', '/categories').send({ name: 'Concerten', slug: 'concerten' });
    const id = await maakBericht({ categoryIds: [categorie.body.id] });
    await alsLid('post', `/${id}/comments`).send({ content: 'Leuk!' });

    const res = await alsAdmin('get', '/');
    const bericht = (res.body as { id: string; categories: { slug: string }[]; commentCount: number }[]).find(
      (p) => p.id === id,
    )!;
    expect(bericht.categories.map((c) => c.slug)).toEqual(['concerten']);
    expect(bericht.commentCount).toBe(1);
  });
});

describe('Reacties', () => {
  it('plaatst een antwoord op een reactie', async () => {
    const id = await maakBericht();
    const eerste = await alsLid('post', `/${id}/comments`).send({ content: 'Ik kom!' });

    const antwoord = await alsAdmin('post', `/${id}/comments`).send({
      content: 'Fijn.',
      parentId: eerste.body.id,
    });
    expect(antwoord.status).toBe(201);
    expect(antwoord.body.parentId).toBe(eerste.body.id);
  });

  it('weigert een antwoord op een onbekende reactie', async () => {
    const id = await maakBericht();

    const res = await alsLid('post', `/${id}/comments`).send({ content: 'Hoi', parentId: uuidv4() });
    expect(res.status).toBe(404);
    expect(res.body.error).toContain('Parent');
  });

  it('weigert een antwoord op een reactie bij een ander bericht', async () => {
    const eerste = await maakBericht({ title: 'Bericht een' });
    const tweede = await maakBericht({ title: 'Bericht twee' });
    const reactie = await alsLid('post', `/${eerste}/comments`).send({ content: 'Bij het eerste' });

    const res = await alsLid('post', `/${tweede}/comments`).send({
      content: 'Bij het tweede',
      parentId: reactie.body.id,
    });
    expect(res.status).toBe(404);
  });

  it('weigert een lege reactie', async () => {
    const id = await maakBericht();

    expect((await alsLid('post', `/${id}/comments`).send({ content: '' })).status).toBe(400);
  });

  it('laat niet reageren op een bericht dat niet voor je bedoeld is', async () => {
    const id = await maakBericht({ targetRoles: ['admin'] });

    const res = await alsLid('post', `/${id}/comments`).send({ content: 'Toch iets' });
    expect(res.status).toBe(403);
    expect(db.prepare('SELECT id FROM post_comments WHERE post_id = ?').get(id)).toBeFalsy();
  });

  it('laat een gewoon lid niet reageren op een concept', async () => {
    /**
     * BEWIJS van een echte fout, hersteld in POST /:id/comments.
     *
     * De route controleerde of het bericht bestond, of reacties aanstonden en
     * of de doelgroep klopte - maar niet naar de toestand. Een lid dat het id
     * had (uit een oudere lijst, of gewoon geraden) kon dus reageren op een
     * concept dat het nooit te zien had gekregen: GET op datzelfde bericht gaf
     * netjes 404. De 201 verklapte dat het bericht bestond, en de reactie stond
     * al onder de tekst zodra de beheerder hem publiceerde.
     *
     * Rood aangetoond op de oude code: eigen bestand naar de scratchpad,
     * `git checkout HEAD -- src/routes/posts.ts`, dit testbestand gedraaid.
     * Deze test faalde met 201 in plaats van 404, en de reactie stond in de
     * database. Daarna de kopie teruggezet.
     */
    const id = await maakBericht({ status: 'draft' });

    const res = await alsLid('post', `/${id}/comments`).send({ content: 'Alvast een reactie' });
    expect(res.status).toBe(404);
    expect(db.prepare('SELECT id FROM post_comments WHERE post_id = ?').get(id)).toBeFalsy();
  });

  it('laat de schrijver wel op zijn eigen concept reageren', async () => {
    // De beperking hierboven mag het klaarzetten van een bericht niet in de weg
    // zitten: wie het geschreven heeft mag er gewoon bij.
    const id = await maakBericht({ status: 'draft' });

    const res = await alsAdmin('post', `/${id}/comments`).send({ content: 'Notitie voor mezelf' });
    expect(res.status).toBe(201);
  });

  it('verwijdert een eigen reactie', async () => {
    const id = await maakBericht();
    const reactie = await alsLid('post', `/${id}/comments`).send({ content: 'Toch maar niet' });

    expect((await alsLid('delete', `/${id}/comments/${reactie.body.id}`)).status).toBe(200);

    const bericht = await alsLid('get', `/${id}`);
    expect(bericht.body.comments).toEqual([]);
  });

  it('laat een lid de reactie van een ander niet verwijderen', async () => {
    const id = await maakBericht();
    const vanEenAnder = await alsAdmin('post', `/${id}/comments`).send({ content: 'Van de beheerder' });

    const res = await alsLid('delete', `/${id}/comments/${vanEenAnder.body.id}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('eigen reacties');
  });

  it('laat een beheerder de reactie van een lid verwijderen', async () => {
    // Moderatie moet kunnen; een ontspoorde reactie hoort weg te kunnen.
    const id = await maakBericht();
    const reactie = await alsLid('post', `/${id}/comments`).send({ content: 'Iets onaardigs' });

    expect((await alsAdmin('delete', `/${id}/comments/${reactie.body.id}`)).status).toBe(200);
  });

  it('laat de beheerder van een andere vereniging geen reactie verwijderen', async () => {
    /**
     * BEWIJS van een echte fout, hersteld in DELETE /:postId/comments/:commentId.
     *
     * De route zocht de reactie op id en bericht-id, en keek daarna alleen of
     * de verwijderaar de schrijver was of een beheerdersrol had. Nergens werd
     * het bericht aan de vereniging van de verzoeker gekoppeld. Elke beheerder
     * of muziekcommissie van welke vereniging dan ook kon dus de reactie van
     * iemand anders wegpoetsen, zolang hij de twee id's had.
     *
     * Dit is de enige route in posts.ts die de verenigingsgrens helemaal niet
     * aanraakte; alle andere doen `WHERE ... AND association_id = ?`.
     *
     * Rood aangetoond op de oude code: eigen bestand naar de scratchpad,
     * `git checkout HEAD -- src/routes/posts.ts`, dit testbestand gedraaid.
     * Deze test faalde met 200 in plaats van 404, en deleted_at stond gezet.
     * Daarna de kopie teruggezet.
     */
    const id = await maakBericht();
    const reactie = await alsLid('post', `/${id}/comments`).send({ content: 'Van ons lid' });
    const vreemd = andereVereniging('reactie');

    const res = await met(vreemd.token, 'delete', `/${id}/comments/${reactie.body.id}`);
    expect(res.status).toBe(404);

    const rij = db.prepare('SELECT deleted_at FROM post_comments WHERE id = ?').get(reactie.body.id) as {
      deleted_at: string | null;
    };
    expect(rij.deleted_at).toBeNull();
  });

  it('meldt netjes dat een onbekende reactie niet bestaat', async () => {
    const id = await maakBericht();

    expect((await alsLid('delete', `/${id}/comments/${uuidv4()}`)).status).toBe(404);
  });

  it('verwijdert een reactie niet twee keer', async () => {
    const id = await maakBericht();
    const reactie = await alsLid('post', `/${id}/comments`).send({ content: 'Weg ermee' });
    await alsLid('delete', `/${id}/comments/${reactie.body.id}`);

    expect((await alsLid('delete', `/${id}/comments/${reactie.body.id}`)).status).toBe(404);
  });

  it('toont geen reacties bij een bericht waar ze uitstaan', async () => {
    const id = await maakBericht({ allowComments: false });
    db.prepare(`INSERT INTO post_comments (id, post_id, user_id, content) VALUES (?, ?, ?, ?)`).run(
      uuidv4(),
      id,
      memberUser.id,
      'Van voor het uitzetten',
    );

    const res = await alsAdmin('get', `/${id}`);
    expect(res.body.comments).toEqual([]);
  });

  it('toont de reacties met de naam van de schrijver', async () => {
    const id = await maakBericht();
    await alsLid('post', `/${id}/comments`).send({ content: 'Ik kom!' });

    const res = await alsAdmin('get', `/${id}`);
    expect(res.body.comments).toHaveLength(1);
    expect(res.body.comments[0]).toMatchObject({
      content: 'Ik kom!',
      authorId: memberUser.id,
      authorName: 'Member User',
    });
  });
});

describe('Categorieen', () => {
  async function maakCategorie(overschrijf: Record<string, unknown> = {}) {
    const res = await alsAdmin('post', '/categories').send({
      name: 'Concerten',
      slug: 'concerten',
      ...overschrijf,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body.id as string;
  }

  it('weigert een tweede categorie met dezelfde slug', async () => {
    await maakCategorie();

    const res = await alsAdmin('post', '/categories').send({ name: 'Nog eens', slug: 'concerten' });
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('bestaat al');
  });

  it('weigert bij een wijziging een slug die al bezet is', async () => {
    await maakCategorie();
    const tweede = await maakCategorie({ name: 'Mededelingen', slug: 'mededelingen' });

    const res = await alsAdmin('put', `/categories/${tweede}`).send({ slug: 'concerten' });
    expect(res.status).toBe(409);
  });

  it('laat een categorie zijn eigen slug houden', async () => {
    const id = await maakCategorie();

    expect((await alsAdmin('put', `/categories/${id}`).send({ slug: 'concerten', name: 'Concerten' })).status).toBe(
      200,
    );
  });

  it('wijzigt naam, omschrijving, kleur en pictogram', async () => {
    const id = await maakCategorie();

    const res = await alsAdmin('put', `/categories/${id}`).send({
      name: 'Optredens',
      description: 'Alles wat we spelen',
      color: '#ff8800',
      icon: 'muziek',
    });
    expect(res.status).toBe(200);

    const lijst = await alsAdmin('get', '/categories');
    expect(lijst.body.find((c: { id: string }) => c.id === id)).toMatchObject({
      name: 'Optredens',
      description: 'Alles wat we spelen',
      color: '#ff8800',
      icon: 'muziek',
    });
  });

  it('laat een leeg wijzigingsverzoek de categorie ongemoeid', async () => {
    const id = await maakCategorie();

    expect((await alsAdmin('put', `/categories/${id}`).send({})).status).toBe(200);
  });

  it('telt alleen gepubliceerde berichten mee', async () => {
    const categorie = await maakCategorie();
    await maakBericht({ categoryIds: [categorie], status: 'published' });
    await maakBericht({ categoryIds: [categorie], status: 'draft' });

    const res = await alsAdmin('get', '/categories');
    expect(res.body.find((c: { id: string }) => c.id === categorie).postCount).toBe(1);
  });

  it('haalt bij het verwijderen ook de koppelingen weg', async () => {
    const categorie = await maakCategorie();
    const bericht = await maakBericht({ categoryIds: [categorie] });

    expect((await alsAdmin('delete', `/categories/${categorie}`)).status).toBe(200);
    expect(db.prepare('SELECT post_id FROM post_category_mapping WHERE post_id = ?').get(bericht)).toBeFalsy();
    expect((await alsAdmin('get', `/${bericht}`)).body.categories).toEqual([]);
  });

  it('vervangt de categorieen bij een wijziging', async () => {
    const eerste = await maakCategorie();
    const tweede = await maakCategorie({ name: 'Mededelingen', slug: 'mededelingen' });
    const bericht = await maakBericht({ categoryIds: [eerste] });

    await alsAdmin('put', `/${bericht}`).send({ categoryIds: [tweede] });

    const res = await alsAdmin('get', `/${bericht}`);
    expect(res.body.categories.map((c: { id: string }) => c.id)).toEqual([tweede]);
  });

  it('maakt een bericht categorieloos met een lege lijst', async () => {
    const categorie = await maakCategorie();
    const bericht = await maakBericht({ categoryIds: [categorie] });

    await alsAdmin('put', `/${bericht}`).send({ categoryIds: [] });

    expect((await alsAdmin('get', `/${bericht}`)).body.categories).toEqual([]);
  });

  it('meldt netjes dat een onbekende categorie niet bestaat', async () => {
    expect((await alsAdmin('put', `/categories/${uuidv4()}`).send({ name: 'Iets' })).status).toBe(404);
    expect((await alsAdmin('delete', `/categories/${uuidv4()}`)).status).toBe(404);
  });

  it('raakt de categorie van een andere vereniging niet aan', async () => {
    const id = await maakCategorie();
    const vreemd = andereVereniging('categorie-grens');

    expect((await met(vreemd.token, 'put', `/categories/${id}`).send({ name: 'Overgenomen' })).status).toBe(404);
    expect((await met(vreemd.token, 'delete', `/categories/${id}`)).status).toBe(404);
    expect(db.prepare('SELECT name FROM post_categories WHERE id = ?').get(id)).toMatchObject({ name: 'Concerten' });
  });

  it('toont de categorieen van een andere vereniging niet', async () => {
    await maakCategorie();
    const vreemd = andereVereniging('categorie-lijst');

    const res = await met(vreemd.token, 'get', '/categories');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('laat een gewoon lid geen categorie wijzigen of verwijderen', async () => {
    const id = await maakCategorie();

    expect((await alsLid('put', `/categories/${id}`).send({ name: 'Mag niet' })).status).toBe(403);
    expect((await alsLid('delete', `/categories/${id}`)).status).toBe(403);
  });

  it('laat een gewoon lid de categorieen wel lezen', async () => {
    await maakCategorie();

    const res = await alsLid('get', '/categories');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});

describe('Geplande berichten die vanzelf verschijnen', () => {
  it('publiceert wat over tijd is en laat de toekomst staan', async () => {
    const verleden = await maakBericht({ status: 'scheduled', scheduledAt: '2020-01-01T10:00:00.000Z' });
    const toekomst = await maakBericht({ status: 'scheduled', scheduledAt: '2099-01-01T10:00:00.000Z' });

    const aantal = await processScheduledPosts();
    expect(aantal).toBe(1);

    expect((db.prepare('SELECT status FROM posts WHERE id = ?').get(verleden) as { status: string }).status).toBe(
      'published',
    );
    expect((db.prepare('SELECT status FROM posts WHERE id = ?').get(toekomst) as { status: string }).status).toBe(
      'scheduled',
    );
  });

  it('laat een lid het bericht pas zien nadat het gepubliceerd is', async () => {
    const id = await maakBericht({ status: 'scheduled', scheduledAt: '2020-01-01T10:00:00.000Z' });
    expect(await overzichtVoor(memberToken)).not.toContain(id);

    await processScheduledPosts();

    // Nieuwe lezer: het overzicht staat per gebruiker een minuut in cache.
    const verseLezer = createTestUser(associationId, { email: 'verse-lezer@test.com' });
    expect(await overzichtVoor(generateTestToken(verseLezer))).toContain(id);
  });

  it('doet niets als er niets klaarstaat', async () => {
    await maakBericht();

    expect(await processScheduledPosts()).toBe(0);
  });

  it('raakt een concept met een datum in het verleden niet aan', async () => {
    // Een concept is bewust niet ingepland; het mag niet vanzelf naar buiten.
    const id = await maakBericht({ status: 'draft' });
    db.prepare("UPDATE posts SET published_at = '2020-01-01T10:00:00.000Z' WHERE id = ?").run(id);

    expect(await processScheduledPosts()).toBe(0);
    expect((db.prepare('SELECT status FROM posts WHERE id = ?').get(id) as { status: string }).status).toBe('draft');
  });
});

describe('Toegang tot het berichtenbord', () => {
  it('vraagt om een token voor elke route', async () => {
    const id = await maakBericht();

    expect((await request(app).get('/api/posts/categories')).status).toBe(401);
    expect((await request(app).get(`/api/posts/${id}`)).status).toBe(401);
    expect((await request(app).post(`/api/posts/${id}/comments`).send({ content: 'Hoi' })).status).toBe(401);
  });

  it('houdt de gebruiker zonder vereniging tegen', async () => {
    // Een account dat nog aan geen enkele vereniging hangt heeft geen
    // berichtenbord om naar te kijken.
    const zwevend = createTestUser(associationId, { email: 'zwevend@test.com' });
    db.prepare('UPDATE users SET association_id = NULL WHERE id = ?').run(zwevend.id);
    const token = generateTestToken({ ...zwevend, associationId: null as unknown as string });

    expect((await met(token, 'get', '/')).status).toBe(400);
    expect((await met(token, 'get', '/categories')).status).toBe(400);
    expect(adminUser).toBeTruthy();
  });
});
