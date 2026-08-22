/**
 * Tests bij drie reparaties in de seizoensplanner.
 *
 * Anders dan de karakteriseringstests ernaast leggen deze niet vast wat de
 * pagina deed, maar wat ze na de reparatie hoort te doen. Elke test hier is
 * rood tegen de code van vóór de reparatie:
 *   - het budgetbedrag kwam bij het verkeerde concert terecht doordat de
 *     budgetstap op de index in de gefilterde lijst schreef;
 *   - de queries draaiden ook voor iemand die de pagina niet mag zien;
 *   - een mislukte afronding van de wizard liet niets op het scherm zien.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import SeasonPlanner from '../SeasonPlanner';
import * as api from '../../api';
import type { SeasonDetail } from '../../api';

vi.mock('../../api');

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

const ingelogdeGebruiker = { rol: 'admin' };
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', name: 'Test', role: ingelogdeGebruiker.rol } }),
}));

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

vi.mock('../../utils/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));

function versSeizoen(): SeasonDetail {
  return {
    id: 'nieuw',
    name: 'Seizoen 2027',
    startDate: '2026-09-01',
    endDate: '2027-06-30',
    templateId: null,
    templateName: null,
    status: 'draft',
    budgetTotal: null,
    budgetAllocated: 0,
    notes: null,
    createdBy: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    events: [],
  };
}

function zetApiKlaar(): void {
  vi.mocked(api.getSeasons).mockResolvedValue([]);
  vi.mocked(api.getSeasonTemplates).mockResolvedValue([]);
  vi.mocked(api.getOrchestras).mockResolvedValue([]);
  vi.mocked(api.getConcertTypes).mockResolvedValue({ concertTypes: [], mediaTypes: [] });
  vi.mocked(api.getSeason).mockResolvedValue(versSeizoen());
  vi.mocked(api.createSeason).mockResolvedValue({ id: 'nieuw', message: 'aangemaakt' });
  vi.mocked(api.generateSeasonEvents).mockResolvedValue({
    message: 'aangemaakt',
    rehearsalCount: 0,
    concertCount: 0,
    rehearsalDates: [],
    concertNames: [],
  });
}

function wikkel({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

async function wachtTotGeladen(): Promise<void> {
  await waitFor(() => expect(screen.queryByTestId('skelet-tabel')).not.toBeInTheDocument());
}

/** De knop 'volgende' onderaan de wizard, elke keer opnieuw opgezocht. */
function volgendeKnop(): HTMLElement {
  return screen.getAllByRole('button').find((knop) => knop.textContent?.includes('common.next'))!;
}

function knopMetTekst(deel: string): HTMLElement {
  return screen.getAllByRole('button').find((knop) => knop.textContent?.includes(deel))!;
}

/** Opent de wizard en vult de eerste stap in, zodat er doorgeklikt kan worden. */
async function openWizardEnVulInfoIn(gebruiker: ReturnType<typeof userEvent.setup>): Promise<void> {
  await wachtTotGeladen();
  await gebruiker.click(screen.getByText('seasonPlanner.newSeason'));

  await gebruiker.type(screen.getByPlaceholderText('seasonPlanner.fields.namePlaceholder'), 'Seizoen 2027');
  const datumvelden = document.querySelectorAll<HTMLInputElement>('input[type="date"]');
  await gebruiker.type(datumvelden[0], '2026-09-01');
  await gebruiker.type(datumvelden[1], '2027-06-30');
}

beforeEach(() => {
  vi.clearAllMocks();
  ingelogdeGebruiker.rol = 'admin';
  zetApiKlaar();
});

describe('seizoensplanner - budget komt bij het juiste concert', () => {
  // De budgetstap toont alleen concerten mét naam. Schrijft hij het bedrag weg
  // op de index in díe gefilterde lijst, dan komt bij een naamloos concert
  // vooraan alles één plek op: het eerste bedrag belandt op het naamloze
  // concert dat niet eens op het scherm staat, en het tweede bij het concert
  // waar het eerste bedrag hoorde.
  it('schrijft het bedrag naar het concert waar de rij bij hoort, ook met een naamloos concert ervoor', async () => {
    const gebruiker = userEvent.setup();
    render(<SeasonPlanner />, { wrapper: wikkel });

    await openWizardEnVulInfoIn(gebruiker);
    await gebruiker.click(volgendeKnop()); // naar de repetities
    await gebruiker.click(volgendeKnop()); // naar de concerten

    expect(await screen.findByText('seasonPlanner.wizard.concertsTitle')).toBeInTheDocument();

    // Drie concerten: het eerste blijft naamloos, de twee erna krijgen naam en
    // datum. Zonder naam telt een concert niet mee in de budgetstap.
    for (let keer = 0; keer < 3; keer++) {
      await gebruiker.click(knopMetTekst('seasonPlanner.wizard.addConcert'));
    }

    const naamvelden = screen.getAllByPlaceholderText('seasonPlanner.fields.concertName');
    const concertDatums = document.querySelectorAll<HTMLInputElement>('input[type="date"]');
    await gebruiker.type(naamvelden[1], 'Kerstconcert');
    await gebruiker.type(concertDatums[1], '2026-12-20');
    await gebruiker.type(naamvelden[2], 'Zomerconcert');
    await gebruiker.type(concertDatums[2], '2027-06-01');

    await gebruiker.click(volgendeKnop()); // naar het budget

    expect(await screen.findByText('seasonPlanner.wizard.budgetTitle')).toBeInTheDocument();

    const bedragvelden = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="number"]'));
    expect(bedragvelden).toHaveLength(2);

    // De volgorde op het scherm blijft die van de concertenlijst: eerst het
    // kerstconcert, dan het zomerconcert. Het naamloze concert staat er niet.
    // Het label staat als span direct vóór het bedragveld.
    const labels = bedragvelden.map((veld) => veld.previousElementSibling?.textContent);
    expect(labels).toEqual(['Kerstconcert', 'Zomerconcert']);
    await gebruiker.type(bedragvelden[0], '500');
    await gebruiker.type(bedragvelden[1], '750');

    await gebruiker.click(volgendeKnop()); // naar het overzicht
    await gebruiker.click(await screen.findByText('seasonPlanner.wizard.finish'));

    await waitFor(() => expect(api.generateSeasonEvents).toHaveBeenCalled());
    const meegegeven = vi.mocked(api.generateSeasonEvents).mock.calls[0][1];
    expect(meegegeven.concerts).toEqual([
      expect.objectContaining({ name: 'Kerstconcert', budgetAmount: 500 }),
      expect.objectContaining({ name: 'Zomerconcert', budgetAmount: 750 }),
    ]);
  });
});

describe('seizoensplanner - geen queries zonder rechten', () => {
  it('haalt niets op voor een gewoon lid', async () => {
    ingelogdeGebruiker.rol = 'member';

    render(<SeasonPlanner />, { wrapper: wikkel });

    expect(await screen.findByText('common.noPermission')).toBeInTheDocument();

    // Even doorlopen zodat een query die tóch afgevuurd wordt de kans krijgt
    // om zichtbaar te worden; zonder deze wachtstap zou de test ook slagen
    // omdat er nog niets gebeurd is.
    await waitFor(() => expect(screen.getByText('common.noPermission')).toBeInTheDocument());

    expect(api.getSeasons).not.toHaveBeenCalled();
    expect(api.getSeasonTemplates).not.toHaveBeenCalled();
    expect(api.getOrchestras).not.toHaveBeenCalled();
    expect(api.getConcertTypes).not.toHaveBeenCalled();
  });

  it('haalt alles gewoon op voor een beheerder', async () => {
    render(<SeasonPlanner />, { wrapper: wikkel });

    await waitFor(() => {
      expect(api.getSeasons).toHaveBeenCalled();
      expect(api.getSeasonTemplates).toHaveBeenCalled();
      expect(api.getOrchestras).toHaveBeenCalled();
      expect(api.getConcertTypes).toHaveBeenCalled();
    });
  });
});

describe('seizoensplanner - mislukte afronding van de wizard', () => {
  it('toont de foutmelding op het scherm en blijft op de overzichtsstap staan', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(api.createSeason).mockRejectedValue(new Error('Seizoen bestaat al'));

    render(<SeasonPlanner />, { wrapper: wikkel });

    await openWizardEnVulInfoIn(gebruiker);
    for (let stap = 0; stap < 4; stap++) {
      await gebruiker.click(volgendeKnop());
    }

    expect(await screen.findByText('seasonPlanner.wizard.reviewTitle')).toBeInTheDocument();
    await gebruiker.click(screen.getByText('seasonPlanner.wizard.finish'));

    const melding = await screen.findByRole('alert');
    expect(melding).toHaveTextContent('Seizoen bestaat al');

    // De gebruiker staat nog op het overzicht en kan het opnieuw proberen.
    expect(screen.getByText('seasonPlanner.wizard.reviewTitle')).toBeInTheDocument();
    expect(screen.getByText('seasonPlanner.wizard.finish')).toBeInTheDocument();
  });

  it('haalt de foutmelding weg zodra een volgende poging lukt', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(api.createSeason)
      .mockRejectedValueOnce(new Error('Seizoen bestaat al'))
      .mockResolvedValue({ id: 'nieuw', message: 'aangemaakt' });

    render(<SeasonPlanner />, { wrapper: wikkel });

    await openWizardEnVulInfoIn(gebruiker);
    for (let stap = 0; stap < 4; stap++) {
      await gebruiker.click(volgendeKnop());
    }

    await gebruiker.click(await screen.findByText('seasonPlanner.wizard.finish'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Seizoen bestaat al');

    await gebruiker.click(screen.getByText('seasonPlanner.wizard.finish'));

    await waitFor(() => expect(api.generateSeasonEvents).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });
});
