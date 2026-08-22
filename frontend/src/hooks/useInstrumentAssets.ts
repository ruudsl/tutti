import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getAssetCategories,
  getAssetStatuses,
  getAssetConditions,
  getInstrumentAssets,
  getInstrumentAssetsSummary,
  getMaintenanceDueAssets,
  getInstrumentAsset,
  createInstrumentAsset,
  updateInstrumentAsset,
  deleteInstrumentAsset,
  recordAssetMaintenance,
  getAssetValuations,
  createAssetValuation,
  getAssetRepairs,
  createAssetRepair,
  updateAssetRepair,
  getAssetLoans,
  createAssetLoan,
  returnAssetLoan,
  getAssetDocuments,
  createAssetDocument,
  deleteAssetDocument,
  getAssetHistory,
  getInsurancePolicies,
  getInsurancePoliciesSummary,
  getExpiringPolicies,
  getInsurancePolicy,
  createInsurancePolicy,
  updateInsurancePolicy,
  deleteInsurancePolicy,
  addAssetToPolicyCoverage,
  removeAssetFromPolicyCoverage,
  getInsuranceClaims,
  getInsuranceClaim,
  createInsuranceClaim,
  updateInsuranceClaim,
} from '../api/instrument-assets';
import { showSuccess, showError } from '../utils/toast';
import { getErrorMessage } from '../utils/errors';

const queryKeys = {
  assetCategories: ['instrumentAssets', 'categories'] as const,
  assetStatuses: ['instrumentAssets', 'statuses'] as const,
  assetConditions: ['instrumentAssets', 'conditions'] as const,
  assets: (filters?: Record<string, string>) => ['instrumentAssets', 'list', filters] as const,
  assetsSummary: ['instrumentAssets', 'summary'] as const,
  maintenanceDue: (days?: number) => ['instrumentAssets', 'maintenanceDue', days] as const,
  asset: (id: string) => ['instrumentAssets', 'detail', id] as const,
  valuations: (assetId: string) => ['instrumentAssets', 'valuations', assetId] as const,
  repairs: (assetId: string) => ['instrumentAssets', 'repairs', assetId] as const,
  loans: (assetId: string) => ['instrumentAssets', 'loans', assetId] as const,
  documents: (assetId: string) => ['instrumentAssets', 'documents', assetId] as const,
  history: (assetId: string, params?: { page?: number; limit?: number }) =>
    ['instrumentAssets', 'history', assetId, params] as const,
  insurancePolicies: (filters?: Record<string, string>) => ['insurance', 'policies', filters] as const,
  insuranceSummary: ['insurance', 'summary'] as const,
  expiringPolicies: (days?: number) => ['insurance', 'expiring', days] as const,
  insurancePolicy: (id: string) => ['insurance', 'policy', id] as const,
  insuranceClaims: (filters?: Record<string, string>) => ['insurance', 'claims', filters] as const,
  insuranceClaim: (id: string) => ['insurance', 'claim', id] as const,
};

// ===========================================
// METADATA HOOKS
// ===========================================

export function useAssetCategories() {
  return useQuery({
    queryKey: queryKeys.assetCategories,
    queryFn: getAssetCategories,
    staleTime: Infinity,
  });
}

export function useAssetStatuses() {
  return useQuery({
    queryKey: queryKeys.assetStatuses,
    queryFn: getAssetStatuses,
    staleTime: Infinity,
  });
}

export function useAssetConditions() {
  return useQuery({
    queryKey: queryKeys.assetConditions,
    queryFn: getAssetConditions,
    staleTime: Infinity,
  });
}

// ===========================================
// ASSET HOOKS
// ===========================================

export function useInstrumentAssets(filters?: {
  search?: string;
  status?: string;
  category?: string;
  condition?: string;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: queryKeys.assets(filters as Record<string, string>),
    queryFn: () => getInstrumentAssets(filters),
  });
}

export function useInstrumentAssetsSummary() {
  return useQuery({
    queryKey: queryKeys.assetsSummary,
    queryFn: getInstrumentAssetsSummary,
  });
}

export function useMaintenanceDueAssets(days?: number) {
  return useQuery({
    queryKey: queryKeys.maintenanceDue(days),
    queryFn: () => getMaintenanceDueAssets(days),
  });
}

export function useInstrumentAsset(id: string) {
  return useQuery({
    queryKey: queryKeys.asset(id),
    queryFn: () => getInstrumentAsset(id),
    enabled: !!id,
  });
}

export function useCreateInstrumentAsset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createInstrumentAsset,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instrumentAssets'] });
      showSuccess('Instrument toegevoegd');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

export function useUpdateInstrumentAsset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateInstrumentAsset>[1] }) =>
      updateInstrumentAsset(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['instrumentAssets'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.asset(id) });
      showSuccess('Instrument bijgewerkt');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

export function useDeleteInstrumentAsset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteInstrumentAsset,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instrumentAssets'] });
      showSuccess('Instrument verwijderd');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

export function useRecordAssetMaintenance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof recordAssetMaintenance>[1] }) =>
      recordAssetMaintenance(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['instrumentAssets'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.asset(id) });
      showSuccess('Onderhoud geregistreerd');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

// ===========================================
// VALUATION HOOKS
// ===========================================

export function useAssetValuations(assetId: string) {
  return useQuery({
    queryKey: queryKeys.valuations(assetId),
    queryFn: () => getAssetValuations(assetId),
    enabled: !!assetId,
  });
}

export function useCreateAssetValuation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ assetId, data }: { assetId: string; data: Parameters<typeof createAssetValuation>[1] }) =>
      createAssetValuation(assetId, data),
    onSuccess: (_, { assetId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.valuations(assetId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.asset(assetId) });
      // Een waardering wijzigt current_value op het instrument zelf, dus ook
      // de overzichtslijst en de samenvatting (totale waarde) zijn verouderd.
      queryClient.invalidateQueries({ queryKey: ['instrumentAssets'] });
      showSuccess('Waardering toegevoegd');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

// ===========================================
// REPAIR HOOKS
// ===========================================

export function useAssetRepairs(assetId: string) {
  return useQuery({
    queryKey: queryKeys.repairs(assetId),
    queryFn: () => getAssetRepairs(assetId),
    enabled: !!assetId,
  });
}

export function useCreateAssetRepair() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ assetId, data }: { assetId: string; data: Parameters<typeof createAssetRepair>[1] }) =>
      createAssetRepair(assetId, data),
    onSuccess: (_, { assetId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.repairs(assetId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.asset(assetId) });
      // De backend zet het instrument op 'in_repair'; zonder dit blijft de
      // overzichtslijst het als beschikbaar tonen.
      queryClient.invalidateQueries({ queryKey: ['instrumentAssets'] });
      showSuccess('Reparatie aangemeld');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

export function useUpdateAssetRepair() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      assetId,
      repairId,
      data,
    }: {
      assetId: string;
      repairId: string;
      data: Parameters<typeof updateAssetRepair>[2];
    }) => updateAssetRepair(assetId, repairId, data),
    onSuccess: (_, { assetId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.repairs(assetId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.asset(assetId) });
      // Een afgeronde reparatie zet het instrument terug op 'available'.
      queryClient.invalidateQueries({ queryKey: ['instrumentAssets'] });
      showSuccess('Reparatie bijgewerkt');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

// ===========================================
// LOAN HOOKS
// ===========================================

export function useAssetLoans(assetId: string) {
  return useQuery({
    queryKey: queryKeys.loans(assetId),
    queryFn: () => getAssetLoans(assetId),
    enabled: !!assetId,
  });
}

export function useCreateAssetLoan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ assetId, data }: { assetId: string; data: Parameters<typeof createAssetLoan>[1] }) =>
      createAssetLoan(assetId, data),
    onSuccess: (_, { assetId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.loans(assetId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.asset(assetId) });
      queryClient.invalidateQueries({ queryKey: ['instrumentAssets'] });
      showSuccess('Instrument uitgeleend');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

export function useReturnAssetLoan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      assetId,
      loanId,
      data,
    }: {
      assetId: string;
      loanId: string;
      data: Parameters<typeof returnAssetLoan>[2];
    }) => returnAssetLoan(assetId, loanId, data),
    onSuccess: (_, { assetId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.loans(assetId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.asset(assetId) });
      queryClient.invalidateQueries({ queryKey: ['instrumentAssets'] });
      showSuccess('Instrument teruggebracht');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

// ===========================================
// DOCUMENT HOOKS
// ===========================================

export function useAssetDocuments(assetId: string) {
  return useQuery({
    queryKey: queryKeys.documents(assetId),
    queryFn: () => getAssetDocuments(assetId),
    enabled: !!assetId,
  });
}

export function useCreateAssetDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ assetId, data }: { assetId: string; data: Parameters<typeof createAssetDocument>[1] }) =>
      createAssetDocument(assetId, data),
    onSuccess: (_, { assetId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.documents(assetId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.asset(assetId) });
      showSuccess('Document toegevoegd');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

export function useDeleteAssetDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ assetId, documentId }: { assetId: string; documentId: string }) =>
      deleteAssetDocument(assetId, documentId),
    onSuccess: (_, { assetId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.documents(assetId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.asset(assetId) });
      showSuccess('Document verwijderd');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

// ===========================================
// HISTORY HOOKS
// ===========================================

export function useAssetHistory(assetId: string, params?: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: queryKeys.history(assetId, params),
    queryFn: () => getAssetHistory(assetId, params),
    enabled: !!assetId,
  });
}

// ===========================================
// INSURANCE POLICY HOOKS
// ===========================================

export function useInsurancePolicies(filters?: { status?: string; page?: number; limit?: number }) {
  return useQuery({
    queryKey: queryKeys.insurancePolicies(filters as Record<string, string>),
    queryFn: () => getInsurancePolicies(filters),
  });
}

export function useInsurancePoliciesSummary() {
  return useQuery({
    queryKey: queryKeys.insuranceSummary,
    queryFn: getInsurancePoliciesSummary,
  });
}

export function useExpiringPolicies(days?: number) {
  return useQuery({
    queryKey: queryKeys.expiringPolicies(days),
    queryFn: () => getExpiringPolicies(days),
  });
}

export function useInsurancePolicy(id: string) {
  return useQuery({
    queryKey: queryKeys.insurancePolicy(id),
    queryFn: () => getInsurancePolicy(id),
    enabled: !!id,
  });
}

export function useCreateInsurancePolicy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createInsurancePolicy,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['insurance'] });
      showSuccess('Verzekeringspolis aangemaakt');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

export function useUpdateInsurancePolicy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateInsurancePolicy>[1] }) =>
      updateInsurancePolicy(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['insurance'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.insurancePolicy(id) });
      showSuccess('Verzekeringspolis bijgewerkt');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

export function useDeleteInsurancePolicy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteInsurancePolicy,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['insurance'] });
      showSuccess('Verzekeringspolis geannuleerd');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

export function useAddAssetToPolicyCoverage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ policyId, data }: { policyId: string; data: Parameters<typeof addAssetToPolicyCoverage>[1] }) =>
      addAssetToPolicyCoverage(policyId, data),
    onSuccess: (_, { policyId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.insurancePolicy(policyId) });
      queryClient.invalidateQueries({ queryKey: ['instrumentAssets'] });
      showSuccess('Instrument toegevoegd aan polis');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

export function useRemoveAssetFromPolicyCoverage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ policyId, coverageId }: { policyId: string; coverageId: string }) =>
      removeAssetFromPolicyCoverage(policyId, coverageId),
    onSuccess: (_, { policyId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.insurancePolicy(policyId) });
      queryClient.invalidateQueries({ queryKey: ['instrumentAssets'] });
      showSuccess('Instrument verwijderd van polis');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

// ===========================================
// INSURANCE CLAIM HOOKS
// ===========================================

export function useInsuranceClaims(filters?: { status?: string; page?: number; limit?: number }) {
  return useQuery({
    queryKey: queryKeys.insuranceClaims(filters as Record<string, string>),
    queryFn: () => getInsuranceClaims(filters),
  });
}

export function useInsuranceClaim(id: string) {
  return useQuery({
    queryKey: queryKeys.insuranceClaim(id),
    queryFn: () => getInsuranceClaim(id),
    enabled: !!id,
  });
}

export function useCreateInsuranceClaim() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createInsuranceClaim,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['insurance'] });
      showSuccess('Schadeclaim ingediend');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

export function useUpdateInsuranceClaim() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateInsuranceClaim>[1] }) =>
      updateInsuranceClaim(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['insurance'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.insuranceClaim(id) });
      showSuccess('Claim bijgewerkt');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}
