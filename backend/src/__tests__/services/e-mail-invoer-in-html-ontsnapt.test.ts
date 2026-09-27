/**
 * Invoer van gebruikers in de html van een e-mail die buiten de sjablonen
 * wordt opgebouwd.
 *
 * De sjablonen in templates/emails gaan door renderVeilig. Vier plekken
 * bouwden hun html zelf met een template-string en plakten er namen, titels
 * en teksten ongewijzigd in: de e-mail bij een melding, de herinnering voor
 * een peiling, de e-mailactie van een workflow en de personalisatie van een
 * e-mailcampagne. Een lid met `<a href="https://kwaad.example">` als voornaam
 * of een peiling met zo'n titel werd daardoor opmaak in de mail van iemand
 * anders - een link die van de vereniging lijkt te komen.
 *
 * Wat hoort: in de html is zo'n waarde tekst (ontsnapt), een link in `href`
 * is alleen een http(s)-adres, en de platte tekst blijft zoals hij was.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import testDb from '../testDb';
import pollsApp from '../testApp';
import { sendEmail } from '../../utils/email';
import { sendNotification } from '../../services/notifications';
import { executeWorkflow } from '../../services/workflowEngine';
import emailCampaignsRoutes from '../../routes/email-campaigns';
import { errorHandler } from '../../middleware/errorHandler';
import { veiligeLink } from '../../templates/emails/htmlVeilig';
import { createTestEnvironment, TestAssociation, TestUser } from '../testUtils';

const KWAAD = '<a href="https://kwaad.example/inloggen">Klik</a>';
const ONTSNAPT = '&lt;a href=&quot;https://kwaad.example/inloggen&quot;&gt;Klik&lt;/a&gt;';

const campagneApp = express();
campagneApp.use(express.json());
campagneApp.use('/api', rateLimit({ windowMs: 60_000, limit: 10_000 }));
campagneApp.use('/api/email-campaigns', emailCampaignsRoutes);
campagneApp.use(errorHandler);

type Bericht = { to: string; subject: string; text: string; html: string };
const verzonden = (): Bericht[] => vi.mocked(sendEmail).mock.calls.map((aanroep) => aanroep[0] as Bericht);

/** Staat er in de html een echte link of een echte tag die van de invoer komt? */
function bevatOpmaakVanInvoer(html: string): boolean {
  return html.includes('<a href="https://kwaad.example') || html.includes('<img');
}

describe('invoer van gebruikers in de html van een e-mail', () => {
  let vereniging: TestAssociation;
  let beheerder: TestUser;
  let lid: TestUser;
  let beheerderToken: string;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    beheerder = omgeving.adminUser;
    lid = omgeving.memberUser;
    beheerderToken = omgeving.adminToken;

    vi.mocked(sendEmail).mockReset();
    vi.mocked(sendEmail).mockResolvedValue(true as never);
    vi.stubEnv('FRONTEND_URL', 'https://tutti.example');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('de e-mail bij een melding', () => {
    const meld = (titel: string, tekst: string, data?: Record<string, unknown>) =>
      sendNotification({
        userId: lid.id,
        type: 'announcement',
        title: titel,
        body: tekst,
        data,
        channels: ['email'],
        associationId: vereniging.id,
      });

    it('ontsnapt de titel, de tekst en de naam van het lid', async () => {
      testDb.prepare('UPDATE users SET first_name = ? WHERE id = ?').run('<img src=x onerror=alert(1)>', lid.id);

      await meld(`Concert ${KWAAD}`, `Kom allemaal ${KWAAD}`);

      const [bericht] = verzonden();
      expect(bevatOpmaakVanInvoer(bericht.html)).toBe(false);
      expect(bericht.html).toContain(`Concert ${ONTSNAPT}`);
      expect(bericht.html).toContain(`Kom allemaal ${ONTSNAPT}`);
      expect(bericht.html).toContain('Hallo &lt;img src=x onerror=alert(1)&gt;');
      // De platte tekst is geen html en blijft zoals hij was.
      expect(bericht.text).toContain(`Kom allemaal ${KWAAD}`);
    });

    it('houdt regeleinden in de tekst zichtbaar', async () => {
      await meld('Onderhoud', 'Eerste regel\nTweede regel');

      expect(verzonden()[0].html).toContain('Eerste regel<br>Tweede regel');
    });

    it('zet het pad in de knop als ontsnapt adres', async () => {
      await meld('Nieuw bericht', 'Lees het', { url: '/posts/1?a=1&b="2"' });

      expect(verzonden()[0].html).toContain('href="https://tutti.example/posts/1?a=1&amp;b=%222%22"');
    });

    it('laat de knop weg als er geen http(s)-adres uit komt', async () => {
      vi.stubEnv('FRONTEND_URL', 'javascript:alert(1)//');

      await meld('Nieuw bericht', 'Lees het', { url: '/posts/1' });

      expect(verzonden()[0].html).not.toContain('href=');
    });
  });

  describe('de herinnering voor een peiling', () => {
    function maakPeiling(titel: string): string {
      const id = uuidv4();
      testDb
        .prepare(
          `INSERT INTO polls (id, association_id, title, poll_type, status, created_by)
           VALUES (?, ?, ?, 'single', 'active', ?)`,
        )
        .run(id, vereniging.id, titel, beheerder.id);
      return id;
    }

    it('ontsnapt de titel van de peiling en de naam van het lid', async () => {
      testDb.prepare('UPDATE users SET first_name = ? WHERE id = ?').run(KWAAD, lid.id);
      const peiling = maakPeiling(`Welk stuk? ${KWAAD}`);

      const antwoord = await request(pollsApp)
        .post(`/api/polls/${peiling}/remind`)
        .set('Authorization', `Bearer ${beheerderToken}`);

      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      const aanLid = verzonden().find((b) => b.to === lid.email)!;
      expect(bevatOpmaakVanInvoer(aanLid.html)).toBe(false);
      expect(aanLid.html).toContain(`<strong>Welk stuk? ${ONTSNAPT}</strong>`);
      expect(aanLid.html).toContain(`Hallo ${ONTSNAPT},`);
      expect(aanLid.html).toContain(`href="https://tutti.example/polls?view=${peiling}"`);
      expect(aanLid.text).toContain(`Welk stuk? ${KWAAD}`);
    });
  });

  describe('de e-mailactie van een workflow', () => {
    it('ontsnapt ingevulde waarden, maar laat de opmaak van de beheerder staan', async () => {
      testDb
        .prepare(
          `INSERT INTO association_modules (id, association_id, module_key, enabled, updated_by)
           VALUES (?, ?, 'workflows', 1, ?)`,
        )
        .run(uuidv4(), vereniging.id, beheerder.id);
      testDb.prepare('UPDATE users SET first_name = ? WHERE id = ?').run(KWAAD, lid.id);

      const werkstroom = uuidv4();
      testDb
        .prepare(
          `INSERT INTO workflows (id, association_id, name, is_active, created_by)
           VALUES (?, ?, 'Welkom', 1, ?)`,
        )
        .run(werkstroom, vereniging.id, beheerder.id);
      testDb
        .prepare(
          `INSERT INTO workflow_actions (id, workflow_id, action_type, action_order, config, is_active)
           VALUES (?, ?, 'send_email', 0, ?, 1)`,
        )
        .run(
          uuidv4(),
          werkstroom,
          JSON.stringify({
            recipientType: 'specific',
            recipientEmail: 'secretaris@test.nl',
            subject: 'Nieuw lid',
            body: '<p><b>Welkom</b> {{first_name}}</p>',
          }),
        );

      await executeWorkflow(werkstroom, vereniging.id, 'manual', beheerder.id, 'user', lid.id);

      const [bericht] = verzonden();
      expect(bericht.html).toBe(`<p><b>Welkom</b> ${ONTSNAPT}</p>`);
    });
  });

  describe('de personalisatie van een e-mailcampagne', () => {
    it('ontsnapt de naam van de ontvanger in de html, niet in de platte tekst', async () => {
      testDb.prepare('UPDATE users SET first_name = ?, last_name = ? WHERE id = ?').run(KWAAD, 'Jan $& Co', lid.id);

      const aangemaakt = await request(campagneApp)
        .post('/api/email-campaigns')
        .set('Authorization', `Bearer ${beheerderToken}`)
        .send({
          name: 'Nieuwsbrief',
          subject: 'Nieuws',
          bodyHtml: '<p>Beste {{firstName}} ({{fullName}})</p>',
          bodyText: 'Beste {{firstName}} {{lastName}}',
          targetType: 'all',
        });
      expect(aangemaakt.status, JSON.stringify(aangemaakt.body)).toBe(201);

      const antwoord = await request(campagneApp)
        .post(`/api/email-campaigns/${aangemaakt.body.id}/send`)
        .set('Authorization', `Bearer ${beheerderToken}`);

      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      const aanLid = verzonden().find((b) => b.to === lid.email)!;
      expect(aanLid.html).toBe(`<p>Beste ${ONTSNAPT} (${ONTSNAPT} Jan $&amp; Co)</p>`);
      expect(aanLid.text).toBe(`Beste ${KWAAD} Jan $& Co`);
    });
  });
});

describe('veiligeLink', () => {
  it.each([
    ['https://tutti.example/a?b=1&c=2', 'https://tutti.example/a?b=1&amp;c=2'],
    ['http://localhost:5173/polls', 'http://localhost:5173/polls'],
  ])('geeft %s ontsnapt terug', (adres, verwacht) => {
    expect(veiligeLink(adres)).toBe(verwacht);
  });

  it.each(['javascript:alert(1)', 'data:text/html,<b>x</b>', 'vbscript:x', '/relatief', ''])('weigert %s', (adres) => {
    expect(veiligeLink(adres)).toBeNull();
  });
});
