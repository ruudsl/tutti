import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { isAudio, validateUploadedFile } from '../utils/fileValidation';
import logger from '../utils/logger';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = Router();

// Configure multer for audio uploads
const audioStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads', 'recordings');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname) || '.webm'}`;
    cb(null, uniqueName);
  },
});

/**
 * Een gekoppeld id (orkest, repetitie, titel) komt uit de body en is geen
 * geheim: ids circuleren via gedeelde muzieklijsten en gezamenlijke agenda's.
 * Zonder controle belandt een vreemd id in de opname, waarna GET het via de
 * LEFT JOIN met naam en al teruggeeft - de naam van een orkest of de titel
 * van een stuk uit een andere vereniging in ons eigen scherm. Elk gekoppeld
 * id moet dus van de eigen vereniging zijn.
 */
function controleerKoppeling(
  tabel: 'orchestras' | 'rehearsals' | 'music_titles',
  id: unknown,
  // associationId is string | null: een gebruiker zonder vereniging kan
  // simpelweg niets koppelen, want NULL matcht nooit.
  associationId: string | null,
  foutmelding: string,
): string | null {
  if (id === undefined || id === null || id === '') return null;
  const gevonden = db
    .prepare(`SELECT id FROM ${tabel} WHERE id = ? AND association_id = ?`)
    .get(String(id), associationId);
  if (!gevonden) {
    throw new ApiError(400, foutmelding);
  }
  return String(id);
}

/**
 * file_path staat in de database en wordt bij het uploaden zelf gezet, maar
 * zowel /stream als DELETE plakken hem met path.join achter process.cwd().
 * Een pad met '..' erin wijst dan buiten de uploadmap: bij het streamen is
 * dat een leesvenster op de hele server, bij het verwijderen een sloopkogel.
 * Vandaar een expliciete controle dat het resultaat binnen uploads/ blijft.
 */
function veiligBestandspad(filePath: string | null | undefined): string | null {
  if (!filePath) return null;
  const wortel = path.resolve(process.cwd(), 'uploads');
  const volledig = path.resolve(path.join(process.cwd(), filePath));
  if (volledig !== wortel && !volledig.startsWith(wortel + path.sep)) return null;
  return volledig;
}

/**
 * Leest een Range-header uit.
 *
 * Terug: null = geen (bruikbaar) bereik, stuur het hele bestand;
 * 'onbevredigbaar' = een bereik dat buiten het bestand valt (416);
 * anders het bereik zelf. Een onleesbare header wordt genegeerd in plaats van
 * blind door parseInt gehaald - dat leverde NaN op, en met NaN in
 * createReadStream klapte de route om in een 500 op een header die de
 * gebruiker zelf kan sturen.
 */
function leesBereik(
  header: string | undefined,
  grootte: number,
): { start: number; end: number } | null | 'onbevredigbaar' {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;

  const [, ruweStart, ruwEind] = match;
  if (ruweStart === '' && ruwEind === '') return null;

  let start: number;
  let end: number;
  if (ruweStart === '') {
    // Achterwaarts bereik: de laatste N bytes.
    const aantal = parseInt(ruwEind, 10);
    if (aantal === 0) return 'onbevredigbaar';
    start = Math.max(0, grootte - aantal);
    end = grootte - 1;
  } else {
    start = parseInt(ruweStart, 10);
    end = ruwEind === '' ? grootte - 1 : Math.min(parseInt(ruwEind, 10), grootte - 1);
  }

  if (start >= grootte || start > end) return 'onbevredigbaar';
  return { start, end };
}

const audioUpload = multer({
  storage: audioStorage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'audio/webm',
      'audio/mp3',
      'audio/mpeg',
      'audio/wav',
      'audio/ogg',
      'audio/mp4',
      'audio/x-m4a',
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      // Een kale Error valt in de centrale errorHandler door naar 500, terwijl
      // dit een fout van de client is. ApiError levert netjes een 400 op.
      cb(new ApiError(400, 'Ongeldig bestandstype. Alleen audio bestanden zijn toegestaan.'));
    }
  },
});

/**
 * @swagger
 * /audio-recordings:
 *   get:
 *     summary: Get audio recordings
 *     tags: [Audio Recordings]
 *     security:
 *       - bearerAuth: []
 */
router.get(
  '/',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { orchestraId, rehearsalId, musicTitleId, sectionInstrumentId, onlyPublic } = req.query;

    let query = `
        SELECT ar.*,
               u.first_name || ' ' || u.last_name as recorded_by_name,
               o.name as orchestra_name,
               mt.title as music_title,
               i.name as section_name
        FROM audio_recordings ar
        LEFT JOIN users u ON ar.recorded_by = u.id
        LEFT JOIN orchestras o ON ar.orchestra_id = o.id
        LEFT JOIN music_titles mt ON ar.music_title_id = mt.id
        LEFT JOIN instruments i ON ar.section_instrument_id = i.id
        WHERE ar.association_id = ?
    `;
    const params: any[] = [req.user!.associationId];

    // Filter by visibility
    if (onlyPublic === 'true') {
      query += ' AND ar.is_public = 1';
    } else {
      // Show user's own recordings + public ones
      query += ' AND (ar.is_public = 1 OR ar.recorded_by = ?)';
      params.push(req.user!.id);
    }

    if (orchestraId) {
      query += ' AND ar.orchestra_id = ?';
      params.push(orchestraId);
    }
    if (rehearsalId) {
      query += ' AND ar.rehearsal_id = ?';
      params.push(rehearsalId);
    }
    if (musicTitleId) {
      query += ' AND ar.music_title_id = ?';
      params.push(musicTitleId);
    }
    if (sectionInstrumentId) {
      query += ' AND ar.section_instrument_id = ?';
      params.push(sectionInstrumentId);
    }

    query += ' ORDER BY ar.created_at DESC LIMIT 100';

    const recordings = db.prepare(query).all(...params);

    res.json(
      recordings.map((r: any) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        filePath: r.file_path,
        fileSize: r.file_size,
        durationSeconds: r.duration_seconds,
        mimeType: r.mime_type,
        isPublic: !!r.is_public,
        createdAt: r.created_at,
        recordedBy: {
          id: r.recorded_by,
          name: r.recorded_by_name,
        },
        orchestra: r.orchestra_id
          ? {
              id: r.orchestra_id,
              name: r.orchestra_name,
            }
          : null,
        rehearsal: r.rehearsal_id ? { id: r.rehearsal_id } : null,
        musicTitle: r.music_title_id
          ? {
              id: r.music_title_id,
              title: r.music_title,
            }
          : null,
        section: r.section_instrument_id
          ? {
              id: r.section_instrument_id,
              name: r.section_name,
            }
          : null,
      })),
    );
  }),
);

/**
 * @swagger
 * /audio-recordings:
 *   post:
 *     summary: Upload a new audio recording
 *     tags: [Audio Recordings]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  '/',
  authenticateToken,
  audioUpload.single('audio'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.file) {
      throw new ApiError(400, 'Geen audio bestand geüpload');
    }

    const {
      title,
      description,
      orchestraId,
      rehearsalId,
      musicTitleId,
      sectionInstrumentId,
      durationSeconds,
      isPublic,
    } = req.body;

    // multer heeft het bestand al weggeschreven voordat deze handler draait,
    // dus elke afwijzing hierna moet het zelf opruimen - anders blijft er bij
    // elke mislukte upload een weesbestand op schijf achter.
    let gekoppeldOrkest: string | null;
    let gekoppeldeRepetitie: string | null;
    let gekoppeldeTitel: string | null;
    try {
      // Magic-byte check after multer stored the file (mimetype is spoofable);
      // deletes the file and throws FileValidationError on mismatch
      await validateUploadedFile(
        req.file.path,
        isAudio,
        'Ongeldig bestandstype. Alleen audio bestanden zijn toegestaan.',
      );

      if (!title) {
        throw new ApiError(400, 'Titel is verplicht');
      }

      gekoppeldOrkest = controleerKoppeling(
        'orchestras',
        orchestraId,
        req.user!.associationId,
        'Orkest niet gevonden.',
      );
      gekoppeldeRepetitie = controleerKoppeling(
        'rehearsals',
        rehearsalId,
        req.user!.associationId,
        'Repetitie niet gevonden.',
      );
      gekoppeldeTitel = controleerKoppeling(
        'music_titles',
        musicTitleId,
        req.user!.associationId,
        'Titel niet gevonden.',
      );
    } catch (fout) {
      try {
        fs.unlinkSync(req.file.path);
      } catch {
        // validateUploadedFile ruimt bij een mismatch zelf al op
      }
      throw fout;
    }

    const id = uuidv4();
    const filePath = `/uploads/recordings/${req.file.filename}`;

    db.prepare(
      `
        INSERT INTO audio_recordings (
            id, association_id, orchestra_id, rehearsal_id, music_title_id,
            title, description, file_path, file_size, duration_seconds,
            mime_type, recorded_by, is_public, section_instrument_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      id,
      req.user!.associationId,
      gekoppeldOrkest,
      gekoppeldeRepetitie,
      gekoppeldeTitel,
      title,
      description || null,
      filePath,
      req.file.size,
      parseInt(durationSeconds) || 0,
      req.file.mimetype,
      req.user!.id,
      isPublic === 'true' || isPublic === true ? 1 : 0,
      sectionInstrumentId || null,
    );

    logger.info(`Audio recording created: ${id} by user ${req.user!.id}`);

    res.status(201).json({
      id,
      title,
      filePath,
      message: 'Opname succesvol opgeslagen',
    });
  }),
);

/**
 * @swagger
 * /audio-recordings/{id}:
 *   get:
 *     summary: Get a single audio recording
 *     tags: [Audio Recordings]
 *     security:
 *       - bearerAuth: []
 */
router.get(
  '/:id',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const recording = db
      .prepare(
        `
        SELECT ar.*,
               u.first_name || ' ' || u.last_name as recorded_by_name,
               o.name as orchestra_name,
               mt.title as music_title
        FROM audio_recordings ar
        LEFT JOIN users u ON ar.recorded_by = u.id
        LEFT JOIN orchestras o ON ar.orchestra_id = o.id
        LEFT JOIN music_titles mt ON ar.music_title_id = mt.id
        WHERE ar.id = ? AND ar.association_id = ?
    `,
      )
      .get(req.params.id, req.user!.associationId) as any;

    if (!recording) {
      throw new ApiError(404, 'Opname niet gevonden');
    }

    // Check access
    if (!recording.is_public && recording.recorded_by !== req.user!.id) {
      throw new ApiError(403, 'Geen toegang tot deze opname');
    }

    res.json({
      id: recording.id,
      title: recording.title,
      description: recording.description,
      filePath: recording.file_path,
      fileSize: recording.file_size,
      durationSeconds: recording.duration_seconds,
      mimeType: recording.mime_type,
      isPublic: !!recording.is_public,
      createdAt: recording.created_at,
      recordedBy: {
        id: recording.recorded_by,
        name: recording.recorded_by_name,
      },
      orchestra: recording.orchestra_id
        ? {
            id: recording.orchestra_id,
            name: recording.orchestra_name,
          }
        : null,
      musicTitle: recording.music_title_id
        ? {
            id: recording.music_title_id,
            title: recording.music_title,
          }
        : null,
    });
  }),
);

/**
 * @swagger
 * /audio-recordings/{id}:
 *   patch:
 *     summary: Update an audio recording
 *     tags: [Audio Recordings]
 *     security:
 *       - bearerAuth: []
 */
router.patch(
  '/:id',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const recording = db
      .prepare(
        `
        SELECT * FROM audio_recordings WHERE id = ? AND association_id = ?
    `,
      )
      .get(req.params.id, req.user!.associationId) as any;

    if (!recording) {
      throw new ApiError(404, 'Opname niet gevonden');
    }

    // Only owner or admin can update
    if (recording.recorded_by !== req.user!.id && req.user!.role !== 'admin') {
      throw new ApiError(403, 'Geen rechten om deze opname te bewerken');
    }

    const { title, description, isPublic, musicTitleId, orchestraId } = req.body;

    const updates: string[] = [];
    const params: any[] = [];

    if (title !== undefined) {
      updates.push('title = ?');
      params.push(title);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      params.push(description);
    }
    if (isPublic !== undefined) {
      updates.push('is_public = ?');
      params.push(isPublic ? 1 : 0);
    }
    if (musicTitleId !== undefined) {
      updates.push('music_title_id = ?');
      params.push(controleerKoppeling('music_titles', musicTitleId, req.user!.associationId, 'Titel niet gevonden.'));
    }
    if (orchestraId !== undefined) {
      updates.push('orchestra_id = ?');
      params.push(controleerKoppeling('orchestras', orchestraId, req.user!.associationId, 'Orkest niet gevonden.'));
    }

    if (updates.length > 0) {
      params.push(req.params.id);
      db.prepare(`UPDATE audio_recordings SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }

    res.json({ message: 'Opname bijgewerkt' });
  }),
);

/**
 * @swagger
 * /audio-recordings/{id}:
 *   delete:
 *     summary: Delete an audio recording
 *     tags: [Audio Recordings]
 *     security:
 *       - bearerAuth: []
 */
router.delete(
  '/:id',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const recording = db
      .prepare(
        `
        SELECT * FROM audio_recordings WHERE id = ? AND association_id = ?
    `,
      )
      .get(req.params.id, req.user!.associationId) as any;

    if (!recording) {
      throw new ApiError(404, 'Opname niet gevonden');
    }

    // Only owner or admin can delete
    if (recording.recorded_by !== req.user!.id && req.user!.role !== 'admin') {
      throw new ApiError(403, 'Geen rechten om deze opname te verwijderen');
    }

    // Delete file from disk
    const filePath = veiligBestandspad(recording.file_path);
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    db.prepare('DELETE FROM audio_recordings WHERE id = ?').run(req.params.id);

    logger.info(`Audio recording deleted: ${req.params.id} by user ${req.user!.id}`);

    res.json({ message: 'Opname verwijderd' });
  }),
);

/**
 * @swagger
 * /audio-recordings/{id}/stream:
 *   get:
 *     summary: Stream an audio recording
 *     tags: [Audio Recordings]
 *     security:
 *       - bearerAuth: []
 */
router.get(
  '/:id/stream',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const recording = db
      .prepare(
        `
        SELECT * FROM audio_recordings WHERE id = ? AND association_id = ?
    `,
      )
      .get(req.params.id, req.user!.associationId) as any;

    if (!recording) {
      throw new ApiError(404, 'Opname niet gevonden');
    }

    // Check access
    if (!recording.is_public && recording.recorded_by !== req.user!.id) {
      throw new ApiError(403, 'Geen toegang tot deze opname');
    }

    const filePath = veiligBestandspad(recording.file_path);
    if (!filePath || !fs.existsSync(filePath)) {
      throw new ApiError(404, 'Audio bestand niet gevonden');
    }

    const stat = fs.statSync(filePath);
    const bereik = leesBereik(req.headers.range, stat.size);

    if (bereik === 'onbevredigbaar') {
      res.writeHead(416, {
        'Content-Range': `bytes */${stat.size}`,
        'Accept-Ranges': 'bytes',
      });
      res.end();
    } else if (bereik) {
      const { start, end } = bereik;
      const file = fs.createReadStream(filePath, { start, end });

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
        'Content-Type': recording.mime_type,
      });
      file.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': stat.size,
        'Content-Type': recording.mime_type,
      });
      fs.createReadStream(filePath).pipe(res);
    }
  }),
);

export default router;
