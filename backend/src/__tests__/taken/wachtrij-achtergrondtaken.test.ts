/**
 * De wachtrij voor achtergrondtaken: wat er met een taak gebeurt als hij
 * lukt, als hij faalt, als hij halverwege wordt onderbroken, en als twee
 * werkers hem tegelijk willen hebben.
 *
 * De klok staat stil: elke test geeft zelf het moment mee, zodat wachttijden
 * en verlopen vergrendelingen niet van echte seconden afhangen.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import '../setup';
import db from '../../database/connection';
import { createTestAssociation } from '../testUtils';
import {
  plaatsTaak,
  registreerTaak,
  registreerPeriodiek,
  verwerkWachtrij,
  probeerOpnieuw,
  ruimOp,
  wachttijdNa,
  wisRegistratiesVoorTests,
} from '../../taken/wachtrij';

interface Rij {
  id: string;
  soort: string;
  status: string;
  pogingen: number;
  gepland_op: string;
  laatste_fout: string | null;
  eigenaar: string | null;
  vergrendeld_tot: string | null;
  afgerond_op: string | null;
}

const BEGIN = new Date('2026-09-23T10:00:00.000Z');
const na = (ms: number) => new Date(BEGIN.getTime() + ms);
const klok = (moment: Date) => () => moment;

const rijen = () => db.prepare('SELECT * FROM achtergrondtaken ORDER BY aangemaakt_op').all() as Rij[];
const rij = (id: string) => db.prepare('SELECT * FROM achtergrondtaken WHERE id = ?').get(id) as Rij;

describe('de wachtrij voor achtergrondtaken', () => {
  beforeEach(() => {
    wisRegistratiesVoorTests();
  });

  describe('een taak die lukt', () => {
    it('voert hem uit met zijn gegevens en zet hem op gelukt', async () => {
      const uitvoeren = vi.fn();
      registreerTaak('groet', { herhaalbaar: true, uitvoeren });
      const id = plaatsTaak('groet', { naam: 'Harmonie' }, { nu: BEGIN })!;

      expect(await verwerkWachtrij({ nu: klok(BEGIN) })).toBe(1);

      expect(uitvoeren).toHaveBeenCalledWith(
        { naam: 'Harmonie' },
        expect.objectContaining({ id, poging: 1, associationId: null }),
      );
      const na1 = rij(id);
      expect(na1.status).toBe('gelukt');
      expect(na1.pogingen).toBe(1);
      expect(na1.eigenaar).toBeNull();
      expect(na1.afgerond_op).toBe(BEGIN.toISOString());
    });

    it('voert een gelukte taak niet nog eens uit', async () => {
      const uitvoeren = vi.fn();
      registreerTaak('groet', { herhaalbaar: true, uitvoeren });
      plaatsTaak('groet', {}, { nu: BEGIN });

      await verwerkWachtrij({ nu: klok(BEGIN) });
      await verwerkWachtrij({ nu: klok(na(60_000)) });
      expect(uitvoeren).toHaveBeenCalledTimes(1);
    });

    it('wacht met een taak tot zijn planmoment', async () => {
      const uitvoeren = vi.fn();
      registreerTaak('later', { herhaalbaar: true, uitvoeren });
      plaatsTaak('later', {}, { nu: BEGIN, geplandOp: na(60_000) });

      expect(await verwerkWachtrij({ nu: klok(BEGIN) })).toBe(0);
      expect(uitvoeren).not.toHaveBeenCalled();

      expect(await verwerkWachtrij({ nu: klok(na(60_000)) })).toBe(1);
      expect(uitvoeren).toHaveBeenCalledTimes(1);
    });

    it('geeft de vereniging mee als de taak bij een vereniging hoort', async () => {
      const associationId = createTestAssociation().id;
      const uitvoeren = vi.fn();
      registreerTaak('per-vereniging', { herhaalbaar: true, uitvoeren });
      plaatsTaak('per-vereniging', {}, { nu: BEGIN, associationId });

      await verwerkWachtrij({ nu: klok(BEGIN) });
      expect(uitvoeren.mock.calls[0][1].associationId).toBe(associationId);
    });
  });

  describe('een sleutel', () => {
    it('plant dezelfde taak maar één keer in', () => {
      registreerTaak('eenmalig', { herhaalbaar: true, uitvoeren: vi.fn() });
      const eerste = plaatsTaak('eenmalig', {}, { sleutel: 'eenmalig:2026-09-23', nu: BEGIN });
      const tweede = plaatsTaak('eenmalig', {}, { sleutel: 'eenmalig:2026-09-23', nu: BEGIN });

      expect(eerste).not.toBeNull();
      expect(tweede).toBeNull();
      expect(rijen()).toHaveLength(1);
    });

    it('laat taken zonder sleutel gewoon naast elkaar staan', () => {
      registreerTaak('los', { herhaalbaar: true, uitvoeren: vi.fn() });
      plaatsTaak('los', {}, { nu: BEGIN });
      plaatsTaak('los', {}, { nu: BEGIN });
      expect(rijen()).toHaveLength(2);
    });
  });

  describe('een herhaalbare taak die faalt', () => {
    it('probeert het later opnieuw, met de fout erbij', async () => {
      registreerTaak('wankel', {
        herhaalbaar: true,
        uitvoeren: () => {
          throw new Error('dienst plat');
        },
      });
      const id = plaatsTaak('wankel', {}, { nu: BEGIN })!;

      await verwerkWachtrij({ nu: klok(BEGIN) });

      const r = rij(id);
      expect(r.status).toBe('wachtend');
      expect(r.pogingen).toBe(1);
      expect(r.laatste_fout).toBe('dienst plat');
      expect(r.gepland_op).toBe(na(wachttijdNa(1)).toISOString());
      expect(r.eigenaar).toBeNull();
    });

    it('slaagt alsnog bij een volgende poging', async () => {
      let keer = 0;
      registreerTaak('wankel', {
        herhaalbaar: true,
        uitvoeren: () => {
          keer++;
          if (keer === 1) throw new Error('even niet');
        },
      });
      const id = plaatsTaak('wankel', {}, { nu: BEGIN })!;

      await verwerkWachtrij({ nu: klok(BEGIN) });
      // Nog niet aan de beurt: de wachttijd loopt.
      expect(await verwerkWachtrij({ nu: klok(na(1000)) })).toBe(0);
      await verwerkWachtrij({ nu: klok(na(wachttijdNa(1))) });

      expect(rij(id).status).toBe('gelukt');
      expect(rij(id).pogingen).toBe(2);
      expect(rij(id).laatste_fout).toBeNull();
    });

    it('komt na het laatste toegestane aantal pogingen in het eindstation', async () => {
      registreerTaak('kapot', {
        herhaalbaar: true,
        maxPogingen: 3,
        uitvoeren: () => {
          throw new Error('blijft stuk');
        },
      });
      const id = plaatsTaak('kapot', {}, { nu: BEGIN })!;

      let moment = BEGIN;
      for (let i = 0; i < 3; i++) {
        await verwerkWachtrij({ nu: klok(moment) });
        moment = new Date(moment.getTime() + 2 * 60 * 60 * 1000);
      }

      const r = rij(id);
      expect(r.status).toBe('mislukt');
      expect(r.pogingen).toBe(3);
      expect(r.laatste_fout).toBe('blijft stuk');

      // En daar blijft hij.
      expect(await verwerkWachtrij({ nu: klok(new Date(moment.getTime() + 24 * 60 * 60 * 1000)) })).toBe(0);
    });

    it('wacht na elke poging langer, tot een uur', () => {
      expect(wachttijdNa(1)).toBe(30_000);
      expect(wachttijdNa(2)).toBe(60_000);
      expect(wachttijdNa(3)).toBe(120_000);
      expect(wachttijdNa(20)).toBe(60 * 60 * 1000);
    });
  });

  describe('een taak die niet herhaalbaar is', () => {
    it('is na één fout meteen mislukt', async () => {
      const uitvoeren = vi.fn(() => {
        throw new Error('bericht half verstuurd');
      });
      registreerTaak('versturen', { herhaalbaar: false, uitvoeren });
      const id = plaatsTaak('versturen', {}, { nu: BEGIN })!;

      await verwerkWachtrij({ nu: klok(BEGIN) });
      await verwerkWachtrij({ nu: klok(na(24 * 60 * 60 * 1000)) });

      expect(uitvoeren).toHaveBeenCalledTimes(1);
      expect(rij(id).status).toBe('mislukt');
      expect(rij(id).laatste_fout).toBe('bericht half verstuurd');
    });
  });

  describe('een taak die werd onderbroken', () => {
    /** Zet een taak zoals een omgevallen proces hem achterliet. */
    function onderbrokenTaak(soort: string, vergrendeldTot: Date, pogingen = 1): string {
      const id = plaatsTaak(soort, {}, { nu: BEGIN })!;
      db.prepare(
        `UPDATE achtergrondtaken
            SET status = 'bezig', eigenaar = 'omgevallen-proces', vergrendeld_tot = ?, pogingen = ?
          WHERE id = ?`,
      ).run(vergrendeldTot.toISOString(), pogingen, id);
      return id;
    }

    it('laat hem liggen zolang de vergrendeling geldt', async () => {
      const uitvoeren = vi.fn();
      registreerTaak('lang', { herhaalbaar: true, uitvoeren });
      const id = onderbrokenTaak('lang', na(10 * 60_000));

      expect(await verwerkWachtrij({ nu: klok(na(60_000)) })).toBe(0);
      expect(uitvoeren).not.toHaveBeenCalled();
      expect(rij(id).eigenaar).toBe('omgevallen-proces');
    });

    it('pakt een herhaalbare taak opnieuw op als de vergrendeling verlopen is', async () => {
      const uitvoeren = vi.fn();
      registreerTaak('lang', { herhaalbaar: true, uitvoeren });
      const id = onderbrokenTaak('lang', na(10 * 60_000));

      expect(await verwerkWachtrij({ nu: klok(na(11 * 60_000)) })).toBe(1);
      expect(uitvoeren).toHaveBeenCalledTimes(1);
      expect(rij(id).status).toBe('gelukt');
      expect(rij(id).pogingen).toBe(2);
    });

    it('doet een niet-herhaalbare taak niet opnieuw, maar zet hem op mislukt met de reden', async () => {
      const uitvoeren = vi.fn();
      registreerTaak('versturen', { herhaalbaar: false, uitvoeren });
      const id = onderbrokenTaak('versturen', na(10 * 60_000));

      await verwerkWachtrij({ nu: klok(na(11 * 60_000)) });

      expect(uitvoeren).not.toHaveBeenCalled();
      expect(rij(id).status).toBe('mislukt');
      expect(rij(id).laatste_fout).toMatch(/niet herhaalbaar/);
    });

    it('geeft een herhaalbare taak zonder pogingen over op', async () => {
      const uitvoeren = vi.fn();
      registreerTaak('lang', { herhaalbaar: true, maxPogingen: 2, uitvoeren });
      const id = onderbrokenTaak('lang', na(10 * 60_000), 2);

      await verwerkWachtrij({ nu: klok(na(11 * 60_000)) });

      expect(uitvoeren).not.toHaveBeenCalled();
      expect(rij(id).status).toBe('mislukt');
      expect(rij(id).laatste_fout).toMatch(/geen pogingen meer/);
    });

    it('gaat na een afgeboekte taak door met de volgende', async () => {
      const uitvoeren = vi.fn();
      registreerTaak('versturen', { herhaalbaar: false, uitvoeren: vi.fn() });
      registreerTaak('gewoon', { herhaalbaar: true, uitvoeren });
      onderbrokenTaak('versturen', na(1000));
      plaatsTaak('gewoon', {}, { nu: na(2000) });

      await verwerkWachtrij({ nu: klok(na(60_000)) });
      expect(uitvoeren).toHaveBeenCalledTimes(1);
    });
  });

  describe('opnieuw proberen vanuit het beheerscherm', () => {
    it('laat een mislukte taak weer draaien, met al zijn pogingen', async () => {
      let stuk = true;
      registreerTaak('herstelbaar', {
        herhaalbaar: false,
        uitvoeren: () => {
          if (stuk) throw new Error('schijf vol');
        },
      });
      const id = plaatsTaak('herstelbaar', {}, { nu: BEGIN })!;
      await verwerkWachtrij({ nu: klok(BEGIN) });
      expect(rij(id).status).toBe('mislukt');

      stuk = false;
      expect(probeerOpnieuw(id, na(60_000))).toBe(true);
      await verwerkWachtrij({ nu: klok(na(60_000)) });

      expect(rij(id).status).toBe('gelukt');
      expect(rij(id).pogingen).toBe(1);
      expect(rij(id).laatste_fout).toBeNull();
    });

    it('doet niets met een taak die niet mislukt is', async () => {
      registreerTaak('iets', { herhaalbaar: true, uitvoeren: vi.fn() });
      const id = plaatsTaak('iets', {}, { nu: BEGIN, geplandOp: na(60 * 60_000) })!;

      expect(probeerOpnieuw(id, BEGIN)).toBe(false);
      // Het planmoment is niet naar voren gehaald.
      expect(rij(id).gepland_op).toBe(na(60 * 60_000).toISOString());
    });
  });

  describe('de sluis', () => {
    it('voert een taak één keer uit als twee werkers tegelijk kijken', async () => {
      let loslaten: () => void = () => {};
      const uitvoeren = vi.fn(
        () =>
          new Promise<void>((klaar) => {
            loslaten = klaar;
          }),
      );
      registreerTaak('traag', { herhaalbaar: true, uitvoeren });
      plaatsTaak('traag', {}, { nu: BEGIN });

      // De eerste werker heeft de taak en is ermee bezig; de tweede kijkt
      // intussen ook.
      const eerste = verwerkWachtrij({ nu: klok(BEGIN) });
      const tweede = await verwerkWachtrij({ nu: klok(BEGIN) });
      loslaten();
      await eerste;

      expect(tweede).toBe(0);
      expect(uitvoeren).toHaveBeenCalledTimes(1);
    });
  });

  describe('een taak waarvan de soort niet (meer) bestaat', () => {
    it('zet hem op mislukt in plaats van hem eeuwig te laten wachten', async () => {
      const id = plaatsTaak('weggehaald', {}, { nu: BEGIN })!;
      await verwerkWachtrij({ nu: klok(BEGIN) });
      expect(rij(id).status).toBe('mislukt');
      expect(rij(id).laatste_fout).toMatch(/Onbekende soort/);
    });
  });

  describe('periodieke taken', () => {
    it('plant er één per tijdvak, hoe vaak de werker ook tikt', async () => {
      const uitvoeren = vi.fn();
      registreerTaak('elke-minuut', { herhaalbaar: false, uitvoeren });
      registreerPeriodiek('elke-minuut', {
        sleutelVoor: (nu) => `elke-minuut:${Math.floor(nu.getTime() / 60_000)}`,
      });

      await verwerkWachtrij({ nu: klok(BEGIN) });
      await verwerkWachtrij({ nu: klok(na(15_000)) });
      await verwerkWachtrij({ nu: klok(na(45_000)) });
      expect(uitvoeren).toHaveBeenCalledTimes(1);

      await verwerkWachtrij({ nu: klok(na(60_000)) });
      expect(uitvoeren).toHaveBeenCalledTimes(2);
    });

    it('plant niets als het tijdvak niet aan de beurt is', async () => {
      const uitvoeren = vi.fn();
      registreerTaak('om-drie-uur', { herhaalbaar: true, uitvoeren });
      registreerPeriodiek('om-drie-uur', { sleutelVoor: () => null });

      await verwerkWachtrij({ nu: klok(BEGIN) });
      expect(uitvoeren).not.toHaveBeenCalled();
      expect(rijen()).toHaveLength(0);
    });

    it('draait na een herstart in hetzelfde tijdvak niet nog eens', async () => {
      const uitvoeren = vi.fn();
      const definitie = { herhaalbaar: true, uitvoeren };
      const periodiek = { sleutelVoor: (nu: Date) => `dagelijks:${nu.toISOString().slice(0, 10)}` };
      registreerTaak('dagelijks', definitie);
      registreerPeriodiek('dagelijks', periodiek);
      await verwerkWachtrij({ nu: klok(BEGIN) });

      // "Herstart": alles in het geheugen weg en opnieuw geregistreerd; de
      // database blijft.
      wisRegistratiesVoorTests();
      registreerTaak('dagelijks', definitie);
      registreerPeriodiek('dagelijks', periodiek);
      await verwerkWachtrij({ nu: klok(na(60 * 60_000)) });

      expect(uitvoeren).toHaveBeenCalledTimes(1);
    });
  });

  describe('opruimen', () => {
    it('haalt oude gelukte taken weg en laat recente en mislukte staan', () => {
      const dag = 24 * 60 * 60 * 1000;
      const zet = (status: string, afgerond: Date) => {
        const id = plaatsTaak('iets', {}, { nu: afgerond })!;
        db.prepare('UPDATE achtergrondtaken SET status = ?, afgerond_op = ? WHERE id = ?').run(
          status,
          afgerond.toISOString(),
          id,
        );
        return id;
      };
      const oudGelukt = zet('gelukt', new Date(BEGIN.getTime() - 15 * dag));
      const recentGelukt = zet('gelukt', new Date(BEGIN.getTime() - 1 * dag));
      const oudMislukt = zet('mislukt', new Date(BEGIN.getTime() - 30 * dag));
      const heelOudMislukt = zet('mislukt', new Date(BEGIN.getTime() - 91 * dag));
      const wachtend = plaatsTaak('iets', {}, { nu: new Date(BEGIN.getTime() - 100 * dag) })!;

      expect(ruimOp(BEGIN)).toBe(2);
      const over = rijen().map((r) => r.id);
      expect(over).not.toContain(oudGelukt);
      expect(over).not.toContain(heelOudMislukt);
      expect(over).toEqual(expect.arrayContaining([recentGelukt, oudMislukt, wachtend]));
    });
  });
});
