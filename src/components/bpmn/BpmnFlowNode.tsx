import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { LaidOutNode } from "./layout";

export type BpmnNodeData = {
  el: LaidOutNode;
  prChange: "added" | "modified" | "deleted" | null;
  knowledgeCount: number;
  onKnowledge: (id: string) => void;
};

const PR_COLOR = {
  added: "var(--bpmn-mint)",
  modified: "var(--bpmn-amber)",
  deleted: "var(--bpmn-rose)",
} as const;
const PR_GLYPH = { added: "+", modified: "Δ", deleted: "−" } as const;

const KIND_META: Record<string, { color: string; name: string }> = {
  "service-task": { color: "var(--bpmn-mint)", name: "SERVICE" },
  "user-task": { color: "var(--bpmn-cyan)", name: "USER" },
  "call-activity": { color: "var(--bpmn-text)", name: "SUBFLOW" },
  "missing-call-activity": { color: "var(--bpmn-amber)", name: "MISSING" },
};

// Invisible connection points — edges attach here; the layout already routes
// left→right, so target on the left, source on the right.
const HANDLE_STYLE: React.CSSProperties = {
  opacity: 0,
  width: 1,
  height: 1,
  minWidth: 1,
  minHeight: 1,
  border: "none",
  background: "transparent",
};

function Handles() {
  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        style={HANDLE_STYLE}
        isConnectable={false}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={HANDLE_STYLE}
        isConnectable={false}
      />
    </>
  );
}

/** Caption below events + gateways (the terminal outcome / the business
 *  question). Overflows the node box downward. */
function LabelBelow({
  label,
  weight,
  width,
}: {
  label: string;
  weight: number;
  width: number;
}) {
  return (
    <div
      title={label}
      style={{
        position: "absolute",
        top: "calc(100% + 8px)",
        left: "50%",
        transform: "translateX(-50%)",
        width,
        textAlign: "center",
        color: "var(--bpmn-text)",
        fontFamily: "var(--bpmn-font-mono)",
        fontSize: 11,
        lineHeight: 1.32,
        fontWeight: weight,
        letterSpacing: 0.1,
        userSelect: "none",
        display: "-webkit-box",
        WebkitBoxOrient: "vertical",
        WebkitLineClamp: 3,
        overflow: "hidden",
        wordBreak: "break-word",
        pointerEvents: "none",
      }}
    >
      {label}
    </div>
  );
}

function KnowledgeBadge({
  count,
  onClick,
}: {
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      title={`${count} knowledge ${count === 1 ? "item" : "items"} — click to view`}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="nodrag"
      style={{
        position: "absolute",
        left: 6,
        bottom: 6,
        width: 18,
        height: 18,
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 9,
        fontWeight: 700,
        fontFamily: "var(--bpmn-font-mono)",
        color: "var(--bpmn-cyan)",
        background:
          "color-mix(in srgb, var(--bpmn-cyan) 16%, var(--bpmn-canvas))",
        border: "1.3px solid var(--bpmn-cyan)",
        cursor: "pointer",
        padding: 0,
      }}
    >
      {count > 9 ? "9+" : count}
    </button>
  );
}

function BpmnFlowNodeInner({ data, selected }: NodeProps) {
  const { el, prChange, knowledgeCount, onKnowledge } =
    data as unknown as BpmnNodeData;
  const { type, w, h, label } = el;
  const selRing = selected
    ? "0 0 0 2px var(--bpmn-canvas), 0 0 0 4px color-mix(in srgb, var(--bpmn-cyan) 85%, transparent)"
    : undefined;
  const badge =
    knowledgeCount > 0 ? (
      <KnowledgeBadge
        count={knowledgeCount}
        onClick={() => onKnowledge(el.id)}
      />
    ) : null;

  // ── events ──
  if (
    type === "start-event" ||
    type === "end-event" ||
    type === "error-end-event"
  ) {
    const isStart = type === "start-event";
    const isError = type === "error-end-event" || el.outcome === "error";
    const isNeg = isError || el.outcome === "deny";
    const isPos = el.outcome === "grant" || el.outcome === "success";
    const stroke = isStart
      ? "var(--bpmn-mint)"
      : isNeg
        ? "var(--bpmn-rose)"
        : isPos
          ? "var(--bpmn-mint)"
          : "var(--bpmn-text-muted)";
    return (
      <div style={{ width: w, height: h, position: "relative" }}>
        <Handles />
        <div
          style={{
            width: w,
            height: h,
            borderRadius: "50%",
            border: `${isStart ? 3.5 : 4.5}px solid ${stroke}`,
            boxShadow: selRing,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "transparent",
          }}
        >
          {isError ? (
            <span
              style={{
                color: "var(--bpmn-rose)",
                fontSize: h * 0.4,
                lineHeight: 1,
              }}
            >
              ✕
            </span>
          ) : (
            <div
              style={{
                width: w * 0.34,
                height: w * 0.34,
                borderRadius: "50%",
                background: stroke,
              }}
            />
          )}
        </div>
        <LabelBelow label={label} weight={500} width={180} />
        {badge}
      </div>
    );
  }

  // ── gateways (diamond) ──
  if (type === "exclusive-gateway" || type === "parallel-gateway") {
    const isExclusive = type === "exclusive-gateway";
    return (
      <div style={{ width: w, height: h, position: "relative" }}>
        <Handles />
        <div
          style={{
            width: w,
            height: h,
            transform: "rotate(45deg)",
            borderRadius: 8,
            border: "2px solid var(--bpmn-amber)",
            background: "color-mix(in srgb, var(--bpmn-amber) 7%, transparent)",
            boxShadow: selected
              ? "0 0 0 4px color-mix(in srgb, var(--bpmn-cyan) 40%, transparent)"
              : undefined,
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--bpmn-amber)",
            fontSize: 18,
            fontWeight: 700,
            pointerEvents: "none",
          }}
        >
          {isExclusive ? "×" : "+"}
        </div>
        <LabelBelow label={label} weight={600} width={188} />
        {badge}
      </div>
    );
  }

  // ── task / user-task / call-activity / missing-call-activity ──
  const isCall = type === "call-activity";
  const isMissing = type === "missing-call-activity";
  const kind = KIND_META[type] ?? { color: "var(--bpmn-text)", name: "TASK" };
  const rawEyebrow = (el.actor && el.actor.trim()) || kind.name;
  const eyebrow =
    rawEyebrow.length > 28
      ? rawEyebrow.slice(0, 27).trimEnd() + "…"
      : rawEyebrow;
  const prAccent = prChange ? PR_COLOR[prChange] : null;
  const fill = prAccent
    ? `color-mix(in srgb, ${prAccent} 10%, var(--bpmn-surface))`
    : "var(--bpmn-surface)";
  const border = isMissing
    ? "var(--bpmn-amber)"
    : prAccent
      ? `color-mix(in srgb, ${prAccent} 55%, var(--bpmn-border))`
      : "var(--bpmn-border)";
  const dash = isMissing ? "5 4" : prChange === "deleted" ? "6 4" : undefined;

  return (
    <div
      style={{
        width: w,
        height: h,
        position: "relative",
        borderRadius: 12,
        background: fill,
        border: `${prAccent || isCall || isMissing ? 1.3 : 1}px ${dash ? "dashed" : "solid"} ${border}`,
        boxShadow: selRing ?? "0 3px 12px rgb(0 0 0 / 0.42)",
        overflow: "hidden",
        boxSizing: "border-box",
      }}
      title={`${rawEyebrow} · ${label}`}
    >
      <Handles />
      {prAccent && (
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 4,
            background: prAccent,
            borderTopLeftRadius: 12,
            borderBottomLeftRadius: 12,
          }}
        />
      )}
      <div
        style={{
          padding: "12px 16px",
          height: "100%",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            color: kind.color,
            fontFamily: "var(--bpmn-font-mono)",
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: 1.3,
            textTransform: "uppercase",
          }}
        >
          {eyebrow}
        </div>
        <div
          style={{
            marginTop: 6,
            color: "var(--bpmn-text)",
            fontFamily: "var(--bpmn-font-title)",
            fontSize: 16,
            lineHeight: 1.24,
            fontWeight: 600,
            display: "-webkit-box",
            WebkitBoxOrient: "vertical",
            WebkitLineClamp: 3,
            overflow: "hidden",
            wordBreak: "break-word",
          }}
        >
          {label}
        </div>
      </div>
      {/* corner PR chip / LED */}
      <div
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          width: prChange ? 16 : 6,
          height: prChange ? 16 : 6,
          borderRadius: "50%",
          background: prChange ? PR_COLOR[prChange] : "var(--bpmn-text-dim)",
          color: "var(--bpmn-canvas)",
          fontSize: 10,
          fontWeight: 700,
          fontFamily: "var(--bpmn-font-mono)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: prChange ? "1.5px solid var(--bpmn-canvas)" : undefined,
          opacity: prChange ? 1 : 0.7,
        }}
      >
        {prChange ? PR_GLYPH[prChange] : ""}
      </div>
      {isMissing && (
        <div
          style={{
            position: "absolute",
            bottom: 6,
            left: 0,
            right: 0,
            textAlign: "center",
            color: "var(--bpmn-amber)",
            fontFamily: "var(--bpmn-font-mono)",
            fontSize: 9,
          }}
        >
          no journey yet
        </div>
      )}
      {badge}
    </div>
  );
}

export const BpmnFlowNode = memo(BpmnFlowNodeInner);
