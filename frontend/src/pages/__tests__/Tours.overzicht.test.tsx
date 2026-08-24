/**
 * Eerste tests voor de reizenpagina.
 *
 * Tours.tsx is 613 regels: een overzicht met tellers, een venster voor een
 * nieuwe reis, en een detailvenster met vier tabbladen (dagen, accommodaties,
 * vervoer en deelnemers) plus het aan- en afmelden. Er was nog geen enkele
 * test.
 *
 * Wat hier vastligt is wat de gebruiker ziet en doet:
 *   - een leeg overzicht geeft de lege staat;
 *   - de teller "aankomend" telt alleen reizen die nog moeten beginnen;
 *   - aanmelden vanaf een kaart meldt aan en doet verder niets anders;
 *   - een mislukte aanmelding geeft een melding en geen wit scherm;
 *   - het detailvenster laat per registratiestatus de juiste knop zien, en
 *     laat er geen zien bij een afgeronde reis;
 *   - de tabbladen tonen hun inhoud, inclusief de lege staten.
 *
 * De tijd staat vast op 1 juni 2026. De pagina vergelijkt de begindatum van
 * elke reis met "nu", en zonder vaste klok zou de teller "aankomend" ergens in
 * 2026 vanzelf omvallen.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import Tours from '../Tours';
import * as reizenApi from '../../api/tours';
import { showError, showSuccess } from '../../utils/toast';
import type { Tour, TourDetail } from '../../api/tours';

vi.mock('../../api/tours');

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../utils/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));

vi.mock('../../components/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icoon-${name}`} />,
}));

vi.mock('../../components/Skeleton', () => ({
  SkeletonCard: () => <div data-testid="skelet-kaart" />,
}));

// De twee secties hebben hun eigen tests; hier telt alleen dat ze op het
// juiste tabblad staan en de juiste reis meekrijgen.
vi.mock('../../components/TourDayPlanningSection', () => ({
  TourDayPlanningSection: ({ tourId, days }: { tourId: string; days: unknown[] }) => (
    <div data-testid="dagplanning" data-reis={tourId} data-aantal={days.length} />
  ),
}));

vi.mock('../../components/TourTransportSection', () => ({
  TourTransportSection: ({ tourId, transport }: { tourId: string; transport: unknown[] }) => (
    <div data-testid="vervoer" data-reis={tourId} data-aantal={transport.length} />
  ),
}));

const REIZEN: Tour[] = [
  {
    id: 'reis-praag',
    name: 'Concertreis Praag',
    destination: 'Praag',
    country: 'Tsjechië',
    startDate: '2026-09-10',
    endDate: '2026-09-15',
    status: 'planning',
    costPerPerson: 425,
    maxParticipants: 60,
    registrationDeadline: '2026-07-01',
    participantCount: 38,
    dayCount: 6,
    createdAt: '2026-01-01',
  },
  {
    id: 'reis-ardennen',
    name: 'Repetitieweekend Ardennen',
    startDate: '2026-02-06',
    endDate: '2026-02-08',
    status: 'completed',
    participantCount: 44,
    dayCount: 3,
    createdAt: '2025-10-01',
  },
];

const DETAIL: TourDetail = {
  ...REIZEN[0],
  createdBy: 'gebr-1',
  createdByName: 'Anne Bakker',
  notes: 'Paspoort meenemen',
  description: 'Vijf dagen met twee concerten',
  participants: [
    {
      id: 'deel-1',
      userId: 'gebr-2',
      firstName: 'Piet',
      lastName: 'Jansen',
      email: 'piet@voorbeeld.nl',
      status: 'confirmed',
      paymentStatus: 'paid',
      paidAmount: 425,
    },
    {
      id: 'deel-2',
      userId: 'gebr-3',
      firstName: 'Klaas',
      lastName: 'de Vries',
      email: 'klaas@voorbeeld.nl',
      status: 'waitlist',
      paymentStatus: 'open',
      paidAmount: 0,
    },
  ],
  days: [{ id: 'dag-1', dayDate: '2026-09-10', dayNumber: 1, activities: [] }],
  accommodations: [
    {
      id: 'acc-1',
      name: 'Hotel Bohemia',
      address: 'Wenceslasplein 1',
      city: 'Praag',
      country: 'Tsjechië',
      checkInDate: '2026-09-10',
      checkOutDate: '2026-09-15',
      roomCount: 30,
      totalCost: 9000,
      phone: '+420 123',
      confirmationNumber: 'BOH-773',
    },
  ],
  transport: [{ id: 'tr-1', transportType: 'bus', departureLocation: 'Zutphen', arrivalLocation: 'Praag' }],
};

function metOmgeving(kind: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{kind}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-06-01T12:00:00Z'));
  vi.mocked(reizenApi.getTours).mockResolvedValue(REIZEN);
  vi.mocked(reizenApi.getTour).mockResolvedValue(DETAIL);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Tours - overzicht', () => {
  it('toont de lege staat als er geen reizen zijn', async () => {
    vi.mocked(reizenApi.getTours).mockResolvedValue([]);

    render(metOmgeving(<Tours />));

    expect(await screen.findByText('tours.noTours')).toBeInTheDocument();
    expect(screen.queryByText('Concertreis Praag')).not.toBeInTheDocument();
  });

  it('telt aankomende reizen vanaf vandaag, niet alles', async () => {
    render(metOmgeving(<Tours />));
    await screen.findByText('Concertreis Praag');

    const totaal = screen.getByText('tours.total').parentElement!;
    expect(within(totaal).getByText('2')).toBeInTheDocument();

    // Praag begint in september 2026, het weekend in de Ardennen was in
    // februari - dus één aankomende reis.
    const aankomend = screen.getByText('tours.upcoming').parentElement!;
    expect(within(aankomend).getByText('1')).toBeInTheDocument();

    // De deelnemersteller telt over alle reizen heen: 38 + 44.
    const deelnemers = screen.getAllByText('tours.participants')[0].parentElement!;
    expect(within(deelnemers).getByText('82')).toBeInTheDocument();
  });

  it('toont het skelet zolang de lijst nog onderweg is', async () => {
    let losMaken: (lijst: Tour[]) => void = () => {};
    vi.mocked(reizenApi.getTours).mockReturnValue(
      new Promise((resolve) => {
        losMaken = resolve;
      }),
    );

    render(metOmgeving(<Tours />));
    expect(screen.getAllByTestId('skelet-kaart')).toHaveLength(2);

    losMaken(REIZEN);
    expect(await screen.findByText('Concertreis Praag')).toBeInTheDocument();
  });

  it('biedt aanmelden alleen aan bij een reis die nog open staat', async () => {
    render(metOmgeving(<Tours />));
    await screen.findByText('Concertreis Praag');

    // Alleen de reis in planning heeft een knop; de afgeronde reis niet.
    expect(screen.getAllByText('tours.register')).toHaveLength(1);
  });
});

describe('Tours - aanmelden vanaf een kaart', () => {
  it('meldt aan zonder het detailvenster te openen', async () => {
    const gebruiker = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.mocked(reizenApi.registerForTour).mockResolvedValue({
      id: 'deel-9',
      status: 'registered',
      message: 'Registratie succesvol',
    });

    render(metOmgeving(<Tours />));
    await screen.findByText('Concertreis Praag');

    await gebruiker.click(screen.getByText('tours.register'));

    await waitFor(() => expect(reizenApi.registerForTour).toHaveBeenCalledWith('reis-praag'));
    // De pagina toont de melding die de server teruggeeft, want alleen die
    // weet of het een plek of de wachtlijst werd.
    expect(showSuccess).toHaveBeenCalledWith('Registratie succesvol');

    // BEWIJS - rood zonder de reparatie in Tours.tsx.
    // De hele kaart heeft een onClick die het detailvenster opent en de
    // aanmeldknop zit daarbinnen. Zonder stopPropagation meldde één klik aan
    // én opende hij het venster, zodat de bevestiging meteen achter een
    // dialoog verdween.
    expect(reizenApi.getTour).not.toHaveBeenCalled();
  });

  it('meldt het als de aanmelding geweigerd wordt', async () => {
    const gebruiker = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.mocked(reizenApi.registerForTour).mockRejectedValue(new Error('400'));

    render(metOmgeving(<Tours />));
    await screen.findByText('Concertreis Praag');

    await gebruiker.click(screen.getByText('tours.register'));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('tours.errorRegister'));
    expect(screen.getAllByText('Concertreis Praag').length).toBeGreaterThan(0);
  });
});

describe('Tours - nieuwe reis', () => {
  it('vraagt om naam, begin- en einddatum voordat er aangemaakt kan worden', async () => {
    const gebruiker = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.mocked(reizenApi.createTour).mockResolvedValue({ id: 'nieuw', message: 'ok' });

    render(metOmgeving(<Tours />));
    await screen.findByText('Concertreis Praag');

    await gebruiker.click(screen.getByText('tours.new'));

    const aanmaken = screen.getByRole('button', { name: 'common.create' });
    expect(aanmaken).toBeDisabled();

    const velden = screen.getAllByRole('textbox');
    await gebruiker.type(velden[0], 'Reis naar Wenen');
    // Alleen een naam is niet genoeg: zonder datums blijft de knop dicht.
    expect(aanmaken).toBeDisabled();

    const datums = document.querySelectorAll('input[type="date"]');
    await gebruiker.type(datums[0] as HTMLInputElement, '2026-10-01');
    expect(aanmaken).toBeDisabled();
    await gebruiker.type(datums[1] as HTMLInputElement, '2026-10-05');
    expect(aanmaken).toBeEnabled();

    await gebruiker.click(aanmaken);

    await waitFor(() => expect(reizenApi.createTour).toHaveBeenCalled());
    // createTour is rechtstreeks de mutationFn; react-query geeft daar een
    // tweede argument bij mee dat niet van ons is.
    expect(vi.mocked(reizenApi.createTour).mock.calls[0][0]).toEqual(
      expect.objectContaining({ name: 'Reis naar Wenen', startDate: '2026-10-01', endDate: '2026-10-05' }),
    );
    expect(showSuccess).toHaveBeenCalledWith('tours.created');
  });

  it('meldt het als het aanmaken mislukt en houdt het venster open', async () => {
    const gebruiker = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.mocked(reizenApi.createTour).mockRejectedValue(new Error('500'));

    render(metOmgeving(<Tours />));
    await screen.findByText('Concertreis Praag');

    await gebruiker.click(screen.getByText('tours.new'));
    await gebruiker.type(screen.getAllByRole('textbox')[0], 'Mislukt');
    const datums = document.querySelectorAll('input[type="date"]');
    await gebruiker.type(datums[0] as HTMLInputElement, '2026-10-01');
    await gebruiker.type(datums[1] as HTMLInputElement, '2026-10-05');
    await gebruiker.click(screen.getByRole('button', { name: 'common.create' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('tours.errorCreate'));
    expect(screen.getByRole('button', { name: 'common.create' })).toBeInTheDocument();
  });
});

describe('Tours - detailvenster', () => {
  // `null` staat er los van DETAIL in: een standaardwaarde springt aan bij
  // `undefined`, dus met undefined zou de reis juist wél gevonden worden.
  async function openDetail(detail: TourDetail | null = DETAIL) {
    vi.mocked(reizenApi.getTour).mockResolvedValue(detail as TourDetail);
    const gebruiker = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(metOmgeving(<Tours />));
    await screen.findByText('Concertreis Praag');
    await gebruiker.click(screen.getByText('Concertreis Praag'));
    return gebruiker;
  }

  /** Het geopende venster; de lijst erachter telt hier niet mee. */
  function venster() {
    return within(screen.getByRole('dialog'));
  }

  it('haalt de aangeklikte reis op en toont de omschrijving en notities', async () => {
    await openDetail();

    await waitFor(() => expect(reizenApi.getTour).toHaveBeenCalledWith('reis-praag'));
    expect(await screen.findByText('Vijf dagen met twee concerten')).toBeInTheDocument();
    expect(screen.getByText('Paspoort meenemen')).toBeInTheDocument();
  });

  it('toont een melding als de reis niet gevonden wordt', async () => {
    await openDetail(null);

    expect(await screen.findByText('tours.notFound')).toBeInTheDocument();
  });

  it('biedt afmelden aan wie al ingeschreven staat, en geen tweede aanmelding', async () => {
    const gebruiker = await openDetail({
      ...DETAIL,
      myRegistration: { status: 'registered', paymentStatus: 'open', paidAmount: 0 },
    });
    vi.mocked(reizenApi.cancelTourRegistration).mockResolvedValue({ message: 'ok' });

    expect(await screen.findByText('tours.participantStatuses.registered')).toBeInTheDocument();
    // In de lijst erachter staat nog een aanmeldknop; hier telt alleen het
    // venster zelf.
    expect(venster().queryByText('tours.register')).not.toBeInTheDocument();

    await gebruiker.click(venster().getByText('tours.cancelRegistration'));

    await waitFor(() => expect(reizenApi.cancelTourRegistration).toHaveBeenCalledWith('reis-praag'));
    expect(showSuccess).toHaveBeenCalledWith('tours.registrationCancelled');
  });

  it('laat wie op de wachtlijst staat niet afmelden', async () => {
    await openDetail({
      ...DETAIL,
      myRegistration: { status: 'waitlist', paymentStatus: 'open', paidAmount: 0 },
    });

    expect(await screen.findByText('tours.participantStatuses.waitlist')).toBeInTheDocument();
    // Afmelden hoort alleen bij een echte plek; een wachtlijstplek geeft geen
    // knop, anders zou de gebruiker denken dat hij iets kwijtraakt wat hij
    // nog niet heeft.
    expect(venster().queryByText('tours.cancelRegistration')).not.toBeInTheDocument();
  });

  it('biedt bij een afgeronde reis geen aanmelding aan', async () => {
    await openDetail({ ...DETAIL, status: 'completed', myRegistration: undefined });

    // De afgeronde reis in de lijst draagt hetzelfde label, dus zoeken binnen
    // het venster.
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent('Vijf dagen met twee concerten'));
    expect(venster().getByText('tours.statuses.completed')).toBeInTheDocument();
    expect(venster().queryByText('tours.register')).not.toBeInTheDocument();
    expect(venster().queryByText('tours.cancelRegistration')).not.toBeInTheDocument();
  });

  it('meldt het als het afmelden mislukt', async () => {
    const gebruiker = await openDetail({
      ...DETAIL,
      myRegistration: { status: 'confirmed', paymentStatus: 'paid', paidAmount: 425 },
    });
    vi.mocked(reizenApi.cancelTourRegistration).mockRejectedValue(new Error('409'));

    await gebruiker.click(await screen.findByText('tours.cancelRegistration'));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('tours.errorCancel'));
  });
});

describe('Tours - tabbladen in het detailvenster', () => {
  async function openDetail(detail: TourDetail = DETAIL) {
    vi.mocked(reizenApi.getTour).mockResolvedValue(detail);
    const gebruiker = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(metOmgeving(<Tours />));
    await screen.findByText('Concertreis Praag');
    await gebruiker.click(screen.getByText('Concertreis Praag'));
    await screen.findByText('Paspoort meenemen');
    return gebruiker;
  }

  it('opent op de dagplanning en geeft die de dagen van deze reis mee', async () => {
    await openDetail();

    const planning = screen.getByTestId('dagplanning');
    expect(planning).toHaveAttribute('data-reis', 'reis-praag');
    expect(planning).toHaveAttribute('data-aantal', '1');
    expect(screen.queryByTestId('vervoer')).not.toBeInTheDocument();
  });

  it('toont de accommodatie met adres, kosten en bevestigingsnummer', async () => {
    const gebruiker = await openDetail();

    await gebruiker.click(screen.getByText('tours.accommodations (1)'));

    expect(await screen.findByText('Hotel Bohemia')).toBeInTheDocument();
    expect(screen.getByText(/Wenceslasplein 1/)).toBeInTheDocument();
    expect(screen.getByText('BOH-773')).toBeInTheDocument();
    expect(screen.getByText('30 tours.rooms')).toBeInTheDocument();
  });

  it('meldt een lege accommodatielijst in plaats van niets', async () => {
    const gebruiker = await openDetail({ ...DETAIL, accommodations: [] });

    await gebruiker.click(screen.getByText('tours.accommodations (0)'));

    expect(await screen.findByText('tours.noAccommodations')).toBeInTheDocument();
  });

  it('geeft het vervoerblok de reis en het vervoer mee', async () => {
    const gebruiker = await openDetail();

    await gebruiker.click(screen.getByText('tours.transport (1)'));

    const vervoer = await screen.findByTestId('vervoer');
    expect(vervoer).toHaveAttribute('data-reis', 'reis-praag');
    expect(vervoer).toHaveAttribute('data-aantal', '1');
  });

  it('toont de deelnemers met status en betaald bedrag', async () => {
    const gebruiker = await openDetail();

    await gebruiker.click(screen.getByText('tours.participants (2)'));

    expect(await screen.findByText('Piet Jansen')).toBeInTheDocument();
    expect(screen.getByText('tours.participantStatuses.waitlist')).toBeInTheDocument();
    // Wie nog niets betaald heeft krijgt een streepje, geen bedrag van nul.
    expect(screen.getByText('-')).toBeInTheDocument();
  });

  it('meldt een lege deelnemerslijst', async () => {
    const gebruiker = await openDetail({ ...DETAIL, participants: [] });

    await gebruiker.click(screen.getByText('tours.participants (0)'));

    expect(await screen.findByText('tours.noParticipants')).toBeInTheDocument();
  });
});
