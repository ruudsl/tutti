import api from './client';
import type { SeatingSection, SeatingAssignment, SeatingNeighbor, RehearsalSeat, SeatingChart } from '../types';

// Seating Sections
export const getSeatingSections = async (orchestraId: string): Promise<SeatingSection[]> => {
  const { data } = await api.get(`/seating/sections/${orchestraId}`);
  return data;
};

export const createDefaultSeatingLayout = async (orchestraId: string): Promise<{ message: string }> => {
  const { data } = await api.post(`/seating/sections/${orchestraId}/default`);
  return data;
};

export const createSeatingSection = async (section: {
  orchestraId: string;
  name: string;
  rowNumber: number;
  instrumentIds?: string[];
}): Promise<{ id: string; message: string }> => {
  const { data } = await api.post('/seating/sections', section);
  return data;
};

export const updateSeatingSection = async (id: string, section: {
  name?: string;
  rowNumber?: number;
  instrumentIds?: string[];
}): Promise<{ message: string }> => {
  const { data } = await api.put(`/seating/sections/${id}`, section);
  return data;
};

export const deleteSeatingSection = async (id: string): Promise<{ message: string }> => {
  const { data } = await api.delete(`/seating/sections/${id}`);
  return data;
};

export const deleteAllSeatingSections = async (orchestraId: string): Promise<{ message: string }> => {
  const { data } = await api.delete(`/seating/sections/orchestra/${orchestraId}`);
  return data;
};

// Seating Assignments
export const getSeatingAssignments = async (orchestraId: string): Promise<SeatingAssignment[]> => {
  const { data } = await api.get(`/seating/assignments/${orchestraId}`);
  return data;
};

export const createSeatingAssignment = async (assignment: {
  orchestraId: string;
  userId: string;
  sectionId: string;
  positionInSection: number;
  seatLabel?: string;
  notes?: string;
}): Promise<{ id: string; message: string }> => {
  const { data } = await api.post('/seating/assignments', assignment);
  return data;
};

export const updateSeatingAssignment = async (id: string, assignment: {
  sectionId?: string;
  positionInSection?: number;
  seatLabel?: string;
  notes?: string;
}): Promise<{ message: string }> => {
  const { data } = await api.put(`/seating/assignments/${id}`, assignment);
  return data;
};

export const deleteSeatingAssignment = async (id: string): Promise<{ message: string }> => {
  const { data } = await api.delete(`/seating/assignments/${id}`);
  return data;
};

export const bulkUpdateSeatingAssignments = async (orchestraId: string, assignments: {
  userId: string;
  sectionId: string;
  positionInSection: number;
}[]): Promise<{ message: string }> => {
  const { data } = await api.put(`/seating/assignments/bulk/${orchestraId}`, { assignments });
  return data;
};

// Seating Neighbors
export const getSeatingNeighbors = async (orchestraId: string): Promise<SeatingNeighbor[]> => {
  const { data } = await api.get(`/seating/neighbors/${orchestraId}`);
  return data;
};

export const createSeatingNeighbor = async (neighbor: {
  orchestraId: string;
  userId: string;
  neighborUserId: string;
  preference: 'preferred' | 'avoid';
}): Promise<{ id: string; message: string }> => {
  const { data } = await api.post('/seating/neighbors', neighbor);
  return data;
};

export const deleteSeatingNeighbor = async (id: string): Promise<{ message: string }> => {
  const { data } = await api.delete(`/seating/neighbors/${id}`);
  return data;
};

// Rehearsal Seating
export const getRehearsalSeating = async (rehearsalId: string): Promise<RehearsalSeat[]> => {
  const { data } = await api.get(`/seating/rehearsal/${rehearsalId}`);
  return data;
};

export const generateRehearsalSeating = async (rehearsalId: string): Promise<{ message: string; memberCount: number }> => {
  const { data } = await api.post(`/seating/rehearsal/${rehearsalId}/generate`);
  return data;
};

export const updateRehearsalSeat = async (rehearsalId: string, seatId: string, seat: {
  rowNumber: number;
  positionInRow: number;
}): Promise<{ message: string }> => {
  const { data } = await api.put(`/seating/rehearsal/${rehearsalId}/seat/${seatId}`, seat);
  return data;
};

// Seating Chart
export const getSeatingChart = async (orchestraId: string, rehearsalId?: string): Promise<SeatingChart> => {
  const params = rehearsalId ? { rehearsalId } : {};
  const { data } = await api.get(`/seating/chart/${orchestraId}`, { params });
  return data;
};

// Seating Notifications
export interface SeatingNotificationSettings {
  id: string;
  orchestra_id: string;
  notification_type: 'webhook' | 'whatsapp';
  webhook_url: string | null;
  twilio_account_sid: string | null;
  twilio_auth_token: string | null;
  twilio_whatsapp_from: string | null;
  twilio_whatsapp_to: string | null;
  minutes_before: number;
  enabled: boolean;
  include_image: boolean;
  message_template: string | null;
  created_at: string;
  updated_at: string;
}

export interface SeatingNotificationLog {
  id: string;
  rehearsal_id: string;
  orchestra_id: string;
  sent_at: string;
  status: 'pending' | 'sent' | 'failed';
  error_message: string | null;
  webhook_response: string | null;
}

export const getSeatingNotificationSettings = async (orchestraId: string): Promise<SeatingNotificationSettings | null> => {
  const { data } = await api.get(`/seating-notifications/settings/${orchestraId}`);
  return data;
};

export const saveSeatingNotificationSettings = async (orchestraId: string, settings: {
  notification_type: 'webhook' | 'whatsapp';
  webhook_url?: string;
  twilio_account_sid?: string;
  twilio_auth_token?: string;
  twilio_whatsapp_from?: string;
  twilio_whatsapp_to?: string;
  minutes_before: number;
  enabled: boolean;
  include_image: boolean;
  message_template?: string;
}): Promise<SeatingNotificationSettings> => {
  const { data } = await api.put(`/seating-notifications/settings/${orchestraId}`, settings);
  return data;
};

export const deleteSeatingNotificationSettings = async (orchestraId: string): Promise<{ success: boolean }> => {
  const { data } = await api.delete(`/seating-notifications/settings/${orchestraId}`);
  return data;
};

export const getSeatingNotificationLogs = async (rehearsalId: string): Promise<SeatingNotificationLog[]> => {
  const { data } = await api.get(`/seating-notifications/logs/${rehearsalId}`);
  return data;
};

export const sendSeatingNotification = async (rehearsalId: string, imageBase64?: string): Promise<{ success: boolean; message: string }> => {
  const { data } = await api.post(`/seating-notifications/send/${rehearsalId}`, { imageBase64 });
  return data;
};

export const testTwilioConnection = async (settings: {
  account_sid: string;
  auth_token: string;
  whatsapp_from: string;
  whatsapp_to: string;
}): Promise<{ success: boolean; message: string }> => {
  const { data } = await api.post('/seating-notifications/test-twilio', settings);
  return data;
};
