/**
 * DNS-rebinding: de verbinding gaat naar het adres dat is gecontroleerd.
 *
 * `controleerUitgaandAdres` zocht een naam op en controleerde de adressen;
 * daarna zocht `fetch` dezelfde naam opnieuw op om te verbinden. Een eigen
 * nameserver met een TTL van nul geeft bij de eerste vraag een openbaar adres
 * en bij de tweede 127.0.0.1 - en dan belde de server alsnog naar binnen.
 *
 * `beschermdeFetch(…, { gebruikersadres: true })` verbindt nu via een eigen
 * `lookup` die opzoekt, controleert, en precies dat adres aan de verbinding
 * geeft. Er wordt niets twee keer opgezocht.
 *
 * Geen netwerk: namen gaan via een nep-opzoeker, en de enige server waar
 * naartoe verbonden wordt draait in dit proces op 127.0.0.1.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import http from 'http';
import zlib from 'zlib';
import type { AddressInfo } from 'net';
import {
  controleerUitgaandAdres,
  fetchNaarGebruikersadres,
  Lookup,
  OnveiligAdresFout,
  stelOpzoekerInVoorTests,
  stelVerbinderInVoorTests,
  veiligeLookup,
  verzoekMetLookup,
} from '../../utils/uitgaandAdres';
import { beschermdeFetch } from '../../utils/veerkracht';

let server: http.Server;
let poort: number;
const ontvangen: Array<{ methode?: string; pad?: string; host?: string; lichaam: string }> = [];

beforeAll(async () => {
  server = http.createServer((verzoek, antwoord) => {
    let lichaam = '';
    verzoek.on('data', (stuk) => (lichaam += stuk));
    verzoek.on('end', () => {
      ontvangen.push({ methode: verzoek.method, pad: verzoek.url, host: verzoek.headers.host, lichaam });
      if (verzoek.url === '/omleiding') {
        antwoord.writeHead(302, { Location: '/intern' }).end();
      } else if (verzoek.url === '/ingepakt') {
        antwoord.writeHead(200, { 'Content-Encoding': 'gzip' }).end(zlib.gzipSync('uitgepakt'));
      } else if (verzoek.url === '/traag') {
        // Geen antwoord: de tijdslimiet moet het afbreken.
      } else {
        antwoord.writeHead(201, { 'Content-Type': 'text/plain', 'X-Proef': 'ja' }).end(`ontvangen: ${lichaam}`);
      }
    });
  });
  await new Promise<void>((klaar) => server.listen(0, '127.0.0.1', klaar));
  poort = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise((klaar) => server.close(klaar));
});

const nepFetch = vi.fn<typeof fetch>();

beforeEach(() => {
  ontvangen.length = 0;
  nepFetch.mockReset();
  vi.stubGlobal('fetch', nepFetch);
  // De echte, vastgepinde verbinding - niet de fetch-omleiding uit setup.ts.
  stelVerbinderInVoorTests(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
  stelVerbinderInVoorTests((url, init) => fetch(url.href, init));
  stelOpzoekerInVoorTests(async () => [{ address: '203.0.113.10' }]);
});

/** Een lookup zoals veiligeLookup die hem geeft, als belofte. */
function zoekOp(lookup: Lookup, naam: string, opties: object | number | undefined) {
  return new Promise<{ adres: unknown; familie?: number }>((klaar, mislukt) =>
    lookup(naam, opties, (fout, adres, familie) => (fout ? mislukt(fout) : klaar({ adres, familie }))),
  );
}

describe('veiligeLookup', () => {
  const opzoeker = async () => [{ address: '93.184.216.34' }, { address: '2606:2800:220:1:248:1893:25c8:1946' }];

  it('geeft alle gecontroleerde adressen als de verbinding om allemaal vraagt', async () => {
    const { adres } = await zoekOp(veiligeLookup(opzoeker), 'hooks.voorbeeld.nl', { all: true });
    expect(adres).toEqual([
      { address: '93.184.216.34', family: 4 },
      { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 },
    ]);
  });

  it('geeft één adres, van de gevraagde familie', async () => {
    expect(await zoekOp(veiligeLookup(opzoeker), 'hooks.voorbeeld.nl', {})).toEqual({
      adres: '93.184.216.34',
      familie: 4,
    });
    expect(await zoekOp(veiligeLookup(opzoeker), 'hooks.voorbeeld.nl', { family: 6 })).toEqual({
      adres: '2606:2800:220:1:248:1893:25c8:1946',
      familie: 6,
    });
  });

  it('weigert als ook maar één adres intern is', async () => {
    const half = async () => [{ address: '93.184.216.34' }, { address: '::ffff:127.0.0.1' }];
    await expect(zoekOp(veiligeLookup(half), 'half.voorbeeld.nl', { all: true })).rejects.toBeInstanceOf(
      OnveiligAdresFout,
    );
  });

  it('zoekt per verbinding precies één keer op', async () => {
    const opzoeken = vi.fn(opzoeker);
    await zoekOp(veiligeLookup(opzoeken), 'hooks.voorbeeld.nl', { all: true });
    expect(opzoeken).toHaveBeenCalledOnce();
  });
});

describe('DNS-rebinding', () => {
  it('belt niet naar binnen als de naam na de controle naar 127.0.0.1 wijst', async () => {
    // Eerste vraag: een openbaar adres. Elke volgende: de machine zelf.
    let vragen = 0;
    stelOpzoekerInVoorTests(async () => [{ address: vragen++ === 0 ? '93.184.216.34' : '127.0.0.1' }]);

    const adres = `http://rebind.voorbeeld.test:${poort}/geheim`;
    const doel = await controleerUitgaandAdres(adres);

    await expect(
      beschermdeFetch(
        `webhook:${doel.host}`,
        doel.href,
        { method: 'POST', body: '{}' },
        { pogingen: 1, gebruikersadres: true },
      ),
    ).rejects.toBeInstanceOf(OnveiligAdresFout);

    expect(vragen).toBe(2);
    expect(nepFetch).not.toHaveBeenCalled();
    expect(ontvangen).toEqual([]);
  });

  it('weigert een intern IP-adres in de URL zelf, waar geen lookup aan te pas komt', async () => {
    for (const adres of [`http://127.0.0.1:${poort}/`, `http://[::ffff:7f00:1]:${poort}/`, `http://[::7f00:1]/`]) {
      await expect(fetchNaarGebruikersadres(adres)).rejects.toBeInstanceOf(OnveiligAdresFout);
    }
    expect(ontvangen).toEqual([]);
  });

  it('weigert een ander protocol en inloggegevens, ook zonder voorafgaande controle', async () => {
    await expect(fetchNaarGebruikersadres('file:///etc/passwd')).rejects.toBeInstanceOf(OnveiligAdresFout);
    await expect(fetchNaarGebruikersadres('https://a:b@hooks.voorbeeld.nl/')).rejects.toBeInstanceOf(OnveiligAdresFout);
  });
});

describe('verzoekMetLookup', () => {
  // Een lookup die een naam die niet bestaat naar de server in dit proces
  // stuurt. Komt het verzoek aan, dan is dit adres gebruikt en niet de DNS.
  const naarDezeServer: Lookup = (_naam, opties, terug) => {
    const alles = typeof opties === 'object' && (opties as { all?: boolean }).all;
    if (alles) terug(null, [{ address: '127.0.0.1', family: 4 }]);
    else terug(null, '127.0.0.1', 4);
  };
  const url = (pad: string) => new URL(`http://webhook.voorbeeld.test:${poort}${pad}`);

  it('verbindt met het adres uit de lookup en geeft een gewone Response terug', async () => {
    const antwoord = await verzoekMetLookup(
      url('/haak'),
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"a":1}' },
      naarDezeServer,
    );

    expect(antwoord).toBeInstanceOf(Response);
    expect(antwoord.status).toBe(201);
    expect(antwoord.ok).toBe(true);
    expect(antwoord.headers.get('x-proef')).toBe('ja');
    expect(await antwoord.text()).toBe('ontvangen: {"a":1}');
    expect(ontvangen).toEqual([
      { methode: 'POST', pad: '/haak', host: `webhook.voorbeeld.test:${poort}`, lichaam: '{"a":1}' },
    ]);
  });

  it('volgt geen omleiding', async () => {
    const antwoord = await verzoekMetLookup(url('/omleiding'), {}, naarDezeServer);

    expect(antwoord.status).toBe(302);
    expect(antwoord.headers.get('location')).toBe('/intern');
    expect(ontvangen.map((v) => v.pad)).toEqual(['/omleiding']);
  });

  it('pakt een ingepakt antwoord uit, zoals fetch', async () => {
    const antwoord = await verzoekMetLookup(url('/ingepakt'), {}, naarDezeServer);
    expect(await antwoord.text()).toBe('uitgepakt');
  });

  it('breekt af op het signaal, met de reden van het signaal', async () => {
    await expect(
      verzoekMetLookup(url('/traag'), { signal: AbortSignal.timeout(50) }, naarDezeServer),
    ).rejects.toMatchObject({ name: 'TimeoutError' });
  });
});
