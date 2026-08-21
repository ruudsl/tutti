/**
 * Uitloggen moet de offline opslag leegmaken.
 *
 * De twee offline databases hebben een vaste naam en geen enkel record draagt
 * een gebruiker- of verenigingsid. Het uitloggen wiste alleen het token, de
 * gebruiker en de react-query-cache uit localStorage; IndexedDB bleef staan.
 *
 * Wie daarna als lid van een andere vereniging inlogde, hield dus het
 * repertoire, de repetities, de favorieten, het profiel en de annotaties van
 * zijn voorganger. Op een gedeelde tablet in de repetitieruimte is dat de
 * normale gang van zaken, geen randgeval.
 *
 * Het ergste was de synchronisatiewachtrij: die overleefde het ook, dus de
 * nieuwe gebruiker verstuurde de openstaande wijzigingen van de vorige met
 * zijn eigen token. Aan de serverkant is dat niet van echt te onderscheiden.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';

const wisOpslag = vi.fn().mockResolvedValue(undefined);
const wisDb = vi.fn().mockResolvedValue(undefined);
const wisCache = vi.fn();

vi.mock('../../lib/offlineStorage', () => ({ clearAllData: () => wisOpslag() }));
vi.mock('../../lib/offlineDb', () => ({ wisAlleOfflineGegevens: () => wisDb() }));
vi.mock('../../lib/queryClient', () => ({ clearPersistedCache: () => wisCache() }));
vi.mock('../../api', () => ({
  login: vi.fn(),
  getProfile: vi.fn(),
}));

import { AuthProvider, useAuth } from '../AuthContext';

const omhulsel = ({ children }: { children: ReactNode }) => createElement(AuthProvider, null, children);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('uitloggen', () => {
  it('wist beide offline databases', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: omhulsel });

    act(() => {
      result.current.logout();
    });

    await waitFor(() => {
      expect(wisOpslag).toHaveBeenCalledTimes(1);
      expect(wisDb).toHaveBeenCalledTimes(1);
    });
  });

  it('wist ook het token en de bewaarde cache', async () => {
    localStorage.setItem('token', 'iets');
    localStorage.setItem('user', '{"id":"1"}');
    const { result } = renderHook(() => useAuth(), { wrapper: omhulsel });

    act(() => {
      result.current.logout();
    });

    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
    expect(wisCache).toHaveBeenCalledTimes(1);
  });

  it('logt gewoon uit als het opruimen mislukt', async () => {
    // Uitloggen mag nooit blijven hangen op een database die niet meewerkt:
    // de gebruiker verwacht dat hij eruit is, en dat is hij ook.
    wisDb.mockRejectedValueOnce(new Error('IndexedDB weigert'));
    const fout = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useAuth(), { wrapper: omhulsel });

    act(() => {
      result.current.logout();
    });

    expect(result.current.user).toBeNull();
    await waitFor(() => expect(fout).toHaveBeenCalled());
    fout.mockRestore();
  });
});
