/**
 * Controle op geheimen uit de omgeving: JWT_SECRET en ENCRYPTION_SECRET.
 *
 * Staat los van config.ts, zodat ook code die config niet laadt - de
 * migratie-CLI via utils/encryption.ts - dezelfde eisen kan stellen zonder de
 * hele omgevingscontrole mee te nemen.
 */

/**
 * Geheimen die in de voorbeeldbestanden of de documentatie staan of stonden.
 * Wie `.env.example` kopieert en vergeet het geheim te vervangen, gebruikt een
 * sleutel die openbaar op GitHub staat.
 */
const VOORBEELDGEHEIMEN = new Set([
  'harmonie-dev-secret-change-in-production',
  'your-very-secure-secret-key-change-this',
  'your-secret-key-change-in-production',
  'your-secure-random-string',
]);

/**
 * Een willekeurig geheim van 32 tekens of meer bevat vrijwel altijd tientallen
 * verschillende tekens. Minder dan dit wijst op iets als `'a'.repeat(32)` of
 * `abcabcabc…`: lang genoeg voor de lengte-eis, maar te raden.
 */
const MINIMAAL_VERSCHILLENDE_TEKENS = 10;

export const MINIMALE_GEHEIMLENGTE = 32;

/**
 * Waarom dit geheim in productie niet deugt, of `null` als het deugt.
 *
 * Dit is geen sterktemeter; het vangt de gevallen die in de praktijk
 * voorkomen: een voorbeeldwaarde die niet is vervangen, en een eentonige
 * opvulling die alleen aan de lengte-eis voldoet.
 *
 * @param naam de naam van de omgevingsvariabele, voor de melding.
 */
export function waaromGeheimOnveilig(naam: string, geheim: string | undefined): string | null {
  if (!geheim) {
    return `${naam} ontbreekt`;
  }
  if (geheim.length < MINIMALE_GEHEIMLENGTE) {
    return `${naam} is korter dan ${MINIMALE_GEHEIMLENGTE} tekens`;
  }
  if (VOORBEELDGEHEIMEN.has(geheim) || /change-?(this|me|in-production)/i.test(geheim)) {
    return `${naam} is de voorbeeldwaarde uit .env.example of de documentatie`;
  }
  if (new Set(geheim).size < MINIMAAL_VERSCHILLENDE_TEKENS) {
    return `${naam} bestaat uit minder dan ${MINIMAAL_VERSCHILLENDE_TEKENS} verschillende tekens en is te raden`;
  }
  return null;
}

/**
 * Waarom ENCRYPTION_SECRET in productie niet deugt, of `null` als het deugt.
 *
 * Bovenop de gewone eisen: niet gelijk aan JWT_SECRET. Het hele punt van een
 * eigen versleutelingsgeheim is dat wie het JWT-geheim moet vervangen - na een
 * lek, of omdat het hostingplatform een nieuw genereert - niet ook alle
 * opgeslagen wachtwoorden en tokens onleesbaar maakt, en andersom.
 */
export function waaromVersleutelgeheimOnveilig(
  geheim: string | undefined,
  jwtGeheim: string | undefined,
): string | null {
  const reden = waaromGeheimOnveilig('ENCRYPTION_SECRET', geheim);
  if (reden) return reden;
  if (jwtGeheim && geheim === jwtGeheim) {
    return 'ENCRYPTION_SECRET is gelijk aan JWT_SECRET';
  }
  return null;
}

export const MAAK_GEHEIM_MET = 'openssl rand -base64 48';
