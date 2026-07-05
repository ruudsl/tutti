/**
 * MFA helpers: encrypted storage of TOTP secrets and one-time recovery codes.
 *
 * - The TOTP secret is stored AES-256-GCM encrypted (utils/encryption). When no
 *   encryption key is configured the secret is stored as plaintext with a
 *   warning, so existing installations keep working. Legacy plaintext secrets
 *   are transparently accepted and re-encrypted on the next successful MFA login.
 * - Recovery codes are stored as SHA-256 hashes and compared constant-time.
 */

import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import { encrypt, decrypt, isEncrypted } from './encryption';
import logger from './logger';

// Charset without easily confused characters (no 0/O, 1/I/L)
const RECOVERY_CODE_CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const RECOVERY_CODE_GROUPS = 3;
const RECOVERY_CODE_GROUP_LENGTH = 4;
export const RECOVERY_CODE_COUNT = 10;

function encryptionKeyConfigured(): boolean {
  return Boolean(process.env.ENCRYPTION_SECRET || process.env.JWT_SECRET);
}

/**
 * Encrypt an MFA secret for storage. Degrades gracefully to plaintext (with a
 * warning) when no encryption key is configured or encryption fails, so
 * existing installations without ENCRYPTION_SECRET/JWT_SECRET don't break.
 */
export function protectMfaSecret(secret: string): string {
  if (!encryptionKeyConfigured()) {
    logger.warn('No ENCRYPTION_SECRET or JWT_SECRET configured; storing MFA secret as plaintext');
    return secret;
  }
  try {
    return encrypt(secret);
  } catch (error) {
    logger.warn('Failed to encrypt MFA secret; storing as plaintext', {
      error: error instanceof Error ? error.message : String(error),
    });
    return secret;
  }
}

/**
 * Recover the plaintext MFA secret from its stored form. Legacy plaintext
 * values (or values that fail to decrypt) are returned as-is with
 * wasPlaintext=true so callers can re-encrypt them at the next opportunity.
 */
export function revealMfaSecret(stored: string): { secret: string; wasPlaintext: boolean } {
  if (isEncrypted(stored) && encryptionKeyConfigured()) {
    try {
      return { secret: decrypt(stored), wasPlaintext: false };
    } catch (error) {
      logger.warn('Failed to decrypt MFA secret; treating stored value as plaintext', {
        error: error instanceof Error ? error.message : String(error),
      });
      return { secret: stored, wasPlaintext: true };
    }
  }
  return { secret: stored, wasPlaintext: true };
}

/**
 * Generate a single recovery code in the format XXXX-XXXX-XXXX using
 * crypto.randomBytes with rejection sampling (no modulo bias).
 */
export function generateRecoveryCode(): string {
  const totalChars = RECOVERY_CODE_GROUPS * RECOVERY_CODE_GROUP_LENGTH;
  // Largest multiple of the charset size that fits in a byte; bytes at or
  // above this limit are rejected to keep the distribution uniform.
  const limit = 256 - (256 % RECOVERY_CODE_CHARSET.length);
  const chars: string[] = [];

  while (chars.length < totalChars) {
    const bytes = crypto.randomBytes(totalChars);
    for (const byte of bytes) {
      if (byte < limit && chars.length < totalChars) {
        chars.push(RECOVERY_CODE_CHARSET[byte % RECOVERY_CODE_CHARSET.length]);
      }
    }
  }

  const groups: string[] = [];
  for (let i = 0; i < RECOVERY_CODE_GROUPS; i++) {
    groups.push(chars.slice(i * RECOVERY_CODE_GROUP_LENGTH, (i + 1) * RECOVERY_CODE_GROUP_LENGTH).join(''));
  }
  return groups.join('-');
}

/**
 * Hash a recovery code for storage/lookup. Input is normalized (uppercased,
 * separators stripped) so users can enter codes with or without dashes.
 */
export function hashRecoveryCode(code: string): string {
  const normalized = String(code)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Replace all recovery codes for a user with a fresh set and return the
 * plaintext codes. The plaintext is only available at this moment; the
 * database stores SHA-256 hashes.
 */
export function issueRecoveryCodes(userId: string): string[] {
  const codes: string[] = [];
  const now = new Date().toISOString();

  db.prepare('DELETE FROM mfa_recovery_codes WHERE user_id = ?').run(userId);

  const insert = db.prepare('INSERT INTO mfa_recovery_codes (id, user_id, code_hash, created_at) VALUES (?, ?, ?, ?)');
  for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
    const code = generateRecoveryCode();
    codes.push(code);
    insert.run(uuidv4(), userId, hashRecoveryCode(code), now);
  }

  return codes;
}

/**
 * Delete all recovery codes for a user (used when MFA is disabled).
 */
export function deleteRecoveryCodes(userId: string): void {
  db.prepare('DELETE FROM mfa_recovery_codes WHERE user_id = ?').run(userId);
}

/**
 * Try to consume an unused recovery code. Hashes are compared constant-time;
 * every stored candidate is compared so timing doesn't reveal which (if any)
 * code matched. Returns true when a code matched and was marked as used.
 */
export function consumeRecoveryCode(userId: string, code: string): boolean {
  const candidate = Buffer.from(hashRecoveryCode(code), 'hex');

  const rows = db
    .prepare('SELECT id, code_hash FROM mfa_recovery_codes WHERE user_id = ? AND used_at IS NULL')
    .all(userId) as Array<{ id: string; code_hash: string }>;

  let matchedId: string | null = null;
  for (const row of rows) {
    const stored = Buffer.from(row.code_hash, 'hex');
    if (stored.length === candidate.length && crypto.timingSafeEqual(stored, candidate) && matchedId === null) {
      matchedId = row.id;
    }
  }

  if (!matchedId) {
    return false;
  }

  db.prepare('UPDATE mfa_recovery_codes SET used_at = ? WHERE id = ?').run(new Date().toISOString(), matchedId);
  return true;
}
