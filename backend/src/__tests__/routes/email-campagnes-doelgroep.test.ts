/**
 * Wie krijgt de massamail werkelijk in de bus?
 *
 * email-campaigns.test.ts controleert al of een campagne aangemaakt, getoond
 * en eenmalig verstuurd wordt. Wat daar niet in staat is de vraag die er bij
 * massamail het meest toe doet: welke mailadressen komen er uit het verzenden
 * rollen. Die vraag is hier het onderwerp.
 *
 * Er gaat niets de deur uit. `../../utils/email` is hieronder met `vi.mock`
 * vervangen door een dubbel; `sendEmail` schrijft nergens naartoe en levert
 * alleen op wat de test hem laat opleveren. De ontvangerslijst lezen we uit de
 * aanroepen van dat dubbel. Er is dus ook geen testadres dat "toch even" echt
 * post krijgt.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import emailCampaignsRoutes, { processScheduledCampaigns } from '../../routes/email-campaigns';
import { errorHandler } from '../../middleware/errorHandler';
import { sendEmail } from '../../utils/email';
import {
  createTestAssociation,
  createTestUser,
  createTestOrchestra,
  addUserToOrchestra,
  generateTestToken,
  createTestEnvironment,
  TestUser,
} from '../testUtils';

// Verzenden wordt afgevangen. Zonder deze regel zou een campagne met de
// verkeerde doelgroep tijdens het testen echt de deur uit gaan, en dat is nu
// juist de fout waar dit bestand over gaat.
vi.mock('../../utils/email', () => ({
  sendEmail: vi.fn().mockResolvedValue(true),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(true),
}));

const verzend = vi.mocked(sendEmail);

const app = express();
app.use(express.json());
app.use('/api', rateLimit({ windowMs: 60_000, limit: 10_000 }));
app.use('/api/email-campaigns', emailCampaignsRoutes);
app.use(errorHandler);

let adminToken: string;
let memberToken: string;
let muziekToken: string;
let associationId: string;
let adminUser: TestUser;
let memberUser: TestUser;
let muziekUser: TestUser;

beforeEach(() => {
  const omgeving = createTestEnvironment();
  adminToken = omgeving.adminToken;
  memberToken = omgeving.memberToken;
  muziekToken = omgeving.musicCommitteeToken;
  associationId = omgeving.association.id;
  adminUser = omgeving.adminUser;
  memberUser = omgeving.memberUser;
  muziekUser = omgeving.musicCommitteeUser;

  // De mock leeft buiten de test; zonder wissen telt de vorige test mee.
  verzend.mockReset();
  verzend.mockResolvedValue(true);
});

const alsAdmin = (methode: 'get' | 'post' | 'put' | 'delete', pad: string) =>
  request(app)[methode](`/api/email-campaigns${pad}`).set('Authorization', `Bearer ${adminToken}`);

const alsLid = (methode: 'get' | 'post' | 'put' | 'delete', pad: string) =>
  request(app)[methode](`/api/email-campaigns${pad}`).set('Authorization', `Bearer ${memberToken}`);

const alsMuziek = (methode: 'get' | 'post' | 'put' | 'delete', pad: string) =>
  request(app)[methode](`/api/email-campaigns${pad}`).set('Authorization', `Bearer ${muziekToken}`);

async function maakCampagne(overschrijf: Record<string, unknown> = {}) {
  const res = await alsAdmin('post', '/').send({
    name: 'Nieuwsbrief maart',
    subject: 'Nieuws van de vereniging',
    bodyHtml: '<p>Beste leden,</p>',
    targetType: 'all',
    ...overschrijf,
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.id as string;
}

/** De mailadressen waar het dubbel daadwerkelijk naartoe gestuurd heeft. */
function ontvangenDoor(): string[] {
  return verzend.mock.calls.map((aanroep) => String((aanroep[0] as { to: string }).to)).sort();
}

/** Een tweede vereniging met een beheerder en een lid, om de grens te toetsen. */
function andereVereniging(kenmerk: string) {
  const vereniging = createTestAssociation();
  const beheerder = createTestUser(vereniging.id, {
    email: `beheerder-${kenmerk}-${uuidv4()}@anders.test`,
    role: 'admin',
  });
  const lid = createTestUser(vereniging.id, { email: `lid-${kenmerk}-${uuidv4()}@anders.test` });
  return { vereniging, beheerder, lid, token: generateTestToken(beheerder) };
}

function statusVan(id: string): string {
  const rij = db.prepare('SELECT status FROM email_campaigns WHERE id = ?').get(id) as { status: string };
  return rij.status;
}

describe('Doelgroep: wie krijgt de mail', () => {
  it('stuurt bij doelgroep "iedereen" naar elk actief lid van de eigen vereniging', async () => {
    const id = await maakCampagne({ targetType: 'all' });

    expect((await alsAdmin('post', `/${id}/send`)).status).toBe(200);
    expect(ontvangenDoor()).toEqual([adminUser.email, memberUser.email, muziekUser.email].sort());
  });

  it('stuurt niets naar de leden van een andere vereniging', async () => {
    // De duurste fout die er is: de ledenlijst van vereniging B krijgt post van
    // vereniging A. Onherstelbaar, en meteen een datalek.
    const vreemd = andereVereniging('doelgroep');
    const id = await maakCampagne({ targetType: 'all' });

    await alsAdmin('post', `/${id}/send`);

    expect(ontvangenDoor()).not.toContain(vreemd.lid.email);
    expect(ontvangenDoor()).not.toContain(vreemd.beheerder.email);
  });

  it('slaat een lid over dat niet meer actief is', async () => {
    const gestopt = createTestUser(associationId, { email: 'gestopt@test.com' });
    db.prepare("UPDATE users SET status = 'inactive' WHERE id = ?").run(gestopt.id);

    const id = await maakCampagne({ targetType: 'all' });
    await alsAdmin('post', `/${id}/send`);

    expect(ontvangenDoor()).not.toContain('gestopt@test.com');
  });

  it('slaat een verwijderd lid over', async () => {
    // Verwijderen is zacht: de rij blijft staan met deleted_at gezet en status
    // op inactive. Post naar een uitgeschreven lid is precies wat de AVG-route
    // moet voorkomen.
    const weg = createTestUser(associationId, { email: 'weg@test.com' });
    db.prepare("UPDATE users SET status = 'inactive', deleted_at = ? WHERE id = ?").run(
      new Date().toISOString(),
      weg.id,
    );

    const id = await maakCampagne({ targetType: 'all' });
    await alsAdmin('post', `/${id}/send`);

    expect(ontvangenDoor()).not.toContain('weg@test.com');
  });

  it('slaat een lid zonder mailadres over', async () => {
    const zonder = createTestUser(associationId, { email: 'leeg-adres@test.com' });
    db.prepare("UPDATE users SET email = '' WHERE id = ?").run(zonder.id);

    const id = await maakCampagne({ targetType: 'all' });
    await alsAdmin('post', `/${id}/send`);

    expect(ontvangenDoor()).not.toContain('');
    expect(ontvangenDoor()).toHaveLength(3);
  });

  it('stuurt bij doelgroep "orkesten" alleen naar de leden van die orkesten', async () => {
    const harmonie = createTestOrchestra(associationId, { name: 'Harmonie' });
    const drumband = createTestOrchestra(associationId, { name: 'Drumband' });
    const speler = createTestUser(associationId, { email: 'harmonielid@test.com' });
    const ander = createTestUser(associationId, { email: 'drumbandlid@test.com' });
    addUserToOrchestra(speler.id, harmonie.id);
    addUserToOrchestra(ander.id, drumband.id);

    const id = await maakCampagne({ targetType: 'orchestras', targetOrchestras: [harmonie.id] });
    await alsAdmin('post', `/${id}/send`);

    expect(ontvangenDoor()).toEqual(['harmonielid@test.com']);
  });

  it('stuurt een lid dat in twee aangeschreven orkesten speelt maar een keer', async () => {
    // De query gebruikt EXISTS in plaats van een JOIN; een dubbele rij in
    // user_orchestras mag geen tweede mail betekenen.
    const harmonie = createTestOrchestra(associationId, { name: 'Harmonie' });
    const drumband = createTestOrchestra(associationId, { name: 'Drumband' });
    const beide = createTestUser(associationId, { email: 'speelt-beide@test.com' });
    addUserToOrchestra(beide.id, harmonie.id);
    addUserToOrchestra(beide.id, drumband.id);

    const id = await maakCampagne({
      targetType: 'orchestras',
      targetOrchestras: [harmonie.id, drumband.id],
    });
    await alsAdmin('post', `/${id}/send`);

    expect(ontvangenDoor()).toEqual(['speelt-beide@test.com']);
  });

  it('stuurt bij doelgroep "rollen" alleen naar die rollen', async () => {
    const id = await maakCampagne({ targetType: 'roles', targetRoles: ['admin'] });
    await alsAdmin('post', `/${id}/send`);

    expect(ontvangenDoor()).toEqual([adminUser.email]);
  });

  it('stuurt bij doelgroep "eigen keuze" alleen naar de gekozen leden', async () => {
    const id = await maakCampagne({ targetType: 'custom', targetUserIds: [memberUser.id] });
    await alsAdmin('post', `/${id}/send`);

    expect(ontvangenDoor()).toEqual([memberUser.email]);
  });

  it('negeert een handmatig gekozen lid van een andere vereniging', async () => {
    // Wie de campagne rechtstreeks samenstelt kan er een vreemd lid-id in
    // zetten. De verenigingsgrens hoort ook dan te houden.
    const vreemd = andereVereniging('handmatig');
    const id = await maakCampagne({
      targetType: 'custom',
      targetUserIds: [memberUser.id, vreemd.lid.id],
    });

    await alsAdmin('post', `/${id}/send`);

    expect(ontvangenDoor()).toEqual([memberUser.email]);
  });
});

describe('Een doelgroep die niemand aanwijst', () => {
  /**
   * BEWIJS van een echte fout, hersteld in getCampaignRecipients.
   *
   * De helper bouwde de beperking op als
   *   `if (target_type === 'custom' && campaign.target_user_ids)` met daarbinnen
   *   `if (userIds.length > 0)`.
   * Viel een van die twee weg - geen lijst opgeslagen, of een lege lijst - dan
   * werd er niets aan de query toegevoegd en bleef alleen `association_id = ?`
   * over. Een campagne met een lege ontvangerslijst ging daarmee naar elk
   * actief lid van de vereniging.
   *
   * Terwijl /preview-recipients keurig nul ontvangers toonde: die route heeft
   * de lengtecontrole wel als voorwaarde om te zoeken, niet als voorwaarde om
   * te beperken. Je zag dus "0 ontvangers", drukte op verzenden, en de hele
   * vereniging had post.
   *
   * Rood aangetoond op de oude code: eigen bestand naar de scratchpad,
   * `git checkout HEAD -- src/routes/email-campaigns.ts`, dit testbestand
   * gedraaid. Precies de vijf tests uit dit blok faalden: de mail ging naar
   * alle drie de leden van de vereniging in plaats van naar niemand. Daarna de
   * kopie teruggezet.
   */
  it('stuurt niets bij een lege lijst met gekozen leden', async () => {
    const id = await maakCampagne({ targetType: 'custom', targetUserIds: [] });

    expect((await alsAdmin('post', `/${id}/send`)).status).toBe(200);
    expect(ontvangenDoor()).toEqual([]);
  });

  it('stuurt niets bij een doelgroep "orkesten" zonder orkesten', async () => {
    const id = await maakCampagne({ targetType: 'orchestras', targetOrchestras: [] });

    await alsAdmin('post', `/${id}/send`);
    expect(ontvangenDoor()).toEqual([]);
  });

  it('stuurt niets bij een doelgroep "rollen" waar geen rol bij staat', async () => {
    // Hier is de lijst niet leeg maar helemaal afwezig: target_roles blijft
    // NULL in de database.
    const id = await maakCampagne({ targetType: 'roles' });

    await alsAdmin('post', `/${id}/send`);
    expect(ontvangenDoor()).toEqual([]);
  });

  it('houdt het voorbeeld vooraf en het werkelijke verzenden gelijk', async () => {
    // Het voorbeeld is het enige wat een beheerder ziet voordat hij verstuurt.
    // Wijkt het af van wat er uitgaat, dan is het erger dan geen voorbeeld.
    const id = await maakCampagne({ targetType: 'custom', targetUserIds: [] });

    const voorbeeld = await alsAdmin('get', `/${id}/preview-recipients`);
    expect(voorbeeld.body.count).toBe(0);

    await alsAdmin('post', `/${id}/send`);
    expect(ontvangenDoor()).toHaveLength(voorbeeld.body.count);
  });

  it('telt nul ontvangers en rondt de campagne netjes af', async () => {
    const id = await maakCampagne({ targetType: 'custom', targetUserIds: [] });

    await alsAdmin('post', `/${id}/send`);

    const rij = db.prepare('SELECT status, total_recipients FROM email_campaigns WHERE id = ?').get(id) as {
      status: string;
      total_recipients: number;
    };
    expect(rij.status).toBe('sent');
    expect(rij.total_recipients).toBe(0);
  });
});

describe('Voorbeeld van de ontvangers', () => {
  it('toont bij "iedereen" alle actieve leden met naam', async () => {
    const id = await maakCampagne({ targetType: 'all' });

    const res = await alsAdmin('get', `/${id}/preview-recipients`);
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(3);
    expect(res.body.recipients.map((r: { email: string }) => r.email).sort()).toEqual(
      [adminUser.email, memberUser.email, muziekUser.email].sort(),
    );
  });

  it('toont bij "orkesten" alleen de leden van dat orkest', async () => {
    const harmonie = createTestOrchestra(associationId, { name: 'Harmonie' });
    const speler = createTestUser(associationId, { email: 'voorbeeld-harmonie@test.com' });
    addUserToOrchestra(speler.id, harmonie.id);

    const id = await maakCampagne({ targetType: 'orchestras', targetOrchestras: [harmonie.id] });

    const res = await alsAdmin('get', `/${id}/preview-recipients`);
    expect(res.body.count).toBe(1);
    expect(res.body.recipients[0].email).toBe('voorbeeld-harmonie@test.com');
  });

  it('toont bij "rollen" alleen die rollen', async () => {
    const id = await maakCampagne({ targetType: 'roles', targetRoles: ['music_committee'] });

    const res = await alsAdmin('get', `/${id}/preview-recipients`);
    expect(res.body.recipients.map((r: { email: string }) => r.email)).toEqual([muziekUser.email]);
  });

  it('toont bij "eigen keuze" geen lid van een andere vereniging', async () => {
    const vreemd = andereVereniging('voorbeeld');
    const id = await maakCampagne({ targetType: 'custom', targetUserIds: [vreemd.lid.id] });

    const res = await alsAdmin('get', `/${id}/preview-recipients`);
    expect(res.body.count).toBe(0);
  });

  it('geeft het voorbeeld van een campagne van een andere vereniging niet vrij', async () => {
    const id = await maakCampagne();
    const vreemd = andereVereniging('voorbeeld-grens');

    const res = await request(app)
      .get(`/api/email-campaigns/${id}/preview-recipients`)
      .set('Authorization', `Bearer ${vreemd.token}`);
    expect(res.status).toBe(404);
  });

  it('laat een gewoon lid het voorbeeld niet zien', async () => {
    const id = await maakCampagne();
    expect((await alsLid('get', `/${id}/preview-recipients`)).status).toBe(403);
  });
});

describe('Afmeldingen', () => {
  it('WACHT: een lid dat mail heeft uitgezet krijgt de campagne toch', async () => {
    // Dit is geen bewijs maar een wacht: hij blijft ook op de oude code groen.
    //
    // notification_preferences.email_enabled is de knop waarmee een lid alle
    // mail uitzet. getCampaignRecipients kijkt er niet naar; die filtert alleen
    // op status en op een gevuld mailadres. Of dat goed is, is een keuze die
    // niet aan een test is: een mailing van het bestuur is iets anders dan een
    // automatische melding over een repetitie.
    //
    // Deze test legt de huidige keuze vast, zodat een wijziging zichtbaar wordt
    // in plaats van stilletjes te gebeuren.
    db.prepare(
      `INSERT INTO notification_preferences (id, user_id, email_enabled, push_enabled)
       VALUES (?, ?, 0, 0)`,
    ).run(uuidv4(), memberUser.id);

    const id = await maakCampagne({ targetType: 'custom', targetUserIds: [memberUser.id] });
    await alsAdmin('post', `/${id}/send`);

    expect(ontvangenDoor()).toEqual([memberUser.email]);
  });
});

describe('Wat er per ontvanger wordt vastgelegd', () => {
  it('vult de aanhef per ontvanger in', async () => {
    const id = await maakCampagne({
      targetType: 'custom',
      targetUserIds: [memberUser.id],
      bodyHtml: '<p>Beste {{firstName}} {{lastName}}, oftewel {{fullName}} ({{email}}).</p>',
    });

    await alsAdmin('post', `/${id}/send`);

    const bericht = verzend.mock.calls[0][0] as { html: string };
    expect(bericht.html).toContain('Beste Member User, oftewel Member User');
    expect(bericht.html).toContain(memberUser.email);
    expect(bericht.html).not.toContain('{{');
  });

  it('leidt een tekstversie af uit de opmaak als die ontbreekt', async () => {
    const id = await maakCampagne({
      targetType: 'custom',
      targetUserIds: [memberUser.id],
      bodyHtml: '<p>Beste leden,</p><p><b>Let op</b> de datum.</p>',
    });

    await alsAdmin('post', `/${id}/send`);

    const bericht = verzend.mock.calls[0][0] as { text: string };
    expect(bericht.text).toContain('Let op');
    expect(bericht.text).not.toContain('<b>');
  });

  it('gebruikt de meegegeven tekstversie als die er wel is', async () => {
    const id = await maakCampagne({
      targetType: 'custom',
      targetUserIds: [memberUser.id],
      bodyHtml: '<p>Opmaak</p>',
      bodyText: 'Kale tekst voor {{firstName}}',
    });

    await alsAdmin('post', `/${id}/send`);

    const bericht = verzend.mock.calls[0][0] as { text: string };
    expect(bericht.text).toBe('Kale tekst voor Member');
  });

  it('legt per ontvanger vast dat de mail verstuurd is', async () => {
    const id = await maakCampagne({ targetType: 'custom', targetUserIds: [memberUser.id] });
    await alsAdmin('post', `/${id}/send`);

    const rij = db
      .prepare('SELECT email, status, sent_at FROM email_campaign_recipients WHERE campaign_id = ?')
      .get(id) as { email: string; status: string; sent_at: string | null };
    expect(rij).toMatchObject({ email: memberUser.email, status: 'sent' });
    expect(rij.sent_at).toBeTruthy();
  });

  it('markeert een ontvanger als mislukt als de mailer weigert', async () => {
    verzend.mockResolvedValue(false);

    const id = await maakCampagne({ targetType: 'custom', targetUserIds: [memberUser.id] });
    await alsAdmin('post', `/${id}/send`);

    const rij = db.prepare('SELECT status FROM email_campaign_recipients WHERE campaign_id = ?').get(id) as {
      status: string;
    };
    expect(rij.status).toBe('failed');

    const campagne = db.prepare('SELECT delivered_count, bounced_count FROM email_campaigns WHERE id = ?').get(id) as {
      delivered_count: number;
      bounced_count: number;
    };
    expect(campagne).toEqual({ delivered_count: 0, bounced_count: 1 });
  });

  it('laat een campagne niet stuklopen als de mailer een fout gooit', async () => {
    // Een kapotte SMTP-verbinding halverwege mag de rest van de ledenlijst niet
    // meeslepen: de overige leden horen hun mail gewoon te krijgen.
    const tweede = createTestUser(associationId, { email: 'tweede@test.com' });
    verzend.mockRejectedValueOnce(new Error('SMTP ligt eruit')).mockResolvedValue(true);

    const id = await maakCampagne({
      targetType: 'custom',
      targetUserIds: [memberUser.id, tweede.id],
    });

    const res = await alsAdmin('post', `/${id}/send`);
    expect(res.status).toBe(200);

    const campagne = db
      .prepare('SELECT status, total_recipients, delivered_count, bounced_count FROM email_campaigns WHERE id = ?')
      .get(id) as {
      status: string;
      total_recipients: number;
      delivered_count: number;
      bounced_count: number;
    };
    expect(campagne).toEqual({ status: 'sent', total_recipients: 2, delivered_count: 1, bounced_count: 1 });
  });

  it('telt het aantal ontvangers en zet de campagne op verzonden', async () => {
    const id = await maakCampagne({ targetType: 'all' });
    await alsAdmin('post', `/${id}/send`);

    const rij = db
      .prepare('SELECT status, total_recipients, delivered_count, sent_at FROM email_campaigns WHERE id = ?')
      .get(id) as { status: string; total_recipients: number; delivered_count: number; sent_at: string | null };
    expect(rij.status).toBe('sent');
    expect(rij.total_recipients).toBe(3);
    expect(rij.delivered_count).toBe(3);
    expect(rij.sent_at).toBeTruthy();
  });

  it('laat een geannuleerde campagne niet alsnog uitgaan', async () => {
    const id = await maakCampagne();
    await alsAdmin('post', `/${id}/schedule`).send({ scheduledAt: '2030-01-01T10:00:00.000Z' });
    await alsAdmin('post', `/${id}/cancel`);

    const res = await alsAdmin('post', `/${id}/send`);
    expect(res.status).toBe(400);
    expect(ontvangenDoor()).toEqual([]);
  });
});

describe('Inplannen en annuleren', () => {
  it('plant een concept in', async () => {
    const id = await maakCampagne();

    const res = await alsAdmin('post', `/${id}/schedule`).send({ scheduledAt: '2030-01-01T10:00:00.000Z' });
    expect(res.status).toBe(200);
    expect(statusVan(id)).toBe('scheduled');
    expect(ontvangenDoor()).toEqual([]);
  });

  it('plant een al verzonden campagne niet opnieuw in', async () => {
    const id = await maakCampagne();
    await alsAdmin('post', `/${id}/send`);

    const res = await alsAdmin('post', `/${id}/schedule`).send({ scheduledAt: '2030-01-01T10:00:00.000Z' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('conceptcampagnes');
  });

  it('annuleert alleen wat ingepland staat', async () => {
    const id = await maakCampagne();

    const teVroeg = await alsAdmin('post', `/${id}/cancel`);
    expect(teVroeg.status).toBe(400);

    await alsAdmin('post', `/${id}/schedule`).send({ scheduledAt: '2030-01-01T10:00:00.000Z' });
    expect((await alsAdmin('post', `/${id}/cancel`)).status).toBe(200);
    expect(statusVan(id)).toBe('cancelled');
  });

  it('meldt netjes dat een onbekende campagne niet in te plannen is', async () => {
    expect((await alsAdmin('post', `/${uuidv4()}/schedule`)).status).toBe(404);
    expect((await alsAdmin('post', `/${uuidv4()}/cancel`)).status).toBe(404);
  });

  it('laat de muziekcommissie niet inplannen of annuleren', async () => {
    // Inplannen en verzenden is voorbehouden aan een beheerder; de
    // muziekcommissie mag campagnes wel opstellen.
    const id = await maakCampagne();

    expect((await alsMuziek('post', `/${id}/schedule`)).status).toBe(403);
    expect((await alsMuziek('post', `/${id}/cancel`)).status).toBe(403);
    expect(statusVan(id)).toBe('draft');
  });

  it('plant de campagne van een andere vereniging niet in', async () => {
    const id = await maakCampagne();
    const vreemd = andereVereniging('inplannen');

    const res = await request(app)
      .post(`/api/email-campaigns/${id}/schedule`)
      .set('Authorization', `Bearer ${vreemd.token}`)
      .send({ scheduledAt: '2030-01-01T10:00:00.000Z' });

    expect(res.status).toBe(404);
    expect(statusVan(id)).toBe('draft');
  });
});

describe('Test-e-mail', () => {
  it('stuurt de proef alleen naar het opgegeven adres', async () => {
    const id = await maakCampagne({ targetType: 'all', bodyHtml: '<p>Dag {{firstName}}</p>' });

    const res = await alsAdmin('post', `/${id}/test`).send({ proef: true, email: 'proef@test.com' });
    expect(res.status).toBe(200);

    expect(ontvangenDoor()).toEqual(['proef@test.com']);
    const bericht = verzend.mock.calls[0][0] as { subject: string; html: string };
    expect(bericht.subject).toMatch(/^\[TEST\] /);
    expect(bericht.html).toContain('Dag Test');
  });

  it('legt de proef niet vast als ontvanger van de campagne', async () => {
    // Anders vervuilt elke proef de afleverstatistiek van de echte mailing.
    const id = await maakCampagne();
    await alsAdmin('post', `/${id}/test`).send({ email: 'proef@test.com' });

    const aantal = db.prepare('SELECT COUNT(*) AS n FROM email_campaign_recipients WHERE campaign_id = ?').get(id) as {
      n: number;
    };
    expect(aantal.n).toBe(0);
    expect(statusVan(id)).toBe('draft');
  });

  it('weigert een proef zonder adres', async () => {
    const id = await maakCampagne();

    const res = await alsAdmin('post', `/${id}/test`).send({});
    expect(res.status).toBe(400);
    expect(verzend).not.toHaveBeenCalled();
  });

  it('meldt het als de proef niet verstuurd kan worden', async () => {
    verzend.mockResolvedValue(false);
    const id = await maakCampagne();

    const res = await alsAdmin('post', `/${id}/test`).send({ email: 'proef@test.com' });
    expect(res.status).toBe(500);
  });

  it('stuurt geen proef van een campagne van een andere vereniging', async () => {
    const id = await maakCampagne();
    const vreemd = andereVereniging('proef');

    const res = await request(app)
      .post(`/api/email-campaigns/${id}/test`)
      .set('Authorization', `Bearer ${vreemd.token}`)
      .send({ email: 'proef@test.com' });

    expect(res.status).toBe(404);
    expect(verzend).not.toHaveBeenCalled();
  });

  it('laat een gewoon lid geen proef versturen', async () => {
    const id = await maakCampagne();

    const res = await alsLid('post', `/${id}/test`).send({ email: 'proef@test.com' });
    expect(res.status).toBe(403);
    expect(verzend).not.toHaveBeenCalled();
  });
});

describe('Campagne wijzigen en verwijderen', () => {
  it('wijzigt een concept', async () => {
    const id = await maakCampagne();

    const res = await alsAdmin('put', `/${id}`).send({
      name: 'Nieuwsbrief april',
      subject: 'Ander onderwerp',
      targetType: 'roles',
      targetRoles: ['admin'],
      scheduledAt: '2030-05-01T09:00:00.000Z',
    });
    expect(res.status).toBe(200);

    const opgehaald = await alsAdmin('get', `/${id}`);
    expect(opgehaald.body).toMatchObject({
      name: 'Nieuwsbrief april',
      subject: 'Ander onderwerp',
      targetType: 'roles',
      targetRoles: ['admin'],
    });
  });

  it('wijzigt een verzonden campagne niet meer', async () => {
    // Wat al bij de leden ligt is niet meer te herschrijven; de tekst in de
    // database moet hetzelfde blijven als wat er verstuurd is.
    const id = await maakCampagne();
    await alsAdmin('post', `/${id}/send`);

    const res = await alsAdmin('put', `/${id}`).send({ subject: 'Achteraf aangepast' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('conceptcampagnes');
  });

  it('laat een leeg wijzigingsverzoek de campagne ongemoeid', async () => {
    const id = await maakCampagne();

    expect((await alsAdmin('put', `/${id}`).send({})).status).toBe(200);
    expect((await alsAdmin('get', `/${id}`)).body.name).toBe('Nieuwsbrief maart');
  });

  it('weigert een wijziging met een onbekende doelgroep', async () => {
    const id = await maakCampagne();

    const res = await alsAdmin('put', `/${id}`).send({ targetType: 'de-hele-provincie' });
    expect(res.status).toBe(400);
  });

  it('wijzigt de campagne van een andere vereniging niet', async () => {
    const id = await maakCampagne();
    const vreemd = andereVereniging('wijzigen');

    const res = await request(app)
      .put(`/api/email-campaigns/${id}`)
      .set('Authorization', `Bearer ${vreemd.token}`)
      .send({ subject: 'Overgenomen' });

    expect(res.status).toBe(404);
    expect((await alsAdmin('get', `/${id}`)).body.subject).toBe('Nieuws van de vereniging');
  });

  it('verwijdert een concept', async () => {
    const id = await maakCampagne();

    expect((await alsAdmin('delete', `/${id}`)).status).toBe(200);
    expect((await alsAdmin('get', `/${id}`)).status).toBe(404);
  });

  it('verwijdert een campagne die aan het verzenden is niet', async () => {
    const id = await maakCampagne();
    db.prepare("UPDATE email_campaigns SET status = 'sending' WHERE id = ?").run(id);

    const res = await alsAdmin('delete', `/${id}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('verzonden');
  });

  it('meldt netjes dat een onbekende campagne niet te verwijderen is', async () => {
    expect((await alsAdmin('delete', `/${uuidv4()}`)).status).toBe(404);
  });

  it('verwijdert de campagne van een andere vereniging niet', async () => {
    const id = await maakCampagne();
    const vreemd = andereVereniging('verwijderen');

    const res = await request(app).delete(`/api/email-campaigns/${id}`).set('Authorization', `Bearer ${vreemd.token}`);

    expect(res.status).toBe(404);
    expect(db.prepare('SELECT id FROM email_campaigns WHERE id = ?').get(id)).toBeTruthy();
  });
});

describe('Overzicht van campagnes', () => {
  it('toont alleen de campagnes van de eigen vereniging', async () => {
    const eigen = await maakCampagne({ name: 'Van ons' });
    const vreemd = andereVereniging('overzicht');

    const res = await request(app).get('/api/email-campaigns/').set('Authorization', `Bearer ${vreemd.token}`);
    expect(res.status).toBe(200);
    expect(res.body.map((c: { id: string }) => c.id)).not.toContain(eigen);
    expect(res.body).toEqual([]);
  });

  it('filtert op toestand', async () => {
    const concept = await maakCampagne({ name: 'Nog concept' });
    const verzonden = await maakCampagne({ name: 'Al weg' });
    await alsAdmin('post', `/${verzonden}/send`);

    const res = await alsAdmin('get', '/?status=draft');
    expect(res.status).toBe(200);
    expect(res.body.map((c: { id: string }) => c.id)).toEqual([concept]);
  });

  it('laat een gewoon lid het overzicht niet zien', async () => {
    expect((await alsLid('get', '/')).status).toBe(403);
  });
});

describe('Sjablonen', () => {
  async function maakSjabloon(overschrijf: Record<string, unknown> = {}) {
    const res = await alsAdmin('post', '/templates').send({
      name: 'Standaard nieuwsbrief',
      subject: 'Nieuws',
      bodyHtml: '<p>Beste {{firstName}},</p>',
      ...overschrijf,
    });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  it('toont een sjabloon terug', async () => {
    const id = await maakSjabloon({ bodyText: 'Beste {{firstName}},' });

    const res = await alsAdmin('get', `/templates/${id}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      name: 'Standaard nieuwsbrief',
      subject: 'Nieuws',
      bodyText: 'Beste {{firstName}},',
      isSystem: false,
    });
  });

  it('wijzigt een sjabloon', async () => {
    const id = await maakSjabloon();

    expect((await alsAdmin('put', `/templates/${id}`).send({ name: 'Hernoemd' })).status).toBe(200);
    expect((await alsAdmin('get', `/templates/${id}`)).body.name).toBe('Hernoemd');
  });

  it('verwijdert een sjabloon', async () => {
    const id = await maakSjabloon();

    expect((await alsAdmin('delete', `/templates/${id}`)).status).toBe(200);
    expect((await alsAdmin('get', `/templates/${id}`)).status).toBe(404);
  });

  it('laat een systeemsjabloon niet wijzigen of verwijderen', async () => {
    // Systeemsjablonen horen bij vaste berichten van de applicatie; wie die
    // aanpast breekt de mail die er automatisch uitgaat.
    const id = await maakSjabloon();
    db.prepare('UPDATE email_templates SET is_system = 1 WHERE id = ?').run(id);

    const gewijzigd = await alsAdmin('put', `/templates/${id}`).send({ name: 'Toch aanpassen' });
    expect(gewijzigd.status).toBe(400);
    expect(gewijzigd.body.error).toContain('Systeemtemplates');

    const verwijderd = await alsAdmin('delete', `/templates/${id}`);
    expect(verwijderd.status).toBe(400);
    expect(db.prepare('SELECT id FROM email_templates WHERE id = ?').get(id)).toBeTruthy();
  });

  it('meldt netjes dat een onbekend sjabloon niet bestaat', async () => {
    expect((await alsAdmin('get', `/templates/${uuidv4()}`)).status).toBe(404);
    expect((await alsAdmin('put', `/templates/${uuidv4()}`).send({ name: 'Iets' })).status).toBe(404);
    expect((await alsAdmin('delete', `/templates/${uuidv4()}`)).status).toBe(404);
  });

  it('toont het sjabloon van een andere vereniging niet', async () => {
    const id = await maakSjabloon();
    const vreemd = andereVereniging('sjabloon');

    const res = await request(app)
      .get(`/api/email-campaigns/templates/${id}`)
      .set('Authorization', `Bearer ${vreemd.token}`);
    expect(res.status).toBe(404);

    const lijst = await request(app)
      .get('/api/email-campaigns/templates')
      .set('Authorization', `Bearer ${vreemd.token}`);
    expect(lijst.body).toEqual([]);
  });

  it('verwijdert het sjabloon van een andere vereniging niet', async () => {
    const id = await maakSjabloon();
    const vreemd = andereVereniging('sjabloon-weg');

    const res = await request(app)
      .delete(`/api/email-campaigns/templates/${id}`)
      .set('Authorization', `Bearer ${vreemd.token}`);

    expect(res.status).toBe(404);
    expect(db.prepare('SELECT id FROM email_templates WHERE id = ?').get(id)).toBeTruthy();
  });

  it('laat een gewoon lid geen sjabloon maken of opvragen', async () => {
    expect((await alsLid('get', '/templates')).status).toBe(403);
    expect((await alsLid('post', '/templates').send({ name: 'A', subject: 'B', bodyHtml: '<p>C</p>' })).status).toBe(
      403,
    );
  });
});

describe('Bijlagen', () => {
  const bestand = Buffer.from('Beste leden, de agenda van de jaarvergadering.');

  it('voegt een bijlage toe aan een concept en toont hem', async () => {
    const id = await maakCampagne();

    const res = await alsAdmin('post', `/${id}/attachments`).attach('file', bestand, {
      filename: 'agenda.txt',
      contentType: 'text/plain',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.originalFilename).toBe('agenda.txt');

    const lijst = await alsAdmin('get', `/${id}/attachments`);
    expect(lijst.status).toBe(200);
    expect(lijst.body).toHaveLength(1);
    expect(lijst.body[0]).toMatchObject({ originalFilename: 'agenda.txt', mimeType: 'text/plain' });
  });

  it('stuurt de bijlage mee met elke mail van de campagne', async () => {
    const id = await maakCampagne({ targetType: 'custom', targetUserIds: [memberUser.id] });
    await alsAdmin('post', `/${id}/attachments`).attach('file', bestand, {
      filename: 'agenda.txt',
      contentType: 'text/plain',
    });

    await alsAdmin('post', `/${id}/send`);

    const bericht = verzend.mock.calls[0][0] as { attachments?: { filename: string }[] };
    expect(bericht.attachments).toHaveLength(1);
    expect(bericht.attachments![0].filename).toBe('agenda.txt');
  });

  it('weigert een bijlage zonder bestand', async () => {
    const id = await maakCampagne();

    const res = await alsAdmin('post', `/${id}/attachments`).field('naam', 'geen bestand');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Geen bestand');
  });

  it('voegt geen bijlage toe aan een verzonden campagne', async () => {
    // Anders lijkt de bijlage bij een mailing te horen die zonder is uitgegaan.
    const id = await maakCampagne();
    await alsAdmin('post', `/${id}/send`);

    const res = await alsAdmin('post', `/${id}/attachments`).attach('file', bestand, {
      filename: 'te-laat.txt',
      contentType: 'text/plain',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('conceptcampagnes');
  });

  it('verwijdert een bijlage', async () => {
    const id = await maakCampagne();
    const toegevoegd = await alsAdmin('post', `/${id}/attachments`).attach('file', bestand, {
      filename: 'agenda.txt',
      contentType: 'text/plain',
    });

    const res = await alsAdmin('delete', `/${id}/attachments/${toegevoegd.body.id}`);
    expect(res.status).toBe(200);
    expect((await alsAdmin('get', `/${id}/attachments`)).body).toEqual([]);
  });

  it('verwijdert een bijlage niet meer nadat de campagne uit is', async () => {
    const id = await maakCampagne();
    const toegevoegd = await alsAdmin('post', `/${id}/attachments`).attach('file', bestand, {
      filename: 'agenda.txt',
      contentType: 'text/plain',
    });
    await alsAdmin('post', `/${id}/send`);

    const res = await alsAdmin('delete', `/${id}/attachments/${toegevoegd.body.id}`);
    expect(res.status).toBe(400);
  });

  it('meldt netjes dat een onbekende bijlage niet bestaat', async () => {
    const id = await maakCampagne();

    expect((await alsAdmin('delete', `/${id}/attachments/${uuidv4()}`)).status).toBe(404);
  });

  it('verwijdert de bijlage van een andere campagne niet', async () => {
    const eerste = await maakCampagne({ name: 'Eerste' });
    const tweede = await maakCampagne({ name: 'Tweede' });
    const toegevoegd = await alsAdmin('post', `/${eerste}/attachments`).attach('file', bestand, {
      filename: 'agenda.txt',
      contentType: 'text/plain',
    });

    const res = await alsAdmin('delete', `/${tweede}/attachments/${toegevoegd.body.id}`);
    expect(res.status).toBe(404);
    expect((await alsAdmin('get', `/${eerste}/attachments`)).body).toHaveLength(1);
  });

  it('geeft de bijlagen van een campagne van een andere vereniging niet vrij', async () => {
    const id = await maakCampagne();
    await alsAdmin('post', `/${id}/attachments`).attach('file', bestand, {
      filename: 'agenda.txt',
      contentType: 'text/plain',
    });
    const vreemd = andereVereniging('bijlage');

    const res = await request(app)
      .get(`/api/email-campaigns/${id}/attachments`)
      .set('Authorization', `Bearer ${vreemd.token}`);
    expect(res.status).toBe(404);
  });

  it('meldt netjes dat de bijlagen van een onbekende campagne niet bestaan', async () => {
    expect((await alsAdmin('get', `/${uuidv4()}/attachments`)).status).toBe(404);
  });
});

describe('Ingeplande campagnes die vanzelf uitgaan', () => {
  it('verstuurt wat over tijd is en laat de toekomst staan', async () => {
    const nu = await maakCampagne({ name: 'Moet nu weg', targetType: 'custom', targetUserIds: [memberUser.id] });
    const later = await maakCampagne({ name: 'Pas later', targetType: 'custom', targetUserIds: [adminUser.id] });
    await alsAdmin('post', `/${nu}/schedule`).send({ scheduledAt: '2020-01-01T10:00:00.000Z' });
    await alsAdmin('post', `/${later}/schedule`).send({ scheduledAt: '2099-01-01T10:00:00.000Z' });

    await processScheduledCampaigns();

    expect(statusVan(nu)).toBe('sent');
    expect(statusVan(later)).toBe('scheduled');
    expect(ontvangenDoor()).toEqual([memberUser.email]);
  });

  it('laat een concept en een geannuleerde campagne met rust', async () => {
    // Alleen wat werkelijk ingepland staat mag door de achtergrondtaak worden
    // verstuurd; een concept met een datum in het verleden is dat niet.
    const concept = await maakCampagne({ name: 'Nog concept' });
    db.prepare("UPDATE email_campaigns SET scheduled_at = '2020-01-01T10:00:00.000Z' WHERE id = ?").run(concept);

    const geannuleerd = await maakCampagne({ name: 'Afgeblazen' });
    await alsAdmin('post', `/${geannuleerd}/schedule`).send({ scheduledAt: '2020-01-01T10:00:00.000Z' });
    await alsAdmin('post', `/${geannuleerd}/cancel`);

    await processScheduledCampaigns();

    expect(statusVan(concept)).toBe('draft');
    expect(statusVan(geannuleerd)).toBe('cancelled');
    expect(ontvangenDoor()).toEqual([]);
  });

  it('houdt de ingeplande campagnes van twee verenigingen uit elkaar', async () => {
    // De achtergrondtaak loopt over alle verenigingen tegelijk; de doelgroep
    // moet per campagne binnen de eigen vereniging blijven.
    const eigen = await maakCampagne({ name: 'Van ons', targetType: 'all' });
    await alsAdmin('post', `/${eigen}/schedule`).send({ scheduledAt: '2020-01-01T10:00:00.000Z' });
    const vreemd = andereVereniging('gepland');

    await processScheduledCampaigns();

    expect(ontvangenDoor()).not.toContain(vreemd.lid.email);
    expect(ontvangenDoor()).not.toContain(vreemd.beheerder.email);
    expect(ontvangenDoor()).toHaveLength(3);
  });
});
