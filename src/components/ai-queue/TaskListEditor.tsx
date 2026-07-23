import { useEffect, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { CalendarIcon, Plus, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
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
 * Multi-task creator used by the "[Deal] Needs Tasks" approval queue card.
 * Reviewer can add any number of tasks; each row has: title, due date
 * (calendar-only picker), and assignee. Emits the full `tasks` array which
 * approval-queue-execute inserts as a batch.
 */
type Row = { title: string; due_date: string | null; assigned_to: string | null };

function toDate(iso: string | null): Date | undefined {
  return iso ? new Date(iso + 'T00:00:00') : undefined;
}

export function TaskListEditor({ dealName, initialTasks, onChange }: Props) {
  const members = useTeamMembers();
  const [rows, setRows] = useState<Row[]>(() => {
    const seed = initialTasks.length > 0
      ? initialTasks.map((t) => ({
          title: t.title ?? '',
          due_date: t.due_date ?? null,
          assigned_to: t.assigned_to ?? null,
        }))
      : [{ title: '', due_date: null, assigned_to: null }];
    return seed;
  });

  useEffect(() => {
    onChange(
      rows
        .filter((r) => r.title.trim().length > 0)
        .map((r) => ({
          title: r.title.trim(),
          due_date: r.due_date,
          assigned_to: r.assigned_to,
        })),
    );
  }, [rows, onChange]);

  const memberOptions = useMemo(
    () =>
      members.map((m) => ({
        id: m.id,
        label: m.display_name || m.email || 'Team member',
      })),
    [members],
  );

  const update = (i: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () =>
    setRows((prev) => [...prev, { title: '', due_date: null, assigned_to: null }]);
  const removeRow = (i: number) =>
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)));

  return (
    <div className="rounded border border-white/10 bg-background/40 p-2.5 space-y-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        Create tasks on {dealName}
      </p>

      <div className="space-y-2">
        {rows.map((row, i) => {
          const dueDate = toDate(row.due_date);
          return (
            <div
              key={i}
              className="rounded border border-white/10 bg-background/40 p-2 space-y-1.5"
            >
              <div className="flex items-start gap-1.5">
                <Input
                  value={row.title}
                  onChange={(e) => update(i, { title: e.target.value })}
                  placeholder={`Task ${i + 1} title…`}
                  className="h-8 text-[12px] px-2 flex-1"
                />
                {rows.length > 1 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-red-400"
                    onClick={() => removeRow(i)}
                    aria-label="Remove task"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className={cn(
                        'h-7 px-2 text-[11px] gap-1',
                        dueDate && 'border-primary/50 text-primary',
                      )}
                    >
                      <CalendarIcon className="h-3 w-3" />
                      {dueDate ? format(dueDate, 'MMM d, yyyy') : 'Due date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 z-[2100]" align="start">
                    <Calendar
                      mode="single"
                      selected={dueDate}
                      onSelect={(d) =>
                        update(i, { due_date: d ? format(d, 'yyyy-MM-dd') : null })
                      }
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <Select
                  value={row.assigned_to ?? ''}
                  onValueChange={(v) => update(i, { assigned_to: v || null })}
                >
                  <SelectTrigger className="h-7 text-[11px] px-2 flex-1 min-w-[160px]">
                    <SelectValue placeholder="Assign owner…" />
                  </SelectTrigger>
                  <SelectContent className="z-[2100]">
                    {memberOptions.length === 0 ? (
                      <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
                        No teammates found
                      </div>
                    ) : (
                      memberOptions.map((m) => (
                        <SelectItem key={m.id} value={m.id} className="text-[12px]">
                          {m.label}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
          );
        })}
      </div>

      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 px-2 text-[11px] gap-1 w-full"
        onClick={addRow}
      >
        <Plus className="h-3 w-3" /> Add another task
      </Button>

      <p className="text-[10px] text-muted-foreground italic">
        Approve to create these tasks on the deal. Each will appear in the deal's Tasks section, assigned to the selected owner (defaults to you).
      </p>
    </div>
  );
}