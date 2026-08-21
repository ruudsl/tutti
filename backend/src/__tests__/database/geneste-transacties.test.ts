/**
 * Een transactie binnen een transactie.
 *
 * db.transaction() deed een kale BEGIN, zonder te weten of er al een
 * transactie liep. SQLite weigert dat met "cannot start a transaction within a
 * transaction" - maar het echte probleem zat in wat er daarna gebeurde: de
 * ROLLBACK in de catch draaide de BUITENSTE transactie terug, waarna die op
 * zijn beurt stukliep op "cannot rollback - no transaction is active". Al het
 * werk van de buitenste transactie was weg, met een 500 en zonder bruikbare
 * melding.
 *
 * Dat was geen theoretisch geval. findOrCreateOrchestras() in
 * routes/entra-sync.ts opende zelf een transactie en wordt uitsluitend
 * aangeroepen van binnen de withTransaction() van de import- en sync-routes.
 * Gevolg: het importeren vanuit Entra ID gaf 500 en importeerde nul
 * gebruikers zodra ook maar een geselecteerde persoon een afdeling ingevuld
 * had - de normale situatie, want de afdeling is juist waar de orkestindeling
 * vandaan komt.
 *
 * De wrapper gebruikt binnen een lopende transactie nu een savepoint. Die doet
 * daar wat een transactie erbuiten doet, en kan wel genest worden.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import '../setup';
import db from '../../database/connection';
import { withTransaction } from '../../utils/database';
import { createTestAssociation } from '../testUtils';

describe('geneste transacties', () => {
  let verenigingId: string;

  beforeEach(() => {
    verenigingId = createTestAssociation({ name: 'Test' }).id;
  });

  const aantalOrkesten = () =>
    (
      db.prepare('SELECT COUNT(*) as aantal FROM orchestras WHERE association_id = ?').get(verenigingId) as {
        aantal: number;
      }
    ).aantal;

  it('laat een transactie binnen een transactie gewoon slagen', () => {
    withTransaction(() => {
      db.prepare('INSERT INTO orchestras (id, name, association_id) VALUES (?, ?, ?)').run(
        'orkest-buiten',
        'Buitenste',
        verenigingId,
      );

      db.transaction(() => {
        db.prepare('INSERT INTO orchestras (id, name, association_id) VALUES (?, ?, ?)').run(
          'orkest-binnen',
          'Binnenste',
          verenigingId,
        );
      })();
    });

    expect(aantalOrkesten()).toBe(2);
  });

  it('laat het werk van de buitenste transactie staan', () => {
    // Dit was de kern van de fout: de binnenste ROLLBACK sloopte de buitenste.
    withTransaction(() => {
      db.prepare('INSERT INTO orchestras (id, name, association_id) VALUES (?, ?, ?)').run(
        'orkest-buiten',
        'Buitenste',
        verenigingId,
      );
      db.transaction(() => {
        db.prepare('INSERT INTO orchestras (id, name, association_id) VALUES (?, ?, ?)').run(
          'orkest-binnen',
          'Binnenste',
          verenigingId,
        );
      })();
    });

    const namen = (
      db.prepare('SELECT name FROM orchestras WHERE association_id = ? ORDER BY name').all(verenigingId) as {
        name: string;
      }[]
    ).map((r) => r.name);
    expect(namen).toEqual(['Binnenste', 'Buitenste']);
  });

  it('draait bij een fout binnenin alleen het binnenste terug', () => {
    withTransaction(() => {
      db.prepare('INSERT INTO orchestras (id, name, association_id) VALUES (?, ?, ?)').run(
        'orkest-buiten',
        'Buitenste',
        verenigingId,
      );

      try {
        db.transaction(() => {
          db.prepare('INSERT INTO orchestras (id, name, association_id) VALUES (?, ?, ?)').run(
            'orkest-binnen',
            'Binnenste',
            verenigingId,
          );
          throw new Error('iets gaat mis');
        })();
      } catch {
        // De buitenste transactie loopt door.
      }
    });

    const namen = (
      db.prepare('SELECT name FROM orchestras WHERE association_id = ?').all(verenigingId) as { name: string }[]
    ).map((r) => r.name);
    expect(namen).toEqual(['Buitenste']);
  });

  it('werkt nog steeds gewoon zonder omhullende transactie', () => {
    db.transaction(() => {
      db.prepare('INSERT INTO orchestras (id, name, association_id) VALUES (?, ?, ?)').run(
        'orkest-los',
        'Los',
        verenigingId,
      );
    })();

    expect(aantalOrkesten()).toBe(1);
  });

  it('draait een losse transactie bij een fout wel helemaal terug', () => {
    expect(() =>
      db.transaction(() => {
        db.prepare('INSERT INTO orchestras (id, name, association_id) VALUES (?, ?, ?)').run(
          'orkest-los',
          'Los',
          verenigingId,
        );
        throw new Error('iets gaat mis');
      })(),
    ).toThrow('iets gaat mis');

    expect(aantalOrkesten()).toBe(0);
  });

  it('kan meer dan een niveau diep', () => {
    withTransaction(() => {
      db.transaction(() => {
        db.transaction(() => {
          db.prepare('INSERT INTO orchestras (id, name, association_id) VALUES (?, ?, ?)').run(
            'orkest-diep',
            'Diep',
            verenigingId,
          );
        })();
      })();
    });

    expect(aantalOrkesten()).toBe(1);
  });
});
