import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';

// De hele events-api wordt vervangen. De typen (Event, EventLocation, ...)
// die de hook ook importeert zijn puur type-informatie en verdwijnen bij het
// compileren, dus die hoeven hier niet te bestaan.
vi.mock('../../api/events', () => ({
  getEvents: vi.fn(),
  getEvent: vi.fn(),
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  deleteEvent: vi.fn(),
  getEventLocations: vi.fn(),
  getEventLocation: vi.fn(),
  createEventLocation: vi.fn(),
  updateEventLocation: vi.fn(),
  deleteEventLocation: vi.fn(),
  getEventSchedule: vi.fn(),
  createScheduleItem: vi.fn(),
  updateScheduleItem: vi.fn(),
  deleteScheduleItem: vi.fn(),
  getEventTransport: vi.fn(),
  createTransport: vi.fn(),
  updateTransport: vi.fn(),
  deleteTransport: vi.fn(),
  addPassenger: vi.fn(),
  removePassenger: vi.fn(),
  getEventMeetingPoints: vi.fn(),
  createMeetingPoint: vi.fn(),
  deleteMeetingPoint: vi.fn(),
  getEventPackingLists: vi.fn(),
  getEventPackingList: vi.fn(),
  createPackingList: vi.fn(),
  addPackingItem: vi.fn(),
  updatePackingItem: vi.fn(),
  deletePackingItem: vi.fn(),
  getPackingTemplates: vi.fn(),
  getPackingTemplate: vi.fn(),
  createPackingTemplate: vi.fn(),
  deletePackingTemplate: vi.fn(),
  updateMyAttendance: vi.fn(),
  getAttendanceSummary: vi.fn(),
  getEventWeather: vi.fn(),
  fetchEventWeather: vi.fn(),
}));

import {
  useEventLocations,
  useEventLocation,
  useCreateEventLocation,
  useUpdateEventLocation,
  useDeleteEventLocation,
  useEvents,
  useEvent,
  useCreateEvent,
  useUpdateEvent,
  useDeleteEvent,
  useEventSchedule,
  useCreateScheduleItem,
  useUpdateScheduleItem,
  useDeleteScheduleItem,
  useEventTransport,
  useCreateTransport,
  useUpdateTransport,
  useDeleteTransport,
  useAddPassenger,
  useRemovePassenger,
  useCreateMeetingPoint,
  useDeleteMeetingPoint,
  useEventPackingList,
  useCreatePackingList,
  useAddPackingItem,
  useUpdatePackingItem,
  useDeletePackingItem,
  usePackingTemplates,
  useCreatePackingTemplate,
  useDeletePackingTemplate,
  useUpdateMyAttendance,
  useAttendanceSummary,
  useEventWeather,
  useFetchEventWeather,
} from '../useEvents';
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
  createMeetingPoint,
  deleteMeetingPoint,
  getEventPackingList,
  createPackingList,
  addPackingItem,
  updatePackingItem,
  deletePackingItem,
  getPackingTemplates,
  createPackingTemplate,
  deletePackingTemplate,
  updateMyAttendance,
  getAttendanceSummary,
  getEventWeather,
  fetchEventWeather,
} from '../../api/events';

/** De api is gemockt; TypeScript kent alleen nog de echte signatuur. */
const alsMock = (fn: unknown) => fn as Mock;

let queryClient: QueryClient;
/** Alle queryKeys die de hooks ongeldig hebben gemaakt, in volgorde. */
let ongeldigGemaakt: unknown[];

beforeEach(() => {
  vi.clearAllMocks();
  queryClient = new QueryClient({
    defaultOptions: {
      // retry:false, anders wacht een faaltest op de herhaalpogingen.
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  ongeldigGemaakt = [];
  const echteInvalidatie = queryClient.invalidateQueries.bind(queryClient);
  vi.spyOn(queryClient, 'invalidateQueries').mockImplementation((filters?: unknown) => {
    ongeldigGemaakt.push((filters as { queryKey?: unknown })?.queryKey);
    return echteInvalidatie(filters as never);
  });
});

const wrapper = ({ children }: { children: React.ReactNode }) =>
  createElement(QueryClientProvider, { client: queryClient }, children);

/** Controleert of precies deze queryKey ongeldig is gemaakt. */
const isOngeldigGemaakt = (key: unknown[]) => ongeldigGemaakt.some((k) => JSON.stringify(k) === JSON.stringify(key));

// ==================== LOCATIES ====================

describe('useEvents - locaties', () => {
  it('geeft de zoekparameters ongewijzigd door aan de locatie-api', async () => {
    alsMock(getEventLocations).mockResolvedValue({ data: [], total: 0 });
    const params = { search: 'kerk', venueType: 'church', page: 2 };

    const { result } = renderHook(() => useEventLocations(params), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getEventLocations).toHaveBeenCalledWith(params);
  });

  it('vraagt geen locatiedetail op zolang er geen id is', () => {
    const { result } = renderHook(() => useEventLocation(undefined), { wrapper });

    expect(getEventLocation).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('haalt het locatiedetail op zodra het id bekend is', async () => {
    alsMock(getEventLocation).mockResolvedValue({ id: 'l1', name: 'Dorpskerk' });

    const { result } = renderHook(() => useEventLocation('l1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getEventLocation).toHaveBeenCalledWith('l1');
  });

  it('maakt een locatie aan en vernieuwt de locatielijst', async () => {
    alsMock(createEventLocation).mockResolvedValue({ id: 'l9' });
    const nieuw = { name: 'Nieuwe zaal', city: 'Utrecht' };

    const { result } = renderHook(() => useCreateEventLocation(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(nieuw);
    });

    expect(createEventLocation).toHaveBeenCalledWith(nieuw);
    expect(isOngeldigGemaakt(['eventLocations'])).toBe(true);
  });

  it('vernieuwt na een locatiewijziging zowel de lijst als het gewijzigde detail', async () => {
    alsMock(updateEventLocation).mockResolvedValue(undefined);

    const { result } = renderHook(() => useUpdateEventLocation(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: 'l1', data: { name: 'Andere naam' } });
    });

    expect(updateEventLocation).toHaveBeenCalledWith('l1', { name: 'Andere naam' });
    expect(isOngeldigGemaakt(['eventLocations'])).toBe(true);
    expect(isOngeldigGemaakt(['eventLocation', 'l1'])).toBe(true);
  });

  it('vernieuwt na het verwijderen van een locatie de locatielijst', async () => {
    alsMock(deleteEventLocation).mockResolvedValue(undefined);

    const { result } = renderHook(() => useDeleteEventLocation(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('l1');
    });

    expect(deleteEventLocation).toHaveBeenCalledWith('l1');
    expect(isOngeldigGemaakt(['eventLocations'])).toBe(true);
  });
});

// ==================== EVENEMENTEN ====================

describe('useEvents - evenementen', () => {
  it('geeft de filters ongewijzigd door aan de evenementen-api', async () => {
    alsMock(getEvents).mockResolvedValue({ data: [], total: 0 });
    const params = { search: 'zomer', status: 'confirmed', upcoming: true };

    const { result } = renderHook(() => useEvents(params), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getEvents).toHaveBeenCalledWith(params);
  });

  it('geeft nog geen data terug zolang de evenementen laden', async () => {
    let losmaken: (waarde: unknown) => void = () => {};
    alsMock(getEvents).mockImplementation(() => new Promise((r) => (losmaken = r)));

    const { result } = renderHook(() => useEvents(), { wrapper });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();

    await act(async () => {
      losmaken({ data: [], total: 0 });
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data.data).toEqual([]);
  });

  it('vraagt geen evenementdetail op zolang er geen id is', () => {
    const { result } = renderHook(() => useEvent(undefined), { wrapper });

    expect(getEvent).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('maakt een evenement aan en vernieuwt de evenementenlijst', async () => {
    alsMock(createEvent).mockResolvedValue({ id: 'e9' });
    const nieuw = { name: 'Zomerconcert', orchestraIds: ['o1'] };

    const { result } = renderHook(() => useCreateEvent(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(nieuw);
    });

    expect(createEvent).toHaveBeenCalledWith(nieuw);
    expect(isOngeldigGemaakt(['events'])).toBe(true);
  });

  it('stuurt bij wijzigen id en gegevens gescheiden door en vernieuwt lijst en detail', async () => {
    alsMock(updateEvent).mockResolvedValue(undefined);

    const { result } = renderHook(() => useUpdateEvent(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: 'e1', data: { name: 'Andere naam' } });
    });

    expect(updateEvent).toHaveBeenCalledWith('e1', { name: 'Andere naam' });
    expect(isOngeldigGemaakt(['events'])).toBe(true);
    expect(isOngeldigGemaakt(['event', 'e1'])).toBe(true);
  });

  it('vernieuwt na verwijderen de evenementenlijst', async () => {
    alsMock(deleteEvent).mockResolvedValue(undefined);

    const { result } = renderHook(() => useDeleteEvent(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('e1');
    });

    expect(deleteEvent).toHaveBeenCalledWith('e1');
    expect(isOngeldigGemaakt(['events'])).toBe(true);
  });

  it('laat een mislukte aanmaak als fout zien en raakt de cache niet aan', async () => {
    // Let op: deze hooks tonen zelf geen melding aan de gebruiker. De fout
    // komt alleen naar boven via isError/error, dus het scherm dat de hook
    // gebruikt moet er zelf iets mee doen.
    alsMock(createEvent).mockRejectedValue(new Error('Naam is verplicht'));

    const { result } = renderHook(() => useCreateEvent(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync({ name: '' })).rejects.toThrow('Naam is verplicht');
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Naam is verplicht');
    expect(ongeldigGemaakt).toHaveLength(0);
  });
});

// ==================== DAGPROGRAMMA ====================

describe('useEvents - dagprogramma', () => {
  it('vraagt het dagprogramma pas op als het evenement bekend is', async () => {
    const { result, rerender } = renderHook(({ id }: { id: string | undefined }) => useEventSchedule(id), {
      wrapper,
      initialProps: { id: undefined as string | undefined },
    });

    expect(getEventSchedule).not.toHaveBeenCalled();

    alsMock(getEventSchedule).mockResolvedValue([]);
    rerender({ id: 'e1' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getEventSchedule).toHaveBeenCalledWith('e1');
  });

  it('voegt een programmaonderdeel toe en vernieuwt het dagprogramma van dat evenement', async () => {
    alsMock(createScheduleItem).mockResolvedValue({ id: 's1' });

    const { result } = renderHook(() => useCreateScheduleItem(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ eventId: 'e1', data: { title: 'Soundcheck' } });
    });

    expect(createScheduleItem).toHaveBeenCalledWith('e1', { title: 'Soundcheck' });
    expect(isOngeldigGemaakt(['eventSchedule', 'e1'])).toBe(true);
  });

  it('wijzigt een programmaonderdeel met evenement- en onderdeel-id', async () => {
    alsMock(updateScheduleItem).mockResolvedValue(undefined);

    const { result } = renderHook(() => useUpdateScheduleItem(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ eventId: 'e1', itemId: 's1', data: { title: 'Inspelen' } });
    });

    expect(updateScheduleItem).toHaveBeenCalledWith('e1', 's1', { title: 'Inspelen' });
    expect(isOngeldigGemaakt(['eventSchedule', 'e1'])).toBe(true);
  });

  it('verwijdert een programmaonderdeel en vernieuwt het dagprogramma', async () => {
    alsMock(deleteScheduleItem).mockResolvedValue(undefined);

    const { result } = renderHook(() => useDeleteScheduleItem(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ eventId: 'e1', itemId: 's1' });
    });

    expect(deleteScheduleItem).toHaveBeenCalledWith('e1', 's1');
    expect(isOngeldigGemaakt(['eventSchedule', 'e1'])).toBe(true);
  });
});

// ==================== VERVOER ====================

describe('useEvents - vervoer', () => {
  it('vraagt het vervoer pas op als het evenement bekend is', () => {
    const { result } = renderHook(() => useEventTransport(undefined), { wrapper });

    expect(getEventTransport).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('voegt een rit toe en vernieuwt het vervoer van dat evenement', async () => {
    alsMock(createTransport).mockResolvedValue({ id: 't1' });

    const { result } = renderHook(() => useCreateTransport(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ eventId: 'e1', data: { capacity: 4 } });
    });

    expect(createTransport).toHaveBeenCalledWith('e1', { capacity: 4 });
    expect(isOngeldigGemaakt(['eventTransport', 'e1'])).toBe(true);
  });

  it('wijzigt een rit met evenement- en rit-id', async () => {
    alsMock(updateTransport).mockResolvedValue(undefined);

    const { result } = renderHook(() => useUpdateTransport(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ eventId: 'e1', transportId: 't1', data: { capacity: 3 } });
    });

    expect(updateTransport).toHaveBeenCalledWith('e1', 't1', { capacity: 3 });
    expect(isOngeldigGemaakt(['eventTransport', 'e1'])).toBe(true);
  });

  it('verwijdert een rit en vernieuwt het vervoer', async () => {
    alsMock(deleteTransport).mockResolvedValue(undefined);

    const { result } = renderHook(() => useDeleteTransport(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ eventId: 'e1', transportId: 't1' });
    });

    expect(deleteTransport).toHaveBeenCalledWith('e1', 't1');
    expect(isOngeldigGemaakt(['eventTransport', 'e1'])).toBe(true);
  });

  it('zet een meerijder in een rit en vernieuwt het vervoer', async () => {
    alsMock(addPassenger).mockResolvedValue({ id: 'p1' });

    const { result } = renderHook(() => useAddPassenger(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ eventId: 'e1', transportId: 't1', data: { userId: 'u1' } });
    });

    expect(addPassenger).toHaveBeenCalledWith('e1', 't1', { userId: 'u1' });
    expect(isOngeldigGemaakt(['eventTransport', 'e1'])).toBe(true);
  });

  it('haalt een meerijder uit een rit en vernieuwt het vervoer', async () => {
    alsMock(removePassenger).mockResolvedValue(undefined);

    const { result } = renderHook(() => useRemovePassenger(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ eventId: 'e1', transportId: 't1', passengerId: 'p1' });
    });

    expect(removePassenger).toHaveBeenCalledWith('e1', 't1', 'p1');
    expect(isOngeldigGemaakt(['eventTransport', 'e1'])).toBe(true);
  });
});

// ==================== VERZAMELPUNTEN ====================

describe('useEvents - verzamelpunten', () => {
  it('voegt een verzamelpunt toe en vernieuwt de verzamelpunten', async () => {
    alsMock(createMeetingPoint).mockResolvedValue({ id: 'm1' });

    const { result } = renderHook(() => useCreateMeetingPoint(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ eventId: 'e1', data: { name: 'Parkeerplaats' } });
    });

    expect(createMeetingPoint).toHaveBeenCalledWith('e1', { name: 'Parkeerplaats' });
    expect(isOngeldigGemaakt(['eventMeetingPoints', 'e1'])).toBe(true);
  });

  it('verwijdert een verzamelpunt en vernieuwt de verzamelpunten', async () => {
    alsMock(deleteMeetingPoint).mockResolvedValue(undefined);

    const { result } = renderHook(() => useDeleteMeetingPoint(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ eventId: 'e1', pointId: 'm1' });
    });

    expect(deleteMeetingPoint).toHaveBeenCalledWith('e1', 'm1');
    expect(isOngeldigGemaakt(['eventMeetingPoints', 'e1'])).toBe(true);
  });
});

// ==================== PAKLIJSTEN ====================

describe('useEvents - paklijsten', () => {
  it('heeft zowel evenement als lijst nodig voor het paklijstdetail', async () => {
    const { result, rerender } = renderHook(
      ({ listId }: { listId: string | undefined }) => useEventPackingList('e1', listId),
      { wrapper, initialProps: { listId: undefined as string | undefined } },
    );

    expect(getEventPackingList).not.toHaveBeenCalled();

    alsMock(getEventPackingList).mockResolvedValue({ id: 'pl1', items: [] });
    rerender({ listId: 'pl1' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getEventPackingList).toHaveBeenCalledWith('e1', 'pl1');
  });

  it('maakt een paklijst aan en vernieuwt de paklijsten van het evenement', async () => {
    alsMock(createPackingList).mockResolvedValue({ id: 'pl1' });

    const { result } = renderHook(() => useCreatePackingList(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ eventId: 'e1', data: { name: 'Podium', templateId: 'tpl1' } });
    });

    expect(createPackingList).toHaveBeenCalledWith('e1', { name: 'Podium', templateId: 'tpl1' });
    expect(isOngeldigGemaakt(['eventPackingLists', 'e1'])).toBe(true);
  });

  it('voegt een pakitem toe en vernieuwt zowel het overzicht als de open lijst', async () => {
    alsMock(addPackingItem).mockResolvedValue({ id: 'i1' });

    const { result } = renderHook(() => useAddPackingItem(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ eventId: 'e1', listId: 'pl1', data: { itemName: 'Lessenaars' } });
    });

    expect(addPackingItem).toHaveBeenCalledWith('e1', 'pl1', { itemName: 'Lessenaars' });
    // Het overzicht toont per lijst hoeveel er ingepakt is, dus beide moeten mee.
    expect(isOngeldigGemaakt(['eventPackingLists', 'e1'])).toBe(true);
    expect(isOngeldigGemaakt(['eventPackingList', 'e1', 'pl1'])).toBe(true);
  });

  it('vinkt een pakitem af en vernieuwt overzicht en lijst', async () => {
    alsMock(updatePackingItem).mockResolvedValue(undefined);

    const { result } = renderHook(() => useUpdatePackingItem(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ eventId: 'e1', listId: 'pl1', itemId: 'i1', data: { isPacked: true } });
    });

    expect(updatePackingItem).toHaveBeenCalledWith('e1', 'pl1', 'i1', { isPacked: true });
    expect(isOngeldigGemaakt(['eventPackingLists', 'e1'])).toBe(true);
    expect(isOngeldigGemaakt(['eventPackingList', 'e1', 'pl1'])).toBe(true);
  });

  it('verwijdert een pakitem en vernieuwt overzicht en lijst', async () => {
    alsMock(deletePackingItem).mockResolvedValue(undefined);

    const { result } = renderHook(() => useDeletePackingItem(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ eventId: 'e1', listId: 'pl1', itemId: 'i1' });
    });

    expect(deletePackingItem).toHaveBeenCalledWith('e1', 'pl1', 'i1');
    expect(isOngeldigGemaakt(['eventPackingLists', 'e1'])).toBe(true);
    expect(isOngeldigGemaakt(['eventPackingList', 'e1', 'pl1'])).toBe(true);
  });

  it('geeft een lege sjabloonlijst terug als er nog geen sjablonen zijn', async () => {
    alsMock(getPackingTemplates).mockResolvedValue([]);

    const { result } = renderHook(() => usePackingTemplates(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it('maakt een sjabloon aan en vernieuwt de sjabloonlijst', async () => {
    alsMock(createPackingTemplate).mockResolvedValue({ id: 'tpl1' });
    const sjabloon = { name: 'Standaard', description: 'Basispakket voor buitenoptredens' };

    const { result } = renderHook(() => useCreatePackingTemplate(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(sjabloon);
    });

    expect(createPackingTemplate).toHaveBeenCalledWith(sjabloon);
    expect(isOngeldigGemaakt(['packingTemplates'])).toBe(true);
  });

  it('verwijdert een sjabloon en vernieuwt de sjabloonlijst', async () => {
    alsMock(deletePackingTemplate).mockResolvedValue(undefined);

    const { result } = renderHook(() => useDeletePackingTemplate(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('tpl1');
    });

    expect(deletePackingTemplate).toHaveBeenCalledWith('tpl1');
    expect(isOngeldigGemaakt(['packingTemplates'])).toBe(true);
  });
});

// ==================== AANWEZIGHEID ====================

describe('useEvents - aanwezigheid', () => {
  it('stuurt de eigen aanmelding door en vernieuwt detail en samenvatting', async () => {
    alsMock(updateMyAttendance).mockResolvedValue(undefined);
    const aanmelding = { status: 'attending' as const, transportNeeded: true };

    const { result } = renderHook(() => useUpdateMyAttendance(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ eventId: 'e1', data: aanmelding });
    });

    expect(updateMyAttendance).toHaveBeenCalledWith('e1', aanmelding);
    expect(isOngeldigGemaakt(['event', 'e1'])).toBe(true);
    expect(isOngeldigGemaakt(['attendanceSummary', 'e1'])).toBe(true);
  });

  it('vernieuwt na een aanmelding ook de evenementenlijst', async () => {
    // De lijst op de evenementenpagina toont per evenement "N aanwezig"
    // (Event.attendingCount). Diezelfde pagina laat de gebruiker zich
    // aanmelden. Zonder deze invalidatie blijft de teller op het oude aantal
    // staan tot de gebruiker de pagina ververst.
    alsMock(updateMyAttendance).mockResolvedValue(undefined);

    const { result } = renderHook(() => useUpdateMyAttendance(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ eventId: 'e1', data: { status: 'attending' } });
    });

    expect(isOngeldigGemaakt(['events'])).toBe(true);
  });

  it('haalt de aanwezigheidssamenvatting pas op als het evenement bekend is', () => {
    const { result } = renderHook(() => useAttendanceSummary(undefined), { wrapper });

    expect(getAttendanceSummary).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });
});

// ==================== WEER ====================

describe('useEvents - weer', () => {
  it('haalt het weer pas op als het evenement bekend is', async () => {
    const { result, rerender } = renderHook(({ id }: { id: string | undefined }) => useEventWeather(id), {
      wrapper,
      initialProps: { id: undefined as string | undefined },
    });

    expect(getEventWeather).not.toHaveBeenCalled();

    alsMock(getEventWeather).mockResolvedValue(null);
    rerender({ id: 'e1' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getEventWeather).toHaveBeenCalledWith('e1');
  });

  it('ververst de weersverwachting en vernieuwt alleen het weer van dat evenement', async () => {
    alsMock(fetchEventWeather).mockResolvedValue(undefined);

    const { result } = renderHook(() => useFetchEventWeather(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('e1');
    });

    expect(fetchEventWeather).toHaveBeenCalledWith('e1');
    expect(isOngeldigGemaakt(['eventWeather', 'e1'])).toBe(true);
    expect(ongeldigGemaakt).toHaveLength(1);
  });
});
