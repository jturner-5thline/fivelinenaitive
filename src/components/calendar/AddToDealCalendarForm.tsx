import { useEffect, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { CalendarIcon, CheckCheck, Loader2, Lock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useDealsContext } from '@/contexts/DealsContext';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { CalendarSourceCtx } from './AddToDealCalendarProvider';
import type { ParsedRelativeDate } from '@/lib/parseRelativeDate';
import { createDealFollowUp } from '@/lib/deals/dealFollowUp';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

export interface AddToDealCalendarPrefill {
  sourceText: string;
  title: string;
  parsed: ParsedRelativeDate;
  ctx: CalendarSourceCtx;
}

type ItemKind = 'task' | 'event';

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

interface Props {
  prefill: AddToDealCalendarPrefill;
  /** Called when the user cancels or after a successful save. */
  onClose: () => void;
  /** When true, render in compact dropdown form (no source preview card, denser spacing). */
  compact?: boolean;
  /** Hydration nonce — bump to re-seed fields when the popover re-opens with new prefill. */
  resetKey?: string | number;
  /** Initial item type. Defaults to 'task'. Set to 'event' for an
   *  "Add to deal calendar" entry point so the form opens in event mode. */
  initialKind?: ItemKind;
}

export function AddToDealCalendarForm({ prefill, onClose, compact = false, resetKey, initialKind = 'task' }: Props) {
  const { user } = useAuth();
  const { deals } = useDealsContext();
  const teamMembers = useTeamMembers();
  const queryClient = useQueryClient();

  const [kind, setKind] = useState<ItemKind>(initialKind);
  const [title, setTitle] = useState(prefill.title);
  const [date, setDate] = useState<Date | undefined>(prefill.parsed.date ?? undefined);
  const [time, setTime] = useState<string>('');
  const [dealId, setDealId] = useState<string | null>(prefill.ctx.dealId ?? null);
  const [dealQuery, setDealQuery] = useState('');
  const [assigneeId, setAssigneeId] = useState<string>(user?.id ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [alsoOnDealCalendar, setAlsoOnDealCalendar] = useState(false);
  const debouncedDealQuery = useDebouncedValue(dealQuery, 180);

  const lockedDeal = !!prefill.ctx.dealId;
  const effectiveDealId = dealId ?? prefill.ctx.dealId ?? null;
  const selectedDeal = effectiveDealId ? deals.find((d) => d.id === effectiveDealId) : null;
  const hasResolvedDeal = !!effectiveDealId;
  const noLinkedDeal = !prefill.ctx.dealId;

  // Re-seed fields when the host re-opens with a new prefill (resetKey change).
  useEffect(() => {
    setKind(initialKind);
    setTitle(prefill.title);
    setDate(prefill.parsed.date ?? undefined);
    setTime('');
    setDealId(prefill.ctx.dealId ?? null);
    setDealQuery('');
    setAssigneeId(user?.id ?? '');
    setSubmitting(false);
    setAlsoOnDealCalendar(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  // Hydrate default assignee once the auth user becomes available.
  useEffect(() => {
    if (user?.id && !assigneeId) setAssigneeId(user.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const filteredDeals = useMemo(() => {
    const q = debouncedDealQuery.trim().toLowerCase();
    if (!q) return [];
    return deals
      .filter((d) => {
        const hay = `${d.name || ''} ${d.company || ''} ${d.lender || ''}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 12);
  }, [deals, debouncedDealQuery]);
  const dealQueryActive = dealQuery.trim().length >= 1;
  const isSearching = dealQueryActive && dealQuery.trim() !== debouncedDealQuery.trim();

  const canSave =
    !!user &&
    !!title.trim() &&
    !submitting &&
    (kind === 'event' ? hasResolvedDeal && !!date : true);

  const handleSave = async () => {
    if (!canSave || !user) return;
    setSubmitting(true);
    try {
      const dateStr = date ? format(date, 'yyyy-MM-dd') : null;
      const source = {
        module: prefill.ctx.module,
        recordId: prefill.ctx.recordId,
        sourceTimestamp: prefill.ctx.sourceTimestamp,
        sourceText: prefill.sourceText,
        deepLinkUrl: prefill.ctx.deepLinkUrl ?? null,
      } as const;
      const notes = `From ${MODULE_LABEL[prefill.ctx.module]}:\n\n“${prefill.sourceText}”`;

      await createDealFollowUp({
        kind,
        dealId: effectiveDealId,
        title: title.trim(),
        date: dateStr,
        time: kind === 'event' && time ? time : null,
        notes,
        userId: user.id,
        assignedTo: kind === 'task' ? (assigneeId || user.id) : undefined,
        source,
        sourceCalendarEventId:
          prefill.ctx.module === 'calendar' ? prefill.ctx.recordId : null,
      });

      if (kind === 'task' && alsoOnDealCalendar && effectiveDealId && dateStr) {
        try {
          await createDealFollowUp({
            kind: 'event',
            dealId: effectiveDealId,
            title: title.trim(),
            date: dateStr,
            time: null,
            notes,
            userId: user.id,
            source: { ...source, sourceText: `${prefill.sourceText} [calendar]` },
          });
        } catch (companionErr) {
          // eslint-disable-next-line no-console
          console.warn('[AddToDealCalendar] companion event insert failed', companionErr);
        }
      }

      queryClient.invalidateQueries({ queryKey: ['deal-calendar-items', effectiveDealId] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });

      const dealName = selectedDeal?.name || 'deal';
      const friendlyDate = date ? format(date, 'EEE, MMM d') : null;
      const successMsg =
        kind === 'event'
          ? `Added event to ${dealName} calendar${friendlyDate ? ` for ${friendlyDate}` : ''}`
          : alsoOnDealCalendar && effectiveDealId
            ? `Task created and added to ${dealName} calendar${friendlyDate ? ` for ${friendlyDate}` : ''}`
            : noLinkedDeal
              ? `Task created${friendlyDate ? ` for ${friendlyDate}` : ''}`
              : `Task created for ${dealName}${friendlyDate ? ` · ${friendlyDate}` : ''}`;
      toast.success(successMsg, effectiveDealId ? {
        action: {
          label: 'Open calendar',
          onClick: () => { window.location.href = `/deals?deal=${effectiveDealId}#calendar`; },
        },
      } : undefined);
      onClose();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[AddToDealCalendar] save failed', e);
      toast.error('Could not create follow-up', {
        description: e instanceof Error ? e.message : 'Unknown error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const labelCls = 'text-[10px] uppercase tracking-wide text-muted-foreground';

  if (compact) {
    return (
      <div className="flex h-full max-h-full min-h-0 w-full flex-col">
        {/* Pinned header: source line */}
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground truncate shrink-0 pb-2 border-b border-border/60">
          <span className="uppercase tracking-wide">{MODULE_LABEL[prefill.ctx.module]}</span>
          {prefill.ctx.label && <><span>·</span><span className="truncate">{prefill.ctx.label}</span></>}
        </div>

        {/* Scrollable middle */}
        <div className="flex-1 min-h-0 overflow-y-auto space-y-2 py-2 pr-1">
          {/* Item type */}
          <div>
            <Label className={labelCls}>Item type</Label>
            <div className="mt-1 grid grid-cols-2 gap-1.5">
              <Button
                type="button"
                size="sm"
                variant={kind === 'task' ? 'default' : 'outline'}
                onClick={() => setKind('task')}
                className="justify-center h-8"
              >
                <CheckCheck className="h-3.5 w-3.5 mr-1.5" /> Task
              </Button>
              <Button
                type="button"
                size="sm"
                variant={kind === 'event' ? 'default' : 'outline'}
                onClick={() => setKind('event')}
                className="justify-center h-8"
              >
                <CalendarIcon className="h-3.5 w-3.5 mr-1.5" /> Event
              </Button>
            </div>
          </div>

          {/* Title */}
          <div>
            <Label htmlFor="add-cal-title" className={labelCls}>Title</Label>
            <Input
              id="add-cal-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Item title"
              className="mt-1 h-8 text-sm"
            />
          </div>

          {/* Deal */}
          <div>
            <Label className={cn(labelCls, 'flex items-center gap-1')}>
              Deal
              {lockedDeal && <Lock className="h-3 w-3" />}
            </Label>
            {lockedDeal && selectedDeal ? (
              <div className="mt-1 px-2.5 py-1.5 rounded-md border border-border bg-muted/30 text-xs truncate">
                {selectedDeal.name}
                <span className="text-[10px] text-muted-foreground ml-1.5">(from source)</span>
              </div>
            ) : (
              <div className="mt-1 space-y-1.5">
                <Input
                  value={dealQuery}
                  onChange={(e) => setDealQuery(e.target.value)}
                  placeholder="Search deals…"
                  className="h-8 text-sm"
                />
                {!dealQueryActive ? (
                  <p className="px-0.5 text-[10px] text-muted-foreground">Start typing to search deals.</p>
                ) : (
                  <div className="max-h-32 overflow-y-auto rounded-md border border-border divide-y divide-border">
                    {isSearching && (
                      <div className="px-2.5 py-1 text-[10px] text-muted-foreground">Searching…</div>
                    )}
                    {!isSearching && filteredDeals.length === 0 && (
                      <div className="px-2.5 py-1.5 text-[11px] text-muted-foreground">No deals match.</div>
                    )}
                    {filteredDeals.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => { setDealId(d.id); setDealQuery(''); }}
                        className={cn(
                          'w-full text-left px-2.5 py-1 text-xs hover:bg-accent',
                          dealId === d.id && 'bg-accent text-accent-foreground',
                        )}
                      >
                        {d.name}
                        {d.company && <span className="text-muted-foreground ml-1.5 text-[10px]">{d.company}</span>}
                      </button>
                    ))}
                  </div>
                )}
                {effectiveDealId && selectedDeal && (
                  <div className="px-2.5 py-1 rounded-md border border-border bg-muted/30 text-xs truncate">
                    Selected: {selectedDeal.name}
                  </div>
                )}
                {!dealId && kind === 'event' && (
                  <p className="text-[10px] text-amber-500">Pick a deal — required for events.</p>
                )}
              </div>
            )}
          </div>

          {/* Date + Time */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className={labelCls}>
                Date {kind === 'task' && <span className="normal-case text-muted-foreground/70">(optional)</span>}
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn('mt-1 w-full justify-start text-left font-normal h-8 text-xs', !date && 'text-muted-foreground')}
                  >
                    <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
                    {date ? format(date, 'MMM d, yyyy') : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-auto p-0 z-[100]">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={setDate}
                    initialFocus
                    className={cn('p-3 pointer-events-auto')}
                  />
                </PopoverContent>
              </Popover>
              {kind === 'event' && !date && (
                <p className="mt-1 text-[10px] text-amber-500">Pick a date.</p>
              )}
            </div>
            {kind === 'event' && (
              <div>
                <Label className={labelCls}>Time (optional)</Label>
                <Input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="mt-1 h-8 text-xs"
                />
              </div>
            )}
          </div>

          {/* Assignee (tasks only) */}
          {kind === 'task' && (
            <div>
              <Label className={labelCls}>Assignee</Label>
              <Select value={assigneeId} onValueChange={setAssigneeId}>
                <SelectTrigger className="mt-1 h-8 text-xs">
                  <SelectValue placeholder="Select assignee" />
                </SelectTrigger>
                <SelectContent className="z-[100]">
                  {teamMembers.map((m) => {
                    const initials = (m.display_name || '')
                      .split(' ').map((s) => s[0]).join('').slice(0, 2).toUpperCase() || '?';
                    return (
                      <SelectItem key={m.id} value={m.id}>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-4 w-4">
                            <AvatarImage src={m.avatar_url || undefined} />
                            <AvatarFallback className="text-[8px]">{initials}</AvatarFallback>
                          </Avatar>
                          <span className="text-xs">{m.display_name}{m.id === user?.id ? ' (you)' : ''}</span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Also-on-calendar toggle */}
          {kind === 'task' && !!effectiveDealId && (
            <label className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-1.5 cursor-pointer">
              <Checkbox
                checked={alsoOnDealCalendar}
                onCheckedChange={(v) => setAlsoOnDealCalendar(v === true)}
              />
              <div className="text-xs leading-tight">
                <div className="font-medium">Also add to deal calendar</div>
                <div className="text-[10px] text-muted-foreground">
                  Matching calendar entry on the deal{date ? ` · ${format(date, 'EEE, MMM d')}` : ''}.
                </div>
              </div>
            </label>
          )}
        </div>

        {/* Pinned footer: actions */}
        <div className="flex items-center justify-end gap-2 pt-2 mt-1 shrink-0 border-t border-border/60 bg-card">
          <Button size="sm" variant="ghost" onClick={onClose} disabled={submitting} className="h-8 text-xs">
            Cancel
          </Button>
          <Button
            size="sm"
            variant="liquid-glass"
            onClick={handleSave}
            disabled={!canSave}
            className="h-8 rounded-lg px-3 text-xs font-semibold"
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
            {kind === 'event'
              ? 'Add event'
              : alsoOnDealCalendar
                ? 'Create task + calendar'
                : 'Create task'}
          </Button>
        </div>
      </div>
    );
  }

  const gap = 'space-y-4';
  return (
    <div className={cn('w-full', gap)}>
      {/* Tiny source line */}
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground truncate">
        <span className="uppercase tracking-wide">{MODULE_LABEL[prefill.ctx.module]}</span>
        {prefill.ctx.label && <><span>·</span><span className="truncate">{prefill.ctx.label}</span></>}
      </div>

      {/* Item type */}
      <div>
        <Label className={labelCls}>Item type</Label>
        <div className="mt-1 grid grid-cols-2 gap-1.5">
          <Button
            type="button"
            size="sm"
            variant={kind === 'task' ? 'default' : 'outline'}
            onClick={() => setKind('task')}
            className="justify-center h-8"
          >
            <CheckCheck className="h-3.5 w-3.5 mr-1.5" /> Task
          </Button>
          <Button
            type="button"
            size="sm"
            variant={kind === 'event' ? 'default' : 'outline'}
            onClick={() => setKind('event')}
            className="justify-center h-8"
          >
            <CalendarIcon className="h-3.5 w-3.5 mr-1.5" /> Event
          </Button>
        </div>
      </div>

      {/* Title */}
      <div>
        <Label htmlFor="add-cal-title" className={labelCls}>Title</Label>
        <Input
          id="add-cal-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Item title"
          className="mt-1 h-8 text-sm"
        />
      </div>

      {/* Deal */}
      <div>
        <Label className={cn(labelCls, 'flex items-center gap-1')}>
          Deal
          {lockedDeal && <Lock className="h-3 w-3" />}
        </Label>
        {lockedDeal && selectedDeal ? (
          <div className="mt-1 px-2.5 py-1.5 rounded-md border border-border bg-muted/30 text-xs truncate">
            {selectedDeal.name}
            <span className="text-[10px] text-muted-foreground ml-1.5">(from source)</span>
          </div>
        ) : (
          <div className="mt-1 space-y-1.5">
            <Input
              value={dealQuery}
              onChange={(e) => setDealQuery(e.target.value)}
              placeholder="Search deals…"
              className="h-8 text-sm"
            />
            {!dealQueryActive ? (
              <p className="px-0.5 text-[10px] text-muted-foreground">Start typing to search deals.</p>
            ) : (
              <div className="max-h-32 overflow-y-auto rounded-md border border-border divide-y divide-border">
                {isSearching && (
                  <div className="px-2.5 py-1 text-[10px] text-muted-foreground">Searching…</div>
                )}
                {!isSearching && filteredDeals.length === 0 && (
                  <div className="px-2.5 py-1.5 text-[11px] text-muted-foreground">No deals match.</div>
                )}
                {filteredDeals.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => { setDealId(d.id); setDealQuery(''); }}
                    className={cn(
                      'w-full text-left px-2.5 py-1 text-xs hover:bg-accent',
                      dealId === d.id && 'bg-accent text-accent-foreground',
                    )}
                  >
                    {d.name}
                    {d.company && <span className="text-muted-foreground ml-1.5 text-[10px]">{d.company}</span>}
                  </button>
                ))}
              </div>
            )}
            {effectiveDealId && selectedDeal && (
              <div className="px-2.5 py-1 rounded-md border border-border bg-muted/30 text-xs truncate">
                Selected: {selectedDeal.name}
              </div>
            )}
            {!dealId && kind === 'event' && (
              <p className="text-[10px] text-amber-500">Pick a deal — required for events.</p>
            )}
          </div>
        )}
      </div>

      {/* Date + Time */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className={labelCls}>
            Date {kind === 'task' && <span className="normal-case text-muted-foreground/70">(optional)</span>}
          </Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn('mt-1 w-full justify-start text-left font-normal h-8 text-xs', !date && 'text-muted-foreground')}
              >
                <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
                {date ? format(date, 'MMM d, yyyy') : 'Pick a date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-0 z-[100]">
              <Calendar
                mode="single"
                selected={date}
                onSelect={setDate}
                initialFocus
                className={cn('p-3 pointer-events-auto')}
              />
            </PopoverContent>
          </Popover>
          {kind === 'event' && !date && (
            <p className="mt-1 text-[10px] text-amber-500">Pick a date.</p>
          )}
        </div>
        {kind === 'event' && (
          <div>
            <Label className={labelCls}>Time (optional)</Label>
            <Input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="mt-1 h-8 text-xs"
            />
          </div>
        )}
      </div>

      {/* Assignee (tasks only) */}
      {kind === 'task' && (
        <div>
          <Label className={labelCls}>Assignee</Label>
          <Select value={assigneeId} onValueChange={setAssigneeId}>
            <SelectTrigger className="mt-1 h-8 text-xs">
              <SelectValue placeholder="Select assignee" />
            </SelectTrigger>
            <SelectContent className="z-[100]">
              {teamMembers.map((m) => {
                const initials = (m.display_name || '')
                  .split(' ').map((s) => s[0]).join('').slice(0, 2).toUpperCase() || '?';
                return (
                  <SelectItem key={m.id} value={m.id}>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-4 w-4">
                        <AvatarImage src={m.avatar_url || undefined} />
                        <AvatarFallback className="text-[8px]">{initials}</AvatarFallback>
                      </Avatar>
                      <span className="text-xs">{m.display_name}{m.id === user?.id ? ' (you)' : ''}</span>
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Also-on-calendar toggle */}
      {kind === 'task' && !!effectiveDealId && (
        <label className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-1.5 cursor-pointer">
          <Checkbox
            checked={alsoOnDealCalendar}
            onCheckedChange={(v) => setAlsoOnDealCalendar(v === true)}
          />
          <div className="text-xs leading-tight">
            <div className="font-medium">Also add to deal calendar</div>
            <div className="text-[10px] text-muted-foreground">
              Matching calendar entry on the deal{date ? ` · ${format(date, 'EEE, MMM d')}` : ''}.
            </div>
          </div>
        </label>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-1">
        <Button size="sm" variant="ghost" onClick={onClose} disabled={submitting} className="h-8 text-xs">
          Cancel
        </Button>
        <Button size="sm" onClick={handleSave} disabled={!canSave} className="h-8 text-xs">
          {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
          {kind === 'event'
            ? 'Add event'
            : alsoOnDealCalendar
              ? 'Create task + calendar'
              : 'Create task'}
        </Button>
      </div>
    </div>
  );
}