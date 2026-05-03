import { useState, useEffect, useCallback } from 'react';
import { syncManager, offlineDb, ConflictRecord } from '../lib/offlineDb';

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
