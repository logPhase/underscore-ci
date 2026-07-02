import { ComponentFunction } from "@/types/analysis";
import { MethodLayoutPosition } from "@/types/canvas";

export function computeMethodRings(
  allFns: ComponentFunction[],
  expandedR: number,
  x: number,
  y: number,
  populateMethodRegistry?: (
    fnId: string,
    position: { mx: number; my: number; methodR: number }
  ) => void
): MethodLayoutPosition[] {
  // Sort methods by size (largest first) so the outermost ring gets the biggest circles
  const sortedFns = [...allFns].sort((a, b) => {
    const rA = Math.max(2, Math.min(8, Math.sqrt(a.lines / 10) * 1.8 + 1.5));
    const rB = Math.max(2, Math.min(8, Math.sqrt(b.lines / 10) * 1.8 + 1.5));
    return rB - rA;
  });

  // Compute methodR for each function
  const withRadii = sortedFns.map((fn) => ({
    fn,
    methodR: Math.max(2, Math.min(8, Math.sqrt(fn.lines / 10) * 1.8 + 1.5)),
  }));

  // Determine how many methods fit on a ring of given radius
  function capacityForRing(ringRadius: number, avgR: number): number {
    if (ringRadius <= 0) return 1; // center ring: just 1
    const circumference = 2 * Math.PI * ringRadius;
    const spacing = avgR * 2 + 2; // diameter + 2 units gap
    return Math.max(1, Math.floor(circumference / spacing));
  }

  // Build rings from outermost inward
  const minRingR = expandedR * 0.2;
  const maxRingR = expandedR * 0.75;
  const ringGap = 12; // minimum gap between rings

  const rings: Array<{ ringRadius: number; items: typeof withRadii }> = [];
  const remaining = [...withRadii];
  let currentR = maxRingR;

  while (remaining.length > 0 && currentR >= minRingR) {
    const avgR =
      remaining.reduce((s, m) => s + m.methodR, 0) / remaining.length;
    const cap = capacityForRing(currentR, avgR);
    const batch = remaining.splice(0, cap);
    rings.push({ ringRadius: currentR, items: batch });
    currentR -= ringGap;
  }

  // If there are still remaining methods, dump them on the innermost ring
  if (remaining.length > 0) {
    rings.push({ ringRadius: Math.max(minRingR * 0.5, 5), items: remaining });
  }

  // Flatten into positions
  return rings.flatMap(({ ringRadius, items }) => {
    return items.map((m, i) => {
      const angle = (i / items.length) * Math.PI * 2 - Math.PI / 2;
      const mx = x + Math.cos(angle) * ringRadius;
      const my = y + Math.sin(angle) * ringRadius;

      if (populateMethodRegistry) {
        populateMethodRegistry(m.fn.id, { mx, my, methodR: m.methodR });
      }

      return { fn: m.fn, mx, my, methodR: m.methodR, angle };
    });
  });
}
