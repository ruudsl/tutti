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
 * Wat hij níet afvangt: een DNS-server van de aanvrager die tussen deze
 * controle en de verbinding een ander antwoord geeft. Dat venster is klein en
 * vraagt een eigen nameserver; wie het dicht wil, controleert op het moment
 * van verbinden (een eigen `lookup` in de HTTP-agent). Omleidingen staan bij
 * de aanroepers uit, anders stuurt een toegestane host de server alsnog naar
 * binnen.
 */

import dns from 'dns/promises';
import net from 'net';

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

const IPV6: Array<[string, number]> = [
  ['::', 128], // niet opgegeven
  ['::1', 128], // de machine zelf
  ['64:ff9b::', 96], // NAT64: kan naar een intern IPv4-adres vertalen
  ['fc00::', 7], // unique local
  ['fe80::', 10], // link-local
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

/** `::ffff:10.0.0.1` is gewoon 10.0.0.1, en moet ook zo gecontroleerd worden. */
function alsIpv4(adres: string): string | null {
  const gemapt = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(adres);
  if (gemapt) return gemapt[1];
  return net.isIPv4(adres) ? adres : null;
}

/** Ligt dit IP-adres in een eigen of speciaal bereik? */
export function isVerbodenIp(adres: string): boolean {
  const v4 = alsIpv4(adres);
  if (v4) return VERBODEN.check(v4, 'ipv4');
  if (net.isIPv6(adres)) return VERBODEN.check(adres, 'ipv6');
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

/**
 * Controleer een adres van een gebruiker voordat de server het aanroept.
 *
 * @returns het adres als URL, zodat de aanroeper precies aanroept wat hier is
 *   gecontroleerd.
 * @throws OnveiligAdresFout met een melding die de gebruiker iets zegt.
 */
export async function controleerUitgaandAdres(ruw: string, opzoeken?: Opzoeker): Promise<URL> {
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

  const host = url.hostname.replace(/^\[|\]$/g, '');
  let adressen: string[];
  if (net.isIP(host)) {
    adressen = [host];
  } else {
    try {
      adressen = (await (opzoeken ?? standaardOpzoeker)(host)).map((a) => a.address);
    } catch {
      throw new OnveiligAdresFout(`De naam ${host} is niet te vinden.`);
    }
  }

  if (adressen.length === 0 || adressen.some(isVerbodenIp)) {
    throw new OnveiligAdresFout('Dit adres wijst naar een eigen of lokaal netwerk; daar belt de server niet heen.');
  }

  return url;
}
