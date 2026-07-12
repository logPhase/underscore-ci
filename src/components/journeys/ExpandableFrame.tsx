import { cn } from "@/lib/misc-utils";
import { Maximize2, Minimize2 } from "lucide-react";
import type { ReactNode, Ref } from "react";

/**
 * A framed, browsable window with a header strip and an expand-to-fill-screen
 * affordance — the shared chrome behind both the business-flow frame and the
 * inline call graph on the journey page.
 *
 * Collapsed: a bordered card sitting in the page flow at a fixed height.
 * Expanded: a fixed-inset overlay with a dimmed backdrop; click-out toggles
 * it closed (Esc is wired up by the caller's keydown handler).
 *
 * The caller owns the `expanded` state and the body; this component owns the
 * overlay, the section shell, the toggle button, and the body's sizing.
 */
export type ExpandableFrameProps = {
  expanded: boolean;
  onToggle: () => void;
  /** Noun for the toggle's title/aria text, e.g. "flow" or "call graph". */
  label: string;
  /** Section background token (both states). */
  background: string;
  /** Left-aligned header content, before the flex spacer. */
  header: ReactNode;
  /** Right-aligned header actions, after the spacer and before the toggle. */
  actions?: ReactNode;
  /** Extra classes on the collapsed section (e.g. `mt-6` layout margins). */
  collapsedClassName?: string;
  /** Forwarded to the <section> — used to swallow wheel while expanded. */
  sectionRef?: Ref<HTMLElement>;
  children: ReactNode;
};

export function ExpandableFrame({
  expanded,
  onToggle,
  label,
  background,
  header,
  actions,
  collapsedClassName,
  sectionRef,
  children,
}: ExpandableFrameProps) {
  return (
    <>
      {/* Dim the page while expanded — the overlay reads as the frame grown,
          floating above. Click outside collapses (Esc too, via the caller). */}
      {expanded && (
        <div
          aria-hidden
          className="fixed inset-0 z-[55]"
          style={{
            background: "rgba(0, 0, 0, 0.5)",
            backdropFilter: "blur(2px)",
          }}
          onClick={onToggle}
        />
      )}
      <section
        ref={sectionRef}
        className={
          expanded
            ? "frame-overlay-enter fixed z-[60] flex flex-col overflow-hidden rounded-xl"
            : cn("overflow-hidden rounded-xl", collapsedClassName)
        }
        style={{
          border: "1px solid var(--bpmn-border-em)",
          background,
          boxShadow: expanded
            ? "0 24px 80px rgb(0 0 0 / 0.5)"
            : "0 1px 3px rgb(0 0 0 / 0.18), 0 18px 44px rgb(0 0 0 / 0.22)",
          ...(expanded ? { inset: 12 } : {}),
        }}
      >
        <div
          className="flex shrink-0 items-center gap-2.5 px-4 py-2.5"
          style={{
            borderBottom: "1px solid var(--bpmn-border-soft)",
            background: "var(--bpmn-bg-deep)",
          }}
        >
          {header}
          <span className="flex-1" />
          {actions}
          <button
            onClick={onToggle}
            title={
              expanded
                ? "Exit expanded view (Esc)"
                : `Expand the ${label} to fill the screen`
            }
            aria-label={expanded ? "Exit expanded view" : `Expand the ${label}`}
            className="shrink-0 rounded-md p-1.5 transition-colors"
            style={{ color: "var(--bpmn-text-dim)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--bpmn-text)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--bpmn-text-dim)";
            }}
          >
            {expanded ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
        {/* Generous fixed height in the page flow; the remaining overlay
            height when expanded. The body pans/scrolls INSIDE it either way. */}
        <div
          className={
            expanded ? "relative min-h-0 w-full flex-1" : "relative w-full"
          }
          style={expanded ? {} : { height: "70vh", minHeight: 480 }}
        >
          {children}
        </div>
      </section>
    </>
  );
}
