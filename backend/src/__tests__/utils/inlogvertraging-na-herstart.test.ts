/**
 * De wachttijd na mislukte inlogpogingen overleeft een herstart.
 *
 * De standen stonden in een Map in het geheugen van het proces; een herstart
 * zette elke teller terug op nul. Nu staan ze in de tabel inlogvertragingen,
 * met als sleutel een HMAC van e-mailadres + IP-adres (of van het account bij
 * de tweede stap) - geen leesbaar adres.
 *
 * Een herstart wordt hier nagebootst door de module opnieuw te laden: alles
 * wat hij in zijn eigen geheugen had, is dan weg. De database blijft.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import '../setup';
import db from '../../database/connection';
import {
  inlogSleutel,
  mfaSleutel,
  registreerMislukking,
  resterendeWachttijd,
  ruimInlogvertragingenOp,
  wisAlleInlogvertragingen,
  VRIJE_POGINGEN,
  VERGEET_NA_MS,
} from '../../utils/inlogvertraging';
import { up, down } from '../../migrations/20260925110000_inlogvertraging_bewaren';

/** Laad de module opnieuw, tegen dezelfde database: een herstart van het proces. */
async function naHerstart(): Promise<typeof import('../../utils/inlogvertraging')> {
  vi.resetModules();
  vi.doMock('../../database/connection', () => ({ default: db }));
  return import('../../utils/inlogvertraging');
}

const rijen = () =>
  db.prepare('SELECT sleutel_hash, mislukt, wachten_tot, laatste FROM inlogvertragingen').all() as {
    sleutel_hash: string;
    mislukt: number;
  }[];

describe('wachttijd na mislukte inlogpogingen', () => {
  beforeEach(() => {
    wisAlleInlogvertragingen();
  });

  it('blijft staan na een herstart', async () => {
    const sleutel = inlogSleutel('lid@vereniging.nl', '198.51.100.7');
    for (let i = 0; i < VRIJE_POGINGEN; i++) registreerMislukking(sleutel);
    const ervoor = resterendeWachttijd(sleutel);
    expect(ervoor).toBeGreaterThan(0);

    const opnieuw = await naHerstart();

    expect(opnieuw.resterendeWachttijd(sleutel)).toBeGreaterThan(0);
    // En de telling loopt door waar hij was.
    expect(opnieuw.registreerMislukking(sleutel).mislukt).toBe(VRIJE_POGINGEN + 1);
  });

  it('blijft voor de tweede stap staan na een herstart', async () => {
    const sleutel = mfaSleutel('account-1');
    for (let i = 0; i < VRIJE_POGINGEN; i++) registreerMislukking(sleutel);

    const opnieuw = await naHerstart();

    expect(opnieuw.resterendeWachttijd(sleutel)).toBeGreaterThan(0);
  });

  it('bewaart geen e-mailadres, IP-adres of account-id', () => {
    registreerMislukking(inlogSleutel('Lid@Vereniging.nl', '198.51.100.7'));
    registreerMislukking(mfaSleutel('account-1'));

    expect(rijen()).toHaveLength(2);
    const inhoud = JSON.stringify(rijen()).toLowerCase();
    expect(inhoud).not.toContain('lid@vereniging.nl');
    expect(inhoud).not.toContain('198.51.100.7');
    expect(inhoud).not.toContain('account-1');
    for (const rij of rijen()) expect(rij.sleutel_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('houdt verschillende sleutels uit elkaar', () => {
    const een = inlogSleutel('een@vereniging.nl', '198.51.100.7');
    const twee = inlogSleutel('twee@vereniging.nl', '198.51.100.7');
    for (let i = 0; i < VRIJE_POGINGEN; i++) registreerMislukking(een);

    expect(resterendeWachttijd(een)).toBeGreaterThan(0);
    expect(resterendeWachttijd(twee)).toBe(0);
  });

  describe('opruimen', () => {
    it('vergeet standen die een dag stil zijn, en laat recente staan', () => {
      const nu = Date.now();
      registreerMislukking(inlogSleutel('oud@vereniging.nl', '198.51.100.7'), nu - VERGEET_NA_MS - 1000);
      registreerMislukking(inlogSleutel('recent@vereniging.nl', '198.51.100.7'), nu - 1000);

      expect(ruimInlogvertragingenOp(nu)).toBe(1);
      expect(rijen()).toHaveLength(1);
    });

    it('draait als achtergrondtaak in de wachtrij', async () => {
      const { registreerStandaardTaken } = await import('../../taken');
      const { verwerkWachtrij, wisRegistratiesVoorTests } = await import('../../taken/wachtrij');
      wisRegistratiesVoorTests();
      registreerStandaardTaken();

      const nu = new Date();
      registreerMislukking(inlogSleutel('oud@vereniging.nl', '198.51.100.7'), nu.getTime() - VERGEET_NA_MS - 1000);
      registreerMislukking(inlogSleutel('recent@vereniging.nl', '198.51.100.7'), nu.getTime() - 1000);

      await verwerkWachtrij({ nu: () => nu });

      const taak = db.prepare("SELECT status FROM achtergrondtaken WHERE soort = 'inlogvertraging-opruimen'").get() as
        { status: string } | undefined;
      expect(taak?.status).toBe('gelukt');
      expect(rijen()).toHaveLength(1);
      wisRegistratiesVoorTests();
    });
  });

  describe('de migratie', () => {
    const heeftTabel = () =>
      Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'inlogvertragingen'").get());

    it('gaat heen, terug en weer heen', () => {
      down();
      expect(heeftTabel()).toBe(false);
      up();
      expect(heeftTabel()).toBe(true);
      up();
      expect(heeftTabel()).toBe(true);
    });
  });
});
