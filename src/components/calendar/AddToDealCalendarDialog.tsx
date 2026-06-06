import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { CalendarIcon, CheckCheck, Loader2, Quote, Sparkles, Lock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useDealsContext } from '@/contexts/DealsContext';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import type { CalendarSourceCtx } from './AddToDealCalendarProvider';
import type { ParsedRelativeDate } from '@/lib/parseRelativeDate';
import { createDealFollowUp } from '@/lib/deals/dealFollowUp';

export interface AddToDealCalendarPrefill {
  sourceText: string;
  title: string;
  parsed: ParsedRelativeDate;
  ctx: CalendarSourceCtx;
}

type ItemKind = 'task' | 'event';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefill: AddToDealCalendarPrefill | null;
}

const MODULE_LABEL: Record<CalendarSourceCtx['module'], string> = {
  meeting_notes: 'Meeting notes',
  claap_summary: 'Claap summary',
  rundown_item: 'Daily rundown',
  agenda: 'Agenda',
  report: 'Report',
  comment: 'Comment',
  deal_memo: 'Deal memo',
  other: 'Source',
};

export function AddToDealCalendarDialog({ open, onOpenChange, prefill }: Props) {
  const { user } = useAuth();
  const { deals } = useDealsContext();
  const queryClient = useQueryClient();

  const [kind, setKind] = useState<ItemKind | null>(null);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [time, setTime] = useState<string>('');
  const [dealId, setDealId] = useState<string | null>(null);
  const [dealQuery, setDealQuery] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const lockedDeal = !!prefill?.ctx.dealId;

  useEffect(() => {
    if (!open || !prefill) return;
    setKind(null);
    setTitle(prefill.title);
    setDate(prefill.parsed.date ?? undefined);
    setTime('');
    setDealId(prefill.ctx.dealId ?? null);
    setDealQuery('');
    setSubmitting(false);
  }, [open, prefill]);

  const filteredDeals = useMemo(() => {
    const q = dealQuery.trim().toLowerCase();
    const base = deals.slice(0, 200);
    if (!q) return base.slice(0, 12);
    return base
      .filter((d) => {
        const hay = `${d.name || ''} ${d.company || ''} ${d.lender || ''}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 12);
  }, [deals, dealQuery]);

  const selectedDeal = dealId ? deals.find((d) => d.id === dealId) : null;

  const canSave =
    !!kind &&
    !!user &&
    !!dealId &&
    !!title.trim() &&
    !!date &&
    !submitting;

  const handleSave = async () => {
    if (!canSave || !prefill || !user || !dealId || !date || !kind) return;
    setSubmitting(true);
    try {
      const dateStr = format(date, 'yyyy-MM-dd');
      await createDealFollowUp({
        kind,
        dealId,
        title: title.trim(),
        date: dateStr,
        time: kind === 'event' && time ? time : null,
        notes: `From ${MODULE_LABEL[prefill.ctx.module]}:\n\n“${prefill.sourceText}”`,
        userId: user.id,
        source: {
          module: prefill.ctx.module,
          recordId: prefill.ctx.recordId,
          sourceTimestamp: prefill.ctx.sourceTimestamp,
          sourceText: prefill.sourceText,
          deepLinkUrl: prefill.ctx.deepLinkUrl ?? null,
        },
      });

      queryClient.invalidateQueries({ queryKey: ['deal-calendar-items', dealId] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });

      const dealName = selectedDeal?.name || 'deal';
      const friendlyDate = format(date, 'EEE, MMM d');
      toast.success(`Added to ${dealName} calendar for ${friendlyDate}`, {
        action: {
          label: 'Open calendar',
          onClick: () => {
            window.location.href = `/deals?deal=${dealId}#calendar`;
          },
        },
      });
      onOpenChange(false);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[AddToDealCalendar] save failed', e);
      toast.error('Could not add to deal calendar', {
        description: e instanceof Error ? e.message : 'Unknown error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!prefill) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Add to Deal Calendar
          </DialogTitle>
          <DialogDescription>
            Convert the highlighted text into a task or event on the deal calendar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Source preview */}
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Quote className="h-3 w-3" />
              <span>{MODULE_LABEL[prefill.ctx.module]}</span>
              <span>·</span>
              <span>{format(new Date(prefill.ctx.sourceTimestamp), 'MMM d, yyyy h:mm a')}</span>
              {prefill.ctx.label ? <><span>·</span><span className="truncate">{prefill.ctx.label}</span></> : null}
            </div>
            <p className="text-foreground/90 italic line-clamp-3">"{prefill.sourceText}"</p>
          </div>

          {/* Kind toggle — REQUIRED */}
          <div>
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Item type</Label>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={kind === 'task' ? 'default' : 'outline'}
                onClick={() => setKind('task')}
                className="justify-center"
              >
                <CheckCheck className="h-4 w-4 mr-1.5" /> Task / To-do
              </Button>
              <Button
                type="button"
                variant={kind === 'event' ? 'default' : 'outline'}
                onClick={() => setKind('event')}
                className="justify-center"
              >
                <CalendarIcon className="h-4 w-4 mr-1.5" /> Event
              </Button>
            </div>
          </div>

          {/* Title */}
          <div>
            <Label htmlFor="add-cal-title" className="text-xs uppercase tracking-wide text-muted-foreground">Title</Label>
            <Input
              id="add-cal-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Item title"
              className="mt-1.5"
            />
          </div>

          {/* Deal */}
          <div>
            <Label className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1">
              Deal
              {lockedDeal && <Lock className="h-3 w-3" />}
            </Label>
            {lockedDeal && selectedDeal ? (
              <div className="mt-1.5 px-3 py-2 rounded-md border border-border bg-muted/30 text-sm">
                {selectedDeal.name}
                <span className="text-xs text-muted-foreground ml-2">(from source)</span>
              </div>
            ) : (
              <div className="mt-1.5 space-y-2">
                <Input
                  value={dealQuery}
                  onChange={(e) => setDealQuery(e.target.value)}
                  placeholder="Search deals…"
                />
                <div className="max-h-40 overflow-y-auto rounded-md border border-border divide-y divide-border">
                  {filteredDeals.length === 0 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">No deals match.</div>
                  )}
                  {filteredDeals.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => setDealId(d.id)}
                      className={cn(
                        'w-full text-left px-3 py-1.5 text-sm hover:bg-accent',
                        dealId === d.id && 'bg-accent text-accent-foreground',
                      )}
                    >
                      {d.name}
                      {d.company && <span className="text-muted-foreground ml-2 text-xs">{d.company}</span>}
                    </button>
                  ))}
                </div>
                {!dealId && (
                  <p className="text-xs text-amber-500">Pick a deal to continue — no fuzzy guessing.</p>
                )}
              </div>
            )}
          </div>

          {/* Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn('mt-1.5 w-full justify-start text-left font-normal', !date && 'text-muted-foreground')}
                  >
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    {date ? format(date, 'PPP') : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={setDate}
                    initialFocus
                    className={cn('p-3 pointer-events-auto')}
                  />
                </PopoverContent>
              </Popover>
              {prefill.parsed.matchedText && (
                <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Badge variant="secondary" className="font-normal">
                    Parsed from "{prefill.parsed.matchedText}"
                  </Badge>
                  {prefill.parsed.ambiguous && (
                    <span className="text-amber-500">Confirm</span>
                  )}
                </div>
              )}
              {!date && (
                <p className="mt-1 text-xs text-amber-500">No date parsed — please pick one.</p>
              )}
            </div>
            {kind === 'event' && (
              <div>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Time (optional)</Label>
                <Input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="mt-1.5"
                />
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
            {kind === 'event' ? 'Add event' : 'Add task'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
