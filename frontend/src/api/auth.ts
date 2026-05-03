import api from './client';
import type { User, MfaSetupResponse, LoginResponse } from '../types';

export const login = async (email: string, password: string, mfaCode?: string): Promise<LoginResponse> => {
  const { data } = await api.post('/auth/login', { email, password, mfaCode });
  return data;
};

export const getProfile = async (): Promise<User> => {
  const { data } = await api.get('/auth/me');
  return data;
};

export const changePassword = async (currentPassword: string, newPassword: string): Promise<void> => {
  await api.post('/auth/change-password', { currentPassword, newPassword });
};

export const requestPasswordReset = async (email: string): Promise<{ message: string }> => {
  const { data } = await api.post('/auth/forgot-password', { email });
  return data;
};

export const validateResetToken = async (token: string): Promise<{ valid: boolean }> => {
  const { data } = await api.get(`/auth/reset-password/validate?token=${token}`);
  return data;
};

export const resetPassword = async (token: string, newPassword: string): Promise<{ message: string }> => {
  const { data } = await api.post('/auth/reset-password', { token, newPassword });
  return data;
};

export const setupMfa = async (): Promise<MfaSetupResponse> => {
  const { data } = await api.post('/auth/mfa/setup');
  return data;
};

export const enableMfa = async (code: string): Promise<{ message: string; mfaEnabled: boolean }> => {
  const { data } = await api.post('/auth/mfa/enable', { code });
  return data;
};

export const disableMfa = async (password: string, code?: string): Promise<{ message: string; mfaEnabled: boolean }> => {
  const { data } = await api.post('/auth/mfa/disable', { password, code });
  return data;
};

export const getMfaStatus = async (): Promise<{ mfaEnabled: boolean }> => {
  const { data } = await api.get('/auth/mfa/status');
  return data;
};
