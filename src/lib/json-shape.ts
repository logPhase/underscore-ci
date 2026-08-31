/**
 * json-shape — flatten a payload-shaped JSON value into renderable lines,
 * each carrying its dot-path so the state pane can highlight the paths a
 * step writes. Pure; the StepIO component owns all styling.
 *
 * Paths: object keys join with "." ("company.score"); array elements index
 * as "rows[0]". A write declared as "events[].weight" (any-index) matches
 * every concrete index.
 */

export interface JsonLine {
  /** Dot-path of this line's value; "" for the root. */
  path: string;
  depth: number;
  /** Key as written ("score"), array index ("[2]"), or "" at the root. */
  key: string;
  /** Rendered value: a primitive literal, "{"/"[" for openers, "}"/"]" for
   *  closers, or "… N more" for a capped array tail. */
  text: string;
  /** Structural role — closers and cap lines never match write paths. */
  kind: "value" | "open" | "close" | "cap";
}

const ARRAY_CAP = 4;

function primitiveText(v: unknown): string {
  if (typeof v === "string") return JSON.stringify(v);
  return String(v);
}

export function jsonLines(
  value: unknown,
  path = "",
  depth = 0,
  key = ""
): JsonLine[] {
  if (Array.isArray(value)) {
    const out: JsonLine[] = [
      { path, depth, key, text: "[", kind: "open" },
    ];
    const shown = value.length > ARRAY_CAP ? value.slice(0, ARRAY_CAP - 1) : value;
    shown.forEach((v, i) =>
      out.push(...jsonLines(v, `${path}[${i}]`, depth + 1, `[${i}]`))
    );
    if (value.length > ARRAY_CAP)
      out.push({
        path,
        depth: depth + 1,
        key: "",
        text: `… ${value.length - (ARRAY_CAP - 1)} more`,
        kind: "cap",
      });
    out.push({ path, depth, key: "", text: "]", kind: "close" });
    return out;
  }
  if (value !== null && typeof value === "object") {
    const out: JsonLine[] = [
      { path, depth, key, text: "{", kind: "open" },
    ];
    for (const [k, v] of Object.entries(value as Record<string, unknown>))
      out.push(...jsonLines(v, path ? `${path}.${k}` : k, depth + 1, k));
    out.push({ path, depth, key: "", text: "}", kind: "close" });
    return out;
  }
  return [{ path, depth, key, text: primitiveText(value), kind: "value" }];
}

/** Strip concrete indices so "events[2].weight" compares against a write
 *  declared as "events[].weight" (and "events[2]" against "events[]"). */
function normalized(path: string): string {
  return path.replace(/\[\d+\]/g, "[]");
}

export type WriteMatch = "hit" | "contains" | null;

/**
 * How a line relates to the declared write paths:
 *  - "hit": the line IS a written path or lives inside one — this value is
 *    modified by the step.
 *  - "contains": an ancestor of a written path — the container holds a
 *    write somewhere below (soft cue so the eye descends).
 */
export function matchPaths(path: string, declared: string[]): WriteMatch {
  if (!path || declared.length === 0) return null;
  const p = normalized(path);
  for (const raw of declared) {
    const w = normalized(raw.trim());
    if (!w) continue;
    if (p === w || p.startsWith(`${w}.`) || p.startsWith(`${w}[`))
      return "hit";
    if (w.startsWith(`${p}.`) || w.startsWith(`${p}[`)) return "contains";
  }
  return null;
}
