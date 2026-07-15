import { useEffect, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plus, Trash2 } from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
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
 * Inline multi-row task creator used by the "[Deal] Needs Tasks" approval
 * queue card. Reviewer fills in title / due date / assignee for one or
 * more tasks; approving the card creates all rows against the deal in a
 * single write via the approval-queue-execute edge function.
 */
export function TaskListEditor({ dealName, initialTasks, onChange }: Props) {
  const members = useTeamMembers();
  const [tasks, setTasks] = useState<EditorTask[]>(() =>
    initialTasks.length > 0
      ? initialTasks
      : [{ title: '', due_date: null, assigned_to: null }],
  );

  useEffect(() => {
    onChange(tasks);
  }, [tasks, onChange]);

  const memberOptions = useMemo(
    () =>
      members.map((m) => ({
        id: m.id,
        label: m.display_name || m.email || 'Team member',
      })),
    [members],
  );

  const update = (i: number, patch: Partial<EditorTask>) => {
    setTasks((prev) => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  };
  const addRow = () =>
    setTasks((prev) => [...prev, { title: '', due_date: null, assigned_to: null }]);
  const removeRow = (i: number) =>
    setTasks((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)));

  return (
    <div className="rounded border border-white/10 bg-background/40 p-2 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Tasks to create on {dealName}
        </p>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-[11px]"
          onClick={addRow}
        >
          <Plus className="h-3 w-3 mr-1" /> Add task
        </Button>
      </div>
      <div className="space-y-1.5">
        <div className="grid grid-cols-[1fr_120px_150px_28px] gap-1.5 text-[10px] text-muted-foreground px-0.5">
          <div>Title</div>
          <div>Due date</div>
          <div>Assignee</div>
          <div />
        </div>
        {tasks.map((t, i) => (
          <div
            key={i}
            className="grid grid-cols-[1fr_120px_150px_28px] gap-1.5 items-center"
          >
            <Input
              value={t.title}
              onChange={(e) => update(i, { title: e.target.value })}
              placeholder="Task title…"
              className="h-7 text-[11px] px-2"
            />
            <Input
              type="date"
              value={t.due_date ?? ''}
              onChange={(e) => update(i, { due_date: e.target.value || null })}
              className="h-7 text-[11px] px-2"
            />
            <Select
              value={t.assigned_to ?? ''}
              onValueChange={(v) => update(i, { assigned_to: v || null })}
            >
              <SelectTrigger className="h-7 text-[11px] px-2">
                <SelectValue placeholder="Assignee" />
              </SelectTrigger>
              <SelectContent>
                {memberOptions.map((m) => (
                  <SelectItem key={m.id} value={m.id} className="text-[11px]">
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={() => removeRow(i)}
              disabled={tasks.length <= 1}
              title="Remove task"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground italic">
        Approve to create {tasks.filter((t) => t.title.trim()).length || 0} task
        {tasks.filter((t) => t.title.trim()).length === 1 ? '' : 's'} on this deal.
      </p>
    </div>
  );
}