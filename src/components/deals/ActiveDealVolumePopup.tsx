import { useMemo, useState } from 'react';
import { ChevronRight, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { usePreferences } from '@/contexts/PreferencesContext';
import { usePipelineContext } from '@/contexts/PipelineContext';
import { usePipelineStageConfig } from '@/hooks/usePipelineStageConfig';
import { Deal } from '@/types/deal';
import { StageDrilloverPanel } from './StageDrilloverPanel';

interface ActiveDealVolumePopupProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deals: Deal[];
}

interface StageRow {
  stageId: string;
  label: string;
  color: string;
  volume: number;
  count: number;
  percent: number;
}

export function ActiveDealVolumePopup({ open, onOpenChange, deals }: ActiveDealVolumePopupProps) {
  const { formatCurrencyValue } = usePreferences();
  const { activePipeline } = usePipelineContext();
  const { getStageConfigForDeal } = usePipelineStageConfig();
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);

  const activeDeals = useMemo(() => deals.filter(d => d.status !== 'archived'), [deals]);
  const totalVolume = useMemo(() => activeDeals.reduce((sum, d) => sum + d.value, 0), [activeDeals]);

  const stageRows: StageRow[] = useMemo(() => {
    const groups: Record<string, { volume: number; count: number }> = {};

    activeDeals.forEach(deal => {
      const stage = deal.stage || 'unknown';
      if (!groups[stage]) groups[stage] = { volume: 0, count: 0 };
      groups[stage].volume += deal.value || 0;
      groups[stage].count += 1;
    });

    return Object.entries(groups)
      .map(([stageId, data]) => {
        const config = getStageConfigForDeal(stageId, activePipeline?.id);
        return {
          stageId,
          label: config.label,
          color: config.color,
          volume: data.volume,
          count: data.count,
          percent: totalVolume > 0 ? (data.volume / totalVolume) * 100 : 0,
        };
      })
      .sort((a, b) => b.volume - a.volume);
  }, [activeDeals, totalVolume, getStageConfigForDeal, activePipeline]);

  const selectedStageDeals = useMemo(() => {
    if (!selectedStageId) return [];
    return activeDeals.filter(d => d.stage === selectedStageId);
  }, [activeDeals, selectedStageId]);

  const selectedStageRow = stageRows.find(r => r.stageId === selectedStageId);

  // Extract a usable CSS color from the stage color class
  const getBarColor = (colorClass: string) => {
    // Map common tailwind bg classes to HSL values
    const colorMap: Record<string, string> = {
      'bg-slate-500': 'hsl(215, 16%, 47%)',
      'bg-blue-500': 'hsl(217, 91%, 60%)',
      'bg-indigo-500': 'hsl(239, 84%, 67%)',
      'bg-violet-500': 'hsl(258, 90%, 66%)',
      'bg-purple-500': 'hsl(271, 91%, 65%)',
      'bg-fuchsia-500': 'hsl(292, 84%, 61%)',
      'bg-amber-500': 'hsl(38, 92%, 50%)',
      'bg-cyan-500': 'hsl(188, 86%, 53%)',
      'bg-success': 'hsl(var(--success))',
      'bg-destructive': 'hsl(var(--destructive))',
      'bg-muted': 'hsl(var(--muted))',
      'bg-green-500': 'hsl(142, 71%, 45%)',
      'bg-yellow-500': 'hsl(48, 96%, 53%)',
      'bg-red-500': 'hsl(0, 84%, 60%)',
      'bg-orange-500': 'hsl(25, 95%, 53%)',
      'bg-pink-500': 'hsl(330, 81%, 60%)',
      'bg-teal-500': 'hsl(168, 76%, 42%)',
    };
    return colorMap[colorClass] || 'hsl(var(--primary))';
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className={`transition-all duration-300 ${
            selectedStageId
              ? 'sm:max-w-[95vw] sm:w-[95vw]'
              : 'sm:max-w-lg'
          } max-h-[85vh] p-0 gap-0 overflow-hidden`}
        >
          <div className={`flex h-full transition-all duration-300 ${selectedStageId ? '' : ''}`}>
            {/* Left: stage breakdown */}
            <div className={`flex flex-col transition-all duration-300 ${
              selectedStageId ? 'w-[420px] min-w-[420px] border-r border-border' : 'w-full'
            }`}>
              <DialogHeader className="px-5 pt-5 pb-3 flex-shrink-0">
                <DialogTitle className="text-base font-semibold">Active Deal Volume by Stage</DialogTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Share of total pipeline volume · {activePipeline?.name || 'All Deals'} · {formatCurrencyValue(totalVolume)}
                </p>
              </DialogHeader>

              <div className="flex-1 overflow-y-auto px-2 pb-3">
                {stageRows.length === 0 ? (
                  <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
                    No active deals
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    {stageRows.map((row, idx) => (
                      <button
                        key={row.stageId}
                        onClick={() => setSelectedStageId(row.stageId === selectedStageId ? null : row.stageId)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left transition-all group/row ${
                          selectedStageId === row.stageId
                            ? 'bg-primary/10 border border-primary/20'
                            : idx % 2 === 0
                            ? 'hover:bg-muted/40 border border-transparent'
                            : 'bg-muted/15 hover:bg-muted/40 border border-transparent'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-sm font-medium text-foreground truncate">{row.label}</span>
                            <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                              <span className="text-xs text-muted-foreground">{row.percent.toFixed(1)}%</span>
                              <span className="text-sm font-medium text-foreground">{formatCurrencyValue(row.volume)}</span>
                            </div>
                          </div>
                          {/* Horizontal bar */}
                          <div className="h-1.5 w-full rounded-full bg-muted/30 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{
                                width: `${Math.max(row.percent, 1)}%`,
                                backgroundColor: getBarColor(row.color),
                              }}
                            />
                          </div>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-[11px] text-muted-foreground">
                              {row.count} deal{row.count !== 1 ? 's' : ''}
                            </span>
                          </div>
                        </div>
                        <ChevronRight className={`h-4 w-4 flex-shrink-0 transition-all ${
                          selectedStageId === row.stageId
                            ? 'text-primary'
                            : 'text-muted-foreground/40 group-hover/row:text-muted-foreground'
                        }`} />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {stageRows.length > 0 && (
                <div className="px-5 py-2.5 border-t border-border flex-shrink-0">
                  <p className="text-[11px] text-muted-foreground">Click a stage to view deals</p>
                </div>
              )}
            </div>

            {/* Right: drillover panel */}
            {selectedStageId && selectedStageRow && (
              <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
                <StageDrilloverPanel
                  stageLabel={selectedStageRow.label}
                  stageVolume={selectedStageRow.volume}
                  dealCount={selectedStageRow.count}
                  pipelineName={activePipeline?.name || 'All Deals'}
                  deals={selectedStageDeals}
                  onClose={() => setSelectedStageId(null)}
                />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
