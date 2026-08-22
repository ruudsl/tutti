/**
 * De taalcode belandt als tekst in de SQL en niet als parameter.
 *
 * Dat kan ook niet anders: `json_extract(pref_label, '$.${language}')` gebruikt
 * de taal als onderdeel van een JSON-pad, en een pad is geen waarde. Daarmee is
 * elke aanroeper die `language` ongefilterd doorgeeft een ingang voor
 * SQL-injectie. Via de route was dat aantoonbaar: `?lang=nl') DESC --` gaf 200
 * met de sortering omgedraaid, en een variant erop een 500.
 *
 * De route valideert het inmiddels zelf, maar deze functies worden op meer
 * plekken aangeroepen en een volgende aanroeper weet dat niet. Daarom staat de
 * grens in de service.
 *
 * Deze tests eisen meer dan "het valt niet om": ze eisen dat een kwaadaardige
 * taalcode hetzelfde oplevert als de standaard. Dat is het verschil tussen een
 * injectie die faalt en een injectie die onschadelijk is gemaakt.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import { searchConcepts, getConceptsByType, getRootConcepts, buildHierarchy } from '../../services/jskos';

const GEMEEN = "nl') DESC --";

function zetConceptKlaar(notatie: string, labels: Record<string, string>) {
  db.prepare(
    `INSERT OR REPLACE INTO vocabulary_cache (uri, vocabulary_type, notation, pref_label)
     VALUES (?, 'instrument', ?, ?)`,
  ).run(`http://test.local/${notatie}-${uuidv4()}`, notatie, JSON.stringify(labels));
}

beforeEach(() => {
  db.prepare("DELETE FROM vocabulary_cache WHERE uri LIKE 'http://test.local/%'").run();
  zetConceptKlaar('tp', { nl: 'Trompet', en: 'Trumpet' });
  zetConceptKlaar('kl', { nl: 'Klarinet', en: 'Clarinet' });
  // Alleen een Frans label: dat vindt de zoekfunctie uitsluitend met lang=fr.
  zetConceptKlaar('hb', { fr: 'Hautbois' });
});

describe('jskos maakt een taalcode die SQL bevat onschadelijk', () => {
  it('zoeken levert hetzelfde op als met de standaardtaal', () => {
    // searchConcepts geeft { concepts, total } terug, geen kale lijst.
    const gemeen = searchConcepts('tr', 'instrument', 10, GEMEEN);
    const normaal = searchConcepts('tr', 'instrument', 10, 'nl');

    expect(gemeen.concepts.map((c) => c.uri)).toEqual(normaal.concepts.map((c) => c.uri));
    expect(gemeen.total).toBe(normaal.total);
  });

  it('de lijst per type levert hetzelfde op als met de standaardtaal', () => {
    expect(getConceptsByType('instrument', GEMEEN).map((c) => c.uri)).toEqual(
      getConceptsByType('instrument', 'nl').map((c) => c.uri),
    );
  });

  it('de wortelconcepten leveren hetzelfde op als met de standaardtaal', () => {
    expect(getRootConcepts('instrument', GEMEEN).map((c) => c.uri)).toEqual(
      getRootConcepts('instrument', 'nl').map((c) => c.uri),
    );
  });

  it('de boom levert hetzelfde op als met de standaardtaal', () => {
    expect(JSON.stringify(buildHierarchy('instrument', GEMEEN))).toBe(
      JSON.stringify(buildHierarchy('instrument', 'nl')),
    );
  });

  it('een echte taalcode blijft gewoon werken en is niet hetzelfde als de standaard', () => {
    // Zonder deze test zou een regel die alles naar 'nl' terugzet ook slagen.
    // De zoekfunctie kijkt altijd ook in het Engels en Duits, dus een
    // Engelse term levert ook met lang=nl treffers op. Frans hoort niet bij die
    // terugval: 'Hautbois' is dus alleen te vinden als de opgegeven taalcode
    // echt wordt gebruikt.
    //
    // Zonder deze test zou een reparatie die simpelweg alles naar 'nl' terugzet
    // ook slagen - en die zou de zoekfunctie voor elke andere taal slopen.
    const frans = searchConcepts('hautb', 'instrument', 10, 'fr');
    const nederlands = searchConcepts('hautb', 'instrument', 10, 'nl');

    expect(frans.concepts.length).toBeGreaterThan(0);
    expect(nederlands.concepts.length).toBe(0);
  });

  it('een taalcode met een streepje wordt niet weggegooid', () => {
    expect(() => searchConcepts('tr', 'instrument', 10, 'nl-NL')).not.toThrow();
  });
});
