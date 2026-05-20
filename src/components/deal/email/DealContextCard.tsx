import { useState, useEffect, useMemo } from 'react';
import { ChevronDown, ChevronRight, Clock, AlertTriangle, CheckCircle2, PauseCircle, Briefcase, Users, ListChecks, MessageSquare, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useDealContextSummary, type DealContextSummary } from '@/hooks/useDealContextSummary';
import { usePipelineStageConfig } from '@/hooks/usePipelineStageConfig';
import { STATUS_CONFIG } from '@/types/deal';
import { formatDistanceToNow } from 'date-fns';

interface Props {
  dealId?: string;
  dealName?: string;
  /** Bubble the loaded summary up so the parent can pass it to the AI draft generator. */
  onSummaryChange?: (s: DealContextSummary | null) => void;
  /**
   * Controls the initial expanded state. When omitted the card auto-expands
   * whenever a deal id is present (legacy behavior). The redesigned AI Assist
   * sidebar passes `false` so the rich detail stays tucked away by default —
   * the chip row above already conveys the deal at a glance.
   */
  defaultExpanded?: boolean;
}

const STATUS_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; tone: string }> = {
  'on-track': { label: 'On Track', icon: CheckCircle2, tone: 'text-green-500' },
  'at-risk': { label: 'At Risk', icon: AlertTriangle, tone: 'text-yellow-500' },
  'off-track': { label: 'Off Track', icon: AlertTriangle, tone: 'text-red-500' },
  'on-hold': { label: 'On Hold', icon: PauseCircle, tone: 'text-blue-400' },
  'archived': { label: 'Archived', icon: PauseCircle, tone: 'text-orange-400' },
};

/** Plain-language explanations of how each Deal Context field is computed. */
const FIELD_TOOLTIPS: Record<string, string> = {
  Stage:
    'Current pipeline stage for this deal. Days are counted from the most recent stage-change event in the deal activity log (or deal creation if none). "Today" means the stage changed within the last 24 hours.',
  Status:
    'Manual status set by the deal manager: On Track, At Risk, Off Track, On Hold, or Archived. Reflects the latest entry in the deal status notes and influences AI draft tone.',
  Lenders:
    'Active = lenders still being worked (any tracking substage other than Passed, Declined, Dropped, or Closed). Total = every lender ever added to this deal, regardless of outcome.',
  Outstanding:
    'Open outstanding items = items on the deal\'s checklist that are not marked Completed or Waived. The "Xd overdue" callout is the open item with the oldest due date relative to today.',
  'Last note':
    'The most recent entry in the deal\'s status notes feed (from the deal manager or analyst). Used for context — does not change the status itself.',
};

/**
 * DealContextCard
 * ---------------
 * Compact, collapsible "Deal Context" surfaced at the top of the AI Assist
 * sidebar. Auto-expands when a deal is detected so the user immediately sees
 * stage age, status, last status note, lender count, and the most overdue
 * outstanding item — the same signals the draft tone is informed by.
 */
export function DealContextCard({ dealId, dealName, onSummaryChange, defaultExpanded }: Props) {
  const { summary, loading } = useDealContextSummary(dealId);
  const { getStageConfigForDeal } = usePipelineStageConfig();

  // Auto-expand whenever we land on a new deal — unless the parent explicitly
  // requests collapsed-by-default (used by the redesigned AI Assist sidebar
  // where a chip row already summarizes the deal context).
  const initialExpanded = defaultExpanded ?? !!dealId;
  const [expanded, setExpanded] = useState<boolean>(initialExpanded);
  useEffect(() => {
    setExpanded(defaultExpanded ?? !!dealId);
  }, [dealId, defaultExpanded]);

  useEffect(() => {
    onSummaryChange?.(summary);
  }, [summary, onSummaryChange]);

  const stageLabel = useMemo(() => {
    if (!summary?.stage) return '—';
    return getStageConfigForDeal(summary.stage, summary.pipelineId).label;
  }, [summary, getStageConfigForDeal]);

  if (!dealId) return null;

  const statusKey = (summary?.status || 'on-track').toLowerCase();
  const statusMeta = STATUS_META[statusKey] || STATUS_META['on-track'];
  const StatusIcon = statusMeta.icon;
  const statusTone = STATUS_CONFIG[statusKey as keyof typeof STATUS_CONFIG];

  return (
    <TooltipProvider delayDuration={150}>
    <div className="rounded-md border border-white/[0.06] bg-background/40 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/30 transition-colors text-left"
        aria-expanded={expanded}
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )}
        <Briefcase className="h-3.5 w-3.5 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground/80 leading-tight">
            Deal Context
          </div>
          {!expanded && summary && (
            <div className="text-[10px] text-muted-foreground truncate mt-0.5">
              {stageLabel} · {summary.daysInStage ?? 0}d
            </div>
          )}
        </div>
        {summary && (
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full border border-white/[0.08] px-1.5 py-0.5 text-[10px]',
              statusMeta.tone,
            )}
          >
            <span className={cn('h-1.5 w-1.5 rounded-full', statusTone?.dotColor || 'bg-muted')} />
            {statusMeta.label}
          </span>
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-3 pt-1 space-y-2.5 border-t border-white/[0.04]">
          {loading && !summary ? (
            <div className="space-y-2 pt-2">
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          ) : summary ? (
            <>
              {/* Stage + days */}
              <Row icon={Clock} label="Stage">
                <span className="text-foreground/90">{stageLabel}</span>
                <span className="text-muted-foreground">
                  {' · '}
                  {summary.daysInStage === null
                    ? 'unknown'
                    : summary.daysInStage === 0
                    ? 'today'
                    : `${summary.daysInStage} day${summary.daysInStage === 1 ? '' : 's'}`}
                </span>
              </Row>

              {/* Status */}
              <Row icon={StatusIcon} label="Status">
                <span className={cn('font-medium', statusMeta.tone)}>{statusMeta.label}</span>
              </Row>

              {/* Lenders */}
              <Row icon={Users} label="Funding Sources">
                <span className="text-foreground/90 font-medium">
                  {summary.lenderCounts.active}
                </span>
                <span className="text-muted-foreground">
                  {' active of '}
                  {summary.lenderCounts.total} total
                </span>
              </Row>

              {/* Outstanding */}
              <Row icon={ListChecks} label="Outstanding">
                <span className="text-foreground/90 font-medium">
                  {summary.outstanding.openCount}
                </span>
                <span className="text-muted-foreground">{' open'}</span>
                {summary.outstanding.mostOverdue && (
                  <div className="mt-0.5 flex items-start gap-1 text-[10px] text-yellow-500/90">
                    <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                    <span className="break-words">
                      <span className="font-medium">
                        {summary.outstanding.mostOverdue.daysOverdue}d overdue:
                      </span>{' '}
                      <span className="text-foreground/80">
                        {summary.outstanding.mostOverdue.description}
                      </span>
                    </span>
                  </div>
                )}
              </Row>

              {/* Last status note */}
              {summary.lastStatusNote && (
                <Row icon={MessageSquare} label="Last note">
                  <div className="text-foreground/85 break-words">
                    {summary.lastStatusNote.note}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {summary.lastStatusNote.author || 'Unknown'} ·{' '}
                    {formatDistanceToNow(new Date(summary.lastStatusNote.createdAt), {
                      addSuffix: true,
                    })}
                  </div>
                </Row>
              )}
            </>
          ) : (
            <p className="text-[11px] text-muted-foreground italic py-1">
              No context available for this deal.
            </p>
          )}
        </div>
      )}
    </div>
    </TooltipProvider>
  );
}

function Row({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  const help = FIELD_TOOLTIPS[label];
  return (
    <div className="flex items-start gap-2 text-[11px] leading-snug">
      <Icon className="h-3 w-3 mt-0.5 text-muted-foreground/70 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 mb-0.5">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">
            {label}
          </span>
          {help && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={`How ${label} is computed`}
                  className="text-muted-foreground/40 hover:text-muted-foreground transition-colors focus:outline-none focus-visible:text-foreground"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Info className="h-2.5 w-2.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-[260px] text-[11px] leading-snug">
                {help}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        <div className="text-foreground/90">{children}</div>
      </div>
    </div>
  );
}