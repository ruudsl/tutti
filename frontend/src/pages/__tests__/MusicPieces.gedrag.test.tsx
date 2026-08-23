/**
 * De partijenpagina: zoeken, sorteren, downloaden, verwijderen en de
 * bulkbewerkingen.
 *
 * Wat er stond ging over de koppeling van labels aan velden in het
 * bewerkvenster. Alles wat de gebruiker met de lijst zelf doet stond nergens
 * vast: het aankruisen van rijen, het menu met bulkbewerkingen dat pas
 * verschijnt zodra er iets aangekruist is, en de drie vensters daarachter -
 * instrument wijzigen, aan een lijst toevoegen, uit een lijst halen - die alle
 * drie dezelfde muteerder aanroepen met een ander veld.
 *
 * Het sorteren is hier ook vastgelegd. De pagina sorteert wat de server
 * teruggeeft nog eens na, en de keuzes 'datum' en 'laatst bekeken' vallen
 * daarbij stilzwijgend terug op de titel, omdat een partij geen datumveld
 * heeft. Dat is geen fout maar het is wel verrassend, dus het staat erin.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import MusicPieces from '../MusicPieces';
import type { MusicPiece } from '../../types';

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

vi.mock('../../components/PdfThumbnail', () => ({
  PdfThumbnail: () => <div data-testid="pdf-miniatuur" />,
}));

vi.mock('../../components/FavoriteButton', () => ({
  FavoriteButton: () => <button type="button">favoriet</button>,
}));

vi.mock('../../components/FloatingActionButton', () => ({
  FloatingActionButton: ({ label, onClick }: { label: string; onClick: () => void }) => (
    <button type="button" onClick={onClick}>
      zweefknop: {label}
    </button>
  ),
}));

vi.mock('../../utils/toast', () => ({ showError: vi.fn(), showSuccess: vi.fn() }));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', role: heerser.rol } }),
}));

const { heerser, houder, api, muteerders } = vi.hoisted(() => {
  const muteerders = {
    bijwerken: vi.fn(),
    verwijderen: vi.fn(),
    bulkVerwijderen: vi.fn(),
    bulkBijwerken: vi.fn(),
    verversen: vi.fn(),
  };
  return {
    heerser: { rol: 'admin' },
    houder: { partijen: [] as unknown[], laden: false, totaal: 0, paginas: 1 },
    api: { downloadMusicPiece: vi.fn(), logActivity: vi.fn() },
    muteerders,
  };
});

vi.mock('../../api', () => api);

/** Elke muteerder geeft de terugmeldingen door, zodat de vensters echt sluiten. */
function maakMuteerder(spion: ReturnType<typeof vi.fn>) {
  return () => ({
    mutate: (waarden: unknown, opties?: { onSuccess?: (r: unknown) => void }) => {
      spion(waarden);
      opties?.onSuccess?.({});
    },
    mutateAsync: async (waarden: unknown) => spion(waarden),
    isPending: false,
  });
}

vi.mock('../../hooks/useMusicPieces', () => ({
  useMusicPiecesPaginated: (filters: unknown) => {
    houder.laatsteFilters = filters;
    return {
      data: { data: houder.partijen, total: houder.totaal, page: 1, pageSize: 50, totalPages: houder.paginas },
      isLoading: houder.laden,
    };
  },
  useUpdateMusicPiece: maakMuteerder(muteerders.bijwerken),
  useDeleteMusicPiece: maakMuteerder(muteerders.verwijderen),
  useDeleteMusicPiecesBulk: maakMuteerder(muteerders.bulkVerwijderen),
  useBulkUpdatePieces: maakMuteerder(muteerders.bulkBijwerken),
  useRefreshInstrumentLinks: maakMuteerder(muteerders.verversen),
}));

vi.mock('../../hooks/useInstruments', () => ({
  useInstruments: () => ({
    data: [
      { id: 'inst-1', name: 'Trompet' },
      { id: 'inst-2', name: 'Hoorn' },
    ],
    isLoading: false,
  }),
}));

vi.mock('../../hooks/useMusicLists', () => ({
  useMyMusicLists: () => ({
    data: [
      { id: 'lijst-1', name: 'Voorjaarsconcert', orchestraName: 'Harmonie' },
      { id: 'lijst-2', name: 'Kerstconcert' },
    ],
  }),
}));

import { showError } from '../../utils/toast';

function maakPartij(overschrijving: Partial<MusicPiece> = {}): MusicPiece {
  return {
    id: 'partij-1',
    title: 'Also sprach Zarathustra',
    arranger: 'De Haske',
    instrumentId: 'inst-1',
    instrumentName: 'Trompet',
    tuning: 'Bb',
    groupNumber: '1',
    youtubeUrl: null,
    originalFilename: 'zarathustra.pdf',
    ...overschrijving,
  } as unknown as MusicPiece;
}

const PARTIJEN = [
  maakPartij(),
  maakPartij({
    id: 'partij-2',
    title: 'Bolero',
    arranger: 'Ravel',
    instrumentName: 'Hoorn',
    originalFilename: 'bolero.pdf',
    youtubeUrl: 'https://youtu.be/abc',
  }),
];

function wikkel({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

async function openPagina() {
  const gebruiker = userEvent.setup();
  render(<MusicPieces />, { wrapper: wikkel });
  return gebruiker;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  heerser.rol = 'admin';
  houder.partijen = PARTIJEN;
  houder.laden = false;
  houder.totaal = 2;
  houder.paginas = 1;
  api.downloadMusicPiece.mockResolvedValue(undefined);
  api.logActivity.mockResolvedValue(undefined);
  // jsdom kent geen matchMedia; het sorteermenu op deze pagina vraagt er wel om.
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

describe('partijenpagina - de lijst', () => {
  it('toont een skelet zolang de partijen nog niet binnen zijn', () => {
    houder.laden = true;
    render(<MusicPieces />, { wrapper: wikkel });

    expect(screen.getByTestId('skelet-tabel')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('toont per partij de gegevens en de bijbehorende knoppen', async () => {
    await openPagina();

    const rij = screen.getByRole('row', { name: /Also sprach Zarathustra/ });
    expect(within(rij).getByText('De Haske')).toBeInTheDocument();
    expect(within(rij).getByText('Trompet')).toBeInTheDocument();
    expect(within(rij).getByRole('button', { name: /common\.download/ })).toBeInTheDocument();
    // Zonder YouTube-verwijzing staat die knop er niet.
    expect(within(rij).queryByRole('link', { name: /YouTube/ })).not.toBeInTheDocument();

    const bolero = screen.getByRole('row', { name: /Bolero/ });
    expect(within(bolero).getByRole('link', { name: 'YouTube: Bolero' })).toHaveAttribute(
      'href',
      'https://youtu.be/abc',
    );
  });

  it('meldt een lege lijst anders bij een zoekopdracht dan zonder', async () => {
    houder.partijen = [];
    houder.totaal = 0;
    const gebruiker = await openPagina();

    expect(screen.getByText('musicPieces.noPiecesTitle')).toBeInTheDocument();

    await gebruiker.type(screen.getByLabelText('common.search'), 'zoiets');

    expect(await screen.findByText('musicPieces.noResultsTitle')).toBeInTheDocument();
  });

  it('geeft het zoekwoord pas na de vertraging door aan de bevraging', async () => {
    const gebruiker = await openPagina();

    await gebruiker.type(screen.getByLabelText('common.search'), 'bolero');

    // Meteen na het typen staat het zoekwoord er nog niet in.
    expect((houder.laatsteFilters as { search?: string }).search).toBeUndefined();
    await waitFor(() => expect((houder.laatsteFilters as { search?: string }).search).toBe('bolero'));
  });

  it('geeft het instrumentfilter door aan de bevraging', async () => {
    const gebruiker = await openPagina();

    await gebruiker.selectOptions(screen.getByLabelText('myMusic.table.instrument'), 'inst-2');

    await waitFor(() => expect((houder.laatsteFilters as { instrumentId?: string }).instrumentId).toBe('inst-2'));
  });

  it('toont de bladwijzer alleen als er meer dan één bladzijde is', async () => {
    await openPagina();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();

    houder.paginas = 3;
    houder.totaal = 120;
    render(<MusicPieces />, { wrapper: wikkel });

    expect(await screen.findByRole('navigation')).toBeInTheDocument();
  });
});

describe('partijenpagina - sorteren', () => {
  /** De titels zoals ze in de tabel staan, van boven naar beneden. */
  function titels(): string[] {
    return screen
      .getAllByRole('row')
      .slice(1)
      .map((rij) => (rij.querySelector('strong') as HTMLElement).textContent as string);
  }

  it('zet de partijen standaard op titel oplopend', async () => {
    await openPagina();

    expect(titels()).toEqual(['Also sprach Zarathustra', 'Bolero']);
  });

  it('draait de volgorde om bij aflopend op titel', async () => {
    const gebruiker = await openPagina();

    await gebruiker.click(screen.getByRole('button', { name: /common\.sort\.sortBy/ }));
    await gebruiker.click(screen.getByRole('option', { name: /common\.sort\.nameDesc/ }));

    expect(titels()).toEqual(['Bolero', 'Also sprach Zarathustra']);
  });

  it('sorteert op arrangeur bij de keuze componist', async () => {
    const gebruiker = await openPagina();

    await gebruiker.click(screen.getByRole('button', { name: /common\.sort\.sortBy/ }));
    await gebruiker.click(screen.getByRole('option', { name: /common\.sort\.composer/ }));

    // 'De Haske' vóór 'Ravel'.
    expect(titels()).toEqual(['Also sprach Zarathustra', 'Bolero']);
  });

  it('valt bij een datumkeuze terug op de titel, want een partij heeft geen datum', async () => {
    const gebruiker = await openPagina();

    await gebruiker.click(screen.getByRole('button', { name: /common\.sort\.sortBy/ }));
    await gebruiker.click(screen.getByRole('option', { name: /common\.sort\.dateNewest/ }));

    // 'dateNewest' staat op aflopend, dus de titelvolgorde draait om.
    expect(titels()).toEqual(['Bolero', 'Also sprach Zarathustra']);
  });
});

describe('partijenpagina - downloaden en verwijderen', () => {
  it('downloadt een partij en legt dat vast in het logboek', async () => {
    const gebruiker = await openPagina();

    await gebruiker.click(screen.getByRole('button', { name: 'common.download: Bolero' }));

    await waitFor(() => expect(api.downloadMusicPiece).toHaveBeenCalledWith('partij-2'));
    expect(api.logActivity).toHaveBeenCalledWith('download', 'music_piece', 'partij-2');
  });

  it('meldt een mislukte download zonder de pagina te breken', async () => {
    api.downloadMusicPiece.mockRejectedValue(new Error('bestand weg'));
    const gebruiker = await openPagina();

    await gebruiker.click(screen.getByRole('button', { name: 'common.download: Bolero' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('errors.generic'));
    // De knop is daarna weer bruikbaar.
    expect(screen.getByRole('button', { name: 'common.download: Bolero' })).toBeEnabled();
  });

  it('vraagt eerst om bevestiging voor het verwijderen van een partij', async () => {
    const gebruiker = await openPagina();

    await gebruiker.click(screen.getByRole('button', { name: 'common.delete: Bolero' }));
    expect(screen.getByText('musicPieces.delete.confirm')).toBeInTheDocument();

    await gebruiker.click(screen.getByRole('button', { name: 'common.delete' }));

    expect(muteerders.verwijderen).toHaveBeenCalledWith('partij-2');
    expect(screen.queryByText('musicPieces.delete.confirm')).not.toBeInTheDocument();
  });

  it('verwijdert niets als de bevestiging afgebroken wordt', async () => {
    const gebruiker = await openPagina();

    await gebruiker.click(screen.getByRole('button', { name: 'common.delete: Bolero' }));
    await gebruiker.click(screen.getByRole('button', { name: 'common.cancel' }));

    expect(muteerders.verwijderen).not.toHaveBeenCalled();
  });
});

describe('partijenpagina - een partij bewerken', () => {
  it('stuurt de gewijzigde velden op en sluit het venster', async () => {
    const gebruiker = await openPagina();

    await gebruiker.click(screen.getByRole('button', { name: 'common.edit: Also sprach Zarathustra' }));
    await gebruiker.clear(screen.getByLabelText('musicPieces.edit.pieceTitle'));
    await gebruiker.type(screen.getByLabelText('musicPieces.edit.pieceTitle'), 'Zarathustra');
    await gebruiker.selectOptions(screen.getByLabelText('musicPieces.edit.instrument'), 'inst-2');
    await gebruiker.type(screen.getByLabelText('musicPieces.edit.youtubeUrl'), 'https://youtu.be/xyz');
    await gebruiker.click(screen.getByRole('button', { name: 'common.save' }));

    expect(muteerders.bijwerken).toHaveBeenCalledWith({
      id: 'partij-1',
      data: expect.objectContaining({
        title: 'Zarathustra',
        instrumentId: 'inst-2',
        youtubeUrl: 'https://youtu.be/xyz',
      }),
    });
    expect(screen.queryByLabelText('musicPieces.edit.pieceTitle')).not.toBeInTheDocument();
  });

  it('laat lege velden weg in plaats van ze als lege tekst te versturen', async () => {
    const gebruiker = await openPagina();

    await gebruiker.click(screen.getByRole('button', { name: 'common.edit: Also sprach Zarathustra' }));
    await gebruiker.clear(screen.getByLabelText('musicPieces.edit.arranger'));
    await gebruiker.clear(screen.getByLabelText('musicPieces.edit.tuning'));
    await gebruiker.click(screen.getByRole('button', { name: 'common.save' }));

    const gegevens = (muteerders.bijwerken.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(gegevens.arranger).toBeUndefined();
    expect(gegevens.tuning).toBeUndefined();
  });
});

describe('partijenpagina - bulkbewerkingen', () => {
  async function kruisAanEnOpenMenu() {
    const gebruiker = await openPagina();
    await gebruiker.click(screen.getByRole('checkbox', { name: 'common.select Also sprach Zarathustra' }));
    await gebruiker.click(screen.getByRole('button', { name: /bulk\.title/ }));
    return gebruiker;
  }

  it('toont het bulkmenu pas zodra er iets aangekruist is', async () => {
    const gebruiker = await openPagina();

    expect(screen.queryByRole('button', { name: /bulk\.title/ })).not.toBeInTheDocument();

    await gebruiker.click(screen.getByRole('checkbox', { name: 'common.select Bolero' }));

    expect(screen.getByRole('button', { name: /bulk\.title/ })).toBeInTheDocument();
    expect(screen.getByText('musicPieces.bulk.selectedCount')).toBeInTheDocument();
  });

  it('kruist alles aan en weer uit met het vakje in de kop', async () => {
    const gebruiker = await openPagina();
    const alles = screen.getByRole('checkbox', { name: 'musicPieces.bulk.selectAll' });

    await gebruiker.click(alles);
    expect(screen.getByRole('checkbox', { name: 'common.select Bolero' })).toBeChecked();
    expect(alles).toBeChecked();

    await gebruiker.click(alles);
    expect(screen.getByRole('checkbox', { name: 'common.select Bolero' })).not.toBeChecked();
  });

  it('haalt een rij weer uit de keuze bij een tweede klik', async () => {
    const gebruiker = await openPagina();
    const vakje = screen.getByRole('checkbox', { name: 'common.select Bolero' });

    await gebruiker.click(vakje);
    await gebruiker.click(vakje);

    expect(vakje).not.toBeChecked();
    expect(screen.queryByRole('button', { name: /bulk\.title/ })).not.toBeInTheDocument();
  });

  it('wijzigt het instrument van de aangekruiste partijen', async () => {
    const gebruiker = await kruisAanEnOpenMenu();

    await gebruiker.click(screen.getByRole('button', { name: 'bulk.changeInstrument' }));
    await gebruiker.selectOptions(screen.getByLabelText('musicPieces.edit.instrument'), 'inst-2');
    await gebruiker.click(screen.getByRole('button', { name: 'common.save' }));

    expect(muteerders.bulkBijwerken).toHaveBeenCalledWith({
      pieceIds: ['partij-1'],
      updates: { instrumentId: 'inst-2' },
    });
    // Na afloop is de keuze weer leeg en is het venster weg.
    expect(screen.queryByRole('button', { name: /bulk\.title/ })).not.toBeInTheDocument();
  });

  it('stuurt een leeg instrument als "geen instrument"', async () => {
    const gebruiker = await kruisAanEnOpenMenu();

    await gebruiker.click(screen.getByRole('button', { name: 'bulk.changeInstrument' }));
    await gebruiker.click(screen.getByRole('button', { name: 'common.save' }));

    expect(muteerders.bulkBijwerken).toHaveBeenCalledWith({
      pieceIds: ['partij-1'],
      updates: { instrumentId: null },
    });
  });

  it('breekt het instrumentvenster af zonder iets te wijzigen', async () => {
    const gebruiker = await kruisAanEnOpenMenu();

    await gebruiker.click(screen.getByRole('button', { name: 'bulk.changeInstrument' }));
    await gebruiker.click(screen.getByRole('button', { name: 'common.cancel' }));

    expect(muteerders.bulkBijwerken).not.toHaveBeenCalled();
    // De keuze blijft staan, dus het bulkmenu is er nog.
    expect(screen.getByRole('button', { name: /bulk\.title/ })).toBeInTheDocument();
  });

  it('voegt de aangekruiste partijen aan een muzieklijst toe', async () => {
    const gebruiker = await kruisAanEnOpenMenu();

    await gebruiker.click(screen.getByRole('button', { name: 'bulk.addToList' }));
    // Zonder gekozen lijst valt er niets toe te voegen.
    expect(screen.getByRole('button', { name: 'common.add' })).toBeDisabled();

    await gebruiker.selectOptions(screen.getByLabelText('bulk.selectList'), 'lijst-1');
    await gebruiker.click(screen.getByRole('button', { name: 'common.add' }));

    expect(muteerders.bulkBijwerken).toHaveBeenCalledWith({
      pieceIds: ['partij-1'],
      updates: { addToListId: 'lijst-1' },
    });
  });

  it('haalt de aangekruiste partijen uit een muzieklijst', async () => {
    const gebruiker = await kruisAanEnOpenMenu();

    await gebruiker.click(screen.getByRole('button', { name: 'bulk.removeFromList' }));
    await gebruiker.selectOptions(screen.getByLabelText('bulk.selectList'), 'lijst-2');
    await gebruiker.click(screen.getByRole('button', { name: 'common.delete' }));

    expect(muteerders.bulkBijwerken).toHaveBeenCalledWith({
      pieceIds: ['partij-1'],
      updates: { removeFromListId: 'lijst-2' },
    });
  });

  it('verwijdert de aangekruiste partijen na bevestiging', async () => {
    const gebruiker = await kruisAanEnOpenMenu();

    await gebruiker.click(screen.getByRole('button', { name: 'bulk.delete' }));
    expect(screen.getByText('musicPieces.bulk.deleteConfirm')).toBeInTheDocument();

    await gebruiker.click(screen.getByRole('button', { name: 'common.delete' }));

    expect(muteerders.bulkVerwijderen).toHaveBeenCalledWith(['partij-1']);
    expect(screen.queryByRole('button', { name: /bulk\.title/ })).not.toBeInTheDocument();
  });
});

describe('partijenpagina - wie mag wat', () => {
  it('laat een gewoon lid niets aankruisen en niets bulkbewerken', async () => {
    heerser.rol = 'member';
    await openPagina();

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /bulk\.title/ })).not.toBeInTheDocument();
    // Downloaden mag wel.
    expect(screen.getByRole('button', { name: 'common.download: Bolero' })).toBeInTheDocument();
  });
});

describe('partijenpagina - instrumentkoppelingen verversen', () => {
  it('ververst vanaf de knop bovenaan en vanaf de zweefknop', async () => {
    const gebruiker = await openPagina();

    await gebruiker.click(screen.getByRole('button', { name: /^musicPieces\.refreshLinks$/ }));
    await gebruiker.click(screen.getByRole('button', { name: /zweefknop/ }));

    expect(muteerders.verversen).toHaveBeenCalledTimes(2);
  });
});
