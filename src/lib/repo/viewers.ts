// Multi-repo viewer links — the hosted tree's viewers.json (maintained by the
// publish flow) lists every repo viewer sharing this host:
//   [{"name": "IRIS.VAS", "href": "/underscore/"}, {"name": "IRIS", "href": "/iris-underscore/"}]
// The hub renders these as a repo switcher; the entry whose href prefixes the
// current pathname is the ACTIVE repo.

export interface RepoViewer {
  name: string;
  href: string;
}

/** Parse + resolve the switcher model: entries in file order, `active` marked
 *  by longest-prefix match of `pathname` (longest wins so `/underscore-x/`
 *  never claims `/underscore/`'s pages). Junk entries are dropped; returns []
 *  when nothing usable — the switcher simply doesn't render. */
export function resolveViewerLinks(
  raw: unknown,
  pathname: string,
): (RepoViewer & { active: boolean })[] {
  if (!Array.isArray(raw)) return [];
  const viewers = raw.filter(
    (v): v is RepoViewer =>
      !!v && typeof v === "object" &&
      typeof (v as RepoViewer).name === "string" &&
      typeof (v as RepoViewer).href === "string" &&
      (v as RepoViewer).href.length > 0,
  );
  let activeHref: string | null = null;
  for (const v of viewers) {
    if (pathname.startsWith(v.href) &&
        (activeHref === null || v.href.length > activeHref.length))
      activeHref = v.href;
  }
  return viewers.map((v) => ({ ...v, active: v.href === activeHref }));
}

/** Fetch ./viewers.json from the served root — absent (single-viewer hosts,
 *  file:// artifacts) or malformed simply means no switcher. Never throws. */
export async function fetchViewers(): Promise<RepoViewer[] | null> {
  try {
    const res = await fetch("./viewers.json");
    if (!res.ok) return null;
    const raw = await res.json();
    return Array.isArray(raw) ? (raw as RepoViewer[]) : null;
  } catch {
    return null;
  }
}

// ── portfolio overview — one card's numbers per integrated repo ──────────

export interface ViewerOverview {
  repo: string;
  generatedAt: string | undefined;
  components: number;
  capabilities: number;
  prs: number;
  latestPr: { number?: number; title: string; updatedAt?: string } | null;
}

/** The portfolio-card numbers from a repo-manifest.json payload. Tolerant of
 *  missing sections (a repo seeded before architecture existed still gets a
 *  card); null only when the payload isn't a manifest at all. */
export function manifestOverview(raw: unknown): ViewerOverview | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  if (typeof m.repo !== "string") return null;
  const arch = (m.architecture ?? {}) as { nodes?: unknown[] };
  const specs = (m.specs ?? {}) as { specs?: unknown[] };
  const prs = Array.isArray(m.prs) ? (m.prs as Record<string, unknown>[]) : [];
  const newest = [...prs].sort((a, b) =>
    String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")))[0];
  return {
    repo: m.repo,
    generatedAt: typeof m.generatedAt === "string" ? m.generatedAt : undefined,
    components: Array.isArray(arch.nodes) ? arch.nodes.length : 0,
    capabilities: Array.isArray(specs.specs) ? specs.specs.length : 0,
    prs: prs.length,
    latestPr: newest
      ? {
          number: typeof newest.number === "number" ? newest.number : undefined,
          title: String(newest.title ?? ""),
          updatedAt:
            typeof newest.updatedAt === "string" ? newest.updatedAt : undefined,
        }
      : null,
  };
}

/** Fetch a sibling viewer's manifest overview (same host, its path prefix).
 *  null on any failure — auth walls or older branches without a manifest
 *  degrade to a minimal open-only card, never an error. */
export async function fetchViewerOverview(
  href: string,
): Promise<ViewerOverview | null> {
  try {
    const base = href.endsWith("/") ? href : `${href}/`;
    const res = await fetch(`${base}repo-manifest.json`);
    if (!res.ok) return null;
    return manifestOverview(await res.json());
  } catch {
    return null;
  }
}
