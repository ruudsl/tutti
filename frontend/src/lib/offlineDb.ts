import Dexie, { Table } from 'dexie';

// Define offline data structures
export interface OfflineMusicPiece {
  id: string;
  titleId: string;
  title: string;
  arranger?: string;
  composer?: string;
  genre?: string;
  difficulty?: number;
  pdfUrl?: string;
  pdfBlob?: Blob;
  thumbnailBlob?: Blob;
  version: number;
  lastModified: string;
  syncStatus: 'synced' | 'pending' | 'conflict';
}

export interface OfflineAnnotation {
  id: string;
  musicPieceId: string;
  pageNumber: number;
  annotationType: 'freehand' | 'highlight' | 'text' | 'stamp' | 'shape';
  data: string;
  color: string;
  strokeWidth: number;
  opacity: number;
  isShared: boolean;
  version: number;
  lastModified: string;
  syncStatus: 'synced' | 'pending' | 'conflict';
}

export interface OfflineRehearsal {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  location?: string;
  orchestraId?: string;
  orchestraName?: string;
  type: string;
  notes?: string;
  version: number;
  lastModified: string;
  syncStatus: 'synced' | 'pending' | 'conflict';
}

export interface OfflinePracticeLog {
  id: string;
  musicPieceId?: string;
  musicPieceTitle?: string;
  durationMinutes: number;
  notes?: string;
  startedAt: string;
  endedAt?: string;
  version: number;
  lastModified: string;
  syncStatus: 'synced' | 'pending' | 'conflict';
}

export interface SyncQueueItem {
  id: string;
  entityType: 'musicPiece' | 'annotation' | 'rehearsal' | 'practiceLog';
  entityId: string;
  action: 'create' | 'update' | 'delete';
  data?: string;
  createdAt: string;
  retryCount: number;
}

export interface ConflictRecord {
  id: string;
  entityType: string;
  entityId: string;
  localData: string;
  serverData: string;
  conflictedAt: string;
  resolved: boolean;
}

class HarmonieOfflineDB extends Dexie {
  musicPieces!: Table<OfflineMusicPiece, string>;
  annotations!: Table<OfflineAnnotation, string>;
  rehearsals!: Table<OfflineRehearsal, string>;
  practiceLogs!: Table<OfflinePracticeLog, string>;
  syncQueue!: Table<SyncQueueItem, string>;
  conflicts!: Table<ConflictRecord, string>;

  constructor() {
    super('HarmonieOfflineDB');

    this.version(1).stores({
      musicPieces: 'id, titleId, title, syncStatus, lastModified',
      annotations: 'id, musicPieceId, pageNumber, syncStatus, lastModified',
      rehearsals: 'id, date, orchestraId, syncStatus',
      practiceLogs: 'id, musicPieceId, startedAt, syncStatus',
      syncQueue: 'id, entityType, entityId, createdAt',
      conflicts: 'id, entityType, entityId, resolved',
    });
  }
}

export const offlineDb = new HarmonieOfflineDB();

// Sync management
export class SyncManager {
  private isOnline = navigator.onLine;
  private syncInProgress = false;
  private listeners: Set<(online: boolean) => void> = new Set();

  constructor() {
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());
  }

  private handleOnline() {
    this.isOnline = true;
    this.notifyListeners();
    this.processSyncQueue();
  }

  private handleOffline() {
    this.isOnline = false;
    this.notifyListeners();
  }

  private notifyListeners() {
    this.listeners.forEach((cb) => cb(this.isOnline));
  }

  onConnectionChange(callback: (online: boolean) => void) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  getIsOnline() {
    return this.isOnline;
  }

  async queueChange(
    entityType: SyncQueueItem['entityType'],
    entityId: string,
    action: SyncQueueItem['action'],
    data?: any,
  ) {
    const item: SyncQueueItem = {
      id: crypto.randomUUID(),
      entityType,
      entityId,
      action,
      data: data ? JSON.stringify(data) : undefined,
      createdAt: new Date().toISOString(),
      retryCount: 0,
    };

    await offlineDb.syncQueue.add(item);

    if (this.isOnline) {
      this.processSyncQueue();
    }
  }

  async processSyncQueue() {
    if (this.syncInProgress || !this.isOnline) return;

    this.syncInProgress = true;

    try {
      const pendingItems = await offlineDb.syncQueue
        .orderBy('createdAt')
        .filter((item) => item.retryCount < 5)
        .toArray();

      for (const item of pendingItems) {
        try {
          await this.syncItem(item);
          await offlineDb.syncQueue.delete(item.id);
        } catch (error) {
          // Check if it's a conflict
          if ((error as any)?.status === 409) {
            await this.handleConflict(item, error);
          } else {
            // Increment retry count
            await offlineDb.syncQueue.update(item.id, {
              retryCount: item.retryCount + 1,
            });
          }
        }
      }
    } finally {
      this.syncInProgress = false;
    }
  }

  private async syncItem(item: SyncQueueItem): Promise<void> {
    const token = localStorage.getItem('token');
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

    const endpoints: Record<SyncQueueItem['entityType'], string> = {
      musicPiece: '/music-pieces',
      annotation: '/annotations',
      rehearsal: '/rehearsals',
      practiceLog: '/practice/logs',
    };

    const endpoint = endpoints[item.entityType];
    let url = `${baseUrl}${endpoint}`;
    let method = 'POST';

    if (item.action === 'update') {
      url = `${url}/${item.entityId}`;
      method = 'PUT';
    } else if (item.action === 'delete') {
      url = `${url}/${item.entityId}`;
      method = 'DELETE';
    }

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: item.data,
    });

    if (!response.ok) {
      const error = new Error('Sync failed') as any;
      error.status = response.status;
      error.body = await response.json().catch(() => ({}));
      throw error;
    }

    // Update local record with synced status
    const table = this.getTable(item.entityType);
    if (table && item.action !== 'delete') {
      const serverData = await response.json();
      await table.update(item.entityId, {
        ...serverData,
        syncStatus: 'synced',
        version: serverData.version || 1,
      });
    }
  }

  private getTable(entityType: SyncQueueItem['entityType']): Table<any, string> | null {
    switch (entityType) {
      case 'musicPiece':
        return offlineDb.musicPieces;
      case 'annotation':
        return offlineDb.annotations;
      case 'rehearsal':
        return offlineDb.rehearsals;
      case 'practiceLog':
        return offlineDb.practiceLogs;
      default:
        return null;
    }
  }

  private async handleConflict(item: SyncQueueItem, error: any) {
    const table = this.getTable(item.entityType);
    if (!table) return;

    const localData = await table.get(item.entityId);

    const conflict: ConflictRecord = {
      id: crypto.randomUUID(),
      entityType: item.entityType,
      entityId: item.entityId,
      localData: JSON.stringify(localData),
      serverData: JSON.stringify(error.body?.serverData || {}),
      conflictedAt: new Date().toISOString(),
      resolved: false,
    };

    await offlineDb.conflicts.add(conflict);
    await table.update(item.entityId, { syncStatus: 'conflict' });
    await offlineDb.syncQueue.delete(item.id);
  }

  async resolveConflict(conflictId: string, resolution: 'useLocal' | 'useServer' | 'merge', mergedData?: any) {
    const conflict = await offlineDb.conflicts.get(conflictId);
    if (!conflict) return;

    const table = this.getTable(conflict.entityType as SyncQueueItem['entityType']);
    if (!table) return;

    if (resolution === 'useServer') {
      const serverData = JSON.parse(conflict.serverData);
      await table.update(conflict.entityId, { ...serverData, syncStatus: 'synced' });
    } else if (resolution === 'useLocal') {
      const localData = JSON.parse(conflict.localData);
      await this.queueChange(conflict.entityType as SyncQueueItem['entityType'], conflict.entityId, 'update', {
        ...localData,
        forceOverwrite: true,
      });
    } else if (resolution === 'merge' && mergedData) {
      await table.update(conflict.entityId, { ...mergedData, syncStatus: 'pending' });
      await this.queueChange(
        conflict.entityType as SyncQueueItem['entityType'],
        conflict.entityId,
        'update',
        mergedData,
      );
    }

    await offlineDb.conflicts.update(conflictId, { resolved: true });
  }

  async getConflicts() {
    return offlineDb.conflicts.filter((c) => !c.resolved).toArray();
  }

  async getPendingChangesCount() {
    return offlineDb.syncQueue.count();
  }
}

export const syncManager = new SyncManager();

// Helper hooks for offline data access
export async function cacheMusicPiece(piece: any, pdfBlob?: Blob, thumbnailBlob?: Blob) {
  const offlinePiece: OfflineMusicPiece = {
    id: piece.id,
    titleId: piece.titleId || piece.title_id,
    title: piece.title,
    arranger: piece.arranger,
    composer: piece.composer,
    genre: piece.genre,
    difficulty: piece.difficulty,
    pdfUrl: piece.pdfUrl || piece.pdf_url,
    pdfBlob,
    thumbnailBlob,
    version: piece.version || 1,
    lastModified: new Date().toISOString(),
    syncStatus: 'synced',
  };

  await offlineDb.musicPieces.put(offlinePiece);
}

export async function getCachedMusicPiece(id: string) {
  return offlineDb.musicPieces.get(id);
}

export async function getCachedMusicPieces() {
  return offlineDb.musicPieces.toArray();
}

export async function saveAnnotationOffline(
  annotation: Omit<OfflineAnnotation, 'version' | 'lastModified' | 'syncStatus'>,
) {
  const fullAnnotation: OfflineAnnotation = {
    ...annotation,
    version: 1,
    lastModified: new Date().toISOString(),
    syncStatus: navigator.onLine ? 'pending' : 'pending',
  };

  await offlineDb.annotations.put(fullAnnotation);
  await syncManager.queueChange('annotation', annotation.id, 'create', fullAnnotation);

  return fullAnnotation;
}

export async function getAnnotationsForPiece(musicPieceId: string, pageNumber?: number) {
  const query = offlineDb.annotations.where('musicPieceId').equals(musicPieceId);

  if (pageNumber !== undefined) {
    const annotations = await query.toArray();
    return annotations.filter((a) => a.pageNumber === pageNumber);
  }

  return query.toArray();
}
