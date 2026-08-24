/**
 * Orkesten en hun muzieklijsten beheren.
 *
 * De pagina heeft twee helften: links de orkesten van deze vereniging, rechts
 * de details van het gekozen orkest - de leden en de muzieklijsten. Wat er
 * rechts komt te staan wordt per orkest apart opgehaald; de lijst links bepaalt
 * alleen wát er opgehaald wordt.
 *
 * Dat is hier het punt van de rechten: er staat nooit meer op het scherm dan
 * wat de server voor het gekozen orkest teruggaf. De laatste test in het
 * middenblok kijkt daar expliciet naar - wisselen van orkest laat de leden van
 * het vorige orkest niet achter.
 *
 * De vier vensters (orkest toevoegen, orkest bewerken, lijst toevoegen, lijst
 * bewerken) delen hetzelfde naamveld en dezelfde labeltekst. Ze staan nooit
 * tegelijk op het scherm, maar dat betekent ook dat een verkeerde koppeling
 * niet opvalt: elk venster wordt daarom apart nagelopen op wat er in het veld
 * staat als het opengaat, en wat er verstuurd wordt.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import Orchestras from '../Orchestras';

const { stand, details, maakLijst, wijzigLijst, wisLijst, maakOrkest, wijzigOrkest, wisOrkest } = vi.hoisted(() => ({
  stand: {
    orkesten: [
      { id: 'ork-1', name: 'Harmonie', memberCount: 2, listCount: 1 },
      { id: 'ork-2', name: 'Slagwerkgroep', memberCount: 0, listCount: 0 },
    ],
    perOrkest: {
      'ork-1': {
        id: 'ork-1',
        name: 'Harmonie',
        members: [
          { id: 'u1', firstName: 'Marieke', lastName: 'de Vries' },
          { id: 'u2', firstName: 'Joris', lastName: 'Bakker' },
        ],
        lists: [{ id: 'lijst-1', name: 'Voorjaarsconcert', pieceCount: 7 }],
      },
      'ork-2': { id: 'ork-2', name: 'Slagwerkgroep', members: [], lists: [] },
    } as Record<string, unknown>,
  },
  details: vi.fn(),
  maakLijst: vi.fn(),
  wijzigLijst: vi.fn(),
  wisLijst: vi.fn(),
  maakOrkest: vi.fn(),
  wijzigOrkest: vi.fn(),
  wisOrkest: vi.fn(),
}));

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (sleutel: string, opties?: Record<string, unknown>) =>
      opties && 'name' in opties ? `${sleutel}:${opties.name}` : sleutel,
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../api', () => ({
  getOrchestra: (id: string) => details(id),
  createMusicList: (naam: string, orkestId: string) => maakLijst(naam, orkestId),
  updateMusicList: (id: string, gegevens: unknown) => wijzigLijst(id, gegevens),
  deleteMusicList: (id: string) => wisLijst(id),
}));

vi.mock('../../hooks/useOrchestras', () => ({
  useOrchestras: () => ({ data: stand.orkesten, isLoading: false }),
  useCreateOrchestra: () => ({ mutateAsync: maakOrkest, isPending: false }),
  useUpdateOrchestra: () => ({ mutateAsync: wijzigOrkest, isPending: false }),
  useDeleteOrchestra: () => ({ mutateAsync: wisOrkest, isPending: false }),
}));

vi.mock('../../components/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icoon-${name}`} />,
}));

vi.mock('../../components/Skeleton', () => ({
  Skeleton: () => <div data-testid="skelet" />,
  SkeletonListItem: () => <div data-testid="skelet-regel" />,
}));

const { meldingen } = vi.hoisted(() => ({ meldingen: { goed: vi.fn(), fout: vi.fn() } }));
vi.mock('../../utils/toast', () => ({
  showSuccess: (m: string) => meldingen.goed(m),
  showError: (m: string) => meldingen.fout(m),
}));

function wikkel({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Teken de pagina en kies meteen een orkest, zoals een beheerder dat doet. */
async function kiesOrkest(naam = 'Harmonie') {
  const gebruiker = userEvent.setup();
  render(<Orchestras />, { wrapper: wikkel });
  await gebruiker.click(await screen.findByText(naam));
  await screen.findByRole('heading', { name: naam });
  return gebruiker;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  details.mockImplementation(async (id: string) => (stand.perOrkest as Record<string, unknown>)[id]);
  maakLijst.mockResolvedValue({});
  wijzigLijst.mockResolvedValue({});
  wisLijst.mockResolvedValue({});
  maakOrkest.mockResolvedValue({});
  wijzigOrkest.mockResolvedValue({});
  wisOrkest.mockResolvedValue({});
});

describe('orkesten - de lijst links', () => {
  it('telt de orkesten in de kop en noemt per orkest het aantal leden en lijsten', async () => {
    render(<Orchestras />, { wrapper: wikkel });

    const kop = await screen.findByRole('heading', { level: 1 });
    expect(within(kop).getByText('2')).toBeInTheDocument();

    const regel = screen.getByText('Harmonie').closest<HTMLElement>('.flex')!;
    expect(regel).toHaveTextContent('2 orchestras.membersCount');
    expect(regel).toHaveTextContent('1 orchestras.listsCount');
  });

  it('nodigt uit om een orkest te kiezen zolang er niets gekozen is', async () => {
    render(<Orchestras />, { wrapper: wikkel });

    expect(await screen.findByText('orchestras.selectToView')).toBeInTheDocument();
    expect(details).not.toHaveBeenCalled();
  });

  it('meldt het als er nog geen enkel orkest is', async () => {
    stand.orkesten = [];

    render(<Orchestras />, { wrapper: wikkel });

    expect(await screen.findByText('orchestras.noOrchestras')).toBeInTheDocument();

    stand.orkesten = [
      { id: 'ork-1', name: 'Harmonie', memberCount: 2, listCount: 1 },
      { id: 'ork-2', name: 'Slagwerkgroep', memberCount: 0, listCount: 0 },
    ];
  });
});

describe('orkesten - de details rechts', () => {
  it('toont de leden en de muzieklijsten van het gekozen orkest', async () => {
    await kiesOrkest();

    expect(details).toHaveBeenCalledWith('ork-1');
    expect(screen.getByText('Marieke de Vries')).toBeInTheDocument();
    expect(screen.getByText('Joris Bakker')).toBeInTheDocument();
    expect(screen.getByText('Voorjaarsconcert')).toBeInTheDocument();
    expect(screen.getByText(/7 orchestras.pieces/)).toBeInTheDocument();
  });

  it('laat de leden van het vorige orkest niet staan na het wisselen', async () => {
    const gebruiker = await kiesOrkest();
    expect(screen.getByText('Marieke de Vries')).toBeInTheDocument();

    await gebruiker.click(screen.getByText('Slagwerkgroep'));

    // De namen van het vorige orkest zijn weg; er staat wat de server voor het
    // nieuw gekozen orkest teruggaf, en dat is hier niets.
    await waitFor(() => expect(screen.queryByText('Marieke de Vries')).toBeNull());
    expect(screen.getByText('orchestras.noMembersAssigned')).toBeInTheDocument();
    expect(screen.getByText('orchestras.noMusicLists')).toBeInTheDocument();
  });
});

describe('orkesten - toevoegen, wijzigen en verwijderen', () => {
  it('opent het venster Nieuw orkest met een leeg naamveld en stuurt de naam mee', async () => {
    const gebruiker = userEvent.setup();
    render(<Orchestras />, { wrapper: wikkel });

    await gebruiker.click(await screen.findByRole('button', { name: /orchestras.newOrchestra/ }));

    const venster = await screen.findByRole('dialog');
    const veld = within(venster).getByLabelText('orchestras.name');
    expect(veld).toHaveValue('');

    await gebruiker.type(veld, 'Jeugdorkest');
    await gebruiker.click(within(venster).getByRole('button', { name: 'common.add' }));

    await waitFor(() => expect(maakOrkest).toHaveBeenCalledWith('Jeugdorkest'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('opent het venster Bewerken met de huidige naam erin', async () => {
    const gebruiker = userEvent.setup();
    render(<Orchestras />, { wrapper: wikkel });

    const regel = (await screen.findByText('Harmonie')).closest<HTMLElement>('.flex')!;
    await gebruiker.click(within(regel).getByTitle('common.edit'));

    const venster = await screen.findByRole('dialog');
    const veld = within(venster).getByLabelText('orchestras.name');
    expect(veld).toHaveValue('Harmonie');

    await gebruiker.clear(veld);
    await gebruiker.type(veld, 'Harmonie A');
    await gebruiker.click(within(venster).getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(wijzigOrkest).toHaveBeenCalledWith({ id: 'ork-1', name: 'Harmonie A' }));
  });

  it('wist het naamveld weer als het venster gesloten wordt zonder op te slaan', async () => {
    const gebruiker = userEvent.setup();
    render(<Orchestras />, { wrapper: wikkel });

    const regel = (await screen.findByText('Harmonie')).closest<HTMLElement>('.flex')!;
    await gebruiker.click(within(regel).getByTitle('common.edit'));
    await gebruiker.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'common.cancel' }));

    // Nu het venster Nieuw orkest openen: daar mag de vorige naam niet in staan.
    await gebruiker.click(screen.getByRole('button', { name: /orchestras.newOrchestra/ }));
    expect(within(await screen.findByRole('dialog')).getByLabelText('orchestras.name')).toHaveValue('');
    expect(wijzigOrkest).not.toHaveBeenCalled();
  });

  it('noemt het orkest bij naam in de bevestiging en verwijdert pas na bevestigen', async () => {
    const gebruiker = userEvent.setup();
    render(<Orchestras />, { wrapper: wikkel });

    const regel = (await screen.findByText('Harmonie')).closest<HTMLElement>('.flex')!;
    await gebruiker.click(within(regel).getByTitle('common.delete'));

    const venster = await screen.findByRole('alertdialog');
    expect(within(venster).getByText('orchestras.deleteConfirm:Harmonie')).toBeInTheDocument();
    expect(wisOrkest).not.toHaveBeenCalled();

    await gebruiker.click(within(venster).getByRole('button', { name: 'common.delete' }));
    await waitFor(() => expect(wisOrkest).toHaveBeenCalledWith('ork-1'));
  });

  it('laat de rechterhelft leeg achter als het gekozen orkest verwijderd wordt', async () => {
    const gebruiker = await kiesOrkest();

    // De naam staat twee keer op het scherm: links in de lijst en rechts als
    // kop van de details. De knoppen zitten links.
    const regel = screen.getAllByText('Harmonie')[0].closest<HTMLElement>('.flex')!;
    await gebruiker.click(within(regel).getByTitle('common.delete'));
    await gebruiker.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'common.delete' }),
    );

    // De details van een verwijderd orkest mogen niet blijven hangen.
    await waitFor(() => expect(screen.getByText('orchestras.selectToView')).toBeInTheDocument());
    expect(screen.queryByText('Marieke de Vries')).toBeNull();
  });

  it('doet niets bij het afbreken van de bevestiging', async () => {
    const gebruiker = userEvent.setup();
    render(<Orchestras />, { wrapper: wikkel });

    const regel = (await screen.findByText('Harmonie')).closest<HTMLElement>('.flex')!;
    await gebruiker.click(within(regel).getByTitle('common.delete'));
    await gebruiker.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'common.cancel' }),
    );

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(wisOrkest).not.toHaveBeenCalled();
  });
});

describe('orkesten - muzieklijsten', () => {
  it('maakt een lijst aan bij het gekozen orkest en niet bij een ander', async () => {
    const gebruiker = await kiesOrkest();

    await gebruiker.click(screen.getByRole('button', { name: 'orchestras.addList' }));

    const venster = await screen.findByRole('dialog');
    await gebruiker.type(within(venster).getByLabelText('orchestras.name'), 'Kerstconcert');
    await gebruiker.click(within(venster).getByRole('button', { name: 'common.add' }));

    // De naam en het orkest gaan als twee losse waarden mee; het orkest is het
    // gekozen orkest en niet het eerste uit de lijst.
    await waitFor(() => expect(maakLijst).toHaveBeenCalledWith('Kerstconcert', 'ork-1'));
    await waitFor(() => expect(meldingen.goed).toHaveBeenCalledWith('orchestras.listCreated'));
  });

  it('opent het venster Lijst bewerken met de huidige naam erin', async () => {
    const gebruiker = await kiesOrkest();

    const regel = screen.getByText('Voorjaarsconcert').closest<HTMLElement>('.flex')!;
    await gebruiker.click(within(regel).getByTitle('common.edit'));

    const venster = await screen.findByRole('dialog');
    const veld = within(venster).getByLabelText('orchestras.name');
    expect(veld).toHaveValue('Voorjaarsconcert');

    await gebruiker.clear(veld);
    await gebruiker.type(veld, 'Voorjaar 2027');
    await gebruiker.click(within(venster).getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(wijzigLijst).toHaveBeenCalledWith('lijst-1', { name: 'Voorjaar 2027' }));
  });

  it('noemt de lijst bij naam in de bevestiging en verwijdert pas na bevestigen', async () => {
    const gebruiker = await kiesOrkest();

    const regel = screen.getByText('Voorjaarsconcert').closest<HTMLElement>('.flex')!;
    await gebruiker.click(within(regel).getByTitle('common.delete'));

    const venster = await screen.findByRole('alertdialog');
    expect(within(venster).getByText('orchestras.deleteMusicListConfirm:Voorjaarsconcert')).toBeInTheDocument();

    await gebruiker.click(within(venster).getByRole('button', { name: 'common.delete' }));
    await waitFor(() => expect(wisLijst).toHaveBeenCalledWith('lijst-1'));
    await waitFor(() => expect(meldingen.goed).toHaveBeenCalledWith('orchestras.listDeleted'));
  });

  it('meldt de fout van de server als een lijst niet aangemaakt mag worden', async () => {
    maakLijst.mockRejectedValue(new Error('Geen toegang tot dit orkest.'));
    const gebruiker = await kiesOrkest();

    await gebruiker.click(screen.getByRole('button', { name: 'orchestras.addList' }));
    const venster = await screen.findByRole('dialog');
    await gebruiker.type(within(venster).getByLabelText('orchestras.name'), 'Kerstconcert');
    await gebruiker.click(within(venster).getByRole('button', { name: 'common.add' }));

    await waitFor(() => expect(meldingen.fout).toHaveBeenCalled());
    expect(meldingen.goed).not.toHaveBeenCalled();
    // Het venster blijft open, zodat de ingetypte naam niet verloren gaat.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('orkesten - een mislukte opslag laat niets rondslingeren', () => {
  /**
   * bewijs - deze test is rood zonder de vangst in Orchestras.tsx.
   *
   * De zes handlers wachtten op `mutateAsync` zonder de afwijzing op te vangen.
   * De mutatie meldt de fout zelf al met showError, maar `mutateAsync` gooit hem
   * daarna nog eens door, en FormModal en ConfirmDialog gooien het resultaat van
   * onSubmit respectievelijk onConfirm weg. Daarmee kwam die tweede worp nergens
   * meer aan: elke mislukte opslag- of verwijderpoging op deze pagina liet een
   * onafgehandelde belofte achter. In de browser is dat een "Uncaught (in
   * promise)" in de console; een foutenmelder maakt er een onbekende storing van
   * terwijl de gebruiker de nette melding allang gezien had.
   *
   * Gemeten op de code van vóór de reparatie: alle vier de gevallen hieronder
   * vulden `afwijzingen`, en vitest meldde bovendien "Unhandled Rejection" over
   * het hele bestand.
   */
  async function zonderLosseAfwijzing(stap: () => Promise<void>) {
    const afwijzingen: unknown[] = [];
    const vangst = (reden: unknown) => afwijzingen.push(reden);
    process.on('unhandledRejection', vangst);
    try {
      await stap();
      // Node meldt een onafgehandelde afwijzing pas nadat de microtaakwachtrij
      // leeg is; twee macrotaken zijn genoeg om dat af te wachten.
      await new Promise((klaar) => setTimeout(klaar, 0));
      await new Promise((klaar) => setTimeout(klaar, 0));
    } finally {
      process.off('unhandledRejection', vangst);
    }
    return afwijzingen;
  }

  it('vangt de afwijzing op bij het aanmaken van een orkest', async () => {
    maakOrkest.mockRejectedValue(new Error('Geen toegang.'));

    const afwijzingen = await zonderLosseAfwijzing(async () => {
      const gebruiker = userEvent.setup();
      render(<Orchestras />, { wrapper: wikkel });
      await gebruiker.click(await screen.findByRole('button', { name: /orchestras.newOrchestra/ }));
      const venster = await screen.findByRole('dialog');
      await gebruiker.type(within(venster).getByLabelText('orchestras.name'), 'Jeugdorkest');
      await gebruiker.click(within(venster).getByRole('button', { name: 'common.add' }));
      await waitFor(() => expect(maakOrkest).toHaveBeenCalled());
    });

    expect(afwijzingen).toEqual([]);
    // En het venster staat er nog, met de ingetypte naam.
    expect(screen.getByLabelText('orchestras.name')).toHaveValue('Jeugdorkest');
  });

  it('vangt de afwijzing op bij het wijzigen van een orkest', async () => {
    wijzigOrkest.mockRejectedValue(new Error('Geen toegang.'));

    const afwijzingen = await zonderLosseAfwijzing(async () => {
      const gebruiker = userEvent.setup();
      render(<Orchestras />, { wrapper: wikkel });
      const regel = (await screen.findByText('Harmonie')).closest<HTMLElement>('.flex')!;
      await gebruiker.click(within(regel).getByTitle('common.edit'));
      const venster = await screen.findByRole('dialog');
      await gebruiker.click(within(venster).getByRole('button', { name: 'common.save' }));
      await waitFor(() => expect(wijzigOrkest).toHaveBeenCalled());
    });

    expect(afwijzingen).toEqual([]);
  });

  it('vangt de afwijzing op bij het verwijderen van een orkest', async () => {
    wisOrkest.mockRejectedValue(new Error('Geen toegang.'));

    const afwijzingen = await zonderLosseAfwijzing(async () => {
      const gebruiker = userEvent.setup();
      render(<Orchestras />, { wrapper: wikkel });
      const regel = (await screen.findByText('Harmonie')).closest<HTMLElement>('.flex')!;
      await gebruiker.click(within(regel).getByTitle('common.delete'));
      const venster = await screen.findByRole('alertdialog');
      await gebruiker.click(within(venster).getByRole('button', { name: 'common.delete' }));
      await waitFor(() => expect(wisOrkest).toHaveBeenCalled());
    });

    expect(afwijzingen).toEqual([]);
    // De bevestiging staat er nog: het orkest is niet weg, dus het venster
    // sluiten zou suggereren dat het gelukt is.
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('vangt de afwijzing op bij het verwijderen van een muzieklijst', async () => {
    wisLijst.mockRejectedValue(new Error('Geen toegang.'));

    const afwijzingen = await zonderLosseAfwijzing(async () => {
      const gebruiker = await kiesOrkest();
      const regel = screen.getByText('Voorjaarsconcert').closest<HTMLElement>('.flex')!;
      await gebruiker.click(within(regel).getByTitle('common.delete'));
      const venster = await screen.findByRole('alertdialog');
      await gebruiker.click(within(venster).getByRole('button', { name: 'common.delete' }));
      await waitFor(() => expect(wisLijst).toHaveBeenCalled());
    });

    expect(afwijzingen).toEqual([]);
  });
});
