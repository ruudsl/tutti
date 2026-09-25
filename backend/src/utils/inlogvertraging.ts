/**
 * Oplopende wachttijd na mislukte inlogpogingen.
 *
 * Dit vervangt de harde vergrendeling per account (users.locked_until). Die
 * had twee gebreken. Iedereen die een adres kende kon het account van een
 * ander - ook van een beheerder - op slot zetten door een paar keer een
 * verkeerd wachtwoord te proberen, en het slot gaf een ander antwoord voor
 * een bestaand adres dan voor een onbekend adres.
 *
 * Hier telt een mislukking per combinatie van e-mailadres en IP-adres. Wie
 * vanaf een ander adres inlogt, merkt niets van de pogingen van een derde, en
 * de wachttijd verloopt vanzelf: na hooguit een kwartier is een geslaagde
 * inlog weer mogelijk, zonder dat een beheerder iets hoeft te doen. De sleutel
 * hangt aan het opgegeven e-mailadres en niet aan een gebruiker, zodat een
 * onbekend adres precies hetzelfde behandeld wordt als een bekend.
 *
 * Voor de tweede stap (MFA) is er daarnaast een teller per account: die is
 * alleen te bereiken met het juiste wachtwoord, dus alleen wie dat al heeft
 * kan hem laten oplopen, en een aanvaller met veel IP-adressen kan de zes
 * cijfers niet ongeremd raden.
 *
 * De standen staan in het geheugen van het proces, net als die van de
 * snelheidsbegrenzer per IP-adres. Een herstart zet ze terug; dat kost een
 * aanvaller hooguit een handvol extra pogingen, want de begrenzer per IP-adres
 * blijft daarnaast gelden.
 */

import { ipKeyGenerator } from 'express-rate-limit';

/** Zoveel mislukkingen zijn vrij; vanaf de volgende geldt een wachttijd. */
export const VRIJE_POGINGEN = 5;
const BASIS_WACHTTIJD_MS = 60 * 1000;
/** Nooit langer dan dit: daarna kan de echte gebruiker het weer proberen. */
export const MAX_WACHTTIJD_MS = 15 * 60 * 1000;
/** Zonder nieuwe mislukking wordt een stand na een dag vergeten. */
const VERGEET_NA_MS = 24 * 60 * 60 * 1000;
/** Bovengrens zodat de map niet onbeperkt kan groeien. */
const MAX_STANDEN = 50_000;

interface Stand {
  mislukt: number;
  wachtenTot: number;
  laatste: number;
}

const standen = new Map<string, Stand>();

/** Sleutel voor de wachtwoordstap: het opgegeven adres plus het IP-adres. */
export function inlogSleutel(email: string, ip: string | undefined): string {
  const adres = String(email ?? '')
    .trim()
    .toLowerCase();
  // Zelfde normalisatie als de begrenzer per IP: een IPv6-blok telt als één.
  const herkomst = ip ? ipKeyGenerator(ip) : 'onbekend';
  return `inlog|${adres}|${herkomst}`;
}

/** Sleutel voor de tweede stap: per account, los van het IP-adres. */
export function mfaSleutel(userId: string): string {
  return `mfa|${userId}`;
}

function actueleStand(sleutel: string, nu: number): Stand | undefined {
  const stand = standen.get(sleutel);
  if (stand && nu - stand.laatste > VERGEET_NA_MS) {
    standen.delete(sleutel);
    return undefined;
  }
  return stand;
}

/** Wachttijd na `mislukt` mislukkingen: 0, en vanaf de vijfde 1, 2, 4, ... tot 15 minuten. */
export function wachttijdNaMislukkingen(mislukt: number): number {
  if (mislukt < VRIJE_POGINGEN) return 0;
  return Math.min(BASIS_WACHTTIJD_MS * 2 ** (mislukt - VRIJE_POGINGEN), MAX_WACHTTIJD_MS);
}

/** Hoeveel milliseconden er voor deze sleutel nog gewacht moet worden (0: geen). */
export function resterendeWachttijd(sleutel: string, nu: number = Date.now()): number {
  const stand = actueleStand(sleutel, nu);
  return stand ? Math.max(0, stand.wachtenTot - nu) : 0;
}

function snoei(nu: number): void {
  if (standen.size < MAX_STANDEN) return;
  for (const [sleutel, stand] of standen) {
    if (stand.wachtenTot <= nu && nu - stand.laatste > BASIS_WACHTTIJD_MS) {
      standen.delete(sleutel);
    }
  }
  // Nog steeds vol: de oudste eerst (een Map houdt de invoegvolgorde aan).
  for (const sleutel of standen.keys()) {
    if (standen.size < MAX_STANDEN) break;
    standen.delete(sleutel);
  }
}

/** Tel een mislukking en geef het nieuwe aantal en de wachttijd die daarbij hoort. */
export function registreerMislukking(
  sleutel: string,
  nu: number = Date.now(),
): { mislukt: number; wachttijdMs: number } {
  const vorige = actueleStand(sleutel, nu);
  if (!vorige) snoei(nu);
  const mislukt = (vorige?.mislukt ?? 0) + 1;
  const wachttijdMs = wachttijdNaMislukkingen(mislukt);
  // Opnieuw invoegen zet de sleutel achteraan, zodat snoeien de oudste pakt.
  standen.delete(sleutel);
  standen.set(sleutel, { mislukt, wachtenTot: nu + wachttijdMs, laatste: nu });
  return { mislukt, wachttijdMs };
}

/** Na een geslaagde inlog begint de teller opnieuw. */
export function wisMislukkingen(sleutel: string): void {
  standen.delete(sleutel);
}

/** Alleen voor tests: elke test begint zonder opgebouwde wachttijd. */
export function wisAlleInlogvertragingen(): void {
  standen.clear();
}
