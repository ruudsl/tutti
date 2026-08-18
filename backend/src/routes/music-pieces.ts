import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import AdmZip from 'adm-zip';
import db from '../database/connection';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { FileValidationError } from '../utils/errors';
import { isPdf, readFileHeader } from '../utils/fileValidation';
import {
  updateMusicPieceSchema,
  updateTitleMetaSchema,
  shareMusicPieceSchema,
  bulkUpdatePiecesSchema,
  bulkDeletePiecesSchema,
} from '../validation/schemas';
import { withTransaction } from '../utils/database';
import logger from '../utils/logger';
import { logAuditEvent } from './audit-logs';
import { notifyOrchestra } from './notifications';
import {
  parseMusicXML,
  validateMusicXML,
  extractTitle,
  extractComposer,
  extractArranger,
  extractLyricist,
  partsToJson,
  isCompressedMusicXML,
} from '../services/musicxml';

const router = Router();

// Setup upload directory
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${uuidv4()}`;
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new FileValidationError());
    }
  },
});

// Configure multer for ZIP uploads (bulk import)
const zipStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${uuidv4()}`;
    cb(null, `zip-${uniqueSuffix}.zip`);
  },
});

const zipUpload = multer({
  storage: zipStorage,
  limits: {
    fileSize: 200 * 1024 * 1024, // 200MB limit for ZIP files
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['application/zip', 'application/x-zip-compressed', 'application/x-zip'];
    if (allowedMimes.includes(file.mimetype) || file.originalname.toLowerCase().endsWith('.zip')) {
      cb(null, true);
    } else {
      cb(new Error('Alleen ZIP bestanden zijn toegestaan.'));
    }
  },
});

// Setup MP3 upload directory
const MP3_UPLOAD_DIR = process.env.MP3_UPLOAD_DIR || path.join(__dirname, '../../uploads/mp3');
if (!fs.existsSync(MP3_UPLOAD_DIR)) {
  fs.mkdirSync(MP3_UPLOAD_DIR, { recursive: true });
}

// Configure multer for MP3 uploads
const mp3Storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, MP3_UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${uuidv4()}`;
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  },
});

const mp3Upload = multer({
  storage: mp3Storage,
  limits: {
    fileSize: 30 * 1024 * 1024, // 30MB limit for MP3
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['audio/mpeg', 'audio/mp3', 'audio/mpeg3', 'audio/x-mpeg-3'];
    if (allowedMimes.includes(file.mimetype) || file.originalname.toLowerCase().endsWith('.mp3')) {
      cb(null, true);
    } else {
      cb(new Error('Alleen MP3 bestanden zijn toegestaan.'));
    }
  },
});

// Setup MusicXML upload directory
const MUSICXML_UPLOAD_DIR = process.env.MUSICXML_UPLOAD_DIR || path.join(__dirname, '../../uploads/musicxml');
if (!fs.existsSync(MUSICXML_UPLOAD_DIR)) {
  fs.mkdirSync(MUSICXML_UPLOAD_DIR, { recursive: true });
}

// Configure multer for MusicXML uploads
const musicxmlStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, MUSICXML_UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${uuidv4()}`;
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  },
});

const musicxmlUpload = multer({
  storage: musicxmlStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit for MusicXML
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['application/xml', 'text/xml', 'application/vnd.recordare.musicxml+xml'];
    const allowedExts = ['.xml', '.musicxml', '.mxl'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedMimes.includes(file.mimetype) || allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Alleen MusicXML bestanden (.xml, .musicxml) zijn toegestaan.'));
    }
  },
});

// Parse filename to extract metadata
// Format: Titel_arrangeur_instrument_stemming_groepnummer_muzieksleutel
function parseFilename(filename: string): {
  title: string;
  arranger: string | null;
  instrument: string | null;
  tuning: string | null;
  groupNumber: string | null;
  clef: string | null;
} {
  // Remove extension
  const nameWithoutExt = filename.replace(/\.pdf$/i, '');
  const parts = nameWithoutExt.split('_');

  return {
    title: parts[0] || filename,
    arranger: parts[1] || null,
    instrument: parts[2] || null,
    tuning: parts[3] || null,
    groupNumber: parts[4] || null,
    clef: parts[5] || null,
  };
}

// Load all instruments + aliases once into a lookup map (lowercase name -> id).
// Use this in bulk flows to avoid 1-2 queries per music piece.
function loadInstrumentMap(): Map<string, string> {
  const map = new Map<string, string>();

  // Aliases first, then instrument names: an exact instrument-name match
  // overwrites an alias with the same name (same precedence as findInstrumentId).
  const aliases = db
    .prepare(
      `
        SELECT LOWER(alias) as name, instrument_id as id FROM instrument_aliases
    `,
    )
    .all() as { name: string; id: string }[];
  for (const alias of aliases) {
    map.set(alias.name, alias.id);
  }

  const instruments = db
    .prepare(
      `
        SELECT LOWER(name) as name, id FROM instruments
    `,
    )
    .all() as { name: string; id: string }[];
  for (const instrument of instruments) {
    map.set(instrument.name, instrument.id);
  }

  return map;
}

// Find instrument by name or alias. Pass a preloaded map (loadInstrumentMap)
// when calling in a loop; without a map it falls back to per-call queries.
function findInstrumentId(instrumentName: string, instrumentMap?: Map<string, string>): string | null {
  if (!instrumentName) return null;

  const searchName = instrumentName.toLowerCase().trim();

  if (instrumentMap) {
    return instrumentMap.get(searchName) ?? null;
  }

  // First try exact match on instrument name
  const instrument = db
    .prepare(
      `
        SELECT id FROM instruments WHERE LOWER(name) = ?
    `,
    )
    .get(searchName) as { id: string } | undefined;

  if (instrument) return instrument.id;

  // Try alias
  const alias = db
    .prepare(
      `
        SELECT instrument_id FROM instrument_aliases WHERE LOWER(alias) = ?
    `,
    )
    .get(searchName) as { instrument_id: string } | undefined;

  return alias ? alias.instrument_id : null;
}

// Delete file safely (async)
async function deleteFile(filePath: string): Promise<void> {
  try {
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
      logger.info(`File deleted: ${filePath}`);
    }
  } catch (error) {
    logger.error(`Failed to delete file: ${filePath}`, { error });
  }
}

/**
 * @swagger
 * /music-pieces:
 *   get:
 *     summary: Get all music pieces
 *     tags: [Music Pieces]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by title or arranger
 *       - in: query
 *         name: instrumentId
 *         schema:
 *           type: string
 *         description: Filter by instrument ID (use __none__ for pieces without instrument)
 *       - in: query
 *         name: listId
 *         schema:
 *           type: string
 *         description: Filter by music list ID
 *     responses:
 *       200:
 *         description: List of music pieces
 */
router.get(
  '/',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { search, instrumentId, listId, page, pageSize } = req.query;

    let whereClause = ' WHERE mp.association_id = ? AND mp.deleted_at IS NULL';
    const params: any[] = [req.user!.associationId];

    // Filter by instrument for regular members
    if (req.user!.role === 'member') {
      const userInstruments = db
        .prepare('SELECT instrument_id FROM user_instruments WHERE user_id = ?')
        .all(req.user!.id) as { instrument_id: string }[];

      if (userInstruments.length === 0) {
        return res.json(page ? { data: [], total: 0, page: 1, pageSize: 50, totalPages: 0 } : []);
      }

      const instrumentIds = userInstruments.map((i) => i.instrument_id);
      whereClause += ` AND mp.instrument_id IN (${instrumentIds.map(() => '?').join(',')})`;
      params.push(...instrumentIds);
    }

    // Optional filters
    if (search) {
      whereClause +=
        ' AND (mp.title LIKE ? COLLATE NOCASE OR mp.arranger LIKE ? COLLATE NOCASE OR mp.original_filename LIKE ? COLLATE NOCASE)';
      const searchTerm = `%${search as string}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    if (instrumentId) {
      if (instrumentId === '__none__') {
        whereClause += ' AND mp.instrument_id IS NULL';
      } else {
        whereClause += ' AND mp.instrument_id = ?';
        params.push(instrumentId);
      }
    }

    if (listId) {
      whereClause += ' AND mp.id IN (SELECT music_piece_id FROM music_list_pieces WHERE music_list_id = ?)';
      params.push(listId);
    }

    const baseFrom = `
        FROM music_pieces mp
        LEFT JOIN instruments i ON mp.instrument_id = i.id
        ${whereClause}
    `;

    const mapPiece = (p: any) => ({
      id: p.id,
      title: p.title,
      arranger: p.arranger,
      tuning: p.tuning,
      groupNumber: p.group_number,
      clef: p.clef,
      youtubeUrl: p.youtube_url,
      originalFilename: p.original_filename,
      createdAt: p.created_at,
      instrumentId: p.instrument_id,
      instrumentName: p.instrument_name,
    });

    // Paginated response
    if (page) {
      const currentPage = Math.max(1, parseInt(page as string, 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(pageSize as string, 10) || 50));
      const offset = (currentPage - 1) * limit;

      const countResult = db.prepare(`SELECT COUNT(*) as count ${baseFrom}`).get(...params) as { count: number };
      const total = countResult.count;
      const totalPages = Math.ceil(total / limit);

      const pieces = db
        .prepare(
          `
            SELECT mp.id, mp.title, mp.arranger, mp.tuning, mp.group_number, mp.clef,
                   mp.youtube_url, mp.original_filename, mp.created_at,
                   i.id as instrument_id, i.name as instrument_name
            ${baseFrom}
            ORDER BY mp.title, i.name, mp.group_number
            LIMIT ? OFFSET ?
        `,
        )
        .all(...params, limit, offset);

      return res.json({
        data: pieces.map(mapPiece),
        total,
        page: currentPage,
        pageSize: limit,
        totalPages,
      });
    }

    // Non-paginated response (backwards compatible: returns a plain array).
    // Hard cap to protect against unbounded result sets; clients that need
    // more should use ?page/?pageSize.
    const LEGACY_HARD_LIMIT = 1000;
    const pieces = db
      .prepare(
        `
        SELECT mp.id, mp.title, mp.arranger, mp.tuning, mp.group_number, mp.clef,
               mp.youtube_url, mp.original_filename, mp.created_at,
               i.id as instrument_id, i.name as instrument_name
        ${baseFrom}
        ORDER BY mp.title, i.name, mp.group_number
        LIMIT ?
    `,
      )
      .all(...params, LEGACY_HARD_LIMIT);

    if (pieces.length === LEGACY_HARD_LIMIT) {
      logger.warn(
        `GET /music-pieces without pagination hit the hard limit of ${LEGACY_HARD_LIMIT} rows; results may be truncated. Use ?page/?pageSize.`,
        {
          userId: req.user!.id,
          associationId: req.user!.associationId,
        },
      );
    }

    res.json(pieces.map(mapPiece));
  }),
);

/**
 * @swagger
 * /music-pieces/my-pieces:
 *   get:
 *     summary: Get my music pieces (filtered by user's instruments and orchestras)
 *     tags: [Music Pieces]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of user's music pieces
 */
router.get(
  '/my-pieces',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    // Get user's instruments
    const userInstruments = db
      .prepare('SELECT instrument_id FROM user_instruments WHERE user_id = ?')
      .all(req.user!.id) as { instrument_id: string }[];

    if (userInstruments.length === 0) {
      return res.json([]);
    }

    // Get user's orchestras
    const userOrchestras = db
      .prepare('SELECT orchestra_id FROM user_orchestras WHERE user_id = ?')
      .all(req.user!.id) as { orchestra_id: string }[];

    if (userOrchestras.length === 0) {
      return res.json([]);
    }

    const instrumentIds = userInstruments.map((i) => i.instrument_id);
    const orchestraIds = userOrchestras.map((o) => o.orchestra_id);

    // Get pieces that are on lists for user's orchestras and match user's instruments
    const pieces = db
      .prepare(
        `
        SELECT DISTINCT mp.id, mp.title, mp.arranger, mp.tuning, mp.group_number, mp.clef,
               mp.youtube_url, mp.original_filename, mp.created_at,
               i.id as instrument_id, i.name as instrument_name,
               ml.name as list_name, o.name as orchestra_name
        FROM music_pieces mp
        LEFT JOIN instruments i ON mp.instrument_id = i.id
        JOIN music_list_pieces mlp ON mp.id = mlp.music_piece_id
        JOIN music_lists ml ON mlp.music_list_id = ml.id
        JOIN orchestras o ON ml.orchestra_id = o.id
        WHERE mp.instrument_id IN (${instrumentIds.map(() => '?').join(',')})
        AND o.id IN (${orchestraIds.map(() => '?').join(',')})
        AND mp.deleted_at IS NULL
        ORDER BY o.name, ml.name, mp.title
    `,
      )
      .all(...instrumentIds, ...orchestraIds);

    res.json(
      pieces.map((p: any) => ({
        id: p.id,
        title: p.title,
        arranger: p.arranger,
        tuning: p.tuning,
        groupNumber: p.group_number,
        clef: p.clef,
        youtubeUrl: p.youtube_url,
        originalFilename: p.original_filename,
        createdAt: p.created_at,
        instrumentId: p.instrument_id,
        instrumentName: p.instrument_name,
        listName: p.list_name,
        orchestraName: p.orchestra_name,
      })),
    );
  }),
);

/**
 * @swagger
 * /music-pieces/titles:
 *   get:
 *     summary: Get all unique titles with piece counts (grouped view)
 *     tags: [Music Pieces]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: listId
 *         schema:
 *           type: string
 *       - in: query
 *         name: genreId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of titles with piece counts
 */
router.get(
  '/titles',
  authenticateToken,
  requireRole('admin', 'music_committee'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { search, listId, genreId } = req.query;

    let query = `
        SELECT mp.title, mp.arranger,
               COUNT(*) as piece_count,
               GROUP_CONCAT(DISTINCT i.name) as instruments,
               mt.id as title_id,
               mt.youtube_url,
               mt.description,
               mt.duration_seconds,
               mt.grade,
               mt.mp3_file_path,
               mt.is_shared,
               mt.internal_notes,
               mt.streaming_links
        FROM music_pieces mp
        LEFT JOIN instruments i ON mp.instrument_id = i.id
        LEFT JOIN music_titles mt ON mp.title = mt.title
            AND COALESCE(mp.arranger, '') = COALESCE(mt.arranger, '')
            AND mt.association_id = mp.association_id
        WHERE mp.association_id = ? AND mp.deleted_at IS NULL
    `;
    const params: any[] = [req.user!.associationId];

    if (search) {
      query += ' AND (mp.title LIKE ? COLLATE NOCASE OR mp.arranger LIKE ? COLLATE NOCASE)';
      const searchTerm = `%${search as string}%`;
      params.push(searchTerm, searchTerm);
    }

    // Filter by genre
    if (genreId) {
      query += ` AND mt.id IN (
            SELECT music_title_id FROM music_title_genres WHERE genre_id = ?
        )`;
      params.push(genreId);
    }

    query += ' GROUP BY mp.title, mp.arranger ORDER BY mp.title';

    const titles = db.prepare(query).all(...params);

    // If listId is provided, also get which titles are on that list
    let titlesOnList: Set<string> = new Set();
    if (listId) {
      const onList = db
        .prepare(
          `
            SELECT DISTINCT mp.title
            FROM music_pieces mp
            JOIN music_list_pieces mlp ON mp.id = mlp.music_piece_id
            WHERE mlp.music_list_id = ? AND mp.deleted_at IS NULL
        `,
        )
        .all(listId) as { title: string }[];
      titlesOnList = new Set(onList.map((t) => t.title));
    }

    // Get genres for each title
    const titlesWithGenres = titles.map((t: any) => {
      let genres: { id: string; name: string }[] = [];
      if (t.title_id) {
        genres = db
          .prepare(
            `
                SELECT g.id, g.name
                FROM genres g
                JOIN music_title_genres mtg ON g.id = mtg.genre_id
                WHERE mtg.music_title_id = ?
                ORDER BY g.name
            `,
          )
          .all(t.title_id) as { id: string; name: string }[];
      }

      // Get lists where this title appears
      const lists = db
        .prepare(
          `
            SELECT DISTINCT ml.id, ml.name, o.name as orchestra_name
            FROM music_lists ml
            JOIN music_list_pieces mlp ON ml.id = mlp.music_list_id
            JOIN music_pieces mp ON mlp.music_piece_id = mp.id
            JOIN orchestras o ON ml.orchestra_id = o.id
            WHERE mp.title = ? AND mp.association_id = ? AND mp.deleted_at IS NULL
            ORDER BY o.name, ml.name
        `,
        )
        .all(t.title, req.user!.associationId) as { id: string; name: string; orchestra_name: string }[];

      // Parse streaming links JSON
      let streamingLinks = null;
      if (t.streaming_links) {
        try {
          streamingLinks = JSON.parse(t.streaming_links);
        } catch (e) {
          // Invalid JSON, ignore
        }
      }

      return {
        id: t.title_id || null,
        title: t.title,
        arranger: t.arranger,
        pieceCount: t.piece_count,
        youtubeUrl: t.youtube_url,
        description: t.description,
        durationSeconds: t.duration_seconds || 0,
        grade: t.grade,
        mp3FilePath: t.mp3_file_path,
        isShared: Boolean(t.is_shared),
        internalNotes: t.internal_notes || null,
        streamingLinks,
        instruments: t.instruments ? t.instruments.split(',') : [],
        onList: listId ? titlesOnList.has(t.title) : undefined,
        genres,
        lists,
      };
    });

    res.json(titlesWithGenres);
  }),
);

/**
 * @swagger
 * /music-pieces/title-meta/{title}:
 *   get:
 *     summary: Get or create title metadata
 *     tags: [Music Pieces]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: title
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: arranger
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Title metadata
 */
router.get(
  '/title-meta/:title',
  authenticateToken,
  requireRole('admin', 'music_committee'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const title = decodeURIComponent(req.params.title);
    const arranger = req.query.arranger ? decodeURIComponent(req.query.arranger as string) : null;

    const meta = db
      .prepare(
        `
        SELECT id, title, arranger, youtube_url, description, duration_seconds, grade, mp3_file_path, is_shared, internal_notes
        FROM music_titles
        WHERE title = ? AND COALESCE(arranger, '') = COALESCE(?, '') AND association_id = ?
    `,
      )
      .get(title, arranger, req.user!.associationId) as any;

    if (meta) {
      // Get genres for this title
      const genres = db
        .prepare(
          `
            SELECT g.id, g.name
            FROM genres g
            JOIN music_title_genres mtg ON g.id = mtg.genre_id
            WHERE mtg.music_title_id = ?
            ORDER BY g.name
        `,
        )
        .all(meta.id) as { id: string; name: string }[];

      res.json({
        id: meta.id,
        title: meta.title,
        arranger: meta.arranger,
        youtubeUrl: meta.youtube_url,
        description: meta.description,
        durationSeconds: meta.duration_seconds || 0,
        grade: meta.grade,
        mp3FilePath: meta.mp3_file_path,
        isShared: Boolean(meta.is_shared),
        internalNotes: meta.internal_notes || null,
        genres,
      });
    } else {
      res.json({
        title,
        arranger,
        youtubeUrl: null,
        description: null,
        durationSeconds: 0,
        grade: null,
        mp3FilePath: null,
        isShared: false,
        internalNotes: null,
        genres: [],
      });
    }
  }),
);

/**
 * @swagger
 * /music-pieces/title-meta:
 *   put:
 *     summary: Update title metadata (YouTube, description, duration, genres, sharing)
 *     tags: [Music Pieces]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TitleMetaUpdate'
 *     responses:
 *       200:
 *         description: Title metadata updated
 */
router.put(
  '/title-meta',
  authenticateToken,
  requireRole('admin', 'music_committee'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = updateTitleMetaSchema.parse(req.body);

    let titleId: string;

    // Check if title metadata already exists
    const existing = db
      .prepare(
        `
        SELECT id FROM music_titles
        WHERE title = ? AND COALESCE(arranger, '') = COALESCE(?, '') AND association_id = ?
    `,
      )
      .get(data.title.trim(), data.arranger || null, req.user!.associationId) as { id: string } | undefined;

    withTransaction(() => {
      if (existing) {
        // Update existing
        db.prepare(
          `
                UPDATE music_titles
                SET youtube_url = ?, description = ?, duration_seconds = ?, grade = ?, is_shared = ?, internal_notes = ?
                WHERE id = ?
            `,
        ).run(
          data.youtubeUrl || null,
          data.description || null,
          data.durationSeconds || 0,
          data.grade || null,
          data.isShared ? 1 : 0,
          data.internalNotes || null,
          existing.id,
        );
        titleId = existing.id;
      } else {
        // Create new
        titleId = uuidv4();
        db.prepare(
          `
                INSERT INTO music_titles (id, title, arranger, youtube_url, description, duration_seconds, grade, is_shared, internal_notes, association_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
        ).run(
          titleId,
          data.title.trim(),
          data.arranger || null,
          data.youtubeUrl || null,
          data.description || null,
          data.durationSeconds || 0,
          data.grade || null,
          data.isShared ? 1 : 0,
          data.internalNotes || null,
          req.user!.associationId,
        );
      }

      // Update genres if provided
      if (Array.isArray(data.genreIds)) {
        // Remove existing genre associations
        db.prepare('DELETE FROM music_title_genres WHERE music_title_id = ?').run(titleId);

        // Add new genre associations
        const insertGenre = db.prepare('INSERT INTO music_title_genres (music_title_id, genre_id) VALUES (?, ?)');
        for (const genreId of data.genreIds) {
          if (genreId) {
            insertGenre.run(titleId, genreId);
          }
        }
      }
    });

    logger.info(`Title metadata updated: ${data.title}`, { titleId: titleId!, updatedBy: req.user!.id });

    // Log audit event
    logAuditEvent(
      req.user!.id,
      existing ? 'update' : 'create',
      'music_title',
      titleId!,
      data.title,
      {
        arranger: data.arranger,
        youtubeUrl: data.youtubeUrl,
        grade: data.grade,
        isShared: data.isShared,
      },
      req.ip,
      req.get('user-agent'),
    );

    res.json({
      id: titleId!,
      message: existing ? 'Titel metadata bijgewerkt.' : 'Titel metadata aangemaakt.',
    });
  }),
);

/**
 * @swagger
 * /music-pieces/title-mp3/{titleId}:
 *   post:
 *     summary: Upload MP3 file for a title
 *     tags: [Music Pieces]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: titleId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               mp3:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: MP3 uploaded successfully
 */
router.post(
  '/title-mp3/:titleId',
  authenticateToken,
  requireRole('admin', 'music_committee'),
  mp3Upload.single('mp3'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { titleId } = req.params;

    if (!req.file) {
      throw new ApiError(400, 'MP3 bestand is verplicht.');
    }

    // Check if title exists and belongs to user's association
    const title = db
      .prepare(
        `
        SELECT id, mp3_file_path FROM music_titles WHERE id = ? AND association_id = ?
    `,
      )
      .get(titleId, req.user!.associationId) as { id: string; mp3_file_path: string | null } | undefined;

    if (!title) {
      // Delete uploaded file
      await deleteFile(req.file.path);
      throw new ApiError(404, 'Titel niet gevonden.');
    }

    // Delete old MP3 file if exists
    if (title.mp3_file_path) {
      const oldPath = path.join(MP3_UPLOAD_DIR, title.mp3_file_path);
      await deleteFile(oldPath);
    }

    // Update title with new MP3 path
    db.prepare('UPDATE music_titles SET mp3_file_path = ? WHERE id = ?').run(req.file.filename, titleId);

    logger.info(`MP3 uploaded for title: ${titleId}`, { filename: req.file.filename, uploadedBy: req.user!.id });

    // Log audit event
    logAuditEvent(
      req.user!.id,
      'upload',
      'music_title',
      titleId,
      req.file.originalname,
      { filename: req.file.filename, type: 'mp3' },
      req.ip,
      req.get('user-agent'),
    );

    res.json({
      message: 'MP3 bestand geüpload.',
      mp3FilePath: req.file.filename,
    });
  }),
);

/**
 * @swagger
 * /music-pieces/title-mp3/{titleId}:
 *   delete:
 *     summary: Delete MP3 file for a title
 *     tags: [Music Pieces]
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
 *         description: MP3 deleted successfully
 */
router.delete(
  '/title-mp3/:titleId',
  authenticateToken,
  requireRole('admin', 'music_committee'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { titleId } = req.params;

    // Check if title exists and belongs to user's association
    const title = db
      .prepare(
        `
        SELECT id, mp3_file_path FROM music_titles WHERE id = ? AND association_id = ?
    `,
      )
      .get(titleId, req.user!.associationId) as { id: string; mp3_file_path: string | null } | undefined;

    if (!title) {
      throw new ApiError(404, 'Titel niet gevonden.');
    }

    if (!title.mp3_file_path) {
      throw new ApiError(404, 'Geen MP3 bestand gevonden.');
    }

    // Delete MP3 file
    const filePath = path.join(MP3_UPLOAD_DIR, title.mp3_file_path);
    await deleteFile(filePath);

    // Clear MP3 path from database
    db.prepare('UPDATE music_titles SET mp3_file_path = NULL WHERE id = ?').run(titleId);

    logger.info(`MP3 deleted for title: ${titleId}`, { deletedBy: req.user!.id });

    // Log audit event
    logAuditEvent(
      req.user!.id,
      'delete',
      'music_title',
      titleId,
      'MP3 bestand',
      { type: 'mp3' },
      req.ip,
      req.get('user-agent'),
    );

    res.json({
      message: 'MP3 bestand verwijderd.',
    });
  }),
);

/**
 * @swagger
 * /music-pieces/mp3/{filename}:
 *   get:
 *     summary: Stream/download MP3 file
 *     tags: [Music Pieces]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: filename
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: MP3 file stream
 */
router.get(
  '/mp3/:filename',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { filename } = req.params;

    // Validate filename to prevent path traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      throw new ApiError(400, 'Ongeldige bestandsnaam.');
    }

    const filePath = path.join(MP3_UPLOAD_DIR, filename);

    if (!fs.existsSync(filePath)) {
      throw new ApiError(404, 'MP3 bestand niet gevonden.');
    }

    // Get file stats for Content-Length
    const stat = fs.statSync(filePath);

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Accept-Ranges', 'bytes');

    // Stream the file
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  }),
);

// ============================================
// MusicXML Metadata Endpoints (WP5)
// ============================================

/**
 * @swagger
 * /music-pieces/title-musicxml/{titleId}:
 *   post:
 *     summary: Upload MusicXML file and extract metadata for a title
 *     tags: [Music Pieces]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: titleId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               musicxml:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: MusicXML uploaded and metadata extracted
 */
router.post(
  '/title-musicxml/:titleId',
  authenticateToken,
  requireRole('admin', 'music_committee'),
  musicxmlUpload.single('musicxml'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { titleId } = req.params;

    if (!req.file) {
      throw new ApiError(400, 'MusicXML bestand is verplicht.');
    }

    // Check if title exists and belongs to user's association
    const title = db
      .prepare(
        `
        SELECT id, title, composer, arranger FROM music_titles WHERE id = ? AND association_id = ?
    `,
      )
      .get(titleId, req.user!.associationId) as
      { id: string; title: string; composer: string | null; arranger: string | null } | undefined;

    if (!title) {
      await fs.promises.unlink(req.file.path).catch(() => {});
      throw new ApiError(404, 'Titel niet gevonden.');
    }

    // Read and parse MusicXML
    const xmlContent = await fs.promises.readFile(req.file.path, 'utf-8');

    // Check if it's compressed MusicXML
    const fileBuffer = await fs.promises.readFile(req.file.path);
    if (isCompressedMusicXML(fileBuffer)) {
      await fs.promises.unlink(req.file.path).catch(() => {});
      throw new ApiError(
        400,
        'Gecomprimeerde MusicXML (.mxl) wordt nog niet ondersteund. Upload een ongecomprimeerd .xml of .musicxml bestand.',
      );
    }

    // Validate before parsing
    const validationErrors = validateMusicXML(xmlContent);
    if (validationErrors.length > 0) {
      await fs.promises.unlink(req.file.path).catch(() => {});
      throw new ApiError(400, `Ongeldig MusicXML bestand: ${validationErrors.map((e) => e.message).join(', ')}`);
    }

    // Parse MusicXML
    const parseResult = parseMusicXML(xmlContent);
    if (!parseResult.success || !parseResult.data) {
      await fs.promises.unlink(req.file.path).catch(() => {});
      throw new ApiError(400, `MusicXML parsing mislukt: ${parseResult.errors.map((e) => e.message).join(', ')}`);
    }

    const parsed = parseResult.data;

    // Check if music_metadata record exists
    const existingMeta = db.prepare('SELECT id FROM music_metadata WHERE music_title_id = ?').get(titleId) as
      { id: string } | undefined;

    const metadataId = existingMeta?.id || uuidv4();

    // Upsert music_metadata
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
        xmlContent,
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
        xmlContent,
      );
    }

    // Optionally update music_titles if composer/arranger were found and are currently empty
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

    // Delete the uploaded file (we stored the content in the database)
    await fs.promises.unlink(req.file.path).catch(() => {});

    logger.info(`MusicXML uploaded for title: ${titleId}`, {
      filename: req.file.originalname,
      uploadedBy: req.user!.id,
    });

    // Log audit event
    logAuditEvent(
      req.user!.id,
      'upload',
      'music_title',
      titleId,
      req.file.originalname,
      { filename: req.file.originalname, type: 'musicxml', parts: parsed.parts.length },
      req.ip,
      req.get('user-agent'),
    );

    res.json({
      message: 'MusicXML metadata geëxtraheerd en opgeslagen.',
      metadata: {
        workNumber: parsed.workNumber,
        movementNumber: parsed.movementNumber,
        movementTitle: parsed.movementTitle,
        composer: extractComposer(parsed),
        arranger: extractArranger(parsed),
        lyricist: extractLyricist(parsed),
        rights: parsed.rights,
        source: parsed.source,
        encoding: parsed.encoding,
        partsCount: parsed.parts.length,
        parts: parsed.parts,
      },
      warnings: parseResult.warnings,
      updatedFields: updates.map((u) => u.split(' ')[0]),
    });
  }),
);

/**
 * @swagger
 * /music-pieces/title-metadata/{titleId}:
 *   get:
 *     summary: Get extended metadata for a title (from MusicXML)
 *     tags: [Music Pieces]
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
 *         description: Extended metadata
 */
router.get(
  '/title-metadata/:titleId',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { titleId } = req.params;

    // Get title with metadata
    const title = db
      .prepare(
        `
        SELECT
            t.id, t.title, t.composer, t.arranger, t.duration_seconds, t.grade,
            t.youtube_url, t.description, t.streaming_links,
            m.work_number, m.movement_number, m.movement_title,
            m.lyricist, m.rights, m.source,
            m.encoding_software, m.encoding_date, m.parts,
            m.created_at as metadata_created_at,
            m.updated_at as metadata_updated_at
        FROM music_titles t
        LEFT JOIN music_metadata m ON m.music_title_id = t.id
        WHERE t.id = ? AND t.association_id = ?
    `,
      )
      .get(titleId, req.user!.associationId) as Record<string, unknown> | undefined;

    if (!title) {
      throw new ApiError(404, 'Titel niet gevonden.');
    }

    // Get linked instruments from vocabulary
    const instruments = db
      .prepare(
        `
        SELECT
            i.instrument_uri as uri,
            i.count,
            i.is_optional,
            i.notes,
            v.pref_label,
            v.notation
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

    // Get linked genres from vocabulary
    const genres = db
      .prepare(
        `
        SELECT
            g.vocabulary_uri as uri,
            g.vocabulary_type,
            v.pref_label,
            v.notation
        FROM music_title_vocabulary g
        LEFT JOIN vocabulary_cache v ON v.uri = g.vocabulary_uri
        WHERE g.music_title_id = ?
    `,
      )
      .all(titleId) as Array<{
      uri: string;
      vocabulary_type: string;
      pref_label: string | null;
      notation: string | null;
    }>;

    res.json({
      id: title.id,
      title: title.title,
      composer: title.composer,
      arranger: title.arranger,
      durationSeconds: title.duration_seconds,
      grade: title.grade,
      youtubeUrl: title.youtube_url,
      description: title.description,
      streamingLinks: title.streaming_links ? JSON.parse(title.streaming_links as string) : null,
      metadata:
        title.work_number || title.movement_number || title.parts
          ? {
              workNumber: title.work_number,
              movementNumber: title.movement_number,
              movementTitle: title.movement_title,
              lyricist: title.lyricist,
              rights: title.rights,
              source: title.source,
              encoding: title.encoding_software
                ? {
                    software: title.encoding_software,
                    date: title.encoding_date,
                  }
                : null,
              parts: title.parts ? JSON.parse(title.parts as string) : [],
              createdAt: title.metadata_created_at,
              updatedAt: title.metadata_updated_at,
            }
          : null,
      instruments: instruments.map((i) => ({
        uri: i.uri,
        count: i.count,
        isOptional: Boolean(i.is_optional),
        notes: i.notes,
        label: i.pref_label ? JSON.parse(i.pref_label) : null,
        notation: i.notation,
      })),
      genres: genres.map((g) => ({
        uri: g.uri,
        type: g.vocabulary_type,
        label: g.pref_label ? JSON.parse(g.pref_label) : null,
        notation: g.notation,
      })),
    });
  }),
);

/**
 * @swagger
 * /music-pieces/title-metadata/{titleId}:
 *   patch:
 *     summary: Update extended metadata (instruments, genres, work info)
 *     tags: [Music Pieces]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: titleId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               workNumber:
 *                 type: string
 *               movementNumber:
 *                 type: integer
 *               movementTitle:
 *                 type: string
 *               lyricist:
 *                 type: string
 *               rights:
 *                 type: string
 *               source:
 *                 type: string
 *               instruments:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     uri:
 *                       type: string
 *                     count:
 *                       type: integer
 *                     isOptional:
 *                       type: boolean
 *                     notes:
 *                       type: string
 *               genres:
 *                 type: array
 *                 items:
 *                   type: string
 *                   description: Genre URIs
 *     responses:
 *       200:
 *         description: Metadata updated
 */
router.patch(
  '/title-metadata/:titleId',
  authenticateToken,
  requireRole('admin', 'music_committee'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { titleId } = req.params;
    const { workNumber, movementNumber, movementTitle, lyricist, rights, source, instruments, genres } = req.body;

    // Check if title exists and belongs to user's association
    const title = db
      .prepare(
        `
        SELECT id FROM music_titles WHERE id = ? AND association_id = ?
    `,
      )
      .get(titleId, req.user!.associationId) as { id: string } | undefined;

    if (!title) {
      throw new ApiError(404, 'Titel niet gevonden.');
    }

    // Upsert music_metadata
    const existingMeta = db.prepare('SELECT id FROM music_metadata WHERE music_title_id = ?').get(titleId) as
      { id: string } | undefined;

    if (existingMeta) {
      const updates: string[] = [];
      const params: (string | number | null)[] = [];

      if (workNumber !== undefined) {
        updates.push('work_number = ?');
        params.push(workNumber || null);
      }
      if (movementNumber !== undefined) {
        updates.push('movement_number = ?');
        params.push(movementNumber || null);
      }
      if (movementTitle !== undefined) {
        updates.push('movement_title = ?');
        params.push(movementTitle || null);
      }
      if (lyricist !== undefined) {
        updates.push('lyricist = ?');
        params.push(lyricist || null);
      }
      if (rights !== undefined) {
        updates.push('rights = ?');
        params.push(rights || null);
      }
      if (source !== undefined) {
        updates.push('source = ?');
        params.push(source || null);
      }

      if (updates.length > 0) {
        updates.push("updated_at = datetime('now')");
        params.push(titleId);
        db.prepare(`UPDATE music_metadata SET ${updates.join(', ')} WHERE music_title_id = ?`).run(...params);
      }
    } else {
      // Create new metadata record
      const metadataId = uuidv4();
      db.prepare(
        `
            INSERT INTO music_metadata (
                id, music_title_id, work_number, movement_number, movement_title,
                lyricist, rights, source, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `,
      ).run(
        metadataId,
        titleId,
        workNumber || null,
        movementNumber || null,
        movementTitle || null,
        lyricist || null,
        rights || null,
        source || null,
      );
    }

    // Update instruments if provided
    if (instruments !== undefined) {
      // Remove existing links
      db.prepare('DELETE FROM music_title_instruments WHERE music_title_id = ?').run(titleId);

      // Insert new links
      if (Array.isArray(instruments) && instruments.length > 0) {
        const insertInstr = db.prepare(`
                INSERT INTO music_title_instruments (music_title_id, instrument_uri, count, is_optional, notes)
                VALUES (?, ?, ?, ?, ?)
            `);

        for (const instr of instruments) {
          if (instr.uri) {
            insertInstr.run(titleId, instr.uri, instr.count || 1, instr.isOptional ? 1 : 0, instr.notes || null);
          }
        }
      }
    }

    // Update genres if provided
    if (genres !== undefined) {
      // Remove existing genre links
      db.prepare('DELETE FROM music_title_vocabulary WHERE music_title_id = ? AND vocabulary_type = ?').run(
        titleId,
        'genre',
      );

      // Insert new links
      if (Array.isArray(genres) && genres.length > 0) {
        const insertGenre = db.prepare(`
                INSERT INTO music_title_vocabulary (music_title_id, vocabulary_uri, vocabulary_type)
                VALUES (?, ?, 'genre')
            `);

        for (const genreUri of genres) {
          if (genreUri) {
            insertGenre.run(titleId, genreUri);
          }
        }
      }
    }

    logger.info(`Extended metadata updated for title: ${titleId}`, { updatedBy: req.user!.id });

    logAuditEvent(
      req.user!.id,
      'update',
      'music_title',
      titleId,
      'Extended metadata',
      { instruments: instruments?.length, genres: genres?.length },
      req.ip,
      req.get('user-agent'),
    );

    res.json({
      message: 'Metadata bijgewerkt.',
    });
  }),
);

/**
 * @swagger
 * /music-pieces/title-musicxml/{titleId}:
 *   get:
 *     summary: Export/download MusicXML for a title
 *     tags: [Music Pieces]
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
 *         description: MusicXML file
 *         content:
 *           application/xml:
 *             schema:
 *               type: string
 */
router.get(
  '/title-musicxml/:titleId',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { titleId } = req.params;

    // Get metadata with raw MusicXML
    const metadata = db
      .prepare(
        `
        SELECT m.musicxml_raw, t.title
        FROM music_metadata m
        JOIN music_titles t ON t.id = m.music_title_id
        WHERE m.music_title_id = ? AND t.association_id = ?
    `,
      )
      .get(titleId, req.user!.associationId) as { musicxml_raw: string | null; title: string } | undefined;

    if (!metadata) {
      throw new ApiError(404, 'Geen MusicXML metadata gevonden voor deze titel.');
    }

    if (!metadata.musicxml_raw) {
      throw new ApiError(404, 'Geen MusicXML bestand opgeslagen voor deze titel.');
    }

    // Sanitize filename
    const safeTitle = metadata.title.replace(/[^a-zA-Z0-9-_\s]/g, '').substring(0, 50);
    const filename = `${safeTitle}.musicxml`;

    res.setHeader('Content-Type', 'application/vnd.recordare.musicxml+xml');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(metadata.musicxml_raw);
  }),
);

/**
 * @swagger
 * /music-pieces/title-musicxml/{titleId}:
 *   delete:
 *     summary: Delete MusicXML metadata for a title
 *     tags: [Music Pieces]
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
 *         description: MusicXML metadata deleted
 */
router.delete(
  '/title-musicxml/:titleId',
  authenticateToken,
  requireRole('admin', 'music_committee'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { titleId } = req.params;

    // Check if title exists and belongs to user's association
    const title = db
      .prepare(
        `
        SELECT t.id FROM music_titles t
        WHERE t.id = ? AND t.association_id = ?
    `,
      )
      .get(titleId, req.user!.associationId) as { id: string } | undefined;

    if (!title) {
      throw new ApiError(404, 'Titel niet gevonden.');
    }

    // Delete metadata
    const result = db.prepare('DELETE FROM music_metadata WHERE music_title_id = ?').run(titleId);

    if (result.changes === 0) {
      throw new ApiError(404, 'Geen MusicXML metadata gevonden voor deze titel.');
    }

    logger.info(`MusicXML metadata deleted for title: ${titleId}`, { deletedBy: req.user!.id });

    // Log audit event
    logAuditEvent(
      req.user!.id,
      'delete',
      'music_title',
      titleId,
      'MusicXML metadata',
      { type: 'musicxml' },
      req.ip,
      req.get('user-agent'),
    );

    res.json({
      message: 'MusicXML metadata verwijderd.',
    });
  }),
);

/**
 * @swagger
 * /music-pieces/youtube-meta:
 *   get:
 *     summary: Fetch YouTube video metadata via oEmbed
 *     tags: [Music Pieces]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: url
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: YouTube video metadata
 */
router.get(
  '/youtube-meta',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { url } = req.query;

    if (!url || typeof url !== 'string') {
      throw new ApiError(400, 'YouTube URL is verplicht.');
    }

    // Validate YouTube URL
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const match = url.match(youtubeRegex);

    if (!match) {
      throw new ApiError(400, 'Ongeldige YouTube URL.');
    }

    const videoId = match[4];

    // Fetch oEmbed data
    const oEmbedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;

    const response = await fetch(oEmbedUrl);

    if (!response.ok) {
      throw new ApiError(404, 'Video niet gevonden.');
    }

    const data = (await response.json()) as {
      title: string;
      author_name: string;
      thumbnail_url: string;
    };

    res.json({
      title: data.title,
      author: data.author_name,
      thumbnailUrl: data.thumbnail_url,
      videoId,
    });
  }),
);

/**
 * @swagger
 * /music-pieces/refresh-instruments:
 *   post:
 *     summary: Refresh instrument links for all pieces (re-parse filenames)
 *     tags: [Music Pieces]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Instruments refreshed
 */
router.post(
  '/refresh-instruments',
  authenticateToken,
  requireRole('admin', 'music_committee'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    // Get all pieces
    const pieces = db
      .prepare(
        `
        SELECT id, original_filename, instrument_id
        FROM music_pieces
        WHERE association_id = ? AND deleted_at IS NULL
    `,
      )
      .all(req.user!.associationId) as { id: string; original_filename: string; instrument_id: string | null }[];

    let updated = 0;
    let alreadyLinked = 0;
    let notFound = 0;

    // Load instruments + aliases once instead of querying per piece
    const instrumentMap = loadInstrumentMap();

    withTransaction(() => {
      const updateStmt = db.prepare('UPDATE music_pieces SET instrument_id = ? WHERE id = ?');

      for (const piece of pieces) {
        const parsed = parseFilename(piece.original_filename);

        if (parsed.instrument) {
          const instrumentId = findInstrumentId(parsed.instrument, instrumentMap);

          if (instrumentId) {
            if (piece.instrument_id !== instrumentId) {
              updateStmt.run(instrumentId, piece.id);
              updated++;
            } else {
              alreadyLinked++;
            }
          } else {
            notFound++;
          }
        }
      }
    });

    logger.info(`Instruments refreshed`, {
      updated,
      alreadyLinked,
      notFound,
      total: pieces.length,
      refreshedBy: req.user!.id,
    });

    res.json({
      message: `Instrumenten bijgewerkt.`,
      updated,
      alreadyLinked,
      notFound,
      total: pieces.length,
    });
  }),
);

/**
 * @swagger
 * /music-pieces/shared:
 *   get:
 *     summary: Get shared music pieces (pieces shared with my association)
 *     tags: [Music Pieces]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of shared music pieces
 */
router.get(
  '/shared',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const SHARED_HARD_LIMIT = 1000;
    const pieces = db
      .prepare(
        `
        SELECT mp.id, mp.title, mp.arranger, mp.tuning, mp.group_number, mp.clef,
               mp.youtube_url, mp.original_filename, mp.created_at,
               i.id as instrument_id, i.name as instrument_name,
               a.name as owner_association
        FROM music_pieces mp
        LEFT JOIN instruments i ON mp.instrument_id = i.id
        JOIN shared_music_access sma ON mp.id = sma.music_piece_id
        JOIN associations a ON mp.association_id = a.id
        WHERE sma.association_id = ? AND mp.association_id != ? AND mp.deleted_at IS NULL
        ORDER BY mp.title
        LIMIT ?
    `,
      )
      .all(req.user!.associationId, req.user!.associationId, SHARED_HARD_LIMIT);

    if (pieces.length === SHARED_HARD_LIMIT) {
      logger.warn(
        `GET /music-pieces/shared hit the hard limit of ${SHARED_HARD_LIMIT} rows; results may be truncated.`,
        {
          userId: req.user!.id,
          associationId: req.user!.associationId,
        },
      );
    }

    res.json(
      pieces.map((p: any) => ({
        id: p.id,
        title: p.title,
        arranger: p.arranger,
        tuning: p.tuning,
        groupNumber: p.group_number,
        clef: p.clef,
        youtubeUrl: p.youtube_url,
        originalFilename: p.original_filename,
        createdAt: p.created_at,
        instrumentId: p.instrument_id,
        instrumentName: p.instrument_name,
        ownerAssociation: p.owner_association,
      })),
    );
  }),
);

/**
 * @swagger
 * /music-pieces/upload:
 *   post:
 *     summary: Upload multiple music pieces
 *     tags: [Music Pieces]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               files:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *               listId:
 *                 type: string
 *               youtubeUrls:
 *                 type: string
 *     responses:
 *       201:
 *         description: Files uploaded successfully
 */
router.post(
  '/upload',
  authenticateToken,
  requireRole('admin', 'music_committee'),
  upload.array('files', 100),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      throw new ApiError(400, 'Geen bestanden geüpload.');
    }

    const { listId, youtubeUrls } = req.body;
    const youtubeUrlMap: Record<string, string> = youtubeUrls ? JSON.parse(youtubeUrls) : {};

    const results: any[] = [];
    const errors: any[] = [];

    // Magic-byte validation after multer stored the files on disk: the
    // mimetype check in fileFilter is client-controlled and spoofable.
    const validFiles: Express.Multer.File[] = [];
    for (const file of files) {
      const header = await readFileHeader(file.path).catch(() => Buffer.alloc(0));
      if (isPdf(header)) {
        validFiles.push(file);
      } else {
        await deleteFile(file.path);
        errors.push({
          filename: file.originalname,
          error: 'Bestand is geen geldige PDF.',
        });
      }
    }

    // Load instruments + aliases once instead of querying per file
    const instrumentMap = loadInstrumentMap();

    withTransaction(() => {
      for (const file of validFiles) {
        try {
          const parsed = parseFilename(file.originalname);
          const instrumentId = parsed.instrument ? findInstrumentId(parsed.instrument, instrumentMap) : null;

          const pieceId = uuidv4();
          const youtubeUrl = youtubeUrlMap[file.originalname] || null;

          db.prepare(
            `
                    INSERT INTO music_pieces (id, title, arranger, instrument_id, tuning, group_number, clef,
                                             file_path, original_filename, youtube_url, association_id, uploaded_by)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `,
          ).run(
            pieceId,
            parsed.title,
            parsed.arranger,
            instrumentId,
            parsed.tuning,
            parsed.groupNumber,
            parsed.clef,
            file.filename,
            file.originalname,
            youtubeUrl,
            req.user!.associationId,
            req.user!.id,
          );

          // Add to list if specified
          if (listId) {
            db.prepare('INSERT OR IGNORE INTO music_list_pieces (music_list_id, music_piece_id) VALUES (?, ?)').run(
              listId,
              pieceId,
            );
          }

          results.push({
            id: pieceId,
            filename: file.originalname,
            title: parsed.title,
            instrumentId,
            instrumentFound: !!instrumentId,
          });
        } catch (err) {
          errors.push({
            filename: file.originalname,
            error: (err as Error).message,
          });
        }
      }
    });

    logger.info(`Files uploaded: ${results.length} success, ${errors.length} errors`, { uploadedBy: req.user!.id });

    // Log audit event for bulk upload
    if (results.length > 0) {
      logAuditEvent(
        req.user!.id,
        'upload',
        'music_piece',
        results[0].id,
        `${results.length} muziekstukken`,
        {
          count: results.length,
          titles: results.slice(0, 5).map((r) => r.title),
          listId: listId || null,
        },
        req.ip,
        req.get('user-agent'),
      );
    }

    res.status(201).json({
      message: `${results.length} bestanden succesvol geüpload.`,
      uploaded: results,
      errors: errors.length > 0 ? errors : undefined,
    });

    // Fire-and-forget: notify orchestra members about new music
    if (results.length > 0) {
      const notifTitle =
        results.length === 1
          ? `Nieuw muziekstuk: ${results[0].title}`
          : `${results.length} nieuwe muziekstukken toegevoegd`;
      const notifBody =
        results.length === 1
          ? `${results[0].title} is beschikbaar gesteld.`
          : `Er zijn ${results.length} nieuwe muziekstukken beschikbaar gesteld.`;
      const notifData = { count: results.length, listId: listId || null };

      if (listId) {
        // Notify the specific orchestra that owns this music list
        const musicList = db.prepare('SELECT orchestra_id FROM music_lists WHERE id = ?').get(listId) as
          { orchestra_id: string } | undefined;
        if (musicList?.orchestra_id) {
          notifyOrchestra(musicList.orchestra_id, 'new_music', notifTitle, notifBody, notifData, req.user!.id).catch(
            (err: Error) => logger.error('Failed to send new_music notification', { error: err.message }),
          );
        }
      } else {
        // No specific list – notify all orchestras in the association
        const orchestras = db
          .prepare('SELECT id FROM orchestras WHERE association_id = ?')
          .all(req.user!.associationId) as { id: string }[];
        for (const orch of orchestras) {
          notifyOrchestra(orch.id, 'new_music', notifTitle, notifBody, notifData, req.user!.id).catch((err: Error) =>
            logger.error('Failed to send new_music notification', { error: err.message }),
          );
        }
      }
    }
  }),
);

/**
 * @swagger
 * /music-pieces/upload-zip:
 *   post:
 *     summary: Upload a ZIP file containing multiple PDF music pieces
 *     tags: [Music Pieces]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               listId:
 *                 type: string
 *     responses:
 *       201:
 *         description: ZIP file processed and PDFs uploaded
 */
router.post(
  '/upload-zip',
  authenticateToken,
  requireRole('admin', 'music_committee'),
  zipUpload.single('file'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const file = req.file;

    if (!file) {
      throw new ApiError(400, 'Geen ZIP bestand geüpload.');
    }

    const { listId } = req.body;
    const results: any[] = [];
    const errors: any[] = [];
    const tempDir = path.join(UPLOAD_DIR, `temp-${uuidv4()}`);

    try {
      // Extract ZIP file
      const zip = new AdmZip(file.path);
      const zipEntries = zip.getEntries();

      // Filter for PDF files only
      const pdfEntries = zipEntries.filter(
        (entry) =>
          !entry.isDirectory &&
          entry.entryName.toLowerCase().endsWith('.pdf') &&
          !entry.entryName.startsWith('__MACOSX') &&
          !entry.entryName.includes('/.'), // Skip hidden files
      );

      if (pdfEntries.length === 0) {
        throw new ApiError(400, 'Geen PDF bestanden gevonden in de ZIP.');
      }

      if (pdfEntries.length > 200) {
        throw new ApiError(400, 'Maximaal 200 PDF bestanden per ZIP toegestaan.');
      }

      // Create temp directory for extraction
      fs.mkdirSync(tempDir, { recursive: true });

      // Load instruments + aliases once instead of querying per entry
      const instrumentMap = loadInstrumentMap();

      withTransaction(() => {
        for (const entry of pdfEntries) {
          try {
            const originalFilename = path.basename(entry.entryName);
            const parsed = parseFilename(originalFilename);
            const instrumentId = parsed.instrument ? findInstrumentId(parsed.instrument, instrumentMap) : null;

            // Extract entry and check magic bytes: the .pdf extension
            // inside the ZIP says nothing about the actual content
            const content = entry.getData();
            if (!isPdf(content)) {
              errors.push({
                filename: originalFilename,
                error: 'Bestand is geen geldige PDF.',
              });
              continue;
            }

            // Generate unique filename and write to destination
            const uniqueSuffix = `${Date.now()}-${uuidv4()}`;
            const newFilename = `${uniqueSuffix}.pdf`;
            const destPath = path.join(UPLOAD_DIR, newFilename);
            fs.writeFileSync(destPath, content);

            const pieceId = uuidv4();

            db.prepare(
              `
                        INSERT INTO music_pieces (id, title, arranger, instrument_id, tuning, group_number, clef,
                                                 file_path, original_filename, association_id, uploaded_by)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `,
            ).run(
              pieceId,
              parsed.title,
              parsed.arranger,
              instrumentId,
              parsed.tuning,
              parsed.groupNumber,
              parsed.clef,
              newFilename,
              originalFilename,
              req.user!.associationId,
              req.user!.id,
            );

            // Add to list if specified
            if (listId) {
              db.prepare('INSERT OR IGNORE INTO music_list_pieces (music_list_id, music_piece_id) VALUES (?, ?)').run(
                listId,
                pieceId,
              );
            }

            results.push({
              id: pieceId,
              filename: originalFilename,
              title: parsed.title,
              instrumentId,
              instrumentFound: !!instrumentId,
            });
          } catch (err) {
            errors.push({
              filename: path.basename(entry.entryName),
              error: (err as Error).message,
            });
          }
        }
      });

      logger.info(`ZIP upload: ${results.length} success, ${errors.length} errors`, {
        uploadedBy: req.user!.id,
        zipFilename: file.originalname,
      });

      // Log audit event
      if (results.length > 0) {
        logAuditEvent(
          req.user!.id,
          'upload',
          'music_piece',
          results[0].id,
          `${results.length} muziekstukken uit ZIP`,
          {
            count: results.length,
            zipFilename: file.originalname,
            titles: results.slice(0, 5).map((r) => r.title),
            listId: listId || null,
          },
          req.ip,
          req.get('user-agent'),
        );
      }

      res.status(201).json({
        message: `${results.length} bestanden succesvol geüpload uit ZIP.`,
        uploaded: results,
        errors: errors.length > 0 ? errors : undefined,
      });
    } finally {
      // Cleanup: delete the uploaded ZIP file
      deleteFile(file.path);
      // Cleanup: remove temp directory if it exists
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  }),
);

/**
 * @swagger
 * /music-pieces/bulk-delete:
 *   post:
 *     summary: Bulk delete music pieces
 *     tags: [Music Pieces]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               ids:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Music pieces deleted
 */
router.post(
  '/bulk-delete',
  authenticateToken,
  requireRole('admin', 'music_committee'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      throw new ApiError(400, 'Geen muziekstukken geselecteerd.');
    }

    if (ids.length > 500) {
      throw new ApiError(400, 'Maximaal 500 muziekstukken tegelijk verwijderen.');
    }

    // Get all pieces to delete
    const placeholders = ids.map(() => '?').join(', ');
    const pieces = db
      .prepare(
        `SELECT id, file_path FROM music_pieces WHERE id IN (${placeholders}) AND association_id = ? AND deleted_at IS NULL`,
      )
      .all(...ids, req.user!.associationId) as { id: string; file_path: string }[];

    if (pieces.length === 0) {
      throw new ApiError(404, 'Geen muziekstukken gevonden.');
    }

    // Soft delete: keep rows and PDF files; both are purged later by the
    // GDPR cleanup scheduler (SOFT_DELETE_RETENTION_DAYS).
    db.prepare(
      `UPDATE music_pieces SET deleted_at = ? WHERE id IN (${placeholders}) AND association_id = ? AND deleted_at IS NULL`,
    ).run(new Date().toISOString(), ...ids, req.user!.associationId);

    logger.info(`Bulk soft-deleted ${pieces.length} music pieces`, { deletedBy: req.user!.id, count: pieces.length });

    // Log audit event
    logAuditEvent(
      req.user!.id,
      'delete',
      'music_piece',
      pieces[0]?.id || 'bulk',
      `${pieces.length} muziekstukken`,
      { count: pieces.length, ids: ids.slice(0, 10) },
      req.ip,
      req.get('user-agent'),
    );

    res.json({ message: `${pieces.length} muziekstukken verwijderd.`, count: pieces.length });
  }),
);

/**
 * @swagger
 * /music-pieces/{id}:
 *   put:
 *     summary: Update music piece
 *     tags: [Music Pieces]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MusicPieceUpdate'
 *     responses:
 *       200:
 *         description: Music piece updated
 */
router.put(
  '/:id',
  authenticateToken,
  requireRole('admin', 'music_committee'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = updateMusicPieceSchema.parse(req.body);

    const piece = db
      .prepare('SELECT id FROM music_pieces WHERE id = ? AND association_id = ? AND deleted_at IS NULL')
      .get(req.params.id, req.user!.associationId);

    if (!piece) {
      throw new ApiError(404, 'Muziekstuk niet gevonden.');
    }

    db.prepare(
      `
        UPDATE music_pieces
        SET title = ?, arranger = ?, instrument_id = ?, tuning = ?, group_number = ?,
            clef = ?, youtube_url = ?
        WHERE id = ?
    `,
    ).run(
      data.title,
      data.arranger || null,
      data.instrumentId || null,
      data.tuning || null,
      data.groupNumber || null,
      data.clef || null,
      data.youtubeUrl || null,
      req.params.id,
    );

    logger.info(`Music piece updated: ${req.params.id}`, { updatedBy: req.user!.id });

    // Log audit event
    logAuditEvent(
      req.user!.id,
      'update',
      'music_piece',
      req.params.id,
      data.title,
      {
        arranger: data.arranger,
        instrumentId: data.instrumentId,
        tuning: data.tuning,
      },
      req.ip,
      req.get('user-agent'),
    );

    res.json({ message: 'Muziekstuk succesvol bijgewerkt.' });
  }),
);

/**
 * @swagger
 * /music-pieces/{id}:
 *   delete:
 *     summary: Delete music piece (including file)
 *     tags: [Music Pieces]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Music piece deleted
 */
router.delete(
  '/:id',
  authenticateToken,
  requireRole('admin', 'music_committee'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const piece = db
      .prepare(
        'SELECT file_path, title, original_filename FROM music_pieces WHERE id = ? AND association_id = ? AND deleted_at IS NULL',
      )
      .get(req.params.id, req.user!.associationId) as
      { file_path: string; title: string; original_filename: string } | undefined;

    if (!piece) {
      throw new ApiError(404, 'Muziekstuk niet gevonden.');
    }

    // Soft delete: keep the row and PDF file; both are purged later by the
    // GDPR cleanup scheduler (SOFT_DELETE_RETENTION_DAYS).
    db.prepare('UPDATE music_pieces SET deleted_at = ? WHERE id = ?').run(new Date().toISOString(), req.params.id);

    logger.info(`Music piece soft-deleted: ${req.params.id}`, { deletedBy: req.user!.id });

    // Log audit event
    logAuditEvent(
      req.user!.id,
      'delete',
      'music_piece',
      req.params.id,
      piece.title,
      { originalFilename: piece.original_filename },
      req.ip,
      req.get('user-agent'),
    );

    res.json({ message: 'Muziekstuk succesvol verwijderd.' });
  }),
);

/**
 * @swagger
 * /music-pieces/{id}/restore:
 *   post:
 *     summary: Restore a soft-deleted music piece
 *     tags: [Music Pieces]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Music piece restored
 *       404:
 *         description: Music piece not found or not deleted
 */
router.post(
  '/:id/restore',
  authenticateToken,
  requireRole('admin', 'music_committee'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const piece = db
      .prepare('SELECT id, title FROM music_pieces WHERE id = ? AND association_id = ? AND deleted_at IS NOT NULL')
      .get(req.params.id, req.user!.associationId) as { id: string; title: string } | undefined;

    if (!piece) {
      throw new ApiError(404, 'Verwijderd muziekstuk niet gevonden.');
    }

    db.prepare('UPDATE music_pieces SET deleted_at = NULL WHERE id = ?').run(piece.id);

    logger.info(`Music piece restored: ${req.params.id}`, { restoredBy: req.user!.id });

    logAuditEvent(
      req.user!.id,
      'restore',
      'music_piece',
      req.params.id,
      piece.title,
      undefined,
      req.ip,
      req.get('user-agent'),
    );

    res.json({ message: 'Muziekstuk succesvol hersteld.' });
  }),
);

/**
 * @swagger
 * /music-pieces/{id}/download:
 *   get:
 *     summary: Download music piece
 *     tags: [Music Pieces]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: File download
 */
router.get(
  '/:id/download',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const piece = db
      .prepare(
        `
        SELECT mp.file_path, mp.original_filename, mp.instrument_id
        FROM music_pieces mp
        WHERE mp.id = ? AND mp.association_id = ? AND mp.deleted_at IS NULL
    `,
      )
      .get(req.params.id, req.user!.associationId) as any;

    if (!piece) {
      throw new ApiError(404, 'Muziekstuk niet gevonden.');
    }

    // For regular members, check if they play this instrument
    if (req.user!.role === 'member' && piece.instrument_id) {
      const userPlaysInstrument = db
        .prepare('SELECT 1 FROM user_instruments WHERE user_id = ? AND instrument_id = ?')
        .get(req.user!.id, piece.instrument_id);

      if (!userPlaysInstrument) {
        throw new ApiError(403, 'Je hebt geen toegang tot dit muziekstuk.');
      }
    }

    const filePath = path.join(UPLOAD_DIR, piece.file_path);

    if (!fs.existsSync(filePath)) {
      throw new ApiError(404, 'Bestand niet gevonden.');
    }

    res.download(filePath, piece.original_filename);
  }),
);

/**
 * @swagger
 * /music-pieces/{id}/share:
 *   post:
 *     summary: Share music piece with another association
 *     tags: [Music Pieces]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - associationId
 *             properties:
 *               associationId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Music piece shared
 */
router.post(
  '/:id/share',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = shareMusicPieceSchema.parse(req.body);

    const piece = db
      .prepare('SELECT id FROM music_pieces WHERE id = ? AND association_id = ? AND deleted_at IS NULL')
      .get(req.params.id, req.user!.associationId);

    if (!piece) {
      throw new ApiError(404, 'Muziekstuk niet gevonden.');
    }

    // Check if association exists
    const association = db.prepare('SELECT id FROM associations WHERE id = ?').get(data.associationId);
    if (!association) {
      throw new ApiError(404, 'Vereniging niet gevonden.');
    }

    withTransaction(() => {
      // Mark piece as shared
      db.prepare('UPDATE music_pieces SET is_shared = 1 WHERE id = ?').run(req.params.id);

      // Add access for the association
      db.prepare(
        `
            INSERT OR IGNORE INTO shared_music_access (music_piece_id, association_id)
            VALUES (?, ?)
        `,
      ).run(req.params.id, data.associationId);
    });

    logger.info(`Music piece shared: ${req.params.id} with association ${data.associationId}`, {
      sharedBy: req.user!.id,
    });

    // Log audit event
    logAuditEvent(
      req.user!.id,
      'share',
      'music_piece',
      req.params.id,
      'Muziekstuk gedeeld',
      { sharedWithAssociationId: data.associationId },
      req.ip,
      req.get('user-agent'),
    );

    res.json({ message: 'Muziekstuk succesvol gedeeld.' });
  }),
);

/**
 * @swagger
 * /music-pieces/bulk:
 *   put:
 *     summary: Bulk update music pieces
 *     tags: [Music Pieces]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - pieceIds
 *               - updates
 *             properties:
 *               pieceIds:
 *                 type: array
 *                 items:
 *                   type: string
 *               updates:
 *                 type: object
 *                 properties:
 *                   instrumentId:
 *                     type: string
 *                     nullable: true
 *                   addToListId:
 *                     type: string
 *                   removeFromListId:
 *                     type: string
 *     responses:
 *       200:
 *         description: Pieces updated
 */
router.put(
  '/bulk',
  authenticateToken,
  requireRole('admin', 'music_committee'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = bulkUpdatePiecesSchema.parse(req.body);

    if (data.pieceIds.length === 0) {
      throw new ApiError(400, 'Geen muziekstukken geselecteerd.');
    }

    if (data.pieceIds.length > 100) {
      throw new ApiError(400, 'Maximaal 100 stukken tegelijk bijwerken.');
    }

    let updated = 0;

    withTransaction(() => {
      for (const pieceId of data.pieceIds) {
        // Verify piece exists and belongs to user's association
        const piece = db
          .prepare('SELECT id FROM music_pieces WHERE id = ? AND association_id = ?')
          .get(pieceId, req.user!.associationId);

        if (!piece) continue;

        // Update instrument if specified
        if (data.updates.instrumentId !== undefined) {
          db.prepare('UPDATE music_pieces SET instrument_id = ? WHERE id = ?').run(data.updates.instrumentId, pieceId);
        }

        // Add to list if specified
        if (data.updates.addToListId) {
          // Verify list belongs to same association
          const list = db
            .prepare(
              `
                    SELECT ml.id FROM music_lists ml
                    JOIN orchestras o ON ml.orchestra_id = o.id
                    WHERE ml.id = ? AND o.association_id = ?
                `,
            )
            .get(data.updates.addToListId, req.user!.associationId);

          if (list) {
            db.prepare(
              `
                        INSERT OR IGNORE INTO music_list_pieces (music_list_id, music_piece_id)
                        VALUES (?, ?)
                    `,
            ).run(data.updates.addToListId, pieceId);
          }
        }

        // Remove from list if specified
        if (data.updates.removeFromListId) {
          db.prepare(
            `
                    DELETE FROM music_list_pieces
                    WHERE music_list_id = ? AND music_piece_id = ?
                `,
          ).run(data.updates.removeFromListId, pieceId);
        }

        updated++;
      }
    });

    logger.info(`Bulk updated ${updated} music pieces`, { updatedBy: req.user!.id });

    res.json({
      message: `${updated} muziekstukken bijgewerkt.`,
      updated,
    });
  }),
);

/**
 * @swagger
 * /music-pieces/bulk:
 *   delete:
 *     summary: Bulk delete music pieces
 *     tags: [Music Pieces]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - pieceIds
 *             properties:
 *               pieceIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Pieces deleted
 */
router.delete(
  '/bulk',
  authenticateToken,
  requireRole('admin', 'music_committee'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = bulkDeletePiecesSchema.parse(req.body);

    if (data.pieceIds.length === 0) {
      throw new ApiError(400, 'Geen muziekstukken geselecteerd.');
    }

    if (data.pieceIds.length > 100) {
      throw new ApiError(400, 'Maximaal 100 stukken tegelijk verwijderen.');
    }

    let deleted = 0;
    const deletedAt = new Date().toISOString();

    withTransaction(() => {
      for (const pieceId of data.pieceIds) {
        const piece = db
          .prepare('SELECT id FROM music_pieces WHERE id = ? AND association_id = ? AND deleted_at IS NULL')
          .get(pieceId, req.user!.associationId) as { id: string } | undefined;

        if (!piece) continue;

        // Soft delete: keep the row and PDF file; both are purged later by
        // the GDPR cleanup scheduler (SOFT_DELETE_RETENTION_DAYS).
        db.prepare('UPDATE music_pieces SET deleted_at = ? WHERE id = ?').run(deletedAt, pieceId);
        deleted++;
      }
    });

    logger.info(`Bulk soft-deleted ${deleted} music pieces`, { deletedBy: req.user!.id });

    // Log audit event
    logAuditEvent(
      req.user!.id,
      'bulk_delete',
      'music_pieces',
      data.pieceIds.join(','),
      `${deleted} muziekstukken verwijderd`,
      undefined,
      req.ip,
      req.get('user-agent'),
    );

    res.json({
      message: `${deleted} muziekstukken verwijderd.`,
      deleted,
    });
  }),
);

/**
 * @swagger
 * /music-pieces/batch-export:
 *   post:
 *     summary: Export multiple music pieces as a ZIP file
 *     tags: [Music Pieces]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - pieceIds
 *             properties:
 *               pieceIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of music piece IDs to export
 *               includeMetadata:
 *                 type: boolean
 *                 description: Include a metadata JSON file in the ZIP
 *     responses:
 *       200:
 *         description: ZIP file containing the requested music pieces
 *         content:
 *           application/zip:
 *             schema:
 *               type: string
 *               format: binary
 */
router.post(
  '/batch-export',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { pieceIds, includeMetadata = true } = req.body;

    if (!Array.isArray(pieceIds) || pieceIds.length === 0) {
      throw new ApiError(400, 'Geen muziekstukken geselecteerd voor export.');
    }

    if (pieceIds.length > 100) {
      throw new ApiError(400, 'Maximaal 100 muziekstukken tegelijk exporteren.');
    }

    // Get pieces with their metadata
    const placeholders = pieceIds.map(() => '?').join(', ');
    const pieces = db
      .prepare(
        `
        SELECT mp.id, mp.title, mp.arranger, mp.tuning, mp.group_number, mp.clef,
               mp.file_path, mp.original_filename, mp.youtube_url, mp.created_at,
               i.name as instrument_name
        FROM music_pieces mp
        LEFT JOIN instruments i ON mp.instrument_id = i.id
        WHERE mp.id IN (${placeholders}) AND mp.association_id = ? AND mp.deleted_at IS NULL
    `,
      )
      .all(...pieceIds, req.user!.associationId) as any[];

    if (pieces.length === 0) {
      throw new ApiError(404, 'Geen muziekstukken gevonden.');
    }

    // Create ZIP file
    const zip = new AdmZip();
    const metadata: any[] = [];
    const addedFiles = new Set<string>();

    for (const piece of pieces) {
      const filePath = path.join(UPLOAD_DIR, piece.file_path);

      if (fs.existsSync(filePath)) {
        // Generate unique filename to avoid conflicts
        let filename = piece.original_filename || `${piece.title}.pdf`;
        let counter = 1;
        while (addedFiles.has(filename)) {
          const ext = path.extname(filename);
          const base = path.basename(filename, ext);
          filename = `${base}_${counter}${ext}`;
          counter++;
        }
        addedFiles.add(filename);

        zip.addLocalFile(filePath, '', filename);

        // Add to metadata
        metadata.push({
          id: piece.id,
          title: piece.title,
          arranger: piece.arranger,
          instrument: piece.instrument_name,
          tuning: piece.tuning,
          groupNumber: piece.group_number,
          clef: piece.clef,
          youtubeUrl: piece.youtube_url,
          originalFilename: piece.original_filename,
          exportedFilename: filename,
          createdAt: piece.created_at,
        });
      }
    }

    // Add metadata file if requested
    if (includeMetadata && metadata.length > 0) {
      const metadataJson = JSON.stringify(metadata, null, 2);
      zip.addFile('metadata.json', Buffer.from(metadataJson, 'utf8'));
    }

    // Log audit event
    logAuditEvent(
      req.user!.id,
      'batch_export',
      'music_pieces',
      pieceIds.join(','),
      `${pieces.length} muziekstukken geexporteerd`,
      { count: pieces.length },
      req.ip,
      req.get('user-agent'),
    );

    logger.info(`Batch export: ${pieces.length} pieces`, { exportedBy: req.user!.id });

    // Generate ZIP filename with timestamp
    const timestamp = new Date().toISOString().slice(0, 10);
    const zipFilename = `muziekstukken-export-${timestamp}.zip`;

    // Send ZIP file
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${zipFilename}"`,
    });

    res.send(zip.toBuffer());
  }),
);

/**
 * @swagger
 * /music-pieces/batch-export-by-title:
 *   post:
 *     summary: Export all pieces for a specific title as a ZIP file
 *     tags: [Music Pieces]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *             properties:
 *               title:
 *                 type: string
 *                 description: Title of the music piece
 *               arranger:
 *                 type: string
 *                 description: Optional arranger filter
 *     responses:
 *       200:
 *         description: ZIP file containing all pieces for the title
 */
router.post(
  '/batch-export-by-title',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { title, arranger } = req.body;

    if (!title) {
      throw new ApiError(400, 'Titel is verplicht.');
    }

    // Get all pieces for this title
    let query = `
        SELECT mp.id, mp.title, mp.arranger, mp.tuning, mp.group_number, mp.clef,
               mp.file_path, mp.original_filename, mp.youtube_url, mp.created_at,
               i.name as instrument_name
        FROM music_pieces mp
        LEFT JOIN instruments i ON mp.instrument_id = i.id
        WHERE mp.title = ? AND mp.association_id = ? AND mp.deleted_at IS NULL
    `;
    const params: any[] = [title, req.user!.associationId];

    if (arranger) {
      query += ' AND mp.arranger = ?';
      params.push(arranger);
    }

    query += ' ORDER BY i.name, mp.group_number';

    const pieces = db.prepare(query).all(...params) as any[];

    if (pieces.length === 0) {
      throw new ApiError(404, 'Geen muziekstukken gevonden voor deze titel.');
    }

    // Create ZIP file
    const zip = new AdmZip();
    const metadata: any[] = [];
    const addedFiles = new Set<string>();

    for (const piece of pieces) {
      const filePath = path.join(UPLOAD_DIR, piece.file_path);

      if (fs.existsSync(filePath)) {
        // Generate organized filename
        let filename = piece.original_filename || `${piece.title}.pdf`;
        let counter = 1;
        while (addedFiles.has(filename)) {
          const ext = path.extname(filename);
          const base = path.basename(filename, ext);
          filename = `${base}_${counter}${ext}`;
          counter++;
        }
        addedFiles.add(filename);

        zip.addLocalFile(filePath, '', filename);

        metadata.push({
          id: piece.id,
          title: piece.title,
          arranger: piece.arranger,
          instrument: piece.instrument_name,
          tuning: piece.tuning,
          groupNumber: piece.group_number,
          clef: piece.clef,
          exportedFilename: filename,
        });
      }
    }

    // Add metadata file
    zip.addFile('metadata.json', Buffer.from(JSON.stringify(metadata, null, 2), 'utf8'));

    // Generate safe filename
    const safeTitle = title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
    const timestamp = new Date().toISOString().slice(0, 10);
    const zipFilename = `${safeTitle}-${timestamp}.zip`;

    // Sanitize user input for log safety (prevent log injection via CR/LF)
    const safeTitleForLog = String(title).replace(/[\r\n]/g, '');
    logger.info(`Batch export by title: ${pieces.length} pieces for "${safeTitleForLog}"`, {
      exportedBy: req.user!.id,
    });

    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${zipFilename}"`,
    });

    res.send(zip.toBuffer());
  }),
);

export default router;
