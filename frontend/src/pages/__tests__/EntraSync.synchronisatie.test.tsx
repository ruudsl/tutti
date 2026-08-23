/**
 * Het scherm waarmee leden uit Entra ID worden overgenomen.
 *
 * Wat hier getest wordt is wat de beheerder ziet en doet: de lijst met
 * accounts, zoeken en filteren daarin, een selectie invoeren, de knoppen die
 * een synchronisatie starten, en het tabblad waarop functietitels aan
 * instrumenten worden gekoppeld. Elke serveraanroep loopt via een dubbelganger,
 * zodat ook het mislukken ervan een gewone toestand is om te tonen.
 *
 * Bijzondere aandacht voor deelmislukkingen: aan de serverkant bleek dat één
 * account zónder weergavenaam de hele ledensynchronisatie terugdraaide. Dezelfde
 * verzameling komt hier binnen, en één ontbrekende naam mag ook hier niet het
 * hele scherm meenemen.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor, configure } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import EntraSync from '../EntraSync';
import type { EntraUser, EntraUsersResponse, JobTitleMapping } from '../../api/entra';

// Het wachten van testing-library staat standaard op één seconde. Dat is krap
// zodra de dekkingsmeting meedraait: elke render gaat dan door de instrumentatie
// heen, en op een bezette machine tikt een `waitFor` na een knopdruk daar
// overheen. Dat zou een trage machine als een fout laten lezen.
configure({ asyncUtilTimeout: 4000 });

// De tijdslimiet per test staat standaard op vijf seconden. Een test die een
// heel formulier invult en verstuurt haalt dat ruim, maar niet als de
// dekkingsmeting meedraait én de machine gedeeld wordt: dan wordt dezelfde test
// een veelvoud trager en valt hij om op de klok in plaats van op de code.
vi.setConfig({ testTimeout: 15000 });

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (sleutel: string, opties?: Record<string, unknown>) =>
      opties && typeof opties.count === 'number'
        ? `${sleutel}:${opties.count}`
        : opties && typeof opties.jobTitle === 'string'
          ? `${sleutel}:${opties.jobTitle}`
          : sleutel,
    i18n: { language: 'nl' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

const { toonSucces, toonFout } = vi.hoisted(() => ({ toonSucces: vi.fn(), toonFout: vi.fn() }));
vi.mock('../../utils/toast', () => ({ showSuccess: toonSucces, showError: toonFout }));

vi.mock('../../components/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icoon-${name}`} />,
}));

const api = vi.hoisted(() => ({
  getMicrosoftConfig: vi.fn(),
  getInstruments: vi.fn(),
  getEntraUsers: vi.fn(),
  importEntraUsers: vi.fn(),
  syncEntraUsers: vi.fn(),
  syncEntraPhotos: vi.fn(),
  getJobTitleMappings: vi.fn(),
  createJobTitleMapping: vi.fn(),
  updateJobTitleMapping: vi.fn(),
  deleteJobTitleMapping: vi.fn(),
}));
vi.mock('../../api', () => api);

function gebruiker(overschrijving: Partial<EntraUser> & { id: string }): EntraUser {
  return {
    displayName: `Naam ${overschrijving.id}`,
    firstName: 'Voor',
    lastName: 'Achter',
    email: `${overschrijving.id}@harmonie.nl`,
    jobTitle: null,
    department: null,
    departments: [],
    isImported: false,
    hasMapping: false,
    mappedInstrumentId: null,
    ...overschrijving,
  };
}

function antwoord(overschrijving: Partial<EntraUsersResponse> = {}): EntraUsersResponse {
  const users = overschrijving.users ?? [
    gebruiker({ id: 'anna', displayName: 'Anna de Vries', email: 'anna@harmonie.nl', jobTitle: 'Trompettist' }),
    gebruiker({
      id: 'bram',
      displayName: 'Bram Jansen',
      email: 'bram@harmonie.nl',
      jobTitle: 'Dirigent',
      departments: ['Harmonie', 'Bestuur'],
      isImported: true,
    }),
  ];
  return {
    users,
    uniqueJobTitles: ['Trompettist', 'Dirigent'],
    uniqueDepartments: ['Harmonie'],
    newDepartments: [],
    totalCount: users.length,
    importedCount: users.filter((u) => u.isImported).length,
    ...overschrijving,
  };
}

const KOPPELING: JobTitleMapping = {
  id: 'kop-1',
  job_title: 'Trompettist',
  instrument_id: 'inst-1',
  instrument_name: 'Trompet',
  instrument_tuning: 'Bb',
};

function wikkel({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Tekent de pagina en wacht tot de gebruikerslijst binnen is. */
async function toonGebruikers() {
  // `delay: null` tikt de toetsaanslagen zonder tussenpauze in; anders zet
  // userEvent per teken een taak in de wachtrij en loopt het zoekveld op een
  // bezette machine tegen de tijdslimiet van vitest aan.
  const bediener = userEvent.setup({ delay: null });
  const hulp = render(<EntraSync />, { wrapper: wikkel });
  await screen.findByText('entraSync.entraUsers');
  await waitFor(() => expect(api.getEntraUsers).toHaveBeenCalled());
  return { bediener, ...hulp };
}

/** Zoekt de rij van een account op de e-mailtekst erin. */
function rijVan(email: string): HTMLElement {
  return screen.getByText(email).closest('tr') as HTMLElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  api.getMicrosoftConfig.mockResolvedValue({ configured: true });
  api.getInstruments.mockResolvedValue([
    { id: 'inst-1', name: 'Trompet', tuning: 'Bb' },
    { id: 'inst-2', name: 'Hoorn', tuning: null },
  ]);
  api.getEntraUsers.mockResolvedValue(antwoord());
  api.getJobTitleMappings.mockResolvedValue([KOPPELING]);
  api.importEntraUsers.mockResolvedValue({ message: '1 lid overgenomen', imported: 1, skipped: 0, errors: [] });
  api.syncEntraUsers.mockResolvedValue({ message: 'bijgewerkt', updated: 1, created: 0, skipped: 0 });
  api.syncEntraPhotos.mockResolvedValue({ message: 'fotos', synced: 1, skipped: 0, failed: 0 });
  api.createJobTitleMapping.mockResolvedValue({});
  api.updateJobTitleMapping.mockResolvedValue({});
  api.deleteJobTitleMapping.mockResolvedValue({});
});

describe('entra-koppeling - de accounts uit Microsoft', () => {
  it('zegt dat er niets in te stellen valt zolang de koppeling uit staat', async () => {
    api.getMicrosoftConfig.mockResolvedValue({ configured: false });
    render(<EntraSync />, { wrapper: wikkel });

    expect(await screen.findByText('entraSync.notConfigured')).toBeInTheDocument();
    expect(screen.getByText('entraSync.configureInSettings')).toBeInTheDocument();
    // Geen tabbladen en vooral: er wordt niets bij Microsoft opgehaald.
    expect(screen.queryByRole('button', { name: 'entraSync.tabUsers' })).not.toBeInTheDocument();
    expect(api.getEntraUsers).not.toHaveBeenCalled();
  });

  it('toont per account of het al is overgenomen, met de afdelingen erbij', async () => {
    await toonGebruikers();

    expect(within(rijVan('anna@harmonie.nl')).getByText('entraSync.notImported')).toBeInTheDocument();
    expect(within(rijVan('bram@harmonie.nl')).getByText('entraSync.imported')).toBeInTheDocument();
    expect(within(rijVan('bram@harmonie.nl')).getByText('Bestuur')).toBeInTheDocument();

    // Een al overgenomen account kan niet nog eens aangevinkt worden.
    expect(within(rijVan('bram@harmonie.nl')).getByRole('checkbox')).toBeDisabled();
    expect(within(rijVan('anna@harmonie.nl')).getByRole('checkbox')).toBeEnabled();

    // De telling boven de tabel: twee accounts, één overgenomen, één nog niet.
    expect(screen.getByText('entraSync.totalUsers:2')).toBeInTheDocument();
    expect(screen.getByText('entraSync.importedUsers:1')).toBeInTheDocument();
    expect(screen.getByText('entraSync.notImportedUsers:1')).toBeInTheDocument();
  });

  it('meldt het als de lijst niet opgehaald kan worden', async () => {
    api.getEntraUsers.mockRejectedValue({ response: { data: { error: 'Geen toegang tot Graph' } } });
    render(<EntraSync />, { wrapper: wikkel });

    await waitFor(() => expect(toonFout).toHaveBeenCalledWith('Geen toegang tot Graph'));
    expect(await screen.findByText('entraSync.noUsersFound')).toBeInTheDocument();
  });

  it('wijst op nieuwe afdelingen die nog niet bekend zijn', async () => {
    api.getEntraUsers.mockResolvedValue(antwoord({ newDepartments: ['Jeugdorkest'] }));
    await toonGebruikers();

    expect(screen.getByText('entraSync.newDepartmentsNotice')).toBeInTheDocument();
    expect(screen.getByText('Jeugdorkest')).toBeInTheDocument();
  });

  it('filtert op naam, op e-mailadres en op wel of niet overgenomen', async () => {
    const { bediener } = await toonGebruikers();
    const zoekveld = screen.getByPlaceholderText('entraSync.searchPlaceholder');

    await bediener.type(zoekveld, 'anna@');
    expect(screen.getByText('anna@harmonie.nl')).toBeInTheDocument();
    expect(screen.queryByText('bram@harmonie.nl')).not.toBeInTheDocument();

    await bediener.clear(zoekveld);
    await bediener.type(zoekveld, 'dirigent');
    expect(screen.getByText('bram@harmonie.nl')).toBeInTheDocument();
    expect(screen.queryByText('anna@harmonie.nl')).not.toBeInTheDocument();

    await bediener.clear(zoekveld);
    await bediener.selectOptions(screen.getByRole('combobox'), 'imported');
    expect(screen.getByText('bram@harmonie.nl')).toBeInTheDocument();
    expect(screen.queryByText('anna@harmonie.nl')).not.toBeInTheDocument();

    await bediener.selectOptions(screen.getByRole('combobox'), 'not-imported');
    expect(screen.getByText('anna@harmonie.nl')).toBeInTheDocument();
    expect(screen.queryByText('bram@harmonie.nl')).not.toBeInTheDocument();

    await bediener.type(zoekveld, 'bestaat niet');
    expect(screen.getByText('entraSync.noUsersFound')).toBeInTheDocument();
  });

  /**
   * BEWIJS. Zonder de reparatie in EntraSync.tsx (`u.displayName?.toLowerCase()`
   * in plaats van `u.displayName.toLowerCase()`) klapt deze test op een
   * TypeError: `displayName` is bij Microsoft Graph een optioneel veld, en één
   * account zonder weergavenaam - een gedeelde postbus, een dienstaccount -
   * neemt bij de eerste toetsaanslag in het zoekveld het hele scherm mee. Niet
   * alleen die ene rij: de hele lijst verdwijnt, precies zoals aan de
   * serverkant één naamloos account de hele synchronisatie terugdraaide.
   *
   * Rood zonder de reparatie met "Cannot read properties of undefined
   * (reading 'toLowerCase')".
   */
  it('blijft overeind als één account geen weergavenaam heeft', async () => {
    const naamloos = gebruiker({ id: 'balie', email: 'balie@harmonie.nl', jobTitle: 'Kaartverkoop' });
    delete (naamloos as Partial<EntraUser>).displayName;
    api.getEntraUsers.mockResolvedValue(
      antwoord({
        users: [gebruiker({ id: 'anna', displayName: 'Anna de Vries', email: 'anna@harmonie.nl' }), naamloos],
      }),
    );

    const { bediener } = await toonGebruikers();
    // Zonder zoekterm staat het naamloze account er gewoon bij.
    expect(rijVan('balie@harmonie.nl')).toBeInTheDocument();

    await bediener.type(screen.getByPlaceholderText('entraSync.searchPlaceholder'), 'balie@');

    // De lijst leeft nog, en het naamloze account is op e-mailadres te vinden.
    expect(rijVan('balie@harmonie.nl')).toBeInTheDocument();
    expect(screen.queryByText('anna@harmonie.nl')).not.toBeInTheDocument();

    // En zoeken op een naam die een ánder account wél heeft werkt gewoon door.
    await bediener.clear(screen.getByPlaceholderText('entraSync.searchPlaceholder'));
    await bediener.type(screen.getByPlaceholderText('entraSync.searchPlaceholder'), 'Anna');
    expect(rijVan('anna@harmonie.nl')).toBeInTheDocument();
    expect(screen.queryByText('balie@harmonie.nl')).not.toBeInTheDocument();
  });
});

describe('entra-koppeling - accounts overnemen', () => {
  it('neemt de aangevinkte accounts over en haalt daarna de lijst opnieuw op', async () => {
    const { bediener } = await toonGebruikers();

    await bediener.click(within(rijVan('anna@harmonie.nl')).getByRole('checkbox'));
    expect(screen.getByText('entraSync.selectedCount:1')).toBeInTheDocument();

    await bediener.click(screen.getByRole('button', { name: 'entraSync.importSelected' }));

    await waitFor(() => expect(api.importEntraUsers).toHaveBeenCalledWith(['anna']));
    await waitFor(() => expect(toonSucces).toHaveBeenCalledWith('1 lid overgenomen'));
    // De selectie is opgeruimd en de lijst is opnieuw opgehaald.
    await waitFor(() => expect(screen.queryByText('entraSync.selectedCount:1')).not.toBeInTheDocument());
    expect(api.getEntraUsers).toHaveBeenCalledTimes(2);
  });

  it('houdt de selectie vast als het overnemen mislukt', async () => {
    api.importEntraUsers.mockRejectedValue({ response: { data: { error: 'Licentie op' } } });
    const { bediener } = await toonGebruikers();

    await bediener.click(within(rijVan('anna@harmonie.nl')).getByRole('checkbox'));
    await bediener.click(screen.getByRole('button', { name: 'entraSync.importSelected' }));

    await waitFor(() => expect(toonFout).toHaveBeenCalledWith('Licentie op'));
    // Niets is stilletjes weggegooid: de keuze staat er nog, dus opnieuw
    // proberen kan zonder alles opnieuw aan te vinken.
    expect(screen.getByText('entraSync.selectedCount:1')).toBeInTheDocument();
    expect(api.getEntraUsers).toHaveBeenCalledTimes(1);
  });

  it('vinkt met één druk alles aan wat nog niet is overgenomen, en laat dat weer los', async () => {
    const { bediener } = await toonGebruikers();

    await bediener.click(screen.getByRole('button', { name: 'entraSync.selectAllNotImported' }));
    // Alleen anna: bram is al overgenomen.
    expect(screen.getByText('entraSync.selectedCount:1')).toBeInTheDocument();
    expect(within(rijVan('anna@harmonie.nl')).getByRole('checkbox')).toBeChecked();

    await bediener.click(screen.getByRole('button', { name: 'entraSync.clearSelection' }));
    expect(screen.queryByText('entraSync.selectedCount:1')).not.toBeInTheDocument();
    expect(within(rijVan('anna@harmonie.nl')).getByRole('checkbox')).not.toBeChecked();
  });

  it('haalt een vinkje weer weg als er nog een keer op geklikt wordt', async () => {
    const { bediener } = await toonGebruikers();
    const vakje = within(rijVan('anna@harmonie.nl')).getByRole('checkbox');

    await bediener.click(vakje);
    expect(vakje).toBeChecked();
    await bediener.click(vakje);
    expect(vakje).not.toBeChecked();
    expect(screen.queryByText(/entraSync.selectedCount/)).not.toBeInTheDocument();
  });

  it('synchroniseert bestaande leden zonder nieuwe aan te maken, of juist mét', async () => {
    const { bediener } = await toonGebruikers();

    await bediener.click(screen.getByRole('button', { name: 'entraSync.syncExisting' }));
    await waitFor(() => expect(api.syncEntraUsers).toHaveBeenCalledWith(false));

    await bediener.click(screen.getByRole('button', { name: 'entraSync.syncAndCreate' }));
    await waitFor(() => expect(api.syncEntraUsers).toHaveBeenCalledWith(true));

    await waitFor(() => expect(toonSucces).toHaveBeenCalledTimes(2));
  });

  it('meldt een mislukte synchronisatie met de tekst van de server', async () => {
    api.syncEntraUsers.mockRejectedValue({ response: { data: { error: 'Graph gaf 503' } } });
    const { bediener } = await toonGebruikers();

    await bediener.click(screen.getByRole('button', { name: 'entraSync.syncExisting' }));

    await waitFor(() => expect(toonFout).toHaveBeenCalledWith('Graph gaf 503'));
    // De knop staat weer aan: het is te proberen.
    expect(screen.getByRole('button', { name: 'entraSync.syncExisting' })).toBeEnabled();
  });

  it('haalt de profielfotos op en meldt het als dat niet lukt', async () => {
    const { bediener } = await toonGebruikers();

    await bediener.click(screen.getByRole('button', { name: 'entraSync.syncPhotos' }));
    await waitFor(() => expect(toonSucces).toHaveBeenCalledWith('fotos'));

    api.syncEntraPhotos.mockRejectedValue({});
    await bediener.click(screen.getByRole('button', { name: 'entraSync.syncPhotos' }));
    // Zonder tekst van de server valt hij terug op de eigen melding.
    await waitFor(() => expect(toonFout).toHaveBeenCalledWith('entraSync.syncPhotosError'));
  });
});

describe('entra-koppeling - functietitels aan instrumenten koppelen', () => {
  /** Gaat naar het tabblad met de koppelingen en wacht tot ze binnen zijn. */
  async function naarKoppelingen(bediener: ReturnType<typeof userEvent.setup>) {
    await bediener.click(screen.getByRole('button', { name: /entraSync.tabMappings/ }));
    await waitFor(() => expect(api.getJobTitleMappings).toHaveBeenCalled());
    await screen.findByText('entraSync.jobTitleMappings');
  }

  it('telt op het tabblad hoeveel functietitels nog nergens aan hangen', async () => {
    await toonGebruikers();

    // Twee functietitels bij Microsoft, één ervan is gekoppeld: blijft één.
    // Op het gebruikerstabblad zijn de koppelingen nog niet opgehaald, dus
    // tellen ze allebei nog mee.
    const tabblad = screen.getByRole('button', { name: /entraSync.tabMappings/ });
    expect(within(tabblad).getByText('2')).toBeInTheDocument();
  });

  it('toont de bestaande koppelingen met stemming en de nog losse functietitels', async () => {
    const { bediener } = await toonGebruikers();
    await naarKoppelingen(bediener);

    const rij = screen.getByText('Trompettist').closest('tr') as HTMLElement;
    expect(within(rij).getByText('Trompet')).toBeInTheDocument();
    expect(within(rij).getByText('(Bb)')).toBeInTheDocument();

    // "Dirigent" hangt nergens aan en staat als knop bij de waarschuwing.
    expect(screen.getByText('entraSync.unmappedJobTitles')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dirigent' })).toBeInTheDocument();
  });

  it('weigert een koppeling zonder instrument en maakt hem daarna wel aan', async () => {
    const { bediener } = await toonGebruikers();
    await naarKoppelingen(bediener);

    await bediener.click(screen.getByRole('button', { name: '+ entraSync.addMapping' }));
    const veld = await screen.findByLabelText(/entraSync.jobTitleLabel/);
    await bediener.type(veld, 'Hoornist');

    // Zonder instrument gaat er niets de deur uit. Beide velden staan op
    // `required`, dus de browser houdt het formulier zelf tegen; de eigen
    // controle in handleCreateMapping komt daar niet eens aan te pas.
    await bediener.click(screen.getByRole('button', { name: 'common.save' }));
    expect(api.createJobTitleMapping).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/entraSync.instrumentLabel/)).toBeInvalid();

    await bediener.selectOptions(screen.getByLabelText(/entraSync.instrumentLabel/), 'inst-2');
    await bediener.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() =>
      expect(api.createJobTitleMapping).toHaveBeenCalledWith({ jobTitle: 'Hoornist', instrumentId: 'inst-2' }),
    );
    await waitFor(() => expect(toonSucces).toHaveBeenCalledWith('entraSync.mappingCreated'));
    // Het venster is dicht en de lijst is opnieuw opgehaald.
    await waitFor(() => expect(screen.queryByLabelText(/entraSync.jobTitleLabel/)).not.toBeInTheDocument());
    expect(api.getJobTitleMappings).toHaveBeenCalledTimes(2);
  });

  it('vult de functietitel alvast in als je op een losse titel klikt', async () => {
    const { bediener } = await toonGebruikers();
    await naarKoppelingen(bediener);

    await bediener.click(screen.getByRole('button', { name: 'Dirigent' }));

    expect(await screen.findByLabelText(/entraSync.jobTitleLabel/)).toHaveValue('Dirigent');
  });

  it('springt vanuit de accountlijst naar een nieuwe koppeling voor die functietitel', async () => {
    const { bediener } = await toonGebruikers();

    // Anna is trompettist en die titel is nog niet gekoppeld zolang het
    // koppelingentabblad niet geopend is.
    await bediener.click(within(rijVan('anna@harmonie.nl')).getByRole('button', { name: 'entraSync.createMapping' }));

    expect(await screen.findByLabelText(/entraSync.jobTitleLabel/)).toHaveValue('Trompettist');
    expect(screen.getByText('entraSync.jobTitleMappings')).toBeInTheDocument();
  });

  it('laat een gekoppelde functietitel als gekoppeld zien in de accountlijst', async () => {
    api.getEntraUsers.mockResolvedValue(
      antwoord({
        users: [
          gebruiker({
            id: 'anna',
            displayName: 'Anna de Vries',
            email: 'anna@harmonie.nl',
            jobTitle: 'Trompettist',
            hasMapping: true,
          }),
        ],
      }),
    );
    await toonGebruikers();

    const rij = rijVan('anna@harmonie.nl');
    expect(within(rij).getByText('entraSync.mapped')).toBeInTheDocument();
    expect(within(rij).queryByRole('button', { name: 'entraSync.createMapping' })).not.toBeInTheDocument();
  });

  it('wijzigt bij het bewerken alleen het instrument, niet de functietitel', async () => {
    const { bediener } = await toonGebruikers();
    await naarKoppelingen(bediener);

    await bediener.click(screen.getByRole('button', { name: 'common.edit' }));

    const titelveld = await screen.findByLabelText(/entraSync.jobTitleLabel/);
    expect(titelveld).toHaveValue('Trompettist');
    expect(titelveld).toBeDisabled();

    await bediener.selectOptions(screen.getByLabelText(/entraSync.instrumentLabel/), 'inst-2');
    await bediener.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(api.updateJobTitleMapping).toHaveBeenCalledWith('kop-1', 'inst-2'));
    await waitFor(() => expect(toonSucces).toHaveBeenCalledWith('entraSync.mappingUpdated'));
  });

  it('verwijdert een koppeling pas na bevestiging', async () => {
    const { bediener } = await toonGebruikers();
    await naarKoppelingen(bediener);

    await bediener.click(screen.getByRole('button', { name: 'common.delete' }));
    // De vraag noemt de functietitel waar het over gaat.
    const venster = await screen.findByRole('alertdialog');
    expect(within(venster).getByText('entraSync.deleteMappingConfirm:Trompettist')).toBeInTheDocument();

    // Eerst afzien: er gebeurt niets.
    await bediener.click(within(venster).getByRole('button', { name: 'common.cancel' }));
    expect(api.deleteJobTitleMapping).not.toHaveBeenCalled();

    await bediener.click(screen.getByRole('button', { name: 'common.delete' }));
    const opnieuw = await screen.findByRole('alertdialog');
    await bediener.click(within(opnieuw).getByRole('button', { name: 'common.delete' }));

    await waitFor(() => expect(api.deleteJobTitleMapping).toHaveBeenCalledWith('kop-1'));
    await waitFor(() => expect(toonSucces).toHaveBeenCalledWith('entraSync.mappingDeleted'));
  });

  it('meldt het als de koppelingen niet opgehaald kunnen worden', async () => {
    api.getJobTitleMappings.mockRejectedValue({ response: { data: { error: 'Database dicht' } } });
    const { bediener } = await toonGebruikers();

    await bediener.click(screen.getByRole('button', { name: /entraSync.tabMappings/ }));

    await waitFor(() => expect(toonFout).toHaveBeenCalledWith('Database dicht'));
    expect(await screen.findByText('entraSync.noMappings')).toBeInTheDocument();
  });
});
