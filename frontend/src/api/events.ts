import api from './client';

// Types
export interface EventLocation {
    id: string;
    associationId: string;
    name: string;
    address?: string;
    city?: string;
    postalCode?: string;
    country?: string;
    latitude?: number;
    longitude?: number;
    venueType?: string;
    capacity?: number;
    indoorOutdoor: 'indoor' | 'outdoor' | 'both';
    hasElectricity: boolean;
    hasChangingRooms: boolean;
    hasStorage: boolean;
    hasCatering: boolean;
    hasParking: boolean;
    parkingInfo?: string;
    accessibilityInfo?: string;
    contactName?: string;
    contactPhone?: string;
    contactEmail?: string;
    notes?: string;
    isFavorite: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface Event {
    id: string;
    associationId: string;
    concertId?: string;
    name: string;
    eventType: string;
    status: 'planned' | 'confirmed' | 'cancelled' | 'completed';
    locationId?: string;
    locationName?: string;
    address?: string;
    city?: string;
    latitude?: number;
    longitude?: number;
    indoorOutdoor: 'indoor' | 'outdoor' | 'both';
    startDatetime: string;
    endDatetime?: string;
    setupTime?: string;
    soundcheckTime?: string;
    doorsTime?: string;
    performanceTime?: string;
    breakTime?: string;
    packDownTime?: string;
    expectedAudience?: number;
    dressCode?: string;
    description?: string;
    internalNotes?: string;
    publicNotes?: string;
    feeAmount?: number;
    feeCurrency?: string;
    expensesBudget?: number;
    isPublic: boolean;
    requiresTickets: boolean;
    weatherSensitive: boolean;
    backupLocationId?: string;
    backupLocationName?: string;
    attendingCount?: number;
    notAttendingCount?: number;
    orchestras?: { id: string; name: string }[];
    createdBy?: string;
    createdAt: string;
    updatedAt: string;
}

export interface EventScheduleItem {
    id: string;
    eventId: string;
    title: string;
    description?: string;
    startTime: string;
    endTime?: string;
    durationMinutes?: number;
    itemType: string;
    responsibleUserId?: string;
    responsibleName?: string;
    locationDescription?: string;
    isPublic: boolean;
    sortOrder: number;
    status: string;
    notes?: string;
    createdAt: string;
}

export interface EventTransport {
    id: string;
    eventId: string;
    transportType: 'car' | 'van' | 'bus' | 'train' | 'bike' | 'other';
    vehicleDescription?: string;
    licensePlate?: string;
    capacity?: number;
    driverUserId?: string;
    driverName?: string;
    driverPhone?: string;
    departureTime?: string;
    departureLocation?: string;
    departureAddress?: string;
    departureLatitude?: number;
    departureLongitude?: number;
    arrivalTime?: string;
    returnTime?: string;
    returnDepartureTime?: string;
    notes?: string;
    status: string;
    passengers?: TransportPassenger[];
    createdAt: string;
}

export interface TransportPassenger {
    id: string;
    userId?: string;
    passengerName: string;
    pickupLocation?: string;
    pickupAddress?: string;
    pickupTime?: string;
    notes?: string;
    confirmed: boolean;
}

export interface EventMeetingPoint {
    id: string;
    eventId: string;
    name: string;
    address?: string;
    city?: string;
    latitude?: number;
    longitude?: number;
    meetingTime: string;
    description?: string;
    isPrimary: boolean;
    createdAt: string;
}

export interface EventPackingList {
    id: string;
    eventId: string;
    templateId?: string;
    name: string;
    notes?: string;
    totalItems: number;
    packedItems: number;
    progress: number;
    createdAt: string;
    items?: PackingItem[];
}

export interface PackingItem {
    id: string;
    packingListId: string;
    category: string;
    itemName: string;
    quantity: number;
    quantityPacked: number;
    isRequired: boolean;
    isPacked: boolean;
    packedByUserId?: string;
    packedByName?: string;
    packedAt?: string;
    responsibleUserId?: string;
    responsibleName?: string;
    notes?: string;
    sortOrder: number;
    createdAt: string;
}

export interface PackingListTemplate {
    id: string;
    name: string;
    description?: string;
    eventType?: string;
    isDefault: boolean;
    itemCount: number;
    createdBy?: string;
    createdAt: string;
    items?: PackingTemplateItem[];
}

export interface PackingTemplateItem {
    id: string;
    category: string;
    itemName: string;
    quantity: number;
    isRequired: boolean;
    responsibleRole?: string;
    notes?: string;
    sortOrder: number;
}

export interface EventAttendance {
    id: string;
    eventId: string;
    userId: string;
    userName?: string;
    email?: string;
    status: 'pending' | 'attending' | 'not_attending' | 'maybe';
    responseDate?: string;
    instrumentId?: string;
    instrumentName?: string;
    transportNeeded: boolean;
    canDrive: boolean;
    availableSeats: number;
    dietaryRequirements?: string;
    notes?: string;
    createdAt: string;
    updatedAt: string;
}

export interface EventWeather {
    id: string;
    eventId: string;
    fetchedAt: string;
    forecastDate: string;
    forecastTime?: string;
    temperatureC?: number;
    feelsLikeC?: number;
    humidityPercent?: number;
    windSpeedKmh?: number;
    windDirection?: string;
    precipitationMm?: number;
    precipitationProbability?: number;
    weatherCode?: string;
    weatherDescription?: string;
    uvIndex?: number;
    cloudCoverPercent?: number;
    visibilityKm?: number;
    sunrise?: string;
    sunset?: string;
    isOutdoorSuitable?: boolean;
    alertLevel?: string;
    alertMessage?: string;
}

export interface AttendanceSummary {
    byStatus: Record<string, number>;
    transport: {
        needsTransport: number;
        availableSeats: number;
    };
    byInstrument: { instrument: string; count: number }[];
}

// ===========================================
// LOCATIONS
// ===========================================

export async function getEventLocations(params?: {
    search?: string;
    venueType?: string;
    isFavorite?: boolean;
    page?: number;
    pageSize?: number;
}) {
    const response = await api.get('/events/locations', { params });
    return response.data;
}

export async function getEventLocation(id: string): Promise<EventLocation> {
    const response = await api.get(`/events/locations/${id}`);
    return response.data;
}

export async function createEventLocation(data: Partial<EventLocation>): Promise<{ id: string }> {
    const response = await api.post('/events/locations', data);
    return response.data;
}

export async function updateEventLocation(id: string, data: Partial<EventLocation>): Promise<void> {
    await api.put(`/events/locations/${id}`, data);
}

export async function deleteEventLocation(id: string): Promise<void> {
    await api.delete(`/events/locations/${id}`);
}

// ===========================================
// EVENTS
// ===========================================

export async function getEvents(params?: {
    search?: string;
    status?: string;
    eventType?: string;
    from?: string;
    to?: string;
    upcoming?: boolean;
    page?: number;
    pageSize?: number;
}) {
    const response = await api.get('/events', { params });
    return response.data;
}

export async function getEvent(id: string): Promise<Event & {
    orchestras: { id: string; name: string; performanceOrder: number; setDurationMinutes?: number; notes?: string }[];
    attendance: EventAttendance[];
    myAttendance: EventAttendance | null;
}> {
    const response = await api.get(`/events/${id}`);
    return response.data;
}

export async function createEvent(data: Partial<Event> & { orchestraIds?: string[] }): Promise<{ id: string }> {
    const response = await api.post('/events', data);
    return response.data;
}

export async function updateEvent(id: string, data: Partial<Event> & { orchestraIds?: string[] }): Promise<void> {
    await api.put(`/events/${id}`, data);
}

export async function deleteEvent(id: string): Promise<void> {
    await api.delete(`/events/${id}`);
}

// ===========================================
// SCHEDULE
// ===========================================

export async function getEventSchedule(eventId: string): Promise<EventScheduleItem[]> {
    const response = await api.get(`/events/${eventId}/schedule`);
    return response.data;
}

export async function createScheduleItem(eventId: string, data: Partial<EventScheduleItem>): Promise<{ id: string }> {
    const response = await api.post(`/events/${eventId}/schedule`, data);
    return response.data;
}

export async function updateScheduleItem(eventId: string, itemId: string, data: Partial<EventScheduleItem>): Promise<void> {
    await api.put(`/events/${eventId}/schedule/${itemId}`, data);
}

export async function deleteScheduleItem(eventId: string, itemId: string): Promise<void> {
    await api.delete(`/events/${eventId}/schedule/${itemId}`);
}

// ===========================================
// TRANSPORT
// ===========================================

export async function getEventTransport(eventId: string): Promise<EventTransport[]> {
    const response = await api.get(`/events/${eventId}/transport`);
    return response.data;
}

export async function createTransport(eventId: string, data: Partial<EventTransport>): Promise<{ id: string }> {
    const response = await api.post(`/events/${eventId}/transport`, data);
    return response.data;
}

export async function updateTransport(eventId: string, transportId: string, data: Partial<EventTransport>): Promise<void> {
    await api.put(`/events/${eventId}/transport/${transportId}`, data);
}

export async function deleteTransport(eventId: string, transportId: string): Promise<void> {
    await api.delete(`/events/${eventId}/transport/${transportId}`);
}

export async function addPassenger(eventId: string, transportId: string, data: Partial<TransportPassenger>): Promise<{ id: string }> {
    const response = await api.post(`/events/${eventId}/transport/${transportId}/passengers`, data);
    return response.data;
}

export async function removePassenger(eventId: string, transportId: string, passengerId: string): Promise<void> {
    await api.delete(`/events/${eventId}/transport/${transportId}/passengers/${passengerId}`);
}

// ===========================================
// MEETING POINTS
// ===========================================

export async function getEventMeetingPoints(eventId: string): Promise<EventMeetingPoint[]> {
    const response = await api.get(`/events/${eventId}/meeting-points`);
    return response.data;
}

export async function createMeetingPoint(eventId: string, data: Partial<EventMeetingPoint>): Promise<{ id: string }> {
    const response = await api.post(`/events/${eventId}/meeting-points`, data);
    return response.data;
}

export async function deleteMeetingPoint(eventId: string, pointId: string): Promise<void> {
    await api.delete(`/events/${eventId}/meeting-points/${pointId}`);
}

// ===========================================
// PACKING LISTS
// ===========================================

export async function getEventPackingLists(eventId: string): Promise<EventPackingList[]> {
    const response = await api.get(`/events/${eventId}/packing-lists`);
    return response.data;
}

export async function getEventPackingList(eventId: string, listId: string): Promise<EventPackingList> {
    const response = await api.get(`/events/${eventId}/packing-lists/${listId}`);
    return response.data;
}

export async function createPackingList(eventId: string, data: { name: string; templateId?: string; notes?: string }): Promise<{ id: string }> {
    const response = await api.post(`/events/${eventId}/packing-lists`, data);
    return response.data;
}

export async function addPackingItem(eventId: string, listId: string, data: Partial<PackingItem>): Promise<{ id: string }> {
    const response = await api.post(`/events/${eventId}/packing-lists/${listId}/items`, data);
    return response.data;
}

export async function updatePackingItem(eventId: string, listId: string, itemId: string, data: { isPacked?: boolean; quantityPacked?: number }): Promise<void> {
    await api.put(`/events/${eventId}/packing-lists/${listId}/items/${itemId}`, data);
}

export async function deletePackingItem(eventId: string, listId: string, itemId: string): Promise<void> {
    await api.delete(`/events/${eventId}/packing-lists/${listId}/items/${itemId}`);
}

// ===========================================
// PACKING TEMPLATES
// ===========================================

export async function getPackingTemplates(): Promise<PackingListTemplate[]> {
    const response = await api.get('/events/packing-templates');
    return response.data;
}

export async function getPackingTemplate(id: string): Promise<PackingListTemplate> {
    const response = await api.get(`/events/packing-templates/${id}`);
    return response.data;
}

export async function createPackingTemplate(data: Partial<PackingListTemplate> & { items?: Partial<PackingTemplateItem>[] }): Promise<{ id: string }> {
    const response = await api.post('/events/packing-templates', data);
    return response.data;
}

export async function deletePackingTemplate(id: string): Promise<void> {
    await api.delete(`/events/packing-templates/${id}`);
}

// ===========================================
// ATTENDANCE
// ===========================================

export async function updateMyAttendance(eventId: string, data: {
    status: 'pending' | 'attending' | 'not_attending' | 'maybe';
    instrumentId?: string;
    transportNeeded?: boolean;
    canDrive?: boolean;
    availableSeats?: number;
    dietaryRequirements?: string;
    notes?: string;
}): Promise<void> {
    await api.post(`/events/${eventId}/attendance`, data);
}

export async function getAttendanceSummary(eventId: string): Promise<AttendanceSummary> {
    const response = await api.get(`/events/${eventId}/attendance/summary`);
    return response.data;
}

// ===========================================
// WEATHER
// ===========================================

export async function getEventWeather(eventId: string): Promise<{ location: { latitude?: number; longitude?: number }; forecasts: EventWeather[] }> {
    const response = await api.get(`/events/${eventId}/weather`);
    return response.data;
}

export async function fetchEventWeather(eventId: string): Promise<void> {
    await api.post(`/events/${eventId}/weather/fetch`);
}
