import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { CalendarIcon, Loader2, UserCheck, Zap, Sun, Sunrise, CalendarDays, Flame, Coffee, Repeat } from 'lucide-react';
import { addDays, format, isSameDay, nextMonday } from 'date-fns';
import { cn } from '@/lib/utils';
import { type TeamMember } from '@/hooks/useTeamMembers';
import { useAssigneeOpenTaskCounts } from '@/hooks/useAssigneeOpenTaskCounts';

export interface QuickTaskInput {
  title: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  due_date: string | null;
  status: 'not_started' | 'in_progress' | 'blocked' | 'complete';
  assigned_to: string;
  recurrence_rule: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCreate: (input: QuickTaskInput) => Promise<void> | void;
  teamMembers: TeamMember[];
  currentUserId: string;
}

const JUNK_NAMES = ['test', 'asdf', 'aaa', 'abc', 'xxx', 'zzz', 'asd', 'qwe', 'foo', 'bar'];

export function QuickCreateTaskDialog({ open, onClose, onCreate, teamMembers, currentUserId }: Props) {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<QuickTaskInput['priority']>('medium');
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined);
  const [status, setStatus] = useState<QuickTaskInput['status']>('not_started');
  const [assignedTo, setAssignedTo] = useState<string>(currentUserId);
  const [recurrence, setRecurrence] = useState<string | null>(null);
  const [warning, setWarning] = useState('');
  const [confirmedJunk, setConfirmedJunk] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle('');
      setPriority('medium');
      setDueDate(undefined);
      setStatus('not_started');
      setAssignedTo(currentUserId);
      setRecurrence(null);
      setWarning('');
      setConfirmedJunk(false);
      setSubmitting(false);
    }
  }, [open, currentUserId]);

  // ─── One-click presets ────────────────────────────────────────────────
  // Combo presets snap several fields at once (priority + due + status).
  const combos: { id: string; label: string; icon: React.ReactNode; tone: string; apply: () => void }[] = [
    {
      id: 'urgent_today',
      label: 'Urgent · Today',
      icon: <Flame className="h-3 w-3" />,
      tone: '#e57373',
      apply: () => { setPriority('urgent'); setDueDate(new Date()); setStatus('not_started'); },
    },
    {
      id: 'high_tomorrow',
      label: 'High · Tomorrow',
      icon: <Zap className="h-3 w-3" />,
      tone: '#e89b6c',
      apply: () => { setPriority('high'); setDueDate(addDays(new Date(), 1)); setStatus('not_started'); },
    },
    {
      id: 'this_week',
      label: 'Medium · This week',
      icon: <CalendarDays className="h-3 w-3" />,
      tone: '#7eb8f7',
      apply: () => { setPriority('medium'); setDueDate(addDays(new Date(), 5)); setStatus('not_started'); },
    },
    {
      id: 'quick_todo',
      label: 'Quick todo',
      icon: <Coffee className="h-3 w-3" />,
      tone: '#9aa3b6',
      apply: () => { setPriority('low'); setDueDate(undefined); setStatus('not_started'); },
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
      await onCreate({
        title: trimmed,
        priority,
        due_date: dueDate ? format(dueDate, 'yyyy-MM-dd') : null,
        status,
        assigned_to: assignedTo,
        recurrence_rule: recurrence,
      });
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

          {/* Assignee */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] uppercase tracking-wide font-medium" style={{ color: '#7a8194' }}>Assignee</label>
              {assignedTo !== currentUserId && (
                <button
                  type="button"
                  onClick={() => setAssignedTo(currentUserId)}
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