import { useState, useEffect, useCallback, useRef, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { showSuccess, showError, toast } from '../utils/toast';
import { Icon } from './Icon';
import { isIndexedDBAvailable } from '../lib/offlineStorage';

export interface OfflineScannerProps {
  concertId: string;
  onScanComplete?: (result: ScanResult) => void;
}

export interface ScanResult {
  valid: boolean;
  status: 'valid' | 'used' | 'not_found' | 'offline_valid' | 'offline_already_used';
  ticket?: OfflineTicket;
  message: string;
}

export interface OfflineTicket {
  qrCode: string;
  buyerName: string;
  ticketType: string;
  status: 'valid' | 'used';
  seatInfo?: string;
  usedAt?: string;
}

interface OfflineScan {
  id: string;
  qrCode: string;
  scannedAt: string;
  result: string;
  synced: boolean;
}

const DB_NAME = 'harmonie-offline-scanner';
const DB_VERSION = 1;
const TICKETS_STORE = 'tickets';
const SCANS_STORE = 'scans';

export function OfflineScanner({ concertId, onScanComplete }: OfflineScannerProps) {
  const { t } = useTranslation();
  const scanVeldId = useId();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [tickets, setTickets] = useState<OfflineTicket[]>([]);
  const [pendingScans, setPendingScans] = useState<OfflineScan[]>([]);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [scanInput, setScanInput] = useState('');
  const [opslagOnbruikbaar, setOpslagOnbruikbaar] = useState(false);
  const dbRef = useRef<IDBDatabase | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Initialize IndexedDB
  useEffect(() => {
    // In een browser waar de opslag geblokkeerd is - privémodus, of
    // sitegegevens uitgezet - bestaat `indexedDB` niet. Zonder deze controle
    // klapt de regel hieronder en verdwijnt de hele scanner van het scherm.
    // Juist deze knop wordt aan de deur gebruikt, vaak op een geleende
    // telefoon, dus dat is precies het verkeerde moment.
    if (!isIndexedDBAvailable()) {
      setOpslagOnbruikbaar(true);
      return;
    }

    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      // Sommige browsers hebben `indexedDB` wél, maar laten `open` alsnog
      // struikelen als de gebruiker opslag heeft geweigerd.
      setOpslagOnbruikbaar(true);
      return;
    }

    request.onerror = () => {
      // Dit bleef eerder bij een regel in de console. Op het scherm was er dan
      // niets aan de hand, terwijl de scanner geen enkele kaart meer kende en
      // dus elke bezoeker aan de deur afwees.
      setOpslagOnbruikbaar(true);
    };

    request.onsuccess = () => {
      dbRef.current = request.result;
      setOpslagOnbruikbaar(false);
      loadOfflineData();
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(TICKETS_STORE)) {
        const ticketsStore = db.createObjectStore(TICKETS_STORE, { keyPath: 'qrCode' });
        ticketsStore.createIndex('concertId', 'concertId', { unique: false });
      }

      if (!db.objectStoreNames.contains(SCANS_STORE)) {
        const scansStore = db.createObjectStore(SCANS_STORE, { keyPath: 'id' });
        scansStore.createIndex('synced', 'synced', { unique: false });
      }
    };

    return () => {
      dbRef.current?.close();
    };
  }, []);

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      showSuccess(t('offlineScanner.backOnline'));
    };
    const handleOffline = () => {
      setIsOnline(false);
      toast(t('offlineScanner.nowOffline'), { icon: <Icon name="wifiOff" size={16} /> });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [t]);

  const loadOfflineData = useCallback(() => {
    if (!dbRef.current) return;

    const ticketsTx = dbRef.current.transaction(TICKETS_STORE, 'readonly');
    const ticketsStore = ticketsTx.objectStore(TICKETS_STORE);
    const ticketsIndex = ticketsStore.index('concertId');
    const ticketsRequest = ticketsIndex.getAll(concertId);

    ticketsRequest.onsuccess = () => {
      setTickets(ticketsRequest.result);
    };

    const scansTx = dbRef.current.transaction(SCANS_STORE, 'readonly');
    const scansStore = scansTx.objectStore(SCANS_STORE);
    const scansRequest = scansStore.getAll();

    scansRequest.onsuccess = () => {
      // Filter to only unsynced scans
      const unsynced = scansRequest.result.filter((scan: OfflineScan) => !scan.synced);
      setPendingScans(unsynced);
    };

    const storedLastSync = localStorage.getItem(`offline-scanner-last-sync-${concertId}`);
    if (storedLastSync) {
      setLastSync(storedLastSync);
    }
  }, [concertId]);

  const downloadTickets = async () => {
    if (!isOnline) {
      showError(t('offlineScanner.needOnlineToDownload'));
      return;
    }

    setIsDownloading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/concerts/${concertId}/tickets/offline-sync`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Failed to download tickets');

      const data = await response.json();

      if (!dbRef.current) throw new Error('Database not initialized');

      const tx = dbRef.current.transaction(TICKETS_STORE, 'readwrite');
      const store = tx.objectStore(TICKETS_STORE);

      const index = store.index('concertId');
      const existingRequest = index.openCursor(IDBKeyRange.only(concertId));

      existingRequest.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };

      for (const ticket of data.tickets) {
        store.put({ ...ticket, concertId });
      }

      tx.oncomplete = () => {
        const now = new Date().toISOString();
        localStorage.setItem(`offline-scanner-last-sync-${concertId}`, now);
        setLastSync(now);
        setTickets(data.tickets);
        showSuccess(t('offlineScanner.downloadComplete', { count: data.tickets.length }));
      };
    } catch (error) {
      console.error('Download error:', error);
      showError(t('offlineScanner.downloadFailed'));
    } finally {
      setIsDownloading(false);
    }
  };

  const validateTicketOffline = (qrCode: string): ScanResult => {
    const ticket = tickets.find((t) => t.qrCode === qrCode);

    if (!ticket) {
      return { valid: false, status: 'not_found', message: t('offlineScanner.ticketNotFound') };
    }

    if (ticket.status === 'used') {
      return {
        valid: false,
        status: 'offline_already_used',
        ticket,
        message: t('offlineScanner.alreadyUsed', { time: ticket.usedAt }),
      };
    }

    return { valid: true, status: 'offline_valid', ticket, message: t('offlineScanner.validTicket') };
  };

  const markTicketUsedLocally = (qrCode: string) => {
    if (!dbRef.current) return;

    const tx = dbRef.current.transaction(TICKETS_STORE, 'readwrite');
    const store = tx.objectStore(TICKETS_STORE);
    const request = store.get(qrCode);

    request.onsuccess = () => {
      const ticket = request.result;
      if (ticket) {
        ticket.status = 'used';
        ticket.usedAt = new Date().toISOString();
        store.put(ticket);

        setTickets((prev) =>
          prev.map((t) => (t.qrCode === qrCode ? { ...t, status: 'used' as const, usedAt: ticket.usedAt } : t)),
        );
      }
    };
  };

  const queueScan = (qrCode: string, result: string) => {
    if (!dbRef.current) return;

    const scan: OfflineScan = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      qrCode,
      scannedAt: new Date().toISOString(),
      result,
      synced: false,
    };

    const tx = dbRef.current.transaction(SCANS_STORE, 'readwrite');
    const store = tx.objectStore(SCANS_STORE);
    store.add(scan);

    setPendingScans((prev) => [...prev, scan]);
  };

  const handleScan = async (qrCode: string) => {
    const cleanCode = qrCode.trim().toUpperCase();
    if (!cleanCode) return;

    let result: ScanResult;

    if (isOnline) {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/tickets/validate`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ qrCode: cleanCode, concertId }),
        });

        const data = await response.json();
        result = { valid: data.valid, status: data.status, ticket: data.ticket, message: data.message };

        if (data.valid) {
          await fetch(`/api/tickets/scan`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ qrCode: cleanCode }),
          });
        }
      } catch {
        result = validateTicketOffline(cleanCode);
        markTicketUsedLocally(cleanCode);
        queueScan(cleanCode, result.status);
      }
    } else {
      result = validateTicketOffline(cleanCode);
      if (result.valid) {
        markTicketUsedLocally(cleanCode);
        queueScan(cleanCode, 'offline_valid');
      } else {
        queueScan(cleanCode, result.status);
      }
    }

    if (result.valid) {
      showSuccess(result.message);
    } else {
      showError(result.message);
    }

    onScanComplete?.(result);
    setScanInput('');
    inputRef.current?.focus();
  };

  const syncPendingScans = async () => {
    if (!isOnline || pendingScans.length === 0) return;

    setIsSyncing(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/concerts/${concertId}/tickets/sync-offline-scans`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ scans: pendingScans }),
      });

      if (!response.ok) throw new Error('Sync failed');

      if (dbRef.current) {
        const tx = dbRef.current.transaction(SCANS_STORE, 'readwrite');
        const store = tx.objectStore(SCANS_STORE);

        for (const scan of pendingScans) {
          const request = store.get(scan.id);
          request.onsuccess = () => {
            const s = request.result;
            if (s) {
              s.synced = true;
              store.put(s);
            }
          };
        }
      }

      setPendingScans([]);
      showSuccess(t('offlineScanner.syncComplete'));
    } catch (error) {
      console.error('Sync error:', error);
      showError(t('offlineScanner.syncFailed'));
    } finally {
      setIsSyncing(false);
    }
  };

  const handleInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleScan(scanInput);
  };

  const validTickets = tickets.filter((t) => t.status === 'valid').length;
  const usedTickets = tickets.filter((t) => t.status === 'used').length;

  return (
    <div className="offline-scanner card">
      <div className="card-body">
        <div className="flex justify-between items-center mb-4">
          <h3>{t('offlineScanner.title')}</h3>
          <div className={`status-badge ${isOnline ? 'online' : 'offline'}`}>
            <span className="status-dot" />
            {isOnline ? t('offlineScanner.online') : t('offlineScanner.offline')}
          </div>
        </div>

        {opslagOnbruikbaar && (
          <div className="alert alert-danger mb-4" role="alert">
            {t('offlineScanner.storageUnavailable')}
          </div>
        )}

        <div className="scanner-stats grid grid-cols-3 gap-4 mb-4">
          <div className="stat-card">
            <div className="stat-value">{tickets.length}</div>
            <div className="stat-label">{t('offlineScanner.downloaded')}</div>
          </div>
          <div className="stat-card">
            <div className="stat-value text-success">{validTickets}</div>
            <div className="stat-label">{t('offlineScanner.valid')}</div>
          </div>
          <div className="stat-card">
            <div className="stat-value text-warning">{usedTickets}</div>
            <div className="stat-label">{t('offlineScanner.used')}</div>
          </div>
        </div>

        <form onSubmit={handleInputSubmit} className="mb-4">
          {/* Met de hand gekoppeld: veld en knop staan samen in een eigen
              omhulsel onder het label, dus FormField past hier niet. */}
          <div className="form-group">
            <label className="form-label" htmlFor={scanVeldId}>
              {t('offlineScanner.scanOrEnter')}
            </label>
            <div className="flex gap-2">
              <input
                id={scanVeldId}
                ref={inputRef}
                type="text"
                className="form-control"
                value={scanInput}
                onChange={(e) => setScanInput(e.target.value)}
                placeholder={t('offlineScanner.ticketCode')}
                autoFocus
              />
              <button type="submit" className="btn btn-primary">
                {t('offlineScanner.validate')}
              </button>
            </div>
          </div>
        </form>

        {pendingScans.length > 0 && (
          <div className="alert alert-warning mb-4">
            <div className="flex justify-between items-center">
              <span>{t('offlineScanner.pendingScans', { count: pendingScans.length })}</span>
              <button className="btn btn-sm btn-warning" onClick={syncPendingScans} disabled={!isOnline || isSyncing}>
                {isSyncing ? t('common.loading') : t('offlineScanner.syncNow')}
              </button>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <button className="btn btn-outline flex-1" onClick={downloadTickets} disabled={!isOnline || isDownloading}>
            {isDownloading ? t('common.loading') : t('offlineScanner.downloadTickets')}
          </button>
        </div>

        {lastSync && (
          <p className="text-muted text-sm mt-2">
            {t('offlineScanner.lastSync')}: {new Date(lastSync).toLocaleString()}
          </p>
        )}
      </div>

      <style>{`
                .status-badge {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    padding: 0.25rem 0.75rem;
                    border-radius: 9999px;
                    font-size: 0.875rem;
                    font-weight: 500;
                }
                .status-badge.online {
                    background: rgba(34, 197, 94, 0.1);
                    color: #22c55e;
                }
                .status-badge.offline {
                    background: rgba(239, 68, 68, 0.1);
                    color: #ef4444;
                }
                .status-dot {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    background: currentColor;
                }
                .stat-card {
                    background: var(--background);
                    padding: 1rem;
                    border-radius: 0.5rem;
                    text-align: center;
                }
                .stat-value {
                    font-size: 1.5rem;
                    font-weight: 700;
                }
                .stat-label {
                    font-size: 0.75rem;
                    color: var(--text-light);
                }
            `}</style>
    </div>
  );
}

export default OfflineScanner;
