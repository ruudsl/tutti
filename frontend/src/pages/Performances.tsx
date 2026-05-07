import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Icon } from '../components/Icon';
import {
  getLastPlayedPieces,
  getNeverPlayedPieces,
  getMostPlayedPieces,
  getPerformancesByYear,
  getPerformancesByComposer,
  searchPerformances,
} from '../api/performances';
import { SkeletonTable } from '../components/Skeleton';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { formatDate } from '../utils/dateFormat';

type TabType = 'lastPlayed' | 'neverPlayed' | 'mostPlayed' | 'byYear' | 'byComposer';

export default function Performances() {
  const { t } = useTranslation();
  useDocumentTitle('pageTitle.performances');

  const [activeTab, setActiveTab] = useState<TabType>('lastPlayed');
  const [searchTerm, setSearchTerm] = useState('');

  const { data: lastPlayed = [], isLoading: loadingLastPlayed } = useQuery({
    queryKey: ['performances-last-played'],
    queryFn: getLastPlayedPieces,
    enabled: activeTab === 'lastPlayed',
  });

  const { data: neverPlayed = [], isLoading: loadingNeverPlayed } = useQuery({
    queryKey: ['performances-never-played'],
    queryFn: getNeverPlayedPieces,
    enabled: activeTab === 'neverPlayed',
  });

  const { data: mostPlayed = [], isLoading: loadingMostPlayed } = useQuery({
    queryKey: ['performances-most-played'],
    queryFn: () => getMostPlayedPieces(50),
    enabled: activeTab === 'mostPlayed',
  });

  const { data: byYear = [], isLoading: loadingByYear } = useQuery({
    queryKey: ['performances-by-year'],
    queryFn: getPerformancesByYear,
    enabled: activeTab === 'byYear',
  });

  const { data: byComposer = [], isLoading: loadingByComposer } = useQuery({
    queryKey: ['performances-by-composer'],
    queryFn: () => getPerformancesByComposer(50),
    enabled: activeTab === 'byComposer',
  });

  const { data: searchResults = [] } = useQuery({
    queryKey: ['performances-search', searchTerm],
    queryFn: () => searchPerformances(searchTerm),
    enabled: searchTerm.length >= 2,
  });

  const tabs: { id: TabType; label: string; icon: string }[] = [
    { id: 'lastPlayed', label: 'performances.lastPlayed', icon: 'clock' },
    { id: 'neverPlayed', label: 'performances.neverPlayed', icon: 'music' },
    { id: 'mostPlayed', label: 'performances.mostPlayed', icon: 'award' },
    { id: 'byYear', label: 'performances.byYear', icon: 'calendar' },
    { id: 'byComposer', label: 'performances.byComposer', icon: 'user' },
  ];

  const isLoading =
    (activeTab === 'lastPlayed' && loadingLastPlayed) ||
    (activeTab === 'neverPlayed' && loadingNeverPlayed) ||
    (activeTab === 'mostPlayed' && loadingMostPlayed) ||
    (activeTab === 'byYear' && loadingByYear) ||
    (activeTab === 'byComposer' && loadingByComposer);

  return (
    <div className="page-container">
      <div className="page-header mb-4">
        <h1>{t('performances.title')}</h1>
        <p className="text-base-content/60">{t('performances.description')}</p>
      </div>

      {/* Search */}
      <div className="form-control mb-4">
        <div className="input-group">
          <input
            type="text"
            className="input input-bordered flex-1"
            placeholder={t('performances.searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button className="btn btn-ghost" onClick={() => setSearchTerm('')}>
              <Icon name="close" className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Search Results */}
      {searchTerm.length >= 2 && (
        <div className="card bg-base-100 shadow-sm mb-4">
          <div className="card-body">
            <h3 className="font-semibold mb-2">{t('performances.searchResults')}</h3>
            {searchResults.length === 0 ? (
              <p className="text-base-content/60">{t('performances.noResults')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="table table-sm">
                  <thead>
                    <tr>
                      <th>{t('performances.piece')}</th>
                      <th>{t('performances.composer')}</th>
                      <th>{t('performances.concert')}</th>
                      <th>{t('performances.date')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {searchResults.map((result, idx) => (
                      <tr key={idx}>
                        <td>{result.title}</td>
                        <td>{result.composer || '-'}</td>
                        <td>{result.concertName}</td>
                        <td>{formatDate(result.concertDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="tabs tabs-boxed mb-4">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`tab gap-2 ${activeTab === tab.id ? 'tab-active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <Icon name={tab.icon as any} className="w-4 h-4" />
            {t(tab.label)}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="card bg-base-100 shadow-sm">
        <div className="card-body">
          {isLoading ? (
            <SkeletonTable rows={10} columns={4} />
          ) : (
            <>
              {/* Last Played */}
              {activeTab === 'lastPlayed' && (
                <div className="overflow-x-auto">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>{t('performances.piece')}</th>
                        <th>{t('performances.composer')}</th>
                        <th>{t('performances.lastPlayedDate')}</th>
                        <th>{t('performances.timesPlayed')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lastPlayed.map((piece, idx) => (
                        <tr key={idx}>
                          <td className="font-medium">{piece.title}</td>
                          <td>{piece.composer || '-'}</td>
                          <td>{formatDate(piece.lastPlayed)}</td>
                          <td>
                            <span className="badge badge-primary badge-sm">{piece.timesPlayed}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {lastPlayed.length === 0 && (
                    <p className="text-center py-8 text-base-content/60">{t('performances.noData')}</p>
                  )}
                </div>
              )}

              {/* Never Played */}
              {activeTab === 'neverPlayed' && (
                <div className="overflow-x-auto">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>{t('performances.piece')}</th>
                        <th>{t('performances.composer')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {neverPlayed.map((piece) => (
                        <tr key={piece.id}>
                          <td className="font-medium">{piece.title}</td>
                          <td>{piece.composer || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {neverPlayed.length === 0 && (
                    <p className="text-center py-8 text-base-content/60">{t('performances.allPiecesPlayed')}</p>
                  )}
                </div>
              )}

              {/* Most Played */}
              {activeTab === 'mostPlayed' && (
                <div className="overflow-x-auto">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>{t('performances.piece')}</th>
                        <th>{t('performances.composer')}</th>
                        <th>{t('performances.timesPlayed')}</th>
                        <th>{t('performances.firstPlayed')}</th>
                        <th>{t('performances.lastPlayedDate')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mostPlayed.map((piece, idx) => (
                        <tr key={idx}>
                          <td>{idx + 1}</td>
                          <td className="font-medium">{piece.title}</td>
                          <td>{piece.composer || '-'}</td>
                          <td>
                            <span className="badge badge-primary">{piece.timesPlayed}</span>
                          </td>
                          <td>{formatDate(piece.firstPlayed)}</td>
                          <td>{formatDate(piece.lastPlayed)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {mostPlayed.length === 0 && (
                    <p className="text-center py-8 text-base-content/60">{t('performances.noData')}</p>
                  )}
                </div>
              )}

              {/* By Year */}
              {activeTab === 'byYear' && (
                <div className="overflow-x-auto">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>{t('performances.year')}</th>
                        <th>{t('performances.concertCount')}</th>
                        <th>{t('performances.pieceCount')}</th>
                        <th>{t('performances.uniquePieces')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byYear.map((stats) => (
                        <tr key={stats.year}>
                          <td className="font-medium">{stats.year}</td>
                          <td>{stats.concertCount}</td>
                          <td>{stats.pieceCount}</td>
                          <td>{stats.uniquePieces}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {byYear.length === 0 && (
                    <p className="text-center py-8 text-base-content/60">{t('performances.noData')}</p>
                  )}
                </div>
              )}

              {/* By Composer */}
              {activeTab === 'byComposer' && (
                <div className="overflow-x-auto">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>{t('performances.composer')}</th>
                        <th>{t('performances.timesPlayed')}</th>
                        <th>{t('performances.uniquePieces')}</th>
                        <th>{t('performances.lastPlayedDate')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byComposer.map((stats, idx) => (
                        <tr key={stats.composer}>
                          <td>{idx + 1}</td>
                          <td className="font-medium">{stats.composer}</td>
                          <td>
                            <span className="badge badge-primary">{stats.timesPlayed}</span>
                          </td>
                          <td>{stats.uniquePieces}</td>
                          <td>{formatDate(stats.lastPlayed)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {byComposer.length === 0 && (
                    <p className="text-center py-8 text-base-content/60">{t('performances.noData')}</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
