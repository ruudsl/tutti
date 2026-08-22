/**
 * Vangnet voor het opknippen van de seizoensplanner.
 *
 * SeasonPlanner.tsx is 1352 regels met negen weergaven in één bestand: de
 * detailweergave van een seizoen, de vijf stappen van de aanmaakwizard, de twee
 * tabbladen van het overzicht en het sjabloonformulier. Die worden opgeknipt,
 * en bij het verplaatsen van code is de vraag niet of het er mooier uitziet
 * maar of het scherm daarna nog precies hetzelfde doet.
 *
 * Deze tests keuren niets goed. Ze leggen vast wat de pagina op dit moment
 * doet, zodat een verschuiving tijdens het opknippen meteen opvalt in plaats
 * van pas als iemand de pagina opent. Zo'n test heet een karakteriseringstest:
 * hij beschrijft het bestaande gedrag, ook waar dat gedrag misschien niet
 * ideaal is.
 *
 * Drie dingen zijn hier bewust vastgelegd omdat ze makkelijk sneuvelen bij een
 * verhuizing:
 *   - De `enabled`-voorwaarde op het ophalen van één seizoen. Zolang er geen
 *     seizoen gekozen is hoort `getSeason` niet aangeroepen te worden. Raakt
 *     die voorwaarde zoek, dan vraagt de pagina bij het openen een seizoen op
 *     met een lege sleutel, en dat merk je niet aan het scherm.
 *   - De volgorde van de tabbladen en van de wizardstappen. Die staan in de
 *     opmaak respectievelijk in één array; een verhuizing die ze herschikt
 *     verandert wat de gebruiker als eerste ziet.
 *   - Dat de rechtencontrole ná de queries kwam. De pagina haalde haar gegevens
 *     op vóórdat ze keek of de gebruiker er iets mee mocht. Dat is inmiddels
 *     bewust gerepareerd - de queries staan nu op `enabled` - en de test
 *     hieronder is meegedraaid; zie de opmerking bij die test.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import SeasonPlanner from '../SeasonPlanner';
import * as api from '../../api';
import type { Season, SeasonDetail, SeasonEvent } from '../../api';

vi.mock('../../api');

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

// De rol bepaalt of de pagina meer dan een foutmelding toont. Standaard is dat
// een beheerder; de test over de rechtencontrole zet hem tijdelijk om.
const ingelogdeGebruiker = { rol: 'admin' };
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', name: 'Test', role: ingelogdeGebruiker.rol } }),
}));

// `initReactI18next` hoort erbij omdat de pagina via utils/locale.ts de echte
// i18n-opzet meetrekt, en die roept het aan tijdens het laden van de module.
// Zonder deze export klapt het bestand al bij de import, vóór er één test
// gedraaid heeft.
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

const seizoen: Season = {
  id: 's1',
  name: 'Seizoen 2026',
  startDate: '2026-09-01',
  endDate: '2027-06-30',
  templateId: null,
  templateName: null,
  status: 'draft',
  budgetTotal: null,
  budgetAllocated: 0,
  notes: null,
  eventCount: 15,
  concertCount: 3,
  rehearsalCount: 12,
  createdBy: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

/** Hetzelfde seizoen zoals de detailaanroep het teruggeeft: met evenementen. */
function seizoenMetEvenementen(overschrijf: Partial<SeasonDetail> = {}): SeasonDetail {
  return {
    id: seizoen.id,
    name: seizoen.name,
    startDate: seizoen.startDate,
    endDate: seizoen.endDate,
    templateId: null,
    templateName: null,
    status: seizoen.status,
    budgetTotal: null,
    budgetAllocated: 0,
    notes: null,
    createdBy: null,
    createdAt: seizoen.createdAt,
    updatedAt: seizoen.updatedAt,
    events: [],
    ...overschrijf,
  };
}

const evenement: SeasonEvent = {
  id: 'e1',
  eventType: 'concert',
  eventId: null,
  eventName: 'Kerstconcert',
  plannedDate: '2026-12-20',
  budgetAmount: 500,
  notes: null,
  createdAt: '2026-01-01T00:00:00Z',
};

/**
 * De pagina hangt aan `src/api.ts`, een module met alle endpoints erin. Alleen
 * de aanroepen die de seizoensplanner doet krijgen hier een antwoord; de rest
 * blijft de lege automock. Voor een vangnet is dat genoeg: het gaat om wélke
 * aanroepen gebeuren en welke onderdelen verschijnen, niet om de inhoud van de
 * rijen.
 */
function zetApiKlaar(): void {
  vi.mocked(api.getSeasons).mockResolvedValue([]);
  vi.mocked(api.getSeasonTemplates).mockResolvedValue([]);
  vi.mocked(api.getOrchestras).mockResolvedValue([]);
  vi.mocked(api.getConcertTypes).mockResolvedValue({ concertTypes: [], mediaTypes: [] });
  vi.mocked(api.getSeason).mockResolvedValue(seizoenMetEvenementen());
}

function wikkel({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/**
 * Wacht tot het skelet weg is. Nodig omdat de laadweergave dezelfde titel
 * toont als de geladen pagina: wachten op `seasonPlanner.title` levert dus
 * meteen een treffer op terwijl de tabbladen er nog niet staan.
 */
async function wachtTotGeladen(): Promise<void> {
  await waitFor(() => expect(screen.queryByTestId('skelet-tabel')).not.toBeInTheDocument());
}

/** Zoekt een tabblad op zijn tekst. */
function zoekTabblad(label: string): HTMLElement | undefined {
  return screen.getAllByRole('button').find((knop) => knop.textContent?.trim() === label);
}

beforeEach(() => {
  vi.clearAllMocks();
  ingelogdeGebruiker.rol = 'admin';
  zetApiKlaar();
});

describe('seizoensplanner - vastgelegd gedrag vóór het opknippen', () => {
  it('toont twee tabbladen, in deze volgorde', async () => {
    render(<SeasonPlanner />, { wrapper: wikkel });

    await wachtTotGeladen();

    // De tabbladknoppen dragen geen klasse maar wel opmaak; ze zijn alleen aan
    // hun tekst te herkennen. Beide labels komen precies één keer op de pagina
    // voor, dus dat is hier veilig.
    const labels = screen
      .getAllByRole('button')
      .map((knop) => knop.textContent?.trim())
      .filter((tekst) => tekst === 'seasonPlanner.tabs.seasons' || tekst === 'seasonPlanner.tabs.templates');

    expect(labels).toEqual(['seasonPlanner.tabs.seasons', 'seasonPlanner.tabs.templates']);
  });

  it('begint op het tabblad met de seizoenen', async () => {
    render(<SeasonPlanner />, { wrapper: wikkel });

    await wachtTotGeladen();

    expect(zoekTabblad('seasonPlanner.tabs.seasons')!.style.fontWeight).toBe('bold');
    expect(zoekTabblad('seasonPlanner.tabs.templates')!.style.fontWeight).toBe('normal');
  });

  it('haalt bij het openen de seizoenen, sjablonen, orkesten en concerttypen op', async () => {
    render(<SeasonPlanner />, { wrapper: wikkel });

    await waitFor(() => {
      expect(api.getSeasons).toHaveBeenCalled();
      expect(api.getSeasonTemplates).toHaveBeenCalled();
      expect(api.getOrchestras).toHaveBeenCalled();
      expect(api.getConcertTypes).toHaveBeenCalled();
    });
  });

  // Zonder gekozen seizoen staat `useSeason` op een lege sleutel en hoort de
  // query uit te staan. Verdwijnt die voorwaarde bij het opknippen, dan vraagt
  // de pagina bij het openen een seizoen op dat niet bestaat.
  it('haalt geen los seizoen op zolang er geen seizoen gekozen is', async () => {
    render(<SeasonPlanner />, { wrapper: wikkel });

    await waitFor(() => expect(api.getSeasons).toHaveBeenCalled());

    expect(api.getSeason).not.toHaveBeenCalled();
  });

  it('toont een skelet zolang de seizoenen nog binnenkomen', () => {
    vi.mocked(api.getSeasons).mockReturnValue(new Promise(() => {}));

    render(<SeasonPlanner />, { wrapper: wikkel });

    expect(screen.getByTestId('skelet-tabel')).toBeInTheDocument();
    expect(screen.getByText('seasonPlanner.title')).toBeInTheDocument();
  });

  it('toont de lege toestand als er nog geen seizoenen zijn', async () => {
    render(<SeasonPlanner />, { wrapper: wikkel });

    expect(await screen.findByText('seasonPlanner.empty')).toBeInTheDocument();
    expect(screen.getByText('seasonPlanner.createFirst')).toBeInTheDocument();
  });

  it('zet de seizoenen in een tabel', async () => {
    vi.mocked(api.getSeasons).mockResolvedValue([seizoen]);

    render(<SeasonPlanner />, { wrapper: wikkel });

    expect(await screen.findByText('Seizoen 2026')).toBeInTheDocument();
    expect(screen.getByText('seasonPlanner.status.draft')).toBeInTheDocument();
  });

  it('schakelt naar het tabblad met de sjablonen', async () => {
    const gebruiker = userEvent.setup();
    render(<SeasonPlanner />, { wrapper: wikkel });

    await wachtTotGeladen();
    await gebruiker.click(zoekTabblad('seasonPlanner.tabs.templates')!);

    // Het element wordt na de klik opnieuw opgezocht in plaats van de
    // referentie van vóór de klik vast te houden: React vervangt het element
    // bij een hertekening, en dan draagt de oude referentie de nieuwe opmaak
    // nooit.
    await waitFor(() => expect(zoekTabblad('seasonPlanner.tabs.templates')!.style.fontWeight).toBe('bold'));
    expect(screen.getByText('seasonPlanner.templates.empty')).toBeInTheDocument();
  });

  it('opent het sjabloonformulier pas na een klik op nieuw sjabloon', async () => {
    const gebruiker = userEvent.setup();
    render(<SeasonPlanner />, { wrapper: wikkel });

    await wachtTotGeladen();
    await gebruiker.click(zoekTabblad('seasonPlanner.tabs.templates')!);

    expect(screen.queryByText('seasonPlanner.fields.defaultRehearsalDay')).not.toBeInTheDocument();

    await gebruiker.click(await screen.findByText('seasonPlanner.newTemplate'));

    expect(await screen.findByText('seasonPlanner.fields.defaultRehearsalTime')).toBeInTheDocument();
    expect(screen.getByText('seasonPlanner.fields.typicalConcerts')).toBeInTheDocument();
    expect(screen.getByText('seasonPlanner.fields.defaultRehearsalLocation')).toBeInTheDocument();
  });

  it('opent de wizard met vijf stappen, in deze volgorde', async () => {
    const gebruiker = userEvent.setup();
    render(<SeasonPlanner />, { wrapper: wikkel });

    await wachtTotGeladen();
    await gebruiker.click(screen.getByText('seasonPlanner.newSeason'));

    expect(await screen.findByText('seasonPlanner.wizard.title')).toBeInTheDocument();

    for (const [nummer, stap] of [
      ['1', 'seasonPlanner.steps.info'],
      ['2', 'seasonPlanner.steps.rehearsals'],
      ['3', 'seasonPlanner.steps.concerts'],
      ['4', 'seasonPlanner.steps.budget'],
      ['5', 'seasonPlanner.steps.review'],
    ]) {
      expect(screen.getByText(`${nummer}. ${stap}`)).toBeInTheDocument();
    }

    // De wizard begint op stap 1, dus het formulier van de eerste stap staat er.
    expect(screen.getByText('seasonPlanner.wizard.infoTitle')).toBeInTheDocument();
  });

  it('houdt de volgende-knop uit tot naam en periode ingevuld zijn', async () => {
    const gebruiker = userEvent.setup();
    render(<SeasonPlanner />, { wrapper: wikkel });

    await wachtTotGeladen();
    await gebruiker.click(screen.getByText('seasonPlanner.newSeason'));

    const volgende = () => screen.getAllByRole('button').find((knop) => knop.textContent?.includes('common.next'))!;

    expect(volgende()).toBeDisabled();

    await gebruiker.type(screen.getByPlaceholderText('seasonPlanner.fields.namePlaceholder'), 'Seizoen 2027');
    expect(volgende()).toBeDisabled();

    const datumvelden = document.querySelectorAll<HTMLInputElement>('input[type="date"]');
    await gebruiker.type(datumvelden[0], '2026-09-01');
    await gebruiker.type(datumvelden[1], '2027-06-30');

    await waitFor(() => expect(volgende()).toBeEnabled());
  });

  it('loopt van de eerste stap door naar de repetities', async () => {
    const gebruiker = userEvent.setup();
    render(<SeasonPlanner />, { wrapper: wikkel });

    await wachtTotGeladen();
    await gebruiker.click(screen.getByText('seasonPlanner.newSeason'));

    await gebruiker.type(screen.getByPlaceholderText('seasonPlanner.fields.namePlaceholder'), 'Seizoen 2027');
    const datumvelden = document.querySelectorAll<HTMLInputElement>('input[type="date"]');
    await gebruiker.type(datumvelden[0], '2026-09-01');
    await gebruiker.type(datumvelden[1], '2027-06-30');

    await gebruiker.click(screen.getAllByRole('button').find((knop) => knop.textContent?.includes('common.next'))!);

    expect(await screen.findByText('seasonPlanner.wizard.rehearsalsTitle')).toBeInTheDocument();
    // De voorbeeldlijst met repetitiedata hoort meteen berekend te zijn.
    expect(screen.getByText('seasonPlanner.wizard.clickToExclude')).toBeInTheDocument();
  });

  // De wizard maakt eerst het seizoen aan en genereert daarna de evenementen,
  // en springt dan naar de detailweergave van het verse seizoen. Dat zijn drie
  // aanroepen in een vaste volgorde; ze staan hier vast omdat ze verspreid over
  // de wizard geregeld worden en bij een verhuizing makkelijk uit elkaar lopen.
  it('maakt aan het eind van de wizard een seizoen aan en genereert de evenementen', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(api.createSeason).mockResolvedValue({ id: 'nieuw', message: 'aangemaakt' });
    vi.mocked(api.generateSeasonEvents).mockResolvedValue({
      message: 'aangemaakt',
      rehearsalCount: 0,
      concertCount: 0,
      rehearsalDates: [],
      concertNames: [],
    });
    vi.mocked(api.getSeason).mockResolvedValue(seizoenMetEvenementen({ id: 'nieuw', name: 'Seizoen 2027' }));

    render(<SeasonPlanner />, { wrapper: wikkel });

    await wachtTotGeladen();
    await gebruiker.click(screen.getByText('seasonPlanner.newSeason'));

    await gebruiker.type(screen.getByPlaceholderText('seasonPlanner.fields.namePlaceholder'), 'Seizoen 2027');
    const datumvelden = document.querySelectorAll<HTMLInputElement>('input[type="date"]');
    await gebruiker.type(datumvelden[0], '2026-09-01');
    await gebruiker.type(datumvelden[1], '2027-06-30');

    const volgende = () => screen.getAllByRole('button').find((knop) => knop.textContent?.includes('common.next'))!;
    for (let stap = 0; stap < 4; stap++) {
      await gebruiker.click(volgende());
    }

    expect(await screen.findByText('seasonPlanner.wizard.reviewTitle')).toBeInTheDocument();
    await gebruiker.click(screen.getByText('seasonPlanner.wizard.finish'));

    await waitFor(() => expect(api.createSeason).toHaveBeenCalled());
    expect(vi.mocked(api.createSeason).mock.calls[0][0]).toMatchObject({
      name: 'Seizoen 2027',
      startDate: '2026-09-01',
      endDate: '2027-06-30',
    });
    await waitFor(() => expect(api.generateSeasonEvents).toHaveBeenCalledWith('nieuw', expect.anything()));
    await waitFor(() => expect(api.getSeason).toHaveBeenCalledWith('nieuw'));
  });

  // Vastgelegd omdat het makkelijk sneuvelt: het sjabloonformulier onthoudt wat
  // er getypt is als je het sluit en weer opent. Dat komt doordat de
  // formuliergegevens buiten het formulier bewaard worden en bij annuleren niet
  // gewist worden. Verhuist die toestand mee het formulier in, dan is het veld
  // bij heropenen ineens leeg.
  it('onthoudt wat er in het sjabloonformulier getypt was na annuleren', async () => {
    const gebruiker = userEvent.setup();
    render(<SeasonPlanner />, { wrapper: wikkel });

    await wachtTotGeladen();
    await gebruiker.click(zoekTabblad('seasonPlanner.tabs.templates')!);
    await gebruiker.click(await screen.findByText('seasonPlanner.newTemplate'));

    const naamveld = document.querySelectorAll<HTMLInputElement>('input[type="text"]')[0];
    await gebruiker.type(naamveld, 'Standaardseizoen');

    await gebruiker.click(screen.getByText('common.cancel'));
    await gebruiker.click(await screen.findByText('seasonPlanner.newTemplate'));

    const naamveldOpnieuw = document.querySelectorAll<HTMLInputElement>('input[type="text"]')[0];
    expect(naamveldOpnieuw.value).toBe('Standaardseizoen');
  });

  it('verlaat de wizard met de terugknop en komt weer op de seizoenen uit', async () => {
    const gebruiker = userEvent.setup();
    render(<SeasonPlanner />, { wrapper: wikkel });

    await wachtTotGeladen();
    await gebruiker.click(screen.getByText('seasonPlanner.newSeason'));
    await screen.findByText('seasonPlanner.wizard.title');

    await gebruiker.click(screen.getAllByRole('button').find((knop) => knop.textContent?.includes('common.back'))!);

    await waitFor(() => expect(zoekTabblad('seasonPlanner.tabs.seasons')).toBeDefined());
    expect(screen.getByText('seasonPlanner.title')).toBeInTheDocument();
    expect(zoekTabblad('seasonPlanner.tabs.seasons')!.style.fontWeight).toBe('bold');
  });

  it('opent de detailweergave van een seizoen en haalt dat seizoen dan pas op', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(api.getSeasons).mockResolvedValue([seizoen]);
    vi.mocked(api.getSeason).mockResolvedValue(seizoenMetEvenementen({ events: [evenement] }));

    render(<SeasonPlanner />, { wrapper: wikkel });

    await gebruiker.click(await screen.findByText('Seizoen 2026'));

    await waitFor(() => expect(api.getSeason).toHaveBeenCalledWith('s1'));
    expect(await screen.findByText('Kerstconcert')).toBeInTheDocument();
    expect(screen.getByText('seasonPlanner.activate')).toBeInTheDocument();
  });

  // Een pagina die bij een mislukte aanroep helemaal niets toont is niet van
  // een kapotte pagina te onderscheiden. Dat de titel en de tabbladen blijven
  // staan is dus gedrag dat het opknippen moet overleven.
  it('houdt titel en tabbladen staan als het ophalen mislukt', async () => {
    vi.mocked(api.getSeasons).mockRejectedValue(new Error('geen verbinding'));
    vi.mocked(api.getSeasonTemplates).mockRejectedValue(new Error('geen verbinding'));

    render(<SeasonPlanner />, { wrapper: wikkel });

    await wachtTotGeladen();
    expect(screen.getByText('seasonPlanner.title')).toBeInTheDocument();
    expect(zoekTabblad('seasonPlanner.tabs.seasons')).toBeDefined();
    expect(zoekTabblad('seasonPlanner.tabs.templates')).toBeDefined();
  });

  it('toont een gewoon lid alleen een melding dat hij hier niets mag', async () => {
    ingelogdeGebruiker.rol = 'member';

    render(<SeasonPlanner />, { wrapper: wikkel });

    expect(await screen.findByText('common.noPermission')).toBeInTheDocument();
    expect(screen.queryByText('seasonPlanner.title')).not.toBeInTheDocument();
  });

  // Deze test legde vast dat de queries vóór de rechtencontrole stonden: ook wie
  // de pagina niet mocht zien haalde de seizoenen op. Dat was destijds
  // opgeschreven omdat het opviel, niet omdat het goed was. Het is nu bewust
  // gerepareerd - de vier queries van de pagina staan op `enabled` en draaien
  // alleen voor een beheerder - dus de verwachting is omgedraaid: er hoort nu
  // niets opgehaald te worden. De uitgebreide versie, met alle vier de
  // aanroepen, staat in SeasonPlanner.reparaties.test.tsx.
  it('haalt de seizoenen niet op voor iemand zonder rechten', async () => {
    ingelogdeGebruiker.rol = 'member';

    render(<SeasonPlanner />, { wrapper: wikkel });

    await screen.findByText('common.noPermission');

    expect(api.getSeasons).not.toHaveBeenCalled();
  });
});
