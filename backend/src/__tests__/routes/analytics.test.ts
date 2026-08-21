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
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import analyticsRoutes from '../../routes/analytics';
import { errorHandler } from '../../middleware/errorHandler';
import { invalidateAllCache } from '../../middleware/cache';
import {
  addInstrumentToUser,
  createTestEnvironment,
  createTestInstrument,
  createTestMusicPiece,
  createTestUser,
  generateTestToken,
} from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api', rateLimit({ windowMs: 60_000, limit: 10_000 }));
app.use('/api/analytics', analyticsRoutes);
app.use(errorHandler);

let adminToken: string;
let memberToken: string;
let associationId: string;
let adminId: string;

beforeEach(() => {
  const omgeving = createTestEnvironment();
  adminToken = omgeving.adminToken;
  memberToken = omgeving.memberToken;
  associationId = omgeving.association.id;
  adminId = omgeving.adminUser.id;
  // De overzichten zitten achter een cache van drie minuten die per
  // vereniging varieert. Elke test maakt een nieuwe vereniging aan, maar een
  // schone cache voorkomt dat een test ooit het antwoord van een vorige leest.
  invalidateAllCache();
});

const alsAdmin = (pad: string) => request(app).get(`/api/analytics${pad}`).set('Authorization', `Bearer ${adminToken}`);

/** Een datum een aantal dagen vanaf vandaag, als YYYY-MM-DD. */
function overDagen(aantal: number): string {
  const datum = new Date();
  datum.setDate(datum.getDate() + aantal);
  return datum.toISOString().split('T')[0];
}

function logActiviteit(userId: string, actie: string, soort: string, entiteitId: string): void {
  db.prepare('INSERT INTO activity_log (id, user_id, action_type, entity_type, entity_id) VALUES (?, ?, ?, ?, ?)').run(
    uuidv4(),
    userId,
    actie,
    soort,
    entiteitId,
  );
}

function maakRepetitie(datum: string): string {
  const id = uuidv4();
  db.prepare(
    `INSERT INTO rehearsals (id, association_id, date, start_time, end_time, type)
     VALUES (?, ?, ?, '19:30', '21:30', 'regular')`,
  ).run(id, associationId, datum);
  return id;
}

function maakAanwezigheid(rehearsalId: string, userId: string, status: 'accepted' | 'declined'): void {
  db.prepare(
    'INSERT INTO rehearsal_attendance (id, rehearsal_id, user_id, member_name, status) VALUES (?, ?, ?, ?, ?)',
  ).run(uuidv4(), rehearsalId, userId, 'Speler', status);
}

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

describe('Verwijderde inhoud in het inhoudsoverzicht', () => {
  it('noemt een stuk dat geraadpleegd is', async () => {
    const stuk = createTestMusicPiece(associationId, { title: 'Mars der Medici' });
    logActiviteit(adminId, 'view', 'music_piece', stuk.id);

    const res = await alsAdmin('/activity/by-content');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.content.map((c: { contentTitle: string }) => c.contentTitle)).toContain('Mars der Medici');
  });

  it('laat een verwijderd stuk weg uit het inhoudsoverzicht', async () => {
    // De route filtert op een lege titel met de opmerking "Filter out deleted
    // content". Dat werkt alleen bij een echt verwijderde rij; muziekstukken
    // worden hier zacht verwijderd, dus de titel staat er nog gewoon en het
    // stuk bleef in het overzicht staan alsof het nog in de bibliotheek zat.
    const stuk = createTestMusicPiece(associationId, { title: 'Mars der Medici' });
    logActiviteit(adminId, 'view', 'music_piece', stuk.id);
    db.prepare('UPDATE music_pieces SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?').run(stuk.id);

    const res = await alsAdmin('/activity/by-content');
    expect(res.status).toBe(200);
    expect(res.body.content.map((c: { contentTitle: string }) => c.contentTitle)).not.toContain('Mars der Medici');
  });

  it('laat een verwijderd stuk ook uit de CSV-export weg', async () => {
    const stuk = createTestMusicPiece(associationId, { title: 'Mars der Medici' });
    logActiviteit(adminId, 'download', 'music_piece', stuk.id);
    db.prepare('UPDATE music_pieces SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?').run(stuk.id);

    const res = await alsAdmin('/activity/export?reportType=content_activity');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Mars der Medici');
  });
});

describe('Verwachte opkomst', () => {
  it('kijkt voor de sectiebezetting alleen naar de laatste drie maanden', async () => {
    // De sectiegemiddelden hingen aan een LEFT JOIN met de datumgrens in de
    // ON-clausule. Zo'n voorwaarde gooit de rij niet weg maar maakt alleen de
    // kolommen van de repetitie leeg; de aanwezigheidsrij zelf telt gewoon
    // mee. Afmeldingen van een jaar geleden drukten daardoor het gemiddelde
    // van vandaag, en het scherm meldde secties als onderbezet die dat niet
    // zijn.
    const instrument = createTestInstrument({ name: `Hoorn-${uuidv4().slice(0, 8)}` });
    const spelers = [1, 2].map((n) => {
      const speler = createTestUser(associationId, { email: `hoorn-${n}-${uuidv4()}@test.nl` });
      addInstrumentToUser(speler.id, instrument.id);
      return speler;
    });

    // Binnen het venster: iedereen aanwezig.
    const recent = maakRepetitie(overDagen(-20));
    spelers.forEach((s) => maakAanwezigheid(recent, s.id, 'accepted'));

    // Ver buiten het venster: iedereen afgemeld. Dit hoort niet mee te tellen.
    [-200, -220, -240].forEach((dagen) => {
      const oud = maakRepetitie(overDagen(dagen));
      spelers.forEach((s) => maakAanwezigheid(oud, s.id, 'declined'));
    });

    // Zonder een repetitie in de toekomst valt er niets te voorspellen.
    maakRepetitie(overDagen(7));

    const res = await alsAdmin('/attendance/predictions');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].understaffedSections.map((s: { instrument: string }) => s.instrument)).not.toContain(
      instrument.name,
    );
  });
});
