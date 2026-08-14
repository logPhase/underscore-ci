/**
 * CallGraphPopup — the call graph, over the diagram, focused on one function.
 *
 * The business flow answers "what happens"; the call graph answers "where".
 * Side by side neither fits, so this overlays: you stay on the diagram, get
 * the graph focused on the step you asked about, and dismiss back to exactly
 * where you were. No navigation, no lost place.
 *
 * It also answers the question the inline graph structurally cannot. That
 * graph is a downward tree built from the JOURNEY's edges, so a method whose
 * caller falls outside the journey slice has no inbound edge and gets drawn
 * as an entry point (observed on iris PR-685:
 * RecordBarrierOpenAsShadowEventAsync rendered as a starting method while the
 * global map plainly recorded DispatchActuationAsync calling it). The
 * "Called by" strip reads the GLOBAL call map, so a root node can say which
 * it is: a real entry point, or merely a root of this slice.
 */
import { useEffect } from 'react';
import { X } from 'lucide-react';
// The SAME component the page renders inline below the diagram. Reaching
// for './CallFlowGraph' instead gives a DIFFERENT graph — a React Flow
// canvas whose nodes drag around under the pointer and whose layout does
// not match the one the reader already knows. Two renderings of the same
// call graph is a bug, not a choice: the popup exists to bring that graph
// closer, not to introduce a second dialect of it.
import CallFlowChart from './CallFlowChart';
import { getCallers, lookupPrChange } from '@/data/parity-loader';
import { STATUS_STYLES, type ChangeStatus } from '@/lib/status-colors';
import type { Chapter } from '@/types/journey';

const stripArgs = (s: string) => s.replace(/\(.*$/, '').trim();
const shortName = (fqn: string) => stripArgs(fqn).split('.').slice(-2).join('.');

const statusSolid = (s?: string | null): string =>
  (s && STATUS_STYLES[s as ChangeStatus]?.solid) || 'var(--bpmn-text-dim)';

export function CallGraphPopup({
  chapter,
  focusFqn,
  stepLabel,
  expanded,
  onToggleExpand,
  onExpandAll,
  onCollapseAll,
  scrollRequestRef,
  onFocusFunction,
  onClose,
}: {
  chapter: Chapter;
  focusFqn: string;
  /** The business-flow label the reader clicked — the bridge between the
   *  two views, so the popup doesn't read as an unrelated screen. */
  stepLabel?: string;
  expanded: Set<string>;
  onToggleExpand: (fqn: string) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  scrollRequestRef?: React.MutableRefObject<string | null>;
  /** Re-focus the popup on another function (a caller) without closing. */
  onFocusFunction: (fqn: string) => void;
  onClose: () => void;
}) {
  // Escape closes — a popup you can't dismiss by reflex is a trap.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const callers = getCallers(focusFqn);
  const status = lookupPrChange(focusFqn);
  // Callers the journey's own step list doesn't contain — the reason this
  // node looked like an entry point.
  const stepFqns = new Set((chapter.steps || []).map(s => stripArgs(s.fqn)));
  const outsideJourney = callers.filter(c => !stepFqns.has(stripArgs(c)));

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center p-6"
      // Click-through dismissal on the scrim only; the panel stops it.
      onPointerDown={onClose}
    >
      <div
        className="absolute inset-0 bpmn-popup-scrim"
        style={{ background: 'rgb(0 0 0 / 0.55)', backdropFilter: 'blur(3px)' }}
      />
      <div
        className="bpmn-popup-frame relative flex w-full max-w-5xl flex-col overflow-hidden rounded-xl"
        style={{
          height: '86%',
          background: 'var(--bpmn-bg)',
          border: '1px solid color-mix(in srgb, var(--bpmn-cyan) 22%, var(--bpmn-border))',
          boxShadow: '0 24px 70px rgb(0 0 0 / 0.6)',
        }}
        onPointerDown={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Call graph focused on ${shortName(focusFqn)}`}
      >
        {/* header — which step, which function, what changed */}
        <div
          className="shrink-0 px-4 pt-3 pb-2.5"
          style={{ borderBottom: '1px solid var(--bpmn-border-soft)' }}
        >
          <div className="flex items-start gap-3">
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
                  call graph
                </span>
                {status && (
                  <span className="text-[9.5px] font-mono" style={{ color: statusSolid(status) }}>
                    {status}
                  </span>
                )}
              </div>
              {stepLabel && (
                <div className="mt-1.5 text-[12.5px] leading-snug" style={{ color: 'var(--bpmn-text)' }}>
                  {stepLabel}
                </div>
              )}
              <div className="mt-0.5 text-[10.5px] font-mono truncate" style={{ color: 'var(--bpmn-cyan)' }}>
                {shortName(focusFqn)}
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close call graph"
              title="Close (Esc)"
              className="shrink-0 -mr-1 -mt-1 p-2 rounded-md transition-colors"
              style={{ color: 'var(--bpmn-text-dim)' }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--bpmn-text)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--bpmn-text-dim)'; }}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Called by — the inline graph cannot show this at all. */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[9.5px] font-mono" style={{ color: 'var(--bpmn-text-dim)' }}>
              called by
            </span>
            {callers.length === 0 && (
              <span className="text-[9.5px] font-mono" style={{ color: 'var(--bpmn-text-muted)' }}>
                nothing in this repo — a real entry point
              </span>
            )}
            {callers.slice(0, 6).map(c => (
              <button
                key={c}
                onClick={() => onFocusFunction(c)}
                title={`${c}\n\nFocus the graph here`}
                className="text-[9.5px] font-mono px-1.5 py-0.5 rounded-sm transition-colors"
                style={{
                  color: 'var(--bpmn-text-muted)',
                  border: '1px solid var(--bpmn-border-soft)',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--bpmn-cyan)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--bpmn-text-muted)'; }}
              >
                {shortName(c)}
              </button>
            ))}
            {callers.length > 6 && (
              <span className="text-[9.5px] font-mono" style={{ color: 'var(--bpmn-text-dim)' }}>
                +{callers.length - 6}
              </span>
            )}
          </div>
          {outsideJourney.length > 0 && (
            <div className="mt-1 text-[9.5px] leading-relaxed" style={{ color: 'var(--bpmn-amber)' }}>
              {outsideJourney.length} of these {outsideJourney.length === 1 ? 'callers is' : 'callers are'} outside
              this journey, so the graph below draws this function as a root. It is not an entry point.
            </div>
          )}
        </div>

        {/* the graph itself, focused by the parent before mount */}
        <div className="min-h-0 flex-1 overflow-auto">
          <CallFlowChart
            chapter={chapter}
            compact={false}
            expanded={expanded}
            onToggleExpand={onToggleExpand}
            onExpandAll={onExpandAll}
            onCollapseAll={onCollapseAll}
            scrollRequestRef={scrollRequestRef}
          />
        </div>
      </div>
    </div>
  );
}
