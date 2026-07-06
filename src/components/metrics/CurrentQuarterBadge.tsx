import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  buildQuarterOptions,
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
