/**
 * Massamail naar de leden.
 *
 * Dit bestand stond op nul procent. Het gaat over berichten die in een keer
 * naar alle leden gaan, dus de duurste fout is er een die je niet kunt
 * terugnemen: dezelfde campagne twee keer versturen, of hem naar de leden van
 * een andere vereniging sturen.
 *
 * Verzenden is hier veilig te testen: zonder SMTP-instellingen logt de mailer
 * alleen en meldt hij dat het gelukt is. Er gaat dus niets de deur uit.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import emailCampaignsRoutes from '../../routes/email-campaigns';
import { errorHandler } from '../../middleware/errorHandler';
import { createTestAssociation, createTestUser, generateTestToken, createTestEnvironment } from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api', rateLimit({ windowMs: 60_000, limit: 10_000 }));
app.use('/api/email-campaigns', emailCampaignsRoutes);
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

const alsAdmin = (methode: 'get' | 'post' | 'put' | 'delete', pad: string) =>
  request(app)[methode](`/api/email-campaigns${pad}`).set('Authorization', `Bearer ${adminToken}`);

async function maakCampagne(overschrijf: Record<string, unknown> = {}) {
  const res = await alsAdmin('post', '/').send({
    name: 'Nieuwsbrief maart',
    subject: 'Nieuws van de vereniging',
    bodyHtml: '<p>Beste leden,</p>',
    targetType: 'all',
    ...overschrijf,
  });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

function statusVan(id: string): string {
  const rij = db.prepare('SELECT status FROM email_campaigns WHERE id = ?').get(id) as { status: string };
  return rij.status;
}

describe('Campagnes', () => {
  it('maakt een campagne aan als concept', async () => {
    const id = await maakCampagne();
    expect(statusVan(id)).toBe('draft');
  });

  it('toont de campagne terug', async () => {
    const id = await maakCampagne();

    const res = await alsAdmin('get', `/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Nieuwsbrief maart');
  });

  it('weigert een campagne zonder onderwerp', async () => {
    const res = await alsAdmin('post', '/').send({
      name: 'Zonder onderwerp',
      subject: '',
      bodyHtml: '<p>Iets</p>',
      targetType: 'all',
    });
    expect(res.status).toBe(400);
  });

  it('weigert een campagne zonder inhoud', async () => {
    const res = await alsAdmin('post', '/').send({
      name: 'Leeg',
      subject: 'Onderwerp',
      bodyHtml: '',
      targetType: 'all',
    });
    expect(res.status).toBe(400);
  });

  it('weigert een onbekende doelgroep', async () => {
    const res = await alsAdmin('post', '/').send({
      name: 'Fout doel',
      subject: 'Onderwerp',
      bodyHtml: '<p>Iets</p>',
      targetType: 'iedereen-op-aarde',
    });
    expect(res.status).toBe(400);
  });

  it('meldt netjes dat een onbekende campagne niet bestaat', async () => {
    const res = await alsAdmin('get', `/${uuidv4()}`);
    expect(res.status).toBe(404);
  });
});

describe('Verzenden', () => {
  it('verstuurt een concept', async () => {
    const id = await maakCampagne();

    const res = await alsAdmin('post', `/${id}/send`);
    expect(res.status).toBe(200);
    expect(statusVan(id)).not.toBe('draft');
  });

  it('verstuurt dezelfde campagne geen tweede keer', async () => {
    // Dit is de duurste fout bij massamail: een bericht dat al bij alle leden
    // ligt nog een keer versturen. Dat kun je niet terugnemen.
    const id = await maakCampagne();
    await alsAdmin('post', `/${id}/send`);

    const res = await alsAdmin('post', `/${id}/send`);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('niet worden verzonden');
  });

  it('meldt netjes dat een onbekende campagne niet bestaat', async () => {
    const res = await alsAdmin('post', `/${uuidv4()}/send`);
    expect(res.status).toBe(404);
  });

  it('toont vooraf wie het bericht krijgt', async () => {
    // Zonder deze lijst verstuur je blind naar een doelgroep die je niet ziet.
    const id = await maakCampagne();

    const res = await alsAdmin('get', `/${id}/preview-recipients`);
    expect(res.status).toBe(200);
  });
});

describe('Sjablonen', () => {
  it('maakt een sjabloon aan en toont het', async () => {
    const res = await alsAdmin('post', '/templates').send({
      name: 'Standaard nieuwsbrief',
      subject: 'Nieuws',
      bodyHtml: '<p>Beste {{voornaam}},</p>',
    });
    expect(res.status).toBe(201);

    const lijst = await alsAdmin('get', '/templates');
    expect(lijst.status).toBe(200);
    expect(lijst.body.map((s: { name: string }) => s.name)).toContain('Standaard nieuwsbrief');
  });

  it('weigert een sjabloon zonder inhoud', async () => {
    const res = await alsAdmin('post', '/templates').send({
      name: 'Leeg',
      subject: 'Onderwerp',
      bodyHtml: '',
    });
    expect(res.status).toBe(400);
  });
});

describe('Wie mag mailen', () => {
  it('vraagt om een token', async () => {
    const res = await request(app).get('/api/email-campaigns/');
    expect(res.status).toBe(401);
  });

  it('laat een gewoon lid geen campagne aanmaken', async () => {
    // Anders kan elk lid alle leden mailen namens de vereniging.
    const res = await request(app)
      .post('/api/email-campaigns/')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ name: 'Mag niet', subject: 'Hoi', bodyHtml: '<p>Hoi</p>', targetType: 'all' });

    expect(res.status).toBe(403);
  });

  it('laat een gewoon lid niets versturen', async () => {
    const id = await maakCampagne();

    const res = await request(app)
      .post(`/api/email-campaigns/${id}/send`)
      .set('Authorization', `Bearer ${memberToken}`);

    expect(res.status).toBe(403);
    expect(statusVan(id)).toBe('draft');
  });
});

describe('Scheiding tussen verenigingen', () => {
  it('toont de campagne van een andere vereniging niet', async () => {
    const id = await maakCampagne();

    const andere = createTestAssociation();
    const andereToken = generateTestToken(createTestUser(andere.id, { email: 'admin-mail@test.com', role: 'admin' }));

    const res = await request(app).get(`/api/email-campaigns/${id}`).set('Authorization', `Bearer ${andereToken}`);
    expect(res.status).toBe(404);
  });

  it('laat de campagne van een andere vereniging niet versturen', async () => {
    // Zonder deze grens kan iemand een bericht naar de leden van een andere
    // vereniging laten uitgaan.
    const id = await maakCampagne();

    const andere = createTestAssociation();
    const andereToken = generateTestToken(createTestUser(andere.id, { email: 'admin-mail2@test.com', role: 'admin' }));

    const res = await request(app)
      .post(`/api/email-campaigns/${id}/send`)
      .set('Authorization', `Bearer ${andereToken}`);

    expect(res.status).toBe(404);
    // En de campagne moet echt nog een concept zijn.
    expect(statusVan(id)).toBe('draft');
    expect(associationId).toBeTruthy();
  });
});

describe('Ontvangers en afleverstatus', () => {
  /**
   * Zet een ontvanger met een afleverstatus klaar.
   *
   * Rechtstreeks in de database: die rijen ontstaan pas tijdens het verzenden,
   * en juist de stand daarna is wat deze route laat zien.
   */
  function maakOntvanger(
    campagneId: string,
    status: string,
    naam: { voornaam: string; achternaam: string },
    extra: { sentAt?: string; openedAt?: string; clickedAt?: string; bounceReason?: string } = {},
  ) {
    const lid = createTestUser(associationId, {
      email: `${naam.voornaam.toLowerCase()}-${uuidv4()}@test.com`,
      firstName: naam.voornaam,
      lastName: naam.achternaam,
    });

    db.prepare(
      `INSERT INTO email_campaign_recipients (id, campaign_id, user_id, email, status, sent_at, opened_at, clicked_at, bounce_reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      uuidv4(),
      campagneId,
      lid.id,
      lid.email,
      status,
      extra.sentAt ?? null,
      extra.openedAt ?? null,
      extra.clickedAt ?? null,
      extra.bounceReason ?? null,
    );

    return lid;
  }

  it('geeft de ontvangers met hun naam en afleverstatus terug', async () => {
    const id = await maakCampagne();
    const lid = maakOntvanger(
      id,
      'delivered',
      { voornaam: 'Anna', achternaam: 'Aalders' },
      {
        sentAt: '2026-03-01T10:00:00.000Z',
      },
    );

    const res = await alsAdmin('get', `/${id}/recipients`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.recipients[0]).toMatchObject({
      email: lid.email,
      name: 'Anna Aalders',
      status: 'delivered',
      sentAt: '2026-03-01T10:00:00.000Z',
    });
  });

  it('telt per afleverstatus, ook de statussen zonder ontvangers', async () => {
    const id = await maakCampagne();
    maakOntvanger(id, 'delivered', { voornaam: 'Anna', achternaam: 'Aalders' });
    maakOntvanger(id, 'opened', { voornaam: 'Bram', achternaam: 'Bakker' });
    maakOntvanger(id, 'opened', { voornaam: 'Carla', achternaam: 'Cremers' });
    maakOntvanger(id, 'bounced', { voornaam: 'Dirk', achternaam: 'Dekker' }, { bounceReason: 'Postbus vol' });

    const res = await alsAdmin('get', `/${id}/recipients`);
    expect(res.body.total).toBe(4);
    expect(res.body.byStatus).toEqual({
      pending: 0,
      sent: 0,
      delivered: 1,
      opened: 2,
      clicked: 0,
      bounced: 1,
      failed: 0,
    });
  });

  it('geeft de reden mee waarom een mail bounced', async () => {
    const id = await maakCampagne();
    maakOntvanger(id, 'bounced', { voornaam: 'Dirk', achternaam: 'Dekker' }, { bounceReason: 'Postbus vol' });

    const res = await alsAdmin('get', `/${id}/recipients`);
    expect(res.body.recipients[0].bounceReason).toBe('Postbus vol');
  });

  it('geeft een lege lijst voor een campagne die nog niet verstuurd is', async () => {
    const id = await maakCampagne();

    const res = await alsAdmin('get', `/${id}/recipients`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      recipients: [],
      total: 0,
      byStatus: { pending: 0, sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, failed: 0 },
    });
  });

  it('houdt de ontvangers van twee campagnes uit elkaar', async () => {
    const eerste = await maakCampagne();
    const tweede = await maakCampagne({ name: 'Nieuwsbrief april' });
    maakOntvanger(eerste, 'sent', { voornaam: 'Anna', achternaam: 'Aalders' });

    expect((await alsAdmin('get', `/${tweede}/recipients`)).body.total).toBe(0);
  });

  it('geeft 404 bij een campagne die niet bestaat', async () => {
    expect((await alsAdmin('get', `/${uuidv4()}/recipients`)).status).toBe(404);
  });

  it('geeft de ontvangers van een campagne van een andere vereniging niet vrij', async () => {
    const id = await maakCampagne();
    maakOntvanger(id, 'delivered', { voornaam: 'Anna', achternaam: 'Aalders' });

    const andere = createTestAssociation();
    const andereToken = generateTestToken(
      createTestUser(andere.id, { email: `admin-ontvangers-${uuidv4()}@test.com`, role: 'admin' }),
    );

    const res = await request(app)
      .get(`/api/email-campaigns/${id}/recipients`)
      .set('Authorization', `Bearer ${andereToken}`);
    expect(res.status).toBe(404);
  });

  it('laat een gewoon lid de afleverstatus niet inzien', async () => {
    // Wie de mailing niet mag versturen, hoeft ook niet te zien wie hem opende.
    const id = await maakCampagne();

    const res = await request(app)
      .get(`/api/email-campaigns/${id}/recipients`)
      .set('Authorization', `Bearer ${memberToken}`);
    expect(res.status).toBe(403);
  });
});
