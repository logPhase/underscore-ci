import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAnalysis } from "@/store/use-analysis-store";

/** How long the loader may sit in "loading" before it stops pretending —
 *  a wedged load (huge payload on a slow machine, a republish race, a
 *  swallowed parse error) must surface a visible way out, never an
 *  indefinite near-black screen the user can only escape by reloading. */
const STUCK_MS = 12_000;

/** Report entry route ('/'): loads the static pr-output.json once, then hands
 *  off to the journeys page. Idempotent — if the report is already loaded
 *  (history Back onto '#/', or the SessionShell error guard) it bounces
 *  straight back out with a replace, so this route never lingers in history
 *  and never re-boots a loaded report. */
export default function ReportLoader() {
  const status = useAnalysis((s) => s.status);
  const error = useAnalysis((s) => s.error);
  const loadReport = useAnalysis((s) => s.loadReport);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    if (status === "idle") void loadReport();
  }, [status, loadReport]);

  // Loading watchdog — see STUCK_MS.
  useEffect(() => {
    if (status !== "loading") {
      setStuck(false);
      return;
    }
    const t = window.setTimeout(() => setStuck(true), STUCK_MS);
    return () => window.clearTimeout(t);
  }, [status]);

  if (status === "complete") return <Navigate to="/journeys" replace />;

  const failed = status === "error" || stuck;
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background">
      {failed ? (
        <div className="max-w-md space-y-3 text-center">
          <p className="text-sm font-medium text-foreground">
            {status === "error"
              ? "Could not load the analysis report"
              : "Loading is taking longer than it should"}
          </p>
          <p className="text-xs text-muted-foreground">
            {status === "error"
              ? (error ?? "pr-output.json is missing or unreadable.")
              : "The report may have been republished while this tab was open."}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded border border-border px-3 py-1.5 font-mono text-xs text-foreground hover:bg-muted"
          >
            Reload report
          </button>
        </div>
      ) : (
        <p className="font-mono text-sm text-muted-foreground">
          Loading analysis…
        </p>
      )}
    </div>
  );
}
