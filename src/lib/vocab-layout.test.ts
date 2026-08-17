import { describe, expect, it } from "vitest";
import { layoutVocabulary } from "./vocab-layout";
import type { VocabTerm } from "@/types/vocabulary";

/**
 * The property that makes a force layout admissible here at all is
 * DETERMINISM — same terms, same picture, every load (spatial stability is
 * a stated design principle, and live-physics layouts are its named #1
 * failure). These tests pin that, plus the graph-shaping rules.
 */
const term = (slug: string, capability: string, related: string[] = []): VocabTerm => ({
  name: slug, slug, capability, definition: "d", code: [], business: "",
  journeys: [], related, notes: [],
});

const SAMPLE = [
  term("occupancy-window", "barrier", ["rising-edge", "linger-window"]),
  term("rising-edge", "barrier", ["occupancy-window"]),
  term("linger-window", "barrier"),
  term("screening-library", "screening", ["fact"]),
  term("fact", "screening", ["provenance"]),
  term("provenance", "screening"),
  term("mandate", "deals"),
];

describe("layoutVocabulary", () => {
  it("is deterministic: same terms, byte-identical layout", () => {
    const a = layoutVocabulary(SAMPLE);
    const b = layoutVocabulary(SAMPLE);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("changes when the term set changes (seed is the data, not a constant)", () => {
    const a = layoutVocabulary(SAMPLE);
    const b = layoutVocabulary([...SAMPLE, term("tariff", "pricing")]);
    const pos = (l: typeof a, s: string) => l.nodes.find(n => n.slug === s)!;
    // Not a guarantee for every node, but the layouts must not be identical.
    expect(JSON.stringify(pos(a, "mandate"))).not.toBe(JSON.stringify(pos(b, "mandate")));
  });

  it("dedupes related references into undirected edges and drops dangling ones", () => {
    // occupancy<->rising is declared from BOTH sides: one edge. A reference
    // to an absent term must not produce an edge or a crash.
    const l = layoutVocabulary([
      term("a", "x", ["b", "ghost"]),
      term("b", "x", ["a"]),
    ]);
    expect(l.edges).toHaveLength(1);
  });

  it("clusters a capability's terms nearer each other than to other capabilities", () => {
    const l = layoutVocabulary(SAMPLE);
    const at = new Map(l.nodes.map(n => [n.slug, n]));
    const d = (p: string, q: string) =>
      Math.hypot(at.get(p)!.x - at.get(q)!.x, at.get(p)!.y - at.get(q)!.y);
    // Intra-cluster distance beats cross-cluster — the emergent context map.
    expect(d("occupancy-window", "rising-edge")).toBeLessThan(d("occupancy-window", "fact"));
    expect(d("screening-library", "fact")).toBeLessThan(d("screening-library", "linger-window"));
  });

  it("emits one hull per capability and keeps every node in-bounds", () => {
    const l = layoutVocabulary(SAMPLE);
    expect(l.hulls.map(h => h.capability).sort()).toEqual(["barrier", "deals", "screening"]);
    for (const n of l.nodes) {
      expect(n.x).toBeGreaterThan(0);
      expect(n.y).toBeGreaterThan(0);
      expect(n.x).toBeLessThan(l.width);
      expect(n.y).toBeLessThan(l.height);
    }
  });

  it("handles the empty and single-term payloads", () => {
    expect(layoutVocabulary([])).toEqual({ nodes: [], edges: [], hulls: [], width: 0, height: 0 });
    expect(layoutVocabulary([term("solo", "x")]).nodes).toHaveLength(1);
  });
});
