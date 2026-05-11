import { useMemo } from 'react';
import { Calendar as CalendarIcon, Loader2 } from 'lucide-react';
import { useIsFetching } from '@tanstack/react-query';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  reportingPeriodHelpers,
  useInsightsTimeframe,
  type InsightsTimeframeId,
} from '@/contexts/InsightsTimeframeContext';

/**
 * Single executive-friendly timeframe dropdown.
 *
 * Options:
 *   • YTD, Last 3 / 6 / 12 Months  (rolling)
 *   • Specific Quarter (Q1 2026, Q2 2026, …)
 *   • Specific Month (Apr 2026, Mar 2026, …)
 *
 * Drives the entire dashboard via `useInsightsTimeframe`. There is no
 * day-level or arbitrary calendar selector.
 */

type Token =
  | `tf:${InsightsTimeframeId}`
  | `month:${string}` // YYYY-MM
  | `quarter:${string}`; // YYYY-Qn

const ROLLING: { token: Token; label: string }[] = [
  { token: 'tf:ytd',     label: 'Year to Date (YTD)' },
  { token: 'tf:last3m',  label: 'Last 3 Months' },
  { token: 'tf:last6m',  label: 'Last 6 Months' },
  { token: 'tf:last12m', label: 'Last 12 Months' },
];

function pad(n: number) { return String(n).padStart(2, '0'); }

function buildMonthOptions(count = 18): { token: Token; label: string }[] {
  const now = new Date();
  const out: { token: Token; label: string }[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m1 = d.getMonth() + 1;
    out.push({
      token: `month:${y}-${pad(m1)}`,
      label: d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' }),
    });
  }
  return out;
}

function buildQuarterOptions(count = 8): { token: Token; label: string }[] {
  const now = new Date();
  const seen = new Set<string>();
  const out: { token: Token; label: string }[] = [];
  for (let i = 0; i < count * 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const q = Math.floor(d.getMonth() / 3) + 1;
    const key = `${y}-Q${q}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ token: `quarter:${key}`, label: `Q${q} ${y}` });
    if (out.length >= count) break;
  }
  return out;
}

export function InsightsTimeframePicker({ className }: { className?: string }) {
  const { timeframe, setTimeframe, reportingPeriod, setReportingPeriod } = useInsightsTimeframe();

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

  const months = useMemo(() => buildMonthOptions(18), []);
  const quarters = useMemo(() => buildQuarterOptions(8), []);

  // Resolve the currently selected token. Reporting period (Month/Quarter)
  // always wins because it represents an explicit calendar selection.
  const activeToken: Token = useMemo(() => {
    if (reportingPeriod) {
      return reportingPeriod.view === 'month'
        ? `month:${reportingPeriod.period}`
        : `quarter:${reportingPeriod.period}`;
    }
    return `tf:${timeframe.id}`;
  }, [timeframe.id, reportingPeriod]);

  const handleChange = (token: string) => {
    if (token.startsWith('tf:')) {
      const id = token.slice(3) as InsightsTimeframeId;
      // Clear any active month/quarter so the rolling timeframe takes over.
      setReportingPeriod(null);
      setTimeframe(id);
      return;
    }
    if (token.startsWith('month:')) {
      const period = token.slice('month:'.length);
      setReportingPeriod(reportingPeriodHelpers.computeReportingPeriod('month', period));
      return;
    }
    if (token.startsWith('quarter:')) {
      const period = token.slice('quarter:'.length);
      setReportingPeriod(reportingPeriodHelpers.computeReportingPeriod('quarter', period));
      return;
    }
  };

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {isRefreshing ? (
        <Loader2 className="h-4 w-4 text-primary animate-spin" aria-label="Refreshing dashboards" />
      ) : (
        <CalendarIcon className="h-4 w-4 text-muted-foreground" />
      )}
      <Select value={activeToken} onValueChange={handleChange}>
        <SelectTrigger
          aria-label="Dashboard timeframe"
          aria-busy={isRefreshing}
          className={cn(
            'h-9 min-w-[200px] text-xs',
            isRefreshing && 'border-primary/40 text-primary',
          )}
        >
          <SelectValue placeholder="Select timeframe" />
        </SelectTrigger>
        <SelectContent align="end" className="max-h-[420px]">
          <SelectGroup>
            <SelectLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Rolling
            </SelectLabel>
            {ROLLING.map((o) => (
              <SelectItem key={o.token} value={o.token} className="text-xs">
                {o.label}
              </SelectItem>
            ))}
          </SelectGroup>
          <SelectGroup>
            <SelectLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Quarter
            </SelectLabel>
            {quarters.map((o) => (
              <SelectItem key={o.token} value={o.token} className="text-xs">
                {o.label}
              </SelectItem>
            ))}
          </SelectGroup>
          <SelectGroup>
            <SelectLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Month
            </SelectLabel>
            {months.map((o) => (
              <SelectItem key={o.token} value={o.token} className="text-xs">
                {o.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}
