import useJourneyData from "@/hooks/canvas/use-journey-data";
import {
  deriveJourneyRoute,
  type JourneyRoute,
  type RouteStop,
} from "@/lib/canvas/journey-route";
import { useAnalysis } from "@/store/use-analysis-store";
import { useViewportStore } from "@/store/use-viewport-store";
import type { PositionedGroupRegion } from "@/types/grouping";
import { RefObject, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

// ─── Journey transit lines ──────────────────────────────────────────────────
// A selected journey renders as a metro-style line through the COMPONENT map:
// each stop is a component (module group, or a service when the run has no
// grouping) the journey passes through, in first-visit order. Functions and
// classes are deliberately absent — that detail lives in the chapter view.
// The line reads as a route, not a spoke diagram: quadratic legs bow to one
// side, arrows show direction, PR-touched stops carry an amber marker.
//
// Everything here is world-space SVG rendered inside CanvasWorld's <svg>
// (above the group hulls + service regions, so lines draw on top). Stop
// POSITIONS come from the live layout (group centres / servicePosRef), but
// line thickness, stop size, labels and parallel-line spacing are all sized
// in SCREEN space (÷ zoom) so the route reads as a bold metro line at any
// fit — a journey often spans the whole map, framed well below zoom 1.

interface Props {
  /** Live service positions (populated during render by CanvasWorld). */
  servicePosRef: RefObject<
    Map<string, { cx: number; cy: number; radius: number }>
  >;
  /** Canvas container — needed for the zoom-to-fit bounding-box maths. */
  containerRef: RefObject<HTMLDivElement>;
}

// Line colours by ACTIVATION index (not journey colour) so the 1st/2nd/3rd lit
// line always reads the same: violet, teal, rose. All three hold on #0C0F1D.
export const LINE_COLORS = [
  "hsl(var(--primary))", // violet — the app accent
  "hsl(var(--signal))", // teal — the reserved "signal" hue
  "#f0709b", // rose
];

// Screen-space sizes (multiplied by 1/zoom at render time).
const LINE_OFFSET = 7; // parallel-line separation
const STOP_R = 13;
const STROKE = 3.5;
const HALO = 6;
const BOW_FRACTION = 0.13; // perpendicular bow as a fraction of leg length

interface Vec {
  x: number;
  y: number;
}

interface PositionedStop {
  stop: RouteStop;
  x: number;
  y: number;
  isEntry: boolean;
  isTerminus: boolean;
  /** Incoming leg direction (for the terminus bar); null for the entry. */
  inDir: Vec | null;
}

interface LineLeg {
  d: string;
  arrow: { x: number; y: number; angle: number };
}

interface LineGeom {
  journeyId: string;
  color: string;
  stops: PositionedStop[];
  legs: LineLeg[];
}

const norm = (v: Vec): Vec => {
  const len = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / len, y: v.y / len };
};

/** Build the drawable geometry for one journey route at a given activation
 *  index. `off` is the per-line perpendicular shift (world units). Returns
 *  null when fewer than one stop resolves to a position. */
function buildLineGeom(
  route: JourneyRoute,
  color: string,
  off: number,
  anchorOf: (stop: RouteStop) => Vec | null
): LineGeom | null {
  const base = new Map<string, Vec>();
  for (const stop of route.stops) {
    const a = anchorOf(stop);
    if (a) base.set(stop.key, a);
  }
  if (base.size === 0) return null;

  // Per-stop perpendicular offset so parallel lines don't overlap. The offset
  // direction is perpendicular to the average of the legs incident to a stop.
  const incident = new Map<string, Vec>();
  const addDir = (key: string, dir: Vec) => {
    const cur = incident.get(key) ?? { x: 0, y: 0 };
    incident.set(key, { x: cur.x + dir.x, y: cur.y + dir.y });
  };
  for (const leg of route.legs) {
    const a = base.get(leg.from);
    const b = base.get(leg.to);
    if (!a || !b) continue;
    const dir = norm({ x: b.x - a.x, y: b.y - a.y });
    addDir(leg.from, dir);
    addDir(leg.to, dir);
  }
  const posOf = (key: string): Vec | null => {
    const a = base.get(key);
    if (!a) return null;
    if (off === 0) return a;
    const acc = incident.get(key);
    if (!acc || (acc.x === 0 && acc.y === 0)) return { x: a.x + off, y: a.y };
    const n = norm(acc);
    return { x: a.x + -n.y * off, y: a.y + n.x * off };
  };

  const lastKey = route.stops[route.stops.length - 1]?.key;
  const firstKey = route.stops[0]?.key;
  const stops: PositionedStop[] = [];
  for (const stop of route.stops) {
    const p = posOf(stop.key);
    if (!p) continue;
    const inLeg = [...route.legs].reverse().find((l) => l.to === stop.key);
    let inDir: Vec | null = null;
    if (inLeg) {
      const a = posOf(inLeg.from);
      const b = posOf(inLeg.to);
      if (a && b) inDir = norm({ x: b.x - a.x, y: b.y - a.y });
    }
    stops.push({
      stop,
      x: p.x,
      y: p.y,
      isEntry: stop.key === firstKey,
      isTerminus: stop.key === lastKey && route.stops.length > 1,
      inDir,
    });
  }

  const legs: LineLeg[] = [];
  route.legs.forEach((leg, i) => {
    const a = posOf(leg.from);
    const b = posOf(leg.to);
    if (!a || !b) return;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const perp = { x: -dy / len, y: dx / len };
    const side = i % 2 === 0 ? 1 : -1;
    const bow = len * BOW_FRACTION * side;
    const mx = (a.x + b.x) / 2 + perp.x * bow;
    const my = (a.y + b.y) / 2 + perp.y * bow;
    const d = `M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`;
    // Point + tangent at t=0.5 of the quadratic.
    const px = 0.25 * a.x + 0.5 * mx + 0.25 * b.x;
    const py = 0.25 * a.y + 0.5 * my + 0.25 * b.y;
    const tan = norm({ x: b.x - a.x, y: b.y - a.y });
    legs.push({
      d,
      arrow: { x: px, y: py, angle: (Math.atan2(tan.y, tan.x) * 180) / Math.PI },
    });
  });

  return { journeyId: route.journeyId, color, stops, legs };
}

const JourneyLines = ({ servicePosRef, containerRef }: Props) => {
  const { activeLines } = useJourneyData();
  const serviceGroups = useAnalysis((s) => s.transformedData?.serviceGroups);
  const services = useAnalysis((s) => s.transformedData?.services);
  const sharedLibs = useAnalysis((s) => s.transformedData?.sharedLibs);
  const chapterById = useAnalysis((s) => s.transformedData?.chapterById);
  const zoom = useViewportStore((s) => s.zoom);
  const zoomTo = useViewportStore((s) => s.zoomTo);
  const navigate = useNavigate();

  const [hovered, setHovered] = useState<{
    lineIndex: number;
    stopKey: string;
  } | null>(null);

  const serviceNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of services ?? []) m.set(s.id, s.name);
    for (const s of sharedLibs ?? []) m.set(s.id, s.name);
    return m;
  }, [services, sharedLibs]);

  const groupById = useMemo(() => {
    const m = new Map<string, PositionedGroupRegion>();
    for (const g of serviceGroups ?? []) m.set(g.id, g);
    return m;
  }, [serviceGroups]);

  const routes = useMemo<JourneyRoute[]>(
    () =>
      activeLines.map((j) =>
        deriveJourneyRoute(j, serviceGroups, serviceNameById)
      ),
    [activeLines, serviceGroups, serviceNameById]
  );

  // Anchor resolution reads the LIVE service positions (a ref), so it can't be
  // memoized — resolve inside render each frame. Cheap: ≤3 short routes.
  const anchorOf = (stop: RouteStop): Vec | null => {
    if (stop.kind === "group") {
      const g = groupById.get(stop.key);
      return g ? { x: g.cx, y: g.cy } : null;
    }
    const p = servicePosRef.current.get(stop.key);
    return p ? { x: p.cx, y: p.cy } : null;
  };

  // Screen-space scale: world size × k stays a fixed number of screen pixels.
  const k = 1 / zoom;
  const n = routes.length;

  const lineGeoms = routes
    .map((route, i) => {
      const slot = i - (n - 1) / 2;
      return buildLineGeom(
        route,
        LINE_COLORS[i % LINE_COLORS.length],
        slot * LINE_OFFSET * k,
        anchorOf
      );
    })
    .filter(Boolean) as LineGeom[];

  // ── Zoom-to-fit: frame the union of all lit stops when the active set
  // changes. Interruptible — zoomTo just sets the viewport, the user can
  // pan/zoom over it immediately.
  const linesKey = activeLines.map((j) => j.id).join("|");
  const prevKeyRef = useRef("");
  useEffect(() => {
    if (!linesKey) {
      prevKeyRef.current = "";
      return;
    }
    if (linesKey === prevKeyRef.current) return;
    const pts: Vec[] = [];
    for (const route of routes)
      for (const stop of route.stops) {
        const a = anchorOf(stop);
        if (a) pts.push(a);
      }
    const rect = containerRef.current?.getBoundingClientRect();
    if (pts.length === 0 || !rect) return;
    prevKeyRef.current = linesKey;
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const pad = 120;
    const minX = Math.min(...xs) - pad;
    const maxX = Math.max(...xs) + pad;
    const minY = Math.min(...ys) - pad;
    const maxY = Math.max(...ys) + pad;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const target =
      Math.min(rect.width / (maxX - minX), rect.height / (maxY - minY)) * 0.9;
    zoomTo(cx, cy, Math.max(0.2, Math.min(target, 2.5)), rect.width, rect.height);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linesKey]);

  if (lineGeoms.length === 0) return null;

  const halo = "var(--bpmn-bg)";
  const amber = "var(--bpmn-amber)";
  const R = STOP_R * k;

  return (
    <g className="pointer-events-none" data-testid="journey-lines">
      {lineGeoms.map((geom, li) => {
        const journey = activeLines[li];
        const slug = chapterById?.get(geom.journeyId)?.slug;
        const goToChapter = () => {
          if (slug) navigate(`/journeys/${encodeURIComponent(slug)}`);
        };
        return (
          <g key={geom.journeyId}>
            {/* Legs — halo under-stroke, then the coloured line + arrow. */}
            {geom.legs.map((leg, i) => (
              <g key={`leg-${i}`}>
                <path
                  d={leg.d}
                  fill="none"
                  stroke={halo}
                  strokeWidth={HALO * k}
                  strokeLinecap="round"
                  opacity={0.6}
                />
                <path
                  d={leg.d}
                  fill="none"
                  stroke={geom.color}
                  strokeWidth={STROKE * k}
                  strokeLinecap="round"
                  opacity={0.95}
                />
                <g
                  transform={`translate(${leg.arrow.x} ${leg.arrow.y}) rotate(${leg.arrow.angle}) scale(${k})`}
                >
                  <path
                    d="M -3.5 -4 L 5 0 L -3.5 4 Z"
                    fill={geom.color}
                    stroke={halo}
                    strokeWidth={0.75}
                    opacity={0.95}
                  />
                </g>
              </g>
            ))}

            {/* Stops. */}
            {geom.stops.map((ps) => {
              const changed = ps.stop.changedSteps > 0;
              const isHover =
                hovered?.lineIndex === li && hovered?.stopKey === ps.stop.key;
              return (
                <g key={ps.stop.key}>
                  {ps.isEntry && (
                    <circle
                      cx={ps.x}
                      cy={ps.y}
                      r={R + 4 * k}
                      fill="none"
                      stroke={geom.color}
                      strokeWidth={1.5 * k}
                      opacity={0.5}
                    />
                  )}
                  {ps.isTerminus &&
                    ps.inDir &&
                    (() => {
                      const p = { x: -ps.inDir.y, y: ps.inDir.x };
                      const L = R + 3 * k;
                      return (
                        <line
                          x1={ps.x - p.x * L}
                          y1={ps.y - p.y * L}
                          x2={ps.x + p.x * L}
                          y2={ps.y + p.y * L}
                          stroke={geom.color}
                          strokeWidth={3 * k}
                          strokeLinecap="round"
                        />
                      );
                    })()}
                  {changed && (
                    <circle
                      cx={ps.x}
                      cy={ps.y}
                      r={R + 6 * k}
                      fill="none"
                      stroke={amber}
                      strokeWidth={2 * k}
                      strokeDasharray={`${4 * k} ${3 * k}`}
                      opacity={0.9}
                    />
                  )}
                  <circle
                    cx={ps.x}
                    cy={ps.y}
                    r={R}
                    fill="var(--bpmn-surface)"
                    stroke={geom.color}
                    strokeWidth={2.5 * k}
                    style={{ cursor: "pointer", pointerEvents: "auto" }}
                    onMouseEnter={() =>
                      setHovered({ lineIndex: li, stopKey: ps.stop.key })
                    }
                    onMouseLeave={() => setHovered(null)}
                    onClick={(e) => {
                      e.stopPropagation();
                      goToChapter();
                    }}
                  />
                  <text
                    x={ps.x}
                    y={ps.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={11 * k}
                    fontWeight={700}
                    fontFamily="'JetBrains Mono', monospace"
                    fill={geom.color}
                    className="pointer-events-none"
                  >
                    {ps.stop.seq}
                  </text>
                  <text
                    x={ps.x + R + 3 * k}
                    y={ps.y - R + 2 * k}
                    textAnchor="start"
                    fontSize={9 * k}
                    fontFamily="'JetBrains Mono', monospace"
                    fill="var(--bpmn-text-dim)"
                    className="pointer-events-none"
                  >
                    ×{ps.stop.stepCount}
                  </text>
                  {changed && (
                    <text
                      x={ps.x + R + 3 * k}
                      y={ps.y + R - 1 * k}
                      textAnchor="start"
                      fontSize={9 * k}
                      fontWeight={700}
                      fontFamily="'JetBrains Mono', monospace"
                      fill={amber}
                      className="pointer-events-none"
                    >
                      Δ{ps.stop.changedSteps}
                    </text>
                  )}
                  {/* Hover card — counter-scaled to a fixed screen size. */}
                  {isHover && (
                    <g
                      transform={`translate(${ps.x + (STOP_R + 8) * k} ${ps.y}) scale(${k})`}
                    >
                      <foreignObject x={0} y={-14} width={240} height={150}>
                        <div
                          style={{
                            background: "var(--cw-panel-bg-solid)",
                            border: "1px solid var(--cw-panel-border)",
                            borderLeft: `3px solid ${geom.color}`,
                            borderRadius: "8px",
                            padding: "8px 10px",
                            backdropFilter: "blur(12px)",
                            fontFamily: "'JetBrains Mono', monospace",
                            width: "fit-content",
                            maxWidth: "240px",
                          }}
                        >
                          <div
                            style={{
                              fontSize: "12px",
                              fontWeight: 600,
                              color: "var(--bpmn-text)",
                            }}
                          >
                            {ps.stop.name}
                          </div>
                          <div
                            style={{
                              fontSize: "10px",
                              color: "var(--bpmn-text-muted)",
                              marginTop: "2px",
                            }}
                          >
                            {ps.stop.stepCount} step
                            {ps.stop.stepCount === 1 ? "" : "s"}
                            {changed ? ` · ${ps.stop.changedSteps} changed` : ""}
                          </div>
                          {ps.stop.stepNames.length > 0 && (
                            <div style={{ marginTop: "5px" }}>
                              {ps.stop.stepNames.slice(0, 6).map((nm, ni) => (
                                <div
                                  key={ni}
                                  style={{
                                    fontSize: "9.5px",
                                    color: "var(--bpmn-text-dim)",
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                  }}
                                >
                                  {nm}
                                </div>
                              ))}
                              {ps.stop.stepCount > ps.stop.stepNames.length && (
                                <div
                                  style={{
                                    fontSize: "9.5px",
                                    color: "var(--bpmn-text-dim)",
                                    opacity: 0.7,
                                  }}
                                >
                                  +{ps.stop.stepCount - ps.stop.stepNames.length}{" "}
                                  more
                                </div>
                              )}
                            </div>
                          )}
                          <div
                            style={{
                              fontSize: "9px",
                              color: "var(--bpmn-text-dim)",
                              marginTop: "5px",
                              opacity: 0.8,
                            }}
                          >
                            {journey?.title} → open chapter
                          </div>
                        </div>
                      </foreignObject>
                    </g>
                  )}
                </g>
              );
            })}
          </g>
        );
      })}
    </g>
  );
};

export default JourneyLines;
