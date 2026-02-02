import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import db from '../database/connection';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { updateMusicPieceSchema, updateTitleMetaSchema, shareMusicPieceSchema } from '../validation/schemas';
import { withTransaction } from '../utils/database';
import logger from '../utils/logger';

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
            cb(new Error('Alleen PDF bestanden zijn toegestaan.'));
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

// Find instrument by name or alias
function findInstrumentId(instrumentName: string): string | null {
    if (!instrumentName) return null;

    const searchName = instrumentName.toLowerCase().trim();

    // First try exact match on instrument name
    let instrument = db.prepare(`
        SELECT id FROM instruments WHERE LOWER(name) = ?
    `).get(searchName) as { id: string } | undefined;

    if (instrument) return instrument.id;

    // Try alias
    const alias = db.prepare(`
        SELECT instrument_id FROM instrument_aliases WHERE LOWER(alias) = ?
    `).get(searchName) as { instrument_id: string } | undefined;

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
router.get('/', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const { search, instrumentId, listId } = req.query;

    let query = `
        SELECT mp.id, mp.title, mp.arranger, mp.tuning, mp.group_number, mp.clef,
               mp.youtube_url, mp.original_filename, mp.created_at,
               i.id as instrument_id, i.name as instrument_name
        FROM music_pieces mp
        LEFT JOIN instruments i ON mp.instrument_id = i.id
        WHERE mp.association_id = ?
    `;
    const params: any[] = [req.user!.associationId];

    // Filter by instrument for regular members
    if (req.user!.role === 'member') {
        const userInstruments = db.prepare(
            'SELECT instrument_id FROM user_instruments WHERE user_id = ?'
        ).all(req.user!.id) as { instrument_id: string }[];

        if (userInstruments.length === 0) {
            return res.json([]);
        }

        const instrumentIds = userInstruments.map(i => i.instrument_id);
        query += ` AND mp.instrument_id IN (${instrumentIds.map(() => '?').join(',')})`;
        params.push(...instrumentIds);
    }

    // Optional filters
    if (search) {
        query += ' AND (LOWER(mp.title) LIKE ? OR LOWER(mp.arranger) LIKE ?)';
        const searchTerm = `%${(search as string).toLowerCase()}%`;
        params.push(searchTerm, searchTerm);
    }

    if (instrumentId) {
        if (instrumentId === '__none__') {
            // Special filter: pieces without instrument assigned
            query += ' AND mp.instrument_id IS NULL';
        } else {
            query += ' AND mp.instrument_id = ?';
            params.push(instrumentId);
        }
    }

    if (listId) {
        query += ' AND mp.id IN (SELECT music_piece_id FROM music_list_pieces WHERE music_list_id = ?)';
        params.push(listId);
    }

    query += ' ORDER BY mp.title, i.name, mp.group_number';

    const pieces = db.prepare(query).all(...params);

    res.json(pieces.map((p: any) => ({
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
    })));
}));

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
router.get('/my-pieces', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    // Get user's instruments
    const userInstruments = db.prepare(
        'SELECT instrument_id FROM user_instruments WHERE user_id = ?'
    ).all(req.user!.id) as { instrument_id: string }[];

    if (userInstruments.length === 0) {
        return res.json([]);
    }

    // Get user's orchestras
    const userOrchestras = db.prepare(
        'SELECT orchestra_id FROM user_orchestras WHERE user_id = ?'
    ).all(req.user!.id) as { orchestra_id: string }[];

    if (userOrchestras.length === 0) {
        return res.json([]);
    }

    const instrumentIds = userInstruments.map(i => i.instrument_id);
    const orchestraIds = userOrchestras.map(o => o.orchestra_id);

    // Get pieces that are on lists for user's orchestras and match user's instruments
    const pieces = db.prepare(`
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
        ORDER BY o.name, ml.name, mp.title
    `).all(...instrumentIds, ...orchestraIds);

    res.json(pieces.map((p: any) => ({
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
    })));
}));

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
router.get('/titles', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
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
               mt.is_shared
        FROM music_pieces mp
        LEFT JOIN instruments i ON mp.instrument_id = i.id
        LEFT JOIN music_titles mt ON mp.title = mt.title
            AND COALESCE(mp.arranger, '') = COALESCE(mt.arranger, '')
            AND mt.association_id = mp.association_id
        WHERE mp.association_id = ?
    `;
    const params: any[] = [req.user!.associationId];

    if (search) {
        query += ' AND (LOWER(mp.title) LIKE ? OR LOWER(mp.arranger) LIKE ?)';
        const searchTerm = `%${(search as string).toLowerCase()}%`;
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
        const onList = db.prepare(`
            SELECT DISTINCT mp.title
            FROM music_pieces mp
            JOIN music_list_pieces mlp ON mp.id = mlp.music_piece_id
            WHERE mlp.music_list_id = ?
        `).all(listId) as { title: string }[];
        titlesOnList = new Set(onList.map(t => t.title));
    }

    // Get genres for each title
    const titlesWithGenres = titles.map((t: any) => {
        let genres: { id: string; name: string }[] = [];
        if (t.title_id) {
            genres = db.prepare(`
                SELECT g.id, g.name
                FROM genres g
                JOIN music_title_genres mtg ON g.id = mtg.genre_id
                WHERE mtg.music_title_id = ?
                ORDER BY g.name
            `).all(t.title_id) as { id: string; name: string }[];
        }

        // Get lists where this title appears
        const lists = db.prepare(`
            SELECT DISTINCT ml.id, ml.name, o.name as orchestra_name
            FROM music_lists ml
            JOIN music_list_pieces mlp ON ml.id = mlp.music_list_id
            JOIN music_pieces mp ON mlp.music_piece_id = mp.id
            JOIN orchestras o ON ml.orchestra_id = o.id
            WHERE mp.title = ? AND mp.association_id = ?
            ORDER BY o.name, ml.name
        `).all(t.title, req.user!.associationId) as { id: string; name: string; orchestra_name: string }[];

        return {
            title: t.title,
            arranger: t.arranger,
            pieceCount: t.piece_count,
            youtubeUrl: t.youtube_url,
            description: t.description,
            durationSeconds: t.duration_seconds || 0,
            grade: t.grade,
            mp3FilePath: t.mp3_file_path,
            isShared: Boolean(t.is_shared),
            instruments: t.instruments ? t.instruments.split(',') : [],
            onList: listId ? titlesOnList.has(t.title) : undefined,
            genres,
            lists,
        };
    });

    res.json(titlesWithGenres);
}));

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
router.get('/title-meta/:title', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const title = decodeURIComponent(req.params.title);
    const arranger = req.query.arranger ? decodeURIComponent(req.query.arranger as string) : null;

    const meta = db.prepare(`
        SELECT id, title, arranger, youtube_url, description, duration_seconds, grade, mp3_file_path, is_shared
        FROM music_titles
        WHERE title = ? AND COALESCE(arranger, '') = COALESCE(?, '') AND association_id = ?
    `).get(title, arranger, req.user!.associationId) as any;

    if (meta) {
        // Get genres for this title
        const genres = db.prepare(`
            SELECT g.id, g.name
            FROM genres g
            JOIN music_title_genres mtg ON g.id = mtg.genre_id
            WHERE mtg.music_title_id = ?
            ORDER BY g.name
        `).all(meta.id) as { id: string; name: string }[];

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
            genres: [],
        });
    }
}));

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
router.put('/title-meta', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = updateTitleMetaSchema.parse(req.body);

    let titleId: string;

    // Check if title metadata already exists
    const existing = db.prepare(`
        SELECT id FROM music_titles
        WHERE title = ? AND COALESCE(arranger, '') = COALESCE(?, '') AND association_id = ?
    `).get(data.title.trim(), data.arranger || null, req.user!.associationId) as { id: string } | undefined;

    withTransaction(() => {
        if (existing) {
            // Update existing
            db.prepare(`
                UPDATE music_titles
                SET youtube_url = ?, description = ?, duration_seconds = ?, grade = ?, is_shared = ?
                WHERE id = ?
            `).run(
                data.youtubeUrl || null,
                data.description || null,
                data.durationSeconds || 0,
                data.grade || null,
                data.isShared ? 1 : 0,
                existing.id
            );
            titleId = existing.id;
        } else {
            // Create new
            titleId = uuidv4();
            db.prepare(`
                INSERT INTO music_titles (id, title, arranger, youtube_url, description, duration_seconds, grade, is_shared, association_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                titleId,
                data.title.trim(),
                data.arranger || null,
                data.youtubeUrl || null,
                data.description || null,
                data.durationSeconds || 0,
                data.grade || null,
                data.isShared ? 1 : 0,
                req.user!.associationId
            );
        }

        // Update genres if provided
        if (Array.isArray(data.genreIds)) {
            // Remove existing genre associations
            db.prepare('DELETE FROM music_title_genres WHERE music_title_id = ?').run(titleId);

            // Add new genre associations
            const insertGenre = db.prepare(
                'INSERT INTO music_title_genres (music_title_id, genre_id) VALUES (?, ?)'
            );
            for (const genreId of data.genreIds) {
                if (genreId) {
                    insertGenre.run(titleId, genreId);
                }
            }
        }
    });

    logger.info(`Title metadata updated: ${data.title}`, { titleId: titleId!, updatedBy: req.user!.id });

    res.json({
        id: titleId!,
        message: existing ? 'Titel metadata bijgewerkt.' : 'Titel metadata aangemaakt.',
    });
}));

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
router.post('/title-mp3/:titleId', authenticateToken, requireRole('admin', 'music_committee'), mp3Upload.single('mp3'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { titleId } = req.params;

    if (!req.file) {
        throw new ApiError(400, 'MP3 bestand is verplicht.');
    }

    // Check if title exists and belongs to user's association
    const title = db.prepare(`
        SELECT id, mp3_file_path FROM music_titles WHERE id = ? AND association_id = ?
    `).get(titleId, req.user!.associationId) as { id: string; mp3_file_path: string | null } | undefined;

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

    res.json({
        message: 'MP3 bestand geüpload.',
        mp3FilePath: req.file.filename,
    });
}));

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
router.delete('/title-mp3/:titleId', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { titleId } = req.params;

    // Check if title exists and belongs to user's association
    const title = db.prepare(`
        SELECT id, mp3_file_path FROM music_titles WHERE id = ? AND association_id = ?
    `).get(titleId, req.user!.associationId) as { id: string; mp3_file_path: string | null } | undefined;

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

    res.json({
        message: 'MP3 bestand verwijderd.',
    });
}));

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
router.get('/mp3/:filename', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
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
}));

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
router.get('/youtube-meta', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
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

    const data = await response.json() as {
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
}));

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
router.post('/refresh-instruments', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    // Get all pieces
    const pieces = db.prepare(`
        SELECT id, original_filename, instrument_id
        FROM music_pieces
        WHERE association_id = ?
    `).all(req.user!.associationId) as { id: string; original_filename: string; instrument_id: string | null }[];

    let updated = 0;
    let alreadyLinked = 0;
    let notFound = 0;

    withTransaction(() => {
        const updateStmt = db.prepare('UPDATE music_pieces SET instrument_id = ? WHERE id = ?');

        for (const piece of pieces) {
            const parsed = parseFilename(piece.original_filename);

            if (parsed.instrument) {
                const instrumentId = findInstrumentId(parsed.instrument);

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

    logger.info(`Instruments refreshed`, { updated, alreadyLinked, notFound, total: pieces.length, refreshedBy: req.user!.id });

    res.json({
        message: `Instrumenten bijgewerkt.`,
        updated,
        alreadyLinked,
        notFound,
        total: pieces.length,
    });
}));

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
router.get('/shared', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const pieces = db.prepare(`
        SELECT mp.id, mp.title, mp.arranger, mp.tuning, mp.group_number, mp.clef,
               mp.youtube_url, mp.original_filename, mp.created_at,
               i.id as instrument_id, i.name as instrument_name,
               a.name as owner_association
        FROM music_pieces mp
        LEFT JOIN instruments i ON mp.instrument_id = i.id
        JOIN shared_music_access sma ON mp.id = sma.music_piece_id
        JOIN associations a ON mp.association_id = a.id
        WHERE sma.association_id = ? AND mp.association_id != ?
        ORDER BY mp.title
    `).all(req.user!.associationId, req.user!.associationId);

    res.json(pieces.map((p: any) => ({
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
    })));
}));

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
router.post('/upload', authenticateToken, requireRole('admin', 'music_committee'), upload.array('files', 100), asyncHandler(async (req: AuthRequest, res: Response) => {
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
        throw new ApiError(400, 'Geen bestanden geüpload.');
    }

    const { listId, youtubeUrls } = req.body;
    const youtubeUrlMap: Record<string, string> = youtubeUrls ? JSON.parse(youtubeUrls) : {};

    const results: any[] = [];
    const errors: any[] = [];

    withTransaction(() => {
        for (const file of files) {
            try {
                const parsed = parseFilename(file.originalname);
                const instrumentId = parsed.instrument ? findInstrumentId(parsed.instrument) : null;

                const pieceId = uuidv4();
                const youtubeUrl = youtubeUrlMap[file.originalname] || null;

                db.prepare(`
                    INSERT INTO music_pieces (id, title, arranger, instrument_id, tuning, group_number, clef,
                                             file_path, original_filename, youtube_url, association_id, uploaded_by)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
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
                    req.user!.id
                );

                // Add to list if specified
                if (listId) {
                    db.prepare(
                        'INSERT OR IGNORE INTO music_list_pieces (music_list_id, music_piece_id) VALUES (?, ?)'
                    ).run(listId, pieceId);
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

    res.status(201).json({
        message: `${results.length} bestanden succesvol geüpload.`,
        uploaded: results,
        errors: errors.length > 0 ? errors : undefined,
    });
}));

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
router.put('/:id', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = updateMusicPieceSchema.parse(req.body);

    const piece = db.prepare(
        'SELECT id FROM music_pieces WHERE id = ? AND association_id = ?'
    ).get(req.params.id, req.user!.associationId);

    if (!piece) {
        throw new ApiError(404, 'Muziekstuk niet gevonden.');
    }

    db.prepare(`
        UPDATE music_pieces
        SET title = ?, arranger = ?, instrument_id = ?, tuning = ?, group_number = ?,
            clef = ?, youtube_url = ?
        WHERE id = ?
    `).run(
        data.title,
        data.arranger || null,
        data.instrumentId || null,
        data.tuning || null,
        data.groupNumber || null,
        data.clef || null,
        data.youtubeUrl || null,
        req.params.id
    );

    logger.info(`Music piece updated: ${req.params.id}`, { updatedBy: req.user!.id });

    res.json({ message: 'Muziekstuk succesvol bijgewerkt.' });
}));

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
router.delete('/:id', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const piece = db.prepare(
        'SELECT file_path FROM music_pieces WHERE id = ? AND association_id = ?'
    ).get(req.params.id, req.user!.associationId) as { file_path: string } | undefined;

    if (!piece) {
        throw new ApiError(404, 'Muziekstuk niet gevonden.');
    }

    // Delete from database first
    db.prepare('DELETE FROM music_pieces WHERE id = ?').run(req.params.id);

    // Delete file asynchronously (don't wait for it)
    const filePath = path.join(UPLOAD_DIR, piece.file_path);
    deleteFile(filePath);

    logger.info(`Music piece deleted: ${req.params.id}`, { deletedBy: req.user!.id });

    res.json({ message: 'Muziekstuk succesvol verwijderd.' });
}));

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
router.get('/:id/download', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const piece = db.prepare(`
        SELECT mp.file_path, mp.original_filename, mp.instrument_id
        FROM music_pieces mp
        WHERE mp.id = ? AND mp.association_id = ?
    `).get(req.params.id, req.user!.associationId) as any;

    if (!piece) {
        throw new ApiError(404, 'Muziekstuk niet gevonden.');
    }

    // For regular members, check if they play this instrument
    if (req.user!.role === 'member' && piece.instrument_id) {
        const userPlaysInstrument = db.prepare(
            'SELECT 1 FROM user_instruments WHERE user_id = ? AND instrument_id = ?'
        ).get(req.user!.id, piece.instrument_id);

        if (!userPlaysInstrument) {
            throw new ApiError(403, 'Je hebt geen toegang tot dit muziekstuk.');
        }
    }

    const filePath = path.join(UPLOAD_DIR, piece.file_path);

    if (!fs.existsSync(filePath)) {
        throw new ApiError(404, 'Bestand niet gevonden.');
    }

    res.download(filePath, piece.original_filename);
}));

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
router.post('/:id/share', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = shareMusicPieceSchema.parse(req.body);

    const piece = db.prepare(
        'SELECT id FROM music_pieces WHERE id = ? AND association_id = ?'
    ).get(req.params.id, req.user!.associationId);

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
        db.prepare(`
            INSERT OR IGNORE INTO shared_music_access (music_piece_id, association_id)
            VALUES (?, ?)
        `).run(req.params.id, data.associationId);
    });

    logger.info(`Music piece shared: ${req.params.id} with association ${data.associationId}`, { sharedBy: req.user!.id });

    res.json({ message: 'Muziekstuk succesvol gedeeld.' });
}));

export default router;
