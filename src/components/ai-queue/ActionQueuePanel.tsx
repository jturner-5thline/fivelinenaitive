import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  X,
  Inbox as InboxIcon,
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
  ShieldAlert,
  ArrowRight,
  ExternalLink,
  Link as LinkIcon,
  Pencil,
  Eye,
  ClipboardCheck,
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
  approveButtonLabel,
  targetSummary,
} from './approvalCopy';
import {
  useDealAccessRequests,
  useApproveDealAccessRequest,
  useDeclineDealAccessRequest,
  type DealAccessRequest,
} from '@/hooks/useDealAccessRequests';

/* ─────────────────────────────────────────────────────────────────────────
   naitive design tokens (scoped to the Approval Queue surface)
   - Void background #06060a + radial violet/cyan glows
   - Glass cards rgba(255,255,255,.035), hairlines rgba(255,255,255,.08)
   - Accent gradient #5ecdf5 → #9b6fd4
   - Risk: low #6fe3b0 · review #f3c969 · needs-you #f58aa0
   - Type: Syne (display) · Inter (body) · DM Mono (labels/meta)
   ──────────────────────────────────────────────────────────────────────── */
const FONT_DISPLAY = { fontFamily: '"Syne", "Inter", system-ui, sans-serif' };
const FONT_MONO = { fontFamily: '"DM Mono", ui-monospace, SFMono-Regular, monospace' };
const FONT_BODY = { fontFamily: '"Inter", system-ui, sans-serif' };

const RISK = {
  low: { hex: '#6fe3b0', label: 'Low risk' },
  review: { hex: '#f3c969', label: 'Needs review' },
  needs_you: { hex: '#f58aa0', label: 'Needs your call' },
} as const;
type RiskKey = keyof typeof RISK;

function riskOf(item: QueuedAiAction): RiskKey {
  if (item.priority === 'high' || item.risk_level === 'high') return 'needs_you';
  if (item.risk_level === 'medium') return 'review';
  return 'low';
}

/** Dotted concentric-ring naitive mark, filled with the cyan→periwinkle gradient. */
function NaitiveMark({ size = 22 }: { size?: number }) {
  const id = `naitive-grad-${size}`;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#5ecdf5" />
          <stop offset="100%" stopColor="#9b6fd4" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="14" fill="none" stroke={`url(#${id})`} strokeWidth="1.25" strokeDasharray="1.6 2.4" />
      <circle cx="16" cy="16" r="9" fill="none" stroke={`url(#${id})`} strokeWidth="1.25" strokeDasharray="1.6 2.4" />
      <circle cx="16" cy="16" r="3.2" fill={`url(#${id})`} />
    </svg>
  );
}

const TYPE_META: Partial<Record<AiActionType, { label: string; icon: typeof CheckSquare }>> = {
  create_task: { label: 'Task', icon: CheckSquare },
  update_lender_status: { label: 'Funding source', icon: Building2 },
  save_to_data_room: { label: 'Data room', icon: Save },
  log_note: { label: 'Note', icon: FileText },
  deal_update: { label: 'Deal', icon: Briefcase },
  claap_recording_review: { label: 'Claap recording', icon: Video },
  claap_action_items: { label: 'Meeting actions', icon: ListChecks },
  update_deal_stage: { label: 'Stage', icon: Briefcase },
  update_deal_status: { label: 'Status', icon: Briefcase },
  add_status_note: { label: 'Status note', icon: FileText },
  update_funding_source: { label: 'Funding source', icon: Building2 },
  create_milestone: { label: 'Milestone', icon: CheckSquare },
  update_milestone: { label: 'Milestone', icon: CheckSquare },
  create_followup_task: { label: 'Follow-up', icon: CheckSquare },
  update_contact: { label: 'Contact', icon: FileText },
  update_company: { label: 'Company', icon: Building2 },
  draft_email: { label: 'Email draft', icon: FileText },
  escalate: { label: 'Escalation', icon: ShieldAlert },
  reassign_deal: { label: 'Reassign', icon: Briefcase },
};

function expiryDaysLabel(item: QueuedAiAction): string {
  const ms = new Date(item.expires_at).getTime() - Date.now();
  if (ms <= 0) return 'expired';
  return `in ${formatDistanceToNowStrict(new Date(item.expires_at))}`;
}

/* ─────────────────────────────────────────────────────────────────────────
   Main panel
   ──────────────────────────────────────────────────────────────────────── */

type FilterKey = 'all' | 'low' | 'review' | 'needs_you';

interface PanelProps {
  items: QueuedAiAction[];
  onClose?: () => void;
}

export function ActionQueuePanel({ items, onClose }: PanelProps) {
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
  const [bulkLowBusy, setBulkLowBusy] = useState(false);
  const [bulkAllBusy, setBulkAllBusy] = useState(false);

  const lowRiskItems = useMemo(
    () =>
      items.filter(
        (it) =>
          riskOf(it) === 'low' &&
          it.action_type !== 'claap_recording_review' &&
          it.action_type !== 'claap_action_items',
      ),
    [items],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((it) => {
      const r = riskOf(it);
      if (filter !== 'all' && filter !== r) return false;
      if (q) {
        const hay = `${it.title} ${it.deal_name ?? ''} ${it.description ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, filter, query]);

  // Keep selection if visible; otherwise pick first.
  useEffect(() => {
    if (selectedId && filtered.some((it) => it.id === selectedId)) return;
    setSelectedId(filtered[0]?.id ?? null);
  }, [filtered, selectedId]);

  const selected = useMemo(
    () => filtered.find((it) => it.id === selectedId) || null,
    [filtered, selectedId],
  );

  const totalCount = items.length + accessRequests.length;
  const counts = {
    all: items.length,
    low: items.filter((i) => riskOf(i) === 'low').length,
    review: items.filter((i) => riskOf(i) === 'review').length,
    needs_you: items.filter((i) => riskOf(i) === 'needs_you').length,
  };

  return (
    <div
      className="relative flex flex-col h-full min-h-0 max-h-[88vh] text-[#ecedf4] motion-reduce:transform-none"
      style={{ ...FONT_BODY, background: '#06060a' }}
    >
      {/* Ambient glows */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 motion-reduce:hidden"
        style={{
          background:
            'radial-gradient(60% 40% at 100% 0%, rgba(155,111,212,0.16) 0%, transparent 60%), radial-gradient(50% 40% at 0% 100%, rgba(94,205,245,0.10) 0%, transparent 65%)',
        }}
      />

      {/* Header */}
      <div className="relative px-5 py-4 border-b border-white/[0.08] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <NaitiveMark size={22} />
          <h2 className="text-[18px] leading-none tracking-tight" style={FONT_DISPLAY}>
            Approval Queue
          </h2>
          <span
            className="ml-1 inline-flex items-center h-5 px-2 rounded-full text-[10px] uppercase border border-white/[0.10] bg-white/[0.04] text-[#ecedf4]/80"
            style={{ ...FONT_MONO, letterSpacing: '0.08em' }}
          >
            {totalCount} pending
          </span>
        </div>
        <div className="flex items-center gap-2">
          {counts.low > 0 && tab === 'queue' && (
            <Button
              variant="ghost"
              size="sm"
              disabled={bulkAllBusy}
              onClick={async () => {
                setBulkAllBusy(true);
                await approveAll(lowRiskItems);
                setBulkAllBusy(false);
              }}
              className="h-8 px-3 text-[11px] rounded-lg border border-white/[0.10] bg-white/[0.035] hover:bg-white/[0.07] text-[#ecedf4]/85"
              style={FONT_MONO}
            >
              {bulkAllBusy ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : null}
              Approve {counts.low} low-risk
            </Button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.035] text-[#ecedf4]/70 hover:text-[#ecedf4] hover:bg-white/[0.07] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5ecdf5]"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      <div
        className="relative px-5 pt-1 pb-3 text-[10.5px] uppercase text-[#ecedf4]/58 border-b border-white/[0.05]"
        style={{ ...FONT_MONO, letterSpacing: '0.10em' }}
      >
        naitive suggested actions · synced just now
      </div>

      {/* Body */}
      {tab === 'staged' ? (
        <div className="relative flex-1 min-h-0 overflow-y-auto">
          <div className="px-5 pt-3">
            <TabBar tab={tab} setTab={setTab} queueCount={totalCount} stagedCount={0} />
          </div>
          <StagedDraftsPanel />
        </div>
      ) : totalCount === 0 ? (
        <EmptyState />
      ) : (
        <div className="relative grid grid-cols-1 md:grid-cols-[392px_1fr] flex-1 min-h-0">
          {/* LEFT RAIL */}
          <aside className="flex flex-col min-h-0 md:border-r border-white/[0.08]">
            <div className="px-4 pt-3 pb-2 space-y-3 shrink-0">
              <TabBar tab={tab} setTab={setTab} queueCount={totalCount} stagedCount={0} />

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#ecedf4]/40" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search actions, deals…"
                  className="h-8 pl-8 text-[12px] rounded-lg bg-white/[0.035] border-white/[0.08] text-[#ecedf4] placeholder:text-[#ecedf4]/34 focus-visible:ring-1 focus-visible:ring-[#5ecdf5]/60"
                  style={FONT_BODY}
                />
              </div>

              {/* Filter chips */}
              <div className="flex flex-wrap gap-1.5">
                <FilterChip label="All" count={counts.all} active={filter === 'all'} onClick={() => setFilter('all')} />
                <FilterChip
                  label="Low risk"
                  dot={RISK.low.hex}
                  count={counts.low}
                  active={filter === 'low'}
                  onClick={() => setFilter('low')}
                />
                <FilterChip
                  label="Review"
                  dot={RISK.review.hex}
                  count={counts.review}
                  active={filter === 'review'}
                  onClick={() => setFilter('review')}
                />
                <FilterChip
                  label="Needs you"
                  dot={RISK.needs_you.hex}
                  count={counts.needs_you}
                  active={filter === 'needs_you'}
                  onClick={() => setFilter('needs_you')}
                />
              </div>

              {/* Bulk low-risk card */}
              {lowRiskItems.length > 0 && filter !== 'review' && filter !== 'needs_you' && (
                <div
                  className="rounded-[13px] border border-[#6fe3b0]/25 p-3 flex items-center gap-3"
                  style={{
                    background:
                      'linear-gradient(135deg, rgba(111,227,176,0.08) 0%, rgba(255,255,255,0.025) 100%)',
                  }}
                >
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#6fe3b0]/15 ring-1 ring-inset ring-[#6fe3b0]/30 shrink-0">
                    <ClipboardCheck className="h-4 w-4 text-[#6fe3b0]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] text-[#ecedf4]" style={FONT_BODY}>
                      {lowRiskItems.length} low-risk action{lowRiskItems.length === 1 ? '' : 's'}
                    </p>
                    <p
                      className="text-[10px] uppercase text-[#ecedf4]/58 mt-0.5"
                      style={{ ...FONT_MONO, letterSpacing: '0.08em' }}
                    >
                      milestones, notes, follow-up tasks
                    </p>
                  </div>
                  <Button
                    size="sm"
                    disabled={bulkLowBusy}
                    onClick={async () => {
                      setBulkLowBusy(true);
                      await approveAll(lowRiskItems);
                      setBulkLowBusy(false);
                    }}
                    className="h-7 px-2.5 text-[11px] rounded-md bg-[#6fe3b0]/15 hover:bg-[#6fe3b0]/25 text-[#6fe3b0] border border-[#6fe3b0]/30"
                    style={FONT_MONO}
                  >
                    {bulkLowBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Approve all'}
                  </Button>
                </div>
              )}
            </div>

            {/* Scrollable row list */}
            <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3 space-y-3">
              {accessRequests.length > 0 && (
                <div className="space-y-1">
                  <p
                    className="px-1 pt-1 text-[9.5px] uppercase text-[#ecedf4]/45"
                    style={{ ...FONT_MONO, letterSpacing: '0.10em' }}
                  >
                    Access requests
                  </p>
                  {accessRequests.map((req) => (
                    <AccessRequestRow
                      key={req.id}
                      req={req}
                      onApprove={() => approveAccess(req)}
                      onDecline={() => declineAccess(req)}
                    />
                  ))}
                </div>
              )}

              {filtered.length > 0 ? (
                <ul className="space-y-1.5">
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
                <div className="px-3 py-8 text-center text-[12px] text-[#ecedf4]/45" style={FONT_BODY}>
                  No actions match this view.
                </div>
              )}
            </div>
          </aside>

          {/* RIGHT DETAIL */}
          <section className="min-h-0 flex flex-col">
            {selected ? (
              <DetailPane
                key={selected.id}
                item={selected}
                onApprove={() => approve(selected)}
                onReject={() => dismiss(selected.id)}
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center text-[#ecedf4]/45 gap-3 px-6">
                <NaitiveMark size={42} />
                <p className="text-[14px]" style={FONT_BODY}>
                  Select an action to review
                </p>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Tabs
   ──────────────────────────────────────────────────────────────────────── */
function TabBar({
  tab,
  setTab,
  queueCount,
  stagedCount,
}: {
  tab: 'queue' | 'staged';
  setTab: (t: 'queue' | 'staged') => void;
  queueCount: number;
  stagedCount: number;
}) {
  return (
    <div className="flex items-center gap-1">
      <TabBtn label="Queue" count={queueCount} active={tab === 'queue'} onClick={() => setTab('queue')} />
      <TabBtn label="Staged drafts" count={stagedCount} active={tab === 'staged'} onClick={() => setTab('staged')} />
    </div>
  );
}
function TabBtn({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group inline-flex items-center gap-2 h-8 px-3 rounded-lg border text-[12px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#5ecdf5] ${
        active
          ? 'border-white/[0.12] bg-white/[0.06] text-[#ecedf4]'
          : 'border-transparent text-[#ecedf4]/58 hover:text-[#ecedf4] hover:bg-white/[0.035]'
      }`}
      style={FONT_BODY}
    >
      {label}
      <span
        className={`inline-flex items-center h-4 px-1.5 rounded-full text-[10px] ${
          active ? 'bg-white/[0.08] text-[#ecedf4]/85' : 'bg-white/[0.04] text-[#ecedf4]/55'
        }`}
        style={FONT_MONO}
      >
        {count}
      </span>
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Filter chip
   ──────────────────────────────────────────────────────────────────────── */
function FilterChip({
  label,
  count,
  active,
  onClick,
  dot,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  dot?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-[11px] border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#5ecdf5] ${
        active
          ? 'bg-white/[0.08] border-white/[0.16] text-[#ecedf4]'
          : 'bg-white/[0.025] border-white/[0.08] text-[#ecedf4]/58 hover:text-[#ecedf4] hover:bg-white/[0.05]'
      }`}
      style={FONT_BODY}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full" style={{ background: dot }} />}
      {label}
      <span className="text-[10px] text-[#ecedf4]/55" style={FONT_MONO}>
        {count}
      </span>
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Queue row
   ──────────────────────────────────────────────────────────────────────── */
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
  const risk = riskOf(item);
  const dot = RISK[risk].hex;

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? 'true' : undefined}
        className={`relative w-full text-left rounded-[13px] pl-3 pr-3 py-2.5 border transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#5ecdf5] ${
          selected
            ? 'border-white/[0.10] shadow-[0_8px_30px_-12px_rgba(155,111,212,0.45)]'
            : 'border-white/[0.05] hover:bg-white/[0.03] hover:border-white/[0.10]'
        }`}
        style={
          selected
            ? {
                background:
                  'linear-gradient(110deg, rgba(46,12,96,0.45) 0%, rgba(255,255,255,0.03) 70%)',
              }
            : { background: 'rgba(255,255,255,0.018)' }
        }
      >
        {selected && (
          <span
            className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full"
            style={{ background: 'linear-gradient(180deg, #5ecdf5 0%, #9b6fd4 100%)' }}
          />
        )}
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-[9px] bg-white/[0.04] border border-white/[0.08] shrink-0">
            <Icon className="h-3.5 w-3.5 text-[#ecedf4]/75" />
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span
                className="h-1.5 w-1.5 rounded-full shrink-0"
                style={{ background: dot, boxShadow: `0 0 8px ${dot}66` }}
              />
              <p
                className="text-[12.5px] text-[#ecedf4] truncate"
                style={FONT_BODY}
                title={item.title}
              >
                {item.title}
              </p>
            </div>
            <p
              className="text-[10.5px] text-[#ecedf4]/55 truncate mt-0.5"
              style={{ ...FONT_MONO, letterSpacing: '0.04em' }}
            >
              {(meta?.label ?? 'Action').toUpperCase()} · {item.deal_name || 'Unassigned'}
            </p>
          </div>
          <span
            className="text-[10px] text-[#ecedf4]/45 shrink-0 tabular-nums"
            style={FONT_MONO}
          >
            {formatDistanceToNow(new Date(item.created_at), { addSuffix: false })}
          </span>
        </div>
      </button>
    </li>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Access request row
   ──────────────────────────────────────────────────────────────────────── */
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
    <div className="rounded-[13px] border border-[#f3c969]/25 bg-[#f3c969]/[0.05] p-2.5">
      <div className="flex items-start gap-2">
        <KeyRound className="h-3.5 w-3.5 text-[#f3c969] mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[12px] truncate" style={FONT_BODY}>
            {name}
          </p>
          <p
            className="text-[10px] text-[#ecedf4]/58 truncate"
            style={{ ...FONT_MONO, letterSpacing: '0.04em' }}
          >
            wants access to {req.deal_name || 'Untitled deal'}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-end gap-1 mt-1.5">
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-[10px] text-[#ecedf4]/65 hover:text-[#ecedf4]"
          disabled={busy !== null}
          onClick={async () => {
            setBusy('d');
            await onDecline();
            setBusy(null);
          }}
        >
          Decline
        </Button>
        <Button
          size="sm"
          className="h-6 px-2 text-[10px] border border-white/[0.10] bg-white/[0.06] hover:bg-white/[0.10] text-[#ecedf4]"
          disabled={busy !== null}
          onClick={async () => {
            setBusy('a');
            await onApprove();
            setBusy(null);
          }}
        >
          {busy === 'a' ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Approve'}
        </Button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Detail pane
   ──────────────────────────────────────────────────────────────────────── */
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
  const risk = riskOf(item);
  const riskInfo = RISK[risk];
  const target = targetSummary(item);
  const onApproveSentence = buildOnApproveSentence(item);
  const outcome = buildOutcomeSentence(item);
  const [editMode, setEditMode] = useState(false);
  const [busy, setBusy] = useState<'a' | 'r' | null>(null);

  // Claap items keep their dedicated card for now.
  if (item.action_type === 'claap_recording_review' || item.action_type === 'claap_action_items') {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto p-5">
        <ClaapApprovalCard item={item} />
      </div>
    );
  }

  const evidence = Array.isArray(item.evidence) ? item.evidence : [];
  const expires = expiryDaysLabel(item);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex-1 min-h-0 overflow-y-auto px-7 py-6">
        {/* Eyebrow */}
        <p
          className="text-[10.5px] uppercase text-[#ecedf4]/55"
          style={{ ...FONT_MONO, letterSpacing: '0.12em' }}
        >
          {(meta?.label ?? 'Action').toLowerCase()} action · proposed by naitive
        </p>

        {/* Title row */}
        <div className="mt-2 flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h3
              className="text-[24px] leading-[1.2] tracking-tight text-[#ecedf4]"
              style={FONT_DISPLAY}
            >
              {item.title}
            </h3>
            <p className="mt-1 text-[12.5px] text-[#ecedf4]/58" style={FONT_BODY}>
              {target}
            </p>
          </div>
          <span
            className="shrink-0 inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full border text-[10.5px] uppercase"
            style={{
              ...FONT_MONO,
              letterSpacing: '0.10em',
              color: riskInfo.hex,
              borderColor: `${riskInfo.hex}55`,
              background: `${riskInfo.hex}14`,
            }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: riskInfo.hex, boxShadow: `0 0 8px ${riskInfo.hex}77` }}
            />
            {riskInfo.label}
          </span>
        </div>

        {/* Metadata row */}
        <div className="mt-5 grid grid-cols-3 gap-4">
          <MetaCell label="Object" value={meta?.label ?? '—'} />
          <MetaCell
            label="Suggested"
            value={`${formatDistanceToNow(new Date(item.created_at))} ago`}
          />
          <MetaCell label="Expires" value={expires} />
        </div>
        <div className="mt-5 h-px bg-white/[0.06]" />

        {/* On approve callout */}
        <div
          className="mt-5 rounded-[14px] border p-4 flex items-start gap-3"
          style={{
            borderColor: 'rgba(94,205,245,0.28)',
            background:
              'linear-gradient(110deg, rgba(94,205,245,0.10) 0%, rgba(155,111,212,0.06) 100%)',
          }}
        >
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#5ecdf5]/15 ring-1 ring-inset ring-[#5ecdf5]/40 shrink-0">
            <ArrowRight className="h-4 w-4 text-[#5ecdf5]" />
          </span>
          <div className="min-w-0">
            <p
              className="text-[10.5px] uppercase text-[#5ecdf5]"
              style={{ ...FONT_MONO, letterSpacing: '0.12em' }}
            >
              What happens on approve
            </p>
            <p
              className="mt-1 text-[13.5px] leading-[1.55] text-[#ecedf4]"
              style={FONT_BODY}
            >
              {onApproveSentence}
            </p>
            <p className="mt-1 text-[12px] text-[#ecedf4]/58" style={FONT_BODY}>
              {outcome}
            </p>
          </div>
        </div>

        {/* Why naitive suggests this */}
        {item.rationale && (
          <div className="mt-6">
            <p
              className="text-[10.5px] uppercase text-[#9b6fd4]"
              style={{ ...FONT_MONO, letterSpacing: '0.12em' }}
            >
              Why naitive suggests this
            </p>
            <p
              className="mt-2 text-[13.5px] text-[#ecedf4]/90 max-w-[64ch]"
              style={{ ...FONT_BODY, lineHeight: 1.6 }}
            >
              {item.rationale}
            </p>
          </div>
        )}

        {/* Sources */}
        {evidence.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {evidence.map((e, i) => {
              const inner = (
                <>
                  <LinkIcon className="h-3 w-3" />
                  <span className="truncate max-w-[260px]">{e.label}</span>
                  {e.url && <ExternalLink className="h-3 w-3 opacity-60" />}
                </>
              );
              const cls =
                'inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full border border-white/[0.10] bg-white/[0.035] text-[11px] text-[#ecedf4]/85 hover:bg-white/[0.07] transition-colors';
              return e.url ? (
                <a key={i} href={e.url} target="_blank" rel="noreferrer" className={cls} style={FONT_MONO}>
                  {inner}
                </a>
              ) : (
                <span key={i} className={cls} style={FONT_MONO}>
                  {inner}
                </span>
              );
            })}
          </div>
        )}

        {/* Inline edit / diff (collapsible) */}
        {editMode && (
          <div className="mt-6">
            <ApprovalReviewExpanded item={item} onDone={() => setEditMode(false)} />
          </div>
        )}

        {item.execution_error && (
          <p className="mt-4 text-[12px] text-[#f58aa0]" style={FONT_BODY}>
            Last execution failed: {item.execution_error}
          </p>
        )}
      </div>

      {/* Fixed action bar */}
      <div className="shrink-0 border-t border-white/[0.08] px-6 py-4 flex items-center gap-2 bg-[#06060a]/60 backdrop-blur">
        {item.deal_id && (
          <a
            href={`/deals/${item.deal_id}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-[12px] text-[#ecedf4]/70 hover:text-[#ecedf4] hover:bg-white/[0.04] border border-transparent"
            style={FONT_BODY}
          >
            <Eye className="h-3.5 w-3.5" /> Review
          </a>
        )}
        <button
          type="button"
          onClick={() => setEditMode((v) => !v)}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-[12px] text-[#ecedf4]/70 hover:text-[#ecedf4] hover:bg-white/[0.04]"
          style={FONT_BODY}
        >
          <Pencil className="h-3.5 w-3.5" /> {editMode ? 'Hide edit' : 'Edit'}
        </button>
        <div className="flex-1" />
        <button
          type="button"
          disabled={busy !== null}
          onClick={async () => {
            setBusy('r');
            await onReject();
            setBusy(null);
          }}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-[12px] text-[#f58aa0] hover:bg-[#f58aa0]/10 border border-[#f58aa0]/25 disabled:opacity-60"
          style={FONT_BODY}
        >
          {busy === 'r' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
          Reject
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={async () => {
            setBusy('a');
            await onApprove();
            setBusy(null);
          }}
          className="inline-flex items-center gap-2 h-9 px-4 rounded-lg text-[12px] font-semibold text-[#0a0a14] shadow-[0_8px_30px_-8px_rgba(94,205,245,0.55)] hover:brightness-110 transition-all disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5ecdf5]"
          style={{
            ...FONT_BODY,
            background: 'linear-gradient(110deg, #5ecdf5 0%, #9b6fd4 100%)',
          }}
        >
          {busy === 'a' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {approveButtonLabel(item)}
        </button>
      </div>
    </div>
  );
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p
        className="text-[9.5px] uppercase text-[#ecedf4]/45"
        style={{ ...FONT_MONO, letterSpacing: '0.12em' }}
      >
        {label}
      </p>
      <p className="mt-1 text-[12.5px] text-[#ecedf4]" style={FONT_BODY}>
        {value}
      </p>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Empty state
   ──────────────────────────────────────────────────────────────────────── */
function EmptyState() {
  return (
    <div className="relative flex flex-1 h-full flex-col items-center justify-center gap-3 py-20 text-center">
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-[14px] border border-white/[0.08] bg-white/[0.035]">
        <InboxIcon className="h-5 w-5 text-[#ecedf4]/55" />
      </span>
      <p className="text-[15px] text-[#ecedf4]" style={FONT_DISPLAY}>
        Queue cleared
      </p>
      <p className="text-[12px] text-[#ecedf4]/55 max-w-[320px]" style={FONT_BODY}>
        New suggestions will appear here as naitive processes calls, calendar, and email.
      </p>
    </div>
  );
}

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