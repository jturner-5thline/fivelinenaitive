import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
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
import {
  Check,
  X,
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
  Search,
  Zap,
  ShieldAlert,
  Sparkles,
  ChevronRight,
} from 'lucide-react';
import { formatDistanceToNow, formatDistanceToNowStrict } from 'date-fns';
import {
  QueuedAiAction,
  AiActionType,
  useApproveAiAction,
  useApproveAllAiActions,
  useDismissAiAction,
} from '@/hooks/useAiActionQueue';
import { ClaapApprovalCard } from './ClaapApprovalCard';
import { ApprovalReviewExpanded } from './ApprovalReviewExpanded';
import { StagedDraftsPanel } from './StagedDraftsPanel';
import {
  buildOutcomeSentence,
  buildOnApproveSentence,
  targetSummary,
} from './approvalCopy';
import {
  useDealAccessRequests,
  useApproveDealAccessRequest,
  useDeclineDealAccessRequest,
  type DealAccessRequest,
} from '@/hooks/useDealAccessRequests';

const TYPE_META: Partial<Record<AiActionType, { label: string; icon: typeof CheckSquare; tone: string }>> = {
  create_task: { label: 'Create Task', icon: CheckSquare, tone: 'text-sky-300 bg-sky-500/10 ring-sky-400/20' },
  update_lender_status: { label: 'Update Lender', icon: Building2, tone: 'text-emerald-300 bg-emerald-500/10 ring-emerald-400/20' },
  save_to_data_room: { label: 'Save to Data Room', icon: Save, tone: 'text-violet-300 bg-violet-500/10 ring-violet-400/20' },
  log_note: { label: 'Log Note', icon: FileText, tone: 'text-amber-300 bg-amber-500/10 ring-amber-400/20' },
  deal_update: { label: 'Update Deal', icon: Briefcase, tone: 'text-blue-300 bg-blue-500/10 ring-blue-400/20' },
  claap_recording_review: { label: 'Claap Recording', icon: Video, tone: 'text-fuchsia-300 bg-fuchsia-500/10 ring-fuchsia-400/20' },
  claap_action_items: { label: 'Meeting Action Items', icon: ListChecks, tone: 'text-cyan-300 bg-cyan-500/10 ring-cyan-400/20' },
  update_deal_stage: { label: 'Update Stage', icon: Briefcase, tone: 'text-blue-300 bg-blue-500/10 ring-blue-400/20' },
  update_deal_status: { label: 'Update Status', icon: Briefcase, tone: 'text-blue-300 bg-blue-500/10 ring-blue-400/20' },
  add_status_note: { label: 'Status Note', icon: FileText, tone: 'text-amber-300 bg-amber-500/10 ring-amber-400/20' },
  update_funding_source: { label: 'Funding Source', icon: Building2, tone: 'text-emerald-300 bg-emerald-500/10 ring-emerald-400/20' },
  create_milestone: { label: 'Milestone', icon: CheckSquare, tone: 'text-sky-300 bg-sky-500/10 ring-sky-400/20' },
  update_milestone: { label: 'Milestone', icon: CheckSquare, tone: 'text-sky-300 bg-sky-500/10 ring-sky-400/20' },
  create_followup_task: { label: 'Follow-up Task', icon: CheckSquare, tone: 'text-sky-300 bg-sky-500/10 ring-sky-400/20' },
  update_contact: { label: 'Update Contact', icon: FileText, tone: 'text-amber-300 bg-amber-500/10 ring-amber-400/20' },
  update_company: { label: 'Update Company', icon: Building2, tone: 'text-emerald-300 bg-emerald-500/10 ring-emerald-400/20' },
  draft_email: { label: 'Draft Email', icon: FileText, tone: 'text-violet-300 bg-violet-500/10 ring-violet-400/20' },
  escalate: { label: 'Escalate', icon: ShieldAlert, tone: 'text-red-300 bg-red-500/10 ring-red-400/20' },
  reassign_deal: { label: 'Reassign', icon: Briefcase, tone: 'text-blue-300 bg-blue-500/10 ring-blue-400/20' },
};

function riskTone(level: string | null | undefined) {
  if (level === 'high') return 'border-red-500/30 text-red-300 bg-red-500/5';
  if (level === 'medium') return 'border-amber-500/30 text-amber-300 bg-amber-500/5';
  return 'border-emerald-500/30 text-emerald-300 bg-emerald-500/5';
}

function statusDot(level: string | null | undefined) {
  if (level === 'high') return 'bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.55)]';
  if (level === 'medium') return 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]';
  return 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]';
}

function expiryLabel(item: QueuedAiAction): string {
  const ms = new Date(item.expires_at).getTime() - Date.now();
  if (ms <= 0) return 'expired';
  return `expires in ${formatDistanceToNowStrict(new Date(item.expires_at))}`;
}

type FilterKey = 'all' | 'low' | 'review' | 'needs_you';

interface PanelProps {
  items: QueuedAiAction[];
  onClose?: () => void;
}

export function ActionQueuePanel({ items }: PanelProps) {
  const approve = useApproveAiAction();
  const approveAll = useApproveAllAiActions();
  const dismiss = useDismissAiAction();

  const { data: accessRequests = [] } = useDealAccessRequests();
  const approveAccess = useApproveDealAccessRequest();
  const declineAccess = useDeclineDealAccessRequest();

  const [tab, setTab] = useState<'queue' | 'staged'>('queue');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmApproveAllOpen, setConfirmApproveAllOpen] = useState(false);
  const [lowRiskBusy, setLowRiskBusy] = useState(false);

  const lowRiskItems = useMemo(
    () =>
      items.filter(
        (it) =>
          it.risk_level === 'low' &&
          it.action_type !== 'claap_recording_review' &&
          it.action_type !== 'claap_action_items',
      ),
    [items],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((it) => {
      if (filter === 'low' && it.risk_level !== 'low') return false;
      if (filter === 'review' && !(it.risk_level === 'medium' || it.risk_level === 'high')) return false;
      if (filter === 'needs_you' && !(it.priority === 'high' || it.risk_level === 'high')) return false;
      if (q) {
        const hay = `${it.title} ${it.deal_name ?? ''} ${it.description ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, filter, query]);

  // Selection: keep current if still visible; otherwise pick first.
  useEffect(() => {
    if (selectedId && filtered.some((it) => it.id === selectedId)) return;
    setSelectedId(filtered[0]?.id ?? null);
  }, [filtered, selectedId]);

  const expiringSoonCount = useMemo(() => {
    const now = Date.now();
    const sixHoursMs = 6 * 60 * 60 * 1000;
    return items.filter((it) => {
      const left = new Date(it.expires_at).getTime() - now;
      return left > 0 && left <= sixHoursMs;
    }).length;
  }, [items]);

  const selected = useMemo(
    () => filtered.find((it) => it.id === selectedId) || null,
    [filtered, selectedId],
  );

  const totalCount = items.length + accessRequests.length;

  return (
    <div className="flex flex-col h-full min-h-0 max-h-[82vh] text-foreground">
      {/* Top header strip */}
      <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between shrink-0 bg-gradient-to-b from-white/[0.025] to-transparent">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white/[0.04] ring-1 ring-inset ring-white/[0.06]">
            <InboxIcon className="h-3.5 w-3.5 text-foreground/70" />
          </span>
          <p className="text-[13px] font-semibold tracking-tight">Approval Queue</p>
          {totalCount > 0 && (
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px] bg-white/[0.06] text-foreground/80 border-0">
              {totalCount} pending
            </Badge>
          )}
          {expiringSoonCount > 0 && (
            <span className="ml-1 inline-flex items-center gap-1 text-[10px] text-amber-300/90 px-1.5 py-0.5 rounded-md border border-amber-500/25 bg-amber-500/[0.06]">
              <Clock className="h-2.5 w-2.5" /> {expiringSoonCount} expiring
            </span>
          )}
        </div>
        {items.length > 0 && (
          <AlertDialog open={confirmApproveAllOpen} onOpenChange={setConfirmApproveAllOpen}>
            <AlertDialogTrigger asChild>
              <Button
                size="sm"
                className="h-7 gap-1.5 text-[11px] mr-7 bg-white/[0.04] hover:bg-white/[0.08] text-foreground/90 border border-white/[0.08]"
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
                  This will approve and execute {items.length} action{items.length !== 1 ? 's' : ''} across all deals.
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

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="flex flex-col flex-1 min-h-0">
        <TabsList className="mx-4 mt-2.5 h-7 bg-white/[0.04] border border-white/[0.05] w-fit">
          <TabsTrigger value="queue" className="h-6 px-2.5 text-[11px] data-[state=active]:bg-white/[0.08]">
            Queue
          </TabsTrigger>
          <TabsTrigger value="staged" className="h-6 px-2.5 text-[11px] data-[state=active]:bg-white/[0.08]">
            Staged Drafts
          </TabsTrigger>
        </TabsList>

        <TabsContent value="staged" className="flex-1 min-h-0 overflow-y-auto mt-2">
          <StagedDraftsPanel />
        </TabsContent>

        <TabsContent value="queue" className="flex-1 min-h-0 mt-2 outline-none">
          {totalCount === 0 ? (
            <EmptyState />
          ) : (
            <div className="grid grid-cols-[320px_1fr] h-full min-h-0">
              {/* LEFT: Queue rail */}
              <aside className="flex flex-col min-h-0 border-r border-white/[0.06] bg-white/[0.012]">
                <div className="px-3 pt-2 pb-2 space-y-2 shrink-0">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-foreground/40" />
                    <Input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search actions…"
                      className="h-7 pl-7 text-[11px] bg-white/[0.03] border-white/[0.06] placeholder:text-foreground/30"
                    />
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {([
                      { k: 'all', label: 'All', count: items.length },
                      { k: 'low', label: 'Low risk', count: items.filter((i) => i.risk_level === 'low').length },
                      { k: 'review', label: 'Review', count: items.filter((i) => i.risk_level === 'medium' || i.risk_level === 'high').length },
                      { k: 'needs_you', label: 'Needs you', count: items.filter((i) => i.priority === 'high' || i.risk_level === 'high').length },
                    ] as Array<{ k: FilterKey; label: string; count: number }>).map((f) => {
                      const active = filter === f.k;
                      return (
                        <button
                          key={f.k}
                          onClick={() => setFilter(f.k)}
                          className={`h-6 px-2 rounded-full text-[10.5px] inline-flex items-center gap-1 transition-colors border ${
                            active
                              ? 'bg-primary/15 border-primary/35 text-primary'
                              : 'bg-white/[0.03] border-white/[0.06] text-foreground/65 hover:text-foreground hover:bg-white/[0.06]'
                          }`}
                        >
                          {f.label}
                          <span className={`text-[9px] ${active ? 'text-primary/80' : 'text-foreground/40'}`}>{f.count}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-3 space-y-2">
                  {lowRiskItems.length > 0 && filter !== 'review' && filter !== 'needs_you' && (
                    <div className="rounded-lg border border-emerald-400/20 bg-gradient-to-br from-emerald-500/[0.06] to-transparent overflow-hidden">
                      <div className="px-2.5 py-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Sparkles className="h-3 w-3 text-emerald-300 shrink-0" />
                          <span className="text-[11px] font-medium text-foreground/90 truncate">
                            {lowRiskItems.length} low-risk action{lowRiskItems.length === 1 ? '' : 's'}
                          </span>
                        </div>
                        <Button
                          size="sm"
                          className="h-6 px-2 text-[10px] gap-1 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 border border-emerald-400/25"
                          disabled={lowRiskBusy}
                          onClick={async () => {
                            setLowRiskBusy(true);
                            await approveAll(lowRiskItems);
                            setLowRiskBusy(false);
                          }}
                        >
                          {lowRiskBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCheck className="h-3 w-3" />}
                          Approve all
                        </Button>
                      </div>
                    </div>
                  )}

                  {accessRequests.length > 0 && (
                    <div className="pt-1">
                      <p className="px-1 pb-1 text-[9.5px] uppercase tracking-[0.08em] text-foreground/40">Access Requests</p>
                      <ul className="space-y-1">
                        {accessRequests.map((req) => (
                          <AccessRequestRow
                            key={req.id}
                            req={req}
                            onApprove={() => approveAccess(req)}
                            onDecline={() => declineAccess(req)}
                          />
                        ))}
                      </ul>
                    </div>
                  )}

                  {filtered.length > 0 ? (
                    <ul className="space-y-1">
                      {filtered.map((item) => (
                        <QueueRow
                          key={item.id}
                          item={item}
                          selected={selectedId === item.id}
                          onSelect={() => setSelectedId(item.id)}
                        />
                      ))}
                    </ul>
                  ) : (
                    <div className="px-3 py-6 text-center text-[11px] text-foreground/45">
                      No actions match this view.
                    </div>
                  )}
                </div>
              </aside>

              {/* RIGHT: Detail workspace */}
              <section className="min-h-0 overflow-y-auto bg-[#0a0b0f]">
                {selected ? (
                  <DetailPane
                    item={selected}
                    onApprove={() => approve(selected)}
                    onReject={() => dismiss(selected.id)}
                  />
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center text-foreground/40 gap-2 px-6">
                    <InboxIcon className="h-7 w-7 opacity-60" />
                    <p className="text-sm">Select an action to review</p>
                    <p className="text-[11px] max-w-[280px]">
                      Naitive groups low-risk items for bulk approval and surfaces higher-risk items for your call.
                    </p>
                  </div>
                )}
              </section>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-1 h-full flex-col items-center justify-center gap-2 py-16 text-center text-foreground/50">
      <InboxIcon className="h-7 w-7 opacity-50" />
      <p className="text-sm">Your queue is empty.</p>
      <p className="text-xs max-w-xs">
        Use “Add to Queue” on any AI suggestion to defer it for batch review.
      </p>
    </div>
  );
}

/* ============================ Queue Row ============================ */

function QueueRow({
  item,
  selected,
  onSelect,
}: {
  item: QueuedAiAction;
  selected: boolean;
  onSelect: () => void;
}) {
  const meta = TYPE_META[item.action_type];
  const Icon = meta?.icon ?? CheckSquare;
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={`group w-full text-left rounded-lg px-2.5 py-2 transition-all border ${
          selected
            ? 'bg-primary/[0.08] border-primary/40 shadow-[0_0_0_1px_rgba(99,102,241,0.25),0_8px_24px_-12px_rgba(99,102,241,0.45)]'
            : 'bg-white/[0.015] border-white/[0.04] hover:bg-white/[0.04] hover:border-white/[0.08]'
        }`}
      >
        <div className="flex items-start gap-2">
          <span className={`mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-md ring-1 ring-inset shrink-0 ${meta?.tone ?? 'text-foreground/60 bg-white/5 ring-white/10'}`}>
            <Icon className="h-3 w-3" />
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${statusDot(item.risk_level)}`} />
              <span className="text-[10px] uppercase tracking-[0.06em] text-foreground/45 truncate">
                {meta?.label ?? item.action_type}
              </span>
              {item.priority === 'high' && (
                <Badge variant="outline" className="h-3.5 px-1 text-[8.5px] border-primary/40 text-primary/90">
                  Priority
                </Badge>
              )}
            </div>
            <p className={`text-[12px] leading-snug line-clamp-2 mt-0.5 ${selected ? 'text-foreground' : 'text-foreground/90'}`}>
              {item.title}
            </p>
            <div className="flex items-center gap-1.5 mt-1 text-[10px] text-foreground/45 min-w-0">
              <span className="truncate">{item.deal_name || 'Unassigned'}</span>
              <span>·</span>
              <span className="shrink-0">{formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}</span>
            </div>
          </div>
          <ChevronRight
            className={`h-3.5 w-3.5 mt-1 shrink-0 transition-opacity ${
              selected ? 'opacity-90 text-primary' : 'opacity-0 group-hover:opacity-50 text-foreground/40'
            }`}
          />
        </div>
      </button>
    </li>
  );
}

/* ============================ Access Request Row ============================ */

function AccessRequestRow({
  req,
  onApprove,
  onDecline,
}: {
  req: DealAccessRequest;
  onApprove: () => Promise<unknown>;
  onDecline: () => Promise<unknown>;
}) {
  const [busy, setBusy] = useState<'a' | 'd' | null>(null);
  const name = req.requester_name || req.requester_email;
  return (
    <li className="rounded-lg border border-amber-500/20 bg-amber-500/[0.04] px-2.5 py-2">
      <div className="flex items-start gap-2">
        <KeyRound className="h-3.5 w-3.5 text-amber-300 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-[11.5px] font-medium truncate">{name}</p>
          <p className="text-[10px] text-foreground/55 truncate">
            wants access to <span className="text-foreground/80">{req.deal_name || 'Untitled Deal'}</span>
          </p>
        </div>
      </div>
      <div className="flex items-center justify-end gap-1 mt-1.5">
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-[10px]"
          disabled={busy !== null}
          onClick={async () => { setBusy('d'); await onDecline(); setBusy(null); }}
        >
          <X className="h-3 w-3 mr-1" /> Decline
        </Button>
        <Button
          size="sm"
          className="h-6 px-2 text-[10px] bg-primary/90 hover:bg-primary text-primary-foreground"
          disabled={busy !== null}
          onClick={async () => { setBusy('a'); await onApprove(); setBusy(null); }}
        >
          {busy === 'a' ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
          Approve
        </Button>
      </div>
    </li>
  );
}

/* ============================ Detail Pane ============================ */

function DetailPane({
  item,
  onApprove,
  onReject,
}: {
  item: QueuedAiAction;
  onApprove: () => Promise<unknown>;
  onReject: () => Promise<unknown>;
}) {
  const meta = TYPE_META[item.action_type];
  const Icon = meta?.icon ?? CheckSquare;
  const outcome = buildOutcomeSentence(item);
  const onApproveSentence = buildOnApproveSentence(item);
  const target = targetSummary(item);

  // Claap items keep their dedicated card.
  if (item.action_type === 'claap_recording_review' || item.action_type === 'claap_action_items') {
    return (
      <div className="p-4">
        <ClaapApprovalCard item={item} />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <div className="px-5 pt-4 pb-3 border-b border-white/[0.05] bg-gradient-to-b from-white/[0.02] to-transparent">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.09em] text-foreground/45">
              <span className={`inline-flex h-4 w-4 items-center justify-center rounded ring-1 ring-inset ${meta?.tone ?? 'text-foreground/60 bg-white/5 ring-white/10'}`}>
                <Icon className="h-2.5 w-2.5" />
              </span>
              <span>{meta?.label ?? item.action_type}</span>
              {item.source?.origin === 'admin_agent' && (
                <>
                  <span className="text-foreground/25">·</span>
                  <span className="text-primary/80">Admin Agent</span>
                </>
              )}
            </div>
            <h2 className="mt-1.5 text-[16px] font-semibold leading-snug text-foreground line-clamp-2">
              {item.title}
            </h2>
            <p className="text-[12px] text-foreground/55 mt-0.5">{target}</p>
          </div>
          {item.risk_level && (
            <span className={`shrink-0 inline-flex items-center gap-1 text-[10px] uppercase tracking-wide px-2 py-1 rounded-md border ${riskTone(item.risk_level)}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${statusDot(item.risk_level)}`} />
              {item.risk_level} risk
            </span>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-[10.5px] text-foreground/50">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Suggested {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
          </span>
          <span className="text-foreground/20">·</span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {expiryLabel(item)}
          </span>
          {item.priority && item.priority !== 'normal' && (
            <>
              <span className="text-foreground/20">·</span>
              <span className="capitalize text-primary/80">{item.priority} priority</span>
            </>
          )}
        </div>
      </div>

      {/* What will happen — primary callout */}
      <div className="px-5 pt-4">
        <div className="rounded-lg border border-primary/25 bg-gradient-to-br from-primary/[0.08] to-primary/[0.02] px-3.5 py-3 flex items-start gap-2.5 shadow-[0_0_0_1px_rgba(99,102,241,0.08)]">
          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/15 ring-1 ring-inset ring-primary/30">
            <Zap className="h-3.5 w-3.5 text-primary" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.08em] text-primary/75">If you approve</p>
            <p className="text-[12.5px] leading-snug text-foreground/95 mt-0.5">{onApproveSentence}</p>
            <p className="text-[11px] text-foreground/55 mt-1">{outcome}</p>
          </div>
        </div>
      </div>

      {/* Full review body (diff, rationale, evidence, action bar) */}
      <div className="px-5 pt-3 pb-5 flex-1">
        <ApprovalReviewExpanded item={item} />
      </div>
    </div>
  );
}