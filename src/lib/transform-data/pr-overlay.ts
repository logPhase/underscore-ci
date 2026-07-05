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

export function prOverlayToPRData(
  prOverlay: PROverlayData,
  /** FQN → file path, from the raw methods index — resolves ghost targets
   *  to their actual file. Without it no ghosts are derived (better none
   *  than service-wide false positives). */
  methodFileByFqn?: Record<string, { file?: string }>
): PRData | null {
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

  // Ghost candidates: the SPECIFIC FILES that changed code calls across a
  // service boundary but that aren't themselves in the PR — "the PR may
  // reach here". FILE granularity is the contract: an earlier version
  // pushed the target SERVICE id into this list and the canvas then marked
  // every file of that service with a "?" — one cross-service call drowned
  // whole services in question marks. A target FQN that can't be resolved
  // to a file is skipped (no marker beats a false one).
  const changedFqns = new Set(snaps.map((s) => s.fqn));
  const inPr = new Set(snaps.map((s) => s.fqn));
  const ghostFiles = new Set<string>();
  for (const ed of prOverlay.edgeDeltas || []) {
    if (!changedFqns.has(ed.fromFqn) || !ed.crossService) continue;
    if (inPr.has(ed.toFqn)) continue; // target is in the PR — not a ghost
    const targetFile = methodFileByFqn?.[ed.toFqn]?.file;
    if (targetFile) ghostFiles.add(targetFile);
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
