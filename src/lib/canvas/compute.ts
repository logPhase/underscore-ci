import { useAnalysis } from "@/store/use-analysis-store";

export function quadBezierPoint(
  x1: number,
  y1: number,
  cx: number,
  cy: number,
  x2: number,
  y2: number,
  t: number
): [number, number] {
  const u = 1 - t;
  return [
    u * u * x1 + 2 * u * t * cx + t * t * x2,
    u * u * y1 + 2 * u * t * cy + t * t * y2,
  ];
}

export function computeBlastRadius(targetId: string): Map<string, number> {
  const dependencies = useAnalysis.getState().transformedData.dependencies;
  const distances = new Map<string, number>();
  distances.set(targetId, 0);
  const queue = [targetId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const dist = distances.get(current)!;
    if (dist >= 3) continue;
    for (const dep of dependencies) {
      const neighbor =
        dep.from === current ? dep.to : dep.to === current ? dep.from : null;
      if (neighbor && !distances.has(neighbor)) {
        distances.set(neighbor, dist + 1);
        queue.push(neighbor);
      }
    }
  }
  return distances;
}
