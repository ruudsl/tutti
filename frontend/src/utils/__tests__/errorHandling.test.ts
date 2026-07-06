import { describe, it, expect } from 'vitest';
import { AppError, getErrorMessage, getErrorCode, getHttpStatus, isAxiosError, isAppError } from '../errorHandling';

/** Builds an object shaped like an AxiosError (isAxiosError flag + response). */
function makeAxiosError(overrides: Record<string, unknown> = {}) {
  return {
    isAxiosError: true,
    message: 'Request failed with status code 500',
    ...overrides,
  };
}

describe('getErrorMessage', () => {
  it('returns the API error message from an AxiosError response body', () => {
    const error = makeAxiosError({
      response: { status: 404, data: { error: 'Gebruiker niet gevonden.' } },
    });
    expect(getErrorMessage(error)).toBe('Gebruiker niet gevonden.');
  });

  it('prefers the API error body over the provided fallback', () => {
    const error = makeAxiosError({
      response: { status: 400, data: { error: 'Validatiefout.' } },
    });
    expect(getErrorMessage(error, 'Fallback melding')).toBe('Validatiefout.');
  });

  it('uses the fallback for an AxiosError without an error body', () => {
    const error = makeAxiosError({ response: { status: 500, data: {} } });
    expect(getErrorMessage(error, 'Kon gebruikers niet laden')).toBe('Kon gebruikers niet laden');
  });

  it('falls back to the axios message when no body and no fallback', () => {
    const error = makeAxiosError({ response: { status: 500, data: {} } });
    expect(getErrorMessage(error)).toBe('Request failed with status code 500');
  });

  it('returns a generic network message for an AxiosError without body, message or fallback', () => {
    const error = makeAxiosError({ message: '' });
    expect(getErrorMessage(error)).toBe('Er is een netwerkfout opgetreden');
  });

  it('returns the message of an AppError', () => {
    const error = new AppError('Niet gevonden', 'NOT_FOUND', 404);
    expect(getErrorMessage(error)).toBe('Niet gevonden');
  });

  it('returns the message of a plain Error', () => {
    expect(getErrorMessage(new Error('Kapot'))).toBe('Kapot');
  });

  it('returns a string error as-is', () => {
    expect(getErrorMessage('Er ging iets mis')).toBe('Er ging iets mis');
  });

  it('returns the fallback for unknown error types', () => {
    expect(getErrorMessage(null, 'Fallback')).toBe('Fallback');
    expect(getErrorMessage(undefined, 'Fallback')).toBe('Fallback');
    expect(getErrorMessage({ some: 'object' }, 'Fallback')).toBe('Fallback');
  });

  it('returns a generic message for unknown error types without fallback', () => {
    expect(getErrorMessage(null)).toBe('Er is een onbekende fout opgetreden');
    expect(getErrorMessage('')).toBe('Er is een onbekende fout opgetreden');
  });
});

describe('getErrorCode', () => {
  it('maps HTTP status codes from AxiosErrors', () => {
    expect(getErrorCode(makeAxiosError({ response: { status: 401, data: {} } }))).toBe('UNAUTHORIZED');
    expect(getErrorCode(makeAxiosError({ response: { status: 403, data: {} } }))).toBe('FORBIDDEN');
    expect(getErrorCode(makeAxiosError({ response: { status: 404, data: {} } }))).toBe('NOT_FOUND');
    expect(getErrorCode(makeAxiosError({ response: { status: 409, data: {} } }))).toBe('CONFLICT');
    expect(getErrorCode(makeAxiosError({ response: { status: 422, data: {} } }))).toBe('VALIDATION_ERROR');
    expect(getErrorCode(makeAxiosError({ response: { status: 503, data: {} } }))).toBe('SERVER_ERROR');
  });

  it('returns NETWORK_ERROR for an AxiosError without response', () => {
    expect(getErrorCode(makeAxiosError())).toBe('NETWORK_ERROR');
  });

  it('returns the code of an AppError', () => {
    expect(getErrorCode(new AppError('x', 'MY_CODE'))).toBe('MY_CODE');
  });

  it('returns UNKNOWN_ERROR for other error types', () => {
    expect(getErrorCode(new Error('x'))).toBe('UNKNOWN_ERROR');
    expect(getErrorCode('x')).toBe('UNKNOWN_ERROR');
  });
});

describe('getHttpStatus', () => {
  it('returns the response status of an AxiosError', () => {
    expect(getHttpStatus(makeAxiosError({ response: { status: 404, data: {} } }))).toBe(404);
  });

  it('returns the statusCode of an AppError', () => {
    expect(getHttpStatus(new AppError('x', 'CODE', 422))).toBe(422);
  });

  it('defaults to 500 for unknown error types', () => {
    expect(getHttpStatus(new Error('x'))).toBe(500);
    expect(getHttpStatus(null)).toBe(500);
  });
});

describe('type guards', () => {
  it('isAxiosError recognizes axios-shaped errors only', () => {
    expect(isAxiosError(makeAxiosError())).toBe(true);
    expect(isAxiosError(new Error('x'))).toBe(false);
    expect(isAxiosError({ isAxiosError: false })).toBe(false);
    expect(isAxiosError(null)).toBe(false);
  });

  it('isAppError recognizes AppError instances only', () => {
    expect(isAppError(new AppError('x'))).toBe(true);
    expect(isAppError(new Error('x'))).toBe(false);
  });

  it('AppError carries defaults', () => {
    const error = new AppError('boom');
    expect(error.code).toBe('UNKNOWN_ERROR');
    expect(error.statusCode).toBe(500);
    expect(error.name).toBe('AppError');
  });
});
