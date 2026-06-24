import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminRole } from '@/hooks/useAdminRole';
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
  buildRationaleFallback,
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
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Admin-only scope filter: "All" vs "Me" (deals where current user is manager).
  const { isAdmin } = useAdminRole();
  const [scope, setScope] = useState<'all' | 'me'>('all');
  const { data: myDealIds } = useMyManagedDealIds(isAdmin);

  const scopeActive = isAdmin && scope === 'me';

  const scopedItems = useMemo(() => {
    if (!scopeActive) return items;
    const ids = myDealIds ?? new Set<string>();
    return items.filter((it) => it.deal_id && ids.has(it.deal_id));
  }, [items, scopeActive, myDealIds]);

  const scopedAccessRequests = useMemo(() => {
    if (!scopeActive) return accessRequests;
    const ids = myDealIds ?? new Set<string>();
    return accessRequests.filter((r) => r.deal_id && ids.has(r.deal_id));
  }, [accessRequests, scopeActive, myDealIds]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return scopedItems.filter((it) => {
      if (q) {
        const hay = `${it.title} ${it.deal_name ?? ''} ${it.description ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [scopedItems, query]);

  // Keep selection if visible; otherwise pick first.
  useEffect(() => {
    if (selectedId && filtered.some((it) => it.id === selectedId)) return;
    setSelectedId(filtered[0]?.id ?? null);
  }, [filtered, selectedId]);

  const selected = useMemo(
    () => filtered.find((it) => it.id === selectedId) || null,
    [filtered, selectedId],
  );

  const totalCount = scopedItems.length + scopedAccessRequests.length;

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
          <span
            className="text-[10px] uppercase text-[#ecedf4]/58"
            style={{ ...FONT_MONO, letterSpacing: '0.10em' }}
          >
            synced just now
          </span>
        </div>
        <div className="flex items-center gap-2">
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

              {isAdmin && (
                <div className="flex items-center gap-1.5">
                  <FilterChip
                    label="All"
                    count={items.length + accessRequests.length}
                    active={scope === 'all'}
                    onClick={() => setScope('all')}
                  />
                  <FilterChip
                    label="Me"
                    count={
                      (myDealIds
                        ? items.filter((it) => it.deal_id && myDealIds.has(it.deal_id)).length +
                          accessRequests.filter((r) => r.deal_id && myDealIds.has(r.deal_id)).length
                        : 0)
                    }
                    active={scope === 'me'}
                    onClick={() => setScope('me')}
                  />
                </div>
              )}

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

            </div>

            {/* Scrollable row list */}
            <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3 space-y-3">
              {scopedAccessRequests.length > 0 && (
                <div className="space-y-1">
                  <p
                    className="px-1 pt-1 text-[9.5px] uppercase text-[#ecedf4]/45"
                    style={{ ...FONT_MONO, letterSpacing: '0.10em' }}
                  >
                    Access requests
                  </p>
                  {scopedAccessRequests.map((req) => (
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
                onApprove={(opts) => approve(selected, opts)}
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
              {item.deal_name || 'Unassigned'}
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
  onApprove: (opts?: { editedValues?: Record<string, any> }) => Promise<unknown>;
  onReject: () => Promise<unknown>;
}) {
  const meta = TYPE_META[item.action_type];
  const target = targetSummary(item);
  const onApproveSentence = buildOnApproveSentence(item);
  const outcome = buildOutcomeSentence(item);
  const [editMode, setEditMode] = useState(false);
  const [busy, setBusy] = useState<'a' | 'r' | null>(null);
  const [edits, setEdits] = useState<Record<string, any>>({});
  const navigate = useNavigate();
  const dealId = (item as any).deal_id as string | undefined;
  const isFundingSource =
    item.action_type === 'update_funding_source' ||
    item.target_object_type === 'deal_lender';
  const openDeal = (tab?: string) => {
    if (!dealId) return;
    const qs = new URLSearchParams();
    qs.set('deal', dealId);
    if (tab) qs.set('tab', tab);
    navigate(`/deals?${qs.toString()}`);
  };
  const linkCls =
    'underline-offset-2 hover:underline hover:text-[#5ecdf5] focus-visible:underline focus-visible:text-[#5ecdf5] cursor-pointer rounded-sm';

  // Reset edits whenever a different item is selected.
  useEffect(() => {
    setEdits({});
    setEditMode(false);
  }, [item.id]);

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
  const oldValues = (item.old_values || {}) as Record<string, any>;
  const newValues = (item.new_values || {}) as Record<string, any>;
  const fieldKeys = Array.from(
    new Set<string>([...Object.keys(oldValues), ...Object.keys(newValues)]),
  );
  const editedCount = Object.keys(edits).length;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
        {/* Title row */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h3
              className="text-[19px] leading-[1.2] tracking-tight text-[#ecedf4]"
              style={FONT_DISPLAY}
            >
              {isFundingSource && dealId ? (
                <button
                  type="button"
                  onClick={() => openDeal('lenders')}
                  className={`text-left ${linkCls}`}
                  title="Open funding sources on this deal"
                >
                  {item.title}
                </button>
              ) : (
                item.title
              )}
            </h3>
            <p className="mt-0.5 text-[12px] text-[#ecedf4]/58" style={FONT_BODY}>
              {dealId && item.deal_name ? (
                <button
                  type="button"
                  onClick={() => openDeal()}
                  className={linkCls}
                  title={`Open ${item.deal_name}`}
                >
                  {target}
                </button>
              ) : (
                target
              )}
            </p>
          </div>
        </div>

        {/* Metadata row */}
        <div className="mt-3 grid grid-cols-3 gap-3">
          <MetaCell label="Object" value={meta?.label ?? '—'} />
          <MetaCell
            label="Suggested"
            value={`${formatDistanceToNow(new Date(item.created_at))} ago`}
          />
          <MetaCell label="Expires" value={expires} />
        </div>
        <div className="mt-3 h-px bg-white/[0.06]" />

        {/* On approve callout */}
        <div
          className="mt-3 rounded-[12px] border px-3 py-2.5 flex items-start gap-2.5"
          style={{
            borderColor: 'rgba(94,205,245,0.28)',
            background:
              'linear-gradient(110deg, rgba(94,205,245,0.10) 0%, rgba(155,111,212,0.06) 100%)',
          }}
        >
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-[8px] bg-[#5ecdf5]/15 ring-1 ring-inset ring-[#5ecdf5]/40 shrink-0 mt-0.5">
            <ArrowRight className="h-3.5 w-3.5 text-[#5ecdf5]" />
          </span>
          <div className="min-w-0">
            <p
              className="text-[10px] uppercase text-[#5ecdf5]"
              style={{ ...FONT_MONO, letterSpacing: '0.12em' }}
            >
              What happens on approve
            </p>
            <p
              className="mt-0.5 text-[12.5px] leading-[1.45] text-[#ecedf4]"
              style={FONT_BODY}
            >
              {onApproveSentence}
            </p>
            <p className="mt-0.5 text-[11.5px] leading-[1.4] text-[#ecedf4]/58" style={FONT_BODY}>
              {outcome}
            </p>
          </div>
        </div>

        {/* Why naitive suggests this — always rendered */}
        <div className="mt-3">
            <p
              className="text-[10px] uppercase text-[#9b6fd4]"
              style={{ ...FONT_MONO, letterSpacing: '0.12em' }}
            >
              Why naitive suggests this
            </p>
            <p
              className="mt-1 text-[12.5px] text-[#ecedf4]/90 max-w-[72ch]"
              style={{ ...FONT_BODY, lineHeight: 1.45 }}
            >
              {item.rationale || buildRationaleFallback(item)}
            </p>
        </div>

        {/* Sources */}
        {evidence.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {evidence.map((e, i) => {
              const inner = (
                <>
                  <LinkIcon className="h-3 w-3" />
                  <span className="truncate max-w-[260px]">{e.label}</span>
                  {e.url && <ExternalLink className="h-3 w-3 opacity-60" />}
                </>
              );
              const cls =
                'inline-flex items-center gap-1.5 h-6 px-2 rounded-full border border-white/[0.10] bg-white/[0.035] text-[10.5px] text-[#ecedf4]/85 hover:bg-white/[0.07] transition-colors';
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

        {/* Proposed changes — always visible; editable when editMode is on */}
        {fieldKeys.length > 0 && (
          <div className="mt-3">
            <div className="flex items-center justify-between">
              <p
                className="text-[10px] uppercase text-[#ecedf4]/55"
                style={{ ...FONT_MONO, letterSpacing: '0.12em' }}
              >
                Proposed changes
              </p>
              <div className="flex items-center gap-2">
                {editMode && editedCount > 0 && (
                  <span
                    className="text-[10px] uppercase text-[#f3c969]"
                    style={{ ...FONT_MONO, letterSpacing: '0.10em' }}
                  >
                    {editedCount} edited
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setEditMode((v) => !v)}
                  className="inline-flex items-center gap-1 h-6 px-2 rounded-md text-[11px] text-[#ecedf4]/70 hover:text-[#ecedf4] hover:bg-white/[0.05] border border-white/[0.08]"
                  style={FONT_BODY}
                >
                  <Pencil className="h-3 w-3" /> {editMode ? 'Done' : 'Edit'}
                </button>
              </div>
            </div>
            <div className="mt-1.5 rounded-[10px] border border-white/[0.08] overflow-hidden">
              <div
                className="grid grid-cols-[110px_1fr_1fr] text-[10px] uppercase text-[#ecedf4]/55 border-b border-white/[0.06] bg-white/[0.02]"
                style={{ ...FONT_MONO, letterSpacing: '0.10em' }}
              >
                <div className="px-2.5 py-1">Field</div>
                <div className="px-2.5 py-1">Current</div>
                <div className="px-2.5 py-1">Proposed</div>
              </div>
              {fieldKeys.map((k, idx) => {
                const oldV = oldValues[k];
                const proposed = edits[k] ?? newValues[k];
                return (
                  <div
                    key={k}
                    className={`grid grid-cols-[110px_1fr_1fr] text-[11.5px] ${
                      idx === fieldKeys.length - 1 ? '' : 'border-b border-white/[0.05]'
                    }`}
                  >
                    <div className="px-2.5 py-1.5 text-[#ecedf4]/85" style={FONT_BODY}>
                      {k}
                    </div>
                    <div className="px-2.5 py-1.5 text-[#ecedf4]/45 line-through" style={FONT_BODY}>
                      {oldV == null || oldV === '' ? '—' : String(oldV)}
                    </div>
                    <div className="px-2.5 py-1.5" style={FONT_BODY}>
                      {editMode ? (
                        <Input
                          value={proposed == null ? '' : String(proposed)}
                          onChange={(e) =>
                            setEdits((p) => ({ ...p, [k]: e.target.value }))
                          }
                          className="h-6 text-[11.5px] px-2 bg-white/[0.04] border-white/[0.10] text-[#ecedf4] focus-visible:ring-1 focus-visible:ring-[#5ecdf5]/60"
                          style={FONT_BODY}
                        />
                      ) : (
                        <span className="text-[#ecedf4]">
                          {proposed == null || proposed === '' ? '—' : String(proposed)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {item.execution_error && (
          <p className="mt-3 text-[11.5px] text-[#f58aa0]" style={FONT_BODY}>
            Last execution failed: {item.execution_error}
          </p>
        )}
      </div>

      {/* Fixed action bar */}
      <div className="shrink-0 border-t border-white/[0.08] px-5 py-3 flex items-center gap-2 bg-[#06060a]/60 backdrop-blur">
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
            await onApprove(editedCount > 0 ? { editedValues: edits } : undefined);
            setBusy(null);
          }}
          className="inline-flex items-center gap-2 h-9 px-4 rounded-lg text-[12px] font-semibold text-[#0a0a14] shadow-[0_8px_30px_-8px_rgba(94,205,245,0.55)] hover:brightness-110 transition-all disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5ecdf5]"
          style={{
            ...FONT_BODY,
            background: 'linear-gradient(110deg, #5ecdf5 0%, #9b6fd4 100%)',
          }}
        >
          {busy === 'a' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {approveButtonLabel(item, editedCount > 0)}
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
   Hook: deal IDs where the current user is tagged as the deal manager.
   Used by the admin-only "Me" filter in the Approval Queue.
   ──────────────────────────────────────────────────────────────────────── */
function useMyManagedDealIds(enabled: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['approval-queue', 'my-managed-deal-ids', user?.id],
    enabled: !!user?.id && enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<Set<string>> => {
      const { data: prof } = await supabase
        .from('profiles')
        .select('first_name,last_name,display_name,email')
        .eq('id', user!.id)
        .maybeSingle();
      // Build candidate name tokens (first, last, full, display, email-prefix)
      const tokens = new Set<string>();
      const add = (v?: string | null) => {
        const t = (v ?? '').trim();
        if (t && t.length >= 2) tokens.add(t.toLowerCase());
      };
      add(prof?.display_name);
      add(prof?.first_name);
      add(prof?.last_name);
      if (prof?.first_name && prof?.last_name) add(`${prof.first_name} ${prof.last_name}`);
      if (prof?.email) add(prof.email.split('@')[0]);
      add(user?.email?.split('@')[0]);
      add((user?.user_metadata as any)?.full_name);
      add((user?.user_metadata as any)?.name);
      if (!tokens.size) return new Set();
      // Fetch all visible deals (RLS-scoped) and match client-side so that
      // multi-name managers like "Alice, Bob" or "Alice & Bob" all resolve.
      const { data, error } = await supabase.from('deals').select('id,manager');
      if (error) return new Set();
      const matched = new Set<string>();
      for (const row of (data || []) as Array<{ id: string; manager: string | null }>) {
        const m = (row.manager ?? '').toLowerCase();
        if (!m) continue;
        for (const t of tokens) {
          if (m.includes(t)) {
            matched.add(row.id);
            break;
          }
        }
      }
      return matched;
    },
  });
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

