/**
 * BpmnStepFunctions — the right-hand rail of the Business flow view.
 *
 * The business flow shows NO call graph (hierarchy: Overview → flow OR
 * call graph). Instead, selecting a step lists the FUNCTIONS that
 * implement it — one on-demand lens strip per cited method (same
 * pattern the Drift Map uses: strip names the method, the body renders
 * only when asked). A step may cite one function or several; all are
 * listed.
 *
 * Source of truth per strip: the element's code_evidence (v5+ rich
 * citations: fqn + file + business comment + snippet). Body lookup
 * order: chapter step body (carries the PR-head source) → global
 * method index → the evidence snippet (verbatim slice) as fallback.
 */
import { useState } from 'react';
import { STATUS_STYLES, type ChangeStatus } from "@/lib/status-colors";
import { Maximize2, Minimize2, X } from 'lucide-react';
import DiffBlock from './DiffBlock';
import { LeftResizeHandle } from './code-resize';
// Desktop adaptation: journeyTypes is split — Chapter from types/journey,
// BpmnElement from the renderer's types module; data getters come from
// the parity-loader (store-backed, same signatures as the webapp).
import type { Chapter } from '@/types/journey';
import type { BpmnElement } from '@/components/bpmn/types';
import { getMethodInfo } from '@/data/parity-loader';
import { CodeHighlight, langFromFile } from '@/components/ui/CodeHighlight';

const stripArgs = (s: string) => s.replace(/\(.*$/, '').trim();
const shortName = (fqn: string) => {
  const parts = stripArgs(fqn).split('.');
  return parts.slice(-2).join('.');
};

// Status accent — the theme-aware brand token (var(--bpmn-mint|amber|rose)),
// so a modified strip is amber/brown and an added one green in BOTH dark and
// paper, matching the call graph and BPMN element accents. (Was hardcoded to
// the paper-only tones, which looked muted/wrong in the dark theme.)
const statusSolid = (s?: string | null): string =>
  (s && STATUS_STYLES[s as ChangeStatus]?.solid) || 'var(--bpmn-text-dim)';

interface FnRef {
  fqn: string;
  file?: string;
  comment?: string;
  snippet?: string;
}

/** Collect the selected element's function references — rich evidence
 *  first, legacy bare FQNs as fallback — deduped by paramless FQN. */
function functionRefs(element: BpmnElement): FnRef[] {
  const out: FnRef[] = [];
  const seen = new Set<string>();
  for (const ev of element.code_evidence ?? []) {
    const key = stripArgs(ev.fqn);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ fqn: ev.fqn, file: ev.file, comment: ev.comment, snippet: ev.snippet });
  }
  for (const fqn of element.code_fqns ?? []) {
    const key = stripArgs(fqn);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ fqn });
  }
  return out;
}

function FunctionStrip({ fn, chapter, onOpenCallGraph, defaultOpen }: {
  fn: FnRef; chapter: Chapter; onOpenCallGraph?: (fqn: string) => void;
  /** Start expanded regardless of PR status — used by the docked CODE
   *  panel, whose whole job is to show the code the moment it opens. */
  defaultOpen?: boolean;
}) {
  // PR-head body from the journey's own steps beats the global index
  // (it is what the analysis actually fetched); evidence snippet last.
  const step = chapter.steps.find(
    s => s.fqn === fn.fqn || stripArgs(s.fqn) === stripArgs(fn.fqn),
  );
  const body = step?.body || getMethodInfo(fn.fqn)?.body || getMethodInfo(stripArgs(fn.fqn))?.body || fn.snippet || '';
  const prStatus = step?.prStatus;
  const changed = prStatus === 'modified' || prStatus === 'added';
  const canDiff = prStatus === 'modified' && !!step?.beforeBody && !!body;
  // A modified function leads with WHAT CHANGED: auto-expand it and show the
  // unified diff first (the head source is one toggle away). Unchanged
  // functions stay collapsed/skimmable. This is a PR review — the change is
  // the content.
  const [open, setOpen] = useState(canDiff || !!defaultOpen);
  // Expanded = no height cap; the popup body scrolls instead. The cap
  // keeps multiple open strips skimmable, the toggle gives full reads.
  const [tall, setTall] = useState(false);
  // modified functions can flip between the unified diff and head source
  const [showDiff, setShowDiff] = useState(canDiff);
  return (
    <div
      className="mt-2 rounded-sm overflow-hidden"
      style={{
        border: '1px solid var(--bpmn-border-soft)',
        // CHANGED functions are why the reviewer is here — give the
        // strip itself the status accent, not just the chip.
        borderLeft: changed
          ? `3px solid ${statusSolid(prStatus)}`
          : '1px solid var(--bpmn-border-soft)',
      }}
    >
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-baseline gap-2 px-2.5 py-1.5 text-left text-[10.5px] font-mono cursor-pointer"
        style={{ background: 'color-mix(in srgb, var(--bpmn-bg-deep) 88%, var(--bpmn-text))', color: 'var(--bpmn-text-muted)' }}
        aria-expanded={open}
        title={body ? (open ? 'Collapse source' : 'Show this function') : 'No source available'}
      >
        {prStatus && (
          <span style={{ color: statusSolid(prStatus) }}>{prStatus}</span>
        )}
        <span style={{ color: 'var(--bpmn-cyan)' }}>{shortName(fn.fqn)}</span>
        {fn.file && <span className="truncate" style={{ color: 'var(--bpmn-text-dim)' }}>{fn.file}</span>}
        <span className="ml-auto shrink-0" style={{ color: 'var(--bpmn-text-dim)' }}>
          {body ? (open ? '▾' : '▸ code') : 'no source'}
        </span>
      </button>
      {/* secondary actions — under the lens strip, only when open */}
      {open && (onOpenCallGraph || canDiff) && (
        <div className="flex items-center gap-1.5 px-2.5 py-1"
          style={{ background: 'var(--bpmn-bg-deep)', borderTop: '1px solid var(--bpmn-border-soft)' }}>
          {canDiff && (
            <button
              onClick={() => setShowDiff(d => !d)}
              aria-pressed={showDiff}
              className="text-[9.5px] font-mono px-1.5 py-0.5 rounded-sm transition-colors"
              style={{
                color: showDiff ? 'var(--bpmn-amber)' : 'var(--bpmn-text-dim)',
                border: `1px solid ${showDiff ? 'color-mix(in srgb, var(--bpmn-amber) 45%, transparent)' : 'var(--bpmn-border-soft)'}`,
              }}
              title={showDiff ? 'Show current source' : 'Show what this PR changed (unified diff)'}
            >
              Δ {showDiff ? 'showing diff' : 'what changed'}
            </button>
          )}
          {onOpenCallGraph && (
            <button
              onClick={() => onOpenCallGraph(fn.fqn)}
              className="text-[9.5px] font-mono px-1.5 py-0.5 rounded-sm transition-colors"
              style={{ color: 'var(--bpmn-cyan)', border: '1px solid color-mix(in srgb, var(--bpmn-cyan) 35%, transparent)' }}
              title="See what happens underneath — open the call graph focused on this function"
            >
              ⌁ call graph beneath
            </button>
          )}
        </div>
      )}
      {open && (
        <div className="relative" style={{ borderTop: '1px solid var(--bpmn-border-soft)', background: 'var(--bpmn-bg-deep)' }}>
          {fn.comment && (
            <div className="px-3 pt-2 text-[10.5px] leading-relaxed" style={{ color: 'var(--bpmn-text-muted)' }}>
              {fn.comment}
            </div>
          )}
          {body && showDiff && step?.beforeBody && (
            <div className="px-2 py-2">
              <DiffBlock before={step.beforeBody} after={body} lang={langFromFile(fn.file || getMethodInfo(fn.fqn)?.filePath)} maxHeight={tall ? undefined : 320} />
            </div>
          )}
          {body && !showDiff && (
            <>
              <button
                onClick={() => setTall(t => !t)}
                aria-label={tall ? 'Collapse code height' : 'Expand code to full height'}
                title={tall ? 'Collapse code height' : 'Expand code to full height'}
                className="absolute top-1.5 right-1.5 z-10 p-1.5 rounded-md transition-colors"
                style={{
                  color: 'var(--bpmn-text-dim)',
                  background: 'color-mix(in srgb, var(--bpmn-bg-deep) 75%, transparent)',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--bpmn-text)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--bpmn-text-dim)'; }}
              >
                {tall ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
              </button>
              <pre
                className="px-3 py-2 m-0 overflow-auto whitespace-pre"
                style={tall ? {} : { maxHeight: 320 }}
              ><CodeHighlight code={body} lang={langFromFile(fn.file || getMethodInfo(fn.fqn)?.filePath)} /></pre>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const TYPE_LABEL: Record<string, string> = {
  'service-task': 'task',
  'user-task': 'task',
  'exclusive-gateway': 'decision',
  'parallel-gateway': 'parallel',
  'start-event': 'start',
  'end-event': 'outcome',
  'call-activity': 'sub-journey',
  'missing-call-activity': 'sub-journey',
};

/** Floating glass card over the diagram (parent positions it). */
export function BpmnStepFunctions({ element, chapter, onClose, onOpenCallGraph, hideHeader, defaultOpen, bare }: {
  element: BpmnElement | null;
  chapter: Chapter;
  onClose?: () => void;
  /** Swap-navigation into the call graph focused on one of this step's
   *  functions — popup-on-popup is solved by REPLACING the context,
   *  not stacking it (the code panel's "step:" chip is the way back). */
  onOpenCallGraph?: (fqn: string) => void;
  /** Drop the internal step-identity header + close button. The docked
   *  CODE panel wraps this and supplies its own chrome (label, width
   *  controls, minimize), so the embedded list stays header-less. */
  hideHeader?: boolean;
  /** Expand every function strip on mount (code shown immediately). */
  defaultOpen?: boolean;
  /** Strip the glass-card chrome (background / border / shadow / radius)
   *  so the list blends into a host panel instead of reading as a card. */
  bare?: boolean;
}) {
  if (!element) return null;
  const fns = functionRefs(element);
  // Changed functions first — they are why the reviewer opened this.
  const rank = (f: FnRef) => {
    const st = chapter.steps.find(s => s.fqn === f.fqn || stripArgs(s.fqn) === stripArgs(f.fqn))?.prStatus;
    return st === 'modified' || st === 'added' ? 0 : st ? 1 : 2;
  };
  fns.sort((a, b) => rank(a) - rank(b));
  return (
    <div
      className={`relative flex-1 min-w-0 flex flex-col overflow-hidden ${bare ? '' : 'rounded-xl'}`}
      style={
        bare
          ? { background: 'transparent' }
          : {
              background: 'color-mix(in srgb, var(--bpmn-bg-deep) 82%, transparent)',
              backdropFilter: 'blur(14px) saturate(1.15)',
              WebkitBackdropFilter: 'blur(14px) saturate(1.15)',
              border: '1px solid color-mix(in srgb, var(--bpmn-cyan) 16%, var(--bpmn-border-soft))',
              boxShadow: '0 14px 40px rgb(0 0 0 / 0.45), 0 2px 8px rgb(0 0 0 / 0.3)',
            }
      }
    >
      {/* Drag-to-resize the dialog (centred → factor 2). The docked CODE
          panel hides this header and supplies its own handle instead. */}
      {!hideHeader && <LeftResizeHandle factor={2} />}
      {/* header — step identity + width controls + dismiss */}
      {!hideHeader && <div
        className="shrink-0 flex items-start gap-2.5 px-3.5 pt-3 pb-2.5"
        style={{ borderBottom: '1px solid var(--bpmn-border-soft)' }}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span
              className="text-[8.5px] font-mono uppercase px-1.5 py-px rounded-sm"
              style={{
                color: 'var(--bpmn-cyan)',
                border: '1px solid color-mix(in srgb, var(--bpmn-cyan) 35%, transparent)',
                letterSpacing: 1.2,
              }}
            >
              {TYPE_LABEL[element.type] ?? 'step'}
            </span>
            <span className="text-[9.5px] font-mono" style={{ color: 'var(--bpmn-text-dim)' }}>
              {fns.length} function{fns.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="mt-1.5 text-[12.5px] leading-snug" style={{ color: 'var(--bpmn-text)' }}>
            {element.label}
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close step functions"
            title="Close (or click the canvas background)"
            className="shrink-0 -mr-1.5 -mt-1 p-2 rounded-md transition-colors"
            style={{ color: 'var(--bpmn-text-dim)' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--bpmn-text)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--bpmn-text-dim)'; }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>}
      {/* body — the lens strips, code on demand. flex-1 + min-h-0 makes THIS
          the bounded scroll region (was unconstrained → content clipped by
          the parent's overflow-hidden and only the scrollbar could move it;
          now a two-finger/wheel scroll moves the whole list). */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3">
        {fns.length === 0 && (
          <div className="mt-2.5 px-0.5 text-[10.5px] font-mono leading-relaxed" style={{ color: 'var(--bpmn-text-dim)' }}>
            No functions cited on this element — start/end events carry none.
          </div>
        )}
        {fns.map(fn => <FunctionStrip key={fn.fqn} fn={fn} chapter={chapter} onOpenCallGraph={onOpenCallGraph} defaultOpen={defaultOpen} />)}
      </div>
    </div>
  );
}
