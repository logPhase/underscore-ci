import { useHoverStore } from "@/store/use-hover-store";
import { RawDependency } from "@/types/journey";
import { ViewType } from "@/types/store";

export const toSemanticLevel = (zoom: number) =>
  zoom < 1.2 ? 0 : zoom < 2.8 ? 1 : zoom < 5.5 ? 2 : 3;

// Hysteresis for live zoom: a level is ENTERED at LEVEL_UP[i] but only LEFT
// below LEVEL_DOWN[i]. Without the gap, zoom jitter on a bare threshold flips
// the level every frame — each flip remounts that level's layer and replays
// its fadeInBand stagger (visible flicker at class/function zoom). DOWN values
// sit above the zoomTo presets (5 → level 2, 2.2 → level 1) so preset
// navigation still lands on the level it was tuned for.
const LEVEL_UP = [1.2, 2.8, 5.5];
const LEVEL_DOWN = [1.05, 2.5, 5.1];

export const nextSemanticLevel = (prev: number, zoom: number): number => {
  let level = prev;
  while (level < 3 && zoom >= LEVEL_UP[level]) level++;
  while (level > 0 && zoom < LEVEL_DOWN[level - 1]) level--;
  return level;
};

export function pr(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
export function changeToColor(monthsAgo: number): string {
  const t = Math.min(1, monthsAgo / 18);
  const h = 270 - t * 30;
  const s = 65 - t * 35;
  const l = 60 - t * 25;
  return `hsl(${h}, ${s}%, ${l}%)`;
}

// ── Blob path generation ───────────────────────────────
export function generateBlobPath(
  cx: number,
  cy: number,
  r: number,
  seed: number,
  pts = 12
): string {
  const points: [number, number][] = [];
  for (let i = 0; i < pts; i++) {
    const angle = (i / pts) * Math.PI * 2;
    const noise = 0.82 + pr(seed * 7 + i * 13) * 0.36;
    points.push([
      cx + Math.cos(angle) * r * noise,
      cy + Math.sin(angle) * r * noise,
    ]);
  }
  const n = points.length;
  let d = `M ${points[0][0].toFixed(1)},${points[0][1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

export function depLinePath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  seed: number
): { path: string; cx: number; cy: number } {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const offset = (pr(seed * 31) - 0.5) * len * 0.25;
  const cx = mx + nx * offset;
  const cy = my + ny * offset;
  return { path: `M ${x1},${y1} Q ${cx},${cy} ${x2},${y2}`, cx, cy };
}

// Dep line style
export const depLineStyle = (dep: RawDependency, activeView: ViewType) => {
  const hoveredElement = useHoverStore.getState().hoveredElement;
  const base = Math.max(1, Math.min(6, dep.importCount / 4));
  if (activeView === "boundaries") {
    if (dep.isViolation)
      return {
        strokeWidth: base + 2,
        stroke: "hsl(0, 70%, 55%)",
        dasharray: "8 4",
        opacity: 0.9,
      };
    return {
      strokeWidth: base,
      stroke: "hsl(180, 40%, 35%)",
      dasharray: "none",
      opacity: 0.3,
    };
  }
  if (activeView === "flow")
    return {
      strokeWidth: base + 1,
      stroke: "hsl(200, 60%, 45%)",
      dasharray: "none",
      opacity: 0.5,
    };
  return {
    strokeWidth: base,
    stroke: dep.isViolation ? "hsl(0, 50%, 45%)" : "hsl(210, 20%, 35%)",
    dasharray: dep.isViolation ? "6 3" : "none",
    opacity:
      hoveredElement?.id === dep.from || hoveredElement?.id === dep.to
        ? 0.8
        : 0.3,
  };
};
