import { CallChainEntry, MethodIndexEntry } from "@/types/analysis";
import { RawFile, RawMethod } from "@/types/journey";

export function buildMethodIndex(
  methods: Record<string, RawMethod>,
  files: Record<string, RawFile>
) {
  const globalMethodIndex: Map<string, MethodIndexEntry> = new Map();
  for (const [fqn, m] of Object.entries(methods)) {
    const file = m.file || "";
    const service = file ? files[file]?.service || "" : "";
    globalMethodIndex.set(fqn, {
      name: m.name,
      fileId: file,
      filePath: file,
      service,
      importance: m.importance,
      body: m.body || undefined,
    });
  }
  console.info(
    `[dataLoader] Built global method index: ${globalMethodIndex.size} methods`
  );
  return globalMethodIndex;
}

/** Build the inverse of `calls` (caller FQNs per callee FQN) in one pass. */
function inverseCallGraph(
  calls: Record<string, string[]>
): Record<string, string[]> {
  const inv: Record<string, string[]> = {};
  for (const [fqn, callees] of Object.entries(calls)) {
    for (const c of callees) {
      (inv[c] ??= []).push(fqn);
    }
  }
  return inv;
}

/** Build the CallChainEntry view from the on-disk calls map. The
 *  CallChainEntry shape (with file/service/functionName per edge endpoint)
 *  is preserved so existing canvas panels render unchanged. */
export function buildCallChainData(
  calls: Record<string, string[]>,
  methods: Record<string, RawMethod>,
  files: Record<string, RawFile>
) {
  const calledBy = inverseCallGraph(calls);
  const lookup = (fqn: string) => {
    const m = methods[fqn];
    const file = m?.file || "";
    const service = file ? files[file]?.service || "" : "";
    return {
      fqn,
      functionName: m?.name || "",
      service,
      file,
      callType: "sync" as const,
    };
  };
  const allFqns = new Set<string>([
    ...Object.keys(calls),
    ...Object.keys(calledBy),
  ]);
  const out: Record<string, CallChainEntry> = {};
  for (const fqn of allFqns) {
    out[fqn] = {
      callers: (calledBy[fqn] || []).map(lookup),
      callees: (calls[fqn] || []).map(lookup),
    };
  }
  return out;
}
