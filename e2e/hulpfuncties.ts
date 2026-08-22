/**
 * Gedeelde bouwstenen voor de E2E-tests.
 *
 * De inlogfunctie stond eerst bovenin smoke.spec.ts. Nu er meer bestanden zijn
 * die moeten inloggen, staat hij hier: één plek waar het inlogscherm bekend is.
 *
 * De testgegevens komen uit backend/src/scripts/seed-e2e.ts. Die constanten
 * staan hier bewust nog een keer en worden niet geïmporteerd: de backend en de
 * E2E-map hebben elk hun eigen tsconfig, en `seed-e2e.ts` sleept via
 * `database/connection` de hele database-laag mee. Verandert er iets in de
 * seed, dan hoort het hier ook te veranderen.
 */

import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';

export const E2E_ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'e2e-admin@test.local';
export const E2E_ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'E2eTest!2026';
export const E2E_MEMBER_EMAIL = process.env.E2E_MEMBER_EMAIL || 'e2e-member@test.local';
export const E2E_MEMBER_PASSWORD = process.env.E2E_MEMBER_PASSWORD || E2E_ADMIN_PASSWORD;

/** De orkesten uit de seed. */
export const E2E_ORKEST_NAAM = 'E2E Orkest';
export const E2E_TWEEDE_ORKEST_NAAM = 'E2E Tweede Orkest';

/** De repetities uit de seed, met hun vaste id. */
export const E2E_REPETITIE_AANWEZIGHEID_ID = 'e2e0a17e-0000-4000-8000-000000000001';
export const E2E_REPETITIE_OVERZICHT_ID = 'e2e0a17e-0000-4000-8000-000000000002';

/** Inlog-/verzendknop in nl/en/de. */
export const LOGIN_KNOP = /inloggen|log ?in|sign in|anmelden/i;

/**
 * Zet de taal van de applicatie vast vóór de eerste paginalading.
 *
 * De smoke-test vangt de drie talen op met regexpatronen. Dat werkt voor een
 * handvol woorden, maar een flow klikt door tientallen knoppen heen en dan
 * wordt zo'n patroon per knop een tweede plek waar de vertaling kan schuiven.
 * De taaldetectie kijkt eerst in localStorage (`language`), dus door die sleutel
 * te zetten staat de applicatie gegarandeerd in het Nederlands en zijn de
 * toegankelijke namen in de test gewoon de teksten die een lid ziet.
 *
 * Moet vóór de eerste `goto` worden aangeroepen: `addInitScript` draait bij het
 * aanmaken van elk document, niet met terugwerkende kracht.
 */
export async function zetTaalVast(page: Page, taal: 'nl' | 'en' | 'de' = 'nl'): Promise<void> {
  await page.addInitScript((gekozen) => {
    window.localStorage.setItem('language', gekozen);
  }, taal);
}

/**
 * Zet de rondleiding voor de zojuist ingelogde gebruiker op "al gezien".
 *
 * Bij de eerste keer inloggen legt OnboardingTour een overlay over het scherm.
 * Die overlay vangt alle muisklikken af, dus zonder dit blijft elke test hangen
 * op de eerste knop die hij probeert in te drukken.
 *
 * De rondleiding onthoudt in localStorage per gebruiker dat hij gezien is, en
 * een testbrowser begint altijd met een lege localStorage - dus voor de test is
 * elke sessie een eerste keer, terwijl de flows die hier getoetst worden juist
 * gaan over een lid dat de applicatie al kent. Die stand zetten we hier dan ook
 * gewoon zelf. Het wegklikken van de rondleiding is een eigen flow en hoort in
 * een eigen test, niet in de aanloop van alle andere.
 */
async function slaRondleidingOver(page: Page): Promise<void> {
  await page.evaluate(() => {
    const opgeslagen = window.localStorage.getItem('user');
    if (!opgeslagen) return;
    const gebruiker = JSON.parse(opgeslagen) as { id?: string };
    if (gebruiker.id) {
      window.localStorage.setItem(`onboarding_completed_${gebruiker.id}`, 'true');
    }
  });
}

/**
 * Log in via het inlogscherm, zoals een gebruiker dat doet.
 */
export async function login(page: Page, email = E2E_ADMIN_EMAIL, password = E2E_ADMIN_PASSWORD): Promise<void> {
  await page.goto('/');

  const emailInput = page.getByLabel(/email|e-mail/i).or(page.locator('input[type="email"]'));
  const passwordInput = page.getByLabel(/wachtwoord|password|passwort/i).or(page.locator('input[type="password"]'));

  await emailInput.fill(email);
  await passwordInput.fill(password);
  await page.getByRole('button', { name: LOGIN_KNOP }).click();

  // Na een geslaagde login navigeert de applicatie weg van het inlogscherm
  await expect(page).not.toHaveURL(/login/i, { timeout: 15000 });

  await slaRondleidingOver(page);
}

/**
 * Haal een API-token op zonder browser.
 *
 * Wordt gebruikt om de uitgangssituatie van een test klaar te zetten: resten
 * van een eerdere ronde opruimen, een aanwezigheid terugzetten. Dat opruimen
 * hoort niet via het scherm te gaan - het is geen onderdeel van de flow die
 * getoetst wordt, en klikwerk dat er niet toe doet is klikwerk dat kan
 * omvallen.
 */
export async function haalToken(
  request: APIRequestContext,
  email = E2E_ADMIN_EMAIL,
  password = E2E_ADMIN_PASSWORD,
): Promise<string> {
  const antwoord = await request.post('/api/auth/login', { data: { email, password } });
  expect(antwoord.ok(), `inloggen via de API mislukte voor ${email}`).toBe(true);
  const body = await antwoord.json();
  return body.token as string;
}

function authKop(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export interface Repetitie {
  id: string;
  date: string;
  location: string | null;
}

/** Haal één repetitie op via zijn vaste id. */
export async function haalRepetitie(request: APIRequestContext, token: string, id: string): Promise<Repetitie> {
  const antwoord = await request.get(`/api/rehearsals/${id}`, { headers: authKop(token) });
  expect(antwoord.ok(), `repetitie ${id} niet gevonden - is de seed gedraaid?`).toBe(true);
  return (await antwoord.json()) as Repetitie;
}

/**
 * Verwijder alle repetities met deze locatie.
 *
 * Een test die zelf een repetitie aanmaakt moet daar tegen kunnen dat een
 * eerdere ronde er al een heeft achtergelaten - anders staan er twee rijen met
 * dezelfde datum en weet Playwright niet meer welke bedoeld is. Opruimen vooraf
 * en niet achteraf: een test die halverwege afbreekt ruimt niets meer op, maar
 * de volgende ronde begint dan alsnog schoon.
 */
export async function verwijderRepetitiesOpLocatie(
  request: APIRequestContext,
  token: string,
  locatie: string,
): Promise<void> {
  const antwoord = await request.get('/api/rehearsals', { headers: authKop(token) });
  expect(antwoord.ok(), 'repetities ophalen mislukte').toBe(true);
  const repetities = (await antwoord.json()) as Repetitie[];

  for (const repetitie of repetities.filter((r) => r.location === locatie)) {
    const verwijderd = await request.delete(`/api/rehearsals/${repetitie.id}`, {
      headers: authKop(token),
    });
    expect(verwijderd.ok(), `opruimen van repetitie ${repetitie.id} mislukte`).toBe(true);
  }
}

/**
 * Zet de aanwezigheid van de ingelogde gebruiker op afwezig.
 *
 * Zo begint de aanwezigheidstest altijd bij dezelfde stand, ook als een vorige
 * ronde hem op "aanwezig" heeft achtergelaten. Zonder dit zou de knop
 * "Aanmelden" soms uitgeschakeld zijn en de test soms vastlopen.
 */
export async function zetAanwezigheidOpAfwezig(
  request: APIRequestContext,
  token: string,
  repetitieId: string,
): Promise<void> {
  const antwoord = await request.put(`/api/spond/attendance/${repetitieId}`, {
    headers: authKop(token),
    data: { accepted: false },
  });
  expect(antwoord.ok(), 'aanwezigheid terugzetten mislukte').toBe(true);
}

/** Verwijder een lid op e-mailadres, als het bestaat. */
export async function verwijderLidOpEmail(request: APIRequestContext, token: string, email: string): Promise<void> {
  const antwoord = await request.get('/api/users', { headers: authKop(token) });
  expect(antwoord.ok(), 'leden ophalen mislukte').toBe(true);
  const body = await antwoord.json();
  const leden = (body.data || []) as { id: string; email: string }[];

  for (const lid of leden.filter((l) => l.email === email)) {
    const verwijderd = await request.delete(`/api/users/${lid.id}`, { headers: authKop(token) });
    expect(verwijderd.ok(), `opruimen van lid ${email} mislukte`).toBe(true);
  }
}

/**
 * De datum zoals de repetitielijst hem toont: dag-maand-jaar zonder voorloopnul.
 *
 * De lijst zet er ook de dagnaam voor ("Zaterdag 12-9-2026"), maar die is
 * afhankelijk van de taal. Het getallendeel is dat niet en is uniek genoeg om
 * de juiste rij aan te wijzen.
 */
export function lijstDatum(datum: string): string {
  const [jaar, maand, dag] = datum.split('-').map(Number);
  return `${dag}-${maand}-${jaar}`;
}

/**
 * Het invoerveld dat bij dit label hoort.
 *
 * Normaal zou dit `getByLabel(...)` zijn. Dat kan hier niet: de formulieren van
 * de applicatie zetten hun label neer als `<label class="form-label">` zonder
 * `for`, en het veld staat ernaast in plaats van erin. Er is dus geen enkele
 * koppeling tussen label en veld - niet voor Playwright, en niet voor een
 * schermlezer. Dat is een gebrek in de applicatie (zie het rapport), niet iets
 * wat een test hoort te verbergen; tot het verholpen is zoeken we het veld via
 * de omhullende `.form-group`, zodat de test in elk geval nog leest als "het
 * veld Voornaam".
 */
export function veldBijLabel(gebied: Locator | Page, label: string): Locator {
  return gebied.locator('.form-group').filter({ hasText: label }).locator('input, textarea').first();
}
