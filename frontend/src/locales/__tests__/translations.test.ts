/**
 * Vertaalsleutels moeten tekst opleveren, niet een heel blok.
 *
 * In de vertaalbestanden is een sleutel ofwel een tekst, ofwel een groep met
 * meer sleutels erin. Roept de code t('resources.categories') aan terwijl dat
 * een groep is, dan krijgt de gebruiker geen label maar een waarschuwing in de
 * console en een leeg vlak op het scherm:
 *
 *   key 'resources.categories (nl)' returned an object instead of string
 *
 * Zo stond het op de middelenpagina en op het tabblad van projecten. De
 * meegegeven terugvalwaarde helpt daar niet: die geldt alleen als de sleutel
 * helemaal niet bestaat, niet als hij bestaat maar het verkeerde type heeft.
 *
 * Deze test loopt alle t()-aanroepen in de broncode langs en legt ze naast de
 * Nederlandse vertalingen, want dat is de volledigste taal.
 *
 * Er staat een tweede gat in dit bestand, van een andere soort. De drie talen
 * naast elkaar leggen vindt alleen sleutels die in de ene taal staan en in de
 * andere niet. Een sleutel die in geen van de drie bestaat is overal even
 * afwezig en valt daar dus juist buiten - en omdat de code er een Engelse
 * terugvalzin bij meegeeft, ziet het er op het scherm ook niet kapot uit. Zo
 * kregen Nederlandse en Duitse leden negen Engelse validatiemeldingen te zien
 * zonder dat er iets rood werd. De controle 'elke opgevraagde sleutel bestaat
 * ook' hieronder vangt dat geval.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import nl from '../nl.json';
import en from '../en.json';
import de from '../de.json';

const srcDir = path.join(__dirname, '../..');

/** Alle .ts- en .tsx-bestanden onder src, behalve de tests zelf. */
function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      found.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(entry.name)) {
      found.push(full);
    }
  }
  return found;
}

/** De waarde achter een sleutel als 'resources.categories.label', of undefined. */
function resolve(translations: unknown, key: string): unknown {
  let current: unknown = translations;
  for (const part of key.split('.')) {
    if (typeof current !== 'object' || current === null || !(part in current)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Bestaat de sleutel, meervoudsvormen meegerekend?
 *
 * Een sleutel met een aantal erbij staat niet onder zijn eigen naam in het
 * vertaalbestand maar onder `_one` en `_other`: `sync.days_ago` is er als
 * `sync.days_ago_one` en `sync.days_ago_other`. i18next kiest de juiste zodra
 * het `count` binnenkrijgt, dus voor de gebruiker bestaat `sync.days_ago`
 * gewoon. Zonder deze stap zou elke meervoudssleutel hier als gat binnenkomen -
 * `modules.hiddenPages` stond daarom een tijdlang ten onrechte op de lijst
 * hieronder.
 *
 * `_other` is genoeg om te kijken: dat is de vorm die elke taal heeft. Talen
 * met meer vormen (`_few`, `_many`) hebben hem er ook, dus wie `_other` heeft
 * heeft de sleutel.
 */
function bestaat(key: string): boolean {
  return resolve(nl, key) !== undefined || resolve(nl, `${key}_other`) !== undefined;
}

/**
 * Leegt de regels die alleen commentaar zijn, met behoud van het regelnummer.
 *
 * In de uitleg boven `FormField` en `useConfirm` staat een voorbeeldaanroep met
 * een verzonnen sleutel erin - `t('some.label')`, `t('x.confirmDelete')`. Die
 * horen niet in een vertaalbestand thuis, en zonder deze stap zou de controle
 * hieronder ze als gat melden.
 */
function zonderCommentaar(source: string): string {
  return source
    .split('\n')
    .map((regel) => (/^\s*(\*|\/\/)/.test(regel) ? '' : regel))
    .join('\n');
}

/** Elke t('sleutel')-aanroep in de broncode, met bestand en regelnummer. */
function translationCalls(): { file: string; line: number; key: string }[] {
  const calls: { file: string; line: number; key: string }[] = [];
  for (const file of sourceFiles(srcDir)) {
    const source = zonderCommentaar(fs.readFileSync(file, 'utf-8'));
    for (const match of source.matchAll(/\bt\(\s*'([a-zA-Z][\w.]*)'\s*[,)]/g)) {
      calls.push({
        file: path.relative(srcDir, file),
        line: source.slice(0, match.index).split('\n').length,
        key: match[1],
      });
    }
  }
  return calls;
}

const calls = translationCalls();

describe('vertaalsleutels in de broncode', () => {
  it('vindt aanroepen om te controleren', () => {
    expect(calls.length).toBeGreaterThan(100);
  });

  it('levert nergens een groep op in plaats van tekst', () => {
    const problems = calls
      .filter(({ key }) => {
        const value = resolve(nl, key);
        return typeof value === 'object' && value !== null;
      })
      .map(({ file, line, key }) => `${file}:${line} gebruikt '${key}', maar dat is een groep sleutels`);

    expect(problems).toEqual([]);
  });
});

/**
 * Sleutels die de code opvraagt maar die in geen van de drie talen staan.
 *
 * Dit is bestaande achterstand, geen goedkeuring. Elke sleutel hieronder is een
 * plek waar de gebruiker de Engelse terugvalzin ziet, of - waar er geen
 * terugvalzin staat - de kale sleutel zelf.
 *
 * De lijst staat hier zodat de controle hieronder vandaag groen is en morgen
 * rood wordt bij een níeuw gat. Wie een van deze sleutels vertaalt, haalt hem
 * hier weg; de tweede test hieronder dwingt dat af.
 *
 * Wat er nog op staat heeft steeds dezelfde reden: de aanroep zet de tekst zelf
 * al in elkaar met een sjabloonstring als terugvalwaarde, en geeft er géén
 * waarden bij. Een vertaling met {{...}} erin zou daar letterlijk als
 * "{{title}}" op het scherm komen, en een vertaling zónder de waarden laat de
 * gebruiker juist het enige weg wat de melding iets zegt - welke poster, welke
 * setlijst, hoeveel minuten. Deze drie zijn dus pas te vertalen samen met een
 * wijziging in het aanroepende bestand, en die valt buiten deze ronde:
 *
 *   pages/Concerts/PosterGeneratorTab.tsx:15
 *     t('concerts.posterDownloaded', `Poster "${data.title}" gedownload als ...`)
 *   pages/Concerts/SetlistBuilderTab.tsx:24
 *     t('concerts.setlistSaved', `Setlist "${setlist.name}" opgeslagen`)
 *   pages/Practice.tsx:213
 *     t('practice.timerSessionEnded', `Oefensessie van ${durationMinutes} minuten...`)
 *
 * Twee sleutels zijn van de lijst gegaan zonder dat er een tekst bij kwam.
 * `locale` wordt niet meer opgevraagd: `pages/Availability.tsx` gaf de uitkomst
 * door aan `toLocaleDateString` en kreeg dus de letterlijke tekst 'locale' als
 * taalcode voorgeschoteld; daar staat nu `currentLocale()`. En
 * `modules.hiddenPages` stond er ten onrechte op - die bestaat al als
 * `hiddenPages_one` en `hiddenPages_other`, wat `bestaat()` hierboven nu
 * meerekent.
 */
const ACHTERSTAND = ['concerts.posterDownloaded', 'concerts.setlistSaved', 'practice.timerSessionEnded'];

/**
 * WAT DEZE CONTROLE WEL EN NIET ZIET.
 *
 * WEL: elke aanroep die letterlijk `t('een.sleutel')` in de broncode is, met
 * enkele aanhalingstekens en een sleutel zonder gaten erin. Dat is verreweg het
 * grootste deel van de aanroepen in dit project.
 *
 * NIET, en dat is geen tekortkoming die op te lossen valt:
 *   - t(`theme.${key}`) en alles wat een sleutel in elkaar zet uit een
 *     variabele. ThemeSettings.tsx en de landenlijst doen dat volop. Wat daar
 *     uit komt is pas bekend als de code draait, dus een test die het bestand
 *     leest kan er niets over zeggen.
 *   - sleutels die als prop of in een tabel staan in plaats van in een
 *     `t()`-aanroep: `useDocumentTitle('pageTitle.theme')`, de `i18nKey` van
 *     `<Trans>`, de labels in een menu-array.
 *   - `t("dubbele.aanhalingstekens")`. Prettier schrijft in dit project enkele
 *     aanhalingstekens, dus dat komt niet voor, maar hij zou erdoorheen glippen.
 *   - of de vertáling klopt. Een sleutel met de Engelse zin eronder in nl.json
 *     is hier gewoon aanwezig.
 *
 * De controle kijkt alleen in het Nederlands. Dat mag omdat de test verderop
 * afdwingt dat de drie talen dezelfde sleutels kennen; ontbreekt iets alleen in
 * het Duits, dan valt dat daar op.
 */
describe('elke opgevraagde sleutel bestaat ook', () => {
  const ontbrekend = calls.filter(({ key }) => !bestaat(key));

  it('kent geen gat buiten de bekende achterstand', () => {
    const nieuw = ontbrekend
      .filter(({ key }) => !ACHTERSTAND.includes(key))
      .map(({ file, line, key }) => `${file}:${line} vraagt '${key}', maar die sleutel bestaat in geen enkele taal`);

    expect(nieuw).toEqual([]);
  });

  it('houdt de achterstandslijst schoon', () => {
    // Een sleutel die inmiddels vertaald is hoort niet meer in de lijst. Zonder
    // deze test groeit de lijst wel maar krimpt hij nooit, en dan dekt hij op
    // den duur gaten af die allang gedicht zijn.
    const overbodig = ACHTERSTAND.filter((key) => bestaat(key));

    expect(overbodig).toEqual([]);
  });

  it('ziet de negen validatiemeldingen die hier ooit ontbraken', () => {
    // Deze negen stonden in geen van de drie talen en zijn toegevoegd. Ze staan
    // hier apart omdat ze de aanleiding voor deze hele controle waren: haal er
    // een uit de vertaalbestanden weg en de eerste test hierboven wordt rood.
    const validatiesleutels = [
      'errors.invalidType',
      'errors.invalidUrl',
      'errors.invalidUuid',
      'errors.invalidFormat',
      'errors.invalidSelection',
      'errors.minValue',
      'errors.maxValue',
      'errors.minItems',
      'errors.maxItems',
    ];

    const opgevraagd = new Set(calls.map(({ key }) => key));
    for (const sleutel of validatiesleutels) {
      expect(opgevraagd.has(sleutel), `${sleutel} wordt niet meer opgevraagd`).toBe(true);
      expect(ontbrekend.map(({ key }) => key)).not.toContain(sleutel);
    }
  });
});

describe('de drie talen kennen dezelfde sleutels', () => {
  /** Alle volledige paden naar teksten, plat. */
  function leafKeys(obj: unknown, prefix = ''): string[] {
    if (typeof obj !== 'object' || obj === null) return [prefix];
    return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
      leafKeys(v, prefix ? `${prefix}.${k}` : k),
    );
  }

  const dutch = new Set(leafKeys(nl));

  it.each([
    ['en', en],
    ['de', de],
  ])('heeft in %s geen sleutel die het Nederlands niet kent', (_lang, translations) => {
    // Andersom mag wel: het Nederlands loopt voor. Een sleutel die alleen in
    // een vertaling bestaat, is bijna altijd een tikfout.
    const extra = leafKeys(translations).filter((k) => !dutch.has(k));

    expect(extra).toEqual([]);
  });
});
