import { MonoService, PackageData } from "@/types/analysis";
import { getPackageFiles } from "./get-files";

// ── Package positions ──────────────────────────────────
export function getPackagePositions(svc: MonoService): PackageData[] {
  const pkgs = svc.packages;
  const n = pkgs.length;

  // Single-package service: center the package blob on the service origin (Principle #16)
  if (n === 1) {
    const name = pkgs[0];
    const fileCount = getPackageFiles(svc.id, name).length;
    return [
      {
        id: `${svc.id}/${name}`,
        name,
        service: svc.id,
        cx: svc.cx,
        cy: svc.cy,
        radius: 30 + fileCount * 3,
      },
    ];
  }

  // For many packages, use concentric rings to avoid crowding
  // Ring 1: up to 8 packages at radius * 0.58
  // Ring 2: overflow at radius * 0.3
  const maxPerRing = Math.max(6, Math.min(10, Math.ceil(n / 2)));
  return pkgs.map((name, i) => {
    const ring = i < maxPerRing ? 0 : 1;
    const ringCount = ring === 0 ? Math.min(n, maxPerRing) : n - maxPerRing;
    const ringIndex = ring === 0 ? i : i - maxPerRing;
    const dist = ring === 0 ? svc.radius * 0.58 : svc.radius * 0.28;
    const angle = (ringIndex / ringCount) * Math.PI * 2 - Math.PI / 2;
    const fileCount = getPackageFiles(svc.id, name).length;
    // Scale radius down when many packages to prevent overlap
    const baseRadius = n > 8 ? 22 : 30;
    return {
      id: `${svc.id}/${name}`,
      name,
      service: svc.id,
      cx: svc.cx + Math.cos(angle) * dist,
      cy: svc.cy + Math.sin(angle) * dist,
      radius: baseRadius + fileCount * (n > 12 ? 1.5 : 3),
    };
  });
}
