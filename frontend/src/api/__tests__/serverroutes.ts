/**
 * Leest de paden die een Express-router in de backend werkelijk aanbiedt.
 *
 * Waarom dit nodig is: de api-laag is een reeks tekstsamenstellingen. Niets in
 * TypeScript verbindt `api.post('/projects/1/rehearsals')` met de vraag of de
 * server die route ooit heeft geregistreerd. Een test die alleen vastlegt
 * *welk* pad de functie verstuurt, blijft daarom groen terwijl de aanroep in
 * de praktijk op een 404 stukloopt - hij herhaalt de fout in plaats van hem te
 * vinden.
 *
 * Deze helper haalt de waarheid op uit de enige plek waar hij staat:
 * backend/src/routes/<naam>.ts. De router wordt niet ingeladen (dat zou de
 * database en de hele middlewareketen meebrengen), maar gelezen als tekst. Dat
 * is grover dan een echte routetabel, en dat mag: we zoeken niet naar subtiele
 * middlewarevolgorde maar naar het grofste dat er mis kan zijn - een pad dat
 * er helemaal niet is.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface Serverroute {
  /** HTTP-werkwoord in kleine letters. */
  methode: string;
  /** Het patroon zoals Express het kent, bijvoorbeeld '/:id/members/:memberId'. */
  patroon: string;
}

/**
 * Alle `router.<werkwoord>('<pad>' ...)` uit één routerbestand.
 *
 * De routes staan in deze codebase soms op één regel en soms met het pad op de
 * volgende regel, vandaar de \s* tussen haakje en aanhalingsteken.
 */
export function serverroutes(bestandsnaam: string): Serverroute[] {
  // process.cwd() is frontend/ als vitest daar draait; de backend ligt ernaast.
  const pad = join(process.cwd(), '..', 'backend', 'src', 'routes', bestandsnaam);
  const bron = readFileSync(pad, 'utf8');

  const routes: Serverroute[] = [];
  const patroon = /router\.(get|post|put|patch|delete)\(\s*'([^']*)'/g;
  let treffer: RegExpExecArray | null;
  while ((treffer = patroon.exec(bron)) !== null) {
    routes.push({ methode: treffer[1], patroon: treffer[2] });
  }

  if (routes.length === 0) {
    throw new Error(`Geen enkele route gevonden in ${bestandsnaam}; klopt het pad nog?`);
  }
  return routes;
}

/**
 * Past een concreet pad in een Express-patroon?
 *
 * Segment voor segment: een `:naam` slikt precies één niet-leeg segment, al het
 * andere moet letterlijk gelijk zijn. Geen wildcards, geen optionele stukken -
 * die komen in deze routers niet voor, en zouden hier stilzwijgend te veel
 * doorlaten.
 */
export function pastInPatroon(pad: string, patroon: string): boolean {
  const delen = pad.split('/');
  const patroondelen = patroon.split('/');
  if (delen.length !== patroondelen.length) return false;

  return patroondelen.every((deel, i) => {
    if (deel.startsWith(':')) return delen[i].length > 0;
    return deel === delen[i];
  });
}

/**
 * Biedt de server dit verzoek aan?
 *
 * `pad` is het volledige pad zoals de api-laag het verstuurt, inclusief de
 * voorvoegsel waaronder de router in index.ts hangt; dat voorvoegsel geef je
 * mee als `voorvoegsel` zodat het eraf kan.
 */
export function serverBiedtAan(routes: Serverroute[], voorvoegsel: string, methode: string, pad: string): boolean {
  const zonderQuery = pad.split('?')[0];
  if (!zonderQuery.startsWith(voorvoegsel)) return false;
  const rest = zonderQuery.slice(voorvoegsel.length) || '/';
  return routes.some((r) => r.methode === methode && pastInPatroon(rest, r.patroon));
}
