/**
 * Het sorteermenu: kiezen, omkeren, bedienen met het toetsenbord en onthouden.
 *
 * Het menu staat op de partijen-, titel- en muzieklijstpagina's en is de enige
 * plek waar de leesvolgorde te veranderen valt. Wat er stond getest was de
 * gesloten knop; alles wat er ná een klik gebeurt - de lijst zelf, het omkeren
 * van de richting bij een tweede klik op dezelfde regel, de pijltjestoetsen en
 * het onthouden in de browseropslag - was nergens vastgelegd.
 *
 * Het menu tekent zichzelf via een portaal in `document.body`, dus zoeken
 * gebeurt op het scherm als geheel en niet binnen het teruggegeven vlak.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { SortDropdown, useSortState, type SortOption, type SortState } from '../SortDropdown';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

const OPTIES: SortOption[] = [
  { id: 'titel', label: 'Titel', icon: 'type', defaultDirection: 'asc' },
  { id: 'datum', label: 'Datum', icon: 'calendar', defaultDirection: 'desc' },
  { id: 'toeval', label: 'Willekeurig', disableDirectionToggle: true },
];

/**
 * Toon het menu zoals een pagina dat doet: de keuze komt terug bij de ouder en
 * die tekent opnieuw. Zonder die lus zou een tweede klik op dezelfde regel
 * nooit een omkering kunnen laten zien.
 */
function Proefpagina({
  begin = { sortBy: 'titel', direction: 'asc' } as SortState,
  opslagsleutel,
  bijWijziging,
  uitgeschakeld = false,
}: {
  begin?: SortState;
  opslagsleutel?: string;
  bijWijziging?: (stand: SortState) => void;
  uitgeschakeld?: boolean;
}) {
  const [stand, zetStand] = useState<SortState>(begin);
  return (
    <SortDropdown
      options={OPTIES}
      value={stand}
      onChange={(nieuw) => {
        zetStand(nieuw);
        bijWijziging?.(nieuw);
      }}
      storageKey={opslagsleutel}
      disabled={uitgeschakeld}
    />
  );
}

/** De knop die het menu opent, met naam en richting erin verwerkt. */
function knop() {
  return screen.getByRole('button', { name: /common\.sort\.sortBy/ });
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  // jsdom kent geen matchMedia; useDarkMode in dit menu vraagt er wel om.
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: false,
      media: '',
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })),
  );
});

describe('SortDropdown - openen en kiezen', () => {
  it('houdt de lijst dicht tot er op de knop geklikt wordt', async () => {
    const gebruiker = userEvent.setup();
    render(<Proefpagina />);

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(knop()).toHaveAttribute('aria-expanded', 'false');

    await gebruiker.click(knop());

    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(knop()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it('kiest een andere regel met de standaardrichting van die regel', async () => {
    const gebruiker = userEvent.setup();
    const bijWijziging = vi.fn();
    render(<Proefpagina bijWijziging={bijWijziging} />);

    await gebruiker.click(knop());
    await gebruiker.click(screen.getByRole('option', { name: /Datum/ }));

    // 'Datum' staat op aflopend als standaard, dus die richting hoort erbij.
    expect(bijWijziging).toHaveBeenCalledWith({ sortBy: 'datum', direction: 'desc' });
    // En het menu gaat na een keuze vanzelf dicht.
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('keert de richting om bij een tweede klik op dezelfde regel', async () => {
    const gebruiker = userEvent.setup();
    const bijWijziging = vi.fn();
    render(<Proefpagina bijWijziging={bijWijziging} />);

    await gebruiker.click(knop());
    await gebruiker.click(screen.getByRole('option', { name: /Titel/ }));
    expect(bijWijziging).toHaveBeenLastCalledWith({ sortBy: 'titel', direction: 'desc' });

    await gebruiker.click(knop());
    await gebruiker.click(screen.getByRole('option', { name: /Titel/ }));
    expect(bijWijziging).toHaveBeenLastCalledWith({ sortBy: 'titel', direction: 'asc' });
  });

  it('keert niets om bij een regel waar richting geen betekenis heeft', async () => {
    const gebruiker = userEvent.setup();
    const bijWijziging = vi.fn();
    render(<Proefpagina begin={{ sortBy: 'toeval', direction: 'asc' }} bijWijziging={bijWijziging} />);

    await gebruiker.click(knop());
    await gebruiker.click(screen.getByRole('option', { name: /Willekeurig/ }));

    // Geen omkering naar 'desc': deze regel valt terug op oplopend.
    expect(bijWijziging).toHaveBeenCalledWith({ sortBy: 'toeval', direction: 'asc' });
  });

  it('merkt de gekozen regel aan en zet de andere niet aan', async () => {
    const gebruiker = userEvent.setup();
    render(<Proefpagina />);

    await gebruiker.click(knop());

    expect(screen.getByRole('option', { name: /Titel/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('option', { name: /Datum/ })).toHaveAttribute('aria-selected', 'false');
  });

  it('toont de plaatshouder als de huidige waarde niet in de lijst staat', () => {
    render(<Proefpagina begin={{ sortBy: 'bestaat-niet', direction: 'asc' }} />);

    expect(screen.getByRole('button', { name: /common\.sort\.placeholder/ })).toBeInTheDocument();
  });

  it('opent niet als het menu uitgeschakeld is', async () => {
    const gebruiker = userEvent.setup();
    render(<Proefpagina uitgeschakeld />);

    expect(knop()).toBeDisabled();
    await gebruiker.click(knop());

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});

describe('SortDropdown - dichtdoen', () => {
  it('gaat dicht met Escape en zet de aanwijzer terug op de knop', async () => {
    const gebruiker = userEvent.setup();
    render(<Proefpagina />);

    await gebruiker.click(knop());
    await gebruiker.keyboard('{Escape}');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(knop()).toHaveFocus();
  });

  it('gaat dicht bij een klik ergens anders op de bladzijde', async () => {
    const gebruiker = userEvent.setup();
    render(
      <div>
        <Proefpagina />
        <p>ergens anders</p>
      </div>,
    );

    await gebruiker.click(knop());
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    await gebruiker.click(screen.getByText('ergens anders'));

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('blijft open bij een klik binnen het menu zelf', async () => {
    const gebruiker = userEvent.setup();
    render(<Proefpagina />);

    await gebruiker.click(knop());
    await gebruiker.click(screen.getByRole('listbox'));

    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('gaat dicht met de sluitknop onderin', async () => {
    const gebruiker = userEvent.setup();
    render(<Proefpagina />);

    await gebruiker.click(knop());
    await gebruiker.click(screen.getByRole('button', { name: 'common.close' }));

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});

describe('SortDropdown - toetsenbord', () => {
  it('springt met pijl omlaag vanaf de knop naar de eerste regel', async () => {
    const gebruiker = userEvent.setup();
    render(<Proefpagina />);

    await gebruiker.click(knop());
    knop().focus();
    await gebruiker.keyboard('{ArrowDown}');

    expect(screen.getByRole('option', { name: /Titel/ })).toHaveFocus();
  });

  it('loopt met de pijltjestoetsen door de regels en terug naar de knop', async () => {
    const gebruiker = userEvent.setup();
    render(<Proefpagina />);

    await gebruiker.click(knop());
    const regels = screen.getAllByRole('option');
    regels[0].focus();

    await gebruiker.keyboard('{ArrowDown}');
    expect(regels[1]).toHaveFocus();

    await gebruiker.keyboard('{ArrowUp}');
    expect(regels[0]).toHaveFocus();

    // Vanaf de eerste regel omhoog: terug naar de knop die het menu opende.
    await gebruiker.keyboard('{ArrowUp}');
    expect(knop()).toHaveFocus();
  });

  it('kiest de regel waar de aanwijzer staat met Enter', async () => {
    const gebruiker = userEvent.setup();
    const bijWijziging = vi.fn();
    render(<Proefpagina bijWijziging={bijWijziging} />);

    await gebruiker.click(knop());
    screen.getByRole('option', { name: /Datum/ }).focus();
    await gebruiker.keyboard('{Enter}');

    expect(bijWijziging).toHaveBeenCalledWith({ sortBy: 'datum', direction: 'desc' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});

describe('SortDropdown - onthouden tussen bezoeken', () => {
  it('bewaart de keuze onder de opgegeven sleutel', async () => {
    const gebruiker = userEvent.setup();
    render(<Proefpagina opslagsleutel="proef-sortering" />);

    await gebruiker.click(knop());
    await gebruiker.click(screen.getByRole('option', { name: /Datum/ }));

    expect(JSON.parse(localStorage.getItem('proef-sortering') as string)).toEqual({
      sortBy: 'datum',
      direction: 'desc',
    });
  });

  it('leest een bewaarde keuze terug bij het openen van de pagina', async () => {
    localStorage.setItem('proef-sortering', JSON.stringify({ sortBy: 'datum', direction: 'desc' }));
    const bijWijziging = vi.fn();
    render(<Proefpagina opslagsleutel="proef-sortering" bijWijziging={bijWijziging} />);

    expect(bijWijziging).toHaveBeenCalledWith({ sortBy: 'datum', direction: 'desc' });
    expect(await screen.findByRole('button', { name: /Datum/ })).toBeInTheDocument();
  });

  it('negeert een bewaarde keuze die deze lijst niet kent', () => {
    localStorage.setItem('proef-sortering', JSON.stringify({ sortBy: 'weggehaald', direction: 'asc' }));
    const bijWijziging = vi.fn();
    render(<Proefpagina opslagsleutel="proef-sortering" bijWijziging={bijWijziging} />);

    expect(bijWijziging).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Titel/ })).toBeInTheDocument();
  });

  it('negeert onleesbare rommel in de opslag', () => {
    localStorage.setItem('proef-sortering', 'geen json');
    const bijWijziging = vi.fn();

    // Zonder de vangst hieromheen zou het openen van de pagina klappen.
    render(<Proefpagina opslagsleutel="proef-sortering" bijWijziging={bijWijziging} />);

    expect(bijWijziging).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Titel/ })).toBeInTheDocument();
  });
});

/** Kleine bladzijde die de haak zelf bedient, zonder het menu erbij. */
function HaakProef({ opslagsleutel }: { opslagsleutel?: string }) {
  // Expliciet op string: zonder die parameter leidt useSortState het type af
  // uit de beginwaarde, en dan is 'titel' de enige toegestane sorteersleutel.
  const [stand, zetStand] = useSortState<string>('titel', 'asc', opslagsleutel);
  return (
    <div>
      <span data-testid="stand">{`${stand.sortBy}/${stand.direction}`}</span>
      <button type="button" onClick={() => zetStand({ sortBy: 'datum', direction: 'desc' })}>
        op datum
      </button>
    </div>
  );
}

describe('useSortState', () => {
  it('begint bij de opgegeven standaard als er niets bewaard is', () => {
    render(<HaakProef opslagsleutel="haak-sortering" />);

    expect(screen.getByTestId('stand')).toHaveTextContent('titel/asc');
  });

  it('begint bij wat er bewaard staat', () => {
    localStorage.setItem('haak-sortering', JSON.stringify({ sortBy: 'datum', direction: 'desc' }));
    render(<HaakProef opslagsleutel="haak-sortering" />);

    expect(screen.getByTestId('stand')).toHaveTextContent('datum/desc');
  });

  it('valt terug op de standaard bij een halve of onleesbare bewaarde waarde', () => {
    localStorage.setItem('haak-sortering', JSON.stringify({ sortBy: 'datum' }));
    const { unmount } = render(<HaakProef opslagsleutel="haak-sortering" />);
    expect(screen.getByTestId('stand')).toHaveTextContent('titel/asc');
    unmount();

    localStorage.setItem('haak-sortering', '{kapot');
    render(<HaakProef opslagsleutel="haak-sortering" />);
    expect(screen.getByTestId('stand')).toHaveTextContent('titel/asc');
  });

  it('bewaart een nieuwe stand en houdt hem vast', async () => {
    const gebruiker = userEvent.setup();
    render(<HaakProef opslagsleutel="haak-sortering" />);

    await gebruiker.click(screen.getByRole('button', { name: 'op datum' }));

    expect(screen.getByTestId('stand')).toHaveTextContent('datum/desc');
    expect(JSON.parse(localStorage.getItem('haak-sortering') as string)).toEqual({
      sortBy: 'datum',
      direction: 'desc',
    });
  });

  it('werkt ook zonder opslagsleutel, en bewaart dan niets', async () => {
    const gebruiker = userEvent.setup();
    render(<HaakProef />);

    await gebruiker.click(screen.getByRole('button', { name: 'op datum' }));

    expect(screen.getByTestId('stand')).toHaveTextContent('datum/desc');
    expect(localStorage.length).toBe(0);
  });
});
