import { FUNCTION_ROLE_COLORS } from "@/data/transform-data";
import { getComponentFunctions } from "@/lib/canvas/get-data";
import { useAnalysis } from "@/store/use-analysis-store";
import { useHoverStore } from "@/store/use-hover-store";
import { JourneyData } from "@/store/use-journey-store";
import { useSelectionStore } from "@/store/use-selection-store";
import { useViewportStore } from "@/store/use-viewport-store";
import { MethodIndexEntry } from "@/types/analysis";
import { CallChainNode } from "@/types/store";
import { useState } from "react";
import { paperMark, useIsPaper } from "./canvas-theme";

interface CallChainProps {
  isCallChainActive: boolean;
  chainDirection: "fan-out" | "fan-in";
  expandedCollapse: Set<string>;
  setExpandedCollapse: React.Dispatch<React.SetStateAction<Set<string>>>;
  setChainDirection: React.Dispatch<React.SetStateAction<"fan-out" | "fan-in">>;
}

/* Call chain overlay — spine-based highlighted method nodes across all services */
const CallChain = ({
  isCallChainActive,
  chainDirection,
  setExpandedCollapse,
  setChainDirection,
  expandedCollapse,
}: CallChainProps) => {
  const transformedData = useAnalysis((s) => s.transformedData);
  const zoom = useViewportStore((state) => state.zoom);
  const activeCallChain = useSelectionStore((s) => s.activeCallChain);
  const callChainNodes = useSelectionStore((s) => s.callChainNodes);
  const setActiveCallChain = useSelectionStore((s) => s.setActiveCallChain);
  const setCallChainCursorFqn = useSelectionStore(
    (s) => s.setCallChainCursorFqn
  );
  const setSelectedFunctionCtx = useSelectionStore(
    (s) => s.setSelectedFunctionCtx
  );
  const callChainCursorFqn = useSelectionStore((s) => s.callChainCursorFqn);
  const selectedFunctionCtx = useSelectionStore((s) => s.selectedFunctionCtx);

  const hoveredElement = useHoverStore((s) => s.hoveredElement);
  const setHoveredElement = useHoverStore((s) => s.setHoveredElement);

  const [hoveredChainNodeFqn, setHoveredChainNodeFqn] = useState<string | null>(
    null
  );
  const [refocusTransition, setRefocusTransition] = useState(false);

  const SERVICE_COLORS = transformedData?.serviceColors || {};

  // Paper-mode adapter for JS-computed colors — identity in dark mode
  // (./canvas-theme.tsx). var(--cw-*) strings pass through untouched.
  const isPaper = useIsPaper();
  const mark = (c: string) => (isPaper ? paperMark(c) : c);

  const getJourneysForFunction = (fqn: string) =>
    transformedData?.journeyByFqn.get(fqn) || [];

  const getMethodInfo = (fqn: string): MethodIndexEntry | undefined =>
    transformedData?.globalMethodIndex.get(fqn);

  return (
    isCallChainActive &&
    (() => {
      const chainToRender = activeCallChain || callChainNodes;
      const selNode = chainToRender.find((n) => n.type === "selected");
      if (!selNode) return null;

      // Zoom-dependent visible node limit
      const maxVisible =
        zoom < 0.5 ? 8 : zoom < 1.0 ? 14 : chainToRender.length;
      const allVisibleNodes = chainToRender.slice(0, maxVisible);

      // ── Side-effect detection: filter out ambient/logging functions ──
      const SIDE_EFFECT_PATTERNS =
        /\b(log|trace|record|metric|track|monitor|audit|telemetry|instrument)\b/i;
      const isSideEffect = (node: CallChainNode): boolean => {
        if (node.depth === 0 || node.nodeRole === "spine") return false; // never ambient-ify focal or spine
        if (SIDE_EFFECT_PATTERNS.test(node.name)) return true;
        // Check role if available via method lookup
        const info = getMethodInfo(node.fqn);
        if (info) {
          const fns = getComponentFunctions(info.fileId);
          const fn = fns.find((f) => f.id === node.fqn);
          if (fn?.role === "utility" && SIDE_EFFECT_PATTERNS.test(fn.name))
            return true;
        }
        return false;
      };

      const sideEffectNodes = allVisibleNodes.filter(isSideEffect);
      const visibleNodes = allVisibleNodes.filter((n) => !isSideEffect(n));

      // Build spine-ordered list for spine edge rendering (focal -> spine1 -> spine2 -> ...)
      const spineChain = visibleNodes
        .filter((n) => n.nodeRole === "spine")
        .sort((a, b) => (a.depth ?? 0) - (b.depth ?? 0));

      // Edge confidence helper — determines visual confidence from FQN patterns
      type EdgeConfidence =
        | "deterministic"
        | "framework-inferred"
        | "heuristic";
      const getEdgeConfidence = (targetFqn: string): EdgeConfidence => {
        // Interface pattern: FQN starts with "I" followed by uppercase (e.g., IFooService.Method)
        const lastDotIdx = targetFqn.lastIndexOf(".");
        const typePart =
          lastDotIdx > 0 ? targetFqn.substring(0, lastDotIdx) : targetFqn;
        const typeNameParts = typePart.split(".");
        const typeName = typeNameParts[typeNameParts.length - 1] || "";
        if (
          typeName.length > 1 &&
          typeName[0] === "I" &&
          typeName[1] === typeName[1].toUpperCase() &&
          typeName[1] !== typeName[1].toLowerCase()
        ) {
          return "heuristic";
        }
        return "deterministic";
      };

      const confidenceDasharray = (conf: EdgeConfidence, z: number): string => {
        switch (conf) {
          case "deterministic":
            return "none";
          case "framework-inferred":
            return `${8 / z} ${4 / z}`;
          case "heuristic":
            return `${3 / z} ${5 / z}`;
        }
      };

      const confidenceOpacityMult = (conf: EdgeConfidence): number => {
        switch (conf) {
          case "deterministic":
            return 1.0;
          case "framework-inferred":
            return 0.7;
          case "heuristic":
            return 0.5;
        }
      };

      // Role icon lookup for depth-1 nodes
      const roleIcon = (role: string) => {
        switch (role) {
          case "entry-point":
            return "\u25C6"; // diamond
          case "validator":
            return "\u2713"; // checkmark
          case "data-access":
            return "\u2B21"; // hexagon (database)
          case "data-transformer":
            return "\u21C4"; // transform arrows
          case "orchestrator":
            return "\u25CE"; // target/hub
          case "event-handler":
            return "\u26A1"; // lightning
          case "error-handler":
            return "\u26A0"; // warning
          case "utility":
            return "\u2699"; // gear
          default:
            return "\u2022";
        }
      };

      // Resolve function role for a node by looking up ComponentFunction data
      const getNodeRole = (fqn: string): string => {
        const info = getMethodInfo(fqn);
        if (!info) return "utility";
        const fns = getComponentFunctions(info.fileId);
        const fn = fns.find((f) => f.id === fqn);
        return fn?.role || "utility";
      };

      // ── Refocus interaction: smooth animated transition to new focal ──
      const handleChainNodeRefocus = (nodeFqn: string) => {
        const info = getMethodInfo(nodeFqn);
        if (!info) return;
        // Phase 1: fade out (150ms)
        setRefocusTransition(true);
        setTimeout(() => {
          // Phase 2: apply state changes
          setActiveCallChain(null);
          setCallChainCursorFqn(null);
          setExpandedCollapse(new Set());
          setSelectedFunctionCtx({
            functionId: nodeFqn,
            fileId: info.fileId,
            packageId: "",
            serviceId: info.service,
            functionName: info.name,
          });
          // Phase 3: fade in (250ms)
          setTimeout(() => setRefocusTransition(false), 250);
        }, 150);
      };
      // Legacy alias for double-click handlers
      const handleChainNodeDoubleClick = handleChainNodeRefocus;

      // ── Hover path highlight: compute path from hovered node back to spine ──
      const hoveredPathFqns = new Set<string>();
      if (hoveredChainNodeFqn) {
        hoveredPathFqns.add(hoveredChainNodeFqn);
        // Fan-in nodes connect to focal; branch nodes connect to focal; spine nodes connect in chain
        const hoveredNode = visibleNodes.find(
          (n) => n.fqn === hoveredChainNodeFqn
        );
        if (hoveredNode) {
          if (hoveredNode.nodeRole === "fan-in") {
            // Fan-in connects directly to focal
            hoveredPathFqns.add(selNode.fqn);
          } else if (hoveredNode.nodeRole === "branch") {
            // Branch connects to focal
            hoveredPathFqns.add(selNode.fqn);
          } else if (hoveredNode.nodeRole === "spine") {
            // Trace back through spine chain to focal
            for (const sn of spineChain) {
              hoveredPathFqns.add(sn.fqn);
              if (sn.fqn === hoveredChainNodeFqn) break;
            }
          }
        }
      }
      const isHoverActive = hoveredChainNodeFqn !== null;

      return (
        <g
          style={{
            pointerEvents: "none",
            opacity: refocusTransition ? 0.3 : 1,
            transition: "opacity 0.15s ease",
          }}
        >
          {/* ── Spine edges: thick directed path with animated particles ── */}
          {spineChain.length > 1 &&
            spineChain.slice(1).map((node, i) => {
              const prevNode = spineChain[i]; // previous spine node (i because slice(1) shifts index)
              const dx = node.x - prevNode.x;
              const dy = node.y - prevNode.y;
              const dist = Math.sqrt(dx * dx + dy * dy) || 1;
              const offset = Math.min(dist * 0.2, 35);
              const nx = (-dy / dist) * offset;
              const ny = (dx / dist) * offset;
              const cpx = (prevNode.x + node.x) / 2 + nx;
              const cpy = (prevNode.y + node.y) / 2 + ny;

              // Detect service crossing
              const fromService = prevNode.service;
              const toService = node.service;
              const crossesService = fromService !== toService;
              const midX = (prevNode.x + node.x) / 2;
              const midY = (prevNode.y + node.y) / 2;

              // Caliber encoding: spine edge thickness scales with target node importance
              const spineCaliberWidth =
                (1 + (node.importance ?? 0.5) * 3) / zoom;
              const spineGlowWidth = spineCaliberWidth * 3.3;

              // Confidence encoding for spine edges
              const spineConf = getEdgeConfidence(node.fqn);
              const spineConfDash = confidenceDasharray(spineConf, zoom);
              const spineConfOpacity = 0.7 * confidenceOpacityMult(spineConf);
              // Deterministic edges are SOLID (P9 Honest Uncertainty); only inferred/heuristic use dash patterns
              const spineMainDash = spineConfDash;

              // Midpoint for confidence indicator
              const confMidX = (prevNode.x + node.x) / 2 + nx * 0.3;
              const confMidY = (prevNode.y + node.y) / 2 + ny * 0.3;

              // Hover path: dim edges not on the hovered path
              const spineEdgeOnPath = isHoverActive
                ? hoveredPathFqns.has(prevNode.fqn) &&
                  hoveredPathFqns.has(node.fqn)
                : true;
              const spineEdgeHoverMult =
                isHoverActive && !spineEdgeOnPath ? 0.15 : 1.0;

              return (
                <g
                  key={`spine-edge-${i}`}
                  opacity={spineEdgeHoverMult}
                  style={{ transition: "opacity 0.15s ease" }}
                >
                  {/* Spine glow — wide and prominent, caliber-scaled */}
                  <path
                    d={`M ${prevNode.x} ${prevNode.y} Q ${cpx} ${cpy} ${node.x} ${node.y}`}
                    fill="none"
                    stroke="var(--cw-callee)"
                    strokeWidth={spineGlowWidth}
                    opacity={0.08 * confidenceOpacityMult(spineConf)}
                  />
                  {/* Spine main line — thick, animated, caliber-scaled, confidence-styled */}
                  <path
                    d={`M ${prevNode.x} ${prevNode.y} Q ${cpx} ${cpy} ${node.x} ${node.y}`}
                    fill="none"
                    stroke="var(--cw-callee)"
                    strokeWidth={spineCaliberWidth}
                    opacity={spineConfOpacity}
                    strokeDasharray={spineMainDash}
                  >
                    <animate
                      attributeName="stroke-dashoffset"
                      from={`${28 / zoom}`}
                      to="0"
                      dur="1.2s"
                      repeatCount="indefinite"
                    />
                  </path>
                  {/* Heuristic "?" indicator near edge midpoint */}
                  {spineConf === "heuristic" && (
                    <text
                      x={confMidX}
                      y={confMidY}
                      textAnchor="middle"
                      fontSize={Math.max(3, 7 / zoom)}
                      fill="var(--cw-callee-muted)"
                      opacity={0.6}
                      fontFamily="'JetBrains Mono', monospace"
                      style={{ pointerEvents: "none" }}
                    >
                      ?
                    </text>
                  )}
                  {/* Arrowhead at target end of spine edge */}
                  {(() => {
                    const arrowAngle = Math.atan2(node.y - cpy, node.x - cpx);
                    const aSize = 6 / zoom;
                    const ax1 = node.x - Math.cos(arrowAngle - 0.35) * aSize;
                    const ay1 = node.y - Math.sin(arrowAngle - 0.35) * aSize;
                    const ax2 = node.x - Math.cos(arrowAngle + 0.35) * aSize;
                    const ay2 = node.y - Math.sin(arrowAngle + 0.35) * aSize;
                    return (
                      <polygon
                        points={`${node.x},${node.y} ${ax1},${ay1} ${ax2},${ay2}`}
                        fill="var(--cw-callee)"
                        opacity={0.7 * confidenceOpacityMult(spineConf)}
                      />
                    );
                  })()}
                  {/* Animated particle along spine path */}
                  <circle r={3 / zoom} fill="var(--cw-callee)" opacity={0.8}>
                    <animateMotion
                      dur="2s"
                      repeatCount="indefinite"
                      path={`M ${prevNode.x} ${prevNode.y} Q ${cpx} ${cpy} ${node.x} ${node.y}`}
                    />
                  </circle>
                  {/* Service crossing membrane badge */}
                  {crossesService && (
                    <g>
                      <rect
                        x={midX - 12 / zoom}
                        y={midY - 5 / zoom}
                        width={24 / zoom}
                        height={10 / zoom}
                        rx={3 / zoom}
                        fill="var(--cw-badge-bg)"
                        stroke="hsl(210, 25%, 35%)"
                        strokeWidth={0.5 / zoom}
                      />
                      <text
                        x={midX}
                        y={midY + 2 / zoom}
                        textAnchor="middle"
                        fontSize={Math.max(2.5, 5 / zoom)}
                        fill="var(--cw-membrane-text)"
                        fontFamily="'Space Grotesk', sans-serif"
                        style={{ pointerEvents: "none" }}
                      >
                        {"\u27F6"}
                      </text>
                    </g>
                  )}
                  {/* Cross-file membrane marker (lighter than service crossing) */}
                  {!crossesService &&
                    prevNode.fileName !== node.fileName &&
                    node.fileName &&
                    prevNode.fileName && (
                      <line
                        x1={midX - 4 / zoom}
                        y1={midY - 4 / zoom}
                        x2={midX + 4 / zoom}
                        y2={midY + 4 / zoom}
                        stroke="hsl(210, 15%, 40%)"
                        strokeWidth={0.5 / zoom}
                        strokeDasharray={`${2 / zoom} ${1.5 / zoom}`}
                        opacity={0.4}
                        style={{ pointerEvents: "none" }}
                      />
                    )}
                  {/* Direction label at edge midpoint — adapts to fan-in vs fan-out */}
                  {!crossesService && (
                    <text
                      x={cpx + nx * 0.3}
                      y={cpy + ny * 0.3 - 2 / zoom}
                      textAnchor="middle"
                      fontSize={Math.max(2, 3.5 / zoom)}
                      fill={
                        chainDirection === "fan-in"
                          ? "var(--cw-caller-55)"
                          : "var(--cw-callee-muted)"
                      }
                      fontFamily="'Space Grotesk', sans-serif"
                      opacity={0.35}
                      style={{ pointerEvents: "none" }}
                    >
                      {chainDirection === "fan-in"
                        ? `${"\u2190"} called by`
                        : `calls ${"\u2192"}`}
                    </text>
                  )}
                </g>
              );
            })}

          {/* ── Branch / fan-in edges: thinner lines with arrowheads ── */}
          {/* Limit marching-ant animations to first 8 edges to cap concurrent SVG animations */}
          {visibleNodes
            .filter((n) => n.nodeRole !== "spine" && n.nodeRole !== "aggregate")
            .map((node, i) => {
              // Fan-in edges: caller → focal (node is the caller, arrow points to selNode)
              // Branch edges: focal → callee (selNode is source, arrow points to node)
              const isFanIn = node.nodeRole === "fan-in";
              const startX = isFanIn ? node.x : selNode.x;
              const startY = isFanIn ? node.y : selNode.y;
              const endX = isFanIn ? selNode.x : node.x;
              const endY = isFanIn ? selNode.y : node.y;

              const dx = endX - startX;
              const dy = endY - startY;
              const dist = Math.sqrt(dx * dx + dy * dy) || 1;
              const offset = Math.min(dist * 0.25, 40);
              const nxOff = (-dy / dist) * offset;
              const nyOff = (dx / dist) * offset;
              const cpx = (startX + endX) / 2 + nxOff;
              const cpy = (startY + endY) / 2 + nyOff;
              const edgeColor = isFanIn
                ? "var(--cw-caller)"
                : "var(--cw-callee)";
              // Caliber encoding: edge thickness scales with target node importance
              const nodeImp = node.importance ?? 0.5;
              const edgeWidth = isFanIn
                ? (0.5 + nodeImp * 1.5) / zoom // fan-in: range 0.5px-2px
                : (0.5 + nodeImp * 2) / zoom; // branch: range 0.5px-2.5px
              const baseEdgeOpacity = node.nodeRole === "branch" ? 0.4 : 0.3;
              const animateEdge = i < 8; // Cap concurrent SVG animations for performance

              // Confidence encoding for branch/fan-in edges
              const branchConf = getEdgeConfidence(node.fqn);
              const branchConfMult = confidenceOpacityMult(branchConf);
              const edgeOpacity = baseEdgeOpacity * branchConfMult;
              const branchConfDash = confidenceDasharray(branchConf, zoom);
              // Deterministic edges are SOLID; only inferred/heuristic use dash patterns
              const branchMainDash = branchConfDash;

              // Arrowhead at target end
              const angle = Math.atan2(endY - cpy, endX - cpx);
              const aSize = 5 / zoom;
              const ax1 = endX - Math.cos(angle - 0.4) * aSize;
              const ay1 = endY - Math.sin(angle - 0.4) * aSize;
              const ax2 = endX - Math.cos(angle + 0.4) * aSize;
              const ay2 = endY - Math.sin(angle + 0.4) * aSize;

              // Detect service crossing
              const fromService = isFanIn ? node.service : selNode.service;
              const toService = isFanIn ? selNode.service : node.service;
              const crossesService = fromService !== toService;
              const midX = (startX + endX) / 2;
              const midY = (startY + endY) / 2;

              // Midpoint for confidence indicator
              const branchConfMidX = (startX + endX) / 2 + nxOff * 0.3;
              const branchConfMidY = (startY + endY) / 2 + nyOff * 0.3;

              // Hover path: dim edges not on the hovered path
              const branchEdgeOnPath = isHoverActive
                ? hoveredPathFqns.has(node.fqn) &&
                  hoveredPathFqns.has(selNode.fqn)
                : true;
              const branchEdgeHoverMult =
                isHoverActive && !branchEdgeOnPath ? 0.15 : 1.0;

              return (
                <g
                  key={`ccn-line-${i}`}
                  opacity={branchEdgeHoverMult}
                  style={{ transition: "opacity 0.15s ease" }}
                >
                  {/* Glow */}
                  <path
                    d={`M ${startX} ${startY} Q ${cpx} ${cpy} ${endX} ${endY}`}
                    fill="none"
                    stroke={edgeColor}
                    strokeWidth={edgeWidth * 3}
                    opacity={0.08 * branchConfMult}
                  />
                  {/* Main line — fan-in flows TOWARD focal, confidence-styled */}
                  <path
                    d={`M ${startX} ${startY} Q ${cpx} ${cpy} ${endX} ${endY}`}
                    fill="none"
                    stroke={edgeColor}
                    strokeWidth={edgeWidth}
                    opacity={edgeOpacity}
                    strokeDasharray={branchMainDash}
                  >
                    {animateEdge && (
                      <animate
                        attributeName="stroke-dashoffset"
                        from={isFanIn ? "0" : `${20 / zoom}`}
                        to={isFanIn ? `${24 / zoom}` : "0"}
                        dur="2s"
                        repeatCount="indefinite"
                      />
                    )}
                  </path>
                  {/* Heuristic "?" indicator near edge midpoint */}
                  {branchConf === "heuristic" && (
                    <text
                      x={branchConfMidX}
                      y={branchConfMidY}
                      textAnchor="middle"
                      fontSize={Math.max(2.5, 6 / zoom)}
                      fill={edgeColor}
                      opacity={0.5}
                      fontFamily="'JetBrains Mono', monospace"
                      style={{ pointerEvents: "none" }}
                    >
                      ?
                    </text>
                  )}
                  {/* Triangle arrowhead at target end */}
                  <polygon
                    points={`${endX},${endY} ${ax1},${ay1} ${ax2},${ay2}`}
                    fill={edgeColor}
                    opacity={edgeOpacity}
                  />
                  {/* Service crossing membrane badge */}
                  {crossesService && (
                    <g>
                      <rect
                        x={midX - 12 / zoom}
                        y={midY - 5 / zoom}
                        width={24 / zoom}
                        height={10 / zoom}
                        rx={3 / zoom}
                        fill="var(--cw-badge-bg)"
                        stroke="hsl(210, 25%, 35%)"
                        strokeWidth={0.5 / zoom}
                      />
                      <text
                        x={midX}
                        y={midY + 2 / zoom}
                        textAnchor="middle"
                        fontSize={Math.max(2.5, 5 / zoom)}
                        fill="var(--cw-membrane-text)"
                        fontFamily="'Space Grotesk', sans-serif"
                        style={{ pointerEvents: "none" }}
                      >
                        {"\u27F6"}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

          {/* ── Aggregate dashed edges: from spine parent to aggregate node ── */}
          {visibleNodes
            .filter((n) => n.nodeRole === "aggregate")
            .map((aggNode, i) => {
              // Find the spine node this aggregate belongs to
              const parentFqn = aggNode.fqn.replace("aggregate-", "");
              const parentNode = visibleNodes.find((n) => n.fqn === parentFqn);
              if (!parentNode) return null;

              // Hover path dimming for aggregate edges
              const aggEdgeOnPath = isHoverActive
                ? hoveredPathFqns.has(parentFqn) &&
                  hoveredPathFqns.has(aggNode.fqn)
                : true;
              const aggEdgeHoverMult =
                isHoverActive && !aggEdgeOnPath ? 0.15 : 1.0;

              return (
                <g
                  key={`agg-edge-${i}`}
                  opacity={aggEdgeHoverMult}
                  style={{ transition: "opacity 0.15s ease" }}
                >
                  <line
                    x1={parentNode.x}
                    y1={parentNode.y}
                    x2={aggNode.x}
                    y2={aggNode.y}
                    stroke="hsl(320, 30%, 45%)"
                    strokeWidth={1 / zoom}
                    opacity={0.2}
                    strokeDasharray={`${3 / zoom} ${3 / zoom}`}
                  />
                </g>
              );
            })}

          {/* ── Method nodes with distinct shapes per nodeRole ── */}
          {visibleNodes.map((node, i) => {
            const isFocused = node.fqn === callChainCursorFqn;
            const isOriginalSelected = node.type === "selected";
            const showGold = isFocused || isOriginalSelected;
            const isFocalNode = node.depth === 0;

            // Depth-based color
            const color = showGold
              ? "var(--cw-gold)"
              : node.nodeRole === "spine"
                ? "var(--cw-callee)"
                : node.nodeRole === "fan-in"
                  ? "var(--cw-caller)"
                  : node.nodeRole === "aggregate"
                    ? "var(--cw-agg-text)"
                    : node.nodeRole === "branch"
                      ? "var(--cw-caller-soft)"
                      : node.type === "caller"
                        ? "var(--cw-caller)"
                        : "var(--cw-callee)";

            // Depth-based radius: spine=large, branch=medium, aggregate=small
            const r =
              node.nodeRole === "spine" && node.depth === 0
                ? 14 / zoom
                : node.nodeRole === "spine"
                  ? 10 / zoom
                  : node.nodeRole === "branch"
                    ? 8 / zoom
                    : node.nodeRole === "fan-in"
                      ? 9 / zoom
                      : node.nodeRole === "aggregate"
                        ? 5 / zoom
                        : 8 / zoom; // fallback

            // Depth-based opacity — floor at 0.55 so labels remain readable (WCAG AA)
            // Spine nodes stay at 1.0 opacity regardless of depth (spec §6.1)
            const nodeOpacity =
              (node.depth ?? 0) === 0
                ? 1.0
                : node.nodeRole === "spine"
                  ? 1.0
                  : Math.abs(node.depth ?? 0) === 1
                    ? 0.85
                    : (node.depth ?? 0) === 2
                      ? 0.6
                      : 0.45;

            // Smart label placement — alternate left/right based on position
            const labelOnLeft = !showGold && !isFocalNode && node.x < selNode.x;
            const textAnchor =
              showGold || isFocalNode
                ? "middle"
                : labelOnLeft
                  ? "end"
                  : "start";
            const labelOffsetX =
              showGold || isFocalNode ? 0 : labelOnLeft ? -r * 1.8 : r * 1.8;
            const labelBaseY =
              showGold || isFocalNode ? node.y - r * 2.5 : node.y;

            // Clamped font sizes — aggregate badges get a higher floor for readability at low zoom
            const methodFont =
              node.nodeRole === "aggregate"
                ? Math.max(4, Math.min(10, 10 / zoom))
                : Math.max(3, Math.min(10, 10 / zoom));
            const fileFont = Math.max(2.5, Math.min(7, 7 / zoom));
            const badgeFont = Math.max(2.5, Math.min(6, 6 / zoom));

            // Zoom-dependent label content — hide labels for aggregates (text is inside pill)
            const isAggregate = node.nodeRole === "aggregate";
            const showFile = !isAggregate && methodFont * zoom >= 5;
            const showBadge =
              !isAggregate &&
              methodFont * zoom >= 8 &&
              node.service !== selectedFunctionCtx?.serviceId;

            // Background rect dimensions (skip for aggregate — label is inside pill)
            const displayName = isAggregate ? node.name : `${node.name}()`;
            const charW = methodFont * 0.6;
            const textW = displayName.length * charW;
            const lineSpacing = methodFont * 1.3;
            const totalHeight =
              methodFont +
              (showFile ? lineSpacing : 0) +
              (showBadge ? fileFont * 1.3 : 0);
            const padX = Math.max(1.5, Math.min(4, 3 / zoom));
            const padY = Math.max(1, Math.min(3, 2 / zoom));

            const bgX =
              showGold || isFocalNode
                ? node.x - textW / 2 - padX
                : labelOnLeft
                  ? node.x + labelOffsetX - textW - padX
                  : node.x + labelOffsetX - padX;
            const bgY = labelBaseY - methodFont * 0.8 - padY;

            // Node role for role icon (depth-1 only)
            const nodeRoleStr =
              Math.abs(node.depth ?? 99) === 1 && !isAggregate
                ? getNodeRole(node.fqn)
                : "";
            const roleColor = nodeRoleStr
              ? mark(
                  FUNCTION_ROLE_COLORS[
                    nodeRoleStr as keyof typeof FUNCTION_ROLE_COLORS
                  ] || color
                )
              : color;

            // Hover path highlight: dim nodes/edges NOT on the path
            const isOnHoverPath = isHoverActive
              ? hoveredPathFqns.has(node.fqn)
              : true;
            const hoverDimMult = isHoverActive && !isOnHoverPath ? 0.15 : 1.0;
            const effectiveNodeOpacity = nodeOpacity * hoverDimMult;

            // Is this node refocusable? (non-focal spine or branch with method info)
            const canRefocus =
              !isFocalNode &&
              !isAggregate &&
              (node.nodeRole === "spine" || node.nodeRole === "branch");
            const isHoveredForRefocus =
              hoveredChainNodeFqn === node.fqn && canRefocus;

            // Mouse handlers for chain node hover + refocus
            const chainNodeMouseEnter = () => {
              setHoveredElement({ type: "method", id: node.fqn });
              setHoveredChainNodeFqn(node.fqn);
            };
            const chainNodeMouseLeave = () => {
              setHoveredElement(null);
              setHoveredChainNodeFqn(null);
            };

            return (
              <g
                key={`ccn-node-${i}`}
                opacity={hoverDimMult}
                style={{ transition: "opacity 0.15s ease" }}
              >
                {/* ── SHAPE RENDERING per nodeRole ── */}

                {/* FOCAL NODE (depth 0) — DIAMOND shape with gold pulse */}
                {isFocalNode && (
                  <>
                    {/* Diamond glow */}
                    <rect
                      x={node.x - r * 1.5}
                      y={node.y - r * 1.5}
                      width={r * 3}
                      height={r * 3}
                      transform={`rotate(45, ${node.x}, ${node.y})`}
                      fill="var(--cw-gold)"
                      opacity={0.08}
                      rx={2 / zoom}
                      style={{ pointerEvents: "none" }}
                    />
                    {/* Diamond outer (rotated square) */}
                    <rect
                      x={node.x - r}
                      y={node.y - r}
                      width={r * 2}
                      height={r * 2}
                      transform={`rotate(45, ${node.x}, ${node.y})`}
                      fill="var(--cw-node-fill)"
                      stroke="var(--cw-gold)"
                      strokeWidth={2.5 / zoom}
                      rx={2 / zoom}
                      style={{ pointerEvents: "auto", cursor: "pointer" }}
                      onMouseEnter={chainNodeMouseEnter}
                      onMouseLeave={chainNodeMouseLeave}
                    />
                    {/* Gold inner diamond */}
                    <rect
                      x={node.x - r * 0.35}
                      y={node.y - r * 0.35}
                      width={r * 0.7}
                      height={r * 0.7}
                      transform={`rotate(45, ${node.x}, ${node.y})`}
                      fill="var(--cw-gold)"
                      opacity={0.9}
                      style={{ pointerEvents: "none" }}
                    />
                    {/* Pulse ring (diamond-shaped) */}
                    <rect
                      x={node.x - r * 1.5}
                      y={node.y - r * 1.5}
                      width={r * 3}
                      height={r * 3}
                      transform={`rotate(45, ${node.x}, ${node.y})`}
                      fill="none"
                      stroke="var(--cw-gold)"
                      strokeWidth={1.5 / zoom}
                      rx={2 / zoom}
                    >
                      <animate
                        attributeName="opacity"
                        values="0.5;0;0.5"
                        dur="2s"
                        repeatCount="indefinite"
                      />
                      <animate
                        attributeName="width"
                        values={`${r * 2.4};${r * 4};${r * 2.4}`}
                        dur="2s"
                        repeatCount="indefinite"
                      />
                      <animate
                        attributeName="height"
                        values={`${r * 2.4};${r * 4};${r * 2.4}`}
                        dur="2s"
                        repeatCount="indefinite"
                      />
                      <animate
                        attributeName="x"
                        values={`${node.x - r * 1.2};${node.x - r * 2};${node.x - r * 1.2}`}
                        dur="2s"
                        repeatCount="indefinite"
                      />
                      <animate
                        attributeName="y"
                        values={`${node.y - r * 1.2};${node.y - r * 2};${node.y - r * 1.2}`}
                        dur="2s"
                        repeatCount="indefinite"
                      />
                    </rect>
                    {/* Focal step badge — star marker */}
                    <circle
                      cx={node.x + r * 0.9}
                      cy={node.y - r * 0.9}
                      r={Math.max(2.5, 5 / zoom)}
                      fill="var(--cw-gold-deep)"
                      stroke="var(--cw-gold)"
                      strokeWidth={0.5 / zoom}
                      opacity={0.9}
                      style={{ pointerEvents: "none" }}
                    />
                    <text
                      x={node.x + r * 0.9}
                      y={node.y - r * 0.9 + Math.max(0.8, 1.5 / zoom)}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={Math.max(2.5, 5 / zoom)}
                      fill="white"
                      fontFamily="'JetBrains Mono', monospace"
                      fontWeight={700}
                      opacity={0.95}
                      style={{ pointerEvents: "none" }}
                    >
                      {"\u2605"}
                    </text>
                  </>
                )}

                {/* SPINE NODE (depth > 0) — CIRCLE with flow arrow */}
                {node.nodeRole === "spine" &&
                  !isFocalNode &&
                  (() => {
                    const spineNodeCrossFile = !!node.isCrossFile;
                    const spineStrokeColor = spineNodeCrossFile
                      ? "var(--cw-text-50)"
                      : "var(--cw-callee)";
                    const spineNodeR = spineNodeCrossFile ? r * 0.85 : r;
                    return (
                      <>
                        {/* Glow ring */}
                        <circle
                          cx={node.x}
                          cy={node.y}
                          r={spineNodeR * 1.8}
                          fill={spineStrokeColor}
                          opacity={0.1 * nodeOpacity}
                          style={{ pointerEvents: "none" }}
                        />
                        {/* Circle body */}
                        <circle
                          cx={node.x}
                          cy={node.y}
                          r={spineNodeR}
                          fill="var(--cw-node-fill)"
                          stroke={spineStrokeColor}
                          strokeWidth={1.5 / zoom}
                          opacity={effectiveNodeOpacity}
                          strokeDasharray={
                            spineNodeCrossFile
                              ? `${3 / zoom} ${2 / zoom}`
                              : "none"
                          }
                          style={{
                            pointerEvents: "auto",
                            cursor: "pointer",
                          }}
                          onMouseEnter={chainNodeMouseEnter}
                          onMouseLeave={chainNodeMouseLeave}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            handleChainNodeDoubleClick(node.fqn);
                          }}
                        />
                        {/* Inner dot */}
                        <circle
                          cx={node.x}
                          cy={node.y}
                          r={spineNodeR * 0.35}
                          fill={spineStrokeColor}
                          opacity={0.8}
                          style={{ pointerEvents: "none" }}
                        />
                        {/* Small directional arrow inside — adapts for fan-in/fan-out */}
                        <text
                          x={node.x}
                          y={node.y + spineNodeR * 0.15}
                          textAnchor="middle"
                          fontSize={spineNodeR * 0.8}
                          fill={spineStrokeColor}
                          opacity={0.6}
                          style={{ pointerEvents: "none" }}
                        >
                          {(node.depth ?? 0) < 0 ? "\u2190" : "\u2192"}
                        </text>
                        {/* Step number badge — circled step indicator, cyan for fan-in */}
                        {(() => {
                          const isFanInNode = (node.depth ?? 0) < 0;
                          const badgeFill = isFanInNode
                            ? "hsl(200, 55%, 40%)"
                            : "hsl(320, 55%, 45%)";
                          const badgeStroke = isFanInNode
                            ? "hsl(200, 55%, 60%)"
                            : "hsl(320, 55%, 65%)";
                          return (
                            <>
                              <circle
                                cx={node.x + spineNodeR * 0.9}
                                cy={node.y - spineNodeR * 0.9}
                                r={Math.max(2.5, 5 / zoom)}
                                fill={badgeFill}
                                stroke={badgeStroke}
                                strokeWidth={0.5 / zoom}
                                opacity={0.9}
                                style={{ pointerEvents: "none" }}
                              />
                              <text
                                x={node.x + spineNodeR * 0.9}
                                y={
                                  node.y -
                                  spineNodeR * 0.9 +
                                  Math.max(0.8, 1.5 / zoom)
                                }
                                textAnchor="middle"
                                dominantBaseline="central"
                                fontSize={Math.max(2, 4 / zoom)}
                                fill="white"
                                fontFamily="'JetBrains Mono', monospace"
                                fontWeight={700}
                                opacity={0.95}
                                style={{ pointerEvents: "none" }}
                              >
                                {Math.abs(node.depth ?? 0)}
                              </text>
                            </>
                          );
                        })()}
                        {/* Focused spine pulse */}
                        {isFocused && (
                          <circle
                            cx={node.x}
                            cy={node.y}
                            r={spineNodeR * 1.5}
                            fill="none"
                            stroke="var(--cw-gold)"
                            strokeWidth={1.5 / zoom}
                          >
                            <animate
                              attributeName="r"
                              values={`${spineNodeR * 1.2};${spineNodeR * 2.2};${spineNodeR * 1.2}`}
                              dur="2s"
                              repeatCount="indefinite"
                            />
                            <animate
                              attributeName="opacity"
                              values="0.5;0;0.5"
                              dur="2s"
                              repeatCount="indefinite"
                            />
                          </circle>
                        )}
                        {/* Cross-file badge: abbreviated file name below */}
                        {spineNodeCrossFile && node.fileName && (
                          <text
                            x={node.x}
                            y={node.y + spineNodeR + Math.max(3, 5 / zoom)}
                            textAnchor="middle"
                            fontSize={Math.max(2, 3.5 / zoom)}
                            fill="var(--cw-text-48)"
                            fontFamily="'JetBrains Mono', monospace"
                            fontStyle="italic"
                            opacity={0.6}
                            style={{ pointerEvents: "none" }}
                          >
                            {node.fileName.length > 20
                              ? node.fileName.slice(0, 18) + ".."
                              : node.fileName}
                          </text>
                        )}
                      </>
                    );
                  })()}

                {/* BRANCH NODE — ROUNDED SQUARE */}
                {node.nodeRole === "branch" &&
                  (() => {
                    const branchCrossFile = !!node.isCrossFile;
                    const branchNodeR = branchCrossFile ? r * 0.85 : r;
                    const halfR = branchNodeR * 0.75;
                    const branchStrokeColor = branchCrossFile
                      ? "var(--cw-text-50)"
                      : "var(--cw-caller-soft)";
                    return (
                      <>
                        {/* Glow */}
                        <rect
                          x={node.x - halfR * 1.6}
                          y={node.y - halfR * 1.6}
                          width={halfR * 3.2}
                          height={halfR * 3.2}
                          rx={4 / zoom}
                          fill={branchStrokeColor}
                          opacity={0.08 * nodeOpacity}
                          style={{ pointerEvents: "none" }}
                        />
                        {/* Rounded square body */}
                        <rect
                          x={node.x - halfR}
                          y={node.y - halfR}
                          width={halfR * 2}
                          height={halfR * 2}
                          rx={3 / zoom}
                          fill="var(--cw-node-fill)"
                          stroke={branchStrokeColor}
                          strokeWidth={1 / zoom}
                          opacity={effectiveNodeOpacity}
                          strokeDasharray={
                            branchCrossFile ? `${3 / zoom} ${2 / zoom}` : "none"
                          }
                          style={{
                            pointerEvents: "auto",
                            cursor: "pointer",
                          }}
                          onMouseEnter={chainNodeMouseEnter}
                          onMouseLeave={chainNodeMouseLeave}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            handleChainNodeDoubleClick(node.fqn);
                          }}
                        />
                        {/* Small dot inside */}
                        <circle
                          cx={node.x}
                          cy={node.y}
                          r={halfR * 0.3}
                          fill={branchStrokeColor}
                          opacity={0.6}
                          style={{ pointerEvents: "none" }}
                        />
                        {/* Focused branch pulse */}
                        {isFocused && (
                          <rect
                            x={node.x - halfR * 1.3}
                            y={node.y - halfR * 1.3}
                            width={halfR * 2.6}
                            height={halfR * 2.6}
                            rx={4 / zoom}
                            fill="none"
                            stroke="var(--cw-gold)"
                            strokeWidth={1.5 / zoom}
                          >
                            <animate
                              attributeName="opacity"
                              values="0.5;0;0.5"
                              dur="2s"
                              repeatCount="indefinite"
                            />
                          </rect>
                        )}
                        {/* Cross-file badge: abbreviated file name below */}
                        {branchCrossFile && node.fileName && (
                          <text
                            x={node.x}
                            y={node.y + halfR + Math.max(3, 5 / zoom)}
                            textAnchor="middle"
                            fontSize={Math.max(2, 3.5 / zoom)}
                            fill="var(--cw-text-48)"
                            fontFamily="'JetBrains Mono', monospace"
                            fontStyle="italic"
                            opacity={0.6}
                            style={{ pointerEvents: "none" }}
                          >
                            {node.fileName.length > 20
                              ? node.fileName.slice(0, 18) + ".."
                              : node.fileName}
                          </text>
                        )}
                      </>
                    );
                  })()}

                {/* FAN-IN NODE — COMPACT SUMMARY BLOCK */}
                {node.nodeRole === "fan-in" &&
                  (() => {
                    const callers = node.fanInCallers || [];
                    const totalCount =
                      node.fanInTotalCount || callers.length || 1;
                    const fileCount = node.fanInFileCount || 1;
                    const showMax =
                      totalCount <= 5 ? Math.min(3, callers.length) : 1;
                    const overflow = totalCount - showMax;
                    const lineH = Math.max(3, 6 / zoom);
                    const blockW = Math.max(40, 80 / zoom);
                    const headerH = lineH * 1.2;
                    const contentLines = showMax + (overflow > 0 ? 1 : 0);
                    const blockH = headerH + contentLines * lineH + lineH * 0.5;
                    const bx = node.x - blockW / 2;
                    const by = node.y - blockH / 2;
                    const focalService = selectedFunctionCtx?.serviceId || "";

                    // If no fan-in metadata, fall back to triangle
                    if (callers.length === 0) {
                      const triR = r * 0.9;
                      const triPoints = `${node.x},${node.y - triR} ${node.x - triR * 0.87},${node.y + triR * 0.5} ${node.x + triR * 0.87},${node.y + triR * 0.5}`;
                      return (
                        <>
                          <circle
                            cx={node.x}
                            cy={node.y}
                            r={r * 1.8}
                            fill="var(--cw-caller)"
                            opacity={0.08 * nodeOpacity}
                            style={{ pointerEvents: "none" }}
                          />
                          <polygon
                            points={triPoints}
                            fill="var(--cw-node-fill)"
                            stroke="var(--cw-caller)"
                            strokeWidth={1.5 / zoom}
                            strokeLinejoin="round"
                            opacity={effectiveNodeOpacity}
                            style={{
                              pointerEvents: "auto",
                              cursor: "pointer",
                            }}
                            onMouseEnter={chainNodeMouseEnter}
                            onMouseLeave={chainNodeMouseLeave}
                          />
                          <text
                            x={node.x}
                            y={node.y + r * 0.15}
                            textAnchor="middle"
                            fontSize={r * 0.7}
                            fill="var(--cw-caller)"
                            opacity={0.6}
                            style={{ pointerEvents: "none" }}
                          >
                            {"\u2191"}
                          </text>
                        </>
                      );
                    }

                    return (
                      <>
                        {/* Block background */}
                        <rect
                          x={bx}
                          y={by}
                          width={blockW}
                          height={blockH}
                          rx={Math.max(1.5, 3 / zoom)}
                          fill="var(--cw-pill-bg)"
                          stroke="hsl(200, 55%, 40%)"
                          strokeWidth={0.8 / zoom}
                          opacity={effectiveNodeOpacity}
                          style={{
                            pointerEvents: "auto",
                            cursor: "pointer",
                          }}
                          onMouseEnter={chainNodeMouseEnter}
                          onMouseLeave={chainNodeMouseLeave}
                        />
                        {/* Header: "Called by: N functions" */}
                        <text
                          x={node.x}
                          y={by + headerH}
                          textAnchor="middle"
                          fontSize={Math.max(2.5, 5 / zoom)}
                          fill="var(--cw-caller-mid)"
                          fontFamily="'Space Grotesk', sans-serif"
                          fontWeight={600}
                          opacity={0.9}
                          style={{ pointerEvents: "none" }}
                        >
                          Called by: {totalCount} function
                          {totalCount !== 1 ? "s" : ""}
                        </text>
                        {/* Caller entries */}
                        {callers.slice(0, showMax).map((caller, ci) => {
                          const isCrossService =
                            caller.service !== focalService;
                          const entryY = by + headerH + (ci + 0.8) * lineH;
                          return (
                            <g
                              key={`fi-${ci}`}
                              style={{ pointerEvents: "none" }}
                            >
                              {/* Cross-service colored dot */}
                              {isCrossService && (
                                <circle
                                  cx={bx + 3 / zoom}
                                  cy={entryY - lineH * 0.15}
                                  r={Math.max(1, 2 / zoom)}
                                  fill={mark(
                                    SERVICE_COLORS[caller.service] ||
                                      "hsl(200, 50%, 50%)"
                                  )}
                                  opacity={0.8}
                                />
                              )}
                              {/* Bullet */}
                              {!isCrossService && (
                                <circle
                                  cx={bx + 3 / zoom}
                                  cy={entryY - lineH * 0.15}
                                  r={Math.max(0.8, 1.5 / zoom)}
                                  fill="var(--cw-caller-dot)"
                                  opacity={0.7}
                                />
                              )}
                              {/* Caller name */}
                              <text
                                x={bx + 6 / zoom}
                                y={entryY}
                                fontSize={Math.max(2, 4 / zoom)}
                                fill="var(--cw-label-65b)"
                                fontFamily="'JetBrains Mono', monospace"
                                opacity={0.75}
                              >
                                {caller.name.length > 18
                                  ? caller.name.slice(0, 16) + ".."
                                  : caller.name}
                                {isCrossService
                                  ? ` (${(caller.service || "").split(".").pop()})`
                                  : ""}
                              </text>
                            </g>
                          );
                        })}
                        {/* Overflow line */}
                        {overflow > 0 && (
                          <text
                            x={bx + 6 / zoom}
                            y={by + headerH + (showMax + 0.8) * lineH}
                            fontSize={Math.max(2, 3.5 / zoom)}
                            fill="var(--cw-text-dim)"
                            fontFamily="'JetBrains Mono', monospace"
                            opacity={0.6}
                            style={{ pointerEvents: "none" }}
                          >
                            + {overflow} more across {fileCount} file
                            {fileCount !== 1 ? "s" : ""}
                          </text>
                        )}
                        {/* Focused fan-in pulse */}
                        {isFocused && (
                          <rect
                            x={bx - 3 / zoom}
                            y={by - 3 / zoom}
                            width={blockW + 6 / zoom}
                            height={blockH + 6 / zoom}
                            rx={Math.max(2, 4 / zoom)}
                            fill="none"
                            stroke="var(--cw-gold)"
                            strokeWidth={1.5 / zoom}
                          >
                            <animate
                              attributeName="opacity"
                              values="0.5;0;0.5"
                              dur="2s"
                              repeatCount="indefinite"
                            />
                          </rect>
                        )}
                      </>
                    );
                  })()}

                {/* Refocus button — shown when hovering a refocusable node */}
                {isHoveredForRefocus && (
                  <g
                    style={{ pointerEvents: "auto", cursor: "pointer" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleChainNodeRefocus(node.fqn);
                    }}
                  >
                    {/* Button background */}
                    <circle
                      cx={node.x + r * 1.5}
                      cy={node.y - r * 1.5}
                      r={Math.max(3, 6 / zoom)}
                      fill="var(--cw-gold-scrim)"
                      stroke="var(--cw-gold-soft)"
                      strokeWidth={0.5 / zoom}
                    />
                    {/* Button icon */}
                    <text
                      x={node.x + r * 1.5}
                      y={node.y - r * 1.5 + Math.max(1, 2 / zoom)}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={Math.max(3, 6 / zoom)}
                      fill="var(--cw-gold)"
                      fontFamily="'Space Grotesk', sans-serif"
                      fontWeight={700}
                    >
                      {"\u2295"}
                    </text>
                  </g>
                )}

                {/* AGGREGATE NODE — PILL/CAPSULE shape (clickable for spine-collapse) */}
                {isAggregate &&
                  !node.bundleRole &&
                  (() => {
                    const pillW = r * 2.5;
                    const pillH = r * 1.2;
                    const isSpineCollapse =
                      node.fqn.startsWith("spine-collapse-");
                    const isExpanded = expandedCollapse.has(node.fqn);
                    return (
                      <>
                        {/* Pill body */}
                        <rect
                          x={node.x - pillW / 2}
                          y={node.y - pillH / 2}
                          width={pillW}
                          height={pillH}
                          rx={pillH / 2}
                          fill={
                            isSpineCollapse
                              ? "var(--cw-agg-pill-spine)"
                              : "var(--cw-agg-pill)"
                          }
                          stroke={
                            isSpineCollapse
                              ? "var(--cw-agg-spine-stroke)"
                              : "var(--cw-agg-pill-stroke)"
                          }
                          strokeWidth={0.8 / zoom}
                          strokeDasharray={`${3 / zoom} ${2 / zoom}`}
                          opacity={0.5}
                          style={{
                            pointerEvents: isSpineCollapse ? "auto" : "none",
                            cursor: isSpineCollapse ? "pointer" : "default",
                          }}
                          onClick={
                            isSpineCollapse
                              ? (e) => {
                                  e.stopPropagation();
                                  setExpandedCollapse((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(node.fqn))
                                      next.delete(node.fqn);
                                    else next.add(node.fqn);
                                    return next;
                                  });
                                }
                              : undefined
                          }
                        />
                        {/* "N more" text inside the pill */}
                        <text
                          x={node.x}
                          y={node.y + pillH * 0.15}
                          textAnchor="middle"
                          fontSize={Math.max(3, 5 / zoom)}
                          fill={
                            isSpineCollapse
                              ? "var(--cw-agg-spine-text)"
                              : "var(--cw-agg-text)"
                          }
                          fontFamily="'JetBrains Mono', monospace"
                          opacity={0.6}
                          style={{ pointerEvents: "none" }}
                        >
                          {isExpanded ? "\u25BE collapse" : node.name}
                        </text>
                      </>
                    );
                  })()}

                {/* ROLE BUNDLE — wider capsule with role label + compact names */}
                {isAggregate &&
                  node.bundleRole &&
                  (() => {
                    const bundleRoleColor = mark(
                      FUNCTION_ROLE_COLORS[
                        node.bundleRole as keyof typeof FUNCTION_ROLE_COLORS
                      ] || "hsl(210, 30%, 50%)"
                    );
                    const names = node.bundledNames || [];
                    const showCount = Math.min(2, names.length);
                    const overflow = names.length - showCount;
                    const bundleW = Math.max(r * 4, 30 / zoom);
                    const bundleH = Math.max(r * 2.5, 20 / zoom);
                    const lineH = Math.max(2.5, 5 / zoom);
                    return (
                      <>
                        {/* Bundle body — wider pill with role color tint */}
                        <rect
                          x={node.x - bundleW / 2}
                          y={node.y - bundleH / 2}
                          width={bundleW}
                          height={bundleH}
                          rx={bundleH / 3}
                          fill={bundleRoleColor}
                          opacity={0.08}
                          stroke={bundleRoleColor}
                          strokeWidth={0.8 / zoom}
                          strokeDasharray={`${4 / zoom} ${3 / zoom}`}
                          style={{ pointerEvents: "none" }}
                        />
                        {/* Role label at top */}
                        <text
                          x={node.x}
                          y={node.y - bundleH * 0.25}
                          textAnchor="middle"
                          fontSize={Math.max(2.5, 5 / zoom)}
                          fill={bundleRoleColor}
                          fontFamily="'Space Grotesk', sans-serif"
                          fontWeight={600}
                          opacity={0.8}
                          style={{ pointerEvents: "none" }}
                        >
                          {node.name}
                        </text>
                        {/* Compact function names inside (up to 2) */}
                        {names.slice(0, showCount).map((name, ni) => (
                          <text
                            key={`rb-name-${ni}`}
                            x={node.x}
                            y={node.y - bundleH * 0.05 + ni * lineH}
                            textAnchor="middle"
                            fontSize={Math.max(2, 4 / zoom)}
                            fill="var(--cw-text-muted)"
                            fontFamily="'JetBrains Mono', monospace"
                            opacity={0.6}
                            style={{ pointerEvents: "none" }}
                          >
                            {name.length > 20 ? name.slice(0, 18) + ".." : name}
                          </text>
                        ))}
                        {/* Overflow count */}
                        {overflow > 0 && (
                          <text
                            x={node.x}
                            y={node.y - bundleH * 0.05 + showCount * lineH}
                            textAnchor="middle"
                            fontSize={Math.max(2, 3.5 / zoom)}
                            fill="var(--cw-text-42)"
                            fontFamily="'JetBrains Mono', monospace"
                            opacity={0.5}
                            style={{ pointerEvents: "none" }}
                          >
                            +{overflow} more
                          </text>
                        )}
                      </>
                    );
                  })()}

                {/* ── Labels (non-aggregate nodes only — aggregate text is inside the pill) ── */}
                {!isAggregate && (
                  <>
                    {/* Background rect behind labels */}
                    <rect
                      x={bgX}
                      y={bgY}
                      width={textW + padX * 2}
                      height={totalHeight + padY * 2}
                      fill="var(--cw-badge-bg-85)"
                      rx={Math.max(1, Math.min(3, 2 / zoom))}
                      opacity={nodeOpacity}
                      style={{ pointerEvents: "none" }}
                    />

                    {/* Method name label */}
                    <text
                      x={node.x + labelOffsetX}
                      y={labelBaseY}
                      fontSize={methodFont}
                      fill={showGold ? "var(--cw-gold)" : color}
                      fontFamily="'JetBrains Mono', monospace"
                      opacity={0.9 * nodeOpacity}
                      textAnchor={textAnchor}
                      style={{ pointerEvents: "none" }}
                    >
                      {displayName}
                    </text>
                    {/* File name label — zoom-dependent */}
                    {showFile && (
                      <text
                        x={node.x + labelOffsetX}
                        y={labelBaseY + lineSpacing}
                        fontSize={fileFont}
                        fill="var(--cw-text-50)"
                        fontFamily="'JetBrains Mono', monospace"
                        opacity={Math.max(0.5, 0.7 * nodeOpacity)}
                        textAnchor={textAnchor}
                        style={{ pointerEvents: "none" }}
                      >
                        {node.fileName}
                      </text>
                    )}
                    {/* Service badge for cross-service — zoom-dependent */}
                    {showBadge && (
                      <text
                        x={node.x + labelOffsetX}
                        y={labelBaseY + lineSpacing + fileFont * 1.3}
                        fontSize={badgeFont}
                        fill="var(--cw-text-40)"
                        fontFamily="'JetBrains Mono', monospace"
                        opacity={Math.max(0.45, 0.6 * nodeOpacity)}
                        textAnchor={textAnchor}
                        style={{ pointerEvents: "none" }}
                      >
                        {node.service.split(".").pop()}
                      </text>
                    )}

                    {/* Role icon for depth-1 nodes */}
                    {nodeRoleStr && (
                      <text
                        x={node.x}
                        y={node.y + r + 6 / zoom}
                        textAnchor="middle"
                        fontSize={Math.max(3, 6 / zoom)}
                        fill={roleColor}
                        opacity={0.7}
                        style={{ pointerEvents: "none" }}
                      >
                        {roleIcon(nodeRoleStr)}
                      </text>
                    )}
                  </>
                )}
              </g>
            );
          })}

          {/* ── Ambient Band: side-effect functions rendered as thin muted bar ── */}
          {sideEffectNodes.length > 0 &&
            (() => {
              // Position above the highest node in the chain
              const allYs = visibleNodes.map((n) => n.y);
              const allXs = visibleNodes.map((n) => n.x);
              const minY = Math.min(...allYs);
              const minX = Math.min(...allXs);
              const maxX = Math.max(...allXs);
              const bandY = minY - 30 / zoom;
              const bandW = Math.max(maxX - minX + 40 / zoom, 80 / zoom);
              const bandH = Math.max(6, 12 / zoom);
              const bandX = minX - 20 / zoom;
              const names = sideEffectNodes.map((n) => n.name);
              const displayText = names.join(" \u00B7 ");
              const truncated =
                displayText.length > 60
                  ? displayText.slice(0, 57) + "..."
                  : displayText;

              return (
                <g
                  style={{ pointerEvents: "auto" }}
                  onMouseEnter={() =>
                    setHoveredElement({
                      type: "method",
                      id: "ambient-band",
                    })
                  }
                  onMouseLeave={() => setHoveredElement(null)}
                >
                  {/* Band background */}
                  <rect
                    x={bandX}
                    y={bandY - bandH / 2}
                    width={bandW}
                    height={bandH}
                    rx={bandH / 3}
                    fill="var(--cw-band-bg)"
                    opacity={hoveredElement?.id === "ambient-band" ? 0.2 : 0.08}
                    style={{ transition: "opacity 0.2s" }}
                  />
                  {/* Function names */}
                  <text
                    x={bandX + bandW / 2}
                    y={bandY + Math.max(1.5, 3 / zoom) * 0.5}
                    textAnchor="middle"
                    fontSize={Math.max(2.5, 5 / zoom)}
                    fill="var(--cw-band-text)"
                    fontFamily="'JetBrains Mono', monospace"
                    opacity={hoveredElement?.id === "ambient-band" ? 0.6 : 0.35}
                    style={{
                      transition: "opacity 0.2s",
                      pointerEvents: "none",
                    }}
                  >
                    {truncated}
                  </text>
                  {/* "side-effects" label on left */}
                  <text
                    x={bandX - 2 / zoom}
                    y={bandY + Math.max(1.5, 3 / zoom) * 0.5}
                    textAnchor="end"
                    fontSize={Math.max(2, 4 / zoom)}
                    fill="var(--cw-band-label)"
                    fontFamily="'Space Grotesk', sans-serif"
                    fontStyle="italic"
                    opacity={hoveredElement?.id === "ambient-band" ? 0.5 : 0.25}
                    style={{
                      transition: "opacity 0.2s",
                      pointerEvents: "none",
                    }}
                  >
                    side-effects
                  </text>
                </g>
              );
            })()}

          {/* ── Journey annotations: title, phase labels, data flow ── */}
          {selNode &&
            (() => {
              // Look up journey for the focal function
              const focalFqn = selectedFunctionCtx?.functionId || "";
              const journeys = focalFqn ? getJourneysForFunction(focalFqn) : [];
              const journey: JourneyData | null =
                journeys.length > 0 ? journeys[0] : null;
              if (!journey) return null;

              // Build a FQN -> phase lookup for fast matching
              const phaseByFqn = new Map<
                string,
                { label: string; description: string }
              >();
              for (const phase of journey.phases) {
                for (const fqn of phase.fqns) {
                  phaseByFqn.set(fqn, {
                    label: phase.name,
                    description: phase.narrative || "",
                  });
                }
              }

              // Find the topmost node (min Y) in the spine for title placement
              const spineWithFocal = [
                selNode,
                ...spineChain.filter((n) => n.fqn !== selNode.fqn),
              ];
              const topNode = spineWithFocal.reduce(
                (best, n) => (n.y < best.y ? n : best),
                spineWithFocal[0]
              );
              const leftNode = spineWithFocal.reduce(
                (best, n) => (n.x < best.x ? n : best),
                spineWithFocal[0]
              );
              const rightNode = spineWithFocal.reduce(
                (best, n) => (n.x > best.x ? n : best),
                spineWithFocal[0]
              );
              const centerX = (leftNode.x + rightNode.x) / 2;

              // Journey title
              const titleFontSize = Math.max(4, 12 / zoom);
              const titleY = topNode.y - 30 / zoom;
              const titleText = journey.title;
              const titleCharW = titleFontSize * 0.55;
              const titleTextW = titleText.length * titleCharW;
              const titlePadX = Math.max(3, 8 / zoom);
              const titlePadY = Math.max(2, 5 / zoom);
              const titleH = titleFontSize + titlePadY * 2;

              // Handler type badge positioning
              const handlerBadgeFontSize = Math.max(3, 7 / zoom);
              const handlerBadgeText = journey.handlerType;
              const handlerBadgeCharW = handlerBadgeFontSize * 0.55;
              const handlerBadgeW =
                handlerBadgeText.length * handlerBadgeCharW +
                Math.max(2, 6 / zoom);
              const handlerBadgeH =
                handlerBadgeFontSize + Math.max(1.5, 3 / zoom);
              const handlerBadgeX =
                centerX + titleTextW / 2 + titlePadX + Math.max(2, 4 / zoom);

              const handlerTypeColor: Record<string, string> = {
                command: "hsl(10, 55%, 55%)",
                event: "hsl(40, 60%, 55%)",
                background: "hsl(210, 50%, 55%)",
                http: "hsl(160, 45%, 50%)",
              };
              const badgeColor = mark(
                handlerTypeColor[journey.handlerType] || "hsl(210, 30%, 50%)"
              );

              return (
                <g style={{ pointerEvents: "none" }}>
                  {/* Journey title pill */}
                  <rect
                    x={centerX - titleTextW / 2 - titlePadX}
                    y={titleY - titleH / 2}
                    width={titleTextW + titlePadX * 2}
                    height={titleH}
                    rx={titleH / 2.5}
                    fill="var(--cw-badge-bg-92)"
                    stroke="hsl(45, 40%, 35%)"
                    strokeWidth={0.8 / zoom}
                  />
                  <text
                    x={centerX}
                    y={titleY + titleFontSize * 0.35}
                    textAnchor="middle"
                    fontSize={titleFontSize}
                    fontWeight={600}
                    fill="var(--cw-journey-gold)"
                    fontFamily="'Space Grotesk', sans-serif"
                    opacity={0.95}
                  >
                    {titleText}
                  </text>

                  {/* Handler type badge */}
                  <rect
                    x={handlerBadgeX - handlerBadgeW / 2}
                    y={titleY - handlerBadgeH / 2}
                    width={handlerBadgeW}
                    height={handlerBadgeH}
                    rx={handlerBadgeH / 2.5}
                    fill={`${badgeColor}22`}
                    stroke={badgeColor}
                    strokeWidth={0.5 / zoom}
                    opacity={0.8}
                  />
                  <text
                    x={handlerBadgeX}
                    y={titleY + handlerBadgeFontSize * 0.35}
                    textAnchor="middle"
                    fontSize={handlerBadgeFontSize}
                    fill={badgeColor}
                    fontFamily="'JetBrains Mono', monospace"
                    opacity={0.85}
                  >
                    {handlerBadgeText}
                  </text>

                  {/* Phase labels below each matching spine node */}
                  {spineWithFocal.map((node) => {
                    const phase = phaseByFqn.get(node.fqn);
                    if (!phase) return null;
                    const nodeR = node.depth === 0 ? 14 / zoom : 10 / zoom;
                    const phaseFontSize = Math.max(3, 6 / zoom);
                    const phaseY = node.y + nodeR * 2.5;
                    const phaseCharW = phaseFontSize * 0.55;
                    const phaseTextW = phase.label.length * phaseCharW;
                    const phasePadX = Math.max(1.5, 4 / zoom);
                    const phasePadY = Math.max(1, 2.5 / zoom);
                    return (
                      <g key={`journey-phase-${node.fqn}`}>
                        {/* Phase label background */}
                        <rect
                          x={node.x - phaseTextW / 2 - phasePadX}
                          y={phaseY - phaseFontSize * 0.5 - phasePadY}
                          width={phaseTextW + phasePadX * 2}
                          height={phaseFontSize + phasePadY * 2}
                          rx={Math.max(1, 2 / zoom)}
                          fill="var(--cw-badge-bg-80)"
                          opacity={0.7}
                        />
                        {/* Phase label text */}
                        <text
                          x={node.x}
                          y={phaseY + phaseFontSize * 0.15}
                          textAnchor="middle"
                          fontSize={phaseFontSize}
                          fill="var(--cw-journey-gold-dim)"
                          fontFamily="'Space Grotesk', sans-serif"
                          fontStyle="italic"
                          opacity={0.85}
                        >
                          {phase.label}
                        </text>
                      </g>
                    );
                  })}
                </g>
              );
            })()}

          {/* ── Fan-in / Fan-out direction toggle ── */}
          {selNode &&
            (() => {
              const toggleW = 20 / zoom;
              const toggleH = 10 / zoom;
              const toggleX = selNode.x + (14 / zoom) * 2.5;
              const toggleY = selNode.y + (14 / zoom) * 2.5;
              const halfW = toggleW / 2;
              const isFanOut = chainDirection === "fan-out";
              return (
                <g>
                  {/* Toggle background */}
                  <rect
                    x={toggleX - halfW}
                    y={toggleY - toggleH / 2}
                    width={toggleW}
                    height={toggleH}
                    rx={toggleH / 3}
                    fill="var(--cw-pill-bg)"
                    stroke="hsl(210, 20%, 35%)"
                    strokeWidth={0.5 / zoom}
                    style={{ pointerEvents: "auto", cursor: "pointer" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setChainDirection((prev) =>
                        prev === "fan-out" ? "fan-in" : "fan-out"
                      );
                      setActiveCallChain(null);
                      setCallChainCursorFqn(null);
                      setExpandedCollapse(new Set());
                    }}
                  />
                  {/* Fan-out half (left) */}
                  <text
                    x={toggleX - halfW * 0.45}
                    y={toggleY + toggleH * 0.12}
                    textAnchor="middle"
                    fontSize={Math.max(2, 4 / zoom)}
                    fill={
                      isFanOut ? "var(--cw-callee-bright)" : "var(--cw-text-40)"
                    }
                    fontWeight={isFanOut ? 700 : 400}
                    fontFamily="'Space Grotesk', sans-serif"
                    opacity={isFanOut ? 1 : 0.5}
                    style={{ pointerEvents: "none" }}
                  >
                    {"\u2193"}
                  </text>
                  {/* Fan-in half (right) */}
                  <text
                    x={toggleX + halfW * 0.45}
                    y={toggleY + toggleH * 0.12}
                    textAnchor="middle"
                    fontSize={Math.max(2, 4 / zoom)}
                    fill={
                      !isFanOut
                        ? "var(--cw-caller-bright)"
                        : "var(--cw-text-40)"
                    }
                    fontWeight={!isFanOut ? 700 : 400}
                    fontFamily="'Space Grotesk', sans-serif"
                    opacity={!isFanOut ? 1 : 0.5}
                    style={{ pointerEvents: "none" }}
                  >
                    {"\u2191"}
                  </text>
                  {/* Divider line */}
                  <line
                    x1={toggleX}
                    y1={toggleY - toggleH * 0.35}
                    x2={toggleX}
                    y2={toggleY + toggleH * 0.35}
                    stroke="hsl(210, 15%, 30%)"
                    strokeWidth={0.3 / zoom}
                    style={{ pointerEvents: "none" }}
                  />
                  {/* Label below toggle */}
                  <text
                    x={toggleX}
                    y={toggleY + toggleH * 0.9}
                    textAnchor="middle"
                    fontSize={Math.max(1.5, 3 / zoom)}
                    fill="var(--cw-text-dim)"
                    fontFamily="'Space Grotesk', sans-serif"
                    opacity={0.5}
                    style={{ pointerEvents: "none" }}
                  >
                    {isFanOut ? "fan-out" : "fan-in"}
                  </text>
                </g>
              );
            })()}
        </g>
      );
    })()
  );
};

export default CallChain;
