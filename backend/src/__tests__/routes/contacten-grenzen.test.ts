/**
 * Contacten: de randen van de route.
 *
 * contacts.test.ts loopt de gelukkige paden af. Dit bestand gaat over wat
 * daarnaast in de route staat en niet werd aangeraakt: de filters op het
 * overzicht, de categorieen, de contactpersonen, het verwijderen van iets
 * waar nog iets aan hangt, en het promoveren van een contact tot gebruiker.
 *
 * De rode draad is dezelfde als bij de leden. Een contact is een dossier met
 * persoonsgegevens - naam, e-mail, telefoon, IBAN - en die horen binnen een
 * vereniging te blijven. Elke plek waar de route een verwijzing uit het
 * verzoek overneemt zonder te kijken van wie hij is, is een gat in die grens.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import '../setup';
import db from '../../database/connection';
import contactsRoutes from '../../routes/contacts';
import { errorHandler } from '../../middleware/errorHandler';
import {
  createTestAssociation,
  createTestUser,
  generateTestToken,
  createTestEnvironment,
  TestAssociation,
} from '../testUtils';

// Zelfde geheim als in setup.ts en testUtils.ts. Nodig omdat testUtils geen
// token kan maken voor een gebruiker zonder vereniging.
const JWT_SECRET = 'test-jwt-secret-for-testing-must-be-at-least-32-characters';

const app = express();
app.use(express.json());
app.use('/api', rateLimit({ windowMs: 60_000, limit: 10_000 }));
app.use('/api/contacts', contactsRoutes);
app.use(errorHandler);

type Methode = 'get' | 'post' | 'put' | 'patch' | 'delete';

let adminToken: string;
let memberToken: string;
let commissieToken: string;
let associationId: string;

beforeEach(() => {
  const omgeving = createTestEnvironment();
  adminToken = omgeving.adminToken;
  memberToken = omgeving.memberToken;
  commissieToken = omgeving.musicCommitteeToken;
  associationId = omgeving.association.id;
});

const alsAdmin = (methode: Methode, pad: string) =>
  request(app)[methode](`/api/contacts${pad}`).set('Authorization', `Bearer ${adminToken}`);

const alsLid = (methode: Methode, pad: string) =>
  request(app)[methode](`/api/contacts${pad}`).set('Authorization', `Bearer ${memberToken}`);

const alsCommissie = (methode: Methode, pad: string) =>
  request(app)[methode](`/api/contacts${pad}`).set('Authorization', `Bearer ${commissieToken}`);

async function maakContact(overschrijf: Record<string, unknown> = {}) {
  const res = await alsAdmin('post', '/').send({
    contactType: 'venue',
    name: 'Concertzaal De Notenbalk',
    ...overschrijf,
  });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

async function maakCategorie(naam: string, extra: Record<string, unknown> = {}) {
  const res = await alsAdmin('post', '/categories').send({ name: naam, ...extra });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

/** Een tweede vereniging met een eigen beheerder, om de grens mee te testen. */
function andereVereniging(kenmerk: string): { vereniging: TestAssociation; token: string; beheerderId: string } {
  const vereniging = createTestAssociation();
  const beheerder = createTestUser(vereniging.id, {
    email: `beheerder-${kenmerk}-${uuidv4().slice(0, 8)}@test.com`,
    role: 'admin',
  });
  return { vereniging, token: generateTestToken(beheerder), beheerderId: beheerder.id };
}

// =====================================================
// OVERZICHT EN FILTERS
// =====================================================

describe('Het overzicht filteren', () => {
  it('filtert op soort contact', async () => {
    await maakContact({ contactType: 'venue', name: 'De Notenbalk' });
    await maakContact({ contactType: 'vendor', name: 'Bladmuziek BV' });

    const res = await alsAdmin('get', '/?type=vendor');
    expect(res.status).toBe(200);
    expect(res.body.map((c: { name: string }) => c.name)).toEqual(['Bladmuziek BV']);
  });

  it('filtert op actief en inactief', async () => {
    const actief = await maakContact({ name: 'Nog in gebruik' });
    const inactief = await maakContact({ name: 'Uit de tijd' });
    expect((await alsAdmin('post', `/${inactief}/deactivate`)).status).toBe(200);

    const aan = await alsAdmin('get', '/?active=true');
    expect(aan.body.map((c: { id: string }) => c.id)).toEqual([actief]);

    const uit = await alsAdmin('get', '/?active=false');
    expect(uit.body.map((c: { id: string }) => c.id)).toEqual([inactief]);
  });

  it('zoekt op naam, plaats en contactpersoon', async () => {
    await maakContact({ name: 'Zaal Amsterdam', city: 'Amsterdam', contactPerson: 'Jansen' });
    await maakContact({ name: 'Zaal Zwolle', city: 'Zwolle', contactPerson: 'Pietersen' });

    const opPlaats = await alsAdmin('get', '/?search=zwol');
    expect(opPlaats.body.map((c: { name: string }) => c.name)).toEqual(['Zaal Zwolle']);

    const opPersoon = await alsAdmin('get', '/?search=jansen');
    expect(opPersoon.body.map((c: { name: string }) => c.name)).toEqual(['Zaal Amsterdam']);
  });

  it('filtert op categorie', async () => {
    const zalen = await maakCategorie('Zalen');
    const meeInDeCategorie = await maakContact({ name: 'Met categorie', categoryIds: [zalen] });
    await maakContact({ name: 'Zonder categorie' });

    const res = await alsAdmin('get', `/?category=${zalen}`);
    expect(res.status).toBe(200);
    expect(res.body.map((c: { id: string }) => c.id)).toEqual([meeInDeCategorie]);
    expect(res.body[0].categories.map((c: { name: string }) => c.name)).toEqual(['Zalen']);
  });

  it('toont een verwijderd contact niet meer in het overzicht', async () => {
    const id = await maakContact({ name: 'Weggehaald' });
    expect((await alsAdmin('delete', `/${id}`)).status).toBe(200);

    const res = await alsAdmin('get', '/');
    expect(res.body.map((c: { id: string }) => c.id)).not.toContain(id);
    expect((await alsAdmin('get', `/${id}`)).status).toBe(404);
  });

  it('toont in het overzicht geen contacten van een andere vereniging', async () => {
    await maakContact({ name: 'Van ons' });
    const hun = andereVereniging('overzicht');
    await request(app)
      .post('/api/contacts/')
      .set('Authorization', `Bearer ${hun.token}`)
      .send({ contactType: 'venue', name: 'Van hen' });

    const res = await alsAdmin('get', '/');
    const namen = res.body.map((c: { name: string }) => c.name);
    expect(namen).toContain('Van ons');
    expect(namen).not.toContain('Van hen');
  });
});

// =====================================================
// CATEGORIEEN
// =====================================================

describe('Categorieen beheren', () => {
  it('weigert een tweede categorie met dezelfde naam, ongeacht hoofdletters', async () => {
    await maakCategorie('Zalen');

    const res = await alsAdmin('post', '/categories').send({ name: 'zALEN' });
    expect(res.status).toBe(409);
  });

  it('werkt een categorie bij', async () => {
    const id = await maakCategorie('Zalen', { color: '#111111', icon: 'huis', sortOrder: 3 });

    const res = await alsAdmin('put', `/categories/${id}`).send({
      name: 'Concertzalen',
      color: '#222222',
      icon: 'podium',
      sortOrder: 1,
    });
    expect(res.status).toBe(200);

    const lijst = await alsAdmin('get', '/categories');
    const bijgewerkt = lijst.body.find((c: { id: string }) => c.id === id);
    expect(bijgewerkt).toMatchObject({ name: 'Concertzalen', color: '#222222', icon: 'podium', sortOrder: 1 });
  });

  it('weigert een naam die een andere categorie al heeft', async () => {
    await maakCategorie('Zalen');
    const leveranciers = await maakCategorie('Leveranciers');

    const res = await alsAdmin('put', `/categories/${leveranciers}`).send({ name: 'Zalen' });
    expect(res.status).toBe(409);
  });

  it('laat een categorie zijn eigen naam houden', async () => {
    // De controle op dubbele namen moet de categorie zelf overslaan, anders
    // kan een categorie niet bijgewerkt worden zonder te hernoemen.
    const id = await maakCategorie('Zalen');

    const res = await alsAdmin('put', `/categories/${id}`).send({ name: 'Zalen', color: '#333333' });
    expect(res.status).toBe(200);
  });

  it('meldt netjes dat een onbekende categorie niet bestaat', async () => {
    expect((await alsAdmin('put', `/categories/${uuidv4()}`).send({ name: 'Iets' })).status).toBe(404);
    expect((await alsAdmin('delete', `/categories/${uuidv4()}`)).status).toBe(404);
  });

  it('laat de categorie van een andere vereniging niet wijzigen of verwijderen', async () => {
    const id = await maakCategorie('Zalen');
    const hun = andereVereniging('categorie');

    const wijzigen = await request(app)
      .put(`/api/contacts/categories/${id}`)
      .set('Authorization', `Bearer ${hun.token}`)
      .send({ name: 'Overgenomen' });
    expect(wijzigen.status).toBe(404);

    const verwijderen = await request(app)
      .delete(`/api/contacts/categories/${id}`)
      .set('Authorization', `Bearer ${hun.token}`);
    expect(verwijderen.status).toBe(404);

    const rij = db.prepare('SELECT name FROM contact_categories WHERE id = ?').get(id) as { name: string };
    expect(rij.name).toBe('Zalen');
  });

  it('laat een gewoon lid de categorieen wel zien maar niet aanmaken of wijzigen', async () => {
    const id = await maakCategorie('Zalen');

    expect((await alsLid('get', '/categories')).status).toBe(200);
    expect((await alsLid('post', '/categories').send({ name: 'Stiekem' })).status).toBe(403);
    expect((await alsLid('put', `/categories/${id}`).send({ name: 'Stiekem' })).status).toBe(403);
    expect((await alsLid('delete', `/categories/${id}`)).status).toBe(403);
  });

  it('laat alleen een beheerder een categorie verwijderen, geen muziekcommissie', async () => {
    // Aanmaken en wijzigen mag de muziekcommissie wel; verwijderen niet.
    const id = await maakCategorie('Zalen');

    expect((await alsCommissie('put', `/categories/${id}`).send({ name: 'Hernoemd' })).status).toBe(200);
    expect((await alsCommissie('delete', `/categories/${id}`)).status).toBe(403);
    expect((await alsAdmin('delete', `/categories/${id}`)).status).toBe(200);
  });

  it('verwijdert een categorie waar nog contacten aan hangen zonder die contacten mee te nemen', async () => {
    // De koppeltabel valt weg met de categorie (ON DELETE CASCADE); het
    // contact zelf hoort te blijven staan. Dat is het gedrag waar de rest van
    // de applicatie op rekent, dus het staat hier vast.
    const zalen = await maakCategorie('Zalen');
    const contact = await maakContact({ name: 'Blijft bestaan', categoryIds: [zalen] });

    expect((await alsAdmin('delete', `/categories/${zalen}`)).status).toBe(200);

    const na = await alsAdmin('get', `/${contact}`);
    expect(na.status).toBe(200);
    expect(na.body.categories).toEqual([]);
    expect(db.prepare('SELECT COUNT(*) AS n FROM contact_category_links WHERE contact_id = ?').get(contact)).toEqual({
      n: 0,
    });
  });
});

describe('Categorieen van een andere vereniging aan een contact hangen', () => {
  // BEWIJS. De route nam categoryIds ongezien over uit het verzoek en zette
  // er een rij in contact_category_links mee. De vreemde sleutel wijst naar
  // contact_categories zonder vereniging, dus de database liet het toe: een
  // beheerder van A kon een categorie van B aan zijn eigen contact hangen, en
  // las daarna via GET /:id de naam en kleur van die categorie uit. Een naam
  // als "Wanbetalers" of "Niet meer boeken" zegt genoeg.
  //
  // Zonder de reparatie in contacts.ts geven beide tests hieronder 201/200 en
  // staat de vreemde categorie in het antwoord; met de reparatie 404.

  it('weigert bij het aanmaken een categorie van een andere vereniging', async () => {
    const hun = andereVereniging('cat-aanmaken');
    const hunCategorie = uuidv4();
    db.prepare('INSERT INTO contact_categories (id, association_id, name) VALUES (?, ?, ?)').run(
      hunCategorie,
      hun.vereniging.id,
      'Wanbetalers',
    );

    const res = await alsAdmin('post', '/').send({
      contactType: 'venue',
      name: 'Zaal met vreemde categorie',
      categoryIds: [hunCategorie],
    });

    expect(res.status).toBe(404);
    expect(db.prepare('SELECT COUNT(*) AS n FROM contact_category_links').get()).toEqual({ n: 0 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM contacts WHERE association_id = ?').get(associationId)).toEqual({
      n: 0,
    });
  });

  it('weigert bij het bijwerken een categorie van een andere vereniging', async () => {
    const id = await maakContact();
    const hun = andereVereniging('cat-bijwerken');
    const hunCategorie = uuidv4();
    db.prepare('INSERT INTO contact_categories (id, association_id, name) VALUES (?, ?, ?)').run(
      hunCategorie,
      hun.vereniging.id,
      'Niet meer boeken',
    );

    const res = await alsAdmin('patch', `/${id}`).send({ categoryIds: [hunCategorie] });

    expect(res.status).toBe(404);
    const na = await alsAdmin('get', `/${id}`);
    expect(na.body.categories).toEqual([]);
  });

  it('laat een eigen categorie bij het bijwerken gewoon toe en vervangt de oude', async () => {
    const zalen = await maakCategorie('Zalen');
    const leveranciers = await maakCategorie('Leveranciers');
    const id = await maakContact({ categoryIds: [zalen] });

    const res = await alsAdmin('patch', `/${id}`).send({ categoryIds: [leveranciers] });
    expect(res.status).toBe(200);

    const na = await alsAdmin('get', `/${id}`);
    expect(na.body.categories.map((c: { name: string }) => c.name)).toEqual(['Leveranciers']);
  });

  it('maakt een contact los van al zijn categorieen met een lege lijst', async () => {
    const zalen = await maakCategorie('Zalen');
    const id = await maakContact({ categoryIds: [zalen] });

    expect((await alsAdmin('patch', `/${id}`).send({ categoryIds: [] })).status).toBe(200);

    const na = await alsAdmin('get', `/${id}`);
    expect(na.body.categories).toEqual([]);
  });
});

// =====================================================
// CONTACTGEGEVENS
// =====================================================

describe('Een contact aanmaken en bijwerken', () => {
  it('weigert een onmogelijk e-mailadres en een onmogelijke website', async () => {
    expect((await alsAdmin('post', '/').send({ contactType: 'venue', name: 'Zaal', email: 'geen adres' })).status).toBe(
      400,
    );
    expect(
      (await alsAdmin('post', '/').send({ contactType: 'venue', name: 'Zaal', website: 'niet-eens-een-url' })).status,
    ).toBe(400);
  });

  it('neemt een leeg e-mailadres en een lege website aan als niets ingevuld', async () => {
    const res = await alsAdmin('post', '/').send({
      contactType: 'venue',
      name: 'Zaal zonder web',
      email: '',
      website: '',
    });
    expect(res.status).toBe(201);

    const na = await alsAdmin('get', `/${res.body.id}`);
    expect(na.body.email).toBeNull();
    expect(na.body.website).toBeNull();
  });

  it('zet het land op NL als er geen land is opgegeven', async () => {
    const id = await maakContact();

    const na = await alsAdmin('get', `/${id}`);
    expect(na.body.country).toBe('NL');
  });

  it('bewaart de zakelijke velden en geeft ze terug', async () => {
    const id = await maakContact({
      contactType: 'vendor',
      name: 'Bladmuziek BV',
      contactPerson: 'Jansen',
      email: 'info@bladmuziek.example',
      phone: '0201234567',
      mobile: '0612345678',
      addressLine: 'Muziekstraat 1',
      postalCode: '1000 AA',
      city: 'Amsterdam',
      country: 'BE',
      iban: 'NL91ABNA0417164300',
      ibanHolderName: 'Bladmuziek BV',
      bic: 'ABNANL2A',
      vatNumber: 'NL001234567B01',
      chamberOfCommerce: '12345678',
      website: 'https://bladmuziek.example',
      notes: 'Levert binnen een week.',
    });

    const res = await alsAdmin('get', `/${id}`);
    expect(res.body).toMatchObject({
      contactType: 'vendor',
      contactPerson: 'Jansen',
      iban: 'NL91ABNA0417164300',
      bic: 'ABNANL2A',
      vatNumber: 'NL001234567B01',
      chamberOfCommerce: '12345678',
      city: 'Amsterdam',
      country: 'BE',
      isActive: true,
    });
  });

  it('wist een veld als er een lege waarde wordt meegestuurd', async () => {
    const id = await maakContact({ phone: '0201234567', notes: 'Iets' });

    expect((await alsAdmin('patch', `/${id}`).send({ phone: '', notes: '' })).status).toBe(200);

    const na = await alsAdmin('get', `/${id}`);
    expect(na.body.phone).toBeNull();
    expect(na.body.notes).toBeNull();
  });

  it('meldt netjes dat een onbekend contact niet bijgewerkt of verwijderd kan worden', async () => {
    expect((await alsAdmin('patch', `/${uuidv4()}`).send({ name: 'Iets' })).status).toBe(404);
    expect((await alsAdmin('delete', `/${uuidv4()}`)).status).toBe(404);
    expect((await alsAdmin('post', `/${uuidv4()}/activate`)).status).toBe(404);
    expect((await alsAdmin('post', `/${uuidv4()}/deactivate`)).status).toBe(404);
  });

  it('laat een verwijderd contact niet nogmaals bewerken', async () => {
    const id = await maakContact();
    expect((await alsAdmin('delete', `/${id}`)).status).toBe(200);

    expect((await alsAdmin('patch', `/${id}`).send({ name: 'Terug' })).status).toBe(404);
    expect((await alsAdmin('delete', `/${id}`)).status).toBe(404);
    expect((await alsAdmin('post', `/${id}/activate`)).status).toBe(404);
  });

  it('laat een gewoon lid geen contact verwijderen of op inactief zetten', async () => {
    const id = await maakContact();

    expect((await alsLid('delete', `/${id}`)).status).toBe(403);
    expect((await alsLid('post', `/${id}/deactivate`)).status).toBe(403);
  });

  it('laat de muziekcommissie wel bewerken maar niet verwijderen', async () => {
    const id = await maakContact();

    expect((await alsCommissie('patch', `/${id}`).send({ name: 'Door de commissie' })).status).toBe(200);
    expect((await alsCommissie('delete', `/${id}`)).status).toBe(403);
  });

  it('laat het contact van een andere vereniging niet verwijderen of deactiveren', async () => {
    const id = await maakContact();
    const hun = andereVereniging('verwijderen');

    const verwijderen = await request(app).delete(`/api/contacts/${id}`).set('Authorization', `Bearer ${hun.token}`);
    expect(verwijderen.status).toBe(404);

    const deactiveren = await request(app)
      .post(`/api/contacts/${id}/deactivate`)
      .set('Authorization', `Bearer ${hun.token}`);
    expect(deactiveren.status).toBe(404);

    const rij = db.prepare('SELECT deleted_at, is_active FROM contacts WHERE id = ?').get(id) as {
      deleted_at: string | null;
      is_active: number;
    };
    expect(rij.deleted_at).toBeNull();
    expect(rij.is_active).toBe(1);
  });
});

// =====================================================
// CONTACTPERSONEN
// =====================================================

describe('Contactpersonen', () => {
  it('voegt een contactpersoon toe en toont hem bij het contact', async () => {
    const id = await maakContact({ contactType: 'organization', name: 'Muziekbond' });

    const res = await alsAdmin('post', `/${id}/persons`).send({
      name: 'Anna de Vries',
      role: 'Programmeur',
      email: 'anna@muziekbond.example',
      phone: '0301234567',
      notes: 'Bereikbaar op dinsdag.',
    });
    expect(res.status).toBe(201);

    const bijContact = await alsAdmin('get', `/${id}`);
    expect(bijContact.body.contactPersons).toHaveLength(1);
    expect(bijContact.body.contactPersons[0]).toMatchObject({
      name: 'Anna de Vries',
      role: 'Programmeur',
      isPrimary: false,
    });

    const losseLijst = await alsAdmin('get', `/${id}/persons`);
    expect(losseLijst.status).toBe(200);
    expect(losseLijst.body.map((p: { name: string }) => p.name)).toEqual(['Anna de Vries']);
  });

  it('weigert een contactpersoon zonder naam of met een onmogelijk e-mailadres', async () => {
    const id = await maakContact();

    expect((await alsAdmin('post', `/${id}/persons`).send({ name: '' })).status).toBe(400);
    expect((await alsAdmin('post', `/${id}/persons`).send({ name: 'Anna', email: 'krom' })).status).toBe(400);
  });

  it('laat maar een contactpersoon tegelijk de eerste zijn', async () => {
    const id = await maakContact();
    const eerste = await alsAdmin('post', `/${id}/persons`).send({ name: 'Anna', isPrimary: true });
    const tweede = await alsAdmin('post', `/${id}/persons`).send({ name: 'Bram', isPrimary: true });
    expect(tweede.status).toBe(201);

    const na = await alsAdmin('get', `/${id}/persons`);
    const primair = na.body.filter((p: { isPrimary: boolean }) => p.isPrimary);
    expect(primair.map((p: { name: string }) => p.name)).toEqual(['Bram']);
    expect(eerste.body.id).toBeTruthy();
  });

  it('zet bij het bijwerken de vorige eerste contactpersoon terug', async () => {
    const id = await maakContact();
    await alsAdmin('post', `/${id}/persons`).send({ name: 'Anna', isPrimary: true });
    const bram = await alsAdmin('post', `/${id}/persons`).send({ name: 'Bram' });

    const res = await alsAdmin('put', `/${id}/persons/${bram.body.id}`).send({
      name: 'Bram Bakker',
      role: 'Techniek',
      email: 'bram@example.com',
      phone: '0612345678',
      isPrimary: true,
      notes: 'Alleen avonds.',
    });
    expect(res.status).toBe(200);

    const na = await alsAdmin('get', `/${id}/persons`);
    expect(na.body.filter((p: { isPrimary: boolean }) => p.isPrimary).map((p: { name: string }) => p.name)).toEqual([
      'Bram Bakker',
    ]);
  });

  it('meldt netjes dat een onbekend contact of een onbekende contactpersoon niet bestaat', async () => {
    const id = await maakContact();
    const onbekend = uuidv4();

    expect((await alsAdmin('get', `/${onbekend}/persons`)).status).toBe(404);
    expect((await alsAdmin('post', `/${onbekend}/persons`).send({ name: 'Anna' })).status).toBe(404);
    expect((await alsAdmin('put', `/${onbekend}/persons/${uuidv4()}`).send({ name: 'Anna' })).status).toBe(404);
    expect((await alsAdmin('delete', `/${onbekend}/persons/${uuidv4()}`)).status).toBe(404);

    expect((await alsAdmin('put', `/${id}/persons/${uuidv4()}`).send({ name: 'Anna' })).status).toBe(404);
    expect((await alsAdmin('delete', `/${id}/persons/${uuidv4()}`)).status).toBe(404);
  });

  it('verwijdert een contactpersoon', async () => {
    const id = await maakContact();
    const anna = await alsAdmin('post', `/${id}/persons`).send({ name: 'Anna' });

    expect((await alsAdmin('delete', `/${id}/persons/${anna.body.id}`)).status).toBe(200);
    expect((await alsAdmin('get', `/${id}/persons`)).body).toEqual([]);
  });

  it('neemt de contactpersonen van een verwijderd contact mee uit beeld', async () => {
    // Het contact wordt zacht verwijderd; de contactpersonen blijven in de
    // database staan maar horen niet meer opvraagbaar te zijn.
    const id = await maakContact();
    const anna = await alsAdmin('post', `/${id}/persons`).send({ name: 'Anna' });
    expect((await alsAdmin('delete', `/${id}`)).status).toBe(200);

    expect((await alsAdmin('get', `/${id}/persons`)).status).toBe(404);
    expect((await alsAdmin('post', `/${id}/persons`).send({ name: 'Bram' })).status).toBe(404);
    expect((await alsAdmin('delete', `/${id}/persons/${anna.body.id}`)).status).toBe(404);
  });

  it('laat de contactpersonen van een andere vereniging niet zien of wijzigen', async () => {
    // Een contactpersoon is een mens met een naam, e-mailadres en telefoon.
    const id = await maakContact({ contactType: 'organization', name: 'Muziekbond' });
    const anna = await alsAdmin('post', `/${id}/persons`).send({ name: 'Anna de Vries', email: 'anna@example.com' });
    const hun = andereVereniging('personen');

    const lezen = await request(app).get(`/api/contacts/${id}/persons`).set('Authorization', `Bearer ${hun.token}`);
    expect(lezen.status).toBe(404);

    const wijzigen = await request(app)
      .put(`/api/contacts/${id}/persons/${anna.body.id}`)
      .set('Authorization', `Bearer ${hun.token}`)
      .send({ email: 'overgenomen@example.com' });
    expect(wijzigen.status).toBe(404);

    const verwijderen = await request(app)
      .delete(`/api/contacts/${id}/persons/${anna.body.id}`)
      .set('Authorization', `Bearer ${hun.token}`);
    expect(verwijderen.status).toBe(404);

    const rij = db.prepare('SELECT email FROM contact_persons WHERE id = ?').get(anna.body.id) as { email: string };
    expect(rij.email).toBe('anna@example.com');
  });

  it('laat een gewoon lid geen contactpersoon toevoegen of verwijderen', async () => {
    const id = await maakContact();
    const anna = await alsAdmin('post', `/${id}/persons`).send({ name: 'Anna' });

    expect((await alsLid('post', `/${id}/persons`).send({ name: 'Stiekem' })).status).toBe(403);
    expect((await alsLid('put', `/${id}/persons/${anna.body.id}`).send({ name: 'Stiekem' })).status).toBe(403);
    expect((await alsLid('delete', `/${id}/persons/${anna.body.id}`)).status).toBe(403);
  });
});

// =====================================================
// PROMOVEREN TOT GEBRUIKER
// =====================================================

describe('Een contact tot gebruiker maken', () => {
  async function maakPersoon(email = 'nieuw.lid@example.com') {
    return maakContact({ contactType: 'person', name: 'Nieuw Lid', email });
  }

  it('maakt van een persoon-contact een gebruiker met een tijdelijk wachtwoord', async () => {
    const id = await maakPersoon();

    const res = await alsAdmin('post', `/${id}/promote`);
    expect(res.status).toBe(201);
    expect(res.body.email).toBe('nieuw.lid@example.com');
    expect(typeof res.body.tempPassword).toBe('string');
    expect(res.body.tempPassword.length).toBeGreaterThan(0);

    const gebruiker = db
      .prepare('SELECT first_name, last_name, role, status, association_id FROM users WHERE id = ?')
      .get(res.body.userId) as Record<string, unknown>;
    expect(gebruiker).toMatchObject({
      first_name: 'Nieuw',
      last_name: 'Lid',
      role: 'member',
      status: 'pending',
      association_id: associationId,
    });
  });

  it('zet de nieuwe gebruiker in de eigen vereniging, niet in die van het contact', async () => {
    const id = await maakPersoon();
    const res = await alsAdmin('post', `/${id}/promote`);

    const gebruiker = db.prepare('SELECT association_id FROM users WHERE id = ?').get(res.body.userId) as {
      association_id: string;
    };
    expect(gebruiker.association_id).toBe(associationId);
  });

  it('gebruikt de hele naam als achternaam als er maar een woord staat', async () => {
    const id = await maakContact({ contactType: 'person', name: 'Prince', email: 'prince@example.com' });

    const res = await alsAdmin('post', `/${id}/promote`);
    expect(res.status).toBe(201);

    const gebruiker = db.prepare('SELECT first_name, last_name FROM users WHERE id = ?').get(res.body.userId) as {
      first_name: string;
      last_name: string;
    };
    expect(gebruiker.first_name).toBe('Prince');
    expect(gebruiker.last_name).toBe('');
  });

  it('weigert een contact zonder e-mailadres', async () => {
    const id = await maakContact({ contactType: 'person', name: 'Naamloos Adres' });

    const res = await alsAdmin('post', `/${id}/promote`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/e-mailadres/i);
  });

  it('weigert een zaal of leverancier', async () => {
    const zaal = await maakContact({ contactType: 'venue', name: 'De Notenbalk', email: 'zaal@example.com' });

    const res = await alsAdmin('post', `/${zaal}/promote`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/persoon/i);
  });

  it('weigert een e-mailadres dat al bij een gebruiker hoort', async () => {
    const id = await maakContact({ contactType: 'person', name: 'Dubbel Adres', email: 'admin@test.com' });

    const res = await alsAdmin('post', `/${id}/promote`);
    expect(res.status).toBe(409);
  });

  it('meldt netjes dat een onbekend contact niet bestaat', async () => {
    expect((await alsAdmin('post', `/${uuidv4()}/promote`)).status).toBe(404);
  });

  it('laat alleen een beheerder promoveren', async () => {
    const id = await maakPersoon();

    expect((await alsLid('post', `/${id}/promote`)).status).toBe(403);
    expect((await alsCommissie('post', `/${id}/promote`)).status).toBe(403);
  });

  it('promoveert geen contact van een andere vereniging', async () => {
    const id = await maakPersoon();
    const hun = andereVereniging('promoveren');

    const res = await request(app).post(`/api/contacts/${id}/promote`).set('Authorization', `Bearer ${hun.token}`);
    expect(res.status).toBe(404);
    expect(db.prepare('SELECT COUNT(*) AS n FROM users WHERE email = ?').get('nieuw.lid@example.com')).toEqual({
      n: 0,
    });
  });

  it('promoveert een contact niet twee keer', async () => {
    // BEWIJS. De route haalde het contact op met
    // `SELECT id, name, email, contact_type` en toetste daarna
    // `contact.promoted_to_user_id`. Die kolom stond niet in de SELECT, dus
    // was hij altijd undefined en werd de controle nooit uitgevoerd.
    //
    // Dat viel niet op omdat een tweede poging meestal alsnog strandt op de
    // controle op een bestaand e-mailadres. Verandert het e-mailadres van het
    // contact tussendoor - een verhuizing, een nieuwe werkgever - dan valt die
    // vangnetcontrole weg en levert dezelfde persoon twee gebruikersaccounts
    // op, waarvan er een niet meer aan het contact hangt en dus door niemand
    // wordt opgeruimd.
    //
    // Zonder de reparatie in contacts.ts geeft de tweede promotie 201 en
    // staan er twee gebruikers; met de reparatie 400.
    const id = await maakPersoon('eerste.adres@example.com');

    const eerste = await alsAdmin('post', `/${id}/promote`);
    expect(eerste.status).toBe(201);

    expect((await alsAdmin('patch', `/${id}`).send({ email: 'tweede.adres@example.com' })).status).toBe(200);

    const tweede = await alsAdmin('post', `/${id}/promote`);
    expect(tweede.status).toBe(400);
    expect(tweede.body.error).toMatch(/gepromoveerd/i);

    const aantal = db
      .prepare('SELECT COUNT(*) AS n FROM users WHERE association_id = ? AND status = ?')
      .get(associationId, 'pending') as { n: number };
    expect(aantal.n).toBe(1);

    // En de verwijzing naar de eerste gebruiker blijft staan.
    const contact = db.prepare('SELECT promoted_to_user_id FROM contacts WHERE id = ?').get(id) as {
      promoted_to_user_id: string;
    };
    expect(contact.promoted_to_user_id).toBe(eerste.body.userId);
  });

  it('toont bij het contact naar welke gebruiker het is gepromoveerd', async () => {
    const id = await maakPersoon('zichtbaar@example.com');
    const promotie = await alsAdmin('post', `/${id}/promote`);

    const res = await alsAdmin('get', `/${id}`);
    expect(res.body.promotedToUserId).toBe(promotie.body.userId);
  });
});

// =====================================================
// EEN GEBRUIKER ZONDER VERENIGING
// =====================================================

describe('Een gebruiker zonder vereniging', () => {
  // Een account bestaat al voordat het aan een vereniging is gekoppeld - een
  // uitnodiging die nog loopt, of een lid dat uit zijn laatste vereniging is
  // gehaald. Zo'n token komt door de authenticatie heen, maar elke route hier
  // werkt met een vereniging. Het antwoord hoort een nette 400 te zijn en geen
  // serverfout, en er mag zeker geen zoekopdracht zonder verenigingsfilter uit
  // volgen: dat zou de contacten van alle verenigingen tegelijk teruggeven.
  let losToken: string;

  beforeEach(() => {
    const zonderVereniging = createTestUser(associationId, {
      email: `los-${uuidv4().slice(0, 8)}@test.com`,
      role: 'admin',
    });
    losToken = jwt.sign(
      { id: zonderVereniging.id, email: zonderVereniging.email, role: 'admin', associationId: null },
      JWT_SECRET,
      { expiresIn: '1h' },
    );
  });

  const zonderVereniging = (methode: Methode, pad: string) =>
    request(app)[methode](`/api/contacts${pad}`).set('Authorization', `Bearer ${losToken}`);

  it('geeft een nette foutmelding op het overzicht en de categorieen', async () => {
    for (const pad of ['/', '/categories']) {
      const res = await zonderVereniging('get', pad);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/vereniging/i);
    }
  });

  it('geeft een nette foutmelding bij alles wat schrijft', async () => {
    const id = uuidv4();
    const gevallen: [Methode, string, Record<string, unknown>][] = [
      ['post', '/', { contactType: 'venue', name: 'Zaal' }],
      ['patch', `/${id}`, { name: 'Zaal' }],
      ['delete', `/${id}`, {}],
      ['post', `/${id}/activate`, {}],
      ['post', `/${id}/deactivate`, {}],
      ['get', `/${id}`, {}],
      ['get', `/${id}/persons`, {}],
      ['post', `/${id}/persons`, { name: 'Anna' }],
      ['put', `/${id}/persons/${uuidv4()}`, { name: 'Anna' }],
      ['delete', `/${id}/persons/${uuidv4()}`, {}],
      ['post', `/${id}/promote`, {}],
      ['post', '/categories', { name: 'Zalen' }],
      ['put', `/categories/${id}`, { name: 'Zalen' }],
      ['delete', `/categories/${id}`, {}],
    ];

    for (const [methode, pad, lichaam] of gevallen) {
      const res = await zonderVereniging(methode, pad).send(lichaam);
      expect({ pad, status: res.status }).toEqual({ pad, status: 400 });
    }
  });
});

describe('Elk veld van een contact is bij te werken', () => {
  it('schrijft alle velden weg in een keer', async () => {
    // De route bouwt de UPDATE veld voor veld op. Wordt er ergens een kolom
    // vergeten of verkeerd gespeld, dan valt dat alleen op als elk veld
    // daadwerkelijk een keer wordt meegestuurd.
    const id = await maakContact();

    const res = await alsAdmin('patch', `/${id}`).send({
      contactType: 'vendor',
      name: 'Bladmuziek BV',
      contactPerson: 'Jansen',
      email: 'info@bladmuziek.example',
      phone: '0201234567',
      mobile: '0612345678',
      addressLine: 'Muziekstraat 1',
      postalCode: '1000 AA',
      city: 'Amsterdam',
      country: 'BE',
      iban: 'NL91ABNA0417164300',
      ibanHolderName: 'Bladmuziek BV',
      bic: 'ABNANL2A',
      vatNumber: 'NL001234567B01',
      chamberOfCommerce: '12345678',
      website: 'https://bladmuziek.example',
      notes: 'Levert binnen een week.',
    });
    expect(res.status).toBe(200);

    const na = await alsAdmin('get', `/${id}`);
    expect(na.body).toMatchObject({
      contactType: 'vendor',
      name: 'Bladmuziek BV',
      contactPerson: 'Jansen',
      email: 'info@bladmuziek.example',
      phone: '0201234567',
      mobile: '0612345678',
      addressLine: 'Muziekstraat 1',
      postalCode: '1000 AA',
      city: 'Amsterdam',
      country: 'BE',
      iban: 'NL91ABNA0417164300',
      ibanHolderName: 'Bladmuziek BV',
      bic: 'ABNANL2A',
      vatNumber: 'NL001234567B01',
      chamberOfCommerce: '12345678',
      website: 'https://bladmuziek.example',
      notes: 'Levert binnen een week.',
    });
  });

  it('laat een verzoek zonder enig veld het contact ongemoeid', async () => {
    const id = await maakContact();

    expect((await alsAdmin('patch', `/${id}`).send({})).status).toBe(200);

    const na = await alsAdmin('get', `/${id}`);
    expect(na.body.name).toBe('Concertzaal De Notenbalk');
  });
});
