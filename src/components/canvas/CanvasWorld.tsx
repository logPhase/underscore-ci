import { FUNCTION_ROLE_COLORS } from "@/data/transform-data";
import { useBlobPaths } from "@/hooks/canvas/use-blob-paths";
import { useCallChainEdges } from "@/hooks/canvas/use-call-chain-edges";
import { useCallChainNodes } from "@/hooks/canvas/use-call-chain-nodes";
import { useDepPaths } from "@/hooks/canvas/use-dep-paths";
import useJourneyData from "@/hooks/canvas/use-journey-data";
import { usePRAffectedData } from "@/hooks/canvas/use-pr-affected-data";
import { computeBlastRadius, quadBezierPoint } from "@/lib/canvas/compute";
import {
  getFlowForFunction,
  getRegionCenter,
  getServiceChangeRecency,
} from "@/lib/canvas/get-data";
import { getPackagePositions } from "@/lib/canvas/get-positions";
import { getServiceHealth, healthToColor } from "@/lib/canvas/health-score";
import { changeToColor, depLineStyle } from "@/lib/canvas/utils";
import { useAnalysis } from "@/store/use-analysis-store";
import { useFocusStore } from "@/store/use-focus-store";
import { useHoverStore } from "@/store/use-hover-store";
import { useNavigationStore } from "@/store/use-navigation-store";
import { useSelectionStore } from "@/store/use-selection-store";
import { useUIStore } from "@/store/use-ui-store";
import { useViewportStore } from "@/store/use-viewport-store";
import {
  RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { PositionedGroupRegion } from "@/types/grouping";
import CallChain from "./sub-components/call-chain";
import { MemoizedCallChainEdges } from "./sub-components/call-chain-edges";
import {
  paperMark,
  paperRegionFill,
  paperStatusFill,
  useIsPaper,
} from "./sub-components/canvas-theme";
import GroupRegions from "./sub-components/group-regions";
import JourneyCanvas from "./sub-components/journey";
import ServiceRegion from "./sub-components/service-regions";

interface Props {
  containerRef: RefObject<HTMLDivElement>;
  didDragRef: RefObject<boolean>;
}

interface Particle {
  depIdx: number;
  progress: number;
  speed: number;
}

export function CanvasWorld({ containerRef, didDragRef }: Props) {
  const transformedData = useAnalysis((state) => state.transformedData);

  const {
    services,
    sharedLibs,
    dependencies,
    anomalies,
    serviceColors,
    prData,
  } = transformedData;
  const prGhostCandidates = prData?.ghostCandidates;
  const SERVICE_COLORS = serviceColors;
  const { prAffectedServices, resolveService } = usePRAffectedData();

  const semanticZoomLevel = useViewportStore((s) => s.semanticZoomLevel);
  const zoomTo = useViewportStore((s) => s.zoomTo);

  const activeView = useUIStore((state) => state.activeView);
  const healthSubStain = useUIStore((state) => state.healthSubStain);
  const prMode = useUIStore((state) => state.prMode);
  const loadPhase = useUIStore((state) => state.loadPhase);

  const setHoveredElement = useHoverStore((state) => state.setHoveredElement);
  const blastTarget = useHoverStore((state) => state.blastTarget);
  const setBlastTarget = useHoverStore((state) => state.setBlastTarget);

  const focusedServiceId = useFocusStore((state) => state.focusedServiceId);

  const setFocusedServiceId = useFocusStore(
    (state) => state.setFocusedServiceId
  );
  const setFocusedPackageId = useFocusStore(
    (state) => state.setFocusedPackageId
  );
  const setFocusedFileId = useFocusStore((state) => state.setFocusedFileId);

  const selectedFunctionCtx = useSelectionStore(
    (state) => state.selectedFunctionCtx
  );
  const setSelectedFunctionCtx = useSelectionStore(
    (state) => state.setSelectedFunctionCtx
  );
  const setCallChainNodes = useSelectionStore(
    (state) => state.setCallChainNodes
  );
  const activeCallChain = useSelectionStore((state) => state.activeCallChain);
  const setActiveCallChain = useSelectionStore(
    (state) => state.setActiveCallChain
  );
  const setCallChainCursorFqn = useSelectionStore(
    (state) => state.setCallChainCursorFqn
  );

  const pushNavigation = useNavigationStore((state) => state.pushNavigation);

  const { journeyServiceIds, activePhaseStepFqns, isJourneyActive } =
    useJourneyData();
  const [selectedAnomaly, setSelectedAnomaly] = useState<string | null>(null);
  const [expandedCollapse, setExpandedCollapse] = useState<Set<string>>(
    new Set()
  );
  const [chainDirection, setChainDirection] = useState<"fan-out" | "fan-in">(
    "fan-out"
  );

  // Cross-module flow detection — activates for any function in a participating service
  const activeFlow = useMemo(() => {
    if (!selectedFunctionCtx) return null;
    return getFlowForFunction(
      selectedFunctionCtx.functionName,
      selectedFunctionCtx.serviceId
    );
  }, [selectedFunctionCtx]);

  // Compute world-space positions for flow nodes
  const flowNodePositions = useMemo(() => {
    if (!activeFlow) return [];
    return activeFlow.nodes.map((node) => {
      const svc = services.find((s) => s.id === node.serviceId);
      if (!svc) return { node, x: 0, y: 0 };
      const pkgs = getPackagePositions(svc);
      const pkg = pkgs.find((p) => p.name === node.packageName);
      const x = pkg ? pkg.cx : svc.cx;
      const y = pkg ? pkg.cy : svc.cy;
      return { node, x, y };
    });
  }, [activeFlow, services]);

  // Auto zoom-out when flow activates to show the full path
  const prevFlowId = useRef<string | null>(null);
  useEffect(() => {
    if (!activeFlow || !containerRef.current) {
      prevFlowId.current = null;
      return;
    }
    if (prevFlowId.current === activeFlow.id) return;
    prevFlowId.current = activeFlow.id;

    // Compute bounding box of all flow nodes with generous padding
    const xs = flowNodePositions.map((p) => p.x);
    const ys = flowNodePositions.map((p) => p.y);
    const padding = 180;
    const minX = Math.min(...xs) - padding;
    const maxX = Math.max(...xs) + padding;
    const minY = Math.min(...ys) - padding;
    const maxY = Math.max(...ys) + padding;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const rect = containerRef.current.getBoundingClientRect();
    const scaleX = rect.width / (maxX - minX);
    const scaleY = rect.height / (maxY - minY);
    const targetZoom = Math.min(scaleX, scaleY) * 0.8;
    zoomTo(
      cx,
      cy,
      Math.max(0.3, Math.min(targetZoom, 0.6)),
      rect.width,
      rect.height
    );
  }, [activeFlow, flowNodePositions, containerRef, zoomTo]);

  const isFlowActive = !!activeFlow;

  // ── Position registries for call chain lines ──
  // Populated during render by the method/file/service loops, read by callChainEdges memo.
  const methodPosRef = useRef<
    Map<
      string,
      { x: number; y: number; r: number; fileId: string; serviceId: string }
    >
  >(new Map());
  const filePosRef = useRef<
    Map<string, { x: number; y: number; size: number }>
  >(new Map());
  const servicePosRef = useRef<
    Map<string, { cx: number; cy: number; radius: number }>
  >(new Map());

  // Keep service positions always up-to-date (includes both services AND sharedLibs)
  useEffect(() => {
    const map = new Map<string, { cx: number; cy: number; radius: number }>();
    for (const s of services)
      map.set(s.id, { cx: s.cx, cy: s.cy, radius: s.radius });
    for (const s of sharedLibs)
      map.set(s.id, { cx: s.cx, cy: s.cy, radius: s.radius });
    servicePosRef.current = map;
  }, [services, sharedLibs]);

  // ── Call chain nodes — spine-based cross-service highlight ──
  const callChainNodes = useCallChainNodes({
    servicePosRef,
    filePosRef,
    methodPosRef,
    expandedCollapse,
    chainDirection,
  });

  // Sync callChainNodes to context and manage frozen chain state
  useEffect(() => {
    if (!selectedFunctionCtx) {
      // Selection cleared — clear everything
      if (!isJourneyActive) {
        setActiveCallChain(null);
        setCallChainCursorFqn(null);
      }
      setCallChainNodes([]);
      return;
    }

    // Skip call chain computation when a journey is active —
    // method clicks during journey mode just highlight, don't trigger chain
    if (isJourneyActive) return;

    if (activeCallChain !== null) {
      // A frozen chain already exists. Check if the newly selected function is
      // part of that chain (i.e. user is navigating within the panel) or is a
      // completely different method (i.e. user clicked a new method directly).
      const isWithinChain = activeCallChain.some(
        (n) => n.fqn === selectedFunctionCtx.functionId
      );
      if (!isWithinChain) {
        // New method outside the existing chain — reset and freeze a new chain
        if (callChainNodes.length > 1) {
          setActiveCallChain(callChainNodes);
          setCallChainCursorFqn(selectedFunctionCtx.functionId);
          setCallChainNodes(callChainNodes);
        } else {
          // New method has no connections — clear the stale chain
          setActiveCallChain(null);
          setCallChainCursorFqn(null);
          setCallChainNodes(callChainNodes);
        }
      }
      // If within the chain, don't replace it (user is navigating via the panel)
    } else if (callChainNodes.length > 1) {
      // No frozen chain yet, selection has connections — freeze it
      setActiveCallChain(callChainNodes);
      setCallChainCursorFqn(selectedFunctionCtx.functionId);
      setCallChainNodes(callChainNodes);
    } else {
      // No chain, just sync (single node or empty)
      setCallChainNodes(callChainNodes);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFunctionCtx, callChainNodes]);

  // Auto zoom-out when a NEW chain is frozen — not for cursor movements within existing chain
  const prevCallChainId = useRef<string | null>(null);
  useEffect(() => {
    if (!activeCallChain || activeCallChain.length <= 1) {
      prevCallChainId.current = null;
      return;
    }

    // Don't zoom-out if a cross-module flow is active (flow overlay handles its own zoom)
    if (activeFlow) return;

    const chainId = activeCallChain.map((n) => n.fqn).join("|");
    if (chainId === prevCallChainId.current) return;
    prevCallChainId.current = chainId;

    // Compute bounding box of all call chain nodes
    const xs = activeCallChain.map((n) => n.x);
    const ys = activeCallChain.map((n) => n.y);
    const padding = 200;
    const minX = Math.min(...xs) - padding;
    const maxX = Math.max(...xs) + padding;
    const minY = Math.min(...ys) - padding;
    const maxY = Math.max(...ys) + padding;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const scaleX = rect.width / (maxX - minX);
    const scaleY = rect.height / (maxY - minY);
    const targetZoom = Math.min(scaleX, scaleY) * 0.75;

    const clampedZoom = Math.max(0.3, Math.min(targetZoom, 2.0));
    zoomTo(cx, cy, clampedZoom, rect.width, rect.height);
  }, [activeCallChain, activeFlow, containerRef, zoomTo]);

  const callChainEdges = useCallChainEdges({
    methodPosRef,
    filePosRef,
    servicePosRef,
  });

  const blobPaths = useBlobPaths();

  // Dep line paths
  const depPaths = useDepPaths();

  // Flow particles
  const [particles, setParticles] = useState<Particle[]>([]);
  const animFrameRef = useRef<number>(0);

  useEffect(() => {
    if (activeView !== "flow") {
      return;
    }
    const ps: Particle[] = [];
    depPaths.forEach((dp, i) => {
      const count = Math.max(1, Math.floor(dp.dep.importCount / 5));
      for (let j = 0; j < count; j++) {
        ps.push({
          depIdx: i,
          progress: j / count,
          speed: 0.003 + dp.dep.importCount * 0.0002,
        });
      }
    });
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setParticles(ps);
    const tick = () => {
      setParticles((prev) =>
        prev.map((p) => ({ ...p, progress: (p.progress + p.speed) % 1 }))
      );
      animFrameRef.current = requestAnimationFrame(tick);
    };
    animFrameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [activeView, depPaths]);

  // Blast radius distances
  const blastDistances = useMemo(() => {
    if (activeView !== "blast-radius" || !blastTarget) return null;
    return computeBlastRadius(blastTarget);
  }, [activeView, blastTarget]);

  // Theme adapters for JS-computed colors — identity in dark mode, so the
  // dark canvas stays pixel-identical (see sub-components/canvas-theme.tsx).
  const isPaper = useIsPaper();
  const region = useCallback(
    (c: string) => (isPaper ? paperRegionFill(c) : c),
    [isPaper]
  );
  const status = useCallback(
    (c: string) => (isPaper ? paperStatusFill(c) : c),
    [isPaper]
  );
  const mark = useCallback(
    (c: string) => (isPaper ? paperMark(c) : c),
    [isPaper]
  );

  // Color for a region based on active view
  const regionColor = useCallback(
    (id: string, isShared: boolean) => {
      switch (activeView) {
        case "structure":
          return isShared
            ? region("hsl(210, 15%, 22%)")
            : region(SERVICE_COLORS[id] || "hsl(210,30%,40%)");
        case "health":
          return status(healthToColor(getServiceHealth(id, healthSubStain)));
        case "flow":
          return isShared
            ? region("hsl(210,15%,15%)")
            : region(SERVICE_COLORS[id] || "hsl(210,30%,30%)");
        case "change":
          return status(changeToColor(getServiceChangeRecency(id)));
        case "blast-radius": {
          if (!blastDistances) return region("hsl(220, 12%, 18%)");
          const dist = blastDistances.get(id);
          if (dist === undefined) return region("hsl(220, 8%, 14%)");
          if (dist === 0) return status("hsl(0, 75%, 55%)");
          if (dist === 1) return status("hsl(35, 70%, 52%)");
          if (dist === 2) return status("hsl(55, 55%, 45%)");
          return status("hsl(80, 35%, 35%)");
        }
        case "boundaries":
          return isShared
            ? region("hsl(210, 15%, 18%)")
            : region(SERVICE_COLORS[id] || "hsl(210,30%,35%)");
        default:
          return region("hsl(210, 20%, 25%)");
      }
    },
    [
      activeView,
      SERVICE_COLORS,
      healthSubStain,
      services,
      blastDistances,
      region,
      status,
    ]
  );

  // Focus isolation: when zoomed into a service, everything else fades
  const isFocusIsolated = !!focusedServiceId && semanticZoomLevel >= 1;
  const isCallChainActive =
    (activeCallChain?.length || callChainNodes.length) > 1 && !isFlowActive;

  // Precompute services that contain connected methods
  const callChainServiceIds = useMemo(() => {
    if (!isCallChainActive) return new Set<string>();
    const chainToUse = activeCallChain || callChainNodes;
    return new Set(chainToUse.map((n) => n.service));
  }, [isCallChainActive, activeCallChain, callChainNodes]);

  const regionOpacity = useCallback(
    (id: string) => {
      // Journey active — dim non-journey services
      if (isJourneyActive) {
        if (activePhaseStepFqns) {
          // Phase isolation: only phase services bright
          return journeyServiceIds.has(id) ? 0.12 : 0.03;
        }
        return journeyServiceIds.has(id) ? 0.35 : 0.08;
      }
      if (isFlowActive) {
        const inFlow = activeFlow!.nodes.some((n) => n.serviceId === id);
        return inFlow ? 0.35 : 0.1;
      }
      // Call chain active — dim services without connected methods
      if (isCallChainActive) {
        return callChainServiceIds.has(id) ? 0.35 : 0.08;
      }
      // Focus isolation — non-focused services nearly invisible
      if (isFocusIsolated && id !== focusedServiceId) return 0.03;
      if (isFocusIsolated && id === focusedServiceId) return 0.15; // subtle boundary
      if (activeView === "flow") return 0.45;
      if (
        activeView === "blast-radius" &&
        blastDistances &&
        !blastDistances.has(id)
      )
        return 0.2;
      return 0.6;
    },
    [
      isJourneyActive,
      activePhaseStepFqns,
      journeyServiceIds,
      isFlowActive,
      activeFlow,
      isCallChainActive,
      callChainServiceIds,
      isFocusIsolated,
      focusedServiceId,
      activeView,
      blastDistances,
    ]
  );

  const ghostServices = useMemo(() => {
    if (!prMode || !prGhostCandidates) return new Set<string>();
    return new Set(prGhostCandidates.map((f) => resolveService(f)));
  }, [prGhostCandidates, prMode, resolveService]);

  const semanticGhostServices = useMemo(() => {
    if (!prMode || !prGhostCandidates) return new Set<string>();
    return new Set((prGhostCandidates || []).map((f) => resolveService(f)));
  }, [prGhostCandidates, prMode, resolveService]);

  // Click handler
  const handleRegionClick = useCallback(
    (id: string) => {
      if (didDragRef.current) return;
      if (activeView === "blast-radius") {
        setBlastTarget(blastTarget === id ? null : id);
        return;
      }
      const region = getRegionCenter(id);
      if (!region || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const svc = services.find((s) => s.id === id);
      setFocusedServiceId(svc ? svc.id : null);
      setFocusedPackageId(null);
      setFocusedFileId(null);
      if (svc) {
        pushNavigation({
          label: svc.name,
          level: 1,
          targetId: svc.id,
          cx: region.cx,
          cy: region.cy,
          zoom: 2.2,
        });
      }
      zoomTo(region.cx, region.cy, 2.2, rect.width, rect.height);
    },
    [
      didDragRef,
      activeView,
      containerRef,
      services,
      setFocusedServiceId,
      setFocusedPackageId,
      setFocusedFileId,
      zoomTo,
      setBlastTarget,
      blastTarget,
      pushNavigation,
    ]
  );

  // Group hull click — zoom to the group's neighborhood and drop a
  // breadcrumb, mirroring handleRegionClick (level 0: above services).
  const handleGroupClick = useCallback(
    (group: PositionedGroupRegion) => {
      if (didDragRef.current) return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      pushNavigation({
        label: group.name,
        level: 0,
        targetId: group.id,
        cx: group.cx,
        cy: group.cy,
        zoom: 1.4,
      });
      zoomTo(group.cx, group.cy, 1.4, rect.width, rect.height);
    },
    [didDragRef, containerRef, pushNavigation, zoomTo]
  );

  // Clear focus isolation when the user zooms back to overview (P20: Focus+Context).
  // Without this, focusedServiceId stays stale after panning/escaping, keeping
  // other service regions at 0.03 opacity (effectively invisible).
  useEffect(() => {
    if (semanticZoomLevel < 1) {
      setFocusedServiceId(null);
    }
  }, [semanticZoomLevel, setFocusedServiceId]);

  const allRelevant = useMemo(() => {
    if (!prMode) return new Set<string>();
    return new Set([
      ...prAffectedServices,
      ...ghostServices,
      ...semanticGhostServices,
    ]);
  }, [prMode, prAffectedServices, ghostServices, semanticGhostServices]);

  return (
    <>
      {/* SVG defs for glow filters */}
      <defs>
        <filter id="call-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
        <filter id="anchor-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" />
        </filter>
      </defs>
      {/* Group hulls — under everything else (visual ground, #5); present
          only while the agent grouping is applied and toggled visible.
          Renders nothing when the run has no grouping. */}
      <GroupRegions
        onGroupClick={handleGroupClick}
        prMode={prMode}
        prRelevantServiceIds={allRelevant}
      />
      {/* Dependency lines */}
      {loadPhase >= 3 &&
        depPaths.map((dp, i) => {
          // In PR mode, hide dep lines between unaffected services
          if (prMode) {
            if (!allRelevant.has(dp.dep.from) && !allRelevant.has(dp.dep.to))
              return null;
          }
          const style = depLineStyle(dp.dep, activeView);
          return (
            <path
              key={`dep-${i}`}
              d={dp.path}
              fill="none"
              stroke={style.stroke}
              strokeWidth={style.strokeWidth}
              strokeDasharray={style.dasharray}
              opacity={
                isFlowActive || isCallChainActive
                  ? 0.04
                  : isFocusIsolated
                    ? 0.02
                    : style.opacity
              }
              style={{
                cursor: "crosshair",
                transition: "stroke 0.45s, opacity 0.45s, stroke-width 0.3s",
              }}
              onMouseEnter={() =>
                setHoveredElement({
                  type: "dep",
                  id: `${dp.dep.from}-${dp.dep.to}`,
                })
              }
              onMouseLeave={() => setHoveredElement(null)}
              className="pointer-events-stroke"
              strokeLinecap="round"
            />
          );
        })}

      {/* Flow particles */}
      {activeView === "flow" &&
        particles.map((p, i) => {
          const dp = depPaths[p.depIdx];
          if (!dp) return null;
          const from = getRegionCenter(dp.dep.from);
          const to = getRegionCenter(dp.dep.to);
          if (!from || !to) return null;
          const [px, py] = quadBezierPoint(
            from.cx,
            from.cy,
            dp.cx,
            dp.cy,
            to.cx,
            to.cy,
            p.progress
          );
          return (
            <circle
              key={`particle-${i}`}
              cx={px}
              cy={py}
              r={3}
              fill="var(--cw-particle)"
              opacity={isCallChainActive ? 0.06 : 0.85}
              className="pointer-events-none"
            />
          );
        })}

      {/* Shared code regions */}
      {loadPhase >= 2 &&
        sharedLibs
          .filter(
            (lib) =>
              !prMode ||
              prAffectedServices.has(lib.id) ||
              ghostServices.has(lib.id) ||
              semanticGhostServices.has(lib.id)
          )
          .map((lib) => (
            <g key={lib.id}>
              <path
                d={blobPaths[lib.id]}
                fill={regionColor(lib.id, true)}
                opacity={regionOpacity(lib.id) * 0.55}
                stroke="var(--cw-shared-stroke)"
                strokeWidth={1.2}
                strokeDasharray="6 4 2 4"
                style={{ transition: "fill 0.45s, opacity 0.45s" }}
                onMouseEnter={() =>
                  setHoveredElement({ type: "shared", id: lib.id })
                }
                onMouseLeave={() => setHoveredElement(null)}
                onClick={() => handleRegionClick(lib.id)}
                className="cursor-pointer"
              />
              <text
                x={lib.cx}
                y={lib.cy - 4}
                textAnchor="middle"
                fill="var(--cw-label-65)"
                fontSize={11}
                fontFamily="'Space Grotesk', sans-serif"
                fontWeight={500}
                opacity={
                  loadPhase >= 4
                    ? isFlowActive
                      ? 0.08
                      : isCallChainActive
                        ? callChainServiceIds.has(lib.id)
                          ? 0.3
                          : 0.05
                        : isFocusIsolated
                          ? 0.03
                          : 0.9
                    : 0
                }
                style={{ transition: "opacity 0.3s" }}
                className="pointer-events-none"
              >
                {lib.name}
              </text>
              <text
                x={lib.cx}
                y={lib.cy + 12}
                textAnchor="middle"
                fill="var(--cw-text-dim)"
                fontSize={8}
                fontFamily="'JetBrains Mono', monospace"
                opacity={
                  loadPhase >= 4
                    ? isFlowActive
                      ? 0.05
                      : isCallChainActive
                        ? callChainServiceIds.has(lib.id)
                          ? 0.2
                          : 0.03
                        : isFocusIsolated
                          ? 0.02
                          : 0.7
                    : 0
                }
                style={{ transition: "opacity 0.3s" }}
                className="pointer-events-none"
              >
                shared
              </text>
            </g>
          ))}

      {/* Service regions */}
      <ServiceRegion
        containerRef={containerRef}
        semanticGhostServices={semanticGhostServices}
        selectedAnomaly={selectedAnomaly}
        setSelectedAnomaly={setSelectedAnomaly}
        isFlowActive={isFlowActive}
        ghostServices={ghostServices}
        callChainServiceIds={callChainServiceIds}
        isCallChainActive={isCallChainActive}
        isFocusIsolated={isFocusIsolated}
        regionColor={regionColor}
        regionOpacity={regionOpacity}
        handleRegionClick={handleRegionClick}
        filePosRef={filePosRef}
        methodPosRef={methodPosRef}
      />

      {/* ── Call chain lines (L3 within-file/cross-file edges) ── */}
      {/* Suppress when the cross-service overlay is active to avoid duplicate edges */}
      {semanticZoomLevel >= 3 &&
        selectedFunctionCtx &&
        callChainEdges.length > 0 &&
        !isCallChainActive && (
          <MemoizedCallChainEdges
            methodPosRef={methodPosRef}
            callChainEdges={callChainEdges}
          />
        )}

      {/* Blast radius prompt */}
      {activeView === "blast-radius" && !blastTarget && loadPhase >= 5 && (
        <text
          x={1000}
          y={50}
          textAnchor="middle"
          fill="var(--cw-blast-prompt)"
          fontSize={13}
          fontFamily="'Space Grotesk', sans-serif"
          className="pointer-events-none"
        >
          Click any region to see its blast radius
        </text>
      )}

      {/* Blast radius counter + what-if explanation */}
      {activeView === "blast-radius" && blastTarget && blastDistances && (
        <g className="pointer-events-none">
          <text
            x={1000}
            y={50}
            textAnchor="middle"
            fill="var(--cw-blast-text)"
            fontSize={13}
            fontFamily="'Space Grotesk', sans-serif"
          >
            Affects {blastDistances.size - 1} regions across{" "}
            {
              new Set(
                [...blastDistances.keys()].filter((k) =>
                  services.some((s) => s.id === k)
                )
              ).size
            }{" "}
            services
          </text>
          {(() => {
            const explanation =
              blastDistances.size > 1
                ? `Changing ${blastTarget.split(".").pop() || blastTarget} would affect ${blastDistances.size - 1} connected region${blastDistances.size > 2 ? "s" : ""} via ${dependencies.filter((d) => d.from === blastTarget || d.to === blastTarget).length} direct dependencies.`
                : null;
            if (!explanation) return null;
            return (
              <foreignObject x={700} y={60} width={600} height={60}>
                <div
                  style={{
                    background: "var(--cw-panel-bg)",
                    border: "1px solid var(--cw-panel-border)",
                    borderRadius: "6px",
                    padding: "6px 10px",
                    fontSize: "9px",
                    color: "var(--cw-text-60)",
                    fontFamily: "'Space Grotesk', sans-serif",
                    lineHeight: "1.4",
                  }}
                >
                  {explanation}
                </div>
              </foreignObject>
            );
          })()}
        </g>
      )}

      {/* Anomaly explanation popover */}
      {selectedAnomaly &&
        (() => {
          const anom = anomalies.find((a) => a.id === selectedAnomaly);
          if (!anom) return null;
          const svc = services.find((s) => s.id === anom.affectedElement);
          const px = svc ? svc.cx + svc.radius * 0.6 + 20 : 1000;
          const py = svc ? svc.cy - svc.radius * 0.65 - 10 : 200;
          return (
            <foreignObject x={px} y={py} width={280} height={140}>
              <div
                style={{
                  background: "var(--cw-panel-bg-solid)",
                  border: `1px solid ${anom.severity === "high" ? "hsl(0, 55%, 40%)" : "hsl(35, 50%, 40%)"}`,
                  borderRadius: "8px",
                  padding: "10px",
                  fontFamily: "'Space Grotesk', sans-serif",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "6px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "8px",
                      fontFamily: "'JetBrains Mono', monospace",
                      padding: "2px 6px",
                      borderRadius: "3px",
                      background:
                        anom.severity === "high"
                          ? "hsl(0, 55%, 30%)"
                          : anom.severity === "medium"
                            ? "hsl(35, 50%, 30%)"
                            : "hsl(210, 15%, 25%)",
                      color:
                        anom.severity === "high"
                          ? "hsl(0, 60%, 70%)"
                          : anom.severity === "medium"
                            ? "hsl(35, 55%, 65%)"
                            : "hsl(210, 15%, 55%)",
                    }}
                  >
                    {anom.severity} · {anom.anomalyType}
                  </span>
                  <button
                    onClick={() => setSelectedAnomaly(null)}
                    style={{
                      color: "var(--cw-text-50)",
                      fontSize: "12px",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    ✕
                  </button>
                </div>
                <div
                  style={{
                    fontSize: "10px",
                    fontWeight: 600,
                    color: "var(--cw-label-82)",
                    marginBottom: "4px",
                  }}
                >
                  {anom.shortDescription}
                </div>
                <div
                  style={{
                    fontSize: "8px",
                    color: "var(--cw-text-muted)",
                    lineHeight: "1.5",
                    fontStyle:
                      anom.confidence === "medium" ? "italic" : "normal",
                  }}
                >
                  {anom.confidence === "medium" && (
                    <span style={{ color: "var(--cw-text-42)" }}>~ </span>
                  )}
                  {anom.explanation}
                </div>
              </div>
            </foreignObject>
          );
        })()}

      {/* Cross-module flow overlay */}
      {isFlowActive &&
        flowNodePositions.length > 1 &&
        (() => {
          const selectedNodeId = activeFlow!.nodes.find(
            (n) => n.functionName === selectedFunctionCtx?.functionName
          )?.id;

          return (
            <g className="pointer-events-none">
              {/* SVG defs for glow filter */}
              <defs>
                <filter
                  id="flow-glow"
                  x="-50%"
                  y="-50%"
                  width="200%"
                  height="200%"
                >
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter
                  id="flow-glow-strong"
                  x="-50%"
                  y="-50%"
                  width="200%"
                  height="200%"
                >
                  <feGaussianBlur stdDeviation="8" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="blur" />
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* Flow path lines — bezier curves between consecutive nodes */}
              {flowNodePositions.map((pos, i) => {
                if (i === 0) return null;
                const prev = flowNodePositions[i - 1];
                const dx = pos.x - prev.x;
                const dy = pos.y - prev.y;
                const cpx1 = prev.x + dx * 0.4;
                const cpy1 = prev.y + dy * 0.1;
                const cpx2 = prev.x + dx * 0.6;
                const cpy2 = prev.y + dy * 0.9;
                const pathD = `M ${prev.x} ${prev.y} C ${cpx1} ${cpy1}, ${cpx2} ${cpy2}, ${pos.x} ${pos.y}`;
                const roleColor = mark(
                  FUNCTION_ROLE_COLORS[pos.node.role] || "hsl(180, 55%, 50%)"
                );

                return (
                  <g key={`flow-line-${i}`}>
                    {/* Outer glow */}
                    <path
                      d={pathD}
                      fill="none"
                      stroke={roleColor}
                      strokeWidth={6}
                      opacity={0.15}
                      filter="url(#flow-glow)"
                    />
                    {/* Main line */}
                    <path
                      d={pathD}
                      fill="none"
                      stroke={roleColor}
                      strokeWidth={2}
                      opacity={0.7}
                      strokeDasharray="8 4"
                    >
                      <animate
                        attributeName="stroke-dashoffset"
                        from="24"
                        to="0"
                        dur="1s"
                        repeatCount="indefinite"
                      />
                    </path>
                  </g>
                );
              })}

              {/* Flow node circles — clickable with background labels */}
              {flowNodePositions.map((pos, i) => {
                const roleColor = mark(
                  FUNCTION_ROLE_COLORS[pos.node.role] || "hsl(180, 55%, 50%)"
                );
                const isSelected = pos.node.id === selectedNodeId;
                const nodeR = isSelected ? 18 : 12;
                const labelY = pos.y + nodeR + 10;
                const fileName = pos.node.fileName.replace(/\.ts$/, "");

                return (
                  <g
                    key={`flow-node-${i}`}
                    className="pointer-events-auto cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedFunctionCtx({
                        functionId: pos.node.id,
                        fileId: `${pos.node.serviceId}/${pos.node.packageName}/${pos.node.fileName}`,
                        packageId: `${pos.node.serviceId}/${pos.node.packageName}`,
                        serviceId: pos.node.serviceId,
                        functionName: pos.node.functionName,
                      });
                    }}
                  >
                    {/* Outer glow ring for selected */}
                    {isSelected && (
                      <circle
                        cx={pos.x}
                        cy={pos.y}
                        r={nodeR + 6}
                        fill="none"
                        stroke={roleColor}
                        strokeWidth={2}
                        opacity={0.4}
                        filter="url(#flow-glow-strong)"
                      >
                        <animate
                          attributeName="r"
                          values={`${nodeR + 4};${nodeR + 8};${nodeR + 4}`}
                          dur="2s"
                          repeatCount="indefinite"
                        />
                        <animate
                          attributeName="opacity"
                          values="0.3;0.6;0.3"
                          dur="2s"
                          repeatCount="indefinite"
                        />
                      </circle>
                    )}

                    {/* Node circle */}
                    <circle
                      cx={pos.x}
                      cy={pos.y}
                      r={nodeR}
                      fill={isSelected ? roleColor : "var(--cw-node-fill-deep)"}
                      stroke={roleColor}
                      strokeWidth={isSelected ? 2.5 : 1.5}
                      opacity={1}
                      filter={isSelected ? "url(#flow-glow)" : "none"}
                    />

                    {/* Step number */}
                    <text
                      x={pos.x}
                      y={pos.y + 4}
                      textAnchor="middle"
                      fill={isSelected ? "var(--cw-on-accent)" : roleColor}
                      fontSize={10}
                      fontWeight={700}
                      fontFamily="'JetBrains Mono', monospace"
                      className="pointer-events-none"
                    >
                      {i + 1}
                    </text>

                    {/* Label background to prevent overlap */}
                    <rect
                      x={pos.x - 55}
                      y={labelY - 8}
                      width={110}
                      height={32}
                      rx={4}
                      fill="var(--cw-scrim)"
                      opacity={0.9}
                      className="pointer-events-none"
                    />

                    {/* Function name label */}
                    <text
                      x={pos.x}
                      y={labelY + 2}
                      textAnchor="middle"
                      fill={roleColor}
                      fontSize={7}
                      fontWeight={isSelected ? 700 : 500}
                      fontFamily="'JetBrains Mono', monospace"
                      opacity={isSelected ? 1 : 0.9}
                      className="pointer-events-none"
                    >
                      {pos.node.functionName}()
                    </text>

                    {/* File/class + service context */}
                    <text
                      x={pos.x}
                      y={labelY + 14}
                      textAnchor="middle"
                      fill="var(--cw-text-muted)"
                      fontSize={5.5}
                      fontFamily="'Space Grotesk', sans-serif"
                      opacity={0.8}
                      className="pointer-events-none"
                    >
                      {fileName} · {pos.node.serviceId}
                    </text>
                  </g>
                );
              })}

              {/* Flow title */}
              <foreignObject
                x={flowNodePositions[0].x - 150}
                y={flowNodePositions[0].y - 60}
                width={300}
                height={30}
              >
                <div
                  style={{
                    textAlign: "center",
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "var(--cw-flow-title)",
                    textShadow: "0 0 12px var(--cw-flow-title-glow)",
                  }}
                >
                  {activeFlow!.name} · {activeFlow!.nodes.length} steps
                </div>
              </foreignObject>
            </g>
          );
        })()}

      <CallChain
        isCallChainActive={isCallChainActive}
        chainDirection={chainDirection}
        setExpandedCollapse={setExpandedCollapse}
        setChainDirection={setChainDirection}
        expandedCollapse={expandedCollapse}
      />
      <JourneyCanvas
        methodPosRef={methodPosRef}
        servicePosRef={servicePosRef}
        activePhaseStepFqns={activePhaseStepFqns}
        filePosRef={filePosRef}
      />
    </>
  );
}
