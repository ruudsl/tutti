/**
 * Migratie 20261002220000: kortingscode bij bestelling.
 *
 * Geeft ticket_orders de kolommen discount_code_id en discount_amount, en
 * maakt het gebruik uniek per bestelling. `down` haalt alles weer weg.
 */

import { describe, it, expect } from 'vitest';
import '../setup';
import db from '../../database/connection';
import * as migratie from '../../migrations/20261002220000_kortingscode_bij_bestelling';

const kolommen = () => (db.prepare('PRAGMA table_info(ticket_orders)').all() as { name: string }[]).map((k) => k.name);
const heeftIndex = () =>
  !!db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'idx_discount_code_usage_bestelling'").get();

describe('migratie kortingscode bij bestelling', () => {
  it('haalt kolommen en index met down weg en zet ze met up terug', () => {
    migratie.down();
    expect(kolommen()).not.toContain('discount_code_id');
    expect(kolommen()).not.toContain('discount_amount');
    expect(heeftIndex()).toBe(false);

    migratie.up();
    expect(kolommen()).toEqual(expect.arrayContaining(['discount_code_id', 'discount_amount']));
    expect(heeftIndex()).toBe(true);
  });

  it('is herhaalbaar', () => {
    migratie.up();
    migratie.up();
    expect(kolommen().filter((k) => k === 'discount_amount')).toHaveLength(1);
  });
});
