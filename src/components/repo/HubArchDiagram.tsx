import { useMemo } from "react";
import { layoutDiagram } from "@/lib/repo/arch-diagram";
import type { ArchEdge, ArchNode } from "@/types/architecture";

/** The front-page C4 diagram, rendered exactly as the founder's mock draws
 *  it: gradient container cards with accent left-borders and [Container]
 *  tech lines, a dashed [Software System] boundary with lane labels,
 *  externals flanking, labeled S-curve edges. Pure presentation over
 *  layoutDiagram — no interaction beyond the page's own links (the full
 *  interactive canvas lives one click away on /architecture). */
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

  return (
    <div className="overflow-x-auto" style={{ background: "#0A0D15" }}>
      <div className="relative mx-auto"
           style={{ width: L.width, height: L.height, minWidth: L.width }}>
        {/* underlay: boundary + edges */}
        <svg width={L.width} height={L.height}
             className="absolute inset-0" aria-hidden>
          <rect x={L.boundary.x} y={L.boundary.y} width={L.boundary.w}
                height={L.boundary.h} rx={14}
                fill="rgba(125,211,252,0.022)" stroke="#46516B"
                strokeWidth={1.2} strokeDasharray="7 6" />
          <g fill="none" strokeLinecap="round">
            {L.edges.map((e, i) => (
              <path key={i} d={e.d} stroke={e.stroke} strokeWidth={1.2}
                    strokeDasharray={e.dash || undefined} />
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

        {/* boxes — the mock's card recipe verbatim */}
        {L.boxes.map((b) => (
          <div key={b.id} className="absolute"
               style={{ left: b.x, top: b.y, width: b.w }}>
            <div style={{
              height: b.external ? 88 : 100, boxSizing: "border-box",
              display: "flex", flexDirection: "column", gap: 3,
              borderRadius: 10,
              border: `1px ${b.external ? "dashed" : "solid"} #262E3D`,
              borderLeft: `3px solid ${b.accent}`,
              background: b.external
                ? "#0E1119"
                : "linear-gradient(180deg, #171C2B 0%, #12161F 100%)",
              padding: "11px 13px",
              boxShadow: b.external ? undefined : "0 6px 18px rgba(0,0,0,0.45)",
            }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600,
                          letterSpacing: "-0.01em", color: "#EDEFF6",
                          whiteSpace: "nowrap", overflow: "hidden",
                          textOverflow: "ellipsis" }}>
                {b.name}
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 7,
                            minWidth: 0 }}>
                <p style={{ margin: 0, minWidth: 0, flex: 1,
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: 9, letterSpacing: "0.03em",
                            color: b.accent, whiteSpace: "nowrap",
                            overflow: "hidden", textOverflow: "ellipsis" }}>
                  {b.tech}
                </p>
                {b.changed && (
                  <span style={{ flexShrink: 0, borderRadius: 4,
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
              <p style={{ margin: "2px 0 0",
                          fontFamily: "var(--reading-font, Georgia, serif)",
                          fontSize: 10.5, lineHeight: 1.35, color: "#8A94A9",
                          display: "-webkit-box", WebkitBoxOrient: "vertical",
                          WebkitLineClamp: 2, overflow: "hidden" }}>
                {b.desc}
              </p>
            </div>
          </div>
        ))}

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
                         textOverflow: "ellipsis" }}>
            {e.label}
          </span>
        ))}
      </div>
    </div>
  );
}
