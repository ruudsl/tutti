/**
 * Een geüpload bestand mag nooit buiten de uploadmap terechtkomen.
 *
 * CodeQL meldt op dertien plekken "uncontrolled data used in path expression",
 * telkens op req.file.path. Dat pad is niet vrij te kiezen: elke multer-opzet
 * verzint zelf een naam uit een uuid plus path.extname() van de aangeleverde
 * naam, en extname levert nooit een schuine streep op. De meldingen zijn dus
 * vals alarm — maar alleen zolang dat zo blijft.
 *
 * Deze test kijkt de bron na op een multer-opzet die de aangeleverde naam
 * rechtstreeks doorgeeft. Gebeurt dat ooit, dan wordt het wel echt.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const BRON = path.join(__dirname, '../..');

function bronbestanden(map: string): string[] {
  const uit: string[] = [];
  for (const naam of fs.readdirSync(map)) {
    const vol = path.join(map, naam);
    if (fs.statSync(vol).isDirectory()) {
      if (naam === '__tests__' || naam === 'node_modules') continue;
      uit.push(...bronbestanden(vol));
    } else if (naam.endsWith('.ts')) {
      uit.push(vol);
    }
  }
  return uit;
}

/** Alle filename-callbacks uit multer-opzetten, met hun inhoud. */
function bestandsnaamCallbacks(): Array<{ bestand: string; regel: number; inhoud: string }> {
  const gevonden: Array<{ bestand: string; regel: number; inhoud: string }> = [];

  for (const bestand of bronbestanden(BRON)) {
    const inhoud = fs.readFileSync(bestand, 'utf-8');
    for (const m of inhoud.matchAll(/filename:\s*\([^)]*\)\s*=>\s*\{([\s\S]*?)\n\s{2}\}/g)) {
      gevonden.push({
        bestand: path.relative(BRON, bestand),
        regel: inhoud.slice(0, m.index ?? 0).split('\n').length,
        inhoud: m[1],
      });
    }
  }
  return gevonden;
}

describe('namen van geüploade bestanden', () => {
  const callbacks = bestandsnaamCallbacks();

  it('vindt de multer-opzetten die er zijn', () => {
    // Zonder deze ondergrens zou de test stilletjes niets meer controleren als
    // het uitpakken van de bron ooit stukgaat.
    expect(callbacks.length).toBeGreaterThanOrEqual(4);
  });

  it('geeft de aangeleverde naam nooit rechtstreeks door', () => {
    const problemen = callbacks
      .filter(({ inhoud }) => /cb\(\s*null\s*,\s*[^)]*file\.originalname/.test(inhoud))
      .map(({ bestand, regel }) => `${bestand}:${regel}`);

    expect(problemen).toEqual([]);
  });

  it('verzint zelf een naam met een uuid of een tijdstempel erin', () => {
    const problemen = callbacks
      .filter(({ inhoud }) => !/uuidv4\(\)|Date\.now\(\)|randomUUID/.test(inhoud))
      .map(({ bestand, regel }) => `${bestand}:${regel}`);

    expect(problemen).toEqual([]);
  });

  it('neemt hooguit de extensie over, en die kan geen mapnaam bevatten', () => {
    // path.extname kijkt alleen naar het laatste stuk na de laatste schuine
    // streep, dus het resultaat bevat er zelf nooit een.
    for (const vijandig of [
      '../../etc/passwd',
      'mars.pdf/../../etc/passwd',
      '..%2f..%2fetc%2fpasswd',
      'mars..pdf',
      '.pdf',
      'zonder-extensie',
    ]) {
      expect(path.extname(vijandig), vijandig).not.toContain('/');
      expect(path.extname(vijandig), vijandig).not.toContain('\\');
    }
  });
});
