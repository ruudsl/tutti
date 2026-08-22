/**
 * De negen validatiemeldingen die in geen van de drie talen stonden.
 *
 * `createI18nErrorMap` in `src/lib/validation/utils.ts` vraagt om zestien
 * sleutels onder `errors.`. Negen daarvan - invalidType, invalidUrl,
 * invalidUuid, invalidFormat, invalidSelection, minValue, maxValue, minItems en
 * maxItems - bestonden nergens. Elke aanroep geeft een Engelse zin als
 * terugvalwaarde mee, dus er stond altijd íets leesbaars onder het veld en er
 * werd nooit iets rood. Alleen: een Nederlands of Duits lid dat één instrument
 * te weinig aanvinkte kreeg "At least 2 items required" te lezen, midden in een
 * verder Nederlands formulier.
 *
 * `translations.test.ts` bewaakt sinds diezelfde ronde dat de sleutels
 * bestáán. Dit bestand controleert het andere deel: dat er ook echt Nederlands
 * en Duits uit komt, met het juiste getal erin. Het gaat door de echte
 * foutkaart en de echte vertaalbestanden heen, zonder mock ertussen - dat is
 * het enige wat bewijst dat de keten van Zod-foutcode tot zin op het scherm
 * klopt.
 *
 * De verwachte zinnen staan hieronder voluit. Dat is met opzet: een test die de
 * verwachting uit hetzelfde JSON-bestand haalt dat hij controleert, bewijst
 * niets. Wordt een formulering herzien, dan hoort deze test mee te veranderen.
 */

import { describe, it, expect } from 'vitest';
import { createInstance } from 'i18next';
import type { TFunction } from 'i18next';
import { z } from 'zod';
import { createI18nErrorMap } from '../../lib/validation/utils';
import nl from '../nl.json';
import en from '../en.json';
import de from '../de.json';

/**
 * Een vertaalfunctie voor één taal, zonder terugval op een andere taal.
 *
 * `fallbackLng: false` is hier de kern van de test. Met de gewone terugval op
 * het Engels zou een ontbrekende Nederlandse sleutel stilletjes de Engelse zin
 * opleveren en zou deze test alsnog groen zijn voor de verkeerde reden.
 */
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

/** De melding die `schema` op `waarde` geeft, vertaald zoals de gebruiker hem ziet. */
function melding(schema: z.ZodType, waarde: unknown, t: TFunction): string | undefined {
  const uitkomst = schema.safeParse(waarde, { error: createI18nErrorMap(t) });
  return uitkomst.success ? undefined : uitkomst.error.issues[0]?.message;
}

/**
 * Per geval: het schema en de waarde die de fout uitlokken, en wat er in elke
 * taal onder het veld hoort te komen. De schema's zijn dezelfde als in
 * `src/lib/validation/__tests__/utils.test.ts`, waar vastligt wélke sleutel
 * elk geval opvraagt.
 */
const gevallen: {
  sleutel: string;
  schema: z.ZodType;
  waarde: unknown;
  nl: string;
  en: string;
  de: string;
}[] = [
  {
    sleutel: 'errors.invalidType',
    schema: z.string(),
    waarde: 42,
    nl: 'Voer een geldige waarde in',
    en: 'Please enter a valid value',
    de: 'Bitte geben Sie einen gültigen Wert ein',
  },
  {
    sleutel: 'errors.invalidUrl',
    schema: z.string().url(),
    waarde: 'geen adres',
    nl: 'Voer een geldig webadres in',
    en: 'Please enter a valid web address',
    de: 'Bitte geben Sie eine gültige Webadresse ein',
  },
  {
    sleutel: 'errors.invalidUuid',
    schema: z.string().uuid(),
    waarde: 'geen id',
    nl: 'Voer een geldig ID in',
    en: 'Please enter a valid ID',
    de: 'Bitte geben Sie eine gültige ID ein',
  },
  {
    sleutel: 'errors.invalidFormat',
    schema: z.string().regex(/^\d+$/),
    waarde: 'abc',
    nl: 'Voer de waarde in de gevraagde opmaak in',
    en: 'Please enter the value in the requested format',
    de: 'Bitte geben Sie den Wert im geforderten Format ein',
  },
  {
    sleutel: 'errors.invalidSelection',
    schema: z.enum(['member', 'admin']),
    waarde: 'voorzitter',
    nl: 'Kies een van de beschikbare opties',
    en: 'Please choose one of the available options',
    de: 'Bitte wählen Sie eine der verfügbaren Optionen',
  },
  {
    sleutel: 'errors.minValue',
    schema: z.number().min(1800),
    waarde: 1799,
    nl: 'Voer een waarde van minimaal 1800 in',
    en: 'Please enter a value of at least 1800',
    de: 'Bitte geben Sie einen Wert von mindestens 1800 ein',
  },
  {
    sleutel: 'errors.maxValue',
    schema: z.number().max(20),
    waarde: 21,
    nl: 'Voer een waarde van maximaal 20 in',
    en: 'Please enter a value of at most 20',
    de: 'Bitte geben Sie einen Wert von höchstens 20 ein',
  },
  {
    sleutel: 'errors.minItems',
    schema: z.array(z.string()).min(2),
    waarde: ['fluit'],
    nl: 'Selecteer minimaal 2 items',
    en: 'Please select at least 2 items',
    de: 'Bitte wählen Sie mindestens 2 Einträge aus',
  },
  {
    sleutel: 'errors.maxItems',
    schema: z.array(z.string()).max(1),
    waarde: ['a', 'b'],
    nl: 'Selecteer maximaal 1 items',
    en: 'Please select at most 1 items',
    de: 'Bitte wählen Sie höchstens 1 Einträge aus',
  },
];

describe('de negen validatiemeldingen bestaan in alle drie de talen', () => {
  it.each(gevallen.map((geval) => [geval.sleutel, geval] as const))('%s', (_sleutel, geval) => {
    expect(melding(geval.schema, geval.waarde, vertaler('nl'))).toBe(geval.nl);
    expect(melding(geval.schema, geval.waarde, vertaler('en'))).toBe(geval.en);
    expect(melding(geval.schema, geval.waarde, vertaler('de'))).toBe(geval.de);
  });

  it('geeft een Nederlands lid geen Engelse zin meer', () => {
    // De kern van het gat: zonder de sleutels viel elke melding hierboven terug
    // op de Engelse standaardtekst die in `utils.ts` is meegegeven, en dat zag
    // er niet uit als een fout. Dus: geen enkele Nederlandse of Duitse melding
    // mag gelijk zijn aan de Engelse.
    for (const geval of gevallen) {
      const engels = melding(geval.schema, geval.waarde, vertaler('en'));
      expect(melding(geval.schema, geval.waarde, vertaler('nl'))).not.toBe(engels);
      expect(melding(geval.schema, geval.waarde, vertaler('de'))).not.toBe(engels);
    }
  });

  it('zet het getal in de melding, en het juiste getal', () => {
    // minValue en minItems delen allebei de foutcode `too_small`; wie ze
    // verwisselt merkt dat pas als er een grens in de zin staat.
    expect(melding(z.number().min(7), 3, vertaler('nl'))).toBe('Voer een waarde van minimaal 7 in');
    expect(melding(z.array(z.string()).min(7), [], vertaler('nl'))).toBe('Selecteer minimaal 7 items');
    expect(melding(z.number().max(7), 9, vertaler('nl'))).toBe('Voer een waarde van maximaal 7 in');
    expect(melding(z.array(z.string()).max(1), ['a', 'b'], vertaler('de'))).toBe(
      'Bitte wählen Sie höchstens 1 Einträge aus',
    );
  });
});
