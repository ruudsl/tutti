/**
 * Tests voor de berichten-api (nieuws, mededelingen, reacties).
 *
 * Berichten zijn het enige onderdeel waar de zichtbaarheid van de inhoud aan
 * de serverkant van de rol afhangt: een beheerder ziet concepten en geplande
 * berichten, een lid alleen wat gepubliceerd is. De frontend stuurt daarvoor
 * filters mee, en dat is precies waar het stil mis kan gaan. De server leest
 * `featured` en `pinned` als de letterlijke tekst 'true'; wie daar een boolean
 * heen stuurt krijgt in de queryreeks 'false' te zien - ook waar - en dus het
 * omgekeerde van wat de gebruiker aanvinkte. En wie een lege filter meestuurt
 * (`status=`) laat de server op een lege status filteren: nul berichten, geen
 * foutmelding.
 *
 * Verder legt dit bestand de padopbouw vast. `getPost` neemt zowel een id als
 * een slug; die twee komen op hetzelfde pad uit, en dat is bewust - de server
 * probeert eerst het een en dan het ander. De paden zijn vergeleken met
 * backend/src/routes/posts.ts, en elk pad dat deze module verstuurt wordt aan
 * het eind van dit bestand tegen die router aan gehouden.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { startNepserver, stopNepserver, antwoordMet, antwoordMetFout, laatsteVerzoek } from './nepserver';
import { serverroutes, serverBiedtAan } from './serverroutes';
import {
  getPostCategories,
  createPostCategory,
  updatePostCategory,
  deletePostCategory,
  getPosts,
  getPost,
  createPost,
  updatePost,
  deletePost,
  addPostComment,
  deletePostComment,
} from '../posts';

beforeEach(() => startNepserver());
afterEach(() => stopNepserver());

describe('rubrieken', () => {
  it('haalt de rubrieken op met hun aantal berichten', async () => {
    antwoordMet([
      { id: 'r1', name: 'Mededelingen', slug: 'mededelingen', sortOrder: 0, postCount: 12, createdAt: '2026-01-01' },
    ]);

    const rubrieken = await getPostCategories();

    expect(laatsteVerzoek().methode).toBe('get');
    expect(laatsteVerzoek().pad).toBe('/posts/categories');
    // postCount komt uit een subquery aan de serverkant; hij is niet af te
    // leiden uit de berichtenlijst, dus als hij hier wegvalt staat er nergens
    // een getal.
    expect(rubrieken[0].postCount).toBe(12);
  });

  it('maakt een rubriek aan op /posts/categories, niet op /post-categories', async () => {
    antwoordMet({ id: 'r9', message: 'Rubriek aangemaakt' });

    await createPostCategory({ name: 'Bestuur', slug: 'bestuur', color: '#336699' });

    expect(laatsteVerzoek().methode).toBe('post');
    expect(laatsteVerzoek().pad).toBe('/posts/categories');
    expect(laatsteVerzoek().body).toEqual({ name: 'Bestuur', slug: 'bestuur', color: '#336699' });
  });

  it('wijzigt een rubriek met PUT en verwijdert hem met DELETE', async () => {
    antwoordMet({ message: 'Bijgewerkt' });
    await updatePostCategory('r1', { name: 'Nieuws' });
    expect(laatsteVerzoek().methode).toBe('put');
    expect(laatsteVerzoek().pad).toBe('/posts/categories/r1');

    antwoordMet({ message: 'Verwijderd' });
    await deletePostCategory('r1');
    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/posts/categories/r1');
  });
});

describe('berichten ophalen', () => {
  it('stuurt geen queryreeks mee als er niets gefilterd wordt', async () => {
    antwoordMet([]);

    await getPosts();

    // Een `?status=` zou aan de serverkant waar zijn: hij zou op een lege
    // status filteren en niets teruggeven.
    expect(laatsteVerzoek().pad).toBe('/posts');
    expect(laatsteVerzoek().queryreeks).toBe('');
  });

  it('zet de vinkjes om naar de tekst "true" die de server vergelijkt', async () => {
    antwoordMet([]);

    await getPosts({ featured: true, pinned: true });

    // backend/src/routes/posts.ts doet `if (featured === 'true')`. Een
    // meegestuurde `featured=false` zou daar niet op aanslaan - maar
    // `featured=1` of `featured=yes` ook niet, en dat zou hier stil blijven.
    expect(laatsteVerzoek().query.get('featured')).toBe('true');
    expect(laatsteVerzoek().query.get('pinned')).toBe('true');
  });

  it('laat uitgevinkte vinkjes helemaal weg in plaats van "false" te sturen', async () => {
    antwoordMet([]);

    await getPosts({ featured: false, pinned: false, status: 'draft' });

    expect(laatsteVerzoek().query.has('featured')).toBe(false);
    expect(laatsteVerzoek().query.has('pinned')).toBe(false);
    expect(laatsteVerzoek().query.get('status')).toBe('draft');
  });

  it('filtert op rubriek met het id van de rubriek, niet met de slug', async () => {
    antwoordMet([]);

    await getPosts({ category: 'r1', status: 'published' });

    // De server zoekt met dit id in post_category_mapping. Een slug zou daar
    // op niets aanslaan: nul berichten, en dat leest als "deze rubriek is
    // leeg" in plaats van "je zoekt met het verkeerde kenmerk".
    expect(laatsteVerzoek().query.get('category')).toBe('r1');
    expect(laatsteVerzoek().query.get('status')).toBe('published');
  });

  it('zet alle vijf de filters tegelijk in één queryreeks', async () => {
    antwoordMet([]);

    await getPosts({ status: 'draft', category: 'r1', search: 'bus', featured: true, pinned: true });

    const query = laatsteVerzoek().query;
    expect([...query.keys()].sort()).toEqual(['category', 'featured', 'pinned', 'search', 'status']);
  });

  it('codeert een zoekterm met spaties en accenten, zodat de server hem heel binnenkrijgt', async () => {
    antwoordMet([]);

    await getPosts({ search: 'Jaarvergadering & café' });

    // Het gaat hier om wat er over de lijn gaat: de ampersand mag de
    // queryreeks niet in tweeën knippen.
    expect(laatsteVerzoek().queryreeks).toContain('search=Jaarvergadering+%26+caf%C3%A9');
    expect(laatsteVerzoek().query.get('search')).toBe('Jaarvergadering & café');
  });

  it('haalt een bericht op zijn slug op hetzelfde pad op als op zijn id', async () => {
    antwoordMet({ id: 'b1', slug: 'jaarvergadering', title: 'Jaarvergadering', comments: [] });
    await getPost('jaarvergadering');
    expect(laatsteVerzoek().pad).toBe('/posts/jaarvergadering');

    antwoordMet({ id: 'b1', slug: 'jaarvergadering', title: 'Jaarvergadering', comments: [] });
    await getPost('b1');
    expect(laatsteVerzoek().pad).toBe('/posts/b1');
  });

  it('geeft de reacties bij een bericht door zoals de server ze levert', async () => {
    antwoordMet({
      id: 'b1',
      title: 'Jaarvergadering',
      content: 'Kom allen.',
      contentFormat: 'markdown',
      comments: [
        {
          id: 'rc1',
          content: 'Ik ben er.',
          authorId: 'g1',
          authorName: 'Anna de Groot',
          isApproved: true,
          createdAt: '2026-08-01T10:00:00.000Z',
          updatedAt: '2026-08-01T10:00:00.000Z',
        },
      ],
    });

    const bericht = await getPost('b1');

    expect(bericht.comments).toHaveLength(1);
    expect(bericht.comments[0].authorName).toBe('Anna de Groot');
  });

  it('laat een 403 door in plaats van hem als leeg bericht te verpakken', async () => {
    // De server weigert een bericht dat op een ander orkest of een andere rol
    // gericht is. Zou de api-laag dat wegslikken, dan zag de lezer een lege
    // pagina in plaats van te horen dat het niet voor hem bestemd is.
    antwoordMetFout(403, { error: 'Je hebt geen toegang tot dit bericht.' });

    await expect(getPost('b1')).rejects.toMatchObject({ response: { status: 403 } });
  });
});

describe('berichten schrijven', () => {
  it('stuurt de doelgroepen als lijsten mee, niet als tekst', async () => {
    antwoordMet({ id: 'b9', slug: 'nieuw', message: 'Aangemaakt' });

    await createPost({
      title: 'Alleen voor het A-orkest',
      content: 'Tekst.',
      targetOrchestras: ['ork-1'],
      targetRoles: ['conductor'],
      categoryIds: ['r1', 'r2'],
    });

    // De server valideert deze drie met z.array(...). Een komma-gescheiden
    // tekst zou hier een 400 opleveren, geen stille fout - maar wel eentje die
    // zonder test pas bij de eerste gebruiker opduikt.
    expect(laatsteVerzoek().body).toMatchObject({
      targetOrchestras: ['ork-1'],
      targetRoles: ['conductor'],
      categoryIds: ['r1', 'r2'],
    });
  });

  it('wijzigt een bericht met PUT op zijn id, niet op zijn slug-pad', async () => {
    antwoordMet({ message: 'Bijgewerkt' });

    await updatePost('b1', { status: 'published' });

    expect(laatsteVerzoek().methode).toBe('put');
    expect(laatsteVerzoek().pad).toBe('/posts/b1');
    expect(laatsteVerzoek().body).toEqual({ status: 'published' });
  });

  it('verwijdert een bericht', async () => {
    antwoordMet({ message: 'Verwijderd' });

    await deletePost('b1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/posts/b1');
  });
});

describe('reacties', () => {
  it('plaatst een reactie onder het bericht en geeft de nieuwe reactie terug', async () => {
    antwoordMet(
      {
        id: 'rc9',
        content: 'Ik kom ook.',
        authorId: 'g2',
        authorName: 'Bram Jansen',
        createdAt: '2026-08-02T12:00:00.000Z',
        message: 'Reactie geplaatst.',
      },
      { status: 201 },
    );

    const reactie = await addPostComment('b1', { content: 'Ik kom ook.' });

    expect(laatsteVerzoek().methode).toBe('post');
    expect(laatsteVerzoek().pad).toBe('/posts/b1/comments');
    expect(laatsteVerzoek().body).toEqual({ content: 'Ik kom ook.' });
    // 201 is een gewoon antwoord, geen fout: de aanroeper moet de reactie
    // terugkrijgen om hem meteen in de lijst te kunnen zetten.
    expect(reactie.id).toBe('rc9');
    expect(reactie.authorName).toBe('Bram Jansen');
  });

  it('stuurt bij een antwoord op een reactie de parentId mee', async () => {
    antwoordMet({ id: 'rc10', message: 'Reactie geplaatst.' }, { status: 201 });

    await addPostComment('b1', { content: 'Klopt.', parentId: 'rc9' });

    expect(laatsteVerzoek().body).toEqual({ content: 'Klopt.', parentId: 'rc9' });
  });

  it('verwijdert een reactie via het bericht waar hij onder hangt', async () => {
    antwoordMet({ message: 'Verwijderd' });

    await deletePostComment('b1', 'rc9');

    // De server zoekt de reactie op post_id én id samen. Een pad
    // /posts/comments/rc9 zou geen route raken.
    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/posts/b1/comments/rc9');
  });
});

describe('de paden komen overeen met wat de server aanbiedt', () => {
  const routes = serverroutes('posts.ts');

  const aanroepen: [string, () => Promise<unknown>][] = [
    ['getPostCategories', () => getPostCategories()],
    ['createPostCategory', () => createPostCategory({ name: 'X', slug: 'x' })],
    ['updatePostCategory', () => updatePostCategory('r1', {})],
    ['deletePostCategory', () => deletePostCategory('r1')],
    ['getPosts', () => getPosts()],
    ['getPost', () => getPost('b1')],
    ['createPost', () => createPost({ title: 'X', content: 'y' })],
    ['updatePost', () => updatePost('b1', {})],
    ['deletePost', () => deletePost('b1')],
    ['addPostComment', () => addPostComment('b1', { content: 'x' })],
    ['deletePostComment', () => deletePostComment('b1', 'rc1')],
  ];

  it.each(aanroepen)('%s raakt een bestaande route in backend/src/routes/posts.ts', async (_naam, aanroep) => {
    antwoordMet({});
    await aanroep().catch(() => undefined);
    const { methode, pad } = laatsteVerzoek();

    expect(serverBiedtAan(routes, '/posts', methode, pad)).toBe(true);
  });

  it('let op de valstrik dat /posts/categories niet als /posts/:idOrSlug gelezen wordt', () => {
    // In Express wint de eerst geregistreerde route. `/categories` staat in de
    // router boven `/:idOrSlug`, dus een GET op /posts/categories komt bij de
    // rubrieken uit. Zou iemand die volgorde omdraaien, dan gaf de rubriekenlijst
    // stilzwijgend een bericht terug in plaats van een lijst.
    const paden = routes.filter((r) => r.methode === 'get').map((r) => r.patroon);

    expect(paden.indexOf('/categories')).toBeLessThan(paden.indexOf('/:idOrSlug'));
  });
});
