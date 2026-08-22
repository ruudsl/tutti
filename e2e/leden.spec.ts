/**
 * Flow: een lid toevoegen en aan een orkest koppelen.
 *
 * Elke vereniging krijgt er leden bij en raakt er leden bij kwijt, en bijna
 * alles hangt aan de orkestkoppeling: wie welke repetities ziet, wie een
 * melding krijgt, wie in het aanwezigheidsoverzicht staat. Een lid dat wel
 * bestaat maar aan geen enkel orkest hangt, ziet een lege applicatie - een
 * fout die pas weken later opvalt. Vandaar dat deze test niet stopt bij
 * "opgeslagen", maar controleert dat het orkest echt bij het lid staat.
 *
 * Draait tegen de gezaaide E2E-database:
 *   DB_PATH=/tmp/harmonie-e2e/harmonie-e2e.db npm run seed:e2e --workspace=backend
 *   DB_PATH=/tmp/harmonie-e2e/harmonie-e2e.db npx playwright test
 */

import { test, expect } from '@playwright/test';
import {
  E2E_ADMIN_EMAIL,
  E2E_ADMIN_PASSWORD,
  E2E_MEMBER_EMAIL,
  E2E_MEMBER_PASSWORD,
  E2E_TWEEDE_ORKEST_NAAM,
  haalToken,
  login,
  veldBijLabel,
  verwijderLidOpEmail,
  zetTaalVast,
} from './hulpfuncties';

/**
 * Het lid dat deze test zelf aanmaakt.
 *
 * Vast adres, geen tijdstempel: de test ruimt vooraf op wat een vorige ronde
 * heeft achtergelaten, en dat kan alleen als hij weet hoe dat heet. Geen andere
 * test raakt dit adres aan.
 */
const NIEUW_LID_EMAIL = 'e2e-nieuw-lid@test.local';
const NIEUW_LID_VOORNAAM = 'Nieuw';
const NIEUW_LID_ACHTERNAAM = 'Testlid';
const NIEUW_LID_WACHTWOORD = 'E2eNieuw!2026';

test.describe('Lid toevoegen en aan een orkest koppelen', () => {
  test.beforeEach(async ({ page }) => {
    await zetTaalVast(page, 'nl');
  });

  test('een beheerder voegt een lid toe en koppelt het aan een orkest', async ({ page, request }) => {
    const token = await haalToken(request, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD);
    await verwijderLidOpEmail(request, token, NIEUW_LID_EMAIL);

    await login(page, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD);
    await page.goto('/users');

    await expect(page.getByRole('heading', { level: 1, name: /Leden/ })).toBeVisible();

    await page.getByRole('button', { name: /Nieuw lid/ }).click();

    const venster = page.getByRole('dialog', { name: 'Nieuw lid' });
    await expect(venster).toBeVisible();

    await veldBijLabel(venster, 'Voornaam').fill(NIEUW_LID_VOORNAAM);
    await veldBijLabel(venster, 'Achternaam').fill(NIEUW_LID_ACHTERNAAM);
    await veldBijLabel(venster, 'E-mail').fill(NIEUW_LID_EMAIL);
    await veldBijLabel(venster, 'Wachtwoord').fill(NIEUW_LID_WACHTWOORD);

    // De orkestkeuze zit wél netjes in zijn label, dus die is op naam te vinden
    await venster.getByRole('checkbox', { name: E2E_TWEEDE_ORKEST_NAAM }).check();

    // Het toevoegvenster verstuurt met "Toevoegen"; het bewerkvenster met "Opslaan"
    await venster.getByRole('button', { name: 'Toevoegen' }).click();

    // Het venster sluit zodra het lid is aangemaakt
    await expect(venster).toHaveCount(0);

    // En het lid staat in de ledenlijst, mét zijn orkest
    const regel = page.getByRole('row').filter({ hasText: NIEUW_LID_EMAIL });
    await expect(regel).toBeVisible();
    await expect(regel).toContainText(`${NIEUW_LID_VOORNAAM} ${NIEUW_LID_ACHTERNAAM}`);
    await expect(regel).toContainText(E2E_TWEEDE_ORKEST_NAAM);

    // Opnieuw laden haalt de lijst vers bij de server op
    await page.reload();
    const regelNaHerladen = page.getByRole('row').filter({ hasText: NIEUW_LID_EMAIL });
    await expect(regelNaHerladen).toBeVisible();
    await expect(regelNaHerladen).toContainText(E2E_TWEEDE_ORKEST_NAAM);
  });

  test('een lid komt niet op de ledenbeheerpagina', async ({ page }) => {
    await login(page, E2E_MEMBER_EMAIL, E2E_MEMBER_PASSWORD);

    await page.goto('/users');

    // De pagina is voor beheerders; een lid wordt teruggestuurd naar zijn eigen
    // startscherm in plaats van de ledenadministratie te zien
    await expect(page.getByRole('heading', { level: 1, name: /Welkom/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Nieuw lid/ })).toHaveCount(0);
  });
});
