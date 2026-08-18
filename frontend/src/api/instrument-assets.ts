import api from './client';
import type {
  InstrumentAsset,
  InstrumentAssetDetail,
  InstrumentValuation,
  InstrumentRepair,
  InstrumentLoan,
  InstrumentDocument,
  InstrumentAssetSummary,
  InsurancePolicy,
  InsurancePolicyDetail,
  InsuranceClaim,
  PaginatedResult,
} from '../types';

// ===========================================
// ASSET ENDPOINTS
// ===========================================

export const getAssetCategories = async (): Promise<string[]> => {
  const { data } = await api.get('/instrument-assets/categories');
  return data;
};

export const getAssetStatuses = async (): Promise<string[]> => {
  const { data } = await api.get('/instrument-assets/statuses');
  return data;
};

export const getAssetConditions = async (): Promise<string[]> => {
  const { data } = await api.get('/instrument-assets/conditions');
  return data;
};

export const getInstrumentAssets = async (filters?: {
  search?: string;
  status?: string;
  category?: string;
  condition?: string;
  page?: number;
  limit?: number;
}): Promise<PaginatedResult<InstrumentAsset>> => {
  const { data } = await api.get('/instrument-assets', { params: filters });
  return data;
};

export const getInstrumentAssetsSummary = async (): Promise<InstrumentAssetSummary> => {
  const { data } = await api.get('/instrument-assets/summary');
  return data;
};

export const getMaintenanceDueAssets = async (days?: number): Promise<InstrumentAsset[]> => {
  const { data } = await api.get('/instrument-assets/maintenance-due', { params: { days } });
  return data;
};

export const getInstrumentAsset = async (id: string): Promise<InstrumentAssetDetail> => {
  const { data } = await api.get(`/instrument-assets/${id}`);
  return data;
};

export const createInstrumentAsset = async (asset: {
  name: string;
  instrumentType: string;
  category: string;
  brand?: string;
  model?: string;
  serialNumber?: string;
  barcode?: string;
  yearManufactured?: number;
  countryOfOrigin?: string;
  color?: string;
  material?: string;
  weightKg?: number;
  dimensions?: string;
  purchaseDate?: string;
  purchasePrice?: number;
  purchaseVendor?: string;
  currentValue?: number;
  replacementValue?: number;
  depreciationRate?: number;
  status?: string;
  condition?: string;
  location?: string;
  storageLocation?: string;
  maintenanceIntervalMonths?: number;
  photoUrls?: string[];
  tags?: string[];
  notes?: string;
  customFields?: Record<string, unknown>;
}): Promise<{ id: string }> => {
  const { data } = await api.post('/instrument-assets', asset);
  return data;
};

export const updateInstrumentAsset = async (
  id: string,
  asset: Partial<Parameters<typeof createInstrumentAsset>[0]>,
): Promise<void> => {
  await api.put(`/instrument-assets/${id}`, asset);
};

export const deleteInstrumentAsset = async (id: string): Promise<void> => {
  await api.delete(`/instrument-assets/${id}`);
};

export const recordAssetMaintenance = async (
  id: string,
  data: { date?: string; notes?: string; cost?: number },
): Promise<{ nextMaintenanceDue: string }> => {
  const response = await api.post(`/instrument-assets/${id}/record-maintenance`, data);
  return response.data;
};

// ===========================================
// VALUATION ENDPOINTS
// ===========================================

export const getAssetValuations = async (assetId: string): Promise<InstrumentValuation[]> => {
  const { data } = await api.get(`/instrument-assets/${assetId}/valuations`);
  return data;
};

export const createAssetValuation = async (
  assetId: string,
  valuation: {
    valuationDate: string;
    valuationType: 'purchase' | 'insurance' | 'sale' | 'appraisal' | 'depreciation';
    valuedAmount: number;
    currency?: string;
    appraiserName?: string;
    appraiserCompany?: string;
    appraiserCredentials?: string;
    valuationMethod?: string;
    marketComparison?: string;
    conditionAtValuation?: string;
    certificateUrl?: string;
    notes?: string;
  },
): Promise<{ id: string }> => {
  const { data } = await api.post(`/instrument-assets/${assetId}/valuations`, valuation);
  return data;
};

// ===========================================
// REPAIR ENDPOINTS
// ===========================================

export const getAssetRepairs = async (assetId: string): Promise<InstrumentRepair[]> => {
  const { data } = await api.get(`/instrument-assets/${assetId}/repairs`);
  return data;
};

export const createAssetRepair = async (
  assetId: string,
  repair: {
    repairType: 'preventive' | 'corrective' | 'emergency' | 'overhaul' | 'cleaning';
    priority?: 'low' | 'normal' | 'high' | 'urgent';
    issueDescription: string;
    diagnosis?: string;
    repairShopName?: string;
    repairShopContact?: string;
    repairShopAddress?: string;
    technicianName?: string;
    estimatedCost?: number;
    estimatedCompletion?: string;
    warrantyClaimRef?: boolean;
    insuranceClaimId?: string;
    notes?: string;
  },
): Promise<{ id: string }> => {
  const { data } = await api.post(`/instrument-assets/${assetId}/repairs`, repair);
  return data;
};

export const updateAssetRepair = async (
  assetId: string,
  repairId: string,
  update: {
    status?: 'pending' | 'approved' | 'in_progress' | 'completed' | 'cancelled';
    diagnosis?: string;
    actualCost?: number;
    partsReplaced?: string;
    laborHours?: number;
    startedDate?: string;
    completedDate?: string;
    invoiceNumber?: string;
    invoiceUrl?: string;
    qualityRating?: number;
    qualityNotes?: string;
    notes?: string;
  },
): Promise<void> => {
  await api.put(`/instrument-assets/${assetId}/repairs/${repairId}`, update);
};

// ===========================================
// LOAN ENDPOINTS
// ===========================================

export const getAssetLoans = async (assetId: string): Promise<InstrumentLoan[]> => {
  const { data } = await api.get(`/instrument-assets/${assetId}/loans`);
  return data;
};

export const createAssetLoan = async (
  assetId: string,
  loan: {
    borrowerUserId: string;
    loanType?: 'standard' | 'trial' | 'long_term' | 'performance';
    purpose?: string;
    loanDate: string;
    expectedReturnDate?: string;
    conditionAtLoan: string;
    accessoriesLoaned?: string[];
    depositAmount?: number;
    insuranceRequired?: boolean;
    rentalFee?: number;
    rentalPeriod?: 'daily' | 'weekly' | 'monthly' | 'yearly';
    notes?: string;
  },
): Promise<{ id: string }> => {
  const { data } = await api.post(`/instrument-assets/${assetId}/loans`, loan);
  return data;
};

export const returnAssetLoan = async (
  assetId: string,
  loanId: string,
  returnData: {
    actualReturnDate: string;
    conditionAtReturn: string;
    accessoriesReturned?: string[];
    returnInspectionNotes?: string;
    damageReported?: string;
    damageCost?: number;
  },
): Promise<void> => {
  await api.post(`/instrument-assets/${assetId}/loans/${loanId}/return`, returnData);
};

// ===========================================
// DOCUMENT ENDPOINTS
// ===========================================

export const getAssetDocuments = async (assetId: string): Promise<InstrumentDocument[]> => {
  const { data } = await api.get(`/instrument-assets/${assetId}/documents`);
  return data;
};

export const createAssetDocument = async (
  assetId: string,
  document: {
    documentType: 'manual' | 'warranty' | 'certificate' | 'invoice' | 'photo' | 'contract' | 'appraisal' | 'other';
    title: string;
    description?: string;
    fileUrl: string;
    fileName: string;
    fileSize?: number;
    mimeType?: string;
    version?: string;
    validFrom?: string;
    validUntil?: string;
    isPublic?: boolean;
    tags?: string[];
  },
): Promise<{ id: string }> => {
  const { data } = await api.post(`/instrument-assets/${assetId}/documents`, document);
  return data;
};

export const deleteAssetDocument = async (assetId: string, documentId: string): Promise<void> => {
  await api.delete(`/instrument-assets/${assetId}/documents/${documentId}`);
};

// ===========================================
// HISTORY ENDPOINTS
// ===========================================

export const getAssetHistory = async (
  assetId: string,
  params?: { page?: number; limit?: number },
): Promise<
  {
    id: string;
    eventType: string;
    eventDate: string;
    description: string;
    oldValue?: string;
    newValue?: string;
    fieldChanged?: string;
    user?: { id: string; firstName: string; lastName: string };
  }[]
> => {
  const { data } = await api.get(`/instrument-assets/${assetId}/history`, { params });
  return data;
};

// ===========================================
// INSURANCE POLICY ENDPOINTS
// ===========================================

export const getInsurancePolicies = async (filters?: {
  status?: string;
  page?: number;
  limit?: number;
}): Promise<PaginatedResult<InsurancePolicy>> => {
  const { data } = await api.get('/instrument-insurance/policies', { params: filters });
  return data;
};

export const getInsurancePoliciesSummary = async (): Promise<{
  totalPolicies: number;
  activePolicies: number;
  totalCoverage: number;
  annualPremiums: number;
  expiringPoliciesCount: number;
  openClaimsCount: number;
  uninsuredHighValueAssets: number;
}> => {
  const { data } = await api.get('/instrument-insurance/policies/summary');
  return data;
};

export const getExpiringPolicies = async (
  days?: number,
): Promise<
  {
    id: string;
    policyNumber: string;
    providerName: string;
    endDate: string;
    coverageAmount: number;
    autoRenew: boolean;
    daysUntilExpiry: number;
  }[]
> => {
  const { data } = await api.get('/instrument-insurance/policies/expiring', { params: { days } });
  return data;
};

export const getInsurancePolicy = async (id: string): Promise<InsurancePolicyDetail> => {
  const { data } = await api.get(`/instrument-insurance/policies/${id}`);
  return data;
};

export const createInsurancePolicy = async (policy: {
  policyNumber: string;
  providerName: string;
  providerContact?: string;
  providerPhone?: string;
  providerEmail?: string;
  policyType: 'all_risk' | 'theft' | 'damage' | 'comprehensive';
  coverageType: 'individual' | 'collective' | 'blanket';
  coverageAmount: number;
  deductible?: number;
  currency?: string;
  premiumAmount?: number;
  premiumFrequency?: 'monthly' | 'quarterly' | 'yearly';
  premiumDueDate?: string;
  startDate: string;
  endDate?: string;
  autoRenew?: boolean;
  coverageDetails?: string;
  exclusions?: string;
  documentUrl?: string;
}): Promise<{ id: string }> => {
  const { data } = await api.post('/instrument-insurance/policies', policy);
  return data;
};

export const updateInsurancePolicy = async (
  id: string,
  policy: Partial<Parameters<typeof createInsurancePolicy>[0]>,
): Promise<void> => {
  await api.put(`/instrument-insurance/policies/${id}`, policy);
};

export const deleteInsurancePolicy = async (id: string): Promise<void> => {
  await api.delete(`/instrument-insurance/policies/${id}`);
};

export const addAssetToPolicyCoverage = async (
  policyId: string,
  coverage: {
    assetId: string;
    coveredAmount: number;
    coverageStart: string;
    coverageEnd?: string;
    specialConditions?: string;
  },
): Promise<{ id: string }> => {
  const { data } = await api.post(`/instrument-insurance/policies/${policyId}/coverage`, coverage);
  return data;
};

export const removeAssetFromPolicyCoverage = async (policyId: string, coverageId: string): Promise<void> => {
  await api.delete(`/instrument-insurance/policies/${policyId}/coverage/${coverageId}`);
};

// ===========================================
// INSURANCE CLAIM ENDPOINTS
// ===========================================

export const getInsuranceClaims = async (filters?: {
  status?: string;
  page?: number;
  limit?: number;
}): Promise<PaginatedResult<InsuranceClaim>> => {
  const { data } = await api.get('/instrument-insurance/claims', { params: filters });
  return data;
};

export const getInsuranceClaim = async (
  id: string,
): Promise<
  InsuranceClaim & {
    policy: {
      id: string;
      policyNumber: string;
      providerName: string;
      providerPhone?: string;
      providerEmail?: string;
      deductible: number;
    };
    asset: { id: string; name: string; instrumentType: string; serialNumber?: string; currentValue?: number };
    documentUrls: string[];
    photos: string[];
    witnessInfo?: string;
    policeReportNumber?: string;
    resolutionNotes?: string;
  }
> => {
  const { data } = await api.get(`/instrument-insurance/claims/${id}`);
  return data;
};

export const createInsuranceClaim = async (claim: {
  policyId: string;
  assetId: string;
  claimNumber?: string;
  claimDate: string;
  incidentDate: string;
  incidentType: 'theft' | 'damage' | 'loss' | 'fire' | 'water' | 'vandalism' | 'accident' | 'other';
  incidentDescription: string;
  incidentLocation?: string;
  claimedAmount?: number;
  policeReportNumber?: string;
  witnessInfo?: string;
  photos?: string[];
}): Promise<{ id: string }> => {
  const { data } = await api.post('/instrument-insurance/claims', claim);
  return data;
};

export const updateInsuranceClaim = async (
  id: string,
  update: {
    status?: 'submitted' | 'under_review' | 'approved' | 'rejected' | 'paid' | 'closed';
    approvedAmount?: number;
    paidAmount?: number;
    resolutionDate?: string;
    resolutionNotes?: string;
    documentUrls?: string[];
  },
): Promise<void> => {
  await api.put(`/instrument-insurance/claims/${id}`, update);
};
