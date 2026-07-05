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
        {edge.condition &&
          (() => {
            // Size the chip first (it word-wraps to a height we can't know up
            // front), THEN place it: sit its NEAR edge a fixed gap off the
            // wire along the open-side normal. Offsetting by (gap + h/2) keeps
            // that clearance constant no matter how many lines the condition
            // wraps to — a tall chip never creeps back onto the wire.
            const geo = chipGeometry(edge.condition);
            const anchor = chipAnchor(edge.points);
            const GAP = 9;
            const cx = anchor.x + anchor.nx * (GAP + geo.h / 2);
            const cy = anchor.y + anchor.ny * (GAP + geo.h / 2);
            return (
              <g pointerEvents="none">
                <ConditionChip
                  cx={cx}
                  cy={cy}
                  geo={geo}
                  text={edge.condition}
                  color={labelColor}
                />
              </g>
            );
          })()}
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
function chipAnchor(pts: { x: number; y: number }[]): {
  x: number;
  y: number;
  nx: number;
  ny: number;
} {
  const drift = pts[pts.length - 1].y - pts[0].y;
  const t = drift < -40 ? 0.3 : 0.76;
  const a = pointAlongPath(pts, Math.max(0, t - 0.04));
  const b = pointAlongPath(pts, Math.min(1, t + 0.04));
  const mid = pointAlongPath(pts, t);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  // Two unit normals; pick the one pointing up (negative y), breaking ties
  // (vertical runs) toward the left. The caller offsets along this normal by
  // the chip's own half-height, so the wire point + normal are returned raw.
  let nx = -dy / len;
  let ny = dx / len;
  if (ny > 0 || (Math.abs(ny) < 1e-6 && nx > 0)) {
    nx = -nx;
    ny = -ny;
  }
  return { x: mid.x, y: mid.y, nx, ny };
}

const CHIP_MAX_W = 190; // user-space cap on chip width (~a task node's width)
const CHIP_PAD_X = 8;
const CHIP_PAD_Y = 4.5;

interface ChipGeo {
  lines: string[];
  w: number;
  h: number;
  fs: number;
  lineH: number;
}

/** Lay a condition clause out as a bounded, word-wrapped block. NEVER
 *  truncates — the font eases down a touch for longer clauses so more fits
 *  per line, and anything left wraps onto further lines. The full text is
 *  always rendered (and also mirrored into the hover <title>). */
function chipGeometry(raw: string): ChipGeo {
  const text = raw.toUpperCase().trim();
  // Ease the font for longer clauses (never below 7.5u — still legible at
  // read zoom). Short "YES"/"NO" pills keep the original 8.5u.
  const fs = text.length <= 40 ? 8.5 : text.length <= 80 ? 8 : 7.5;
  const charW = fs * 0.62; // monospace advance
  const perLine = Math.max(6, Math.floor((CHIP_MAX_W - CHIP_PAD_X * 2) / charW));

  // Greedy word wrap; a single token longer than the budget is hard-split so
  // nothing is ever dropped.
  const lines: string[] = [];
  let cur = "";
  for (let word of text.split(/\s+/).filter(Boolean)) {
    while (word.length > perLine) {
      if (cur) {
        lines.push(cur);
        cur = "";
      }
      lines.push(word.slice(0, perLine));
      word = word.slice(perLine);
    }
    if (!cur) cur = word;
    else if (cur.length + 1 + word.length <= perLine) cur += " " + word;
    else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  if (!lines.length) lines.push(text);

  const longest = lines.reduce((m, l) => Math.max(m, l.length), 1);
  const lineH = fs + 3.5;
  const w = Math.max(24, Math.min(CHIP_MAX_W, longest * charW + CHIP_PAD_X * 2));
  const h = CHIP_PAD_Y * 2 + lines.length * lineH;
  return { lines, w, h, fs, lineH };
}

function ConditionChip({
  cx,
  cy,
  geo,
  text,
  color,
}: {
  cx: number;
  cy: number;
  geo: ChipGeo;
  text: string;
  color: string;
}) {
  // Rounded chip sitting beside the wire ("YES" / "NO", or a full clause).
  // Fully opaque canvas fill so the thick flowing dashes don't read through
  // it, a hairline in the condition colour, label in that colour. Multi-line
  // clauses grow the chip's height (rendered as centred tspans); a single
  // short line keeps the pill shape.
  const { lines, w, h, fs, lineH } = geo;
  const single = lines.length === 1;
  return (
    <g transform={`translate(${cx - w / 2}, ${cy - h / 2})`}>
      <rect
        x={0}
        y={0}
        width={w}
        height={h}
        rx={single ? h / 2 : 8}
        fill={VAR_CANVAS}
        stroke={color}
        strokeWidth={1}
      />
      <text
        textAnchor="middle"
        fill={color}
        fontFamily={VAR_FONT_MONO}
        fontSize={fs}
        fontWeight={600}
        style={{ letterSpacing: 0.5 }}
      >
        {lines.map((line, i) => (
          <tspan key={i} x={w / 2} y={CHIP_PAD_Y + i * lineH + lineH / 2 + fs * 0.34}>
            {line}
          </tspan>
        ))}
      </text>
      <title>{text}</title>
    </g>
  );
}
