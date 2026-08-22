/**
 * Tests voor het bijhouden van recent bekeken items.
 *
 * De API-laag wordt gemockt en de hooks draaien in een eigen querycache. Het
 * gaat om de vraag welke oproep er met welke argumenten uitgaat, of de cache na
 * een wijziging ververst wordt, en of hetzelfde item niet twee keer achter
 * elkaar wordt vastgelegd.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';

vi.mock('../../api', () => ({
  getRecentViews: vi.fn(),
  recordView: vi.fn(),
  clearRecentViews: vi.fn(),
}));

import { useRecentViews, useRecordView, useClearRecentViews, useTrackView } from '../useRecentViews';
import * as api from '../../api';

const server = vi.mocked(api);

let queryClient: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(QueryClientProvider, { client: queryClient }, children);

const bekeken = {
  id: 'v1',
  itemType: 'music_piece' as const,
  itemId: 'm1',
  itemTitle: 'Eine kleine Nachtmusik',
  viewedAt: '2026-08-20T10:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  server.getRecentViews.mockResolvedValue([]);
  server.recordView.mockResolvedValue(undefined as never);
  server.clearRecentViews.mockResolvedValue(undefined as never);
});

describe('useRecentViews', () => {
  it('begint met een lege lijst terwijl er geladen wordt', () => {
    const { result } = renderHook(() => useRecentViews(), { wrapper });

    expect(result.current.views).toEqual([]);
    expect(result.current.isLoading).toBe(true);
  });

  it('geeft de opgehaalde items terug', async () => {
    server.getRecentViews.mockResolvedValue([bekeken]);

    const { result } = renderHook(() => useRecentViews(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.views).toEqual([bekeken]);
  });

  it('geeft soort en aantal door aan de server', async () => {
    renderHook(() => useRecentViews('music_list', 5), { wrapper });

    await waitFor(() => expect(server.getRecentViews).toHaveBeenCalledWith('music_list', 5));
  });

  it('houdt de uitkomsten per soort en aantal apart', async () => {
    const eerste = renderHook(() => useRecentViews('music_list', 5), { wrapper });
    await waitFor(() => expect(eerste.result.current.isLoading).toBe(false));

    renderHook(() => useRecentViews('rehearsal', 5), { wrapper });

    await waitFor(() => expect(server.getRecentViews).toHaveBeenCalledTimes(2));
    expect(server.getRecentViews).toHaveBeenLastCalledWith('rehearsal', 5);
  });

  it('meldt een fout van de server', async () => {
    server.getRecentViews.mockRejectedValue(new Error('server weg'));

    const { result } = renderHook(() => useRecentViews(), { wrapper });

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.views).toEqual([]);
  });
});

describe('useRecordView', () => {
  it('legt een bekeken item vast', async () => {
    const { result } = renderHook(() => useRecordView(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ itemType: 'music_piece', itemId: 'm1', itemTitle: 'Titel' });
    });

    expect(server.recordView).toHaveBeenCalledWith('music_piece', 'm1', 'Titel');
  });

  it('ververst de lijst met recent bekeken items daarna', async () => {
    const verversen = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useRecordView(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ itemType: 'music_piece', itemId: 'm1', itemTitle: 'Titel' });
    });

    expect(verversen).toHaveBeenCalledWith({ queryKey: ['recentViews'] });
  });

  it('meldt het wanneer vastleggen mislukt', async () => {
    server.recordView.mockRejectedValue(new Error('server weg'));
    const { result } = renderHook(() => useRecordView(), { wrapper });

    await act(async () => {
      result.current.mutate({ itemType: 'music_piece', itemId: 'm1', itemTitle: 'Titel' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('useClearRecentViews', () => {
  it('wist de geschiedenis en ververst de lijst', async () => {
    const verversen = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useClearRecentViews(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(undefined as never);
    });

    expect(server.clearRecentViews).toHaveBeenCalledTimes(1);
    expect(verversen).toHaveBeenCalledWith({ queryKey: ['recentViews'] });
  });
});

describe('useTrackView', () => {
  it('legt het bekeken item vast', async () => {
    renderHook(() => useTrackView('music_piece', 'm1', 'Eine kleine Nachtmusik'), { wrapper });

    await waitFor(() => expect(server.recordView).toHaveBeenCalledWith('music_piece', 'm1', 'Eine kleine Nachtmusik'));
  });

  it('legt niets vast zolang het item nog niet bekend is', async () => {
    renderHook(() => useTrackView('music_piece', undefined, undefined), { wrapper });

    await Promise.resolve();
    expect(server.recordView).not.toHaveBeenCalled();
  });

  it('legt niets vast wanneer alleen de titel nog ontbreekt', async () => {
    renderHook(() => useTrackView('music_piece', 'm1', undefined), { wrapper });

    await Promise.resolve();
    expect(server.recordView).not.toHaveBeenCalled();
  });

  it('legt hetzelfde item niet nog een keer vast bij een nieuwe render', async () => {
    const { rerender } = renderHook(() => useTrackView('music_piece', 'm1', 'Titel'), { wrapper });
    await waitFor(() => expect(server.recordView).toHaveBeenCalledTimes(1));

    rerender();
    rerender();

    await Promise.resolve();
    expect(server.recordView).toHaveBeenCalledTimes(1);
  });

  it('legt een volgend item wel vast', async () => {
    const { rerender } = renderHook(({ id }) => useTrackView('music_piece', id, 'Titel'), {
      wrapper,
      initialProps: { id: 'm1' },
    });
    await waitFor(() => expect(server.recordView).toHaveBeenCalledTimes(1));

    rerender({ id: 'm2' });

    await waitFor(() => expect(server.recordView).toHaveBeenLastCalledWith('music_piece', 'm2', 'Titel'));
  });

  it('onthoudt het laatst vastgelegde item in de sessie', async () => {
    renderHook(() => useTrackView('music_piece', 'm1', 'Titel'), { wrapper });

    await waitFor(() => expect(sessionStorage.getItem('lastRecordedView')).toBe('music_piece-m1'));
  });
});
