import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import db from '../database/connection';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import logger from '../utils/logger';

const router = Router();

// Setup upload directory
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads');

interface FailedImport {
  id: string;
  association_id: string;
  original_filename: string;
  file_path: string | null;
  import_type: string;
  error_message: string;
  error_code: string | null;
  metadata_json: string | null;
  source_info: string | null;
  list_id: string | null;
  retry_count: number;
  max_retries: number;
  status: string;
  created_by: string | null;
  created_at: string;
  last_retry_at: string | null;
  recovered_at: string | null;
}

/**
 * @swagger
 * /failed-imports:
 *   get:
 *     summary: Get all failed imports for the association
 *     tags: [Failed Imports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [failed, retrying, recovered, dismissed]
 *     responses:
 *       200:
 *         description: List of failed imports
 */
router.get(
  '/',
  authenticateToken,
  requireRole('admin', 'music_committee'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { status } = req.query;

    let query = `
        SELECT fi.*, u.first_name || ' ' || u.last_name as created_by_name,
               ml.name as list_name
        FROM failed_imports fi
        LEFT JOIN users u ON fi.created_by = u.id
        LEFT JOIN music_lists ml ON fi.list_id = ml.id
        WHERE fi.association_id = ?
    `;
    const params: any[] = [req.user!.associationId];

    if (status) {
      query += ' AND fi.status = ?';
      params.push(status);
    }

    query += ' ORDER BY fi.created_at DESC';

    const failedImports = db.prepare(query).all(...params);

    res.json(
      failedImports.map((fi: any) => ({
        id: fi.id,
        originalFilename: fi.original_filename,
        filePath: fi.file_path,
        importType: fi.import_type,
        errorMessage: fi.error_message,
        errorCode: fi.error_code,
        metadata: fi.metadata_json ? JSON.parse(fi.metadata_json) : null,
        sourceInfo: fi.source_info,
        listId: fi.list_id,
        listName: fi.list_name,
        retryCount: fi.retry_count,
        maxRetries: fi.max_retries,
        status: fi.status,
        createdByName: fi.created_by_name,
        createdAt: fi.created_at,
        lastRetryAt: fi.last_retry_at,
        recoveredAt: fi.recovered_at,
      })),
    );
  }),
);

/**
 * @swagger
 * /failed-imports/stats:
 *   get:
 *     summary: Get failed imports statistics
 *     tags: [Failed Imports]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Failed imports statistics
 */
router.get(
  '/stats',
  authenticateToken,
  requireRole('admin', 'music_committee'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const stats = db
      .prepare(
        `
        SELECT
            COUNT(*) as total,
            SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
            SUM(CASE WHEN status = 'retrying' THEN 1 ELSE 0 END) as retrying,
            SUM(CASE WHEN status = 'recovered' THEN 1 ELSE 0 END) as recovered,
            SUM(CASE WHEN status = 'dismissed' THEN 1 ELSE 0 END) as dismissed
        FROM failed_imports
        WHERE association_id = ?
    `,
      )
      .get(req.user!.associationId) as any;

    res.json({
      total: stats?.total || 0,
      failed: stats?.failed || 0,
      retrying: stats?.retrying || 0,
      recovered: stats?.recovered || 0,
      dismissed: stats?.dismissed || 0,
    });
  }),
);

/**
 * @swagger
 * /failed-imports/{id}/retry:
 *   post:
 *     summary: Retry a failed import
 *     tags: [Failed Imports]
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
 *         description: Retry initiated
 */
router.post(
  '/:id/retry',
  authenticateToken,
  requireRole('admin', 'music_committee'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    const failedImport = db
      .prepare('SELECT * FROM failed_imports WHERE id = ? AND association_id = ?')
      .get(id, req.user!.associationId) as FailedImport | undefined;

    if (!failedImport) {
      throw new ApiError(404, 'Mislukte import niet gevonden.');
    }

    if (failedImport.status === 'recovered') {
      throw new ApiError(400, 'Deze import is al hersteld.');
    }

    if (failedImport.retry_count >= failedImport.max_retries) {
      throw new ApiError(400, 'Maximum aantal pogingen bereikt.');
    }

    // Check if the file still exists (for file-based imports)
    if (failedImport.file_path) {
      const fullPath = path.join(UPLOAD_DIR, failedImport.file_path);
      if (!fs.existsSync(fullPath)) {
        throw new ApiError(400, 'Oorspronkelijk bestand is niet meer beschikbaar.');
      }
    }

    // Update status to retrying
    db.prepare(
      `
        UPDATE failed_imports
        SET status = 'retrying',
            retry_count = retry_count + 1,
            last_retry_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `,
    ).run(id);

    // Get metadata
    const metadata = failedImport.metadata_json ? JSON.parse(failedImport.metadata_json) : {};

    // Attempt the import based on type
    try {
      let pieceId: string | null = null;

      if (failedImport.import_type === 'pdf' && failedImport.file_path) {
        // Re-process the PDF import
        pieceId = uuidv4();

        db.prepare(
          `
                INSERT INTO music_pieces (id, title, arranger, instrument_id, tuning, group_number, clef,
                                         file_path, original_filename, association_id, uploaded_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
        ).run(
          pieceId,
          metadata.title || failedImport.original_filename.replace(/\.pdf$/i, ''),
          metadata.arranger || null,
          metadata.instrumentId || null,
          metadata.tuning || null,
          metadata.groupNumber || null,
          metadata.clef || null,
          failedImport.file_path,
          failedImport.original_filename,
          req.user!.associationId,
          req.user!.id,
        );

        // De list_id is ooit met de mislukte import meegekomen uit een
        // aanvraag en is sindsdien nooit gecontroleerd. Hem hier alsnog toetsen
        // voorkomt dat een herstelpoging een partij op de lijst van een vreemd
        // orkest zet - en vangt ook een lijst op die intussen verwijderd is.
        if (failedImport.list_id) {
          const lijst = db
            .prepare(
              `SELECT ml.id FROM music_lists ml
               JOIN orchestras o ON o.id = ml.orchestra_id
               WHERE ml.id = ? AND o.association_id = ? AND ml.deleted_at IS NULL`,
            )
            .get(failedImport.list_id, req.user!.associationId);

          if (lijst) {
            db.prepare('INSERT OR IGNORE INTO music_list_pieces (music_list_id, music_piece_id) VALUES (?, ?)').run(
              failedImport.list_id,
              pieceId,
            );
          } else {
            logger.warn('Herstelde import niet op de lijst gezet: lijst hoort niet bij deze vereniging', {
              failedImportId: failedImport.id,
              listId: failedImport.list_id,
            });
          }
        }
      }

      // Mark as recovered
      db.prepare(
        `
            UPDATE failed_imports
            SET status = 'recovered',
                recovered_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `,
      ).run(id);

      const sanitizedIdForLog = id.replace(/[\r\n]/g, '');
      logger.info(`Failed import recovered: ${sanitizedIdForLog}`, {
        recoveredBy: req.user!.id,
        pieceId,
      });

      res.json({
        message: 'Import succesvol hersteld.',
        pieceId,
      });
    } catch (error) {
      // Update error message with new error
      db.prepare(
        `
            UPDATE failed_imports
            SET status = 'failed',
                error_message = ?
            WHERE id = ?
        `,
      ).run((error as Error).message, id);

      throw new ApiError(500, `Herstel mislukt: ${(error as Error).message}`);
    }
  }),
);

/**
 * @swagger
 * /failed-imports/{id}/dismiss:
 *   post:
 *     summary: Dismiss a failed import (mark as not needed)
 *     tags: [Failed Imports]
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
 *         description: Import dismissed
 */
router.post(
  '/:id/dismiss',
  authenticateToken,
  requireRole('admin', 'music_committee'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    const result = db
      .prepare(
        `
        UPDATE failed_imports
        SET status = 'dismissed'
        WHERE id = ? AND association_id = ?
    `,
      )
      .run(id, req.user!.associationId);

    if (result.changes === 0) {
      throw new ApiError(404, 'Mislukte import niet gevonden.');
    }

    res.json({ message: 'Import genegeerd.' });
  }),
);

/**
 * @swagger
 * /failed-imports/{id}:
 *   delete:
 *     summary: Delete a failed import record (and associated temp file)
 *     tags: [Failed Imports]
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
 *         description: Failed import deleted
 */
router.delete(
  '/:id',
  authenticateToken,
  requireRole('admin', 'music_committee'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    const failedImport = db
      .prepare('SELECT * FROM failed_imports WHERE id = ? AND association_id = ?')
      .get(id, req.user!.associationId) as FailedImport | undefined;

    if (!failedImport) {
      throw new ApiError(404, 'Mislukte import niet gevonden.');
    }

    // Delete associated temp file if exists and not recovered
    if (failedImport.file_path && failedImport.status !== 'recovered') {
      const fullPath = path.join(UPLOAD_DIR, failedImport.file_path);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    }

    db.prepare('DELETE FROM failed_imports WHERE id = ?').run(id);

    res.json({ message: 'Mislukte import verwijderd.' });
  }),
);

/**
 * @swagger
 * /failed-imports/bulk-dismiss:
 *   post:
 *     summary: Dismiss multiple failed imports
 *     tags: [Failed Imports]
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
 *         description: Imports dismissed
 */
router.post(
  '/bulk-dismiss',
  authenticateToken,
  requireRole('admin', 'music_committee'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      throw new ApiError(400, 'Geen imports geselecteerd.');
    }

    const placeholders = ids.map(() => '?').join(', ');
    const result = db
      .prepare(
        `
        UPDATE failed_imports
        SET status = 'dismissed'
        WHERE id IN (${placeholders}) AND association_id = ?
    `,
      )
      .run(...ids, req.user!.associationId);

    res.json({
      message: `${result.changes} imports genegeerd.`,
      dismissed: result.changes,
    });
  }),
);

/**
 * Helper function to record a failed import (called from other routes)
 */
export function recordFailedImport(
  associationId: string,
  originalFilename: string,
  errorMessage: string,
  options: {
    filePath?: string;
    importType?: string;
    errorCode?: string;
    metadata?: Record<string, any>;
    sourceInfo?: string;
    listId?: string;
    createdBy?: string;
  } = {},
): string {
  const id = uuidv4();

  db.prepare(
    `
        INSERT INTO failed_imports (
            id, association_id, original_filename, file_path, import_type,
            error_message, error_code, metadata_json, source_info,
            list_id, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    id,
    associationId,
    originalFilename,
    options.filePath || null,
    options.importType || 'pdf',
    errorMessage,
    options.errorCode || null,
    options.metadata ? JSON.stringify(options.metadata) : null,
    options.sourceInfo || null,
    options.listId || null,
    options.createdBy || null,
  );

  logger.warn(`Failed import recorded: ${originalFilename}`, {
    id,
    errorMessage,
    importType: options.importType,
  });

  return id;
}

export default router;
