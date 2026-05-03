import api from './client';
import type { PaymentSettings, MollieStatus } from '../types';

export const getPaymentSettings = async (): Promise<PaymentSettings> => {
  const { data } = await api.get('/payment-settings');
  return data;
};

export const updatePaymentSettings = async (settings: {
  passFeesToCustomer?: boolean;
}): Promise<{ success: boolean }> => {
  const { data } = await api.put('/payment-settings', settings);
  return data;
};

export const updatePaymentMethodFee = async (method: string, fee: {
  customerFee: number;
  isEnabled?: boolean;
}): Promise<{ success: boolean }> => {
  const { data } = await api.put(`/payment-settings/fees/${method}`, fee);
  return data;
};

export const connectMollie = async (
  apiKey: string,
  mode?: 'live' | 'test'
): Promise<{
  success: boolean;
  profileId: string;
  organisationName: string;
  canReceivePayments: boolean;
  mode: 'live' | 'test';
}> => {
  const { data } = await api.post('/payment-settings/mollie/connect', { apiKey, mode });
  return data;
};

export const disconnectMollie = async (): Promise<{ success: boolean }> => {
  const { data } = await api.post('/payment-settings/mollie/disconnect');
  return data;
};

export const setMollieMode = async (mode: 'live' | 'test'): Promise<{ success: boolean; mode: 'live' | 'test' }> => {
  const { data } = await api.put('/payment-settings/mollie/mode', { mode });
  return data;
};

export const deleteMollieKey = async (mode: 'live' | 'test'): Promise<{ success: boolean }> => {
  const { data } = await api.delete(`/payment-settings/mollie/key/${mode}`);
  return data;
};

export const getMollieStatus = async (): Promise<MollieStatus & { statusDescription?: string }> => {
  const { data } = await api.get('/payment-settings/mollie/status');
  return data;
};

export const testMollieConnection = async (): Promise<{
  connected: boolean;
  canReceivePayments: boolean;
  canReceivePayouts: boolean;
  error?: string;
}> => {
  const { data } = await api.get('/payment-settings/mollie/test');
  return data;
};
