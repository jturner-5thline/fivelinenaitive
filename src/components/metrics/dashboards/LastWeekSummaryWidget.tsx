import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { CalendarClock, Loader2 } from 'lucide-react';
import { isExcludedDealName } from '@/utils/excludedDeals';

// "NDA/Needs List Sent" stage id in the default (Active) pipeline.
const NDA_NEEDS_LIST_STAGE_IDS = ['ndaneeds-list-sent', 'nda_needs_list_sent'];

function formatCurrencyMM(value: number) {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}MM`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

/** Returns the [start, end] of the previous Mon–Sun week in the user's local tz. */
function lastMonSunRange(now = new Date()): { start: Date; end: Date } {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  // JS: 0=Sun, 1=Mon ... 6=Sat. Compute this-week Monday, then subtract 7.
  const dow = d.getDay();
  const daysSinceMonday = (dow + 6) % 7; // Mon=0, Tue=1, ... Sun=6
  const thisMon = new Date(d);
  thisMon.setDate(d.getDate() - daysSinceMonday);
  const lastMon = new Date(thisMon);
  lastMon.setDate(thisMon.getDate() - 7);
  const lastSun = new Date(lastMon);
  lastSun.setDate(lastMon.getDate() + 6);
  lastSun.setHours(23, 59, 59, 999);
  return { start: lastMon, end: lastSun };
}

export function LastWeekSummaryWidget() {
  const { company } = useCompany();
  const companyId = company?.id;
  const range = useMemo(() => lastMonSunRange(), []);

  const { data, isLoading } = useQuery({
    queryKey: ['last-week-nda-needs-list', companyId, range.start.toISOString(), range.end.toISOString()],
    enabled: !!companyId,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('deal_stage_history')
        .select('deal_id, changed_at, to_stage_id, deals!inner(company, value)')
        .eq('company_id', companyId!)
        .eq('event_type', 'stage_enter')
        .in('to_stage_id', NDA_NEEDS_LIST_STAGE_IDS)
        .gte('changed_at', range.start.toISOString())
        .lte('changed_at', range.end.toISOString())
        .order('changed_at', { ascending: true });
      if (error) throw error;
      const seen = new Map<string, number>();
      for (const row of (rows ?? []) as any[]) {
        if (seen.has(row.deal_id)) continue;
        const deal = row.deals;
        if (!deal) continue;
        if (isExcludedDealName(deal.company)) continue;
        seen.set(row.deal_id, Number(deal.value) || 0);
      }
      const count = seen.size;
      const dollars = Array.from(seen.values()).reduce((s, v) => s + v, 0);
      return { count, dollars };
    },
  });

  const rangeLabel = `${range.start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${range.end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

  return (
    <Card
      className={cn(
        'relative overflow-hidden h-full glass-module',
        'transition-all duration-200',
      )}
    >
      <div
        className="absolute top-0 left-0 right-0 h-[2px] opacity-60"
        style={{ background: 'linear-gradient(90deg, hsl(var(--primary)), transparent)' }}
      />
      <CardContent className="p-4 flex flex-col gap-3 h-full">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Last Week
            </span>
          </div>
          <span className="text-[10px] font-mono text-muted-foreground/70">{rangeLabel}</span>
        </div>

        <Group title="Debt Advisory">
          <Row
            label="Deals | Dollars on the Board"
            count={data?.count ?? 0}
            dollars={data?.dollars ?? 0}
            isLoading={isLoading}
          />
          <Row label="Deals Signed | Dollars Signed" placeholder />
          <Row label="Terms Issued | $ Terms Issued" placeholder />
          <Row label="Terms Signed | $ Terms Signed" placeholder />
          <Row label="Deals Closed | Dollars Funded" placeholder />
        </Group>
        <Group title="FinServ">
          <Row label="FinServ Deals | $ On the Board" placeholder />
        </Group>
        <Group title="Naitive">
          <Row label="Deals | Dollars on the Board" placeholder />
        </Group>
      </CardContent>
    </Card>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[10px] uppercase tracking-[0.15em] font-semibold text-primary/80">
        {title}
      </p>
      <div className="flex flex-col gap-2 pl-2 border-l border-primary/20">
        {children}
      </div>
    </div>
  );
}

function Row({
  label,
  count,
  dollars,
  isLoading,
  placeholder,
}: {
  label: string;
  count?: number;
  dollars?: number;
  isLoading?: boolean;
  placeholder?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border/30 pt-3 first:border-t-0 first:pt-0">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium truncate flex-1 min-w-0">
        {label}
      </p>
      <div className="flex items-baseline gap-2 shrink-0">
        {placeholder ? (
          <span className="text-lg font-bold font-mono tabular-nums text-muted-foreground/60">—</span>
        ) : isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <>
            <span className="text-lg font-bold font-mono tabular-nums text-foreground">
              {count} <span className="text-xs font-medium text-muted-foreground">Deal{count === 1 ? '' : 's'}</span>
            </span>
            <span className="text-muted-foreground/60 font-light">|</span>
            <span className="text-lg font-bold font-mono tabular-nums text-foreground">
              {formatCurrencyMM(dollars ?? 0)}
            </span>
          </>
        )}
      </div>
    </div>
  );
}