import React, { useMemo } from "react";
import { highlightHtml, type CodeLang } from "@/components/ui/CodeHighlight";

interface DiffBlockProps {
  before: string;
  after: string;
  /** Source language for per-line syntax highlighting (from the file
   *  extension). Defaults to C# — same default as CodeBlock. */
  lang?: CodeLang;
  /** Optional internal scroll cap. Pass undefined to let the parent decide. */
  maxHeight?: number;
}

type Line =
  | { type: "context"; text: string; oldNo: number; newNo: number }
  | { type: "removed"; text: string; oldNo: number }
  | { type: "added"; text: string; newNo: number };

/** LCS table for two sequences of lines. Plenty fast for method bodies. */
function lcsLengths(a: string[], b: string[]): number[][] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array(m + 1).fill(0)
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        a[i] === b[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  return dp;
}

/** Walk the LCS table to produce a unified diff with line numbers. */
function unifiedDiff(beforeText: string, afterText: string): Line[] {
  const a = beforeText.split("\n");
  const b = afterText.split("\n");
  const dp = lcsLengths(a, b);

  const out: Line[] = [];
  let i = 0,
    j = 0;
  let oldNo = 1,
    newNo = 1;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ type: "context", text: a[i], oldNo, newNo });
      i++;
      j++;
      oldNo++;
      newNo++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: "removed", text: a[i], oldNo });
      i++;
      oldNo++;
    } else {
      out.push({ type: "added", text: b[j], newNo });
      j++;
      newNo++;
    }
  }
  while (i < a.length) {
    out.push({ type: "removed", text: a[i], oldNo });
    i++;
    oldNo++;
  }
  while (j < b.length) {
    out.push({ type: "added", text: b[j], newNo });
    j++;
    newNo++;
  }
  return out;
}

const LINE_STYLES = {
  context: {
    bg: "hsl(220, 22%, 5%)",
    border: "transparent",
    marker: " ",
    fg: "hsl(210, 15%, 65%)",
  },
  removed: {
    bg: "hsla(0, 50%, 18%, 0.35)",
    border: "hsl(0, 50%, 40%)",
    marker: "-",
    fg: "hsl(0, 55%, 78%)",
  },
  added: {
    bg: "hsla(145, 50%, 14%, 0.35)",
    border: "hsl(145, 50%, 40%)",
    marker: "+",
    fg: "hsl(145, 55%, 78%)",
  },
} as const;

const GUTTER_W = "min-w-[2.5rem] text-right pr-2";

const DiffBlock: React.FC<DiffBlockProps> = ({
  before,
  after,
  lang = "csharp",
  maxHeight,
}) => {
  const lines = useMemo(() => unifiedDiff(before, after), [before, after]);
  // Prism-highlight each line up front (cheap; same renderer CodeBlock
  // uses). The add/remove signal now rides on the row background + left
  // border + marker, so token colors stay intact instead of being
  // flattened to a single red/green text color.
  const htmls = useMemo(
    () => lines.map((l) => highlightHtml(l.text, lang)),
    [lines, lang]
  );
  const addedCount = lines.filter((l) => l.type === "added").length;
  const removedCount = lines.filter((l) => l.type === "removed").length;

  return (
    <div
      className="overflow-auto rounded-lg border font-mono text-[11px]"
      style={{
        background: "var(--bpmn-bg-deep)",
        borderColor: "var(--bpmn-border-soft)",
        ...(maxHeight ? { maxHeight } : {}),
      }}
    >
      {/* Summary strip */}
      <div
        className="flex items-center gap-3 border-b px-3 py-1.5 font-mono text-[10px]"
        style={{
          borderColor: "var(--bpmn-border-soft)",
          color: "hsl(210, 12%, 55%)",
        }}
      >
        <span style={{ color: "hsl(145, 55%, 62%)" }}>+{addedCount}</span>
        <span style={{ color: "hsl(0, 55%, 62%)" }}>−{removedCount}</span>
        <span className="text-zinc-600">unified diff · base → head</span>
      </div>

      <div className="leading-relaxed">
        {lines.map((line, idx) => {
          const style = LINE_STYLES[line.type];
          const oldNo =
            line.type === "added"
              ? ""
              : String((line as { oldNo: number }).oldNo);
          const newNo =
            line.type === "removed"
              ? ""
              : String((line as { newNo: number }).newNo);
          return (
            <div
              key={idx}
              className="flex items-start"
              style={{
                background: style.bg,
                borderLeft: `2px solid ${style.border}`,
              }}
            >
              <span
                className={`${GUTTER_W} text-zinc-700 select-none`}
                style={{ fontSize: "10px", paddingTop: 2 }}
              >
                {oldNo}
              </span>
              <span
                className={`${GUTTER_W} text-zinc-700 select-none`}
                style={{ fontSize: "10px", paddingTop: 2 }}
              >
                {newNo}
              </span>
              <span
                className="px-1.5 text-center text-zinc-600 select-none"
                style={{ color: style.fg, width: "1.5rem" }}
              >
                {style.marker}
              </span>
              <pre
                className="code-surface flex-1 py-0.5 pr-3 break-all whitespace-pre-wrap"
                style={{ background: "transparent", fontSize: "11px" }}
                // Prism output, tokenized from our own source — script-safe.
                dangerouslySetInnerHTML={{ __html: htmls[idx] || "&nbsp;" }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DiffBlock;
