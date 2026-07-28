import type { Doc, Fact, KnowledgeSummary } from "@/types/intent";

// Extracted from BpmnCanvas so the React Flow renderer (BpmnFlow) can reuse
// the journey-knowledge side panel verbatim — docs (Confluence passages) +
// decisions (graph facts) surfaced for a step.

export function isUrl(cite: string): boolean {
  return /^https?:\/\//i.test((cite || "").trim());
}

/** ISO timestamp → a short human date ("Jun 19, 2026"); falls back to the
 *  date part if unparseable, null when absent. */
export function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Snippets arrive as passages joined by " · ". Split into clean lines. */
export function splitSnippet(snippet: string): string[] {
  return (snippet || "")
    .split(/\s*·\s*/)
    .map((p) => p.replace(/^[-•\s]+/, "").trim())
    .filter(Boolean);
}

/** Anchored journey-knowledge side panel — the docs + decisions surfaced for
 *  the clicked step. */
export function KnowledgePanel({
  left,
  top,
  knowledge,
  docs,
  facts,
  onClose,
}: {
  left: number;
  top: number;
  knowledge?: KnowledgeSummary | null;
  docs: Doc[];
  facts: Fact[];
  onClose: () => void;
}) {
  const summary = knowledge?.summary?.trim();
  const sortedDocs = [...docs].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const leadDoc = !summary && sortedDocs.length ? sortedDocs[0] : null;
  const sourceDocs = leadDoc ? sortedDocs.slice(1) : sortedDocs;
  const hasLead = !!summary || !!leadDoc;
  return (
    <div
      className="absolute z-30 flex flex-col rounded-lg border shadow-xl"
      style={{
        left,
        top,
        width: 420,
        maxHeight: "75%",
        background: "var(--bpmn-surface)",
        borderColor: "var(--bpmn-cyan)",
        color: "var(--bpmn-text)",
        fontFamily: "var(--bpmn-font-mono)",
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        className="flex items-center justify-between border-b px-3 py-2"
        style={{ borderColor: "var(--bpmn-border)" }}
      >
        <span
          className="text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--bpmn-cyan)" }}
        >
          📚 Journey knowledge
        </span>
        <button
          onClick={onClose}
          className="rounded px-1 text-zinc-400 hover:text-zinc-100"
          aria-label="Close"
        >
          ✕
        </button>
      </div>
      <div className="overflow-auto px-3 py-3 text-[11.5px] leading-relaxed">
        {summary ? (
          <p
            className="m-0 leading-relaxed"
            style={{ color: "var(--bpmn-text)" }}
          >
            {summary}
          </p>
        ) : leadDoc ? (
          <div>
            <div
              className="mb-1 font-semibold leading-snug"
              style={{ color: "var(--bpmn-text)" }}
            >
              {leadDoc.title}
            </div>
            <p
              className="m-0 leading-snug"
              style={{ color: "var(--bpmn-text-muted)" }}
            >
              {splitSnippet(leadDoc.snippet)[0] ?? leadDoc.snippet}
            </p>
          </div>
        ) : null}

        {facts.length > 0 && (
          <div
            className={hasLead ? "mt-3 border-t pt-3" : ""}
            style={hasLead ? { borderColor: "var(--bpmn-border)" } : undefined}
          >
            <div
              className="mb-1.5 text-[9px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--bpmn-text-muted)" }}
            >
              Decisions
            </div>
            {facts.map((f, i) => {
              const superseded = !!f.invalid_at;
              return (
                <div
                  key={i}
                  className="mt-2 rounded-md border px-2.5 py-2 first:mt-0"
                  style={{
                    borderColor: "var(--bpmn-border)",
                    background: superseded
                      ? "transparent"
                      : "color-mix(in srgb, var(--bpmn-mint) 5%, transparent)",
                  }}
                >
                  <p
                    className="mb-1 leading-snug"
                    style={{
                      color: superseded
                        ? "var(--bpmn-text-muted)"
                        : "var(--bpmn-text)",
                      textDecoration: superseded ? "line-through" : undefined,
                    }}
                  >
                    {f.fact}
                  </p>
                  <div
                    className="flex flex-wrap items-center gap-1.5 text-[9px]"
                    style={{ color: "var(--bpmn-text-dim)" }}
                  >
                    {fmtDate(f.valid_at) && (
                      <span>✓ valid {fmtDate(f.valid_at)}</span>
                    )}
                    {superseded && (
                      <span
                        className="inline-block rounded px-1 py-0.5 uppercase tracking-wider"
                        style={{
                          background:
                            "color-mix(in srgb, var(--bpmn-rose) 18%, transparent)",
                          color: "var(--bpmn-rose)",
                        }}
                      >
                        superseded
                        {fmtDate(f.invalid_at)
                          ? ` ${fmtDate(f.invalid_at)}`
                          : ""}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {sourceDocs.length > 0 && (
          <div
            className={hasLead || facts.length > 0 ? "mt-3 border-t pt-3" : ""}
            style={
              hasLead || facts.length > 0
                ? { borderColor: "var(--bpmn-border)" }
                : undefined
            }
          >
            <div
              className="mb-1.5 flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--bpmn-text-muted)" }}
            >
              <span>Sources</span>
              <span style={{ color: "var(--bpmn-text-dim)" }}>
                · {sourceDocs.length}
              </span>
            </div>
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {sourceDocs.map((d, i) => (
                <li key={i} className="leading-snug">
                  {d.cite && isUrl(d.cite) ? (
                    <a
                      href={d.cite}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-start gap-1 hover:underline"
                      style={{ color: "var(--bpmn-cyan)" }}
                    >
                      <span>{d.title}</span>
                      <span aria-hidden>↗</span>
                    </a>
                  ) : (
                    <span
                      className="inline-flex items-start gap-1"
                      style={{ color: "var(--bpmn-text-muted)" }}
                    >
                      <span aria-hidden>📄</span>
                      <span>{d.title}</span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {!summary && sortedDocs.length === 0 && facts.length === 0 && (
          <div style={{ color: "var(--bpmn-text-muted)" }}>
            No knowledge captured for this step.
          </div>
        )}
      </div>
    </div>
  );
}
