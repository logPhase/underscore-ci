import type { RepoManifest } from "@/types/repo-manifest";

/** Same inline-tag contract as the report payload (see use-analysis-store):
 *  the singlefile HUB variant inlines the manifest JSON into this script tag;
 *  a multi-file / dev build fetches ./repo-manifest.json instead. */
const INLINE_MANIFEST_ID = "underscore-repo-manifest";

/** Probe for a repo-level manifest at the served root. Returns the parsed
 *  manifest when this deployment is a repo HUB, or null when it is a plain
 *  single-report deployment (no manifest → the viewer boots the report flow).
 *  Never throws — a 404, a file:// fetch failure, or malformed JSON all mean
 *  "not a hub", which must degrade silently to single-report mode. */
export async function fetchRepoManifest(): Promise<RepoManifest | null> {
  const embedded = document
    .getElementById(INLINE_MANIFEST_ID)
    ?.textContent?.trim();
  if (embedded && embedded.startsWith("{")) {
    try {
      return normalize(JSON.parse(embedded));
    } catch {
      return null;
    }
  }
  try {
    const res = await fetch("./repo-manifest.json");
    if (!res.ok) return null;
    const raw = await res.json();
    return normalize(raw);
  } catch {
    return null;
  }
}

/** A manifest is only usable if it names a repo and carries a PR array. */
function normalize(raw: unknown): RepoManifest | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Partial<RepoManifest>;
  if (typeof m.repo !== "string" || !Array.isArray(m.prs)) return null;
  return {
    schema: m.schema,
    repo: m.repo,
    repoUrl: m.repoUrl ?? null,
    generatedAt: m.generatedAt,
    architecture: m.architecture ?? null,
    specs: m.specs ?? null,
    prs: m.prs,
  };
}
