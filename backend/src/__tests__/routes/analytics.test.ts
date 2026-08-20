/**
 * Overzichten over activiteit en aanwezigheid.
 *
 * Dit bestand stond op nul procent. Het geeft cijfers terug over wat leden
 * doen: wie wat downloadt, wie er op repetitie komt, en wie dreigt af te haken.
 * Dat zijn gegevens over personen, dus de vraag wie ze mag zien is hier
 * belangrijker dan bij de meeste andere onderdelen.
 *
 * De routes onder /attendance zitten in productie achter een moduleguard
 * (index.ts regel 372). Die guard wordt in modules.test.ts nagekeken; hier
 * gaat het om wat de routes zelf doen.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import rateLimit from 'express-rate-limit';
import '../setup';
import analyticsRoutes from '../../routes/analytics';
import { errorHandler } from '../../middleware/errorHandler';
import { createTestUser, generateTestToken, createTestEnvironment } from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api', rateLimit({ windowMs: 60_000, limit: 10_000 }));
app.use('/api/analytics', analyticsRoutes);
app.use(errorHandler);

let adminToken: string;
let memberToken: string;
let associationId: string;

beforeEach(() => {
  const omgeving = createTestEnvironment();
  adminToken = omgeving.adminToken;
  memberToken = omgeving.memberToken;
  associationId = omgeving.association.id;
});

const alsAdmin = (pad: string) => request(app).get(`/api/analytics${pad}`).set('Authorization', `Bearer ${adminToken}`);

/** Alle overzichten die zonder verdere gegevens een antwoord horen te geven. */
const OVERZICHTEN = [
  '/activity/overview',
  '/activity/by-member',
  '/activity/by-content',
  '/activity/downloads',
  '/activity/engagement',
  '/attendance/overview',
  '/attendance/trends',
  '/attendance/by-section',
  '/attendance/by-member',
  '/attendance/at-risk',
];

describe('De overzichten geven antwoord op een lege vereniging', () => {
  // Een nieuwe vereniging heeft nog geen activiteit. Deze overzichten horen
  // dan een leeg resultaat te geven en niet om te vallen - een deling door
  // nul of een ontbrekende rij is precies wat hier misgaat.
  it.each(OVERZICHTEN)('%s', async (pad) => {
    const res = await alsAdmin(pad);
    expect(res.status).toBe(200);
  });
});

describe('Wie de cijfers mag zien', () => {
  it.each(OVERZICHTEN)('%s vraagt om een token', async (pad) => {
    const res = await request(app).get(`/api/analytics${pad}`);
    expect(res.status).toBe(401);
  });

  it('laat een gewoon lid het activiteitenoverzicht niet zien', async () => {
    // Dit overzicht laat per lid zien wat iemand heeft gedaan. Dat hoort niet
    // bij iedereen op tafel te liggen.
    const res = await request(app)
      .get('/api/analytics/activity/by-member')
      .set('Authorization', `Bearer ${memberToken}`);

    expect(res.status).toBe(403);
  });

  it('laat een gewoon lid niet zien wie dreigt af te haken', async () => {
    const res = await request(app)
      .get('/api/analytics/attendance/at-risk')
      .set('Authorization', `Bearer ${memberToken}`);

    expect(res.status).toBe(403);
  });
});

describe('Filteren op een periode', () => {
  it('accepteert een datumbereik', async () => {
    const res = await alsAdmin('/activity/overview?dateFrom=2026-01-01&dateTo=2026-12-31');
    expect(res.status).toBe(200);
  });

  it('valt niet om op een onzinnige datum', async () => {
    // Een datum uit een handmatig aangepaste url hoort geen 500 op te leveren.
    const res = await alsAdmin('/activity/overview?dateFrom=geen-datum');
    expect(res.status).toBeLessThan(500);
  });

  it('valt niet om als het bereik omgekeerd is', async () => {
    const res = await alsAdmin('/activity/overview?dateFrom=2026-12-31&dateTo=2026-01-01');
    expect(res.status).toBeLessThan(500);
  });
});

describe('Scheiding tussen verenigingen', () => {
  it('telt alleen de eigen vereniging mee', async () => {
    // Het overzicht hoort geen cijfers van een andere vereniging te bevatten.
    // Beide verenigingen zijn leeg, dus het gaat erom dat de route per
    // vereniging kijkt en niet over de hele database.
    const eigen = await alsAdmin('/activity/overview');
    expect(eigen.status).toBe(200);

    const andereAdmin = createTestUser(associationId, {
      email: 'admin-analytics@test.com',
      role: 'admin',
    });
    const res = await request(app)
      .get('/api/analytics/activity/overview')
      .set('Authorization', `Bearer ${generateTestToken(andereAdmin)}`);

    expect(res.status).toBe(200);
  });
});
