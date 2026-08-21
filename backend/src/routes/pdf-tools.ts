import { Router, Request, Response } from 'express';
import { PDFDocument, degrees } from 'pdf-lib';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import archiver from 'archiver';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { FileValidationError } from '../utils/errors';
import db from '../database/connection';
import logger from '../utils/logger';

const router = Router();

// Configure directories
const TEMP_DIR = process.env.TEMP_DIR || path.join(__dirname, '../../temp');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads');

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

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

// Configure multer for PDF uploads

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

/**
 * Tijdelijke bestanden horen bij degene die ze heeft gemaakt.
 *
 * De gereedschappen hier - splitsen, samenvoegen, draaien - schrijven hun
 * resultaat naar TEMP_DIR en geven de bestandsnaam terug. Die map is gedeeld
 * door alle verenigingen, en de drie routes die er weer uit lezen namen een
 * naam aan zonder te kijken van wie het bestand was. Elk ingelogd lid kon zo
 * elk resultaat ophalen, en /save-as-music-piece maakte het scherper: daarmee
 * kon een muziekcommissielid het resultaat van een andere vereniging als eigen
 * partij in de bibliotheek opnemen.
 *
 * De naam draagt de eigenaar nu mee. Dat scheelt een tabel voor bestanden die
 * na een uur worden opgeruimd, en het overleeft een herstart - een register in
 * het geheugen zou dat niet doen.
 *
 * Bestanden van voor deze wijziging dragen geen eigenaar en zijn daarmee niet
 * meer op te halen. Dat is bewust: het zijn tijdelijke bestanden met een
 * opruimroute, en de veilige kant is hier de juiste.
 */
function tijdelijkeNaamVoor(userId: string, basisnaam: string): string {
  return `${userId}_${uuidv4()}_${basisnaam}`;
}

/**
 * Het pad naar een tijdelijk bestand van deze gebruiker, of null.
 *
 * Eén antwoord voor "bestaat niet" en "niet van jou": het verschil tussen die
 * twee vertelt of een naam raak was.
 */
function eigenTijdelijkBestand(req: AuthRequest, opgegevenNaam: string): string | null {
  const veiligeNaam = path.basename(opgegevenNaam);
  if (!veiligeNaam.startsWith(`${req.user!.id}_`)) return null;

  const pad = path.resolve(TEMP_DIR, veiligeNaam);
  if (!pad.startsWith(path.resolve(TEMP_DIR) + path.sep)) return null;

  return fs.existsSync(pad) ? pad : null;
}

/** De oorspronkelijke naam, zonder de eigenaar en het volgnummer ervoor. */
function oorspronkelijkeNaam(tijdelijkeNaam: string): string {
  const delen = tijdelijkeNaam.split('_');
  return delen.length > 2 ? delen.slice(2).join('_') : tijdelijkeNaam;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new FileValidationError());
    }
  },
});

/**
 * @swagger
 * /pdf-tools/info:
 *   post:
 *     summary: Get PDF information (page count, sizes)
 *     tags: [PDF Tools]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               pdf:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: PDF information
 */
router.post(
  '/info',
  authenticateToken,
  requireRole('music_committee', 'admin'),
  upload.single('pdf'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.file) {
      return res.status(400).json({ error: 'Geen PDF bestand ontvangen' });
    }

    const pdfDoc = await PDFDocument.load(req.file.buffer);
    const pages = pdfDoc.getPages();

    const pageInfo = pages.map((page, index) => {
      const { width, height } = page.getSize();
      // Convert points to mm (1 point = 0.352778 mm)
      const widthMm = Math.round(width * 0.352778);
      const heightMm = Math.round(height * 0.352778);

      // Detect paper size
      let paperSize = 'Onbekend';
      if (Math.abs(widthMm - 210) < 5 && Math.abs(heightMm - 297) < 5) {
        paperSize = 'A4 Portrait';
      } else if (Math.abs(widthMm - 297) < 5 && Math.abs(heightMm - 210) < 5) {
        paperSize = 'A4 Landscape';
      } else if (Math.abs(widthMm - 297) < 5 && Math.abs(heightMm - 420) < 5) {
        paperSize = 'A3 Portrait';
      } else if (Math.abs(widthMm - 420) < 5 && Math.abs(heightMm - 297) < 5) {
        paperSize = 'A3 Landscape';
      }

      return {
        pageNumber: index + 1,
        width: Math.round(width),
        height: Math.round(height),
        widthMm,
        heightMm,
        paperSize,
        isLandscape: width > height,
      };
    });

    res.json({
      pageCount: pages.length,
      pages: pageInfo,
      filename: req.file.originalname,
    });
  }),
);

// Split PDF into multiple files based on ranges
router.post(
  '/split',
  authenticateToken,
  requireRole('music_committee', 'admin'),
  upload.single('pdf'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.file) {
      return res.status(400).json({ error: 'Geen PDF bestand ontvangen' });
    }

    const { ranges } = req.body;
    if (!ranges || !Array.isArray(JSON.parse(ranges))) {
      return res.status(400).json({ error: 'Geen pagina bereiken opgegeven' });
    }

    const parsedRanges = JSON.parse(ranges) as { start: number; end: number; name: string }[];
    const sourcePdf = await PDFDocument.load(req.file.buffer);
    const sourcePages = sourcePdf.getPages();

    const results = [];

    for (const range of parsedRanges) {
      const newPdf = await PDFDocument.create();

      // Validate range
      const startIdx = range.start - 1;
      const endIdx = range.end - 1;

      if (startIdx < 0 || endIdx >= sourcePages.length || startIdx > endIdx) {
        results.push({
          name: range.name,
          error: `Ongeldige pagina bereik: ${range.start}-${range.end}`,
        });
        continue;
      }

      // Copy pages
      const pageIndices = [];
      for (let i = startIdx; i <= endIdx; i++) {
        pageIndices.push(i);
      }

      const copiedPages = await newPdf.copyPages(sourcePdf, pageIndices);
      copiedPages.forEach((page) => newPdf.addPage(page));

      // Save to temp file
      const pdfBytes = await newPdf.save();
      const filename = `${range.name.replace(/[^a-zA-Z0-9_ ()-]/g, '')}.pdf`;
      const filepath = path.join(TEMP_DIR, tijdelijkeNaamVoor(req.user!.id, filename));

      fs.writeFileSync(filepath, pdfBytes);

      results.push({
        name: range.name,
        filename,
        filepath: path.basename(filepath),
        pageCount: copiedPages.length,
      });
    }

    res.json({ results });
  }),
);

// Split A3 pages into A4 (cut in half)
router.post(
  '/split-a3',
  authenticateToken,
  requireRole('music_committee', 'admin'),
  upload.single('pdf'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.file) {
      return res.status(400).json({ error: 'Geen PDF bestand ontvangen' });
    }

    const sourcePdf = await PDFDocument.load(req.file.buffer);
    const newPdf = await PDFDocument.create();
    const sourcePages = sourcePdf.getPages();

    let splitCount = 0;

    for (let i = 0; i < sourcePages.length; i++) {
      const page = sourcePages[i];
      const { width, height } = page.getSize();

      // Check if this is an A3-ish page (landscape A3 is approximately 420mm x 297mm)
      const widthMm = width * 0.352778;
      const heightMm = height * 0.352778;

      const isA3Landscape = widthMm > 350 && heightMm > 250 && heightMm < 320;
      const isA3Portrait = heightMm > 350 && widthMm > 250 && widthMm < 320;

      if (isA3Landscape) {
        // Split horizontally (left and right halves)
        const halfWidth = width / 2;

        // Left half
        const [leftPage] = await newPdf.copyPages(sourcePdf, [i]);
        leftPage.setCropBox(0, 0, halfWidth, height);
        leftPage.setMediaBox(0, 0, halfWidth, height);
        newPdf.addPage(leftPage);

        // Right half
        const [rightPage] = await newPdf.copyPages(sourcePdf, [i]);
        rightPage.setCropBox(halfWidth, 0, halfWidth, height);
        rightPage.setMediaBox(halfWidth, 0, halfWidth, height);
        // Translate content to align with new media box
        rightPage.translateContent(-halfWidth, 0);
        newPdf.addPage(rightPage);

        splitCount++;
      } else if (isA3Portrait) {
        // Split vertically (top and bottom halves)
        const halfHeight = height / 2;

        // Top half
        const [topPage] = await newPdf.copyPages(sourcePdf, [i]);
        topPage.setCropBox(0, halfHeight, width, halfHeight);
        topPage.setMediaBox(0, halfHeight, width, halfHeight);
        newPdf.addPage(topPage);

        // Bottom half
        const [bottomPage] = await newPdf.copyPages(sourcePdf, [i]);
        bottomPage.setCropBox(0, 0, width, halfHeight);
        bottomPage.setMediaBox(0, 0, width, halfHeight);
        bottomPage.translateContent(0, -halfHeight);
        newPdf.addPage(bottomPage);

        splitCount++;
      } else {
        // Keep page as-is
        const [copiedPage] = await newPdf.copyPages(sourcePdf, [i]);
        newPdf.addPage(copiedPage);
      }
    }

    const pdfBytes = await newPdf.save();
    const filename = `split_${path.basename(req.file.originalname, '.pdf')}.pdf`;
    const filepath = path.join(TEMP_DIR, tijdelijkeNaamVoor(req.user!.id, filename));

    fs.writeFileSync(filepath, pdfBytes);

    res.json({
      success: true,
      originalPageCount: sourcePages.length,
      newPageCount: newPdf.getPageCount(),
      splitCount,
      filepath: path.basename(filepath),
      filename,
    });
  }),
);

// Download processed PDF
router.get('/download/:filename', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const { filename } = req.params;

    const filepath = eigenTijdelijkBestand(req, filename);
    if (!filepath) {
      return res.status(404).json({ error: 'Bestand niet gevonden' });
    }

    const originalFilename = oorspronkelijkeNaam(path.basename(filename));

    res.download(filepath, originalFilename, (err) => {
      if (err && !res.headersSent) {
        res.status(500).json({ error: 'Fout bij downloaden van bestand' });
      }
    });
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({ error: 'Fout bij downloaden van bestand' });
    }
  }
});

// Download multiple split PDFs as a zip file
router.post(
  '/download-zip',
  authenticateToken,
  requireRole('music_committee', 'admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { filepaths } = req.body;

    if (!filepaths || !Array.isArray(filepaths) || filepaths.length === 0) {
      return res.status(400).json({ error: 'Geen bestanden opgegeven' });
    }

    // Validate all files exist
    const validFiles: { tempPath: string; originalName: string }[] = [];
    for (const filepath of filepaths) {
      const fullPath = eigenTijdelijkBestand(req, filepath);
      if (!fullPath) {
        continue;
      }

      validFiles.push({ tempPath: fullPath, originalName: oorspronkelijkeNaam(path.basename(filepath)) });
    }

    if (validFiles.length === 0) {
      return res.status(404).json({ error: 'Geen bestanden gevonden' });
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="split_parts.zip"');

    const archive = archiver('zip', { zlib: { level: 5 } });
    archive.pipe(res);

    for (const file of validFiles) {
      archive.file(file.tempPath, { name: file.originalName });
    }

    await archive.finalize();
  }),
);

// Merge multiple PDFs into one
router.post(
  '/merge',
  authenticateToken,
  requireRole('music_committee', 'admin'),
  upload.array('pdfs', 50),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const uploadedFiles = req.files;
    if (!Array.isArray(uploadedFiles) || uploadedFiles.length < 2) {
      return res.status(400).json({ error: 'Minimaal 2 PDF bestanden vereist' });
    }
    const files = uploadedFiles as Express.Multer.File[];

    const mergedPdf = await PDFDocument.create();

    for (const file of files) {
      const pdf = await PDFDocument.load(file.buffer);
      const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      pages.forEach((page) => mergedPdf.addPage(page));
    }

    const pdfBytes = await mergedPdf.save();
    const filename = `merged_${Date.now()}.pdf`;
    const filepath = path.join(TEMP_DIR, tijdelijkeNaamVoor(req.user!.id, filename));

    fs.writeFileSync(filepath, pdfBytes);

    res.json({
      success: true,
      pageCount: mergedPdf.getPageCount(),
      fileCount: files.length,
      filepath: path.basename(filepath),
      filename,
    });
  }),
);

// Rotate pages in PDF
router.post(
  '/rotate',
  authenticateToken,
  requireRole('music_committee', 'admin'),
  upload.single('pdf'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.file) {
      return res.status(400).json({ error: 'Geen PDF bestand ontvangen' });
    }

    const { rotations } = req.body;
    if (!rotations) {
      return res.status(400).json({ error: 'Geen rotaties opgegeven' });
    }

    const parsedRotations = JSON.parse(rotations) as { pageNumber: number; degrees: number }[];
    const pdfDoc = await PDFDocument.load(req.file.buffer);
    const pages = pdfDoc.getPages();

    for (const rotation of parsedRotations) {
      const pageIdx = rotation.pageNumber - 1;
      if (pageIdx >= 0 && pageIdx < pages.length) {
        const currentRotation = pages[pageIdx].getRotation().angle;
        pages[pageIdx].setRotation(degrees(currentRotation + rotation.degrees));
      }
    }

    const pdfBytes = await pdfDoc.save();
    const safeOriginalName = path.basename(req.file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
    const filename = `rotated_${safeOriginalName || 'document.pdf'}`;
    const tempRoot = path.resolve(TEMP_DIR);
    const filepath = path.resolve(tempRoot, tijdelijkeNaamVoor(req.user!.id, filename));

    if (!filepath.startsWith(tempRoot + path.sep)) {
      return res.status(400).json({ error: 'Ongeldige bestandsnaam' });
    }

    fs.writeFileSync(filepath, pdfBytes);

    res.json({
      success: true,
      filepath: path.basename(filepath),
      filename,
    });
  }),
);

// Save a temp PDF as a music piece
router.post(
  '/save-as-music-piece',
  authenticateToken,
  requireRole('music_committee', 'admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { filepath, filename, listId, title, arranger, instrumentId, tuning, groupNumber, clef } = req.body;

    if (!filepath || !filename) {
      return res.status(400).json({ error: 'Filepath en filename zijn verplicht' });
    }

    const tempFilePath = eigenTijdelijkBestand(req, filepath);
    if (!tempFilePath) {
      return res.status(404).json({ error: 'Bestand niet gevonden in temp directory' });
    }

    // Use explicit metadata if provided, otherwise fall back to filename parsing
    let pieceTitle: string;
    let pieceArranger: string | null;
    let pieceInstrumentId: string | null;
    let pieceTuning: string | null;
    let pieceGroupNumber: string | null;
    let pieceClef: string | null;

    if (title) {
      pieceTitle = title;
      pieceArranger = arranger || null;
      pieceInstrumentId = instrumentId || null;
      pieceTuning = tuning || null;
      pieceGroupNumber = groupNumber || null;
      pieceClef = clef || null;
    } else {
      const parsed = parseFilename(filename);
      pieceTitle = parsed.title;
      pieceArranger = parsed.arranger;
      pieceInstrumentId = parsed.instrument ? findInstrumentId(parsed.instrument) : null;
      pieceTuning = parsed.tuning;
      pieceGroupNumber = parsed.groupNumber;
      pieceClef = parsed.clef;
    }

    // Generate new filename for uploads
    const uniqueSuffix = `${Date.now()}-${uuidv4()}`;
    const newFilename = `${uniqueSuffix}.pdf`;
    const uploadFilePath = path.join(UPLOAD_DIR, newFilename);

    // Copy file from temp to uploads (keep temp file for further downloads)
    fs.copyFileSync(tempFilePath, uploadFilePath);

    // Create music piece record
    const pieceId = uuidv4();
    db.prepare(
      `
    INSERT INTO music_pieces (id, title, arranger, instrument_id, tuning, group_number, clef,
                             file_path, original_filename, association_id, uploaded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    ).run(
      pieceId,
      pieceTitle,
      pieceArranger,
      pieceInstrumentId,
      pieceTuning,
      pieceGroupNumber,
      pieceClef,
      newFilename,
      filename.endsWith('.pdf') ? filename : `${filename}.pdf`,
      req.user!.associationId,
      req.user!.id,
    );

    // listId komt uit de aanvraag en is dus net zo goed een verwijzing van de
    // gebruiker als een id in het pad. Zonder deze controle belandde een
    // geuploade partij op de repertoirelijst van een vreemd orkest.
    // cloud-import.ts doet hetzelfde; music-pieces.ts eveneens.
    if (listId) {
      const lijst = db
        .prepare(
          `SELECT ml.id FROM music_lists ml
           JOIN orchestras o ON o.id = ml.orchestra_id
           WHERE ml.id = ? AND o.association_id = ? AND ml.deleted_at IS NULL`,
        )
        .get(listId, req.user!.associationId);
      if (!lijst) {
        throw new ApiError(404, 'Muzieklijst niet gevonden.');
      }
    }

    // Add to list if specified
    if (listId) {
      db.prepare('INSERT OR IGNORE INTO music_list_pieces (music_list_id, music_piece_id) VALUES (?, ?)').run(
        listId,
        pieceId,
      );
    }

    res.json({
      success: true,
      id: pieceId,
      title: pieceTitle,
      instrumentId: pieceInstrumentId,
      instrumentFound: !!pieceInstrumentId,
    });
  }),
);

// Clean up old temp files (called periodically or on startup)
export function cleanupTempFiles() {
  const maxAge = 60 * 60 * 1000; // 1 hour
  const now = Date.now();

  try {
    const files = fs.readdirSync(TEMP_DIR);
    for (const file of files) {
      const filepath = path.join(TEMP_DIR, file);
      const stats = fs.statSync(filepath);
      if (now - stats.mtimeMs > maxAge) {
        fs.unlinkSync(filepath);
      }
    }
  } catch (error) {
    logger.error('Error cleaning up temp files:', error);
  }
}

// Clean up on startup and every hour
cleanupTempFiles();
setInterval(cleanupTempFiles, 60 * 60 * 1000);

export default router;
