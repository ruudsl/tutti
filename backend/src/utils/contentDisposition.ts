/**
 * De kopregel Content-Disposition voor een download, volgens RFC 5987/6266.
 *
 * Waarom dit bestand bestaat: routes zetten de kopregel met de hand als
 * `attachment; filename="${naam}"`. Een HTTP-kopregel is volgens de
 * specificatie ISO-8859-1, en Node schrijft de waarde ook als losse bytes weg.
 * Bij bladmuziek is een naam met een niet-ASCII teken eerder regel dan
 * uitzondering (Frühlingsstimmen, Españita, Café Chantant), en dat ging op twee
 * manieren mis:
 *
 * - Een teken tot U+00FF (de é in "Café Chantant") kwam bij de browser aan als
 *   een vervangingsteken: `filename="Caf\uFFFD Chantant.zip"`.
 * - Een teken daarboven (de ř in "Dvořák") liet Node de hele kopregel weigeren
 *   met ERR_INVALID_CHAR. Dat werd geen verminkte naam maar een foutmelding
 *   500: de download deed het simpelweg niet.
 *
 * De uitweg van de bestaande routes was de naam kaalslaan met
 * `replace(/[^a-zA-Z0-9\s-]/g, '')`. Dat werkt, maar lost het probleem op door
 * informatie weg te gooien: "Frühlingsstimmen" werd "Frhlingsstimmen". Hier
 * sturen we in plaats daarvan beide vormen mee: een
 * ASCII-terugval in `filename` voor oude clients, en de echte naam
 * percent-gecodeerd in `filename*`. De frontend leest `filename*` al met
 * voorrang (zie leesBestandsnaam in frontend/src/api/music.ts), dus daar komt
 * de naam vanaf nu ongeschonden aan.
 */

/**
 * Tekens die nooit in een bestandsnaam thuishoren, ongeacht de kodering.
 *
 * Regelovergangen en andere stuurtekens erin: zonder die filter kan iemand met
 * een muzieklijst genaamd "mars\r\nSet-Cookie: ..." een eigen kopregel in het
 * antwoord smokkelen. Bij /music-pieces/batch-export-by-title komt de naam
 * rechtstreeks uit req.body, dus dat is geen theoretisch geval.
 *
 * Verder de tekens die Windows in een bestandsnaam verbiedt, plus de
 * schuine strepen waarmee een naam als "../../etc/passwd" anders in de
 * kopregel zou belanden.
 */
// eslint-disable-next-line no-control-regex
const ONGELDIGE_TEKENS = /[\u0000-\u001f\u007f<>:"/\\|?*]/g;

/**
 * Een halve surrogaatparen-helft, wat overblijft als je een naam met een emoji
 * op een vaste lengte afkapt. encodeURIComponent gooit daarop een URIError, dus
 * die weghalen voordat we koderen.
 */
const LOSSE_SURROGATEN = /[\uD800-\uDFFF]/g;

/**
 * Percent-koderen kan een naam ruim verdrievoudigen (elk teken buiten ASCII
 * wordt drie tekens), dus zonder grens groeit de kopregel harder dan de naam.
 */
const MAX_LENGTE = 150;

/**
 * Maakt een naam bruikbaar als bestandsnaam, met de niet-ASCII tekens intact.
 *
 * Anders dan de oude `replace(/[^a-zA-Z0-9\s-]/g, '')` blijft een umlaut of
 * tilde hier gewoon staan; alleen wat echt niet kan gaat eruit.
 */
export function veiligeBestandsnaam(naam: string, terugval = 'download'): string {
  const schoon = String(naam ?? '')
    .replace(ONGELDIGE_TEKENS, '_')
    .slice(0, MAX_LENGTE)
    .replace(LOSSE_SURROGATEN, '')
    // Eerst trimmen, dan pas de punten: een naam als "  ..verborgen" hield
    // anders zijn punten, omdat ^ dan op de spatie sloeg in plaats van op de
    // punt. Levert op Unix een verborgen bestand op.
    .trim()
    .replace(/^\.+/, '')
    .trim();

  return schoon.length > 0 ? schoon : terugval;
}

/**
 * De ASCII-terugval voor `filename=`, voor clients die `filename*` niet kennen.
 *
 * Elk teken buiten ASCII wordt een liggend streepje. Bewust geen vraagteken
 * zoals het pakket content-disposition doet: een vraagteken is op Windows zelf
 * een verboden teken in een bestandsnaam, dus dan kan de gebruiker de download
 * niet eens opslaan.
 */
function asciiTerugval(bestandsnaam: string): string {
  // Het aanhalingsteken dat deze vorm vroegtijdig zou sluiten is al door
  // veiligeBestandsnaam weggehaald.
  return bestandsnaam.replace(/[^\u0020-\u007e]/g, '_');
}

/**
 * De naam percent-gecodeerd voor `filename*`, in de vorm UTF-8''<naam>.
 *
 * encodeURIComponent laat ' ( ) en * ongemoeid, terwijl RFC 5987 die in een
 * attr-char niet toestaat; die koderen we er alsnog achteraan.
 */
function utf8Gecodeerd(bestandsnaam: string): string {
  return encodeURIComponent(bestandsnaam).replace(
    /['()*]/g,
    (teken) => '%' + teken.charCodeAt(0).toString(16).toUpperCase(),
  );
}

/**
 * De volledige waarde voor de kopregel Content-Disposition van een download.
 *
 * Geeft altijd beide vormen mee, ook bij een naam die al helemaal ASCII is:
 * dat scheelt een tak in de code en een tak in de tests, en kost een paar bytes.
 */
export function bijlageKopregel(naam: string, terugval = 'download'): string {
  const bestandsnaam = veiligeBestandsnaam(naam, terugval);
  return `attachment; filename="${asciiTerugval(bestandsnaam)}"; filename*=UTF-8''${utf8Gecodeerd(bestandsnaam)}`;
}
