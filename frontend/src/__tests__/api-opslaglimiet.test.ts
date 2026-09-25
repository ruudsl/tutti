/**
 * Een upload die de opslaggrens van de vereniging overschrijdt.
 *
 * De server antwoordt 413 met een Nederlandse melding en de vaste code
 * OPSLAGLIMIET_BEREIKT. Elk uploadscherm toont `error.response.data.error`;
 * de client zet daar de melding in de taal van de gebruiker neer, zodat geen
 * enkel scherm er zelf iets voor hoeft te doen.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import i18n from 'i18next';
import { startNepserver, stopNepserver, antwoordMetFout } from './nepserver-api';
import { uploadMusicPieces } from '../api';

const SERVERMELDING = 'De opslaglimiet van deze vereniging is bereikt: 5 MB van 5 MB in gebruik.';

beforeAll(async () => {
  if (!i18n.isInitialized) {
    await i18n.init({ lng: 'en', resources: {} });
  }
  const en = (await import('../locales/en.json')).default as unknown as { opslag: Record<string, string> };
  i18n.addResourceBundle('en', 'translation', { opslag: en.opslag }, true, true);
  await i18n.changeLanguage('en');
});

beforeEach(() => startNepserver());
afterEach(() => stopNepserver());

async function fout(): Promise<{ response: { status: number; data: { error: string; code?: string } } }> {
  try {
    await uploadMusicPieces([new File(['%PDF'], 'mars.pdf', { type: 'application/pdf' })]);
  } catch (e) {
    return e as { response: { status: number; data: { error: string; code?: string } } };
  }
  throw new Error('De upload had moeten mislukken.');
}

describe('de melding bij een volle opslag', () => {
  it('komt in de taal van de gebruiker, op de plek waar elk scherm hem leest', async () => {
    antwoordMetFout(413, { error: SERVERMELDING, code: 'OPSLAGLIMIET_BEREIKT' });

    const { response } = await fout();

    expect(response.status).toBe(413);
    expect(response.data.error).toBe(
      "Your association's storage limit has been reached. Delete files first or ask for a higher limit.",
    );
  });

  it('laat een andere 413 zoals hij is', async () => {
    antwoordMetFout(413, { error: 'Bestand te groot.' });

    const { response } = await fout();

    expect(response.data.error).toBe('Bestand te groot.');
  });
});
