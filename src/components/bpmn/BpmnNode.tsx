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
   *  added/modified/deleted in the PR. Drives a corner badge.
   *  null = no decoration. */
  prChange?: 'added' | 'modified' | 'deleted' | null;
  /** Count of journey-knowledge items (docs + facts) surfaced for this
   *  element's step. Drives a 📚 bottom-LEFT marker. 0/null = no marker. */
  knowledgeCount?: number | null;
  /** Invoked when the knowledge marker is clicked — opens the knowledge panel. */
  onKnowledgeClick?: () => void;
}

// Colour tokens — all sourced from CSS variables on `.bpmn-canvas-root`.
// Kept as string literals here because SVG `fill` / `stroke` attributes
// resolve `var(...)` at render time, and the rest of the file references
// them as raw strings (consistent with how the original component was
// authored).
const VAR_BG          = "var(--bpmn-bg)";
const VAR_SURFACE     = "var(--bpmn-surface)";
const VAR_SURFACE_HI  = "var(--bpmn-surface-hi)";
const VAR_BORDER      = "var(--bpmn-border)";
const VAR_BORDER_EM   = "var(--bpmn-border-em)";
const VAR_TEXT        = "var(--bpmn-text)";
const VAR_TEXT_MUTED  = "var(--bpmn-text-muted)";
const VAR_MINT        = "var(--bpmn-mint)";
const VAR_AMBER       = "var(--bpmn-amber)";
const VAR_ROSE        = "var(--bpmn-rose)";
const VAR_CYAN        = "var(--bpmn-cyan)";
const VAR_FONT_MONO   = "var(--bpmn-font-mono)";

const PR_BADGE_FILL: Record<NonNullable<Props['prChange']>, string> = {
  added:    VAR_MINT,
  modified: VAR_AMBER,
  deleted:  VAR_ROSE,
};
const PR_BADGE_GLYPH: Record<NonNullable<Props['prChange']>, string> = {
  added:    '+',
  modified: 'Δ',
  deleted:  '−',
};

function PrChangeBadge({ node, change }: { node: LaidOutNode; change: NonNullable<Props['prChange']> }) {
  // Top-right corner of the node's bounding box. Slight offset so the
  // badge straddles the border for visibility.
  const bx = node.x + node.w / 2 - 6;
  const by = node.y - node.h / 2 + 2;
  return (
    <g pointerEvents="none">
      <title>{`${change} in PR`}</title>
      <circle
        cx={bx}
        cy={by}
        r={9}
        fill={PR_BADGE_FILL[change]}
        stroke={VAR_BG}
        strokeWidth={1.5}
      />
      <text
        x={bx}
        y={by + 1}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={11}
        fontWeight={600}
        fontFamily={VAR_FONT_MONO}
        fill={VAR_BG}
      >
        {PR_BADGE_GLYPH[change]}
      </text>
    </g>
  );
}

/** 📚 marker anchored to the BOTTOM-LEFT — journey knowledge (Confluence
 *  passages + graph facts) surfaced for this element's step. Shows the item
 *  count beside the book glyph. Clickable — opens the knowledge panel. Hover
 *  tooltip names the signal. */
function KnowledgeBadge({ node, count, onClick }: { node: LaidOutNode; count: number; onClick?: () => void }) {
  const bx = node.x - node.w / 2 + 6;
  const by = node.y + node.h / 2 - 2;
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
        r={9}
        fill="hsla(178, 75%, 14%, 0.95)"
        stroke={VAR_CYAN}
        strokeWidth={1.5}
      />
      <text
        x={bx}
        y={by + 1}
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
  const selRing = selected ? (
    <SelectionRing node={node} />
  ) : null;
  const prBadge = prChange ? <PrChangeBadge node={node} change={prChange} /> : null;
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
    // Filled mint circle with a subtle inner well, like a "play" stamp on
    // a drawing. The previous design was a hollow circle on dark — easy
    // to miss as the starting point of a diagram. A solid fill commits.
    return (
      <g {...common}>
        {selRing}
        <circle
          cx={cx}
          cy={cy}
          r={node.w / 2}
          fill={VAR_MINT}
          stroke={VAR_MINT}
          strokeWidth={2}
          style={{
            filter: hovered
              ? `drop-shadow(0 0 10px color-mix(in srgb, var(--bpmn-mint) 50%, transparent))`
              : undefined,
            transition: "filter 140ms",
          }}
        />
        <circle
          cx={cx}
          cy={cy}
          r={node.w / 2 - 6}
          fill="none"
          stroke={VAR_BG}
          strokeWidth={1.5}
          opacity={0.5}
        />
        <LabelBelow node={node} />
        {prBadge}
        {knowledgeBadge}
      </g>
    );
  }

  if (node.type === "end-event") {
    const stroke =
      node.outcome === "grant" || node.outcome === "success"
        ? VAR_MINT
        : node.outcome === "error"
          ? VAR_ROSE
          : VAR_TEXT_MUTED;
    const r = node.w / 2;
    return (
      <g {...common}>
        {selRing}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill={VAR_SURFACE}
          stroke={stroke}
          strokeWidth={4}
          style={{
            filter: hovered
              ? `drop-shadow(0 0 10px color-mix(in srgb, ${stroke} 50%, transparent))`
              : undefined,
            transition: "filter 140ms",
          }}
        />
        {/* Inner dot — provides visual weight at small zoom levels where
            the thick ring otherwise reads as just an outline. */}
        <circle
          cx={cx}
          cy={cy}
          r={r * 0.35}
          fill={stroke}
          opacity={node.outcome === "error" ? 0 : 0.85}
        />
        {node.outcome === "error" && (
          <g stroke={VAR_ROSE} strokeWidth={2.4} strokeLinecap="round">
            <line x1={cx - 7} y1={cy - 7} x2={cx + 7} y2={cy + 7} />
            <line x1={cx + 7} y1={cy - 7} x2={cx - 7} y2={cy + 7} />
          </g>
        )}
        <LabelBelow node={node} />
        {prBadge}
        {knowledgeBadge}
      </g>
    );
  }

  if (node.type === "exclusive-gateway" || node.type === "parallel-gateway") {
    const half = node.w / 2;
    const points = `${cx},${cy - half} ${cx + half},${cy} ${cx},${cy + half} ${cx - half},${cy}`;
    const isExclusive = node.type === "exclusive-gateway";
    // Decision gateways are THE load-bearing semantic of a BPMN diagram
    // — the one place where business outcomes branch. The cyan accent is
    // reserved exclusively for these (everything else is muted), so the
    // eye is automatically drawn to decision points without reading any
    // labels. This is the "pre-attentive cue" the spatial-cognition lit
    // calls out.
    return (
      <g {...common}>
        {selRing}
        <polygon
          points={points}
          fill={VAR_SURFACE}
          stroke={VAR_CYAN}
          strokeWidth={2.2}
          style={{
            filter: hovered
              ? `drop-shadow(0 0 10px color-mix(in srgb, var(--bpmn-cyan) 55%, transparent))`
              : `drop-shadow(0 0 3px color-mix(in srgb, var(--bpmn-cyan) 25%, transparent))`,
            transition: "filter 140ms",
          }}
        />
        {isExclusive ? (
          <g stroke={VAR_CYAN} strokeWidth={2.4} strokeLinecap="round" fill="none">
            <line x1={cx - 9} y1={cy - 9} x2={cx + 9} y2={cy + 9} />
            <line x1={cx + 9} y1={cy - 9} x2={cx - 9} y2={cy + 9} />
          </g>
        ) : (
          <g stroke={VAR_CYAN} strokeWidth={2.6} strokeLinecap="round">
            <line x1={cx - 10} y1={cy} x2={cx + 10} y2={cy} />
            <line x1={cx} y1={cy - 10} x2={cx} y2={cy + 10} />
          </g>
        )}
        <LabelAbove node={node} />
        {prBadge}
        {knowledgeBadge}
      </g>
    );
  }

  // service-task / user-task / call-activity / missing-call-activity
  const x = cx - node.w / 2;
  const y = cy - node.h / 2;
  const isCallActivity = node.type === "call-activity";
  const isMissing = node.type === "missing-call-activity";
  // PR-changed tasks are the protagonists of a PR review — they get a
  // tinted surface + a solid left accent bar in the status colour, not
  // just the 9px corner dot. Unchanged tasks stay neutral so the eye
  // lands on the diff without reading a single label.
  const prAccent = prChange ? PR_BADGE_FILL[prChange] : null;
  const fill = prAccent
    ? `color-mix(in srgb, ${prAccent} ${hovered ? 13 : 9}%, ${hovered ? "var(--bpmn-surface-hi)" : "var(--bpmn-surface)"})`
    : hovered ? VAR_SURFACE_HI : VAR_SURFACE;
  const stroke = isMissing
    ? VAR_AMBER
    : prAccent
      ? `color-mix(in srgb, ${prAccent} 45%, var(--bpmn-border))`
      : (hovered ? VAR_BORDER_EM : VAR_BORDER);
  const strokeWidth = prAccent ? 1.3 : isCallActivity || isMissing ? 1.4 : 1;
  const strokeDasharray = isMissing ? "4 3" : prChange === "deleted" ? "5 4" : undefined;
  return (
    <g {...common}>
      {selRing}
      {/* The card body. Subtle shadow for layering, slightly lifted on
          hover. The fill stays surface-level (no gradient) so the icon
          stamp on the left reads cleanly. */}
      <rect
        x={x}
        y={y}
        width={node.w}
        height={node.h}
        rx={8}
        ry={8}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeDasharray={strokeDasharray}
        style={{
          filter: hovered
            ? "drop-shadow(0 6px 18px rgb(0 0 0 / 0.6))"
            : "drop-shadow(0 2px 6px rgb(0 0 0 / 0.45))",
          transition: "filter 160ms, fill 160ms, stroke 160ms",
        }}
      />
      {/* Status accent bar — solid left rail in the PR-change colour.
          Reads pre-attentively at any zoom; the corner badge then gives
          the precise glyph on approach. */}
      {prAccent && (
        <path
          d={`M ${x + 3} ${y + 1.5}
              Q ${x + 1.5} ${y + 1.5} ${x + 1.5} ${y + 9.5}
              L ${x + 1.5} ${y + node.h - 9.5}
              Q ${x + 1.5} ${y + node.h - 1.5} ${x + 3} ${y + node.h - 1.5}
              L ${x + 4.5} ${y + node.h - 1.5}
              L ${x + 4.5} ${y + 1.5} Z`}
          fill={prAccent}
          opacity={0.95}
          pointerEvents="none"
        />
      )}
      {/* Type stamp — small inline glyph in the top-left corner.
          The previous design carved out a 36px gutter on the left
          with a divider line, but on long business-task labels that
          gutter ate the chars per line that pushed labels over the
          line-clamp. The glyph is now a top-left badge and the label
          uses the full width below it. */}
      <TaskTypeIcon type={node.type} x={x + 12} y={y + 11} />
      {/* Actor label — top-right, small caps, monospace. Acts as a
          section tag ("BARRIER-MATCHER") in the engineering-drawing
          metaphor. Lives in the same horizontal band as the icon. */}
      {node.actor && (
        <text
          x={x + node.w - 12}
          y={y + 18}
          fill={VAR_TEXT_MUTED}
          fontFamily={VAR_FONT_MONO}
          fontSize={9}
          fontWeight={500}
          textAnchor="end"
          style={{ letterSpacing: 0.6, textTransform: "uppercase" }}
        >
          {node.actor}
        </text>
      )}
      {/* Label — sits below the icon/actor band, uses the full inner
          width of the card. 4-line clamp at 11.5px / 1.4 line-height
          comfortably fits ~5 lines of typical business-task copy
          before truncating; coupled with the wider 240px box, real
          labels rarely hit the clamp now. */}
      <foreignObject
        x={x + 14}
        y={y + 32}
        width={node.w - 28}
        height={node.h - 42}
      >
        <div
          style={{
            color: VAR_TEXT,
            fontFamily: VAR_FONT_MONO,
            fontSize: 11.5,
            lineHeight: 1.4,
            fontWeight: 400,
            display: "-webkit-box",
            WebkitBoxOrient: "vertical",
            WebkitLineClamp: 4,
            overflow: "hidden",
            textOverflow: "ellipsis",
            wordBreak: "break-word",
            userSelect: "none",
          }}
        >
          {node.label}
        </div>
      </foreignObject>
      {/* Camunda-style call-activity marker — sub-process box. */}
      {isCallActivity && (
        <g transform={`translate(${cx - 7} ${y + node.h - 14})`}>
          <rect width={14} height={14} rx={2} ry={2}
                fill="none" stroke={VAR_TEXT_MUTED} strokeWidth={1} />
          <line x1={7} y1={3} x2={7} y2={11} stroke={VAR_TEXT_MUTED} strokeWidth={1.2} />
          <line x1={3} y1={7} x2={11} y2={7} stroke={VAR_TEXT_MUTED} strokeWidth={1.2} />
        </g>
      )}
      {isMissing && (
        <text
          x={cx}
          y={y + node.h - 5}
          fill={VAR_AMBER}
          fontFamily={VAR_FONT_MONO}
          fontSize={9}
          textAnchor="middle"
          style={{ letterSpacing: 0.3 }}
        >
          no journey yet
        </text>
      )}
      {prBadge}
      {knowledgeBadge}
    </g>
  );
}

function SelectionRing({ node }: { node: LaidOutNode }) {
  if (node.type === "exclusive-gateway" || node.type === "parallel-gateway") {
    const half = node.w / 2 + 6;
    const cx = node.x;
    const cy = node.y;
    return (
      <polygon
        points={`${cx},${cy - half} ${cx + half},${cy} ${cx},${cy + half} ${cx - half},${cy}`}
        fill="none"
        stroke={VAR_CYAN}
        strokeWidth={1.5}
        strokeDasharray="3 3"
        opacity={0.9}
      />
    );
  }
  if (node.type === "start-event" || node.type === "end-event") {
    return (
      <circle
        cx={node.x}
        cy={node.y}
        r={node.w / 2 + 5}
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
      rx={11}
      fill="none"
      stroke={VAR_CYAN}
      strokeWidth={1.5}
      strokeDasharray="3 3"
      opacity={0.9}
    />
  );
}

function LabelBelow({ node }: { node: LaidOutNode }) {
  return (
    <foreignObject
      x={node.x - 90}
      y={node.y + node.h / 2 + 10}
      width={180}
      height={42}
    >
      <div
        style={{
          color: VAR_TEXT_MUTED,
          fontFamily: VAR_FONT_MONO,
          fontSize: 11,
          lineHeight: 1.35,
          textAlign: "center",
          fontWeight: 400,
          letterSpacing: 0.1,
          userSelect: "none",
        }}
      >
        {node.label}
      </div>
    </foreignObject>
  );
}

function LabelAbove({ node }: { node: LaidOutNode }) {
  // Gateway labels are business questions ("Vehicle has valid parking
  // authorization?") — the most semantically loaded text on a BPMN
  // diagram. Bumped width slightly and lifted weight to 500 so the
  // question reads above the surrounding task labels.
  const W = 260;
  const H = 52;
  return (
    <foreignObject
      x={node.x - W / 2}
      y={node.y - node.h / 2 - H - 6}
      width={W}
      height={H}
    >
      <div
        style={{
          color: VAR_TEXT,
          fontFamily: VAR_FONT_MONO,
          fontSize: 11.5,
          lineHeight: 1.3,
          fontWeight: 500,
          textAlign: "center",
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

function TaskTypeIcon({
  type,
  x,
  y,
}: {
  type: BpmnElementType;
  x: number;
  y: number;
}) {
  if (type === "call-activity" || type === "missing-call-activity") return null;
  if (type === "user-task") {
    // Person glyph — slightly bolder than before so it reads at the new
    // icon-column position.
    return (
      <g
        transform={`translate(${x},${y})`}
        fill="none"
        stroke={VAR_TEXT_MUTED}
        strokeWidth={1.3}
      >
        <circle cx={7} cy={5} r={2.8} />
        <path d="M1.5 14 C 2.5 10, 11.5 10, 12.5 14" />
      </g>
    );
  }
  // service-task gear
  return (
    <g
      transform={`translate(${x},${y})`}
      fill="none"
      stroke={VAR_TEXT_MUTED}
      strokeWidth={1.2}
    >
      <circle cx={7} cy={7} r={2.5} />
      <g strokeLinecap="round">
        <line x1={7} y1={0.5} x2={7} y2={2.5} />
        <line x1={7} y1={11.5} x2={7} y2={13.5} />
        <line x1={0.5} y1={7} x2={2.5} y2={7} />
        <line x1={11.5} y1={7} x2={13.5} y2={7} />
        <line x1={2.4} y1={2.4} x2={3.8} y2={3.8} />
        <line x1={10.2} y1={10.2} x2={11.6} y2={11.6} />
        <line x1={11.6} y1={2.4} x2={10.2} y2={3.8} />
        <line x1={3.8} y1={10.2} x2={2.4} y2={11.6} />
      </g>
    </g>
  );
}
