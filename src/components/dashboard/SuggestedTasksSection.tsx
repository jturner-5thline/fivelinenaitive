import { useMemo, useState } from 'react';
import { Sparkles, CheckCircle2, X, ListPlus, Loader2, Undo2, Calendar as CalIcon, AtSign, User as UserIcon, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import {
  useMeetingTaskSuggestions,
  type MeetingTaskSuggestion,
  type SuggestionSource,
} from '@/hooks/useMeetingTaskSuggestions';

interface Props {
  eventId: string;
  meetingRowId: string | null;
  recordingRowId: string | null;
  source: SuggestionSource | 'none';
  fallbackActionItems?: string[];
}

/**
 * Suggested tasks panel rendered above the Add Note textarea.
 * Lets the user approve individual or all action items into real tasks
 * (assigned to the current user — James Turner on the Daily Rundown).
 */
export function SuggestedTasksSection({ eventId, meetingRowId, recordingRowId, source, fallbackActionItems }: Props) {
  const {
    suggestions, isLoading, pendingCount,
    approve, approveAll, dismiss, dismissAll, undo,
  } = useMeetingTaskSuggestions({ eventId, meetingRowId, recordingRowId, source, fallbackActionItems });

  // Pending dismiss undos: track timeout per suggestion_id so we can give a
  // 30s window for the user to undo a dismissal inline.
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState<null | 'approve' | 'dismiss'>(null);

  const visible = useMemo(() => suggestions, [suggestions]);

  if (source !== 'claap' || (visible.length === 0 && !isLoading)) {
    return null;
  }

  const pillCls = 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10';
  const pillLabel = 'From Claap';

  const handleApprove = async (s: MeetingTaskSuggestion) => {
    setBusyId(s.suggestion_id);
    try {
      const res = await approve(s);
      if (res) toast.success('Task created — assigned to you');
    } finally {
      setBusyId(null);
    }
  };

  const handleDismiss = async (s: MeetingTaskSuggestion) => {
    setBusyId(s.suggestion_id);
    try {
      await dismiss(s);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mt-3 rounded-lg border border-white/[0.08] bg-white/[0.02] p-2.5">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Sparkles className="h-3 w-3 text-primary shrink-0" />
          <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/80">
            Suggested tasks
          </span>
          <span className="text-[10px] text-muted-foreground/60">
            • {visible.length} from Claap
          </span>
          <span className={cn('inline-flex items-center gap-1 h-5 px-1.5 rounded text-[10px] border', pillCls)}>
            {pillLabel}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            size="sm"
            className="h-7 text-[10px] gap-1"
            disabled={pendingCount === 0 || bulkBusy !== null}
            onClick={async () => {
              setBulkBusy('approve');
              try { await approveAll(); } finally { setBulkBusy(null); }
            }}
          >
            {bulkBusy === 'approve' ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
            Approve all
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-[10px] gap-1 text-muted-foreground hover:text-white"
            disabled={pendingCount === 0 || bulkBusy !== null}
            onClick={async () => {
              setBulkBusy('dismiss');
              try { await dismissAll(); } finally { setBulkBusy(null); }
            }}
          >
            <X className="h-3 w-3" />
            Dismiss all
          </Button>
        </div>
      </div>

      {isLoading && visible.length === 0 ? (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground italic">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading suggestions…
        </div>
      ) : (
        <ul className="space-y-1">
          {visible.map((s) => {
            const isConverted = s.status === 'converted';
            const isDismissed = s.status === 'dismissed';
            const isPending = s.status === 'pending';
            return (
              <li
                key={s.suggestion_id}
                className={cn(
                  'flex items-start gap-2 rounded-md border px-2 py-1.5 text-xs transition-colors',
                  isConverted && 'border-emerald-500/30 bg-emerald-500/[0.06]',
                  isDismissed && 'border-white/[0.06] bg-white/[0.015] opacity-60',
                  isPending && 'border-white/[0.08] bg-white/[0.015] hover:bg-white/[0.04]',
                )}
              >
                <Checkbox
                  checked={isConverted}
                  disabled={!isPending || busyId === s.suggestion_id}
                  onCheckedChange={() => { if (isPending) void handleApprove(s); }}
                  className="mt-0.5"
                />
                <div className="min-w-0 flex-1">
                  <div className={cn('text-white/90', isDismissed && 'line-through text-muted-foreground')}>
                    {s.text}
                  </div>
                  {(s.assignee_user_id || s.external_mention || s.due_date) && (
                    <div className="flex flex-wrap items-center gap-1 mt-0.5">
                      {s.assignee_user_id && s.assignee_name ? (
                        <Badge
                          data-assignee-chip={s.assignment_source === 'deal-manager' ? 'deal-manager' : 'internal'}
                          variant="outline"
                          className={cn(
                            'h-4 px-1 text-[9px] gap-0.5',
                            s.assignment_source === 'deal-manager'
                              ? 'border-sky-500/30 text-sky-200/90 bg-sky-500/[0.06]'
                              : 'border-emerald-500/30 text-emerald-200/90 bg-emerald-500/[0.06]',
                          )}
                        >
                          <UserIcon className="h-2.5 w-2.5" /> {s.assignee_name}
                          {s.assignment_source === 'deal-manager' && (
                            <span className="ml-0.5 inline-flex items-center rounded-sm border border-sky-400/30 bg-sky-400/[0.08] px-0.5 text-[8px] uppercase tracking-wider text-sky-200/80">
                              deal mgr
                            </span>
                          )}
                        </Badge>
                      ) : (
                        <Badge data-assignee-chip="unassigned" variant="outline" className="h-4 px-1 text-[9px] gap-0.5 border-white/15 text-muted-foreground bg-transparent">
                          <UserIcon className="h-2.5 w-2.5" /> Unassigned
                        </Badge>
                      )}
                      {s.assignee_user_id && s.assignee_email && (
                        <Badge variant="outline" className="h-4 px-1 text-[9px] gap-0.5 border-white/15 text-muted-foreground bg-transparent">
                          <AtSign className="h-2.5 w-2.5" /> {s.assignee_email}
                        </Badge>
                      )}
                      {s.external_mention && (
                        <span className="text-[9px] text-muted-foreground/70 italic">
                          mentioned: {s.external_mention}
                        </span>
                      )}
                      {s.due_date && (
                        <Badge variant="outline" className="h-4 px-1 text-[9px] gap-0.5 border-white/15 text-muted-foreground bg-transparent">
                          <CalIcon className="h-2.5 w-2.5" /> {s.due_date}
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {isConverted && (
                    <>
                      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-300">
                        <CheckCircle2 className="h-3 w-3" /> Created
                      </span>
                      {s.created_task_id && (
                        <Link
                          to={`/tasks/${s.created_task_id}`}
                          className="text-[10px] text-muted-foreground hover:text-white underline inline-flex items-center gap-0.5"
                        >
                          View <ExternalLink className="h-2.5 w-2.5" />
                        </Link>
                      )}
                      <Button
                        size="sm" variant="ghost"
                        className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-white"
                        onClick={() => void undo(s)}
                      >
                        <Undo2 className="h-3 w-3" />
                      </Button>
                    </>
                  )}
                  {isDismissed && (
                    <>
                      <span className="text-[10px] text-muted-foreground italic">Dismissed</span>
                      <Button
                        size="sm" variant="ghost"
                        className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-white"
                        onClick={() => void undo(s)}
                      >
                        Undo
                      </Button>
                    </>
                  )}
                  {isPending && (
                    <>
                      <Button
                        size="sm"
                        className="h-6 px-2 text-[10px] gap-1"
                        disabled={busyId === s.suggestion_id}
                        onClick={() => void handleApprove(s)}
                      >
                        {busyId === s.suggestion_id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ListPlus className="h-3 w-3" />}
                        Create task
                      </Button>
                      <Button
                        size="sm" variant="ghost"
                        className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-white"
                        disabled={busyId === s.suggestion_id}
                        onClick={() => void handleDismiss(s)}
                        aria-label="Dismiss suggestion"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}