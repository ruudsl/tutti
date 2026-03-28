/**
 * Hook for managing offline data synchronization
 * Syncs data from API to IndexedDB when online, reads from IndexedDB when offline.
 * Provides sync status and auto-syncs on app start and "online" events.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import * as offlineStorage from '../lib/offlineStorage';
import * as api from '../api';
import type {
  User,
  Instrument,
  Orchestra,
  MusicPiece,
  MusicTitle,
  Rehearsal,
  Genre,
} from '../types';

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error' | 'offline';

export interface SyncState {
  status: SyncStatus;
  lastSyncAt: string | null;
  error: string | null;
  pendingMutations: number;
  isOnline: boolean;
  progress: {
    current: number;
    total: number;
    currentEntity: string | null;
  };
}

export interface OfflineDataHook {
  // Sync state
  syncState: SyncState;

  // Sync operations
  syncAll: () => Promise<void>;
  syncEntity: (entity: SyncableEntity) => Promise<void>;

  // Data accessors (will use offline data when offline)
  getUserProfile: () => Promise<User | undefined>;
  getMusicPieces: (filters?: { orchestraId?: string; instrumentId?: string; search?: string }) => Promise<MusicPiece[]>;
  getMusicTitles: (filters?: { search?: string; genreId?: string }) => Promise<MusicTitle[]>;
  getOrchestras: () => Promise<Orchestra[]>;
  getInstruments: () => Promise<Instrument[]>;
  getGenres: () => Promise<Genre[]>;
  getFavorites: () => Promise<offlineStorage.StoredFavorite[]>;
  getRecentViews: (type?: string, limit?: number) => Promise<offlineStorage.StoredRecentView[]>;
  getRehearsals: (filters?: { startDate?: string; endDate?: string; orchestraId?: string }) => Promise<Rehearsal[]>;

  // Pending mutations
  processPendingMutations: () => Promise<void>;
  clearOfflineData: () => Promise<void>;
}

export type SyncableEntity =
  | 'userProfile'
  | 'musicPieces'
  | 'musicTitles'
  | 'orchestras'
  | 'instruments'
  | 'genres'
  | 'favorites'
  | 'recentViews'
  | 'rehearsals';

const ALL_ENTITIES: SyncableEntity[] = [
  'userProfile',
  'orchestras',
  'instruments',
  'genres',
  'musicPieces',
  'musicTitles',
  'favorites',
  'recentViews',
  'rehearsals',
];

// Minimum time between syncs (5 minutes)
const MIN_SYNC_INTERVAL = 5 * 60 * 1000;

/**
 * Main hook for offline data management
 */
export function useOfflineData(): OfflineDataHook {
  const queryClient = useQueryClient();
  const syncInProgress = useRef(false);
  const lastSyncAttempt = useRef<number>(0);

  const [syncState, setSyncState] = useState<SyncState>({
    status: 'idle',
    lastSyncAt: null,
    error: null,
    pendingMutations: 0,
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    progress: {
      current: 0,
      total: 0,
      currentEntity: null,
    },
  });

  // Update online status
  useEffect(() => {
    const handleOnline = () => {
      setSyncState((prev) => ({ ...prev, isOnline: true, status: 'idle' }));
    };

    const handleOffline = () => {
      setSyncState((prev) => ({ ...prev, isOnline: false, status: 'offline' }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial online check
    setSyncState((prev) => ({
      ...prev,
      isOnline: navigator.onLine,
      status: navigator.onLine ? 'idle' : 'offline',
    }));

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Load initial sync metadata
  useEffect(() => {
    const loadMetadata = async () => {
      try {
        const allMetadata = await offlineStorage.getAllSyncMetadata();
        const latestSync = allMetadata.reduce(
          (latest, meta) =>
            meta.lastSyncAt > (latest || '') ? meta.lastSyncAt : latest,
          null as string | null
        );

        const pendingCount = (await offlineStorage.getPendingMutations()).length;

        setSyncState((prev) => ({
          ...prev,
          lastSyncAt: latestSync,
          pendingMutations: pendingCount,
        }));
      } catch (error) {
        console.error('Failed to load offline metadata:', error);
      }
    };

    loadMetadata();
  }, []);

  // Auto-sync when coming back online
  useEffect(() => {
    if (syncState.isOnline && syncState.status === 'idle') {
      // Process pending mutations when coming online
      processPendingMutations();
    }
  }, [syncState.isOnline]);

  /**
   * Sync a single entity from API to IndexedDB
   */
  const syncEntity = useCallback(async (entity: SyncableEntity): Promise<void> => {
    if (!navigator.onLine) {
      throw new Error('Cannot sync while offline');
    }

    setSyncState((prev) => ({
      ...prev,
      progress: {
        ...prev.progress,
        currentEntity: entity,
      },
    }));

    try {
      switch (entity) {
        case 'userProfile': {
          const user = await api.getProfile();
          await offlineStorage.saveUserProfile(user);
          break;
        }

        case 'orchestras': {
          const orchestras = await api.getOrchestras();
          await offlineStorage.saveOrchestras(orchestras);
          break;
        }

        case 'instruments': {
          const instruments = await api.getInstruments();
          await offlineStorage.saveInstruments(instruments);
          break;
        }

        case 'genres': {
          const genres = await api.getGenres();
          await offlineStorage.saveGenres(genres);
          break;
        }

        case 'musicPieces': {
          // Sync all music pieces (could be paginated in future)
          const pieces = await api.getMusicPieces();
          await offlineStorage.saveMusicPieces(pieces);
          break;
        }

        case 'musicTitles': {
          const titles = await api.getMusicTitles();
          await offlineStorage.saveMusicTitles(titles);
          break;
        }

        case 'favorites': {
          const favorites = await api.getFavorites();
          // Transform API favorites to stored format
          const storedFavorites: offlineStorage.StoredFavorite[] = favorites.map((f: any) => ({
            id: f.id,
            musicTitleId: f.id || f.music_title_id,
            title: f.title,
            arranger: f.arranger,
            addedAt: f.created_at || new Date().toISOString(),
          }));
          await offlineStorage.saveFavorites(storedFavorites);
          break;
        }

        case 'recentViews': {
          const views = await api.getRecentViews();
          // Transform API views to stored format
          const storedViews: offlineStorage.StoredRecentView[] = views.map((v: any) => ({
            id: v.id,
            itemType: v.itemType || v.item_type,
            itemId: v.itemId || v.item_id,
            itemTitle: v.itemTitle || v.item_title,
            viewedAt: v.viewedAt || v.viewed_at,
          }));
          await offlineStorage.saveRecentViews(storedViews);
          break;
        }

        case 'rehearsals': {
          // Get rehearsals for the next 3 months and past month
          const now = new Date();
          const pastMonth = new Date(now);
          pastMonth.setMonth(pastMonth.getMonth() - 1);
          const futureMonths = new Date(now);
          futureMonths.setMonth(futureMonths.getMonth() + 3);

          const rehearsals = await api.getRehearsals(
            pastMonth.toISOString().split('T')[0],
            futureMonths.toISOString().split('T')[0]
          );
          await offlineStorage.saveRehearsals(rehearsals);
          break;
        }
      }

      // Invalidate relevant query cache
      queryClient.invalidateQueries({ queryKey: [entity] });
    } catch (error) {
      console.error(`Failed to sync ${entity}:`, error);
      throw error;
    }
  }, [queryClient]);

  /**
   * Sync all entities from API to IndexedDB
   */
  const syncAll = useCallback(async (): Promise<void> => {
    // Prevent concurrent syncs
    if (syncInProgress.current) {
      console.log('Sync already in progress, skipping');
      return;
    }

    // Throttle syncs
    const now = Date.now();
    if (now - lastSyncAttempt.current < MIN_SYNC_INTERVAL) {
      console.log('Sync throttled, skipping');
      return;
    }

    if (!navigator.onLine) {
      setSyncState((prev) => ({ ...prev, status: 'offline' }));
      return;
    }

    syncInProgress.current = true;
    lastSyncAttempt.current = now;

    setSyncState((prev) => ({
      ...prev,
      status: 'syncing',
      error: null,
      progress: {
        current: 0,
        total: ALL_ENTITIES.length,
        currentEntity: null,
      },
    }));

    const errors: string[] = [];

    for (let i = 0; i < ALL_ENTITIES.length; i++) {
      const entity = ALL_ENTITIES[i];

      setSyncState((prev) => ({
        ...prev,
        progress: {
          current: i,
          total: ALL_ENTITIES.length,
          currentEntity: entity,
        },
      }));

      try {
        await syncEntity(entity);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${entity}: ${message}`);
        console.error(`Failed to sync ${entity}:`, error);
      }
    }

    const lastSyncAt = new Date().toISOString();

    setSyncState((prev) => ({
      ...prev,
      status: errors.length > 0 ? 'error' : 'success',
      lastSyncAt,
      error: errors.length > 0 ? errors.join('; ') : null,
      progress: {
        current: ALL_ENTITIES.length,
        total: ALL_ENTITIES.length,
        currentEntity: null,
      },
    }));

    syncInProgress.current = false;

    // Reset status after a delay
    setTimeout(() => {
      setSyncState((prev) => ({
        ...prev,
        status: prev.isOnline ? 'idle' : 'offline',
      }));
    }, 3000);
  }, [syncEntity]);

  /**
   * Process pending mutations (offline writes)
   */
  const processPendingMutations = useCallback(async (): Promise<void> => {
    if (!navigator.onLine) {
      return;
    }

    const pendingMutations = await offlineStorage.getPendingMutations();

    if (pendingMutations.length === 0) {
      return;
    }

    setSyncState((prev) => ({
      ...prev,
      pendingMutations: pendingMutations.length,
    }));

    for (const mutation of pendingMutations) {
      try {
        // Execute the mutation
        // This is a simplified version - in production, you'd want more sophisticated retry logic
        const response = await fetch(mutation.endpoint, {
          method: mutation.method,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
          body: mutation.data ? JSON.stringify(mutation.data) : undefined,
        });

        if (response.ok) {
          // Remove successful mutation
          if (mutation.id !== undefined) {
            await offlineStorage.removePendingMutation(mutation.id);
          }
        } else if (response.status >= 400 && response.status < 500) {
          // Client error - remove mutation (won't succeed on retry)
          if (mutation.id !== undefined) {
            await offlineStorage.removePendingMutation(mutation.id);
          }
        } else {
          // Server error - increment retry count
          if (mutation.id !== undefined) {
            await offlineStorage.updatePendingMutationRetry(mutation.id);
          }
        }
      } catch (error) {
        console.error('Failed to process mutation:', error);
        // Increment retry count for network errors
        if (mutation.id !== undefined) {
          await offlineStorage.updatePendingMutationRetry(mutation.id);
        }
      }
    }

    // Update pending count
    const remainingMutations = await offlineStorage.getPendingMutations();
    setSyncState((prev) => ({
      ...prev,
      pendingMutations: remainingMutations.length,
    }));
  }, []);

  // Data accessors that prefer online data but fall back to offline

  const getUserProfile = useCallback(async (): Promise<User | undefined> => {
    if (navigator.onLine) {
      try {
        const user = await api.getProfile();
        await offlineStorage.saveUserProfile(user);
        return user;
      } catch {
        // Fall through to offline
      }
    }
    return offlineStorage.getUserProfile();
  }, []);

  const getMusicPieces = useCallback(
    async (filters?: { orchestraId?: string; instrumentId?: string; search?: string }): Promise<MusicPiece[]> => {
      if (navigator.onLine) {
        try {
          const pieces = await api.getMusicPieces(filters);
          // Only cache if no filters (full list)
          if (!filters?.orchestraId && !filters?.instrumentId && !filters?.search) {
            await offlineStorage.saveMusicPieces(pieces);
          }
          return pieces;
        } catch {
          // Fall through to offline
        }
      }
      return offlineStorage.getMusicPieces(filters);
    },
    []
  );

  const getMusicTitles = useCallback(
    async (filters?: { search?: string; genreId?: string }): Promise<MusicTitle[]> => {
      if (navigator.onLine) {
        try {
          const titles = await api.getMusicTitles(filters);
          // Only cache if no filters
          if (!filters?.search && !filters?.genreId) {
            await offlineStorage.saveMusicTitles(titles);
          }
          return titles;
        } catch {
          // Fall through to offline
        }
      }
      return offlineStorage.getMusicTitles(filters);
    },
    []
  );

  const getOrchestras = useCallback(async (): Promise<Orchestra[]> => {
    if (navigator.onLine) {
      try {
        const orchestras = await api.getOrchestras();
        await offlineStorage.saveOrchestras(orchestras);
        return orchestras;
      } catch {
        // Fall through to offline
      }
    }
    return offlineStorage.getOrchestras();
  }, []);

  const getInstruments = useCallback(async (): Promise<Instrument[]> => {
    if (navigator.onLine) {
      try {
        const instruments = await api.getInstruments();
        await offlineStorage.saveInstruments(instruments);
        return instruments;
      } catch {
        // Fall through to offline
      }
    }
    return offlineStorage.getInstruments();
  }, []);

  const getGenres = useCallback(async (): Promise<Genre[]> => {
    if (navigator.onLine) {
      try {
        const genres = await api.getGenres();
        await offlineStorage.saveGenres(genres);
        return genres;
      } catch {
        // Fall through to offline
      }
    }
    return offlineStorage.getGenres();
  }, []);

  const getFavorites = useCallback(async (): Promise<offlineStorage.StoredFavorite[]> => {
    if (navigator.onLine) {
      try {
        const favorites = await api.getFavorites();
        const storedFavorites: offlineStorage.StoredFavorite[] = favorites.map((f: any) => ({
          id: f.id,
          musicTitleId: f.id || f.music_title_id,
          title: f.title,
          arranger: f.arranger,
          addedAt: f.created_at || new Date().toISOString(),
        }));
        await offlineStorage.saveFavorites(storedFavorites);
        return storedFavorites;
      } catch {
        // Fall through to offline
      }
    }
    return offlineStorage.getFavorites();
  }, []);

  const getRecentViews = useCallback(
    async (type?: string, limit?: number): Promise<offlineStorage.StoredRecentView[]> => {
      if (navigator.onLine) {
        try {
          const views = await api.getRecentViews(type, limit);
          const storedViews: offlineStorage.StoredRecentView[] = views.map((v: any) => ({
            id: v.id,
            itemType: v.itemType || v.item_type,
            itemId: v.itemId || v.item_id,
            itemTitle: v.itemTitle || v.item_title,
            viewedAt: v.viewedAt || v.viewed_at,
          }));
          // Only cache if no filters
          if (!type && !limit) {
            await offlineStorage.saveRecentViews(storedViews);
          }
          return storedViews;
        } catch {
          // Fall through to offline
        }
      }
      return offlineStorage.getRecentViews(type, limit);
    },
    []
  );

  const getRehearsals = useCallback(
    async (filters?: { startDate?: string; endDate?: string; orchestraId?: string }): Promise<Rehearsal[]> => {
      if (navigator.onLine) {
        try {
          const rehearsals = await api.getRehearsals(filters?.startDate, filters?.endDate);
          await offlineStorage.saveRehearsals(rehearsals);
          return rehearsals;
        } catch {
          // Fall through to offline
        }
      }
      return offlineStorage.getRehearsals(filters);
    },
    []
  );

  const clearOfflineData = useCallback(async (): Promise<void> => {
    await offlineStorage.clearAllData();
    setSyncState((prev) => ({
      ...prev,
      lastSyncAt: null,
      pendingMutations: 0,
    }));
  }, []);

  return {
    syncState,
    syncAll,
    syncEntity,
    getUserProfile,
    getMusicPieces,
    getMusicTitles,
    getOrchestras,
    getInstruments,
    getGenres,
    getFavorites,
    getRecentViews,
    getRehearsals,
    processPendingMutations,
    clearOfflineData,
  };
}

/**
 * Hook to track online/offline status
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

/**
 * Hook to trigger sync on app start
 */
export function useAutoSync(enabled: boolean = true): void {
  const { syncAll, syncState } = useOfflineData();
  const hasTriggeredSync = useRef(false);

  useEffect(() => {
    if (!enabled || hasTriggeredSync.current) {
      return;
    }

    // Only sync if online
    if (syncState.isOnline && syncState.status === 'idle') {
      hasTriggeredSync.current = true;
      // Delay sync slightly to let the app settle
      const timeout = setTimeout(() => {
        syncAll();
      }, 2000);

      return () => clearTimeout(timeout);
    }
  }, [enabled, syncAll, syncState.isOnline, syncState.status]);
}

/**
 * Hook to show sync status indicator
 */
export function useSyncStatus(): {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncAt: string | null;
  pendingMutations: number;
  syncProgress: number;
  currentEntity: string | null;
  error: string | null;
} {
  const { syncState } = useOfflineData();

  return {
    isOnline: syncState.isOnline,
    isSyncing: syncState.status === 'syncing',
    lastSyncAt: syncState.lastSyncAt,
    pendingMutations: syncState.pendingMutations,
    syncProgress:
      syncState.progress.total > 0
        ? Math.round((syncState.progress.current / syncState.progress.total) * 100)
        : 0,
    currentEntity: syncState.progress.currentEntity,
    error: syncState.error,
  };
}
