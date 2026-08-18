import { Router, Response } from 'express';
import * as cheerio from 'cheerio';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import logger from '../utils/logger';

const router = Router();

const MUSICAINFO_BASE = 'https://en.musicainfo.net';
const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9,nl;q=0.8,de;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br',
  Connection: 'keep-alive',
};

interface SearchResult {
  title: string;
  composer: string;
  arranger: string;
  articleNumber: string;
  detailUrl: string;
  publisher: string;
  duration: string;
  difficulty: string;
}

interface DetailResult {
  title: string;
  composer: string;
  arranger: string;
  publisher: string;
  duration: string;
  durationSeconds: number;
  difficulty: string;
  instrumentation: string;
  articleNumber: string;
}

/**
 * Parse a duration string like "05:30" or "5:30" into seconds
 */
export function parseDurationToSeconds(durationStr: string): number {
  if (!durationStr) return 0;
  // Match patterns like "05:30", "5:30", "1:05:30"
  const match = durationStr.match(/(\d+):(\d{2})(?::(\d{2}))?/);
  if (!match) return 0;
  if (match[3]) {
    // hh:mm:ss
    return parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3]);
  }
  // mm:ss
  return parseInt(match[1]) * 60 + parseInt(match[2]);
}

/**
 * Fetch a page from musicainfo.net with browser-like headers
 */
async function fetchPage(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: BROWSER_HEADERS,
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new ApiError(502, `MusicaInfo returned status ${response.status}`);
  }

  return await response.text();
}

/**
 * GET /musicainfo/search?q=<title> - Search musicainfo.net for sheet music
 */
router.get(
  '/search',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const query = ((req.query.q as string) || '').trim();
    if (!query) {
      throw new ApiError(400, 'Search query is required');
    }

    const searchUrl = `${MUSICAINFO_BASE}/ergebnis.php?kat=2&vol=${encodeURIComponent(query)}`;
    logger.info(`MusicaInfo search: ${searchUrl}`);

    let html: string;
    try {
      html = await fetchPage(searchUrl);
    } catch (err: any) {
      logger.error('MusicaInfo fetch error:', err.message);
      throw new ApiError(502, 'Could not connect to MusicaInfo.net. The site may be blocking automated requests.');
    }

    const $ = cheerio.load(html);
    const results: SearchResult[] = [];

    // Strategy 1: Look for table rows with links to detail.php
    $('a[href*="detail.php"]').each((_, el) => {
      const link = $(el);
      const href = link.attr('href') || '';
      const artnrMatch = href.match(/artnr=(\d+)/);
      if (!artnrMatch) return;

      const articleNumber = artnrMatch[1];
      const row = link.closest('tr');
      const cells = row.find('td');

      if (cells.length >= 2) {
        // Try to extract data from table cells
        const cellTexts = cells.map((_, cell) => $(cell).text().trim()).get();
        results.push({
          title: link.text().trim() || cellTexts[0] || '',
          composer: cellTexts[1] || '',
          arranger: cellTexts[2] || '',
          articleNumber,
          detailUrl: `${MUSICAINFO_BASE}/detail.php?kat=2&artnr=${articleNumber}`,
          publisher: cellTexts[3] || '',
          duration: '',
          difficulty: '',
        });
      } else {
        // Fallback: just use the link text
        results.push({
          title: link.text().trim(),
          composer: '',
          arranger: '',
          articleNumber,
          detailUrl: `${MUSICAINFO_BASE}/detail.php?kat=2&artnr=${articleNumber}`,
          publisher: '',
          duration: '',
          difficulty: '',
        });
      }
    });

    // Deduplicate by article number
    const seen = new Set<string>();
    const uniqueResults = results.filter((r) => {
      if (seen.has(r.articleNumber)) return false;
      seen.add(r.articleNumber);
      return true;
    });

    res.json({
      query,
      resultCount: uniqueResults.length,
      results: uniqueResults.slice(0, 50),
      searchUrl,
    });
  }),
);

/**
 * GET /musicainfo/detail?artnr=<number> - Get detail info from musicainfo.net
 */
router.get(
  '/detail',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const artnr = ((req.query.artnr as string) || '').trim();
    if (!artnr) {
      throw new ApiError(400, 'Article number (artnr) is required');
    }

    const detailUrl = `${MUSICAINFO_BASE}/detail.php?kat=2&artnr=${encodeURIComponent(artnr)}`;
    logger.info(`MusicaInfo detail: ${detailUrl}`);

    let html: string;
    try {
      html = await fetchPage(detailUrl);
    } catch (err: any) {
      logger.error('MusicaInfo fetch error:', err.message);
      throw new ApiError(502, 'Could not connect to MusicaInfo.net.');
    }

    const $ = cheerio.load(html);
    const result: DetailResult = {
      title: '',
      composer: '',
      arranger: '',
      publisher: '',
      duration: '',
      durationSeconds: 0,
      difficulty: '',
      instrumentation: '',
      articleNumber: artnr,
    };

    // Strategy: Extract label-value pairs from tables and definition lists
    // musicainfo.net typically uses tables with label cells and value cells

    // Look for table-based label-value pairs
    $('table tr').each((_, row) => {
      const cells = $(row).find('td, th');
      if (cells.length >= 2) {
        const label = $(cells[0]).text().trim().toLowerCase();
        const value = $(cells[1]).text().trim();

        if (!value) return;

        if (label.includes('title') || label.includes('titel')) {
          if (!result.title) result.title = value;
        } else if (label.includes('composer') || label.includes('komponist') || label.includes('compon')) {
          result.composer = value;
        } else if (label.includes('arranger') || label.includes('arrangeur') || label.includes('bearb')) {
          result.arranger = value;
        } else if (
          label.includes('duration') ||
          label.includes('dauer') ||
          label.includes('speelduur') ||
          label.includes('playing time')
        ) {
          result.duration = value;
          result.durationSeconds = parseDurationToSeconds(value);
        } else if (
          label.includes('difficulty') ||
          label.includes('schwierigkeit') ||
          label.includes('moeilijk') ||
          label.includes('grade')
        ) {
          result.difficulty = value;
        } else if (label.includes('publisher') || label.includes('verlag') || label.includes('uitgever')) {
          result.publisher = value;
        } else if (label.includes('instrumentation') || label.includes('besetzung') || label.includes('bezetting')) {
          result.instrumentation = value;
        }
      }
    });

    // Also look for dt/dd pairs (definition lists)
    $('dl dt').each((_, dt) => {
      const label = $(dt).text().trim().toLowerCase();
      const dd = $(dt).next('dd');
      const value = dd.text().trim();
      if (!value) return;

      if (label.includes('duration') || label.includes('dauer') || label.includes('speelduur')) {
        result.duration = value;
        result.durationSeconds = parseDurationToSeconds(value);
      } else if (
        label.includes('difficulty') ||
        label.includes('schwierigkeit') ||
        label.includes('moeilijk') ||
        label.includes('grade')
      ) {
        result.difficulty = value;
      } else if (label.includes('composer') || label.includes('komponist')) {
        result.composer = value;
      } else if (label.includes('arranger') || label.includes('arrangeur')) {
        result.arranger = value;
      }
    });

    // Fallback: look for specific text patterns in the page content
    if (!result.duration) {
      const bodyText = $('body').text();
      const durationMatch = bodyText.match(
        /(?:Duration|Dauer|Speelduur|Playing\s*time)[:\s]*(\d{1,2}:\d{2}(?::\d{2})?)/i,
      );
      if (durationMatch) {
        result.duration = durationMatch[1];
        result.durationSeconds = parseDurationToSeconds(durationMatch[1]);
      }
    }

    if (!result.difficulty) {
      const bodyText = $('body').text();
      const diffMatch = bodyText.match(/(?:Difficulty|Schwierigkeit|Moeilijkheid|Grade)[:\s]*([^\n\r,]{1,30})/i);
      if (diffMatch) {
        result.difficulty = diffMatch[1].trim();
      }
    }

    // Try to get the title from the page <title> or h1
    if (!result.title) {
      const pageTitle = $('h1').first().text().trim() || $('title').text().trim();
      // Clean up title like "MusicaInfo.net/details/Title (12345)"
      const titleMatch = pageTitle.match(/details\/(.+?)\s*\(/);
      if (titleMatch) {
        result.title = titleMatch[1].trim();
      } else {
        result.title = pageTitle;
      }
    }

    res.json(result);
  }),
);

export default router;
