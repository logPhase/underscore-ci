/**
 * Live force simulation for the vocabulary graph — the Obsidian-style
 * floating graph, by explicit product decision (2026-08-18): the founder
 * wants the vocabulary to read like Obsidian's graph view, nodes drifting
 * into place and pulling their neighbours elastically when dragged.
 *
 * The determinism principle survives the physics going live: initial
 * positions are seeded from the term slugs (mulberry32), every tick uses a
 * fixed timestep, and the only randomness (the coincident-node jiggle)
 * draws from the same seeded PRNG — so with no interaction, the same terms
 * settle into the same picture on every load. Interaction (drag) reheats
 * the simulation d3-style via an alpha target; release lets it cool back
 * to rest.
 *
 * Hand-rolled rather than a d3-force dependency, like the build-time
 * layout it replaces: the singlefile bundle pays for every import, and
 * determinism is trivial to guarantee when you own the loop.
 */
import type { VocabTerm } from "@/types/vocabulary";

export interface SimNode {
  slug: string;
  capability: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Pin (drag) target — while set, the node tracks it exactly. */
  fx: number | null;
  fy: number | null;
  /** Related-edge count — drives node radius in the view. */
  degree: number;
}

export interface SimEdge {
  from: string;
  to: string;
  /** Node-array indices, precomputed once. */
  i: number;
  j: number;
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

/** Undirected, deduped `related` edges among PRESENT terms. A dangling
 *  reference is dropped silently — the agent names terms it did not write
 *  often enough that failing here would fail most graphs. */
export function vocabEdges(terms: VocabTerm[]): { from: string; to: string }[] {
  const index = new Set(terms.map((t) => t.slug));
  const seen = new Set<string>();
  const edges: { from: string; to: string }[] = [];
  for (const t of terms) {
    for (const r of t.related) {
      if (!index.has(r) || r === t.slug) continue;
      const key = t.slug < r ? `${t.slug}|${r}` : `${r}|${t.slug}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ from: t.slug, to: r });
    }
  }
  return edges;
}

// d3-force-shaped cooling: alpha eases toward alphaTarget each tick; the
// sim is "at rest" when alpha dips under ALPHA_MIN with no target set.
const ALPHA_DECAY = 0.028;
const ALPHA_MIN = 0.003;
const VELOCITY_KEEP = 0.6; // v *= 0.6 per tick (d3 velocityDecay 0.4)
const MAX_STEP = 14;

const REPULSE = 5200;
const SPRING = 0.05;
const SPRING_LEN = 110;
const CLUSTER = 0.025;
const CENTER = 0.006;

export class VocabSim {
  readonly nodes: SimNode[];
  readonly edges: SimEdge[];
  alpha = 1;
  alphaTarget = 0;
  private readonly random: () => number;
  private readonly bySlug: Map<string, SimNode>;

  constructor(terms: VocabTerm[]) {
    this.random = rng(seedOf(terms));

    const raw = vocabEdges(terms);
    const degree = new Map<string, number>();
    for (const e of raw) {
      degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
      degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
    }

    // Initial positions: each capability's terms start in a loose ring
    // around a capability anchor — clusters unfurl instead of untangling
    // from a uniform soup. Coordinates are CENTERED on the origin; the
    // view owns pan/zoom.
    const capabilities = [...new Set(terms.map((t) => t.capability))];
    const capAngle = new Map(
      capabilities.map((c, i) => [c, (2 * Math.PI * i) / capabilities.length]),
    );
    const R = 90 + 34 * Math.sqrt(terms.length);
    this.nodes = terms.map((t) => {
      const a = capAngle.get(t.capability)!;
      return {
        slug: t.slug,
        capability: t.capability,
        x: Math.cos(a) * R * 0.6 + (this.random() - 0.5) * 80,
        y: Math.sin(a) * R * 0.6 + (this.random() - 0.5) * 80,
        vx: 0,
        vy: 0,
        fx: null,
        fy: null,
        degree: degree.get(t.slug) ?? 0,
      };
    });
    this.bySlug = new Map(this.nodes.map((n) => [n.slug, n]));
    const index = new Map(terms.map((t, i) => [t.slug, i]));
    this.edges = raw.map((e) => ({
      ...e,
      i: index.get(e.from)!,
      j: index.get(e.to)!,
    }));
  }

  node(slug: string): SimNode | undefined {
    return this.bySlug.get(slug);
  }

  /** True while the simulation still wants animation frames. */
  get hot(): boolean {
    return this.alpha >= ALPHA_MIN || this.alphaTarget > 0;
  }

  /** Reheat (drag start / programmatic nudge). While `target` > 0 the sim
   *  simmers instead of cooling — call `cool()` to let it settle again. */
  reheat(target = 0.3): void {
    this.alphaTarget = target;
    if (this.alpha < target) this.alpha = target;
  }

  cool(): void {
    this.alphaTarget = 0;
  }

  pin(slug: string, x: number, y: number): void {
    const n = this.bySlug.get(slug);
    if (n) {
      n.fx = x;
      n.fy = y;
    }
  }

  unpin(slug: string): void {
    const n = this.bySlug.get(slug);
    if (n) {
      n.fx = null;
      n.fy = null;
    }
  }

  /** One fixed-timestep tick. Returns `hot` so a rAF loop can stop. */
  tick(): boolean {
    const N = this.nodes.length;
    if (N === 0) return false;
    this.alpha += (this.alphaTarget - this.alpha) * ALPHA_DECAY;
    const a = this.alpha;

    const fx = new Float64Array(N);
    const fy = new Float64Array(N);

    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        let dx = this.nodes[i].x - this.nodes[j].x;
        let dy = this.nodes[i].y - this.nodes[j].y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) {
          // Coincident guard — deterministic jiggle from the seeded PRNG.
          dx = this.random() - 0.5;
          dy = this.random() - 0.5;
          d2 = dx * dx + dy * dy + 0.5;
        }
        const f = REPULSE / d2;
        const d = Math.sqrt(d2);
        fx[i] += (dx / d) * f;
        fy[i] += (dy / d) * f;
        fx[j] -= (dx / d) * f;
        fy[j] -= (dy / d) * f;
      }
    }
    for (const e of this.edges) {
      const ni = this.nodes[e.i];
      const nj = this.nodes[e.j];
      const dx = nj.x - ni.x;
      const dy = nj.y - ni.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = SPRING * (d - SPRING_LEN);
      fx[e.i] += (dx / d) * f;
      fy[e.i] += (dy / d) * f;
      fx[e.j] -= (dx / d) * f;
      fy[e.j] -= (dy / d) * f;
    }
    // Capability centroids — the emergent DDD context map — plus mild
    // centering so free clusters never drift off-canvas.
    const cx = new Map<string, { x: number; y: number; n: number }>();
    for (const n of this.nodes) {
      const c = cx.get(n.capability) ?? { x: 0, y: 0, n: 0 };
      c.x += n.x;
      c.y += n.y;
      c.n += 1;
      cx.set(n.capability, c);
    }
    this.nodes.forEach((n, i) => {
      const c = cx.get(n.capability)!;
      fx[i] += (c.x / c.n - n.x) * CLUSTER;
      fy[i] += (c.y / c.n - n.y) * CLUSTER;
      fx[i] += -n.x * CENTER;
      fy[i] += -n.y * CENTER;
    });

    this.nodes.forEach((n, i) => {
      if (n.fx != null && n.fy != null) {
        // Pinned (dragged): track the pointer exactly, carry no velocity.
        n.x = n.fx;
        n.y = n.fy;
        n.vx = 0;
        n.vy = 0;
        return;
      }
      n.vx = (n.vx + fx[i] * a) * VELOCITY_KEEP;
      n.vy = (n.vy + fy[i] * a) * VELOCITY_KEEP;
      n.x += Math.max(-MAX_STEP, Math.min(MAX_STEP, n.vx));
      n.y += Math.max(-MAX_STEP, Math.min(MAX_STEP, n.vy));
    });

    return this.hot;
  }

  /** Run to rest synchronously (reduced-motion boot; tests). Capped. */
  settle(maxTicks = 600): void {
    for (let i = 0; i < maxTicks && this.tick(); i++) {
      /* ticking */
    }
  }
}
