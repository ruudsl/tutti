/**
 * Na het inloggen terug naar de pagina die erom vroeg - maar alleen binnen
 * Tutti. Een pad als `//elders.example` is voor de browser een ander domein.
 */

import { describe, it, expect } from 'vitest';
import { terugNaInloggen } from '../terugNaInloggen';

describe('terugNaInloggen', () => {
  it('gaat terug naar een pad binnen Tutti', () => {
    expect(terugNaInloggen({ terug: '/share-target' })).toBe('/share-target');
  });

  it('valt terug op de startpagina zonder of met een onbruikbare staat', () => {
    expect(terugNaInloggen(null)).toBe('/');
    expect(terugNaInloggen(undefined)).toBe('/');
    expect(terugNaInloggen({ terug: 42 })).toBe('/');
    expect(terugNaInloggen({ terug: 'share-target' })).toBe('/');
  });

  it('stuurt nooit naar een ander domein', () => {
    expect(terugNaInloggen({ terug: '//elders.example/pad' })).toBe('/');
    expect(terugNaInloggen({ terug: '/\\elders.example' })).toBe('/');
    expect(terugNaInloggen({ terug: 'https://elders.example' })).toBe('/');
  });
});
