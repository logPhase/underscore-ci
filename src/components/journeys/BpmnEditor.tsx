/**
 * BpmnEditor — thin wrapper around the flow-weaver `BpmnCanvas` plus
 * an interactive refinement panel.
 *
 * The agent emits a `BpmnDiagram` per journey (alias for `BpmnJourney` in
 * components/bpmn/types.ts). We hand it straight to the canvas, which
 * lays out via dagre, renders a custom SVG diagram with selection /
 * properties panel, and supports inline label edits.
 *
 * Refinement: a small floating panel (top-right) lets the user submit
 * free-form feedback ("expand this node", "this gateway is wrong").
 * Posts to the local refine-server (default 127.0.0.1:9100) which
 * routes to the live keepalive session for the journey. On success,
 * the new diagram replaces the prop in local state.
 */
import { forwardRef, useEffect, useMemo, useState } from 'react';
import { BpmnCanvas, type BpmnCanvasHandle } from '@/components/bpmn/BpmnCanvas';
// Desktop adaptation: the webapp's `@/data/journeyTypes` is split here —
// Chapter + the BpmnDiagram alias live in types/journey, BpmnElement in
// the renderer's canonical home (components/bpmn/types).
import type { BpmnDiagram, Chapter } from '@/types/journey';
import type { BpmnElement } from '@/components/bpmn/types';

export type { BpmnCanvasHandle };
import { mostProminentChange, type PrChange } from '@/data/parity-loader';
import { useAnalysis } from '@/store/use-analysis-store';
import { knowledgeByElement, type StepKnowledge } from '@/lib/transform-data/journey-knowledge';

interface Props {
  diagram: BpmnDiagram;
  /** Chapter context — used to look up method bodies for the Code
   *  references panel. Optional: panel falls back to "no source"
   *  when omitted. */
  chapter?: Chapter;
  height?: number | string;
  /** Notified whenever the user selects a BPMN element. Receives the
   *  element's `code_fqns` (empty array when nothing selected, or
   *  when the selected element has none — e.g. start/end events).
   *  Used by the parent (e.g. ChapterView) to scroll the call-graph
   *  view to the cited method. */
  onSelectedFqnsChange?: (fqns: string[]) => void;
  /** Notified with the full selected element record (or null on deselect).
   *  Lets parents read non-FQN fields like `journey_id` for call-activity
   *  drill-down — composite views consume this to navigate to a
   *  sub-journey on click. */
  onSelectedElementChange?: (element: BpmnElement | null) => void;
}

// Walk the chapter looking for a method matching `fqn`. Match strategies
// in order of precision: exact, then prefix-by-Class.Method (drop args).
const norm = (s: string) => s.replace(/\(.*$/, '').trim();

// Match the page's hostname (localhost vs 127.0.0.1 are distinct origins
// to Chrome's Private Network Access — the cross-port request is blocked
// even with permissive CORS when they don't match).
const REFINE_API =
  (typeof window !== 'undefined' && (window as any).REFINE_API_URL) ||
  (typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.hostname}:9100`
    : 'http://localhost:9100');

export const BpmnEditor = forwardRef<BpmnCanvasHandle, Props>(function BpmnEditor(
  { diagram, chapter, height = '100%', onSelectedFqnsChange, onSelectedElementChange },
  canvasRef,
) {
  const fillParent = height === '100%';

  // Refinement state: the agent may swap the diagram. Until the user
  // refines, `refined` is null and we render the prop.
  const [refined, setRefined] = useState<BpmnDiagram | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [promptText, setPromptText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastPath, setLastPath] = useState<'hot' | 'cold' | null>(null);
  const [lastLatency, setLastLatency] = useState<number | null>(null);
  // Element the user clicked on the canvas — anchors the refinement
  // so the cold path can scope source files to just this element's
  // code_fqns.
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  // Tracks the element id for which the user explicitly minimized/closed
  // the refine panel. Prevents auto-reopen-fight: clicking the same
  // element after dismissing it stays dismissed; clicking a DIFFERENT
  // element re-opens.
  const [dismissedForId, setDismissedForId] = useState<string | null>(null);

  const active = refined ?? diagram;

  // Refine UI: pill appears only when user has selected an element,
  // and the panel stays CLOSED until they click the pill. No auto-pop.
  // On deselect, force-close the panel so we don't leave a stale
  // expanded state behind.
  useEffect(() => {
    if (!selectedElementId) setPanelOpen(false);
  }, [selectedElementId]);

  // When the selection changes, fire the parent callbacks. `onSelectedFqnsChange`
  // surfaces the cited method FQNs (legacy ChapterView API). `onSelectedElementChange`
  // surfaces the full element record (used by CompositeView to read journey_id
  // on call-activity click).
  useEffect(() => {
    type Elem = { id: string; code_fqns?: string[] };
    const elem = selectedElementId
      ? (active.elements ?? []).find((e) => e.id === selectedElementId) ?? null
      : null;
    if (onSelectedFqnsChange) {
      const fqns = elem ? ((elem as Elem).code_fqns ?? []) : [];
      onSelectedFqnsChange(fqns);
    }
    if (onSelectedElementChange) {
      onSelectedElementChange(elem);
    }
  }, [selectedElementId, active, onSelectedFqnsChange, onSelectedElementChange]);

  // Per-element journey knowledge: Confluence passages + graph facts the
  // analyzer surfaced for the step whose code each BPMN element cites. Same
  // leaf-match pattern as the PR-status lookup. Scoped to the active journey
  // by journey_id. Drives the 📚 marker.
  const journeyKnowledge = useAnalysis((s) => s.transformedData.journeyKnowledge);
  const elementKnowledge = useMemo<Map<string, StepKnowledge>>(() => {
    const jid = (active as { journey_id?: string }).journey_id;
    const journey = journeyKnowledge?.journeys?.find((j) => j.journey_id === jid);
    return knowledgeByElement(active.elements as BpmnElement[], journey?.steps);
  }, [active, journeyKnowledge]);

  // Per-element PR-change status: which BPMN elements cite a method that
  // was added/modified in this PR? Computed once per diagram via set
  // intersection — pure, free, deterministic. Nothing from the LLM here.
  const elementPrStatus = useMemo<Map<string, PrChange>>(() => {
    const out = new Map<string, PrChange>();
    type Elem = { id: string; code_fqns?: string[] };
    for (const e of (active.elements ?? []) as Elem[]) {
      const change = mostProminentChange(e.code_fqns);
      if (change) out.set(e.id, change);
    }
    return out;
  }, [active]);

  const sourceLookup = useMemo(() => {
    if (!chapter) return undefined;
    const m = new Map<string, string>();
    type Step = { fqn?: string; body?: string };
    for (const s of (chapter.steps ?? []) as Step[]) {
      if (!s.fqn || !s.body) continue;
      m.set(s.fqn, s.body);
      m.set(norm(s.fqn), s.body);
    }
    return (fqn: string): string | undefined => m.get(fqn) ?? m.get(norm(fqn));
  }, [chapter]);

  const submitRefinement = async () => {
    if (!promptText.trim()) return;
    setBusy(true);
    setError(null);
    const t0 = performance.now();
    try {
      const resp = await fetch(`${REFINE_API}/api/refine`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          journey_id: (active as any).journey_id ?? (active as any).id,
          prompt: promptText.trim(),
          element_id: selectedElementId ?? undefined,
        }),
      });
      const body = await resp.json();
      if (resp.ok && body.bpmn) {
        setRefined(body.bpmn);
        setPromptText('');
        setPanelOpen(false);
        setLastPath((body.path as 'hot' | 'cold') ?? null);
        setLastLatency(Math.round(performance.now() - t0));
      } else if (resp.status === 409) {
        setError(
          body.error ??
            'No live refinement session for this diagram. Re-run the diagram pipeline to start one.'
        );
      } else {
        setError(body.error ?? `Refinement failed (HTTP ${resp.status})`);
      }
    } catch (e: any) {
      setError(
        `Could not reach refine server at ${REFINE_API}. Is it running? (${
          e?.message ?? e
        })`
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="bpmn-editor"
      style={
        fillParent
          ? { height: '100%', width: '100%', position: 'relative' }
          : { height, width: '100%', position: 'relative' }
      }
    >
      <BpmnCanvas
        ref={canvasRef}
        journey={active}
        getSource={sourceLookup}
        onSelectionChange={setSelectedElementId}
        elementPrStatus={elementPrStatus}
        elementKnowledge={elementKnowledge}
      />

      {/* PR-change legend removed per user feedback (visually noisy
          in the corner). The per-element corner badges on each node
          still indicate added/modified/deleted via colored glyphs. */}

      {/* Refine UI fully disabled per user request. State + handlers
          are still in scope so we can flip this gate to `selectedElementId`
          later without re-plumbing. To re-enable: change `false` below
          back to `selectedElementId &&`. */}
      {false && selectedElementId && (
      <div
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          zIndex: 10,
          fontFamily: 'system-ui, sans-serif',
          fontSize: 13,
        }}
      >
        {!panelOpen ? (
          // Collapsed: tiny pill with sparkle + (optional) draft chip.
          // Click anywhere on the pill to expand. Hover reveals "Refine"
          // label so it's discoverable on first use; otherwise it stays
          // out of the way.
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
            <button
              onClick={() => { setDismissedForId(null); setPanelOpen(true); }}
              title={promptText.trim() ? 'Refine (draft saved)' : 'Refine this diagram'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px',
                background: '#1e3a8a',
                color: 'white',
                border: 'none',
                borderRadius: 999,
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
                fontSize: 12,
                opacity: 0.85,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.85')}
            >
              <span aria-hidden style={{ fontSize: 13, lineHeight: 1 }}>✨</span>
              <span>Refine</span>
              {promptText.trim() && (
                <span
                  aria-hidden
                  title="Draft saved"
                  style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: '#fbbf24', display: 'inline-block', marginLeft: 2,
                  }}
                />
              )}
            </button>
            {refined && (
              <div
                style={{
                  fontSize: 10,
                  color: '#10b981',
                  background: 'rgba(16,185,129,0.1)',
                  padding: '1px 6px',
                  borderRadius: 4,
                }}
                title={`Last refinement: ${lastPath ?? '?'} path, ${
                  lastLatency ?? '?'
                }ms`}
              >
                refined ({lastPath ?? '?'}, {lastLatency ?? '?'}ms)
              </div>
            )}
          </div>
        ) : (
          <div
            style={{
              width: 360,
              background: 'white',
              border: '1px solid #d1d5db',
              borderRadius: 8,
              padding: 12,
              boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 8,
              }}
            >
              <strong>
                {selectedElementId
                  ? `Refine element "${selectedElementId}"`
                  : 'Refine this diagram'}
              </strong>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  // Minimize: collapse back to the pill but KEEP the draft
                  // text. Records dismissed-for-id so re-selecting the
                  // same element doesn't fight the user by re-opening.
                  onClick={() => {
                    setPanelOpen(false);
                    setDismissedForId(selectedElementId);
                    setError(null);
                  }}
                  title="Minimize (draft kept)"
                  aria-label="Minimize refinement panel"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 16,
                    color: '#6b7280',
                    lineHeight: 1,
                    padding: '0 4px',
                  }}
                >
                  −
                </button>
                <button
                  // Close: collapse AND discard the draft + any error.
                  // Also remembers dismissed-for-id so the panel doesn't
                  // immediately auto-reopen on the same selection.
                  onClick={() => {
                    setPanelOpen(false);
                    setDismissedForId(selectedElementId);
                    setPromptText('');
                    setError(null);
                  }}
                  title="Close (discard draft)"
                  aria-label="Close refinement panel"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 18,
                    color: '#6b7280',
                    lineHeight: 1,
                    padding: '0 4px',
                  }}
                >
                  ×
                </button>
              </div>
            </div>
            <textarea
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              placeholder='e.g. "Split the publish-event task into separate grant and deny end-events" or "The gw-feature gateway is wrong — it should check the lane direction first"'
              rows={5}
              disabled={busy}
              style={{
                width: '100%',
                fontFamily: 'inherit',
                fontSize: 13,
                padding: 8,
                border: '1px solid #d1d5db',
                borderRadius: 4,
                resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />
            {error && (
              <div
                style={{
                  marginTop: 8,
                  padding: 8,
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: 4,
                  color: '#991b1b',
                  fontSize: 12,
                }}
              >
                {error}
              </div>
            )}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: 8,
              }}
            >
              <div style={{ fontSize: 11, color: '#6b7280' }}>
                {selectedElementId
                  ? 'Scoped to this element — slim prompt, ~$0.05-0.10.'
                  : 'Whole-diagram refinement — ~$0.10-0.20.'}
              </div>
              <button
                onClick={submitRefinement}
                disabled={busy || !promptText.trim()}
                style={{
                  padding: '6px 14px',
                  background: busy || !promptText.trim() ? '#9ca3af' : '#1e3a8a',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  cursor: busy || !promptText.trim() ? 'not-allowed' : 'pointer',
                  fontSize: 13,
                }}
              >
                {busy ? 'Thinking…' : 'Submit'}
              </button>
            </div>
          </div>
        )}
      </div>
      )}
    </div>
  );
});
