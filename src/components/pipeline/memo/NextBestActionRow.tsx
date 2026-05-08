import { useState } from 'react';
import { Zap } from 'lucide-react';
import type { Deal } from '@/types/deal';
import type { DealTaskItem } from '@/hooks/usePipelineDealTasks';
import type { PipelineDigestRaw } from '@/hooks/usePipelineDigests';
import { computeDealNextBestAction } from '@/lib/dealNextBestAction';
import { AddFollowupInlineForm } from './AddFollowupInlineForm';

interface Props {
  deal: Deal;
  tasks: DealTaskItem[] | undefined;
  rawDigest?: PipelineDigestRaw;
}

/**
 * NextBestActionRow
 * -----------------
 * Compact "⚡ Next best action: <copy> — Create Task" row rendered below
 * the Tasks & Milestones band on each Deal Rundown card. Pure heuristics
 * (no extra fetch). Hides itself when no clear action applies.
 */
export function NextBestActionRow({ deal, tasks, rawDigest }: Props) {
  const action = computeDealNextBestAction(deal, tasks, rawDigest);
  const [formOpen, setFormOpen] = useState(false);

  if (!action) return null;

  return (
    <div className="px-5 py-2 border-b border-border bg-amber-500/[0.04]">
      <div className="flex items-center gap-2 text-[11px]">
        <Zap className="h-3 w-3 text-amber-400 shrink-0" />
        <span className="text-muted-foreground">
          <span className="font-semibold text-foreground/90">Next best action:</span>{' '}
          {action.copy}
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setFormOpen(true);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          className="text-[11px] font-medium text-primary hover:underline whitespace-nowrap"
        >
          Create Task
        </button>
      </div>
      {formOpen && (
        <AddFollowupInlineForm
          deal={deal}
          defaultTitle={action.taskTitle}
          onClose={() => setFormOpen(false)}
        />
      )}
    </div>
  );
}