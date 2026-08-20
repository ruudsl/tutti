/**
 * Hulpmiddelen om een zod-schema voor een gedeeltelijke wijziging te maken.
 */

import { z } from 'zod';

/**
 * Maak van een aanmaakschema een wijzigingsschema.
 *
 * `.partial()` maakt elk veld optioneel maar laat een `.default()` gewoon
 * staan. Bij het aanmaken is die standaard precies goed; bij een wijziging is
 * hij schadelijk. Een veld dat het verzoek niet noemt komt dan namelijk niet
 * als `undefined` binnen maar als de standaardwaarde, en die wordt daarna
 * gewoon weggeschreven - ook door een `COALESCE(?, kolom)`, want een
 * standaardwaarde is geen NULL.
 *
 * Dat ging op tien plaatsen mis, en niet zachtjes:
 *
 *   PUT /stage-layouts/:id      wiste bij elke wijziging de hele opstelling,
 *                               en zette breedte, diepte en de standaardvlag terug
 *   PUT /uniforms/items/:id     zette een uitgegeven onderdeel terug op beschikbaar
 *   PUT /instrument-assets/:id  idem, en zette de toestand terug op 'good'
 *   PUT /instrument-insurance/policies/:id  zette het eigen risico op 0
 *   PATCH /equipment/:id        zette de stand terug op beschikbaar
 *   PATCH /posts/:id            zette een gepubliceerd bericht terug op concept
 *
 * Deze functie haalt de standaarden eruit en maakt elk veld optioneel. De
 * validatie zelf blijft staan: een verkeerde waarde geeft nog steeds een 400.
 */
/** Haalt de `.default()`-schil van een veldtype af, als die er is. */
type ZonderStandaard<T> = T extends z.ZodDefault<infer Binnen> ? Binnen : T;

/** De vorm van het wijzigingsschema: elk veld optioneel en zonder standaard. */
type WijzigingsVorm<T extends z.ZodRawShape> = {
  [K in keyof T]: z.ZodOptional<ZonderStandaard<T[K]> extends z.ZodType ? ZonderStandaard<T[K]> : T[K]>;
};

export function wijzigingsschema<T extends z.ZodRawShape>(schema: z.ZodObject<T>): z.ZodObject<WijzigingsVorm<T>> {
  const shape: Record<string, z.ZodType> = {};

  for (const [sleutel, veld] of Object.entries(schema.shape)) {
    let zonderStandaard: z.ZodType = veld as z.ZodType;

    // Een .default() of .prefault() zit als schil om het echte schema heen.
    // Er kunnen er meer op elkaar staan, vandaar de lus.
    for (;;) {
      const def = (zonderStandaard as unknown as { def?: { type?: string; innerType?: z.ZodType } }).def;
      if (def?.type !== 'default' && def?.type !== 'prefault') break;
      if (!def.innerType) break;
      zonderStandaard = def.innerType;
    }

    shape[sleutel] = zonderStandaard.optional();
  }

  return z.object(shape) as unknown as z.ZodObject<WijzigingsVorm<T>>;
}
