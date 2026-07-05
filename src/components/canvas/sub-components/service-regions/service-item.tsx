import { FUNCTION_ROLE_COLORS } from "@/data/transform-data";
import { CallChainEdgesProps } from "@/hooks/canvas/use-call-chain-edges";
import { usePRAffectedData } from "@/hooks/canvas/use-pr-affected-data";
import {
  getComponentFunctions,
  getHighSeverityCount,
  getServiceAnomalies,
} from "@/lib/canvas/get-data";
import { getServiceFiles } from "@/lib/canvas/get-files";
import { getPackagePositions } from "@/lib/canvas/get-positions";
import {
  fileHealthScore,
  getServiceHealth,
  healthToColor,
} from "@/lib/canvas/health-score";
import { computeMethodRings } from "@/lib/canvas/method-layout";
import { changeToColor } from "@/lib/canvas/utils";
import {
  getCompositionRingData,
  PositionedFile,
  TIER_CONFIG,
} from "@/lib/fileLayout";
import { useAnalysis } from "@/store/use-analysis-store";
import { useFocusStore } from "@/store/use-focus-store";
import { useHoverStore } from "@/store/use-hover-store";
import { useNavigationStore } from "@/store/use-navigation-store";
import { useSelectionStore } from "@/store/use-selection-store";
import { useUIStore } from "@/store/use-ui-store";
import { useViewportStore } from "@/store/use-viewport-store";
import { MonoFile, MonoService, PackageData } from "@/types/analysis";
import { memo, RefObject, useCallback, useMemo, useRef } from "react";
import {
  paperCellFill,
  paperMark,
  paperStatusFill,
  useIsPaper,
} from "../canvas-theme";
import { MemoizedMethodCircles as MethodCircles } from "./method-circle";
import PRGlowRing from "./pr-glow-ring";

export interface ServiceRegionProps extends Omit<
  CallChainEdgesProps,
  "servicePosRef"
> {
  semanticGhostServices: Set<string>;
  ghostServices: Set<string>;
  callChainServiceIds: Set<string>;
  isCallChainActive: boolean;
  isFocusIsolated: boolean;
  regionColor: (id: string, isShared: boolean) => string;
  regionOpacity: (id: string) => number;
  handleRegionClick: (id: string) => void;
  isFlowActive: boolean;
  selectedAnomaly: string | null;
  containerRef: RefObject<HTMLDivElement>;
  setSelectedAnomaly: (id: string | null) => void;
}

interface ServiceItemProps extends ServiceRegionProps {
  svc: MonoService;
  regionColor: (id: string, isShared: boolean) => string;
  regionOpacity: (id: string) => number;
  blobPaths: Record<string, string>;
  landmarks: Record<
    string,
    {
      name: string;
      x: number;
      y: number;
    }[]
  >;
  getFilePositions: (
    pkg: PackageData,
    files: MonoFile[],
    cxOverride?: number,
    cyOverride?: number,
    radiusOverride?: number
  ) => PositionedFile[];
}

const ServiceItem = ({
  blobPaths,
  svc,
  regionColor,
  regionOpacity,
  semanticGhostServices,
  ghostServices,
  callChainServiceIds,
  isCallChainActive,
  isFocusIsolated,
  isFlowActive,
  handleRegionClick,
  selectedAnomaly,
  setSelectedAnomaly,
  containerRef,
  filePosRef,
  landmarks,
  methodPosRef,
  getFilePositions,
}: ServiceItemProps) => {
  const dependencies =
    useAnalysis((s) => s.transformedData?.dependencies) || [];
  const PACKAGE_ROLES =
    useAnalysis((s) => s.transformedData?.PACKAGE_ROLES) || {};
  const anomalies = useAnalysis((s) => s.transformedData?.anomalies) || [];
  const prData = useAnalysis((s) => s.transformedData?.prData) || null;
  const SERVICE_COLORS =
    useAnalysis((s) => s.transformedData?.serviceColors) || [];

  const semanticZoomLevel = useViewportStore((s) => s.semanticZoomLevel);
  const zoomTo = useViewportStore((s) => s.zoomTo);

  const activeView = useUIStore((state) => state.activeView);
  const healthSubStain = useUIStore((state) => state.healthSubStain);
  const prMode = useUIStore((state) => state.prMode);
  const timelineMonth = useUIStore((state) => state.timelineMonth);
  const loadPhase = useUIStore((state) => state.loadPhase);

  const hoveredElement = useHoverStore((state) => state.hoveredElement);
  const setHoveredElement = useHoverStore((state) => state.setHoveredElement);
  const blastTarget = useHoverStore((state) => state.blastTarget);
  const setBlastTarget = useHoverStore((state) => state.setBlastTarget);

  const focusedServiceId = useFocusStore((state) => state.focusedServiceId);
  const focusedPackageId = useFocusStore((state) => state.focusedPackageId);
  const focusedFileId = useFocusStore((state) => state.focusedFileId);
  const setFocusedPackageId = useFocusStore((s) => s.setFocusedPackageId);
  const setFocusedFileId = useFocusStore((s) => s.setFocusedFileId);

  const pushNavigation = useNavigationStore((state) => state.pushNavigation);

  const selectedFunctionCtx = useSelectionStore((s) => s.selectedFunctionCtx);
  const setSelectedFunctionCtx = useSelectionStore(
    (s) => s.setSelectedFunctionCtx
  );

  const {
    prAffectedFileIds,
    prAffectedPackages,
    prAffectedServices,
    resolveService,
  } = usePRAffectedData();

  const isHovered = useHoverStore((s) => s.hoveredElement?.id === svc.id);
  const isPrAffected = prMode && prAffectedServices.has(svc.id);
  const isGhost = prMode && ghostServices.has(svc.id);
  const isSemanticGhost = prMode && semanticGhostServices.has(svc.id);
  const isBlastSelected = blastTarget === svc.id;
  const files = getServiceFiles(svc.id);
  const anomalyCount = getHighSeverityCount(svc.id);
  const totalAnomalies = getServiceAnomalies(svc.id).length;

  // Focus isolation: skip rendering non-focused services almost entirely when deeply zoomed
  const isFocusedService = focusedServiceId === svc.id;
  const hasConnectedMethod = callChainServiceIds.has(svc.id);
  const isPrRelevant = isPrAffected || isGhost || isSemanticGhost;
  const serviceIsolationOpacity = isCallChainActive
    ? hasConnectedMethod
      ? 0.85
      : 0.15
    : isFocusIsolated && !isFocusedService
      ? 0.03
      : 1;

  // ── Double-click guard for method circles ──
  const lastMethodClickRef = useRef(0);

  // Theme adapters for JS-computed colors — identity in dark mode
  // (see ../canvas-theme.tsx), so dark stays pixel-identical.
  const isPaper = useIsPaper();
  const cell = (c: string) => (isPaper ? paperCellFill(c) : c);
  const status = (c: string) => (isPaper ? paperStatusFill(c) : c);
  const mark = (c: string) => (isPaper ? paperMark(c) : c);

  // In PR mode, hide services that have no affected/ghost files (Principle 8: Strategic Abstraction)
  if (prMode && !isPrRelevant) return null;

  return (
    <g
      key={svc.id}
      opacity={loadPhase >= 1 ? serviceIsolationOpacity : 0}
      style={{
        transition: "opacity 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
        // TODO: temporarily commented out, check and see if needed
        // transitionDelay: isFocusIsolated ? "0ms" : `${si * 80}ms`,
      }}
    >
      {/* Blob */}
      <path
        d={blobPaths[svc.id]}
        fill={regionColor(svc.id, false)}
        opacity={regionOpacity(svc.id)}
        stroke={
          activeView === "boundaries"
            ? dependencies.some(
                (d) => d.isViolation && (d.from === svc.id || d.to === svc.id)
              )
              ? "var(--cw-danger)"
              : "var(--cw-ok-stroke)"
            : isHovered
              ? "var(--cw-region-stroke-hover)"
              : "var(--cw-region-stroke)"
        }
        strokeWidth={
          activeView === "boundaries"
            ? dependencies.some(
                (d) => d.isViolation && (d.from === svc.id || d.to === svc.id)
              )
              ? 3
              : 2
            : isHovered
              ? 2.5
              : 1.5
        }
        strokeDasharray={
          activeView === "boundaries" &&
          dependencies.some(
            (d) => d.isViolation && (d.from === svc.id || d.to === svc.id)
          )
            ? "8 4"
            : "none"
        }
        style={{ transition: "fill 0.45s, stroke 0.3s, opacity 0.45s" }}
        onMouseEnter={() => setHoveredElement({ type: "service", id: svc.id })}
        onMouseLeave={() => setHoveredElement(null)}
        onClick={() => handleRegionClick(svc.id)}
        className="cursor-pointer"
      />

      {/* PR glow ring — thickness scales with changed file count.
                Uses an outer soft halo + crisp inner ring so the affected
                services pop against the dark background; the previous
                single thin stroke at 0.7 opacity was easy to miss. */}
      {isPrAffected && <PRGlowRing svc={svc} />}

      {/* Statistical ghost indicator */}
      {isGhost && (
        <>
          <path
            d={blobPaths[svc.id]}
            fill="none"
            stroke="var(--cw-caller-soft)"
            strokeWidth={2}
            strokeDasharray="6 4"
            opacity={0.6}
            className="pointer-events-none"
          />
          <g className="pointer-events-none">
            <circle
              cx={svc.cx - svc.radius * 0.65}
              cy={svc.cy - svc.radius * 0.55}
              r={11}
              fill="hsl(200, 45%, 35%)"
              stroke="hsl(200, 50%, 50%)"
              strokeWidth={1.5}
              strokeDasharray="3 2"
            />
            <text
              x={svc.cx - svc.radius * 0.65}
              y={svc.cy - svc.radius * 0.55 + 4}
              textAnchor="middle"
              fill="hsl(200, 70%, 70%)"
              fontSize={12}
              fontWeight={700}
            >
              ?
            </text>
          </g>
        </>
      )}

      {/* Semantic ghost indicator (visually distinct — fainter, "~" badge) */}
      {isSemanticGhost && !isGhost && (
        <>
          <path
            d={blobPaths[svc.id]}
            fill="none"
            stroke="hsl(260, 40%, 45%)"
            strokeWidth={1.5}
            strokeDasharray="3 5"
            opacity={0.4}
            className="pointer-events-none"
          />
          <g className="pointer-events-none">
            <circle
              cx={svc.cx - svc.radius * 0.65}
              cy={svc.cy - svc.radius * 0.55}
              r={10}
              fill="hsl(260, 35%, 30%)"
              stroke="hsl(260, 40%, 50%)"
              strokeWidth={1}
              strokeDasharray="2 2"
            />
            <text
              x={svc.cx - svc.radius * 0.65}
              y={svc.cy - svc.radius * 0.55 + 4}
              textAnchor="middle"
              fill="hsl(260, 55%, 65%)"
              fontSize={12}
              fontWeight={600}
            >
              ~
            </text>
          </g>
        </>
      )}

      {/* Blast radius pulse */}
      {isBlastSelected && (
        <path
          d={blobPaths[svc.id]}
          fill="none"
          stroke="var(--cw-danger-pulse)"
          strokeWidth={4}
          className="pointer-events-none"
        >
          <animate
            attributeName="opacity"
            values="0.3;0.9;0.3"
            dur="1.2s"
            repeatCount="indefinite"
          />
        </path>
      )}

      {/* Service label — truncated to fit blob radius */}
      <text
        x={svc.cx}
        y={svc.cy - 12}
        textAnchor="middle"
        fill="var(--cw-label-hi)"
        fontSize={svc.name.length > 18 ? 11 : 14}
        fontFamily="'Space Grotesk', sans-serif"
        fontWeight={600}
        opacity={
          loadPhase >= 4
            ? isFlowActive || isCallChainActive
              ? 0.6
              : semanticZoomLevel >= 2
                ? 0.2
                : isFocusIsolated
                  ? 0.8
                  : selectedFunctionCtx
                    ? 0.3
                    : semanticZoomLevel >= 3
                      ? 0.1
                      : 1
            : 0
        }
        style={{ transition: "opacity 0.3s" }}
        className="pointer-events-none"
      >
        {(() => {
          const maxChars = Math.floor(
            (svc.radius * 1.7) / (svc.name.length > 18 ? 6.5 : 8)
          );
          return svc.name.length > maxChars
            ? svc.name.slice(0, maxChars - 1) + "\u2026"
            : svc.name;
        })()}
      </text>

      {/* Health / metric indicator */}
      <text
        x={svc.cx}
        y={svc.cy + 6}
        textAnchor="middle"
        fill="var(--cw-text-muted)"
        fontSize={10}
        fontFamily="'JetBrains Mono', monospace"
        opacity={
          loadPhase >= 4
            ? isFlowActive || isCallChainActive
              ? 0.04
              : isFocusIsolated
                ? 0.05
                : selectedFunctionCtx
                  ? 0.03
                  : semanticZoomLevel >= 3
                    ? 0.05
                    : 0.8
            : 0
        }
        style={{ transition: "opacity 0.3s" }}
        className="pointer-events-none"
      >
        {files.length} files
      </text>

      {/* Health bar — scaled to service radius */}
      {activeView === "health" &&
        (() => {
          const barW = Math.max(30, Math.min(90, svc.radius * 0.45));
          return (
            <g
              opacity={
                loadPhase >= 4
                  ? isFlowActive || isCallChainActive
                    ? 0.06
                    : 1
                  : 0
              }
              style={{ transition: "opacity 0.3s" }}
              className="pointer-events-none"
            >
              <rect
                x={svc.cx - barW / 2}
                y={svc.cy + 16}
                width={barW}
                height={4}
                rx={2}
                fill="var(--cw-track)"
              />
              <rect
                x={svc.cx - barW / 2}
                y={svc.cy + 16}
                width={barW * getServiceHealth(svc.id, healthSubStain)}
                height={4}
                rx={2}
                fill={status(
                  healthToColor(getServiceHealth(svc.id, healthSubStain))
                )}
                style={{ transition: "width 0.4s, fill 0.4s" }}
              />
            </g>
          );
        })()}

      {/* Anomaly badge on service region — count matches severity styling */}
      {totalAnomalies > 0 && loadPhase >= 5 && (
        <g
          opacity={isFlowActive || isCallChainActive ? 0.08 : 1}
          style={{ transition: "opacity 0.3s" }}
          onClick={(e) => {
            e.stopPropagation();
            const svcAnomalies = getServiceAnomalies(svc.id);
            setSelectedAnomaly(
              selectedAnomaly === svcAnomalies[0].id ? null : svcAnomalies[0].id
            );
          }}
          className="cursor-pointer"
        >
          <circle
            cx={svc.cx + svc.radius * 0.6}
            cy={svc.cy - svc.radius * 0.65}
            r={anomalyCount > 0 ? 14 : 11}
            fill={anomalyCount > 0 ? "hsl(0, 60%, 40%)" : "hsl(35, 55%, 40%)"}
            stroke={anomalyCount > 0 ? "hsl(0, 65%, 55%)" : "hsl(35, 60%, 55%)"}
            strokeWidth={1.5}
          />
          <text
            x={svc.cx + svc.radius * 0.6}
            y={svc.cy - svc.radius * 0.65 + 4}
            textAnchor="middle"
            fill="white"
            fontSize={10}
            fontWeight={700}
            fontFamily="'JetBrains Mono', monospace"
            className="pointer-events-none"
          >
            {anomalyCount > 0 ? anomalyCount : totalAnomalies}
          </text>
        </g>
      )}

      {/* Boundary violation markers */}
      {activeView === "boundaries" &&
        (() => {
          const violationCount = dependencies.filter(
            (d) => d.isViolation && (d.from === svc.id || d.to === svc.id)
          ).length;
          if (violationCount === 0) return null;
          return (
            <g
              className="pointer-events-none"
              opacity={isFlowActive || isCallChainActive ? 0.08 : 1}
              style={{ transition: "opacity 0.3s" }}
            >
              <circle
                cx={svc.cx + svc.radius * 0.7}
                cy={svc.cy - svc.radius * 0.6}
                r={12}
                fill="hsl(0, 65%, 45%)"
              />
              <text
                x={svc.cx + svc.radius * 0.7}
                y={svc.cy - svc.radius * 0.6 + 4}
                textAnchor="middle"
                fill="white"
                fontSize={10}
                fontWeight={700}
              >
                {violationCount}
              </text>
            </g>
          );
        })()}

      {/* PR new violation badge */}
      {prMode &&
        prData.newViolation &&
        (prData.newViolation.from === svc.id ||
          prData.newViolation.to === svc.id) && (
          <g className="pointer-events-none">
            <rect
              x={svc.cx + svc.radius * 0.35}
              y={svc.cy - svc.radius * 0.82}
              width={32}
              height={14}
              rx={3}
              fill="hsl(0, 70%, 45%)"
            >
              <animate
                attributeName="opacity"
                values="0.6;1;0.6"
                dur="1.5s"
                repeatCount="indefinite"
              />
            </rect>
            <text
              x={svc.cx + svc.radius * 0.35 + 16}
              y={svc.cy - svc.radius * 0.82 + 10}
              textAnchor="middle"
              fill="white"
              fontSize={7}
              fontWeight={700}
              fontFamily="'JetBrains Mono', monospace"
            >
              NEW
            </text>
          </g>
        )}

      {/* Landmarks */}
      {landmarks[svc.id]?.map((lm, li) => (
        <g
          key={`lm-${li}`}
          opacity={
            loadPhase >= 4
              ? isFlowActive || isCallChainActive
                ? 0.05
                : isFocusIsolated
                  ? 0.05
                  : 0.7
              : 0
          }
          style={{ transition: "opacity 0.4s" }}
          className="pointer-events-none"
        >
          <circle cx={lm.x} cy={lm.y} r={4} fill="var(--cw-landmark)" />
          <text
            x={lm.x + 8}
            y={lm.y + 3}
            fill="var(--cw-landmark-text)"
            fontSize={8}
            fontFamily="'JetBrains Mono', monospace"
          >
            {lm.name}
          </text>
        </g>
      ))}

      {/* Semantic zoom level 1: packages inside with role labels */}
      {semanticZoomLevel >= 1 && (
        <g opacity={0.7}>
          {getPackagePositions(svc).map((pkg) => {
            const pkgRole = PACKAGE_ROLES[pkg.id];
            const pkgFiles = getServiceFiles(svc.id).filter(
              (f) => f.pkg === pkg.name
            );
            const isFocalPkg = focusedPackageId === pkg.id;
            const isPkgIsolated = !!focusedPackageId && semanticZoomLevel >= 2;

            // Spatial expansion: when service is focused, spread packages 2.5x
            // When a package is focused, that package grows more, others shrink
            const expansionScale = isPkgIsolated
              ? isFocalPkg
                ? 2.8
                : 0.3
              : isFocusIsolated && isFocusedService
                ? 1.5
                : 1;
            const displayRadius = pkg.radius * expansionScale;

            // Spread positions outward when service is focused
            const posSpread = isFocusIsolated && isFocusedService ? 2.2 : 1;
            const displayCx = svc.cx + (pkg.cx - svc.cx) * posSpread;
            const displayCy = svc.cy + (pkg.cy - svc.cy) * posSpread;

            // Package isolation opacity
            const pkgOpacity =
              isPkgIsolated && !isFocalPkg
                ? 0.08
                : semanticZoomLevel >= 3 && !!focusedFileId && isFocalPkg
                  ? 0.04 // #20: package becomes background when file is expanded
                  : semanticZoomLevel >= 3
                    ? 0.3
                    : 0.55;

            // In PR mode, hide packages that have no affected files
            if (prMode && !prAffectedPackages.has(`${svc.id}/${pkg.name}`))
              return null;

            // optimization: if a service is focused, show only its packages(as they are anyways not visible), else show all packages for all services based on semanticZoomLevel
            if (
              (focusedServiceId && focusedServiceId === svc.id) ||
              !focusedServiceId
            )
              return (
                <g
                  key={pkg.id}
                  style={{
                    transition: "opacity 0.5s cubic-bezier(0.4,0,0.2,1)",
                  }}
                >
                  {/* PR glow on affected packages */}
                  {prMode &&
                    (() => {
                      const pkgPath = `${svc.id}/${pkg.name}`;
                      const isPkgAffected = prAffectedPackages.has(pkgPath);
                      if (!isPkgAffected) return null;
                      return (
                        <circle
                          cx={displayCx}
                          cy={displayCy}
                          r={displayRadius + 3}
                          fill="none"
                          stroke="var(--cw-warn)"
                          strokeWidth={2}
                          opacity={0.6}
                          className="pointer-events-none"
                        >
                          <animate
                            attributeName="opacity"
                            values="0.3;0.7;0.3"
                            dur="2.5s"
                            repeatCount="indefinite"
                          />
                        </circle>
                      );
                    })()}
                  <circle
                    cx={displayCx}
                    cy={displayCy}
                    r={displayRadius}
                    fill={
                      activeView === "health"
                        ? status(
                            healthToColor(
                              pkgFiles.reduce(
                                (a, f) =>
                                  a + fileHealthScore(f, healthSubStain),
                                0
                              ) / Math.max(1, pkgFiles.length)
                            )
                          )
                        : regionColor(svc.id, false)
                    }
                    opacity={pkgOpacity}
                    stroke={
                      prMode && prAffectedPackages.has(`${svc.id}/${pkg.name}`)
                        ? "hsl(35, 60%, 45%)"
                        : isHovered || hoveredElement?.id === pkg.id
                          ? "var(--cw-region-stroke-hover)"
                          : "var(--cw-pkg-stroke)"
                    }
                    strokeWidth={hoveredElement?.id === pkg.id ? 2 : 1.2}
                    style={{
                      transition:
                        "fill 0.45s, opacity 0.5s, stroke 0.2s, stroke-width 0.2s, cx 0.6s cubic-bezier(0.4,0,0.2,1), cy 0.6s cubic-bezier(0.4,0,0.2,1), r 0.6s cubic-bezier(0.4,0,0.2,1)",
                    }}
                    onMouseEnter={() =>
                      setHoveredElement({ type: "package", id: pkg.id })
                    }
                    onMouseLeave={() => setHoveredElement(null)}
                    className="cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFocusedPackageId(pkg.id);
                      setFocusedFileId(null);
                      pushNavigation({
                        label: pkg.name,
                        level: 2,
                        targetId: pkg.id,
                        cx: displayCx,
                        cy: displayCy,
                        zoom: 5,
                      });
                      if (containerRef.current) {
                        const rect =
                          containerRef.current.getBoundingClientRect();
                        zoomTo(
                          displayCx,
                          displayCy,
                          5,
                          rect.width,
                          rect.height
                        );
                      }
                    }}
                  />
                  {/* Package name label:
                           - At L1: centered inside the blob (standard)
                           - At L2+: floated above the blob edge so file cells don't clash (Principle #5)
                           - "Root" (default namespace) is suppressed entirely — adds no signal (Principle #8) */}
                  {(() => {
                    const parts = pkg.name.split(".");
                    const short =
                      parts.length > 2
                        ? parts.slice(-2).join(".")
                        : parts[parts.length - 1];
                    const isRootPkg = short.toLowerCase() === "root";
                    // At L2+ hide the "Root" label — it overlaps file cells and says nothing
                    if (isRootPkg && semanticZoomLevel >= 2) return null;
                    const labelY =
                      semanticZoomLevel >= 2
                        ? displayCy - displayRadius - 8 // above the circle at L2
                        : displayCy - 2; // centered inside at L1
                    const maxChars = Math.max(
                      8,
                      Math.floor(displayRadius * 1.2)
                    );
                    return (
                      <text
                        x={displayCx}
                        y={labelY}
                        textAnchor="middle"
                        fill="var(--cw-label-70)"
                        fontSize={semanticZoomLevel >= 2 ? 6 : 7}
                        fontFamily="'JetBrains Mono', monospace"
                        opacity={
                          isPkgIsolated && !isFocalPkg
                            ? 0.05
                            : selectedFunctionCtx
                              ? 0.05
                              : semanticZoomLevel >= 3
                                ? 0.15
                                : displayRadius < 12
                                  ? 0.15
                                  : displayRadius < 20
                                    ? 0.5
                                    : 1
                        }
                        style={{ transition: "opacity 0.3s, y 0.4s" }}
                        className="pointer-events-none"
                      >
                        {short.length > maxChars
                          ? short.slice(0, maxChars - 1) + "\u2026"
                          : short}
                      </text>
                    );
                  })()}
                  {/* Semantic role label — floated just below the package name, above the circle at L2 */}
                  {pkgRole && (
                    <text
                      x={displayCx}
                      y={
                        semanticZoomLevel >= 2
                          ? displayCy - displayRadius - 16
                          : displayCy + 8
                      }
                      textAnchor="middle"
                      fill={
                        pkgRole.confidence === "high"
                          ? "var(--cw-teal-text)"
                          : "var(--cw-teal-text-dim)"
                      }
                      fontSize={5.5}
                      fontFamily="'Space Grotesk', sans-serif"
                      fontStyle={
                        pkgRole.confidence === "medium" ? "italic" : "normal"
                      }
                      opacity={
                        isPkgIsolated && !isFocalPkg
                          ? 0.03
                          : selectedFunctionCtx
                            ? 0.03
                            : semanticZoomLevel >= 3
                              ? 0.1
                              : pkgRole.confidence === "medium"
                                ? 0.7
                                : 0.9
                      }
                      style={{ transition: "opacity 0.3s" }}
                      className="pointer-events-none"
                    >
                      {pkgRole.confidence === "medium"
                        ? `~ ${pkgRole.role}`
                        : pkgRole.role}
                    </text>
                  )}

                  {/* Composition ring at L1 — foreshadowing of file role distribution (Principle #7) */}
                  {semanticZoomLevel >= 1 &&
                    semanticZoomLevel < 2 &&
                    pkgFiles.length > 0 &&
                    (() => {
                      const segments = getCompositionRingData(pkgFiles);
                      if (segments.length === 0) return null;
                      const ringRadius = displayRadius * 0.85;
                      let startAngle = -Math.PI / 2; // Start from top
                      return (
                        <g
                          className="pointer-events-none"
                          opacity={
                            isPkgIsolated && !isFocalPkg
                              ? 0.03
                              : selectedFunctionCtx
                                ? 0.03
                                : 0.45
                          }
                          style={{ transition: "opacity 0.3s" }}
                        >
                          {segments.map((seg, si) => {
                            const sweepAngle = seg.fraction * Math.PI * 2;
                            const endAngle = startAngle + sweepAngle;
                            const x1 =
                              displayCx + Math.cos(startAngle) * ringRadius;
                            const y1 =
                              displayCy + Math.sin(startAngle) * ringRadius;
                            const x2 =
                              displayCx + Math.cos(endAngle) * ringRadius;
                            const y2 =
                              displayCy + Math.sin(endAngle) * ringRadius;
                            const largeArc = sweepAngle > Math.PI ? 1 : 0;
                            const d = `M ${x1} ${y1} A ${ringRadius} ${ringRadius} 0 ${largeArc} 1 ${x2} ${y2}`;
                            const el = (
                              <path
                                key={`cr-${si}`}
                                d={d}
                                fill="none"
                                stroke={mark(seg.color)}
                                strokeWidth={2}
                                strokeLinecap="round"
                              />
                            );
                            startAngle = endAngle;
                            return el;
                          })}
                        </g>
                      );
                    })()}

                  {/* Zoom level 2: files within packages — tier-based visual hierarchy */}
                  {semanticZoomLevel >= 2 &&
                    semanticZoomLevel < 3 &&
                    (() => {
                      const filePositions = getFilePositions(
                        pkg,
                        pkgFiles,
                        displayCx,
                        displayCy,
                        displayRadius
                      );
                      return filePositions.map(
                        ({ file, x, y, size, displaySize, tier, isAnchor }) => {
                          const tierCfg = TIER_CONFIG[tier];
                          const fileColor =
                            activeView === "health"
                              ? status(
                                  healthToColor(
                                    fileHealthScore(file, healthSubStain)
                                  )
                                )
                              : activeView === "change"
                                ? status(
                                    changeToColor(file.lastModifiedMonths)
                                  )
                                : cell(
                                    SERVICE_COLORS[svc.id] ||
                                      "hsl(210, 30%, 45%)"
                                  );
                          const timelineDimmed =
                            activeView === "change" &&
                            file.lastModifiedMonths > timelineMonth + 1;
                          const isPrFile =
                            prMode && prAffectedFileIds.has(file.id);
                          const isPrAdded =
                            prMode &&
                            prData.filesAdded.some(
                              (f) =>
                                file.path === f ||
                                file.path.endsWith(f) ||
                                f.endsWith(file.path)
                            );
                          // Ghost matching is PATH-ONLY on purpose: ghost
                          // candidates are specific files (see
                          // prOverlayToPRData). A service-level clause here
                          // once marked every file of a called service with
                          // "?" — whole-canvas question marks on most PRs.
                          const isPrGhost =
                            prMode &&
                            prData.ghostCandidates.some(
                              (f) =>
                                file.path === f ||
                                file.path.endsWith(f) ||
                                f.endsWith(file.path)
                            );
                          const isPrSemanticGhost =
                            prMode &&
                            (prData.semanticGhosts || []).some(
                              (f) =>
                                file.path === f ||
                                file.path.endsWith(f) ||
                                f.endsWith(file.path)
                            );
                          const isPrUnaffected =
                            prMode &&
                            !isPrFile &&
                            !isPrAdded &&
                            !isPrGhost &&
                            !isPrSemanticGhost;
                          const fileAnomaly = anomalies.find(
                            (a) =>
                              file.id.includes(a.affectedElement) ||
                              file.path.includes(a.affectedElement)
                          );
                          const isHoveredFile = hoveredElement?.id === file.id;

                          // In PR mode, hide unaffected files entirely (Principle 8: Strategic Abstraction)
                          if (isPrUnaffected && !isHoveredFile) return null;

                          // Suppressed files: on hover, elevate to ambient visuals
                          const effectiveTier =
                            tier === "suppressed" && isHoveredFile
                              ? "ambient"
                              : tier;
                          const effectiveOpacity = isCallChainActive
                            ? 0.08
                            : timelineDimmed
                              ? 0.15
                              : isPrFile
                                ? 0.9
                                : isPrAdded
                                  ? 0.85
                                  : isHoveredFile && tier === "suppressed"
                                    ? 0.7
                                    : tierCfg.fillOpacity;
                          const effectiveR =
                            isHoveredFile && tier === "suppressed"
                              ? size * TIER_CONFIG.ambient.radiusMultiplier
                              : displaySize;
                          const effectiveStroke = isPrFile
                            ? "var(--cw-warn-strong)"
                            : isPrAdded
                              ? "var(--cw-added)"
                              : isPrGhost
                                ? "var(--cw-caller-soft)"
                                : isPrSemanticGhost
                                  ? "hsl(260, 40%, 50%)"
                                  : isHoveredFile
                                    ? "var(--cw-region-stroke-hover)"
                                    : tierCfg.strokeColor;
                          let effectiveStrokeW =
                            isPrFile || isPrAdded
                              ? 1.5
                              : isPrGhost || isPrSemanticGhost
                                ? 1
                                : isHoveredFile
                                  ? 1.5
                                  : tierCfg.strokeWidth;
                          const strokeFinal = effectiveStroke;

                          return (
                            <g key={file.id}>
                              {/* Anchor glow ring (Principle #21: Visual Anchor) */}
                              {isAnchor && (
                                <circle
                                  cx={x}
                                  cy={y}
                                  r={effectiveR + 2}
                                  fill="none"
                                  stroke={mark(
                                    SERVICE_COLORS[svc.id] ||
                                      "hsl(210, 30%, 45%)"
                                  )}
                                  strokeWidth={2}
                                  opacity={isCallChainActive ? 0.03 : 0.3}
                                  filter="url(#anchor-glow)"
                                  className="pointer-events-none"
                                />
                              )}
                              <circle
                                cx={x}
                                cy={y}
                                r={effectiveR}
                                fill={fileColor}
                                opacity={effectiveOpacity}
                                stroke={strokeFinal}
                                strokeWidth={effectiveStrokeW}
                                strokeDasharray={
                                  isPrGhost
                                    ? "3 2"
                                    : isPrSemanticGhost
                                      ? "2 3"
                                      : "none"
                                }
                                style={{
                                  transition:
                                    "fill 0.45s, stroke 0.2s, stroke-width 0.2s, opacity 0.3s, r 0.3s",
                                }}
                                onMouseEnter={() =>
                                  setHoveredElement({
                                    type: "file",
                                    id: file.id,
                                  })
                                }
                                onMouseLeave={() => setHoveredElement(null)}
                                className="cursor-pointer"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (activeView === "blast-radius") {
                                    setBlastTarget(file.id);
                                  } else if (containerRef.current) {
                                    const rect =
                                      containerRef.current.getBoundingClientRect();
                                    // Zoom to L3 and immediately expand the file —
                                    // so methods are visible on the first click, not the second.
                                    setFocusedFileId(file.id);
                                    setSelectedFunctionCtx(null);
                                    zoomTo(x, y, 8, rect.width, rect.height);
                                  }
                                }}
                              />

                              {/* P4: Foreshadowing bands — focal tier only (Principle #8) */}
                              {tierCfg.foreshadowingVisible &&
                                (() => {
                                  const fileFns = getComponentFunctions(
                                    file.id
                                  );
                                  const roleCounts: Record<string, number> = {};
                                  for (const fn of fileFns) {
                                    roleCounts[fn.role] =
                                      (roleCounts[fn.role] || 0) +
                                      fn.complexity;
                                  }
                                  const totalC =
                                    Object.values(roleCounts).reduce(
                                      (a, b) => a + b,
                                      0
                                    ) || 1;
                                  const bands = Object.entries(roleCounts).sort(
                                    ([, a], [, b]) => b - a
                                  );
                                  const bandW = effectiveR * 1.6;
                                  // Band sits below both file-name (+5) and role label (+10, font-size 3.5)
                                  const bandY2 = y + effectiveR + 13;
                                  let bx = x - bandW / 2;
                                  return bands.map(([role, count], bi) => {
                                    const w = bandW * (count / totalC);
                                    const color = mark(
                                      FUNCTION_ROLE_COLORS[
                                        role as keyof typeof FUNCTION_ROLE_COLORS
                                      ] || "hsl(220, 15%, 40%)"
                                    );
                                    const el = (
                                      <rect
                                        key={`fb-${bi}`}
                                        x={bx}
                                        y={bandY2}
                                        width={w}
                                        height={1.5}
                                        rx={0.5}
                                        fill={color}
                                        opacity={isCallChainActive ? 0.04 : 0.6}
                                        className="pointer-events-none"
                                      />
                                    );
                                    bx += w;
                                    return el;
                                  });
                                })()}

                              {/* File name label — tier-based visibility and truncation */}
                              {(tier === "focal" || isHoveredFile) && (
                                <text
                                  x={x}
                                  y={y + effectiveR + 5}
                                  textAnchor="middle"
                                  fill="var(--cw-file-label)"
                                  fontSize={tierCfg.labelFontSize}
                                  fontWeight={tierCfg.labelFontWeight}
                                  fontFamily="'JetBrains Mono', monospace"
                                  opacity={isCallChainActive ? 0.05 : 1}
                                  className="pointer-events-none"
                                >
                                  {(() => {
                                    const n = file.name.replace(
                                      /\.(ts|cs|js)$/,
                                      ""
                                    );
                                    const maxChars = isAnchor
                                      ? 50
                                      : tierCfg.labelMaxChars;
                                    return n.length > maxChars
                                      ? n.slice(0, maxChars - 1) + "\u2026"
                                      : n;
                                  })()}
                                </text>
                              )}
                              {/* Suppressed file: hover-reveal label with dark background */}
                              {tier === "suppressed" && isHoveredFile && (
                                <>
                                  <rect
                                    x={x - 20}
                                    y={y - effectiveR - 14}
                                    width={40}
                                    height={10}
                                    rx={2}
                                    fill="var(--cw-hoverlabel-bg)"
                                    opacity={0.9}
                                    className="pointer-events-none"
                                  />
                                  <text
                                    x={x}
                                    y={y - effectiveR - 6}
                                    textAnchor="middle"
                                    fill="var(--cw-label-75)"
                                    fontSize={3.5}
                                    fontFamily="'JetBrains Mono', monospace"
                                    className="pointer-events-none"
                                  >
                                    {file.name
                                      .replace(/\.(ts|cs|js)$/, "")
                                      .slice(0, 20)}
                                  </text>
                                </>
                              )}
                              {/* Semantic role on file — focal tier only at L2 */}
                              {tier === "focal" && (
                                <text
                                  x={x}
                                  y={
                                    y + effectiveR + (tierCfg.labelFontSize + 5)
                                  }
                                  textAnchor="middle"
                                  fill={
                                    file.confidence === "high"
                                      ? "var(--cw-teal-file-role)"
                                      : "var(--cw-teal-text-faint)"
                                  }
                                  fontSize={3.5}
                                  fontFamily="'Space Grotesk', sans-serif"
                                  fontStyle={
                                    file.confidence === "medium"
                                      ? "italic"
                                      : "normal"
                                  }
                                  opacity={
                                    isCallChainActive
                                      ? 0.03
                                      : file.confidence === "medium"
                                        ? 0.6
                                        : 0.8
                                  }
                                  className="pointer-events-none"
                                >
                                  {file.confidence === "medium"
                                    ? `~ ${file.semanticRole}`
                                    : file.semanticRole}
                                </text>
                              )}
                              {/* PR ghost badges on files */}
                              {isPrGhost && (
                                <text
                                  x={x + effectiveR + 2}
                                  y={y - effectiveR}
                                  fill="var(--cw-ghost-glyph)"
                                  fontSize={6}
                                  fontWeight={700}
                                  opacity={isCallChainActive ? 0.05 : 1}
                                  className="pointer-events-none"
                                >
                                  ?
                                </text>
                              )}
                              {isPrSemanticGhost && (
                                <text
                                  x={x + effectiveR + 2}
                                  y={y - effectiveR}
                                  fill="var(--cw-sghost-glyph)"
                                  fontSize={6}
                                  fontWeight={600}
                                  opacity={isCallChainActive ? 0.05 : 1}
                                  className="pointer-events-none"
                                >
                                  ~
                                </text>
                              )}
                              {/* Anomaly badge on file */}
                              {fileAnomaly && activeView === "health" && (
                                <g
                                  opacity={isCallChainActive ? 0.06 : 1}
                                  style={{ transition: "opacity 0.3s" }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedAnomaly(
                                      selectedAnomaly === fileAnomaly.id
                                        ? null
                                        : fileAnomaly.id
                                    );
                                  }}
                                  className="cursor-pointer"
                                >
                                  <circle
                                    cx={x + effectiveR}
                                    cy={y - effectiveR}
                                    r={3}
                                    fill={
                                      fileAnomaly.severity === "high"
                                        ? "var(--cw-danger)"
                                        : "hsl(35, 55%, 50%)"
                                    }
                                  />
                                  <text
                                    x={x + effectiveR}
                                    y={y - effectiveR + 1.5}
                                    textAnchor="middle"
                                    fill="white"
                                    fontSize={3}
                                    fontWeight={700}
                                    className="pointer-events-none"
                                  >
                                    !
                                  </text>
                                </g>
                              )}
                            </g>
                          );
                        }
                      );
                    })()}

                  {/* PR mode: show count of hidden files */}
                  {prMode &&
                    semanticZoomLevel >= 2 &&
                    semanticZoomLevel < 3 &&
                    (() => {
                      const pkgFiles = getServiceFiles(svc.id).filter(
                        (f) => f.pkg === pkg.name
                      );
                      const hiddenCount = pkgFiles.filter(
                        (f) => !prAffectedFileIds.has(f.id)
                      ).length;
                      if (hiddenCount === 0) return null;
                      return (
                        <text
                          x={displayCx}
                          y={displayCy + displayRadius - 4}
                          textAnchor="middle"
                          fontSize={6}
                          fontFamily="'JetBrains Mono', monospace"
                          fill="var(--cw-text-faint)"
                          className="pointer-events-none"
                        >
                          +{hiddenCount} files
                        </text>
                      );
                    })()}

                  {/* Zoom level 3: Files as circles with tier-based visual hierarchy, click to expand methods */}
                  {semanticZoomLevel >= 3 &&
                    (() => {
                      const filePositions = getFilePositions(
                        pkg,
                        pkgFiles,
                        displayCx,
                        displayCy,
                        displayRadius
                      );
                      // Populate file position registry for call chain lines
                      for (const fp of filePositions) {
                        filePosRef.current.set(fp.file.id, {
                          x: fp.x,
                          y: fp.y,
                          size: fp.size,
                        });
                      }
                      const anyFileExpanded = !!focusedFileId;
                      return filePositions.map(
                        ({ file, x, y, size, displaySize, tier, isAnchor }) => {
                          const tierCfg = TIER_CONFIG[tier];
                          const isExpanded = focusedFileId === file.id;

                          // Functions for expanded file — show all methods
                          const allFns = isExpanded
                            ? getComponentFunctions(file.id)
                            : [];
                          const count = allFns.length;

                          const baseExpandedR = Math.min(pkg.radius * 0.7, 45);

                          // Dynamically scale the divider so radius growth slows down for huge files
                          // Derived from empirical testing: 85 methods -> ~2.4, 207 methods -> ~3.1
                          const slope = (3.1 - 2.4) / (207 - 85);
                          const dynamicDivider = Math.max(
                            1.5,
                            2.4 + (count - 85) * slope
                          );

                          const expandedR =
                            count > 20
                              ? baseExpandedR + count / dynamicDivider
                              : baseExpandedR;

                          // At L3, tier-based sizing for unexpanded; labels always visible for focal+ambient
                          const l3DisplayR = isExpanded
                            ? expandedR
                            : displaySize * 1.2;
                          const fileColor = cell(
                            SERVICE_COLORS[svc.id] || "hsl(210, 30%, 45%)"
                          );
                          const prDimmed =
                            prMode && !prAffectedFileIds.has(file.id);
                          const isHoveredFile = hoveredElement?.id === file.id;

                          // In PR mode at L3, hide unaffected files (same as L2)
                          if (prDimmed && !isHoveredFile && !isExpanded)
                            return null;

                          // Layout method circles in a multi-ring spiral inside the expanded circle
                          const methodPositions = computeMethodRings(
                            allFns,
                            expandedR,
                            x,
                            y,
                            (fnId, { mx, my, methodR }) => {
                              // Populate method position registry for call chain lines
                              methodPosRef.current.set(fnId, {
                                x: mx,
                                y: my,
                                r: methodR,
                                fileId: file.id,
                                serviceId: svc.id,
                              });
                            }
                          );

                          // Opacity at L3: tier-aware but more generous than L2
                          const l3Opacity = prDimmed
                            ? 0.25
                            : isExpanded
                              ? 0.85
                              : anyFileExpanded
                                ? 0.06 // #5/#20: siblings fade to ground when a file is expanded
                                : selectedFunctionCtx
                                  ? 0.25
                                  : isHoveredFile
                                    ? 0.8
                                    : Math.max(tierCfg.fillOpacity, 0.45); // Floor at 0.45 for L3 readability

                          return (
                            <g key={file.id}>
                              {/* Anchor glow ring at L3 (Principle #21) */}
                              {isAnchor && !isExpanded && (
                                <circle
                                  cx={x}
                                  cy={y}
                                  r={l3DisplayR + 2}
                                  fill="none"
                                  stroke={mark(
                                    SERVICE_COLORS[svc.id] ||
                                      "hsl(210, 30%, 45%)"
                                  )}
                                  strokeWidth={2}
                                  opacity={selectedFunctionCtx ? 0.05 : 0.3}
                                  filter="url(#anchor-glow)"
                                  className="pointer-events-none"
                                />
                              )}
                              {/* File circle */}
                              <circle
                                cx={x}
                                cy={y}
                                r={l3DisplayR}
                                fill={
                                  isExpanded
                                    ? "var(--cw-node-fill-deep)"
                                    : fileColor
                                }
                                opacity={l3Opacity}
                                stroke={
                                  isExpanded
                                    ? "var(--cw-expanded-stroke)"
                                    : isHoveredFile
                                      ? "var(--cw-region-stroke-hover)"
                                      : tierCfg.strokeColor
                                }
                                strokeWidth={
                                  isExpanded
                                    ? 1.5
                                    : isHoveredFile
                                      ? 1.5
                                      : tierCfg.strokeWidth
                                }
                                style={{
                                  transition:
                                    "r 0.4s cubic-bezier(0.4,0,0.2,1), fill 0.3s, opacity 0.3s, stroke 0.2s, stroke-width 0.2s",
                                  pointerEvents: anyFileExpanded
                                    ? "none"
                                    : "auto",
                                }}
                                className="cursor-pointer"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (isExpanded) {
                                    setFocusedFileId(null);
                                    setSelectedFunctionCtx(null);
                                  } else {
                                    setFocusedFileId(file.id);
                                    setSelectedFunctionCtx(null);
                                  }
                                }}
                                onMouseEnter={() =>
                                  setHoveredElement({
                                    type: "file",
                                    id: file.id,
                                  })
                                }
                                onMouseLeave={() => setHoveredElement(null)}
                              />

                              {/* File label — at L3 all tiers get labels */}
                              <text
                                x={x}
                                y={
                                  isExpanded
                                    ? y - expandedR - 8
                                    : y + l3DisplayR + 5
                                }
                                textAnchor="middle"
                                fill={
                                  isExpanded
                                    ? "var(--cw-label-80)"
                                    : "var(--cw-file-label-dim)"
                                }
                                fontSize={
                                  isExpanded ? 7 : tier === "focal" ? 5 : 4
                                }
                                opacity={
                                  !isExpanded &&
                                  (selectedFunctionCtx || anyFileExpanded)
                                    ? 0.05
                                    : 1
                                }
                                fontWeight={
                                  isExpanded ? 600 : tierCfg.labelFontWeight
                                }
                                className="pointer-events-none"
                              >
                                {(() => {
                                  const n = file.name.replace(
                                    /\.(ts|cs|js)$/,
                                    ""
                                  );
                                  const maxChars = isAnchor
                                    ? 50
                                    : tier === "focal"
                                      ? 30
                                      : 14;
                                  return n.length > maxChars
                                    ? n.slice(0, maxChars - 1) + "\u2026"
                                    : n;
                                })()}
                              </text>

                              {/* Semantic role — visible for focal + ambient at L3 */}
                              {!isExpanded && tier !== "suppressed" && (
                                <text
                                  x={x}
                                  y={y + l3DisplayR + 8.5}
                                  textAnchor="middle"
                                  fill="var(--cw-teal-text-dim)"
                                  fontSize={3}
                                  fontFamily="'Space Grotesk', sans-serif"
                                  opacity={
                                    selectedFunctionCtx
                                      ? 0.05
                                      : tier === "focal"
                                        ? 1
                                        : 0.7
                                  }
                                  className="pointer-events-none"
                                >
                                  {file.semanticRole}
                                </text>
                              )}

                              {/* Foreshadowing bands on unexpanded circles — focal only */}
                              {!isExpanded &&
                                tier === "focal" &&
                                (() => {
                                  const fileFns = getComponentFunctions(
                                    file.id
                                  );
                                  const roleCounts: Record<string, number> = {};
                                  for (const fn of fileFns) {
                                    roleCounts[fn.role] =
                                      (roleCounts[fn.role] || 0) +
                                      fn.complexity;
                                  }
                                  const totalC =
                                    Object.values(roleCounts).reduce(
                                      (a, b) => a + b,
                                      0
                                    ) || 1;
                                  const bands = Object.entries(roleCounts).sort(
                                    ([, a], [, b]) => b - a
                                  );
                                  const bandW = l3DisplayR * 1.6;
                                  // Band sits below both file-name label (+5) and semantic-role label (+8.5)
                                  const bandY2 = y + l3DisplayR + 12;
                                  let bx = x - bandW / 2;
                                  return bands.map(([role, count], bi) => {
                                    const w = bandW * (count / totalC);
                                    const color = mark(
                                      FUNCTION_ROLE_COLORS[
                                        role as keyof typeof FUNCTION_ROLE_COLORS
                                      ] || "hsl(220, 15%, 40%)"
                                    );
                                    const el = (
                                      <rect
                                        key={`fb-${bi}`}
                                        x={bx}
                                        y={bandY2}
                                        width={w}
                                        height={1.5}
                                        rx={0.5}
                                        fill={color}
                                        opacity={
                                          selectedFunctionCtx ? 0.05 : 0.5
                                        }
                                        className="pointer-events-none"
                                      />
                                    );
                                    bx += w;
                                    return el;
                                  });
                                })()}

                              {/* Method circles inside expanded file */}
                              {isExpanded && (
                                <MethodCircles
                                  svc={svc}
                                  pkg={pkg}
                                  containerRef={containerRef}
                                  y={y}
                                  x={x}
                                  methodPositions={methodPositions}
                                  lastMethodClickRef={lastMethodClickRef}
                                  allFns={allFns}
                                  file={file}
                                />
                              )}
                            </g>
                          );
                        }
                      );
                    })()}
                </g>
              );
          })}
        </g>
      )}
    </g>
  );
};

export default memo(ServiceItem);
