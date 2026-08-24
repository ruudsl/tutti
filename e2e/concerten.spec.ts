/**
 * Flow: een concert met een programma.
 *
 * Dit is de andere helft van wat een vereniging doet. De repetities lopen elke
 * week door (`repetities.spec.ts`); een concert is waar dat naartoe werkt. De
 * beheerder zet het in de agenda en vult het programma, en dat programma is
 * geen bijzaak: het gaat mee naar de Buma/Stemra-opgave en naar de poster.
 *
 * Deze test ontbrak lang, en niet omdat hij vergeten was. De drie actieknoppen
 * per rij droegen alleen een pictogram zonder toegankelijke naam, dus een test
 * kon ze alleen op positie aanwijzen - "de tweede knop in de derde rij" - en
 * zo'n verwijzing breekt bij de eerste kolomwijziging. Die knoppen hebben nu
 * een `aria-label` met de naam van het concert erin; `Concerts.knopnamen.test.tsx`
 * bewaakt dat ze die houden.
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
  haalToken,
  login,
  verwijderConcertenMetNaam,
  zetTaalVast,
} from './hulpfuncties';

/**
 * De naam die deze test op zijn eigen concert zet.
 *
 * Geen enkele andere test gebruikt deze tekst, dus het opruimen vooraf raakt
 * alleen wat van deze test is.
 */
const CONCERT_NAAM = 'E2E Najaarsconcert';

/** Een stuk dat verder nergens in de gezaaide gegevens voorkomt. */
const PROGRAMMA_TITEL = 'E2E Ouverture';
const PROGRAMMA_ARRANGEUR = 'E2E Arrangeur';

/** Een datum ruim vooruit, zodat het concert niet tussen de gezaaide valt. */
function datumOverDagen(aantalDagen: number): string {
  const vandaag = new Date();
  const dag = Date.UTC(vandaag.getUTCFullYear(), vandaag.getUTCMonth(), vandaag.getUTCDate());
  return new Date(dag + aantalDagen * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
}

/** Het venster met deze kop. */
function vensterMetKop(page: Page, kop: string | RegExp): Locator {
  return page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: kop }) });
}

test.describe('Een concert met een programma', () => {
  test.beforeEach(async ({ page }) => {
    await zetTaalVast(page, 'nl');
  });

  test('een beheerder maakt een concert aan en vult het programma', async ({ page, request }) => {
    const token = await haalToken(request, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD);
    await verwijderConcertenMetNaam(request, token, CONCERT_NAAM);

    const datum = datumOverDagen(90);

    await login(page, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD);
    await page.goto('/concerts');

    // De kop heet "Concert-archief" en draagt een teller-badge, dus zijn
    // toegankelijke naam eindigt op een getal. Vandaar een deeltekst.
    await expect(page.getByRole('heading', { level: 1, name: /Concert-archief/ })).toBeVisible();

    // Twee ingangen met dezelfde bedoeling: de knop in de kop en de zwevende
    // knop rechtsonder (aria-label "Nieuw concert"). Hier expliciet de
    // eerste, zodat de test niet afhangt van de volgorde in de opmaak.
    await page.getByRole('button', { name: '+ Nieuw concert' }).click();

    const formulier = vensterMetKop(page, 'Nieuw concert');
    await expect(formulier).toBeVisible();

    await formulier.getByLabel(/Naam concert/).fill(CONCERT_NAAM);
    await formulier.getByLabel(/^Datum/).fill(datum);
    await formulier.getByLabel('Locatie').fill('E2E Concertzaal');
    await formulier.getByRole('button', { name: 'Opslaan' }).click();

    await expect(formulier).toHaveCount(0);

    // Het concert staat in de lijst, en de knop draagt zijn naam - precies wat
    // deze test eerder onmogelijk maakte.
    const details = page.getByRole('button', { name: `Details: ${CONCERT_NAAM}` });
    await expect(details).toBeVisible();

    // Programma vullen
    await details.click();
    const detailvenster = vensterMetKop(page, CONCERT_NAAM);
    await expect(detailvenster).toBeVisible();

    await detailvenster.getByRole('button', { name: /Stuk toevoegen/ }).click();

    const stukvenster = vensterMetKop(page, 'Stuk toevoegen');
    await stukvenster.getByLabel(/^Titel/).fill(PROGRAMMA_TITEL);
    await stukvenster.getByLabel('Arrangeur').fill(PROGRAMMA_ARRANGEUR);
    await stukvenster.getByRole('button', { name: 'Opslaan' }).click();
    await expect(stukvenster).toHaveCount(0);

    await expect(detailvenster.getByText(PROGRAMMA_TITEL)).toBeVisible();

    // Opnieuw laden haalt alles vers bij de server op: staat het er dan nog,
    // dan is het echt opgeslagen en niet alleen in het scherm blijven hangen.
    await page.reload();
    await page.getByRole('button', { name: `Details: ${CONCERT_NAAM}` }).click();
    await expect(vensterMetKop(page, CONCERT_NAAM).getByText(PROGRAMMA_TITEL)).toBeVisible();
  });

  test('een lid komt niet op de concertenpagina', async ({ page }) => {
    await login(page, E2E_MEMBER_EMAIL, E2E_MEMBER_PASSWORD);

    await page.goto('/concerts');

    // De pagina is voor beheer, muziekcommissie en dirigent; een gewoon lid
    // wordt teruggestuurd naar zijn eigen startscherm.
    await expect(page.getByRole('heading', { level: 1, name: /Welkom/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Nieuw concert/ })).toHaveCount(0);
  });
});
