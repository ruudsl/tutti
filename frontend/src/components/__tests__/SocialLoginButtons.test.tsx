/**
 * Inloggen via Google of Facebook, bij het bestellen als gast.
 *
 * Er gaat hier niets naar buiten: axios is afgevangen en window.open is
 * vervangen door een nepvenster. Alle sleutels en penningen in dit bestand zijn
 * zichtbaar nepwaarden ("nep-...", "voorbeeld.test"), zodat er niets in staat
 * dat op een echte sleutel lijkt.
 *
 * De belangrijkste test staat onder "de grens van het venster": het scherm
 * luistert naar berichten uit een pop-up, en dat is een deur die van buiten
 * open staat. Een bericht van een andere herkomst mag nooit tot een geslaagde
 * aanmelding leiden - dan zou een willekeurige pagina in een ander tabblad een
 * bezoeker kunnen laten "inloggen" als iemand anders.
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { axios } = vi.hoisted(() => ({
  axios: { get: vi.fn() },
}));

vi.mock('axios', () => ({
  default: { get: axios.get, isAxiosError: (e: unknown) => Boolean((e as any)?.isAxiosError) },
  isAxiosError: (e: unknown) => Boolean((e as any)?.isAxiosError),
}));

vi.mock('react-i18next', async () => {
  const teksten = ((await import('../../locales/nl.json')) as { default: Record<string, unknown> }).default;
  const zoek = (sleutel: string): string | undefined =>
    sleutel.split('.').reduce<any>((deel, stuk) => (deel == null ? undefined : deel[stuk]), teksten);

  return {
    useTranslation: () => ({
      t: (sleutel: string, standaard?: string) => zoek(sleutel) ?? standaard ?? sleutel,
    }),
  };
});

import SocialLoginButtons, { useSocialAuthCallback } from '../SocialLoginButtons';

/** Een nepvenster dat doet alsof het een pop-up is, zonder er een te openen. */
function nepVenster() {
  return {
    closed: false,
    close: vi.fn(function (this: any) {
      this.closed = true;
    }),
  };
}

let venster: ReturnType<typeof nepVenster>;
let openen: ReturnType<typeof vi.fn>;

/** De antwoorden die de server geeft: welke aanbieders aan staan, en de aanmeldlink. */
function serverGeeft({ google = false, facebook = false }: { google?: boolean; facebook?: boolean }) {
  axios.get.mockImplementation((adres: string) => {
    if (adres.endsWith('/auth/social/providers')) {
      return Promise.resolve({
        data: {
          providers: {
            google: { enabled: google, name: 'Google' },
            facebook: { enabled: facebook, name: 'Facebook' },
          },
        },
      });
    }
    return Promise.resolve({ data: { authUrl: 'https://voorbeeld.test/nep-aanmeldpagina' } });
  });
}

/** Een geslaagd antwoord, met nadrukkelijk nepwaarden erin. */
const nepAanmelding = {
  token: 'nep-token-alleen-voor-de-test',
  user: {
    email: 'testlid@voorbeeld.test',
    name: 'Test Lid',
    authProvider: 'google' as const,
  },
};

/** Speelt een bericht uit de pop-up na, met een herkomst naar keuze. */
function berichtUitVenster(data: unknown, herkomst = window.location.origin) {
  window.dispatchEvent(new MessageEvent('message', { data, origin: herkomst }));
}

async function wachtOpKnop(naam: RegExp) {
  return screen.findByRole('button', { name: naam });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  axios.get.mockReset();
  venster = nepVenster();
  openen = vi.fn(() => venster);
  vi.stubGlobal('open', openen);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('wat er te zien is', () => {
  it('toont niets zolang de aanbieders nog opgehaald worden', () => {
    axios.get.mockReturnValue(new Promise(() => {}));

    const { container } = render(<SocialLoginButtons />);

    expect(container).toBeEmptyDOMElement();
  });

  it('toont niets als geen enkele aanbieder aan staat', async () => {
    serverGeeft({});

    const { container } = render(<SocialLoginButtons />);

    await waitFor(() => expect(axios.get).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('toont niets als de aanbieders niet op te halen zijn', async () => {
    // Valt de server weg, dan is inloggen via een aanbieder niet mogelijk. Een
    // knop tonen die het toch niet doet is erger dan geen knop.
    axios.get.mockRejectedValue(new Error('server niet bereikbaar'));

    const { container } = render(<SocialLoginButtons />);

    await waitFor(() => expect(axios.get).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('toont alleen de aanbieder die aan staat', async () => {
    serverGeeft({ google: true, facebook: false });

    render(<SocialLoginButtons />);

    expect(await wachtOpKnop(/Verder met Google/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Verder met Facebook/ })).not.toBeInTheDocument();
  });

  it('toont beide aanbieders als ze allebei aan staan, met scheidingstekst en voorwaarde', async () => {
    serverGeeft({ google: true, facebook: true });

    render(<SocialLoginButtons />);

    expect(await wachtOpKnop(/Verder met Google/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Verder met Facebook/ })).toBeInTheDocument();
    expect(screen.getByText('of ga verder met')).toBeInTheDocument();
    expect(screen.getByText('We gebruiken je gegevens alleen om je ticket te verzenden.')).toBeInTheDocument();
  });

  it('houdt de knoppen uit als het scherm ze uitzet', async () => {
    serverGeeft({ google: true, facebook: true });

    render(<SocialLoginButtons disabled />);

    expect(await wachtOpKnop(/Verder met Google/)).toBeDisabled();
    expect(screen.getByRole('button', { name: /Verder met Facebook/ })).toBeDisabled();
  });
});

describe('het openen van de aanmeldpagina', () => {
  it('opent de pagina die de server aanwijst, in een eigen venster', async () => {
    const gebruiker = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    serverGeeft({ google: true });
    render(<SocialLoginButtons />);

    await gebruiker.click(await wachtOpKnop(/Verder met Google/));

    await waitFor(() => expect(openen).toHaveBeenCalled());
    expect(openen.mock.calls[0][0]).toBe('https://voorbeeld.test/nep-aanmeldpagina');
    expect(openen.mock.calls[0][1]).toBe('googleLogin');
  });

  it('geeft de terugkeerpagina mee, netjes ingepakt', async () => {
    // Zonder inpakken breekt een pagina met een vraagteken of ampersand het
    // adres open; dat is meteen een plek om iets anders in te schuiven.
    const gebruiker = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    serverGeeft({ google: true });
    render(<SocialLoginButtons returnUrl="/tickets?concert=1&rij=2" />);

    await gebruiker.click(await wachtOpKnop(/Verder met Google/));

    await waitFor(() =>
      expect(axios.get).toHaveBeenCalledWith('/api/auth/social/google?returnUrl=%2Ftickets%3Fconcert%3D1%26rij%3D2'),
    );
  });

  it('laat merken dat er gewacht wordt en zet de andere knop op slot', async () => {
    const gebruiker = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    serverGeeft({ google: true, facebook: true });
    render(<SocialLoginButtons />);

    await gebruiker.click(await wachtOpKnop(/Verder met Google/));

    await waitFor(() => expect(screen.getByRole('button', { name: /Laden/ })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Verder met Facebook/ })).toBeDisabled();
  });

  it('meldt het als het venster geblokkeerd wordt', async () => {
    const gebruiker = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const foutmelding = vi.fn();
    serverGeeft({ google: true });
    openen.mockReturnValue(null);
    render(<SocialLoginButtons onError={foutmelding} />);

    await gebruiker.click(await wachtOpKnop(/Verder met Google/));

    expect(await screen.findByText('Pop-up geblokkeerd. Sta pop-ups toe voor deze site.')).toBeInTheDocument();
    expect(foutmelding).toHaveBeenCalledWith('Pop-up geblokkeerd. Sta pop-ups toe voor deze site.');
    expect(screen.getByRole('button', { name: /Verder met Google/ })).toBeEnabled();
  });

  it('meldt het als de aanmeldlink niet op te halen is', async () => {
    const gebruiker = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const foutmelding = vi.fn();
    serverGeeft({ google: true });
    axios.get.mockImplementationOnce(() =>
      Promise.resolve({
        data: {
          providers: { google: { enabled: true, name: 'Google' }, facebook: { enabled: false, name: 'Facebook' } },
        },
      }),
    );
    render(<SocialLoginButtons onError={foutmelding} />);
    const knop = await wachtOpKnop(/Verder met Google/);
    axios.get.mockRejectedValue(new Error('server niet bereikbaar'));

    await gebruiker.click(knop);

    expect(await screen.findByText('server niet bereikbaar')).toBeInTheDocument();
    expect(foutmelding).toHaveBeenCalledWith('server niet bereikbaar');
  });

  it('opent geen tweede venster zolang het eerste nog open staat', async () => {
    const gebruiker = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    serverGeeft({ google: true });
    render(<SocialLoginButtons />);
    const knop = await wachtOpKnop(/Verder met Google/);

    await gebruiker.click(knop);
    await waitFor(() => expect(openen).toHaveBeenCalledTimes(1));
    await gebruiker.click(screen.getByRole('button', { name: /Laden/ }));

    expect(openen).toHaveBeenCalledTimes(1);
  });
});

describe('de grens van het venster', () => {
  async function opengezet() {
    const gebruiker = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const gelukt = vi.fn();
    const mislukt = vi.fn();
    serverGeeft({ google: true });
    render(<SocialLoginButtons onSuccess={gelukt} onError={mislukt} />);
    await gebruiker.click(await wachtOpKnop(/Verder met Google/));
    await waitFor(() => expect(openen).toHaveBeenCalled());
    return { gelukt, mislukt };
  }

  it('neemt een geslaagde aanmelding uit het eigen venster aan', async () => {
    const { gelukt } = await opengezet();

    berichtUitVenster({ type: 'social-auth-success', payload: nepAanmelding });

    await waitFor(() => expect(gelukt).toHaveBeenCalledWith(nepAanmelding));
    expect(venster.close).toHaveBeenCalled();
  });

  it('negeert een geslaagde aanmelding die van een andere herkomst komt', async () => {
    // De grens. Zonder deze controle kan elke pagina die een verwijzing naar
    // dit tabblad heeft een bericht sturen en de bezoeker als iemand anders
    // laten "inloggen".
    const { gelukt, mislukt } = await opengezet();

    berichtUitVenster({ type: 'social-auth-success', payload: nepAanmelding }, 'https://kwaadwillend.voorbeeld.test');

    await new Promise((klaar) => setTimeout(klaar, 0));
    expect(gelukt).not.toHaveBeenCalled();
    expect(mislukt).not.toHaveBeenCalled();
    expect(venster.close).not.toHaveBeenCalled();
    // Het scherm wacht gewoon door op het echte venster.
    expect(screen.getByRole('button', { name: /Laden/ })).toBeInTheDocument();
  });

  it('negeert een bericht dat niet over aanmelden gaat', async () => {
    const { gelukt, mislukt } = await opengezet();

    berichtUitVenster({ type: 'iets-heel-anders' });
    berichtUitVenster('kale tekst zonder type');

    await new Promise((klaar) => setTimeout(klaar, 0));
    expect(gelukt).not.toHaveBeenCalled();
    expect(mislukt).not.toHaveBeenCalled();
  });

  it('toont de fout die het venster terugstuurt', async () => {
    const { mislukt } = await opengezet();

    berichtUitVenster({ type: 'social-auth-error', error: 'Toegang geweigerd door de aanbieder' });

    expect(await screen.findByText('Toegang geweigerd door de aanbieder')).toBeInTheDocument();
    expect(mislukt).toHaveBeenCalledWith('Toegang geweigerd door de aanbieder');
    expect(venster.close).toHaveBeenCalled();
  });

  it('valt terug op een algemene tekst als het venster geen reden meegeeft', async () => {
    const { mislukt } = await opengezet();

    berichtUitVenster({ type: 'social-auth-error' });

    expect(await screen.findByText('Er ging iets mis met inloggen. Probeer het opnieuw.')).toBeInTheDocument();
    expect(mislukt).toHaveBeenCalledWith('Er ging iets mis met inloggen. Probeer het opnieuw.');
  });

  it('laat het wachten los als de bezoeker het venster zelf dichtdoet', async () => {
    // Anders blijft de knop voorgoed op "Laden" staan en kan de bezoeker het
    // niet opnieuw proberen.
    await opengezet();
    expect(screen.getByRole('button', { name: /Laden/ })).toBeInTheDocument();

    venster.closed = true;
    await vi.advanceTimersByTimeAsync(600);

    await waitFor(() => expect(screen.getByRole('button', { name: /Verder met Google/ })).toBeEnabled());
  });

  it('laat een tweede poging toe na een geslaagde aanmelding', async () => {
    const gebruiker = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await opengezet();

    berichtUitVenster({ type: 'social-auth-success', payload: nepAanmelding });
    const knop = await screen.findByRole('button', { name: /Verder met Google/ });
    venster = nepVenster();
    openen.mockReturnValue(venster);
    await gebruiker.click(knop);

    await waitFor(() => expect(openen).toHaveBeenCalledTimes(2));
  });
});

describe('de terugkeerpagina in het venster', () => {
  let ontvangen: Array<{ data: unknown; herkomst: string }>;

  beforeEach(() => {
    ontvangen = [];
    (window as any).opener = {
      postMessage: (data: unknown, herkomst: string) => ontvangen.push({ data, herkomst }),
    };
  });

  afterEach(() => {
    delete (window as any).opener;
  });

  function haak() {
    let hulp: ReturnType<typeof useSocialAuthCallback> | undefined;
    function Proef() {
      hulp = useSocialAuthCallback();
      return null;
    }
    render(<Proef />);
    return hulp!;
  }

  it('stuurt het antwoord van de server terug naar het scherm dat wacht', async () => {
    axios.get.mockResolvedValue({ data: nepAanmelding });

    await haak().handleCallback('nep-code', 'nep-state', 'google');

    expect(axios.get).toHaveBeenCalledWith('/api/auth/social/google/callback?code=nep-code&state=nep-state');
    expect(ontvangen).toEqual([
      { data: { type: 'social-auth-success', payload: nepAanmelding }, herkomst: window.location.origin },
    ]);
  });

  it('stuurt altijd naar de eigen herkomst, nooit naar een willekeurig venster', async () => {
    // De tegenhanger van de controle aan de ontvangkant: een penning hoort niet
    // aan een willekeurige pagina afgeleverd te worden.
    axios.get.mockResolvedValue({ data: nepAanmelding });

    await haak().handleCallback('nep-code', 'nep-state', 'facebook');

    expect(ontvangen[0].herkomst).toBe(window.location.origin);
    expect(ontvangen[0].herkomst).not.toBe('*');
  });

  it('stuurt de reden terug als de server de aanmelding afwijst', async () => {
    axios.get.mockRejectedValue({
      isAxiosError: true,
      message: 'Verzoek mislukt',
      response: { data: { error: 'Ongeldige state' } },
    });

    await haak().handleCallback('nep-code', 'nep-state', 'google');

    expect(ontvangen).toEqual([
      { data: { type: 'social-auth-error', error: 'Ongeldige state' }, herkomst: window.location.origin },
    ]);
  });

  it('stuurt een algemene reden terug bij een fout die niet van de server komt', async () => {
    axios.get.mockRejectedValue(new Error('netwerk weg'));

    await haak().handleCallback('nep-code', 'nep-state', 'google');

    expect(ontvangen).toEqual([
      { data: { type: 'social-auth-error', error: 'Authentication failed' }, herkomst: window.location.origin },
    ]);
  });

  it('doet niets als er geen scherm is dat op het antwoord wacht', async () => {
    delete (window as any).opener;
    axios.get.mockResolvedValue({ data: nepAanmelding });

    await expect(haak().handleCallback('nep-code', 'nep-state', 'google')).resolves.toBeUndefined();

    expect(ontvangen).toEqual([]);
  });
});
