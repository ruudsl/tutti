import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getMyMusicLists, getMusicList, downloadMusicPiece, logActivity, createIssue } from '../api';
import { showSuccess, showError } from '../utils/toast';
import type { MusicList, MusicPiece } from '../types';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export default function MyMusic() {
  const { t } = useTranslation();
  useDocumentTitle('pageTitle.myMusic');
  const [searchParams, setSearchParams] = useSearchParams();
  const [lists, setLists] = useState<MusicList[]>([]);
  const [selectedList, setSelectedList] = useState<(MusicList & { pieces: MusicPiece[] }) | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);

  // Issue reporting state
  const [reportingPiece, setReportingPiece] = useState<MusicPiece | null>(null);
  const [issueDescription, setIssueDescription] = useState('');
  const [issuePageNumber, setIssuePageNumber] = useState('');
  const [issueMeasureNumber, setIssueMeasureNumber] = useState('');
  const [isSubmittingIssue, setIsSubmittingIssue] = useState(false);

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
      <div className="loading">
        <div className="spinner"></div>
      </div>
    );
  }

  // Show single list view
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
              <div className="loading">
                <div className="spinner"></div>
              </div>
            ) : selectedList.pieces.length > 0 ? (
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('myMusic.table.title')}</th>
                    <th>{t('myMusic.table.arranger')}</th>
                    <th>{t('myMusic.table.instrument')}</th>
                    <th>{t('myMusic.table.tuning')}</th>
                    <th>{t('myMusic.table.number')}</th>
                    <th>{t('myMusic.table.clef')}</th>
                    <th>{t('myMusic.table.preview')}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {selectedList.pieces.map((piece) => (
                    <tr key={piece.id}>
                      <td>
                        <strong>{piece.title}</strong>
                      </td>
                      <td>{piece.arranger || '-'}</td>
                      <td>{piece.instrumentName || '-'}</td>
                      <td>{piece.tuning || '-'}</td>
                      <td>{piece.groupNumber || '-'}</td>
                      <td>{piece.clef || '-'}</td>
                      <td>
                        {piece.youtubeUrl && (
                          <a
                            href={piece.youtubeUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-outline btn-sm"
                          >
                            ▶ YouTube
                          </a>
                        )}
                      </td>
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
                            title={t('myMusic.reportIssue.title')}
                          >
                            📝
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty-state">
                <div className="empty-icon">🎵</div>
                <p>{t('myMusic.noPieces')}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Issue Report Modal */}
      {reportingPiece && (
        <div className="modal-overlay" onClick={() => setReportingPiece(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{t('myMusic.reportIssue.title')}</h3>
              <button className="modal-close" onClick={() => setReportingPiece(null)}>×</button>
            </div>
            <form onSubmit={handleReportIssue}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">{t('myMusic.reportIssue.piece')}</label>
                  <p>
                    <strong>{reportingPiece.title}</strong>
                    {reportingPiece.instrumentName && ` - ${reportingPiece.instrumentName}`}
                  </p>
                </div>
                <div className="grid grid-2">
                  <div className="form-group">
                    <label className="form-label">{t('myMusic.reportIssue.pageNumber')} ({t('common.optional')})</label>
                    <input
                      type="number"
                      className="form-control"
                      value={issuePageNumber}
                      onChange={(e) => setIssuePageNumber(e.target.value)}
                      min="1"
                      placeholder="2"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('myMusic.reportIssue.measureNumber')} ({t('common.optional')})</label>
                    <input
                      type="text"
                      className="form-control"
                      value={issueMeasureNumber}
                      onChange={(e) => setIssueMeasureNumber(e.target.value)}
                      placeholder="24-28"
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">{t('myMusic.reportIssue.description')} *</label>
                  <textarea
                    className="form-control"
                    value={issueDescription}
                    onChange={(e) => setIssueDescription(e.target.value)}
                    rows={4}
                    placeholder={t('myMusic.reportIssue.descriptionPlaceholder')}
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setReportingPiece(null)}
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSubmittingIssue || !issueDescription.trim()}
                >
                  {isSubmittingIssue ? t('myMusic.reportIssue.submitting') : t('myMusic.reportIssue.submit')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
    );
  }

  // Show lists overview
  return (
    <div>
      <h1 className="mb-3">{t('myMusic.title')}</h1>

      {lists.length > 0 ? (
        <div className="grid grid-3">
          {lists.map((list) => (
            <div key={list.id} className="card">
              <div className="card-body">
                <h3 className="piece-title">{list.name}</h3>
                <p className="piece-meta mb-2">
                  {list.orchestraName} • {list.pieceCount || 0} {t('myMusic.piecesForYou')}
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
      ) : (
        <div className="card">
          <div className="card-body">
            <div className="empty-state">
              <div className="empty-icon">📋</div>
              <h3>{t('myMusic.noLists')}</h3>
              <p>{t('myMusic.noListsDescription')}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
