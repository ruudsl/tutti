/**
 * beschermdeFetch: fetch met een tijdslimiet, herkansingen en een
 * stroomonderbreker, die zich voor de aanroeper verder als fetch gedraagt.
 *
 * Er gaat hier niets over het netwerk: fetch is vervangen, en elke test geeft
 * een eigen `slaap` mee zodat er niet echt gewacht wordt.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  beschermdeFetch,
  DienstFout,
  StroomonderbrekerOpenFout,
  herstelAlleStroomonderbrekers,
} from '../../utils/veerkracht';

const slaap = async () => {};
const nepFetch = vi.fn<typeof fetch>();

beforeEach(() => {
  nepFetch.mockReset();
  vi.stubGlobal('fetch', nepFetch);
  herstelAlleStroomonderbrekers();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const antwoord = (status: number, tekst = '') => new Response(tekst, { status });

describe('beschermdeFetch', () => {
  it('geeft een geslaagd antwoord ongewijzigd terug', async () => {
    nepFetch.mockResolvedValueOnce(antwoord(200, 'hallo'));

    const res = await beschermdeFetch('proef', 'https://voorbeeld.org', {}, { slaap });

    expect(res.status).toBe(200);
    expect(await res.text()).toBe('hallo');
  });

  it('geeft een 404 terug zonder te herkansen - dat is een antwoord, geen storing', async () => {
    nepFetch.mockResolvedValue(antwoord(404));

    const res = await beschermdeFetch('proef', 'https://voorbeeld.org', {}, { slaap });

    expect(res.status).toBe(404);
    expect(nepFetch).toHaveBeenCalledTimes(1);
  });

  it('herkanst een tijdelijke status en geeft het goede antwoord terug', async () => {
    nepFetch.mockResolvedValueOnce(antwoord(503)).mockResolvedValueOnce(antwoord(200, 'toch gelukt'));

    const res = await beschermdeFetch('proef', 'https://voorbeeld.org', {}, { slaap });

    expect(await res.text()).toBe('toch gelukt');
    expect(nepFetch).toHaveBeenCalledTimes(2);
  });

  it('geeft na de laatste poging het tijdelijke antwoord zelf terug, zodat de aanroeper zijn eigen melding kan geven', async () => {
    nepFetch.mockImplementation(async () => antwoord(503, 'onderhoud'));

    const res = await beschermdeFetch('proef', 'https://voorbeeld.org', {}, { pogingen: 3, slaap });

    expect(res.status).toBe(503);
    expect(await res.text()).toBe('onderhoud');
    expect(nepFetch).toHaveBeenCalledTimes(3);
  });

  it('probeert een niet-herhaalbare aanroep maar één keer', async () => {
    nepFetch.mockResolvedValue(antwoord(503));

    await beschermdeFetch('proef', 'https://voorbeeld.org', { method: 'POST' }, { pogingen: 1, slaap });

    expect(nepFetch).toHaveBeenCalledTimes(1);
  });

  it('geeft elke poging een tijdslimiet mee', async () => {
    nepFetch.mockResolvedValueOnce(antwoord(200));

    await beschermdeFetch('proef', 'https://voorbeeld.org', {}, { slaap });

    const init = nepFetch.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('maakt van een dienst die te traag is een DienstFout', async () => {
    nepFetch.mockImplementation(
      (_url, init) =>
        new Promise((_, weiger) => {
          init?.signal?.addEventListener('abort', () => weiger(init.signal!.reason));
        }),
    );

    const fout = await beschermdeFetch(
      'proef',
      'https://voorbeeld.org',
      {},
      { tijdslimietMs: 20, pogingen: 1, slaap },
    ).catch((f: unknown) => f);

    expect(fout).toBeInstanceOf(DienstFout);
    expect((fout as DienstFout).dienst).toBe('proef');
  });

  it('maakt van een netwerkfout na de laatste poging een DienstFout', async () => {
    nepFetch.mockRejectedValue(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }));

    await expect(beschermdeFetch('proef', 'https://voorbeeld.org', {}, { pogingen: 2, slaap })).rejects.toBeInstanceOf(
      DienstFout,
    );
    expect(nepFetch).toHaveBeenCalledTimes(2);
  });

  it('belt niet meer zolang de onderbreker openstaat', async () => {
    nepFetch.mockResolvedValue(antwoord(503));
    const opties = { pogingen: 1, slaap, onderbreker: { drempel: 2 } };

    await beschermdeFetch('plat', 'https://voorbeeld.org', {}, opties);
    await beschermdeFetch('plat', 'https://voorbeeld.org', {}, opties);
    const derde = beschermdeFetch('plat', 'https://voorbeeld.org', {}, opties);

    await expect(derde).rejects.toBeInstanceOf(StroomonderbrekerOpenFout);
    expect(nepFetch).toHaveBeenCalledTimes(2);
  });

  it('laat een fout van de aanroeper zelf ongemoeid', async () => {
    nepFetch.mockRejectedValue(new TypeError('Invalid URL'));

    await expect(beschermdeFetch('proef', 'geen-url', {}, { slaap })).rejects.toThrow('Invalid URL');
  });
});
