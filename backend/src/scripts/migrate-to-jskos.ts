#!/usr/bin/env npx ts-node
/**
 * Migration Script: Link existing data to JSKOS URIs
 *
 * This script analyzes existing music_titles data and attempts to:
 * 1. Match instrumentation text to JSKOS instrument URIs
 * 2. Match genre names to JSKOS genre URIs
 *
 * Usage:
 *   npx ts-node src/scripts/migrate-to-jskos.ts [options]
 *
 * Options:
 *   --dry-run       Preview changes without applying them
 *   --verbose       Show detailed matching information
 *   --association   Limit to specific association ID
 */

import db from '../database/connection';
import { searchConcepts, linkTitleToInstruments, linkTitleToVocabulary, JskosConcept } from '../services/jskos';

interface MigrationOptions {
  dryRun: boolean;
  verbose: boolean;
  associationId?: string;
}

interface MigrationStats {
  titlesProcessed: number;
  instrumentsMatched: number;
  instrumentsUnmatched: number;
  genresMatched: number;
  genresUnmatched: number;
  unmatchedInstruments: Set<string>;
  unmatchedGenres: Set<string>;
}

function parseArgs(): MigrationOptions {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Migration Script: Link existing data to JSKOS URIs

Usage:
  npx ts-node src/scripts/migrate-to-jskos.ts [options]

Options:
  --dry-run         Preview changes without applying them
  --verbose         Show detailed matching information
  --association     Limit to specific association ID
  --help, -h        Show this help message
    `);
    process.exit(0);
  }

  let dryRun = false;
  let verbose = false;
  let associationId: string | undefined;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--dry-run':
        dryRun = true;
        break;
      case '--verbose':
        verbose = true;
        break;
      case '--association':
        associationId = args[++i];
        break;
    }
  }

  return { dryRun, verbose, associationId };
}

// Common instrument name mappings
const instrumentMappings: Record<string, string[]> = {
  fluit: ['flute', 'fluit', 'dwarsfluit'],
  piccolo: ['piccolo', 'pikkolofluit', 'piccolo flute'],
  hobo: ['oboe', 'hobo'],
  fagot: ['bassoon', 'fagot'],
  klarinet: ['clarinet', 'klarinet', 'bb clarinet', 'bes klarinet'],
  basklarinet: ['bass clarinet', 'basklarinet', 'bas klarinet'],
  'es-klarinet': ['eb clarinet', 'es klarinet', 'es-klarinet', 'kleine klarinet'],
  altsaxofoon: ['alto saxophone', 'altsax', 'alt sax', 'altsaxofoon'],
  tenorsaxofoon: ['tenor saxophone', 'tenorsax', 'tenor sax', 'tenorsaxofoon'],
  baritonsaxofoon: ['baritone saxophone', 'baritonsax', 'bari sax', 'baritonsaxofoon'],
  sopraansaxofoon: ['soprano saxophone', 'sopraansax', 'sopraan sax'],
  hoorn: ['french horn', 'hoorn', 'f hoorn', 'waldhoorn', 'horn'],
  trompet: ['trumpet', 'trompet', 'bb trompet'],
  kornet: ['cornet', 'kornet'],
  bugel: ['flugelhorn', 'bugel', 'flugel'],
  trombone: ['trombone', 'schuiftrombone', 'tenor trombone'],
  bastrombone: ['bass trombone', 'bastrombone'],
  bariton: ['baritone horn', 'bariton', 'baritone', 'euphonium'],
  euphonium: ['euphonium', 'eufonium'],
  tuba: ['tuba', 'bas tuba'],
  slagwerk: ['percussion', 'slagwerk', 'drums', 'percussie'],
  pauken: ['timpani', 'pauken', 'kettle drums'],
  xylofoon: ['xylophone', 'xylofoon'],
  vibrafoon: ['vibraphone', 'vibrafoon'],
  klokkenspel: ['glockenspiel', 'klokkenspel', 'bells'],
  marimba: ['marimba'],
  contrabas: ['double bass', 'contrabas', 'string bass', 'bas'],
  piano: ['piano', 'keyboard'],
  harp: ['harp'],
};

// Genre name mappings
const genreMappings: Record<string, string[]> = {
  mars: ['march', 'mars', 'marsen', 'marches'],
  ouverture: ['overture', 'ouverture', 'ouvertures'],
  suite: ['suite', 'suites'],
  wals: ['waltz', 'wals', 'walsen', 'waltzes'],
  symfonie: ['symphony', 'symfonie', 'sinfonieën', 'symphonies'],
  fanfare: ['fanfare', 'fanfares'],
  concert: ['concerto', 'concert', 'concerten', 'concertos'],
  polka: ['polka', "polka's", 'polkas'],
  potpourri: ['potpourri', 'medley', "potpourri's", 'medleys'],
  filmmuziek: ['film music', 'filmmuziek', 'movie music', 'soundtrack'],
  musical: ['musical', 'show music', 'broadway'],
  pop: ['pop arrangement', 'poparrangement', 'pop music'],
  traditioneel: ['traditional', 'traditioneel', 'folk music', 'volksmuziek'],
  kerstmuziek: ['christmas music', 'kerstmuziek', 'holiday music', 'kerstliederen'],
};

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, '');
}

function findInstrumentMatch(text: string): JskosConcept | null {
  const normalized = normalizeText(text);

  // Try direct search first
  const directResult = searchConcepts(normalized, 'instrument', 1, 'nl');
  if (directResult.concepts.length > 0) {
    return directResult.concepts[0];
  }

  // Try mappings
  for (const [key, aliases] of Object.entries(instrumentMappings)) {
    if (aliases.some((alias) => normalized.includes(alias) || alias.includes(normalized))) {
      const result = searchConcepts(key, 'instrument', 1, 'nl');
      if (result.concepts.length > 0) {
        return result.concepts[0];
      }
    }
  }

  return null;
}

function findGenreMatch(genreName: string): JskosConcept | null {
  const normalized = normalizeText(genreName);

  // Try direct search first
  const directResult = searchConcepts(normalized, 'genre', 1, 'nl');
  if (directResult.concepts.length > 0) {
    return directResult.concepts[0];
  }

  // Try mappings
  for (const [key, aliases] of Object.entries(genreMappings)) {
    if (aliases.some((alias) => normalized.includes(alias) || alias.includes(normalized))) {
      const result = searchConcepts(key, 'genre', 1, 'nl');
      if (result.concepts.length > 0) {
        return result.concepts[0];
      }
    }
  }

  return null;
}

async function main() {
  const options = parseArgs();

  console.log('\nJSKOS Migration Script');
  console.log('======================');
  console.log(`Mode: ${options.dryRun ? 'DRY RUN (no changes)' : 'LIVE'}`);
  console.log(`Verbose: ${options.verbose ? 'Yes' : 'No'}`);
  if (options.associationId) {
    console.log(`Association: ${options.associationId}`);
  }
  console.log('');

  await db.init();

  const stats: MigrationStats = {
    titlesProcessed: 0,
    instrumentsMatched: 0,
    instrumentsUnmatched: 0,
    genresMatched: 0,
    genresUnmatched: 0,
    unmatchedInstruments: new Set(),
    unmatchedGenres: new Set(),
  };

  // Get all music titles with their associated genres
  let titlesSql = `
    SELECT t.id, t.title, t.association_id
    FROM music_titles t
  `;
  const params: string[] = [];

  if (options.associationId) {
    titlesSql += ' WHERE t.association_id = ?';
    params.push(options.associationId);
  }

  const titles = db.prepare(titlesSql).all(...params) as Array<{ id: string; title: string; association_id: string }>;

  console.log(`Found ${titles.length} titles to process\n`);

  for (const title of titles) {
    stats.titlesProcessed++;

    if (options.verbose) {
      console.log(`Processing: ${title.title}`);
    }

    // Get existing genre associations (from the old genres table)
    const existingGenres = db
      .prepare(
        `
      SELECT g.name
      FROM music_title_genres mtg
      JOIN genres g ON g.id = mtg.genre_id
      WHERE mtg.music_title_id = ?
    `,
      )
      .all(title.id) as Array<{ name: string }>;

    // Try to match genres to JSKOS
    const matchedGenres: string[] = [];

    for (const genre of existingGenres) {
      const match = findGenreMatch(genre.name);
      if (match) {
        matchedGenres.push(match.uri);
        stats.genresMatched++;
        if (options.verbose) {
          console.log(`  Genre matched: ${genre.name} -> ${match.prefLabel.nl || match.prefLabel.en}`);
        }
      } else {
        stats.genresUnmatched++;
        stats.unmatchedGenres.add(genre.name);
        if (options.verbose) {
          console.log(`  Genre unmatched: ${genre.name}`);
        }
      }
    }

    // Link genres if not dry run
    if (!options.dryRun && matchedGenres.length > 0) {
      linkTitleToVocabulary(title.id, 'genre', matchedGenres);
    }

    // Get instrumentation from music_metadata parts if available
    const metadata = db
      .prepare(
        `
      SELECT parts FROM music_metadata WHERE music_title_id = ?
    `,
      )
      .get(title.id) as { parts: string | null } | undefined;

    if (metadata?.parts) {
      try {
        const parts = JSON.parse(metadata.parts) as Array<{ name: string; instrument?: string }>;
        const matchedInstruments: Array<{ uri: string; count: number }> = [];
        const instrumentCounts = new Map<string, number>();

        for (const part of parts) {
          const instrumentName = part.instrument || part.name;
          const match = findInstrumentMatch(instrumentName);

          if (match) {
            const count = instrumentCounts.get(match.uri) || 0;
            instrumentCounts.set(match.uri, count + 1);
            stats.instrumentsMatched++;
            if (options.verbose) {
              console.log(`  Instrument matched: ${instrumentName} -> ${match.prefLabel.nl || match.prefLabel.en}`);
            }
          } else {
            stats.instrumentsUnmatched++;
            stats.unmatchedInstruments.add(instrumentName);
            if (options.verbose) {
              console.log(`  Instrument unmatched: ${instrumentName}`);
            }
          }
        }

        // Convert counts to array
        for (const [uri, count] of instrumentCounts) {
          matchedInstruments.push({ uri, count });
        }

        // Link instruments if not dry run
        if (!options.dryRun && matchedInstruments.length > 0) {
          linkTitleToInstruments(title.id, matchedInstruments);
        }
      } catch (e) {
        // Invalid JSON, skip
      }
    }
  }

  // Print summary
  console.log('\nMigration Summary');
  console.log('-----------------');
  console.log(`Titles processed: ${stats.titlesProcessed}`);
  console.log(`Genres matched: ${stats.genresMatched}`);
  console.log(`Genres unmatched: ${stats.genresUnmatched}`);
  console.log(`Instruments matched: ${stats.instrumentsMatched}`);
  console.log(`Instruments unmatched: ${stats.instrumentsUnmatched}`);

  if (stats.unmatchedGenres.size > 0) {
    console.log('\nUnmatched genres:');
    for (const genre of stats.unmatchedGenres) {
      console.log(`  - ${genre}`);
    }
  }

  if (stats.unmatchedInstruments.size > 0) {
    console.log('\nUnmatched instruments:');
    for (const instrument of stats.unmatchedInstruments) {
      console.log(`  - ${instrument}`);
    }
  }

  if (options.dryRun) {
    console.log('\n[DRY RUN] No changes were made. Remove --dry-run to apply changes.');
  } else {
    console.log('\nMigration complete.');
  }

  process.exit(0);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
