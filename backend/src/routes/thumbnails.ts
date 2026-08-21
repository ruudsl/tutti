import { Router, Response } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import db from '../database/connection';
import logger from '../utils/logger';

const router = Router();

/**
 * Mag deze gebruiker dit bestand zien?
 *
 * Deze routes namen een bestandsnaam aan en lazen die uit de uploadmap. Path
 * traversal was afgevangen met path.basename, maar verder werd er niets
 * gecontroleerd: elk ingelogd lid kon zo een voorbeeld opvragen van elke pdf
 * in die map. De map is gedeeld door alle verenigingen.
 *
 * GET /music-pieces/:id/download - dezelfde bestanden, andere ingang - doet
 * twee controles: het stuk moet van de eigen vereniging zijn, en een gewoon
 * lid moet het instrument bespelen. Die twee gelden hier ook. Dat de
 * bestandsnamen uit een tijdstempel en een uuid bestaan en dus lastig te raden
 * zijn, is geen toegangscontrole.
 *
 * Geeft het pad terug, of null als het bestand niet bestaat of niet van deze
 * gebruiker is. Eén antwoord voor beide gevallen: het verschil tussen "bestaat
 * niet" en "niet van jou" vertelt of een bestandsnaam raak was.
 */
function haalToegankelijkPdf(req: AuthRequest, bestandsnaam: string): string | null {
  const veiligeNaam = path.basename(bestandsnaam);

  const partij = db
    .prepare(
      `SELECT instrument_id FROM music_pieces
       WHERE file_path = ? AND association_id = ? AND deleted_at IS NULL`,
    )
    .get(veiligeNaam, req.user!.associationId) as { instrument_id: string | null } | undefined;

  if (!partij) return null;

  if (req.user!.role === 'member' && partij.instrument_id) {
    const speeltMee = db
      .prepare('SELECT 1 FROM user_instruments WHERE user_id = ? AND instrument_id = ?')
      .get(req.user!.id, partij.instrument_id);
    if (!speeltMee) return null;
  }

  const pad = path.join(UPLOAD_DIR, veiligeNaam);
  return fs.existsSync(pad) ? pad : null;
}

// Configure directories
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads');
const THUMBNAIL_DIR = path.join(UPLOAD_DIR, 'thumbnails');

// Supported thumbnail sizes
const THUMBNAIL_SIZES = {
  small: 100,
  medium: 200,
  large: 400,
} as const;

type ThumbnailSize = keyof typeof THUMBNAIL_SIZES;

// Ensure thumbnail directory exists
if (!fs.existsSync(THUMBNAIL_DIR)) {
  fs.mkdirSync(THUMBNAIL_DIR, { recursive: true });
}

/**
 * Generate a cache key for a thumbnail based on file path, page, and size
 */
function getThumbnailCacheKey(filePath: string, page: number, size: ThumbnailSize): string {
  const hash = crypto.createHash('md5').update(`${filePath}:${page}:${size}`).digest('hex');
  return `${hash}.png`;
}

/**
 * Get the full path to a cached thumbnail
 */
function getThumbnailPath(cacheKey: string): string {
  return path.join(THUMBNAIL_DIR, cacheKey);
}

/**
 * Check if a cached thumbnail exists and is newer than the source PDF
 */
function isThumbnailCacheValid(thumbnailPath: string, pdfPath: string): boolean {
  try {
    if (!fs.existsSync(thumbnailPath)) {
      return false;
    }

    const thumbnailStats = fs.statSync(thumbnailPath);
    const pdfStats = fs.statSync(pdfPath);

    // Thumbnail is valid if it's newer than the PDF
    return thumbnailStats.mtimeMs > pdfStats.mtimeMs;
  } catch {
    return false;
  }
}

/**
 * Generate a PDF thumbnail
 * Uses SVG placeholder - canvas-based rendering removed for Docker compatibility
 */
async function generateThumbnail(pdfPath: string, page: number, width: number): Promise<Buffer> {
  // Get page count for placeholder
  const { PDFDocument } = await import('pdf-lib');
  const pdfBuffer = fs.readFileSync(pdfPath);
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pageCount = pdfDoc.getPageCount();

  if (page < 1 || page > pageCount) {
    throw new ApiError(400, `Invalid page number. PDF has ${pageCount} pages.`);
  }

  // Return SVG placeholder
  const height = Math.round(width * 1.414); // A4 aspect ratio
  return generatePlaceholderImage(width, height, page, pageCount);
}

/**
 * Generate a simple placeholder image
 * In production, this would be replaced with actual PDF rendering
 */
function generatePlaceholderImage(width: number, height: number, page: number, totalPages: number): Buffer {
  // Create a simple SVG placeholder
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#f3f4f6"/>
      <rect x="5%" y="5%" width="90%" height="90%" fill="white" stroke="#e5e7eb" stroke-width="1"/>
      <text x="50%" y="45%" text-anchor="middle" fill="#6b7280" font-family="sans-serif" font-size="${Math.max(12, width / 8)}">
        PDF
      </text>
      <text x="50%" y="60%" text-anchor="middle" fill="#9ca3af" font-family="sans-serif" font-size="${Math.max(10, width / 10)}">
        Page ${page}/${totalPages}
      </text>
    </svg>
  `;

  return Buffer.from(svg);
}

/**
 * @swagger
 * /thumbnails/{filename}:
 *   get:
 *     summary: Get a thumbnail for a PDF file
 *     tags: [Thumbnails]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: filename
 *         required: true
 *         schema:
 *           type: string
 *         description: The PDF filename
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number (1-indexed)
 *       - in: query
 *         name: size
 *         schema:
 *           type: string
 *           enum: [small, medium, large]
 *           default: medium
 *         description: Thumbnail size
 *     responses:
 *       200:
 *         description: Thumbnail image
 *         content:
 *           image/jpeg:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: PDF file not found
 */
router.get(
  '/:filename',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { filename } = req.params;
    const page = parseInt(req.query.page as string, 10) || 1;
    const size = (req.query.size as ThumbnailSize) || 'medium';

    // Validate size parameter
    if (!THUMBNAIL_SIZES[size]) {
      throw new ApiError(400, 'Invalid size. Use: small, medium, or large');
    }

    const pdfPath = haalToegankelijkPdf(req, filename);
    if (!pdfPath) {
      throw new ApiError(404, 'PDF file not found');
    }

    // Check cache
    const cacheKey = getThumbnailCacheKey(pdfPath, page, size);
    const thumbnailPath = getThumbnailPath(cacheKey);

    if (isThumbnailCacheValid(thumbnailPath, pdfPath)) {
      // Return cached thumbnail
      res.set('Content-Type', 'image/png');
      res.set('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
      res.set('X-Thumbnail-Cache', 'HIT');
      return res.sendFile(thumbnailPath);
    }

    // Generate new thumbnail
    try {
      const width = THUMBNAIL_SIZES[size];
      const thumbnailBuffer = await generateThumbnail(pdfPath, page, width);

      // Save to cache
      fs.writeFileSync(thumbnailPath, thumbnailBuffer);

      // Return thumbnail
      res.set('Content-Type', 'image/png');
      res.set('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
      res.set('X-Thumbnail-Cache', 'MISS');
      res.send(thumbnailBuffer);
    } catch (error) {
      logger.error('Failed to generate thumbnail:', error);
      throw new ApiError(500, 'Failed to generate thumbnail');
    }
  }),
);

/**
 * @swagger
 * /thumbnails/{filename}/info:
 *   get:
 *     summary: Get PDF information (page count)
 *     tags: [Thumbnails]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: filename
 *         required: true
 *         schema:
 *           type: string
 *         description: The PDF filename
 *     responses:
 *       200:
 *         description: PDF information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 pageCount:
 *                   type: integer
 *                 filename:
 *                   type: string
 *       404:
 *         description: PDF file not found
 */
router.get(
  '/:filename/info',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { filename } = req.params;

    const sanitizedFilename = path.basename(filename);
    const pdfPath = haalToegankelijkPdf(req, filename);
    if (!pdfPath) {
      throw new ApiError(404, 'PDF file not found');
    }

    try {
      const { PDFDocument } = await import('pdf-lib');
      const pdfBuffer = fs.readFileSync(pdfPath);
      const pdfDoc = await PDFDocument.load(pdfBuffer);

      res.json({
        filename: sanitizedFilename,
        pageCount: pdfDoc.getPageCount(),
      });
    } catch (error) {
      logger.error('Failed to read PDF info:', error);
      throw new ApiError(500, 'Failed to read PDF information');
    }
  }),
);

/**
 * @swagger
 * /thumbnails/cleanup:
 *   post:
 *     summary: Clean up orphaned thumbnail cache files
 *     tags: [Thumbnails]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cleanup completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 removed:
 *                   type: integer
 *                 total:
 *                   type: integer
 */
router.post(
  '/cleanup',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    // Only admins can trigger cleanup
    if (req.user?.role !== 'admin') {
      throw new ApiError(403, 'Only admins can trigger thumbnail cleanup');
    }

    let removed = 0;

    try {
      const thumbnailFiles = fs.readdirSync(THUMBNAIL_DIR);
      const total = thumbnailFiles.length;

      // For each thumbnail, check if it's older than 7 days
      const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
      const now = Date.now();

      for (const file of thumbnailFiles) {
        const filePath = path.join(THUMBNAIL_DIR, file);
        const stats = fs.statSync(filePath);

        if (now - stats.mtimeMs > maxAge) {
          fs.unlinkSync(filePath);
          removed++;
        }
      }

      logger.info(`Thumbnail cleanup: removed ${removed}/${total} files`);
      res.json({ removed, total });
    } catch (error) {
      logger.error('Thumbnail cleanup failed:', error);
      throw new ApiError(500, 'Thumbnail cleanup failed');
    }
  }),
);

/**
 * Clean up old thumbnails periodically (called on startup and every 24 hours)
 */
export function cleanupOldThumbnails() {
  const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
  const now = Date.now();

  try {
    if (!fs.existsSync(THUMBNAIL_DIR)) return;

    const files = fs.readdirSync(THUMBNAIL_DIR);
    let cleaned = 0;

    for (const file of files) {
      const filePath = path.join(THUMBNAIL_DIR, file);
      const stats = fs.statSync(filePath);

      if (now - stats.mtimeMs > maxAge) {
        fs.unlinkSync(filePath);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info(`Cleaned up ${cleaned} old thumbnail files`);
    }
  } catch (error) {
    logger.error('Error cleaning up thumbnails:', error);
  }
}

// Run cleanup on startup and every 24 hours
cleanupOldThumbnails();
setInterval(cleanupOldThumbnails, 24 * 60 * 60 * 1000);

export default router;
