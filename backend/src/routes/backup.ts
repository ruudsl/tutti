import { Router, Response } from 'express';
import path from 'path';
import fs from 'fs';
import archiver from 'archiver';
import multer from 'multer';
import AdmZip from 'adm-zip';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { ipWhitelistMiddleware } from '../middleware/ipWhitelist';
import { FileValidationError } from '../utils/errors';
import { isSqlite } from '../utils/fileValidation';
import logger from '../utils/logger';
import config from '../config';
import db from '../database/connection';
import { logAuditEvent } from './audit-logs';
import { getBackupDir } from '../scheduler/backup';

const router = Router();

// Get paths from config/environment
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads');
const MP3_UPLOAD_DIR = process.env.MP3_UPLOAD_DIR || path.join(__dirname, '../../uploads/mp3');
const DB_PATH = config.dbPath;

/**
 * @swagger
 * /backup:
 *   get:
 *     summary: Download a complete backup (database + uploads)
 *     tags: [Backup]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: ZIP file containing backup
 *         content:
 *           application/zip:
 *             schema:
 *               type: string
 *               format: binary
 */
router.get(
  '/',
  authenticateToken,
  requireRole('admin'),
  ipWhitelistMiddleware,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `harmonie-backup-${timestamp}.zip`;

    logger.info(`Backup requested by user ${req.user!.id}`);

    // Set response headers
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Create archive
    const archive = archiver('zip', {
      zlib: { level: 9 }, // Maximum compression
    });

    // Handle archive errors
    archive.on('error', (err) => {
      logger.error('Backup archive error', { error: err });
      throw new ApiError(500, 'Fout bij maken van backup.');
    });

    // Pipe to response
    archive.pipe(res);

    // Flush pending in-memory changes so the on-disk database file is up-to-date
    db.flush();

    // Add database file
    if (fs.existsSync(DB_PATH)) {
      archive.file(DB_PATH, { name: 'database/harmonie.db' });
      logger.info('Added database to backup');
    }

    // Get file mappings from database for original filenames
    const pdfMappings = db
      .prepare(
        `
        SELECT file_path, original_filename FROM music_pieces WHERE file_path IS NOT NULL
    `,
      )
      .all() as { file_path: string; original_filename: string }[];

    const mp3Mappings = db
      .prepare(
        `
        SELECT mp3_file_path as file_path, title as original_filename FROM music_titles
        WHERE mp3_file_path IS NOT NULL
    `,
      )
      .all() as { file_path: string; original_filename: string }[];

    // Create lookup maps
    const pdfNameMap = new Map<string, string>();
    for (const m of pdfMappings) {
      pdfNameMap.set(m.file_path, m.original_filename);
    }

    const mp3NameMap = new Map<string, string>();
    for (const m of mp3Mappings) {
      mp3NameMap.set(m.file_path, m.original_filename);
    }

    // Track used names to handle duplicates
    const usedPdfNames = new Map<string, number>();
    const usedMp3Names = new Map<string, number>();

    // Create manifest for restore mapping
    const manifest: {
      version: number;
      pdfs: { storedName: string; archiveName: string }[];
      mp3s: { storedName: string; archiveName: string }[];
    } = { version: 1, pdfs: [], mp3s: [] };

    // Add uploaded PDF files with original filenames
    if (fs.existsSync(UPLOAD_DIR)) {
      const pdfFiles = fs.readdirSync(UPLOAD_DIR).filter((f) => f.endsWith('.pdf'));
      for (const file of pdfFiles) {
        let archiveName = pdfNameMap.get(file) || file;

        // Handle duplicate names by adding suffix
        const baseName = archiveName.replace(/\.pdf$/i, '');
        const count = usedPdfNames.get(archiveName) || 0;
        if (count > 0) {
          archiveName = `${baseName} (${count}).pdf`;
        }
        usedPdfNames.set(pdfNameMap.get(file) || file, count + 1);

        archive.file(path.join(UPLOAD_DIR, file), { name: `uploads/${archiveName}` });
        manifest.pdfs.push({ storedName: file, archiveName });
      }
      logger.info(`Added ${pdfFiles.length} PDF files to backup`);
    }

    // Add uploaded MP3 files with original filenames
    if (fs.existsSync(MP3_UPLOAD_DIR)) {
      const mp3Files = fs.readdirSync(MP3_UPLOAD_DIR).filter((f) => f.endsWith('.mp3'));
      for (const file of mp3Files) {
        const originalName = mp3NameMap.get(file);
        let archiveName = originalName ? `${originalName}.mp3` : file;

        // Handle duplicate names by adding suffix
        const baseName = archiveName.replace(/\.mp3$/i, '');
        const count = usedMp3Names.get(archiveName) || 0;
        if (count > 0) {
          archiveName = `${baseName} (${count}).mp3`;
        }
        usedMp3Names.set(originalName ? `${originalName}.mp3` : file, count + 1);

        archive.file(path.join(MP3_UPLOAD_DIR, file), { name: `uploads/mp3/${archiveName}` });
        manifest.mp3s.push({ storedName: file, archiveName });
      }
      logger.info(`Added ${mp3Files.length} MP3 files to backup`);
    }

    // Add manifest file for restore mapping
    archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });

    // Finalize archive
    await archive.finalize();

    // Audit log the backup download
    logAuditEvent(
      req.user!.id,
      'download',
      'backup',
      filename,
      'Backup download',
      {
        pdfFiles: manifest.pdfs.length,
        mp3Files: manifest.mp3s.length,
      },
      req.ip,
      req.get('user-agent'),
    );

    logger.info(`Backup completed: ${filename}`);
  }),
);

/**
 * @swagger
 * /backup/info:
 *   get:
 *     summary: Get backup info (sizes, counts)
 *     tags: [Backup]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Backup information
 */
router.get(
  '/info',
  authenticateToken,
  requireRole('admin'),
  ipWhitelistMiddleware,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    let dbSize = 0;
    let pdfCount = 0;
    let pdfSize = 0;
    let mp3Count = 0;
    let mp3Size = 0;

    // Database size
    if (fs.existsSync(DB_PATH)) {
      const stats = fs.statSync(DB_PATH);
      dbSize = stats.size;
    }

    // PDF files
    if (fs.existsSync(UPLOAD_DIR)) {
      const pdfFiles = fs.readdirSync(UPLOAD_DIR).filter((f) => f.endsWith('.pdf'));
      pdfCount = pdfFiles.length;
      for (const file of pdfFiles) {
        const stats = fs.statSync(path.join(UPLOAD_DIR, file));
        pdfSize += stats.size;
      }
    }

    // MP3 files
    if (fs.existsSync(MP3_UPLOAD_DIR)) {
      const mp3Files = fs.readdirSync(MP3_UPLOAD_DIR).filter((f) => f.endsWith('.mp3'));
      mp3Count = mp3Files.length;
      for (const file of mp3Files) {
        const stats = fs.statSync(path.join(MP3_UPLOAD_DIR, file));
        mp3Size += stats.size;
      }
    }

    res.json({
      database: {
        size: dbSize,
        sizeFormatted: formatBytes(dbSize),
      },
      pdfFiles: {
        count: pdfCount,
        size: pdfSize,
        sizeFormatted: formatBytes(pdfSize),
      },
      mp3Files: {
        count: mp3Count,
        size: mp3Size,
        sizeFormatted: formatBytes(mp3Size),
      },
      total: {
        size: dbSize + pdfSize + mp3Size,
        sizeFormatted: formatBytes(dbSize + pdfSize + mp3Size),
      },
    });
  }),
);

// Configure multer for backup ZIP upload
const backupUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/zip' || file.originalname.toLowerCase().endsWith('.zip')) {
      cb(null, true);
    } else {
      cb(new Error('Alleen ZIP bestanden zijn toegestaan.'));
    }
  },
});

/**
 * @swagger
 * /backup/restore:
 *   post:
 *     summary: Restore a backup from a ZIP file
 *     tags: [Backup]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               backup:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Backup restored successfully
 *       400:
 *         description: Invalid backup file
 */
router.post(
  '/restore',
  authenticateToken,
  requireRole('admin'),
  ipWhitelistMiddleware,
  backupUpload.single('backup'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.file) {
      throw new ApiError(400, 'Geen backup bestand ontvangen.');
    }

    logger.info(`Backup restore requested by user ${req.user!.id}`);

    try {
      const zip = new AdmZip(req.file.buffer);
      const entries = zip.getEntries();

      // Magic-byte check: if the backup contains a database, it must be a
      // real SQLite file ("SQLite format 3\0") before we overwrite anything
      const dbEntryCheck = zip.getEntry('database/harmonie.db');
      if (dbEntryCheck && !isSqlite(dbEntryCheck.getData().subarray(0, 16))) {
        throw new FileValidationError('Backup bevat geen geldig SQLite databasebestand.');
      }

      let restoredDb = false;
      let restoredPdfs = 0;
      let restoredMp3s = 0;
      let preRestoreSnapshot: string | null = null;

      // Flush pending in-memory changes so the pre-restore snapshot is up-to-date
      db.flush();

      // Create a pre-restore snapshot of the current database so the restore can be undone
      if (fs.existsSync(DB_PATH)) {
        const preRestoreDir = path.join(getBackupDir(), 'pre-restore');
        if (!fs.existsSync(preRestoreDir)) {
          fs.mkdirSync(preRestoreDir, { recursive: true });
        }
        const snapshotTimestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        preRestoreSnapshot = path.join(preRestoreDir, `pre-restore-${snapshotTimestamp}.sqlite`);
        fs.copyFileSync(DB_PATH, preRestoreSnapshot);
        logger.info(`Created pre-restore snapshot: ${preRestoreSnapshot}`);
      }

      // Ensure directories exist
      if (!fs.existsSync(UPLOAD_DIR)) {
        fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      }
      if (!fs.existsSync(MP3_UPLOAD_DIR)) {
        fs.mkdirSync(MP3_UPLOAD_DIR, { recursive: true });
      }

      // Try to read manifest for file mapping (new backup format)
      type ManifestType = {
        version: number;
        pdfs: { storedName: string; archiveName: string }[];
        mp3s: { storedName: string; archiveName: string }[];
      };
      let manifest: ManifestType | null = null;
      const manifestEntry = zip.getEntry('manifest.json');
      if (manifestEntry) {
        try {
          manifest = JSON.parse(manifestEntry.getData().toString('utf8'));
          logger.info('Found manifest.json in backup');
        } catch (e) {
          logger.warn('Failed to parse manifest.json, using legacy restore');
        }
      }

      // Create reverse lookup maps from manifest
      const pdfArchiveToStored = new Map<string, string>();
      const mp3ArchiveToStored = new Map<string, string>();
      if (manifest) {
        for (const m of manifest.pdfs) {
          pdfArchiveToStored.set(m.archiveName, m.storedName);
        }
        for (const m of manifest.mp3s) {
          mp3ArchiveToStored.set(m.archiveName, m.storedName);
        }
      }

      for (const entry of entries) {
        if (entry.isDirectory) continue;

        const entryName = entry.entryName;

        // Prevent path traversal
        const normalized = path.normalize(entryName);
        if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
          logger.warn(`Skipping suspicious path in backup: ${entryName}`);
          continue;
        }

        if (entryName === 'database/harmonie.db') {
          // Restore database
          const dbDir = path.dirname(DB_PATH);
          if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
          }
          fs.writeFileSync(DB_PATH, entry.getData());
          restoredDb = true;
          logger.info('Restored database from backup');
        } else if (entryName === 'manifest.json') {
          // Skip manifest file, already processed
          continue;
        } else if (entryName.startsWith('uploads/mp3/') && entryName.endsWith('.mp3')) {
          // Restore MP3 file
          const archiveName = path.basename(entryName);
          // Use manifest mapping if available, otherwise use archive filename (legacy format)
          const storedName = mp3ArchiveToStored.get(archiveName) || archiveName;
          fs.writeFileSync(path.join(MP3_UPLOAD_DIR, storedName), entry.getData());
          restoredMp3s++;
        } else if (entryName.startsWith('uploads/') && entryName.endsWith('.pdf')) {
          // Restore PDF file
          const archiveName = path.basename(entryName);
          // Use manifest mapping if available, otherwise use archive filename (legacy format)
          const storedName = pdfArchiveToStored.get(archiveName) || archiveName;
          fs.writeFileSync(path.join(UPLOAD_DIR, storedName), entry.getData());
          restoredPdfs++;
        }
      }

      // Reload the in-memory database from the restored file, otherwise the running
      // sql.js instance keeps its old copy and the next save() would overwrite
      // the restored database again.
      if (restoredDb) {
        await db.reload();
        logger.info('In-memory database reloaded from restored file');
      }

      logger.info(`Backup restore completed: db=${restoredDb}, pdfs=${restoredPdfs}, mp3s=${restoredMp3s}`);

      // Audit log the restore (written to the restored database)
      logAuditEvent(
        req.user!.id,
        'restore',
        'backup',
        req.file.originalname || 'backup.zip',
        'Backup restore',
        {
          database: restoredDb,
          pdfFiles: restoredPdfs,
          mp3Files: restoredMp3s,
          preRestoreSnapshot,
        },
        req.ip,
        req.get('user-agent'),
      );

      res.json({
        success: true,
        restored: {
          database: restoredDb,
          pdfFiles: restoredPdfs,
          mp3Files: restoredMp3s,
        },
      });
    } catch (error: any) {
      logger.error('Backup restore failed', { error: error.message });
      if (error instanceof FileValidationError) {
        throw error; // mapped to 400 by the central error handler
      }
      throw new ApiError(500, 'Fout bij herstellen van backup.');
    }
  }),
);

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default router;
