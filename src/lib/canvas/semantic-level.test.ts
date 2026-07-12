import { describe, expect, it } from "vitest";

import { nextSemanticLevel, toSemanticLevel } from "./utils";

// Zoom oscillating across a bare threshold (wheel jitter, easing overshoot)
// flipped the semantic level every frame — each flip remounts the level's
// layer and replays its fadeInBand stagger, which reads as flicker at
// class/function zoom. nextSemanticLevel adds hysteresis: enter a level at
// the UP threshold, leave it only below a lower DOWN threshold.
describe("nextSemanticLevel", () => {
  it("matches toSemanticLevel when zooming up through thresholds", () => {
    expect(nextSemanticLevel(0, 1.3)).toBe(toSemanticLevel(1.3)); // 1
    expect(nextSemanticLevel(1, 3.0)).toBe(toSemanticLevel(3.0)); // 2
    expect(nextSemanticLevel(2, 5.6)).toBe(toSemanticLevel(5.6)); // 3
  });

  it("climbs multiple levels in one jump (zoomTo presets)", () => {
    expect(nextSemanticLevel(0, 6)).toBe(3);
    expect(nextSemanticLevel(0, 8)).toBe(3);
  });

  it("holds the level on small dips below the entry threshold", () => {
    expect(nextSemanticLevel(3, 5.4)).toBe(3); // dip under 5.5 — no flip
    expect(nextSemanticLevel(3, 5.15)).toBe(3);
    expect(nextSemanticLevel(2, 2.7)).toBe(2); // dip under 2.8
    expect(nextSemanticLevel(1, 1.1)).toBe(1); // dip under 1.2
  });

  it("does not strobe when zoom oscillates around a threshold", () => {
    let level = 2;
    const seen = new Set<number>();
    for (const z of [5.45, 5.55, 5.48, 5.52, 5.46, 5.58, 5.49]) {
      level = nextSemanticLevel(level, z);
      seen.add(level);
    }
    expect(seen.size).toBe(2); // enters 3 once, never falls back to 2
    expect(level).toBe(3);
  });

  it("drops the level below the DOWN threshold", () => {
    expect(nextSemanticLevel(3, 5.0)).toBe(2); // package preset (zoomTo 5)
    expect(nextSemanticLevel(2, 2.2)).toBe(1); // service preset (zoomTo 2.2)
    expect(nextSemanticLevel(1, 0.9)).toBe(0);
  });

  it("falls multiple levels in one jump (fit view from deep zoom)", () => {
    expect(nextSemanticLevel(3, 0.5)).toBe(0);
  });
});
