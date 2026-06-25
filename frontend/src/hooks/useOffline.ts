import { useState, useEffect, useCallback } from 'react';
import { syncManager, offlineDb, ConflictRecord } from '../lib/offlineDb';

/**
 * @description Hook for managing offline state and synchronization.
 * Tracks online/offline status, pending changes, and data conflicts.
 * Provides methods to force sync and resolve conflicts.
 *
 * @returns {Object} Offline state and controls
 * @returns {boolean} returns.isOnline - Whether the device is currently online
 * @returns {boolean} returns.isOffline - Whether the device is currently offline
 * @returns {number} returns.pendingChanges - Count of changes waiting to sync
 * @returns {ConflictRecord[]} returns.conflicts - Array of data conflicts to resolve
 * @returns {boolean} returns.hasConflicts - Whether there are any conflicts
 * @returns {boolean} returns.isSyncing - Whether a sync operation is in progress
 * @returns {Function} returns.forceSync - Manually trigger sync when online
 * @returns {Function} returns.resolveConflict - Resolve a specific conflict
 * @returns {Function} returns.clearOfflineData - Clear all offline cached data
 *
 * @example
 * ```tsx
 * function SyncStatus() {
 *   const { isOnline, pendingChanges, isSyncing, forceSync } = useOffline();
 *
 *   return (
 *     <div>
 *       <span>{isOnline ? 'Online' : 'Offline'}</span>
 *       {pendingChanges > 0 && (
 *         <button onClick={forceSync} disabled={isSyncing}>
 *           Sync {pendingChanges} changes
 *         </button>
 *       )}
 *     </div>
 *   );
 * }
 * ```
 */
export function useOffline() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingChanges, setPendingChanges] = useState(0);
  const [conflicts, setConflicts] = useState<ConflictRecord[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    const unsubscribe = syncManager.onConnectionChange(setIsOnline);

    const updateCounts = async () => {
      const pending = await syncManager.getPendingChangesCount();
      const conflictList = await syncManager.getConflicts();
      setPendingChanges(pending);
      setConflicts(conflictList);
    };

    updateCounts();
    const interval = setInterval(updateCounts, 5000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  const forceSync = useCallback(async () => {
    if (!isOnline || isSyncing) return;

    setIsSyncing(true);
    try {
      await syncManager.processSyncQueue();
      const pending = await syncManager.getPendingChangesCount();
      setPendingChanges(pending);
    } finally {
      setIsSyncing(false);
    }
  }, [isOnline, isSyncing]);

  const resolveConflict = useCallback(async (
    conflictId: string,
    resolution: 'useLocal' | 'useServer' | 'merge',
    mergedData?: any
  ) => {
    await syncManager.resolveConflict(conflictId, resolution, mergedData);
    const conflictList = await syncManager.getConflicts();
    setConflicts(conflictList);
  }, []);

  const clearOfflineData = useCallback(async () => {
    await offlineDb.musicPieces.clear();
    await offlineDb.annotations.clear();
    await offlineDb.rehearsals.clear();
    await offlineDb.practiceLogs.clear();
    await offlineDb.syncQueue.clear();
    await offlineDb.conflicts.clear();
    setPendingChanges(0);
    setConflicts([]);
  }, []);

  return {
    isOnline,
    isOffline: !isOnline,
    pendingChanges,
    conflicts,
    hasConflicts: conflicts.length > 0,
    isSyncing,
    forceSync,
    resolveConflict,
    clearOfflineData,
  };
}

/**
 * @description Hook for fetching data with offline fallback support.
 * Automatically uses cached data when offline and syncs from server when online.
 *
 * @template T - The type of data being fetched
 * @param {Function} fetchOnline - Function to fetch fresh data from server
 * @param {Function} getCached - Function to retrieve cached data
 * @param {Function} cacheData - Function to cache data after fetching
 * @param {any[]} deps - Dependencies that trigger re-fetch
 *
 * @returns {Object} Data fetching state
 * @returns {T | undefined} returns.data - The fetched or cached data
 * @returns {boolean} returns.isLoading - Whether data is being fetched
 * @returns {Error | null} returns.error - Error if fetch failed
 * @returns {boolean} returns.isFromCache - Whether current data is from cache
 *
 * @example
 * ```tsx
 * function MusicList() {
 *   const { data, isLoading, isFromCache } = useOfflineData(
 *     () => api.getMusicPieces(),
 *     () => offlineDb.musicPieces.toArray(),
 *     (data) => offlineDb.musicPieces.bulkPut(data),
 *     []
 *   );
 *
 *   if (isLoading) return <Spinner />;
 *   return (
 *     <div>
 *       {isFromCache && <Badge>Offline data</Badge>}
 *       <List items={data} />
 *     </div>
 *   );
 * }
 * ```
 */
export function useOfflineData<T>(
  fetchOnline: () => Promise<T>,
  getCached: () => Promise<T | undefined>,
  cacheData: (data: T) => Promise<void>,
  deps: any[] = []
) {
  const [data, setData] = useState<T | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isFromCache, setIsFromCache] = useState(false);
  const { isOnline } = useOffline();

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setError(null);

      try {
        if (isOnline) {
          const onlineData = await fetchOnline();
          if (!cancelled) {
            setData(onlineData);
            setIsFromCache(false);
            await cacheData(onlineData);
          }
        } else {
          const cachedData = await getCached();
          if (!cancelled) {
            if (cachedData) {
              setData(cachedData);
              setIsFromCache(true);
            } else {
              setError(new Error('Geen offline data beschikbaar'));
            }
          }
        }
      } catch (err) {
        if (!cancelled) {
          // Try to fall back to cache on error
          const cachedData = await getCached();
          if (cachedData) {
            setData(cachedData);
            setIsFromCache(true);
          } else {
            setError(err as Error);
          }
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [isOnline, ...deps]);

  return { data, isLoading, error, isFromCache };
}
