/**
 * Single source of truth for lender status visual theme.
 *
 * Used by:
 *   • Lender status tags on the Deal Details > Lenders cards
 *     (see `LendersKanban.tsx`)
 *   • Lender filter tabs / segmented control above the lender list
 *     (see `DealDetail.tsx`, the lenders panel header)
 *
 * Keeping both surfaces driven from one mapping ensures the tabs always
 * read as an extension of the tag system.
 */

export type LenderStatusKey =
  | 'active'
  | 'on-deck'
  | 'on-hold'
  | 'passed'
  | 'excluded';

export interface LenderStatusTheme {
  /** Badge / tag classes used on the lender card itself. */
  tag: string;
  /** Pill classes for the inactive (unselected) filter tab. */
  tabIdle: string;
  /** Hover-state additions for the inactive tab. */
  tabHover: string;
  /** Pill classes for the active (selected) filter tab. */
  tabActive: string;
  /** Count badge inside an inactive tab. */
  countIdle: string;
  /** Count badge inside an active tab. */
  countActive: string;
  /** Optional dot indicator color (matches the legacy ‘group.color’ swatch). */
  dot: string;
}

/**
 * Shared theme map. Every surface that needs lender-status color should
 * resolve through this object — never hardcode the color tokens again.
 *
 * Tailwind tokens are intentionally written out (not interpolated) so the
 * JIT can pick them up.
 */
export const LENDER_STATUS_THEME: Record<LenderStatusKey, LenderStatusTheme> = {
  active: {
    tag: 'bg-green-500/15 text-green-400 border-green-500/20',
    tabIdle: 'bg-green-500/5 text-green-300/90 border-green-500/15',
    tabHover: 'hover:bg-green-500/10 hover:text-green-300 hover:border-green-500/25',
    tabActive:
      'bg-green-500/20 text-green-300 border-green-500/40 font-semibold shadow-[inset_0_0_0_1px_hsl(var(--background)/0.0)]',
    countIdle: 'bg-green-500/15 text-green-300/90',
    countActive: 'bg-green-500/30 text-green-200',
    dot: 'bg-green-500',
  },
  'on-deck': {
    tag: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
    tabIdle: 'bg-blue-500/5 text-blue-300/90 border-blue-500/15',
    tabHover: 'hover:bg-blue-500/10 hover:text-blue-300 hover:border-blue-500/25',
    tabActive:
      'bg-blue-500/20 text-blue-300 border-blue-500/40 font-semibold',
    countIdle: 'bg-blue-500/15 text-blue-300/90',
    countActive: 'bg-blue-500/30 text-blue-200',
    dot: 'bg-blue-500',
  },
  'on-hold': {
    tag: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20',
    tabIdle: 'bg-yellow-500/5 text-yellow-300/90 border-yellow-500/15',
    tabHover:
      'hover:bg-yellow-500/10 hover:text-yellow-300 hover:border-yellow-500/25',
    tabActive:
      'bg-yellow-500/20 text-yellow-300 border-yellow-500/40 font-semibold',
    countIdle: 'bg-yellow-500/15 text-yellow-300/90',
    countActive: 'bg-yellow-500/30 text-yellow-200',
    dot: 'bg-yellow-500',
  },
  passed: {
    tag: 'bg-destructive/15 text-destructive border-destructive/20',
    tabIdle: 'bg-destructive/5 text-destructive/80 border-destructive/15',
    tabHover:
      'hover:bg-destructive/10 hover:text-destructive hover:border-destructive/25',
    tabActive:
      'bg-destructive/20 text-destructive border-destructive/40 font-semibold',
    countIdle: 'bg-destructive/15 text-destructive/80',
    countActive: 'bg-destructive/30 text-destructive',
    dot: 'bg-destructive',
  },
  excluded: {
    tag: 'bg-muted text-muted-foreground border-border/60',
    tabIdle: 'bg-muted/40 text-muted-foreground border-border/40',
    tabHover:
      'hover:bg-muted/60 hover:text-foreground hover:border-border/60',
    tabActive:
      'bg-muted text-foreground border-border font-semibold',
    countIdle: 'bg-muted-foreground/15 text-muted-foreground',
    countActive: 'bg-foreground/15 text-foreground',
    dot: 'bg-muted-foreground',
  },
};

/**
 * Safe lookup that falls back to the `active` theme so unknown statuses
 * never render with raw / unthemed styles.
 */
export function getLenderStatusTheme(key: string | undefined | null): LenderStatusTheme {
  if (!key) return LENDER_STATUS_THEME.active;
  return (LENDER_STATUS_THEME as Record<string, LenderStatusTheme>)[key]
    ?? LENDER_STATUS_THEME.active;
}
