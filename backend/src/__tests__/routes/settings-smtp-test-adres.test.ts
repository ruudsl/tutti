/**
 * De knop "SMTP testen" in de instellingen.
 *
 * De host en poort komen van de beheerder van een vereniging. Zonder controle
 * liet de testknop de server verbinden met `127.0.0.1:6379` of een adres in
 * het interne netwerk, en de ruwe foutmelding (`connect ECONNREFUSED
 * 127.0.0.1:6379`) ging terug naar de client: een poortscanner vanaf de
 * server.
 *
 * Wat hoort: de host gaat vooraf door controleerUitgaandAdres, en een
 * mislukte test geeft een algemene melding; de details staan in het logboek.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import '../setup';
import db from '../../database/connection';
import settingsRoutes from '../../routes/settings';
import { errorHandler } from '../../middleware/errorHandler';
import { stelOpzoekerInVoorTests } from '../../utils/uitgaandAdres';
import { createTestEnvironment, TestAssociation } from '../testUtils';

const { createTransport, verify, sendMail } = vi.hoisted(() => {
  const verify = vi.fn();
  const sendMail = vi.fn();
  const createTransport = vi.fn(() => ({ verify, sendMail }));
  return { createTransport, verify, sendMail };
});

vi.mock('nodemailer', () => ({ default: { createTransport } }));

const app = express();
app.use(express.json());
app.use('/api/settings', settingsRoutes);
app.use(errorHandler);

describe('SMTP testen', () => {
  let vereniging: TestAssociation;
  let beheerderToken: string;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    beheerderToken = omgeving.adminToken;

    createTransport.mockClear();
    verify.mockReset().mockResolvedValue(true);
    sendMail.mockReset().mockResolvedValue({ messageId: 'test' });
  });

  afterEach(() => {
    // Terug naar de opzoeker uit setup.ts: elke naam wijst naar een openbaar adres.
    stelOpzoekerInVoorTests(async () => [{ address: '203.0.113.10' }]);
  });

  const zetHost = (host: string, poort = 587) => {
    db.prepare('UPDATE associations SET smtp_host = ?, smtp_port = ?, smtp_enabled = 1 WHERE id = ?').run(
      host,
      poort,
      vereniging.id,
    );
  };

  const testKnop = () =>
    request(app).post('/api/settings/smtp/test').set('Authorization', `Bearer ${beheerderToken}`).send({});

  it.each([
    ['de machine zelf', '127.0.0.1', 6379],
    ['localhost als IPv6', '::1', 25],
    ['het metadata-adres van de hosting', '169.254.169.254', 80],
    ['een privé-adres', '10.0.0.5', 25],
  ])('verbindt niet met %s', async (_omschrijving, host, poort) => {
    zetHost(host, poort);

    const antwoord = await testKnop();

    expect(antwoord.status).toBe(400);
    expect(createTransport).not.toHaveBeenCalled();
  });

  it('verbindt niet met een naam die naar een intern adres wijst', async () => {
    stelOpzoekerInVoorTests(async () => [{ address: '192.168.1.20' }]);
    zetHost('mail.intern.example');

    const antwoord = await testKnop();

    expect(antwoord.status).toBe(400);
    expect(createTransport).not.toHaveBeenCalled();
  });

  it('weigert een host die als adres iets anders betekent dan als hostnaam', async () => {
    zetHost('smtp.example.org@127.0.0.1');

    const antwoord = await testKnop();

    expect(antwoord.status).toBe(400);
    expect(createTransport).not.toHaveBeenCalled();
  });

  it('geeft de ruwe foutmelding van de verbinding niet terug', async () => {
    zetHost('smtp.example.org');
    verify.mockRejectedValue(Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:6379'), { code: 'ESOCKET' }));

    const antwoord = await testKnop();

    expect(antwoord.status).toBe(400);
    expect(antwoord.body.error).toMatch(/SMTP-test mislukt/);
    expect(antwoord.body.error).not.toMatch(/ECONNREFUSED|127\.0\.0\.1|6379/);
  });

  it('meldt mislukt inloggen zonder de tekst van de server door te geven', async () => {
    zetHost('smtp.example.org');
    verify.mockRejectedValue(
      Object.assign(new Error('Invalid login: 535 5.7.8 Error: authentication failed: mx-intern-03'), {
        code: 'EAUTH',
      }),
    );

    const antwoord = await testKnop();

    expect(antwoord.status).toBe(400);
    expect(antwoord.body.error).toMatch(/inloggen/);
    expect(antwoord.body.error).not.toMatch(/535|mx-intern/);
  });

  it('verstuurt de testmail via een openbare host', async () => {
    zetHost('smtp.example.org', 465);

    const antwoord = await testKnop();

    expect(antwoord.status).toBe(200);
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: '203.0.113.10', tls: { servername: 'smtp.example.org' }, port: 465 }),
    );
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it('verbindt met het gecontroleerde adres, niet met de naam', async () => {
    // Kreeg nodemailer de naam, dan zocht hij die zelf opnieuw op en kon een
    // eigen nameserver hem dan naar 127.0.0.1 sturen.
    stelOpzoekerInVoorTests(async () => [{ address: '198.51.100.7' }]);
    zetHost('Smtp.Example.org');

    const antwoord = await testKnop();

    expect(antwoord.status).toBe(200);
    const opties = (createTransport.mock.calls[0] as unknown[])[0] as { host: string; tls?: { servername?: string } };
    expect(opties.host).toBe('198.51.100.7');
    expect(opties.tls?.servername).toBe('smtp.example.org');
  });
});
