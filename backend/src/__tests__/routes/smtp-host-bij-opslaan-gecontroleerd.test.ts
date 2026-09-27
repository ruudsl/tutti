/**
 * Het opslaan van de SMTP-instellingen van een vereniging.
 *
 * Een host die naar een intern adres wijst, wordt bij het versturen geweigerd
 * (utils/smtpVerbinding.ts). Zonder controle bij het opslaan kon een beheerder
 * zo'n host toch opslaan, en ging daarna elke mail van de vereniging stil
 * verloren. Nu zegt het opslaan het meteen, en blijft de oude instelling staan.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import '../setup';
import db from '../../database/connection';
import settingsRoutes from '../../routes/settings';
import { errorHandler } from '../../middleware/errorHandler';
import { stelOpzoekerInVoorTests } from '../../utils/uitgaandAdres';
import { createTestEnvironment, TestAssociation } from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api/settings', settingsRoutes);
app.use(errorHandler);

let vereniging: TestAssociation;
let beheerder: string;

beforeEach(() => {
  const omgeving = createTestEnvironment();
  vereniging = omgeving.association;
  beheerder = omgeving.adminToken;
});

afterEach(() => {
  stelOpzoekerInVoorTests(async () => [{ address: '203.0.113.10' }]);
});

const bewaar = (host: string) =>
  request(app)
    .put('/api/settings/smtp')
    .set('Authorization', `Bearer ${beheerder}`)
    .send({ host, port: 587, enabled: true });

const opgeslagenHost = () =>
  (db.prepare('SELECT smtp_host FROM associations WHERE id = ?').get(vereniging.id) as { smtp_host: string | null })
    .smtp_host;

describe('SMTP-instellingen opslaan', () => {
  it('slaat een host op die naar een openbaar adres wijst', async () => {
    const res = await bewaar('smtp.voorbeeld.nl');

    expect(res.status).toBe(200);
    expect(opgeslagenHost()).toBe('smtp.voorbeeld.nl');
  });

  it('weigert een intern IP-adres en laat de oude instelling staan', async () => {
    await bewaar('smtp.voorbeeld.nl');

    const res = await bewaar('127.0.0.1');

    expect(res.status).toBe(400);
    expect(opgeslagenHost()).toBe('smtp.voorbeeld.nl');
  });

  it('weigert een naam die naar een intern adres wijst', async () => {
    stelOpzoekerInVoorTests(async () => [{ address: '10.0.0.5' }]);

    const res = await bewaar('relay.intern');

    expect(res.status).toBe(400);
    expect(opgeslagenHost()).toBeNull();
  });
});
