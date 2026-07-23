import { useEffect, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { CalendarIcon, Plus, Trash2, Check, ChevronDown } from 'lucide-react';
import { format } from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { useAuth } from '@/contexts/AuthContext';
import { UserCircle2 } from 'lucide-react';

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
  const { user } = useAuth();
  const currentUserId = user?.id ?? null;
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
          // Tasks must always have an assignee. If the reviewer didn't pick
          // one, fall back to the current user creating the task.
          assigned_to: r.assigned_to ?? currentUserId,
        })),
    );
  }, [rows, onChange, currentUserId]);

  const memberOptions = useMemo(
    () =>
      members.map((m) => ({
        id: m.id,
        label: m.display_name || m.email || 'Team member',
      })),
    [members],
  );

  const currentUserLabel = useMemo(() => {
    const me = memberOptions.find((m) => m.id === currentUserId);
    return me?.label ?? user?.email ?? 'You';
  }, [memberOptions, currentUserId, user?.email]);

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
                <AssigneePicker
                  value={row.assigned_to}
                  options={memberOptions}
                  currentUserId={currentUserId}
                  currentUserLabel={currentUserLabel}
                  onChange={(id) => update(i, { assigned_to: id })}
                />
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
        Every task must have an assignee. If you don't pick one, it defaults to you ({currentUserLabel}).
      </p>
    </div>
  );
}

interface AssigneePickerProps {
  value: string | null;
  options: { id: string; label: string }[];
  currentUserId: string | null;
  currentUserLabel: string;
  onChange: (id: string | null) => void;
}

function AssigneePicker({
  value,
  options,
  currentUserId,
  currentUserLabel,
  onChange,
}: AssigneePickerProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.id === value);
  const displayLabel = selected
    ? `${selected.label}${selected.id === currentUserId ? ' (you)' : ''}`
    : `Assign to ${currentUserLabel} (you)`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            'h-8 px-2.5 text-[12px] flex-1 min-w-[200px] gap-1.5 font-semibold justify-between',
            'border-2 shadow-sm transition-all',
            value
              ? 'border-emerald-400/60 bg-gradient-to-br from-emerald-500/15 to-emerald-500/5 text-emerald-100 hover:from-emerald-500/25 hover:to-emerald-500/10 hover:border-emerald-400/80'
              : 'border-primary/60 bg-gradient-to-br from-primary/20 to-primary/5 text-primary hover:from-primary/30 hover:to-primary/10 hover:border-primary/80 animate-pulse-subtle',
          )}
        >
          <span className="flex items-center gap-1.5 truncate">
            <UserCircle2 className="h-4 w-4 shrink-0" />
            <span className="truncate">{displayLabel}</span>
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[260px] p-0 z-[2100]"
        align="start"
        onOpenAutoFocus={(e) => {
          // Let Command's <CommandInput autoFocus /> take focus so typing
          // filters immediately.
          e.preventDefault();
        }}
      >
        <Command>
          <CommandInput placeholder="Search teammates…" autoFocus className="h-9" />
          <CommandList>
            <CommandEmpty>No teammates found.</CommandEmpty>
            <CommandGroup>
              {options.map((m) => {
                const isMe = m.id === currentUserId;
                const isSelected = m.id === value;
                return (
                  <CommandItem
                    key={m.id}
                    value={`${m.label} ${isMe ? 'you' : ''}`}
                    onSelect={() => {
                      onChange(isSelected ? null : m.id);
                      setOpen(false);
                    }}
                    className="text-[12px] gap-2"
                  >
                    <UserCircle2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="flex-1 truncate">
                      {m.label}
                      {isMe && <span className="text-muted-foreground"> (you)</span>}
                    </span>
                    {isSelected && <Check className="h-3.5 w-3.5 text-primary" />}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}