import Tour from "@/components/tour/Tour";
import { useTour } from "@/components/tour/tour-store";
import { useAnalysis } from "@/store/use-analysis-store";
import { useUIStore } from "@/store/use-ui-store";
import {
  ArrowLeft,
  HelpCircle,
  Map as MapIcon,
  PanelLeftClose,
  PanelLeftOpen,
  Route,
  ScrollText,
  ShieldAlert,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Navigate, NavLink, Outlet } from "react-router-dom";
import { RouteErrorBoundary } from "@/components/layout/RouteErrorBoundary";

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

/** After 12s of "loading report…" offer a reload — a wedged boot (republish
 *  race, slow parse, swallowed error) must never strand the user on a dark
 *  screen with no way out but guessing at a manual reload. */
const ShellLoadWatchdog = () => {
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setStuck(true), 12_000);
    return () => window.clearTimeout(t);
  }, []);
  if (!stuck) return null;
  return (
    <button
      type="button"
      onClick={() => window.location.reload()}
      className="rounded border px-3 py-1.5 text-[11px]"
      style={{
        borderColor: "var(--bpmn-border)",
        color: "var(--bpmn-text)",
      }}
    >
      Taking too long — reload report
    </button>
  );
};

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
        className="flex h-screen w-screen flex-col items-center justify-center gap-3 text-[12px]"
        style={{
          background: "var(--bpmn-bg)",
          color: "var(--bpmn-text-muted)",
          fontFamily: "var(--bpmn-font-mono)",
        }}
      >
        <span>loading report…</span>
        <ShellLoadWatchdog />
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <SessionRail />
      <main className="h-full min-w-0 flex-1">
        <RouteErrorBoundary>
          <Outlet />
        </RouteErrorBoundary>
      </main>
      {/* Guided onboarding — overlays the whole shell; renders nothing when
          inactive. Mounted here so it lives inside the Router with data. */}
      <Tour />
    </div>
  );
};

const SessionRail = () => {
  const transformedData = useAnalysis((s) => s.transformedData);
  const collapsed = useUIStore((s) => s.railCollapsed);
  const toggleRail = useUIStore((s) => s.toggleRail);

  const title = transformedData?.prOverlay?.title ?? "Underscore report";
  const journeyCount = transformedData?.chapters.length ?? 0;
  const specCount = transformedData?.specs?.specs.length ?? 0;
  const hasSpecs = transformedData?.specs != null;
  // OPEN findings only — resolved ones are ledger history (struck on the
  // page), not something the rail should keep shouting about.
  const findingItems = (transformedData?.findings?.items ?? []).filter(
    (f) => f.status !== "resolved"
  );
  const hasFindings = transformedData?.findings != null;
  // Badge color mirrors the worst severity present — rose demands a look,
  // amber suggests one, dim means the audit ran and found nothing loud.
  const findingsBadgeColor = findingItems.some((f) => f.severity === "high")
    ? "var(--bpmn-rose)"
    : findingItems.length > 0
      ? "var(--bpmn-amber)"
      : "var(--bpmn-text-dim)";
  const indexHref = sessionsIndexHref();

  return (
    <aside
      className="rail-collapse-anim win-drag flex h-full shrink-0 flex-col border-r"
      style={{
        width: collapsed ? 56 : 232,
        background: "var(--bpmn-surface-soft)",
        // Stronger border + a soft drop shadow give the rail a physical edge
        // so the dark rail doesn't bleed into the dark canvas / BPMN beside it.
        // The divider must survive the DARKEST neighbour (the chapter
        // page's near-black BPMN plate) — the border tokens vanish against
        // it at 1px, so the rule is drawn in mist at fixed alpha.
        borderColor: "rgba(126, 136, 163, 0.34)",
        boxShadow: "2px 0 12px hsla(220, 22%, 4%, 0.45)",
      }}
    >
      {/* Rail header — collapse toggle pinned to the TOP (standard sidebar
          convention), sitting with the back-to-sessions link. */}
      {collapsed ? (
        <div className="flex flex-col items-center gap-1 px-1.5 pt-2.5">
          <CollapseToggle collapsed onToggle={toggleRail} />
          {indexHref && (
            <a
              href={indexHref}
              title="All sessions"
              className="rail-nav-item flex min-h-9 w-full items-center justify-center rounded-md"
              style={{
                fontFamily: "var(--bpmn-font-mono)",
                color: "var(--bpmn-text-muted)",
              }}
            >
              <ArrowLeft className="h-3.5 w-3.5 shrink-0" />
            </a>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-1 px-2 pt-2.5">
          {/* Back to the hosted sessions index — a plain <a> because the index
              is a different document, not a route of this report. Hidden for
              file:// artifacts, which have nothing above them. */}
          {indexHref ? (
            <a
              href={indexHref}
              title="All sessions"
              className="rail-nav-item flex min-h-9 flex-1 items-center gap-2 rounded-md px-3 text-[12px]"
              style={{
                fontFamily: "var(--bpmn-font-mono)",
                color: "var(--bpmn-text-muted)",
              }}
            >
              <ArrowLeft className="h-3.5 w-3.5 shrink-0" />
              <span>All sessions</span>
            </a>
          ) : (
            <div className="flex-1" />
          )}
          <CollapseToggle collapsed={false} onToggle={toggleRail} />
        </div>
      )}

      {/* Session identity — static in report mode (one report per build).
          Hidden when collapsed: the 56px icon rail has no room for a
          two-line title. */}
      {!collapsed && (
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
      )}

      {/* Nav — the session's views */}
      <nav
        className={`mt-3 flex flex-col gap-0.5 border-t pt-3 ${
          collapsed ? "px-1.5" : "px-2"
        }`}
        style={{ borderColor: "var(--bpmn-border-soft)" }}
        aria-label="Session views"
        data-tour="rail-nav"
      >
        <RailNavItem to="/canvas" icon={MapIcon} label="Canvas" collapsed={collapsed} />
        <RailNavItem
          to="/journeys"
          icon={Route}
          label="Journeys"
          badge={journeyCount > 0 ? String(journeyCount) : null}
          badgeColor="var(--bpmn-text-dim)"
          collapsed={collapsed}
        />
        {hasSpecs && (
          <RailNavItem
            to="/specs"
            icon={ScrollText}
            label="Specs"
            badge={specCount > 0 ? String(specCount) : null}
            badgeColor="var(--bpmn-text-dim)"
            collapsed={collapsed}
          />
        )}
        {hasFindings && (
          <RailNavItem
            to="/findings"
            icon={ShieldAlert}
            label="Findings"
            badge={findingItems.length > 0 ? String(findingItems.length) : null}
            badgeColor={findingsBadgeColor}
            collapsed={collapsed}
          />
        )}
      </nav>

      {/* Tour — pinned to the rail's bottom, always available so anyone can
          re-take the orientation at any time. */}
      <div
        className={`mt-auto border-t pb-2 pt-2 ${collapsed ? "px-1.5" : "px-2"}`}
        style={{ borderColor: "var(--bpmn-border-soft)" }}
      >
        <TourButton collapsed={collapsed} />
      </div>
    </aside>
  );
};

/** Relaunches the guided tour from step 1. */
const TourButton = ({ collapsed }: { collapsed: boolean }) => {
  const startTour = useTour((s) => s.start);
  return (
    <button
      type="button"
      onClick={startTour}
      title={collapsed ? "Tour" : undefined}
      className={`rail-nav-item flex min-h-10 w-full cursor-pointer items-center rounded-md ${
        collapsed ? "justify-center px-0" : "gap-2.5 px-3 text-[12.5px]"
      }`}
      style={{
        fontFamily: "var(--bpmn-font-mono)",
        color: "var(--bpmn-text-muted)",
      }}
    >
      <HelpCircle className="h-4 w-4 shrink-0" />
      {!collapsed && <span>Tour</span>}
    </button>
  );
};

/** Collapse / expand control. Lives at the top of the rail header. Expanded →
 *  a compact icon button aligned to the header's right; collapsed → the same
 *  icon centred in the 56px rail. */
const CollapseToggle = ({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) => (
  <button
    onClick={onToggle}
    title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
    aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
    aria-expanded={!collapsed}
    className="rail-nav-item flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md"
    style={{ fontFamily: "var(--bpmn-font-mono)" }}
  >
    {collapsed ? (
      <PanelLeftOpen className="h-4 w-4 shrink-0" />
    ) : (
      <PanelLeftClose className="h-4 w-4 shrink-0" />
    )}
  </button>
);

interface RailNavItemProps {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  badge?: string | null;
  badgeColor?: string;
  collapsed?: boolean;
}

/** One rail entry. NavLink handles active matching (prefix match means
 *  /journeys stays lit on /journeys/:slug) and aria-current="page".
 *  Collapsed → a centred icon with the count stacked beneath it (icons +
 *  counts only); the tooltip carries the label. */
const RailNavItem = ({
  to,
  icon: Icon,
  label,
  badge,
  badgeColor,
  collapsed,
}: RailNavItemProps) => (
  <NavLink
    to={to}
    title={collapsed ? (badge ? `${label} (${badge})` : label) : undefined}
    className={({ isActive }) =>
      `rail-nav-item flex min-h-11 cursor-pointer items-center rounded-md focus-visible:ring-2 focus-visible:ring-[var(--bpmn-cyan)] focus-visible:outline-none ${
        collapsed
          ? "flex-col justify-center gap-0.5 px-0"
          : "gap-2.5 px-3 text-[12.5px]"
      } ${isActive ? "rail-nav-active" : ""}`
    }
    style={{ fontFamily: "var(--bpmn-font-mono)" }}
  >
    <Icon className="h-4 w-4 shrink-0" />
    {collapsed ? (
      badge && (
        <span className="text-[9px] tabular-nums" style={{ color: badgeColor }}>
          {badge}
        </span>
      )
    ) : (
      <>
        <span>{label}</span>
        {badge && (
          <span
            className="ml-auto text-[10.5px] tabular-nums"
            style={{ color: badgeColor }}
          >
            {badge}
          </span>
        )}
      </>
    )}
  </NavLink>
);

export default SessionShell;
