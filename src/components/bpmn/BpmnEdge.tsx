import type { LaidOutEdge } from "./layout";
import { pointAlongPath, roundedPath } from "./layout";

interface Props {
  edge: LaidOutEdge;
  selected: boolean;
  hovered: boolean;
  /** True when SOME node is focused (hovered/selected) — the diagram is in
   *  "track a line" mode, so edges split into on-path (bright, flowing) and
   *  off-path (dim, still). */
  focusActive: boolean;
  /** True when this edge lies on the focused node's through-path (its
   *  transitive incoming + outgoing flow). */
  onPath: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}

const VAR_BORDER     = "var(--bpmn-border)";
const VAR_BORDER_EM  = "var(--bpmn-border-em)";
const VAR_TEXT_MUTED = "var(--bpmn-text-muted)";
const VAR_CYAN       = "var(--bpmn-cyan)";
const VAR_MINT       = "var(--bpmn-mint)";
const VAR_ROSE       = "var(--bpmn-rose)";
const VAR_TEXT       = "var(--bpmn-text)";
const VAR_CANVAS     = "var(--bpmn-canvas)";
const VAR_FONT_MONO  = "var(--bpmn-font-mono)";

// Dash geometry. Period (dash + gap) is 16 user units so it matches the
// bpmn-edge-flow keyframe's -16 offset step for a seamless march. Round
// caps turn the short dash into a soft capsule — the "flowing dotted"
// infographic line the founder asked for.
const DASH = "2 14";

export function BpmnEdge({
  edge,
  selected,
  hovered,
  focusActive,
  onPath,
  onPointerDown,
  onPointerEnter,
  onPointerLeave,
}: Props) {
  const d = roundedPath(edge.points, 12);

  // Edge state. Edges stay AMBIENT in colour (greys, never a loud hue) but
  // carry weight + motion. Tracking works by contrast: the focused node's
  // through-path stays bright and marching while everything else dims and
  // holds still.
  const dimmed = focusActive && !onPath && !selected && !hovered;
  const lit = selected || hovered || (focusActive && onPath);
  const stroke = selected
    ? VAR_CYAN
    : lit
      ? VAR_TEXT_MUTED
      : dimmed
        ? VAR_BORDER
        : VAR_BORDER_EM;
  const width = selected ? 7 : lit ? 6.5 : dimmed ? 5 : 5.5;
  const flowing = !dimmed;

  const mid = chipAnchor(edge.points);
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
      {/* invisible hit area — full width, always interactive (never dimmed) */}
      <path
        d={d}
        fill="none"
        stroke="transparent"
        strokeWidth={16}
        onPointerDown={onPointerDown}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        style={{ cursor: "pointer" }}
      />
      {/* The visible flow + its chip share one opacity, so off-path edges
          recede together while the tracked path stays solid. */}
      <g style={{ opacity: dimmed ? 0.22 : 1, transition: "opacity 200ms ease" }}>
        <path
          className={flowing ? "bpmn-edge-flow" : undefined}
          d={d}
          fill="none"
          stroke={stroke}
          strokeWidth={width}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={DASH}
          markerEnd={`url(#bpmn-arrow-${selected ? "sel" : lit ? "hov" : "def"})`}
          style={{ transition: "stroke 160ms, stroke-width 160ms" }}
        />
        {edge.condition && (
          <g pointerEvents="none">
            <ConditionChip x={mid.x} y={mid.y} text={edge.condition} color={labelColor} />
          </g>
        )}
      </g>
    </g>
  );
}

/** Where to sit the condition chip. Captions always hang below their
 *  shape, so the chip has to dodge whichever endpoint caption its run
 *  passes under:
 *   - Most edges (level or DOWN branches) hug the TARGET end (76% along):
 *     the source gateway's caption sits directly under the diamond where a
 *     source-biased chip would land, and a target task has no left caption
 *     while a target event's caption falls beyond the approach point.
 *   - An UP branch is the exception — the target event's caption hangs
 *     BETWEEN the two shapes, so a target-biased chip would hit it; instead
 *     hug the SOURCE end (30% along), just past the diamond's top corner.
 *  The point is then nudged perpendicular (up, or aside on a vertical run)
 *  to the open side of the wire. */
function chipAnchor(pts: { x: number; y: number }[]): { x: number; y: number } {
  const OFFSET = 12;
  const drift = pts[pts.length - 1].y - pts[0].y;
  const t = drift < -40 ? 0.3 : 0.76;
  const a = pointAlongPath(pts, Math.max(0, t - 0.04));
  const b = pointAlongPath(pts, Math.min(1, t + 0.04));
  const mid = pointAlongPath(pts, t);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  // Two unit normals; pick the one pointing up (negative y), breaking ties
  // (vertical runs) toward the left.
  let nx = -dy / len;
  let ny = dx / len;
  if (ny > 0 || (Math.abs(ny) < 1e-6 && nx > 0)) {
    nx = -nx;
    ny = -ny;
  }
  return { x: mid.x + nx * OFFSET, y: mid.y + ny * OFFSET };
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
  // Small rounded chip sitting on the wire ("Yes" / "No"). Fully opaque
  // canvas fill so the thick flowing dashes don't read through it, a
  // hairline in the condition colour, label in that colour. Verbose
  // analyzer conditions ellipsise hard at a low cap; the full clause lives
  // in the hover <title>.
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
