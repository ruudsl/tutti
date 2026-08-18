/**
 * Vertaalsleutels moeten tekst opleveren, niet een heel blok.
 *
 * In de vertaalbestanden is een sleutel ofwel een tekst, ofwel een groep met
 * meer sleutels erin. Roept de code t('resources.categories') aan terwijl dat
 * een groep is, dan krijgt de gebruiker geen label maar een waarschuwing in de
 * console en een leeg vlak op het scherm:
 *
 *   key 'resources.categories (nl)' returned an object instead of string
 *
 * Zo stond het op de middelenpagina en op het tabblad van projecten. De
 * meegegeven terugvalwaarde helpt daar niet: die geldt alleen als de sleutel
 * helemaal niet bestaat, niet als hij bestaat maar het verkeerde type heeft.
 *
 * Deze test loopt alle t()-aanroepen in de broncode langs en legt ze naast de
 * Nederlandse vertalingen, want dat is de volledigste taal.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import nl from '../nl.json';
import en from '../en.json';
import de from '../de.json';

const srcDir = path.join(__dirname, '../..');

/** Alle .ts- en .tsx-bestanden onder src, behalve de tests zelf. */
function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      found.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(entry.name)) {
      found.push(full);
    }
  }
  return found;
}

/** De waarde achter een sleutel als 'resources.categories.label', of undefined. */
function resolve(translations: unknown, key: string): unknown {
  let current: unknown = translations;
  for (const part of key.split('.')) {
    if (typeof current !== 'object' || current === null || !(part in current)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/** Elke t('sleutel')-aanroep in de broncode, met bestand en regelnummer. */
function translationCalls(): { file: string; line: number; key: string }[] {
  const calls: { file: string; line: number; key: string }[] = [];
  for (const file of sourceFiles(srcDir)) {
    const source = fs.readFileSync(file, 'utf-8');
    for (const match of source.matchAll(/\bt\(\s*'([a-zA-Z][\w.]*)'\s*[,)]/g)) {
      calls.push({
        file: path.relative(srcDir, file),
        line: source.slice(0, match.index).split('\n').length,
        key: match[1],
      });
    }
  }
  return calls;
}

const calls = translationCalls();

describe('vertaalsleutels in de broncode', () => {
  it('vindt aanroepen om te controleren', () => {
    expect(calls.length).toBeGreaterThan(100);
  });

  it('levert nergens een groep op in plaats van tekst', () => {
    const problems = calls
      .filter(({ key }) => {
        const value = resolve(nl, key);
        return typeof value === 'object' && value !== null;
      })
      .map(({ file, line, key }) => `${file}:${line} gebruikt '${key}', maar dat is een groep sleutels`);

    expect(problems).toEqual([]);
  });
});

describe('de drie talen kennen dezelfde sleutels', () => {
  /** Alle volledige paden naar teksten, plat. */
  function leafKeys(obj: unknown, prefix = ''): string[] {
    if (typeof obj !== 'object' || obj === null) return [prefix];
    return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
      leafKeys(v, prefix ? `${prefix}.${k}` : k),
    );
  }

  const dutch = new Set(leafKeys(nl));

  it.each([
    ['en', en],
    ['de', de],
  ])('heeft in %s geen sleutel die het Nederlands niet kent', (_lang, translations) => {
    // Andersom mag wel: het Nederlands loopt voor. Een sleutel die alleen in
    // een vertaling bestaat, is bijna altijd een tikfout.
    const extra = leafKeys(translations).filter((k) => !dutch.has(k));

    expect(extra).toEqual([]);
  });
});
