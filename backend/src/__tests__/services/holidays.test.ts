/**
 * Tests for the Dutch holiday service: national holidays (calculated),
 * school holidays per region, and the date lookups the planner uses.
 */

import { describe, it, expect } from 'vitest';
import '../setup';
import {
  DutchRegion,
  SchoolHoliday,
  getHolidaysForYearAndRegion,
  getHolidaysInRange,
  isDateInHoliday,
  getNextHoliday,
  getCurrentHoliday,
  syncHolidaysFromExternalAPI,
  getAvailableYears,
  getRegions,
} from '../../services/holidays';

const REGIOS: DutchRegion[] = ['noord', 'midden', 'zuid'];

function zoek(feestdagen: SchoolHoliday[], naamNl: string): SchoolHoliday | undefined {
  return feestdagen.find((f) => f.nameDutch === naamNl);
}

describe('holidays', () => {
  describe('nationale feestdagen', () => {
    it('zet de vaste feestdagen op de juiste datum', () => {
      const feestdagen = getHolidaysForYearAndRegion(2026, 'midden');
      expect(zoek(feestdagen, 'Nieuwjaarsdag')?.startDate).toBe('2026-01-01');
      expect(zoek(feestdagen, 'Bevrijdingsdag')?.startDate).toBe('2026-05-05');
      expect(zoek(feestdagen, 'Eerste Kerstdag')?.startDate).toBe('2026-12-25');
      expect(zoek(feestdagen, 'Tweede Kerstdag')?.startDate).toBe('2026-12-26');
    });

    it('berekent Pasen goed voor meerdere jaren', () => {
      const verwacht: Record<number, string> = {
        2024: '2024-03-31',
        2025: '2025-04-20',
        2026: '2026-04-05',
        2027: '2027-03-28',
      };
      for (const [jaar, datum] of Object.entries(verwacht)) {
        const feestdagen = getHolidaysForYearAndRegion(Number(jaar), 'all');
        expect(zoek(feestdagen, 'Eerste Paasdag')?.startDate).toBe(datum);
      }
    });

    it('leidt de overige paasdagen af van Eerste Paasdag', () => {
      const feestdagen = getHolidaysForYearAndRegion(2026, 'all');
      // Pasen 2026 valt op 5 april.
      expect(zoek(feestdagen, 'Goede Vrijdag')?.startDate).toBe('2026-04-03');
      expect(zoek(feestdagen, 'Tweede Paasdag')?.startDate).toBe('2026-04-06');
      expect(zoek(feestdagen, 'Hemelvaartsdag')?.startDate).toBe('2026-05-14');
      expect(zoek(feestdagen, 'Eerste Pinksterdag')?.startDate).toBe('2026-05-24');
      expect(zoek(feestdagen, 'Tweede Pinksterdag')?.startDate).toBe('2026-05-25');
    });

    it('verschuift Koningsdag naar 26 april wanneer 27 april op zondag valt', () => {
      // 27 april 2025 was een zondag.
      expect(zoek(getHolidaysForYearAndRegion(2025, 'all'), 'Koningsdag')?.startDate).toBe('2025-04-26');
      expect(zoek(getHolidaysForYearAndRegion(2026, 'all'), 'Koningsdag')?.startDate).toBe('2026-04-27');
    });

    it('geeft nationale feestdagen aan elke regio', () => {
      for (const regio of REGIOS) {
        const nationaal = getHolidaysForYearAndRegion(2026, regio).filter((f) => f.holidayType === 'national');
        expect(nationaal.length).toBe(11);
        expect(nationaal.every((f) => f.region === 'all')).toBe(true);
      }
    });

    it('geeft elke feestdag een begin- en einddatum van dezelfde dag', () => {
      const nationaal = getHolidaysForYearAndRegion(2026, 'all').filter((f) => f.holidayType === 'national');
      for (const feestdag of nationaal) {
        expect(feestdag.endDate).toBe(feestdag.startDate);
        expect(feestdag.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    });
  });

  describe('getHolidaysForYearAndRegion', () => {
    it('levert de vakanties gesorteerd op begindatum', () => {
      const feestdagen = getHolidaysForYearAndRegion(2026, 'zuid');
      const datums = feestdagen.map((f) => f.startDate);
      expect(datums).toEqual([...datums].sort());
    });

    it('geeft voor elke regio schoolvakanties terug', () => {
      for (const regio of REGIOS) {
        const school = getHolidaysForYearAndRegion(2026, regio).filter((f) => f.holidayType !== 'national');
        expect(school.length).toBeGreaterThan(0);
      }
    });

    it('geeft alleen vakanties van de gevraagde regio of van alle regio’s', () => {
      for (const regio of REGIOS) {
        const school = getHolidaysForYearAndRegion(2026, regio).filter((f) => f.holidayType !== 'national');
        expect(school.every((f) => f.region === regio || f.region === 'all')).toBe(true);
      }
    });

    it('geeft bij regio "all" minstens zoveel vakanties als bij een enkele regio', () => {
      const alle = getHolidaysForYearAndRegion(2026, 'all');
      for (const regio of REGIOS) {
        expect(alle.length).toBeGreaterThanOrEqual(getHolidaysForYearAndRegion(2026, regio).length);
      }
    });

    it('houdt vakanties die over de jaargrens lopen bij beide jaren', () => {
      // De kerstvakantie begint in december en eindigt in januari.
      const decemberVakantie = getHolidaysForYearAndRegion(2025, 'midden').filter(
        (f) => f.holidayType === 'kerst' && f.startDate.startsWith('2025-12'),
      );
      expect(decemberVakantie.length).toBeGreaterThan(0);
      const inVolgendJaar = getHolidaysForYearAndRegion(2026, 'midden').filter(
        (f) => f.holidayType === 'kerst' && f.startDate.startsWith('2025-12'),
      );
      expect(inVolgendJaar.length).toBe(decemberVakantie.length);
    });

    it('geeft een lege lijst voor een jaar zonder gegevens', () => {
      expect(getHolidaysForYearAndRegion(1990, 'midden').filter((f) => f.holidayType !== 'national')).toEqual([]);
    });
  });

  describe('getHolidaysInRange', () => {
    it('geeft alleen vakanties die het bereik raken', () => {
      const gevonden = getHolidaysInRange('2026-05-01', '2026-05-31', 'midden');
      expect(gevonden.length).toBeGreaterThan(0);
      for (const feestdag of gevonden) {
        expect(feestdag.endDate >= '2026-05-01').toBe(true);
        expect(feestdag.startDate <= '2026-05-31').toBe(true);
      }
    });

    it('neemt een vakantie mee die het bereik gedeeltelijk overlapt', () => {
      const eenDag = getHolidaysInRange('2026-05-05', '2026-05-05', 'midden');
      expect(eenDag.map((f) => f.nameDutch)).toContain('Bevrijdingsdag');
    });

    it('werkt over een jaargrens heen', () => {
      const overGrens = getHolidaysInRange('2025-12-20', '2026-01-10', 'noord');
      expect(overGrens.map((f) => f.nameDutch)).toContain('Nieuwjaarsdag');
      expect(overGrens.map((f) => f.nameDutch)).toContain('Eerste Kerstdag');
    });

    it('geeft een lege lijst voor een bereik zonder vakanties', () => {
      expect(getHolidaysInRange('2026-09-15', '2026-09-20', 'midden')).toEqual([]);
    });

    it('geeft een lege lijst wanneer het bereik omgekeerd is', () => {
      expect(getHolidaysInRange('2026-12-31', '2026-01-01', 'midden')).toEqual([]);
    });
  });

  describe('isDateInHoliday', () => {
    it('herkent een nationale feestdag buiten de schoolvakanties', () => {
      // Hemelvaartsdag 2026 valt na de meivakantie (25 april t/m 10 mei).
      expect(isDateInHoliday('2026-05-14', 'midden')?.nameDutch).toBe('Hemelvaartsdag');
    });

    it('geeft bij overlap de vakantie die het eerst begint', () => {
      // Nieuwjaarsdag valt binnen de kerstvakantie, die in december begint.
      expect(isDateInHoliday('2026-01-01', 'midden')?.holidayType).toBe('kerst');
    });

    it('geeft null voor een gewone werkdag', () => {
      expect(isDateInHoliday('2026-09-16', 'midden')).toBeNull();
    });

    it('herkent de eerste en laatste dag van een vakantieperiode', () => {
      const zomer = getHolidaysForYearAndRegion(2026, 'zuid').find((f) => f.holidayType === 'zomer');
      expect(zomer).toBeDefined();
      expect(isDateInHoliday(zomer!.startDate, 'zuid')).not.toBeNull();
      expect(isDateInHoliday(zomer!.endDate, 'zuid')).not.toBeNull();
    });
  });

  describe('getNextHoliday en getCurrentHoliday', () => {
    it('geeft een eerstvolgende vakantie die in de toekomst ligt', () => {
      const vandaag = new Date().toISOString().split('T')[0];
      const volgende = getNextHoliday('midden');
      expect(volgende).not.toBeNull();
      expect(volgende!.startDate > vandaag).toBe(true);
    });

    it('geeft voor de huidige vakantie hetzelfde antwoord als isDateInHoliday', () => {
      const vandaag = new Date().toISOString().split('T')[0];
      expect(getCurrentHoliday('midden')).toEqual(isDateInHoliday(vandaag, 'midden'));
    });
  });

  describe('syncHolidaysFromExternalAPI', () => {
    it('levert vakanties voor het gevraagde jaar zonder extern verzoek', async () => {
      const feestdagen = await syncHolidaysFromExternalAPI(2026);
      expect(feestdagen.length).toBeGreaterThan(0);
      expect(feestdagen.filter((f) => f.holidayType === 'national').length).toBe(11);
    });
  });

  describe('metagegevens', () => {
    it('noemt de jaren waarvoor gegevens bestaan', () => {
      const jaren = getAvailableYears();
      expect(jaren).toEqual([2024, 2025, 2026, 2027]);
      for (const jaar of jaren) {
        expect(
          getHolidaysForYearAndRegion(jaar, 'midden').filter((f) => f.holidayType !== 'national').length,
        ).toBeGreaterThan(0);
      }
    });

    it('noemt de drie regio’s met een Nederlands label', () => {
      const regios = getRegions();
      expect(regios.map((r) => r.value)).toEqual(['noord', 'midden', 'zuid']);
      expect(regios.map((r) => r.labelDutch)).toEqual(['Noord', 'Midden', 'Zuid']);
    });
  });
});
