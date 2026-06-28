import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CalendarRange } from 'lucide-react';
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

export type DashboardPeriodView = 'month' | 'quarter';
export interface DashboardPeriodValue {
  view: DashboardPeriodView;
  /** Canonical token: `2026-04` for month, `2026-Q2` for quarter. */
  period: string;
}

function pad(n: number) { return String(n).padStart(2, '0'); }

function quarterOfMonth0(m0: number) { return Math.floor(m0 / 3) + 1; }

/** Build the last N month tokens (newest → oldest). */
function buildMonthTokens(count: number): { token: string; label: string }[] {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const out: { token: string; label: string }[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(y, m - i, 1);
    out.push({
      token: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`,
      label: d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
    });
  }
  return out;
}

/** Build the last N quarter tokens (newest → oldest). */
function buildQuarterTokens(count: number): { token: string; label: string }[] {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const out: { token: string; label: string }[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(y, m - i * 3, 1);
    const q = quarterOfMonth0(d.getMonth());
    const token = `${d.getFullYear()}-Q${q}`;
    if (!out.find((x) => x.token === token)) {
      out.push({ token, label: `Q${q} ${d.getFullYear()}` });
    }
  }
  return out;
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

function defaultPeriod(view: DashboardPeriodView): DashboardPeriodValue {
  const now = new Date();
  if (view === 'month') {
    return { view: 'month', period: `${now.getFullYear()}-${pad(now.getMonth() + 1)}` };
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
        if ((parsed?.view === 'month' || parsed?.view === 'quarter') && parsed?.period) {
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
  monthCount?: number;
  quarterCount?: number;
  className?: string;
}

export function DashboardPeriodPicker({
  value,
  onChange,
  monthCount = 12,
  quarterCount = 8,
  className,
}: DashboardPeriodPickerProps) {
  const monthTokens = React.useMemo(() => buildMonthTokens(monthCount), [monthCount]);
  const quarterTokens = React.useMemo(() => buildQuarterTokens(quarterCount), [quarterCount]);
  const options = value.view === 'month' ? monthTokens : quarterTokens;

  const handleViewChange = (next: DashboardPeriodView) => {
    if (next === value.view) return;
    // Map current period to the new granularity.
    if (next === 'quarter') {
      const [y, m] = value.period.split('-').map(Number);
      const q = quarterOfMonth0((m || 1) - 1);
      onChange({ view: 'quarter', period: `${y}-Q${q}` });
      return;
    }
    // quarter → month: pick the last month of that quarter (or current month if same quarter as today)
    const mm = /^(\d{4})-Q([1-4])$/.exec(value.period);
    if (mm) {
      const y = Number(mm[1]);
      const q = Number(mm[2]);
      const now = new Date();
      let month1 = q * 3;
      if (y === now.getFullYear() && q === quarterOfMonth0(now.getMonth())) {
        month1 = now.getMonth() + 1;
      }
      onChange({ view: 'month', period: `${y}-${pad(month1)}` });
      return;
    }
    onChange(defaultPeriod('month'));
  };

  const handlePeriodChange = (token: string) => {
    onChange({ view: value.view, period: token });
  };

  return (
    <div className={cn('flex items-center gap-1.5 rounded-md border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent px-1.5 py-1', className)}>
      <CalendarRange className="h-3.5 w-3.5 text-primary/70 ml-1" aria-hidden />

      <div role="group" aria-label="Reporting granularity" className="inline-flex rounded-sm bg-muted/30 p-0.5">
        {(['month', 'quarter'] as DashboardPeriodView[]).map((v) => (
          <Button
            key={v}
            type="button"
            size="sm"
            variant="ghost"
            aria-pressed={value.view === v}
            onClick={() => handleViewChange(v)}
            className={cn(
              'h-6 px-2 text-[11px] font-medium capitalize rounded-sm',
              value.view === v
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {v}
          </Button>
        ))}
      </div>

      <Select value={value.period} onValueChange={handlePeriodChange}>
        <SelectTrigger
          aria-label="Reporting period"
          className="h-7 min-w-[110px] border-0 bg-transparent px-2 text-xs font-medium focus:ring-0"
        >
          <SelectValue placeholder={value.view === 'month' ? 'Select month' : 'Select quarter'} />
        </SelectTrigger>
        <SelectContent align="end">
          {options.map((o) => (
            <SelectItem key={o.token} value={o.token} className="text-xs">
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}