/** De tabbladbalk van het repetitieoverzicht. Letterlijk overgenomen uit Rehearsals.tsx. */

import { useTranslation } from 'react-i18next';
import type { RehearsalTab } from './hulpfuncties';

export function TabBar({
  activeTab,
  setActiveTab,
}: {
  activeTab: RehearsalTab;
  setActiveTab: (tab: RehearsalTab) => void;
}) {
  const { t } = useTranslation();

  return (
    <div style={{ display: 'flex', gap: '0', borderBottom: '2px solid var(--border)', marginBottom: '1.5rem' }}>
      <button
        onClick={() => setActiveTab('rehearsals')}
        style={{
          padding: '0.5rem 1.5rem',
          border: 'none',
          background: 'none',
          cursor: 'pointer',
          fontWeight: activeTab === 'rehearsals' ? 'bold' : 'normal',
          borderBottom: activeTab === 'rehearsals' ? '2px solid var(--primary)' : '2px solid transparent',
          marginBottom: '-2px',
          color: activeTab === 'rehearsals' ? 'var(--primary)' : 'inherit',
        }}
      >
        {t('rehearsals.title')}
      </button>
      <button
        onClick={() => setActiveTab('attendance')}
        style={{
          padding: '0.5rem 1.5rem',
          border: 'none',
          background: 'none',
          cursor: 'pointer',
          fontWeight: activeTab === 'attendance' ? 'bold' : 'normal',
          borderBottom: activeTab === 'attendance' ? '2px solid var(--primary)' : '2px solid transparent',
          marginBottom: '-2px',
          color: activeTab === 'attendance' ? 'var(--primary)' : 'inherit',
        }}
      >
        {t('rehearsals.attendance.title')}
      </button>
      <button
        onClick={() => setActiveTab('dashboard')}
        style={{
          padding: '0.5rem 1.5rem',
          border: 'none',
          background: 'none',
          cursor: 'pointer',
          fontWeight: activeTab === 'dashboard' ? 'bold' : 'normal',
          borderBottom: activeTab === 'dashboard' ? '2px solid var(--primary)' : '2px solid transparent',
          marginBottom: '-2px',
          color: activeTab === 'dashboard' ? 'var(--primary)' : 'inherit',
        }}
      >
        {t('rehearsals.attendanceDashboard', 'Dashboard')}
      </button>
    </div>
  );
}
