import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Loader2, Building2, Plus, Sparkles, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDealsContext } from '@/contexts/DealsContext';
import { type Deal, type DealLender } from '@/types/deal';
import { useLenderStages } from '@/contexts/LenderStagesContext';
import { isActiveDeal } from '@/lib/deals';
import { findActiveSameCompanyDeal } from '@/lib/effectiveDealSelection';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * Normalize a lender/funding-source name for fuzzy comparison.
 * - lowercase, strip non-alphanumerics, collapse whitespace
 * - drop common org suffixes (capital, partners, llc, inc, group, fund, etc.)
 * so "Structural Capital" and "Structural Capital Partners LLC" compare equal.
 */
function normalizeLenderName(raw: string): string {
  const SUFFIXES = new Set([
    'capital', 'partners', 'partner', 'fund', 'funds', 'funding',
    'group', 'holdings', 'llc', 'lp', 'inc', 'corp', 'co', 'company',
    'bank', 'finance', 'financial', 'credit', 'ventures', 'venture',
    'management', 'advisors', 'advisers', 'investments', 'investment',
    'the',
  ]);
  const tokens = (raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => !SUFFIXES.has(t));
  return tokens.join(' ').trim();
}

function lenderNamesMatch(a: string, b: string): boolean {
  const na = normalizeLenderName(a);
  const nb = normalizeLenderName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  // token-subset match: every token of the shorter side appears in the other
  const ta = na.split(' ');
  const tb = nb.split(' ');
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  return short.every((t) => long.includes(t));
}

const getErrorMessage = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : fallback;

interface Props {
  dealId?: string | null;
  preselectLenderName?: string | null;
  /**
   * Latest messages of the lender thread (oldest → newest). When present the
   * card asks the AI to pull the lender's own words — why they passed, where
   * they stand, what they're waiting on — into the note + suggested stage.
   */
  emailContext?: {
    subject?: string | null;
    messages: Array<{ from?: string | null; at?: string | null; text?: string | null }>;
  } | null;
  onClose: () => void;
}

/**
 * Inline card to update a deal lender's pipeline **stage** + append a note.
 * Pre-selects the funding source that the AI matched in the email when available.
 * Single Confirm button writes the change via the shared `updateLender`
 * action so the deal kanban / pipeline updates in real time.
 */
export function UpdateLenderStatusInlineCard({ dealId, preselectLenderName, emailContext, onClose }: Props) {
  const { deals, updateLender, addLenderToDeal } = useDealsContext();
  const { stages: stageOptions, substages: milestoneOptions } = useLenderStages();
  const initialDeal = useMemo(() => deals.find((d) => d.id === dealId), [deals, dealId]);

  // Duplicate-deal guard: if the company has multiple deal rows (e.g. two "Worthy"
  // entries) and the AI-identified funding source is actually tracked on a
  // *sibling* deal with the same company name, switch to that sibling so we
  // don't falsely prompt the user to add a lender that already exists.
  const effectiveDeal = useMemo(() => {
    if (!initialDeal) return undefined;
    const proposed = (preselectLenderName || '').trim();
    const sameCompanyDeals = deals.filter(
      (d) => (d.company || '').trim().toLowerCase() === (initialDeal.company || '').trim().toLowerCase(),
    );
    const activeSibling = sameCompanyDeals.find(
      (d) => d.id !== initialDeal.id && isActiveDeal(d),
    );
    if (!proposed) return findActiveSameCompanyDeal(deals, initialDeal);

    const hasProposedLender = (d: Deal) =>
      (d.lenders || []).some((l) => lenderNamesMatch(l.name || '', proposed));
    const onInitial = hasProposedLender(initialDeal);
    if (onInitial && isActiveDeal(initialDeal)) return initialDeal;

    const siblingWithLender = sameCompanyDeals.find(
      (d) => d.id !== initialDeal.id && isActiveDeal(d) && hasProposedLender(d),
    ) || sameCompanyDeals.find(
      (d) => d.id !== initialDeal.id && hasProposedLender(d),
    );
    return siblingWithLender || (isActiveDeal(initialDeal) ? initialDeal : (activeSibling || initialDeal));
  }, [deals, initialDeal, preselectLenderName]);

  const deal = effectiveDeal;
  const lenders: DealLender[] = useMemo(() => deal?.lenders || [], [deal?.lenders]);

  const initialLenderId = useMemo(() => {
    if (!lenders.length) return '';
    if (preselectLenderName) {
      const norm = normalizeLenderName(preselectLenderName);
      const exact = lenders.find((l) => normalizeLenderName(l.name || '') === norm);
      if (exact) return exact.id;
      const partial = lenders.find((l) => lenderNamesMatch(l.name || '', preselectLenderName));
      if (partial) return partial.id;
    }
    return lenders[0].id;
  }, [lenders, preselectLenderName]);

  const [lenderId, setLenderId] = useState(initialLenderId);
  useEffect(() => {
    setLenderId(initialLenderId);
  }, [initialLenderId]);

  const lender = useMemo(() => lenders.find((l) => l.id === lenderId), [lenders, lenderId]);
  const defaultStageId = stageOptions[0]?.id || 'on-deck';
  const [stage, setStage] = useState<string>(lender?.stage || defaultStageId);
  useEffect(() => {
    if (lender?.stage) setStage(lender.stage);
  }, [lender?.stage]);
  const NO_MILESTONE = '__none__';
  const [milestone, setMilestone] = useState<string>(lender?.substage || NO_MILESTONE);
  useEffect(() => {
    setMilestone(lender?.substage || NO_MILESTONE);
  }, [lender?.substage]);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [adding, setAdding] = useState(false);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextNote, setContextNote] = useState<string | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);
  const [stageTouched, setStageTouched] = useState(false);
  // The last AI-generated note we wrote into the textarea — lets us replace it
  // on regenerate without clobbering anything the user typed themselves.
  const aiNoteRef = useRef<string>('');
  const requestedRef = useRef<string | null>(null);

  const emailMessages = emailContext?.messages;
  const hasEmailContext = !!emailMessages?.some((m) => (m?.text || '').trim());

  const pullEmailContext = useCallback(async (force = false) => {
    if (!hasEmailContext || !lender) return;
    const key = `${lender.id}::${emailContext?.subject || ''}::${emailMessages?.length ?? 0}`;
    if (!force && requestedRef.current === key) return;
    requestedRef.current = key;
    setContextLoading(true);
    setContextError(null);
    try {
      const { data, error } = await supabase.functions.invoke('extract-lender-email-context', {
        body: {
          subject: emailContext?.subject || '',
          lenderName: lender.name || preselectLenderName || '',
          dealName: deal?.company || '',
          currentStageLabel: stageOptions.find((s) => s.id === (lender.stage || stage))?.label || '',
          stageOptions: stageOptions.map((s) => ({ id: s.id, label: s.label })),
          messages: (emailMessages || []).slice(-6).map((m) => ({
            from: m?.from || '',
            at: m?.at || '',
            text: m?.text || '',
          })),
        },
      });
      if (error) throw error;
      const aiNote = typeof data?.note === 'string' ? data.note.trim() : '';
      if (aiNote) {
        setContextNote(aiNote);
        // Only auto-fill when the field is empty or still holds our last draft.
        setNote((cur) => (!cur.trim() || cur === aiNoteRef.current ? aiNote : cur));
        aiNoteRef.current = aiNote;
      } else {
        setContextNote(null);
      }
      if (data?.stageId && !stageTouched) {
        setStage(String(data.stageId));
      }
    } catch (err: unknown) {
      console.warn('[UpdateLenderStatus] email context failed', err);
      setContextError(getErrorMessage(err, 'Could not read context from this email'));
    } finally {
      setContextLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasEmailContext, lender, emailContext?.subject, emailMessages, preselectLenderName, deal?.company, stageOptions, stage, stageTouched]);

  useEffect(() => {
    void pullEmailContext(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lender?.id, hasEmailContext]);

  // True when the AI identified a funding source name that isn't (yet) tracked on this deal.
  const proposedLenderName = (preselectLenderName || '').trim();
  const proposedAlreadyTracked = useMemo(() => {
    if (!proposedLenderName) return false;
    return lenders.some((l) => lenderNamesMatch(l.name || '', proposedLenderName));
  }, [lenders, proposedLenderName]);

  if (!dealId || !deal) {
    return (
      <div className="rounded-md border border-white/[0.06] bg-card/40 p-3 text-[11px] text-muted-foreground">
        Link this email to a deal to update lender stage.
      </div>
    );
  }

  // If the AI surfaced a specific lender that isn't on the deal yet, offer to add them.
  // (Same prompt covers the "no funding sources at all" case when a name was identified.)
  if (proposedLenderName && !proposedAlreadyTracked) {
    const handleAdd = async () => {
      setAdding(true);
      try {
        await addLenderToDeal(deal.id, {
          name: proposedLenderName,
          trackingStatus: 'active',
        });
        toast.success(`${proposedLenderName} added to ${deal.company}`);
        // Card will re-render with the funding source now tracked; user can pick a status next.
      } catch (err: unknown) {
        console.error('[UpdateLenderStatus] add failed', err);
        toast.error(getErrorMessage(err, 'Failed to add lender'));
      } finally {
        setAdding(false);
      }
    };
    return (
      <div className="rounded-md border border-white/[0.08] bg-card/60 p-3 space-y-2.5">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          <Building2 className="h-3 w-3 text-emerald-400" /> Update Lender Stage
        </div>
        <p className="text-[12px] text-foreground/85">
          <span className="font-medium">{proposedLenderName}</span> is not yet tracked on{' '}
          <span className="font-medium">{deal.company}</span>. Add them?
        </p>
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={onClose} disabled={adding}>
            Cancel
          </Button>
          <Button size="sm" className="h-7 text-[11px] gap-1" onClick={handleAdd} disabled={adding}>
            {adding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
            Add Funding Source
          </Button>
        </div>
      </div>
    );
  }

  if (lenders.length === 0) {
    return (
      <div className="rounded-md border border-white/[0.06] bg-card/40 p-3 text-[11px] text-muted-foreground">
        No funding sources are tracked on <span className="text-foreground">{deal.company}</span> yet.
      </div>
    );
  }

  const handleConfirm = async () => {
    if (!lender) return;
    setSaving(true);
    // Hard 20s timeout so a hung updateLender() can't leave the Confirm
    // button spinning forever (Niki bug, Asana #1215178140447221).
    const timeoutId = setTimeout(() => {
      setSaving(false);
      toast.error("Couldn't update lender status — retry?");
    }, 20_000);
    try {
      const trimmedNote = note.trim();
      const selectedStage = stageOptions.find((s) => s.id === stage);
      const updates: Partial<DealLender> = {
        stage: stage as DealLender['stage'],
        // Keep tracking status group aligned with the selected stage so
        // kanban/grouping stays consistent.
        ...(selectedStage?.group
          ? { trackingStatus: selectedStage.group as DealLender['trackingStatus'] }
          : {}),
      };
      // Only write substage when the user changed it relative to current value,
      // so leaving the milestone untouched doesn't wipe an existing one.
      const nextMilestone = milestone === NO_MILESTONE ? null : milestone;
      if ((lender.substage || null) !== nextMilestone) {
        updates.substage = nextMilestone as DealLender['substage'];
      }
      if (trimmedNote) {
        const stamp = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const prev = (lender.notes || '').trim();
        updates.notes = prev
          ? `${prev}\n\n[${stamp}] ${trimmedNote}`
          : `[${stamp}] ${trimmedNote}`;
      }
      await updateLender(lender.id, updates);
      clearTimeout(timeoutId);
      setDone(true);
      const milestoneLabel = milestoneOptions.find((m) => m.id === milestone)?.label;
      const summary = milestoneLabel && milestone !== NO_MILESTONE
        ? `${lender.name} → ${selectedStage?.label || stage} · ${milestoneLabel}`
        : `${lender.name} → ${selectedStage?.label || stage}`;
      toast.success(summary);
      setTimeout(onClose, 900);
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      console.error('[UpdateLenderStage] failed', err);
      toast.error(getErrorMessage(err, 'Failed to update lender'));
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    return (
      <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-[12px] text-emerald-300 flex items-center gap-2">
        <Check className="h-3.5 w-3.5" />
        Lender updated.
      </div>
    );
  }

  return (
    <div className="rounded-md border border-white/[0.08] bg-card/60 p-3 space-y-2.5">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        <Building2 className="h-3 w-3 text-emerald-400" /> Update Lender Stage
      </div>

      <div className="space-y-1">
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground/80">Funding Source</label>
        <Select value={lenderId} onValueChange={setLenderId}>
          <SelectTrigger className="h-8 text-[12px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {lenders.map((l) => (
              <SelectItem key={l.id} value={l.id} className="text-[12px]">
                {l.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground/80">Stage</label>
        <Select value={stage} onValueChange={setStage}>
          <SelectTrigger className="h-8 text-[12px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {stageOptions.map((s) => (
              <SelectItem key={s.id} value={s.id} className="text-[12px]">
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground/80">
          Milestone <span className="text-muted-foreground/50 normal-case">(optional)</span>
        </label>
        <Select value={milestone} onValueChange={setMilestone}>
          <SelectTrigger className="h-8 text-[12px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_MILESTONE} className="text-[12px] text-muted-foreground">
              — None —
            </SelectItem>
            {milestoneOptions.map((m) => (
              <SelectItem key={m.id} value={m.id} className="text-[12px]">
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground/80">
          Note <span className="text-muted-foreground/50 normal-case">(optional)</span>
        </label>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add context — e.g. passed on credit, awaiting term sheet…"
          className="min-h-[56px] text-[12px] resize-y"
        />
      </div>

      <div className="flex items-center justify-end gap-2 pt-0.5">
        <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button size="sm" className="h-7 text-[11px] gap-1" onClick={handleConfirm} disabled={saving || !lender}>
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          Confirm
        </Button>
      </div>
    </div>
  );
}