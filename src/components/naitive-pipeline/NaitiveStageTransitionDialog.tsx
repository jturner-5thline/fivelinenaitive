import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { CalendarIcon, Loader2, AlertCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  ON_HOLD_TAG_OPTIONS,
  CLOSED_LOST_REASON_OPTIONS,
  type SystemStageType,
} from '@/config/naitivePipelineConfig';
import { logNaitivePipelineAudit } from '@/lib/naitivePipelineAudit';

export interface PendingTransition {
  dealId: string;
  dealName: string;
  fromStageId: string;
  fromStageLabel: string;
  toStageId: string;
  toStageLabel: string;
  canonicalType: SystemStageType;
}

interface Props {
  transition: PendingTransition | null;
  onCancel: () => void;
  /** Called after fields are persisted and the stage update should proceed. */
  onConfirmed: () => Promise<void> | void;
}

/**
 * Blocks transitions to On Hold / Closed Lost / Dormant until the spec-required
 * structured fields are captured. Persists the metadata into
 * `naitive_deal_stage_meta` and writes an audit row, then yields control back
 * to the caller to apply the actual stage change.
 */
export function NaitiveStageTransitionDialog({ transition, onCancel, onConfirmed }: Props) {
  const [holdTag, setHoldTag] = useState<string>('');
  const [holdReason, setHoldReason] = useState('');
  const [revisitDate, setRevisitDate] = useState<Date | undefined>(undefined);
  const [closedLostReason, setClosedLostReason] = useState<string>('');
  const [closedLostOther, setClosedLostOther] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Reset state whenever a new transition is opened.
  useEffect(() => {
    setHoldTag('');
    setHoldReason('');
    setRevisitDate(undefined);
    setClosedLostReason('');
    setClosedLostOther('');
    setNotes('');
    setSaving(false);
  }, [transition?.dealId, transition?.toStageId]);

  const isOpen = !!transition;
  const canonical = transition?.canonicalType;

  const isValid = useMemo(() => {
    if (!canonical) return false;
    if (canonical === 'on-hold') {
      return !!holdTag && !!revisitDate;
    }
    if (canonical === 'closed-lost') {
      if (!closedLostReason) return false;
      if (closedLostReason === 'Other' && !closedLostOther.trim()) return false;
      // Spec: "Use Dormant first for unresponsive leads."
      if (closedLostReason === 'No response to re-engagement') {
        // allowed only when coming from Dormant
        return /dormant/i.test(transition?.fromStageLabel || '');
      }
      return true;
    }
    if (canonical === 'dormant') {
      // No hard-required fields, but encourage a note.
      return true;
    }
    return true;
  }, [canonical, holdTag, revisitDate, closedLostReason, closedLostOther, transition?.fromStageLabel]);

  const handleConfirm = async () => {
    if (!transition || !isValid) return;
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const actor = userData?.user?.id ?? null;

      const payload: Record<string, unknown> = {
        deal_id: transition.dealId,
        transition_notes: notes.trim() || null,
        updated_by: actor,
      };
      if (canonical === 'on-hold') {
        payload.hold_tag = holdTag;
        payload.hold_reason = holdReason.trim() || null;
        payload.revisit_date = revisitDate
          ? format(revisitDate, 'yyyy-MM-dd')
          : null;
      }
      if (canonical === 'closed-lost') {
        payload.closed_lost_reason =
          closedLostReason === 'Other'
            ? `Other: ${closedLostOther.trim()}`
            : closedLostReason;
      }
      if (canonical === 'dormant') {
        payload.dormant_started_at = new Date().toISOString();
      }

      const { error } = await (supabase as any)
        .from('naitive_deal_stage_meta')
        .upsert(payload, { onConflict: 'deal_id' });
      if (error) throw error;

      await logNaitivePipelineAudit({
        entityType: 'deal_transition',
        entityId: transition.dealId,
        action: 'stage_changed',
        field: 'stage',
        oldValue: { id: transition.fromStageId, label: transition.fromStageLabel },
        newValue: { id: transition.toStageId, label: transition.toStageLabel },
        context: {
          canonical_type: canonical,
          hold_tag: payload.hold_tag ?? null,
          revisit_date: payload.revisit_date ?? null,
          closed_lost_reason: payload.closed_lost_reason ?? null,
          notes: payload.transition_notes ?? null,
        },
      });

      await onConfirmed();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to save stage transition fields', err);
      toast.error('Failed to save transition details');
    } finally {
      setSaving(false);
    }
  };

  const title = canonical === 'on-hold'
    ? 'Move to On Hold'
    : canonical === 'closed-lost'
      ? 'Move to Closed Lost'
      : canonical === 'dormant'
        ? 'Move to Dormant'
        : 'Confirm stage change';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !saving) onCancel(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-500" />
            {title}
          </DialogTitle>
          <DialogDescription>
            {transition && (
              <>
                <span className="font-medium text-foreground">{transition.dealName}</span>
                <span className="text-muted-foreground"> · {transition.fromStageLabel} → {transition.toStageLabel}</span>
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {canonical === 'on-hold' && (
            <>
              <div className="space-y-2">
                <Label>Hold tag <span className="text-destructive">*</span></Label>
                <Select value={holdTag} onValueChange={setHoldTag}>
                  <SelectTrigger><SelectValue placeholder="Select a tag…" /></SelectTrigger>
                  <SelectContent>
                    {ON_HOLD_TAG_OPTIONS.map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Revisit date <span className="text-destructive">*</span></Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        'w-full justify-start text-left font-normal',
                        !revisitDate && 'text-muted-foreground',
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {revisitDate ? format(revisitDate, 'PPP') : 'Pick a date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={revisitDate}
                      onSelect={setRevisitDate}
                      disabled={(d) => d < new Date(new Date().setHours(0,0,0,0))}
                      initialFocus
                      className={cn('p-3 pointer-events-auto')}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>Reason <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Textarea rows={2} value={holdReason} onChange={(e) => setHoldReason(e.target.value)} placeholder="Why is this deal on hold?" />
              </div>
            </>
          )}

          {canonical === 'closed-lost' && (
            <>
              <div className="space-y-2">
                <Label>Disqualification reason <span className="text-destructive">*</span></Label>
                <Select value={closedLostReason} onValueChange={setClosedLostReason}>
                  <SelectTrigger><SelectValue placeholder="Select a reason…" /></SelectTrigger>
                  <SelectContent>
                    {CLOSED_LOST_REASON_OPTIONS.map(r => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {closedLostReason === 'No response to re-engagement' &&
                  !/dormant/i.test(transition?.fromStageLabel || '') && (
                  <p className="text-xs text-destructive">
                    Use the Dormant stage first for unresponsive leads.
                  </p>
                )}
              </div>
              {closedLostReason === 'Other' && (
                <div className="space-y-2">
                  <Label>Describe <span className="text-destructive">*</span></Label>
                  <Textarea rows={2} value={closedLostOther} onChange={(e) => setClosedLostOther(e.target.value)} />
                </div>
              )}
            </>
          )}

          {canonical === 'dormant' && (
            <p className="text-sm text-muted-foreground">
              Moving to Dormant triggers a 3-email re-engagement cadence (Day 0 / 5 / 12 business days). After the cadence completes without a reply, the deal auto-moves to Closed Lost.
            </p>
          )}

          <div className="space-y-2">
            <Label>Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add context for the team…" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={!isValid || saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirm move
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}