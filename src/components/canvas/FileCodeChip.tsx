import { getAllFiles } from "@/lib/canvas/get-files";
import { cn } from "@/lib/misc-utils";
import { useAnalysis } from "@/store/use-analysis-store";
import { useFocusStore } from "@/store/use-focus-store";
import { useSelectionStore } from "@/store/use-selection-store";
import { Code2 } from "lucide-react";

/**
 * "View code" chip — the affordance that brings the FileCodePanel back after
 * it's been dismissed. Clicking a file already opens its code panel; but once
 * the reader closes the panel (while the file stays expanded at L3) there was
 * no obvious way to reopen it. This chip fills that gap: shown only when a
 * file is focused AND its code panel is closed AND no method is selected
 * (a method owns the same slot). Sits where the panel's top edge would be.
 */
export function FileCodeChip() {
  const focusedFileId = useFocusStore((s) => s.focusedFileId);
  const codePanelFileId = useFocusStore((s) => s.codePanelFileId);
  const setCodePanelFileId = useFocusStore((s) => s.setCodePanelFileId);
  const selectedFunctionCtx = useSelectionStore((s) => s.selectedFunctionCtx);
  const prData = useAnalysis((s) => s.transformedData?.prData);
  const hasData = useAnalysis((s) => !!s.transformedData);

  if (!focusedFileId) return null;
  if (codePanelFileId) return null; // panel already open
  if (selectedFunctionCtx) return null; // method panel owns the slot
  if (!hasData) return null;

  const file = getAllFiles().find((f) => f.id === focusedFileId);
  if (!file) return null;

  return (
    <button
      type="button"
      onClick={() => setCodePanelFileId(focusedFileId)}
      title={`View code — ${file.path}`}
      aria-label={`View code for ${file.name}`}
      className={cn(
        "absolute right-4 z-50 flex items-center gap-1.5 rounded-md border border-primary/40 bg-card/80 px-2.5 py-1.5 font-mono text-[11px] text-primary shadow-[0_4px_16px_hsla(220,22%,4%,0.5)] backdrop-blur-lg transition-colors hover:border-primary/70 hover:bg-card",
        prData ? "top-[3.75rem]" : "top-[4.25rem]"
      )}
    >
      <Code2 className="h-3.5 w-3.5 shrink-0" />
      <span>View code</span>
      <span className="max-w-[160px] truncate text-[hsl(210,15%,55%)]">
        {file.name}
      </span>
    </button>
  );
}
