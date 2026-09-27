/**
 * Mag de server dit adres aanroepen?
 *
 * Voor adressen die een gebruiker zelf opgeeft - een webhook, een koppeling -
 * is dat niet vanzelfsprekend. Zonder controle laat iemand de server
 * `http://127.0.0.1:3001/…` of het metadata-adres van de hostingomgeving
 * (`169.254.169.254`) aanroepen, en krijgt hij soms het antwoord ook nog terug.
 * Dat heet SSRF: de server als doorgeefluik naar een netwerk waar de aanvrager
 * zelf niet bij kan.
 *
 * De controle kijkt niet naar de naam maar naar waar die naam heen wijst: elk
 * IP-adres dat de DNS teruggeeft moet buiten de eigen en speciale bereiken
 * liggen. Een naam als `intern.voorbeeld.nl` die naar 10.0.0.5 wijst, valt dus
 * ook af.
 *
 * Twee lagen:
 *
 * - `controleerUitgaandAdres` kijkt vooraf, en geeft een melding die de
 *   gebruiker iets zegt.
 * - `fetchNaarGebruikersadres` (via `beschermdeFetch(…, { gebruikersadres:
 *   true })`) controleert opnieuw op het moment van verbinden, en verbindt
 *   met precies het adres dat daarbij is gecontroleerd. Zonder die tweede laag
 *   kon een eigen nameserver bij de controle een openbaar adres geven en bij
 *   de verbinding, een paar milliseconden later, 127.0.0.1 (DNS-rebinding).
 *   Omleidingen volgt hij nooit, anders stuurt een toegestane host de server
 *   alsnog naar binnen.
 */

import dns from 'dns/promises';
import http from 'http';
import https from 'https';
import net from 'net';
import { Readable, pipeline } from 'stream';
import { domainToASCII } from 'url';
import zlib from 'zlib';

/** Bereiken waar de server nooit op verzoek van een gebruiker heen belt. */
const VERBODEN = new net.BlockList();

const IPV4: Array<[string, number]> = [
  ['0.0.0.0', 8], // "dit netwerk"
  ['10.0.0.0', 8], // privé
  ['100.64.0.0', 10], // gedeeld (carrier-grade NAT)
  ['127.0.0.0', 8], // de machine zelf
  ['169.254.0.0', 16], // link-local, waaronder metadata van cloudomgevingen
  ['172.16.0.0', 12], // privé - ook het Docker-netwerk
  ['192.0.0.0', 24], // IETF-protocoltoewijzingen
  ['192.168.0.0', 16], // privé
  ['198.18.0.0', 15], // netwerkmetingen
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // gereserveerd, inclusief 255.255.255.255
];

/**
 * IPv6-bereiken. Een paar daarvan dragen een IPv4-adres in zich en komen via
 * een vertaler of tunnel bij dat IPv4-adres uit - ook als dat 127.0.0.1 is.
 * Die gaan hier in hun geheel dicht: ze zijn vervallen of alleen voor
 * netwerkbeheer, en geen webhook heeft ze nodig. IPv4-mapped (::ffff:a.b.c.d)
 * is gewoon IPv4 en wordt als IPv4 gecontroleerd; zie `ingebedIpv4`.
 */
const IPV6: Array<[string, number]> = [
  // ::/96: niet opgegeven (::), de machine zelf (::1) en IPv4-compatibel
  // (::a.b.c.d, vervallen sinds RFC 4291).
  ['::', 96],
  ['64:ff9b::', 96], // NAT64, well-known prefix: vertaalt naar een IPv4-adres
  ['64:ff9b:1::', 48], // NAT64 voor lokaal gebruik (RFC 8215)
  ['2001::', 32], // Teredo: tunnel met een IPv4-adres erin
  ['2002::', 16], // 6to4: het IPv4-adres staat in bit 16-48
  ['fc00::', 7], // unique local
  ['fe80::', 10], // link-local
  ['fec0::', 10], // site-local, vervallen maar niet overal uitgezet
  ['ff00::', 8], // multicast
];

for (const [adres, prefix] of IPV4) VERBODEN.addSubnet(adres, prefix, 'ipv4');
for (const [adres, prefix] of IPV6) VERBODEN.addSubnet(adres, prefix, 'ipv6');

export class OnveiligAdresFout extends Error {
  constructor(boodschap: string) {
    super(boodschap);
    this.name = 'OnveiligAdresFout';
  }
}

const MELDING_INTERN = 'Dit adres wijst naar een eigen of lokaal netwerk; daar belt de server niet heen.';

/** Een geldig IPv6-adres als acht groepen van 16 bits. */
function ipv6Groepen(adres: string): number[] {
  let tekst = adres.toLowerCase();
  // Een IPv4-adres aan het eind (::ffff:10.0.0.1) als twee groepen schrijven.
  const v4 = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(tekst);
  if (v4) {
    const [a, b, c, d] = v4.slice(1).map(Number);
    tekst = `${tekst.slice(0, v4.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [kop, staart] = tekst.split('::');
  const voor = kop ? kop.split(':') : [];
  const na = staart ? staart.split(':') : [];
  const nullen = staart === undefined ? [] : Array<string>(8 - voor.length - na.length).fill('0');
  return [...voor, ...nullen, ...na].map((groep) => parseInt(groep, 16));
}

/**
 * Het IPv4-adres in een IPv6-adres dat gewoon IPv4 ís.
 *
 * `::ffff:10.0.0.1` (IPv4-mapped) en `::ffff:0:10.0.0.1` (IPv4-translated)
 * gaan over het IPv4-netwerk naar 10.0.0.1. De URL-ontleder schrijft ze om
 * naar hex (`::ffff:a00:1`), dus op de tekst afgaan is niet genoeg.
 */
function ingebedIpv4(adres: string): string | null {
  const g = ipv6Groepen(adres);
  const nul = (van: number, tot: number) => g.slice(van, tot).every((groep) => groep === 0);
  const mapped = nul(0, 5) && g[5] === 0xffff;
  const translated = nul(0, 4) && g[4] === 0xffff && g[5] === 0;
  if (!mapped && !translated) return null;
  return [g[6] >> 8, g[6] & 0xff, g[7] >> 8, g[7] & 0xff].join('.');
}

/** Ligt dit IP-adres in een eigen of speciaal bereik? */
export function isVerbodenIp(adres: string): boolean {
  if (net.isIPv4(adres)) return VERBODEN.check(adres, 'ipv4');
  if (net.isIPv6(adres)) {
    // Een zone (fe80::1%eth0) zegt welke netwerkkaart; voor het bereik telt hij niet.
    const zonderZone = adres.replace(/%.*$/, '');
    const v4 = ingebedIpv4(zonderZone);
    if (v4) return VERBODEN.check(v4, 'ipv4');
    return VERBODEN.check(zonderZone, 'ipv6');
  }
  // Geen IP-adres: dan weten we niet waar het heen gaat.
  return true;
}

export type Opzoeker = (naam: string) => Promise<Array<{ address: string }>>;

const dnsOpzoeker: Opzoeker = (naam) => dns.lookup(naam, { all: true, verbatim: true });

let standaardOpzoeker: Opzoeker = dnsOpzoeker;

/**
 * Alleen voor tests: waar namen heen wijzen. Tests gaan niet het netwerk op,
 * ook niet voor DNS; `null` zet de echte opzoeker terug.
 */
export function stelOpzoekerInVoorTests(opzoeker: Opzoeker | null): void {
  standaardOpzoeker = opzoeker ?? dnsOpzoeker;
}

/** Protocol en inloggegevens: wat zonder DNS al te zeggen is. */
function leesAdres(ruw: string): URL {
  let url: URL;
  try {
    url = new URL(ruw);
  } catch {
    throw new OnveiligAdresFout('Dit is geen geldig adres.');
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new OnveiligAdresFout('Alleen http- en https-adressen zijn toegestaan.');
  }
  if (url.username || url.password) {
    throw new OnveiligAdresFout('Een adres met inloggegevens erin is niet toegestaan.');
  }
  return url;
}

/** De host uit een URL, zonder de haken om een IPv6-adres. */
const hostVan = (url: URL): string => url.hostname.replace(/^\[|\]$/g, '');

/**
 * Zoek een naam op en controleer elk adres. Eén verboden adres is genoeg om te
 * weigeren: welke de verbinding zou kiezen, bepalen wij niet.
 */
async function zoekVeiligOp(host: string, opzoeken: Opzoeker): Promise<string[]> {
  let adressen: string[];
  if (net.isIP(host)) {
    adressen = [host];
  } else {
    try {
      adressen = (await opzoeken(host)).map((a) => a.address);
    } catch {
      throw new OnveiligAdresFout(`De naam ${host} is niet te vinden.`);
    }
  }

  if (adressen.length === 0 || adressen.some(isVerbodenIp)) {
    throw new OnveiligAdresFout(MELDING_INTERN);
  }
  return adressen;
}

/**
 * Controleer een adres van een gebruiker voordat de server het aanroept.
 *
 * @returns het adres als URL, zodat de aanroeper precies aanroept wat hier is
 *   gecontroleerd.
 * @throws OnveiligAdresFout met een melding die de gebruiker iets zegt.
 */
export async function controleerUitgaandAdres(ruw: string, opzoeken?: Opzoeker): Promise<URL> {
  const url = leesAdres(ruw);
  await zoekVeiligOp(hostVan(url), opzoeken ?? standaardOpzoeker);
  return url;
}

/** Een gecontroleerde host voor een verbinding die niet over HTTP gaat. */
export interface GecontroleerdeHost {
  /** Het IP-adres dat is gecontroleerd; verbind met precies dit adres. */
  adres: string;
  /**
   * De naam voor TLS (SNI en certificaatcontrole), in ASCII-vorm. Ontbreekt
   * als de host zelf al een IP-adres is: daar hoort geen servername bij.
   */
  servername?: string;
}

/**
 * Controleer een losse host (zonder URL eromheen), zoals een SMTP-server die
 * een beheerder van een vereniging heeft ingesteld.
 *
 * Geeft het gecontroleerde IP-adres terug, zodat de aanroeper daarmee
 * verbindt en niet met de naam. Een client die de naam zelf nog eens opzoekt
 * (nodemailer doet dat) kan anders een ander antwoord krijgen dan bij de
 * controle: DNS-rebinding, net als bij `gebruikersadres: true` voor HTTP.
 *
 * @throws OnveiligAdresFout als de host geen geldige hostnaam is of naar een
 *   eigen of speciaal adres wijst.
 */
export async function controleerUitgaandeHost(ruw: string, opzoeken?: Opzoeker): Promise<GecontroleerdeHost> {
  const host = ruw.trim().toLowerCase();
  const url = leesAdres(`https://${net.isIPv6(host) ? `[${host}]` : host}/`);

  // Een host met `/`, `@` of `:` erin leest als URL anders dan als hostnaam:
  // dan is iets anders gecontroleerd dan wat de client zou aanroepen. Een naam
  // met bijzondere letters staat in de URL in zijn ASCII-vorm.
  const gecontroleerd = hostVan(url);
  const verwacht = net.isIP(host) ? host : domainToASCII(host);
  if (!verwacht || gecontroleerd !== verwacht) {
    throw new OnveiligAdresFout('Dit is geen geldige hostnaam.');
  }

  const [adres] = await zoekVeiligOp(gecontroleerd, opzoeken ?? standaardOpzoeker);
  return net.isIP(gecontroleerd) ? { adres } : { adres, servername: gecontroleerd };
}

type LookupTerugroep = (
  fout: NodeJS.ErrnoException | null,
  adres: string | Array<{ address: string; family: number }>,
  familie?: number,
) => void;

export type Lookup = (naam: string, opties: object | number | undefined, terug: LookupTerugroep) => void;

/**
 * Een `lookup` voor `http.request`: zoekt de naam op, controleert elk adres,
 * en geeft alleen gecontroleerde adressen aan de verbinding.
 *
 * Omdat de verbinding het adres van hier krijgt en niet zelf nog eens opzoekt,
 * is wat gecontroleerd is ook waar naartoe verbonden wordt.
 *
 * @param opzoeken standaard de opzoeker van deze module (in tests: een nep).
 */
export function veiligeLookup(opzoeken?: Opzoeker): Lookup {
  return (naam, opties, terug) => {
    const o = (typeof opties === 'object' && opties !== null ? opties : {}) as { all?: boolean; family?: unknown };
    const gevraagd = typeof opties === 'number' ? opties : o.family;
    const familie = gevraagd === 4 || gevraagd === 'IPv4' ? 4 : gevraagd === 6 || gevraagd === 'IPv6' ? 6 : 0;

    zoekVeiligOp(naam, opzoeken ?? standaardOpzoeker).then(
      (adressen) => {
        const passend = adressen
          .map((address) => ({ address, family: net.isIPv6(address) ? 6 : 4 }))
          .filter((a) => familie === 0 || a.family === familie);
        if (passend.length === 0) {
          terug(Object.assign(new Error(`Geen IPv${familie}-adres voor ${naam}`), { code: 'ENOTFOUND' }), '');
        } else if (o.all) {
          terug(null, passend);
        } else {
          terug(null, passend[0].address, passend[0].family);
        }
      },
      (fout: Error) => terug(fout, ''),
    );
  };
}

/** Het lichaam van een verzoek als iets dat `http.request` kan schrijven. */
function lichaamVan(body: RequestInit['body'], koppen: Headers): string | Uint8Array | undefined {
  if (body === undefined || body === null) return undefined;
  if (typeof body === 'string') return body;
  if (body instanceof URLSearchParams) {
    if (!koppen.has('content-type')) koppen.set('content-type', 'application/x-www-form-urlencoded;charset=UTF-8');
    return body.toString();
  }
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  if (ArrayBuffer.isView(body)) return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  throw new TypeError('Dit soort verzoeklichaam wordt voor een gebruikersadres niet ondersteund.');
}

/** Een ingepakt antwoord uitpakken, zoals fetch dat ook doet. */
function uitgepakt(antwoord: http.IncomingMessage): Readable {
  const codering = String(antwoord.headers['content-encoding'] ?? '').toLowerCase();
  const uitpakker =
    codering === 'gzip' || codering === 'x-gzip'
      ? zlib.createGunzip()
      : codering === 'deflate'
        ? zlib.createInflate()
        : codering === 'br'
          ? zlib.createBrotliDecompress()
          : null;
  if (!uitpakker) return antwoord;
  return pipeline(antwoord, uitpakker, () => {});
}

/**
 * Een HTTP-verzoek met een eigen `lookup`, met een `Response` als antwoord.
 *
 * `fetch` van Node laat zich geen eigen `lookup` geven; `http.request` wel. Dit
 * is het deel van fetch dat de aanroepers van `beschermdeFetch` gebruiken:
 * methode, koppen, een tekst- of bytelichaam, een AbortSignal en een
 * `Response` terug. Omleidingen worden nooit gevolgd.
 */
export function verzoekMetLookup(url: URL, init: RequestInit, lookup: Lookup): Promise<Response> {
  const koppen = new Headers(init.headers);
  const lichaam = lichaamVan(init.body, koppen);
  if (lichaam !== undefined && !koppen.has('content-length')) {
    koppen.set('content-length', String(Buffer.byteLength(lichaam)));
  }
  const methode = (init.method ?? 'GET').toUpperCase();
  const signal = init.signal ?? undefined;
  const module = url.protocol === 'https:' ? https : http;

  return new Promise((klaar, mislukt) => {
    if (signal?.aborted) {
      mislukt(signal.reason);
      return;
    }

    const verzoek = module.request(
      url,
      {
        method: methode,
        headers: Object.fromEntries(koppen),
        lookup: lookup as unknown as net.LookupFunction,
        // Een eigen verbinding: een verbinding uit een gedeelde pool kan met
        // een ander, niet hier gecontroleerd adres zijn opgezet.
        agent: false,
        signal,
      },
      (antwoord) => {
        const status = antwoord.statusCode ?? 0;
        const antwoordKoppen = new Headers();
        for (let i = 0; i < antwoord.rawHeaders.length; i += 2) {
          try {
            antwoordKoppen.append(antwoord.rawHeaders[i], antwoord.rawHeaders[i + 1]);
          } catch {
            // Een kop die Headers niet accepteert: laten vallen, net als fetch.
          }
        }
        const zonderLichaam = methode === 'HEAD' || status === 204 || status === 205 || status === 304;
        if (zonderLichaam) antwoord.resume();
        const stroom = zonderLichaam ? null : (Readable.toWeb(uitgepakt(antwoord)) as ReadableStream<Uint8Array>);
        try {
          klaar(new Response(stroom, { status, statusText: antwoord.statusMessage, headers: antwoordKoppen }));
        } catch (fout) {
          antwoord.destroy();
          mislukt(fout);
        }
      },
    );

    // Bij een afgebroken verzoek de reden van het signaal, zoals fetch: een
    // TimeoutError telt dan als "de dienst was te traag".
    verzoek.on('error', (fout) => mislukt(signal?.aborted ? signal.reason : fout));
    if (lichaam !== undefined) verzoek.write(lichaam);
    verzoek.end();
  });
}

/** Hoe een verzoek naar een gebruikersadres de deur uit gaat. Alleen tests vervangen dit. */
export type Verbinder = (url: URL, init: RequestInit) => Promise<Response>;

const vastgepind: Verbinder = (url, init) => verzoekMetLookup(url, init, veiligeLookup());

let verbinder: Verbinder = vastgepind;

/**
 * Alleen voor tests: hoe een verzoek naar een gebruikersadres de deur uit
 * gaat. `setup.ts` laat het door `fetch` gaan, zodat tests die `fetch`
 * vervangen blijven werken; `null` zet de vastgepinde verbinding terug.
 */
export function stelVerbinderInVoorTests(nieuw: Verbinder | null): void {
  verbinder = nieuw ?? vastgepind;
}

/**
 * `fetch` voor een adres dat een gebruiker heeft opgegeven.
 *
 * Controleert protocol, inloggegevens en een IP-adres in de URL zelf, en
 * verbindt daarna via `veiligeLookup`: de naam wordt opgezocht en
 * gecontroleerd op het moment van verbinden, en de verbinding gaat naar dat
 * gecontroleerde adres. Omleidingen worden nooit gevolgd.
 *
 * Gebruik hem via `beschermdeFetch(…, { gebruikersadres: true })`, dan zit er
 * ook een tijdslimiet en een stroomonderbreker omheen.
 *
 * @throws OnveiligAdresFout als het adres niet mag.
 */
export async function fetchNaarGebruikersadres(adres: string | URL, init: RequestInit = {}): Promise<Response> {
  const url = leesAdres(String(adres));
  const host = hostVan(url);
  // Bij een IP-adres zoekt http.request niets op, en komt de lookup dus niet
  // aan de beurt: dan hier controleren.
  if (net.isIP(host) && isVerbodenIp(host)) {
    throw new OnveiligAdresFout(MELDING_INTERN);
  }
  return verbinder(url, { ...init, redirect: 'manual' });
}
