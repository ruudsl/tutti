import api from './client';

/**
 * Kortingscodes voor de kaartverkoop (backend: routes/discount-codes.ts,
 * services/kortingscodes.ts). Beheer voor beheerder en muziekcommissie; de
 * controle vooraf is openbaar, voor de bestelpagina.
 */

export type Kortingssoort = 'percentage' | 'fixed_amount';

export interface Kortingscode {
  id: string;
  code: string;
  description: string | null;
  discountType: Kortingssoort;
  discountValue: number;
  minOrderAmount: number | null;
  maxUses: number | null;
  usesCount: number;
  maxUsesPerUser: number | null;
  validFrom: string | null;
  validUntil: string | null;
  concertIds: string[] | null;
  ticketTypeIds: string[] | null;
  isActive: boolean;
  createdAt: string;
}

export interface NieuweKortingscode {
  code: string;
  description?: string;
  discountType: Kortingssoort;
  discountValue: number;
  minOrderAmount?: number;
  maxUses?: number | null;
  maxUsesPerUser?: number;
  validFrom?: string;
  validUntil?: string;
  concertIds?: string[];
  isActive?: boolean;
}

/** Waarom een code niet geldig is; de frontend vertaalt dit. */
export type Kortingsreden =
  'onbekend' | 'inactief' | 'nog_niet_geldig' | 'verlopen' | 'op' | 'koper' | 'minimum' | 'concert' | 'kaartsoort';

export interface Kortingscontrole {
  valid: boolean;
  discountType: Kortingssoort | null;
  discountValue: number;
  discountAmount: number;
  message: string;
  reden?: Kortingsreden;
}

export const getKortingscodes = async (): Promise<Kortingscode[]> => {
  const { data } = await api.get('/discount-codes');
  return data;
};

export const maakKortingscode = async (code: NieuweKortingscode): Promise<Kortingscode> => {
  const { data } = await api.post('/discount-codes', code);
  return data;
};

export const wijzigKortingscode = async (id: string, wijziging: Partial<NieuweKortingscode>): Promise<void> => {
  await api.put(`/discount-codes/${id}`, wijziging);
};

export const verwijderKortingscode = async (id: string): Promise<void> => {
  await api.delete(`/discount-codes/${id}`);
};

export const controleerKortingscode = async (vraag: {
  code: string;
  concertId: string;
  orderTotal: number;
  ticketTypeIds?: string[];
  buyerEmail?: string;
}): Promise<Kortingscontrole> => {
  const { data } = await api.post('/discount-codes/validate', vraag);
  return data;
};
