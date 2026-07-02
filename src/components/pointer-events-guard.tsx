import { useEffect } from "react";

/**
 * Durable fix for the Radix "stuck body" bug.
 *
 * When a Radix modal layer (Dialog, AlertDialog, modal Popover/Dropdown/Select)
 * opens it locks `<body>` so only the layer is interactive — and clears it on
 * close. There are TWO independent body-level locks, both originating from
 * Radix / react-remove-scroll:
 *
 *   1. INLINE lock: `document.body.style.pointerEvents = "none"`, set by the
 *      DismissableLayer / scroll machinery.
 *   2. CLASS + STYLESHEET lock: react-remove-scroll (when `inert`) adds the
 *      class `block-interactivity-<id>` to `<body>` and injects a singleton
 *      `<style>` containing `.block-interactivity-<id> { pointer-events: none; }`
 *      (plus `allow-interactivity-<id> { pointer-events: all; }` on the content
 *      shard). This is a class lock, NOT an inline-style lock — clearing
 *      `body.style.pointerEvents` does nothing to it.
 *
 * If a close is interrupted (the layer unmounts while open, a navigation tears
 * it down, an animation is cut short, or the styleSingleton ref-count gets
 * stuck), one or both locks LEAK: they stay on `<body>` with no layer open, so
 * every popup — and the modal's own close button — stops receiving clicks until
 * a full reload (and the class lock can survive even that path on re-open).
 *
 * This guard clears a *stale* lock only: body locked while no Radix layer is
 * actually open. It neutralizes BOTH mechanisms:
 *   - resets `body.style.pointerEvents`,
 *   - removes any leaked `block-interactivity-*` classes,
 *   - drops a stuck `data-scroll-locked` attribute.
 * Staleness is detected via the *computed* pointer-events (so the class lock is
 * caught), and "genuinely open" requires an actually-open layer — the popper
 * content wrapper lingers in the DOM during/after its exit animation, so we
 * require a `[data-state="open"]` descendant rather than the bare wrapper, which
 * would otherwise read as a false "open" and keep the leaked lock alive.
 *
 * The check is deferred a double rAF so it never races a layer that is
 * mid-open (body locked but content not mounted yet) and clears a real modal.
 */

// A layer that is genuinely open right now. The popper wrapper alone is NOT
// enough — it stays mounted through the close/exit animation with no open
// child — so its branch additionally requires an `[data-state="open"]` node.
const OPEN_RADIX_LAYER =
  '[data-radix-popper-content-wrapper] [data-state="open"],' +
  '[data-radix-popper-content-wrapper][data-state="open"],' +
  '[role="dialog"][data-state="open"],' +
  '[role="alertdialog"][data-state="open"],' +
  '[role="menu"][data-state="open"],' +
  '[role="listbox"][data-state="open"]';

export function PointerEventsGuard(): null {
  useEffect(() => {
    let raf = 0;

    const isBodyLocked = () =>
      document.body.style.pointerEvents === "none" ||
      getComputedStyle(document.body).pointerEvents === "none";

    const clearIfStale = () => {
      if (!isBodyLocked()) return;
      if (document.querySelector(OPEN_RADIX_LAYER)) return; // genuinely open — leave locked

      // Stale: clear BOTH lock mechanisms.
      // (1) inline lock.
      document.body.style.pointerEvents = "";
      // (2) react-remove-scroll class lock — `block-interactivity-<id>` on body
      //     plus its injected `pointer-events: none` rule.
      for (const cls of [...document.body.classList]) {
        if (cls.startsWith("block-interactivity-")) {
          document.body.classList.remove(cls);
        }
      }
      // A leaked scroll-lock attribute (sets a CSS var, harmless on its own,
      // but a clear signal of an interrupted close) — drop it too.
      if (document.body.hasAttribute("data-scroll-locked")) {
        document.body.removeAttribute("data-scroll-locked");
      }
    };

    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => requestAnimationFrame(clearIfStale));
    };

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      attributes: true,
      // `class` and `data-scroll-locked` matter as much as inline `style` now.
      attributeFilter: ["style", "class", "data-scroll-locked"],
      childList: true,
    });
    const interval = window.setInterval(clearIfStale, 2000);
    schedule(); // clear a lock that already leaked before mount (e.g. on reload)

    return () => {
      observer.disconnect();
      window.clearInterval(interval);
      cancelAnimationFrame(raf);
    };
  }, []);

  return null;
}

export default PointerEventsGuard;
