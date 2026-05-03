import api from './client';
import type { GuestListResponse, GuestListEntry } from '../types';

export const getGuestList = async (concertId: string, params?: {
  page?: number;
  limit?: number;
  search?: string;
  ticketsSent?: boolean;
}): Promise<GuestListResponse> => {
  const { data } = await api.get(`/concerts/${concertId}/guest-list`, { params });
  return data;
};

export const addGuest = async (concertId: string, guest: {
  name: string;
  email: string;
  ticketCount: number;
  ticketTypeId?: string | null;
  notes?: string | null;
  organisation?: string | null;
}): Promise<GuestListEntry> => {
  const { data } = await api.post(`/concerts/${concertId}/guest-list`, guest);
  return data;
};

export const updateGuest = async (guestId: string, guest: Partial<{
  name: string;
  email: string;
  ticketCount: number;
  ticketTypeId: string | null;
  notes: string | null;
  organisation: string | null;
}>): Promise<GuestListEntry> => {
  const { data } = await api.put(`/guest-list/${guestId}`, guest);
  return data;
};

export const deleteGuest = async (guestId: string): Promise<void> => {
  await api.delete(`/guest-list/${guestId}`);
};

export const sendGuestTickets = async (guestId: string): Promise<{
  success: boolean;
  orderId: string;
  ticketCount: number;
  tickets: { id: string; code: string }[];
}> => {
  const { data } = await api.post(`/guest-list/${guestId}/send-tickets`);
  return data;
};

export const sendAllGuestTickets = async (concertId: string): Promise<{
  success: boolean;
  sent: number;
  failed: number;
  errors?: string[];
}> => {
  const { data } = await api.post(`/concerts/${concertId}/guest-list/send-all`);
  return data;
};
