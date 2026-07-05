import CodeBlock from "@/components/journeys/CodeBlock";
import {
  PanelResizeHandle,
  PanelWidthButtons,
} from "@/components/canvas/code-panel-resizer";
import { langFromFile } from "@/components/ui/CodeHighlight";
import { getComponentFunctions } from "@/lib/canvas/get-data";
import { getAllFiles } from "@/lib/canvas/get-files";
import { cn } from "@/lib/misc-utils";
import { useAnalysis } from "@/store/use-analysis-store";
import { useFocusStore } from "@/store/use-focus-store";
import { useSelectionStore } from "@/store/use-selection-store";
import { useUIStore } from "@/store/use-ui-store";
import { X } from "lucide-react";

/**
 * Right-side panel: the focused FILE rendered as one scrollable, syntax-
 * highlighted document — every method body of the file, in order, each
 * under a dim divider with the method name.
 *
 * The analysis payload carries no whole-file source, only per-method
 * bodies, so the file is reconstructed from its methods (the same
 * ComponentFunction source the canvas method-circles draw from).
 *
 * Sibling of MethodDetailPanel: they share the same slot and never show
 * together. Selecting a method takes precedence (this panel yields);
 * opening this panel clears the method selection at the click site.
 */
export function FileCodePanel() {
  const codePanelFileId = useFocusStore((s) => s.codePanelFileId);
  const setCodePanelFileId = useFocusStore((s) => s.setCodePanelFileId);
  const width = useUIStore((s) => s.codePanelWidth);
  const selectedFunctionCtx = useSelectionStore((s) => s.selectedFunctionCtx);
  const prData = useAnalysis((s) => s.transformedData?.prData);
  // Subscribe to payload presence so the file/method lookup re-runs once the
  // report finishes loading (getAllFiles/getComponentFunctions read getState()).
  const hasData = useAnalysis((s) => !!s.transformedData);

  if (!codePanelFileId) return null;
  // A selected method owns the slot — never render both panels at once.
  if (selectedFunctionCtx) return null;
  if (!hasData) return null;

  const file = getAllFiles().find((f) => f.id === codePanelFileId);
  if (!file) return null;

  const fns = getComponentFunctions(file.id);
  const lang = langFromFile(file.path);
  const totalLines = fns.reduce(
    (a, f) => a + (f.body ? f.body.split("\n").length : 0),
    0
  );

  return (
    <div
      style={{ width }}
      className={cn(
        "absolute top-4 right-4 bottom-4 z-50 flex flex-col rounded-md border bg-card/70 shadow-[0_8px_32px_hsla(220,22%,4%,0.6)] backdrop-blur-lg",
        prData ? "mt-13" : "top-17"
      )}
    >
      <PanelResizeHandle />
      {/* Header — file identity + counts */}
      <div
        className="flex shrink-0 items-start justify-between gap-3 border-b px-4 py-2.5"
        style={{ borderColor: "hsl(210, 15%, 18%)" }}
      >
        <div className="min-w-0 flex-1">
          <div className="truncate font-mono text-sm font-semibold text-primary">
            {file.name}
          </div>
          <div className="truncate font-mono text-[11px] text-[hsl(210,15%,45%)]">
            {file.path}
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-[hsl(210,15%,40%)]">
            {file.service} · {fns.length} method{fns.length === 1 ? "" : "s"} ·{" "}
            {totalLines} lines
          </div>
        </div>
        <div className="mt-0.5 flex shrink-0 items-center gap-0.5">
          <PanelWidthButtons />
          <button
            onClick={() => setCodePanelFileId(null)}
            title="Close"
            aria-label="Close code panel"
            className="rounded p-1 text-foreground transition-colors hover:bg-white/5"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* File body — every method in order, highlighted */}
      <div className="flex-1 space-y-3 overflow-auto p-4">
        {fns.length === 0 ? (
          <div
            className="mt-8 text-center font-mono text-xs"
            style={{ color: "hsl(210, 15%, 40%)" }}
          >
            No source code available
          </div>
        ) : (
          fns.map((fn) => (
            <div key={fn.id} className="space-y-1.5">
              {/* Method divider — name then a hairline to the panel edge */}
              <div className="flex items-center gap-2">
                <span className="shrink-0 font-mono text-[11px] font-semibold text-[hsl(210,20%,60%)]">
                  {fn.name}
                </span>
                <span
                  className="h-px flex-1"
                  style={{ background: "hsl(210, 15%, 18%)" }}
                />
              </div>
              {fn.body ? (
                <CodeBlock code={fn.body} lang={lang} />
              ) : (
                <div className="font-mono text-[10px] italic text-[hsl(210,15%,35%)]">
                  no body available
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
