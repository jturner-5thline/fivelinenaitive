import { useMemo, useState, useRef } from 'react';
import {
  format, parseISO, startOfWeek, eachDayOfInterval, isToday, addDays, getDay,
} from 'date-fns';
import { ChevronLeft, ChevronRight, Plus, Lock, Trash2, Pencil, X, Check, Maximize2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { Deal } from '@/types/deal';
import type { DealTaskItem } from '@/hooks/usePipelineDealTasks';
import { useDealMilestones } from '@/hooks/useDealMilestones';
import { useDealCalendarItems, type DealCalendarItem, type DealCalendarItemType } from '@/hooks/useDealCalendarItems';
import { useDealTeamCalendarEvents, type DealTeamCalendarEvent } from '@/hooks/useDealTeamCalendarEvents';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

interface CalendarPanelProps {
  deal: Deal;
  tasks?: DealTaskItem[];
  onOpenDeal?: () => void;
}

type ItemKind = 'milestone' | 'task' | 'custom' | 'lender' | 'team';

interface DayItem {
  id: string;
  kind: ItemKind;
  title: string;
  time?: string | null;
  type?: DealCalendarItemType;
  notes?: string | null;
  editable: boolean;
  raw?: DealCalendarItem;
  /** Set when the source date fell on a weekend and was rolled to Friday. */
  weekendTag?: 'Sat' | 'Sun';
  ref?: { milestoneId?: string; taskId?: string };
  team?: DealTeamCalendarEvent;
}

const KIND_COLORS: Record<ItemKind, { dot: string; bar: string; label: string }> = {
  milestone: { dot: 'bg-[hsl(265,85%,65%)]', bar: 'bg-[hsl(265,85%,65%)]', label: 'Milestone' },
  task: { dot: 'bg-blue-500', bar: 'bg-blue-500', label: 'Task' },
  custom: { dot: 'bg-emerald-500', bar: 'bg-emerald-500', label: 'Event' },
  lender: { dot: 'bg-amber-500', bar: 'bg-amber-500', label: 'Lender' },
  team: { dot: 'bg-cyan-400', bar: 'bg-cyan-400', label: 'Team meeting' },
};

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

function toDateKey(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.slice(0, 10);
  try {
    const d = parseISO(value);
    if (isNaN(d.getTime())) return null;
    return format(d, 'yyyy-MM-dd');
  } catch {
    return null;
  }
}

/**
 * Roll a date to the nearest preceding Friday if it falls on a weekend.
 * Returns { key, weekendTag } — weekendTag set only when rolled.
 */
function rollWeekendToFriday(dateKey: string): { key: string; weekendTag?: 'Sat' | 'Sun' } {
  const d = parseISO(dateKey);
  const dow = getDay(d); // 0=Sun, 6=Sat
  if (dow === 6) return { key: format(addDays(d, -1), 'yyyy-MM-dd'), weekendTag: 'Sat' };
  if (dow === 0) return { key: format(addDays(d, -2), 'yyyy-MM-dd'), weekendTag: 'Sun' };
  return { key: dateKey };
}

function defaultWindowStart(now: Date = new Date()): Date {
  return startOfWeek(now, { weekStartsOn: 1 });
}

export function CalendarPanel({ deal, tasks = [], onOpenDeal }: CalendarPanelProps) {
  const { milestones } = useDealMilestones(deal.id);
  const { items: customItems, creators, addItem, updateItem, deleteItem } = useDealCalendarItems(deal.id);
  const [detailOpen, setDetailOpen] = useState(false);

  // Visible window = 2 work weeks starting at `windowStart` (a Monday).
  const [windowStart, setWindowStart] = useState<Date>(() => defaultWindowStart());
  const [selectedKey, setSelectedKey] = useState<string>(() => format(new Date(), 'yyyy-MM-dd'));

  // Team meetings: request only the visible two-week window. Broad calendar
  // pulls can hit provider page limits before later visible meetings (e.g. the
  // second week) are returned.
  const teamRange = useMemo(() => {
    return { start: windowStart, end: addDays(windowStart, 14) };
  }, [windowStart]);
  const { data: teamEvents = [] } = useDealTeamCalendarEvents(deal.id, teamRange);

  // Add / edit form
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formDate, setFormDate] = useState<string>('');
  const titleRef = useRef<HTMLInputElement>(null);

  // Build map: date key -> items (weekend items rolled to Friday)
  const itemsByDate = useMemo(() => {
    const map = new Map<string, DayItem[]>();
    const push = (rawKey: string | null, build: (k: string, tag?: 'Sat' | 'Sun') => DayItem) => {
      if (!rawKey) return;
      const { key, weekendTag } = rollWeekendToFriday(rawKey);
      const arr = map.get(key) || [];
      arr.push(build(key, weekendTag));
      map.set(key, arr);
    };
    for (const m of milestones) {
      push(toDateKey(m.dueDate), (_k, weekendTag) => ({
        id: `m-${m.id}`,
        kind: 'milestone',
        title: m.title,
        editable: false,
        weekendTag,
        ref: { milestoneId: m.id },
      }));
    }
    for (const t of tasks) {
      if (t.kind !== 'task') continue;
      push(toDateKey(t.dueDate), (_k, weekendTag) => ({
        id: `t-${t.id}`,
        kind: 'task',
        title: t.title,
        editable: false,
        weekendTag,
        ref: { taskId: t.id },
      }));
    }
    for (const c of customItems) {
      push(c.date, (_k, weekendTag) => ({
        id: `c-${c.id}`,
        kind: 'custom',
        title: c.title,
        time: c.time,
        type: c.type,
        notes: c.notes,
        editable: true,
        weekendTag,
        raw: c,
      }));
    }
    for (const ev of teamEvents) {
      const dateKey = toDateKey(ev.start);
      let time: string | null = null;
      if (!ev.all_day && ev.start) {
        try { time = format(parseISO(ev.start), 'HH:mm:ss'); } catch { time = null; }
      }
      push(dateKey, (_k, weekendTag) => ({
        id: `team-${ev.id}`,
        kind: 'team',
        title: ev.title,
        time,
        editable: false,
        weekendTag,
        team: ev,
      }));
    }
    return map;
  }, [milestones, tasks, customItems, teamEvents]);

  // Visible Mon–Fri days for the 2-week window.
  const days = useMemo(() => {
    const all = eachDayOfInterval({ start: windowStart, end: addDays(windowStart, 13) });
    return all.filter((d) => {
      const dow = getDay(d);
      return dow >= 1 && dow <= 5;
    });
  }, [windowStart]);

  const rangeLabel = useMemo(() => {
    const start = windowStart;
    const end = addDays(windowStart, 11); // Friday of week 2
    const sameMonth = format(start, 'LLL') === format(end, 'LLL');
    const sameYear = format(start, 'yyyy') === format(end, 'yyyy');
    if (sameMonth) return `${format(start, 'MMM d')} – ${format(end, 'd')}, ${format(end, 'yyyy')}`;
    if (sameYear) return `${format(start, 'MMM d')} – ${format(end, 'MMM d')}`;
    return `${format(start, 'MMM d, yyyy')} – ${format(end, 'MMM d, yyyy')}`;
  }, [windowStart]);

  const selectedItems = itemsByDate.get(selectedKey) || [];

  const openAddForm = (dateKey?: string) => {
    setEditingId(null);
    setFormTitle('');
    setFormDate(dateKey || selectedKey);
    setFormOpen(true);
    setTimeout(() => titleRef.current?.focus(), 30);
  };

  const openEditForm = (item: DayItem) => {
    if (!item.raw) return;
    setEditingId(item.raw.id);
    setFormTitle(item.raw.title);
    setFormDate(item.raw.date);
    setFormOpen(true);
    setTimeout(() => titleRef.current?.focus(), 30);
  };

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim() || !formDate) return;
    const payload = {
      title: formTitle.trim(),
      date: formDate,
      time: null,
      notes: null,
      type: 'note' as DealCalendarItemType,
    };
    if (editingId) await updateItem({ id: editingId, updates: payload });
    else await addItem(payload);
    setFormOpen(false);
  };

  // Keyboard nav across the visible Mon–Fri grid.
  const onDayKeyDown = (e: React.KeyboardEvent, day: Date) => {
    const idx = days.findIndex((d) => format(d, 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd'));
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      e.preventDefault();
      const delta = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' ? -5 : 5;
      const nextIdx = idx + delta;
      if (nextIdx >= 0 && nextIdx < days.length) {
        setSelectedKey(format(days[nextIdx], 'yyyy-MM-dd'));
      } else {
        // Step window by a week.
        const shift = nextIdx < 0 ? -7 : 7;
        setWindowStart((w) => addDays(w, shift));
        setSelectedKey(format(addDays(day, delta), 'yyyy-MM-dd'));
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      setSelectedKey(format(day, 'yyyy-MM-dd'));
    } else if (e.key === 'Escape') {
      (e.currentTarget as HTMLElement).blur();
    }
  };

  const handleItemClick = (item: DayItem) => {
    if (item.kind === 'milestone' || item.kind === 'task') {
      onOpenDeal?.();
    } else if (item.editable) {
      openEditForm(item);
    } else if (item.kind === 'team' && item.team?.html_link) {
      window.open(item.team.html_link, '_blank', 'noopener,noreferrer');
    }
  };

  // Swipe support (mobile).
  const touchStartX = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) > 40) {
      setWindowStart((w) => addDays(w, dx < 0 ? 7 : -7));
    }
  };

  // Horizontal wheel scroll → step weeks.
  const wheelAccum = useRef(0);
  const onWheel = (e: React.WheelEvent) => {
    if (Math.abs(e.deltaX) < Math.abs(e.deltaY)) return;
    wheelAccum.current += e.deltaX;
    if (Math.abs(wheelAccum.current) > 60) {
      setWindowStart((w) => addDays(w, wheelAccum.current > 0 ? 7 : -7));
      wheelAccum.current = 0;
    }
  };

  const goToday = () => {
    setWindowStart(defaultWindowStart());
    setSelectedKey(format(new Date(), 'yyyy-MM-dd'));
  };

  return (
    <TooltipProvider>
      <div className="px-5 pt-2 pb-4 min-w-0 border-t border-white/[0.06]">
        {/* Header */}
        <div className="flex items-center justify-between mb-2 gap-2">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setDetailOpen(true); }}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className="group flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground/90 hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
            title="Open full calendar"
          >
            <span>Calendar</span>
            <Maximize2 className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setWindowStart((w) => addDays(w, -7))}
              className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-white/5 text-muted-foreground"
              aria-label="Previous week"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="text-[11px] font-medium text-foreground/90 text-center px-0.5 whitespace-nowrap">
              {rangeLabel}
            </span>
            <button
              type="button"
              onClick={() => setWindowStart((w) => addDays(w, 7))}
              className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-white/5 text-muted-foreground"
              aria-label="Next week"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={goToday}
              className="ml-1 text-[10px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => openAddForm()}
              className="ml-1 inline-flex items-center gap-1 h-6 px-1.5 rounded text-[10px] font-medium border border-white/10 hover:bg-white/5 text-foreground/90"
              aria-label="Add calendar item"
            >
              <Plus className="h-3 w-3" /> Add
            </button>
          </div>
        </div>

        {/* Weekday header */}
        <div className="grid grid-cols-5 mb-1">
          {WEEKDAY_LABELS.map((d) => (
            <div key={d} className="text-center text-[9px] font-medium text-muted-foreground/60 py-0.5">
              {d}
            </div>
          ))}
        </div>

        {/* Grid: 5 columns × 2 rows (Mon–Fri × 2 weeks) */}
        <div
          className="grid grid-cols-5 gap-[3px] touch-pan-y"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          onWheel={onWheel}
        >
          {days.map((day) => {
            const key = format(day, 'yyyy-MM-dd');
            const dayItems = itemsByDate.get(key) || [];
            const today = isToday(day);
            const isSelected = key === selectedKey;
            const visible = dayItems.slice(0, 3);
            const overflow = dayItems.length - visible.length;

            return (
              <Tooltip key={key} delayDuration={300}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => {
                      if (dayItems.length === 0) openAddForm(key);
                      setSelectedKey(key);
                    }}
                    onKeyDown={(e) => onDayKeyDown(e, day)}
                    aria-label={`${format(day, 'EEEE, MMMM d')} — ${dayItems.length} item${dayItems.length === 1 ? '' : 's'}`}
                    className={cn(
                      'relative min-h-[44px] rounded-md flex flex-col items-center justify-start py-1 px-1 transition-colors',
                      'border focus:outline-none focus-visible:ring-1 focus-visible:ring-primary/60',
                      isSelected
                        ? 'border-primary/60 bg-primary/10'
                        : 'border-white/[0.04] hover:bg-white/[0.04] hover:border-white/10',
                    )}
                  >
                    <span
                      className={cn(
                        'text-[10px] leading-none font-medium',
                        today ? 'text-primary' : 'text-foreground/80',
                      )}
                    >
                      {format(day, 'd')}
                    </span>
                    {dayItems.length > 0 && (
                      <div className="mt-auto flex items-center gap-[2px] pb-0.5 flex-wrap justify-center">
                        {visible.map((it) => (
                          <span
                            key={it.id}
                            className={cn('h-1.5 w-1.5 rounded-full', KIND_COLORS[it.kind].dot)}
                          />
                        ))}
                        {overflow > 0 && (
                          <span className="text-[8px] leading-none text-muted-foreground ml-[1px]">+{overflow}</span>
                        )}
                      </div>
                    )}
                  </button>
                </TooltipTrigger>
                {dayItems.length > 0 && (
                  <TooltipContent side="top" className="max-w-[14rem]">
                    <div className="text-[11px] font-medium mb-0.5">{format(day, 'MMM d, yyyy')}</div>
                    <ul className="space-y-0.5">
                      {dayItems.slice(0, 6).map((it) => (
                        <li key={it.id} className="flex items-center gap-1.5 text-[11px]">
                          <span className={cn('h-1.5 w-1.5 rounded-full', KIND_COLORS[it.kind].dot)} />
                          <span className="text-muted-foreground">{KIND_COLORS[it.kind].label}:</span>
                          <span className="truncate max-w-[8rem]">{it.title}</span>
                          {it.weekendTag && (
                            <span className="text-[9px] text-muted-foreground/70">({it.weekendTag})</span>
                          )}
                        </li>
                      ))}
                      {dayItems.length > 6 && (
                        <li className="text-[10px] text-muted-foreground">+{dayItems.length - 6} more</li>
                      )}
                    </ul>
                  </TooltipContent>
                )}
              </Tooltip>
            );
          })}
        </div>

        {/* Selected day detail */}
        <div className="mt-2 pt-2 border-t border-white/[0.05]">
          <div className="flex items-center justify-between mb-1">
            <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/70">
              {format(parseISO(selectedKey), 'EEE, MMM d')}
            </div>
            <button
              type="button"
              onClick={() => openAddForm(selectedKey)}
              className="text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5"
            >
              <Plus className="h-3 w-3" /> add
            </button>
          </div>

          {selectedItems.length === 0 && !formOpen ? (
            <p className="text-[11px] text-muted-foreground/70">No items scheduled.</p>
          ) : (
            <ul className="space-y-1 max-h-[8rem] overflow-y-auto pr-1">
              {selectedItems.map((it) => (
                <li key={it.id} className="flex items-start gap-2 group">
                  <span className={cn('mt-1 h-2 w-0.5 rounded-sm shrink-0', KIND_COLORS[it.kind].bar)} />
                  <button
                    type="button"
                    onClick={() => handleItemClick(it)}
                    className="flex-1 min-w-0 text-left text-[11px] leading-snug"
                  >
                    <span className="text-[9px] uppercase tracking-wider text-muted-foreground mr-1.5">
                      {it.type ? it.type : KIND_COLORS[it.kind].label}
                    </span>
                    <span className="text-foreground">{it.title}</span>
                    {it.time && (
                      <span className="text-muted-foreground"> · {it.time.slice(0, 5)}</span>
                    )}
                    {it.weekendTag && (
                      <span className="text-[9px] text-muted-foreground/70 ml-1">({it.weekendTag})</span>
                    )}
                  </button>
                  {it.kind === 'team' && it.team?.teammate && (() => {
                    const t = it.team.teammate;
                    const name = t.display_name || t.email || 'Teammate';
                    const initials = (name.split(' ').map((s) => s[0]).filter(Boolean).slice(0, 2).join('') || 'T').toUpperCase();
                    const matchLabel = it.team.match.title && it.team.match.domain
                      ? 'Company name & attendee domain match'
                      : it.team.match.title
                        ? 'Company name in title'
                        : 'Attendee email domain match';
                    return (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Avatar className="h-4 w-4 mt-0.5 shrink-0 border border-cyan-400/40">
                            {t.avatar_url && <AvatarImage src={t.avatar_url} alt={name} />}
                            <AvatarFallback className="text-[8px] font-medium bg-cyan-500/20 text-foreground/80">
                              {initials}
                            </AvatarFallback>
                          </Avatar>
                        </TooltipTrigger>
                        <TooltipContent side="left">
                          {name}'s calendar · {matchLabel}
                        </TooltipContent>
                      </Tooltip>
                    );
                  })()}
                  {it.raw?.created_by && (() => {
                    const c = creators[it.raw.created_by];
                    const name = c?.display_name
                      || [c?.first_name, c?.last_name].filter(Boolean).join(' ')
                      || 'Teammate';
                    const initials = (
                      (c?.first_name?.[0] || c?.display_name?.[0] || 'T') +
                      (c?.last_name?.[0] || '')
                    ).toUpperCase();
                    return (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Avatar className="h-4 w-4 mt-0.5 shrink-0 border border-white/10">
                            {c?.avatar_url && <AvatarImage src={c.avatar_url} alt={name} />}
                            <AvatarFallback className="text-[8px] font-medium bg-white/10 text-foreground/80">
                              {initials}
                            </AvatarFallback>
                          </Avatar>
                        </TooltipTrigger>
                        <TooltipContent side="left">Added by {name}</TooltipContent>
                      </Tooltip>
                    );
                  })()}
                  {it.editable ? (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => openEditForm(it)}
                        className="h-5 w-5 inline-flex items-center justify-center rounded hover:bg-white/5 text-muted-foreground"
                        aria-label="Edit item"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteItem(it.raw!.id)}
                        className="h-5 w-5 inline-flex items-center justify-center rounded hover:bg-white/5 text-muted-foreground hover:text-destructive"
                        aria-label="Delete item"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ) : it.kind === 'team' ? null : (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Lock className="h-3 w-3 text-muted-foreground/40 mt-0.5 shrink-0" />
                      </TooltipTrigger>
                      <TooltipContent side="left">Managed by {KIND_COLORS[it.kind].label.toLowerCase()}s — edit in its section.</TooltipContent>
                    </Tooltip>
                  )}
                </li>
              ))}
            </ul>
          )}

          {/* Inline form */}
          {formOpen && (
            <form
              onSubmit={submitForm}
              className="mt-2 rounded-md border border-white/10 bg-white/[0.03] p-2 space-y-1.5"
            >
              <div className="flex items-center gap-1">
                <input
                  ref={titleRef}
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Title"
                  required
                  className="flex-1 bg-transparent text-[11px] px-1.5 py-1 rounded border border-white/10 focus:outline-none focus:border-primary/60 text-foreground placeholder:text-muted-foreground/60"
                />
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-white/5 text-muted-foreground"
                  aria-label="Cancel"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
              <div className="flex items-center justify-between gap-1">
                <input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  required
                  className="bg-transparent text-[10px] px-1.5 py-1 rounded border border-white/10 focus:outline-none focus:border-primary/60 text-foreground"
                />
                <button
                  type="submit"
                  className="inline-flex items-center gap-1 h-6 px-2 rounded text-[10px] font-medium bg-primary/80 hover:bg-primary text-primary-foreground"
                >
                  <Check className="h-3 w-3" /> {editingId ? 'Save' : 'Add'}
                </button>
              </div>
            </form>
          )}
        </div>

        <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="truncate">Calendar — {deal.name}</DialogTitle>
            </DialogHeader>
            <div className="overflow-y-auto pr-1 mt-2 space-y-2">
              {Array.from(itemsByDate.entries())
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([dateKey, items]) => (
                  <div key={`full-${dateKey}`} className="border border-white/[0.06] rounded-md p-3">
                    <div className="text-xs font-semibold text-foreground mb-2">
                      {format(parseISO(dateKey), 'EEEE, MMM d, yyyy')}
                    </div>
                    <ul className="space-y-1.5">
                      {items.map((it) => (
                        <li key={`full-item-${it.id}`} className="flex items-start gap-2 text-sm">
                          <span className={cn('mt-1.5 h-2 w-2 rounded-full shrink-0', KIND_COLORS[it.kind].dot)} />
                          <div className="min-w-0 flex-1">
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-2">
                              {it.type || KIND_COLORS[it.kind].label}
                            </span>
                            <span className="text-foreground">{it.title}</span>
                            {it.time && <span className="text-muted-foreground"> · {it.time.slice(0, 5)}</span>}
                            {it.weekendTag && (
                              <span className="text-[10px] text-muted-foreground/70 ml-1">({it.weekendTag})</span>
                            )}
                            {it.notes && (
                              <div className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">{it.notes}</div>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              {itemsByDate.size === 0 && (
                <p className="text-sm text-muted-foreground italic">No scheduled items in the visible window.</p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}