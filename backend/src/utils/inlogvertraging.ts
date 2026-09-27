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
 * De standen staan in de tabel `inlogvertragingen`, zodat een herstart ze
 * niet terugzet. Als sleutel staat daar een HMAC-SHA256 van de sleutel
 * hieronder, met een sleutel afgeleid van het servergeheim: geen leesbaar
 * e-mailadres of IP-adres. Standen zonder nieuwe mislukking ruimt de
 * achtergrondtaak 'inlogvertraging-opruimen' op (taken/index.ts).
 */

import crypto from 'crypto';
import { ipKeyGenerator } from 'express-rate-limit';
import config from '../config';
import db from '../database/connection';

/** Zoveel mislukkingen zijn vrij; vanaf de volgende geldt een wachttijd. */
export const VRIJE_POGINGEN = 5;
const BASIS_WACHTTIJD_MS = 60 * 1000;
/** Nooit langer dan dit: daarna kan de echte gebruiker het weer proberen. */
export const MAX_WACHTTIJD_MS = 15 * 60 * 1000;
/** Zonder nieuwe mislukking wordt een stand na een dag vergeten. */
export const VERGEET_NA_MS = 24 * 60 * 60 * 1000;
/** Bovengrens zodat de tabel tussen twee opruimrondes niet onbeperkt kan groeien. */
const MAX_STANDEN = 50_000;

interface Stand {
  mislukt: number;
  wachten_tot: number;
  laatste: number;
}

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

/** Wat er in de tabel staat in plaats van de sleutel zelf. */
function sleutelHash(sleutel: string): string {
  const geheim = crypto.createHmac('sha256', config.jwtSecret).update('tutti:inlogvertraging').digest();
  return crypto.createHmac('sha256', geheim).update(sleutel).digest('hex');
}

function actueleStand(hash: string, nu: number): Stand | undefined {
  const stand = db
    .prepare('SELECT mislukt, wachten_tot, laatste FROM inlogvertragingen WHERE sleutel_hash = ?')
    .get(hash) as Stand | undefined;
  if (stand && nu - Number(stand.laatste) > VERGEET_NA_MS) {
    db.prepare('DELETE FROM inlogvertragingen WHERE sleutel_hash = ?').run(hash);
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
  const stand = actueleStand(sleutelHash(sleutel), nu);
  return stand ? Math.max(0, Number(stand.wachten_tot) - nu) : 0;
}

/**
 * Houd de tabel onder MAX_STANDEN. Eerst wat afgelopen en al even stil is,
 * dan de oudste.
 */
function snoei(nu: number): void {
  const { aantal } = db.prepare('SELECT COUNT(*) AS aantal FROM inlogvertragingen').get() as { aantal: number };
  if (aantal < MAX_STANDEN) return;
  db.prepare('DELETE FROM inlogvertragingen WHERE wachten_tot <= ? AND laatste < ?').run(nu, nu - BASIS_WACHTTIJD_MS);
  const { over } = db.prepare('SELECT COUNT(*) AS over FROM inlogvertragingen').get() as { over: number };
  if (over >= MAX_STANDEN) {
    db.prepare(
      `DELETE FROM inlogvertragingen WHERE sleutel_hash IN (
         SELECT sleutel_hash FROM inlogvertragingen ORDER BY laatste ASC LIMIT ?
       )`,
    ).run(over - MAX_STANDEN + 1);
  }
}

/** Tel een mislukking en geef het nieuwe aantal en de wachttijd die daarbij hoort. */
export function registreerMislukking(
  sleutel: string,
  nu: number = Date.now(),
): { mislukt: number; wachttijdMs: number } {
  const hash = sleutelHash(sleutel);
  const vorige = actueleStand(hash, nu);
  if (!vorige) snoei(nu);
  const mislukt = Number(vorige?.mislukt ?? 0) + 1;
  const wachttijdMs = wachttijdNaMislukkingen(mislukt);
  db.prepare(
    'INSERT OR REPLACE INTO inlogvertragingen (sleutel_hash, mislukt, wachten_tot, laatste) VALUES (?, ?, ?, ?)',
  ).run(hash, mislukt, nu + wachttijdMs, nu);
  return { mislukt, wachttijdMs };
}

/** Na een geslaagde inlog begint de teller opnieuw. */
export function wisMislukkingen(sleutel: string): void {
  db.prepare('DELETE FROM inlogvertragingen WHERE sleutel_hash = ?').run(sleutelHash(sleutel));
}

/**
 * Vergeet de standen zonder nieuwe mislukking in de afgelopen dag. Voor de
 * achtergrondtaak 'inlogvertraging-opruimen'.
 *
 * @returns het aantal verwijderde standen.
 */
export function ruimInlogvertragingenOp(nu: number = Date.now()): number {
  return db.prepare('DELETE FROM inlogvertragingen WHERE laatste < ?').run(nu - VERGEET_NA_MS).changes;
}

/** Alleen voor tests: elke test begint zonder opgebouwde wachttijd. */
export function wisAlleInlogvertragingen(): void {
  db.prepare('DELETE FROM inlogvertragingen').run();
}
