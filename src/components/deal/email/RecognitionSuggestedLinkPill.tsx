/**
 * RecognitionSuggestedLinkPill
 * ----------------------------
 * Surfaces a one-click "Confirm link" pill in the AI Assist sidebar when
 * the classifier's most recent decision for the open thread was
 * `suggested` (top candidate scored above the `LIKELY` threshold but
 * below the auto-link threshold). The user can confirm the suggestion
 * with a single click, or dismiss it permanently for that thread.
 *
 * Reads `recognition_log` directly (RLS scoped to the user's company).
 * Persists dismissal in localStorage keyed by (thread_id, deal_id).
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Link2, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const DISMISS_PREFIX = 'naitive.recognitionSuggested.dismissed.';

interface Candidate {
  deal_id?: string;
  dealId?: string;
  score?: number;
  name?: string;
}

interface Props {
  threadId: string | null | undefined;
  onLinkDeal: (dealId: string, dealName: string) => void | Promise<void>;
}

export function RecognitionSuggestedLinkPill({ threadId, onLinkDeal }: Props) {
  const [loading, setLoading] = useState(false);
  const [linking, setLinking] = useState(false);
  const [dealId, setDealId] = useState<string | null>(null);
  const [dealName, setDealName] = useState<string>('');
  const [confidence, setConfidence] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setDealId(null); setDealName(''); setConfidence(null); setDismissed(false);
    if (!threadId) return;
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from('recognition_log')
        .select('candidates, chosen_deal_id, confidence, outcome')
        .eq('thread_id', threadId)
        .eq('outcome', 'suggested')
        .order('created_at', { ascending: false })
        .limit(1);
      if (cancelled) return;
      const row = (data ?? [])[0];
      if (!row) { setLoading(false); return; }
      const cands = (row.candidates as unknown as Candidate[] | null) ?? [];
      const top =
        (row.chosen_deal_id && cands.find((c) => (c.deal_id ?? c.dealId) === row.chosen_deal_id)) ||
        cands[0];
      const did = (top?.deal_id ?? top?.dealId ?? row.chosen_deal_id) || null;
      if (!did) { setLoading(false); return; }
      try {
        if (localStorage.getItem(DISMISS_PREFIX + `${threadId}.${did}`) === '1') {
          setDismissed(true);
        }
      } catch { /* ignore */ }
      const { data: d } = await supabase
        .from('deals')
        .select('id, company')
        .eq('id', did)
        .maybeSingle();
      if (cancelled) return;
      setDealId(did);
      setDealName(d?.company || top?.name || 'Suggested deal');
      setConfidence(typeof row.confidence === 'number' ? row.confidence : null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [threadId]);

  if (!threadId || dismissed || (!loading && !dealId)) return null;
  if (loading) return null;

  const confPct = confidence != null ? Math.round(confidence * 100) : null;

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_PREFIX + `${threadId}.${dealId}`, '1'); } catch { /* ignore */ }
    setDismissed(true);
  };

  const confirm = async () => {
    if (!dealId) return;
    setLinking(true);
    try {
      await onLinkDeal(dealId, dealName);
    } finally {
      setLinking(false);
    }
  };

  return (
    <div className={cn(
      'rounded-md border border-amber-400/30 bg-amber-400/[0.08] px-2.5 py-2 text-[11.5px] flex items-start gap-2',
    )}>
      <Link2 className="h-3.5 w-3.5 text-amber-300 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-foreground/85">
          AI suggests linking this thread to{' '}
          <span className="font-medium text-foreground">{dealName}</span>
          {confPct != null && (
            <span className="ml-1 text-muted-foreground">· {confPct}% confidence</span>
          )}
        </div>
        <div className="mt-1.5 flex items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[10.5px] bg-amber-400/15 hover:bg-amber-400/25 text-amber-100"
            onClick={confirm}
            disabled={linking}
          >
            {linking ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Link2 className="h-3 w-3 mr-1" />}
            Confirm link
          </Button>
        </div>
      </div>
      <button
        type="button"
        onClick={dismiss}
        className="text-muted-foreground hover:text-foreground"
        aria-label="Dismiss suggestion"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}