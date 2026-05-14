import * as React from 'react';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/Logo';

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
  afterMain,
}: WorkspacePageProps) {
  return (
    <div className="bg-transparent">
      <main className="w-full px-4 pt-5 pb-3 sm:px-6">
        {/* Persistent brand anchor for the content module — sits inside the
            main surface, not in the floating header. Subtle and aligned with
            the module's top-left padding. */}
        <div className="mb-3 flex items-center" aria-hidden="true">
          <Logo className="h-3 opacity-70" />
        </div>
        {beforeContent}
        <div className={cn('space-y-5', contentClassName)}>{children}</div>
      </main>

      {afterMain}
    </div>
  );
}