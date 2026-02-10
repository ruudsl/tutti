import { describe, it, expect } from 'vitest';
import { parseDurationToSeconds } from '../musicainfo';

describe('parseDurationToSeconds', () => {
    it('parses mm:ss format', () => {
        expect(parseDurationToSeconds('05:30')).toBe(330);
        expect(parseDurationToSeconds('5:30')).toBe(330);
        expect(parseDurationToSeconds('12:00')).toBe(720);
    });

    it('parses hh:mm:ss format', () => {
        expect(parseDurationToSeconds('1:05:30')).toBe(3930);
        expect(parseDurationToSeconds('01:05:30')).toBe(3930);
        expect(parseDurationToSeconds('2:00:00')).toBe(7200);
    });

    it('returns 0 for empty or invalid input', () => {
        expect(parseDurationToSeconds('')).toBe(0);
        expect(parseDurationToSeconds('abc')).toBe(0);
        expect(parseDurationToSeconds('no time here')).toBe(0);
    });

    it('handles edge cases', () => {
        expect(parseDurationToSeconds('0:00')).toBe(0);
        expect(parseDurationToSeconds('0:01')).toBe(1);
        expect(parseDurationToSeconds('99:59')).toBe(5999);
    });

    it('extracts duration from longer strings', () => {
        expect(parseDurationToSeconds('Duration: 05:30')).toBe(330);
        expect(parseDurationToSeconds('ca. 3:45 min')).toBe(225);
    });
});
