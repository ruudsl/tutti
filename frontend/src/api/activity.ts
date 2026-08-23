import api from './client';

export interface ActivityStats {
  topPieces: { id: string; title: string; arranger: string | null; count: number }[];
  recentActivity: { date: string; downloads: number; views: number }[];
  userActivity: { id: string; name: string; downloads: number; views: number }[];
}

export const getActivityStats = async (period?: string): Promise<ActivityStats> => {
  const { data } = await api.get('/activity/stats', { params: { period } });
  return data;
};

export const logActivity = async (actionType: string, entityType: string, entityId: string): Promise<void> => {
  await api.post('/activity/log', { actionType, entityType, entityId });
};

export const getRecentActivity = async (
  limit: number = 5,
): Promise<
  {
    id: string;
    actionType: string;
    entityType: string;
    entityName?: string;
    createdAt: string;
  }[]
> => {
  // Dit stond op '/activity/recent'. Die route bestaat aan de serverkant niet:
  // backend/src/routes/activity.ts kent alleen /log, /stats en /feed, en
  // /api/activity/recent belandt dus in de notFoundHandler.
  //
  // De feed antwoordt met de kolomnamen uit de database (action_type,
  // entity_type, entity_name, created_at), terwijl het beloofde type hierboven
  // camelCase gebruikt. Zonder omzetting zijn alle vier die velden `undefined`
  // bij de aanroeper - een afwijking waar niemand een foutmelding van krijgt:
  // het scherm blijft leeg en het type zegt dat alles in orde is.
  //
  // Dezelfde reparatie stond al in src/api.ts. Dat bestand schaduwt deze map,
  // dus de aanroepers kregen de goede versie en deze bleef stuk staan.
  const { data } = await api.get('/activity/feed', { params: { limit } });
  if (!Array.isArray(data)) return [];
  return data.map((regel) => ({
    id: regel.id,
    actionType: regel.action_type,
    entityType: regel.entity_type,
    entityName: regel.entity_name ?? undefined,
    createdAt: regel.created_at,
  }));
};
