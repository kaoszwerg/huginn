import { useEffect, useState, type RefObject } from "react";

/** Tracks the per-view scroll area inside a shared container and exposes a scroll-to-top action.
 *
 * Each view has its own scroll area, so we listen on the shared parent (`<main>`) in the capture
 * phase — scroll doesn't bubble, but capture reaches ancestors — and remember whichever descendant
 * actually scrolled. `canTop` flips on past a threshold; `scrollToTop` returns that element to the top
 * (smooth, or instant under reduced-motion). `resetKey` (the active view) clears the state on
 * navigation. The consumer renders the control itself (e.g. in the status bar), so it overlaps no
 * content and is never covered. */
export function useScrollTop(
  parent: RefObject<HTMLElement | null>,
  resetKey: unknown,
): { canTop: boolean; scrollToTop: () => void } {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [canTop, setCanTop] = useState(false);

  // Reset on navigation by adjusting state during render (React's sanctioned pattern) rather than in
  // an effect — the previous view's scroll area is gone, so the control must hide.
  const [seenKey, setSeenKey] = useState(resetKey);
  if (seenKey !== resetKey) {
    setSeenKey(resetKey);
    setCanTop(false);
    setTarget(null);
  }

  useEffect(() => {
    const p = parent.current;
    if (!p) return;
    const onScroll = (e: Event) => {
      const el = e.target;
      if (!(el instanceof HTMLElement)) return;
      setTarget(el);
      setCanTop(el.scrollTop > 300);
    };
    p.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => p.removeEventListener("scroll", onScroll, true);
  }, [parent]);

  const scrollToTop = () => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    target?.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  };

  return { canTop, scrollToTop };
}
