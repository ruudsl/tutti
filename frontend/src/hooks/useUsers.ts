import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { queryKeys, staleTimes, cacheTimes } from '../lib/queryClient';
import { getUsers, getUsersPaginated, createUser, updateUser, deleteUser } from '../api';
import type { UsersFilters } from '../api';
import { showSuccess, showError } from '../utils/toast';
import { getErrorMessage } from '../utils/errors';

interface CreateUserData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role?: string;
  instrumentIds?: string[];
  orchestraIds?: string[];
}

interface UpdateUserData {
  email?: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  password?: string;
  instrumentIds?: string[];
  orchestraIds?: string[];
}

/**
 * Hook to fetch all users (backwards compatible)
 */
export function useUsers(filters?: UsersFilters) {
  return useQuery({
    queryKey: [...queryKeys.users, filters],
    queryFn: () => getUsers(filters),
    staleTime: staleTimes.users,
    gcTime: cacheTimes.users,
  });
}

/**
 * Hook to fetch users with pagination
 */
export function useUsersPaginated(filters?: UsersFilters) {
  return useQuery({
    queryKey: ['users', 'paginated', filters],
    queryFn: () => getUsersPaginated(filters),
    staleTime: staleTimes.users,
    gcTime: cacheTimes.users,
  });
}

/**
 * Hook to fetch users with infinite scroll pagination
 */
export function useUsersInfinite(filters?: Omit<UsersFilters, 'page'>) {
  return useInfiniteQuery({
    queryKey: ['users', 'infinite', filters],
    queryFn: ({ pageParam = 1 }) => getUsersPaginated({ ...filters, page: pageParam }),
    getNextPageParam: (lastPage) => {
      const nextPage = lastPage.page + 1;
      return nextPage <= lastPage.totalPages ? nextPage : undefined;
    },
    initialPageParam: 1,
    staleTime: staleTimes.users,
    gcTime: cacheTimes.users,
  });
}

/**
 * Hook to create a new user
 */
export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateUserData) => createUser(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users });
      showSuccess('Lid aangemaakt');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to update a user
 */
export function useUpdateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateUserData }) => updateUser(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users });
      showSuccess('Lid bijgewerkt');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to delete a user
 */
export function useDeleteUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users });
      showSuccess('Lid verwijderd');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}
