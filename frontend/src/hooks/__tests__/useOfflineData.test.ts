/**
 * Tests voor de synchronisatiehook tussen API en IndexedDB.
 *
 * De opslaglaag en de API worden allebei gemockt: hier gaat het om de vraag
 * wát er wordt bewaard, wanneer er wordt teruggevallen op offline gegevens en
 * wat er met een nog niet verstuurde wijziging gebeurt als de server nee zegt.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';

vi.mock('../../lib/offlineStorage', () => ({
  getAllSyncMetadata: vi.fn(),
  getPendingMutations: vi.fn(),
  removePendingMutation: vi.fn(),
  updatePendingMutationRetry: vi.fn(),
  saveUserProfile: vi.fn(),
  saveOrchestras: vi.fn(),
  saveInstruments: vi.fn(),
  saveGenres: vi.fn(),
  saveMusicPieces: vi.fn(),
  saveMusicTitles: vi.fn(),
  saveFavorites: vi.fn(),
  saveRecentViews: vi.fn(),
  saveRehearsals: vi.fn(),
  getUserProfile: vi.fn(),
  getMusicPieces: vi.fn(),
  getMusicTitles: vi.fn(),
  getOrchestras: vi.fn(),
  getInstruments: vi.fn(),
  getGenres: vi.fn(),
  getFavorites: vi.fn(),
  getRecentViews: vi.fn(),
  getRehearsals: vi.fn(),
  clearAllData: vi.fn(),
}));

vi.mock('../../api', () => ({
  getProfile: vi.fn(),
  getOrchestras: vi.fn(),
  getInstruments: vi.fn(),
  getGenres: vi.fn(),
  getMusicPieces: vi.fn(),
  getMusicTitles: vi.fn(),
  getFavorites: vi.fn(),
  getRecentViews: vi.fn(),
  getRehearsals: vi.fn(),
}));

import { useOfflineData, useOnlineStatus, useSyncStatus, useAutoSync } from '../useOfflineData';
import * as offlineStorage from '../../lib/offlineStorage';
import * as api from '../../api';

const opslag = vi.mocked(offlineStorage);
const server = vi.mocked(api);

let queryClient: QueryClient;
let fetchMock: ReturnType<typeof vi.fn>;

const wrapper = ({ children }: { children: React.ReactNode }) =>
  createElement(QueryClientProvider, { client: queryClient }, children);

function zetOnline(online: boolean) {
  Object.defineProperty(navigator, 'onLine', { value: online, configurable: true });
}

function antwoord(status: number) {
  return { ok: status >= 200 && status < 300, status } as Response;
}

const wachtendeWijziging = (overrides: Partial<offlineStorage.PendingMutation> = {}) => ({
  id: 1,
  type: 'favorite',
  endpoint: '/api/favorites',
  method: 'POST' as const,
  data: { musicTitleId: 't1' },
  createdAt: '2026-01-01T00:00:00.000Z',
  retryCount: 0,
  ...overrides,
});

/** Rendert de hook en wacht tot de opstart-effecten klaar zijn. */
async function rendereerHook() {
  const uitkomst = renderHook(() => useOfflineData(), { wrapper });
  await waitFor(() => expect(opslag.getAllSyncMetadata).toHaveBeenCalled());
  return uitkomst;
}

beforeEach(() => {
  vi.clearAllMocks();
  zetOnline(true);
  localStorage.clear();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

  opslag.getAllSyncMetadata.mockResolvedValue([]);
  opslag.getPendingMutations.mockResolvedValue([]);
  for (const bewaarFunctie of [
    opslag.saveUserProfile,
    opslag.saveOrchestras,
    opslag.saveInstruments,
    opslag.saveGenres,
    opslag.saveMusicPieces,
    opslag.saveMusicTitles,
    opslag.saveFavorites,
    opslag.saveRecentViews,
    opslag.saveRehearsals,
    opslag.removePendingMutation,
    opslag.updatePendingMutationRetry,
    opslag.clearAllData,
  ]) {
    bewaarFunctie.mockResolvedValue(undefined as never);
  }

  server.getProfile.mockResolvedValue({} as never);
  server.getOrchestras.mockResolvedValue([]);
  server.getInstruments.mockResolvedValue([]);
  server.getGenres.mockResolvedValue([]);
  server.getMusicPieces.mockResolvedValue([]);
  server.getMusicTitles.mockResolvedValue([]);
  server.getFavorites.mockResolvedValue([]);
  server.getRecentViews.mockResolvedValue([]);
  server.getRehearsals.mockResolvedValue([]);

  fetchMock = vi.fn().mockResolvedValue(antwoord(200));
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// =============================================================================
// Beginstatus
// =============================================================================

describe('beginstatus', () => {
  it('start idle en online wanneer de browser online is', async () => {
    const { result } = await rendereerHook();

    expect(result.current.syncState.isOnline).toBe(true);
    await waitFor(() => expect(result.current.syncState.status).toBe('idle'));
    expect(result.current.syncState.error).toBeNull();
  });

  it('start als offline wanneer de browser offline is', async () => {
    zetOnline(false);

    const { result } = await rendereerHook();

    await waitFor(() => expect(result.current.syncState.status).toBe('offline'));
    expect(result.current.syncState.isOnline).toBe(false);
  });

  it('neemt het meest recente synchronisatiemoment over alle soorten gegevens', async () => {
    opslag.getAllSyncMetadata.mockResolvedValue([
      { key: 'genres', lastSyncAt: '2026-01-01T10:00:00.000Z', version: 1 },
      { key: 'orchestras', lastSyncAt: '2026-03-01T10:00:00.000Z', version: 1 },
      { key: 'instruments', lastSyncAt: '2026-02-01T10:00:00.000Z', version: 1 },
    ]);

    const { result } = await rendereerHook();

    await waitFor(() => expect(result.current.syncState.lastSyncAt).toBe('2026-03-01T10:00:00.000Z'));
  });

  it('houdt lastSyncAt op null wanneer er nog nooit is gesynchroniseerd', async () => {
    const { result } = await rendereerHook();

    await waitFor(() => expect(opslag.getPendingMutations).toHaveBeenCalled());
    expect(result.current.syncState.lastSyncAt).toBeNull();
  });

  it('toont hoeveel wijzigingen er nog in de rij staan', async () => {
    opslag.getPendingMutations.mockResolvedValue([wachtendeWijziging({ id: 1 }), wachtendeWijziging({ id: 2 })]);

    const { result } = await rendereerHook();

    await waitFor(() => expect(result.current.syncState.pendingMutations).toBe(2));
  });

  it('blijft bruikbaar wanneer de opslag niet gelezen kan worden', async () => {
    // Een leesfout in IndexedDB (privémodus, corrupte database) mag de hook niet
    // laten klappen: de app draait dan gewoon zonder offline gegevens verder.
    opslag.getAllSyncMetadata.mockRejectedValue(new Error('IndexedDB stuk'));

    const { result } = await rendereerHook();

    await waitFor(() => expect(console.error).toHaveBeenCalled());
    expect(result.current.syncState.status).toBe('idle');
    expect(result.current.syncState.lastSyncAt).toBeNull();
  });
});

describe('verbindingswissels', () => {
  it('schakelt naar offline zodra de verbinding wegvalt', async () => {
    const { result } = await rendereerHook();

    act(() => {
      zetOnline(false);
      window.dispatchEvent(new Event('offline'));
    });

    await waitFor(() => expect(result.current.syncState.status).toBe('offline'));
    expect(result.current.syncState.isOnline).toBe(false);
  });

  it('schakelt terug naar idle zodra de verbinding terugkomt', async () => {
    zetOnline(false);
    const { result } = await rendereerHook();
    await waitFor(() => expect(result.current.syncState.status).toBe('offline'));

    act(() => {
      zetOnline(true);
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() => expect(result.current.syncState.status).toBe('idle'));
  });
});

// =============================================================================
// Eén soort gegevens synchroniseren
// =============================================================================

describe('syncEntity', () => {
  it('weigert te synchroniseren zonder verbinding', async () => {
    zetOnline(false);
    const { result } = await rendereerHook();

    await expect(result.current.syncEntity('orchestras')).rejects.toThrow('Cannot sync while offline');
    expect(server.getOrchestras).not.toHaveBeenCalled();
  });

  it('haalt het profiel op en bewaart het offline', async () => {
    const profiel = { id: 'u1', email: 'lid@a.nl' } as never;
    server.getProfile.mockResolvedValue(profiel);
    const { result } = await rendereerHook();

    await act(async () => {
      await result.current.syncEntity('userProfile');
    });

    expect(opslag.saveUserProfile).toHaveBeenCalledWith(profiel);
  });

  it('bewaart orkesten, instrumenten en genres ongewijzigd', async () => {
    server.getOrchestras.mockResolvedValue([{ id: 'o1', name: 'Harmonie A' }]);
    server.getInstruments.mockResolvedValue([{ id: 'i1', name: 'Klarinet', tuning: null }]);
    server.getGenres.mockResolvedValue([{ id: 'g1', name: 'Klassiek' }]);
    const { result } = await rendereerHook();

    await act(async () => {
      await result.current.syncEntity('orchestras');
      await result.current.syncEntity('instruments');
      await result.current.syncEntity('genres');
    });

    expect(opslag.saveOrchestras).toHaveBeenCalledWith([{ id: 'o1', name: 'Harmonie A' }]);
    expect(opslag.saveInstruments).toHaveBeenCalledWith([{ id: 'i1', name: 'Klarinet', tuning: null }]);
    expect(opslag.saveGenres).toHaveBeenCalledWith([{ id: 'g1', name: 'Klassiek' }]);
  });

  it('haalt muziekstukken en -titels zonder filter op, zodat de hele voorraad offline komt', async () => {
    const { result } = await rendereerHook();

    await act(async () => {
      await result.current.syncEntity('musicPieces');
      await result.current.syncEntity('musicTitles');
    });

    expect(server.getMusicPieces).toHaveBeenCalledWith();
    expect(server.getMusicTitles).toHaveBeenCalledWith();
  });

  it('bewaart het moment waarop een favoriet is toegevoegd', async () => {
    server.getFavorites.mockResolvedValue([
      {
        id: 't-bolero',
        title: 'Bolero',
        arranger: 'Ravel',
        youtubeUrl: null,
        durationSeconds: 900,
        grade: null,
        pieceCount: 3,
        favoritedAt: '2025-03-01T09:00:00.000Z',
      },
    ]);
    const { result } = await rendereerHook();

    await act(async () => {
      await result.current.syncEntity('favorites');
    });

    expect(opslag.saveFavorites).toHaveBeenCalledWith([
      {
        id: 't-bolero',
        musicTitleId: 't-bolero',
        title: 'Bolero',
        arranger: 'Ravel',
        addedAt: '2025-03-01T09:00:00.000Z',
      },
    ]);
  });

  it('valt terug op nu wanneer de server geen datum bij de favoriet meestuurt', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-21T12:00:00.000Z'));
    server.getFavorites.mockResolvedValue([{ id: 't1', title: 'Bolero', arranger: null } as never]);
    const { result } = renderHook(() => useOfflineData(), { wrapper });

    await act(async () => {
      await result.current.syncEntity('favorites');
    });

    expect(opslag.saveFavorites).toHaveBeenCalledWith([
      expect.objectContaining({ addedAt: '2026-08-21T12:00:00.000Z' }),
    ]);
  });

  it('leest recent bekeken items in zowel camelCase als snake_case', async () => {
    server.getRecentViews.mockResolvedValue([
      { id: 'v1', itemType: 'music_title', itemId: 't1', itemTitle: 'Bolero', viewedAt: '2026-01-01T10:00:00.000Z' },
      {
        id: 'v2',
        item_type: 'rehearsal',
        item_id: 'r1',
        item_title: 'Repetitie',
        viewed_at: '2026-01-02T10:00:00.000Z',
      } as never,
    ]);
    const { result } = await rendereerHook();

    await act(async () => {
      await result.current.syncEntity('recentViews');
    });

    expect(opslag.saveRecentViews).toHaveBeenCalledWith([
      { id: 'v1', itemType: 'music_title', itemId: 't1', itemTitle: 'Bolero', viewedAt: '2026-01-01T10:00:00.000Z' },
      { id: 'v2', itemType: 'rehearsal', itemId: 'r1', itemTitle: 'Repetitie', viewedAt: '2026-01-02T10:00:00.000Z' },
    ]);
  });

  it('haalt repetities op van een maand terug tot drie maanden vooruit', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T10:00:00.000Z'));
    const { result } = renderHook(() => useOfflineData(), { wrapper });

    await act(async () => {
      await result.current.syncEntity('rehearsals');
    });

    expect(server.getRehearsals).toHaveBeenCalledWith('2026-05-15', '2026-09-15');
  });

  it('ververst de bijbehorende querycache na het synchroniseren', async () => {
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = await rendereerHook();

    await act(async () => {
      await result.current.syncEntity('genres');
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['genres'] });
  });

  it('geeft een serverfout door aan de aanroeper en bewaart niets', async () => {
    server.getGenres.mockRejectedValue(new Error('500 van de server'));
    const { result } = await rendereerHook();

    await expect(
      act(async () => {
        await result.current.syncEntity('genres');
      }),
    ).rejects.toThrow('500 van de server');
    expect(opslag.saveGenres).not.toHaveBeenCalled();
  });

  it('geeft een opslagfout door in plaats van hem te verzwijgen', async () => {
    // Een vol quotum tijdens het synchroniseren moet zichtbaar worden, anders
    // denkt de gebruiker dat alles offline beschikbaar is.
    opslag.saveGenres.mockRejectedValue(new Error('QuotaExceededError'));
    const { result } = await rendereerHook();

    await expect(
      act(async () => {
        await result.current.syncEntity('genres');
      }),
    ).rejects.toThrow('QuotaExceededError');
  });
});

// =============================================================================
// Alles synchroniseren
// =============================================================================

describe('syncAll', () => {
  it('synchroniseert alle soorten gegevens en eindigt op success', async () => {
    const { result } = await rendereerHook();

    await act(async () => {
      await result.current.syncAll();
    });

    expect(server.getProfile).toHaveBeenCalled();
    expect(server.getOrchestras).toHaveBeenCalled();
    expect(server.getInstruments).toHaveBeenCalled();
    expect(server.getGenres).toHaveBeenCalled();
    expect(server.getMusicPieces).toHaveBeenCalled();
    expect(server.getMusicTitles).toHaveBeenCalled();
    expect(server.getFavorites).toHaveBeenCalled();
    expect(server.getRecentViews).toHaveBeenCalled();
    expect(server.getRehearsals).toHaveBeenCalled();
    expect(result.current.syncState.status).toBe('success');
    expect(result.current.syncState.progress).toEqual({ current: 9, total: 9, currentEntity: null });
  });

  it('gaat door na een mislukt onderdeel en verzamelt de fouten', async () => {
    server.getGenres.mockRejectedValue(new Error('genres kapot'));
    const { result } = await rendereerHook();

    await act(async () => {
      await result.current.syncAll();
    });

    expect(result.current.syncState.status).toBe('error');
    expect(result.current.syncState.error).toContain('genres: genres kapot');
    expect(server.getRehearsals).toHaveBeenCalled();
  });

  it('doet niets zonder verbinding en meldt dat als offline', async () => {
    zetOnline(false);
    const { result } = await rendereerHook();

    await act(async () => {
      await result.current.syncAll();
    });

    expect(server.getProfile).not.toHaveBeenCalled();
    expect(result.current.syncState.status).toBe('offline');
  });

  it('slaat een tweede poging binnen vijf minuten over', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T10:00:00.000Z'));
    const { result } = renderHook(() => useOfflineData(), { wrapper });

    await act(async () => {
      await result.current.syncAll();
    });
    const naEerste = server.getProfile.mock.calls.length;

    vi.setSystemTime(new Date('2026-06-15T10:04:59.999Z'));
    await act(async () => {
      await result.current.syncAll();
    });

    expect(server.getProfile).toHaveBeenCalledTimes(naEerste);
  });

  it('synchroniseert precies op de grens van vijf minuten weer', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T10:00:00.000Z'));
    const { result } = renderHook(() => useOfflineData(), { wrapper });

    await act(async () => {
      await result.current.syncAll();
    });
    const naEerste = server.getProfile.mock.calls.length;

    vi.setSystemTime(new Date('2026-06-15T10:05:00.000Z'));
    await act(async () => {
      await result.current.syncAll();
    });

    expect(server.getProfile.mock.calls.length).toBe(naEerste + 1);
  });

  it('start geen tweede synchronisatie zolang de eerste loopt', async () => {
    let laatProfielLos: () => void = () => undefined;
    server.getProfile.mockImplementation(() => new Promise((resolve) => (laatProfielLos = () => resolve({} as never))));
    const { result } = await rendereerHook();

    let eerste: Promise<void>;
    act(() => {
      eerste = result.current.syncAll();
    });
    await act(async () => {
      await result.current.syncAll();
    });

    expect(server.getProfile).toHaveBeenCalledTimes(1);

    await act(async () => {
      laatProfielLos();
      await eerste!;
    });
  });

  it('zet de status na drie seconden terug op idle', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T10:00:00.000Z'));
    const { result } = renderHook(() => useOfflineData(), { wrapper });

    await act(async () => {
      await result.current.syncAll();
    });
    expect(result.current.syncState.status).toBe('success');

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    expect(result.current.syncState.status).toBe('idle');
  });
});

// =============================================================================
// Wachtrij met wijzigingen
// =============================================================================

describe('processPendingMutations', () => {
  it('raakt de wachtrij niet aan zolang de gebruiker offline is', async () => {
    zetOnline(false);
    const { result } = await rendereerHook();
    opslag.getPendingMutations.mockClear();

    await act(async () => {
      await result.current.processPendingMutations();
    });

    expect(opslag.getPendingMutations).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('doet niets wanneer de rij leeg is', async () => {
    const { result } = await rendereerHook();

    await act(async () => {
      await result.current.processPendingMutations();
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('verstuurt de wijziging met token en gegevens en haalt hem daarna uit de rij', async () => {
    localStorage.setItem('token', 'abc123');
    opslag.getPendingMutations.mockResolvedValueOnce([wachtendeWijziging()]).mockResolvedValue([]);
    const { result } = await rendereerHook();

    await act(async () => {
      await result.current.processPendingMutations();
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/favorites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer abc123' },
      body: JSON.stringify({ musicTitleId: 't1' }),
    });
    expect(opslag.removePendingMutation).toHaveBeenCalledWith(1);
  });

  it('stuurt geen body mee als de wijziging geen gegevens heeft', async () => {
    opslag.getPendingMutations.mockResolvedValueOnce([wachtendeWijziging({ data: undefined, method: 'DELETE' })]);
    const { result } = await rendereerHook();

    await act(async () => {
      await result.current.processPendingMutations();
    });

    expect(fetchMock.mock.calls[0][1].body).toBeUndefined();
  });

  it('houdt de wijziging in de rij en telt een poging op bij een serverfout', async () => {
    opslag.getPendingMutations.mockResolvedValue([wachtendeWijziging()]);
    fetchMock.mockResolvedValue(antwoord(503));
    const { result } = await rendereerHook();

    await act(async () => {
      await result.current.processPendingMutations();
    });

    expect(opslag.updatePendingMutationRetry).toHaveBeenCalledWith(1);
    expect(opslag.removePendingMutation).not.toHaveBeenCalled();
  });

  it('houdt de wijziging in de rij bij een netwerkfout', async () => {
    opslag.getPendingMutations.mockResolvedValue([wachtendeWijziging()]);
    fetchMock.mockRejectedValue(new Error('Failed to fetch'));
    const { result } = await rendereerHook();

    await act(async () => {
      await result.current.processPendingMutations();
    });

    expect(opslag.updatePendingMutationRetry).toHaveBeenCalledWith(1);
    expect(opslag.removePendingMutation).not.toHaveBeenCalled();
  });

  it('gooit een wijziging weg zodra de server hem afkeurt met een 4xx', async () => {
    // VASTGELEGD GEDRAG: bij elke clientfout verdwijnt de wijziging definitief.
    // Voor een 400 of 422 is dat verdedigbaar, maar het geldt ook voor 401
    // (token verlopen), 409 (conflict) en 429 (te veel verzoeken): daar gaat
    // werk van de gebruiker geruisloos verloren. Zie het rapport.
    opslag.getPendingMutations.mockResolvedValueOnce([wachtendeWijziging()]).mockResolvedValue([]);
    fetchMock.mockResolvedValue(antwoord(401));
    const { result } = await rendereerHook();

    await act(async () => {
      await result.current.processPendingMutations();
    });

    expect(opslag.removePendingMutation).toHaveBeenCalledWith(1);
    expect(opslag.updatePendingMutationRetry).not.toHaveBeenCalled();
  });

  it('gooit ook een conflict (409) weg zonder de gebruiker iets te vragen', async () => {
    opslag.getPendingMutations.mockResolvedValueOnce([wachtendeWijziging()]).mockResolvedValue([]);
    fetchMock.mockResolvedValue(antwoord(409));
    const { result } = await rendereerHook();

    await act(async () => {
      await result.current.processPendingMutations();
    });

    expect(opslag.removePendingMutation).toHaveBeenCalledWith(1);
  });

  it('slaat een wijziging zonder id over in plaats van de verkeerde te verwijderen', async () => {
    opslag.getPendingMutations.mockResolvedValue([wachtendeWijziging({ id: undefined })]);
    const { result } = await rendereerHook();

    await act(async () => {
      await result.current.processPendingMutations();
    });

    expect(opslag.removePendingMutation).not.toHaveBeenCalled();
  });

  it('verwerkt elke wijziging in de rij afzonderlijk', async () => {
    opslag.getPendingMutations
      .mockResolvedValueOnce([wachtendeWijziging({ id: 1 }), wachtendeWijziging({ id: 2, endpoint: '/api/x' })])
      .mockResolvedValue([]);
    fetchMock.mockResolvedValueOnce(antwoord(200)).mockResolvedValueOnce(antwoord(500));
    const { result } = await rendereerHook();

    await act(async () => {
      await result.current.processPendingMutations();
    });

    expect(opslag.removePendingMutation).toHaveBeenCalledWith(1);
    expect(opslag.updatePendingMutationRetry).toHaveBeenCalledWith(2);
  });

  it('werkt de teller bij met wat er na afloop nog in de rij staat', async () => {
    opslag.getPendingMutations
      .mockResolvedValueOnce([wachtendeWijziging({ id: 1 }), wachtendeWijziging({ id: 2 })])
      .mockResolvedValue([wachtendeWijziging({ id: 2 })]);
    const { result } = await rendereerHook();

    await act(async () => {
      await result.current.processPendingMutations();
    });

    await waitFor(() => expect(result.current.syncState.pendingMutations).toBe(1));
  });
});

// =============================================================================
// Gegevens ophalen met terugval
// =============================================================================

describe('gegevens ophalen', () => {
  it('haalt het profiel online op en bewaart het meteen offline', async () => {
    const profiel = { id: 'u1' } as never;
    server.getProfile.mockResolvedValue(profiel);
    const { result } = await rendereerHook();

    await act(async () => {
      expect(await result.current.getUserProfile()).toBe(profiel);
    });

    expect(opslag.saveUserProfile).toHaveBeenCalledWith(profiel);
    expect(opslag.getUserProfile).not.toHaveBeenCalled();
  });

  it('valt terug op de offline kopie wanneer de server niet reageert', async () => {
    server.getProfile.mockRejectedValue(new Error('Netwerk weg'));
    opslag.getUserProfile.mockResolvedValue({ id: 'offline-u1' } as never);
    const { result } = await rendereerHook();

    await act(async () => {
      expect(await result.current.getUserProfile()).toMatchObject({ id: 'offline-u1' });
    });
  });

  it('vraagt de server niet eens wanneer de gebruiker offline is', async () => {
    zetOnline(false);
    opslag.getOrchestras.mockResolvedValue([{ id: 'o1', name: 'Harmonie A' }]);
    const { result } = await rendereerHook();

    await act(async () => {
      expect(await result.current.getOrchestras()).toHaveLength(1);
    });

    expect(server.getOrchestras).not.toHaveBeenCalled();
  });

  it('bewaart instrumenten en genres bij elke online oproep', async () => {
    const { result } = await rendereerHook();

    await act(async () => {
      await result.current.getInstruments();
      await result.current.getGenres();
    });

    expect(opslag.saveInstruments).toHaveBeenCalled();
    expect(opslag.saveGenres).toHaveBeenCalled();
  });

  it('cachet muziekstukken alleen wanneer de volledige lijst is opgehaald', async () => {
    const { result } = await rendereerHook();

    await act(async () => {
      await result.current.getMusicPieces();
    });
    expect(opslag.saveMusicPieces).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.getMusicPieces({ search: 'bolero' });
      await result.current.getMusicPieces({ instrumentId: 'i1' });
      await result.current.getMusicPieces({ orchestraId: 'o1' });
    });

    expect(opslag.saveMusicPieces).toHaveBeenCalledTimes(1);
  });

  it('cachet muziektitels alleen zonder zoek- of genrefilter', async () => {
    const { result } = await rendereerHook();

    await act(async () => {
      await result.current.getMusicTitles();
      await result.current.getMusicTitles({ search: 'bolero' });
      await result.current.getMusicTitles({ genreId: 'g1' });
    });

    expect(opslag.saveMusicTitles).toHaveBeenCalledTimes(1);
  });

  it('geeft het filter door aan de offline opslag bij een terugval', async () => {
    server.getMusicPieces.mockRejectedValue(new Error('offline'));
    opslag.getMusicPieces.mockResolvedValue([]);
    const { result } = await rendereerHook();

    await act(async () => {
      await result.current.getMusicPieces({ search: 'bolero' });
    });

    expect(opslag.getMusicPieces).toHaveBeenCalledWith({ search: 'bolero' });
  });

  it('bewaart favorieten met hun oorspronkelijke datum', async () => {
    server.getFavorites.mockResolvedValue([
      {
        id: 't-bolero',
        title: 'Bolero',
        arranger: null,
        youtubeUrl: null,
        durationSeconds: 0,
        grade: null,
        pieceCount: 1,
        favoritedAt: '2025-12-24T18:00:00.000Z',
      },
    ]);
    const { result } = await rendereerHook();

    let favorieten: offlineStorage.StoredFavorite[] = [];
    await act(async () => {
      favorieten = await result.current.getFavorites();
    });

    expect(favorieten).toEqual([
      {
        id: 't-bolero',
        musicTitleId: 't-bolero',
        title: 'Bolero',
        arranger: null,
        addedAt: '2025-12-24T18:00:00.000Z',
      },
    ]);
    expect(opslag.saveFavorites).toHaveBeenCalledWith(favorieten);
  });

  it('cachet recent bekeken items alleen zonder type of limiet', async () => {
    const { result } = await rendereerHook();

    await act(async () => {
      await result.current.getRecentViews();
      await result.current.getRecentViews('rehearsal');
      await result.current.getRecentViews(undefined, 5);
    });

    expect(opslag.saveRecentViews).toHaveBeenCalledTimes(1);
  });

  it('negeert het orkestfilter zolang er verbinding is', async () => {
    // BEKEND MANKEMENT: online gaat alleen de periode naar de server en komt de
    // volledige lijst ongefilterd terug, terwijl offline wél op orkest wordt
    // gefilterd. Dezelfde aanroep geeft dus verschillende repetities,
    // afhankelijk van of er verbinding is.
    server.getRehearsals.mockResolvedValue([
      { id: 'r1', orchestra_id: 'o1' } as never,
      { id: 'r2', orchestra_id: 'o2' } as never,
    ]);
    const { result } = await rendereerHook();

    let repetities: unknown[] = [];
    await act(async () => {
      repetities = await result.current.getRehearsals({ startDate: '2026-01-01', orchestraId: 'o1' });
    });

    expect(server.getRehearsals).toHaveBeenCalledWith('2026-01-01', undefined);
    expect(repetities).toHaveLength(2);
  });

  it('filtert repetities offline wél op orkest', async () => {
    zetOnline(false);
    opslag.getRehearsals.mockResolvedValue([{ id: 'r1' } as never]);
    const { result } = await rendereerHook();

    await act(async () => {
      await result.current.getRehearsals({ orchestraId: 'o1' });
    });

    expect(opslag.getRehearsals).toHaveBeenCalledWith({ orchestraId: 'o1' });
  });
});

// =============================================================================
// Opruimen
// =============================================================================

describe('clearOfflineData', () => {
  it('wist de opslag en zet de teller en het synchronisatiemoment terug', async () => {
    opslag.getAllSyncMetadata.mockResolvedValue([{ key: 'genres', lastSyncAt: '2026-01-01', version: 1 }]);
    opslag.getPendingMutations.mockResolvedValue([wachtendeWijziging()]);
    const { result } = await rendereerHook();
    await waitFor(() => expect(result.current.syncState.pendingMutations).toBe(1));

    await act(async () => {
      await result.current.clearOfflineData();
    });

    expect(opslag.clearAllData).toHaveBeenCalled();
    expect(result.current.syncState.lastSyncAt).toBeNull();
    expect(result.current.syncState.pendingMutations).toBe(0);
  });
});

// =============================================================================
// Afgeleide hooks
// =============================================================================

describe('useOnlineStatus', () => {
  it('volgt de verbinding van de browser', async () => {
    zetOnline(true);
    const { result } = renderHook(() => useOnlineStatus());

    expect(result.current).toBe(true);

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current).toBe(false);

    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(result.current).toBe(true);
  });

  it('luistert niet meer na het opruimen van de component', () => {
    const verwijder = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useOnlineStatus());

    unmount();

    expect(verwijder).toHaveBeenCalledWith('online', expect.any(Function));
    expect(verwijder).toHaveBeenCalledWith('offline', expect.any(Function));
  });
});

describe('useSyncStatus', () => {
  it('vat de status samen voor de indicator in de interface', async () => {
    opslag.getAllSyncMetadata.mockResolvedValue([
      { key: 'genres', lastSyncAt: '2026-02-02T10:00:00.000Z', version: 1 },
    ]);
    opslag.getPendingMutations.mockResolvedValue([wachtendeWijziging()]);
    const { result } = renderHook(() => useSyncStatus(), { wrapper });

    await waitFor(() => expect(result.current.lastSyncAt).toBe('2026-02-02T10:00:00.000Z'));
    expect(result.current.isOnline).toBe(true);
    expect(result.current.isSyncing).toBe(false);
    expect(result.current.pendingMutations).toBe(1);
    expect(result.current.error).toBeNull();
  });

  it('houdt de voortgang op nul zolang er niets te synchroniseren valt', () => {
    const { result } = renderHook(() => useSyncStatus(), { wrapper });

    expect(result.current.syncProgress).toBe(0);
    expect(result.current.currentEntity).toBeNull();
  });
});

describe('useAutoSync', () => {
  it('synchroniseert twee seconden na het opstarten', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T10:00:00.000Z'));
    renderHook(() => useAutoSync(), { wrapper });

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    await vi.waitFor(() => expect(server.getProfile).toHaveBeenCalled());
  });

  it('synchroniseert niet wanneer het uitgezet is', async () => {
    vi.useFakeTimers();
    renderHook(() => useAutoSync(false), { wrapper });

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    expect(server.getProfile).not.toHaveBeenCalled();
  });

  it('synchroniseert niet zonder verbinding', async () => {
    zetOnline(false);
    vi.useFakeTimers();
    renderHook(() => useAutoSync(), { wrapper });

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    expect(server.getProfile).not.toHaveBeenCalled();
  });
});
