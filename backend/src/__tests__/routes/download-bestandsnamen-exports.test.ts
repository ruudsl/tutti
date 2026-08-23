/**
 * De bestandsnaam van de overige downloads: exports van concerten, repertoire,
 * bezoekerslijsten en activiteitenoverzichten.
 *
 * Dezelfde fout als bij bladmuziek (zie download-bestandsnamen.test.ts), maar
 * dan op de ingangen die een concert-, orkest- of queryreekswaarde in de
 * kopregel Content-Disposition zetten. Die werd met de hand samengesteld als
 * `attachment; filename="${naam}"`, en dat ging twee kanten op mis:
 *
 * - Waar de naam ongefilterd doorging (de Buma/Stemra-export en het
 *   activiteitenoverzicht, die allebei een ongecontroleerde datum uit de
 *   queryreeks in de naam zetten) schreef Node het teken als losse byte weg, en
 *   bij een teken boven U+00FF weigerde hij de kopregel helemaal met
 *   ERR_INVALID_CHAR: een foutmelding 500 in plaats van een download.
 * - Waar de naam eerst werd kaalgeslagen (`[^a-zA-Z0-9]` eruit bij het
 *   concertprogramma en het repertoire, `[^a-z0-9]/gi` bij de bezoekerslijst)
 *   klopte de kopregel wel, maar was de informatie weg: "Café Chantant" werd
 *   "Caf__Chantant".
 *
 * Deze suite toetst op de daadwerkelijke kopregel, en eist dat de echte naam in
 * `filename*=UTF-8''...` terugkomt.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import concertsRoutes from '../../routes/concerts';
import interopRoutes from '../../routes/interop';
import ticketsRoutes from '../../routes/tickets';
import analyticsRoutes from '../../routes/analytics';
import { errorHandler } from '../../middleware/errorHandler';
import { clearModuleCache } from '../../modules/service';
import { createTestEnvironment, createTestOrchestra } from '../testUtils';

/**
 * De bestelroutes van kaartverkoop dragen een eigen limiet per IP. Die staat
 * los van waar dit bestand over gaat, en zou de bezoekerslijst-test op een
 * 429 kunnen laten stuklopen.
 */
vi.mock('express-rate-limit', () => ({
  default: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// De mounts volgen index.ts. Kaartverkoop hangt aan /api omdat die router
// paden onder meerdere voorvoegsels bedient.
const app = express();
app.use(express.json());
app.use('/api/concerts', concertsRoutes);
app.use('/api/interop', interopRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api', ticketsRoutes);
app.use(errorHandler);

let beheerderToken: string;
let verenigingId: string;
let beheerderId: string;

beforeEach(() => {
  const omgeving = createTestEnvironment();
  beheerderToken = omgeving.adminToken;
  verenigingId = omgeving.association.id;
  beheerderId = omgeving.adminUser.id;
  zetTicketingAan(verenigingId);
});

/**
 * De module kaartverkoop staat standaard uit en de router draagt de guard
 * zelf; zonder dit antwoordt /concerts/:id/attendees met een 404.
 */
function zetTicketingAan(vanVereniging: string) {
  db.prepare(
    `INSERT INTO association_modules (id, association_id, module_key, enabled, updated_by)
     VALUES (?, ?, 'ticketing', 1, ?)
     ON CONFLICT(association_id, module_key) DO UPDATE SET enabled = 1`,
  ).run(uuidv4(), vanVereniging, beheerderId);
  clearModuleCache();
}

function maakConcert(naam: string, datum = '2026-05-17'): string {
  const id = uuidv4();
  db.prepare(
    `INSERT INTO concerts (id, association_id, name, date, location, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, verenigingId, naam, datum, 'De Harmonie', beheerderId);
  return id;
}

function zetStukInProgramma(concertId: string, titel: string) {
  db.prepare(`INSERT INTO concert_program (id, concert_id, title, sort_order) VALUES (?, ?, ?, 0)`).run(
    uuidv4(),
    concertId,
    titel,
  );
}

/**
 * De naam uit `filename*=UTF-8''...`, de vorm die het niet-ASCII teken draagt.
 *
 * Geeft undefined als die vorm ontbreekt; dat is precies wat er misging.
 */
function gecodeerdeNaam(kopregel: string | undefined): string | undefined {
  const treffer = kopregel?.match(/filename\*=UTF-8''([^;]+)/i);
  if (!treffer) return undefined;
  return decodeURIComponent(treffer[1].trim());
}

describe('het programma van een concert als tekstbestand', () => {
  it('houdt de umlaut in de naam van het concert', async () => {
    const concertId = maakConcert('Frühlingskonzert');
    zetStukInProgramma(concertId, 'Alfa mars');

    const res = await request(app)
      .get(`/api/concerts/${concertId}/program/export`)
      .set('Authorization', `Bearer ${beheerderToken}`);

    expect(res.status).toBe(200);
    // Het kaalslaan maakte hier "Fr_hlingskonzert_programma.txt".
    expect(gecodeerdeNaam(res.headers['content-disposition'])).toBe('Frühlingskonzert_programma.txt');
  });

  it('houdt de tilde in de naam van het concert', async () => {
    const concertId = maakConcert('Noche Española');
    zetStukInProgramma(concertId, 'Alfa mars');

    const res = await request(app)
      .get(`/api/concerts/${concertId}/program/export`)
      .set('Authorization', `Bearer ${beheerderToken}`);

    expect(res.status).toBe(200);
    expect(gecodeerdeNaam(res.headers['content-disposition'])).toBe('Noche Española_programma.txt');
  });
});

describe('de repertoirelijst van een orkest als CSV', () => {
  it('houdt de umlaut in de naam van het orkest', async () => {
    const orkest = createTestOrchestra(verenigingId, { name: 'Jugendblasorchester Grün' });

    const res = await request(app)
      .get(`/api/interop/orchestras/${orkest.id}/repertoire.csv`)
      .set('Authorization', `Bearer ${beheerderToken}`);

    expect(res.status).toBe(200);
    // Het kaalslaan maakte hier "repertoire-Jugendblasorchester_Gr_n.csv".
    expect(gecodeerdeNaam(res.headers['content-disposition'])).toBe('repertoire-Jugendblasorchester Grün.csv');
  });
});

describe('de bezoekerslijst van een concert als CSV', () => {
  it('houdt de tilde in de naam van het concert', async () => {
    const concertId = maakConcert('Noche Española');

    const res = await request(app)
      .get(`/api/concerts/${concertId}/attendees?format=csv`)
      .set('Authorization', `Bearer ${beheerderToken}`);

    expect(res.status).toBe(200);
    // Het kaalslaan maakte hier "attendees-Noche_Espa_ola.csv".
    expect(gecodeerdeNaam(res.headers['content-disposition'])).toBe('attendees-Noche Española.csv');
  });
});

describe('de Buma/Stemra-export', () => {
  /**
   * startDate en endDate komen ongefilterd uit de queryreeks en gaan zo de
   * bestandsnaam in. Dat is geen theoretisch geval: er zit geen datumcontrole
   * tussen, dus elke tekst die de client meestuurt belandt in de kopregel.
   */
  it('levert de export ook bij een teken boven U+00FF in de datum, in plaats van een foutmelding', async () => {
    const concertId = maakConcert('Nieuwjaarsconcert');
    zetStukInProgramma(concertId, 'Alfa mars');

    const res = await request(app)
      .get('/api/concerts/buma-stemra-export')
      .query({ startDate: 'Dvořák', endDate: '2026-12-31' })
      .set('Authorization', `Bearer ${beheerderToken}`);

    // Node weigert zo'n teken in een kopregel met ERR_INVALID_CHAR; ongefilterd
    // werd deze download daardoor een 500.
    expect(res.status).toBe(200);
    expect(gecodeerdeNaam(res.headers['content-disposition'])).toBe('buma_stemra_Dvořák_2026-12-31.csv');
  });

  it('houdt de umlaut heel in plaats van er een vervangingsteken van te maken', async () => {
    const res = await request(app)
      .get('/api/concerts/buma-stemra-export')
      .query({ startDate: 'Frühling', endDate: '2026-12-31' })
      .set('Authorization', `Bearer ${beheerderToken}`);

    expect(res.status).toBe(200);
    expect(gecodeerdeNaam(res.headers['content-disposition'])).toBe('buma_stemra_Frühling_2026-12-31.csv');
  });
});

describe('het activiteitenoverzicht als CSV', () => {
  it('levert het overzicht ook bij een teken boven U+00FF in de datum, in plaats van een foutmelding', async () => {
    const res = await request(app)
      .get('/api/analytics/activity/export')
      .query({ dateFrom: 'Dvořák', dateTo: '2026-12-31' })
      .set('Authorization', `Bearer ${beheerderToken}`);

    expect(res.status).toBe(200);
    expect(gecodeerdeNaam(res.headers['content-disposition'])).toBe(
      'activity-report-member_activity-Dvořák-to-2026-12-31.csv',
    );
  });

  it('houdt de tilde heel in plaats van er een vervangingsteken van te maken', async () => {
    const res = await request(app)
      .get('/api/analytics/activity/export')
      .query({ dateFrom: 'Españita', dateTo: '2026-12-31' })
      .set('Authorization', `Bearer ${beheerderToken}`);

    expect(res.status).toBe(200);
    expect(gecodeerdeNaam(res.headers['content-disposition'])).toBe(
      'activity-report-member_activity-Españita-to-2026-12-31.csv',
    );
  });
});
