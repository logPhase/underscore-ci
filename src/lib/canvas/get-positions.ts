import { MonoService, PackageData } from "@/types/analysis";
import { getPackageFiles } from "./get-files";
import { computePackageGrid } from "./ordered-layout";

// ── Package positions ──────────────────────────────────
// Packages/components sit on a neat up-to-3-per-row grid inside the service
// blob (ordered by file count desc then name) — the same grid the ordered
// layout engine uses to size the service radius. Because both derive from the
// SAME (name, fileCount) set, the blobs land exactly inside the grown service
// (containment) and the transform-time `packages` map (which anchors journey
// transit lines) matches what the canvas renders.
//
// `fileCountOf` is injected at transform time (the store isn't populated yet
// during transformToFrontendFormat); at render time it defaults to the live
// store via getPackageFiles.
export function getPackagePositions(
  svc: MonoService,
  fileCountOf: (serviceId: string, pkg: string) => number = (sid, pkg) =>
    getPackageFiles(sid, pkg).length
): PackageData[] {
  const grid = computePackageGrid(
    svc.packages.map((name) => ({ name, fileCount: fileCountOf(svc.id, name) }))
  );
  return grid.cells.map((cell) => ({
    id: `${svc.id}/${cell.name}`,
    name: cell.name,
    service: svc.id,
    cx: svc.cx + cell.dx,
    cy: svc.cy + cell.dy,
    radius: cell.radius,
  }));
}
