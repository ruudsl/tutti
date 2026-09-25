/**
 * Namen en titels in een e-mail komen van beheerders en leden. In de
 * html-versie moeten ze tekst blijven en geen opmaak worden; in de platte
 * tekst en de onderwerpregel blijven ze leesbaar zoals ze zijn ingevoerd.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const verstuurd = vi.hoisted(() => [] as { subject: string; text: string; html: string }[]);
vi.mock('../../utils/email', () => ({
  sendEmail: vi.fn(async (bericht: { subject: string; text: string; html: string }) => {
    verstuurd.push(bericht);
    return true;
  }),
}));

import {
  getWelcomeEmail,
  getRehearsalReminderEmail,
  getConcertReminderEmail,
  getTaskAssignmentEmail,
  getPollNotificationEmail,
  EmailLanguage,
} from '../../templates/emails';
import { sendTicketConfirmationEmail } from '../../services/ticketing';

const TALEN: EmailLanguage[] = ['nl', 'en', 'de'];
const NAAM = 'Jan <a href="https://voorbeeld.test">Klik</a> & Co';
const ONTSNAPT = 'Jan &lt;a href=&quot;https://voorbeeld.test&quot;&gt;Klik&lt;/a&gt; &amp; Co';

function verwachtOntsnapt(inhoud: { subject: string; text: string; html: string }) {
  expect(inhoud.html).not.toContain('<a href="https://voorbeeld.test">');
  expect(inhoud.html).toContain(ONTSNAPT);
  // De platte tekst blijft leesbaar: geen &amp; of &lt; erin.
  expect(inhoud.text).toContain(NAAM);
}

describe('html-versie van e-mails ontsnapt ingevoerde namen', () => {
  beforeEach(() => {
    verstuurd.length = 0;
  });

  it.each(TALEN)('welkomstmail met een gevaarlijke naam van lid en vereniging (%s)', (taal) => {
    const inhoud = getWelcomeEmail(
      { userName: NAAM, associationName: NAAM, loginUrl: 'https://tutti.test/login?a=1&b=2' },
      taal,
    );
    verwachtOntsnapt(inhoud);
    expect(inhoud.subject).toContain(NAAM);
    expect(inhoud.html).toContain('href="https://tutti.test/login?a=1&amp;b=2"');
    expect(inhoud.text).toContain('https://tutti.test/login?a=1&b=2');
  });

  it.each(TALEN)('taakmail met een gevaarlijke naam van wie toewees (%s)', (taal) => {
    const inhoud = getTaskAssignmentEmail(
      { userName: 'Piet', taskTitle: 'Stoelen zetten', taskUrl: 'https://tutti.test/t', assignedBy: NAAM },
      taal,
    );
    verwachtOntsnapt(inhoud);
  });

  it.each(TALEN)('concertherinnering met een gevaarlijke concertnaam (%s)', (taal) => {
    verwachtOntsnapt(getConcertReminderEmail({ userName: 'Piet', concertName: NAAM, concertDate: '2026-12-01' }, taal));
  });

  it.each(TALEN)('peilingmail met een gevaarlijke titel (%s)', (taal) => {
    verwachtOntsnapt(
      getPollNotificationEmail({ userName: 'Piet', pollTitle: NAAM, pollUrl: 'https://tutti.test/p' }, taal),
    );
  });

  it.each(TALEN)('repetitieherinnering ontsnapt ook de stukken op het programma (%s)', (taal) => {
    const inhoud = getRehearsalReminderEmail(
      { userName: 'Piet', rehearsalDate: '2026-12-01', startTime: '20:00', program: [NAAM] },
      taal,
    );
    verwachtOntsnapt(inhoud);
  });

  it.each(TALEN)('ticketbevestiging met een gevaarlijke kopersnaam en concertnaam (%s)', async (taal) => {
    await sendTicketConfirmationEmail(
      {
        buyerName: NAAM,
        buyerEmail: 'koper@tutti.test',
        concertName: NAAM,
        concertDate: '2026-12-01',
        concertLocation: 'Zaal',
        ticketTypeName: 'Volwassene',
        ticketCode: 'ABCD-EFGH-JKLM',
        qrCodeDataUrl: 'data:image/png;base64,AAAA',
        orderTotal: 12.5,
        quantity: 1,
      },
      null,
      taal,
    );
    expect(verstuurd).toHaveLength(1);
    expect(verstuurd[0].html).not.toContain('<a href="https://voorbeeld.test">');
    expect(verstuurd[0].html).toContain(ONTSNAPT);
    expect(verstuurd[0].subject).toContain(NAAM);
    expect(verstuurd[0].html).toContain('src="data:image/png;base64,AAAA"');
  });
});
