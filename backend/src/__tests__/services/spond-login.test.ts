/**
 * Een mislukte aanmelding bij Spond moet vertellen wat er werkelijk misging.
 *
 * De route rond deze code ving elke fout op en maakte er "controleer de
 * inloggegevens" van. Een storing bij Spond, een netwerkfout of een gewijzigde
 * API kwamen dus binnen als een verkeerd wachtwoord, waardoor iemand met
 * kloppende gegevens bleef proberen zonder ooit te horen wat er aan de hand
 * was. Deze tests leggen het onderscheid vast.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import '../setup';
import { SpondClient, SpondLoginError, pakToken } from '../../services/spond';

function antwoord(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    json: async () => body,
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Aanmelden bij Spond', () => {
  it('noemt afgewezen gegevens afgewezen', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => antwoord(401, 'Unauthorized')),
    );

    const fout = await new SpondClient('iemand@example.com', 'fout').login().catch((e) => e);

    expect(fout).toBeInstanceOf(SpondLoginError);
    expect(fout.reason).toBe('rejected');
    expect(fout.status).toBe(401);
  });

  it('ziet een 403 ook als afgewezen', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => antwoord(403, 'Forbidden')),
    );

    const fout = await new SpondClient('iemand@example.com', 'x').login().catch((e) => e);

    expect(fout.reason).toBe('rejected');
  });

  it('houdt een storing bij Spond apart van een verkeerd wachtwoord', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => antwoord(503, 'Service Unavailable')),
    );

    const fout = await new SpondClient('iemand@example.com', 'goed').login().catch((e) => e);

    expect(fout).toBeInstanceOf(SpondLoginError);
    expect(fout.reason).toBe('unexpected');
    expect(fout.status).toBe(503);
  });

  it('herkent dat Spond helemaal niet bereikbaar was', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('getaddrinfo ENOTFOUND api.spond.com');
      }),
    );

    const fout = await new SpondClient('iemand@example.com', 'goed').login().catch((e) => e);

    expect(fout).toBeInstanceOf(SpondLoginError);
    expect(fout.reason).toBe('unreachable');
    expect(fout.message).toContain('ENOTFOUND');
  });

  it('klaagt als er wel een 200 komt maar geen token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => antwoord(200, { twoFactorRequired: true })),
    );

    const fout = await new SpondClient('iemand@example.com', 'goed').login().catch((e) => e);

    expect(fout).toBeInstanceOf(SpondLoginError);
    expect(fout.reason).toBe('unexpected');
    expect(fout.message).toContain('tweestapsverificatie');
  });

  it('stuurt een herkenbare afzender mee', async () => {
    const nep = vi.fn(async () => antwoord(200, { loginToken: 'abc' }));
    vi.stubGlobal('fetch', nep);

    await new SpondClient('iemand@example.com', 'goed').login();

    const headers = (nep.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers['User-Agent']).toContain('Tutti');
  });

  it('accepteert zowel loginToken als token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => antwoord(200, { token: 'xyz' })),
    );

    await expect(new SpondClient('iemand@example.com', 'goed').login()).resolves.toBeUndefined();
  });
});

describe('Aanmeldpad bij Spond', () => {
  it('valt terug op het oude pad als het nieuwe een 404 geeft', async () => {
    const nep = vi.fn(async (url: string) =>
      url.includes('/auth2/login') ? antwoord(404, { errorCode: 404 }) : antwoord(200, { loginToken: 'abc' }),
    );
    vi.stubGlobal('fetch', nep);

    await new SpondClient('iemand@example.com', 'goed').login();

    expect(nep).toHaveBeenCalledTimes(2);
    expect(nep.mock.calls[0][0]).toContain('/auth2/login');
    expect(nep.mock.calls[1][0]).toContain('/login');
  });

  it('zoekt niet verder als het eerste pad antwoordt', async () => {
    const nep = vi.fn(async () => antwoord(200, { loginToken: 'abc' }));
    vi.stubGlobal('fetch', nep);

    await new SpondClient('iemand@example.com', 'goed').login();

    expect(nep).toHaveBeenCalledTimes(1);
    expect(nep.mock.calls[0][0]).toContain('/auth2/login');
  });

  it('blijft bij een 401 staan in plaats van door te zoeken', async () => {
    const nep = vi.fn(async () => antwoord(401, 'Unauthorized'));
    vi.stubGlobal('fetch', nep);

    const fout = await new SpondClient('iemand@example.com', 'fout').login().catch((e) => e);

    // Een 401 zegt dat we het juiste adres hebben en de gegevens niet kloppen.
    // Doorzoeken zou dat verhullen achter "geen adres gevonden".
    expect(nep).toHaveBeenCalledTimes(1);
    expect(fout.reason).toBe('rejected');
  });

  it('meldt het duidelijk als geen enkel pad bestaat', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => antwoord(404, { message: 'HTTP 404 Not Found', errorCode: 404 })),
    );

    const fout = await new SpondClient('iemand@example.com', 'goed').login().catch((e) => e);

    expect(fout).toBeInstanceOf(SpondLoginError);
    expect(fout.status).toBe(404);
    expect(fout.message).toContain('API gewijzigd');
    // Dit is nadrukkelijk geen 'rejected': het wachtwoord is nooit beoordeeld.
    expect(fout.reason).toBe('unexpected');
  });
});

describe('Het aanmeldtoken uit het antwoord halen', () => {
  it('kent de namen die Spond gebruikt heeft', () => {
    expect(pakToken({ loginToken: 'a' })).toBe('a');
    expect(pakToken({ token: 'b' })).toBe('b');
    expect(pakToken({ accessToken: 'c' })).toBe('c');
    expect(pakToken({ access_token: 'd' })).toBe('d');
  });

  it('kijkt een niveau dieper als het antwoord een omhulsel heeft', () => {
    expect(pakToken({ data: { loginToken: 'diep' } })).toBe('diep');
  });

  it('graaft niet eindeloos door', () => {
    expect(pakToken({ a: { b: { loginToken: 'te diep' } } })).toBeNull();
  });

  it('trapt niet in een leeg veld', () => {
    expect(pakToken({ loginToken: '' })).toBeNull();
    expect(pakToken({ loginToken: null })).toBeNull();
  });

  it('noemt de ontvangen velden in de melding', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => antwoord(200, { challenge: 'x', twoFactorRequired: true })),
    );

    const fout = await new SpondClient('iemand@example.com', 'goed').login().catch((e) => e);

    // Zonder deze aanwijzing moet een beheerder in de serverlogs gaan graven.
    expect(fout.message).toContain('challenge');
    expect(fout.message).toContain('twoFactorRequired');
    expect(fout.message).toContain('/auth2/login');
    // De waarden horen er niet in te staan, alleen de namen.
    expect(fout.message).not.toContain('"x"');
  });

  it('zegt het duidelijk als er helemaal niets terugkwam', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => antwoord(200, {})),
    );

    const fout = await new SpondClient('iemand@example.com', 'goed').login().catch((e) => e);
    expect(fout.message).toContain('(geen)');
  });
});
