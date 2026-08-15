import { useMemo, useState } from 'react';
import { DealStage } from '@/types/deal';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ArrowRightLeft } from 'lucide-react';
import { usePipelineStageConfig } from '@/hooks/usePipelineStageConfig';
import { usePipelineContext } from '@/contexts/PipelineContext';
import { useDealStages } from '@/contexts/DealStagesContext';
import { MoveToPipelineDialog } from './MoveToPipelineDialog';
import { markOverlayJustClosed } from '@/lib/overlayClickSuppression';

interface InlineStageDropdownProps {
  dealId: string;
  stage: DealStage;
  pipelineId?: string | null;
  onStageChange: (dealId: string, newStage: DealStage) => void;
  className?: string;
  dealName?: string;
}

export function InlineStageDropdown({ dealId, stage, pipelineId, onStageChange, className = '', dealName = '' }: InlineStageDropdownProps) {
  const { getStageConfigForDeal } = usePipelineStageConfig();
  const { pipelines } = usePipelineContext();
  const { stages: globalStages } = useDealStages();
  const [isPipelineDialogOpen, setIsPipelineDialogOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

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
    <>
    <DropdownMenu open={isMenuOpen} onOpenChange={(open) => {
      if (!open) markOverlayJustClosed(350);
      setIsMenuOpen(open);
    }}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={handleTriggerClick}
          onPointerDown={(e) => e.stopPropagation()}
          className="focus:outline-none"
        >
          <Badge
            variant="outline"
            className={`relative overflow-hidden inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold leading-tight cursor-pointer max-w-full text-left whitespace-nowrap border border-[hsl(219_24%_34%)] text-[hsl(213_28%_90%)] bg-[hsl(221_26%_16%)] transition-colors hover:bg-[hsl(221_26%_20%)] hover:border-[hsl(219_24%_42%)] ${className}`}
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
        {pipelines.length > 1 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
              Pipeline
            </DropdownMenuLabel>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setIsMenuOpen(false);
                setIsPipelineDialogOpen(true);
              }}
            >
              <ArrowRightLeft className="h-4 w-4 mr-2" />
              Move to Pipeline
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
      <MoveToPipelineDialog
        dealId={dealId}
        dealName={dealName}
        currentPipelineId={pipelineId}
        isOpen={isPipelineDialogOpen}
        onClose={() => setIsPipelineDialogOpen(false)}
      />
    </>
  );
}
