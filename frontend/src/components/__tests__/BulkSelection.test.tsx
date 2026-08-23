/**
 * Tests voor de meervoudige selectie: de vinkjes, de "alles selecteren"-knop
 * en de zwevende actiebalk.
 *
 * Dit bestand legt vast wat een gebruiker met een lijst doet: een rij
 * aanvinken, een bereik met shift aanvinken, alles selecteren en weer
 * leegmaken, en pas dan een actie op de selectie uitvoeren.
 *
 * ECHTE FOUT, gerepareerd en bewezen - zie de test "een klik op een vinkje
 * selecteert het item". In SelectionCheckbox hingen er twee afhandelaars aan
 * hetzelfde invoerveld:
 *
 *     onChange={(e) => toggleItem(itemId, e.nativeEvent ...)}
 *     onClick={(e) => toggleItem(itemId, e)}
 *
 * React leidt `onChange` van een vinkje af van hetzelfde native click-event als
 * `onClick`. Eén muisklik riep `toggleItem` dus twee keer aan: aan en meteen
 * weer uit. Het vakje deed niets. Bewijs: met `git checkout HEAD --` op alleen
 * BulkSelection.tsx faalt die test met "Expected 1, Received 0"; met de
 * reparatie is hij groen. De component wordt nergens anders in de frontend
 * gebruikt, wat verklaart waarom niemand dit gemerkt heeft.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// `delay: null` zet de wachttijd tussen toetsaanslagen uit. Met de standaard
// vertraging tikt userEvent teken voor teken met een pauze ertussen, en dan
// lopen de langere formuliertests op een belaste machine over de tijdslimiet
// van vijf seconden heen. Het gedrag dat getest wordt verandert er niet door.
import {
  BulkSelectionProvider,
  SelectionCheckbox,
  SelectAllCheckbox,
  FloatingActionBar,
  useBulkSelection,
  createDefaultBulkActions,
  type BulkAction,
} from '../BulkSelection';

// De echte hook leest window.matchMedia, dat jsdom niet heeft. De donkere stand
// bepaalt hier alleen kleuren, geen gedrag.
vi.mock('../../hooks/useDarkMode', () => ({ useDarkMode: () => ({ isDark: false }) }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (sleutel: string, params?: Record<string, unknown>) => {
      if (sleutel === 'common.selected') return `${params?.count} geselecteerd`;
      if (sleutel === 'common.clearSelection') return 'Selectie wissen';
      return sleutel;
    },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

const ITEMS = ['a', 'b', 'c', 'd'];

/** Laat het aantal geselecteerde items zien, zodat een test het kan aflezen. */
function Teller() {
  const { selectedCount } = useBulkSelection();
  return <span data-testid="teller">{selectedCount}</span>;
}

function Lijst({
  itemIds = ITEMS,
  acties = [],
  onSelectionChange,
}: {
  itemIds?: string[];
  acties?: BulkAction[];
  onSelectionChange?: (ids: string[]) => void;
}) {
  return (
    <BulkSelectionProvider itemIds={itemIds} onSelectionChange={onSelectionChange}>
      <Teller />
      <SelectAllCheckbox />
      {itemIds.map((id) => (
        <SelectionCheckbox key={id} itemId={id} label={`Item ${id.toUpperCase()}`} />
      ))}
      <FloatingActionBar actions={acties} />
    </BulkSelectionProvider>
  );
}

function aantalGeselecteerd(): string | null {
  return screen.getByTestId('teller').textContent;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('meervoudige selectie - vinkjes', () => {
  it('een klik op een vinkje selecteert het item', async () => {
    // BEWIJS van de reparatie hierboven: op de oude code blijft de teller op 0
    // staan omdat de klik twee keer omschakelde.
    const gebruiker = userEvent.setup({ delay: null });
    render(<Lijst />);

    await gebruiker.click(screen.getByLabelText('Item A'));

    expect(aantalGeselecteerd()).toBe('1');
    expect(screen.getByLabelText('Item A')).toBeChecked();
  });

  it('nog een klik op hetzelfde vinkje haalt de selectie er weer af', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    render(<Lijst />);

    await gebruiker.click(screen.getByLabelText('Item A'));
    await gebruiker.click(screen.getByLabelText('Item A'));

    expect(aantalGeselecteerd()).toBe('0');
    expect(screen.getByLabelText('Item A')).not.toBeChecked();
  });

  it('shift+klik selecteert alles tussen het vorige en het aangeklikte vinkje', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    render(<Lijst />);

    await gebruiker.click(screen.getByLabelText('Item A'));
    await gebruiker.keyboard('{Shift>}');
    await gebruiker.click(screen.getByLabelText('Item C'));
    await gebruiker.keyboard('{/Shift}');

    expect(aantalGeselecteerd()).toBe('3');
    expect(screen.getByLabelText('Item B')).toBeChecked();
    expect(screen.getByLabelText('Item D')).not.toBeChecked();
  });

  it('shift+klik op een al geselecteerd bereik haalt dat bereik er weer af', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    render(<Lijst />);

    await gebruiker.click(screen.getByLabelText('Alles selecteren'));
    expect(aantalGeselecteerd()).toBe('4');

    // Na "alles selecteren" is er nog geen laatst aangeklikt vinkje, dus eerst
    // er eentje aanwijzen. Die klik zet A uit; het bereik A..C gaat er daarna
    // in zijn geheel af.
    await gebruiker.click(screen.getByLabelText('Item A'));
    await gebruiker.keyboard('{Shift>}');
    await gebruiker.click(screen.getByLabelText('Item C'));
    await gebruiker.keyboard('{/Shift}');

    expect(aantalGeselecteerd()).toBe('1');
    expect(screen.getByLabelText('Item D')).toBeChecked();
  });
});

describe('meervoudige selectie - alles selecteren', () => {
  it('selecteert in één klik alle items en meldt het aantal in het label', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    render(<Lijst />);

    await gebruiker.click(screen.getByLabelText(/^Alles selecteren/));

    expect(aantalGeselecteerd()).toBe('4');
    expect(screen.getByLabelText('Item D')).toBeChecked();
    expect(screen.getByLabelText('Alles selecteren (4 van 4 geselecteerd)')).toBeInTheDocument();
  });

  it('maakt de selectie weer leeg bij een tweede klik', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    render(<Lijst />);

    await gebruiker.click(screen.getByLabelText(/^Alles selecteren/));
    await gebruiker.click(screen.getByLabelText(/^Alles selecteren/));

    expect(aantalGeselecteerd()).toBe('0');
    expect(screen.getByLabelText('Item A')).not.toBeChecked();
  });

  it('staat halfweg zolang er maar een deel geselecteerd is', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    render(<Lijst />);

    const alles = screen.getByLabelText(/^Alles selecteren/) as HTMLInputElement;
    expect(alles.indeterminate).toBe(false);

    await gebruiker.click(screen.getByLabelText('Item A'));

    expect(alles.indeterminate).toBe(true);
    expect(alles).not.toBeChecked();
  });

  it('staat niet aan bij een lege lijst', () => {
    render(<Lijst itemIds={[]} />);

    const alles = screen.getByLabelText(/^Alles selecteren/) as HTMLInputElement;
    expect(alles).not.toBeChecked();
    expect(alles.indeterminate).toBe(false);
  });
});

describe('meervoudige selectie - de actiebalk', () => {
  const maakActies = (): { acties: BulkAction[]; verwijder: ReturnType<typeof vi.fn> } => {
    const verwijder = vi.fn();
    return {
      verwijder,
      acties: [
        { id: 'export', label: 'Exporteren', icon: 'download', onAction: vi.fn() },
        { id: 'delete', label: 'Verwijderen', icon: 'trash', onAction: verwijder, destructive: true },
      ],
    };
  };

  it('blijft weg zolang er niets geselecteerd is', () => {
    const { acties } = maakActies();
    render(<Lijst acties={acties} />);

    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Verwijderen' })).not.toBeInTheDocument();
  });

  it('verschijnt zodra er iets geselecteerd is en toont het aantal', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    const { acties } = maakActies();
    render(<Lijst acties={acties} />);

    await gebruiker.click(screen.getByLabelText('Item A'));
    await gebruiker.click(screen.getByLabelText('Item B'));

    expect(screen.getByRole('toolbar')).toBeInTheDocument();
    expect(screen.getByText('2 geselecteerd')).toBeInTheDocument();
  });

  it('geeft de geselecteerde ids door aan de actie', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    const { acties, verwijder } = maakActies();
    render(<Lijst acties={acties} />);

    await gebruiker.click(screen.getByLabelText('Item B'));
    await gebruiker.click(screen.getByLabelText('Item D'));
    await gebruiker.click(screen.getByRole('button', { name: 'Verwijderen' }));

    expect(verwijder).toHaveBeenCalledWith(['b', 'd']);
  });

  it('voert een uitgeschakelde actie niet uit', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    const onAction = vi.fn();
    render(<Lijst acties={[{ id: 'move', label: 'Verplaatsen', icon: 'folder', onAction, disabled: true }]} />);

    await gebruiker.click(screen.getByLabelText('Item A'));
    const knop = screen.getByRole('button', { name: 'Verplaatsen' });

    expect(knop).toBeDisabled();
    await gebruiker.click(knop);
    expect(onAction).not.toHaveBeenCalled();
  });

  it('blokkeert de andere acties zolang er eentje loopt', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    let losmaken: () => void = () => {};
    const traag = vi.fn().mockReturnValue(
      new Promise<void>((resolve) => {
        losmaken = resolve;
      }),
    );
    const snel = vi.fn();
    render(
      <Lijst
        acties={[
          { id: 'export', label: 'Exporteren', icon: 'download', onAction: traag },
          { id: 'delete', label: 'Verwijderen', icon: 'trash', onAction: snel },
        ]}
      />,
    );

    await gebruiker.click(screen.getByLabelText('Item A'));
    await gebruiker.click(screen.getByRole('button', { name: 'Exporteren' }));

    expect(screen.getByRole('button', { name: 'Verwijderen' })).toBeDisabled();

    losmaken();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Verwijderen' })).toBeEnabled());
    expect(snel).not.toHaveBeenCalled();
  });

  it('wist met de kruisknop de selectie en verdwijnt daarna', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    const { acties } = maakActies();
    render(<Lijst acties={acties} />);

    await gebruiker.click(screen.getByLabelText('Item A'));
    await gebruiker.click(screen.getByRole('button', { name: 'Selectie wissen' }));

    expect(aantalGeselecteerd()).toBe('0');
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
  });
});

describe('meervoudige selectie - de provider', () => {
  it('meldt elke wijziging aan de omringende pagina', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    const gemeld = vi.fn();
    render(<Lijst onSelectionChange={gemeld} />);

    expect(gemeld).toHaveBeenLastCalledWith([]);

    await gebruiker.click(screen.getByLabelText('Item C'));

    expect(gemeld).toHaveBeenLastCalledWith(['c']);
  });

  it('haalt items die uit de lijst verdwijnen ook uit de selectie', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    const { rerender } = render(<Lijst />);

    await gebruiker.click(screen.getByLabelText(/^Alles selecteren/));
    expect(aantalGeselecteerd()).toBe('4');

    rerender(<Lijst itemIds={['a', 'b']} />);

    await waitFor(() => expect(aantalGeselecteerd()).toBe('2'));
  });

  it('houdt een beginselectie aan', () => {
    render(
      <BulkSelectionProvider itemIds={ITEMS} initialSelection={['b', 'c']}>
        <Teller />
        <SelectionCheckbox itemId="b" label="Item B" />
      </BulkSelectionProvider>,
    );

    expect(aantalGeselecteerd()).toBe('2');
    expect(screen.getByLabelText('Item B')).toBeChecked();
  });

  it('biedt de pagina losse knoppen om te selecteren en te ontselecteren', async () => {
    const gebruiker = userEvent.setup({ delay: null });

    function Knoppen() {
      const { selectItem, deselectItem, selectAll, clearSelection } = useBulkSelection();
      return (
        <>
          <button onClick={() => selectItem('a')}>Kies A</button>
          <button onClick={() => deselectItem('a')}>Ontkies A</button>
          <button onClick={() => selectAll()}>Kies alles</button>
          <button onClick={() => clearSelection()}>Maak leeg</button>
        </>
      );
    }

    render(
      <BulkSelectionProvider itemIds={ITEMS}>
        <Teller />
        <Knoppen />
      </BulkSelectionProvider>,
    );

    await gebruiker.click(screen.getByRole('button', { name: 'Kies A' }));
    expect(aantalGeselecteerd()).toBe('1');

    // Twee keer kiezen mag niet dubbel tellen.
    await gebruiker.click(screen.getByRole('button', { name: 'Kies A' }));
    expect(aantalGeselecteerd()).toBe('1');

    await gebruiker.click(screen.getByRole('button', { name: 'Ontkies A' }));
    expect(aantalGeselecteerd()).toBe('0');

    // Ontkiezen van iets dat er niet in zit verandert niets.
    await gebruiker.click(screen.getByRole('button', { name: 'Ontkies A' }));
    expect(aantalGeselecteerd()).toBe('0');

    await gebruiker.click(screen.getByRole('button', { name: 'Kies alles' }));
    expect(aantalGeselecteerd()).toBe('4');

    await gebruiker.click(screen.getByRole('button', { name: 'Maak leeg' }));
    expect(aantalGeselecteerd()).toBe('0');
  });

  it('geeft een duidelijke fout als een vinkje buiten de provider staat', () => {
    // React logt de fout ook zelf en jsdom meldt hem nog eens als onbehandeld;
    // die ruis onderdrukken we hier, want de fout hoort hier juist te vallen.
    const stil = vi.spyOn(console, 'error').mockImplementation(() => {});
    const slik = (e: ErrorEvent) => e.preventDefault();
    window.addEventListener('error', slik);
    try {
      expect(() => render(<Teller />)).toThrow(/BulkSelectionProvider/);
    } finally {
      window.removeEventListener('error', slik);
      stil.mockRestore();
    }
  });
});

describe('standaardacties', () => {
  const t = (sleutel: string) => sleutel;

  it('levert alleen de acties waarvoor een afhandelaar is meegegeven', () => {
    const acties = createDefaultBulkActions({ onDelete: vi.fn() }, t);

    expect(acties.map((a) => a.id)).toEqual(['delete']);
  });

  it('zet ze in een vaste volgorde en merkt verwijderen als gevaarlijk aan', () => {
    const acties = createDefaultBulkActions(
      { onDelete: vi.fn(), onArchive: vi.fn(), onMove: vi.fn(), onExport: vi.fn() },
      t,
    );

    expect(acties.map((a) => a.id)).toEqual(['export', 'move', 'archive', 'delete']);
    expect(acties.find((a) => a.id === 'delete')?.destructive).toBe(true);
    expect(acties.find((a) => a.id === 'export')?.destructive).toBeUndefined();
  });

  it('levert een lege lijst zonder afhandelaars', () => {
    expect(createDefaultBulkActions({}, t)).toEqual([]);
  });
});
