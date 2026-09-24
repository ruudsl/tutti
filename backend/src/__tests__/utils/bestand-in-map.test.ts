/**
 * bestandInMap: van een pad telt alleen de bestandsnaam, en het resultaat ligt
 * altijd in de opgegeven map.
 */

import { describe, it, expect } from 'vitest';
import path from 'path';
import { bestandInMap } from '../../utils/bestandInMap';

const map = path.resolve('/srv/uploads/logos');

describe('bestandInMap', () => {
  it('geeft het bestand in de map', () => {
    expect(bestandInMap(map, 'logo-1.upload')).toBe(path.join(map, 'logo-1.upload'));
  });

  it('neemt van een volledig pad alleen de bestandsnaam', () => {
    expect(bestandInMap(map, '/ergens/anders/logo-1.upload')).toBe(path.join(map, 'logo-1.upload'));
  });

  it('laat zich niet uit de map sturen', () => {
    expect(bestandInMap(map, '../../../etc/passwd')).toBe(path.join(map, 'passwd'));
  });

  it('weigert een naam die de map zelf of erboven aanwijst', () => {
    expect(() => bestandInMap(map, '..')).toThrow('Ongeldig bestand.');
    expect(() => bestandInMap(map, '')).toThrow('Ongeldig bestand.');
  });
});
