import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 32;
const KEY_LENGTH = 32;

// Cache the derived key to avoid repeated key derivation
let cachedKey: Buffer | null = null;
let cachedSalt: string | null = null;

function getEncryptionKey(): Buffer {
  const secret = process.env.ENCRYPTION_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('ENCRYPTION_SECRET or JWT_SECRET must be set');
  }

  // Use configurable salt from environment, fallback to derived salt from secret
  const salt = process.env.ENCRYPTION_SALT || crypto.createHash('sha256').update(secret + '-salt').digest('hex').slice(0, 32);

  // Return cached key if secret and salt haven't changed
  if (cachedKey && cachedSalt === salt) {
    return cachedKey;
  }

  cachedKey = crypto.scryptSync(secret, salt, KEY_LENGTH);
  cachedSalt = salt;
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
