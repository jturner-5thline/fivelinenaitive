import { useMemo, useState } from 'react';
import { usePipelineStages, usePartners, type Partner, type PipelineStage } from '@/hooks/usePartnersPipeline';
import { useChannelEntries } from '@/hooks/useChannelEntries';
import { liquidGlassCard, LIQUID_GLASS_SERIES } from '@/components/metrics/liquidGlass';
import { CHANNEL_TYPE_OPTIONS, channelLabel } from './channelOptions';
import { Filter } from 'lucide-react';
import { useOptionalSalesBdDateRange } from '@/contexts/SalesBdDateRangeContext';

const STAGE_ORDER_HINTS = ['On Hold', 'Identified', 'Added to Ecosystem', 'Contacted', 'In Discussion', 'Nurturing', 'Agreement', 'Trial', 'Active Partner', 'Dormant'];

function orderStages(stages: PipelineStage[]): PipelineStage[] {
  const named = [...stages].sort((a, b) => a.sort_order - b.sort_order);
  return named;
}

export function PartnersFunnelChart() {
  const dateCtx = useOptionalSalesBdDateRange();
  const rangeStart = dateCtx?.start ?? null;
  const rangeEnd = dateCtx?.end ?? null;
  const granularity = dateCtx?.range.granularity ?? null;
  const { data: stages = [] } = usePipelineStages();
  const { data: partners = [] } = usePartners({ start: rangeStart, end: rangeEnd, granularity });
  const { data: channelEntries = [] } = useChannelEntries();

  const [channelType, setChannelType] = useState<string>('all');

  // Map partner name (lowercased) -> channel_type from channel_entries
  const nameToChannel = useMemo(() => {
    const m = new Map<string, string>();
    channelEntries.forEach(ce => {
      const n =
        ce.contact?.full_name?.toLowerCase().trim() ||
        ce.crm_company?.name?.toLowerCase().trim();
      if (n) m.set(n, ce.channel_type);
    });
    return m;
  }, [channelEntries]);

  const filtered = useMemo<Partner[]>(() => {
    return partners.filter(p => {
      if (channelType !== 'all') {
        const c = nameToChannel.get((p.name || '').toLowerCase().trim());
        if (c !== channelType) return false;
      }
      return true;
    });
  }, [partners, period, channelType, nameToChannel]);

  const orderedStages = useMemo(() => orderStages(stages), [stages]);
  const stageCounts = useMemo(() => {
    const counts = new Map<string, number>();
    orderedStages.forEach(s => counts.set(s.id, 0));
    filtered.forEach(p => {
      if (p.stage_id && counts.has(p.stage_id)) {
        counts.set(p.stage_id, (counts.get(p.stage_id) || 0) + 1);
      }
    });
    return orderedStages.map(s => ({ id: s.id, name: s.name, color: s.color, count: counts.get(s.id) || 0 }));
  }, [orderedStages, filtered]);

  const max = Math.max(1, ...stageCounts.map(s => s.count));

  return (
    <div className={`${liquidGlassCard} p-4 space-y-4`}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-base font-semibold tracking-tight text-foreground">Partners Pipeline Funnel</h3>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            How sources progress through stages — drop-off shown between each step
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <Filter className="h-3 w-3" />
            <select
              value={channelType}
              onChange={(e) => setChannelType(e.target.value)}
              className="bg-card border border-border rounded-md px-2 py-1 text-[10px] text-foreground"
            >
              <option value="all">All channels</option>
              {CHANNEL_TYPE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {stageCounts.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-8">No partner pipeline stages configured</p>
      ) : (
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: `repeat(${stageCounts.length}, minmax(0,1fr))` }}
        >
          {stageCounts.map((stage, i) => {
            const pct = (stage.count / max) * 100;
            const next = stageCounts[i + 1];
            const drop = stage.count > 0 && next ? Math.round((next.count / stage.count) * 100) : null;
            const fill = stage.color || LIQUID_GLASS_SERIES[i % LIQUID_GLASS_SERIES.length];
            return (
              <div key={stage.id} className="space-y-2">
                <div className="text-center">
                  <p className="text-lg font-bold font-mono tabular-nums text-foreground">{stage.count}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{stage.name}</p>
                </div>
                <div className="h-20 flex items-end justify-center">
                  <div
                    className="w-full max-w-[64px] rounded-t-md transition-all duration-500"
                    style={{ height: `${Math.max(pct, 8)}%`, backgroundColor: fill }}
                  />
                </div>
                {next && (
                  <p className="text-[9px] text-center text-muted-foreground/60">
                    {drop !== null ? `${drop}% →` : '— →'}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground">
        {filtered.length} partner{filtered.length === 1 ? '' : 's'} in selected period
        {channelType !== 'all' && ` · ${channelLabel(channelType)}`}
      </p>
    </div>
  );
}