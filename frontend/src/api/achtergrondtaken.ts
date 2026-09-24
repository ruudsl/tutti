import api from './client';

/** Achtergrondtaken in de wachtrij; zie docs/ACHTERGRONDTAKEN.md. Alleen voor superbeheerders. */

export type TaakStatus = 'wachtend' | 'bezig' | 'gelukt' | 'mislukt';

export interface Achtergrondtaak {
  id: string;
  soort: string;
  sleutel: string | null;
  status: TaakStatus;
  pogingen: number;
  gepland_op: string;
  eigenaar: string | null;
  vergrendeld_tot: string | null;
  laatste_fout: string | null;
  association_id: string | null;
  aangemaakt_op: string;
  bijgewerkt_op: string;
  afgerond_op: string | null;
}

export interface AchtergrondtakenPagina {
  data: Achtergrondtaak[];
  pagination: { page: number; limit: number; total: number; totalPages: number; hasNext: boolean; hasPrev: boolean };
  tellingen: Record<TaakStatus, number>;
}

export const getAchtergrondtaken = async (
  params: { status?: TaakStatus; soort?: string; page?: number; limit?: number } = {},
): Promise<AchtergrondtakenPagina> => {
  const { data } = await api.get('/achtergrondtaken', { params });
  return data;
};

export const probeerAchtergrondtaakOpnieuw = async (id: string): Promise<{ id: string; status: TaakStatus }> => {
  const { data } = await api.post(`/achtergrondtaken/${encodeURIComponent(id)}/opnieuw`);
  return data;
};
