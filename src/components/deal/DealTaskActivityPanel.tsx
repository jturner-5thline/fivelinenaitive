import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { CheckCircle2, ListTodo, Pencil, Plus, Trash2, User, Calendar, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

type TaskEventKind = 'created' | 'completed' | 'updated' | 'deleted';

interface TaskEvent {
  id: string;
  kind: TaskEventKind;
  at: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  status: string | null;
  priority: string | null;
  assigneeName: string | null;
  actorName: string | null;
  createdAt: string;
}

const KIND_META: Record<TaskEventKind, { label: string; icon: JSX.Element; className: string }> = {
  created: { label: 'Task created', icon: <Plus className="h-3.5 w-3.5" />, className: 'border-blue-500/30 text-blue-500' },
  completed: { label: 'Task completed', icon: <CheckCircle2 className="h-3.5 w-3.5" />, className: 'border-emerald-500/30 text-emerald-500' },
  updated: { label: 'Task updated', icon: <Pencil className="h-3.5 w-3.5" />, className: 'border-amber-500/30 text-amber-500' },
  deleted: { label: 'Task removed', icon: <Trash2 className="h-3.5 w-3.5" />, className: 'border-red-500/30 text-red-500' },
};

function useDealTaskEvents(dealId: string | undefined) {
  return useQuery<TaskEvent[]>({
    queryKey: ['deal-task-events', dealId],
    enabled: !!dealId,
    queryFn: async () => {
      const { data: tasks, error } = await supabase
        .from('tasks')
        .select('id, title, description, due_date, due_at, status, priority, assigned_to, assigned_by, created_by, completed_by, completed_at, created_at, updated_at, archived_at')
        .eq('deal_id', dealId!)
        .order('created_at', { ascending: false });
      if (error) throw error;

      const rows = tasks || [];
      const userIds = Array.from(
        new Set(
          rows.flatMap((t: any) => [t.assigned_to, t.assigned_by, t.created_by, t.completed_by]).filter(Boolean),
        ),
      ) as string[];

      let nameById: Record<string, string> = {};
      if (userIds.length) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, display_name, email')
          .in('user_id', userIds);
        nameById = Object.fromEntries(
          (profiles || []).map((p: any) => [p.user_id, p.display_name || p.email || 'Unknown user']),
        );
      }

      const events: TaskEvent[] = [];
      for (const t of rows as any[]) {
        const base = {
          title: t.title || 'Untitled task',
          description: t.description ?? null,
          dueDate: t.due_at || t.due_date || null,
          status: t.status ?? null,
          priority: t.priority ?? null,
          assigneeName: t.assigned_to ? nameById[t.assigned_to] ?? null : null,
          createdAt: t.created_at,
        };

        events.push({
          ...base,
          id: `${t.id}-created`,
          kind: 'created',
          at: t.created_at,
          actorName: t.created_by ? nameById[t.created_by] ?? null : t.assigned_by ? nameById[t.assigned_by] ?? null : null,
        });

        if (t.completed_at) {
          events.push({
            ...base,
            id: `${t.id}-completed`,
            kind: 'completed',
            at: t.completed_at,
            actorName: t.completed_by ? nameById[t.completed_by] ?? null : null,
          });
        }

        if (t.archived_at) {
          events.push({
            ...base,
            id: `${t.id}-deleted`,
            kind: 'deleted',
            at: t.archived_at,
            actorName: null,
          });
        }

        // An update event only when the row changed after creation and the change
        // isn't already represented by the completion / removal events above.
        const updatedAt = t.updated_at ? new Date(t.updated_at).getTime() : 0;
        const createdAt = t.created_at ? new Date(t.created_at).getTime() : 0;
        const otherStamps = [t.completed_at, t.archived_at]
          .filter(Boolean)
          .map((v: string) => new Date(v).getTime());
        const isDuplicate = otherStamps.some((s) => Math.abs(s - updatedAt) < 5000);
        if (updatedAt && updatedAt - createdAt > 5000 && !isDuplicate) {
          events.push({
            ...base,
            id: `${t.id}-updated`,
            kind: 'updated',
            at: t.updated_at,
            actorName: null,
          });
        }
      }

      return events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    },
  });
}

function formatStamp(value: string | null) {
  if (!value) return null;
  try {
    return format(parseISO(value), 'MMM d, yyyy · h:mm a');
  } catch {
    return null;
  }
}

function formatDay(value: string | null) {
  if (!value) return null;
  try {
    return format(parseISO(value), 'MMM d, yyyy');
  } catch {
    return null;
  }
}

export function DealTaskActivityPanel({ dealId }: { dealId: string }) {
  const { data: events, isLoading } = useDealTaskEvents(dealId);
  const [filter, setFilter] = useState<'all' | TaskEventKind>('all');

  const filtered = useMemo(() => {
    if (!events) return [];
    return filter === 'all' ? events : events.filter((e) => e.kind === filter);
  }, [events, filter]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <ListTodo className="h-4 w-4" />
            Task History
          </CardTitle>
          <Badge variant="secondary" className="text-xs">
            {filtered.length} event{filtered.length !== 1 ? 's' : ''}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Every task created, updated, completed, or removed on this deal.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          {([
            { value: 'all' as const, label: 'All' },
            { value: 'created' as const, label: 'Created' },
            { value: 'updated' as const, label: 'Updated' },
            { value: 'completed' as const, label: 'Completed' },
            { value: 'deleted' as const, label: 'Removed' },
          ]).map((option) => (
            <Button
              key={option.value}
              variant={filter === option.value ? 'default' : 'outline'}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setFilter(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : !filtered.length ? (
          <p className="text-sm text-muted-foreground py-4">No task activity for this filter.</p>
        ) : (
          <div className="space-y-1.5 max-h-[540px] overflow-y-auto pr-1">
            {filtered.map((event) => {
              const meta = KIND_META[event.kind];
              return (
                <div
                  key={event.id}
                  className="flex items-start gap-3 p-2.5 rounded-md border bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className="mt-0.5 text-muted-foreground">{meta.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium truncate">{event.title}</p>
                      <Badge variant="outline" className={`text-[10px] ${meta.className}`}>
                        {meta.label}
                      </Badge>
                      {event.priority && (
                        <Badge variant="secondary" className="text-[10px] capitalize">{event.priority}</Badge>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
                      <span>{formatStamp(event.at)}</span>
                      {event.dueDate && (
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="h-3 w-3" /> Due {formatDay(event.dueDate)}
                        </span>
                      )}
                      {event.assigneeName && (
                        <span className="inline-flex items-center gap-1">
                          <User className="h-3 w-3" /> {event.assigneeName}
                        </span>
                      )}
                      {event.actorName && <span>by {event.actorName}</span>}
                      {event.kind !== 'created' && (
                        <span>Created {formatDay(event.createdAt)}</span>
                      )}
                    </div>
                    {event.description && (
                      <p className="mt-1 text-xs text-muted-foreground/90 whitespace-pre-wrap line-clamp-3">
                        {event.description}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
