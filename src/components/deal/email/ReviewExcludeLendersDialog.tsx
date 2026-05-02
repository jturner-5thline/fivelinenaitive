import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Loader2, Mail, AlertCircle, Sparkles, AlertTriangle, ShieldCheck, X, MinusCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import {
  useLenderPreflightChecks,
  type LenderPreflightWarningKind,
} from '@/hooks/useLenderPreflightChecks';

/** Distilled status used for the review screen. */
export type LenderReviewStatus = 'passed' | 'in-review' | 'no-response';

export interface LenderReviewRow {
  id: string;
  name: string;
  status: LenderReviewStatus;
  /** Raw db tracking_status, kept for log payload + filtering. */
  trackingStatus: string | null;
  substage: string | null;
  passReason: string | null;
  lastContactAt: string | null;
  /** True by default for `passed`; user can flip. */
  excluded: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealId: string;
  dealName?: string | null;
  /**
   * Called with the names of lenders to INCLUDE in the upcoming submission
   * plus whether to personalize each draft to the lender's profile.
   */
  onConfirm: (includedLenderNames: string[], personalize: boolean) => void;
}

const STATUS_META: Record<LenderReviewStatus, { label: string; className: string }> = {
  'passed':       { label: 'Passed',      className: 'bg-destructive/15 text-destructive border-destructive/25' },
  'in-review':    { label: 'In Review',   className: 'bg-amber-500/15 text-amber-600 border-amber-500/25 dark:text-amber-400' },
  'no-response':  { label: 'No Response', className: 'bg-muted text-muted-foreground border-border' },
};

function distillStatus(row: { tracking_status: string | null; substage: string | null; last_contact_at: string | null }): LenderReviewStatus {
  const ts = (row.tracking_status || '').toLowerCase();
  const sub = (row.substage || '').toLowerCase();
  if (ts === 'passed' || sub === 'passed') return 'passed';
  if (sub.includes('review') || ts === 'active' || ts === 'on-deck') return 'in-review';
  // Anything that's been contacted but has no review activity = no response
  return 'no-response';
}

/**
 * Pre-submission review step. Loads every lender on the deal, lets the user
 * exclude any of them (auto-excluding "passed"), shows a live skip summary,
 * and writes a `lender_resubmission_review` entry to the deal's activity log
 * before handing control back to the email-draft flow.
 */
export function ReviewExcludeLendersDialog({ open, onOpenChange, dealId, dealName, onConfirm }: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<LenderReviewRow[]>([]);
  const [confirming, setConfirming] = useState(false);
  // Default ON — per-lender personalization is the higher-quality choice
  // and matches how senior bankers actually pitch deals.
  const [personalize, setPersonalize] = useState(true);

  /**
   * Per-lender warning dismissals for this dialog session, keyed by
   * `${lenderNameLower}::${warningKind}`. Cleared each time the dialog
   * reopens so risk signals are always re-shown to a fresh reviewer.
   */
  const [dismissedWarnings, setDismissedWarnings] = useState<Set<string>>(new Set());
  const [preflightOpen, setPreflightOpen] = useState(true);

  useEffect(() => {
    if (!open) {
      setDismissedWarnings(new Set());
      setPreflightOpen(true);
    }
  }, [open]);

  // Load lenders fresh every time the dialog opens so status is current.
  useEffect(() => {
    if (!open || !dealId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('deal_lenders')
          .select('id, name, tracking_status, substage, pass_reason, last_contact_at')
          .eq('deal_id', dealId)
          .order('name', { ascending: true });
        if (error) throw error;
        if (cancelled) return;
        const distilled: LenderReviewRow[] = (data || []).map((r: any) => {
          const status = distillStatus(r);
          return {
            id: r.id,
            name: r.name,
            status,
            trackingStatus: r.tracking_status ?? null,
            substage: r.substage ?? null,
            passReason: r.pass_reason ?? null,
            lastContactAt: r.last_contact_at ?? null,
            // Auto-exclude passed lenders by default.
            excluded: status === 'passed',
          };
        });
        setRows(distilled);
      } catch (err: any) {
        toast({
          title: 'Could not load lenders',
          description: err?.message || 'Please try again.',
          variant: 'destructive',
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, dealId]);

  const summary = useMemo(() => {
    const included = rows.filter((r) => !r.excluded);
    const excluded = rows.filter((r) => r.excluded);
    const passedSkipped = excluded.filter((r) => r.status === 'passed').length;
    const inReviewSkipped = excluded.filter((r) => r.status === 'in-review').length;
    const otherSkipped = excluded.length - passedSkipped - inReviewSkipped;
    return {
      includedCount: included.length,
      excludedCount: excluded.length,
      passedSkipped,
      inReviewSkipped,
      otherSkipped,
    };
  }, [rows]);

  // ── Pre-flight risk checks against currently INCLUDED lenders ───────────
  const includedNames = useMemo(
    () => rows.filter((r) => !r.excluded).map((r) => r.name),
    [rows]
  );
  const preflight = useLenderPreflightChecks({
    dealId,
    lenderNames: includedNames,
    enabled: open && !loading,
  });

  /** Active warnings = those raised by the hook minus per-session dismissals. */
  const activeWarnings = useMemo(() => {
    return preflight.flat
      .map((entry) => ({
        ...entry,
        warnings: entry.warnings.filter(
          (w) => !dismissedWarnings.has(`${entry.lenderName.toLowerCase()}::${w.kind}`)
        ),
      }))
      .filter((entry) => entry.warnings.length > 0);
  }, [preflight.flat, dismissedWarnings]);

  const dismissWarning = (lenderName: string, kind: LenderPreflightWarningKind) => {
    setDismissedWarnings((prev) => {
      const next = new Set(prev);
      next.add(`${lenderName.toLowerCase()}::${kind}`);
      return next;
    });
  };

  const removeLenderFromSubmission = (lenderName: string) => {
    const target = lenderName.trim().toLowerCase();
    setRows((prev) =>
      prev.map((r) =>
        r.name.trim().toLowerCase() === target ? { ...r, excluded: true } : r
      )
    );
  };

  const toggleExcluded = (id: string, value: boolean) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, excluded: value } : r)));
  };

  const handleConfirm = async () => {
    if (summary.includedCount === 0) {
      toast({
        title: 'No lenders selected',
        description: 'Include at least one lender before continuing.',
        variant: 'destructive',
      });
      return;
    }
    setConfirming(true);
    try {
      // ── Audit: log who reviewed what for this resubmission round.
      const includedRows = rows.filter((r) => !r.excluded);
      const excludedRows = rows.filter((r) => r.excluded);
      const description =
        `Lender resubmission reviewed${dealName ? ` for ${dealName}` : ''} — ` +
        `submitting to ${includedRows.length}, skipping ${excludedRows.length}` +
        (excludedRows.length
          ? ` (${summary.passedSkipped} passed, ${summary.inReviewSkipped} already in review` +
            (summary.otherSkipped ? `, ${summary.otherSkipped} other` : '') +
            ')'
          : '');

      const metadata = {
        included: includedRows.map((r) => ({ id: r.id, name: r.name, status: r.status })),
        excluded: excludedRows.map((r) => ({
          id: r.id,
          name: r.name,
          status: r.status,
          // "why" the user skipped them, derived from current status
          reason:
            r.status === 'passed'
              ? `passed${r.passReason ? `: ${r.passReason}` : ''}`
              : r.status === 'in-review'
                ? 'already in review'
                : 'manually excluded',
        })),
        counts: {
          included: summary.includedCount,
          excluded: summary.excludedCount,
          passed_skipped: summary.passedSkipped,
          in_review_skipped: summary.inReviewSkipped,
        },
        personalize,
      };

      // Non-blocking: if the activity log fails we still proceed with the send.
      const { error: logErr } = await supabase.from('activity_logs').insert({
        deal_id: dealId,
        activity_type: 'lender_resubmission_review',
        description,
        metadata,
        user_id: user?.id ?? null,
      } as any);
      if (logErr) {
        console.warn('[ReviewExcludeLenders] activity log failed:', logErr);
      }

      onConfirm(includedRows.map((r) => r.name), personalize);
      onOpenChange(false);
    } catch (err: any) {
      toast({
        title: 'Could not record review',
        description: err?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setConfirming(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[88vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" />
            Review &amp; Exclude Lenders
          </DialogTitle>
          <DialogDescription>
            Confirm who to include in this round. Lenders who already passed are pre-excluded —
            re-include them if you want to follow up.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading lenders…
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
            <AlertCircle className="h-5 w-5" />
            <span className="text-sm">No lenders are attached to this deal yet.</span>
          </div>
        ) : (
          <ScrollArea className="flex-1 -mx-6 px-6">
            <ul className="divide-y divide-border/60">
              {rows.map((r) => {
                const meta = STATUS_META[r.status];
                return (
                  <li
                    key={r.id}
                    className={cn(
                      'flex items-center gap-3 py-2.5',
                      r.excluded && 'opacity-60',
                    )}
                  >
                    <Checkbox
                      checked={r.excluded}
                      onCheckedChange={(v) => toggleExcluded(r.id, v === true)}
                      aria-label={`Exclude ${r.name}`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className={cn('text-sm font-medium truncate', r.excluded && 'line-through')}>
                        {r.name}
                      </div>
                      {r.passReason && r.status === 'passed' && (
                        <div className="text-[11px] text-muted-foreground truncate">
                          {r.passReason}
                        </div>
                      )}
                    </div>
                    <Badge variant="outline" className={cn('text-[10px] font-medium', meta.className)}>
                      {meta.label}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground w-16 text-right shrink-0">
                      {r.excluded ? 'Skipping' : 'Included'}
                    </span>
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        )}

        <div className="rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-xs text-foreground/90">
          {rows.length === 0 ? (
            <span className="text-muted-foreground">Nothing to submit.</span>
          ) : (
            <>
              <span className="font-medium">Submitting to {summary.includedCount} lender{summary.includedCount === 1 ? '' : 's'}</span>
              {summary.excludedCount > 0 && (
                <>
                  {', skipping '}
                  <span className="font-medium">{summary.excludedCount}</span>
                  {' ('}
                  {summary.passedSkipped} passed
                  {', '}
                  {summary.inReviewSkipped} already in review
                  {summary.otherSkipped > 0 && `, ${summary.otherSkipped} other`}
                  {')'}
                </>
              )}
              .
            </>
          )}
        </div>

        {/* ── Pre-flight risk checks ─────────────────────────────────────
            Surfaces lender-level warnings (pass history, size mismatch,
            geography mismatch) before the user proceeds to drafts. Soft
            warnings only — the user can dismiss any item or remove the
            flagged lender from the round, but is never blocked. */}
        {summary.includedCount > 0 && (preflight.loading || activeWarnings.length > 0) && (
          <div
            className={cn(
              'rounded-md border px-3 py-2',
              activeWarnings.length > 0
                ? 'border-amber-500/30 bg-amber-500/5'
                : 'border-border/60 bg-muted/30'
            )}
          >
            <button
              type="button"
              onClick={() => setPreflightOpen((v) => !v)}
              className="flex w-full items-center gap-2 text-left"
              aria-expanded={preflightOpen}
            >
              {activeWarnings.length > 0 ? (
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
              ) : (
                <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <span className="text-xs font-medium flex-1">
                Pre-flight checks
                {preflight.loading && (
                  <span className="ml-2 text-[10px] font-normal text-muted-foreground inline-flex items-center gap-1">
                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                    Scanning lender history…
                  </span>
                )}
                {!preflight.loading && activeWarnings.length > 0 && (
                  <Badge
                    variant="outline"
                    className="ml-2 text-[10px] py-0 h-4 border-amber-500/40 text-amber-600 dark:text-amber-400"
                  >
                    {activeWarnings.reduce((sum, e) => sum + e.warnings.length, 0)} warning
                    {activeWarnings.reduce((sum, e) => sum + e.warnings.length, 0) === 1 ? '' : 's'}
                  </Badge>
                )}
              </span>
              {!preflight.loading && activeWarnings.length > 0 && (
                preflightOpen ? (
                  <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                )
              )}
            </button>

            {preflightOpen && activeWarnings.length > 0 && (
              <ul className="mt-2 space-y-2">
                {activeWarnings.map((entry) => (
                  <li
                    key={`pf-${entry.lenderName.toLowerCase()}`}
                    className="rounded border border-amber-500/20 bg-background/60 px-2.5 py-2"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[11px] font-semibold truncate">{entry.lenderName}</span>
                      <button
                        type="button"
                        onClick={() => removeLenderFromSubmission(entry.lenderName)}
                        className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-destructive transition-colors"
                        aria-label={`Remove ${entry.lenderName} from this submission`}
                      >
                        <MinusCircle className="h-3 w-3" />
                        Remove from submission
                      </button>
                    </div>
                    <ul className="space-y-1">
                      {entry.warnings.map((w) => (
                        <li
                          key={`pf-${entry.lenderName.toLowerCase()}-${w.kind}`}
                          className="flex items-start gap-2 text-[11px] text-foreground/90"
                        >
                          <span className="mt-0.5">⚠️</span>
                          <span className="flex-1 leading-snug">
                            {w.message}
                            <span className="text-muted-foreground"> Proceed anyway?</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => dismissWarning(entry.lenderName, w.kind)}
                            className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                            aria-label="Dismiss warning"
                            title="Dismiss warning"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}

            {!preflight.loading && activeWarnings.length === 0 && (
              <p className="mt-1 text-[11px] text-muted-foreground pl-5">
                No risk patterns detected for the selected lenders.
              </p>
            )}
          </div>
        )}

        {/* Personalize per lender — when ON, the AI tailors each draft to
            the lender's stated focus areas (deal types, size, industry).
            When OFF, one standard draft is generated and broadcast. */}
        <div className="flex items-start gap-3 rounded-md border border-primary/20 bg-primary/[0.04] px-3 py-2">
          <Sparkles className="h-3.5 w-3.5 mt-0.5 text-primary flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <label
              htmlFor="personalize-toggle"
              className="text-xs font-medium cursor-pointer flex items-center gap-2"
            >
              Personalize per lender
              {personalize && (
                <Badge variant="outline" className="text-[9px] py-0 h-4 border-primary/40 text-primary">
                  AI tailoring
                </Badge>
              )}
            </label>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
              {personalize
                ? 'Each lender gets a unique draft that references their focus areas, deal-size range, and prior interaction on this deal.'
                : 'One standard draft will be sent to every selected lender.'}
            </p>
          </div>
          <Switch
            id="personalize-toggle"
            checked={personalize}
            onCheckedChange={setPersonalize}
            aria-label="Personalize each draft per lender"
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={confirming}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={loading || confirming || summary.includedCount === 0}
          >
            {confirming ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                Recording…
              </>
            ) : (
              <>Continue to drafts</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}