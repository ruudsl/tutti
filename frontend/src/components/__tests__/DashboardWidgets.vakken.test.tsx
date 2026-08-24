/**
 * De vakken van het dashboard.
 *
 * Elk vak haalt zijn eigen gegevens op en heeft een lege tegenhanger. Wat hier
 * getest wordt is wat de gebruiker ziet staan: het getal, de lijst, de balk,
 * en wat er in plaats daarvan komt als er niets is.
 *
 * De getallen worden nagerekend, niet alleen op aanwezigheid gecontroleerd. In
 * de kop van DashboardWidgets.tsx staat waarom: drie tellers stonden ooit
 * permanent op nul omdat ze velden lazen die het antwoord niet heeft, en de
 * voortgangsbalk stond op nul procent om dezelfde reden. Een test die alleen
 * kijkt of er een getal staat, keurt die nul goed.
 *
 * Het slepen wordt hier op de vakken zelf getest - welke index er naar boven
 * gaat - en niet wat er daarna met de volgorde gebeurt; dat is het werk van de
 * hook en staat in useDashboardWidgets.indeling.test.ts.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactElement } from 'react';
import { WidgetContainer, DashboardEditToggle } from '../DashboardWidgets';
import type { DashboardWidget, WidgetType } from '../../hooks/useDashboardWidgets';
import * as api from '../../api';
import * as taken from '../../api/tasks';

vi.mock('../../api');
vi.mock('../../api/tasks');

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel, i18n: { language: 'nl' } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

function vak(type: WidgetType, extra: Partial<DashboardWidget> = {}): DashboardWidget {
  return { id: type, type, title: type, enabled: true, order: 0, size: 'medium', ...extra };
}

function toon(element: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const { container } = render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{element}</MemoryRouter>
    </QueryClientProvider>,
  );
  return { gebruiker: userEvent.setup(), container };
}

/** Eén vak in de gewone stand, zonder bewerkknoppen eromheen. */
function toonVak(type: WidgetType, extra: Partial<DashboardWidget> = {}) {
  return toon(
    <WidgetContainer
      widget={vak(type, extra)}
      isEditMode={false}
      onToggle={() => {}}
      onSizeChange={() => {}}
      index={0}
      onDragStart={() => {}}
      onDragOver={() => {}}
      onDragEnd={() => {}}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getActivityStats).mockResolvedValue({ totals: { total_downloads: 0 } } as never);
  vi.mocked(api.getPracticeStats).mockResolvedValue({ totalMinutes: 0, weekMinutes: 0 } as never);
  vi.mocked(api.getMusicPiecesPaginated).mockResolvedValue({ data: [], total: 0, page: 1, limit: 1 } as never);
  vi.mocked(api.getMyMusicLists).mockResolvedValue([] as never);
  vi.mocked(api.getFavorites).mockResolvedValue([] as never);
  vi.mocked(api.getUpcomingRehearsals).mockResolvedValue([] as never);
  vi.mocked(taken.getTaskSummary).mockResolvedValue({
    statusSummary: {},
    totalOpen: 0,
    myTasks: [],
    overdueTasks: [],
  } as never);
});

describe('dashboardvakken - de tellers', () => {
  it('haalt elk getal bij de bron waar het echt staat', async () => {
    vi.mocked(api.getMusicPiecesPaginated).mockResolvedValue({ data: [], total: 137, page: 1, limit: 1 } as never);
    vi.mocked(api.getPracticeStats).mockResolvedValue({ totalMinutes: 480, weekMinutes: 60 } as never);
    vi.mocked(api.getActivityStats).mockResolvedValue({ totals: { total_downloads: 42 } } as never);
    toonVak('stats');

    expect(await screen.findByText('137')).toBeInTheDocument();
    expect(screen.getByText('480')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    // Het aantal stukken komt van de telling naast één rij, niet van de rijen.
    expect(api.getMusicPiecesPaginated).toHaveBeenCalledWith({ page: 1, pageSize: 1 });
  });

  it('toont nul zolang er nog niets binnen is', async () => {
    vi.mocked(api.getActivityStats).mockResolvedValue({} as never);
    vi.mocked(api.getPracticeStats).mockResolvedValue({} as never);
    vi.mocked(api.getMusicPiecesPaginated).mockResolvedValue({} as never);
    toonVak('stats');

    await waitFor(() => expect(screen.getAllByText('0')).toHaveLength(3));
  });
});

describe('dashboardvakken - oefenvoortgang', () => {
  it('rekent de balk uit als deel van het weekdoel van 120 minuten', async () => {
    vi.mocked(api.getPracticeStats).mockResolvedValue({ totalMinutes: 300, weekMinutes: 60 } as never);
    const { container } = toonVak('practice-progress');

    expect(await screen.findByText(/^60 \/ 120/)).toBeInTheDocument();
    // 60 van 120 is de helft.
    expect(container.querySelector<HTMLElement>('.progress-bar')).toHaveStyle({ width: '50%' });
  });

  it('loopt niet voorbij de honderd procent', async () => {
    vi.mocked(api.getPracticeStats).mockResolvedValue({ totalMinutes: 900, weekMinutes: 300 } as never);
    const { container } = toonVak('practice-progress');

    await screen.findByText(/^300 \/ 120/);
    expect(container.querySelector<HTMLElement>('.progress-bar')).toHaveStyle({ width: '100%' });
  });

  it('staat op nul zonder gegevens', async () => {
    vi.mocked(api.getPracticeStats).mockRejectedValue(new Error('weg'));
    const { container } = toonVak('practice-progress');

    await waitFor(() => expect(container.querySelector<HTMLElement>('.progress-bar')).toHaveStyle({ width: '0%' }));
    expect(screen.getByText(/^0 \/ 120/)).toBeInTheDocument();
  });
});

describe('dashboardvakken - taken', () => {
  it('toont het aantal open taken, de achterstand en de eigen taken', async () => {
    vi.mocked(taken.getTaskSummary).mockResolvedValue({
      statusSummary: {},
      totalOpen: 5,
      myTasks: [
        { id: 't1', title: 'Partijen kopiëren', status: 'todo', priority: 'urgent', dueDate: '2020-01-01' },
        { id: 't2', title: 'Zaal reserveren', status: 'todo', priority: 'low' },
      ],
      overdueTasks: [{ id: 't1', title: 'Partijen kopiëren', status: 'todo', priority: 'urgent' }],
    } as never);
    toonVak('tasks');

    expect(await screen.findByText('Partijen kopiëren')).toBeInTheDocument();
    expect(screen.getByText(/^5/)).toHaveTextContent('5 widgets.openTasks');
    expect(screen.getByText(/widgets.overdue/)).toHaveTextContent('1 widgets.overdue');
    // Dringend krijgt een ander teken dan laag.
    expect(screen.getByTitle('urgent')).toHaveTextContent('⚠');
    expect(screen.getByTitle('low')).toHaveTextContent('○');
  });

  it('meldt het als er geen taken zijn', async () => {
    toonVak('tasks');

    expect(await screen.findByText('widgets.noTasks')).toBeInTheDocument();
  });

  it('meldt dat het nog laadt', () => {
    vi.mocked(taken.getTaskSummary).mockReturnValue(new Promise(() => {}) as never);
    toonVak('tasks');

    expect(screen.getByText('common.loading')).toBeInTheDocument();
  });
});

describe('dashboardvakken - lijsten', () => {
  it('toont hoogstens vijf muzieklijsten met hun aantal titels', async () => {
    vi.mocked(api.getMyMusicLists).mockResolvedValue(
      Array.from({ length: 7 }, (_, i) => ({ id: `l${i}`, name: `Lijst ${i}`, titleCount: i })) as never,
    );
    toonVak('music-lists');

    expect(await screen.findByText('Lijst 0')).toBeInTheDocument();
    expect(screen.queryByText('Lijst 5')).not.toBeInTheDocument();
    expect(screen.getByText('Lijst 4').closest<HTMLElement>('li')).toHaveTextContent('4');
    // Een lijst zonder titels toont een nul, geen leeg vakje.
    expect(screen.getByText('Lijst 0').closest<HTMLElement>('li')).toHaveTextContent('0');
  });

  it('meldt het als er geen muzieklijsten zijn', async () => {
    toonVak('music-lists');

    expect(await screen.findByText('widgets.noMusicLists')).toBeInTheDocument();
  });

  it('toont hoogstens vijf favorieten', async () => {
    vi.mocked(api.getFavorites).mockResolvedValue(
      Array.from({ length: 6 }, (_, i) => ({ id: `f${i}`, title: `Stuk ${i}` })) as never,
    );
    toonVak('favorites');

    expect(await screen.findByText('Stuk 0')).toBeInTheDocument();
    expect(screen.queryByText('Stuk 5')).not.toBeInTheDocument();
  });

  it('meldt het als er geen favorieten zijn', async () => {
    toonVak('favorites');

    expect(await screen.findByText('widgets.noFavorites')).toBeInTheDocument();
  });
});

describe('dashboardvakken - komende repetities', () => {
  it('toont orkest, tijd en plaats van de eerstvolgende repetities', async () => {
    vi.mocked(api.getUpcomingRehearsals).mockResolvedValue([
      {
        id: 'r1',
        date: '2026-09-03',
        orchestra_name: 'Harmonie',
        start_time: '19:30',
        end_time: '21:30',
        location: 'Dorpshuis',
      },
    ] as never);
    toonVak('upcoming-rehearsals');

    expect(await screen.findByText('Harmonie')).toBeInTheDocument();
    expect(screen.getByText('19:30 – 21:30')).toBeInTheDocument();
    expect(screen.getByText('Dorpshuis')).toBeInTheDocument();
    expect(api.getUpcomingRehearsals).toHaveBeenCalledWith(3);
  });

  it('laat de eindtijd weg als die er niet is', async () => {
    vi.mocked(api.getUpcomingRehearsals).mockResolvedValue([
      { id: 'r1', date: '2026-09-03', start_time: '19:30' },
    ] as never);
    toonVak('upcoming-rehearsals');

    expect(await screen.findByText('19:30')).toBeInTheDocument();
  });

  it('meldt het als er geen repetities gepland staan', async () => {
    toonVak('upcoming-rehearsals');

    expect(await screen.findByText('widgets.noUpcomingRehearsals')).toBeInTheDocument();
  });

  it('meldt dat het nog laadt', () => {
    vi.mocked(api.getUpcomingRehearsals).mockReturnValue(new Promise(() => {}) as never);
    toonVak('upcoming-rehearsals');

    expect(screen.getByText('common.loading')).toBeInTheDocument();
  });
});

describe('dashboardvakken - de vaste vakken', () => {
  it('geeft snelkoppelingen naar vier pagina´s', () => {
    toonVak('quick-actions');

    expect(screen.getByRole('link', { name: /nav.myMusic/ })).toHaveAttribute('href', '/my-music');
    expect(screen.getByRole('link', { name: /nav.rehearsals/ })).toHaveAttribute('href', '/rehearsals');
    expect(screen.getByRole('link', { name: /nav.tools/ })).toHaveAttribute('href', '/tools');
    expect(screen.getByRole('link', { name: /nav.issues/ })).toHaveAttribute('href', '/issues');
  });

  it('meldt dat er nog geen berichten of activiteit is', () => {
    toonVak('recent-activity');
    expect(screen.getByText('widgets.noRecentActivity')).toBeInTheDocument();
  });

  it('toont het mededelingenvak leeg', () => {
    toonVak('announcements');
    expect(screen.getByText('widgets.noAnnouncements')).toBeInTheDocument();
  });

  it('zegt het eerlijk bij een onbekend soort vak', () => {
    toonVak('iets-nieuws' as WidgetType);
    expect(screen.getByText(/Unknown widget type/)).toBeInTheDocument();
  });
});

describe('dashboardvakken - de bewerkstand', () => {
  it('toont de bewerkknoppen alleen in de bewerkstand', () => {
    const { container } = toon(
      <WidgetContainer
        widget={vak('favorites')}
        isEditMode={false}
        onToggle={() => {}}
        onSizeChange={() => {}}
        index={0}
        onDragStart={() => {}}
        onDragOver={() => {}}
        onDragEnd={() => {}}
      />,
    );

    expect(container.querySelector<HTMLElement>('.widget-edit-overlay')).toBeNull();
    expect(container.querySelector<HTMLElement>('.widget-wrapper')).not.toHaveAttribute('draggable', 'true');
  });

  it('zet een vak uit en verandert de grootte', async () => {
    const zetUit = vi.fn();
    const zetGrootte = vi.fn();
    const { gebruiker, container } = toon(
      <WidgetContainer
        widget={vak('favorites', { size: 'small' })}
        isEditMode
        onToggle={zetUit}
        onSizeChange={zetGrootte}
        index={2}
        onDragStart={() => {}}
        onDragOver={() => {}}
        onDragEnd={() => {}}
      />,
    );

    expect(container.querySelector<HTMLElement>('.widget-wrapper')).toHaveClass('widget-small', 'edit-mode');
    expect(screen.getByTestId('icon-eye')).toBeInTheDocument();

    await gebruiker.click(screen.getByRole('button', { name: 'dashboard.hideWidget' }));
    expect(zetUit).toHaveBeenCalled();

    await gebruiker.selectOptions(screen.getByRole('combobox'), 'full');
    expect(zetGrootte).toHaveBeenCalledWith('full');
  });

  it('toont het doorgestreepte oog bij een uitgezet vak', () => {
    toon(
      <WidgetContainer
        widget={vak('favorites', { enabled: false })}
        isEditMode
        onToggle={() => {}}
        onSizeChange={() => {}}
        index={0}
        onDragStart={() => {}}
        onDragOver={() => {}}
        onDragEnd={() => {}}
      />,
    );

    expect(screen.getByRole('button', { name: 'dashboard.showWidget' })).toBeInTheDocument();
    expect(screen.getByTestId('icon-eyeOff')).toBeInTheDocument();
  });

  it('meldt bij het slepen welke plek wordt opgepakt en waar hij overheen gaat', () => {
    const opgepakt = vi.fn();
    const eroverheen = vi.fn();
    const losgelaten = vi.fn();
    const { container } = toon(
      <WidgetContainer
        widget={vak('favorites')}
        isEditMode
        onToggle={() => {}}
        onSizeChange={() => {}}
        index={3}
        onDragStart={opgepakt}
        onDragOver={eroverheen}
        onDragEnd={losgelaten}
      />,
    );

    const omhulsel = container.querySelector<HTMLElement>('.widget-wrapper')!;
    expect(omhulsel).toHaveAttribute('draggable', 'true');

    fireEvent.dragStart(omhulsel, { dataTransfer: { effectAllowed: 'none' } });
    expect(opgepakt).toHaveBeenCalledWith(3);
    expect(omhulsel).toHaveClass('dragging');

    fireEvent.dragOver(omhulsel);
    expect(eroverheen).toHaveBeenCalledWith(3);

    fireEvent.dragEnd(omhulsel);
    expect(losgelaten).toHaveBeenCalled();
    expect(omhulsel).not.toHaveClass('dragging');
  });

  it('de knoppenbalk toont de terugzetknop alleen tijdens het bewerken', async () => {
    const wissel = vi.fn();
    const terug = vi.fn();
    const { gebruiker } = toon(<DashboardEditToggle isEditMode={false} onToggle={wissel} onReset={terug} />);

    expect(screen.queryByRole('button', { name: 'dashboard.resetToDefault' })).not.toBeInTheDocument();
    await gebruiker.click(screen.getByRole('button', { name: 'dashboard.customizeDashboard' }));
    expect(wissel).toHaveBeenCalled();
  });

  it('de knoppenbalk zet de indeling terug', async () => {
    const terug = vi.fn();
    const { gebruiker } = toon(<DashboardEditToggle isEditMode onToggle={() => {}} onReset={terug} />);

    expect(screen.getByRole('button', { name: 'dashboard.doneEditing' })).toBeInTheDocument();
    await gebruiker.click(screen.getByRole('button', { name: 'dashboard.resetToDefault' }));
    expect(terug).toHaveBeenCalled();
  });
});

describe('dashboardvakken - koppen en links', () => {
  it('elk vak wijst naar zijn eigen pagina', async () => {
    toonVak('music-lists');

    const kop = screen.getByText('widgets.myMusicLists').closest<HTMLElement>('.widget-header')!;
    expect(within(kop).getByRole('link', { name: 'widgets.viewAll' })).toHaveAttribute('href', '/my-music');
  });
});
