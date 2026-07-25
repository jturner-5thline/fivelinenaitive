import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Shared page wrapper for primary workspace surfaces (Deals, Lender
 * Directory, etc).
 *
 * Centralizes the canvas treatment so these pages can never drift apart:
 *   • transparent base — the app's ambient backdrop shows through
 *   • shared `<DealsHeader />` chrome on top
 *   • identical horizontal/vertical padding rhythm on the <main>
 *   • identical inner `space-y-*` rhythm between page sections
 *
 * If a workspace page wants a different inner rhythm (e.g. tighter widgets
 * row), pass `contentClassName` — but the canvas/header/padding tokens are
 * intentionally not overridable so all workspace pages stay aligned.
 */
export interface WorkspacePageProps {
  /** Page sections (header row, widgets, filters, content). */
  children: React.ReactNode;
  /**
   * Optional content rendered inside `<main>` BEFORE the spaced content
   * block — typically modals/banners that should not participate in the
   * `space-y-*` rhythm.
   */
  beforeContent?: React.ReactNode;
  /** Optional override for the inner `space-y-*` rhythm. */
  contentClassName?: string;
  /** Optional override for the padded main viewport. */
  mainClassName?: string;
  /**
   * Optional action cluster rendered in the top-right of the workspace
   * module, vertically aligned with the persistent naitive logo brand
   * anchor in the top-left. Use this for page-level controls (export,
   * notifications, "New Deal", etc.) that should read as part of the
   * unified module header rather than as a separate row above the page
   * content.
   */
  headerActions?: React.ReactNode;
  /**
   * Optional content rendered AFTER `<main>` (still inside the canvas
   * wrapper) — e.g. floating dialogs / drawers / hint buttons that should
   * live within the page's stacking context but outside the padded scroll
   * area.
   */
  afterMain?: React.ReactNode;
}

export function WorkspacePage({
  children,
  beforeContent,
  contentClassName,
  mainClassName,
  afterMain,
  headerActions,
}: WorkspacePageProps) {
  return (
    <div className="relative bg-transparent flex-1 flex flex-col min-h-full">
      {headerActions && (
        <div
          className="absolute right-3 sm:right-4 -top-[88px] h-28 z-20 flex items-center pointer-events-auto"
        >
          {headerActions}
        </div>
      )}
      <main className={cn('w-full px-4 pt-5 pb-3 sm:px-6 flex-1', mainClassName)}>
        {beforeContent}
        <div className={cn('space-y-5', contentClassName)}>{children}</div>
      </main>

      {afterMain}
    </div>
  );
}