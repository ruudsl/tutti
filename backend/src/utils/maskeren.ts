/**
 * Geheimen en e-mailadressen uit logregels en foutmeldingen houden.
 *
 * Eén plek, gedeeld door de twee loggers (utils/logger.ts en
 * logging/logger.ts), de foutafhandeling (middleware/errorHandler.ts) en de
 * `beforeSend` van Sentry (monitoring/sentry.ts). Elk van die vier had een
 * eigen lijstje met veldnamen, en alleen de foutafhandeling keek dieper dan
 * het bovenste niveau. `{ spond: { password } }` of een Authorization-kop in
 * de config van een meegegeven fout kwam daardoor gewoon in het logboek of
 * bij Sentry terecht.
 */

/**
 * Een sleutel waarvan de inhoud nooit wordt doorgegeven: alles met pass,
 * secret, token, key, iban, authorization of cookie in de naam, ongeacht
 * hoofdletters. Liever een veld te veel verbergen (`passengers`, `keyboard`)
 * dan een geheim doorlaten dat net anders heet dan in een vaste lijst.
 */
const GEHEIM_SLEUTELPATROON = /pass|secret|token|key|iban|authorization|cookie/i;

/**
 * Sleutels die niet onder het patroon vallen maar wel een eenmalige code
 * bevatten. Exact, zonder hoofdlettergevoeligheid.
 */
const GEHEIME_VELDEN = new Set(['mfacode', 'recoverycode']);

/** Sleutels die nooit worden overgenomen: ze raken het prototype van objecten. */
const GEVAARLIJKE_SLEUTELS = new Set(['__proto__', 'constructor', 'prototype']);

/** Hoe diep er in een object wordt gekeken. Wat dieper zit wordt niet doorgegeven. */
export const MAX_DIEPTE = 8;

export const WEGGELATEN = '[weggelaten]';
export const TE_DIEP = '[te diep]';

/** Is dit een sleutel waarvan de waarde verborgen moet worden? */
export function isGeheimeSleutel(sleutel: string): boolean {
  return GEHEIM_SLEUTELPATROON.test(sleutel) || GEHEIME_VELDEN.has(sleutel.toLowerCase());
}

/**
 * Loop recursief door `waarde` en roep `blad` aan op elke waarde die geen
 * object of lijst is. Geheime sleutels worden onderweg vervangen, gevaarlijke
 * sleutels overgeslagen, en een Error wordt een gewoon object met naam,
 * melding en stack - plus zijn eigen velden, want daar zit bij een HTTP-fout
 * vaak de complete aanvraag in, kopregels en al.
 */
function loop(waarde: unknown, diepte: number, blad: (w: unknown) => unknown, gezien: WeakSet<object>): unknown {
  if (waarde === null || typeof waarde !== 'object') return blad(waarde);
  if (diepte > MAX_DIEPTE) return TE_DIEP;
  if (gezien.has(waarde)) return '[kringverwijzing]';
  if (waarde instanceof Date || Buffer.isBuffer(waarde)) return waarde;

  gezien.add(waarde);
  try {
    if (Array.isArray(waarde)) {
      return waarde.map((item) => loop(item, diepte + 1, blad, gezien));
    }

    // De sleutels komen rechtstreeks van buiten. Object.fromEntries maakt van
    // elke sleutel een gewone eigen eigenschap - ook van `__proto__` - in
    // plaats van via een toewijzing het prototype of een ingebouwde methode
    // te verzetten; gevaarlijke sleutels gaan er bovendien helemaal niet in.
    // Het resultaat heeft geen prototype, zodat er ook later niets van
    // Object.prototype door een sleutel uit de aanvraag wordt overschaduwd.
    const paren: [string, unknown][] = [];

    if (waarde instanceof Error) {
      paren.push(['name', waarde.name], ['message', blad(waarde.message)], ['stack', blad(waarde.stack)]);
    }

    for (const [sleutel, item] of Object.entries(waarde as Record<string, unknown>)) {
      if (GEVAARLIJKE_SLEUTELS.has(sleutel)) continue;
      paren.push([sleutel, isGeheimeSleutel(sleutel) ? WEGGELATEN : loop(item, diepte + 1, blad, gezien)]);
    }
    return Object.setPrototypeOf(Object.fromEntries(paren), null) as Record<string, unknown>;
  } finally {
    gezien.delete(waarde);
  }
}

/**
 * Vervang de inhoud van gevoelige velden door een markering, ook in geneste
 * objecten en lijsten. E-mailadressen blijven hier staan; zie
 * `maskeerVoorLog` voor wat er in een logregel mag.
 */
export function maskeerGeheimen(waarde: unknown): unknown {
  return loop(waarde, 0, (w) => w, new WeakSet());
}

/** Iets dat op een e-mailadres lijkt, ook midden in een zin. */
const EMAILPATROON = /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;

/**
 * `ruud@example.org` wordt `r***@example.org`. Het domein blijft staan: dat
 * zegt bij het zoeken in een logboek genoeg (welke vereniging, welke
 * provider) zonder dat het een persoon aanwijst.
 */
export function maskeerEmail(tekst: string): string {
  return tekst.replace(EMAILPATROON, '$1***@$2');
}

/**
 * Wat er in een logregel mag: geen geheimen, en e-mailadressen afgekort. Werkt
 * op elke waarde; tekst wordt alleen op e-mailadressen nagekeken.
 */
export function maskeerVoorLog(waarde: unknown): unknown {
  return loop(waarde, 0, (w) => (typeof w === 'string' ? maskeerEmail(w) : w), new WeakSet());
}
