import type { MusicaInfoSearchResult, MusicaInfoDetail } from '../../api';
import type { MusicTitle } from '../../types';

// Format seconds to mm:ss string for form input
function formatDurationForForm(seconds: number): string {
  if (!seconds || seconds <= 0) return '';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export interface TitleMetaForm {
  youtubeUrl: string;
  description: string;
  durationStr: string;
  grade: string;
  genreIds: string[];
  isShared: boolean;
  internalNotes: string;
}

// Consolidated state interface for better state management
export interface MusicTitlesState {
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

export type MusicTitlesAction =
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

export const initialState: MusicTitlesState = {
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

export function musicTitlesReducer(state: MusicTitlesState, action: MusicTitlesAction): MusicTitlesState {
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
