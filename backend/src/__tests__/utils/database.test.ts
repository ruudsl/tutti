/**
 * Tests for the database helpers: transactions with savepoints, pagination
 * and the whitelist that guards the soft-delete table name.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import testDb from '../testDb';
import { createTestEnvironment, createTestOrchestra, TestAssociation } from '../testUtils';
import {
  withTransaction,
  isInTransaction,
  getPaginationParams,
  createPaginatedResult,
  softDelete,
  restore,
  excludeDeleted,
} from '../../utils/database';

function maakOrkest(associationId: string, naam: string): string {
  const id = uuidv4();
  testDb.prepare('INSERT INTO orchestras (id, association_id, name) VALUES (?, ?, ?)').run(id, associationId, naam);
  return id;
}

function orkestNaam(id: string): string | undefined {
  const rij = testDb.prepare('SELECT name FROM orchestras WHERE id = ?').get(id) as { name: string } | undefined;
  return rij?.name;
}

function maakLijst(orchestraId: string, naam: string): string {
  const id = uuidv4();
  testDb.prepare('INSERT INTO music_lists (id, orchestra_id, name) VALUES (?, ?, ?)').run(id, orchestraId, naam);
  return id;
}

function lijstNaam(id: string): string | undefined {
  const rij = testDb.prepare('SELECT name FROM music_lists WHERE id = ?').get(id) as { name: string } | undefined;
  return rij?.name;
}

function isVerwijderd(id: string): boolean {
  const rij = testDb.prepare('SELECT deleted_at FROM music_lists WHERE id = ?').get(id) as
    { deleted_at: string | null } | undefined;
  return Boolean(rij?.deleted_at);
}

describe('database-hulpfuncties', () => {
  let vereniging: TestAssociation;
  let orkestId: string;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    orkestId = createTestOrchestra(vereniging.id).id;
  });

  describe('withTransaction', () => {
    it('geeft het resultaat van de functie terug', () => {
      expect(withTransaction(() => 42)).toBe(42);
    });

    it('bewaart wijzigingen wanneer de functie slaagt', () => {
      const id = withTransaction(() => maakOrkest(vereniging.id, 'Harmonie'));
      expect(orkestNaam(id)).toBe('Harmonie');
    });

    it('draait alles terug wanneer de functie een fout werpt', () => {
      const id = maakOrkest(vereniging.id, 'Voor');
      expect(() =>
        withTransaction(() => {
          testDb.prepare('UPDATE orchestras SET name = ? WHERE id = ?').run('Na', id);
          throw new Error('mislukt halverwege');
        }),
      ).toThrow('mislukt halverwege');
      expect(orkestNaam(id)).toBe('Voor');
    });

    it('draait ook een ingevoegde rij terug', () => {
      let id = '';
      expect(() =>
        withTransaction(() => {
          id = maakOrkest(vereniging.id, 'Wordt teruggedraaid');
          throw new Error('stop');
        }),
      ).toThrow('stop');
      expect(orkestNaam(id)).toBeUndefined();
    });

    it('laat de oorspronkelijke fout doorwerpen', () => {
      class EigenFout extends Error {}
      expect(() =>
        withTransaction(() => {
          throw new EigenFout('eigen');
        }),
      ).toThrow(EigenFout);
    });

    it('draait bij een geneste transactie alleen het binnenste deel terug', () => {
      const buiten = maakOrkest(vereniging.id, 'Buiten');
      withTransaction(() => {
        testDb.prepare('UPDATE orchestras SET name = ? WHERE id = ?').run('Buiten gewijzigd', buiten);
        try {
          withTransaction(() => {
            testDb.prepare('UPDATE orchestras SET name = ? WHERE id = ?').run('Binnen gewijzigd', buiten);
            throw new Error('binnenste mislukt');
          });
        } catch {
          // De buitenste transactie gaat gewoon door.
        }
      });
      expect(orkestNaam(buiten)).toBe('Buiten gewijzigd');
    });

    it('bewaart een geslaagde geneste transactie', () => {
      const id = withTransaction(() => withTransaction(() => maakOrkest(vereniging.id, 'Genest')));
      expect(orkestNaam(id)).toBe('Genest');
    });

    it('zet de diepte terug na afloop, ook na een fout', () => {
      expect(isInTransaction()).toBe(false);
      withTransaction(() => {
        expect(isInTransaction()).toBe(true);
      });
      expect(isInTransaction()).toBe(false);

      expect(() =>
        withTransaction(() => {
          throw new Error('stop');
        }),
      ).toThrow();
      expect(isInTransaction()).toBe(false);
    });

    it('telt de diepte op bij nesten', () => {
      withTransaction(() => {
        withTransaction(() => {
          expect(isInTransaction()).toBe(true);
        });
        expect(isInTransaction()).toBe(true);
      });
      expect(isInTransaction()).toBe(false);
    });
  });

  describe('getPaginationParams', () => {
    it('gebruikt standaardwaarden zonder invoer', () => {
      expect(getPaginationParams({})).toEqual({ page: 1, limit: 25, offset: 0 });
    });

    it('rekent de offset uit vanaf het paginanummer', () => {
      expect(getPaginationParams({ page: '3', limit: '10' })).toEqual({ page: 3, limit: 10, offset: 20 });
    });

    it('begrenst de paginagrootte op honderd', () => {
      expect(getPaginationParams({ limit: '5000' }).limit).toBe(100);
    });

    it('vraagt minstens één resultaat op', () => {
      expect(getPaginationParams({ limit: '0' }).limit).toBe(25);
      expect(getPaginationParams({ limit: '-10' }).limit).toBe(1);
    });

    it('valt bij een ongeldig of negatief paginanummer terug op de eerste pagina', () => {
      expect(getPaginationParams({ page: '0' }).page).toBe(1);
      expect(getPaginationParams({ page: '-5' }).page).toBe(1);
      expect(getPaginationParams({ page: 'abc' }).page).toBe(1);
    });
  });

  describe('createPaginatedResult', () => {
    it('rekent het aantal pagina’s naar boven af', () => {
      expect(createPaginatedResult([], 21, 1, 10).pagination.totalPages).toBe(3);
    });

    it('meldt of er een volgende en vorige pagina is', () => {
      expect(createPaginatedResult([], 30, 1, 10).pagination).toMatchObject({ hasNext: true, hasPrev: false });
      expect(createPaginatedResult([], 30, 2, 10).pagination).toMatchObject({ hasNext: true, hasPrev: true });
      expect(createPaginatedResult([], 30, 3, 10).pagination).toMatchObject({ hasNext: false, hasPrev: true });
    });

    it('meldt bij een leeg resultaat geen volgende pagina', () => {
      expect(createPaginatedResult([], 0, 1, 25).pagination).toMatchObject({
        totalPages: 0,
        hasNext: false,
        hasPrev: false,
      });
    });

    it('geeft de gegevens ongewijzigd door', () => {
      const gegevens = [{ id: 'a' }, { id: 'b' }];
      expect(createPaginatedResult(gegevens, 2, 1, 25).data).toBe(gegevens);
    });
  });

  describe('softDelete en restore', () => {
    it('markeert een rij als verwijderd en zet dat weer terug', () => {
      const id = maakLijst(orkestId, 'Tijdelijk');
      softDelete('music_lists', id);
      expect(isVerwijderd(id)).toBe(true);
      restore('music_lists', id);
      expect(isVerwijderd(id)).toBe(false);
    });

    it('verwijdert de rij niet echt', () => {
      const id = maakLijst(orkestId, 'Blijft bestaan');
      softDelete('music_lists', id);
      expect(lijstNaam(id)).toBe('Blijft bestaan');
    });

    it('weigert een tabelnaam die niet op de lijst staat', () => {
      // De tabelnaam wordt in de query geplakt, dus de witte lijst is de
      // enige bescherming tegen SQL-injectie.
      expect(() => softDelete('user_sessions', 'id')).toThrow(/Invalid table name/);
      expect(() => restore('user_sessions', 'id')).toThrow(/Invalid table name/);
      expect(() => softDelete('users; DROP TABLE users', 'id')).toThrow(/Invalid table name/);
    });

    it('staat alleen tabellen toe die een deleted_at-kolom hebben', () => {
      // Een tabel op de lijst zonder die kolom zou pas bij aanroep stukgaan.
      for (const tabel of ['users', 'music_lists', 'music_pieces', 'music_titles', 'concerts']) {
        expect(() => softDelete(tabel, 'bestaat-niet')).not.toThrow();
      }
      // orchestras heeft geen deleted_at en hoort dus niet op de lijst.
      expect(() => softDelete('orchestras', 'bestaat-niet')).toThrow(/Invalid table name/);
    });
  });

  describe('excludeDeleted', () => {
    it('geeft een voorwaarde zonder alias', () => {
      expect(excludeDeleted()).toBe('deleted_at IS NULL');
    });

    it('zet de alias voor de kolomnaam', () => {
      expect(excludeDeleted('u')).toBe('u.deleted_at IS NULL');
    });
  });
});
