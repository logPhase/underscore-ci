/**
 * FlowNarrative — the business flow in sentences, above the diagram.
 *
 * The diagram agent writes an `intent` (one line: what this journey decides)
 * and a `narrative` (a paragraph walking the flow in business voice) for
 * every diagram it draws. Both shipped in every report and NOTHING rendered
 * them — the reader got boxes and arrows to decode while the prose that
 * explains them sat unread in the payload ("directly going to flow doesn't
 * show the business flow in natural language").
 *
 * The intent is always visible: it is one sentence and it is the answer to
 * "what am I looking at". The narrative paragraph is collapsible — open by
 * default because it is the point of this component, but closable because it
 * trades ~100px against the canvas.
 */
import { useState } from 'react';
import { useAnalysis } from '@/store/use-analysis-store';
import { linkTerms } from '@/lib/vocab-links';

export function FlowNarrative({ intent, narrative }: {
  intent?: string;
  narrative?: string;
}) {
  const [open, setOpen] = useState(true);
  // Known vocabulary terms render as glossary links — ambient discovery of
  // the house language, in the prose that uses it.
  const vocabTerms = useAnalysis((s) => s.transformedData?.vocabulary?.terms) ?? [];
  // Synthetic fallback diagrams carry neither field — render nothing rather
  // than an empty chrome strip.
  if (!intent && !narrative) return null;
  return (
    <div
      className="shrink-0 px-6 py-3"
      style={{
        borderBottom: '1px solid var(--bpmn-border-soft)',
        background: 'color-mix(in srgb, var(--bpmn-bg-deep) 55%, var(--bpmn-bg))',
      }}
    >
      <div className="flex items-baseline gap-2.5">
        <span
          className="shrink-0 font-mono text-[8.5px] uppercase"
          style={{ color: 'var(--bpmn-mint)', letterSpacing: 1.4 }}
        >
          the flow
        </span>
        {intent && (
          <span
            className="min-w-0 text-[13px] leading-snug"
            style={{ color: 'var(--bpmn-text)', fontWeight: 550 }}
          >
            {linkTerms(intent, vocabTerms)}
          </span>
        )}
        {narrative && (
          <button
            onClick={() => setOpen(o => !o)}
            aria-expanded={open}
            className="ml-auto shrink-0 cursor-pointer font-mono text-[9.5px] transition-colors"
            style={{ color: 'var(--bpmn-text-dim)' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--bpmn-text)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--bpmn-text-dim)'; }}
          >
            {open ? '▾ hide' : '▸ read the flow'}
          </button>
        )}
      </div>
      {open && narrative && (
        <p
          className="mt-1.5 max-w-[92ch] text-[12.5px] leading-relaxed"
          style={{ color: 'var(--bpmn-text-muted)', margin: '6px 0 0' }}
        >
          {linkTerms(narrative, vocabTerms)}
        </p>
      )}
    </div>
  );
}
