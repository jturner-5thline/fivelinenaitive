import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { CalendarIcon, Loader2, UserCheck, Zap, Sun, Sunrise, CalendarDays, Flame, Coffee, Repeat, Briefcase, Search, X, Sparkles } from 'lucide-react';
import { addDays, format, isSameDay, nextMonday } from 'date-fns';
import { cn } from '@/lib/utils';
import { type TeamMember } from '@/hooks/useTeamMembers';
import { useAssigneeOpenTaskCounts } from '@/hooks/useAssigneeOpenTaskCounts';
import { useDealsContext } from '@/contexts/DealsContext';
import type { Deal } from '@/types/deal';
import { toast } from 'sonner';

export interface QuickTaskInput {
  title: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  due_date: string | null;
  status: 'not_started' | 'in_progress' | 'blocked' | 'complete';
  assigned_to: string;
  recurrence_rule: string | null;
  /** YYYY-MM-DD; if set, no new occurrence is generated past this date. */
  recurrence_end_date: string | null;
  /** Optional deal association — surfaces task under deal's Tasks tab. */
  deal_id: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCreate: (input: QuickTaskInput) => Promise<void> | void;
  teamMembers: TeamMember[];
  currentUserId: string;
}

const JUNK_NAMES = ['test', 'asdf', 'aaa', 'abc', 'xxx', 'zzz', 'asd', 'qwe', 'foo', 'bar'];

const LAST_ASSIGNEE_KEY = 'quickCreateTask:lastAssigneeId';

const readLastAssignee = (fallback: string): string => {
  if (typeof window === 'undefined') return fallback;
  try {
    return window.localStorage.getItem(LAST_ASSIGNEE_KEY) || fallback;
  } catch {
    return fallback;
  }
};

// Mirrors calculateNextDueDate() in useTasks.ts so the modal can preview
// the next occurrence without round-tripping through the hook layer.
function previewNextOccurrence(anchor: Date, rule: string): Date | null {
  const d = new Date(anchor);
  d.setHours(0, 0, 0, 0);
  if (rule.startsWith('every:')) {
    const [, nStr, unit] = rule.split(':');
    const n = Math.max(1, Math.min(365, parseInt(nStr, 10) || 1));
    if (unit === 'days') { d.setDate(d.getDate() + n); return d; }
    if (unit === 'weeks') { d.setDate(d.getDate() + n * 7); return d; }
    if (unit === 'months') { d.setMonth(d.getMonth() + n); return d; }
    if (unit === 'years') { d.setFullYear(d.getFullYear() + n); return d; }
    return null;
  }
  switch (rule) {
    case 'daily':     d.setDate(d.getDate() + 1); return d;
    case 'weekdays':
      do { d.setDate(d.getDate() + 1); } while (d.getDay() === 0 || d.getDay() === 6);
      return d;
    case 'weekly':    d.setDate(d.getDate() + 7); return d;
    case 'biweekly':  d.setDate(d.getDate() + 14); return d;
    case 'monthly':   d.setMonth(d.getMonth() + 1); return d;
    case 'quarterly': d.setMonth(d.getMonth() + 3); return d;
    default: return null;
  }
}

export function QuickCreateTaskDialog({ open, onClose, onCreate, teamMembers, currentUserId }: Props) {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<QuickTaskInput['priority']>('medium');
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined);
  const [status, setStatus] = useState<QuickTaskInput['status']>('not_started');
  const [assignedTo, setAssignedTo] = useState<string>(() => readLastAssignee(currentUserId));
  const [recurrence, setRecurrence] = useState<string | null>(null);
  // Custom "Every N days/weeks" — only applies when the Custom chip is active.
  const [customN, setCustomN] = useState<number>(3);
  const [customUnit, setCustomUnit] = useState<'days' | 'weeks' | 'months' | 'years'>('days');
  // When true, day-based recurrences (daily/weekdays/weekly) anchor to the
  // selected due date. If no due date is set when this is enabled, today is
  // used as the anchor.
  const [startFromDueDate, setStartFromDueDate] = useState(false);
  // End conditions for the recurring series.
  const [endMode, setEndMode] = useState<'never' | 'on_date' | 'after_n'>('never');
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [endAfterN, setEndAfterN] = useState<number>(5);
  const [warning, setWarning] = useState('');
  const [confirmedJunk, setConfirmedJunk] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Deal association — optional. Auto-suggested from the title via fuzzy
  // matching against deal name / company / lender / contact, then overridable
  // through a type-ahead picker that respects RLS (deals already filtered
  // server-side via DealsContext).
  const { deals: allDeals } = useDealsContext();
  const [dealId, setDealId] = useState<string | null>(null);
  const [dealPickerOpen, setDealPickerOpen] = useState(false);
  const [dealQuery, setDealQuery] = useState('');
  const [debouncedTitle, setDebouncedTitle] = useState('');

  useEffect(() => {
    if (open) {
      setTitle('');
      setPriority('medium');
      setDueDate(undefined);
      setStatus('not_started');
      const remembered = readLastAssignee(currentUserId);
      const isValid = remembered === currentUserId || teamMembers.some(m => m.id === remembered);
      setAssignedTo(isValid ? remembered : currentUserId);
      setRecurrence(null);
      setCustomN(3);
      setCustomUnit('days');
      setStartFromDueDate(false);
      setEndMode('never');
      setEndDate(undefined);
      setEndAfterN(5);
      setWarning('');
      setConfirmedJunk(false);
      setSubmitting(false);
      setDealId(null);
      setDealPickerOpen(false);
      setDealQuery('');
      setDebouncedTitle('');
    }
  }, [open, currentUserId, teamMembers]);

  // ─── One-click presets ────────────────────────────────────────────────
  // Combo presets snap several fields at once (priority + due + status).
  // Applying a combo also clears conflicting state: any prior recurrence
  // rule (the combo redefines the schedule) and stale validation warnings.
  const applyCombo = (fn: () => void) => {
    fn();
    setRecurrence(null);
    setStartFromDueDate(false);
    setEndMode('never');
    setEndDate(undefined);
    setWarning('');
    setConfirmedJunk(false);
  };
  const combos: { id: string; label: string; icon: React.ReactNode; tone: string; apply: () => void }[] = [
    {
      id: 'urgent_today',
      label: 'Urgent · Today',
      icon: <Flame className="h-3 w-3" />,
      tone: '#e57373',
      apply: () => applyCombo(() => { setPriority('urgent'); setDueDate(new Date()); setStatus('not_started'); }),
    },
    {
      id: 'high_tomorrow',
      label: 'High · Tomorrow',
      icon: <Zap className="h-3 w-3" />,
      tone: '#e89b6c',
      apply: () => applyCombo(() => { setPriority('high'); setDueDate(addDays(new Date(), 1)); setStatus('not_started'); }),
    },
    {
      id: 'this_week',
      label: 'Medium · This week',
      icon: <CalendarDays className="h-3 w-3" />,
      tone: '#7eb8f7',
      apply: () => applyCombo(() => { setPriority('medium'); setDueDate(addDays(new Date(), 5)); setStatus('not_started'); }),
    },
    {
      id: 'quick_todo',
      label: 'Quick todo',
      icon: <Coffee className="h-3 w-3" />,
      tone: '#9aa3b6',
      apply: () => applyCombo(() => { setPriority('low'); setDueDate(undefined); setStatus('not_started'); }),
    },
  ];

  // Per-field due-date presets
  const datePresets = [
    { id: 'today',    label: 'Today',    icon: <Sun className="h-3 w-3" />,         value: new Date() },
    { id: 'tomorrow', label: 'Tomorrow', icon: <Sunrise className="h-3 w-3" />,     value: addDays(new Date(), 1) },
    { id: 'monday',   label: 'Next Mon', icon: <CalendarDays className="h-3 w-3" />, value: nextMonday(new Date()) },
    { id: 'week',     label: '+1 week',  icon: <CalendarDays className="h-3 w-3" />, value: addDays(new Date(), 7) },
  ];
  const dateMatches = (preset: Date) => !!dueDate && isSameDay(dueDate, preset);

  const priorityPresets: { value: QuickTaskInput['priority']; label: string; tone: string }[] = [
    { value: 'urgent', label: 'Urgent', tone: '#e57373' },
    { value: 'high',   label: 'High',   tone: '#e89b6c' },
    { value: 'medium', label: 'Medium', tone: '#d4a45a' },
    { value: 'low',    label: 'Low',    tone: '#7a8194' },
  ];
  const statusPresets: { value: QuickTaskInput['status']; label: string; tone: string }[] = [
    { value: 'not_started', label: 'Not Started', tone: '#7a8194' },
    { value: 'in_progress', label: 'In Progress', tone: '#7eb8f7' },
    { value: 'blocked',     label: 'Blocked',     tone: '#e57373' },
    { value: 'complete',    label: 'Complete',    tone: '#7fc89a' },
  ];

  const handleSubmit = async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      setWarning('Task name is required.');
      return;
    }
    if (!confirmedJunk && (trimmed.length < 3 || JUNK_NAMES.includes(trimmed.toLowerCase()))) {
      setWarning('Please enter a descriptive task name (at least 3 characters). Click Create again to confirm.');
      setConfirmedJunk(true);
      return;
    }
    setSubmitting(true);
    try {
      // Resolve the series end date based on the chosen end condition.
      // For "after_n" we step the recurrence engine N times from the anchor.
      let resolvedEndDate: string | null = null;
      if (recurrence) {
        const anchor = dueDate ?? new Date();
        if (endMode === 'on_date' && endDate) {
          resolvedEndDate = format(endDate, 'yyyy-MM-dd');
        } else if (endMode === 'after_n') {
          const safeN = Math.max(1, Math.min(365, Math.floor(endAfterN)));
          // The first task counts as occurrence #1, so we advance N-1 times
          // and use that date as the inclusive end-of-series boundary.
          let cursor: Date | null = new Date(anchor);
          for (let i = 1; i < safeN; i++) {
            const next = previewNextOccurrence(cursor!, recurrence);
            if (!next) { cursor = null; break; }
            cursor = next;
          }
          if (cursor) resolvedEndDate = format(cursor, 'yyyy-MM-dd');
        }
      }
      await onCreate({
        title: trimmed,
        priority,
        due_date: dueDate ? format(dueDate, 'yyyy-MM-dd') : null,
        status,
        assigned_to: assignedTo,
        recurrence_rule: recurrence,
        recurrence_end_date: resolvedEndDate,
        deal_id: dealId,
      });
      try {
        window.localStorage.setItem(LAST_ASSIGNEE_KEY, assignedTo);
      } catch {
        /* ignore storage errors */
      }
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const assignee = teamMembers.find(m => m.id === assignedTo);
  const { data: openCounts = {} } = useAssigneeOpenTaskCounts(open);
  const assigneeCount = openCounts[assignedTo] ?? 0;
  const workloadTone = (n: number) =>
    n >= 15 ? '#e57373' : n >= 8 ? '#e89b6c' : n >= 3 ? '#d4a45a' : '#7fc89a';

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        className="sm:max-w-[480px] p-0 border"
        style={{ backgroundColor: '#12151b', borderColor: 'rgba(255,255,255,0.06)' }}
      >
        <DialogHeader className="px-5 pt-5 pb-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
          <DialogTitle className="text-[15px] font-semibold tracking-tight" style={{ color: '#eef1f6' }}>
            New Task
          </DialogTitle>
        </DialogHeader>

        <div className="px-5 py-4 space-y-4">
          {/* Combo presets — one-click multi-field setup */}
          <div className="flex flex-wrap gap-1.5">
            {combos.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={c.apply}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium border transition-colors hover:brightness-110"
                style={{ color: c.tone, borderColor: `${c.tone}33`, backgroundColor: `${c.tone}10` }}
                title={`Apply "${c.label}" preset`}
              >
                {c.icon}
                {c.label}
              </button>
            ))}
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-wide font-medium" style={{ color: '#7a8194' }}>
              Task name
            </label>
            <Input
              autoFocus
              value={title}
              onChange={(e) => { setTitle(e.target.value); setWarning(''); setConfirmedJunk(false); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void handleSubmit();
                }
              }}
              placeholder="What needs to be done?"
              className="h-9 text-sm text-white placeholder:text-[#7a8194]"
              style={{ backgroundColor: 'rgba(20,24,32,0.65)', border: '1px solid rgba(255,255,255,0.07)' }}
            />
            {warning && <p className="text-[11px]" style={{ color: '#e57373' }}>{warning}</p>}
          </div>

          {/* Quick priority + status pills */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-wide font-medium" style={{ color: '#7a8194' }}>Priority</label>
              <div className="flex flex-wrap gap-1">
                {priorityPresets.map(p => {
                  const active = priority === p.value;
                  return (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setPriority(p.value)}
                      className="px-2 py-1 rounded-md text-[11px] font-medium border transition-colors"
                      style={{
                        color: active ? p.tone : '#9aa3b6',
                        borderColor: active ? `${p.tone}66` : 'rgba(255,255,255,0.08)',
                        backgroundColor: active ? `${p.tone}1f` : 'rgba(20,24,32,0.65)',
                      }}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-wide font-medium" style={{ color: '#7a8194' }}>Status</label>
              <div className="flex flex-wrap gap-1">
                {statusPresets.map(s => {
                  const active = status === s.value;
                  return (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setStatus(s.value)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium border transition-colors"
                      style={{
                        color: active ? s.tone : '#9aa3b6',
                        borderColor: active ? `${s.tone}66` : 'rgba(255,255,255,0.08)',
                        backgroundColor: active ? `${s.tone}1a` : 'rgba(20,24,32,0.65)',
                      }}
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.tone }} />
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Quick due-date presets + full picker fallback */}
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-wide font-medium" style={{ color: '#7a8194' }}>Due date</label>
            <div className="flex flex-wrap gap-1.5">
              {datePresets.map(p => {
                const active = dateMatches(p.value);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setDueDate(active ? undefined : p.value)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] border transition-colors"
                    style={{
                      color: active ? '#cfe3ff' : '#9aa3b6',
                      borderColor: active ? 'rgba(126,184,247,0.45)' : 'rgba(255,255,255,0.08)',
                      backgroundColor: active ? 'rgba(126,184,247,0.14)' : 'rgba(20,24,32,0.65)',
                    }}
                  >
                    {p.icon}
                    {p.label}
                  </button>
                );
              })}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="inline-flex items-center gap-1 px-2 py-1 h-auto rounded-md text-[11px] font-normal border"
                    style={{
                      color: dueDate && !datePresets.some(p => isSameDay(p.value, dueDate)) ? '#cfe3ff' : '#9aa3b6',
                      borderColor: 'rgba(255,255,255,0.08)',
                      backgroundColor: 'rgba(20,24,32,0.65)',
                    }}
                  >
                    <CalendarIcon className="h-3 w-3" />
                    {dueDate && !datePresets.some(p => isSameDay(p.value, dueDate))
                      ? format(dueDate, 'MMM d')
                      : 'Pick…'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dueDate}
                    onSelect={setDueDate}
                    initialFocus
                    className={cn('p-3 pointer-events-auto')}
                  />
                </PopoverContent>
              </Popover>
              {dueDate && (
                <button
                  type="button"
                  onClick={() => setDueDate(undefined)}
                  className="inline-flex items-center px-2 py-1 rounded-md text-[11px] border transition-colors hover:text-[#e57373]"
                  style={{ color: '#7a8194', borderColor: 'rgba(255,255,255,0.06)', backgroundColor: 'transparent' }}
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Recurrence */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label className="text-[10px] uppercase tracking-wide font-medium flex items-center gap-1" style={{ color: '#7a8194' }}>
                <Repeat className="h-3 w-3" /> Repeat
              </label>
              {recurrence && (() => {
                const anchor = dueDate ?? new Date();
                const next = previewNextOccurrence(anchor, recurrence);
                if (!next) return null;
                return (
                  <span
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border"
                    style={{
                      color: '#cfe3ff',
                      borderColor: 'rgba(126,184,247,0.35)',
                      backgroundColor: 'rgba(126,184,247,0.10)',
                    }}
                    title={`After completion, the next task will be due ${format(next, 'EEE, MMM d, yyyy')}${dueDate ? '' : ' (anchored to today since no due date is set)'}`}
                  >
                    Next: {format(next, 'EEE, MMM d')}
                    {!dueDate && (
                      <span style={{ color: '#7a8194' }}>· from today</span>
                    )}
                  </span>
                );
              })()}
            </div>
            <div className="flex flex-wrap gap-1">
              {[
                { value: null, label: 'None' },
                { value: 'daily', label: 'Daily' },
                { value: 'weekdays', label: 'Weekdays' },
                { value: 'weekly', label: 'Weekly' },
                { value: 'biweekly', label: 'Biweekly' },
                { value: 'monthly', label: 'Monthly' },
                { value: 'quarterly', label: 'Quarterly' },
                { value: 'custom', label: 'Custom…' },
              ].map(opt => {
                const isCustomChip = opt.value === 'custom';
                const isCustomRule = !!recurrence && recurrence.startsWith('every:');
                const active = isCustomChip
                  ? isCustomRule
                  : recurrence === opt.value;
                return (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => {
                      if (isCustomChip) {
                        setRecurrence(`every:${customN}:${customUnit}`);
                      } else {
                        setRecurrence(opt.value);
                        // Clearing recurrence also disables the anchor toggle
                        // so it can't apply when there's nothing to anchor.
                        if (!opt.value) setStartFromDueDate(false);
                      }
                    }}
                    className="px-2 py-1 rounded-md text-[11px] font-medium border transition-colors"
                    style={{
                      color: active ? '#cfe3ff' : '#9aa3b6',
                      borderColor: active ? 'rgba(126,184,247,0.45)' : 'rgba(255,255,255,0.08)',
                      backgroundColor: active ? 'rgba(126,184,247,0.14)' : 'rgba(20,24,32,0.65)',
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            {recurrence && recurrence.startsWith('every:') && (
              <div
                className="flex items-center gap-2 mt-1 px-2 py-1.5 rounded-md border"
                style={{ borderColor: 'rgba(126,184,247,0.25)', backgroundColor: 'rgba(126,184,247,0.06)' }}
              >
                <span className="text-[11px]" style={{ color: '#9aa3b6' }}>Every</span>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={customN}
                  onChange={(e) => {
                    const n = Math.max(1, Math.min(365, parseInt(e.target.value, 10) || 1));
                    setCustomN(n);
                    setRecurrence(`every:${n}:${customUnit}`);
                  }}
                  className="w-14 h-7 px-1.5 rounded border text-[12px] text-center"
                  style={{
                    backgroundColor: 'rgba(20,24,32,0.85)',
                    borderColor: 'rgba(255,255,255,0.08)',
                    color: '#cfe3ff',
                  }}
                />
                <div className="flex gap-1">
                  {(['days', 'weeks', 'months', 'years'] as const).map(u => {
                    const uActive = customUnit === u;
                    return (
                      <button
                        key={u}
                        type="button"
                        onClick={() => {
                          setCustomUnit(u);
                          setRecurrence(`every:${customN}:${u}`);
                        }}
                        className="px-2 py-1 rounded text-[11px] font-medium border transition-colors"
                        style={{
                          color: uActive ? '#cfe3ff' : '#9aa3b6',
                          borderColor: uActive ? 'rgba(126,184,247,0.45)' : 'rgba(255,255,255,0.08)',
                          backgroundColor: uActive ? 'rgba(126,184,247,0.14)' : 'rgba(20,24,32,0.65)',
                        }}
                      >
                        {u}
                      </button>
                    );
                  })}
                </div>
                <span className="text-[10px] ml-auto" style={{ color: '#7a8194' }}>
                  Next task generated on completion
                </span>
              </div>
            )}
            {recurrence && (recurrence === 'daily' || recurrence === 'weekdays' || recurrence === 'weekly' || recurrence.startsWith('every:')) && (
              <label
                className="flex items-center gap-2 text-[11px] cursor-pointer select-none mt-1"
                style={{ color: startFromDueDate ? '#cfe3ff' : '#9aa3b6' }}
                title="Anchor the recurring cycle to the selected due date"
              >
                <input
                  type="checkbox"
                  checked={startFromDueDate}
                  onChange={(e) => {
                    const next = e.target.checked;
                    setStartFromDueDate(next);
                    // If turning on without a due date, anchor to today
                    if (next && !dueDate) setDueDate(new Date());
                  }}
                  className="h-3 w-3 accent-[#7eb8f7]"
                />
                <span>
                  Starting from due date
                  {startFromDueDate && dueDate && (
                    <span className="ml-1" style={{ color: '#7a8194' }}>
                      · anchored to {format(dueDate, 'MMM d')}
                    </span>
                  )}
                </span>
              </label>
            )}
            {recurrence && !dueDate && (
              <p className="text-[10px]" style={{ color: '#e89b6c' }}>
                Tip: set a due date — the next task is generated when this one is completed.
              </p>
            )}
            {recurrence && (
              <div className="mt-1 space-y-1">
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-[10px] uppercase tracking-wide font-medium mr-1" style={{ color: '#7a8194' }}>
                    Ends
                  </span>
                  {([
                    { v: 'never',    l: 'Never' },
                    { v: 'on_date',  l: 'On date' },
                    { v: 'after_n',  l: 'After…' },
                  ] as const).map(opt => {
                    const active = endMode === opt.v;
                    return (
                      <button
                        key={opt.v}
                        type="button"
                        onClick={() => {
                          setEndMode(opt.v);
                          if (opt.v === 'on_date' && !endDate) {
                            // Sensible default: 90 days out from anchor
                            setEndDate(addDays(dueDate ?? new Date(), 90));
                          }
                        }}
                        className="px-2 py-0.5 rounded text-[11px] font-medium border transition-colors"
                        style={{
                          color: active ? '#cfe3ff' : '#9aa3b6',
                          borderColor: active ? 'rgba(126,184,247,0.45)' : 'rgba(255,255,255,0.08)',
                          backgroundColor: active ? 'rgba(126,184,247,0.14)' : 'rgba(20,24,32,0.65)',
                        }}
                      >
                        {opt.l}
                      </button>
                    );
                  })}
                  {endMode === 'on_date' && (
                    <input
                      type="date"
                      value={endDate ? format(endDate, 'yyyy-MM-dd') : ''}
                      min={dueDate ? format(dueDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd')}
                      onChange={(e) => {
                        const v = e.target.value;
                        setEndDate(v ? new Date(v + 'T00:00:00') : undefined);
                      }}
                      className="h-7 px-2 rounded border text-[11px]"
                      style={{
                        backgroundColor: 'rgba(20,24,32,0.85)',
                        borderColor: 'rgba(255,255,255,0.08)',
                        color: '#cfe3ff',
                        colorScheme: 'dark',
                      }}
                    />
                  )}
                  {endMode === 'after_n' && (
                    <div className="inline-flex items-center gap-1">
                      <input
                        type="number"
                        min={1}
                        max={365}
                        value={endAfterN}
                        onChange={(e) => {
                          const n = Math.max(1, Math.min(365, parseInt(e.target.value, 10) || 1));
                          setEndAfterN(n);
                        }}
                        className="w-14 h-7 px-1.5 rounded border text-[12px] text-center"
                        style={{
                          backgroundColor: 'rgba(20,24,32,0.85)',
                          borderColor: 'rgba(255,255,255,0.08)',
                          color: '#cfe3ff',
                        }}
                      />
                      <span className="text-[11px]" style={{ color: '#9aa3b6' }}>occurrences</span>
                    </div>
                  )}
                </div>
                {(() => {
                  if (endMode === 'never' || !recurrence) return null;
                  const anchor = dueDate ?? new Date();
                  let resolved: Date | null = null;
                  if (endMode === 'on_date' && endDate) resolved = endDate;
                  if (endMode === 'after_n') {
                    let cursor: Date | null = new Date(anchor);
                    const safeN = Math.max(1, Math.min(365, Math.floor(endAfterN)));
                    for (let i = 1; i < safeN; i++) {
                      const next = previewNextOccurrence(cursor!, recurrence);
                      if (!next) { cursor = null; break; }
                      cursor = next;
                    }
                    resolved = cursor;
                  }
                  if (!resolved) return null;
                  return (
                    <p className="text-[10px]" style={{ color: '#7a8194' }}>
                      Series ends on <span style={{ color: '#cfe3ff' }}>{format(resolved, 'EEE, MMM d, yyyy')}</span>
                      {endMode === 'after_n' && <> · {endAfterN} occurrence{endAfterN === 1 ? '' : 's'}</>}
                    </p>
                  );
                })()}
              </div>
            )}
          </div>

          {/* Assignee */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] uppercase tracking-wide font-medium" style={{ color: '#7a8194' }}>Assignee</label>
              {assignedTo !== currentUserId && (
                <button
                  type="button"
                  onClick={() => {
                    setAssignedTo(currentUserId);
                    toast.success('Assigned to you');
                  }}
                  className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded hover:bg-[rgba(126,184,247,0.1)] transition-colors"
                  style={{ color: '#7eb8f7' }}
                  title="Assign this task to me"
                >
                  <UserCheck className="h-2.5 w-2.5" />
                  Assign to me
                </button>
              )}
            </div>
            <Select value={assignedTo} onValueChange={setAssignedTo}>
              <SelectTrigger className="h-9 text-sm text-white" style={{ backgroundColor: 'rgba(20,24,32,0.65)', borderColor: 'rgba(255,255,255,0.07)' }}>
                <div className="flex items-center gap-2 truncate w-full">
                  {assignee && (
                    <Avatar className="h-5 w-5">
                      {assignee.avatar_url && <AvatarImage src={assignee.avatar_url} />}
                      <AvatarFallback className="text-[8px]" style={{ backgroundColor: 'rgba(126,184,247,0.18)', color: '#cfe3ff' }}>
                        {assignee.display_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  )}
                  <span className="truncate">{assignee?.display_name || 'Select…'}</span>
                  {assignee && (
                    <span
                      className="ml-auto inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium"
                      style={{
                        color: workloadTone(assigneeCount),
                        backgroundColor: `${workloadTone(assigneeCount)}1a`,
                        border: `1px solid ${workloadTone(assigneeCount)}33`,
                      }}
                      title={`${assigneeCount} open task${assigneeCount === 1 ? '' : 's'}`}
                    >
                      {assigneeCount}
                    </span>
                  )}
                </div>
              </SelectTrigger>
              <SelectContent>
                {[...teamMembers]
                  .sort((a, b) => (openCounts[a.id] ?? 0) - (openCounts[b.id] ?? 0))
                  .map(m => {
                    const n = openCounts[m.id] ?? 0;
                    const tone = workloadTone(n);
                    return (
                      <SelectItem key={m.id} value={m.id} className="text-xs">
                        <span className="inline-flex items-center gap-2 w-full">
                          <span className="truncate">
                            {m.display_name}{m.id === currentUserId ? ' (me)' : ''}
                          </span>
                          <span
                            className="ml-auto inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium"
                            style={{
                              color: tone,
                              backgroundColor: `${tone}1a`,
                              border: `1px solid ${tone}33`,
                            }}
                            title={`${n} open task${n === 1 ? '' : 's'}`}
                          >
                            {n} open
                          </span>
                        </span>
                      </SelectItem>
                    );
                  })}
              </SelectContent>
            </Select>
          </div>

        </div>

        <DialogFooter className="px-5 py-3 border-t flex items-center justify-between gap-2 sm:justify-between" style={{ borderColor: 'rgba(255,255,255,0.05)', backgroundColor: 'rgba(15,18,22,0.6)' }}>
          <span className="text-[10px]" style={{ color: '#5b6173' }}>⌘↵ to create</span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs gap-1.5 rounded-md font-semibold border"
              style={{
                background: 'linear-gradient(180deg, rgba(126,184,247,0.22) 0%, rgba(80,135,210,0.22) 100%)',
                color: '#eaf2ff',
                borderColor: 'rgba(126,184,247,0.35)',
              }}
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Create task
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}