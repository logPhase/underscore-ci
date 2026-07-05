export type SpecBlock =
  | { kind: "md"; text: string }
  | { kind: "req"; reqNo: number; text: string };

interface Unit {
  req: boolean;
  text: string;
}

const SHALL = /\bshall\b/i;
const FENCE = /^\s*(```|~~~)/;
const HEADING = /^\s*#/;
const BULLET = /^\s*(?:[-*]|\d+\.)\s+/;

/** Split EARS-style spec markdown into renderable blocks: contiguous plain
 *  markdown, and individual `shall`-statement requirements numbered
 *  top-to-bottom (REQ-n anchors). Headings and fenced code are never
 *  requirements, whatever they contain. */
export function splitSpecBlocks(markdown: string): SpecBlock[] {
  const units: Unit[] = [];
  let buf: string[] = [];
  let inFence = false;

  const flushParagraph = () => {
    if (buf.length === 0) return;
    const text = buf.join("\n");
    const isHeading = HEADING.test(buf[0]);
    units.push({ req: !isHeading && !inFence && SHALL.test(text), text });
    buf = [];
  };

  for (const line of markdown.split("\n")) {
    if (FENCE.test(line)) {
      if (!inFence) flushParagraph();
      buf.push(line);
      if (inFence) {
        units.push({ req: false, text: buf.join("\n") });
        buf = [];
      }
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      buf.push(line);
      continue;
    }
    if (line.trim() === "") {
      flushParagraph();
      continue;
    }
    const bullet = BULLET.exec(line);
    if (bullet) {
      flushParagraph();
      const inner = line.slice(bullet[0].length);
      const isReq = SHALL.test(inner);
      units.push({ req: isReq, text: isReq ? inner : line });
      continue;
    }
    buf.push(line);
  }
  flushParagraph();

  const blocks: SpecBlock[] = [];
  let reqNo = 0;
  for (const unit of units) {
    if (unit.req) {
      blocks.push({ kind: "req", reqNo: ++reqNo, text: unit.text });
      continue;
    }
    const last = blocks[blocks.length - 1];
    if (last?.kind === "md") {
      last.text += "\n\n" + unit.text;
    } else {
      blocks.push({ kind: "md", text: unit.text });
    }
  }
  return blocks;
}
