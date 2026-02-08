import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { getMyMusicLists } from '../api';
import type { MusicList } from '../types';
import MfaSettings from '../components/MfaSettings';
import BackupSettings from '../components/BackupSettings';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { formatDuration } from '../utils/format';
import { ROLES } from '../utils/constants';
import { Skeleton, SkeletonCard } from '../components/Skeleton';

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
  const { t } = useTranslation();
  useDocumentTitle('pageTitle.dashboard');
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
            orchestraName: list.orchestraName || t('dashboard.unknownOrchestra'),
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
      <div>
        <h1 className="mb-3"><Skeleton width="300px" height="2rem" /></h1>
        <div className="stats-grid">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="stat-card">
              <Skeleton width="3rem" height="2rem" style={{ marginBottom: '0.5rem' }} />
              <Skeleton width="80%" height="1rem" />
            </div>
          ))}
        </div>
        <div className="grid grid-2 mt-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    );
  }

  // Calculate total titles across all orchestras
  const totalTitles = orchestraGroups.reduce((sum, g) => sum + g.totalTitles, 0);
  const totalLists = orchestraGroups.reduce((sum, g) => sum + g.lists.length, 0);

  return (
    <div>
      <h1 className="mb-3">{t('dashboard.welcome')}, {user?.firstName}!</h1>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{user?.orchestras?.length || 0}</div>
          <div className="stat-label">{t('dashboard.orchestras')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{user?.instruments?.length || 0}</div>
          <div className="stat-label">{t('dashboard.instruments')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{totalLists}</div>
          <div className="stat-label">{t('dashboard.musicLists')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{totalTitles}</div>
          <div className="stat-label">{t('dashboard.titles')}</div>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">{t('dashboard.myInstruments')}</h2>
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
              <p className="text-light">{t('dashboard.noInstruments')}</p>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">{t('dashboard.myOrchestras')}</h2>
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
              <p className="text-light">{t('dashboard.notInOrchestra')}</p>
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
                {group.totalTitles} {t('dashboard.titles').toLowerCase()} • {formatDuration(group.totalDuration)}
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
                      {list.titleCount || 0} {t('dashboard.titles').toLowerCase()} • {formatDuration(list.totalDuration || 0)}
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
            <h2 className="card-title">{t('dashboard.myMusicLists')}</h2>
            <Link to="/my-music" className="btn btn-primary btn-sm">
              {t('dashboard.viewAllMusic')}
            </Link>
          </div>
          <div className="card-body">
            <div className="empty-state">
              <div className="empty-icon">📋</div>
              <p>{t('dashboard.notAddedToLists')}</p>
            </div>
          </div>
        </div>
      )}

      <div className="mt-3">
        <h2 className="mb-2">{t('dashboard.accountSecurity')}</h2>
        <MfaSettings />
      </div>

      {user?.role === ROLES.ADMIN && (
        <div className="mt-3">
          <h2 className="mb-2">{t('dashboard.administration')}</h2>
          <BackupSettings />
        </div>
      )}
    </div>
  );
}
