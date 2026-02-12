import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

// Upcoming Rehearsals Widget
export function UpcomingRehearsalsWidget() {
  const { t } = useTranslation();

  return (
    <div className="widget">
      <div className="widget-header">
        <h3 className="widget-title">{t('widgets.upcomingRehearsals')}</h3>
        <Link to="/rehearsals" className="widget-link">
          {t('widgets.viewAll')}
        </Link>
      </div>
      <div className="widget-body">
        <p className="text-light text-sm">{t('widgets.noUpcomingRehearsals')}</p>
      </div>
    </div>
  );
}

// Recent Activity Widget
export function RecentActivityWidget() {
  const { t } = useTranslation();

  return (
    <div className="widget">
      <div className="widget-header">
        <h3 className="widget-title">{t('widgets.recentActivity')}</h3>
      </div>
      <div className="widget-body">
        <p className="text-light text-sm">{t('widgets.noRecentActivity')}</p>
      </div>
    </div>
  );
}

// Quick Actions Widget
export function QuickActionsWidget() {
  const { t } = useTranslation();

  const actions = [
    { to: '/my-music', icon: '🎵', label: t('nav.myMusic') },
    { to: '/rehearsals', icon: '📅', label: t('nav.rehearsals') },
    { to: '/tools', icon: '🔧', label: t('nav.tools') },
    { to: '/issues', icon: '⚠️', label: t('nav.issues') },
  ];

  return (
    <div className="widget">
      <div className="widget-header">
        <h3 className="widget-title">{t('widgets.quickActions')}</h3>
      </div>
      <div className="widget-body">
        <div className="quick-actions-grid">
          {actions.map((action) => (
            <Link key={action.to} to={action.to} className="quick-action-btn">
              <span className="quick-action-icon" aria-hidden="true">{action.icon}</span>
              <span className="quick-action-label">{action.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

// New Music Widget
export function NewMusicWidget() {
  const { t } = useTranslation();

  return (
    <div className="widget">
      <div className="widget-header">
        <h3 className="widget-title">{t('widgets.newMusic')}</h3>
        <Link to="/my-music" className="widget-link">
          {t('widgets.viewAll')}
        </Link>
      </div>
      <div className="widget-body">
        <p className="text-light text-sm">{t('widgets.noNewMusic')}</p>
      </div>
    </div>
  );
}
