import { useMemo, useState, useEffect } from 'react';
import { ChevronRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { usePreferences } from '@/contexts/PreferencesContext';
import { Deal } from '@/types/deal';
import { StageDrilloverPanel } from './StageDrilloverPanel';
import { usePipelineFunnelData, getStageBarColor } from '@/hooks/usePipelineFunnelData';

interface ActiveDealVolumePopupProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deals: Deal[];
  /** If set, auto-select this stage when the popup opens */
  initialStageId?: string | null;
}

export function ActiveDealVolumePopup({ open, onOpenChange, deals, initialStageId }: ActiveDealVolumePopupProps) {
  const { formatCurrencyValue } = usePreferences();
  const { stagesByVolume, activeDeals, totalVolume, pipelineName } = usePipelineFunnelData(deals);
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);

  // When popup opens with an initialStageId, auto-select it
  useEffect(() => {
    if (open && initialStageId) {
      setSelectedStageId(initialStageId);
    } else if (!open) {
      setSelectedStageId(null);
    }
  }, [open, initialStageId]);

  const selectedStageDeals = useMemo(() => {
    if (!selectedStageId) return [];
    return activeDeals.filter(d => d.stage === selectedStageId);
  }, [activeDeals, selectedStageId]);

  const selectedStageRow = stagesByVolume.find(r => r.stageId === selectedStageId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`transition-all duration-300 ${
          selectedStageId
            ? 'sm:max-w-[95vw] sm:w-[95vw]'
            : 'sm:max-w-lg'
        } max-h-[85vh] p-0 gap-0 overflow-hidden`}
      >
        <div className="flex h-full transition-all duration-300">
          {/* Left: stage breakdown */}
          <div className={`flex flex-col transition-all duration-300 ${
            selectedStageId ? 'w-[420px] min-w-[420px] border-r border-border' : 'w-full'
          }`}>
            <DialogHeader className="px-5 pt-5 pb-3 flex-shrink-0">
              <DialogTitle className="text-base font-semibold">Active Deal Volume by Stage</DialogTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Share of total pipeline volume · {pipelineName} · {formatCurrencyValue(totalVolume)}
              </p>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto px-2 pb-3">
              {stagesByVolume.length === 0 ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
                  No active deals
                </div>
              ) : (
                <div className="space-y-0.5">
                  {stagesByVolume.map((row, idx) => (
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
                              backgroundColor: row.cssColor,
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

            {stagesByVolume.length > 0 && (
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
                pipelineName={pipelineName}
                deals={selectedStageDeals}
                onClose={() => setSelectedStageId(null)}
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
