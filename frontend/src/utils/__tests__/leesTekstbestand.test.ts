/**
 * Een CSV-bestand uit een spreadsheet inlezen: UTF-8 als het dat is, anders
 * Windows-1252, zoals Excel op Windows het opslaat.
 */

import { describe, it, expect } from 'vitest';
import { leesTekstbestand } from '../leesTekstbestand';

describe('een tekstbestand inlezen', () => {
  it('leest UTF-8', async () => {
    const bestand = new Blob([new TextEncoder().encode('Achternaam\nMühlenberg\n')]);
    expect(await leesTekstbestand(bestand)).toBe('Achternaam\nMühlenberg\n');
  });

  it('leest wat Excel op Windows opslaat, in Windows-1252', async () => {
    // "Mühlenberg; Beyoncé" in Windows-1252: ü is 0xFC, é is 0xE9. Als UTF-8
    // gelezen zouden dat twee vervangingstekens worden.
    const bytes = Uint8Array.from([
      0x4d, 0xfc, 0x68, 0x6c, 0x65, 0x6e, 0x62, 0x65, 0x72, 0x67, 0x3b, 0x42, 0x65, 0x79, 0x6f, 0x6e, 0x63, 0xe9,
    ]);
    expect(await leesTekstbestand(new Blob([bytes]))).toBe('Mühlenberg;Beyoncé');
  });
});
