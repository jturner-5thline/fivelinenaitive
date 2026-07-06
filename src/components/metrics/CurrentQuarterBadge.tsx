import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  buildQuarterOptions,
  buildCustomPeriod,
  getCurrentQuarter,
  type QuarterOption,
} from '@/hooks/useQBQuarterlyRevenue';
import { useMemo, useState, useCallback } from 'react';

/**
 * Small badge that shows the calendar quarter the CURRENT DATE falls into,
 * independent of any header timeframe selector. Positioned absolutely inside
 * a widget wrapper (parent must be `relative`).
 */
export function CurrentQuarterBadge({ className }: { className?: string }) {
  const now = new Date();
  const q = Math.floor(now.getMonth() / 3) + 1;
  const label = `Q${q} ${now.getFullYear()}`;
  return (
    <span
      className={cn(
        'pointer-events-none absolute top-1.5 right-2 z-10',
        'text-[10px] uppercase tracking-wider font-medium',
        'text-muted-foreground/70',
        className,
      )}
      aria-label={`Current quarter ${label}`}
      title={`Current quarter · ${label}`}
    >
      {label}
    </span>
  );
}

/**
 * Interactive quarter navigator badge. Starts on the current calendar
 * quarter and lets the user step back/forward through recent quarters
 * (bounded so the user cannot navigate past the current quarter).
 *
 * The parent wrapper must be `position: relative`.
 */
export function QuarterNavBadge({
  value,
  onChange,
  className,
  count = 12,
}: {
  value: QuarterOption;
  onChange: (next: QuarterOption) => void;
  className?: string;
  /** How many quarters back the user can navigate. */
  count?: number;
}) {
  // buildQuarterOptions returns [current, current-1, current-2, ...]
  const options = useMemo(() => buildQuarterOptions(count), [count]);
  const idx = Math.max(0, options.findIndex((o) => o.value === value.value));
  const canNewer = idx > 0; // move toward current
  const canOlder = idx < options.length - 1;

  const goOlder = useCallback(() => {
    if (canOlder) onChange(options[idx + 1]);
  }, [canOlder, idx, options, onChange]);
  const goNewer = useCallback(() => {
    if (canNewer) onChange(options[idx - 1]);
  }, [canNewer, idx, options, onChange]);

  return (
    <div
      className={cn(
        'absolute top-1.5 right-2 z-10 flex items-center gap-0.5',
        'text-[10px] uppercase tracking-wider font-medium text-muted-foreground/80',
        className,
      )}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        aria-label="Previous quarter"
        onClick={(e) => { e.stopPropagation(); goOlder(); }}
        disabled={!canOlder}
        className="h-4 w-4 inline-flex items-center justify-center rounded hover:bg-muted/40 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <ChevronLeft className="h-3 w-3" />
      </button>
      <span title={`Showing ${value.label}`}>{value.label}</span>
      <button
        type="button"
        aria-label="Next quarter"
        onClick={(e) => { e.stopPropagation(); goNewer(); }}
        disabled={!canNewer}
        className="h-4 w-4 inline-flex items-center justify-center rounded hover:bg-muted/40 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <ChevronRight className="h-3 w-3" />
      </button>
    </div>
  );
}

/** Convenience hook: local quarter state defaulting to the current quarter. */
export function useLocalQuarter(): [QuarterOption, (q: QuarterOption) => void] {
  const initial = useMemo(() => getCurrentQuarter(), []);
  const [q, setQ] = useState<QuarterOption>(initial);
  return [q, setQ];
}

// ---------------------------------------------------------------------------
// Rolling 3-month window
// ---------------------------------------------------------------------------

/**
 * Build a QuarterOption-shaped period covering 3 consecutive months ending
 * at `monthsBack` months before the current month (0 = last 3 months
 * including the current one).
 */
export function buildRolling3MonthPeriod(monthsBack: number): QuarterOption {
  const now = new Date();
  const endMonthDate = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
  const startMonthDate = new Date(endMonthDate.getFullYear(), endMonthDate.getMonth() - 2, 1);
  const endOfEndMonth = new Date(endMonthDate.getFullYear(), endMonthDate.getMonth() + 1, 0);
  return buildCustomPeriod(startMonthDate, endOfEndMonth);
}

function formatRollingLabel(period: QuarterOption): string {
  const [first, , last] = period.months;
  if (!first || !last) return period.label;
  const parse = (start: string) => {
    const [y, m] = start.split('-').map(Number);
    return new Date(y, m - 1, 1);
  };
  const a = parse(first.start);
  const b = parse(last.start);
  const monthShort = (d: Date) => d.toLocaleDateString('en-US', { month: 'short' });
  return a.getFullYear() === b.getFullYear()
    ? `${monthShort(a)}–${monthShort(b)} ${b.getFullYear()}`
    : `${monthShort(a)} ${a.getFullYear()} – ${monthShort(b)} ${b.getFullYear()}`;
}

/**
 * Rolling 3-month nav badge. Starts at the most recent 3 months and lets
 * the user step backward/forward one month at a time. Cannot advance
 * past the current month.
 */
export function Rolling3MonthNavBadge({
  period,
  monthsBack,
  onChange,
  className,
  maxMonthsBack = 36,
}: {
  period: QuarterOption;
  monthsBack: number;
  onChange: (nextMonthsBack: number, nextPeriod: QuarterOption) => void;
  className?: string;
  maxMonthsBack?: number;
}) {
  const label = useMemo(() => formatRollingLabel(period), [period]);
  const canNewer = monthsBack > 0;
  const canOlder = monthsBack < maxMonthsBack;

  const go = useCallback(
    (delta: number) => {
      const next = Math.max(0, Math.min(maxMonthsBack, monthsBack + delta));
      if (next === monthsBack) return;
      onChange(next, buildRolling3MonthPeriod(next));
    },
    [monthsBack, maxMonthsBack, onChange],
  );

  return (
    <div
      className={cn(
        'absolute top-1.5 right-2 z-10 flex items-center gap-0.5',
        'text-[10px] uppercase tracking-wider font-medium text-muted-foreground/80',
        className,
      )}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        aria-label="Previous month"
        onClick={(e) => { e.stopPropagation(); go(1); }}
        disabled={!canOlder}
        className="h-4 w-4 inline-flex items-center justify-center rounded hover:bg-muted/40 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <ChevronLeft className="h-3 w-3" />
      </button>
      <span title={`Showing ${label} (rolling 3 months)`}>{label}</span>
      <button
        type="button"
        aria-label="Next month"
        onClick={(e) => { e.stopPropagation(); go(-1); }}
        disabled={!canNewer}
        className="h-4 w-4 inline-flex items-center justify-center rounded hover:bg-muted/40 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <ChevronRight className="h-3 w-3" />
      </button>
    </div>
  );
}

/** Local state hook for a rolling 3-month window, starting at the most recent. */
export function useRolling3Months(): {
  period: QuarterOption;
  monthsBack: number;
  setMonthsBack: (n: number) => void;
} {
  const [monthsBack, setMonthsBack] = useState(0);
  const period = useMemo(() => buildRolling3MonthPeriod(monthsBack), [monthsBack]);
  return { period, monthsBack, setMonthsBack };
}
