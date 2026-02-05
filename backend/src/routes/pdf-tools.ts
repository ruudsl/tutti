import { Router, Request, Response } from 'express';
import { PDFDocument, degrees } from 'pdf-lib';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();

// Configure multer for PDF uploads
const TEMP_DIR = process.env.TEMP_DIR || path.join(__dirname, '../../temp');

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('Alleen PDF bestanden zijn toegestaan'));
    }
  },
});

// Get PDF info (page count, page sizes)
router.post('/info', authenticateToken, requireRole('music_committee', 'admin'), upload.single('pdf'), async (req: Request, res: Response) => {
  try {
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
  } catch (error) {
    console.error('Error getting PDF info:', error);
    res.status(500).json({ error: 'Fout bij lezen van PDF' });
  }
});

// Split PDF into multiple files based on ranges
router.post('/split', authenticateToken, requireRole('music_committee', 'admin'), upload.single('pdf'), async (req: Request, res: Response) => {
  try {
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
      const filename = `${range.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
      const filepath = path.join(TEMP_DIR, `${uuidv4()}_${filename}`);

      fs.writeFileSync(filepath, pdfBytes);

      results.push({
        name: range.name,
        filename,
        filepath: path.basename(filepath),
        pageCount: copiedPages.length,
      });
    }

    res.json({ results });
  } catch (error) {
    console.error('Error splitting PDF:', error);
    res.status(500).json({ error: 'Fout bij splitsen van PDF' });
  }
});

// Split A3 pages into A4 (cut in half)
router.post('/split-a3', authenticateToken, requireRole('music_committee', 'admin'), upload.single('pdf'), async (req: Request, res: Response) => {
  try {
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
    const filepath = path.join(TEMP_DIR, `${uuidv4()}_${filename}`);

    fs.writeFileSync(filepath, pdfBytes);

    res.json({
      success: true,
      originalPageCount: sourcePages.length,
      newPageCount: newPdf.getPageCount(),
      splitCount,
      filepath: path.basename(filepath),
      filename,
    });
  } catch (error) {
    console.error('Error splitting A3 PDF:', error);
    res.status(500).json({ error: 'Fout bij splitsen van A3 naar A4' });
  }
});

// Download processed PDF
router.get('/download/:filename', authenticateToken, (req: Request, res: Response) => {
  const { filename } = req.params;

  // Sanitize filename
  const sanitizedFilename = path.basename(filename);
  const filepath = path.join(TEMP_DIR, sanitizedFilename);

  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ error: 'Bestand niet gevonden' });
  }

  // Extract original filename (after UUID_)
  const originalFilename = sanitizedFilename.includes('_')
    ? sanitizedFilename.substring(sanitizedFilename.indexOf('_') + 1)
    : sanitizedFilename;

  res.download(filepath, originalFilename, (err) => {
    if (err) {
      console.error('Download error:', err);
    }
    // Clean up temp file after download
    fs.unlink(filepath, () => {});
  });
});

// Merge multiple PDFs into one
router.post('/merge', authenticateToken, requireRole('music_committee', 'admin'), upload.array('pdfs', 50), async (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length < 2) {
      return res.status(400).json({ error: 'Minimaal 2 PDF bestanden vereist' });
    }

    const mergedPdf = await PDFDocument.create();

    for (const file of files) {
      const pdf = await PDFDocument.load(file.buffer);
      const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      pages.forEach((page) => mergedPdf.addPage(page));
    }

    const pdfBytes = await mergedPdf.save();
    const filename = `merged_${Date.now()}.pdf`;
    const filepath = path.join(TEMP_DIR, `${uuidv4()}_${filename}`);

    fs.writeFileSync(filepath, pdfBytes);

    res.json({
      success: true,
      pageCount: mergedPdf.getPageCount(),
      fileCount: files.length,
      filepath: path.basename(filepath),
      filename,
    });
  } catch (error) {
    console.error('Error merging PDFs:', error);
    res.status(500).json({ error: 'Fout bij samenvoegen van PDFs' });
  }
});

// Rotate pages in PDF
router.post('/rotate', authenticateToken, requireRole('music_committee', 'admin'), upload.single('pdf'), async (req: Request, res: Response) => {
  try {
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
    const filename = `rotated_${req.file.originalname}`;
    const filepath = path.join(TEMP_DIR, `${uuidv4()}_${filename}`);

    fs.writeFileSync(filepath, pdfBytes);

    res.json({
      success: true,
      filepath: path.basename(filepath),
      filename,
    });
  } catch (error) {
    console.error('Error rotating PDF:', error);
    res.status(500).json({ error: 'Fout bij roteren van PDF' });
  }
});

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
    console.error('Error cleaning up temp files:', error);
  }
}

// Clean up on startup and every hour
cleanupTempFiles();
setInterval(cleanupTempFiles, 60 * 60 * 1000);

export default router;
