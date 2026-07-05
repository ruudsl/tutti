import { Router, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { withTransaction } from '../utils/database';
import { isPdf } from '../utils/fileValidation';
import logger from '../utils/logger';
import { logAuditEvent } from './audit-logs';
import { notifyOrchestra } from './notifications';

const router = Router();

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

interface CloudFile {
  id: string;
  name: string;
  downloadUrl?: string;
}

interface ImportResult {
  id: string;
  filename: string;
  title: string;
  instrumentId: string | null;
  instrumentFound: boolean;
}

interface ImportError {
  filename: string;
  error: string;
}

function parseFilename(filename: string): {
  title: string;
  arranger: string | null;
  instrument: string | null;
  tuning: string | null;
  groupNumber: string | null;
  clef: string | null;
} {
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

function findInstrumentId(instrumentName: string): string | null {
  if (!instrumentName) return null;
  const searchName = instrumentName.toLowerCase().trim();

  const instrument = db
    .prepare(
      `
        SELECT id FROM instruments WHERE LOWER(name) = ?
    `,
    )
    .get(searchName) as { id: string } | undefined;
  if (instrument) return instrument.id;

  const alias = db
    .prepare(
      `
        SELECT instrument_id FROM instrument_aliases WHERE LOWER(alias) = ?
    `,
    )
    .get(searchName) as { instrument_id: string } | undefined;
  return alias ? alias.instrument_id : null;
}

async function downloadAndSave(
  url: string,
  accessToken: string | null,
  originalName: string,
): Promise<{ filename: string; filePath: string }> {
  const headers: Record<string, string> = {};
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }

  const contentLength = response.headers.get('content-length');
  if (contentLength && parseInt(contentLength, 10) > MAX_FILE_SIZE) {
    throw new Error(`File exceeds maximum size of ${MAX_FILE_SIZE / 1024 / 1024}MB`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error(`File exceeds maximum size of ${MAX_FILE_SIZE / 1024 / 1024}MB`);
  }

  if (!isPdf(buffer)) {
    throw new Error('File is not a valid PDF');
  }

  const ext = path.extname(originalName) || '.pdf';
  const filename = `${Date.now()}-${uuidv4()}${ext}`;
  const filePath = path.join(UPLOAD_DIR, filename);
  await fs.promises.writeFile(filePath, buffer);

  return { filename, filePath };
}

async function importFiles(
  user: AuthRequest['user'],
  files: { downloadUrl: string; name: string; accessToken?: string | null }[],
  listId: string | undefined,
  source: string,
  req: AuthRequest,
): Promise<{ uploaded: ImportResult[]; errors: ImportError[] }> {
  if (!user) throw new ApiError(401, 'Unauthorized');

  const uploaded: ImportResult[] = [];
  const errors: ImportError[] = [];
  const savedFiles: { filename: string; filePath: string; originalName: string }[] = [];

  for (const file of files) {
    try {
      const saved = await downloadAndSave(file.downloadUrl, file.accessToken || null, file.name);
      savedFiles.push({ ...saved, originalName: file.name });
    } catch (err) {
      errors.push({
        filename: file.name,
        error: (err as Error).message,
      });
    }
  }

  if (savedFiles.length > 0) {
    withTransaction(() => {
      for (const saved of savedFiles) {
        try {
          const parsed = parseFilename(saved.originalName);
          const instrumentId = parsed.instrument ? findInstrumentId(parsed.instrument) : null;
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
            saved.filename,
            saved.originalName,
            user.associationId,
            user.id,
          );

          if (listId) {
            db.prepare('INSERT OR IGNORE INTO music_list_pieces (music_list_id, music_piece_id) VALUES (?, ?)').run(
              listId,
              pieceId,
            );
          }

          uploaded.push({
            id: pieceId,
            filename: saved.originalName,
            title: parsed.title,
            instrumentId,
            instrumentFound: !!instrumentId,
          });
        } catch (err) {
          errors.push({
            filename: saved.originalName,
            error: (err as Error).message,
          });
          fs.promises.unlink(saved.filePath).catch(() => {});
        }
      }
    });
  }

  logger.info(`Cloud import (${source}): ${uploaded.length} success, ${errors.length} errors`, {
    userId: user.id,
    source,
  });

  if (uploaded.length > 0) {
    logAuditEvent(
      user.id,
      'import',
      'music_piece',
      uploaded[0].id,
      `${uploaded.length} muziekstukken via ${source}`,
      {
        count: uploaded.length,
        source,
        titles: uploaded.slice(0, 5).map((r) => r.title),
        listId: listId || null,
      },
      req.ip,
      req.get('user-agent'),
    );

    const notifTitle =
      uploaded.length === 1
        ? `Nieuw muziekstuk: ${uploaded[0].title}`
        : `${uploaded.length} nieuwe muziekstukken toegevoegd`;
    const notifBody =
      uploaded.length === 1
        ? `${uploaded[0].title} is beschikbaar gesteld.`
        : `Er zijn ${uploaded.length} nieuwe muziekstukken beschikbaar gesteld.`;
    const notifData = { count: uploaded.length, listId: listId || null };

    if (listId) {
      const musicList = db.prepare('SELECT orchestra_id FROM music_lists WHERE id = ?').get(listId) as
        | { orchestra_id: string }
        | undefined;
      if (musicList?.orchestra_id) {
        notifyOrchestra(musicList.orchestra_id, 'new_music', notifTitle, notifBody, notifData, user.id).catch(
          (err: Error) => logger.error('Failed to send new_music notification', { error: err.message }),
        );
      }
    } else {
      const orchestras = db.prepare('SELECT id FROM orchestras WHERE association_id = ?').all(user.associationId) as {
        id: string;
      }[];
      for (const orch of orchestras) {
        notifyOrchestra(orch.id, 'new_music', notifTitle, notifBody, notifData, user.id).catch((err: Error) =>
          logger.error('Failed to send new_music notification', { error: err.message }),
        );
      }
    }
  }

  return { uploaded, errors };
}

/**
 * @swagger
 * /cloud-import/onedrive:
 *   post:
 *     summary: Import music pieces from OneDrive / SharePoint
 *     tags: [Cloud Import]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  '/onedrive',
  authenticateToken,
  requireRole('admin', 'music_committee'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { files, accessToken, listId } = req.body as {
      files: CloudFile[];
      accessToken: string;
      listId?: string;
    };

    if (!Array.isArray(files) || files.length === 0) {
      throw new ApiError(400, 'No files specified');
    }
    if (!accessToken) {
      throw new ApiError(400, 'Microsoft Graph access token is required');
    }

    const downloadFiles = files.map((f) => ({
      downloadUrl:
        f.downloadUrl || `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(f.id)}/content`,
      name: f.name,
      accessToken: f.downloadUrl ? null : accessToken,
    }));

    const result = await importFiles(req.user, downloadFiles, listId, 'OneDrive', req);

    res.status(201).json({
      message: `${result.uploaded.length} bestanden geïmporteerd vanuit OneDrive.`,
      uploaded: result.uploaded,
      errors: result.errors.length > 0 ? result.errors : undefined,
    });
  }),
);

/**
 * @swagger
 * /cloud-import/google-drive:
 *   post:
 *     summary: Import music pieces from Google Drive
 *     tags: [Cloud Import]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  '/google-drive',
  authenticateToken,
  requireRole('admin', 'music_committee'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { files, accessToken, listId } = req.body as {
      files: CloudFile[];
      accessToken: string;
      listId?: string;
    };

    if (!Array.isArray(files) || files.length === 0) {
      throw new ApiError(400, 'No files specified');
    }
    if (!accessToken) {
      throw new ApiError(400, 'Google access token is required');
    }

    const downloadFiles = files.map((f) => ({
      downloadUrl: `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(f.id)}?alt=media`,
      name: f.name,
      accessToken,
    }));

    const result = await importFiles(req.user, downloadFiles, listId, 'Google Drive', req);

    res.status(201).json({
      message: `${result.uploaded.length} bestanden geïmporteerd vanuit Google Drive.`,
      uploaded: result.uploaded,
      errors: result.errors.length > 0 ? result.errors : undefined,
    });
  }),
);

/**
 * @swagger
 * /cloud-import/config:
 *   get:
 *     summary: Get client config for cloud picker SDKs
 *     tags: [Cloud Import]
 *     security:
 *       - bearerAuth: []
 */
router.get(
  '/config',
  authenticateToken,
  asyncHandler(async (_req: AuthRequest, res: Response) => {
    const association = db
      .prepare(
        `
        SELECT microsoft_client_id, microsoft_tenant_id, microsoft_enabled,
               google_drive_client_id, google_drive_api_key, google_drive_enabled
        FROM associations LIMIT 1
    `,
      )
      .get() as
      | {
          microsoft_client_id: string | null;
          microsoft_tenant_id: string | null;
          microsoft_enabled: number | null;
          google_drive_client_id: string | null;
          google_drive_api_key: string | null;
          google_drive_enabled: number | null;
        }
      | undefined;

    res.json({
      onedrive: {
        enabled: !!(association?.microsoft_enabled && association?.microsoft_client_id),
        clientId: association?.microsoft_client_id || null,
        tenantId: association?.microsoft_tenant_id || 'common',
      },
      googleDrive: {
        enabled: !!(
          association?.google_drive_enabled &&
          association?.google_drive_client_id &&
          association?.google_drive_api_key
        ),
        clientId: association?.google_drive_client_id || null,
        apiKey: association?.google_drive_api_key || null,
      },
    });
  }),
);

export default router;
