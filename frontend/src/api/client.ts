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

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
