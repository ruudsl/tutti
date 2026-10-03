/**
 * Concertkleding inlezen uit een spreadsheet (WP11): routes/importeren.ts en
 * services/importeren/kleding.ts.
 *
 * Wat hier vastligt, naast wat voor elke import geldt (zie
 * importeren-spreadsheet.test.ts):
 * - concertkleding hoort bij de module inventaris: staat die uit, dan bestaat
 *   de route niet;
 * - dezelfde rollen als het aanmaken op de pagina: beheer en muziekcommissie;
 * - een kleurnaam of kleurcode wordt een kleurcode voor de kleurkiezer; een
 *   onbekende kleur gaat niet verloren maar komt in de omschrijving;
 * - er is hooguit één standaardtenue, en een bestaand tenue verandert daar
 *   niet door;
 * - een tenue met dezelfde naam bestaat al; met bijwerken krijgt het de
 *   nieuwe omschrijving, kleur en onderdelen;
 * - de verenigingsgrens: een tenue van een andere vereniging telt niet als
 *   bestaand en wordt niet bijgewerkt.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import importerenRoutes from '../../routes/importeren';
import { errorHandler } from '../../middleware/errorHandler';
import { optionalAuth } from '../../middleware/auth';
import { requireModule } from '../../middleware/requireModule';
import { setModuleEnabled } from '../../modules/service';
import { createTestAssociation, createTestEnvironment, createTestUser } from '../testUtils';
import { leesKleur } from '../../services/importeren/kleding';

// Dezelfde guards als in index.ts.
const app = express();
app.use(express.json({ limit: '10mb' }));
app.use('/api/import/kleding', optionalAuth, requireModule('inventory'));
app.use('/api/import', importerenRoutes);
app.use(errorHandler);

let associationId: string;
let beheerderId: string;
let beheerderToken: string;
let lidToken: string;
let commissieToken: string;

beforeEach(() => {
  const omgeving = createTestEnvironment();
  associationId = omgeving.association.id;
  beheerderId = omgeving.adminUser.id;
  beheerderToken = omgeving.adminToken;
  lidToken = omgeving.memberToken;
  commissieToken = omgeving.musicCommitteeToken;
  setModuleEnabled(associationId, 'inventory', true, beheerderId);
});

const stuur = (token: string, pad: string, csv: string, bijwerken = false) =>
  request(app).post(`/api/import${pad}`).set('Authorization', `Bearer ${token}`).send({ csv, bijwerken });

const tenues = (vereniging = associationId) =>
  db
    .prepare(
      'SELECT name, description, color_code, items, is_default, created_by FROM outfits WHERE association_id = ? ORDER BY sort_order',
    )
    .all(vereniging) as {
    name: string;
    description: string | null;
    color_code: string | null;
    items: string | null;
    is_default: number;
    created_by: string;
  }[];

function maakTenue(vereniging: string, maker: string, naam: string, waarden: Record<string, unknown> = {}) {
  db.prepare(
    `INSERT INTO outfits (id, association_id, name, description, color_code, items, is_default, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    uuidv4(),
    vereniging,
    naam,
    waarden.description ?? null,
    waarden.color_code ?? null,
    waarden.items ?? null,
    waarden.is_default ?? 0,
    maker,
  );
}

describe('concertkleding importeren', () => {
  it('importeert tenues met kleur, onderdelen en standaard', async () => {
    const csv = [
      'Naam;Omschrijving;Kleur;Onderdelen;Standaard',
      'Concerttenue;Voor alle concerten;Donkerblauw;Jas, broek of rok, das;ja',
      'Zomertenue;;#FFF;Polo / Zwarte broek;',
    ].join('\n');

    const antwoord = await stuur(beheerderToken, '/kleding', csv);

    expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);
    expect(antwoord.body.geimporteerd).toBe(2);
    expect(tenues()).toEqual([
      {
        name: 'Concerttenue',
        description: 'Voor alle concerten',
        color_code: '#1b2a49',
        items: JSON.stringify(['Jas', 'broek of rok', 'das']),
        is_default: 1,
        created_by: beheerderId,
      },
      {
        name: 'Zomertenue',
        description: null,
        color_code: '#ffffff',
        items: JSON.stringify(['Polo', 'Zwarte broek']),
        is_default: 0,
        created_by: beheerderId,
      },
    ]);
  });

  it('herkent Engelse en Duitse kolomnamen', async () => {
    const antwoord = await stuur(beheerderToken, '/kleding/voorbeeld', 'Kleidung;Farbe;Teile\nKonzert;schwarz;Sakko');

    expect(antwoord.status).toBe(200);
    expect(antwoord.body.regels[0].gegevens).toMatchObject({
      naam: 'Konzert',
      kleur: '#000000',
      onderdelen: ['Sakko'],
    });
  });

  it('zet een onbekende kleur in de omschrijving, met een waarschuwing', async () => {
    const antwoord = await stuur(beheerderToken, '/kleding', 'Naam;Omschrijving;Kleur\nGala;Lang;Petrol met goud');

    expect(antwoord.status).toBe(201);
    expect(antwoord.body.regels[0].waarschuwingen.join(' ')).toContain('Petrol met goud');
    expect(tenues()[0]).toMatchObject({ color_code: null, description: 'Lang - Kleur: Petrol met goud' });
  });

  it('maakt hooguit één tenue standaard en haalt het oude standaardtenue weg', async () => {
    maakTenue(associationId, beheerderId, 'Oud', { is_default: 1 });

    const antwoord = await stuur(beheerderToken, '/kleding', 'Naam;Standaard\nNieuw A;ja\nNieuw B;ja');

    expect(antwoord.body.regels[1].waarschuwingen.join(' ')).toContain('standaardtenue');
    const standaard = tenues()
      .filter((t) => t.is_default === 1)
      .map((t) => t.name);
    expect(standaard).toEqual(['Nieuw A']);
  });

  it('slaat een bestaand tenue over, en werkt het alleen bij als dat gevraagd is', async () => {
    maakTenue(associationId, beheerderId, 'Concerttenue', { description: 'Oud', items: JSON.stringify(['Jas']) });
    const csv = 'Naam;Omschrijving;Onderdelen;Standaard\nconcerttenue;Nieuw;Jas, das;ja';

    const zonder = await stuur(beheerderToken, '/kleding', csv);
    expect(zonder.body.tellingen).toMatchObject({ nieuw: 0, bestaat: 1 });
    expect(tenues()[0].description).toBe('Oud');

    const voorbeeld = await stuur(beheerderToken, '/kleding/voorbeeld', csv, true);
    expect(voorbeeld.body.regels[0].status).toBe('bijwerken');
    expect(voorbeeld.body.regels[0].wijzigingen).toEqual(
      expect.arrayContaining([{ veld: 'onderdelen', oud: 'Jas', nieuw: 'Jas, das' }]),
    );

    const met = await stuur(beheerderToken, '/kleding', csv, true);
    expect(met.body.bijgewerkt).toBe(1);
    // Standaard verandert de import bij een bestaand tenue niet.
    expect(tenues()).toEqual([
      expect.objectContaining({ description: 'Nieuw', items: JSON.stringify(['Jas', 'das']), is_default: 0 }),
    ]);
  });

  it('kijkt niet naar de tenues van een andere vereniging', async () => {
    const ander = createTestAssociation().id;
    const anderLid = createTestUser(ander, { email: 'beheer@ander.nl', role: 'admin' });
    maakTenue(ander, anderLid.id, 'Concerttenue', { description: 'Van de ander' });

    const antwoord = await stuur(beheerderToken, '/kleding', 'Naam;Omschrijving\nConcerttenue;Van ons', true);

    expect(antwoord.body.tellingen).toMatchObject({ nieuw: 1, bijwerken: 0 });
    expect(tenues(ander)[0].description).toBe('Van de ander');
    expect(tenues()[0].description).toBe('Van ons');
  });

  it('weigert een dubbele naam in het bestand en een regel zonder naam', async () => {
    const antwoord = await stuur(beheerderToken, '/kleding/voorbeeld', 'Naam;Kleur\nGala;zwart\ngala;wit\n;rood');

    expect(antwoord.body.regels.map((r: { status: string }) => r.status)).toEqual(['nieuw', 'fout', 'fout']);
  });

  it('is er voor de muziekcommissie, niet voor een lid', async () => {
    expect((await stuur(commissieToken, '/kleding/voorbeeld', 'Naam\nGala')).status).toBe(200);
    expect((await stuur(lidToken, '/kleding/voorbeeld', 'Naam\nGala')).status).toBe(403);
  });

  it('bestaat niet als de module inventaris uit staat', async () => {
    setModuleEnabled(associationId, 'inventory', false, beheerderId);

    expect((await stuur(beheerderToken, '/kleding/voorbeeld', 'Naam\nGala')).status).toBe(404);
  });
});

describe('kleuren lezen', () => {
  it('leest kleurcodes in elke gangbare vorm en kleurnamen in drie talen', () => {
    expect(leesKleur('#1B2A49')).toBe('#1b2a49');
    expect(leesKleur('1b2a49')).toBe('#1b2a49');
    expect(leesKleur('#abc')).toBe('#aabbcc');
    expect(leesKleur('Bordeauxrood')).toBe('#7b1e2b');
    expect(leesKleur('navy')).toBe('#1b2a49');
    expect(leesKleur('Weiß')).toBe('#ffffff');
    expect(leesKleur('petrol')).toBeUndefined();
  });
});
