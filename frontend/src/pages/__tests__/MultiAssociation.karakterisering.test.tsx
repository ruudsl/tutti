/**
 * Verenigingsbeheer - vastgelegd gedrag.
 *
 * MultiAssociation.tsx is 1140 regels en was nog nergens door een test
 * aangeraakt. Dit is het scherm waar één beheerder over meerdere verenigingen
 * gaat, dus de vraag "wat zie je van een ander" is hier de belangrijkste.
 *
 * Vier dingen zijn daarom bewust vastgelegd:
 *   - Zonder superbeheerdersrecht wordt er geen enkele lijst opgehaald. Niet
 *     alleen verborgen: het verzoek gaat niet uit. Zou de pagina de gegevens
 *     wél halen en alleen de tabel wegwerken, dan staat de ledenlijst van elke
 *     vereniging in het netwerkvenster van de browser.
 *   - Een tabblad haalt pas op als je het opent.
 *   - Bij de gedeelde muziek en concerten van partners staat steeds de naam van
 *     de vereniging waar ze vandaan komen.
 *   - Alleen een binnengekomen partnerverzoek krijgt goedkeuren en afwijzen;
 *     over je eigen uitgaande verzoek beslis je niet zelf.
 *
 * De api is nagemaakt, de hooks en de echte vensters niet.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import MultiAssociation from '../MultiAssociation';
import * as verenigingApi from '../../api/multi-association';
import type {
  ActivityLogEntry,
  Association,
  AssociationMember,
  Invitation,
  Partnership,
  SharedConcert,
  SharedTitle,
  SuperAdmin,
} from '../../api/multi-association';

vi.mock('../../api/multi-association');

// `initReactI18next` hoort erbij omdat de pagina via utils/locale.ts de echte
// i18n-opzet meetrekt, en die roept het aan tijdens het laden van de module.
// Zonder deze export klapt het bestand al bij de import, vóór er één test
// gedraaid heeft. De vertaling geeft de sleutel terug met de ingevulde waarden
// erachter, zodat zichtbaar is of een naam wel echt meegegeven wordt.
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

const VERENIGINGEN: Association[] = [
  {
    id: 'ver-1',
    name: 'Harmonie Oost',
    slug: 'harmonie-oost',
    city: 'Zutphen',
    subscriptionTier: 'pro',
    maxMembers: 100,
    maxOrchestras: 5,
    memberCount: 42,
    orchestraCount: 3,
    isActive: true,
    createdAt: '2026-01-01',
  },
  {
    id: 'ver-2',
    name: 'Fanfare West',
    // Zonder slug en zonder grenzen: allebei een eigen tak in de weergave.
    subscriptionTier: 'free',
    memberCount: 7,
    isActive: false,
    createdAt: '2026-01-02',
  },
];

const UITNODIGINGEN: Invitation[] = [
  {
    id: 'uit-1',
    email: 'nieuw@voorbeeld.nl',
    role: 'member',
    invitedBy: 'Kees Jansen',
    expiresAt: '2026-09-01',
    createdAt: '2026-08-01',
    status: 'pending',
  },
  {
    id: 'uit-2',
    email: 'al@voorbeeld.nl',
    role: 'admin',
    invitedBy: 'Kees Jansen',
    expiresAt: '2026-09-01',
    createdAt: '2026-08-01',
    status: 'accepted',
  },
  {
    id: 'uit-3',
    email: 'oud@voorbeeld.nl',
    role: 'board',
    invitedBy: 'Kees Jansen',
    expiresAt: '2026-02-01',
    createdAt: '2026-01-01',
    status: 'expired',
  },
];

function maakPartnerschap(overschrijving: Partial<Partnership> = {}): Partnership {
  return {
    id: 'partner-1',
    partnerAssociationId: 'ver-9',
    partnerAssociationName: 'Harmonie Zuid',
    partnershipType: 'music',
    shareMusic: true,
    shareEvents: false,
    shareMembers: false,
    status: 'pending',
    requestedByName: 'Anna de Vries',
    isOutgoing: false,
    createdAt: '2026-03-01',
    ...overschrijving,
  };
}

const LEDEN: AssociationMember[] = [
  {
    userId: 'lid-1',
    email: 'anna@voorbeeld.nl',
    name: 'Anna de Vries',
    role: 'member',
    isPrimary: true,
    status: 'active',
    userStatus: 'active',
    joinedAt: '2026-01-01',
  },
  {
    userId: 'lid-2',
    email: 'bert@voorbeeld.nl',
    name: 'Bert Smit',
    role: 'admin',
    isPrimary: false,
    status: 'inactive',
    userStatus: 'active',
    joinedAt: '2026-01-02',
  },
];

const SUPERBEHEERDERS: SuperAdmin[] = [
  {
    id: 'sb-1',
    userId: 'lid-2',
    email: 'bert@voorbeeld.nl',
    name: 'Bert Smit',
    permissions: ['all'],
    createdAt: '2026-01-01',
  },
];

const LOGBOEK: ActivityLogEntry[] = [
  {
    id: 'log-1',
    userId: 'lid-1',
    userName: 'Anna de Vries',
    action: 'association.created',
    details: { name: 'Harmonie Oost' },
    createdAt: '2026-03-01T10:00:00.000Z',
  },
  {
    id: 'log-2',
    action: 'partnership.ended',
    details: {},
    createdAt: '2026-03-02T10:00:00.000Z',
  },
];

const GEDEELDE_MUZIEK: SharedTitle[] = [
  {
    id: 'titel-1',
    title: 'Mars der Medici',
    composer: 'Johan Wichers',
    arranger: 'Piet Bakker',
    durationSeconds: null,
    grade: null,
    youtubeUrl: null,
    associationId: 'ver-9',
    associationName: 'Harmonie Zuid',
  },
];

const GEDEELDE_CONCERTEN: SharedConcert[] = [
  {
    id: 'concert-1',
    name: 'Nieuwjaarsconcert',
    date: '2027-01-08',
    endDate: null,
    location: 'De Hanzehof',
    concertType: null,
    description: null,
    associationId: 'ver-9',
    associationName: 'Harmonie Zuid',
  },
];

/**
 * Alle api-functies geven eerst iets leegs terug; per test overschrijven we wat
 * die test nodig heeft. Standaard is de gebruiker superbeheerder, want zonder
 * dat recht is er maar één scherm te zien.
 */
function zetApiKlaar(): void {
  for (const naam of Object.keys(verenigingApi)) {
    const functie = (verenigingApi as Record<string, unknown>)[naam];
    if (typeof functie === 'function') {
      vi.mocked(functie as (...args: unknown[]) => unknown).mockResolvedValue([]);
    }
  }
  vi.mocked(verenigingApi.checkIsSuperAdmin).mockResolvedValue({ isSuperAdmin: true });
  vi.mocked(verenigingApi.getSuperAdminAssociations).mockResolvedValue([]);
  vi.mocked(verenigingApi.getInvitations).mockResolvedValue([]);
  vi.mocked(verenigingApi.getPartnerships).mockResolvedValue([]);
  vi.mocked(verenigingApi.getPartnerMusic).mockResolvedValue([]);
  vi.mocked(verenigingApi.getPartnerEvents).mockResolvedValue([]);
  vi.mocked(verenigingApi.getAssociationMembers).mockResolvedValue([]);
  vi.mocked(verenigingApi.getSuperAdmins).mockResolvedValue([]);
  vi.mocked(verenigingApi.getActivityLog).mockResolvedValue([]);
}

function wikkel({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

function toon() {
  return render(<MultiAssociation />, { wrapper: wikkel });
}

/** Naar een tabblad; de tabbladen staan als knoppen in de bovenbalk. */
async function naarTabblad(gebruiker: ReturnType<typeof userEvent.setup>, id: string) {
  await gebruiker.click(await screen.findByRole('button', { name: `multiAssociation.tabs.${id}` }));
}

beforeEach(() => {
  vi.clearAllMocks();
  zetApiKlaar();
});

describe('verenigingsbeheer - toegang', () => {
  it('meldt dat de toegang gecontroleerd wordt zolang dat loopt', async () => {
    let losmaken: (waarde: { isSuperAdmin: boolean }) => void = () => {};
    vi.mocked(verenigingApi.checkIsSuperAdmin).mockReturnValue(
      new Promise((resolve) => {
        losmaken = resolve;
      }),
    );

    toon();

    expect(screen.getByRole('status')).toHaveTextContent('multiAssociation.checkingAccess');

    losmaken({ isSuperAdmin: true });
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('multiAssociation.title');
  });

  it('houdt de pagina dicht zonder superbeheerdersrecht', async () => {
    vi.mocked(verenigingApi.checkIsSuperAdmin).mockResolvedValue({ isSuperAdmin: false });

    toon();

    expect(await screen.findByText('multiAssociation.accessRequiredTitle')).toBeInTheDocument();
    expect(screen.getByText('multiAssociation.accessRequiredMessage')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  });

  it('haalt zonder dat recht geen enkele lijst op', async () => {
    vi.mocked(verenigingApi.checkIsSuperAdmin).mockResolvedValue({ isSuperAdmin: false });

    toon();

    await screen.findByText('multiAssociation.accessRequiredTitle');

    // Verbergen is niet genoeg. Zou de pagina de gegevens toch ophalen, dan
    // liggen de ledenlijsten en het logboek van elke vereniging in de browser
    // van iemand die er niet bij hoort.
    expect(verenigingApi.getSuperAdminAssociations).not.toHaveBeenCalled();
    expect(verenigingApi.getAssociationMembers).not.toHaveBeenCalled();
    expect(verenigingApi.getSuperAdmins).not.toHaveBeenCalled();
    expect(verenigingApi.getActivityLog).not.toHaveBeenCalled();
    expect(verenigingApi.getInvitations).not.toHaveBeenCalled();
    expect(verenigingApi.getPartnerships).not.toHaveBeenCalled();
  });

  it('houdt de pagina dicht als de rechtencontrole zelf mislukt', async () => {
    vi.mocked(verenigingApi.checkIsSuperAdmin).mockRejectedValue(new Error('geen verbinding'));

    toon();

    // Bij twijfel dicht: geen antwoord is geen toegang.
    expect(await screen.findByText('multiAssociation.accessRequiredTitle')).toBeInTheDocument();
    expect(verenigingApi.getSuperAdminAssociations).not.toHaveBeenCalled();
  });

  it('toont de zes tabbladen in vaste volgorde, met verenigingen voorop', async () => {
    toon();

    await screen.findByRole('heading', { level: 1 });
    const tabbladen = ['associations', 'invitations', 'partnerships', 'members', 'superadmins', 'activity'].map((id) =>
      screen.getByRole('button', { name: `multiAssociation.tabs.${id}` }),
    );

    expect(tabbladen).toHaveLength(6);
    // Alleen het eerste tabblad haalt bij het openen iets op.
    await waitFor(() => expect(verenigingApi.getSuperAdminAssociations).toHaveBeenCalled());
    expect(verenigingApi.getInvitations).not.toHaveBeenCalled();
    expect(verenigingApi.getActivityLog).not.toHaveBeenCalled();
  });
});

describe('verenigingsbeheer - verenigingen', () => {
  it('toont per vereniging de plaats, het pakket en de stand', async () => {
    vi.mocked(verenigingApi.getSuperAdminAssociations).mockResolvedValue(VERENIGINGEN);

    toon();

    const rij = (await screen.findByText('Harmonie Oost')).closest('tr') as HTMLElement;
    expect(within(rij).getByText('Zutphen')).toBeInTheDocument();
    expect(within(rij).getByText('multiAssociation.subscription.tiers.pro')).toBeInTheDocument();
    expect(within(rij).getByText('multiAssociation.associations.status.active')).toBeInTheDocument();

    const tweede = (screen.getByText('Fanfare West') as HTMLElement).closest('tr') as HTMLElement;
    expect(within(tweede).getByText('multiAssociation.associations.status.inactive')).toBeInTheDocument();
  });

  it('zet het aantal leden naast de grens, en zonder grens alleen het aantal', async () => {
    vi.mocked(verenigingApi.getSuperAdminAssociations).mockResolvedValue(VERENIGINGEN);

    toon();

    const metGrens = (await screen.findByText('Harmonie Oost')).closest('tr') as HTMLElement;
    expect(within(metGrens).getByText('42 / 100')).toBeInTheDocument();
    expect(within(metGrens).getByText('3 / 5')).toBeInTheDocument();

    // Geen grens is geen grens: "7 / null" op het scherm zou eruitzien als een
    // storing, en "7 / 0" zou een verkeerde grens suggereren.
    const zonderGrens = (screen.getByText('Fanfare West') as HTMLElement).closest('tr') as HTMLElement;
    expect(within(zonderGrens).getByText('7')).toBeInTheDocument();
    expect(within(zonderGrens).getByText('0')).toBeInTheDocument();
  });

  it('maakt van de slug een link naar het eigen inlogscherm, en toont een streepje zonder slug', async () => {
    vi.mocked(verenigingApi.getSuperAdminAssociations).mockResolvedValue(VERENIGINGEN);

    toon();

    const metSlug = (await screen.findByText('Harmonie Oost')).closest('tr') as HTMLElement;
    expect(within(metSlug).getByRole('link', { name: '/login/harmonie-oost' })).toHaveAttribute(
      'href',
      '/login/harmonie-oost',
    );

    const zonderSlug = (screen.getByText('Fanfare West') as HTMLElement).closest('tr') as HTMLElement;
    expect(within(zonderSlug).queryByRole('link')).not.toBeInTheDocument();
    expect(within(zonderSlug).getByText('-')).toBeInTheDocument();
  });

  it('meldt het als er nog geen verenigingen zijn', async () => {
    toon();

    expect(await screen.findByText('multiAssociation.associations.noAssociations')).toBeInTheDocument();
  });

  it('blijft overeind als de verenigingen niet op te halen zijn', async () => {
    vi.mocked(verenigingApi.getSuperAdminAssociations).mockRejectedValue(new Error('geen verbinding'));

    toon();

    // Geen witte pagina: de kop, de tabbladen en de toevoegknop blijven staan.
    expect(await screen.findByText('multiAssociation.associations.noAssociations')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('multiAssociation.title');
    expect(screen.getByRole('button', { name: /multiAssociation.associations.newAssociation/ })).toBeInTheDocument();
  });

  it('maakt een vereniging aan met wat er ingevuld is en sluit het venster', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(verenigingApi.createAssociationAsSuperAdmin).mockResolvedValue({ id: 'ver-nieuw', slug: 'nieuw' });

    toon();
    await gebruiker.click(await screen.findByRole('button', { name: /multiAssociation.associations.newAssociation/ }));

    const venster = await screen.findByRole('dialog');
    await gebruiker.type(within(venster).getByLabelText(/multiAssociation.form.name/), 'Nieuwe Harmonie');
    await gebruiker.click(within(venster).getByRole('button', { name: 'common.create' }));

    await waitFor(() =>
      expect(verenigingApi.createAssociationAsSuperAdmin).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Nieuwe Harmonie', country: 'Nederland' }),
      ),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('maakt van een ingetypte slug meteen een bruikbaar adres', async () => {
    const gebruiker = userEvent.setup();
    toon();
    await gebruiker.click(await screen.findByRole('button', { name: /multiAssociation.associations.newAssociation/ }));

    const venster = await screen.findByRole('dialog');
    const slug = within(venster).getByLabelText('multiAssociation.form.slug');
    await gebruiker.type(slug, 'Harmonie Oost!');

    // Hoofdletters, spaties en leestekens worden streepjes: de slug staat in
    // de inlog-url, daar kan niet zomaar van alles in.
    expect(slug).toHaveValue('harmonie-oost-');
  });

  it('opent het bewerkvenster met de gegevens van de gekozen vereniging', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(verenigingApi.getSuperAdminAssociations).mockResolvedValue(VERENIGINGEN);
    vi.mocked(verenigingApi.updateAssociationAsSuperAdmin).mockResolvedValue(undefined);

    toon();
    const rij = (await screen.findByText('Harmonie Oost')).closest('tr') as HTMLElement;
    await gebruiker.click(within(rij).getByTitle('common.edit'));

    const venster = await screen.findByRole('dialog');
    expect(venster).toHaveTextContent('multiAssociation.associations.editAssociation');
    expect(within(venster).getByLabelText(/multiAssociation.form.name/)).toHaveValue('Harmonie Oost');
    expect(within(venster).getByLabelText('multiAssociation.form.slug')).toHaveValue('harmonie-oost');

    await gebruiker.click(within(venster).getByRole('button', { name: 'common.save' }));

    await waitFor(() =>
      expect(verenigingApi.updateAssociationAsSuperAdmin).toHaveBeenCalledWith(
        'ver-1',
        expect.objectContaining({ name: 'Harmonie Oost' }),
      ),
    );
  });

  it('past het abonnement aan op de vereniging waarvan de knop is', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(verenigingApi.getSuperAdminAssociations).mockResolvedValue(VERENIGINGEN);
    vi.mocked(verenigingApi.updateAssociationSubscription).mockResolvedValue(undefined);

    toon();
    const rij = (await screen.findByText('Fanfare West')).closest('tr') as HTMLElement;
    await gebruiker.click(within(rij).getByTitle('multiAssociation.associations.subscription'));

    const venster = await screen.findByRole('dialog');
    expect(venster).toHaveTextContent('Fanfare West');
    await gebruiker.selectOptions(within(venster).getByLabelText('multiAssociation.subscription.tier'), 'enterprise');
    await gebruiker.click(within(venster).getByRole('button', { name: 'common.save' }));

    await waitFor(() =>
      expect(verenigingApi.updateAssociationSubscription).toHaveBeenCalledWith(
        'ver-2',
        expect.objectContaining({ subscriptionTier: 'enterprise', isActive: false }),
      ),
    );
  });

  it('vraagt eerst om bevestiging voordat een vereniging verdwijnt', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(verenigingApi.getSuperAdminAssociations).mockResolvedValue(VERENIGINGEN);
    vi.mocked(verenigingApi.deleteAssociationAsSuperAdmin).mockResolvedValue(undefined);

    toon();
    const rij = (await screen.findByText('Harmonie Oost')).closest('tr') as HTMLElement;
    await gebruiker.click(within(rij).getByTitle('common.delete'));

    const venster = await screen.findByRole('alertdialog');
    expect(venster).toHaveTextContent('multiAssociation.associations.deleteConfirm');
    expect(verenigingApi.deleteAssociationAsSuperAdmin).not.toHaveBeenCalled();

    await gebruiker.click(within(venster).getByRole('button', { name: 'common.delete' }));

    await waitFor(() => expect(verenigingApi.deleteAssociationAsSuperAdmin).toHaveBeenCalledWith('ver-1'));
  });

  it('laat de vereniging staan als de bevestiging afgebroken wordt', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(verenigingApi.getSuperAdminAssociations).mockResolvedValue(VERENIGINGEN);

    toon();
    const rij = (await screen.findByText('Harmonie Oost')).closest('tr') as HTMLElement;
    await gebruiker.click(within(rij).getByTitle('common.delete'));
    await gebruiker.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'common.cancel' }),
    );

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(verenigingApi.deleteAssociationAsSuperAdmin).not.toHaveBeenCalled();
  });
});

describe('verenigingsbeheer - uitnodigingen', () => {
  it('toont de uitnodigingen met hun stand en wie ze stuurde', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(verenigingApi.getInvitations).mockResolvedValue(UITNODIGINGEN);

    toon();
    await naarTabblad(gebruiker, 'invitations');

    expect(await screen.findByText('nieuw@voorbeeld.nl')).toBeInTheDocument();
    expect(screen.getByText('multiAssociation.invitations.status.pending')).toBeInTheDocument();
    expect(screen.getByText('multiAssociation.invitations.status.accepted')).toBeInTheDocument();
    expect(screen.getByText('multiAssociation.invitations.status.expired')).toBeInTheDocument();
    // Alle drie de uitnodigingen komen van dezelfde afzender.
    expect(screen.getAllByText(/multiAssociation.invitations.invitedBy: Kees Jansen/)).toHaveLength(3);
  });

  it('geeft alleen een lopende uitnodiging een knop om hem in te trekken', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(verenigingApi.getInvitations).mockResolvedValue(UITNODIGINGEN);
    vi.mocked(verenigingApi.deleteInvitation).mockResolvedValue(undefined);

    toon();
    await naarTabblad(gebruiker, 'invitations');

    const aanvaard = (await screen.findByText('al@voorbeeld.nl')).closest('div.flex.items-center') as HTMLElement;
    expect(within(aanvaard).queryByRole('button')).not.toBeInTheDocument();

    const verlopen = (screen.getByText('oud@voorbeeld.nl') as HTMLElement).closest(
      'div.flex.items-center',
    ) as HTMLElement;
    expect(within(verlopen).queryByRole('button')).not.toBeInTheDocument();

    const lopend = (screen.getByText('nieuw@voorbeeld.nl') as HTMLElement).closest(
      'div.flex.items-center',
    ) as HTMLElement;
    await gebruiker.click(within(lopend).getByRole('button'));

    await waitFor(() => expect(verenigingApi.deleteInvitation).toHaveBeenCalledWith('uit-1'));
  });

  it('meldt het als er geen uitnodigingen openstaan', async () => {
    const gebruiker = userEvent.setup();
    toon();
    await naarTabblad(gebruiker, 'invitations');

    expect(await screen.findByText('multiAssociation.invitations.noInvitations')).toBeInTheDocument();
  });

  it('nodigt pas uit als er een adres staat, met de gekozen rol', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(verenigingApi.createInvitation).mockResolvedValue({ id: 'uit-nieuw', inviteUrl: '/uitnodiging/abc' });

    toon();
    await naarTabblad(gebruiker, 'invitations');
    await gebruiker.click(screen.getByRole('button', { name: /multiAssociation.invitations.invite/ }));

    const versturen = screen.getByRole('button', { name: 'common.submit' });
    expect(versturen).toBeDisabled();

    await gebruiker.type(
      screen.getByPlaceholderText('multiAssociation.invitations.emailPlaceholder'),
      'nieuw@voorbeeld.nl',
    );
    await gebruiker.selectOptions(screen.getByRole('combobox'), 'board');
    expect(versturen).toBeEnabled();

    await gebruiker.click(versturen);

    await waitFor(() => expect(verenigingApi.createInvitation).toHaveBeenCalledWith('nieuw@voorbeeld.nl', 'board'));
    // Het formulier gaat dicht en leeg weer open, anders staat het oude adres
    // er nog bij de volgende uitnodiging.
    await waitFor(() =>
      expect(screen.queryByPlaceholderText('multiAssociation.invitations.emailPlaceholder')).not.toBeInTheDocument(),
    );
  });

  it('laat het uitnodigingsformulier sluiten zonder te versturen', async () => {
    const gebruiker = userEvent.setup();
    toon();
    await naarTabblad(gebruiker, 'invitations');
    await gebruiker.click(screen.getByRole('button', { name: /multiAssociation.invitations.invite/ }));

    await gebruiker.click(screen.getByRole('button', { name: 'common.cancel' }));

    expect(screen.queryByPlaceholderText('multiAssociation.invitations.emailPlaceholder')).not.toBeInTheDocument();
    expect(verenigingApi.createInvitation).not.toHaveBeenCalled();
  });
});

describe('verenigingsbeheer - partnerschappen', () => {
  it('wijst voor het koppelen zelf door naar muziek delen', async () => {
    const gebruiker = userEvent.setup();
    toon();
    await naarTabblad(gebruiker, 'partnerships');

    expect(await screen.findByText('multiAssociation.partnerships.linkViaCode')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'nav.musicSharing' })).toHaveAttribute('href', '/music-sharing');
    expect(screen.getByText('multiAssociation.partnerships.noPartnerships')).toBeInTheDocument();
  });

  it('geeft alleen een binnengekomen verzoek de keuze om goed te keuren of af te wijzen', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(verenigingApi.getPartnerships).mockResolvedValue([
      maakPartnerschap(),
      maakPartnerschap({ id: 'partner-2', partnerAssociationName: 'Fanfare Noord', isOutgoing: true }),
    ]);

    toon();
    await naarTabblad(gebruiker, 'partnerships');

    const binnengekomen = (await screen.findByText('Harmonie Zuid')).closest('.border') as HTMLElement;
    expect(within(binnengekomen).getByText('multiAssociation.partnerships.incoming')).toBeInTheDocument();
    expect(
      within(binnengekomen).getByRole('button', { name: 'multiAssociation.partnerships.approve' }),
    ).toBeInTheDocument();

    // Over je eigen uitgaande verzoek beslis je niet zelf.
    const uitgaand = (screen.getByText('Fanfare Noord') as HTMLElement).closest('.border') as HTMLElement;
    expect(within(uitgaand).getByText('multiAssociation.partnerships.outgoing')).toBeInTheDocument();
    expect(within(uitgaand).queryByRole('button')).not.toBeInTheDocument();
  });

  it('keurt een binnengekomen verzoek goed of wijst het af op het partnerschaps-id', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(verenigingApi.getPartnerships).mockResolvedValue([maakPartnerschap()]);
    vi.mocked(verenigingApi.approvePartnership).mockResolvedValue(undefined);

    toon();
    await naarTabblad(gebruiker, 'partnerships');
    await gebruiker.click(await screen.findByRole('button', { name: 'multiAssociation.partnerships.approve' }));

    await waitFor(() => expect(verenigingApi.approvePartnership).toHaveBeenCalledWith('partner-1'));
    expect(verenigingApi.rejectPartnership).not.toHaveBeenCalled();
  });

  it('geeft een lopend partnerschap alleen de knop om het te beëindigen', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(verenigingApi.getPartnerships).mockResolvedValue([
      maakPartnerschap({ status: 'active', shareEvents: true, shareMembers: true }),
    ]);
    vi.mocked(verenigingApi.endPartnership).mockResolvedValue(undefined);

    toon();
    await naarTabblad(gebruiker, 'partnerships');

    const kaart = (await screen.findByText('Harmonie Zuid')).closest('.border') as HTMLElement;
    expect(within(kaart).getByText('multiAssociation.partnerships.shareMusic')).toBeInTheDocument();
    expect(within(kaart).getByText('multiAssociation.partnerships.shareEvents')).toBeInTheDocument();
    expect(within(kaart).getByText('multiAssociation.partnerships.shareMembers')).toBeInTheDocument();
    expect(
      within(kaart).queryByRole('button', { name: 'multiAssociation.partnerships.approve' }),
    ).not.toBeInTheDocument();

    await gebruiker.click(within(kaart).getByRole('button', { name: 'multiAssociation.partnerships.end' }));
    await waitFor(() => expect(verenigingApi.endPartnership).toHaveBeenCalledWith('partner-1'));
  });

  it('zet bij gedeelde muziek en concerten de vereniging erbij waar ze vandaan komen', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(verenigingApi.getPartnerships).mockResolvedValue([maakPartnerschap({ status: 'active' })]);
    vi.mocked(verenigingApi.getPartnerMusic).mockResolvedValue(GEDEELDE_MUZIEK);
    vi.mocked(verenigingApi.getPartnerEvents).mockResolvedValue(GEDEELDE_CONCERTEN);

    toon();
    await naarTabblad(gebruiker, 'partnerships');

    const muziek = (await screen.findByText('multiAssociation.partnerships.sharedMusic')).closest(
      'section',
    ) as HTMLElement;
    expect(within(muziek).getByText(/Mars der Medici/)).toBeInTheDocument();
    expect(within(muziek).getByText(/Piet Bakker/)).toBeInTheDocument();
    // Zonder deze naam lijkt de muziek van een ander die van jou.
    expect(within(muziek).getByText('Harmonie Zuid')).toBeInTheDocument();

    const concerten = (screen.getByText('multiAssociation.partnerships.sharedEvents') as HTMLElement).closest(
      'section',
    ) as HTMLElement;
    expect(within(concerten).getByText(/Nieuwjaarsconcert/)).toBeInTheDocument();
    expect(within(concerten).getByText(/De Hanzehof/)).toBeInTheDocument();
    expect(within(concerten).getByText('Harmonie Zuid')).toBeInTheDocument();
  });

  it('laat de gedeelde onderdelen helemaal weg als partners niets delen', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(verenigingApi.getPartnerships).mockResolvedValue([maakPartnerschap({ status: 'active' })]);

    toon();
    await naarTabblad(gebruiker, 'partnerships');

    await screen.findByText('Harmonie Zuid');
    // Twee lege kopjes onder elkaar zeggen niets; dan liever geen kopje.
    expect(screen.queryByText('multiAssociation.partnerships.sharedMusic')).not.toBeInTheDocument();
    expect(screen.queryByText('multiAssociation.partnerships.sharedEvents')).not.toBeInTheDocument();
  });
});

describe('verenigingsbeheer - leden', () => {
  it('toont de leden met hun rol en stand', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(verenigingApi.getAssociationMembers).mockResolvedValue(LEDEN);

    toon();
    await naarTabblad(gebruiker, 'members');

    const rij = (await screen.findByText('Anna de Vries')).closest('tr') as HTMLElement;
    expect(within(rij).getByText('anna@voorbeeld.nl')).toBeInTheDocument();
    expect(within(rij).getByRole('combobox')).toHaveValue('member');
    expect(within(rij).getByText('multiAssociation.associations.status.active')).toBeInTheDocument();

    const tweede = (screen.getByText('Bert Smit') as HTMLElement).closest('tr') as HTMLElement;
    expect(within(tweede).getByRole('combobox')).toHaveValue('admin');
    expect(within(tweede).getByText('multiAssociation.associations.status.inactive')).toBeInTheDocument();
  });

  it('past de rol aan op de gebruiker van die regel', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(verenigingApi.getAssociationMembers).mockResolvedValue(LEDEN);
    vi.mocked(verenigingApi.updateMemberRole).mockResolvedValue(undefined);

    toon();
    await naarTabblad(gebruiker, 'members');

    const rij = (await screen.findByText('Anna de Vries')).closest('tr') as HTMLElement;
    await gebruiker.selectOptions(within(rij).getByRole('combobox'), 'board');

    await waitFor(() => expect(verenigingApi.updateMemberRole).toHaveBeenCalledWith('lid-1', 'board'));
  });

  it('vraagt eerst om bevestiging voordat een lid verdwijnt', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(verenigingApi.getAssociationMembers).mockResolvedValue(LEDEN);
    vi.mocked(verenigingApi.removeMember).mockResolvedValue(undefined);

    toon();
    await naarTabblad(gebruiker, 'members');

    const rij = (await screen.findByText('Bert Smit')).closest('tr') as HTMLElement;
    await gebruiker.click(within(rij).getByRole('button'));

    const venster = await screen.findByRole('alertdialog');
    expect(venster).toHaveTextContent('multiAssociation.members.removeConfirm');
    expect(verenigingApi.removeMember).not.toHaveBeenCalled();

    await gebruiker.click(within(venster).getByRole('button', { name: 'common.delete' }));
    await waitFor(() => expect(verenigingApi.removeMember).toHaveBeenCalledWith('lid-2'));
  });

  it('meldt het als er geen leden zijn', async () => {
    const gebruiker = userEvent.setup();
    toon();
    await naarTabblad(gebruiker, 'members');

    expect(await screen.findByText('multiAssociation.members.noMembers')).toBeInTheDocument();
  });
});

describe('verenigingsbeheer - superbeheerders', () => {
  it('waarschuwt wat het recht inhoudt, ook als er nog niemand staat', async () => {
    const gebruiker = userEvent.setup();
    toon();
    await naarTabblad(gebruiker, 'superadmins');

    expect(await screen.findByText('multiAssociation.superAdmins.warning')).toBeInTheDocument();
    expect(screen.getByText('multiAssociation.superAdmins.noAdmins')).toBeInTheDocument();
  });

  it('neemt een superbeheerder pas weg na bevestiging', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(verenigingApi.getSuperAdmins).mockResolvedValue(SUPERBEHEERDERS);
    vi.mocked(verenigingApi.removeSuperAdmin).mockResolvedValue(undefined);

    toon();
    await naarTabblad(gebruiker, 'superadmins');

    const regel = (await screen.findByText('Bert Smit')).closest('div.flex.items-center') as HTMLElement;
    expect(within(regel).getByText('bert@voorbeeld.nl')).toBeInTheDocument();
    await gebruiker.click(within(regel).getByRole('button'));

    const venster = await screen.findByRole('alertdialog');
    expect(venster).toHaveTextContent('multiAssociation.superAdmins.removeConfirm');
    await gebruiker.click(within(venster).getByRole('button', { name: 'common.delete' }));

    await waitFor(() => expect(verenigingApi.removeSuperAdmin).toHaveBeenCalledWith('sb-1'));
  });
});

describe('verenigingsbeheer - logboek', () => {
  it('vraagt vijftig regels op en toont wie wat deed', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(verenigingApi.getActivityLog).mockResolvedValue(LOGBOEK);

    toon();
    await naarTabblad(gebruiker, 'activity');

    await waitFor(() => expect(verenigingApi.getActivityLog).toHaveBeenCalledWith({ limit: 50 }));

    const regel = (await screen.findByText(/multiAssociation.activity.actions.association.created/)).closest(
      'div.flex',
    ) as HTMLElement;
    expect(within(regel).getByText(/Anna de Vries/)).toBeInTheDocument();
    expect(within(regel).getByText(/name: Harmonie Oost/)).toBeInTheDocument();
  });

  it('laat de regel zonder naam en zonder bijzonderheden gewoon staan', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(verenigingApi.getActivityLog).mockResolvedValue(LOGBOEK);

    toon();
    await naarTabblad(gebruiker, 'activity');

    const regel = (await screen.findByText(/multiAssociation.activity.actions.partnership.ended/)).closest(
      'div.flex',
    ) as HTMLElement;
    expect(within(regel).queryByText(/multiAssociation.activity.by/)).not.toBeInTheDocument();
  });

  it('meldt het als er nog niets gebeurd is', async () => {
    const gebruiker = userEvent.setup();
    toon();
    await naarTabblad(gebruiker, 'activity');

    expect(await screen.findByText('multiAssociation.activity.noActivity')).toBeInTheDocument();
  });
});

/**
 * Hieronder geen karakterisering maar regressietests: ze leggen vast hoe het
 * hoort te zijn, na het koppelen van de formulierlabels.
 *
 * In beide vensters van deze pagina stond het label lós naast zijn veld, zonder
 * `htmlFor` en zonder `id`. Een schermlezer kondigt zo'n veld aan als
 * "bewerkbaar veld" zonder te zeggen wat erin moet, en klikken op het label zet
 * de aanwijzer niet in het veld. Achttien velden, waaronder de iban en het
 * kvk-nummer.
 *
 * `getByLabelText` is hier daarom geen willekeurige zoekmethode maar de kern
 * van de test: hij vindt een veld alleen als de koppeling er echt is.
 *
 * Bewijs: op de code zonder deze reparatie (gemeten door MultiAssociation.tsx
 * tijdelijk op HEAD te zetten) vallen alle vier de tests hieronder om met
 * "Unable to find a label with the text of...", plus de drie tests hierboven
 * die een veld op zijn label opzoeken.
 */
describe('verenigingsbeheer - herstelde fout: labels zonder veld', () => {
  it('koppelt elk veld van het verenigingsformulier aan zijn label', async () => {
    const gebruiker = userEvent.setup();
    toon();
    await gebruiker.click(await screen.findByRole('button', { name: /multiAssociation.associations.newAssociation/ }));

    const venster = await screen.findByRole('dialog');
    for (const veld of [
      'displayName',
      'website',
      'phone',
      'email',
      'billingEmail',
      'address',
      'postalCode',
      'city',
      'country',
      'kvkNumber',
      'iban',
    ]) {
      expect(within(venster).getByLabelText(`multiAssociation.form.${veld}`)).toBeInstanceOf(HTMLInputElement);
    }
    // Naam en slug apart: bij de naam staat een sterretje achter het label.
    expect(within(venster).getByLabelText(/multiAssociation.form.name/)).toBeInstanceOf(HTMLInputElement);
    expect(within(venster).getByLabelText('multiAssociation.form.slug')).toBeInstanceOf(HTMLInputElement);
  });

  it('koppelt elk veld van het abonnementsvenster aan zijn label', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(verenigingApi.getSuperAdminAssociations).mockResolvedValue(VERENIGINGEN);

    toon();
    const rij = (await screen.findByText('Harmonie Oost')).closest('tr') as HTMLElement;
    await gebruiker.click(within(rij).getByTitle('multiAssociation.associations.subscription'));

    const venster = await screen.findByRole('dialog');
    expect(within(venster).getByLabelText('multiAssociation.subscription.tier')).toBeInstanceOf(HTMLSelectElement);
    for (const veld of ['expires', 'maxMembers', 'maxOrchestras', 'maxStorage']) {
      expect(within(venster).getByLabelText(`multiAssociation.subscription.${veld}`)).toBeInstanceOf(HTMLInputElement);
    }
  });

  it('zet de aanwijzer in het veld als je op zijn label klikt', async () => {
    const gebruiker = userEvent.setup();
    toon();
    await gebruiker.click(await screen.findByRole('button', { name: /multiAssociation.associations.newAssociation/ }));

    const venster = await screen.findByRole('dialog');
    const veld = within(venster).getByLabelText('multiAssociation.form.iban');
    await gebruiker.click(within(venster).getByText('multiAssociation.form.iban'));

    expect(veld).toHaveFocus();
  });

  it('stuurt wat er in de gekoppelde velden staat ook echt mee', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(verenigingApi.createAssociationAsSuperAdmin).mockResolvedValue({ id: 'ver-nieuw', slug: 'nieuw' });

    toon();
    await gebruiker.click(await screen.findByRole('button', { name: /multiAssociation.associations.newAssociation/ }));

    const venster = await screen.findByRole('dialog');
    await gebruiker.type(within(venster).getByLabelText(/multiAssociation.form.name/), 'Nieuwe Harmonie');
    await gebruiker.type(within(venster).getByLabelText('multiAssociation.form.city'), 'Deventer');
    await gebruiker.type(within(venster).getByLabelText('multiAssociation.form.iban'), 'NL02ABNA0123456789');
    await gebruiker.click(within(venster).getByRole('button', { name: 'common.create' }));

    await waitFor(() =>
      expect(verenigingApi.createAssociationAsSuperAdmin).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Nieuwe Harmonie', city: 'Deventer', iban: 'NL02ABNA0123456789' }),
      ),
    );
  });
});
