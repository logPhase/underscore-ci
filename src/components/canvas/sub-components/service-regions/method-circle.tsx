import { FUNCTION_ROLE_COLORS } from "@/data/transform-data";
import useJourneyData from "@/hooks/canvas/use-journey-data";
import { useHoverStore } from "@/store/use-hover-store";
import { useSelectionStore } from "@/store/use-selection-store";
import { useViewportStore } from "@/store/use-viewport-store";
import {
  ComponentFunction,
  MonoFile,
  MonoService,
  PackageData,
} from "@/types/analysis";
import { memo, RefObject } from "react";
import { paperMark, useIsPaper } from "../canvas-theme";

interface MethodCirclesProps {
  allFns: ComponentFunction[];
  methodPositions: Array<{
    fn: ComponentFunction;
    mx: number;
    my: number;
    methodR: number;
    angle: number;
  }>;
  file: MonoFile;
  x: number;
  y: number;
  lastMethodClickRef: RefObject<number>;
  containerRef: RefObject<HTMLDivElement>;
  pkg: PackageData;
  svc: MonoService;
}

const MethodCircles = ({
  allFns,
  methodPositions,
  file,
  x,
  y,
  lastMethodClickRef,
  containerRef,
  pkg,
  svc,
}: MethodCirclesProps) => {
  const selectedFunctionCtx = useSelectionStore(
    (state) => state.selectedFunctionCtx
  );

  const setSelectedFunctionCtx = useSelectionStore(
    (state) => state.setSelectedFunctionCtx
  );

  const hoveredElement = useHoverStore((state) => state.hoveredElement);
  const setHoveredElement = useHoverStore((state) => state.setHoveredElement);

  const zoomTo = useViewportStore((state) => state.zoomTo);

  const { journeyStepFqns, activePhaseStepFqns, isJourneyActive } =
    useJourneyData();

  // Paper-mode adapter — identity in dark mode (../canvas-theme.tsx)
  const isPaper = useIsPaper();

  // Determine which methods are in the call chain of the selected function
  const selectedId = selectedFunctionCtx?.functionId;
  const callChainIds = new Set<string>();
  if (selectedId && selectedFunctionCtx?.fileId === file.id) {
    callChainIds.add(selectedId);
    const selFn = allFns.find((f) => f.id === selectedId);
    if (selFn) {
      selFn.calls.forEach((id) => callChainIds.add(id));
      selFn.calledBy.forEach((id) => callChainIds.add(id));
    }
  }
  const hasSelection = selectedId && selectedFunctionCtx?.fileId === file.id;

  return methodPositions.map(({ fn, mx, my, methodR, angle }, mi) => {
    const rawRoleColor = FUNCTION_ROLE_COLORS[fn.role];
    const roleColor =
      isPaper && rawRoleColor ? paperMark(rawRoleColor) : rawRoleColor;
    const isMethodSelected = selectedId === fn.id;
    const isInChain = callChainIds.has(fn.id);
    const dimmed = hasSelection && !isInChain;
    // Journey-aware dimming: dim methods not in the active journey/phase
    const journeyDimmed = isJourneyActive && !journeyStepFqns.has(fn.id);
    const phaseDimmed =
      activePhaseStepFqns !== null && !activePhaseStepFqns.has(fn.id);
    const methodOpacity = phaseDimmed
      ? 0.06
      : journeyDimmed
        ? 0.12
        : dimmed
          ? 0.15
          : 1;

    return (
      <g
        key={fn.id}
        style={{
          transition: "opacity 0.3s",
        }}
        opacity={methodOpacity}
      >
        {/* Connection line from center to method */}
        <line
          x1={x}
          y1={y}
          x2={mx}
          y2={my}
          stroke="var(--cw-spoke)"
          strokeWidth={0.5}
          opacity={dimmed ? 0.1 : 0.4}
          className="pointer-events-none"
        />
        {/* Method circle */}
        <circle
          cx={mx}
          cy={my}
          r={
            hoveredElement?.type === "method" && hoveredElement.id === fn.id
              ? methodR * 1.25
              : methodR
          }
          fill={roleColor}
          opacity={
            isMethodSelected
              ? 1
              : isInChain
                ? 0.85
                : hoveredElement?.type === "method" &&
                    hoveredElement.id === fn.id
                  ? 0.95
                  : 0.7
          }
          stroke={
            isMethodSelected
              ? "var(--cw-label-80)"
              : hoveredElement?.type === "method" && hoveredElement.id === fn.id
                ? roleColor
                : "none"
          }
          strokeWidth={
            isMethodSelected
              ? 1.5
              : hoveredElement?.type === "method" && hoveredElement.id === fn.id
                ? 1
                : 0
          }
          className="cursor-pointer"
          style={{
            animation: `fadeInBand 0.3s ease ${mi * 40}ms both`,
            filter: isMethodSelected
              ? `drop-shadow(0 0 4px ${roleColor})`
              : hoveredElement?.type === "method" && hoveredElement.id === fn.id
                ? `drop-shadow(0 0 3px ${roleColor})`
                : "none",
            transition: "r 0.15s ease, opacity 0.15s ease, filter 0.15s ease",
          }}
          onClick={(e) => {
            e.stopPropagation();
            const now = Date.now();
            if (now - lastMethodClickRef.current < 300) return;
            lastMethodClickRef.current = now;
            if (isMethodSelected) {
              setSelectedFunctionCtx(null);
            } else {
              setSelectedFunctionCtx({
                functionId: fn.id,
                fileId: file.id,
                packageId: pkg.id,
                serviceId: svc.id,
                functionName: fn.name,
              });
              // Zoom to the selected method
              if (containerRef?.current) {
                const rect = containerRef.current.getBoundingClientRect();
                zoomTo(mx, my, 6, rect.width, rect.height);
              }
            }
          }}
          onMouseEnter={() =>
            setHoveredElement({
              type: "method",
              id: fn.id,
            })
          }
          onMouseLeave={() => setHoveredElement(null)}
        />
        {/* Method label — radially outward, density-aware */}
        {(() => {
          const totalMethods = methodPositions.length;
          const isHovered =
            hoveredElement?.type === "method" && hoveredElement.id === fn.id;
          const isEntryPoint = fn.role === "entry-point";

          // Determine if this label should show
          const showLabel =
            totalMethods <= 15 ||
            isHovered ||
            isMethodSelected ||
            (totalMethods <= 35 && isEntryPoint);

          if (!showLabel) return null;

          const labelR = methodR + 6;
          const lx = mx + Math.cos(angle) * labelR;
          const ly = my + Math.sin(angle) * labelR;
          const isRight = Math.cos(angle) >= 0;
          const fontSize = totalMethods > 35 ? 3.5 : 4.5;
          const maxChars = totalMethods > 25 ? 16 : 25;

          return (
            <text
              x={lx}
              y={ly}
              textAnchor={isRight ? "start" : "end"}
              dominantBaseline="central"
              fill={roleColor}
              fontSize={fontSize}
              fontFamily="'JetBrains Mono', monospace"
              fontWeight={isMethodSelected ? 700 : isEntryPoint ? 600 : 400}
              opacity={dimmed ? 0.15 : 0.9}
              className="pointer-events-none"
              style={{
                animation: `fadeInBand 0.3s ease ${mi * 40 + 100}ms both`,
              }}
            >
              {fn.name.length > maxChars
                ? fn.name.slice(0, maxChars - 3) + "..."
                : fn.name}
              ()
            </text>
          );
        })()}
      </g>
    );
  });
};

export const MemoizedMethodCircles = memo(MethodCircles);
