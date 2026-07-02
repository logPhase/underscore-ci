import {
  getFlowForFunction,
  getPackageRegionCenter,
  getRegionCenter,
} from "@/lib/canvas/get-data";
import { getPackagePositions } from "@/lib/canvas/get-positions";
import { useAnalysis } from "@/store/use-analysis-store";
import { useFocusStore } from "@/store/use-focus-store";
import { useJourneyStore } from "@/store/use-journey-store";
import { useSelectionStore } from "@/store/use-selection-store";
import { useUIStore } from "@/store/use-ui-store";
import { useViewportStore } from "@/store/use-viewport-store";
import { CrossModuleFlow } from "@/types/analysis";
import { useReactFlow } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef } from "react";

export const Shortcuts = ({
  containerRef,
}: {
  containerRef: React.RefObject<HTMLDivElement>;
}) => {
  const { fitView } = useReactFlow();

  const preTraceZoom = useRef<{
    zoom: number;
    pan: { x: number; y: number };
  } | null>(null);

  const searchOpen = useUIStore((state) => state.searchOpen);
  const setSearchOpen = useUIStore((state) => state.setSearchOpen);
  const helpOpen = useUIStore((state) => state.helpOpen);
  const setHelpOpen = useUIStore((state) => state.setHelpOpen);

  const selectedFunctionCtx = useSelectionStore(
    (state) => state.selectedFunctionCtx
  );
  const setSelectedFunctionCtx = useSelectionStore(
    (state) => state.setSelectedFunctionCtx
  );
  const setActiveParamTrace = useSelectionStore(
    (state) => state.setActiveParamTrace
  );
  const setActiveCallChain = useSelectionStore(
    (state) => state.setActiveCallChain
  );

  const setCallChainCursorFqn = useSelectionStore(
    (state) => state.setCallChainCursorFqn
  );

  const focusedFileId = useFocusStore((state) => state.focusedFileId);
  const setFocusedFileId = useFocusStore((state) => state.setFocusedFileId);
  const focusedPackageId = useFocusStore((state) => state.focusedPackageId);
  const setFocusedPackageId = useFocusStore(
    (state) => state.setFocusedPackageId
  );
  const focusedServiceId = useFocusStore((state) => state.focusedServiceId);
  const setFocusedServiceId = useFocusStore(
    (state) => state.setFocusedServiceId
  );

  const activeJourney = useJourneyStore((state) => state.activeJourney);
  const activePhaseIdx = useJourneyStore((state) => state.activePhaseIdx);
  const selectPhase = useJourneyStore((state) => state.selectPhase);
  const deactivateJourney = useJourneyStore((state) => state.deactivateJourney);

  const services = useAnalysis((state) => state.transformedData?.services);

  const setPan = useViewportStore((state) => state.setPan);
  const zoomTo = useViewportStore((state) => state.zoomTo);
  const setZoom = useViewportStore((state) => state.setZoom);
  const zoom = useViewportStore((state) => state.zoom);

  const activeFlow = useMemo(() => {
    if (!selectedFunctionCtx) return null;
    return getFlowForFunction(
      selectedFunctionCtx.functionName,
      selectedFunctionCtx.serviceId
    );
  }, [selectedFunctionCtx]);

  const navigateToFlowNode = useCallback(
    (node: CrossModuleFlow["nodes"][0]) => {
      // Find world position of this node
      if (!services) return;
      const svc = services.find((s) => s.id === node.serviceId);
      if (!svc) return;

      const pkgs = getPackagePositions(svc);
      const pkg = pkgs.find((p) => p.name === node.packageName);
      const cx = pkg ? pkg.cx : svc.cx;
      const cy = pkg ? pkg.cy : svc.cy;

      setActiveParamTrace(null); // Clear param trace when navigating
      setSelectedFunctionCtx({
        functionId: node.id,
        fileId: `${node.serviceId}/${node.packageName}/${node.fileName}`,
        packageId: `${node.serviceId}/${node.packageName}`,
        serviceId: node.serviceId,
        functionName: node.functionName,
      });

      // Smooth pan to center on this node
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        zoomTo(cx, cy, zoom, rect.width, rect.height);
      }
    },
    [
      services,
      setActiveParamTrace,
      setSelectedFunctionCtx,
      containerRef,
      zoomTo,
      zoom,
    ]
  );

  const currentFlowIdx = useMemo(() => {
    if (!activeFlow || !selectedFunctionCtx) return -1;
    const exact = activeFlow.nodes.findIndex(
      (n) => n.functionName === selectedFunctionCtx.functionName
    );
    if (exact >= 0) return exact;
    // If selected function isn't an exact flow node, find the closest by service
    const byService = activeFlow.nodes.findIndex(
      (n) => n.serviceId === selectedFunctionCtx.serviceId
    );
    return byService >= 0 ? byService : 0;
  }, [activeFlow, selectedFunctionCtx]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Cmd+K belongs to the global command palette (command-palette.tsx).
      if (
        e.key === "?" &&
        !(e.target as HTMLElement).matches("input,textarea")
      ) {
        setHelpOpen(!helpOpen);
      }
      if (e.key === "Escape") {
        if (helpOpen) {
          setHelpOpen(false);
          return;
        }
        // Search overlay gets ESC priority — let it close first
        if (searchOpen) {
          setSearchOpen(false);
          return;
        }
        // Journey active — deactivate entirely
        // (Two-step phase→journey ESC was broken by mouseEnter race on phase links)
        if (activeJourney) {
          deactivateJourney();
          return;
        }
        // Unwind navigation stack one level at a time
        if (selectedFunctionCtx) {
          setActiveParamTrace(null);
          // Clear call chain state (frozen chain + cursor) alongside selection
          setActiveCallChain(null);
          setCallChainCursorFqn(null);
          setSelectedFunctionCtx(null);
          setFocusedFileId(null);
          if (preTraceZoom.current) {
            setPan(preTraceZoom.current.pan);
            setZoom(preTraceZoom.current.zoom);
            preTraceZoom.current = null;
          }
        } else if (focusedFileId) {
          setFocusedFileId(null);
          const parentPackage = getPackageRegionCenter(
            focusedServiceId,
            focusedPackageId
          );
          if (containerRef.current && parentPackage) {
            const rect = containerRef.current.getBoundingClientRect();
            zoomTo(
              parentPackage.cx,
              parentPackage.cy,
              5,
              rect.width,
              rect.height
            );
          }
        } else if (focusedPackageId) {
          setFocusedPackageId(null);
          // zoom out to the center of package's service
          const parentService = getRegionCenter(focusedServiceId);
          if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            zoomTo(
              parentService.cx,
              parentService.cy,
              2.2,
              rect.width,
              rect.height
            );
          }
        } else if (focusedServiceId) {
          setFocusedServiceId(null);
          if (containerRef.current) {
            fitView({ maxZoom: 0.55, duration: 300 });
          }
        }
      }
      // Arrow key journey phase navigation
      if (activeJourney && activePhaseIdx !== null) {
        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          e.preventDefault();
          const next = Math.min(
            activePhaseIdx + 1,
            activeJourney.phases.length - 1
          );
          if (next !== activePhaseIdx) selectPhase(next);
        }
        if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          e.preventDefault();
          const prev = Math.max(activePhaseIdx - 1, 0);
          if (prev !== activePhaseIdx) selectPhase(prev);
        }
      }
      // Arrow key flow navigation
      if (activeFlow && currentFlowIdx >= 0) {
        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          e.preventDefault();
          const nextIdx = Math.min(
            currentFlowIdx + 1,
            activeFlow.nodes.length - 1
          );
          if (nextIdx !== currentFlowIdx)
            navigateToFlowNode(activeFlow.nodes[nextIdx]);
        }
        if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          e.preventDefault();
          const prevIdx = Math.max(currentFlowIdx - 1, 0);
          if (prevIdx !== currentFlowIdx)
            navigateToFlowNode(activeFlow.nodes[prevIdx]);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    searchOpen,
    setSearchOpen,
    setZoom,
    selectedFunctionCtx,
    setActiveParamTrace,
    setSelectedFunctionCtx,
    setFocusedFileId,
    setPan,
    activeFlow,
    currentFlowIdx,
    navigateToFlowNode,
    focusedFileId,
    focusedPackageId,
    focusedServiceId,
    setFocusedPackageId,
    setFocusedServiceId,
    zoomTo,
    helpOpen,
    setActiveCallChain,
    setCallChainCursorFqn,
    activeJourney,
    activePhaseIdx,
    deactivateJourney,
    selectPhase,
    setHelpOpen,
    containerRef,
    fitView,
  ]);

  return <></>;
};
