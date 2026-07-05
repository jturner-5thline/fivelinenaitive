import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { CalendarClock, Loader2 } from 'lucide-react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { isExcludedDealName } from '@/utils/excludedDeals';

// Stage identifiers in the default (Active) pipeline. Some legacy rows have
// an empty `to_stage_id` — match by `to_stage` label as a fallback.
const DEBT_STAGES = {
  ndaNeedsList:   { ids: ['ndaneeds-list-sent', 'nda_needs_list_sent'], labels: ['NDA/Needs List Sent', 'ndaneeds-list-sent'] },
  finalCredit:    { ids: ['final-credit-items'],                        labels: ['Final Credit Items', 'final-credit-items'] },
  termsIssued:    { ids: ['terms-issued'],                              labels: ['Terms Issued', 'terms-issued'] },
  inDueDiligence: { ids: ['in-due-diligence'],                          labels: ['In Due Diligence', 'in-due-diligence'] },
  fundedInvoiced: { ids: ['funded-invoiced'],                           labels: ['Funded/Invoiced', 'Funded / Invoiced', 'funded-invoiced'] },
} as const;

// FinServ Pipeline stage identifiers.
const FINSERV_STAGES = {
  qualification: { ids: ['fs-qualification'], labels: ['Qualification', 'fs-qualification'] },
  proposalSent:  { ids: ['fs-proposal-sent'], labels: ['Proposal Sent', 'fs-proposal-sent'] },
  activeClient:  { ids: ['fs-closed-won'],    labels: ['Active Client', 'fs-closed-won'] },
} as const;

type StageConfig = { ids: readonly string[]; labels: readonly string[] };

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

/** Returns the [start, end] of the week before last (Mon–Sun) in local tz. */
function priorWeekRange(now = new Date()): { start: Date; end: Date } {
  const last = lastMonSunRange(now);
  const start = new Date(last.start);
  start.setDate(start.getDate() - 7);
  const end = new Date(last.end);
  end.setDate(end.getDate() - 7);
  return { start, end };
}

function pctChange(curr: number, prev: number): number | null {
  if (!prev) return curr > 0 ? Infinity : null;
  return ((curr - prev) / prev) * 100;
}

export function LastWeekSummaryWidget() {
  const { company } = useCompany();
  const companyId = company?.id;
  const range = useMemo(() => lastMonSunRange(), []);
  const priorRange = useMemo(() => priorWeekRange(), []);

  const fetchWindow = async (start: Date, end: Date, stage: StageConfig) => {
    const { data: rows, error } = await supabase
      .from('deal_stage_history')
      .select('deal_id, changed_at, to_stage_id, to_stage, deals!inner(company, value)')
      .eq('company_id', companyId!)
      .eq('event_type', 'stage_enter')
      .or(
        `to_stage_id.in.(${stage.ids.map((s) => `"${s}"`).join(',')}),to_stage.in.(${stage.labels.map((s) => `"${s}"`).join(',')})`,
      )
      .gte('changed_at', start.toISOString())
      .lte('changed_at', end.toISOString())
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
    return {
      count: seen.size,
      dollars: Array.from(seen.values()).reduce((s, v) => s + v, 0),
    };
  };

  const useStageWindow = (key: string, stage: StageConfig) =>
    useQuery({
      queryKey: ['last-week-stage', key, companyId, range.start.toISOString(), range.end.toISOString()],
      enabled: !!companyId,
      queryFn: async () => {
        const [curr, prev] = await Promise.all([
          fetchWindow(range.start, range.end, stage),
          fetchWindow(priorRange.start, priorRange.end, stage),
        ]);
        return { ...curr, prevCount: prev.count, prevDollars: prev.dollars };
      },
    });

  const nda        = useStageWindow('nda-needs-list', DEBT_STAGES.ndaNeedsList);
  const signed     = useStageWindow('final-credit-items', DEBT_STAGES.finalCredit);
  const termsIss   = useStageWindow('terms-issued', DEBT_STAGES.termsIssued);
  const termsSign  = useStageWindow('in-due-diligence', DEBT_STAGES.inDueDiligence);
  const funded     = useStageWindow('funded-invoiced', DEBT_STAGES.fundedInvoiced);

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
          <StageRow label="Deals | Dollars on the Board"    q={nda} />
          <StageRow label="Deals Signed | Dollars Signed"   q={signed} />
          <StageRow label="Terms Issued | $ Terms Issued"   q={termsIss} />
          <StageRow label="Terms Signed | $ Terms Signed"   q={termsSign} />
          <StageRow label="Deals Closed | Dollars Funded"   q={funded} />
        </Group>
        <Group title="FinServ">
          <Row label="FinServ Deals | $ On the Board" placeholder />
          <Row label="Proposals Sent | Revenue Proposed" placeholder />
          <Row label="Clients Signed | Revenue Signed" placeholder />
        </Group>
        <Group title="Naitive">
          <Row label="Demos Created" placeholder />
          <Row label="Proposals Issued" placeholder />
          <Row label="Clients Signed" placeholder />
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

function StageRow({
  label,
  q,
}: {
  label: string;
  q: { data?: { count: number; dollars: number; prevCount: number; prevDollars: number }; isLoading: boolean };
}) {
  return (
    <Row
      label={label}
      count={q.data?.count ?? 0}
      dollars={q.data?.dollars ?? 0}
      prevCount={q.data?.prevCount ?? 0}
      prevDollars={q.data?.prevDollars ?? 0}
      isLoading={q.isLoading}
    />
  );
}

function Row({
  label,
  count,
  dollars,
  prevCount,
  prevDollars,
  isLoading,
  placeholder,
}: {
  label: string;
  count?: number;
  dollars?: number;
  prevCount?: number;
  prevDollars?: number;
  isLoading?: boolean;
  placeholder?: boolean;
}) {
  const countChange = !placeholder ? pctChange(count ?? 0, prevCount ?? 0) : null;
  const dollarsChange = !placeholder ? pctChange(dollars ?? 0, prevDollars ?? 0) : null;
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border/30 pt-3 first:border-t-0 first:pt-0">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium truncate flex-1 min-w-0">
        {label}
      </p>
      <div className="flex items-baseline gap-2 shrink-0">
        {placeholder ? (
          <>
            <span className="text-lg font-bold font-mono tabular-nums text-muted-foreground/60">—</span>
            <DeltaBadge pct={null} />
          </>
        ) : isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <>
            <span className="text-lg font-bold font-mono tabular-nums text-foreground">
              {count} <span className="text-xs font-medium text-muted-foreground">Deal{count === 1 ? '' : 's'}</span>
            </span>
            <DeltaBadge pct={countChange} />
            <span className="text-muted-foreground/60 font-light">|</span>
            <span className="text-lg font-bold font-mono tabular-nums text-foreground">
              {formatCurrencyMM(dollars ?? 0)}
            </span>
            <DeltaBadge pct={dollarsChange} />
          </>
        )}
      </div>
    </div>
  );
}

function DeltaBadge({ pct }: { pct: number | null }) {
  if (pct === null) {
    return (
      <span className="text-[10px] font-mono text-muted-foreground/40 min-w-[3rem] text-right">
        —
      </span>
    );
  }
  if (!isFinite(pct)) {
    return (
      <span className="text-[10px] font-mono font-semibold text-success min-w-[3rem] text-right">
        new
      </span>
    );
  }
  const positive = pct >= 0;
  const Icon = positive ? ArrowUp : ArrowDown;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-[10px] font-mono font-semibold min-w-[3rem] justify-end',
        positive ? 'text-success' : 'text-destructive',
      )}
    >
      <Icon className="h-2.5 w-2.5" />
      {Math.abs(pct).toFixed(0)}%
    </span>
  );
}