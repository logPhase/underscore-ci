import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { Building2, ChevronLeft, ChevronRight, Footprints, RotateCcw, X } from "lucide-react";
import { useAnalysis } from "@/store/use-analysis-store";
import { buildCityModel } from "@/lib/city-data";
import CityCanvas from "@/components/city/CityCanvas";

/**
 * CityPage — the Code City tab. The report's files become a 3D city: module
 * groups are districts, files are buildings (taller = more lines), the entry
 * point of each district is a landmark spire. Picking a journey lights an
 * ordered route through the buildings and walks the camera stop to stop —
 * "watch the request travel through the city".
 *
 * The whole domain model (positions, colours, routes) is precomputed in
 * city-data/city-layout; this page is chrome + interaction state only. It is a
 * permanent dark island (`theme-dark-island`) so the 3D look holds even under
 * the report's paper/light theme.
 */
const CityPage = () => {
  const transformed = useAnalysis((s) => s.transformedData);
  const model = useMemo(() => buildCityModel(transformed), [transformed]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [activeRouteId, setActiveRouteId] = useState<string | null>(null);
  const [routeStep, setRouteStep] = useState<number>(-1);

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
    setRouteStep(-1); // show the whole route first, then step in
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

  // Keyboard: arrows walk the route, Escape clears.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") clearRoute();
      else if (activeRoute && (e.key === "ArrowRight" || e.key === "ArrowDown")) {
        e.preventDefault();
        step(1);
      } else if (activeRoute && (e.key === "ArrowLeft" || e.key === "ArrowUp")) {
        e.preventDefault();
        step(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeRoute, step, clearRoute]);

  // The rail hides this tab without file data, but guard deep links too.
  if (!model) return <Navigate to="/journeys" replace />;

  const selected = selectedId ? model.buildingById.get(selectedId) : undefined;

  return (
    <section className="theme-dark-island relative flex h-full w-full flex-col overflow-hidden" style={{ background: "#0b0e1a" }}>
      {/* Header */}
      <header className="z-10 flex shrink-0 items-center gap-3 border-b px-5 py-3" style={{ borderColor: "var(--bpmn-border-soft)", background: "hsla(228,30%,7%,0.6)", backdropFilter: "blur(8px)" }}>
        <Building2 className="h-4 w-4 shrink-0" style={{ color: "var(--bpmn-text-dim)" }} />
        <h1 className="text-[14px] font-semibold whitespace-nowrap" style={{ fontFamily: "var(--bpmn-font-display)", color: "var(--bpmn-text)" }}>
          Code City
        </h1>
        <span className="hidden font-mono text-[11px] md:inline" style={{ color: "var(--bpmn-text-dim)" }}>
          {model.stats.districts} districts · {model.stats.buildings} buildings · {model.stats.routes} journeys
        </span>
        <span className="ml-auto" />
        <Legend />
      </header>

      {/* The city fills everything below the header. */}
      <div className="relative min-h-0 flex-1">
        <CityCanvas
          model={model}
          selectedId={selectedId}
          hoveredId={hoveredId}
          activeRoute={activeRoute}
          routeStep={routeStep}
          onSelect={setSelectedId}
          onHover={setHoveredId}
        />

        {/* Journeys panel — pick one to route through the city. */}
        {model.routes.length > 0 && (
          <div className="absolute top-3 left-3 z-10 flex max-h-[calc(100%-1.5rem)] w-64 flex-col overflow-hidden rounded-lg border glass-panel">
            <div className="flex items-center gap-2 border-b px-3 py-2" style={{ borderColor: "var(--bpmn-border-soft)" }}>
              <Footprints className="h-3.5 w-3.5" style={{ color: "var(--bpmn-cyan)" }} />
              <span className="font-mono text-[10px] tracking-wider uppercase" style={{ color: "var(--bpmn-text-muted)" }}>
                Walk a journey
              </span>
              {activeRoute && (
                <button type="button" onClick={clearRoute} className="ml-auto" title="Clear route (Esc)">
                  <X className="h-3.5 w-3.5" style={{ color: "var(--bpmn-text-dim)" }} />
                </button>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto py-1">
              {model.routes.map((r) => {
                const on = r.id === activeRouteId;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => (on ? clearRoute() : pickRoute(r.id))}
                    className="flex w-full items-start gap-2 px-3 py-1.5 text-left transition-colors"
                    style={{ background: on ? "hsla(45,80%,55%,0.10)" : "transparent" }}
                  >
                    <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: on ? "#e8b923" : "var(--bpmn-border-em)" }} />
                    <span className="min-w-0">
                      <span className="block truncate text-[12px]" style={{ color: on ? "var(--bpmn-text)" : "var(--bpmn-text-muted)", fontFamily: "var(--reading-font)" }}>
                        {r.title}
                      </span>
                      <span className="font-mono text-[9.5px]" style={{ color: "var(--bpmn-text-dim)" }}>
                        {r.buildingIds.length} stops{r.handlerType ? ` · ${r.handlerType}` : ""}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Route stepper HUD. */}
        {activeRoute && (
          <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 rounded-full border px-2 py-1.5 glass-panel">
            <button type="button" onClick={() => step(-1)} className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-[var(--bpmn-surface-hi)]" title="Previous stop (←)">
              <ChevronLeft className="h-4 w-4" style={{ color: "var(--bpmn-text-muted)" }} />
            </button>
            <span className="min-w-[7rem] text-center font-mono text-[11px]" style={{ color: "var(--bpmn-text-muted)" }}>
              {routeStep < 0 ? "full route" : `stop ${routeStep + 1} / ${activeRoute.buildingIds.length}`}
            </span>
            <button type="button" onClick={() => step(1)} className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-[var(--bpmn-surface-hi)]" title="Next stop (→)">
              <ChevronRight className="h-4 w-4" style={{ color: "var(--bpmn-text-muted)" }} />
            </button>
          </div>
        )}

        {/* Selected building chip. */}
        {selected && (
          <div className="absolute top-3 right-3 z-10 flex items-center gap-2 rounded-lg border px-3 py-2 glass-panel">
            <div>
              <div className="text-[12px] font-semibold" style={{ color: "var(--bpmn-text)", fontFamily: "var(--bpmn-font-mono)" }}>
                {selected.name}
              </div>
              <div className="font-mono text-[9.5px]" style={{ color: "var(--bpmn-text-dim)" }}>
                {selected.lines} lines · {selected.role}
                {selected.isLandmark ? " · landmark" : ""}
              </div>
            </div>
            <button type="button" onClick={() => setSelectedId(null)} title="Deselect">
              <X className="h-3.5 w-3.5" style={{ color: "var(--bpmn-text-dim)" }} />
            </button>
          </div>
        )}

        {/* Reset camera (clears everything). */}
        <button
          type="button"
          onClick={clearRoute}
          className="absolute right-3 bottom-4 z-10 flex h-8 w-8 items-center justify-center rounded-md border glass-panel hover:bg-[var(--bpmn-surface-hi)]"
          title="Reset view"
        >
          <RotateCcw className="h-3.5 w-3.5" style={{ color: "var(--bpmn-text-muted)" }} />
        </button>
      </div>
    </section>
  );
};

const ROLE_LEGEND: [string, string][] = [
  ["endpoint", "#e0996b"],
  ["service", "#6bb6c9"],
  ["domain", "#9b87c4"],
  ["data", "#7fae8e"],
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
