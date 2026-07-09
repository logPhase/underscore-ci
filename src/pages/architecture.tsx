import { useAnalysis } from "@/store/use-analysis-store";
import { statusStyle } from "@/lib/status-colors";
import { layoutArchitecture, type PlacedNode } from "@/lib/architecture-layout";
import type {
  ArchEdge,
  ArchEdgeKind,
  ArchNode,
  ArchNodeKind,
} from "@/types/architecture";
import {
  Boxes,
  Cloud,
  Database,
  Network,
  Radio,
  Server,
} from "lucide-react";
import { useMemo } from "react";
import { Navigate } from "react-router-dom";

/**
 * ArchitecturePage — the repository's system-design view: components,
 * services, data stores, external systems and message topics as boxes,
 * grouped into layers, with their labeled integrations as connectors. It is
 * a DURABLE artifact maintained in the memory store and updated surgically
 * per PR, so the structure is a stable map you learn once; a PR only tints
 * the parts it actually shifts (green added, brown modified, red retired).
 *
 * Payload-driven like specs/findings — deep links without the payload bounce
 * to /journeys.
 */

const KIND_META: Record<
  ArchNodeKind,
  { icon: typeof Boxes; label: string; accent: string }
> = {
  component: { icon: Boxes, label: "component", accent: "var(--bpmn-cyan)" },
  service: { icon: Server, label: "service", accent: "var(--bpmn-cyan)" },
  datastore: { icon: Database, label: "data store", accent: "var(--bpmn-mint)" },
  external: { icon: Cloud, label: "external", accent: "var(--bpmn-text-dim)" },
  topic: { icon: Radio, label: "topic", accent: "hsl(265 55% 68%)" },
};

/** Edge stroke intent by kind (overridden by prStatus when the PR touched
 *  the integration). */
const EDGE_KIND: Record<ArchEdgeKind, { dash?: string; width: number }> = {
  sync: { width: 1.6 },
  async: { dash: "1.5 5", width: 1.6 },
  data: { width: 1.2 },
  dependency: { dash: "3 4", width: 1 },
};

const isUrl = (s: string | null | undefined) =>
  /^https?:\/\//i.test((s || "").trim());

function tint(color: string, pct: number): string {
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`;
}

const ArchitecturePage = () => {
  const payload = useAnalysis((s) => s.transformedData?.architecture);
  const repoId = useAnalysis((s) => s.transformedData?.analyzerRepoId);
  const hasPR = useAnalysis((s) => s.transformedData?.prOverlay != null);

  const nodes = payload?.nodes ?? [];
  const edges = payload?.edges ?? [];
  const layers = payload?.layers ?? [];
  const consulted = payload?.consulted ?? [];

  const layout = useMemo(
    () => layoutArchitecture(nodes, edges, layers),
    [nodes, edges, layers]
  );

  const changed = useMemo(() => {
    const cn = nodes.filter((n) => n.prStatus).length;
    const ce = edges.filter((e) => e.prStatus).length;
    return { cn, ce };
  }, [nodes, edges]);

  // The rail hides this tab without an architecture payload, but guard deep
  // links too.
  if (!payload) return <Navigate to="/journeys" replace />;

  return (
    <section
      className="flex h-full w-full flex-col"
      style={{ background: "var(--page-bg)" }}
    >
      {/* Header */}
      <header
        className="flex shrink-0 items-center gap-3 border-b px-5 py-3"
        style={{ borderColor: "var(--bpmn-border-soft)" }}
      >
        <Network
          className="h-4 w-4 shrink-0"
          style={{ color: "var(--bpmn-text-dim)" }}
        />
        <h1
          className="text-[14px] font-semibold whitespace-nowrap"
          style={{
            fontFamily: "var(--bpmn-font-display)",
            color: "var(--bpmn-text)",
          }}
        >
          Architecture
        </h1>
        {repoId && (
          <span
            className="hidden truncate font-mono text-[11px] md:block"
            style={{ color: "var(--bpmn-text-dim)" }}
            title={`Analyzer repo: ${repoId}`}
          >
            {repoId}
          </span>
        )}
        <span className="ml-auto" />
        <Legend />
      </header>

      {nodes.length === 0 ? (
        <EmptyState consulted={consulted} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Framing line */}
          <p
            className="shrink-0 px-6 pt-4 text-[15px] leading-snug"
            style={{
              fontFamily: "var(--bpmn-font-display)",
              fontStyle: "italic",
              color: "var(--bpmn-text)",
            }}
          >
            {hasPR ? framing(changed.cn, changed.ce) : structureLine(nodes.length)}
          </p>

          {/* Diagram — scrolls both ways; the layout is fixed-size so the
              cards sit exactly over the SVG connectors. */}
          <div className="min-h-0 flex-1 overflow-auto px-6 py-4">
            <div
              className="relative"
              style={{ width: layout.width, height: layout.height }}
            >
              {/* Layer bands (background) */}
              {layout.bands.map((band) => (
                <div
                  key={band.id}
                  className="absolute left-0"
                  style={{
                    top: band.y,
                    width: layout.width,
                    height: band.height,
                  }}
                >
                  <div
                    className="absolute inset-x-0 top-[30px] bottom-0 rounded-xl border"
                    style={{
                      borderColor: "var(--bpmn-border-soft)",
                      background: band.synthetic
                        ? "transparent"
                        : "var(--bpmn-surface-soft)",
                      opacity: band.synthetic ? 1 : 0.5,
                    }}
                  />
                  <span
                    className="absolute left-1 top-0 z-20 rounded px-1.5 py-[1px] font-mono text-[10px] tracking-[0.18em] uppercase"
                    style={{
                      color: "var(--bpmn-text-dim)",
                      background: "var(--page-bg)",
                    }}
                  >
                    {band.name}
                  </span>
                </div>
              ))}

              {/* Edge layer */}
              <svg
                className="pointer-events-none absolute inset-0"
                width={layout.width}
                height={layout.height}
              >
                <defs>
                  <marker
                    id="arch-arrow"
                    viewBox="0 0 8 8"
                    refX="7"
                    refY="4"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M0,0 L8,4 L0,8 z" fill="var(--bpmn-border-em)" />
                  </marker>
                </defs>
                {layout.edges.map(({ edge, d }) => {
                  const styled = edgeStroke(edge);
                  return (
                    <path
                      key={edge.id}
                      d={d}
                      fill="none"
                      stroke={styled.stroke}
                      strokeWidth={styled.width}
                      strokeDasharray={styled.dash}
                      strokeLinecap="round"
                      opacity={styled.opacity}
                      markerEnd="url(#arch-arrow)"
                    />
                  );
                })}
              </svg>

              {/* Edge labels (HTML for clean chips) */}
              {layout.edges.map(({ edge, labelX, labelY }) =>
                edge.label ? (
                  <span
                    key={`l-${edge.id}`}
                    className="absolute -translate-x-1/2 -translate-y-1/2 rounded px-1.5 py-[1px] font-mono text-[9px] whitespace-nowrap"
                    style={{
                      left: labelX,
                      top: labelY,
                      background: "var(--page-bg)",
                      color: edge.prStatus
                        ? statusStyle(edge.prStatus).solid
                        : "var(--bpmn-text-dim)",
                      border: `1px solid ${
                        edge.prStatus
                          ? statusStyle(edge.prStatus).solid
                          : "var(--bpmn-border-soft)"
                      }`,
                    }}
                  >
                    {edge.label}
                  </span>
                ) : null
              )}

              {/* Nodes */}
              {layout.nodes.map((p) => (
                <NodeCard key={p.node.id} placed={p} />
              ))}
            </div>
          </div>

          <ConsultedFooter consulted={consulted} />
        </div>
      )}
    </section>
  );
};

/** A component/service/store/external card or a topic pill. */
const NodeCard = ({ placed }: { placed: PlacedNode }) => {
  const { node, x, y, w, h } = placed;
  const meta = KIND_META[node.kind] ?? KIND_META.component;
  const Icon = meta.icon;
  const st = node.prStatus ? statusStyle(node.prStatus) : null;
  const border = st ? st.solid : "var(--bpmn-border-em)";
  const external = node.kind === "external";
  const topic = node.kind === "topic";

  return (
    <div
      className="absolute flex flex-col justify-center"
      style={{
        left: x,
        top: y,
        width: w,
        height: h,
        borderRadius: topic ? 999 : 10,
        border: `1px solid ${border}`,
        borderStyle: external ? "dashed" : "solid",
        background: st
          ? tint(st.solid, 10)
          : topic
            ? tint(meta.accent, 8)
            : "var(--bpmn-surface)",
        padding: topic ? "0 14px" : "8px 11px",
        boxShadow: topic ? "none" : "0 1px 3px hsla(220,22%,4%,0.35)",
      }}
      title={node.description ?? node.name}
    >
      <div className="flex items-center gap-1.5">
        <Icon
          className="h-3.5 w-3.5 shrink-0"
          style={{ color: st ? st.solid : meta.accent }}
        />
        <span
          className="min-w-0 flex-1 truncate font-mono text-[12px] font-semibold"
          style={{ color: external ? "var(--bpmn-text-muted)" : "var(--bpmn-text)" }}
        >
          {node.name}
        </span>
        {st && (
          <span
            className="shrink-0 rounded-full px-1.5 font-mono text-[8px] tracking-wider uppercase"
            style={{ background: tint(st.solid, 22), color: st.solid }}
          >
            {st.label}
          </span>
        )}
      </div>
      {!topic && (
        <span
          className="mt-0.5 font-mono text-[8.5px] tracking-[0.14em] uppercase"
          style={{ color: "var(--bpmn-text-dim)" }}
        >
          {meta.label}
        </span>
      )}
      {!topic && node.description && (
        <span
          className="mt-1 line-clamp-2 text-[10.5px] leading-snug"
          style={{
            fontFamily: "var(--reading-font)",
            color: "var(--bpmn-text-muted)",
          }}
        >
          {node.description}
        </span>
      )}
    </div>
  );
};

function edgeStroke(edge: ArchEdge): {
  stroke: string;
  width: number;
  dash?: string;
  opacity: number;
} {
  const base = EDGE_KIND[edge.kind] ?? EDGE_KIND.sync;
  if (edge.prStatus) {
    const s = statusStyle(edge.prStatus).solid;
    const removed = edge.prStatus === "removed";
    return {
      stroke: s,
      width: base.width + 0.6,
      dash: removed ? "4 4" : base.dash,
      opacity: removed ? 0.5 : 1,
    };
  }
  return {
    stroke: "var(--bpmn-border-em)",
    width: base.width,
    dash: base.dash,
    opacity: 0.85,
  };
}

const framing = (cn: number, ce: number): string => {
  if (cn === 0 && ce === 0)
    return "No architectural change in this PR — the structure is unchanged.";
  const parts: string[] = [];
  if (cn > 0) parts.push(`${cn} component${cn === 1 ? "" : "s"}`);
  if (ce > 0) parts.push(`${ce} integration${ce === 1 ? "" : "s"}`);
  return `This PR changes ${parts.join(" and ")}.`;
};

const structureLine = (n: number): string =>
  `The system at a glance — ${n} component${n === 1 ? "" : "s"} and their integrations.`;

const Legend = () => (
  <div className="hidden items-center gap-3 lg:flex">
    {(
      [
        ["component", KIND_META.component.accent],
        ["data store", KIND_META.datastore.accent],
        ["topic", KIND_META.topic.accent],
        ["external", "var(--bpmn-text-dim)"],
      ] as const
    ).map(([label, color]) => (
      <span
        key={label}
        className="flex items-center gap-1 font-mono text-[9.5px] tracking-wider uppercase"
        style={{ color: "var(--bpmn-text-dim)" }}
      >
        <span
          className="h-2 w-2 rounded-sm"
          style={{ background: color as string }}
        />
        {label}
      </span>
    ))}
  </div>
);

const ConsultedFooter = ({
  consulted,
}: {
  consulted: { title: string; ref?: string | null }[];
}) => {
  if (consulted.length === 0) return null;
  return (
    <footer
      className="shrink-0 border-t px-6 py-3"
      style={{ borderColor: "var(--bpmn-border-soft)" }}
    >
      <span
        className="font-mono text-[9px] tracking-[0.18em] uppercase"
        style={{ color: "var(--bpmn-text-dim)" }}
      >
        Memory consulted
      </span>
      <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
        {consulted.map((d, i) => (
          <li
            key={i}
            className="font-mono text-[11px]"
            style={{ color: "var(--bpmn-text-dim)" }}
          >
            {isUrl(d.ref) ? (
              <a
                href={d.ref ?? undefined}
                target="_blank"
                rel="noreferrer"
                className="hover:underline"
                style={{ color: "var(--bpmn-text-muted)" }}
              >
                {d.title} ↗
              </a>
            ) : (
              d.title
            )}
          </li>
        ))}
      </ul>
    </footer>
  );
};

const EmptyState = ({
  consulted,
}: {
  consulted: { title: string; ref?: string | null }[];
}) => (
  <div className="flex flex-1 flex-col items-center justify-center gap-2 px-8 text-center">
    <Network className="h-6 w-6" style={{ color: "var(--bpmn-text-dim)" }} />
    <p
      className="text-[14px]"
      style={{ fontFamily: "var(--reading-font)", color: "var(--bpmn-text)" }}
    >
      No architecture has been mapped for this repository yet.
    </p>
    <p
      className="max-w-md font-mono text-[11px]"
      style={{ color: "var(--bpmn-text-dim)" }}
    >
      The analyzer draws the component architecture after it has enough
      structure to describe — it fills in as the repository is analyzed.
    </p>
    {consulted.length > 0 && <ConsultedFooter consulted={consulted} />}
  </div>
);

export default ArchitecturePage;
