import { useState } from 'react';
import { Check, X, Briefcase, Loader2, Link2, Type } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  usePendingDealResolutionsStore,
  type PendingDealResolution,
} from '@/stores/pendingDealResolutionsStore';
import { usePendingDealSuggestions } from '@/hooks/usePendingDealSuggestions';

interface Props {
  resolution: PendingDealResolution;
}

const INTENT_LABEL: Record<string, string> = {
  contact_email_from_draft: 'Capture contact email',
  qa_from_thread: 'Save Q&A responses',
};

/**
 * Picker card shown when the system detected a suggestion-worthy event but
 * subject + domain matched 2+ deals. The user picks the right deal and the
 * actual `pending_deal_suggestions` row is created against it.
 */
export function DealPickerCard({ resolution }: Props) {
  const { user } = useAuth();
  const remove = usePendingDealResolutionsStore((s) => s.remove);
  const [pickingId, setPickingId] = useState<string | null>(null);

  // We instantiate a writer scoped to the chosen deal at click-time via a
  // direct insert (to avoid mounting N hooks). Reuse the dedup_key contract.
  const handlePick = async (dealId: string, dealName: string) => {
    if (!user) {
      toast.error('Sign in required');
      return;
    }
    setPickingId(dealId);
    try {
      // Resolve company_id for RLS
      const { data: dealRow, error: dealErr } = await supabase
        .from('deals')
        .select('company_id')
        .eq('id', dealId)
        .maybeSingle();
      if (dealErr || !dealRow?.company_id) {
        throw new Error('Could not load deal');
      }

      const { error } = await (supabase as any)
        .from('pending_deal_suggestions')
        .insert({
          deal_id: dealId,
          company_id: dealRow.company_id,
          user_id: user.id,
          suggestion_type: resolution.intent.kind,
          status: 'pending',
          payload: resolution.intent.payload,
          source_thread_id: resolution.threadId,
          source_thread_subject: resolution.threadSubject,
          dedup_key: resolution.dedupKey,
        });
      // 23505 = unique violation on dedup_key (already queued) — treat as success.
      if (error && (error as any).code !== '23505') throw error;

      remove(resolution.id);
      toast.success(`Suggestion sent to ${dealName}`);
    } catch (err: any) {
      console.error('[deal-picker] insert failed', err);
      toast.error('Could not save suggestion', { description: err?.message });
    } finally {
      setPickingId(null);
    }
  };

  const handleDismiss = () => {
    remove(resolution.id);
    toast.info('Suggestion dismissed');
  };

  const intentLabel = INTENT_LABEL[resolution.intent.kind] || 'Update';

  return (
    <div className="rounded-md border border-amber-500/20 bg-amber-500/[0.04] p-2.5 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-foreground/90 leading-tight">
            Pick a deal
          </p>
          <p className="text-[10px] text-muted-foreground/80 leading-snug mt-0.5">
            {intentLabel} — {resolution.candidates.length} possible matches.
            <span className="text-muted-foreground/60"> {resolution.reason}</span>
          </p>
        </div>
        <button
          onClick={handleDismiss}
          className="text-muted-foreground/60 hover:text-foreground transition-colors p-0.5 -m-0.5 shrink-0"
          aria-label="Dismiss"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      <div className="space-y-1">
        {resolution.candidates.map((c) => {
          const isPicking = pickingId === c.dealId;
          return (
            <button
              key={c.dealId}
              type="button"
              disabled={!!pickingId}
              onClick={() => handlePick(c.dealId, c.dealName)}
              className={cn(
                'w-full flex items-center gap-2 rounded border border-white/[0.05] bg-background/40 px-2 py-1.5 text-left transition-colors',
                'hover:border-primary/30 hover:bg-primary/[0.04]',
                pickingId && !isPicking && 'opacity-40',
              )}
            >
              <Briefcase className="h-3 w-3 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-[11px] font-medium truncate block">
                  {c.dealName}
                </span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {c.stage && (
                    <span className="text-[9px] text-muted-foreground/70 truncate">
                      {c.stage}
                    </span>
                  )}
                  {c.domainMatch && (
                    <span className="inline-flex items-center gap-0.5 text-[9px] text-emerald-400/90 bg-emerald-500/10 rounded px-1 py-px">
                      <Link2 className="h-2 w-2" /> domain
                    </span>
                  )}
                  {c.nameMatch && (
                    <span className="inline-flex items-center gap-0.5 text-[9px] text-sky-400/90 bg-sky-500/10 rounded px-1 py-px">
                      <Type className="h-2 w-2" /> name
                    </span>
                  )}
                </div>
              </div>
              {isPicking ? (
                <Loader2 className="h-3 w-3 animate-spin text-primary shrink-0" />
              ) : (
                <Check className="h-3 w-3 text-muted-foreground/40 shrink-0" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}