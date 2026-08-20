/**
 * EditableDealStageTag
 * --------------------
 * Interactive pill that lets the user change a deal's pipeline stage
 * in place. Mirrors the affordance/UX of EditableDealStatusTag (the
 * canonical-status pill) so both controls sit naturally next to each
 * other in the rundown memo header and master tile.
 *
 * Stage options resolve pipeline-aware via `usePipelineContext()` so
 * per-pipeline labels (notably the "In Development" pipeline's
 * overloaded stage ids — see project memory "Pipeline Stage IDs")
 * stay correct.
 */
import { useCallback, useMemo, useState } from 'react';
import { ChevronDown, Check, Loader2, ArrowRightLeft } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { useDealsContext } from '@/contexts/DealsContext';
import { usePipelineContext } from '@/contexts/PipelineContext';
import { usePipelineStageConfig } from '@/hooks/usePipelineStageConfig';

export interface EditableDealStageTagProps {
  dealId: string;
  stage: string | null | undefined;
  pipelineId?: string | null;
  className?: string;
  /** When true, hides the chevron affordance (still clickable). */
  hideChevron?: boolean;
}

function titleCase(s: string): string {
  return s.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function EditableDealStageTag({
  dealId,
  stage,
  pipelineId,
  className,
  hideChevron,
}: EditableDealStageTagProps) {
  const { updateDeal } = useDealsContext();
  const { pipelines } = usePipelineContext();
  const { getStageConfigForDeal } = usePipelineStageConfig();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  // Pipeline the user is currently browsing inside the popover. Defaults to
  // the deal's own pipeline; changing it lets the user pick a stage from a
  // different pipeline (effectively moving the deal between pipelines).
  const [viewPipelineId, setViewPipelineId] = useState<string | null>(
    pipelineId ?? null,
  );

  const current = (stage || '') as string;
  const currentLabel = current
    ? getStageConfigForDeal(current, pipelineId)?.label || titleCase(current)
    : null;

  // The pipeline being browsed in the popover. Prefer explicit selection,
  // then the deal's own pipeline, then default, then any.
  const viewPipeline = useMemo(() => {
    return (
      (viewPipelineId ? pipelines.find((p) => p.id === viewPipelineId) : null) ||
      (pipelineId ? pipelines.find((p) => p.id === pipelineId) : null) ||
      pipelines.find((p) => p.isDefault) ||
      pipelines[0] ||
      null
    );
  }, [pipelines, viewPipelineId, pipelineId]);
  const stageOptions = viewPipeline?.stages ?? [];
  const isCrossPipeline = !!viewPipeline && !!pipelineId && viewPipeline.id !== pipelineId;

  const handleSelect = useCallback(async (nextId: string) => {
    setOpen(false);
    const movingPipeline = !!viewPipeline && !!pipelineId && viewPipeline.id !== pipelineId;
    if (!nextId || (nextId === current && !movingPipeline)) return;
    setPending(true);
    try {
      const updates: any = { stage: nextId };
      if (movingPipeline && viewPipeline) updates.pipelineId = viewPipeline.id;
      await updateDeal(dealId, updates);
      // Same cross-surface invalidation as EditableDealStatusTag so the
      // rundown / briefing / pipeline boards re-pull immediately.
      queryClient.invalidateQueries({ queryKey: ['briefing-pipeline'] });
      queryClient.invalidateQueries({ queryKey: ['briefing-catchup'] });
      queryClient.invalidateQueries({ queryKey: ['briefing'] });
      queryClient.invalidateQueries({ queryKey: ['naitive-pipeline-data'] });
      queryClient.invalidateQueries({ queryKey: ['finserv-pipeline-data'] });
      const targetPipelineId = movingPipeline && viewPipeline ? viewPipeline.id : pipelineId;
      const label =
        getStageConfigForDeal(nextId, targetPipelineId)?.label || titleCase(nextId);
      if (movingPipeline && viewPipeline) {
        toast.success(`Moved to ${viewPipeline.name} · ${label}`);
      } else {
        toast.success(`Stage updated to ${label}`);
      }
    } catch (err: any) {
      console.error('[EditableDealStageTag] update failed', err);
      toast.error('Failed to update stage', { description: err?.message });
    } finally {
      setPending(false);
    }
  }, [current, dealId, updateDeal, pipelineId, viewPipeline, getStageConfigForDeal, queryClient]);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setViewPipelineId(pipelineId ?? null);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Edit deal stage (currently ${currentLabel ?? 'none'})`}
          aria-haspopup="menu"
          aria-expanded={open}
          disabled={pending || stageOptions.length === 0}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
            else e.stopPropagation();
          }}
          className={cn(
            'inline-flex items-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-opacity',
            pending && 'opacity-70 cursor-progress',
            className,
          )}
        >
          <Badge
            variant="outline"
            className="deal-stage-chip rounded-md text-[10px] font-semibold px-2 py-0 cursor-pointer border border-cyan-300/70 text-cyan-200 !bg-transparent transition-colors hover:border-cyan-200 hover:text-cyan-100"
          >
            {currentLabel ?? 'Set stage'}
          </Badge>
          {!hideChevron && (
            <span className="ml-0.5 inline-flex h-[18px] items-center text-muted-foreground/70">
              {pending
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : <ChevronDown className="h-3 w-3" />}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-64 p-1 max-h-[360px] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {pipelines.length > 1 && (
          <div className="px-2 pt-1.5 pb-1">
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
              <ArrowRightLeft className="h-3 w-3" />
              Pipeline
            </div>
            <select
              value={viewPipeline?.id ?? ''}
              onChange={(e) => setViewPipelineId(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              className="w-full h-7 rounded-md bg-background border border-border text-xs px-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {pipelines.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.id === pipelineId ? ' (current)' : ''}{p.isDefault ? ' • default' : ''}
                </option>
              ))}
            </select>
            {isCrossPipeline && (
              <div className="text-[10px] text-amber-300/80 mt-1 px-0.5">
                Selecting a stage will move this deal to {viewPipeline?.name}.
              </div>
            )}
            <div className="h-px bg-border/60 mt-1.5" />
          </div>
        )}
        <div role="menu" aria-label="Deal stage">
          {stageOptions.length === 0 ? (
            <div className="px-2 py-3 text-[11px] text-muted-foreground text-center">
              No stages configured
            </div>
          ) : (
            stageOptions.map((opt) => {
              const isActive = !isCrossPipeline && opt.id === current;
              return (
                <button
                  key={opt.id}
                  role="menuitemradio"
                  aria-checked={isActive}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleSelect(opt.id); }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  className={cn(
                    'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors text-left',
                    isActive ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60',
                  )}
                >
                  <span
                    className={cn(
                      'h-1.5 w-1.5 rounded-full shrink-0',
                      opt.color || 'bg-muted',
                    )}
                  />
                  <span className="flex-1 truncate">{opt.label}</span>
                  {isActive && <Check className="h-3 w-3 text-primary shrink-0" />}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default EditableDealStageTag;