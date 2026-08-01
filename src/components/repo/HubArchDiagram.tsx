import { useMemo, useState } from "react";
import {
  Boxes,
  Camera,
  Cloud,
  Database,
  HardDrive,
  Radio,
  RadioTower,
  Server,
  User,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { iconKeyFor, layoutDiagram } from "@/lib/repo/arch-diagram";
import type { ArchEdge, ArchNode } from "@/types/architecture";

/** The front-page C4 diagram as an INFOGRAPHIC (founder direction):
 *  per-node icons (database / cache / cloud / broker / camera / user…),
 *  directional edges with arrowheads and a flowing-dash animation (the
 *  design export's own `dashflow` keyframe; reduced-motion disables it),
 *  and hover FOCUS — hovering a box dims everything not connected to it.
 *  Pure presentation over layoutDiagram. */

const ICONS: Record<string, LucideIcon> = {
  cache: Zap,
  blob: HardDrive,
  database: Database,
  cloud: Cloud,
  topic: Radio,
  broker: RadioTower,
  camera: Camera,
  user: User,
  component: Boxes,
  external: Cloud,
  service: Server,
};

// arrowhead marker per edge palette (solid variants of the stroke rgbas)
const MARKERS: [string, string][] = [
  ["arr-cyan", "#7DD3FC"],
  ["arr-violet", "#C4B5FD"],
  ["arr-green", "#4ADE80"],
  ["arr-dim", "#5F6879"],
];
const markerFor = (stroke: string): string =>
  stroke.includes("125,211,252") ? "arr-cyan"
  : stroke.includes("196,181,253") ? "arr-violet"
  : stroke.includes("74,222,128") ? "arr-green"
  : "arr-dim";

const DIM = 0.18;

export function HubArchDiagram({ nodes, edges, level, systemName }: {
  nodes: ArchNode[];
  edges: ArchEdge[];
  level: 1 | 2;
  systemName: string;
}) {
  const L = useMemo(
    () => layoutDiagram(nodes, edges, level, systemName),
    [nodes, edges, level, systemName],
  );
  const kindById = useMemo(
    () => new Map(nodes.map((n) => [n.id, n.kind])),
    [nodes],
  );

  // hover focus: the hovered box + everything one edge away stays lit
  const [hover, setHover] = useState<string | null>(null);
  const lit = useMemo(() => {
    if (!hover) return null;
    const s = new Set([hover]);
    for (const e of L.edges) {
      if (e.from === hover) s.add(e.to);
      if (e.to === hover) s.add(e.from);
    }
    return s;
  }, [hover, L.edges]);
  const boxDim = (id: string) => (lit && !lit.has(id) ? DIM : 1);
  const edgeDim = (e: { from: string; to: string }) =>
    lit && !(lit.has(e.from) && lit.has(e.to)) ? DIM : 1;

  return (
    <div className="overflow-x-auto" style={{ background: "#0A0D15" }}>
      <style>{`
        @keyframes diag-dashflow { to { stroke-dashoffset: -24; } }
        .diag-flow { animation: diag-dashflow 1.1s linear infinite; }
        @media (prefers-reduced-motion: reduce) {
          .diag-flow { animation: none !important; }
        }
      `}</style>
      <div className="relative mx-auto"
           style={{ width: L.width, height: L.height, minWidth: L.width }}
           onMouseLeave={() => setHover(null)}>
        {/* underlay: boundary + edges */}
        <svg width={L.width} height={L.height}
             className="absolute inset-0" aria-hidden>
          <defs>
            {MARKERS.map(([id, color]) => (
              <marker key={id} id={id} viewBox="0 0 10 10" refX="9" refY="5"
                      markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 1 L 9 5 L 0 9 z" fill={color} />
              </marker>
            ))}
          </defs>
          <rect x={L.boundary.x} y={L.boundary.y} width={L.boundary.w}
                height={L.boundary.h} rx={14}
                fill="rgba(125,211,252,0.022)" stroke="#46516B"
                strokeWidth={1.2} strokeDasharray="7 6" />
          <g fill="none" strokeLinecap="round">
            {L.edges.map((e, i) => (
              <path key={i} d={e.d} stroke={e.stroke} strokeWidth={1.3}
                    className="diag-flow"
                    strokeDasharray={e.dash || "7 5"}
                    markerEnd={`url(#${markerFor(e.stroke)})`}
                    style={{ opacity: edgeDim(e),
                             transition: "opacity 160ms ease" }} />
            ))}
          </g>
        </svg>

        {/* boundary label */}
        <div className="absolute"
             style={{ left: L.boundary.x + 14, top: L.boundary.y + 8 }}>
          <p style={{ margin: 0, fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 10.5, letterSpacing: "0.08em",
                      color: "#7DD3FC" }}>
            {L.boundary.label}
          </p>
        </div>

        {/* lane labels */}
        {L.lanes.map((l) => (
          <p key={l.label + l.y} className="absolute"
             style={{ left: L.boundary.x + 26, top: l.y - 16, margin: 0,
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 9.5, letterSpacing: "0.18em",
                      textTransform: "uppercase", color: "#5F6879",
                      whiteSpace: "nowrap" }}>
            {l.label}
          </p>
        ))}

        {/* boxes — the mock's card recipe + the infographic icon */}
        {L.boxes.map((b) => {
          const Icon = ICONS[iconKeyFor(b.name, kindById.get(b.id) ?? "")]
            ?? Server;
          return (
            <div key={b.id} className="absolute"
                 style={{ left: b.x, top: b.y, width: b.w,
                          opacity: boxDim(b.id),
                          transition: "opacity 160ms ease" }}
                 onMouseEnter={() => setHover(b.id)}>
              <div style={{
                height: b.external ? 88 : 100, boxSizing: "border-box",
                display: "flex", flexDirection: "column", gap: 3,
                borderRadius: 10,
                border: `1px ${b.external ? "dashed" : "solid"} ${
                  hover === b.id ? "#46516B" : "#262E3D"}`,
                borderLeft: `3px solid ${b.accent}`,
                background: b.external
                  ? "#0E1119"
                  : "linear-gradient(180deg, #171C2B 0%, #12161F 100%)",
                padding: "10px 13px",
                boxShadow: b.external ? undefined : "0 6px 18px rgba(0,0,0,0.45)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7,
                              minWidth: 0 }}>
                  <span style={{
                    flexShrink: 0, display: "flex", alignItems: "center",
                    justifyContent: "center", width: 22, height: 22,
                    borderRadius: 6,
                    background: `color-mix(in srgb, ${b.accent} 14%, #0A0D15)`,
                    border: `1px solid color-mix(in srgb, ${b.accent} 35%, transparent)`,
                  }}>
                    <Icon size={12} color={b.accent} strokeWidth={2} />
                  </span>
                  <p style={{ margin: 0, minWidth: 0, fontSize: 13,
                              fontWeight: 600, letterSpacing: "-0.01em",
                              color: "#EDEFF6", whiteSpace: "nowrap",
                              overflow: "hidden", textOverflow: "ellipsis" }}>
                    {b.name}
                  </p>
                  {b.changed && (
                    <span style={{ marginLeft: "auto", flexShrink: 0,
                                   borderRadius: 4,
                                   background: "rgba(212,165,116,0.16)",
                                   padding: "1px 5px",
                                   fontFamily: "'JetBrains Mono', monospace",
                                   fontSize: 8.5, letterSpacing: "0.08em",
                                   textTransform: "uppercase",
                                   color: "#D4A574" }}>
                      modified
                    </span>
                  )}
                </div>
                <p style={{ margin: 0,
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: 9, letterSpacing: "0.03em",
                            color: b.accent, whiteSpace: "nowrap",
                            overflow: "hidden", textOverflow: "ellipsis" }}>
                  {b.tech}
                </p>
                <p style={{ margin: "1px 0 0",
                            fontFamily: "var(--reading-font, Georgia, serif)",
                            fontSize: 10.5, lineHeight: 1.35, color: "#8A94A9",
                            display: "-webkit-box",
                            WebkitBoxOrient: "vertical",
                            WebkitLineClamp: 2, overflow: "hidden" }}>
                  {b.desc}
                </p>
              </div>
            </div>
          );
        })}

        {/* edge label pills */}
        {L.edges.filter((e) => e.label).slice(0, 16).map((e, i) => (
          <span key={i} className="absolute"
                style={{ left: e.lx, top: e.ly,
                         transform: "translate(-50%, -50%)",
                         borderRadius: 4, border: "1px solid #1E2431",
                         background: "#0A0D16", padding: "2px 6px",
                         fontFamily: "'JetBrains Mono', monospace",
                         fontSize: 9, lineHeight: 1.3, whiteSpace: "nowrap",
                         color: e.stroke.replace(/rgba\(([^)]+),[^,)]+\)/,
                                                 "rgb($1)"),
                         maxWidth: 220, overflow: "hidden",
                         textOverflow: "ellipsis",
                         opacity: edgeDim(e), transition: "opacity 160ms ease" }}>
            {e.label}
          </span>
        ))}
      </div>
    </div>
  );
}
