/**
 * Eerste tests op de berichtenpagina.
 *
 * Posts.tsx was 0 procent gedekt: 135 statements, verdeeld over de lijst en
 * drie vensters - het leesscherm met reacties, het aanmaakformulier en het
 * bewerkformulier. Geen enkele regel werd door een test aangeraakt.
 *
 * De aanleiding is een fout aan de serverkant: `GET /posts` vergeleek een
 * ISO-tijd als tekst met `datetime('now')`, waardoor berichten van vandaag voor
 * gewone leden onzichtbaar waren. Die is gerepareerd. Wat een gebruiker toen
 * zag was een lege lijst, en dat is precies wat hier vastligt: hoe de pagina
 * zich gedraagt als er niets terugkomt, en - even belangrijk - hoe ze zich
 * gedraagt als er niets terugkomt omdat het ophalen mislukte. Die twee zagen er
 * tot nu toe hetzelfde uit; zie de regressietests onderaan.
 *
 * Verder ligt hier vast:
 *   - Een gewoon lid ziet geen statusfilter en geen statuslabels. Concepten
 *     horen niet in beeld te komen, en het scherm hoort er ook niet naar te
 *     verwijzen.
 *   - Berichten in html-opmaak worden geschoond voor ze getekend worden.
 *   - Een gepland bericht kan niet zonder publicatiedatum verstuurd worden.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import Posts from '../Posts';
import * as berichtenApi from '../../api/posts';
import type { Post, PostDetail, PostCategory } from '../../api/posts';

vi.mock('../../api/posts');

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

// De rol bepaalt welke knoppen en filters er staan; per test overschrijven we hem.
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

vi.mock('../../components/PostCategoriesManager', () => ({
  PostCategoriesManager: () => <div data-testid="categoriebeheer" />,
}));

const toonFout = vi.fn();
const toonSucces = vi.fn();
vi.mock('../../utils/toast', () => ({
  showSuccess: (bericht: string) => toonSucces(bericht),
  showError: (bericht: string) => toonFout(bericht),
}));

const CATEGORIEEN: PostCategory[] = [
  {
    id: 'cat-1',
    name: 'Mededelingen',
    slug: 'mededelingen',
    color: '#336699',
    sortOrder: 1,
    postCount: 4,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'cat-2',
    name: 'Concerten',
    slug: 'concerten',
    sortOrder: 2,
    postCount: 2,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

function maakBericht(overschrijving: Partial<Post> = {}): Post {
  return {
    id: 'bericht-1',
    title: 'Repetitie verplaatst',
    slug: 'repetitie-verplaatst',
    excerpt: 'De repetitie van woensdag gaat naar donderdag.',
    status: 'published',
    isPinned: false,
    isFeatured: false,
    allowComments: true,
    viewCount: 42,
    authorId: 'u-admin',
    authorName: 'Beheerder',
    publishedAt: '2026-08-23T08:00:00.000Z',
    createdAt: '2026-08-23T07:00:00.000Z',
    categories: [{ id: 'cat-1', name: 'Mededelingen', slug: 'mededelingen', color: '#336699' }],
    commentCount: 2,
    isRead: false,
    ...overschrijving,
  };
}

function maakDetail(overschrijving: Partial<PostDetail> = {}): PostDetail {
  return {
    id: 'bericht-1',
    title: 'Repetitie verplaatst',
    slug: 'repetitie-verplaatst',
    excerpt: 'De repetitie van woensdag gaat naar donderdag.',
    status: 'published',
    isPinned: false,
    isFeatured: false,
    allowComments: true,
    viewCount: 42,
    authorId: 'u-admin',
    authorName: 'Beheerder',
    publishedAt: '2026-08-23T08:00:00.000Z',
    createdAt: '2026-08-23T07:00:00.000Z',
    updatedAt: '2026-08-23T07:00:00.000Z',
    categories: [{ id: 'cat-1', name: 'Mededelingen', slug: 'mededelingen', color: '#336699' }],
    content: 'De repetitie van woensdag gaat naar donderdag 20:00 uur.',
    contentFormat: 'markdown',
    comments: [],
    ...overschrijving,
  };
}

const BERICHTEN: Post[] = [
  maakBericht(),
  maakBericht({
    id: 'bericht-2',
    title: 'Kerstconcert in voorbereiding',
    slug: 'kerstconcert',
    excerpt: undefined,
    status: 'draft',
    isPinned: true,
    viewCount: 0,
    publishedAt: undefined,
    categories: [],
    allowComments: false,
  }),
];

function zetApiKlaar(): void {
  const leeg = vi.fn().mockResolvedValue({ message: 'ok' });
  for (const naam of Object.keys(berichtenApi)) {
    const functie = (berichtenApi as Record<string, unknown>)[naam];
    if (typeof functie === 'function') {
      vi.mocked(functie as (...args: unknown[]) => unknown).mockImplementation(leeg);
    }
  }
  vi.mocked(berichtenApi.getPosts).mockResolvedValue(BERICHTEN);
  vi.mocked(berichtenApi.getPostCategories).mockResolvedValue(CATEGORIEEN);
  vi.mocked(berichtenApi.getPost).mockResolvedValue(maakDetail());
}

function wikkel({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Opent het leesscherm van een bericht en geeft dat venster terug. */
async function openBericht(gebruiker: ReturnType<typeof userEvent.setup>, titel = 'Repetitie verplaatst') {
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

describe('berichtenpagina - de lijst', () => {
  it('toont de berichten die de server stuurt', async () => {
    render(<Posts />, { wrapper: wikkel });

    expect(await screen.findByRole('heading', { name: 'Repetitie verplaatst', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Kerstconcert in voorbereiding', level: 3 })).toBeInTheDocument();
    expect(screen.getByText('De repetitie van woensdag gaat naar donderdag.')).toBeInTheDocument();
    expect(screen.getAllByText('Beheerder')).toHaveLength(2);

    // "Mededelingen" staat zowel in het categoriefilter als op de kaart zelf;
    // hier gaat het om die op de kaart.
    const kaart = screen.getByRole('heading', { name: 'Repetitie verplaatst', level: 3 }).parentElement as HTMLElement;
    const kaartlichaam = kaart.parentElement as HTMLElement;
    expect(within(kaartlichaam).getByText('Mededelingen')).toBeInTheDocument();
    expect(within(kaartlichaam).getByText('42')).toBeInTheDocument();
  });

  it('vraagt zonder ingevulde filters geen enkel filter aan de server', async () => {
    render(<Posts />, { wrapper: wikkel });

    await waitFor(() => expect(berichtenApi.getPosts).toHaveBeenCalled());

    // Lege strings zouden door de server als echte filters gelezen worden.
    expect(berichtenApi.getPosts).toHaveBeenCalledWith({
      status: undefined,
      category: undefined,
      search: undefined,
    });
  });

  /**
   * Dit is het scherm dat de aanleiding was: aan de serverkant vielen de
   * berichten van vandaag weg, en de gebruiker keek naar een lege lijst. Hoe
   * dat scherm eruitziet ligt hier vast - de pagina zelf blijft staan, met een
   * uitleg in plaats van niets.
   */
  it('geeft de lege staat als de server geen berichten stuurt', async () => {
    vi.mocked(berichtenApi.getPosts).mockResolvedValue([]);

    render(<Posts />, { wrapper: wikkel });

    expect(await screen.findByText('posts.noPosts')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('posts.title');
    expect(screen.getByPlaceholderText('posts.searchPlaceholder')).toBeInTheDocument();
    // De categorieën blijven gewoon beschikbaar; de lijst is leeg, de pagina niet.
    expect(screen.getByRole('option', { name: 'Concerten' })).toBeInTheDocument();
  });

  it('toont de skeletweergave zolang de berichten nog laden', async () => {
    let losmaken: (berichten: Post[]) => void = () => {};
    vi.mocked(berichtenApi.getPosts).mockReturnValue(
      new Promise<Post[]>((resolve) => {
        losmaken = resolve;
      }),
    );

    render(<Posts />, { wrapper: wikkel });

    expect(await screen.findByTestId('skelet-tabel')).toBeInTheDocument();

    losmaken(BERICHTEN);
    await waitFor(() => expect(screen.queryByTestId('skelet-tabel')).not.toBeInTheDocument());
  });

  it('haalt geen bericht op zolang er geen bericht gekozen is', async () => {
    render(<Posts />, { wrapper: wikkel });

    await screen.findByRole('heading', { name: 'Repetitie verplaatst', level: 3 });

    expect(berichtenApi.getPost).not.toHaveBeenCalled();
  });

  it('geeft een beheerder het statusfilter en de statuslabels', async () => {
    render(<Posts />, { wrapper: wikkel });

    await screen.findByRole('heading', { name: 'Repetitie verplaatst', level: 3 });

    expect(screen.getByText('posts.filterStatus')).toBeInTheDocument();

    // Het statuslabel op de kaart, niet de gelijknamige optie in het filter.
    const gepubliceerd = screen.getByRole('heading', { name: 'Repetitie verplaatst', level: 3 })
      .parentElement as HTMLElement;
    expect(within(gepubliceerd).getByText('posts.status.published')).toBeInTheDocument();
    const concept = screen.getByRole('heading', { name: 'Kerstconcert in voorbereiding', level: 3 })
      .parentElement as HTMLElement;
    expect(within(concept).getByText('posts.status.draft')).toBeInTheDocument();
  });

  it('houdt het statusfilter en de statuslabels weg bij een gewoon lid', async () => {
    huidigeGebruiker.rol = 'member';
    // Wat de server aan een gewoon lid stuurt bevat geen concepten; het scherm
    // hoort er ook niet naar te verwijzen.
    vi.mocked(berichtenApi.getPosts).mockResolvedValue([maakBericht()]);

    render(<Posts />, { wrapper: wikkel });

    await screen.findByRole('heading', { name: 'Repetitie verplaatst', level: 3 });

    expect(screen.queryByText('posts.filterStatus')).not.toBeInTheDocument();
    expect(screen.queryByText('posts.status.published')).not.toBeInTheDocument();
    expect(screen.queryByText('posts.status.draft')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /posts\.createPost/ })).not.toBeInTheDocument();
    // Het categoriefilter en het zoekveld blijven wel gewoon staan.
    expect(screen.getByText('posts.filterCategory')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('posts.searchPlaceholder')).toBeInTheDocument();
  });

  it('stuurt de gekozen categorie mee als filter', async () => {
    const gebruiker = userEvent.setup();
    render(<Posts />, { wrapper: wikkel });

    await screen.findByRole('heading', { name: 'Repetitie verplaatst', level: 3 });
    const categoriefilter = screen.getByRole('option', { name: 'Concerten' }).closest('select') as HTMLSelectElement;
    await gebruiker.selectOptions(categoriefilter, 'cat-2');

    await waitFor(() =>
      expect(berichtenApi.getPosts).toHaveBeenCalledWith({
        status: undefined,
        category: 'cat-2',
        search: undefined,
      }),
    );
  });

  it('stuurt de gekozen status mee als filter', async () => {
    const gebruiker = userEvent.setup();
    render(<Posts />, { wrapper: wikkel });

    await screen.findByRole('heading', { name: 'Repetitie verplaatst', level: 3 });
    const statusfilter = screen.getByRole('option', { name: 'posts.status.scheduled' }).closest('select');
    await gebruiker.selectOptions(statusfilter as HTMLSelectElement, 'draft');

    await waitFor(() =>
      expect(berichtenApi.getPosts).toHaveBeenCalledWith({
        status: 'draft',
        category: undefined,
        search: undefined,
      }),
    );
  });

  it('opent het categoriebeheer voor een beheerder', async () => {
    const gebruiker = userEvent.setup();
    render(<Posts />, { wrapper: wikkel });

    await gebruiker.click(await screen.findByRole('button', { name: /posts\.categories\.title/ }));

    expect(await screen.findByTestId('categoriebeheer')).toBeInTheDocument();
  });
});

describe('berichtenpagina - het leesscherm', () => {
  it('haalt het bericht op en toont de inhoud na een klik', async () => {
    const gebruiker = userEvent.setup();
    render(<Posts />, { wrapper: wikkel });

    const venster = await openBericht(gebruiker);

    await waitFor(() => expect(berichtenApi.getPost).toHaveBeenCalledWith('bericht-1'));
    expect(within(venster).getByText('De repetitie van woensdag gaat naar donderdag 20:00 uur.')).toBeInTheDocument();
    expect(within(venster).getByText('Beheerder')).toBeInTheDocument();
    expect(within(venster).getByText(/42/)).toBeInTheDocument();
  });

  it('schoont een bericht in html-opmaak voor het getekend wordt', async () => {
    vi.mocked(berichtenApi.getPost).mockResolvedValue(
      maakDetail({
        contentFormat: 'html',
        content: '<p>Neem je <strong>partituur</strong> mee.</p><script>window.gestolen = true;</script>',
      }),
    );
    const gebruiker = userEvent.setup();
    render(<Posts />, { wrapper: wikkel });

    const venster = await openBericht(gebruiker);

    // De opmaak blijft, het script niet. Berichten worden door mensen
    // geschreven; wat er in de inhoud staat mag nooit als code draaien.
    expect(within(venster).getByText('partituur')).toBeInTheDocument();
    expect(venster.querySelector('script')).toBeNull();
    expect(venster.innerHTML).not.toContain('gestolen');
  });

  it('toont de reacties en plaatst een nieuwe', async () => {
    vi.mocked(berichtenApi.getPost).mockResolvedValue(
      maakDetail({
        comments: [
          {
            id: 'reactie-1',
            content: 'Fijn dat het doorgaat',
            authorId: 'u2',
            authorName: 'Marieke',
            isApproved: true,
            createdAt: '2026-08-23T09:00:00.000Z',
            updatedAt: '2026-08-23T09:00:00.000Z',
          },
        ],
      }),
    );
    const gebruiker = userEvent.setup();
    render(<Posts />, { wrapper: wikkel });

    const venster = await openBericht(gebruiker);
    expect(within(venster).getByText('Fijn dat het doorgaat')).toBeInTheDocument();
    expect(within(venster).getByText('Marieke')).toBeInTheDocument();

    await gebruiker.type(within(venster).getByPlaceholderText('posts.addCommentPlaceholder'), 'Tot donderdag');
    await gebruiker.click(within(venster).getByTestId('icon-send'));

    await waitFor(() =>
      expect(berichtenApi.addPostComment).toHaveBeenCalledWith('bericht-1', { content: 'Tot donderdag' }),
    );
  });

  it('meldt dat er nog geen reacties zijn en houdt de verzendknop uit', async () => {
    const gebruiker = userEvent.setup();
    render(<Posts />, { wrapper: wikkel });

    const venster = await openBericht(gebruiker);

    expect(within(venster).getByText('posts.noComments')).toBeInTheDocument();
    expect(within(venster).getByTestId('icon-send').closest('button')).toBeDisabled();
  });

  it('laat de reactiesectie weg als reacties uit staan', async () => {
    vi.mocked(berichtenApi.getPost).mockResolvedValue(maakDetail({ allowComments: false }));
    const gebruiker = userEvent.setup();
    render(<Posts />, { wrapper: wikkel });

    const venster = await openBericht(gebruiker);

    expect(within(venster).queryByText('posts.comments')).not.toBeInTheDocument();
    expect(within(venster).queryByPlaceholderText('posts.addCommentPlaceholder')).not.toBeInTheDocument();
  });

  it('geeft een gewoon lid alleen bij de eigen reactie een verwijderknop', async () => {
    huidigeGebruiker.rol = 'member';
    huidigeGebruiker.id = 'u2';
    vi.mocked(berichtenApi.getPost).mockResolvedValue(
      maakDetail({
        comments: [
          {
            id: 'reactie-1',
            content: 'Van iemand anders',
            authorId: 'u9',
            authorName: 'Piet',
            isApproved: true,
            createdAt: '2026-08-23T09:00:00.000Z',
            updatedAt: '2026-08-23T09:00:00.000Z',
          },
          {
            id: 'reactie-2',
            content: 'Van mijzelf',
            authorId: 'u2',
            authorName: 'Marieke',
            isApproved: true,
            createdAt: '2026-08-23T10:00:00.000Z',
            updatedAt: '2026-08-23T10:00:00.000Z',
          },
        ],
      }),
    );
    const gebruiker = userEvent.setup();
    render(<Posts />, { wrapper: wikkel });

    const venster = await openBericht(gebruiker);

    // Eén prullenbak, en die hoort bij de eigen reactie.
    const prullenbakken = within(venster).getAllByTestId('icon-trash');
    expect(prullenbakken).toHaveLength(1);

    await gebruiker.click(prullenbakken[0].closest('button') as HTMLElement);
    await waitFor(() => expect(berichtenApi.deletePostComment).toHaveBeenCalledWith('bericht-1', 'reactie-2'));
  });

  it('geeft een gewoon lid geen knoppen om het bericht te bewerken of te verwijderen', async () => {
    huidigeGebruiker.rol = 'member';
    const gebruiker = userEvent.setup();
    render(<Posts />, { wrapper: wikkel });

    const venster = await openBericht(gebruiker);

    expect(within(venster).queryByRole('button', { name: /common\.edit/ })).not.toBeInTheDocument();
    expect(within(venster).queryByRole('button', { name: /common\.delete/ })).not.toBeInTheDocument();
  });

  it('verwijdert een bericht pas na bevestiging', async () => {
    bevestiging.antwoord = false;
    const gebruiker = userEvent.setup();
    render(<Posts />, { wrapper: wikkel });

    const venster = await openBericht(gebruiker);
    await gebruiker.click(within(venster).getByRole('button', { name: /common\.delete/ }));
    await waitFor(() => expect(berichtenApi.deletePost).not.toHaveBeenCalled());

    bevestiging.antwoord = true;
    await gebruiker.click(within(venster).getByRole('button', { name: /common\.delete/ }));

    // react-query geeft de mutatiefunctie naast het bericht ook zijn eigen
    // context mee; alleen het eerste argument is van de pagina.
    await waitFor(() => expect(berichtenApi.deletePost).toHaveBeenCalled());
    expect(vi.mocked(berichtenApi.deletePost).mock.calls[0][0]).toBe('bericht-1');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

describe('berichtenpagina - aanmaken en bewerken', () => {
  it('maakt een bericht aan met titel, inhoud en categorie', async () => {
    const gebruiker = userEvent.setup();
    render(<Posts />, { wrapper: wikkel });

    await gebruiker.click(await screen.findByRole('button', { name: /posts\.createPost/ }));
    const formulier = await screen.findByRole('dialog', { name: 'posts.createPost' });

    const opslaan = within(formulier).getByRole('button', { name: /posts\.createPost/ });
    expect(opslaan).toBeDisabled();

    await gebruiker.type(within(formulier).getByPlaceholderText('posts.titlePlaceholder'), 'Zomerstop');
    // Alleen een titel is niet genoeg; de inhoud is net zo verplicht.
    expect(opslaan).toBeDisabled();

    await gebruiker.type(
      within(formulier).getByPlaceholderText('posts.contentPlaceholder'),
      'Wij zijn er in juli niet.',
    );
    expect(opslaan).toBeEnabled();

    await gebruiker.click(within(formulier).getByText('Concerten'));
    await gebruiker.click(opslaan);

    await waitFor(() => expect(berichtenApi.createPost).toHaveBeenCalled());
    expect(vi.mocked(berichtenApi.createPost).mock.calls[0][0]).toMatchObject({
      title: 'Zomerstop',
      content: 'Wij zijn er in juli niet.',
      status: 'draft',
      categoryIds: ['cat-2'],
    });
  });

  it('meldt het als het aanmaken mislukt en houdt het formulier open', async () => {
    vi.mocked(berichtenApi.createPost).mockRejectedValue(new Error('mislukt'));
    const gebruiker = userEvent.setup();
    render(<Posts />, { wrapper: wikkel });

    await gebruiker.click(await screen.findByRole('button', { name: /posts\.createPost/ }));
    const formulier = await screen.findByRole('dialog', { name: 'posts.createPost' });

    await gebruiker.type(within(formulier).getByPlaceholderText('posts.titlePlaceholder'), 'Zomerstop');
    await gebruiker.type(within(formulier).getByPlaceholderText('posts.contentPlaceholder'), 'Tekst');
    await gebruiker.click(within(formulier).getByRole('button', { name: /posts\.createPost/ }));

    await waitFor(() => expect(toonFout).toHaveBeenCalled());
    expect(await screen.findByRole('dialog', { name: 'posts.createPost' })).toBeInTheDocument();
  });

  it('vult het bewerkformulier met het bestaande bericht en slaat het op', async () => {
    const gebruiker = userEvent.setup();
    render(<Posts />, { wrapper: wikkel });

    const venster = await openBericht(gebruiker);
    await gebruiker.click(within(venster).getByRole('button', { name: /common\.edit/ }));

    const formulier = await screen.findByRole('dialog', { name: 'posts.editPost' });
    const titelveld = within(formulier).getByDisplayValue('Repetitie verplaatst');
    expect(within(formulier).getByDisplayValue('De repetitie van woensdag gaat naar donderdag 20:00 uur.'));

    await gebruiker.clear(titelveld);
    await gebruiker.type(titelveld, 'Repetitie toch niet verplaatst');
    await gebruiker.click(within(formulier).getByRole('button', { name: /common\.save/ }));

    await waitFor(() => expect(berichtenApi.updatePost).toHaveBeenCalled());
    expect(vi.mocked(berichtenApi.updatePost).mock.calls[0][1]).toMatchObject({
      title: 'Repetitie toch niet verplaatst',
      categoryIds: ['cat-1'],
    });
  });

  it('slaat een bewerking zonder inhoud niet op', async () => {
    const gebruiker = userEvent.setup();
    render(<Posts />, { wrapper: wikkel });

    const venster = await openBericht(gebruiker);
    await gebruiker.click(within(venster).getByRole('button', { name: /common\.edit/ }));

    const formulier = await screen.findByRole('dialog', { name: 'posts.editPost' });
    await gebruiker.clear(
      within(formulier).getByDisplayValue('De repetitie van woensdag gaat naar donderdag 20:00 uur.'),
    );

    expect(within(formulier).getByRole('button', { name: /common\.save/ })).toBeDisabled();
    expect(berichtenApi.updatePost).not.toHaveBeenCalled();
  });

  it('zet de vinkjes uit het bewerkformulier door naar de server', async () => {
    const gebruiker = userEvent.setup();
    render(<Posts />, { wrapper: wikkel });

    const venster = await openBericht(gebruiker);
    await gebruiker.click(within(venster).getByRole('button', { name: /common\.edit/ }));

    const formulier = await screen.findByRole('dialog', { name: 'posts.editPost' });
    await gebruiker.click(within(formulier).getByRole('checkbox', { name: 'posts.pinPost' }));
    await gebruiker.click(within(formulier).getByRole('checkbox', { name: 'posts.featurePost' }));
    await gebruiker.click(within(formulier).getByRole('checkbox', { name: 'posts.allowComments' }));
    await gebruiker.selectOptions(within(formulier).getByDisplayValue('posts.status.published'), 'archived');
    await gebruiker.click(within(formulier).getByRole('button', { name: /common\.save/ }));

    await waitFor(() => expect(berichtenApi.updatePost).toHaveBeenCalled());
    expect(vi.mocked(berichtenApi.updatePost).mock.calls[0][1]).toMatchObject({
      isPinned: true,
      isFeatured: true,
      allowComments: false,
      status: 'archived',
    });
  });
});

/**
 * Hieronder staan geen karakteriseringstests maar regressietests: ze leggen
 * gedrag vast zoals het hoort te zijn, na drie reparaties in Posts.tsx.
 */
describe('berichtenpagina - herstelde fouten', () => {
  /**
   * BEWIJS. Zonder de reparatie is deze test rood. Gecontroleerd door Posts.tsx
   * met `git checkout HEAD -- src/pages/Posts.tsx` terug te zetten: de test
   * faalde op "Unable to find an element with the text: common.error", omdat de
   * pagina bij een mislukte aanvraag `posts.noPosts` toonde - hetzelfde scherm
   * als bij een echt lege lijst, en dus precies wat de gebruiker zag toen de
   * server de berichten van vandaag wegfilterde.
   */
  it('toont bij een mislukte aanvraag een melding in plaats van de lege staat', async () => {
    vi.mocked(berichtenApi.getPosts).mockRejectedValue(new Error('geen verbinding'));

    render(<Posts />, { wrapper: wikkel });

    expect(await screen.findByText('common.error')).toBeInTheDocument();
    // "Er zijn geen berichten" zou hier liegen: er is niets opgehaald.
    expect(screen.queryByText('posts.noPosts')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /common\.retry/ })).toBeInTheDocument();
    // En de pagina zelf blijft staan: geen wit scherm.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('posts.title');
  });

  it('probeert het na een druk op de knop opnieuw', async () => {
    vi.mocked(berichtenApi.getPosts).mockRejectedValueOnce(new Error('geen verbinding'));
    const gebruiker = userEvent.setup();
    render(<Posts />, { wrapper: wikkel });

    await gebruiker.click(await screen.findByRole('button', { name: /common\.retry/ }));

    expect(await screen.findByRole('heading', { name: 'Repetitie verplaatst', level: 3 })).toBeInTheDocument();
  });

  /**
   * BEWIJS. Zonder de reparatie is deze test rood. Gecontroleerd met de oude
   * Posts.tsx: het aantal aanroepen was 6 (één bij het openen en één per
   * toetsaanslag) in plaats van 2, omdat `searchTerm` ongedempt in de queryKey
   * zat.
   */
  it('stuurt de zoekterm pas mee na de ontdubbeling', async () => {
    const gebruiker = userEvent.setup();
    render(<Posts />, { wrapper: wikkel });

    const zoekveld = await screen.findByPlaceholderText('posts.searchPlaceholder');
    await gebruiker.type(zoekveld, 'zomer');

    await waitFor(
      () =>
        expect(berichtenApi.getPosts).toHaveBeenCalledWith({
          status: undefined,
          category: undefined,
          search: 'zomer',
        }),
      { timeout: 2000 },
    );
    expect(vi.mocked(berichtenApi.getPosts).mock.calls).toHaveLength(2);
  });

  /**
   * BEWIJS. Zonder de reparatie is deze test rood. Gecontroleerd met de oude
   * Posts.tsx: de knop was gewoon klikbaar, en het bericht ging zonder datum
   * naar de server. Die weigert het met 400 ("Publicatiedatum is verplicht voor
   * geplande berichten"), dus de gebruiker kreeg een foutmelding voor iets wat
   * het scherm zelf al wist.
   */
  it('verstuurt geen gepland bericht zonder publicatiedatum', async () => {
    const gebruiker = userEvent.setup();
    render(<Posts />, { wrapper: wikkel });

    await gebruiker.click(await screen.findByRole('button', { name: /posts\.createPost/ }));
    const formulier = await screen.findByRole('dialog', { name: 'posts.createPost' });

    await gebruiker.type(within(formulier).getByPlaceholderText('posts.titlePlaceholder'), 'Aankondiging');
    await gebruiker.type(within(formulier).getByPlaceholderText('posts.contentPlaceholder'), 'Volgende week meer.');

    const opslaan = within(formulier).getByRole('button', { name: /posts\.createPost/ });
    expect(opslaan).toBeEnabled();

    await gebruiker.selectOptions(within(formulier).getByDisplayValue('posts.status.draft'), 'scheduled');

    // Het datumveld verschijnt pas bij een gepland bericht, en zolang het leeg
    // is kan het bericht niet weg.
    const datumveld = formulier.querySelector<HTMLInputElement>('input[type="datetime-local"]');
    expect(datumveld).not.toBeNull();
    expect(opslaan).toBeDisabled();

    await gebruiker.type(datumveld as HTMLInputElement, '2026-09-01T09:00');
    expect(opslaan).toBeEnabled();

    await gebruiker.click(opslaan);
    await waitFor(() => expect(berichtenApi.createPost).toHaveBeenCalled());
    expect(vi.mocked(berichtenApi.createPost).mock.calls[0][0]).toMatchObject({
      status: 'scheduled',
      scheduledAt: new Date('2026-09-01T09:00').toISOString(),
    });
  });
});
