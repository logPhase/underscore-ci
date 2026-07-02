/**
 * Canvas theme bridge — paper-mode support for the spatial map.
 *
 * Most canvas colors are CSS custom properties (`--cw-*`, defined in
 * src/index.css under `.canvas-stage`) and flip for free when the
 * `reading-paper` class lands on <html>. This module covers the rest:
 * colors BUILT IN JS (per-service palette hues, health/change scores,
 * function-role colors, journey accents) that can't be enumerated as
 * tokens. `useIsPaper` reacts to the <html> class flip; the `paperize*`
 * helpers re-pitch a dark-tuned hsl() literal for ink-on-cream.
 *
 * Dark mode is untouched by design: every helper is only applied when
 * `useIsPaper()` is true, so the dark canvas stays pixel-identical.
 */
import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}

const getSnapshot = () =>
  document.documentElement.classList.contains("reading-paper");

/** True when the paper (light) theme is active. Re-renders on toggle. */
export function useIsPaper(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot);
}

// hsl(h, s%, l%) — tolerant of spacing; hsla/alpha and hex pass through
const HSL_RE =
  /^hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)$/;

function remap(
  color: string,
  fn: (h: number, s: number, l: number) => [number, number, number]
): string {
  const m = HSL_RE.exec(color);
  if (!m) return color;
  const [h, s, l] = fn(Number(m[1]), Number(m[2]), Number(m[3]));
  return `hsl(${h}, ${Math.round(s)}%, ${Math.round(l)}%)`;
}

/** Service-membrane fills: desaturated tints lifted toward the paper
 *  surface — bounded regions read as soft colored ground, not slabs. */
export const paperRegionFill = (c: string) =>
  remap(c, (h, s) => [h, Math.max(30, s * 0.7), 80]);

/** Status fills (health / change / blast): hue identity kept, lightness
 *  capped so the stain stays pre-attentive on cream. */
export const paperStatusFill = (c: string) =>
  remap(c, (h, s, l) => [h, s, Math.min(Math.max(l, 50), 60)]);

/** File-cell fills: lifted versions of the service hue — distinct
 *  "figure" cells inside the lighter region tint. */
export const paperCellFill = (c: string) =>
  remap(c, (h, s, l) => [h, Math.max(30, s * 0.8), Math.min(72, Math.max(l + 14, 58))]);

/** Marks (method dots, edges, badges, small strokes): darkened for
 *  legibility on the light stage. */
export const paperMark = (c: string) =>
  remap(c, (h, s, l) => [h, Math.min(90, s + 5), Math.min(l, 42)]);

/** Colored text labels: darker still — 4.5:1 on the paper surfaces. */
export const paperText = (c: string) =>
  remap(c, (h, s, l) => [h, Math.min(90, s + 5), Math.min(l, 38)]);
