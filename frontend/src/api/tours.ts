import api from './client';

export type TourStatus = 'planning' | 'confirmed' | 'active' | 'completed' | 'cancelled';
export type ParticipantStatus = 'invited' | 'registered' | 'confirmed' | 'declined' | 'cancelled' | 'waitlist';

export interface Tour {
  id: string;
  name: string;
  description?: string;
  destination?: string;
  country?: string;
  startDate: string;
  endDate: string;
  status: TourStatus;
  projectId?: string;
  projectName?: string;
  budget?: number;
  costPerPerson?: number;
  maxParticipants?: number;
  registrationDeadline?: string;
  participantCount: number;
  dayCount: number;
  createdAt: string;
}

export interface TourParticipant {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  status: ParticipantStatus;
  paymentStatus: string;
  paidAmount: number;
  registrationDate?: string;
}

export interface TourActivity {
  id: string;
  activityType: string;
  title: string;
  description?: string;
  location?: string;
  address?: string;
  startTime?: string;
  endTime?: string;
  isMandatory: boolean;
  cost?: number;
  notes?: string;
  sortOrder: number;
}

export interface TourDay {
  id: string;
  dayDate: string;
  dayNumber: number;
  title?: string;
  description?: string;
  activities: TourActivity[];
}

export interface TourAccommodation {
  id: string;
  name: string;
  address?: string;
  city?: string;
  country?: string;
  phone?: string;
  email?: string;
  website?: string;
  checkInDate?: string;
  checkOutDate?: string;
  roomCount?: number;
  costPerNight?: number;
  totalCost?: number;
  confirmationNumber?: string;
  notes?: string;
}

export interface TourDetail extends Tour {
  notes?: string;
  coverImagePath?: string;
  createdBy: string;
  createdByName: string;
  myRegistration?: {
    status: ParticipantStatus;
    paymentStatus: string;
    paidAmount: number;
    registrationDate?: string;
  };
  participants: TourParticipant[];
  days: TourDay[];
  accommodations: TourAccommodation[];
  transport: {
    id: string;
    transportType: string;
    provider?: string;
    departureLocation?: string;
    departureTime?: string;
    arrivalLocation?: string;
    arrivalTime?: string;
  }[];
}

export interface CreateTourData {
  name: string;
  description?: string;
  destination?: string;
  country?: string;
  startDate: string;
  endDate: string;
  projectId?: string;
  budget?: number;
  costPerPerson?: number;
  maxParticipants?: number;
  registrationDeadline?: string;
  notes?: string;
}

export async function getTours(filters?: { status?: TourStatus; year?: string }): Promise<Tour[]> {
  const params = new URLSearchParams();
  if (filters?.status) params.append('status', filters.status);
  if (filters?.year) params.append('year', filters.year);
  const response = await api.get(`/tours?${params.toString()}`);
  return response.data;
}

export async function getTour(id: string): Promise<TourDetail> {
  const response = await api.get(`/tours/${id}`);
  return response.data;
}

export async function createTour(data: CreateTourData): Promise<{ id: string; message: string }> {
  const response = await api.post('/tours', data);
  return response.data;
}

export async function updateTour(id: string, data: Partial<CreateTourData>): Promise<{ message: string }> {
  const response = await api.patch(`/tours/${id}`, data);
  return response.data;
}

export async function updateTourStatus(id: string, status: TourStatus): Promise<{ message: string }> {
  const response = await api.patch(`/tours/${id}/status`, { status });
  return response.data;
}

export async function deleteTour(id: string): Promise<{ message: string }> {
  const response = await api.delete(`/tours/${id}`);
  return response.data;
}

export async function registerForTour(
  tourId: string,
  data?: {
    roomPreference?: string;
    dietaryRequirements?: string;
    emergencyContact?: string;
    emergencyPhone?: string;
    notes?: string;
  },
): Promise<{ id: string; status: string; message: string }> {
  const response = await api.post(`/tours/${tourId}/register`, data || {});
  return response.data;
}

export async function cancelTourRegistration(tourId: string): Promise<{ message: string }> {
  const response = await api.delete(`/tours/${tourId}/register`);
  return response.data;
}

export async function addTourAccommodation(
  tourId: string,
  data: Partial<TourAccommodation>,
): Promise<{ id: string; message: string }> {
  const response = await api.post(`/tours/${tourId}/accommodations`, data);
  return response.data;
}

export async function removeTourAccommodation(tourId: string, accId: string): Promise<{ message: string }> {
  const response = await api.delete(`/tours/${tourId}/accommodations/${accId}`);
  return response.data;
}

// Tour Days API
export interface AddTourDayData {
  date: string;
  title?: string;
}

export async function addTourDay(tourId: string, data: AddTourDayData): Promise<{ id: string; message: string }> {
  const response = await api.post(`/tours/${tourId}/days`, data);
  return response.data;
}

export async function deleteTourDay(tourId: string, dayId: string): Promise<{ message: string }> {
  const response = await api.delete(`/tours/${tourId}/days/${dayId}`);
  return response.data;
}

// Tour Day Activities API
export interface AddDayActivityData {
  time: string;
  title: string;
  description?: string;
  location?: string;
}

export async function addDayActivity(
  tourId: string,
  dayId: string,
  data: AddDayActivityData,
): Promise<{ id: string; message: string }> {
  const response = await api.post(`/tours/${tourId}/days/${dayId}/activities`, data);
  return response.data;
}

export async function deleteDayActivity(
  tourId: string,
  dayId: string,
  activityId: string,
): Promise<{ message: string }> {
  const response = await api.delete(`/tours/${tourId}/days/${dayId}/activities/${activityId}`);
  return response.data;
}

// Tour Transport API
export interface AddTourTransportData {
  type: string;
  departureTime: string;
  arrivalTime: string;
  from: string;
  to: string;
  details?: string;
}

export async function addTourTransport(
  tourId: string,
  data: AddTourTransportData,
): Promise<{ id: string; message: string }> {
  const response = await api.post(`/tours/${tourId}/transport`, data);
  return response.data;
}

export async function deleteTourTransport(tourId: string, transportId: string): Promise<{ message: string }> {
  const response = await api.delete(`/tours/${tourId}/transport/${transportId}`);
  return response.data;
}
