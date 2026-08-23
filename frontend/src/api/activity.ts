import api from './client';

export interface ActivityStats {
  topPieces: { id: string; title: string; arranger: string | null; count: number }[];
  recentActivity: { date: string; downloads: number; views: number }[];
  userActivity: { id: string; name: string; downloads: number; views: number }[];
  // `totals` en `period` ontbraken hier, terwijl de server ze wél stuurt
  // (backend/src/routes/activity.ts, GET /stats). Het dashboard had ze nodig
  // en haalde deze route daarom met een kale fetch op, waar alles `any` is en
  // een verkeerde veldnaam dus niemand opvalt.
  totals: {
    total_activities: number;
    active_users: number;
    total_downloads: number;
    total_views: number;
  };
  /** De gekozen periode in dagen; standaard 30. */
  period: number;
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

/**
 * Een regel uit de activiteitenfeed, zoals de server hem stuurt: met de
 * kolomnamen uit de database. Deze stond als los type in Statistics.tsx, dat
 * de route met een kale fetch ophaalde. Hier hoort hij, naast de functie die
 * hem oplevert.
 */
export interface ActivityFeedItem {
  id: string;
  action_type: string;
  entity_type: string;
  entity_id: string;
  created_at: string;
  user_name: string;
  entity_name: string | null;
}

/**
 * De ruwe feed. `getRecentActivity` hierboven gebruikt dezelfde route maar zet
 * de velden om naar camelCase en houdt er minder over; wie de hele regel wil,
 * inclusief wie de handeling deed, heeft deze nodig.
 */
export const getActivityFeed = async (limit: number = 20): Promise<ActivityFeedItem[]> => {
  const { data } = await api.get('/activity/feed', { params: { limit } });
  return Array.isArray(data) ? data : [];
};
