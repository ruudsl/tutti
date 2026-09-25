import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 32;
const KEY_LENGTH = 32;

// Cache the derived key to avoid repeated key derivation. The cache is keyed
// on a fingerprint of secret+salt so a rotated secret derives a fresh key
// instead of silently reusing the previous one.
let cachedKey: Buffer | null = null;
let cachedFingerprint: string | null = null;

function getEncryptionKey(): Buffer {
  const secret = process.env.ENCRYPTION_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('ENCRYPTION_SECRET or JWT_SECRET must be set');
  }

  // Use configurable salt from environment, fallback to derived salt from secret
  const salt =
    process.env.ENCRYPTION_SALT ||
    crypto
      .createHash('sha256')
      .update(secret + '-salt')
      .digest('hex')
      .slice(0, 32);

  // Return cached key if secret and salt haven't changed
  const fingerprint = crypto.createHash('sha256').update(`${secret}:${salt}`).digest('hex');
  if (cachedKey && cachedFingerprint === fingerprint) {
    return cachedKey;
  }

  cachedKey = crypto.scryptSync(secret, salt, KEY_LENGTH);
  cachedFingerprint = fingerprint;
  return cachedKey;
}

export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decrypt(ciphertext: string): string {
  const key = getEncryptionKey();
  const parts = ciphertext.split(':');

  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

export function isEncrypted(value: string): boolean {
  const parts = value.split(':');
  return parts.length === 3 && parts[0].length === IV_LENGTH * 2;
}

export function migrateFromBase64(base64Value: string): string {
  try {
    const plaintext = Buffer.from(base64Value, 'base64').toString('utf-8');
    return encrypt(plaintext);
  } catch {
    return encrypt(base64Value);
  }
}

/**
 * Kop van een versleuteld bestand (reservekopie van de database). Zo is een
 * versleuteld bestand te herkennen en niet te verwarren met een SQLite-bestand,
 * dat met "SQLite format 3" begint.
 */
const BESTANDSKOP = Buffer.from('TUTTI-ENC1');
const TAG_LENGTH = 16;

/**
 * Is er een eigen sleutel voor versleuteling ingesteld?
 *
 * `encrypt` valt terug op JWT_SECRET. Voor een reservekopie is dat te
 * kwetsbaar: wie het JWT-geheim vervangt - een gewone veiligheidsmaatregel -
 * kan daarna geen enkele oude reservekopie meer openen. Bestanden worden
 * daarom alleen versleuteld als ENCRYPTION_SECRET er zelf staat.
 */
export function heeftEigenSleutel(): boolean {
  return Boolean(process.env.ENCRYPTION_SECRET);
}

/** Versleutel een bestand (AES-256-GCM, zelfde sleutel als `encrypt`). */
export function versleutelBuffer(inhoud: Buffer): Buffer {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const versleuteld = Buffer.concat([cipher.update(inhoud), cipher.final()]);
  return Buffer.concat([BESTANDSKOP, iv, cipher.getAuthTag(), versleuteld]);
}

/** Is dit een met `versleutelBuffer` versleuteld bestand? */
export function isVersleuteldBestand(inhoud: Buffer): boolean {
  return inhoud.length >= BESTANDSKOP.length && inhoud.subarray(0, BESTANDSKOP.length).equals(BESTANDSKOP);
}

/**
 * Ontsleutel een bestand van `versleutelBuffer`. Gooit bij een verkeerde
 * sleutel of een aangepast bestand: GCM controleert beide.
 */
export function ontsleutelBuffer(inhoud: Buffer): Buffer {
  if (!isVersleuteldBestand(inhoud)) {
    throw new Error('Geen versleuteld Tutti-bestand');
  }
  const key = getEncryptionKey();
  const ivStart = BESTANDSKOP.length;
  const tagStart = ivStart + IV_LENGTH;
  const dataStart = tagStart + TAG_LENGTH;
  const decipher = crypto.createDecipheriv(ALGORITHM, key, inhoud.subarray(ivStart, tagStart));
  decipher.setAuthTag(inhoud.subarray(tagStart, dataStart));
  return Buffer.concat([decipher.update(inhoud.subarray(dataStart)), decipher.final()]);
}
