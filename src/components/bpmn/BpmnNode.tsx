import type { LaidOutNode } from "./layout";
import type { BpmnElementType } from "./types";

interface Props {
  node: LaidOutNode;
  selected: boolean;
  hovered: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  onDoubleClick: () => void;
  /** PR-diff highlight: this element cites a method that was
   *  added/modified/deleted in the PR. Drives the corner marker + left
   *  accent rail. null = no decoration. */
  prChange?: 'added' | 'modified' | 'deleted' | null;
  /** Count of journey-knowledge items (docs + facts) surfaced for this
   *  element's step. Drives a 📚 bottom-LEFT marker. 0/null = no marker. */
  knowledgeCount?: number | null;
  /** Invoked when the knowledge marker is clicked — opens the knowledge panel. */
  onKnowledgeClick?: () => void;
}

// Colour tokens — all sourced from CSS variables on `.bpmn-canvas-root`.
// Kept as string literals here because SVG `fill` / `stroke` attributes
// resolve `var(...)` at render time. Using tokens (never hex) is also what
// lets the PNG export re-skin the diagram to the paper palette by simply
// redefining these variables in the exported SVG's <style>.
const VAR_SURFACE     = "var(--bpmn-surface)";
const VAR_SURFACE_HI  = "var(--bpmn-surface-hi)";
const VAR_BORDER      = "var(--bpmn-border)";
const VAR_BORDER_EM   = "var(--bpmn-border-em)";
const VAR_TEXT        = "var(--bpmn-text)";
const VAR_TEXT_MUTED  = "var(--bpmn-text-muted)";
const VAR_TEXT_DIM    = "var(--bpmn-text-dim)";
const VAR_MINT        = "var(--bpmn-mint)";
const VAR_AMBER       = "var(--bpmn-amber)";
const VAR_ROSE        = "var(--bpmn-rose)";
const VAR_CYAN        = "var(--bpmn-cyan)";
const VAR_CANVAS      = "var(--bpmn-canvas)";
const VAR_FONT_MONO   = "var(--bpmn-font-mono)";
const VAR_FONT_TITLE  = "var(--bpmn-font-title)";

const PR_COLOR: Record<NonNullable<Props['prChange']>, string> = {
  added:    VAR_MINT,
  modified: VAR_AMBER,
  deleted:  VAR_ROSE,
};
const PR_GLYPH: Record<NonNullable<Props['prChange']>, string> = {
  added:    '+',
  modified: 'Δ',
  deleted:  '−',
};

// Task-card kind metadata: the eyebrow COLOUR (the pre-attentive "what kind
// of step is this" cue that survives even when the text is too small to
// read at auto-fit) and the fallback eyebrow NAME used when the element
// carries no `actor`. Colours are drawn from the report identity —
// service→mint, user→blue-cyan, sub-journey→neutral white, missing→amber.
const KIND_META: Record<string, { color: string; name: string }> = {
  "service-task":          { color: VAR_MINT,  name: "SERVICE" },
  "user-task":             { color: VAR_CYAN,  name: "USER" },
  "call-activity":         { color: VAR_TEXT,  name: "SUBFLOW" },
  "missing-call-activity": { color: VAR_AMBER, name: "MISSING" },
};

/** Top-right corner marker on a task card. PR-changed steps get a solid
 *  colour chip with the change glyph (the protagonists of a review); every
 *  other step gets a small muted "status LED" so the corner is never empty
 *  — the ambient detail from the reference mock. */
function CornerStatus({
  node,
  prChange,
}: {
  node: LaidOutNode;
  prChange?: Props['prChange'];
}) {
  const bx = node.x + node.w / 2 - 15;
  const by = node.y - node.h / 2 + 15;
  if (prChange) {
    return (
      <g pointerEvents="none">
        <title>{`${prChange} in PR`}</title>
        <circle cx={bx} cy={by} r={8} fill={PR_COLOR[prChange]} stroke={VAR_CANVAS} strokeWidth={1.5} />
        <text
          x={bx}
          y={by + 0.5}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={10}
          fontWeight={700}
          fontFamily={VAR_FONT_MONO}
          fill={VAR_CANVAS}
        >
          {PR_GLYPH[prChange]}
        </text>
      </g>
    );
  }
  return <circle cx={bx} cy={by} r={3} fill={VAR_TEXT_DIM} opacity={0.7} pointerEvents="none" />;
}

/** 📚 marker anchored to the BOTTOM-LEFT — journey knowledge (Confluence
 *  passages + graph facts) surfaced for this element's step. Shows the item
 *  count beside the book glyph. Clickable — opens the knowledge panel. Hover
 *  tooltip names the signal. */
function KnowledgeBadge({ node, count, onClick }: { node: LaidOutNode; count: number; onClick?: () => void }) {
  const bx = node.x - node.w / 2 + 15;
  const by = node.y + node.h / 2 - 15;
  return (
    <g
      style={{ cursor: onClick ? 'pointer' : 'default' }}
      // Stop the pointerdown from starting a node drag / selection; the
      // marker is its own click target that opens the knowledge panel.
      onPointerDown={(e) => { if (onClick) e.stopPropagation(); }}
      onClick={(e) => { if (onClick) { e.stopPropagation(); onClick(); } }}
    >
      <title>{`${count} knowledge ${count === 1 ? 'item' : 'items'} (docs + decisions) — click to view`}</title>
      {/* Enlarged transparent hit target for an easier click. */}
      <circle cx={bx} cy={by} r={13} fill="transparent" />
      <circle
        cx={bx}
        cy={by}
        r={8}
        fill="color-mix(in srgb, var(--bpmn-cyan) 16%, var(--bpmn-canvas))"
        stroke={VAR_CYAN}
        strokeWidth={1.3}
      />
      <text
        x={bx}
        y={by + 0.5}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={9}
        fontWeight={700}
        fontFamily={VAR_FONT_MONO}
        fill={VAR_CYAN}
        pointerEvents="none"
      >
        {count > 9 ? '9+' : count}
      </text>
    </g>
  );
}

export function BpmnNode({
  node,
  selected,
  hovered,
  onPointerDown,
  onPointerEnter,
  onPointerLeave,
  onDoubleClick,
  prChange,
  knowledgeCount,
  onKnowledgeClick,
}: Props) {
  const cx = node.x;
  const cy = node.y;
  const selRing = selected ? <SelectionRing node={node} /> : null;
  const knowledgeBadge =
    knowledgeCount && knowledgeCount > 0
      ? <KnowledgeBadge node={node} count={knowledgeCount} onClick={onKnowledgeClick} />
      : null;

  const common = {
    onPointerDown,
    onPointerEnter,
    onPointerLeave,
    onDoubleClick,
    style: { cursor: "pointer" as const },
  };

  if (node.type === "start-event") {
    // Mint ring — transparent centre with a small solid core, so it reads
    // as a "target"/origin marker rather than a filled blob. The core keeps
    // it legible at the small sizes auto-fit produces (a thin ring alone
    // vanishes at ~0.4×).
    const r = node.w / 2;
    return (
      <g {...common}>
        {selRing}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="transparent"
          stroke={VAR_MINT}
          strokeWidth={3.5}
          style={{
            filter: hovered
              ? `drop-shadow(0 0 12px color-mix(in srgb, var(--bpmn-mint) 60%, transparent))`
              : `drop-shadow(0 0 4px color-mix(in srgb, var(--bpmn-mint) 22%, transparent))`,
            transition: "filter 140ms",
          }}
        />
        <circle cx={cx} cy={cy} r={r * 0.34} fill={VAR_MINT} />
        <NodeLabelBelow node={node} color={VAR_TEXT} weight={500} />
        {knowledgeBadge}
      </g>
    );
  }

  if (node.type === "end-event" || node.type === "error-end-event") {
    const isError = node.type === "error-end-event" || node.outcome === "error";
    const isNegative = isError || node.outcome === "deny";
    const isPositive = node.outcome === "grant" || node.outcome === "success";
    const stroke = isNegative ? VAR_ROSE : isPositive ? VAR_MINT : VAR_TEXT_MUTED;
    const r = node.w / 2;
    return (
      <g {...common}>
        {selRing}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="transparent"
          stroke={stroke}
          strokeWidth={4.5}
          style={{
            filter: hovered
              ? `drop-shadow(0 0 12px color-mix(in srgb, ${stroke} 55%, transparent))`
              : `drop-shadow(0 0 4px color-mix(in srgb, ${stroke} 20%, transparent))`,
            transition: "filter 140ms",
          }}
        />
        {isError ? (
          <g stroke={VAR_ROSE} strokeWidth={2.6} strokeLinecap="round">
            <line x1={cx - 7} y1={cy - 7} x2={cx + 7} y2={cy + 7} />
            <line x1={cx + 7} y1={cy - 7} x2={cx - 7} y2={cy + 7} />
          </g>
        ) : (
          <circle cx={cx} cy={cy} r={r * 0.32} fill={stroke} />
        )}
        <NodeLabelBelow node={node} color={VAR_TEXT} weight={500} />
        {knowledgeBadge}
      </g>
    );
  }

  if (node.type === "exclusive-gateway" || node.type === "parallel-gateway") {
    const half = node.w / 2;
    const points = `${cx},${cy - half} ${cx + half},${cy} ${cx},${cy + half} ${cx - half},${cy}`;
    const isExclusive = node.type === "exclusive-gateway";
    // Decision gateways branch the business outcome — the load-bearing
    // semantic of the diagram. Per the reference they're amber/gold
    // OUTLINED diamonds: a near-transparent amber wash (barely tints the
    // grid, but keeps the whole diamond clickable), a 2px amber stroke,
    // and an amber glyph. Amber is otherwise unused among the primary
    // shapes, so the eye is pulled to every decision without reading a
    // label. Label sits BELOW the diamond (the business question).
    return (
      <g {...common}>
        {selRing}
        <polygon
          points={points}
          fill="color-mix(in srgb, var(--bpmn-amber) 7%, transparent)"
          stroke={VAR_AMBER}
          strokeWidth={2}
          strokeLinejoin="round"
          style={{
            filter: hovered
              ? `drop-shadow(0 0 12px color-mix(in srgb, var(--bpmn-amber) 55%, transparent))`
              : `drop-shadow(0 0 4px color-mix(in srgb, var(--bpmn-amber) 22%, transparent))`,
            transition: "filter 140ms",
          }}
        />
        {isExclusive ? (
          <g stroke={VAR_AMBER} strokeWidth={2.4} strokeLinecap="round" fill="none">
            <line x1={cx - 8} y1={cy - 8} x2={cx + 8} y2={cy + 8} />
            <line x1={cx + 8} y1={cy - 8} x2={cx - 8} y2={cy + 8} />
          </g>
        ) : (
          <g stroke={VAR_AMBER} strokeWidth={2.6} strokeLinecap="round">
            <line x1={cx - 9} y1={cy} x2={cx + 9} y2={cy} />
            <line x1={cx} y1={cy - 9} x2={cx} y2={cy + 9} />
          </g>
        )}
        <NodeLabelBelow node={node} color={VAR_TEXT} weight={600} width={188} />
        {knowledgeBadge}
      </g>
    );
  }

  // service-task / user-task / call-activity / missing-call-activity
  const x = cx - node.w / 2;
  const y = cy - node.h / 2;
  const isCallActivity = node.type === "call-activity";
  const isMissing = node.type === "missing-call-activity";
  const kind = KIND_META[node.type] ?? { color: VAR_TEXT, name: "TASK" };
  const rawEyebrow = (node.actor && node.actor.trim()) || kind.name;
  const eyebrow =
    rawEyebrow.length > 28 ? rawEyebrow.slice(0, 27).trimEnd() + "…" : rawEyebrow;

  // PR-changed tasks are the protagonists of a review — a tinted surface +
  // a solid left accent rail in the status colour + the corner chip. Every
  // unchanged card stays neutral so the eye lands on the diff.
  const prAccent = prChange ? PR_COLOR[prChange] : null;
  const fill = prAccent
    ? `color-mix(in srgb, ${prAccent} ${hovered ? 14 : 10}%, ${hovered ? "var(--bpmn-surface-hi)" : "var(--bpmn-surface)"})`
    : hovered ? VAR_SURFACE_HI : VAR_SURFACE;
  const stroke = isMissing
    ? VAR_AMBER
    : prAccent
      ? `color-mix(in srgb, ${prAccent} 55%, var(--bpmn-border))`
      : (hovered ? VAR_BORDER_EM : VAR_BORDER);
  const strokeWidth = prAccent || isCallActivity || isMissing ? 1.3 : 1;
  const strokeDasharray = isMissing ? "5 4" : prChange === "deleted" ? "6 4" : undefined;
  const pad = 16;
  // Title sits below the eyebrow band and is vertically centred in the
  // remaining space — so a one-line title reads as a confident single
  // headline while a three-liner fills the card, both feeling composed.
  const titleTop = y + 32;
  const titleBottom = y + node.h - (isCallActivity ? 22 : 14);
  return (
    <g {...common}>
      {selRing}
      <rect
        x={x}
        y={y}
        width={node.w}
        height={node.h}
        rx={12}
        ry={12}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeDasharray={strokeDasharray}
        style={{
          filter: hovered
            ? "drop-shadow(0 10px 28px rgb(0 0 0 / 0.55))"
            : "drop-shadow(0 3px 12px rgb(0 0 0 / 0.42))",
          transition: "filter 160ms, fill 160ms, stroke 160ms",
        }}
      />
      {/* Status accent rail — solid rounded left edge in the PR-change
          colour. Reads pre-attentively at any zoom. */}
      {prAccent && (
        <path
          d={`M ${x + 3.5} ${y + 1}
              Q ${x + 1} ${y + 1} ${x + 1} ${y + 12}
              L ${x + 1} ${y + node.h - 12}
              Q ${x + 1} ${y + node.h - 1} ${x + 3.5} ${y + node.h - 1}
              L ${x + 4.5} ${y + node.h - 1}
              L ${x + 4.5} ${y + 1} Z`}
          fill={prAccent}
          opacity={0.95}
          pointerEvents="none"
        />
      )}
      <title>{`${rawEyebrow} · ${node.label}`}</title>
      {/* Eyebrow — the kind/actor tag. Uppercase, letterspaced mono, in the
          kind colour: this is the ambient "what kind of step" channel. */}
      <text
        x={x + pad}
        y={y + 21}
        fill={kind.color}
        fontFamily={VAR_FONT_MONO}
        fontSize={10}
        fontWeight={600}
        style={{ letterSpacing: 1.3, textTransform: "uppercase" }}
      >
        {eyebrow}
      </text>
      <CornerStatus node={node} prChange={prChange} />
      {/* Title — the focal text. Bold Space Grotesk, high contrast, never
          shrunk below 16px; vertically centred in the body. */}
      <foreignObject
        x={x + pad}
        y={titleTop}
        width={node.w - pad * 2}
        height={Math.max(18, titleBottom - titleTop)}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            height: "100%",
            color: VAR_TEXT,
            fontFamily: VAR_FONT_TITLE,
            fontSize: 16,
            lineHeight: 1.24,
            fontWeight: 600,
            letterSpacing: 0.1,
            userSelect: "none",
          }}
        >
          <span
            style={{
              display: "-webkit-box",
              WebkitBoxOrient: "vertical",
              WebkitLineClamp: 3,
              overflow: "hidden",
              textOverflow: "ellipsis",
              wordBreak: "break-word",
            }}
          >
            {node.label}
          </span>
        </div>
      </foreignObject>
      {/* Camunda-style call-activity marker — sub-process box, bottom-centre. */}
      {isCallActivity && (
        <g transform={`translate(${cx - 7} ${y + node.h - 17})`}>
          <rect width={14} height={14} rx={2} ry={2}
                fill="none" stroke={VAR_TEXT_MUTED} strokeWidth={1} />
          <line x1={7} y1={3} x2={7} y2={11} stroke={VAR_TEXT_MUTED} strokeWidth={1.2} />
          <line x1={3} y1={7} x2={11} y2={7} stroke={VAR_TEXT_MUTED} strokeWidth={1.2} />
        </g>
      )}
      {isMissing && (
        <text
          x={cx}
          y={y + node.h - 8}
          fill={VAR_AMBER}
          fontFamily={VAR_FONT_MONO}
          fontSize={9}
          textAnchor="middle"
          style={{ letterSpacing: 0.3 }}
        >
          no journey yet
        </text>
      )}
      {knowledgeBadge}
    </g>
  );
}

function SelectionRing({ node }: { node: LaidOutNode }) {
  if (node.type === "exclusive-gateway" || node.type === "parallel-gateway") {
    const half = node.w / 2 + 7;
    const cx = node.x;
    const cy = node.y;
    return (
      <polygon
        points={`${cx},${cy - half} ${cx + half},${cy} ${cx},${cy + half} ${cx - half},${cy}`}
        fill="none"
        stroke={VAR_CYAN}
        strokeWidth={1.5}
        strokeDasharray="3 3"
        strokeLinejoin="round"
        opacity={0.9}
      />
    );
  }
  if (
    node.type === "start-event" ||
    node.type === "end-event" ||
    node.type === "error-end-event"
  ) {
    return (
      <circle
        cx={node.x}
        cy={node.y}
        r={node.w / 2 + 6}
        fill="none"
        stroke={VAR_CYAN}
        strokeWidth={1.5}
        strokeDasharray="3 3"
        opacity={0.9}
      />
    );
  }
  return (
    <rect
      x={node.x - node.w / 2 - 5}
      y={node.y - node.h / 2 - 5}
      width={node.w + 10}
      height={node.h + 10}
      rx={15}
      fill="none"
      stroke={VAR_CYAN}
      strokeWidth={1.5}
      strokeDasharray="3 3"
      opacity={0.9}
    />
  );
}

/** Centred caption below events + gateways. `color`/`weight` distinguish a
 *  gateway's business question (white, semibold) from an event's terminal
 *  caption (white, regular). Width widens for gateway questions. */
function NodeLabelBelow({
  node,
  color = VAR_TEXT_MUTED,
  weight = 400,
  width = 180,
}: {
  node: LaidOutNode;
  color?: string;
  weight?: number;
  width?: number;
}) {
  return (
    <foreignObject
      x={node.x - width / 2}
      y={node.y + node.h / 2 + 9}
      width={width}
      height={52}
    >
      <div
        title={node.label}
        style={{
          color,
          fontFamily: VAR_FONT_MONO,
          fontSize: 11,
          lineHeight: 1.32,
          textAlign: "center",
          fontWeight: weight,
          letterSpacing: 0.1,
          userSelect: "none",
          display: "-webkit-box",
          WebkitBoxOrient: "vertical",
          WebkitLineClamp: 3,
          overflow: "hidden",
          wordBreak: "break-word",
        }}
      >
        {node.label}
      </div>
    </foreignObject>
  );
}
