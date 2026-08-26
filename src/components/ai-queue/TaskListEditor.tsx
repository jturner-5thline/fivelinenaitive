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
  /** When true, reveal validation errors on every row regardless of touched state. */
  forceShowErrors?: boolean;
}

/**
 * Multi-task creator used by the "[Deal] Needs Tasks" approval queue card.
 * Reviewer can add any number of tasks; each row has: title, due date
 * (calendar-only picker), and assignee. Emits the full `tasks` array which
 * approval-queue-execute inserts as a batch.
 */
type Row = {
  title: string;
  due_date: string | null;
  assigned_to: string | null;
  titleTouched?: boolean;
  assigneeTouched?: boolean;
};

function toDate(iso: string | null): Date | undefined {
  return iso ? new Date(iso + 'T00:00:00') : undefined;
}

export function TaskListEditor({
  dealName,
  initialTasks,
  onChange,
  forceShowErrors = false,
}: Props) {
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
        .map((r) => ({
          title: r.title.trim(),
          due_date: r.due_date,
          // Tasks must always have an assignee — the consumer disables the
          // approve button until every row has both a title and an assignee.
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
    <div className="space-y-2">
      <div className="space-y-2">
        {rows.map((row, i) => {
          const dueDate = toDate(row.due_date);
          const titleMissing = row.title.trim().length === 0;
          const assigneeMissing = !row.assigned_to;
          const rowEngaged =
            !!row.title || !!row.due_date || !!row.assigned_to ||
            row.titleTouched || row.assigneeTouched;
          const showTitleError =
            titleMissing && (forceShowErrors || row.titleTouched || rowEngaged);
          const showAssigneeError =
            assigneeMissing &&
            (forceShowErrors || row.assigneeTouched || rowEngaged);
          return (
            <div key={i} className="space-y-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <Input
                  value={row.title}
                  onChange={(e) => update(i, { title: e.target.value })}
                  onBlur={() => update(i, { titleTouched: true })}
                  placeholder={`Task ${i + 1} title…`}
                  aria-invalid={showTitleError || undefined}
                  className={cn(
                    'h-8 text-[12px] px-2 flex-1 min-w-[160px]',
                    showTitleError && 'border-red-400/70 focus-visible:ring-red-400/40',
                  )}
                />
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className={cn(
                        'h-8 px-2 text-[11px] gap-1 shrink-0',
                        dueDate && 'border-primary/50 text-primary',
                      )}
                    >
                      <CalendarIcon className="h-3 w-3" />
                      {dueDate ? format(dueDate, 'MMM d') : 'Due'}
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
                <div className="w-[190px] shrink-0">
                  <AssigneePicker
                    value={row.assigned_to}
                    options={memberOptions}
                    currentUserId={currentUserId}
                    currentUserLabel={currentUserLabel}
                    invalid={showAssigneeError}
                    onChange={(id) =>
                      update(i, { assigned_to: id, assigneeTouched: true })
                    }
                    onOpenChange={(open) => {
                      if (!open) update(i, { assigneeTouched: true });
                    }}
                  />
                </div>
                {rows.length > 1 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 shrink-0 text-muted-foreground hover:text-red-400"
                    onClick={() => removeRow(i)}
                    aria-label="Remove task"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              {(showTitleError || showAssigneeError) && (
                <p className="text-[10px] text-red-400 leading-tight">
                  {[showTitleError && 'Title', showAssigneeError && 'Assignee']
                    .filter(Boolean)
                    .join(' and ')}{' '}
                  required
                </p>
              )}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        onClick={addRow}
      >
        <Plus className="h-3 w-3" /> Add another task
      </button>
    </div>
  );
}


interface AssigneePickerProps {
  value: string | null;
  options: { id: string; label: string }[];
  currentUserId: string | null;
  currentUserLabel: string;
  onChange: (id: string | null) => void;
  invalid?: boolean;
  onOpenChange?: (open: boolean) => void;
}

function AssigneePicker({
  value,
  options,
  currentUserId,
  currentUserLabel,
  onChange,
  invalid,
  onOpenChange,
}: AssigneePickerProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.id === value);
  const displayLabel = selected
    ? `${selected.label}${selected.id === currentUserId ? ' (you)' : ''}`
    : 'Select assignee';

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        onOpenChange?.(next);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          className={cn(
            'h-8 px-2.5 text-[12px] w-full gap-1.5 font-semibold justify-between',
            'border-2 shadow-sm transition-all',
            value
              ? 'border-emerald-400/60 bg-gradient-to-br from-emerald-500/15 to-emerald-500/5 text-emerald-100 hover:from-emerald-500/25 hover:to-emerald-500/10 hover:border-emerald-400/80'
              : 'border-primary/60 bg-gradient-to-br from-primary/20 to-primary/5 text-primary hover:from-primary/30 hover:to-primary/10 hover:border-primary/80 animate-pulse-subtle',
            invalid && 'border-red-400/70 text-red-200 from-red-500/15 to-red-500/5',
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