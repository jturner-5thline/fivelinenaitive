/**
 * DealContextRail
 * ---------------
 * Fixed left "context rail" used by the redesigned deal detail layout
 * (5th Line only, scoped in DealDetail via `useContextRailLayout`).
 *
 * Surfaces the identity + at-a-glance facts of a deal — company, deal
 * size, canonical status, pipeline stage, close date, last activity and
 * deal owner — so the main column can focus purely on content.
 *
 * Purely presentational: status/stage remain editable through the shared
 * Editable*Tag components so behaviour stays identical to every other
 * surface.
 */
import { formatDistanceToNow, format } from 'date-fns';
import { cn } from '@/lib/utils';
import { formatUSD } from '@/lib/formatters/currency';
import { EditableDealStatusTag } from './EditableDealStatusTag';
import { EditableDealStageTag } from './EditableDealStageTag';
import type { Deal } from '@/types/deal';

function initials(name?: string | null): string {
  if (!name) return '—';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

function RailLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
      {children}
    </span>
  );
}

export interface DealContextRailProps {
  deal: Deal;
  className?: string;
}

export function DealContextRail({ deal, className }: DealContextRailProps) {
  const closeDate = deal.dashboardClosingDate || deal.closingDate || null;
  const lastActivity = deal.notesUpdatedAt || deal.updatedAt || null;
  const owner = deal.dealOwner || deal.manager || '';

  return (
    <aside
      className={cn(
        'shrink-0 w-full lg:w-[260px] lg:sticky lg:top-4 self-start',
        'rounded-lg border border-border/60 bg-card/70 backdrop-blur-xl',
        'shadow-[0_8px_32px_hsl(0,0%,0%,0.35)] p-3 space-y-2.5',
        className,
      )}
      aria-label="Deal context"
    >
      <div className="space-y-1.5">
        <h2 className="text-xl font-bold leading-tight break-words text-foreground">
          {deal.company}
        </h2>
        <div className="text-xl font-bold leading-none bg-brand-gradient bg-clip-text text-transparent">
          {formatUSD(deal.value)}
        </div>
      </div>

      <div className="space-y-1.5">
        <EditableDealStatusTag dealId={deal.id} status={deal.status} />
        <EditableDealStageTag
          dealId={deal.id}
          stage={deal.stage}
          pipelineId={deal.pipelineId ?? null}
        />
      </div>

      <div className="space-y-0.5">
        <RailLabel>Close date</RailLabel>
        <div className="text-sm text-foreground">
          {closeDate ? format(new Date(closeDate), 'MMM d, yyyy') : 'Not set'}
        </div>
      </div>

      <div className="space-y-0.5">
        <RailLabel>Last activity</RailLabel>
        <div className="text-sm text-foreground">
          {lastActivity
            ? formatDistanceToNow(new Date(lastActivity), { addSuffix: true })
            : '—'}
        </div>
      </div>

      <div className="space-y-0.5">
        <RailLabel>Deal owner</RailLabel>
        <div className="flex items-center gap-2">
          <span className="h-6 w-6 rounded-full bg-primary/15 text-primary text-[11px] font-semibold flex items-center justify-center">
            {initials(owner)}
          </span>
          <span className="text-sm text-foreground truncate">{owner || 'Unassigned'}</span>
        </div>
      </div>
    </aside>
  );
}
