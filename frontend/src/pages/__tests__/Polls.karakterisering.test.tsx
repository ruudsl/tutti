/**
 * Eerste tests op de peilingenpagina.
 *
 * Polls.tsx was 0 procent gedekt: 206 statements verdeeld over de pagina zelf
 * en vier vensters - het detailscherm, het stemvenster, het aanmaakformulier en
 * het bewerkformulier. Geen enkele regel werd door een test aangeraakt.
 *
 * Deze tests kijken naar wat de gebruiker ziet en doet, niet naar de interne
 * toestand van de pagina. Wat hier bewust vastligt:
 *   - De lijst toont wat de server stuurt, en een lege lijst geeft de lege
 *     staat in plaats van een leeg scherm.
 *   - Een mislukte aanvraag geeft een melding met een knop om het opnieuw te
 *     proberen. Dat is nieuw gedrag; zie de regressietests onderaan.
 *   - Stemmen kan alleen op een actieve peiling waarop je nog niet gestemd
 *     hebt. Op een gesloten peiling hoort de stemknop er niet te staan; wie hem
 *     daar wel ziet krijgt een foutmelding van de server terug.
 *   - Wie welke beheerdersknoppen ziet hangt aan de rol én aan de status van de
 *     peiling. Activeren hoort bij een concept, sluiten bij een actieve
 *     peiling, archiveren bij een gesloten peiling.
 *   - De resultaten blijven verborgen zolang `canSeeResults` uit staat.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import Polls from '../Polls';
import * as peilingenApi from '../../api/polls';
import type { Poll, PollDetail } from '../../api/polls';

vi.mock('../../api/polls');

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

// De rol bepaalt welke knoppen er staan; per test overschrijven we hem.
const huidigeGebruiker: { rol: string; id: string } = { rol: 'admin', id: 'u1' };
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: huidigeGebruiker.id, role: huidigeGebruiker.rol } }),
}));

// Het antwoord op de bevestigingsvraag, per test in te stellen.
const bevestiging = { antwoord: true };
vi.mock('../../hooks/useConfirm', () => ({
  useConfirm: () => () => Promise.resolve(bevestiging.antwoord),
}));

// `initReactI18next` hoort erbij omdat de pagina via andere modules de echte
// i18n-opzet meetrekt, en die roept het aan tijdens het laden van de module.
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

const toonFout = vi.fn();
const toonSucces = vi.fn();
vi.mock('../../utils/toast', () => ({
  showSuccess: (bericht: string) => toonSucces(bericht),
  showError: (bericht: string) => toonFout(bericht),
}));

const OVER_EEN_JAAR = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
const VORIG_JAAR = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString();

function maakPeiling(overschrijving: Partial<Poll> = {}): Poll {
  return {
    id: 'peiling-1',
    title: 'Datum voorjaarsconcert',
    description: 'Wanneer spelen we het voorjaarsconcert?',
    pollType: 'single',
    status: 'active',
    isAnonymous: false,
    showResultsBeforeClose: true,
    allowComments: true,
    createdBy: 'u-admin',
    createdByName: 'Beheerder',
    createdAt: '2026-01-05T10:00:00.000Z',
    optionCount: 2,
    voteCount: 3,
    hasVoted: false,
    ...overschrijving,
  };
}

function maakDetail(overschrijving: Partial<PollDetail> = {}): PollDetail {
  return {
    id: 'peiling-1',
    title: 'Datum voorjaarsconcert',
    description: 'Wanneer spelen we het voorjaarsconcert?',
    pollType: 'single',
    status: 'active',
    isAnonymous: false,
    showResultsBeforeClose: true,
    allowComments: true,
    createdBy: 'u-admin',
    createdByName: 'Beheerder',
    createdAt: '2026-01-05T10:00:00.000Z',
    hasVoted: false,
    options: [
      { id: 'optie-1', text: 'Vrijdag 12 juni', sortOrder: 1, voteCount: 2 },
      { id: 'optie-2', text: 'Zaterdag 13 juni', description: 'De zaal is dan vrij', sortOrder: 2, voteCount: 1 },
    ],
    totalVoters: 3,
    userVotes: [],
    canSeeResults: true,
    comments: [],
    ...overschrijving,
  };
}

const PEILINGEN: Poll[] = [
  maakPeiling(),
  maakPeiling({
    id: 'peiling-2',
    title: 'Nieuwe uniformen',
    description: undefined,
    pollType: 'multiple',
    status: 'closed',
    isAnonymous: true,
    hasVoted: true,
    optionCount: 3,
    voteCount: 11,
  }),
];

function zetApiKlaar(): void {
  const leeg = vi.fn().mockResolvedValue({ message: 'ok' });
  for (const naam of Object.keys(peilingenApi)) {
    const functie = (peilingenApi as Record<string, unknown>)[naam];
    if (typeof functie === 'function') {
      vi.mocked(functie as (...args: unknown[]) => unknown).mockImplementation(leeg);
    }
  }
  vi.mocked(peilingenApi.getPolls).mockResolvedValue(PEILINGEN);
  vi.mocked(peilingenApi.getPoll).mockResolvedValue(maakDetail());
  vi.mocked(peilingenApi.sendPollReminder).mockResolvedValue({ message: 'ok', sent: 4 });
  vi.mocked(peilingenApi.createRehearsalFromPoll).mockResolvedValue({
    message: 'ok',
    rehearsalId: 'rep-1',
    date: '2026-06-12T20:00:00.000Z',
    winningOption: 'Vrijdag 12 juni',
    voteCount: 2,
  });
}

function wikkel({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Opent het detailvenster van de eerste peiling en geeft dat venster terug. */
async function openDetail(gebruiker: ReturnType<typeof userEvent.setup>, titel = 'Datum voorjaarsconcert') {
  await gebruiker.click(await screen.findByRole('heading', { name: titel, level: 3 }));
  return await screen.findByRole('dialog');
}

beforeEach(() => {
  vi.clearAllMocks();
  huidigeGebruiker.rol = 'admin';
  huidigeGebruiker.id = 'u1';
  bevestiging.antwoord = true;
  zetApiKlaar();
});

describe('peilingenpagina - de lijst', () => {
  it('toont de peilingen die de server stuurt', async () => {
    render(<Polls />, { wrapper: wikkel });

    expect(await screen.findByRole('heading', { name: 'Datum voorjaarsconcert', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Nieuwe uniformen', level: 3 })).toBeInTheDocument();
    expect(screen.getByText('Wanneer spelen we het voorjaarsconcert?')).toBeInTheDocument();

    // Aantallen stemmen en opties komen rechtstreeks van de server mee.
    const stemtellers = screen.getAllByTestId('icon-users').map((el) => el.parentElement);
    expect(stemtellers[0]).toHaveTextContent('3 polls.votes');
    expect(stemtellers[1]).toHaveTextContent('11 polls.votes');

    const optietellers = screen.getAllByTestId('icon-clipboard').map((el) => el.parentElement);
    expect(optietellers[0]).toHaveTextContent('2 polls.options');
    expect(optietellers[1]).toHaveTextContent('3 polls.options');
  });

  it('vraagt zonder ingevulde filters geen enkel filter aan de server', async () => {
    render(<Polls />, { wrapper: wikkel });

    await waitFor(() => expect(peilingenApi.getPolls).toHaveBeenCalled());

    // Lege strings zouden door de server als echte filters gelezen worden.
    expect(peilingenApi.getPolls).toHaveBeenCalledWith({ status: undefined, search: undefined });
  });

  it('geeft de lege staat als de server geen peilingen stuurt', async () => {
    vi.mocked(peilingenApi.getPolls).mockResolvedValue([]);

    render(<Polls />, { wrapper: wikkel });

    expect(await screen.findByText('polls.noPolls')).toBeInTheDocument();
    // De kop en de filters blijven staan; de pagina is niet leeg, alleen de
    // lijst is dat.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('polls.title');
    expect(screen.getByPlaceholderText('polls.searchPlaceholder')).toBeInTheDocument();
  });

  it('toont de skeletweergave zolang de peilingen nog laden', async () => {
    let losmaken: (peilingen: Poll[]) => void = () => {};
    vi.mocked(peilingenApi.getPolls).mockReturnValue(
      new Promise<Poll[]>((resolve) => {
        losmaken = resolve;
      }),
    );

    render(<Polls />, { wrapper: wikkel });

    expect(await screen.findByTestId('skelet-tabel')).toBeInTheDocument();

    losmaken(PEILINGEN);
    await waitFor(() => expect(screen.queryByTestId('skelet-tabel')).not.toBeInTheDocument());
  });

  it('haalt geen peilingdetail op zolang er geen peiling gekozen is', async () => {
    render(<Polls />, { wrapper: wikkel });

    await screen.findByRole('heading', { name: 'Datum voorjaarsconcert', level: 3 });

    expect(peilingenApi.getPoll).not.toHaveBeenCalled();
  });

  it('stuurt de gekozen status mee als filter', async () => {
    const gebruiker = userEvent.setup();
    render(<Polls />, { wrapper: wikkel });

    await screen.findByRole('heading', { name: 'Datum voorjaarsconcert', level: 3 });
    await gebruiker.selectOptions(screen.getByDisplayValue('common.all'), 'closed');

    await waitFor(() => expect(peilingenApi.getPolls).toHaveBeenCalledWith({ status: 'closed', search: undefined }));
  });

  it('toont dat je al gestemd hebt en of de peiling nog loopt', async () => {
    vi.mocked(peilingenApi.getPolls).mockResolvedValue([
      maakPeiling({ hasVoted: true, endsAt: OVER_EEN_JAAR }),
      maakPeiling({ id: 'peiling-3', title: 'Afgelopen peiling', hasVoted: false, endsAt: VORIG_JAAR }),
    ]);

    render(<Polls />, { wrapper: wikkel });

    expect(await screen.findByText('polls.youVoted')).toBeInTheDocument();
    // Een einddatum in de toekomst leest anders dan een die al voorbij is.
    expect(screen.getByText(/polls\.endsAt/)).toBeInTheDocument();
    expect(screen.getByText(/polls\.endedAt/)).toBeInTheDocument();
  });

  it('geeft een beheerder de knop om een peiling aan te maken', async () => {
    render(<Polls />, { wrapper: wikkel });

    expect(await screen.findByRole('button', { name: /polls\.createPoll/ })).toBeInTheDocument();
  });

  it('geeft een gewoon lid die knop niet', async () => {
    huidigeGebruiker.rol = 'member';
    render(<Polls />, { wrapper: wikkel });

    await screen.findByRole('heading', { name: 'Datum voorjaarsconcert', level: 3 });

    expect(screen.queryByRole('button', { name: /polls\.createPoll/ })).not.toBeInTheDocument();
  });
});

describe('peilingenpagina - het detailvenster', () => {
  it('haalt het detail op en toont de opties na klik op een peiling', async () => {
    const gebruiker = userEvent.setup();
    render(<Polls />, { wrapper: wikkel });

    const venster = await openDetail(gebruiker);

    await waitFor(() => expect(peilingenApi.getPoll).toHaveBeenCalledWith('peiling-1'));
    expect(within(venster).getByText('Vrijdag 12 juni')).toBeInTheDocument();
    expect(within(venster).getByText('Zaterdag 13 juni')).toBeInTheDocument();
    expect(within(venster).getByText('De zaal is dan vrij')).toBeInTheDocument();
  });

  it('toont de uitslag per optie als die zichtbaar mag zijn', async () => {
    const gebruiker = userEvent.setup();
    render(<Polls />, { wrapper: wikkel });

    const venster = await openDetail(gebruiker);

    // Twee van de drie stemmen is 67 procent, één van de drie is 33.
    expect(within(venster).getByText('2 (67%)')).toBeInTheDocument();
    expect(within(venster).getByText('1 (33%)')).toBeInTheDocument();
  });

  it('houdt de uitslag verborgen als die nog niet gedeeld mag worden', async () => {
    vi.mocked(peilingenApi.getPoll).mockResolvedValue(maakDetail({ canSeeResults: false }));
    const gebruiker = userEvent.setup();
    render(<Polls />, { wrapper: wikkel });

    const venster = await openDetail(gebruiker);

    expect(within(venster).getByText('Vrijdag 12 juni')).toBeInTheDocument();
    expect(within(venster).queryByText(/\(\d+%\)/)).not.toBeInTheDocument();
  });

  it('biedt de stemknop aan op een actieve peiling waarop nog niet gestemd is', async () => {
    const gebruiker = userEvent.setup();
    render(<Polls />, { wrapper: wikkel });

    const venster = await openDetail(gebruiker);

    expect(within(venster).getByRole('button', { name: /polls\.vote$/ })).toBeInTheDocument();
    expect(within(venster).queryByRole('button', { name: /polls\.retractVote/ })).not.toBeInTheDocument();
  });

  it('laat niet stemmen op een gesloten peiling', async () => {
    vi.mocked(peilingenApi.getPoll).mockResolvedValue(maakDetail({ status: 'closed' }));
    const gebruiker = userEvent.setup();
    render(<Polls />, { wrapper: wikkel });

    const venster = await openDetail(gebruiker);

    // Stemmen op een gesloten peiling weigert de server; het scherm hoort de
    // knop dan helemaal niet aan te bieden.
    expect(within(venster).queryByRole('button', { name: /polls\.vote$/ })).not.toBeInTheDocument();
    expect(within(venster).queryByRole('button', { name: /polls\.retractVote/ })).not.toBeInTheDocument();
  });

  it('biedt intrekken aan als er al gestemd is, en trekt de stem in', async () => {
    vi.mocked(peilingenApi.getPoll).mockResolvedValue(
      maakDetail({ hasVoted: true, userVotes: [{ optionId: 'optie-1' }] }),
    );
    const gebruiker = userEvent.setup();
    render(<Polls />, { wrapper: wikkel });

    const venster = await openDetail(gebruiker);

    expect(within(venster).queryByRole('button', { name: /polls\.vote$/ })).not.toBeInTheDocument();
    await gebruiker.click(within(venster).getByRole('button', { name: /polls\.retractVote/ }));

    await waitFor(() => expect(peilingenApi.retractVote).toHaveBeenCalledWith('peiling-1'));
    await waitFor(() => expect(toonSucces).toHaveBeenCalledWith('polls.voteRetracted'));
  });

  it('meldt het als het intrekken mislukt', async () => {
    vi.mocked(peilingenApi.getPoll).mockResolvedValue(maakDetail({ hasVoted: true }));
    vi.mocked(peilingenApi.retractVote).mockRejectedValue(new Error('mislukt'));
    const gebruiker = userEvent.setup();
    render(<Polls />, { wrapper: wikkel });

    const venster = await openDetail(gebruiker);
    await gebruiker.click(within(venster).getByRole('button', { name: /polls\.retractVote/ }));

    await waitFor(() => expect(toonFout).toHaveBeenCalled());
    // Het venster blijft staan, zodat de gebruiker het opnieuw kan proberen.
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('toont de reacties en plaatst een nieuwe', async () => {
    vi.mocked(peilingenApi.getPoll).mockResolvedValue(
      maakDetail({
        comments: [
          {
            id: 'reactie-1',
            content: 'Vrijdag lukt mij niet',
            authorId: 'u2',
            authorName: 'Marieke',
            createdAt: '2026-01-06T09:00:00.000Z',
            updatedAt: '2026-01-06T09:00:00.000Z',
          },
        ],
      }),
    );
    const gebruiker = userEvent.setup();
    render(<Polls />, { wrapper: wikkel });

    const venster = await openDetail(gebruiker);
    expect(within(venster).getByText('Vrijdag lukt mij niet')).toBeInTheDocument();
    expect(within(venster).getByText('Marieke')).toBeInTheDocument();

    await gebruiker.type(within(venster).getByPlaceholderText('polls.addCommentPlaceholder'), 'Zaterdag ook prima');
    await gebruiker.click(within(venster).getByTestId('icon-send'));

    await waitFor(() =>
      expect(peilingenApi.addPollComment).toHaveBeenCalledWith('peiling-1', { content: 'Zaterdag ook prima' }),
    );
  });

  it('meldt dat er nog geen reacties zijn', async () => {
    const gebruiker = userEvent.setup();
    render(<Polls />, { wrapper: wikkel });

    const venster = await openDetail(gebruiker);

    expect(within(venster).getByText('polls.noComments')).toBeInTheDocument();
    // Zonder tekst is de verzendknop niet te gebruiken.
    expect(within(venster).getByTestId('icon-send').closest('button')).toBeDisabled();
  });

  it('laat de reactiesectie weg als reacties uit staan', async () => {
    vi.mocked(peilingenApi.getPoll).mockResolvedValue(maakDetail({ allowComments: false }));
    const gebruiker = userEvent.setup();
    render(<Polls />, { wrapper: wikkel });

    const venster = await openDetail(gebruiker);

    expect(within(venster).queryByText('polls.comments')).not.toBeInTheDocument();
    expect(within(venster).queryByPlaceholderText('polls.addCommentPlaceholder')).not.toBeInTheDocument();
  });

  it('geeft een gewoon lid geen beheerdersknoppen in het detailvenster', async () => {
    huidigeGebruiker.rol = 'member';
    vi.mocked(peilingenApi.getPoll).mockResolvedValue(maakDetail({ status: 'draft' }));
    const gebruiker = userEvent.setup();
    render(<Polls />, { wrapper: wikkel });

    const venster = await openDetail(gebruiker);

    expect(within(venster).queryByRole('button', { name: /common\.edit/ })).not.toBeInTheDocument();
    expect(within(venster).queryByRole('button', { name: /common\.delete/ })).not.toBeInTheDocument();
    expect(within(venster).queryByRole('button', { name: /polls\.activate/ })).not.toBeInTheDocument();
  });

  it('biedt bij een concept activeren, bewerken en verwijderen aan', async () => {
    vi.mocked(peilingenApi.getPoll).mockResolvedValue(maakDetail({ status: 'draft' }));
    const gebruiker = userEvent.setup();
    render(<Polls />, { wrapper: wikkel });

    const venster = await openDetail(gebruiker);

    expect(within(venster).getByRole('button', { name: /polls\.activate/ })).toBeInTheDocument();
    expect(within(venster).getByRole('button', { name: /common\.edit/ })).toBeInTheDocument();
    expect(within(venster).getByRole('button', { name: /common\.delete/ })).toBeInTheDocument();
    // Sluiten en archiveren horen bij een latere status.
    expect(within(venster).queryByRole('button', { name: /polls\.close/ })).not.toBeInTheDocument();
    expect(within(venster).queryByRole('button', { name: /polls\.archive/ })).not.toBeInTheDocument();
  });

  it('activeert een concept via de knop', async () => {
    vi.mocked(peilingenApi.getPoll).mockResolvedValue(maakDetail({ status: 'draft' }));
    const gebruiker = userEvent.setup();
    render(<Polls />, { wrapper: wikkel });

    const venster = await openDetail(gebruiker);
    await gebruiker.click(within(venster).getByRole('button', { name: /polls\.activate/ }));

    await waitFor(() => expect(peilingenApi.changePollStatus).toHaveBeenCalledWith('peiling-1', 'active'));
  });

  it('verwijdert een concept pas na bevestiging', async () => {
    vi.mocked(peilingenApi.getPoll).mockResolvedValue(maakDetail({ status: 'draft' }));
    bevestiging.antwoord = false;
    const gebruiker = userEvent.setup();
    render(<Polls />, { wrapper: wikkel });

    const venster = await openDetail(gebruiker);
    await gebruiker.click(within(venster).getByRole('button', { name: /common\.delete/ }));

    await waitFor(() => expect(peilingenApi.deletePoll).not.toHaveBeenCalled());

    bevestiging.antwoord = true;
    await gebruiker.click(within(venster).getByRole('button', { name: /common\.delete/ }));
    // react-query geeft de mutatiefunctie naast de peiling ook zijn eigen
    // context mee; alleen het eerste argument is van de pagina.
    await waitFor(() => expect(peilingenApi.deletePoll).toHaveBeenCalled());
    expect(vi.mocked(peilingenApi.deletePoll).mock.calls[0][0]).toBe('peiling-1');
  });

  it('biedt bij een actieve peiling sluiten en een herinnering aan', async () => {
    const gebruiker = userEvent.setup();
    render(<Polls />, { wrapper: wikkel });

    const venster = await openDetail(gebruiker);

    expect(within(venster).getByRole('button', { name: /polls\.close/ })).toBeInTheDocument();
    await gebruiker.click(within(venster).getByRole('button', { name: /polls\.sendReminder/ }));

    await waitFor(() => expect(peilingenApi.sendPollReminder).toHaveBeenCalledWith('peiling-1'));
    await waitFor(() => expect(toonSucces).toHaveBeenCalledWith('polls.reminderSent'));
  });

  it('biedt bij een gesloten peiling archiveren en een repetitie aanmaken aan', async () => {
    vi.mocked(peilingenApi.getPoll).mockResolvedValue(maakDetail({ status: 'closed' }));
    const gebruiker = userEvent.setup();
    render(<Polls />, { wrapper: wikkel });

    const venster = await openDetail(gebruiker);

    await gebruiker.click(within(venster).getByRole('button', { name: /polls\.createRehearsal/ }));
    await waitFor(() => expect(peilingenApi.createRehearsalFromPoll).toHaveBeenCalledWith('peiling-1'));

    await gebruiker.click(within(venster).getByRole('button', { name: /polls\.archive/ }));
    await waitFor(() => expect(peilingenApi.changePollStatus).toHaveBeenCalledWith('peiling-1', 'archived'));
  });
});

describe('peilingenpagina - stemmen', () => {
  it('brengt één stem uit op een enkelvoudige peiling', async () => {
    const gebruiker = userEvent.setup();
    render(<Polls />, { wrapper: wikkel });

    const detail = await openDetail(gebruiker);
    await gebruiker.click(within(detail).getByRole('button', { name: /polls\.vote$/ }));

    const stemvenster = await screen.findByRole('dialog', { name: 'polls.castVote' });
    // Zonder keuze valt er niets te verzenden.
    expect(within(stemvenster).getByRole('button', { name: /polls\.submitVote/ })).toBeDisabled();

    await gebruiker.click(within(stemvenster).getByRole('radio', { name: /Vrijdag 12 juni/ }));
    await gebruiker.click(within(stemvenster).getByRole('button', { name: /polls\.submitVote/ }));

    await waitFor(() => expect(peilingenApi.submitVote).toHaveBeenCalledWith('peiling-1', { optionIds: ['optie-1'] }));
  });

  it('vervangt bij een enkelvoudige peiling de vorige keuze', async () => {
    const gebruiker = userEvent.setup();
    render(<Polls />, { wrapper: wikkel });

    const detail = await openDetail(gebruiker);
    await gebruiker.click(within(detail).getByRole('button', { name: /polls\.vote$/ }));

    const stemvenster = await screen.findByRole('dialog', { name: 'polls.castVote' });
    await gebruiker.click(within(stemvenster).getByRole('radio', { name: /Vrijdag 12 juni/ }));
    await gebruiker.click(within(stemvenster).getByRole('radio', { name: /Zaterdag 13 juni/ }));
    await gebruiker.click(within(stemvenster).getByRole('button', { name: /polls\.submitVote/ }));

    await waitFor(() => expect(peilingenApi.submitVote).toHaveBeenCalledWith('peiling-1', { optionIds: ['optie-2'] }));
  });

  it('houdt zich bij een meervoudige peiling aan het maximum', async () => {
    vi.mocked(peilingenApi.getPoll).mockResolvedValue(
      maakDetail({
        pollType: 'multiple',
        maxSelections: 1,
      }),
    );
    const gebruiker = userEvent.setup();
    render(<Polls />, { wrapper: wikkel });

    const detail = await openDetail(gebruiker);
    await gebruiker.click(within(detail).getByRole('button', { name: /polls\.vote$/ }));

    const stemvenster = await screen.findByRole('dialog', { name: 'polls.castVote' });
    await gebruiker.click(within(stemvenster).getByRole('checkbox', { name: /Vrijdag 12 juni/ }));
    // De tweede klik valt buiten het maximum en hoort niets te doen.
    await gebruiker.click(within(stemvenster).getByRole('checkbox', { name: /Zaterdag 13 juni/ }));

    expect(within(stemvenster).getByRole('checkbox', { name: /Vrijdag 12 juni/ })).toBeChecked();
    expect(within(stemvenster).getByRole('checkbox', { name: /Zaterdag 13 juni/ })).not.toBeChecked();

    await gebruiker.click(within(stemvenster).getByRole('button', { name: /polls\.submitVote/ }));
    await waitFor(() => expect(peilingenApi.submitVote).toHaveBeenCalledWith('peiling-1', { optionIds: ['optie-1'] }));
  });

  it('meldt het als het stemmen mislukt en houdt het venster open', async () => {
    vi.mocked(peilingenApi.submitVote).mockRejectedValue(new Error('mislukt'));
    const gebruiker = userEvent.setup();
    render(<Polls />, { wrapper: wikkel });

    const detail = await openDetail(gebruiker);
    await gebruiker.click(within(detail).getByRole('button', { name: /polls\.vote$/ }));

    const stemvenster = await screen.findByRole('dialog', { name: 'polls.castVote' });
    await gebruiker.click(within(stemvenster).getByRole('radio', { name: /Vrijdag 12 juni/ }));
    await gebruiker.click(within(stemvenster).getByRole('button', { name: /polls\.submitVote/ }));

    await waitFor(() => expect(toonFout).toHaveBeenCalled());
    expect(await screen.findByRole('dialog', { name: 'polls.castVote' })).toBeInTheDocument();
  });
});

describe('peilingenpagina - aanmaken en bewerken', () => {
  it('maakt een peiling aan met alleen de ingevulde opties', async () => {
    const gebruiker = userEvent.setup();
    render(<Polls />, { wrapper: wikkel });

    await gebruiker.click(await screen.findByRole('button', { name: /polls\.createPoll/ }));
    const formulier = await screen.findByRole('dialog', { name: 'polls.createPoll' });

    const opslaan = within(formulier).getByRole('button', { name: /polls\.createPoll/ });
    // Een peiling zonder titel of met minder dan twee opties gaat niet weg.
    expect(opslaan).toBeDisabled();

    await gebruiker.type(within(formulier).getByPlaceholderText('polls.titlePlaceholder'), 'Zomerprogramma');
    expect(opslaan).toBeDisabled();

    await gebruiker.type(within(formulier).getByPlaceholderText('polls.option 1'), 'Strauss');
    expect(opslaan).toBeDisabled();
    await gebruiker.type(within(formulier).getByPlaceholderText('polls.option 2'), 'Sibelius');

    // Een derde, leeg optieveld hoort niet mee te gaan naar de server.
    await gebruiker.click(within(formulier).getByRole('button', { name: /polls\.addOption/ }));
    expect(within(formulier).getByPlaceholderText('polls.option 3')).toBeInTheDocument();

    expect(opslaan).toBeEnabled();
    await gebruiker.click(opslaan);

    await waitFor(() => expect(peilingenApi.createPoll).toHaveBeenCalled());
    expect(vi.mocked(peilingenApi.createPoll).mock.calls[0][0]).toMatchObject({
      title: 'Zomerprogramma',
      pollType: 'single',
      options: [{ text: 'Strauss' }, { text: 'Sibelius' }],
    });
  });

  it('houdt bij het aanmaken minstens twee optievelden over', async () => {
    const gebruiker = userEvent.setup();
    render(<Polls />, { wrapper: wikkel });

    await gebruiker.click(await screen.findByRole('button', { name: /polls\.createPoll/ }));
    const formulier = await screen.findByRole('dialog', { name: 'polls.createPoll' });

    // Bij twee velden staat er geen verwijderknop per optie; het enige kruisje
    // in beeld is dat van het venster zelf. Pas bij drie opties komen er
    // verwijderknoppen bij.
    expect(within(formulier).getAllByTestId('icon-close')).toHaveLength(1);

    await gebruiker.click(within(formulier).getByRole('button', { name: /polls\.addOption/ }));
    const kruisjes = within(formulier).getAllByTestId('icon-close');
    expect(kruisjes).toHaveLength(4);

    await gebruiker.click(kruisjes[3].closest('button') as HTMLElement);
    expect(within(formulier).queryByPlaceholderText('polls.option 3')).not.toBeInTheDocument();
    // En dan is de verwijderknop per optie weer weg.
    expect(within(formulier).getAllByTestId('icon-close')).toHaveLength(1);
  });

  it('toont het veld voor het maximum alleen bij een meervoudige peiling', async () => {
    const gebruiker = userEvent.setup();
    render(<Polls />, { wrapper: wikkel });

    await gebruiker.click(await screen.findByRole('button', { name: /polls\.createPoll/ }));
    const formulier = await screen.findByRole('dialog', { name: 'polls.createPoll' });

    expect(within(formulier).queryByPlaceholderText('polls.unlimited')).not.toBeInTheDocument();

    await gebruiker.selectOptions(within(formulier).getByDisplayValue('polls.typeSingle'), 'multiple');
    expect(within(formulier).getByPlaceholderText('polls.unlimited')).toBeInTheDocument();
  });

  it('neemt de instellingen uit het aanmaakformulier mee naar de server', async () => {
    const gebruiker = userEvent.setup();
    render(<Polls />, { wrapper: wikkel });

    await gebruiker.click(await screen.findByRole('button', { name: /polls\.createPoll/ }));
    const formulier = await screen.findByRole('dialog', { name: 'polls.createPoll' });

    await gebruiker.type(within(formulier).getByPlaceholderText('polls.titlePlaceholder'), 'Anoniem stemmen');
    await gebruiker.type(within(formulier).getByPlaceholderText('polls.option 1'), 'Ja');
    await gebruiker.type(within(formulier).getByPlaceholderText('polls.option 2'), 'Nee');

    await gebruiker.click(within(formulier).getByRole('checkbox', { name: 'polls.anonymousVoting' }));
    await gebruiker.click(within(formulier).getByRole('checkbox', { name: 'polls.showResultsBeforeClose' }));
    // Deze staat standaard aan; uitzetten hoort ook door te komen.
    await gebruiker.click(within(formulier).getByRole('checkbox', { name: 'polls.allowComments' }));

    await gebruiker.click(within(formulier).getByRole('button', { name: /polls\.createPoll/ }));

    await waitFor(() => expect(peilingenApi.createPoll).toHaveBeenCalled());
    expect(vi.mocked(peilingenApi.createPoll).mock.calls[0][0]).toMatchObject({
      isAnonymous: true,
      showResultsBeforeClose: true,
      allowComments: false,
    });
  });

  it('past de einddatum van een peiling aan', async () => {
    const gebruiker = userEvent.setup();
    render(<Polls />, { wrapper: wikkel });

    const detail = await openDetail(gebruiker);
    await gebruiker.click(within(detail).getByRole('button', { name: /common\.edit/ }));

    const formulier = await screen.findByRole('dialog', { name: 'polls.editPoll' });
    const datumvelden = formulier.querySelectorAll<HTMLInputElement>('input[type="datetime-local"]');
    expect(datumvelden).toHaveLength(2);

    // Het tweede veld is de einddatum; het scherm werkt met lokale tijd en de
    // server krijgt er een ISO-tijd voor terug.
    await gebruiker.type(datumvelden[1], '2026-06-30T23:59');
    await gebruiker.click(within(formulier).getByRole('button', { name: /common\.save/ }));

    await waitFor(() => expect(peilingenApi.updatePoll).toHaveBeenCalled());
    const verstuurd = vi.mocked(peilingenApi.updatePoll).mock.calls[0][1];
    expect(verstuurd.endsAt).toBe(new Date('2026-06-30T23:59').toISOString());
  });

  it('past bij een peiling zonder stemmen het maximum en de anonimiteit aan', async () => {
    vi.mocked(peilingenApi.getPoll).mockResolvedValue(
      maakDetail({ pollType: 'multiple', maxSelections: 2, totalVoters: 0, options: [] }),
    );
    const gebruiker = userEvent.setup();
    render(<Polls />, { wrapper: wikkel });

    const detail = await openDetail(gebruiker);
    await gebruiker.click(within(detail).getByRole('button', { name: /common\.edit/ }));

    const formulier = await screen.findByRole('dialog', { name: 'polls.editPoll' });
    const maximum = within(formulier).getByPlaceholderText('polls.unlimited');
    expect(maximum).toHaveValue(2);

    await gebruiker.clear(maximum);
    await gebruiker.type(maximum, '3');
    await gebruiker.click(within(formulier).getByRole('checkbox', { name: 'polls.anonymousVoting' }));
    await gebruiker.click(within(formulier).getByRole('button', { name: /common\.save/ }));

    await waitFor(() => expect(peilingenApi.updatePoll).toHaveBeenCalled());
    expect(vi.mocked(peilingenApi.updatePoll).mock.calls[0][1]).toMatchObject({ maxSelections: 3, isAnonymous: true });
  });

  it('waarschuwt bij het bewerken van een peiling waarop al gestemd is', async () => {
    vi.mocked(peilingenApi.getPoll).mockResolvedValue(maakDetail({ status: 'active', totalVoters: 7 }));
    const gebruiker = userEvent.setup();
    render(<Polls />, { wrapper: wikkel });

    const detail = await openDetail(gebruiker);
    await gebruiker.click(within(detail).getByRole('button', { name: /common\.edit/ }));

    const formulier = await screen.findByRole('dialog', { name: 'polls.editPoll' });
    expect(within(formulier).getByText('polls.editWarningHasVotes')).toBeInTheDocument();
    // Het soort peiling omgooien zou de bestaande stemmen betekenisloos maken.
    expect(within(formulier).getByDisplayValue('polls.typeSingle')).toBeDisabled();
    expect(within(formulier).getByText('polls.cannotChangeTypeWithVotes')).toBeInTheDocument();
    // Anonimiteit achteraf aanzetten zou de reeds uitgebrachte stemmen met
    // terugwerkende kracht anoniem maken; dat kan dus ook niet meer.
    expect(within(formulier).getByRole('checkbox', { name: 'polls.anonymousVoting' })).toBeDisabled();
  });

  it('slaat een bewerkte peiling op', async () => {
    const gebruiker = userEvent.setup();
    render(<Polls />, { wrapper: wikkel });

    const detail = await openDetail(gebruiker);
    await gebruiker.click(within(detail).getByRole('button', { name: /common\.edit/ }));

    const formulier = await screen.findByRole('dialog', { name: 'polls.editPoll' });
    const titelveld = within(formulier).getByDisplayValue('Datum voorjaarsconcert');
    await gebruiker.clear(titelveld);
    await gebruiker.type(titelveld, 'Datum najaarsconcert');
    await gebruiker.click(within(formulier).getByRole('button', { name: /common\.save/ }));

    await waitFor(() => expect(peilingenApi.updatePoll).toHaveBeenCalled());
    expect(vi.mocked(peilingenApi.updatePoll).mock.calls[0][1]).toMatchObject({ title: 'Datum najaarsconcert' });
  });

  it('slaat een bewerking zonder titel niet op', async () => {
    const gebruiker = userEvent.setup();
    render(<Polls />, { wrapper: wikkel });

    const detail = await openDetail(gebruiker);
    await gebruiker.click(within(detail).getByRole('button', { name: /common\.edit/ }));

    const formulier = await screen.findByRole('dialog', { name: 'polls.editPoll' });
    await gebruiker.clear(within(formulier).getByDisplayValue('Datum voorjaarsconcert'));

    expect(within(formulier).getByRole('button', { name: /common\.save/ })).toBeDisabled();
    expect(peilingenApi.updatePoll).not.toHaveBeenCalled();
  });
});

/**
 * Hieronder staan geen karakteriseringstests maar regressietests: ze leggen
 * gedrag vast zoals het hoort te zijn, na twee reparaties in Polls.tsx.
 */
describe('peilingenpagina - herstelde fouten', () => {
  /**
   * BEWIJS. Zonder de reparatie is deze test rood. Gecontroleerd door Polls.tsx
   * met `git checkout HEAD -- src/pages/Polls.tsx` terug te zetten: de test
   * faalde op "Unable to find an element with the text: common.error", omdat de
   * pagina bij een mislukte aanvraag de lege staat `polls.noPolls` toonde.
   */
  it('toont bij een mislukte aanvraag een melding in plaats van de lege staat', async () => {
    vi.mocked(peilingenApi.getPolls).mockRejectedValue(new Error('geen verbinding'));

    render(<Polls />, { wrapper: wikkel });

    expect(await screen.findByText('common.error')).toBeInTheDocument();
    // "Er zijn geen peilingen" zou hier liegen: er is niets opgehaald.
    expect(screen.queryByText('polls.noPolls')).not.toBeInTheDocument();
    // De gebruiker kan het zelf opnieuw proberen.
    expect(screen.getByRole('button', { name: /common\.retry/ })).toBeInTheDocument();
    // En de pagina zelf blijft staan: geen wit scherm.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('polls.title');
  });

  it('probeert het na een druk op de knop opnieuw', async () => {
    vi.mocked(peilingenApi.getPolls).mockRejectedValueOnce(new Error('geen verbinding'));
    const gebruiker = userEvent.setup();
    render(<Polls />, { wrapper: wikkel });

    await gebruiker.click(await screen.findByRole('button', { name: /common\.retry/ }));

    expect(await screen.findByRole('heading', { name: 'Datum voorjaarsconcert', level: 3 })).toBeInTheDocument();
  });

  /**
   * BEWIJS. Zonder de reparatie is deze test rood. Gecontroleerd met de oude
   * Polls.tsx: het aantal aanroepen was 8 (één bij het openen en één per
   * toetsaanslag) in plaats van 2, omdat `searchTerm` ongedempt in de queryKey
   * zat.
   */
  it('stuurt de zoekterm pas mee na de ontdubbeling', async () => {
    const gebruiker = userEvent.setup();
    render(<Polls />, { wrapper: wikkel });

    const zoekveld = await screen.findByPlaceholderText('polls.searchPlaceholder');
    await gebruiker.type(zoekveld, 'concert');

    await waitFor(() => expect(peilingenApi.getPolls).toHaveBeenCalledWith({ status: undefined, search: 'concert' }), {
      timeout: 2000,
    });
    expect(vi.mocked(peilingenApi.getPolls).mock.calls).toHaveLength(2);
  });
});
