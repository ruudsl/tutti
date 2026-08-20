/**
 * De grenzen bij het abonnement van een vereniging.
 *
 * max_members en max_orchestras staan sinds de multi-vereniging-migratie op
 * associations, met 100 en 5 als standaard. Ze werden alleen opgeslagen en
 * teruggegeven: geen enkele route keek ernaar. Vier niveaus - free, basic, pro
 * en enterprise - gedroegen zich daardoor precies hetzelfde.
 *
 * Deze tests leggen vast wat een grens nu betekent: hij telt bij het toevoegen,
 * een niet ingevulde grens is geen grens, en een vereniging die al boven haar
 * grens zit raakt niemand kwijt.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import { bewaakLedenLimiet, bewaakOrkestLimiet, telLeden, telOrkesten } from '../../services/abonnementLimieten';
import { createTestAssociation, createTestUser, createTestOrchestra, TestAssociation } from '../testUtils';

describe('abonnementslimieten', () => {
  let vereniging: TestAssociation;

  beforeEach(() => {
    vereniging = createTestAssociation();
  });

  const zetLimiet = (kolom: 'max_members' | 'max_orchestras', waarde: number | null) =>
    db.prepare(`UPDATE associations SET ${kolom} = ? WHERE id = ?`).run(waarde, vereniging.id);

  describe('leden tellen', () => {
    it('telt de leden van de eigen vereniging', () => {
      createTestUser(vereniging.id, { email: 'een@test.nl' });
      createTestUser(vereniging.id, { email: 'twee@test.nl' });
      expect(telLeden(vereniging.id)).toBe(2);
    });

    it('telt een verwijderd lid niet mee', () => {
      const lid = createTestUser(vereniging.id, { email: 'weg@test.nl' });
      db.prepare('UPDATE users SET deleted_at = ? WHERE id = ?').run('2026-01-01 12:00:00', lid.id);
      expect(telLeden(vereniging.id)).toBe(0);
    });

    it('telt een lid van een andere vereniging niet mee', () => {
      const andere = createTestAssociation({ name: 'Elders' });
      createTestUser(andere.id, { email: 'elders@test.nl' });
      expect(telLeden(vereniging.id)).toBe(0);
    });

    it('telt iemand die via user_associations meespeelt wel mee', () => {
      const andere = createTestAssociation({ name: 'Elders' });
      const gast = createTestUser(andere.id, { email: 'gast@test.nl' });
      db.prepare('INSERT INTO user_associations (user_id, association_id, role) VALUES (?, ?, ?)').run(
        gast.id,
        vereniging.id,
        'member',
      );
      expect(telLeden(vereniging.id)).toBe(1);
    });

    it('telt iemand die in beide tabellen staat maar een keer', () => {
      const lid = createTestUser(vereniging.id, { email: 'dubbel@test.nl' });
      db.prepare('INSERT INTO user_associations (user_id, association_id, role) VALUES (?, ?, ?)').run(
        lid.id,
        vereniging.id,
        'member',
      );
      expect(telLeden(vereniging.id)).toBe(1);
    });

    it('telt een niet-actief lidmaatschap niet mee', () => {
      const andere = createTestAssociation({ name: 'Elders' });
      const gast = createTestUser(andere.id, { email: 'inactief@test.nl' });
      db.prepare('INSERT INTO user_associations (user_id, association_id, role, status) VALUES (?, ?, ?, ?)').run(
        gast.id,
        vereniging.id,
        'member',
        'inactive',
      );
      expect(telLeden(vereniging.id)).toBe(0);
    });
  });

  describe('ledengrens', () => {
    it('laat toe zolang de grens niet is bereikt', () => {
      zetLimiet('max_members', 2);
      createTestUser(vereniging.id, { email: 'een@test.nl' });
      expect(() => bewaakLedenLimiet(vereniging.id)).not.toThrow();
    });

    it('weigert zodra de grens bereikt is', () => {
      zetLimiet('max_members', 1);
      createTestUser(vereniging.id, { email: 'een@test.nl' });
      expect(() => bewaakLedenLimiet(vereniging.id)).toThrow(/maximum van 1 leden/);
    });

    it('weigert met een 409, niet met een 500', () => {
      zetLimiet('max_members', 1);
      createTestUser(vereniging.id, { email: 'een@test.nl' });
      try {
        bewaakLedenLimiet(vereniging.id);
        expect.unreachable('had moeten weigeren');
      } catch (fout) {
        expect((fout as { statusCode?: number }).statusCode).toBe(409);
      }
    });

    it('kent geen grens als de waarde leeg is', () => {
      zetLimiet('max_members', null);
      for (let i = 0; i < 5; i++) createTestUser(vereniging.id, { email: `lid${i}@test.nl` });
      expect(() => bewaakLedenLimiet(vereniging.id)).not.toThrow();
    });

    it('kent geen grens bij nul', () => {
      zetLimiet('max_members', 0);
      createTestUser(vereniging.id, { email: 'een@test.nl' });
      expect(() => bewaakLedenLimiet(vereniging.id)).not.toThrow();
    });

    it('kijkt naar de grens van de eigen vereniging, niet van een andere', () => {
      const andere = createTestAssociation({ name: 'Elders' });
      db.prepare('UPDATE associations SET max_members = 1 WHERE id = ?').run(andere.id);
      zetLimiet('max_members', 10);

      createTestUser(vereniging.id, { email: 'een@test.nl' });
      createTestUser(andere.id, { email: 'elders@test.nl' });

      expect(() => bewaakLedenLimiet(vereniging.id)).not.toThrow();
      expect(() => bewaakLedenLimiet(andere.id)).toThrow();
    });
  });

  describe('orkestgrens', () => {
    it('telt de orkesten van de eigen vereniging', () => {
      createTestOrchestra(vereniging.id, { name: 'Harmonie' });
      createTestOrchestra(createTestAssociation({ name: 'Elders' }).id, { name: 'Fanfare' });
      expect(telOrkesten(vereniging.id)).toBe(1);
    });

    it('weigert zodra de grens bereikt is', () => {
      zetLimiet('max_orchestras', 1);
      createTestOrchestra(vereniging.id, { name: 'Harmonie' });
      expect(() => bewaakOrkestLimiet(vereniging.id)).toThrow(/maximum van 1 orkesten/);
    });

    it('kent geen grens als de waarde leeg is', () => {
      zetLimiet('max_orchestras', null);
      for (let i = 0; i < 4; i++) createTestOrchestra(vereniging.id, { name: `Orkest ${i}` });
      expect(() => bewaakOrkestLimiet(vereniging.id)).not.toThrow();
    });
  });

  describe('een vereniging die al boven de grens zit', () => {
    it('raakt niemand kwijt, er kan alleen niets meer bij', () => {
      for (let i = 0; i < 3; i++) createTestUser(vereniging.id, { email: `lid${i}@test.nl` });
      zetLimiet('max_members', 1);

      expect(telLeden(vereniging.id)).toBe(3);
      expect(() => bewaakLedenLimiet(vereniging.id)).toThrow();
    });
  });

  describe('een vereniging die niet bestaat', () => {
    it('houdt niets tegen', () => {
      expect(() => bewaakLedenLimiet(uuidv4())).not.toThrow();
    });
  });
});
