import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAnalysis } from "@/store/use-analysis-store";
import RepoHub from "./repo-hub";
import RepoPortal from "./repo-portal";

/** How long boot may sit before offering a way out — a wedged load must never
 *  strand the user on a near-black screen. */
const STUCK_MS = 12_000;

/** Entry route ('/'): manifest-first boot. A served repo-manifest.json makes
 *  this a repository HUB (global architecture + specs + PR index); otherwise it
 *  is a single PR report and we hand off to the journeys page once loaded.
 *  Idempotent — bouncing back onto '/' with a report already loaded replaces
 *  straight back to /journeys, so this route never lingers in history. */
export default function EntryLoader() {
  const status = useAnalysis((s) => s.status);
  const error = useAnalysis((s) => s.error);
  const repoMode = useAnalysis((s) => s.repoMode);
  const portalMode = useAnalysis((s) => s.portalMode);
  const boot = useAnalysis((s) => s.boot);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    if (status === "idle") void boot();
  }, [status, boot]);

  useEffect(() => {
    if (status !== "loading") {
      setStuck(false);
      return;
    }
    const t = window.setTimeout(() => setStuck(true), STUCK_MS);
    return () => window.clearTimeout(t);
  }, [status]);

  if (repoMode) return <RepoHub />;
  if (portalMode) return <RepoPortal />;
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
            Reload
          </button>
        </div>
      ) : (
        <p className="font-mono text-sm text-muted-foreground">Loading…</p>
      )}
    </div>
  );
}
