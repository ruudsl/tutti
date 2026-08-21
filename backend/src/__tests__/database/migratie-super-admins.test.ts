/**
 * De migratie die te ruim uitgedeelde super-admin-rechten terugneemt.
 *
 * Twee eerdere migraties zetten elke gebruiker met role = 'admin' in
 * super_admins - een query zonder verenigingsfilter. Daarmee werd elke
 * verenigingsbeheerder beheerder van de hele installatie: alle verenigingen
 * inzien en wijzigen, abonnementen aanpassen, verenigingen verwijderen, en via
 * switch-association elke vereniging binnenstappen.
 *
 * Deze tests draaien de migratie tegen een database met gegevens erin. Het
 * lastige geval staat onderaan: de tabel mag nooit leeg achterblijven, want
 * een installatie zonder super-admin is niet meer te beheren.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import { up } from '../../migrations/20260821000001_super_admins_opschonen';

function maakVereniging(naam: string): string {
  const id = uuidv4();
  db.prepare('INSERT INTO associations (id, name) VALUES (?, ?)').run(id, naam);
  return id;
}

function maakGebruiker(associationId: string, email: string, role = 'admin'): string {
  const id = uuidv4();
  db.prepare(
    'INSERT INTO users (id, email, password_hash, first_name, last_name, role, association_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(id, email, 'x', 'Voor', 'Achter', role, associationId);
  return id;
}

/** Zoals de oude migraties het deden: id met het voorvoegsel `super-`. */
function geseedeSuperAdmin(userId: string): string {
  const id = `super-${userId}`;
  db.prepare(`INSERT INTO super_admins (id, user_id, permissions) VALUES (?, ?, '["all"]')`).run(id, userId);
  return id;
}

/** Zoals init.ts en de API het doen: een uuid. */
function bedoeldeSuperAdmin(userId: string): string {
  const id = uuidv4();
  db.prepare(`INSERT INTO super_admins (id, user_id, permissions) VALUES (?, ?, '["all"]')`).run(id, userId);
  return id;
}

const superAdminIds = () =>
  (db.prepare('SELECT id FROM super_admins ORDER BY id').all() as { id: string }[]).map((r) => r.id);

describe('migratie: te ruime super-admin-rechten terugnemen', () => {
  beforeEach(() => {
    db.prepare('DELETE FROM super_admins').run();
    db.prepare('DELETE FROM users').run();
    db.prepare('DELETE FROM associations').run();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('haalt de beheerders weg die de oude migratie erbij zette', () => {
    const platform = maakVereniging('Platform');
    const echte = maakGebruiker(platform, 'admin@harmonie.nl');
    const bedoeld = bedoeldeSuperAdmin(echte);

    const anderen = maakVereniging('Fanfare De Eendracht');
    geseedeSuperAdmin(maakGebruiker(anderen, 'beheerder@eendracht.nl'));
    geseedeSuperAdmin(maakGebruiker(maakVereniging('Harmonie Sint Cecilia'), 'beheerder@cecilia.nl'));

    up();

    expect(superAdminIds()).toEqual([bedoeld]);
  });

  it('laat expliciet toegekende rechten met rust', () => {
    // Een super-admin die via de API of MAKE_SUPER_ADMIN is toegevoegd krijgt
    // een uuid. Alleen aan dat verschil is te zien wat de migratie erbij zette.
    const vereniging = maakVereniging('Platform');
    const a = bedoeldeSuperAdmin(maakGebruiker(vereniging, 'een@test.nl'));
    const b = bedoeldeSuperAdmin(maakGebruiker(vereniging, 'twee@test.nl'));

    up();

    expect(superAdminIds().sort()).toEqual([a, b].sort());
  });

  it('laat de tabel nooit leeg achter en houdt de platformbeheerder aan', () => {
    // Zonder deze uitzondering is een bestaande installatie na de migratie niet
    // meer te beheren: geen enkele route achter requireSuperAdmin komt dan nog
    // open, ook niet om iemand opnieuw te promoveren.
    const platform = maakVereniging('Platform');
    const platformbeheerder = geseedeSuperAdmin(maakGebruiker(platform, 'admin@harmonie.nl'));
    geseedeSuperAdmin(maakGebruiker(maakVereniging('Fanfare'), 'beheerder@fanfare.nl'));

    up();

    expect(superAdminIds()).toEqual([platformbeheerder]);
  });

  it('houdt er een aan als admin@harmonie.nl niet bestaat', () => {
    const eerste = geseedeSuperAdmin(maakGebruiker(maakVereniging('Fanfare'), 'beheerder@fanfare.nl'));

    up();

    expect(superAdminIds()).toEqual([eerste]);
  });

  it('doet niets als er niets te doen is', () => {
    up();
    expect(superAdminIds()).toEqual([]);
  });
});
