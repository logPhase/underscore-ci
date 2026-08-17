/**
 * Seeded force layout for the vocabulary graph — run ONCE, to convergence,
 * deterministically.
 *
 * Force-directed is used here as a LAYOUT ALGORITHM, not live physics. The
 * project's own design principles name the failure mode this avoids: "no
 * jitter, no randomness … the #1 failure of force-directed graph layouts"
 * is a picture that lands differently on every load, so nobody ever forms
 * spatial memory. Same terms in, same picture out — the PRNG is seeded from
 * the term slugs, and the simulation runs a fixed iteration count at build
 * time (a few hundred nodes × 260 iterations is microseconds, not frames).
 *
 * Forces, all conventional: pairwise repulsion, spring attraction along
 * `related` edges, per-capability centroid attraction (what makes bounded
 * contexts VISIBLE as clusters — the DDD context map, emergent), and mild
 * centering. Hand-rolled (~80 lines) rather than a d3-force dependency: the
 * singlefile bundle pays for every import, and determinism is trivial to
 * guarantee when you own the loop.
 */
import type { VocabTerm } from "@/types/vocabulary";

export interface VocabNode {
  slug: string;
  x: number;
  y: number;
  /** Degree (related-edge count) — drives node radius in the view. */
  degree: number;
}

export interface VocabEdge {
  from: string;
  to: string;
}

export interface VocabLayout {
  nodes: VocabNode[];
  edges: VocabEdge[];
  /** Convex hull per capability, for the tinted cluster wash. */
  hulls: { capability: string; points: { x: number; y: number }[] }[];
  width: number;
  height: number;
}

/** Deterministic 32-bit PRNG (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedOf(terms: VocabTerm[]): number {
  let h = 2166136261;
  for (const t of terms) {
    for (let i = 0; i < t.slug.length; i++) {
      h = Math.imul(h ^ t.slug.charCodeAt(i), 16777619);
    }
  }
  return h >>> 0;
}

/** Andrew's monotone chain — hull of a capability's points, padded later by
 *  the view. Fewer than 3 points degrades to the points themselves. */
function hull(pts: { x: number; y: number }[]): { x: number; y: number }[] {
  if (pts.length < 3) return pts;
  const s = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: typeof s[0], a: typeof s[0], b: typeof s[0]) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: typeof s = [];
  for (const p of s) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: typeof s = [];
  for (const p of [...s].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

const ITERATIONS = 260;

export function layoutVocabulary(terms: VocabTerm[]): VocabLayout {
  if (terms.length === 0) {
    return { nodes: [], edges: [], hulls: [], width: 0, height: 0 };
  }
  const random = rng(seedOf(terms));
  const index = new Map(terms.map((t, i) => [t.slug, i]));

  // Edges: explicit `related` references that resolve to a present term,
  // deduped as undirected pairs. A dangling reference is dropped silently —
  // the agent names terms it did not write often enough that failing here
  // would fail most graphs.
  const seen = new Set<string>();
  const edges: VocabEdge[] = [];
  for (const t of terms) {
    for (const r of t.related) {
      if (!index.has(r) || r === t.slug) continue;
      const key = t.slug < r ? `${t.slug}|${r}` : `${r}|${t.slug}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ from: t.slug, to: r });
    }
  }
  const degree = new Map<string, number>();
  for (const e of edges) {
    degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
    degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
  }

  // Initial positions: each capability's terms start in a loose ring around
  // a capability anchor, so convergence is fast and clusters never have to
  // untangle from a uniform soup.
  const capabilities = [...new Set(terms.map(t => t.capability))];
  const capAngle = new Map(capabilities.map((c, i) =>
    [c, (2 * Math.PI * i) / capabilities.length]));
  const R = 90 + 34 * Math.sqrt(terms.length);
  const xs = new Float64Array(terms.length);
  const ys = new Float64Array(terms.length);
  terms.forEach((t, i) => {
    const a = capAngle.get(t.capability)!;
    xs[i] = Math.cos(a) * R * 0.6 + (random() - 0.5) * 80;
    ys[i] = Math.sin(a) * R * 0.6 + (random() - 0.5) * 80;
  });

  const REPULSE = 5200;
  const SPRING = 0.045;
  const SPRING_LEN = 120;
  const CLUSTER = 0.03;
  const CENTER = 0.004;

  for (let it = 0; it < ITERATIONS; it++) {
    // Annealing: forces decay so the picture settles instead of oscillating.
    const damp = 1 - it / ITERATIONS;
    const fx = new Float64Array(terms.length);
    const fy = new Float64Array(terms.length);

    for (let i = 0; i < terms.length; i++) {
      for (let j = i + 1; j < terms.length; j++) {
        let dx = xs[i] - xs[j];
        let dy = ys[i] - ys[j];
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) { dx = 1; dy = 1; d2 = 2; } // coincident guard
        const f = REPULSE / d2;
        const d = Math.sqrt(d2);
        fx[i] += (dx / d) * f; fy[i] += (dy / d) * f;
        fx[j] -= (dx / d) * f; fy[j] -= (dy / d) * f;
      }
    }
    for (const e of edges) {
      const i = index.get(e.from)!;
      const j = index.get(e.to)!;
      const dx = xs[j] - xs[i];
      const dy = ys[j] - ys[i];
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = SPRING * (d - SPRING_LEN);
      fx[i] += (dx / d) * f; fy[i] += (dy / d) * f;
      fx[j] -= (dx / d) * f; fy[j] -= (dy / d) * f;
    }
    // Capability centroids, recomputed per iteration.
    const cx = new Map<string, { x: number; y: number; n: number }>();
    terms.forEach((t, i) => {
      const c = cx.get(t.capability) ?? { x: 0, y: 0, n: 0 };
      c.x += xs[i]; c.y += ys[i]; c.n += 1;
      cx.set(t.capability, c);
    });
    terms.forEach((t, i) => {
      const c = cx.get(t.capability)!;
      fx[i] += (c.x / c.n - xs[i]) * CLUSTER;
      fy[i] += (c.y / c.n - ys[i]) * CLUSTER;
      fx[i] += -xs[i] * CENTER;
      fy[i] += -ys[i] * CENTER;
    });

    for (let i = 0; i < terms.length; i++) {
      xs[i] += Math.max(-14, Math.min(14, fx[i])) * damp;
      ys[i] += Math.max(-14, Math.min(14, fy[i])) * damp;
    }
  }

  // Normalize into a positive-quadrant box with padding.
  const PAD = 90;
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const nodes: VocabNode[] = terms.map((t, i) => ({
    slug: t.slug,
    x: xs[i] - minX + PAD,
    y: ys[i] - minY + PAD,
    degree: degree.get(t.slug) ?? 0,
  }));
  const byCap = new Map<string, { x: number; y: number }[]>();
  terms.forEach((t, i) => {
    const arr = byCap.get(t.capability) ?? [];
    arr.push({ x: nodes[i].x, y: nodes[i].y });
    byCap.set(t.capability, arr);
  });
  return {
    nodes,
    edges,
    hulls: [...byCap.entries()].map(([capability, pts]) =>
      ({ capability, points: hull(pts) })),
    width: Math.max(...nodes.map(n => n.x)) + PAD,
    height: Math.max(...nodes.map(n => n.y)) + PAD,
  };
}
