import type { AxiosError } from 'axios';

interface ApiErrorResponse {
  error?: string;
  message?: string;
  details?: string;
}

/**
 * Extract error message from an API error response
 */
export function getErrorMessage(error: unknown): string {
  // Handle Axios errors
  if (isAxiosError(error)) {
    const data = error.response?.data as ApiErrorResponse | undefined;
    if (data?.error) return data.error;
    if (data?.message) return data.message;
    if (error.response?.status === 401) return 'Je sessie is verlopen. Log opnieuw in.';
    if (error.response?.status === 403) return 'Je hebt geen toegang tot deze actie.';
    if (error.response?.status === 404) return 'Niet gevonden.';
    if (error.response?.status === 409) return 'Er bestaat al een item met deze gegevens.';
    if (error.response?.status === 500) return 'Er is een serverfout opgetreden.';
    if (error.message) return error.message;
  }

  // Handle standard Error objects
  if (error instanceof Error) {
    return error.message;
  }

  // Handle string errors
  if (typeof error === 'string') {
    return error;
  }

  return 'Er is een onbekende fout opgetreden.';
}

/**
 * Type guard for Axios errors
 */
function isAxiosError(error: unknown): error is AxiosError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'isAxiosError' in error &&
    (error as AxiosError).isAxiosError === true
  );
}

/**
 * Log error to console in development
 */
export function logError(context: string, error: unknown): void {
  if (import.meta.env.DEV) {
    console.error(`[${context}]`, error);
  }
}
