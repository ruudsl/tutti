import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SkeletonTable } from '../components/Skeleton';

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

const ACTION_LABELS: Record<string, string> = {
  view: 'Bekeken',
  download: 'Gedownload',
  play_audio: 'Audio afgespeeld',
};

export default function Statistics() {
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
        <h1>Statistieken</h1>
        <SkeletonTable rows={5} columns={4} />
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <h1>Statistieken</h1>
        <select
          className="form-control form-select"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          style={{ maxWidth: '200px' }}
        >
          <option value="7">Laatste 7 dagen</option>
          <option value="30">Laatste 30 dagen</option>
          <option value="90">Laatste 90 dagen</option>
          <option value="365">Laatste jaar</option>
        </select>
      </div>

      {/* Summary Cards */}
      {stats?.totals && (
        <div className="grid grid-4 mb-3" style={{ gap: '1rem' }}>
          <div className="card">
            <div className="card-body" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--primary)' }}>
                {stats.totals.total_downloads}
              </div>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-light)' }}>Downloads</div>
            </div>
          </div>
          <div className="card">
            <div className="card-body" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--info)' }}>
                {stats.totals.total_views}
              </div>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-light)' }}>Weergaven</div>
            </div>
          </div>
          <div className="card">
            <div className="card-body" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--success)' }}>
                {stats.totals.active_users}
              </div>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-light)' }}>Actieve leden</div>
            </div>
          </div>
          <div className="card">
            <div className="card-body" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>
                {stats.totals.total_activities}
              </div>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-light)' }}>Totaal acties</div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-2" style={{ gap: '1.5rem' }}>
        {/* Top 10 Most Played */}
        <div className="card">
          <div className="card-body">
            <h4 style={{ marginBottom: '1rem' }}>Top 10 meest bekeken stukken</h4>
            {stats?.topPieces && stats.topPieces.length > 0 ? (
              <table className="table mb-0">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Titel</th>
                    <th style={{ textAlign: 'right' }}>Aantal</th>
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
                Nog geen activiteit geregistreerd
              </p>
            )}
          </div>
        </div>

        {/* Top Users */}
        <div className="card">
          <div className="card-body">
            <h4 style={{ marginBottom: '1rem' }}>Meest actieve leden</h4>
            {stats?.userActivity && stats.userActivity.length > 0 ? (
              <table className="table mb-0">
                <thead>
                  <tr>
                    <th>Lid</th>
                    <th style={{ textAlign: 'right' }}>Downloads</th>
                    <th style={{ textAlign: 'right' }}>Weergaven</th>
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
                Nog geen activiteit geregistreerd
              </p>
            )}
          </div>
        </div>

        {/* Recent Activity Chart (simplified as table) */}
        <div className="card">
          <div className="card-body">
            <h4 style={{ marginBottom: '1rem' }}>Activiteit per dag</h4>
            {stats?.recentActivity && stats.recentActivity.length > 0 ? (
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                <table className="table mb-0">
                  <thead>
                    <tr>
                      <th>Datum</th>
                      <th style={{ textAlign: 'right' }}>Downloads</th>
                      <th style={{ textAlign: 'right' }}>Weergaven</th>
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
                Nog geen activiteit geregistreerd
              </p>
            )}
          </div>
        </div>

        {/* Recent Activity Feed */}
        <div className="card">
          <div className="card-body">
            <h4 style={{ marginBottom: '1rem' }}>Recente activiteit</h4>
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
                        {ACTION_LABELS[item.action_type] || item.action_type}
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
                Nog geen activiteit geregistreerd
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="card mt-3">
        <div className="card-body">
          <p style={{ fontSize: '0.875rem', color: 'var(--text-light)', marginBottom: 0 }}>
            <strong>Tip voor de dirigent:</strong> Gebruik deze statistieken om te zien welke stukken
            thuis veel worden bekeken of gedownload. Stukken die weinig bekeken worden, worden
            mogelijk niet geoefend. Overweeg deze stukken extra aandacht te geven tijdens repetities.
          </p>
        </div>
      </div>
    </div>
  );
}
