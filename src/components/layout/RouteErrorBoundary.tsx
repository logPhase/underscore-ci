import React from "react";
import { useLocation } from "react-router-dom";

/** Route-level error boundary around the SessionShell outlet: a crash in ONE
 * page can never blank the whole app again (the Specs "modified"-op crash
 * unmounted the entire tree). The rail stays alive — navigating to another
 * tab RESETS the boundary via the location key. Token-native, no deps. */
class Boundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    // Console is the only telemetry a static report has.
    console.error("[route-error-boundary]", error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const message = this.state.error.message || String(this.state.error);
    return (
      <div
        className="flex h-full w-full flex-col items-center justify-center gap-3 px-8 text-center"
        style={{ background: "var(--page-bg)" }}
      >
        <p
          className="font-mono text-[11px] tracking-[0.26em] uppercase"
          style={{ color: "var(--bpmn-rose)" }}
        >
          Something broke
        </p>
        <p
          className="max-w-lg text-[14px]"
          style={{ fontFamily: "var(--reading-font)", color: "var(--bpmn-text)" }}
        >
          This view hit an error it couldn't recover from.
        </p>
        <pre
          className="max-w-xl overflow-x-auto rounded-md border px-3 py-2 text-left font-mono text-[10.5px] whitespace-pre-wrap"
          style={{
            borderColor: "var(--bpmn-border-soft)",
            background: "var(--bpmn-bg-deep)",
            color: "var(--bpmn-text-muted)",
          }}
        >
          {message}
        </pre>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="cursor-pointer rounded-md border px-3 py-1.5 font-mono text-[11px]"
            style={{
              borderColor: "var(--bpmn-cyan)",
              color: "var(--bpmn-cyan)",
            }}
          >
            Reload report
          </button>
          <span
            className="font-mono text-[10.5px]"
            style={{ color: "var(--bpmn-text-dim)" }}
          >
            other tabs in the rail keep working
          </span>
        </div>
      </div>
    );
  }
}

/** Keyed by route so leaving the crashed page clears the error state. */
export function RouteErrorBoundary({
  children,
}: {
  children: React.ReactNode;
}) {
  const location = useLocation();
  return <Boundary key={location.pathname}>{children}</Boundary>;
}
