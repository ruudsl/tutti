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

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('nl-NL', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('nl-NL', {
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
        <select
          className="form-control form-select"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          style={{ maxWidth: '200px' }}
        >
          <option value="7">{t('statistics.last7Days')}</option>
          <option value="30">{t('statistics.last30Days')}</option>
          <option value="90">{t('statistics.last90Days')}</option>
          <option value="365">{t('statistics.lastYear')}</option>
        </select>
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
              <div className="stat-number">
                {stats.totals.total_activities}
              </div>
              <div className="stat-label">{t('statistics.totalActions')}</div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-2 gap-3">
        {/* Top 10 Most Played */}
        <div className="card">
          <div className="card-body">
            <h4 style={{ marginBottom: '1rem' }}>{t('statistics.topPieces')}</h4>
            {stats?.topPieces && stats.topPieces.length > 0 ? (
              <table className="table mb-0">
                <thead>
                  <tr>
                    <th>{t('statistics.table.rank')}</th>
                    <th>{t('statistics.table.title')}</th>
                    <th style={{ textAlign: 'right' }}>{t('statistics.table.count')}</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.topPieces.map((piece, index) => (
                    <tr key={piece.id}>
                      <td style={{ width: '40px', fontWeight: 'bold' }}>{index + 1}</td>
                      <td>
                        <div>{piece.title}</div>
                        {piece.arranger && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>
                            {piece.arranger}
                          </div>
                        )}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 'bold' }}>{piece.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p style={{ color: 'var(--text-light)', textAlign: 'center' }}>
                {t('statistics.noActivity')}
              </p>
            )}
          </div>
        </div>

        {/* Top Users */}
        <div className="card">
          <div className="card-body">
            <h4 style={{ marginBottom: '1rem' }}>{t('statistics.mostActiveMembers')}</h4>
            {stats?.userActivity && stats.userActivity.length > 0 ? (
              <table className="table mb-0">
                <thead>
                  <tr>
                    <th>{t('statistics.table.member')}</th>
                    <th style={{ textAlign: 'right' }}>{t('statistics.downloads')}</th>
                    <th style={{ textAlign: 'right' }}>{t('statistics.views')}</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.userActivity.map((user) => (
                    <tr key={user.id}>
                      <td>{user.name}</td>
                      <td style={{ textAlign: 'right' }}>{user.downloads}</td>
                      <td style={{ textAlign: 'right' }}>{user.views}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p style={{ color: 'var(--text-light)', textAlign: 'center' }}>
                {t('statistics.noActivity')}
              </p>
            )}
          </div>
        </div>

        {/* Recent Activity Chart (simplified as table) */}
        <div className="card">
          <div className="card-body">
            <h4 style={{ marginBottom: '1rem' }}>{t('statistics.activityPerDay')}</h4>
            {stats?.recentActivity && stats.recentActivity.length > 0 ? (
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                <table className="table mb-0">
                  <thead>
                    <tr>
                      <th>{t('statistics.table.date')}</th>
                      <th style={{ textAlign: 'right' }}>{t('statistics.downloads')}</th>
                      <th style={{ textAlign: 'right' }}>{t('statistics.views')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.recentActivity.map((day) => (
                      <tr key={day.date}>
                        <td>{formatDate(day.date)}</td>
                        <td style={{ textAlign: 'right' }}>{day.downloads}</td>
                        <td style={{ textAlign: 'right' }}>{day.views}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p style={{ color: 'var(--text-light)', textAlign: 'center' }}>
                {t('statistics.noActivity')}
              </p>
            )}
          </div>
        </div>

        {/* Recent Activity Feed */}
        <div className="card">
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
                    {item.entity_name && (
                      <div style={{ color: 'var(--text-light)' }}>{item.entity_name}</div>
                    )}
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>
                      {formatDateTime(item.created_at)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: 'var(--text-light)', textAlign: 'center' }}>
                {t('statistics.noActivity')}
              </p>
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
