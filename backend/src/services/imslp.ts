import logger from '../utils/logger';

// IMSLP API base URL
const IMSLP_API_BASE = 'https://imslp.org/api.php';

// Rate limiting configuration
const RATE_LIMIT_DELAY_MS = 1000; // 1 second between requests
let lastRequestTime = 0;

/**
 * Simple rate limiter to avoid overloading IMSLP API
 */
async function rateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    if (timeSinceLastRequest < RATE_LIMIT_DELAY_MS) {
        await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY_MS - timeSinceLastRequest));
    }
    lastRequestTime = Date.now();
}

// ========================
// Types
// ========================

export interface ImslpWork {
    id: string;
    title: string;
    composer: string;
    workCategory: string;
    instrumentation: string;
    key: string;
    movements: string[];
    year: string;
    permalink: string;
}

export interface ImslpScore {
    id: string;
    filename: string;
    description: string;
    pageCount: number;
    fileUrl: string;
    uploader: string;
    uploadDate: string;
    editor: string;
    publisher: string;
    copyright: string;
    fileSize: string;
}

export interface ImslpWorkDetail extends ImslpWork {
    scores: ImslpScore[];
}

export interface ImslpSearchResult {
    works: ImslpWork[];
    totalCount: number;
    searchUrl: string;
}

// ========================
// API Functions
// ========================

/**
 * Search IMSLP for works by title and/or composer
 */
export async function searchImslp(
    query: string,
    composer?: string
): Promise<ImslpSearchResult> {
    await rateLimit();

    // Build search term
    let searchTerm = query;
    if (composer) {
        searchTerm = `${composer} ${query}`;
    }

    const params = new URLSearchParams({
        action: 'query',
        list: 'search',
        srsearch: searchTerm,
        srnamespace: '0', // Main namespace for works
        srlimit: '50',
        format: 'json',
        origin: '*',
    });

    const url = `${IMSLP_API_BASE}?${params.toString()}`;
    logger.info(`IMSLP search: ${url}`);

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'HarmonieApp/1.0 (https://harmonie.app; info@harmonie.app)',
            },
        });

        if (!response.ok) {
            throw new Error(`IMSLP API error: ${response.status}`);
        }

        const data = await response.json() as any;

        if (!data.query?.search) {
            return {
                works: [],
                totalCount: 0,
                searchUrl: `https://imslp.org/wiki/Special:Search?search=${encodeURIComponent(searchTerm)}`,
            };
        }

        const works: ImslpWork[] = data.query.search
            .filter((result: any) => !result.title.startsWith('Category:'))
            .map((result: any) => parseWorkFromSearchResult(result));

        return {
            works,
            totalCount: data.query.searchinfo?.totalhits || works.length,
            searchUrl: `https://imslp.org/wiki/Special:Search?search=${encodeURIComponent(searchTerm)}`,
        };
    } catch (error: any) {
        logger.error('IMSLP search error:', error.message);
        throw error;
    }
}

/**
 * Parse a work from a search result
 */
function parseWorkFromSearchResult(result: any): ImslpWork {
    const title = result.title || '';

    // IMSLP titles are typically in format: "Title (Composer)"
    const titleMatch = title.match(/^(.+?)\s*\(([^)]+)\)$/);
    let workTitle = title;
    let composer = '';

    if (titleMatch) {
        workTitle = titleMatch[1].trim();
        composer = titleMatch[2].trim();
    }

    return {
        id: result.pageid?.toString() || title.replace(/\s+/g, '_'),
        title: workTitle,
        composer,
        workCategory: '',
        instrumentation: '',
        key: '',
        movements: [],
        year: '',
        permalink: `https://imslp.org/wiki/${encodeURIComponent(title.replace(/\s+/g, '_'))}`,
    };
}

/**
 * Get detailed information about a specific work including available scores
 */
export async function getWorkDetails(workId: string): Promise<ImslpWorkDetail | null> {
    await rateLimit();

    // First, get the page content using the parse API
    const params = new URLSearchParams({
        action: 'parse',
        pageid: workId,
        format: 'json',
        origin: '*',
        prop: 'text|categories|links',
    });

    const url = `${IMSLP_API_BASE}?${params.toString()}`;
    logger.info(`IMSLP work detail: ${url}`);

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'HarmonieApp/1.0 (https://harmonie.app; info@harmonie.app)',
            },
        });

        if (!response.ok) {
            throw new Error(`IMSLP API error: ${response.status}`);
        }

        const data = await response.json() as any;

        if (data.error) {
            logger.warn(`IMSLP work not found: ${workId}`);
            return null;
        }

        const parseResult = data.parse;
        const title = parseResult.title || '';

        // Parse title for composer info
        const titleMatch = title.match(/^(.+?)\s*\(([^)]+)\)$/);
        let workTitle = title;
        let composer = '';

        if (titleMatch) {
            workTitle = titleMatch[1].trim();
            composer = titleMatch[2].trim();
        }

        // Parse the HTML content to extract scores
        const htmlContent = parseResult.text?.['*'] || '';
        const scores = parseScoresFromHtml(htmlContent, workId);

        // Extract categories for instrumentation info
        const categories = (parseResult.categories || [])
            .map((cat: any) => cat['*'] || cat.title || '')
            .filter((cat: string) => !cat.includes('Composer') && !cat.includes('Work'));

        const instrumentation = categories
            .filter((cat: string) =>
                cat.includes('Scores') ||
                cat.includes('Parts') ||
                cat.includes('for')
            )
            .join(', ');

        return {
            id: workId,
            title: workTitle,
            composer,
            workCategory: '',
            instrumentation,
            key: extractKeyFromTitle(workTitle),
            movements: [],
            year: '',
            permalink: `https://imslp.org/wiki/${encodeURIComponent(title.replace(/\s+/g, '_'))}`,
            scores,
        };
    } catch (error: any) {
        logger.error('IMSLP work detail error:', error.message);
        throw error;
    }
}

/**
 * Parse PDF scores from the HTML content of a work page
 */
function parseScoresFromHtml(html: string, workId: string): ImslpScore[] {
    const scores: ImslpScore[] = [];

    // Match PDF download links in IMSLP's typical format
    // IMSLP uses various patterns for file links
    const pdfLinkRegex = /href="([^"]*\.pdf)"/gi;
    const matches = html.matchAll(pdfLinkRegex);

    const seenUrls = new Set<string>();
    let index = 0;

    for (const match of matches) {
        let fileUrl = match[1];

        // Skip duplicate URLs
        if (seenUrls.has(fileUrl)) continue;
        seenUrls.add(fileUrl);

        // Make URL absolute if needed
        if (fileUrl.startsWith('//')) {
            fileUrl = 'https:' + fileUrl;
        } else if (fileUrl.startsWith('/')) {
            fileUrl = 'https://imslp.org' + fileUrl;
        }

        // Extract filename from URL
        const filename = decodeURIComponent(fileUrl.split('/').pop() || `score_${index}.pdf`);

        // Try to extract description from surrounding context
        let description = filename
            .replace(/\.pdf$/i, '')
            .replace(/_/g, ' ')
            .replace(/PMLP\d+[-_]/i, ''); // Remove PMLP prefix

        scores.push({
            id: `${workId}_${index}`,
            filename,
            description,
            pageCount: 0, // Not always available
            fileUrl,
            uploader: '',
            uploadDate: '',
            editor: '',
            publisher: extractPublisherFromFilename(filename),
            copyright: '',
            fileSize: '',
        });

        index++;
    }

    // If no PDFs found via regex, try alternative patterns
    if (scores.length === 0) {
        // Look for IMSLP file page links which often indicate downloadable content
        const filePageRegex = /href="[^"]*(?:Special:IMSLPFile|imslp\.org\/wiki\/File:)([^"]+)"/gi;
        const fileMatches = html.matchAll(filePageRegex);

        for (const match of fileMatches) {
            const pageName = match[1];
            if (pageName.toLowerCase().endsWith('.pdf') || pageName.includes('pdf')) {
                scores.push({
                    id: `${workId}_${index}`,
                    filename: decodeURIComponent(pageName),
                    description: decodeURIComponent(pageName).replace(/\.pdf$/i, '').replace(/_/g, ' '),
                    pageCount: 0,
                    fileUrl: `https://imslp.org/wiki/Special:IMSLPFile/${encodeURIComponent(pageName)}`,
                    uploader: '',
                    uploadDate: '',
                    editor: '',
                    publisher: '',
                    copyright: '',
                    fileSize: '',
                });
                index++;
            }
        }
    }

    return scores;
}

/**
 * Extract publisher information from filename
 */
function extractPublisherFromFilename(filename: string): string {
    const publishers: Record<string, string> = {
        'Breitkopf': 'Breitkopf & Hartel',
        'Peters': 'C.F. Peters',
        'Schirmer': 'G. Schirmer',
        'Dover': 'Dover Publications',
        'Kalmus': 'Kalmus',
        'Universal': 'Universal Edition',
        'Boosey': 'Boosey & Hawkes',
        'Henle': 'G. Henle Verlag',
        'Barenreiter': 'Barenreiter',
        'Durand': 'Durand',
        'Ricordi': 'Ricordi',
    };

    for (const [key, value] of Object.entries(publishers)) {
        if (filename.toLowerCase().includes(key.toLowerCase())) {
            return value;
        }
    }

    return '';
}

/**
 * Extract musical key from title if present
 */
function extractKeyFromTitle(title: string): string {
    const keyPatterns = [
        /in\s+([A-G][#b]?\s*(?:major|minor|maj|min)?)/i,
        /([A-G][#b]?)\s*(?:-|:)\s*(?:Dur|Moll|dur|moll)/,
        /,?\s*([A-G][#b]?\s*(?:major|minor))/i,
    ];

    for (const pattern of keyPatterns) {
        const match = title.match(pattern);
        if (match) {
            return match[1].trim();
        }
    }

    return '';
}

/**
 * Download a PDF from IMSLP
 * Returns the PDF as a Buffer
 */
export async function downloadPdf(fileUrl: string): Promise<Buffer> {
    await rateLimit();

    logger.info(`IMSLP download: ${fileUrl}`);

    // IMSLP may redirect through a download page
    const response = await fetch(fileUrl, {
        headers: {
            'User-Agent': 'HarmonieApp/1.0 (https://harmonie.app; info@harmonie.app)',
        },
        redirect: 'follow',
    });

    if (!response.ok) {
        throw new Error(`Failed to download PDF: ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || '';

    // If we got HTML instead of PDF, we may need to extract the actual download URL
    if (contentType.includes('text/html')) {
        const html = await response.text();

        // Look for the actual PDF download link in the page
        const downloadMatch = html.match(/href="([^"]+\.pdf[^"]*)"/i) ||
                             html.match(/window\.location\s*=\s*['"]([^'"]+\.pdf[^'"]*)['"]/i);

        if (downloadMatch) {
            let actualUrl = downloadMatch[1];
            if (actualUrl.startsWith('//')) {
                actualUrl = 'https:' + actualUrl;
            } else if (actualUrl.startsWith('/')) {
                actualUrl = 'https://imslp.org' + actualUrl;
            }

            // Follow the actual download URL
            const pdfResponse = await fetch(actualUrl, {
                headers: {
                    'User-Agent': 'HarmonieApp/1.0 (https://harmonie.app; info@harmonie.app)',
                },
                redirect: 'follow',
            });

            if (!pdfResponse.ok) {
                throw new Error(`Failed to download PDF: ${pdfResponse.status}`);
            }

            const arrayBuffer = await pdfResponse.arrayBuffer();
            return Buffer.from(arrayBuffer);
        }

        throw new Error('Could not find PDF download link');
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
}

/**
 * Search for a work by title and optionally composer (convenience function)
 */
export async function findWork(title: string, composer?: string): Promise<ImslpWork[]> {
    const result = await searchImslp(title, composer);
    return result.works;
}
