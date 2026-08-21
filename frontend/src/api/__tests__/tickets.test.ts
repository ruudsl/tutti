/**
 * Tests voor de kaartverkoop-api.
 *
 * De functies in tickets.ts zijn dun: ze zetten een pad in elkaar, geven een
 * body mee en leveren `response.data` terug. Juist daarom wordt hier op het pad,
 * de methode en de body getoetst - een typefout daarin geeft geen foutmelding
 * maar een leeg scherm. De routes zijn vergeleken met backend/src/routes/tickets.ts.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  startNepserver,
  stopNepserver,
  antwoordMet,
  antwoordMetFout,
  antwoordMetNetwerkfout,
  antwoordMetTijdslimiet,
  laatsteVerzoek,
  alleVerzoeken,
} from './nepserver';
import {
  getConcertTickets,
  createTicketOrder,
  getTicketOrder,
  payTicketOrder,
  getTicketByCode,
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
  getTicketDashboard,
  getTicketSales,
  getPaymentDetails,
  getSalesPredictions,
  getScannedTickets,
  exportTicketSalesCsv,
  getTransferableTickets,
  initiateTicketTransfer,
  getPendingTransfers,
  cancelTicketTransfer,
  acceptTicketTransfer,
  getTransferByCode,
  getTransferHistory,
} from '../tickets';

beforeEach(() => startNepserver());
afterEach(() => {
  stopNepserver();
  vi.restoreAllMocks();
});

// ===========================================
// PUBLIEKE KAARTVERKOOP
// ===========================================

describe('getConcertTickets', () => {
  it('haalt de kaartinformatie van een concert op', async () => {
    antwoordMet({ concert: { id: 'c1', name: 'Nieuwjaarsconcert' }, ticketTypes: [] });
    const resultaat = await getConcertTickets('c1');

    expect(laatsteVerzoek().methode).toBe('get');
    expect(laatsteVerzoek().pad).toBe('/concerts/c1/tickets');
    expect(resultaat.concert.name).toBe('Nieuwjaarsconcert');
  });

  it('geeft het antwoord ongewijzigd door, inclusief geneste velden', async () => {
    const antwoord = {
      concert: { id: 'c1', name: 'Lente', date: '2026-04-01', endDate: null, location: null },
      ticketTypes: [{ id: 't1', name: 'Standaard', price: 1250, available: 8, serviceFee: 0 }],
      paymentMethods: ['ideal'],
      captcha: { enabled: false, siteKey: null },
    };
    antwoordMet(antwoord);

    await expect(getConcertTickets('c1')).resolves.toEqual(antwoord);
  });

  it('laat een 404 door in plaats van hem als leeg resultaat te verpakken', async () => {
    antwoordMetFout(404, { error: 'Concert not found' });

    await expect(getConcertTickets('bestaat-niet')).rejects.toMatchObject({
      response: { status: 404, data: { error: 'Concert not found' } },
    });
  });
});

describe('createTicketOrder', () => {
  it('stuurt de bestelling als body naar de besteldroute van het concert', async () => {
    antwoordMet({ orderId: 'o1', total: 2500, expiresAt: '2026-01-01T12:00:00Z', items: [] });

    await createTicketOrder('c1', {
      items: [{ ticketTypeId: 'tt1', quantity: 2 }],
      buyerName: 'Jan Jansen',
      buyerEmail: 'jan@example.com',
      buyerPhone: '0612345678',
      notes: 'Rolstoelplaats',
      captchaToken: 'abc',
    });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/concerts/c1/tickets/order');
    // De backend leest exact deze veldnamen (createOrderSchema in tickets.ts).
    expect(verzoek.body).toEqual({
      items: [{ ticketTypeId: 'tt1', quantity: 2 }],
      buyerName: 'Jan Jansen',
      buyerEmail: 'jan@example.com',
      buyerPhone: '0612345678',
      notes: 'Rolstoelplaats',
      captchaToken: 'abc',
    });
  });

  it('laat optionele velden weg in plaats van ze als null te sturen', async () => {
    antwoordMet({ orderId: 'o1', total: 0, expiresAt: '', items: [] });

    await createTicketOrder('c1', {
      items: [{ ticketTypeId: 'tt1', quantity: 1 }],
      buyerName: 'Jan',
      buyerEmail: 'jan@example.com',
    });

    const body = laatsteVerzoek().body as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['buyerEmail', 'buyerName', 'items']);
  });

  it('geeft een validatiefout van de server door met de melding erbij', async () => {
    antwoordMetFout(400, { error: 'Valid email required' });

    await expect(
      createTicketOrder('c1', { items: [{ ticketTypeId: 'tt1', quantity: 1 }], buyerName: 'Jan', buyerEmail: 'fout' }),
    ).rejects.toMatchObject({ response: { status: 400, data: { error: 'Valid email required' } } });
  });
});

describe('getTicketOrder', () => {
  it('haalt een bestelling op via /tickets/orders/:id', async () => {
    antwoordMet({ id: 'o1', status: 'pending' });
    const bestelling = await getTicketOrder('o1');

    expect(laatsteVerzoek().pad).toBe('/tickets/orders/o1');
    expect(bestelling.status).toBe('pending');
  });
});

describe('payTicketOrder', () => {
  it('stuurt betaalmethode en terugkeeradres mee', async () => {
    antwoordMet({ paymentId: 'p1', checkoutUrl: 'https://betalen.example/p1' });

    const resultaat = await payTicketOrder('o1', { method: 'ideal', returnUrl: 'https://tutti.example/klaar' });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/tickets/orders/o1/pay');
    expect(verzoek.body).toEqual({ method: 'ideal', returnUrl: 'https://tutti.example/klaar' });
    expect(resultaat.checkoutUrl).toBe('https://betalen.example/p1');
  });

  it('stuurt een leeg object als er geen voorkeur is opgegeven', async () => {
    antwoordMet({ paymentId: 'p1', checkoutUrl: 'x' });
    await payTicketOrder('o1', {});

    expect(laatsteVerzoek().body).toEqual({});
  });
});

describe('getTicketByCode', () => {
  it('haalt een kaart op via de code', async () => {
    antwoordMet({ id: 't1', code: 'ABC-123' });
    await getTicketByCode('ABC-123');

    expect(laatsteVerzoek().pad).toBe('/tickets/ABC-123');
  });
});

describe('validateTicket', () => {
  it('stuurt de code in het pad en het concert in de body', async () => {
    antwoordMet({ valid: true, status: 'used' });

    await validateTicket('ABC-123', 'c1');

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/tickets/ABC-123/validate');
    expect(verzoek.body).toEqual({ concertId: 'c1' });
  });

  it('stuurt een lege body als er geen concert is meegegeven', async () => {
    antwoordMet({ valid: true });
    await validateTicket('ABC-123');

    // concertId is undefined; JSON.stringify laat het veld dan weg. De backend
    // behandelt een ontbrekend concertId als "controleer niet op concert".
    expect(laatsteVerzoek().body).toEqual({});
  });

  it('geeft een afgekeurde kaart terug als gewoon antwoord, niet als fout', async () => {
    // De backend antwoordt met 200 en valid:false wanneer de kaart niet deugt.
    antwoordMet({ valid: false, status: 'used', message: 'Al gescand' });

    const resultaat = await validateTicket('ABC-123');
    expect(resultaat.valid).toBe(false);
  });
});

describe('getMyTickets', () => {
  it('haalt de eigen kaarten op', async () => {
    antwoordMet([{ id: 't1' }, { id: 't2' }]);
    const kaarten = await getMyTickets();

    expect(laatsteVerzoek().pad).toBe('/tickets/my');
    expect(kaarten).toHaveLength(2);
  });

  it('geeft een lege lijst terug als de gebruiker geen kaarten heeft', async () => {
    antwoordMet([]);
    await expect(getMyTickets()).resolves.toEqual([]);
  });

  it('werpt bij een 401 en levert geen lege lijst op', async () => {
    antwoordMetFout(401, { error: 'Niet ingelogd.' });

    await expect(getMyTickets()).rejects.toMatchObject({ response: { status: 401 } });
  });

  it('werpt bij een netwerkfout zonder respons', async () => {
    antwoordMetNetwerkfout();

    await expect(getMyTickets()).rejects.toMatchObject({ code: 'ERR_NETWORK' });
  });

  it('werpt als het verzoek in de tijdslimiet loopt', async () => {
    antwoordMetTijdslimiet();

    await expect(getMyTickets()).rejects.toMatchObject({ code: 'ECONNABORTED' });
  });
});

// ===========================================
// KAARTSOORTEN (BEHEER)
// ===========================================

describe('createTicketType', () => {
  it('post de kaartsoort naar het concert', async () => {
    antwoordMet({ id: 'tt1' });

    await createTicketType('c1', {
      name: 'VIP',
      price: 5000,
      quantity: 20,
      description: 'Inclusief drankje',
      saleStart: '2026-01-01T00:00:00.000Z',
      saleEnd: '2026-03-01T00:00:00.000Z',
      maxPerOrder: 4,
    });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/concerts/c1/ticket-types');
    expect(verzoek.body).toMatchObject({ name: 'VIP', price: 5000, quantity: 20, maxPerOrder: 4 });
  });

  it('stuurt een prijs van 0 mee in plaats van hem weg te laten', async () => {
    antwoordMet({ id: 'tt1' });
    await createTicketType('c1', { name: 'Gratis', price: 0, quantity: 10 });

    expect(laatsteVerzoek().body).toEqual({ name: 'Gratis', price: 0, quantity: 10 });
  });
});

describe('updateTicketType', () => {
  it('gebruikt PUT op /ticket-types/:id, dus zonder concert in het pad', async () => {
    antwoordMet({ success: true });

    await updateTicketType('tt1', { price: 1500 });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('put');
    expect(verzoek.pad).toBe('/ticket-types/tt1');
    expect(verzoek.body).toEqual({ price: 1500 });
  });
});

describe('deleteTicketType', () => {
  it('verwijdert een kaartsoort', async () => {
    antwoordMet({ success: true });
    await deleteTicketType('tt1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/ticket-types/tt1');
  });

  it('laat een 409 door wanneer er al kaarten verkocht zijn', async () => {
    antwoordMetFout(409, { error: 'Er zijn al kaarten verkocht.' });

    await expect(deleteTicketType('tt1')).rejects.toMatchObject({ response: { status: 409 } });
  });
});

// ===========================================
// BEHEER EN OVERZICHTEN
// ===========================================

describe('overzichtsroutes', () => {
  it.each([
    ['getConcertTicketStats', () => getConcertTicketStats('c1'), '/concerts/c1/ticket-stats'],
    ['getConcertAttendees', () => getConcertAttendees('c1'), '/concerts/c1/attendees'],
    ['getSeatHeatmapData', () => getSeatHeatmapData('c1'), '/concerts/c1/seats/heatmap-data'],
    ['getTicketDashboard', () => getTicketDashboard('c1'), '/tickets/dashboard/c1'],
    ['getSalesPredictions', () => getSalesPredictions('c1'), '/concerts/c1/tickets/predictions'],
    ['getScannedTickets', () => getScannedTickets('c1'), '/concerts/c1/scanned-tickets'],
    ['getPaymentDetails', () => getPaymentDetails('o1'), '/tickets/sales/o1/payment-details'],
  ])('%s bevraagt %s', async (_naam, aanroep, pad) => {
    antwoordMet({});
    await aanroep();

    expect(laatsteVerzoek().methode).toBe('get');
    expect(laatsteVerzoek().pad).toBe(pad);
  });

  it('getConcertAttendees geeft een lege bezoekerslijst terug zonder te vallen', async () => {
    antwoordMet([]);
    await expect(getConcertAttendees('c1')).resolves.toEqual([]);
  });

  it('getScannedTickets geeft het geneste antwoord ongewijzigd door', async () => {
    const antwoord = {
      concert: { id: 'c1', name: 'Slotconcert', date: '2026-06-01' },
      summary: { totalTickets: 100, scannedCount: 42, scanPercentage: 42 },
      scannedTickets: [{ id: 't1', buyerName: 'Jan', scannedAt: '2026-06-01T19:30:00Z' }],
    };
    antwoordMet(antwoord);

    await expect(getScannedTickets('c1')).resolves.toEqual(antwoord);
  });

  it('getTicketDashboard laat een 403 door voor wie geen beheerder is', async () => {
    antwoordMetFout(403, { error: 'Geen toegang.' });

    await expect(getTicketDashboard('c1')).rejects.toMatchObject({ response: { status: 403 } });
  });

  it('getConcertTicketStats laat een 500 door in plaats van undefined te leveren', async () => {
    antwoordMetFout(500, { error: 'Interne fout' });

    await expect(getConcertTicketStats('c1')).rejects.toMatchObject({ response: { status: 500 } });
  });
});

describe('getTicketSales', () => {
  it('zet alle filters in de queryreeks', async () => {
    antwoordMet({ orders: [], summary: {}, pagination: {} });

    await getTicketSales({
      concertId: 'c1',
      status: 'paid',
      startDate: '2026-01-01',
      endDate: '2026-02-01',
      page: 2,
      limit: 25,
    });

    const { query, pad } = laatsteVerzoek();
    expect(pad).toBe('/tickets/sales');
    expect(query.get('concertId')).toBe('c1');
    expect(query.get('status')).toBe('paid');
    expect(query.get('startDate')).toBe('2026-01-01');
    expect(query.get('endDate')).toBe('2026-02-01');
    expect(query.get('page')).toBe('2');
    expect(query.get('limit')).toBe('25');
  });

  it('stuurt geen queryreeks mee als er geen filters zijn', async () => {
    antwoordMet({ orders: [] });
    await getTicketSales();

    expect(laatsteVerzoek().queryreeks).toBe('');
  });

  it('laat velden die niet ingevuld zijn weg uit de queryreeks', async () => {
    antwoordMet({ orders: [] });
    await getTicketSales({ concertId: 'c1', status: undefined });

    expect(laatsteVerzoek().queryreeks).toBe('concertId=c1');
  });

  it('codeert een status met een ampersand, spatie en procentteken', async () => {
    antwoordMet({ orders: [] });
    await getTicketSales({ status: 'betaald & 100% klaar' });

    const { queryreeks, query } = laatsteVerzoek();
    // De rauwe reeks mag geen losse & of % bevatten, anders leest de server
    // hier twee parameters in plaats van een.
    expect(queryreeks).not.toContain('& 100');
    expect(queryreeks).toContain('%26');
    expect(queryreeks).toContain('100%25');
    // En terugvertaald hoort er weer precies uit te komen wat erin ging.
    expect(query.get('status')).toBe('betaald & 100% klaar');
  });

  it('houdt een plusteken in een zoekwaarde overeind', async () => {
    antwoordMet({ orders: [] });
    await getTicketSales({ concertId: 'a+b' });

    expect(laatsteVerzoek().query.get('concertId')).toBe('a+b');
  });
});

// ===========================================
// ANNULEREN EN TERUGBETALEN
// ===========================================

describe('cancelTicket', () => {
  it('annuleert een kaart zonder body', async () => {
    antwoordMet({ success: true, message: 'Geannuleerd' });
    await cancelTicket('t1');

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/tickets/t1/cancel');
    expect(verzoek.body).toBeUndefined();
  });
});

describe('refundOrder', () => {
  it('stuurt de reden mee', async () => {
    antwoordMet({ success: true, refundId: 'r1', message: 'Terugbetaald' });
    await refundOrder('o1', 'Concert afgelast');

    expect(laatsteVerzoek().pad).toBe('/tickets/orders/o1/refund');
    expect(laatsteVerzoek().body).toEqual({ reason: 'Concert afgelast' });
  });

  it('stuurt een lege body als er geen reden is', async () => {
    antwoordMet({ success: true, message: '' });
    await refundOrder('o1');

    expect(laatsteVerzoek().body).toEqual({});
  });
});

describe('mockPayment', () => {
  it.each(['pay', 'cancel'] as const)('stuurt de actie %s mee', async (actie) => {
    antwoordMet({ success: true });
    await mockPayment('o1', actie);

    expect(laatsteVerzoek().pad).toBe('/tickets/orders/o1/mock-payment');
    expect(laatsteVerzoek().body).toEqual({ action: actie });
  });
});

// ===========================================
// CSV-EXPORT
// ===========================================

/** Vangt de aangemaakte downloadlink op; jsdom kent createObjectURL niet. */
function vangDownloadOp() {
  const anker = document.createElement('a');
  const klik = vi.spyOn(anker, 'click').mockImplementation(() => {});
  vi.spyOn(document, 'createElement').mockReturnValue(anker);
  const maakUrl = vi.fn(() => 'blob:nep');
  const geefVrij = vi.fn();
  Object.defineProperty(window.URL, 'createObjectURL', { value: maakUrl, configurable: true, writable: true });
  Object.defineProperty(window.URL, 'revokeObjectURL', { value: geefVrij, configurable: true, writable: true });
  return { anker, klik, maakUrl, geefVrij };
}

describe('exportConcertAttendeesCsv', () => {
  it('vraagt het bestand als blob op en biedt het aan met een naam per concert', async () => {
    const { anker, klik, maakUrl, geefVrij } = vangDownloadOp();
    antwoordMet('code,naam\nABC,Jan');

    await exportConcertAttendeesCsv('c1');

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('get');
    expect(verzoek.responseType).toBe('blob');
    // format=csv staat in het pad zelf; de backend leest req.query.format.
    expect(verzoek.query.get('format')).toBe('csv');
    expect(verzoek.pad).toBe('/concerts/c1/attendees?format=csv');
    expect(anker.download).toBe('attendees-c1.csv');
    expect(klik).toHaveBeenCalledTimes(1);
    expect(maakUrl).toHaveBeenCalledTimes(1);
    expect(geefVrij).toHaveBeenCalledWith('blob:nep');
  });

  it('zet geen download klaar als de server een fout geeft', async () => {
    const { klik } = vangDownloadOp();
    antwoordMetFout(403, { error: 'Geen toegang.' });

    await expect(exportConcertAttendeesCsv('c1')).rejects.toMatchObject({ response: { status: 403 } });
    expect(klik).not.toHaveBeenCalled();
  });
});

describe('exportTicketSalesCsv', () => {
  it('geeft de filters mee als queryparameters en gebruikt de datum in de bestandsnaam', async () => {
    const { anker, klik } = vangDownloadOp();
    vi.setSystemTime(new Date('2026-05-17T10:00:00Z'));
    antwoordMet('order,bedrag');

    await exportTicketSalesCsv({ concertId: 'c1', status: 'paid' });

    const verzoek = laatsteVerzoek();
    expect(verzoek.pad).toBe('/tickets/sales/export');
    expect(verzoek.responseType).toBe('blob');
    expect(verzoek.query.get('concertId')).toBe('c1');
    expect(verzoek.query.get('status')).toBe('paid');
    expect(anker.download).toBe('ticket-sales-2026-05-17.csv');
    expect(klik).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('werkt zonder filters', async () => {
    vangDownloadOp();
    antwoordMet('order,bedrag');

    await exportTicketSalesCsv();

    expect(laatsteVerzoek().queryreeks).toBe('');
  });
});

// ===========================================
// OVERDRACHT VAN KAARTEN
// ===========================================

describe('overdrachtsroutes', () => {
  it('getTransferableTickets bevraagt /tickets/transferable', async () => {
    antwoordMet([]);
    await getTransferableTickets();

    expect(laatsteVerzoek().pad).toBe('/tickets/transferable');
  });

  it('getPendingTransfers bevraagt /tickets/transfers', async () => {
    antwoordMet([]);
    await getPendingTransfers();

    expect(laatsteVerzoek().pad).toBe('/tickets/transfers');
  });

  it('getTransferHistory bevraagt /tickets/transfers/history', async () => {
    antwoordMet([]);
    await getTransferHistory();

    // history staat in de backend voor /transfers/:transferCode geregistreerd,
    // dus dit vaste pad hoort niet als transfercode gelezen te worden.
    expect(laatsteVerzoek().pad).toBe('/tickets/transfers/history');
  });

  it('getTransferByCode bevraagt de code onder /tickets/transfers', async () => {
    antwoordMet({ id: 'tr1' });
    await getTransferByCode('CODE-1');

    expect(laatsteVerzoek().pad).toBe('/tickets/transfers/CODE-1');
  });

  it('initiateTicketTransfer stuurt ontvanger en naam mee', async () => {
    antwoordMet({ transfer: { id: 'tr1' }, message: 'Verstuurd' });

    await initiateTicketTransfer('t1', { recipientEmail: 'piet@example.com', recipientName: 'Piet' });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/tickets/t1/transfer');
    // De backend leest recipientEmail en recipientName (initiateTransferSchema).
    expect(verzoek.body).toEqual({ recipientEmail: 'piet@example.com', recipientName: 'Piet' });
  });

  it('cancelTicketTransfer verwijdert de overdracht', async () => {
    antwoordMet({ success: true, message: 'Ingetrokken' });
    await cancelTicketTransfer('tr1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/tickets/transfers/tr1');
  });

  it('acceptTicketTransfer post op de accepteerroute zonder body', async () => {
    antwoordMet({ success: true, ticket: { id: 't1' }, message: 'Overgenomen' });
    await acceptTicketTransfer('CODE-1');

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/tickets/transfers/CODE-1/accept');
    expect(verzoek.body).toBeUndefined();
  });

  it('laat een verlopen overdracht als fout doorkomen', async () => {
    antwoordMetFout(410, { error: 'Deze overdracht is verlopen.' });

    await expect(acceptTicketTransfer('CODE-1')).rejects.toMatchObject({
      response: { status: 410, data: { error: 'Deze overdracht is verlopen.' } },
    });
  });
});

// ===========================================
// ALGEMEEN GEDRAG
// ===========================================

describe('algemeen gedrag van de kaartverkoop-api', () => {
  it('stuurt precies een verzoek per aanroep', async () => {
    antwoordMet([]);
    await getMyTickets();

    expect(alleVerzoeken()).toHaveLength(1);
  });

  it('geeft een leeg antwoordlichaam door als lege string in plaats van te vallen', async () => {
    // 204-achtige antwoorden komen bij axios binnen als lege string.
    antwoordMet('', { status: 204 });

    await expect(deleteTicketType('tt1')).resolves.toBe('');
  });

  it('geeft een lijst terug waar een object werd verwacht zonder hem stil te wissen', async () => {
    // De laag zet niets om; als de server iets anders levert dan verwacht komt
    // dat ongewijzigd bij de aanroeper terecht en niet als undefined.
    antwoordMet([{ id: 'o1' }]);

    await expect(getTicketOrder('o1')).resolves.toEqual([{ id: 'o1' }]);
  });

  it('geeft null door zoals het binnenkomt', async () => {
    antwoordMet(null);

    await expect(getTicketOrder('o1')).resolves.toBeNull();
  });
});
