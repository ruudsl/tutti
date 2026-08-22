/**
 * De labels van het uitleenformulier horen bij hun veld.
 *
 * In het venster "Nieuwe uitlening" stonden label en veld los naast elkaar in
 * dezelfde `form-group`, zonder `htmlFor` en zonder `id`. Een schermlezer
 * kondigde dan een bewerkbaar veld aan zonder te zeggen wat erin moest, klikken
 * op het label zette de aanwijzer nergens, en een test kon het veld niet op
 * naam vinden.
 *
 * `getByLabelText` is hier dus geen willekeurige zoekmethode maar de kern van
 * de test: die vindt een veld alleen als de koppeling er echt is. Zoeken via de
 * omhullende `.form-group` zou ook slagen op de kapotte code en bewijst niets.
 *
 * Vijf velden lopen sinds de ombouw via `components/FormField`. Het zesde - de
 * titelkeuze - is met de hand gekoppeld, omdat daar geen enkel veld staat
 * zolang er een titel gekozen is en anders een zoekveld met een resultatenlijst
 * eronder. Juist dat handwerk staat hieronder ook, want handwerk raakt eerder
 * zoek dan een component.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import Loans from '../Loans';

vi.mock('../../api', () => ({
  getLoans: async () => [],
  createLoan: async () => ({}),
  returnLoan: async () => ({}),
  deleteLoan: async () => ({}),
  getTitleLoanHistory: async () => ({}),
}));

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

vi.mock('../../hooks/useConfirm', () => ({ useConfirm: () => async () => true }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../components/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

vi.mock('../../components/Skeleton', () => ({
  SkeletonTable: () => <div data-testid="skelet-tabel" />,
}));

function wikkel({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Open het venster "Nieuwe uitlening" zoals een beheerder dat doet. */
async function openUitleenvenster() {
  const gebruiker = userEvent.setup();
  render(<Loans />, { wrapper: wikkel });
  await gebruiker.click(await screen.findByRole('button', { name: /loans.newLoan/ }));
  return gebruiker;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  // De pagina haalt haar statistieken en titellijst rechtstreeks met fetch op.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ json: async () => [] })),
  );
});

describe('uitleenpagina - labels gekoppeld aan hun veld', () => {
  it('vindt de velden van het uitleenvenster op hun labeltekst', async () => {
    await openUitleenvenster();

    expect(await screen.findByLabelText(/loans.borrowerName/)).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('loans.borrowerEmail')).toHaveAttribute('type', 'email');
    expect(screen.getByLabelText('loans.borrowerOrganization')).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('loans.expectedReturnDate')).toHaveAttribute('type', 'date');
    expect(screen.getByLabelText('loans.notes').tagName).toBe('TEXTAREA');
  });

  it('koppelt ook het met de hand gekoppelde titelveld aan zijn label', async () => {
    await openUitleenvenster();

    // Zolang er geen titel gekozen is, staat hier het zoekveld
    expect(await screen.findByLabelText(/loans.musicPiece/)).toHaveAttribute('placeholder', 'loans.searchTitle');
  });

  it('zet de aanwijzer in het veld als je op het label klikt', async () => {
    const gebruiker = await openUitleenvenster();

    // Klikken op het label zet de aanwijzer in het veld: dat kon vóór de
    // koppeling niet, en het is de reden dat een label bij een veld hoort.
    await gebruiker.click(await screen.findByText('loans.borrowerEmail'));
    expect(screen.getByLabelText('loans.borrowerEmail')).toHaveFocus();

    await gebruiker.type(screen.getByLabelText('loans.borrowerEmail'), 'lener@example.org');
    expect(screen.getByLabelText('loans.borrowerEmail')).toHaveValue('lener@example.org');
  });
});
