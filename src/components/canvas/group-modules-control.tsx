import { cn } from "@/lib/misc-utils";
import { useAnalysis } from "@/store/use-analysis-store";
import { useUIStore } from "@/store/use-ui-store";
import { Button } from "../ui/button";

/**
 * "✦ Groups" canvas chip — the show/hide toggle for the agent-derived
 * module grouping (group-regions.tsx). Grouping is the overview-first
 * reading (#23), so the hulls default VISIBLE.
 *
 * Static report: the run's grouping is baked into the payload and the
 * transform positions it deterministically. Unlike the desktop chip this
 * one CANNOT generate a grouping (no analyzer, no network) — it is a pure
 * local render toggle. Hidden entirely when the run has no grouping
 * (serviceGroups null/empty) — the plain ungrouped canvas is the honest
 * fallback, never a mocked one.
 */
export function GroupModulesControl() {
  const serviceGroups = useAnalysis((s) => s.transformedData?.serviceGroups);
  const groupingVisible = useUIStore((s) => s.groupingVisible);
  const setGroupingVisible = useUIStore((s) => s.setGroupingVisible);
  const hasPrOverlay = useAnalysis((s) => !!s.transformedData?.prData);

  const hasGroups = !!serviceGroups && serviceGroups.length > 0;
  if (!hasGroups) return null;

  return (
    <Button
      onClick={() => setGroupingVisible(!groupingVisible)}
      variant="ghost"
      title={
        groupingVisible
          ? "Hide the agent's logical grouping"
          : "Show the agent's logical grouping"
      }
      className={cn(
        "absolute right-4 z-40 flex h-fit cursor-pointer items-center gap-2 rounded-lg px-3 py-2 font-mono text-xs",
        // Clear the PR banner the same way the stats pill does (top-4 + mt-15).
        hasPrOverlay ? "top-4 mt-15" : "top-4"
      )}
      style={{
        // Match the stats pill (codebase-stats.tsx) so the two canvas chips
        // read as one system; --primary is the app accent for the on state.
        background: "var(--cw-stats-bg)",
        backdropFilter: "blur(8px)",
        border: "1px solid var(--cw-stats-border)",
        color: groupingVisible ? "hsl(var(--primary))" : "var(--cw-text-muted)",
      }}
    >
      <span aria-hidden>✦</span>
      <span>Groups · {serviceGroups!.length}</span>
    </Button>
  );
}
