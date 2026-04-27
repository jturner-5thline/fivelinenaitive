import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Sticky dashboard header.
 *
 * Pins a page-level header (title, subtitle, period selector, primary actions)
 * to the top of the scrollable `<main>` container in `AppLayout` so it stays
 * visible while the user scrolls through charts and widgets below.
 *
 * Visual treatment matches the Insights page header: translucent backdrop
 * blur + thin bottom hairline so scrolling content never bleeds through.
 *
 * Usage:
 *   <div className="container mx-auto py-6 px-4 space-y-6">
 *     <StickyDashboardHeader>
 *       <PageTitleAndControls />
 *     </StickyDashboardHeader>
 *     {pageBody}
 *   </div>
 *
 * The `-mx-4 px-4` defaults extend the blurred bar edge-to-edge inside a
 * `container px-4` parent. Pass `paddingClassName` to override for layouts
 * with different horizontal padding (e.g. `-mx-6 px-6` inside `p-6`).
 */
export interface StickyDashboardHeaderProps
  extends React.HTMLAttributes<HTMLDivElement> {
  /** Tailwind classes that mirror the parent's horizontal padding. */
  paddingClassName?: string;
  /** Optional top offset (e.g. when nested under another fixed bar). */
  topClassName?: string;
}

export function StickyDashboardHeader({
  className,
  paddingClassName = "-mx-4 px-4",
  topClassName = "top-0",
  children,
  ...rest
}: StickyDashboardHeaderProps) {
  return (
    <div
      {...rest}
      className={cn(
        "sticky z-40 py-3 border-b border-white/5",
        "bg-background/70 backdrop-blur-md supports-[backdrop-filter]:bg-background/60",
        topClassName,
        paddingClassName,
        className,
      )}
    >
      {children}
    </div>
  );
}