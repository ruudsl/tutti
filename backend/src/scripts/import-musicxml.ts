#!/usr/bin/env npx ts-node
/**
 * MusicXML Batch Import Script
 *
 * Imports MusicXML files from a directory and extracts metadata for matching music titles.
 *
 * Usage:
 *   npx ts-node src/scripts/import-musicxml.ts <directory> [options]
 *
 * Options:
 *   --dry-run       Preview what would be imported without making changes
 *   --association   Association ID to import into (required)
 *   --create        Create new music_titles for unmatched files
 *   --verbose       Show detailed output
 *
 * Examples:
 *   npx ts-node src/scripts/import-musicxml.ts ./musicxml --association abc123 --dry-run
 *   npx ts-node src/scripts/import-musicxml.ts ./musicxml --association abc123 --create
 */

import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import {
  parseMusicXML,
  validateMusicXML,
  extractTitle,
  extractComposer,
  extractArranger,
  extractLyricist,
  partsToJson,
  isCompressedMusicXML,
  ParsedMusicXML,
} from '../services/musicxml';

interface ImportOptions {
  directory: string;
  associationId: string;
  dryRun: boolean;
  createNew: boolean;
  verbose: boolean;
}

interface ImportResult {
  file: string;
  status: 'success' | 'matched' | 'created' | 'skipped' | 'error';
  titleId?: string;
  title?: string;
  message?: string;
}

function parseArgs(): ImportOptions {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
MusicXML Batch Import Script

Usage:
  npx ts-node src/scripts/import-musicxml.ts <directory> [options]

Options:
  --association <id>   Association ID to import into (required)
  --dry-run            Preview what would be imported without making changes
  --create             Create new music_titles for unmatched files
  --verbose            Show detailed output
  --help, -h           Show this help message

Examples:
  npx ts-node src/scripts/import-musicxml.ts ./musicxml --association abc123 --dry-run
  npx ts-node src/scripts/import-musicxml.ts ./musicxml --association abc123 --create --verbose
        `);
    process.exit(0);
  }

  const directory = args[0];
  let associationId = '';
  let dryRun = false;
  let createNew = false;
  let verbose = false;

  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case '--association':
        associationId = args[++i] || '';
        break;
      case '--dry-run':
        dryRun = true;
        break;
      case '--create':
        createNew = true;
        break;
      case '--verbose':
        verbose = true;
        break;
    }
  }

  if (!associationId) {
    console.error('Error: --association is required');
    process.exit(1);
  }

  return { directory, associationId, dryRun, createNew, verbose };
}

function findMusicXMLFiles(directory: string): string[] {
  const files: string[] = [];
  const entries = fs.readdirSync(directory, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...findMusicXMLFiles(fullPath));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (['.xml', '.musicxml'].includes(ext)) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

function findMatchingTitle(parsed: ParsedMusicXML, associationId: string): { id: string; title: string } | null {
  const searchTitle = extractTitle(parsed);
  const composer = extractComposer(parsed);

  if (!searchTitle) return null;

  // Try exact match first
  let match = db
    .prepare(
      `
        SELECT id, title FROM music_titles
        WHERE association_id = ? AND (
            LOWER(title) = LOWER(?)
            OR LOWER(title) LIKE LOWER(?)
        )
        LIMIT 1
    `,
    )
    .get(associationId, searchTitle, `%${searchTitle}%`) as { id: string; title: string } | undefined;

  if (match) return match;

  // Try matching with composer
  if (composer) {
    match = db
      .prepare(
        `
            SELECT id, title FROM music_titles
            WHERE association_id = ?
            AND LOWER(composer) = LOWER(?)
            AND LOWER(title) LIKE LOWER(?)
            LIMIT 1
        `,
      )
      .get(associationId, composer, `%${searchTitle.split(' ')[0]}%`) as { id: string; title: string } | undefined;

    if (match) return match;
  }

  return null;
}

function importMusicXMLFile(filePath: string, parsed: ParsedMusicXML, titleId: string, dryRun: boolean): void {
  if (dryRun) return;

  const existingMeta = db.prepare('SELECT id FROM music_metadata WHERE music_title_id = ?').get(titleId) as
    { id: string } | undefined;
  const metadataId = existingMeta?.id || uuidv4();

  if (existingMeta) {
    db.prepare(
      `
            UPDATE music_metadata SET
                work_number = ?,
                movement_number = ?,
                movement_title = ?,
                lyricist = ?,
                rights = ?,
                source = ?,
                encoding_software = ?,
                encoding_date = ?,
                parts = ?,
                musicxml_raw = ?,
                updated_at = datetime('now')
            WHERE id = ?
        `,
    ).run(
      parsed.workNumber || null,
      parsed.movementNumber || null,
      parsed.movementTitle || null,
      extractLyricist(parsed),
      parsed.rights || null,
      parsed.source || null,
      parsed.encoding?.software || null,
      parsed.encoding?.encodingDate || null,
      partsToJson(parsed.parts),
      parsed.rawXml,
      metadataId,
    );
  } else {
    db.prepare(
      `
            INSERT INTO music_metadata (
                id, music_title_id, work_number, movement_number, movement_title,
                lyricist, rights, source, encoding_software, encoding_date,
                parts, musicxml_raw, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `,
    ).run(
      metadataId,
      titleId,
      parsed.workNumber || null,
      parsed.movementNumber || null,
      parsed.movementTitle || null,
      extractLyricist(parsed),
      parsed.rights || null,
      parsed.source || null,
      parsed.encoding?.software || null,
      parsed.encoding?.encodingDate || null,
      partsToJson(parsed.parts),
      parsed.rawXml,
    );
  }

  // Update music_titles with composer/arranger if empty
  const title = db.prepare('SELECT composer, arranger FROM music_titles WHERE id = ?').get(titleId) as {
    composer: string | null;
    arranger: string | null;
  };
  const updates: string[] = [];
  const params: (string | null)[] = [];

  const parsedComposer = extractComposer(parsed);
  const parsedArranger = extractArranger(parsed);

  if (parsedComposer && !title.composer) {
    updates.push('composer = ?');
    params.push(parsedComposer);
  }
  if (parsedArranger && !title.arranger) {
    updates.push('arranger = ?');
    params.push(parsedArranger);
  }

  if (updates.length > 0) {
    params.push(titleId);
    db.prepare(`UPDATE music_titles SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  }
}

function createNewTitle(parsed: ParsedMusicXML, associationId: string, dryRun: boolean): string {
  const titleId = uuidv4();
  const title = extractTitle(parsed) || 'Untitled';

  if (!dryRun) {
    db.prepare(
      `
            INSERT INTO music_titles (id, title, composer, arranger, association_id, created_at)
            VALUES (?, ?, ?, ?, ?, datetime('now'))
        `,
    ).run(titleId, title, extractComposer(parsed), extractArranger(parsed), associationId);
  }

  return titleId;
}

async function main() {
  const options = parseArgs();

  // Validate directory
  if (!fs.existsSync(options.directory)) {
    console.error(`Error: Directory not found: ${options.directory}`);
    process.exit(1);
  }

  // Validate association
  await db.init();
  const association = db.prepare('SELECT id, name FROM associations WHERE id = ?').get(options.associationId) as
    { id: string; name: string } | undefined;

  if (!association) {
    console.error(`Error: Association not found: ${options.associationId}`);
    process.exit(1);
  }

  console.log(`\nMusicXML Batch Import`);
  console.log(`=====================`);
  console.log(`Directory: ${options.directory}`);
  console.log(`Association: ${association.name} (${association.id})`);
  console.log(`Mode: ${options.dryRun ? 'DRY RUN (no changes)' : 'LIVE'}`);
  console.log(`Create new titles: ${options.createNew ? 'Yes' : 'No'}`);
  console.log('');

  // Find MusicXML files
  const files = findMusicXMLFiles(options.directory);
  console.log(`Found ${files.length} MusicXML file(s)\n`);

  if (files.length === 0) {
    console.log('No files to process.');
    process.exit(0);
  }

  const results: ImportResult[] = [];

  for (const filePath of files) {
    const fileName = path.basename(filePath);

    if (options.verbose) {
      console.log(`Processing: ${fileName}`);
    }

    try {
      // Read file
      const content = fs.readFileSync(filePath, 'utf-8');
      const buffer = fs.readFileSync(filePath);

      // Check for compressed MusicXML
      if (isCompressedMusicXML(buffer)) {
        results.push({
          file: fileName,
          status: 'skipped',
          message: 'Compressed MusicXML (.mxl) not supported',
        });
        continue;
      }

      // Validate
      const errors = validateMusicXML(content);
      if (errors.length > 0) {
        results.push({
          file: fileName,
          status: 'error',
          message: errors.map((e) => e.message).join(', '),
        });
        continue;
      }

      // Parse
      const parseResult = parseMusicXML(content);
      if (!parseResult.success || !parseResult.data) {
        results.push({
          file: fileName,
          status: 'error',
          message: parseResult.errors.map((e) => e.message).join(', '),
        });
        continue;
      }

      const parsed = parseResult.data;
      const extractedTitle = extractTitle(parsed);

      // Find matching title
      const match = findMatchingTitle(parsed, options.associationId);

      if (match) {
        importMusicXMLFile(filePath, parsed, match.id, options.dryRun);
        results.push({
          file: fileName,
          status: 'matched',
          titleId: match.id,
          title: match.title,
          message: `Matched to "${match.title}"`,
        });
      } else if (options.createNew) {
        const newTitleId = createNewTitle(parsed, options.associationId, options.dryRun);
        importMusicXMLFile(filePath, parsed, newTitleId, options.dryRun);
        results.push({
          file: fileName,
          status: 'created',
          titleId: newTitleId,
          title: extractedTitle || 'Untitled',
          message: `Created new title "${extractedTitle}"`,
        });
      } else {
        results.push({
          file: fileName,
          status: 'skipped',
          message: `No matching title found for "${extractedTitle}"`,
        });
      }
    } catch (error) {
      results.push({
        file: fileName,
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Print summary
  console.log('\nResults:');
  console.log('--------');

  const matched = results.filter((r) => r.status === 'matched');
  const created = results.filter((r) => r.status === 'created');
  const skipped = results.filter((r) => r.status === 'skipped');
  const errors = results.filter((r) => r.status === 'error');

  console.log(`  Matched: ${matched.length}`);
  console.log(`  Created: ${created.length}`);
  console.log(`  Skipped: ${skipped.length}`);
  console.log(`  Errors:  ${errors.length}`);

  if (options.verbose || errors.length > 0) {
    if (errors.length > 0) {
      console.log('\nErrors:');
      for (const r of errors) {
        console.log(`  - ${r.file}: ${r.message}`);
      }
    }

    if (skipped.length > 0 && options.verbose) {
      console.log('\nSkipped:');
      for (const r of skipped) {
        console.log(`  - ${r.file}: ${r.message}`);
      }
    }
  }

  if (options.dryRun) {
    console.log('\n[DRY RUN] No changes were made. Remove --dry-run to import.');
  } else {
    console.log(`\nImport complete. ${matched.length + created.length} file(s) processed.`);
  }

  process.exit(errors.length > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
