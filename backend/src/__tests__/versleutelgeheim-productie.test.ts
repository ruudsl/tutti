/**
 * Met welk ENCRYPTION_SECRET mag de applicatie in productie starten?
 *
 * De sleutel voor opgeslagen geheimen hing aan JWT_SECRET. Wie dat verving -
 * na een lek, of omdat het hostingplatform een nieuw genereerde - maakte
 * daarmee ook alle opgeslagen wachtwoorden en tokens onleesbaar. Een eigen
 * geheim is daarom verplicht, met dezelfde eisen als JWT_SECRET.
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

// Tijdens de test gemaakt, zodat er geen geheim-achtige tekenreeks in de
// repository staat.
const willekeurig = () => crypto.randomBytes(48).toString('base64');

const productie = (versleutelgeheim: string | undefined, jwtGeheim = willekeurig()) => ({
  NODE_ENV: 'production',
  JWT_SECRET: jwtGeheim,
  ENCRYPTION_SECRET: versleutelgeheim,
  FRONTEND_URL: 'https://tutti.example.org',
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('ENCRYPTION_SECRET in productie', () => {
  it('weigert te starten zonder, ook met een lege waarde zoals in de voorbeeldbestanden', async () => {
    await expect(laadConfig(productie(undefined))).rejects.toThrow(/ENCRYPTION_SECRET ontbreekt/);
    await expect(laadConfig(productie(''))).rejects.toThrow(/ENCRYPTION_SECRET ontbreekt/);
  });

  it('weigert een te kort geheim', async () => {
    await expect(laadConfig(productie(willekeurig().slice(0, 20)))).rejects.toThrow(
      /ENCRYPTION_SECRET is korter dan 32 tekens/,
    );
  });

  it('weigert een voorbeeldwaarde en een eentonig geheim', async () => {
    await expect(laadConfig(productie('your-very-secure-secret-key-change-this'))).rejects.toThrow(
      /ENCRYPTION_SECRET is de voorbeeldwaarde/,
    );
    await expect(laadConfig(productie('a'.repeat(40)))).rejects.toThrow(/ENCRYPTION_SECRET .*verschillende tekens/);
  });

  it('weigert hetzelfde geheim als JWT_SECRET', async () => {
    const geheim = willekeurig();
    await expect(laadConfig(productie(geheim, geheim))).rejects.toThrow(/gelijk aan JWT_SECRET/);
  });

  it('start met een eigen willekeurig geheim', async () => {
    const config = await laadConfig(productie(willekeurig()));
    expect(config.isProduction).toBe(true);
  });
});

describe('ENCRYPTION_SECRET buiten productie', () => {
  it('is niet verplicht', async () => {
    const config = await laadConfig({ NODE_ENV: 'development', JWT_SECRET: '', ENCRYPTION_SECRET: '' });
    expect(config.isProduction).toBe(false);
  });
});
