import CodeBlock from "@/components/journeys/CodeBlock";
import {
  PanelResizeHandle,
  PanelWidthButtons,
} from "@/components/canvas/code-panel-resizer";
import { langFromFile } from "@/components/ui/CodeHighlight";
import { cn } from "@/lib/misc-utils";
import { useAnalysis } from "@/store/use-analysis-store";
import { useSelectionStore } from "@/store/use-selection-store";
import { useUIStore } from "@/store/use-ui-store";
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
  const width = useUIStore((s) => s.codePanelWidth);

  const getMethodInfo = (fqn: string): MethodIndexEntry | undefined =>
    globalMethodIndex.get(fqn);

  const methodInfo = getMethodInfo(functionId);
  const body = methodInfo?.body || null;
  if (!body) return null;

  return (
    <div
      style={{ width }}
      className={cn(
        "absolute top-4 right-4 bottom-4 z-50 flex flex-col rounded-md border bg-card/70 shadow-[0_8px_32px_hsla(220,22%,4%,0.6)] backdrop-blur-lg",
        prData ? "mt-13" : "top-17"
      )}
    >
      <PanelResizeHandle />
      {/* Header */}
      <div
        className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-2.5"
        style={{ borderColor: "hsl(210, 15%, 18%)" }}
      >
        <span className="truncate font-mono text-sm font-semibold text-primary">
          {functionName}
        </span>
        <div className="flex shrink-0 items-center gap-0.5">
          <PanelWidthButtons />
          <button
            onClick={() => setSelectedFunctionCtx(null)}
            title="Close"
            aria-label="Close method panel"
            className="rounded p-1 text-foreground transition-colors hover:bg-white/5"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Method body — syntax-highlighted; language from the file extension */}
      <div className="flex-1 overflow-auto p-4">
        <CodeBlock code={body} lang={langFromFile(methodInfo?.filePath)} />
      </div>
    </div>
  );
}
