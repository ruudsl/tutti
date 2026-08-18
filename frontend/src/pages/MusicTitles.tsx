import { useReducer, useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useConfirm } from '../hooks/useConfirm';
import { useMusicTitles } from '../hooks/useMusicTitles';
import { Icon } from '../components/Icon';
import { useGenres } from '../hooks/useGenres';
import {
  updateTitleMeta,
  getYouTubeMeta,
  uploadTitleMp3,
  deleteTitleMp3,
  getMp3Url,
  searchMusicaInfo,
  getMusicaInfoDetail,
} from '../api';
import type { MusicaInfoSearchResult, MusicaInfoDetail } from '../api';
import { SkeletonTable } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import { useDebounce } from '../hooks/useDebounce';
import { formatDuration, parseDuration } from '../utils/format';
import { showSuccess, showError } from '../utils/toast';
import type { MusicTitle } from '../types';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Modal } from '../components/Modal';
import { searchSheetMusicWebsites } from '../utils/sheetMusic';
import { StreamingLinks } from '../components/StreamingLinks';
import { StreamingLinkEditor } from '../components/StreamingLinkEditor';
import { ImslpSearch } from '../components/ImslpSearch';

// Number of table rows rendered per incremental batch
const TITLES_BATCH_SIZE = 100;

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
  internalNotes: string;
}

// Consolidated state interface for better state management
interface MusicTitlesState {
  // Filter state
  search: string;
  filterGenre: string;
  expandedTitle: string | null;

  // Edit modal state
  editingTitle: MusicTitle | null;
  titleMetaForm: TitleMetaForm;
  youtubeMeta: { title: string; author: string } | null;
  currentMp3Path: string | null;
  pendingMp3File: File | null;

  // Loading states
  fetchingYouTube: boolean;
  saving: boolean;
  uploadingMp3: boolean;

  // MusicaInfo state
  musicaInfoSearching: boolean;
  musicaInfoResults: MusicaInfoSearchResult[] | null;
  musicaInfoSearchUrl: string;
  musicaInfoError: string;
  musicaInfoLoadingDetail: string | null;
  musicaInfoDetail: MusicaInfoDetail | null;

  // Modal states
  showImslpSearch: boolean;
  imslpSearchTitle: string;
  showStreamingEditor: boolean;
}

type MusicTitlesAction =
  | { type: 'SET_SEARCH'; payload: string }
  | { type: 'SET_FILTER_GENRE'; payload: string }
  | { type: 'SET_EXPANDED_TITLE'; payload: string | null }
  | { type: 'CLEAR_FILTERS' }
  | { type: 'OPEN_EDIT_MODAL'; payload: MusicTitle }
  | { type: 'CLOSE_EDIT_MODAL' }
  | { type: 'UPDATE_TITLE_META_FORM'; payload: Partial<TitleMetaForm> }
  | { type: 'SET_YOUTUBE_META'; payload: { title: string; author: string } | null }
  | { type: 'SET_FETCHING_YOUTUBE'; payload: boolean }
  | { type: 'SET_SAVING'; payload: boolean }
  | { type: 'SET_UPLOADING_MP3'; payload: boolean }
  | { type: 'SET_CURRENT_MP3_PATH'; payload: string | null }
  | { type: 'SET_PENDING_MP3_FILE'; payload: File | null }
  | { type: 'MUSICAINFO_SEARCH_START' }
  | { type: 'MUSICAINFO_SEARCH_SUCCESS'; payload: { results: MusicaInfoSearchResult[]; searchUrl: string } }
  | { type: 'MUSICAINFO_SEARCH_ERROR'; payload: string }
  | { type: 'MUSICAINFO_LOAD_DETAIL_START'; payload: string }
  | { type: 'MUSICAINFO_LOAD_DETAIL_SUCCESS'; payload: MusicaInfoDetail }
  | { type: 'MUSICAINFO_LOAD_DETAIL_ERROR'; payload: string }
  | { type: 'MUSICAINFO_APPLY_DETAIL'; payload: MusicaInfoDetail }
  | { type: 'MUSICAINFO_RESET' }
  | { type: 'SHOW_IMSLP_SEARCH'; payload: string }
  | { type: 'HIDE_IMSLP_SEARCH' }
  | { type: 'SET_SHOW_STREAMING_EDITOR'; payload: boolean };

const initialState: MusicTitlesState = {
  search: '',
  filterGenre: '',
  expandedTitle: null,
  editingTitle: null,
  titleMetaForm: {
    youtubeUrl: '',
    description: '',
    durationStr: '',
    grade: '',
    genreIds: [],
    isShared: false,
    internalNotes: '',
  },
  youtubeMeta: null,
  currentMp3Path: null,
  pendingMp3File: null,
  fetchingYouTube: false,
  saving: false,
  uploadingMp3: false,
  musicaInfoSearching: false,
  musicaInfoResults: null,
  musicaInfoSearchUrl: '',
  musicaInfoError: '',
  musicaInfoLoadingDetail: null,
  musicaInfoDetail: null,
  showImslpSearch: false,
  imslpSearchTitle: '',
  showStreamingEditor: false,
};

function musicTitlesReducer(state: MusicTitlesState, action: MusicTitlesAction): MusicTitlesState {
  switch (action.type) {
    case 'SET_SEARCH':
      return { ...state, search: action.payload };
    case 'SET_FILTER_GENRE':
      return { ...state, filterGenre: action.payload };
    case 'SET_EXPANDED_TITLE':
      return { ...state, expandedTitle: action.payload };
    case 'CLEAR_FILTERS':
      return { ...state, search: '', filterGenre: '' };
    case 'OPEN_EDIT_MODAL':
      return {
        ...state,
        editingTitle: action.payload,
        titleMetaForm: {
          youtubeUrl: action.payload.youtubeUrl || '',
          description: action.payload.description || '',
          durationStr: formatDurationForForm(action.payload.durationSeconds),
          grade: action.payload.grade || '',
          genreIds: action.payload.genres?.map((g) => g.id) || [],
          isShared: action.payload.isShared || false,
          internalNotes: action.payload.internalNotes || '',
        },
        currentMp3Path: action.payload.mp3FilePath || null,
        pendingMp3File: null,
        youtubeMeta: null,
        musicaInfoResults: null,
        musicaInfoDetail: null,
        musicaInfoError: '',
      };
    case 'CLOSE_EDIT_MODAL':
      return {
        ...state,
        editingTitle: null,
        showStreamingEditor: false,
      };
    case 'UPDATE_TITLE_META_FORM':
      return { ...state, titleMetaForm: { ...state.titleMetaForm, ...action.payload } };
    case 'SET_YOUTUBE_META':
      return { ...state, youtubeMeta: action.payload };
    case 'SET_FETCHING_YOUTUBE':
      return { ...state, fetchingYouTube: action.payload };
    case 'SET_SAVING':
      return { ...state, saving: action.payload };
    case 'SET_UPLOADING_MP3':
      return { ...state, uploadingMp3: action.payload };
    case 'SET_CURRENT_MP3_PATH':
      return { ...state, currentMp3Path: action.payload };
    case 'SET_PENDING_MP3_FILE':
      return { ...state, pendingMp3File: action.payload };
    case 'MUSICAINFO_SEARCH_START':
      return {
        ...state,
        musicaInfoSearching: true,
        musicaInfoError: '',
        musicaInfoResults: null,
        musicaInfoDetail: null,
      };
    case 'MUSICAINFO_SEARCH_SUCCESS':
      return {
        ...state,
        musicaInfoSearching: false,
        musicaInfoResults: action.payload.results,
        musicaInfoSearchUrl: action.payload.searchUrl,
      };
    case 'MUSICAINFO_SEARCH_ERROR':
      return {
        ...state,
        musicaInfoSearching: false,
        musicaInfoError: action.payload,
      };
    case 'MUSICAINFO_LOAD_DETAIL_START':
      return {
        ...state,
        musicaInfoLoadingDetail: action.payload,
        musicaInfoDetail: null,
      };
    case 'MUSICAINFO_LOAD_DETAIL_SUCCESS':
      return {
        ...state,
        musicaInfoLoadingDetail: null,
        musicaInfoDetail: action.payload,
      };
    case 'MUSICAINFO_LOAD_DETAIL_ERROR':
      return {
        ...state,
        musicaInfoLoadingDetail: null,
        musicaInfoError: action.payload,
      };
    case 'MUSICAINFO_APPLY_DETAIL':
      return {
        ...state,
        titleMetaForm: {
          ...state.titleMetaForm,
          durationStr: action.payload.duration || state.titleMetaForm.durationStr,
          grade: action.payload.difficulty || state.titleMetaForm.grade,
        },
        musicaInfoResults: null,
        musicaInfoDetail: null,
      };
    case 'MUSICAINFO_RESET':
      return {
        ...state,
        musicaInfoResults: null,
        musicaInfoDetail: null,
        musicaInfoError: '',
      };
    case 'SHOW_IMSLP_SEARCH':
      return { ...state, showImslpSearch: true, imslpSearchTitle: action.payload };
    case 'HIDE_IMSLP_SEARCH':
      return { ...state, showImslpSearch: false, imslpSearchTitle: '' };
    case 'SET_SHOW_STREAMING_EDITOR':
      return { ...state, showStreamingEditor: action.payload };
    default:
      return state;
  }
}

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
    youtubeMeta,
    currentMp3Path,
    pendingMp3File,
    fetchingYouTube,
    saving,
    uploadingMp3,
    musicaInfoSearching,
    musicaInfoResults,
    musicaInfoSearchUrl,
    musicaInfoError,
    musicaInfoLoadingDetail,
    musicaInfoDetail,
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
        <Modal
          title={t('titles.editMetadata')}
          onClose={() => dispatch({ type: 'CLOSE_EDIT_MODAL' })}
          footer={
            <>
              <button type="button" className="btn btn-outline" onClick={() => dispatch({ type: 'CLOSE_EDIT_MODAL' })}>
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
                <input type="text" className="form-control" value={editingTitle.title} disabled style={{ flex: 1 }} />
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
                    <Icon name="search" size={16} />
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
                    <div
                      style={{
                        padding: '0.5rem',
                        borderBottom: '1px solid var(--border)',
                        fontWeight: 'bold',
                        fontSize: '0.875rem',
                      }}
                    >
                      {t('titles.searchOnSites')}:
                    </div>
                    <button
                      type="button"
                      onClick={() => dispatch({ type: 'SHOW_IMSLP_SEARCH', payload: editingTitle.title })}
                      style={{
                        display: 'block',
                        width: '100%',
                        padding: '0.5rem 1rem',
                        color: 'inherit',
                        textDecoration: 'none',
                        borderBottom: '1px solid var(--border)',
                        background: 'none',
                        border: 'none',
                        textAlign: 'left',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--background)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'white')}
                    >
                      {t('imslp.findOnImslp')}
                    </button>
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
                <input type="text" className="form-control" value={editingTitle.arranger} disabled />
              </div>
            )}

            {/* MusicaInfo.net lookup section */}
            <div
              className="form-group"
              style={{
                background: 'var(--background)',
                padding: '0.75rem',
                borderRadius: '0.5rem',
                border: '1px solid var(--border)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  marginBottom: musicaInfoResults || musicaInfoDetail || musicaInfoError ? '0.5rem' : 0,
                }}
              >
                <strong style={{ fontSize: '0.875rem', flex: 1 }}>MusicaInfo.net</strong>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={searchOnMusicaInfo}
                  disabled={musicaInfoSearching}
                  style={{ fontSize: '0.8rem', padding: '0.25rem 0.75rem' }}
                >
                  {musicaInfoSearching ? `${t('titles.musicaInfoSearching')}...` : t('titles.musicaInfoSearch')}
                </button>
              </div>

              {musicaInfoError && (
                <div
                  style={{
                    color: 'var(--danger)',
                    fontSize: '0.8rem',
                    padding: '0.5rem',
                    background: 'var(--danger-bg, #fee)',
                    borderRadius: '0.25rem',
                  }}
                >
                  {musicaInfoError}
                  {musicaInfoSearchUrl && (
                    <div style={{ marginTop: '0.25rem' }}>
                      <a
                        href={musicaInfoSearchUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'var(--primary)' }}
                      >
                        {t('titles.musicaInfoOpenManually')}
                      </a>
                    </div>
                  )}
                </div>
              )}

              {musicaInfoResults && musicaInfoResults.length === 0 && (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>
                  {t('titles.musicaInfoNoResults')}
                  <a
                    href={musicaInfoSearchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ marginLeft: '0.5rem', color: 'var(--primary)' }}
                  >
                    {t('titles.musicaInfoOpenManually')}
                  </a>
                </div>
              )}

              {musicaInfoResults && musicaInfoResults.length > 0 && !musicaInfoDetail && (
                <div style={{ maxHeight: '200px', overflowY: 'auto', fontSize: '0.8rem' }}>
                  {musicaInfoResults.map((result) => (
                    <div
                      key={result.articleNumber}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '0.4rem 0.5rem',
                        borderBottom: '1px solid var(--border)',
                        gap: '0.5rem',
                        cursor: 'pointer',
                      }}
                      onClick={() => loadMusicaInfoDetail(result.articleNumber)}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'white')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: 'bold',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {result.title}
                        </div>
                        {result.composer && (
                          <div style={{ color: 'var(--text-light)', fontSize: '0.75rem' }}>
                            {result.composer}
                            {result.arranger ? ` / ${result.arranger}` : ''}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        className="btn btn-outline"
                        style={{ padding: '0.15rem 0.5rem', fontSize: '0.75rem', flexShrink: 0 }}
                        disabled={musicaInfoLoadingDetail === result.articleNumber}
                      >
                        {musicaInfoLoadingDetail === result.articleNumber ? '...' : t('titles.musicaInfoSelect')}
                      </button>
                    </div>
                  ))}
                  <div style={{ padding: '0.25rem 0.5rem', textAlign: 'center' }}>
                    <a
                      href={musicaInfoSearchUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'var(--primary)', fontSize: '0.75rem' }}
                    >
                      {t('titles.musicaInfoOpenManually')}
                    </a>
                  </div>
                </div>
              )}

              {musicaInfoDetail && (
                <div
                  style={{
                    fontSize: '0.8rem',
                    background: 'white',
                    padding: '0.5rem',
                    borderRadius: '0.25rem',
                    border: '1px solid var(--border)',
                  }}
                >
                  <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>{musicaInfoDetail.title}</div>
                  {musicaInfoDetail.composer && (
                    <div>
                      {t('titles.musicaInfoComposer')}: {musicaInfoDetail.composer}
                    </div>
                  )}
                  {musicaInfoDetail.arranger && (
                    <div>
                      {t('titles.arranger')}: {musicaInfoDetail.arranger}
                    </div>
                  )}
                  {musicaInfoDetail.duration && (
                    <div>
                      {t('titles.durationFormat')}: <strong>{musicaInfoDetail.duration}</strong>
                    </div>
                  )}
                  {musicaInfoDetail.difficulty && (
                    <div>
                      {t('titles.difficulty')}: <strong>{musicaInfoDetail.difficulty}</strong>
                    </div>
                  )}
                  {musicaInfoDetail.publisher && (
                    <div>
                      {t('titles.musicaInfoPublisher')}: {musicaInfoDetail.publisher}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ fontSize: '0.8rem', padding: '0.25rem 0.75rem' }}
                      onClick={() => applyMusicaInfoDetail(musicaInfoDetail)}
                    >
                      {t('titles.musicaInfoApply')}
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline"
                      style={{ fontSize: '0.8rem', padding: '0.25rem 0.75rem' }}
                      onClick={() => dispatch({ type: 'MUSICAINFO_RESET' })}
                    >
                      {t('common.cancel')}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">{t('titles.youtubeUrl')}</label>
              <div className="flex gap-2">
                <input
                  type="url"
                  className="form-control"
                  value={titleMetaForm.youtubeUrl}
                  onChange={(e) => {
                    dispatch({ type: 'UPDATE_TITLE_META_FORM', payload: { youtubeUrl: e.target.value } });
                    dispatch({ type: 'SET_YOUTUBE_META', payload: null });
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
                  {fetchingYouTube ? '...' : <Icon name="download" size={16} />}
                </button>
              </div>
              {youtubeMeta && (
                <div
                  className="piece-meta"
                  style={{
                    marginTop: '0.5rem',
                    padding: '0.5rem',
                    background: 'var(--background)',
                    borderRadius: '0.25rem',
                  }}
                >
                  <strong>{youtubeMeta.title}</strong>
                  <div>
                    {t('titles.by')}: {youtubeMeta.author}
                  </div>
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
                  onChange={(e) =>
                    dispatch({ type: 'UPDATE_TITLE_META_FORM', payload: { durationStr: e.target.value } })
                  }
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
                  onChange={(e) => dispatch({ type: 'UPDATE_TITLE_META_FORM', payload: { grade: e.target.value } })}
                  placeholder={t('titles.difficultyPlaceholder')}
                />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">{t('titles.mp3Preview')}</label>
              {currentMp3Path ? (
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <audio controls src={getMp3Url(currentMp3Path)} style={{ flex: 1, height: '40px' }} />
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={handleMp3Delete}
                    title={t('common.delete')}
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              ) : pendingMp3File ? (
                <div
                  style={{
                    display: 'flex',
                    gap: '0.5rem',
                    alignItems: 'center',
                    padding: '0.5rem',
                    background: 'var(--background)',
                    borderRadius: '0.25rem',
                  }}
                >
                  <span style={{ flex: 1, display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Icon name="paperclip" size={16} /> {pendingMp3File.name}
                    <span style={{ color: 'var(--text-light)', marginLeft: '0.5rem', fontSize: '0.875rem' }}>
                      ({(pendingMp3File.size / 1024 / 1024).toFixed(1)} MB)
                    </span>
                  </span>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => {
                      dispatch({ type: 'SET_PENDING_MP3_FILE', payload: null });
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
                          dispatch({ type: 'SET_PENDING_MP3_FILE', payload: file });
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
                    {uploadingMp3 ? (
                      t('upload.uploading')
                    ) : (
                      <>
                        <Icon name="upload" size={16} /> {t('titles.selectMp3')}
                      </>
                    )}
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
                onChange={(e) => dispatch({ type: 'UPDATE_TITLE_META_FORM', payload: { description: e.target.value } })}
                rows={3}
                placeholder={t('titles.descriptionPlaceholder')}
              />
            </div>
            <div className="form-group">
              <label className="form-label">{t('titles.internalNotes')}</label>
              <textarea
                className="form-control"
                value={titleMetaForm.internalNotes}
                onChange={(e) =>
                  dispatch({ type: 'UPDATE_TITLE_META_FORM', payload: { internalNotes: e.target.value } })
                }
                rows={2}
                placeholder={t('titles.internalNotesPlaceholder')}
                style={{ background: 'var(--warning-bg, #fff8e1)', borderColor: 'var(--warning, #ffc107)' }}
              />
              <small className="text-light">{t('titles.internalNotesHelp')}</small>
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
                  onChange={(e) =>
                    dispatch({ type: 'UPDATE_TITLE_META_FORM', payload: { isShared: e.target.checked } })
                  }
                />
                <span style={{ marginLeft: '0.5rem' }}>{t('titles.sharingAllowed')}</span>
              </label>
            </div>

            {/* Streaming Links Section */}
            {editingTitle.id && (
              <div
                className="form-group"
                style={{
                  background: 'var(--background)',
                  padding: '0.75rem',
                  borderRadius: '0.5rem',
                  border: '1px solid var(--border)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <strong style={{ fontSize: '0.875rem' }}>{t('streaming.title')}</strong>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => dispatch({ type: 'SET_SHOW_STREAMING_EDITOR', payload: true })}
                    style={{ fontSize: '0.8rem', padding: '0.25rem 0.75rem' }}
                  >
                    {t('streaming.manageLinks')}
                  </button>
                </div>
                {editingTitle.streamingLinks && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <StreamingLinks links={editingTitle.streamingLinks} compact />
                  </div>
                )}
              </div>
            )}
          </form>
        </Modal>
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

interface TitleRowProps {
  title: MusicTitle;
  isExpanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
}

function TitleRow({ title, isExpanded, onToggle, onEdit }: TitleRowProps) {
  const { t } = useTranslation();

  const hasStreamingLinks =
    title.streamingLinks &&
    (title.streamingLinks.spotify_url ||
      title.streamingLinks.apple_music_url ||
      title.streamingLinks.youtube_music_url);

  const hasDetails =
    (title.lists && title.lists.length > 0) ||
    title.youtubeUrl ||
    title.mp3FilePath ||
    title.description ||
    hasStreamingLinks ||
    (title.instruments && title.instruments.length > 0);

  return (
    <>
      <tr style={{ cursor: hasDetails ? 'pointer' : 'default' }} onClick={hasDetails ? onToggle : undefined}>
        <td style={{ width: '30px', textAlign: 'center' }}>
          {hasDetails && <span style={{ opacity: 0.5 }}>{isExpanded ? '▼' : '▶'}</span>}
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
                <span key={genre.id} className="tag">
                  {genre.name}
                </span>
              ))
            ) : (
              <span style={{ color: 'var(--text-light)' }}>-</span>
            )}
          </div>
        </td>
        <td>{title.grade || '-'}</td>
        <td>{title.durationSeconds > 0 ? formatDuration(title.durationSeconds) : '-'}</td>
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
          <button className="btn btn-outline btn-sm" onClick={onEdit} title="Bewerk metadata">
            <Icon name="pencil" size={16} />
          </button>
        </td>
      </tr>
      {isExpanded && hasDetails && (
        <tr className="expanded-row">
          <td></td>
          <td colSpan={8}>
            <div
              className="expanded-content"
              style={{
                padding: '1rem',
                backgroundColor: 'var(--bg-secondary)',
                borderRadius: '4px',
                margin: '0.5rem 0',
              }}
            >
              {title.instruments && title.instruments.length > 0 && (
                <div style={{ marginBottom: '0.75rem' }}>
                  <strong>Instrumenten:</strong> {title.instruments.join(', ')}
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

              {hasStreamingLinks && (
                <div style={{ marginBottom: '0.75rem' }}>
                  <strong>{t('streaming.title')}:</strong>
                  <div style={{ marginTop: '0.5rem' }}>
                    <StreamingLinks links={title.streamingLinks} />
                  </div>
                </div>
              )}

              {title.description && (
                <div style={{ marginBottom: '0.75rem' }}>
                  <strong>Beschrijving:</strong> {title.description}
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
