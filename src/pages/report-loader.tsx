import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAnalysis } from "@/store/use-analysis-store";

/** Report entry route ('/'): loads the static pr-output.json once, then hands
 *  off to the journeys page. Idempotent — if the report is already loaded
 *  (SessionShell guard redirects here), it immediately navigates back out. */
export default function ReportLoader() {
  const status = useAnalysis((s) => s.status);
  const error = useAnalysis((s) => s.error);
  const loadReport = useAnalysis((s) => s.loadReport);

  useEffect(() => {
    if (status === "idle") void loadReport();
  }, [status, loadReport]);

  if (status === "complete") return <Navigate to="/journeys" replace />;

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background">
      {status === "error" ? (
        <div className="max-w-md space-y-2 text-center">
          <p className="text-sm font-medium text-foreground">
            Could not load the analysis report
          </p>
          <p className="text-xs text-muted-foreground">
            {error ?? "pr-output.json is missing or unreadable."}
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Loading analysis…</p>
      )}
    </div>
  );
}
