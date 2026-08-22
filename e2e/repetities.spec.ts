/**
 * Flow: repetitie plannen en aanwezigheid melden.
 *
 * Dit is wat een vereniging elke week doet. De beheerder zet de repetitie in de
 * agenda, de leden geven door of ze komen, en de dirigent kijkt naar de telling.
 * Gaat hier iets stuk, dan merkt de hele vereniging het meteen - veel eerder
 * dan bij welk ander scherm ook.
 *
 * Draait tegen de gezaaide E2E-database:
 *   DB_PATH=/tmp/harmonie-e2e/harmonie-e2e.db npm run seed:e2e --workspace=backend
 *   DB_PATH=/tmp/harmonie-e2e/harmonie-e2e.db npx playwright test
 */

import { test, expect, type Locator, type Page } from '@playwright/test';
import {
  E2E_ADMIN_EMAIL,
  E2E_ADMIN_PASSWORD,
  E2E_MEMBER_EMAIL,
  E2E_MEMBER_PASSWORD,
  E2E_ORKEST_NAAM,
  E2E_REPETITIE_AANWEZIGHEID_ID,
  E2E_REPETITIE_OVERZICHT_ID,
  haalRepetitie,
  haalToken,
  lijstDatum,
  login,
  veldBijLabel,
  verwijderRepetitiesOpLocatie,
  zetAanwezigheidOpAfwezig,
  zetTaalVast,
} from './hulpfuncties';

/**
 * De locatie die deze test op zijn eigen repetitie zet.
 *
 * Geen enkele andere test gebruikt deze tekst, dus het opruimen vooraf raakt
 * alleen wat van deze test is. Zo kunnen de tests naast elkaar draaien zonder
 * elkaars rijen te wissen.
 */
const PLANNING_LOCATIE = 'E2E Zaal Planning';

/** Een datum ruim vooruit, maar binnen het half jaar dat de lijst toont. */
const PLANNING_DAGEN_VOORUIT = 45;

function datumOverDagen(aantalDagen: number): string {
  const vandaag = new Date();
  const dag = Date.UTC(vandaag.getUTCFullYear(), vandaag.getUTCMonth(), vandaag.getUTCDate());
  return new Date(dag + aantalDagen * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
}

/**
 * De kaart met deze kop.
 *
 * De kop zelf zoeken we op rol; `.card` wijst alleen het omhullende blok aan,
 * omdat een kaart geen eigen rol heeft om op te zoeken.
 */
function kaartMetKop(page: Page, kop: string | RegExp): Locator {
  return page.locator('.card').filter({ has: page.getByRole('heading', { name: kop }) });
}

/**
 * De keuzelijst die deze optie aanbiedt.
 *
 * Op de opties zelf zoeken (`getByRole('option')`) werkt hier niet: de opties
 * van een dichtgeklapte `<select>` gelden als verborgen, en verborgen elementen
 * doen niet mee. De tekst van de opties staat wél in de keuzelijst, dus daar
 * pikken we hem aan uit.
 */
function keuzelijstMetOptie(gebied: Locator, optie: string): Locator {
  return gebied.getByRole('combobox').filter({ hasText: optie });
}

test.describe('Repetitie plannen en aanwezigheid melden', () => {
  test.beforeEach(async ({ page }) => {
    await zetTaalVast(page, 'nl');
  });

  test('een beheerder plant een repetitie en vindt hem terug in de lijst', async ({ page, request }) => {
    const token = await haalToken(request, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD);
    await verwijderRepetitiesOpLocatie(request, token, PLANNING_LOCATIE);

    const datum = datumOverDagen(PLANNING_DAGEN_VOORUIT);

    await login(page, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD);
    await page.goto('/rehearsals');

    await expect(page.getByRole('heading', { level: 1, name: 'Repetities' })).toBeVisible();

    await page.getByRole('button', { name: /Repetitie toevoegen/ }).click();

    const formulier = kaartMetKop(page, 'Repetitie toevoegen');
    await expect(formulier).toBeVisible();

    await veldBijLabel(formulier, 'Datum').fill(datum);
    await veldBijLabel(formulier, 'Begintijd').fill('19:45');
    await veldBijLabel(formulier, 'Eindtijd').fill('21:45');
    await veldBijLabel(formulier, 'Locatie').fill(PLANNING_LOCATIE);
    await veldBijLabel(formulier, 'Notities').fill('Aangemaakt door de E2E-test.');
    await keuzelijstMetOptie(formulier, 'Alle orkesten').selectOption({ label: E2E_ORKEST_NAAM });

    await formulier.getByRole('button', { name: 'Opslaan' }).click();

    // Het formulier verdwijnt zodra het opslaan gelukt is
    await expect(formulier).toHaveCount(0);

    // En de repetitie staat in "Komende repetities"
    const lijst = kaartMetKop(page, /Komende repetities/);
    await expect(lijst.getByText(lijstDatum(datum))).toBeVisible();
    await expect(lijst.getByText(PLANNING_LOCATIE)).toBeVisible();

    // Opnieuw laden haalt de lijst vers bij de server op: staat hij er dan nog,
    // dan is hij echt opgeslagen en niet alleen in het scherm blijven hangen.
    await page.reload();
    await expect(kaartMetKop(page, /Komende repetities/).getByText(lijstDatum(datum))).toBeVisible();
  });

  test('een lid meldt zich aan voor een repetitie en daarna weer af', async ({ page, request }) => {
    const token = await haalToken(request, E2E_MEMBER_EMAIL, E2E_MEMBER_PASSWORD);
    const repetitie = await haalRepetitie(request, token, E2E_REPETITIE_AANWEZIGHEID_ID);

    // Vaste beginstand: afwezig. Een vorige ronde kan de aanmelding hebben laten
    // staan, en dan is de knop "Aanmelden" uitgeschakeld.
    await zetAanwezigheidOpAfwezig(request, token, E2E_REPETITIE_AANWEZIGHEID_ID);

    await login(page, E2E_MEMBER_EMAIL, E2E_MEMBER_PASSWORD);
    await page.goto('/rehearsals');

    const regel = kaartMetKop(page, /Komende repetities/).getByText(lijstDatum(repetitie.date));
    await expect(regel).toBeVisible();
    await regel.click();

    const aanwezigheid = kaartMetKop(page, 'Mijn aanwezigheid');
    await expect(aanwezigheid).toBeVisible();
    await expect(aanwezigheid.getByText('Afwezig', { exact: true })).toBeVisible();

    await aanwezigheid.getByRole('button', { name: 'Aanmelden' }).click();
    await expect(aanwezigheid.getByText('Aanwezig', { exact: true })).toBeVisible();

    // De aanmelding moet de server hebben gehaald. Het detailscherm is geen
    // eigen adres, dus na het herladen klikken we de repetitie opnieuw open.
    await page.reload();
    await kaartMetKop(page, /Komende repetities/)
      .getByText(lijstDatum(repetitie.date))
      .click();

    const naHerladen = kaartMetKop(page, 'Mijn aanwezigheid');
    await expect(naHerladen.getByText('Aanwezig', { exact: true })).toBeVisible();

    // En afmelden kan ook weer
    await naHerladen.getByRole('button', { name: 'Afmelden' }).click();
    await expect(naHerladen.getByText('Afwezig', { exact: true })).toBeVisible();
  });

  test('een lid ziet de repetities wel, maar de beheerknoppen niet', async ({ page, request }) => {
    const token = await haalToken(request, E2E_MEMBER_EMAIL, E2E_MEMBER_PASSWORD);
    const repetitie = await haalRepetitie(request, token, E2E_REPETITIE_OVERZICHT_ID);

    await login(page, E2E_MEMBER_EMAIL, E2E_MEMBER_PASSWORD);
    await page.goto('/rehearsals');

    await expect(page.getByRole('heading', { level: 1, name: 'Repetities' })).toBeVisible();
    await expect(kaartMetKop(page, /Komende repetities/).getByText(lijstDatum(repetitie.date))).toBeVisible();

    // Plannen, genereren en herhalen zijn voor de beheerder
    await expect(page.getByRole('button', { name: /Repetitie toevoegen/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Repetities genereren' })).toHaveCount(0);
  });
});
