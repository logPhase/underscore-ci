import { cn } from "@/lib/misc-utils";
import { useAnalysis } from "@/store/use-analysis-store";
import { useSelectionStore } from "@/store/use-selection-store";
import { MethodIndexEntry } from "@/types/analysis";
import { X } from "lucide-react";

/**
 * Right-side panel: shows ONLY the selected method's source code body.
 * Nothing else — no call chain, no flow, no navigation.
 */
export function MethodDetailPanel() {
  // const { selectedFunctionCtx, setSelectedFunctionCtx } = useSelectionStore();
  const setSelectedFunctionCtx = useSelectionStore(
    (s) => s.setSelectedFunctionCtx
  );
  const functionId =
    useSelectionStore((s) => s.selectedFunctionCtx?.functionId) || "";
  const functionName =
    useSelectionStore((s) => s.selectedFunctionCtx?.functionName) || "";
  const globalMethodIndex =
    useAnalysis((s) => s.transformedData?.globalMethodIndex) || new Map();
  const prData = useAnalysis((s) => s.transformedData?.prData);

  const getMethodInfo = (fqn: string): MethodIndexEntry | undefined =>
    globalMethodIndex.get(fqn);

  const methodInfo = getMethodInfo(functionId);
  const body = methodInfo?.body || null;
  if (!body) return null;

  return (
    <div
      className={cn(
        "absolute top-4 right-4 bottom-4 z-50 flex w-xl flex-col rounded-md border bg-card/70 shadow-[0_8px_32px_hsla(220,22%,4%,0.6)] backdrop-blur-lg",
        prData ? "mt-13" : "top-17"
      )}
    >
      {/* Header */}
      <div
        className="flex shrink-0 items-center justify-between border-b px-4 py-2.5"
        style={{ borderColor: "hsl(210, 15%, 18%)" }}
      >
        <span className="truncate font-mono text-sm font-semibold text-primary">
          {functionName}
        </span>
        <button
          onClick={() => setSelectedFunctionCtx(null)}
          className="rounded p-1 text-foreground transition-colors hover:bg-white/5"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Method body */}
      <div className="flex-1 overflow-auto p-4">
        {body ? (
          <pre className="font-mono text-[11px] leading-[1.6] whitespace-pre-wrap tab-4 text-[hsl(210,20%,75%)]">
            {body}
          </pre>
        ) : (
          <div
            className="mt-8 text-center font-mono text-xs"
            style={{ color: "hsl(210, 15%, 40%)" }}
          >
            No source code available
          </div>
        )}
      </div>
    </div>
  );
}
