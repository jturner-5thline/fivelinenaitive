import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarIcon, ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buildCustomPeriod, type QuarterOption } from '@/hooks/useQBQuarterlyRevenue';

/**
 * Shared dashboard timeframe picker that mirrors the Weekly Rundown
 * (Insights) ReportingPeriodPicker — Month / Quarter segmented toggle plus
 * a period dropdown. Self-contained: it does NOT read from the Insights
 * timeframe context, so each dashboard owns its own state.
 *
 * The selection is surfaced both as a canonical `{view, period}` token and
 * as a `QuarterOption`-shaped value so existing per-dashboard data plumbing
 * (which already understands QuarterOption) keeps working unchanged.
 */

export type DashboardPeriodView = 'month' | 'quarter' | 'rolling';
export interface DashboardPeriodValue {
  view: DashboardPeriodView;
  /** Canonical token: `2026-04` for month, `2026-Q2` for quarter, or
   *  `ytd` | `last3m` | `last6m` | `last12m` for rolling. */
  period: string;
}

function pad(n: number) { return String(n).padStart(2, '0'); }

function quarterOfMonth0(m0: number) { return Math.floor(m0 / 3) + 1; }

const ROLLING: { token: string; label: string; longLabel: string }[] = [
  { token: 'ytd',     label: 'YTD',      longLabel: 'Year to date' },
  { token: 'last3m',  label: 'Last 3M',  longLabel: 'Last 3 months' },
  { token: 'last6m',  label: 'Last 6M',  longLabel: 'Last 6 months' },
  { token: 'last12m', label: 'Last 12M', longLabel: 'Last 12 months' },
];

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function rollingRange(token: string): { start: Date; end: Date; label: string } {
  const now = new Date();
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (token === 'ytd') {
    return {
      start: new Date(now.getFullYear(), 0, 1),
      end: endOfToday,
      label: `YTD ${now.getFullYear()}`,
    };
  }
  const months = token === 'last3m' ? 3 : token === 'last6m' ? 6 : 12;
  const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
  return {
    start,
    end: endOfToday,
    label: ROLLING.find((r) => r.token === token)?.label ?? token,
  };
}

/** Convert a DashboardPeriodValue to a QuarterOption (start/end + months[]). */
export function periodToQuarterOption(value: DashboardPeriodValue): QuarterOption {
  if (value.view === 'month') {
    const [yStr, mStr] = value.period.split('-');
    const y = Number(yStr);
    const m0 = Number(mStr) - 1;
    const start = new Date(y, m0, 1);
    const end = new Date(y, m0 + 1, 0);
    const opt = buildCustomPeriod(start, end);
    opt.label = start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    opt.value = `month-${y}-${pad(m0 + 1)}`;
    return opt;
  }
  if (value.view === 'quarter') {
    const m = /^(\d{4})-Q([1-4])$/.exec(value.period)!;
    const y = Number(m[1]);
    const q = Number(m[2]);
    const start = new Date(y, (q - 1) * 3, 1);
    const end = new Date(y, q * 3, 0);
    const opt = buildCustomPeriod(start, end);
    opt.label = `Q${q} ${y}`;
    opt.value = `${y}-Q${q}`;
    return opt;
  }
  // rolling
  const r = rollingRange(value.period);
  const opt = buildCustomPeriod(r.start, r.end);
  opt.label = r.label;
  opt.value = `rolling-${value.period}`;
  return opt;
}

function defaultPeriod(view: DashboardPeriodView): DashboardPeriodValue {
  const now = new Date();
  if (view === 'month') {
    return { view: 'month', period: `${now.getFullYear()}-${pad(now.getMonth() + 1)}` };
  }
  if (view === 'rolling') {
    return { view: 'rolling', period: 'ytd' };
  }
  const q = quarterOfMonth0(now.getMonth());
  return { view: 'quarter', period: `${now.getFullYear()}-Q${q}` };
}

/**
 * Hook: persisted Month/Quarter selection per `storageKey`. Returns the
 * raw value plus a derived QuarterOption ready to plug into existing
 * dashboard data pipelines.
 */
export function useDashboardPeriod(storageKey: string, initialView: DashboardPeriodView = 'quarter') {
  const [value, setValue] = React.useState<DashboardPeriodValue>(() => {
    try {
      const raw = globalThis.localStorage?.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (
          (parsed?.view === 'month' || parsed?.view === 'quarter' || parsed?.view === 'rolling') &&
          parsed?.period
        ) {
          return { view: parsed.view, period: parsed.period };
        }
      }
    } catch { /* ignore */ }
    return defaultPeriod(initialView);
  });

  const update = React.useCallback((next: DashboardPeriodValue) => {
    setValue(next);
    try { globalThis.localStorage?.setItem(storageKey, JSON.stringify(next)); } catch { /* ignore */ }
  }, [storageKey]);

  const quarterOption = React.useMemo(() => periodToQuarterOption(value), [value]);
  return { value, setValue: update, quarterOption };
}

export interface DashboardPeriodPickerProps {
  value: DashboardPeriodValue;
  onChange: (next: DashboardPeriodValue) => void;
  className?: string;
}

function triggerLabelFor(value: DashboardPeriodValue): string {
  if (value.view === 'rolling') {
    return ROLLING.find((r) => r.token === value.period)?.label ?? value.period;
  }
  if (value.view === 'quarter') {
    const m = /^(\d{4})-Q([1-4])$/.exec(value.period);
    return m ? `Q${m[2]} ${m[1]}` : value.period;
  }
  const [y, mm] = value.period.split('-').map(Number);
  if (y && mm) {
    const d = new Date(y, mm - 1, 1);
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }
  return value.period;
}

export function DashboardPeriodPicker({
  value,
  onChange,
  className,
}: DashboardPeriodPickerProps) {
  const [open, setOpen] = React.useState(false);
  const now = new Date();
  const currentYear = now.getFullYear();
  const years = React.useMemo(() => [currentYear, currentYear - 1], [currentYear]);

  const initialYear = React.useMemo(() => {
    const m = /^(\d{4})/.exec(value.period);
    return m ? parseInt(m[1], 10) : currentYear;
  }, [value.period, currentYear]);
  const [monthYear, setMonthYear] = React.useState<number>(initialYear);
  const [quarterYear, setQuarterYear] = React.useState<number>(initialYear);

  const activePresetId = value.view === 'rolling' ? value.period : null;
  const activeMonth = value.view === 'month' ? value.period : null;
  const activeQuarter = value.view === 'quarter' ? value.period : null;

  const isFutureMonth = (year: number, month1: number) =>
    year > currentYear || (year === currentYear && month1 - 1 > now.getMonth());
  const isFutureQuarter = (year: number, q: number) => isFutureMonth(year, (q - 1) * 3 + 1);

  const selectPreset = (token: string) => {
    onChange({ view: 'rolling', period: token });
    setOpen(false);
  };
  const selectMonth = (year: number, month1: number) => {
    onChange({ view: 'month', period: `${year}-${pad(month1)}` });
    setOpen(false);
  };
  const selectQuarter = (year: number, q: number) => {
    onChange({ view: 'quarter', period: `${year}-Q${q}` });
    setOpen(false);
  };

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <CalendarIcon className="h-4 w-4 text-muted-foreground" />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            aria-label="Dashboard timeframe"
            className="h-9 min-w-[180px] justify-between gap-2 text-xs font-medium"
          >
            <span className="truncate">{triggerLabelFor(value)}</span>
            <ChevronDown className="h-3.5 w-3.5 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" sideOffset={6} className="w-[420px] p-0 overflow-hidden">
          {/* Quick Presets */}
          <div className="px-3 pt-3 pb-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
              Quick presets
            </div>
            <div className="grid grid-cols-4 gap-1">
              {ROLLING.map((o) => {
                const active = activePresetId === o.token;
                return (
                  <button
                    key={o.token}
                    type="button"
                    onClick={() => selectPreset(o.token)}
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

          {/* Quarter */}
          <div className="px-3 pt-2.5 pb-2">
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Quarter</div>
              <YearTabs years={years} value={quarterYear} onChange={setQuarterYear} />
            </div>
            <div className="grid grid-cols-4 gap-1">
              {[1, 2, 3, 4].map((q) => {
                const token = `${quarterYear}-Q${q}`;
                const active = activeQuarter === token;
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

          {/* Month */}
          <div className="px-3 pt-2.5 pb-3">
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Month</div>
              <YearTabs years={years} value={monthYear} onChange={setMonthYear} />
            </div>
            <div className="grid grid-cols-4 gap-1">
              {MONTH_ABBR.map((label, idx) => {
                const month1 = idx + 1;
                const token = `${monthYear}-${pad(month1)}`;
                const active = activeMonth === token;
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