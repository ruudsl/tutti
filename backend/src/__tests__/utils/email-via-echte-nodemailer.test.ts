/**
 * Een bericht gaat echt via nodemailer de deur uit (utils/email.ts).
 *
 * De andere mailtests vervangen nodemailer door een nepversie; die zeggen
 * niets over de bibliotheek zelf. Bij de overstap van nodemailer 9 naar 10
 * (eigen types, een nieuwe opbouw van het pakket) moet vaststaan dat een
 * bericht met bijlage nog steeds over SMTP bij een server aankomt.
 *
 * De server is een minimale SMTP-server in dit proces, op 127.0.0.1: geen
 * netwerk naar buiten. Hij gaat via de installatie-SMTP (`SMTP_*`), want een
 * SMTP-host van een vereniging op een eigen adres wordt terecht geweigerd.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import net from 'net';
import type { AddressInfo } from 'net';
import '../setup';

// De testopzet vervangt utils/email door een nepversie; hier is het echte
// bestand juist het onderwerp.
vi.unmock('../../utils/email');
const { sendEmail } = await vi.importActual<typeof import('../../utils/email')>('../../utils/email');

interface Ontvangen {
  afzender: string;
  ontvangers: string[];
  bericht: string;
}

const ontvangen: Ontvangen[] = [];
let server: net.Server;
let poort: number;

/** Net genoeg SMTP om een bericht aan te nemen: EHLO, MAIL, RCPT, DATA, QUIT. */
function smtpServer(): net.Server {
  return net.createServer((socket) => {
    let buffer = '';
    let inData = false;
    let huidig: Ontvangen = { afzender: '', ontvangers: [], bericht: '' };
    const antwoord = (regel: string) => socket.write(`${regel}\r\n`);

    antwoord('220 test.lokaal ESMTP');
    socket.on('data', (stuk) => {
      buffer += stuk.toString('utf8');
      for (;;) {
        if (inData) {
          const einde = buffer.indexOf('\r\n.\r\n');
          if (einde === -1) return;
          huidig.bericht = buffer.slice(0, einde);
          buffer = buffer.slice(einde + 5);
          inData = false;
          ontvangen.push(huidig);
          huidig = { afzender: '', ontvangers: [], bericht: '' };
          antwoord('250 2.0.0 Aangenomen');
          continue;
        }
        const regeleinde = buffer.indexOf('\r\n');
        if (regeleinde === -1) return;
        const regel = buffer.slice(0, regeleinde);
        buffer = buffer.slice(regeleinde + 2);
        const opdracht = regel.slice(0, 4).toUpperCase();
        if (opdracht === 'EHLO' || opdracht === 'HELO') antwoord('250 test.lokaal');
        else if (opdracht === 'MAIL') {
          huidig.afzender = regel.slice(10).replace(/[<>]/g, '').trim();
          antwoord('250 2.1.0 Ok');
        } else if (opdracht === 'RCPT') {
          huidig.ontvangers.push(regel.slice(8).replace(/[<>]/g, '').trim());
          antwoord('250 2.1.5 Ok');
        } else if (opdracht === 'DATA') {
          inData = true;
          antwoord('354 Ga je gang');
        } else if (opdracht === 'QUIT') {
          antwoord('221 Tot ziens');
          socket.end();
        } else antwoord('250 Ok');
      }
    });
  });
}

const oudeOmgeving = { ...process.env };

beforeAll(async () => {
  server = smtpServer();
  await new Promise<void>((klaar) => server.listen(0, '127.0.0.1', klaar));
  poort = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((klaar) => server.close(() => klaar()));
});

afterEach(() => {
  process.env = { ...oudeOmgeving };
  ontvangen.length = 0;
});

describe('versturen via de echte nodemailer', () => {
  it('levert een bericht met bijlage af bij de SMTP-server', async () => {
    process.env.SMTP_HOST = '127.0.0.1';
    process.env.SMTP_PORT = String(poort);
    process.env.SMTP_SECURE = 'false';
    process.env.SMTP_FROM = '"Tutti" <noreply@tutti.test>';
    delete process.env.SMTP_USER;

    const gelukt = await sendEmail({
      to: 'lid@voorbeeld.nl',
      subject: 'Repetitie verplaatst',
      text: 'De repetitie is donderdag.',
      html: '<p>De repetitie is <strong>donderdag</strong>.</p>',
      attachments: [{ filename: 'rooster.txt', content: 'donderdag 20:00', contentType: 'text/plain' }],
    });

    expect(gelukt).toBe(true);
    expect(ontvangen).toHaveLength(1);
    const [bericht] = ontvangen;
    expect(bericht.afzender).toBe('noreply@tutti.test');
    expect(bericht.ontvangers).toEqual(['lid@voorbeeld.nl']);
    expect(bericht.bericht).toMatch(/^Subject: Repetitie verplaatst$/m);
    expect(bericht.bericht).toMatch(/^To: lid@voorbeeld\.nl$/m);
    expect(bericht.bericht).toContain('filename=rooster.txt');
    expect(bericht.bericht).toContain('multipart/mixed');
  });

  it('meldt het als de server niet bereikbaar is, in plaats van te doen alsof', async () => {
    const dicht = net.createServer();
    await new Promise<void>((klaar) => dicht.listen(0, '127.0.0.1', klaar));
    const dichtePoort = (dicht.address() as AddressInfo).port;
    await new Promise<void>((klaar) => dicht.close(() => klaar()));

    process.env.SMTP_HOST = '127.0.0.1';
    process.env.SMTP_PORT = String(dichtePoort);
    process.env.SMTP_SECURE = 'false';

    const gelukt = await sendEmail({ to: 'lid@voorbeeld.nl', subject: 'Test', text: 'Test' });

    expect(gelukt).toBe(false);
    expect(ontvangen).toHaveLength(0);
  });
});
