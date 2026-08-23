import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  getMyMusicLists,
  getMusicList,
  downloadMusicPiece,
  downloadMusicListZip,
  getMusicPieceBlob,
  logActivity,
} from '../api';
import { showSuccess, showError } from '../utils/toast';
import type { MusicList, MusicPiece } from '../types';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Modal } from '../components/Modal';
import { SwipeContainer } from '../components/SwipeContainer';
import { SwipeableMusicList, MusicCard, type MusicItem } from '../components/SwipeableMusicList';
import { ReportIssueModal } from '../components/ReportIssueModal';
import { PdfViewer } from '../components/PdfViewer';
import { cacheListPdfs, isPdfCached, getCachedPdf } from '../lib/pdfCache';
import { Icon } from '../components/Icon';

interface TitleGroup {
  title: string;
  arranger: string | null;
  youtubeUrl: string | null;
  pieces: MusicPiece[];
}

interface OrchestraGroup {
  orchestraId: string;
  orchestraName: string;
  lists: MusicList[];
}

export default function MyMusic() {
  const { t } = useTranslation();
  useDocumentTitle('pageTitle.myMusic');
  const [searchParams, setSearchParams] = useSearchParams();
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [expandedTitles, setExpandedTitles] = useState<Set<string>>(new Set());
  const [currentTitleIndex, setCurrentTitleIndex] = useState(0);
  const [cachingList, setCachingList] = useState(false);
  const [cacheProgress, setCacheProgress] = useState({ cached: 0, total: 0 });
  const [cachedPieces, setCachedPieces] = useState<Set<string>>(new Set());

  // PDF viewer state
  const [viewingPiece, setViewingPiece] = useState<MusicPiece | null>(null);
  const [viewerBlobUrl, setViewerBlobUrl] = useState<string | null>(null);
  const [viewerLoading, setViewerLoading] = useState(false);
  const viewerBlobUrlRef = useRef<string | null>(null);

  // Issue reporting state - using ReportIssueModal component
  const [reportingPiece, setReportingPiece] = useState<MusicPiece | null>(null);

  // View mode: 'full' | 'compact' - compact hides arranger/groupNumber/clef/tuning columns
  const [compactView, setCompactView] = useState(() => {
    return localStorage.getItem('myMusic-compactView') === 'true';
  });
  const toggleCompactView = () => {
    setCompactView((prev) => {
      const next = !prev;
      localStorage.setItem('myMusic-compactView', String(next));
      return next;
    });
  };

  // Mobile swipe view mode
  const [swipeViewEnabled, setSwipeViewEnabled] = useState(() => {
    // Default to enabled on mobile devices
    return window.innerWidth < 768;
  });

  const listId = searchParams.get('listId');

  // Fetch all music lists with React Query (cached)
  const { data: lists = [], isLoading: listsLoading } = useQuery({
    queryKey: ['myMusicLists'],
    queryFn: getMyMusicLists,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch selected list details with React Query (cached)
  const { data: selectedList, isLoading: listLoading } = useQuery({
    queryKey: ['musicList', listId],
    queryFn: async () => {
      const data = await getMusicList(listId!);
      // Log activity for statistics
      logActivity('view', 'music_list', listId!).catch(() => {});
      return data;
    },
    enabled: !!listId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Reset expanded titles when list changes
  useEffect(() => {
    setExpandedTitles(new Set());
    setCurrentTitleIndex(0);
  }, [listId]);

  const isLoading = listId ? listLoading : listsLoading;

  // Group lists by orchestra
  const orchestraGroups = useMemo((): OrchestraGroup[] => {
    const groups = new Map<string, OrchestraGroup>();
    for (const list of lists) {
      const key = list.orchestraId;
      if (!groups.has(key)) {
        groups.set(key, {
          orchestraId: key,
          orchestraName: list.orchestraName || key,
          lists: [],
        });
      }
      groups.get(key)!.lists.push(list);
    }
    return Array.from(groups.values());
  }, [lists]);

  // Group pieces by title
  const titleGroups = useMemo((): TitleGroup[] => {
    if (!selectedList?.pieces) return [];

    const groups = new Map<string, TitleGroup>();

    for (const piece of selectedList.pieces) {
      const key = `${piece.title}|||${piece.arranger || ''}`;
      if (!groups.has(key)) {
        groups.set(key, {
          title: piece.title,
          arranger: piece.arranger,
          youtubeUrl: piece.youtubeUrl,
          pieces: [],
        });
      }
      groups.get(key)!.pieces.push(piece);
      // Use YouTube URL from any piece that has one
      if (piece.youtubeUrl && !groups.get(key)!.youtubeUrl) {
        groups.get(key)!.youtubeUrl = piece.youtubeUrl;
      }
    }

    return Array.from(groups.values());
  }, [selectedList?.pieces]);

  // Fetch PDF as blob when a piece is selected for viewing
  useEffect(() => {
    if (!viewingPiece) {
      // Clean up previous blob URL
      if (viewerBlobUrlRef.current) {
        URL.revokeObjectURL(viewerBlobUrlRef.current);
        viewerBlobUrlRef.current = null;
      }
      setViewerBlobUrl(null);
      return;
    }

    let cancelled = false;
    setViewerLoading(true);
    setViewerBlobUrl(null);

    const loadPdf = async () => {
      // Prefer the cached version if available
      const cachedResponse = await getCachedPdf(viewingPiece.id);
      if (cachedResponse) {
        return cachedResponse.blob();
      }
      // De cache hierboven blijft de eerste bron; alleen het ophalen erna
      // liep buiten de api-laag om, en dus ook buiten de afhandeling van een
      // verlopen sessie.
      return getMusicPieceBlob(viewingPiece.id);
    };

    loadPdf()
      .then((blob) => {
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        viewerBlobUrlRef.current = url;
        setViewerBlobUrl(url);
        setViewerLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        showError(t('errors.generic'));
        setViewerLoading(false);
        setViewingPiece(null);
      });

    return () => {
      cancelled = true;
    };
  }, [viewingPiece, t]);

  // Revoke blob URL on unmount
  useEffect(() => {
    return () => {
      if (viewerBlobUrlRef.current) {
        URL.revokeObjectURL(viewerBlobUrlRef.current);
      }
    };
  }, []);

  // Check which pieces are already cached whenever the selected list changes
  useEffect(() => {
    if (!selectedList?.pieces?.length) {
      setCachedPieces(new Set());
      return;
    }

    let cancelled = false;
    Promise.all(
      selectedList.pieces.map(async (piece) => {
        const cached = await isPdfCached(piece.id);
        return cached ? piece.id : null;
      }),
    ).then((results) => {
      if (cancelled) return;
      setCachedPieces(new Set(results.filter((id): id is string => id !== null)));
    });

    return () => {
      cancelled = true;
    };
  }, [selectedList]);

  const handleSelectList = (listId: string) => {
    setSearchParams({ listId });
  };

  const handleDownload = async (piece: MusicPiece) => {
    setDownloading(piece.id);
    try {
      await downloadMusicPiece(piece.id);
      // Log activity for statistics
      logActivity('download', 'music_piece', piece.id).catch(() => {});
    } catch (error) {
      console.error('Error downloading:', error);
      showError(t('errors.generic'));
    } finally {
      setDownloading(null);
    }
  };

  const handleDownloadAll = async () => {
    if (!listId) return;
    setDownloadingAll(true);
    try {
      await downloadMusicListZip(listId);
    } catch (error) {
      console.error('Error downloading all:', error);
      showError(t('errors.generic'));
    } finally {
      setDownloadingAll(false);
    }
  };

  const handleMakeOffline = async () => {
    if (!selectedList?.pieces?.length) return;
    setCachingList(true);
    setCacheProgress({ cached: 0, total: selectedList.pieces.length });
    try {
      await cacheListPdfs(selectedList.pieces, (cached, total) => {
        setCacheProgress({ cached, total });
      });
      // Refresh cached piece status after caching is done
      const results = await Promise.all(
        selectedList.pieces.map(async (piece) => {
          const cached = await isPdfCached(piece.id);
          return cached ? piece.id : null;
        }),
      );
      setCachedPieces(new Set(results.filter((id): id is string => id !== null)));
      showSuccess(t('myMusic.offlineReady'));
    } catch {
      showError(t('errors.generic'));
    } finally {
      setCachingList(false);
      setCacheProgress({ cached: 0, total: 0 });
    }
  };

  const handleBack = () => {
    setSearchParams({});
  };

  const toggleTitle = (key: string) => {
    setExpandedTitles((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Swipe navigation for title groups
  const handleSwipeToNextTitle = useCallback(() => {
    if (currentTitleIndex < titleGroups.length - 1) {
      const newIndex = currentTitleIndex + 1;
      setCurrentTitleIndex(newIndex);
      const group = titleGroups[newIndex];
      const key = `${group.title}|||${group.arranger || ''}`;
      setExpandedTitles(new Set([key]));
    }
  }, [currentTitleIndex, titleGroups]);

  const handleSwipeToPrevTitle = useCallback(() => {
    if (currentTitleIndex > 0) {
      const newIndex = currentTitleIndex - 1;
      setCurrentTitleIndex(newIndex);
      const group = titleGroups[newIndex];
      const key = `${group.title}|||${group.arranger || ''}`;
      setExpandedTitles(new Set([key]));
    }
  }, [currentTitleIndex, titleGroups]);

  // Open issue report modal
  const openReportModal = (piece: MusicPiece) => {
    setReportingPiece(piece);
  };

  // Flatten lists for swipeable view (hook must run unconditionally,
  // before the single-list early return below)
  const allLists: MusicItem[] = useMemo(() => {
    return lists.map((list) => ({
      id: list.id,
      title: list.name,
      subtitle: list.orchestraName,
      metadata: `${list.titleCount || 0} ${t('myMusic.titlesForYou')}`,
    }));
  }, [lists, t]);

  // Show single list view with titles grouped as accordion
  if (listId) {
    return (
      <>
        <div>
          <button className="btn btn-outline mb-2" onClick={handleBack}>
            ← {t('myMusic.backToOverview')}
          </button>

          {isLoading || !selectedList ? (
            <div className="card">
              <div className="card-body">
                <div className="loading" role="status">
                  <div className="spinner" aria-hidden="true"></div>
                  <span className="sr-only">{t('common.loading')}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="card">
              <div className="card-header">
                <div>
                  <h2 className="card-title">{selectedList.name}</h2>
                  <span className="piece-meta">{selectedList.orchestraName}</span>
                </div>
                <div className="flex gap-1" style={{ alignItems: 'center' }}>
                  <button
                    className={`btn btn-sm ${compactView ? 'btn-primary' : 'btn-outline'}`}
                    onClick={toggleCompactView}
                    title={
                      compactView
                        ? t('myMusic.fullView', 'Volledige weergave')
                        : t('myMusic.compactView', 'Compacte weergave')
                    }
                    aria-label={
                      compactView
                        ? t('myMusic.fullView', 'Volledige weergave')
                        : t('myMusic.compactView', 'Compacte weergave')
                    }
                  >
                    <Icon name="menu" size={16} />
                  </button>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={handleMakeOffline}
                    disabled={cachingList || downloadingAll}
                    title={t('myMusic.makeOffline')}
                  >
                    {cachingList ? (
                      `${t('myMusic.makingOffline')} (${cacheProgress.cached}/${cacheProgress.total})`
                    ) : (
                      <>
                        <Icon name="download" size={16} /> {t('myMusic.makeOffline')}
                      </>
                    )}
                  </button>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={handleDownloadAll}
                    disabled={downloadingAll || cachingList}
                  >
                    {downloadingAll ? t('myMusic.downloadingAll') : `⬇ ${t('myMusic.downloadAll')}`}
                  </button>
                </div>
              </div>
              <div className="card-body">
                {titleGroups.length > 0 ? (
                  <SwipeContainer
                    onSwipeLeft={handleSwipeToNextTitle}
                    onSwipeRight={handleSwipeToPrevTitle}
                    threshold={60}
                    visualFeedback={true}
                    showIndicators={titleGroups.length > 1}
                    indicators={{
                      left:
                        currentTitleIndex < titleGroups.length - 1 ? (
                          <span style={{ color: 'var(--primary)', fontWeight: 500 }}>
                            {titleGroups[currentTitleIndex + 1]?.title.substring(0, 20)}...
                          </span>
                        ) : null,
                      right:
                        currentTitleIndex > 0 ? (
                          <span style={{ color: 'var(--primary)', fontWeight: 500 }}>
                            {titleGroups[currentTitleIndex - 1]?.title.substring(0, 20)}...
                          </span>
                        ) : null,
                    }}
                  >
                    {/* Title navigation indicator */}
                    {titleGroups.length > 1 && (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.5rem',
                          marginBottom: '1rem',
                          padding: '0.5rem',
                          backgroundColor: 'var(--background-secondary)',
                          borderRadius: '0.5rem',
                        }}
                      >
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={handleSwipeToPrevTitle}
                          disabled={currentTitleIndex === 0}
                          style={{ opacity: currentTitleIndex === 0 ? 0.5 : 1 }}
                        >
                          &#8249;
                        </button>
                        <span style={{ fontVariantNumeric: 'tabular-nums', minWidth: '4rem', textAlign: 'center' }}>
                          {currentTitleIndex + 1} / {titleGroups.length}
                        </span>
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={handleSwipeToNextTitle}
                          disabled={currentTitleIndex === titleGroups.length - 1}
                          style={{ opacity: currentTitleIndex === titleGroups.length - 1 ? 0.5 : 1 }}
                        >
                          &#8250;
                        </button>
                        <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: 'var(--text-light)' }}>
                          {t('myMusic.swipeHint', 'Swipe to navigate')}
                        </span>
                      </div>
                    )}

                    <div className="title-accordion">
                      {titleGroups.map((group, index) => {
                        const key = `${group.title}|||${group.arranger || ''}`;
                        const isExpanded = expandedTitles.has(key);

                        return (
                          <div key={key} className="title-group">
                            <button
                              className={`title-group-header ${isExpanded ? 'expanded' : ''}`}
                              onClick={() => {
                                toggleTitle(key);
                                setCurrentTitleIndex(index);
                              }}
                              aria-expanded={isExpanded}
                              type="button"
                            >
                              <div className="title-group-info">
                                <span className="title-group-arrow" aria-hidden="true">
                                  {isExpanded ? '▼' : '▶'}
                                </span>
                                <div>
                                  <strong className="title-group-name">{group.title}</strong>
                                  {group.arranger && <span className="title-group-arranger"> -- {group.arranger}</span>}
                                </div>
                              </div>
                              <div className="title-group-meta">
                                {group.youtubeUrl && (
                                  <a
                                    href={group.youtubeUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="btn btn-outline btn-sm"
                                    onClick={(e) => e.stopPropagation()}
                                    aria-label={`YouTube: ${group.title}`}
                                  >
                                    <span aria-hidden="true">▶</span> YouTube
                                  </a>
                                )}
                                <span className="badge badge-primary">
                                  {group.pieces.length} {t('myMusic.pieces')}
                                </span>
                              </div>
                            </button>

                            {isExpanded && (
                              <div className="title-group-body">
                                <table className="table">
                                  <thead>
                                    <tr>
                                      <th scope="col">{t('myMusic.table.instrument')}</th>
                                      {!compactView && <th scope="col">{t('myMusic.table.tuning')}</th>}
                                      {!compactView && <th scope="col">{t('myMusic.table.number')}</th>}
                                      {!compactView && <th scope="col">{t('myMusic.table.clef')}</th>}
                                      <th scope="col"></th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {group.pieces.map((piece) => (
                                      <tr key={piece.id}>
                                        <td>
                                          <span>{piece.instrumentName || '-'}</span>
                                          {compactView && (piece.tuning || piece.groupNumber || piece.clef) && (
                                            <span className="text-muted text-xs" style={{ marginLeft: '0.5rem' }}>
                                              {[piece.tuning, piece.groupNumber, piece.clef]
                                                .filter(Boolean)
                                                .join(' · ')}
                                            </span>
                                          )}
                                          {cachedPieces.has(piece.id) && (
                                            <span
                                              title={t('myMusic.offlineReady')}
                                              aria-label={t('myMusic.offlineReady')}
                                              style={{
                                                marginLeft: '0.35rem',
                                                color: 'var(--success, #22c55e)',
                                                display: 'inline-flex',
                                              }}
                                            >
                                              <Icon name="check" size={14} />
                                            </span>
                                          )}
                                        </td>
                                        {!compactView && <td>{piece.tuning || '-'}</td>}
                                        {!compactView && <td>{piece.groupNumber || '-'}</td>}
                                        {!compactView && <td>{piece.clef || '-'}</td>}
                                        <td>
                                          <div className="flex gap-1">
                                            <button
                                              className="btn btn-primary btn-sm"
                                              onClick={() => handleDownload(piece)}
                                              disabled={downloading === piece.id}
                                            >
                                              {downloading === piece.id ? t('myMusic.downloading') : '⬇ Download'}
                                            </button>
                                            <button
                                              className="btn btn-outline btn-sm"
                                              onClick={() => setViewingPiece(piece)}
                                              title={t('myMusic.viewPdf', 'Bekijken')}
                                            >
                                              <Icon name="eye" size={14} /> {t('myMusic.view', 'Bekijk')}
                                            </button>
                                            <button
                                              className="btn btn-outline btn-sm"
                                              onClick={() => openReportModal(piece)}
                                              aria-label={`${t('myMusic.reportIssue.title')}: ${piece.title} - ${piece.instrumentName || ''}`}
                                            >
                                              <Icon name="pencil" size={14} />
                                              <span className="sr-only">{t('myMusic.reportIssue.title')}</span>
                                            </button>
                                          </div>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </SwipeContainer>
                ) : (
                  <div className="empty-state">
                    <div className="empty-icon" aria-hidden="true">
                      <Icon name="music" size={48} />
                    </div>
                    <p>{t('myMusic.noPieces')}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* PDF Viewer Modal */}
        {viewingPiece && (
          <Modal
            title={`${viewingPiece.title}${viewingPiece.instrumentName ? ` - ${viewingPiece.instrumentName}` : ''}`}
            onClose={() => setViewingPiece(null)}
            size="large"
          >
            <div style={{ height: '75vh' }}>
              {viewerLoading ? (
                <div
                  className="loading"
                  role="status"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}
                >
                  <div className="spinner" aria-hidden="true"></div>
                  <span className="sr-only">{t('common.loading')}</span>
                </div>
              ) : viewerBlobUrl ? (
                <PdfViewer
                  url={viewerBlobUrl}
                  musicPieceId={viewingPiece.id}
                  fitMode="contain"
                  enableSwipe={true}
                  enableZoom={true}
                  autoDarkMode={true}
                />
              ) : null}
            </div>
          </Modal>
        )}

        {/* Issue Report Modal - using ReportIssueModal component */}
        {reportingPiece && (
          <ReportIssueModal
            pieceId={reportingPiece.id}
            pieceTitle={`${reportingPiece.title}${reportingPiece.instrumentName ? ` - ${reportingPiece.instrumentName}` : ''}`}
            onClose={() => setReportingPiece(null)}
          />
        )}
      </>
    );
  }

  // Show lists overview - grouped by orchestra
  return (
    <div>
      <div className="page-header">
        <h1>{t('myMusic.title')}</h1>
        {lists.length > 1 && (
          <button
            className={`btn btn-sm ${swipeViewEnabled ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setSwipeViewEnabled(!swipeViewEnabled)}
            title={t('myMusic.swipeView', 'Swipe View')}
          >
            <Icon name="menu" size={16} />{' '}
            {swipeViewEnabled ? t('myMusic.gridView', 'Grid') : t('myMusic.swipeView', 'Swipe')}
          </button>
        )}
      </div>

      {listsLoading ? (
        <div className="card">
          <div className="card-body">
            <div className="loading" role="status">
              <div className="spinner" aria-hidden="true"></div>
              <span className="sr-only">{t('common.loading')}</span>
            </div>
          </div>
        </div>
      ) : orchestraGroups.length > 0 ? (
        swipeViewEnabled && allLists.length > 1 ? (
          /* SwipeableMusicList for mobile-friendly navigation */
          <div className="card">
            <div className="card-body">
              <SwipeableMusicList
                items={allLists}
                enableSwipe={true}
                showDots={true}
                showArrows={true}
                loop={false}
                onItemChange={(_index, _item) => {
                  // Optional: could auto-select on swipe
                }}
                renderItem={(item, _index, isActive) => (
                  <MusicCard
                    item={item}
                    isActive={isActive}
                    onAction={() => handleSelectList(item.id)}
                    actionLabel={t('myMusic.viewMusic')}
                  />
                )}
              />
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {orchestraGroups.map((group) => (
              <div key={group.orchestraId} className="card">
                <div className="card-header">
                  <h2 className="card-title">{group.orchestraName}</h2>
                </div>
                <div className="card-body">
                  <div className="grid grid-3">
                    {group.lists.map((list) => (
                      <div
                        key={list.id}
                        className="card"
                        style={{ border: '1px solid var(--border-color)', boxShadow: 'none' }}
                      >
                        <div className="card-body">
                          <h3 className="piece-title">{list.name}</h3>
                          <p className="piece-meta mb-2">
                            {list.titleCount || 0} {t('myMusic.titlesForYou')}
                          </p>
                          <button className="btn btn-primary" onClick={() => handleSelectList(list.id)}>
                            {t('myMusic.viewMusic')}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="card">
          <div className="card-body">
            <div className="empty-state">
              <div className="empty-icon" aria-hidden="true">
                <Icon name="clipboard" size={48} />
              </div>
              <h3>{t('myMusic.noLists')}</h3>
              <p>{t('myMusic.noListsDescription')}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
