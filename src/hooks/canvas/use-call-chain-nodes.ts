import { getComponentFunctions } from "@/lib/canvas/get-data";
import { useAnalysis } from "@/store/use-analysis-store";
import { useSelectionStore } from "@/store/use-selection-store";
import { MethodIndexEntry } from "@/types/analysis";
import { CallChainNode } from "@/types/store";
import { useMemo } from "react";
import { CallChainEdgesProps } from "./use-call-chain-edges";

interface UseCallChainNodesProps extends CallChainEdgesProps {
  expandedCollapse: Set<string>;
  chainDirection: "fan-out" | "fan-in";
}

export const useCallChainNodes = ({
  servicePosRef,
  filePosRef,
  chainDirection,
  expandedCollapse,
}: UseCallChainNodesProps) => {
  const selectedFunctionCtx = useSelectionStore(
    (state) => state.selectedFunctionCtx
  );

  const services = useAnalysis((s) => s.transformedData?.services) || [];
  const sharedLibs = useAnalysis((s) => s.transformedData?.sharedLibs) || [];

  const callChainData =
    useAnalysis((s) => s.transformedData?.callChainData) || [];

  const globalMethodIndex =
    useAnalysis((state) => state.transformedData?.globalMethodIndex) ||
    new Map();

  const getMethodInfo = (fqn: string): MethodIndexEntry | undefined =>
    globalMethodIndex.get(fqn);

  const callChainNodes = useMemo<CallChainNode[]>(() => {
    if (!selectedFunctionCtx) return [];

    const nodes: CallChainNode[] = [];

    // Deterministic offset from FQN (avoids Math.random)
    const fqnOffset = (fqn: string, radius: number) => {
      const hash = fqn.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
      const offsetX = (((hash % 100) - 50) / 50) * radius * 0.6;
      const offsetY = ((((hash * 7) % 100) - 50) / 50) * radius * 0.6;
      return { offsetX, offsetY };
    };

    // Focal function's file ID for cross-file detection
    const focalFileId = selectedFunctionCtx.fileId;

    // Resolve a FQN to a CallChainNode with position
    const resolveNode = (
      fqn: string,
      type: "caller" | "callee"
    ): CallChainNode | null => {
      const chainData = callChainData;
      const chainEntry = chainData?.[selectedFunctionCtx.functionId];

      // Try callChainData first (has resolved service/file info)
      const callerEntry = chainEntry?.callers?.find(
        (c: { fqn: string }) => c.fqn === fqn
      );
      const calleeEntry = chainEntry?.callees?.find(
        (c: { fqn: string }) => c.fqn === fqn
      );
      const resolved = callerEntry || calleeEntry;

      const info = getMethodInfo(fqn);
      const svcId = info?.service || resolved?.service || "";
      const svcPos = servicePosRef.current.get(svcId);
      if (!svcPos) return null;

      const { offsetX, offsetY } = fqnOffset(fqn, svcPos.radius);
      const fnData = info
        ? getComponentFunctions(info.fileId).find((f) => f.id === fqn)
        : null;
      const name =
        info?.name ||
        resolved?.functionName ||
        fqn.split(".").pop()?.split("(")[0] ||
        "";
      const fileName =
        (info?.filePath || resolved?.file || "").split("/").pop() || "";
      const isCrossFile = info ? info.fileId !== focalFileId : true;

      return {
        fqn,
        name,
        fileName,
        service: svcId,
        x: svcPos.cx + offsetX,
        y: svcPos.cy + offsetY,
        type,
        importance: info?.importance ?? 0.5,
        description: fnData?.description || "",
        isCrossFile,
      };
    };

    // Collect all direct callee FQNs for the focal function
    const chainData = callChainData;
    const entry = chainData?.[selectedFunctionCtx.functionId];
    const allFnsForFile = getComponentFunctions(selectedFunctionCtx.fileId);
    const selFn = allFnsForFile.find(
      (f) => f.id === selectedFunctionCtx.functionId
    );

    // Merge callee FQNs from callChainData and selFn.calls
    const allCalleeFqns: string[] = [];
    if (entry?.callees) {
      for (const c of entry.callees) {
        if (!allCalleeFqns.includes(c.fqn)) allCalleeFqns.push(c.fqn);
      }
    }
    if (selFn?.calls) {
      for (const fqn of selFn.calls) {
        if (!allCalleeFqns.includes(fqn)) allCalleeFqns.push(fqn);
      }
    }

    // Merge caller FQNs from callChainData and selFn.calledBy
    const allCallerFqns: string[] = [];
    if (entry?.callers) {
      for (const c of entry.callers) {
        if (!allCallerFqns.includes(c.fqn)) allCallerFqns.push(c.fqn);
      }
    }
    if (selFn?.calledBy) {
      for (const fqn of selFn.calledBy) {
        if (!allCallerFqns.includes(fqn)) allCallerFqns.push(fqn);
      }
    }

    // ── Compute spine: follow highest-importance callee/caller at each step ──
    // Direction depends on chainDirection state: 'fan-out' follows callees, 'fan-in' follows callers
    // Allow deeper traversal (up to 12), then enforce depth budget (cap at 8)
    const rawSpineNodes: CallChainNode[] = [];
    const spineFqns = new Set<string>();
    let currentFqn = selectedFunctionCtx.functionId;
    const maxSpineDepth = 12;

    if (chainDirection === "fan-out") {
      // Fan-out: follow callees forward (default behavior)
      for (let depth = 0; depth < maxSpineDepth; depth++) {
        let currentCallees: string[] = [];

        if (depth === 0) {
          currentCallees = allCalleeFqns;
        } else {
          const spineChainEntry = chainData?.[currentFqn];
          if (spineChainEntry?.callees) {
            currentCallees = spineChainEntry.callees.map(
              (c: { fqn: string }) => c.fqn
            );
          } else {
            const spineInfo = getMethodInfo(currentFqn);
            if (spineInfo) {
              const spineFns = getComponentFunctions(spineInfo.fileId);
              const spineFn = spineFns.find((f) => f.id === currentFqn);
              currentCallees = spineFn?.calls || [];
            }
          }
        }

        if (currentCallees.length === 0) break;

        let bestCallee: string | null = null;
        let bestImportance = -1;
        for (const calleeFqn of currentCallees) {
          if (
            spineFqns.has(calleeFqn) ||
            calleeFqn === selectedFunctionCtx.functionId
          )
            continue;
          const calleeInfo = getMethodInfo(calleeFqn);
          const imp = calleeInfo?.importance ?? 0;
          if (imp > bestImportance) {
            bestImportance = imp;
            bestCallee = calleeFqn;
          }
        }

        if (!bestCallee) break;
        currentFqn = bestCallee;
        spineFqns.add(bestCallee);

        const calleeInfo = getMethodInfo(bestCallee);
        const svcPos = servicePosRef.current.get(calleeInfo?.service || "");
        if (svcPos) {
          const { offsetX, offsetY } = fqnOffset(bestCallee, svcPos.radius);
          const fnData = calleeInfo
            ? getComponentFunctions(calleeInfo.fileId).find(
                (f) => f.id === bestCallee
              )
            : null;
          rawSpineNodes.push({
            fqn: bestCallee,
            name:
              calleeInfo?.name ||
              bestCallee.split(".").pop()?.split("(")[0] ||
              "",
            fileName: (calleeInfo?.filePath || "").split("/").pop() || "",
            service: calleeInfo?.service || "",
            x: svcPos.cx + offsetX,
            y: svcPos.cy + offsetY,
            type: "callee",
            importance: bestImportance,
            description: fnData?.description || "",
            depth: depth + 1,
            nodeRole: "spine",
            isCrossFile: calleeInfo ? calleeInfo.fileId !== focalFileId : true,
          });
        }
      }
    } else {
      // Fan-in: follow callers backward — spine traces who called this
      for (let depth = 0; depth < maxSpineDepth; depth++) {
        let currentCallers: string[] = [];

        if (depth === 0) {
          currentCallers = allCallerFqns;
        } else {
          const spineChainEntry = chainData?.[currentFqn];
          if (spineChainEntry?.callers) {
            currentCallers = spineChainEntry.callers.map(
              (c: { fqn: string }) => c.fqn
            );
          } else {
            const spineInfo = getMethodInfo(currentFqn);
            if (spineInfo) {
              const spineFns = getComponentFunctions(spineInfo.fileId);
              const spineFn = spineFns.find((f) => f.id === currentFqn);
              currentCallers = spineFn?.calledBy || [];
            }
          }
        }

        if (currentCallers.length === 0) break;

        let bestCaller: string | null = null;
        let bestImportance = -1;
        for (const callerFqn of currentCallers) {
          if (
            spineFqns.has(callerFqn) ||
            callerFqn === selectedFunctionCtx.functionId
          )
            continue;
          const callerInfo = getMethodInfo(callerFqn);
          const imp = callerInfo?.importance ?? 0;
          if (imp > bestImportance) {
            bestImportance = imp;
            bestCaller = callerFqn;
          }
        }

        if (!bestCaller) break;
        currentFqn = bestCaller;
        spineFqns.add(bestCaller);

        const callerInfo = getMethodInfo(bestCaller);
        const svcPos = servicePosRef.current.get(callerInfo?.service || "");
        if (svcPos) {
          const { offsetX, offsetY } = fqnOffset(bestCaller, svcPos.radius);
          const fnData = callerInfo
            ? getComponentFunctions(callerInfo.fileId).find(
                (f) => f.id === bestCaller
              )
            : null;
          rawSpineNodes.push({
            fqn: bestCaller,
            name:
              callerInfo?.name ||
              bestCaller.split(".").pop()?.split("(")[0] ||
              "",
            fileName: (callerInfo?.filePath || "").split("/").pop() || "",
            service: callerInfo?.service || "",
            x: svcPos.cx + offsetX,
            y: svcPos.cy + offsetY,
            type: "caller",
            importance: bestImportance,
            description: fnData?.description || "",
            depth: -(depth + 1),
            nodeRole: "spine",
            isCrossFile: callerInfo ? callerInfo.fileId !== focalFileId : true,
          });
        }
      }
    }

    // ── Depth budget enforcement: cap spine at 8 nodes, collapse middle ──
    const maxSpineBudget = 8;
    const spineCollapseId = `spine-collapse-${selectedFunctionCtx.functionId}`;
    const isSpineExpanded = expandedCollapse.has(spineCollapseId);
    let spineNodes: CallChainNode[];
    if (rawSpineNodes.length > maxSpineBudget && !isSpineExpanded) {
      const keepFirst = 3; // first 3 spine nodes
      const keepLast = 2; // last 2 spine nodes
      const collapsedCount = rawSpineNodes.length - keepFirst - keepLast;
      const firstPart = rawSpineNodes.slice(0, keepFirst);
      const lastPart = rawSpineNodes.slice(rawSpineNodes.length - keepLast);
      // Position aggregate between the last kept-first and first kept-last node
      const bridgeLeft = firstPart[firstPart.length - 1];
      const bridgeRight = lastPart[0];
      const aggregateNode: CallChainNode = {
        fqn: spineCollapseId,
        name: `${collapsedCount} intermediate`,
        fileName: "",
        service: bridgeLeft.service,
        x: (bridgeLeft.x + bridgeRight.x) / 2,
        y: (bridgeLeft.y + bridgeRight.y) / 2,
        type: "callee",
        importance: 0.3,
        depth: keepFirst + 1,
        nodeRole: "aggregate",
      };
      // Re-number depths for last part
      const reNumbered = lastPart.map((n, idx) => ({
        ...n,
        depth: keepFirst + 2 + idx,
      }));
      spineNodes = [...firstPart, aggregateNode, ...reNumbered];
    } else {
      spineNodes = rawSpineNodes;
    }

    // ── Focal node ──
    const selService = servicePosRef.current.get(selectedFunctionCtx.serviceId);
    if (selService) {
      const selFnDesc =
        allFnsForFile.find((f) => f.id === selectedFunctionCtx.functionId)
          ?.description || "";
      nodes.push({
        fqn: selectedFunctionCtx.functionId,
        name: selectedFunctionCtx.functionName,
        fileName: "",
        service: selectedFunctionCtx.serviceId,
        x: selService.cx,
        y: selService.cy,
        type: "selected",
        importance: 1,
        description: selFnDesc,
        depth: 0,
        nodeRole: "spine",
      });
    }

    // ── Spine nodes (depth 1-3 along the primary pathway) ──
    for (const sn of spineNodes) {
      nodes.push(sn);
    }

    const addedFqns = new Set<string>([
      selectedFunctionCtx.functionId,
      ...spineFqns,
    ]);

    // ── Branch nodes (direct callees NOT on the spine, depth 1) ──
    // First, resolve all branch nodes and collect their roles for bundling
    const branchCandidates: CallChainNode[] = [];
    for (const calleeFqn of allCalleeFqns) {
      if (addedFqns.has(calleeFqn)) continue;
      addedFqns.add(calleeFqn);
      const resolved = resolveNode(calleeFqn, "callee");
      if (resolved) {
        branchCandidates.push({ ...resolved, depth: 1, nodeRole: "branch" });
      }
    }

    // Role bundling: group branches by semantic role, bundle if 3+ share a role
    const branchRoleGroups = new Map<string, CallChainNode[]>();
    for (const branch of branchCandidates) {
      const info = getMethodInfo(branch.fqn);
      let role = "utility";
      if (info) {
        const fns = getComponentFunctions(info.fileId);
        const fn = fns.find((f) => f.id === branch.fqn);
        role = fn?.role || "utility";
      }
      if (!branchRoleGroups.has(role)) branchRoleGroups.set(role, []);
      branchRoleGroups.get(role)!.push(branch);
    }

    for (const [role, group] of branchRoleGroups) {
      if (group.length >= 3) {
        // Create a role bundle aggregate node
        const avgX = group.reduce((s, n) => s + n.x, 0) / group.length;
        const avgY = group.reduce((s, n) => s + n.y, 0) / group.length;
        const rolePlural = role.endsWith("s") ? role : role + "s";
        nodes.push({
          fqn: `role-bundle-${role}-${selectedFunctionCtx.functionId}`,
          name: `${group.length} ${rolePlural}`,
          fileName: "",
          service: group[0].service,
          x: avgX,
          y: avgY,
          type: "callee",
          importance: Math.max(...group.map((n) => n.importance)),
          depth: 1,
          nodeRole: "aggregate",
          bundleRole: role,
          bundledFqns: group.map((n) => n.fqn),
          bundledNames: group.map((n) => n.name),
        });
      } else {
        // Not enough to bundle, add individually
        for (const branch of group) {
          nodes.push(branch);
        }
      }
    }

    // ── Fan-in summary node (single compact block summarizing all callers) ──
    if (allCallerFqns.length > 0) {
      // Resolve caller info for summary
      const callerInfos: Array<{
        fqn: string;
        name: string;
        service: string;
        importance: number;
      }> = [];
      for (const callerFqn of allCallerFqns) {
        if (addedFqns.has(callerFqn)) continue;
        const info = getMethodInfo(callerFqn);
        const name =
          info?.name || callerFqn.split(".").pop()?.split("(")[0] || callerFqn;
        const service = info?.service || "";
        callerInfos.push({
          fqn: callerFqn,
          name,
          service,
          importance: info?.importance ?? 0,
        });
      }
      // Sort by importance descending
      callerInfos.sort((a, b) => b.importance - a.importance);

      if (callerInfos.length > 0) {
        // Count distinct files
        const callerFiles = new Set<string>();
        for (const ci of callerInfos) {
          const info = getMethodInfo(ci.fqn);
          if (info?.fileId) callerFiles.add(info.fileId);
        }

        // Position above the focal node
        const selService = servicePosRef.current.get(
          selectedFunctionCtx.serviceId
        );
        const fanInX = selService ? selService.cx : 0;
        const fanInY = selService ? selService.cy - 60 : -60;

        // Create a single fan-in summary node
        const summaryCallers = callerInfos.slice(0, 5).map((ci) => ({
          fqn: ci.fqn,
          name: ci.name,
          service: ci.service,
        }));

        nodes.push({
          fqn: `fan-in-summary-${selectedFunctionCtx.functionId}`,
          name: `Called by: ${callerInfos.length} function${callerInfos.length !== 1 ? "s" : ""}`,
          fileName: "",
          service: selectedFunctionCtx.serviceId,
          x: fanInX,
          y: fanInY,
          type: "caller",
          importance: callerInfos[0]?.importance ?? 0.5,
          depth: -1,
          nodeRole: "fan-in",
          fanInCallers: summaryCallers,
          fanInTotalCount: callerInfos.length,
          fanInFileCount: callerFiles.size,
        });

        // Also mark all caller FQNs as added to avoid duplicates
        for (const ci of callerInfos) addedFqns.add(ci.fqn);
      }
    }

    // ── Aggregate nodes for depth 2+ callees of spine nodes ──
    for (const sn of spineNodes) {
      const snInfo = getMethodInfo(sn.fqn);
      let snCallees: string[] = [];
      const snChainEntry = chainData?.[sn.fqn];
      if (snChainEntry?.callees) {
        snCallees = snChainEntry.callees.map((c: { fqn: string }) => c.fqn);
      } else if (snInfo) {
        const snFns = getComponentFunctions(snInfo.fileId);
        const snFn = snFns.find((f) => f.id === sn.fqn);
        snCallees = snFn?.calls || [];
      }
      // Filter out already-added nodes
      const remaining = snCallees.filter((fqn) => !addedFqns.has(fqn));
      if (remaining.length > 0) {
        const { offsetX, offsetY } = fqnOffset(`aggregate-${sn.fqn}`, 40);
        nodes.push({
          fqn: `aggregate-${sn.fqn}`,
          name: `${remaining.length} more`,
          fileName: "",
          service: sn.service,
          x: sn.x + offsetX * 0.5 + 40,
          y: sn.y + offsetY * 0.5 + 30,
          type: "callee",
          importance: 0.3,
          depth: 2,
          nodeRole: "aggregate",
        });
      }
    }

    // Spread same-file nodes radially around the file center
    const fileGroups = new Map<string, number[]>();
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].nodeRole === "aggregate") continue; // don't reposition aggregates
      if (nodes[i].depth === 0) continue; // don't reposition focal node
      if (nodes[i].nodeRole === "spine") continue; // don't reposition spine nodes (preserves primary pathway)
      const info = getMethodInfo(nodes[i].fqn);
      const fileId = info?.fileId || "";
      if (fileId) {
        if (!fileGroups.has(fileId)) fileGroups.set(fileId, []);
        fileGroups.get(fileId)!.push(i);
      }
    }
    for (const [fileId, indices] of fileGroups) {
      if (indices.length < 2) continue;
      const filePos = filePosRef.current.get(fileId);
      const spreadR = filePos ? filePos.size * 2.5 + 15 : 25;
      const centerX = nodes[indices[0]].x;
      const centerY = nodes[indices[0]].y;
      for (let k = 0; k < indices.length; k++) {
        const angle = (k / indices.length) * 2 * Math.PI - Math.PI / 2;
        nodes[indices[k]] = {
          ...nodes[indices[k]],
          x: centerX + Math.cos(angle) * spreadR,
          y: centerY + Math.sin(angle) * spreadR,
        };
      }
    }

    // Repulsion pass: ensure minimum separation between nodes
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[j].x - nodes[i].x;
        const dy = nodes[j].y - nodes[i].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = 45;
        if (dist < minDist) {
          if (dist < 0.1) {
            const angle = (((i * 7 + j * 13) % 100) / 100) * 2 * Math.PI;
            const push = minDist / 2;
            nodes[i] = {
              ...nodes[i],
              x: nodes[i].x - Math.cos(angle) * push,
              y: nodes[i].y - Math.sin(angle) * push,
            };
            nodes[j] = {
              ...nodes[j],
              x: nodes[j].x + Math.cos(angle) * push,
              y: nodes[j].y + Math.sin(angle) * push,
            };
          } else {
            const push = (minDist - dist) / 2;
            const nx = dx / dist;
            const ny = dy / dist;
            nodes[i] = {
              ...nodes[i],
              x: nodes[i].x - nx * push,
              y: nodes[i].y - ny * push,
            };
            nodes[j] = {
              ...nodes[j],
              x: nodes[j].x + nx * push,
              y: nodes[j].y + ny * push,
            };
          }
        }
      }
    }

    // Importance-aware cap: always keep focal + spine nodes, drop least-important branches
    const maxNodes = 25;
    if (nodes.length > maxNodes) {
      const spineAndFocal = nodes.filter(
        (n) => n.depth === 0 || n.nodeRole === "spine"
      );
      const rest = nodes.filter((n) => n.depth !== 0 && n.nodeRole !== "spine");
      rest.sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0));
      return [
        ...spineAndFocal,
        ...rest.slice(0, maxNodes - spineAndFocal.length),
      ];
    }
    return nodes;
  }, [
    selectedFunctionCtx,
    services,
    sharedLibs,
    expandedCollapse,
    chainDirection,
  ]);

  return callChainNodes;
};
