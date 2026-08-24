/**
 * De drie actieknoppen per concertrij hebben een naam.
 *
 * Ze dragen alleen een pictogram - een oog, een potlood, een prullenbak - en
 * stonden zonder `aria-label`, `title` of tekst in de opmaak. Daarmee heten ze
 * voor een schermlezer helemaal niets: drie keer "knop" achter elkaar, bij elke
 * rij opnieuw.
 *
 * Dat had ook een tweede gevolg. Een E2E-test kan zo'n knop alleen op positie
 * aanwijzen ("de tweede knop in de derde rij"), en zo'n verwijzing breekt bij
 * de eerste kolomwijziging. Daarom ontbrak de E2E-test voor concerten nog: die
 * knoppen moesten eerst een naam krijgen. Deze test bewaakt dat ze die houden.
 *
 * De naam van het concert hoort erbij. Met alleen "Details" hoort iemand die
 * tekst bij elke rij opnieuw zonder te weten waarbij, en kan een test niet
 * onderscheiden welke rij hij aanwijst.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import Concerts from '../Concerts';
import * as api from '../../api';
import type { Concert } from '../../types';

vi.mock('../../api');
vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

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

vi.mock('../../components/SetlistBuilder', () => ({ default: () => <div /> }));
vi.mock('../../components/ConcertPosterGenerator', () => ({ default: () => <div /> }));
vi.mock('../../components/SetlistMode', () => ({ SetlistMode: () => <div /> }));
vi.mock('../../components/CustomFields', () => ({
  CustomFieldFormSection: () => <div />,
  CustomFieldRenderer: () => <div />,
}));
vi.mock('../../utils/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));

function concert(overschrijving: Partial<Concert> = {}): Concert {
  return {
    id: 'c1',
    name: 'Zomerconcert',
    date: '2026-07-01',
    endDate: null,
    location: 'Dorpskerk',
    venueType: null,
    concertType: 'gala',
    description: null,
    notes: null,
    programCount: 3,
    attendanceCount: 0,
    mediaCount: 0,
    createdBy: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overschrijving,
  };
}

function wikkel({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getConcertTypes).mockResolvedValue({ types: [{ value: 'gala', label: 'Gala' }] } as never);
  vi.mocked(api.getConcertYears).mockResolvedValue(['2026']);
  vi.mocked(api.getConcertStatistics).mockResolvedValue({} as never);
  vi.mocked(api.getConcerts).mockResolvedValue({ data: [concert()], total: 1, page: 1, limit: 50 } as never);
});

describe('concertoverzicht - de knoppen per rij hebben een naam', () => {
  it('noemt bij elke knop wat hij doet en met welk concert', async () => {
    render(<Concerts />, { wrapper: wikkel });

    expect(await screen.findByRole('button', { name: 'common.details: Zomerconcert' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'common.edit: Zomerconcert' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'common.delete: Zomerconcert' })).toBeInTheDocument();
  });

  it('houdt de rijen uit elkaar als er meer concerten staan', async () => {
    vi.mocked(api.getConcerts).mockResolvedValue({
      data: [concert(), concert({ id: 'c2', name: 'Kerstconcert', date: '2026-12-20' })],
      total: 2,
      page: 1,
      limit: 50,
    } as never);

    render(<Concerts />, { wrapper: wikkel });

    // Dit is de kern: zonder de naam erbij zijn deze twee niet te
    // onderscheiden, niet voor een schermlezer en niet voor een test.
    expect(await screen.findByRole('button', { name: 'common.delete: Zomerconcert' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'common.delete: Kerstconcert' })).toBeInTheDocument();
  });

  it('laat geen naamloze knop achter in de rij', async () => {
    render(<Concerts />, { wrapper: wikkel });

    await screen.findByRole('button', { name: 'common.details: Zomerconcert' });
    const rij = screen.getByText('Zomerconcert').closest('tr');
    expect(rij).not.toBeNull();

    const naamloos = Array.from(rij!.querySelectorAll('button')).filter(
      (knop) => !(knop.getAttribute('aria-label') || knop.textContent || '').trim(),
    );
    expect(naamloos).toHaveLength(0);
  });
});
