import { useState } from 'react';
import { Phone, Mail, Loader2, ClipboardList } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useDealsContext } from '@/contexts/DealsContext';
import { cn } from '@/lib/utils';

type ActivityKind = 'call_meeting' | 'email_follow_up';

interface Props {
  dealId: string;
  dealLenderId: string;
  lenderName: string;
  currentNotes?: string;
  onLogged?: () => void;
  className?: string;
}

/**
 * Small popover on funding source tiles for quick activity logging.
 * - Choose Call/Meeting or Email Follow Up.
 * - Optional note: if provided, prepends `[type] note` to the funding source's
 *   status notes (which rotates the previous note into lender_notes_history).
 *   If left blank, notes are left untouched.
 * - Always stamps deal_lenders.last_contact_at and writes a deal_activity row.
 */
export function LogLenderActivityPopover({
  dealId,
  dealLenderId,
  lenderName,
  currentNotes,
  onLogged,
  className,
}: Props) {
  const { updateLender } = useDealsContext();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ActivityKind>('call_meeting');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setKind('call_meeting');
    setNote('');
  };

  const handleOpenChange = (o: boolean) => {
    setOpen(o);
    if (!o) reset();
  };

  const kindLabel = kind === 'call_meeting' ? 'Call/Meeting' : 'Email Follow Up';

  const handleSubmit = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (saving) return;
    setSaving(true);
    try {
      const trimmed = note.trim();
      const nowIso = new Date().toISOString();

      // 1. Stamp last_contact_at on the funding source
      await supabase
        .from('deal_lenders')
        .update({ last_contact_at: nowIso, updated_at: nowIso })
        .eq('id', dealLenderId);

      // 2. If a note was provided, update status notes (history rotates via updateLender)
      if (trimmed) {
        const dateStamp = new Date().toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        });
        const prefix = `[${dateStamp} · ${kindLabel}] `;
        const newNotes = `${prefix}${trimmed}`;
        await updateLender(dealLenderId, { notes: newNotes });
      }

      // 3. Log to deal activity timeline
      const { data: u } = await supabase.auth.getUser();
      await supabase.from('deal_activity').insert({
        deal_id: dealId,
        user_id: u.user?.id,
        source: 'manual',
        action_type: 'lender_activity_logged',
        before: {},
        after: {
          deal_lender_id: dealLenderId,
          lender_name: lenderName,
          activity_kind: kind,
          activity_label: kindLabel,
          note: trimmed || null,
          logged_at: nowIso,
        },
      } as never);

      toast({
        title: 'Activity logged',
        description: `${kindLabel} recorded for ${lenderName}${trimmed ? ' · notes updated' : ''}.`,
      });
      handleOpenChange(false);
      onLogged?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to log activity';
      toast({ title: 'Log failed', description: msg, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          title="Log activity"
          aria-label="Log activity"
          className={cn(
            className ||
              'relative overflow-hidden inline-flex items-center justify-center h-8 w-8 rounded-md border border-[hsl(160,60%,45%,0.5)] bg-[hsl(160,40%,10%,0.35)] text-[hsl(160,60%,72%)] backdrop-blur-xl shadow-[inset_0_1px_1px_hsl(160,80%,75%,0.15),0_2px_12px_hsl(160,60%,30%,0.2)] hover:border-[hsl(160,60%,55%,0.7)] hover:bg-[hsl(160,40%,14%,0.45)] hover:shadow-[inset_0_1px_1px_hsl(160,80%,80%,0.25),0_4px_20px_hsl(160,60%,35%,0.3)] before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:bg-[linear-gradient(135deg,hsl(160,80%,80%,0.12)_0%,transparent_50%,hsl(160,60%,45%,0.06)_100%)] transition-all',
          )}
        >
          <ClipboardList className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-[320px] p-3"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="mb-2">
          <div className="text-xs font-semibold">Log activity · {lenderName}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            Note is optional — leave blank to keep status notes unchanged.
          </div>
        </div>

        <div className="space-y-2">
          <div>
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Activity type
            </Label>
            <div className="mt-1 grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setKind('call_meeting')}
                className={cn(
                  'flex items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-xs transition-colors',
                  kind === 'call_meeting'
                    ? 'border-primary/50 bg-primary/15 text-foreground'
                    : 'border-white/10 bg-transparent text-muted-foreground hover:bg-white/[0.04]',
                )}
              >
                <Phone className="h-3.5 w-3.5" />
                Call/Meeting
              </button>
              <button
                type="button"
                onClick={() => setKind('email_follow_up')}
                className={cn(
                  'flex items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-xs transition-colors',
                  kind === 'email_follow_up'
                    ? 'border-primary/50 bg-primary/15 text-foreground'
                    : 'border-white/10 bg-transparent text-muted-foreground hover:bg-white/[0.04]',
                )}
              >
                <Mail className="h-3.5 w-3.5" />
                Email Follow Up
              </button>
            </div>
          </div>

          <div>
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Note (optional)
            </Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Leave blank to skip updating status notes…"
              className="mt-1 text-xs resize-none"
              rows={3}
            />
            {currentNotes && note.trim() && (
              <p className="mt-1 text-[10px] text-muted-foreground">
                Current note will be moved to history.
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-1.5 pt-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => handleOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-7 text-xs"
              onClick={handleSubmit}
              disabled={saving}
            >
              {saving ? (
                <>
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Logging…
                </>
              ) : (
                'Log activity'
              )}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}