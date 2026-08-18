import type { AxiosError } from 'axios';
import type { TFunction } from 'i18next';

interface ApiErrorResponse {
  error?: string;
  message?: string;
  details?: string;
  code?: string;
}

/**
 * Error codes that can be returned by the API
 */
export type ApiErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'VALIDATION_ERROR'
  | 'SERVER_ERROR'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'UNKNOWN_ERROR';

/**
 * Map of error codes to translation keys
 */
const ERROR_CODE_TRANSLATIONS: Record<ApiErrorCode, string> = {
  UNAUTHORIZED: 'errors.unauthorized',
  FORBIDDEN: 'errors.forbidden',
  NOT_FOUND: 'errors.notFound',
  CONFLICT: 'errors.conflict',
  VALIDATION_ERROR: 'errors.validation',
  SERVER_ERROR: 'errors.serverError',
  NETWORK_ERROR: 'errors.network',
  TIMEOUT: 'errors.timeout',
  UNKNOWN_ERROR: 'errors.generic',
};

/**
 * Fallback error messages in different languages
 */
const FALLBACK_MESSAGES: Record<string, Record<ApiErrorCode, string>> = {
  nl: {
    UNAUTHORIZED: 'Je sessie is verlopen. Log opnieuw in.',
    FORBIDDEN: 'Je hebt geen toegang tot deze actie.',
    NOT_FOUND: 'Niet gevonden.',
    CONFLICT: 'Er bestaat al een item met deze gegevens.',
    VALIDATION_ERROR: 'Controleer de ingevoerde gegevens.',
    SERVER_ERROR: 'Er is een serverfout opgetreden.',
    NETWORK_ERROR: 'Netwerkfout. Controleer je internetverbinding.',
    TIMEOUT: 'De server reageert niet. Probeer het later opnieuw.',
    UNKNOWN_ERROR: 'Er is een onbekende fout opgetreden.',
  },
  en: {
    UNAUTHORIZED: 'Your session has expired. Please log in again.',
    FORBIDDEN: 'You do not have access to this action.',
    NOT_FOUND: 'Not found.',
    CONFLICT: 'An item with this data already exists.',
    VALIDATION_ERROR: 'Please check the entered data.',
    SERVER_ERROR: 'A server error occurred.',
    NETWORK_ERROR: 'Network error. Check your internet connection.',
    TIMEOUT: 'The server is not responding. Please try again later.',
    UNKNOWN_ERROR: 'An unknown error occurred.',
  },
  de: {
    UNAUTHORIZED: 'Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.',
    FORBIDDEN: 'Sie haben keinen Zugriff auf diese Aktion.',
    NOT_FOUND: 'Nicht gefunden.',
    CONFLICT: 'Ein Element mit diesen Daten existiert bereits.',
    VALIDATION_ERROR: 'Bitte überprüfen Sie die eingegebenen Daten.',
    SERVER_ERROR: 'Ein Serverfehler ist aufgetreten.',
    NETWORK_ERROR: 'Netzwerkfehler. Überprüfen Sie Ihre Internetverbindung.',
    TIMEOUT: 'Der Server antwortet nicht. Bitte versuchen Sie es später erneut.',
    UNKNOWN_ERROR: 'Ein unbekannter Fehler ist aufgetreten.',
  },
};

/**
 * Type guard for Axios errors
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
 * Get the error code from an error
 */
export function getErrorCode(error: unknown): ApiErrorCode {
  if (isAxiosError(error)) {
    if (error.response?.status === 401) return 'UNAUTHORIZED';
    if (error.response?.status === 403) return 'FORBIDDEN';
    if (error.response?.status === 404) return 'NOT_FOUND';
    if (error.response?.status === 409) return 'CONFLICT';
    if (error.response?.status === 422) return 'VALIDATION_ERROR';
    if (error.response?.status && error.response.status >= 500) return 'SERVER_ERROR';
    if (error.code === 'ECONNABORTED') return 'TIMEOUT';
    if (!error.response) return 'NETWORK_ERROR';
  }
  return 'UNKNOWN_ERROR';
}

/**
 * Extract error message from an API error response (backwards compatible)
 */
export function getErrorMessage(error: unknown): string {
  // Handle Axios errors - prefer server-provided message
  if (isAxiosError(error)) {
    const data = error.response?.data;
    if (data?.error) return data.error;
    if (data?.message) return data.message;

    // Fall back to status-based messages in Dutch (default)
    const code = getErrorCode(error);
    return FALLBACK_MESSAGES.nl[code];
  }

  // Handle standard Error objects
  if (error instanceof Error) {
    return error.message;
  }

  // Handle string errors
  if (typeof error === 'string') {
    return error;
  }

  return FALLBACK_MESSAGES.nl.UNKNOWN_ERROR;
}

/**
 * Get a localized error message using i18n
 *
 * @param error - The error to get a message for
 * @param t - The i18n translation function
 * @param language - The current language code (e.g., 'nl', 'en', 'de')
 * @returns A user-friendly error message in the correct language
 */
export function getLocalizedErrorMessage(error: unknown, t: TFunction, language: string = 'nl'): string {
  // Handle Axios errors - prefer server-provided message
  if (isAxiosError(error)) {
    const data = error.response?.data;

    // If server provides a message, use it (assume it's in the correct language)
    if (data?.error) return data.error;
    if (data?.message) return data.message;

    // Get error code and translate
    const code = getErrorCode(error);
    const translationKey = ERROR_CODE_TRANSLATIONS[code];

    // Try to get translation, fall back to hardcoded messages
    const translated = t(translationKey, { defaultValue: '' });
    if (translated && translated !== translationKey) {
      return translated;
    }

    // Use fallback messages for the language
    const langFallbacks = FALLBACK_MESSAGES[language] || FALLBACK_MESSAGES.nl;
    return langFallbacks[code];
  }

  // Handle standard Error objects
  if (error instanceof Error) {
    return error.message;
  }

  // Handle string errors
  if (typeof error === 'string') {
    return error;
  }

  // Try translation first, then fallback
  const translated = t('errors.generic', { defaultValue: '' });
  if (translated && translated !== 'errors.generic') {
    return translated;
  }

  const langFallbacks = FALLBACK_MESSAGES[language] || FALLBACK_MESSAGES.nl;
  return langFallbacks.UNKNOWN_ERROR;
}

/**
 * Log error to console in development
 */
export function logError(context: string, error: unknown): void {
  if (import.meta.env.DEV) {
    console.error(`[${context}]`, error);
  }
}

/**
 * Create an error handler function for use in catch blocks
 * that logs and shows appropriate messages
 */
export function createErrorHandler(context: string, t?: TFunction, language?: string): (error: unknown) => string {
  return (error: unknown) => {
    logError(context, error);
    if (t) {
      return getLocalizedErrorMessage(error, t, language);
    }
    return getErrorMessage(error);
  };
}
