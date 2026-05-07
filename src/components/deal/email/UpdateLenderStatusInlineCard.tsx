import { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Building2, Plus } from 'lucide-react';
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
import { LENDER_TRACKING_STATUS_CONFIG, type DealLender } from '@/types/deal';
import { toast } from 'sonner';

interface Props {
  dealId?: string | null;
  preselectLenderName?: string | null;
  onClose: () => void;
}

const STATUS_ORDER = ['active', 'on-deck', 'on-hold', 'passed'] as const;

/**
 * Inline card to update a deal lender's tracking status + append a note.
 * Pre-selects the lender that the AI matched in the email when available.
 * Single Confirm button writes the change via the shared `updateLender`
 * action so the deal kanban / pipeline updates in real time.
 */
export function UpdateLenderStatusInlineCard({ dealId, preselectLenderName, onClose }: Props) {
  const { deals, updateLender, addLenderToDeal } = useDealsContext();
  const deal = useMemo(() => deals.find((d) => d.id === dealId), [deals, dealId]);
  const lenders: DealLender[] = deal?.lenders || [];

  const initialLenderId = useMemo(() => {
    if (!lenders.length) return '';
    if (preselectLenderName) {
      const norm = preselectLenderName.toLowerCase().trim();
      const exact = lenders.find((l) => (l.name || '').toLowerCase().trim() === norm);
      if (exact) return exact.id;
      const partial = lenders.find((l) => {
        const n = (l.name || '').toLowerCase();
        return n.includes(norm) || norm.includes(n);
      });
      if (partial) return partial.id;
    }
    return lenders[0].id;
  }, [lenders, preselectLenderName]);

  const [lenderId, setLenderId] = useState(initialLenderId);
  useEffect(() => {
    setLenderId(initialLenderId);
  }, [initialLenderId]);

  const lender = useMemo(() => lenders.find((l) => l.id === lenderId), [lenders, lenderId]);
  const [status, setStatus] = useState<string>(lender?.trackingStatus || 'active');
  useEffect(() => {
    if (lender?.trackingStatus) setStatus(lender.trackingStatus);
  }, [lender?.trackingStatus]);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [adding, setAdding] = useState(false);

  // True when the AI identified a lender name that isn't (yet) tracked on this deal.
  const proposedLenderName = (preselectLenderName || '').trim();
  const proposedAlreadyTracked = useMemo(() => {
    if (!proposedLenderName) return false;
    const norm = proposedLenderName.toLowerCase();
    return lenders.some((l) => {
      const n = (l.name || '').toLowerCase();
      return n === norm || n.includes(norm) || norm.includes(n);
    });
  }, [lenders, proposedLenderName]);

  if (!dealId || !deal) {
    return (
      <div className="rounded-md border border-white/[0.06] bg-card/40 p-3 text-[11px] text-muted-foreground">
        Link this email to a deal to update lender status.
      </div>
    );
  }

  // If the AI surfaced a specific lender that isn't on the deal yet, offer to add them.
  // (Same prompt covers the "no lenders at all" case when a name was identified.)
  if (proposedLenderName && !proposedAlreadyTracked) {
    const handleAdd = async () => {
      setAdding(true);
      try {
        await addLenderToDeal(dealId, {
          name: proposedLenderName,
          trackingStatus: 'active',
        });
        toast.success(`${proposedLenderName} added to ${deal.company}`);
        // Card will re-render with the lender now tracked; user can pick a status next.
      } catch (err: any) {
        console.error('[UpdateLenderStatus] add failed', err);
        toast.error(err?.message || 'Failed to add lender');
      } finally {
        setAdding(false);
      }
    };
    return (
      <div className="rounded-md border border-white/[0.08] bg-card/60 p-3 space-y-2.5">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          <Building2 className="h-3 w-3 text-emerald-400" /> Update Lender Status
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
            Add Lender
          </Button>
        </div>
      </div>
    );
  }

  if (lenders.length === 0) {
    return (
      <div className="rounded-md border border-white/[0.06] bg-card/40 p-3 text-[11px] text-muted-foreground">
        No lenders are tracked on <span className="text-foreground">{deal.company}</span> yet.
      </div>
    );
  }

  const handleConfirm = async () => {
    if (!lender) return;
    setSaving(true);
    try {
      const trimmedNote = note.trim();
      const updates: Partial<DealLender> = { trackingStatus: status };
      if (trimmedNote) {
        const stamp = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const prev = (lender.notes || '').trim();
        updates.notes = prev
          ? `${prev}\n\n[${stamp}] ${trimmedNote}`
          : `[${stamp}] ${trimmedNote}`;
      }
      await updateLender(lender.id, updates);
      setDone(true);
      toast.success(`${lender.name} → ${LENDER_TRACKING_STATUS_CONFIG[status]?.label || status}`);
      setTimeout(onClose, 900);
    } catch (err: any) {
      console.error('[UpdateLenderStatus] failed', err);
      toast.error(err?.message || 'Failed to update lender');
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
        <Building2 className="h-3 w-3 text-emerald-400" /> Update Lender Status
      </div>

      <div className="space-y-1">
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground/80">Lender</label>
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
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground/80">Status</label>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-8 text-[12px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_ORDER.map((s) => (
              <SelectItem key={s} value={s} className="text-[12px]">
                {LENDER_TRACKING_STATUS_CONFIG[s]?.label || s}
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