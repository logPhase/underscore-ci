import { useAnalysis } from "@/store/use-analysis-store";
import ArchitectureCanvas from "@/components/architecture/ArchitectureCanvas";
import type { ArchNodeKind } from "@/types/architecture";
import { Boxes, Cloud, Database, Network, Radio, Server } from "lucide-react";
import { useMemo } from "react";
import { Navigate } from "react-router-dom";

/**
 * ArchitecturePage — the repository's system-design view: components,
 * services, data stores, external systems and message topics as boxes, with
 * their labeled integrations as connectors. It is a DURABLE artifact
 * maintained in the memory store and updated surgically per PR, so the
 * structure is a stable map you learn once; a PR only tints the parts it
 * actually shifts (green added, brown modified, red retired).
 *
 * This page is the shell — header, PR-change framing, legend, memory footer.
 * The diagram itself is an interactive SVG canvas (draggable boxes + editable
 * connector routing, infrastructure de-emphasised and toggleable).
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

const isUrl = (s: string | null | undefined) =>
  /^https?:\/\//i.test((s || "").trim());

const ArchitecturePage = () => {
  const payload = useAnalysis((s) => s.transformedData?.architecture);
  const repoId = useAnalysis((s) => s.transformedData?.analyzerRepoId);
  const hasPR = useAnalysis((s) => s.transformedData?.prOverlay != null);

  const nodes = payload?.nodes ?? [];
  const edges = payload?.edges ?? [];
  const layers = payload?.layers ?? [];
  const consulted = payload?.consulted ?? [];
  const storageKey = payload?.repo || repoId || "default";

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
            className="shrink-0 px-6 pt-4 pb-3 text-[15px] leading-snug"
            style={{
              fontFamily: "var(--bpmn-font-display)",
              fontStyle: "italic",
              color: "var(--bpmn-text)",
            }}
          >
            {hasPR ? framing(changed.cn, changed.ce) : structureLine(nodes.length)}
          </p>

          {/* Interactive canvas — fills the remaining space. */}
          <div className="min-h-0 flex-1">
            <ArchitectureCanvas
              nodes={nodes}
              edges={edges}
              layers={layers}
              storageKey={storageKey}
            />
          </div>

          <ConsultedFooter consulted={consulted} />
        </div>
      )}
    </section>
  );
};

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
