import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getMyMusicLists, getMyMusicPieces } from '../api';
import type { MusicList, MusicPiece } from '../types';

export default function Dashboard() {
  const { user } = useAuth();
  const [lists, setLists] = useState<MusicList[]>([]);
  const [recentPieces, setRecentPieces] = useState<MusicPiece[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [listsData, piecesData] = await Promise.all([
        getMyMusicLists(),
        getMyMusicPieces(),
      ]);
      setLists(listsData);
      setRecentPieces(piecesData.slice(0, 6));
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
          <div className="stat-value">{lists.length}</div>
          <div className="stat-label">Muzieklijsten</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{recentPieces.length}</div>
          <div className="stat-label">Beschikbare stukken</div>
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

      <div className="card mt-2">
        <div className="card-header">
          <h2 className="card-title">Mijn Muzieklijsten</h2>
          <Link to="/my-music" className="btn btn-primary btn-sm">
            Bekijk alle muziek
          </Link>
        </div>
        <div className="card-body">
          {lists.length > 0 ? (
            <div className="grid grid-3">
              {lists.map((list) => (
                <Link
                  key={list.id}
                  to={`/my-music?listId=${list.id}`}
                  className="piece-card"
                  style={{ textDecoration: 'none', color: 'inherit' }}
                >
                  <div className="piece-title">{list.name}</div>
                  <div className="piece-meta">
                    {list.orchestraName} • {list.pieceCount || 0} stukken
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-icon">📋</div>
              <p>Je bent nog niet toegevoegd aan muzieklijsten.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
