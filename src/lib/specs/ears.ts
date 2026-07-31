export type SpecBlock =
  | { kind: "md"; text: string }
  | { kind: "req"; reqNo: number; text: string; title?: string };

interface Unit {
  req: boolean;
  text: string;
  title?: string;
}

const SHALL = /\bshall\b/i;
const FENCE = /^\s*(```|~~~)/;
const HEADING = /^\s*#/;
const BULLET = /^\s*(?:[-*]|\d+\.)\s+/;
/** The analyzer's spec format: a NAMED requirement section whose body (one
 *  or more paragraphs, often with no blank line after the heading) runs
 *  until the next heading. */
const REQ_HEADING = /^\s*#{2,4}\s+Requirement\b[:.]?\s*(.*)$/i;

/** Split EARS-style spec markdown into renderable blocks: contiguous plain
 *  markdown, and individual `shall`-statement requirements numbered
 *  top-to-bottom (REQ-n anchors). Headings and fenced code are never
 *  requirements, whatever they contain. */
export function splitSpecBlocks(markdown: string | null | undefined): SpecBlock[] {
  if (typeof markdown !== "string" || markdown.length === 0) return [];
  const units: Unit[] = [];
  let buf: string[] = [];
  let inFence = false;
  // Open "### Requirement: <name>" section — its body accumulates across
  // paragraphs (blank lines included) until the NEXT heading closes it.
  let reqTitle: string | null = null;
  let reqBody: string[] = [];

  const flushRequirement = () => {
    if (reqTitle === null) return;
    const text = reqBody.join("\n").replace(/^\n+|\n+$/g, "");
    units.push({ req: true, text: text || reqTitle, title: reqTitle });
    reqTitle = null;
    reqBody = [];
  };

  const flushParagraph = () => {
    if (buf.length === 0) return;
    const text = buf.join("\n");
    const isHeading = HEADING.test(buf[0]);
    units.push({ req: !isHeading && !inFence && SHALL.test(text), text });
    buf = [];
  };

  for (const line of markdown.split("\n")) {
    if (FENCE.test(line)) {
      if (reqTitle !== null) {
        reqBody.push(line);
        continue;
      }
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
    const reqHead = REQ_HEADING.exec(line);
    if (reqHead) {
      flushRequirement();
      flushParagraph();
      reqTitle = reqHead[1].trim() || "Requirement";
      continue;
    }
    if (reqTitle !== null) {
      // any OTHER heading ends the open requirement section
      if (HEADING.test(line)) {
        flushRequirement();
        buf.push(line);
      } else {
        reqBody.push(line);
      }
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
  flushRequirement();
  flushParagraph();

  const blocks: SpecBlock[] = [];
  let reqNo = 0;
  for (const unit of units) {
    if (unit.req) {
      blocks.push({ kind: "req", reqNo: ++reqNo, text: unit.text,
                    ...(unit.title ? { title: unit.title } : {}) });
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
