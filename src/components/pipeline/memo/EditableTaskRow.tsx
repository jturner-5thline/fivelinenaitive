import { useState, useRef, useEffect } from 'react';
import { format, differenceInCalendarDays } from 'date-fns';
import { Square, Pencil } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { DealTaskItem } from '@/hooks/usePipelineDealTasks';

interface Props { task: DealTaskItem }

function initialsOf(name?: string | null) {
  if (!name) return '';
  return name.trim().split(/\s+/).map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

/**
 * Inline-editable task row for the Deal Rundown's Tasks & Milestones band.
 * Tasks (kind === 'task') are editable: title (click), due date (popover
 * calendar), assignee (popover member list). Outstanding items render as
 * read-only with the same visual style.
 * All writes hit `tasks.update().eq('id', …)` so other surfaces stay in sync.
 */
export function EditableTaskRow({ task }: Props) {
  const isTask = task.kind === 'task';
  const realId = task.id.replace(/^[to]-/, '');
  const queryClient = useQueryClient();
  const { company } = useCompany();

  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(task.title);
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setTitleDraft(task.title); }, [task.title]);
  useEffect(() => { if (titleEditing) inputRef.current?.focus(); }, [titleEditing]);

  const due = task.dueDate ? new Date(task.dueDate) : null;
  const isOverdue = !!due && differenceInCalendarDays(due, new Date()) < 0;
  const assignee = task.kind === 'outstanding' ? task.requestedByName : task.assignedToName;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['pipeline-deal-tasks'] });
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    queryClient.invalidateQueries({ queryKey: ['deal-tasks'] });
  };

  async function saveTitle() {
    setTitleEditing(false);
    const next = titleDraft.trim();
    if (!isTask) return;
    if (!next || next === task.title) { setTitleDraft(task.title); return; }
    const { error } = await supabase.from('tasks').update({ title: next }).eq('id', realId);
    if (error) { toast.error('Failed to update task'); setTitleDraft(task.title); }
    else { toast.success('Task updated'); refresh(); }
  }

  async function saveDate(d?: Date) {
    setDateOpen(false);
    if (!isTask) return;
    const value = d ? d.toISOString().slice(0, 10) : null;
    const { error } = await supabase.from('tasks').update({ due_date: value }).eq('id', realId);
    if (error) toast.error('Failed to update due date');
    else { toast.success('Due date updated'); refresh(); }
  }

  async function saveAssignee(userId: string | null) {
    setAssigneeOpen(false);
    if (!isTask) return;
    const { error } = await supabase.from('tasks').update({ assigned_to: userId }).eq('id', realId);
    if (error) toast.error('Failed to update assignee');
    else { toast.success('Assignee updated'); refresh(); }
  }

  const { data: members = [] } = useQuery({
    queryKey: ['company-members-for-assign', company?.id],
    enabled: assigneeOpen && !!company?.id,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data: cm } = await supabase
        .from('company_members')
        .select('user_id')
        .eq('company_id', company!.id);
      const ids = (cm || []).map(r => r.user_id).filter(Boolean) as string[];
      if (ids.length === 0) return [] as { id: string; name: string }[];
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, display_name, first_name, last_name')
        .in('id', ids);
      return (profs || []).map(p => ({
        id: p.id as string,
        name: (p.display_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unknown').trim(),
      })).sort((a, b) => a.name.localeCompare(b.name));
    },
  });

  return (
    <div
      className="group flex items-center gap-2.5 rounded-md bg-background/70 border border-border/60 px-2.5 py-1.5"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <Square className="h-3.5 w-3.5 text-muted-foreground shrink-0" />

      {titleEditing && isTask ? (
        <input
          ref={inputRef}
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={saveTitle}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') { e.preventDefault(); saveTitle(); }
            if (e.key === 'Escape') { setTitleDraft(task.title); setTitleEditing(false); }
          }}
          className="flex-1 min-w-0 text-xs bg-transparent border-b border-primary/40 outline-none text-foreground font-medium"
        />
      ) : (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); if (isTask) setTitleEditing(true); }}
          className={cn(
            'flex-1 min-w-0 text-left text-xs text-foreground font-medium truncate',
            isTask && 'cursor-text hover:text-primary',
          )}
          title={task.title}
        >
          {task.title}
        </button>
      )}

      {isTask && (
        <Pencil className="h-3 w-3 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
      )}

      {/* Assignee */}
      {isTask ? (
        <Popover open={assigneeOpen} onOpenChange={setAssigneeOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground whitespace-nowrap shrink-0"
              title={assignee || 'Assign'}
            >
              <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-muted text-[8px] font-semibold text-muted-foreground/90">
                {initialsOf(assignee) || '?'}
              </span>
              <span className="truncate max-w-[80px]">{assignee || 'Unassigned'}</span>
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="w-56 p-1 max-h-72 overflow-y-auto pointer-events-auto"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); saveAssignee(null); }}
              className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted text-muted-foreground"
            >
              Unassigned
            </button>
            {members.map(m => (
              <button
                key={m.id}
                type="button"
                onClick={(e) => { e.stopPropagation(); saveAssignee(m.id); }}
                className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted flex items-center gap-2"
              >
                <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-muted text-[9px] font-semibold">
                  {initialsOf(m.name)}
                </span>
                <span className="truncate">{m.name}</span>
              </button>
            ))}
          </PopoverContent>
        </Popover>
      ) : assignee ? (
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground whitespace-nowrap shrink-0">
          <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-muted text-[8px] font-semibold">
            {initialsOf(assignee)}
          </span>
          <span className="truncate max-w-[80px]">{assignee}</span>
        </span>
      ) : null}

      {/* Due date */}
      {isTask ? (
        <Popover open={dateOpen} onOpenChange={setDateOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              className={cn(
                'text-[10px] whitespace-nowrap shrink-0 hover:text-foreground transition-colors',
                isOverdue ? 'text-destructive font-medium' : 'text-muted-foreground',
              )}
              title={due ? format(due, 'MMM d, yyyy') : 'Set due date'}
            >
              {due ? format(due, 'MMM d') : '+ date'}
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="w-auto p-0 pointer-events-auto"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <Calendar
              mode="single"
              selected={due || undefined}
              onSelect={(d) => saveDate(d || undefined)}
              initialFocus
              className="p-3 pointer-events-auto"
            />
            {due && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); saveDate(undefined); }}
                className="w-full text-xs text-muted-foreground hover:text-destructive py-2 border-t border-border"
              >
                Clear date
              </button>
            )}
          </PopoverContent>
        </Popover>
      ) : due ? (
        <span className={cn(
          'text-[10px] whitespace-nowrap shrink-0',
          isOverdue ? 'text-destructive font-medium' : 'text-muted-foreground',
        )}>
          {format(due, 'MMM d')}
        </span>
      ) : null}
    </div>
  );
}