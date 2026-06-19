import { useEffect, useMemo, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
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
import { useDealStages } from '@/contexts/DealStagesContext';
import { STATUS_CONFIG, type DealStatus } from '@/types/deal';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Props {
  dealId?: string | null;
  onClose: () => void;
}

/**
 * Inline card to update a deal's pipeline **stage** and/or health **status**
 * and append a status note. Written directly to the `deals` row + a
 * `deal_status_notes` entry when a note is provided.
 */
export function UpdateDealStatusInlineCard({ dealId, onClose }: Props) {
  const { deals, updateDeal } = useDealsContext();
  const { stages } = useDealStages();
  const deal = useMemo(() => deals.find((d) => d.id === dealId), [deals, dealId]);

  const [stage, setStage] = useState<string>(deal?.stage || stages[0]?.id || '');
  const [status, setStatus] = useState<DealStatus | ''>((deal?.status as DealStatus) || '');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (deal?.stage) setStage(deal.stage);
    if (deal?.status) setStatus(deal.status as DealStatus);
  }, [deal?.stage, deal?.status]);

  if (!dealId || !deal) {
    return (
      <div className="rounded-xl border border-border bg-card p-3">
        <p className="text-xs text-muted-foreground">Link a deal first to update its status or stage.</p>
      </div>
    );
  }

  const dirty = stage !== deal.stage || status !== (deal.status || '');

  const handleSave = async () => {
    if (!dirty && !note.trim()) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      const updates: any = {};
      if (stage !== deal.stage) updates.stage = stage;
      if (status !== (deal.status || '')) updates.status = status || null;
      if (Object.keys(updates).length > 0) {
        await updateDeal(dealId, updates);
      }
      if (note.trim()) {
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from('deal_status_notes').insert({
          deal_id: dealId,
          note: note.trim(),
          created_by: user?.id || null,
        } as any);
      }
      toast.success('Deal updated');
      onClose();
    } catch (err: any) {
      console.error('[UpdateDealStatusInlineCard] save failed', err);
      toast.error(err?.message || 'Failed to update deal');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-3 space-y-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Update {deal.company}
      </div>

      <div className="space-y-1.5">
        <label className="text-[11px] text-muted-foreground">Stage</label>
        <Select value={stage} onValueChange={setStage}>
          <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select stage" /></SelectTrigger>
          <SelectContent>
            {stages.map((s) => (
              <SelectItem key={s.id} value={s.id} className="text-sm">{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <label className="text-[11px] text-muted-foreground">Status</label>
        <Select value={status || 'none'} onValueChange={(v) => setStatus(v === 'none' ? '' : (v as DealStatus))}>
          <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="No status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none" className="text-sm">No status</SelectItem>
            {(Object.keys(STATUS_CONFIG) as DealStatus[]).map((k) => (
              <SelectItem key={k} value={k} className="text-sm">{STATUS_CONFIG[k].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <label className="text-[11px] text-muted-foreground">Status note (optional)</label>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What changed?"
          className="text-sm min-h-[60px]"
        />
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button size="sm" onClick={handleSave} disabled={saving || (!dirty && !note.trim())} className="gap-1.5">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Save
        </Button>
      </div>
    </div>
  );
}