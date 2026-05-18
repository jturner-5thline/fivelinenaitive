import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Sticky dashboard header.
 *
 * Pins a page-level header (title, subtitle, period selector, primary actions)
 * to the top of the scrollable `<main>` container in `AppLayout` so it stays
 * visible while the user scrolls through charts and widgets below.
 *
 * Visual treatment: translucent backdrop blur + thin bottom hairline so
 * scrolling content never bleeds through.
 *
 * **Important:** This component MUST be rendered as a direct (or near-direct)
 * child of the page's content container — typically `<DashboardPage>` — so
 * its sticky positioning resolves against the scrollable `<main>` ancestor
 * in `AppLayout`. Do not place it inside an element with `overflow: hidden`
 * or `transform`, which would create a new containing block and break sticky.
 *
 * The `padding` preset must match the surrounding `<DashboardPage>` padding
 * so the blurred bar bleeds edge-to-edge. When in doubt, prefer the default
 * (used by `<DashboardPage>` automatically via cloning).
 */
export type StickyDashboardHeaderPadding = "sm" | "md" | "lg";

const PADDING_CLASSES: Record<StickyDashboardHeaderPadding, string> = {
  // Matches DashboardPage padding="sm"  (px-4 / py-6)
  sm: "-mx-4 px-4",
  // Matches DashboardPage padding="md"  (px-6 / py-6) — Finance, etc.
  md: "-mx-6 px-6",
  // Matches DashboardPage padding="lg"  (px-8) — extra-roomy layouts
  lg: "-mx-8 px-8",
};

export interface StickyDashboardHeaderProps
  extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Horizontal padding preset. MUST match the parent `DashboardPage`'s
   * padding so the blurred bar extends edge-to-edge. Defaults to `"sm"`.
   */
  padding?: StickyDashboardHeaderPadding;
  /**
   * Escape hatch: explicit Tailwind padding classes (e.g. `"-mx-5 px-5"`).
   * Overrides `padding` when provided. Avoid unless absolutely necessary.
   */
  paddingClassName?: string;
  /**
   * Optional Tailwind class that overrides the default top offset. By default
   * the header pins to `top: var(--app-top-bar-height, 0px)`, which is `0`
   * today and will automatically respect any future global top bar that sets
   * the CSS variable (see `<AppTopBarOffset />`). Provide this only when a
   * specific page needs a different anchor.
   */
  topClassName?: string;
  /**
   * Visual surface treatment. `"bar"` (default) renders the classic
   * edge-to-edge translucent bar with a bottom hairline. `"module"` renders
   * the header as a first-class dashboard tile using the shared
   * `.glass-module` surface so it visually belongs to the same family as
   * the KPI / chart widgets below.
   */
  surface?: "bar" | "module";
}

export function StickyDashboardHeader({
  className,
  padding = "sm",
  paddingClassName,
  topClassName,
  surface = "bar",
  children,
  ...rest
}: StickyDashboardHeaderProps) {
  const resolvedPadding =
    surface === "module" ? "" : (paddingClassName ?? PADDING_CLASSES[padding]);
  const stickyStyle: React.CSSProperties | undefined = topClassName
    ? undefined
    : { top: "var(--app-top-bar-height, 0px)" };
  return (
    <div
      {...rest}
      data-sticky-dashboard-header=""
      style={{ ...stickyStyle, ...(rest.style || {}) }}
      className={cn(
        "sticky z-40",
        surface === "module"
          ? "glass-module rounded-2xl px-5 py-4"
          : cn(
              "py-3 border-b border-white/5",
              "bg-background/70 backdrop-blur-md supports-[backdrop-filter]:bg-background/60",
            ),
        topClassName,
        resolvedPadding,
        className,
      )}
    >
      {children}
    </div>
  );
}