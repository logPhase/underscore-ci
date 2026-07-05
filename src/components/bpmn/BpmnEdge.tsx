import type { LaidOutEdge } from "./layout";
import { pointAlongPath, roundedPath } from "./layout";

interface Props {
  edge: LaidOutEdge;
  selected: boolean;
  hovered: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}

const VAR_BORDER_EM  = "var(--bpmn-border-em)";
const VAR_TEXT_DIM   = "var(--bpmn-text-dim)";
const VAR_CYAN       = "var(--bpmn-cyan)";
const VAR_MINT       = "var(--bpmn-mint)";
const VAR_ROSE       = "var(--bpmn-rose)";
const VAR_TEXT       = "var(--bpmn-text)";
const VAR_CANVAS     = "var(--bpmn-canvas)";
const VAR_FONT_MONO  = "var(--bpmn-font-mono)";

export function BpmnEdge({
  edge,
  selected,
  hovered,
  onPointerDown,
  onPointerEnter,
  onPointerLeave,
}: Props) {
  // Rounded orthogonal wire — soft elbows, per the reference. The wire is
  // ambient: a quiet mid-grey that never competes with the cards/gateways.
  // Selection escalates to cyan (the selection colour), hover lifts it
  // toward text-dim so it's clearly the picked path without shouting.
  const d = roundedPath(edge.points, 12);
  const stroke = selected ? VAR_CYAN : hovered ? VAR_TEXT_DIM : VAR_BORDER_EM;
  // Chip at the polyline midpoint — the clearest air on a rank-to-rank
  // edge. It sits past the source gateway's below-label (which hugs the
  // diamond) and short of the target's below-caption (events carry one),
  // so it collides with neither.
  const mid = pointAlongPath(edge.points, 0.5);

  const conditionPositive =
    edge.condition && /^(yes|true|grant|entry|success)$/i.test(edge.condition);
  const conditionNegative =
    edge.condition && /^(no|false|deny|reject|error|exit)$/i.test(edge.condition);
  const labelColor = conditionPositive
    ? VAR_MINT
    : conditionNegative
      ? VAR_ROSE
      : VAR_TEXT;

  return (
    <g>
      {/* invisible hit area */}
      <path
        d={d}
        fill="none"
        stroke="transparent"
        strokeWidth={14}
        onPointerDown={onPointerDown}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        style={{ cursor: "pointer" }}
      />
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={selected ? 2 : 1.6}
        strokeLinejoin="round"
        strokeLinecap="round"
        markerEnd={`url(#bpmn-arrow-${selected ? "sel" : hovered ? "hov" : "def"})`}
        style={{ transition: "stroke 140ms" }}
      />
      {edge.condition && (
        <g pointerEvents="none">
          <ConditionChip x={mid.x} y={mid.y} text={edge.condition} color={labelColor} />
        </g>
      )}
    </g>
  );
}

function ConditionChip({
  x,
  y,
  text,
  color,
}: {
  x: number;
  y: number;
  text: string;
  color: string;
}) {
  // Small rounded chip sitting on the wire ("Yes" / "No"). Filled with the
  // canvas colour so the wire doesn't show through, a hairline in the
  // condition colour, and the label in that same colour. The reference's
  // chips are tiny tags — so verbose analyzer conditions ("field missing or
  // direction unspecified") ellipsise hard at a low cap to stay compact and
  // out of neighbours' way; the full clause lives in the hover <title>.
  const padX = 7;
  const charW = 5.6;
  const MAX_CHARS = 20;
  const upper = text.toUpperCase();
  const label =
    upper.length > MAX_CHARS ? upper.slice(0, MAX_CHARS - 1).trimEnd() + "…" : upper;
  const w = Math.max(24, label.length * charW + padX * 2);
  const h = 16;
  return (
    <g transform={`translate(${x - w / 2}, ${y - h / 2})`}>
      <rect
        x={0}
        y={0}
        width={w}
        height={h}
        rx={h / 2}
        fill={VAR_CANVAS}
        stroke={color}
        strokeWidth={1}
        opacity={0.96}
      />
      <text
        x={w / 2}
        y={h / 2 + 3}
        textAnchor="middle"
        fill={color}
        fontFamily={VAR_FONT_MONO}
        fontSize={8.5}
        fontWeight={600}
        style={{ letterSpacing: 0.6 }}
      >
        {label}
      </text>
      <title>{text}</title>
    </g>
  );
}
