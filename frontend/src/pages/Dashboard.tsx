import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getMyMusicLists } from '../api';
import type { MusicList } from '../types';
import MfaSettings from '../components/MfaSettings';

// Format duration from seconds to mm:ss or h:mm:ss
function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '-';
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Group lists by orchestra
interface OrchestraGroup {
  orchestraId: string;
  orchestraName: string;
  lists: MusicList[];
  totalTitles: number;
  totalDuration: number;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [orchestraGroups, setOrchestraGroups] = useState<OrchestraGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const listsData = await getMyMusicLists();

      // Group lists by orchestra
      const groupMap = new Map<string, OrchestraGroup>();
      for (const list of listsData) {
        const existing = groupMap.get(list.orchestraId);
        if (existing) {
          existing.lists.push(list);
          existing.totalTitles += list.titleCount || 0;
          existing.totalDuration += list.totalDuration || 0;
        } else {
          groupMap.set(list.orchestraId, {
            orchestraId: list.orchestraId,
            orchestraName: list.orchestraName || 'Onbekend orkest',
            lists: [list],
            totalTitles: list.titleCount || 0,
            totalDuration: list.totalDuration || 0,
          });
        }
      }

      setOrchestraGroups(Array.from(groupMap.values()));
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    );
  }

  // Calculate total titles across all orchestras
  const totalTitles = orchestraGroups.reduce((sum, g) => sum + g.totalTitles, 0);
  const totalLists = orchestraGroups.reduce((sum, g) => sum + g.lists.length, 0);

  return (
    <div>
      <h1 className="mb-3">Welkom, {user?.firstName}!</h1>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{user?.orchestras?.length || 0}</div>
          <div className="stat-label">Orkesten</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{user?.instruments?.length || 0}</div>
          <div className="stat-label">Instrumenten</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{totalLists}</div>
          <div className="stat-label">Muzieklijsten</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{totalTitles}</div>
          <div className="stat-label">Titels</div>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Mijn Instrumenten</h2>
          </div>
          <div className="card-body">
            {user?.instruments && user.instruments.length > 0 ? (
              <div className="tags">
                {user.instruments.map((instrument) => (
                  <span key={instrument.id} className="badge badge-primary">
                    {instrument.name}
                    {instrument.tuning && ` (${instrument.tuning})`}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-light">Geen instrumenten toegewezen.</p>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Mijn Orkesten</h2>
          </div>
          <div className="card-body">
            {user?.orchestras && user.orchestras.length > 0 ? (
              <div className="tags">
                {user.orchestras.map((orchestra) => (
                  <span key={orchestra.id} className="badge badge-success">
                    {orchestra.name}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-light">Niet lid van een orkest.</p>
            )}
          </div>
        </div>
      </div>

      {orchestraGroups.length > 0 ? (
        orchestraGroups.map((group) => (
          <div key={group.orchestraId} className="card mt-2">
            <div className="card-header">
              <h2 className="card-title">{group.orchestraName}</h2>
              <div className="text-light">
                {group.totalTitles} titels • {formatDuration(group.totalDuration)}
              </div>
            </div>
            <div className="card-body">
              <div className="grid grid-3">
                {group.lists.map((list) => (
                  <Link
                    key={list.id}
                    to={`/my-music?listId=${list.id}`}
                    className="piece-card"
                    style={{ textDecoration: 'none', color: 'inherit' }}
                  >
                    <div className="piece-title">{list.name}</div>
                    <div className="piece-meta">
                      {list.titleCount || 0} titels • {formatDuration(list.totalDuration || 0)}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        ))
      ) : (
        <div className="card mt-2">
          <div className="card-header">
            <h2 className="card-title">Mijn Muzieklijsten</h2>
            <Link to="/my-music" className="btn btn-primary btn-sm">
              Bekijk alle muziek
            </Link>
          </div>
          <div className="card-body">
            <div className="empty-state">
              <div className="empty-icon">📋</div>
              <p>Je bent nog niet toegevoegd aan muzieklijsten.</p>
            </div>
          </div>
        </div>
      )}

      <div className="mt-3">
        <h2 className="mb-2">Accountbeveiliging</h2>
        <MfaSettings />
      </div>
    </div>
  );
}
