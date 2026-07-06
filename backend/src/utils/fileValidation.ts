/**
 * Central magic-byte validation for uploaded files.
 *
 * Multer's fileFilter only sees the client-supplied mimetype/filename, which
 * is trivially spoofable. Because our multer configs use disk storage, the
 * real content check happens AFTER the file is stored: read the first bytes
 * from disk, and on a mismatch delete the file and throw FileValidationError.
 */

import fs from 'fs';
import { FileValidationError } from './errors';

/** Enough bytes for every signature we check (SQLite header is 16 bytes). */
const HEADER_LENGTH = 16;

/** Read the first bytes of a file without loading the whole file in memory. */
export async function readFileHeader(filePath: string, length = HEADER_LENGTH): Promise<Buffer> {
  const handle = await fs.promises.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

/** PDF: "%PDF-" */
export function isPdf(buffer: Buffer): boolean {
  return buffer.length >= 5 && buffer.subarray(0, 5).toString('latin1') === '%PDF-';
}

/** Image: JPEG, PNG, WebP or GIF magic bytes. */
export function isImage(buffer: Buffer): boolean {
  if (buffer.length < 12) return false;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return true;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return true;

  // GIF: "GIF87a" / "GIF89a"
  const gifHeader = buffer.subarray(0, 6).toString('latin1');
  if (gifHeader === 'GIF87a' || gifHeader === 'GIF89a') return true;

  // WebP: "RIFF"...."WEBP"
  if (buffer.subarray(0, 4).toString('latin1') === 'RIFF' && buffer.subarray(8, 12).toString('latin1') === 'WEBP')
    return true;

  return false;
}

/** Audio: MP3 (ID3 tag or MPEG frame sync), WAV, M4A/MP4, OGG or WebM. */
export function isAudio(buffer: Buffer): boolean {
  if (buffer.length < 12) return false;

  // MP3 with ID3v2 tag: "ID3"
  if (buffer.subarray(0, 3).toString('latin1') === 'ID3') return true;

  // Raw MPEG audio frame sync: FF Ex / FF Fx (covers 0xFFFB etc.)
  if (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) return true;

  // WAV: "RIFF"...."WAVE"
  if (buffer.subarray(0, 4).toString('latin1') === 'RIFF' && buffer.subarray(8, 12).toString('latin1') === 'WAVE')
    return true;

  // M4A/MP4 container: "ftyp" at offset 4
  if (buffer.subarray(4, 8).toString('latin1') === 'ftyp') return true;

  // OGG: "OggS"
  if (buffer.subarray(0, 4).toString('latin1') === 'OggS') return true;

  // WebM/Matroska (browser recordings, audio/webm): EBML header 1A 45 DF A3
  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) return true;

  return false;
}

/** SQLite database: "SQLite format 3\0" */
export function isSqlite(buffer: Buffer): boolean {
  return buffer.length >= 16 && buffer.subarray(0, 16).equals(Buffer.from('SQLite format 3\0', 'latin1'));
}

/**
 * Validate a file that multer already stored on disk by checking its magic
 * bytes. On mismatch (or unreadable file) the file is deleted and a
 * FileValidationError is thrown, which the central error handler maps to 400.
 */
export async function validateUploadedFile(
  filePath: string,
  validator: (buffer: Buffer) => boolean,
  errorMessage: string,
): Promise<void> {
  let header: Buffer | null;
  try {
    header = await readFileHeader(filePath);
  } catch {
    header = null;
  }

  if (!header || !validator(header)) {
    await fs.promises.unlink(filePath).catch(() => {});
    throw new FileValidationError(errorMessage);
  }
}
