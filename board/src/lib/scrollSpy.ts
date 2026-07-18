// Scroll-spy for the sidebar outline (spec R2). Observes only the elements the
// caller's selector names (PlanReader: [data-outline-id] section headings —
// H3s and the H1 must never clear the active state; Reports: all headings).
// Returns the ELEMENT; callers map it to their outline-entry id. Resets on
// dependency change so a new document never inherits the old highlight.
//
// Implementation note (v0.21 live-validation fix): NOT IntersectionObserver.
// IO only reports threshold CROSSINGS — a jump-scroll (outline click, fast
// wheel, scrollTo) moves a heading from below the reading band to above the
// viewport between two frames, so its state samples false→false and no
// callback ever fires; the spy never activated in a real browser. A
// rAF-throttled scroll listener reading live geometry is deterministic for
// every scroll source, and querying headings lazily per tick also survives
// re-renders that replace heading nodes.
import { useEffect, useState, type RefObject } from "react";

export function prefersReducedMotion(): boolean {
  return typeof matchMedia !== "undefined" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** The active heading is the LAST one whose top has risen above the reading
 * band (the top 30% of the viewport) — i.e. the section you are inside. */
const READING_BAND = 0.3;

export function useScrollSpy(
  ref: RefObject<HTMLElement | null>,
  selector: string,
  deps: unknown[],
): Element | null {
  const [active, setActive] = useState<Element | null>(null);
  useEffect(() => {
    setActive(null);
    const host = ref.current;
    if (!host) return;
    const compute = () => {
      const headings = Array.from(host.querySelectorAll(selector));
      if (headings.length === 0) return;
      const band = window.innerHeight * READING_BAND;
      const passed = headings.filter((h) => h.getBoundingClientRect().top < band);
      setActive(passed.length ? passed[passed.length - 1] : null);
    };
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        compute();
      });
    };
    compute();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return active;
}
