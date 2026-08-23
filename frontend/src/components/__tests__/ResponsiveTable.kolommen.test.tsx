/**
 * De meebewegende tabel: rijen op een breed scherm, kaarten op een smal.
 *
 * De kolomdefinitie kent twee schakelaars die met dat wisselen te maken
 * hebben: `hideOnMobile` (deze kolom hoort niet op een klein scherm) en
 * `showInCard` (deze kolom hoort niet in de kaartweergave). De eerste werkte
 * alleen in de tabel, en juist niet in de kaarten - zie 'een kolom die niet op
 * een klein scherm hoort'.
 *
 * jsdom kent `window.matchMedia` niet, dus die wordt hier nagebootst. Dat is
 * meteen de knop waarmee deze tests tussen breed en smal wisselen.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { ResponsiveTable, createColumn } from '../ResponsiveTable';
import type { ColumnDefinition, SortDirection } from '../ResponsiveTable';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_sleutel: string, standaard?: string) => standaard ?? _sleutel,
    i18n: { language: 'nl' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../hooks/useDarkMode', () => ({ useDarkMode: () => ({ isDark: false }) }));

vi.mock('../Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

interface Lid {
  id: string;
  naam: string;
  instrument: string;
  telefoon: string;
}

const LEDEN: Lid[] = [
  { id: '1', naam: 'Anna Aalders', instrument: 'Fluit', telefoon: '06-1111' },
  { id: '2', naam: 'Bram Bakker', instrument: 'Hoorn', telefoon: '06-2222' },
];

const KOLOMMEN: ColumnDefinition<Lid>[] = [
  { id: 'naam', header: 'Naam', accessor: (r) => r.naam, sortable: true },
  { id: 'instrument', header: 'Instrument', accessor: (r) => r.instrument, cardLabel: 'Speelt' },
  { id: 'telefoon', header: 'Telefoon', accessor: (r) => r.telefoon },
];

/** Zet het scherm op smal of breed voordat er getekend wordt. */
function zetSchermbreedte(smal: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: smal,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

beforeEach(() => {
  zetSchermbreedte(false);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('meebewegende tabel - breed scherm', () => {
  it('zet de kolommen als koppen en de gegevens als rijen neer', () => {
    render(<ResponsiveTable data={LEDEN} columns={KOLOMMEN} keyExtractor={(r) => r.id} />);

    expect(screen.getByRole('columnheader', { name: /Naam/ })).toBeInTheDocument();
    const rijen = screen.getAllByRole('row');
    expect(rijen).toHaveLength(3);
    expect(within(rijen[1]).getByText('Anna Aalders')).toBeInTheDocument();
    expect(within(rijen[1]).getByText('06-1111')).toBeInTheDocument();
  });

  it('meldt een klik op een sorteerbare kop met de nieuwe richting', async () => {
    const gebruiker = userEvent.setup();
    const bijSorteren = vi.fn();
    render(<ResponsiveTable data={LEDEN} columns={KOLOMMEN} keyExtractor={(r) => r.id} onSort={bijSorteren} />);

    await gebruiker.click(screen.getByRole('columnheader', { name: /Naam/ }));

    expect(bijSorteren).toHaveBeenCalledWith('naam', 'asc');
  });

  it('loopt bij herhaald klikken langs oplopend, aflopend en niets', async () => {
    const gebruiker = userEvent.setup();
    const bijSorteren = vi.fn();

    function Proef() {
      const [kolom, setKolom] = useState<string | undefined>(undefined);
      const [richting, setRichting] = useState<SortDirection>(null);
      return (
        <ResponsiveTable
          data={LEDEN}
          columns={KOLOMMEN}
          keyExtractor={(r) => r.id}
          sortColumn={kolom}
          sortDirection={richting}
          onSort={(id, nieuw) => {
            bijSorteren(id, nieuw);
            setKolom(id);
            setRichting(nieuw);
          }}
        />
      );
    }

    render(<Proef />);
    const kop = screen.getByRole('columnheader', { name: /Naam/ });

    await gebruiker.click(kop);
    expect(kop).toHaveAttribute('aria-sort', 'ascending');

    await gebruiker.click(kop);
    expect(kop).toHaveAttribute('aria-sort', 'descending');

    await gebruiker.click(kop);
    expect(kop).toHaveAttribute('aria-sort', 'none');

    await gebruiker.click(kop);
    expect(bijSorteren.mock.calls.map((c) => c[1])).toEqual(['asc', 'desc', null, 'asc']);
  });

  it('sorteert ook met het toetsenbord', async () => {
    const gebruiker = userEvent.setup();
    const bijSorteren = vi.fn();
    render(<ResponsiveTable data={LEDEN} columns={KOLOMMEN} keyExtractor={(r) => r.id} onSort={bijSorteren} />);

    const kop = screen.getByRole('columnheader', { name: /Naam/ });
    kop.focus();
    await gebruiker.keyboard('{Enter}');
    await gebruiker.keyboard(' ');

    expect(bijSorteren).toHaveBeenCalledTimes(2);
  });

  it('laat een kolom die niet sorteerbaar is met rust', async () => {
    const gebruiker = userEvent.setup();
    const bijSorteren = vi.fn();
    render(<ResponsiveTable data={LEDEN} columns={KOLOMMEN} keyExtractor={(r) => r.id} onSort={bijSorteren} />);

    const kop = screen.getByRole('columnheader', { name: 'Telefoon' });
    await gebruiker.click(kop);

    expect(bijSorteren).not.toHaveBeenCalled();
    expect(kop).not.toHaveAttribute('tabindex');
  });

  it('opent een rij met een klik en met het toetsenbord', async () => {
    const gebruiker = userEvent.setup();
    const bijRij = vi.fn();
    render(<ResponsiveTable data={LEDEN} columns={KOLOMMEN} keyExtractor={(r) => r.id} onRowClick={bijRij} />);

    const rij = screen.getAllByRole('row')[1];
    await gebruiker.click(rij);
    expect(bijRij).toHaveBeenCalledWith(LEDEN[0]);

    rij.focus();
    await gebruiker.keyboard('{Enter}');
    expect(bijRij).toHaveBeenCalledTimes(2);
  });

  it('licht de rij op waar de muis boven staat', async () => {
    const gebruiker = userEvent.setup();
    render(<ResponsiveTable data={LEDEN} columns={KOLOMMEN} keyExtractor={(r) => r.id} />);

    const rij = screen.getAllByRole('row')[1];
    expect(rij.style.backgroundColor).toBe('transparent');

    await gebruiker.hover(rij);
    expect(rij).toHaveStyle({ backgroundColor: '#f9fafb' });

    await gebruiker.unhover(rij);
    expect(rij.style.backgroundColor).toBe('transparent');
  });

  it('geeft even rijen een eigen achtergrond als daarom gevraagd wordt', () => {
    render(<ResponsiveTable data={LEDEN} columns={KOLOMMEN} keyExtractor={(r) => r.id} striped />);

    expect(screen.getAllByRole('row')[2]).toHaveStyle({ backgroundColor: 'rgba(0,0,0,0.02)' });
  });

  it('toont een lege lijst als melding zonder tabel', () => {
    render(
      <ResponsiveTable data={[]} columns={KOLOMMEN} keyExtractor={(r: Lid) => r.id} emptyMessage="Nog geen leden" />,
    );

    expect(screen.getByText('Nog geen leden')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('toont tijdens het laden lege regels met de kolomkoppen erboven', () => {
    render(<ResponsiveTable data={[]} columns={KOLOMMEN} keyExtractor={(r: Lid) => r.id} loading skeletonRows={3} />);

    expect(screen.getByRole('columnheader', { name: /Naam/ })).toBeInTheDocument();
    // Drie regels plus de kop.
    expect(screen.getAllByRole('row')).toHaveLength(4);
  });

  it('toont op een breed scherm ook de kolommen die op een smal scherm wegvallen', () => {
    const kolommen = [...KOLOMMEN.slice(0, 2), { ...KOLOMMEN[2], hideOnMobile: true }];
    render(<ResponsiveTable data={LEDEN} columns={kolommen} keyExtractor={(r) => r.id} />);

    expect(screen.getByRole('columnheader', { name: 'Telefoon' })).toBeInTheDocument();
    expect(screen.getByText('06-1111')).toBeInTheDocument();
  });
});

describe('meebewegende tabel - smal scherm', () => {
  beforeEach(() => {
    zetSchermbreedte(true);
  });

  it('toont kaarten in plaats van een tabel, met de eerste kolom als titel', () => {
    render(<ResponsiveTable data={LEDEN} columns={KOLOMMEN} keyExtractor={(r) => r.id} />);

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(document.querySelectorAll('.responsive-table-cards > div')).toHaveLength(2);
    // De naam staat er zonder label boven; de andere kolommen krijgen er een,
    // eenmaal per kaart.
    expect(screen.queryAllByText('Naam')).toHaveLength(0);
    expect(screen.queryAllByText('Speelt')).toHaveLength(2);
    expect(screen.queryAllByText('Telefoon')).toHaveLength(2);
  });

  it('laat een kolom weg die niet in de kaart hoort', () => {
    const kolommen = [...KOLOMMEN.slice(0, 2), { ...KOLOMMEN[2], showInCard: false }];
    render(<ResponsiveTable data={LEDEN} columns={kolommen} keyExtractor={(r) => r.id} />);

    expect(screen.queryByText('06-1111')).not.toBeInTheDocument();
    expect(screen.getByText('Fluit')).toBeInTheDocument();
  });

  /**
   * Bewijs. Op de oude code was deze test rood.
   *
   * `hideOnMobile` werd alleen toegepast op de tabelweergave, en die is op een
   * smal scherm juist niet in beeld: daar staan kaarten. De kaarten werden uit
   * de volledige kolomlijst opgebouwd, dus een kolom die uitdrukkelijk niet op
   * een klein scherm hoorde, stond er wél - de schakelaar deed niets in de
   * enige weergave waarvoor hij bedoeld is.
   *
   * Oud gedrag: '06-1111' stond gewoon in de kaart.
   */
  it('laat een kolom die niet op een klein scherm hoort ook uit de kaart weg', () => {
    const kolommen = [...KOLOMMEN.slice(0, 2), { ...KOLOMMEN[2], hideOnMobile: true }];
    render(<ResponsiveTable data={LEDEN} columns={kolommen} keyExtractor={(r) => r.id} />);

    expect(screen.queryAllByText('Telefoon')).toHaveLength(0);
    expect(screen.queryAllByText('06-1111')).toHaveLength(0);
    expect(screen.getByText('Anna Aalders')).toBeInTheDocument();
    expect(screen.getByText('Fluit')).toBeInTheDocument();
  });

  it('opent een kaart met een klik', async () => {
    const gebruiker = userEvent.setup();
    const bijRij = vi.fn();
    render(<ResponsiveTable data={LEDEN} columns={KOLOMMEN} keyExtractor={(r) => r.id} onRowClick={bijRij} />);

    await gebruiker.click(screen.getByText('Bram Bakker'));

    expect(bijRij).toHaveBeenCalledWith(LEDEN[1]);
  });

  it('licht de kaart op waar de muis boven staat', async () => {
    const gebruiker = userEvent.setup();
    render(<ResponsiveTable data={LEDEN} columns={KOLOMMEN} keyExtractor={(r) => r.id} />);

    const kaart = document.querySelectorAll('.responsive-table-cards > div')[0] as HTMLElement;
    await gebruiker.hover(kaart);
    expect(kaart).toHaveStyle({ transform: 'translateY(-1px)' });

    await gebruiker.unhover(kaart);
    expect(kaart).toHaveStyle({ transform: 'none' });
  });

  it('zet er voor- en nawerk omheen als daarom gevraagd wordt', () => {
    render(
      <ResponsiveTable
        data={LEDEN}
        columns={KOLOMMEN}
        keyExtractor={(r) => r.id}
        rowClassName={(r) => `lid-${r.id}`}
        renderCardPrefix={(r) => <span>voor {r.naam}</span>}
        renderCardSuffix={(r) => <span>na {r.naam}</span>}
      />,
    );

    expect(screen.getByText('voor Anna Aalders')).toBeInTheDocument();
    expect(screen.getByText('na Anna Aalders')).toBeInTheDocument();
    expect(document.querySelector('.lid-1')).toBeInTheDocument();
  });

  it('toont tijdens het laden lege kaarten', () => {
    const { container } = render(
      <ResponsiveTable
        data={[]}
        columns={KOLOMMEN}
        keyExtractor={(r: Lid) => r.id}
        loading
        skeletonRows={2}
        className="ledenlijst"
      />,
    );

    expect(container.querySelector('.ledenlijst')!.children).toHaveLength(3); // twee kaarten plus de stijlregels
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('toont een lege lijst ook op een smal scherm als melding', () => {
    render(<ResponsiveTable data={[]} columns={KOLOMMEN} keyExtractor={(r: Lid) => r.id} />);

    expect(screen.getByText('Geen gegevens beschikbaar')).toBeInTheDocument();
  });
});

describe('createColumn', () => {
  it('maakt een kolom die standaard sorteerbaar is en in de kaart hoort', () => {
    const kolom = createColumn<Lid>('naam', 'Naam', (r) => r.naam);

    expect(kolom).toMatchObject({ id: 'naam', header: 'Naam', sortable: true, showInCard: true, priority: 5 });
    expect(kolom.accessor(LEDEN[0])).toBe('Anna Aalders');
  });

  it('laat zich overrulen', () => {
    const kolom = createColumn<Lid>('telefoon', 'Telefoon', (r) => r.telefoon, {
      sortable: false,
      hideOnMobile: true,
      align: 'right',
    });

    expect(kolom).toMatchObject({ sortable: false, hideOnMobile: true, align: 'right' });
  });
});
