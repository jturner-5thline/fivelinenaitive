import { useMemo, useState } from 'react';
import { Sparkles, CheckCircle2, X, ListPlus, Loader2, Undo2, Calendar as CalIcon, AtSign, User as UserIcon, ExternalLink, UserPlus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import {
  useMeetingTaskSuggestions,
  type MeetingTaskSuggestion,
  type SuggestionSource,
  type InternalMember,
  MissingAssigneeError,
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
    suggestions, isLoading, pendingCount, internalMembers,
    currentViewer,
    approve, approveAll, assignManually, bulkAssignUnassigned, clearAssignment,
    dismiss, dismissAll, undo,
  } = useMeetingTaskSuggestions({ eventId, meetingRowId, recordingRowId, source, fallbackActionItems });

  // Pending dismiss undos: track timeout per suggestion_id so we can give a
  // 30s window for the user to undo a dismissal inline.
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState<null | 'approve' | 'dismiss'>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

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
    } catch (err) {
      toast.error('Failed to create task');
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

  const toggleSelected = (sid: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(sid) ? next.delete(sid) : next.add(sid);
      return next;
    });
  };

  const pending = visible.filter((s) => s.status === 'pending');
  // Scope of "Approve all" / "Bulk assign": selected pending rows, or
  // all pending rows if the user hasn't ticked any boxes.
  const considered = selected.size > 0
    ? pending.filter((s) => selected.has(s.suggestion_id))
    : pending;
  const hasUnassignedInConsidered = considered.some((s) => !s.assignee_user_id);
  const approveAllDisabled = considered.length === 0 || bulkBusy !== null;
  const approveAllTooltip: string | null = null;
  const unassignedInConsideredCount = considered.filter((s) => !s.assignee_user_id).length;

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
          {unassignedInConsideredCount > 0 && (
            <AssigneePicker
              members={internalMembers}
              onSelect={async (m) => {
                setBulkBusy('approve');
                try { await bulkAssignUnassigned(considered, m); } finally { setBulkBusy(null); }
              }}
              trigger={
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[10px] gap-1"
                  disabled={bulkBusy !== null}
                  data-testid="bulk-assign"
                >
                  <UserPlus className="h-3 w-3" />
                  Bulk assign ({unassignedInConsideredCount})
                </Button>
              }
            />
          )}
          <ApproveAllButton
            disabled={approveAllDisabled}
            tooltip={approveAllTooltip}
            busy={bulkBusy === 'approve'}
            onClick={async () => {
              if (hasUnassignedInConsidered) {
                toast.error('Please choose an assignee before creating this task.');
                return;
              }
              setBulkBusy('approve');
              try { await approveAll(considered); } finally { setBulkBusy(null); }
            }}
          />
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
            const isSelected = selected.has(s.suggestion_id);
            const hasAssignee = !!s.assignee_user_id;
            const createDisabled = !hasAssignee || busyId === s.suggestion_id;
            return (
              <li
                key={s.suggestion_id}
                data-suggestion-id={s.suggestion_id}
                className={cn(
                  'flex items-start gap-2 rounded-md border px-2 py-1.5 text-xs transition-colors',
                  isConverted && 'border-emerald-500/30 bg-emerald-500/[0.06]',
                  isDismissed && 'border-white/[0.06] bg-white/[0.015] opacity-60',
                  isPending && 'border-white/[0.08] bg-white/[0.015] hover:bg-white/[0.04]',
                )}
              >
                <Checkbox
                  checked={isConverted || (isPending && isSelected)}
                  disabled={!isPending || busyId === s.suggestion_id}
                  onCheckedChange={() => { if (isPending) toggleSelected(s.suggestion_id); }}
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
                          data-assignee-chip={
                            s.assignment_source === 'deal-manager'
                              ? 'deal-manager'
                              : s.assignment_source === 'manual'
                                ? 'manual'
                                : s.assignment_source === 'viewer'
                                  ? 'viewer'
                                  : 'internal'
                          }
                          variant="outline"
                          className={cn(
                            'h-4 px-1 text-[9px] gap-0.5',
                            s.assignment_source === 'deal-manager'
                              ? 'border-sky-500/30 text-sky-200/90 bg-sky-500/[0.06]'
                              : s.assignment_source === 'viewer'
                                ? 'border-amber-500/30 text-amber-200/90 bg-amber-500/[0.06]'
                                : 'border-emerald-500/30 text-emerald-200/90 bg-emerald-500/[0.06]',
                          )}
                        >
                          <UserIcon className="h-2.5 w-2.5" />{' '}
                          {s.assignment_source === 'viewer' ? 'You' : s.assignee_name}
                          {s.assignment_source === 'deal-manager' && (
                            <span className="ml-0.5 inline-flex items-center rounded-sm border border-sky-400/30 bg-sky-400/[0.08] px-0.5 text-[8px] uppercase tracking-wider text-sky-200/80">
                              deal mgr
                            </span>
                          )}
                          {s.assignment_source === 'viewer' && (
                            <span className="ml-0.5 inline-flex items-center rounded-sm border border-amber-400/30 bg-amber-400/[0.08] px-0.5 text-[8px] uppercase tracking-wider text-amber-200/80">
                              default
                            </span>
                          )}
                        </Badge>
                      ) : isPending ? (
                        <AssigneePicker
                          members={internalMembers}
                          viewer={currentViewer}
                          onSelect={(m) => void assignManually(s, m)}
                          onClear={() => void clearAssignment(s)}
                          trigger={
                            <button
                              type="button"
                              data-assignee-chip="unassigned"
                              className="inline-flex items-center gap-0.5 h-4 px-1 rounded border text-[9px] border-amber-500/40 text-amber-200/90 bg-amber-500/[0.06] hover:bg-amber-500/[0.12] transition-colors"
                              aria-label="Choose assignee"
                            >
                              <UserIcon className="h-2.5 w-2.5" /> Unassigned
                            </button>
                          }
                        />
                      ) : (
                        <Badge data-assignee-chip="unassigned" variant="outline" className="h-4 px-1 text-[9px] gap-0.5 border-white/15 text-muted-foreground bg-transparent">
                          <UserIcon className="h-2.5 w-2.5" /> Unassigned
                        </Badge>
                      )}
                      {s.assignee_user_id && s.assignee_email && s.assignment_source !== 'viewer' && (
                        <Badge variant="outline" className="h-4 px-1 text-[9px] gap-0.5 border-white/15 text-muted-foreground bg-transparent">
                          <AtSign className="h-2.5 w-2.5" /> {s.assignee_email}
                        </Badge>
                      )}
                      {s.external_mention && (
                        <Badge
                          variant="outline"
                          className="h-4 px-1 text-[9px] gap-0.5 border-white/15 text-muted-foreground/80 bg-transparent italic"
                          title="External contact — cannot be assigned"
                        >
                          External contact: {s.external_mention}
                        </Badge>
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
                      <CreateTaskButton
                        disabled={createDisabled}
                        hasAssignee={hasAssignee}
                        busy={busyId === s.suggestion_id}
                        onClick={() => {
                          if (!hasAssignee) {
                            toast.error('Please choose an assignee before creating this task.');
                            return;
                          }
                          void handleApprove(s);
                        }}
                      />
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

/* ------------------------- internal subcomponents ------------------------- */

function CreateTaskButton({
  disabled, hasAssignee, busy, onClick,
}: { disabled: boolean; hasAssignee: boolean; busy: boolean; onClick: () => void }) {
  const btn = (
    <Button
      size="sm"
      className="h-6 px-2 text-[10px] gap-1"
      // Keep the click handler enabled so a disabled-click can fire the
      // inline toast; we use aria-disabled + visual styling instead.
      aria-disabled={disabled || undefined}
      data-testid="create-task"
      data-disabled={!hasAssignee ? 'true' : undefined}
      onClick={onClick}
      style={!hasAssignee ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
    >
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <ListPlus className="h-3 w-3" />}
      Create task
    </Button>
  );
  if (hasAssignee) return btn;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{btn}</TooltipTrigger>
        <TooltipContent side="top">Choose an assignee first</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function ApproveAllButton({
  disabled, tooltip, busy, onClick,
}: { disabled: boolean; tooltip: string | null; busy: boolean; onClick: () => void }) {
  const btn = (
    <Button
      size="sm"
      className="h-7 text-[10px] gap-1"
      aria-disabled={disabled || undefined}
      data-testid="approve-all"
      data-disabled={tooltip ? 'true' : undefined}
      onClick={onClick}
      style={tooltip ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
    >
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
      Approve all
    </Button>
  );
  if (!tooltip) return btn;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{btn}</TooltipTrigger>
        <TooltipContent side="top">{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function AssigneePicker({
  members, onSelect, trigger,
}: {
  members: InternalMember[];
  onSelect: (m: InternalMember) => void;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return members;
    return members.filter((m) =>
      (m.display_name || '').toLowerCase().includes(needle) ||
      (m.email || '').toLowerCase().includes(needle),
    );
  }, [members, q]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        className="w-64 p-1.5"
        align="start"
        data-testid="assignee-picker"
      >
        <div className="relative mb-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search team…"
            className="h-7 pl-7 text-xs"
          />
        </div>
        <div className="max-h-56 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="text-[11px] text-muted-foreground italic px-2 py-3 text-center">
              No matches
            </div>
          ) : (
            filtered.map((m) => (
              <button
                key={m.user_id}
                type="button"
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs hover:bg-white/[0.06] transition-colors"
                onClick={() => {
                  onSelect(m);
                  setOpen(false);
                  setQ('');
                }}
              >
                <UserIcon className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="flex-1 min-w-0 truncate">{m.display_name}</span>
                {m.email && (
                  <span className="text-[10px] text-muted-foreground/70 truncate max-w-[8rem]">
                    {m.email}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}