/** Shared call-graph structure derivation — the ONE source of truth for how
 * a chapter's edges become a rendered tree.
 *
 * Why this exists (PR-589 regression, founder-reported): the old logic lived
 * copy-pasted in four places and rooted the tree at "the first function with
 * no parent". Composed (synth) journeys often carry an entryFqn that
 * participates in ZERO edges — a phantom root — so the rendered "tree" was
 * one lonely node while the real 28-node component sat unreachable ("1 / 29
 * shown"). The graph is in general a FOREST (multiple triggers, async
 * boundaries, cycles); rendering must cover every node.
 */

export interface CgEdge {
  from: string;
  to: string;
}

/** Tolerate both wire shapes: {from,to} objects and [from,to] tuples. */
export function normalizeEdges(raw: unknown[]): CgEdge[] {
  const out: CgEdge[] = [];
  for (const e of raw || []) {
    if (!e) continue;
    if (typeof e === "object" && "from" in (e as object)) {
      const o = e as CgEdge;
      if (o.from && o.to) out.push({ from: o.from, to: o.to });
    } else if (Array.isArray(e) && e[0] && e[1]) {
      out.push({ from: e[0], to: e[1] });
    }
  }
  return out;
}

/** Deduped child map + parent set. Multiple edges between the same pair
 * (an interface called on two code paths) must not become two children. */
export function buildChildMap(edges: CgEdge[]): {
  childMap: Map<string, string[]>;
  hasParent: Set<string>;
} {
  const childMap = new Map<string, string[]>();
  const hasParent = new Set<string>();
  const seen = new Set<string>();
  for (const e of edges) {
    const key = e.from + "" + e.to;
    if (seen.has(key)) continue;
    seen.add(key);
    const kids = childMap.get(e.from);
    if (kids) kids.push(e.to);
    else childMap.set(e.from, [e.to]);
    hasParent.add(e.to);
  }
  return { childMap, hasParent };
}

/** Every root needed to cover the whole graph, in render order:
 *  1. CONNECTED parentless nodes (participate in edges, no incoming) —
 *     in `functions` order, so the entry point leads when it's real.
 *  2. Cycle cover: while unvisited connected nodes remain, the first one
 *     becomes a root (a cycle has no parentless member).
 *  3. ISOLATED functions (no edges at all) LAST — a phantom entryFqn can
 *     never shadow the actual graph again.
 */
export function deriveRoots(functions: string[], edges: CgEdge[]): string[] {
  const { childMap, hasParent } = buildChildMap(edges);
  const inEdges = new Set<string>();
  for (const e of edges) {
    inEdges.add(e.from);
    inEdges.add(e.to);
  }
  // Preserve functions order; append edge-only nodes not listed in functions.
  const ordered = [...new Set([...functions.filter(Boolean), ...inEdges])];

  const roots: string[] = [];
  const visited = new Set<string>();
  const visit = (n: string) => {
    const stack = [n];
    while (stack.length) {
      const cur = stack.pop()!;
      if (visited.has(cur)) continue;
      visited.add(cur);
      for (const c of childMap.get(cur) || []) stack.push(c);
    }
  };

  for (const f of ordered) {
    if (inEdges.has(f) && !hasParent.has(f) && !visited.has(f)) {
      roots.push(f);
      visit(f);
    }
  }
  for (const f of ordered) {
    // leftover connected nodes = cycles with no parentless member
    if (inEdges.has(f) && !visited.has(f)) {
      roots.push(f);
      visit(f);
    }
  }
  for (const f of ordered) {
    if (!inEdges.has(f) && !visited.has(f)) {
      visited.add(f);
      roots.push(f);
    }
  }
  return roots;
}

/** child → tree-parent, mirroring exactly the DFS order the chart renders
 * with (roots in deriveRoots order, shared visited set). Used by
 * expandPath/ancestry so "expand to reveal X" always matches the picture. */
export function deriveTreeParents(
  functions: string[],
  edges: CgEdge[]
): Map<string, string> {
  const { childMap } = buildChildMap(edges);
  const roots = deriveRoots(functions, edges);
  const parent = new Map<string, string>();
  const visited = new Set<string>();
  const dfs = (n: string) => {
    visited.add(n);
    for (const c of childMap.get(n) || []) {
      if (visited.has(c)) continue;
      parent.set(c, n);
      dfs(c);
    }
  };
  for (const r of roots) if (!visited.has(r)) dfs(r);
  return parent;
}

/** Simple method name of an FQN (args stripped). */
export function simpleName(fqn: string): string {
  const noArgs = (fqn || "").replace(/\(.*$/, "");
  return noArgs.split(".").pop() || noArgs;
}

/** Declaring class simple name of an FQN. */
export function simpleClass(fqn: string): string {
  const noArgs = (fqn || "").replace(/\(.*$/, "");
  const parts = noArgs.split(".");
  return parts.length >= 2 ? parts[parts.length - 2] : "";
}

/** Heuristic successor for a method REMOVED in this PR: an ADDED step with
 * the same method name — same class strongly preferred, then same file.
 * Returns null when ambiguous or absent (the UI then says so honestly).
 * NOTE: exact rename mapping (`:old-fqn`) exists in the analysis pipeline
 * but is not exported to the payload yet — when it ships, prefer it here. */
export function findReplacement(
  deletedFqn: string,
  steps: { fqn: string; prStatus?: string | null; file?: string | null }[],
  deletedFile?: string | null
): string | null {
  const name = simpleName(deletedFqn).toLowerCase();
  const cls = simpleClass(deletedFqn).toLowerCase();
  const added = steps.filter(
    (s) => s.fqn && s.prStatus === "added" && s.fqn !== deletedFqn
  );
  const sameName = added.filter(
    (s) => simpleName(s.fqn).toLowerCase() === name
  );
  if (sameName.length === 1) return sameName[0].fqn;
  const sameClass = sameName.filter(
    (s) => simpleClass(s.fqn).toLowerCase() === cls
  );
  if (sameClass.length === 1) return sameClass[0].fqn;
  if (deletedFile) {
    const sameFile = sameName.filter((s) => s.file === deletedFile);
    if (sameFile.length === 1) return sameFile[0].fqn;
  }
  return null;
}

/** Arg-tolerant lookup index over the global calls map: BPMN `code_fqns`
 * arrive WITHOUT parameter lists while `calls`/`methods` keys carry them —
 * a plain calls[fqn] read misses everything (observed: 20 code_fqns,
 * 0 resolved). Index by the argless form once and resolve either shape. */
export function buildArglessIndex(
  keys: Iterable<string>
): Map<string, string[]> {
  const idx = new Map<string, string[]>();
  for (const k of keys) {
    const bare = k.replace(/\(.*$/, "");
    const list = idx.get(bare);
    if (list) list.push(k);
    else idx.set(bare, [k]);
  }
  return idx;
}

export function resolveFqns(
  fqnLike: string,
  exact: (fqn: string) => boolean,
  arglessIndex: Map<string, string[]>
): string[] {
  if (exact(fqnLike)) return [fqnLike];
  const bare = fqnLike.replace(/\(.*$/, "");
  return arglessIndex.get(bare) || [];
}
