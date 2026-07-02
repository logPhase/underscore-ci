import { CallChainEdgesProps } from "@/hooks/canvas/use-call-chain-edges";
import useJourneyData from "@/hooks/canvas/use-journey-data";
import { getAllFiles } from "@/lib/canvas/get-files";
import { useJourneyStore } from "@/store/use-journey-store";
import { useViewportStore } from "@/store/use-viewport-store";
import { paperMark, useIsPaper } from "./canvas-theme";

interface JourneyCanvasProps extends CallChainEdgesProps {
  activePhaseStepFqns: Set<string>;
}

/* ═══ Journey overlay: phase regions + trace edges ═══ */
const JourneyCanvas = ({
  methodPosRef,
  servicePosRef,
  activePhaseStepFqns,
}: JourneyCanvasProps) => {
  const zoom = useViewportStore((state) => state.zoom);
  const activeJourney = useJourneyStore((s) => s.activeJourney);
  const activePhaseIdx = useJourneyStore((s) => s.activePhaseIdx);
  const { isJourneyActive } = useJourneyData();
  // Paper-mode adapter — identity in dark mode (./canvas-theme.tsx)
  const isPaper = useIsPaper();

  return (
    isJourneyActive &&
    activeJourney &&
    (() => {
      const rawColor = activeJourney.color as string;
      const color = isPaper ? paperMark(rawColor) : rawColor;

      // Build file→service lookup from the loaded files data
      const allFiles = getAllFiles();
      const fileToService = new Map<string, string>();
      for (const file of allFiles) {
        if (file.service) fileToService.set(file.id, file.service);
        if (file.path) fileToService.set(file.path, file.service);
      }

      // Resolve step positions: try methodPosRef first, fall back to servicePosRef
      const stepPositions = activeJourney.steps
        .map(
          (
            s: {
              fqn: string;
              name: string;
              service: string;
              file: string;
              class: string;
            },
            idx: number
          ) => {
            // Try exact method position (works at L2/L3 when methods are rendered)
            const mPos = methodPosRef.current.get(s.fqn);
            if (mPos) return { ...s, x: mPos.x, y: mPos.y, r: mPos.r };

            // Fallback: resolve service from file path, use service center with offset
            const svcId = s.service || fileToService.get(s.file) || "";
            const svcPos = servicePosRef.current.get(svcId);
            if (svcPos) {
              // Spread steps within the service circle using a spiral offset
              const angle =
                (idx / Math.max(1, activeJourney.steps.length)) * Math.PI * 2 -
                Math.PI / 2;
              const spreadR = svcPos.radius * 0.4;
              return {
                ...s,
                x: svcPos.cx + Math.cos(angle) * spreadR,
                y: svcPos.cy + Math.sin(angle) * spreadR,
                r: 6 / zoom,
              };
            }

            // Last resort: find any service position by namespace prefix matching
            const fqnPrefix = s.fqn.split(".").slice(0, 3).join(".");
            for (const [id, pos] of servicePosRef.current.entries()) {
              if (
                fqnPrefix
                  .toLowerCase()
                  .includes(id.toLowerCase().replace(/-/g, "")) ||
                id
                  .toLowerCase()
                  .replace(/-/g, "")
                  .includes(fqnPrefix.toLowerCase().split(".").pop() || "")
              ) {
                const angle =
                  (idx / Math.max(1, activeJourney.steps.length)) * Math.PI * 2;
                return {
                  ...s,
                  x: pos.cx + Math.cos(angle) * pos.radius * 0.3,
                  y: pos.cy + Math.sin(angle) * pos.radius * 0.3,
                  r: 6 / zoom,
                };
              }
            }
            return null;
          }
        )
        .filter(Boolean) as Array<{
        fqn: string;
        name: string;
        x: number;
        y: number;
        r: number;
        class: string;
      }>;

      // Phase bounding boxes
      const phaseBounds = activeJourney.phases.map(
        (phase: { fqns: string[] }) => {
          let minX = Infinity,
            maxX = -Infinity,
            minY = Infinity,
            maxY = -Infinity;
          for (const fqn of phase.fqns) {
            const sp = stepPositions.find((s) => s.fqn === fqn);
            if (sp) {
              minX = Math.min(minX, sp.x - 25);
              maxX = Math.max(maxX, sp.x + 25);
              minY = Math.min(minY, sp.y - 25);
              maxY = Math.max(maxY, sp.y + 25);
            }
          }
          return minX < Infinity ? { minX, maxX, minY, maxY } : null;
        }
      );

      // Bezier curve helper
      const bezier = (ax: number, ay: number, bx: number, by: number) => {
        const dx = bx - ax;
        return `M${ax},${ay} C${ax + dx * 0.45},${ay} ${bx - dx * 0.45},${by} ${bx},${by}`;
      };

      return (
        <g opacity={0.95} style={{ transition: "opacity 0.4s" }}>
          {/* Phase region overlays */}
          {phaseBounds.map(
            (
              bounds: {
                minX: number;
                maxX: number;
                minY: number;
                maxY: number;
              } | null,
              i: number
            ) => {
              if (!bounds) return null;
              const isPhaseActive =
                activePhaseIdx === null || activePhaseIdx === i;
              return (
                <g key={`phase-region-${i}`}>
                  <rect
                    x={bounds.minX - 10}
                    y={bounds.minY - 14}
                    width={bounds.maxX - bounds.minX + 20}
                    height={bounds.maxY - bounds.minY + 28}
                    rx={8}
                    fill={color}
                    opacity={isPhaseActive ? 0.04 : 0.01}
                    stroke={color}
                    strokeWidth={1 / zoom}
                    strokeOpacity={isPhaseActive ? 0.15 : 0.05}
                    strokeDasharray={`${4 / zoom} ${3 / zoom}`}
                  />
                  <text
                    x={bounds.minX - 6}
                    y={bounds.minY - 18}
                    fontFamily="'JetBrains Mono', monospace"
                    fontSize={Math.max(3, 7 / zoom)}
                    fill={color}
                    opacity={isPhaseActive ? 0.6 : 0.2}
                    letterSpacing={1}
                  >
                    {`${i + 1}. ${activeJourney.phases[i].name.toUpperCase()}`}
                  </text>
                </g>
              );
            }
          )}

          {/* Trace edges from journey's edge list (supports branching) */}
          {activeJourney.edges.map(
            ([fromFqn, toFqn]: [string, string], i: number) => {
              const from = stepPositions.find((s) => s.fqn === fromFqn);
              const to = stepPositions.find((s) => s.fqn === toFqn);
              if (!from || !to) return null;
              const isEdgeInPhase =
                activePhaseStepFqns === null ||
                activePhaseStepFqns.has(fromFqn) ||
                activePhaseStepFqns.has(toFqn);
              return (
                <path
                  key={`trace-${i}`}
                  d={bezier(from.x, from.y, to.x, to.y)}
                  stroke={color}
                  strokeWidth={Math.max(1.5, 2.5 / zoom)}
                  fill="none"
                  strokeLinecap="round"
                  opacity={isEdgeInPhase ? 0.55 : 0.1}
                  strokeDasharray={`${8 / zoom} ${5 / zoom}`}
                >
                  <animate
                    attributeName="stroke-dashoffset"
                    from={`${26 / zoom}`}
                    to="0"
                    dur="0.8s"
                    repeatCount="indefinite"
                  />
                </path>
              );
            }
          )}

          {/* Journey step glow rings */}
          {stepPositions.map((sp, i) => {
            if (!sp) return null;
            const isInPhase =
              activePhaseStepFqns === null || activePhaseStepFqns.has(sp.fqn);
            return (
              <circle
                key={`journey-glow-${i}`}
                cx={sp.x}
                cy={sp.y}
                r={sp.r + 3 / zoom}
                fill="none"
                stroke={color}
                strokeWidth={1.5 / zoom}
                opacity={isInPhase ? 0.7 : 0.15}
              >
                {isInPhase && (
                  <animate
                    attributeName="opacity"
                    values="0.7;0.35;0.7"
                    dur="2s"
                    repeatCount="indefinite"
                  />
                )}
              </circle>
            );
          })}

          {/* Step number badges */}
          {stepPositions.map((sp, i) => {
            if (!sp) return null;
            const isInPhase =
              activePhaseStepFqns === null || activePhaseStepFqns.has(sp.fqn);
            if (!isInPhase) return null;
            const badgeR = Math.max(3, 5 / zoom);
            return (
              <g key={`step-badge-${i}`}>
                <circle
                  cx={sp.x + sp.r + 4 / zoom}
                  cy={sp.y - sp.r - 2 / zoom}
                  r={badgeR}
                  fill={color}
                  opacity={0.9}
                />
                <text
                  x={sp.x + sp.r + 4 / zoom}
                  y={sp.y - sp.r - 2 / zoom + badgeR * 0.35}
                  textAnchor="middle"
                  fontFamily="'JetBrains Mono', monospace"
                  fontSize={badgeR * 1.1}
                  fill="white"
                  fontWeight={600}
                >
                  {i + 1}
                </text>
              </g>
            );
          })}
        </g>
      );
    })()
  );
};

export default JourneyCanvas;
