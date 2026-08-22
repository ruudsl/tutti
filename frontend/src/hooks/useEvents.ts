import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getEvents,
  getEvent,
  createEvent,
  updateEvent,
  deleteEvent,
  getEventLocations,
  getEventLocation,
  createEventLocation,
  updateEventLocation,
  deleteEventLocation,
  getEventSchedule,
  createScheduleItem,
  updateScheduleItem,
  deleteScheduleItem,
  getEventTransport,
  createTransport,
  updateTransport,
  deleteTransport,
  addPassenger,
  removePassenger,
  getEventMeetingPoints,
  createMeetingPoint,
  deleteMeetingPoint,
  getEventPackingLists,
  getEventPackingList,
  createPackingList,
  addPackingItem,
  updatePackingItem,
  deletePackingItem,
  getPackingTemplates,
  getPackingTemplate,
  createPackingTemplate,
  deletePackingTemplate,
  updateMyAttendance,
  getAttendanceSummary,
  getEventWeather,
  fetchEventWeather,
  Event,
  EventLocation,
  EventScheduleItem,
  EventTransport,
  TransportPassenger,
  EventMeetingPoint,
  PackingItem,
  PackingListTemplate,
  PackingTemplateItem,
} from '../api/events';

// ===========================================
// LOCATIONS
// ===========================================

export function useEventLocations(params?: {
  search?: string;
  venueType?: string;
  isFavorite?: boolean;
  page?: number;
  pageSize?: number;
}) {
  return useQuery({
    queryKey: ['eventLocations', params],
    queryFn: () => getEventLocations(params),
  });
}

export function useEventLocation(id: string | undefined) {
  return useQuery({
    queryKey: ['eventLocation', id],
    queryFn: () => getEventLocation(id!),
    enabled: !!id,
  });
}

export function useCreateEventLocation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<EventLocation>) => createEventLocation(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eventLocations'] });
    },
  });
}

export function useUpdateEventLocation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<EventLocation> }) => updateEventLocation(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['eventLocations'] });
      queryClient.invalidateQueries({ queryKey: ['eventLocation', id] });
    },
  });
}

export function useDeleteEventLocation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteEventLocation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eventLocations'] });
    },
  });
}

// ===========================================
// EVENTS
// ===========================================

export function useEvents(params?: {
  search?: string;
  status?: string;
  eventType?: string;
  from?: string;
  to?: string;
  upcoming?: boolean;
  page?: number;
  pageSize?: number;
}) {
  return useQuery({
    queryKey: ['events', params],
    queryFn: () => getEvents(params),
  });
}

export function useEvent(id: string | undefined) {
  return useQuery({
    queryKey: ['event', id],
    queryFn: () => getEvent(id!),
    enabled: !!id,
  });
}

export function useCreateEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<Event> & { orchestraIds?: string[] }) => createEvent(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });
}

export function useUpdateEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Event> & { orchestraIds?: string[] } }) =>
      updateEvent(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.invalidateQueries({ queryKey: ['event', id] });
    },
  });
}

export function useDeleteEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteEvent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });
}

// ===========================================
// SCHEDULE
// ===========================================

export function useEventSchedule(eventId: string | undefined) {
  return useQuery({
    queryKey: ['eventSchedule', eventId],
    queryFn: () => getEventSchedule(eventId!),
    enabled: !!eventId,
  });
}

export function useCreateScheduleItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ eventId, data }: { eventId: string; data: Partial<EventScheduleItem> }) =>
      createScheduleItem(eventId, data),
    onSuccess: (_, { eventId }) => {
      queryClient.invalidateQueries({ queryKey: ['eventSchedule', eventId] });
    },
  });
}

export function useUpdateScheduleItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ eventId, itemId, data }: { eventId: string; itemId: string; data: Partial<EventScheduleItem> }) =>
      updateScheduleItem(eventId, itemId, data),
    onSuccess: (_, { eventId }) => {
      queryClient.invalidateQueries({ queryKey: ['eventSchedule', eventId] });
    },
  });
}

export function useDeleteScheduleItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ eventId, itemId }: { eventId: string; itemId: string }) => deleteScheduleItem(eventId, itemId),
    onSuccess: (_, { eventId }) => {
      queryClient.invalidateQueries({ queryKey: ['eventSchedule', eventId] });
    },
  });
}

// ===========================================
// TRANSPORT
// ===========================================

export function useEventTransport(eventId: string | undefined) {
  return useQuery({
    queryKey: ['eventTransport', eventId],
    queryFn: () => getEventTransport(eventId!),
    enabled: !!eventId,
  });
}

export function useCreateTransport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ eventId, data }: { eventId: string; data: Partial<EventTransport> }) =>
      createTransport(eventId, data),
    onSuccess: (_, { eventId }) => {
      queryClient.invalidateQueries({ queryKey: ['eventTransport', eventId] });
    },
  });
}

export function useUpdateTransport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      eventId,
      transportId,
      data,
    }: {
      eventId: string;
      transportId: string;
      data: Partial<EventTransport>;
    }) => updateTransport(eventId, transportId, data),
    onSuccess: (_, { eventId }) => {
      queryClient.invalidateQueries({ queryKey: ['eventTransport', eventId] });
    },
  });
}

export function useDeleteTransport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ eventId, transportId }: { eventId: string; transportId: string }) =>
      deleteTransport(eventId, transportId),
    onSuccess: (_, { eventId }) => {
      queryClient.invalidateQueries({ queryKey: ['eventTransport', eventId] });
    },
  });
}

export function useAddPassenger() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      eventId,
      transportId,
      data,
    }: {
      eventId: string;
      transportId: string;
      data: Partial<TransportPassenger>;
    }) => addPassenger(eventId, transportId, data),
    onSuccess: (_, { eventId }) => {
      queryClient.invalidateQueries({ queryKey: ['eventTransport', eventId] });
    },
  });
}

export function useRemovePassenger() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      eventId,
      transportId,
      passengerId,
    }: {
      eventId: string;
      transportId: string;
      passengerId: string;
    }) => removePassenger(eventId, transportId, passengerId),
    onSuccess: (_, { eventId }) => {
      queryClient.invalidateQueries({ queryKey: ['eventTransport', eventId] });
    },
  });
}

// ===========================================
// MEETING POINTS
// ===========================================

export function useEventMeetingPoints(eventId: string | undefined) {
  return useQuery({
    queryKey: ['eventMeetingPoints', eventId],
    queryFn: () => getEventMeetingPoints(eventId!),
    enabled: !!eventId,
  });
}

export function useCreateMeetingPoint() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ eventId, data }: { eventId: string; data: Partial<EventMeetingPoint> }) =>
      createMeetingPoint(eventId, data),
    onSuccess: (_, { eventId }) => {
      queryClient.invalidateQueries({ queryKey: ['eventMeetingPoints', eventId] });
    },
  });
}

export function useDeleteMeetingPoint() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ eventId, pointId }: { eventId: string; pointId: string }) => deleteMeetingPoint(eventId, pointId),
    onSuccess: (_, { eventId }) => {
      queryClient.invalidateQueries({ queryKey: ['eventMeetingPoints', eventId] });
    },
  });
}

// ===========================================
// PACKING LISTS
// ===========================================

export function useEventPackingLists(eventId: string | undefined) {
  return useQuery({
    queryKey: ['eventPackingLists', eventId],
    queryFn: () => getEventPackingLists(eventId!),
    enabled: !!eventId,
  });
}

export function useEventPackingList(eventId: string | undefined, listId: string | undefined) {
  return useQuery({
    queryKey: ['eventPackingList', eventId, listId],
    queryFn: () => getEventPackingList(eventId!, listId!),
    enabled: !!eventId && !!listId,
  });
}

export function useCreatePackingList() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ eventId, data }: { eventId: string; data: { name: string; templateId?: string; notes?: string } }) =>
      createPackingList(eventId, data),
    onSuccess: (_, { eventId }) => {
      queryClient.invalidateQueries({ queryKey: ['eventPackingLists', eventId] });
    },
  });
}

export function useAddPackingItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ eventId, listId, data }: { eventId: string; listId: string; data: Partial<PackingItem> }) =>
      addPackingItem(eventId, listId, data),
    onSuccess: (_, { eventId, listId }) => {
      queryClient.invalidateQueries({ queryKey: ['eventPackingLists', eventId] });
      queryClient.invalidateQueries({ queryKey: ['eventPackingList', eventId, listId] });
    },
  });
}

export function useUpdatePackingItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      eventId,
      listId,
      itemId,
      data,
    }: {
      eventId: string;
      listId: string;
      itemId: string;
      data: { isPacked?: boolean; quantityPacked?: number };
    }) => updatePackingItem(eventId, listId, itemId, data),
    onSuccess: (_, { eventId, listId }) => {
      queryClient.invalidateQueries({ queryKey: ['eventPackingLists', eventId] });
      queryClient.invalidateQueries({ queryKey: ['eventPackingList', eventId, listId] });
    },
  });
}

export function useDeletePackingItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ eventId, listId, itemId }: { eventId: string; listId: string; itemId: string }) =>
      deletePackingItem(eventId, listId, itemId),
    onSuccess: (_, { eventId, listId }) => {
      queryClient.invalidateQueries({ queryKey: ['eventPackingLists', eventId] });
      queryClient.invalidateQueries({ queryKey: ['eventPackingList', eventId, listId] });
    },
  });
}

// ===========================================
// PACKING TEMPLATES
// ===========================================

export function usePackingTemplates() {
  return useQuery({
    queryKey: ['packingTemplates'],
    queryFn: getPackingTemplates,
  });
}

export function usePackingTemplate(id: string | undefined) {
  return useQuery({
    queryKey: ['packingTemplate', id],
    queryFn: () => getPackingTemplate(id!),
    enabled: !!id,
  });
}

export function useCreatePackingTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<PackingListTemplate> & { items?: Partial<PackingTemplateItem>[] }) =>
      createPackingTemplate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['packingTemplates'] });
    },
  });
}

export function useDeletePackingTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deletePackingTemplate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['packingTemplates'] });
    },
  });
}

// ===========================================
// ATTENDANCE
// ===========================================

export function useUpdateMyAttendance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      eventId,
      data,
    }: {
      eventId: string;
      data: {
        status: 'pending' | 'attending' | 'not_attending' | 'maybe';
        instrumentId?: string;
        transportNeeded?: boolean;
        canDrive?: boolean;
        availableSeats?: number;
        dietaryRequirements?: string;
        notes?: string;
      };
    }) => updateMyAttendance(eventId, data),
    onSuccess: (_, { eventId }) => {
      queryClient.invalidateQueries({ queryKey: ['event', eventId] });
      queryClient.invalidateQueries({ queryKey: ['attendanceSummary', eventId] });
      // De evenementenlijst toont per evenement het aantal aanwezigen
      // (Event.attendingCount), en op diezelfde pagina meldt de gebruiker zich
      // aan. Zonder deze invalidatie blijft die teller op het oude aantal
      // staan tot de pagina ververst wordt.
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });
}

export function useAttendanceSummary(eventId: string | undefined) {
  return useQuery({
    queryKey: ['attendanceSummary', eventId],
    queryFn: () => getAttendanceSummary(eventId!),
    enabled: !!eventId,
  });
}

// ===========================================
// WEATHER
// ===========================================

export function useEventWeather(eventId: string | undefined) {
  return useQuery({
    queryKey: ['eventWeather', eventId],
    queryFn: () => getEventWeather(eventId!),
    enabled: !!eventId,
  });
}

export function useFetchEventWeather() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (eventId: string) => fetchEventWeather(eventId),
    onSuccess: (_, eventId) => {
      queryClient.invalidateQueries({ queryKey: ['eventWeather', eventId] });
    },
  });
}
