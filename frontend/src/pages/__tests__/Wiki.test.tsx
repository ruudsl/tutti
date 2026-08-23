/**
 * Tests voor de wikipagina.
 *
 * Deze pagina was nog nooit getest. De tests hieronder lopen af wat een
 * gebruiker doet: door de paginaboom bladeren, zoeken, een pagina lezen, en -
 * als hij mag - pagina's aanmaken, bewerken, terugzetten en verwijderen.
 *
 * Wat hier bewust vastligt:
 *   - Een slug in de adresbalk die niet bestaat geeft "pagina niet gevonden",
 *     geen lege of witte pagina.
 *   - Er wordt pas gezocht vanaf twee tekens. Zonder die grens gaat er per
 *     toetsaanslag een verzoek uit, ook op één letter.
 *   - Wie wat mag. Bewerken is voor beheer, muziekcommissie en bestuur;
 *     verwijderen alleen voor beheer.
 *   - Dat een mislukt verzoek een melding geeft en het scherm laat staan.
 *
 * ECHTE FOUT, gerepareerd en bewezen - zie de test "opent een nieuwe pagina met
 * een leeg formulier nadat er net een pagina bewerkt is". `formData` is één
 * toestand voor twee schermen: het nieuwformulier en het bewerkformulier.
 * Alleen het nieuwformulier maakte hem bij het sluiten weer leeg. Wie een
 * bestaande pagina opende om te bewerken en dat scherm sloot, hield titel,
 * slug en inhoud van die pagina in de toestand; de volgende klik op "pagina
 * toevoegen" gaf dan een "nieuwe" pagina die al gevuld was met de vorige.
 * Bewijs: met `git checkout HEAD --` op alleen Wiki.tsx faalt die test met een
 * titelveld dat "Repetitieschema" bevat in plaats van leeg te zijn.
 *
 * Bewust NIET aangepakt: de labels in het aanmaak- en bewerkformulier staan
 * los naast hun veld, zonder `htmlFor`/`id`. Daarom zoeken de tests hieronder
 * die velden op rol en volgorde in plaats van op label. Dat is dezelfde
 * koppeling die elders in deze map onder "Labelkoppeling" wordt rechtgezet;
 * dat is een eigen ingreep en hoort niet in een dekkingsronde thuis.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// `delay: null` zet de wachttijd tussen toetsaanslagen uit. Met de standaard
// vertraging tikt userEvent teken voor teken met een pauze ertussen, en dan
// lopen de langere formuliertests op een belaste machine over de tijdslimiet
// van vijf seconden heen. Het gedrag dat getest wordt verandert er niet door.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import Wiki from '../Wiki';
import type { WikiAttachment, WikiPage, WikiPageDetail, WikiVersion } from '../../api/wiki';

vi.mock('../../api/wiki');

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

const bevestig = vi.fn<(vraag: unknown) => Promise<boolean>>();
vi.mock('../../hooks/useConfirm', () => ({ useConfirm: () => bevestig }));

const huidigeGebruiker: { rol: string } = { rol: 'admin' };
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u-1', role: huidigeGebruiker.rol } }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../utils/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));

vi.mock('../../components/Skeleton', () => ({
  SkeletonTable: () => <div data-testid="skelet-tabel" />,
}));

vi.mock('../../components/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icoon-${name}`} />,
}));

vi.mock('../../components/MarkdownPreview', () => ({
  MarkdownPreview: ({ content }: { content: string }) => <div data-testid="inhoud">{content}</div>,
}));

import * as wikiApi from '../../api/wiki';
import { showError, showSuccess } from '../../utils/toast';

const KIND: WikiPage = {
  id: 'p-2',
  slug: 'repetitieschema',
  title: 'Repetitieschema',
  visibility: 'members',
  isPinned: false,
  isPublished: true,
  sortOrder: 1,
  viewCount: 3,
  updatedAt: '2026-02-02T10:00:00Z',
  children: [],
};

const BOOM: WikiPage[] = [
  {
    id: 'p-1',
    slug: 'huisregels',
    title: 'Huisregels',
    visibility: 'members',
    isPinned: true,
    isPublished: true,
    sortOrder: 0,
    viewCount: 12,
    updatedAt: '2026-02-01T10:00:00Z',
    children: [KIND],
  },
];

function maakDetail(overschrijving: Partial<WikiPageDetail> = {}): WikiPageDetail {
  return {
    ...BOOM[0],
    content: '# Huisregels\n\nWees aardig.',
    allowComments: true,
    createdBy: 'u-9',
    createdByName: 'Beheerder',
    updatedByName: 'Anna',
    createdAt: '2026-01-01T10:00:00Z',
    breadcrumbs: [],
    children: [],
    ...overschrijving,
  };
}

const VERSIES: WikiVersion[] = [
  {
    id: 'v-2',
    versionNumber: 2,
    title: 'Huisregels',
    changeSummary: 'Tekst bijgewerkt',
    createdBy: 'u-1',
    createdByName: 'Anna',
    createdAt: '2026-02-01T10:00:00Z',
  },
  {
    id: 'v-1',
    versionNumber: 1,
    title: 'Huisregels',
    createdBy: 'u-9',
    createdByName: 'Beheerder',
    createdAt: '2026-01-01T10:00:00Z',
  },
];

const BIJLAGEN: WikiAttachment[] = [
  {
    id: 'b-1',
    filename: 'plattegrond.png',
    originalFilename: 'plattegrond.png',
    mimeType: 'image/png',
    fileSize: 2048,
    url: '/uploads/plattegrond.png',
    uploadedBy: 'u-1',
    uploadedAt: '2026-02-01T10:00:00Z',
  },
  {
    id: 'b-2',
    filename: 'reglement.pdf',
    originalFilename: 'reglement.pdf',
    mimeType: 'application/pdf',
    fileSize: 5120,
    url: '/uploads/reglement.pdf',
    uploadedBy: 'u-1',
    uploadedAt: '2026-02-01T10:00:00Z',
  },
];

function zetApiKlaar(): void {
  vi.mocked(wikiApi.getWikiPages).mockResolvedValue(BOOM);
  vi.mocked(wikiApi.getWikiPage).mockResolvedValue(maakDetail());
  vi.mocked(wikiApi.searchWikiPages).mockResolvedValue([]);
  vi.mocked(wikiApi.getWikiPageVersions).mockResolvedValue(VERSIES);
  vi.mocked(wikiApi.getWikiAttachments).mockResolvedValue([]);
  vi.mocked(wikiApi.createWikiPage).mockResolvedValue({ id: 'p-9', slug: 'nieuw', message: 'ok' });
  vi.mocked(wikiApi.updateWikiPage).mockResolvedValue({ message: 'ok' });
  vi.mocked(wikiApi.deleteWikiPage).mockResolvedValue({ message: 'ok' });
  vi.mocked(wikiApi.restoreWikiPageVersion).mockResolvedValue({ message: 'ok' });
  vi.mocked(wikiApi.uploadWikiAttachment).mockResolvedValue({ id: 'b-9', url: '/uploads/x', message: 'ok' });
  vi.mocked(wikiApi.deleteWikiAttachment).mockResolvedValue({ message: 'ok' });
}

function maakWikkel(startAdres: string) {
  return function Wikkel({ children }: { children: ReactNode }) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    return (
      <MemoryRouter initialEntries={[startAdres]}>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </MemoryRouter>
    );
  };
}

/** Tekent de pagina en wacht tot de zijbalk gevuld is. */
async function toonPagina(startAdres = '/wiki') {
  render(<Wiki />, { wrapper: maakWikkel(startAdres) });
  await waitFor(() => expect(screen.queryByTestId('skelet-tabel')).not.toBeInTheDocument());
}

function zijbalkknop(naam: string) {
  return screen.getByRole('button', { name: naam });
}

/**
 * De verwijderknop van een bijlage. Het prullenbakpictogram staat ook in het
 * menu van de pagina zelf, dus zoeken we binnen het bijlagenblok.
 */
function bijlageVerwijderknop(): HTMLButtonElement {
  const kop = screen.getByText('wiki.attachments');
  const blok = kop.closest('div')?.parentElement as HTMLElement;
  return within(blok).getByTestId('icoon-trash').closest('button') as HTMLButtonElement;
}

/** De tekstvelden in het aanmaak- of bewerkscherm, op volgorde. */
function velden(): HTMLElement[] {
  return within(screen.getByRole('dialog')).getAllByRole('textbox');
}

beforeEach(() => {
  vi.clearAllMocks();
  huidigeGebruiker.rol = 'admin';
  bevestig.mockResolvedValue(true);
  zetApiKlaar();
});

describe('wikipagina - de zijbalk', () => {
  it('toont een skelet zolang de paginalijst nog laadt', async () => {
    let losmaken: (p: WikiPage[]) => void = () => {};
    vi.mocked(wikiApi.getWikiPages).mockReturnValue(
      new Promise<WikiPage[]>((resolve) => {
        losmaken = resolve;
      }),
    );

    render(<Wiki />, { wrapper: maakWikkel('/wiki') });

    expect(await screen.findByTestId('skelet-tabel')).toBeInTheDocument();

    losmaken(BOOM);
    await waitFor(() => expect(screen.queryByTestId('skelet-tabel')).not.toBeInTheDocument());
  });

  it('toont de paginaboom die de server stuurt, inclusief onderliggende pagina’s', async () => {
    await toonPagina();

    expect(zijbalkknop('Huisregels')).toBeInTheDocument();
    expect(zijbalkknop('Repetitieschema')).toBeInTheDocument();
  });

  it('toont de lege staat als er nog geen pagina’s zijn', async () => {
    vi.mocked(wikiApi.getWikiPages).mockResolvedValue([]);
    await toonPagina();

    expect(screen.getByText('wiki.noPages')).toBeInTheDocument();
  });

  it('vraagt zonder gekozen pagina om er een te kiezen en haalt niets op', async () => {
    await toonPagina();

    expect(screen.getByText('wiki.selectPage')).toBeInTheDocument();
    expect(wikiApi.getWikiPage).not.toHaveBeenCalled();
  });

  it('opent een pagina uit de boom', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    await toonPagina();

    await gebruiker.click(zijbalkknop('Huisregels'));

    await waitFor(() => expect(wikiApi.getWikiPage).toHaveBeenCalledWith('huisregels'));
    expect(await screen.findByRole('heading', { level: 2, name: /Huisregels/ })).toBeInTheDocument();
  });
});

describe('wikipagina - zoeken', () => {
  it('zoekt niet op één letter', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    await toonPagina();

    await gebruiker.type(screen.getByPlaceholderText('wiki.search'), 'h');

    expect(wikiApi.searchWikiPages).not.toHaveBeenCalled();
    // De boom blijft gewoon staan.
    expect(zijbalkknop('Huisregels')).toBeInTheDocument();
  });

  it('toont vanaf twee tekens de treffers in plaats van de boom', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    vi.mocked(wikiApi.searchWikiPages).mockResolvedValue([
      { id: 'p-2', slug: 'repetitieschema', title: 'Repetitieschema', excerpt: 'elke dinsdag', updatedAt: '' },
    ]);
    await toonPagina();

    await gebruiker.type(screen.getByPlaceholderText('wiki.search'), 'rep');

    await waitFor(() => expect(wikiApi.searchWikiPages).toHaveBeenCalledWith('rep'));
    expect(await screen.findByText('elke dinsdag')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Huisregels' })).not.toBeInTheDocument();
  });

  it('meldt het als er geen treffers zijn', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    await toonPagina();

    await gebruiker.type(screen.getByPlaceholderText('wiki.search'), 'zzz');

    expect(await screen.findByText('wiki.noResults')).toBeInTheDocument();
  });

  it('opent een treffer en leegt daarna het zoekveld', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    vi.mocked(wikiApi.searchWikiPages).mockResolvedValue([
      { id: 'p-2', slug: 'repetitieschema', title: 'Repetitieschema', excerpt: 'elke dinsdag', updatedAt: '' },
    ]);
    await toonPagina();

    await gebruiker.type(screen.getByPlaceholderText('wiki.search'), 'rep');
    await gebruiker.click(await screen.findByText('elke dinsdag'));

    await waitFor(() => expect(wikiApi.getWikiPage).toHaveBeenCalledWith('repetitieschema'));
    expect(screen.getByPlaceholderText('wiki.search')).toHaveValue('');
  });
});

describe('wikipagina - een pagina lezen', () => {
  it('toont de inhoud, de zichtbaarheid en het aantal weergaven', async () => {
    await toonPagina('/wiki?page=huisregels');

    expect(await screen.findByTestId('inhoud')).toHaveTextContent('Wees aardig.');
    expect(screen.getByText('wiki.visibilityMembers')).toBeInTheDocument();
    expect(screen.getByText(/wiki.views/)).toBeInTheDocument();
  });

  it('toont het kruimelpad en laat er doorheen navigeren', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    vi.mocked(wikiApi.getWikiPage).mockResolvedValue(
      maakDetail({
        slug: 'repetitieschema',
        title: 'Repetitieschema',
        breadcrumbs: [{ slug: 'huisregels', title: 'Huisregels' }],
      }),
    );
    await toonPagina('/wiki?page=repetitieschema');

    // Dezelfde titel staat ook in de zijbalkboom; het kruimelpad staat in de
    // inhoudskolom en dus verderop in de boom.
    const knoppen = await screen.findAllByRole('button', { name: 'Huisregels' });
    await gebruiker.click(knoppen[knoppen.length - 1]);

    await waitFor(() => expect(wikiApi.getWikiPage).toHaveBeenCalledWith('huisregels'));
  });

  it('toont de onderliggende pagina’s en opent er een', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    vi.mocked(wikiApi.getWikiPage).mockResolvedValue(maakDetail({ children: [KIND] }));
    await toonPagina('/wiki?page=huisregels');

    expect(await screen.findByText('wiki.subPages')).toBeInTheDocument();
    // De boom in de zijbalk toont dezelfde titel, vandaar de tweede treffer.
    const knoppen = screen.getAllByRole('button', { name: 'Repetitieschema' });
    await gebruiker.click(knoppen[knoppen.length - 1]);

    await waitFor(() => expect(wikiApi.getWikiPage).toHaveBeenCalledWith('repetitieschema'));
  });

  it('meldt het als de opgevraagde pagina niet bestaat', async () => {
    vi.mocked(wikiApi.getWikiPage).mockRejectedValue({ response: { status: 404 } });
    await toonPagina('/wiki?page=bestaat-niet');

    expect(await screen.findByText('wiki.pageNotFound')).toBeInTheDocument();
    // De zijbalk blijft staan; het is geen witte pagina.
    expect(zijbalkknop('Huisregels')).toBeInTheDocument();
  });

  it('toont een skelet zolang de pagina zelf nog laadt', async () => {
    vi.mocked(wikiApi.getWikiPage).mockReturnValue(new Promise<WikiPageDetail>(() => {}));

    render(<Wiki />, { wrapper: maakWikkel('/wiki?page=huisregels') });

    expect(await screen.findByTestId('skelet-tabel')).toBeInTheDocument();
  });
});

describe('wikipagina - wie wat mag', () => {
  it('laat een gewoon lid niets aanmaken of bewerken', async () => {
    huidigeGebruiker.rol = 'member';
    await toonPagina('/wiki?page=huisregels');

    await screen.findByTestId('inhoud');
    expect(screen.queryByRole('button', { name: /wiki.addPage/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /common.edit/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /common.delete/ })).not.toBeInTheDocument();
  });

  it.each(['admin', 'music_committee', 'board'])('laat %s bewerken', async (rol) => {
    huidigeGebruiker.rol = rol;
    await toonPagina('/wiki?page=huisregels');

    await screen.findByTestId('inhoud');
    expect(screen.getByRole('button', { name: /common.edit/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /wiki.history/ })).toBeInTheDocument();
  });

  it('laat alleen beheer verwijderen', async () => {
    huidigeGebruiker.rol = 'music_committee';
    await toonPagina('/wiki?page=huisregels');

    await screen.findByTestId('inhoud');
    expect(screen.queryByRole('button', { name: /common.delete/ })).not.toBeInTheDocument();
  });
});

describe('wikipagina - een pagina aanmaken', () => {
  it('leidt de slug af van de titel en slaat de pagina op', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    await toonPagina();

    await gebruiker.click(screen.getByRole('button', { name: /wiki.addPage/ }));
    const [titel, slug, inhoud] = velden();

    await gebruiker.type(titel, 'Nieuwe Regels 2026!');
    expect(slug).toHaveValue('nieuwe-regels-2026');

    await gebruiker.type(inhoud, 'Tekst van de pagina');
    await gebruiker.click(screen.getByRole('button', { name: 'common.save' }));

    // React Query geeft de mutatiefunctie naast de gegevens ook nog een
    // context mee; alleen het eerste argument gaat hier over de pagina.
    await waitFor(() => expect(wikiApi.createWikiPage).toHaveBeenCalled());
    expect(vi.mocked(wikiApi.createWikiPage).mock.calls[0][0]).toEqual({
      title: 'Nieuwe Regels 2026!',
      slug: 'nieuwe-regels-2026',
      content: 'Tekst van de pagina',
      visibility: 'members',
      isPinned: false,
    });
    expect(showSuccess).toHaveBeenCalledWith('wiki.created');
  });

  it('neemt de gekozen zichtbaarheid en het vastzetten mee', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    await toonPagina();

    await gebruiker.click(screen.getByRole('button', { name: /wiki.addPage/ }));
    const dialoog = screen.getByRole('dialog');
    const [titel, , inhoud] = velden();

    await gebruiker.type(titel, 'Bestuur');
    await gebruiker.type(inhoud, 'Alleen intern');
    await gebruiker.selectOptions(within(dialoog).getByRole('combobox'), 'admin');
    await gebruiker.click(within(dialoog).getByRole('checkbox'));
    await gebruiker.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(wikiApi.createWikiPage).toHaveBeenCalled());
    expect(vi.mocked(wikiApi.createWikiPage).mock.calls[0][0]).toMatchObject({
      visibility: 'admin',
      isPinned: true,
    });
  });

  it('toont een voorbeeld van de ingetypte tekst', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    await toonPagina();

    await gebruiker.click(screen.getByRole('button', { name: /wiki.addPage/ }));
    const dialoog = screen.getByRole('dialog');

    // Zonder tekst staat er een melding in plaats van een voorbeeld.
    await gebruiker.click(within(dialoog).getByRole('button', { name: /wiki.previewTab/ }));
    expect(screen.getByText('wiki.noPreview')).toBeInTheDocument();

    await gebruiker.click(within(dialoog).getByRole('button', { name: /wiki.editTab/ }));
    await gebruiker.type(velden()[2], 'Hallo wereld');
    await gebruiker.click(within(dialoog).getByRole('button', { name: /wiki.previewTab/ }));

    expect(screen.getByTestId('inhoud')).toHaveTextContent('Hallo wereld');
  });

  it('meldt het als het aanmaken mislukt en houdt het scherm open', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    vi.mocked(wikiApi.createWikiPage).mockRejectedValue({ response: { data: { error: 'Slug bestaat al' } } });
    await toonPagina();

    await gebruiker.click(screen.getByRole('button', { name: /wiki.addPage/ }));
    await gebruiker.type(velden()[0], 'Regels');
    await gebruiker.type(velden()[2], 'Tekst');
    await gebruiker.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('Slug bestaat al'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('sluit het scherm bij annuleren zonder op te slaan', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    await toonPagina();

    await gebruiker.click(screen.getByRole('button', { name: /wiki.addPage/ }));
    await gebruiker.type(velden()[0], 'Weg hiermee');
    await gebruiker.click(screen.getByRole('button', { name: 'common.cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(wikiApi.createWikiPage).not.toHaveBeenCalled();
  });
});

describe('wikipagina - een pagina bewerken', () => {
  it('opent het bewerkscherm gevuld met de huidige pagina en slaat op', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    await toonPagina('/wiki?page=huisregels');
    await screen.findByTestId('inhoud');

    await gebruiker.click(screen.getByRole('button', { name: /common.edit/ }));
    const [titel, inhoud] = velden();

    expect(titel).toHaveValue('Huisregels');
    expect(inhoud).toHaveValue('# Huisregels\n\nWees aardig.');

    await gebruiker.clear(titel);
    await gebruiker.type(titel, 'Huisregels 2026');
    await gebruiker.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() =>
      expect(wikiApi.updateWikiPage).toHaveBeenCalledWith('huisregels', {
        title: 'Huisregels 2026',
        content: '# Huisregels\n\nWees aardig.',
        visibility: 'members',
        isPinned: true,
      }),
    );
    expect(showSuccess).toHaveBeenCalledWith('wiki.updated');
  });

  it('toont in het bewerkscherm geen slugveld', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    await toonPagina('/wiki?page=huisregels');
    await screen.findByTestId('inhoud');

    await gebruiker.click(screen.getByRole('button', { name: /common.edit/ }));

    // Titel en inhoud, geen slug: de slug van een bestaande pagina ligt vast.
    expect(velden()).toHaveLength(2);
  });

  it('meldt het als het bijwerken mislukt', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    vi.mocked(wikiApi.updateWikiPage).mockRejectedValue(new Error('weg'));
    await toonPagina('/wiki?page=huisregels');
    await screen.findByTestId('inhoud');

    await gebruiker.click(screen.getByRole('button', { name: /common.edit/ }));
    await gebruiker.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('wiki.errorUpdate'));
  });

  it('opent een nieuwe pagina met een leeg formulier nadat er net een pagina bewerkt is', async () => {
    // BEWIJS van de reparatie: op de oude code staat hier "Huisregels" in het
    // titelveld, omdat het bewerkscherm `formData` gevuld achterliet.
    const gebruiker = userEvent.setup({ delay: null });
    await toonPagina('/wiki?page=huisregels');
    await screen.findByTestId('inhoud');

    await gebruiker.click(screen.getByRole('button', { name: /common.edit/ }));
    expect(velden()[0]).toHaveValue('Huisregels');
    await gebruiker.click(screen.getByRole('button', { name: 'common.cancel' }));

    await gebruiker.click(screen.getByRole('button', { name: /wiki.addPage/ }));
    const [titel, slug, inhoud] = velden();

    expect(titel).toHaveValue('');
    expect(slug).toHaveValue('');
    expect(inhoud).toHaveValue('');
  });
});

describe('wikipagina - verwijderen', () => {
  it('verwijdert pas na bevestiging', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    bevestig.mockResolvedValue(false);
    await toonPagina('/wiki?page=huisregels');
    await screen.findByTestId('inhoud');

    const verwijderen = screen.getByRole('button', { name: /common.delete/ });
    await gebruiker.click(verwijderen);

    await waitFor(() => expect(bevestig).toHaveBeenCalledWith('wiki.confirmDelete'));
    expect(wikiApi.deleteWikiPage).not.toHaveBeenCalled();

    bevestig.mockResolvedValue(true);
    await gebruiker.click(verwijderen);

    await waitFor(() => expect(wikiApi.deleteWikiPage).toHaveBeenCalled());
    expect(vi.mocked(wikiApi.deleteWikiPage).mock.calls[0][0]).toBe('huisregels');
    expect(showSuccess).toHaveBeenCalledWith('wiki.deleted');
  });

  it('meldt het als verwijderen mislukt', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    vi.mocked(wikiApi.deleteWikiPage).mockRejectedValue({ response: { data: { error: 'Heeft subpagina’s' } } });
    await toonPagina('/wiki?page=huisregels');
    await screen.findByTestId('inhoud');

    await gebruiker.click(screen.getByRole('button', { name: /common.delete/ }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('Heeft subpagina’s'));
  });
});

describe('wikipagina - versiegeschiedenis', () => {
  it('haalt de versies pas op als de geschiedenis geopend wordt', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    await toonPagina('/wiki?page=huisregels');
    await screen.findByTestId('inhoud');

    expect(wikiApi.getWikiPageVersions).not.toHaveBeenCalled();

    await gebruiker.click(screen.getByRole('button', { name: /wiki.history/ }));

    await waitFor(() => expect(wikiApi.getWikiPageVersions).toHaveBeenCalledWith('huisregels'));
    expect(await screen.findByText('Tekst bijgewerkt', { exact: false })).toBeInTheDocument();
  });

  it('meldt het als er nog geen versies zijn', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    vi.mocked(wikiApi.getWikiPageVersions).mockResolvedValue([]);
    await toonPagina('/wiki?page=huisregels');
    await screen.findByTestId('inhoud');

    await gebruiker.click(screen.getByRole('button', { name: /wiki.history/ }));

    expect(await screen.findByText('wiki.noVersions')).toBeInTheDocument();
  });

  it('zet een oude versie terug en sluit daarna de geschiedenis', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    await toonPagina('/wiki?page=huisregels');
    await screen.findByTestId('inhoud');

    await gebruiker.click(screen.getByRole('button', { name: /wiki.history/ }));
    const knoppen = await screen.findAllByRole('button', { name: 'wiki.restore' });
    await gebruiker.click(knoppen[1]);

    await waitFor(() => expect(wikiApi.restoreWikiPageVersion).toHaveBeenCalledWith('huisregels', 'v-1'));
    expect(showSuccess).toHaveBeenCalledWith('wiki.restored');
    await waitFor(() => expect(screen.queryByRole('button', { name: 'wiki.restore' })).not.toBeInTheDocument());
  });

  it('meldt het als terugzetten mislukt', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    vi.mocked(wikiApi.restoreWikiPageVersion).mockRejectedValue(new Error('weg'));
    await toonPagina('/wiki?page=huisregels');
    await screen.findByTestId('inhoud');

    await gebruiker.click(screen.getByRole('button', { name: /wiki.history/ }));
    const knoppen = await screen.findAllByRole('button', { name: 'wiki.restore' });
    await gebruiker.click(knoppen[0]);

    await waitFor(() => expect(showError).toHaveBeenCalledWith('wiki.errorRestore'));
  });
});

describe('wikipagina - bijlagen', () => {
  it('toont de bijlagen die de server stuurt', async () => {
    vi.mocked(wikiApi.getWikiAttachments).mockResolvedValue(BIJLAGEN);
    await toonPagina('/wiki?page=huisregels');

    // Een afbeelding krijgt twee links: het voorbeeld en de bestandsnaam.
    const links = await screen.findAllByRole('link', { name: 'plattegrond.png' });
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toHaveAttribute('href', '/uploads/plattegrond.png');
    }
    expect(screen.getByRole('link', { name: 'reglement.pdf' })).toBeInTheDocument();
    // De afbeelding krijgt een voorbeeld, het pdf-bestand een pictogram.
    expect(screen.getByRole('img', { name: 'plattegrond.png' })).toBeInTheDocument();
    expect(screen.getByText('2.0 KB')).toBeInTheDocument();
  });

  it('meldt het als er nog geen bijlagen zijn', async () => {
    await toonPagina('/wiki?page=huisregels');

    expect(await screen.findByText('wiki.noAttachments')).toBeInTheDocument();
  });

  it('laat een gewoon lid het bijlagenblok helemaal niet zien als er niets is', async () => {
    huidigeGebruiker.rol = 'member';
    await toonPagina('/wiki?page=huisregels');
    await screen.findByTestId('inhoud');

    expect(screen.queryByText('wiki.attachments')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /wiki.uploadAttachment/ })).not.toBeInTheDocument();
  });

  it('verwijdert een bijlage pas na bevestiging', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    vi.mocked(wikiApi.getWikiAttachments).mockResolvedValue([BIJLAGEN[1]]);
    bevestig.mockResolvedValue(false);
    await toonPagina('/wiki?page=huisregels');
    await screen.findByRole('link', { name: 'reglement.pdf' });

    const verwijderen = bijlageVerwijderknop();
    await gebruiker.click(verwijderen);

    await waitFor(() => expect(bevestig).toHaveBeenCalledWith('wiki.confirmDeleteAttachment'));
    expect(wikiApi.deleteWikiAttachment).not.toHaveBeenCalled();

    bevestig.mockResolvedValue(true);
    await gebruiker.click(verwijderen);

    await waitFor(() => expect(wikiApi.deleteWikiAttachment).toHaveBeenCalledWith('huisregels', 'b-2'));
    expect(showSuccess).toHaveBeenCalledWith('wiki.attachmentDeleted');
  });

  it('meldt het als het verwijderen van een bijlage mislukt', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    vi.mocked(wikiApi.getWikiAttachments).mockResolvedValue([BIJLAGEN[1]]);
    vi.mocked(wikiApi.deleteWikiAttachment).mockRejectedValue(new Error('weg'));
    await toonPagina('/wiki?page=huisregels');
    await screen.findByRole('link', { name: 'reglement.pdf' });

    await gebruiker.click(bijlageVerwijderknop());

    await waitFor(() => expect(showError).toHaveBeenCalledWith('wiki.errorDeleteAttachment'));
  });

  it('stuurt elk gekozen bestand naar de server', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    await toonPagina('/wiki?page=huisregels');
    await screen.findByText('wiki.noAttachments');

    const invoer = document.querySelector('input[type="file"]') as HTMLInputElement;
    await gebruiker.upload(invoer, [
      new File(['een'], 'een.pdf', { type: 'application/pdf' }),
      new File(['twee'], 'twee.pdf', { type: 'application/pdf' }),
    ]);

    await waitFor(() => expect(wikiApi.uploadWikiAttachment).toHaveBeenCalledTimes(2));
    expect(showSuccess).toHaveBeenCalledWith('wiki.attachmentUploaded');
  });

  it('meldt het als het uploaden mislukt', async () => {
    const gebruiker = userEvent.setup({ delay: null });
    vi.mocked(wikiApi.uploadWikiAttachment).mockRejectedValue(new Error('te groot'));
    await toonPagina('/wiki?page=huisregels');
    await screen.findByText('wiki.noAttachments');

    const invoer = document.querySelector('input[type="file"]') as HTMLInputElement;
    await gebruiker.upload(invoer, new File(['een'], 'een.pdf', { type: 'application/pdf' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('wiki.errorUploadAttachment'));
  });
});
