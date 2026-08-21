import { useMemo } from 'react';
import { liquidGlassCard, LIQUID_GLASS_SERIES } from '@/components/metrics/liquidGlass';
import { useDealReferralSources } from '@/hooks/useDealReferralSources';

const STAGES: { key: 'nurturing' | 3 | 2 | 1; label: string }[] = [
  { key: 'nurturing', label: 'Nurturing' },
  { key: 3, label: 'Tier 3' },
  { key: 2, label: 'Tier 2' },
  { key: 1, label: 'Tier 1' },
];

function formatCurrencyCompact(v: number): string {
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${Math.round(v).toLocaleString()}`;
}

export function ReferralSourcePipelineWidget() {
  const { referralSources } = useDealReferralSources();

  const stageData = useMemo(() => {
    return STAGES.map((s, i) => {
      const rows = referralSources.filter(r =>
        s.key === 'nurturing' ? r.tier === null : r.tier === s.key,
      );
      return {
        ...s,
        count: rows.length,
        deals: rows.reduce((sum, r) => sum + (r.dealCount || 0), 0),
        volume: rows.reduce((sum, r) => sum + (r.totalVolume || 0), 0),
        color: LIQUID_GLASS_SERIES[i % LIQUID_GLASS_SERIES.length],
      };
    });
  }, [referralSources]);

  const max = Math.max(1, ...stageData.map(s => s.count));
  const total = stageData.reduce((sum, s) => sum + s.count, 0);

  return (
    <div className={`${liquidGlassCard} p-4 space-y-4`}>
      <div>
        <h3 className="text-base font-semibold tracking-tight text-foreground">Referral Source Pipeline</h3>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          Referral sources by tier — nurturing sources have not yet met a tier threshold
        </p>
      </div>

      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${stageData.length}, minmax(0,1fr))` }}>
        {stageData.map(stage => {
          const pct = (stage.count / max) * 100;
          return (
            <div key={String(stage.key)} className="space-y-2">
              <div className="text-center">
                <p className="text-lg font-bold font-mono tabular-nums text-foreground">{stage.count}</p>
                <p className="text-[10px] text-muted-foreground truncate">{stage.label}</p>
              </div>
              <div className="h-20 flex items-end justify-center">
                <div
                  className="w-full max-w-[72px] rounded-t-md transition-all duration-500"
                  style={{ height: `${Math.max(pct, 8)}%`, backgroundColor: stage.color }}
                />
              </div>
              <div className="text-center space-y-0.5">
                <p className="text-[10px] text-muted-foreground">
                  {stage.deals} deal{stage.deals === 1 ? '' : 's'}
                </p>
                <p className="text-[10px] font-mono tabular-nums text-muted-foreground/80">
                  {formatCurrencyCompact(stage.volume)}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-muted-foreground">
        {total} referral source{total === 1 ? '' : 's'} in selected period
      </p>
    </div>
  );
}
