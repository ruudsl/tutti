/**
 * API Client Module
 *
 * Configures and exports an Axios instance for making API requests.
 * Handles authentication token injection and automatic logout on 401 responses.
 *
 * @module api/client
 */

import axios from 'axios';

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
 * Code in het 403-antwoord van de backend voor een lid dat eerst een eigen
 * wachtwoord moet kiezen (middleware/auth.ts). Het wijzigen gebeurt op het
 * profiel.
 */
export const CODE_WACHTWOORD_WIJZIGEN_VERPLICHT = 'WACHTWOORD_WIJZIGEN_VERPLICHT';
export const WACHTWOORD_WIJZIGEN_PAD = '/profile';

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
    } else if (
      error.response?.status === 403 &&
      error.response?.data?.code === CODE_WACHTWOORD_WIJZIGEN_VERPLICHT &&
      window.location.pathname !== WACHTWOORD_WIJZIGEN_PAD
    ) {
      // Niet opnieuw laden als het lid er al is: het profiel zelf doet ook
      // verzoeken die deze 403 krijgen.
      window.location.href = WACHTWOORD_WIJZIGEN_PAD;
    }
    return Promise.reject(error);
  },
);

export default api;
