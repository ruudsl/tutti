/**
 * De labels van het aanmeldscherm horen bij hun veld.
 *
 * Op het formulier "Nieuw lid aanmelden" stonden label en veld los naast elkaar
 * in dezelfde `form-group`, zonder `htmlFor` en zonder `id`. Een schermlezer
 * kondigde een bewerkbaar veld aan zonder te zeggen wat erin moest, klikken op
 * het label zette de aanwijzer nergens, en een test kon het veld niet op naam
 * vinden.
 *
 * `getByLabelText` is hier dus geen willekeurige zoekmethode maar de kern van
 * de test: die vindt een veld alleen als de koppeling er echt is. Zoeken via de
 * omhullende `.form-group` zou ook slagen op de kapotte code en bewijst niets.
 *
 * Vier velden lopen sinds de ombouw via `components/FormField`. Drie zijn met
 * de hand gekoppeld - onder de twee e-mailvelden staat een hulptekst en het
 * instrumentveld zit in een `<Controller>`, die een id niet doorgeeft - en twee
 * koppen blijven een kop: boven de orkestvakjes en boven de fotoknop staat geen
 * veld om naartoe te wijzen. Ook dat handwerk staat hieronder, want handwerk
 * raakt eerder zoek dan een component.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import Onboarding from '../Onboarding';

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../utils/toast', () => ({ showSuccess: () => {}, showError: () => {} }));

// De Microsoft-koppeling staat aan, anders ontbreken het privé-e-mailveld en
// het tabblad met de functietitels.
vi.mock('../../api', () => ({
  onboardMember: async () => ({}),
  getPendingSpondLinks: async () => [],
  deletePendingSpondLink: async () => ({}),
  getInactiveMembers: async () => [],
  reactivateMember: async () => ({}),
  getMicrosoftConfig: async () => ({ configured: true }),
  getM365GroupMappings: async () => [],
  getInstrumentJobTitleMappings: async () => [],
  createInstrumentJobTitleMapping: async () => ({}),
  updateInstrumentJobTitleMapping: async () => ({}),
  deleteInstrumentJobTitleMapping: async () => ({}),
  retryEmailForwarding: async () => ({}),
}));

vi.mock('../../hooks/useInstruments', () => ({
  useInstruments: () => ({ data: [{ id: 'inst-1', name: 'Trompet', tuning: 'Bb' }] }),
}));

vi.mock('../../hooks/useOrchestras', () => ({
  useOrchestras: () => ({ data: [{ id: 'ork-1', name: 'Harmonie' }] }),
}));

function wikkel({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

async function toonAanmeldformulier() {
  const gebruiker = userEvent.setup();
  render(<Onboarding />, { wrapper: wikkel });
  // Het privé-e-mailveld verschijnt pas als de Microsoft-instellingen binnen zijn
  await screen.findByLabelText('memberOnboarding.privateEmail');
  return gebruiker;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('aanmeldscherm - labels gekoppeld aan hun veld', () => {
  it('vindt de velden van het aanmeldformulier op hun labeltekst', async () => {
    await toonAanmeldformulier();

    expect(screen.getByLabelText(/memberOnboarding.firstName/)).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText(/memberOnboarding.lastName/)).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText(/memberOnboarding.email/)).toHaveAttribute('type', 'email');
    expect(screen.getByLabelText('memberOnboarding.privateEmail')).toHaveAttribute('type', 'email');
    expect(screen.getByLabelText('memberOnboarding.instruments').tagName).toBe('SELECT');
  });

  it('brengt de hulpteksten bij het veld waar ze over gaan', async () => {
    await toonAanmeldformulier();

    // De hulptekst staat buiten het label, dus alleen aria-describedby brengt
    // hem bij het veld.
    const email = screen.getByLabelText(/memberOnboarding.email/);
    expect(email).toHaveAttribute('aria-describedby', screen.getByText('memberOnboarding.emailHint').id);

    const instrumenten = screen.getByLabelText('memberOnboarding.instruments');
    expect(instrumenten).toHaveAttribute('aria-describedby', screen.getByText('memberOnboarding.instrumentsHint').id);
  });

  it('typt in het veld dat bij het aangeklikte label hoort', async () => {
    const gebruiker = await toonAanmeldformulier();

    // Klikken op het label zet de aanwijzer in het veld: dat kon vóór de
    // koppeling niet, en het is de reden dat een label bij een veld hoort.
    await gebruiker.click(screen.getByText(/memberOnboarding.firstName/));
    await gebruiker.keyboard('Nieuw');

    expect(screen.getByLabelText(/memberOnboarding.firstName/)).toHaveValue('Nieuw');
  });

  it('geeft de orkestvakjes en de fotoknop een groepskop in plaats van een label', async () => {
    await toonAanmeldformulier();

    // Een <label> hoort bij één veld. Boven de orkestvakjes staat een groep die
    // elk hun eigen label heeft, en boven de fotoknop staat een bestandsveld op
    // display:none dat een schermlezer niet eens ziet staan.
    expect(screen.getByRole('group', { name: 'memberOnboarding.orchestras' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'memberOnboarding.profilePhoto' })).toBeInTheDocument();
  });

  it('koppelt ook de velden op het tabblad met de functietitels', async () => {
    const gebruiker = await toonAanmeldformulier();
    await gebruiker.click(screen.getByRole('button', { name: 'memberOnboarding.tabM365Settings' }));

    expect(await screen.findByLabelText('memberOnboarding.m365Settings.instrument')).toBeInTheDocument();
    expect(screen.getByLabelText('memberOnboarding.m365Settings.jobTitle')).toHaveAttribute(
      'placeholder',
      'memberOnboarding.m365Settings.jobTitlePlaceholder',
    );
  });
});
