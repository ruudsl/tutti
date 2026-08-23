/**
 * De dagplanning van een reis.
 *
 * Per reisdag staat hier een uitklapbare kaart met de activiteiten van die
 * dag. Er kan een dag bij, er kan een activiteit bij een dag, en beide kunnen
 * weer weg - een dag met een bevestiging, een activiteit meteen.
 *
 * Wat hier vastligt is wat de gebruiker ziet en doet:
 *   - geen dagen geeft de lege staat met de hint;
 *   - de dagen staan op dagnummer, ook als de server ze door elkaar stuurt;
 *   - een dag klapt open en dicht, en de activiteiten staan er pas als hij
 *     open is (aria-expanded volgt dat, zodat een schermlezer het ook merkt);
 *   - een dag of activiteit toevoegen komt met de ingevulde gegevens bij de
 *     juiste dag uit;
 *   - een dag verwijderen vraagt eerst; een mislukking geeft een melding en
 *     laat de dag staan.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { TourDayPlanningSection } from '../TourDayPlanningSection';
import * as reizenApi from '../../api/tours';
import { showError, showSuccess } from '../../utils/toast';
import type { TourDay } from '../../api/tours';

vi.mock('../../api/tours');

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../utils/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));

vi.mock('../Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icoon-${name}`} />,
}));

const DAGEN: TourDay[] = [
  {
    id: 'dag-2',
    dayDate: '2026-09-11',
    dayNumber: 2,
    title: 'Repetitie en concert',
    description: 'Lange dag',
    activities: [
      {
        id: 'act-repetitie',
        activityType: 'rehearsal',
        title: 'Generale repetitie',
        description: 'In de zaal zelf',
        location: 'Rudolfinum',
        startTime: '10:00',
        isMandatory: true,
        cost: 0,
        sortOrder: 0,
      },
      {
        id: 'act-diner',
        activityType: 'meal',
        title: 'Diner',
        startTime: '18:00',
        isMandatory: false,
        cost: 27.5,
        sortOrder: 1,
      },
    ],
  },
  {
    id: 'dag-1',
    dayDate: '2026-09-10',
    dayNumber: 1,
    title: 'Heenreis',
    activities: [],
  },
];

const verversen = vi.fn();

function metOmgeving(kind: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{kind}</QueryClientProvider>;
}

function toon(dagen: TourDay[] = DAGEN) {
  return render(metOmgeving(<TourDayPlanningSection tourId="reis-praag" days={dagen} onRefresh={verversen} />));
}

/** De uitklapknop van een dag, herkend aan zijn dagnummer. */
function dagKnop(nummer: number) {
  return screen
    .getAllByRole('button', { expanded: false })
    .concat(screen.queryAllByRole('button', { expanded: true }))
    .find((knop) => knop.textContent?.includes(`tours.day ${nummer}`))!;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('TourDayPlanningSection - overzicht', () => {
  it('toont de lege staat met de hint als er nog geen dagen zijn', () => {
    toon([]);

    expect(screen.getByText('tours.noDays')).toBeInTheDocument();
    expect(screen.getByText('tours.addDayHint')).toBeInTheDocument();
  });

  it('zet de dagen op dagnummer, ook als de server ze omgekeerd stuurt', () => {
    toon();

    const koppen = screen.getAllByRole('button').map((knop) => knop.textContent ?? '');
    const eersteDag = koppen.findIndex((tekst) => tekst.includes('tours.day 1'));
    const tweedeDag = koppen.findIndex((tekst) => tekst.includes('tours.day 2'));
    expect(eersteDag).toBeLessThan(tweedeDag);
  });

  it('toont per dag hoeveel activiteiten erin zitten, ook dichtgeklapt', () => {
    toon();

    expect(screen.getByText('2 tours.activities')).toBeInTheDocument();
    expect(screen.getByText('0 tours.activities')).toBeInTheDocument();
    // Dichtgeklapt staat de inhoud er niet; anders zou een reis van tien dagen
    // meteen een muur tekst zijn.
    expect(screen.queryByText('Generale repetitie')).not.toBeInTheDocument();
  });

  it('klapt een dag open en weer dicht', async () => {
    const gebruiker = userEvent.setup();
    toon();

    const knop = dagKnop(2);
    expect(knop).toHaveAttribute('aria-expanded', 'false');

    await gebruiker.click(knop);
    expect(knop).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Generale repetitie')).toBeInTheDocument();
    expect(screen.getByText('Lange dag')).toBeInTheDocument();
    expect(screen.getByText('In de zaal zelf')).toBeInTheDocument();
    expect(screen.getByText(/Rudolfinum/)).toBeInTheDocument();
    // Een verplichte activiteit is als zodanig gemerkt.
    expect(screen.getByText('tours.mandatory')).toBeInTheDocument();
    expect(screen.getByText('27.50')).toBeInTheDocument();

    await gebruiker.click(knop);
    expect(knop).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Generale repetitie')).not.toBeInTheDocument();
  });
});

describe('TourDayPlanningSection - dag toevoegen', () => {
  it('vraagt om een datum voordat er een dag bij kan', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(reizenApi.addTourDay).mockResolvedValue({ id: 'dag-3', message: 'Dag toegevoegd' });
    toon();

    await gebruiker.click(screen.getByText('tours.addDay'));

    const toevoegen = screen.getByRole('button', { name: 'common.add' });
    expect(toevoegen).toBeDisabled();

    await gebruiker.type(document.querySelector('input[type="date"]') as HTMLInputElement, '2026-09-12');
    await gebruiker.type(screen.getByRole('textbox'), 'Terugreis');
    expect(toevoegen).toBeEnabled();

    await gebruiker.click(toevoegen);

    await waitFor(() =>
      expect(reizenApi.addTourDay).toHaveBeenCalledWith('reis-praag', {
        date: '2026-09-12',
        title: 'Terugreis',
      }),
    );
    expect(showSuccess).toHaveBeenCalledWith('Dag toegevoegd');
    expect(verversen).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('meldt het als de dag niet toegevoegd kan worden', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(reizenApi.addTourDay).mockRejectedValue(new Error('400'));
    toon();

    await gebruiker.click(screen.getByText('tours.addDay'));
    await gebruiker.type(document.querySelector('input[type="date"]') as HTMLInputElement, '2026-09-12');
    await gebruiker.click(screen.getByRole('button', { name: 'common.add' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('tours.errorAddDay'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('TourDayPlanningSection - activiteiten', () => {
  it('voegt een activiteit toe aan de dag waar de knop bij stond', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(reizenApi.addDayActivity).mockResolvedValue({ id: 'act-nieuw', message: 'Activiteit toegevoegd' });
    toon();

    // Dag 1 openklappen; de knop "activiteit toevoegen" hoort bij díe dag.
    await gebruiker.click(dagKnop(1));
    await gebruiker.click(screen.getByText('tours.addActivity'));

    const toevoegen = screen.getByRole('button', { name: 'common.add' });
    expect(toevoegen).toBeDisabled();

    await gebruiker.type(document.querySelector('input[type="time"]') as HTMLInputElement, '08:30');
    expect(toevoegen).toBeDisabled();
    const teksten = screen.getAllByRole('textbox');
    await gebruiker.type(teksten[0], 'Vertrek bus');
    expect(toevoegen).toBeEnabled();
    await gebruiker.type(teksten[1], 'Muziekschool');

    await gebruiker.click(toevoegen);

    await waitFor(() =>
      expect(reizenApi.addDayActivity).toHaveBeenCalledWith('reis-praag', 'dag-1', {
        time: '08:30',
        title: 'Vertrek bus',
        description: '',
        location: 'Muziekschool',
      }),
    );
    expect(showSuccess).toHaveBeenCalledWith('Activiteit toegevoegd');
  });

  it('meldt het als de activiteit niet toegevoegd kan worden', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(reizenApi.addDayActivity).mockRejectedValue(new Error('400'));
    toon();

    await gebruiker.click(dagKnop(1));
    await gebruiker.click(screen.getByText('tours.addActivity'));
    await gebruiker.type(document.querySelector('input[type="time"]') as HTMLInputElement, '08:30');
    await gebruiker.type(screen.getAllByRole('textbox')[0], 'Vertrek bus');
    await gebruiker.click(screen.getByRole('button', { name: 'common.add' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('tours.errorAddActivity'));
  });

  it('verwijdert de activiteit waar de prullenbak bij staat', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(reizenApi.deleteDayActivity).mockResolvedValue({ message: 'ok' });
    toon();

    await gebruiker.click(dagKnop(2));
    // De tweede prullenbak hoort bij het diner.
    await gebruiker.click(screen.getAllByLabelText('common.delete')[1]);

    await waitFor(() => expect(reizenApi.deleteDayActivity).toHaveBeenCalledWith('reis-praag', 'dag-2', 'act-diner'));
    expect(showSuccess).toHaveBeenCalledWith('tours.activityDeleted');
  });

  it('meldt het als een activiteit niet verwijderd kan worden', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(reizenApi.deleteDayActivity).mockRejectedValue(new Error('403'));
    toon();

    await gebruiker.click(dagKnop(2));
    await gebruiker.click(screen.getAllByLabelText('common.delete')[0]);

    await waitFor(() => expect(showError).toHaveBeenCalledWith('tours.errorDeleteActivity'));
    expect(screen.getByText('Generale repetitie')).toBeInTheDocument();
  });
});

describe('TourDayPlanningSection - dag verwijderen', () => {
  it('vraagt eerst en verwijdert dan de opengeklapte dag', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(reizenApi.deleteTourDay).mockResolvedValue({ message: 'ok' });
    toon();

    await gebruiker.click(dagKnop(1));
    await gebruiker.click(screen.getByText('tours.deleteDay'));

    expect(screen.getByText('tours.confirmDeleteDay')).toBeInTheDocument();
    expect(reizenApi.deleteTourDay).not.toHaveBeenCalled();

    await gebruiker.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'common.delete' }));

    await waitFor(() => expect(reizenApi.deleteTourDay).toHaveBeenCalledWith('reis-praag', 'dag-1'));
    expect(showSuccess).toHaveBeenCalledWith('tours.dayDeleted');
  });

  it('verwijdert niets als de vraag wordt afgebroken', async () => {
    const gebruiker = userEvent.setup();
    toon();

    await gebruiker.click(dagKnop(1));
    await gebruiker.click(screen.getByText('tours.deleteDay'));
    await gebruiker.click(screen.getByRole('button', { name: 'common.cancel' }));

    expect(screen.queryByText('tours.confirmDeleteDay')).not.toBeInTheDocument();
    expect(reizenApi.deleteTourDay).not.toHaveBeenCalled();
  });

  it('meldt het als de dag niet verwijderd kan worden en laat de dag staan', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(reizenApi.deleteTourDay).mockRejectedValue(new Error('403'));
    toon();

    await gebruiker.click(dagKnop(1));
    await gebruiker.click(screen.getByText('tours.deleteDay'));
    await gebruiker.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'common.delete' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('tours.errorDeleteDay'));
    // De vraag gaat hoe dan ook dicht - onSettled - en de dag staat er nog.
    expect(screen.queryByText('tours.confirmDeleteDay')).not.toBeInTheDocument();
    // De titel staat in de kop als "- Heenreis", achter het streepje.
    expect(screen.getByText(/Heenreis/)).toBeInTheDocument();
  });
});
