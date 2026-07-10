import { useAnalysis } from "@/store/use-analysis-store";
import ArchitectureCanvas from "@/components/architecture/ArchitectureCanvas";
import type { ArchNodeKind } from "@/types/architecture";
import type { ArchEdge, ArchLayer, ArchNode } from "@/types/architecture";
import { Box, Boxes, Cloud, Database, Layers, Network, Radio, Server, User } from "lucide-react";
import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";

/**
 * Collapse the container-level diagram into a C4 SYSTEM CONTEXT view: the
 * subject system as one box, the people/actors and external systems it talks
 * to around it, and every internal↔external integration aggregated onto the
 * system boundary. A stopgap derivation from existing data — the agent will
 * later author a richer context (with named human actors) directly.
 */
const CONTEXT_OUTER = new Set(["external", "person", "system"]);
function deriveContext(
  nodes: ArchNode[],
  edges: ArchEdge[],
  systemName: string
): { nodes: ArchNode[]; edges: ArchEdge[]; layers: ArchLayer[] } | null {
  const outer = nodes.filter((n) => CONTEXT_OUTER.has(n.kind));
  if (outer.filter((n) => n.kind !== "system").length === 0) return null; // nothing to contextualise

  const existingSystem = nodes.find((n) => n.kind === "system");
  const sysId = existingSystem?.id ?? "__system__";
  const systemNode: ArchNode =
    existingSystem ?? { id: sysId, name: systemName, kind: "system", layer: "system", description: null };

  const outerIds = new Set(outer.map((n) => n.id));
  const seen = new Set<string>();
  const ctxEdges: ArchEdge[] = [];
  for (const e of edges) {
    const fromOuter = outerIds.has(e.from);
    const toOuter = outerIds.has(e.to);
    if (fromOuter && toOuter) {
      if (!seen.has(e.id)) { seen.add(e.id); ctxEdges.push(e); }
      continue;
    }
    if (!fromOuter && !toOuter) continue; // wholly internal — hidden at context level
    const from = fromOuter ? e.from : sysId;
    const to = toOuter ? e.to : sysId;
    const key = `${from}->${to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    ctxEdges.push({ id: `ctx-${key}`, from, to, kind: e.kind, label: e.label ?? null, prStatus: e.prStatus ?? null });
  }

  const ctxNodes: ArchNode[] = [
    systemNode.layer ? systemNode : { ...systemNode, layer: "system" },
    ...outer
      .filter((n) => n.kind !== "system")
      .map((n) => ({ ...n, layer: n.kind === "person" ? "actors" : "external" })),
  ];
  const layers: ArchLayer[] = [
    { id: "actors", name: "People" },
    { id: "system", name: "System" },
    { id: "external", name: "External Systems" },
  ];
  return { nodes: ctxNodes, edges: ctxEdges, layers };
}
// Note: the "memory consulted" provenance block was intentionally removed from
// the diagram — provenance stays in the payload but is no longer surfaced here.

/**
 * ArchitecturePage — the repository's system-design view: components,
 * services, data stores, external systems and message topics as boxes, with
 * their labeled integrations as connectors. It is a DURABLE artifact
 * maintained in the memory store and updated surgically per PR, so the
 * structure is a stable map you learn once; a PR only tints the parts it
 * actually shifts (green added, brown modified, red retired).
 *
 * This page is the shell — header, PR-change framing, legend. The diagram
 * itself is an interactive SVG canvas (draggable boxes + editable connector
 * routing, infrastructure de-emphasised and toggleable).
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
  person: { icon: User, label: "actor", accent: "var(--bpmn-amber)" },
  system: { icon: Box, label: "system", accent: "var(--bpmn-cyan)" },
};

const ArchitecturePage = () => {
  const payload = useAnalysis((s) => s.transformedData?.architecture);
  const repoId = useAnalysis((s) => s.transformedData?.analyzerRepoId);
  const hasPR = useAnalysis((s) => s.transformedData?.prOverlay != null);

  const nodes = payload?.nodes ?? [];
  const edges = payload?.edges ?? [];
  const layers = payload?.layers ?? [];
  const systemName = (payload?.repo || repoId || "This System").split(/[/\-.]/).pop() || "This System";

  const [level, setLevel] = useState<"context" | "container">("container");
  const context = useMemo(
    () => deriveContext(nodes, edges, systemName),
    [nodes, edges, systemName]
  );
  const active = level === "context" && context ? context : { nodes, edges, layers };
  const storageKey = `${payload?.repo || repoId || "default"}:${level}`;

  const changed = useMemo(() => {
    const cn = active.nodes.filter((n) => n.prStatus).length;
    const ce = active.edges.filter((e) => e.prStatus).length;
    return { cn, ce };
  }, [active]);

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
        {/* C4 level toggle — Context (system + externals) / Container. */}
        {context && (
          <div className="flex items-center overflow-hidden rounded-md border" style={{ borderColor: "var(--bpmn-border-em)" }}>
            <LevelBtn active={level === "context"} onClick={() => setLevel("context")} icon={<Network className="h-3 w-3" />}>Context</LevelBtn>
            <LevelBtn active={level === "container"} onClick={() => setLevel("container")} icon={<Layers className="h-3 w-3" />}>Container</LevelBtn>
          </div>
        )}
        <span className="ml-auto" />
        <Legend />
      </header>

      {active.nodes.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Framing line */}
          <p
            className="shrink-0 px-6 pt-4 pb-3 text-[15px] leading-snug"
            style={{
              fontFamily: "var(--bpmn-font-display)",
              fontStyle: "italic",
              color: "var(--bpmn-text)",
            }}
          >
            {level === "context"
              ? "System context — the people and external systems this system talks to."
              : hasPR
                ? framing(changed.cn, changed.ce)
                : structureLine(active.nodes.length)}
          </p>

          {/* Interactive canvas — fills the remaining space. */}
          <div className="min-h-0 flex-1">
            <ArchitectureCanvas
              nodes={active.nodes}
              edges={active.edges}
              layers={active.layers}
              storageKey={storageKey}
            />
          </div>
        </div>
      )}
    </section>
  );
};

const LevelBtn = ({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) => (
  <button type="button" onClick={onClick} className="flex items-center gap-1.5 px-2.5 py-1 font-mono text-[10px] tracking-wide transition-colors" style={{ background: active ? "var(--bpmn-surface-hi)" : "transparent", color: active ? "var(--bpmn-text)" : "var(--bpmn-text-dim)" }}>
    {icon}{children}
  </button>
);

const framing = (cn: number, ce: number): string => {
  if (cn === 0 && ce === 0)
    return "No architectural change in this PR — the structure is unchanged.";
  const parts: string[] = [];
  if (cn > 0) parts.push(`${cn} component${cn === 1 ? "" : "s"}`);
  if (ce > 0) parts.push(`${ce} integration${ce === 1 ? "" : "s"}`);
  return `This PR changes ${parts.join(" and ")}.`;
};

const structureLine = (n: number): string =>
  `The system at a glance — ${n} component${n === 1 ? "" : "s"} and their integrations. Drag to rearrange; bend the lines to taste.`;

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

const EmptyState = () => (
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
      The analyzer draws the architecture after it has enough structure to
      describe — it fills in as the repository is analyzed.
    </p>
  </div>
);

export default ArchitecturePage;
