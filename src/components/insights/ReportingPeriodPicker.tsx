import { useMemo } from 'react';
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
import {
  reportingPeriodHelpers,
  useInsightsTimeframe,
  type ReportingView,
} from '@/contexts/InsightsTimeframeContext';
import { useQuickBooksMetrics } from '@/hooks/useQuickBooksMetrics';

/**
 * Global Reporting Period control for the Insights Dashboard header.
 *
 * Two controls:
 *  1. Segmented Month / Quarter toggle.
 *  2. Period selector whose options derive from the current QuickBooks
 *     dataset, so users can only pick periods with real data.
 *
 * Writes through `useInsightsTimeframe`; URL params `view` & `period` keep
 * the selection shareable and reload-safe.
 */
export function ReportingPeriodPicker() {
  const { reportingPeriod, setReportingPeriod, switchReportingView } = useInsightsTimeframe();
  const { data: qb } = useQuickBooksMetrics();

  // Build the list of valid month tokens (`YYYY-MM`) from the QB dataset.
  const monthTokens = useMemo(() => {
    const months = qb?.monthlyRevenue ?? [];
    const tokens = new Set<string>();
    months.forEach((m) => {
      // m.month is "MMM yy" e.g. "Apr 26" — derive a YYYY-MM token from index.
    });
    // monthlyRevenue is ordered oldest → newest. Reconstruct yyyy-MM via Date math:
    const now = new Date();
    const list: { token: string; label: string }[] = [];
    const span = months.length;
    for (let i = span - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - (span - 1 - i), 1);
      const token = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
      list.push({ token, label });
    }
    return list; // newest → oldest
  }, [qb]);

  const quarterTokens = useMemo(() => {
    const set = new Map<string, string>();
    monthTokens.forEach(({ token }) => {
      const [y, m] = token.split('-').map(Number);
      const q = Math.floor((m - 1) / 3) + 1;
      const key = `${y}-Q${q}`;
      if (!set.has(key)) set.set(key, `Q${q} ${y}`);
    });
    return Array.from(set.entries()).map(([token, label]) => ({ token, label }));
  }, [monthTokens]);

  const view: ReportingView = reportingPeriod?.view ?? 'month';
  const options = view === 'month' ? monthTokens : quarterTokens;
  const activeToken = reportingPeriod?.period ?? options[0]?.token ?? '';

  const handleViewChange = (next: ReportingView) => {
    if (next === view) return;
    if (!reportingPeriod) {
      // First activation — seed from defaults then immediately switch view to apply mapping.
      const seed = reportingPeriodHelpers.defaultReportingPeriod('month');
      setReportingPeriod(seed);
    }
    switchReportingView(next);
  };

  const handlePeriodChange = (token: string) => {
    setReportingPeriod(reportingPeriodHelpers.computeReportingPeriod(view, token));
  };

  // First render before any selection: pre-fill picker visually with default
  // (current quarter / latest month) without committing it. We commit on
  // first user interaction so the URL stays clean until they actually pick.
  return (
    <div className="flex items-center gap-1.5 rounded-md border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent px-1.5 py-1">
      <CalendarRange className="h-3.5 w-3.5 text-primary/70 ml-1" aria-hidden />

      {/* Month / Quarter segmented toggle */}
      <div role="group" aria-label="Reporting granularity" className="inline-flex rounded-sm bg-muted/30 p-0.5">
        {(['month', 'quarter'] as ReportingView[]).map((v) => (
          <Button
            key={v}
            type="button"
            size="sm"
            variant="ghost"
            aria-pressed={view === v}
            onClick={() => handleViewChange(v)}
            className={cn(
              'h-6 px-2 text-[11px] font-medium capitalize rounded-sm',
              view === v
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {v}
          </Button>
        ))}
      </div>

      {/* Period selector */}
      <Select value={activeToken} onValueChange={handlePeriodChange}>
        <SelectTrigger
          aria-label="Reporting period"
          className="h-7 min-w-[110px] border-0 bg-transparent px-2 text-xs font-medium focus:ring-0"
        >
          <SelectValue placeholder={view === 'month' ? 'Select month' : 'Select quarter'} />
        </SelectTrigger>
        <SelectContent align="end">
          {options.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">No data available</div>
          ) : (
            options.map((o) => (
              <SelectItem key={o.token} value={o.token} className="text-xs">
                {o.label}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * Small inline label shown next to the page title to keep the active
 * Reporting Period continuously visible per dashboard guidance.
 */
export function ActivePeriodLabel() {
  const { reportingPeriod } = useInsightsTimeframe();
  if (!reportingPeriod) return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">
      <CalendarRange className="h-3 w-3" aria-hidden />
      Reporting period: {reportingPeriod.label}
    </span>
  );
}