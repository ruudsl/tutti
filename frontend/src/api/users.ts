import api from './client';
import type { User } from '../types';
import type { PaginatedResponse } from './music';

// Pagination configuration
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

export interface UsersFilters {
  page?: number;
  pageSize?: number;
  search?: string;
  role?: string;
  orchestraId?: string;
}

// Backwards compatible version - fetches all users
export const getUsers = async (filters?: UsersFilters): Promise<User[]> => {
  const params = filters ? { ...filters } : { limit: 1000 };
  const { data } = await api.get('/users', { params });
  return Array.isArray(data) ? data : data.data || [];
};

// Paginated version for new components
export const getUsersPaginated = async (filters?: UsersFilters): Promise<PaginatedResponse<User>> => {
  const params = {
    page: filters?.page || 1,
    pageSize: Math.min(filters?.pageSize || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    ...filters,
  };
  const { data } = await api.get('/users', { params });
  if (Array.isArray(data)) {
    return {
      data,
      total: data.length,
      page: 1,
      pageSize: data.length,
      totalPages: 1,
    };
  }
  return data;
};

export const getUser = async (id: string): Promise<User> => {
  const { data } = await api.get(`/users/${id}`);
  return data;
};

export const createUser = async (userData: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role?: string;
  instrumentIds?: string[];
  orchestraIds?: string[];
}): Promise<{ id: string }> => {
  const { data } = await api.post('/users', userData);
  return data;
};

export const updateUser = async (id: string, userData: {
  email?: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  password?: string;
  instrumentIds?: string[];
  orchestraIds?: string[];
}): Promise<void> => {
  await api.put(`/users/${id}`, userData);
};

export const deleteUser = async (id: string): Promise<void> => {
  await api.delete(`/users/${id}`);
};
