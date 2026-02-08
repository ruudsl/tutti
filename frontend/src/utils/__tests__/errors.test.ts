import { describe, it, expect } from 'vitest'
import { getErrorMessage } from '../errors'

describe('getErrorMessage', () => {
  it('extracts error from Axios error response', () => {
    const axiosError = {
      isAxiosError: true,
      response: { status: 400, data: { error: 'Validation failed' } },
      message: 'Request failed',
    }
    expect(getErrorMessage(axiosError)).toBe('Validation failed')
  })

  it('extracts message from Axios error response', () => {
    const axiosError = {
      isAxiosError: true,
      response: { status: 400, data: { message: 'Bad request' } },
      message: 'Request failed',
    }
    expect(getErrorMessage(axiosError)).toBe('Bad request')
  })

  it('returns Dutch message for 401', () => {
    const axiosError = {
      isAxiosError: true,
      response: { status: 401, data: {} },
      message: 'Request failed',
    }
    expect(getErrorMessage(axiosError)).toBe('Je sessie is verlopen. Log opnieuw in.')
  })

  it('returns Dutch message for 403', () => {
    const axiosError = {
      isAxiosError: true,
      response: { status: 403, data: {} },
      message: 'Request failed',
    }
    expect(getErrorMessage(axiosError)).toBe('Je hebt geen toegang tot deze actie.')
  })

  it('returns Dutch message for 404', () => {
    const axiosError = {
      isAxiosError: true,
      response: { status: 404, data: {} },
      message: 'Request failed',
    }
    expect(getErrorMessage(axiosError)).toBe('Niet gevonden.')
  })

  it('handles standard Error objects', () => {
    expect(getErrorMessage(new Error('Something broke'))).toBe('Something broke')
  })

  it('handles string errors', () => {
    expect(getErrorMessage('A string error')).toBe('A string error')
  })

  it('returns default message for unknown errors', () => {
    expect(getErrorMessage(null)).toBe('Er is een onbekende fout opgetreden.')
    expect(getErrorMessage(42)).toBe('Er is een onbekende fout opgetreden.')
  })
})
