import { generateBlobPath } from "@/lib/canvas/utils";
import { useAnalysis } from "@/store/use-analysis-store";
import { useHoverStore } from "@/store/use-hover-store";
import { useUIStore } from "@/store/use-ui-store";
import { useViewportStore } from "@/store/use-viewport-store";
import type { PositionedGroupRegion } from "@/types/grouping";
import { memo, useMemo } from "react";

interface Props {
  onGroupClick: (group: PositionedGroupRegion) => void;
  /** PR dim — a hull stays bright only when a member is PR-affected or a
   *  knock-on ghost (mirrors regionOpacity's prMode branch). */
  prMode: boolean;
  prRelevantServiceIds: Set<string>;
}

// Quantized label fade so the whole canvas doesn't re-render per zoom frame:
// full at L0 overview, gone as L1 approaches (staining, not switching — the
// hull outline stays as a thin trace at higher zoom).
const labelFadeFor = (zoom: number) => (zoom < 0.8 ? 1 : zoom < 1.2 ? 0.4 : 0);

/**
 * Agent-derived group hulls — the L0 primary entities when grouping is
 * active (#15: 3–7 chunks). Rendered UNDER the service regions as visual
 * "ground" (#5 figure-ground: lighter, connective), dashed because the
 * grouping is AI-inferred, not a code fact (#9 honest uncertainty).
 *
 * Static report: the groups arrive pre-positioned on transformedData
 * (the transform runs group-layout deterministically). Visibility is a
 * pure render toggle owned by use-ui-store; the layout never re-runs, so
 * hiding the hulls leaves the services exactly where they sit (#10 stable
 * base map). Nothing renders when the run has no grouping (serviceGroups
 * null) — zero visual change for payloads without groups.
 */
const GroupRegions = ({ onGroupClick, prMode, prRelevantServiceIds }: Props) => {
  const groups = useAnalysis((s) => s.transformedData?.serviceGroups);
  const groupingVisible = useUIStore((s) => s.groupingVisible);
  const labelFade = useViewportStore((s) => labelFadeFor(s.zoom));
  const loadPhase = useUIStore((s) => s.loadPhase);
  const setHoveredElement = useHoverStore((s) => s.setHoveredElement);

  // Hulls are big — more perimeter points than service blobs for a calmer
  // outline. Positions only change when grouping is (re)applied.
  const hullPaths = useMemo(() => {
    const paths: Record<string, string> = {};
    for (const g of groups ?? [])
      paths[g.id] = generateBlobPath(g.cx, g.cy, g.radius, g.seed, 16);
    return paths;
  }, [groups]);

  if (!groupingVisible || !groups || groups.length === 0) return null;
  if (loadPhase < 1) return null;

  return (
    <g data-testid="group-regions" className="group-regions-enter">
      {groups.map((group) => {
        const onActivePath = prMode
          ? group.serviceIds.some((id) => prRelevantServiceIds.has(id))
          : true;
        const dim = onActivePath ? 1 : 0.15;

        return (
          <g
            key={group.id}
            opacity={dim}
            style={{ transition: "opacity 0.45s" }}
          >
            {/* Hull — low-opacity fill fades out toward L1; the dashed
                outline stays as a faint trace so the grouping remains
                legible without competing with packages/files. */}
            <path
              d={hullPaths[group.id]}
              fill="hsl(210, 30%, 45%)"
              fillOpacity={0.05 + labelFade * 0.05}
              stroke="hsl(210, 35%, 55%)"
              strokeWidth={1.5}
              strokeDasharray="12 7"
              strokeOpacity={0.15 + labelFade * 0.3}
              style={{
                transition: "fill-opacity 0.3s, stroke-opacity 0.3s",
                cursor: "pointer",
              }}
              onMouseEnter={() =>
                setHoveredElement({ type: "service", id: group.id })
              }
              onMouseLeave={() => setHoveredElement(null)}
              onClick={() => onGroupClick(group)}
            >
              {group.description && <title>{group.description}</title>}
            </path>
            {/* Group name — the L0 primary label, sized for overview zoom,
                sitting above the hull so it never fights member labels. */}
            <text
              x={group.cx}
              y={group.cy - group.radius - 18}
              textAnchor="middle"
              fill="var(--cw-label-hi)"
              fontSize={30}
              fontFamily="'Space Grotesk', sans-serif"
              fontWeight={600}
              letterSpacing={1}
              opacity={loadPhase >= 2 ? labelFade * 0.85 : 0}
              style={{ transition: "opacity 0.3s" }}
              className="pointer-events-none"
            >
              {group.name}
            </text>
            <text
              x={group.cx}
              y={group.cy - group.radius + 6}
              textAnchor="middle"
              fill="var(--cw-text-muted)"
              fontSize={13}
              fontFamily="'JetBrains Mono', monospace"
              opacity={loadPhase >= 2 ? labelFade * 0.55 : 0}
              style={{ transition: "opacity 0.3s" }}
              className="pointer-events-none"
            >
              {group.serviceIds.length}{" "}
              {group.serviceIds.length === 1 ? "module" : "modules"}
            </text>
          </g>
        );
      })}
    </g>
  );
};

export default memo(GroupRegions);
