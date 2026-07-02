import { PRData, PROverlayData } from "@/types/analysis";

export function setPROverlay(raw: unknown) {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const r = raw as Record<string, unknown>;
  // Accept if it has snapshots or at minimum a title+baseSha (new contract)
  if (!r.snapshots && !(r.title && r.baseSha)) {
    return null;
  }
  const prOverlay = r as unknown as PROverlayData;
  console.info(
    `[dataLoader] PR overlay loaded: "${prOverlay.title}" — ${prOverlay.snapshots?.length ?? 0} snapshots`
  );

  return prOverlay;
}

export function prOverlayToPRData(prOverlay: PROverlayData): PRData | null {
  if (!prOverlay) return null;
  const snaps = prOverlay.snapshots || [];

  // Group files by change type
  const modifiedFiles = new Set<string>();
  const addedFiles = new Set<string>();
  const deletedFiles = new Set<string>();

  for (const s of snaps) {
    const fileId = s.file || "";
    if (!fileId) continue;
    switch (s.change) {
      case "modified":
        modifiedFiles.add(fileId);
        break;
      case "added":
        addedFiles.add(fileId);
        break;
      case "deleted":
        deletedFiles.add(fileId);
        break;
    }
  }

  // Ghost candidates: files that have callers from changed methods but aren't in the PR
  // Derive from edge deltas — methods called by changed methods but in different files
  const changedFqns = new Set(snaps.map((s) => s.fqn));
  const ghostFiles = new Set<string>();
  for (const ed of prOverlay.edgeDeltas || []) {
    if (changedFqns.has(ed.fromFqn) && ed.crossService) {
      // The target of a cross-service call from changed code — potential ghost
      const targetSnap = snaps.find((s) => s.fqn === ed.toFqn);
      if (!targetSnap) {
        // Target isn't in the PR — it's a ghost
        ghostFiles.add(ed.toService);
      }
    }
  }

  return {
    title: prOverlay.title || "PR Analysis",
    filesModified: [...modifiedFiles],
    filesAdded: [...addedFiles],
    filesDeleted: [...deletedFiles],
    ghostCandidates: [...ghostFiles],
    semanticGhosts: [],
    newViolation: { from: "", to: "" },
    aiNarrative: "",
    tourSteps: [],
  };
}
