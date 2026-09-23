/**
 * Wanneer de vier vaste achtergrondtaken draaien, nu ze via de wachtrij lopen.
 *
 * Het werk zelf (meldingen versturen, mail opnieuw doorsturen, AVG-opschonen,
 * back-up) heeft eigen tests onder __tests__/scheduler. Hier is het vervangen
 * door nepfuncties: wat hier vastligt is alleen het ritme, en dat een taak die
 * zijn werk niet deed ook als mislukt in de wachtrij staat.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '../setup';
import db from '../../database/connection';

const werk = vi.hoisted(() => ({
  meldingen: vi.fn(async () => {}),
  doorsturen: vi.fn(async () => {}),
  opschonen: vi.fn(async () => []),
  backUp: vi.fn((): { file: string | null; removed: number } => ({ file: '/tmp/kopie.sqlite', removed: 0 })),
}));

vi.mock('../../scheduler/seating-notifications', () => ({ runNotificationRound: werk.meldingen }));
vi.mock('../../scheduler/email-forwarding-retry', () => ({ processPendingTasks: werk.doorsturen }));
vi.mock('../../scheduler/gdpr-cleanup', () => ({
  runCleanup: werk.opschonen,
  opschoonUur: () => parseInt(process.env.GDPR_CLEANUP_HOUR || '') || 3,
}));
vi.mock('../../scheduler/backup', () => ({
  runBackup: werk.backUp,
  isBackupEnabled: () => process.env.BACKUP_ENABLED !== 'false',
  getIntervalHours: () => 24,
}));

import { registreerStandaardTaken, tijdvak } from '../../taken';
import { verwerkWachtrij, wisRegistratiesVoorTests } from '../../taken/wachtrij';

/** Een moment op 23 september om `uur` uur lokale tijd. */
const om = (uur: number, minuut = 0) => new Date(2026, 8, 23, uur, minuut, 0);
const klok = (moment: Date) => () => moment;

const taken = (soort: string) =>
  db.prepare('SELECT status, laatste_fout FROM achtergrondtaken WHERE soort = ?').all(soort) as {
    status: string;
    laatste_fout: string | null;
  }[];

describe('de vaste achtergrondtaken', () => {
  const vorigeOmgeving = { ...process.env };

  beforeEach(() => {
    wisRegistratiesVoorTests();
    for (const f of Object.values(werk)) f.mockClear();
    process.env.GDPR_CLEANUP_HOUR = '3';
    delete process.env.BACKUP_ENABLED;
  });

  afterEach(() => {
    process.env = { ...vorigeOmgeving };
  });

  it('verdeelt de tijd in vakken van de gevraagde lengte', () => {
    const perMinuut = tijdvak('x', 60_000);
    expect(perMinuut(om(10, 0))).toBe(perMinuut(new Date(om(10, 0).getTime() + 59_999)));
    expect(perMinuut(om(10, 0))).not.toBe(perMinuut(om(10, 1)));
  });

  describe('de opstellingsmeldingen', () => {
    it('draaien één keer per minuut', async () => {
      registreerStandaardTaken();
      await verwerkWachtrij({ nu: klok(om(10, 0)) });
      await verwerkWachtrij({ nu: klok(new Date(om(10, 0).getTime() + 30_000)) });
      expect(werk.meldingen).toHaveBeenCalledTimes(1);

      await verwerkWachtrij({ nu: klok(om(10, 1)) });
      expect(werk.meldingen).toHaveBeenCalledTimes(2);
    });

    it('worden na een fout niet binnen dezelfde minuut opnieuw verstuurd', async () => {
      werk.meldingen.mockRejectedValueOnce(new Error('Twilio plat'));
      registreerStandaardTaken();

      await verwerkWachtrij({ nu: klok(om(10, 0)) });
      await verwerkWachtrij({ nu: klok(new Date(om(10, 0).getTime() + 45_000)) });

      expect(werk.meldingen).toHaveBeenCalledTimes(1);
      expect(taken('opstelling-meldingen')[0]).toEqual({ status: 'mislukt', laatste_fout: 'Twilio plat' });
    });
  });

  describe('het opnieuw doorsturen van mail', () => {
    it('draait één keer per twee minuten', async () => {
      registreerStandaardTaken();
      // Een even minuut: 10:00 en 10:01 vallen in hetzelfde vak van twee minuten.
      await verwerkWachtrij({ nu: klok(om(10, 0)) });
      await verwerkWachtrij({ nu: klok(om(10, 1)) });
      expect(werk.doorsturen).toHaveBeenCalledTimes(1);

      await verwerkWachtrij({ nu: klok(om(10, 2)) });
      expect(werk.doorsturen).toHaveBeenCalledTimes(2);
    });
  });

  describe('de AVG-opschoning', () => {
    it('draait niet buiten het ingestelde uur', async () => {
      registreerStandaardTaken();
      await verwerkWachtrij({ nu: klok(om(2, 59)) });
      await verwerkWachtrij({ nu: klok(om(4, 0)) });
      expect(werk.opschonen).not.toHaveBeenCalled();
    });

    it('draait één keer in het ingestelde uur, ook na een herstart binnen dat uur', async () => {
      registreerStandaardTaken();
      await verwerkWachtrij({ nu: klok(om(3, 0)) });

      // Herstart: registraties weg, database blijft.
      wisRegistratiesVoorTests();
      registreerStandaardTaken();
      await verwerkWachtrij({ nu: klok(om(3, 40)) });

      expect(werk.opschonen).toHaveBeenCalledTimes(1);
    });

    it('volgt een zelf ingesteld uur', async () => {
      process.env.GDPR_CLEANUP_HOUR = '22';
      registreerStandaardTaken();
      await verwerkWachtrij({ nu: klok(om(3, 0)) });
      expect(werk.opschonen).not.toHaveBeenCalled();
      await verwerkWachtrij({ nu: klok(om(22, 5)) });
      expect(werk.opschonen).toHaveBeenCalledTimes(1);
    });
  });

  describe('de back-up', () => {
    it('draait één keer per ingesteld interval', async () => {
      registreerStandaardTaken();
      await verwerkWachtrij({ nu: klok(om(10, 0)) });
      await verwerkWachtrij({ nu: klok(om(11, 0)) });
      expect(werk.backUp).toHaveBeenCalledTimes(1);
    });

    it('staat als mislukt in de wachtrij als er geen kopie is gemaakt', async () => {
      // runBackup vangt zijn eigen fouten af. Zonder deze controle stond een
      // mislukte back-up als gelukt in de wachtrij.
      werk.backUp.mockReturnValue({ file: null, removed: 0 });
      registreerStandaardTaken();

      await verwerkWachtrij({ nu: klok(om(10, 0)) });

      const [back] = taken('database-back-up');
      expect(back.status).toBe('wachtend');
      expect(back.laatste_fout).toMatch(/geen back-up gemaakt/);
    });

    it('wordt niet ingepland als back-ups uit staan', async () => {
      process.env.BACKUP_ENABLED = 'false';
      registreerStandaardTaken();
      await verwerkWachtrij({ nu: klok(om(10, 0)) });
      expect(werk.backUp).not.toHaveBeenCalled();
      expect(taken('database-back-up')).toHaveLength(0);
    });
  });
});
