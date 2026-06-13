import { useMemo, useState } from 'react';
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  Inbox,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import type {
  AdminAgentDealAudit,
  AdminAgentItemFinding,
  AdminAgentReviewStatus,
} from '@/lib/adminAgent/types';

/**
 * Reusable chat presentation primitives for Admin Agent · Duty 1.
 *
 * Tone is intentionally advisory, not enforcement. No red error
 * treatments, no blame language. Pure presentational components — the
 * chat surface wires onSendMessage / onShowMore so quick actions
 * compose with the existing free-text composer.
 */

const STATUS_LABEL: Record<AdminAgentReviewStatus, string> = {
  fresh: 'current',
  may_need_review: 'may need review',
  no_post_creation_update_recorded: 'no post-creation update recorded',
};

const STATUS_TONE: Record<AdminAgentReviewStatus, string> = {
  fresh: 'bg-muted/40 text-muted-foreground border-border/60',
  may_need_review: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  no_post_creation_update_recorded: 'bg-sky-500/10 text-sky-300 border-sky-500/30',
};

function relativeAge(item: AdminAgentItemFinding): string {
  if (!item.last_updated_at) return STATUS_LABEL.no_post_creation_update_recorded;
  const bd = item.business_days_since_last_update;
  if (bd == null) return '—';
  if (bd === 0) return 'updated today';
  if (bd === 1) return '1 business day ago';
  return `${bd} business days ago`;
}

// ── Summary block ─────────────────────────────────────────────────
export interface AdminAgentAuditSummaryProps {
  totalEvaluated: number;
  totalFlagged: number;
  totalNeverUpdated: number;
  totalStaleOnly: number;
  staleThresholdBusinessDays: number;
  fridaySweep?: boolean;
}

export function AdminAgentAuditSummary(props: AdminAgentAuditSummaryProps) {
  const {
    totalEvaluated,
    totalFlagged,
    totalNeverUpdated,
    totalStaleOnly,
    staleThresholdBusinessDays,
    fridaySweep,
  } = props;

  const allClean = totalFlagged === 0;

  return (
    <Card className="border-border/60 bg-card/40 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/40">
          <ShieldCheck className="h-4 w-4 text-foreground/80" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-sm font-semibold leading-tight">Admin Agent · Verify Deal Information</h4>
            {fridaySweep && (
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px] uppercase tracking-wide">
                Friday sweep
              </Badge>
            )}
          </div>
          <p className="text-sm text-foreground/90 mt-1 leading-relaxed">
            {allClean ? (
              <>All <span className="font-medium">{totalEvaluated}</span> active deal{totalEvaluated === 1 ? '' : 's'} in scope {totalEvaluated === 1 ? 'is' : 'are'} current — nothing needs review.</>
            ) : (
              <>
                <span className="font-medium">{totalFlagged}</span> of <span className="font-medium">{totalEvaluated}</span> active deals may need review — <span className="font-medium">{totalNeverUpdated}</span> have items with no post-creation update recorded; <span className="font-medium">{totalStaleOnly}</span> have items not updated in &gt;{staleThresholdBusinessDays} business days.
              </>
            )}
          </p>
        </div>
      </div>
    </Card>
  );
}

// ── Lender row ────────────────────────────────────────────────────
export function AdminAgentLenderRow({ item }: { item: AdminAgentItemFinding }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 px-2 rounded hover:bg-muted/20">
      <div className="min-w-0">
        <p className="text-sm truncate">{item.label}</p>
        {item.detail && (
          <p className="text-[11px] text-muted-foreground truncate">{item.detail}</p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Badge
          variant="outline"
          className={cn('h-5 px-1.5 text-[10px] uppercase tracking-wide', STATUS_TONE[item.review_status])}
        >
          {STATUS_LABEL[item.review_status]}
        </Badge>
        <span className="text-[11px] text-muted-foreground tabular-nums whitespace-nowrap">
          <Clock className="h-3 w-3 inline mr-1 -mt-0.5" />
          {relativeAge(item)}
        </span>
      </div>
    </div>
  );
}

// ── Detailed deal block ───────────────────────────────────────────
export interface AdminAgentDealFindingProps {
  audit: AdminAgentDealAudit;
  defaultExpanded?: boolean;
  onAction?: (intent: AdminAgentDealAction) => void;
  /** Compact mode hides the "ignore" affordance and per-deal header chrome. */
  compact?: boolean;
}

export type AdminAgentDealAction =
  | { type: 'update_all'; dealId: string; dealName: string }
  | { type: 'update_selected'; dealId: string; dealName: string; fields: string[] }
  | { type: 'ignore'; dealId: string; dealName: string };

export function AdminAgentDealFinding({
  audit,
  defaultExpanded = true,
  onAction,
  compact,
}: AdminAgentDealFindingProps) {
  const [open, setOpen] = useState(defaultExpanded);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { fieldItems, lenderItems } = useMemo(() => {
    const flagged = audit.items.filter((i) => i.review_status !== 'fresh');
    return {
      fieldItems: flagged.filter((i) => !i.field.startsWith('funding_source:')),
      lenderItems: flagged.filter((i) => i.field.startsWith('funding_source:')),
    };
  }, [audit.items]);

  const allClean = audit.flagged_count === 0;

  const toggleSelected = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <Card className="border-border/60 bg-card/40 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/20 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          {open ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          )}
          <span className="text-sm font-semibold truncate">{audit.deal_name}</span>
          <span className="text-[11px] text-muted-foreground truncate">
            {audit.stage ?? '—'} · {audit.status ?? '—'}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {allClean ? (
            <Badge variant="outline" className="h-5 px-1.5 text-[10px] uppercase tracking-wide bg-muted/40 text-muted-foreground border-border/60">
              all current
            </Badge>
          ) : (
            <Badge variant="outline" className="h-5 px-1.5 text-[10px] uppercase tracking-wide bg-amber-500/10 text-amber-300 border-amber-500/30">
              {audit.flagged_count} may need review
            </Badge>
          )}
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          {allClean ? (
            <p className="text-sm text-muted-foreground">All critical items on this deal are current.</p>
          ) : (
            <>
              {fieldItems.length > 0 && (
                <div className="space-y-1">
                  {fieldItems.map((item) => (
                    <label
                      key={item.field}
                      className="flex items-center justify-between gap-3 px-2 py-1.5 rounded hover:bg-muted/20 cursor-pointer"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <input
                          type="checkbox"
                          checked={selected.has(item.field)}
                          onChange={() => toggleSelected(item.field)}
                          className="h-3.5 w-3.5 rounded border-border/60 bg-transparent accent-primary"
                          aria-label={`Select ${item.label}`}
                        />
                        <div className="min-w-0">
                          <p className="text-sm truncate">{item.label}</p>
                          {item.detail && (
                            <p className="text-[11px] text-muted-foreground truncate">{item.detail}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge
                          variant="outline"
                          className={cn('h-5 px-1.5 text-[10px] uppercase tracking-wide', STATUS_TONE[item.review_status])}
                        >
                          {STATUS_LABEL[item.review_status]}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground tabular-nums whitespace-nowrap">
                          <Clock className="h-3 w-3 inline mr-1 -mt-0.5" />
                          {relativeAge(item)}
                        </span>
                      </div>
                    </label>
                  ))}
                </div>
              )}

              {lenderItems.length > 0 && (
                <div className="rounded-md border border-border/60 bg-muted/10 p-2">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground px-2 pb-1">
                    Funding sources
                  </p>
                  <Separator className="mb-1" />
                  <div className="space-y-0.5">
                    {lenderItems.map((l) => (
                      <AdminAgentLenderRow key={l.field} item={l} />
                    ))}
                  </div>
                </div>
              )}

              {!compact && (
                <AdminAgentReviewActionsBar
                  dealName={audit.deal_name}
                  hasSelection={selected.size > 0}
                  onUpdateAll={() => onAction?.({ type: 'update_all', dealId: audit.deal_id, dealName: audit.deal_name })}
                  onUpdateSelected={() =>
                    onAction?.({
                      type: 'update_selected',
                      dealId: audit.deal_id,
                      dealName: audit.deal_name,
                      fields: Array.from(selected),
                    })
                  }
                  onIgnore={() => onAction?.({ type: 'ignore', dealId: audit.deal_id, dealName: audit.deal_name })}
                />
              )}
            </>
          )}
        </div>
      )}
    </Card>
  );
}

// ── Per-deal review actions bar ───────────────────────────────────
export function AdminAgentReviewActionsBar({
  dealName,
  hasSelection,
  onUpdateAll,
  onUpdateSelected,
  onIgnore,
}: {
  dealName: string;
  hasSelection: boolean;
  onUpdateAll?: () => void;
  onUpdateSelected?: () => void;
  onIgnore?: () => void;
}) {
  return (
    <div className="pt-1">
      <p className="text-sm text-foreground/90">
        What would you like to do on <span className="font-medium">{dealName}</span> — update, follow up, or leave each item unchanged?
      </p>
      <p className="text-[11px] text-muted-foreground mt-1">
        Reply naturally (e.g. "update stage and notes", "leave funding sources alone") or use a quick action.
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onUpdateAll}>
          Update all on {dealName}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          disabled={!hasSelection}
          onClick={onUpdateSelected}
        >
          Update selected
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onIgnore}>
          Ignore for now
        </Button>
      </div>
    </div>
  );
}

// ── Show more control ─────────────────────────────────────────────
export function AdminAgentShowMore({
  remaining,
  onShowMore,
}: {
  remaining?: number;
  onShowMore?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-dashed border-border/60 bg-muted/10 px-3 py-2">
      <p className="text-xs text-muted-foreground">
        {remaining != null ? `${remaining} more deal(s) flagged.` : 'More flagged deals available.'}
      </p>
      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onShowMore}>
        <Sparkles className="h-3.5 w-3.5 mr-1" />
        Show more
      </Button>
    </div>
  );
}

// ── Follow-up question (single-deal) ──────────────────────────────
export function AdminAgentFollowUpQuestion({
  prompt = 'Which items should we update or follow up on?',
  onUpdateAll,
  onIgnore,
}: {
  prompt?: string;
  onUpdateAll?: () => void;
  onIgnore?: () => void;
}) {
  return (
    <div className="rounded-md border border-border/60 bg-card/40 p-3">
      <p className="text-sm text-foreground/90">{prompt}</p>
      <p className="text-[11px] text-muted-foreground mt-1">
        You can type a reply or pick a quick action below.
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onUpdateAll}>
          Update all
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onIgnore}>
          Ignore for now
        </Button>
      </div>
    </div>
  );
}

// ── Empty / clean state ───────────────────────────────────────────
export function AdminAgentAllClean({ totalEvaluated }: { totalEvaluated: number }) {
  return (
    <Card className="border-border/60 bg-card/40 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/40">
          <Inbox className="h-4 w-4 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium">Nothing to review.</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            All {totalEvaluated} active deal{totalEvaluated === 1 ? '' : 's'} in scope are current.
          </p>
        </div>
      </div>
    </Card>
  );
}

// ── Portfolio container — convenience wrapper ─────────────────────
export interface AdminAgentPortfolioReviewProps {
  summary: AdminAgentAuditSummaryProps;
  deals: AdminAgentDealAudit[];
  showMoreAvailable?: boolean;
  remaining?: number;
  onShowMore?: () => void;
  onDealAction?: (intent: AdminAgentDealAction) => void;
}

export function AdminAgentPortfolioReview({
  summary,
  deals,
  showMoreAvailable,
  remaining,
  onShowMore,
  onDealAction,
}: AdminAgentPortfolioReviewProps) {
  if (summary.totalFlagged === 0) {
    return <AdminAgentAllClean totalEvaluated={summary.totalEvaluated} />;
  }
  return (
    <div className="space-y-3">
      <AdminAgentAuditSummary {...summary} />
      <div className="space-y-2">
        {deals.slice(0, 3).map((d, i) => (
          <AdminAgentDealFinding
            key={d.deal_id}
            audit={d}
            defaultExpanded={i === 0}
            onAction={onDealAction}
          />
        ))}
      </div>
      {showMoreAvailable && <AdminAgentShowMore remaining={remaining} onShowMore={onShowMore} />}
    </div>
  );
}

// ── Single deal container ────────────────────────────────────────
export function AdminAgentSingleDealReview({
  audit,
  onDealAction,
}: {
  audit: AdminAgentDealAudit;
  onDealAction?: (intent: AdminAgentDealAction) => void;
}) {
  if (audit.flagged_count === 0) {
    return (
      <Card className="border-border/60 bg-card/40 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md border border-border/60 bg-muted/40">
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium">{audit.deal_name} is current.</p>
            <p className="text-xs text-muted-foreground mt-0.5">All critical items are up to date.</p>
          </div>
        </div>
      </Card>
    );
  }
  return (
    <div className="space-y-3">
      <AdminAgentDealFinding audit={audit} defaultExpanded onAction={onDealAction} />
    </div>
  );
}