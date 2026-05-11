import { useEffect, useRef, useState } from "react";

/**
 * Reveals an element with a subtle fade + rise once it enters the viewport.
 * Stays visible after the first reveal so scrolling back up doesn't replay
 * the animation. Respects prefers-reduced-motion.
 *
 * @param threshold IntersectionObserver threshold (0-1). Default 0.
 */
export function useScrollReveal<T extends HTMLElement = HTMLDivElement>(
  threshold: number = 0
) {
  const ref = useRef<T | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Respect reduced motion: show immediately, no animation gate.
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setIsVisible(true);
      return;
    }

    const node = ref.current;
    if (!node) return;

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            io.unobserve(entry.target);
          }
        });
      },
      { threshold, rootMargin: "0px 0px -8% 0px" }
    );

    io.observe(node);
    return () => io.disconnect();
  }, [threshold]);

  return { ref, isVisible };
}