/**
 * Apparatuur: items, categorieën, uitleningen, onderhoud en schade.
 *
 * Elke functie hier is naast backend/src/routes/equipment.ts gelegd (gemount op
 * /api/equipment achter requireModule('inventory')). Methode, pad en de namen
 * in de body komen daar letterlijk vandaan. De vorige versie van dit bestand
 * sprak een andere backend aan dan er bestaat: PUT waar PATCH hoort,
 * /damage-logs in plaats van /damage, /:id/loans in plaats van /loans, een
 * route /maintenance-alerts die er nooit was, en velden als instrumentType en
 * brandModel die de backend met een 400 afwees. Omdat de paginatests deze laag
 * mocken, bleef dat onzichtbaar; api/__tests__/equipment-backendcontract.test.ts
 * legt nu per functie vast wat er over de lijn gaat.
 */

import api from './client';
import type {
  Equipment,
  EquipmentCategory,
  EquipmentCondition,
  EquipmentDamageLog,
  EquipmentDamageSeverity,
  EquipmentDetail,
  EquipmentMaintenanceType,
  EquipmentStatus,
  EquipmentType,
} from '../types';

/** Filters die GET /equipment kent. Zoeken op tekst kent de backend niet. */
export interface EquipmentFilters {
  type?: EquipmentType;
  categoryId?: string;
  status?: EquipmentStatus;
  loanable?: boolean;
}

/** Wat POST /equipment accepteert (createEquipmentSchema). */
export interface EquipmentInput {
  name: string;
  equipmentType: EquipmentType;
  description?: string;
  categoryId?: string;
  /** Leeg laten: de backend nummert dan zelf (EQ-00001, EQ-00002, ...). */
  inventoryNumber?: string;
  serialNumber?: string;
  brand?: string;
  model?: string;
  status?: EquipmentStatus;
  condition?: EquipmentCondition;
  location?: string;
  storageLocation?: string;
  purchaseDate?: string;
  purchasePrice?: number;
  currentValue?: number;
  warrantyExpiry?: string;
  maintenanceIntervalMonths?: number;
  isLoanable?: boolean;
  requiresTraining?: boolean;
  notes?: string;
}

/**
 * Wat PATCH /equipment/:id werkelijk wegschrijft.
 *
 * Het schema daar accepteert alle velden van EquipmentInput, maar de handler
 * zet alleen deze vijf in de UPDATE. Een ander veld meesturen levert een 200
 * op zonder dat er iets verandert; daarom laat dit type ze niet eens toe.
 */
export type EquipmentWijziging = Partial<{
  name: string;
  description: string;
  status: EquipmentStatus;
  condition: EquipmentCondition;
  location: string;
}>;

export interface EquipmentStats {
  totalItems: number;
  byStatus: Record<string, number>;
  activeLoans: number;
  totalValue: number;
}

/** De soorten die in deze vereniging in gebruik zijn (DISTINCT over de items). */
export const getEquipmentTypes = async (): Promise<string[]> => {
  const { data } = await api.get('/equipment/types');
  return data;
};

export const getEquipmentCategories = async (): Promise<EquipmentCategory[]> => {
  const { data } = await api.get('/equipment/categories');
  return data;
};

/**
 * De lijst. De backend antwoordt met een kale array, niet met
 * `{ data, total, page, limit }`: de pagina las `.data` en bleef daardoor leeg.
 */
export const getEquipment = async (filters?: EquipmentFilters): Promise<Equipment[]> => {
  const params: Record<string, string> = {};
  if (filters?.type) params.type = filters.type;
  if (filters?.categoryId) params.categoryId = filters.categoryId;
  if (filters?.status) params.status = filters.status;
  if (filters?.loanable !== undefined) params.loanable = String(filters.loanable);
  const { data } = await api.get('/equipment', { params });
  return data;
};

export const getEquipmentItem = async (id: string): Promise<EquipmentDetail> => {
  const { data } = await api.get(`/equipment/${id}`);
  return data;
};

export const getEquipmentStats = async (): Promise<EquipmentStats> => {
  const { data } = await api.get('/equipment/stats');
  return data;
};

export const createEquipment = async (
  equipment: EquipmentInput,
): Promise<{ id: string; inventoryNumber: string; message: string }> => {
  const { data } = await api.post('/equipment', equipment);
  return data;
};

export const updateEquipment = async (id: string, wijziging: EquipmentWijziging): Promise<void> => {
  await api.patch(`/equipment/${id}`, wijziging);
};

export const deleteEquipment = async (id: string): Promise<void> => {
  await api.delete(`/equipment/${id}`);
};

// ==================== UITLENINGEN ====================

/**
 * Leent een item uit. De backend kent geen /equipment/:id/loans; het item
 * gaat als `equipmentId` in de body naar POST /equipment/loans. De uitleendatum
 * zet de backend zelf op nu.
 */
export const createEquipmentLoan = async (
  equipmentId: string,
  loan: {
    userId: string;
    expectedReturnDate?: string;
    conditionAtCheckout?: string;
    checkoutNotes?: string;
  },
): Promise<{ id: string; message: string }> => {
  const { data } = await api.post('/equipment/loans', { equipmentId, ...loan });
  return data;
};

/** Neemt een uitlening in. Alleen de uitlening-id telt; de datum is nu. */
export const returnEquipmentLoan = async (
  loanId: string,
  returnData: {
    conditionAtReturn?: string;
    returnNotes?: string;
  } = {},
): Promise<void> => {
  await api.patch(`/equipment/loans/${loanId}/return`, returnData);
};

// ==================== ONDERHOUD ====================

export const recordEquipmentMaintenance = async (
  equipmentId: string,
  maintenance: {
    maintenanceType: EquipmentMaintenanceType;
    description: string;
    performedDate: string;
    externalProvider?: string;
    cost?: number;
    partsReplaced?: string;
    nextMaintenanceDate?: string;
    notes?: string;
  },
): Promise<{ id: string; message: string }> => {
  const { data } = await api.post(`/equipment/${equipmentId}/maintenance`, maintenance);
  return data;
};

// ==================== SCHADE ====================

/** De schademeldingen van één item; GET /equipment/:id stuurt ze niet mee. */
export const getEquipmentDamageLogs = async (equipmentId: string): Promise<EquipmentDamageLog[]> => {
  const { data } = await api.get(`/equipment/${equipmentId}/damage`);
  return data;
};

export const addEquipmentDamageLog = async (
  equipmentId: string,
  log: {
    description: string;
    severity: EquipmentDamageSeverity;
    repairCost?: number;
    notes?: string;
  },
): Promise<{ id: string; message: string }> => {
  const { data } = await api.post(`/equipment/${equipmentId}/damage`, log);
  return data;
};

/**
 * Werkt een schademelding bij. Met `repairedAt` geldt de schade als
 * gerepareerd; de backend zet het item dan terug op staat 'good' en status
 * 'available'.
 */
export const updateEquipmentDamageLog = async (
  equipmentId: string,
  logId: string,
  log: {
    repairedAt?: string;
    repairCost?: number;
    notes?: string;
  },
): Promise<void> => {
  await api.patch(`/equipment/${equipmentId}/damage/${logId}`, log);
};

/** Alleen voor de rol admin; de materiaalcommissie krijgt hier een 403. */
export const deleteEquipmentDamageLog = async (equipmentId: string, logId: string): Promise<void> => {
  await api.delete(`/equipment/${equipmentId}/damage/${logId}`);
};
