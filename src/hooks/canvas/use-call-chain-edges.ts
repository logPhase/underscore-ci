import { getComponentFunctions } from "@/lib/canvas/get-data";
import { useAnalysis } from "@/store/use-analysis-store";
import { useSelectionStore } from "@/store/use-selection-store";
import { useViewportStore } from "@/store/use-viewport-store";
import { MethodIndexEntry } from "@/types/analysis";
import { CallChainEdge } from "@/types/canvas";
import { RefObject, useCallback, useMemo } from "react";

export interface CallChainEdgesProps {
  methodPosRef: RefObject<
    Map<
      string,
      {
        x: number;
        y: number;
        r: number;
        fileId: string;
        serviceId: string;
      }
    >
  >;
  filePosRef: RefObject<
    Map<
      string,
      {
        x: number;
        y: number;
        size: number;
      }
    >
  >;
  servicePosRef: RefObject<
    Map<
      string,
      {
        cx: number;
        cy: number;
        radius: number;
      }
    >
  >;
}

export const useCallChainEdges = ({
  methodPosRef,
  filePosRef,
  servicePosRef,
}: CallChainEdgesProps) => {
  const selectedFunctionCtx = useSelectionStore(
    (state) => state.selectedFunctionCtx
  );

  const semanticZoomLevel = useViewportStore(
    (state) => state.semanticZoomLevel
  );
  const callChainData = useAnalysis((s) => s.transformedData?.callChainData);

  const globalMethodIndex = useAnalysis(
    (s) => s.transformedData.globalMethodIndex
  );

  const getMethodInfo = useCallback(
    (fqn: string): MethodIndexEntry | undefined => globalMethodIndex?.get(fqn),
    [globalMethodIndex]
  );

  return useMemo<CallChainEdge[]>(() => {
    if (!selectedFunctionCtx || semanticZoomLevel < 3) return [];

    const selFqn = selectedFunctionCtx.functionId;
    const selFileId = selectedFunctionCtx.fileId;
    const selServiceId = selectedFunctionCtx.serviceId;

    // Find the selected method's data
    const fileFns = getComponentFunctions(selFileId);
    const selFn = fileFns.find((f) => f.id === selFqn);
    if (!selFn) return [];

    // Get position of selected method from registry
    const selPos = methodPosRef.current.get(selFqn);
    if (!selPos) return [];

    // Collect caller and callee FQNs
    const callerFqns = [...(selFn.calledBy || [])];
    const calleeFqns = [...(selFn.calls || [])];

    // Enrich with callChainData if available (for cross-file data)

    if (callChainData && callChainData[selFqn]) {
      const entry = callChainData[selFqn];
      for (const c of entry.callers || []) {
        if (!callerFqns.includes(c.fqn)) callerFqns.push(c.fqn);
      }
      for (const c of entry.callees || []) {
        if (!calleeFqns.includes(c.fqn)) calleeFqns.push(c.fqn);
      }
    }

    const edges: CallChainEdge[] = [];

    const resolveTarget = (fqn: string, type: "caller" | "callee") => {
      // Same-file: method is visible in the registry
      const mPos = methodPosRef.current.get(fqn);
      if (mPos) {
        const scope =
          mPos.fileId === selFileId
            ? ("same-file" as const)
            : mPos.serviceId === selServiceId
              ? ("cross-file" as const)
              : ("cross-service" as const);
        const shortName = fqn.split(".").pop() || fqn;
        edges.push({
          fromX: type === "callee" ? selPos.x : mPos.x,
          fromY: type === "callee" ? selPos.y : mPos.y,
          toX: type === "callee" ? mPos.x : selPos.x,
          toY: type === "callee" ? mPos.y : selPos.y,
          type,
          scope,
          targetName: shortName,
          targetFqn: fqn,
        });
        return;
      }

      // Cross-file: look up via global method index
      const info = getMethodInfo(fqn);
      if (info) {
        const scope =
          info.service === selServiceId
            ? ("cross-file" as const)
            : ("cross-service" as const);
        // Try file position
        const fPos = filePosRef.current.get(info.fileId);
        if (fPos) {
          edges.push({
            fromX: type === "callee" ? selPos.x : fPos.x,
            fromY: type === "callee" ? selPos.y : fPos.y,
            toX: type === "callee" ? fPos.x : selPos.x,
            toY: type === "callee" ? fPos.y : selPos.y,
            type,
            scope,
            targetName: info.name,
            targetFqn: fqn,
          });
          return;
        }
        // Fall back to service center
        const sPos = servicePosRef.current.get(info.service);
        if (sPos) {
          edges.push({
            fromX: type === "callee" ? selPos.x : sPos.cx,
            fromY: type === "callee" ? selPos.y : sPos.cy,
            toX: type === "callee" ? sPos.cx : selPos.x,
            toY: type === "callee" ? sPos.cy : selPos.y,
            type,
            scope: "cross-service",
            targetName: info.name,
            targetFqn: fqn,
          });
        }
      }
    };

    for (const fqn of callerFqns) resolveTarget(fqn, "caller");
    for (const fqn of calleeFqns) resolveTarget(fqn, "callee");

    // Limit to top 20, preferring same-file > cross-file > cross-service
    const scopeOrder = {
      "same-file": 0,
      "cross-file": 1,
      "cross-service": 2,
    };
    edges.sort((a, b) => scopeOrder[a.scope] - scopeOrder[b.scope]);
    return edges.slice(0, 20);
  }, [
    callChainData,
    filePosRef,
    getMethodInfo,
    methodPosRef,
    selectedFunctionCtx,
    semanticZoomLevel,
    servicePosRef,
  ]);
};
