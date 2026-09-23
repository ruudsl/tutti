/**
 * De koppeling met Google Agenda bij een Google dat hapert.
 *
 * Opnieuw proberen is alleen veilig als een tweede poging niets extra's doet.
 * Een afspraak bijwerken of verwijderen kan dus nog eens; een afspraak
 * aanmaken of een eenmalige code inwisselen niet. Er gaat hier niets over het
 * netwerk: fetch is vervangen.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '../setup';
import {
  exchangeGoogleCode,
  refreshGoogleToken,
  createGoogleCalendarEvent,
  updateGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  type CalendarEvent,
} from '../../services/calendarSync';

const nepFetch = vi.fn<typeof fetch>();

beforeEach(() => {
  nepFetch.mockReset();
  vi.stubGlobal('fetch', nepFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const repetitie: CalendarEvent = {
  id: 'rehearsal-r1',
  title: 'Repetitie',
  startDate: new Date('2026-10-01T19:30:00Z'),
  endDate: new Date('2026-10-01T21:30:00Z'),
};

describe('Google Agenda bij een haperend Google', () => {
  it('maakt een afspraak maar één keer aan, ook na een 503', async () => {
    nepFetch.mockResolvedValue(json(503, { error: 'backendError' }));

    await expect(createGoogleCalendarEvent('token', 'primary', repetitie)).rejects.toThrow(/Google Calendar/);
    expect(nepFetch).toHaveBeenCalledTimes(1);
  });

  it('werkt een afspraak bij, ook als de eerste poging een 503 gaf', async () => {
    nepFetch.mockResolvedValueOnce(json(503, {})).mockResolvedValueOnce(json(200, { id: 'x' }));

    await updateGoogleCalendarEvent('token', 'primary', 'x', repetitie);

    expect(nepFetch).toHaveBeenCalledTimes(2);
  });

  it('vindt een afspraak die al weg is goed - 404 en 410', async () => {
    // 410 Gone is wat een herkansing ziet als de eerste poging wel aankwam.
    nepFetch.mockResolvedValueOnce(new Response(null, { status: 404 }));
    await expect(deleteGoogleCalendarEvent('token', 'primary', 'x')).resolves.toBeUndefined();

    nepFetch.mockResolvedValueOnce(new Response(null, { status: 410 }));
    await expect(deleteGoogleCalendarEvent('token', 'primary', 'x')).resolves.toBeUndefined();
  });

  it('wisselt een autorisatiecode maar één keer in', async () => {
    nepFetch.mockResolvedValue(json(503, {}));

    await expect(exchangeGoogleCode('code', 'id', 'geheim', 'https://terug')).rejects.toThrow();
    expect(nepFetch).toHaveBeenCalledTimes(1);
  });

  it('vernieuwt een token wel opnieuw na een 503', async () => {
    nepFetch
      .mockResolvedValueOnce(json(503, {}))
      .mockResolvedValueOnce(json(200, { access_token: 'nieuw', expires_in: 3600 }));

    const uit = await refreshGoogleToken('ververs', 'id', 'geheim');

    expect(uit.accessToken).toBe('nieuw');
    expect(nepFetch).toHaveBeenCalledTimes(2);
  });

  it('geeft elke aanroep een tijdslimiet mee', async () => {
    nepFetch.mockResolvedValue(new Response(null, { status: 204 }));

    await deleteGoogleCalendarEvent('token', 'primary', 'x');

    expect((nepFetch.mock.calls[0][1] as RequestInit).signal).toBeInstanceOf(AbortSignal);
  });
});
