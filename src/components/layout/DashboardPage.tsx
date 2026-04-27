import * as React from "react";
import { cn } from "@/lib/utils";
import {
  StickyDashboardHeader,
  type StickyDashboardHeaderPadding,
} from "./StickyDashboardHeader";

/**
 * Shared page-level wrapper for every dashboard route.
 *
 * Why this exists:
 * - Guarantees the same scrollable ancestor (`<main>` in `AppLayout`) for the
 *   sticky header on every dashboard page, so `position: sticky; top: 0` is
 *   always resolved against the same container.
 * - Owns the horizontal/vertical padding contract so individual pages can't
 *   drift (e.g. `py-6` on one page vs `py-8` on another) and so the
 *   `StickyDashboardHeader` bleed always matches.
 * - Renders the header at the top of the content flow as a direct child of
 *   the padded container — never inside an `overflow:hidden` / `transform`
 *   wrapper that would silently break sticky positioning.
 *
 * Usage:
 *   <DashboardPage
 *     header={
 *       <div className="flex items-center justify-between">
 *         <h1 className="text-2xl font-bold">Title</h1>
 *         <PeriodPicker />
 *       </div>
 *     }
 *   >
 *     {pageBody}
 *   </DashboardPage>
 */
export type DashboardPagePadding = StickyDashboardHeaderPadding;

const CONTAINER_PADDING: Record<DashboardPagePadding, string> = {
  sm: "px-4 py-6",
  md: "px-6 py-6",
  lg: "px-8 py-6",
};

export interface DashboardPageProps {
  /** Header content. Rendered inside a `StickyDashboardHeader`. */
  header: React.ReactNode;
  /** Optional className for the inner page container. */
  className?: string;
  /** Optional className applied to the StickyDashboardHeader itself. */
  headerClassName?: string;
  /**
   * Padding preset. Defaults to `"sm"` (px-4) which matches `container mx-auto`
   * pages. Use `"md"` (px-6) for full-bleed pages like Finance.
   */
  padding?: DashboardPagePadding;
  /**
   * When true, wraps the page body in a `container mx-auto` so content stays
   * centred at large widths. Defaults to `true`.
   */
  container?: boolean;
  /** Vertical spacing between header and body. Defaults to `"space-y-6"`. */
  bodySpacing?: string;
  /**
   * Optional wrapper that envelops both the sticky header and the body. Used
   * for tab-driven pages where `<Tabs>` must contain `<TabsList>` (in the
   * header) and `<TabsContent>` (in the body). The wrapper is the SAME
   * descendant of `<main>` as the sticky header, so sticky resolution still
   * works.
   */
  wrapper?: (children: React.ReactNode) => React.ReactNode;
  children: React.ReactNode;
}

export function DashboardPage({
  header,
  className,
  headerClassName,
  padding = "sm",
  container = true,
  bodySpacing = "space-y-6",
  wrapper,
  children,
}: DashboardPageProps) {
  const inner = (
    <>
      <StickyDashboardHeader padding={padding} className={headerClassName}>
        {header}
      </StickyDashboardHeader>
      {children}
    </>
  );
  return (
    <div
      className={cn(
        container && "container mx-auto",
        CONTAINER_PADDING[padding],
        bodySpacing,
        className,
      )}
    >
      {wrapper ? wrapper(inner) : inner}
    </div>
  );
}