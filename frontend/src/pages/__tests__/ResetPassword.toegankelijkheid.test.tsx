/**
 * Een afgekeurd veld op de pagina "wachtwoord opnieuw instellen" moet ook voor
 * een schermlezer afgekeurd zijn.
 *
 * Het formulier zette bij een fout de klasse `is-invalid` op het veld. Die
 * klasse werd door geen enkele stijlregel opgepakt, dus het veld werd niet eens
 * rood; en belangrijker: een klasse staat niet in de toegankelijkheidsboom. Wie
 * het scherm niet ziet, hoorde alleen een gewoon invoerveld - de foutmelding
 * eronder was los tekstwerk dat nergens aan het veld hing.
 *
 * Deze tests zoeken het veld op via `getByLabelText` en toetsen daarna alleen
 * kenmerken die een schermlezer ook echt gebruikt: aria-invalid, de verwijzing
 * naar de melding, waar de cursor terechtkomt, en of de fout dringend gemeld
 * wordt.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AriaLiveProvider } from '../../components/AriaLiveRegion';
import ResetPassword from '../ResetPassword';

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../components/LanguageSwitcher', () => ({ LanguageSwitcher: () => null }));

vi.mock('../../api', () => ({
  validateResetToken: vi.fn(async () => ({ valid: true })),
  resetPassword: vi.fn(async () => ({})),
}));

/** Tekent het formulier met een geldig herstelteken en wacht tot het er staat. */
async function toonFormulier() {
  const gebruiker = userEvent.setup();
  render(
    <AriaLiveProvider>
      <MemoryRouter initialEntries={['/reset-password?token=geldig']}>
        <ResetPassword />
      </MemoryRouter>
    </AriaLiveProvider>,
  );
  const wachtwoord = await screen.findByLabelText(/resetPassword.newPassword/);
  return { gebruiker, wachtwoord };
}

describe('ResetPassword - een afgekeurd veld in de toegankelijkheidsboom', () => {
  it('markeert een leeg wachtwoordveld als ongeldig', async () => {
    const { gebruiker, wachtwoord } = await toonFormulier();

    await gebruiker.click(screen.getByRole('button', { name: /resetPassword.resetButton/ }));

    expect(wachtwoord).toHaveAttribute('aria-invalid', 'true');
  });

  it('koppelt de foutmelding aan het veld', async () => {
    const { gebruiker, wachtwoord } = await toonFormulier();

    await gebruiker.click(screen.getByRole('button', { name: /resetPassword.resetButton/ }));

    // aria-invalid zegt alleen dát er iets mis is. De verwijzing eronder is wat
    // een schermlezer vertelt wát er mis is; zonder die verwijzing blijft de
    // melding los tekstwerk op het scherm.
    const meldingId = wachtwoord.getAttribute('aria-describedby');
    expect(meldingId).toBeTruthy();
    expect(document.getElementById(meldingId!)).toHaveTextContent('errors.required');
  });

  it('laat een goedgekeurd veld ongemoeid', async () => {
    const { gebruiker, wachtwoord } = await toonFormulier();

    await gebruiker.type(wachtwoord, 'geheim-genoeg');
    await gebruiker.click(screen.getByRole('button', { name: /resetPassword.resetButton/ }));

    expect(wachtwoord).not.toHaveAttribute('aria-invalid');
    // Alleen de herhaling is nog leeg, en die hoort dus wél afgekeurd te zijn.
    expect(screen.getByLabelText(/resetPassword.confirmPassword/)).toHaveAttribute('aria-invalid', 'true');
  });

  it('zet de cursor in het bovenste foute veld', async () => {
    const { gebruiker, wachtwoord } = await toonFormulier();

    await gebruiker.click(screen.getByRole('button', { name: /resetPassword.resetButton/ }));

    expect(document.activeElement).toBe(wachtwoord);
  });

  it('meldt de fout dringend aan de schermlezer', async () => {
    const { gebruiker } = await toonFormulier();

    await gebruiker.click(screen.getByRole('button', { name: /resetPassword.resetButton/ }));

    // Twee lege verplichte velden: de melding noemt het aantal en de eerste fout.
    expect(screen.getByRole('alert')).toHaveTextContent('2 validatiefouten gevonden');
  });

  it('haalt de markering weg zodra het veld verbeterd is', async () => {
    const { gebruiker, wachtwoord } = await toonFormulier();

    await gebruiker.click(screen.getByRole('button', { name: /resetPassword.resetButton/ }));
    expect(wachtwoord).toHaveAttribute('aria-invalid', 'true');

    await gebruiker.type(wachtwoord, 'geheim-genoeg');

    // Dit is de reden dat aria-invalid in de JSX staat en niet met setAttribute
    // wordt neergezet: React draait alleen kenmerken terug die het zelf getekend
    // heeft. Een los gezet aria-invalid zou hier blijven staan.
    expect(wachtwoord).not.toHaveAttribute('aria-invalid');
  });
});
