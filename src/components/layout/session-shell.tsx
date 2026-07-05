import { useAnalysis } from "@/store/use-analysis-store";
import { ArrowLeft, Map as MapIcon, Route, ScrollText } from "lucide-react";
import { useEffect } from "react";
import { Navigate, NavLink, Outlet } from "react-router-dom";

/** URL of the hosted sessions index, derived from where THIS report is
 *  served: reports live at <index>/reports/<dir>/underscore-report.html (or
 *  <index>/latest/…), so the index is everything before that segment. A
 *  file:// artifact or an unrecognized path has no index — return null and
 *  the back link stays hidden. */
function sessionsIndexHref(): string | null {
  if (!/^https?:$/.test(window.location.protocol)) return null;
  const m = window.location.pathname.match(/^(.*\/)(reports|latest)\/[^/]*/);
  return m ? m[1] : null;
}

/**
 * SessionShell — layout route for the report workspace. A persistent
 * ~232px left rail (static session identity + Canvas/Journeys nav) with
 * the data pages rendering unchanged in the content area via <Outlet/>.
 * Token-driven throughout so dark + paper both work; the canvas page
 * inside stays a dark island on its own.
 *
 * Guard is centralized here: without a loaded report there is no session,
 * so every child route redirects to the loader.
 */

export const SessionShell = () => {
  const transformedData = useAnalysis((s) => s.transformedData);
  const status = useAnalysis((s) => s.status);
  const loadReport = useAnalysis((s) => s.loadReport);

  // Deep links (#/canvas, #/specs, #/journeys/<slug>) land here BEFORE any
  // report is loaded — self-load instead of bouncing to the loader route,
  // so the requested view survives the boot. Only a failed load falls back
  // to the loader (which owns the error state).
  useEffect(() => {
    if (!transformedData && status === "idle") void loadReport();
  }, [transformedData, status, loadReport]);

  if (!transformedData) {
    if (status === "error") return <Navigate to="/" replace />;
    return (
      <div
        className="flex h-screen w-screen items-center justify-center text-[12px]"
        style={{
          background: "var(--bpmn-bg)",
          color: "var(--bpmn-text-muted)",
          fontFamily: "var(--bpmn-font-mono)",
        }}
      >
        loading report…
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <SessionRail />
      <main className="h-full min-w-0 flex-1">
        <Outlet />
      </main>
    </div>
  );
};

const SessionRail = () => {
  const transformedData = useAnalysis((s) => s.transformedData);

  const title = transformedData?.prOverlay?.title ?? "Underscore report";
  const journeyCount = transformedData?.chapters.length ?? 0;
  const specCount = transformedData?.specs?.specs.length ?? 0;
  const hasSpecs = transformedData?.specs != null;
  const indexHref = sessionsIndexHref();

  return (
    <aside
      className="win-drag flex h-full w-[232px] shrink-0 flex-col border-r"
      style={{
        background: "var(--bpmn-surface-soft)",
        borderColor: "var(--bpmn-border-soft)",
      }}
    >
      {/* Back to the hosted sessions index — a plain <a> because the index
          is a different document, not a route of this report. Hidden for
          file:// artifacts, which have nothing above them. */}
      {indexHref && (
        <a
          href={indexHref}
          className="rail-nav-item mx-2 mt-2.5 flex min-h-9 items-center gap-2 rounded-md px-3 text-[12px]"
          style={{
            fontFamily: "var(--bpmn-font-mono)",
            color: "var(--bpmn-text-muted)",
          }}
        >
          <ArrowLeft className="h-3.5 w-3.5 shrink-0" />
          <span>All sessions</span>
        </a>
      )}

      {/* Session identity — static in report mode (one report per build) */}
      <div className="mx-2 mt-1 flex items-start gap-2 rounded-md px-2 py-2.5">
        <span className="min-w-0 flex-1">
          <span
            className="line-clamp-2 text-[13px]"
            style={{
              fontFamily: "var(--reading-font)",
              color: "var(--bpmn-text)",
              fontWeight: 600,
              lineHeight: 1.35,
            }}
          >
            {title}
          </span>
        </span>
      </div>

      {/* Nav — the session's views */}
      <nav
        className="mt-3 flex flex-col gap-0.5 border-t px-2 pt-3"
        style={{ borderColor: "var(--bpmn-border-soft)" }}
        aria-label="Session views"
      >
        <RailNavItem to="/canvas" icon={MapIcon} label="Canvas" />
        <RailNavItem
          to="/journeys"
          icon={Route}
          label="Journeys"
          badge={journeyCount > 0 ? String(journeyCount) : null}
          badgeColor="var(--bpmn-text-dim)"
        />
        {hasSpecs && (
          <RailNavItem
            to="/specs"
            icon={ScrollText}
            label="Specs"
            badge={specCount > 0 ? String(specCount) : null}
            badgeColor="var(--bpmn-text-dim)"
          />
        )}
      </nav>
    </aside>
  );
};

interface RailNavItemProps {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  badge?: string | null;
  badgeColor?: string;
}

/** One rail entry. NavLink handles active matching (prefix match means
 *  /journeys stays lit on /journeys/:slug) and aria-current="page". */
const RailNavItem = ({
  to,
  icon: Icon,
  label,
  badge,
  badgeColor,
}: RailNavItemProps) => (
  <NavLink
    to={to}
    className={({ isActive }) =>
      `rail-nav-item flex min-h-11 cursor-pointer items-center gap-2.5 rounded-md px-3 text-[12.5px] focus-visible:ring-2 focus-visible:ring-[var(--bpmn-cyan)] focus-visible:outline-none ${
        isActive ? "rail-nav-active" : ""
      }`
    }
    style={{ fontFamily: "var(--bpmn-font-mono)" }}
  >
    <Icon className="h-4 w-4 shrink-0" />
    <span>{label}</span>
    {badge && (
      <span
        className="ml-auto text-[10.5px] tabular-nums"
        style={{ color: badgeColor }}
      >
        {badge}
      </span>
    )}
  </NavLink>
);

export default SessionShell;
