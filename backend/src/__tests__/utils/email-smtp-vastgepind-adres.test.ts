/**
 * Met welk adres verbindt nodemailer voor de SMTP van een vereniging?
 *
 * De host komt van een beheerder van een vereniging. Kreeg nodemailer de naam,
 * dan zocht hij die bij het versturen zelf nog eens op - en een eigen
 * nameserver kan dan een ander antwoord geven dan bij de controle, zoals
 * 127.0.0.1 of een adres in het Docker-netwerk (DNS-rebinding).
 *
 * Wat hoort: de naam wordt opgezocht en gecontroleerd, nodemailer krijgt het
 * gecontroleerde IP-adres als host en de naam als tls.servername, zodat het
 * certificaat nog steeds op de naam wordt gecontroleerd. Een intern adres
 * wordt geweigerd. De SMTP van de installatie (SMTP_*) wordt vertrouwd.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '../setup';
import db from '../../database/connection';
import { stelOpzoekerInVoorTests } from '../../utils/uitgaandAdres';
import { createTestAssociation, TestAssociation } from '../testUtils';

const { createTransport, sendMail } = vi.hoisted(() => {
  const sendMail = vi.fn().mockResolvedValue({ messageId: 'test-bericht' });
  const createTransport = vi.fn(() => ({ sendMail }));
  return { createTransport, sendMail };
});

vi.mock('nodemailer', () => ({ default: { createTransport } }));

// De testopzet vervangt utils/email door een nepversie; hier is het echte
// bestand juist het onderwerp.
vi.unmock('../../utils/email');
const { sendEmail } = await vi.importActual<typeof import('../../utils/email')>('../../utils/email');

type TransportOpties = { host?: string; tls?: { servername?: string } };
const transportOpties = (): TransportOpties => (createTransport.mock.calls[0] as unknown[])[0] as TransportOpties;

describe('SMTP van een vereniging: vastgepind adres', () => {
  let vereniging: TestAssociation;
  const opgezocht: string[] = [];

  const zetHost = (host: string) => {
    db.prepare(
      `UPDATE associations SET smtp_host = ?, smtp_port = 587, smtp_secure = 0, smtp_user = NULL, smtp_enabled = 1
       WHERE id = ?`,
    ).run(host, vereniging.id);
  };

  const verstuur = () =>
    sendEmail({ to: 'lid@example.org', subject: 'Hallo', text: 'Tekst', associationId: vereniging.id });

  beforeEach(() => {
    createTransport.mockClear();
    sendMail.mockClear();
    opgezocht.length = 0;
    vi.stubEnv('SMTP_HOST', '');
    vereniging = createTestAssociation({ name: 'Harmonie Vastgepind' });
    stelOpzoekerInVoorTests(async (naam) => {
      opgezocht.push(naam);
      return [{ address: '198.51.100.25' }];
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    // Terug naar de opzoeker uit setup.ts: elke naam wijst naar een openbaar adres.
    stelOpzoekerInVoorTests(async () => [{ address: '203.0.113.10' }]);
  });

  it('geeft nodemailer het gecontroleerde IP-adres en de naam als servername', async () => {
    zetHost('smtp.harmonie.example');

    expect(await verstuur()).toBe(true);

    expect(opgezocht).toEqual(['smtp.harmonie.example']);
    expect(transportOpties().host).toBe('198.51.100.25');
    expect(transportOpties().tls).toEqual({ servername: 'smtp.harmonie.example' });
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it('zet geen servername als de host zelf een IP-adres is', async () => {
    zetHost('198.51.100.40');

    expect(await verstuur()).toBe(true);

    expect(transportOpties().host).toBe('198.51.100.40');
    expect(transportOpties().tls).toBeUndefined();
  });

  it('verstuurt niets als de naam naar een intern adres wijst', async () => {
    stelOpzoekerInVoorTests(async () => [{ address: '10.0.0.5' }]);
    zetHost('mail.intern.example');

    expect(await verstuur()).toBe(false);

    expect(createTransport).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('verstuurt niets als de host zelf een intern adres is', async () => {
    zetHost('127.0.0.1');

    expect(await verstuur()).toBe(false);

    expect(createTransport).not.toHaveBeenCalled();
  });

  it('valt bij een geweigerde host niet terug op de SMTP van de installatie', async () => {
    vi.stubEnv('SMTP_HOST', 'smtp.installatie.example');
    stelOpzoekerInVoorTests(async () => [{ address: '172.17.0.1' }]);
    zetHost('mail.intern.example');

    expect(await verstuur()).toBe(false);

    expect(createTransport).not.toHaveBeenCalled();
  });

  it('zoekt de SMTP van de installatie niet op: die wordt vertrouwd', async () => {
    vi.stubEnv('SMTP_HOST', 'smtp.installatie.example');

    await sendEmail({ to: 'iemand@example.org', subject: 'Hallo', text: 'Tekst' });

    expect(opgezocht).toEqual([]);
    expect(transportOpties().host).toBe('smtp.installatie.example');
  });
});
