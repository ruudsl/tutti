/**
 * CloudFilePicker praat met twee vreemde diensten: Microsoft Graph voor
 * OneDrive en de Google Picker voor Drive. Beide gaan in deze tests volledig
 * door een dubbelganger heen - er verlaat geen enkel verzoek deze test, en
 * elke sleutel in de testgegevens is zichtbaar nep ('nep-...').
 *
 * Wat hier vastgelegd wordt is niet dat het component tekent, maar wat het
 * doet als de dienst niet meewerkt: geen sleutels, een 401, een 429, een 500,
 * een lege map, en - het lastigste geval - een antwoord met status 200 waar
 * iets anders in zit dan afgesproken.
 */

import '@testing-library/jest-dom';
import type { ComponentProps } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CloudFilePicker } from '../CloudFilePicker';
import { getCloudImportConfig, importFromOneDrive, importFromGoogleDrive } from '../../api';
import { showError, showSuccess } from '../../utils/toast';

vi.mock('../../api', () => ({
  getCloudImportConfig: vi.fn(),
  importFromOneDrive: vi.fn(),
  importFromGoogleDrive: vi.fn(),
}));

vi.mock('../../utils/toast', () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_sleutel: string, terugval?: string) => terugval ?? _sleutel }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

const configOphalen = vi.mocked(getCloudImportConfig);
const oneDriveInvoer = vi.mocked(importFromOneDrive);
const googleInvoer = vi.mocked(importFromGoogleDrive);

/** Zichtbaar nepwaarden; niets hiervan lijkt op een echte sleutel. */
const NEP_CLIENT_ID = 'nep-client-id-0000';
const NEP_TENANT_ID = 'nep-tenant-0000';
const NEP_API_KEY = 'nep-api-sleutel-0000';
const NEP_TOKEN = 'nep-toegangstoken-onedrive';
const NEP_GOOGLE_TOKEN = 'nep-toegangstoken-google';

function config(overschrijf: Record<string, unknown> = {}) {
  return {
    onedrive: { enabled: false, clientId: null, tenantId: NEP_TENANT_ID },
    googleDrive: { enabled: false, clientId: null, apiKey: null },
    ...overschrijf,
  } as never;
}

const ONEDRIVE_AAN = config({
  onedrive: { enabled: true, clientId: NEP_CLIENT_ID, tenantId: NEP_TENANT_ID },
});

const GOOGLE_AAN = config({
  googleDrive: { enabled: true, clientId: NEP_CLIENT_ID, apiKey: NEP_API_KEY },
});

/** Een map- of bestandsregel zoals Graph hem teruggeeft. */
function graphBestand(id: string, naam: string, grootte = 2048) {
  return { id, name: naam, size: grootte, webUrl: `https://nep.example/${id}`, file: { mimeType: 'application/pdf' } };
}

function graphMap(id: string, naam: string) {
  return { id, name: naam, size: 0, webUrl: `https://nep.example/${id}`, folder: { childCount: 2 } };
}

/**
 * Zet de msal-dubbelganger klaar. Het scriptelement staat er al met het id dat
 * loadScript gebruikt, zodat loadScript meteen tevreden is en er nooit een
 * script van alcdn.msauth.net opgehaald wordt.
 */
function msalKlaarzetten(loginPopup: () => Promise<unknown> = async () => ({ accessToken: NEP_TOKEN })) {
  const script = document.createElement('script');
  script.id = 'msal-browser-sdk';
  document.head.appendChild(script);
  window.msal = {
    PublicClientApplication: class {
      async initialize() {}
      loginPopup = loginPopup;
    },
  };
}

/** Laat fetch achtereenvolgens deze antwoorden geven. */
function graphAntwoorden(...antwoorden: { ok?: boolean; status?: number; json?: () => Promise<unknown> }[]) {
  const nep = vi.fn();
  for (const antwoord of antwoorden) {
    nep.mockResolvedValueOnce({
      ok: antwoord.ok ?? true,
      status: antwoord.status ?? 200,
      json: antwoord.json ?? (async () => ({ value: [] })),
    });
  }
  nep.mockResolvedValue({ ok: true, status: 200, json: async () => ({ value: [] }) });
  vi.stubGlobal('fetch', nep);
  return nep;
}

/** Tekent de kiezer en wacht tot de configuratie verwerkt is. */
async function toon(props: ComponentProps<typeof CloudFilePicker> = {}) {
  const gebruiker = userEvent.setup();
  const { container } = render(<CloudFilePicker {...props} />);
  await waitFor(() => expect(configOphalen).toHaveBeenCalled());
  return { gebruiker, container };
}

/** Opent het OneDrive-venster en wacht tot de eerste maplijst binnen is. */
async function openOneDrive(gebruiker: ReturnType<typeof userEvent.setup>) {
  await gebruiker.click(screen.getByRole('button', { name: /OneDrive/i }));
  await waitFor(() => expect(screen.getByText('OneDrive bestanden selecteren')).toBeInTheDocument());
}

beforeEach(() => {
  vi.clearAllMocks();
  document.getElementById('msal-browser-sdk')?.remove();
  document.getElementById('gapi-script')?.remove();
  document.getElementById('gis-script')?.remove();
  delete window.msal;
  delete window.gapi;
  delete window.google;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('CloudFilePicker - de configuratiedienst werkt niet mee', () => {
  it.each([
    ['401 zonder toegang', { response: { status: 401 } }],
    ['429 te veel verzoeken', { response: { status: 429 } }],
    ['500 serverfout', { response: { status: 500 } }],
    ['een netwerkfout', new Error('Network Error')],
  ])('toont niets bij %s', async (_naam, fout) => {
    configOphalen.mockRejectedValue(fout);
    const { container } = await toon();

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('toont niets als beide diensten uit staan', async () => {
    configOphalen.mockResolvedValue(config());
    const { container } = await toon();

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('toont niets bij een leeg antwoord', async () => {
    configOphalen.mockResolvedValue(null as never);
    const { container } = await toon();

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});

describe('CloudFilePicker - onverwachte JSON met status 200', () => {
  /**
   * ECHTE FOUT, met bewijs.
   *
   * `getCloudImportConfig` was onvoorwaardelijk vertrouwd: de uitkomst ging
   * rechtstreeks naar `setConfig`, en de weergave las daarna `config.onedrive.
   * enabled`. Zodra er iets anders binnenkwam dan het afgesproken object -
   * `{}`, `null` in een van de twee blokken, of een HTML-pagina met status 200
   * omdat een portaal of proxy ertussen zat - gooide dat een TypeError tijdens
   * het tekenen. Niet een knop die ontbreekt, maar het hele scherm eromheen
   * dat wegvalt.
   *
   * Dat dit geen bedacht geval is, staat in dit project zelf al opgeschreven:
   * ModulesContext.tsx heeft precies hetzelfde meegemaakt ("de server
   * antwoordt met een HTML-pagina en status 200, en dan is `enabled` geen
   * lijst") en vangt het daar al af.
   *
   * BEWIJS dat deze tests rood zijn zonder de reparatie: met de oude
   * CloudFilePicker.tsx (`git checkout HEAD -- src/components/CloudFilePicker.tsx`)
   * loopt dit bestand stuk op vier onafgevangen fouten,
   *   TypeError: Cannot read properties of undefined (reading 'enabled')
   * respectievelijk 'Cannot read properties of null (reading 'enabled')'.
   *
   * Let op de vorm waarin het rood wordt: de bewering hieronder (het scherm
   * blijft leeg) gaat op de oude code toevallig ook op, want een component dat
   * tijdens het tekenen omvalt laat ook niets achter. Het verschil zit in de
   * vier fouten die vitest apart meldt en waarop de hele testrun afgaat - in
   * de app is dat precies het scherm dat wegvalt. Met de reparatie erin loopt
   * het bestand schoon door, zonder onafgevangen fouten.
   */
  it.each([
    ['een leeg object', {}],
    ['een HTML-pagina als tekst', '<!doctype html><html><body>Log in</body></html>'],
    ['een blok dat null is', { onedrive: null, googleDrive: null }],
    ['een lijst', []],
  ])('valt niet om bij %s maar toont niets', async (_naam, antwoord) => {
    configOphalen.mockResolvedValue(antwoord as never);
    const { container } = await toon();

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});

describe('CloudFilePicker - knoppen die iets moeten doen', () => {
  it('toont de OneDrive-knop als OneDrive aan staat', async () => {
    configOphalen.mockResolvedValue(ONEDRIVE_AAN);
    await toon();

    expect(await screen.findByRole('button', { name: /OneDrive/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Google Drive/i })).toBeNull();
  });

  it('toont de Google Drive-knop als Google Drive aan staat', async () => {
    configOphalen.mockResolvedValue(GOOGLE_AAN);
    await toon();

    expect(await screen.findByRole('button', { name: /Google Drive/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /OneDrive/i })).toBeNull();
  });

  /**
   * ECHTE FOUT, met bewijs.
   *
   * De knop hing aan `config.onedrive.enabled`, maar het venster erachter aan
   * `enabled && clientId`. Staat OneDrive aan zonder clientId, dan verscheen de
   * knop wel en gebeurde er bij klikken niets: geen venster, geen melding, geen
   * spoor. Hetzelfde gold voor Google Drive, waar `openPicker` bij een
   * ontbrekende clientId of apiKey stilletjes terugkeert.
   *
   * Een knop die niets doet is erger dan een knop die er niet is, want de
   * gebruiker blijft klikken. Nu bepaalt dezelfde voorwaarde of de knop er
   * staat en of hij werkt.
   *
   * BEWIJS dat deze tests rood zijn zonder de reparatie: met de oude
   * CloudFilePicker.tsx staat de knop er wel, en falen ze met
   *   expected null not to be null  (de knop werd juist gevonden)
   *
   * Kanttekening bij de ernst: de backend zet `enabled` vandaag alleen waar
   * als de clientId er ook is (cloud-import.ts), dus deze stand komt op dit
   * moment niet uit de echte server. Het is de afspraak binnen het component
   * die niet klopte, niet een gat dat nu open staat.
   */
  it('toont de OneDrive-knop niet als de clientId ontbreekt', async () => {
    configOphalen.mockResolvedValue(config({ onedrive: { enabled: true, clientId: null, tenantId: NEP_TENANT_ID } }));
    const { container } = await toon();

    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(screen.queryByRole('button', { name: /OneDrive/i })).toBeNull();
  });

  it('toont de Google Drive-knop niet als de apiKey ontbreekt', async () => {
    configOphalen.mockResolvedValue(config({ googleDrive: { enabled: true, clientId: NEP_CLIENT_ID, apiKey: null } }));
    const { container } = await toon();

    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(screen.queryByRole('button', { name: /Google Drive/i })).toBeNull();
  });
});

describe('CloudFilePicker - het OneDrive-venster', () => {
  beforeEach(() => {
    configOphalen.mockResolvedValue(ONEDRIVE_AAN);
  });

  it('meldt het als aanmelden bij Microsoft mislukt', async () => {
    msalKlaarzetten(async () => {
      throw new Error('Aanmelden afgebroken door de gebruiker');
    });
    graphAntwoorden();
    const { gebruiker } = await toon();
    await openOneDrive(gebruiker);

    expect(await screen.findByText('Aanmelden afgebroken door de gebruiker')).toBeInTheDocument();
  });

  it.each([401, 429, 500])('meldt een %s van Graph in het venster zelf', async (status) => {
    msalKlaarzetten();
    graphAntwoorden({ ok: false, status });
    const { gebruiker } = await toon();
    await openOneDrive(gebruiker);

    expect(await screen.findByText(`Graph API error: ${status}`)).toBeInTheDocument();
    // Geen melding buiten het venster: de fout hoort daar waar de handeling is.
    expect(showError).not.toHaveBeenCalled();
  });

  it('zegt netjes dat een map leeg is', async () => {
    msalKlaarzetten();
    graphAntwoorden({ json: async () => ({ value: [] }) });
    const { gebruiker } = await toon();
    await openOneDrive(gebruiker);

    expect(await screen.findByText('Geen bestanden gevonden.')).toBeInTheDocument();
  });

  it('valt niet om als Graph een antwoord zonder value geeft, maar meldt het', async () => {
    // WACHT, geen bewijs: dit gedrag is ook op de oude code al zo. De melding
    // is technisch van toon, maar de try/catch vangt hem, dus het venster
    // blijft staan in plaats van het scherm mee te nemen.
    msalKlaarzetten();
    graphAntwoorden({ json: async () => ({}) });
    const { gebruiker } = await toon();
    await openOneDrive(gebruiker);

    expect(await screen.findByRole('button', { name: 'common.cancel' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Laden...')).toBeNull());
  });

  it('toont alleen mappen en pdf-bestanden, en verzwijgt de rest', async () => {
    msalKlaarzetten();
    graphAntwoorden({
      json: async () => ({
        value: [
          graphMap('map-1', 'Partituren'),
          graphBestand('best-1', 'Mars in Bes.pdf'),
          graphBestand('best-2', 'aantekeningen.txt'),
          graphBestand('best-3', 'HOOFDLETTERS.PDF'),
        ],
      }),
    });
    const { gebruiker } = await toon();
    await openOneDrive(gebruiker);

    expect(await screen.findByText('Partituren')).toBeInTheDocument();
    expect(screen.getByText('Mars in Bes.pdf')).toBeInTheDocument();
    expect(screen.getByText('HOOFDLETTERS.PDF')).toBeInTheDocument();
    expect(screen.queryByText('aantekeningen.txt')).toBeNull();
  });

  it('houdt de knop Importeren uit zolang er niets gekozen is', async () => {
    msalKlaarzetten();
    graphAntwoorden({ json: async () => ({ value: [graphBestand('best-1', 'Mars in Bes.pdf')] }) });
    const { gebruiker } = await toon();
    await openOneDrive(gebruiker);
    await screen.findByText('Mars in Bes.pdf');

    expect(screen.getByRole('button', { name: /Importeer geselecteerde/ })).toBeDisabled();
  });

  it('kiest een bestand, importeert het en meldt dat het gelukt is', async () => {
    msalKlaarzetten();
    graphAntwoorden({ json: async () => ({ value: [graphBestand('best-1', 'Mars in Bes.pdf')] }) });
    oneDriveInvoer.mockResolvedValue({
      message: 'ok',
      uploaded: [
        { id: '1', filename: 'Mars in Bes.pdf', title: 'Mars in Bes', instrumentId: null, instrumentFound: false },
      ],
    });
    const onImported = vi.fn();
    const { gebruiker } = await toon({ listId: 'lijst-7', onImported });
    await openOneDrive(gebruiker);

    await gebruiker.click(await screen.findByText('Mars in Bes.pdf'));
    await gebruiker.click(screen.getByRole('button', { name: /Importeer geselecteerde/ }));

    await waitFor(() =>
      expect(oneDriveInvoer).toHaveBeenCalledWith({
        files: [{ id: 'best-1', name: 'Mars in Bes.pdf' }],
        accessToken: NEP_TOKEN,
        listId: 'lijst-7',
      }),
    );
    expect(showSuccess).toHaveBeenCalledWith('1 bestanden geïmporteerd');
    expect(onImported).toHaveBeenCalled();
    // Het venster gaat dicht zodra het importeren begint.
    await waitFor(() => expect(screen.queryByText('OneDrive bestanden selecteren')).toBeNull());
  });

  it('kan een gekozen bestand ook weer loslaten', async () => {
    msalKlaarzetten();
    graphAntwoorden({ json: async () => ({ value: [graphBestand('best-1', 'Mars in Bes.pdf')] }) });
    const { gebruiker } = await toon();
    await openOneDrive(gebruiker);

    const regel = await screen.findByText('Mars in Bes.pdf');
    await gebruiker.click(regel);
    expect(screen.getByRole('button', { name: /Importeer geselecteerde/ })).toBeEnabled();

    await gebruiker.click(regel);
    expect(screen.getByRole('button', { name: /Importeer geselecteerde/ })).toBeDisabled();
  });

  it('meldt het als de import deels mislukt', async () => {
    msalKlaarzetten();
    graphAntwoorden({ json: async () => ({ value: [graphBestand('best-1', 'Mars in Bes.pdf')] }) });
    oneDriveInvoer.mockResolvedValue({
      message: 'deels',
      uploaded: [],
      errors: [{ filename: 'Mars in Bes.pdf', error: 'te groot' }],
    });
    const { gebruiker } = await toon();
    await openOneDrive(gebruiker);

    await gebruiker.click(await screen.findByText('Mars in Bes.pdf'));
    await gebruiker.click(screen.getByRole('button', { name: /Importeer geselecteerde/ }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('1 bestanden mislukt'));
    expect(showSuccess).not.toHaveBeenCalled();
  });

  it('meldt het als de import helemaal mislukt', async () => {
    msalKlaarzetten();
    graphAntwoorden({ json: async () => ({ value: [graphBestand('best-1', 'Mars in Bes.pdf')] }) });
    oneDriveInvoer.mockRejectedValue(new Error('De server reageert niet'));
    const { gebruiker } = await toon();
    await openOneDrive(gebruiker);

    await gebruiker.click(await screen.findByText('Mars in Bes.pdf'));
    await gebruiker.click(screen.getByRole('button', { name: /Importeer geselecteerde/ }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('De server reageert niet'));
  });

  it('opent een map en laat het kruimelpad meegroeien', async () => {
    msalKlaarzetten();
    const nepFetch = graphAntwoorden(
      { json: async () => ({ value: [graphMap('map-1', 'Partituren')] }) },
      { json: async () => ({ value: [graphBestand('best-9', 'Wals.pdf')] }) },
    );
    const { gebruiker } = await toon();
    await openOneDrive(gebruiker);

    await gebruiker.click(await screen.findByText('Partituren'));

    expect(await screen.findByText('Wals.pdf')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Partituren' })).toBeInTheDocument();
    expect(nepFetch.mock.calls[1][0]).toContain('/me/drive/items/map-1/children');
  });

  it('gaat via het kruimelpad terug naar de bovenste map', async () => {
    msalKlaarzetten();
    graphAntwoorden(
      { json: async () => ({ value: [graphMap('map-1', 'Partituren')] }) },
      { json: async () => ({ value: [graphBestand('best-9', 'Wals.pdf')] }) },
      { json: async () => ({ value: [graphMap('map-1', 'Partituren')] }) },
    );
    const { gebruiker } = await toon();
    await openOneDrive(gebruiker);

    await gebruiker.click(await screen.findByText('Partituren'));
    await screen.findByText('Wals.pdf');
    await gebruiker.click(screen.getByRole('button', { name: 'OneDrive' }));

    expect(await screen.findByText('Partituren')).toBeInTheDocument();
    expect(screen.queryByText('Wals.pdf')).toBeNull();
  });

  it('zoekt op enter en toont alleen pdf-bestanden uit het zoekresultaat', async () => {
    msalKlaarzetten();
    const nepFetch = graphAntwoorden(
      { json: async () => ({ value: [] }) },
      { json: async () => ({ value: [graphBestand('best-5', 'Ouverture.pdf'), graphMap('map-2', 'Oude map')] }) },
    );
    const { gebruiker } = await toon();
    await openOneDrive(gebruiker);

    await gebruiker.type(screen.getByPlaceholderText('Zoek PDF bestanden...'), 'ouverture{Enter}');

    expect(await screen.findByText('Ouverture.pdf')).toBeInTheDocument();
    expect(screen.queryByText('Oude map')).toBeNull();
    expect(nepFetch.mock.calls[nepFetch.mock.calls.length - 1][0]).toContain("root/search(q='ouverture')");
  });

  it('meldt een 500 tijdens het zoeken', async () => {
    msalKlaarzetten();
    graphAntwoorden({ json: async () => ({ value: [] }) }, { ok: false, status: 500 });
    const { gebruiker } = await toon();
    await openOneDrive(gebruiker);

    await gebruiker.type(screen.getByPlaceholderText('Zoek PDF bestanden...'), 'mars{Enter}');

    expect(await screen.findByText('Graph API error: 500')).toBeInTheDocument();
  });

  it('haalt de map opnieuw op zodra het zoekveld leeggemaakt wordt', async () => {
    msalKlaarzetten();
    const nepFetch = graphAntwoorden({ json: async () => ({ value: [graphBestand('best-1', 'Mars in Bes.pdf')] }) });
    const { gebruiker } = await toon();
    await openOneDrive(gebruiker);
    await screen.findByText('Mars in Bes.pdf');

    const veld = screen.getByPlaceholderText('Zoek PDF bestanden...');
    await gebruiker.type(veld, 'm');
    await gebruiker.clear(veld);

    await waitFor(() =>
      expect(nepFetch.mock.calls[nepFetch.mock.calls.length - 1][0]).toContain('/me/drive/root/children'),
    );
  });

  it('sluit het venster met de sluitknop', async () => {
    msalKlaarzetten();
    graphAntwoorden();
    const { gebruiker } = await toon();
    await openOneDrive(gebruiker);

    await gebruiker.click(screen.getByRole('button', { name: 'common.close' }));

    await waitFor(() => expect(screen.queryByText('OneDrive bestanden selecteren')).toBeNull());
  });

  it('sluit het venster met annuleren', async () => {
    msalKlaarzetten();
    graphAntwoorden();
    const { gebruiker } = await toon();
    await openOneDrive(gebruiker);

    await gebruiker.click(screen.getByRole('button', { name: 'common.cancel' }));

    await waitFor(() => expect(screen.queryByText('OneDrive bestanden selecteren')).toBeNull());
  });
});

/**
 * Zet de dubbelgangers van gapi en de Google Picker klaar. Net als bij msal
 * staan de scriptelementen er al met het id dat loadScript gebruikt, zodat er
 * niets van apis.google.com of accounts.google.com opgehaald wordt.
 */
function googleKlaarzetten(opties: {
  tokenFout?: string;
  actie?: 'PICKED' | 'CANCEL';
  documenten?: { id: string; name: string }[];
}) {
  for (const id of ['gapi-script', 'gis-script']) {
    const script = document.createElement('script');
    script.id = id;
    document.head.appendChild(script);
  }

  window.gapi = {
    load: (_naam: string, opts: { callback: () => void }) => opts.callback(),
  };

  const gekozen = {
    ACTION: opties.actie ?? 'PICKED',
    DOCUMENTS: opties.documenten ?? [{ id: 'google-1', name: 'Fanfare.pdf' }],
  };

  class NepDocsView {
    setMimeTypes() {
      return this;
    }
    setIncludeFolders() {
      return this;
    }
    setSelectFolderEnabled() {
      return this;
    }
  }

  class NepPickerBuilder {
    private terugroep: ((data: unknown) => void) | null = null;
    enableFeature() {
      return this;
    }
    setOAuthToken() {
      return this;
    }
    setDeveloperKey() {
      return this;
    }
    addView() {
      return this;
    }
    setCallback(fn: (data: unknown) => void) {
      this.terugroep = fn;
      return this;
    }
    build() {
      const terugroep = this.terugroep!;
      return { setVisible: () => terugroep(gekozen) };
    }
  }

  window.google = {
    accounts: {
      oauth2: {
        initTokenClient: ({ callback }: { callback: (r: unknown) => void }) => ({
          requestAccessToken: () =>
            callback(opties.tokenFout ? { error: opties.tokenFout } : { access_token: NEP_GOOGLE_TOKEN }),
        }),
      },
    },
    picker: {
      DocsView: NepDocsView,
      ViewId: { DOCS: 'docs' },
      PickerBuilder: NepPickerBuilder,
      Feature: { MULTISELECT_ENABLED: 'multiselect' },
      Response: { ACTION: 'ACTION', DOCUMENTS: 'DOCUMENTS' },
      Action: { PICKED: 'PICKED', CANCEL: 'CANCEL' },
    },
  };
}

describe('CloudFilePicker - Google Drive', () => {
  beforeEach(() => {
    configOphalen.mockResolvedValue(GOOGLE_AAN);
  });

  it('importeert de gekozen bestanden en meldt dat het gelukt is', async () => {
    googleKlaarzetten({ documenten: [{ id: 'google-1', name: 'Fanfare.pdf' }] });
    googleInvoer.mockResolvedValue({
      message: 'ok',
      uploaded: [{ id: '1', filename: 'Fanfare.pdf', title: 'Fanfare', instrumentId: null, instrumentFound: false }],
    });
    const onImported = vi.fn();
    const { gebruiker } = await toon({ listId: 'lijst-2', onImported });

    await gebruiker.click(await screen.findByRole('button', { name: /Google Drive/i }));

    await waitFor(() =>
      expect(googleInvoer).toHaveBeenCalledWith({
        files: [{ id: 'google-1', name: 'Fanfare.pdf' }],
        accessToken: NEP_GOOGLE_TOKEN,
        listId: 'lijst-2',
      }),
    );
    expect(showSuccess).toHaveBeenCalledWith('1 bestanden geïmporteerd');
    expect(onImported).toHaveBeenCalled();
  });

  it('doet niets als de gebruiker het kiezen afbreekt', async () => {
    googleKlaarzetten({ actie: 'CANCEL' });
    const { gebruiker } = await toon();

    await gebruiker.click(await screen.findByRole('button', { name: /Google Drive/i }));

    await waitFor(() => expect(screen.getByRole('button', { name: /Google Drive/i })).toBeEnabled());
    expect(googleInvoer).not.toHaveBeenCalled();
    expect(showError).not.toHaveBeenCalled();
  });

  it('meldt het als Google geen toegangstoken geeft', async () => {
    googleKlaarzetten({ tokenFout: 'access_denied' });
    const { gebruiker } = await toon();

    await gebruiker.click(await screen.findByRole('button', { name: /Google Drive/i }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('access_denied'));
    expect(googleInvoer).not.toHaveBeenCalled();
  });

  it('meldt het als de import bij de server mislukt', async () => {
    googleKlaarzetten({});
    googleInvoer.mockRejectedValue(new Error('De server reageert niet'));
    const { gebruiker } = await toon();

    await gebruiker.click(await screen.findByRole('button', { name: /Google Drive/i }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('De server reageert niet'));
  });

  it('meldt het als de import deels mislukt', async () => {
    googleKlaarzetten({});
    googleInvoer.mockResolvedValue({
      message: 'deels',
      uploaded: [],
      errors: [{ filename: 'Fanfare.pdf', error: 'geen pdf' }],
    });
    const { gebruiker } = await toon();

    await gebruiker.click(await screen.findByRole('button', { name: /Google Drive/i }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('1 bestanden mislukt'));
  });

  it('gaat om met een leeg keuzeresultaat', async () => {
    googleKlaarzetten({ documenten: [] });
    googleInvoer.mockResolvedValue({ message: 'niets', uploaded: [] });
    const { gebruiker } = await toon();

    await gebruiker.click(await screen.findByRole('button', { name: /Google Drive/i }));

    await waitFor(() => expect(googleInvoer).toHaveBeenCalledWith(expect.objectContaining({ files: [] })));
    expect(showSuccess).not.toHaveBeenCalled();
    expect(showError).not.toHaveBeenCalled();
  });

  it('meldt het als de Google-sdk niet te gebruiken is', async () => {
    // De scriptelementen staan er wel, maar window.gapi niet: precies wat er
    // gebeurt als het laden van het script eerder is mislukt.
    for (const id of ['gapi-script', 'gis-script']) {
      const script = document.createElement('script');
      script.id = id;
      document.head.appendChild(script);
    }
    const { gebruiker } = await toon();

    await gebruiker.click(await screen.findByRole('button', { name: /Google Drive/i }));

    await waitFor(() => expect(showError).toHaveBeenCalled());
    expect(googleInvoer).not.toHaveBeenCalled();
  });

  it('toont beide knoppen als beide diensten aan staan', async () => {
    configOphalen.mockResolvedValue(
      config({
        onedrive: { enabled: true, clientId: NEP_CLIENT_ID, tenantId: NEP_TENANT_ID },
        googleDrive: { enabled: true, clientId: NEP_CLIENT_ID, apiKey: NEP_API_KEY },
      }),
    );
    await toon();

    expect(await screen.findByRole('button', { name: /OneDrive/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Google Drive/i })).toBeInTheDocument();
  });
});
