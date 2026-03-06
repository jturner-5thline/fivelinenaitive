import { useState } from 'react';
import { BarChart3, Briefcase, TrendingUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { usePreferences } from '@/contexts/PreferencesContext';
import { Deal } from '@/types/deal';
import { usePipelineFunnelData } from '@/hooks/usePipelineFunnelData';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface PipelineFunnelCardProps {
  deals: Deal[];
  onStageClick: (stageId: string) => void;
}

type FunnelMetric = 'count' | 'volume';

export function PipelineFunnelCard({ deals, onStageClick }: PipelineFunnelCardProps) {
  const { formatCurrencyValue } = usePreferences();
  const { stages, totalVolume, totalCount, pipelineName } = usePipelineFunnelData(deals);
  const [metric, setMetric] = useState<FunnelMetric>('volume');

  const maxValue = Math.max(
    ...stages.map(s => (metric === 'count' ? s.count : s.volume)),
    1
  );

  const formatVolume = (val: number) => {
    if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}MM`;
    if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
    return `$${val.toLocaleString()}`;
  };

  return (
    <Card className="relative group border border-[hsl(272,100%,80%,0.35)] bg-[linear-gradient(145deg,hsl(222,30%,18%)_0%,hsl(230,25%,14%)_50%,hsl(238,22%,11%)_100%)] backdrop-blur-xl shadow-[inset_0_1px_2px_hsl(272,100%,80%,0.15),inset_0_-1px_1px_hsl(0,0%,0%,0.2),0_0_12px_hsl(272,100%,70%,0.1),0_6px_28px_hsl(0,0%,0%,0.5)] before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:bg-[linear-gradient(135deg,hsl(272,80%,75%,0.08)_0%,transparent_40%,hsl(268,60%,50%,0.04)_100%)] transition-all duration-200 hover:border-[hsl(272,100%,80%,0.55)] col-span-2 lg:col-span-4 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1.5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent/15 border border-accent/30">
            <BarChart3 className="h-3.5 w-3.5 text-accent" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-white">Pipeline Funnel</h3>
            <p className="text-[11px] text-white/35">{pipelineName} · {totalCount} deals · {formatVolume(totalVolume)}</p>
          </div>
        </div>
        {/* Toggle */}
        <div className="flex items-center gap-0.5 rounded-md border border-border/40 bg-background/10 p-0.5">
          <button
            onClick={() => setMetric('count')}
            className={`flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition-all ${
              metric === 'count'
                ? 'bg-primary/20 text-primary shadow-sm'
                : 'text-white/40 hover:text-white/60'
            }`}
          >
            <Briefcase className="h-3 w-3" />
            Count
          </button>
          <button
            onClick={() => setMetric('volume')}
            className={`flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition-all ${
              metric === 'volume'
                ? 'bg-primary/20 text-primary shadow-sm'
                : 'text-white/40 hover:text-white/60'
            }`}
          >
            <TrendingUp className="h-3 w-3" />
            Volume
          </button>
        </div>
      </div>

      {/* Chart */}
      <CardContent className="flex-1 px-4 pb-3 pt-1">
        {stages.length === 0 ? (
          <div className="flex items-center justify-center h-full min-h-[80px] text-white/30 text-sm">
            No active deals
          </div>
        ) : (
          <TooltipProvider delayDuration={150}>
            <div className="space-y-1.5">
              {stages.map(stage => {
                const barValue = metric === 'count' ? stage.count : stage.volume;
                const barWidth = maxValue > 0 ? (barValue / maxValue) * 100 : 0;
                const barLabel = metric === 'count'
                  ? `${stage.count}`
                  : formatVolume(stage.volume);

                return (
                  <Tooltip key={stage.stageId}>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => onStageClick(stage.stageId)}
                        className="w-full flex items-center gap-2 group/bar rounded-md px-1 py-0.5 transition-all hover:bg-white/5 cursor-pointer text-left"
                      >
                        {/* Stage label */}
                        <span className="text-[11px] text-white/60 w-[110px] min-w-[110px] truncate text-right">
                          {stage.label}
                        </span>
                        {/* Bar container */}
                        <div className="flex-1 h-5 rounded bg-white/5 overflow-hidden relative">
                          <div
                            className="h-full rounded transition-all duration-500 group-hover/bar:brightness-125"
                            style={{
                              width: `${Math.max(barWidth, 2)}%`,
                              backgroundColor: stage.cssColor,
                              opacity: 0.85,
                            }}
                          />
                        </div>
                        {/* Value label */}
                        <span className="text-[11px] font-medium text-white/70 w-[80px] min-w-[80px] text-right tabular-nums">
                          {stage.count} · {formatVolume(stage.volume)}
                        </span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="bg-popover border border-border rounded-lg p-3 shadow-lg max-w-xs">
                      <p className="font-medium text-foreground text-sm">{stage.label}</p>
                      <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                        <p>{stage.count} deal{stage.count !== 1 ? 's' : ''}</p>
                        <p>{formatCurrencyValue(stage.volume)}</p>
                        <p>{stage.percent.toFixed(1)}% of pipeline volume</p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </TooltipProvider>
        )}
      </CardContent>
    </Card>
  );
}
