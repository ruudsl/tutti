/**
 * De ICS-opbouw voor de agenda-export.
 *
 * Een ICS-bestand wordt gelezen door Google Agenda, Apple Agenda en Outlook,
 * en die zijn onverbiddelijk: één ontbrekende regel of een niet-ontsnapte
 * puntkomma en het hele bestand wordt geweigerd. Dat merkt een lid pas als de
 * repetitie niet in zijn agenda staat. Daarom gaan deze tests over de vorm van
 * de uitvoer en niet over "hij doet iets".
 *
 * De tokenvergelijking zit hier ook bij. Die gebruikte timingSafeEqual op twee
 * buffers van mogelijk verschillende lengte, en dat werpt een RangeError in
 * plaats van "nee" terug te geven.
 */

import { describe, it, expect } from 'vitest';
import '../setup';
import {
  generateEventIcs,
  generateCalendarFeed,
  rehearsalToCalendarEvent,
  concertToCalendarEvent,
  generateCalendarFeedToken,
  verifyCalendarFeedToken,
  tokensGelijk,
  CalendarEvent,
} from '../../services/calendarSync';

const gebeurtenis: CalendarEvent = {
  id: 'rehearsal-1',
  title: 'Repetitie - Fanfare',
  description: 'Neem de nieuwe partij mee',
  location: 'Dorpshuis',
  startDate: new Date('2026-09-01T19:30:00.000Z'),
  endDate: new Date('2026-09-01T21:30:00.000Z'),
};

/** Ontvouw de regels weer, zodat een vergelijking niet op de vouwing struikelt. */
function regels(ics: string): string[] {
  return ics.replace(/\r\n /g, '').split('\r\n');
}

describe('een losse gebeurtenis als ICS', () => {
  it('opent en sluit het bestand zoals het hoort', () => {
    const ics = generateEventIcs(gebeurtenis);
    const r = regels(ics);

    expect(r[0]).toBe('BEGIN:VCALENDAR');
    expect(r.at(-1)).toBe('END:VCALENDAR');
    expect(r).toContain('VERSION:2.0');
    expect(r).toContain('BEGIN:VEVENT');
    expect(r).toContain('END:VEVENT');
  });

  it('scheidt de regels met CRLF, zoals RFC 5545 eist', () => {
    const ics = generateEventIcs(gebeurtenis);
    expect(ics).toContain('\r\n');
    expect(ics.split('\r\n').every((r) => !r.includes('\n'))).toBe(true);
  });

  it('zet begin- en eindtijd in het juiste formaat', () => {
    const r = regels(generateEventIcs(gebeurtenis));
    expect(r).toContain('DTSTART:20260901T193000Z');
    expect(r).toContain('DTEND:20260901T213000Z');
  });

  it('schrijft een dag zonder tijd als DATE-waarde', () => {
    const r = regels(
      generateEventIcs({
        ...gebeurtenis,
        allDay: true,
        startDate: new Date('2026-12-20T00:00:00.000Z'),
        endDate: new Date('2026-12-21T00:00:00.000Z'),
      }),
    );

    expect(r).toContain('DTSTART;VALUE=DATE:20261220');
    expect(r).toContain('DTEND;VALUE=DATE:20261221');
  });

  it('geeft de gebeurtenis een uid met een domein erin', () => {
    const uid = regels(generateEventIcs(gebeurtenis)).find((r) => r.startsWith('UID:'));
    expect(uid).toMatch(/^UID:rehearsal-1@.+/);
  });

  it('neemt omschrijving en locatie mee', () => {
    const r = regels(generateEventIcs(gebeurtenis));
    expect(r).toContain('DESCRIPTION:Neem de nieuwe partij mee');
    expect(r).toContain('LOCATION:Dorpshuis');
  });

  it('laat omschrijving en locatie weg als ze er niet zijn', () => {
    const r = regels(generateEventIcs({ ...gebeurtenis, description: undefined, location: undefined }));
    expect(r.some((x) => x.startsWith('DESCRIPTION:'))).toBe(false);
    expect(r.some((x) => x.startsWith('LOCATION:'))).toBe(false);
  });

  it('ontsnapt tekens die in ICS een betekenis hebben', () => {
    const r = regels(
      generateEventIcs({ ...gebeurtenis, title: 'Repetitie; koper, hout', description: 'Regel een\nRegel twee' }),
    );

    expect(r).toContain('SUMMARY:Repetitie\\; koper\\, hout');
    expect(r).toContain('DESCRIPTION:Regel een\\nRegel twee');
  });

  it('ontsnapt een backslash voordat de rest wordt ontsnapt', () => {
    const r = regels(generateEventIcs({ ...gebeurtenis, title: 'Pad C:\\muziek' }));
    expect(r).toContain('SUMMARY:Pad C:\\\\muziek');
  });

  it('vouwt een lange regel op vijfenzeventig tekens', () => {
    const langeTitel = 'Zeer uitgebreide repetitie van het volledige harmonieorkest met alle secties tegelijk';
    const ics = generateEventIcs({ ...gebeurtenis, title: langeTitel });

    expect(ics.split('\r\n').every((r) => r.length <= 75)).toBe(true);
    // Elke vervolgregel begint met een spatie; ontvouwd staat de titel er heel in.
    expect(regels(ics)).toContain(`SUMMARY:${langeTitel}`);
  });

  it('neemt een herhaalregel over', () => {
    const r = regels(
      generateEventIcs({
        ...gebeurtenis,
        recurrence: { frequency: 'WEEKLY', interval: 2, count: 10, byDay: ['TU'] },
      }),
    );

    expect(r).toContain('RRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=10;BYDAY=TU');
  });

  it('laat een interval van één weg uit de herhaalregel', () => {
    const r = regels(generateEventIcs({ ...gebeurtenis, recurrence: { frequency: 'WEEKLY', interval: 1 } }));
    expect(r).toContain('RRULE:FREQ=WEEKLY');
  });

  it('neemt een organisator op', () => {
    const r = regels(
      generateEventIcs({ ...gebeurtenis, organizer: { name: 'Harmonie Sint Cecilia', email: 'info@test.nl' } }),
    );
    expect(r.some((x) => x.startsWith('ORGANIZER;CN=Harmonie Sint Cecilia:mailto:info@test.nl'))).toBe(true);
  });
});

describe('een hele agenda als ICS', () => {
  it('zet elke gebeurtenis in een eigen VEVENT', () => {
    const ics = generateCalendarFeed(
      [gebeurtenis, { ...gebeurtenis, id: 'concert-1', title: 'Kerstconcert' }],
      'Harmonie - Jan Jansen',
    );
    const r = regels(ics);

    expect(r.filter((x) => x === 'BEGIN:VEVENT')).toHaveLength(2);
    expect(r.filter((x) => x === 'END:VEVENT')).toHaveLength(2);
  });

  it('geeft de agenda een naam', () => {
    const r = regels(generateCalendarFeed([gebeurtenis], 'Harmonie - Jan Jansen'));
    expect(r.some((x) => x.includes('Harmonie - Jan Jansen'))).toBe(true);
  });

  it('levert een geldig maar leeg bestand als er niets in de agenda staat', () => {
    const r = regels(generateCalendarFeed([], 'Lege agenda'));

    expect(r[0]).toBe('BEGIN:VCALENDAR');
    expect(r.at(-1)).toBe('END:VCALENDAR');
    expect(r).not.toContain('BEGIN:VEVENT');
  });
});

describe('een repetitie omzetten', () => {
  const repetitie = {
    id: 'r1',
    date: '2026-09-01',
    start_time: '19:30',
    end_time: '21:30',
    location: 'Dorpshuis',
    orchestra_name: 'Fanfare',
    type: 'regular',
  };

  it('zet naam en tijden om', () => {
    const gebeurtenis = rehearsalToCalendarEvent(repetitie);

    expect(gebeurtenis.id).toBe('rehearsal-r1');
    expect(gebeurtenis.title).toBe('Repetitie - Fanfare');
    expect(gebeurtenis.location).toBe('Dorpshuis');
    expect(gebeurtenis.startDate.getHours()).toBe(19);
    expect(gebeurtenis.startDate.getMinutes()).toBe(30);
    expect(gebeurtenis.endDate.getHours()).toBe(21);
  });

  it('laat het orkest weg als het er niet is', () => {
    expect(rehearsalToCalendarEvent({ ...repetitie, orchestra_name: undefined }).title).toBe('Repetitie');
  });

  it('markeert een extra repetitie', () => {
    expect(rehearsalToCalendarEvent({ ...repetitie, type: 'extra' }).title).toBe('[Extra] Repetitie - Fanfare');
  });

  it('markeert een vervallen repetitie', () => {
    expect(rehearsalToCalendarEvent({ ...repetitie, type: 'cancelled' }).title).toBe('[Vervallen] Repetitie - Fanfare');
  });

  it('neemt de notitie over als omschrijving', () => {
    expect(rehearsalToCalendarEvent({ ...repetitie, notes: 'Zaal open om 19:00' }).description).toBe(
      'Zaal open om 19:00',
    );
  });

  it('laat de omschrijving leeg als er geen notitie is', () => {
    expect(rehearsalToCalendarEvent(repetitie).description).toBeUndefined();
  });
});

describe('een concert omzetten', () => {
  const concert = { id: 'c1', name: 'Kerstconcert', date: '2026-12-20', location: 'Kerk' };

  it('wordt een gebeurtenis van een hele dag', () => {
    const gebeurtenis = concertToCalendarEvent(concert);

    expect(gebeurtenis.id).toBe('concert-c1');
    expect(gebeurtenis.title).toBe('Kerstconcert');
    expect(gebeurtenis.allDay).toBe(true);
  });

  it('legt het einde een dag later, zoals ICS voorschrijft', () => {
    const gebeurtenis = concertToCalendarEvent(concert);
    expect(gebeurtenis.endDate.toISOString().split('T')[0]).toBe('2026-12-21');
  });

  it('houdt een meerdaags concert bij elkaar', () => {
    const gebeurtenis = concertToCalendarEvent({ ...concert, end_date: '2026-12-22' });
    expect(gebeurtenis.startDate.toISOString().split('T')[0]).toBe('2026-12-20');
    expect(gebeurtenis.endDate.toISOString().split('T')[0]).toBe('2026-12-23');
  });

  it('neemt de omschrijving mee', () => {
    expect(concertToCalendarEvent({ ...concert, description: 'Met koor' }).description).toBe('Met koor');
  });
});

describe('de feedtoken', () => {
  const geheim = 'geheim-voor-de-test';

  it('is voor dezelfde gebruiker steeds hetzelfde', () => {
    expect(generateCalendarFeedToken('gebruiker-1', geheim)).toBe(generateCalendarFeedToken('gebruiker-1', geheim));
  });

  it('verschilt per gebruiker en per geheim', () => {
    expect(generateCalendarFeedToken('gebruiker-1', geheim)).not.toBe(generateCalendarFeedToken('gebruiker-2', geheim));
    expect(generateCalendarFeedToken('gebruiker-1', geheim)).not.toBe(
      generateCalendarFeedToken('gebruiker-1', 'ander geheim'),
    );
  });

  it('is lang genoeg om niet te raden', () => {
    expect(generateCalendarFeedToken('gebruiker-1', geheim)).toHaveLength(32);
  });

  it('herkent de eigen token', () => {
    const token = generateCalendarFeedToken('gebruiker-1', geheim);
    expect(verifyCalendarFeedToken('gebruiker-1', token, geheim)).toBe(true);
  });

  it('wijst de token van een ander af', () => {
    const token = generateCalendarFeedToken('gebruiker-2', geheim);
    expect(verifyCalendarFeedToken('gebruiker-1', token, geheim)).toBe(false);
  });

  it('geeft "nee" bij een token van de verkeerde lengte in plaats van te werpen', () => {
    // Hier ging het mis: timingSafeEqual werpt een RangeError bij ongelijke
    // lengtes, en dat werd een 500 in plaats van een 401.
    expect(() => verifyCalendarFeedToken('gebruiker-1', 'te-kort', geheim)).not.toThrow();
    expect(verifyCalendarFeedToken('gebruiker-1', 'te-kort', geheim)).toBe(false);
    expect(verifyCalendarFeedToken('gebruiker-1', '', geheim)).toBe(false);
    expect(verifyCalendarFeedToken('gebruiker-1', 'x'.repeat(500), geheim)).toBe(false);
  });

  it('vergelijkt twee tokens zonder te werpen, ongeacht de lengte', () => {
    expect(tokensGelijk('abc', 'abc')).toBe(true);
    expect(tokensGelijk('abc', 'abd')).toBe(false);
    expect(tokensGelijk('abc', 'veel langere waarde')).toBe(false);
    expect(tokensGelijk('', '')).toBe(true);
  });
});
