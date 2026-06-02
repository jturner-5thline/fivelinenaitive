import { useState } from 'react';
import { Plus, Calendar as CalendarIcon, Loader2, Check, Diamond } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import type { Deal } from '@/types/deal';

interface Props {
  deal: Deal;
  onClose: () => void;
  onCreated?: (milestoneId: string) => void;
}

function toIsoDate(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

/**
 * AddMilestoneInlineForm
 * ----------------------
 * Inline creator mounted by TasksMilestonesBand when the user clicks "+"
 * while the "Milestones" filter pill is active. Inserts directly into
 * deal_milestones — RLS scopes by user_id, matching useDealMilestones.
 */
export function AddMilestoneInlineForm({ deal, onClose, onCreated }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState('');
  const [targetDate, setTargetDate] = useState<Date | null>(null);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleCreate = async () => {
    if (!user?.id) { toast.error('Sign in required'); return; }
    if (!title.trim()) { toast.error('Milestone title is required'); return; }
    setBusy(true);
    try {
      const { data: existing } = await supabase
        .from('deal_milestones')
        .select('position')
        .eq('deal_id', deal.id);
      const maxPosition = (existing || []).reduce(
        (acc: number, row: any) => Math.max(acc, (row?.position ?? 0) + 1),
        0,
      );
      const { data, error } = await supabase
        .from('deal_milestones')
        .insert({
          deal_id: deal.id,
          user_id: user.id,
          title: title.trim(),
          due_date: toIsoDate(targetDate),
          completed: false,
          position: maxPosition,
        })
        .select('id')
        .single();
      if (error) throw error;
      toast.success('Milestone added');
      // Trigger DealsContext refresh so deal.milestones updates everywhere.
      window.dispatchEvent(
        new CustomEvent('copilot-action-completed', {
          detail: { actionType: 'add_milestone', params: { deal_id: deal.id } },
        }),
      );
      queryClient.invalidateQueries({ queryKey: ['deal-milestones'] });
      onCreated?.(data?.id as string);
      onClose();
    } catch (e) {
      console.error('[AddMilestoneInlineForm] create failed', e);
      const msg = e instanceof Error ? e.message : (e as any)?.message || 'try again';
      toast.error(`Failed to add milestone — ${msg}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="rounded-md border border-primary/20 bg-primary/[0.04] p-2.5 space-y-2 mt-2"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2">
        <Diamond className="h-3.5 w-3.5 text-primary" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          New milestone
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onClose}
          className="text-[11px] text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>

      <Input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Milestone title — e.g. Term sheet signed"
        className="h-8 text-[12px]"
      />

      <div className="flex items-center gap-2 flex-wrap">
        <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 px-2 gap-1.5 text-[11px] font-normal">
              <CalendarIcon className="h-3 w-3" />
              {targetDate ? format(targetDate, 'EEE, MMM d') : 'Target date (optional)'}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-auto p-0 z-[1400] pointer-events-auto"
            align="start"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <Calendar
              mode="single"
              selected={targetDate ?? undefined}
              onSelect={(d) => { setTargetDate(d ?? null); setDatePickerOpen(false); }}
              initialFocus
              className={cn('p-3 pointer-events-auto')}
            />
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        <Button
          type="button"
          size="sm"
          className="h-7 px-3 text-[11px] gap-1.5"
          disabled={busy || !title.trim()}
          onClick={handleCreate}
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          Add milestone
        </Button>
      </div>
    </div>
  );
}