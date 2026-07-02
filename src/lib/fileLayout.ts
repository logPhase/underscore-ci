/**
 * Clustered file layout engine for packages.
 *
 * Groups files by semantic role into 5 cluster categories, then positions
 * clusters within the package using a gravity model. Within each cluster,
 * files are arranged in importance-sorted rows.
 *
 * Design references:
 * - Principle #15 (Chunk Budget): 3-5 clusters instead of 15+ flat files
 * - Principle #16 (Representational Correspondence): related files near each other
 * - Principle #8 (Strategic Abstraction): 3-tier visual hierarchy
 * - Principle #33 (Margin of Safety): minimum spacing enforced
 */

import { LayoutTier, MonoFile, PackageData } from "@/types/analysis";

// ── Types ──

export type ClusterCategory =
  | "entry"
  | "core"
  | "data"
  | "pipeline"
  | "support";

export interface PositionedFile {
  file: MonoFile;
  x: number;
  y: number;
  size: number;
  displaySize: number;
  tier: LayoutTier;
  clusterLabel: ClusterCategory;
  isAnchor: boolean;
}

// ── Constants ──

const SEMANTIC_ROLE_TO_CLUSTER: Record<string, ClusterCategory> = {
  "api-controller": "entry",
  "event-handler": "entry",
  middleware: "entry",
  "business-logic": "core",
  orchestrator: "core",
  "data-access": "data",
  validator: "pipeline",
  transformer: "pipeline",
  utility: "support",
  configuration: "support",
  test: "support",
};

/** Gravity positions for each cluster within the package (relative to center) */
const CLUSTER_GRAVITY: Record<
  ClusterCategory,
  { yFactor: number; xFactor: number }
> = {
  entry: { yFactor: -0.35, xFactor: 0 },
  pipeline: { yFactor: -0.15, xFactor: 0 },
  core: { yFactor: 0, xFactor: 0 },
  data: { yFactor: 0.3, xFactor: 0 },
  support: { yFactor: 0.4, xFactor: 0.25 },
};

/** Tier-based visual parameters */
export const TIER_CONFIG = {
  focal: {
    radiusMultiplier: 1.4,
    fillOpacity: 0.9,
    strokeWidth: 1.5,
    strokeColor: "hsl(210, 30%, 55%)",
    labelVisible: true,
    labelFontSize: 5,
    labelFontWeight: 600,
    labelMaxChars: 30,
    foreshadowingVisible: true,
    semanticRoleVisible: true,
  },
  ambient: {
    radiusMultiplier: 1.0,
    fillOpacity: 0.55,
    strokeWidth: 0.8,
    strokeColor: "hsl(210, 15%, 38%)",
    labelVisible: false, // visible at L3, hover-only at L2
    labelFontSize: 4,
    labelFontWeight: 400,
    labelMaxChars: 14,
    foreshadowingVisible: false,
    semanticRoleVisible: false,
  },
  suppressed: {
    radiusMultiplier: 0.7,
    fillOpacity: 0.3,
    strokeWidth: 0.5,
    strokeColor: "hsl(210, 10%, 30%)",
    labelVisible: false,
    labelFontSize: 3.5,
    labelFontWeight: 400,
    labelMaxChars: 20,
    foreshadowingVisible: false,
    semanticRoleVisible: false,
  },
} as const;

// ── Tier assignment ──

function assignTier(rank: number, total: number): LayoutTier {
  // Only treat all files as focal when there are ≤ 2 (no label clutter risk)
  // For 3–5 files: top 1 (anchor) is focal, rest are ambient
  // For 6+: top 2 focal, bottom 3+ ambient/suppressed (Principle #15: Chunk Budget)
  if (total <= 2) return "focal";
  if (total <= 5) return rank === 0 ? "focal" : "ambient";
  if (rank < 2) return "focal";
  if (total > 7 && rank >= total - 3) return "suppressed";
  return "ambient";
}

// ── Layout engine ──

/**
 * Compute importance-aware, cluster-grouped file positions within a package.
 *
 * @param pkg        Package data with cx/cy/radius
 * @param files      Files belonging to this package
 * @param cxOverride Override for package center X (e.g., after expansion)
 * @param cyOverride Override for package center Y
 * @param radiusOverride Override for package radius
 * @returns Positioned files with tier metadata
 */
export function getClusteredFilePositions(
  pkg: PackageData,
  files: MonoFile[],
  cxOverride?: number,
  cyOverride?: number,
  radiusOverride?: number
): PositionedFile[] {
  if (files.length === 0) return [];

  const cx = cxOverride ?? pkg.cx;
  const cy = cyOverride ?? pkg.cy;
  const pkgRadius = radiusOverride ?? pkg.radius;

  // 1. Sort files by importance descending for tier assignment
  const sortedFiles = [...files].sort(
    (a, b) => (b.importance ?? 0) - (a.importance ?? 0)
  );
  const total = sortedFiles.length;

  // 2. Assign tiers — backend layoutTier signals data importance, but visual tier
  //    must be recomputed from rank to control label density and prevent clutter.
  //    When the backend marks everything "focal" (common in small real datasets),
  //    naively trusting it causes all labels to render simultaneously and overlap.
  //    Rule: backend tier can PROMOTE a file (ambient→focal) but cannot override
  //    rank-based suppression when total > 2 (Principle #8, #15).
  const tieredFiles = sortedFiles.map((f, rank) => {
    const backendTier = f.layoutTier as LayoutTier | undefined;
    const computedTier = assignTier(rank, total);
    // Allow backend to elevate ambient→focal only for the top half of files
    const tier: LayoutTier =
      backendTier === "focal" &&
      computedTier !== "suppressed" &&
      rank < Math.ceil(total / 2)
        ? "focal"
        : computedTier;
    return { file: f, tier, rank };
  });

  // 3. Find anchor file: entry point or highest importance
  const anchorFile =
    tieredFiles.find((tf) => tf.file.isEntryPoint) || tieredFiles[0];

  // 4. Group by semantic role cluster
  const clusters = new Map<ClusterCategory, typeof tieredFiles>();
  for (const tf of tieredFiles) {
    const cluster = SEMANTIC_ROLE_TO_CLUSTER[tf.file.semanticRole] ?? "support";
    if (!clusters.has(cluster)) clusters.set(cluster, []);
    clusters.get(cluster)!.push(tf);
  }

  // 5. Position each cluster, then files within each cluster
  const result: PositionedFile[] = [];

  // Dynamic radius scaling: ensure package can fit all files
  const avgBaseSize =
    total > 0
      ? files.reduce(
          (a, f) =>
            a +
            Math.max(4, Math.min(18, 2.5 + Math.sqrt(f.sizeLines ?? 50) * 0.7)),
          0
        ) / total
      : 7;
  const minRequiredRadius = Math.sqrt(total) * (avgBaseSize + 8) * 1.3;
  const effectiveRadius = Math.max(pkgRadius, minRequiredRadius);

  // Order clusters by gravity (top to bottom)
  const clusterOrder: ClusterCategory[] = [
    "entry",
    "pipeline",
    "core",
    "data",
    "support",
  ];

  for (const clusterKey of clusterOrder) {
    const clusterFiles = clusters.get(clusterKey);
    if (!clusterFiles || clusterFiles.length === 0) continue;

    const gravity = CLUSTER_GRAVITY[clusterKey];
    const clusterCx = cx + gravity.xFactor * effectiveRadius;
    const clusterCy = cy + gravity.yFactor * effectiveRadius;

    // Sort within cluster by importance (focal files first/centered)
    clusterFiles.sort((a, b) => a.rank - b.rank);

    // Layout files in rows within the cluster
    const filesPerRow =
      clusterFiles.length <= 3
        ? clusterFiles.length
        : clusterFiles.length <= 6
          ? Math.ceil(clusterFiles.length / 2)
          : Math.ceil(clusterFiles.length / 3);

    const rows: (typeof clusterFiles)[] = [];
    for (let i = 0; i < clusterFiles.length; i += filesPerRow) {
      rows.push(clusterFiles.slice(i, i + filesPerRow));
    }

    // Compute row and column spacing from file sizes
    const rowSpacing = Math.max(avgBaseSize * 2 + 8, 20);
    const colSpacing = Math.max(avgBaseSize * 2 + 10, 22);

    const totalRowHeight = (rows.length - 1) * rowSpacing;
    let rowY = clusterCy - totalRowHeight / 2;

    for (const row of rows) {
      const totalRowWidth = (row.length - 1) * colSpacing;
      let fileX = clusterCx - totalRowWidth / 2;

      for (const tf of row) {
        // Scale circle area proportional to lines of code (sqrt for perceptual accuracy)
        const lines = tf.file.sizeLines ?? 50;
        const baseSize = Math.max(
          4,
          Math.min(18, 2.5 + Math.sqrt(lines) * 0.7)
        );
        const isAnchor = tf === anchorFile;
        const anchorMultiplier = isAnchor ? 2.0 : 1.0;
        const tierMultiplier = TIER_CONFIG[tf.tier].radiusMultiplier;
        const displaySize = baseSize * tierMultiplier * anchorMultiplier;

        result.push({
          file: tf.file,
          x: fileX,
          y: rowY,
          size: baseSize,
          displaySize,
          tier: tf.tier,
          clusterLabel: clusterKey,
          isAnchor,
        });

        fileX += colSpacing;
      }

      rowY += rowSpacing;
    }
  }

  // 6. Enforce minimum spacing — push apart any overlapping files
  enforceMinimumSpacing(result);

  // 7. Constrain all files within the package boundary with 8px padding
  constrainToPackage(result, cx, cy, effectiveRadius, 8);

  return result;
}

/**
 * Enforce minimum center-to-center distance between all file circles.
 * Uses iterative repulsion (up to 10 passes).
 */
function enforceMinimumSpacing(positions: PositionedFile[]): void {
  const maxPasses = 10;
  for (let pass = 0; pass < maxPasses; pass++) {
    let anyMoved = false;
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const a = positions[i];
        const b = positions[j];
        const minDist = Math.max(a.displaySize + b.displaySize + 6, 18);
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDist && dist > 0.01) {
          const overlap = (minDist - dist) / 2 + 0.5;
          const nx = dx / dist;
          const ny = dy / dist;
          a.x -= nx * overlap;
          a.y -= ny * overlap;
          b.x += nx * overlap;
          b.y += ny * overlap;
          anyMoved = true;
        }
      }
    }
    if (!anyMoved) break;
  }
}

/**
 * Pull files back inside the package boundary if they've drifted out.
 */
function constrainToPackage(
  positions: PositionedFile[],
  cx: number,
  cy: number,
  radius: number,
  padding: number
): void {
  const maxR = radius - padding;
  for (const p of positions) {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const fileEdge = dist + p.displaySize;
    if (fileEdge > maxR && dist > 0.01) {
      const scale = (maxR - p.displaySize) / dist;
      p.x = cx + dx * Math.max(0.1, scale);
      p.y = cy + dy * Math.max(0.1, scale);
    }
  }
}

// ── Composition ring data for L1 foreshadowing ──

export interface CompositionSegment {
  role: string;
  fraction: number;
  color: string;
}

/** Role colors for composition ring segments */
const ROLE_COLORS: Record<string, string> = {
  "api-controller": "hsl(200, 55%, 50%)",
  "event-handler": "hsl(35, 55%, 50%)",
  middleware: "hsl(280, 40%, 50%)",
  "business-logic": "hsl(160, 45%, 45%)",
  orchestrator: "hsl(120, 40%, 45%)",
  "data-access": "hsl(220, 50%, 50%)",
  validator: "hsl(50, 50%, 50%)",
  transformer: "hsl(170, 45%, 45%)",
  utility: "hsl(210, 20%, 45%)",
  configuration: "hsl(0, 0%, 50%)",
  test: "hsl(0, 30%, 45%)",
};

/**
 * Compute composition ring segments for a package at L1 zoom.
 * Each segment represents the proportion of files with a given semantic role.
 */
export function getCompositionRingData(
  files: MonoFile[]
): CompositionSegment[] {
  if (files.length === 0) return [];

  const roleCounts: Record<string, number> = {};
  for (const f of files) {
    const role = f.semanticRole || "utility";
    roleCounts[role] = (roleCounts[role] || 0) + 1;
  }

  const total = files.length;
  return Object.entries(roleCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([role, count]) => ({
      role,
      fraction: count / total,
      color: ROLE_COLORS[role] ?? "hsl(210, 15%, 40%)",
    }));
}
