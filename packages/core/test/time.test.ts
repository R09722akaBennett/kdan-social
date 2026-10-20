import { describe, expect, it } from 'vitest';
import { zonedTimeToUtc } from '../src/time';

describe('zonedTimeToUtc', () => {
  it('converts fixed-offset zones', () => {
    expect(zonedTimeToUtc('2026-10-20', '20:00', 'Asia/Taipei').toISOString()).toBe('2026-10-20T12:00:00.000Z');
    expect(zonedTimeToUtc('2026-10-20', '20:00', 'Asia/Tokyo').toISOString()).toBe('2026-10-20T11:00:00.000Z');
  });

  it('follows New York across the end of daylight saving (Nov 1, 2026)', () => {
    expect(zonedTimeToUtc('2026-10-20', '20:00', 'America/New_York').toISOString()).toBe('2026-10-21T00:00:00.000Z');
    expect(zonedTimeToUtc('2026-11-11', '00:00', 'America/New_York').toISOString()).toBe('2026-11-11T05:00:00.000Z');
  });

  it('crosses the date line correctly', () => {
    expect(zonedTimeToUtc('2026-11-11', '00:00', 'Asia/Taipei').toISOString()).toBe('2026-11-10T16:00:00.000Z');
  });

  it('moves a wall time skipped by spring-forward past the gap', () => {
    // 2027-03-14 02:30 does not exist in New York; clocks jump from 02:00 to 03:00 EDT.
    expect(zonedTimeToUtc('2027-03-14', '02:30', 'America/New_York').toISOString()).toBe('2027-03-14T07:30:00.000Z');
  });

  it('rejects malformed input', () => {
    expect(() => zonedTimeToUtc('2026/10/20', '20:00', 'Asia/Taipei')).toThrow(RangeError);
    expect(() => zonedTimeToUtc('2026-10-20', '8pm', 'Asia/Taipei')).toThrow(RangeError);
    expect(() => zonedTimeToUtc('2026-10-20', '20:00', 'Mars/Olympus')).toThrow(RangeError);
  });
});
