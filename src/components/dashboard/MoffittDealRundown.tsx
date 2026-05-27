import { useMemo, useState } from 'react';
import { ChevronDown, ExternalLink, AlertTriangle, Briefcase } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatUSD } from '@/lib/formatters/currency';
import { usePipelineData } from '@/hooks/useDailyBriefingData';
import { MOFFITT_ASSIGNEE_NAME } from '@/constants/moffittBriefing';

/**
 * Deal Rundown — Moffitt-only section inside Moffitt's Daily Rundown panel.
 *
 * Renders a digest of Moffitt's active deals: count + weighted value + risk
 * roll-up, followed by a sorted (at-risk first, then by recent activity)
 * capped list of up to 10 deals, each opening the deal in a new tab.
 *
 * Visibility gating is enforced at the call site — this component must only
 * be rendered when the parent Daily Rundown is Moffitt's (i.e. targetUserId
 * === MOFFITT_USER_ID). Mounting it for any other user would still query the
 * "John Moffitt" scope, which is wasteful and visually wrong.
 */
const STALE_DAYS = 14;

function daysSince(iso?: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

function relativeTime(iso?: string | null): string {
  const d = daysSince(iso);
  if (d === null) return '—';
  if (d === 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 7) return `${d}d ago`;
  if (d < 30) return `${Math.floor(d / 7)}w ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

export function MoffittDealRundown({ enabled }: { enabled: boolean }) {
  const { data, isLoading } = usePipelineData(enabled, MOFFITT_ASSIGNEE_NAME);
  const [collapsed, setCollapsed] = useState(false);

  const { rows, totalCount, weightedValue, riskCount } = useMemo(() => {
    const scoped = (data?.scopedDeals as any[]) || [];
    const enriched = scoped.map(d => {
      const days = daysSince(d.updatedAt) ?? 999;
      const atRisk = !!d.isFlagged || days > STALE_DAYS;
      return { d, days, atRisk };
    });
    enriched.sort((a, b) => {
      if (a.atRisk !== b.atRisk) return a.atRisk ? -1 : 1;
      return a.days - b.days;
    });
    const weighted = scoped.reduce((sum, d) => sum + (Number(d.value) || 0), 0);
    return {
      rows: enriched.slice(0, 10),
      totalCount: scoped.length,
      weightedValue: weighted,
      riskCount: enriched.filter(e => e.atRisk).length,
    };
  }, [data]);

  const openDeal = (id: string) => {
    window.open(`/deals?deal=${id}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <section
      aria-label="Deal Rundown"
      className="mb-3 rounded-xl border border-white/10 bg-background/40 motion-safe:transition-all"
    >
      <button
        type="button"
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-white/[0.03] rounded-t-xl motion-safe:transition-colors"
        aria-expanded={!collapsed}
      >
        <Briefcase className="h-4 w-4 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-white">Deal Rundown</div>
          <div className="text-[11px] text-muted-foreground truncate">
            {isLoading ? (
              'Loading…'
            ) : (
              <>
                {totalCount} active deal{totalCount === 1 ? '' : 's'}
                {' · '}
                {formatUSD(weightedValue)} weighted value
                {' · '}
                <span className={cn(riskCount > 0 && 'text-amber-400')}>
                  {riskCount} need{riskCount === 1 ? 's' : ''} attention
                </span>
              </>
            )}
          </div>
        </div>
        <ChevronDown
          className={cn(
            'h-4 w-4 text-muted-foreground motion-safe:transition-transform',
            collapsed && '-rotate-90',
          )}
        />
      </button>
      {!collapsed && (
        <div className="px-2 pb-2 motion-safe:animate-fade-in">
          {rows.length === 0 && !isLoading ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              No active deals — nice work clearing the slate.
            </div>
          ) : (
            <ul className="space-y-1">
              {rows.map(({ d, days, atRisk }) => (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() => openDeal(d.id)}
                    className="group w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left hover:bg-white/[0.05] motion-safe:transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        {atRisk && (
                          <AlertTriangle className="h-3 w-3 text-amber-400 shrink-0" />
                        )}
                        <span className="text-sm font-medium text-white truncate">
                          {d.company || d.name}
                        </span>
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-primary/10 text-primary border border-primary/20 capitalize shrink-0">
                          {String(d.stage || '').replace(/-/g, ' ')}
                        </span>
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                        {formatUSD(Number(d.value) || 0)}
                        {' · '}
                        {days}d in stage
                        {' · '}
                        last activity {relativeTime(d.updatedAt)}
                      </div>
                    </div>
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 motion-safe:transition-opacity shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {totalCount > rows.length && (
            <a
              href={`/finserv?owner=${encodeURIComponent(MOFFITT_ASSIGNEE_NAME)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block px-3 py-2 mt-1 text-[11px] font-medium text-primary hover:underline"
            >
              View all {totalCount} deals →
            </a>
          )}
        </div>
      )}
    </section>
  );
}

export default MoffittDealRundown;