// SVG → PNG export for the BPMN canvas. Engineering-drawing aesthetic:
// cream paper background, dark ink, generous margins, and a title block
// in the bottom-right corner with PR metadata so the exported file
// stands on its own as an artifact (not a screenshot of a chat).
//
// The live diagram is dark-themed via CSS variables on
// `.bpmn-canvas-root`. We don't recolour each cloned element — instead
// the standalone SVG gets an injected <style> block that redefines the
// same variables to paper-palette values. CSS vars resolve within the
// SVG document scope when rendered via <img src="data:image/svg+xml...">,
// so the cloned content automatically picks up the new palette.
//
// Bounding-box discipline: parent getBBox() under-counts foreignObject
// overflow (multi-line labels can exceed their allocated height). We
// walk every descendant and union per-element boxes, plus probe
// foreignObject scrollHeight, so labels at the paper edges aren't
// clipped.

const PADDING_TOP = 60;
const PADDING_SIDE = 80;
const PADDING_BOTTOM_BASE = 60;
const TITLE_BLOCK_W = 380;
const TITLE_BLOCK_H = 160;
const TITLE_BLOCK_GAP = 28; // gap between content and title block
const SCALE = 2; // 2× DPR for crisp text at Retina + Slack thumbnail sizes

// Paper palette — used inside the standalone SVG only. Built to read
// like an engineering-vellum print: warm cream stock, ink-dark text,
// muted accents that still carry the same semantic meaning as the
// dark-theme palette (mint = added, cyan = decision, etc.).
const PAPER_PALETTE = `
  --bpmn-bg:           #fbf8f1;
  --bpmn-bg-deep:      #f5f0e3;
  --bpmn-surface:      #ffffff;
  --bpmn-surface-hi:   #fffdf8;
  --bpmn-surface-soft: #fbf8f1;
  --bpmn-border:       #b5ad9c;
  --bpmn-border-em:    #6b6354;
  --bpmn-border-soft:  #e0d7c3;
  --bpmn-text:         #1d1a13;
  --bpmn-text-muted:   #5a5346;
  --bpmn-text-dim:     #8a8270;
  --bpmn-mint:         #2f8b6b;
  --bpmn-amber:        #b07c2a;
  --bpmn-rose:         #b04047;
  --bpmn-cyan:         #1a6c8f;
  --bpmn-paper:        #fbf8f1;
  --bpmn-paper-edge:   #e6e0d2;
`;

export interface ExportOptions {
  filename: string;
  /** Title-block content. All fields optional — the block adapts to
   *  what's provided. If `journeyTitle` is missing, the block is
   *  rendered without it but still shows tool/date so the artifact is
   *  identifiable. */
  titleBlock?: {
    journeyTitle?: string;
    prId?: string;
    baseSha?: string;
    headSha?: string;
    generatedAt?: Date;
  };
}

export async function exportBpmnSvgAsPng(
  liveSvg: SVGSVGElement,
  opts: ExportOptions,
): Promise<void> {
  const standalone = buildStandaloneSvg(liveSvg, opts.titleBlock);
  if (!standalone) throw new Error('BPMN canvas has no content to export');

  const { svgString, width, height } = standalone;
  const blob = await rasterize(svgString, width, height);
  triggerDownload(blob, opts.filename);
}

interface Standalone {
  svgString: string;
  width: number;
  height: number;
}

function buildStandaloneSvg(
  liveSvg: SVGSVGElement,
  titleBlock?: ExportOptions['titleBlock'],
): Standalone | null {
  const innerG = findContentGroup(liveSvg);
  if (!innerG) return null;

  const bbox = unionDescendantBBox(innerG);
  if (!bbox || bbox.width === 0 || bbox.height === 0) return null;

  // The diagram occupies a content box; the title block adds height
  // below. Width is max(content, titleBlockMin).
  const hasTitle = !!titleBlock && Object.values(titleBlock).some(Boolean);
  const titleH = hasTitle ? TITLE_BLOCK_H + TITLE_BLOCK_GAP : 0;
  const contentW = bbox.width;
  const contentH = bbox.height;
  // Title block sits in the bottom-right corner with the same side
  // padding as the content. Ensure the paper is wide enough that the
  // block doesn't overlap or fall off-edge.
  const minContentW = TITLE_BLOCK_W + 40;
  const width = Math.ceil(Math.max(contentW, minContentW) + PADDING_SIDE * 2);
  const height = Math.ceil(contentH + PADDING_TOP + PADDING_BOTTOM_BASE + titleH);
  // viewBox origin: the inner content's natural (x,y), offset so the
  // diagram lands at PADDING_TOP from the top and centred horizontally
  // when the paper is wider than the content.
  const contentOffsetX = (width - contentW) / 2 - bbox.x;
  const contentOffsetY = PADDING_TOP - bbox.y;

  const contentClone = innerG.cloneNode(true) as SVGGElement;
  contentClone.setAttribute('transform', `translate(${contentOffsetX}, ${contentOffsetY})`);

  const defsClone = cloneDefsExcludingDotGrid(liveSvg);

  const xmlns = 'http://www.w3.org/2000/svg';
  const out = document.createElementNS(xmlns, 'svg');
  out.setAttribute('xmlns', xmlns);
  out.setAttribute('width', String(width));
  out.setAttribute('height', String(height));
  out.setAttribute('viewBox', `0 0 ${width} ${height}`);
  // No font-family attr on the outer svg — let the cloned content's
  // var(--bpmn-font-mono) resolve through the injected <style>.

  // Inject the paper palette + Google Fonts import. The fonts are
  // small enough that requesting them in the data-URL SVG is fine for
  // a one-shot rasterisation; users with no network connection will
  // still get a valid PNG, just with system-fallback fonts.
  const style = document.createElementNS(xmlns, 'style');
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600&family=Fraunces:opsz,wght,SOFT,WONK@9..144,300..600,30..100,0..1&display=swap');
    :root { ${PAPER_PALETTE} }
    svg { ${PAPER_PALETTE} }
    text { font-family: 'IBM Plex Mono', ui-monospace, monospace; }
  `;
  out.appendChild(style);

  // Paper background — single warm-cream rect covers the whole sheet.
  const bg = document.createElementNS(xmlns, 'rect');
  bg.setAttribute('x', '0');
  bg.setAttribute('y', '0');
  bg.setAttribute('width', String(width));
  bg.setAttribute('height', String(height));
  bg.setAttribute('fill', '#fbf8f1');
  out.appendChild(bg);

  // Optional: a single thin border inside the paper edge, ~12px in.
  // Gives the export a "sheet of paper" frame without being a heavy
  // rectangle. Engineering drawings always have a frame.
  const frame = document.createElementNS(xmlns, 'rect');
  frame.setAttribute('x', '14');
  frame.setAttribute('y', '14');
  frame.setAttribute('width', String(width - 28));
  frame.setAttribute('height', String(height - 28));
  frame.setAttribute('fill', 'none');
  frame.setAttribute('stroke', '#e6e0d2');
  frame.setAttribute('stroke-width', '1');
  out.appendChild(frame);

  if (defsClone) out.appendChild(defsClone);
  out.appendChild(contentClone);

  if (hasTitle) {
    appendTitleBlock(out, {
      x: width - PADDING_SIDE - TITLE_BLOCK_W,
      y: PADDING_TOP + contentH + TITLE_BLOCK_GAP,
      titleBlock: titleBlock!,
    });
  }

  const svgString = new XMLSerializer().serializeToString(out);
  return { svgString, width, height };
}

interface TitleBlockPlacement {
  x: number;
  y: number;
  titleBlock: NonNullable<ExportOptions['titleBlock']>;
}

function appendTitleBlock(svg: SVGElement, p: TitleBlockPlacement): void {
  const xmlns = 'http://www.w3.org/2000/svg';
  const g = document.createElementNS(xmlns, 'g');
  g.setAttribute('transform', `translate(${p.x}, ${p.y})`);

  // Title block frame — engineering-drawing convention.
  const box = document.createElementNS(xmlns, 'rect');
  box.setAttribute('x', '0');
  box.setAttribute('y', '0');
  box.setAttribute('width', String(TITLE_BLOCK_W));
  box.setAttribute('height', String(TITLE_BLOCK_H));
  box.setAttribute('fill', 'none');
  box.setAttribute('stroke', '#6b6354');
  box.setAttribute('stroke-width', '1');
  g.appendChild(box);

  // Inner header band — sits at the top of the block holding the
  // "JOURNEY" label.
  const headerBand = document.createElementNS(xmlns, 'line');
  headerBand.setAttribute('x1', '0');
  headerBand.setAttribute('y1', '20');
  headerBand.setAttribute('x2', String(TITLE_BLOCK_W));
  headerBand.setAttribute('y2', '20');
  headerBand.setAttribute('stroke', '#b5ad9c');
  headerBand.setAttribute('stroke-width', '0.5');
  g.appendChild(headerBand);

  // "JOURNEY" caption.
  const journeyCaption = document.createElementNS(xmlns, 'text');
  journeyCaption.setAttribute('x', '14');
  journeyCaption.setAttribute('y', '14');
  journeyCaption.setAttribute('font-family', "'IBM Plex Mono', ui-monospace, monospace");
  journeyCaption.setAttribute('font-size', '9');
  journeyCaption.setAttribute('font-weight', '500');
  journeyCaption.setAttribute('letter-spacing', '2');
  journeyCaption.setAttribute('fill', '#5a5346');
  journeyCaption.textContent = 'JOURNEY';
  g.appendChild(journeyCaption);

  // Title — Fraunces italic, the one place in the artifact where the
  // serif appears. Wraps to 2 lines if needed via multiple tspans
  // (simple length-based wrap; for long titles, ellipsises).
  if (p.titleBlock.journeyTitle) {
    const title = document.createElementNS(xmlns, 'text');
    title.setAttribute('x', '14');
    title.setAttribute('y', '44');
    title.setAttribute('font-family', "'Fraunces', ui-serif, serif");
    title.setAttribute('font-size', '15');
    title.setAttribute('font-weight', '400');
    title.setAttribute('font-style', 'italic');
    title.setAttribute('fill', '#1d1a13');

    // Manual wrap at ~38 chars per line, max 2 lines.
    const text = p.titleBlock.journeyTitle;
    const lines = wrapText(text, 38, 2);
    for (let i = 0; i < lines.length; i++) {
      const tspan = document.createElementNS(xmlns, 'tspan');
      tspan.setAttribute('x', '14');
      tspan.setAttribute('dy', i === 0 ? '0' : '20');
      tspan.textContent = lines[i];
      title.appendChild(tspan);
    }
    g.appendChild(title);
  }

  // Separator before metadata block.
  const sep = document.createElementNS(xmlns, 'line');
  sep.setAttribute('x1', '14');
  sep.setAttribute('y1', '90');
  sep.setAttribute('x2', String(TITLE_BLOCK_W - 14));
  sep.setAttribute('y2', '90');
  sep.setAttribute('stroke', '#b5ad9c');
  sep.setAttribute('stroke-width', '0.5');
  g.appendChild(sep);

  // Metadata rows — label · value, monospaced.
  const rows = buildTitleBlockRows(p.titleBlock);
  for (let i = 0; i < rows.length; i++) {
    const [label, value] = rows[i];
    const rowY = 108 + i * 13;

    const lbl = document.createElementNS(xmlns, 'text');
    lbl.setAttribute('x', '14');
    lbl.setAttribute('y', String(rowY));
    lbl.setAttribute('font-family', "'IBM Plex Mono', ui-monospace, monospace");
    lbl.setAttribute('font-size', '9');
    lbl.setAttribute('font-weight', '500');
    lbl.setAttribute('letter-spacing', '1.5');
    lbl.setAttribute('fill', '#8a8270');
    lbl.textContent = label;
    g.appendChild(lbl);

    const val = document.createElementNS(xmlns, 'text');
    val.setAttribute('x', '90');
    val.setAttribute('y', String(rowY));
    val.setAttribute('font-family', "'IBM Plex Mono', ui-monospace, monospace");
    val.setAttribute('font-size', '10');
    val.setAttribute('font-weight', '400');
    val.setAttribute('fill', '#1d1a13');
    val.textContent = value;
    g.appendChild(val);
  }

  svg.appendChild(g);
}

function buildTitleBlockRows(
  tb: NonNullable<ExportOptions['titleBlock']>,
): Array<[string, string]> {
  const rows: Array<[string, string]> = [];
  if (tb.prId) rows.push(['PR', tb.prId]);
  if (tb.baseSha) rows.push(['BASE', shortenSha(tb.baseSha)]);
  if (tb.headSha) rows.push(['HEAD', shortenSha(tb.headSha)]);
  rows.push(['GENERATED', formatDate(tb.generatedAt ?? new Date())]);
  rows.push(['TOOL', 'underscore · logphase']);
  return rows;
}

function shortenSha(sha: string): string {
  return sha.length >= 8 ? sha.slice(0, 8) : sha;
}

function formatDate(d: Date): string {
  // ISO-ish but human-friendly: 2026-05-26 18:18
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    const candidate = current ? `${current} ${w}` : w;
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = w;
      if (lines.length >= maxLines) {
        // Re-tack the remainder of the words onto the last line and
        // ellipsise.
        const remainder = [w, ...words.slice(words.indexOf(w) + 1)].join(' ');
        const last = lines[maxLines - 1];
        lines[maxLines - 1] = ellipsise(`${last} ${remainder}`, maxChars);
        return lines.slice(0, maxLines);
      }
    }
  }
  if (current) lines.push(current);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = ellipsise(lines[maxLines - 1], maxChars);
  }
  return lines;
}

function ellipsise(s: string, maxChars: number): string {
  if (s.length <= maxChars) return s;
  return s.slice(0, maxChars - 1).trimEnd() + '…';
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

function unionDescendantBBox(root: SVGGraphicsElement): Box | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const descendants = root.querySelectorAll<SVGGraphicsElement>('*');
  for (const el of Array.from(descendants)) {
    if (typeof (el as SVGGraphicsElement).getBBox !== 'function') continue;
    let box: Box | null = null;
    try {
      const b = el.getBBox();
      if (b.width !== 0 || b.height !== 0) {
        box = { x: b.x, y: b.y, width: b.width, height: b.height };
      }
    } catch {
      // <defs> children + similar can throw; skip.
    }
    if (el.tagName === 'foreignObject') {
      const inner = el.firstElementChild as HTMLElement | null;
      if (inner) {
        const overflow = measureForeignObjectOverflow(el, inner);
        if (overflow && box) {
          box = unionBox(box, overflow);
        } else if (overflow) {
          box = overflow;
        }
      }
    }
    if (!box) continue;
    if (box.x < minX) minX = box.x;
    if (box.y < minY) minY = box.y;
    if (box.x + box.width > maxX) maxX = box.x + box.width;
    if (box.y + box.height > maxY) maxY = box.y + box.height;
  }
  if (!Number.isFinite(minX)) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function unionBox(a: Box, b: Box): Box {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const r = Math.max(a.x + a.width, b.x + b.width);
  const bo = Math.max(a.y + a.height, b.y + b.height);
  return { x, y, width: r - x, height: bo - y };
}

function measureForeignObjectOverflow(
  fo: SVGGraphicsElement,
  inner: HTMLElement,
): Box | null {
  const x = parseFloat(fo.getAttribute('x') || '0');
  const y = parseFloat(fo.getAttribute('y') || '0');
  const w = parseFloat(fo.getAttribute('width') || '0');
  const h = parseFloat(fo.getAttribute('height') || '0');
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const contentH = inner.scrollHeight || h;
  const contentW = inner.scrollWidth || w;
  return {
    x,
    y,
    width: Math.max(w, contentW),
    height: Math.max(h, contentH),
  };
}

function findContentGroup(svg: SVGSVGElement): SVGGElement | null {
  const groups = svg.querySelectorAll(':scope > g');
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i] as SVGGElement;
    if (g.hasAttribute('transform')) return g;
  }
  return (groups[groups.length - 1] as SVGGElement) ?? null;
}

function cloneDefsExcludingDotGrid(svg: SVGSVGElement): SVGDefsElement | null {
  const defs = svg.querySelector(':scope > defs');
  if (!defs) return null;
  const clone = defs.cloneNode(true) as SVGDefsElement;
  // Drop the canvas background patterns — paper is our backdrop now.
  clone.querySelector('#bpmn-dot-grid')?.remove();
  clone.querySelector('#bpmn-rule-grid')?.remove();
  clone.querySelector('#bpmn-rule-grid-fine')?.remove();
  return clone;
}

async function rasterize(
  svgString: string,
  width: number,
  height: number,
): Promise<Blob> {
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`;
  const img = await loadImage(url);

  const canvas = document.createElement('canvas');
  canvas.width = width * SCALE;
  canvas.height = height * SCALE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D canvas context');
  // Defensive cream fill — covers anything the SVG didn't paint over.
  ctx.fillStyle = '#fbf8f1';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('canvas.toBlob returned null'))),
      'image/png',
    );
  });
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to render SVG to image'));
    img.src = url;
  });
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function bpmnExportFilename(journeyTitle: string): string {
  const safe = journeyTitle
    .replace(/[^a-z0-9-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'business-flow';
  return `${safe}-flow.png`;
}
