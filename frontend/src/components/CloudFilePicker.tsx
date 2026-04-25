import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { getCloudImportConfig, importFromOneDrive, importFromGoogleDrive } from '../api';
import type { CloudImportConfig, CloudImportFile, CloudImportResult } from '../api';
import { showError, showSuccess } from '../utils/toast';
import { getErrorMessage } from '../utils/errors';

declare global {
  interface Window {
    msal?: any;
    gapi?: any;
    google?: any;
  }
}

const ONEDRIVE_SCOPE = 'Files.Read.All';
const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';

function loadScript(src: string, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.getElementById(id)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.id = id;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

interface OneDriveItem {
  id: string;
  name: string;
  size: number;
  webUrl: string;
  folder?: { childCount: number };
  file?: { mimeType: string };
  parentReference?: { id: string; path: string };
}

interface CloudFilePickerProps {
  listId?: string;
  onImported?: (result: CloudImportResult) => void;
}

export function CloudFilePicker({ listId, onImported }: CloudFilePickerProps) {
  const { t } = useTranslation();
  const [config, setConfig] = useState<CloudImportConfig | null>(null);
  const [oneDriveOpen, setOneDriveOpen] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    getCloudImportConfig()
      .then(setConfig)
      .catch(() => setConfig(null));
  }, []);

  const handleOneDriveImport = useCallback(
    async (files: CloudImportFile[], accessToken: string) => {
      setImporting(true);
      try {
        const result = await importFromOneDrive({ files, accessToken, listId });
        if (result.errors && result.errors.length > 0) {
          showError(`${result.errors.length} ${t('cloudImport.someFailed', 'bestanden mislukt')}`);
        }
        if (result.uploaded.length > 0) {
          showSuccess(`${result.uploaded.length} ${t('cloudImport.imported', 'bestanden geïmporteerd')}`);
        }
        onImported?.(result);
      } catch (error) {
        showError(getErrorMessage(error));
      } finally {
        setImporting(false);
      }
    },
    [listId, onImported, t]
  );

  const handleGoogleImport = useCallback(
    async (files: CloudImportFile[], accessToken: string) => {
      setImporting(true);
      try {
        const result = await importFromGoogleDrive({ files, accessToken, listId });
        if (result.errors && result.errors.length > 0) {
          showError(`${result.errors.length} ${t('cloudImport.someFailed', 'bestanden mislukt')}`);
        }
        if (result.uploaded.length > 0) {
          showSuccess(`${result.uploaded.length} ${t('cloudImport.imported', 'bestanden geïmporteerd')}`);
        }
        onImported?.(result);
      } catch (error) {
        showError(getErrorMessage(error));
      } finally {
        setImporting(false);
      }
    },
    [listId, onImported, t]
  );

  if (!config) return null;
  const anyEnabled = config.onedrive.enabled || config.googleDrive.enabled;
  if (!anyEnabled) return null;

  return (
    <div className="cloud-file-picker">
      <div className="flex gap-1 flex-wrap">
        {config.onedrive.enabled && (
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => setOneDriveOpen(true)}
            disabled={importing}
          >
            <span aria-hidden="true">☁️</span> {t('cloudImport.onedrive', 'Importeer uit OneDrive')}
          </button>
        )}
        {config.googleDrive.enabled && (
          <GoogleDriveButton
            config={config.googleDrive}
            disabled={importing}
            onPick={handleGoogleImport}
          />
        )}
      </div>

      {oneDriveOpen && config.onedrive.enabled && config.onedrive.clientId && (
        <OneDrivePickerModal
          clientId={config.onedrive.clientId}
          tenantId={config.onedrive.tenantId}
          onClose={() => setOneDriveOpen(false)}
          onPick={async (files, token) => {
            setOneDriveOpen(false);
            await handleOneDriveImport(files, token);
          }}
        />
      )}
    </div>
  );
}

interface OneDrivePickerModalProps {
  clientId: string;
  tenantId: string;
  onClose: () => void;
  onPick: (files: CloudImportFile[], accessToken: string) => Promise<void>;
}

function OneDrivePickerModal({ clientId, tenantId, onClose, onPick }: OneDrivePickerModalProps) {
  const { t } = useTranslation();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [items, setItems] = useState<OneDriveItem[]>([]);
  const [path, setPath] = useState<{ id: string; name: string }[]>([{ id: 'root', name: 'OneDrive' }]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const currentFolderId = path[path.length - 1].id;

  useEffect(() => {
    let cancelled = false;
    async function authenticate() {
      try {
        await loadScript(
          'https://alcdn.msauth.net/browser/2.38.3/js/msal-browser.min.js',
          'msal-browser-sdk'
        );
        if (cancelled) return;
        const msalInstance = new window.msal.PublicClientApplication({
          auth: {
            clientId,
            authority: `https://login.microsoftonline.com/${tenantId}`,
            redirectUri: window.location.origin,
          },
          cache: { cacheLocation: 'sessionStorage' },
        });
        await msalInstance.initialize();
        const result = await msalInstance.loginPopup({ scopes: [ONEDRIVE_SCOPE] });
        if (cancelled) return;
        setAccessToken(result.accessToken);
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message || 'Microsoft authentication failed');
          setLoading(false);
        }
      }
    }
    authenticate();
    return () => {
      cancelled = true;
    };
  }, [clientId, tenantId]);

  const loadItems = useCallback(
    async (folderId: string) => {
      if (!accessToken) return;
      setLoading(true);
      setError(null);
      try {
        const url =
          folderId === 'root'
            ? 'https://graph.microsoft.com/v1.0/me/drive/root/children?$top=200&$select=id,name,size,webUrl,folder,file,parentReference'
            : `https://graph.microsoft.com/v1.0/me/drive/items/${folderId}/children?$top=200&$select=id,name,size,webUrl,folder,file,parentReference`;
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!response.ok) throw new Error(`Graph API error: ${response.status}`);
        const data = await response.json();
        const filtered = (data.value as OneDriveItem[]).filter(
          (item) => item.folder || (item.file && item.name.toLowerCase().endsWith('.pdf'))
        );
        setItems(filtered);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [accessToken]
  );

  const searchItems = useCallback(
    async (query: string) => {
      if (!accessToken || !query.trim()) {
        loadItems(currentFolderId);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const url = `https://graph.microsoft.com/v1.0/me/drive/root/search(q='${encodeURIComponent(query)}')?$top=100&$select=id,name,size,webUrl,folder,file,parentReference`;
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!response.ok) throw new Error(`Graph API error: ${response.status}`);
        const data = await response.json();
        const filtered = (data.value as OneDriveItem[]).filter(
          (item) => item.file && item.name.toLowerCase().endsWith('.pdf')
        );
        setItems(filtered);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [accessToken, currentFolderId, loadItems]
  );

  useEffect(() => {
    if (accessToken) {
      loadItems(currentFolderId);
    }
  }, [accessToken, currentFolderId, loadItems]);

  const handleItemClick = (item: OneDriveItem) => {
    if (item.folder) {
      setPath((prev) => [...prev, { id: item.id, name: item.name }]);
      setSelected(new Set());
    } else {
      const next = new Set(selected);
      if (next.has(item.id)) {
        next.delete(item.id);
      } else {
        next.add(item.id);
      }
      setSelected(next);
    }
  };

  const handleBreadcrumbClick = (index: number) => {
    setPath(path.slice(0, index + 1));
    setSelected(new Set());
    setSearchQuery('');
  };

  const handleConfirm = async () => {
    if (!accessToken) return;
    const files: CloudImportFile[] = items
      .filter((item) => selected.has(item.id) && item.file)
      .map((item) => ({ id: item.id, name: item.name }));
    if (files.length === 0) return;
    await onPick(files, accessToken);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{t('cloudImport.onedriveTitle', 'OneDrive bestanden selecteren')}</h2>
          <button className="btn-close" onClick={onClose} aria-label={t('common.close')}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          {error && <div className="alert alert-error">{error}</div>}

          {!error && (
            <>
              <div className="mb-2">
                <input
                  type="search"
                  className="form-control"
                  placeholder={t('cloudImport.searchPdfs', 'Zoek PDF bestanden...')}
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    if (!e.target.value) loadItems(currentFolderId);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') searchItems(searchQuery);
                  }}
                />
              </div>

              {!searchQuery && (
                <div className="breadcrumbs mb-2" style={{ fontSize: '0.9em' }}>
                  {path.map((p, idx) => (
                    <span key={p.id}>
                      {idx > 0 && ' / '}
                      <button
                        type="button"
                        className="btn-link"
                        onClick={() => handleBreadcrumbClick(idx)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)' }}
                      >
                        {p.name}
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {loading ? (
                <div>{t('common.loading', 'Laden...')}</div>
              ) : items.length === 0 ? (
                <div className="empty-state">{t('cloudImport.noFiles', 'Geen bestanden gevonden.')}</div>
              ) : (
                <ul className="list-unstyled" style={{ maxHeight: '50vh', overflow: 'auto' }}>
                  {items.map((item) => (
                    <li
                      key={item.id}
                      onClick={() => handleItemClick(item)}
                      style={{
                        padding: '0.5rem',
                        cursor: 'pointer',
                        background: selected.has(item.id) ? 'var(--primary-subtle, #eef)' : 'transparent',
                        borderBottom: '1px solid var(--border-color, #eee)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                      }}
                    >
                      <span aria-hidden="true">{item.folder ? '📁' : '📄'}</span>
                      <span style={{ flex: 1 }}>{item.name}</span>
                      {item.file && (
                        <small style={{ color: 'var(--text-muted, #666)' }}>
                          {(item.size / 1024).toFixed(0)} KB
                        </small>
                      )}
                      {item.file && selected.has(item.id) && <span aria-hidden="true">✓</span>}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            className="btn btn-primary"
            onClick={handleConfirm}
            disabled={selected.size === 0 || loading}
          >
            {t('cloudImport.importSelected', 'Importeer geselecteerde')} ({selected.size})
          </button>
        </div>
      </div>
    </div>
  );
}

interface GoogleDriveButtonProps {
  config: { clientId: string | null; apiKey: string | null };
  disabled?: boolean;
  onPick: (files: CloudImportFile[], accessToken: string) => Promise<void>;
}

function GoogleDriveButton({ config, disabled, onPick }: GoogleDriveButtonProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);

  const openPicker = async () => {
    if (!config.clientId || !config.apiKey) return;
    setLoading(true);
    try {
      await Promise.all([
        loadScript('https://apis.google.com/js/api.js', 'gapi-script'),
        loadScript('https://accounts.google.com/gsi/client', 'gis-script'),
      ]);

      await new Promise<void>((resolve, reject) => {
        window.gapi.load('picker', { callback: () => resolve(), onerror: reject });
      });

      const accessToken = await new Promise<string>((resolve, reject) => {
        const tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: config.clientId,
          scope: GOOGLE_DRIVE_SCOPE,
          callback: (response: any) => {
            if (response.error) {
              reject(new Error(response.error));
            } else {
              resolve(response.access_token);
            }
          },
        });
        tokenClient.requestAccessToken();
      });

      await new Promise<void>((resolve, reject) => {
        const view = new window.google.picker.DocsView(window.google.picker.ViewId.DOCS)
          .setMimeTypes('application/pdf')
          .setIncludeFolders(true)
          .setSelectFolderEnabled(false);

        const picker = new window.google.picker.PickerBuilder()
          .enableFeature(window.google.picker.Feature.MULTISELECT_ENABLED)
          .setOAuthToken(accessToken)
          .setDeveloperKey(config.apiKey)
          .addView(view)
          .setCallback(async (data: any) => {
            const action = data[window.google.picker.Response.ACTION];
            if (action === window.google.picker.Action.PICKED) {
              const docs = data[window.google.picker.Response.DOCUMENTS] || [];
              const files: CloudImportFile[] = docs.map((doc: any) => ({
                id: doc.id,
                name: doc.name,
              }));
              try {
                await onPick(files, accessToken);
                resolve();
              } catch (e) {
                reject(e);
              }
            } else if (action === window.google.picker.Action.CANCEL) {
              resolve();
            }
          })
          .build();
        picker.setVisible(true);
      });
    } catch (e) {
      showError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      className="btn btn-outline"
      onClick={openPicker}
      disabled={disabled || loading}
    >
      <span aria-hidden="true">📁</span>{' '}
      {loading ? t('common.loading', 'Laden...') : t('cloudImport.googleDrive', 'Importeer uit Google Drive')}
    </button>
  );
}
