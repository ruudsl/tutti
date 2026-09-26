/**
 * Via welke SMTP-server gaat de mail van een vereniging?
 *
 * Een vereniging zonder eigen SMTP kreeg de SMTP-server én de afzender van
 * "de eerste vereniging met SMTP aan". Een wachtwoordherstellink voor een lid
 * van vereniging B ging dan via het mailaccount van vereniging A - die hem in
 * haar verzonden items terugziet en er het account van dat lid mee overneemt.
 *
 * Wat hoort: de eigen SMTP, anders die van de installatie (SMTP_*), anders
 * niets versturen. Nooit die van een andere vereniging.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '../setup';
import db from '../../database/connection';
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
const { sendEmail, sendPasswordResetEmail } =
  await vi.importActual<typeof import('../../utils/email')>('../../utils/email');

const zetSmtpAan = (verenigingId: string, host: string, afzender: string) => {
  db.prepare(
    `UPDATE associations
     SET smtp_host = ?, smtp_port = 587, smtp_secure = 0, smtp_user = ?, smtp_pass = 'wachtwoord-van-a',
         smtp_from = ?, smtp_enabled = 1
     WHERE id = ?`,
  ).run(host, `mail@${host}`, afzender, verenigingId);
};

// Voor de SMTP van een vereniging krijgt nodemailer het gecontroleerde
// IP-adres als host en de naam als tls.servername; zie
// email-smtp-vastgepind-adres.test.ts. Welke server het is, staat dan in de
// servername.
const gebruikteHosts = () =>
  createTransport.mock.calls.map((aanroep: unknown[]) => {
    const opties = aanroep[0] as { host?: string; tls?: { servername?: string } };
    return opties?.tls?.servername ?? opties?.host;
  });
const gebruikteAfzenders = () =>
  sendMail.mock.calls.map((aanroep: unknown[]) => (aanroep[0] as { from?: string })?.from);

describe('SMTP per vereniging', () => {
  let verenigingA: TestAssociation;
  let verenigingB: TestAssociation;

  beforeEach(() => {
    createTransport.mockClear();
    sendMail.mockClear();
    vi.stubEnv('SMTP_HOST', '');
    vi.stubEnv('SMTP_FROM', '');

    verenigingA = createTestAssociation({ name: 'Harmonie A' });
    verenigingB = createTestAssociation({ name: 'Fanfare B' });
    zetSmtpAan(verenigingA.id, 'smtp.harmonie-a.example', '"Harmonie A" <secretaris@harmonie-a.example>');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('verstuurt de mail van een vereniging via haar eigen SMTP en afzender', async () => {
    await sendEmail({ to: 'lid@a.example', subject: 'Hallo', text: 'Tekst', associationId: verenigingA.id });

    expect(gebruikteHosts()).toEqual(['smtp.harmonie-a.example']);
    expect(gebruikteAfzenders()).toEqual(['"Harmonie A" <secretaris@harmonie-a.example>']);
  });

  it('gebruikt voor vereniging B nooit de SMTP van vereniging A', async () => {
    await sendPasswordResetEmail('lid@b.example', 'hersteltoken', 'Lid B', verenigingB.id);

    expect(gebruikteHosts()).not.toContain('smtp.harmonie-a.example');
    expect(gebruikteAfzenders()).not.toContain('"Harmonie A" <secretaris@harmonie-a.example>');
  });

  it('verstuurt niets als vereniging B geen SMTP heeft en de installatie ook niet', async () => {
    await sendEmail({ to: 'lid@b.example', subject: 'Hallo', text: 'Tekst', associationId: verenigingB.id });

    expect(createTransport).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('valt voor vereniging B terug op de SMTP van de installatie', async () => {
    vi.stubEnv('SMTP_HOST', 'smtp.installatie.example');
    vi.stubEnv('SMTP_FROM', '"Tutti" <noreply@installatie.example>');

    await sendEmail({ to: 'lid@b.example', subject: 'Hallo', text: 'Tekst', associationId: verenigingB.id });

    expect(gebruikteHosts()).toEqual(['smtp.installatie.example']);
    expect(gebruikteAfzenders()).toEqual(['"Tutti" <noreply@installatie.example>']);
  });

  it('gebruikt zonder vereniging de SMTP van de installatie, niet die van een vereniging', async () => {
    // Bijvoorbeeld het herstel van een superbeheerder zonder vereniging.
    vi.stubEnv('SMTP_HOST', 'smtp.installatie.example');

    await sendPasswordResetEmail('beheer@installatie.example', 'hersteltoken', 'Superbeheerder', null);

    expect(gebruikteHosts()).toEqual(['smtp.installatie.example']);
  });

  it('verstuurt zonder vereniging en zonder installatie-SMTP niets', async () => {
    await sendEmail({ to: 'iemand@example.org', subject: 'Hallo', text: 'Tekst' });

    expect(createTransport).not.toHaveBeenCalled();
  });

  it('gebruikt de SMTP van de installatie als vereniging B haar eigen SMTP heeft uitgezet', async () => {
    zetSmtpAan(verenigingB.id, 'smtp.fanfare-b.example', '"Fanfare B" <info@fanfare-b.example>');
    db.prepare('UPDATE associations SET smtp_enabled = 0 WHERE id = ?').run(verenigingB.id);
    vi.stubEnv('SMTP_HOST', 'smtp.installatie.example');

    await sendEmail({ to: 'lid@b.example', subject: 'Hallo', text: 'Tekst', associationId: verenigingB.id });

    expect(gebruikteHosts()).toEqual(['smtp.installatie.example']);
  });
});
