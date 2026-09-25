/**
 * Uitloggen vraagt de server de sessie in te trekken.
 *
 * Uitloggen wiste alleen het token in de browser; aan de serverkant bleef het
 * geldig tot het verliep. Nu gaat eerst het token naar POST /auth/logout, en
 * daarna wordt alles lokaal gewist - ook als de server niet bereikbaar is.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';

const uitloggenBijServer = vi.fn();
vi.mock('../../api/auth', () => ({
  login: vi.fn(),
  getProfile: vi.fn().mockResolvedValue({ id: 'lid-1' }),
  logout: (token: string) => uitloggenBijServer(token),
}));
vi.mock('../../lib/queryClient', () => ({ clearPersistedCache: vi.fn() }));
vi.mock('../../lib/offlineStorage', () => ({ clearAllData: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../lib/offlineDb', () => ({ wisAlleOfflineGegevens: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../utils/downloadUrl', () => ({ clearDownloadTokenCache: vi.fn() }));

import { AuthProvider, useAuth } from '../AuthContext';

const omhulsel = ({ children }: { children: ReactNode }) => createElement(AuthProvider, null, children);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  uitloggenBijServer.mockResolvedValue(undefined);
});

describe('uitloggen bij de server', () => {
  it('stuurt het huidige token naar de server om de sessie in te trekken', async () => {
    localStorage.setItem('token', 'het-token');
    localStorage.setItem('user', '{"id":"lid-1"}');
    const { result } = renderHook(() => useAuth(), { wrapper: omhulsel });

    act(() => {
      result.current.logout();
    });

    expect(uitloggenBijServer).toHaveBeenCalledWith('het-token');
    expect(localStorage.getItem('token')).toBeNull();
  });

  it('logt lokaal uit ook als de server niet bereikbaar is', async () => {
    uitloggenBijServer.mockRejectedValueOnce(new Error('netwerkfout'));
    const fout = vi.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.setItem('token', 'het-token');
    localStorage.setItem('user', '{"id":"lid-1"}');
    const { result } = renderHook(() => useAuth(), { wrapper: omhulsel });

    act(() => {
      result.current.logout();
    });

    expect(localStorage.getItem('token')).toBeNull();
    expect(result.current.user).toBeNull();
    await waitFor(() => expect(fout).toHaveBeenCalled());
    fout.mockRestore();
  });

  it('roept de server niet aan als er geen token is', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: omhulsel });

    act(() => {
      result.current.logout();
    });

    expect(uitloggenBijServer).not.toHaveBeenCalled();
  });
});
