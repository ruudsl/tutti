/**
 * De beschikbaarheidsregels van een middel (zaal, busje, apparaat).
 *
 * Een regel zegt wanneer een middel wél of juist níet te boeken is: elke
 * maandagavond, of een aaneengesloten periode. Het blok toont die regels en
 * heeft een venster om er een bij te maken.
 *
 * Wat hier vastligt:
 *   - geen regels geeft de lege staat met de hint;
 *   - een terugkerende regel leest als dag plus tijdvak, een periode als twee
 *     datums, en zondag (dagnummer 0) is een gewone dag - geen valse
 *     "custom"-regel, want `0` is falsy en dat is precies de valkuil hier;
 *   - het onderscheid beschikbaar/geblokkeerd staat er in woorden bij, met de
 *     reden erachter;
 *   - het venster stuurt bij een terugkerende regel een dagnummer mee en géén
 *     datums, en bij een periode andersom;
 *   - verwijderen vraagt eerst, en een mislukking geeft een melding.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ResourceAvailabilitySection } from '../ResourceAvailabilitySection';
import * as middelenApi from '../../api/resources';
import { showError, showSuccess } from '../../utils/toast';

vi.mock('../../api/resources');

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../utils/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));

vi.mock('../Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icoon-${name}`} />,
}));

const REGELS = [
  {
    id: 'regel-maandag',
    availabilityType: 'available',
    dayOfWeek: 1,
    startTime: '19:00:00',
    endTime: '22:30:00',
  },
  {
    id: 'regel-zondag',
    availabilityType: 'available',
    dayOfWeek: 0,
    startTime: '10:00:00',
    endTime: '12:00:00',
  },
  {
    id: 'regel-verbouwing',
    availabilityType: 'blocked',
    startDate: '2026-07-01',
    endDate: '2026-08-15',
    reason: 'Verbouwing',
  },
];

function metOmgeving(kind: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{kind}</QueryClientProvider>;
}

function toon(regels: typeof REGELS = REGELS) {
  return render(metOmgeving(<ResourceAvailabilitySection resourceId="bron-zaal" availability={regels} />));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ResourceAvailabilitySection - de regels lezen', () => {
  it('toont de lege staat met de hint als er geen regels zijn', () => {
    toon([]);

    expect(screen.getByText('resources.availability.noRules')).toBeInTheDocument();
    expect(screen.getByText('resources.availability.noRulesHint')).toBeInTheDocument();
  });

  it('leest een terugkerende regel als dag plus tijdvak, zonder seconden', () => {
    toon();

    expect(screen.getByText('resources.days.mon 19:00 - 22:30')).toBeInTheDocument();
  });

  it('behandelt zondag als een gewone dag en niet als losse regel', () => {
    toon();

    // Zondag is dagnummer 0. Een controle op `rule.dayOfWeek` alleen zou die
    // als "geen dag" lezen en er `resources.availability.custom` van maken -
    // de gebruiker zou dan een regel zien staan zonder te kunnen zien voor
    // welke dag hij geldt.
    expect(screen.getByText('resources.days.sun 10:00 - 12:00')).toBeInTheDocument();
    expect(screen.queryByText('resources.availability.custom')).not.toBeInTheDocument();
  });

  it('leest een periode als twee datums, met de reden erachter', () => {
    toon();

    expect(screen.getByText('2026-07-01 - 2026-08-15')).toBeInTheDocument();
    expect(screen.getByText(/resources\.availability\.unavailable - Verbouwing/)).toBeInTheDocument();
  });
});

describe('ResourceAvailabilitySection - regel toevoegen', () => {
  async function openVenster() {
    const gebruiker = userEvent.setup();
    toon([]);
    await gebruiker.click(screen.getByText('resources.availability.addRule'));
    return gebruiker;
  }

  it('stuurt bij een terugkerende regel een dagnummer mee en geen datums', async () => {
    vi.mocked(middelenApi.addResourceAvailability).mockResolvedValue({ id: 'nieuw', message: 'ok' });
    const gebruiker = await openVenster();

    await gebruiker.selectOptions(screen.getByRole('combobox'), '3');
    await gebruiker.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() =>
      expect(middelenApi.addResourceAvailability).toHaveBeenCalledWith('bron-zaal', {
        dayOfWeek: 3,
        startTime: '09:00',
        endTime: '17:00',
        isAvailable: true,
      }),
    );
    expect(showSuccess).toHaveBeenCalledWith('resources.availability.added');
  });

  it('stuurt bij een periode datums mee en geen dagnummer', async () => {
    vi.mocked(middelenApi.addResourceAvailability).mockResolvedValue({ id: 'nieuw', message: 'ok' });
    const gebruiker = await openVenster();

    await gebruiker.click(screen.getByLabelText('resources.availability.dateRange'));

    // De dagkeuze hoort weg te zijn zodra het om een periode gaat.
    expect(screen.queryByText('resources.availability.dayOfWeek')).not.toBeInTheDocument();

    const opslaan = screen.getByRole('button', { name: 'common.save' });
    // Zonder begindatum valt er niets op te slaan.
    expect(opslaan).toBeDisabled();

    const datums = document.querySelectorAll('input[type="date"]');
    await gebruiker.type(datums[0] as HTMLInputElement, '2026-07-01');
    expect(opslaan).toBeEnabled();
    await gebruiker.type(datums[1] as HTMLInputElement, '2026-08-15');

    // En het middel is dan juist níet beschikbaar.
    await gebruiker.click(screen.getByLabelText('resources.availability.unavailable'));
    await gebruiker.click(opslaan);

    await waitFor(() =>
      expect(middelenApi.addResourceAvailability).toHaveBeenCalledWith('bron-zaal', {
        startTime: '09:00',
        endTime: '17:00',
        isAvailable: false,
        startDate: '2026-07-01',
        endDate: '2026-08-15',
      }),
    );
  });

  it('houdt de einddatum op of na de begindatum', async () => {
    const gebruiker = await openVenster();

    await gebruiker.click(screen.getByLabelText('resources.availability.dateRange'));
    const datums = document.querySelectorAll('input[type="date"]');
    await gebruiker.type(datums[0] as HTMLInputElement, '2026-07-01');

    // De einddatum krijgt de begindatum als ondergrens mee, zodat de
    // datumkiezer een periode die achteruit loopt niet eens aanbiedt.
    expect(datums[1]).toHaveAttribute('min', '2026-07-01');
  });

  it('meldt het als de regel niet opgeslagen kan worden', async () => {
    vi.mocked(middelenApi.addResourceAvailability).mockRejectedValue(new Error('403'));
    const gebruiker = await openVenster();

    await gebruiker.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('resources.availability.errorAdd'));
    // Het venster blijft staan, met de ingevulde waarden erin.
    expect(screen.getByRole('button', { name: 'common.save' })).toBeInTheDocument();
  });
});

describe('ResourceAvailabilitySection - regel verwijderen', () => {
  it('vraagt eerst, en verwijdert dan de regel waar de knop bij stond', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(middelenApi.deleteResourceAvailability).mockResolvedValue({ message: 'ok' });
    toon();

    // De derde knop hoort bij de verbouwing.
    await gebruiker.click(screen.getAllByLabelText('common.delete')[2]);

    expect(screen.getByText('resources.availability.deleteConfirm')).toBeInTheDocument();
    expect(middelenApi.deleteResourceAvailability).not.toHaveBeenCalled();

    await gebruiker.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'common.delete' }));

    await waitFor(() =>
      expect(middelenApi.deleteResourceAvailability).toHaveBeenCalledWith('bron-zaal', 'regel-verbouwing'),
    );
    expect(showSuccess).toHaveBeenCalledWith('resources.availability.deleted');
  });

  it('verwijdert niets als de vraag wordt afgebroken', async () => {
    const gebruiker = userEvent.setup();
    toon();

    await gebruiker.click(screen.getAllByLabelText('common.delete')[0]);
    await gebruiker.click(screen.getByRole('button', { name: 'common.cancel' }));

    expect(screen.queryByText('resources.availability.deleteConfirm')).not.toBeInTheDocument();
    expect(middelenApi.deleteResourceAvailability).not.toHaveBeenCalled();
  });

  it('meldt het als het verwijderen mislukt en laat de regel staan', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(middelenApi.deleteResourceAvailability).mockRejectedValue(new Error('403'));
    toon();

    await gebruiker.click(screen.getAllByLabelText('common.delete')[0]);
    await gebruiker.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'common.delete' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('resources.availability.errorDelete'));
    expect(screen.getByText('resources.days.mon 19:00 - 22:30')).toBeInTheDocument();
  });
});
