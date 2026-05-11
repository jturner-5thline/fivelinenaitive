import { useMemo } from 'react';
import { Calendar as CalendarIcon, Loader2, ChevronDown } from 'lucide-react';
import { useIsFetching } from '@tanstack/react-query';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
  SelectSeparator,
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
  const activeToken = useMemo<Token>(() => {
    if (reportingPeriod) {
      return reportingPeriod.view === 'month'
        ? (`month:${reportingPeriod.period}` as Token)
        : (`quarter:${reportingPeriod.period}` as Token);
    }
    return `tf:${timeframe.id}` as Token;
  }, [timeframe.id, reportingPeriod]);

  // Friendly label + grouping kind for the trigger badge
  const { activeLabel, activeKind } = useMemo(() => {
    const all = [
      ...ROLLING.map(o => ({ ...o, kind: 'Rolling' as const })),
      ...quarters.map(o => ({ ...o, kind: 'Quarter' as const })),
      ...months.map(o => ({ ...o, kind: 'Month' as const })),
    ];
    const found = all.find(o => o.token === activeToken);
    return {
      activeLabel: found?.label ?? 'Select timeframe',
      activeKind: found?.kind ?? 'Rolling',
    };
  }, [activeToken, months, quarters]);

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

  const itemCls = cn(
    'text-xs rounded-md px-2.5 py-2 my-0.5 cursor-pointer',
    'focus:bg-primary/10 focus:text-foreground',
    'data-[state=checked]:bg-primary/15 data-[state=checked]:text-foreground data-[state=checked]:font-medium',
  );
  const labelCls =
    'sticky top-0 z-10 bg-popover/95 backdrop-blur-sm px-2.5 pt-2 pb-1 text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground/80';

  return (
    <Select value={activeToken} onValueChange={handleChange}>
      <SelectTrigger
        aria-label="Dashboard timeframe"
        aria-busy={isRefreshing}
        className={cn(
          // Custom premium trigger — overrides default size/spacing
          'group h-11 min-w-[260px] gap-3 rounded-xl border border-border/40',
          'bg-card/60 backdrop-blur-sm px-3.5 py-0',
          'shadow-[0_1px_0_hsl(0_0%_100%/0.04)_inset,0_4px_16px_hsl(0_0%_0%/0.18)]',
          'transition-all duration-200',
          'hover:border-primary/40 hover:bg-card/80',
          'focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50',
          'data-[state=open]:border-primary/50 data-[state=open]:bg-card/80',
          '[&>svg]:hidden', // hide default chevron, we render our own
          isRefreshing && 'border-primary/40',
          className,
        )}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border/30 bg-muted/40">
          {isRefreshing ? (
            <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" aria-label="Refreshing dashboards" />
          ) : (
            <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </span>

        <span className="flex flex-1 flex-col items-start leading-none min-w-0">
          <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
            Timeframe · {activeKind}
          </span>
          <SelectValue asChild>
            <span className="mt-1 truncate text-sm font-semibold text-foreground tabular-nums">
              {activeLabel}
            </span>
          </SelectValue>
        </span>

        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
            'group-data-[state=open]:rotate-180 group-data-[state=open]:text-primary',
          )}
        />
      </SelectTrigger>

      <SelectContent
        align="end"
        sideOffset={8}
        className={cn(
          'min-w-[280px] max-h-[440px] overflow-y-auto p-1.5',
          'rounded-xl border border-border/40 bg-popover/95 backdrop-blur-md',
          'shadow-[0_24px_60px_-12px_hsl(0_0%_0%/0.55),0_0_0_1px_hsl(var(--border)/0.3)]',
        )}
      >
        <SelectGroup>
          <SelectLabel className={labelCls}>Rolling</SelectLabel>
          {ROLLING.map((o) => (
            <SelectItem key={o.token} value={o.token} className={itemCls}>
              {o.label}
            </SelectItem>
          ))}
        </SelectGroup>

        <SelectSeparator className="my-1 bg-border/40" />

        <SelectGroup>
          <SelectLabel className={labelCls}>Quarter</SelectLabel>
          {quarters.map((o) => (
            <SelectItem key={o.token} value={o.token} className={cn(itemCls, 'tabular-nums')}>
              {o.label}
            </SelectItem>
          ))}
        </SelectGroup>

        <SelectSeparator className="my-1 bg-border/40" />

        <SelectGroup>
          <SelectLabel className={labelCls}>Month</SelectLabel>
          {months.map((o) => (
            <SelectItem key={o.token} value={o.token} className={cn(itemCls, 'tabular-nums')}>
              {o.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
