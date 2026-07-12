import { useAnalysis } from "@/store/use-analysis-store";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { buildTourSteps, type TourStep } from "./tour-steps";
import { tourSeen, useTour } from "./tour-store";

/**
 * Guided onboarding tour — a hand-rolled spotlight overlay (no deps; the
 * report is a self-contained singlefile). Auto-starts once per browser on
 * the journeys board, re-launchable forever from the rail's Tour button.
 *
 * Resilience contract: a missing target auto-advances after a short wait,
 * Esc always exits, unmount clears every timer — the tour can never trap
 * the user or wedge the overlay (comprehension aid, not a modal prison).
 */

const CARD_W = 330;
const MARGIN = 14;
/** Poll budget for a target to appear after a route change. */
const WAIT_MS = 2500;
const POLL_MS = 120;

interface Cutout {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const Tour = () => {
  const active = useTour((s) => s.active);
  const step = useTour((s) => s.step);
  const setStep = useTour((s) => s.setStep);
  const stop = useTour((s) => s.stop);
  const start = useTour((s) => s.start);

  const transformedData = useAnalysis((s) => s.transformedData);
  const navigate = useNavigate();
  const location = useLocation();

  // Step script — rebuilt per activation from what THIS report contains.
  const steps: TourStep[] = useMemo(() => {
    const firstSlug = transformedData?.chapters?.[0]?.slug ?? null;
    return buildTourSteps({
      firstChapterPath: firstSlug
        ? `/journeys/${encodeURIComponent(firstSlug)}`
        : null,
      hasSpecs: transformedData?.specs != null,
      hasFindings: transformedData?.findings != null,
      hasPR: transformedData?.prOverlay != null,
    });
  }, [transformedData]);

  const current = active ? steps[step] : undefined;
  const [cutout, setCutout] = useState<Cutout | null>(null);
  const [settled, setSettled] = useState(false);

  const reduceMotion = useMemo(
    () =>
      typeof matchMedia !== "undefined" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches,
    []
  );

  const finish = useCallback(() => {
    stop("done");
    navigate("/journeys", { replace: true });
  }, [stop, navigate]);

  const advance = useCallback(() => {
    if (step >= steps.length - 1) finish();
    else setStep(step + 1);
  }, [step, steps.length, setStep, finish]);

  // Auto-start: first visit, journeys board, data on screen. One shot per
  // mount; the 800ms beat lets the board's entrance settle first.
  const autoTried = useRef(false);
  useEffect(() => {
    if (autoTried.current || active || tourSeen() || !transformedData) return;
    if (!location.pathname.startsWith("/journeys")) return;
    autoTried.current = true;
    const t = window.setTimeout(() => start(), 800);
    return () => window.clearTimeout(t);
  }, [active, transformedData, location.pathname, start]);

  // Per-step engine: route there if needed, then wait for the target and
  // track its rect (re-measured on a slow loop so scroll/resize/layout
  // changes keep the spotlight honest).
  useEffect(() => {
    if (!active || !current) return;
    let cancelled = false;
    let waited = 0;
    // Effect-LOCAL settled flag — the state variable would be a stale
    // closure here (captured pre-reset), silently disarming the missing-
    // target auto-advance and wedging the tour on a hidden overlay.
    let found = false;
    setSettled(false);

    if (current.route && location.pathname !== current.route) {
      navigate(current.route);
      return; // effect re-runs when location changes
    }

    const measure = () => {
      if (cancelled) return;
      if (!current.target) {
        setCutout(null);
        setSettled(true);
        return;
      }
      const el = document.querySelector(current.target);
      if (el) {
        const r = el.getBoundingClientRect();
        // First sighting of a below/above-the-fold target: bring it into view.
        // Only when it isn't already visible, so on-screen anchors don't jump.
        // The poll re-measures as the scroll animates, so the spotlight tracks.
        if (
          !found &&
          (r.top < 0 ||
            r.bottom > window.innerHeight ||
            r.left < 0 ||
            r.right > window.innerWidth)
        ) {
          el.scrollIntoView({
            block: "center",
            inline: "nearest",
            behavior: reduceMotion ? "auto" : "smooth",
          });
        }
        setCutout({ x: r.left, y: r.top, w: r.width, h: r.height });
        found = true;
        setSettled(true);
      } else if (!found) {
        waited += POLL_MS;
        if (waited >= WAIT_MS) {
          cancelled = true;
          advance(); // target never came — move on
        }
      }
    };

    measure();
    const iv = window.setInterval(measure, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(iv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, step, current?.id, location.pathname]);

  // Esc exits from anywhere, capture-phase so page-level Esc handlers
  // (chapter's back-to-index) don't fire underneath the tour.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        stop("skipped");
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [active, stop]);

  if (!active || !current || !settled) return null;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // A cutout that is basically the whole content area (BPMN plate, canvas)
  // still reads fine — the dim covers only the rail — but the card should
  // then sit centered-low instead of "beside" a rect that has no outside.
  const huge = cutout != null && cutout.w * cutout.h > vw * vh * 0.55;

  const transition = reduceMotion ? "none" : "all 250ms cubic-bezier(.2,.7,.2,1)";
  const dim = "rgba(6, 9, 18, 0.64)";

  // Card position: beside the cutout per placement, clamped to viewport.
  let cardLeft = vw / 2 - CARD_W / 2;
  let cardTop = vh * 0.6;
  if (cutout && !huge) {
    const p = current.placement ?? "bottom";
    if (p === "right") {
      cardLeft = cutout.x + cutout.w + MARGIN;
      cardTop = cutout.y;
    } else if (p === "left") {
      cardLeft = cutout.x - CARD_W - MARGIN;
      cardTop = cutout.y;
    } else if (p === "top") {
      cardLeft = cutout.x + cutout.w / 2 - CARD_W / 2;
      cardTop = cutout.y - MARGIN - 190;
    } else {
      cardLeft = cutout.x + cutout.w / 2 - CARD_W / 2;
      cardTop = cutout.y + cutout.h + MARGIN;
    }
  } else if (cutout && huge) {
    cardLeft = cutout.x + cutout.w / 2 - CARD_W / 2;
    cardTop = vh - 230;
  } else {
    cardTop = vh / 2 - 120;
  }
  cardLeft = Math.max(MARGIN, Math.min(cardLeft, vw - CARD_W - MARGIN));
  cardTop = Math.max(MARGIN, Math.min(cardTop, vh - 230));

  const last = step === steps.length - 1;

  return (
    <div
      className="fixed inset-0 z-[120]"
      role="dialog"
      aria-modal="true"
      aria-label="Report tour"
    >
      {/* Backdrop — four panes around the cutout (or one full pane). They
          swallow clicks so a stray click can't lose the user's place; Skip
          is always on the card. */}
      {cutout ? (
        <>
          <Pane style={{ left: 0, top: 0, width: vw, height: cutout.y, background: dim, transition }} />
          <Pane style={{ left: 0, top: cutout.y, width: cutout.x, height: cutout.h, background: dim, transition }} />
          <Pane style={{ left: cutout.x + cutout.w, top: cutout.y, width: Math.max(0, vw - cutout.x - cutout.w), height: cutout.h, background: dim, transition }} />
          <Pane style={{ left: 0, top: cutout.y + cutout.h, width: vw, height: Math.max(0, vh - cutout.y - cutout.h), background: dim, transition }} />
          {/* Spotlight ring */}
          <div
            className="pointer-events-none absolute rounded-[10px]"
            style={{
              left: cutout.x - 3,
              top: cutout.y - 3,
              width: cutout.w + 6,
              height: cutout.h + 6,
              border: "1.5px solid var(--bpmn-cyan)",
              boxShadow: "0 0 0 4px color-mix(in srgb, var(--bpmn-cyan) 22%, transparent)",
              transition,
            }}
          />
        </>
      ) : (
        <Pane style={{ inset: 0, background: dim, transition }} />
      )}

      {/* Card */}
      <div
        className="absolute flex flex-col gap-2 rounded-lg border p-4 shadow-2xl"
        style={{
          left: cardLeft,
          top: cardTop,
          width: CARD_W,
          background: "var(--bpmn-surface)",
          borderColor: "var(--bpmn-border-em)",
          transition,
        }}
      >
        <div
          className="text-[10px] font-semibold tracking-[0.22em] uppercase"
          style={{ fontFamily: "var(--bpmn-font-mono)", color: "var(--bpmn-cyan)" }}
        >
          Tour · {step + 1}/{steps.length}
        </div>
        <div
          className="text-[16px] font-semibold"
          style={{ fontFamily: "var(--bpmn-font-display)", color: "var(--bpmn-text)" }}
        >
          {current.title}
        </div>
        <p
          className="m-0 text-[13px] leading-relaxed"
          style={{ fontFamily: "var(--reading-font)", color: "var(--bpmn-text-muted)" }}
        >
          {current.body}
        </p>
        <div className="mt-1 flex items-center gap-2">
          <button
            type="button"
            onClick={() => stop("skipped")}
            className="cursor-pointer text-[11px] underline decoration-dotted underline-offset-2 opacity-70 hover:opacity-100"
            style={{ fontFamily: "var(--bpmn-font-mono)", color: "var(--bpmn-text-dim)" }}
          >
            Skip tour
          </button>
          <span className="flex-1" />
          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              className="cursor-pointer rounded-md border px-3 py-1.5 text-[11.5px]"
              style={{
                fontFamily: "var(--bpmn-font-mono)",
                borderColor: "var(--bpmn-border)",
                color: "var(--bpmn-text-muted)",
              }}
            >
              Back
            </button>
          )}
          <button
            type="button"
            onClick={advance}
            autoFocus
            className="cursor-pointer rounded-md border px-3 py-1.5 text-[11.5px] font-semibold"
            style={{
              fontFamily: "var(--bpmn-font-mono)",
              borderColor: "var(--bpmn-cyan)",
              color: "var(--bpmn-cyan)",
              background: "color-mix(in srgb, var(--bpmn-cyan) 10%, transparent)",
            }}
          >
            {last ? "Explore →" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
};

const Pane = ({ style }: { style: React.CSSProperties }) => (
  <div className="absolute" style={style} />
);

export default Tour;
