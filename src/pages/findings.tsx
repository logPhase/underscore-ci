import { Markdown } from "@/components/ui/Markdown";
import { useAnalysis } from "@/store/use-analysis-store";
import type { Finding, FindingLevel } from "@/types/findings";
import { ShieldAlert } from "lucide-react";
import { useMemo } from "react";
import { Navigate } from "react-router-dom";

/**
 * FindingsPage — the correctness audit. The analyzer's review agent read the
 * PR's changed code side-by-side with the ingested institutional knowledge
 * and flagged where they disagree (divergence) or where the code is just
 * wrong (bug). The page is an audit report, not a verdict list: every card
 * leads with evidence — the documented claim, the observed behavior, the
 * code excerpt — and low-confidence items are visually subdued (honest
 * uncertainty), never dressed up as facts.
 *
 * Payload-driven like the specs page: if it renders, the run had review
 * enrichment. Deep links without the payload bounce to /journeys.
 */

const isUrl = (s: string | null | undefined) =>
  /^https?:\/\//i.test((s || "").trim());

const SEVERITY_COLOR: Record<FindingLevel, string> = {
  high: "var(--bpmn-rose)",
  medium: "var(--bpmn-amber)",
  low: "var(--bpmn-text-dim)",
};

const SEVERITY_RANK: Record<FindingLevel, number> = { high: 0, medium: 1, low: 2 };
const CONFIDENCE_RANK: Record<FindingLevel, number> = { high: 0, medium: 1, low: 2 };

const rank = (m: Record<FindingLevel, number>, v: string | undefined) =>
  m[(v as FindingLevel) ?? "low"] ?? 2;

/** Severity high→low, divergences before bugs, confident before tentative. */
function orderFindings(items: Finding[]): Finding[] {
  return [...items].sort(
    (a, b) =>
      rank(SEVERITY_RANK, a.severity) - rank(SEVERITY_RANK, b.severity) ||
      (a.kind === b.kind ? 0 : a.kind === "divergence" ? -1 : 1) ||
      rank(CONFIDENCE_RANK, a.confidence) - rank(CONFIDENCE_RANK, b.confidence)
  );
}

/** "3 places where this change disagrees with what the code is documented
 *  to do." — the framing sentence is computed, never canned. */
function framingSentence(items: Finding[]): string {
  const div = items.filter((f) => f.kind === "divergence").length;
  const bugs = items.length - div;
  if (div > 0 && bugs > 0)
    return `${div} place${div === 1 ? "" : "s"} where this change disagrees with the documentation, and ${bugs} more thing${bugs === 1 ? "" : "s"} worth a second look.`;
  if (div > 0)
    return `${div} place${div === 1 ? "" : "s"} where this change disagrees with what the codebase is documented to do.`;
  return `${bugs} thing${bugs === 1 ? "" : "s"} worth a second look before merge.`;
}

const FindingsPage = () => {
  const payload = useAnalysis((s) => s.transformedData?.findings);
  const repoId = useAnalysis((s) => s.transformedData?.analyzerRepoId);

  const items = useMemo(() => orderFindings(payload?.items ?? []), [payload]);
  const consulted = payload?.consulted ?? [];

  const counts = useMemo(() => {
    const c: Record<FindingLevel, number> = { high: 0, medium: 0, low: 0 };
    for (const f of items) c[(f.severity as FindingLevel) ?? "low"]++;
    return c;
  }, [items]);

  // The rail hides this tab without findings, but guard deep links too.
  if (!payload) return <Navigate to="/journeys" replace />;

  return (
    <section
      className="flex h-full w-full flex-col overflow-y-auto"
      style={{ background: "var(--page-bg)" }}
    >
      {/* Header — identity left, severity tally right */}
      <header
        className="sticky top-0 z-10 flex shrink-0 items-center gap-3 border-b px-5 py-3"
        style={{
          borderColor: "var(--bpmn-border-soft)",
          background: "var(--page-bg)",
        }}
      >
        <ShieldAlert
          className="h-4 w-4 shrink-0"
          style={{ color: "var(--bpmn-text-dim)" }}
        />
        <h1
          className="text-[14px] font-semibold whitespace-nowrap"
          style={{
            fontFamily: "var(--bpmn-font-display)",
            color: "var(--bpmn-text)",
          }}
        >
          Findings
        </h1>
        {repoId && (
          <span
            className="hidden truncate font-mono text-[11px] md:block"
            style={{ color: "var(--bpmn-text-dim)" }}
            title={`Analyzer repo: ${repoId}`}
          >
            {repoId}
          </span>
        )}
        <span className="ml-auto" />
        {items.length > 0 && (
          <div className="flex items-center gap-1.5">
            {(["high", "medium", "low"] as const).map(
              (lvl) =>
                counts[lvl] > 0 && (
                  <span
                    key={lvl}
                    className="rounded-full border px-2 py-0.5 font-mono text-[9.5px] tracking-wider uppercase"
                    style={{
                      borderColor: SEVERITY_COLOR[lvl],
                      color: SEVERITY_COLOR[lvl],
                    }}
                  >
                    {counts[lvl]} {lvl}
                  </span>
                )
            )}
          </div>
        )}
      </header>

      {items.length === 0 ? (
        <AllClear consulted={consulted} />
      ) : (
        <div className="mx-auto w-full max-w-3xl px-6 pt-5 pb-10">
          {/* Framing line — what the audit concluded, in one breath */}
          <p
            className="mb-5 text-[16.5px] leading-snug"
            style={{
              fontFamily: "var(--bpmn-font-display)",
              fontStyle: "italic",
              color: "var(--bpmn-text)",
            }}
          >
            {framingSentence(items)}
          </p>

          <div className="flex flex-col gap-4">
            {items.map((f) => (
              <FindingCard key={f.id} finding={f} />
            ))}
          </div>

          <ConsultedFooter consulted={consulted} />
        </div>
      )}
    </section>
  );
};

const KindBadge = ({ finding }: { finding: Finding }) => {
  const divergence = finding.kind === "divergence";
  const color = divergence ? "hsl(var(--primary))" : "var(--bpmn-rose)";
  return (
    <span
      className="rounded border px-1.5 py-0.5 font-mono text-[9.5px] tracking-wider whitespace-nowrap uppercase"
      style={{ borderColor: color, color }}
    >
      {divergence ? "docs disagree" : "correctness"}
    </span>
  );
};

const ConfidenceChip = ({ level }: { level: string | undefined }) => {
  if (level !== "low" && level !== "medium") return null;
  return (
    <span
      className="rounded border border-dashed px-1.5 py-0.5 font-mono text-[9.5px] tracking-wider whitespace-nowrap uppercase"
      style={{
        borderColor: "var(--bpmn-border-em)",
        color: "var(--bpmn-text-dim)",
      }}
    >
      {level} confidence
    </span>
  );
};

/** Tiny mono section eyebrow used throughout the card. */
const Eyebrow = ({ children, color }: { children: string; color?: string }) => (
  <span
    className="font-mono text-[9px] tracking-[0.18em] whitespace-nowrap uppercase"
    style={{ color: color ?? "var(--bpmn-text-dim)" }}
  >
    {children}
  </span>
);

const FindingCard = ({ finding: f }: { finding: Finding }) => {
  const sev = SEVERITY_COLOR[(f.severity as FindingLevel) ?? "low"];
  const tentative = f.confidence === "low";
  const citations = f.citations ?? [];
  const quoted = citations.find((c) => (c.quote ?? "").trim().length > 0);

  return (
    <article
      className="rounded-md border py-3.5 pr-4 pl-4"
      style={{
        borderColor: "var(--bpmn-border-soft)",
        background: "var(--bpmn-surface-soft)",
        borderLeft: `3px ${tentative ? "dashed" : "solid"} ${sev}`,
        opacity: tentative ? 0.86 : 1,
      }}
    >
      {/* Badges + title */}
      <div className="mb-1 flex flex-wrap items-center gap-1.5">
        <KindBadge finding={f} />
        <ConfidenceChip level={f.confidence} />
        <span className="ml-auto" />
        <span
          className="font-mono text-[9.5px] tracking-wider uppercase"
          style={{ color: sev }}
        >
          {f.severity}
        </span>
      </div>
      <h2
        className="mb-1.5 text-[15.5px] leading-snug font-semibold"
        style={{
          fontFamily: "var(--bpmn-font-display)",
          color: "var(--bpmn-text)",
        }}
      >
        {f.title}
      </h2>

      {/* Body */}
      <div className="prose-read-sm text-[13px] leading-relaxed">
        <Markdown text={f.detail ?? ""} />
      </div>

      {/* Documented vs in-the-code */}
      {(f.expected || f.observed) && (
        <div
          className="mt-3 flex flex-col gap-2 rounded-md border px-3 py-2.5"
          style={{
            borderColor: "var(--bpmn-border-soft)",
            background: "var(--bpmn-bg-deep)",
          }}
        >
          {f.expected && (
            <div className="flex items-start gap-2.5">
              <span
                aria-hidden
                className="mt-1 h-3 w-0.5 shrink-0 rounded-full"
                style={{ background: "var(--bpmn-mint)" }}
              />
              <div className="min-w-0">
                <Eyebrow color="var(--bpmn-mint)">Documented</Eyebrow>
                <p
                  className="mt-0.5 text-[12.5px] leading-relaxed"
                  style={{
                    fontFamily: "var(--reading-font)",
                    color: "var(--bpmn-text)",
                  }}
                >
                  {f.expected}
                </p>
              </div>
            </div>
          )}
          {f.observed && (
            <div className="flex items-start gap-2.5">
              <span
                aria-hidden
                className="mt-1 h-3 w-0.5 shrink-0 rounded-full"
                style={{ background: "var(--bpmn-amber)" }}
              />
              <div className="min-w-0">
                <Eyebrow color="var(--bpmn-amber)">In the code</Eyebrow>
                <p
                  className="mt-0.5 text-[12.5px] leading-relaxed"
                  style={{
                    fontFamily: "var(--reading-font)",
                    color: "var(--bpmn-text)",
                  }}
                >
                  {f.observed}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Code evidence */}
      {f.excerpt && (
        <pre
          className="mt-3 overflow-x-auto rounded-md border px-3 py-2 text-[11.5px] leading-relaxed"
          style={{
            fontFamily: "var(--code-font)",
            background: "var(--bpmn-bg-deep)",
            borderColor: "var(--bpmn-border-soft)",
            color: "var(--bpmn-text)",
          }}
        >
          {f.excerpt}
        </pre>
      )}

      {/* Where + sources */}
      {(f.file || f.symbol || citations.length > 0) && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {f.symbol && <MonoChip color="var(--bpmn-cyan)">{f.symbol}</MonoChip>}
          {f.file && (
            <MonoChip color="var(--bpmn-text-muted)">{f.file}</MonoChip>
          )}
          {citations.map((c, i) =>
            isUrl(c.ref) ? (
              <a
                key={i}
                href={c.ref ?? undefined}
                target="_blank"
                rel="noreferrer"
                className="inline-flex max-w-full items-center gap-1 truncate rounded border px-1.5 py-0.5 font-mono text-[9.5px] hover:underline"
                style={{
                  background: "var(--bpmn-bg-deep)",
                  borderColor: "var(--bpmn-border)",
                  color: "var(--bpmn-cyan)",
                }}
                title={c.title}
              >
                📄 {c.title} ↗
              </a>
            ) : (
              <MonoChip key={i} color="var(--bpmn-text-muted)">
                📄 {c.title}
              </MonoChip>
            )
          )}
        </div>
      )}

      {/* The documented claim, verbatim */}
      {quoted && (
        <div className="mt-3">
          <Eyebrow>The docs say</Eyebrow>
          <blockquote
            className="mt-1 border-l-2 pl-3 text-[12.5px] leading-relaxed"
            style={{
              borderColor: "var(--bpmn-border-em)",
              fontFamily: "var(--reading-font)",
              fontStyle: "italic",
              color: "var(--bpmn-text-muted)",
            }}
          >
            “{quoted.quote!.trim()}”
            <span
              className="ml-2 font-mono text-[9.5px] not-italic"
              style={{ color: "var(--bpmn-text-dim)" }}
            >
              — {quoted.title}
            </span>
          </blockquote>
        </div>
      )}

      {/* How to verify */}
      {f.check && (
        <p className="mt-3 flex items-baseline gap-2">
          <Eyebrow>Verify</Eyebrow>
          <span
            className="text-[12px] leading-relaxed"
            style={{
              fontFamily: "var(--reading-font)",
              color: "var(--bpmn-text-dim)",
            }}
          >
            {f.check}
          </span>
        </p>
      )}
    </article>
  );
};

const MonoChip = ({
  children,
  color,
}: {
  children: React.ReactNode;
  color: string;
}) => (
  <span
    className="inline-flex max-w-full items-center gap-1 truncate rounded border px-1.5 py-0.5 font-mono text-[9.5px]"
    style={{
      background: "var(--bpmn-bg-deep)",
      borderColor: "var(--bpmn-border)",
      color,
    }}
  >
    {children}
  </span>
);

const ConsultedFooter = ({
  consulted,
}: {
  consulted: { title: string; ref?: string | null }[];
}) => {
  if (consulted.length === 0) return null;
  return (
    <footer
      className="mt-8 border-t pt-4"
      style={{ borderColor: "var(--bpmn-border-soft)" }}
    >
      <Eyebrow>Knowledge consulted</Eyebrow>
      <p
        className="mt-1 mb-2 text-[11.5px]"
        style={{
          fontFamily: "var(--reading-font)",
          fontStyle: "italic",
          color: "var(--bpmn-text-dim)",
        }}
      >
        The agent read these while auditing.
      </p>
      <ul className="flex flex-col gap-1">
        {consulted.map((d, i) => (
          <li
            key={i}
            className="font-mono text-[11px]"
            style={{ color: "var(--bpmn-text-dim)" }}
          >
            {isUrl(d.ref) ? (
              <a
                href={d.ref ?? undefined}
                target="_blank"
                rel="noreferrer"
                className="hover:underline"
                style={{ color: "var(--bpmn-text-muted)" }}
              >
                {d.title} ↗
              </a>
            ) : (
              d.title
            )}
          </li>
        ))}
      </ul>
    </footer>
  );
};

const AllClear = ({
  consulted,
}: {
  consulted: { title: string; ref?: string | null }[];
}) => (
  <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-2 px-8 py-16 text-center">
    <p
      className="text-[16px]"
      style={{
        fontFamily: "var(--bpmn-font-display)",
        fontStyle: "italic",
        color: "var(--bpmn-text)",
      }}
    >
      No findings.
    </p>
    <p
      className="max-w-md text-[13px] leading-relaxed"
      style={{
        fontFamily: "var(--reading-font)",
        color: "var(--bpmn-text-muted)",
      }}
    >
      The change is coherent with everything the knowledge base says about
      these components.
    </p>
    <div className="mt-6 w-full max-w-md text-left">
      <ConsultedFooter consulted={consulted} />
    </div>
  </div>
);

export default FindingsPage;
