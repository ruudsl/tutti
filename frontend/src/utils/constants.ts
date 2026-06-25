/**
 * Application Constants Module
 *
 * Defines constant values used throughout the application including
 * user roles, route paths, API endpoints, and configuration defaults.
 *
 * @module utils/constants
 */

/**
 * User role identifiers.
 *
 * @description Defines the available roles in the system. Roles determine
 * user permissions and access levels throughout the application.
 */
export const ROLES = {
  ADMIN: 'admin',
  BOARD: 'board',
  MUSIC_COMMITTEE: 'music_committee',
  EQUIPMENT_COMMITTEE: 'equipment_committee',
  UNIFORMS_COMMITTEE: 'uniforms_committee',
  CONDUCTOR: 'conductor',
  MEMBER: 'member',
} as const;

/** Type representing valid role values */
export type Role = typeof ROLES[keyof typeof ROLES];

/**
 * Application route paths.
 *
 * @description Defines the URL paths for main application routes.
 * Use these constants instead of hardcoded strings for type safety and maintainability.
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
 * API endpoint paths.
 *
 * @description Defines the API endpoint paths relative to the API base URL.
 * Organized by domain (auth, users, etc.).
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
 * Local storage keys.
 *
 * @description Keys used for storing data in browser localStorage.
 * Use these constants to avoid key collisions and typos.
 */
export const STORAGE_KEYS = {
  TOKEN: 'token',
  USER: 'user',
} as const;

/**
 * Pagination configuration defaults.
 *
 * @description Default values for pagination throughout the application.
 * Use these when implementing paginated lists and tables.
 */
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 25,
  MAX_LIMIT: 100,
} as const;
