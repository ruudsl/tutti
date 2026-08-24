/**
 * De pagina met externe muzikanten: filteren, toevoegen, bewerken en op
 * non-actief zetten.
 *
 * De bestaande test ernaast gaat over de koppeling tussen label en veld. Wat
 * er met die velden gebeurt stond nergens: dat het formulier bij het bewerken
 * gevuld wordt met de gegevens die apart opgehaald worden, dat een muzikant
 * meerdere instrumenten met een niveau kan hebben en dat die rijen erbij en
 * eraf kunnen, en dat de vier filters boven de lijst hun waarde doorgeven aan
 * de bevraging.
 *
 * De sterbeoordeling is hier ook getest. Dat zijn vijf knoppen zonder tekst,
 * dus ze worden opgezocht op hun volgorde binnen de groepskop - dezelfde
 * volgorde als waarin ze op het scherm staan.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import ExternalMusicians from '../ExternalMusicians';

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../components/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

vi.mock('../../components/Skeleton', () => ({
  SkeletonTable: () => <div data-testid="skelet-tabel" />,
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', role: heerser.rol } }),
}));

const { heerser, houder, muteerders } = vi.hoisted(() => ({
  heerser: { rol: 'admin' },
  houder: {
    lijst: [] as unknown[],
    detail: null as unknown,
    laden: false,
    laatsteFilters: undefined as unknown,
  },
  muteerders: { maken: vi.fn(), bijwerken: vi.fn(), verwijderen: vi.fn() },
}));

function maakMuteerder(spion: (waarden: unknown) => void) {
  return () => ({
    mutate: (waarden: unknown) => spion(waarden),
    mutateAsync: async (waarden: unknown) => spion(waarden),
    isPending: false,
  });
}

vi.mock('../../hooks/useExternalMusicians', () => ({
  useExternalMusicians: (filters: unknown) => {
    houder.laatsteFilters = filters;
    return { data: houder.lijst, isLoading: houder.laden };
  },
  useExternalMusician: () => ({ data: houder.detail }),
  useCreateExternalMusician: maakMuteerder(muteerders.maken),
  useUpdateExternalMusician: maakMuteerder(muteerders.bijwerken),
  useDeleteExternalMusician: maakMuteerder(muteerders.verwijderen),
}));

vi.mock('../../hooks/useInstruments', () => ({
  useInstruments: () => ({
    data: [
      { id: 'inst-1', name: 'Trompet', tuning: 'Bb' },
      { id: 'inst-2', name: 'Hoorn', tuning: null },
    ],
  }),
}));

const MUZIKANT = {
  id: 'muz-1',
  firstName: 'Marieke',
  lastName: 'de Vries',
  email: 'marieke@example.org',
  phone: '0612345678',
  musicianType: 'guest',
  instrumentNames: 'Trompet',
  rating: 4,
  totalPerformances: 7,
  isActive: true,
};

const MUZIKANT_DETAIL = {
  ...MUZIKANT,
  notes: 'Speelt graag hoge partijen',
  lastPlayedDate: '2026-05-04',
  instruments: [
    {
      id: 'i-1',
      instrumentId: 'inst-1',
      instrumentName: 'Trompet',
      instrumentTuning: 'Bb',
      isPrimary: true,
      skillLevel: 'advanced',
    },
  ],
  recentAssignments: [
    {
      id: 'a-1',
      eventDate: '2026-05-04',
      eventName: 'Voorjaarsconcert',
      eventType: 'concert',
      instrumentName: 'Trompet',
      status: 'completed',
    },
    {
      id: 'a-2',
      eventDate: '2026-06-01',
      eventName: null,
      eventType: 'repetitie',
      instrumentName: 'Trompet',
      status: 'no_show',
    },
  ],
};

function wikkel({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

async function openPagina() {
  const gebruiker = userEvent.setup();
  render(<ExternalMusicians />, { wrapper: wikkel });
  return gebruiker;
}

/** Open het venster "muzikant toevoegen". */
async function openInvoervenster() {
  const gebruiker = await openPagina();
  await gebruiker.click(await screen.findByRole('button', { name: /externalMusicians\.addMusician/ }));
  return { gebruiker, venster: await screen.findByRole('dialog') };
}

beforeEach(() => {
  vi.clearAllMocks();
  heerser.rol = 'admin';
  houder.lijst = [];
  houder.detail = null;
  houder.laden = false;
});

describe('externe muzikanten - de lijst', () => {
  it('toont een skelet zolang de lijst nog niet binnen is', () => {
    houder.laden = true;
    render(<ExternalMusicians />, { wrapper: wikkel });

    expect(screen.getByTestId('skelet-tabel')).toBeInTheDocument();
  });

  it('meldt een lege lijst', async () => {
    await openPagina();

    expect(screen.getByText('externalMusicians.noMusicians')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('zet de muzikant met soort, instrumenten en optredens in de tabel', async () => {
    houder.lijst = [MUZIKANT];
    await openPagina();

    const rij = screen.getByRole('row', { name: /Marieke de Vries/ });
    expect(within(rij).getByText('Gast')).toBeInTheDocument();
    expect(within(rij).getByText('Trompet')).toBeInTheDocument();
    expect(within(rij).getByText('7')).toBeInTheDocument();
    expect(within(rij).getByText('externalMusicians.active')).toBeInTheDocument();
  });

  it('geeft een muzikant zonder instrumenten een streepje', async () => {
    houder.lijst = [{ ...MUZIKANT, instrumentNames: null, isActive: false }];
    await openPagina();

    const rij = screen.getByRole('row', { name: /Marieke de Vries/ });
    expect(within(rij).getByText('-')).toBeInTheDocument();
    expect(within(rij).getByText('externalMusicians.inactive')).toBeInTheDocument();
    // Wie al op non-actief staat kan niet nog eens op non-actief gezet worden.
    expect(within(rij).queryByRole('button', { name: 'externalMusicians.deactivate' })).not.toBeInTheDocument();
  });
});

describe('externe muzikanten - de filterbalk', () => {
  it('geeft het zoekwoord door aan de bevraging', async () => {
    const gebruiker = await openPagina();

    await gebruiker.type(screen.getByLabelText('externalMusicians.filterSearch'), 'Marieke');

    await waitFor(() => expect((houder.laatsteFilters as { search?: string }).search).toBe('Marieke'));
  });

  it('geeft de soort en het instrument door', async () => {
    const gebruiker = await openPagina();

    await gebruiker.selectOptions(screen.getByLabelText('externalMusicians.filterType'), 'alumni');
    await gebruiker.selectOptions(screen.getByLabelText('externalMusicians.filterInstrument'), 'inst-2');

    await waitFor(() => {
      const filters = houder.laatsteFilters as { type?: string; instrumentId?: string };
      expect(filters.type).toBe('alumni');
      expect(filters.instrumentId).toBe('inst-2');
    });
  });

  it('vertaalt het statusfilter naar wel, niet of alles', async () => {
    const gebruiker = await openPagina();
    const filter = screen.getByLabelText('externalMusicians.filterStatus');

    await gebruiker.selectOptions(filter, 'true');
    await waitFor(() => expect((houder.laatsteFilters as { isActive?: boolean }).isActive).toBe(true));

    await gebruiker.selectOptions(filter, 'false');
    await waitFor(() => expect((houder.laatsteFilters as { isActive?: boolean }).isActive).toBe(false));

    await gebruiker.selectOptions(filter, '');
    await waitFor(() => expect((houder.laatsteFilters as { isActive?: boolean }).isActive).toBeUndefined());
  });
});

describe('externe muzikanten - een muzikant toevoegen', () => {
  it('stuurt de ingevulde gegevens op en sluit het venster', async () => {
    const { gebruiker, venster } = await openInvoervenster();

    await gebruiker.type(within(venster).getByLabelText(/externalMusicians\.firstName/), 'Marieke');
    await gebruiker.type(within(venster).getByLabelText(/externalMusicians\.lastName/), 'de Vries');
    await gebruiker.type(within(venster).getByLabelText('common.email'), 'marieke@example.org');
    await gebruiker.type(within(venster).getByLabelText('common.phone'), '0612345678');
    await gebruiker.selectOptions(within(venster).getByLabelText(/externalMusicians\.type/), 'alumni');
    await gebruiker.type(within(venster).getByLabelText('common.notes'), 'Speelt hoog');
    await gebruiker.click(within(venster).getByRole('button', { name: 'common.add' }));

    await waitFor(() => expect(muteerders.maken).toHaveBeenCalled());
    expect(muteerders.maken).toHaveBeenCalledWith({
      firstName: 'Marieke',
      lastName: 'de Vries',
      email: 'marieke@example.org',
      phone: '0612345678',
      musicianType: 'alumni',
      notes: 'Speelt hoog',
      rating: null,
      instruments: undefined,
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('stuurt lege velden als "niets" in plaats van als lege tekst', async () => {
    const { gebruiker, venster } = await openInvoervenster();

    await gebruiker.type(within(venster).getByLabelText(/externalMusicians\.firstName/), 'Jan');
    await gebruiker.type(within(venster).getByLabelText(/externalMusicians\.lastName/), 'Jansen');
    await gebruiker.click(within(venster).getByRole('button', { name: 'common.add' }));

    await waitFor(() => expect(muteerders.maken).toHaveBeenCalled());
    expect(muteerders.maken.mock.calls[0][0]).toMatchObject({ email: null, phone: null, notes: null });
  });

  it('zet de beoordeling op het aantal aangeklikte sterren', async () => {
    const { gebruiker, venster } = await openInvoervenster();

    await gebruiker.type(within(venster).getByLabelText(/externalMusicians\.firstName/), 'Jan');
    await gebruiker.type(within(venster).getByLabelText(/externalMusicians\.lastName/), 'Jansen');

    const sterren = within(screen.getByRole('group', { name: 'externalMusicians.rating' })).getAllByRole('button');
    await gebruiker.click(sterren[3]);
    await gebruiker.click(within(venster).getByRole('button', { name: 'common.add' }));

    await waitFor(() => expect(muteerders.maken).toHaveBeenCalled());
    expect(muteerders.maken.mock.calls[0][0]).toMatchObject({ rating: 4 });
  });

  it('voegt instrumentrijen toe, vult ze in en haalt ze er weer af', async () => {
    const { gebruiker, venster } = await openInvoervenster();
    const groep = screen.getByRole('group', { name: 'externalMusicians.instruments' });

    await gebruiker.type(within(venster).getByLabelText(/externalMusicians\.firstName/), 'Jan');
    await gebruiker.type(within(venster).getByLabelText(/externalMusicians\.lastName/), 'Jansen');

    await gebruiker.click(within(groep).getByRole('button', { name: /externalMusicians\.addInstrument/ }));
    await gebruiker.click(within(groep).getByRole('button', { name: /externalMusicians\.addInstrument/ }));
    expect(within(groep).getAllByRole('combobox')).toHaveLength(4);

    // De eerste rij: instrument, niveau en het vinkje "hoofdinstrument".
    const keuzelijsten = within(groep).getAllByRole('combobox');
    await gebruiker.selectOptions(keuzelijsten[0], 'inst-1');
    await gebruiker.selectOptions(keuzelijsten[1], 'advanced');
    await gebruiker.click(within(groep).getAllByRole('checkbox')[0]);

    // De tweede rij weer weghalen.
    await gebruiker.click(within(groep).getAllByTestId('icon-trash')[1].closest('button') as HTMLElement);
    expect(within(groep).getAllByRole('combobox')).toHaveLength(2);

    await gebruiker.click(within(venster).getByRole('button', { name: 'common.add' }));

    await waitFor(() => expect(muteerders.maken).toHaveBeenCalled());
    expect(muteerders.maken.mock.calls[0][0]).toMatchObject({
      instruments: [{ instrumentId: 'inst-1', skillLevel: 'advanced', isPrimary: true }],
    });
  });

  it('laat een leeggemaakt niveau weer los', async () => {
    const { gebruiker, venster } = await openInvoervenster();
    const groep = screen.getByRole('group', { name: 'externalMusicians.instruments' });

    await gebruiker.type(within(venster).getByLabelText(/externalMusicians\.firstName/), 'Jan');
    await gebruiker.type(within(venster).getByLabelText(/externalMusicians\.lastName/), 'Jansen');
    await gebruiker.click(within(groep).getByRole('button', { name: /externalMusicians\.addInstrument/ }));

    const keuzelijsten = within(groep).getAllByRole('combobox');
    await gebruiker.selectOptions(keuzelijsten[1], 'beginner');
    await gebruiker.selectOptions(keuzelijsten[1], '');
    await gebruiker.click(within(venster).getByRole('button', { name: 'common.add' }));

    await waitFor(() => expect(muteerders.maken).toHaveBeenCalled());
    expect(muteerders.maken.mock.calls[0][0]).toMatchObject({
      instruments: [{ instrumentId: '', skillLevel: null, isPrimary: false }],
    });
  });

  it('maakt het formulier leeg bij het afbreken', async () => {
    const { gebruiker, venster } = await openInvoervenster();

    await gebruiker.type(within(venster).getByLabelText(/externalMusicians\.firstName/), 'Marieke');
    await gebruiker.click(within(venster).getByRole('button', { name: 'common.cancel' }));

    await gebruiker.click(screen.getByRole('button', { name: /externalMusicians\.addMusician/ }));
    const opnieuw = await screen.findByRole('dialog');
    expect(within(opnieuw).getByLabelText(/externalMusicians\.firstName/)).toHaveValue('');
  });
});

describe('externe muzikanten - een muzikant bewerken', () => {
  beforeEach(() => {
    houder.lijst = [MUZIKANT];
    houder.detail = MUZIKANT_DETAIL;
  });

  it('vult het formulier met de opgehaalde gegevens van de muzikant', async () => {
    const gebruiker = await openPagina();

    await gebruiker.click(screen.getByRole('button', { name: 'common.edit' }));
    const venster = await screen.findByRole('dialog');

    expect(within(venster).getByLabelText(/externalMusicians\.firstName/)).toHaveValue('Marieke');
    expect(within(venster).getByLabelText(/externalMusicians\.lastName/)).toHaveValue('de Vries');
    expect(within(venster).getByLabelText('common.email')).toHaveValue('marieke@example.org');
    expect(within(venster).getByLabelText('common.notes')).toHaveValue('Speelt graag hoge partijen');
    // Het instrument van de muzikant staat als rij in de groep.
    const groep = screen.getByRole('group', { name: 'externalMusicians.instruments' });
    expect(within(groep).getAllByRole('combobox')[0]).toHaveValue('inst-1');
  });

  it('stuurt de wijziging op onder het nummer van de muzikant', async () => {
    const gebruiker = await openPagina();

    await gebruiker.click(screen.getByRole('button', { name: 'common.edit' }));
    const venster = await screen.findByRole('dialog');
    await gebruiker.clear(within(venster).getByLabelText('common.phone'));
    await gebruiker.type(within(venster).getByLabelText('common.phone'), '0687654321');
    await gebruiker.click(within(venster).getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(muteerders.bijwerken).toHaveBeenCalled());
    expect(muteerders.bijwerken.mock.calls[0][0]).toMatchObject({
      id: 'muz-1',
      data: expect.objectContaining({ firstName: 'Marieke', phone: '0687654321' }),
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

describe('externe muzikanten - het detailvenster', () => {
  beforeEach(() => {
    houder.lijst = [MUZIKANT];
    houder.detail = MUZIKANT_DETAIL;
  });

  it('toont de instrumenten en de laatste optredens', async () => {
    const gebruiker = await openPagina();

    await gebruiker.click(screen.getByRole('button', { name: 'Marieke de Vries' }));
    const venster = await screen.findByRole('dialog');

    expect(within(venster).getByText(/Trompet \(Bb\) - Vergevorderd/)).toBeInTheDocument();
    expect(within(venster).getByText(/Voorjaarsconcert/)).toBeInTheDocument();
    expect(within(venster).getByText('completed')).toBeInTheDocument();
    // Zonder eigen naam valt een optreden terug op zijn soort.
    expect(within(venster).getByText(/repetitie/)).toBeInTheDocument();
    expect(within(venster).getByText('no_show')).toBeInTheDocument();
  });

  it('sluit het detailvenster weer', async () => {
    const gebruiker = await openPagina();
    await gebruiker.click(screen.getByRole('button', { name: 'Marieke de Vries' }));
    const venster = await screen.findByRole('dialog');

    await gebruiker.click(within(venster).getByRole('button', { name: 'accessibility.closeModal' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('opent hetzelfde venster ook via de oogknop in de rij', async () => {
    const gebruiker = await openPagina();

    await gebruiker.click(screen.getByRole('button', { name: 'common.details' }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});

describe('externe muzikanten - op non-actief zetten', () => {
  beforeEach(() => {
    houder.lijst = [MUZIKANT];
    houder.detail = null;
  });

  it('vraagt eerst om bevestiging en zet daarna op non-actief', async () => {
    const gebruiker = await openPagina();

    await gebruiker.click(screen.getByRole('button', { name: 'externalMusicians.deactivate' }));
    expect(screen.getByText('externalMusicians.deactivateConfirm')).toBeInTheDocument();

    // De bevestigknop draagt dezelfde tekst als de knop in de rij; die in het
    // venster is de laatste van de twee.
    const knoppen = screen.getAllByRole('button', { name: 'externalMusicians.deactivate' });
    await gebruiker.click(knoppen[knoppen.length - 1]);

    await waitFor(() => expect(muteerders.verwijderen).toHaveBeenCalledWith('muz-1'));
  });

  it('zet niets op non-actief bij het afbreken', async () => {
    const gebruiker = await openPagina();

    await gebruiker.click(screen.getByRole('button', { name: 'externalMusicians.deactivate' }));
    await gebruiker.click(screen.getByRole('button', { name: 'common.cancel' }));

    expect(muteerders.verwijderen).not.toHaveBeenCalled();
    expect(screen.queryByText('externalMusicians.deactivateConfirm')).not.toBeInTheDocument();
  });
});

describe('externe muzikanten - wie mag wat', () => {
  it('laat een gewoon lid alleen kijken', async () => {
    heerser.rol = 'member';
    houder.lijst = [MUZIKANT];
    await openPagina();

    expect(screen.queryByRole('button', { name: /externalMusicians\.addMusician/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'common.edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'externalMusicians.deactivate' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'common.details' })).toBeInTheDocument();
  });
});
