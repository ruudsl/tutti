/**
 * Met welk JWT-geheim mag de applicatie in productie starten?
 *
 * Wie het geheim kent, maakt zelf een token voor elke gebruiker, ook voor een
 * beheerder. De voorbeeldwaarden uit `.env.example` en `backend/.env.example`
 * waren lang genoeg voor de lengte-eis en startten gewoon; alleen het
 * ontwikkelgeheim uit config.ts zelf werd geweigerd. Een vergeten vervanging
 * hoort de start tegen te houden, niet stil een openbaar bekende sleutel op
 * te leveren.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import crypto from 'crypto';

async function laadConfig(omgeving: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [naam, waarde] of Object.entries(omgeving)) {
    vi.stubEnv(naam, waarde as string);
  }
  return (await import('../config')).default;
}

const productie = (geheim: string | undefined) => ({
  NODE_ENV: 'production',
  JWT_SECRET: geheim,
  // Ook verplicht in productie; zie versleutelgeheim-productie.test.ts.
  ENCRYPTION_SECRET: crypto.randomBytes(48).toString('base64'),
  FRONTEND_URL: 'https://tutti.example.org',
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('JWT-geheim in productie', () => {
  it.each([
    ['.env.example', 'your-very-secure-secret-key-change-this'],
    ['backend/.env.example', 'your-secret-key-change-in-production'],
    ['config.ts (het ontwikkelgeheim)', 'harmonie-dev-secret-change-in-production'],
  ])('weigert de voorbeeldwaarde uit %s', async (_bron, geheim) => {
    await expect(laadConfig(productie(geheim))).rejects.toThrow(/voorbeeldwaarde/);
  });

  it('weigert een eentonig geheim dat alleen aan de lengte voldoet', async () => {
    await expect(laadConfig(productie('a'.repeat(32)))).rejects.toThrow(/verschillende tekens/);
    await expect(laadConfig(productie('abcabc'.repeat(8)))).rejects.toThrow(/verschillende tekens/);
  });

  it('weigert een leeg geheim, zoals het nu in de voorbeeldbestanden staat', async () => {
    await expect(laadConfig(productie(''))).rejects.toThrow(/JWT_SECRET ontbreekt/);
  });

  it('noemt in de melding hoe je een goed geheim maakt', async () => {
    await expect(laadConfig(productie('a'.repeat(40)))).rejects.toThrow(/openssl rand/);
  });

  it('start met een willekeurig geheim', async () => {
    // Tijdens de test gemaakt, zodat er geen geheim-achtige tekenreeks in de
    // repository staat.
    const geheim = crypto.randomBytes(48).toString('base64');
    const config = await laadConfig(productie(geheim));
    expect(config.jwtSecret).toBe(geheim);
  });
});

describe('JWT-geheim buiten productie', () => {
  it('valt bij een lege waarde terug op het ontwikkelgeheim in plaats van te weigeren', async () => {
    // backend/.env.example laat het geheim leeg; wie dat lokaal kopieert moet
    // gewoon kunnen starten.
    const config = await laadConfig({ NODE_ENV: 'development', JWT_SECRET: '' });
    expect(config.jwtSecret).toBe('harmonie-dev-secret-change-in-production');
  });
});
