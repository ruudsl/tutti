import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';

vi.mock('../../api', () => ({
  getConcertTickets: vi.fn(),
  createTicketOrder: vi.fn(),
  getTicketOrder: vi.fn(),
  payTicketOrder: vi.fn(),
  validateTicket: vi.fn(),
  getMyTickets: vi.fn(),
  createTicketType: vi.fn(),
  updateTicketType: vi.fn(),
  deleteTicketType: vi.fn(),
  getConcertTicketStats: vi.fn(),
  getConcertAttendees: vi.fn(),
  getSeatHeatmapData: vi.fn(),
  exportConcertAttendeesCsv: vi.fn(),
  cancelTicket: vi.fn(),
  refundOrder: vi.fn(),
  mockPayment: vi.fn(),
}));

vi.mock('../../utils/toast', () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

// De vertaalfunctie geeft de sleutel onvertaald terug. Zo toetsen we welke
// tekst de hook kiest, zonder de test afhankelijk te maken van de exacte
// Nederlandse formulering in de vertaalbestanden.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel }),
}));

import {
  useConcertTickets,
  useTicketOrder,
  useMyTickets,
  useTicketStats,
  useAttendees,
  useSeatHeatmap,
  useCreateTicketOrder,
  usePayTicketOrder,
  useValidateTicket,
  useCreateTicketType,
  useUpdateTicketType,
  useDeleteTicketType,
  useCancelTicket,
  useRefundOrder,
  useExportAttendees,
  useMockPayment,
} from '../useTickets';
import {
  getConcertTickets,
  createTicketOrder,
  getTicketOrder,
  payTicketOrder,
  validateTicket,
  getMyTickets,
  createTicketType,
  updateTicketType,
  deleteTicketType,
  getConcertTicketStats,
  getConcertAttendees,
  getSeatHeatmapData,
  exportConcertAttendeesCsv,
  cancelTicket,
  refundOrder,
  mockPayment,
} from '../../api';
import { showSuccess, showError } from '../../utils/toast';

/** De api is gemockt; TypeScript kent alleen nog de echte signatuur. */
const alsMock = (fn: unknown) => fn as Mock;

/** Een axios-achtige fout zoals de backend hem teruggeeft. */
const serverfout = (melding: string) => ({
  isAxiosError: true,
  response: { data: { error: melding } },
});

let queryClient: QueryClient;
/** Alle queryKeys die de hooks ongeldig hebben gemaakt, in volgorde. */
let ongeldigGemaakt: unknown[];

beforeEach(() => {
  vi.clearAllMocks();
  queryClient = new QueryClient({
    defaultOptions: {
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

// ==================== QUERIES ====================

describe('useTickets - queries', () => {
  it('vraagt geen tickets op zolang er geen concert gekozen is', () => {
    const { result } = renderHook(() => useConcertTickets(''), { wrapper });

    expect(getConcertTickets).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('haalt de tickettypes van een concert op', async () => {
    alsMock(getConcertTickets).mockResolvedValue({ ticketTypes: [] });

    const { result } = renderHook(() => useConcertTickets('c1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getConcertTickets).toHaveBeenCalledWith('c1');
    expect(result.current.data).toEqual({ ticketTypes: [] });
  });

  it('geeft nog geen tickets terug zolang het verzoek loopt', async () => {
    let losmaken: (waarde: unknown) => void = () => {};
    alsMock(getConcertTickets).mockImplementation(() => new Promise((r) => (losmaken = r)));

    const { result } = renderHook(() => useConcertTickets('c1'), { wrapper });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();

    await act(async () => {
      losmaken({ ticketTypes: [] });
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });

  it('meldt een fout als de tickets niet opgehaald kunnen worden', async () => {
    alsMock(getConcertTickets).mockRejectedValue(serverfout('Concert niet gevonden'));

    const { result } = renderHook(() => useConcertTickets('c1'), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it('vraagt geen bestelling op zonder bestelnummer', () => {
    const { result } = renderHook(() => useTicketOrder(''), { wrapper });

    expect(getTicketOrder).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('haalt een bestelling op zodra het bestelnummer bekend is', async () => {
    alsMock(getTicketOrder).mockResolvedValue({ id: 'o1', status: 'pending' });

    const { result } = renderHook(() => useTicketOrder('o1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getTicketOrder).toHaveBeenCalledWith('o1');
  });

  it('geeft een lege lijst terug als de gebruiker nog geen tickets heeft', async () => {
    alsMock(getMyTickets).mockResolvedValue([]);

    const { result } = renderHook(() => useMyTickets(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it('haalt de verkoopcijfers en bezoekers van een concert op', async () => {
    alsMock(getConcertTicketStats).mockResolvedValue({ sold: 42 });
    alsMock(getConcertAttendees).mockResolvedValue([]);

    const { result } = renderHook(() => ({ stats: useTicketStats('c1'), bezoekers: useAttendees('c1') }), {
      wrapper,
    });

    await waitFor(() => expect(result.current.stats.isSuccess).toBe(true));
    await waitFor(() => expect(result.current.bezoekers.isSuccess).toBe(true));
    expect(getConcertTicketStats).toHaveBeenCalledWith('c1');
    expect(getConcertAttendees).toHaveBeenCalledWith('c1');
  });

  it('haalt de stoelenwarmtekaart pas op als het concert bekend is', async () => {
    const { result, rerender } = renderHook(({ id }: { id: string }) => useSeatHeatmap(id), {
      wrapper,
      initialProps: { id: '' },
    });

    expect(getSeatHeatmapData).not.toHaveBeenCalled();

    alsMock(getSeatHeatmapData).mockResolvedValue({ seats: [] });
    rerender({ id: 'c1' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getSeatHeatmapData).toHaveBeenCalledWith('c1');
  });
});

// ==================== BESTELLEN EN BETALEN ====================

describe('useTickets - bestellen en betalen', () => {
  const bestelling = {
    items: [{ ticketTypeId: 'tt1', quantity: 2 }],
    buyerName: 'Jan Jansen',
    buyerEmail: 'jan@example.org',
  };

  it('plaatst een bestelling en vernieuwt de beschikbaarheid van dat concert', async () => {
    alsMock(createTicketOrder).mockResolvedValue({ orderId: 'o1' });

    const { result } = renderHook(() => useCreateTicketOrder(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ concertId: 'c1', order: bestelling });
    });

    expect(createTicketOrder).toHaveBeenCalledWith('c1', bestelling);
    // Na een bestelling zijn er minder tickets over, dus de tickettypes van
    // dit concert moeten opnieuw opgehaald worden.
    expect(isOngeldigGemaakt(['tickets', 'concert', 'c1'])).toBe(true);
  });

  it('raakt de cache niet aan als de bestelling mislukt', async () => {
    // Deze hook heeft geen onError: de fout komt alleen via isError naar boven
    // en het bestelscherm moet er zelf een melding van maken.
    alsMock(createTicketOrder).mockRejectedValue(serverfout('Niet genoeg tickets beschikbaar'));

    const { result } = renderHook(() => useCreateTicketOrder(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync({ concertId: 'c1', order: bestelling })).rejects.toBeDefined();
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(ongeldigGemaakt).toHaveLength(0);
    expect(showError).not.toHaveBeenCalled();
  });

  it('stuurt de betaalgegevens door bij het betalen van een bestelling', async () => {
    alsMock(payTicketOrder).mockResolvedValue({ checkoutUrl: 'https://betalen.example/o1' });
    const betaling = { method: 'ideal', returnUrl: 'https://tutti.example/bedankt' };

    const { result } = renderHook(() => usePayTicketOrder(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ orderId: 'o1', payment: betaling });
    });

    expect(payTicketOrder).toHaveBeenCalledWith('o1', betaling);
    // Deze hook maakt niets ongeldig: de betaling gaat naar een externe
    // betaalpagina en de gebruiker komt daarna op een verse pagina terug.
    expect(ongeldigGemaakt).toHaveLength(0);
  });

  it('werkt na een testbetaling de bestelling en de eigen tickets bij', async () => {
    alsMock(mockPayment).mockResolvedValue({ status: 'paid' });

    const { result } = renderHook(() => useMockPayment(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ orderId: 'o1', action: 'pay' });
    });

    expect(mockPayment).toHaveBeenCalledWith('o1', 'pay');
    expect(isOngeldigGemaakt(['tickets', 'order', 'o1'])).toBe(true);
    expect(isOngeldigGemaakt(['tickets', 'my'])).toBe(true);
  });
});

// ==================== SCANNEN ====================

describe('useTickets - tickets scannen', () => {
  it('meldt een geldig ticket en vernieuwt de verkoopcijfers', async () => {
    alsMock(validateTicket).mockResolvedValue({ valid: true, message: 'ok' });

    const { result } = renderHook(() => useValidateTicket(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ code: 'ABC123', concertId: 'c1' });
    });

    expect(validateTicket).toHaveBeenCalledWith('ABC123', 'c1');
    expect(showSuccess).toHaveBeenCalledWith('tickets.ticketValidated');
    expect(isOngeldigGemaakt(['tickets', 'stats', 'c1'])).toBe(true);
  });

  it('toont de reden als de server het ticket afkeurt', async () => {
    // Een afgekeurd ticket is een geslaagd verzoek met valid:false. Zonder
    // deze tak zou de scanner niets zien gebeuren.
    alsMock(validateTicket).mockResolvedValue({ valid: false, message: 'Ticket is al gescand' });

    const { result } = renderHook(() => useValidateTicket(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ code: 'ABC123', concertId: 'c1' });
    });

    expect(showError).toHaveBeenCalledWith('Ticket is al gescand');
    expect(showSuccess).not.toHaveBeenCalled();
  });

  it('vernieuwt geen verkoopcijfers als er geen concert bij het scannen hoort', async () => {
    alsMock(validateTicket).mockResolvedValue({ valid: true, message: 'ok' });

    const { result } = renderHook(() => useValidateTicket(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ code: 'ABC123' });
    });

    expect(validateTicket).toHaveBeenCalledWith('ABC123', undefined);
    expect(ongeldigGemaakt).toHaveLength(0);
  });

  it('toont een foutmelding als het scanverzoek zelf mislukt', async () => {
    alsMock(validateTicket).mockRejectedValue(serverfout('Geen verbinding met de server'));

    const { result } = renderHook(() => useValidateTicket(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync({ code: 'ABC123', concertId: 'c1' })).rejects.toBeDefined();
    });

    expect(showError).toHaveBeenCalledWith('Geen verbinding met de server');
    expect(showSuccess).not.toHaveBeenCalled();
  });
});

// ==================== TICKETTYPES BEHEREN ====================

describe('useTickets - tickettypes beheren', () => {
  it('maakt een tickettype aan en vernieuwt aanbod en verkoopcijfers', async () => {
    alsMock(createTicketType).mockResolvedValue({ id: 'tt1' });
    const type = { name: 'Volwassenen', price: 12.5, quantity: 200 };

    const { result } = renderHook(() => useCreateTicketType(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ concertId: 'c1', ticketType: type });
    });

    expect(createTicketType).toHaveBeenCalledWith('c1', type);
    expect(isOngeldigGemaakt(['tickets', 'concert', 'c1'])).toBe(true);
    expect(isOngeldigGemaakt(['tickets', 'stats', 'c1'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('common.saved');
  });

  it('toont de foutmelding van de server als een tickettype niet aangemaakt kan worden', async () => {
    alsMock(createTicketType).mockRejectedValue(serverfout('Prijs mag niet negatief zijn'));

    const { result } = renderHook(() => useCreateTicketType(), { wrapper });
    await act(async () => {
      await expect(
        result.current.mutateAsync({ concertId: 'c1', ticketType: { name: 'X', price: -1, quantity: 1 } }),
      ).rejects.toBeDefined();
    });

    expect(showError).toHaveBeenCalledWith('Prijs mag niet negatief zijn');
    expect(ongeldigGemaakt).toHaveLength(0);
  });

  it('stuurt bij het wijzigen alleen het tickettype-id naar de api, niet het concert', async () => {
    // Het concertId dient hier alleen om te weten welke queries daarna
    // vernieuwd moeten worden; de api-aanroep heeft het niet nodig.
    alsMock(updateTicketType).mockResolvedValue(undefined);

    const { result } = renderHook(() => useUpdateTicketType(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ ticketTypeId: 'tt1', concertId: 'c1', updates: { price: 15 } });
    });

    expect(updateTicketType).toHaveBeenCalledWith('tt1', { price: 15 });
    expect(isOngeldigGemaakt(['tickets', 'concert', 'c1'])).toBe(true);
    expect(isOngeldigGemaakt(['tickets', 'stats', 'c1'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('common.saved');
  });

  it('verwijdert een tickettype en vernieuwt aanbod en verkoopcijfers', async () => {
    alsMock(deleteTicketType).mockResolvedValue(undefined);

    const { result } = renderHook(() => useDeleteTicketType(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ ticketTypeId: 'tt1', concertId: 'c1' });
    });

    expect(deleteTicketType).toHaveBeenCalledWith('tt1');
    expect(isOngeldigGemaakt(['tickets', 'concert', 'c1'])).toBe(true);
    expect(isOngeldigGemaakt(['tickets', 'stats', 'c1'])).toBe(true);
  });

  it('meldt na het verwijderen dat het tickettype verwijderd is', async () => {
    // De melding moet vertellen wat er gebeurd is ("Tickettype verwijderd"),
    // niet de knoptekst herhalen ("Verwijderen").
    alsMock(deleteTicketType).mockResolvedValue(undefined);

    const { result } = renderHook(() => useDeleteTicketType(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ ticketTypeId: 'tt1', concertId: 'c1' });
    });

    expect(showSuccess).toHaveBeenCalledWith('tickets.ticketTypeDeleted');
  });
});

// ==================== ANNULEREN EN TERUGBETALEN ====================

describe('useTickets - annuleren en terugbetalen', () => {
  it('annuleert een ticket en vernieuwt verkoopcijfers en bezoekerslijst', async () => {
    alsMock(cancelTicket).mockResolvedValue(undefined);

    const { result } = renderHook(() => useCancelTicket(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ ticketId: 'tk1', concertId: 'c1' });
    });

    expect(cancelTicket).toHaveBeenCalledWith('tk1');
    expect(isOngeldigGemaakt(['tickets', 'stats', 'c1'])).toBe(true);
    expect(isOngeldigGemaakt(['tickets', 'attendees', 'c1'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('tickets.ticketCancelled');
  });

  it('betaalt een bestelling terug met opgegeven reden', async () => {
    alsMock(refundOrder).mockResolvedValue({ refunded: true });

    const { result } = renderHook(() => useRefundOrder(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ orderId: 'o1', concertId: 'c1', reason: 'Concert afgelast' });
    });

    expect(refundOrder).toHaveBeenCalledWith('o1', 'Concert afgelast');
    expect(isOngeldigGemaakt(['tickets', 'stats', 'c1'])).toBe(true);
    expect(isOngeldigGemaakt(['tickets', 'attendees', 'c1'])).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith('tickets.orderRefunded');
  });

  it('toont een foutmelding en meldt geen succes als terugbetalen mislukt', async () => {
    alsMock(refundOrder).mockRejectedValue(serverfout('Bestelling is al terugbetaald'));

    const { result } = renderHook(() => useRefundOrder(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync({ orderId: 'o1', concertId: 'c1' })).rejects.toBeDefined();
    });

    expect(showError).toHaveBeenCalledWith('Bestelling is al terugbetaald');
    expect(showSuccess).not.toHaveBeenCalled();
    expect(ongeldigGemaakt).toHaveLength(0);
  });

  it('vraagt de bezoekerslijst als csv op zonder de cache te raken', async () => {
    alsMock(exportConcertAttendeesCsv).mockResolvedValue('naam;ticket');

    const { result } = renderHook(() => useExportAttendees(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('c1');
    });

    expect(exportConcertAttendeesCsv).toHaveBeenCalledWith('c1');
    expect(ongeldigGemaakt).toHaveLength(0);
  });
});
