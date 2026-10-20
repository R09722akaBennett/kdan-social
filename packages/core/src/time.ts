/** The UTC offset of `timeZone` at `at`, in minutes east of UTC. */
function offsetMinutes(timeZone: string, at: Date): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year!, +parts.month! - 1, +parts.day!, +parts.hour!, +parts.minute!, +parts.second!);
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/**
 * The instant at which the wall clock in `timeZone` reads `date` `time`.
 *
 * Offsets change with daylight saving, so the offset read at a first guess can be the
 * wrong one; both candidates are checked. A wall time skipped by a spring-forward gap
 * matches neither and lands on the later candidate, just after the gap.
 *
 * Raises:
 *   RangeError: `date` is not YYYY-MM-DD, `time` is not HH:MM, or `timeZone` is unknown.
 */
export function zonedTimeToUtc(date: string, time: string, timeZone: string): Date {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!d || !t) throw new RangeError(`Expected YYYY-MM-DD and HH:MM, got "${date}" "${time}"`);
  const wall = Date.UTC(+d[1]!, +d[2]! - 1, +d[3]!, +t[1]!, +t[2]!);
  const at = (g: number) => wall - offsetMinutes(timeZone, new Date(g)) * 60_000;
  const first = at(wall);
  const second = at(first);
  // A candidate is right when the offset in force at it maps it back to the wall time.
  if (at(second) === second) return new Date(second);
  if (at(first) === first) return new Date(first);
  return new Date(Math.max(first, second));
}

/** Format an instant as the wall clock in `timeZone`, e.g. "10/20 20:00". */
export function formatInZone(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('zh-TW', { timeZone, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(at);
}
