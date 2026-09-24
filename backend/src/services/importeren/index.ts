/**
 * Leden, de muziekbibliotheek, instrumenten in bezit, contacten, uniformen en
 * apparatuur inlezen uit een spreadsheet (WP11).
 *
 * Een vereniging die overstapt heeft dat meestal in Excel. Deze map
 * beoordeelt zo'n bestand regel voor regel en voert daarna uit wat klopt. De route roept eerst `beoordeel...` aan voor het voorbeeld dat
 * de beheerder te zien krijgt, en bij het importeren opnieuw: wat de browser
 * als voorbeeld terugkreeg wordt nooit vertrouwd.
 *
 * Per regel is de uitkomst:
 * - `nieuw`: wordt geïmporteerd;
 * - `bestaat`: staat er al, wordt overgeslagen;
 * - `fout`: kan niet, met de reden erbij.
 * Een waarschuwing (een onbekend instrument, een duur die niet te lezen is)
 * houdt een regel niet tegen; dat ene gegeven valt dan weg.
 *
 * Kolomnamen worden herkend in het Nederlands, Engels en Duits, zonder op
 * hoofdletters, spaties of streepjes te letten. De muziekbibliotheek leest
 * ook de kolommen van de eigen repertoire-export (`/interop/.../repertoire.csv`).
 */

export * from './gemeenschappelijk';
export * from './leden';
export * from './muziektitels';
export * from './instrumenten';
export * from './contacten';
export * from './uniformen';
export * from './apparatuur';
