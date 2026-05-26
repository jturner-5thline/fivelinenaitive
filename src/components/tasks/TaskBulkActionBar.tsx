import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  CheckSquare, Trash2, X, CalendarIcon, User, Flag, Activity,
  Sun, Sunrise, ArrowRight,
} from 'lucide-react';
import { addDays, format, nextMonday } from 'date-fns';
import { type TeamMember } from '@/hooks/useTeamMembers';

interface TaskBulkActionBarProps {
  count: number;
  teamMembers: TeamMember[];
  onBulkUpdate: (updates: Record<string, any>) => void;
  onBulkDelete: () => void;
  onClear: () => void;
}

export function TaskBulkActionBar({ count, teamMembers, onBulkUpdate, onBulkDelete, onClear }: TaskBulkActionBarProps) {
  const [dueDateOpen, setDueDateOpen] = useState(false);
  const [assigneeOpen, setAssigneeOpen] = useState(false);

  const today = format(new Date(), 'yyyy-MM-dd');
  const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');
  const nextMon = format(nextMonday(new Date()), 'yyyy-MM-dd');

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-primary/5 border border-primary/20 rounded-lg animate-in slide-in-from-bottom-2">
      <Badge variant="secondary" className="text-xs font-medium">
        {count} selected
      </Badge>

      {/* Mark Complete */}
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs gap-1.5"
        onClick={() => onBulkUpdate({ status: 'complete' })}
      >
        <CheckSquare className="h-3 w-3" /> Complete
      </Button>

      {/* Status */}
      <Select onValueChange={v => onBulkUpdate({ status: v })}>
        <SelectTrigger className="h-7 w-[120px] text-xs">
          <Activity className="h-3 w-3 mr-1" />
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="not_started" className="text-xs">Not Started</SelectItem>
          <SelectItem value="in_progress" className="text-xs">In Progress</SelectItem>
          <SelectItem value="blocked" className="text-xs">Blocked</SelectItem>
          <SelectItem value="complete" className="text-xs">Complete</SelectItem>
        </SelectContent>
      </Select>

      {/* Urgent flag (single-state) */}
      <Select onValueChange={v => onBulkUpdate({ priority: v === 'urgent' ? 'urgent' : null } as any)}>
        <SelectTrigger className="h-7 w-[130px] text-xs">
          <Flag className="h-3 w-3 mr-1" />
          <SelectValue placeholder="Urgent flag" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="urgent" className="text-xs">🔴 Mark urgent</SelectItem>
          <SelectItem value="none" className="text-xs">Clear urgent</SelectItem>
        </SelectContent>
      </Select>

      {/* Due Date */}
      <Popover open={dueDateOpen} onOpenChange={setDueDateOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5">
            <CalendarIcon className="h-3 w-3" /> Due Date
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[200px] p-1" align="start">
          <div className="space-y-0.5">
            <button
              className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-muted transition-colors"
              onClick={() => { onBulkUpdate({ due_date: today }); setDueDateOpen(false); }}
            >
              <Sun className="h-3 w-3 text-orange-500" /> Today
            </button>
            <button
              className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-muted transition-colors"
              onClick={() => { onBulkUpdate({ due_date: tomorrow }); setDueDateOpen(false); }}
            >
              <Sunrise className="h-3 w-3 text-amber-500" /> Tomorrow
            </button>
            <button
              className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-muted transition-colors"
              onClick={() => { onBulkUpdate({ due_date: nextMon }); setDueDateOpen(false); }}
            >
              <ArrowRight className="h-3 w-3 text-primary" /> Next Monday
            </button>
            <div className="border-t my-1" />
            <Input
              type="date"
              className="h-7 text-xs"
              onChange={e => { if (e.target.value) { onBulkUpdate({ due_date: e.target.value }); setDueDateOpen(false); } }}
            />
            <div className="border-t my-1" />
            <button
              className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-muted text-destructive transition-colors"
              onClick={() => { onBulkUpdate({ due_date: null }); setDueDateOpen(false); }}
            >
              Remove date
            </button>
          </div>
        </PopoverContent>
      </Popover>

      {/* Assignee */}
      <Popover open={assigneeOpen} onOpenChange={setAssigneeOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5">
            <User className="h-3 w-3" /> Assignee
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[220px] p-1" align="start">
          <div className="space-y-0.5 max-h-[200px] overflow-auto">
            {teamMembers.map(m => (
              <button
                key={m.id}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-muted transition-colors"
                onClick={() => { onBulkUpdate({ assigned_to: m.id }); setAssigneeOpen(false); }}
              >
                <Avatar className="h-5 w-5">
                  <AvatarFallback className="text-[9px]">
                    {m.display_name?.charAt(0)?.toUpperCase() || '?'}
                  </AvatarFallback>
                </Avatar>
                <span className="truncate">{m.display_name}</span>
              </button>
            ))}
            {teamMembers.length === 0 && (
              <p className="text-xs text-muted-foreground px-2 py-1.5">No team members found</p>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* Delete */}
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10"
        onClick={onBulkDelete}
      >
        <Trash2 className="h-3 w-3" /> Delete
      </Button>

      {/* Clear */}
      <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={onClear}>
        <X className="h-3 w-3" /> Clear
      </Button>
    </div>
  );
}
