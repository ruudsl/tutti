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
  // Deze functie belooft alle leden. De backend leest de paginagrootte uit
  // `limit` en kent `pageSize` niet (backend/src/routes/users.ts, GET '/'), en
  // valt zonder limit terug op 25 rijen. `filters` ging hier ongewijzigd mee,
  // dus zodra er ook maar één filter meeging - bijvoorbeeld een zoekterm -
  // kwamen er stilzwijgend maximaal 25 leden terug in plaats van alle
  // treffers. Dezelfde reparatie stond al in src/api.ts, dat deze map
  // schaduwt; hier bleef de fout staan.
  const { pageSize, ...overigeFilters } = filters ?? {};
  const params = { ...overigeFilters, limit: Math.min(pageSize || 1000, 1000) };
  const { data } = await api.get('/users', { params });
  return Array.isArray(data) ? data : data.data || [];
};

// Paginated version for new components
export const getUsersPaginated = async (filters?: UsersFilters): Promise<PaginatedResponse<User>> => {
  // `...filters` stond hier ACHTER page en pageSize en overschreef die weer met
  // de onbewerkte invoer. De begrenzing op MAX_PAGE_SIZE deed daardoor niets:
  // een scherm dat om pageSize 5000 vroeg, vroeg de server ook echt om 5000.
  //
  // Daarnaast heet de parameter aan de serverkant `limit`, niet `pageSize`.
  const { page, pageSize, ...overigeFilters } = filters ?? {};
  const params = {
    ...overigeFilters,
    page: page || 1,
    limit: Math.min(pageSize || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
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
  // De backend antwoordt met { data, pagination: { page, limit, total,
  // totalPages, ... } } (createPaginatedResult in backend/src/utils/database.ts).
  // Dat werd hier ongewijzigd teruggegeven onder een plat type, waardoor total,
  // page, pageSize en totalPages allemaal undefined bleven. useUsersInfinite
  // rekent met lastPage.page + 1 en lastPage.totalPages en kwam zo nooit verder
  // dan de eerste pagina.
  if (data && typeof data === 'object' && data.pagination) {
    return {
      data: data.data ?? [],
      total: data.pagination.total,
      page: data.pagination.page,
      pageSize: data.pagination.limit,
      totalPages: data.pagination.totalPages,
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

export const updateUser = async (
  id: string,
  userData: {
    email?: string;
    firstName?: string;
    lastName?: string;
    role?: string;
    password?: string;
    instrumentIds?: string[];
    orchestraIds?: string[];
  },
): Promise<void> => {
  await api.put(`/users/${id}`, userData);
};

export const deleteUser = async (id: string): Promise<void> => {
  await api.delete(`/users/${id}`);
};
