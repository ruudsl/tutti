/**
 * Interoperability Routes (WP5)
 *
 * Endpoints for exporting repertoire data in standard formats:
 * - JSON-LD with JSKOS vocabularies
 * - MusicXML bundle
 * - CSV export
 */

import { Router, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import db from '../database/connection';

const router = Router();

interface TitleRow {
  id: string;
  title: string;
  composer: string | null;
  arranger: string | null;
  duration_seconds: number | null;
  grade: string | null;
  work_number: string | null;
  movement_number: number | null;
  movement_title: string | null;
  lyricist: string | null;
  rights: string | null;
  source: string | null;
  parts: string | null;
}

interface InstrumentRow {
  music_title_id: string;
  uri: string;
  count: number;
  pref_label: string | null;
}

interface GenreRow {
  music_title_id: string;
  uri: string;
  pref_label: string | null;
}

/**
 * @swagger
 * /interop/orchestras/{orchestraId}/repertoire.json:
 *   get:
 *     summary: Export orchestra repertoire as JSON-LD
 *     tags: [Interoperability]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orchestraId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [jsonld, simple]
 *           default: jsonld
 *     responses:
 *       200:
 *         description: Repertoire in JSON-LD format
 *         content:
 *           application/ld+json:
 *             schema:
 *               type: object
 */
router.get(
  '/orchestras/:orchestraId/repertoire.json',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { orchestraId } = req.params;
    const format = (req.query.format as string) || 'jsonld';

    // Check if orchestra belongs to user's association
    const orchestra = db
      .prepare(
        `
    SELECT o.id, o.name, a.name as association_name
    FROM orchestras o
    JOIN associations a ON a.id = o.association_id
    WHERE o.id = ? AND o.association_id = ?
  `,
      )
      .get(orchestraId, req.user!.associationId) as { id: string; name: string; association_name: string } | undefined;

    if (!orchestra) {
      throw new ApiError(404, 'Orkest niet gevonden.');
    }

    // Het repertoire van dit orkest, niet van de hele vereniging.
    //
    // orchestraId werd hierboven gecontroleerd en daarna niet meer gebruikt:
    // de query filterde alleen op association_id. Bij een vereniging met een
    // harmonie en een opleidingsorkest kreeg je dus twee keer dezelfde,
    // veel te brede lijst - terwijl het antwoord hem wel als het repertoire
    // van dit ene orkest aanduidt (tutti:orchestra/<id>).
    //
    // music_titles kent geen orkest; de weg loopt via de muzieklijsten van
    // het orkest naar de partijen, en van partij naar titel op titel en
    // arrangeur - dezelfde koppeling als music-lists.ts legt.
    const titles = db
      .prepare(
        `
    SELECT
      t.id, t.title, t.composer, t.arranger, t.duration_seconds, t.grade,
      m.work_number, m.movement_number, m.movement_title, m.lyricist, m.rights, m.source, m.parts
    FROM music_titles t
    LEFT JOIN music_metadata m ON m.music_title_id = t.id
    WHERE t.association_id = ?
      AND t.deleted_at IS NULL
      AND EXISTS (
        SELECT 1
        FROM music_pieces mp
        JOIN music_list_pieces mlp ON mlp.music_piece_id = mp.id
        JOIN music_lists ml ON ml.id = mlp.music_list_id
        WHERE ml.orchestra_id = ?
          AND ml.deleted_at IS NULL
          AND mp.deleted_at IS NULL
          AND mp.title = t.title
          AND COALESCE(mp.arranger, '') = COALESCE(t.arranger, '')
      )
    ORDER BY t.title
  `,
      )
      .all(req.user!.associationId, orchestraId) as TitleRow[];

    // Get instruments for all titles
    const instruments = db
      .prepare(
        `
    SELECT i.music_title_id, i.instrument_uri as uri, i.count, v.pref_label
    FROM music_title_instruments i
    JOIN music_titles t ON t.id = i.music_title_id
    LEFT JOIN vocabulary_cache v ON v.uri = i.instrument_uri
    WHERE t.association_id = ?
  `,
      )
      .all(req.user!.associationId) as InstrumentRow[];

    // Get genres for all titles
    const genres = db
      .prepare(
        `
    SELECT g.music_title_id, g.vocabulary_uri as uri, v.pref_label
    FROM music_title_vocabulary g
    JOIN music_titles t ON t.id = g.music_title_id
    LEFT JOIN vocabulary_cache v ON v.uri = g.vocabulary_uri
    WHERE t.association_id = ? AND g.vocabulary_type = 'genre'
  `,
      )
      .all(req.user!.associationId) as GenreRow[];

    // Group instruments and genres by title
    const instrumentsByTitle = new Map<string, InstrumentRow[]>();
    const genresByTitle = new Map<string, GenreRow[]>();

    for (const instr of instruments) {
      if (!instrumentsByTitle.has(instr.music_title_id)) {
        instrumentsByTitle.set(instr.music_title_id, []);
      }
      instrumentsByTitle.get(instr.music_title_id)!.push(instr);
    }

    for (const genre of genres) {
      if (!genresByTitle.has(genre.music_title_id)) {
        genresByTitle.set(genre.music_title_id, []);
      }
      genresByTitle.get(genre.music_title_id)!.push(genre);
    }

    if (format === 'simple') {
      // Simple JSON format without JSON-LD context
      res.json({
        orchestra: {
          id: orchestra.id,
          name: orchestra.name,
          association: orchestra.association_name,
        },
        repertoire: titles.map((t) => ({
          id: t.id,
          title: t.title,
          composer: t.composer,
          arranger: t.arranger,
          duration: t.duration_seconds,
          grade: t.grade,
          workNumber: t.work_number,
          movementNumber: t.movement_number,
          movementTitle: t.movement_title,
          instruments: (instrumentsByTitle.get(t.id) || []).map((i) => ({
            uri: i.uri,
            count: i.count,
            label: i.pref_label ? JSON.parse(i.pref_label) : null,
          })),
          genres: (genresByTitle.get(t.id) || []).map((g) => ({
            uri: g.uri,
            label: g.pref_label ? JSON.parse(g.pref_label) : null,
          })),
        })),
        exportedAt: new Date().toISOString(),
        totalTitles: titles.length,
      });
    } else {
      // JSON-LD format with JSKOS context
      res.setHeader('Content-Type', 'application/ld+json');
      res.json({
        '@context': {
          '@vocab': 'http://schema.org/',
          jskos: 'http://uri.gbv.de/terminology/jskos/',
          mo: 'http://purl.org/ontology/mo/',
          dc: 'http://purl.org/dc/elements/1.1/',
          dcterms: 'http://purl.org/dc/terms/',
          tutti: 'https://tutti.app/ns/',
          name: 'schema:name',
          composer: 'mo:composer',
          arranger: 'mo:arranger',
          duration: 'mo:duration',
          instrument: 'mo:instrument',
          genre: 'mo:genre',
        },
        '@type': 'MusicGroup',
        '@id': `tutti:orchestra/${orchestra.id}`,
        name: orchestra.name,
        memberOf: {
          '@type': 'Organization',
          name: orchestra.association_name,
        },
        repertoire: {
          '@type': 'ItemList',
          numberOfItems: titles.length,
          itemListElement: titles.map((t, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            item: {
              '@type': 'MusicComposition',
              '@id': `tutti:title/${t.id}`,
              name: t.title,
              ...(t.composer && { composer: { '@type': 'Person', name: t.composer } }),
              ...(t.arranger && { arranger: { '@type': 'Person', name: t.arranger } }),
              ...(t.duration_seconds && { duration: `PT${t.duration_seconds}S` }),
              ...(t.grade && { 'tutti:grade': t.grade }),
              ...(t.work_number && { 'mo:opus': t.work_number }),
              ...(t.movement_number && { 'mo:movement_number': t.movement_number }),
              ...(t.movement_title && { 'mo:movement': t.movement_title }),
              instrument: (instrumentsByTitle.get(t.id) || []).map((i) => ({
                '@type': 'jskos:Concept',
                '@id': i.uri,
                prefLabel: i.pref_label ? JSON.parse(i.pref_label) : undefined,
                'tutti:count': i.count,
              })),
              genre: (genresByTitle.get(t.id) || []).map((g) => ({
                '@type': 'jskos:Concept',
                '@id': g.uri,
                prefLabel: g.pref_label ? JSON.parse(g.pref_label) : undefined,
              })),
            },
          })),
        },
        'dcterms:created': new Date().toISOString(),
      });
    }
  }),
);

/**
 * @swagger
 * /interop/titles/{titleId}.json:
 *   get:
 *     summary: Export single title as JSON-LD
 *     tags: [Interoperability]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: titleId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Title in JSON-LD format
 */
router.get(
  '/titles/:titleId.json',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { titleId } = req.params;

    const title = db
      .prepare(
        `
    SELECT
      t.id, t.title, t.composer, t.arranger, t.duration_seconds, t.grade,
      t.youtube_url, t.description,
      m.work_number, m.movement_number, m.movement_title, m.lyricist, m.rights, m.source, m.parts
    FROM music_titles t
    LEFT JOIN music_metadata m ON m.music_title_id = t.id
    WHERE t.id = ? AND t.association_id = ? AND t.deleted_at IS NULL
  `,
      )
      .get(titleId, req.user!.associationId) as
      (TitleRow & { youtube_url: string | null; description: string | null }) | undefined;

    if (!title) {
      throw new ApiError(404, 'Titel niet gevonden.');
    }

    const instruments = db
      .prepare(
        `
    SELECT i.instrument_uri as uri, i.count, i.is_optional, i.notes, v.pref_label, v.notation
    FROM music_title_instruments i
    LEFT JOIN vocabulary_cache v ON v.uri = i.instrument_uri
    WHERE i.music_title_id = ?
  `,
      )
      .all(titleId) as Array<{
      uri: string;
      count: number;
      is_optional: number;
      notes: string | null;
      pref_label: string | null;
      notation: string | null;
    }>;

    const genres = db
      .prepare(
        `
    SELECT g.vocabulary_uri as uri, v.pref_label, v.notation
    FROM music_title_vocabulary g
    LEFT JOIN vocabulary_cache v ON v.uri = g.vocabulary_uri
    WHERE g.music_title_id = ? AND g.vocabulary_type = 'genre'
  `,
      )
      .all(titleId) as Array<{ uri: string; pref_label: string | null; notation: string | null }>;

    res.setHeader('Content-Type', 'application/ld+json');
    res.json({
      '@context': {
        '@vocab': 'http://schema.org/',
        jskos: 'http://uri.gbv.de/terminology/jskos/',
        mo: 'http://purl.org/ontology/mo/',
        dc: 'http://purl.org/dc/elements/1.1/',
        dcterms: 'http://purl.org/dc/terms/',
        tutti: 'https://tutti.app/ns/',
      },
      '@type': 'MusicComposition',
      '@id': `tutti:title/${title.id}`,
      name: title.title,
      ...(title.composer && {
        composer: {
          '@type': 'Person',
          name: title.composer,
        },
      }),
      ...(title.arranger && {
        arranger: {
          '@type': 'Person',
          name: title.arranger,
        },
      }),
      ...(title.lyricist && {
        lyricist: {
          '@type': 'Person',
          name: title.lyricist,
        },
      }),
      ...(title.duration_seconds && { duration: `PT${title.duration_seconds}S` }),
      ...(title.grade && { 'tutti:grade': title.grade }),
      ...(title.work_number && { 'mo:opus': title.work_number }),
      ...(title.movement_number && { 'mo:movement_number': title.movement_number }),
      ...(title.movement_title && { 'mo:movement': title.movement_title }),
      ...(title.rights && { 'dcterms:rights': title.rights }),
      ...(title.source && { 'dcterms:source': title.source }),
      ...(title.description && { description: title.description }),
      instrument: instruments.map((i) => ({
        '@type': 'jskos:Concept',
        '@id': i.uri,
        prefLabel: i.pref_label ? JSON.parse(i.pref_label) : undefined,
        notation: i.notation,
        'tutti:count': i.count,
        'tutti:optional': Boolean(i.is_optional),
        ...(i.notes && { 'tutti:notes': i.notes }),
      })),
      genre: genres.map((g) => ({
        '@type': 'jskos:Concept',
        '@id': g.uri,
        prefLabel: g.pref_label ? JSON.parse(g.pref_label) : undefined,
        notation: g.notation,
      })),
      ...(title.parts && {
        hasPart: JSON.parse(title.parts).map((p: { name: string; abbreviation?: string; instrument?: string }) => ({
          '@type': 'MusicComposition',
          name: p.name,
          ...(p.abbreviation && { alternateName: p.abbreviation }),
          ...(p.instrument && { instrument: { '@type': 'MusicInstrument', name: p.instrument } }),
        })),
      }),
    });
  }),
);

/**
 * @swagger
 * /interop/orchestras/{orchestraId}/repertoire.csv:
 *   get:
 *     summary: Export orchestra repertoire as CSV
 *     tags: [Interoperability]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orchestraId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Repertoire in CSV format
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 */
router.get(
  '/orchestras/:orchestraId/repertoire.csv',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { orchestraId } = req.params;

    const orchestra = db
      .prepare(
        `
    SELECT o.id, o.name FROM orchestras o
    WHERE o.id = ? AND o.association_id = ?
  `,
      )
      .get(orchestraId, req.user!.associationId) as { id: string; name: string } | undefined;

    if (!orchestra) {
      throw new ApiError(404, 'Orkest niet gevonden.');
    }

    const titles = db
      .prepare(
        `
    SELECT
      t.id, t.title, t.composer, t.arranger, t.duration_seconds, t.grade,
      m.work_number, m.movement_title
    FROM music_titles t
    LEFT JOIN music_metadata m ON m.music_title_id = t.id
    WHERE t.association_id = ?
      AND t.deleted_at IS NULL
      AND EXISTS (
        SELECT 1
        FROM music_pieces mp
        JOIN music_list_pieces mlp ON mlp.music_piece_id = mp.id
        JOIN music_lists ml ON ml.id = mlp.music_list_id
        WHERE ml.orchestra_id = ?
          AND ml.deleted_at IS NULL
          AND mp.deleted_at IS NULL
          AND mp.title = t.title
          AND COALESCE(mp.arranger, '') = COALESCE(t.arranger, '')
      )
    ORDER BY t.title
  `,
      )
      .all(req.user!.associationId, orchestraId) as Array<{
      id: string;
      title: string;
      composer: string | null;
      arranger: string | null;
      duration_seconds: number | null;
      grade: string | null;
      work_number: string | null;
      movement_title: string | null;
    }>;

    // Build CSV
    const headers = ['ID', 'Titel', 'Componist', 'Arrangeur', 'Duur (sec)', 'Graad', 'Werk nummer', 'Deel'];
    const rows = titles.map((t) => [
      t.id,
      escapeCsvField(t.title),
      escapeCsvField(t.composer || ''),
      escapeCsvField(t.arranger || ''),
      t.duration_seconds?.toString() || '',
      // grade en work_number zijn vrije tekstvelden; een komma erin schoof
      // alle volgende kolommen op. De buurvelden werden wel ontsnapt.
      escapeCsvField(t.grade || ''),
      escapeCsvField(t.work_number || ''),
      escapeCsvField(t.movement_title || ''),
    ]);

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

    const filename = `repertoire-${orchestra.name.replace(/[^a-zA-Z0-9]/g, '_')}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('﻿' + csv); // BOM for Excel compatibility
  }),
);

function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export default router;
