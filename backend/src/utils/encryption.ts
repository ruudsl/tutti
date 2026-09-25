/**
 * Versleuteling van opgeslagen geheimen (AES-256-GCM).
 *
 * Alles wat Tutti versleuteld bewaart - wachtwoorden en tokens van koppelingen,
 * MFA-geheimen, Mollie-sleutels, het Spond-wachtwoord - gaat hierdoorheen.
 *
 * ## Formaat
 *
 * Nieuwe cijfertekst is `v1:<iv>:<tag>:<data>`, alles behalve de versie in hex.
 * De versie zegt met welke sleutel hij is gemaakt. Vervangen van de sleutel
 * wordt daarmee: een `v2` toevoegen aan SLEUTELVERSIES met een nieuw geheim,
 * `v1` leesbaar houden, en de bestaande waarden in een migratie opnieuw
 * versleutelen. Zonder versie valt aan een waarde niet te zien welke sleutel
 * erbij hoort.
 *
 * - `v1`: afgeleid van ENCRYPTION_SECRET. In productie verplicht; buiten
 *   productie valt hij terug op JWT_SECRET, zodat lokaal ontwikkelen en de
 *   tests zonder extra instelling werken.
 *
 * ## Oude cijfertekst
 *
 * Waarden van vóór de versie zijn `<iv>:<tag>:<data>`. Die zijn gemaakt met
 * een van deze sleutels, en blijven daarmee leesbaar:
 *
 * - afgeleid van ENCRYPTION_SECRET, als die toen al was ingesteld;
 * - afgeleid van JWT_SECRET, de standaard zolang ENCRYPTION_SECRET ontbrak;
 * - het Spond-wachtwoord: JWT_SECRET met een eigen vaste salt, uit de tijd dat
 *   services/spond.ts zijn eigen versleuteling had.
 *
 * GCM controleert een authenticatietag, dus proberen welke sleutel past is
 * veilig: een verkeerde sleutel geeft een fout, nooit onzin.
 */

import crypto from 'crypto';
import logger from './logger';
import { MAAK_GEHEIM_MET, waaromVersleutelgeheimOnveilig } from './geheimen';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const KEY_LENGTH = 32;

/** De versie waarmee encrypt() nu versleutelt. */
export const HUIDIGE_SLEUTELVERSIE = 'v1';

/** De vaste salt die services/spond.ts gebruikte voor het Spond-wachtwoord. */
const OUDE_SPOND_SALT = 'spond-encryption-salt';

// Een sleutel afleiden met scrypt kost bewust tijd. De cache is per geheim en
// salt, zodat een gewijzigd geheim een nieuwe sleutel oplevert in plaats van
// stilletjes de vorige te hergebruiken.
const sleutelCache = new Map<string, Buffer>();

function leidSleutelAf(geheim: string, salt: string): Buffer {
  const vingerafdruk = crypto.createHash('sha256').update(`${geheim}:${salt}`).digest('hex');
  let sleutel = sleutelCache.get(vingerafdruk);
  if (!sleutel) {
    sleutel = crypto.scryptSync(geheim, salt, KEY_LENGTH);
    sleutelCache.set(vingerafdruk, sleutel);
  }
  return sleutel;
}

/** ENCRYPTION_SALT als die er is, anders een salt die uit het geheim volgt. */
function saltVoor(geheim: string): string {
  return (
    process.env.ENCRYPTION_SALT ||
    crypto
      .createHash('sha256')
      .update(geheim + '-salt')
      .digest('hex')
      .slice(0, 32)
  );
}

const isProductie = (): boolean => process.env.NODE_ENV === 'production';

/**
 * Het geheim achter sleutelversie v1.
 *
 * In productie alleen ENCRYPTION_SECRET, met dezelfde eisen als config.ts bij
 * de start stelt. Die controle staat hier nog een keer omdat de migraties
 * draaien vóór de server start, zonder config.ts te laden: zonder deze
 * controle zou een migratie de bestaande geheimen versleutelen met een
 * JWT-afgeleide sleutel, en zou de server daarna weigeren te starten.
 */
function geheimVoorV1(): string {
  const eigen = process.env.ENCRYPTION_SECRET || undefined;
  if (isProductie()) {
    const reden = waaromVersleutelgeheimOnveilig(eigen, process.env.JWT_SECRET);
    if (reden || !eigen) {
      throw new Error(
        `${reden}. In productie is een eigen versleutelgeheim verplicht; maak er een met: ${MAAK_GEHEIM_MET}`,
      );
    }
    return eigen;
  }
  const geheim = eigen || process.env.JWT_SECRET;
  if (!geheim) {
    throw new Error('ENCRYPTION_SECRET or JWT_SECRET must be set');
  }
  return geheim;
}

/** Per versie: hoe je de sleutel krijgt. Een versie wordt nooit verwijderd. */
const SLEUTELVERSIES: Record<string, () => Buffer> = {
  v1: () => {
    const geheim = geheimVoorV1();
    return leidSleutelAf(geheim, saltVoor(geheim));
  },
};

/** De sleutel die de code van vóór de versie zou gebruiken in deze omgeving. */
function oudeAlgemeneSleutel(): Buffer {
  const geheim = process.env.ENCRYPTION_SECRET || process.env.JWT_SECRET;
  if (!geheim) {
    throw new Error('ENCRYPTION_SECRET or JWT_SECRET must be set');
  }
  return leidSleutelAf(geheim, saltVoor(geheim));
}

function oudeSpondSleutel(): Buffer {
  const geheim = process.env.JWT_SECRET;
  if (!geheim) {
    throw new Error('JWT_SECRET must be set');
  }
  return leidSleutelAf(geheim, OUDE_SPOND_SALT);
}

/** Alle sleutels waarmee cijfertekst zonder versie gemaakt kan zijn. */
function oudeSleutels(): Buffer[] {
  const sleutels: Buffer[] = [];
  const geheimen = new Set([process.env.ENCRYPTION_SECRET, process.env.JWT_SECRET].filter((g): g is string => !!g));
  for (const geheim of geheimen) {
    sleutels.push(leidSleutelAf(geheim, saltVoor(geheim)));
  }
  if (process.env.JWT_SECRET) {
    sleutels.push(leidSleutelAf(process.env.JWT_SECRET, OUDE_SPOND_SALT));
  }
  return sleutels;
}

function versleutelMet(sleutel: Buffer, plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, sleutel, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

function ontsleutelMet(sleutel: Buffer, iv: string, tag: string, data: string): string {
  const decipher = crypto.createDecipheriv(ALGORITHM, sleutel, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));

  let decrypted = decipher.update(data, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

const HEX_BLOK = /^[0-9a-f]{32}$/i;
const HEX = /^[0-9a-f]*$/i;

/** Zijn dit de drie delen iv, tag en data zoals versleutelMet ze maakt? */
function isCijferdelen(delen: string[]): boolean {
  return delen.length === 3 && HEX_BLOK.test(delen[0]) && HEX_BLOK.test(delen[1]) && HEX.test(delen[2]);
}

export function encrypt(plaintext: string): string {
  const sleutel = SLEUTELVERSIES[HUIDIGE_SLEUTELVERSIE]();
  return `${HUIDIGE_SLEUTELVERSIE}:${versleutelMet(sleutel, plaintext)}`;
}

export function decrypt(ciphertext: string): string {
  const delen = ciphertext.split(':');

  if (delen.length === 4 && Object.hasOwn(SLEUTELVERSIES, delen[0])) {
    const [versie, iv, tag, data] = delen;
    return ontsleutelMet(SLEUTELVERSIES[versie](), iv, tag, data);
  }

  if (delen.length === 3) {
    const sleutels = oudeSleutels();
    if (sleutels.length === 0) {
      throw new Error('ENCRYPTION_SECRET or JWT_SECRET must be set');
    }
    let laatsteFout: unknown;
    for (const sleutel of sleutels) {
      try {
        return ontsleutelMet(sleutel, delen[0], delen[1], delen[2]);
      } catch (fout) {
        laatsteFout = fout;
      }
    }
    throw laatsteFout;
  }

  throw new Error('Invalid encrypted data format');
}

/** Is dit een waarde die encrypt() heeft gemaakt, met of zonder versie? */
export function isEncrypted(value: string): boolean {
  const delen = value.split(':');
  if (delen.length === 4) {
    return Object.hasOwn(SLEUTELVERSIES, delen[0]) && isCijferdelen(delen.slice(1));
  }
  return isCijferdelen(delen);
}

/**
 * Is dit cijfertekst zonder sleutelversie? Die hoort bij een van de oude
 * sleutels en moet opnieuw worden versleuteld; zie de migratie
 * oude_cijfertekst_herversleutelen.
 */
export function heeftOudFormaat(value: string): boolean {
  return isCijferdelen(value.split(':'));
}

/**
 * Versleutel zoals de code van vóór de sleutelversie dat deed. Alleen voor de
 * `down` van de migratie die oude cijfertekst omzet: na het terugdraaien moet
 * de vorige versie van de code haar gegevens weer kunnen lezen.
 *
 * @param soort `spond` voor spond_config.password_encrypted, anders `algemeen`.
 */
export function versleutelInOudFormaat(plaintext: string, soort: 'algemeen' | 'spond'): string {
  const sleutel = soort === 'spond' ? oudeSpondSleutel() : oudeAlgemeneSleutel();
  return versleutelMet(sleutel, plaintext);
}

/**
 * Versleutel een geheim voor opslag in de database. Een lege waarde wordt
 * `null`: "niet ingesteld" is geen geheim.
 */
export function versleutelGeheim(waarde: string | null | undefined): string | null {
  if (!waarde) return null;
  return encrypt(waarde);
}

/**
 * Lees een geheim terug dat met versleutelGeheim is opgeslagen.
 *
 * Een waarde die geen cijfertekst is, is van vóór de versleuteling en komt
 * ongewijzigd terug; de migratie koppelingsgeheimen_versleutelen zet die om,
 * maar tot die gedraaid heeft moet de koppeling blijven werken. Een waarde die
 * wel cijfertekst is maar niet te ontsleutelen - het geheim is vervangen - geeft
 * `null`, met een fout in het logboek: dan is de koppeling niet ingesteld tot
 * een beheerder het geheim opnieuw invoert, in plaats van dat elke aanroep
 * met een 500 stukloopt.
 *
 * @param omschrijving waar het geheim bij hoort, voor het logboek.
 */
export function ontsleutelGeheim(opgeslagen: string | null | undefined, omschrijving = 'geheim'): string | null {
  if (!opgeslagen) return null;
  if (!isEncrypted(opgeslagen)) return opgeslagen;
  try {
    return decrypt(opgeslagen);
  } catch (error) {
    logger.error(`Opgeslagen ${omschrijving} is niet te ontsleutelen; stel het opnieuw in`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export function migrateFromBase64(base64Value: string): string {
  try {
    const plaintext = Buffer.from(base64Value, 'base64').toString('utf-8');
    return encrypt(plaintext);
  } catch {
    return encrypt(base64Value);
  }
}
