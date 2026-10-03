/**
 * Migratie 20261002200000: tweestap_verplicht.
 *
 * Voegt `associations.tweestap_verplicht` toe met standaard `uit`, zodat er
 * voor een bestaande vereniging niets verandert. Alleen `uit`, `beheer` en
 * `iedereen` zijn toegestaan. `down` haalt de kolom weer weg.
 */

import { describe, it, expect } from 'vitest';
import '../setup';
import db from '../../database/connection';
import * as migratie from '../../migrations/20261002200000_tweestap_verplicht';
import { createTestAssociation } from '../testUtils';

const kolommen = () => (db.prepare('PRAGMA table_info(associations)').all() as { name: string }[]).map((k) => k.name);

describe('migratie tweestap_verplicht', () => {
  it('haalt de kolom met down weg en zet hem met up terug, met uit voor bestaande verenigingen', () => {
    const vereniging = createTestAssociation();

    migratie.down();
    expect(kolommen()).not.toContain('tweestap_verplicht');

    migratie.up();
    expect(kolommen()).toContain('tweestap_verplicht');
    expect(db.prepare('SELECT tweestap_verplicht FROM associations WHERE id = ?').get(vereniging.id)).toEqual({
      tweestap_verplicht: 'uit',
    });
  });

  it('is herhaalbaar', () => {
    migratie.up();
    migratie.up();
    expect(kolommen().filter((k) => k === 'tweestap_verplicht')).toHaveLength(1);
  });

  it('weigert een waarde buiten uit, beheer en iedereen', () => {
    const vereniging = createTestAssociation();

    expect(() =>
      db.prepare("UPDATE associations SET tweestap_verplicht = 'soms' WHERE id = ?").run(vereniging.id),
    ).toThrow(/CHECK constraint failed/);
  });
});
