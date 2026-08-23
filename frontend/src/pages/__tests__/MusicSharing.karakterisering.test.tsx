/**
 * Muziek delen tussen verenigingen - vastgelegd gedrag.
 *
 * MusicSharing.tsx was nog nergens door een test aangeraakt. Deze tests leggen
 * vast wat de pagina doet, met de nadruk op de grens tussen verenigingen: wat
 * je van een ander te zien krijgt, wat je van een ander mag, en wat pas na
 * toestemming loskomt.
 *
 * Drie dingen zijn hier bewust vastgelegd omdat ze precies op die grens zitten:
 *   - De catalogus toont per titel van welke vereniging hij is. Zonder die
 *     naam lijkt andermans muziek van jou.
 *   - Uit de catalogus komt geen bestand. Er staat een knop "aanvragen", geen
 *     knop "downloaden"; downloaden kan pas nadat de eigenaar goedkeurde.
 *   - Op de oproep van een andere vereniging staan geen beheerknoppen. Dat
 *     laatste was fout; zie de laatste describe in dit bestand.
 *
 * De api is nagemaakt, de hooks en de echte modals niet: een test die op een
 * knop in een venster klikt loopt dan door dezelfde code als een gebruiker.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import MusicSharing from '../MusicSharing';
import * as delenApi from '../../api/music-sharing';
import type {
  Bestandsverzoek,
  CatalogusTitel,
  GedeeldeTitel,
  Oproep,
  OproepAntwoord,
  Overzicht,
  Partner,
} from '../../api/music-sharing';
import { showError, showSuccess } from '../../utils/toast';

vi.mock('../../api/music-sharing');

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

// De vereniging van de ingelogde gebruiker. Per test te verzetten, want het
// verschil tussen "onze oproep" en "die van de buren" hangt hieraan.
const ingelogd = { associationId: 'ver-eigen' };
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', associationId: ingelogd.associationId } }),
}));

// `initReactI18next` hoort erbij omdat de pagina via utils/locale.ts de echte
// i18n-opzet meetrekt, en die roept het aan tijdens het laden van de module.
// Zonder deze export klapt het bestand al bij de import, vóór er één test
// gedraaid heeft.
//
// De vertaling geeft de sleutel terug, met de ingevulde waarden erachter. Zo
// is te zien of de naam van de partner of de datum wel echt meegegeven wordt,
// en niet alleen de sleutel op het scherm komt.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (sleutel: string, opties?: Record<string, unknown>) =>
      opties && Object.keys(opties).length > 0 ? `${sleutel} ${Object.values(opties).join(' ')}` : sleutel,
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../components/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

vi.mock('../../utils/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));

const PARTNERS: Partner[] = [
  { id: 'ver-oost', name: 'Harmonie Oost', displayName: 'Harmonie Oost' },
  // Zonder weergavenaam hoort de gewone naam op het scherm te komen.
  { id: 'ver-west', name: 'Fanfare West', displayName: null },
];

const CATALOGUS: GedeeldeTitel[] = [
  {
    id: 'titel-1',
    title: 'Mars der Medici',
    composer: 'Johan Wichers',
    arranger: null,
    durationSeconds: null,
    grade: null,
    youtubeUrl: null,
    associationId: 'ver-oost',
    associationName: 'Harmonie Oost',
  },
];

const CATALOGUS_TITEL: CatalogusTitel = {
  id: 'titel-1',
  title: 'Mars der Medici',
  composer: 'Johan Wichers',
  arranger: 'Piet Bakker',
  durationSeconds: null,
  grade: null,
  youtubeUrl: null,
  associationName: 'Harmonie Oost',
  parts: [
    { id: 'partij-1', instrumentName: 'Trompet', tuning: 'Bb', groupNumber: '1', request: null },
    {
      id: 'partij-2',
      instrumentName: 'Hoorn',
      tuning: null,
      groupNumber: null,
      request: { status: 'pending', accessExpiresAt: null },
    },
  ],
};

function maakVerzoek(overschrijving: Partial<Bestandsverzoek> = {}): Bestandsverzoek {
  return {
    id: 'verzoek-1',
    status: 'pending',
    message: null,
    decisionNote: null,
    accessExpiresAt: null,
    createdAt: '2026-03-01T10:00:00.000Z',
    decidedAt: null,
    pieceId: 'partij-1',
    originalFilename: 'trompet-1.pdf',
    instrumentName: 'Trompet',
    titleName: 'Mars der Medici',
    requestingAssociationName: 'Fanfare West',
    ownerAssociationName: 'Harmonie Oost',
    requestedByName: 'Anna de Vries',
    ...overschrijving,
  };
}

function maakOproep(overschrijving: Partial<Oproep> = {}): Oproep {
  return {
    id: 'oproep-1',
    title: 'Slavonische Dans',
    composer: 'Dvorak',
    arranger: null,
    description: 'Wij zoeken de partituur.',
    referenceUrl: null,
    status: 'open',
    createdAt: '2026-03-02T10:00:00.000Z',
    associationId: 'ver-eigen',
    associationName: 'Onze Vereniging',
    createdByName: 'Kees Jansen',
    replyCount: 2,
    ...overschrijving,
  };
}

const ANTWOORDEN: OproepAntwoord[] = [
  {
    id: 'antwoord-1',
    body: 'Wij hebben hem liggen.',
    musicTitleId: null,
    createdAt: '2026-03-03T10:00:00.000Z',
    associationId: 'ver-oost',
    associationName: 'Harmonie Oost',
    createdByName: 'Bert Smit',
  },
];

const OVERZICHT: Overzicht = {
  partners: [
    {
      partnerId: 'ver-oost',
      partnerName: 'Harmonie Oost',
      titles: [
        { id: 'titel-9', title: 'Eigen Mars', composer: 'Onbekend', arranger: null, sinds: '2026-01-15T10:00:00.000Z' },
      ],
    },
    { partnerId: 'ver-west', partnerName: 'Fanfare West', titles: [] },
  ],
  excludedParts: [
    {
      id: 'partij-8',
      originalFilename: 'dirigent.pdf',
      title: 'Eigen Mars',
      instrumentName: null,
      reason: 'Alleen voor de dirigent',
    },
  ],
};

/**
 * Alle api-functies geven eerst iets leegs terug; per test overschrijven we wat
 * die test nodig heeft. Zo laat elk tabblad zonder opzet zijn lege staat zien.
 */
function zetApiKlaar(): void {
  for (const naam of Object.keys(delenApi)) {
    const functie = (delenApi as Record<string, unknown>)[naam];
    if (typeof functie === 'function') {
      vi.mocked(functie as (...args: unknown[]) => unknown).mockResolvedValue([]);
    }
  }
  vi.mocked(delenApi.haalPartners).mockResolvedValue([]);
  vi.mocked(delenApi.haalCatalogus).mockResolvedValue([]);
  vi.mocked(delenApi.haalOproepen).mockResolvedValue([]);
  vi.mocked(delenApi.haalBinnengekomenVerzoeken).mockResolvedValue([]);
  vi.mocked(delenApi.haalEigenVerzoeken).mockResolvedValue([]);
  vi.mocked(delenApi.haalOverzicht).mockResolvedValue({ partners: [], excludedParts: [] });
  vi.mocked(delenApi.haalCatalogusTitel).mockResolvedValue(CATALOGUS_TITEL);
  vi.mocked(delenApi.maakKoppelcode).mockResolvedValue({
    code: 'AB12-CD34',
    expiresAt: '2026-04-01T10:00:00.000Z',
    geldigUren: 48,
  });
  vi.mocked(delenApi.wisselKoppelcodeIn).mockResolvedValue({ partnerId: 'ver-oost', partnerNaam: 'Harmonie Oost' });
  vi.mocked(delenApi.haalVrijgegevenBestandOp).mockResolvedValue(undefined);
}

function wikkel({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function toon() {
  return render(<MusicSharing />, { wrapper: wikkel });
}

/** Naar een ander tabblad; alle tabs staan altijd op het scherm. */
async function naarTabblad(gebruiker: ReturnType<typeof userEvent.setup>, id: string) {
  await gebruiker.click(screen.getByRole('tab', { name: `musicSharing.tabs.${id}` }));
}

beforeEach(() => {
  vi.clearAllMocks();
  ingelogd.associationId = 'ver-eigen';
  zetApiKlaar();
});

describe('muziek delen - koppelingen', () => {
  it('opent op het koppeltabblad en toont alle vijf de tabbladen', async () => {
    toon();

    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent?.trim())).toEqual([
      'musicSharing.tabs.koppelingen',
      'musicSharing.tabs.catalogus',
      'musicSharing.tabs.verzoeken',
      'musicSharing.tabs.oproepen',
      'musicSharing.tabs.overzicht',
    ]);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('toont de gekoppelde verenigingen, met de gewone naam als er geen weergavenaam is', async () => {
    vi.mocked(delenApi.haalPartners).mockResolvedValue(PARTNERS);

    toon();

    expect(await screen.findByText('Harmonie Oost')).toBeInTheDocument();
    expect(screen.getByText('Fanfare West')).toBeInTheDocument();
  });

  it('meldt het zonder koppelingen in plaats van een lege plek te laten', async () => {
    toon();

    expect(await screen.findByText('musicSharing.link.noPartners')).toBeInTheDocument();
  });

  it('vraagt de koppelcode pas op als je erom vraagt, en toont hem daarna', async () => {
    const gebruiker = userEvent.setup();
    toon();

    // Een code aanmaken verbruikt de vorige; dat mag niet vanzelf gebeuren.
    expect(delenApi.maakKoppelcode).not.toHaveBeenCalled();

    await gebruiker.click(screen.getByRole('button', { name: 'musicSharing.link.generate' }));

    expect(await screen.findByText('AB12-CD34')).toBeInTheDocument();
    expect(screen.getByText(/musicSharing.link.validUntil/)).toBeInTheDocument();
    expect(screen.getByText('musicSharing.link.replacesPrevious')).toBeInTheDocument();
  });

  it('houdt de inwisselknop uit tot er een code staat', async () => {
    const gebruiker = userEvent.setup();
    toon();

    const knop = screen.getByRole('button', { name: 'musicSharing.link.redeem' });
    expect(knop).toBeDisabled();

    await gebruiker.type(screen.getByLabelText('musicSharing.link.codeLabel'), 'AB12-CD34');
    expect(knop).toBeEnabled();
  });

  it('meldt de naam van de nieuwe partner en maakt het veld leeg na inwisselen', async () => {
    const gebruiker = userEvent.setup();
    toon();

    const veld = screen.getByLabelText('musicSharing.link.codeLabel');
    await gebruiker.type(veld, 'AB12-CD34');
    await gebruiker.click(screen.getByRole('button', { name: 'musicSharing.link.redeem' }));

    await waitFor(() => expect(delenApi.wisselKoppelcodeIn).toHaveBeenCalledWith('AB12-CD34', expect.anything()));
    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith('musicSharing.link.linked Harmonie Oost'));
    expect(veld).toHaveValue('');
  });

  it('toont bij een code die niet klopt de uitleg van de server, niet een algemene melding', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(delenApi.wisselKoppelcodeIn).mockRejectedValue({
      response: { data: { error: 'Deze koppelcode is verlopen.' } },
    });

    toon();

    await gebruiker.type(screen.getByLabelText('musicSharing.link.codeLabel'), 'FOUT-CODE');
    await gebruiker.click(screen.getByRole('button', { name: 'musicSharing.link.redeem' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('Deze koppelcode is verlopen.'));
    // De pagina blijft staan; alleen de melding komt erbij.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('musicSharing.title');
  });

  it('valt terug op een eigen melding als de server niets uitlegt', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(delenApi.wisselKoppelcodeIn).mockRejectedValue(new Error('netwerk weg'));

    toon();

    await gebruiker.type(screen.getByLabelText('musicSharing.link.codeLabel'), 'AB12-CD34');
    await gebruiker.click(screen.getByRole('button', { name: 'musicSharing.link.redeem' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('musicSharing.link.failed'));
  });

  it('vraagt eerst om bevestiging voordat een koppeling eindigt', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(delenApi.haalPartners).mockResolvedValue(PARTNERS);

    toon();

    const regel = (await screen.findByText('Harmonie Oost')).closest('li') as HTMLElement;
    await gebruiker.click(within(regel).getByRole('button', { name: 'musicSharing.link.end' }));

    const venster = await screen.findByRole('alertdialog');
    expect(venster).toHaveTextContent('musicSharing.link.endConfirm Harmonie Oost');
    expect(delenApi.beeindigKoppeling).not.toHaveBeenCalled();

    await gebruiker.click(within(venster).getByRole('button', { name: 'common.confirm' }));

    await waitFor(() => expect(delenApi.beeindigKoppeling).toHaveBeenCalledWith('ver-oost', expect.anything()));
  });

  it('laat de koppeling staan als je de bevestiging afbreekt', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(delenApi.haalPartners).mockResolvedValue(PARTNERS);

    toon();

    const regel = (await screen.findByText('Fanfare West')).closest('li') as HTMLElement;
    await gebruiker.click(within(regel).getByRole('button', { name: 'musicSharing.link.end' }));
    await gebruiker.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'common.cancel' }),
    );

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(delenApi.beeindigKoppeling).not.toHaveBeenCalled();
  });
});

describe('muziek delen - catalogus', () => {
  it('zet bij elke titel de vereniging die hem deelt', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(delenApi.haalCatalogus).mockResolvedValue(CATALOGUS);

    toon();
    await naarTabblad(gebruiker, 'catalogus');

    const regel = (await screen.findByText('Mars der Medici')).closest('li') as HTMLElement;
    expect(within(regel).getByText('Johan Wichers')).toBeInTheDocument();
    // Zonder deze naam is niet te zien van wie het stuk is.
    expect(within(regel).getByText('Harmonie Oost')).toBeInTheDocument();
  });

  it('meldt een lege catalogus in plaats van een lege plek', async () => {
    const gebruiker = userEvent.setup();
    toon();
    await naarTabblad(gebruiker, 'catalogus');

    expect(await screen.findByText('musicSharing.catalog.empty')).toBeInTheDocument();
  });

  it('geeft de zoekterm door aan de server', async () => {
    const gebruiker = userEvent.setup();
    toon();
    await naarTabblad(gebruiker, 'catalogus');

    await waitFor(() => expect(delenApi.haalCatalogus).toHaveBeenCalledWith(undefined));

    await gebruiker.type(screen.getByLabelText('common.search'), 'mars');

    await waitFor(() => expect(delenApi.haalCatalogus).toHaveBeenCalledWith('mars'));
  });

  it('blijft overeind als de catalogus niet op te halen is', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(delenApi.haalCatalogus).mockRejectedValue(new Error('geen verbinding'));

    toon();
    await naarTabblad(gebruiker, 'catalogus');

    // Geen witte pagina: de kop, de tabs en het zoekveld blijven staan en de
    // lege staat vertelt dat er niets te zien is.
    expect(await screen.findByText('musicSharing.catalog.empty')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('musicSharing.title');
    expect(screen.getByLabelText('common.search')).toBeInTheDocument();
  });

  it('toont in het titelvenster de partijen, en geen bestand om te downloaden', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(delenApi.haalCatalogus).mockResolvedValue(CATALOGUS);

    toon();
    await naarTabblad(gebruiker, 'catalogus');
    await gebruiker.click(await screen.findByRole('button', { name: /Mars der Medici/ }));

    const venster = await screen.findByRole('dialog');
    await waitFor(() => expect(delenApi.haalCatalogusTitel).toHaveBeenCalledWith('titel-1'));

    expect(within(venster).getByText('Trompet (Bb) 1')).toBeInTheDocument();
    expect(within(venster).getByText('Hoorn')).toBeInTheDocument();
    // De kern van het delen: uit de catalogus komt geen bestand. Er is alleen
    // een aanvraag, die de eigenaar eerst moet goedkeuren.
    expect(within(venster).queryByRole('button', { name: /common.download/ })).not.toBeInTheDocument();
    expect(within(venster).queryByRole('link')).not.toBeInTheDocument();
  });

  it('vervangt de aanvraagknop door de stand zodra er al een verzoek loopt', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(delenApi.haalCatalogus).mockResolvedValue(CATALOGUS);

    toon();
    await naarTabblad(gebruiker, 'catalogus');
    await gebruiker.click(await screen.findByRole('button', { name: /Mars der Medici/ }));

    const venster = await screen.findByRole('dialog');
    const aangevraagd = (await within(venster).findByText('Hoorn')).closest('li') as HTMLElement;
    expect(within(aangevraagd).getByText('musicSharing.request.status.pending')).toBeInTheDocument();
    expect(within(aangevraagd).queryByRole('button')).not.toBeInTheDocument();

    const vrij = (within(venster).getByText('Trompet (Bb) 1') as HTMLElement).closest('li') as HTMLElement;
    expect(within(vrij).getByRole('button', { name: 'musicSharing.catalog.request' })).toBeInTheDocument();
  });

  it('vraagt een partij aan op het stuk-id', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(delenApi.haalCatalogus).mockResolvedValue(CATALOGUS);
    vi.mocked(delenApi.vraagPartijAan).mockResolvedValue({ id: 'verzoek-nieuw' });

    toon();
    await naarTabblad(gebruiker, 'catalogus');
    await gebruiker.click(await screen.findByRole('button', { name: /Mars der Medici/ }));

    const venster = await screen.findByRole('dialog');
    await gebruiker.click(await within(venster).findByRole('button', { name: 'musicSharing.catalog.request' }));

    await waitFor(() => expect(delenApi.vraagPartijAan).toHaveBeenCalledWith('partij-1', undefined));
  });
});

describe('muziek delen - verzoeken', () => {
  it('toont bij een binnengekomen verzoek welke vereniging het doet', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(delenApi.haalBinnengekomenVerzoeken).mockResolvedValue([maakVerzoek({ message: 'Graag voor zaterdag' })]);

    toon();
    await naarTabblad(gebruiker, 'verzoeken');

    expect(await screen.findByText('Mars der Medici — Trompet')).toBeInTheDocument();
    expect(screen.getByText(/Fanfare West/)).toHaveTextContent('Anna de Vries');
    expect(screen.getByText('Graag voor zaterdag')).toBeInTheDocument();
  });

  it('meldt het als er niets binnenkomt en niets uitstaat', async () => {
    const gebruiker = userEvent.setup();
    toon();
    await naarTabblad(gebruiker, 'verzoeken');

    expect(await screen.findByText('musicSharing.request.noIncoming')).toBeInTheDocument();
    expect(screen.getByText('musicSharing.request.noOutgoing')).toBeInTheDocument();
  });

  it('geeft alleen bij een lopend verzoek de keuze om goed te keuren of af te wijzen', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(delenApi.haalBinnengekomenVerzoeken).mockResolvedValue([
      maakVerzoek(),
      maakVerzoek({ id: 'verzoek-2', status: 'rejected', titleName: 'Oude Mars', decisionNote: 'Niet van ons' }),
    ]);

    toon();
    await naarTabblad(gebruiker, 'verzoeken');

    const afgehandeld = (await screen.findByText('Oude Mars — Trompet')).closest('li') as HTMLElement;
    expect(within(afgehandeld).queryByRole('button')).not.toBeInTheDocument();
    expect(within(afgehandeld).getByText('musicSharing.request.status.rejected')).toBeInTheDocument();
    expect(within(afgehandeld).getByText('Niet van ons')).toBeInTheDocument();

    const lopend = (screen.getByText('Mars der Medici — Trompet') as HTMLElement).closest('li') as HTMLElement;
    expect(within(lopend).getByRole('button', { name: 'musicSharing.request.approve' })).toBeInTheDocument();
    expect(within(lopend).getByRole('button', { name: 'musicSharing.request.reject' })).toBeInTheDocument();
  });

  it('keurt een verzoek goed op het verzoek-id', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(delenApi.haalBinnengekomenVerzoeken).mockResolvedValue([maakVerzoek()]);
    vi.mocked(delenApi.keurVerzoekGoed).mockResolvedValue(undefined);

    toon();
    await naarTabblad(gebruiker, 'verzoeken');
    await gebruiker.click(await screen.findByRole('button', { name: 'musicSharing.request.approve' }));

    await waitFor(() =>
      expect(delenApi.keurVerzoekGoed).toHaveBeenCalledWith('verzoek-1', { note: undefined, dagen: undefined }),
    );
    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith('musicSharing.request.approved'));
  });

  it('wijst een verzoek af zonder het meteen weg te gooien', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(delenApi.haalBinnengekomenVerzoeken).mockResolvedValue([maakVerzoek()]);
    vi.mocked(delenApi.wijsVerzoekAf).mockResolvedValue(undefined);

    toon();
    await naarTabblad(gebruiker, 'verzoeken');
    await gebruiker.click(await screen.findByRole('button', { name: 'musicSharing.request.reject' }));

    await waitFor(() => expect(delenApi.wijsVerzoekAf).toHaveBeenCalledWith('verzoek-1', undefined));
    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith('musicSharing.request.rejected'));
    expect(delenApi.trekVerzoekIn).not.toHaveBeenCalled();
  });

  it('geeft pas na goedkeuring een downloadknop bij een eigen verzoek', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(delenApi.haalEigenVerzoeken).mockResolvedValue([
      maakVerzoek({ id: 'eigen-1', titleName: 'Wachtend Stuk' }),
      maakVerzoek({
        id: 'eigen-2',
        status: 'approved',
        titleName: 'Vrijgegeven Stuk',
        accessExpiresAt: '2026-05-01T10:00:00.000Z',
      }),
    ]);

    toon();
    await naarTabblad(gebruiker, 'verzoeken');

    const wachtend = (await screen.findByText('Wachtend Stuk — Trompet')).closest('li') as HTMLElement;
    expect(within(wachtend).queryByRole('button', { name: /common.download/ })).not.toBeInTheDocument();
    expect(within(wachtend).getByRole('button', { name: 'musicSharing.request.withdraw' })).toBeInTheDocument();

    const vrijgegeven = (screen.getByText('Vrijgegeven Stuk — Trompet') as HTMLElement).closest('li') as HTMLElement;
    expect(within(vrijgegeven).getByRole('button', { name: /common.download/ })).toBeInTheDocument();
    // Toegang loopt af; die datum hoort erbij te staan.
    expect(within(vrijgegeven).getByText(/musicSharing.request.until/)).toBeInTheDocument();
    expect(
      within(vrijgegeven).queryByRole('button', { name: 'musicSharing.request.withdraw' }),
    ).not.toBeInTheDocument();
  });

  it('trekt een eigen verzoek in op het verzoek-id', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(delenApi.haalEigenVerzoeken).mockResolvedValue([maakVerzoek({ id: 'eigen-1' })]);
    vi.mocked(delenApi.trekVerzoekIn).mockResolvedValue(undefined);

    toon();
    await naarTabblad(gebruiker, 'verzoeken');
    await gebruiker.click(await screen.findByRole('button', { name: 'musicSharing.request.withdraw' }));

    await waitFor(() => expect(delenApi.trekVerzoekIn).toHaveBeenCalledWith('eigen-1', expect.anything()));
  });

  it('meldt het als het vrijgegeven bestand niet op te halen is', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(delenApi.haalEigenVerzoeken).mockResolvedValue([maakVerzoek({ id: 'eigen-2', status: 'approved' })]);
    vi.mocked(delenApi.haalVrijgegevenBestandOp).mockRejectedValue(new Error('toegang verlopen'));

    toon();
    await naarTabblad(gebruiker, 'verzoeken');
    await gebruiker.click(await screen.findByRole('button', { name: /common.download/ }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('musicSharing.request.downloadFailed'));
  });
});

describe('muziek delen - oproepen', () => {
  it('haalt eerst de openstaande oproepen op en wisselt van filter', async () => {
    const gebruiker = userEvent.setup();
    toon();
    await naarTabblad(gebruiker, 'oproepen');

    await waitFor(() => expect(delenApi.haalOproepen).toHaveBeenCalledWith('open'));

    await gebruiker.click(screen.getByRole('button', { name: 'musicSharing.wanted.filter.all' }));

    // Het filter "alles" hoort zonder status te vragen, niet met een lege.
    await waitFor(() => expect(delenApi.haalOproepen).toHaveBeenCalledWith(undefined));
  });

  it('toont per oproep de vereniging die hem plaatste', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(delenApi.haalOproepen).mockResolvedValue([
      maakOproep({ id: 'oproep-buren', associationId: 'ver-oost', associationName: 'Harmonie Oost' }),
    ]);

    toon();
    await naarTabblad(gebruiker, 'oproepen');

    const kaart = (await screen.findByText('Slavonische Dans')).closest('li') as HTMLElement;
    expect(within(kaart).getByText(/Harmonie Oost/)).toBeInTheDocument();
    expect(within(kaart).getByText('Wij zoeken de partituur.')).toBeInTheDocument();
    expect(within(kaart).getByRole('button', { name: 'musicSharing.wanted.replies 2' })).toBeInTheDocument();
  });

  it('meldt het als er geen oproepen zijn', async () => {
    const gebruiker = userEvent.setup();
    toon();
    await naarTabblad(gebruiker, 'oproepen');

    expect(await screen.findByText('musicSharing.wanted.empty')).toBeInTheDocument();
  });

  it('sluit een YouTube-verwijzing in via het video-id, niet via het geplakte adres', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(delenApi.haalOproepen).mockResolvedValue([
      maakOproep({ referenceUrl: 'https://www.youtube.com/watch?v=abcdefghijk' }),
    ]);

    toon();
    await naarTabblad(gebruiker, 'oproepen');

    const insluiting = await screen.findByTitle('YouTube');
    expect(insluiting).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/abcdefghijk');
  });

  it('toont een gewone verwijzing als link, en een javascript-adres helemaal niet', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(delenApi.haalOproepen).mockResolvedValue([
      maakOproep({ id: 'oproep-link', title: 'Met link', referenceUrl: 'https://voorbeeld.nl/bladmuziek' }),
      // eslint-disable-next-line no-script-url
      maakOproep({ id: 'oproep-fout', title: 'Met foute link', referenceUrl: 'javascript:alert(1)' }),
    ]);

    toon();
    await naarTabblad(gebruiker, 'oproepen');

    const goed = (await screen.findByText('Met link')).closest('li') as HTMLElement;
    expect(within(goed).getByRole('link')).toHaveAttribute('href', 'https://voorbeeld.nl/bladmuziek');
    expect(within(goed).getByRole('link')).toHaveAttribute('rel', expect.stringContaining('noopener'));

    const fout = (screen.getByText('Met foute link') as HTMLElement).closest('li') as HTMLElement;
    expect(within(fout).queryByRole('link')).not.toBeInTheDocument();
    expect(within(fout).queryByTitle('YouTube')).not.toBeInTheDocument();
  });

  it('plaatst een oproep pas als er een titel staat', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(delenApi.plaatsOproep).mockResolvedValue({ id: 'oproep-nieuw' });

    toon();
    await naarTabblad(gebruiker, 'oproepen');
    await gebruiker.click(screen.getByRole('button', { name: /musicSharing.wanted.new/ }));

    const venster = await screen.findByRole('dialog');
    // Zolang de titel leeg is staat de knop uit. Vastgelegd zoals het nu is:
    // het venster geeft de knop dan de laadtekst, want "leeg veld" en "bezig"
    // lopen door dezelfde `isLoading`.
    expect(within(venster).getByRole('button', { name: 'common.loading' })).toBeDisabled();
    expect(within(venster).queryByRole('button', { name: 'musicSharing.wanted.post' })).not.toBeInTheDocument();

    await gebruiker.type(within(venster).getByLabelText('musicSharing.wanted.field.title'), 'Gezocht stuk');
    await gebruiker.type(within(venster).getByLabelText('musicSharing.wanted.field.composer'), 'Grieg');
    await gebruiker.click(within(venster).getByRole('button', { name: 'musicSharing.wanted.post' }));

    // Lege velden gaan als `undefined` mee, niet als lege tekst: de server ziet
    // anders een ingevulde arrangeur die er niet is.
    await waitFor(() =>
      expect(delenApi.plaatsOproep).toHaveBeenCalledWith(
        {
          title: 'Gezocht stuk',
          composer: 'Grieg',
          arranger: undefined,
          description: undefined,
          referenceUrl: undefined,
        },
        expect.anything(),
      ),
    );
    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith('musicSharing.wanted.posted'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('houdt het venster open en meldt het als plaatsen mislukt', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(delenApi.plaatsOproep).mockRejectedValue(new Error('server weg'));

    toon();
    await naarTabblad(gebruiker, 'oproepen');
    await gebruiker.click(screen.getByRole('button', { name: /musicSharing.wanted.new/ }));

    const venster = await screen.findByRole('dialog');
    await gebruiker.type(within(venster).getByLabelText('musicSharing.wanted.field.title'), 'Gezocht stuk');
    await gebruiker.click(within(venster).getByRole('button', { name: 'musicSharing.wanted.post' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('musicSharing.wanted.failed'));
    // Het venster blijft staan, zodat de ingetypte tekst niet verdwijnt.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('toont de antwoorden op een oproep met de vereniging die antwoordde', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(delenApi.haalOproepen).mockResolvedValue([maakOproep()]);
    vi.mocked(delenApi.haalAntwoorden).mockResolvedValue(ANTWOORDEN);

    toon();
    await naarTabblad(gebruiker, 'oproepen');
    await gebruiker.click(await screen.findByRole('button', { name: 'musicSharing.wanted.replies 2' }));

    const venster = await screen.findByRole('dialog');
    await waitFor(() => expect(delenApi.haalAntwoorden).toHaveBeenCalledWith('oproep-1'));
    expect(within(venster).getByText('Harmonie Oost')).toBeInTheDocument();
    expect(within(venster).getByText('Wij hebben hem liggen.')).toBeInTheDocument();
  });

  it('antwoordt pas op een oproep als er tekst staat', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(delenApi.haalOproepen).mockResolvedValue([maakOproep()]);
    vi.mocked(delenApi.antwoordOpOproep).mockResolvedValue({ id: 'antwoord-nieuw' });

    toon();
    await naarTabblad(gebruiker, 'oproepen');
    await gebruiker.click(await screen.findByRole('button', { name: 'musicSharing.wanted.replies 2' }));

    const venster = await screen.findByRole('dialog');
    // Zie de opmerking bij het plaatsen van een oproep: bij een lege tekst
    // draagt de knop de laadtekst.
    expect(within(venster).getByRole('button', { name: 'common.loading' })).toBeDisabled();

    await gebruiker.type(within(venster).getByLabelText('musicSharing.wanted.yourReply'), 'Wij hebben hem.');
    await gebruiker.click(within(venster).getByRole('button', { name: 'musicSharing.wanted.reply' }));

    await waitFor(() =>
      expect(delenApi.antwoordOpOproep).toHaveBeenCalledWith('oproep-1', 'Wij hebben hem.', undefined),
    );
    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith('musicSharing.wanted.replied'));
  });

  it('meldt het als een antwoord niet verstuurd kan worden', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(delenApi.haalOproepen).mockResolvedValue([maakOproep()]);
    vi.mocked(delenApi.antwoordOpOproep).mockRejectedValue(new Error('server weg'));

    toon();
    await naarTabblad(gebruiker, 'oproepen');
    await gebruiker.click(await screen.findByRole('button', { name: 'musicSharing.wanted.replies 2' }));

    const venster = await screen.findByRole('dialog');
    await gebruiker.type(within(venster).getByLabelText('musicSharing.wanted.yourReply'), 'Wij hebben hem.');
    await gebruiker.click(within(venster).getByRole('button', { name: 'musicSharing.wanted.reply' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('musicSharing.wanted.replyFailed'));
  });
});

describe('muziek delen - overzicht', () => {
  it('toont per partner wat wij met hem delen, en meldt het als dat niets is', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(delenApi.haalOverzicht).mockResolvedValue(OVERZICHT);

    toon();
    await naarTabblad(gebruiker, 'overzicht');

    const metDeling = (await screen.findByText(/Harmonie Oost/)).closest('.card') as HTMLElement;
    expect(within(metDeling).getByText('Eigen Mars')).toBeInTheDocument();
    expect(within(metDeling).getByText(/musicSharing.overview.since/)).toBeInTheDocument();

    const zonderDeling = (screen.getByText(/Fanfare West/) as HTMLElement).closest('.card') as HTMLElement;
    expect(within(zonderDeling).getByText('musicSharing.overview.nothingShared')).toBeInTheDocument();
  });

  it('toont welke partijen overal van uitgesloten zijn, met de reden', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(delenApi.haalOverzicht).mockResolvedValue(OVERZICHT);

    toon();
    await naarTabblad(gebruiker, 'overzicht');

    expect(await screen.findByText('musicSharing.overview.excluded')).toBeInTheDocument();
    // Zonder instrumentnaam valt hij terug op de bestandsnaam.
    expect(screen.getByText('— dirigent.pdf')).toBeInTheDocument();
    expect(screen.getByText('Alleen voor de dirigent')).toBeInTheDocument();
  });

  it('meldt het zonder partners, en toont dan ook geen uitsluitingen', async () => {
    const gebruiker = userEvent.setup();
    toon();
    await naarTabblad(gebruiker, 'overzicht');

    expect(await screen.findByText('musicSharing.overview.noPartners')).toBeInTheDocument();
    expect(screen.getByText('musicSharing.overview.noExclusions')).toBeInTheDocument();
  });
});

/**
 * Hieronder geen karakterisering maar een regressietest: hij legt vast hoe het
 * hoort te zijn, na het herstellen van een fout.
 *
 * De oproepenlijst bevat je eigen oproepen én die van gekoppelde verenigingen
 * (backend/src/routes/music-sharing.ts, GET /wanted). De knoppen "opgelost" en
 * "verwijderen" stonden op elke oproep, dus ook op die van de buren. De server
 * doet daar niets mee - PATCH en DELETE eindigen op `AND association_id = ?` en
 * geven anders een 404 - maar de knop suggereert wel dat je over andermans
 * oproep gaat, en klikken doet stilzwijgend niets.
 *
 * Bewijs: op de code zonder deze reparatie (gemeten door MusicSharing.tsx
 * tijdelijk op HEAD te zetten) vallen twee van de vier tests hieronder om -
 * "geeft de oproep van een andere vereniging geen knop..." en "toont een oproep
 * zonder bekende eigen vereniging...". Beide vinden dan de knoppen die er niet
 * horen te staan.
 *
 * De andere twee ("houdt die knoppen wel op de eigen oproep" en "verwijdert
 * alleen de eigen oproep") blijven ook op de oude code groen. Dat zijn dus geen
 * bewijzen maar wachten: ze bewaken dat de reparatie niet te ver gaat en de
 * eigen oproep onbeheerbaar maakt.
 */
describe('muziek delen - herstelde fout: beheerknoppen op andermans oproep', () => {
  it('geeft de oproep van een andere vereniging geen knop om op te lossen of te verwijderen', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(delenApi.haalOproepen).mockResolvedValue([
      maakOproep({ id: 'oproep-buren', associationId: 'ver-oost', associationName: 'Harmonie Oost' }),
    ]);

    toon();
    await naarTabblad(gebruiker, 'oproepen');

    const kaart = (await screen.findByText('Slavonische Dans')).closest('li') as HTMLElement;
    expect(within(kaart).queryByRole('button', { name: 'musicSharing.wanted.markResolved' })).not.toBeInTheDocument();
    expect(within(kaart).queryByRole('button', { name: 'common.delete' })).not.toBeInTheDocument();
    // Antwoorden mag wel: daarvoor is de oproep juist zichtbaar.
    expect(within(kaart).getByRole('button', { name: 'musicSharing.wanted.replies 2' })).toBeInTheDocument();
  });

  it('houdt die knoppen wel op de eigen oproep', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(delenApi.haalOproepen).mockResolvedValue([maakOproep()]);
    vi.mocked(delenApi.werkOproepBij).mockResolvedValue(undefined);

    toon();
    await naarTabblad(gebruiker, 'oproepen');

    const kaart = (await screen.findByText('Slavonische Dans')).closest('li') as HTMLElement;
    await gebruiker.click(within(kaart).getByRole('button', { name: 'musicSharing.wanted.markResolved' }));

    await waitFor(() => expect(delenApi.werkOproepBij).toHaveBeenCalledWith('oproep-1', { status: 'resolved' }));
    expect(within(kaart).getByRole('button', { name: 'common.delete' })).toBeInTheDocument();
  });

  it('verwijdert alleen de eigen oproep, op het oproep-id', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(delenApi.haalOproepen).mockResolvedValue([maakOproep()]);
    vi.mocked(delenApi.verwijderOproep).mockResolvedValue(undefined);

    toon();
    await naarTabblad(gebruiker, 'oproepen');

    const kaart = (await screen.findByText('Slavonische Dans')).closest('li') as HTMLElement;
    await gebruiker.click(within(kaart).getByRole('button', { name: 'common.delete' }));

    await waitFor(() => expect(delenApi.verwijderOproep).toHaveBeenCalledWith('oproep-1', expect.anything()));
  });

  it('toont een oproep zonder bekende eigen vereniging ook zonder beheerknoppen', async () => {
    const gebruiker = userEvent.setup();
    // Komt voor bij een gebruiker zonder vereniging; dan hoort niets van een
    // ander beheerbaar te lijken.
    ingelogd.associationId = '';
    vi.mocked(delenApi.haalOproepen).mockResolvedValue([maakOproep()]);

    toon();
    await naarTabblad(gebruiker, 'oproepen');

    const kaart = (await screen.findByText('Slavonische Dans')).closest('li') as HTMLElement;
    expect(within(kaart).queryByRole('button', { name: 'common.delete' })).not.toBeInTheDocument();
  });
});

/**
 * Nog een regressietest, om een tweede fout heen.
 *
 * De knop "aanvragen" in het catalogusvenster had geen `type`. Een knop zonder
 * `type` in een formulier is een verstuurknop, en de inhoud van FormModal staat
 * in zo'n formulier; versturen roept daar `onClose` aan. Eén klik op aanvragen
 * sloot dus het venster: de aanvraag ging wel de deur uit, maar de melding
 * "verzoek verstuurd" kwam nooit in beeld en de stand bij de partij ook niet.
 *
 * Bewijs: op de code zonder `type="button"` valt de eerste test hieronder om,
 * op de verwachting dat het venster er nog is - dat is dan verdwenen. De tweede
 * test ("sluit het venster wel met de sluitknop") blijft op de oude code groen;
 * dat is een wacht, niet een bewijs: hij bewaakt dat sluiten nog werkt.
 */
describe('muziek delen - herstelde fout: aanvragen sloot het catalogusvenster', () => {
  it('houdt het venster open en meldt dat het verzoek weg is', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(delenApi.haalCatalogus).mockResolvedValue(CATALOGUS);
    vi.mocked(delenApi.vraagPartijAan).mockResolvedValue({ id: 'verzoek-nieuw' });

    toon();
    await naarTabblad(gebruiker, 'catalogus');
    await gebruiker.click(await screen.findByRole('button', { name: /Mars der Medici/ }));

    const venster = await screen.findByRole('dialog');
    await gebruiker.click(await within(venster).findByRole('button', { name: 'musicSharing.catalog.request' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith('musicSharing.request.sent'));
  });

  it('sluit het venster wel met de sluitknop van het venster zelf', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(delenApi.haalCatalogus).mockResolvedValue(CATALOGUS);

    toon();
    await naarTabblad(gebruiker, 'catalogus');
    await gebruiker.click(await screen.findByRole('button', { name: /Mars der Medici/ }));

    const venster = await screen.findByRole('dialog');
    await gebruiker.click(within(venster).getByRole('button', { name: 'common.close' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
