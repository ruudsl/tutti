/**
 * Een afgekeurd veld in het ledenformulier moet ook voor een schermlezer
 * afgekeurd zijn.
 *
 * Het formulier zette bij een fout de klasse `is-invalid` op het veld. Die
 * klasse werd door geen enkele stijlregel opgepakt, dus het veld werd niet eens
 * rood; en een klasse staat sowieso niet in de toegankelijkheidsboom. De
 * foutmelding hing er wel al via aria-describedby aan, maar zonder aria-invalid
 * krijgt een schermlezer die melding pas te horen als de cursor toevallig in
 * het veld staat - er ging geen enkel signaal uit dat het veld is afgekeurd.
 *
 * Wat hier getoetst wordt zijn alleen kenmerken die een schermlezer ook echt
 * gebruikt: aria-invalid, de verwijzing naar de melding, en of de fout dringend
 * gemeld wordt.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { AriaLiveProvider } from '../../components/AriaLiveRegion';
import Users from '../Users';

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../components/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

vi.mock('../../components/Skeleton', () => ({ SkeletonTable: () => <div data-testid="skelet-tabel" /> }));

vi.mock('../../components/CustomFields', () => ({ CustomFieldFormSection: () => <div data-testid="eigen-velden" /> }));

vi.mock('../../utils/downloadUrl', () => ({ useDownloadToken: () => null }));

const { muteerder } = vi.hoisted(() => ({
  muteerder: () => ({ mutate: () => {}, mutateAsync: async () => {}, isPending: false }),
}));

vi.mock('../../hooks/useUsers', () => ({
  useUsers: () => ({ data: [], isLoading: false }),
  useCreateUser: muteerder,
  useUpdateUser: muteerder,
  useDeleteUser: muteerder,
}));

vi.mock('../../hooks/useInstruments', () => ({
  useInstruments: () => ({ data: [{ id: 'inst-1', name: 'Trompet', tuning: 'Bb', clef: 'sol' }], isLoading: false }),
}));

vi.mock('../../hooks/useOrchestras', () => ({
  useOrchestras: () => ({ data: [{ id: 'ork-1', name: 'Harmonie' }], isLoading: false }),
}));

function wikkel({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return (
    <AriaLiveProvider>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </AriaLiveProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

/** Opent "Nieuw lid" en drukt meteen op Toevoegen, met alles nog leeg. */
async function verzendLeegLedenvenster() {
  const gebruiker = userEvent.setup();
  render(<Users />, { wrapper: wikkel });
  await gebruiker.click(await screen.findByRole('button', { name: /users.newMember/ }));
  const venster = await screen.findByRole('dialog');
  await gebruiker.click(within(venster).getByRole('button', { name: /common.add/ }));
  return { gebruiker, venster };
}

describe('Users - een afgekeurd veld in de toegankelijkheidsboom', () => {
  it('markeert de lege verplichte velden als ongeldig', async () => {
    await verzendLeegLedenvenster();

    expect(await screen.findByLabelText(/users.firstName/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(/users.lastName/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(/users.email/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(/users.password/)).toHaveAttribute('aria-invalid', 'true');
  });

  it('koppelt de foutmelding aan het veld', async () => {
    await verzendLeegLedenvenster();

    // aria-invalid zegt alleen dát er iets mis is; deze verwijzing zegt wát.
    const voornaam = await screen.findByLabelText(/users.firstName/);
    const meldingId = voornaam.getAttribute('aria-describedby');
    expect(meldingId).toBeTruthy();
    expect(document.getElementById(meldingId!)).toHaveTextContent('errors.required');
  });

  it('meldt de fouten dringend aan de schermlezer', async () => {
    await verzendLeegLedenvenster();

    expect(await screen.findByRole('alert')).toHaveTextContent('4 validatiefouten gevonden');
  });

  it('zet de cursor in het bovenste foute veld', async () => {
    await verzendLeegLedenvenster();

    expect(document.activeElement).toBe(await screen.findByLabelText(/users.firstName/));
  });

  it('houdt de hulptekst bij het wachtwoord zolang dat veld nog in orde is', async () => {
    const gebruiker = userEvent.setup();
    render(<Users />, { wrapper: wikkel });
    await gebruiker.click(await screen.findByRole('button', { name: /users.newMember/ }));

    // Nog niets verzonden: het wachtwoordveld is niet afgekeurd en wijst dus
    // naar de hulptekst, niet naar een foutmelding.
    const wachtwoord = screen.getByLabelText(/users.password/);
    expect(wachtwoord).not.toHaveAttribute('aria-invalid');
    const hulpId = wachtwoord.getAttribute('aria-describedby');
    expect(hulpId).toBeTruthy();
    expect(document.getElementById(hulpId!)).toHaveTextContent('errors.passwordTooShort');
  });

  it('haalt de markering weg zodra het veld verbeterd is', async () => {
    const { gebruiker } = await verzendLeegLedenvenster();

    const voornaam = await screen.findByLabelText(/users.firstName/);
    expect(voornaam).toHaveAttribute('aria-invalid', 'true');

    await gebruiker.type(voornaam, 'Marieke');

    // Dit is de reden dat aria-invalid in de JSX staat en niet met setAttribute
    // wordt neergezet: React draait alleen kenmerken terug die het zelf getekend
    // heeft. Een los gezet aria-invalid zou hier blijven staan, en het veld voor
    // een schermlezer afgekeurd houden nadat het al verbeterd is.
    expect(voornaam).not.toHaveAttribute('aria-invalid');
  });
});
