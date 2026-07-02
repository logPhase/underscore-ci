import React from "react";
import { highlightHtml, type CodeLang } from "@/components/ui/CodeHighlight";

interface CodeBlockProps {
  code: string;
  /** Optional internal scroll cap. Pass undefined to let the parent decide. */
  maxHeight?: number;
  /** Source language for highlighting — from the file extension. */
  lang?: CodeLang;
}

const CodeBlock: React.FC<CodeBlockProps> = ({
  code,
  maxHeight,
  lang = "csharp",
}) => {
  const lines = code.split("\n");
  return (
    <div
      className="overflow-auto rounded-lg border"
      style={{
        background: "var(--bpmn-bg-deep)",
        borderColor: "var(--bpmn-border-soft)",
        ...(maxHeight ? { maxHeight } : {}),
      }}
    >
      <div className="py-1">
        {lines.map((line, i) => (
          <div key={i} className="flex items-start">
            <span
              className="code-surface shrink-0 pr-3 pl-2 text-right text-zinc-700 tabular-nums select-none"
              style={{ minWidth: "2.5rem", color: "var(--bpmn-text-dim)" }}
            >
              {i + 1}
            </span>
            {/* Highlighted per line — line numbers force row-wise
                rendering; multi-line tokens (block comments) degrade
                to plain text on continuation lines, which is fine. */}
            <pre
              className="code-surface m-0 flex-1 pr-3 break-all whitespace-pre-wrap"
              dangerouslySetInnerHTML={{
                __html: highlightHtml(line, lang) || "&nbsp;",
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default CodeBlock;
