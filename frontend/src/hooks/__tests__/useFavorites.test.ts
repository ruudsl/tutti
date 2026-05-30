import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'

// Mock the API module
vi.mock('../../api', () => ({
  getFavorites: vi.fn(),
  addFavorite: vi.fn(),
  removeFavorite: vi.fn(),
  checkFavorite: vi.fn(),
}))

// Mock toast utilities
vi.mock('../../utils/toast', () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}))

// Mock queryKeys
vi.mock('../../lib/queryClient', () => ({
  queryKeys: {
    favorites: ['favorites'],
  },
}))

import { useFavorites, useFavoriteStatus } from '../useFavorites'
import { getFavorites, addFavorite, removeFavorite, checkFavorite } from '../../api'
import { showSuccess, showError } from '../../utils/toast'

describe('useFavorites', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: 0,
        },
      },
    })
  })

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)

  it('should return empty favorites initially', async () => {
    vi.mocked(getFavorites).mockResolvedValue([])

    const { result } = renderHook(() => useFavorites(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.favorites).toEqual([])
  })

  it('should return favorites from API', async () => {
    const mockFavorites = [
      { id: '1', title: 'Symphony No. 5' },
      { id: '2', title: 'Concerto in D' },
    ]
    vi.mocked(getFavorites).mockResolvedValue(mockFavorites)

    const { result } = renderHook(() => useFavorites(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.favorites).toEqual(mockFavorites)
  })

  it('should check if item is favorite', async () => {
    const mockFavorites = [{ id: '1', title: 'Test' }]
    vi.mocked(getFavorites).mockResolvedValue(mockFavorites)

    const { result } = renderHook(() => useFavorites(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.isFavorite('1')).toBe(true)
    expect(result.current.isFavorite('2')).toBe(false)
  })

  it('should add favorite and show success message', async () => {
    vi.mocked(getFavorites).mockResolvedValue([])
    vi.mocked(addFavorite).mockResolvedValue({ success: true })

    const { result } = renderHook(() => useFavorites(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    await act(async () => {
      await result.current.addFavorite('new-id')
    })

    expect(addFavorite).toHaveBeenCalled()
    expect(vi.mocked(addFavorite).mock.calls[0][0]).toBe('new-id')
    expect(showSuccess).toHaveBeenCalledWith('Toegevoegd aan favorieten')
  })

  it('should show error message on add failure', async () => {
    vi.mocked(getFavorites).mockResolvedValue([])
    vi.mocked(addFavorite).mockRejectedValue({
      response: { data: { error: 'Server error' } },
    })

    const { result } = renderHook(() => useFavorites(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    await act(async () => {
      try {
        await result.current.addFavorite('new-id')
      } catch {
        // Expected to throw
      }
    })

    expect(showError).toHaveBeenCalledWith('Server error')
  })

  it('should remove favorite and show success message', async () => {
    const mockFavorites = [{ id: '1', title: 'Test' }]
    vi.mocked(getFavorites).mockResolvedValue(mockFavorites)
    vi.mocked(removeFavorite).mockResolvedValue({ success: true })

    const { result } = renderHook(() => useFavorites(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    await act(async () => {
      await result.current.removeFavorite('1')
    })

    expect(removeFavorite).toHaveBeenCalled()
    expect(vi.mocked(removeFavorite).mock.calls[0][0]).toBe('1')
    expect(showSuccess).toHaveBeenCalledWith('Verwijderd uit favorieten')
  })

  it('should toggle favorite correctly', async () => {
    const mockFavorites = [{ id: '1', title: 'Test' }]
    vi.mocked(getFavorites).mockResolvedValue(mockFavorites)
    vi.mocked(removeFavorite).mockResolvedValue({ success: true })
    vi.mocked(addFavorite).mockResolvedValue({ success: true })

    const { result } = renderHook(() => useFavorites(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // Toggle to remove (isFavorite = true)
    await act(async () => {
      await result.current.toggleFavorite('1', true)
    })

    expect(removeFavorite).toHaveBeenCalled()
    expect(vi.mocked(removeFavorite).mock.calls[0][0]).toBe('1')

    // Toggle to add (isFavorite = false)
    await act(async () => {
      await result.current.toggleFavorite('2', false)
    })

    expect(addFavorite).toHaveBeenCalled()
    expect(vi.mocked(addFavorite).mock.calls[0][0]).toBe('2')
  })

  it('should track toggling state', async () => {
    vi.mocked(getFavorites).mockResolvedValue([])
    let resolveAdd: () => void
    vi.mocked(addFavorite).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAdd = () => resolve({ success: true })
        })
    )

    const { result } = renderHook(() => useFavorites(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.isToggling).toBe(false)

    // Start adding
    let addPromise: Promise<any>
    act(() => {
      addPromise = result.current.addFavorite('new-id')
    })

    await waitFor(() => {
      expect(result.current.isToggling).toBe(true)
    })

    // Complete adding
    await act(async () => {
      resolveAdd!()
      await addPromise
    })

    await waitFor(() => {
      expect(result.current.isToggling).toBe(false)
    })
  })
})

describe('useFavoriteStatus', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: 0,
        },
      },
    })
  })

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)

  it('should return false when musicTitleId is undefined', () => {
    const { result } = renderHook(() => useFavoriteStatus(undefined), { wrapper })

    expect(result.current.isFavorite).toBe(false)
  })

  it('should check favorite status from API', async () => {
    vi.mocked(checkFavorite).mockResolvedValue({ isFavorite: true })

    const { result } = renderHook(() => useFavoriteStatus('test-id'), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(checkFavorite).toHaveBeenCalledWith('test-id')
    expect(result.current.isFavorite).toBe(true)
  })

  it('should return false when API returns false', async () => {
    vi.mocked(checkFavorite).mockResolvedValue({ isFavorite: false })

    const { result } = renderHook(() => useFavoriteStatus('test-id'), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.isFavorite).toBe(false)
  })
})
