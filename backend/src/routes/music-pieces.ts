import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import db from '../database/connection';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';

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

// Get all music pieces (admin/music_committee see all, members see filtered)
router.get('/', authenticateToken, (req: AuthRequest, res: Response) => {
    try {
        const { search, instrumentId, listId } = req.query;

        let query = `
            SELECT mp.id, mp.title, mp.arranger, mp.tuning, mp.group_number, mp.clef,
                   mp.youtube_url, mp.original_filename, mp.is_shared, mp.created_at,
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
            query += ' AND mp.instrument_id = ?';
            params.push(instrumentId);
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
            isShared: Boolean(p.is_shared),
            createdAt: p.created_at,
            instrumentId: p.instrument_id,
            instrumentName: p.instrument_name,
        })));
    } catch (error) {
        console.error('Get music pieces error:', error);
        res.status(500).json({ error: 'Interne serverfout.' });
    }
});

// Get my music pieces (filtered by user's instruments and orchestras)
router.get('/my-pieces', authenticateToken, (req: AuthRequest, res: Response) => {
    try {
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
    } catch (error) {
        console.error('Get my pieces error:', error);
        res.status(500).json({ error: 'Interne serverfout.' });
    }
});

// Upload multiple music pieces (admin or music_committee)
router.post('/upload', authenticateToken, requireRole('admin', 'music_committee'), upload.array('files', 100), async (req: AuthRequest, res: Response) => {
    try {
        const files = req.files as Express.Multer.File[];

        if (!files || files.length === 0) {
            return res.status(400).json({ error: 'Geen bestanden geüpload.' });
        }

        const { listId, youtubeUrls } = req.body;
        const youtubeUrlMap: Record<string, string> = youtubeUrls ? JSON.parse(youtubeUrls) : {};

        const results: any[] = [];
        const errors: any[] = [];

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

        res.status(201).json({
            message: `${results.length} bestanden succesvol geüpload.`,
            uploaded: results,
            errors: errors.length > 0 ? errors : undefined,
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Interne serverfout.' });
    }
});

// Update music piece (admin or music_committee)
router.put('/:id', authenticateToken, requireRole('admin', 'music_committee'), (req: AuthRequest, res: Response) => {
    try {
        const { title, arranger, instrumentId, tuning, groupNumber, clef, youtubeUrl, isShared } = req.body;

        const piece = db.prepare(
            'SELECT id FROM music_pieces WHERE id = ? AND association_id = ?'
        ).get(req.params.id, req.user!.associationId);

        if (!piece) {
            return res.status(404).json({ error: 'Muziekstuk niet gevonden.' });
        }

        db.prepare(`
            UPDATE music_pieces
            SET title = ?, arranger = ?, instrument_id = ?, tuning = ?, group_number = ?,
                clef = ?, youtube_url = ?, is_shared = ?
            WHERE id = ?
        `).run(
            title,
            arranger || null,
            instrumentId || null,
            tuning || null,
            groupNumber || null,
            clef || null,
            youtubeUrl || null,
            isShared ? 1 : 0,
            req.params.id
        );

        res.json({ message: 'Muziekstuk succesvol bijgewerkt.' });
    } catch (error) {
        console.error('Update music piece error:', error);
        res.status(500).json({ error: 'Interne serverfout.' });
    }
});

// Delete music piece (admin or music_committee)
router.delete('/:id', authenticateToken, requireRole('admin', 'music_committee'), (req: AuthRequest, res: Response) => {
    try {
        const piece = db.prepare(
            'SELECT file_path FROM music_pieces WHERE id = ? AND association_id = ?'
        ).get(req.params.id, req.user!.associationId) as { file_path: string } | undefined;

        if (!piece) {
            return res.status(404).json({ error: 'Muziekstuk niet gevonden.' });
        }

        // Delete file
        const filePath = path.join(UPLOAD_DIR, piece.file_path);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        // Delete from database
        db.prepare('DELETE FROM music_pieces WHERE id = ?').run(req.params.id);

        res.json({ message: 'Muziekstuk succesvol verwijderd.' });
    } catch (error) {
        console.error('Delete music piece error:', error);
        res.status(500).json({ error: 'Interne serverfout.' });
    }
});

// Download music piece
router.get('/:id/download', authenticateToken, (req: AuthRequest, res: Response) => {
    try {
        const piece = db.prepare(`
            SELECT mp.file_path, mp.original_filename, mp.instrument_id
            FROM music_pieces mp
            WHERE mp.id = ? AND mp.association_id = ?
        `).get(req.params.id, req.user!.associationId) as any;

        if (!piece) {
            return res.status(404).json({ error: 'Muziekstuk niet gevonden.' });
        }

        // For regular members, check if they play this instrument
        if (req.user!.role === 'member' && piece.instrument_id) {
            const userPlaysInstrument = db.prepare(
                'SELECT 1 FROM user_instruments WHERE user_id = ? AND instrument_id = ?'
            ).get(req.user!.id, piece.instrument_id);

            if (!userPlaysInstrument) {
                return res.status(403).json({ error: 'Je hebt geen toegang tot dit muziekstuk.' });
            }
        }

        const filePath = path.join(UPLOAD_DIR, piece.file_path);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Bestand niet gevonden.' });
        }

        res.download(filePath, piece.original_filename);
    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ error: 'Interne serverfout.' });
    }
});

// Share music piece with another association (admin only)
router.post('/:id/share', authenticateToken, requireRole('admin'), (req: AuthRequest, res: Response) => {
    try {
        const { associationId } = req.body;

        if (!associationId) {
            return res.status(400).json({ error: 'Vereniging ID is verplicht.' });
        }

        const piece = db.prepare(
            'SELECT id FROM music_pieces WHERE id = ? AND association_id = ?'
        ).get(req.params.id, req.user!.associationId);

        if (!piece) {
            return res.status(404).json({ error: 'Muziekstuk niet gevonden.' });
        }

        // Check if association exists
        const association = db.prepare('SELECT id FROM associations WHERE id = ?').get(associationId);
        if (!association) {
            return res.status(404).json({ error: 'Vereniging niet gevonden.' });
        }

        // Mark piece as shared
        db.prepare('UPDATE music_pieces SET is_shared = 1 WHERE id = ?').run(req.params.id);

        // Add access for the association
        db.prepare(`
            INSERT OR IGNORE INTO shared_music_access (music_piece_id, association_id)
            VALUES (?, ?)
        `).run(req.params.id, associationId);

        res.json({ message: 'Muziekstuk succesvol gedeeld.' });
    } catch (error) {
        console.error('Share music piece error:', error);
        res.status(500).json({ error: 'Interne serverfout.' });
    }
});

// Get all unique titles with piece counts (grouped view)
router.get('/titles', authenticateToken, requireRole('admin', 'music_committee'), (req: AuthRequest, res: Response) => {
    try {
        const { search, listId } = req.query;

        let query = `
            SELECT mp.title, mp.arranger,
                   COUNT(*) as piece_count,
                   MAX(mp.youtube_url) as youtube_url,
                   GROUP_CONCAT(DISTINCT i.name) as instruments
            FROM music_pieces mp
            LEFT JOIN instruments i ON mp.instrument_id = i.id
            WHERE mp.association_id = ?
        `;
        const params: any[] = [req.user!.associationId];

        if (search) {
            query += ' AND (LOWER(mp.title) LIKE ? OR LOWER(mp.arranger) LIKE ?)';
            const searchTerm = `%${(search as string).toLowerCase()}%`;
            params.push(searchTerm, searchTerm);
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

        res.json(titles.map((t: any) => ({
            title: t.title,
            arranger: t.arranger,
            pieceCount: t.piece_count,
            youtubeUrl: t.youtube_url,
            instruments: t.instruments ? t.instruments.split(',') : [],
            onList: listId ? titlesOnList.has(t.title) : undefined,
        })));
    } catch (error) {
        console.error('Get titles error:', error);
        res.status(500).json({ error: 'Interne serverfout.' });
    }
});

// Refresh instrument links for all pieces (re-parse filenames)
router.post('/refresh-instruments', authenticateToken, requireRole('admin', 'music_committee'), (req: AuthRequest, res: Response) => {
    try {
        // Get all pieces without instrument_id or where we want to re-check
        const pieces = db.prepare(`
            SELECT id, original_filename, instrument_id
            FROM music_pieces
            WHERE association_id = ?
        `).all(req.user!.associationId) as { id: string; original_filename: string; instrument_id: string | null }[];

        let updated = 0;
        let alreadyLinked = 0;
        let notFound = 0;

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

        res.json({
            message: `Instrumenten bijgewerkt.`,
            updated,
            alreadyLinked,
            notFound,
            total: pieces.length,
        });
    } catch (error) {
        console.error('Refresh instruments error:', error);
        res.status(500).json({ error: 'Interne serverfout.' });
    }
});

// Get shared music pieces (pieces shared with my association)
router.get('/shared', authenticateToken, (req: AuthRequest, res: Response) => {
    try {
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
    } catch (error) {
        console.error('Get shared pieces error:', error);
        res.status(500).json({ error: 'Interne serverfout.' });
    }
});

export default router;
