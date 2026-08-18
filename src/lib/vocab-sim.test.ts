import { describe, expect, it } from "vitest";
import { VocabSim, vocabEdges } from "./vocab-sim";
import type { VocabTerm } from "@/types/vocabulary";

/**
 * The physics is LIVE now (the Obsidian-style graph — an explicit product
 * decision), but the properties that made the old build-time layout
 * admissible still hold: seeded initial positions + fixed timestep + a
 * seeded jiggle mean an un-touched simulation settles into the SAME
 * picture for the same terms, every load. These tests pin that, the
 * graph-shaping rules, and the drag (pin/reheat) contract.
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

const positions = (s: VocabSim) =>
  JSON.stringify(s.nodes.map((n) => [n.slug, n.x.toFixed(6), n.y.toFixed(6)]));

describe("vocabEdges", () => {
  it("dedupes related references into undirected edges and drops dangling ones", () => {
    const edges = vocabEdges([term("a", "x", ["b", "ghost"]), term("b", "x", ["a"])]);
    expect(edges).toHaveLength(1);
  });
});

describe("VocabSim", () => {
  it("settles deterministically: same terms, identical resting picture", () => {
    const a = new VocabSim(SAMPLE);
    const b = new VocabSim(SAMPLE);
    a.settle();
    b.settle();
    expect(a.hot).toBe(false);
    expect(positions(a)).toBe(positions(b));
  });

  it("changes when the term set changes (seed is the data, not a constant)", () => {
    const a = new VocabSim(SAMPLE);
    const b = new VocabSim([...SAMPLE, term("tariff", "pricing")]);
    a.settle();
    b.settle();
    const at = (s: VocabSim, slug: string) => {
      const n = s.node(slug)!;
      return `${n.x},${n.y}`;
    };
    expect(at(a, "mandate")).not.toBe(at(b, "mandate"));
  });

  it("clusters a capability's terms nearer each other than to other capabilities", () => {
    const s = new VocabSim(SAMPLE);
    s.settle();
    const d = (p: string, q: string) => {
      const a = s.node(p)!;
      const b = s.node(q)!;
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    expect(d("occupancy-window", "rising-edge")).toBeLessThan(d("occupancy-window", "fact"));
    expect(d("screening-library", "fact")).toBeLessThan(d("screening-library", "linger-window"));
  });

  it("computes degree from the deduped edges", () => {
    const s = new VocabSim(SAMPLE);
    expect(s.node("occupancy-window")!.degree).toBe(2);
    expect(s.node("mandate")!.degree).toBe(0);
  });

  it("a pinned node tracks its pin exactly; unpinning frees it back to the physics", () => {
    const s = new VocabSim(SAMPLE);
    s.settle();
    s.pin("mandate", 999, -999);
    s.reheat();
    s.tick();
    expect(s.node("mandate")!.x).toBe(999);
    expect(s.node("mandate")!.y).toBe(-999);
    s.unpin("mandate");
    s.cool();
    s.settle();
    // Released: the spring field pulls it back off the pin point.
    expect(Math.hypot(s.node("mandate")!.x - 999, s.node("mandate")!.y + 999)).toBeGreaterThan(50);
  });

  it("reheat makes a resting sim hot again; cool lets it rest", () => {
    const s = new VocabSim(SAMPLE);
    s.settle();
    expect(s.hot).toBe(false);
    s.reheat();
    expect(s.hot).toBe(true);
    s.cool();
    s.settle();
    expect(s.hot).toBe(false);
  });

  it("handles the empty and single-term payloads", () => {
    const empty = new VocabSim([]);
    expect(empty.tick()).toBe(false);
    const solo = new VocabSim([term("solo", "x")]);
    solo.settle();
    expect(solo.nodes).toHaveLength(1);
    expect(Number.isFinite(solo.nodes[0].x)).toBe(true);
  });
});
