import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

/**
 * De Nederlandse teksten die vóór de eerste weergave nodig zijn.
 *
 * nl.json is 243 KB. Hij zat in zijn geheel in de hoofdbundel en was daar
 * ongeveer tweederde van; de browser moest hem binnenhalen en ontleden voordat
 * het inlogscherm kon verschijnen. Dat scherm gebruikt er zo'n 9 KB van.
 *
 * Deze kern komt in de hoofdbundel, de rest van nl.json wordt na de eerste
 * weergave opgehaald (zie i18n.ts). nl.json blijft de enige bron: de kern
 * wordt er bij het bouwen uit gesneden door de plugin hieronder, er wordt
 * niets dubbel onderhouden.
 *
 * Wat hier moet staan: elke groep of sleutel die een onderdeel in de
 * hoofdbundel gebruikt - alles wat vanuit main.tsx met een gewone import
 * bereikbaar is, dus niet via lazy(). src/locales/__tests__/kern.test.ts
 * loopt die imports na en faalt als er een sleutel ontbreekt. Een ontbrekende
 * sleutel is hier geen ramp - de tekst verschijnt zodra de rest binnen is -
 * maar wel een kale sleutel op het inlogscherm, en die hoort niemand te zien.
 */
export const KERN = [
  'accessibility',
  'auth',
  'common',
  'errorBoundary',
  'lazyImage',
  'notFound',
  'pwa',
  'sectionError',
  'socialLogin',
  // De rest van pageTitle verwijst naar de groepen van alle pagina's; de
  // hele groep meenemen zou via die verwijzingen een groot deel van nl.json
  // weer binnenhalen.
  'pageTitle.login',
  'pageTitle.notFound',
  // De melding bij een volle opslag komt uit api/client.ts, die in de
  // hoofdbundel zit.
  'opslag.limietBereikt',
] as const;

type Teksten = { [sleutel: string]: unknown };

function haal(teksten: Teksten, pad: string[]): unknown {
  let hier: unknown = teksten;
  for (const deel of pad) {
    if (typeof hier !== 'object' || hier === null) return undefined;
    hier = (hier as Teksten)[deel];
  }
  return hier;
}

function zet(doel: Teksten, pad: string[], waarde: unknown): void {
  let hier = doel;
  for (const deel of pad.slice(0, -1)) {
    if (typeof hier[deel] !== 'object' || hier[deel] === null) hier[deel] = {};
    hier = hier[deel] as Teksten;
  }
  hier[pad[pad.length - 1]] = waarde;
}

/** De sleutels waar een tekst via `$t(groep.sleutel)` naar verwijst. */
function verwijzingenIn(waarde: unknown, uit: string[]): void {
  if (typeof waarde === 'string') {
    const patroon = /\$t\(([\w.-]+)/g;
    let treffer: RegExpExecArray | null;
    while ((treffer = patroon.exec(waarde)) !== null) uit.push(treffer[1]);
  } else if (typeof waarde === 'object' && waarde !== null) {
    for (const onder of Object.values(waarde)) verwijzingenIn(onder, uit);
  }
}

/**
 * Snijd de kern uit de volledige teksten.
 *
 * Verwijst een tekst in de kern naar een andere (`"login": "$t(auth.login)"`),
 * dan komt die andere ook mee, zodat een verwijzing nooit in het niets wijst.
 */
export function bouwKern(volledig: Teksten, paden: readonly string[] = KERN): Teksten {
  const kern: Teksten = {};
  const gedaan = new Set<string>();
  const wachtrij = [...paden];

  while (wachtrij.length > 0) {
    const pad = wachtrij.pop()!;
    if (gedaan.has(pad)) continue;
    gedaan.add(pad);

    const delen = pad.split('.');
    const waarde = haal(volledig, delen);
    if (waarde === undefined) continue;
    // Een kopie: anders deelt de kern objecten met de volledige teksten, en
    // schrijft zet() hierboven via die gedeelde objecten in de bron.
    zet(kern, delen, JSON.parse(JSON.stringify(waarde)));

    const verwijzingen: string[] = [];
    verwijzingenIn(waarde, verwijzingen);
    wachtrij.push(...verwijzingen);
  }

  return kern;
}

const MODULE = 'virtual:teksten-kern';
// De \0 houdt andere plugins van deze module af; zonder dat pakt de
// JSON-plugin hem op en probeert hij JavaScript als JSON te ontleden.
const OPGELOST = '\0' + MODULE;

/**
 * Levert `virtual:teksten-kern`: het deel van nl.json dat vóór de eerste
 * weergave nodig is. Welk deel dat is en waarom staat bovenaan dit bestand.
 *
 * In vite.config.ts én vitest.config.ts, omdat i18n.ts deze module importeert
 * en tests die i18n.ts inladen hem anders niet vinden.
 */
export function tekstenKern(): Plugin {
  const bron = path.resolve(__dirname, 'src/locales/nl.json');
  return {
    name: 'tutti-teksten-kern',
    resolveId(id) {
      return id === MODULE ? OPGELOST : undefined;
    },
    load(id) {
      if (id !== OPGELOST) return undefined;
      // Wijzigt nl.json tijdens het ontwikkelen, dan moet de kern mee.
      this.addWatchFile(bron);
      const kern = bouwKern(JSON.parse(readFileSync(bron, 'utf8')));
      // JSON.parse op een tekst is voor de browser sneller te ontleden dan
      // hetzelfde als objectliteraal.
      return `export default JSON.parse(${JSON.stringify(JSON.stringify(kern))});`;
    },
  };
}
