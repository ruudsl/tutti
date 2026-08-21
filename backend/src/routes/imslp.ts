import { Router, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { searchImslp, getWorkDetails, downloadPdf } from '../services/imslp';
import db from '../database/connection';
import logger from '../utils/logger';
import { isPdf } from '../utils/fileValidation';

const router = Router();

/** Bovengrens voor een gedownloade pdf, zodat het geheugen niet volloopt. */
const MAX_PDF_BYTES = 50 * 1024 * 1024;

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads');

/**
 * @swagger
 * /imslp/search:
 *   get:
 *     summary: Search IMSLP for works
 *     tags: [IMSLP]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Search query (title)
 *       - in: query
 *         name: composer
 *         schema:
 *           type: string
 *         description: Composer name (optional)
 *     responses:
 *       200:
 *         description: Search results
 */
router.get(
  '/search',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const query = ((req.query.q as string) || '').trim();
    const composer = ((req.query.composer as string) || '').trim() || undefined;

    if (!query) {
      throw new ApiError(400, 'Search query is required');
    }

    logger.info(`IMSLP search request: q="${query}", composer="${composer || ''}"`);

    const result = await searchImslp(query, composer);

    res.json(result);
  }),
);

/**
 * @swagger
 * /imslp/work/{id}:
 *   get:
 *     summary: Get IMSLP work details including available scores
 *     tags: [IMSLP]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: IMSLP work/page ID
 *     responses:
 *       200:
 *         description: Work details with scores
 *       404:
 *         description: Work not found
 */
router.get(
  '/work/:id',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const workId = req.params.id;

    if (!workId) {
      throw new ApiError(400, 'Work ID is required');
    }

    logger.info(`IMSLP work detail request: id="${workId}"`);

    const work = await getWorkDetails(workId);

    if (!work) {
      throw new ApiError(404, 'Work not found');
    }

    res.json(work);
  }),
);

/**
 * @swagger
 * /imslp/import:
 *   post:
 *     summary: Import a score from IMSLP into the library
 *     tags: [IMSLP]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fileUrl
 *               - title
 *             properties:
 *               fileUrl:
 *                 type: string
 *                 description: URL of the PDF to download
 *               title:
 *                 type: string
 *                 description: Title of the work
 *               composer:
 *                 type: string
 *                 description: Composer name
 *               arranger:
 *                 type: string
 *                 description: Arranger name (if applicable)
 *               instrumentation:
 *                 type: string
 *                 description: Instrumentation info
 *               imslpWorkId:
 *                 type: string
 *                 description: IMSLP work/page ID for reference
 *               imslpPermalink:
 *                 type: string
 *                 description: Permalink to the IMSLP work page
 *     responses:
 *       200:
 *         description: Import successful
 *       400:
 *         description: Invalid request
 *       500:
 *         description: Import failed
 */
router.post(
  '/import',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { fileUrl, title, composer, arranger, instrumentation, imslpWorkId, imslpPermalink } = req.body;

    if (!fileUrl || !title) {
      throw new ApiError(400, 'fileUrl and title are required');
    }

    const user = req.user!;

    // Check if user has permission (music_committee or admin)
    if (user.role !== 'admin' && user.role !== 'music_committee') {
      throw new ApiError(403, 'Only music committee members or admins can import from IMSLP');
    }

    logger.info(`IMSLP import request: title="${title}", url="${fileUrl}"`);

    // Download the PDF
    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await downloadPdf(fileUrl);
    } catch (error: any) {
      logger.error(`Failed to download PDF from IMSLP: ${error.message}`);
      throw new ApiError(502, `Failed to download PDF from IMSLP: ${error.message}`);
    }

    // Ensure upload directory exists
    if (!fs.existsSync(UPLOAD_DIR)) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }

    // Generate filename
    const safeTitle = title
      .replace(/[^a-zA-Z0-9_\-\s]/g, '')
      .trim()
      .substring(0, 100);
    const safeArranger = (arranger || composer || 'IMSLP')
      .replace(/[^a-zA-Z0-9_\-\s]/g, '')
      .trim()
      .substring(0, 50);
    const filename = `${safeTitle}_${safeArranger}_${Date.now()}.pdf`;
    const filePath = path.join(UPLOAD_DIR, filename);

    // Wat IMSLP terugstuurt is netwerkverkeer en dus niet te vertrouwen.
    // Voordat het als .pdf op schijf belandt, moet het ook echt een pdf zijn.
    if (!isPdf(pdfBuffer)) {
      throw new ApiError(502, 'Het gedownloade bestand is geen geldige PDF.');
    }

    if (pdfBuffer.length > MAX_PDF_BYTES) {
      throw new ApiError(502, 'Het gedownloade bestand is te groot.');
    }

    // Save the PDF
    fs.writeFileSync(filePath, pdfBuffer);
    logger.info(`Saved PDF to: ${filePath}`);

    // Create or get the music_title entry
    let musicTitleId: string;

    // music_titles heeft UNIQUE(title, arranger, association_id): de sleutel is
    // drieledig. De opzoeking was tweeledig en liet de arrangeur weg, dus bij
    // twee arrangementen van hetzelfde werk werd er willekeurig een gepakt -
    // en kreeg dat vreemde arrangement de IMSLP-gegevens opgestempeld, met de
    // nieuwe partij eronder. `IS` en niet `=`, want de arrangeur kan aan beide
    // kanten NULL zijn en NULL = NULL is in SQL nooit waar.
    const existingTitle = db
      .prepare(`SELECT id FROM music_titles WHERE title = ? AND arranger IS ? AND association_id = ?`)
      .get(title, arranger || null, user.associationId) as { id: string } | undefined;

    if (existingTitle) {
      musicTitleId = existingTitle.id;

      // Update IMSLP source info if not already set
      db.prepare(
        `UPDATE music_titles
             SET imslp_work_id = COALESCE(imslp_work_id, ?),
                 imslp_permalink = COALESCE(imslp_permalink, ?),
                 composer = COALESCE(composer, ?),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
      ).run(imslpWorkId || null, imslpPermalink || null, composer || null, musicTitleId);
    } else {
      musicTitleId = uuidv4();
      db.prepare(
        `INSERT INTO music_titles (id, title, composer, arranger, association_id, imslp_work_id, imslp_permalink, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      ).run(
        musicTitleId,
        title,
        composer || null,
        arranger || null,
        user.associationId,
        imslpWorkId || null,
        imslpPermalink || null,
      );
    }

    // Create a music_piece entry for the PDF
    const pieceId = uuidv4();

    // Determine instrument from instrumentation or use a generic one
    let instrumentId: string | null = null;
    if (instrumentation) {
      // Try to find a matching instrument
      const instrument = db
        .prepare(
          // De instrumententabel is gedeeld en kent geen association_id; zie
          // routes/instruments.ts, dat er ook niet op filtert.
          `SELECT id FROM instruments WHERE name LIKE ? OR name = 'Score' OR name = 'Full Score'`,
        )
        .get(`%${instrumentation.split(',')[0].trim()}%`) as { id: string } | undefined;
      if (instrument) {
        instrumentId = instrument.id;
      }
    }

    // If no instrument found, try to get or create a "Score" instrument
    if (!instrumentId) {
      // instruments is een globale lijst, niet per vereniging: er is één
      // "Score" voor iedereen. Eerder werd hier op association_id gefilterd,
      // een kolom die de tabel niet heeft.
      const scoreInstrument = db.prepare(`SELECT id FROM instruments WHERE name = 'Score'`).get() as
        { id: string } | undefined;

      if (scoreInstrument) {
        instrumentId = scoreInstrument.id;
      } else {
        instrumentId = uuidv4();
        db.prepare(`INSERT INTO instruments (id, name, created_at) VALUES (?, 'Score', CURRENT_TIMESTAMP)`).run(
          instrumentId,
        );
      }
    }

    db.prepare(
      `INSERT INTO music_pieces (id, title, arranger, instrument_id, file_path, original_filename, association_id, imslp_source, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    ).run(
      pieceId,
      title,
      arranger || composer || null,
      instrumentId,
      filename,
      filename,
      user.associationId,
      imslpPermalink || fileUrl,
    );

    // Log the activity
    db.prepare(
      // activity_log heeft geen association_id; de vereniging volgt uit user_id,
      // zoals ook gdpr.ts de log opschoont.
      `INSERT INTO activity_log (id, user_id, action_type, entity_type, entity_id, created_at)
         VALUES (?, ?, 'import', 'music_piece', ?, CURRENT_TIMESTAMP)`,
    ).run(uuidv4(), user.id, pieceId);

    res.json({
      message: 'Successfully imported from IMSLP',
      musicTitleId,
      musicPieceId: pieceId,
      filename,
      title,
      composer,
      arranger,
    });
  }),
);

export default router;
