import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { CalendarIcon, Loader2, UserCheck, Zap, Sun, Sunrise, CalendarDays, Flame, Coffee } from 'lucide-react';
import { addDays, format, isSameDay, nextMonday } from 'date-fns';
import { cn } from '@/lib/utils';
import { type TeamMember } from '@/hooks/useTeamMembers';

export interface QuickTaskInput {
  title: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  due_date: string | null;
  status: 'not_started' | 'in_progress' | 'blocked' | 'complete';
  assigned_to: string;
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
      setWarning('');
      setConfirmedJunk(false);
      setSubmitting(false);
    }
  }, [open, currentUserId]);

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
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const assignee = teamMembers.find(m => m.id === assignedTo);

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

          {/* Two-column row: Priority + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-wide font-medium" style={{ color: '#7a8194' }}>Priority</label>
              <Select value={priority} onValueChange={(v) => setPriority(v as QuickTaskInput['priority'])}>
                <SelectTrigger className="h-9 text-sm text-white" style={{ backgroundColor: 'rgba(20,24,32,0.65)', borderColor: 'rgba(255,255,255,0.07)' }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="urgent" className="text-xs">Urgent</SelectItem>
                  <SelectItem value="high" className="text-xs">High</SelectItem>
                  <SelectItem value="medium" className="text-xs">Medium</SelectItem>
                  <SelectItem value="low" className="text-xs">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-wide font-medium" style={{ color: '#7a8194' }}>Status</label>
              <Select value={status} onValueChange={(v) => setStatus(v as QuickTaskInput['status'])}>
                <SelectTrigger className="h-9 text-sm text-white" style={{ backgroundColor: 'rgba(20,24,32,0.65)', borderColor: 'rgba(255,255,255,0.07)' }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="not_started" className="text-xs">Not Started</SelectItem>
                  <SelectItem value="in_progress" className="text-xs">In Progress</SelectItem>
                  <SelectItem value="blocked" className="text-xs">Blocked</SelectItem>
                  <SelectItem value="complete" className="text-xs">Complete</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Two-column row: Due date + Assignee */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-wide font-medium" style={{ color: '#7a8194' }}>Due date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn('h-9 w-full justify-start text-sm font-normal', !dueDate && 'text-[#7a8194]')}
                    style={{ backgroundColor: 'rgba(20,24,32,0.65)', borderColor: 'rgba(255,255,255,0.07)', color: dueDate ? '#eef1f6' : '#7a8194' }}
                  >
                    <CalendarIcon className="h-3.5 w-3.5 mr-2" />
                    {dueDate ? format(dueDate, 'PPP') : 'No date'}
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
                  {dueDate && (
                    <div className="border-t p-2">
                      <Button variant="ghost" size="sm" className="w-full text-xs text-destructive" onClick={() => setDueDate(undefined)}>
                        Clear date
                      </Button>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-wide font-medium" style={{ color: '#7a8194' }}>Assignee</label>
              <Select value={assignedTo} onValueChange={setAssignedTo}>
                <SelectTrigger className="h-9 text-sm text-white" style={{ backgroundColor: 'rgba(20,24,32,0.65)', borderColor: 'rgba(255,255,255,0.07)' }}>
                  <div className="flex items-center gap-2 truncate">
                    {assignee && (
                      <Avatar className="h-5 w-5">
                        {assignee.avatar_url && <AvatarImage src={assignee.avatar_url} />}
                        <AvatarFallback className="text-[8px]" style={{ backgroundColor: 'rgba(126,184,247,0.18)', color: '#cfe3ff' }}>
                          {assignee.display_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    )}
                    <span className="truncate">{assignee?.display_name || 'Select…'}</span>
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {teamMembers.map(m => (
                    <SelectItem key={m.id} value={m.id} className="text-xs">
                      {m.display_name}{m.id === currentUserId ? ' (me)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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