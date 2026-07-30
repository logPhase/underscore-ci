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
