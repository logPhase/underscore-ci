import React from "react";

/** Minimal markdown renderer for the analyzer's spec prose. Handles the
 *  subset EARS spec markdown uses — headings, paragraphs, bullet/numbered
 *  lists, fenced code blocks, and inline **bold** / `code` / [links](url).
 *  Deliberately small and dependency-free; not a full CommonMark parser.
 *  Styled with the --bpmn-* tokens so it sits on the report identity. */

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("`")) {
      nodes.push(
        <code
          key={keyPrefix + i}
          className="rounded px-1 py-0.5 font-mono text-[10.5px]"
          style={{ background: "var(--bpmn-bg-deep)", color: "var(--bpmn-cyan)" }}
        >
          {tok.slice(1, -1)}
        </code>
      );
    } else if (tok.startsWith("**")) {
      nodes.push(<strong key={keyPrefix + i}>{tok.slice(2, -2)}</strong>);
    } else {
      const link = /\[([^\]]+)\]\(([^)]+)\)/.exec(tok);
      nodes.push(
        <a
          key={keyPrefix + i}
          href={link?.[2] ?? "#"}
          target="_blank"
          rel="noreferrer"
          className="underline"
          style={{ color: "var(--bpmn-cyan)" }}
        >
          {link?.[1] ?? tok}
        </a>
      );
    }
    last = m.index + tok.length;
    i += 1;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

const LIST_RE = /^\s*([-*]|\d+\.)\s+/;
const HEADING_RE = /^(#{1,4})\s+(.*)$/;

export function Markdown({ text }: { text: string }) {
  const lines = (text || "").replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (line.trim().startsWith("```")) {
      const buf: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        buf.push(lines[i]);
        i += 1;
      }
      i += 1; // closing fence
      blocks.push(
        <pre
          key={k++}
          className="my-1.5 overflow-auto rounded p-2 font-mono text-[10.5px] leading-snug"
          style={{ background: "var(--bpmn-bg-deep)", color: "var(--bpmn-text)" }}
        >
          {buf.join("\n")}
        </pre>
      );
      continue;
    }

    const h = HEADING_RE.exec(line);
    if (h) {
      blocks.push(
        <div
          key={k++}
          className="mt-2 mb-1 font-semibold"
          style={{ color: "var(--bpmn-text)" }}
        >
          {renderInline(h[2], `h${k}-`)}
        </div>
      );
      i += 1;
      continue;
    }

    if (LIST_RE.test(line)) {
      const items: string[] = [];
      while (i < lines.length && LIST_RE.test(lines[i])) {
        items.push(lines[i].replace(LIST_RE, ""));
        i += 1;
      }
      blocks.push(
        <ul key={k++} className="my-1 ml-3.5 list-disc space-y-0.5">
          {items.map((it, j) => (
            <li key={j}>{renderInline(it, `li${k}-${j}-`)}</li>
          ))}
        </ul>
      );
      continue;
    }

    if (line.trim() === "") {
      i += 1;
      continue;
    }

    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !LIST_RE.test(lines[i]) &&
      !HEADING_RE.test(lines[i]) &&
      !lines[i].trim().startsWith("```")
    ) {
      para.push(lines[i]);
      i += 1;
    }
    blocks.push(
      <p key={k++} className="my-1 leading-relaxed">
        {renderInline(para.join(" "), `p${k}-`)}
      </p>
    );
  }

  return (
    <div className="text-[11.5px]" style={{ color: "var(--bpmn-text)" }}>
      {blocks}
    </div>
  );
}
