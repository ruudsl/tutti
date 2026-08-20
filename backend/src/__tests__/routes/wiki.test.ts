/**
 * De wiki van de vereniging.
 *
 * Alles draait hier om zichtbaarheid. Een pagina kan op public, members,
 * committee of admin staan, en dat is de enige afscherming die er is - er
 * hangt geen aparte rechtenstructuur onder. Daar zat een gat: de detailroute
 * hield zich er wel aan, maar de versiegeschiedenis en de losse versie niet.
 * Een gewoon lid kon de volledige inhoud van een admin-pagina gewoon lezen
 * via /wiki/<slug>/versions/<id>. Eén extra padsegment omzeilde de hele
 * instelling.
 *
 * De kinderlijst bij een pagina liet daarnaast de titels zien van
 * onderliggende pagina's die je niet mag zien. De inhoud bleef afgeschermd,
 * maar een titel als "Gesprek met de dirigent" zegt op zichzelf al genoeg.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import wikiRoutes from '../../routes/wiki';
import { errorHandler } from '../../middleware/errorHandler';
import {
  createTestAssociation,
  createTestEnvironment,
  createTestUser,
  generateTestToken,
  TestAssociation,
  TestUser,
} from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api/wiki', wikiRoutes);
app.use(errorHandler);

describe('wiki', () => {
  let vereniging: TestAssociation;
  let beheerder: TestUser;
  let beheerderToken: string;
  let lid: TestUser;
  let lidToken: string;
  let commissieToken: string;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    beheerder = omgeving.adminUser;
    beheerderToken = omgeving.adminToken;
    lid = omgeving.memberUser;
    lidToken = omgeving.memberToken;
    commissieToken = omgeving.musicCommitteeToken;
  });

  type Methode = 'get' | 'post' | 'patch' | 'delete';
  const als = (token: string, methode: Methode, pad: string) =>
    request(app)[methode](`/api/wiki${pad}`).set('Authorization', `Bearer ${token}`);
  const alsBeheerder = (methode: Methode, pad: string) => als(beheerderToken, methode, pad);
  const alsLid = (methode: Methode, pad: string) => als(lidToken, methode, pad);

  async function maakPagina(overrides: Record<string, unknown> = {}): Promise<{ id: string; slug: string }> {
    const slug = (overrides.slug as string) ?? `handleiding-${uuidv4().slice(0, 8)}`;
    const antwoord = await alsBeheerder('post', '/').send({
      title: 'Handleiding',
      content: 'Zo werkt het.',
      ...overrides,
      // Na de overrides, zodat de aanroeper de slug niet per ongeluk overschrijft
      // met een waarde die hij daarna niet terugkrijgt.
      slug,
    });
    expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);
    return { id: antwoord.body.id, slug };
  }

  describe('pagina aanmaken', () => {
    it('maakt een pagina met members als standaardzichtbaarheid', async () => {
      const { slug } = await maakPagina();

      const antwoord = await alsLid('get', `/${slug}`);
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      expect(antwoord.body).toMatchObject({
        title: 'Handleiding',
        content: 'Zo werkt het.',
        visibility: 'members',
        isPublished: true,
      });
    });

    it('legt meteen versie één vast', async () => {
      const { slug } = await maakPagina();

      const antwoord = await alsLid('get', `/${slug}/versions`);
      expect(antwoord.status).toBe(200);
      expect(antwoord.body).toHaveLength(1);
      expect(antwoord.body[0]).toMatchObject({ versionNumber: 1, changeSummary: 'Initial version' });
    });

    it('weigert een slug met hoofdletters of spaties', async () => {
      for (const slug of ['Handleiding', 'hand leiding', 'hand_leiding', 'handleiding!']) {
        const antwoord = await alsBeheerder('post', '/').send({ title: 'X', slug, content: 'x' });
        expect(antwoord.status, slug).toBe(400);
      }
    });

    it('weigert een tweede pagina met dezelfde slug', async () => {
      const { slug } = await maakPagina();

      const tweede = await alsBeheerder('post', '/').send({ title: 'Anders', slug, content: 'x' });
      expect(tweede.status).toBe(409);
    });

    it('laat dezelfde slug wel toe bij een andere vereniging', async () => {
      const { slug } = await maakPagina();
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const andereBeheerder = createTestUser(andere.id, { email: `wiki-${uuidv4()}@test.nl`, role: 'admin' });

      const antwoord = await request(app)
        .post('/api/wiki')
        .set('Authorization', `Bearer ${generateTestToken(andereBeheerder)}`)
        .send({ title: 'Eigen handleiding', slug, content: 'x' });

      expect(antwoord.status).toBe(201);
    });

    it('weigert een zichtbaarheid die niet bestaat', async () => {
      const antwoord = await alsBeheerder('post', '/').send({
        title: 'X',
        slug: 'x-pagina',
        content: 'x',
        visibility: 'iedereen',
      });
      expect(antwoord.status).toBe(400);
    });

    it('houdt een gewoon lid van het aanmaken af', async () => {
      const antwoord = await alsLid('post', '/').send({ title: 'X', slug: 'van-mij', content: 'x' });
      expect(antwoord.status).toBe(403);
    });
  });

  describe('zichtbaarheid', () => {
    it('laat een lid een pagina voor leden zien', async () => {
      const { slug } = await maakPagina({ visibility: 'members' });
      expect((await alsLid('get', `/${slug}`)).status).toBe(200);
    });

    it('houdt een lid weg bij een pagina voor de commissie', async () => {
      const { slug } = await maakPagina({ visibility: 'committee' });

      expect((await alsLid('get', `/${slug}`)).status).toBe(403);
      expect((await als(commissieToken, 'get', `/${slug}`)).status).toBe(200);
    });

    it('houdt de commissie weg bij een pagina voor de beheerder', async () => {
      const { slug } = await maakPagina({ visibility: 'admin' });

      expect((await als(commissieToken, 'get', `/${slug}`)).status).toBe(403);
      expect((await alsBeheerder('get', `/${slug}`)).status).toBe(200);
    });

    it('laat een afgeschermde pagina uit het overzicht', async () => {
      await maakPagina({ slug: 'voor-leden', visibility: 'members' });
      await maakPagina({ slug: 'alleen-bestuur', visibility: 'admin', title: 'Gesprek met de dirigent' });

      const alsGewoonLid = await alsLid('get', '/');
      expect(alsGewoonLid.body.map((p: { slug: string }) => p.slug)).toEqual(['voor-leden']);
      expect((await alsBeheerder('get', '/')).body).toHaveLength(2);
    });

    it('laat een afgeschermde pagina uit de zoekresultaten', async () => {
      await maakPagina({ slug: 'openbaar-stuk', title: 'Repetitierooster', content: 'zoekterm hier' });
      await maakPagina({
        slug: 'geheim-stuk',
        title: 'Gesprek met de dirigent',
        content: 'zoekterm hier',
        visibility: 'admin',
      });

      const alsGewoonLid = await alsLid('get', '/search?q=zoekterm');
      expect(alsGewoonLid.body).toHaveLength(1);
      expect(JSON.stringify(alsGewoonLid.body)).not.toContain('dirigent');
    });

    it('zoekt niet op één letter', async () => {
      await maakPagina();
      expect((await alsLid('get', '/search?q=a')).body).toEqual([]);
      expect((await alsLid('get', '/search')).body).toEqual([]);
    });

    it('houdt de versiegeschiedenis van een afgeschermde pagina dicht', async () => {
      const { slug } = await maakPagina({ visibility: 'admin', content: 'Zeer vertrouwelijk' });

      // Hier zat het gat: deze twee routes controleerden de zichtbaarheid niet.
      expect((await alsLid('get', `/${slug}/versions`)).status).toBe(403);

      const versies = await alsBeheerder('get', `/${slug}/versions`);
      const versieId = versies.body[0].id;
      const losseVersie = await alsLid('get', `/${slug}/versions/${versieId}`);
      expect(losseVersie.status).toBe(403);
      expect(JSON.stringify(losseVersie.body)).not.toContain('vertrouwelijk');
    });

    it('houdt de bijlagenlijst van een afgeschermde pagina dicht', async () => {
      const { slug } = await maakPagina({ visibility: 'admin' });
      expect((await alsLid('get', `/${slug}/attachments`)).status).toBe(403);
    });

    it('laat de titel van een afgeschermde onderliggende pagina niet zien', async () => {
      const ouder = await maakPagina({ slug: 'bestuur', title: 'Bestuur' });
      await maakPagina({
        slug: 'gesprek',
        title: 'Gesprek met de dirigent',
        visibility: 'admin',
        parentId: ouder.id,
      });
      await maakPagina({ slug: 'notulen', title: 'Notulen', parentId: ouder.id });

      const alsGewoonLid = await alsLid('get', `/${ouder.slug}`);
      expect(alsGewoonLid.body.children.map((k: { title: string }) => k.title)).toEqual(['Notulen']);

      const alsBeheerderGezien = await alsBeheerder('get', `/${ouder.slug}`);
      expect(alsBeheerderGezien.body.children).toHaveLength(2);
    });
  });

  describe('overzicht en boomstructuur', () => {
    it('begint leeg', async () => {
      expect((await alsLid('get', '/')).body).toEqual([]);
    });

    it('nestelt een onderliggende pagina onder haar ouder', async () => {
      const ouder = await maakPagina({ slug: 'handboek', title: 'Handboek' });
      await maakPagina({ slug: 'hoofdstuk-een', title: 'Hoofdstuk 1', parentId: ouder.id });

      const antwoord = await alsLid('get', '/');
      expect(antwoord.body).toHaveLength(1);
      expect(antwoord.body[0].children).toHaveLength(1);
      expect(antwoord.body[0].children[0].title).toBe('Hoofdstuk 1');
    });

    it('zet een vastgezette pagina bovenaan', async () => {
      await maakPagina({ slug: 'aaa-eerst-alfabetisch', title: 'Aaa' });
      await maakPagina({ slug: 'zzz-vastgezet', title: 'Zzz', isPinned: true });

      const antwoord = await alsLid('get', '/');
      expect(antwoord.body[0].title).toBe('Zzz');
    });

    it('toont geen pagina van een andere vereniging', async () => {
      await maakPagina();
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const maker = createTestUser(andere.id, { email: `wiki2-${uuidv4()}@test.nl`, role: 'admin' });
      db.prepare(
        `INSERT INTO wiki_pages (id, association_id, slug, title, content, created_by)
         VALUES (?, ?, 'van-de-buren', 'Van de buren', 'x', ?)`,
      ).run(uuidv4(), andere.id, maker.id);

      expect((await alsLid('get', '/')).body).toHaveLength(1);
      expect((await alsLid('get', '/van-de-buren')).status).toBe(404);
    });

    it('telt hoe vaak een pagina is bekeken', async () => {
      const { slug } = await maakPagina();

      expect((await alsLid('get', `/${slug}`)).body.viewCount).toBe(1);
      expect((await alsLid('get', `/${slug}`)).body.viewCount).toBe(2);
    });

    it('bouwt een kruimelpad op', async () => {
      const ouder = await maakPagina({ slug: 'handboek', title: 'Handboek' });
      const kind = await maakPagina({ slug: 'hoofdstuk', title: 'Hoofdstuk', parentId: ouder.id });
      const kleinkind = await maakPagina({ slug: 'paragraaf', title: 'Paragraaf', parentId: kind.id });
      expect(kleinkind.id).toBeTruthy();

      const antwoord = await alsLid('get', '/paragraaf');
      expect(antwoord.body.breadcrumbs.map((b: { title: string }) => b.title)).toEqual(['Handboek', 'Hoofdstuk']);
    });
  });

  describe('bijwerken en versies', () => {
    it('werkt de inhoud bij en legt een nieuwe versie vast', async () => {
      const { slug } = await maakPagina();

      const antwoord = await alsBeheerder('patch', `/${slug}`).send({
        content: 'Nu anders.',
        changeSummary: 'Tekst verduidelijkt',
      });
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);

      expect((await alsLid('get', `/${slug}`)).body.content).toBe('Nu anders.');
      const versies = await alsBeheerder('get', `/${slug}/versions`);
      expect(versies.body).toHaveLength(2);
      expect(versies.body[0]).toMatchObject({ versionNumber: 2, changeSummary: 'Tekst verduidelijkt' });
    });

    it('legt geen nieuwe versie vast als alleen de zichtbaarheid verandert', async () => {
      const { slug } = await maakPagina();

      await alsBeheerder('patch', `/${slug}`).send({ visibility: 'committee' });

      expect((await alsBeheerder('get', `/${slug}/versions`)).body).toHaveLength(1);
    });

    it('haalt de inhoud van een oude versie op', async () => {
      const { slug } = await maakPagina({ content: 'Eerste tekst' });
      await alsBeheerder('patch', `/${slug}`).send({ content: 'Tweede tekst' });

      const versies = await alsBeheerder('get', `/${slug}/versions`);
      const eerste = versies.body.find((v: { versionNumber: number }) => v.versionNumber === 1);

      const antwoord = await alsBeheerder('get', `/${slug}/versions/${eerste.id}`);
      expect(antwoord.body.content).toBe('Eerste tekst');
    });

    it('zet een oude versie terug en legt dat vast als nieuwe versie', async () => {
      const { slug } = await maakPagina({ content: 'Eerste tekst' });
      await alsBeheerder('patch', `/${slug}`).send({ content: 'Tweede tekst' });

      const versies = await alsBeheerder('get', `/${slug}/versions`);
      const eerste = versies.body.find((v: { versionNumber: number }) => v.versionNumber === 1);

      const antwoord = await alsBeheerder('post', `/${slug}/versions/${eerste.id}/restore`);
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);

      expect((await alsBeheerder('get', `/${slug}`)).body.content).toBe('Eerste tekst');
      const na = await alsBeheerder('get', `/${slug}/versions`);
      expect(na.body).toHaveLength(3);
      expect(na.body[0].changeSummary).toContain('Restored from version 1');
    });

    it('geeft 404 voor een versie die niet bij deze pagina hoort', async () => {
      const { slug } = await maakPagina();
      const ander = await maakPagina({ slug: 'ander-stuk' });
      const versies = await alsBeheerder('get', `/${ander.slug}/versions`);

      expect((await alsBeheerder('get', `/${slug}/versions/${versies.body[0].id}`)).status).toBe(404);
    });

    it('werkt geen pagina van een andere vereniging bij', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const maker = createTestUser(andere.id, { email: `wiki3-${uuidv4()}@test.nl`, role: 'admin' });
      db.prepare(
        `INSERT INTO wiki_pages (id, association_id, slug, title, content, created_by)
         VALUES (?, ?, 'van-de-buren', 'Van de buren', 'x', ?)`,
      ).run(uuidv4(), andere.id, maker.id);

      expect((await alsBeheerder('patch', '/van-de-buren').send({ title: 'Gekaapt' })).status).toBe(404);
    });

    it('houdt een gewoon lid van het bijwerken af', async () => {
      const { slug } = await maakPagina();
      expect((await alsLid('patch', `/${slug}`).send({ content: 'x' })).status).toBe(403);
    });
  });

  describe('verwijderen', () => {
    it('markeert de pagina als verwijderd zonder de rij weg te gooien', async () => {
      const { id, slug } = await maakPagina();

      expect((await alsBeheerder('delete', `/${slug}`)).status).toBe(200);
      expect((await alsLid('get', `/${slug}`)).status).toBe(404);
      expect(db.prepare('SELECT id FROM wiki_pages WHERE id = ?').get(id)).toBeDefined();
    });

    it('verwijdert een pagina niet twee keer', async () => {
      const { slug } = await maakPagina();
      await alsBeheerder('delete', `/${slug}`);
      expect((await alsBeheerder('delete', `/${slug}`)).status).toBe(404);
    });

    it('laat de slug daarna weer vrij', async () => {
      const { slug } = await maakPagina();
      await alsBeheerder('delete', `/${slug}`);

      const opnieuw = await alsBeheerder('post', '/').send({ title: 'Nieuw', slug, content: 'x' });
      expect(opnieuw.status).toBe(201);
    });

    it('laat verwijderen alleen aan een beheerder over', async () => {
      const { slug } = await maakPagina();
      expect((await als(commissieToken, 'delete', `/${slug}`)).status).toBe(403);
    });
  });

  describe('bijlagen', () => {
    it('begint met een lege lijst', async () => {
      const { slug } = await maakPagina();
      const antwoord = await alsLid('get', `/${slug}/attachments`);
      expect(antwoord.status).toBe(200);
      expect(antwoord.body).toEqual([]);
    });

    it('toont een bijlage met een url', async () => {
      const { id, slug } = await maakPagina();
      db.prepare(
        `INSERT INTO wiki_attachments (id, page_id, file_path, file_name, mime_type, file_size, uploaded_by, created_at)
         VALUES (?, ?, 'abc.pdf', 'statuten.pdf', 'application/pdf', 1024, ?, CURRENT_TIMESTAMP)`,
      ).run(uuidv4(), id, beheerder.id);

      const antwoord = await alsLid('get', `/${slug}/attachments`);
      expect(antwoord.body).toHaveLength(1);
      expect(antwoord.body[0]).toMatchObject({
        originalFilename: 'statuten.pdf',
        mimeType: 'application/pdf',
        url: '/uploads/wiki/abc.pdf',
      });
    });

    it('weigert een upload zonder bestand', async () => {
      const { slug } = await maakPagina();
      expect((await alsBeheerder('post', `/${slug}/attachments`)).status).toBe(400);
    });

    it('geeft 404 voor een bijlage die niet bij deze pagina hoort', async () => {
      const { slug } = await maakPagina();
      expect((await alsBeheerder('delete', `/${slug}/attachments/${uuidv4()}`)).status).toBe(404);
    });
  });

  it('vraagt overal om een geldige aanmelding', async () => {
    expect(lid.id).toBeTruthy();
    expect((await request(app).get('/api/wiki')).status).toBe(401);
    expect((await request(app).get('/api/wiki/search?q=iets')).status).toBe(401);
  });
});
