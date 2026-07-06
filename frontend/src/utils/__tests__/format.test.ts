import { describe, it, expect, vi } from 'vitest';
import { formatDuration, parseDuration, truncate, formatFileSize, formatCurrency } from '../format';

// Pin the locale to nl-NL so locale-aware assertions are deterministic
// (also avoids importing the real i18n module in unit tests)
vi.mock('../locale', () => ({
  currentLocale: () => 'nl-NL',
}));

// Intl uses non-breaking spaces (U+00A0/U+202F); normalize for readable assertions
const normalizeSpaces = (s: string) => s.replace(/[\u00a0\u202f]/g, ' ');

describe('formatDuration', () => {
  it('returns "-" for zero or negative values', () => {
    expect(formatDuration(0)).toBe('-');
    expect(formatDuration(-1)).toBe('-');
  });

  it('formats seconds to mm:ss', () => {
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(120)).toBe('2:00');
    expect(formatDuration(5)).toBe('0:05');
  });

  it('formats to h:mm:ss for durations >= 1 hour', () => {
    expect(formatDuration(3600)).toBe('1:00:00');
    expect(formatDuration(3661)).toBe('1:01:01');
    expect(formatDuration(7200)).toBe('2:00:00');
  });
});

describe('parseDuration', () => {
  it('returns 0 for empty string', () => {
    expect(parseDuration('')).toBe(0);
  });

  it('parses mm:ss format', () => {
    expect(parseDuration('1:05')).toBe(65);
    expect(parseDuration('2:00')).toBe(120);
    expect(parseDuration('0:05')).toBe(5);
  });

  it('parses h:mm:ss format', () => {
    expect(parseDuration('1:00:00')).toBe(3600);
    expect(parseDuration('1:01:01')).toBe(3661);
  });

  it('returns 0 for invalid input', () => {
    expect(parseDuration('abc')).toBe(0);
    expect(parseDuration('1:ab')).toBe(0);
  });

  it('is inverse of formatDuration', () => {
    expect(parseDuration(formatDuration(65))).toBe(65);
    expect(parseDuration(formatDuration(3661))).toBe(3661);
  });
});

describe('truncate', () => {
  it('returns text unchanged if shorter than maxLength', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('truncates and adds ellipsis', () => {
    expect(truncate('hello world', 8)).toBe('hello...');
  });

  it('handles exact length', () => {
    expect(truncate('hello', 5)).toBe('hello');
  });
});

describe('formatFileSize', () => {
  it('formats 0 bytes', () => {
    expect(formatFileSize(0)).toBe('0 B');
  });

  it('formats bytes', () => {
    expect(formatFileSize(500)).toBe('500 B');
  });

  it('formats kilobytes', () => {
    expect(formatFileSize(1024)).toBe('1 KB');
    expect(formatFileSize(1536)).toBe('1.5 KB');
  });

  it('formats megabytes', () => {
    expect(formatFileSize(1048576)).toBe('1 MB');
    expect(formatFileSize(5242880)).toBe('5 MB');
  });
});

describe('formatCurrency', () => {
  it('returns "-" for null or undefined', () => {
    expect(formatCurrency(null)).toBe('-');
    expect(formatCurrency(undefined)).toBe('-');
  });

  it('formats EUR amounts in nl-NL notation', () => {
    expect(normalizeSpaces(formatCurrency(25.5))).toBe('€ 25,50');
    expect(normalizeSpaces(formatCurrency(1000))).toBe('€ 1.000,00');
  });

  it('formats zero and negative amounts', () => {
    expect(normalizeSpaces(formatCurrency(0))).toBe('€ 0,00');
    expect(normalizeSpaces(formatCurrency(-12.34))).toBe('€ -12,34');
  });

  it('supports other currencies', () => {
    const formatted = normalizeSpaces(formatCurrency(100, 'USD'));
    expect(formatted).toContain('100,00');
    expect(formatted).toMatch(/US?\$|USD/);
  });

  it('always renders two decimals', () => {
    expect(normalizeSpaces(formatCurrency(7))).toBe('€ 7,00');
    expect(normalizeSpaces(formatCurrency(7.1))).toBe('€ 7,10');
  });
});
