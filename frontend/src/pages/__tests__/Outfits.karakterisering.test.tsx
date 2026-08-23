/**
 * Eerste vangnet onder de tenuepagina.
 *
 * `Outfits.tsx` was nooit getest: 110 statements, nul gedekt. De pagina bepaalt
 * wat het orkest aantrekt bij een concert - een tenue verkeerd opslaan of stil
 * kwijtraken merkt niemand tot de zaal in het zwart-wit staat en de dirigent in
 * het rood.
 *
 * De tests gaan over wat een gebruiker doet: een tenue aanmaken met losse
 * onderdelen, er een wijzigen, er een verwijderen (met bevestiging), en de
 * volgorde aanpassen. Ze leggen daarnaast vast dat het beheer alleen voor
 * beheerders en de muziekcommissie zichtbaar is, want dat is wat de backend
 * afdwingt.
 *
 * BEWIJS - een mislukte aanroep zag eruit als een lege kast. `useQuery` kreeg
 * `data = []` als standaardwaarde en de pagina keek alleen naar
 * `outfits.length === 0`. Ging het ophalen mis, dan stond er "nog geen tenues"
 * met de uitnodiging om het eerste tenue aan te maken. Dat is een andere
 * mededeling dan "het is niet gelukt": in het eerste geval maakt iemand het
 * tenue opnieuw aan dat er al is. De test 'toont een foutmelding en niet de
 * lege staat' is rood op de oude code - die toonde `outfits.empty`.
 *
 * BEWIJS - de formulierlabels hoorden bij niets. In het aanmaak- en het
 * wijzigvenster stonden naam, omschrijving, kleur en het onderdeelveld met een
 * los `<label>` naast hun veld, zonder `htmlFor` en zonder `id`. Een
 * schermlezer kondigde dan "bewerkbaar veld" aan zonder te zeggen wat erin
 * moest, en klikken op het label zette de aanwijzer nergens. De tests zoeken de
 * velden daarom via hun toegankelijke naam; op de oude code vinden ze niets.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import Outfits from '../Outfits';
import * as api from '../../api/outfits';
import * as toast from '../../utils/toast';
import { ConfirmProvider } from '../../hooks/useConfirm';
import type { Outfit, OutfitDetail } from '../../api/outfits';

vi.mock('../../api/outfits');
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

vi.mock('../../utils/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));

/**
 * De echte lijst sleept met dnd-kit; dat is met een muis in jsdom niet na te
 * spelen. We houden de vorm (het tekent elk onderdeel) en geven een knop die
 * doet wat het slepen doet: de nieuwe volgorde doorgeven.
 */
vi.mock('../../components/SortableList', () => ({
  SortableList: ({
    items,
    onReorder,
    renderItem,
    disabled,
  }: {
    items: { id: string }[];
    onReorder: (items: { id: string }[]) => void;
    renderItem: (item: { id: string }, index: number) => ReactNode;
    disabled?: boolean;
  }) => (
    <div data-testid="sorteerlijst">
      {items.map((item, index) => (
        <div key={item.id}>{renderItem(item, index)}</div>
      ))}
      <button type="button" disabled={disabled} onClick={() => onReorder([...items].reverse())}>
        omgekeerd-slepen
      </button>
    </div>
  ),
}));

let huidigeRol = 'admin';
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'lid-1', role: huidigeRol } }),
}));

function tenue(overschrijving: Partial<Outfit> = {}): Outfit {
  return {
    id: 'tenue-1',
    name: 'Concertzwart',
    description: 'Lange broek, zwart overhemd',
    colorCode: '#111111',
    items: ['Colbert', 'Pantalon', 'Das'],
    isDefault: true,
    sortOrder: 1,
    usageCount: 4,
    createdAt: '2026-01-01',
    ...overschrijving,
  };
}

function tenuedetail(overschrijving: Partial<OutfitDetail> = {}): OutfitDetail {
  const { usageCount: _telling, ...rest } = tenue();
  return {
    ...rest,
    recentConcerts: [{ id: 'concert-1', name: 'Nieuwjaarsconcert', date: '2026-01-05' }],
    ...overschrijving,
  };
}

function wikkel({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  // De pagina vraagt om bevestiging via useConfirm; die hook heeft de provider
  // nodig, anders gooit hij bij het tekenen al.
  return (
    <QueryClientProvider client={client}>
      <ConfirmProvider>{children}</ConfirmProvider>
    </QueryClientProvider>
  );
}

function venster() {
  const vensters = screen.getAllByRole('dialog');
  return within(vensters[vensters.length - 1]);
}

beforeEach(() => {
  vi.clearAllMocks();
  huidigeRol = 'admin';
  vi.mocked(api.getOutfits).mockResolvedValue([tenue()]);
  vi.mocked(api.getOutfit).mockResolvedValue(tenuedetail());
  vi.mocked(api.createOutfit).mockResolvedValue({ id: 'tenue-nieuw', message: 'ok' });
  vi.mocked(api.updateOutfit).mockResolvedValue({ message: 'ok' });
  vi.mocked(api.deleteOutfit).mockResolvedValue({ message: 'ok' });
  vi.mocked(api.reorderOutfits).mockResolvedValue({ message: 'ok' });
});

describe('tenues - de lijst', () => {
  it('toont wat de server stuurt, met de standaardmarkering', async () => {
    render(<Outfits />, { wrapper: wikkel });

    expect(await screen.findByText('Concertzwart')).toBeInTheDocument();
    expect(screen.getByText('outfits.default')).toBeInTheDocument();
    expect(screen.getByText('Colbert')).toBeInTheDocument();
  });

  it('vouwt een lange onderdelenlijst op tot drie plus een telling', async () => {
    vi.mocked(api.getOutfits).mockResolvedValue([tenue({ items: ['Colbert', 'Pantalon', 'Das', 'Schoenen', 'Riem'] })]);
    render(<Outfits />, { wrapper: wikkel });

    expect(await screen.findByText('+2')).toBeInTheDocument();
    expect(screen.queryByText('Schoenen')).not.toBeInTheDocument();
  });

  it('laat het skelet zien zolang er nog niets binnen is', () => {
    vi.mocked(api.getOutfits).mockReturnValue(new Promise(() => {}) as never);
    render(<Outfits />, { wrapper: wikkel });

    expect(screen.getByTestId('skelet-tabel')).toBeInTheDocument();
  });

  it('toont de lege staat als er echt geen tenues zijn', async () => {
    vi.mocked(api.getOutfits).mockResolvedValue([]);
    render(<Outfits />, { wrapper: wikkel });

    expect(await screen.findByText('outfits.empty')).toBeInTheDocument();
  });

  it('toont een foutmelding en niet de lege staat als het ophalen mislukt', async () => {
    // BEWIJS: op de oude code stond hier 'outfits.empty' met de knop om het
    // eerste tenue aan te maken, terwijl er niets opgehaald was.
    vi.mocked(api.getOutfits).mockRejectedValue(new Error('netwerk weg'));
    render(<Outfits />, { wrapper: wikkel });

    expect(await screen.findByText('errors.generic')).toBeInTheDocument();
    expect(screen.queryByText('outfits.empty')).not.toBeInTheDocument();
  });

  it('probeert het opnieuw op verzoek na een mislukte aanroep', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(api.getOutfits).mockRejectedValueOnce(new Error('netwerk weg')).mockResolvedValue([tenue()]);
    render(<Outfits />, { wrapper: wikkel });

    await gebruiker.click(await screen.findByRole('button', { name: 'common.retry' }));
    expect(await screen.findByText('Concertzwart')).toBeInTheDocument();
  });
});

describe('tenues - wie mag beheren', () => {
  it('toont een gewoon lid geen knop om een tenue toe te voegen', async () => {
    huidigeRol = 'member';
    render(<Outfits />, { wrapper: wikkel });

    expect(await screen.findByText('Concertzwart')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /outfits\.add/ })).not.toBeInTheDocument();
  });

  it('toont de muziekcommissie die knop wel', async () => {
    huidigeRol = 'music_committee';
    render(<Outfits />, { wrapper: wikkel });

    expect(await screen.findByRole('button', { name: /outfits\.add/ })).toBeInTheDocument();
  });

  it('geeft een gewoon lid in het detailvenster geen wijzig- of verwijderknop', async () => {
    huidigeRol = 'member';
    const gebruiker = userEvent.setup();
    render(<Outfits />, { wrapper: wikkel });

    await gebruiker.click(await screen.findByText('Concertzwart'));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    expect(venster().queryByRole('button', { name: /common\.edit/ })).not.toBeInTheDocument();
    expect(venster().queryByRole('button', { name: /common\.delete/ })).not.toBeInTheDocument();
  });

  it('toont de knop om te herschikken pas vanaf twee tenues', async () => {
    vi.mocked(api.getOutfits).mockResolvedValue([tenue()]);
    const { unmount } = render(<Outfits />, { wrapper: wikkel });
    expect(await screen.findByText('Concertzwart')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /outfits\.reorder/ })).not.toBeInTheDocument();
    unmount();

    vi.mocked(api.getOutfits).mockResolvedValue([tenue(), tenue({ id: 'tenue-2', name: 'Zomertenue' })]);
    render(<Outfits />, { wrapper: wikkel });
    expect(await screen.findByRole('button', { name: /outfits\.reorder/ })).toBeInTheDocument();
  });
});

describe('tenues - aanmaken', () => {
  async function openAanmaken(gebruiker: ReturnType<typeof userEvent.setup>) {
    await gebruiker.click(await screen.findByRole('button', { name: /outfits\.add/ }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
  }

  it('verstuurt niet met een lege naam', async () => {
    const gebruiker = userEvent.setup();
    render(<Outfits />, { wrapper: wikkel });
    await openAanmaken(gebruiker);

    await gebruiker.click(venster().getByRole('button', { name: 'common.save' }));

    // Het naamveld is verplicht; de browser houdt het formulier tegen en de
    // aanroep hoort dus niet te gebeuren.
    expect(api.createOutfit).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('stuurt de naam, de onderdelen en de standaardkeuze mee', async () => {
    const gebruiker = userEvent.setup();
    render(<Outfits />, { wrapper: wikkel });
    await openAanmaken(gebruiker);

    await gebruiker.type(venster().getByRole('textbox', { name: /outfits\.name/ }), 'Zomertenue');
    await gebruiker.type(venster().getByRole('textbox', { name: /outfits\.description/ }), 'wit overhemd');

    // Onderdelen komen er een voor een bij: typen en op de plusknop drukken.
    await gebruiker.type(venster().getByPlaceholderText('outfits.itemPlaceholder'), 'Poloshirt');
    await gebruiker.click(venster().getByRole('button', { name: 'outfits.addItem' }));
    await gebruiker.type(venster().getByPlaceholderText('outfits.itemPlaceholder'), 'Korte broek');
    await gebruiker.click(venster().getByRole('button', { name: 'outfits.addItem' }));
    await gebruiker.click(venster().getByRole('checkbox'));

    await gebruiker.click(venster().getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(api.createOutfit).toHaveBeenCalled());
    expect(vi.mocked(api.createOutfit).mock.calls[0][0]).toEqual({
      name: 'Zomertenue',
      description: 'wit overhemd',
      colorCode: '',
      items: ['Poloshirt', 'Korte broek'],
      isDefault: true,
    });
    expect(toast.showSuccess).toHaveBeenCalledWith('outfits.created');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('voegt een leeg onderdeel niet toe', async () => {
    const gebruiker = userEvent.setup();
    render(<Outfits />, { wrapper: wikkel });
    await openAanmaken(gebruiker);

    await gebruiker.type(venster().getByPlaceholderText('outfits.itemPlaceholder'), '   ');
    await gebruiker.click(venster().getByRole('button', { name: 'outfits.addItem' }));

    expect(venster().queryByRole('button', { name: /outfits\.removeItem/ })).not.toBeInTheDocument();
  });

  it('haalt een toegevoegd onderdeel er weer af', async () => {
    const gebruiker = userEvent.setup();
    render(<Outfits />, { wrapper: wikkel });
    await openAanmaken(gebruiker);

    await gebruiker.type(venster().getByPlaceholderText('outfits.itemPlaceholder'), 'Pet');
    await gebruiker.click(venster().getByRole('button', { name: 'outfits.addItem' }));
    expect(venster().getByText('Pet')).toBeInTheDocument();

    await gebruiker.click(venster().getByRole('button', { name: /outfits\.removeItem/ }));
    expect(venster().queryByText('Pet')).not.toBeInTheDocument();
  });

  it('houdt het venster open met de melding van de server als het misgaat', async () => {
    vi.mocked(api.createOutfit).mockRejectedValue({ response: { data: { error: 'Naam bestaat al' } } });
    const gebruiker = userEvent.setup();
    render(<Outfits />, { wrapper: wikkel });
    await openAanmaken(gebruiker);

    await gebruiker.type(venster().getByRole('textbox', { name: /outfits\.name/ }), 'Concertzwart');
    await gebruiker.click(venster().getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(toast.showError).toHaveBeenCalledWith('Naam bestaat al'));
    expect(venster().getByRole('textbox', { name: /outfits\.name/ })).toHaveValue('Concertzwart');
  });

  it('valt terug op de eigen tekst als de server geen reden meestuurt', async () => {
    vi.mocked(api.createOutfit).mockRejectedValue(new Error('stuk'));
    const gebruiker = userEvent.setup();
    render(<Outfits />, { wrapper: wikkel });
    await openAanmaken(gebruiker);

    await gebruiker.type(venster().getByRole('textbox', { name: /outfits\.name/ }), 'Zomertenue');
    await gebruiker.click(venster().getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(toast.showError).toHaveBeenCalledWith('outfits.errorCreate'));
  });

  it('gooit het ingevulde weg bij annuleren', async () => {
    const gebruiker = userEvent.setup();
    render(<Outfits />, { wrapper: wikkel });
    await openAanmaken(gebruiker);

    await gebruiker.type(venster().getByRole('textbox', { name: /outfits\.name/ }), 'Weg hiermee');
    await gebruiker.click(venster().getByRole('button', { name: 'common.cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await openAanmaken(gebruiker);
    expect(venster().getByRole('textbox', { name: /outfits\.name/ })).toHaveValue('');
    expect(api.createOutfit).not.toHaveBeenCalled();
  });
});

describe('tenues - detail, wijzigen en verwijderen', () => {
  async function openDetail(gebruiker: ReturnType<typeof userEvent.setup>) {
    await gebruiker.click(await screen.findByText('Concertzwart'));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
  }

  it('haalt het gekozen tenue op en toont de onderdelen en de concerten', async () => {
    const gebruiker = userEvent.setup();
    render(<Outfits />, { wrapper: wikkel });
    await openDetail(gebruiker);

    expect(api.getOutfit).toHaveBeenCalledWith('tenue-1');
    expect(venster().getByText('Das')).toBeInTheDocument();
    expect(venster().getByText(/Nieuwjaarsconcert/)).toBeInTheDocument();
  });

  it('opent het wijzigvenster met de bestaande gegevens erin', async () => {
    const gebruiker = userEvent.setup();
    render(<Outfits />, { wrapper: wikkel });
    await openDetail(gebruiker);

    await gebruiker.click(venster().getByRole('button', { name: /common\.edit/ }));
    expect(venster().getByRole('textbox', { name: /outfits\.name/ })).toHaveValue('Concertzwart');
    expect(venster().getByRole('checkbox')).toBeChecked();
  });

  it('slaat een gewijzigde naam op onder het juiste tenue', async () => {
    const gebruiker = userEvent.setup();
    render(<Outfits />, { wrapper: wikkel });
    await openDetail(gebruiker);

    await gebruiker.click(venster().getByRole('button', { name: /common\.edit/ }));
    const naam = venster().getByRole('textbox', { name: /outfits\.name/ });
    await gebruiker.clear(naam);
    await gebruiker.type(naam, 'Concertzwart 2.0');
    await gebruiker.click(venster().getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(api.updateOutfit).toHaveBeenCalled());
    const [id, gegevens] = vi.mocked(api.updateOutfit).mock.calls[0];
    expect(id).toBe('tenue-1');
    expect(gegevens.name).toBe('Concertzwart 2.0');
    expect(toast.showSuccess).toHaveBeenCalledWith('outfits.updated');
  });

  it('meldt een mislukte wijziging zonder het venster te sluiten', async () => {
    vi.mocked(api.updateOutfit).mockRejectedValue(new Error('mis'));
    const gebruiker = userEvent.setup();
    render(<Outfits />, { wrapper: wikkel });
    await openDetail(gebruiker);

    await gebruiker.click(venster().getByRole('button', { name: /common\.edit/ }));
    await gebruiker.click(venster().getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(toast.showError).toHaveBeenCalledWith('outfits.errorUpdate'));
    expect(venster().getByRole('textbox', { name: /outfits\.name/ })).toBeInTheDocument();
  });

  it('verwijdert niets zolang er niet bevestigd is', async () => {
    const gebruiker = userEvent.setup();
    render(<Outfits />, { wrapper: wikkel });
    await openDetail(gebruiker);

    await gebruiker.click(venster().getByRole('button', { name: /common\.delete/ }));
    const vraag = await screen.findByRole('alertdialog');
    expect(within(vraag).getByText('outfits.confirmDelete')).toBeInTheDocument();

    await gebruiker.click(within(vraag).getByRole('button', { name: 'common.cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(api.deleteOutfit).not.toHaveBeenCalled();
  });

  it('verwijdert na bevestigen en sluit het detailvenster', async () => {
    const gebruiker = userEvent.setup();
    render(<Outfits />, { wrapper: wikkel });
    await openDetail(gebruiker);

    await gebruiker.click(venster().getByRole('button', { name: /common\.delete/ }));
    const vraag = await screen.findByRole('alertdialog');
    await gebruiker.click(within(vraag).getByRole('button', { name: 'common.confirm' }));

    await waitFor(() => expect(api.deleteOutfit).toHaveBeenCalled());
    expect(vi.mocked(api.deleteOutfit).mock.calls[0][0]).toBe('tenue-1');
    expect(toast.showSuccess).toHaveBeenCalledWith('outfits.deleted');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('meldt het als verwijderen niet mag', async () => {
    vi.mocked(api.deleteOutfit).mockRejectedValue({ response: { data: { error: 'Tenue is in gebruik' } } });
    const gebruiker = userEvent.setup();
    render(<Outfits />, { wrapper: wikkel });
    await openDetail(gebruiker);

    await gebruiker.click(venster().getByRole('button', { name: /common\.delete/ }));
    await gebruiker.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'common.confirm' }),
    );

    await waitFor(() => expect(toast.showError).toHaveBeenCalledWith('Tenue is in gebruik'));
  });
});

describe('tenues - volgorde', () => {
  beforeEach(() => {
    vi.mocked(api.getOutfits).mockResolvedValue([tenue(), tenue({ id: 'tenue-2', name: 'Zomertenue' })]);
  });

  it('stuurt de nieuwe volgorde als een rij van ids', async () => {
    const gebruiker = userEvent.setup();
    render(<Outfits />, { wrapper: wikkel });

    await gebruiker.click(await screen.findByRole('button', { name: /outfits\.reorder/ }));
    expect(screen.getByTestId('sorteerlijst')).toBeInTheDocument();
    // In de herschikstand hoort de aanmaakknop weg te zijn: die twee standen
    // door elkaar geeft alleen maar misverstanden.
    expect(screen.queryByRole('button', { name: /outfits\.add/ })).not.toBeInTheDocument();

    await gebruiker.click(screen.getByRole('button', { name: 'omgekeerd-slepen' }));

    await waitFor(() => expect(api.reorderOutfits).toHaveBeenCalled());
    expect(vi.mocked(api.reorderOutfits).mock.calls[0][0]).toEqual(['tenue-2', 'tenue-1']);
    expect(toast.showSuccess).toHaveBeenCalledWith('outfits.reordered');
  });

  it('verlaat de herschikstand met annuleren', async () => {
    const gebruiker = userEvent.setup();
    render(<Outfits />, { wrapper: wikkel });

    await gebruiker.click(await screen.findByRole('button', { name: /outfits\.reorder/ }));
    await gebruiker.click(screen.getByRole('button', { name: /common\.cancel/ }));

    expect(screen.queryByTestId('sorteerlijst')).not.toBeInTheDocument();
    expect(api.reorderOutfits).not.toHaveBeenCalled();
  });

  it('meldt het als de nieuwe volgorde niet opgeslagen kan worden', async () => {
    vi.mocked(api.reorderOutfits).mockRejectedValue(new Error('mis'));
    const gebruiker = userEvent.setup();
    render(<Outfits />, { wrapper: wikkel });

    await gebruiker.click(await screen.findByRole('button', { name: /outfits\.reorder/ }));
    await gebruiker.click(screen.getByRole('button', { name: 'omgekeerd-slepen' }));

    await waitFor(() => expect(toast.showError).toHaveBeenCalledWith('outfits.errorReorder'));
  });
});
