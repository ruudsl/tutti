import { useState, useEffect, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useOnlineStatus } from '../hooks/useOfflineData';
import { Icon } from './Icon';

export const OfflineIndicator = memo(function OfflineIndicator() {
  const isOnline = useOnlineStatus();
  const { t } = useTranslation();
  const [showBanner, setShowBanner] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced'>('idle');

  // Show banner when going offline or coming back online
  useEffect(() => {
    if (!isOnline) {
      setShowBanner(true);
      setWasOffline(true);
      setSyncStatus('idle');
    } else if (wasOffline) {
      // Show "back online" message and simulate sync
      setShowBanner(true);
      setSyncStatus('syncing');

      // Simulate sync completion
      const syncTimer = setTimeout(() => {
        setSyncStatus('synced');
      }, 1500);

      const hideTimer = setTimeout(() => {
        setShowBanner(false);
        setWasOffline(false);
        setSyncStatus('idle');
      }, 4000);

      return () => {
        clearTimeout(syncTimer);
        clearTimeout(hideTimer);
      };
    }
  }, [isOnline, wasOffline]);

  if (!showBanner) return null;

  const getBackgroundColor = () => {
    if (!isOnline) return 'var(--warning, #f59e0b)';
    if (syncStatus === 'syncing') return 'var(--info, #3b82f6)';
    return 'var(--success, #22c55e)';
  };

  const getStatusText = () => {
    if (!isOnline) {
      return t('pwa.offline_mode', 'Je bent offline');
    }
    if (syncStatus === 'syncing') {
      return t('pwa.syncing', 'Gegevens synchroniseren...');
    }
    return t('pwa.back_online', 'Je bent weer online');
  };

  return (
    <div
      role="alert"
      aria-live="polite"
      className="offline-indicator"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: getBackgroundColor(),
        color: isOnline ? '#fff' : '#000',
        padding: '0.75rem 1rem',
        textAlign: 'center',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.75rem',
        fontSize: '0.875rem',
        fontWeight: 500,
        transition: 'all 0.3s ease',
        animation: 'slideInUp 0.3s ease',
      }}
    >
      {/* Status icon */}
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {isOnline ? (
          syncStatus === 'syncing' ? (
            <div
              style={{
                width: '18px',
                height: '18px',
                border: '2px solid rgba(255, 255, 255, 0.3)',
                borderTopColor: 'white',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }}
            />
          ) : (
            <Icon name="check" size={20} />
          )
        ) : (
          <Icon name="wifiOff" size={20} />
        )}
      </div>

      {/* Status text */}
      <span>{getStatusText()}</span>

      {/* Offline details */}
      {!isOnline && (
        <span style={{ opacity: 0.8, fontSize: '0.8125rem' }}>
          - {t('pwa.offline_data_available', 'Gecachte data beschikbaar')}
        </span>
      )}

      {/* Pending changes indicator */}
      {!isOnline && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            marginLeft: '8px',
            padding: '4px 8px',
            backgroundColor: 'rgba(0, 0, 0, 0.15)',
            borderRadius: '12px',
            fontSize: '0.75rem',
          }}
        >
          <Icon name="upload" size={14} />
          <span>{t('pwa.pending_sync', 'Wacht op sync')}</span>
        </div>
      )}

      {/* Dismiss button */}
      {!isOnline && (
        <button
          onClick={() => setShowBanner(false)}
          style={{
            marginLeft: 'auto',
            background: 'rgba(0, 0, 0, 0.2)',
            border: 'none',
            borderRadius: '4px',
            padding: '4px 10px',
            color: 'inherit',
            cursor: 'pointer',
            fontSize: '0.75rem',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <Icon name="close" size={14} />
          {t('common.dismiss', 'Sluiten')}
        </button>
      )}

      <style>{`
        @keyframes slideInUp {
          from {
            transform: translateY(100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
});
