/**
 * WP5: Seed data for JSKOS vocabulary cache
 *
 * Contains common instruments for wind orchestras and brass bands,
 * as well as common genres.
 */

export interface VocabularySeed {
  uri: string;
  vocabulary_type: 'instrument' | 'genre' | 'composer';
  pref_label: Record<string, string>;
  alt_labels?: string[];
  broader?: string[];
  narrower?: string[];
  notation?: string;
}

/**
 * Instruments based on IAML Medium of Performance codes
 * URI pattern: http://iflastandards.info/ns/unimarc/terms/mop/{code}
 *
 * For instruments not in IAML, we use: tutti:instrument/{id}
 */
export const instrumentSeeds: VocabularySeed[] = [
  // Woodwinds (s)
  {
    uri: 'http://iflastandards.info/ns/unimarc/terms/mop/s',
    vocabulary_type: 'instrument',
    pref_label: { en: 'Woodwinds', nl: 'Houtblazers', de: 'Holzbläser' },
    notation: 's',
    narrower: ['sab', 'sac', 'sae', 'saf', 'sag', 'sah'],
  },
  {
    uri: 'http://iflastandards.info/ns/unimarc/terms/mop/sab',
    vocabulary_type: 'instrument',
    pref_label: { en: 'Piccolo', nl: 'Piccolo', de: 'Piccolo' },
    alt_labels: ['Piccolo flute', 'Kleine fluit'],
    notation: 'sab',
    broader: ['http://iflastandards.info/ns/unimarc/terms/mop/s'],
  },
  {
    uri: 'http://iflastandards.info/ns/unimarc/terms/mop/sac',
    vocabulary_type: 'instrument',
    pref_label: { en: 'Flute', nl: 'Fluit', de: 'Flöte' },
    alt_labels: ['Concert flute', 'Dwarsfluit', 'Querflöte'],
    notation: 'sac',
    broader: ['http://iflastandards.info/ns/unimarc/terms/mop/s'],
  },
  {
    uri: 'http://iflastandards.info/ns/unimarc/terms/mop/sae',
    vocabulary_type: 'instrument',
    pref_label: { en: 'Oboe', nl: 'Hobo', de: 'Oboe' },
    notation: 'sae',
    broader: ['http://iflastandards.info/ns/unimarc/terms/mop/s'],
  },
  {
    uri: 'http://iflastandards.info/ns/unimarc/terms/mop/saf',
    vocabulary_type: 'instrument',
    pref_label: { en: 'English horn', nl: 'Althobo', de: 'Englischhorn' },
    alt_labels: ['Cor anglais'],
    notation: 'saf',
    broader: ['http://iflastandards.info/ns/unimarc/terms/mop/s'],
  },
  {
    uri: 'http://iflastandards.info/ns/unimarc/terms/mop/sag',
    vocabulary_type: 'instrument',
    pref_label: { en: 'Clarinet', nl: 'Klarinet', de: 'Klarinette' },
    alt_labels: ['Bb clarinet', 'Bes klarinet'],
    notation: 'sag',
    broader: ['http://iflastandards.info/ns/unimarc/terms/mop/s'],
  },
  {
    uri: 'tutti:instrument/eb-clarinet',
    vocabulary_type: 'instrument',
    pref_label: { en: 'Eb Clarinet', nl: 'Es-klarinet', de: 'Es-Klarinette' },
    alt_labels: ['Piccolo clarinet', 'Kleine klarinet'],
    broader: ['http://iflastandards.info/ns/unimarc/terms/mop/s'],
  },
  {
    uri: 'tutti:instrument/bass-clarinet',
    vocabulary_type: 'instrument',
    pref_label: { en: 'Bass clarinet', nl: 'Basklarinet', de: 'Bassklarinette' },
    broader: ['http://iflastandards.info/ns/unimarc/terms/mop/s'],
  },
  {
    uri: 'http://iflastandards.info/ns/unimarc/terms/mop/sah',
    vocabulary_type: 'instrument',
    pref_label: { en: 'Bassoon', nl: 'Fagot', de: 'Fagott' },
    notation: 'sah',
    broader: ['http://iflastandards.info/ns/unimarc/terms/mop/s'],
  },

  // Saxophones (part of woodwinds)
  {
    uri: 'tutti:instrument/soprano-saxophone',
    vocabulary_type: 'instrument',
    pref_label: { en: 'Soprano saxophone', nl: 'Sopraansaxofoon', de: 'Sopransaxophon' },
    broader: ['http://iflastandards.info/ns/unimarc/terms/mop/s'],
  },
  {
    uri: 'http://iflastandards.info/ns/unimarc/terms/mop/sai',
    vocabulary_type: 'instrument',
    pref_label: { en: 'Alto saxophone', nl: 'Altsaxofoon', de: 'Altsaxophon' },
    notation: 'sai',
    broader: ['http://iflastandards.info/ns/unimarc/terms/mop/s'],
  },
  {
    uri: 'tutti:instrument/tenor-saxophone',
    vocabulary_type: 'instrument',
    pref_label: { en: 'Tenor saxophone', nl: 'Tenorsaxofoon', de: 'Tenorsaxophon' },
    broader: ['http://iflastandards.info/ns/unimarc/terms/mop/s'],
  },
  {
    uri: 'tutti:instrument/baritone-saxophone',
    vocabulary_type: 'instrument',
    pref_label: { en: 'Baritone saxophone', nl: 'Baritonsaxofoon', de: 'Baritonsaxophon' },
    alt_labels: ['Bari sax'],
    broader: ['http://iflastandards.info/ns/unimarc/terms/mop/s'],
  },

  // Brass (b)
  {
    uri: 'http://iflastandards.info/ns/unimarc/terms/mop/b',
    vocabulary_type: 'instrument',
    pref_label: { en: 'Brass', nl: 'Koperblazers', de: 'Blechbläser' },
    notation: 'b',
    narrower: ['bab', 'bac', 'bad', 'bae', 'baf', 'bag', 'bah'],
  },
  {
    uri: 'http://iflastandards.info/ns/unimarc/terms/mop/bab',
    vocabulary_type: 'instrument',
    pref_label: { en: 'French horn', nl: 'Hoorn', de: 'Horn' },
    alt_labels: ['Horn in F', 'Waldhorn'],
    notation: 'bab',
    broader: ['http://iflastandards.info/ns/unimarc/terms/mop/b'],
  },
  {
    uri: 'http://iflastandards.info/ns/unimarc/terms/mop/bac',
    vocabulary_type: 'instrument',
    pref_label: { en: 'Trumpet', nl: 'Trompet', de: 'Trompete' },
    alt_labels: ['Bb trumpet'],
    notation: 'bac',
    broader: ['http://iflastandards.info/ns/unimarc/terms/mop/b'],
  },
  {
    uri: 'http://iflastandards.info/ns/unimarc/terms/mop/bad',
    vocabulary_type: 'instrument',
    pref_label: { en: 'Cornet', nl: 'Kornet', de: 'Kornett' },
    notation: 'bad',
    broader: ['http://iflastandards.info/ns/unimarc/terms/mop/b'],
  },
  {
    uri: 'tutti:instrument/flugelhorn',
    vocabulary_type: 'instrument',
    pref_label: { en: 'Flugelhorn', nl: 'Bugel', de: 'Flügelhorn' },
    broader: ['http://iflastandards.info/ns/unimarc/terms/mop/b'],
  },
  {
    uri: 'http://iflastandards.info/ns/unimarc/terms/mop/bae',
    vocabulary_type: 'instrument',
    pref_label: { en: 'Trombone', nl: 'Trombone', de: 'Posaune' },
    alt_labels: ['Tenor trombone', 'Schuiftrombone'],
    notation: 'bae',
    broader: ['http://iflastandards.info/ns/unimarc/terms/mop/b'],
  },
  {
    uri: 'tutti:instrument/bass-trombone',
    vocabulary_type: 'instrument',
    pref_label: { en: 'Bass trombone', nl: 'Bastrombone', de: 'Bassposaune' },
    broader: ['http://iflastandards.info/ns/unimarc/terms/mop/b'],
  },
  {
    uri: 'http://iflastandards.info/ns/unimarc/terms/mop/baf',
    vocabulary_type: 'instrument',
    pref_label: { en: 'Baritone horn', nl: 'Bariton', de: 'Baritonhorn' },
    alt_labels: ['Baritone', 'Baritonhoorn'],
    notation: 'baf',
    broader: ['http://iflastandards.info/ns/unimarc/terms/mop/b'],
  },
  {
    uri: 'http://iflastandards.info/ns/unimarc/terms/mop/bag',
    vocabulary_type: 'instrument',
    pref_label: { en: 'Euphonium', nl: 'Euphonium', de: 'Euphonium' },
    notation: 'bag',
    broader: ['http://iflastandards.info/ns/unimarc/terms/mop/b'],
  },
  {
    uri: 'http://iflastandards.info/ns/unimarc/terms/mop/bah',
    vocabulary_type: 'instrument',
    pref_label: { en: 'Tuba', nl: 'Tuba', de: 'Tuba' },
    alt_labels: ['Bass tuba', 'Bb tuba', 'Eb tuba'],
    notation: 'bah',
    broader: ['http://iflastandards.info/ns/unimarc/terms/mop/b'],
  },

  // Percussion (p)
  {
    uri: 'http://iflastandards.info/ns/unimarc/terms/mop/p',
    vocabulary_type: 'instrument',
    pref_label: { en: 'Percussion', nl: 'Slagwerk', de: 'Schlagzeug' },
    notation: 'p',
    narrower: ['pab', 'pac', 'pad', 'pae'],
  },
  {
    uri: 'http://iflastandards.info/ns/unimarc/terms/mop/pab',
    vocabulary_type: 'instrument',
    pref_label: { en: 'Timpani', nl: 'Pauken', de: 'Pauken' },
    alt_labels: ['Kettle drums'],
    notation: 'pab',
    broader: ['http://iflastandards.info/ns/unimarc/terms/mop/p'],
  },
  {
    uri: 'tutti:instrument/snare-drum',
    vocabulary_type: 'instrument',
    pref_label: { en: 'Snare drum', nl: 'Kleine trom', de: 'Kleine Trommel' },
    broader: ['http://iflastandards.info/ns/unimarc/terms/mop/p'],
  },
  {
    uri: 'tutti:instrument/bass-drum',
    vocabulary_type: 'instrument',
    pref_label: { en: 'Bass drum', nl: 'Grote trom', de: 'Große Trommel' },
    broader: ['http://iflastandards.info/ns/unimarc/terms/mop/p'],
  },
  {
    uri: 'tutti:instrument/cymbals',
    vocabulary_type: 'instrument',
    pref_label: { en: 'Cymbals', nl: 'Bekkens', de: 'Becken' },
    broader: ['http://iflastandards.info/ns/unimarc/terms/mop/p'],
  },
  {
    uri: 'http://iflastandards.info/ns/unimarc/terms/mop/pac',
    vocabulary_type: 'instrument',
    pref_label: { en: 'Xylophone', nl: 'Xylofoon', de: 'Xylophon' },
    notation: 'pac',
    broader: ['http://iflastandards.info/ns/unimarc/terms/mop/p'],
  },
  {
    uri: 'http://iflastandards.info/ns/unimarc/terms/mop/pad',
    vocabulary_type: 'instrument',
    pref_label: { en: 'Vibraphone', nl: 'Vibrafoon', de: 'Vibraphon' },
    notation: 'pad',
    broader: ['http://iflastandards.info/ns/unimarc/terms/mop/p'],
  },
  {
    uri: 'http://iflastandards.info/ns/unimarc/terms/mop/pae',
    vocabulary_type: 'instrument',
    pref_label: { en: 'Glockenspiel', nl: 'Klokkenspel', de: 'Glockenspiel' },
    alt_labels: ['Bells', 'Orchestra bells'],
    notation: 'pae',
    broader: ['http://iflastandards.info/ns/unimarc/terms/mop/p'],
  },
  {
    uri: 'tutti:instrument/marimba',
    vocabulary_type: 'instrument',
    pref_label: { en: 'Marimba', nl: 'Marimba', de: 'Marimba' },
    broader: ['http://iflastandards.info/ns/unimarc/terms/mop/p'],
  },
  {
    uri: 'tutti:instrument/chimes',
    vocabulary_type: 'instrument',
    pref_label: { en: 'Tubular bells', nl: 'Buisklokken', de: 'Röhrenglocken' },
    alt_labels: ['Chimes'],
    broader: ['http://iflastandards.info/ns/unimarc/terms/mop/p'],
  },

  // Strings (for occasional use in wind orchestra)
  {
    uri: 'http://iflastandards.info/ns/unimarc/terms/mop/t',
    vocabulary_type: 'instrument',
    pref_label: { en: 'Strings', nl: 'Strijkers', de: 'Streicher' },
    notation: 't',
  },
  {
    uri: 'http://iflastandards.info/ns/unimarc/terms/mop/tah',
    vocabulary_type: 'instrument',
    pref_label: { en: 'Double bass', nl: 'Contrabas', de: 'Kontrabass' },
    alt_labels: ['String bass', 'Bas'],
    notation: 'tah',
    broader: ['http://iflastandards.info/ns/unimarc/terms/mop/t'],
  },
  {
    uri: 'http://iflastandards.info/ns/unimarc/terms/mop/tai',
    vocabulary_type: 'instrument',
    pref_label: { en: 'Harp', nl: 'Harp', de: 'Harfe' },
    notation: 'tai',
    broader: ['http://iflastandards.info/ns/unimarc/terms/mop/t'],
  },

  // Keyboards
  {
    uri: 'http://iflastandards.info/ns/unimarc/terms/mop/k',
    vocabulary_type: 'instrument',
    pref_label: { en: 'Keyboards', nl: 'Keyboards', de: 'Tasteninstrumente' },
    notation: 'k',
  },
  {
    uri: 'http://iflastandards.info/ns/unimarc/terms/mop/kab',
    vocabulary_type: 'instrument',
    pref_label: { en: 'Piano', nl: 'Piano', de: 'Klavier' },
    notation: 'kab',
    broader: ['http://iflastandards.info/ns/unimarc/terms/mop/k'],
  },
];

/**
 * Genres based on LCGFT (Library of Congress Genre/Form Terms)
 * URI pattern: http://id.loc.gov/authorities/genreForms/{id}
 */
export const genreSeeds: VocabularySeed[] = [
  {
    uri: 'http://id.loc.gov/authorities/genreForms/gf2014026951',
    vocabulary_type: 'genre',
    pref_label: { en: 'Marches', nl: 'Marsen', de: 'Märsche' },
    notation: 'gf2014026951',
  },
  {
    uri: 'http://id.loc.gov/authorities/genreForms/gf2014027048',
    vocabulary_type: 'genre',
    pref_label: { en: 'Overtures', nl: 'Ouvertures', de: 'Ouvertüren' },
    notation: 'gf2014027048',
  },
  {
    uri: 'http://id.loc.gov/authorities/genreForms/gf2014027188',
    vocabulary_type: 'genre',
    pref_label: { en: 'Suites', nl: 'Suites', de: 'Suiten' },
    notation: 'gf2014027188',
  },
  {
    uri: 'http://id.loc.gov/authorities/genreForms/gf2014027245',
    vocabulary_type: 'genre',
    pref_label: { en: 'Waltzes', nl: 'Walsen', de: 'Walzer' },
    notation: 'gf2014027245',
  },
  {
    uri: 'http://id.loc.gov/authorities/genreForms/gf2014026971',
    vocabulary_type: 'genre',
    pref_label: { en: 'Symphonies', nl: 'Symfonieën', de: 'Sinfonien' },
    notation: 'gf2014026971',
  },
  {
    uri: 'http://id.loc.gov/authorities/genreForms/gf2014026870',
    vocabulary_type: 'genre',
    pref_label: { en: 'Fanfares', nl: 'Fanfares', de: 'Fanfaren' },
    notation: 'gf2014026870',
  },
  {
    uri: 'http://id.loc.gov/authorities/genreForms/gf2014026811',
    vocabulary_type: 'genre',
    pref_label: { en: 'Concertos', nl: 'Concerten', de: 'Konzerte' },
    notation: 'gf2014026811',
  },
  {
    uri: 'http://id.loc.gov/authorities/genreForms/gf2014027100',
    vocabulary_type: 'genre',
    pref_label: { en: 'Polkas', nl: "Polka's", de: 'Polkas' },
    notation: 'gf2014027100',
  },
  {
    uri: 'http://id.loc.gov/authorities/genreForms/gf2014027117',
    vocabulary_type: 'genre',
    pref_label: { en: 'Potpourris', nl: "Potpourri's", de: 'Potpourris' },
    alt_labels: ['Medleys'],
    notation: 'gf2014027117',
  },
  {
    uri: 'http://id.loc.gov/authorities/genreForms/gf2014026891',
    vocabulary_type: 'genre',
    pref_label: { en: 'Instrumental music', nl: 'Instrumentale muziek', de: 'Instrumentalmusik' },
    notation: 'gf2014026891',
  },
  {
    uri: 'tutti:genre/concert-work',
    vocabulary_type: 'genre',
    pref_label: { en: 'Concert work', nl: 'Concertwerk', de: 'Konzertwerk' },
    alt_labels: ['Original composition'],
  },
  {
    uri: 'tutti:genre/film-music',
    vocabulary_type: 'genre',
    pref_label: { en: 'Film music', nl: 'Filmmuziek', de: 'Filmmusik' },
    alt_labels: ['Movie music', 'Soundtrack'],
  },
  {
    uri: 'tutti:genre/musical',
    vocabulary_type: 'genre',
    pref_label: { en: 'Musical', nl: 'Musical', de: 'Musical' },
    alt_labels: ['Show music', 'Broadway'],
  },
  {
    uri: 'tutti:genre/pop-arrangement',
    vocabulary_type: 'genre',
    pref_label: { en: 'Pop arrangement', nl: 'Poparrangement', de: 'Pop-Arrangement' },
    alt_labels: ['Pop music', 'Chart hits'],
  },
  {
    uri: 'tutti:genre/traditional',
    vocabulary_type: 'genre',
    pref_label: { en: 'Traditional', nl: 'Traditioneel', de: 'Traditionell' },
    alt_labels: ['Folk music', 'Volksmuziek'],
  },
  {
    uri: 'tutti:genre/christmas',
    vocabulary_type: 'genre',
    pref_label: { en: 'Christmas music', nl: 'Kerstmuziek', de: 'Weihnachtsmusik' },
    alt_labels: ['Holiday music', 'Kerstliederen'],
  },
];

/**
 * Get SQL INSERT statements for seeding the vocabulary_cache table
 */
export function getVocabularySeedSQL(): string {
  const allSeeds = [...instrumentSeeds, ...genreSeeds];

  const inserts = allSeeds.map((seed) => {
    const prefLabel = JSON.stringify(seed.pref_label);
    const altLabels = seed.alt_labels ? JSON.stringify(seed.alt_labels) : 'NULL';
    const broader = seed.broader ? JSON.stringify(seed.broader) : 'NULL';
    const narrower = seed.narrower ? JSON.stringify(seed.narrower) : 'NULL';
    const notation = seed.notation ? `'${seed.notation}'` : 'NULL';

    return `INSERT OR IGNORE INTO vocabulary_cache (uri, vocabulary_type, pref_label, alt_labels, broader, narrower, notation, fetched_at)
VALUES ('${seed.uri}', '${seed.vocabulary_type}', '${prefLabel.replace(/'/g, "''")}', ${altLabels === 'NULL' ? 'NULL' : `'${altLabels.replace(/'/g, "''")}'`}, ${broader === 'NULL' ? 'NULL' : `'${broader.replace(/'/g, "''")}'`}, ${narrower === 'NULL' ? 'NULL' : `'${narrower.replace(/'/g, "''")}'`}, ${notation}, datetime('now'));`;
  });

  return inserts.join('\n');
}
