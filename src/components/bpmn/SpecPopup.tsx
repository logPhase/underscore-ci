// The spec popup — opened by an element's § marker. A centered modal OVER
// the diagram (deliberately not a navigation to /specs: the reader is mid-
// flow; the spec comes to them, Esc puts them straight back). Renders the
// analyzer-verified verdict + requirement quote first, then the full spec
// markdown when it is baked into this report; a sibling repo's spec shows
// the quote alone with an honest note.

import { useEffect, useState } from "react";
import { Markdown } from "@/components/ui/Markdown";
import { useAnalysis } from "@/store/use-analysis-store";
import type { BpmnSpecRef } from "./types";
import { resolveSpecContent } from "./spec-refs";

const VERDICT_META = {
  conflicts: { color: "var(--bpmn-rose)", label: "conflicts" },
  aligned: { color: "var(--bpmn-mint)", label: "aligned" },
} as const;

export function SpecPopup({
  refs,
  elementLabel,
  onClose,
}: {
  refs: BpmnSpecRef[];
  /** The clicked element's label — names what the verdicts are about. */
  elementLabel: string;
  onClose: () => void;
}) {
  // Conflicts first — the reason the reader clicked.
  const ordered = [...refs].sort((a, b) =>
    a.verdict === b.verdict ? 0 : a.verdict === "conflicts" ? -1 : 1,
  );
  const [active, setActive] = useState(0);
  const specs = useAnalysis((s) => s.transformedData?.specs ?? null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const ref = ordered[Math.min(active, ordered.length - 1)];
  const meta = VERDICT_META[ref.verdict] ?? VERDICT_META.aligned;
  const { content, sibling } = resolveSpecContent(ref, specs);

  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center"
      // Backdrop click closes; clicks inside the panel stop below.
      onPointerDown={(e) => {
        e.stopPropagation();
        onClose();
      }}
      style={{ background: "rgb(0 0 0 / 0.55)", backdropFilter: "blur(2px)" }}
    >
      <div
        role="dialog"
        aria-label={`Living spec — ${ref.capability}`}
        className="flex flex-col overflow-hidden rounded-xl border"
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          width: "min(640px, 92%)",
          maxHeight: "86%",
          background: "var(--bpmn-bg)",
          borderColor: "var(--bpmn-border-em)",
          boxShadow: "0 24px 64px rgb(0 0 0 / 0.55)",
        }}
      >
        {/* Header — capability + verdict, ✕ */}
        <div
          className="flex items-center gap-2.5 border-b px-4 py-3"
          style={{ borderColor: "var(--bpmn-border-soft)", background: "var(--bpmn-surface-soft)" }}
        >
          <span
            className="font-mono text-[15px] font-semibold"
            style={{ color: "var(--bpmn-text)" }}
          >
            § {ref.capability}
          </span>
          <span
            className="rounded border px-1.5 py-0.5 font-mono text-[9.5px] font-semibold tracking-wider uppercase"
            style={{ borderColor: meta.color, color: meta.color }}
          >
            {meta.label}
          </span>
          {sibling && ref.repo && (
            <span
              className="truncate font-mono text-[10px]"
              style={{ color: "var(--bpmn-text-dim)" }}
              title={`This spec lives in sibling repo ${ref.repo}`}
            >
              sibling · {ref.repo}
            </span>
          )}
          <button
            aria-label="Close spec popup"
            className="ml-auto rounded px-2 py-1 text-[15px] leading-none"
            onClick={onClose}
            style={{ color: "var(--bpmn-text-muted)", cursor: "pointer" }}
          >
            ✕
          </button>
        </div>

        {/* Ref tabs — only when the element cites several specs. */}
        {ordered.length > 1 && (
          <div
            className="flex flex-wrap gap-1.5 border-b px-4 py-2"
            style={{ borderColor: "var(--bpmn-border-soft)" }}
          >
            {ordered.map((r, i) => {
              const m = VERDICT_META[r.verdict] ?? VERDICT_META.aligned;
              const on = i === Math.min(active, ordered.length - 1);
              return (
                <button
                  key={`${r.repo ?? ""}:${r.capability}:${i}`}
                  className="rounded border px-2 py-0.5 font-mono text-[10.5px]"
                  onClick={() => setActive(i)}
                  style={{
                    cursor: "pointer",
                    borderColor: on ? m.color : "var(--bpmn-border)",
                    color: on ? m.color : "var(--bpmn-text-muted)",
                    background: on
                      ? `color-mix(in srgb, ${m.color} 10%, transparent)`
                      : "transparent",
                  }}
                >
                  {r.capability}
                </button>
              );
            })}
          </div>
        )}

        {/* Body — verdict evidence first, full spec after. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3.5">
          <div
            className="font-mono text-[10px] tracking-[0.18em] uppercase"
            style={{ color: "var(--bpmn-text-dim)" }}
          >
            The spec says
          </div>
          <blockquote
            className="mt-1.5 border-l-2 pl-3 text-[13.5px] leading-relaxed"
            style={{
              borderColor: meta.color,
              color: "var(--bpmn-text)",
              fontFamily: "var(--reading-font)",
            }}
          >
            “{ref.requirement}”
          </blockquote>
          {ref.why && (
            <>
              <div
                className="mt-3.5 font-mono text-[10px] tracking-[0.18em] uppercase"
                style={{ color: meta.color }}
              >
                {ref.verdict === "conflicts" ? "Why this change conflicts" : "How this change aligns"}
              </div>
              <p
                className="mt-1 text-[13px] leading-relaxed"
                style={{ color: "var(--bpmn-text-muted)", fontFamily: "var(--reading-font)" }}
              >
                {ref.why}
              </p>
            </>
          )}
          <p
            className="mt-2.5 font-mono text-[10px]"
            style={{ color: "var(--bpmn-text-dim)" }}
          >
            on step “{elementLabel}”
          </p>

          <div
            className="mt-4 border-t pt-3.5"
            style={{ borderColor: "var(--bpmn-border-soft)" }}
          >
            {content ? (
              <div className="prose-read-sm text-[12.5px] leading-relaxed">
                <Markdown text={content} />
              </div>
            ) : (
              <p
                className="text-[12px] leading-relaxed"
                style={{ color: "var(--bpmn-text-dim)" }}
              >
                {sibling
                  ? `The full spec lives in ${ref.repo ?? "a sibling repo"} and is not baked into this report — the quoted requirement above was verified against it at analysis time.`
                  : "The full spec text is not in this report's payload — the quoted requirement above was verified against it at analysis time."}
              </p>
            )}
          </div>
        </div>

        {/* Footer — escape hatch to the full Specs page (own-repo only). */}
        {content && (
          <div
            className="flex justify-end border-t px-4 py-2.5"
            style={{ borderColor: "var(--bpmn-border-soft)", background: "var(--bpmn-surface-soft)" }}
          >
            <a
              className="font-mono text-[11px] hover:underline"
              href="#/specs"
              style={{ color: "var(--bpmn-cyan)" }}
            >
              Open the Specs page ↗
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
