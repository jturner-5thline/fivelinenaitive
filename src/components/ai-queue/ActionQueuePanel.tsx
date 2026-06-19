import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Check,
  X,
  Pencil,
  CheckCheck,
  Inbox as InboxIcon,
  Clock,
  Briefcase,
  CheckSquare,
  FileText,
  Building2,
  Save,
  Loader2,
  KeyRound,
  Video,
  ListChecks,
} from 'lucide-react';
import { formatDistanceToNow, formatDistanceToNowStrict } from 'date-fns';
import {
  QueuedAiAction,
  AiActionType,
  useApproveAiAction,
  useApproveAllAiActions,
  useDismissAiAction,
  useDismissManyAiActions,
  useUpdateAiAction,
} from '@/hooks/useAiActionQueue';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ClaapApprovalCard } from './ClaapApprovalCard';
import {
  useDealAccessRequests,
  useApproveDealAccessRequest,
  useDeclineDealAccessRequest,
  type DealAccessRequest,
} from '@/hooks/useDealAccessRequests';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

const TYPE_META: Record<AiActionType, { label: string; icon: typeof CheckSquare; color: string }> = {
  create_task: { label: 'Create Task', icon: CheckSquare, color: 'text-sky-500' },
  update_lender_status: { label: 'Update Lender', icon: Building2, color: 'text-emerald-500' },
  save_to_data_room: { label: 'Save to Data Room', icon: Save, color: 'text-violet-500' },
  log_note: { label: 'Log Note', icon: FileText, color: 'text-amber-500' },
  deal_update: { label: 'Update Deal', icon: Briefcase, color: 'text-blue-500' },
  claap_recording_review: { label: 'Claap Recording', icon: Video, color: 'text-fuchsia-500' },
  claap_action_items: { label: 'Meeting Action Items', icon: ListChecks, color: 'text-cyan-500' },
};

function expiryLabel(item: QueuedAiAction): string {
  const ms = new Date(item.expires_at).getTime() - Date.now();
  if (ms <= 0) return 'expired';
  return `expires in ${formatDistanceToNowStrict(new Date(item.expires_at))}`;
}

interface PanelProps {
  items: QueuedAiAction[];
  onClose?: () => void;
}

export function ActionQueuePanel({ items, onClose }: PanelProps) {
  const approve = useApproveAiAction();
  const approveAll = useApproveAllAiActions();
  const dismiss = useDismissAiAction();
  const dismissMany = useDismissManyAiActions();
  const updateItem = useUpdateAiAction();

  const { data: accessRequests = [] } = useDealAccessRequests();
  const approveAccess = useApproveDealAccessRequest();
  const declineAccess = useDeclineDealAccessRequest();
  const [accessBusyId, setAccessBusyId] = useState<string | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [groupBusy, setGroupBusy] = useState<string | null>(null);
  const [confirmApproveAllOpen, setConfirmApproveAllOpen] = useState(false);

  // Group by deal (or "Unassigned")
  const grouped = useMemo(() => {
    const map = new Map<string, { dealId: string | null; dealName: string; items: QueuedAiAction[] }>();
    for (const it of items) {
      const key = it.deal_id || '__none__';
      const name = it.deal_name || (it.deal_id ? 'Untitled Deal' : 'Unassigned');
      if (!map.has(key)) map.set(key, { dealId: it.deal_id, dealName: name, items: [] });
      map.get(key)!.items.push(it);
    }
    return Array.from(map.values()).sort((a, b) => {
      // Unassigned bucket always sinks to the bottom
      if (!a.dealId && b.dealId) return 1;
      if (a.dealId && !b.dealId) return -1;
      return a.dealName.localeCompare(b.dealName);
    });
  }, [items]);

  // Items within 6h of their 48h expiry — surfaces a reminder banner so the
  // user knows to act before they auto-drop.
  const expiringSoon = useMemo(() => {
    const now = Date.now();
    const sixHoursMs = 6 * 60 * 60 * 1000;
    return items.filter((it) => {
      const left = new Date(it.expires_at).getTime() - now;
      return left > 0 && left <= sixHoursMs;
    });
  }, [items]);

  const startEdit = (item: QueuedAiAction) => {
    setEditingId(item.id);
    setEditTitle(item.title);
    setEditDesc(item.description || '');
  };

  const saveEdit = async () => {
    if (!editingId) return;
    await updateItem(editingId, { title: editTitle, description: editDesc });
    setEditingId(null);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-3 py-2.5 border-b border-white/10 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <InboxIcon className="h-4 w-4 text-muted-foreground" />
          <p className="font-medium text-sm">Approval Queue</p>
          {(items.length + accessRequests.length) > 0 && (
            <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
              {items.length + accessRequests.length}
            </Badge>
          )}
        </div>
        {items.length > 0 && (
          <AlertDialog open={confirmApproveAllOpen} onOpenChange={setConfirmApproveAllOpen}>
            <AlertDialogTrigger asChild>
              <Button
                size="sm"
                variant="liquid-glass"
                className="h-7 gap-1 text-[11px] mr-7"
                disabled={bulkBusy}
              >
                {bulkBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCheck className="h-3 w-3" />}
                Approve all
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Approve all queued actions?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will approve and execute {items.length} action{items.length !== 1 ? 's' : ''} across all deals. You can undo individual approvals from the toast that appears for each.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={async () => {
                    setBulkBusy(true);
                    await approveAll(items);
                    setBulkBusy(false);
                  }}
                >
                  Approve all
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {items.length === 0 && accessRequests.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center text-muted-foreground">
          <InboxIcon className="h-6 w-6 opacity-50" />
          <p className="text-sm">Your queue is empty.</p>
          <p className="text-xs">
            Use “Add to Queue” on any AI suggestion to defer it for batch review.
          </p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col">
          {expiringSoon.length > 0 && (
            <div className="mx-3 mt-2 mb-1 flex items-center gap-2 rounded-md border border-amber-500/30 bg-transparent px-2.5 py-1.5 text-[11px] text-amber-300">
              <Clock className="h-3 w-3 shrink-0" />
              <span>
                {expiringSoon.length === 1
                  ? '1 queued action expires within 6 hours.'
                  : `${expiringSoon.length} queued actions expire within 6 hours.`}
                {' '}Approve or dismiss before they auto-drop at 48h.
              </span>
            </div>
          )}
          <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="p-2 space-y-3">
            {accessRequests.length > 0 && (
              <div className="rounded-md border border-white/10 bg-transparent overflow-hidden">
                <div className="px-3 py-2 flex items-center justify-between border-b border-white/10 bg-transparent">
                  <div className="flex items-center gap-2 min-w-0">
                    <KeyRound className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                    <span className="text-xs font-semibold text-foreground truncate">
                      Deal Access Requests
                    </span>
                    <Badge variant="secondary" className="h-4 px-1.5 text-[10px] shrink-0">
                      {accessRequests.length}
                    </Badge>
                  </div>
                </div>
                <ul className="divide-y divide-border/40">
                  {accessRequests.map((req) => {
                    const busy = accessBusyId === req.id;
                    const displayName = req.requester_name || req.requester_email;
                    return (
                      <li key={req.id} className="p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <KeyRound className="h-4 w-4 text-amber-500 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sm truncate">{displayName}</span>
                                <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30 text-[10px]">
                                  Access Request
                                </Badge>
                                <Badge variant="secondary" className="text-[10px] capitalize">
                                  {req.status}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground truncate">
                                {req.requester_name ? `${req.requester_email} • ` : ''}
                                wants access to{' '}
                                <span className="font-medium text-foreground">
                                  {req.deal_name || 'Untitled Deal'}
                                </span>
                              </p>
                              <p className="text-[11px] text-muted-foreground mt-0.5 inline-flex items-center gap-1">
                                <Clock className="h-2.5 w-2.5" />
                                Requested {formatDistanceToNow(new Date(req.requested_at), { addSuffix: true })}
                              </p>
                              {req.message && (
                                <p className="text-[11px] text-muted-foreground mt-1 italic line-clamp-2">
                                  “{req.message}”
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0 ml-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2"
                              disabled={busy}
                              onClick={async () => {
                                setAccessBusyId(req.id);
                                await declineAccess(req);
                                setAccessBusyId(null);
                              }}
                            >
                              <X className="h-3 w-3 mr-1" />
                              Decline
                            </Button>
                            <Button
                              size="sm"
                              className="h-7 px-2 bg-gradient-to-r from-primary to-primary/70 text-primary-foreground hover:from-primary/90 hover:to-primary/60 shadow-sm"
                              disabled={busy}
                              onClick={async () => {
                                setAccessBusyId(req.id);
                                await approveAccess(req);
                                setAccessBusyId(null);
                              }}
                            >
                              {busy ? (
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                              ) : (
                                <Check className="h-3 w-3 mr-1" />
                              )}
                              Approve
                            </Button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {grouped.map(group => {
              const groupKey = group.dealId || '__none__';
              const typeSummary = Array.from(
                group.items.reduce((acc, it) => {
                  const label = TYPE_META[it.action_type]?.label || it.action_type;
                  acc.set(label, (acc.get(label) || 0) + 1);
                  return acc;
                }, new Map<string, number>()),
              )
                .map(([label, n]) => `${n} ${label}${n !== 1 ? 's' : ''}`)
                .join(' · ');
              const isGroupBusy = groupBusy === groupKey;
              return (
              <div key={groupKey} className="rounded-md border border-white/10 bg-transparent overflow-hidden">
                <div className="px-3 py-2 flex items-center justify-between border-b border-white/10 bg-transparent">
                  <div className="flex items-center gap-2 min-w-0">
                    <Briefcase className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-xs font-semibold text-foreground truncate">
                      {group.dealName}
                    </span>
                    <Badge variant="secondary" className="h-4 px-1.5 text-[10px] shrink-0">
                      {group.items.length}
                    </Badge>
                    {typeSummary && (
                      <span className="text-[10px] text-muted-foreground truncate hidden sm:inline">
                        {typeSummary}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[10px] gap-1 text-muted-foreground hover:text-destructive"
                      onClick={async () => {
                        setGroupBusy(groupKey);
                        await dismissMany(group.items.map(i => i.id));
                        setGroupBusy(null);
                      }}
                      disabled={isGroupBusy || bulkBusy}
                    >
                      <X className="h-3 w-3" /> Dismiss all
                    </Button>
                    <Button
                      size="sm"
                      variant="liquid-glass"
                      className="h-6 px-2 text-[10px] gap-1"
                      onClick={async () => {
                        setGroupBusy(groupKey);
                        await approveAll(group.items);
                        setGroupBusy(null);
                      }}
                      disabled={isGroupBusy || bulkBusy}
                    >
                      {isGroupBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCheck className="h-3 w-3" />}
                      Approve all
                    </Button>
                  </div>
                </div>
                <ul className="divide-y divide-border/40">
                  {group.items.map(item => {
                    // Claap approval cards get a dedicated renderer with their own
                    // two-stage approval flow (relationship matching vs. action items).
                    if (item.action_type === 'claap_recording_review' || item.action_type === 'claap_action_items') {
                      return (
                        <li key={item.id} className="p-2.5">
                          <ClaapApprovalCard item={item} />
                        </li>
                      );
                    }
                    const meta = TYPE_META[item.action_type];
                    const Icon = meta?.icon ?? CheckSquare;
                    const isEditing = editingId === item.id;
                    return (
                      <li key={item.id} className="p-2.5 space-y-1.5">
                        <div className="flex items-start gap-2">
                          <Icon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${meta?.color || ''}`} />
                          <div className="flex-1 min-w-0">
                            {isEditing ? (
                              <div className="space-y-1.5">
                                <Input
                                  value={editTitle}
                                  onChange={e => setEditTitle(e.target.value)}
                                  className="h-7 text-xs"
                                />
                                <Textarea
                                  value={editDesc}
                                  onChange={e => setEditDesc(e.target.value)}
                                  className="min-h-[44px] text-xs"
                                />
                              </div>
                            ) : (
                              <>
                                <p className="text-xs font-medium text-foreground line-clamp-2 break-words" title={item.title}>{item.title}</p>
                                {item.description && (
                                  <p className="text-[11px] text-muted-foreground line-clamp-3 break-words" title={item.description}>{item.description}</p>
                                )}
                              </>
                            )}
                            <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                              <span className="uppercase tracking-wide">{meta?.label}</span>
                              {item.source?.origin === 'admin_agent' && (
                                <>
                                  <span>·</span>
                                  <Badge
                                    variant="outline"
                                    className="h-4 px-1.5 text-[9px] font-medium border-primary/40 bg-primary/10 text-primary uppercase tracking-wide"
                                  >
                                    Admin Agent
                                  </Badge>
                                </>
                              )}
                              <span>·</span>
                              <span>{formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}</span>
                              <span>·</span>
                              <span className="inline-flex items-center gap-0.5"><Clock className="h-2.5 w-2.5" />{expiryLabel(item)}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center justify-end gap-1">
                          {isEditing ? (
                            <>
                              <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => setEditingId(null)}>
                                Cancel
                              </Button>
                              <Button size="sm" variant="default" className="h-6 px-2 text-[10px] gap-1" onClick={saveEdit}>
                                <Save className="h-3 w-3" /> Save
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] gap-1 text-muted-foreground" onClick={() => startEdit(item)}>
                                <Pencil className="h-3 w-3" /> Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-2 text-[10px] gap-1 text-muted-foreground hover:text-destructive"
                                onClick={() => dismiss(item.id)}
                              >
                                <X className="h-3 w-3" /> Dismiss
                              </Button>
                              <Button
                                size="sm"
                                variant="liquid-glass"
                                className="h-6 px-2 text-[10px] gap-1"
                                disabled={busyId === item.id}
                                onClick={async () => {
                                  setBusyId(item.id);
                                  await approve(item);
                                  setBusyId(null);
                                }}
                              >
                                {busyId === item.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                                Approve
                              </Button>
                            </>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
              );
            })}
          </div>
        </div>
        </div>
      )}
    </div>
  );
}