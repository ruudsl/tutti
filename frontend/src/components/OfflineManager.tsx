import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';
import { showSuccess, showError } from '../utils/toast';
import { clearAllData } from '../lib/offlineStorage';

interface CachedItem {
  url: string;
  name: string;
  size: number;
  type: 'pdf' | 'audio' | 'other';
  cachedAt: Date;
}

interface OfflineManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

const CACHE_NAMES = {
  pdf: 'pdf-cache',
  audio: 'music-cache',
  api: 'api-cache',
};

export function OfflineManager({ isOpen, onClose }: OfflineManagerProps) {
  const { t } = useTranslation();
  const [cachedItems, setCachedItems] = useState<CachedItem[]>([]);
  const [totalSize, setTotalSize] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isOpen) {
      loadCachedItems();
    }
  }, [isOpen]);

  async function loadCachedItems() {
    setLoading(true);
    const items: CachedItem[] = [];
    let total = 0;

    try {
      for (const [type, cacheName] of Object.entries(CACHE_NAMES)) {
        if (type === 'api') continue;

        const cache = await caches.open(cacheName);
        const requests = await cache.keys();

        for (const request of requests) {
          const response = await cache.match(request);
          if (response) {
            const blob = await response.clone().blob();
            const url = request.url;
            const name = extractFileName(url);

            items.push({
              url,
              name,
              size: blob.size,
              type: type as 'pdf' | 'audio',
              cachedAt: new Date(),
            });
            total += blob.size;
          }
        }
      }

      setCachedItems(items);
      setTotalSize(total);
    } catch (error) {
      console.error('Error loading cached items:', error);
    } finally {
      setLoading(false);
    }
  }

  function extractFileName(url: string): string {
    try {
      const pathname = new URL(url).pathname;
      const segments = pathname.split('/');
      const filename = segments[segments.length - 1];
      return decodeURIComponent(filename) || 'Unknown';
    } catch {
      return 'Unknown';
    }
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function toggleSelect(url: string) {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(url)) {
      newSelected.delete(url);
    } else {
      newSelected.add(url);
    }
    setSelectedItems(newSelected);
  }

  function selectAll() {
    if (selectedItems.size === cachedItems.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(cachedItems.map((item) => item.url)));
    }
  }

  async function deleteSelected() {
    try {
      for (const [type, cacheName] of Object.entries(CACHE_NAMES)) {
        if (type === 'api') continue;

        const cache = await caches.open(cacheName);
        for (const url of selectedItems) {
          await cache.delete(url);
        }
      }

      showSuccess(t('offline.deleted', 'Items verwijderd uit offline opslag'));
      setSelectedItems(new Set());
      await loadCachedItems();
    } catch (error) {
      showError(t('errors.generic'));
    }
  }

  async function clearAllCache() {
    try {
      for (const cacheName of Object.values(CACHE_NAMES)) {
        const cache = await caches.open(cacheName);
        const requests = await cache.keys();
        for (const request of requests) {
          await cache.delete(request);
        }
      }

      // De bestandscache is maar de helft van de offline opslag. In IndexedDB
      // staan het profiel van het ingelogde lid, de gegevens van zijn
      // vereniging en de nog niet verstuurde synchronisatiewachtrij. Die bleven
      // hier staan terwijl het scherm "offline opslag gewist" meldde - op een
      // gedeelde tablet zag de volgende gebruiker ze dus gewoon terug.
      // Mislukt dit, dan komt er geen succesmelding maar een foutmelding: wie
      // het apparaat doorgeeft moet weten dat er nog gegevens op staan.
      await clearAllData();

      showSuccess(t('offline.cleared', 'Offline opslag gewist'));
      setCachedItems([]);
      setTotalSize(0);
      setSelectedItems(new Set());
    } catch (error) {
      showError(t('errors.generic'));
    }
  }

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: '600px', maxHeight: '80vh' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{t('offline.manager', 'Offline Opslag')}</h2>
          <button className="btn btn-ghost" onClick={onClose} aria-label="Sluiten">
            <Icon name="close" size={20} />
          </button>
        </div>

        <div className="modal-body" style={{ overflowY: 'auto' }}>
          {loading ? (
            <div className="loading">
              <div className="spinner" />
            </div>
          ) : (
            <>
              <div className="flex justify-between items-center mb-3">
                <div>
                  <strong>{t('offline.totalSize', 'Totale grootte')}:</strong> {formatSize(totalSize)}
                </div>
                <div className="flex gap-2">
                  {cachedItems.length > 0 && (
                    <>
                      <button className="btn btn-sm btn-outline" onClick={selectAll}>
                        {selectedItems.size === cachedItems.length
                          ? t('common.deselectAll', 'Deselecteer alles')
                          : t('common.selectAll', 'Selecteer alles')}
                      </button>
                      {selectedItems.size > 0 && (
                        <button className="btn btn-sm btn-danger" onClick={deleteSelected}>
                          <Icon name="trash" size={14} />
                          {t('common.delete', 'Verwijderen')} ({selectedItems.size})
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {cachedItems.length === 0 ? (
                <div className="text-center text-muted py-4">
                  <Icon name="cloudOff" size={48} />
                  <p className="mt-2">{t('offline.noItems', 'Geen items in offline opslag')}</p>
                  <p className="text-sm">
                    {t(
                      'offline.noItemsHint',
                      'Bekijk partituren om ze automatisch beschikbaar te maken voor offline gebruik',
                    )}
                  </p>
                </div>
              ) : (
                <div className="offline-items">
                  {cachedItems.map((item) => (
                    <div
                      key={item.url}
                      className={`offline-item ${selectedItems.has(item.url) ? 'selected' : ''}`}
                      onClick={() => toggleSelect(item.url)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        padding: '0.75rem',
                        borderRadius: '0.5rem',
                        cursor: 'pointer',
                        background: selectedItems.has(item.url) ? 'var(--primary-light)' : 'var(--surface)',
                        marginBottom: '0.5rem',
                        border: '1px solid var(--border)',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedItems.has(item.url)}
                        // Het vinkje deed niets: een lege onChange, en de
                        // stopPropagation hield ook de klik op de regel tegen.
                        // Wie op het vinkje mikte, zag het aanslaan en meteen
                        // terugspringen. De stopPropagation blijft nodig, anders
                        // telt de regel eronder de klik ook mee en heffen de
                        // twee elkaar op.
                        onChange={() => toggleSelect(item.url)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <Icon name={item.type === 'pdf' ? 'fileText' : 'music'} size={20} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {item.name}
                        </div>
                        <div className="text-muted text-sm">{formatSize(item.size)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>
            {t('common.close', 'Sluiten')}
          </button>
          {cachedItems.length > 0 && (
            <button className="btn btn-danger" onClick={clearAllCache}>
              <Icon name="trash" size={16} />
              {t('offline.clearAll', 'Alles wissen')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export async function cacheForOffline(url: string): Promise<boolean> {
  try {
    const response = await fetch(url);
    if (!response.ok) return false;

    const cacheName = url.endsWith('.pdf') ? CACHE_NAMES.pdf : CACHE_NAMES.audio;
    const cache = await caches.open(cacheName);
    await cache.put(url, response);
    return true;
  } catch {
    return false;
  }
}

export async function isAvailableOffline(url: string): Promise<boolean> {
  try {
    const cacheName = url.endsWith('.pdf') ? CACHE_NAMES.pdf : CACHE_NAMES.audio;
    const cache = await caches.open(cacheName);
    const response = await cache.match(url);
    return !!response;
  } catch {
    return false;
  }
}

export async function removeFromOffline(url: string): Promise<boolean> {
  try {
    const cacheName = url.endsWith('.pdf') ? CACHE_NAMES.pdf : CACHE_NAMES.audio;
    const cache = await caches.open(cacheName);
    return await cache.delete(url);
  } catch {
    return false;
  }
}
