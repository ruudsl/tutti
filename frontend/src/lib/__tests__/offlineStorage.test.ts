/**
 * Tests voor de IndexedDB-laag van de offline opslag.
 *
 * jsdom heeft geen IndexedDB en `fake-indexeddb` staat niet in package.json,
 * daarom mocken we de `idb`-module met een in-memory nabootsing. Die nabootsing
 * volgt bewust de scherpe kanten van echte IndexedDB, want juist daar gaan
 * gegevens stilletjes verloren:
 *   - `getAll` levert op sleutelvolgorde, niet op invoegvolgorde;
 *   - een autoIncrement-store schrijft de gegenereerde sleutel terug in het
 *     record (zonder dat kun je een record nooit meer gericht verwijderen);
 *   - een index slaat records met een lege indexsleutel over;
 *   - gegevens overleven het sluiten van de verbinding (browser dicht, tab weg).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const idbFake = vi.hoisted(() => {
  interface FakeStore {
    keyPath?: string;
    autoIncrement: boolean;
    indexes: Map<string, string>;
    data: Map<unknown, Record<string, unknown>>;
    nextKey: number;
  }

  interface FakeDatabase {
    version: number;
    stores: Map<string, FakeStore>;
  }

  // Blijft staan tussen open/close door: dit ís de schijf van de browser.
  const databases = new Map<string, FakeDatabase>();
  const quotaExceeded = new Set<string>();
  let openCount = 0;

  function compareKeys(a: unknown, b: unknown): number {
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
  }

  function sortedValues(store: FakeStore): Record<string, unknown>[] {
    return [...store.data.entries()].sort((a, b) => compareKeys(a[0], b[0])).map(([, value]) => structuredClone(value));
  }

  function writeRecord(name: string, store: FakeStore, value: Record<string, unknown>, mustBeNew: boolean) {
    if (quotaExceeded.has(name)) {
      const error = new Error('The quota has been exceeded.');
      error.name = 'QuotaExceededError';
      throw error;
    }
    const record = structuredClone(value);
    let key = store.keyPath ? record[store.keyPath] : undefined;
    if (key === undefined && store.autoIncrement) {
      key = store.nextKey++;
      if (store.keyPath) record[store.keyPath] = key;
    }
    if (key === undefined) {
      throw new Error(`Geen sleutel voor store ${name}`);
    }
    if (mustBeNew && store.data.has(key)) {
      const error = new Error('Key already exists in the object store.');
      error.name = 'ConstraintError';
      throw error;
    }
    store.data.set(key, record);
    return key;
  }

  function storeOf(db: FakeDatabase, name: string): FakeStore {
    const store = db.stores.get(name);
    if (!store) throw new Error(`Onbekende store: ${name}`);
    return store;
  }

  async function openDB(name: string, version: number, options: Record<string, any> = {}) {
    openCount++;
    let db = databases.get(name);
    const isNew = !db;
    if (!db) {
      db = { version, stores: new Map() };
      databases.set(name, db);
    }

    if (isNew && options.upgrade) {
      const upgradeHandle = {
        objectStoreNames: { contains: (storeName: string) => db!.stores.has(storeName) },
        createObjectStore: (storeName: string, opts: { keyPath?: string; autoIncrement?: boolean } = {}) => {
          const store: FakeStore = {
            keyPath: opts.keyPath,
            autoIncrement: Boolean(opts.autoIncrement),
            indexes: new Map(),
            data: new Map(),
            nextKey: 1,
          };
          db!.stores.set(storeName, store);
          return {
            createIndex: (indexName: string, keyPath: string) => store.indexes.set(indexName, keyPath),
          };
        },
      };
      options.upgrade(upgradeHandle, 0, version, {});
    }

    const handle = {
      async get(storeName: string, key: unknown) {
        const found = storeOf(db!, storeName).data.get(key);
        return found === undefined ? undefined : structuredClone(found);
      },
      async getAll(storeName: string) {
        return sortedValues(storeOf(db!, storeName));
      },
      async getAllFromIndex(storeName: string, indexName: string, value: unknown) {
        const store = storeOf(db!, storeName);
        const keyPath = store.indexes.get(indexName);
        if (!keyPath) throw new Error(`Onbekende index: ${indexName}`);
        // Echte IndexedDB indexeert records met een lege sleutel niet: die zijn
        // via de index onvindbaar, ook als je expliciet op null zoekt.
        return sortedValues(store).filter((record) => {
          const indexKey = record[keyPath];
          return indexKey !== undefined && indexKey !== null && indexKey === value;
        });
      },
      async put(storeName: string, value: Record<string, unknown>) {
        return writeRecord(storeName, storeOf(db!, storeName), value, false);
      },
      async add(storeName: string, value: Record<string, unknown>) {
        return writeRecord(storeName, storeOf(db!, storeName), value, true);
      },
      async delete(storeName: string, key: unknown) {
        storeOf(db!, storeName).data.delete(key);
      },
      async clear(storeName: string) {
        storeOf(db!, storeName).data.clear();
      },
      async count(storeName: string) {
        return storeOf(db!, storeName).data.size;
      },
      transaction(storeName: string, _mode: string) {
        const store = storeOf(db!, storeName);
        return {
          store: {
            put: async (value: Record<string, unknown>) => writeRecord(storeName, store, value, false),
            add: async (value: Record<string, unknown>) => writeRecord(storeName, store, value, true),
            clear: async () => store.data.clear(),
            delete: async (key: unknown) => store.data.delete(key),
            get: async (key: unknown) => structuredClone(store.data.get(key)),
            getAll: async () => sortedValues(store),
          },
          done: Promise.resolve(),
        };
      },
      close() {
        /* verbinding dicht; de gegevens blijven in `databases` staan */
      },
    };

    return handle;
  }

  return {
    openDB,
    reset() {
      databases.clear();
      quotaExceeded.clear();
      openCount = 0;
    },
    failWritesTo(storeName: string) {
      quotaExceeded.add(storeName);
    },
    allowWritesTo(storeName: string) {
      quotaExceeded.delete(storeName);
    },
    getOpenCount: () => openCount,
    rawStore(dbName: string, storeName: string) {
      return databases.get(dbName)?.stores.get(storeName);
    },
  };
});

vi.mock('idb', () => ({ openDB: idbFake.openDB }));

import * as storage from '../offlineStorage';
import type { MusicPiece, MusicTitle, Rehearsal, User } from '../../types';

const piece = (overrides: Partial<MusicPiece> = {}): MusicPiece => ({
  id: 'p1',
  title: 'Also sprach Zarathustra',
  arranger: 'De Haan',
  tuning: 'Bb',
  groupNumber: '1',
  clef: 'treble',
  youtubeUrl: null,
  originalFilename: 'zarathustra.pdf',
  instrumentId: 'i-klarinet',
  instrumentName: 'Klarinet',
  orchestraName: 'Harmonie A',
  ...overrides,
});

const rehearsal = (overrides: Partial<Rehearsal> = {}): Rehearsal => ({
  id: 'r1',
  date: '2026-03-10',
  start_time: '20:00',
  end_time: '22:00',
  location: 'Dorpshuis',
  type: 'regular',
  notes: null,
  orchestra_id: 'o1',
  orchestra_name: 'Harmonie A',
  spond_event_id: null,
  created_by: null,
  created_by_name: null,
  piece_count: 0,
  accepted_count: 0,
  declined_count: 0,
  ...overrides,
});

const user = (overrides: Partial<User> = {}): User => ({
  id: 'u1',
  email: 'lid@vereniging-a.nl',
  firstName: 'Jan',
  lastName: 'Jansen',
  role: 'member',
  associationId: 'vereniging-a',
  associationName: 'Vereniging A',
  ...overrides,
});

beforeEach(async () => {
  await storage.closeDB();
  idbFake.reset();
  vi.restoreAllMocks();
});

afterEach(async () => {
  vi.useRealTimers();
  await storage.closeDB();
});

// =============================================================================
// Verbinding
// =============================================================================

describe('getDB', () => {
  it('opent de database maar één keer en hergebruikt de verbinding', async () => {
    await storage.getDB();
    await storage.getDB();
    await storage.getDB();

    expect(idbFake.getOpenCount()).toBe(1);
  });

  it('opent opnieuw nadat de verbinding is gesloten', async () => {
    await storage.getDB();
    await storage.closeDB();
    await storage.getDB();

    expect(idbFake.getOpenCount()).toBe(2);
  });

  it('maakt alle stores aan die de app verwacht', async () => {
    await storage.getDB();

    for (const naam of [
      'userProfile',
      'musicPieces',
      'musicTitles',
      'orchestras',
      'instruments',
      'genres',
      'favorites',
      'recentViews',
      'rehearsals',
      'syncMetadata',
      'pendingMutations',
    ]) {
      expect(idbFake.rawStore('harmonie-offline', naam), `store ${naam} ontbreekt`).toBeDefined();
    }
  });
});

// =============================================================================
// Schrijven en teruglezen
// =============================================================================

describe('gebruikersprofiel', () => {
  it('leest exact terug wat er is opgeslagen', async () => {
    const profiel = user();
    await storage.saveUserProfile(profiel);

    expect(await storage.getUserProfile()).toEqual(profiel);
  });

  it('geeft undefined terug als er nog niets is opgeslagen', async () => {
    expect(await storage.getUserProfile()).toBeUndefined();
  });

  it('overschrijft het bestaande profiel in plaats van het te stapelen', async () => {
    await storage.saveUserProfile(user({ firstName: 'Jan' }));
    await storage.saveUserProfile(user({ firstName: 'Piet' }));

    const db = await storage.getDB();
    expect(await db.count('userProfile')).toBe(1);
    expect((await storage.getUserProfile())?.firstName).toBe('Piet');
  });

  it('houdt profielen van verschillende gebruikers naast elkaar, maar levert er willekeurig één terug', async () => {
    // getUserProfile pakt `users[0]`: bij twee gebruikers in dezelfde browser
    // hangt het van de sleutelvolgorde af wie je terugkrijgt. Vandaar dat
    // clearUserProfile/clearAllData bij uitloggen onmisbaar is.
    await storage.saveUserProfile(user({ id: 'u-a', associationId: 'vereniging-a' }));
    await storage.saveUserProfile(user({ id: 'u-b', associationId: 'vereniging-b' }));

    const db = await storage.getDB();
    expect(await db.count('userProfile')).toBe(2);
    expect((await storage.getUserProfile())?.id).toBe('u-a');
  });

  it('laat na clearUserProfile niets achter', async () => {
    await storage.saveUserProfile(user());
    await storage.clearUserProfile();

    expect(await storage.getUserProfile()).toBeUndefined();
  });
});

describe('muziekstukken', () => {
  it('slaat op met een cachedAt-stempel en leest de velden ongewijzigd terug', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T10:00:00.000Z'));

    await storage.saveMusicPieces([piece()]);

    const opgeslagen = (await storage.getMusicPiece('p1')) as MusicPiece & { cachedAt: string };
    expect(opgeslagen).toMatchObject(piece());
    expect(opgeslagen.cachedAt).toBe('2026-01-15T10:00:00.000Z');
  });

  it('overschrijft een bestaand stuk en ververst het cachedAt-stempel', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T10:00:00.000Z'));
    await storage.saveMusicPieces([piece({ title: 'Oude titel' })]);

    vi.setSystemTime(new Date('2026-02-20T10:00:00.000Z'));
    await storage.saveMusicPieces([piece({ title: 'Nieuwe titel' })]);

    const db = await storage.getDB();
    expect(await db.count('musicPieces')).toBe(1);
    const opgeslagen = (await storage.getMusicPiece('p1')) as MusicPiece & { cachedAt: string };
    expect(opgeslagen.title).toBe('Nieuwe titel');
    expect(opgeslagen.cachedAt).toBe('2026-02-20T10:00:00.000Z');
  });

  it('vervangt niet de hele store: bestaande stukken blijven staan', async () => {
    await storage.saveMusicPieces([piece({ id: 'p1' })]);
    await storage.saveMusicPieces([piece({ id: 'p2' })]);

    expect((await storage.getMusicPieces()).map((p) => p.id)).toEqual(['p1', 'p2']);
  });

  it('slaat een lege lijst op zonder de bestaande inhoud te wissen', async () => {
    await storage.saveMusicPieces([piece()]);
    await storage.saveMusicPieces([]);

    expect(await storage.getMusicPieces()).toHaveLength(1);
  });

  it('geeft undefined bij een onbekende sleutel in plaats van te struikelen', async () => {
    await storage.saveMusicPieces([piece()]);

    expect(await storage.getMusicPiece('bestaat-niet')).toBeUndefined();
  });

  it('filtert op instrument via de index', async () => {
    await storage.saveMusicPieces([
      piece({ id: 'p1', instrumentId: 'i-klarinet' }),
      piece({ id: 'p2', instrumentId: 'i-trompet' }),
    ]);

    const gevonden = await storage.getMusicPieces({ instrumentId: 'i-trompet' });
    expect(gevonden.map((p) => p.id)).toEqual(['p2']);
  });

  it('vindt stukken zonder instrument niet terug via de instrument-index', async () => {
    // instrumentId is nullable; zulke records staan niet in de index. Filteren op
    // instrument mag daar niet op stukklappen, het levert simpelweg niets op.
    await storage.saveMusicPieces([piece({ id: 'p1', instrumentId: null })]);

    expect(await storage.getMusicPieces({ instrumentId: 'i-klarinet' })).toEqual([]);
  });

  it('zoekt hoofdletterongevoelig in titel, arrangeur en instrument', async () => {
    await storage.saveMusicPieces([
      piece({ id: 'p1', title: 'Zarathustra', arranger: 'De Haan', instrumentName: 'Klarinet' }),
      piece({ id: 'p2', title: 'Bolero', arranger: 'Ravel', instrumentName: 'Trompet' }),
    ]);

    expect((await storage.getMusicPieces({ search: 'ZARA' })).map((p) => p.id)).toEqual(['p1']);
    expect((await storage.getMusicPieces({ search: 'ravel' })).map((p) => p.id)).toEqual(['p2']);
    expect((await storage.getMusicPieces({ search: 'trompet' })).map((p) => p.id)).toEqual(['p2']);
  });

  it('struikelt niet over stukken zonder arrangeur of instrumentnaam', async () => {
    await storage.saveMusicPieces([piece({ id: 'p1', arranger: null, instrumentName: null, title: 'Bolero' })]);

    expect(await storage.getMusicPieces({ search: 'xyz' })).toEqual([]);
    expect((await storage.getMusicPieces({ search: 'bolero' })).map((p) => p.id)).toEqual(['p1']);
  });

  it('combineert het instrumentfilter met het zoekfilter', async () => {
    await storage.saveMusicPieces([
      piece({ id: 'p1', instrumentId: 'i-klarinet', title: 'Bolero' }),
      piece({ id: 'p2', instrumentId: 'i-klarinet', title: 'Zarathustra' }),
      piece({ id: 'p3', instrumentId: 'i-trompet', title: 'Bolero' }),
    ]);

    const gevonden = await storage.getMusicPieces({ instrumentId: 'i-klarinet', search: 'bolero' });
    expect(gevonden.map((p) => p.id)).toEqual(['p1']);
  });

  it('levert bij filteren op orchestraId niets op, omdat er tegen orchestraName wordt vergeleken', async () => {
    // BEKEND MANKEMENT: MusicPiece heeft geen orchestraId-veld; de filter
    // vergelijkt een id met een naam. Offline filteren op orkest geeft dus een
    // lege lijst terwijl online (waar de API het filter negeert) alles terugkomt.
    await storage.saveMusicPieces([piece({ id: 'p1', orchestraName: 'Harmonie A' })]);

    expect(await storage.getMusicPieces({ orchestraId: 'o1' })).toEqual([]);
    expect(await storage.getMusicPieces({ orchestraId: 'Harmonie A' })).toHaveLength(1);
  });

  it('wist alle stukken met clearMusicPieces', async () => {
    await storage.saveMusicPieces([piece({ id: 'p1' }), piece({ id: 'p2' })]);
    await storage.clearMusicPieces();

    expect(await storage.getMusicPieces()).toEqual([]);
  });
});

describe('muziektitels', () => {
  const titel = (overrides: Partial<MusicTitle> = {}): MusicTitle => ({
    id: 't1',
    title: 'Bolero',
    arranger: 'Ravel',
    pieceCount: 3,
    youtubeUrl: null,
    description: null,
    durationSeconds: 900,
    instruments: [],
    ...overrides,
  });

  it('leest opgeslagen titels ongewijzigd terug', async () => {
    await storage.saveMusicTitles([titel()]);

    expect(await storage.getMusicTitles()).toMatchObject([titel()]);
  });

  it('gebruikt de titeltekst als sleutel wanneer er geen id is', async () => {
    await storage.saveMusicTitles([titel({ id: undefined, title: 'Zonder id' })]);

    const db = await storage.getDB();
    expect(await db.get('musicTitles', 'Zonder id')).toBeDefined();
  });

  it('laat twee id-loze titels met dezelfde naam elkaar overschrijven', async () => {
    // BEKEND MANKEMENT: de terugvalsleutel is de titeltekst, dus twee
    // verschillende arrangementen van hetzelfde stuk verdringen elkaar offline.
    await storage.saveMusicTitles([
      titel({ id: undefined, title: 'Bolero', arranger: 'Ravel' }),
      titel({ id: undefined, title: 'Bolero', arranger: 'De Haan' }),
    ]);

    const titels = await storage.getMusicTitles();
    expect(titels).toHaveLength(1);
    expect(titels[0].arranger).toBe('De Haan');
  });

  it('filtert op zoekterm in titel en arrangeur', async () => {
    await storage.saveMusicTitles([
      titel({ id: 't1', title: 'Bolero', arranger: 'Ravel' }),
      titel({ id: 't2', title: 'Zarathustra', arranger: 'De Haan' }),
    ]);

    expect((await storage.getMusicTitles({ search: 'BOL' })).map((t) => t.id)).toEqual(['t1']);
    expect((await storage.getMusicTitles({ search: 'haan' })).map((t) => t.id)).toEqual(['t2']);
  });

  it('filtert op genre en negeert titels zonder genres', async () => {
    await storage.saveMusicTitles([
      titel({ id: 't1', genres: [{ id: 'g1', name: 'Klassiek' }] }),
      titel({ id: 't2', genres: [] }),
      titel({ id: 't3', genres: undefined }),
    ]);

    expect((await storage.getMusicTitles({ genreId: 'g1' })).map((t) => t.id)).toEqual(['t1']);
  });

  it('wist alle titels met clearMusicTitles', async () => {
    await storage.saveMusicTitles([titel()]);
    await storage.clearMusicTitles();

    expect(await storage.getMusicTitles()).toEqual([]);
  });
});

describe('orkesten, instrumenten en genres', () => {
  it('slaat orkesten op en leest ze per id terug', async () => {
    await storage.saveOrchestras([
      { id: 'o1', name: 'Harmonie A' },
      { id: 'o2', name: 'Fanfare B' },
    ]);

    expect(await storage.getOrchestras()).toHaveLength(2);
    expect((await storage.getOrchestra('o2'))?.name).toBe('Fanfare B');
    expect(await storage.getOrchestra('o9')).toBeUndefined();
  });

  it('slaat instrumenten op en leest ze per id terug', async () => {
    await storage.saveInstruments([{ id: 'i1', name: 'Klarinet', tuning: 'Bb' }]);

    expect((await storage.getInstrument('i1'))?.name).toBe('Klarinet');
    expect(await storage.getInstrument('i9')).toBeUndefined();
  });

  it('slaat genres op en leest ze terug', async () => {
    await storage.saveGenres([{ id: 'g1', name: 'Klassiek' }]);

    expect(await storage.getGenres()).toMatchObject([{ id: 'g1', name: 'Klassiek' }]);
  });

  it('wist orkesten, instrumenten en genres los van elkaar', async () => {
    await storage.saveOrchestras([{ id: 'o1', name: 'Harmonie A' }]);
    await storage.saveInstruments([{ id: 'i1', name: 'Klarinet', tuning: null }]);
    await storage.saveGenres([{ id: 'g1', name: 'Klassiek' }]);

    await storage.clearOrchestras();

    expect(await storage.getOrchestras()).toEqual([]);
    expect(await storage.getInstruments()).toHaveLength(1);
    expect(await storage.getGenres()).toHaveLength(1);
  });
});

describe('favorieten', () => {
  const favoriet = (id: string, musicTitleId = id) => ({
    id,
    musicTitleId,
    title: `Titel ${id}`,
    arranger: null,
    addedAt: '2026-01-01T00:00:00.000Z',
  });

  it('leest opgeslagen favorieten ongewijzigd terug', async () => {
    await storage.saveFavorites([favoriet('f1'), favoriet('f2')]);

    expect(await storage.getFavorites()).toEqual([favoriet('f1'), favoriet('f2')]);
  });

  it('vervangt de hele lijst: favorieten die de server niet meer kent verdwijnen', async () => {
    await storage.saveFavorites([favoriet('f1'), favoriet('f2')]);
    await storage.saveFavorites([favoriet('f2')]);

    expect((await storage.getFavorites()).map((f) => f.id)).toEqual(['f2']);
  });

  it('wist alles bij het opslaan van een lege lijst', async () => {
    // Belangrijk voor de verenigingsgrens: een lege serverlijst hoort de oude
    // favorieten op te ruimen, niet ze te laten staan.
    await storage.saveFavorites([favoriet('f1')]);
    await storage.saveFavorites([]);

    expect(await storage.getFavorites()).toEqual([]);
  });

  it('voegt een losse favoriet toe zonder de rest te raken', async () => {
    await storage.saveFavorites([favoriet('f1')]);
    await storage.addFavorite(favoriet('f2'));

    expect((await storage.getFavorites()).map((f) => f.id)).toEqual(['f1', 'f2']);
  });

  it('verwijdert een losse favoriet en negeert een onbekende sleutel', async () => {
    await storage.saveFavorites([favoriet('f1'), favoriet('f2')]);

    await storage.removeFavorite('f1');
    await storage.removeFavorite('bestaat-niet');

    expect((await storage.getFavorites()).map((f) => f.id)).toEqual(['f2']);
  });

  it('herkent een favoriet via de musicTitleId-index', async () => {
    await storage.saveFavorites([favoriet('f1', 't-bolero')]);

    expect(await storage.isFavorite('t-bolero')).toBe(true);
    expect(await storage.isFavorite('t-onbekend')).toBe(false);
  });

  it('wist alle favorieten met clearFavorites', async () => {
    await storage.saveFavorites([favoriet('f1')]);
    await storage.clearFavorites();

    expect(await storage.getFavorites()).toEqual([]);
  });
});

describe('recent bekeken', () => {
  const view = (id: string, viewedAt: string, itemType: 'music_title' | 'rehearsal' = 'music_title') => ({
    id,
    itemType,
    itemId: `item-${id}`,
    itemTitle: `Titel ${id}`,
    viewedAt,
  });

  it('sorteert aflopend op bekeken-moment', async () => {
    await storage.saveRecentViews([
      view('v1', '2026-01-01T10:00:00.000Z'),
      view('v2', '2026-03-01T10:00:00.000Z'),
      view('v3', '2026-02-01T10:00:00.000Z'),
    ]);

    expect((await storage.getRecentViews()).map((v) => v.id)).toEqual(['v2', 'v3', 'v1']);
  });

  it('past het limiet toe na het sorteren, niet ervoor', async () => {
    await storage.saveRecentViews([view('oud', '2026-01-01T10:00:00.000Z'), view('nieuw', '2026-06-01T10:00:00.000Z')]);

    expect((await storage.getRecentViews(undefined, 1)).map((v) => v.id)).toEqual(['nieuw']);
  });

  it('filtert op itemType via de index', async () => {
    await storage.saveRecentViews([
      view('v1', '2026-01-01T10:00:00.000Z', 'music_title'),
      view('v2', '2026-01-02T10:00:00.000Z', 'rehearsal'),
    ]);

    expect((await storage.getRecentViews('rehearsal')).map((v) => v.id)).toEqual(['v2']);
  });

  it('geeft een lege lijst bij een onbekend itemType', async () => {
    await storage.saveRecentViews([view('v1', '2026-01-01T10:00:00.000Z')]);

    expect(await storage.getRecentViews('concert')).toEqual([]);
  });

  it('vervangt de hele lijst bij opslaan', async () => {
    await storage.saveRecentViews([view('v1', '2026-01-01T10:00:00.000Z')]);
    await storage.saveRecentViews([view('v2', '2026-01-02T10:00:00.000Z')]);

    expect((await storage.getRecentViews()).map((v) => v.id)).toEqual(['v2']);
  });

  it('voegt een losse weergave toe en wist alles met clearRecentViews', async () => {
    await storage.addRecentView(view('v1', '2026-01-01T10:00:00.000Z'));
    expect(await storage.getRecentViews()).toHaveLength(1);

    await storage.clearRecentViews();
    expect(await storage.getRecentViews()).toEqual([]);
  });
});

describe('repetities', () => {
  it('sorteert oplopend op datum', async () => {
    await storage.saveRehearsals([
      rehearsal({ id: 'r1', date: '2026-05-01' }),
      rehearsal({ id: 'r2', date: '2026-01-01' }),
      rehearsal({ id: 'r3', date: '2026-03-01' }),
    ]);

    expect((await storage.getRehearsals()).map((r) => r.id)).toEqual(['r2', 'r3', 'r1']);
  });

  it('neemt de grensdatums inclusief mee', async () => {
    await storage.saveRehearsals([
      rehearsal({ id: 'voor', date: '2026-02-28' }),
      rehearsal({ id: 'start', date: '2026-03-01' }),
      rehearsal({ id: 'eind', date: '2026-03-31' }),
      rehearsal({ id: 'na', date: '2026-04-01' }),
    ]);

    const gevonden = await storage.getRehearsals({ startDate: '2026-03-01', endDate: '2026-03-31' });
    expect(gevonden.map((r) => r.id)).toEqual(['start', 'eind']);
  });

  it('scheidt repetities per orkest', async () => {
    await storage.saveRehearsals([
      rehearsal({ id: 'r1', orchestra_id: 'o1' }),
      rehearsal({ id: 'r2', orchestra_id: 'o2' }),
    ]);

    expect((await storage.getRehearsals({ orchestraId: 'o2' })).map((r) => r.id)).toEqual(['r2']);
  });

  it('laat repetities zonder orkest buiten een orkestfilter', async () => {
    await storage.saveRehearsals([rehearsal({ id: 'r1', orchestra_id: null })]);

    expect(await storage.getRehearsals({ orchestraId: 'o1' })).toEqual([]);
  });

  it('leest een repetitie per id en geeft undefined bij een onbekende sleutel', async () => {
    await storage.saveRehearsals([rehearsal({ id: 'r1' })]);

    expect((await storage.getRehearsal('r1'))?.location).toBe('Dorpshuis');
    expect(await storage.getRehearsal('r9')).toBeUndefined();
  });

  it('wist alle repetities met clearRehearsals', async () => {
    await storage.saveRehearsals([rehearsal()]);
    await storage.clearRehearsals();

    expect(await storage.getRehearsals()).toEqual([]);
  });
});

// =============================================================================
// Houdbaarheid
// =============================================================================

describe('houdbaarheid van gecachete gegevens', () => {
  it('laat cachedAt staan en geeft ook jaren later nog gegevens terug', async () => {
    // VASTGELEGD GEDRAG: er is geen enkele vervaltermijn. `cachedAt` wordt wel
    // geschreven maar door niemand gelezen, dus offline gegevens verouderen
    // stilletjes zonder dat de gebruiker een signaal krijgt.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00.000Z'));
    await storage.saveMusicPieces([piece()]);

    vi.setSystemTime(new Date('2026-08-21T00:00:00.000Z'));

    const stukken = (await storage.getMusicPieces()) as (MusicPiece & { cachedAt: string })[];
    expect(stukken).toHaveLength(1);
    expect(stukken[0].cachedAt).toBe('2025-01-01T00:00:00.000Z');
  });

  it('houdt synchronisatiemetadata bij per soort gegevens en telt de versie op', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T10:00:00.000Z'));
    await storage.saveOrchestras([{ id: 'o1', name: 'Harmonie A' }]);

    vi.setSystemTime(new Date('2026-01-15T12:00:00.000Z'));
    await storage.saveOrchestras([{ id: 'o1', name: 'Harmonie A' }]);

    const meta = await storage.getSyncMetadata('orchestras');
    expect(meta).toEqual({
      key: 'orchestras',
      lastSyncAt: '2026-01-15T12:00:00.000Z',
      version: 2,
    });
  });

  it('geeft undefined en null terug voor een soort die nooit is gesynchroniseerd', async () => {
    expect(await storage.getSyncMetadata('rehearsals')).toBeUndefined();
    expect(await storage.getLastSyncTime('rehearsals')).toBeNull();
  });

  it('verzamelt de metadata van alle gesynchroniseerde soorten', async () => {
    await storage.saveGenres([{ id: 'g1', name: 'Klassiek' }]);
    await storage.saveInstruments([{ id: 'i1', name: 'Klarinet', tuning: null }]);

    const alles = await storage.getAllSyncMetadata();
    expect(alles.map((m) => m.key).sort()).toEqual(['genres', 'instruments']);
  });

  it('levert het laatste synchronisatiemoment als tekst', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-01T08:30:00.000Z'));
    await storage.saveGenres([]);

    expect(await storage.getLastSyncTime('genres')).toBe('2026-04-01T08:30:00.000Z');
  });
});

// =============================================================================
// Wachtrij met wijzigingen die nog naar de server moeten
// =============================================================================

describe('wachtrij met openstaande wijzigingen', () => {
  it('geeft de wijziging een id, een tijdstempel en retryCount 0', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-05T09:00:00.000Z'));

    const id = await storage.addPendingMutation({
      type: 'favorite',
      endpoint: '/api/favorites',
      method: 'POST',
      data: { musicTitleId: 't1' },
    });

    const [wijziging] = await storage.getPendingMutations();
    expect(id).toBe(1);
    expect(wijziging).toEqual({
      id: 1,
      type: 'favorite',
      endpoint: '/api/favorites',
      method: 'POST',
      data: { musicTitleId: 't1' },
      createdAt: '2026-05-05T09:00:00.000Z',
      retryCount: 0,
    });
  });

  it('geeft elke wijziging een eigen id, ook bij identieke inhoud', async () => {
    const eerste = await storage.addPendingMutation({ type: 'x', endpoint: '/x', method: 'POST' });
    const tweede = await storage.addPendingMutation({ type: 'x', endpoint: '/x', method: 'POST' });

    expect(eerste).not.toBe(tweede);
    expect(await storage.getPendingMutations()).toHaveLength(2);
  });

  it('blijft in de rij staan nadat de gebruiker de app sluit en heropent', async () => {
    // De wachtrij is de enige plek waar een offline wijziging leeft; die mag het
    // sluiten van de tab overleven, anders is het werk van de gebruiker weg.
    await storage.addPendingMutation({ type: 'note', endpoint: '/notes', method: 'POST', data: { tekst: 'hoi' } });

    await storage.closeDB();

    const naHeropenen = await storage.getPendingMutations();
    expect(naHeropenen).toHaveLength(1);
    expect(naHeropenen[0].data).toEqual({ tekst: 'hoi' });
  });

  it('verhoogt de retryCount bij een mislukte synchronisatie in plaats van de wijziging weg te gooien', async () => {
    const id = await storage.addPendingMutation({ type: 'x', endpoint: '/x', method: 'POST' });

    await storage.updatePendingMutationRetry(id);
    await storage.updatePendingMutationRetry(id);

    const [wijziging] = await storage.getPendingMutations();
    expect(wijziging.retryCount).toBe(2);
    expect(await storage.getPendingMutations()).toHaveLength(1);
  });

  it('laat de overige velden ongemoeid bij het ophogen van de retryCount', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-05T09:00:00.000Z'));
    const id = await storage.addPendingMutation({
      type: 'note',
      endpoint: '/notes',
      method: 'PATCH',
      data: { tekst: 'hoi' },
    });

    await storage.updatePendingMutationRetry(id);

    expect((await storage.getPendingMutations())[0]).toEqual({
      id,
      type: 'note',
      endpoint: '/notes',
      method: 'PATCH',
      data: { tekst: 'hoi' },
      createdAt: '2026-05-05T09:00:00.000Z',
      retryCount: 1,
    });
  });

  it('doet niets bij het ophogen van een onbekende wijziging', async () => {
    await expect(storage.updatePendingMutationRetry(999)).resolves.toBeUndefined();
    expect(await storage.getPendingMutations()).toEqual([]);
  });

  it('verwijdert een geslaagde wijziging en negeert een onbekende sleutel', async () => {
    const id = await storage.addPendingMutation({ type: 'x', endpoint: '/x', method: 'POST' });

    await storage.removePendingMutation(id);
    await storage.removePendingMutation(999);

    expect(await storage.getPendingMutations()).toEqual([]);
  });

  it('meldt of er nog iets in de rij staat', async () => {
    expect(await storage.hasPendingMutations()).toBe(false);

    const id = await storage.addPendingMutation({ type: 'x', endpoint: '/x', method: 'POST' });
    expect(await storage.hasPendingMutations()).toBe(true);

    await storage.removePendingMutation(id);
    expect(await storage.hasPendingMutations()).toBe(false);
  });

  it('leegt de rij met clearPendingMutations', async () => {
    await storage.addPendingMutation({ type: 'x', endpoint: '/x', method: 'POST' });
    await storage.clearPendingMutations();

    expect(await storage.hasPendingMutations()).toBe(false);
  });
});

// =============================================================================
// Vervuilde of volle opslag
// =============================================================================

describe('opslagfouten', () => {
  it('laat een quotumfout doorschieten bij het opslaan van muziekstukken', async () => {
    // VASTGELEGD GEDRAG: er zit geen enkele afvang omheen. Elke aanroeper moet
    // dit zelf opvangen, anders klapt de synchronisatie eruit.
    await storage.getDB();
    idbFake.failWritesTo('musicPieces');

    await expect(storage.saveMusicPieces([piece()])).rejects.toThrow(/quota/i);
  });

  it('laat na een quotumfout geen halve wachtrij achter', async () => {
    await storage.getDB();
    idbFake.failWritesTo('pendingMutations');

    await expect(storage.addPendingMutation({ type: 'x', endpoint: '/x', method: 'POST' })).rejects.toThrow(/quota/i);

    idbFake.allowWritesTo('pendingMutations');
    expect(await storage.getPendingMutations()).toEqual([]);
  });

  it('houdt lezen mogelijk terwijl schrijven faalt', async () => {
    // Een volle schijf hoort de app niet blind te maken voor wat er al staat.
    await storage.saveOrchestras([{ id: 'o1', name: 'Harmonie A' }]);
    idbFake.failWritesTo('orchestras');

    await expect(storage.saveOrchestras([{ id: 'o2', name: 'Fanfare B' }])).rejects.toThrow();
    expect(await storage.getOrchestras()).toHaveLength(1);
  });
});

describe('opslagschatting', () => {
  it('geeft null als de browser geen schatting kan maken', async () => {
    const origineel = Object.getOwnPropertyDescriptor(navigator, 'storage');
    Object.defineProperty(navigator, 'storage', { value: undefined, configurable: true });

    expect(await storage.getStorageEstimate()).toBeNull();

    if (origineel) Object.defineProperty(navigator, 'storage', origineel);
  });

  it('rekent het gebruik om naar een afgerond percentage', async () => {
    Object.defineProperty(navigator, 'storage', {
      value: { estimate: async () => ({ usage: 333, quota: 1000 }) },
      configurable: true,
    });

    expect(await storage.getStorageEstimate()).toEqual({ used: 333, quota: 1000, percentage: 33 });
  });

  it('deelt niet door nul als er geen quotum bekend is', async () => {
    Object.defineProperty(navigator, 'storage', {
      value: { estimate: async () => ({ usage: 100, quota: 0 }) },
      configurable: true,
    });

    expect(await storage.getStorageEstimate()).toEqual({ used: 100, quota: 0, percentage: 0 });
  });

  it('vult ontbrekende getallen aan met nul', async () => {
    Object.defineProperty(navigator, 'storage', {
      value: { estimate: async () => ({}) },
      configurable: true,
    });

    expect(await storage.getStorageEstimate()).toEqual({ used: 0, quota: 0, percentage: 0 });
  });
});

describe('isIndexedDBAvailable', () => {
  it('meldt false als de browser geen IndexedDB heeft', () => {
    const origineel = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
    Object.defineProperty(globalThis, 'indexedDB', { value: undefined, configurable: true });

    expect(storage.isIndexedDBAvailable()).toBe(false);

    if (origineel) Object.defineProperty(globalThis, 'indexedDB', origineel);
    else delete (globalThis as Record<string, unknown>).indexedDB;
  });

  it('meldt true zodra IndexedDB bestaat', () => {
    Object.defineProperty(globalThis, 'indexedDB', { value: {}, configurable: true });

    expect(storage.isIndexedDBAvailable()).toBe(true);

    delete (globalThis as Record<string, unknown>).indexedDB;
  });
});

// =============================================================================
// Verenigingsgrens
// =============================================================================

describe('verenigingsgrens', () => {
  it('deelt één database voor alle verenigingen die door deze browser gaan', async () => {
    // BEKEND MANKEMENT: de databasenaam is vast ('harmonie-offline') en er zit
    // geen vereniging of gebruiker in de sleutels. Alleen clearAllData scheidt
    // de ene vereniging van de volgende, en AuthContext.logout roept dat niet
    // aan. Wie na uitloggen als lid van vereniging B inlogt, ziet offline nog
    // het repertoire en de repetities van vereniging A.
    await storage.saveUserProfile(user({ id: 'u-a', associationId: 'vereniging-a' }));
    await storage.saveMusicPieces([piece({ id: 'p-a', title: 'Repertoire van A' })]);
    await storage.saveRehearsals([rehearsal({ id: 'r-a', orchestra_id: 'o-a' })]);
    await storage.saveFavorites([
      { id: 'f-a', musicTitleId: 't-a', title: 'Favoriet van A', arranger: null, addedAt: '2026-01-01' },
    ]);

    // Uitloggen zoals de app dat nu doet: alleen localStorage leeg, IndexedDB niet.
    localStorage.clear();
    await storage.closeDB();

    expect(await storage.getMusicPieces()).toHaveLength(1);
    expect(await storage.getRehearsals()).toHaveLength(1);
    expect(await storage.getFavorites()).toHaveLength(1);
    expect((await storage.getUserProfile())?.associationId).toBe('vereniging-a');
  });

  it('scheidt de verenigingen pas na clearAllData', async () => {
    await storage.saveUserProfile(user({ associationId: 'vereniging-a' }));
    await storage.saveMusicPieces([piece()]);
    await storage.saveMusicTitles([
      {
        id: 't1',
        title: 'Bolero',
        arranger: null,
        pieceCount: 1,
        youtubeUrl: null,
        description: null,
        durationSeconds: 0,
        instruments: [],
      },
    ]);
    await storage.saveOrchestras([{ id: 'o1', name: 'Harmonie A' }]);
    await storage.saveInstruments([{ id: 'i1', name: 'Klarinet', tuning: null }]);
    await storage.saveGenres([{ id: 'g1', name: 'Klassiek' }]);
    await storage.saveFavorites([
      { id: 'f1', musicTitleId: 't1', title: 'Bolero', arranger: null, addedAt: '2026-01-01' },
    ]);
    await storage.saveRecentViews([
      { id: 'v1', itemType: 'music_title', itemId: 't1', itemTitle: 'Bolero', viewedAt: '2026-01-01' },
    ]);
    await storage.saveRehearsals([rehearsal()]);
    await storage.addPendingMutation({ type: 'x', endpoint: '/x', method: 'POST' });

    await storage.clearAllData();

    expect(await storage.getUserProfile()).toBeUndefined();
    expect(await storage.getMusicPieces()).toEqual([]);
    expect(await storage.getMusicTitles()).toEqual([]);
    expect(await storage.getOrchestras()).toEqual([]);
    expect(await storage.getInstruments()).toEqual([]);
    expect(await storage.getGenres()).toEqual([]);
    expect(await storage.getFavorites()).toEqual([]);
    expect(await storage.getRecentViews()).toEqual([]);
    expect(await storage.getRehearsals()).toEqual([]);
    expect(await storage.getAllSyncMetadata()).toEqual([]);
    expect(await storage.hasPendingMutations()).toBe(false);
  });

  it('gooit met clearAllData ook nog niet verstuurde wijzigingen weg', async () => {
    // VASTGELEGD GEDRAG: uitloggen met openstaande offline wijzigingen betekent
    // dat die wijzigingen definitief verloren gaan; er is geen waarschuwing.
    await storage.addPendingMutation({ type: 'note', endpoint: '/notes', method: 'POST', data: { tekst: 'hoi' } });

    await storage.clearAllData();

    expect(await storage.getPendingMutations()).toEqual([]);
  });

  it('verwijdert de database volledig met deleteDatabase', async () => {
    const deleteDatabase = vi.fn();
    Object.defineProperty(globalThis, 'indexedDB', { value: { deleteDatabase }, configurable: true });
    await storage.getDB();

    await storage.deleteDatabase();

    expect(deleteDatabase).toHaveBeenCalledWith('harmonie-offline');
    delete (globalThis as Record<string, unknown>).indexedDB;
  });
});
