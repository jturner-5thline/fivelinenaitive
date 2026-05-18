import * as React from 'react';
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TableHead } from '@/components/ui/table';
import type { SortDirection } from '@/hooks/useTriStateSort';

interface SortableHeaderProps {
  field: string;
  activeField: string | null;
  direction: SortDirection;
  onSort: (field: string) => void;
  children: React.ReactNode;
  /** Render as a plain button (no TableHead wrapper). */
  asButton?: boolean;
  className?: string;
}

/**
 * Shared sortable header used across deals, reports, admin tables, etc.
 *
 * Indicator states:
 *   - asc      → ArrowUp (active color)
 *   - desc     → ArrowDown (active color)
 *   - unsorted → ArrowUpDown (muted)
 *
 * Clicks cycle asc → desc → cleared on the same column. Clicking a
 * different column always restarts at asc. State is owned by the parent
 * via `useTriStateSort`.
 */
export function SortableHeader({
  field,
  activeField,
  direction,
  onSort,
  children,
  asButton,
  className,
}: SortableHeaderProps) {
  const isActive = activeField === field && direction !== null;
  const Icon = isActive ? (direction === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;

  const inner = (
    <div className="flex items-center gap-1">
      {children}
      <Icon
        className={cn(
          'h-3 w-3 transition-colors',
          isActive ? 'text-foreground opacity-100' : 'opacity-50',
        )}
        aria-hidden
      />
    </div>
  );

  const ariaSort: React.AriaAttributes['aria-sort'] = isActive
    ? direction === 'asc'
      ? 'ascending'
      : 'descending'
    : 'none';

  if (asButton) {
    return (
      <button
        type="button"
        className={cn(
          'flex items-center gap-1 hover:text-foreground select-none',
          className,
        )}
        onClick={() => onSort(field)}
        aria-sort={ariaSort}
      >
        {inner}
      </button>
    );
  }

  return (
    <TableHead
      className={cn(
        'text-muted-foreground text-xs font-medium cursor-pointer hover:text-foreground select-none',
        className,
      )}
      onClick={() => onSort(field)}
      aria-sort={ariaSort}
    >
      {inner}
    </TableHead>
  );
}
