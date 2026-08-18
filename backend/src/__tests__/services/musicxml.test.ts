import { describe, it, expect } from 'vitest';
import {
  parseMusicXML,
  validateMusicXML,
  extractTitle,
  extractComposer,
  extractArranger,
  extractLyricist,
  partsToJson,
  isCompressedMusicXML,
} from '../../services/musicxml';

const SIMPLE_MUSICXML = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work>
    <work-number>Op. 67</work-number>
    <work-title>Symphony No. 5</work-title>
  </work>
  <movement-number>1</movement-number>
  <movement-title>Allegro con brio</movement-title>
  <identification>
    <creator type="composer">Ludwig van Beethoven</creator>
    <creator type="arranger">Jan de Vries</creator>
    <creator type="lyricist">Test Lyricist</creator>
    <rights>Public Domain</rights>
    <source>Breitkopf Edition</source>
    <encoding>
      <software>MuseScore 4.0</software>
      <encoding-date>2024-01-15</encoding-date>
    </encoding>
  </identification>
  <part-list>
    <score-part id="P1">
      <part-name>Flute 1</part-name>
      <part-abbreviation>Fl. 1</part-abbreviation>
    </score-part>
    <score-part id="P2">
      <part-name>Clarinet in Bb</part-name>
      <part-abbreviation>Cl.</part-abbreviation>
      <score-instrument id="P2-I1">
        <instrument-name>Bb Clarinet</instrument-name>
      </score-instrument>
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="1" />
  </part>
</score-partwise>`;

const MINIMAL_MUSICXML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1">
      <part-name>Piano</part-name>
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="1" />
  </part>
</score-partwise>`;

const INVALID_XML = `<?xml version="1.0"?>
<not-musicxml>
  <random>content</random>
</not-musicxml>`;

describe('MusicXML Parser', () => {
  describe('parseMusicXML', () => {
    it('should parse a complete MusicXML file', () => {
      const result = parseMusicXML(SIMPLE_MUSICXML);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.errors).toHaveLength(0);

      const data = result.data!;
      expect(data.workNumber).toBe('Op. 67');
      expect(data.workTitle).toBe('Symphony No. 5');
      expect(data.movementNumber).toBe(1);
      expect(data.movementTitle).toBe('Allegro con brio');
      expect(data.rights).toBe('Public Domain');
      expect(data.source).toBe('Breitkopf Edition');
    });

    it('should extract creators correctly', () => {
      const result = parseMusicXML(SIMPLE_MUSICXML);
      const data = result.data!;

      expect(data.creators).toHaveLength(3);

      const composer = data.creators.find((c) => c.type === 'composer');
      expect(composer).toBeDefined();
      expect(composer?.name).toBe('Ludwig van Beethoven');

      const arranger = data.creators.find((c) => c.type === 'arranger');
      expect(arranger).toBeDefined();
      expect(arranger?.name).toBe('Jan de Vries');

      const lyricist = data.creators.find((c) => c.type === 'lyricist');
      expect(lyricist).toBeDefined();
      expect(lyricist?.name).toBe('Test Lyricist');
    });

    it('should extract encoding information', () => {
      const result = parseMusicXML(SIMPLE_MUSICXML);
      const data = result.data!;

      expect(data.encoding).toBeDefined();
      expect(data.encoding?.software).toBe('MuseScore 4.0');
      expect(data.encoding?.encodingDate).toBe('2024-01-15');
    });

    it('should extract parts list', () => {
      const result = parseMusicXML(SIMPLE_MUSICXML);
      const data = result.data!;

      expect(data.parts).toHaveLength(2);

      expect(data.parts[0].id).toBe('P1');
      expect(data.parts[0].name).toBe('Flute 1');
      expect(data.parts[0].abbreviation).toBe('Fl. 1');

      expect(data.parts[1].id).toBe('P2');
      expect(data.parts[1].name).toBe('Clarinet in Bb');
      expect(data.parts[1].instrumentName).toBe('Bb Clarinet');
    });

    it('should parse minimal MusicXML', () => {
      const result = parseMusicXML(MINIMAL_MUSICXML);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.parts).toHaveLength(1);
      expect(result.data?.parts[0].name).toBe('Piano');
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should reject invalid XML', () => {
      const result = parseMusicXML(INVALID_XML);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].code).toBe('NOT_MUSICXML');
    });

    it('should reject empty content', () => {
      const result = parseMusicXML('');

      expect(result.success).toBe(false);
      expect(result.errors[0].code).toBe('EMPTY_CONTENT');
    });

    it('should store raw XML', () => {
      const result = parseMusicXML(SIMPLE_MUSICXML);
      expect(result.data?.rawXml).toBe(SIMPLE_MUSICXML);
    });
  });

  describe('validateMusicXML', () => {
    it('should validate correct MusicXML', () => {
      const errors = validateMusicXML(SIMPLE_MUSICXML);
      expect(errors).toHaveLength(0);
    });

    it('should detect empty content', () => {
      const errors = validateMusicXML('');
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.code === 'EMPTY')).toBe(true);
    });

    it('should detect missing XML declaration', () => {
      const errors = validateMusicXML('<score-partwise></score-partwise>');
      expect(errors.some((e) => e.code === 'NO_XML_DECLARATION')).toBe(true);
    });

    it('should detect non-MusicXML files', () => {
      const errors = validateMusicXML('<?xml version="1.0"?><html></html>');
      expect(errors.some((e) => e.code === 'NOT_MUSICXML')).toBe(true);
    });
  });

  describe('extractTitle', () => {
    it('should return work title with movement title', () => {
      const result = parseMusicXML(SIMPLE_MUSICXML);
      const title = extractTitle(result.data!);
      expect(title).toBe('Symphony No. 5 - Allegro con brio');
    });

    it('should return just work title if no movement', () => {
      const xml = SIMPLE_MUSICXML.replace(/<movement-number>.*<\/movement-number>/s, '').replace(
        /<movement-title>.*<\/movement-title>/s,
        '',
      );
      const result = parseMusicXML(xml);
      const title = extractTitle(result.data!);
      expect(title).toBe('Symphony No. 5');
    });

    it('should return null if no title', () => {
      const result = parseMusicXML(MINIMAL_MUSICXML);
      const title = extractTitle(result.data!);
      expect(title).toBeNull();
    });
  });

  describe('extractComposer', () => {
    it('should extract composer', () => {
      const result = parseMusicXML(SIMPLE_MUSICXML);
      const composer = extractComposer(result.data!);
      expect(composer).toBe('Ludwig van Beethoven');
    });

    it('should return null if no composer', () => {
      const result = parseMusicXML(MINIMAL_MUSICXML);
      const composer = extractComposer(result.data!);
      expect(composer).toBeNull();
    });
  });

  describe('extractArranger', () => {
    it('should extract arranger', () => {
      const result = parseMusicXML(SIMPLE_MUSICXML);
      const arranger = extractArranger(result.data!);
      expect(arranger).toBe('Jan de Vries');
    });

    it('should return null if no arranger', () => {
      const result = parseMusicXML(MINIMAL_MUSICXML);
      const arranger = extractArranger(result.data!);
      expect(arranger).toBeNull();
    });
  });

  describe('extractLyricist', () => {
    it('should extract lyricist', () => {
      const result = parseMusicXML(SIMPLE_MUSICXML);
      const lyricist = extractLyricist(result.data!);
      expect(lyricist).toBe('Test Lyricist');
    });

    it('should extract poet as lyricist', () => {
      const xml = SIMPLE_MUSICXML.replace('type="lyricist"', 'type="poet"');
      const result = parseMusicXML(xml);
      const lyricist = extractLyricist(result.data!);
      expect(lyricist).toBe('Test Lyricist');
    });
  });

  describe('partsToJson', () => {
    it('should convert parts to JSON', () => {
      const result = parseMusicXML(SIMPLE_MUSICXML);
      const json = partsToJson(result.data!.parts);
      const parsed = JSON.parse(json);

      expect(parsed).toHaveLength(2);
      expect(parsed[0].name).toBe('Flute 1');
      expect(parsed[1].instrument).toBe('Bb Clarinet');
    });

    it('should handle empty parts list', () => {
      const json = partsToJson([]);
      expect(json).toBe('[]');
    });
  });

  describe('isCompressedMusicXML', () => {
    it('should detect ZIP files', () => {
      const zipHeader = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
      expect(isCompressedMusicXML(zipHeader)).toBe(true);
    });

    it('should not detect regular XML', () => {
      const xmlContent = Buffer.from('<?xml version="1.0"?>');
      expect(isCompressedMusicXML(xmlContent)).toBe(false);
    });

    it('should handle short buffers', () => {
      const shortBuffer = Buffer.from([0x50]);
      expect(isCompressedMusicXML(shortBuffer)).toBe(false);
    });
  });
});

describe('MusicXML edge cases', () => {
  it('should handle multiple rights elements', () => {
    const xml = `<?xml version="1.0"?>
<score-partwise version="4.0">
  <identification>
    <rights>Copyright 2024</rights>
    <rights>All rights reserved</rights>
  </identification>
  <part-list><score-part id="P1"><part-name>X</part-name></score-part></part-list>
  <part id="P1"><measure number="1"/></part>
</score-partwise>`;

    const result = parseMusicXML(xml);
    expect(result.success).toBe(true);
    expect(result.data?.rights).toBe('Copyright 2024 | All rights reserved');
  });

  it('should handle creator without type attribute', () => {
    const xml = `<?xml version="1.0"?>
<score-partwise version="4.0">
  <identification>
    <creator>Unknown Creator</creator>
  </identification>
  <part-list><score-part id="P1"><part-name>X</part-name></score-part></part-list>
  <part id="P1"><measure number="1"/></part>
</score-partwise>`;

    const result = parseMusicXML(xml);
    expect(result.success).toBe(true);
    expect(result.data?.creators).toHaveLength(1);
    expect(result.data?.creators[0].type).toBe('composer');
    expect(result.data?.creators[0].name).toBe('Unknown Creator');
  });

  it('should handle score-timewise format', () => {
    const xml = `<?xml version="1.0"?>
<score-timewise version="4.0">
  <work>
    <work-title>Timewise Piece</work-title>
  </work>
  <part-list><score-part id="P1"><part-name>Voice</part-name></score-part></part-list>
  <measure number="1"/>
</score-timewise>`;

    const result = parseMusicXML(xml);
    expect(result.success).toBe(true);
    expect(result.data?.workTitle).toBe('Timewise Piece');
  });
});
