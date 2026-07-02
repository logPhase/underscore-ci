import { useAnalysis } from "@/store/use-analysis-store";
import { useSelectionStore } from "@/store/use-selection-store";
import { useViewportStore } from "@/store/use-viewport-store";
import { MethodIndexEntry } from "@/types/analysis";
import { CallChainNode } from "@/types/store";
import { Fragment, useCallback, useEffect, useMemo, useRef } from "react";
import { Button } from "../ui/button";
import { cn } from "@/lib/misc-utils";
import { ArrowLeft, ArrowRight } from "lucide-react";

interface Props {
  containerRef: React.RefObject<HTMLDivElement>;
}

export function CallChainTraversalPanel({ containerRef }: Props) {
  const nodes = useSelectionStore((s) => s.callChainNodes);

  const globalMethodIndex =
    useAnalysis((s) => s.transformedData?.globalMethodIndex) || new Map();

  const setCallChainCursorFqn = useSelectionStore(
    (state) => state.setCallChainCursorFqn
  );
  const setActiveCallChain = useSelectionStore(
    (state) => state.setActiveCallChain
  );
  const setSelectedFunctionCtx = useSelectionStore(
    (state) => state.setSelectedFunctionCtx
  );
  const activeCallChain = useSelectionStore((state) => state.activeCallChain);
  const callChainCursorFqn = useSelectionStore(
    (state) => state.callChainCursorFqn
  );

  const zoomTo = useViewportStore((state) => state.zoomTo);
  const zoom = useViewportStore((state) => state.zoom);

  const scrollRef = useRef<HTMLDivElement>(null);
  // Refs for each card button so auto-scroll targets the right DOM element
  const cardRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const getMethodInfo = (fqn: string): MethodIndexEntry | undefined =>
    globalMethodIndex.get(fqn);

  // Use the frozen chain for ordering — fall back to prop if no frozen chain
  const sourceNodes = activeCallChain || nodes;

  // Order: selected first, then callees in original order (source-code order from Roslyn AST),
  // then callers in original order. Preserves the call sequence as written in the source.
  // EXCLUDE aggregate nodes — they are summary badges ("5 more"), not navigable methods.
  const orderedNodes = useMemo(() => {
    const navigable = sourceNodes.filter((n) => n.nodeRole !== "aggregate");
    const selected = navigable.filter((n) => n.type === "selected");
    const callees = navigable.filter((n) => n.type === "callee"); // preserve original order
    const callers = navigable.filter((n) => n.type === "caller"); // preserve original order
    return [...selected, ...callees, ...callers];
  }, [sourceNodes]);

  // Current position is determined by cursor FQN, not by node.type
  const currentIndex = orderedNodes.findIndex(
    (n) => n.fqn === callChainCursorFqn
  );

  // Navigate to a method — moves cursor, updates right panel, pans camera.
  // Safe because activeCallChain is already frozen and won't be replaced.
  const navigateTo = useCallback(
    (node: CallChainNode) => {
      // Move the cursor within the frozen chain
      setCallChainCursorFqn(node.fqn);

      // Update selectedFunctionCtx so the right panel (MethodDetailPanel) shows this method's details
      const info = getMethodInfo(node.fqn);
      setSelectedFunctionCtx({
        functionId: node.fqn,
        fileId: info?.fileId || "",
        packageId: "",
        serviceId: node.service,
        functionName: node.name,
      });

      // Pan camera to the node's position at CURRENT zoom level (don't re-zoom)
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        zoomTo(node.x, node.y, zoom, rect.width, rect.height);
      }
    },
    [setCallChainCursorFqn, setSelectedFunctionCtx, zoomTo, zoom, containerRef]
  );

  // Keyboard navigation — traverses only navigable nodes (no aggregates)
  // NOTE: ESC is handled by MonrepoCanvas (it owns preTraceZoom restoration).
  // This effect only handles ArrowLeft/ArrowRight for spine traversal.
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (!activeCallChain || orderedNodes.length === 0) return;

      if (e.key === "ArrowLeft" && currentIndex > 0) {
        e.preventDefault();
        navigateTo(orderedNodes[currentIndex - 1]);
      } else if (
        e.key === "ArrowRight" &&
        currentIndex < orderedNodes.length - 1
      ) {
        e.preventDefault();
        navigateTo(orderedNodes[currentIndex + 1]);
      }
      // ESC is intentionally NOT handled here — MonrepoCanvas handles it
      // so that preTraceZoom restoration, focusedFileId cleanup, and
      // activeCallChain clearing all happen in one place.
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [activeCallChain, orderedNodes, currentIndex, navigateTo]);

  // Auto-scroll to keep current card visible — uses card refs instead of children index
  // (React.Fragment dissolves in the DOM, so children indices don't match card indices)
  useEffect(() => {
    if (currentIndex >= 0) {
      const currentFqn = orderedNodes[currentIndex]?.fqn;
      const cardEl = currentFqn ? cardRefs.current.get(currentFqn) : null;
      if (cardEl) {
        cardEl.scrollIntoView({
          behavior: "smooth",
          inline: "center",
          block: "nearest",
        });
      }
    }
  }, [currentIndex, orderedNodes]);

  // Only render when we have a frozen chain with multiple nodes
  if (!activeCallChain || activeCallChain.length <= 1) return null;

  // Dismiss only clears the traversal overlay (frozen chain + cursor).
  // The function selection remains — user can press ESC to fully unwind
  // (MonrepoCanvas handles that, including preTraceZoom restoration).
  const dismiss = () => {
    setActiveCallChain(null);
    setCallChainCursorFqn(null);
  };

  return (
    <div
      className="absolute bottom-6 left-1/2 z-50 flex max-w-[85vw] translate-x-[-50%] items-center gap-1.5 rounded-xl bg-popover px-3 py-2 backdrop-blur-md"
      style={{
        border: "1px solid hsl(210, 15%, 20%)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
      }}
    >
      {/* Left arrow */}
      <Button
        onClick={() =>
          currentIndex > 0 && navigateTo(orderedNodes[currentIndex - 1])
        }
        disabled={currentIndex <= 0}
        size="icon"
        variant="secondary"
        className="shrink-0 border-none bg-transparent"
      >
        <ArrowLeft
          className={cn(
            "h-4 w-4",
            currentIndex > 0
              ? "cursor-pointer text-[hsl(210,50%,65%)]"
              : "text-[hsl(210,12%,30%)]"
          )}
        />
      </Button>

      {/* Scrollable card area */}
      <div ref={scrollRef} className="flex h-full grow gap-1">
        {orderedNodes.map((node, i) => {
          const isCurrent = node.fqn === callChainCursorFqn;
          const isCaller = node.type === "caller";
          const isFanIn = node.nodeRole === "fan-in";
          const borderColor = isCurrent
            ? "hsl(50, 80%, 55%)"
            : isFanIn
              ? "hsl(200, 65%, 55%)"
              : isCaller
                ? "hsl(200, 65%, 55%)"
                : "hsl(320, 55%, 55%)";
          const bgColor = isCurrent
            ? "hsla(50, 40%, 15%, 0.6)"
            : "hsla(220, 20%, 14%, 0.6)";

          // Arrow between cards
          const showArrow = i < orderedNodes.length - 1;

          // Direction label: use nodeRole for specificity when available
          const directionLabel =
            node.type === "selected"
              ? null
              : isFanIn
                ? "caller"
                : node.type === "caller"
                  ? "caller"
                  : "callee";

          return (
            <Fragment key={node.fqn}>
              <button
                ref={(el) => {
                  if (el) cardRefs.current.set(node.fqn, el);
                  else cardRefs.current.delete(node.fqn);
                }}
                onClick={() => !isCurrent && navigateTo(node)}
                onMouseEnter={(e) => {
                  if (!isCurrent) {
                    e.currentTarget.style.background =
                      "hsla(220, 20%, 20%, 0.8)";
                    e.currentTarget.style.borderColor = borderColor;
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isCurrent) {
                    e.currentTarget.style.background = bgColor;
                    e.currentTarget.style.borderColor = "hsl(210, 15%, 22%)";
                  }
                }}
                style={{
                  background: bgColor,
                  border: `1px solid ${isCurrent ? borderColor : "hsl(210, 15%, 22%)"}`,
                  borderLeft: `3px solid ${borderColor}`,
                  borderRadius: 8,
                  padding: "6px 10px",
                  cursor: isCurrent ? "default" : "pointer",
                  minWidth: 100,
                  textAlign: "left" as const,
                  flexShrink: 0,
                  transition: "all 0.2s ease",
                  transform: isCurrent ? "scale(1.05)" : "scale(1)",
                }}
              >
                <div
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 11,
                    color: isCurrent
                      ? "hsl(50, 80%, 75%)"
                      : "hsl(210, 30%, 80%)",
                    fontWeight: isCurrent ? 600 : 400,
                    whiteSpace: "nowrap" as const,
                  }}
                >
                  {node.name}()
                </div>
                <div
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 8,
                    color: "hsl(210, 15%, 50%)",
                    marginTop: 2,
                    whiteSpace: "nowrap" as const,
                  }}
                >
                  {node.fileName}
                </div>
                {node.description &&
                  (() => {
                    const isNarrative =
                      node.description.split(/\s+/).length > 5;
                    return isNarrative ? (
                      <div
                        style={{
                          fontFamily: "'Space Grotesk', sans-serif",
                          fontSize: 7,
                          color: "hsl(210, 18%, 55%)",
                          marginTop: 1,
                          whiteSpace: "nowrap" as const,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          maxWidth: 200,
                        }}
                      >
                        {node.description}
                      </div>
                    ) : null;
                  })()}
                <div
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 7,
                    color: borderColor,
                    marginTop: 1,
                    opacity: 0.7,
                    whiteSpace: "nowrap" as const,
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 4,
                  }}
                >
                  <span>{node.service.split(".").pop()}</span>
                  {directionLabel && (
                    <span
                      style={{
                        opacity: 0.8,
                        fontSize: 6,
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                      }}
                    >
                      {directionLabel}
                    </span>
                  )}
                </div>
              </button>
              {showArrow && (
                <span
                  style={{
                    color: "hsl(210, 12%, 35%)",
                    fontSize: 12,
                    alignSelf: "center",
                    flexShrink: 0,
                  }}
                >
                  &rarr;
                </span>
              )}
            </Fragment>
          );
        })}
      </div>

      {/* Right arrow */}
      <Button
        onClick={() =>
          currentIndex < orderedNodes.length - 1 &&
          navigateTo(orderedNodes[currentIndex + 1])
        }
        disabled={currentIndex >= orderedNodes.length - 1}
        size="icon"
        variant="secondary"
        className="shrink-0 border-none bg-transparent"
      >
        <ArrowRight
          className={cn(
            "h-4 w-4",
            currentIndex < orderedNodes.length - 1
              ? "cursor-pointer text-[hsl(210,50%,65%)]"
              : "text-[hsl(210,12%,30%)]"
          )}
        />
      </Button>

      {/* Step counter + close */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexShrink: 0,
          marginLeft: 4,
        }}
      >
        <span
          style={{
            fontSize: 9,
            color: "hsl(210, 12%, 40%)",
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          {currentIndex + 1}/{orderedNodes.length}
        </span>
        <Button
          onClick={dismiss}
          variant="custom"
          className="h-fit cursor-pointer rounded-[4px] border bg-none px-1.5 py-0.5 text-[9px] text-muted-foreground"
        >
          ESC
        </Button>
      </div>
    </div>
  );
}
