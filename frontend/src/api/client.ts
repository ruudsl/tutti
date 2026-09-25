/**
 * API Client Module
 *
 * Configures and exports an Axios instance for making API requests.
 * Handles authentication token injection and automatic logout on 401 responses.
 *
 * @module api/client
 */

import axios from 'axios';
// De gedeelde i18next-instantie die i18n.ts inricht; hier alleen voor t(), zonder
// de vertaalbestanden zelf mee te trekken.
import i18n from 'i18next';

/** Base URL for API requests, configurable via VITE_API_URL environment variable */
const API_BASE = import.meta.env.VITE_API_URL || '/api';

/**
 * Pre-configured Axios instance for API communication.
 *
 * @description Axios client with the following features:
 * - Base URL configured from environment
 * - 15 second timeout
 * - Automatic JWT token injection via request interceptor
 * - Automatic logout redirect on 401 responses
 *
 * @example
 * import api from './client';
 *
 * // GET request
 * const { data } = await api.get('/users');
 *
 * // POST request
 * const { data } = await api.post('/users', { name: 'John' });
 */
export const api = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * De vaste code die de server meestuurt als een upload de opslaggrens van de
 * vereniging overschrijdt (413). De melding van de server is Nederlands; met
 * de code maakt de client er de melding in de taal van de gebruiker van, op de
 * plek waar elk scherm hem al leest: `error.response.data.error`.
 */
export const OPSLAGLIMIET_CODE = 'OPSLAGLIMIET_BEREIKT';

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // A 401 from the login endpoint itself means "wrong credentials" and must
    // not trigger the logout redirect (the login page shows the error).
    const isLoginRequest = error.config?.url?.includes('/auth/login');
    if (error.response?.status === 401 && !isLoginRequest) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    const data = error.response?.data;
    if (error.response?.status === 413 && data && typeof data === 'object' && data.code === OPSLAGLIMIET_CODE) {
      data.error = i18n.t('opslag.limietBereikt');
    }
    return Promise.reject(error);
  },
);

export default api;
