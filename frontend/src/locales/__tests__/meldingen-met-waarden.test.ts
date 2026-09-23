/**
 * Meldingen die een waarde meekrijgen: welke poster, welke setlist, hoeveel
 * minuten. Tot september 2026 zetten deze aanroepen hun tekst zelf in elkaar
 * met een Nederlandse sjabloonstring, en zag een Engelse of Duitse gebruiker
 * die Nederlandse zin. Hier staat vast dat elke taal de waarde echt invult en
 * dat "1 minuut" geen "1 minuten" is.
 */

import { describe, it, expect } from 'vitest';
import { createInstance } from 'i18next';
import type { TFunction } from 'i18next';
import nl from '../nl.json';
import en from '../en.json';
import de from '../de.json';

function vertaler(taal: 'nl' | 'en' | 'de'): TFunction {
  const instantie = createInstance();
  void instantie.init({
    lng: taal,
    fallbackLng: false,
    resources: { nl: { translation: nl }, en: { translation: en }, de: { translation: de } },
    interpolation: { escapeValue: false },
  });
  return instantie.t;
}

describe('meldingen met een waarde erin', () => {
  it.each([
    ['nl', 'Oefensessie van 1 minuut beëindigd!', 'Oefensessie van 42 minuten beëindigd!'],
    ['en', 'Practice session of 1 minute ended!', 'Practice session of 42 minutes ended!'],
    ['de', 'Übungssitzung von 1 Minute beendet!', 'Übungssitzung von 42 Minuten beendet!'],
  ] as const)('%s: telt de minuten in enkel- en meervoud', (taal, een, veel) => {
    const t = vertaler(taal);
    expect(t('practice.timerSessionEnded', { count: 1 })).toBe(een);
    expect(t('practice.timerSessionEnded', { count: 42 })).toBe(veel);
  });

  it.each(['nl', 'en', 'de'] as const)('%s: noemt de poster en de setlist bij naam', (taal) => {
    const t = vertaler(taal);

    const poster = t('concerts.posterDownloaded', { title: 'Nieuwjaarsconcert', format: 'PDF' });
    expect(poster).toContain('Nieuwjaarsconcert');
    expect(poster).toContain('PDF');
    expect(poster).not.toContain('{{');

    const setlist = t('concerts.setlistSaved', { name: 'Voorjaar' });
    expect(setlist).toContain('Voorjaar');
    expect(setlist).not.toContain('{{');
  });
});
