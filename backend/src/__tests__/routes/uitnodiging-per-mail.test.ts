/**
 * Een uitnodiging komt aan.
 *
 * POST /multi-association/invitations maakte een uitnodiging in de database
 * en gaf alleen `/invite/<token>` terug: geen mail, en een adres zonder
 * domein dat de uitnodiger nergens mee kon. De uitgenodigde hoorde er dus
 * nooit van. Nu gaat er een mail met de volledige link uit, en staat diezelfde
 * link in het antwoord, zodat de uitnodiger hem ook zelf kan doorgeven.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import '../setup';
import db from '../../database/connection';
import multiAssociationRoutes from '../../routes/multi-association';
import { errorHandler } from '../../middleware/errorHandler';
import { createTestEnvironment } from '../testUtils';
import { sendEmail } from '../../utils/email';

vi.mock('../../utils/email', () => ({ sendEmail: vi.fn(async () => true) }));

const app = express();
app.use(express.json());
app.use('/api/multi-association', multiAssociationRoutes);
app.use(errorHandler);

const verstuur = vi.mocked(sendEmail);
const oudFrontendUrl = process.env.FRONTEND_URL;

describe('uitnodiging per mail', () => {
  let omgeving: ReturnType<typeof createTestEnvironment>;

  beforeEach(() => {
    verstuur.mockClear();
    verstuur.mockImplementation(async () => true);
    process.env.FRONTEND_URL = 'https://tutti.voorbeeld.nl/';
    omgeving = createTestEnvironment();
  });

  afterEach(() => {
    process.env.FRONTEND_URL = oudFrontendUrl;
  });

  const nodigUit = (email: string) =>
    request(app)
      .post('/api/multi-association/invitations')
      .set('Authorization', `Bearer ${omgeving.adminToken}`)
      .send({ email, role: 'member' });

  it('stuurt de uitgenodigde een mail met de volledige link', async () => {
    const antwoord = await nodigUit('nieuw@voorbeeld.nl');

    expect(antwoord.status).toBe(201);
    const { token } = db
      .prepare('SELECT token FROM association_invitations WHERE id = ? AND association_id = ?')
      .get(antwoord.body.id, omgeving.association.id) as { token: string };
    const link = `https://tutti.voorbeeld.nl/invite/${token}`;

    expect(antwoord.body.inviteUrl).toBe(link);
    expect(verstuur).toHaveBeenCalledTimes(1);
    const mail = verstuur.mock.calls[0][0];
    expect(mail.to).toBe('nieuw@voorbeeld.nl');
    expect(mail.associationId).toBe(omgeving.association.id);
    expect(mail.subject).toContain(omgeving.association.name);
    expect(mail.text).toContain(link);
    expect(mail.html).toContain(link);
  });

  it('maakt de uitnodiging ook als de mail niet verstuurd kan worden', async () => {
    verstuur.mockRejectedValueOnce(new Error('SMTP onbereikbaar'));

    const antwoord = await nodigUit('nieuw@voorbeeld.nl');

    expect(antwoord.status).toBe(201);
    expect(antwoord.body.inviteUrl).toMatch(/^https:\/\/tutti\.voorbeeld\.nl\/invite\/[0-9a-f]{64}$/);
    expect(
      db
        .prepare('SELECT COUNT(*) AS n FROM association_invitations WHERE email = ? AND association_id = ?')
        .get('nieuw@voorbeeld.nl', omgeving.association.id),
    ).toEqual({ n: 1 });
  });

  it('stuurt geen mail als de uitnodiging geweigerd wordt', async () => {
    const antwoord = await request(app)
      .post('/api/multi-association/invitations')
      .set('Authorization', `Bearer ${omgeving.memberToken}`)
      .send({ email: 'nieuw@voorbeeld.nl', role: 'member' });

    expect(antwoord.status).toBe(403);
    expect(verstuur).not.toHaveBeenCalled();
  });
});
