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
import { ChevronDown, Check, Loader2 } from 'lucide-react';
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

  const current = (stage || '') as string;
  const currentLabel = current
    ? getStageConfigForDeal(current, pipelineId)?.label || titleCase(current)
    : null;

  // Resolve the list of stages the user can pick from. Prefer the deal's
  // own pipeline; fall back to the default pipeline, then any pipeline.
  const stageOptions = useMemo(() => {
    const byId = pipelineId ? pipelines.find((p) => p.id === pipelineId) : null;
    const fallback =
      byId ||
      pipelines.find((p) => p.isDefault) ||
      pipelines[0] ||
      null;
    return fallback?.stages ?? [];
  }, [pipelines, pipelineId]);

  const handleSelect = useCallback(async (nextId: string) => {
    setOpen(false);
    if (!nextId || nextId === current) return;
    setPending(true);
    try {
      await updateDeal(dealId, { stage: nextId as any });
      // Same cross-surface invalidation as EditableDealStatusTag so the
      // rundown / briefing / pipeline boards re-pull immediately.
      queryClient.invalidateQueries({ queryKey: ['briefing-pipeline'] });
      queryClient.invalidateQueries({ queryKey: ['briefing-catchup'] });
      queryClient.invalidateQueries({ queryKey: ['briefing'] });
      queryClient.invalidateQueries({ queryKey: ['naitive-pipeline-data'] });
      queryClient.invalidateQueries({ queryKey: ['finserv-pipeline-data'] });
      const label =
        getStageConfigForDeal(nextId, pipelineId)?.label || titleCase(nextId);
      toast.success(`Stage updated to ${label}`);
    } catch (err: any) {
      console.error('[EditableDealStageTag] update failed', err);
      toast.error('Failed to update stage', { description: err?.message });
    } finally {
      setPending(false);
    }
  }, [current, dealId, updateDeal, pipelineId, getStageConfigForDeal, queryClient]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
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
            className="rounded-full text-[10px] px-1.5 py-0 border-white/15 text-white/80 cursor-pointer hover:bg-white/10"
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
        className="w-56 p-1 max-h-[320px] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div role="menu" aria-label="Deal stage">
          {stageOptions.length === 0 ? (
            <div className="px-2 py-3 text-[11px] text-muted-foreground text-center">
              No stages configured
            </div>
          ) : (
            stageOptions.map((opt) => {
              const isActive = opt.id === current;
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