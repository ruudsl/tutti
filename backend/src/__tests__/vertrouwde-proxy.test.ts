/**
 * Hoeveel proxy's staan er vóór de applicatie? Van dat getal hangt af welk
 * adres uit X-Forwarded-For Express als req.ip teruggeeft, en daarmee wat de
 * IP-witlijst en de afremming van bestellingen als "de aanvrager" zien.
 *
 * Alleen een getal is toegestaan. `true` zou Express het meest linkse adres
 * laten geloven - het adres dat de aanvrager er zelf in zet.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';

async function laadConfig(omgeving: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [naam, waarde] of Object.entries(omgeving)) {
    vi.stubEnv(naam, waarde as string);
  }
  return (await import('../config')).default;
}

const productie = {
  NODE_ENV: 'production',
  JWT_SECRET: 'x'.repeat(32),
  FRONTEND_URL: 'https://tutti.example.org',
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('TRUST_PROXY', () => {
  it('vertrouwt in productie standaard precies één proxy', async () => {
    const config = await laadConfig({ ...productie, TRUST_PROXY: undefined });
    expect(config.trustProxy).toBe(1);
  });

  it('vertrouwt buiten productie standaard niemand', async () => {
    const config = await laadConfig({ NODE_ENV: 'test', TRUST_PROXY: undefined });
    expect(config.trustProxy).toBe(0);
  });

  it('neemt een opgegeven aantal over', async () => {
    const config = await laadConfig({ ...productie, TRUST_PROXY: '2' });
    expect(config.trustProxy).toBe(2);
  });

  it('weigert "true" in plaats van ongemerkt iedereen te geloven', async () => {
    await expect(laadConfig({ ...productie, TRUST_PROXY: 'true' })).rejects.toThrow(/TRUST_PROXY/);
  });
});
