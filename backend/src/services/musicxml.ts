/**
 * MusicXML Parser Service
 *
 * Parses MusicXML 4.0 files and extracts metadata for the music library.
 * Only metadata elements are parsed, not the actual music notation.
 *
 * Supported elements:
 * - <work> (work-number, work-title)
 * - <movement-number>, <movement-title>
 * - <identification> (creator, rights, source, encoding)
 * - <part-list> (score-part with part-name)
 */

import { XMLParser } from 'fast-xml-parser';

export interface MusicXMLCreator {
  type: 'composer' | 'arranger' | 'lyricist' | 'poet' | 'transcriber' | string;
  name: string;
}

export interface MusicXMLPart {
  id: string;
  name: string;
  abbreviation?: string;
  instrumentName?: string;
}

export interface MusicXMLEncoding {
  software?: string;
  encodingDate?: string;
  encoder?: string;
}

export interface ParsedMusicXML {
  workNumber?: string;
  workTitle?: string;
  movementNumber?: number;
  movementTitle?: string;
  creators: MusicXMLCreator[];
  rights?: string;
  source?: string;
  encoding?: MusicXMLEncoding;
  parts: MusicXMLPart[];
  rawXml: string;
}

export interface MusicXMLValidationError {
  code: string;
  message: string;
  line?: number;
}

export interface MusicXMLParseResult {
  success: boolean;
  data?: ParsedMusicXML;
  errors: MusicXMLValidationError[];
  warnings: string[];
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseAttributeValue: true,
  trimValues: true,
  isArray: (name) => {
    // Elements that can appear multiple times
    return ['creator', 'score-part', 'rights', 'relation'].includes(name);
  },
});

/**
 * Parse a MusicXML string and extract metadata
 */
export function parseMusicXML(xmlContent: string): MusicXMLParseResult {
  const errors: MusicXMLValidationError[] = [];
  const warnings: string[] = [];

  // Basic validation
  if (!xmlContent || typeof xmlContent !== 'string') {
    return {
      success: false,
      errors: [{ code: 'EMPTY_CONTENT', message: 'MusicXML content is empty or invalid' }],
      warnings: [],
    };
  }

  // Check for MusicXML signature
  if (!xmlContent.includes('score-partwise') && !xmlContent.includes('score-timewise')) {
    return {
      success: false,
      errors: [{ code: 'NOT_MUSICXML', message: 'File does not appear to be a valid MusicXML document' }],
      warnings: [],
    };
  }

  try {
    const parsed = xmlParser.parse(xmlContent);

    // MusicXML can be partwise or timewise
    const scoreRoot = parsed['score-partwise'] || parsed['score-timewise'];

    if (!scoreRoot) {
      return {
        success: false,
        errors: [{ code: 'NO_SCORE_ROOT', message: 'Could not find score-partwise or score-timewise root element' }],
        warnings: [],
      };
    }

    const result: ParsedMusicXML = {
      creators: [],
      parts: [],
      rawXml: xmlContent,
    };

    // Parse <work> element
    if (scoreRoot.work) {
      const work = scoreRoot.work;
      if (work['work-number']) {
        result.workNumber = String(work['work-number']);
      }
      if (work['work-title']) {
        result.workTitle = String(work['work-title']);
      }
    }

    // Parse movement info
    if (scoreRoot['movement-number'] !== undefined) {
      const movNum = scoreRoot['movement-number'];
      result.movementNumber = typeof movNum === 'number' ? movNum : parseInt(String(movNum), 10);
      if (isNaN(result.movementNumber)) {
        warnings.push(`Invalid movement-number: ${movNum}`);
        result.movementNumber = undefined;
      }
    }

    if (scoreRoot['movement-title']) {
      result.movementTitle = String(scoreRoot['movement-title']);
    }

    // Parse <identification> element
    if (scoreRoot.identification) {
      const ident = scoreRoot.identification;

      // Parse creators
      if (ident.creator) {
        const creators = Array.isArray(ident.creator) ? ident.creator : [ident.creator];
        for (const creator of creators) {
          if (typeof creator === 'string') {
            result.creators.push({ type: 'composer', name: creator });
          } else if (creator['#text']) {
            result.creators.push({
              type: creator['@_type'] || 'composer',
              name: String(creator['#text']),
            });
          }
        }
      }

      // Parse rights
      if (ident.rights) {
        const rights = Array.isArray(ident.rights) ? ident.rights : [ident.rights];
        const rightsTexts = rights
          .map((r: string | { '#text'?: string }) => (typeof r === 'string' ? r : r['#text']))
          .filter(Boolean);
        if (rightsTexts.length > 0) {
          result.rights = rightsTexts.join(' | ');
        }
      }

      // Parse source
      if (ident.source) {
        result.source = typeof ident.source === 'string' ? ident.source : ident.source['#text'];
      }

      // Parse encoding
      if (ident.encoding) {
        const enc = ident.encoding;
        result.encoding = {};

        if (enc.software) {
          result.encoding.software = String(enc.software);
        }
        if (enc['encoding-date']) {
          result.encoding.encodingDate = String(enc['encoding-date']);
        }
        if (enc.encoder) {
          result.encoding.encoder = typeof enc.encoder === 'string' ? enc.encoder : enc.encoder['#text'];
        }
      }
    }

    // Parse <part-list> element
    if (scoreRoot['part-list']) {
      const partList = scoreRoot['part-list'];
      const scoreParts = partList['score-part'];

      if (scoreParts) {
        const parts = Array.isArray(scoreParts) ? scoreParts : [scoreParts];

        for (const part of parts) {
          const parsedPart: MusicXMLPart = {
            id: part['@_id'] || `part-${result.parts.length + 1}`,
            name: '',
          };

          if (part['part-name']) {
            parsedPart.name =
              typeof part['part-name'] === 'string' ? part['part-name'] : part['part-name']['#text'] || '';
          }

          if (part['part-abbreviation']) {
            parsedPart.abbreviation =
              typeof part['part-abbreviation'] === 'string'
                ? part['part-abbreviation']
                : part['part-abbreviation']['#text'];
          }

          // Try to get instrument name from score-instrument
          if (part['score-instrument']) {
            const instr = Array.isArray(part['score-instrument'])
              ? part['score-instrument'][0]
              : part['score-instrument'];
            if (instr && instr['instrument-name']) {
              parsedPart.instrumentName = String(instr['instrument-name']);
            }
          }

          if (parsedPart.name) {
            result.parts.push(parsedPart);
          }
        }
      }
    }

    // Warn if no useful metadata was found
    if (!result.workTitle && !result.movementTitle && result.creators.length === 0) {
      warnings.push('No title or creator information found in MusicXML');
    }

    return {
      success: true,
      data: result,
      errors: [],
      warnings,
    };
  } catch (error) {
    return {
      success: false,
      errors: [
        {
          code: 'PARSE_ERROR',
          message: error instanceof Error ? error.message : 'Failed to parse MusicXML',
        },
      ],
      warnings: [],
    };
  }
}

/**
 * Extract the primary title from parsed MusicXML
 * Prefers work-title, falls back to movement-title
 */
export function extractTitle(parsed: ParsedMusicXML): string | null {
  if (parsed.workTitle) {
    if (parsed.movementTitle) {
      return `${parsed.workTitle} - ${parsed.movementTitle}`;
    }
    return parsed.workTitle;
  }
  return parsed.movementTitle || null;
}

/**
 * Extract composer from parsed MusicXML
 */
export function extractComposer(parsed: ParsedMusicXML): string | null {
  const composer = parsed.creators.find((c) => c.type === 'composer');
  return composer?.name || null;
}

/**
 * Extract arranger from parsed MusicXML
 */
export function extractArranger(parsed: ParsedMusicXML): string | null {
  const arranger = parsed.creators.find((c) => c.type === 'arranger');
  return arranger?.name || null;
}

/**
 * Extract lyricist from parsed MusicXML
 */
export function extractLyricist(parsed: ParsedMusicXML): string | null {
  const lyricist = parsed.creators.find((c) => c.type === 'lyricist' || c.type === 'poet');
  return lyricist?.name || null;
}

/**
 * Convert parts list to JSON for storage
 */
export function partsToJson(parts: MusicXMLPart[]): string {
  return JSON.stringify(
    parts.map((p) => ({
      id: p.id,
      name: p.name,
      abbreviation: p.abbreviation,
      instrument: p.instrumentName,
    })),
  );
}

/**
 * Validate MusicXML content without full parsing
 * Used for quick validation before upload
 */
export function validateMusicXML(xmlContent: string): MusicXMLValidationError[] {
  const errors: MusicXMLValidationError[] = [];

  if (!xmlContent || xmlContent.trim().length === 0) {
    errors.push({ code: 'EMPTY', message: 'File is empty' });
    return errors;
  }

  // Check for XML declaration
  if (!xmlContent.trim().startsWith('<?xml')) {
    errors.push({ code: 'NO_XML_DECLARATION', message: 'Missing XML declaration' });
  }

  // Check for MusicXML root element
  if (!xmlContent.includes('score-partwise') && !xmlContent.includes('score-timewise')) {
    errors.push({
      code: 'NOT_MUSICXML',
      message: 'Not a valid MusicXML file (missing score-partwise or score-timewise)',
    });
  }

  // Check for basic well-formedness (matching tags)
  const openTags = (xmlContent.match(/<[a-z][a-z0-9-]*(?:\s[^>]*)?>/gi) || []).length;
  const closeTags = (xmlContent.match(/<\/[a-z][a-z0-9-]*>/gi) || []).length;
  const selfClosing = (xmlContent.match(/<[a-z][a-z0-9-]*[^>]*\/>/gi) || []).length;

  if (openTags !== closeTags + selfClosing) {
    errors.push({ code: 'MALFORMED', message: 'XML appears to be malformed (mismatched tags)' });
  }

  return errors;
}

/**
 * Check if a file is likely a compressed MusicXML (.mxl)
 */
export function isCompressedMusicXML(buffer: Buffer): boolean {
  // ZIP files start with PK (0x50 0x4B)
  return buffer.length >= 2 && buffer[0] === 0x50 && buffer[1] === 0x4b;
}
