import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { CheckCircle2, Circle, Loader2, ExternalLink, AlertTriangle, Info, CheckCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useState } from 'react';

interface FollowUpTaskRow {
  id: string;
  title: string;
  status: string | null;
  due_date: string | null;
  completed_at: string | null;
  assigned_to: string | null;
  deal_id: string | null;
}

/**
 * Shows the auto-created "Follow up on <event>" task(s) tied to a calendar
 * event so the "Create follow-up" pop-up isn't blind to the existing task
 * chain that already came out of the End of Day flow. The user can toggle
 * the task complete here without leaving the dialog.
 */
export function EventFollowUpTasksPanel({ eventId }: { eventId: string }) {
  const qc = useQueryClient();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [bulkPending, setBulkPending] = useState(false);

  const queryKey = ['event-followup-tasks', eventId];
  const { data: tasks = [], isLoading } = useQuery({
    queryKey,
    enabled: !!eventId,
    staleTime: 15_000,
    queryFn: async (): Promise<FollowUpTaskRow[]> => {
      const { data, error } = await supabase
        .from('tasks')
        .select('id, title, status, due_date, completed_at, assigned_to, deal_id')
        .or(`source_calendar_event_id.eq.${eventId},nylas_event_id.eq.${eventId}`)
        .is('archived_at', null)
        .order('created_at', { ascending: true });
      if (error) {
        console.error('[EventFollowUpTasksPanel] load failed', error);
        return [];
      }
      return (data || []) as FollowUpTaskRow[];
    },
  });

  if (isLoading) {
    return (
      <div className="rounded-md border border-border/60 bg-muted/20 px-2.5 py-2 text-[11px] text-muted-foreground flex items-center gap-1.5">
        <Loader2 className="h-3 w-3 animate-spin" /> Checking existing follow-up…
      </div>
    );
  }
  if (tasks.length === 0) {
    return (
      <div className="rounded-md border border-amber-500/30 bg-amber-500/[0.06] px-2.5 py-2 flex items-start gap-2">
        <Info className="h-3.5 w-3.5 mt-0.5 text-amber-300 shrink-0" />
        <div className="text-[11px] leading-snug text-amber-100/90">
          <div className="font-medium text-amber-200">No follow-up task yet</div>
          <div className="text-amber-100/70">
            Nothing has been auto-created for this meeting. Use the form below to create one.
          </div>
        </div>
      </div>
    );
  }

  const toggle = async (t: FollowUpTaskRow) => {
    const nextComplete = t.status !== 'complete';
    setPendingId(t.id);
    qc.setQueryData<FollowUpTaskRow[]>(queryKey, (prev = []) =>
      prev.map((x) =>
        x.id === t.id
          ? {
              ...x,
              status: nextComplete ? 'complete' : 'not_started',
              completed_at: nextComplete ? new Date().toISOString() : null,
            }
          : x,
      ),
    );
    const { error } = await supabase
      .from('tasks')
      .update({
        status: nextComplete ? 'complete' : 'not_started',
        completed_at: nextComplete ? new Date().toISOString() : null,
      })
      .eq('id', t.id);
    setPendingId(null);
    if (error) {
      toast.error('Could not update task', { description: error.message });
      qc.invalidateQueries({ queryKey });
      return;
    }
    toast.success(nextComplete ? 'Marked complete' : 'Reopened task');
    qc.invalidateQueries({ queryKey: ['tasks'] });
    qc.invalidateQueries({ queryKey: ['eod-followup-task-status'] });
  };

  const completeAll = async () => {
    const open = tasks.filter((t) => t.status !== 'complete');
    if (open.length === 0) return;
    setBulkPending(true);
    const nowIso = new Date().toISOString();
    const ids = open.map((t) => t.id);
    qc.setQueryData<FollowUpTaskRow[]>(queryKey, (prev = []) =>
      prev.map((x) =>
        ids.includes(x.id) ? { ...x, status: 'complete', completed_at: nowIso } : x,
      ),
    );
    const { error } = await supabase
      .from('tasks')
      .update({ status: 'complete', completed_at: nowIso })
      .in('id', ids);
    setBulkPending(false);
    if (error) {
      toast.error('Could not complete tasks', { description: error.message });
      qc.invalidateQueries({ queryKey });
      return;
    }
    toast.success(`Marked ${ids.length} follow-up task${ids.length === 1 ? '' : 's'} complete`);
    qc.invalidateQueries({ queryKey: ['tasks'] });
    qc.invalidateQueries({ queryKey: ['eod-followup-task-status'] });
  };

  return (
    <div className="rounded-md border border-emerald-500/25 bg-emerald-500/[0.04] px-2.5 py-2 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] uppercase tracking-wide text-emerald-300/80">
          Existing follow-up {tasks.length > 1 ? `(${tasks.length})` : ''}
        </div>
        {tasks.length > 1 && (
          <div className="flex items-center gap-1 text-[10px] text-amber-300">
            <AlertTriangle className="h-3 w-3" />
            <span>Multiple tasks linked — review for duplicates</span>
          </div>
        )}
      </div>
      {tasks.length > 1 && (
        <div className="text-[10px] text-amber-200/80 bg-amber-500/[0.06] border border-amber-500/25 rounded px-1.5 py-1">
          {tasks.length} follow-up tasks are linked to this meeting. Complete or archive extras
          to keep the End of Day view in sync.
        </div>
      )}
      {tasks.some((t) => t.status !== 'complete') && (
        <button
          type="button"
          onClick={() => { void completeAll(); }}
          disabled={bulkPending}
          className="w-full inline-flex items-center justify-center gap-1.5 rounded border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-100 text-[11px] px-2 py-1 disabled:opacity-50"
        >
          {bulkPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <CheckCheck className="h-3 w-3" />
          )}
          Mark all {tasks.filter((t) => t.status !== 'complete').length} as complete
        </button>
      )}
      <ul className="space-y-1">
        {tasks.map((t) => {
          const done = t.status === 'complete';
          const due = t.due_date ? safeFormatDate(t.due_date) : null;
          return (
            <li key={t.id} className="flex items-start gap-2">
              <button
                type="button"
                onClick={() => { void toggle(t); }}
                disabled={pendingId === t.id}
                className="mt-0.5 shrink-0 text-emerald-300 hover:text-emerald-200 disabled:opacity-50"
                aria-label={done ? 'Mark not complete' : 'Mark complete'}
              >
                {pendingId === t.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : done ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <Circle className="h-3.5 w-3.5" />
                )}
              </button>
              <div className="min-w-0 flex-1">
                <div
                  className={cn(
                    'text-xs truncate',
                    done ? 'line-through text-muted-foreground' : 'text-foreground',
                  )}
                  title={t.title}
                >
                  {t.title}
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  {done ? (
                    <span>Completed{t.completed_at ? ` · ${safeFormatDateTime(t.completed_at)}` : ''}</span>
                  ) : due ? (
                    <span>Due {due}</span>
                  ) : (
                    <span>No due date</span>
                  )}
                  <a
                    href={`/workspace?tab=tasks&task=${t.id}`}
                    className="inline-flex items-center gap-0.5 text-[10px] text-primary hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Open <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="text-[10px] text-muted-foreground/80">
        Linked to this meeting. Create a new item below only if you need something extra.
      </div>
    </div>
  );
}

function safeFormatDate(iso: string): string {
  try {
    return format(parseISO(`${iso}T00:00:00`), 'EEE, MMM d');
  } catch {
    return iso;
  }
}
function safeFormatDateTime(iso: string): string {
  try {
    return format(parseISO(iso), 'MMM d, h:mm a');
  } catch {
    return iso;
  }
}