/**
 * Een letterlijk pad mag niet onder een parameterpad staan.
 *
 * Express matcht routes op volgorde van registratie. Staat er eerst een route
 * op '/:id' en daarna een op '/export-data', dan komt een verzoek aan
 * /users/export-data bij de eerste terecht: Express ziet "export-data" als een
 * id, zoekt een gebruiker met die naam en antwoordt met "Gebruiker niet
 * gevonden". De tweede route wordt nooit bereikt.
 *
 * Dit patroon kwam in dit project herhaaldelijk voor - in music-pieces (#110),
 * in tasks en resources (#121), tussen mounts in index.ts (#136), en bij
 * podiumindelingen en zaalindelingen (#144). Elke keer werd het gevonden
 * doordat iemand er toevallig tegenaan liep, en elke keer werd alleen dat ene
 * geval opgelost.
 *
 * Twee gevallen die op dat moment nog stil kapot waren:
 *   - GET /users/export-data, de gegevensexport uit artikel 20 van de AVG
 *   - GET /events/packing-templates
 *
 * Deze test controleert de eigenschap zelf over alle routebestanden, zodat een
 * volgend geval meteen opvalt in plaats van pas als een gebruiker het meldt.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROUTES_MAP = path.join(__dirname, '../../routes');

interface Route {
  methode: string;
  pad: string;
  regel: number;
}

/**
 * Lees de routes uit een bronbestand.
 *
 * Bewust op de tekst en niet door de router te importeren: dat zou de hele
 * afhankelijkheidsboom van elk routebestand meetrekken, met alle bijwerkingen
 * en de dekkingsmeting van dien.
 */
function leesRoutes(bron: string): Route[] {
  const regels = bron.split('\n');
  const routes: Route[] = [];

  regels.forEach((regel, i) => {
    // Twee schrijfwijzen komen allebei voor: het pad op de regel zelf
    // (`router.get('/pad', handler)`) en het pad op de volgende regel, zoals
    // prettier het opmaakt zodra de aanroep te lang wordt. Deze test keek
    // eerder alleen naar de tweede vorm en liet daarmee 78 registraties
    // ongezien - waaronder echte gevallen.
    const m = regel.match(/^\s*[A-Za-z_$][\w$]*\.(get|post|put|patch|delete)\((.*)$/);
    if (!m) return;
    const methode = m[1].toUpperCase();

    // Alleen paden tellen. Zonder deze eis leest `req.get('user-agent')` als
    // een GET-route, want dat is ook `iets.get('tekst')`.
    const opDezeRegel = m[2].trim().match(/^'(\/[^']*)'/);
    if (opDezeRegel) {
      routes.push({ methode, pad: opDezeRegel[1], regel: i + 1 });
      return;
    }

    if (m[2].trim() !== '' || i + 1 >= regels.length) return;
    const opVolgendeRegel = regels[i + 1].match(/^\s*'(\/[^']*)'/);
    if (opVolgendeRegel) routes.push({ methode, pad: opVolgendeRegel[1], regel: i + 1 });
  });

  return routes;
}

/** Vangt `eerder` het pad van `later` af? */
function vangtAf(eerder: Route, later: Route): boolean {
  if (eerder.methode !== later.methode) return false;

  const a = eerder.pad.split('/').filter(Boolean);
  const b = later.pad.split('/').filter(Boolean);
  if (a.length !== b.length) return false;

  // Elk segment van `eerder` moet dat van `later` kunnen opslokken.
  if (!a.every((deel, i) => deel.startsWith(':') || deel === b[i])) return false;

  // En ergens moet `eerder` ruimer zijn: een parameter op een plek waar
  // `later` een letterlijk woord heeft. Zijn beide patronen even ruim, dan
  // gaat het om een dubbele registratie - ook fout, maar een ander geval.
  return a.some((deel, i) => deel.startsWith(':') && !b[i].startsWith(':'));
}

const bestanden = fs
  .readdirSync(ROUTES_MAP)
  .filter((naam) => naam.endsWith('.ts'))
  .sort();

describe('routes vangen elkaar niet af', () => {
  it('vindt routebestanden om te controleren', () => {
    // Zonder deze controle zou de test stilletjes niets meer nakijken als de
    // map ooit verplaatst wordt.
    expect(bestanden.length).toBeGreaterThan(50);
  });

  it.each(bestanden)('%s', (naam) => {
    const routes = leesRoutes(fs.readFileSync(path.join(ROUTES_MAP, naam), 'utf-8'));
    const problemen: string[] = [];

    routes.forEach((later, j) => {
      // Hier stond `if (later.pad.includes(':')) return;`, met als gedachte dat
      // alleen een volledig letterlijk pad afgevangen kan worden. Dat klopt
      // niet: PUT /:id/options/reorder bevat een parameter en werd dus
      // overgeslagen, terwijl PUT /:pollId/options/:optionId hem wel degelijk
      // opslokte. Hetzelfde gold voor /:id/program/reorder in concerts.ts.
      // Waar de parameter staat doet er niet toe - het gaat erom of een eerder
      // patroon ruimer is. Die vergelijking zit nu volledig in vangtAf.
      routes.slice(0, j).forEach((eerder) => {
        if (vangtAf(eerder, later)) {
          problemen.push(
            `${later.methode} ${later.pad} (regel ${later.regel}) wordt afgevangen door ` +
              `${eerder.methode} ${eerder.pad} (regel ${eerder.regel}) - zet de letterlijke route erboven`,
          );
        }
      });
    });

    expect(problemen).toEqual([]);
  });
});
