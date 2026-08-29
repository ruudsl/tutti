/**
 * Tests voor herkansen en de stroomonderbreker.
 *
 * Er wordt hier niet echt gewacht: elke test geeft zijn eigen `slaap` en `nu`
 * mee, zodat de tijd een getal is dat de test zelf opschuift. Anders duurt een
 * test die een onderbreker van dertig seconden laat dichtvallen dertig seconden.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DienstFout,
  Stroomonderbreker,
  StroomonderbrekerOpenFout,
  beschermd,
  herkansNaUitKop,
  herstelAlleStroomonderbrekers,
  isTijdelijk,
  metHerkansing,
  statusVan,
  stroomonderbreker,
  stroomstanden,
  wachttijd,
} from '../../utils/veerkracht';

vi.mock('../../utils/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

/** Wachten zonder te wachten, met een lijst van wat er gevraagd is. */
function nepSlaap(): { slaap: (ms: number) => Promise<void>; gewacht: number[] } {
  const gewacht: number[] = [];
  return {
    gewacht,
    slaap: async (ms: number) => {
      gewacht.push(ms);
    },
  };
}

/** Een klok die alleen opschuift als de test dat zegt. */
function nepKlok(start = 1_000_000): { nu: () => number; verstrijk: (ms: number) => void } {
  let stand = start;
  return {
    nu: () => stand,
    verstrijk: (ms: number) => {
      stand += ms;
    },
  };
}

describe('isTijdelijk', () => {
  it.each([408, 425, 429, 500, 502, 503, 504])('%i is tijdelijk', (status) => {
    expect(isTijdelijk(new DienstFout('mislukt', { dienst: 'test', status }))).toBe(true);
  });

  it.each([400, 401, 403, 404, 409, 422, 501, 505])('%i is geen storing maar een antwoord', (status) => {
    expect(isTijdelijk(new DienstFout('mislukt', { dienst: 'test', status }))).toBe(false);
  });

  it('herkent een axios-fout aan response.status', () => {
    expect(isTijdelijk({ response: { status: 503 } })).toBe(true);
    expect(isTijdelijk({ response: { status: 404 } })).toBe(false);
  });

  it('herkent netwerkcodes van Node', () => {
    expect(isTijdelijk(Object.assign(new Error('reset'), { code: 'ECONNRESET' }))).toBe(true);
    expect(isTijdelijk(Object.assign(new Error('weg'), { code: 'ENOTFOUND' }))).toBe(false);
  });

  it('kijkt door de cause heen die fetch eromheen zet', () => {
    const binnen = Object.assign(new Error('connect'), { code: 'ECONNREFUSED' });
    expect(isTijdelijk(new TypeError('fetch failed', { cause: binnen }))).toBe(true);
  });

  it('herkent een verlopen timeout', () => {
    const fout = new Error('De tijd is om');
    fout.name = 'TimeoutError';
    expect(isTijdelijk(fout)).toBe(true);
  });

  it('noemt een gewone fout niet tijdelijk', () => {
    expect(isTijdelijk(new Error('kapot'))).toBe(false);
    expect(isTijdelijk('kapot')).toBe(false);
    expect(isTijdelijk(null)).toBe(false);
  });
});

describe('statusVan', () => {
  it('haalt de status uit een DienstFout, een fetch-achtig object en axios', () => {
    expect(statusVan(new DienstFout('x', { dienst: 'd', status: 503 }))).toBe(503);
    expect(statusVan({ status: 404 })).toBe(404);
    expect(statusVan({ response: { status: 500 } })).toBe(500);
    expect(statusVan(new Error('geen status'))).toBeUndefined();
  });
});

describe('herkansNaUitKop', () => {
  it('leest seconden', () => {
    expect(herkansNaUitKop('30')).toBe(30_000);
    expect(herkansNaUitKop('0')).toBe(0);
  });

  it('leest een datum', () => {
    const straks = new Date(Date.now() + 5000).toUTCString();
    const ms = herkansNaUitKop(straks);
    expect(ms).toBeGreaterThan(3000);
    expect(ms).toBeLessThanOrEqual(5000);
  });

  it('geeft niets terug bij onzin of niets', () => {
    expect(herkansNaUitKop(null)).toBeUndefined();
    expect(herkansNaUitKop('')).toBeUndefined();
    expect(herkansNaUitKop('straks')).toBeUndefined();
  });
});

describe('wachttijd', () => {
  it('verdubbelt per poging', () => {
    expect(wachttijd(1, 200, 5000, () => 0)).toBe(100);
    expect(wachttijd(2, 200, 5000, () => 0)).toBe(200);
    expect(wachttijd(3, 200, 5000, () => 0)).toBe(400);
  });

  it('blijft onder het plafond', () => {
    expect(wachttijd(10, 200, 1000, () => 1)).toBe(1000);
  });

  it('spreidt tussen de helft en het geheel', () => {
    expect(wachttijd(2, 200, 5000, () => 0)).toBe(200);
    expect(wachttijd(2, 200, 5000, () => 1)).toBe(400);
  });
});

describe('metHerkansing', () => {
  it('geeft het resultaat van de eerste geslaagde poging', async () => {
    const taak = vi.fn().mockResolvedValue('goed');
    await expect(metHerkansing(taak)).resolves.toBe('goed');
    expect(taak).toHaveBeenCalledTimes(1);
  });

  it('herkanst een tijdelijke fout en slaagt alsnog', async () => {
    const { slaap, gewacht } = nepSlaap();
    const taak = vi
      .fn()
      .mockRejectedValueOnce(new DienstFout('druk', { dienst: 'test', status: 503 }))
      .mockResolvedValue('goed');

    await expect(metHerkansing(taak, { slaap })).resolves.toBe('goed');
    expect(taak).toHaveBeenCalledTimes(2);
    expect(gewacht).toHaveLength(1);
  });

  it('herkanst een blijvende fout niet', async () => {
    const { slaap, gewacht } = nepSlaap();
    const taak = vi.fn().mockRejectedValue(new DienstFout('niet gevonden', { dienst: 'test', status: 404 }));

    await expect(metHerkansing(taak, { slaap })).rejects.toThrow('niet gevonden');
    expect(taak).toHaveBeenCalledTimes(1);
    expect(gewacht).toHaveLength(0);
  });

  it('stopt na het afgesproken aantal pogingen en gooit de laatste fout', async () => {
    const { slaap, gewacht } = nepSlaap();
    const taak = vi.fn().mockRejectedValue(new DienstFout('stuk', { dienst: 'test', status: 500 }));

    await expect(metHerkansing(taak, { pogingen: 4, slaap })).rejects.toThrow('stuk');
    expect(taak).toHaveBeenCalledTimes(4);
    expect(gewacht).toHaveLength(3);
  });

  it('herkanst helemaal niet bij pogingen: 1', async () => {
    const taak = vi.fn().mockRejectedValue(new DienstFout('stuk', { dienst: 'test', status: 500 }));
    await expect(metHerkansing(taak, { pogingen: 1 })).rejects.toThrow('stuk');
    expect(taak).toHaveBeenCalledTimes(1);
  });

  it('geeft het pogingnummer door aan de taak', async () => {
    const { slaap } = nepSlaap();
    const gezien: number[] = [];
    const taak = vi.fn(async (poging: number) => {
      gezien.push(poging);
      if (poging < 3) throw new DienstFout('druk', { dienst: 'test', status: 503 });
      return 'goed';
    });

    await expect(metHerkansing(taak, { slaap })).resolves.toBe('goed');
    expect(gezien).toEqual([1, 2, 3]);
  });

  it('houdt zich aan Retry-After als de dienst daarom vraagt', async () => {
    const { slaap, gewacht } = nepSlaap();
    const taak = vi
      .fn()
      .mockRejectedValueOnce(new DienstFout('te druk', { dienst: 'test', status: 429, herkansNaMs: 1500 }))
      .mockResolvedValue('goed');

    await expect(metHerkansing(taak, { slaap, maxMs: 5000 })).resolves.toBe('goed');
    expect(gewacht).toEqual([1500]);
  });

  it('vraagt de dienst niet meer tijd dan het plafond toestaat', async () => {
    const { slaap, gewacht } = nepSlaap();
    const taak = vi
      .fn()
      .mockRejectedValueOnce(new DienstFout('te druk', { dienst: 'test', status: 429, herkansNaMs: 3_600_000 }))
      .mockResolvedValue('goed');

    await expect(metHerkansing(taak, { slaap, maxMs: 2000, maxTotaalMs: 10_000 })).resolves.toBe('goed');
    expect(gewacht).toEqual([2000]);
  });

  it('geeft op als het tijdsbudget op is, ook met pogingen over', async () => {
    const { slaap, gewacht } = nepSlaap();
    const taak = vi.fn().mockRejectedValue(new DienstFout('stuk', { dienst: 'test', status: 500 }));

    // De eerste wachttijd is minstens basisMs / 2, dus 500ms; het budget van
    // 400ms is daar hoe dan ook te klein voor, ongeacht de spreiding.
    await expect(metHerkansing(taak, { pogingen: 10, basisMs: 1000, maxTotaalMs: 400, slaap })).rejects.toThrow('stuk');
    expect(taak).toHaveBeenCalledTimes(1);
    expect(gewacht).toHaveLength(0);
  });

  it('laat de aanroeper zelf bepalen wat herkansbaar is', async () => {
    const { slaap } = nepSlaap();
    const taak = vi.fn().mockRejectedValueOnce(new Error('eigen fout')).mockResolvedValue('goed');

    await expect(
      metHerkansing(taak, { slaap, isHerkansbaar: (f) => (f as Error).message === 'eigen fout' }),
    ).resolves.toBe('goed');
    expect(taak).toHaveBeenCalledTimes(2);
  });
});

describe('Stroomonderbreker', () => {
  it('laat alles door zolang het goed gaat', async () => {
    const onderbreker = new Stroomonderbreker('test');
    for (let i = 0; i < 20; i++) {
      await expect(onderbreker.voer(async () => 'goed')).resolves.toBe('goed');
    }
    expect(onderbreker.stand).toBe('gesloten');
  });

  it('gaat open na de afgesproken reeks storingen', async () => {
    const onderbreker = new Stroomonderbreker('test', { drempel: 3 });
    const stuk = () => Promise.reject(new DienstFout('stuk', { dienst: 'test', status: 503 }));

    await expect(onderbreker.voer(stuk)).rejects.toThrow('stuk');
    await expect(onderbreker.voer(stuk)).rejects.toThrow('stuk');
    expect(onderbreker.stand).toBe('gesloten');

    await expect(onderbreker.voer(stuk)).rejects.toThrow('stuk');
    expect(onderbreker.stand).toBe('open');
  });

  it('roept de dienst niet meer aan zolang hij openstaat', async () => {
    const klok = nepKlok();
    const onderbreker = new Stroomonderbreker('test', { drempel: 1, openMs: 30_000, nu: klok.nu });
    await expect(
      onderbreker.voer(() => Promise.reject(new DienstFout('stuk', { dienst: 'test', status: 500 }))),
    ).rejects.toThrow();

    const taak = vi.fn().mockResolvedValue('goed');
    await expect(onderbreker.voer(taak)).rejects.toBeInstanceOf(StroomonderbrekerOpenFout);
    expect(taak).not.toHaveBeenCalled();
  });

  it('vertelt hoe lang het nog duurt', async () => {
    const klok = nepKlok();
    const onderbreker = new Stroomonderbreker('spond', { drempel: 1, openMs: 30_000, nu: klok.nu });
    await expect(
      onderbreker.voer(() => Promise.reject(new DienstFout('stuk', { dienst: 'spond', status: 500 }))),
    ).rejects.toThrow();

    klok.verstrijk(10_000);
    await expect(onderbreker.voer(async () => 'goed')).rejects.toMatchObject({
      name: 'StroomonderbrekerOpenFout',
      dienst: 'spond',
      opnieuwOverMs: 20_000,
    });
  });

  it('laat na de open-tijd één proef door en gaat bij succes weer dicht', async () => {
    const klok = nepKlok();
    const onderbreker = new Stroomonderbreker('test', { drempel: 1, openMs: 30_000, nu: klok.nu });
    await expect(
      onderbreker.voer(() => Promise.reject(new DienstFout('stuk', { dienst: 'test', status: 500 }))),
    ).rejects.toThrow();
    expect(onderbreker.stand).toBe('open');

    klok.verstrijk(30_000);
    expect(onderbreker.stand).toBe('halfopen');

    await expect(onderbreker.voer(async () => 'goed')).resolves.toBe('goed');
    expect(onderbreker.stand).toBe('gesloten');
  });

  it('gaat na een mislukte proef opnieuw open voor de volle tijd', async () => {
    const klok = nepKlok();
    const onderbreker = new Stroomonderbreker('test', { drempel: 1, openMs: 30_000, nu: klok.nu });
    const stuk = () => Promise.reject(new DienstFout('stuk', { dienst: 'test', status: 500 }));

    await expect(onderbreker.voer(stuk)).rejects.toThrow();
    klok.verstrijk(30_000);
    await expect(onderbreker.voer(stuk)).rejects.toThrow('stuk');

    expect(onderbreker.stand).toBe('open');
    klok.verstrijk(29_999);
    expect(onderbreker.stand).toBe('open');
  });

  it('laat maar één proef tegelijk toe', async () => {
    const klok = nepKlok();
    const onderbreker = new Stroomonderbreker('test', { drempel: 1, openMs: 1000, nu: klok.nu });
    await expect(
      onderbreker.voer(() => Promise.reject(new DienstFout('stuk', { dienst: 'test', status: 500 }))),
    ).rejects.toThrow();
    klok.verstrijk(1000);

    let laatLos: (waarde: string) => void = () => {};
    const traag = new Promise<string>((klaar) => {
      laatLos = klaar;
    });

    const proef = onderbreker.voer(() => traag);
    const tweede = onderbreker.voer(async () => 'ook goed');

    await expect(tweede).rejects.toBeInstanceOf(StroomonderbrekerOpenFout);
    laatLos('goed');
    await expect(proef).resolves.toBe('goed');
    expect(onderbreker.stand).toBe('gesloten');
  });

  it('wacht op meer geslaagde proeven als dat is ingesteld', async () => {
    const klok = nepKlok();
    const onderbreker = new Stroomonderbreker('test', { drempel: 1, openMs: 1000, proeven: 2, nu: klok.nu });
    await expect(
      onderbreker.voer(() => Promise.reject(new DienstFout('stuk', { dienst: 'test', status: 500 }))),
    ).rejects.toThrow();
    klok.verstrijk(1000);

    await expect(onderbreker.voer(async () => 'goed')).resolves.toBe('goed');
    expect(onderbreker.stand).toBe('halfopen');

    await expect(onderbreker.voer(async () => 'goed')).resolves.toBe('goed');
    expect(onderbreker.stand).toBe('gesloten');
  });

  it('telt een 404 niet als storing', async () => {
    const onderbreker = new Stroomonderbreker('test', { drempel: 2 });
    const nietGevonden = () => Promise.reject(new DienstFout('niet gevonden', { dienst: 'test', status: 404 }));

    for (let i = 0; i < 10; i++) {
      await expect(onderbreker.voer(nietGevonden)).rejects.toThrow('niet gevonden');
    }
    expect(onderbreker.stand).toBe('gesloten');
  });

  it('zet de teller op nul na een geslaagde aanroep', async () => {
    const onderbreker = new Stroomonderbreker('test', { drempel: 3 });
    const stuk = () => Promise.reject(new DienstFout('stuk', { dienst: 'test', status: 500 }));

    await expect(onderbreker.voer(stuk)).rejects.toThrow();
    await expect(onderbreker.voer(stuk)).rejects.toThrow();
    await expect(onderbreker.voer(async () => 'goed')).resolves.toBe('goed');
    await expect(onderbreker.voer(stuk)).rejects.toThrow();
    await expect(onderbreker.voer(stuk)).rejects.toThrow();

    expect(onderbreker.stand).toBe('gesloten');
  });

  it('houdt bij hoeveel aanroepen zijn overgeslagen', async () => {
    const klok = nepKlok();
    const onderbreker = new Stroomonderbreker('test', { drempel: 1, openMs: 30_000, nu: klok.nu });
    await expect(
      onderbreker.voer(() => Promise.reject(new DienstFout('stuk', { dienst: 'test', status: 500 }))),
    ).rejects.toThrow();

    await expect(onderbreker.voer(async () => 1)).rejects.toThrow();
    await expect(onderbreker.voer(async () => 1)).rejects.toThrow();

    expect(onderbreker.statistiek.overgeslagen).toBe(2);
    expect(onderbreker.statistiek.openSinds).not.toBeNull();
  });
});

describe('stroomonderbreker (register)', () => {
  beforeEach(() => {
    herstelAlleStroomonderbrekers();
  });

  it('geeft dezelfde onderbreker terug voor dezelfde naam', () => {
    expect(stroomonderbreker('spotify')).toBe(stroomonderbreker('spotify'));
    expect(stroomonderbreker('spotify')).not.toBe(stroomonderbreker('telegram'));
  });

  it('zet elke onderbreker in het overzicht', () => {
    stroomonderbreker('spotify');
    stroomonderbreker('telegram');
    const namen = stroomstanden().map((s) => s.dienst);
    expect(namen).toContain('spotify');
    expect(namen).toContain('telegram');
  });
});

describe('beschermd', () => {
  beforeEach(() => {
    herstelAlleStroomonderbrekers();
  });

  it('herkanst binnen de onderbreker, zodat alle pogingen samen één storing zijn', async () => {
    const { slaap } = nepSlaap();
    const stuk = vi.fn().mockRejectedValue(new DienstFout('stuk', { dienst: 'beschermd-een', status: 503 }));

    // Drempel 2: na twee mislukte aanroepen open. Elke aanroep doet drie
    // pogingen, dus zes keer de taak - maar pas bij de tweede aanroep open.
    await expect(beschermd('beschermd-een', stuk, { slaap, onderbreker: { drempel: 2 } })).rejects.toThrow('stuk');
    expect(stuk).toHaveBeenCalledTimes(3);
    expect(stroomonderbreker('beschermd-een').stand).toBe('gesloten');

    await expect(beschermd('beschermd-een', stuk, { slaap })).rejects.toThrow('stuk');
    expect(stuk).toHaveBeenCalledTimes(6);
    expect(stroomonderbreker('beschermd-een').stand).toBe('open');

    await expect(beschermd('beschermd-een', stuk, { slaap })).rejects.toBeInstanceOf(StroomonderbrekerOpenFout);
    expect(stuk).toHaveBeenCalledTimes(6);
  });

  it('doet met pogingen: 1 alleen de onderbreker, zonder te herhalen', async () => {
    const versturen = vi.fn().mockRejectedValue(new DienstFout('stuk', { dienst: 'beschermd-twee', status: 500 }));

    await expect(beschermd('beschermd-twee', versturen, { pogingen: 1, onderbreker: { drempel: 1 } })).rejects.toThrow(
      'stuk',
    );
    expect(versturen).toHaveBeenCalledTimes(1);
    expect(stroomonderbreker('beschermd-twee').stand).toBe('open');
  });
});
