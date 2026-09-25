/**
 * De automatische back-up: versleuteld, alleen voor de server leesbaar, en de
 * kopieën van vóór een terugzetting worden ook opgeruimd.
 *
 * Drie dingen gingen hier mis:
 *
 * - een back-up was een leesbare kopie van de hele database, ook als er een
 *   sleutel voor versleuteling was ingesteld;
 * - copyFileSync nam de modus van de database over: 0644, leesbaar voor elke
 *   gebruiker op de machine;
 * - de kopie die bij elke terugzetting in pre-restore/ komt, werd nooit
 *   opgeruimd.
 *
 * backup.test.ts dekt de gewone werking; dit bestand alleen deze drie.
 */

import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import '../setup';
import testDb from '../testDb';
import logger from '../../utils/logger';

const tijdelijk = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeFs = require('fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeOs = require('os');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodePath = require('path');
  const map = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), 'tutti-backup-versleuteld-'));
  return { map, databasePad: nodePath.join(map, 'harmonie.db') };
});

vi.mock('../../config', async (importOriginal) => {
  const echt = (await importOriginal()) as { default: Record<string, unknown>; config: Record<string, unknown> };
  return {
    ...echt,
    default: { ...echt.default, dbPath: tijdelijk.databasePad },
    config: { ...echt.config, dbPath: tijdelijk.databasePad },
  };
});

import { runBackup, schrijfDatabasekopie } from '../../scheduler/backup';
import { ontsleutelBuffer } from '../../utils/encryption';
import { ontsleutelBackupbestand } from '../../scripts/ontsleutel-backup';

const backupMap = path.join(tijdelijk.map, 'backups');
const preRestoreMap = path.join(backupMap, 'pre-restore');
const DATABASE = 'SQLite format 3\0 met leden en wachtwoordhashes';

const modus = (pad: string) => fs.statSync(pad).mode & 0o777;

function legNeer(map: string, naam: string, dagenOud: number): string {
  fs.mkdirSync(map, { recursive: true });
  const pad = path.join(map, naam);
  fs.writeFileSync(pad, 'oud');
  const moment = new Date(Date.now() - dagenOud * 24 * 60 * 60 * 1000);
  fs.utimesSync(pad, moment, moment);
  return pad;
}

describe('Automatische back-up: versleuteling, rechten en opruimen', () => {
  const oorspronkelijkeOmgeving = { ...process.env };

  beforeEach(() => {
    (testDb as unknown as { flush: unknown }).flush = vi.fn();
    fs.rmSync(tijdelijk.map, { recursive: true, force: true });
    fs.mkdirSync(tijdelijk.map, { recursive: true });
    fs.writeFileSync(tijdelijk.databasePad, DATABASE, { mode: 0o644 });
    process.env.BACKUP_DIR = backupMap;
    delete process.env.ENCRYPTION_SECRET;
    delete process.env.BACKUP_PRE_RESTORE_RETENTION_DAYS;
  });

  afterEach(() => {
    process.env = { ...oorspronkelijkeOmgeving };
  });

  afterAll(() => {
    fs.rmSync(tijdelijk.map, { recursive: true, force: true });
  });

  describe('met een eigen sleutel (ENCRYPTION_SECRET)', () => {
    beforeEach(() => {
      process.env.ENCRYPTION_SECRET = 'sleutel-voor-de-back-up-in-deze-test';
    });

    it('schrijft een versleutelde kopie', () => {
      const { file } = runBackup();

      expect(path.basename(file!)).toMatch(/^tutti-backup-\d{4}-\d{2}-\d{2}-\d{4}\.sqlite\.enc$/);
      const inhoud = fs.readFileSync(file!);
      expect(inhoud.toString('latin1')).not.toContain('wachtwoordhashes');
      expect(inhoud.toString('latin1')).not.toContain('SQLite format 3');
    });

    it('is met dezelfde sleutel weer terug te lezen, ook via het hulpprogramma', () => {
      const { file } = runBackup();

      expect(ontsleutelBuffer(fs.readFileSync(file!)).toString('utf-8')).toBe(DATABASE);

      const leesbaar = ontsleutelBackupbestand(file!);
      expect(leesbaar).toBe(file!.replace(/\.enc$/, ''));
      expect(fs.readFileSync(leesbaar, 'utf-8')).toBe(DATABASE);
      expect(modus(leesbaar)).toBe(0o600);
    });

    it('is met een andere sleutel niet te lezen', () => {
      const { file } = runBackup();
      process.env.ENCRYPTION_SECRET = 'een-andere-sleutel';

      expect(() => ontsleutelBuffer(fs.readFileSync(file!))).toThrow();
    });

    it('ruimt ook oude versleutelde back-ups op', () => {
      const oud = legNeer(backupMap, 'tutti-backup-2020-01-01-0300.sqlite.enc', 20);

      runBackup();

      expect(fs.existsSync(oud)).toBe(false);
    });
  });

  describe('zonder eigen sleutel', () => {
    it('blijft de kopie leesbaar, met een waarschuwing in het logboek', () => {
      // JWT_SECRET staat in de testomgeving wel; die telt hier bewust niet.
      const { file } = runBackup();

      expect(path.basename(file!)).toMatch(/\.sqlite$/);
      expect(fs.readFileSync(file!, 'utf-8')).toBe(DATABASE);
      expect(vi.mocked(logger.warn).mock.calls.some(([melding]) => String(melding).includes('ENCRYPTION_SECRET'))).toBe(
        true,
      );
    });
  });

  describe('bestandsrechten', () => {
    it('schrijft de back-up alleen leesbaar voor de server, ook als de database 0644 is', () => {
      const { file } = runBackup();
      expect(modus(file!)).toBe(0o600);
    });

    it('ook versleuteld', () => {
      process.env.ENCRYPTION_SECRET = 'sleutel-voor-de-back-up-in-deze-test';
      const { file } = runBackup();
      expect(modus(file!)).toBe(0o600);
    });

    it('zet de rechten ook goed als het doelbestand al bestond', () => {
      fs.mkdirSync(backupMap, { recursive: true });
      const bestaand = path.join(backupMap, 'bestaat-al.sqlite');
      fs.writeFileSync(bestaand, 'oud', { mode: 0o644 });

      expect(schrijfDatabasekopie(bestaand, Buffer.from(DATABASE))).toBe(bestaand);
      expect(modus(bestaand)).toBe(0o600);
    });
  });

  describe('kopieën van vóór een terugzetting', () => {
    it('worden opgeruimd na de bewaartermijn (standaard 30 dagen)', () => {
      const oud = legNeer(preRestoreMap, 'pre-restore-2026-01-01T10-00-00.sqlite', 40);
      const oudVersleuteld = legNeer(preRestoreMap, 'pre-restore-2026-01-02T10-00-00.sqlite.enc', 40);
      const recent = legNeer(preRestoreMap, 'pre-restore-2026-09-20T10-00-00.sqlite', 5);

      const { removed } = runBackup();

      expect(fs.existsSync(oud)).toBe(false);
      expect(fs.existsSync(oudVersleuteld)).toBe(false);
      expect(fs.existsSync(recent)).toBe(true);
      expect(removed).toBe(2);
    });

    it('volgen BACKUP_PRE_RESTORE_RETENTION_DAYS', () => {
      const vijfDagen = legNeer(preRestoreMap, 'pre-restore-2026-09-20T10-00-00.sqlite', 5);
      process.env.BACKUP_PRE_RESTORE_RETENTION_DAYS = '2';

      runBackup();

      expect(fs.existsSync(vijfDagen)).toBe(false);
    });

    it('laten andere bestanden in die map staan', () => {
      const handmatig = legNeer(preRestoreMap, 'mijn-eigen-kopie.sqlite', 400);

      runBackup();

      expect(fs.existsSync(handmatig)).toBe(true);
    });
  });
});
