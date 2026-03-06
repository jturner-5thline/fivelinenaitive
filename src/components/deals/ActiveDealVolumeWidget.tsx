import { useState } from 'react';
import { TrendingUp, Briefcase, BarChart3 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { usePreferences } from '@/contexts/PreferencesContext';
import { usePipelineContext } from '@/contexts/PipelineContext';
import { Deal } from '@/types/deal';

interface ActiveDealVolumeWidgetProps {
  deals: Deal[];
  onOpenBreakdown: () => void;
}

type KpiMode = 'deals' | 'volume';

export function ActiveDealVolumeWidget({ deals, onOpenBreakdown }: ActiveDealVolumeWidgetProps) {
  const { formatCurrencyValue } = usePreferences();
  const { activePipeline } = usePipelineContext();
  const [mode, setMode] = useState<KpiMode>('volume');

  const activeDeals = deals.filter(d => d.status !== 'archived');
  const dealCount = activeDeals.length;
  const totalVolume = activeDeals.reduce((sum, d) => sum + d.value, 0);

  const primaryValue = mode === 'deals' ? dealCount.toLocaleString() : formatCurrencyValue(totalVolume);
  const primaryLabel = mode === 'deals' ? 'Active Deals' : 'Active Deal Volume';
  const secondaryValue = mode === 'deals'
    ? formatCurrencyValue(totalVolume)
    : `${dealCount} deal${dealCount !== 1 ? 's' : ''}`;

  return (
    <Card className="relative group border border-[hsl(272,100%,80%,0.35)] bg-[linear-gradient(145deg,hsl(222,30%,18%)_0%,hsl(230,25%,14%)_50%,hsl(238,22%,11%)_100%)] backdrop-blur-xl shadow-[inset_0_1px_2px_hsl(272,100%,80%,0.15),inset_0_-1px_1px_hsl(0,0%,0%,0.2),0_0_12px_hsl(272,100%,70%,0.1),0_6px_28px_hsl(0,0%,0%,0.5)] before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:bg-[linear-gradient(135deg,hsl(272,80%,75%,0.08)_0%,transparent_40%,hsl(268,60%,50%,0.04)_100%)] transition-all duration-200 hover:border-[hsl(272,100%,80%,0.55)] hover:shadow-[inset_0_1px_2px_hsl(272,100%,85%,0.2),inset_0_-1px_1px_hsl(0,0%,0%,0.25),0_0_20px_hsl(272,100%,70%,0.18),0_10px_40px_hsl(0,0%,0%,0.6)] col-span-2 flex flex-col h-full min-h-[140px]">
      {/* Header strip */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs text-white/40 truncate">
            {activePipeline?.name || 'All Deals'}
          </span>
        </div>
        {/* Toggle pills */}
        <div className="flex items-center gap-0.5 rounded-md border border-border/40 bg-background/10 p-0.5">
          <button
            onClick={(e) => { e.stopPropagation(); setMode('deals'); }}
            className={`flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition-all ${
              mode === 'deals'
                ? 'bg-primary/20 text-primary shadow-sm'
                : 'text-white/40 hover:text-white/60'
            }`}
          >
            <Briefcase className="h-3 w-3" />
            Deals
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setMode('volume'); }}
            className={`flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition-all ${
              mode === 'volume'
                ? 'bg-primary/20 text-primary shadow-sm'
                : 'text-white/40 hover:text-white/60'
            }`}
          >
            <TrendingUp className="h-3 w-3" />
            Volume
          </button>
        </div>
      </div>

      {/* Primary KPI */}
      <CardContent className="flex-1 flex flex-col justify-center px-4 pb-2 pt-0">
        <div className="flex items-center gap-3">
          <div className="relative flex h-12 w-12 items-center justify-center rounded-lg border backdrop-blur-sm flex-shrink-0 overflow-hidden bg-primary/15 border-primary/30 shadow-[0_0_12px_hsl(var(--primary)/0.2),inset_0_1px_1px_hsl(var(--primary)/0.15)]">
            {mode === 'deals' ? (
              <Briefcase className="relative z-10 h-6 w-6 text-primary" />
            ) : (
              <TrendingUp className="relative z-10 h-6 w-6 text-primary" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-white/50">{primaryLabel}</p>
            <p className="text-2xl font-semibold text-white">{primaryValue}</p>
            <p className="text-xs text-white/35 mt-0.5">{secondaryValue}</p>
          </div>
        </div>
      </CardContent>

      {/* Footer entry point */}
      <div className="px-4 pb-2.5">
        <button
          onClick={(e) => { e.stopPropagation(); onOpenBreakdown(); }}
          className="flex items-center gap-1.5 text-[11px] text-primary/70 hover:text-primary transition-colors group/link"
        >
          <BarChart3 className="h-3 w-3" />
          <span className="group-hover/link:underline">View by stage</span>
        </button>
      </div>
    </Card>
  );
}
