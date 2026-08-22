import api from './client';

export type ResourceType = 'room' | 'vehicle' | 'equipment' | 'instrument' | 'service' | 'other';
export type BookingStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'completed';

export interface ResourceCategory {
  id: string;
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  sortOrder: number;
  resourceCount: number;
}

export interface Resource {
  id: string;
  name: string;
  description?: string;
  resourceType: ResourceType;
  categoryId?: string;
  categoryName?: string;
  categoryColor?: string;
  location?: string;
  capacity?: number;
  isActive: boolean;
  requiresApproval: boolean;
  costPerHour?: number;
  costPerDay?: number;
  imagePath?: string;
}

export interface ResourceDetail extends Resource {
  minBookingHours?: number;
  maxBookingHours?: number;
  advanceBookingDays?: number;
  depositAmount?: number;
  notes?: string;
  createdAt: string;
  availability: {
    id: string;
    availabilityType: string;
    dayOfWeek?: number;
    startTime?: string;
    endTime?: string;
    startDate?: string;
    endDate?: string;
    reason?: string;
  }[];
  upcomingBookings: {
    id: string;
    title: string;
    startDatetime: string;
    endDatetime: string;
    status: BookingStatus;
    bookedByName: string;
  }[];
}

export interface ResourceBooking {
  id: string;
  resourceId: string;
  resourceName: string;
  resourceType: ResourceType;
  userId: string;
  bookedByName: string;
  title: string;
  description?: string;
  startDatetime: string;
  endDatetime: string;
  status: BookingStatus;
  notes?: string;
  createdAt: string;
}

export interface CreateResourceData {
  name: string;
  description?: string;
  resourceType: ResourceType;
  categoryId?: string;
  location?: string;
  capacity?: number;
  requiresApproval?: boolean;
  minBookingHours?: number;
  maxBookingHours?: number;
  advanceBookingDays?: number;
  costPerHour?: number;
  costPerDay?: number;
  depositAmount?: number;
  notes?: string;
}

export interface CreateBookingData {
  resourceId: string;
  title: string;
  description?: string;
  startDatetime: string;
  endDatetime: string;
  relatedRehearsalId?: string;
  relatedConcertId?: string;
  relatedProjectId?: string;
  notes?: string;
}

// Categories
export async function getResourceCategories(): Promise<ResourceCategory[]> {
  const response = await api.get('/resources/categories');
  return response.data;
}

export async function createResourceCategory(data: {
  name: string;
  description?: string;
  color?: string;
  icon?: string;
}): Promise<{ id: string; message: string }> {
  const response = await api.post('/resources/categories', data);
  return response.data;
}

export async function deleteResourceCategory(id: string): Promise<{ message: string }> {
  const response = await api.delete(`/resources/categories/${id}`);
  return response.data;
}

// Resources
export async function getResources(filters?: {
  type?: ResourceType;
  categoryId?: string;
  active?: boolean;
}): Promise<Resource[]> {
  const params = new URLSearchParams();
  if (filters?.type) params.append('type', filters.type);
  if (filters?.categoryId) params.append('categoryId', filters.categoryId);
  if (filters?.active !== undefined) params.append('active', String(filters.active));
  const response = await api.get(`/resources?${params.toString()}`);
  return response.data;
}

export async function getResource(id: string): Promise<ResourceDetail> {
  const response = await api.get(`/resources/${id}`);
  return response.data;
}

export async function createResource(data: CreateResourceData): Promise<{ id: string; message: string }> {
  const response = await api.post('/resources', data);
  return response.data;
}

export async function updateResource(id: string, data: Partial<CreateResourceData>): Promise<{ message: string }> {
  const response = await api.patch(`/resources/${id}`, data);
  return response.data;
}

export async function deleteResource(id: string): Promise<{ message: string }> {
  const response = await api.delete(`/resources/${id}`);
  return response.data;
}

// Bookings
export async function getResourceBookings(filters?: {
  resourceId?: string;
  status?: BookingStatus;
  startDate?: string;
  endDate?: string;
  myBookings?: boolean;
}): Promise<ResourceBooking[]> {
  const params = new URLSearchParams();
  if (filters?.resourceId) params.append('resourceId', filters.resourceId);
  if (filters?.status) params.append('status', filters.status);
  if (filters?.startDate) params.append('startDate', filters.startDate);
  if (filters?.endDate) params.append('endDate', filters.endDate);
  if (filters?.myBookings) params.append('myBookings', 'true');
  const response = await api.get(`/resources/bookings?${params.toString()}`);
  return response.data;
}

export async function createResourceBooking(
  data: CreateBookingData,
): Promise<{ id: string; status: BookingStatus; message: string }> {
  const response = await api.post('/resources/bookings', data);
  return response.data;
}

export async function approveBooking(id: string): Promise<{ message: string }> {
  const response = await api.patch(`/resources/bookings/${id}/approve`);
  return response.data;
}

export async function rejectBooking(id: string, reason?: string): Promise<{ message: string }> {
  const response = await api.patch(`/resources/bookings/${id}/reject`, { reason });
  return response.data;
}

export async function cancelBooking(id: string): Promise<{ message: string }> {
  const response = await api.delete(`/resources/bookings/${id}`);
  return response.data;
}

// Availability rules
export interface AddAvailabilityData {
  dayOfWeek?: number; // 0=Sunday, 1=Monday, ..., 6=Saturday
  startTime: string; // HH:mm format
  endTime: string; // HH:mm format
  isAvailable: boolean;
  startDate?: string; // ISO date for date range rules
  endDate?: string; // ISO date for date range rules
}

export async function addResourceAvailability(
  resourceId: string,
  data: AddAvailabilityData,
): Promise<{ id: string; message: string }> {
  // availabilitySchema in backend/src/routes/resources.ts eist een
  // `availabilityType` uit de enum available/blocked/maintenance en kent geen
  // `isAvailable`. Zonder deze vertaling werd elke beschikbaarheidsregel met
  // een 400 afgewezen en kon er geen enkele regel worden toegevoegd.
  const { isAvailable, ...rest } = data;
  const response = await api.post(`/resources/${resourceId}/availability`, {
    availabilityType: isAvailable ? 'available' : 'blocked',
    ...rest,
  });
  return response.data;
}

export async function deleteResourceAvailability(resourceId: string, ruleId: string): Promise<{ message: string }> {
  const response = await api.delete(`/resources/${resourceId}/availability/${ruleId}`);
  return response.data;
}

// Category management
export async function updateResourceCategory(
  categoryId: string,
  data: { name?: string; color?: string; icon?: string },
): Promise<{ message: string }> {
  const response = await api.patch(`/resources/categories/${categoryId}`, data);
  return response.data;
}

export async function reorderResourceCategories(categoryIds: string[]): Promise<{ message: string }> {
  const response = await api.put('/resources/categories/reorder', { categoryIds });
  return response.data;
}
