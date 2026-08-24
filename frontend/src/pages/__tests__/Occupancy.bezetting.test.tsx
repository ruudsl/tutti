/**
 * De bezettingspagina: hoeveel spelers zitten er in een sectie, en hoeveel
 * zouden er kunnen zitten.
 *
 * Wie hier naar kijkt zoekt één ding: welke sectie is te dun bezet. Dat
 * antwoord komt niet uit een lijst maar uit een som - toegewezen leden tegen
 * leden die het instrument van die sectie spelen - met daarbovenop een
 * drempel: 80 procent is goed bezet, 50 tot 80 is voldoende, daaronder te dun.
 * Precies op die drempels gaat een oordeel om, dus die staan hier vast.
 *
 * Alles op deze pagina is een *wacht*: de sommen klopten al, en deze tests
 * blijven ook op de oude code groen. Ze houden vast wat er nu uitkomt, zodat
 * een verschuiving in de drempels of in het tellen opvalt.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import Occupancy from '../Occupancy';
import { getSeatingSections, getSeatingAssignments } from '../../api';

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../components/Skeleton', () => ({
  SkeletonTable: () => <div data-testid="skelet-tabel" />,
}));

const ORKESTEN = [
  { id: 'ork-1', name: 'Harmonieorkest' },
  { id: 'ork-2', name: 'Opleidingsorkest' },
];

/** Een lid van ork-1 dat één instrument speelt. */
function lid(id: string, instrument: { id: string; name: string }) {
  return {
    id,
    email: `${id}@example.org`,
    firstName: id,
    lastName: 'Speler',
    role: 'member' as const,
    associationId: 'ver-1',
    orchestras: [{ id: 'ork-1', name: 'Harmonieorkest' }],
    instruments: [{ ...instrument, tuning: null, sortOrder: 0 }],
  };
}

const FLUIT = { id: 'ins-fluit', name: 'Fluit' };
const KLARINET = { id: 'ins-klarinet', name: 'Klarinet' };
const HOORN = { id: 'ins-hoorn', name: 'Hoorn' };

const LEDEN = [
  lid('f1', FLUIT),
  lid('f2', FLUIT),
  lid('f3', FLUIT),
  lid('f4', FLUIT),
  lid('f5', FLUIT),
  lid('k1', KLARINET),
  lid('k2', KLARINET),
  lid('h1', HOORN),
  lid('h2', HOORN),
];

function sectie(id: string, naam: string, rij: number, instrumenten: { id: string; name: string }[]) {
  return {
    id,
    name: naam,
    rowNumber: rij,
    sortOrder: rij,
    instruments: instrumenten.map((i) => ({ ...i, tuning: null, sortOrder: 0 })),
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

const SECTIES = [
  sectie('sec-fluit', 'Fluiten', 1, [FLUIT]),
  sectie('sec-klarinet', 'Klarinetten', 2, [KLARINET]),
  sectie('sec-hoorn', 'Hoorns', 3, [HOORN]),
  sectie('sec-leeg', 'Harp', 4, []),
];

function toewijzing(userId: string, sectionId: string) {
  return {
    id: `toe-${userId}`,
    userId,
    userName: userId,
    userEmail: `${userId}@example.org`,
    sectionId,
    sectionName: sectionId,
    rowNumber: 1,
    positionInSection: 1,
    seatLabel: null,
    notes: null,
    instruments: null,
  };
}

// Vier van de vijf fluiten (80 procent), één van de twee klarinetten (50) en
// geen van de twee hoorns (0): precies op en net onder de drie drempels.
const TOEWIJZINGEN = [
  toewijzing('f1', 'sec-fluit'),
  toewijzing('f2', 'sec-fluit'),
  toewijzing('f3', 'sec-fluit'),
  toewijzing('f4', 'sec-fluit'),
  toewijzing('k1', 'sec-klarinet'),
];

vi.mock('../../api', () => ({
  getOrchestras: vi.fn(async () => ORKESTEN),
  getUsers: vi.fn(async () => LEDEN),
  getSeatingSections: vi.fn(async () => SECTIES),
  getSeatingAssignments: vi.fn(async () => TOEWIJZINGEN),
}));

function wikkel({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Zoekt de tabelrij van een sectie op de naam die erin staat. */
async function rijVan(naam: string) {
  const cel = await screen.findByText(naam);
  return cel.closest('tr') as HTMLElement;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('bezetting - de som per sectie', () => {
  it('zet toegewezen tegen mogelijk en rekent dat om naar een percentage', async () => {
    render(<Occupancy />, { wrapper: wikkel });

    const fluiten = await rijVan('Fluiten');
    const cellen = within(fluiten)
      .getAllByRole('cell')
      .map((c) => c.textContent);
    // Toegewezen, mogelijk, percentage.
    expect(cellen[1]).toBe('4');
    expect(cellen[2]).toBe('5');
    expect(cellen[3]).toContain('80%');
  });

  it('noemt een sectie op 80 procent goed bezet', async () => {
    render(<Occupancy />, { wrapper: wikkel });

    const fluiten = await rijVan('Fluiten');
    expect(within(fluiten).getByText('occupancy.wellStaffed')).toBeInTheDocument();
  });

  it('noemt een sectie op 50 procent voldoende', async () => {
    render(<Occupancy />, { wrapper: wikkel });

    const klarinetten = await rijVan('Klarinetten');
    expect(within(klarinetten).getByText('occupancy.adequate')).toBeInTheDocument();
  });

  it('noemt een sectie zonder toegewezen spelers te dun bezet', async () => {
    render(<Occupancy />, { wrapper: wikkel });

    const hoorns = await rijVan('Hoorns');
    expect(within(hoorns).getByText('occupancy.understaffed')).toBeInTheDocument();
  });

  it('zegt bij een sectie zonder spelers dat er niemand is in plaats van nul procent', async () => {
    render(<Occupancy />, { wrapper: wikkel });

    // Zonder deze uitzondering deelt de som door nul en zou de harp als "te dun
    // bezet" op rood komen, terwijl er niemand is die harp speelt.
    const harp = await rijVan('Harp');
    expect(within(harp).getByText('occupancy.noPlayers')).toBeInTheDocument();
    expect(within(harp).getAllByRole('cell')[3]).toHaveTextContent('0%');
  });

  it('toont per instrument hoeveel spelers er zijn en hoeveel er zitten', async () => {
    render(<Occupancy />, { wrapper: wikkel });

    const fluiten = await rijVan('Fluiten');
    expect(within(fluiten).getByText('Fluit (4/5)')).toBeInTheDocument();
  });

  it('zet het rijnummer bij de sectienaam', async () => {
    render(<Occupancy />, { wrapper: wikkel });

    const klarinetten = await rijVan('Klarinetten');
    expect(within(klarinetten).getAllByRole('cell')[0]).toHaveTextContent('seating.row 2');
  });
});

describe('bezetting - de totalen bovenaan', () => {
  it('telt toegewezen, mogelijk, vulgraad en aantal secties', async () => {
    render(<Occupancy />, { wrapper: wikkel });

    await rijVan('Fluiten');
    const kaarten = document.querySelectorAll('.stat-card');
    const waarde = (label: string) =>
      Array.from(kaarten)
        .find((k) => k.querySelector('.stat-label')?.textContent === label)
        ?.querySelector('.stat-value')?.textContent;

    expect(waarde('occupancy.totalAssigned')).toBe('5');
    // 5 fluiten + 2 klarinetten + 2 hoorns; de harp telt niemand mee.
    expect(waarde('occupancy.totalPotential')).toBe('9');
    // 5 van de 9, afgerond.
    expect(waarde('occupancy.fillRate')).toBe('56%');
    expect(waarde('occupancy.totalSections')).toBe('4');
  });
});

describe('bezetting - het orkest kiezen', () => {
  it('kiest vanzelf het eerste orkest, zodat de pagina niet leeg opent', async () => {
    render(<Occupancy />, { wrapper: wikkel });

    const keuze = (await screen.findByLabelText('seating.selectOrchestra')) as HTMLSelectElement;
    await waitFor(() => expect(keuze.value).toBe('ork-1'));
    expect(getSeatingSections).toHaveBeenCalledWith('ork-1');
    expect(getSeatingAssignments).toHaveBeenCalledWith('ork-1');
  });

  it('haalt de secties van het gekozen orkest op', async () => {
    const gebruiker = userEvent.setup();
    render(<Occupancy />, { wrapper: wikkel });

    await rijVan('Fluiten');
    await gebruiker.selectOptions(screen.getByLabelText('seating.selectOrchestra'), 'ork-2');

    await waitFor(() => expect(getSeatingSections).toHaveBeenCalledWith('ork-2'));
    expect(getSeatingAssignments).toHaveBeenCalledWith('ork-2');
  });

  it('zegt het als het gekozen orkest geen secties heeft', async () => {
    vi.mocked(getSeatingSections).mockResolvedValue([]);
    render(<Occupancy />, { wrapper: wikkel });

    expect(await screen.findByText('occupancy.noSections')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });
});
