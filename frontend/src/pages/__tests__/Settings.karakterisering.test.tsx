/**
 * Vangnet voor de instellingenpagina.
 *
 * Settings.tsx is 1495 regels zonder één losse component en zonder
 * tabbladvertakking: één doorlopende stapel kaarten, met alle toestand,
 * formulieren en modals in dezelfde functie. Er stond geen enkele test op.
 *
 * Deze tests keuren niets goed. Ze leggen vast wat de pagina op dit moment
 * doet - welke secties er in welke volgorde staan, welke aanroepen bij het
 * openen gebeuren, wat er verschijnt en wat juist verborgen blijft - zodat een
 * verschuiving meteen opvalt in plaats van pas als iemand de pagina opent.
 * Zo'n test heet een karakteriseringstest: hij beschrijft het bestaande
 * gedrag, ook waar dat gedrag misschien niet ideaal is.
 *
 * Twee dingen zijn hier bewust vastgelegd omdat ze makkelijk sneuvelen:
 *   - Dat álle zes configuratie-queries onvoorwaardelijk draaien. Er staat
 *     nergens een `enabled`. De M365-groepen worden dus opgehaald ook als de
 *     sectie die ze toont verborgen blijft omdat Microsoft niet ingesteld is.
 *     Dat is niet fraai, maar het is wat er staat.
 *   - Dat er één bevestigingsdialoog is voor vijf verschillende
 *     verwijderacties, gestuurd door één stukje toestand. Dat is de knoop die
 *     de secties aan elkaar bindt; wie de secties uit elkaar haalt, moet
 *     hierlangs.
 *
 * NA HET HERONTWERP (map `src/pages/Settings/`). De pagina is uit elkaar
 * gehaald: elke kaart is een eigen component met zijn eigen toestand, zijn eigen
 * query en zijn eigen bevestigingsdialoog. Beide hierboven vastgelegde punten
 * zijn daarmee veranderd, en vier tests zijn aangepast in plaats van
 * weggehaald. Bij elke aanpassing staat wat er anders is en waarom. De
 * bijbehorende nieuwe tests staan in `Settings.herontwerp.test.tsx`.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import Settings from '../Settings';
import ThemeSettingsPage from '../ThemeSettings';
import { ConfirmProvider } from '../../hooks/useConfirm';
import { SETTINGS_STALE_TIME } from '../../hooks/useSettings';
import * as api from '../../api';
import type { AssociationSettings, MicrosoftConfig, SmtpConfig, TelegramConfig, WhatsAppConfig } from '../../types';

vi.mock('../../api');

vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));

// `initReactI18next` hoort erbij omdat de pagina via andere modules de echte
// i18n-opzet meetrekt, en die roept het aan tijdens het laden van de module.
// Zonder deze export klapt het bestand al bij de import.
//
// De pagina gebruikt op veel plekken `t('sleutel', 'terugvalwaarde')`. De mock
// negeert die tweede waarde en geeft de sleutel terug, net als bij de andere
// karakteriseringstests.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (sleutel: string) => sleutel }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../components/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

vi.mock('../../components/GoogleDriveSettings', () => ({
  GoogleDriveSettings: () => <div data-testid="google-drive" />,
}));

vi.mock('../../components/OfflineManager', () => ({
  OfflineManager: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div data-testid="offline-beheer" /> : null),
}));

vi.mock('../../components/LazyImage', () => ({
  LazyImage: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

vi.mock('../../utils/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));

const instellingen: AssociationSettings = {
  name: 'tutti',
  displayName: 'Harmonie Tutti',
  logoPath: null,
  logoUrl: null,
  theme: null,
};

const microsoftUit: MicrosoftConfig = {
  clientId: '',
  tenantId: '',
  enabled: false,
  configured: false,
  redirectUri: 'https://tutti.example/callback',
};

const smtpUit: SmtpConfig = {
  host: '',
  port: 587,
  secure: false,
  user: '',
  from: '',
  enabled: false,
  configured: false,
};

const telegramUit: TelegramConfig = { tokenPreview: '', configured: false, enabled: false };

const whatsappUit: WhatsAppConfig = {
  provider: 'meta',
  enabled: false,
  configured: false,
  meta: { phoneNumberId: '', accessTokenPreview: '', configured: false },
  twilio: { accountSid: '', authTokenPreview: '', whatsappFrom: '', configured: false },
};

/**
 * De pagina hangt aan `src/api.ts`, een module met alle endpoints erin. Alleen
 * de aanroepen die de instellingenpagina doet krijgen hier een antwoord; de
 * rest blijft de lege automock.
 */
function zetApiKlaar(): void {
  vi.mocked(api.getSettings).mockResolvedValue(instellingen);
  vi.mocked(api.getMicrosoftConfig).mockResolvedValue(microsoftUit);
  vi.mocked(api.getSmtpConfig).mockResolvedValue(smtpUit);
  vi.mocked(api.getTelegramConfig).mockResolvedValue(telegramUit);
  vi.mocked(api.getWhatsAppConfig).mockResolvedValue(whatsappUit);
  vi.mocked(api.getM365GroupMappings).mockResolvedValue([]);
  vi.mocked(api.getAdminConcertTypes).mockResolvedValue({ types: [], defaults: [] });
  vi.mocked(api.getOrchestras).mockResolvedValue([]);
}

function wikkel({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

/** De kopjes van de secties, in de volgorde waarin ze op de pagina staan. */
function sectiekoppen(): (string | undefined)[] {
  return screen.getAllByRole('heading', { level: 2 }).map((kop) => kop.textContent?.trim());
}

beforeEach(() => {
  vi.clearAllMocks();
  zetApiKlaar();
});

describe('instellingenpagina - vastgelegd gedrag', () => {
  it('toont negen sectiekoppen, in deze volgorde', async () => {
    render(<Settings />, { wrapper: wikkel });

    await screen.findByText('settings.title');

    expect(sectiekoppen()).toEqual([
      'settings.organization',
      'settings.logo',
      'settings.microsoft.title',
      'settings.smtp.title',
      'settings.telegram.title',
      'settings.whatsapp.title',
      'offline.manager',
      'settings.concertTypes.title',
      'settings.support.title',
    ]);
  });

  // De Google Drive-instellingen zijn al een eigen component; die staat tussen
  // WhatsApp en de offline-opslag en heeft geen eigen kopje op deze pagina.
  it('zet de Google Drive-instellingen tussen de kaarten', async () => {
    render(<Settings />, { wrapper: wikkel });

    expect(await screen.findByTestId('google-drive')).toBeInTheDocument();
  });

  // AANGEPAST NA HET HERONTWERP. `getM365GroupMappings` stond hier ook in.
  // Die aanroep gebeurt niet meer zolang Microsoft niet ingesteld is; zie de
  // test hieronder. De overige zeven aanroepen zijn ongewijzigd.
  it('haalt bij het openen de configuraties van de zichtbare secties op, plus concerttypen en orkesten', async () => {
    render(<Settings />, { wrapper: wikkel });

    await waitFor(() => {
      expect(api.getSettings).toHaveBeenCalled();
      expect(api.getMicrosoftConfig).toHaveBeenCalled();
      expect(api.getSmtpConfig).toHaveBeenCalled();
      expect(api.getTelegramConfig).toHaveBeenCalled();
      expect(api.getWhatsAppConfig).toHaveBeenCalled();
      expect(api.getAdminConcertTypes).toHaveBeenCalled();
      expect(api.getOrchestras).toHaveBeenCalled();
    });
  });

  // OMGEDRAAID NA HET HERONTWERP. Hier stond dat de M365-groepen óók werden
  // opgehaald als de sectie die ze toont verborgen bleef - het gevolg van zes
  // queries zonder `enabled`. Die query staat nu in de sectie zelf, met
  // `enabled: microsoftIngesteld`. Wie geen Microsoft gebruikt haalt dus geen
  // groepen meer op. Dat is de bewuste gedragswijziging; de test blijft staan,
  // maar meet nu het omgekeerde.
  it('haalt de M365-groepen niet op zolang die sectie verborgen blijft', async () => {
    render(<Settings />, { wrapper: wikkel });

    await waitFor(() => expect(api.getSmtpConfig).toHaveBeenCalled());

    expect(api.getM365GroupMappings).not.toHaveBeenCalled();
    expect(screen.queryByText('settings.m365Groups.title')).not.toBeInTheDocument();
  });

  it('toont de M365-groepen pas als Microsoft ingesteld is', async () => {
    vi.mocked(api.getMicrosoftConfig).mockResolvedValue({
      ...microsoftUit,
      configured: true,
      clientId: 'abc',
      tenantId: 'def',
    });

    render(<Settings />, { wrapper: wikkel });

    expect(await screen.findByText('settings.m365Groups.title')).toBeInTheDocument();
    // AANGEPAST NA HET HERONTWERP: `getByText` werd `findByText`. De query van
    // een sectie start nu pas als die sectie er staat, en de secties verschijnen
    // pas als de instellingen binnen zijn. De lijst komt dus een tel later dan
    // het kopje; wachten hoort daarbij.
    expect(await screen.findByText('settings.m365Groups.noMappings')).toBeInTheDocument();
  });

  it('toont een laadmelding zolang de instellingen nog binnenkomen', () => {
    vi.mocked(api.getSettings).mockReturnValue(new Promise(() => {}));

    render(<Settings />, { wrapper: wikkel });

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('settings.title')).not.toBeInTheDocument();
  });

  // Een pagina die bij een mislukte aanroep helemaal niets toont is niet van
  // een kapotte pagina te onderscheiden. Dat alle secties blijven staan is dus
  // gedrag dat een verhuizing moet overleven.
  it('houdt alle secties staan als het ophalen mislukt', async () => {
    vi.mocked(api.getSettings).mockRejectedValue(new Error('geen verbinding'));
    vi.mocked(api.getMicrosoftConfig).mockRejectedValue(new Error('geen verbinding'));

    render(<Settings />, { wrapper: wikkel });

    expect(await screen.findByText('settings.title')).toBeInTheDocument();
    expect(sectiekoppen()).toHaveLength(9);
  });

  it('vult de organisatienaam met wat er opgehaald is', async () => {
    render(<Settings />, { wrapper: wikkel });

    const veld = (await screen.findByLabelText('settings.organizationName')) as HTMLInputElement;
    await waitFor(() => expect(veld.value).toBe('Harmonie Tutti'));
  });

  /**
   * OMGEDRAAID NA HET HERONTWERP. Hier stond vastgelegd dat het naamveld zich
   * meteen weer vulde zodra je het leegmaakte: het effect dat de opgehaalde
   * naam overnam keek naar `!displayName` en had `displayName` in zijn
   * afhankelijkheden staan. Dat is gerepareerd - het effect hangt nu alleen aan
   * de naam die van de server komt - dus de test meet nu het omgekeerde.
   *
   * Wat er misging als je doortypte, en wat er bij het opslaan van een leeg veld
   * gebeurt, staat in `Settings.herontwerp.test.tsx`.
   */
  it('houdt het naamveld leeg als je het leegmaakt', async () => {
    const gebruiker = userEvent.setup();
    render(<Settings />, { wrapper: wikkel });

    const veld = (await screen.findByLabelText('settings.organizationName')) as HTMLInputElement;
    await waitFor(() => expect(veld.value).toBe('Harmonie Tutti'));

    await gebruiker.clear(veld);

    expect((screen.getByLabelText('settings.organizationName') as HTMLInputElement).value).toBe('');
  });

  it('slaat op wat er in het naamveld staat', async () => {
    const gebruiker = userEvent.setup();
    render(<Settings />, { wrapper: wikkel });

    const veld = (await screen.findByLabelText('settings.organizationName')) as HTMLInputElement;
    await waitFor(() => expect(veld.value).toBe('Harmonie Tutti'));

    await gebruiker.type(veld, ' Noord');
    await gebruiker.click(screen.getAllByText('common.save')[0]);

    await waitFor(() => expect(api.updateSettings).toHaveBeenCalledWith({ displayName: 'Harmonie Tutti Noord' }));
  });

  // Eén dialoog voor vijf verwijderacties: het bericht hangt af van welke actie
  // er in de gedeelde toestand staat. Dit is de plek waar de secties elkaar
  // raken.
  it('gebruikt één bevestigingsdialoog voor het verwijderen van het logo', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(api.getSettings).mockResolvedValue({ ...instellingen, logoUrl: '/logo.png' });

    render(<Settings />, { wrapper: wikkel });

    await gebruiker.click(await screen.findByText('settings.removeLogo'));

    expect(await screen.findByText('settings.removeLogoConfirm')).toBeInTheDocument();
  });

  it('gebruikt diezelfde dialoog voor het verwijderen van de SMTP-instellingen', async () => {
    const gebruiker = userEvent.setup();
    vi.mocked(api.getSmtpConfig).mockResolvedValue({ ...smtpUit, configured: true, host: 'smtp.example' });

    render(<Settings />, { wrapper: wikkel });

    await gebruiker.click(await screen.findByText('settings.smtp.remove'));

    expect(await screen.findByText('settings.smtp.removeConfirm')).toBeInTheDocument();
  });

  it('opent het formulier voor een nieuw concerttype pas na een klik', async () => {
    const gebruiker = userEvent.setup();
    render(<Settings />, { wrapper: wikkel });

    await screen.findByText('settings.title');
    expect(screen.queryByText('settings.concertTypes.valueHelp')).not.toBeInTheDocument();

    // AANGEPAST NA HET HERONTWERP: `getByText` werd `findByText`, om dezelfde
    // reden als bij de M365-groepen hierboven. De concerttypen worden opgehaald
    // door de sectie zelf, dus de knop verschijnt een tel na het kopje.
    await gebruiker.click(await screen.findByText('+ settings.concertTypes.add'));

    expect(await screen.findByText('settings.concertTypes.valueHelp')).toBeInTheDocument();
  });

  // De knop om standaardwaarden aan te maken hoort alleen te verschijnen zolang
  // er nog geen concerttypen zijn.
  it('biedt standaardwaarden aan zolang er geen concerttypen zijn', async () => {
    render(<Settings />, { wrapper: wikkel });

    expect(await screen.findByText('settings.concertTypes.initDefaults')).toBeInTheDocument();
    expect(screen.getByText('settings.concertTypes.noTypes')).toBeInTheDocument();
  });

  it('laat de standaardwaardenknop weg zodra er concerttypen zijn', async () => {
    vi.mocked(api.getAdminConcertTypes).mockResolvedValue({
      types: [{ id: 'ct1', value: 'christmas', label: 'Kerstconcert', sortOrder: 1 }],
      defaults: [],
    });

    render(<Settings />, { wrapper: wikkel });

    expect(await screen.findByText('Kerstconcert')).toBeInTheDocument();
    expect(screen.queryByText('settings.concertTypes.initDefaults')).not.toBeInTheDocument();
  });

  it('opent het offline-beheer pas na een klik', async () => {
    const gebruiker = userEvent.setup();
    render(<Settings />, { wrapper: wikkel });

    await screen.findByText('settings.title');
    expect(screen.queryByTestId('offline-beheer')).not.toBeInTheDocument();

    await gebruiker.click(screen.getByText('offline.manage'));

    expect(await screen.findByTestId('offline-beheer')).toBeInTheDocument();
  });

  it('wijst met de drie supportkaarten naar meldingen, handleiding en toegankelijkheid', async () => {
    render(<Settings />, { wrapper: wikkel });

    await screen.findByText('settings.title');

    const support = screen.getByText('settings.support.title').closest('.card') as HTMLElement;
    const verwijzingen = within(support)
      .getAllByRole('link')
      .map((link) => link.getAttribute('href'));

    expect(verwijzingen).toEqual(['/issues', '/user-guide', '/accessibility']);
  });
});

/**
 * De instellingenpagina en de themapagina vroegen allebei hun eigen `useQuery`
 * aan op cachesleutel `['settings']`, elk met een eigen opties-blok eronder.
 * React Query houdt per sleutel één query bij, en de opties die daarvoor gelden
 * zijn die van de waarnemer die als eerste aanhaakt. Welke `staleTime` er dus
 * gold, hing af van welke pagina je het eerst opende.
 *
 * De twee blokken waren woord voor woord gelijk, dus in de praktijk viel het
 * niet op - maar dat is geen eigenschap van de code, dat was toeval. Beide
 * pagina's halen de instellingen nu uit `useSettings` (zie
 * `src/hooks/useSettings.ts`). Deze tests leggen vast wat dat oplevert: één
 * query, één set opties, ongeacht de volgorde waarin de pagina's renderen.
 */
describe('de instellingen komen uit één query', () => {
  function maakClient(): QueryClient {
    return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  }

  function wikkelMet(client: QueryClient) {
    return function Wikkel({ children }: { children: ReactNode }) {
      return (
        <QueryClientProvider client={client}>
          <ConfirmProvider>
            <MemoryRouter>{children}</MemoryRouter>
          </ConfirmProvider>
        </QueryClientProvider>
      );
    };
  }

  /** De queries in de cache die op sleutel `['settings']` staan. */
  function settingsQueries(client: QueryClient) {
    return client.getQueryCache().findAll({ queryKey: ['settings'], exact: true });
  }

  /** De `staleTime` die elke aangehaakte pagina voor die query hanteert. */
  function staleTimes(client: QueryClient): unknown[] {
    return settingsQueries(client).flatMap((query) => query.observers.map((waarnemer) => waarnemer.options.staleTime));
  }

  it.each([
    ['instellingen eerst', true],
    ['thema eerst', false],
  ])('houdt bij %s één query met één set opties over', async (_volgorde, instellingenEerst) => {
    const client = maakClient();
    render(
      instellingenEerst ? (
        <>
          <Settings />
          <ThemeSettingsPage />
        </>
      ) : (
        <>
          <ThemeSettingsPage />
          <Settings />
        </>
      ),
      { wrapper: wikkelMet(client) },
    );

    await screen.findByText('settings.title');
    await screen.findByText('theme.title');

    expect(settingsQueries(client)).toHaveLength(1);
    expect(staleTimes(client)).toEqual([SETTINGS_STALE_TIME, SETTINGS_STALE_TIME]);
  });

  it("haalt de instellingen één keer op voor beide pagina's samen", async () => {
    const client = maakClient();
    render(
      <>
        <Settings />
        <ThemeSettingsPage />
      </>,
      { wrapper: wikkelMet(client) },
    );

    await screen.findByText('theme.title');

    expect(vi.mocked(api.getSettings)).toHaveBeenCalledTimes(1);
  });

  it('houdt de instellingen vijf minuten geldig', () => {
    // De waarde stond twee keer in de broncode. Hier staat hij één keer als
    // verwachting, zodat een wijziging een bewuste wijziging is.
    expect(SETTINGS_STALE_TIME).toBe(5 * 60 * 1000);
  });
});
