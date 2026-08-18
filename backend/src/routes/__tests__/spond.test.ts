import { describe, it, expect } from 'vitest';
import { timeToMinutes } from '../spond';

describe('timeToMinutes', () => {
  it('converts HH:MM to minutes since midnight', () => {
    expect(timeToMinutes('00:00')).toBe(0);
    expect(timeToMinutes('01:00')).toBe(60);
    expect(timeToMinutes('19:30')).toBe(1170);
    expect(timeToMinutes('23:59')).toBe(1439);
  });

  it('handles single-digit hours', () => {
    expect(timeToMinutes('9:00')).toBe(540);
    expect(timeToMinutes('9:30')).toBe(570);
  });

  it('handles missing parts gracefully', () => {
    expect(timeToMinutes('0:00')).toBe(0);
  });
});
