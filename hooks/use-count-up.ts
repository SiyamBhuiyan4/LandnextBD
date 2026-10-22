"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Counts from 0 up to `value` once the value is known. Returns `undefined`
 * while the value is still loading, so callers can keep showing a skeleton.
 * Honours prefers-reduced-motion by jumping straight to the final number.
 */
export function useCountUp(value: number | undefined, durationMs = 900) {
  const [shown, setShown] = useState<number | undefined>(undefined);
  const frame = useRef(0);

  useEffect(() => {
    if (value === undefined) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || value === 0) {
      setShown(value);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      // Same curve as --ease-out-soft: fast first, settles at the end.
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(value * eased));
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [value, durationMs]);

  return shown;
}
