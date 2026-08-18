/**
 * Unit tests for the magic-byte validation of uploaded files.
 *
 * These signatures are the only real defence against a spoofed mimetype, so
 * every accepted format gets a positive case and every validator gets a
 * negative case with content that lies about what it is.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import '../setup';
import { readFileHeader, isPdf, isImage, isAudio, isSqlite, validateUploadedFile } from '../../utils/fileValidation';
import { FileValidationError } from '../../utils/errors';

let tmpDir: string;

/** Write a buffer to a throwaway file and return its path. */
function writeTempFile(name: string, contents: Buffer): string {
  const filePath = path.join(tmpDir, name);
  fs.writeFileSync(filePath, contents);
  return filePath;
}

const PDF_HEADER = Buffer.from('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n', 'latin1');
const JPEG_HEADER = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(12)]);
const PNG_HEADER = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(8)]);
const GIF87_HEADER = Buffer.concat([Buffer.from('GIF87a', 'latin1'), Buffer.alloc(8)]);
const GIF89_HEADER = Buffer.concat([Buffer.from('GIF89a', 'latin1'), Buffer.alloc(8)]);
const WEBP_HEADER = Buffer.concat([
  Buffer.from('RIFF', 'latin1'),
  Buffer.from([0x00, 0x00, 0x00, 0x00]),
  Buffer.from('WEBP', 'latin1'),
]);
const ID3_HEADER = Buffer.concat([Buffer.from('ID3', 'latin1'), Buffer.alloc(12)]);
const MPEG_FRAME_HEADER = Buffer.concat([Buffer.from([0xff, 0xfb]), Buffer.alloc(12)]);
const WAV_HEADER = Buffer.concat([
  Buffer.from('RIFF', 'latin1'),
  Buffer.from([0x00, 0x00, 0x00, 0x00]),
  Buffer.from('WAVE', 'latin1'),
]);
const M4A_HEADER = Buffer.concat([Buffer.alloc(4), Buffer.from('ftyp', 'latin1'), Buffer.alloc(8)]);
const OGG_HEADER = Buffer.concat([Buffer.from('OggS', 'latin1'), Buffer.alloc(12)]);
const WEBM_HEADER = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(12)]);
const SQLITE_HEADER = Buffer.concat([Buffer.from('SQLite format 3\0', 'latin1'), Buffer.alloc(8)]);

describe('fileValidation', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tutti-filevalidation-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('readFileHeader', () => {
    it('reads at most the requested number of bytes', async () => {
      const filePath = writeTempFile('big.bin', Buffer.alloc(64, 0x41));

      const header = await readFileHeader(filePath, 8);

      expect(header).toHaveLength(8);
      expect(header.toString('latin1')).toBe('AAAAAAAA');
    });

    it('defaults to a 16-byte header', async () => {
      const filePath = writeTempFile('default.bin', Buffer.alloc(64, 0x42));

      const header = await readFileHeader(filePath);

      expect(header).toHaveLength(16);
    });

    it('returns only the bytes that exist for a short file', async () => {
      const filePath = writeTempFile('short.bin', Buffer.from('abc', 'latin1'));

      const header = await readFileHeader(filePath);

      expect(header).toHaveLength(3);
      expect(header.toString('latin1')).toBe('abc');
    });

    it('returns an empty buffer for an empty file', async () => {
      const filePath = writeTempFile('empty.bin', Buffer.alloc(0));

      const header = await readFileHeader(filePath);

      expect(header).toHaveLength(0);
    });

    it('rejects when the file does not exist', async () => {
      await expect(readFileHeader(path.join(tmpDir, 'missing.bin'))).rejects.toThrow();
    });
  });

  describe('isPdf', () => {
    it('accepts a PDF header', () => {
      expect(isPdf(PDF_HEADER)).toBe(true);
    });

    it('rejects a buffer that is too short to hold the signature', () => {
      expect(isPdf(Buffer.from('%PDF', 'latin1'))).toBe(false);
    });

    it('rejects content that only mentions PDF later in the file', () => {
      expect(isPdf(Buffer.from('<html>%PDF-1.7</html>', 'latin1'))).toBe(false);
    });

    it('rejects an image posing as a PDF', () => {
      expect(isPdf(PNG_HEADER)).toBe(false);
    });
  });

  describe('isImage', () => {
    it.each([
      ['JPEG', JPEG_HEADER],
      ['PNG', PNG_HEADER],
      ['GIF87a', GIF87_HEADER],
      ['GIF89a', GIF89_HEADER],
      ['WebP', WEBP_HEADER],
    ])('accepts a %s header', (_name, header) => {
      expect(isImage(header)).toBe(true);
    });

    it('rejects a buffer shorter than 12 bytes', () => {
      expect(isImage(Buffer.from([0xff, 0xd8, 0xff]))).toBe(false);
    });

    it('rejects RIFF containers that are not WebP', () => {
      expect(isImage(WAV_HEADER)).toBe(false);
    });

    it('rejects a PDF renamed to .png', () => {
      expect(isImage(PDF_HEADER)).toBe(false);
    });

    it('rejects an almost-correct PNG signature', () => {
      const nearlyPng = Buffer.from(PNG_HEADER);
      nearlyPng[7] = 0x00;
      expect(isImage(nearlyPng)).toBe(false);
    });
  });

  describe('isAudio', () => {
    it.each([
      ['MP3 with ID3 tag', ID3_HEADER],
      ['raw MPEG frame', MPEG_FRAME_HEADER],
      ['WAV', WAV_HEADER],
      ['M4A/MP4', M4A_HEADER],
      ['OGG', OGG_HEADER],
      ['WebM', WEBM_HEADER],
    ])('accepts %s', (_name, header) => {
      expect(isAudio(header)).toBe(true);
    });

    it('rejects a buffer shorter than 12 bytes', () => {
      expect(isAudio(Buffer.from('ID3', 'latin1'))).toBe(false);
    });

    it('rejects RIFF containers that are not WAVE', () => {
      expect(isAudio(WEBP_HEADER)).toBe(false);
    });

    it('rejects a PDF renamed to .mp3', () => {
      expect(isAudio(PDF_HEADER)).toBe(false);
    });
  });

  describe('isSqlite', () => {
    it('accepts a SQLite database header', () => {
      expect(isSqlite(SQLITE_HEADER)).toBe(true);
    });

    it('rejects a truncated header', () => {
      expect(isSqlite(Buffer.from('SQLite format', 'latin1'))).toBe(false);
    });

    it('rejects a header without the trailing NUL byte', () => {
      expect(isSqlite(Buffer.from('SQLite format 3X', 'latin1'))).toBe(false);
    });
  });

  describe('validateUploadedFile', () => {
    it('accepts a file whose content matches the validator', async () => {
      const filePath = writeTempFile('real.pdf', PDF_HEADER);

      await expect(validateUploadedFile(filePath, isPdf, 'not a pdf')).resolves.toBeUndefined();
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('deletes the file and throws when the content lies about its type', async () => {
      const filePath = writeTempFile('fake.pdf', Buffer.from('<script>alert(1)</script>', 'latin1'));

      await expect(validateUploadedFile(filePath, isPdf, 'not a pdf')).rejects.toBeInstanceOf(FileValidationError);
      expect(fs.existsSync(filePath)).toBe(false);
    });

    it('uses the supplied error message', async () => {
      const filePath = writeTempFile('fake.png', PDF_HEADER);

      await expect(validateUploadedFile(filePath, isImage, 'Alleen afbeeldingen toegestaan')).rejects.toThrow(
        'Alleen afbeeldingen toegestaan',
      );
    });

    it('throws when the file cannot be read at all', async () => {
      const missing = path.join(tmpDir, 'gone.pdf');

      await expect(validateUploadedFile(missing, isPdf, 'not a pdf')).rejects.toBeInstanceOf(FileValidationError);
    });

    it('rejects an empty file', async () => {
      const filePath = writeTempFile('empty.pdf', Buffer.alloc(0));

      await expect(validateUploadedFile(filePath, isPdf, 'not a pdf')).rejects.toBeInstanceOf(FileValidationError);
      expect(fs.existsSync(filePath)).toBe(false);
    });
  });
});
