import { useState, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useMusicTitles } from '../hooks/useMusicTitles';
import { useGenres } from '../hooks/useGenres';
import { updateTitleMeta, getYouTubeMeta, uploadTitleMp3, deleteTitleMp3, getMp3Url } from '../api';
import { SkeletonTable } from '../components/Skeleton';
import { useDebounce } from '../hooks/useDebounce';
import { formatDuration, parseDuration } from '../utils/format';
import { showSuccess, showError } from '../utils/toast';
import type { MusicTitle } from '../types';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Modal } from '../components/Modal';
import { searchSheetMusicWebsites } from '../utils/sheetMusic';

// Format seconds to mm:ss string for form input
function formatDurationForForm(seconds: number): string {
  if (!seconds || seconds <= 0) return '';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

interface TitleMetaForm {
  youtubeUrl: string;
  description: string;
  durationStr: string;
  grade: string;
  genreIds: string[];
  isShared: boolean;
}

export default function MusicTitles() {
  const { t } = useTranslation();
  useDocumentTitle('pageTitle.titles');
  const [search, setSearch] = useState('');
  const [filterGenre, setFilterGenre] = useState('');
  const [expandedTitle, setExpandedTitle] = useState<string | null>(null);

  // Edit state
  const [editingTitle, setEditingTitle] = useState<MusicTitle | null>(null);
  const [titleMetaForm, setTitleMetaForm] = useState<TitleMetaForm>({
    youtubeUrl: '',
    description: '',
    durationStr: '',
    grade: '',
    genreIds: [],
    isShared: false,
  });
  const [youtubeMeta, setYoutubeMeta] = useState<{ title: string; author: string } | null>(null);
  const [fetchingYouTube, setFetchingYouTube] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingMp3, setUploadingMp3] = useState(false);
  const [currentMp3Path, setCurrentMp3Path] = useState<string | null>(null);
  const [pendingMp3File, setPendingMp3File] = useState<File | null>(null);
  const mp3InputRef = useRef<HTMLInputElement>(null);

  // Debounce search for API calls
  const debouncedSearch = useDebounce(search, 300);

  // Build filters object
  const filters = useMemo(() => ({
    search: debouncedSearch || undefined,
    genreId: filterGenre || undefined,
  }), [debouncedSearch, filterGenre]);

  // TanStack Query hooks
  const { data: titles = [], isLoading: titlesLoading, refetch } = useMusicTitles(filters);
  const { data: genres = [], isLoading: genresLoading } = useGenres();

  const isLoading = titlesLoading || genresLoading;

  const toggleExpand = (title: string) => {
    setExpandedTitle(expandedTitle === title ? null : title);
  };

  const openTitleMetaModal = (title: MusicTitle) => {
    setEditingTitle(title);
    setTitleMetaForm({
      youtubeUrl: title.youtubeUrl || '',
      description: title.description || '',
      durationStr: formatDurationForForm(title.durationSeconds),
      grade: title.grade || '',
      genreIds: title.genres?.map(g => g.id) || [],
      isShared: title.isShared || false,
    });
    setCurrentMp3Path(title.mp3FilePath || null);
    setPendingMp3File(null);
    setYoutubeMeta(null);
  };

  const fetchYouTubeMetadata = async () => {
    if (!titleMetaForm.youtubeUrl) return;

    setFetchingYouTube(true);
    try {
      const meta = await getYouTubeMeta(titleMetaForm.youtubeUrl);
      setYoutubeMeta({ title: meta.title, author: meta.author });
    } catch (error: any) {
      showError(error.response?.data?.error || t('titles.errorFetchYouTube'));
    } finally {
      setFetchingYouTube(false);
    }
  };

  const handleSaveTitleMeta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTitle) return;

    setSaving(true);
    try {
      // First save metadata and get the title ID
      const result = await updateTitleMeta({
        title: editingTitle.title,
        arranger: editingTitle.arranger,
        youtubeUrl: titleMetaForm.youtubeUrl || null,
        description: titleMetaForm.description || null,
        durationSeconds: parseDuration(titleMetaForm.durationStr),
        grade: titleMetaForm.grade || null,
        genreIds: titleMetaForm.genreIds,
        isShared: titleMetaForm.isShared,
      });

      // If there's a pending MP3 file, upload it now
      if (pendingMp3File && result.id) {
        try {
          await uploadTitleMp3(result.id, pendingMp3File);
          showSuccess(t('titles.metadataSaved') + ' + MP3');
        } catch (mp3Error: any) {
          showSuccess(t('titles.metadataSaved'));
          showError(t('titles.errorUploadMp3') + ': ' + (mp3Error.response?.data?.error || t('errors.generic')));
        }
      } else {
        showSuccess(t('titles.metadataSaved'));
      }

      setEditingTitle(null);
      setPendingMp3File(null);
      refetch();
    } catch (error: any) {
      showError(error.response?.data?.error || t('titles.errorSaveMetadata'));
    } finally {
      setSaving(false);
    }
  };

  const handleMp3Upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editingTitle?.id) return;

    setUploadingMp3(true);
    try {
      const result = await uploadTitleMp3(editingTitle.id, file);
      setCurrentMp3Path(result.mp3FilePath);
      showSuccess(t('titles.mp3Uploaded'));
    } catch (error: any) {
      showError(error.response?.data?.error || t('titles.errorUploadMp3'));
    } finally {
      setUploadingMp3(false);
      if (mp3InputRef.current) {
        mp3InputRef.current.value = '';
      }
    }
  };

  const handleMp3Delete = async () => {
    if (!editingTitle?.id || !currentMp3Path) return;

    if (!confirm(t('titles.confirmDeleteMp3'))) return;

    try {
      await deleteTitleMp3(editingTitle.id);
      setCurrentMp3Path(null);
      showSuccess(t('titles.mp3Deleted'));
    } catch (error: any) {
      showError(error.response?.data?.error || t('titles.errorDeleteMp3'));
    }
  };

  const toggleGenre = (genreId: string) => {
    setTitleMetaForm(f => ({
      ...f,
      genreIds: f.genreIds.includes(genreId)
        ? f.genreIds.filter(id => id !== genreId)
        : [...f.genreIds, genreId],
    }));
  };

  if (isLoading) {
    return (
      <div>
        <div className="flex justify-between items-center mb-3">
          <h1>{t('titles.title')}</h1>
        </div>
        <SkeletonTable rows={10} columns={5} />
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <h1>
          {t('titles.title')}
          <span className="badge badge-primary badge-title-count">
            {titles.length}
          </span>
        </h1>
      </div>

      <div className="card mb-2">
        <div className="card-body">
          <div className="filter-bar">
            <div className="form-group filter-search">
              <input
                type="text"
                className="form-control"
                placeholder={t('titles.searchPlaceholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="form-group">
              <select
                className="form-control form-select"
                value={filterGenre}
                onChange={(e) => setFilterGenre(e.target.value)}
              >
                <option value="">{t('titles.allGenres')}</option>
                {genres.map((genre) => (
                  <option key={genre.id} value={genre.id}>
                    {genre.name}
                  </option>
                ))}
              </select>
            </div>
            {(search || filterGenre) && (
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => {
                  setSearch('');
                  setFilterGenre('');
                }}
              >
                {t('titles.clearFilters')}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-body flush">
          {titles.length > 0 ? (
            <table className="table mb-0">
              <thead>
                <tr>
                  <th style={{ width: '30px' }}></th>
                  <th>{t('myMusic.table.title')}</th>
                  <th>{t('titles.arranger')}</th>
                  <th>{t('titles.genres')}</th>
                  <th>{t('titles.grade')}</th>
                  <th>{t('titles.duration')}</th>
                  <th>{t('titles.parts')}</th>
                  <th>{t('titles.lists')}</th>
                  <th style={{ width: '50px' }}></th>
                </tr>
              </thead>
              <tbody>
                {titles.map((title) => (
                  <TitleRow
                    key={`${title.title}-${title.arranger}`}
                    title={title}
                    isExpanded={expandedTitle === `${title.title}-${title.arranger}`}
                    onToggle={() => toggleExpand(`${title.title}-${title.arranger}`)}
                    onEdit={() => openTitleMetaModal(title)}
                  />
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-state">
              <div className="empty-icon">🎵</div>
              <p>{t('titles.noTitles')}</p>
            </div>
          )}
        </div>
      </div>

      {/* Edit Title Metadata Modal */}
      {editingTitle && (
        <Modal
          title={t('titles.editMetadata')}
          onClose={() => setEditingTitle(null)}
          footer={
            <>
              <button type="button" className="btn btn-outline" onClick={() => setEditingTitle(null)}>
                {t('common.cancel')}
              </button>
              <button type="submit" form="edit-title-meta-form" className="btn btn-primary" disabled={saving}>
                {saving ? `${t('common.save')}...` : t('common.save')}
              </button>
            </>
          }
        >
          <form id="edit-title-meta-form" onSubmit={handleSaveTitleMeta}>
            <div className="form-group">
              <label className="form-label">{t('myMusic.table.title')}</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  className="form-control"
                  value={editingTitle.title}
                  disabled
                  style={{ flex: 1 }}
                />
                <div className="dropdown" style={{ position: 'relative' }}>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={(e) => {
                      const dropdown = e.currentTarget.nextElementSibling as HTMLElement;
                      dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
                    }}
                    title={t('titles.searchOnSites')}
                  >
                    🔍
                  </button>
                  <div
                    style={{
                      display: 'none',
                      position: 'absolute',
                      right: 0,
                      top: '100%',
                      background: 'white',
                      border: '1px solid var(--border)',
                      borderRadius: '0.25rem',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                      zIndex: 1000,
                      minWidth: '200px',
                    }}
                  >
                    <div style={{ padding: '0.5rem', borderBottom: '1px solid var(--border)', fontWeight: 'bold', fontSize: '0.875rem' }}>
                      {t('titles.searchOnSites')}:
                    </div>
                    {searchSheetMusicWebsites(editingTitle.title).map((site) => (
                      <a
                        key={site.name}
                        href={site.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: 'block',
                          padding: '0.5rem 1rem',
                          color: 'inherit',
                          textDecoration: 'none',
                          borderBottom: '1px solid var(--border)',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--background)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'white')}
                      >
                        {site.name}
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            {editingTitle.arranger && (
              <div className="form-group">
                <label className="form-label">{t('titles.arranger')}</label>
                <input
                  type="text"
                  className="form-control"
                  value={editingTitle.arranger}
                  disabled
                />
              </div>
            )}
            <div className="form-group">
              <label className="form-label">{t('titles.youtubeUrl')}</label>
              <div className="flex gap-2">
                <input
                  type="url"
                  className="form-control"
                  value={titleMetaForm.youtubeUrl}
                  onChange={(e) => {
                    setTitleMetaForm(f => ({ ...f, youtubeUrl: e.target.value }));
                    setYoutubeMeta(null);
                  }}
                  placeholder="https://www.youtube.com/watch?v=..."
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={fetchYouTubeMetadata}
                  disabled={!titleMetaForm.youtubeUrl || fetchingYouTube}
                  title={t('titles.fetchVideoInfo')}
                >
                  {fetchingYouTube ? '...' : '📥'}
                </button>
              </div>
              {youtubeMeta && (
                <div className="piece-meta" style={{ marginTop: '0.5rem', padding: '0.5rem', background: 'var(--background)', borderRadius: '0.25rem' }}>
                  <strong>{youtubeMeta.title}</strong>
                  <div>{t('titles.by')}: {youtubeMeta.author}</div>
                </div>
              )}
            </div>
            <div className="grid grid-2">
              <div className="form-group">
                <label className="form-label">{t('titles.durationFormat')}</label>
                <input
                  type="text"
                  className="form-control"
                  value={titleMetaForm.durationStr}
                  onChange={(e) => setTitleMetaForm(f => ({ ...f, durationStr: e.target.value }))}
                  placeholder="3:45"
                  pattern="[0-9]{1,2}:[0-9]{2}(:[0-9]{2})?"
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t('titles.difficulty')}</label>
                <input
                  type="text"
                  className="form-control"
                  value={titleMetaForm.grade}
                  onChange={(e) => setTitleMetaForm(f => ({ ...f, grade: e.target.value }))}
                  placeholder={t('titles.difficultyPlaceholder')}
                />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">{t('titles.mp3Preview')}</label>
              {currentMp3Path ? (
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <audio
                    controls
                    src={getMp3Url(currentMp3Path)}
                    style={{ flex: 1, height: '40px' }}
                  />
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={handleMp3Delete}
                    title={t('common.delete')}
                  >
                    🗑
                  </button>
                </div>
              ) : pendingMp3File ? (
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.5rem', background: 'var(--background)', borderRadius: '0.25rem' }}>
                  <span style={{ flex: 1 }}>
                    📎 {pendingMp3File.name}
                    <span style={{ color: 'var(--text-light)', marginLeft: '0.5rem', fontSize: '0.875rem' }}>
                      ({(pendingMp3File.size / 1024 / 1024).toFixed(1)} MB)
                    </span>
                  </span>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => {
                      setPendingMp3File(null);
                      if (mp3InputRef.current) mp3InputRef.current.value = '';
                    }}
                    title={t('common.delete')}
                  >
                    ×
                  </button>
                </div>
              ) : (
                <div>
                  <input
                    ref={mp3InputRef}
                    type="file"
                    accept=".mp3,audio/mpeg"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        if (editingTitle?.id) {
                          handleMp3Upload(e);
                        } else {
                          setPendingMp3File(file);
                        }
                      }
                    }}
                    disabled={uploadingMp3}
                    style={{ display: 'none' }}
                  />
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => mp3InputRef.current?.click()}
                    disabled={uploadingMp3}
                  >
                    {uploadingMp3 ? t('upload.uploading') : `📤 ${t('titles.selectMp3')}`}
                  </button>
                  {!editingTitle?.id && (
                    <span style={{ marginLeft: '0.5rem', color: 'var(--text-light)', fontSize: '0.875rem' }}>
                      {t('titles.uploadOnSave')}
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">{t('titles.description')}</label>
              <textarea
                className="form-control"
                value={titleMetaForm.description}
                onChange={(e) => setTitleMetaForm(f => ({ ...f, description: e.target.value }))}
                rows={3}
                placeholder={t('titles.descriptionPlaceholder')}
              />
            </div>
            <div className="form-group">
              <label className="form-label">{t('titles.genres')}</label>
              <div className="checkbox-grid" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {genres.map((genre) => (
                  <label
                    key={genre.id}
                    className="checkbox-item"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '0.25rem 0.5rem',
                      background: titleMetaForm.genreIds.includes(genre.id) ? 'var(--primary)' : 'var(--background)',
                      color: titleMetaForm.genreIds.includes(genre.id) ? 'white' : 'inherit',
                      borderRadius: '0.25rem',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={titleMetaForm.genreIds.includes(genre.id)}
                      onChange={() => toggleGenre(genre.id)}
                      style={{ display: 'none' }}
                    />
                    {genre.name}
                  </label>
                ))}
              </div>
            </div>
            <div className="form-group">
              <label className="form-check" style={{ cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  className="form-check-input"
                  checked={titleMetaForm.isShared}
                  onChange={(e) => setTitleMetaForm(f => ({ ...f, isShared: e.target.checked }))}
                />
                <span style={{ marginLeft: '0.5rem' }}>
                  {t('titles.sharingAllowed')}
                </span>
              </label>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

interface TitleRowProps {
  title: MusicTitle;
  isExpanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
}

function TitleRow({ title, isExpanded, onToggle, onEdit }: TitleRowProps) {
  const hasDetails = (title.lists && title.lists.length > 0) ||
                     title.youtubeUrl ||
                     title.mp3FilePath ||
                     title.description ||
                     (title.instruments && title.instruments.length > 0);

  return (
    <>
      <tr
        style={{ cursor: hasDetails ? 'pointer' : 'default' }}
        onClick={hasDetails ? onToggle : undefined}
      >
        <td style={{ width: '30px', textAlign: 'center' }}>
          {hasDetails && (
            <span style={{ opacity: 0.5 }}>{isExpanded ? '▼' : '▶'}</span>
          )}
        </td>
        <td>
          <strong>{title.title}</strong>
          {title.isShared && (
            <span className="badge badge-info" style={{ marginLeft: '0.5rem', fontSize: '0.7rem' }}>
              Gedeeld
            </span>
          )}
        </td>
        <td>{title.arranger || '-'}</td>
        <td>
          <div className="tags">
            {title.genres && title.genres.length > 0 ? (
              title.genres.map((genre) => (
                <span key={genre.id} className="tag">{genre.name}</span>
              ))
            ) : (
              <span style={{ color: 'var(--text-light)' }}>-</span>
            )}
          </div>
        </td>
        <td>{title.grade || '-'}</td>
        <td>
          {title.durationSeconds > 0
            ? formatDuration(title.durationSeconds)
            : '-'}
        </td>
        <td>
          <span className="badge badge-secondary">{title.pieceCount}</span>
        </td>
        <td>
          {title.lists && title.lists.length > 0 ? (
            <span className="badge badge-primary">{title.lists.length}</span>
          ) : (
            <span style={{ color: 'var(--text-light)' }}>-</span>
          )}
        </td>
        <td onClick={(e) => e.stopPropagation()}>
          <button
            className="btn btn-outline btn-sm"
            onClick={onEdit}
            title="Bewerk metadata"
          >
            ✏
          </button>
        </td>
      </tr>
      {isExpanded && hasDetails && (
        <tr className="expanded-row">
          <td></td>
          <td colSpan={8}>
            <div className="expanded-content" style={{
              padding: '1rem',
              backgroundColor: 'var(--bg-secondary)',
              borderRadius: '4px',
              margin: '0.5rem 0'
            }}>
              {title.instruments && title.instruments.length > 0 && (
                <div style={{ marginBottom: '0.75rem' }}>
                  <strong>Instrumenten:</strong>{' '}
                  {title.instruments.join(', ')}
                </div>
              )}

              {title.mp3FilePath && (
                <div style={{ marginBottom: '0.75rem' }}>
                  <strong>MP3 Preview:</strong>
                  <audio
                    controls
                    src={getMp3Url(title.mp3FilePath)}
                    style={{ display: 'block', marginTop: '0.5rem', maxWidth: '400px' }}
                  />
                </div>
              )}

              {title.youtubeUrl && (
                <div style={{ marginBottom: '0.75rem' }}>
                  <strong>YouTube:</strong>{' '}
                  <a href={title.youtubeUrl} target="_blank" rel="noopener noreferrer">
                    {title.youtubeUrl}
                  </a>
                </div>
              )}

              {title.description && (
                <div style={{ marginBottom: '0.75rem' }}>
                  <strong>Beschrijving:</strong>{' '}
                  {title.description}
                </div>
              )}

              {title.lists && title.lists.length > 0 && (
                <div>
                  <strong>Voorkomend in lijsten:</strong>
                  <div className="tags" style={{ marginTop: '0.5rem' }}>
                    {title.lists.map((list) => (
                      <span key={list.id} className="tag">
                        {list.orchestra_name}: {list.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
