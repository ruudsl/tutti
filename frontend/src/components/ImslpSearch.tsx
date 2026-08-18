import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { searchImslp, getImslpWorkDetails, importFromImslp } from '../api';
import type { ImslpWork, ImslpWorkDetail, ImslpScore } from '../api';
import { showSuccess, showError } from '../utils/toast';
import { Modal } from './Modal';

interface ImslpSearchProps {
  onClose: () => void;
  initialQuery?: string;
  initialComposer?: string;
  onImportSuccess?: (result: { title: string; pieceId: string }) => void;
}

export function ImslpSearch({ onClose, initialQuery = '', initialComposer = '', onImportSuccess }: ImslpSearchProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [query, setQuery] = useState(initialQuery);
  const [composer, setComposer] = useState(initialComposer);
  const [works, setWorks] = useState<ImslpWork[]>([]);
  const [searchUrl, setSearchUrl] = useState('');
  const [searching, setSearching] = useState(false);
  const [selectedWork, setSelectedWork] = useState<ImslpWorkDetail | null>(null);
  const [loadingWorkId, setLoadingWorkId] = useState<string | null>(null);
  const [importingScoreId, setImportingScoreId] = useState<string | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setSearching(true);
    setWorks([]);
    setSelectedWork(null);

    try {
      const result = await searchImslp(query.trim(), composer.trim() || undefined);
      setWorks(result.works);
      setSearchUrl(result.searchUrl);
    } catch (error: any) {
      showError(error.response?.data?.error || t('imslp.searchError'));
    } finally {
      setSearching(false);
    }
  };

  const handleSelectWork = async (work: ImslpWork) => {
    setLoadingWorkId(work.id);
    try {
      const details = await getImslpWorkDetails(work.id);
      setSelectedWork(details);
    } catch (error: any) {
      showError(error.response?.data?.error || t('imslp.loadError'));
    } finally {
      setLoadingWorkId(null);
    }
  };

  const handleImport = async (work: ImslpWorkDetail, score: ImslpScore) => {
    setImportingScoreId(score.id);
    try {
      const result = await importFromImslp({
        fileUrl: score.fileUrl,
        title: work.title,
        composer: work.composer,
        arranger: score.editor || undefined,
        instrumentation: work.instrumentation,
        imslpWorkId: work.id,
        imslpPermalink: work.permalink,
      });

      showSuccess(t('imslp.importSuccess'));
      queryClient.invalidateQueries({ queryKey: ['musicPieces'] });
      queryClient.invalidateQueries({ queryKey: ['musicTitles'] });

      if (onImportSuccess) {
        onImportSuccess({ title: result.title, pieceId: result.musicPieceId });
      }
    } catch (error: any) {
      showError(error.response?.data?.error || t('imslp.importError'));
    } finally {
      setImportingScoreId(null);
    }
  };

  return (
    <Modal title={t('imslp.searchTitle')} onClose={onClose} size="large">
      <form onSubmit={handleSearch} className="mb-2">
        <div className="grid grid-2 gap-1">
          <div className="form-group mb-0">
            <label className="form-label">{t('imslp.workTitle')}</label>
            <input
              type="text"
              className="form-control"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('imslp.workTitlePlaceholder')}
              autoFocus
            />
          </div>
          <div className="form-group mb-0">
            <label className="form-label">{t('imslp.composer')}</label>
            <input
              type="text"
              className="form-control"
              value={composer}
              onChange={(e) => setComposer(e.target.value)}
              placeholder={t('imslp.composerPlaceholder')}
            />
          </div>
        </div>
        <div className="flex gap-1 mt-1">
          <button type="submit" className="btn btn-primary" disabled={!query.trim() || searching}>
            {searching ? t('common.loading') : t('common.search')}
          </button>
          {searchUrl && (
            <a href={searchUrl} target="_blank" rel="noopener noreferrer" className="btn btn-outline">
              {t('imslp.openOnImslp')}
            </a>
          )}
        </div>
      </form>

      {selectedWork ? (
        <div>
          <button type="button" className="btn btn-outline btn-sm mb-1" onClick={() => setSelectedWork(null)}>
            {t('common.back')}
          </button>

          <div className="card mb-2">
            <div className="card-header">
              <h3 className="card-title">{selectedWork.title}</h3>
            </div>
            <div className="card-body">
              <div className="piece-meta">
                {selectedWork.composer && (
                  <span>
                    <strong>{t('imslp.composer')}:</strong> {selectedWork.composer}
                  </span>
                )}
                {selectedWork.key && (
                  <span>
                    <strong>{t('imslp.key')}:</strong> {selectedWork.key}
                  </span>
                )}
                {selectedWork.instrumentation && (
                  <span>
                    <strong>{t('imslp.instrumentation')}:</strong> {selectedWork.instrumentation}
                  </span>
                )}
              </div>
              <div className="mt-1">
                <a
                  href={selectedWork.permalink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-outline btn-sm"
                >
                  {t('imslp.viewOnImslp')}
                </a>
              </div>
            </div>
          </div>

          <h4 className="mb-1">{t('imslp.availableScores')}</h4>
          {selectedWork.scores.length === 0 ? (
            <div className="empty-state">
              <p>{t('imslp.noScoresFound')}</p>
              <a href={selectedWork.permalink} target="_blank" rel="noopener noreferrer" className="btn btn-outline">
                {t('imslp.browseOnImslp')}
              </a>
            </div>
          ) : (
            <div className="imslp-scores-list">
              {selectedWork.scores.map((score) => (
                <div key={score.id} className="imslp-score-item card mb-1">
                  <div className="card-body" style={{ padding: '0.75rem' }}>
                    <div className="flex justify-between items-start">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <strong style={{ wordBreak: 'break-word' }}>{score.description || score.filename}</strong>
                        <div className="piece-meta" style={{ marginTop: '0.25rem' }}>
                          {score.publisher && <span>{score.publisher}</span>}
                          {score.editor && (
                            <span>
                              {t('imslp.editor')}: {score.editor}
                            </span>
                          )}
                          {score.fileSize && <span>{score.fileSize}</span>}
                          {score.pageCount > 0 && (
                            <span>
                              {score.pageCount} {t('imslp.pages')}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1" style={{ flexShrink: 0 }}>
                        <a
                          href={score.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-outline btn-sm"
                          title={t('imslp.preview')}
                        >
                          {t('imslp.preview')}
                        </a>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => handleImport(selectedWork, score)}
                          disabled={importingScoreId === score.id}
                        >
                          {importingScoreId === score.id ? t('imslp.importing') : t('imslp.import')}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="imslp-results">
          {works.length === 0 && !searching && query && (
            <div className="empty-state">
              <p>{t('imslp.noResults')}</p>
              {searchUrl && (
                <a href={searchUrl} target="_blank" rel="noopener noreferrer" className="btn btn-outline">
                  {t('imslp.searchOnImslp')}
                </a>
              )}
            </div>
          )}

          {works.length > 0 && (
            <div className="imslp-works-list">
              <p className="text-light mb-1">{t('imslp.resultsCount', { count: works.length })}</p>
              {works.map((work) => (
                <div
                  key={work.id}
                  className="imslp-work-item card mb-1"
                  style={{ cursor: 'pointer' }}
                  onClick={() => handleSelectWork(work)}
                >
                  <div className="card-body" style={{ padding: '0.75rem' }}>
                    <div className="flex justify-between items-center">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <strong>{work.title}</strong>
                        {work.composer && (
                          <div className="text-light" style={{ fontSize: '0.875rem' }}>
                            {work.composer}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        disabled={loadingWorkId === work.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectWork(work);
                        }}
                      >
                        {loadingWorkId === work.id ? '...' : t('imslp.viewScores')}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-2 text-light" style={{ fontSize: '0.75rem' }}>
        <p>{t('imslp.disclaimer')}</p>
      </div>
    </Modal>
  );
}
