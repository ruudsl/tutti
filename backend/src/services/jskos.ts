/**
 * JSKOS Client Service
 *
 * Client for fetching and caching JSKOS vocabulary concepts.
 * Supports local vocabulary cache with external API fallback.
 *
 * JSKOS (JSON for Knowledge Organization Systems) is a JSON-LD format
 * for thesauri, classifications, and other knowledge organization systems.
 */

import db from '../database/connection';

export interface JskosConcept {
  uri: string;
  type: 'instrument' | 'genre' | 'composer';
  prefLabel: Record<string, string>;
  altLabels?: string[];
  broader?: string[];
  narrower?: string[];
  notation?: string;
  definition?: Record<string, string>;
}

export interface JskosSearchResult {
  concepts: JskosConcept[];
  total: number;
}

export interface JskosHierarchyNode extends JskosConcept {
  children?: JskosHierarchyNode[];
  level: number;
}

interface VocabularyCacheRow {
  uri: string;
  vocabulary_type: string;
  pref_label: string;
  alt_labels: string | null;
  broader: string | null;
  narrower: string | null;
  notation: string | null;
  definition: string | null;
  fetched_at: string;
  expires_at: string | null;
}

const DEFAULT_CACHE_TTL_HOURS = 24 * 7; // 1 week

/**
 * Convert database row to JskosConcept
 */
function rowToConcept(row: VocabularyCacheRow): JskosConcept {
  return {
    uri: row.uri,
    type: row.vocabulary_type as JskosConcept['type'],
    prefLabel: JSON.parse(row.pref_label),
    altLabels: row.alt_labels ? JSON.parse(row.alt_labels) : undefined,
    broader: row.broader ? JSON.parse(row.broader) : undefined,
    narrower: row.narrower ? JSON.parse(row.narrower) : undefined,
    notation: row.notation || undefined,
    definition: row.definition ? JSON.parse(row.definition) : undefined,
  };
}

/**
 * Get a concept by URI from cache
 */
export function getConcept(uri: string): JskosConcept | null {
  const row = db
    .prepare(
      `
    SELECT * FROM vocabulary_cache WHERE uri = ?
  `,
    )
    .get(uri) as VocabularyCacheRow | undefined;

  if (!row) return null;
  return rowToConcept(row);
}

/**
 * Get multiple concepts by URIs
 */
export function getConcepts(uris: string[]): JskosConcept[] {
  if (uris.length === 0) return [];

  const placeholders = uris.map(() => '?').join(',');
  const rows = db
    .prepare(
      `
    SELECT * FROM vocabulary_cache WHERE uri IN (${placeholders})
  `,
    )
    .all(...uris) as VocabularyCacheRow[];

  return rows.map(rowToConcept);
}

/**
 * Search concepts by label (prefix match)
 */
export function searchConcepts(
  query: string,
  type?: 'instrument' | 'genre' | 'composer',
  limit: number = 20,
  language: string = 'nl',
): JskosSearchResult {
  const searchQuery = query.toLowerCase().trim();

  if (!searchQuery) {
    return { concepts: [], total: 0 };
  }

  // Search in prefLabel and altLabels
  // SQLite JSON functions for searching within JSON objects
  let sql = `
    SELECT * FROM vocabulary_cache
    WHERE (
      LOWER(json_extract(pref_label, '$.${language}')) LIKE ?
      OR LOWER(json_extract(pref_label, '$.en')) LIKE ?
      OR LOWER(json_extract(pref_label, '$.de')) LIKE ?
      OR LOWER(alt_labels) LIKE ?
      OR LOWER(notation) LIKE ?
    )
  `;

  const params: (string | number)[] = [
    `${searchQuery}%`,
    `${searchQuery}%`,
    `${searchQuery}%`,
    `%"${searchQuery}%`,
    `${searchQuery}%`,
  ];

  if (type) {
    sql += ` AND vocabulary_type = ?`;
    params.push(type);
  }

  // Get total count
  const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as count');
  const countResult = db.prepare(countSql).get(...params) as { count: number };

  // Get results with limit
  sql += ` ORDER BY
    CASE
      WHEN LOWER(json_extract(pref_label, '$.${language}')) = ? THEN 0
      WHEN LOWER(json_extract(pref_label, '$.${language}')) LIKE ? THEN 1
      ELSE 2
    END,
    json_extract(pref_label, '$.${language}')
    LIMIT ?
  `;
  params.push(searchQuery, `${searchQuery}%`, limit);

  const rows = db.prepare(sql).all(...params) as VocabularyCacheRow[];

  return {
    concepts: rows.map(rowToConcept),
    total: countResult.count,
  };
}

/**
 * Get all concepts of a specific type
 */
export function getConceptsByType(type: 'instrument' | 'genre' | 'composer', language: string = 'nl'): JskosConcept[] {
  const rows = db
    .prepare(
      `
    SELECT * FROM vocabulary_cache
    WHERE vocabulary_type = ?
    ORDER BY json_extract(pref_label, '$.${language}'), json_extract(pref_label, '$.en')
  `,
    )
    .all(type) as VocabularyCacheRow[];

  return rows.map(rowToConcept);
}

/**
 * Get root concepts (concepts without broader)
 */
export function getRootConcepts(type: 'instrument' | 'genre' | 'composer', language: string = 'nl'): JskosConcept[] {
  const rows = db
    .prepare(
      `
    SELECT * FROM vocabulary_cache
    WHERE vocabulary_type = ?
    AND (broader IS NULL OR broader = '[]' OR broader = 'null')
    ORDER BY json_extract(pref_label, '$.${language}'), json_extract(pref_label, '$.en')
  `,
    )
    .all(type) as VocabularyCacheRow[];

  return rows.map(rowToConcept);
}

/**
 * Get child concepts (narrower)
 */
export function getChildConcepts(parentUri: string, language: string = 'nl'): JskosConcept[] {
  // Find concepts where broader contains parentUri
  const rows = db
    .prepare(
      `
    SELECT * FROM vocabulary_cache
    WHERE broader LIKE ?
    ORDER BY json_extract(pref_label, '$.${language}'), json_extract(pref_label, '$.en')
  `,
    )
    .all(`%"${parentUri}"%`) as VocabularyCacheRow[];

  return rows.map(rowToConcept);
}

/**
 * Build hierarchy tree for a vocabulary type
 */
export function buildHierarchy(
  type: 'instrument' | 'genre' | 'composer',
  language: string = 'nl',
): JskosHierarchyNode[] {
  const allConcepts = getConceptsByType(type, language);
  const conceptMap = new Map<string, JskosHierarchyNode>();

  // Initialize all concepts as nodes
  for (const concept of allConcepts) {
    conceptMap.set(concept.uri, {
      ...concept,
      children: [],
      level: 0,
    });
  }

  // Build parent-child relationships
  const roots: JskosHierarchyNode[] = [];

  for (const concept of allConcepts) {
    const node = conceptMap.get(concept.uri)!;

    if (!concept.broader || concept.broader.length === 0) {
      roots.push(node);
    } else {
      // Add to parent's children
      for (const parentUri of concept.broader) {
        const parent = conceptMap.get(parentUri);
        if (parent) {
          parent.children!.push(node);
          node.level = parent.level + 1;
        } else {
          // Parent not in cache, treat as root
          roots.push(node);
        }
      }
    }
  }

  // Sort children recursively
  function sortChildren(nodes: JskosHierarchyNode[]): void {
    nodes.sort((a, b) => {
      const labelA = a.prefLabel[language] || a.prefLabel.en || '';
      const labelB = b.prefLabel[language] || b.prefLabel.en || '';
      return labelA.localeCompare(labelB, language);
    });
    for (const node of nodes) {
      if (node.children && node.children.length > 0) {
        sortChildren(node.children);
      }
    }
  }

  sortChildren(roots);
  return roots;
}

/**
 * Add or update a concept in the cache
 */
export function upsertConcept(concept: JskosConcept, ttlHours: number = DEFAULT_CACHE_TTL_HOURS): void {
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString();

  db.prepare(
    `
    INSERT INTO vocabulary_cache (
      uri, vocabulary_type, pref_label, alt_labels, broader, narrower,
      notation, definition, fetched_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
    ON CONFLICT(uri) DO UPDATE SET
      vocabulary_type = excluded.vocabulary_type,
      pref_label = excluded.pref_label,
      alt_labels = excluded.alt_labels,
      broader = excluded.broader,
      narrower = excluded.narrower,
      notation = excluded.notation,
      definition = excluded.definition,
      fetched_at = datetime('now'),
      expires_at = excluded.expires_at
  `,
  ).run(
    concept.uri,
    concept.type,
    JSON.stringify(concept.prefLabel),
    concept.altLabels ? JSON.stringify(concept.altLabels) : null,
    concept.broader ? JSON.stringify(concept.broader) : null,
    concept.narrower ? JSON.stringify(concept.narrower) : null,
    concept.notation || null,
    concept.definition ? JSON.stringify(concept.definition) : null,
    expiresAt,
  );
}

/**
 * Delete a concept from the cache
 */
export function deleteConcept(uri: string): boolean {
  const result = db.prepare('DELETE FROM vocabulary_cache WHERE uri = ?').run(uri);
  return result.changes > 0;
}

/**
 * Get expired concepts that need refreshing
 */
export function getExpiredConcepts(limit: number = 100): JskosConcept[] {
  const rows = db
    .prepare(
      `
    SELECT * FROM vocabulary_cache
    WHERE expires_at IS NOT NULL AND expires_at < datetime('now')
    LIMIT ?
  `,
    )
    .all(limit) as VocabularyCacheRow[];

  return rows.map(rowToConcept);
}

/**
 * Clear all cached concepts of a specific type
 */
export function clearCache(type?: 'instrument' | 'genre' | 'composer'): number {
  if (type) {
    const result = db.prepare('DELETE FROM vocabulary_cache WHERE vocabulary_type = ?').run(type);
    return result.changes;
  } else {
    const result = db.prepare('DELETE FROM vocabulary_cache').run();
    return result.changes;
  }
}

/**
 * Get cache statistics
 */
export function getCacheStats(): {
  total: number;
  byType: Record<string, number>;
  expired: number;
} {
  const total = (db.prepare('SELECT COUNT(*) as count FROM vocabulary_cache').get() as { count: number }).count;

  const byTypeRows = db
    .prepare(
      `
    SELECT vocabulary_type, COUNT(*) as count
    FROM vocabulary_cache
    GROUP BY vocabulary_type
  `,
    )
    .all() as Array<{ vocabulary_type: string; count: number }>;

  const byType: Record<string, number> = {};
  for (const row of byTypeRows) {
    byType[row.vocabulary_type] = row.count;
  }

  const expired = (
    db
      .prepare(
        `
    SELECT COUNT(*) as count FROM vocabulary_cache
    WHERE expires_at IS NOT NULL AND expires_at < datetime('now')
  `,
      )
      .get() as { count: number }
  ).count;

  return { total, byType, expired };
}

/**
 * Link a music title to instruments
 */
export function linkTitleToInstruments(
  titleId: string,
  instruments: Array<{ uri: string; count?: number; isOptional?: boolean; notes?: string }>,
): void {
  // Remove existing links
  db.prepare('DELETE FROM music_title_instruments WHERE music_title_id = ?').run(titleId);

  // Insert new links
  const insert = db.prepare(`
    INSERT INTO music_title_instruments (music_title_id, instrument_uri, count, is_optional, notes)
    VALUES (?, ?, ?, ?, ?)
  `);

  for (const instr of instruments) {
    insert.run(titleId, instr.uri, instr.count || 1, instr.isOptional ? 1 : 0, instr.notes || null);
  }
}

/**
 * Get instruments linked to a music title
 */
export function getTitleInstruments(
  titleId: string,
): Array<JskosConcept & { count: number; isOptional: boolean; notes?: string }> {
  const rows = db
    .prepare(
      `
    SELECT
      v.uri, v.vocabulary_type, v.pref_label, v.alt_labels, v.broader, v.narrower, v.notation, v.definition,
      i.count, i.is_optional, i.notes
    FROM music_title_instruments i
    JOIN vocabulary_cache v ON v.uri = i.instrument_uri
    WHERE i.music_title_id = ?
    ORDER BY v.notation, json_extract(v.pref_label, '$.nl')
  `,
    )
    .all(titleId) as Array<VocabularyCacheRow & { count: number; is_optional: number; notes: string | null }>;

  return rows.map((row) => ({
    ...rowToConcept(row),
    count: row.count,
    isOptional: Boolean(row.is_optional),
    notes: row.notes || undefined,
  }));
}

/**
 * Link a music title to vocabulary concepts (genres, styles, etc.)
 */
export function linkTitleToVocabulary(titleId: string, vocabularyType: string, uris: string[]): void {
  // Remove existing links of this type
  db.prepare('DELETE FROM music_title_vocabulary WHERE music_title_id = ? AND vocabulary_type = ?').run(
    titleId,
    vocabularyType,
  );

  // Insert new links
  const insert = db.prepare(`
    INSERT INTO music_title_vocabulary (music_title_id, vocabulary_uri, vocabulary_type)
    VALUES (?, ?, ?)
  `);

  for (const uri of uris) {
    insert.run(titleId, uri, vocabularyType);
  }
}

/**
 * Get vocabulary concepts linked to a music title
 */
export function getTitleVocabulary(titleId: string, vocabularyType?: string): JskosConcept[] {
  let sql = `
    SELECT v.*
    FROM music_title_vocabulary mtv
    JOIN vocabulary_cache v ON v.uri = mtv.vocabulary_uri
    WHERE mtv.music_title_id = ?
  `;
  const params: string[] = [titleId];

  if (vocabularyType) {
    sql += ` AND mtv.vocabulary_type = ?`;
    params.push(vocabularyType);
  }

  sql += ` ORDER BY json_extract(v.pref_label, '$.nl')`;

  const rows = db.prepare(sql).all(...params) as VocabularyCacheRow[];
  return rows.map(rowToConcept);
}
