import { useTranslation } from 'react-i18next';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useAuth } from '../context/AuthContext';

export function InstallPrompt() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { canInstall, promptInstall, dismissPrompt, isDismissed } = usePWAInstall();

  // Niet aanbieden aan wie nog niet is ingelogd.
  //
  // Deze balk stond er altijd al, maar was in de praktijk dode code: Chrome
  // stuurt `beforeinstallprompt` alleen als er een service worker draait, en
  // die registreerde nooit (zie de toelichting in vite.config.ts). Sinds die
  // fout weg is verschijnt hij wel - en dan meteen op het inlogscherm, aan
  // iemand die de applicatie nog niet eens binnen is.
  //
  // Dat is de verkeerde volgorde: "zet deze app op je beginscherm" vraag je
  // aan iemand die hem gebruikt, niet aan een bezoeker die nog moet bewijzen
  // dat hij lid is. Het kostte bovendien meetbaar: de balk was op het
  // inlogscherm het grootste element op het scherm en bepaalde daarmee de LCP.
  if (!user) return null;

  if (!canInstall || isDismissed) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: '1rem',
        left: '1rem',
        right: '1rem',
        backgroundColor: 'var(--color-surface, #fff)',
        border: '1px solid var(--color-border, #e5e7eb)',
        borderRadius: 'var(--border-radius, 0.5rem)',
        padding: '1rem',
        boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
        zIndex: 9998,
        maxWidth: '400px',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <div
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            backgroundColor: 'var(--color-primary, #1976d2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
          </svg>
        </div>
        <div>
          <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{t('pwa.install_title')}</div>
          <div style={{ fontSize: '0.875rem', color: 'var(--color-text-light, #6b7280)' }}>
            {t('pwa.install_description')}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
        <button
          onClick={dismissPrompt}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: 'var(--border-radius, 0.375rem)',
            border: '1px solid var(--color-border, #e5e7eb)',
            backgroundColor: 'transparent',
            cursor: 'pointer',
            fontSize: '0.875rem',
          }}
        >
          {t('pwa.not_now')}
        </button>
        <button
          onClick={promptInstall}
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
          {t('pwa.install')}
        </button>
      </div>
    </div>
  );
}
