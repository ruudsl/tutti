/**
 * Vocabulary API Routes (WP5)
 *
 * Endpoints for searching and browsing JSKOS vocabularies:
 * - Instruments (IAML Medium of Performance)
 * - Genres (LCGFT)
 * - Composers (GND)
 */

import { Router, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import {
  searchConcepts,
  getConcept,
  getConcepts,
  getConceptsByType,
  getRootConcepts,
  getChildConcepts,
  buildHierarchy,
  getCacheStats,
  JskosConcept,
  JskosHierarchyNode,
} from '../services/jskos';

const router = Router();

/**
 * @swagger
 * /vocabularies/instruments:
 *   get:
 *     summary: Search instruments
 *     tags: [Vocabularies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Search query (prefix match on label)
 *       - in: query
 *         name: lang
 *         schema:
 *           type: string
 *           default: nl
 *         description: Language for labels (nl, en, de)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: List of matching instruments
 */
router.get('/instruments', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
  const query = (req.query.q as string) || '';
  const lang = (req.query.lang as string) || 'nl';
  const limit = parseInt(req.query.limit as string) || 20;

  if (query) {
    const result = searchConcepts(query, 'instrument', limit, lang);
    res.json({
      instruments: formatConcepts(result.concepts, lang),
      total: result.total,
      query,
    });
  } else {
    // Return all instruments if no query
    const instruments = getConceptsByType('instrument', lang);
    res.json({
      instruments: formatConcepts(instruments, lang),
      total: instruments.length,
    });
  }
}));

/**
 * @swagger
 * /vocabularies/instruments/tree:
 *   get:
 *     summary: Get instrument hierarchy tree
 *     tags: [Vocabularies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: lang
 *         schema:
 *           type: string
 *           default: nl
 *     responses:
 *       200:
 *         description: Hierarchical tree of instruments
 */
router.get('/instruments/tree', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = (req.query.lang as string) || 'nl';
  const tree = buildHierarchy('instrument', lang);

  res.json({
    tree: formatHierarchy(tree, lang),
  });
}));

/**
 * @swagger
 * /vocabularies/instruments/{uri}:
 *   get:
 *     summary: Get instrument by URI
 *     tags: [Vocabularies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: uri
 *         required: true
 *         schema:
 *           type: string
 *         description: URL-encoded URI
 *       - in: query
 *         name: lang
 *         schema:
 *           type: string
 *           default: nl
 *     responses:
 *       200:
 *         description: Instrument details
 *       404:
 *         description: Instrument not found
 */
router.get('/instruments/:uri', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
  const uri = decodeURIComponent(req.params.uri);
  const lang = (req.query.lang as string) || 'nl';

  const concept = getConcept(uri);
  if (!concept || concept.type !== 'instrument') {
    throw new ApiError(404, 'Instrument niet gevonden');
  }

  // Get children if any
  const children = getChildConcepts(uri, lang);

  res.json({
    instrument: formatConcept(concept, lang),
    children: formatConcepts(children, lang),
  });
}));

/**
 * @swagger
 * /vocabularies/genres:
 *   get:
 *     summary: Search genres
 *     tags: [Vocabularies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *       - in: query
 *         name: lang
 *         schema:
 *           type: string
 *           default: nl
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: List of matching genres
 */
router.get('/genres', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
  const query = (req.query.q as string) || '';
  const lang = (req.query.lang as string) || 'nl';
  const limit = parseInt(req.query.limit as string) || 20;

  if (query) {
    const result = searchConcepts(query, 'genre', limit, lang);
    res.json({
      genres: formatConcepts(result.concepts, lang),
      total: result.total,
      query,
    });
  } else {
    const genres = getConceptsByType('genre', lang);
    res.json({
      genres: formatConcepts(genres, lang),
      total: genres.length,
    });
  }
}));

/**
 * @swagger
 * /vocabularies/genres/tree:
 *   get:
 *     summary: Get genre hierarchy tree
 *     tags: [Vocabularies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: lang
 *         schema:
 *           type: string
 *           default: nl
 *     responses:
 *       200:
 *         description: Hierarchical tree of genres
 */
router.get('/genres/tree', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = (req.query.lang as string) || 'nl';
  const tree = buildHierarchy('genre', lang);

  res.json({
    tree: formatHierarchy(tree, lang),
  });
}));

/**
 * @swagger
 * /vocabularies/genres/{uri}:
 *   get:
 *     summary: Get genre by URI
 *     tags: [Vocabularies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: uri
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: lang
 *         schema:
 *           type: string
 *           default: nl
 *     responses:
 *       200:
 *         description: Genre details
 */
router.get('/genres/:uri', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
  const uri = decodeURIComponent(req.params.uri);
  const lang = (req.query.lang as string) || 'nl';

  const concept = getConcept(uri);
  if (!concept || concept.type !== 'genre') {
    throw new ApiError(404, 'Genre niet gevonden');
  }

  const children = getChildConcepts(uri, lang);

  res.json({
    genre: formatConcept(concept, lang),
    children: formatConcepts(children, lang),
  });
}));

/**
 * @swagger
 * /vocabularies/search:
 *   get:
 *     summary: Search all vocabulary types
 *     tags: [Vocabularies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [instrument, genre, composer]
 *       - in: query
 *         name: lang
 *         schema:
 *           type: string
 *           default: nl
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Search results
 */
router.get('/search', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
  const query = req.query.q as string;
  const type = req.query.type as 'instrument' | 'genre' | 'composer' | undefined;
  const lang = (req.query.lang as string) || 'nl';
  const limit = parseInt(req.query.limit as string) || 20;

  if (!query) {
    throw new ApiError(400, 'Query parameter "q" is verplicht');
  }

  const result = searchConcepts(query, type, limit, lang);

  res.json({
    concepts: formatConcepts(result.concepts, lang),
    total: result.total,
    query,
    type: type || 'all',
  });
}));

/**
 * @swagger
 * /vocabularies/lookup:
 *   get:
 *     summary: Get concepts by URIs
 *     tags: [Vocabularies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: uris
 *         required: true
 *         schema:
 *           type: string
 *         description: Comma-separated URIs
 *       - in: query
 *         name: lang
 *         schema:
 *           type: string
 *           default: nl
 *     responses:
 *       200:
 *         description: List of concepts
 */
router.get('/lookup', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
  const urisParam = req.query.uris as string;
  const lang = (req.query.lang as string) || 'nl';

  if (!urisParam) {
    throw new ApiError(400, 'Query parameter "uris" is verplicht');
  }

  const uris = urisParam.split(',').map(u => u.trim()).filter(Boolean);
  const concepts = getConcepts(uris);

  res.json({
    concepts: formatConcepts(concepts, lang),
  });
}));

/**
 * @swagger
 * /vocabularies/stats:
 *   get:
 *     summary: Get vocabulary cache statistics
 *     tags: [Vocabularies]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cache statistics
 */
router.get('/stats', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
  const stats = getCacheStats();

  res.json({
    total: stats.total,
    byType: stats.byType,
    expired: stats.expired,
  });
}));

// Helper functions to format concepts for API response

function formatConcept(concept: JskosConcept, lang: string): Record<string, unknown> {
  return {
    uri: concept.uri,
    type: concept.type,
    label: concept.prefLabel[lang] || concept.prefLabel.en || concept.prefLabel.nl || Object.values(concept.prefLabel)[0],
    labels: concept.prefLabel,
    altLabels: concept.altLabels,
    notation: concept.notation,
    broader: concept.broader,
    narrower: concept.narrower,
    hasChildren: concept.narrower && concept.narrower.length > 0,
  };
}

function formatConcepts(concepts: JskosConcept[], lang: string): Array<Record<string, unknown>> {
  return concepts.map(c => formatConcept(c, lang));
}

function formatHierarchyNode(node: JskosHierarchyNode, lang: string): Record<string, unknown> {
  return {
    uri: node.uri,
    type: node.type,
    label: node.prefLabel[lang] || node.prefLabel.en || node.prefLabel.nl || Object.values(node.prefLabel)[0],
    labels: node.prefLabel,
    notation: node.notation,
    level: node.level,
    children: node.children?.map(c => formatHierarchyNode(c, lang)) || [],
  };
}

function formatHierarchy(nodes: JskosHierarchyNode[], lang: string): Array<Record<string, unknown>> {
  return nodes.map(n => formatHierarchyNode(n, lang));
}

export default router;
