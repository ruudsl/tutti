/**
 * Tests voor de contacten-api (relaties, zalen, leveranciers).
 *
 * De functies in contacts.ts zetten een pad in elkaar, geven een body mee en
 * leveren `response.data` terug. Daarom wordt hier op het pad, de methode, de
 * body en de queryreeks getoetst - een typefout daarin geeft geen foutmelding
 * maar een leeg scherm. De routes zijn vergeleken met
 * backend/src/routes/contacts.ts (gemount op /api/contacts in index.ts).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  startNepserver,
  stopNepserver,
  antwoordMet,
  antwoordMetFout,
  antwoordMetNetwerkfout,
  antwoordMetTijdslimiet,
  laatsteVerzoek,
  alleVerzoeken,
} from './nepserver';
import {
  getContactCategories,
  createContactCategory,
  updateContactCategory,
  deleteContactCategory,
  getContacts,
  getContact,
  createContact,
  updateContact,
  deleteContact,
  activateContact,
  deactivateContact,
  promoteContactToUser,
  getContactPersons,
  addContactPerson,
  updateContactPerson,
  deleteContactPerson,
} from '../contacts';

beforeEach(() => startNepserver());
afterEach(() => stopNepserver());

// ===========================================
// CATEGORIEEN
// ===========================================

describe('categorieen', () => {
  it('getContactCategories bevraagt /contacts/categories', async () => {
    antwoordMet([{ id: 'cat1', name: 'Zalen', sortOrder: 1, createdAt: '2026-01-01T00:00:00.000Z' }]);
    const categorieen = await getContactCategories();

    expect(laatsteVerzoek().methode).toBe('get');
    // De categorieroute staat in de backend voor /:id, dus 'categories' hoort
    // niet als contact-id gelezen te worden.
    expect(laatsteVerzoek().pad).toBe('/contacts/categories');
    expect(categorieen[0].name).toBe('Zalen');
  });

  it('getContactCategories geeft een lege lijst terug zonder te vallen', async () => {
    antwoordMet([]);
    await expect(getContactCategories()).resolves.toEqual([]);
  });

  it('createContactCategory post de categorie en geeft hem terug', async () => {
    antwoordMet({ id: 'cat9', name: 'Leveranciers', color: '#123456', sortOrder: 2, createdAt: '2026-01-01' });
    const categorie = await createContactCategory({
      name: 'Leveranciers',
      color: '#123456',
      icon: 'truck',
      sortOrder: 2,
    });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/contacts/categories');
    expect(verzoek.body).toEqual({ name: 'Leveranciers', color: '#123456', icon: 'truck', sortOrder: 2 });
    expect(categorie.id).toBe('cat9');
  });

  it('createContactCategory stuurt sortOrder 0 mee in plaats van hem weg te laten', async () => {
    antwoordMet({ id: 'cat9' });
    await createContactCategory({ name: 'Eerste', sortOrder: 0 });

    // 0 is een geldige plaats in de volgorde en mag niet stilzwijgend
    // verdwijnen; de categorie zou anders onderaan belanden.
    expect(laatsteVerzoek().body).toEqual({ name: 'Eerste', sortOrder: 0 });
  });

  it('updateContactCategory gebruikt PUT op de categorie', async () => {
    antwoordMet({ message: 'Bijgewerkt' });
    await updateContactCategory('cat1', { name: 'Zalen en podia', icon: 'building' });

    const verzoek = laatsteVerzoek();
    // De backend heeft hier PUT (geen PATCH, anders dan bij contacten zelf).
    expect(verzoek.methode).toBe('put');
    expect(verzoek.pad).toBe('/contacts/categories/cat1');
    expect(verzoek.body).toEqual({ name: 'Zalen en podia', icon: 'building' });
  });

  it('deleteContactCategory verwijdert een categorie', async () => {
    antwoordMet({ message: 'Verwijderd' });
    await deleteContactCategory('cat1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/contacts/categories/cat1');
  });

  it('laat een 409 door als er nog contacten aan de categorie hangen', async () => {
    antwoordMetFout(409, { error: 'Categorie is nog in gebruik.' });

    await expect(deleteContactCategory('cat1')).rejects.toMatchObject({ response: { status: 409 } });
  });
});

// ===========================================
// CONTACTEN
// ===========================================

describe('getContacts', () => {
  it('zet alle filters in de queryreeks', async () => {
    antwoordMet([]);
    await getContacts({ type: 'venue', category: 'cat1', search: 'schouwburg', active: true });

    const { pad, query } = laatsteVerzoek();
    expect(pad).toBe('/contacts');
    expect(query.get('type')).toBe('venue');
    expect(query.get('category')).toBe('cat1');
    expect(query.get('search')).toBe('schouwburg');
    expect(query.get('active')).toBe('true');
  });

  it('stuurt active=false mee in plaats van het filter te laten vallen', async () => {
    antwoordMet([]);
    await getContacts({ active: false });

    // De backend kijkt naar `active !== undefined`, dus false betekent hier
    // echt "toon de inactieve contacten".
    expect(laatsteVerzoek().query.get('active')).toBe('false');
  });

  it('stuurt geen queryreeks mee zonder filters', async () => {
    antwoordMet([]);
    await getContacts();

    expect(laatsteVerzoek().queryreeks).toBe('');
  });

  it('laat een filter dat niet is ingevuld weg', async () => {
    antwoordMet([]);
    await getContacts({ search: 'zaal', type: undefined });

    expect(laatsteVerzoek().queryreeks).toBe('search=zaal');
  });

  it('codeert een zoekterm met een ampersand en een spatie', async () => {
    antwoordMet([]);
    await getContacts({ search: 'Jansen & Zn' });

    const { queryreeks, query } = laatsteVerzoek();
    expect(queryreeks).not.toContain('& Zn');
    expect(query.get('search')).toBe('Jansen & Zn');
  });

  it('geeft een lege lijst terug als er niets gevonden wordt', async () => {
    antwoordMet([]);
    await expect(getContacts({ search: 'bestaat-niet' })).resolves.toEqual([]);
  });
});

describe('getContact', () => {
  it('haalt een contact op via /contacts/:id', async () => {
    antwoordMet({ id: 'ct1', name: 'Schouwburg', categories: [], contactPersons: [] });
    const contact = await getContact('ct1');

    expect(laatsteVerzoek().pad).toBe('/contacts/ct1');
    expect(contact.name).toBe('Schouwburg');
  });

  it('laat een 404 door in plaats van hem als leeg resultaat te verpakken', async () => {
    antwoordMetFout(404, { error: 'Contact niet gevonden.' });

    await expect(getContact('bestaat-niet')).rejects.toMatchObject({
      response: { status: 404, data: { error: 'Contact niet gevonden.' } },
    });
  });

  it('werpt bij een netwerkfout zonder respons', async () => {
    antwoordMetNetwerkfout();

    await expect(getContact('ct1')).rejects.toMatchObject({ code: 'ERR_NETWORK' });
  });

  it('werpt als het verzoek in de tijdslimiet loopt', async () => {
    antwoordMetTijdslimiet();

    await expect(getContact('ct1')).rejects.toMatchObject({ code: 'ECONNABORTED' });
  });
});

describe('createContact', () => {
  it('post het contact met alle zakelijke velden', async () => {
    antwoordMet({ id: 'ct9', name: 'Schouwburg', message: 'Contact aangemaakt' });

    await createContact({
      contactType: 'venue',
      name: 'Schouwburg',
      contactPerson: 'Mevrouw De Wit',
      email: 'zaal@example.com',
      phone: '0401234567',
      mobile: '0612345678',
      addressLine: 'Marktstraat 1',
      postalCode: '5611 AA',
      city: 'Eindhoven',
      country: 'NL',
      iban: 'NL91ABNA0417164300',
      ibanHolderName: 'Schouwburg BV',
      bic: 'ABNANL2A',
      vatNumber: 'NL001234567B01',
      chamberOfCommerce: '12345678',
      website: 'https://zaal.example',
      notes: 'Laden via de achteringang',
      categoryIds: ['cat1'],
    });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/contacts');
    // createContactSchema leest exact deze veldnamen.
    expect(verzoek.body).toMatchObject({
      contactType: 'venue',
      name: 'Schouwburg',
      iban: 'NL91ABNA0417164300',
      ibanHolderName: 'Schouwburg BV',
      chamberOfCommerce: '12345678',
      categoryIds: ['cat1'],
    });
  });

  it('stuurt alleen de ingevulde velden mee', async () => {
    antwoordMet({ id: 'ct9', name: 'Kort', message: '' });
    await createContact({ contactType: 'person', name: 'Kort' });

    const body = laatsteVerzoek().body as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['contactType', 'name']);
  });

  it('stuurt een lege categorielijst mee in plaats van hem weg te laten', async () => {
    antwoordMet({ id: 'ct9', name: 'x', message: '' });
    await createContact({ contactType: 'vendor', name: 'x', categoryIds: [] });

    expect(laatsteVerzoek().body).toMatchObject({ categoryIds: [] });
  });

  it('geeft een validatiefout van de server door met de melding erbij', async () => {
    antwoordMetFout(400, { error: 'Naam is verplicht.' });

    await expect(createContact({ contactType: 'person', name: '' })).rejects.toMatchObject({
      response: { status: 400, data: { error: 'Naam is verplicht.' } },
    });
  });
});

describe('updateContact', () => {
  it('gebruikt PATCH, niet PUT', async () => {
    antwoordMet({ message: 'Bijgewerkt' });
    await updateContact('ct1', { city: 'Tilburg' });

    const verzoek = laatsteVerzoek();
    // De backend heeft PATCH /:id voor contacten en PUT alleen voor
    // categorieen en contactpersonen. Verwisselen geeft een 404.
    expect(verzoek.methode).toBe('patch');
    expect(verzoek.pad).toBe('/contacts/ct1');
    expect(verzoek.body).toEqual({ city: 'Tilburg' });
  });

  it('kan een veld leegmaken met een lege tekst', async () => {
    antwoordMet({ message: '' });
    await updateContact('ct1', { email: '' });

    // updateContactSchema laat een lege tekst uitdrukkelijk toe naast een
    // geldig e-mailadres; zo wis je het veld.
    expect(laatsteVerzoek().body).toEqual({ email: '' });
  });
});

describe('deleteContact', () => {
  it('verwijdert een contact', async () => {
    antwoordMet({ message: 'Verwijderd' });
    await deleteContact('ct1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/contacts/ct1');
  });
});

// ===========================================
// ACTIVEREN EN PROMOVEREN
// ===========================================

describe('activeren en deactiveren', () => {
  it('activateContact post zonder body op de activeerroute', async () => {
    antwoordMet({ message: 'Geactiveerd' });
    await activateContact('ct1');

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/contacts/ct1/activate');
    expect(verzoek.body).toBeUndefined();
  });

  it('deactivateContact post op de deactiveerroute', async () => {
    antwoordMet({ message: 'Gedeactiveerd' });
    await deactivateContact('ct1');

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    // Twee losse routes; een schakelaar op een gedeeld pad bestaat hier niet.
    expect(verzoek.pad).toBe('/contacts/ct1/deactivate');
  });
});

describe('promoteContactToUser', () => {
  it('post op de promote-route en geeft het tijdelijke wachtwoord terug', async () => {
    antwoordMet({
      userId: 'u9',
      email: 'nieuw@example.com',
      tempPassword: 'tijdelijk-wachtwoord',
      message: 'Contact omgezet naar gebruiker',
    });

    const resultaat = await promoteContactToUser('ct1');

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/contacts/ct1/promote');
    expect(verzoek.body).toBeUndefined();
    expect(resultaat.tempPassword).toBe('tijdelijk-wachtwoord');
  });

  it('laat een 400 door als het contact geen e-mailadres heeft', async () => {
    antwoordMetFout(400, { error: 'Contact heeft geen e-mailadres.' });

    await expect(promoteContactToUser('ct1')).rejects.toMatchObject({
      response: { status: 400, data: { error: 'Contact heeft geen e-mailadres.' } },
    });
  });

  it('laat een 409 door als er al een gebruiker met dit adres bestaat', async () => {
    antwoordMetFout(409, { error: 'E-mailadres is al in gebruik.' });

    await expect(promoteContactToUser('ct1')).rejects.toMatchObject({ response: { status: 409 } });
  });
});

// ===========================================
// CONTACTPERSONEN
// ===========================================

describe('contactpersonen', () => {
  it('getContactPersons bevraagt de personen van een contact', async () => {
    antwoordMet([{ id: 'p1', name: 'Mevrouw De Wit', isPrimary: true, createdAt: '2026-01-01' }]);
    const personen = await getContactPersons('ct1');

    expect(laatsteVerzoek().methode).toBe('get');
    expect(laatsteVerzoek().pad).toBe('/contacts/ct1/persons');
    expect(personen[0].isPrimary).toBe(true);
  });

  it('getContactPersons geeft een lege lijst terug zonder te vallen', async () => {
    antwoordMet([]);
    await expect(getContactPersons('ct1')).resolves.toEqual([]);
  });

  it('addContactPerson post de persoon onder het contact', async () => {
    antwoordMet({ id: 'p9', name: 'Jan', message: 'Toegevoegd' });
    await addContactPerson('ct1', {
      name: 'Jan Jansen',
      role: 'Technicus',
      email: 'jan@example.com',
      phone: '0612345678',
      isPrimary: true,
      notes: 'Alleen op werkdagen',
    });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/contacts/ct1/persons');
    expect(verzoek.body).toEqual({
      name: 'Jan Jansen',
      role: 'Technicus',
      email: 'jan@example.com',
      phone: '0612345678',
      isPrimary: true,
      notes: 'Alleen op werkdagen',
    });
  });

  it('addContactPerson stuurt isPrimary false mee in plaats van het weg te laten', async () => {
    antwoordMet({ id: 'p9', name: 'x', message: '' });
    await addContactPerson('ct1', { name: 'Tweede persoon', isPrimary: false });

    expect(laatsteVerzoek().body).toEqual({ name: 'Tweede persoon', isPrimary: false });
  });

  it('updateContactPerson gebruikt PUT met beide ids in het pad', async () => {
    antwoordMet({ message: 'Bijgewerkt' });
    await updateContactPerson('ct1', 'p1', { role: 'Zaalmeester' });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('put');
    expect(verzoek.pad).toBe('/contacts/ct1/persons/p1');
    expect(verzoek.body).toEqual({ role: 'Zaalmeester' });
  });

  it('deleteContactPerson verwijdert de juiste persoon', async () => {
    antwoordMet({ message: 'Verwijderd' });
    await deleteContactPerson('ct1', 'p1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/contacts/ct1/persons/p1');
  });
});

// ===========================================
// ALGEMEEN GEDRAG
// ===========================================

describe('algemeen gedrag van de contacten-api', () => {
  it('stuurt precies een verzoek per aanroep', async () => {
    antwoordMet([]);
    await getContacts();

    expect(alleVerzoeken()).toHaveLength(1);
  });

  it('levert niets op bij een void-functie maar valt ook niet over een leeg antwoord', async () => {
    antwoordMet('', { status: 204 });

    await expect(deleteContact('ct1')).resolves.toBeUndefined();
  });

  it('geeft een lijst terug waar een object werd verwacht zonder hem stil te wissen', async () => {
    antwoordMet([{ id: 'ct1' }]);

    await expect(getContact('ct1')).resolves.toEqual([{ id: 'ct1' }]);
  });

  it('laat een 500 door in plaats van undefined te leveren', async () => {
    antwoordMetFout(500, { error: 'Interne fout' });

    await expect(getContacts()).rejects.toMatchObject({ response: { status: 500 } });
  });
});
