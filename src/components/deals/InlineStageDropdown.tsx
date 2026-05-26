import { useMemo } from 'react';
import { DealStage } from '@/types/deal';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { usePipelineStageConfig } from '@/hooks/usePipelineStageConfig';
import { usePipelineContext } from '@/contexts/PipelineContext';
import { useDealStages } from '@/contexts/DealStagesContext';

interface InlineStageDropdownProps {
  dealId: string;
  stage: DealStage;
  pipelineId?: string | null;
  onStageChange: (dealId: string, newStage: DealStage) => void;
  className?: string;
}

export function InlineStageDropdown({ dealId, stage, pipelineId, onStageChange, className = '' }: InlineStageDropdownProps) {
  const { getStageConfigForDeal } = usePipelineStageConfig();
  const { pipelines } = usePipelineContext();
  const { stages: globalStages } = useDealStages();

  const currentConfig = getStageConfigForDeal(stage, pipelineId);

  const stageOptions = useMemo(() => {
    const dealPipeline = pipelineId ? pipelines.find(p => p.id === pipelineId) : null;
    if (dealPipeline?.stages?.length) {
      return dealPipeline.stages.map(s => ({ id: s.id, label: s.label, color: s.color }));
    }
    return globalStages.map(s => ({ id: s.id, label: s.label, color: s.color }));
  }, [pipelineId, pipelines, globalStages]);

  const handleTriggerClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={handleTriggerClick}
          onPointerDown={(e) => e.stopPropagation()}
          className="focus:outline-none"
        >
          <Badge
            variant="outline"
            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium leading-tight bg-muted/60 border border-border/50 text-foreground/85 cursor-pointer transition-colors hover:bg-muted/80 hover:text-foreground max-w-full text-left whitespace-normal break-words ${className}`}
          >
            {currentConfig.label}
          </Badge>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="bottom"
        sideOffset={4}
        avoidCollisions={false}
        className="max-h-[300px] overflow-y-auto"
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {stageOptions.map((s) => (
          <DropdownMenuItem
            key={s.id}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onStageChange(dealId, s.id as DealStage);
            }}
            className={`flex items-center gap-2 ${stage === s.id ? 'bg-muted' : ''}`}
          >
            <span className={`h-2 w-2 rounded-full ${s.color}`} />
            {s.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
