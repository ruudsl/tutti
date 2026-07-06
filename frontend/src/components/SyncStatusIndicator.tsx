/**
 * Sync Status Indicator Component
 * Shows the current sync status, pending mutations, and provides manual sync trigger.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useOfflineData, useSyncStatus } from '../hooks/useOfflineData';
import { ConfirmDialog } from './ConfirmDialog';

interface SyncStatusIndicatorProps {
  /** Show in compact mode (just icon) */
  compact?: boolean;
  /** Show in the header/navbar */
  inHeader?: boolean;
}

export function SyncStatusIndicator({ compact = false, inHeader = false }: SyncStatusIndicatorProps) {
  const { t } = useTranslation();
  const { syncAll, clearOfflineData } = useOfflineData();
  const { isOnline, isSyncing, lastSyncAt, pendingMutations, syncProgress, currentEntity, error } = useSyncStatus();
  const [showDetails, setShowDetails] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const formatLastSync = (dateStr: string | null): string => {
    if (!dateStr) return t('sync.never', 'Nog nooit');
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return t('sync.just_now', 'Zojuist');
    if (diffMins < 60) return t('sync.minutes_ago', '{{count}} min geleden', { count: diffMins });
    if (diffHours < 24) return t('sync.hours_ago', '{{count}} uur geleden', { count: diffHours });
    return t('sync.days_ago', '{{count}} dagen geleden', { count: diffDays });
  };

  const getStatusColor = (): string => {
    if (!isOnline) return 'var(--color-warning, #f59e0b)';
    if (error) return 'var(--color-danger, #dc2626)';
    if (isSyncing) return 'var(--color-primary, #1a5276)';
    if (pendingMutations > 0) return 'var(--color-warning, #f59e0b)';
    return 'var(--color-success, #22c55e)';
  };

  const getStatusText = (): string => {
    if (!isOnline) return t('sync.offline', 'Offline');
    if (isSyncing) return t('sync.syncing', 'Synchroniseren...');
    if (error) return t('sync.error', 'Sync fout');
    if (pendingMutations > 0) return t('sync.pending', '{{count}} wachtend', { count: pendingMutations });
    return t('sync.synced', 'Gesynchroniseerd');
  };

  const handleSync = async () => {
    if (!isOnline || isSyncing) return;
    await syncAll();
  };

  const handleClearData = async () => {
    setConfirmClear(false);
    await clearOfflineData();
  };

  if (compact) {
    return (
      <button
        onClick={() => setShowDetails(!showDetails)}
        title={getStatusText()}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '0.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        <StatusIcon isOnline={isOnline} isSyncing={isSyncing} hasError={!!error} />
        {pendingMutations > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '2px',
              right: '2px',
              background: 'var(--color-danger, #dc2626)',
              color: 'white',
              borderRadius: '50%',
              width: '14px',
              height: '14px',
              fontSize: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {pendingMutations > 9 ? '9+' : pendingMutations}
          </span>
        )}
      </button>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        padding: inHeader ? '0' : '1rem',
        background: inHeader ? 'transparent' : 'var(--color-surface, #fff)',
        borderRadius: inHeader ? '0' : '8px',
        border: inHeader ? 'none' : '1px solid var(--color-border, #e0e0e0)',
      }}
    >
      {/* Status Row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
        }}
      >
        <div
          style={{
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            background: getStatusColor(),
            animation: isSyncing ? 'pulse 1.5s infinite' : 'none',
          }}
        />
        <span style={{ flex: 1, fontSize: '0.875rem', fontWeight: 500 }}>{getStatusText()}</span>
        {isOnline && !isSyncing && (
          <button
            onClick={handleSync}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '0.25rem',
              color: 'var(--color-primary, #1a5276)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
              fontSize: '0.75rem',
            }}
            title={t('sync.manual_sync', 'Nu synchroniseren')}
          >
            <RefreshIcon size={16} />
          </button>
        )}
      </div>

      {/* Progress Bar (when syncing) */}
      {isSyncing && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <div
            style={{
              height: '4px',
              background: 'var(--color-border, #e0e0e0)',
              borderRadius: '2px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${syncProgress}%`,
                background: 'var(--color-primary, #1a5276)',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
          {currentEntity && (
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted, #666)' }}>
              {t(`sync.entity.${currentEntity}`, currentEntity)}
            </span>
          )}
        </div>
      )}

      {/* Last Sync Info */}
      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted, #666)' }}>
        {t('sync.last_sync', 'Laatste sync')}: {formatLastSync(lastSyncAt)}
      </div>

      {/* Error Message */}
      {error && (
        <div
          style={{
            fontSize: '0.75rem',
            color: 'var(--color-danger, #dc2626)',
            padding: '0.5rem',
            background: 'var(--color-danger-light, #fef2f2)',
            borderRadius: '4px',
          }}
        >
          {error}
        </div>
      )}

      {/* Pending Mutations Warning */}
      {pendingMutations > 0 && (
        <div
          style={{
            fontSize: '0.75rem',
            color: 'var(--color-warning, #f59e0b)',
            padding: '0.5rem',
            background: 'var(--color-warning-light, #fffbeb)',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <WarningIcon size={14} />
          {t('sync.pending_changes', '{{count}} wijzigingen wachten op synchronisatie', { count: pendingMutations })}
        </div>
      )}

      {/* Clear Data Button (for debugging/troubleshooting) */}
      {!inHeader && (
        <button
          onClick={() => setConfirmClear(true)}
          style={{
            marginTop: '0.5rem',
            padding: '0.5rem',
            fontSize: '0.75rem',
            color: 'var(--color-text-muted, #666)',
            background: 'none',
            border: '1px solid var(--color-border, #e0e0e0)',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          {t('sync.clear_offline_data', 'Offline data wissen')}
        </button>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>

      {confirmClear && (
        <ConfirmDialog
          title={t('common.confirmDeleteTitle')}
          message={t('sync.confirm_clear', 'Weet je zeker dat je alle offline data wilt wissen?')}
          confirmLabel={t('common.confirm')}
          variant="danger"
          onConfirm={handleClearData}
          onCancel={() => setConfirmClear(false)}
        />
      )}
    </div>
  );
}

// Icon Components
function StatusIcon({ isOnline, isSyncing, hasError }: { isOnline: boolean; isSyncing: boolean; hasError: boolean }) {
  if (isSyncing) {
    return (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        style={{ animation: 'spin 1s linear infinite' }}
      >
        <path d="M21 12a9 9 0 11-6.219-8.56" />
        <style>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </svg>
    );
  }

  if (!isOnline) {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="1" y1="1" x2="23" y2="23" />
        <path d="M16.72 11.06A10.94 10.94 0 0119 12.55" />
        <path d="M5 12.55a10.94 10.94 0 015.17-2.39" />
        <path d="M10.71 5.05A16 16 0 0122.58 9" />
        <path d="M1.42 9a15.91 15.91 0 014.7-2.88" />
        <path d="M8.53 16.11a6 6 0 016.95 0" />
        <line x1="12" y1="20" x2="12.01" y2="20" />
      </svg>
    );
  }

  if (hasError) {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-danger, #dc2626)" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    );
  }

  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-success, #22c55e)" strokeWidth="2">
      <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function RefreshIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M23 4v6h-6" />
      <path d="M1 20v-6h6" />
      <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
    </svg>
  );
}

function WarningIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2L1 21h22L12 2zm0 3.83L19.53 19H4.47L12 5.83zM11 10v4h2v-4h-2zm0 6v2h2v-2h-2z" />
    </svg>
  );
}

export default SyncStatusIndicator;
