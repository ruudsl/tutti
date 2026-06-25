/**
 * Error Handling Utilities Module
 *
 * Provides error handling utilities including custom error classes,
 * type guards, and error message extraction functions.
 *
 * @module utils/errorHandling
 */

import { AxiosError } from 'axios';

/**
 * Structure of API error responses from the backend.
 */
export interface ApiErrorResponse {
  /** Human-readable error message */
  error: string;
  /** Additional error details */
  details?: string;
  /** Machine-readable error code */
  code?: string;
}

/**
 * Custom application error class with additional metadata.
 *
 * @description Extends Error with status code, error code, and optional details.
 * Useful for consistent error handling throughout the application.
 * @example
 * throw new AppError('User not found', 'NOT_FOUND', 404);
 * throw new AppError('Validation failed', 'VALIDATION_ERROR', 422, 'Email is required');
 */
export class AppError extends Error {
  /**
   * Creates a new AppError instance.
   *
   * @param {string} message - Human-readable error message
   * @param {string} [code='UNKNOWN_ERROR'] - Machine-readable error code
   * @param {number} [statusCode=500] - HTTP status code
   * @param {string} [details] - Additional error details
   */
  constructor(
    message: string,
    public readonly code: string = 'UNKNOWN_ERROR',
    public readonly statusCode: number = 500,
    public readonly details?: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/**
 * Type guard for Axios errors.
 *
 * @description Checks if an error is an Axios error with an API error response.
 * @param {unknown} error - Error to check
 * @returns {boolean} True if the error is an AxiosError
 * @example
 * try {
 *   await api.get('/users');
 * } catch (error) {
 *   if (isAxiosError(error)) {
 *     console.log(error.response?.status);
 *   }
 * }
 */
export function isAxiosError(error: unknown): error is AxiosError<ApiErrorResponse> {
  return (
    typeof error === 'object' &&
    error !== null &&
    'isAxiosError' in error &&
    (error as AxiosError).isAxiosError === true
  );
}

/**
 * Type guard for AppError instances.
 *
 * @description Checks if an error is an instance of AppError.
 * @param {unknown} error - Error to check
 * @returns {boolean} True if the error is an AppError
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function getErrorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    if (error.response?.data?.error) {
      return error.response.data.error;
    }
    if (error.message) {
      return error.message;
    }
    return 'Er is een netwerkfout opgetreden';
  }

  if (isAppError(error)) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'Er is een onbekende fout opgetreden';
}

export function getErrorCode(error: unknown): string {
  if (isAxiosError(error)) {
    if (error.response?.status === 401) return 'UNAUTHORIZED';
    if (error.response?.status === 403) return 'FORBIDDEN';
    if (error.response?.status === 404) return 'NOT_FOUND';
    if (error.response?.status === 409) return 'CONFLICT';
    if (error.response?.status === 422) return 'VALIDATION_ERROR';
    if (error.response?.status && error.response.status >= 500) return 'SERVER_ERROR';
    if (error.code === 'ECONNABORTED') return 'TIMEOUT';
    if (!error.response) return 'NETWORK_ERROR';
    return error.response?.data?.code || 'API_ERROR';
  }

  if (isAppError(error)) {
    return error.code;
  }

  return 'UNKNOWN_ERROR';
}

export function getHttpStatus(error: unknown): number {
  if (isAxiosError(error) && error.response?.status) {
    return error.response.status;
  }

  if (isAppError(error)) {
    return error.statusCode;
  }

  return 500;
}

export function handleApiError(error: unknown, fallbackMessage?: string): never {
  const message = getErrorMessage(error) || fallbackMessage || 'Er is een fout opgetreden';
  const code = getErrorCode(error);
  const status = getHttpStatus(error);

  throw new AppError(message, code, status);
}

export function logError(error: unknown, context?: string): void {
  const message = getErrorMessage(error);
  const code = getErrorCode(error);

  if (process.env.NODE_ENV === 'development') {
    console.error(`[${code}]${context ? ` ${context}:` : ''} ${message}`, error);
  }
}
