/**
 * User roles
 */
export const ROLES = {
  ADMIN: 'admin',
  MUSIC_COMMITTEE: 'music_committee',
  EQUIPMENT_COMMITTEE: 'equipment_committee',
  UNIFORMS_COMMITTEE: 'uniforms_committee',
  CONDUCTOR: 'conductor',
  MEMBER: 'member',
} as const;

export type Role = typeof ROLES[keyof typeof ROLES];

/**
 * Route paths
 */
export const ROUTES = {
  LOGIN: '/login',
  DASHBOARD: '/',
  MY_MUSIC: '/my-music',
  MUSIC_PIECES: '/music-pieces',
  UPLOAD: '/upload',
  INSTRUMENTS: '/instruments',
  GENRES: '/genres',
  USERS: '/users',
  ORCHESTRAS: '/orchestras',
  LISTS: '/lists',
} as const;

/**
 * API endpoints
 */
export const API = {
  AUTH: {
    LOGIN: '/auth/login',
    REGISTER: '/auth/register',
    ME: '/auth/me',
  },
  USERS: '/users',
  INSTRUMENTS: '/instruments',
  GENRES: '/genres',
  ORCHESTRAS: '/orchestras',
  MUSIC_PIECES: '/music-pieces',
  MUSIC_LISTS: '/music-lists',
  ASSOCIATIONS: '/associations',
} as const;

/**
 * Local storage keys
 */
export const STORAGE_KEYS = {
  TOKEN: 'token',
  USER: 'user',
} as const;

/**
 * Pagination defaults
 */
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 25,
  MAX_LIMIT: 100,
} as const;
