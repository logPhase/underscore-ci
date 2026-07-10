import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { Building2, ChevronLeft, ChevronRight, Footprints, GitPullRequest, RotateCcw, X } from "lucide-react";
import { useAnalysis } from "@/store/use-analysis-store";
import { buildCityModel } from "@/lib/city-data";
import type { CityBuilding } from "@/lib/city-layout";
import CityCanvas from "@/components/city/CityCanvas";

/**
 * CityPage — the Code City tab. Files become buildings, module groups become
 * district islands, journeys become routes you walk through the city. On a PR
 * report it opens in PR mode — only the files the PR touched, on their district
 * platforms — so a 600-file repo reads as a handful of buildings, not a wall of
 * blocks. Toggle to "Full city" to see everything and walk journeys.
 *
 * Domain model precomputed in city-data/city-layout; this page is chrome +
 * interaction state only. Permanent dark island so the 3D look holds under the
 * report's paper theme.
 */
const CityPage = () => {
  const transformed = useAnalysis((s) => s.transformedData);
  const model = useMemo(() => buildCityModel(transformed), [transformed]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [activeRouteId, setActiveRouteId] = useState<string | null>(null);
  const [routeStep, setRouteStep] = useState<number>(-1);
  // Default to PR focus when the report is a PR with changes.
  const [prMode, setPrMode] = useState<boolean>(() => (model?.pr?.count ?? 0) > 0);

  const activeRoute = useMemo(
    () => model?.routes.find((r) => r.id === activeRouteId) ?? null,
    [model, activeRouteId]
  );

  const clearRoute = useCallback(() => {
    setActiveRouteId(null);
    setRouteStep(-1);
    setSelectedId(null);
  }, []);

  const pickRoute = useCallback((id: string) => {
    setActiveRouteId(id);
    setRouteStep(-1);
    setSelectedId(null);
  }, []);

  const step = useCallback(
    (dir: 1 | -1) => {
      if (!activeRoute) return;
      setRouteStep((s) => {
        const n = Math.max(0, Math.min(activeRoute.buildingIds.length - 1, (s < 0 ? -1 : s) + dir));
        setSelectedId(activeRoute.buildingIds[n]);
        return n;
      });
    },
    [activeRoute]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") clearRoute();
      else if (activeRoute && (e.key === "ArrowRight" || e.key === "ArrowDown")) { e.preventDefault(); step(1); }
      else if (activeRoute && (e.key === "ArrowLeft" || e.key === "ArrowUp")) { e.preventDefault(); step(-1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeRoute, step, clearRoute]);

  if (!model) return <Navigate to="/journeys" replace />;

  const pr = model.pr;
  const selected = selectedId ? model.buildingById.get(selectedId) : undefined;
  // On a PR report, only the journeys the PR actually touches — overlaid, the
  // way the canvas surfaces affected journeys.
  const journeys = pr ? model.routes.filter((r) => r.affected) : model.routes;
  const showJourneys = !prMode && journeys.length > 0;

  return (
    <section className="theme-dark-island relative flex h-full w-full flex-col overflow-hidden" style={{ background: "#0f0f23" }}>
      <header className="z-10 flex shrink-0 items-center gap-3 border-b px-5 py-3" style={{ borderColor: "var(--bpmn-border-soft)", background: "hsla(230,25%,7%,0.6)", backdropFilter: "blur(8px)" }}>
        <Building2 className="h-4 w-4 shrink-0" style={{ color: "var(--bpmn-text-dim)" }} />
        <h1 className="text-[14px] font-semibold whitespace-nowrap" style={{ fontFamily: "var(--bpmn-font-display)", color: "var(--bpmn-text)" }}>
          Code City
        </h1>
        <span className="hidden font-mono text-[11px] md:inline" style={{ color: "var(--bpmn-text-dim)" }}>
          {prMode && pr ? `${pr.count} changed files` : `${model.stats.districts} districts · ${model.stats.buildings} buildings`}
        </span>

        {pr && (
          <div className="ml-3 flex items-center overflow-hidden rounded-md border" style={{ borderColor: "var(--bpmn-border-em)" }}>
            <ModeBtn active={prMode} onClick={() => setPrMode(true)} icon={<GitPullRequest className="h-3 w-3" />}>PR changes</ModeBtn>
            <ModeBtn active={!prMode} onClick={() => { setPrMode(false); }} icon={<Building2 className="h-3 w-3" />}>Full city</ModeBtn>
          </div>
        )}

        <span className="ml-auto" />
        <Legend />
      </header>

      <div className="relative min-h-0 flex-1">
        <CityCanvas
          model={model}
          selectedId={selectedId}
          hoveredId={hoveredId}
          activeRoute={activeRoute}
          routeStep={routeStep}
          prMode={prMode}
          onSelect={setSelectedId}
          onHover={setHoveredId}
        />

        {/* PR changes panel */}
        {prMode && pr && (
          <PRPanel
            pr={pr}
            model={model}
            selectedId={selectedId}
            onPick={setSelectedId}
            journeys={journeys}
            activeRouteId={activeRouteId}
            onPickRoute={(id) => (id === activeRouteId ? clearRoute() : pickRoute(id))}
          />
        )}

        {/* Journeys panel (full city) */}
        {showJourneys && (
          <div className="absolute top-3 left-3 z-10 flex max-h-[calc(100%-1.5rem)] w-64 flex-col overflow-hidden rounded-lg border glass-panel">
            <div className="flex items-center gap-2 border-b px-3 py-2" style={{ borderColor: "var(--bpmn-border-soft)" }}>
              <Footprints className="h-3.5 w-3.5" style={{ color: "var(--bpmn-cyan)" }} />
              <span className="font-mono text-[10px] tracking-wider uppercase" style={{ color: "var(--bpmn-text-muted)" }}>Walk a journey</span>
              {activeRoute && (
                <button type="button" onClick={clearRoute} className="ml-auto" title="Clear route (Esc)"><X className="h-3.5 w-3.5" style={{ color: "var(--bpmn-text-dim)" }} /></button>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto py-1">
              {journeys.map((r) => {
                const on = r.id === activeRouteId;
                return (
                  <button key={r.id} type="button" onClick={() => (on ? clearRoute() : pickRoute(r.id))} className="flex w-full items-start gap-2 px-3 py-1.5 text-left transition-colors" style={{ background: on ? "hsla(45,90%,55%,0.10)" : "transparent" }}>
                    <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: on ? "#f59e0b" : "var(--bpmn-border-em)" }} />
                    <span className="min-w-0">
                      <span className="block truncate text-[12px]" style={{ color: on ? "var(--bpmn-text)" : "var(--bpmn-text-muted)", fontFamily: "var(--reading-font)" }}>{r.title}</span>
                      <span className="font-mono text-[9.5px]" style={{ color: "var(--bpmn-text-dim)" }}>{r.buildingIds.length} stops{r.handlerType ? ` · ${r.handlerType}` : ""}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Route stepper HUD */}
        {activeRoute && (
          <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 rounded-full border px-2 py-1.5 glass-panel">
            <button type="button" onClick={() => step(-1)} className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-[var(--bpmn-surface-hi)]" title="Previous stop (←)"><ChevronLeft className="h-4 w-4" style={{ color: "var(--bpmn-text-muted)" }} /></button>
            <span className="min-w-[7rem] text-center font-mono text-[11px]" style={{ color: "var(--bpmn-text-muted)" }}>{routeStep < 0 ? "full route" : `stop ${routeStep + 1} / ${activeRoute.buildingIds.length}`}</span>
            <button type="button" onClick={() => step(1)} className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-[var(--bpmn-surface-hi)]" title="Next stop (→)"><ChevronRight className="h-4 w-4" style={{ color: "var(--bpmn-text-muted)" }} /></button>
          </div>
        )}

        {/* Selected building chip */}
        {selected && (
          <div className="absolute top-3 right-3 z-10 flex items-center gap-2 rounded-lg border px-3 py-2 glass-panel">
            <div>
              <div className="text-[12px] font-semibold" style={{ color: "var(--bpmn-text)", fontFamily: "var(--bpmn-font-mono)" }}>{selected.name}</div>
              <div className="font-mono text-[9.5px]" style={{ color: "var(--bpmn-text-dim)" }}>{selected.lines} LOC · {selected.role}{selected.prStatus ? ` · ${selected.prStatus}` : ""}</div>
            </div>
            <button type="button" onClick={() => setSelectedId(null)} title="Deselect"><X className="h-3.5 w-3.5" style={{ color: "var(--bpmn-text-dim)" }} /></button>
          </div>
        )}

        {/* Reset */}
        <button type="button" onClick={clearRoute} className="absolute right-3 bottom-4 z-10 flex h-8 w-8 items-center justify-center rounded-md border glass-panel hover:bg-[var(--bpmn-surface-hi)]" title="Reset view"><RotateCcw className="h-3.5 w-3.5" style={{ color: "var(--bpmn-text-muted)" }} /></button>
      </div>
    </section>
  );
};

const ModeBtn = ({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) => (
  <button type="button" onClick={onClick} className="flex items-center gap-1.5 px-2.5 py-1 font-mono text-[10px] tracking-wide transition-colors" style={{ background: active ? "var(--bpmn-surface-hi)" : "transparent", color: active ? "var(--bpmn-text)" : "var(--bpmn-text-dim)" }}>
    {icon}{children}
  </button>
);

// ─── PR changes panel — files grouped by change type, sorted by lines ────────
const STATUS_ORDER: { key: CityBuilding["prStatus"]; label: string; color: string }[] = [
  { key: "modified", label: "Modified", color: "#f59e0b" },
  { key: "added", label: "Added", color: "#4ade80" },
  { key: "deleted", label: "Deleted", color: "#ef4444" },
];
const PRPanel = ({ pr, model, selectedId, onPick, journeys, activeRouteId, onPickRoute }: {
  pr: NonNullable<ReturnType<typeof buildCityModel>>["pr"];
  model: NonNullable<ReturnType<typeof buildCityModel>>;
  selectedId: string | null;
  onPick: (id: string) => void;
  journeys: import("@/lib/city-data").CityRoute[];
  activeRouteId: string | null;
  onPickRoute: (id: string) => void;
}) => {
  if (!pr) return null;
  const groups = STATUS_ORDER.map((g) => ({
    ...g,
    files: model.layout.buildings.filter((b) => b.prStatus === g.key).sort((a, b) => b.lines - a.lines),
  })).filter((g) => g.files.length > 0);

  return (
    <div className="absolute top-3 left-3 z-10 flex max-h-[calc(100%-1.5rem)] w-72 flex-col overflow-hidden rounded-lg border glass-panel">
      <div className="border-b px-3 py-2.5" style={{ borderColor: "var(--bpmn-border-soft)" }}>
        <div className="flex items-center gap-2">
          <GitPullRequest className="h-3.5 w-3.5" style={{ color: "#f59e0b" }} />
          <span className="truncate text-[12px] font-semibold" style={{ color: "var(--bpmn-text)", fontFamily: "var(--reading-font)" }}>{pr.title}</span>
        </div>
        <div className="mt-1 font-mono text-[9.5px]" style={{ color: "var(--bpmn-text-dim)" }}>{pr.count} files touched · click to fly there</div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {groups.map((g) => (
          <div key={g.key} className="py-0.5">
            <div className="px-3 py-1 font-mono text-[9px] tracking-wider uppercase" style={{ color: "var(--bpmn-text-dim)" }}>{g.label} · {g.files.length}</div>
            {g.files.map((b) => {
              const on = b.id === selectedId;
              return (
                <button key={b.id} type="button" onClick={() => onPick(b.id)} className="flex w-full items-center gap-2 px-3 py-1 text-left transition-colors" style={{ background: on ? "hsla(45,90%,55%,0.10)" : "transparent" }}>
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: g.color }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-[11.5px]" style={{ color: on ? "var(--bpmn-text)" : "var(--bpmn-text-muted)" }}>{b.name}</span>
                  </span>
                  <span className="font-mono text-[9px]" style={{ color: "var(--bpmn-text-dim)" }}>{b.lines}</span>
                </button>
              );
            })}
          </div>
        ))}

        {/* Affected journeys — overlay one to watch it thread the PR */}
        {journeys.length > 0 && (
          <div className="mt-1 border-t py-1" style={{ borderColor: "var(--bpmn-border-soft)" }}>
            <div className="flex items-center gap-1.5 px-3 py-1">
              <Footprints className="h-3 w-3" style={{ color: "var(--bpmn-cyan)" }} />
              <span className="font-mono text-[9px] tracking-wider uppercase" style={{ color: "var(--bpmn-text-dim)" }}>Affected journeys · {journeys.length}</span>
            </div>
            {journeys.map((r) => {
              const on = r.id === activeRouteId;
              return (
                <button key={r.id} type="button" onClick={() => onPickRoute(r.id)} className="flex w-full items-start gap-2 px-3 py-1 text-left transition-colors" style={{ background: on ? "hsla(45,90%,55%,0.10)" : "transparent" }}>
                  <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: on ? "#f59e0b" : "var(--bpmn-border-em)" }} />
                  <span className="min-w-0">
                    <span className="block truncate text-[11.5px]" style={{ color: on ? "var(--bpmn-text)" : "var(--bpmn-text-muted)", fontFamily: "var(--reading-font)" }}>{r.title}</span>
                    <span className="font-mono text-[9px]" style={{ color: "var(--bpmn-text-dim)" }}>{r.buildingIds.length} stops</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

const ROLE_LEGEND: [string, string][] = [
  ["controller", "#e87461"],
  ["service", "#4a9ead"],
  ["model", "#7c5cbf"],
  ["infra", "#e879a0"],
];
const Legend = () => (
  <div className="hidden items-center gap-3 lg:flex">
    {ROLE_LEGEND.map(([label, color]) => (
      <span key={label} className="flex items-center gap-1 font-mono text-[9.5px] tracking-wider uppercase" style={{ color: "var(--bpmn-text-dim)" }}>
        <span className="h-2 w-2 rounded-sm" style={{ background: color }} />
        {label}
      </span>
    ))}
  </div>
);

export default CityPage;
