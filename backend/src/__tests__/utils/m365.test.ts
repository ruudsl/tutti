/**
 * De koppeling met Microsoft 365 praat met een systeem dat wij niet beheren.
 *
 * Microsoft heeft storingen, tokens verlopen, en een postbus die net is
 * aangemaakt bestaat een halve minuut lang nog niet. Wat er dan gebeurt mag
 * niet als een kale 500 bij een bestuurslid terechtkomen, en de clientsleutel
 * van de vereniging mag nergens in een log of een antwoord opduiken.
 *
 * Het netwerk is hier volledig gemockt: deze tests gaan nooit echt naar
 * Microsoft. De database is de testdatabase uit setup.ts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '../setup';
import { v4 as uuidv4 } from 'uuid';
import testDb from '../testDb';
import logger from '../../utils/logger';
import { getMicrosoftConfig, getAppAccessToken, setupEmailForwarding } from '../../utils/m365';

const CLIENT_SECRET = 'zeer-geheime-clientsleutel-abc123';
const TOEGANGSTOKEN = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.nep-token';
const GEBRUIKER_ID = '11111111-2222-3333-4444-555555555555';
const DOORSTUURADRES = 'lid@prive.example';

const TOKEN_URL = 'https://login.microsoftonline.com';
const EXCHANGE_URL = 'https://graph.microsoft.com/beta/admin/exchange/mailboxes';
const REGELS_URL = `https://graph.microsoft.com/v1.0/users/${GEBRUIKER_ID}/mailFolders/inbox/messageRules`;

interface Antwoord {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}

/** Bouwt een antwoord zoals Microsoft Graph dat teruggeeft. */
function graafAntwoord(status: number, body: unknown = {}): Antwoord {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

/** Een foutantwoord van Graph in het gebruikelijke { error: { code, message } }-jasje. */
function graafFout(status: number, code: string, message: string): Antwoord {
  return graafAntwoord(status, { error: { code, message } });
}

/** Een antwoord dat geen geldige JSON bevat, zoals een proxy dat kan teruggeven. */
function nietJson(status: number): Antwoord {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      throw new SyntaxError('Unexpected token < in JSON at position 0');
    },
    text: async () => '<html><body>502 Bad Gateway</body></html>',
  };
}

type Route = 'token' | 'gebruiker' | 'exchange' | 'regels';

/**
 * Zet een fetch-mock neer die op basis van de URL naar de juiste afhandelaar
 * gaat. De regels-URL begint met de gebruikers-URL, dus die moet als eerste
 * herkend worden.
 */
function stubFetch(afhandelaars: Partial<Record<Route, (aanroep: number) => Antwoord | Promise<Antwoord>>>) {
  const tellers: Record<Route, number> = { token: 0, gebruiker: 0, exchange: 0, regels: 0 };
  const fetchMock = vi.fn(async (url: string) => {
    const route: Route = url.startsWith(TOKEN_URL)
      ? 'token'
      : url.startsWith(REGELS_URL)
        ? 'regels'
        : url.startsWith(EXCHANGE_URL)
          ? 'exchange'
          : 'gebruiker';
    tellers[route]++;
    const afhandelaar = afhandelaars[route];
    if (!afhandelaar) throw new Error(`Onverwachte aanroep naar ${route}: ${url}`);
    return afhandelaar(tellers[route]);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, tellers };
}

/** Alles wat aan de logger is meegegeven, als een doorzoekbare tekst. */
function alleLogtekst(): string {
  return [logger.info, logger.warn, logger.error, logger.debug]
    .flatMap((fn) => vi.mocked(fn).mock.calls)
    .map((argumenten) => argumenten.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '))
    .join('\n');
}

function maakVereniging(velden: {
  clientId?: string | null;
  clientSecret?: string | null;
  tenantId?: string | null;
  enabled?: number;
}): string {
  const id = uuidv4();
  testDb
    .prepare(
      `INSERT INTO associations
         (id, name, microsoft_client_id, microsoft_client_secret, microsoft_tenant_id, microsoft_enabled)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      `Vereniging ${id.slice(0, 8)}`,
      velden.clientId ?? null,
      velden.clientSecret ?? null,
      velden.tenantId ?? null,
      velden.enabled ?? 0,
    );
  return id;
}

beforeEach(() => {
  for (const niveau of [logger.info, logger.warn, logger.error, logger.debug]) {
    vi.mocked(niveau).mockClear();
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('getMicrosoftConfig', () => {
  it('geeft niets terug zonder vereniging', () => {
    expect(getMicrosoftConfig(null)).toBeNull();
  });

  it('geeft niets terug voor een vereniging die niet bestaat', () => {
    expect(getMicrosoftConfig(uuidv4())).toBeNull();
  });

  it('geeft de instellingen terug van een volledig ingerichte vereniging', () => {
    const id = maakVereniging({
      clientId: 'client-abc',
      clientSecret: CLIENT_SECRET,
      tenantId: 'tenant-abc',
      enabled: 1,
    });

    expect(getMicrosoftConfig(id)).toEqual({
      microsoft_client_id: 'client-abc',
      microsoft_client_secret: CLIENT_SECRET,
      microsoft_tenant_id: 'tenant-abc',
      microsoft_enabled: 1,
    });
  });

  it('geeft niets terug als de koppeling uitstaat, ook al is alles ingevuld', () => {
    const id = maakVereniging({
      clientId: 'client-abc',
      clientSecret: CLIENT_SECRET,
      tenantId: 'tenant-abc',
      enabled: 0,
    });
    expect(getMicrosoftConfig(id)).toBeNull();
  });

  it.each([
    ['client-id', { clientId: null, clientSecret: CLIENT_SECRET, tenantId: 'tenant-abc' }],
    ['clientsleutel', { clientId: 'client-abc', clientSecret: null, tenantId: 'tenant-abc' }],
    ['tenant-id', { clientId: 'client-abc', clientSecret: CLIENT_SECRET, tenantId: null }],
  ])('geeft niets terug als de %s ontbreekt', (_naam, velden) => {
    const id = maakVereniging({ ...velden, enabled: 1 });
    // Half ingevuld is niet ingevuld: een halve configuratie zou verderop een
    // aanroep met een lege sleutel opleveren.
    expect(getMicrosoftConfig(id)).toBeNull();
  });

  it('geeft niets terug bij een lege tekst in plaats van null', () => {
    const id = maakVereniging({ clientId: '', clientSecret: CLIENT_SECRET, tenantId: 'tenant-abc', enabled: 1 });
    expect(getMicrosoftConfig(id)).toBeNull();
  });
});

describe('getAppAccessToken', () => {
  const config = {
    microsoft_client_id: 'client-abc',
    microsoft_client_secret: CLIENT_SECRET,
    microsoft_tenant_id: 'tenant-abc',
    microsoft_enabled: 1,
  };

  it('vraagt een token op met de clientgegevens van de vereniging', async () => {
    const { fetchMock } = stubFetch({ token: () => graafAntwoord(200, { access_token: TOEGANGSTOKEN }) });

    const token = await getAppAccessToken(config);

    expect(token).toBe(TOEGANGSTOKEN);
    const [url, opties] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://login.microsoftonline.com/tenant-abc/oauth2/v2.0/token');
    expect(opties.method).toBe('POST');
    const velden = new URLSearchParams(String(opties.body));
    expect(velden.get('client_id')).toBe('client-abc');
    expect(velden.get('grant_type')).toBe('client_credentials');
    expect(velden.get('scope')).toBe('https://graph.microsoft.com/.default');
  });

  it('geeft een fout van Microsoft door als een nette Nederlandse melding', async () => {
    // Dit is het punt waar een storing bij Microsoft geen kale 500 met een
    // Engelse stacktrace bij een bestuurslid mag worden.
    stubFetch({
      token: () =>
        graafAntwoord(401, {
          error: 'invalid_client',
          error_description: 'AADSTS7000215: Invalid client secret provided.',
        }),
    });

    await expect(getAppAccessToken(config)).rejects.toThrow('Kan geen toegangstoken verkrijgen van Microsoft.');
  });

  it('zet de clientsleutel niet in de foutmelding', async () => {
    stubFetch({ token: () => graafAntwoord(500, 'Internal Server Error') });

    const fout = await getAppAccessToken(config).catch((e: Error) => e);

    expect(fout).toBeInstanceOf(Error);
    expect((fout as Error).message).not.toContain(CLIENT_SECRET);
    // De melding is bewust nietszeggend: de aanroeper hoeft niet te weten of
    // het aan de sleutel, de tenant of aan Microsoft zelf lag.
    expect((fout as Error).message).toBe('Kan geen toegangstoken verkrijgen van Microsoft.');
  });

  it('zet de clientsleutel niet in een logregel', async () => {
    stubFetch({
      token: () => graafAntwoord(400, { error: 'invalid_request', error_description: 'AADSTS900023' }),
    });

    await getAppAccessToken(config).catch(() => undefined);

    const logtekst = alleLogtekst();
    expect(logtekst).not.toContain(CLIENT_SECRET);
    // Er is wel gelogd, dus de test bewijst iets.
    expect(logtekst).toContain('Failed to get app access token');
  });

  it('stuurt het token zelf ook niet naar het log', async () => {
    stubFetch({ token: () => graafAntwoord(200, { access_token: TOEGANGSTOKEN }) });

    await getAppAccessToken(config);

    expect(alleLogtekst()).not.toContain(TOEGANGSTOKEN);
  });
});

describe('setupEmailForwarding', () => {
  it('zet het doorsturen via de Exchange-beheerkant als dat lukt', async () => {
    const { tellers } = stubFetch({
      gebruiker: () => graafAntwoord(204),
      exchange: () => graafAntwoord(200),
    });

    const resultaat = await setupEmailForwarding(TOEGANGSTOKEN, GEBRUIKER_ID, DOORSTUURADRES);

    expect(resultaat).toEqual({ success: true });
    // De terugvaloptie is niet nodig geweest.
    expect(tellers.regels).toBe(0);
  });

  it('stuurt het doorstuuradres mee naar Exchange met het smtp-voorvoegsel', async () => {
    const { fetchMock } = stubFetch({
      gebruiker: () => graafAntwoord(204),
      exchange: () => graafAntwoord(200),
    });

    await setupEmailForwarding(TOEGANGSTOKEN, GEBRUIKER_ID, DOORSTUURADRES);

    const exchangeAanroep = fetchMock.mock.calls.find(([url]) => String(url).startsWith(EXCHANGE_URL)) as unknown as [
      string,
      RequestInit,
    ];
    expect(JSON.parse(String(exchangeAanroep[1].body))).toEqual({
      forwardingSmtpAddress: `smtp:${DOORSTUURADRES}`,
      deliverToMailboxAndForward: true,
    });
  });

  it('valt terug op een postvak-regel als de Exchange-beheer-API er niet is', async () => {
    const { tellers } = stubFetch({
      gebruiker: () => graafAntwoord(204),
      exchange: () => graafFout(404, 'ResourceNotFound', 'Not found'),
      regels: () => graafAntwoord(201),
    });

    const resultaat = await setupEmailForwarding(TOEGANGSTOKEN, GEBRUIKER_ID, DOORSTUURADRES);

    expect(resultaat).toEqual({ success: true });
    expect(tellers.regels).toBe(1);
  });

  it('valt ook terug bij een storing van Microsoft, niet alleen bij een 404', async () => {
    // De terugvaloptie is bewust breed: de Exchange-beheer-API faalt ook
    // tijdelijk zolang de postbus nog wordt aangemaakt.
    const { tellers } = stubFetch({
      gebruiker: () => graafAntwoord(204),
      exchange: () => graafFout(500, 'InternalServerError', 'Something went wrong'),
      regels: () => graafAntwoord(201),
    });

    expect(await setupEmailForwarding(TOEGANGSTOKEN, GEBRUIKER_ID, DOORSTUURADRES)).toEqual({ success: true });
    expect(tellers.regels).toBe(1);
  });

  it('valt terug als de aanroep naar Exchange het netwerk niet eens haalt', async () => {
    const { tellers } = stubFetch({
      gebruiker: () => graafAntwoord(204),
      exchange: () => {
        throw new Error('ECONNRESET');
      },
      regels: () => graafAntwoord(201),
    });

    expect(await setupEmailForwarding(TOEGANGSTOKEN, GEBRUIKER_ID, DOORSTUURADRES)).toEqual({ success: true });
    expect(tellers.regels).toBe(1);
  });

  it('gaat door met doorsturen als het bijwerken van otherMails mislukt', async () => {
    // otherMails is slechts een naslagveld; het echte doorsturen is
    // belangrijker en mag niet blijven liggen omdat dit veld niet gezet kon
    // worden.
    const { tellers } = stubFetch({
      gebruiker: () => graafFout(403, 'Authorization_RequestDenied', 'Insufficient privileges'),
      exchange: () => graafAntwoord(200),
    });

    expect(await setupEmailForwarding(TOEGANGSTOKEN, GEBRUIKER_ID, DOORSTUURADRES)).toEqual({ success: true });
    expect(tellers.exchange).toBe(1);
  });

  it('gaat ook door als het antwoord op otherMails geen JSON is', async () => {
    // Een tussenliggende proxy of gateway antwoordt met HTML in plaats van
    // JSON. Ook dan is het doorsturen belangrijker dan het naslagveld.
    const { tellers } = stubFetch({
      gebruiker: () => nietJson(502),
      exchange: () => graafAntwoord(200),
    });

    const resultaat = await setupEmailForwarding(TOEGANGSTOKEN, GEBRUIKER_ID, DOORSTUURADRES);

    expect(resultaat).toEqual({ success: true });
    expect(tellers.exchange).toBe(1);
  });

  describe('als beide wegen mislukken', () => {
    it('geeft een resultaat terug in plaats van te gooien', async () => {
      stubFetch({
        gebruiker: () => graafAntwoord(204),
        exchange: () => graafFout(403, 'AccessDenied', 'Insufficient privileges'),
        regels: () => graafFout(400, 'ErrorInvalidParameter', 'Rule is invalid'),
      });

      const resultaat = await setupEmailForwarding(TOEGANGSTOKEN, GEBRUIKER_ID, DOORSTUURADRES);

      // Geen throw: de aanroeper krijgt geen 500 maar een nette melding die
      // hij zelf kan tonen of later opnieuw kan proberen.
      expect(resultaat.success).toBe(false);
      expect(resultaat.error).toContain('AccessDenied');
      expect(resultaat.error).toContain('ErrorInvalidParameter');
    });

    it('zet het toegangstoken niet in de foutmelding', async () => {
      stubFetch({
        gebruiker: () => graafAntwoord(204),
        exchange: () => graafFout(401, 'InvalidAuthenticationToken', 'Access token has expired.'),
        regels: () => graafFout(401, 'InvalidAuthenticationToken', 'Access token has expired.'),
      });

      const resultaat = await setupEmailForwarding(TOEGANGSTOKEN, GEBRUIKER_ID, DOORSTUURADRES);

      expect(resultaat.success).toBe(false);
      expect(JSON.stringify(resultaat)).not.toContain(TOEGANGSTOKEN);
      expect(alleLogtekst()).not.toContain(TOEGANGSTOKEN);
    });
  });

  it('behandelt een verlopen token als een gewone mislukking, niet als een crash', async () => {
    // Een verlopen app-token levert op elk eindpunt een 401 op. Dat is voor de
    // planner een reden om het later opnieuw te proberen, geen reden om de
    // hele taak te laten klappen.
    const { tellers } = stubFetch({
      gebruiker: () => graafFout(401, 'InvalidAuthenticationToken', 'Access token has expired.'),
      exchange: () => graafFout(401, 'InvalidAuthenticationToken', 'Access token has expired.'),
      regels: () => graafFout(401, 'InvalidAuthenticationToken', 'Access token has expired.'),
    });

    const resultaat = await setupEmailForwarding('verlopen-token', GEBRUIKER_ID, DOORSTUURADRES);

    expect(resultaat.success).toBe(false);
    expect(resultaat.error).toContain('InvalidAuthenticationToken');
    // Een 401 is niet "postbus nog niet klaar": er wordt niet eindeloos
    // opnieuw geprobeerd met een token dat toch verlopen blijft.
    expect(tellers.regels).toBe(1);
  });

  describe('een postbus die nog niet klaar is', () => {
    it('probeert het opnieuw en slaagt zodra de postbus bestaat', async () => {
      vi.useFakeTimers();
      const { tellers } = stubFetch({
        gebruiker: () => graafAntwoord(204),
        exchange: () => graafFout(404, 'ResourceNotFound', 'Not found'),
        regels: (aanroep) =>
          aanroep < 3
            ? graafFout(404, 'MailboxNotEnabledForRESTAPI', 'The mailbox is not enabled for REST API access')
            : graafAntwoord(201),
      });

      const belofte = setupEmailForwarding(TOEGANGSTOKEN, GEBRUIKER_ID, DOORSTUURADRES);
      // De wachttijd verdubbelt per poging: 3s, 6s, 12s, 24s.
      await vi.advanceTimersByTimeAsync(60_000);

      expect(await belofte).toEqual({ success: true });
      expect(tellers.regels).toBe(3);
    });

    it('geeft het na vijf pogingen op in plaats van eindeloos door te gaan', async () => {
      vi.useFakeTimers();
      const { tellers } = stubFetch({
        gebruiker: () => graafAntwoord(204),
        exchange: () => graafFout(404, 'ResourceNotFound', 'Not found'),
        regels: () => graafFout(404, 'MailboxNotEnabledForRESTAPI', 'The mailbox is not enabled'),
      });

      const belofte = setupEmailForwarding(TOEGANGSTOKEN, GEBRUIKER_ID, DOORSTUURADRES);
      // 3 + 6 + 12 + 24 = 45 seconden aan wachttijd; ruim overheen draaien.
      await vi.advanceTimersByTimeAsync(120_000);
      const resultaat = await belofte;

      expect(tellers.regels).toBe(5);
      expect(resultaat.success).toBe(false);
      expect(resultaat.error).toContain('MailboxNotEnabledForRESTAPI');
    });

    it('herkent ook een foutmelding waarin alleen het woord mailbox voorkomt', async () => {
      vi.useFakeTimers();
      const { tellers } = stubFetch({
        gebruiker: () => graafAntwoord(204),
        exchange: () => graafFout(404, 'ResourceNotFound', 'Not found'),
        regels: (aanroep) =>
          aanroep === 1 ? graafFout(503, 'ServiceUnavailable', 'The mailbox is being provisioned') : graafAntwoord(201),
      });

      const belofte = setupEmailForwarding(TOEGANGSTOKEN, GEBRUIKER_ID, DOORSTUURADRES);
      await vi.advanceTimersByTimeAsync(60_000);

      expect(await belofte).toEqual({ success: true });
      expect(tellers.regels).toBe(2);
    });

    it('probeert het ook opnieuw als de verbinding wegvalt', async () => {
      vi.useFakeTimers();
      const { tellers } = stubFetch({
        gebruiker: () => graafAntwoord(204),
        exchange: () => graafFout(404, 'ResourceNotFound', 'Not found'),
        regels: (aanroep) => {
          if (aanroep === 1) throw new Error('ETIMEDOUT');
          return graafAntwoord(201);
        },
      });

      const belofte = setupEmailForwarding(TOEGANGSTOKEN, GEBRUIKER_ID, DOORSTUURADRES);
      await vi.advanceTimersByTimeAsync(60_000);

      expect(await belofte).toEqual({ success: true });
      expect(tellers.regels).toBe(2);
    });
  });
});
