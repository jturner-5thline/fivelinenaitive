import type { ReactNode } from "react";

/**
 * Wraps a chart body so switching chart type (bar ↔ line) cross-fades in
 * quickly instead of hard-cutting. Keyed by chartType so React remounts the
 * subtree and the CSS animation replays on every change.
 */
export function ChartSwap({
  chartType,
  children,
  className,
}: {
  chartType: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      key={chartType}
      className={`h-full w-full animate-in fade-in-0 zoom-in-[98%] duration-200 ease-out ${className ?? ""}`}
    >
      {children}
    </div>
  );
}

export default ChartSwap;