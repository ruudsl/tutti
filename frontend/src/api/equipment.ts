import api from './client';
import type { Equipment, EquipmentDetail, MaintenanceAlert } from '../types';

export const getEquipmentTypes = async (): Promise<string[]> => {
  const { data } = await api.get('/equipment/types');
  return data;
};

export const getMaintenanceAlerts = async (): Promise<MaintenanceAlert[]> => {
  const { data } = await api.get('/equipment/maintenance-alerts');
  return data;
};

export const getEquipment = async (filters?: {
  search?: string;
  status?: string;
  type?: string;
}): Promise<{ data: Equipment[]; total: number; page: number; limit: number }> => {
  const { data } = await api.get('/equipment', { params: filters });
  return data;
};

export const getEquipmentItem = async (id: string): Promise<EquipmentDetail> => {
  const { data } = await api.get(`/equipment/${id}`);
  return data;
};

export const createEquipment = async (equipment: {
  instrumentType: string;
  brandModel?: string;
  serialNumber?: string;
  yearOfManufacture?: number;
  status?: string;
  currentUserId?: string | null;
  notes?: string;
  maintenanceIntervalMonths?: number;
  lastMaintenanceDate?: string;
  purchasePrice?: number;
  currentValue?: number;
}): Promise<{ id: string }> => {
  const { data } = await api.post('/equipment', equipment);
  return data;
};

export const updateEquipment = async (id: string, equipment: {
  instrumentType?: string;
  brandModel?: string;
  serialNumber?: string;
  yearOfManufacture?: number;
  status?: string;
  currentUserId?: string | null;
  notes?: string;
  maintenanceIntervalMonths?: number;
  lastMaintenanceDate?: string;
  purchasePrice?: number;
  currentValue?: number;
}): Promise<void> => {
  await api.put(`/equipment/${id}`, equipment);
};

export const deleteEquipment = async (id: string): Promise<void> => {
  await api.delete(`/equipment/${id}`);
};

export const addEquipmentDamageLog = async (equipmentId: string, log: {
  date: string;
  description: string;
  repairCost?: number;
  repairedBy?: string;
  status?: string;
}): Promise<{ id: string }> => {
  const { data } = await api.post(`/equipment/${equipmentId}/damage-logs`, log);
  return data;
};

export const updateEquipmentDamageLog = async (equipmentId: string, logId: string, log: {
  date?: string;
  description?: string;
  repairCost?: number;
  repairedBy?: string;
  status?: string;
}): Promise<void> => {
  await api.put(`/equipment/${equipmentId}/damage-logs/${logId}`, log);
};

export const deleteEquipmentDamageLog = async (equipmentId: string, logId: string): Promise<void> => {
  await api.delete(`/equipment/${equipmentId}/damage-logs/${logId}`);
};

export const createEquipmentLoan = async (equipmentId: string, loan: {
  userId: string;
  loanDate: string;
  conditionAtLoan?: string;
  notes?: string;
}): Promise<{ id: string }> => {
  const { data } = await api.post(`/equipment/${equipmentId}/loans`, loan);
  return data;
};

export const returnEquipmentLoan = async (equipmentId: string, loanId: string, returnData: {
  returnDate: string;
  conditionAtReturn?: string;
}): Promise<void> => {
  await api.post(`/equipment/${equipmentId}/loans/${loanId}/return`, returnData);
};

export const recordEquipmentMaintenance = async (equipmentId: string, maintenance: {
  date?: string;
  notes?: string;
}): Promise<{ nextMaintenanceDate: string }> => {
  const { data } = await api.post(`/equipment/${equipmentId}/record-maintenance`, maintenance);
  return data;
};
