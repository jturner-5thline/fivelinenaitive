import { useMemo, useState } from 'react';
import { Calendar as CalendarIcon, ChevronDown, Loader2, Check } from 'lucide-react';
import { useIsFetching } from '@tanstack/react-query';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  reportingPeriodHelpers,
  useInsightsTimeframe,
  type InsightsTimeframeId,
} from '@/contexts/InsightsTimeframeContext';

/**
 * Premium dashboard timeframe picker.
 *
 * Layout (single popover, no long scrolling):
 *  - Top row: rolling presets (YTD, Last 3/6/12 Months) as segmented buttons.
 *  - Middle: Quarter selector — year row + 4 quarter chips per year.
 *  - Bottom: Month selector — year row + 12-month grid (4 cols × 3 rows).
 */

const ROLLING: { id: InsightsTimeframeId; label: string }[] = [
  { id: 'ytd',     label: 'YTD' },
  { id: 'last3m',  label: 'Last 3M' },
  { id: 'last6m',  label: 'Last 6M' },
  { id: 'last12m', label: 'Last 12M' },
];

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function pad(n: number) { return String(n).padStart(2, '0'); }

export function InsightsTimeframePicker({ className }: { className?: string }) {
  const { timeframe, setTimeframe, reportingPeriod, setReportingPeriod } = useInsightsTimeframe();
  const [open, setOpen] = useState(false);

  const fetchingCount = useIsFetching({
    predicate: (q) => {
      const key = q.queryKey;
      if (!Array.isArray(key)) return false;
      const prefix = String(key[0] ?? '');
      return (
        prefix.startsWith('qb-') ||
        prefix.startsWith('stage-entry') ||
        prefix.startsWith('pipeline-') ||
        prefix.startsWith('entity-profit') ||
        prefix.startsWith('executive-dashboard')
      );
    },
  });
  const isRefreshing = fetchingCount > 0;

  const now = new Date();
  const currentYear = now.getFullYear();

  // Years to expose for Month/Quarter (current + 1 prior).
  const years = useMemo(
    () => Array.from(new Set([currentYear, currentYear - 1, currentYear - 2, 2024])).sort((a, b) => b - a),
    [currentYear],
  );

  // Year tab state for the Month grid and Quarter row.
  const initialYear = useMemo(() => {
    if (reportingPeriod) {
      const m = /^(\d{4})/.exec(reportingPeriod.period);
      if (m) return parseInt(m[1], 10);
    }
    return currentYear;
  }, [reportingPeriod, currentYear]);
  const [monthYear, setMonthYear] = useState<number>(initialYear);
  const [quarterYear, setQuarterYear] = useState<number>(initialYear);

  const activePresetId: InsightsTimeframeId | null = reportingPeriod ? null : timeframe.id;
  const activeMonthStart = reportingPeriod?.view === 'month' ? reportingPeriod.period : null;
  const activeMonthEnd = reportingPeriod?.view === 'month' ? (reportingPeriod.periodEnd ?? reportingPeriod.period) : null;
  const activeQuarterStart = reportingPeriod?.view === 'quarter' ? reportingPeriod.period : null;
  const activeQuarterEnd = reportingPeriod?.view === 'quarter' ? (reportingPeriod.periodEnd ?? reportingPeriod.period) : null;

  const triggerLabel = reportingPeriod?.label ?? timeframe.label;

  const selectPreset = (id: InsightsTimeframeId) => {
    setReportingPeriod(null);
    setTimeframe(id);
    setOpen(false);
  };

  // Range model: the first chip sets the anchor; every later chip extends the
  // contiguous range to include it (so you can select 3, 4, or more periods).
  // Clicking an endpoint of an existing range trims back to the other endpoint.
  // The popover stays open so ranges can be built up freely.
  const extendSelection = (view: 'month' | 'quarter', token: string) => {
    const make = (p: string, pe?: string) =>
      setReportingPeriod(reportingPeriodHelpers.computeReportingPeriod(view, p, pe));
    const current = reportingPeriod;
    if (!current || current.view !== view) { make(token); return; }
    const start = current.period;
    const end = current.periodEnd ?? current.period;
    // Clicking an endpoint trims it off (collapse to the other endpoint).
    if (current.periodEnd && token === end) { make(start); return; }
    if (current.periodEnd && token === start) { make(end); return; }
    // Clicking the only selected period confirms & closes.
    if (!current.periodEnd && token === start) { setOpen(false); return; }
    // Otherwise grow the range to cover the clicked period.
    const min = token < start ? token : start;
    const max = token > end ? token : end;
    make(min, max);
  };

  const selectMonth = (year: number, month1: number) => {
    extendSelection('month', `${year}-${pad(month1)}`);
  };

  const selectQuarter = (year: number, q: number) => {
    extendSelection('quarter', `${year}-Q${q}`);
  };

  // Disable future months/quarters.
  const isFutureMonth = (year: number, month1: number) =>
    year > currentYear || (year === currentYear && month1 - 1 > now.getMonth());
  const isFutureQuarter = (year: number, q: number) => {
    const firstMonth1 = (q - 1) * 3 + 1;
    return isFutureMonth(year, firstMonth1);
  };

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {isRefreshing ? (
        <Loader2 className="h-4 w-4 text-primary animate-spin" aria-label="Refreshing dashboards" />
      ) : (
        <CalendarIcon className="h-4 w-4 text-muted-foreground" />
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            aria-label="Dashboard timeframe"
            aria-busy={isRefreshing}
            className={cn(
              'h-9 min-w-[180px] justify-between gap-2 text-xs font-medium',
              isRefreshing && 'border-primary/40 text-primary',
            )}
          >
            <span className="truncate">{triggerLabel}</span>
            <ChevronDown className="h-3.5 w-3.5 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={6}
          className="w-[420px] p-0 overflow-hidden"
        >
          {/* Rolling presets */}
          <div className="px-3 pt-3 pb-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
              Quick presets
            </div>
            <div className="grid grid-cols-4 gap-1">
              {ROLLING.map((o) => {
                const active = activePresetId === o.id;
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => selectPreset(o.id)}
                    className={cn(
                      'h-8 rounded-md text-xs font-medium transition-colors border',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      active
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background border-border hover:bg-accent hover:text-accent-foreground',
                    )}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="h-px bg-border" />

          {/* Quarters */}
          <div className="px-3 pt-2.5 pb-2">
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Quarter
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    const lastQ = quarterYear === currentYear ? Math.floor(now.getMonth() / 3) + 1 : 4;
                    setReportingPeriod(
                      reportingPeriodHelpers.computeReportingPeriod(
                        'quarter',
                        `${quarterYear}-Q1`,
                        `${quarterYear}-Q${lastQ}`,
                      ),
                    );
                  }}
                  className="h-5 px-2 rounded border border-border bg-background text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                  Full year
                </button>
                <YearTabs
                  years={years}
                  value={quarterYear}
                  onChange={setQuarterYear}
                />
              </div>
            </div>
            <div className="grid grid-cols-4 gap-1">
              {[1, 2, 3, 4].map((q) => {
                const token = `${quarterYear}-Q${q}`;
                const active =
                  activeQuarterStart !== null &&
                  activeQuarterEnd !== null &&
                  token >= activeQuarterStart &&
                  token <= activeQuarterEnd;
                const disabled = isFutureQuarter(quarterYear, q);
                return (
                  <button
                    key={q}
                    type="button"
                    disabled={disabled}
                    onClick={() => selectQuarter(quarterYear, q)}
                    className={cn(
                      'h-8 rounded-md text-xs font-medium transition-colors border relative',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      disabled && 'opacity-30 cursor-not-allowed',
                      active
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background border-border hover:bg-accent hover:text-accent-foreground',
                    )}
                  >
                    Q{q}
                    {active && <Check className="absolute top-0.5 right-0.5 h-2.5 w-2.5" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="h-px bg-border" />

          {/* Months */}
          <div className="px-3 pt-2.5 pb-3">
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Month
              </div>
              <YearTabs
                years={years}
                value={monthYear}
                onChange={setMonthYear}
              />
            </div>
            <div className="grid grid-cols-4 gap-1">
              {MONTH_ABBR.map((label, idx) => {
                const month1 = idx + 1;
                const token = `${monthYear}-${pad(month1)}`;
                const active =
                  activeMonthStart !== null &&
                  activeMonthEnd !== null &&
                  token >= activeMonthStart &&
                  token <= activeMonthEnd;
                const disabled = isFutureMonth(monthYear, month1);
                return (
                  <button
                    key={label}
                    type="button"
                    disabled={disabled}
                    onClick={() => selectMonth(monthYear, month1)}
                    className={cn(
                      'h-8 rounded-md text-xs font-medium transition-colors border',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      disabled && 'opacity-30 cursor-not-allowed',
                      active
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background border-border hover:bg-accent hover:text-accent-foreground',
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <div className="mt-2 text-[10px] text-muted-foreground">
              Tip: click two chips to select a range (e.g. Jan → Mar = Jan–Mar). Click the same chip again to confirm a single period.
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function YearTabs({
  years,
  value,
  onChange,
}: {
  years: number[];
  value: number;
  onChange: (y: number) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-md border border-border bg-muted/30 p-0.5">
      {years.map((y) => (
        <button
          key={y}
          type="button"
          onClick={() => onChange(y)}
          className={cn(
            'h-5 px-2 rounded text-[10px] font-medium transition-colors',
            'focus:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            value === y
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {y}
        </button>
      ))}
    </div>
  );
}
