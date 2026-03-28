import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useOnlineStatus } from '../hooks/useOfflineData';

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();
  const { t } = useTranslation();
  const [showBanner, setShowBanner] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  // Show banner when going offline or coming back online
  useEffect(() => {
    if (!isOnline) {
      setShowBanner(true);
      setWasOffline(true);
    } else if (wasOffline) {
      // Show "back online" message briefly
      setShowBanner(true);
      const timer = setTimeout(() => {
        setShowBanner(false);
        setWasOffline(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isOnline, wasOffline]);

  if (!showBanner) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: isOnline ? 'var(--color-success, #22c55e)' : 'var(--color-warning, #f59e0b)',
        color: isOnline ? '#fff' : '#000',
        padding: '0.75rem 1rem',
        textAlign: 'center',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        fontSize: '0.875rem',
        fontWeight: 500,
        transition: 'background-color 0.3s ease',
      }}
    >
      {isOnline ? (
        <>
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          {t('pwa.back_online', 'Je bent weer online')}
        </>
      ) : (
        <>
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="1" y1="1" x2="23" y2="23" />
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
            <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
            <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
            <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
            <line x1="12" y1="20" x2="12.01" y2="20" />
          </svg>
          <span>
            {t('pwa.offline_mode', 'Je bent offline')}
            {' - '}
            {t('pwa.offline_data_available', 'Gecachte data beschikbaar')}
          </span>
        </>
      )}
      {!isOnline && (
        <button
          onClick={() => setShowBanner(false)}
          style={{
            marginLeft: '1rem',
            background: 'rgba(0,0,0,0.2)',
            border: 'none',
            borderRadius: '4px',
            padding: '0.25rem 0.5rem',
            color: 'inherit',
            cursor: 'pointer',
            fontSize: '0.75rem',
          }}
        >
          {t('common.dismiss', 'Sluiten')}
        </button>
      )}
    </div>
  );
}
