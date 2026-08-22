/**
 * Tests voor de onboarding-api (leden aanmelden, afmelden en koppelingen).
 *
 * De functies in onboarding.ts zetten een pad in elkaar, geven een body mee en
 * leveren `response.data` terug. Daarom wordt hier op het pad, de methode en de
 * body getoetst - een typefout daarin geeft geen foutmelding maar een leeg
 * scherm. De routes zijn vergeleken met backend/src/routes/onboarding.ts
 * (gemount op /api/onboarding in index.ts).
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
  onboardMember,
  getM365GroupMappings,
  createM365GroupMapping,
  updateM365GroupMapping,
  deleteM365GroupMapping,
  getInstrumentJobTitleMappings,
  createInstrumentJobTitleMapping,
  updateInstrumentJobTitleMapping,
  deleteInstrumentJobTitleMapping,
  getPendingSpondLinks,
  deletePendingSpondLink,
  getOnboardingTasks,
  retryEmailForwarding,
  offboardMember,
  reactivateMember,
  getInactiveMembers,
} from '../onboarding';

beforeEach(() => startNepserver());
afterEach(() => stopNepserver());

/** Een minimaal geldig antwoord van /onboarding/member. */
const aanmeldAntwoord = {
  success: true,
  userId: 'u9',
  email: 'nieuw@example.com',
  firstName: 'Nieuw',
  lastName: 'Lid',
  tempPassword: 'tijdelijk-wachtwoord',
  m365Created: false,
  m365Error: null,
  spondLinkPending: false,
  message: 'Lid aangemaakt',
  instructions: [],
};

// ===========================================
// LID AANMELDEN
// ===========================================

describe('onboardMember zonder foto', () => {
  it('post het lid als gewone JSON-body', async () => {
    antwoordMet(aanmeldAntwoord);

    await onboardMember({
      firstName: 'Nieuw',
      lastName: 'Lid',
      email: 'nieuw@example.com',
      privateEmail: 'prive@example.com',
      instrumentIds: ['i1', 'i2'],
      orchestraIds: ['o1'],
      createM365Account: true,
      m365Password: 'geheim-in-test',
      addToPercussionGroup: false,
    });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/onboarding/member');
    // Zonder foto blijven de arrays echte arrays; de backend accepteert beide
    // vormen (zie de JSON.parse-vangnet in de route).
    expect(verzoek.body).toEqual({
      firstName: 'Nieuw',
      lastName: 'Lid',
      email: 'nieuw@example.com',
      privateEmail: 'prive@example.com',
      instrumentIds: ['i1', 'i2'],
      orchestraIds: ['o1'],
      createM365Account: true,
      m365Password: 'geheim-in-test',
      addToPercussionGroup: false,
    });
  });

  it('geeft het antwoord met tijdelijk wachtwoord ongewijzigd door', async () => {
    antwoordMet({ ...aanmeldAntwoord, m365Created: true, groupsAdded: ['Harmonie'], photoUploaded: false });

    const resultaat = await onboardMember({ firstName: 'A', lastName: 'B', email: 'a@example.com' });

    expect(resultaat.tempPassword).toBe('tijdelijk-wachtwoord');
    expect(resultaat.groupsAdded).toEqual(['Harmonie']);
  });

  it('laat een 409 door als het e-mailadres al bestaat', async () => {
    antwoordMetFout(409, { error: 'E-mailadres is al in gebruik.' });

    await expect(onboardMember({ firstName: 'A', lastName: 'B', email: 'a@example.com' })).rejects.toMatchObject({
      response: { status: 409, data: { error: 'E-mailadres is al in gebruik.' } },
    });
  });

  it('werpt bij een netwerkfout zonder respons', async () => {
    antwoordMetNetwerkfout();

    await expect(onboardMember({ firstName: 'A', lastName: 'B', email: 'a@example.com' })).rejects.toMatchObject({
      code: 'ERR_NETWORK',
    });
  });
});

describe('onboardMember met foto', () => {
  /** Maakt een klein nepbestand dat als profielfoto meegaat. */
  function nepFoto() {
    return new File(['pixels'], 'pasfoto.png', { type: 'image/png' });
  }

  it('stuurt formulierdata en zet de lijsten om naar JSON-tekst', async () => {
    antwoordMet(aanmeldAntwoord);

    await onboardMember({
      firstName: 'Nieuw',
      lastName: 'Lid',
      email: 'nieuw@example.com',
      instrumentIds: ['i1', 'i2'],
      orchestraIds: ['o1'],
      profilePhoto: nepFoto(),
    });

    const verzoek = laatsteVerzoek();
    expect(verzoek.pad).toBe('/onboarding/member');
    expect(verzoek.body).toBeInstanceOf(FormData);

    const formulier = verzoek.body as FormData;
    expect(formulier.get('firstName')).toBe('Nieuw');
    // Arrays kunnen niet als array in formulierdata; de backend doet daarom
    // JSON.parse op deze velden.
    expect(formulier.get('instrumentIds')).toBe('["i1","i2"]');
    expect(formulier.get('orchestraIds')).toBe('["o1"]');
    // multer leest het veld 'profilePhoto'.
    expect((formulier.get('profilePhoto') as File).name).toBe('pasfoto.png');
  });

  it('stuurt de vinkjes als de tekst true, want dat is wat de backend vergelijkt', async () => {
    antwoordMet(aanmeldAntwoord);

    await onboardMember({
      firstName: 'Nieuw',
      lastName: 'Lid',
      email: 'nieuw@example.com',
      createM365Account: true,
      addToPercussionGroup: true,
      profilePhoto: nepFoto(),
    });

    const formulier = laatsteVerzoek().body as FormData;
    expect(formulier.get('createM365Account')).toBe('true');
    expect(formulier.get('addToPercussionGroup')).toBe('true');
  });

  it('laat de vinkjes helemaal weg als ze niet aanstaan', async () => {
    antwoordMet(aanmeldAntwoord);

    await onboardMember({
      firstName: 'Nieuw',
      lastName: 'Lid',
      email: 'nieuw@example.com',
      createM365Account: false,
      addToPercussionGroup: false,
      profilePhoto: nepFoto(),
    });

    const formulier = laatsteVerzoek().body as FormData;
    // De backend leest `waarde === 'true'`, dus een ontbrekend veld betekent
    // hetzelfde als uit. De tekst 'false' zou hier ook goed gaan, maar het veld
    // mag in elk geval niet als aangevinkt binnenkomen.
    expect(formulier.get('createM365Account')).toBeNull();
    expect(formulier.get('addToPercussionGroup')).toBeNull();
  });

  it('zet de inhoudssoort op multipart zodat multer het bestand ziet', async () => {
    antwoordMet(aanmeldAntwoord);

    await onboardMember({ firstName: 'A', lastName: 'B', email: 'a@example.com', profilePhoto: nepFoto() });

    const koppen = laatsteVerzoek().headers as Record<string, unknown>;
    expect(String(koppen['Content-Type'])).toContain('multipart/form-data');
  });
});

// ===========================================
// M365-GROEPEN
// ===========================================

describe('M365-groepkoppelingen', () => {
  it('getM365GroupMappings bevraagt /onboarding/m365-groups', async () => {
    antwoordMet([{ id: 'g1', groupName: 'Harmonie', groupType: 'orchestra' }]);
    const koppelingen = await getM365GroupMappings();

    expect(laatsteVerzoek().methode).toBe('get');
    expect(laatsteVerzoek().pad).toBe('/onboarding/m365-groups');
    expect(koppelingen).toHaveLength(1);
  });

  it('getM365GroupMappings geeft een lege lijst terug zonder te vallen', async () => {
    antwoordMet([]);
    await expect(getM365GroupMappings()).resolves.toEqual([]);
  });

  it('createM365GroupMapping post de koppeling', async () => {
    antwoordMet({ id: 'g9', message: 'Koppeling aangemaakt' });
    await createM365GroupMapping({ orchestraId: 'o1', groupName: 'Harmonie', groupType: 'orchestra' });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/onboarding/m365-groups');
    expect(verzoek.body).toEqual({ orchestraId: 'o1', groupName: 'Harmonie', groupType: 'orchestra' });
  });

  it('updateM365GroupMapping stuurt alleen de groepsnaam mee', async () => {
    antwoordMet({ message: 'Bijgewerkt' });
    await updateM365GroupMapping('g1', 'Slagwerk');

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('put');
    expect(verzoek.pad).toBe('/onboarding/m365-groups/g1');
    // De backend leest req.body.groupName en weigert met 400 als die leeg is.
    expect(verzoek.body).toEqual({ groupName: 'Slagwerk' });
  });

  it('laat de 400 doorkomen bij een lege groepsnaam', async () => {
    antwoordMetFout(400, { error: 'Groepsnaam is verplicht.' });

    await expect(updateM365GroupMapping('g1', '')).rejects.toMatchObject({
      response: { status: 400, data: { error: 'Groepsnaam is verplicht.' } },
    });
  });

  it('deleteM365GroupMapping verwijdert een koppeling', async () => {
    antwoordMet({ message: 'Verwijderd' });
    await deleteM365GroupMapping('g1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/onboarding/m365-groups/g1');
  });
});

// ===========================================
// FUNCTIETITELS
// ===========================================

describe('functietitelkoppelingen', () => {
  it('getInstrumentJobTitleMappings bevraagt /onboarding/job-titles', async () => {
    antwoordMet([]);
    await getInstrumentJobTitleMappings();

    expect(laatsteVerzoek().pad).toBe('/onboarding/job-titles');
  });

  it('createInstrumentJobTitleMapping post instrument en titel', async () => {
    antwoordMet({ id: 'j9', message: 'Aangemaakt' });
    await createInstrumentJobTitleMapping({ instrumentId: 'i1', jobTitle: 'Solotrompettist' });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/onboarding/job-titles');
    expect(verzoek.body).toEqual({ instrumentId: 'i1', jobTitle: 'Solotrompettist' });
  });

  it('updateInstrumentJobTitleMapping stuurt alleen de titel mee', async () => {
    antwoordMet({ message: 'Bijgewerkt' });
    await updateInstrumentJobTitleMapping('j1', 'Tweede trompet');

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('put');
    expect(verzoek.pad).toBe('/onboarding/job-titles/j1');
    expect(verzoek.body).toEqual({ jobTitle: 'Tweede trompet' });
  });

  it('deleteInstrumentJobTitleMapping verwijdert een koppeling', async () => {
    antwoordMet({ message: 'Verwijderd' });
    await deleteInstrumentJobTitleMapping('j1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/onboarding/job-titles/j1');
  });
});

// ===========================================
// SPOND-KOPPELINGEN EN TAKEN
// ===========================================

describe('openstaande Spond-koppelingen', () => {
  it('getPendingSpondLinks bevraagt /onboarding/pending-links', async () => {
    antwoordMet([{ id: 'pl1', userId: 'u1', expectedEmail: 'jan@example.com' }]);
    const koppelingen = await getPendingSpondLinks();

    expect(laatsteVerzoek().pad).toBe('/onboarding/pending-links');
    expect(koppelingen).toHaveLength(1);
  });

  it('deletePendingSpondLink verwijdert een openstaande koppeling', async () => {
    antwoordMet({ message: 'Verwijderd' });
    await deletePendingSpondLink('pl1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/onboarding/pending-links/pl1');
  });
});

describe('onboardingtaken', () => {
  it('getOnboardingTasks bevraagt de taken van een gebruiker', async () => {
    antwoordMet([{ id: 't1', taskType: 'email_forwarding', status: 'failed' }]);
    const taken = await getOnboardingTasks('u1');

    expect(laatsteVerzoek().pad).toBe('/onboarding/tasks/u1');
    expect(taken[0].status).toBe('failed');
  });

  it('getOnboardingTasks geeft een lege takenlijst terug zonder te vallen', async () => {
    antwoordMet([]);
    await expect(getOnboardingTasks('u1')).resolves.toEqual([]);
  });

  it('retryEmailForwarding post zonder body op de opnieuw-proberen-route', async () => {
    antwoordMet({ success: true, message: 'Doorsturen ingesteld' });
    await retryEmailForwarding('u1');

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/onboarding/retry-email-forwarding/u1');
    expect(verzoek.body).toBeUndefined();
  });

  it('werpt als het opnieuw proberen in de tijdslimiet loopt', async () => {
    antwoordMetTijdslimiet();

    await expect(retryEmailForwarding('u1')).rejects.toMatchObject({ code: 'ECONNABORTED' });
  });
});

// ===========================================
// AFMELDEN EN HERACTIVEREN
// ===========================================

describe('offboardMember', () => {
  it('stuurt removeFromM365 mee als body', async () => {
    antwoordMet({ success: true, m365Removed: true, m365Error: null, message: 'Afgemeld', notes: [] });
    await offboardMember('u1', true);

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/onboarding/offboard/u1');
    // De backend leest req.body.removeFromM365.
    expect(verzoek.body).toEqual({ removeFromM365: true });
  });

  it('stuurt removeFromM365 false expliciet mee', async () => {
    antwoordMet({ success: true, m365Removed: false, m365Error: null, message: '', notes: [] });
    await offboardMember('u1', false);

    expect(laatsteVerzoek().body).toEqual({ removeFromM365: false });
  });

  it('stuurt een lege body als er geen keuze is gemaakt', async () => {
    antwoordMet({ success: true, m365Removed: false, m365Error: null, message: '', notes: [] });
    await offboardMember('u1');

    expect(laatsteVerzoek().body).toEqual({});
  });

  it('laat een 400 door als het lid al inactief is', async () => {
    antwoordMetFout(400, { error: 'Gebruiker is al inactief.' });

    await expect(offboardMember('u1')).rejects.toMatchObject({ response: { status: 400 } });
  });
});

describe('reactivateMember', () => {
  it('post zonder body op de heractiveerroute', async () => {
    antwoordMet({ success: true, message: 'Weer actief' });
    await reactivateMember('u1');

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/onboarding/reactivate/u1');
    expect(verzoek.body).toBeUndefined();
  });
});

describe('getInactiveMembers', () => {
  it('bevraagt /onboarding/inactive-members', async () => {
    antwoordMet([{ id: 'u1', email: 'oud@example.com', firstName: 'Oud', lastName: 'Lid', offboardedAt: null }]);
    const leden = await getInactiveMembers();

    expect(laatsteVerzoek().pad).toBe('/onboarding/inactive-members');
    expect(leden).toHaveLength(1);
  });

  it('geeft een lege lijst terug als iedereen actief is', async () => {
    antwoordMet([]);
    await expect(getInactiveMembers()).resolves.toEqual([]);
  });
});

// ===========================================
// ALGEMEEN GEDRAG
// ===========================================

describe('algemeen gedrag van de onboarding-api', () => {
  it('stuurt precies een verzoek per aanroep', async () => {
    antwoordMet([]);
    await getInactiveMembers();

    expect(alleVerzoeken()).toHaveLength(1);
  });

  it('laat een 403 door voor wie geen beheerder is', async () => {
    antwoordMetFout(403, { error: 'Geen toegang.' });

    await expect(getM365GroupMappings()).rejects.toMatchObject({ response: { status: 403 } });
  });

  it('geeft een leeg antwoordlichaam door als lege string', async () => {
    antwoordMet('', { status: 204 });

    await expect(deletePendingSpondLink('pl1')).resolves.toBe('');
  });
});
