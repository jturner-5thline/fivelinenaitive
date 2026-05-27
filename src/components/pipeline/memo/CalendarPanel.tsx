import { useMemo, useState, useEffect, useRef } from 'react';
import {
  format, parseISO, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isToday, isSameDay, addMonths, subMonths, addDays,
} from 'date-fns';
import { ChevronLeft, ChevronRight, Plus, Lock, Trash2, Pencil, X, Check } from 'lucide-react';
import type { Deal } from '@/types/deal';
import type { DealTaskItem } from '@/hooks/usePipelineDealTasks';
import { useDealMilestones } from '@/hooks/useDealMilestones';
import { useDealCalendarItems, type DealCalendarItem, type DealCalendarItemType } from '@/hooks/useDealCalendarItems';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface CalendarPanelProps {
  deal: Deal;
  tasks?: DealTaskItem[];
  onOpenDeal?: () => void;
}

type ItemKind = 'milestone' | 'task' | 'custom' | 'lender';

interface DayItem {
  id: string;
  kind: ItemKind;
  title: string;
  time?: string | null;
  type?: DealCalendarItemType;
  notes?: string | null;
  editable: boolean;
  raw?: DealCalendarItem;
  ref?: { milestoneId?: string; taskId?: string };
}

const KIND_COLORS: Record<ItemKind, { dot: string; bar: string; label: string }> = {
  milestone: { dot: 'bg-[hsl(265,85%,65%)]', bar: 'bg-[hsl(265,85%,65%)]', label: 'Milestone' },
  task: { dot: 'bg-blue-500', bar: 'bg-blue-500', label: 'Task' },
  custom: { dot: 'bg-emerald-500', bar: 'bg-emerald-500', label: 'Event' },
  lender: { dot: 'bg-amber-500', bar: 'bg-amber-500', label: 'Lender' },
};

function toDateKey(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  try {
    const d = parseISO(value);
    if (isNaN(d.getTime())) return null;
    return format(d, 'yyyy-MM-dd');
  } catch {
    return null;
  }
}

const WEEK_DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function CalendarPanel({ deal, tasks = [], onOpenDeal }: CalendarPanelProps) {
  const { milestones } = useDealMilestones(deal.id);
  const { items: customItems, addItem, updateItem, deleteItem } = useDealCalendarItems(deal.id);

  const [cursor, setCursor] = useState<Date>(() => new Date());
  const [selectedKey, setSelectedKey] = useState<string>(() => format(new Date(), 'yyyy-MM-dd'));
  const [mobileWeekMode, setMobileWeekMode] = useState<boolean>(false);

  // Add / edit form
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formDate, setFormDate] = useState<string>('');
  const [formTime, setFormTime] = useState<string>('');
  const [formNotes, setFormNotes] = useState<string>('');
  const [formType, setFormType] = useState<DealCalendarItemType>('meeting');
  const titleRef = useRef<HTMLInputElement>(null);

  // Build map: date -> items
  const itemsByDate = useMemo(() => {
    const map = new Map<string, DayItem[]>();
    const push = (key: string | null, item: DayItem) => {
      if (!key) return;
      const arr = map.get(key) || [];
      arr.push(item);
      map.set(key, arr);
    };
    for (const m of milestones) {
      const k = toDateKey(m.dueDate);
      if (!k) continue;
      push(k, {
        id: `m-${m.id}`,
        kind: 'milestone',
        title: m.title,
        editable: false,
        ref: { milestoneId: m.id },
      });
    }
    for (const t of tasks) {
      if (t.kind !== 'task') continue;
      const k = toDateKey(t.dueDate);
      if (!k) continue;
      push(k, {
        id: `t-${t.id}`,
        kind: 'task',
        title: t.title,
        editable: false,
        ref: { taskId: t.id },
      });
    }
    for (const c of customItems) {
      push(c.date, {
        id: `c-${c.id}`,
        kind: 'custom',
        title: c.title,
        time: c.time,
        type: c.type,
        notes: c.notes,
        editable: true,
        raw: c,
      });
    }
    return map;
  }, [milestones, tasks, customItems]);

  // Grid days
  const days = useMemo(() => {
    if (mobileWeekMode) {
      const start = startOfWeek(cursor, { weekStartsOn: 1 });
      return eachDayOfInterval({ start, end: addDays(start, 6) });
    }
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [cursor, mobileWeekMode]);

  const selectedItems = itemsByDate.get(selectedKey) || [];

  const openAddForm = (dateKey?: string) => {
    setEditingId(null);
    setFormTitle('');
    setFormDate(dateKey || selectedKey);
    setFormTime('');
    setFormNotes('');
    setFormType('meeting');
    setFormOpen(true);
    setTimeout(() => titleRef.current?.focus(), 30);
  };

  const openEditForm = (item: DayItem) => {
    if (!item.raw) return;
    setEditingId(item.raw.id);
    setFormTitle(item.raw.title);
    setFormDate(item.raw.date);
    setFormTime(item.raw.time ? item.raw.time.slice(0, 5) : '');
    setFormNotes(item.raw.notes || '');
    setFormType(item.raw.type);
    setFormOpen(true);
    setTimeout(() => titleRef.current?.focus(), 30);
  };

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim() || !formDate) return;
    const payload = {
      title: formTitle.trim(),
      date: formDate,
      time: formTime ? `${formTime}:00` : null,
      notes: formNotes.trim() || null,
      type: formType,
    };
    if (editingId) {
      await updateItem({ id: editingId, updates: payload });
    } else {
      await addItem(payload);
    }
    setFormOpen(false);
  };

  // Keyboard nav on grid
  const onDayKeyDown = (e: React.KeyboardEvent, day: Date) => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      e.preventDefault();
      const delta = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' ? -7 : 7;
      const next = addDays(day, delta);
      setSelectedKey(format(next, 'yyyy-MM-dd'));
      if (!isSameMonth(next, cursor) && !mobileWeekMode) setCursor(next);
      if (mobileWeekMode) setCursor(next);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      setSelectedKey(format(day, 'yyyy-MM-dd'));
    } else if (e.key === 'Escape') {
      (e.currentTarget as HTMLElement).blur();
    }
  };

  // Click on item: deep link behavior
  const handleItemClick = (item: DayItem) => {
    if (item.kind === 'milestone' || item.kind === 'task') {
      onOpenDeal?.();
    } else if (item.editable) {
      openEditForm(item);
    }
  };

  return (
    <TooltipProvider>
      <div className="px-5 pt-2 pb-4 min-w-0 border-t border-white/[0.06]">
        {/* Header */}
        <div className="flex items-center justify-between mb-2 gap-2">
          <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/80">
            Calendar
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setCursor(mobileWeekMode ? addDays(cursor, -7) : subMonths(cursor, 1))}
              className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-white/5 text-muted-foreground"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="text-[11px] font-medium text-foreground/90 min-w-[5.5rem] text-center">
              {format(cursor, 'MMM yyyy')}
            </span>
            <button
              type="button"
              onClick={() => setCursor(mobileWeekMode ? addDays(cursor, 7) : addMonths(cursor, 1))}
              className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-white/5 text-muted-foreground"
              aria-label="Next month"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => openAddForm()}
              className="ml-1 inline-flex items-center gap-1 h-6 px-1.5 rounded text-[10px] font-medium border border-white/10 hover:bg-white/5 text-foreground/90"
              aria-label="Add calendar item"
            >
              <Plus className="h-3 w-3" /> Add
            </button>
            <button
              type="button"
              onClick={() => setMobileWeekMode((v) => !v)}
              className="sm:hidden ml-1 text-[10px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
            >
              {mobileWeekMode ? 'View month' : 'Week'}
            </button>
          </div>
        </div>

        {/* Weekday header */}
        <div className="grid grid-cols-7 mb-1">
          {WEEK_DAYS.map((d, i) => (
            <div key={i} className="text-center text-[9px] font-medium text-muted-foreground/60 py-0.5">
              {d}
            </div>
          ))}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-7 gap-[2px]">
          {days.map((day) => {
            const key = format(day, 'yyyy-MM-dd');
            const dayItems = itemsByDate.get(key) || [];
            const inMonth = mobileWeekMode || isSameMonth(day, cursor);
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
                      if (dayItems.length === 0) {
                        openAddForm(key);
                      }
                      setSelectedKey(key);
                    }}
                    onKeyDown={(e) => onDayKeyDown(e, day)}
                    aria-label={`${format(day, 'EEEE, MMMM d')} — ${dayItems.length} item${dayItems.length === 1 ? '' : 's'}`}
                    className={cn(
                      'relative aspect-square min-h-[34px] rounded-md flex flex-col items-center justify-start py-1 transition-colors',
                      'border focus:outline-none focus-visible:ring-1 focus-visible:ring-primary/60',
                      isSelected
                        ? 'border-primary/60 bg-primary/10'
                        : 'border-white/[0.04] hover:bg-white/[0.04] hover:border-white/10',
                      !inMonth && 'opacity-30',
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
                      <div className="mt-auto flex items-center gap-[2px] pb-0.5">
                        {visible.map((it) => (
                          <span
                            key={it.id}
                            className={cn('h-1 w-1 rounded-full', KIND_COLORS[it.kind].dot)}
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
                  </button>
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
                  ) : (
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
              <div className="flex items-center gap-1">
                <input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  required
                  className="bg-transparent text-[10px] px-1.5 py-1 rounded border border-white/10 focus:outline-none focus:border-primary/60 text-foreground"
                />
                <input
                  type="time"
                  value={formTime}
                  onChange={(e) => setFormTime(e.target.value)}
                  className="bg-transparent text-[10px] px-1.5 py-1 rounded border border-white/10 focus:outline-none focus:border-primary/60 text-foreground"
                />
                <select
                  value={formType}
                  onChange={(e) => setFormType(e.target.value as DealCalendarItemType)}
                  className="bg-card text-[10px] px-1.5 py-1 rounded border border-white/10 focus:outline-none focus:border-primary/60 text-foreground"
                >
                  <option value="meeting">Meeting</option>
                  <option value="deadline">Deadline</option>
                  <option value="reminder">Reminder</option>
                  <option value="note">Note</option>
                </select>
              </div>
              <textarea
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder="Notes (optional)"
                rows={2}
                className="w-full bg-transparent text-[11px] px-1.5 py-1 rounded border border-white/10 focus:outline-none focus:border-primary/60 text-foreground placeholder:text-muted-foreground/60 resize-none"
              />
              <div className="flex justify-end">
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
      </div>
    </TooltipProvider>
  );
}