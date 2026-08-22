/**
 * Tests voor het omzetten van de taalkeuze naar een Intl-locale.
 *
 * i18next werkt met een taalcode ('nl'), Intl met een volledige locale
 * ('nl-NL'). Die twee door elkaar halen levert geen foutmelding op maar wel
 * verkeerde datums en bedragen: 'en' alleen laat Intl naar Amerikaans gedrag
 * grijpen, en dan staat er 8/22/2026 en $1,234.56 waar 22-8-2026 en € 1.234,56
 * hoort te staan. Zulke fouten vallen pas op als iemand een verkeerde
 * repetitiedatum in zijn agenda zet.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

/** De taal die i18next zegt te gebruiken; per test in te stellen. */
const nepI18n = vi.hoisted(() => ({ language: 'nl' as string | undefined }));
vi.mock('../../i18n', () => ({ default: nepI18n }));

import { currentLocale } from '../locale';

beforeEach(() => {
  nepI18n.language = 'nl';
});

describe('currentLocale', () => {
  it('geeft de volledige locale bij de drie ondersteunde talen', () => {
    nepI18n.language = 'nl';
    expect(currentLocale()).toBe('nl-NL');

    nepI18n.language = 'en';
    expect(currentLocale()).toBe('en-GB');

    nepI18n.language = 'de';
    expect(currentLocale()).toBe('de-DE');
  });

  it('kiest voor Engels de Britse variant', () => {
    // Bewust en-GB en niet en-US: dag-maand-jaar en het metrieke stelsel
    // sluiten aan bij wat een Nederlandse vereniging verwacht.
    nepI18n.language = 'en';
    const datum = new Intl.DateTimeFormat(currentLocale()).format(new Date('2026-08-22T12:00:00Z'));
    expect(datum).toBe('22/08/2026');
  });

  it('negeert het land achter de taal', () => {
    // De browser levert vaak 'nl-BE' of 'de-AT'. Dat is dezelfde taal, dus de
    // app hoort dezelfde locale te kiezen in plaats van terug te vallen.
    nepI18n.language = 'nl-BE';
    expect(currentLocale()).toBe('nl-NL');

    nepI18n.language = 'de-AT';
    expect(currentLocale()).toBe('de-DE');

    nepI18n.language = 'en-US';
    expect(currentLocale()).toBe('en-GB');
  });

  it('valt terug op Nederlands bij een taal die de app niet kent', () => {
    // VASTGELEGD GEDRAG: de terugval hier is nl-NL, terwijl i18next zelf op
    // 'en' terugvalt voor de teksten. Een Franstalige bezoeker krijgt dus
    // Engelse teksten met Nederlandse datums en bedragen.
    nepI18n.language = 'fr';
    expect(currentLocale()).toBe('nl-NL');

    nepI18n.language = 'zh-Hans';
    expect(currentLocale()).toBe('nl-NL');
  });

  it('valt terug op Nederlands als er nog geen taal bekend is', () => {
    // Bij de allereerste render is i18next soms nog niet klaar met opstarten.
    nepI18n.language = '';
    expect(currentLocale()).toBe('nl-NL');

    nepI18n.language = undefined;
    expect(currentLocale()).toBe('nl-NL');
  });

  it('levert altijd een locale die Intl aankan', () => {
    // Een lege of onzinnige locale laat Intl gooien, en dat gebeurt dan midden
    // in het renderen van een lijst met datums.
    for (const taal of ['nl', 'en', 'de', 'fr', '', 'nl-BE', 'onzin']) {
      nepI18n.language = taal;
      expect(() => new Intl.DateTimeFormat(currentLocale()).format(new Date()), taal).not.toThrow();
    }
  });

  it('leest de taal bij elke aanroep opnieuw', () => {
    // De gebruiker kan de taal midden in een sessie wisselen; een locale die
    // bij het laden van de module is vastgelegd, verandert dan niet mee.
    nepI18n.language = 'nl';
    expect(currentLocale()).toBe('nl-NL');

    nepI18n.language = 'de';
    expect(currentLocale()).toBe('de-DE');
  });
});
