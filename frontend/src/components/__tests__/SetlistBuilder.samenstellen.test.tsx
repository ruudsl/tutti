/**
 * De setlistbouwer: een programma samenstellen uit de beschikbare stukken.
 *
 * De sleepbeweging zelf staat hier niet in. Die leunt op dnd-kit, en dat meet
 * afstanden en afmetingen die jsdom niet berekent - elk element is daar nul bij
 * nul pixels groot. Een nagebootste muisbeweging test dan de nabootsing en niet
 * het onderdeel. In plaats daarvan is `DndContext` vervangen door een
 * dubbelganger die de terugroepen vasthoudt, zodat een test `onDragStart` en
 * `onDragEnd` kan aanroepen zoals dnd-kit dat in de browser doet. Alles wat
 * daarna gebeurt - de nieuwe volgorde, de nummering, de sleeplaag en wat er
 * uiteindelijk opgeslagen wordt - is gewoon de code van het onderdeel.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import userEvent from '@testing-library/user-event';
import { SetlistBuilder, type SetlistPiece } from '../SetlistBuilder';

vi.mock('react-i18next', async () => {
  const teksten = ((await import('../../locales/nl.json')) as { default: Record<string, unknown> }).default;
  const zoek = (sleutel: string): string | undefined =>
    sleutel.split('.').reduce<any>((deel, stuk) => (deel == null ? undefined : deel[stuk]), teksten);

  return {
    useTranslation: () => ({
      t: (sleutel: string, opties?: Record<string, unknown>) => {
        const meervoud = opties && typeof opties.count === 'number' && opties.count !== 1;
        const tekst = (meervoud ? zoek(`${sleutel}_plural`) : undefined) ?? zoek(sleutel) ?? sleutel;
        if (opties) {
          return Object.entries(opties).reduce(
            (uit, [naam, waarde]) => uit.replace(`{{${naam}}}`, String(waarde)),
            tekst,
          );
        }
        return tekst;
      },
    }),
  };
});

vi.mock('../Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

/** De terugroepen die het onderdeel aan dnd-kit meegeeft. */
const sleep: { eind?: (gebeurtenis: unknown) => void; start?: (gebeurtenis: unknown) => void } = {};

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children, onDragEnd, onDragStart }: any) => {
    sleep.eind = onDragEnd;
    sleep.start = onDragStart;
    return <div>{children}</div>;
  },
  DragOverlay: ({ children }: { children: ReactNode }) => <div data-testid="sleeplaag">{children}</div>,
  closestCenter: vi.fn(),
  KeyboardSensor: vi.fn(),
  PointerSensor: vi.fn(),
  useSensor: vi.fn(),
  useSensors: vi.fn(() => []),
}));

vi.mock('@dnd-kit/sortable', async (importActual) => {
  const echt = await importActual<typeof import('@dnd-kit/sortable')>();
  return {
    ...echt,
    SortableContext: ({ children }: { children: ReactNode }) => <>{children}</>,
    useSortable: () => ({
      attributes: {},
      listeners: {},
      setNodeRef: () => {},
      transform: null,
      transition: undefined,
      isDragging: false,
    }),
  };
});

/** Bootst na wat dnd-kit meldt als een stuk boven een ander losgelaten wordt. */
async function sleepOver(vanId: string, naarId: string | null) {
  await act(async () => {
    sleep.eind?.({ active: { id: vanId }, over: naarId === null ? null : { id: naarId } });
  });
}

// jsdom kent `matchMedia` niet, en de donkeremodushaak vraagt het meteen bij
// het tekenen. Hier is het altijd lichte modus.
beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const BESCHIKBAAR: SetlistPiece[] = [
  { id: 'p1', title: 'Ouverture 1812', composer: 'Tsjaikovski', durationSeconds: 900 },
  { id: 'p2', title: 'Bolero', composer: 'Ravel', durationSeconds: 945, arranger: 'Van Dijk' },
  { id: 'p3', title: 'Finlandia', composer: 'Sibelius' },
];

/** Het paneel met het programma, links. */
const programma = () => within(screen.getByText('Programma').closest('div')!);

/** De knop om een stuk aan het programma toe te voegen. */
function voegToe(titel: string) {
  const regel = screen.getByText(titel).closest('.setlist-available-item')!;
  return within(regel as HTMLElement).getByTitle('Toevoegen aan setlist');
}

describe('SetlistBuilder: stukken kiezen', () => {
  it('begint met een leeg programma en alle stukken beschikbaar', () => {
    render(<SetlistBuilder availablePieces={BESCHIKBAAR} />);

    expect(screen.getByText('Voeg stukken toe aan je setlist')).toBeInTheDocument();
    expect(screen.getByText('0 stukken')).toBeInTheDocument();
    expect(screen.getByText('Totale duur: 0:00')).toBeInTheDocument();
    expect(screen.getAllByTitle('Toevoegen aan setlist')).toHaveLength(3);
  });

  it('verplaatst een gekozen stuk naar het programma en telt de duur op', async () => {
    const gebruiker = userEvent.setup();
    render(<SetlistBuilder availablePieces={BESCHIKBAAR} />);

    await gebruiker.click(voegToe('Ouverture 1812'));

    expect(screen.getByText('1 stuk')).toBeInTheDocument();
    expect(screen.getByText('Totale duur: 15:00')).toBeInTheDocument();
    expect(programma().getByText('Ouverture 1812')).toBeInTheDocument();
    // Het stuk staat niet meer in de lijst met beschikbare stukken.
    expect(screen.getAllByTitle('Toevoegen aan setlist')).toHaveLength(2);

    await gebruiker.click(voegToe('Bolero'));

    expect(screen.getByText('2 stukken')).toBeInTheDocument();
    expect(screen.getByText('Totale duur: 30:45')).toBeInTheDocument();
    // De nummering volgt de volgorde van toevoegen.
    expect(programma().getByText('1')).toBeInTheDocument();
    expect(programma().getByText('2')).toBeInTheDocument();
  });

  it('toont een streepje bij een stuk zonder bekende duur', async () => {
    const gebruiker = userEvent.setup();
    render(<SetlistBuilder availablePieces={BESCHIKBAAR} />);

    await gebruiker.click(voegToe('Finlandia'));

    expect(screen.getAllByText('--:--').length).toBeGreaterThan(0);
    expect(screen.getByText('Totale duur: 0:00')).toBeInTheDocument();
  });

  it('haalt een stuk weer uit het programma en biedt het opnieuw aan', async () => {
    const gebruiker = userEvent.setup();
    render(<SetlistBuilder availablePieces={BESCHIKBAAR} />);

    await gebruiker.click(voegToe('Bolero'));
    await gebruiker.click(screen.getByTitle('Verwijderen uit setlist'));

    expect(screen.getByText('Voeg stukken toe aan je setlist')).toBeInTheDocument();
    expect(screen.getByText('0 stukken')).toBeInTheDocument();
    expect(screen.getAllByTitle('Toevoegen aan setlist')).toHaveLength(3);
  });

  it('meldt het als alle stukken al gekozen zijn', async () => {
    const gebruiker = userEvent.setup();
    render(<SetlistBuilder availablePieces={BESCHIKBAAR} />);

    await gebruiker.click(voegToe('Ouverture 1812'));
    await gebruiker.click(voegToe('Bolero'));
    await gebruiker.click(voegToe('Finlandia'));

    expect(screen.getByText('Alle stukken zijn toegevoegd')).toBeInTheDocument();
  });
});

describe('SetlistBuilder: zoeken', () => {
  it('zoekt op titel, componist en arrangeur', async () => {
    const gebruiker = userEvent.setup();
    render(<SetlistBuilder availablePieces={BESCHIKBAAR} />);

    const zoekveld = screen.getByPlaceholderText('Zoek stukken...');

    await gebruiker.type(zoekveld, 'sibel');
    expect(screen.getAllByTitle('Toevoegen aan setlist')).toHaveLength(1);
    expect(screen.getByText('Finlandia')).toBeInTheDocument();

    await gebruiker.clear(zoekveld);
    await gebruiker.type(zoekveld, 'van dijk');
    expect(screen.getByText('Bolero')).toBeInTheDocument();
    expect(screen.getAllByTitle('Toevoegen aan setlist')).toHaveLength(1);

    await gebruiker.clear(zoekveld);
    await gebruiker.type(zoekveld, '1812');
    expect(screen.getByText('Ouverture 1812')).toBeInTheDocument();
  });

  it('meldt het als er niets gevonden wordt', async () => {
    const gebruiker = userEvent.setup();
    render(<SetlistBuilder availablePieces={BESCHIKBAAR} />);

    await gebruiker.type(screen.getByPlaceholderText('Zoek stukken...'), 'mahler');

    expect(screen.getByText('Geen stukken gevonden')).toBeInTheDocument();
    expect(screen.queryByTitle('Toevoegen aan setlist')).not.toBeInTheDocument();
  });

  it('klapt de lijst met beschikbare stukken in en uit', async () => {
    const gebruiker = userEvent.setup();
    render(<SetlistBuilder availablePieces={BESCHIKBAAR} />);

    const klapknop = screen.getByRole('button', { expanded: true });
    await gebruiker.click(klapknop);

    expect(screen.queryByPlaceholderText('Zoek stukken...')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Toevoegen aan setlist')).not.toBeInTheDocument();

    await gebruiker.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getByPlaceholderText('Zoek stukken...')).toBeInTheDocument();
  });
});

describe('SetlistBuilder: opslaan', () => {
  it('slaat pas op als er een naam en minstens een stuk is', async () => {
    const gebruiker = userEvent.setup();
    const opslaan = vi.fn();
    render(<SetlistBuilder availablePieces={BESCHIKBAAR} onSave={opslaan} />);

    const knop = screen.getByRole('button', { name: 'Opslaan' });
    expect(knop).toBeDisabled();

    await gebruiker.type(screen.getByLabelText('Setlist naam'), 'Voorjaarsconcert');
    expect(knop).toBeDisabled();

    await gebruiker.click(voegToe('Bolero'));
    expect(knop).toBeEnabled();

    await gebruiker.click(knop);
    expect(opslaan).toHaveBeenCalledTimes(1);
    expect(opslaan.mock.calls[0][0]).toMatchObject({
      name: 'Voorjaarsconcert',
      pieces: [BESCHIKBAAR[1]],
    });
  });

  it('blijft uitgeschakeld bij een naam van enkel spaties', async () => {
    const gebruiker = userEvent.setup();
    render(<SetlistBuilder availablePieces={BESCHIKBAAR} />);

    await gebruiker.type(screen.getByLabelText('Setlist naam'), '   ');
    await gebruiker.click(voegToe('Bolero'));

    expect(screen.getByRole('button', { name: 'Opslaan' })).toBeDisabled();
  });

  it('bewerkt een bestaande setlist met behoud van id en aanmaakmoment', async () => {
    const gebruiker = userEvent.setup();
    const opslaan = vi.fn();
    render(
      <SetlistBuilder
        availablePieces={BESCHIKBAAR}
        initialSetlist={{
          id: 'sl-1',
          name: 'Kerstconcert',
          pieces: [BESCHIKBAAR[0]],
          createdAt: '2026-01-01T00:00:00.000Z',
        }}
        onSave={opslaan}
      />,
    );

    expect(screen.getByLabelText('Setlist naam')).toHaveValue('Kerstconcert');
    expect(screen.getByText('1 stuk')).toBeInTheDocument();

    await gebruiker.click(voegToe('Finlandia'));
    await gebruiker.click(screen.getByRole('button', { name: 'Opslaan' }));

    expect(opslaan.mock.calls[0][0]).toMatchObject({
      id: 'sl-1',
      name: 'Kerstconcert',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(opslaan.mock.calls[0][0].pieces.map((stuk: SetlistPiece) => stuk.id)).toEqual(['p1', 'p3']);
  });

  it('toont tijdens het opslaan dat het bezig is en laat niet nog een keer klikken', () => {
    render(
      <SetlistBuilder
        availablePieces={BESCHIKBAAR}
        initialSetlist={{ name: 'Kerstconcert', pieces: [BESCHIKBAAR[0]] }}
        isLoading
      />,
    );

    expect(screen.getByRole('button', { name: 'Opslaan...' })).toBeDisabled();
  });

  it('toont de annuleerknop alleen als er iets te annuleren valt', async () => {
    const gebruiker = userEvent.setup();
    const annuleren = vi.fn();
    const { rerender } = render(<SetlistBuilder availablePieces={BESCHIKBAAR} />);

    expect(screen.queryByRole('button', { name: 'Annuleren' })).not.toBeInTheDocument();

    rerender(<SetlistBuilder availablePieces={BESCHIKBAAR} onCancel={annuleren} />);
    await gebruiker.click(screen.getByRole('button', { name: 'Annuleren' }));

    expect(annuleren).toHaveBeenCalled();
  });
});

describe('SetlistBuilder: de volgorde van het programma', () => {
  /** De titels in het programma, van boven naar beneden. */
  function programmavolgorde() {
    return Array.from(document.querySelectorAll('.setlist-piece-title')).map((element) => element.textContent);
  }

  async function metDrieStukken() {
    const gebruiker = userEvent.setup();
    render(<SetlistBuilder availablePieces={BESCHIKBAAR} />);
    await gebruiker.type(screen.getByLabelText('Setlist naam'), 'Voorjaarsconcert');
    await gebruiker.click(voegToe('Ouverture 1812'));
    await gebruiker.click(voegToe('Bolero'));
    await gebruiker.click(voegToe('Finlandia'));
    return gebruiker;
  }

  it('zet een gesleept stuk op zijn nieuwe plek in het programma', async () => {
    await metDrieStukken();

    await sleepOver('p3', 'p1');

    expect(programmavolgorde()).toEqual(['Finlandia', 'Ouverture 1812', 'Bolero']);
  });

  it('laat de volgorde met rust als een stuk op zijn eigen plek of ernaast valt', async () => {
    await metDrieStukken();

    await sleepOver('p2', 'p2');
    expect(programmavolgorde()).toEqual(['Ouverture 1812', 'Bolero', 'Finlandia']);

    await sleepOver('p2', null);
    expect(programmavolgorde()).toEqual(['Ouverture 1812', 'Bolero', 'Finlandia']);
  });

  it('toont het opgepakte stuk met componist en duur in de sleeplaag', async () => {
    await metDrieStukken();

    expect(screen.getByTestId('sleeplaag')).toBeEmptyDOMElement();

    await act(async () => {
      sleep.start?.({ active: { id: 'p2' } });
    });

    const laag = within(screen.getByTestId('sleeplaag'));
    expect(laag.getByText('Bolero')).toBeInTheDocument();
    expect(laag.getByText('Ravel')).toBeInTheDocument();
    expect(laag.getByText('15:45')).toBeInTheDocument();

    // Na het loslaten is de sleeplaag weer leeg.
    await sleepOver('p2', 'p1');
    expect(screen.getByTestId('sleeplaag')).toBeEmptyDOMElement();
  });

  it('toont een streepje in de sleeplaag bij een stuk zonder duur', async () => {
    await metDrieStukken();

    await act(async () => {
      sleep.start?.({ active: { id: 'p3' } });
    });

    expect(within(screen.getByTestId('sleeplaag')).getByText('--:--')).toBeInTheDocument();
  });

  it('slaat de gesleepte volgorde op', async () => {
    const opslaan = vi.fn();
    const gebruiker = userEvent.setup();
    render(<SetlistBuilder availablePieces={BESCHIKBAAR} onSave={opslaan} />);
    await gebruiker.type(screen.getByLabelText('Setlist naam'), 'Voorjaarsconcert');
    await gebruiker.click(voegToe('Ouverture 1812'));
    await gebruiker.click(voegToe('Bolero'));

    await sleepOver('p2', 'p1');
    await gebruiker.click(screen.getByRole('button', { name: 'Opslaan' }));

    expect(opslaan.mock.calls[0][0].pieces.map((stuk: SetlistPiece) => stuk.id)).toEqual(['p2', 'p1']);
  });
});
