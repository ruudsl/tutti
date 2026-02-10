import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../lib/queryClient';
import {
  getUniformItems,
  getUniformItem,
  getUniformItemTypes,
  getUniformAvailabilityBySize,
  searchUniformsBySize,
  createUniformItem,
  createUniformItemsBulk,
  updateUniformItem,
  deleteUniformItem,
  assignUniformItem,
  returnUniformItem,
  getUniformSets,
  getUniformSet,
  createUniformSet,
  updateUniformSet,
  deleteUniformSet,
  getUserUniforms,
} from '../api';
import { showSuccess, showError } from '../utils/toast';
import { getErrorMessage } from '../utils/errors';

/**
 * Hook to fetch uniform item types
 */
export function useUniformItemTypes() {
  return useQuery({
    queryKey: queryKeys.uniformItemTypes,
    queryFn: getUniformItemTypes,
  });
}

/**
 * Hook to fetch uniform items with filters
 */
export function useUniformItems(filters?: { search?: string; status?: string; itemType?: string; size?: string }) {
  return useQuery({
    queryKey: queryKeys.uniformItems(filters as Record<string, string>),
    queryFn: () => getUniformItems(filters),
  });
}

/**
 * Hook to fetch single uniform item with history
 */
export function useUniformItem(id: string) {
  return useQuery({
    queryKey: queryKeys.uniformItem(id),
    queryFn: () => getUniformItem(id),
    enabled: !!id,
  });
}

/**
 * Hook to fetch availability by size
 */
export function useUniformAvailabilityBySize(itemType?: string) {
  return useQuery({
    queryKey: queryKeys.uniformAvailability(itemType),
    queryFn: () => getUniformAvailabilityBySize(itemType),
  });
}

/**
 * Hook to search uniforms by size
 */
export function useSearchUniformsBySize(size: string, itemType?: string) {
  return useQuery({
    queryKey: ['uniforms', 'size-search', size, itemType],
    queryFn: () => searchUniformsBySize(size, itemType),
    enabled: !!size,
  });
}

/**
 * Hook to fetch user's uniforms
 */
export function useUserUniforms(userId: string) {
  return useQuery({
    queryKey: queryKeys.userUniforms(userId),
    queryFn: () => getUserUniforms(userId),
    enabled: !!userId,
  });
}

/**
 * Hook to create new uniform item
 */
export function useCreateUniformItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createUniformItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['uniforms', 'items'] });
      queryClient.invalidateQueries({ queryKey: ['uniforms', 'availability'] });
      showSuccess('Onderdeel toegevoegd');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to create multiple uniform items
 */
export function useCreateUniformItemsBulk() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createUniformItemsBulk,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['uniforms', 'items'] });
      queryClient.invalidateQueries({ queryKey: ['uniforms', 'availability'] });
      showSuccess(`${data.count} onderdelen toegevoegd`);
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to update uniform item
 */
export function useUpdateUniformItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateUniformItem>[1] }) =>
      updateUniformItem(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['uniforms', 'items'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.uniformItem(id) });
      queryClient.invalidateQueries({ queryKey: ['uniforms', 'availability'] });
      showSuccess('Onderdeel bijgewerkt');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to delete uniform item
 */
export function useDeleteUniformItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteUniformItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['uniforms', 'items'] });
      queryClient.invalidateQueries({ queryKey: ['uniforms', 'availability'] });
      showSuccess('Onderdeel verwijderd');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to assign uniform item to user
 */
export function useAssignUniformItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ itemId, assignment }: { itemId: string; assignment: Parameters<typeof assignUniformItem>[1] }) =>
      assignUniformItem(itemId, assignment),
    onSuccess: (_, { itemId }) => {
      queryClient.invalidateQueries({ queryKey: ['uniforms', 'items'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.uniformItem(itemId) });
      queryClient.invalidateQueries({ queryKey: ['uniforms', 'availability'] });
      queryClient.invalidateQueries({ queryKey: ['uniforms', 'user'] });
      showSuccess('Onderdeel uitgegeven');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to return uniform item
 */
export function useReturnUniformItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ itemId, returnData }: { itemId: string; returnData: Parameters<typeof returnUniformItem>[1] }) =>
      returnUniformItem(itemId, returnData),
    onSuccess: (_, { itemId }) => {
      queryClient.invalidateQueries({ queryKey: ['uniforms', 'items'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.uniformItem(itemId) });
      queryClient.invalidateQueries({ queryKey: ['uniforms', 'availability'] });
      queryClient.invalidateQueries({ queryKey: ['uniforms', 'user'] });
      showSuccess('Onderdeel teruggebracht');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

// ==================== UNIFORM SETS ====================

/**
 * Hook to fetch uniform sets
 */
export function useUniformSets() {
  return useQuery({
    queryKey: queryKeys.uniformSets,
    queryFn: getUniformSets,
  });
}

/**
 * Hook to fetch single uniform set
 */
export function useUniformSet(id: string) {
  return useQuery({
    queryKey: queryKeys.uniformSet(id),
    queryFn: () => getUniformSet(id),
    enabled: !!id,
  });
}

/**
 * Hook to create uniform set
 */
export function useCreateUniformSet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createUniformSet,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.uniformSets });
      showSuccess('Set aangemaakt');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to update uniform set
 */
export function useUpdateUniformSet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateUniformSet>[1] }) =>
      updateUniformSet(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.uniformSets });
      queryClient.invalidateQueries({ queryKey: queryKeys.uniformSet(id) });
      showSuccess('Set bijgewerkt');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to delete uniform set
 */
export function useDeleteUniformSet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteUniformSet,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.uniformSets });
      showSuccess('Set verwijderd');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}
