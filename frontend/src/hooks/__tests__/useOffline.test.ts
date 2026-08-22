/**
 * Tests voor de offline-hook.
 *
 * De synchronisatielaag en de lokale database worden gemockt. Waar het om gaat:
 * of de hook meebeweegt met de verbinding, hoe vaak hij de wachtrij natelt, of
 * hij dat tellen ook echt staakt zodra het scherm weg is, en wat er gebeurt als
 * synchroniseren misgaat.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const tabellen = ['musicPieces', 'annotations', 'rehearsals', 'practiceLogs', 'syncQueue', 'conflicts'] as const;

vi.mock('../../lib/offlineDb', () => {
  const db: Record<string, { clear: ReturnType<typeof vi.fn> }> = {};
  for (const naam of ['musicPieces', 'annotations', 'rehearsals', 'practiceLogs', 'syncQueue', 'conflicts']) {
    db[naam] = { clear: vi.fn().mockResolvedValue(undefined) };
  }
  return {
    offlineDb: db,
    syncManager: {
      onConnectionChange: vi.fn(() => vi.fn()),
      getPendingChangesCount: vi.fn().mockResolvedValue(0),
      getConflicts: vi.fn().mockResolvedValue([]),
      processSyncQueue: vi.fn().mockResolvedValue(undefined),
      resolveConflict: vi.fn().mockResolvedValue(undefined),
    },
  };
});

import { useOffline, useOfflineData } from '../useOffline';
import { syncManager, offlineDb } from '../../lib/offlineDb';

const sync = vi.mocked(syncManager);
const db = offlineDb as unknown as Record<(typeof tabellen)[number], { clear: ReturnType<typeof vi.fn> }>;

/** Zet navigator.onLine op de gewenste stand. */
function zetVerbinding(online: boolean) {
  Object.defineProperty(navigator, 'onLine', { value: online, configurable: true });
}

beforeEach(() => {
  vi.clearAllMocks();
  sync.onConnectionChange.mockImplementation(() => vi.fn());
  sync.getPendingChangesCount.mockResolvedValue(0);
  sync.getConflicts.mockResolvedValue([]);
  sync.processSyncQueue.mockResolvedValue(undefined);
  sync.resolveConflict.mockResolvedValue(undefined);
  for (const naam of tabellen) db[naam].clear.mockResolvedValue(undefined);
  zetVerbinding(true);
});

afterEach(() => {
  vi.useRealTimers();
  zetVerbinding(true);
});

describe('useOffline - verbinding', () => {
  it('neemt de huidige verbinding van de browser over', () => {
    zetVerbinding(false);

    const { result } = renderHook(() => useOffline());

    expect(result.current.isOnline).toBe(false);
    expect(result.current.isOffline).toBe(true);
  });

  it('schrijft zich in op verbindingswissels', () => {
    renderHook(() => useOffline());

    expect(sync.onConnectionChange).toHaveBeenCalledTimes(1);
  });

  it('beweegt mee wanneer de verbinding wegvalt en terugkomt', async () => {
    let meld: ((online: boolean) => void) | undefined;
    sync.onConnectionChange.mockImplementation((cb: (online: boolean) => void) => {
      meld = cb;
      return vi.fn();
    });

    const { result } = renderHook(() => useOffline());

    act(() => meld?.(false));
    expect(result.current.isOnline).toBe(false);
    expect(result.current.isOffline).toBe(true);

    act(() => meld?.(true));
    expect(result.current.isOnline).toBe(true);
  });

  it('schrijft zich weer uit bij het opruimen', () => {
    const uitschrijven = vi.fn();
    sync.onConnectionChange.mockReturnValue(uitschrijven);

    const { unmount } = renderHook(() => useOffline());
    expect(uitschrijven).not.toHaveBeenCalled();

    unmount();

    expect(uitschrijven).toHaveBeenCalledTimes(1);
  });
});

describe('useOffline - tellen van openstaande wijzigingen', () => {
  it('telt de wachtrij en de conflicten meteen bij het openen', async () => {
    sync.getPendingChangesCount.mockResolvedValue(3);
    sync.getConflicts.mockResolvedValue([{ id: 'c1' }] as never);

    const { result } = renderHook(() => useOffline());

    await waitFor(() => expect(result.current.pendingChanges).toBe(3));
    expect(result.current.conflicts).toHaveLength(1);
    expect(result.current.hasConflicts).toBe(true);
  });

  it('meldt geen conflicten wanneer de lijst leeg is', async () => {
    const { result } = renderHook(() => useOffline());

    await waitFor(() => expect(sync.getConflicts).toHaveBeenCalled());
    expect(result.current.hasConflicts).toBe(false);
  });

  it('telt elke vijf seconden opnieuw', async () => {
    vi.useFakeTimers();
    renderHook(() => useOffline());

    expect(sync.getPendingChangesCount).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(sync.getPendingChangesCount).toHaveBeenCalledTimes(2);

    await act(async () => {
      vi.advanceTimersByTime(10000);
    });
    expect(sync.getPendingChangesCount).toHaveBeenCalledTimes(4);
  });

  it('stopt met tellen zodra het scherm weg is', async () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(() => useOffline());

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    const naEenRonde = sync.getPendingChangesCount.mock.calls.length;

    unmount();
    await act(async () => {
      vi.advanceTimersByTime(30000);
    });

    expect(sync.getPendingChangesCount).toHaveBeenCalledTimes(naEenRonde);
  });
});

describe('useOffline - handmatig synchroniseren', () => {
  it('verwerkt de wachtrij en telt daarna opnieuw', async () => {
    sync.getPendingChangesCount.mockResolvedValueOnce(2).mockResolvedValue(0);
    const { result } = renderHook(() => useOffline());
    await waitFor(() => expect(result.current.pendingChanges).toBe(2));

    await act(async () => {
      await result.current.forceSync();
    });

    expect(sync.processSyncQueue).toHaveBeenCalledTimes(1);
    expect(result.current.pendingChanges).toBe(0);
    expect(result.current.isSyncing).toBe(false);
  });

  it('synchroniseert niet zonder verbinding', async () => {
    zetVerbinding(false);
    const { result } = renderHook(() => useOffline());

    await act(async () => {
      await result.current.forceSync();
    });

    expect(sync.processSyncQueue).not.toHaveBeenCalled();
  });

  it('laat de knop niet twee synchronisaties tegelijk starten', async () => {
    let losmaken: (() => void) | undefined;
    sync.processSyncQueue.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          losmaken = resolve;
        }),
    );
    const { result } = renderHook(() => useOffline());

    act(() => {
      void result.current.forceSync();
    });
    await waitFor(() => expect(result.current.isSyncing).toBe(true));

    await act(async () => {
      await result.current.forceSync();
    });
    expect(sync.processSyncQueue).toHaveBeenCalledTimes(1);

    await act(async () => {
      losmaken?.();
    });
    await waitFor(() => expect(result.current.isSyncing).toBe(false));
  });

  it('blijft bruikbaar wanneer het synchroniseren stukloopt', async () => {
    sync.processSyncQueue.mockRejectedValue(new Error('server weg'));
    const { result } = renderHook(() => useOffline());

    await act(async () => {
      await expect(result.current.forceSync()).rejects.toThrow('server weg');
    });

    expect(result.current.isSyncing).toBe(false);
  });
});

describe('useOffline - conflicten en opschonen', () => {
  it('lost een conflict op en haalt de lijst daarna opnieuw op', async () => {
    sync.getConflicts
      .mockResolvedValueOnce([{ id: 'c1' }, { id: 'c2' }] as never)
      .mockResolvedValue([{ id: 'c2' }] as never);
    const { result } = renderHook(() => useOffline());
    await waitFor(() => expect(result.current.conflicts).toHaveLength(2));

    await act(async () => {
      await result.current.resolveConflict('c1', 'useLocal');
    });

    expect(sync.resolveConflict).toHaveBeenCalledWith('c1', 'useLocal', undefined);
    expect(result.current.conflicts).toHaveLength(1);
  });

  it('geeft samengevoegde gegevens door bij het oplossen', async () => {
    const { result } = renderHook(() => useOffline());

    await act(async () => {
      await result.current.resolveConflict('c1', 'merge', { titel: 'samen' });
    });

    expect(sync.resolveConflict).toHaveBeenCalledWith('c1', 'merge', { titel: 'samen' });
  });

  it('leegt alle offline tabellen en zet de tellers op nul', async () => {
    sync.getPendingChangesCount.mockResolvedValue(4);
    sync.getConflicts.mockResolvedValue([{ id: 'c1' }] as never);
    const { result } = renderHook(() => useOffline());
    await waitFor(() => expect(result.current.pendingChanges).toBe(4));

    await act(async () => {
      await result.current.clearOfflineData();
    });

    for (const naam of tabellen) {
      expect(db[naam].clear, `tabel ${naam}`).toHaveBeenCalledTimes(1);
    }
    expect(result.current.pendingChanges).toBe(0);
    expect(result.current.conflicts).toEqual([]);
  });
});

describe('useOfflineData', () => {
  it('haalt de gegevens van de server en bewaart ze offline', async () => {
    const vanServer = vi.fn().mockResolvedValue(['a']);
    const uitCache = vi.fn().mockResolvedValue(undefined);
    const bewaren = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() => useOfflineData(vanServer, uitCache, bewaren));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual(['a']);
    expect(result.current.isFromCache).toBe(false);
    expect(bewaren).toHaveBeenCalledWith(['a']);
  });

  it('gebruikt de offline kopie wanneer er geen verbinding is', async () => {
    zetVerbinding(false);
    const vanServer = vi.fn();
    const uitCache = vi.fn().mockResolvedValue(['oud']);

    const { result } = renderHook(() => useOfflineData(vanServer, uitCache, vi.fn()));

    await waitFor(() => expect(result.current.data).toEqual(['oud']));
    expect(result.current.isFromCache).toBe(true);
    expect(vanServer).not.toHaveBeenCalled();
  });

  it('meldt het wanneer er offline niets bewaard is', async () => {
    zetVerbinding(false);
    const { result } = renderHook(() => useOfflineData(vi.fn(), vi.fn().mockResolvedValue(undefined), vi.fn()));

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error?.message).toBe('Geen offline data beschikbaar');
  });

  it('valt terug op de offline kopie wanneer de server een fout geeft', async () => {
    const vanServer = vi.fn().mockRejectedValue(new Error('500'));
    const uitCache = vi.fn().mockResolvedValue(['oud']);

    const { result } = renderHook(() => useOfflineData(vanServer, uitCache, vi.fn()));

    await waitFor(() => expect(result.current.data).toEqual(['oud']));
    expect(result.current.isFromCache).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('geeft de fout door wanneer er ook offline niets ligt', async () => {
    const vanServer = vi.fn().mockRejectedValue(new Error('500'));

    const { result } = renderHook(() => useOfflineData(vanServer, vi.fn().mockResolvedValue(undefined), vi.fn()));

    await waitFor(() => expect(result.current.error?.message).toBe('500'));
    expect(result.current.data).toBeUndefined();
  });

  it('haalt opnieuw op wanneer een meegegeven afhankelijkheid verandert', async () => {
    const vanServer = vi.fn().mockResolvedValue(['a']);
    const { rerender, result } = renderHook(({ id }) => useOfflineData(vanServer, vi.fn(), vi.fn(), [id]), {
      initialProps: { id: 1 },
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(vanServer).toHaveBeenCalledTimes(1);

    rerender({ id: 2 });

    await waitFor(() => expect(vanServer).toHaveBeenCalledTimes(2));
  });
});
