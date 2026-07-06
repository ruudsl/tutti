import { currentLocale } from '../utils/locale';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { SkeletonTable } from '../components/Skeleton';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

interface ActivityStats {
  topPieces: { id: string; title: string; arranger: string | null; count: number }[];
  recentActivity: { date: string; downloads: number; views: number }[];
  userActivity: { id: string; name: string; downloads: number; views: number }[];
  totals: {
    total_activities: number;
    active_users: number;
    total_downloads: number;
    total_views: number;
  };
  period: number;
}

interface ActivityFeedItem {
  id: string;
  action_type: string;
  entity_type: string;
  entity_id: string;
  created_at: string;
  user_name: string;
  entity_name: string | null;
}

/** Lightweight vertical bar chart for activity per day */
function ActivityBarChart({
  data,
  t,
}: {
  data: { date: string; downloads: number; views: number }[];
  t: (key: string) => string;
}) {
  const maxVal = Math.max(...data.map((d) => d.downloads + d.views), 1);
  const chartHeight = 180;

  const formatShortDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getDate()}/${d.getMonth() + 1}`;
  };

  return (
    <div role="img" aria-label={t('statistics.activityPerDay')}>
      {/* Legend */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem', fontSize: '0.75rem' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <span
            style={{ width: 12, height: 12, borderRadius: 2, background: 'var(--primary)', display: 'inline-block' }}
          />
          {t('statistics.downloads')}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <span
            style={{
              width: 12,
              height: 12,
              borderRadius: 2,
              background: 'var(--info, #17a2b8)',
              display: 'inline-block',
            }}
          />
          {t('statistics.views')}
        </span>
      </div>

      {/* Chart area */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 2,
          height: chartHeight,
          borderBottom: '1px solid var(--border)',
          paddingBottom: 0,
        }}
      >
        {data.map((day) => {
          const dlHeight = (day.downloads / maxVal) * (chartHeight - 20);
          const vwHeight = (day.views / maxVal) * (chartHeight - 20);
          const total = day.downloads + day.views;
          return (
            <div
              key={day.date}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                minWidth: 0,
              }}
              title={`${formatShortDate(day.date)}: ${day.downloads} ${t('statistics.downloads').toLowerCase()}, ${day.views} ${t('statistics.views').toLowerCase()}`}
            >
              {total > 0 && (
                <span style={{ fontSize: '0.6rem', color: 'var(--text-light)', marginBottom: 2 }}>{total}</span>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', width: '80%', maxWidth: 28 }}>
                <div
                  style={{
                    height: vwHeight,
                    background: 'var(--info, #17a2b8)',
                    borderRadius: '2px 2px 0 0',
                    minHeight: day.views > 0 ? 2 : 0,
                  }}
                />
                <div
                  style={{
                    height: dlHeight,
                    background: 'var(--primary)',
                    borderRadius: day.views > 0 ? 0 : '2px 2px 0 0',
                    minHeight: day.downloads > 0 ? 2 : 0,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* X-axis labels */}
      <div style={{ display: 'flex', gap: 2, marginTop: 4 }}>
        {data.map((day, i) => (
          <div
            key={day.date}
            style={{
              flex: 1,
              textAlign: 'center',
              fontSize: '0.6rem',
              color: 'var(--text-light)',
              minWidth: 0,
              overflow: 'hidden',
            }}
          >
            {/* Show label every few bars depending on count */}
            {data.length <= 14 || i % Math.ceil(data.length / 10) === 0 ? formatShortDate(day.date) : ''}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Horizontal bar chart for ranking data */
function HorizontalBarChart({
  items,
  color,
}: {
  items: { label: string; sublabel?: string; value: number }[];
  color: string;
}) {
  const maxVal = Math.max(...items.map((i) => i.value), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {items.map((item, index) => (
        <div key={index}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: 2 }}>
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <strong style={{ marginRight: '0.35rem', color: 'var(--text-light)' }}>{index + 1}.</strong>
              {item.label}
              {item.sublabel && (
                <span style={{ color: 'var(--text-light)', fontSize: '0.7rem', marginLeft: '0.35rem' }}>
                  {item.sublabel}
                </span>
              )}
            </span>
            <strong style={{ flexShrink: 0, marginLeft: '0.5rem' }}>{item.value}</strong>
          </div>
          <div
            style={{
              height: 6,
              background: 'var(--border)',
              borderRadius: 3,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${(item.value / maxVal) * 100}%`,
                background: color,
                borderRadius: 3,
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Stacked horizontal bar for user activity (downloads + views) */
function UserActivityChart({
  users,
  t,
}: {
  users: { id: string; name: string; downloads: number; views: number }[];
  t: (key: string) => string;
}) {
  const maxVal = Math.max(...users.map((u) => u.downloads + u.views), 1);

  return (
    <div>
      {/* Legend */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem', fontSize: '0.75rem' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <span
            style={{ width: 12, height: 12, borderRadius: 2, background: 'var(--primary)', display: 'inline-block' }}
          />
          {t('statistics.downloads')}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <span
            style={{
              width: 12,
              height: 12,
              borderRadius: 2,
              background: 'var(--info, #17a2b8)',
              display: 'inline-block',
            }}
          />
          {t('statistics.views')}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {users.map((user) => {
          const total = user.downloads + user.views;
          return (
            <div key={user.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: 2 }}>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user.name}
                </span>
                <span style={{ flexShrink: 0, marginLeft: '0.5rem', fontSize: '0.75rem', color: 'var(--text-light)' }}>
                  {user.downloads}+{user.views} = <strong style={{ color: 'var(--text)' }}>{total}</strong>
                </span>
              </div>
              <div
                style={{
                  height: 6,
                  background: 'var(--border)',
                  borderRadius: 3,
                  overflow: 'hidden',
                  display: 'flex',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${(user.downloads / maxVal) * 100}%`,
                    background: 'var(--primary)',
                    transition: 'width 0.3s ease',
                  }}
                  title={`${user.downloads} ${t('statistics.downloads').toLowerCase()}`}
                />
                <div
                  style={{
                    height: '100%',
                    width: `${(user.views / maxVal) * 100}%`,
                    background: 'var(--info, #17a2b8)',
                    transition: 'width 0.3s ease',
                  }}
                  title={`${user.views} ${t('statistics.views').toLowerCase()}`}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Statistics() {
  const { t } = useTranslation();
  useDocumentTitle('pageTitle.statistics');
  const [period, setPeriod] = useState<string>('30');

  // Fetch statistics
  const { data: stats, isLoading: statsLoading } = useQuery<ActivityStats>({
    queryKey: ['activity-stats', period],
    queryFn: async () => {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/activity/stats?period=${period}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.json();
    },
  });

  // Fetch activity feed
  const { data: feed = [], isLoading: feedLoading } = useQuery<ActivityFeedItem[]>({
    queryKey: ['activity-feed'],
    queryFn: async () => {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/activity/feed?limit=20`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.json();
    },
  });

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(currentLocale(), {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (statsLoading || feedLoading) {
    return (
      <div>
        <h1>{t('statistics.title')}</h1>
        <SkeletonTable rows={5} columns={4} />
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <h1>{t('statistics.title')}</h1>
        <label>
          <span className="sr-only">{t('statistics.period')}</span>
          <select
            className="form-control form-select"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            style={{ maxWidth: '200px' }}
            aria-label={t('statistics.period')}
          >
            <option value="7">{t('statistics.last7Days')}</option>
            <option value="30">{t('statistics.last30Days')}</option>
            <option value="90">{t('statistics.last90Days')}</option>
            <option value="365">{t('statistics.lastYear')}</option>
          </select>
        </label>
      </div>

      {/* Summary Cards */}
      {stats?.totals && (
        <div className="stat-card-grid">
          <div className="card">
            <div className="card-body stat-inline">
              <div className="stat-number" style={{ color: 'var(--primary)' }}>
                {stats.totals.total_downloads}
              </div>
              <div className="stat-label">{t('statistics.downloads')}</div>
            </div>
          </div>
          <div className="card">
            <div className="card-body stat-inline">
              <div className="stat-number" style={{ color: 'var(--info)' }}>
                {stats.totals.total_views}
              </div>
              <div className="stat-label">{t('statistics.views')}</div>
            </div>
          </div>
          <div className="card">
            <div className="card-body stat-inline">
              <div className="stat-number" style={{ color: 'var(--success)' }}>
                {stats.totals.active_users}
              </div>
              <div className="stat-label">{t('statistics.activeMembers')}</div>
            </div>
          </div>
          <div className="card">
            <div className="card-body stat-inline">
              <div className="stat-number">{stats.totals.total_activities}</div>
              <div className="stat-label">{t('statistics.totalActions')}</div>
            </div>
          </div>
        </div>
      )}

      {/* Activity Bar Chart - Full Width */}
      {stats?.recentActivity && stats.recentActivity.length > 0 && (
        <div className="card mb-3">
          <div className="card-body">
            <h4 style={{ marginBottom: '1rem' }}>{t('statistics.activityPerDay')}</h4>
            <ActivityBarChart data={stats.recentActivity} t={t} />
          </div>
        </div>
      )}

      <div className="grid grid-2 gap-3">
        {/* Top 10 Most Played - Bar Chart */}
        <div className="card">
          <div className="card-body">
            <h4 style={{ marginBottom: '1rem' }}>{t('statistics.topPieces')}</h4>
            {stats?.topPieces && stats.topPieces.length > 0 ? (
              <HorizontalBarChart
                items={stats.topPieces.map((p) => ({
                  label: p.title,
                  sublabel: p.arranger || undefined,
                  value: p.count,
                }))}
                color="var(--primary)"
              />
            ) : (
              <p style={{ color: 'var(--text-light)', textAlign: 'center' }}>{t('statistics.noActivity')}</p>
            )}
          </div>
        </div>

        {/* Top Users - Stacked Bar Chart */}
        <div className="card">
          <div className="card-body">
            <h4 style={{ marginBottom: '1rem' }}>{t('statistics.mostActiveMembers')}</h4>
            {stats?.userActivity && stats.userActivity.length > 0 ? (
              <UserActivityChart users={stats.userActivity} t={t} />
            ) : (
              <p style={{ color: 'var(--text-light)', textAlign: 'center' }}>{t('statistics.noActivity')}</p>
            )}
          </div>
        </div>

        {/* Recent Activity Feed */}
        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <div className="card-body">
            <h4 style={{ marginBottom: '1rem' }}>{t('statistics.recentActivity')}</h4>
            {feed.length > 0 ? (
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                {feed.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      padding: '0.5rem 0',
                      borderBottom: '1px solid var(--border)',
                      fontSize: '0.875rem',
                    }}
                  >
                    <div>
                      <strong>{item.user_name}</strong>
                      <span style={{ color: 'var(--text-light)', marginLeft: '0.5rem' }}>
                        {t(`statistics.actions.${item.action_type}`, item.action_type)}
                      </span>
                    </div>
                    {item.entity_name && <div style={{ color: 'var(--text-light)' }}>{item.entity_name}</div>}
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>
                      {formatDateTime(item.created_at)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: 'var(--text-light)', textAlign: 'center' }}>{t('statistics.noActivity')}</p>
            )}
          </div>
        </div>
      </div>

      <div className="card mt-3">
        <div className="card-body">
          <p style={{ fontSize: '0.875rem', color: 'var(--text-light)', marginBottom: 0 }}>
            <strong>{t('statistics.conductorTip')}</strong> {t('statistics.conductorTipText')}
          </p>
        </div>
      </div>
    </div>
  );
}
