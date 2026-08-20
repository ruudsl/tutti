/**
 * De migratie die elke vereniging een slug geeft.
 *
 * De kolom bestond al, maar werd alleen gevuld als een super-admin de
 * vereniging via het beheerscherm aanmaakte. De vereniging die bij de eerste
 * start ontstaat had er geen, en dus ook geen inloglink om te delen.
 *
 * Deze tests draaien de migratie tegen een database met gegevens erin - de
 * enige manier om te zien of hij doet wat hij belooft en niets kapotmaakt.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import { up } from '../../migrations/20260820000006_slug_voor_elke_vereniging';

describe('migratie: slug voor elke vereniging', () => {
  beforeEach(() => {
    db.prepare('DELETE FROM associations').run();
  });

  function maakVereniging(naam: string, slug: string | null = null): string {
    const id = uuidv4();
    db.prepare('INSERT INTO associations (id, name, slug) VALUES (?, ?, ?)').run(id, naam, slug);
    return id;
  }

  const slugVan = (id: string) =>
    (db.prepare('SELECT slug FROM associations WHERE id = ?').get(id) as { slug: string | null }).slug;

  it('vult een slug voor een vereniging die er geen had', () => {
    const id = maakVereniging('Harmonie Sint Cecilia');
    up();
    expect(slugVan(id)).toBe('harmonie-sint-cecilia');
  });

  it('laat een bestaande slug staan', () => {
    const id = maakVereniging('Harmonie Sint Cecilia', 'eigen-keuze');
    up();
    expect(slugVan(id)).toBe('eigen-keuze');
  });

  it('vult ook een slug die leeg is in plaats van NULL', () => {
    const id = maakVereniging('Fanfare De Eendracht', '   ');
    up();
    expect(slugVan(id)).toBe('fanfare-de-eendracht');
  });

  it('geeft twee namen die dezelfde slug opleveren elk een eigen slug', () => {
    const eerste = maakVereniging('Harmonie St. Cecilia');
    const tweede = maakVereniging('Harmonie St Cecilia');
    up();

    const slugs = [slugVan(eerste), slugVan(tweede)];
    expect(new Set(slugs).size).toBe(2);
    expect(slugs).toContain('harmonie-st-cecilia');
  });

  it('botst niet met een slug die al vergeven was', () => {
    const bestaand = maakVereniging('Iets anders', 'harmonie-de-brug');
    const nieuw = maakVereniging('Harmonie De Brug');
    up();

    expect(slugVan(bestaand)).toBe('harmonie-de-brug');
    expect(slugVan(nieuw)).not.toBe('harmonie-de-brug');
    expect(slugVan(nieuw)).toMatch(/^harmonie-de-brug-\d+$/);
  });

  it('valt terug op een bruikbare slug bij een naam zonder letters of cijfers', () => {
    const id = maakVereniging('!!! ???');
    up();
    expect(slugVan(id)).toBe('vereniging');
  });

  it('raakt de overige gegevens van een vereniging niet aan', () => {
    const id = maakVereniging('Harmonie Sint Cecilia');
    db.prepare('UPDATE associations SET display_name = ?, logo_path = ? WHERE id = ?').run(
      'Sint Cecilia',
      '/logos/cecilia.png',
      id,
    );

    up();

    const rij = db.prepare('SELECT display_name, logo_path FROM associations WHERE id = ?').get(id) as {
      display_name: string;
      logo_path: string;
    };
    expect(rij.display_name).toBe('Sint Cecilia');
    expect(rij.logo_path).toBe('/logos/cecilia.png');
  });

  it('doet niets als elke vereniging al een slug heeft', () => {
    const id = maakVereniging('Harmonie Sint Cecilia', 'cecilia');
    up();
    up();
    expect(slugVan(id)).toBe('cecilia');
  });
});
