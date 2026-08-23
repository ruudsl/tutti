/**
 * Het logboek kreeg `changes` binnen als object en probeerde er JSON.parse op te doen.
 *
 * De server geeft dat veld al geparsed terug - `routes/audit-logs.ts` doet
 * `changes: log.changes ? JSON.parse(log.changes) : null` voordat het antwoord
 * de deur uit gaat. De frontend typeerde het als `string` en deed er nog een
 * keer JSON.parse overheen. Dat werkt niet: JSON.parse dwingt zijn argument
 * eerst naar tekst af, een object wordt "[object Object]", en dat is geen
 * geldige JSON. De catch eronder viel dan terug op `<span>{changes}</span>` -
 * met het object erin, waar React op afslaat:
 *
 *   Objects are not valid as a React child (found: object with keys
 *   {orchestraId, listType})
 *
 * Die twee sleutels komen uit `routes/music-lists.ts:589`. Elke regel met een
 * gevulde `changes` sloopte dus de hele pagina, niet alleen die ene rij.
 *
 * Beide vormen worden nu verdragen: tekst die nog JSON is (oudere regels, en
 * wat de bestaande frontendtypering beloofde) en het object dat de server
 * werkelijk stuurt.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import AuditLogs from '../AuditLogs';

const regels: unknown[] = [];

vi.mock('../../api', () => ({
  getAuditLogs: async () => ({
    logs: regels,
    pagination: { page: 1, limit: 50, total: regels.length, totalPages: 1 },
    total: regels.length,
    page: 1,
    pageSize: 50,
  }),
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

function regel(changes: unknown) {
  return {
    id: 'log-1',
    userId: 'gebruiker-1',
    userName: 'Ria de Groot',
    action: 'create',
    entityType: 'music_list',
    entityId: 'lijst-1',
    entityName: 'Kerstconcert',
    changes,
    ipAddress: '192.0.2.1',
    userAgent: 'test',
    createdAt: '2026-08-23T12:00:00.000Z',
  };
}

beforeEach(() => {
  regels.length = 0;
  vi.clearAllMocks();
});

describe('logboek - een wijziging die als object binnenkomt', () => {
  it('toont de wijziging in plaats van de pagina te slopen', async () => {
    // Precies wat de server stuurt: al geparsed, met de sleutels uit music-lists.ts.
    regels.push(regel({ orchestraId: 'orkest-1', listType: 'concert' }));

    render(<AuditLogs />, { wrapper: wikkel });

    // Zonder de reparatie komt deze regel nooit in beeld: React gooit tijdens
    // het renderen op het kale object en de hele pagina valt om.
    expect(await screen.findByText('Kerstconcert')).toBeInTheDocument();
    expect(screen.getByText('auditLogs.viewChanges')).toBeInTheDocument();

    // Beide sleutels in hetzelfde blok. Niet los op /concert/ zoeken: dat
    // matcht ook de naam "Kerstconcert" een kolom verderop.
    const blok = screen.getByText(/orkest-1/);
    expect(blok).toHaveTextContent('orchestraId');
    expect(blok).toHaveTextContent('listType');
    expect(blok).toHaveTextContent('concert');
  });

  it('verdraagt nog steeds een wijziging die als JSON-tekst binnenkomt', async () => {
    regels.push(regel(JSON.stringify({ orchestraId: 'orkest-2', listType: 'regular' })));

    render(<AuditLogs />, { wrapper: wikkel });

    expect(await screen.findByText('Kerstconcert')).toBeInTheDocument();
    expect(screen.getByText('auditLogs.viewChanges')).toBeInTheDocument();
    expect(screen.getByText(/orkest-2/)).toBeInTheDocument();
  });

  it('toont tekst die geen JSON is gewoon als tekst', async () => {
    regels.push(regel('handmatig aangepast'));

    render(<AuditLogs />, { wrapper: wikkel });

    expect(await screen.findByText('handmatig aangepast')).toBeInTheDocument();
  });

  it('laat de kolom leeg als er geen wijziging bij hoort', async () => {
    regels.push(regel(null));

    render(<AuditLogs />, { wrapper: wikkel });

    expect(await screen.findByText('Kerstconcert')).toBeInTheDocument();
    expect(screen.queryByText('auditLogs.viewChanges')).not.toBeInTheDocument();
  });
});
