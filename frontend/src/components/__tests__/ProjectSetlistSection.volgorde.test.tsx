/**
 * De setlist van een project: de volgorde van het programma.
 *
 * Het slepen zelf wordt hier niet nagebootst. dnd-kit heeft daarvoor echte
 * afmetingen nodig en in jsdom is elk element nul bij nul pixels; een
 * nagebootste sleepbeweging test dan de nabootsing. In plaats daarvan is
 * `DndContext` hieronder vervangen door een dubbelganger die de terugroepen
 * vasthoudt, zodat een test `onDragEnd` kan aanroepen zoals dnd-kit dat in de
 * browser zou doen. Wat daarna gebeurt - de nieuwe volgorde, de knoppen die
 * verschijnen, wat er naar de server gaat en wat er bij een fout terugdraait -
 * is wel gewoon de code van het onderdeel.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProjectSetlistSection } from '../ProjectSetlistSection';
import type { ProjectDetail } from '../../api/projects';
import { reorderProjectSetlist } from '../../api/projects';
import { showSuccess, showError } from '../../utils/toast';

vi.mock('../../api/projects', () => ({ reorderProjectSetlist: vi.fn() }));
vi.mock('../../utils/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));

vi.mock('react-i18next', async () => {
  const teksten = ((await import('../../locales/nl.json')) as { default: Record<string, unknown> }).default;
  const zoek = (sleutel: string): string | undefined =>
    sleutel.split('.').reduce<any>((deel, stuk) => (deel == null ? undefined : deel[stuk]), teksten);

  return {
    useTranslation: () => ({
      t: (sleutel: string, standaard?: string) => zoek(sleutel) ?? standaard ?? sleutel,
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

const SETLIST: ProjectDetail['setlist'] = [
  { id: 'i1', musicTitleName: 'Ouverture 1812', sortOrder: 0, durationMinutes: 15 },
  { id: 'i2', customTitle: 'Eigen bewerking', sortOrder: 1, durationMinutes: 50, notes: 'Met solist' },
  { id: 'i3', musicTitleName: 'Finlandia', sortOrder: 2, durationMinutes: 25 },
];

function project(setlist = SETLIST): ProjectDetail {
  return { id: 'pr-1', name: 'Voorjaarsproject', setlist } as unknown as ProjectDetail;
}

function wikkel({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** De titels in de volgorde waarin ze op het scherm staan. */
function volgorde() {
  return screen.getAllByText(/Ouverture 1812|Eigen bewerking|Finlandia/).map((element) => element.textContent);
}

/** Bootst na wat dnd-kit meldt als een stuk boven een ander losgelaten wordt. */
async function sleepOver(vanId: string, naarId: string) {
  await act(async () => {
    sleep.eind?.({ active: { id: vanId }, over: { id: naarId } });
  });
}

const opslaan = vi.mocked(reorderProjectSetlist);

beforeEach(() => {
  vi.clearAllMocks();
  opslaan.mockResolvedValue({ message: 'ok' });
});

describe('ProjectSetlistSection: het programma tonen', () => {
  it('meldt het als er nog geen setlist is', () => {
    render(<ProjectSetlistSection project={project([])} />, { wrapper: wikkel });

    expect(screen.getByText('Geen setlist beschikbaar.')).toBeInTheDocument();
  });

  it('zet de stukken op volgorde met nummer, notitie en duur', () => {
    const doorElkaar = [SETLIST[2], SETLIST[0], SETLIST[1]];
    render(<ProjectSetlistSection project={project(doorElkaar)} />, { wrapper: wikkel });

    expect(volgorde()).toEqual(['Ouverture 1812', 'Eigen bewerking', 'Finlandia']);
    expect(screen.getByText('Met solist')).toBeInTheDocument();
    expect(screen.getByText('50 min')).toBeInTheDocument();
    // 90 minuten wordt getoond als anderhalf uur.
    expect(screen.getByText(/Totale duur: 1:30/)).toBeInTheDocument();
  });

  it('laat de totale duur weg als geen enkel stuk een duur heeft', () => {
    render(<ProjectSetlistSection project={project([{ id: 'i9', musicTitleName: 'Onbekend', sortOrder: 0 }])} />, {
      wrapper: wikkel,
    });

    expect(screen.queryByText(/Totale duur/)).not.toBeInTheDocument();
    expect(screen.getByText('Onbekend')).toBeInTheDocument();
  });

  it('neemt een nieuwe setlist van het project over', () => {
    const { rerender } = render(<ProjectSetlistSection project={project()} />, { wrapper: wikkel });

    rerender(<ProjectSetlistSection project={project([SETLIST[1], SETLIST[0]])} />);

    expect(volgorde()).toEqual(['Ouverture 1812', 'Eigen bewerking']);
    expect(screen.queryByText('Finlandia')).not.toBeInTheDocument();
  });
});

describe('ProjectSetlistSection: de volgorde wijzigen', () => {
  it('biedt pas opslaan en annuleren aan nadat de volgorde gewijzigd is', async () => {
    render(<ProjectSetlistSection project={project()} />, { wrapper: wikkel });

    expect(screen.queryByRole('button', { name: /Opslaan/ })).not.toBeInTheDocument();

    await sleepOver('i3', 'i1');

    expect(volgorde()).toEqual(['Finlandia', 'Ouverture 1812', 'Eigen bewerking']);
    expect(screen.getByRole('button', { name: /Opslaan/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Annuleren' })).toBeInTheDocument();
  });

  it('laat de volgorde met rust als een stuk op zijn eigen plek valt', async () => {
    render(<ProjectSetlistSection project={project()} />, { wrapper: wikkel });

    await sleepOver('i2', 'i2');

    expect(volgorde()).toEqual(['Ouverture 1812', 'Eigen bewerking', 'Finlandia']);
    expect(screen.queryByRole('button', { name: /Opslaan/ })).not.toBeInTheDocument();
  });

  it('laat de volgorde met rust als een stuk buiten de lijst losgelaten wordt', async () => {
    render(<ProjectSetlistSection project={project()} />, { wrapper: wikkel });

    await act(async () => {
      sleep.eind?.({ active: { id: 'i1' }, over: null });
    });

    expect(volgorde()).toEqual(['Ouverture 1812', 'Eigen bewerking', 'Finlandia']);
    expect(screen.queryByRole('button', { name: /Opslaan/ })).not.toBeInTheDocument();
  });

  it('toont het opgepakte stuk in de sleeplaag', async () => {
    render(<ProjectSetlistSection project={project()} />, { wrapper: wikkel });

    expect(screen.getByTestId('sleeplaag')).toBeEmptyDOMElement();

    await act(async () => {
      sleep.start?.({ active: { id: 'i3' } });
    });

    expect(screen.getByTestId('sleeplaag')).toHaveTextContent('Finlandia');
  });

  it('draait een wijziging terug bij annuleren', async () => {
    const gebruiker = userEvent.setup();
    render(<ProjectSetlistSection project={project()} />, { wrapper: wikkel });

    await sleepOver('i3', 'i1');
    await gebruiker.click(screen.getByRole('button', { name: 'Annuleren' }));

    expect(volgorde()).toEqual(['Ouverture 1812', 'Eigen bewerking', 'Finlandia']);
    expect(screen.queryByRole('button', { name: 'Annuleren' })).not.toBeInTheDocument();
    expect(opslaan).not.toHaveBeenCalled();
  });
});

describe('ProjectSetlistSection: opslaan', () => {
  it('stuurt de nieuwe volgorde naar de server en meldt het', async () => {
    const gebruiker = userEvent.setup();
    const bijgewerkt = vi.fn();
    render(<ProjectSetlistSection project={project()} onUpdate={bijgewerkt} />, { wrapper: wikkel });

    await sleepOver('i1', 'i3');
    await gebruiker.click(screen.getByRole('button', { name: /Opslaan/ }));

    await waitFor(() => expect(opslaan).toHaveBeenCalledWith('pr-1', ['i2', 'i3', 'i1']));
    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith('Setlist volgorde opgeslagen'));
    expect(bijgewerkt).toHaveBeenCalled();
    // De knoppen verdwijnen zodra de volgorde bewaard is.
    await waitFor(() => expect(screen.queryByRole('button', { name: /Opslaan/ })).not.toBeInTheDocument());
  });

  it('herstelt de oude volgorde als opslaan mislukt', async () => {
    const gebruiker = userEvent.setup();
    opslaan.mockRejectedValue(new Error('netwerk'));
    render(<ProjectSetlistSection project={project()} />, { wrapper: wikkel });

    await sleepOver('i3', 'i1');
    expect(volgorde()).toEqual(['Finlandia', 'Ouverture 1812', 'Eigen bewerking']);

    await gebruiker.click(screen.getByRole('button', { name: /Opslaan/ }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('Fout bij opslaan setlist volgorde'));
    expect(volgorde()).toEqual(['Ouverture 1812', 'Eigen bewerking', 'Finlandia']);
    expect(screen.queryByRole('button', { name: 'Annuleren' })).not.toBeInTheDocument();
  });
});
