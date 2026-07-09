import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, CalendarIcon, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Compact "Add Hours" affordance for the deal Hours & Fees module.
 *
 * Behavior:
 *  - Renders a small button; clicking opens a dialog with a date-stamped
 *    entry form (date defaults to the most recent Friday, editable) and a
 *    list of prior entries with edit + delete.
 *  - Persists to `weekly_time_entries` (`phase` = 'pre_signing' | 'post_signing').
 *  - `week_start_date` is derived from the picked date (Monday of that week)
 *    so existing weekly-hours aggregates keep working.
 *  - The deal's `pre_signing_hours` / `post_signing_hours` columns stay in
 *    sync via a DB trigger, so the caller can continue reading them for
 *    display.
 */

export type HoursPhase = 'pre_signing' | 'post_signing';

interface Entry {
  id: string;
  user_id: string;
  hours: number;
  phase: HoursPhase;
  week_start_date: string;
}

/** Monday (YYYY-MM-DD, local time) for the ISO week containing `d`. */
function toMondayISO(d: Date): string {
  const c = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = c.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  c.setDate(c.getDate() + diff);
  return format(c, 'yyyy-MM-dd');
}

/** Most recent Friday on/before `d` (today if `d` is a Friday). */
function mostRecentFriday(d: Date): Date {
  const c = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = c.getDay();
  const back = (day - 5 + 7) % 7;
  c.setDate(c.getDate() - back);
  return c;
}

function fromISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

interface Props {
  dealId: string;
  /** Fires after add / edit / delete so the parent can refresh totals. */
  onChanged?: () => void;
  label?: string;
  /** When set, the dialog is locked to this phase (Pre or Post). */
  phase?: HoursPhase;
  /** Render as an icon-only "+" button instead of a labeled button. */
  iconOnly?: boolean;
  className?: string;
}

export function AddHoursButton({
  dealId, onChanged, label = 'Add Hours', phase, iconOnly, className,
}: Props) {
  const [open, setOpen] = useState(false);
  const phaseLabel = phase === 'post_signing' ? 'Post-Signing' : phase === 'pre_signing' ? 'Pre-Signing' : null;
  return (
    <>
      {iconOnly ? (
        <Button
          type="button"
          size="icon"
          variant="outline"
          className={cn('h-6 w-6 shrink-0', className)}
          onClick={() => setOpen(true)}
          aria-label={phaseLabel ? `Add ${phaseLabel} hours` : 'Add hours'}
          title={phaseLabel ? `Add ${phaseLabel} hours` : 'Add hours'}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={cn('h-8 gap-1.5', className)}
          onClick={() => setOpen(true)}
        >
          <Plus className="h-3.5 w-3.5" />
          {label}
        </Button>
      )}
      <HoursDialog
        dealId={dealId}
        open={open}
        onOpenChange={setOpen}
        onChanged={onChanged}
        lockedPhase={phase}
      />
    </>
  );
}

interface DialogProps {
  dealId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onChanged?: () => void;
  lockedPhase?: HoursPhase;
}

function HoursDialog({ dealId, open, onOpenChange, onChanged, lockedPhase }: DialogProps) {
  const { user } = useAuth();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const defaultFriday = useMemo(() => mostRecentFriday(new Date()), []);
  const [newDate, setNewDate] = useState<Date>(defaultFriday);
  const [newHours, setNewHours] = useState<string>('');
  const [newPhase, setNewPhase] = useState<HoursPhase>(lockedPhase ?? 'pre_signing');
  const [dateOpen, setDateOpen] = useState(false);

  // Keep newPhase in sync with the locked phase when the dialog is reopened.
  useEffect(() => { if (lockedPhase) setNewPhase(lockedPhase); }, [lockedPhase, open]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('weekly_time_entries')
      .select('id, user_id, hours, phase, week_start_date')
      .eq('deal_id', dealId)
      .order('week_start_date', { ascending: false });
    if (error) {
      toast.error('Failed to load hours entries', { description: error.message });
      setLoading(false);
      return;
    }
    setEntries(
      (data ?? []).map((r: any) => ({
        id: r.id,
        user_id: r.user_id,
        hours: Number(r.hours) || 0,
        phase: (r.phase as HoursPhase) ?? 'pre_signing',
        week_start_date: r.week_start_date,
      })),
    );
    setLoading(false);
  }, [dealId]);

  useEffect(() => { if (open) load(); }, [open, load]);

  const totals = useMemo(() => {
    let pre = 0, post = 0;
    for (const e of entries) {
      if (e.phase === 'post_signing') post += e.hours;
      else pre += e.hours;
    }
    return { pre, post, total: pre + post };
  }, [entries]);

  async function handleAdd() {
    if (!user) { toast.error('Not signed in'); return; }
    const hrs = Number(newHours);
    if (!Number.isFinite(hrs) || hrs <= 0) {
      toast.error('Enter a positive number of hours');
      return;
    }
    setSaving(true);
    const week = toMondayISO(newDate);
    try {
      // Second entry for the same (user, week, phase) adds to the existing
      // row so the ledger stays tidy (unique index enforces this shape).
      const existing = entries.find(
        (e) => e.user_id === user.id && e.week_start_date === week && e.phase === newPhase,
      );
      if (existing) {
        const { error } = await supabase
          .from('weekly_time_entries')
          .update({ hours: existing.hours + hrs })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('weekly_time_entries')
          .insert({
            deal_id: dealId,
            user_id: user.id,
            week_start_date: week,
            hours: hrs,
            phase: newPhase,
            source: 'manual',
          } as any);
        if (error) throw error;
      }
      setNewHours('');
      setNewDate(mostRecentFriday(new Date()));
      await load();
      onChanged?.();
      toast.success('Hours entry added');
    } catch (e: any) {
      toast.error('Save failed', { description: e?.message });
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateHours(entry: Entry, next: number) {
    if (!Number.isFinite(next) || next < 0) return;
    const { error } = await supabase
      .from('weekly_time_entries')
      .update({ hours: next })
      .eq('id', entry.id);
    if (error) { toast.error('Update failed', { description: error.message }); return; }
    await load();
    onChanged?.();
  }

  async function handleUpdateDate(entry: Entry, nextDate: Date) {
    const week = toMondayISO(nextDate);
    if (week === entry.week_start_date) return;
    const { error } = await supabase
      .from('weekly_time_entries')
      .update({ week_start_date: week })
      .eq('id', entry.id);
    if (error) { toast.error('Update failed', { description: error.message }); return; }
    await load();
    onChanged?.();
  }

  async function handleDelete(entry: Entry) {
    const { error } = await supabase
      .from('weekly_time_entries')
      .delete()
      .eq('id', entry.id);
    if (error) { toast.error('Delete failed', { description: error.message }); return; }
    await load();
    onChanged?.();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {lockedPhase === 'pre_signing'
              ? 'Log Pre-Signing Hours'
              : lockedPhase === 'post_signing'
                ? 'Log Post-Signing Hours'
                : 'Log Hours'}
          </DialogTitle>
          <DialogDescription>
            Each entry is date-stamped. The date defaults to the most recent Friday
            (Monday–Friday of that week) and can be changed.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-1.5">
            <div className="text-muted-foreground">Pre-Signing</div>
            <div className="text-sm font-medium tabular-nums">{totals.pre.toLocaleString()}</div>
          </div>
          <div className="rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-1.5">
            <div className="text-muted-foreground">Post-Signing</div>
            <div className="text-sm font-medium tabular-nums">{totals.post.toLocaleString()}</div>
          </div>
          <div className="rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-1.5">
            <div className="text-muted-foreground">Total</div>
            <div className="text-sm font-medium tabular-nums">{totals.total.toLocaleString()}</div>
          </div>
        </div>

        {/* Add-entry form */}
        <div className="rounded-md border border-white/[0.08] p-2 space-y-2">
          <div className="grid grid-cols-[minmax(0,1fr)_5rem_auto] gap-2 items-center">
            <Popover open={dateOpen} onOpenChange={setDateOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 justify-start text-left font-normal text-xs w-full"
                >
                  <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
                  {format(newDate, 'EEE, MMM d')}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={newDate}
                  onSelect={(d) => { if (d) { setNewDate(d); setDateOpen(false); } }}
                  initialFocus
                  className={cn('p-3 pointer-events-auto')}
                />
              </PopoverContent>
            </Popover>
            <Input
              type="number"
              step="0.25"
              min={0}
              value={newHours}
              onChange={(e) => setNewHours(e.target.value)}
              placeholder="Hrs"
              className="h-8 text-sm text-right tabular-nums"
            />
            <Button size="sm" className="h-8" onClick={handleAdd} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              <span className="ml-1">Add</span>
            </Button>
          </div>
          {!lockedPhase && (
            <Select value={newPhase} onValueChange={(v) => setNewPhase(v as HoursPhase)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pre_signing">Pre-Signing</SelectItem>
                <SelectItem value="post_signing">Post-Signing</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Entries list */}
        <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
          {loading ? (
            <div className="py-4 flex items-center justify-center text-muted-foreground text-xs">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
            </div>
          ) : entries.filter((e) => !lockedPhase || e.phase === lockedPhase).length === 0 ? (
            <div className="py-3 text-center text-xs text-muted-foreground">
              No hours logged yet.
            </div>
          ) : (
            entries.filter((e) => !lockedPhase || e.phase === lockedPhase).map((e) => (
              <EntryRow
                key={e.id}
                entry={e}
                onHours={(n) => handleUpdateHours(e, n)}
                onDate={(d) => handleUpdateDate(e, d)}
                onDelete={() => handleDelete(e)}
              />
            ))
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface RowProps {
  entry: Entry;
  onHours: (n: number) => void;
  onDate: (d: Date) => void;
  onDelete: () => void;
}

function EntryRow({ entry, onHours, onDate, onDelete }: RowProps) {
  const [hrs, setHrs] = useState(String(entry.hours));
  const [open, setOpen] = useState(false);
  useEffect(() => { setHrs(String(entry.hours)); }, [entry.hours]);

  const monday = fromISO(entry.week_start_date);
  const friday = new Date(monday); friday.setDate(monday.getDate() + 4);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_5rem_auto_auto] gap-2 items-center text-xs">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 justify-start px-2 font-normal text-xs">
            <CalendarIcon className="h-3 w-3 mr-1.5 opacity-70" />
            {format(friday, 'EEE, MMM d')}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={friday}
            onSelect={(d) => { if (d) { onDate(d); setOpen(false); } }}
            initialFocus
            className={cn('p-3 pointer-events-auto')}
          />
        </PopoverContent>
      </Popover>
      <Input
        type="number"
        step="0.25"
        min={0}
        value={hrs}
        onChange={(e) => setHrs(e.target.value)}
        onBlur={() => {
          const n = Number(hrs);
          if (Number.isFinite(n) && n !== entry.hours) onHours(n);
        }}
        className="h-7 text-right tabular-nums text-xs"
      />
      <span
        className={cn(
          'text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5',
          entry.phase === 'pre_signing'
            ? 'bg-blue-500/15 text-blue-300'
            : 'bg-emerald-500/15 text-emerald-300',
        )}
      >
        {entry.phase === 'pre_signing' ? 'Pre' : 'Post'}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-muted-foreground hover:text-destructive"
        onClick={onDelete}
        aria-label="Delete entry"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}