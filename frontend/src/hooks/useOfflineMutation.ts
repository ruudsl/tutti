import { useMutation, useQueryClient, UseMutationOptions } from '@tanstack/react-query';
import { useEffect, useCallback } from 'react';

interface QueuedMutation {
  id: string;
  data: unknown;
  timestamp: number;
}

const QUEUE_KEY = 'harmonie-offline-queue';

function getQueue(): QueuedMutation[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  } catch {
    return [];
  }
}

function setQueue(queue: QueuedMutation[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

/**
 * @description Hook for mutations that work offline by queuing changes locally.
 * When offline, mutations are stored in localStorage and synced when back online.
 * Supports automatic sync on reconnection and cache invalidation.
 *
 * @template TData - The return type of the mutation
 * @template TVariables - The input type for the mutation
 * @param {Function} mutationFn - The async function to execute the mutation
 * @param {Object} options - Configuration options
 * @param {Function} options.onSuccess - Callback when mutation succeeds
 * @param {Function} options.onError - Callback when mutation fails
 * @param {string[][]} options.invalidateKeys - Query keys to invalidate after sync
 * @param {string} options.mutationKey - Unique key to identify this mutation type in queue
 *
 * @returns {UseMutationResult} React Query mutation result
 *
 * @example
 * ```tsx
 * function PracticeLogger() {
 *   const logPractice = useOfflineMutation(
 *     (data: PracticeLog) => api.post('/practice', data),
 *     {
 *       mutationKey: 'practice-log',
 *       invalidateKeys: [['practice-logs']],
 *       onSuccess: () => showSuccess('Practice logged!')
 *     }
 *   );
 *
 *   const handleSubmit = async (data: PracticeLog) => {
 *     try {
 *       await logPractice.mutateAsync(data);
 *     } catch (e) {
 *       // If offline, mutation is queued - no error shown
 *       if (e.message.includes('queued')) {
 *         showInfo('Will sync when online');
 *       }
 *     }
 *   };
 * }
 * ```
 */
export function useOfflineMutation<TData, TVariables>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options?: {
    onSuccess?: (data: TData) => void;
    onError?: (error: Error) => void;
    invalidateKeys?: string[][];
    mutationKey?: string;
  }
) {
  const queryClient = useQueryClient();

  // Sync queue when coming back online
  const syncQueue = useCallback(async () => {
    const queue = getQueue();
    if (queue.length === 0) return;

    const mutationKey = options?.mutationKey || 'default';
    const relevantItems = queue.filter((item) =>
      (item as QueuedMutation & { mutationKey?: string }).mutationKey === mutationKey
    );

    for (const item of relevantItems) {
      try {
        const data = await mutationFn(item.data as TVariables);
        options?.onSuccess?.(data);

        // Remove from queue after successful sync
        const currentQueue = getQueue();
        const updated = currentQueue.filter((q) => q.id !== item.id);
        setQueue(updated);
      } catch (error) {
        console.error('Failed to sync queued mutation:', error);
        options?.onError?.(error as Error);
      }
    }

    // Invalidate caches after sync
    options?.invalidateKeys?.forEach((key) => {
      queryClient.invalidateQueries({ queryKey: key });
    });
  }, [mutationFn, queryClient, options]);

  useEffect(() => {
    window.addEventListener('online', syncQueue);

    // Try to sync on mount if online
    if (navigator.onLine) {
      syncQueue();
    }

    return () => window.removeEventListener('online', syncQueue);
  }, [syncQueue]);

  return useMutation({
    mutationFn: async (variables: TVariables) => {
      if (!navigator.onLine) {
        // Queue mutation for later
        const queue = getQueue();
        queue.push({
          id: crypto.randomUUID(),
          data: variables,
          timestamp: Date.now(),
          mutationKey: options?.mutationKey,
        } as QueuedMutation & { mutationKey?: string });
        setQueue(queue);

        // Return a placeholder response or throw
        throw new Error('Offline - mutation queued for later');
      }
      return mutationFn(variables);
    },
    onSuccess: options?.onSuccess,
    onError: options?.onError,
  } as UseMutationOptions<TData, Error, TVariables>);
}

/**
 * @description Hook to get the number of pending offline mutations in the queue.
 * Useful for showing sync status indicators.
 *
 * @returns {number} Count of pending mutations
 *
 * @example
 * ```tsx
 * function SyncIndicator() {
 *   const pendingCount = usePendingMutationsCount();
 *
 *   if (pendingCount === 0) return null;
 *   return <Badge>{pendingCount} pending</Badge>;
 * }
 * ```
 */
export function usePendingMutationsCount() {
  const queue = getQueue();
  return queue.length;
}
