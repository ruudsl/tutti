import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import MfaSettings from '../components/MfaSettings';
import BackupSettings from '../components/BackupSettings';
import OpslagGebruik from '../components/OpslagGebruik';
import VerenigingsExport from '../components/VerenigingsExport';
import Startlijst from '../components/Startlijst';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { ROLES } from '../utils/constants';
import { useDashboardWidgets } from '../hooks/useDashboardWidgets';
import { useIsSuperAdmin } from '../hooks/useMultiAssociation';
import { WidgetContainer, DashboardEditToggle } from '../components/DashboardWidgets';

export default function Dashboard() {
  const { user } = useAuth();
  const { t } = useTranslation();
  useDocumentTitle('pageTitle.dashboard');
  // De reservekopie gaat over de hele installatie, alle verenigingen samen;
  // de server laat hem alleen aan een superbeheerder (routes/backup.ts). Een
  // verenigingsbeheerder kreeg de kaart wel te zien, en daarna een 403.
  const isSuperbeheerder = useIsSuperAdmin().data?.isSuperAdmin === true;

  const {
    widgets,
    allWidgets,
    isEditMode,
    setIsEditMode,
    toggleWidget,
    reorderWidgets,
    setWidgetSize,
    resetToDefaults,
  } = useDashboardWidgets();

  const [dragIndex, setDragIndex] = useState<number | null>(null);

  return (
    <div>
      <div className="page-header">
        <h1>
          {t('dashboard.welcome')}, {user?.firstName}!
        </h1>
        <DashboardEditToggle
          isEditMode={isEditMode}
          onToggle={() => setIsEditMode(!isEditMode)}
          onReset={resetToDefaults}
        />
      </div>

      {user?.role === ROLES.ADMIN && <Startlijst />}

      <div className="widgets-grid">
        {(isEditMode ? allWidgets : widgets).map((widget, index) => (
          <WidgetContainer
            key={widget.id}
            widget={widget}
            isEditMode={isEditMode}
            onToggle={() => toggleWidget(widget.id)}
            onSizeChange={(size) => setWidgetSize(widget.id, size)}
            index={index}
            onDragStart={setDragIndex}
            onDragOver={(hoverIndex) => {
              if (dragIndex !== null && dragIndex !== hoverIndex) {
                reorderWidgets(dragIndex, hoverIndex);
                setDragIndex(hoverIndex);
              }
            }}
            onDragEnd={() => setDragIndex(null)}
          />
        ))}
      </div>

      <div className="mt-3" id="accountbeveiliging">
        <h2 className="mb-2">{t('dashboard.accountSecurity')}</h2>
        <MfaSettings />
      </div>

      {user?.role === ROLES.ADMIN && (
        <div className="mt-3">
          <h2 className="mb-2">{t('dashboard.administration')}</h2>
          <OpslagGebruik />
          <VerenigingsExport />
          {isSuperbeheerder && <BackupSettings />}
        </div>
      )}
    </div>
  );
}
