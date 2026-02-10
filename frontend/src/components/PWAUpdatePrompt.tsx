import { useRegisterSW } from 'virtual:pwa-register/react';
import { useTranslation } from 'react-i18next';

export function PWAUpdatePrompt() {
  const { t } = useTranslation();

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      // Check for updates every 12 hours
      if (registration) {
        setInterval(() => {
          registration.update();
        }, 12 * 60 * 60 * 1000);
      }
    },
    onRegisterError(error) {
      console.error('SW registration error:', error);
    },
  });

  if (!needRefresh) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: '1rem',
        right: '1rem',
        backgroundColor: 'var(--color-surface, #fff)',
        border: '1px solid var(--color-border, #e5e7eb)',
        borderRadius: 'var(--border-radius, 0.5rem)',
        padding: '1rem',
        boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
        zIndex: 9999,
        maxWidth: '320px',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--color-primary, #1976d2)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        <span style={{ fontWeight: 500 }}>{t('pwa.update_available')}</span>
      </div>
      <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-text-light, #6b7280)' }}>
        {t('pwa.update_description')}
      </p>
      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
        <button
          onClick={() => setNeedRefresh(false)}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: 'var(--border-radius, 0.375rem)',
            border: '1px solid var(--color-border, #e5e7eb)',
            backgroundColor: 'transparent',
            cursor: 'pointer',
            fontSize: '0.875rem',
          }}
        >
          {t('pwa.later')}
        </button>
        <button
          onClick={() => updateServiceWorker(true)}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: 'var(--border-radius, 0.375rem)',
            border: 'none',
            backgroundColor: 'var(--color-primary, #1976d2)',
            color: '#fff',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: 500,
          }}
        >
          {t('pwa.update_now')}
        </button>
      </div>
    </div>
  );
}
