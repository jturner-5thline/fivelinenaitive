import { useMemo, useState } from 'react';
import { Settings, ChevronRight } from 'lucide-react';
import { usePartners, usePipelineStages } from '@/hooks/usePartnersPipeline';
import { useDashboardPreference } from '@/hooks/useDashboardPreference';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';

interface Props {
  onNavigateToStage?: (stageId: string) => void;
}

export function PartnersByStageCards({ onNavigateToStage }: Props) {
  const { data: stages = [] } = usePipelineStages();
  const { data: partners = [] } = usePartners();
  const { value: visibleStages, setValue: setVisibleStages } = useDashboardPreference<string[]>(
    'partner_stage_cards_visible',
    []
  );

  // If no preference set, show all
  const effectiveVisible = visibleStages.length > 0 ? visibleStages : stages.map(s => s.id);

  const countByStage = useMemo(() => {
    const map = new Map<string, number>();
    partners.forEach(p => {
      const sid = p.stage_id || '';
      map.set(sid, (map.get(sid) || 0) + 1);
    });
    return map;
  }, [partners]);

  const toggleStage = (stageId: string) => {
    const current = effectiveVisible;
    const next = current.includes(stageId)
      ? current.filter(s => s !== stageId)
      : [...current, stageId];
    setVisibleStages(next);
  };

  const displayedStages = stages.filter(s => effectiveVisible.includes(s.id));

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Partners by Stage</h3>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
              <Settings className="h-3.5 w-3.5 text-slate-400" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-56">
            <p className="text-xs font-medium text-slate-400 mb-2">Visible Stages</p>
            <div className="space-y-2">
              {stages.map(s => (
                <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={effectiveVisible.includes(s.id)}
                    onCheckedChange={() => toggleStage(s.id)}
                  />
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                  {s.name}
                </label>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {displayedStages.map(stage => {
          const count = countByStage.get(stage.id) || 0;
          return (
            <button
              key={stage.id}
              onClick={() => onNavigateToStage?.(stage.id)}
              className="group flex flex-col gap-1 rounded-lg border border-slate-700 bg-slate-800/60 p-4 text-left hover:border-slate-500 hover:bg-slate-800 transition-all"
            >
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
                <span className="text-xs text-slate-400 truncate">{stage.name}</span>
              </div>
              <span className="text-2xl font-bold text-white">{count}</span>
              <div className="flex items-center gap-1 text-[10px] text-slate-500 group-hover:text-primary transition-colors">
                View partners <ChevronRight className="h-3 w-3" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
