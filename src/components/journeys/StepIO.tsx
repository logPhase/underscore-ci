/**
 * StepIO — the in/out and state panes of the step dialog.
 *
 * Payload-shaped, never prose: inputs/outputs/state render as JSON
 * structure (json-shape lines). The state pane differentiates what THIS
 * step modifies from the overall state: written paths get the amber accent
 * and a ✎ marker, read paths a cyan dot, containers holding a write below
 * get a soft cue so the eye descends. Data comes from element.io — filled
 * by the journey-focus session (set_element_io); the tabs only exist when
 * it is present, so published diagrams without it are untouched.
 */
import {
  declaredPathsOf,
  jsonLines,
  matchPaths,
  type JsonLine,
} from "@/lib/json-shape";
import type {
  BpmnElement,
  BpmnElementIO,
  StateWrite,
} from "@/components/bpmn/types";

export type StepTab = "fns" | "io" | "state";

export function hasInOutData(io?: BpmnElementIO): boolean {
  return !!io && (io.inputs !== undefined || io.outputs !== undefined);
}

export function hasStateData(io?: BpmnElementIO): boolean {
  return (
    !!io &&
    (io.state !== undefined ||
      (io.state_writes?.length ?? 0) > 0 ||
      (io.state_reads?.length ?? 0) > 0)
  );
}

/** Cockpit ordering: a stage opens on its process variables when it has
 *  them — the state view IS the point of clicking a stage; code stays one
 *  tab away. */
export function defaultTab(element: BpmnElement | null): StepTab {
  const io = element?.io;
  if (hasStateData(io)) return "state";
  if (hasInOutData(io)) return "io";
  return "fns";
}

const fmtValue = (v: unknown): string =>
  v === undefined ? "?" : JSON.stringify(v);

function Line({
  line,
  writes,
  reads,
}: {
  line: JsonLine;
  writes: string[];
  reads: string[];
}) {
  const structural = line.kind === "close" || line.kind === "cap";
  const write = structural ? null : matchPaths(line.path, writes);
  const read =
    structural || write === "hit" ? null : matchPaths(line.path, reads);
  const marked = write === "hit";
  return (
    <div
      className="flex items-baseline gap-1.5 whitespace-pre font-mono text-[10.5px] leading-[1.7]"
      style={{
        paddingLeft: 8 + line.depth * 14,
        background: marked
          ? "color-mix(in srgb, var(--bpmn-amber) 10%, transparent)"
          : undefined,
        borderLeft: marked
          ? "2px solid var(--bpmn-amber)"
          : "2px solid transparent",
      }}
    >
      {line.key && (
        <span
          style={{
            color: marked ? "var(--bpmn-amber)" : "var(--bpmn-cyan)",
          }}
        >
          {line.key}:
        </span>
      )}
      <span
        style={{
          color:
            line.kind === "cap"
              ? "var(--bpmn-text-dim)"
              : marked
                ? "var(--bpmn-text)"
                : "var(--bpmn-text-muted)",
        }}
      >
        {line.text}
      </span>
      {marked && (
        <span aria-label="written by this step" style={{ color: "var(--bpmn-amber)" }}>
          ✎
        </span>
      )}
      {read === "hit" && (
        <span
          aria-label="read by this step"
          style={{ color: "var(--bpmn-cyan)" }}
        >
          •
        </span>
      )}
      {write === "contains" && (
        <span
          aria-hidden
          title="a field inside is written by this step"
          style={{ color: "color-mix(in srgb, var(--bpmn-amber) 55%, transparent)" }}
        >
          ·✎
        </span>
      )}
    </div>
  );
}

function Shape({
  value,
  writes = [],
  reads = [],
  empty,
}: {
  value: unknown;
  writes?: string[];
  reads?: string[];
  empty: string;
}) {
  if (value === undefined)
    return (
      <div
        className="px-2 py-1.5 font-mono text-[10.5px]"
        style={{ color: "var(--bpmn-text-dim)" }}
      >
        {empty}
      </div>
    );
  return (
    <div className="overflow-x-auto py-1">
      {jsonLines(value).map((l, i) => (
        <Line key={i} line={l} writes={writes} reads={reads} />
      ))}
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mt-2.5 mb-0.5 px-0.5 font-mono text-[8.5px] uppercase"
      style={{ color: "var(--bpmn-cyan)", letterSpacing: 1.2 }}
    >
      {children}
    </div>
  );
}

/** The "in / out" tab: what enters the box, what leaves it. */
export function StepInOut({ io }: { io: BpmnElementIO }) {
  return (
    <div className="px-0.5">
      <Eyebrow>→ input</Eyebrow>
      <Shape value={io.inputs} empty="input not captured yet — ask the session" />
      <Eyebrow>output →</Eyebrow>
      <Shape value={io.outputs} empty="output not captured yet — ask the session" />
      {io.source && <Provenance source={io.source} />}
    </div>
  );
}

/** The "state" tab — the cockpit variables view: the accumulated process
 *  variables at this stage, the paths this step writes highlighted against
 *  the overall picture, and the value transitions (from → to) when the
 *  session captured them. */
export function StepState({ io }: { io: BpmnElementIO }) {
  const declared = io.state_writes ?? [];
  const writes = declaredPathsOf(declared);
  const reads = io.state_reads ?? [];
  const transitions = declared.filter(
    (w): w is StateWrite =>
      typeof w !== "string" && (w.from !== undefined || w.to !== undefined)
  );
  return (
    <div className="px-0.5">
      <div
        className="mt-2.5 flex items-center gap-3 px-0.5 font-mono text-[9px]"
        style={{ color: "var(--bpmn-text-dim)" }}
      >
        <span>
          <span style={{ color: "var(--bpmn-amber)" }}>✎</span> written by this
          step
        </span>
        <span>
          <span style={{ color: "var(--bpmn-cyan)" }}>•</span> read
        </span>
      </div>
      <Eyebrow>state at this point</Eyebrow>
      <Shape
        value={io.state}
        writes={writes}
        reads={reads}
        empty="state shape not captured yet — ask the session"
      />
      {transitions.length > 0 && (
        <>
          <Eyebrow>changed by this step</Eyebrow>
          {transitions.map((t) => (
            <div
              key={t.path}
              className="flex items-baseline gap-1.5 px-1 py-0.5 font-mono text-[10.5px]"
            >
              <span style={{ color: "var(--bpmn-amber)" }}>✎ {t.path}:</span>
              <span
                className="whitespace-pre"
                style={{ color: "var(--bpmn-text-dim)" }}
              >
                {fmtValue(t.from)}
              </span>
              <span style={{ color: "var(--bpmn-amber)" }}>→</span>
              <span
                className="whitespace-pre"
                style={{ color: "var(--bpmn-text)" }}
              >
                {fmtValue(t.to)}
              </span>
            </div>
          ))}
        </>
      )}
      {io.state === undefined && transitions.length === 0 && writes.length > 0 && (
        <>
          <Eyebrow>writes</Eyebrow>
          <div className="flex flex-wrap gap-1.5 px-1 py-1">
            {writes.map((w) => (
              <span
                key={w}
                className="rounded-sm px-1.5 py-0.5 font-mono text-[9.5px]"
                style={{
                  color: "var(--bpmn-amber)",
                  border:
                    "1px solid color-mix(in srgb, var(--bpmn-amber) 40%, transparent)",
                }}
              >
                ✎ {w}
              </span>
            ))}
          </div>
        </>
      )}
      {io.source && <Provenance source={io.source} />}
    </div>
  );
}

function Provenance({ source }: { source: string }) {
  return (
    <div
      className="mt-3 border-t px-0.5 pt-2 font-mono text-[9px]"
      style={{
        borderColor: "var(--bpmn-border-soft)",
        color: "var(--bpmn-text-dim)",
      }}
    >
      {source}
    </div>
  );
}
