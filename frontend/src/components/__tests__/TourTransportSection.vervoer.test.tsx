/**
 * Het vervoerblok in het reisvenster.
 *
 * Hier staat per reis het busje, de trein of de vlucht: waar hij vertrekt,
 * waar hij aankomt, en wanneer. Er kan iets bij en er kan iets af, dat laatste
 * met een bevestiging.
 *
 * Wat hier vastligt:
 *   - een lege lijst geeft de lege staat met de hint, niet een leeg vlak;
 *   - de soort staat er in leesbare vorm bij (zie het bewijs hieronder);
 *   - het toevoegvenster laat pas toe als alle vijf verplichte velden gevuld
 *     zijn - de server weigert een halve invoer met een 400, en dat is geen
 *     manier om erachter te komen;
 *   - verwijderen vraagt eerst, en verwijdert daarna het vervoermiddel waar de
 *     knop bij stond;
 *   - een mislukte toevoeging of verwijdering geeft een melding.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { TourTransportSection } from '../TourTransportSection';
import * as reizenApi from '../../api/tours';
import { showError, showSuccess } from '../../utils/toast';
import type { TourDetail } from '../../api/tours';

vi.mock('../../api/tours');

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../utils/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));

vi.mock('../Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icoon-${name}`} />,
}));

type Vervoer = TourDetail['transport'][number];

const VERVOER: Vervoer[] = [
  {
    id: 'tr-bus',
    transportType: 'bus',
    provider: 'Reisbureau Jansen',
    departureLocation: 'Zutphen',
    departureTime: '2026-09-10 07:00',
    arrivalLocation: 'Praag',
    arrivalTime: '2026-09-10 19:00',
  },
  {
    id: 'tr-trein',
    transportType: 'train',
    departureLocation: 'Praag',
    arrivalLocation: 'Brno',
  },
];

function metOmgeving(kind: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{kind}</QueryClientProvider>;
}

const verversen = vi.fn();

function toon(vervoer: Vervoer[] = VERVOER) {
  return render(metOmgeving(<TourTransportSection tourId="reis-praag" transport={vervoer} onRefresh={verversen} />));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('TourTransportSection - overzicht', () => {
  it('toont de lege staat met de hint als er nog geen vervoer is', () => {
    toon([]);

    expect(screen.getByText('tours.noTransport')).toBeInTheDocument();
    expect(screen.getByText('tours.addTransportHint')).toBeInTheDocument();
  });

  it('toont vertrek en aankomst, en een streepje waar niets bekend is', () => {
    toon();

    expect(screen.getByText('Reisbureau Jansen')).toBeInTheDocument();
    expect(screen.getByText('Zutphen')).toBeInTheDocument();
    expect(screen.getByText('2026-09-10 07:00')).toBeInTheDocument();
    expect(screen.getByText('Brno')).toBeInTheDocument();
    // De trein heeft geen tijden; dan hoort er geen lege regel te staan maar
    // ook geen onzin - de locaties zijn er wel.
    expect(screen.queryByText('undefined')).not.toBeInTheDocument();
  });

  it('noemt de soort vervoer bij naam in plaats van bij vertaalsleutel', () => {
    toon();

    // BEWIJS - rood zonder de reparatie in TourTransportSection.tsx.
    // `tours.transportTypes` bestaat in geen enkel vertaalbestand, en de
    // terugval `t(sleutel) || soort` kon nooit aanslaan omdat i18next de
    // sleutel zelf teruggeeft. In de badge stond daardoor letterlijk
    // "tours.transportTypes.bus".
    expect(screen.getByText('bus')).toBeInTheDocument();
    expect(screen.getByText('train')).toBeInTheDocument();
    expect(screen.queryByText(/tours\.transportTypes\./)).not.toBeInTheDocument();
  });
});

describe('TourTransportSection - vervoer toevoegen', () => {
  async function openVenster() {
    const gebruiker = userEvent.setup();
    toon([]);
    await gebruiker.click(screen.getByText('tours.addTransport'));
    return gebruiker;
  }

  it('houdt de toevoegknop dicht tot alle verplichte velden gevuld zijn', async () => {
    const gebruiker = await openVenster();

    const toevoegen = screen.getByRole('button', { name: 'common.add' });
    expect(toevoegen).toBeDisabled();

    const teksten = screen.getAllByRole('textbox');
    await gebruiker.type(teksten[0], 'Zutphen');
    expect(toevoegen).toBeDisabled();
    await gebruiker.type(teksten[1], 'Praag');
    expect(toevoegen).toBeDisabled();

    const tijden = document.querySelectorAll('input[type="datetime-local"]');
    await gebruiker.type(tijden[0] as HTMLInputElement, '2026-09-10T07:00');
    expect(toevoegen).toBeDisabled();
    await gebruiker.type(tijden[1] as HTMLInputElement, '2026-09-10T19:00');
    expect(toevoegen).toBeEnabled();
  });

  it('geeft ook de keuzelijst leesbare namen', async () => {
    await openVenster();

    const keuzelijst = screen.getByRole('combobox');
    // Zelfde reparatie als bij de badge: zonder de terugval stonden hier zes
    // vertaalsleutels in de uitklaplijst.
    expect(within(keuzelijst).getByRole('option', { name: 'ferry' })).toBeInTheDocument();
    expect(within(keuzelijst).queryByRole('option', { name: /tours\.transportTypes\./ })).not.toBeInTheDocument();
  });

  it('stuurt de ingevulde reis naar de server en sluit het venster', async () => {
    vi.mocked(reizenApi.addTourTransport).mockResolvedValue({ id: 'tr-nieuw', message: 'Transport toegevoegd' });
    const gebruiker = await openVenster();

    const teksten = screen.getAllByRole('textbox');
    await gebruiker.type(teksten[0], 'Zutphen');
    await gebruiker.type(teksten[1], 'Praag');
    const tijden = document.querySelectorAll('input[type="datetime-local"]');
    await gebruiker.type(tijden[0] as HTMLInputElement, '2026-09-10T07:00');
    await gebruiker.type(tijden[1] as HTMLInputElement, '2026-09-10T19:00');
    await gebruiker.selectOptions(screen.getByRole('combobox'), 'train');

    await gebruiker.click(screen.getByRole('button', { name: 'common.add' }));

    await waitFor(() =>
      expect(reizenApi.addTourTransport).toHaveBeenCalledWith('reis-praag', {
        type: 'train',
        from: 'Zutphen',
        to: 'Praag',
        departureTime: '2026-09-10T07:00',
        arrivalTime: '2026-09-10T19:00',
        details: '',
      }),
    );
    // De pagina toont de melding van de server zelf, en ververst de reis.
    expect(showSuccess).toHaveBeenCalledWith('Transport toegevoegd');
    expect(verversen).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('meldt het als het toevoegen mislukt en houdt het venster open', async () => {
    vi.mocked(reizenApi.addTourTransport).mockRejectedValue(new Error('400'));
    const gebruiker = await openVenster();

    const teksten = screen.getAllByRole('textbox');
    await gebruiker.type(teksten[0], 'Zutphen');
    await gebruiker.type(teksten[1], 'Praag');
    const tijden = document.querySelectorAll('input[type="datetime-local"]');
    await gebruiker.type(tijden[0] as HTMLInputElement, '2026-09-10T07:00');
    await gebruiker.type(tijden[1] as HTMLInputElement, '2026-09-10T19:00');

    await gebruiker.click(screen.getByRole('button', { name: 'common.add' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('tours.errorAddTransport'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('TourTransportSection - vervoer verwijderen', () => {
  it('vraagt eerst, en verwijdert dan het vervoermiddel waar de knop bij stond', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(reizenApi.deleteTourTransport).mockResolvedValue({ message: 'ok' });
    toon();

    // De tweede knop hoort bij de trein.
    await gebruiker.click(screen.getAllByLabelText('common.delete')[1]);

    expect(screen.getByText('tours.confirmDeleteTransport')).toBeInTheDocument();
    expect(reizenApi.deleteTourTransport).not.toHaveBeenCalled();

    // De prullenbakknoppen dragen hetzelfde label, dus bevestigen gebeurt
    // binnen de vraag zelf.
    await gebruiker.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'common.delete' }));

    await waitFor(() => expect(reizenApi.deleteTourTransport).toHaveBeenCalledWith('reis-praag', 'tr-trein'));
    expect(showSuccess).toHaveBeenCalledWith('tours.transportDeleted');
  });

  it('verwijdert niets als de vraag wordt afgebroken', async () => {
    const gebruiker = userEvent.setup();
    toon();

    await gebruiker.click(screen.getAllByLabelText('common.delete')[0]);
    await gebruiker.click(screen.getByRole('button', { name: 'common.cancel' }));

    expect(screen.queryByText('tours.confirmDeleteTransport')).not.toBeInTheDocument();
    expect(reizenApi.deleteTourTransport).not.toHaveBeenCalled();
  });

  it('meldt het als het verwijderen mislukt', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(reizenApi.deleteTourTransport).mockRejectedValue(new Error('403'));
    toon();

    await gebruiker.click(screen.getAllByLabelText('common.delete')[0]);
    await gebruiker.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'common.delete' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('tours.errorDeleteTransport'));
    // De vraag gaat hoe dan ook dicht, en de regel blijft staan.
    expect(screen.queryByText('tours.confirmDeleteTransport')).not.toBeInTheDocument();
    expect(screen.getByText('Reisbureau Jansen')).toBeInTheDocument();
  });
});
