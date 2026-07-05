import { describe, it, expect, vi } from 'vitest';
import {
  formatDate,
  formatDateTime,
  formatTime,
  formatDateRange,
  formatDuration,
  formatDurationSeconds,
  getDayName,
  getMonthName,
} from '../dateFormat';

// Pin the locale to nl-NL so assertions are deterministic
// (dateFormat re-exports currentLocale from ../locale, which reads i18n)
vi.mock('../locale', () => ({
  currentLocale: () => 'nl-NL',
}));

describe('formatDate', () => {
  it('formats a Date object as "day month year"', () => {
    expect(formatDate(new Date(2026, 4, 4))).toBe('4 mei 2026');
  });

  it('formats an ISO string', () => {
    expect(formatDate('2026-12-25T12:00:00')).toBe('25 december 2026');
  });

  it('formats a timestamp', () => {
    expect(formatDate(new Date(2026, 0, 1).getTime())).toBe('1 januari 2026');
  });

  it('returns "-" for invalid dates', () => {
    expect(formatDate('not-a-date')).toBe('-');
    expect(formatDate(new Date('invalid'))).toBe('-');
  });
});

describe('formatDateTime', () => {
  it('joins date and time with "om" in Dutch', () => {
    expect(formatDateTime(new Date(2026, 4, 4, 14, 30))).toBe('4 mei 2026 om 14:30');
  });

  it('returns "-" for invalid dates', () => {
    expect(formatDateTime('nope')).toBe('-');
  });
});

describe('formatTime', () => {
  it('formats time in 24-hour notation', () => {
    expect(formatTime(new Date(2026, 4, 4, 9, 5))).toBe('09:05');
    expect(formatTime(new Date(2026, 4, 4, 21, 45))).toBe('21:45');
  });
});

describe('formatDateRange', () => {
  it('collapses a range within the same month', () => {
    expect(formatDateRange(new Date(2026, 4, 4), new Date(2026, 4, 6))).toBe('4 - 6 mei 2026');
  });

  it('formats a range across months in the same year', () => {
    expect(formatDateRange(new Date(2026, 4, 4), new Date(2026, 5, 2))).toBe('4 mei - 2 juni 2026');
  });

  it('formats a range across years with full dates', () => {
    expect(formatDateRange(new Date(2026, 4, 4), new Date(2027, 5, 2))).toBe('4 mei 2026 - 2 juni 2027');
  });

  it('returns "-" when either date is invalid', () => {
    expect(formatDateRange('nope', new Date(2026, 4, 6))).toBe('-');
    expect(formatDateRange(new Date(2026, 4, 4), 'nope')).toBe('-');
  });
});

describe('formatDuration (minutes)', () => {
  it('returns "-" for zero or negative input', () => {
    expect(formatDuration(0)).toBe('-');
    expect(formatDuration(-5)).toBe('-');
  });

  it('formats minutes only', () => {
    expect(formatDuration(30)).toBe('30 min');
  });

  it('formats whole hours', () => {
    expect(formatDuration(60)).toBe('1 uur');
    expect(formatDuration(120)).toBe('2 uur');
  });

  it('formats hours and minutes', () => {
    expect(formatDuration(135)).toBe('2 uur 15 min');
  });
});

describe('formatDurationSeconds', () => {
  it('converts seconds to a readable duration', () => {
    expect(formatDurationSeconds(1800)).toBe('30 min');
    expect(formatDurationSeconds(5400)).toBe('1 uur 30 min');
  });

  it('returns "-" for zero input', () => {
    expect(formatDurationSeconds(0)).toBe('-');
  });
});

describe('getDayName / getMonthName', () => {
  it('returns Dutch day names', () => {
    // 2026-05-04 is a Monday
    expect(getDayName(new Date(2026, 4, 4))).toBe('maandag');
    expect(getDayName(new Date(2026, 4, 4), 'short')).toBe('ma');
  });

  it('returns Dutch month names', () => {
    expect(getMonthName(new Date(2026, 4, 4))).toBe('mei');
    expect(getMonthName(new Date(2026, 0, 4))).toBe('januari');
  });

  it('returns "-" for invalid dates', () => {
    expect(getDayName('nope')).toBe('-');
    expect(getMonthName('nope')).toBe('-');
  });
});
