/**
 * IndexedDB wrapper for offline data storage
 * Stores user data, music pieces, orchestras, instruments, and other app data
 * for offline access in the Harmonie music app.
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb';
import type {
  User,
  Instrument,
  Orchestra,
  MusicPiece,
  MusicTitle,
  Rehearsal,
  Genre,
} from '../types';

// Types for stored data
export interface StoredFavorite {
  id: string;
  musicTitleId: string;
  title: string;
  arranger: string | null;
  addedAt: string;
}

export interface StoredRecentView {
  id: string;
  itemType: 'music_piece' | 'music_title' | 'music_list' | 'rehearsal' | 'concert';
  itemId: string;
  itemTitle: string;
  viewedAt: string;
}

export interface SyncMetadata {
  key: string;
  lastSyncAt: string;
  version: number;
}

// Database schema definition
interface HarmonieDBSchema extends DBSchema {
  userProfile: {
    key: string;
    value: User;
  };
  musicPieces: {
    key: string;
    value: MusicPiece & { cachedAt: string };
    indexes: {
      'by-orchestra': string;
      'by-instrument': string;
      'by-title': string;
    };
  };
  musicTitles: {
    key: string;
    value: MusicTitle & { cachedAt: string };
    indexes: {
      'by-title': string;
    };
  };
  orchestras: {
    key: string;
    value: Orchestra & { cachedAt: string };
  };
  instruments: {
    key: string;
    value: Instrument & { cachedAt: string };
  };
  genres: {
    key: string;
    value: Genre & { cachedAt: string };
  };
  favorites: {
    key: string;
    value: StoredFavorite;
    indexes: {
      'by-musicTitleId': string;
    };
  };
  recentViews: {
    key: string;
    value: StoredRecentView;
    indexes: {
      'by-itemType': string;
      'by-viewedAt': string;
    };
  };
  rehearsals: {
    key: string;
    value: Rehearsal & { cachedAt: string };
    indexes: {
      'by-date': string;
      'by-orchestra': string;
    };
  };
  syncMetadata: {
    key: string;
    value: SyncMetadata;
  };
  pendingMutations: {
    key: number;
    value: {
      id?: number;
      type: string;
      endpoint: string;
      method: 'POST' | 'PUT' | 'DELETE' | 'PATCH';
      data?: unknown;
      createdAt: string;
      retryCount: number;
    };
    autoIncrement: true;
  };
}

const DB_NAME = 'harmonie-offline';
const DB_VERSION = 1;

let dbInstance: IDBPDatabase<HarmonieDBSchema> | null = null;

/**
 * Initialize and get the IndexedDB database instance
 */
export async function getDB(): Promise<IDBPDatabase<HarmonieDBSchema>> {
  if (dbInstance) {
    return dbInstance;
  }

  dbInstance = await openDB<HarmonieDBSchema>(DB_NAME, DB_VERSION, {
    upgrade(db, _oldVersion, _newVersion, _transaction) {
      // User profile store
      if (!db.objectStoreNames.contains('userProfile')) {
        db.createObjectStore('userProfile', { keyPath: 'id' });
      }

      // Music pieces store with indexes
      if (!db.objectStoreNames.contains('musicPieces')) {
        const musicPiecesStore = db.createObjectStore('musicPieces', { keyPath: 'id' });
        musicPiecesStore.createIndex('by-orchestra', 'orchestraName');
        musicPiecesStore.createIndex('by-instrument', 'instrumentId');
        musicPiecesStore.createIndex('by-title', 'title');
      }

      // Music titles store
      if (!db.objectStoreNames.contains('musicTitles')) {
        const musicTitlesStore = db.createObjectStore('musicTitles', { keyPath: 'id' });
        musicTitlesStore.createIndex('by-title', 'title');
      }

      // Orchestras store
      if (!db.objectStoreNames.contains('orchestras')) {
        db.createObjectStore('orchestras', { keyPath: 'id' });
      }

      // Instruments store
      if (!db.objectStoreNames.contains('instruments')) {
        db.createObjectStore('instruments', { keyPath: 'id' });
      }

      // Genres store
      if (!db.objectStoreNames.contains('genres')) {
        db.createObjectStore('genres', { keyPath: 'id' });
      }

      // Favorites store
      if (!db.objectStoreNames.contains('favorites')) {
        const favoritesStore = db.createObjectStore('favorites', { keyPath: 'id' });
        favoritesStore.createIndex('by-musicTitleId', 'musicTitleId');
      }

      // Recent views store
      if (!db.objectStoreNames.contains('recentViews')) {
        const recentViewsStore = db.createObjectStore('recentViews', { keyPath: 'id' });
        recentViewsStore.createIndex('by-itemType', 'itemType');
        recentViewsStore.createIndex('by-viewedAt', 'viewedAt');
      }

      // Rehearsals store
      if (!db.objectStoreNames.contains('rehearsals')) {
        const rehearsalsStore = db.createObjectStore('rehearsals', { keyPath: 'id' });
        rehearsalsStore.createIndex('by-date', 'date');
        rehearsalsStore.createIndex('by-orchestra', 'orchestra_id');
      }

      // Sync metadata store
      if (!db.objectStoreNames.contains('syncMetadata')) {
        db.createObjectStore('syncMetadata', { keyPath: 'key' });
      }

      // Pending mutations store (for offline writes)
      if (!db.objectStoreNames.contains('pendingMutations')) {
        db.createObjectStore('pendingMutations', {
          keyPath: 'id',
          autoIncrement: true,
        });
      }
    },
    blocked() {
      console.warn('IndexedDB blocked - close other tabs with this app');
    },
    blocking() {
      // Close our connection if another tab upgrades the database
      dbInstance?.close();
      dbInstance = null;
    },
    terminated() {
      dbInstance = null;
    },
  });

  return dbInstance;
}

/**
 * Close the database connection
 */
export async function closeDB(): Promise<void> {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

// =============================================================================
// User Profile Operations
// =============================================================================

export async function saveUserProfile(user: User): Promise<void> {
  const db = await getDB();
  await db.put('userProfile', user);
  await updateSyncMetadata('userProfile');
}

export async function getUserProfile(): Promise<User | undefined> {
  const db = await getDB();
  const users = await db.getAll('userProfile');
  return users[0];
}

export async function clearUserProfile(): Promise<void> {
  const db = await getDB();
  await db.clear('userProfile');
}

// =============================================================================
// Music Pieces Operations
// =============================================================================

export async function saveMusicPieces(pieces: MusicPiece[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('musicPieces', 'readwrite');
  const cachedAt = new Date().toISOString();

  await Promise.all([
    ...pieces.map((piece) => tx.store.put({ ...piece, cachedAt })),
    tx.done,
  ]);
  await updateSyncMetadata('musicPieces');
}

export async function getMusicPieces(filters?: {
  orchestraId?: string;
  instrumentId?: string;
  search?: string;
}): Promise<MusicPiece[]> {
  const db = await getDB();

  let pieces: (MusicPiece & { cachedAt: string })[];

  if (filters?.instrumentId) {
    pieces = await db.getAllFromIndex('musicPieces', 'by-instrument', filters.instrumentId);
  } else {
    pieces = await db.getAll('musicPieces');
  }

  // Apply additional filters
  if (filters?.orchestraId) {
    pieces = pieces.filter((p) => p.orchestraName === filters.orchestraId);
  }

  if (filters?.search) {
    const searchLower = filters.search.toLowerCase();
    pieces = pieces.filter(
      (p) =>
        p.title.toLowerCase().includes(searchLower) ||
        p.arranger?.toLowerCase().includes(searchLower) ||
        p.instrumentName?.toLowerCase().includes(searchLower)
    );
  }

  return pieces;
}

export async function getMusicPiece(id: string): Promise<MusicPiece | undefined> {
  const db = await getDB();
  return db.get('musicPieces', id);
}

export async function clearMusicPieces(): Promise<void> {
  const db = await getDB();
  await db.clear('musicPieces');
}

// =============================================================================
// Music Titles Operations
// =============================================================================

export async function saveMusicTitles(titles: MusicTitle[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('musicTitles', 'readwrite');
  const cachedAt = new Date().toISOString();

  await Promise.all([
    ...titles.map((title) => {
      // Ensure title has an id (use title string as fallback)
      const id = title.id || title.title;
      return tx.store.put({ ...title, id, cachedAt });
    }),
    tx.done,
  ]);
  await updateSyncMetadata('musicTitles');
}

export async function getMusicTitles(filters?: {
  search?: string;
  genreId?: string;
}): Promise<MusicTitle[]> {
  const db = await getDB();
  let titles = await db.getAll('musicTitles');

  if (filters?.search) {
    const searchLower = filters.search.toLowerCase();
    titles = titles.filter(
      (t) =>
        t.title.toLowerCase().includes(searchLower) ||
        t.arranger?.toLowerCase().includes(searchLower)
    );
  }

  if (filters?.genreId) {
    titles = titles.filter((t) =>
      t.genres?.some((g) => g.id === filters.genreId)
    );
  }

  return titles;
}

export async function clearMusicTitles(): Promise<void> {
  const db = await getDB();
  await db.clear('musicTitles');
}

// =============================================================================
// Orchestras Operations
// =============================================================================

export async function saveOrchestras(orchestras: Orchestra[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('orchestras', 'readwrite');
  const cachedAt = new Date().toISOString();

  await Promise.all([
    ...orchestras.map((orchestra) => tx.store.put({ ...orchestra, cachedAt })),
    tx.done,
  ]);
  await updateSyncMetadata('orchestras');
}

export async function getOrchestras(): Promise<Orchestra[]> {
  const db = await getDB();
  return db.getAll('orchestras');
}

export async function getOrchestra(id: string): Promise<Orchestra | undefined> {
  const db = await getDB();
  return db.get('orchestras', id);
}

export async function clearOrchestras(): Promise<void> {
  const db = await getDB();
  await db.clear('orchestras');
}

// =============================================================================
// Instruments Operations
// =============================================================================

export async function saveInstruments(instruments: Instrument[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('instruments', 'readwrite');
  const cachedAt = new Date().toISOString();

  await Promise.all([
    ...instruments.map((instrument) => tx.store.put({ ...instrument, cachedAt })),
    tx.done,
  ]);
  await updateSyncMetadata('instruments');
}

export async function getInstruments(): Promise<Instrument[]> {
  const db = await getDB();
  return db.getAll('instruments');
}

export async function getInstrument(id: string): Promise<Instrument | undefined> {
  const db = await getDB();
  return db.get('instruments', id);
}

export async function clearInstruments(): Promise<void> {
  const db = await getDB();
  await db.clear('instruments');
}

// =============================================================================
// Genres Operations
// =============================================================================

export async function saveGenres(genres: Genre[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('genres', 'readwrite');
  const cachedAt = new Date().toISOString();

  await Promise.all([
    ...genres.map((genre) => tx.store.put({ ...genre, cachedAt })),
    tx.done,
  ]);
  await updateSyncMetadata('genres');
}

export async function getGenres(): Promise<Genre[]> {
  const db = await getDB();
  return db.getAll('genres');
}

export async function clearGenres(): Promise<void> {
  const db = await getDB();
  await db.clear('genres');
}

// =============================================================================
// Favorites Operations
// =============================================================================

export async function saveFavorites(favorites: StoredFavorite[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('favorites', 'readwrite');

  // Clear existing and add new
  await tx.store.clear();
  await Promise.all([
    ...favorites.map((favorite) => tx.store.put(favorite)),
    tx.done,
  ]);
  await updateSyncMetadata('favorites');
}

export async function getFavorites(): Promise<StoredFavorite[]> {
  const db = await getDB();
  return db.getAll('favorites');
}

export async function addFavorite(favorite: StoredFavorite): Promise<void> {
  const db = await getDB();
  await db.put('favorites', favorite);
}

export async function removeFavorite(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('favorites', id);
}

export async function isFavorite(musicTitleId: string): Promise<boolean> {
  const db = await getDB();
  const favorites = await db.getAllFromIndex('favorites', 'by-musicTitleId', musicTitleId);
  return favorites.length > 0;
}

export async function clearFavorites(): Promise<void> {
  const db = await getDB();
  await db.clear('favorites');
}

// =============================================================================
// Recent Views Operations
// =============================================================================

export async function saveRecentViews(views: StoredRecentView[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('recentViews', 'readwrite');

  // Clear existing and add new
  await tx.store.clear();
  await Promise.all([
    ...views.map((view) => tx.store.put(view)),
    tx.done,
  ]);
  await updateSyncMetadata('recentViews');
}

export async function getRecentViews(type?: string, limit?: number): Promise<StoredRecentView[]> {
  const db = await getDB();

  let views: StoredRecentView[];

  if (type) {
    views = await db.getAllFromIndex('recentViews', 'by-itemType', type);
  } else {
    views = await db.getAll('recentViews');
  }

  // Sort by viewedAt descending
  views.sort((a, b) => new Date(b.viewedAt).getTime() - new Date(a.viewedAt).getTime());

  if (limit) {
    views = views.slice(0, limit);
  }

  return views;
}

export async function addRecentView(view: StoredRecentView): Promise<void> {
  const db = await getDB();
  await db.put('recentViews', view);
}

export async function clearRecentViews(): Promise<void> {
  const db = await getDB();
  await db.clear('recentViews');
}

// =============================================================================
// Rehearsals Operations
// =============================================================================

export async function saveRehearsals(rehearsals: Rehearsal[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('rehearsals', 'readwrite');
  const cachedAt = new Date().toISOString();

  await Promise.all([
    ...rehearsals.map((rehearsal) => tx.store.put({ ...rehearsal, cachedAt })),
    tx.done,
  ]);
  await updateSyncMetadata('rehearsals');
}

export async function getRehearsals(filters?: {
  startDate?: string;
  endDate?: string;
  orchestraId?: string;
}): Promise<Rehearsal[]> {
  const db = await getDB();
  let rehearsals = await db.getAll('rehearsals');

  if (filters?.startDate) {
    rehearsals = rehearsals.filter((r) => r.date >= filters.startDate!);
  }

  if (filters?.endDate) {
    rehearsals = rehearsals.filter((r) => r.date <= filters.endDate!);
  }

  if (filters?.orchestraId) {
    rehearsals = rehearsals.filter((r) => r.orchestra_id === filters.orchestraId);
  }

  // Sort by date ascending
  rehearsals.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return rehearsals;
}

export async function getRehearsal(id: string): Promise<Rehearsal | undefined> {
  const db = await getDB();
  return db.get('rehearsals', id);
}

export async function clearRehearsals(): Promise<void> {
  const db = await getDB();
  await db.clear('rehearsals');
}

// =============================================================================
// Sync Metadata Operations
// =============================================================================

export async function updateSyncMetadata(key: string): Promise<void> {
  const db = await getDB();
  const existing = await db.get('syncMetadata', key);
  await db.put('syncMetadata', {
    key,
    lastSyncAt: new Date().toISOString(),
    version: (existing?.version ?? 0) + 1,
  });
}

export async function getSyncMetadata(key: string): Promise<SyncMetadata | undefined> {
  const db = await getDB();
  return db.get('syncMetadata', key);
}

export async function getAllSyncMetadata(): Promise<SyncMetadata[]> {
  const db = await getDB();
  return db.getAll('syncMetadata');
}

export async function getLastSyncTime(key: string): Promise<string | null> {
  const metadata = await getSyncMetadata(key);
  return metadata?.lastSyncAt ?? null;
}

// =============================================================================
// Pending Mutations Operations (for offline writes)
// =============================================================================

export interface PendingMutation {
  id?: number;
  type: string;
  endpoint: string;
  method: 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  data?: unknown;
  createdAt: string;
  retryCount: number;
}

export async function addPendingMutation(mutation: Omit<PendingMutation, 'id' | 'createdAt' | 'retryCount'>): Promise<number> {
  const db = await getDB();
  const id = await db.add('pendingMutations', {
    ...mutation,
    createdAt: new Date().toISOString(),
    retryCount: 0,
  });
  return id;
}

export async function getPendingMutations(): Promise<PendingMutation[]> {
  const db = await getDB();
  return db.getAll('pendingMutations');
}

export async function removePendingMutation(id: number): Promise<void> {
  const db = await getDB();
  await db.delete('pendingMutations', id);
}

export async function updatePendingMutationRetry(id: number): Promise<void> {
  const db = await getDB();
  const mutation = await db.get('pendingMutations', id);
  if (mutation) {
    await db.put('pendingMutations', {
      ...mutation,
      retryCount: mutation.retryCount + 1,
    });
  }
}

export async function clearPendingMutations(): Promise<void> {
  const db = await getDB();
  await db.clear('pendingMutations');
}

export async function hasPendingMutations(): Promise<boolean> {
  const db = await getDB();
  const count = await db.count('pendingMutations');
  return count > 0;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Clear all offline data (useful for logout)
 */
export async function clearAllData(): Promise<void> {
  const db = await getDB();
  await Promise.all([
    db.clear('userProfile'),
    db.clear('musicPieces'),
    db.clear('musicTitles'),
    db.clear('orchestras'),
    db.clear('instruments'),
    db.clear('genres'),
    db.clear('favorites'),
    db.clear('recentViews'),
    db.clear('rehearsals'),
    db.clear('syncMetadata'),
    db.clear('pendingMutations'),
  ]);
}

/**
 * Get the total storage used by offline data (approximate)
 */
export async function getStorageEstimate(): Promise<{
  used: number;
  quota: number;
  percentage: number;
} | null> {
  if (navigator.storage && navigator.storage.estimate) {
    const estimate = await navigator.storage.estimate();
    return {
      used: estimate.usage ?? 0,
      quota: estimate.quota ?? 0,
      percentage: estimate.quota
        ? Math.round(((estimate.usage ?? 0) / estimate.quota) * 100)
        : 0,
    };
  }
  return null;
}

/**
 * Check if IndexedDB is available
 */
export function isIndexedDBAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

/**
 * Delete the entire database (for debugging/reset)
 */
export async function deleteDatabase(): Promise<void> {
  await closeDB();
  await indexedDB.deleteDatabase(DB_NAME);
}
