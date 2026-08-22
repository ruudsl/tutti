/**
 * Tests voor het ledengedeelte van src/api.ts.
 *
 * Deze functies zijn de enige in het bestand die de meegegeven filters niet
 * ongewijzigd doorgeven maar er zelf iets aan rekenen. Juist daar zit ruimte
 * voor fouten die niet opvallen: een verkeerde parameternaam of een begrenzing
 * die niets doet levert geen foutmelding op, alleen een verkeerd aantal rijen.
 *
 * De routes en parameternamen zijn vergeleken met backend/src/routes/users.ts.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { startNepserver, stopNepserver, antwoordMet, antwoordMetFout, laatsteVerzoek } from './nepserver-api';
import {
  getUsers,
  getUsersPaginated,
  getUser,
  createUser,
  updateUser,
  deleteUser,
  getMemberDirectory,
  exportUserData,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from '../api';

beforeEach(() => startNepserver());
afterEach(() => stopNepserver());

/** Antwoord zoals createPaginatedResult() in de backend het opbouwt. */
function paginaAntwoord(rijen: unknown[], opties: { total?: number; page?: number; limit?: number } = {}) {
  const total = opties.total ?? rijen.length;
  const limit = opties.limit ?? 25;
  return {
    data: rijen,
    pagination: {
      page: opties.page ?? 1,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNext: (opties.page ?? 1) * limit < total,
      hasPrev: (opties.page ?? 1) > 1,
    },
  };
}

describe('getUsers', () => {
  it('vraagt zonder filters alle leden op met een hoge bovengrens', async () => {
    antwoordMet(paginaAntwoord([{ id: 'u1' }]));
    await getUsers();

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('get');
    expect(verzoek.pad).toBe('/users');
    expect(verzoek.query.get('limit')).toBe('1000');
  });

  // De backend leest de paginagrootte uit `limit`, niet uit `pageSize`
  // (backend/src/routes/users.ts, GET '/'). Zonder limit valt hij terug op 25
  // rijen. getUsers belooft juist "alle leden", dus een verzoek met alleen
  // pageSize levert een stilzwijgend afgekapte lijst op: een beheerder die op
  // "jan" zoekt in een vereniging met tachtig Jannen ziet er 25.
  it('stuurt ook mét filters een limit mee, anders kapt de server af op 25', async () => {
    antwoordMet(paginaAntwoord([]));
    await getUsers({ search: 'jan' });

    const verzoek = laatsteVerzoek();
    expect(verzoek.query.get('search')).toBe('jan');
    expect(verzoek.query.get('limit')).toBe('1000');
  });

  it('haalt de rijen uit de omhulling van de server', async () => {
    antwoordMet(paginaAntwoord([{ id: 'u1' }, { id: 'u2' }]));

    await expect(getUsers()).resolves.toEqual([{ id: 'u1' }, { id: 'u2' }]);
  });

  it('geeft een kale lijst ongewijzigd door', async () => {
    antwoordMet([{ id: 'u1' }]);

    await expect(getUsers()).resolves.toEqual([{ id: 'u1' }]);
  });

  it('levert een lege lijst als de server een omhulling zonder data stuurt', async () => {
    antwoordMet({ pagination: { page: 1, limit: 25, total: 0, totalPages: 0 } });

    await expect(getUsers()).resolves.toEqual([]);
  });

  it('laat een 403 door in plaats van hem als lege ledenlijst te verpakken', async () => {
    antwoordMetFout(403, { error: 'Onvoldoende rechten' });

    await expect(getUsers()).rejects.toMatchObject({ response: { status: 403 } });
  });
});

describe('getUsersPaginated', () => {
  // Dit was de fout: de params werden opgebouwd als
  //
  //   { page: ..., pageSize: Math.min(filters?.pageSize || 50, 100), ...filters }
  //
  // met `...filters` ACHTERAAN. De spread overschreef de zojuist berekende
  // page en pageSize weer met de onbewerkte invoer, dus de begrenzing op
  // MAX_PAGE_SIZE deed niets. pageSize 5000 ging ongehinderd naar de server.
  //
  // Wat de gebruiker daarvan merkt: een scherm dat om 5000 rijen vraagt haalt
  // die ook binnen (de backend staat tot 1000 toe), en de bovengrens die er
  // juist voor moest zorgen dat de ledenlijst in stukjes binnenkomt bestaat
  // alleen op papier.
  it('begrenst de paginagrootte op MAX_PAGE_SIZE', async () => {
    antwoordMet(paginaAntwoord([]));
    await getUsersPaginated({ pageSize: 5000 });

    const verzoek = laatsteVerzoek();
    expect(verzoek.queryreeks).not.toContain('5000');
    expect(Number(verzoek.query.get('limit'))).toBe(MAX_PAGE_SIZE);
  });

  // Zelfde fout, andere kant op: `...filters` overschreef ook de standaardpagina.
  it('laat een expliciete pagina staan en vult anders 1 in', async () => {
    antwoordMet(paginaAntwoord([]));
    await getUsersPaginated({ page: 3 });
    expect(laatsteVerzoek().query.get('page')).toBe('3');

    antwoordMet(paginaAntwoord([]));
    await getUsersPaginated();
    expect(laatsteVerzoek().query.get('page')).toBe('1');
  });

  it('valt terug op DEFAULT_PAGE_SIZE als er geen paginagrootte is opgegeven', async () => {
    antwoordMet(paginaAntwoord([]));
    await getUsersPaginated();

    expect(Number(laatsteVerzoek().query.get('limit'))).toBe(DEFAULT_PAGE_SIZE);
  });

  // De backend kent `pageSize` niet. Stuur je alleen die naam mee, dan valt hij
  // terug op 25 rijen en heeft de hele berekening hierboven geen effect.
  it('stuurt de paginagrootte als limit, want die naam leest de server', async () => {
    antwoordMet(paginaAntwoord([]));
    await getUsersPaginated({ pageSize: 20 });

    const verzoek = laatsteVerzoek();
    expect(verzoek.query.get('limit')).toBe('20');
    expect(verzoek.query.has('pageSize')).toBe(false);
  });

  it('geeft de overige filters ongewijzigd mee', async () => {
    antwoordMet(paginaAntwoord([]));
    await getUsersPaginated({ page: 2, pageSize: 10, search: 'de Vries', role: 'admin', orchestraId: 'o1' });

    const verzoek = laatsteVerzoek();
    expect(verzoek.query.get('search')).toBe('de Vries');
    expect(verzoek.query.get('role')).toBe('admin');
    expect(verzoek.query.get('orchestraId')).toBe('o1');
  });

  // De backend antwoordt met { data, pagination: {...} } (createPaginatedResult
  // in backend/src/utils/database.ts), maar het beloofde type is plat:
  // { data, total, page, pageSize, totalPages }. Zonder omzetting blijven die
  // velden undefined. useUsersInfinite rekent met lastPage.page + 1 en
  // lastPage.totalPages, dus dan komt er nooit een tweede pagina.
  it('zet de omhulling van de server om naar het platte paginatype', async () => {
    antwoordMet(paginaAntwoord([{ id: 'u1' }], { total: 130, page: 2, limit: 50 }));

    const resultaat = await getUsersPaginated({ page: 2, pageSize: 50 });

    expect(resultaat.data).toEqual([{ id: 'u1' }]);
    expect(resultaat.total).toBe(130);
    expect(resultaat.page).toBe(2);
    expect(resultaat.pageSize).toBe(50);
    expect(resultaat.totalPages).toBe(3);
  });

  // De backend kan in theorie ook al een plat paginaobject sturen (dat doet hij
  // bijvoorbeeld wel op /audit-logs). Dan mag er niets omgezet worden, anders
  // zouden de velden juist verdwijnen.
  it('laat een antwoord dat al plat is ongewijzigd', async () => {
    const plat = { data: [{ id: 'u1' }], total: 1, page: 1, pageSize: 50, totalPages: 1 };
    antwoordMet(plat);

    await expect(getUsersPaginated()).resolves.toEqual(plat);
  });

  it('maakt van een kale lijst een pagina van één', async () => {
    antwoordMet([{ id: 'u1' }, { id: 'u2' }]);

    await expect(getUsersPaginated()).resolves.toEqual({
      data: [{ id: 'u1' }, { id: 'u2' }],
      total: 2,
      page: 1,
      pageSize: 2,
      totalPages: 1,
    });
  });
});

describe('losse ledenroutes', () => {
  it('getUser haalt één lid op', async () => {
    antwoordMet({ id: 'u1' });
    await getUser('u1');

    expect(laatsteVerzoek().methode).toBe('get');
    expect(laatsteVerzoek().pad).toBe('/users/u1');
  });

  it('createUser stuurt de invoer als body naar POST /users', async () => {
    antwoordMet({ id: 'u9' });
    await createUser({
      email: 'jan@example.com',
      password: 'geheim-genoeg',
      firstName: 'Jan',
      lastName: 'Jansen',
      role: 'member',
      instrumentIds: ['i1'],
      orchestraIds: ['o1'],
    });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/users');
    expect(verzoek.body).toEqual({
      email: 'jan@example.com',
      password: 'geheim-genoeg',
      firstName: 'Jan',
      lastName: 'Jansen',
      role: 'member',
      instrumentIds: ['i1'],
      orchestraIds: ['o1'],
    });
  });

  it('updateUser gebruikt PUT met het id in het pad', async () => {
    antwoordMet({});
    await updateUser('u1', { firstName: 'Janneke' });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('put');
    expect(verzoek.pad).toBe('/users/u1');
    expect(verzoek.body).toEqual({ firstName: 'Janneke' });
  });

  it('deleteUser gebruikt DELETE en stuurt geen body', async () => {
    antwoordMet({});
    await deleteUser('u1');

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('delete');
    expect(verzoek.pad).toBe('/users/u1');
    expect(verzoek.body).toBeUndefined();
  });

  it('getMemberDirectory zet de filters in de queryreeks van het smoelenboek', async () => {
    antwoordMet([]);
    await getMemberDirectory({ orchestraId: 'o1', instrumentId: 'i2', search: 'de Vries' });

    const verzoek = laatsteVerzoek();
    expect(verzoek.pad).toBe('/users/directory');
    expect(verzoek.query.get('orchestraId')).toBe('o1');
    expect(verzoek.query.get('instrumentId')).toBe('i2');
    // Een spatie hoort als %20 of + gecodeerd te worden, niet letterlijk.
    expect(verzoek.queryreeks).not.toContain('de Vries');
    expect(verzoek.query.get('search')).toBe('de Vries');
  });

  it('exportUserData vraagt de AVG-export als blob op', async () => {
    antwoordMet(new Blob(['{}']));
    await exportUserData();

    const verzoek = laatsteVerzoek();
    expect(verzoek.pad).toBe('/users/export-data');
    expect(verzoek.responseType).toBe('blob');
  });
});
