import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../lib/queryClient';
import {
  getEquipment,
  getEquipmentItem,
  getEquipmentTypes,
  getMaintenanceAlerts,
  createEquipment,
  updateEquipment,
  deleteEquipment,
  addEquipmentDamageLog,
  updateEquipmentDamageLog,
  deleteEquipmentDamageLog,
  createEquipmentLoan,
  returnEquipmentLoan,
  recordEquipmentMaintenance,
} from '../api';
import { showSuccess, showError } from '../utils/toast';
import { getErrorMessage } from '../utils/errors';

/**
 * Hook to fetch equipment types
 */
export function useEquipmentTypes() {
  return useQuery({
    queryKey: queryKeys.equipmentTypes,
    queryFn: getEquipmentTypes,
  });
}

/**
 * Hook to fetch maintenance alerts
 */
export function useMaintenanceAlerts() {
  return useQuery({
    queryKey: queryKeys.maintenanceAlerts,
    queryFn: getMaintenanceAlerts,
  });
}

/**
 * Hook to fetch equipment with filters
 */
export function useEquipment(filters?: { search?: string; status?: string; type?: string }) {
  return useQuery({
    queryKey: queryKeys.equipment(filters as Record<string, string>),
    queryFn: () => getEquipment(filters),
  });
}

/**
 * Hook to fetch single equipment item with history
 */
export function useEquipmentItem(id: string) {
  return useQuery({
    queryKey: queryKeys.equipmentItem(id),
    queryFn: () => getEquipmentItem(id),
    enabled: !!id,
  });
}

/**
 * Hook to create new equipment
 */
export function useCreateEquipment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createEquipment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
      showSuccess('Instrument toegevoegd');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to update equipment
 */
export function useUpdateEquipment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateEquipment>[1] }) =>
      updateEquipment(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.equipmentItem(id) });
      showSuccess('Instrument bijgewerkt');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to delete equipment
 */
export function useDeleteEquipment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteEquipment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
      showSuccess('Instrument verwijderd');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to add damage log
 */
export function useAddEquipmentDamageLog() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ equipmentId, log }: { equipmentId: string; log: Parameters<typeof addEquipmentDamageLog>[1] }) =>
      addEquipmentDamageLog(equipmentId, log),
    onSuccess: (_, { equipmentId }) => {
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.equipmentItem(equipmentId) });
      showSuccess('Schademelding toegevoegd');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to update damage log
 */
export function useUpdateEquipmentDamageLog() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ equipmentId, logId, log }: {
      equipmentId: string;
      logId: string;
      log: Parameters<typeof updateEquipmentDamageLog>[2]
    }) => updateEquipmentDamageLog(equipmentId, logId, log),
    onSuccess: (_, { equipmentId }) => {
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.equipmentItem(equipmentId) });
      showSuccess('Schademelding bijgewerkt');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to delete damage log
 */
export function useDeleteEquipmentDamageLog() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ equipmentId, logId }: { equipmentId: string; logId: string }) =>
      deleteEquipmentDamageLog(equipmentId, logId),
    onSuccess: (_, { equipmentId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.equipmentItem(equipmentId) });
      showSuccess('Schademelding verwijderd');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to create equipment loan
 */
export function useCreateEquipmentLoan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ equipmentId, loan }: { equipmentId: string; loan: Parameters<typeof createEquipmentLoan>[1] }) =>
      createEquipmentLoan(equipmentId, loan),
    onSuccess: (_, { equipmentId }) => {
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.equipmentItem(equipmentId) });
      showSuccess('Instrument uitgeleend');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to return equipment loan
 */
export function useReturnEquipmentLoan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ equipmentId, loanId, returnData }: {
      equipmentId: string;
      loanId: string;
      returnData: Parameters<typeof returnEquipmentLoan>[2]
    }) => returnEquipmentLoan(equipmentId, loanId, returnData),
    onSuccess: (_, { equipmentId }) => {
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.equipmentItem(equipmentId) });
      showSuccess('Instrument teruggebracht');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to record maintenance
 */
export function useRecordEquipmentMaintenance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ equipmentId, maintenance }: {
      equipmentId: string;
      maintenance: Parameters<typeof recordEquipmentMaintenance>[1]
    }) => recordEquipmentMaintenance(equipmentId, maintenance),
    onSuccess: (_, { equipmentId }) => {
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.equipmentItem(equipmentId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.maintenanceAlerts });
      showSuccess('Onderhoud geregistreerd');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}
