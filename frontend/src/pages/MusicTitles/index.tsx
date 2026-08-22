import { useReducer, useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useConfirm } from '../../hooks/useConfirm';
import { useMusicTitles } from '../../hooks/useMusicTitles';
import { useGenres } from '../../hooks/useGenres';
import {
  updateTitleMeta,
  getYouTubeMeta,
  uploadTitleMp3,
  deleteTitleMp3,
  searchMusicaInfo,
  getMusicaInfoDetail,
} from '../../api';
import type { MusicaInfoDetail } from '../../api';
import { SkeletonTable } from '../../components/Skeleton';
import { EmptyState } from '../../components/EmptyState';
import { useDebounce } from '../../hooks/useDebounce';
import { parseDuration } from '../../utils/format';
import { showSuccess, showError } from '../../utils/toast';
import type { MusicTitle } from '../../types';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { Modal } from '../../components/Modal';
import { StreamingLinkEditor } from '../../components/StreamingLinkEditor';
import { ImslpSearch } from '../../components/ImslpSearch';
import { initialState, musicTitlesReducer } from './musicTitlesReducer';
import { TitleRow } from './TitleRow';
import { TitleMetaModal } from './TitleMetaModal';

// Number of table rows rendered per incremental batch
const TITLES_BATCH_SIZE = 100;

export default function MusicTitles() {
  const { t } = useTranslation();
  const confirmDialog = useConfirm();
  useDocumentTitle('pageTitle.titles');
  const mp3InputRef = useRef<HTMLInputElement>(null);

  // Use reducer for consolidated state management
  const [state, dispatch] = useReducer(musicTitlesReducer, initialState);

  // Destructure state for easier access
  const {
    search,
    filterGenre,
    expandedTitle,
    editingTitle,
    titleMetaForm,
    currentMp3Path,
    pendingMp3File,
    showImslpSearch,
    imslpSearchTitle,
    showStreamingEditor,
  } = state;

  // Debounce search for API calls
  const debouncedSearch = useDebounce(search, 300);

  // Build filters object
  const filters = useMemo(
    () => ({
      search: debouncedSearch || undefined,
      genreId: filterGenre || undefined,
    }),
    [debouncedSearch, filterGenre],
  );

  // TanStack Query hooks
  const { data: titles = [], isLoading: titlesLoading, refetch } = useMusicTitles(filters);
  const { data: genres = [], isLoading: genresLoading } = useGenres();

  const isLoading = titlesLoading || genresLoading;

  // Incremental rendering: only mount the first batch of (expandable) table
  // rows and grow the list as the user scrolls. Keeps the DOM small for
  // large title collections without breaking the table layout.
  const [visibleCount, setVisibleCount] = useState(TITLES_BATCH_SIZE);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  // Reset the visible window when the filtered result set changes
  useEffect(() => {
    setVisibleCount(TITLES_BATCH_SIZE);
  }, [debouncedSearch, filterGenre]);

  const visibleTitles = useMemo(() => titles.slice(0, visibleCount), [titles, visibleCount]);
  const hasMoreTitles = titles.length > visibleCount;

  const showMoreTitles = useCallback(() => {
    setVisibleCount((count) => count + TITLES_BATCH_SIZE);
  }, []);

  // Automatically grow the list when the sentinel below the table nears the viewport
  useEffect(() => {
    if (!hasMoreTitles) return;
    const sentinel = loadMoreRef.current;
    if (!sentinel || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          showMoreTitles();
        }
      },
      { rootMargin: '400px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMoreTitles, showMoreTitles]);

  const toggleExpand = useCallback(
    (title: string) => {
      dispatch({ type: 'SET_EXPANDED_TITLE', payload: expandedTitle === title ? null : title });
    },
    [expandedTitle],
  );

  const openTitleMetaModal = useCallback((title: MusicTitle) => {
    dispatch({ type: 'OPEN_EDIT_MODAL', payload: title });
  }, []);

  const searchOnMusicaInfo = useCallback(async () => {
    if (!editingTitle) return;
    dispatch({ type: 'MUSICAINFO_SEARCH_START' });
    try {
      const data = await searchMusicaInfo(editingTitle.title);
      dispatch({ type: 'MUSICAINFO_SEARCH_SUCCESS', payload: { results: data.results, searchUrl: data.searchUrl } });
    } catch (error: any) {
      dispatch({
        type: 'MUSICAINFO_SEARCH_ERROR',
        payload: error.response?.data?.error || t('titles.musicaInfoError'),
      });
    }
  }, [editingTitle, t]);

  const loadMusicaInfoDetail = useCallback(
    async (artnr: string) => {
      dispatch({ type: 'MUSICAINFO_LOAD_DETAIL_START', payload: artnr });
      try {
        const detail = await getMusicaInfoDetail(artnr);
        dispatch({ type: 'MUSICAINFO_LOAD_DETAIL_SUCCESS', payload: detail });
      } catch (error: any) {
        dispatch({
          type: 'MUSICAINFO_LOAD_DETAIL_ERROR',
          payload: error.response?.data?.error || t('titles.musicaInfoError'),
        });
      }
    },
    [t],
  );

  const applyMusicaInfoDetail = useCallback((detail: MusicaInfoDetail) => {
    dispatch({ type: 'MUSICAINFO_APPLY_DETAIL', payload: detail });
  }, []);

  const fetchYouTubeMetadata = useCallback(async () => {
    if (!titleMetaForm.youtubeUrl) return;

    dispatch({ type: 'SET_FETCHING_YOUTUBE', payload: true });
    try {
      const meta = await getYouTubeMeta(titleMetaForm.youtubeUrl);
      dispatch({ type: 'SET_YOUTUBE_META', payload: { title: meta.title, author: meta.author } });
    } catch (error: any) {
      showError(error.response?.data?.error || t('titles.errorFetchYouTube'));
    } finally {
      dispatch({ type: 'SET_FETCHING_YOUTUBE', payload: false });
    }
  }, [titleMetaForm.youtubeUrl, t]);

  const handleSaveTitleMeta = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!editingTitle) return;

      dispatch({ type: 'SET_SAVING', payload: true });
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
          internalNotes: titleMetaForm.internalNotes || null,
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

        dispatch({ type: 'CLOSE_EDIT_MODAL' });
        refetch();
      } catch (error: any) {
        showError(error.response?.data?.error || t('titles.errorSaveMetadata'));
      } finally {
        dispatch({ type: 'SET_SAVING', payload: false });
      }
    },
    [editingTitle, titleMetaForm, pendingMp3File, t, refetch],
  );

  const handleMp3Upload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !editingTitle?.id) return;

      dispatch({ type: 'SET_UPLOADING_MP3', payload: true });
      try {
        const result = await uploadTitleMp3(editingTitle.id, file);
        dispatch({ type: 'SET_CURRENT_MP3_PATH', payload: result.mp3FilePath });
        showSuccess(t('titles.mp3Uploaded'));
      } catch (error: any) {
        showError(error.response?.data?.error || t('titles.errorUploadMp3'));
      } finally {
        dispatch({ type: 'SET_UPLOADING_MP3', payload: false });
        if (mp3InputRef.current) {
          mp3InputRef.current.value = '';
        }
      }
    },
    [editingTitle?.id, t],
  );

  const handleMp3Delete = useCallback(async () => {
    if (!editingTitle?.id || !currentMp3Path) return;

    if (!(await confirmDialog(t('titles.confirmDeleteMp3')))) return;

    try {
      await deleteTitleMp3(editingTitle.id);
      dispatch({ type: 'SET_CURRENT_MP3_PATH', payload: null });
      showSuccess(t('titles.mp3Deleted'));
    } catch (error: any) {
      showError(error.response?.data?.error || t('titles.errorDeleteMp3'));
    }
  }, [editingTitle?.id, currentMp3Path, t, confirmDialog]);

  const toggleGenre = useCallback(
    (genreId: string) => {
      dispatch({
        type: 'UPDATE_TITLE_META_FORM',
        payload: {
          genreIds: titleMetaForm.genreIds.includes(genreId)
            ? titleMetaForm.genreIds.filter((id) => id !== genreId)
            : [...titleMetaForm.genreIds, genreId],
        },
      });
    },
    [titleMetaForm.genreIds],
  );

  if (isLoading) {
    return (
      <div>
        <div className="page-header">
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
          <span className="badge badge-primary badge-title-count">{titles.length}</span>
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
                onChange={(e) => dispatch({ type: 'SET_SEARCH', payload: e.target.value })}
              />
            </div>
            <div className="form-group">
              <select
                className="form-control form-select"
                value={filterGenre}
                onChange={(e) => dispatch({ type: 'SET_FILTER_GENRE', payload: e.target.value })}
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
              <button type="button" className="btn btn-outline" onClick={() => dispatch({ type: 'CLEAR_FILTERS' })}>
                {t('titles.clearFilters')}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-body flush">
          {titles.length > 0 ? (
            <>
              <table className="table mb-0">
                <thead>
                  <tr>
                    <th scope="col" style={{ width: '30px' }}></th>
                    <th scope="col">{t('myMusic.table.title')}</th>
                    <th scope="col">{t('titles.arranger')}</th>
                    <th scope="col">{t('titles.genres')}</th>
                    <th scope="col">{t('titles.grade')}</th>
                    <th scope="col">{t('titles.duration')}</th>
                    <th scope="col">{t('titles.parts')}</th>
                    <th scope="col">{t('titles.lists')}</th>
                    <th scope="col" style={{ width: '50px' }}>
                      <span className="sr-only">{t('common.actions')}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleTitles.map((title) => (
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
              {hasMoreTitles && (
                <div ref={loadMoreRef} style={{ display: 'flex', justifyContent: 'center', padding: '1rem' }}>
                  <button type="button" className="btn btn-outline" onClick={showMoreTitles}>
                    {t('common.more')} ({titles.length - visibleTitles.length})
                  </button>
                </div>
              )}
            </>
          ) : (
            <EmptyState icon="music" title={t('titles.noTitles')} description={t('titles.noTitlesDescription')} />
          )}
        </div>
      </div>

      {/* Edit Title Metadata Modal */}
      {editingTitle && (
        <TitleMetaModal
          editingTitle={editingTitle}
          state={state}
          genres={genres}
          dispatch={dispatch}
          mp3InputRef={mp3InputRef}
          onSubmit={handleSaveTitleMeta}
          onSearchMusicaInfo={searchOnMusicaInfo}
          onLoadMusicaInfoDetail={loadMusicaInfoDetail}
          onApplyMusicaInfoDetail={applyMusicaInfoDetail}
          onFetchYouTube={fetchYouTubeMetadata}
          onMp3Upload={handleMp3Upload}
          onMp3Delete={handleMp3Delete}
          onToggleGenre={toggleGenre}
        />
      )}

      {/* Streaming Link Editor Modal */}
      {showStreamingEditor && editingTitle?.id && (
        <Modal
          title={t('streaming.editLinks')}
          onClose={() => dispatch({ type: 'SET_SHOW_STREAMING_EDITOR', payload: false })}
        >
          <StreamingLinkEditor
            titleId={editingTitle.id}
            titleName={editingTitle.title}
            composer={editingTitle.arranger}
            currentLinks={editingTitle.streamingLinks}
            onClose={() => dispatch({ type: 'SET_SHOW_STREAMING_EDITOR', payload: false })}
            onSave={() => refetch()}
          />
        </Modal>
      )}

      {/* IMSLP Search Modal */}
      {showImslpSearch && (
        <ImslpSearch
          onClose={() => dispatch({ type: 'HIDE_IMSLP_SEARCH' })}
          initialQuery={imslpSearchTitle}
          onImportSuccess={() => {
            refetch();
          }}
        />
      )}
    </div>
  );
}
