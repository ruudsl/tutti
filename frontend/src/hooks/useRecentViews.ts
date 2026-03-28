import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getRecentViews, recordView, clearRecentViews } from '../api';
import { queryKeys } from '../lib/queryClient';

export interface RecentView {
  id: string;
  itemType: 'music_piece' | 'music_title' | 'music_list' | 'rehearsal' | 'concert';
  itemId: string;
  itemTitle: string;
  viewedAt: string;
}

export function useRecentViews(type?: string, limit?: number) {
  const { data: views = [], isLoading, error } = useQuery({
    queryKey: ['recentViews', type, limit],
    queryFn: () => getRecentViews(type, limit),
  });

  return { views: views as RecentView[], isLoading, error };
}

export function useRecordView() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (data: { itemType: string; itemId: string; itemTitle: string }) =>
      recordView(data.itemType, data.itemId, data.itemTitle),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recentViews'] });
    },
  });

  return mutation;
}

export function useClearRecentViews() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: clearRecentViews,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recentViews'] });
    },
  });

  return mutation;
}

// Helper hook to record view when component mounts
export function useTrackView(itemType: string, itemId: string | undefined, itemTitle: string | undefined) {
  const recordViewMutation = useRecordView();

  // Record view when all params are available
  if (itemId && itemTitle) {
    // Use a ref to prevent multiple recordings
    const key = `${itemType}-${itemId}`;
    const lastRecorded = sessionStorage.getItem('lastRecordedView');

    if (lastRecorded !== key) {
      sessionStorage.setItem('lastRecordedView', key);
      recordViewMutation.mutate({ itemType, itemId, itemTitle });
    }
  }
}
