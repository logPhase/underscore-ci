// Pure derivations for the redesigned repo-hub front page — everything the
// design's data slots need, computed from the real manifest payloads
// (architecture / specs / prs). Kept out of the component so each is
// unit-testable.

import type { ArchitecturePayload } from "@/types/architecture";
import type { RepoManifestPr } from "@/types/repo-manifest";
import type { SpecHistoryEvent, SpecsPayload } from "@/types/specs";
import { splitSpecBlocks } from "@/lib/specs/ears";

// ── hero stats ───────────────────────────────────────────────────────────

export interface HeroStat {
  value: number;
  label: string;
}

/** The hero stat strip. Containers = deployable/infra units (service,
 *  datastore, topic); components = kind 'component'; integrations = edges.
 *  Zero-valued entries are dropped (a repo without architecture still gets
 *  capabilities + PRs). */
export function heroStats(
  arch: ArchitecturePayload | null | undefined,
  specs: SpecsPayload | null | undefined,
  prs: RepoManifestPr[],
): HeroStat[] {
  const nodes = arch?.nodes ?? [];
  const containers = nodes.filter((n) =>
    ["service", "datastore", "topic"].includes(n.kind)).length;
  const components = nodes.filter((n) => n.kind === "component").length;
  const out: HeroStat[] = [
    { value: containers, label: "containers" },
    { value: components, label: "components" },
    { value: (arch?.edges ?? []).length, label: "integrations" },
    { value: (specs?.specs ?? []).length, label: "capabilities" },
    { value: prs.length, label: "pull requests" },
  ];
  return out.filter((s) => s.value > 0);
}

// ── EARS requirement kind ────────────────────────────────────────────────

export type EarsKind =
  | "ubiquitous"
  | "event-driven"
  | "state-driven"
  | "unwanted behaviour"
  | "optional feature";

/** Standard EARS classification from the requirement's leading keyword. */
export function classifyEars(text: string): EarsKind {
  // Classification only — markdown emphasis/heading chars never affect the
  // EARS keyword, so strip them wholesale before matching.
  const t = text.replace(/[*_#>`]/g, "").trimStart().toLowerCase();
  if (t.startsWith("when ")) return "event-driven";
  if (t.startsWith("while ")) return "state-driven";
  if (t.startsWith("if ")) return "unwanted behaviour";
  if (t.startsWith("where ")) return "optional feature";
  return "ubiquitous";
}

/** Total live REQ blocks across every spec. */
export function liveRequirementCount(specs: SpecsPayload | null | undefined): number {
  let n = 0;
  for (const sp of specs?.specs ?? [])
    n += splitSpecBlocks(sp.content).filter((b) => b.kind === "req").length;
  return n;
}

// ── capability weekly activity cells ─────────────────────────────────────

export interface WeekCell {
  /** 0 = no activity; else the dominant operation that week. */
  op: string | null;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** `weeks` cells, oldest → newest, for one capability's history. The last
 *  cell is the current week. Deletion outranks creation outranks update
 *  within a week (loudest signal wins). `now` injected for determinism. */
export function weeklyCells(
  events: SpecHistoryEvent[],
  weeks: number,
  now: number,
): WeekCell[] {
  const rank = (op: string) =>
    op === "deleted" ? 3 : op === "created" ? 2 : 1;
  const cells: (string | null)[] = Array.from({ length: weeks }, () => null);
  for (const e of events) {
    const at = Date.parse(e.at);
    if (Number.isNaN(at)) continue;
    const back = Math.floor((now - at) / WEEK_MS);
    if (back < 0 || back >= weeks) continue;
    const idx = weeks - 1 - back;
    if (cells[idx] === null || rank(e.operation) > rank(cells[idx]!))
      cells[idx] = e.operation;
  }
  return cells.map((op) => ({ op }));
}

/** History events in the trailing 7 days whose op counts as a revision. */
export function revisedThisWeek(history: SpecHistoryEvent[], now: number): number {
  return history.filter((e) => {
    const at = Date.parse(e.at);
    return !Number.isNaN(at) && now - at < WEEK_MS;
  }).length;
}

// ── pull-request grouping + search ───────────────────────────────────────

export interface PrDayGroup {
  label: string;
  prs: RepoManifestPr[];
}

function dayLabel(iso: string, now: number): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return "earlier";
  const days = Math.floor((now - at) / (24 * 60 * 60 * 1000));
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return "this week";
  if (days < 31) return "this month";
  return "earlier";
}

/** Filter by a free-text query (number, title, branch, author) then group by
 *  recency bucket, newest first — the design's TODAY / YESTERDAY rails. */
export function groupPrs(
  prs: RepoManifestPr[],
  query: string,
  now: number,
): PrDayGroup[] {
  const q = query.trim().toLowerCase();
  const hit = (p: RepoManifestPr) =>
    !q ||
    String(p.number ?? "").includes(q.replace(/^#/, "")) ||
    p.title.toLowerCase().includes(q) ||
    (p.branch ?? "").toLowerCase().includes(q) ||
    (p.author ?? "").toLowerCase().includes(q);
  const sorted = [...prs]
    .filter(hit)
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  const groups: PrDayGroup[] = [];
  for (const p of sorted) {
    const label = dayLabel(p.updatedAt ?? "", now);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.prs.push(p);
    else groups.push({ label, prs: [p] });
  }
  return groups;
}

// ── activity rail ────────────────────────────────────────────────────────

export interface ActivityItem {
  kind: "pull request" | "specification";
  text: string;
  at: string;
}

/** The right-rail feed: PR analyses + spec revisions merged, newest first. */
export function buildActivity(
  prs: RepoManifestPr[],
  history: SpecHistoryEvent[],
  cap: number,
): ActivityItem[] {
  const items: ActivityItem[] = [];
  for (const p of prs) {
    if (!p.updatedAt) continue;
    items.push({ kind: "pull request", at: p.updatedAt,
                 text: `#${p.number ?? "?"} analyzed — ${p.title}` });
  }
  for (const e of history) {
    const cap_ = e.capability.replace(/[-_]+/g, " ");
    items.push({ kind: "specification", at: e.at,
                 text: `${cap_} ${e.operation === "deleted" ? "superseded" : e.operation}` });
  }
  return items
    .filter((i) => !Number.isNaN(Date.parse(i.at)))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, cap);
}
