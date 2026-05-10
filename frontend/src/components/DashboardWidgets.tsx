import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import type { DashboardWidget, WidgetType } from '../hooks/useDashboardWidgets';
import { getUpcomingRehearsals } from '../api';
import { getTaskSummary, type TaskPriority } from '../api/tasks';
import { Icon, type IconName } from './Icon';
import type { Rehearsal } from '../types';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

interface WidgetContainerProps {
  widget: DashboardWidget;
  isEditMode: boolean;
  onToggle: () => void;
  onSizeChange: (size: DashboardWidget['size']) => void;
  index: number;
  onDragStart: (index: number) => void;
  onDragOver: (index: number) => void;
  onDragEnd: () => void;
}

export function WidgetContainer({
  widget,
  isEditMode,
  onToggle,
  onSizeChange,
  index,
  onDragStart,
  onDragOver,
  onDragEnd,
}: WidgetContainerProps) {
  const { t } = useTranslation();
  const [isDragging, setIsDragging] = useState(false);

  const handleDragStart = (e: React.DragEvent) => {
    setIsDragging(true);
    e.dataTransfer.effectAllowed = 'move';
    onDragStart(index);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    onDragOver(index);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    onDragEnd();
  };

  const sizeClass = {
    small: 'widget-small',
    medium: 'widget-medium',
    large: 'widget-large',
    full: 'widget-full',
  }[widget.size];

  return (
    <div
      className={`widget-wrapper ${sizeClass} ${isDragging ? 'dragging' : ''} ${isEditMode ? 'edit-mode' : ''}`}
      draggable={isEditMode}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      {isEditMode && (
        <div className="widget-edit-overlay">
          <div className="widget-edit-controls">
            <button
              className="widget-toggle-btn"
              onClick={onToggle}
              title={widget.enabled ? t('dashboard.hideWidget') : t('dashboard.showWidget')}
            >
              <Icon name={widget.enabled ? 'eye' : 'eyeOff'} size={16} />
            </button>
            <select
              className="widget-size-select"
              value={widget.size}
              onChange={(e) => onSizeChange(e.target.value as DashboardWidget['size'])}
            >
              <option value="small">{t('dashboard.sizeSmall')}</option>
              <option value="medium">{t('dashboard.sizeMedium')}</option>
              <option value="large">{t('dashboard.sizeLarge')}</option>
              <option value="full">{t('dashboard.sizeFull')}</option>
            </select>
            <span className="widget-drag-handle" title={t('dashboard.dragToReorder')}>⋮⋮</span>
          </div>
        </div>
      )}
      <WidgetRenderer type={widget.type} config={widget.config} />
    </div>
  );
}

// Widget renderer that maps widget type to component
function WidgetRenderer({ type }: { type: WidgetType; config?: Record<string, unknown> }) {
  switch (type) {
    case 'stats':
      return <StatsWidget />;
    case 'tasks':
      return <TasksWidget />;
    case 'music-lists':
      return <MusicListsWidget />;
    case 'upcoming-rehearsals':
      return <UpcomingRehearsalsWidget />;
    case 'recent-activity':
      return <RecentActivityWidget />;
    case 'practice-progress':
      return <PracticeProgressWidget />;
    case 'favorites':
      return <FavoritesWidget />;
    case 'quick-actions':
      return <QuickActionsWidget />;
    case 'announcements':
      return <AnnouncementsWidget />;
    default:
      return <div>Unknown widget type: {type}</div>;
  }
}

// Dashboard Edit Mode Toggle
export function DashboardEditToggle({
  isEditMode,
  onToggle,
  onReset,
}: {
  isEditMode: boolean;
  onToggle: () => void;
  onReset: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="dashboard-edit-toggle">
      <button
        className={`btn ${isEditMode ? 'btn-primary' : 'btn-outline'} btn-sm`}
        onClick={onToggle}
      >
        {isEditMode ? t('dashboard.doneEditing') : t('dashboard.customizeDashboard')}
      </button>
      {isEditMode && (
        <button className="btn btn-outline btn-sm" onClick={onReset}>
          {t('dashboard.resetToDefault')}
        </button>
      )}
    </div>
  );
}

// Stats Widget
function StatsWidget() {
  const { t } = useTranslation();
  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/activity/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      return res.json();
    },
  });

  return (
    <div className="widget widget-stats">
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{stats?.totalPieces || 0}</div>
          <div className="stat-label">{t('dashboard.totalPieces')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats?.totalPracticeMinutes || 0}</div>
          <div className="stat-label">{t('dashboard.practiceMinutes')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats?.downloadsThisMonth || 0}</div>
          <div className="stat-label">{t('dashboard.downloadsThisMonth')}</div>
        </div>
      </div>
    </div>
  );
}

// Tasks Widget
function TasksWidget() {
  const { t } = useTranslation();
  const { data: summary, isLoading } = useQuery({
    queryKey: ['task-summary'],
    queryFn: getTaskSummary,
  });

  const priorityColors: Record<TaskPriority, string> = {
    low: 'text-gray-500',
    medium: 'text-blue-500',
    high: 'text-orange-500',
    urgent: 'text-red-500',
  };

  const priorityIcons: Record<TaskPriority, string> = {
    low: '○',
    medium: '●',
    high: '▲',
    urgent: '⚠',
  };

  return (
    <div className="widget">
      <div className="widget-header">
        <h3 className="widget-title">{t('widgets.myTasks')}</h3>
        <Link to="/tasks" className="widget-link">
          {t('widgets.viewAll')}
        </Link>
      </div>
      <div className="widget-body">
        {isLoading ? (
          <p className="text-light text-sm">{t('common.loading')}</p>
        ) : summary?.myTasks && summary.myTasks.length > 0 ? (
          <>
            <div className="flex gap-2 mb-3 text-sm">
              <span className="badge badge-primary badge-sm">
                {summary.totalOpen} {t('widgets.openTasks')}
              </span>
              {summary.overdueTasks.length > 0 && (
                <span className="badge badge-error badge-sm">
                  {summary.overdueTasks.length} {t('widgets.overdue')}
                </span>
              )}
            </div>
            <ul className="widget-list">
              {summary.myTasks.map((task) => (
                <li key={task.id} className="flex items-center gap-2">
                  <span className={priorityColors[task.priority]} title={task.priority}>
                    {priorityIcons[task.priority]}
                  </span>
                  <Link to={`/tasks?id=${task.id}`} className="flex-1 truncate">
                    {task.title}
                  </Link>
                  {task.dueDate && (
                    <span className={`text-xs ${new Date(task.dueDate) < new Date() ? 'text-red-500' : 'text-base-content/50'}`}>
                      {new Date(task.dueDate).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div className="widget-empty-state">
            <span className="widget-empty-icon" aria-hidden="true">
              <Icon name="checkCircle" size={32} />
            </span>
            <p className="text-light text-sm">{t('widgets.noTasks')}</p>
            <Link to="/tasks" className="btn btn-outline btn-sm mt-1">{t('nav.tasks')}</Link>
          </div>
        )}
      </div>
    </div>
  );
}

// Music Lists Widget
function MusicListsWidget() {
  const { t } = useTranslation();
  const { data: lists = [] } = useQuery({
    queryKey: ['my-music-lists'],
    queryFn: async () => {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/music-lists/my`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];
      return res.json();
    },
  });

  return (
    <div className="widget">
      <div className="widget-header">
        <h3 className="widget-title">{t('widgets.myMusicLists')}</h3>
        <Link to="/my-music" className="widget-link">
          {t('widgets.viewAll')}
        </Link>
      </div>
      <div className="widget-body">
        {lists.length > 0 ? (
          <ul className="widget-list">
            {lists.slice(0, 5).map((list: any) => (
              <li key={list.id}>
                <Link to={`/my-music?listId=${list.id}`}>{list.name}</Link>
                <span className="badge">{list.titleCount || 0}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="widget-empty-state">
            <span className="widget-empty-icon" aria-hidden="true">
              <Icon name="music" size={32} />
            </span>
            <p className="text-light text-sm">{t('widgets.noMusicLists')}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Practice Progress Widget
function PracticeProgressWidget() {
  const { t } = useTranslation();
  const { data: progress } = useQuery({
    queryKey: ['practice-progress'],
    queryFn: async () => {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/practice/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      return res.json();
    },
  });

  const weeklyGoal = 120; // 2 hours
  const percentage = progress ? Math.min((progress.weeklyMinutes / weeklyGoal) * 100, 100) : 0;

  return (
    <div className="widget">
      <div className="widget-header">
        <h3 className="widget-title">{t('widgets.practiceProgress')}</h3>
        <Link to="/practice-schedules" className="widget-link">
          {t('widgets.viewAll')}
        </Link>
      </div>
      <div className="widget-body">
        <div className="progress-bar-container">
          <div className="progress-bar" style={{ width: `${percentage}%` }} />
        </div>
        <p className="text-sm text-center mt-1">
          {progress?.weeklyMinutes || 0} / {weeklyGoal} {t('widgets.minutesThisWeek')}
        </p>
      </div>
    </div>
  );
}

// Favorites Widget
function FavoritesWidget() {
  const { t } = useTranslation();
  const { data: favorites = [] } = useQuery({
    queryKey: ['favorites'],
    queryFn: async () => {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/favorites`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];
      return res.json();
    },
  });

  return (
    <div className="widget">
      <div className="widget-header">
        <h3 className="widget-title">{t('widgets.favorites')}</h3>
      </div>
      <div className="widget-body">
        {favorites.length > 0 ? (
          <ul className="widget-list compact">
            {favorites.slice(0, 5).map((fav: any) => (
              <li key={fav.id}>
                <span className="fav-icon">⭐</span>
                <span>{fav.title}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="widget-empty-state">
            <span className="widget-empty-icon" aria-hidden="true">⭐</span>
            <p className="text-light text-sm">{t('widgets.noFavorites')}</p>
            <Link to="/my-music" className="btn btn-outline btn-sm mt-1">{t('nav.myMusic')}</Link>
          </div>
        )}
      </div>
    </div>
  );
}

// Announcements Widget
function AnnouncementsWidget() {
  const { t } = useTranslation();

  return (
    <div className="widget widget-announcements">
      <div className="widget-header">
        <h3 className="widget-title">{t('widgets.announcements')}</h3>
      </div>
      <div className="widget-body">
        <p className="text-light text-sm">{t('widgets.noAnnouncements')}</p>
      </div>
    </div>
  );
}

// Upcoming Rehearsals Widget
export function UpcomingRehearsalsWidget() {
  const { t } = useTranslation();
  const { data: rehearsals = [], isLoading } = useQuery<Rehearsal[]>({
    queryKey: ['upcoming-rehearsals'],
    queryFn: () => getUpcomingRehearsals(3),
  });

  return (
    <div className="widget">
      <div className="widget-header">
        <h3 className="widget-title">{t('widgets.upcomingRehearsals')}</h3>
        <Link to="/rehearsals" className="widget-link">
          {t('widgets.viewAll')}
        </Link>
      </div>
      <div className="widget-body">
        {isLoading ? (
          <p className="text-light text-sm">{t('common.loading')}</p>
        ) : rehearsals.length > 0 ? (
          <ul className="widget-list">
            {rehearsals.map((rehearsal) => (
              <li key={rehearsal.id} className="rehearsal-item">
                <div className="rehearsal-date">
                  {new Date(rehearsal.date).toLocaleDateString(undefined, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}
                </div>
                <div className="rehearsal-details">
                  {rehearsal.orchestra_name && (
                    <span className="rehearsal-orchestra">{rehearsal.orchestra_name}</span>
                  )}
                  {rehearsal.start_time && (
                    <span className="rehearsal-time">
                      {rehearsal.start_time}
                      {rehearsal.end_time ? ` – ${rehearsal.end_time}` : ''}
                    </span>
                  )}
                  {rehearsal.location && (
                    <span className="rehearsal-location">{rehearsal.location}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="widget-empty-state">
            <span className="widget-empty-icon" aria-hidden="true">
              <Icon name="calendar" size={32} />
            </span>
            <p className="text-light text-sm">{t('widgets.noUpcomingRehearsals')}</p>
            <Link to="/rehearsals" className="btn btn-outline btn-sm mt-1">{t('nav.rehearsals')}</Link>
          </div>
        )}
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
        <div className="widget-empty-state">
            <span className="widget-empty-icon" aria-hidden="true">
              <Icon name="clipboard" size={32} />
            </span>
            <p className="text-light text-sm">{t('widgets.noRecentActivity')}</p>
          </div>
      </div>
    </div>
  );
}

// Quick Actions Widget
export function QuickActionsWidget() {
  const { t } = useTranslation();

  const actions: { to: string; icon: IconName; label: string }[] = [
    { to: '/my-music', icon: 'music', label: t('nav.myMusic') },
    { to: '/rehearsals', icon: 'calendar', label: t('nav.rehearsals') },
    { to: '/tools', icon: 'wrench', label: t('nav.tools') },
    { to: '/issues', icon: 'warning', label: t('nav.issues') },
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
              <span className="quick-action-icon" aria-hidden="true">
                <Icon name={action.icon} size={24} />
              </span>
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
