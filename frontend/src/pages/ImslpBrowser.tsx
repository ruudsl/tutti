import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { searchImslp, getImslpWorkDetails, importFromImslp } from '../api';
import type { ImslpWork, ImslpWorkDetail, ImslpScore } from '../api';
import { showSuccess, showError } from '../utils/toast';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { FormField } from '../components/FormField';
import { SkeletonCard } from '../components/Skeleton';
import { Icon } from '../components/Icon';

export default function ImslpBrowser() {
  const { t } = useTranslation();
  useDocumentTitle('pageTitle.imslpBrowser');
  const queryClient = useQueryClient();

  const [query, setQuery] = useState('');
  const [composer, setComposer] = useState('');
  const [works, setWorks] = useState<ImslpWork[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [searchUrl, setSearchUrl] = useState('');
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const [selectedWork, setSelectedWork] = useState<ImslpWorkDetail | null>(null);
  const [loadingWorkId, setLoadingWorkId] = useState<string | null>(null);
  const [importingScoreId, setImportingScoreId] = useState<string | null>(null);
  const [recentImports, setRecentImports] = useState<{ title: string; pieceId: string }[]>([]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setSearching(true);
    setWorks([]);
    setSelectedWork(null);
    setHasSearched(true);

    try {
      const result = await searchImslp(query.trim(), composer.trim() || undefined);
      setWorks(result.works);
      setTotalCount(result.totalCount);
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

      setRecentImports((prev) => [{ title: result.title, pieceId: result.musicPieceId }, ...prev.slice(0, 4)]);
    } catch (error: any) {
      showError(error.response?.data?.error || t('imslp.importError'));
    } finally {
      setImportingScoreId(null);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>{t('imslp.browserTitle')}</h1>
        <a href="https://imslp.org" target="_blank" rel="noopener noreferrer" className="btn btn-outline">
          {t('imslp.openImslp')}
        </a>
      </div>

      <div className="card mb-2">
        <div className="card-header">
          <h2 className="card-title">{t('imslp.searchTitle')}</h2>
        </div>
        <div className="card-body">
          <form onSubmit={handleSearch}>
            <div className="grid grid-3 gap-1">
              <FormField className="form-group mb-0" label={t('imslp.workTitle')}>
                <input
                  type="text"
                  className="form-control"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('imslp.workTitlePlaceholder')}
                />
              </FormField>
              <FormField className="form-group mb-0" label={t('imslp.composer')}>
                <input
                  type="text"
                  className="form-control"
                  value={composer}
                  onChange={(e) => setComposer(e.target.value)}
                  placeholder={t('imslp.composerPlaceholder')}
                />
              </FormField>
              <div className="form-group mb-0" style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={!query.trim() || searching}
                  style={{ width: '100%' }}
                >
                  {searching ? t('common.loading') : t('common.search')}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {recentImports.length > 0 && (
        <div className="card mb-2">
          <div className="card-header">
            <h2 className="card-title">{t('imslp.recentImports')}</h2>
          </div>
          <div className="card-body">
            <div className="tags">
              {recentImports.map((item, idx) => (
                <span key={idx} className="tag tag-success">
                  {item.title}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-2-1 gap-2">
        {/* Search Results */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">
              {t('imslp.searchResults')}
              {totalCount > 0 && (
                <span className="badge badge-secondary" style={{ marginLeft: '0.5rem' }}>
                  {totalCount}
                </span>
              )}
            </h2>
            {searchUrl && (
              <a href={searchUrl} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-sm">
                {t('imslp.openOnImslp')}
              </a>
            )}
          </div>
          <div className="card-body">
            {searching && <SkeletonCard />}

            {!searching && !hasSearched && (
              <div className="empty-state">
                <div className="empty-icon">
                  <Icon name="fileText" size={48} />
                </div>
                <p>{t('imslp.searchPrompt')}</p>
              </div>
            )}

            {!searching && hasSearched && works.length === 0 && (
              <div className="empty-state">
                <div className="empty-icon">
                  <Icon name="search" size={48} />
                </div>
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
                {works.map((work) => (
                  <div
                    key={work.id}
                    className={`imslp-work-item ${selectedWork?.id === work.id ? 'selected' : ''}`}
                    style={{
                      padding: '0.75rem',
                      borderBottom: '1px solid var(--border)',
                      cursor: 'pointer',
                      background: selectedWork?.id === work.id ? 'var(--primary-light)' : 'transparent',
                    }}
                    onClick={() => handleSelectWork(work)}
                  >
                    <div className="flex justify-between items-center">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <strong style={{ wordBreak: 'break-word' }}>{work.title}</strong>
                        {work.composer && (
                          <div className="text-light" style={{ fontSize: '0.875rem' }}>
                            {work.composer}
                          </div>
                        )}
                      </div>
                      {loadingWorkId === work.id && (
                        <span className="spinner" style={{ width: '16px', height: '16px' }} />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Work Details Panel */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">{t('imslp.workDetails')}</h2>
          </div>
          <div className="card-body">
            {!selectedWork ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <Icon name="clipboard" size={48} />
                </div>
                <p>{t('imslp.selectWorkPrompt')}</p>
              </div>
            ) : (
              <div>
                <h3 style={{ marginBottom: '0.5rem' }}>{selectedWork.title}</h3>

                <div className="piece-meta mb-2">
                  {selectedWork.composer && (
                    <div>
                      <strong>{t('imslp.composer')}:</strong> {selectedWork.composer}
                    </div>
                  )}
                  {selectedWork.key && (
                    <div>
                      <strong>{t('imslp.key')}:</strong> {selectedWork.key}
                    </div>
                  )}
                  {selectedWork.instrumentation && (
                    <div>
                      <strong>{t('imslp.instrumentation')}:</strong> {selectedWork.instrumentation}
                    </div>
                  )}
                  {selectedWork.year && (
                    <div>
                      <strong>{t('imslp.year')}:</strong> {selectedWork.year}
                    </div>
                  )}
                </div>

                <a
                  href={selectedWork.permalink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-outline btn-sm mb-2"
                >
                  {t('imslp.viewOnImslp')}
                </a>

                <h4 className="mb-1">{t('imslp.availableScores')}</h4>

                {selectedWork.scores.length === 0 ? (
                  <div className="empty-state" style={{ padding: '1rem' }}>
                    <p>{t('imslp.noScoresFound')}</p>
                    <a
                      href={selectedWork.permalink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-outline btn-sm"
                    >
                      {t('imslp.browseOnImslp')}
                    </a>
                  </div>
                ) : (
                  <div className="imslp-scores-list">
                    {selectedWork.scores.map((score) => (
                      <div
                        key={score.id}
                        style={{
                          padding: '0.75rem',
                          borderBottom: '1px solid var(--border)',
                          background: 'var(--background)',
                          marginBottom: '0.5rem',
                          borderRadius: '0.25rem',
                        }}
                      >
                        <div style={{ marginBottom: '0.5rem' }}>
                          <strong style={{ wordBreak: 'break-word', fontSize: '0.875rem' }}>
                            {score.description || score.filename}
                          </strong>
                        </div>
                        <div className="piece-meta" style={{ fontSize: '0.75rem', marginBottom: '0.5rem' }}>
                          {score.publisher && <span>{score.publisher}</span>}
                          {score.editor && (
                            <span>
                              {t('imslp.editor')}: {score.editor}
                            </span>
                          )}
                          {score.fileSize && <span>{score.fileSize}</span>}
                        </div>
                        <div className="flex gap-1">
                          <a
                            href={score.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-outline btn-sm"
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
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card mt-2">
        <div className="card-body" style={{ fontSize: '0.875rem', color: 'var(--text-light)' }}>
          <strong>{t('imslp.aboutTitle')}</strong>
          <p className="mb-0">{t('imslp.disclaimer')}</p>
        </div>
      </div>
    </div>
  );
}
