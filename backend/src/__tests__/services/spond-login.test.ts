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
import { SpondClient, SpondLoginError } from '../../services/spond';

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
