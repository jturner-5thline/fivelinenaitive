import { useEffect, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { CalendarIcon, Sun, Sunrise, CalendarDays } from 'lucide-react';
import { addDays, format, isSameDay, nextMonday } from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useTeamMembers } from '@/hooks/useTeamMembers';

export interface EditorTask {
  title: string;
  due_date: string | null; // ISO date (YYYY-MM-DD)
  assigned_to: string | null;
  description?: string | null;
}

interface Props {
  dealName: string;
  initialTasks: EditorTask[];
  onChange: (tasks: EditorTask[]) => void;
}

/**
 * Inline single-task creator used by the "[Deal] Needs Tasks" approval
 * queue card. Mirrors the simple Create-Task field used elsewhere in the
 * app (deal detail popup / rundown): title + quick date chips + assignee.
 * Emits a one-element `tasks` array so the approval-queue-execute edge
 * function's batch handler stays compatible.
 */
export function TaskListEditor({ dealName, initialTasks, onChange }: Props) {
  const members = useTeamMembers();
  const seed = initialTasks[0] ?? { title: '', due_date: null, assigned_to: null };
  const [title, setTitle] = useState<string>(seed.title ?? '');
  const [dueDate, setDueDate] = useState<Date | undefined>(
    seed.due_date ? new Date(seed.due_date + 'T00:00:00') : undefined,
  );
  const [assignedTo, setAssignedTo] = useState<string | null>(seed.assigned_to ?? null);

  useEffect(() => {
    onChange([
      {
        title: title.trim(),
        due_date: dueDate ? format(dueDate, 'yyyy-MM-dd') : null,
        assigned_to: assignedTo,
      },
    ]);
  }, [title, dueDate, assignedTo, onChange]);

  const memberOptions = useMemo(
    () =>
      members.map((m) => ({
        id: m.id,
        label: m.display_name || m.email || 'Team member',
      })),
    [members],
  );

  const datePresets = [
    { id: 'today', label: 'Today', icon: <Sun className="h-3 w-3" />, value: new Date() },
    { id: 'tomorrow', label: 'Tomorrow', icon: <Sunrise className="h-3 w-3" />, value: addDays(new Date(), 1) },
    { id: 'monday', label: 'Next Mon', icon: <CalendarDays className="h-3 w-3" />, value: nextMonday(new Date()) },
    { id: 'week', label: '+1 week', icon: <CalendarDays className="h-3 w-3" />, value: addDays(new Date(), 7) },
  ];
  const dateMatches = (preset: Date) => !!dueDate && isSameDay(dueDate, preset);

  return (
    <div className="rounded border border-white/10 bg-background/40 p-2.5 space-y-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        Create task on {dealName}
      </p>
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Task title…"
        className="h-8 text-[12px] px-2"
      />
      <div className="flex flex-wrap items-center gap-1.5">
        {datePresets.map((p) => (
          <Button
            key={p.id}
            type="button"
            size="sm"
            variant={dateMatches(p.value) ? 'default' : 'outline'}
            className="h-6 px-2 text-[10px] gap-1"
            onClick={() => setDueDate(dateMatches(p.value) ? undefined : p.value)}
          >
            {p.icon}
            {p.label}
          </Button>
        ))}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={cn(
                'h-6 px-2 text-[10px] gap-1',
                dueDate && !datePresets.some((p) => dateMatches(p.value)) && 'border-primary/50 text-primary',
              )}
            >
              <CalendarIcon className="h-3 w-3" />
              {dueDate ? format(dueDate, 'MMM d') : 'Pick date'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={dueDate} onSelect={setDueDate} initialFocus />
          </PopoverContent>
        </Popover>
      </div>
      <Select
        value={assignedTo ?? ''}
        onValueChange={(v) => setAssignedTo(v || null)}
      >
        <SelectTrigger className="h-8 text-[12px] px-2">
          <SelectValue placeholder="Assign owner…" />
        </SelectTrigger>
        <SelectContent>
          {memberOptions.map((m) => (
            <SelectItem key={m.id} value={m.id} className="text-[12px]">
              {m.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-[10px] text-muted-foreground italic">
        Approve to create this task on the deal. It will appear in the deal's Tasks section, assigned to the selected owner (defaults to you).
      </p>
    </div>
  );
}