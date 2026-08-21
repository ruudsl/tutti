/**
 * Tests voor de Dexie-laag met de synchronisatiewachtrij en conflictafhandeling.
 *
 * Dexie zelf heeft een echte IndexedDB nodig en die is er niet in jsdom, dus
 * mocken we de module met in-memory tabellen. De nabootsing houdt zich aan de
 * semantiek waar deze code op leunt:
 *   - `update` past alleen een bestaand record aan en maakt er nooit een nieuw
 *     aan (een 'create'-synchronisatie op een verdwenen record verstomt dus);
 *   - `add` weigert een dubbele sleutel;
 *   - lezen levert kopieën, zodat een test niet per ongeluk de opslag muteert.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const dexieFake = vi.hoisted(() => {
  const kopie = <T>(waarde: T): T => (waarde && typeof waarde === 'object' ? { ...(waarde as object) } : waarde) as T;

  class FakeCollection {
    constructor(private rijen: any[]) {}
    filter(predicaat: (rij: any) => boolean) {
      return new FakeCollection(this.rijen.filter(predicaat));
    }
    async toArray() {
      return this.rijen.map(kopie);
    }
    async count() {
      return this.rijen.length;
    }
  }

  class FakeTable {
    rijen = new Map<string, any>();

    async add(item: any) {
      if (this.rijen.has(item.id)) {
        const fout = new Error('Key already exists');
        fout.name = 'ConstraintError';
        throw fout;
      }
      this.rijen.set(item.id, kopie(item));
      return item.id;
    }
    async put(item: any) {
      this.rijen.set(item.id, kopie(item));
      return item.id;
    }
    async get(id: string) {
      const gevonden = this.rijen.get(id);
      return gevonden === undefined ? undefined : kopie(gevonden);
    }
    async update(id: string, wijzigingen: Record<string, unknown>) {
      const huidig = this.rijen.get(id);
      if (!huidig) return 0;
      this.rijen.set(id, { ...huidig, ...wijzigingen, id });
      return 1;
    }
    async delete(id: string) {
      this.rijen.delete(id);
    }
    async count() {
      return this.rijen.size;
    }
    async toArray() {
      return [...this.rijen.values()].map(kopie);
    }
    orderBy(veld: string) {
      const gesorteerd = [...this.rijen.values()].sort((a, b) =>
        String(a[veld]) < String(b[veld]) ? -1 : String(a[veld]) > String(b[veld]) ? 1 : 0,
      );
      return new FakeCollection(gesorteerd);
    }
    filter(predicaat: (rij: any) => boolean) {
      return new FakeCollection([...this.rijen.values()]).filter(predicaat);
    }
    where(veld: string) {
      const rijen = [...this.rijen.values()];
      return {
        equals: (waarde: unknown) => new FakeCollection(rijen.filter((rij) => rij[veld] === waarde)),
      };
    }
  }

  class FakeDexie {
    constructor(public dbNaam: string) {}
    version(_versie: number) {
      const zelf = this as unknown as Record<string, FakeTable>;
      return {
        stores: (schema: Record<string, string>) => {
          for (const tabelNaam of Object.keys(schema)) {
            zelf[tabelNaam] = new FakeTable();
          }
          return { upgrade: () => undefined };
        },
      };
    }
  }

  return { FakeDexie, FakeTable };
});

vi.mock('dexie', () => ({
  default: dexieFake.FakeDexie,
  Dexie: dexieFake.FakeDexie,
  Table: class {},
}));

import {
  offlineDb,
  SyncManager,
  syncManager,
  cacheMusicPiece,
  getCachedMusicPiece,
  getCachedMusicPieces,
  saveAnnotationOffline,
  getAnnotationsForPiece,
  type SyncQueueItem,
} from '../offlineDb';

const API = 'http://localhost:3001/api';

function zetOnline(online: boolean) {
  Object.defineProperty(navigator, 'onLine', { value: online, configurable: true });
}

/** Een SyncManager die de opgegeven online-status als startpunt neemt. */
function maakManager(online = true): SyncManager {
  zetOnline(online);
  return new SyncManager();
}

function antwoord(status: number, body: unknown = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const wachtrijItem = (overrides: Partial<SyncQueueItem> = {}): SyncQueueItem => ({
  id: 'q1',
  entityType: 'musicPiece',
  entityId: 'p1',
  action: 'update',
  data: JSON.stringify({ title: 'Bolero' }),
  createdAt: '2026-01-01T10:00:00.000Z',
  retryCount: 0,
  ...overrides,
});

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  for (const tabel of [
    offlineDb.musicPieces,
    offlineDb.annotations,
    offlineDb.rehearsals,
    offlineDb.practiceLogs,
    offlineDb.syncQueue,
    offlineDb.conflicts,
  ]) {
    (tabel as unknown as { rijen: Map<string, unknown> }).rijen.clear();
  }
  localStorage.clear();
  zetOnline(true);
  fetchMock = vi.fn().mockResolvedValue(antwoord(200, {}));
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// =============================================================================
// Online-status
// =============================================================================

describe('online-status', () => {
  it('neemt de status van de browser over bij het aanmaken', () => {
    expect(maakManager(true).getIsOnline()).toBe(true);
    expect(maakManager(false).getIsOnline()).toBe(false);
  });

  it('meldt luisteraars wanneer de verbinding wegvalt en terugkomt', () => {
    const manager = maakManager(true);
    const gemeld: boolean[] = [];
    manager.onConnectionChange((online) => gemeld.push(online));

    window.dispatchEvent(new Event('offline'));
    window.dispatchEvent(new Event('online'));

    expect(gemeld).toEqual([false, true]);
    expect(manager.getIsOnline()).toBe(true);
  });

  it('stopt met melden na afmelden', () => {
    const manager = maakManager(true);
    const gemeld: boolean[] = [];
    const afmelden = manager.onConnectionChange((online) => gemeld.push(online));

    afmelden();
    window.dispatchEvent(new Event('offline'));

    expect(gemeld).toEqual([]);
  });
});

// =============================================================================
// Wachtrij vullen
// =============================================================================

describe('queueChange', () => {
  it('legt de wijziging vast met een eigen id, tijdstempel en retryCount 0', async () => {
    const manager = maakManager(false);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T12:00:00.000Z'));

    await manager.queueChange('annotation', 'a1', 'create', { kleur: 'rood' });

    const [item] = await offlineDb.syncQueue.toArray();
    expect(item).toMatchObject({
      entityType: 'annotation',
      entityId: 'a1',
      action: 'create',
      data: JSON.stringify({ kleur: 'rood' }),
      createdAt: '2026-06-01T12:00:00.000Z',
      retryCount: 0,
    });
    expect(item.id).toEqual(expect.any(String));
  });

  it('laat data leeg wanneer er geen gegevens meegaan', async () => {
    const manager = maakManager(false);

    await manager.queueChange('musicPiece', 'p1', 'delete');

    expect((await offlineDb.syncQueue.toArray())[0].data).toBeUndefined();
  });

  it('houdt de wijziging in de rij zolang de gebruiker offline is', async () => {
    const manager = maakManager(false);

    await manager.queueChange('rehearsal', 'r1', 'update', { notes: 'later' });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(await manager.getPendingChangesCount()).toBe(1);
  });

  it('probeert direct te versturen wanneer de gebruiker online is', async () => {
    const manager = maakManager(true);
    await offlineDb.musicPieces.put({ id: 'p1', title: 'Bolero', syncStatus: 'pending' } as never);

    // queueChange wacht bewust niet op het verzenden: de aanroeper is meteen
    // klaar en het legen van de rij gebeurt op de achtergrond.
    await manager.queueChange('musicPiece', 'p1', 'update', { title: 'Bolero' });

    await vi.waitFor(async () => expect(await manager.getPendingChangesCount()).toBe(0));
    expect(fetchMock).toHaveBeenCalledWith(`${API}/music-pieces/p1`, expect.objectContaining({ method: 'PUT' }));
  });

  it('geeft elke wijziging een eigen sleutel, ook bij hetzelfde item', async () => {
    const manager = maakManager(false);

    await manager.queueChange('annotation', 'a1', 'update', { v: 1 });
    await manager.queueChange('annotation', 'a1', 'update', { v: 2 });

    expect(await manager.getPendingChangesCount()).toBe(2);
  });
});

// =============================================================================
// Verzenden
// =============================================================================

describe('processSyncQueue - verzenden', () => {
  it('doet niets zolang de gebruiker offline is', async () => {
    const manager = maakManager(false);
    await offlineDb.syncQueue.add(wachtrijItem());

    await manager.processSyncQueue();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(await manager.getPendingChangesCount()).toBe(1);
  });

  it('haalt een geslaagde wijziging uit de rij', async () => {
    const manager = maakManager(true);
    await offlineDb.musicPieces.put({ id: 'p1', title: 'Bolero', version: 1 } as never);
    await offlineDb.syncQueue.add(wachtrijItem());

    await manager.processSyncQueue();

    expect(await manager.getPendingChangesCount()).toBe(0);
  });

  it('verstuurt POST op de basisroute voor een nieuw item', async () => {
    const manager = maakManager(true);
    await offlineDb.annotations.put({ id: 'a1', musicPieceId: 'p1' } as never);
    await offlineDb.syncQueue.add(wachtrijItem({ entityType: 'annotation', entityId: 'a1', action: 'create' }));

    await manager.processSyncQueue();

    expect(fetchMock).toHaveBeenCalledWith(`${API}/annotations`, expect.objectContaining({ method: 'POST' }));
  });

  it('verstuurt PUT op de itemroute voor een wijziging', async () => {
    const manager = maakManager(true);
    await offlineDb.musicPieces.put({ id: 'p1' } as never);
    await offlineDb.syncQueue.add(wachtrijItem({ action: 'update' }));

    await manager.processSyncQueue();

    expect(fetchMock).toHaveBeenCalledWith(`${API}/music-pieces/p1`, expect.objectContaining({ method: 'PUT' }));
  });

  it('verstuurt DELETE op de itemroute voor een verwijdering', async () => {
    const manager = maakManager(true);
    await offlineDb.syncQueue.add(wachtrijItem({ entityType: 'practiceLog', entityId: 'l1', action: 'delete' }));

    await manager.processSyncQueue();

    expect(fetchMock).toHaveBeenCalledWith(`${API}/practice/logs/l1`, expect.objectContaining({ method: 'DELETE' }));
  });

  it('stuurt het opgeslagen token mee', async () => {
    localStorage.setItem('token', 'abc123');
    const manager = maakManager(true);
    await offlineDb.syncQueue.add(wachtrijItem({ action: 'delete' }));

    await manager.processSyncQueue();

    expect(fetchMock.mock.calls[0][1].headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer abc123',
    });
  });

  it('verstuurt de wijzigingen op volgorde van aanmaken', async () => {
    const manager = maakManager(true);
    await offlineDb.syncQueue.add(
      wachtrijItem({ id: 'q-laat', entityId: 'laat', action: 'delete', createdAt: '2026-01-03T00:00:00.000Z' }),
    );
    await offlineDb.syncQueue.add(
      wachtrijItem({ id: 'q-vroeg', entityId: 'vroeg', action: 'delete', createdAt: '2026-01-01T00:00:00.000Z' }),
    );

    await manager.processSyncQueue();

    expect(fetchMock.mock.calls.map((aanroep) => aanroep[0])).toEqual([
      `${API}/music-pieces/vroeg`,
      `${API}/music-pieces/laat`,
    ]);
  });

  it('schrijft het serverantwoord terug op het lokale record', async () => {
    const manager = maakManager(true);
    await offlineDb.musicPieces.put({ id: 'p1', title: 'Oud', version: 1, syncStatus: 'pending' } as never);
    fetchMock.mockResolvedValue(antwoord(200, { title: 'Nieuw van server', version: 7 }));
    await offlineDb.syncQueue.add(wachtrijItem());

    await manager.processSyncQueue();

    expect(await offlineDb.musicPieces.get('p1')).toMatchObject({
      title: 'Nieuw van server',
      version: 7,
      syncStatus: 'synced',
    });
  });

  it('valt terug op versie 1 als de server geen versie meestuurt', async () => {
    const manager = maakManager(true);
    await offlineDb.musicPieces.put({ id: 'p1', version: 3, syncStatus: 'pending' } as never);
    fetchMock.mockResolvedValue(antwoord(200, { title: 'Bolero' }));
    await offlineDb.syncQueue.add(wachtrijItem());

    await manager.processSyncQueue();

    expect((await offlineDb.musicPieces.get('p1'))?.version).toBe(1);
  });

  it('laat het lokale record staan na een geslaagde verwijdering', async () => {
    // VASTGELEGD GEDRAG: syncItem raakt de lokale tabel niet aan bij 'delete'.
    // De aanroeper moet zelf lokaal opruimen, anders blijft een verwijderd stuk
    // offline zichtbaar.
    const manager = maakManager(true);
    await offlineDb.musicPieces.put({ id: 'p1', title: 'Bolero' } as never);
    await offlineDb.syncQueue.add(wachtrijItem({ action: 'delete' }));

    await manager.processSyncQueue();

    expect(await offlineDb.musicPieces.get('p1')).toBeDefined();
  });

  it('draait niet twee keer tegelijk', async () => {
    const manager = maakManager(true);
    let losmaken: (waarde: Response) => void = () => undefined;
    fetchMock.mockImplementation(() => new Promise<Response>((resolve) => (losmaken = resolve)));
    await offlineDb.syncQueue.add(wachtrijItem({ action: 'delete' }));

    const eerste = manager.processSyncQueue();
    await manager.processSyncQueue(); // moet meteen terugkeren
    losmaken(antwoord(200, {}));
    await eerste;

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================
// Mislukte synchronisatie
// =============================================================================

describe('processSyncQueue - mislukte synchronisatie', () => {
  it('houdt de wijziging in de rij en telt een poging op bij een serverfout', async () => {
    const manager = maakManager(true);
    fetchMock.mockResolvedValue(antwoord(500, {}));
    await offlineDb.syncQueue.add(wachtrijItem({ action: 'delete' }));

    await manager.processSyncQueue();

    const [item] = await offlineDb.syncQueue.toArray();
    expect(item.retryCount).toBe(1);
  });

  it('houdt de wijziging in de rij bij een netwerkfout', async () => {
    const manager = maakManager(true);
    fetchMock.mockRejectedValue(new Error('Network down'));
    await offlineDb.syncQueue.add(wachtrijItem({ action: 'delete' }));

    await manager.processSyncQueue();

    expect((await offlineDb.syncQueue.toArray())[0].retryCount).toBe(1);
  });

  it('gooit een wijziging ook bij een 400 niet weg', async () => {
    // In tegenstelling tot de losse wachtrij in offlineStorage blijft een
    // afgekeurde wijziging hier bewaard tot vijf pogingen op zijn.
    const manager = maakManager(true);
    fetchMock.mockResolvedValue(antwoord(400, {}));
    await offlineDb.syncQueue.add(wachtrijItem({ action: 'delete' }));

    await manager.processSyncQueue();

    expect(await manager.getPendingChangesCount()).toBe(1);
  });

  it('probeert het bij vier eerdere pogingen nog een keer', async () => {
    const manager = maakManager(true);
    fetchMock.mockResolvedValue(antwoord(500, {}));
    await offlineDb.syncQueue.add(wachtrijItem({ action: 'delete', retryCount: 4 }));

    await manager.processSyncQueue();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((await offlineDb.syncQueue.toArray())[0].retryCount).toBe(5);
  });

  it('slaat een wijziging met vijf pogingen over maar laat hem wel in de rij staan', async () => {
    // BEKEND MANKEMENT: opgegeven wijzigingen worden nooit opgeruimd of gemeld.
    // Ze tellen eeuwig mee in getPendingChangesCount, dus de teller in de
    // interface blijft hangen zonder dat de gebruiker er iets aan kan doen.
    const manager = maakManager(true);
    await offlineDb.syncQueue.add(wachtrijItem({ action: 'delete', retryCount: 5 }));

    await manager.processSyncQueue();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(await manager.getPendingChangesCount()).toBe(1);
  });

  it('laat één mislukte wijziging de rest van de rij niet blokkeren', async () => {
    const manager = maakManager(true);
    fetchMock.mockResolvedValueOnce(antwoord(500, {})).mockResolvedValueOnce(antwoord(200, {}));
    await offlineDb.syncQueue.add(wachtrijItem({ id: 'q1', action: 'delete', createdAt: '2026-01-01T00:00:00.000Z' }));
    await offlineDb.syncQueue.add(wachtrijItem({ id: 'q2', action: 'delete', createdAt: '2026-01-02T00:00:00.000Z' }));

    await manager.processSyncQueue();

    const resterend = await offlineDb.syncQueue.toArray();
    expect(resterend.map((item) => item.id)).toEqual(['q1']);
  });
});

// =============================================================================
// Conflicten
// =============================================================================

describe('conflicten', () => {
  const conflictAntwoord = antwoord(409, { serverData: { title: 'Servertitel', version: 9 } });

  it('legt bij een 409 zowel de lokale als de serverversie vast', async () => {
    const manager = maakManager(true);
    await offlineDb.musicPieces.put({ id: 'p1', title: 'Mijn titel', version: 2 } as never);
    fetchMock.mockResolvedValue(conflictAntwoord);
    await offlineDb.syncQueue.add(wachtrijItem());

    await manager.processSyncQueue();

    const [conflict] = await offlineDb.conflicts.toArray();
    expect(JSON.parse(conflict.localData)).toMatchObject({ id: 'p1', title: 'Mijn titel' });
    expect(JSON.parse(conflict.serverData)).toEqual({ title: 'Servertitel', version: 9 });
    expect(conflict.resolved).toBe(false);
  });

  it('markeert het lokale record als conflict en haalt de wijziging uit de rij', async () => {
    const manager = maakManager(true);
    await offlineDb.musicPieces.put({ id: 'p1', title: 'Mijn titel', syncStatus: 'pending' } as never);
    fetchMock.mockResolvedValue(conflictAntwoord);
    await offlineDb.syncQueue.add(wachtrijItem());

    await manager.processSyncQueue();

    expect((await offlineDb.musicPieces.get('p1'))?.syncStatus).toBe('conflict');
    expect(await manager.getPendingChangesCount()).toBe(0);
  });

  it('bewaart een leeg serverantwoord als de server geen serverData meestuurt', async () => {
    const manager = maakManager(true);
    await offlineDb.musicPieces.put({ id: 'p1' } as never);
    fetchMock.mockResolvedValue(antwoord(409, {}));
    await offlineDb.syncQueue.add(wachtrijItem());

    await manager.processSyncQueue();

    expect(JSON.parse((await offlineDb.conflicts.toArray())[0].serverData)).toEqual({});
  });

  it('toont alleen onopgeloste conflicten', async () => {
    const manager = maakManager(true);
    await offlineDb.conflicts.add({
      id: 'c1',
      entityType: 'musicPiece',
      entityId: 'p1',
      localData: '{}',
      serverData: '{}',
      conflictedAt: '2026-01-01',
      resolved: false,
    });
    await offlineDb.conflicts.add({
      id: 'c2',
      entityType: 'musicPiece',
      entityId: 'p2',
      localData: '{}',
      serverData: '{}',
      conflictedAt: '2026-01-01',
      resolved: true,
    });

    expect((await manager.getConflicts()).map((c) => c.id)).toEqual(['c1']);
  });

  async function maakConflict(serverData = JSON.stringify({ title: 'Servertitel', version: 9 })) {
    await offlineDb.musicPieces.put({ id: 'p1', title: 'Mijn titel', syncStatus: 'conflict', version: 2 } as never);
    await offlineDb.conflicts.add({
      id: 'c1',
      entityType: 'musicPiece',
      entityId: 'p1',
      localData: JSON.stringify({ id: 'p1', title: 'Mijn titel', version: 2 }),
      serverData,
      conflictedAt: '2026-01-01T00:00:00.000Z',
      resolved: false,
    });
  }

  it('neemt bij "useServer" de serverversie over en zet de status op synced', async () => {
    const manager = maakManager(false);
    await maakConflict();

    await manager.resolveConflict('c1', 'useServer');

    expect(await offlineDb.musicPieces.get('p1')).toMatchObject({
      title: 'Servertitel',
      version: 9,
      syncStatus: 'synced',
    });
    expect((await offlineDb.conflicts.get('c1'))?.resolved).toBe(true);
    expect(await manager.getPendingChangesCount()).toBe(0);
  });

  it('zet bij "useLocal" de eigen versie opnieuw in de rij met forceOverwrite', async () => {
    const manager = maakManager(false);
    await maakConflict();

    await manager.resolveConflict('c1', 'useLocal');

    const [item] = await offlineDb.syncQueue.toArray();
    expect(item.action).toBe('update');
    expect(JSON.parse(item.data!)).toMatchObject({ title: 'Mijn titel', forceOverwrite: true });
  });

  it('laat bij "useLocal" de lokale status op conflict staan', async () => {
    // BEKEND MANKEMENT: de merge-tak zet syncStatus terug op 'pending', maar de
    // useLocal-tak doet dat niet. Het record blijft dus als conflict getoond
    // terwijl de wijziging alweer onderweg is naar de server.
    const manager = maakManager(false);
    await maakConflict();

    await manager.resolveConflict('c1', 'useLocal');

    expect((await offlineDb.musicPieces.get('p1'))?.syncStatus).toBe('conflict');
  });

  it('slaat bij "merge" de samengevoegde versie op als pending en zet hem in de rij', async () => {
    const manager = maakManager(false);
    await maakConflict();

    await manager.resolveConflict('c1', 'merge', { title: 'Samengevoegd', version: 9 });

    expect(await offlineDb.musicPieces.get('p1')).toMatchObject({
      title: 'Samengevoegd',
      syncStatus: 'pending',
    });
    expect(JSON.parse((await offlineDb.syncQueue.toArray())[0].data!)).toMatchObject({ title: 'Samengevoegd' });
  });

  it('doet niets bij "merge" zonder samengevoegde gegevens, maar markeert het conflict wél als opgelost', async () => {
    // BEKEND MANKEMENT: het conflict verdwijnt uit de lijst terwijl het record
    // op 'conflict' blijft staan en niemand er meer bij kan.
    const manager = maakManager(false);
    await maakConflict();

    await manager.resolveConflict('c1', 'merge');

    expect((await offlineDb.musicPieces.get('p1'))?.syncStatus).toBe('conflict');
    expect((await offlineDb.conflicts.get('c1'))?.resolved).toBe(true);
    expect(await manager.getPendingChangesCount()).toBe(0);
  });

  it('doet niets bij een onbekend conflict', async () => {
    const manager = maakManager(false);

    await expect(manager.resolveConflict('bestaat-niet', 'useServer')).resolves.toBeUndefined();
    expect(await manager.getPendingChangesCount()).toBe(0);
  });

  it('laat een kapotte serverData-JSON doorschieten en het conflict onopgelost', async () => {
    // BEKEND MANKEMENT: JSON.parse zit niet in een try/catch. Een vervuild
    // conflictrecord maakt het conflict onoplosbaar en de fout komt ongefilterd
    // bij de aanroeper terecht.
    const manager = maakManager(false);
    await maakConflict('{kapot json');

    await expect(manager.resolveConflict('c1', 'useServer')).rejects.toThrow();
    expect((await offlineDb.conflicts.get('c1'))?.resolved).toBe(false);
  });

  it('doet niets bij een conflict over een onbekend soort gegevens', async () => {
    const manager = maakManager(false);
    await offlineDb.conflicts.add({
      id: 'c1',
      entityType: 'onbekend',
      entityId: 'x1',
      localData: '{}',
      serverData: '{}',
      conflictedAt: '2026-01-01',
      resolved: false,
    });

    await manager.resolveConflict('c1', 'useServer');

    expect((await offlineDb.conflicts.get('c1'))?.resolved).toBe(false);
  });
});

// =============================================================================
// Cachehulpjes
// =============================================================================

describe('cacheMusicPiece', () => {
  it('leest zowel camelCase- als snake_case-velden van de server', async () => {
    await cacheMusicPiece({ id: 'p1', title: 'Bolero', title_id: 't1', pdf_url: '/a.pdf' });

    expect(await getCachedMusicPiece('p1')).toMatchObject({
      id: 'p1',
      titleId: 't1',
      pdfUrl: '/a.pdf',
    });
  });

  it('geeft camelCase voorrang boven snake_case', async () => {
    await cacheMusicPiece({ id: 'p1', title: 'Bolero', titleId: 't-camel', title_id: 't-snake' });

    expect((await getCachedMusicPiece('p1'))?.titleId).toBe('t-camel');
  });

  it('markeert een gecachet stuk als synced met versie 1 als de server niets meldt', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-01T00:00:00.000Z'));

    await cacheMusicPiece({ id: 'p1', title: 'Bolero' });

    expect(await getCachedMusicPiece('p1')).toMatchObject({
      version: 1,
      syncStatus: 'synced',
      lastModified: '2026-07-01T00:00:00.000Z',
    });
  });

  it('bewaart de meegegeven blobs bij het stuk', async () => {
    const pdf = new Blob(['pdf'], { type: 'application/pdf' });
    const thumb = new Blob(['png'], { type: 'image/png' });

    await cacheMusicPiece({ id: 'p1', title: 'Bolero' }, pdf, thumb);

    const opgeslagen = await getCachedMusicPiece('p1');
    expect(opgeslagen?.pdfBlob).toBe(pdf);
    expect(opgeslagen?.thumbnailBlob).toBe(thumb);
  });

  it('overschrijft een eerder gecachet stuk in plaats van te stapelen', async () => {
    await cacheMusicPiece({ id: 'p1', title: 'Oud' });
    await cacheMusicPiece({ id: 'p1', title: 'Nieuw' });

    const alles = await getCachedMusicPieces();
    expect(alles).toHaveLength(1);
    expect(alles[0].title).toBe('Nieuw');
  });

  it('geeft undefined bij een onbekend stuk', async () => {
    expect(await getCachedMusicPiece('bestaat-niet')).toBeUndefined();
  });
});

describe('annotaties', () => {
  const annotatie = (overrides: Record<string, unknown> = {}) => ({
    id: 'a1',
    musicPieceId: 'p1',
    pageNumber: 1,
    annotationType: 'freehand' as const,
    data: '{"punten":[]}',
    color: '#ff0000',
    strokeWidth: 2,
    opacity: 1,
    isShared: false,
    ...overrides,
  });

  it('slaat de annotatie op en zet hem meteen in de synchronisatiewachtrij', async () => {
    zetOnline(false);

    const opgeslagen = await saveAnnotationOffline(annotatie());

    expect(opgeslagen).toMatchObject({ id: 'a1', version: 1, syncStatus: 'pending' });
    expect(await offlineDb.annotations.get('a1')).toMatchObject({ musicPieceId: 'p1', color: '#ff0000' });
    const [item] = await offlineDb.syncQueue.toArray();
    expect(item).toMatchObject({ entityType: 'annotation', entityId: 'a1', action: 'create' });
  });

  it('markeert een annotatie ook online als pending, want de server heeft hem nog niet bevestigd', async () => {
    zetOnline(true);

    const opgeslagen = await saveAnnotationOffline(annotatie({ id: 'a2' }));

    expect(opgeslagen.syncStatus).toBe('pending');
  });

  it('haalt alleen de annotaties van het gevraagde stuk op', async () => {
    zetOnline(false);
    await saveAnnotationOffline(annotatie({ id: 'a1', musicPieceId: 'p1' }));
    await saveAnnotationOffline(annotatie({ id: 'a2', musicPieceId: 'p2' }));

    expect((await getAnnotationsForPiece('p1')).map((a) => a.id)).toEqual(['a1']);
  });

  it('filtert daarnaast op paginanummer', async () => {
    zetOnline(false);
    await saveAnnotationOffline(annotatie({ id: 'a1', pageNumber: 1 }));
    await saveAnnotationOffline(annotatie({ id: 'a2', pageNumber: 2 }));

    expect((await getAnnotationsForPiece('p1', 2)).map((a) => a.id)).toEqual(['a2']);
    expect(await getAnnotationsForPiece('p1', 99)).toEqual([]);
  });

  it('geeft een lege lijst voor een stuk zonder annotaties', async () => {
    expect(await getAnnotationsForPiece('onbekend')).toEqual([]);
  });
});

// =============================================================================
// Verenigingsgrens
// =============================================================================

describe('verenigingsgrens', () => {
  it('gebruikt één database zonder vereniging in de naam of in de sleutels', () => {
    // BEKEND MANKEMENT: de database heet altijd 'HarmonieOfflineDB' en geen
    // enkel record draagt een vereniging- of gebruiker-id. Er is bovendien geen
    // opruimfunctie: uitloggen laat gecachete partijen, annotaties en repetities
    // van de vorige vereniging gewoon staan.
    expect((offlineDb as unknown as { dbNaam: string }).dbNaam).toBe('HarmonieOfflineDB');
    expect(typeof (offlineDb as unknown as Record<string, unknown>).clearAllData).toBe('undefined');
  });

  it('laat gecachete gegevens van de vorige gebruiker staan als alleen localStorage wordt geleegd', async () => {
    await cacheMusicPiece({ id: 'p-a', title: 'Repertoire van vereniging A' });
    zetOnline(false);
    await saveAnnotationOffline({
      id: 'a-a',
      musicPieceId: 'p-a',
      pageNumber: 1,
      annotationType: 'text',
      data: 'geheime notitie',
      color: '#000',
      strokeWidth: 1,
      opacity: 1,
      isShared: false,
    });

    localStorage.clear();

    expect(await getCachedMusicPieces()).toHaveLength(1);
    expect(await getAnnotationsForPiece('p-a')).toHaveLength(1);
  });

  it('houdt de synchronisatiewachtrij van de vorige gebruiker in stand', async () => {
    // De rij wordt bij uitloggen niet geleegd, dus de eerstvolgende gebruiker
    // verstuurt de wijzigingen van zijn voorganger met zíjn token.
    const manager = maakManager(false);
    await manager.queueChange('annotation', 'a-a', 'create', { data: 'notitie van A' });

    localStorage.clear();
    localStorage.setItem('token', 'token-van-gebruiker-B');
    zetOnline(true);
    const nieuweManager = new SyncManager();
    await nieuweManager.processSyncQueue();

    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer token-van-gebruiker-B');
  });
});

describe('gedeelde syncManager', () => {
  it('is één instantie voor de hele app', () => {
    expect(syncManager).toBeInstanceOf(SyncManager);
  });
});
