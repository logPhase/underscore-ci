/** A timestamp → milliseconds since epoch, or null if unrecognized.
 *  Handles the two shapes specs data carries: ISO 8601 (`SpecHistoryEvent.at`,
 *  the analyzer's format) and the backend's compact run-id UTC stamp
 *  (`20260612-110632`, see runs.clj). */
function parseTimestamp(ts: string): number | null {
  const compact = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/.exec(ts);
  if (compact) {
    const [, y, mo, d, h, mi, s] = compact;
    return Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
  }
  const parsed = Date.parse(ts);
  return Number.isNaN(parsed) ? null : parsed;
}

/** Human relative time for a spec event. Ported from the desktop's
 *  library.tsx relativeTime, widened to accept the ISO timestamps the specs
 *  history uses (the desktop original only parsed the compact run-id form).
 *  Falls back to the raw string when a value parses to neither. */
export function relativeTime(ts: string | null | undefined): string {
  if (!ts) return "";
  const then = parseTimestamp(ts);
  if (then === null) return ts;
  const mins = Math.floor((Date.now() - then) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 60 * 24) return `${Math.floor(mins / 60)}h ago`;
  if (mins < 60 * 24 * 14) return `${Math.floor(mins / (60 * 24))}d ago`;
  return new Date(then).toISOString().slice(0, 10);
}
