import type { LaidOutEdge } from "./layout";
import { pointAlongPath, pointsToPath } from "./layout";

interface Props {
  edge: LaidOutEdge;
  selected: boolean;
  hovered: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}

const VAR_BORDER     = "var(--bpmn-border)";
const VAR_BORDER_EM  = "var(--bpmn-border-em)";
const VAR_CYAN       = "var(--bpmn-cyan)";
const VAR_MINT       = "var(--bpmn-mint)";
const VAR_ROSE       = "var(--bpmn-rose)";
const VAR_TEXT       = "var(--bpmn-text)";
const VAR_TEXT_MUTED = "var(--bpmn-text-muted)";
const VAR_SURFACE    = "var(--bpmn-surface)";
const VAR_FONT_MONO  = "var(--bpmn-font-mono)";

export function BpmnEdge({
  edge,
  selected,
  hovered,
  onPointerDown,
  onPointerEnter,
  onPointerLeave,
}: Props) {
  const d = pointsToPath(edge.points);
  // Default lines stay subtle (this is a wiring diagram — paths shouldn't
  // compete with the boxes for attention). Selection escalates to cyan,
  // matching the gateway accent so the highlight feels intentional.
  const stroke = selected ? VAR_CYAN : hovered ? VAR_BORDER_EM : VAR_BORDER;
  // Bias the label position toward the source (35% along the polyline)
  // so condition pills sit in clear air rather than on top of the target
  // node — the most common cause of the "WAITING PRESENCE FOUND — PAIR
  // MATCHED pill is welded to the gateway diamond" complaint.
  const mid = pointAlongPath(edge.points, 0.35);

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
        strokeWidth={selected ? 1.8 : 1.1}
        markerEnd={`url(#bpmn-arrow-${selected ? "sel" : hovered ? "hov" : "def"})`}
        style={{ transition: "stroke 140ms" }}
      />
      {edge.condition && (
        <g pointerEvents="none">
          <ConditionLabel x={mid.x} y={mid.y} text={edge.condition} color={labelColor} />
        </g>
      )}
    </g>
  );
}

function ConditionLabel({
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
  // Pill is slightly larger + uses uppercase + letter-spacing for a
  // "stamped on the wire" feel rather than a generic chat-bubble.
  const padX = 8;
  const charW = 6.5;
  const label = text.toUpperCase();
  const w = Math.max(28, label.length * charW + padX * 2);
  const h = 18;
  return (
    <g transform={`translate(${x - w / 2}, ${y - h / 2})`}>
      <rect
        x={0}
        y={0}
        width={w}
        height={h}
        rx={2}
        fill={VAR_SURFACE}
        stroke={color}
        strokeWidth={1}
        opacity={0.95}
      />
      <text
        x={w / 2}
        y={h / 2 + 3.5}
        textAnchor="middle"
        fill={color}
        fontFamily={VAR_FONT_MONO}
        fontSize={9.5}
        fontWeight={500}
        style={{ letterSpacing: 0.8 }}
      >
        {label}
      </text>
      <title>{text}</title>
      <desc style={{ display: "none" }}>{VAR_TEXT_MUTED}</desc>
    </g>
  );
}
