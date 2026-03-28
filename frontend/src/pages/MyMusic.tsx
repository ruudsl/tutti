import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getMyMusicLists, getMusicList, downloadMusicPiece, logActivity, createIssue } from '../api';
import { showSuccess, showError } from '../utils/toast';
import type { MusicList, MusicPiece } from '../types';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Modal } from '../components/Modal';
import { SwipeContainer } from '../components/SwipeContainer';

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
  const [lists, setLists] = useState<MusicList[]>([]);
  const [selectedList, setSelectedList] = useState<(MusicList & { pieces: MusicPiece[] }) | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [expandedTitles, setExpandedTitles] = useState<Set<string>>(new Set());
  const [currentTitleIndex, setCurrentTitleIndex] = useState(0);

  // Issue reporting state
  const [reportingPiece, setReportingPiece] = useState<MusicPiece | null>(null);
  const [issueDescription, setIssueDescription] = useState('');
  const [issuePageNumber, setIssuePageNumber] = useState('');
  const [issueMeasureNumber, setIssueMeasureNumber] = useState('');
  const [isSubmittingIssue, setIsSubmittingIssue] = useState(false);

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

  useEffect(() => {
    loadLists();
  }, []);

  useEffect(() => {
    const listId = searchParams.get('listId');
    if (listId) {
      loadList(listId);
    } else {
      setSelectedList(null);
    }
  }, [searchParams]);

  const loadLists = async () => {
    try {
      const data = await getMyMusicLists();
      setLists(data);

      // If listId in URL, load that list
      const listId = searchParams.get('listId');
      if (listId) {
        loadList(listId);
      }
    } catch (error) {
      console.error('Error loading lists:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadList = async (listId: string) => {
    setIsLoading(true);
    try {
      const data = await getMusicList(listId);
      setSelectedList(data);
      setExpandedTitles(new Set());
      // Log activity for statistics
      logActivity('view', 'music_list', listId).catch(() => {});
    } catch (error) {
      console.error('Error loading list:', error);
    } finally {
      setIsLoading(false);
    }
  };

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

  const handleBack = () => {
    setSearchParams({});
    setSelectedList(null);
  };

  const toggleTitle = (key: string) => {
    setExpandedTitles(prev => {
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

  const handleReportIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportingPiece || !issueDescription.trim()) return;

    setIsSubmittingIssue(true);
    try {
      await createIssue({
        musicPieceId: reportingPiece.id,
        pageNumber: issuePageNumber ? parseInt(issuePageNumber) : undefined,
        measureNumber: issueMeasureNumber || undefined,
        description: issueDescription.trim(),
      });
      showSuccess(t('myMusic.reportIssue.success'));
      setReportingPiece(null);
      setIssueDescription('');
      setIssuePageNumber('');
      setIssueMeasureNumber('');
    } catch (error: any) {
      showError(error.response?.data?.error || t('errors.generic'));
    } finally {
      setIsSubmittingIssue(false);
    }
  };

  const openReportModal = (piece: MusicPiece) => {
    setReportingPiece(piece);
    setIssueDescription('');
    setIssuePageNumber('');
    setIssueMeasureNumber('');
  };

  if (isLoading && !selectedList) {
    return (
      <div className="loading" role="status" aria-label={t('accessibility.loadingContent')}>
        <div className="spinner" aria-hidden="true"></div>
        <span className="sr-only">{t('common.loading')}</span>
      </div>
    );
  }

  // Show single list view with titles grouped as accordion
  if (selectedList) {
    return (
      <>
      <div>
        <button className="btn btn-outline mb-2" onClick={handleBack}>
          ← {t('myMusic.backToOverview')}
        </button>

        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">{selectedList.name}</h2>
              <span className="piece-meta">{selectedList.orchestraName}</span>
            </div>
          </div>
          <div className="card-body">
            {isLoading ? (
              <div className="loading" role="status">
                <div className="spinner" aria-hidden="true"></div>
                <span className="sr-only">{t('common.loading')}</span>
              </div>
            ) : titleGroups.length > 0 ? (
              <SwipeContainer
                onSwipeLeft={handleSwipeToNextTitle}
                onSwipeRight={handleSwipeToPrevTitle}
                threshold={60}
                visualFeedback={true}
                showIndicators={titleGroups.length > 1}
                indicators={{
                  left: currentTitleIndex < titleGroups.length - 1 ? (
                    <span style={{ color: 'var(--primary)', fontWeight: 500 }}>
                      {titleGroups[currentTitleIndex + 1]?.title.substring(0, 20)}...
                    </span>
                  ) : null,
                  right: currentTitleIndex > 0 ? (
                    <span style={{ color: 'var(--primary)', fontWeight: 500 }}>
                      {titleGroups[currentTitleIndex - 1]?.title.substring(0, 20)}...
                    </span>
                  ) : null,
                }}
              >
                {/* Title navigation indicator */}
                {titleGroups.length > 1 && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    marginBottom: '1rem',
                    padding: '0.5rem',
                    backgroundColor: 'var(--background-secondary)',
                    borderRadius: '0.5rem',
                  }}>
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
                              {group.arranger && (
                                <span className="title-group-arranger"> -- {group.arranger}</span>
                              )}
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
                                  <th scope="col">{t('myMusic.table.tuning')}</th>
                                  <th scope="col">{t('myMusic.table.number')}</th>
                                  <th scope="col">{t('myMusic.table.clef')}</th>
                                  <th scope="col"></th>
                                </tr>
                              </thead>
                              <tbody>
                                {group.pieces.map((piece) => (
                                  <tr key={piece.id}>
                                    <td>{piece.instrumentName || '-'}</td>
                                    <td>{piece.tuning || '-'}</td>
                                    <td>{piece.groupNumber || '-'}</td>
                                    <td>{piece.clef || '-'}</td>
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
                                          onClick={() => openReportModal(piece)}
                                          aria-label={`${t('myMusic.reportIssue.title')}: ${piece.title} - ${piece.instrumentName || ''}`}
                                        >
                                          <span aria-hidden="true">📝</span>
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
                <div className="empty-icon" aria-hidden="true">🎵</div>
                <p>{t('myMusic.noPieces')}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Issue Report Modal */}
      {reportingPiece && (
        <Modal
          title={t('myMusic.reportIssue.title')}
          onClose={() => setReportingPiece(null)}
          footer={
            <>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setReportingPiece(null)}
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                form="report-issue-form"
                className="btn btn-primary"
                disabled={isSubmittingIssue || !issueDescription.trim()}
              >
                {isSubmittingIssue ? t('myMusic.reportIssue.submitting') : t('myMusic.reportIssue.submit')}
              </button>
            </>
          }
        >
          <form id="report-issue-form" onSubmit={handleReportIssue}>
            <div className="form-group">
              <label className="form-label">{t('myMusic.reportIssue.piece')}</label>
              <p>
                <strong>{reportingPiece.title}</strong>
                {reportingPiece.instrumentName && ` - ${reportingPiece.instrumentName}`}
              </p>
            </div>
            <div className="grid grid-2">
              <div className="form-group">
                <label htmlFor="issue-page" className="form-label">{t('myMusic.reportIssue.pageNumber')} ({t('common.optional')})</label>
                <input
                  type="number"
                  id="issue-page"
                  className="form-control"
                  value={issuePageNumber}
                  onChange={(e) => setIssuePageNumber(e.target.value)}
                  min="1"
                  placeholder="2"
                />
              </div>
              <div className="form-group">
                <label htmlFor="issue-measure" className="form-label">{t('myMusic.reportIssue.measureNumber')} ({t('common.optional')})</label>
                <input
                  type="text"
                  id="issue-measure"
                  className="form-control"
                  value={issueMeasureNumber}
                  onChange={(e) => setIssueMeasureNumber(e.target.value)}
                  placeholder="24-28"
                />
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="issue-description" className="form-label">{t('myMusic.reportIssue.description')} *</label>
              <textarea
                id="issue-description"
                className="form-control"
                value={issueDescription}
                onChange={(e) => setIssueDescription(e.target.value)}
                rows={4}
                placeholder={t('myMusic.reportIssue.descriptionPlaceholder')}
                required
                aria-required="true"
              />
            </div>
          </form>
        </Modal>
      )}
    </>
    );
  }

  // Show lists overview - grouped by orchestra
  return (
    <div>
      <h1 className="mb-3">{t('myMusic.title')}</h1>

      {orchestraGroups.length > 0 ? (
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
                        <button
                          className="btn btn-primary"
                          onClick={() => handleSelectList(list.id)}
                        >
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
      ) : (
        <div className="card">
          <div className="card-body">
            <div className="empty-state">
              <div className="empty-icon" aria-hidden="true">📋</div>
              <h3>{t('myMusic.noLists')}</h3>
              <p>{t('myMusic.noListsDescription')}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
