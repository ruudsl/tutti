/**
 * De podiumindeling van één concert: wie zit waar.
 *
 * ConcertStageSetup.tsx was nul procent gedekt. Het is het scherm waar iemand
 * een bestaande podiumindeling aan een concert hangt en daar leden op de
 * stoelen zet: links de indelingskeuze en de ledenlijst, in het midden het
 * podium, rechts de details van de aangeklikte positie. Daarna kunnen de
 * stoelkaartjes afgedrukt worden.
 *
 * De tests gebruiken het echte tekendoek (StageCanvas) in plaats van een
 * namaakversie. Dat is met opzet: de hele toewijzing begint met een klik op
 * een stoel op dat doek, en juist die overgang - van klik op het podium naar
 * een naam in de rechterkolom - is wat er stuk kan gaan. Dat bleek ook: zie de
 * beschrijving bij "een klik op een stoel" hieronder.
 *
 * Wat hier bewust niet getest wordt is het slepen van een lid naar een stoel.
 * Het scherm zet daar wel `draggable` en een `dragstart` voor klaar, maar er
 * is nergens een `drop`-ontvanger; die weg bestaat dus niet. De klikweg is de
 * enige die werkt, en die staat hieronder.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { ReactNode } from 'react';
import ConcertStageSetup from '../ConcertStageSetup';
import * as api from '../../api';
import type {
  ConcertDetail,
  ConcertStageResponse,
  PrintableSeatCardsResponse,
  StageLayout,
  StageLayoutData,
  User,
} from '../../types';

vi.mock('../../api');

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

// De terugvalwaarde is de Nederlandse tekst die de gebruiker te zien krijgt,
// en die staat in dit scherm overal bij de sleutel. Hem hier gebruiken maakt
// de verwachtingen leesbaar: 'Selecteer indeling' in plaats van
// 'concertStageSetup.selectLayout'. Sleutels zonder terugval blijven de
// sleutel.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string, terugval?: string) => terugval ?? sleutel }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../components/Skeleton', () => ({
  SkeletonTable: () => <div data-testid="skelet-tabel" />,
}));

vi.mock('../../utils/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));

const INDELING_DATA: StageLayoutData = {
  positions: [
    { id: 'p1', x: 100, y: 100, type: 'chair', label: 'Viool 1', section: 's1' },
    { id: 'p2', x: 200, y: 100, type: 'chair', label: 'Viool 2', section: 's1' },
    { id: 'p3', x: 300, y: 260, type: 'conductor', label: 'Dirigent' },
  ],
  shapes: [],
  sections: [{ id: 's1', name: 'Strijkers', color: '#4CAF50' }],
};

function indeling(overschrijf: Partial<StageLayout> = {}): StageLayout {
  return {
    id: 'l1',
    name: 'Grote zaal',
    description: null,
    venueName: null,
    stageWidth: 600,
    stageDepth: 400,
    isTemplate: false,
    isDefault: false,
    layoutData: INDELING_DATA,
    thumbnailUrl: null,
    usageCount: 0,
    createdBy: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overschrijf,
  };
}

const CONCERT = {
  id: 'c1',
  name: 'Zomerconcert',
  date: '2026-07-01',
  endDate: null,
  location: 'Dorpskerk',
  venueType: null,
  concertType: null,
  description: null,
  notes: null,
  program: [],
  media: [],
  attendance: [],
  createdBy: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
} as unknown as ConcertDetail;

function lid(id: string, voornaam: string, achternaam: string, instrument?: string): User {
  return {
    id,
    email: `${id}@example.org`,
    firstName: voornaam,
    lastName: achternaam,
    role: 'member',
    associationId: null,
    instruments: instrument ? ([{ id: `i-${id}`, name: instrument }] as User['instruments']) : undefined,
  };
}

const LEDEN = [lid('u1', 'Anna', 'Bakker', 'Viool'), lid('u2', 'Bram', 'Cohen', 'Cello'), lid('u3', 'Chris', 'Dekker')];

const GEEN_PODIUM: ConcertStageResponse = {
  concert: { id: 'c1', name: 'Zomerconcert', date: '2026-07-01' },
  assignment: null,
};

const KAARTJES: PrintableSeatCardsResponse = {
  concert: { id: 'c1', name: 'Zomerconcert', date: '2026-07-01', location: 'Dorpskerk' },
  layoutName: 'Grote zaal',
  seatCards: [
    {
      positionId: 'p1',
      label: 'Viool 1',
      section: 'Strijkers',
      sectionColor: '#4CAF50',
      musicianName: 'Anna Bakker',
      instrument: 'Viool',
      standNumber: 1,
    },
  ],
};

function zetApiKlaar(): void {
  vi.mocked(api.getConcert).mockResolvedValue(CONCERT);
  vi.mocked(api.getStageLayouts).mockResolvedValue([indeling(), indeling({ id: 'l2', name: 'Kerk', isDefault: true })]);
  vi.mocked(api.getStageLayout).mockResolvedValue(indeling());
  vi.mocked(api.getConcertStage).mockResolvedValue(GEEN_PODIUM);
  vi.mocked(api.getPrintableSeatCards).mockResolvedValue(KAARTJES);
  vi.mocked(api.getUsers).mockResolvedValue(LEDEN);
  vi.mocked(api.saveConcertStage).mockResolvedValue({ message: 'ok' });
}

/**
 * Tekent de pagina op /concerts/c1/stage. De concertlijst staat als tweede
 * route klaar, zodat een klik op "Terug" aantoonbaar ergens uitkomt in plaats
 * van alleen een navigatiefunctie aan te roepen.
 */
function toon(): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });

  function wikkel({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/concerts/c1/stage']}>
          <Routes>
            <Route path="/concerts/:concertId/stage" element={children} />
            <Route path="/concerts" element={<div>concertoverzicht</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
  }

  render(<ConcertStageSetup />, { wrapper: wikkel });
}

/**
 * Wacht tot het concert en het podium binnen zijn.
 *
 * Niet op de kop wachten: die staat er tijdens het laden ook al, dus daarmee
 * loopt een test zo langs het skelet heen. De tabbladbalk verschijnt pas als
 * beide queries klaar zijn.
 */
async function wachtOpPagina(): Promise<void> {
  await screen.findByRole('button', { name: 'Toewijzen' });
}

function indelingKeuze(): HTMLSelectElement {
  return screen.getByRole('combobox') as HTMLSelectElement;
}

/** De rechterkolom met positiedetails en statistieken. */
function rechterkolom(): HTMLElement {
  const kolom = document.querySelector('.setup-details');
  if (!kolom) throw new Error('rechterkolom niet gevonden');
  return kolom as HTMLElement;
}

/** Het blokje van een lid in de linkerkolom, herkenbaar aan zijn naam. */
function ledenblok(naam: string): HTMLElement {
  const zijbalk = document.querySelector('.setup-sidebar') as HTMLElement;
  const naamregel = within(zijbalk).getByText(naam);
  return naamregel.closest('.member-item') as HTMLElement;
}

/** Kiest een indeling en wacht tot de ledenlijst ernaast verschijnt. */
async function kiesIndeling(gebruiker: ReturnType<typeof userEvent.setup>, naam = 'Grote zaal'): Promise<void> {
  await gebruiker.selectOptions(indelingKeuze(), screen.getByRole('option', { name: naam }));
  await screen.findByRole('heading', { name: 'Leden' });
}

beforeEach(() => {
  vi.clearAllMocks();
  zetApiKlaar();
});

describe('concertpodium - wat er staat voor er iets gekozen is', () => {
  it('toont een skelet zolang het concert en het podium nog binnenkomen', () => {
    toon();

    expect(screen.getByTestId('skelet-tabel')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('zet het concert met datum en plaats onder de titel', async () => {
    toon();
    await wachtOpPagina();

    // De datumopmaak hangt aan de ingestelde taal; hier telt dat naam, datum
    // en plaats alle drie in de ondertitel staan.
    const ondertitel = screen.getByText(/Zomerconcert/);
    expect(ondertitel).toHaveTextContent('Zomerconcert');
    expect(ondertitel).toHaveTextContent('2026');
    expect(ondertitel).toHaveTextContent('Dorpskerk');
  });

  it('meldt het als het concert niet bestaat, en brengt de gebruiker terug naar de lijst', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(api.getConcert).mockResolvedValue(undefined as unknown as ConcertDetail);
    toon();

    expect(await screen.findByText('Concert niet gevonden.')).toBeInTheDocument();
    await gebruiker.click(screen.getByRole('button', { name: 'Terug' }));

    expect(await screen.findByText('concertoverzicht')).toBeInTheDocument();
  });

  it('biedt de beschikbare indelingen aan, met de standaardindeling als zodanig aangeduid', async () => {
    toon();
    await wachtOpPagina();

    expect(screen.getAllByRole('option').map((optie) => optie.textContent)).toEqual([
      'Selecteer...',
      'Grote zaal',
      'Kerk (standaard)',
    ]);
  });

  it('wijst de weg naar de tekentafel als er nog geen enkele indeling is', async () => {
    vi.mocked(api.getStageLayouts).mockResolvedValue([]);
    toon();
    await wachtOpPagina();

    expect(screen.getByText('Geen indelingen beschikbaar.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Maak een indeling' })).toHaveAttribute('href', '/stage-designer');
  });

  it('houdt de ledenlijst en de positiedetails weg tot er een indeling gekozen is', async () => {
    toon();
    await wachtOpPagina();

    expect(screen.queryByRole('heading', { name: 'Leden' })).not.toBeInTheDocument();
    expect(document.querySelector('.setup-details')).toBeNull();
    expect(screen.getByText('Selecteer eerst een podiumindeling')).toBeInTheDocument();
  });

  it('houdt het afdruktabblad dicht zolang er niets is opgeslagen', async () => {
    toon();
    await wachtOpPagina();

    expect(screen.getByRole('button', { name: 'Afdrukken' })).toBeDisabled();
  });
});

describe('concertpodium - de ledenlijst', () => {
  it('toont na het kiezen van een indeling alle leden met hun instrument', async () => {
    const gebruiker = userEvent.setup();
    toon();
    await wachtOpPagina();
    await kiesIndeling(gebruiker);

    const zijbalk = document.querySelector('.setup-sidebar') as HTMLElement;
    expect(within(zijbalk).getByText('Anna Bakker')).toBeInTheDocument();
    expect(within(zijbalk).getByText('Viool')).toBeInTheDocument();
    expect(within(zijbalk).getByText('Chris Dekker')).toBeInTheDocument();
  });

  it('filtert op achternaam', async () => {
    const gebruiker = userEvent.setup();
    toon();
    await wachtOpPagina();
    await kiesIndeling(gebruiker);

    await gebruiker.type(screen.getByPlaceholderText('Zoeken...'), 'dekker');

    const zijbalk = document.querySelector('.setup-sidebar') as HTMLElement;
    expect(within(zijbalk).getByText('Chris Dekker')).toBeInTheDocument();
    expect(within(zijbalk).queryByText('Anna Bakker')).not.toBeInTheDocument();
  });

  it('filtert ook op instrument, niet alleen op naam', async () => {
    const gebruiker = userEvent.setup();
    toon();
    await wachtOpPagina();
    await kiesIndeling(gebruiker);

    await gebruiker.type(screen.getByPlaceholderText('Zoeken...'), 'cello');

    const zijbalk = document.querySelector('.setup-sidebar') as HTMLElement;
    expect(within(zijbalk).getByText('Bram Cohen')).toBeInTheDocument();
    expect(within(zijbalk).queryByText('Anna Bakker')).not.toBeInTheDocument();
  });
});

/**
 * Een klik op een stoel opende niets.
 *
 * Het tekendoek kreeg hier `readOnly` mee. Dat is op zich terecht - je hoort
 * op deze pagina geen stoelen te verplaatsen of weg te gooien - maar in
 * StageCanvas.tsx zet `readOnly` óók de selectie uit: `handleElementClick`
 * keert meteen terug en de elementen krijgen `tabindex="-1"`. Daarmee kon
 * `selectedPositionId` nooit iets anders dan `null` worden.
 *
 * Gevolg: de rechterkolom bleef "Selecteer positie" zeggen, de ledenlijst
 * kreeg nooit zijn stippellijn, en `assignUserToPosition` was vanuit het
 * scherm onbereikbaar. De hele reden van de pagina - een lid op een stoel
 * zetten - werkte niet, met muis noch met toetsenbord.
 *
 * De reparatie staat in ConcertStageSetup.tsx: het doek krijgt geen `readOnly`
 * meer, maar wel een `onLayoutChange` die niets doet. Selecteren kan weer, en
 * wijzigen aan de indeling zelf komt nog steeds nergens terecht - de indeling
 * komt bij elke hertekening rechtstreeks uit de query.
 *
 * Aangetoond: met ConcertStageSetup.tsx teruggezet op HEAD
 * (`git checkout HEAD -- src/pages/ConcertStageSetup.tsx`) vallen acht tests
 * om - de vier van dit blok en de vier verderop die er een toewijzing voor
 * nodig hebben (het lid dat al zit, het opslaan met toewijzingen, en de twee
 * over het wisselen van indeling). Met de reparatie erin zijn ze groen.
 */
describe('concertpodium - een klik op een stoel', () => {
  it('opent de details van die positie, met label en sectie', async () => {
    const gebruiker = userEvent.setup();
    toon();
    await wachtOpPagina();
    await kiesIndeling(gebruiker);

    expect(within(rechterkolom()).getByRole('heading', { name: 'Selecteer positie' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Viool 1' }));

    const kolom = rechterkolom();
    expect(within(kolom).getByRole('heading', { name: 'Positie details' })).toBeInTheDocument();
    expect(within(kolom).getByText('Label:').parentElement).toHaveTextContent('Label: Viool 1');
    expect(within(kolom).getByText('Sectie:').parentElement).toHaveTextContent('Sectie: Strijkers');
    expect(within(kolom).getByText('Klik op een lid om toe te wijzen')).toBeInTheDocument();
  });

  it('is ook met het toetsenbord te bereiken', async () => {
    const gebruiker = userEvent.setup();
    toon();
    await wachtOpPagina();
    await kiesIndeling(gebruiker);

    const stoel = screen.getByRole('button', { name: 'Viool 2' });
    expect(stoel).toHaveAttribute('tabindex', '0');
    stoel.focus();
    await gebruiker.keyboard('{Enter}');

    expect(within(rechterkolom()).getByText('Label:').parentElement).toHaveTextContent('Label: Viool 2');
  });

  it('zet een lid op de gekozen stoel en telt dat mee in de statistieken', async () => {
    const gebruiker = userEvent.setup();
    toon();
    await wachtOpPagina();
    await kiesIndeling(gebruiker);

    // Twee van de drie posities zijn een stoel; de dirigent telt niet mee.
    expect(within(rechterkolom()).getByText('Toegewezen:').parentElement).toHaveTextContent('Toegewezen: 0 / 2');

    fireEvent.click(screen.getByRole('button', { name: 'Viool 1' }));
    await gebruiker.click(ledenblok('Anna Bakker'));

    const kolom = rechterkolom();
    expect(within(kolom).getByText('Anna Bakker')).toBeInTheDocument();
    expect(within(kolom).getByText('Toegewezen:').parentElement).toHaveTextContent('Toegewezen: 1 / 2');
    // De naam staat ook als bijschrift over het podium heen.
    expect(document.querySelector('.setup-canvas')).toHaveTextContent('Anna Bakker');
  });

  it('haalt een toewijzing er weer af', async () => {
    const gebruiker = userEvent.setup();
    toon();
    await wachtOpPagina();
    await kiesIndeling(gebruiker);

    fireEvent.click(screen.getByRole('button', { name: 'Viool 1' }));
    await gebruiker.click(ledenblok('Anna Bakker'));
    await gebruiker.click(within(rechterkolom()).getByRole('button', { name: 'Verwijderen' }));

    const kolom = rechterkolom();
    expect(within(kolom).getByText('Klik op een lid om toe te wijzen')).toBeInTheDocument();
    expect(within(kolom).getByText('Toegewezen:').parentElement).toHaveTextContent('Toegewezen: 0 / 2');
  });
});

describe('concertpodium - een lid dat al zit', () => {
  it('is niet nog een tweede keer toe te wijzen', async () => {
    const gebruiker = userEvent.setup();
    toon();
    await wachtOpPagina();
    await kiesIndeling(gebruiker);

    fireEvent.click(screen.getByRole('button', { name: 'Viool 1' }));
    await gebruiker.click(ledenblok('Anna Bakker'));

    expect(ledenblok('Anna Bakker')).toHaveClass('assigned');

    // Tweede stoel kiezen en nogmaals op hetzelfde lid klikken laat die stoel leeg.
    fireEvent.click(screen.getByRole('button', { name: 'Viool 2' }));
    await gebruiker.click(ledenblok('Anna Bakker'));

    const kolom = rechterkolom();
    expect(within(kolom).getByText('Klik op een lid om toe te wijzen')).toBeInTheDocument();
    expect(within(kolom).getByText('Toegewezen:').parentElement).toHaveTextContent('Toegewezen: 1 / 2');
  });
});

describe('concertpodium - opslaan', () => {
  it('houdt de opslaanknop uit tot er iets veranderd is', async () => {
    const gebruiker = userEvent.setup();
    toon();
    await wachtOpPagina();

    expect(screen.getByRole('button', { name: 'Opslaan' })).toBeDisabled();

    await kiesIndeling(gebruiker);

    expect(screen.getByRole('button', { name: 'Opslaan' })).toBeEnabled();
    expect(screen.getByText('Niet-opgeslagen wijzigingen')).toBeInTheDocument();
  });

  it('stuurt de indeling met de toewijzingen naar de server', async () => {
    const gebruiker = userEvent.setup();
    toon();
    await wachtOpPagina();
    await kiesIndeling(gebruiker);

    fireEvent.click(screen.getByRole('button', { name: 'Viool 1' }));
    await gebruiker.click(ledenblok('Anna Bakker'));
    await gebruiker.click(screen.getByRole('button', { name: 'Opslaan' }));

    await waitFor(() =>
      expect(api.saveConcertStage).toHaveBeenCalledWith('c1', 'l1', {
        p1: { userId: 'u1', instrumentId: 'i-u1', name: 'Anna Bakker' },
      }),
    );
    // Na het opslaan staat de melding over niet-opgeslagen werk niet meer.
    await waitFor(() => expect(screen.queryByText('Niet-opgeslagen wijzigingen')).not.toBeInTheDocument());
  });

  it('laat de melding staan als het opslaan mislukt', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(api.saveConcertStage).mockRejectedValue(new Error('netwerk weg'));
    toon();
    await wachtOpPagina();
    await kiesIndeling(gebruiker);

    await gebruiker.click(screen.getByRole('button', { name: 'Opslaan' }));

    await waitFor(() => expect(api.saveConcertStage).toHaveBeenCalled());
    expect(screen.getByText('Niet-opgeslagen wijzigingen')).toBeInTheDocument();
  });
});

describe('concertpodium - van indeling wisselen', () => {
  it('vraagt eerst of het werk weg mag', async () => {
    const gebruiker = userEvent.setup();
    toon();
    await wachtOpPagina();
    await kiesIndeling(gebruiker);

    fireEvent.click(screen.getByRole('button', { name: 'Viool 1' }));
    await gebruiker.click(ledenblok('Anna Bakker'));

    await gebruiker.selectOptions(indelingKeuze(), screen.getByRole('option', { name: 'Kerk (standaard)' }));

    expect(screen.getByRole('alertdialog')).toHaveTextContent('Wijzigingen negeren?');
    // Zolang er niet bevestigd is, staat de oude indeling er nog mét de naam.
    expect(indelingKeuze().value).toBe('l1');
    expect(document.querySelector('.setup-canvas')).toHaveTextContent('Anna Bakker');
  });

  it('wist na bevestiging de toewijzingen en neemt de nieuwe indeling', async () => {
    const gebruiker = userEvent.setup();
    toon();
    await wachtOpPagina();
    await kiesIndeling(gebruiker);

    fireEvent.click(screen.getByRole('button', { name: 'Viool 1' }));
    await gebruiker.click(ledenblok('Anna Bakker'));
    await gebruiker.selectOptions(indelingKeuze(), screen.getByRole('option', { name: 'Kerk (standaard)' }));
    await gebruiker.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'common.confirm' }));

    await waitFor(() => expect(indelingKeuze().value).toBe('l2'));
    expect(document.querySelector('.setup-canvas')).not.toHaveTextContent('Anna Bakker');
  });

  it('laat alles staan als de vraag weggeklikt wordt', async () => {
    const gebruiker = userEvent.setup();
    toon();
    await wachtOpPagina();
    await kiesIndeling(gebruiker);

    fireEvent.click(screen.getByRole('button', { name: 'Viool 1' }));
    await gebruiker.click(ledenblok('Anna Bakker'));
    await gebruiker.selectOptions(indelingKeuze(), screen.getByRole('option', { name: 'Kerk (standaard)' }));
    await gebruiker.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'common.cancel' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(indelingKeuze().value).toBe('l1');
    expect(document.querySelector('.setup-canvas')).toHaveTextContent('Anna Bakker');
  });
});

describe('concertpodium - een concert waarvoor al een podium klaarstaat', () => {
  beforeEach(() => {
    vi.mocked(api.getConcertStage).mockResolvedValue({
      concert: { id: 'c1', name: 'Zomerconcert', date: '2026-07-01' },
      assignment: {
        id: 'a1',
        layoutId: 'l1',
        layoutName: 'Grote zaal',
        stageWidth: 600,
        stageDepth: 400,
        layoutData: INDELING_DATA,
        assignments: { p1: { userId: 'u1', instrumentId: 'i-u1', name: 'Anna Bakker' } },
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    });
  });

  it('opent met die indeling en die toewijzing, zonder iets als gewijzigd te bestempelen', async () => {
    toon();
    await wachtOpPagina();

    await waitFor(() => expect(indelingKeuze().value).toBe('l1'));
    await waitFor(() => expect(document.querySelector('.setup-canvas')).toHaveTextContent('Anna Bakker'));
    expect(screen.queryByText('Niet-opgeslagen wijzigingen')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Opslaan' })).toBeDisabled();
  });

  it('geeft het afdruktabblad vrij en toont daar de stoelkaartjes', async () => {
    const gebruiker = userEvent.setup();
    toon();
    await wachtOpPagina();

    const afdrukken = await screen.findByRole('button', { name: 'Afdrukken' });
    await waitFor(() => expect(afdrukken).toBeEnabled());
    await gebruiker.click(afdrukken);

    expect(screen.getByText('1 kaartjes')).toBeInTheDocument();
    expect(screen.getByText('Anna Bakker')).toBeInTheDocument();
    expect(screen.getByText('Viool 1')).toBeInTheDocument();
    // Het toewijstabblad is daarmee uit beeld.
    expect(screen.queryByRole('heading', { name: 'Selecteer indeling' })).not.toBeInTheDocument();
  });

  it('meldt op het afdruktabblad dat er nog niets is als de kaartjes ontbreken', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(api.getPrintableSeatCards).mockResolvedValue(undefined as unknown as PrintableSeatCardsResponse);
    toon();
    await wachtOpPagina();

    const afdrukken = await screen.findByRole('button', { name: 'Afdrukken' });
    await waitFor(() => expect(afdrukken).toBeEnabled());
    await gebruiker.click(afdrukken);

    expect(screen.getByText('Geen afdrukgegevens beschikbaar. Sla eerst de podiumindeling op.')).toBeInTheDocument();
  });
});
