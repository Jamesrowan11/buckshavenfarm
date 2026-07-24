"use client";

import { useEffect, useRef } from "react";

/**
 * Fit-to-screen for the barn TV displays.
 * Measures the rendered board and scales it so it always fills the screen
 * with no scrolling — shrinks when the horse list is long, grows on big
 * sparse screens. Re-fits on resize/rotation; the page itself reloads
 * every 60s, so content changes re-fit too.
 */
export default function TvFit({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let raf = 0;
    // Height of the board if rendered at scale s (wider layout when s < 1,
    // so text re-wraps — that's why this must be measured, not derived).
    const measureAt = (s: number) => {
      el.style.transform = "none";
      el.style.height = "";
      el.style.width = `${100 / s}%`;
      return el.scrollHeight * s;
    };
    const fit = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.transform = "none";
        el.style.width = "";
        el.style.height = "";
        if (!el.scrollHeight) return;
        // available height = viewport minus the container's padding above/below
        const top = el.getBoundingClientRect().top;
        const avail = Math.max(100, window.innerHeight - top * 2);
        // Binary-search the largest scale whose (re-wrapped) height fits.
        // Monotonic: bigger scale → narrower layout → taller content.
        let lo = 0.35; // readability floor
        let hi = 2.5; // don't blow up a 2-horse board absurdly
        if (measureAt(hi) <= avail) {
          lo = hi;
        } else if (measureAt(lo) > avail) {
          hi = lo; // even the floor overflows — clamp there, slight clip beats unreadable
        } else {
          for (let i = 0; i < 9; i++) {
            const mid = (lo + hi) / 2;
            if (measureAt(mid) <= avail) lo = mid;
            else hi = mid;
          }
        }
        const scale = lo;
        el.style.width = `${100 / scale}%`;
        const natural = el.scrollHeight;
        el.style.transformOrigin = "top left";
        el.style.transform = `scale(${scale})`;
        el.style.height = `${natural * scale}px`; // collapse layout box → no scrolling
      });
    };

    fit();
    // fonts/layout settle a moment after hydration
    const t1 = setTimeout(fit, 150);
    const t2 = setTimeout(fit, 600);
    window.addEventListener("resize", fit);
    window.addEventListener("orientationchange", fit);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", fit);
      window.removeEventListener("orientationchange", fit);
    };
  }, []);

  return <div ref={ref}>{children}</div>;
}
