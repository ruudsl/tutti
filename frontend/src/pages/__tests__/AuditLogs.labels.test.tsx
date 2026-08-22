/**
 * De filterlabels van het logboek horen bij hun veld.
 *
 * Boven de filterbalk stonden vier `form-label`s los van hun veld in dezelfde
 * `form-group`, zonder `htmlFor` en zonder `id`. Voor een schermlezer waren dat
 * twee naamloze keuzelijsten en twee naamloze datumvelden; klikken op een label
 * zette de aanwijzer nergens.
 *
 * Alle vier zijn echte formuliervelden met precies één invoerelement eronder,
 * dus ze lopen sinds de ombouw via `components/FormField`.
 *
 * `getByLabelText` is hier de kern van de test: die vindt een veld alleen als
 * de koppeling er echt is.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import AuditLogs from '../AuditLogs';

vi.mock('../../api', () => ({
  getAuditLogs: async () => ({ logs: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 1 } }),
}));

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../components/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

function wikkel({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('logboek - filterlabels gekoppeld aan hun veld', () => {
  it('vindt de vier filtervelden op hun labeltekst', () => {
    render(<AuditLogs />, { wrapper: wikkel });

    expect(screen.getByLabelText('auditLogs.filterAction').tagName).toBe('SELECT');
    expect(screen.getByLabelText('auditLogs.filterEntity').tagName).toBe('SELECT');
    expect(screen.getByLabelText('auditLogs.dateFrom')).toHaveAttribute('type', 'date');
    expect(screen.getByLabelText('auditLogs.dateTo')).toHaveAttribute('type', 'date');
  });

  it('filtert op de handeling die bij het aangeklikte label hoort', async () => {
    const gebruiker = userEvent.setup();
    render(<AuditLogs />, { wrapper: wikkel });

    // Klikken op het label zet de aanwijzer in de keuzelijst: dat kon vóór de
    // koppeling niet, en het is de reden dat een label bij een veld hoort.
    await gebruiker.click(screen.getByText('auditLogs.filterAction'));
    expect(screen.getByLabelText('auditLogs.filterAction')).toHaveFocus();

    await gebruiker.selectOptions(screen.getByLabelText('auditLogs.filterAction'), 'delete');
    expect(screen.getByLabelText('auditLogs.filterAction')).toHaveValue('delete');
  });
});
