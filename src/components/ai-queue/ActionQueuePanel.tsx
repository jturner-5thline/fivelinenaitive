import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { formatDistanceToNow, formatDistanceToNowStrict } from 'date-fns';
import {
  QueuedAiAction,
  AiActionType,
  useApproveAiAction,
  useApproveAllAiActions,
  useDismissAiAction,
  useDismissManyAiActions,
} from '@/hooks/useAiActionQueue';
import { ClaapApprovalCard } from './ClaapApprovalCard';
import { ApprovalReviewExpanded } from './ApprovalReviewExpanded';
import { StagedDraftsPanel } from './StagedDraftsPanel';
import { usePipelineContext } from '@/contexts/PipelineContext';
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
// Inherit the app's global typography (Figtree via font-sans) so the popup
// matches the rest of the platform. Kept as named exports so existing call
// sites continue to compile without churn.
const FONT_DISPLAY = { fontFamily: 'inherit' };
const FONT_MONO = { fontFamily: 'inherit' };
const FONT_BODY = { fontFamily: 'inherit' };

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

/* Grouping order within a deal accordion: funding-source items first, then
 * deal-level updates, then tasks/follow-ups, then communications, then
 * meeting/escalation items. Lower number = appears first. */
const ACTION_TYPE_GROUP_ORDER: Partial<Record<AiActionType, number>> = {
  update_funding_source: 10,
  update_lender_status: 11,
  update_deal_stage: 20,
  update_deal_status: 21,
  add_status_note: 22,
  deal_update: 23,
  reassign_deal: 24,
  update_milestone: 30,
  create_milestone: 31,
  create_task: 40,
  create_followup_task: 41,
  draft_email: 50,
  update_contact: 60,
  update_company: 61,
  log_note: 70,
  save_to_data_room: 71,
  claap_recording_review: 80,
  claap_action_items: 81,
  escalate: 90,
};

function actionTypeRank(t: AiActionType): number {
  return ACTION_TYPE_GROUP_ORDER[t] ?? 999;
}

/* Humanize technical field keys into readable labels. */
const FIELD_LABELS: Record<string, string> = {
  owner_user_id: 'Deal owner',
  owner_id: 'Deal owner',
  assignee_id: 'Assignee',
  assigned_to: 'Assignee',
  reason: 'Reason for change',
  stage_id: 'Stage',
  status: 'Status',
  pipeline_id: 'Pipeline',
  deal_name: 'Deal name',
  deal_type: 'Deal type',
  due_date: 'Due date',
  amount: 'Amount',
  notes: 'Notes',
  description: 'Description',
  title: 'Title',
  priority: 'Priority',
  funding_source_id: 'Funding source',
  lender_id: 'Lender',
  company_id: 'Company',
  contact_id: 'Contact',
};
function humanizeFieldKey(key: string): string {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  return key
    .replace(/_id$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/* Convert internal tokens into friendly display strings. */
const VALUE_TOKEN_LABELS: Record<string, string> = {
  '[REQUIRES_MANUAL_SELECTION]': 'Select owner during approval',
  '[NEEDS_MANUAL_INPUT]': 'Provide during approval',
  '[PENDING]': 'Pending',
};
function formatProposedValue(v: any): string {
  if (v == null || v === '') return '';
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  if (VALUE_TOKEN_LABELS[s]) return VALUE_TOKEN_LABELS[s];
  return s;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function formatDateDisplay(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} (${formatDistanceToNow(date)} ago)`;
}

function isDateField(key: string): boolean {
  const normalized = key.toLowerCase();
  return normalized.endsWith('_at') || normalized.endsWith('_date') || normalized.includes('date');
}

function latestDate(values: Array<string | null | undefined>): string | null {
  let latest: string | null = null;
  let latestMs = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (!value) continue;
    const ms = new Date(value).getTime();
    if (!Number.isNaN(ms) && ms > latestMs) {
      latestMs = ms;
      latest = value;
    }
  }
  return latest;
}

function emailDomain(email: string | null | undefined): string | null {
  const match = email?.trim().toLowerCase().match(/@([^@\s>]+)$/);
  return match?.[1] ?? null;
}

/** Format a field value with awareness of its key — resolves UUIDs to friendly
 *  names using the provided lookup tables and never returns a raw UUID. */
function formatFieldValue(
  key: string,
  v: any,
  lookups: { stages?: Record<string, string>; pipelines?: Record<string, string> },
): string {
  const base = formatProposedValue(v);
  if (!base) return '';
  if (isDateField(key)) {
    return formatDateDisplay(base) || base;
  }
  // Stage / pipeline lookups
  if ((key === 'stage_id' || key === 'stage') && lookups.stages?.[base]) {
    return lookups.stages[base];
  }
  if (key === 'pipeline_id' && lookups.pipelines?.[base]) {
    return lookups.pipelines[base];
  }
  // Generic UUID fallback — never show raw IDs to the user.
  if (UUID_RE.test(base)) {
    if (lookups.stages?.[base]) return lookups.stages[base];
    if (lookups.pipelines?.[base]) return lookups.pipelines[base];
    return '—';
  }
  return base;
}

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

  // Group filtered items by deal_id (preserving original order within group).
  type DealGroup = {
    key: string;
    dealId: string | null;
    dealName: string;
    items: QueuedAiAction[];
    escalated: boolean;
  };
  const groups = useMemo<DealGroup[]>(() => {
    const map = new Map<string, DealGroup>();
    filtered.forEach((it, idx) => {
      const key = it.deal_id || '__unassigned__';
      let g = map.get(key);
      if (!g) {
        g = {
          key,
          dealId: it.deal_id ?? null,
          dealName: it.deal_name || (it.deal_id ? 'Untitled deal' : 'Unassigned'),
          items: [],
          escalated: false,
        };
        map.set(key, g);
      }
      (g.items as any).push(Object.assign(it, { __order: idx }));
      if (it.priority === 'high' || it.risk_level === 'high' || it.action_type === 'escalate') {
        g.escalated = true;
      }
    });
    // Sort items inside each group by action type rank, preserving original
    // order as a tiebreaker so behavior is stable.
    for (const g of map.values()) {
      g.items.sort((a, b) => {
        const rankDiff = actionTypeRank(a.action_type) - actionTypeRank(b.action_type);
        if (rankDiff !== 0) return rankDiff;
        return ((a as any).__order ?? 0) - ((b as any).__order ?? 0);
      });
    }
    return Array.from(map.values()).sort((a, b) => b.items.length - a.items.length);
  }, [filtered]);

  const [expandedDealKey, setExpandedDealKey] = useState<string | null>(null);
  // Tracks whether the user intentionally collapsed the open group, so the
  // auto-expand effect below doesn't immediately re-open it.
  const userCollapsedRef = useRef(false);
  const hasAutoExpandedRef = useRef(false);

  // Maintain a valid expanded group + selection as data changes.
  useEffect(() => {
    if (groups.length === 0) {
      if (expandedDealKey !== null) setExpandedDealKey(null);
      if (selectedId !== null) setSelectedId(null);
      return;
    }
    const currentGroup = expandedDealKey
      ? groups.find((g) => g.key === expandedDealKey)
      : null;
    if (!currentGroup) {
      // Respect an explicit user collapse — don't auto-reopen.
      if (expandedDealKey === null && userCollapsedRef.current && hasAutoExpandedRef.current) {
        return;
      }
      // Prefer the group containing the currently selected item; else first.
      const groupForSelected = selectedId
        ? groups.find((g) => g.items.some((i) => i.id === selectedId))
        : null;
      const next = groupForSelected ?? groups[0];
      setExpandedDealKey(next.key);
      setSelectedId(next.items[0]?.id ?? null);
      hasAutoExpandedRef.current = true;
      return;
    }
    // Group still exists — ensure selection points to one of its items.
    if (!selectedId || !currentGroup.items.some((i) => i.id === selectedId)) {
      setSelectedId(currentGroup.items[0]?.id ?? null);
    }
  }, [groups, expandedDealKey, selectedId]);

  // When the search query changes, auto-expand the top matching deal group.
  const lastQueryRef = useRef(query);
  useEffect(() => {
    if (lastQueryRef.current === query) return;
    lastQueryRef.current = query;
    if (groups.length > 0) {
      userCollapsedRef.current = false;
      setExpandedDealKey(groups[0].key);
      setSelectedId(groups[0].items[0]?.id ?? null);
    }
  }, [query, groups]);

  const expandedGroup = useMemo(
    () => groups.find((g) => g.key === expandedDealKey) ?? null,
    [groups, expandedDealKey],
  );
  const currentGroupItems = expandedGroup?.items ?? [];
  const selectedIndex = selectedId
    ? currentGroupItems.findIndex((i) => i.id === selectedId)
    : -1;

  const selected = useMemo(
    () => (selectedIndex >= 0 ? currentGroupItems[selectedIndex] : null),
    [currentGroupItems, selectedIndex],
  );

  const goPrev = useCallback(() => {
    if (selectedIndex > 0) setSelectedId(currentGroupItems[selectedIndex - 1].id);
  }, [selectedIndex, currentGroupItems]);
  const goNext = useCallback(() => {
    if (selectedIndex >= 0 && selectedIndex < currentGroupItems.length - 1) {
      setSelectedId(currentGroupItems[selectedIndex + 1].id);
    }
  }, [selectedIndex, currentGroupItems]);

  // Step to next sibling after approve/reject without rolling into another deal.
  const advanceAfterAction = useCallback(() => {
    if (selectedIndex < 0) return;
    const next = currentGroupItems[selectedIndex + 1] ?? currentGroupItems[selectedIndex - 1] ?? null;
    // If next === current item (just-acted), it will fall out on refresh; pick neighbor by id.
    const currentId = currentGroupItems[selectedIndex]?.id;
    const candidate = next && next.id !== currentId ? next : null;
    setSelectedId(candidate?.id ?? null);
  }, [selectedIndex, currentGroupItems]);

  // Keyboard: ↑/↓ or J/K navigate the open deal's items.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || (t && t.isContentEditable)) return;
      if (e.key === 'ArrowDown' || e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        goNext();
      } else if (e.key === 'ArrowUp' || e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        goPrev();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [goPrev, goNext]);

  const dismissMany = useDismissManyAiActions();
  const toggleDeal = useCallback((key: string) => {
    setExpandedDealKey((curr) => {
      if (curr === key) {
        userCollapsedRef.current = true;
        setSelectedId(null);
        return null;
      }
      userCollapsedRef.current = false;
      const g = groups.find((gr) => gr.key === key);
      if (g) setSelectedId(g.items[0]?.id ?? null);
      return key;
    });
  }, [groups]);

  const totalCount = scopedItems.length + scopedAccessRequests.length;

  return (
    <div
      className="relative flex flex-col h-[88vh] min-h-0 font-sans text-[#ecedf4] motion-reduce:transform-none"
      style={{ background: '#06060a' }}
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
        </div>
      </div>

      {/* Body */}
      {tab === 'staged' ? (
        <div className="relative flex-1 min-h-0 overflow-y-auto">
          <div className="px-5 pt-3 flex items-center justify-end">
            <TabBar tab={tab} setTab={setTab} queueCount={totalCount} stagedCount={0} />
          </div>
          <StagedDraftsPanel />
        </div>
      ) : (items.length + accessRequests.length) === 0 ? (
        <EmptyState />
      ) : (
        <div className="relative grid grid-cols-1 md:grid-cols-[392px_1fr] flex-1 min-h-0">
          {/* LEFT RAIL */}
          <aside className="flex flex-col min-h-0 md:border-r border-white/[0.08]">
            <div className="px-4 pt-3 pb-2 space-y-3 shrink-0">
              <div className="flex items-center justify-between gap-2">
                {isAdmin ? (
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
                ) : (
                  <div />
                )}
                <TabBar tab={tab} setTab={setTab} queueCount={totalCount} stagedCount={0} />
              </div>

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

              {groups.length > 0 ? (
                <ul className="space-y-2">
                  {groups.map((g) => (
                    <DealGroupCard
                      key={g.key}
                      group={g}
                      expanded={expandedDealKey === g.key}
                      selectedId={selectedId}
                      onToggle={() => toggleDeal(g.key)}
                      onSelect={(id) => setSelectedId(id)}
                      onApproveLowRisk={async () => {
                        const low = g.items.filter((i) => riskOf(i) === 'low');
                        if (low.length === 0) return;
                        await approveAll(low);
                      }}
                      onRejectAll={async () => {
                        await dismissMany(g.items.map((i) => i.id));
                      }}
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
                groupName={expandedGroup?.dealName ?? ''}
                index={selectedIndex}
                total={currentGroupItems.length}
                canPrev={selectedIndex > 0}
                canNext={selectedIndex >= 0 && selectedIndex < currentGroupItems.length - 1}
                onPrev={goPrev}
                onNext={goNext}
                onApprove={async (opts) => {
                  advanceAfterAction();
                  return approve(selected, opts);
                }}
                onReject={async () => {
                  advanceAfterAction();
                  return dismiss(selected.id);
                }}
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
/* ─────────────────────────────────────────────────────────────────────────
   Deal group card (collapsed-first accordion)
   ──────────────────────────────────────────────────────────────────────── */
function DealGroupCard({
  group,
  expanded,
  selectedId,
  onToggle,
  onSelect,
  onApproveLowRisk,
  onRejectAll,
}: {
  group: {
    key: string;
    dealId: string | null;
    dealName: string;
    items: QueuedAiAction[];
    escalated: boolean;
  };
  expanded: boolean;
  selectedId: string | null;
  onToggle: () => void;
  onSelect: (id: string) => void;
  onApproveLowRisk: () => Promise<unknown> | void;
  onRejectAll: () => Promise<unknown> | void;
}) {
  const [busy, setBusy] = useState<'a' | 'r' | null>(null);
  const count = group.items.length;
  const lowCount = useMemo(
    () => group.items.filter((i) => riskOf(i) === 'low').length,
    [group.items],
  );
  return (
    <li
      className={`rounded-[14px] border transition-colors ${
        expanded
          ? 'border-white/[0.12] bg-white/[0.035]'
          : 'border-white/[0.06] bg-white/[0.018] hover:bg-white/[0.03]'
      }`}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex items-center gap-2 flex-1 min-w-0 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#5ecdf5] rounded-md"
        >
          <ChevronDown
            className={`h-3.5 w-3.5 text-[#ecedf4]/60 transition-transform ${
              expanded ? '' : '-rotate-90'
            }`}
          />
          <p
            className="text-[12.5px] text-[#ecedf4] truncate"
            style={FONT_BODY}
            title={group.dealName}
          >
            {group.dealName}
          </p>
          <span
            className="ml-auto inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full text-[12px] font-semibold bg-[#ef4444] text-white shrink-0"
            style={FONT_MONO}
          >
            {count}
          </span>
        </button>
      </div>
      {expanded && (
        <>
          <div className="flex items-center gap-1.5 px-3 pb-2">
            <button
              type="button"
              disabled={busy !== null || lowCount === 0}
              onClick={async () => {
                setBusy('a');
                await onApproveLowRisk();
                setBusy(null);
              }}
              className="inline-flex items-center gap-1 h-6 px-2 rounded-md text-[10.5px] border border-white/[0.08] bg-white/[0.04] text-[#ecedf4]/80 hover:text-[#ecedf4] hover:bg-white/[0.08] disabled:opacity-40 disabled:cursor-not-allowed"
              style={FONT_BODY}
              title={lowCount === 0 ? 'No low-risk items in this deal' : `Approve ${lowCount} low-risk`}
            >
              {busy === 'a' ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              Approve all low-risk
              {lowCount > 0 && (
                <span className="text-[#ecedf4]/55" style={FONT_MONO}>
                  {lowCount}
                </span>
              )}
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={async () => {
                setBusy('r');
                await onRejectAll();
                setBusy(null);
              }}
              className="inline-flex items-center gap-1 h-6 px-2 rounded-md text-[10.5px] border border-[#f58aa0]/25 text-[#f58aa0] hover:bg-[#f58aa0]/10 disabled:opacity-40"
              style={FONT_BODY}
            >
              {busy === 'r' ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              Reject all
            </button>
          </div>
          <ul className="space-y-1 px-2 pb-2">
            {group.items.map((item) => (
              <QueueRow
                key={item.id}
                item={item}
                selected={selectedId === item.id}
                onSelect={() => onSelect(item.id)}
              />
            ))}
          </ul>
        </>
      )}
    </li>
  );
}

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
  groupName,
  index,
  total,
  canPrev,
  canNext,
  onPrev,
  onNext,
  onApprove,
  onReject,
}: {
  item: QueuedAiAction;
  groupName?: string;
  index?: number;
  total?: number;
  canPrev?: boolean;
  canNext?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
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
  // Lookup tables to resolve raw UUIDs (stage_id, pipeline_id) into labels.
  const { pipelines } = usePipelineContext();
  const lookups = useMemo(() => {
    const stages: Record<string, string> = {};
    const pipelinesMap: Record<string, string> = {};
    for (const p of pipelines ?? []) {
      pipelinesMap[p.id] = p.name;
      for (const s of p.stages ?? []) stages[s.id] = s.label;
    }
    return { stages, pipelines: pipelinesMap };
  }, [pipelines]);
  const dealId = (item as any).deal_id as string | undefined;
  const targetObjectId = (item as any).target_object_id as string | undefined;
  const isFundingSource =
    item.action_type === 'update_funding_source' ||
    item.target_object_type === 'deal_lender' ||
    item.target_object_type === 'funding_source';
  // If this action targets a contact, fetch their team-wide "last contact at"
  // so reviewers see recency at a glance.
  const contactTargetId =
    item.target_object_type === 'contact'
      ? targetObjectId
      : undefined;
  const { data: contactLastContact } = useQuery({
    queryKey: ['contact-last-contact-at', contactTargetId],
    enabled: !!contactTargetId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('contacts')
        .select('last_contact_at')
        .eq('id', contactTargetId!)
        .maybeSingle();
      return (data?.last_contact_at as string | null) ?? null;
    },
  });
  const fundingSourceTargetId = isFundingSource ? targetObjectId : undefined;
  const { data: fundingSourceLastContact } = useQuery({
    queryKey: ['funding-source-last-contact-at', fundingSourceTargetId],
    enabled: !!fundingSourceTargetId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: lender } = await (supabase as any)
        .from('deal_lenders')
        .select('last_contact_at, selected_contact_id, master_lender_id')
        .eq('id', fundingSourceTargetId!)
        .maybeSingle();

      const dates: Array<string | null | undefined> = [lender?.last_contact_at];

      if (lender?.selected_contact_id) {
        const { data: selectedContact } = await supabase
          .from('contacts')
          .select('last_contact_at')
          .eq('id', lender.selected_contact_id)
          .maybeSingle();
        dates.push(selectedContact?.last_contact_at as string | null | undefined);
      }

      let lenderEmail: string | null = null;
      if (lender?.master_lender_id) {
        const { data: masterLender } = await (supabase as any)
          .from('master_lenders')
          .select('email')
          .eq('id', lender.master_lender_id)
          .maybeSingle();
        lenderEmail = typeof masterLender?.email === 'string' ? masterLender.email : null;
      }

      if (lenderEmail) {
        const { data: exactContact } = await supabase
          .from('contacts')
          .select('last_contact_at')
          .ilike('email', lenderEmail)
          .order('last_contact_at', { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle();
        dates.push(exactContact?.last_contact_at as string | null | undefined);

        const domain = emailDomain(lenderEmail);
        if (domain) {
          const { data: domainContacts } = await supabase
            .from('contacts')
            .select('last_contact_at')
            .ilike('email', `%@${domain}`)
            .order('last_contact_at', { ascending: false, nullsFirst: false })
            .limit(1);
          dates.push(domainContacts?.[0]?.last_contact_at as string | null | undefined);
        }
      }

      return latestDate(dates);
    },
  });
  const resolvedLastContactAt = fundingSourceLastContact ?? contactLastContact ?? null;
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
      {typeof total === 'number' && total > 0 && (
        <div className="flex items-center justify-between gap-2 px-6 pt-1.5 pb-1.5 border-b border-white/[0.06] shrink-0">
          <p
            className="text-[11px] uppercase tracking-[0.10em] text-[#ecedf4]/55 truncate"
            style={FONT_MONO}
          >
            {Math.max(0, (index ?? 0)) + 1} / {total}
          </p>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={onPrev}
              disabled={!canPrev}
              aria-label="Previous item (↑/K)"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.04] text-[#ecedf4]/75 hover:text-[#ecedf4] hover:bg-white/[0.08] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={!canNext}
              aria-label="Next item (↓/J)"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.04] text-[#ecedf4]/75 hover:text-[#ecedf4] hover:bg-white/[0.08] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-1.5 pb-3">
        {/* Single neutral card — flat, modern, no nested cards */}
        <div
          className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4 space-y-3"
        >
          {/* Header: title/meta left, actions top-right */}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h3
                className="text-[18px] font-semibold leading-[1.2] tracking-tight text-[#f7f8fc]"
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
              <div className="mt-1.5 flex items-center gap-2 text-[12px] text-[#ecedf4]/75" style={FONT_BODY}>
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
                  <span>{target}</span>
                )}
                <span className="text-[#ecedf4]/40">·</span>
                <span className="text-[#ecedf4]/65">
                  Suggested {formatDistanceToNow(new Date(item.created_at))} ago
                </span>
                {contactTargetId && (
                  <>
                    <span className="text-[#ecedf4]/40">·</span>
                    <span className="text-[#ecedf4]/65">
                      Last contact at:{' '}
                      {contactLastContact
                        ? `${new Date(contactLastContact).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} (${formatDistanceToNow(new Date(contactLastContact))} ago)`
                        : 'no activity yet'}
                    </span>
                  </>
                )}
              </div>
            </div>
            <div className="shrink-0 flex items-center gap-2">
              <button
                type="button"
                disabled={busy !== null}
                onClick={async () => {
                  setBusy('r');
                  await onReject();
                  setBusy(null);
                }}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[12px] text-[#f58aa0] hover:bg-[#f58aa0]/10 border border-[#f58aa0]/30 disabled:opacity-60"
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
                className="inline-flex items-center gap-2 h-8 px-4 rounded-md text-[12px] font-semibold text-[#0a0a14] bg-[#5ecdf5] hover:bg-[#74d4f7] transition-colors disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5ecdf5]"
                style={FONT_BODY}
              >
                {busy === 'a' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {approveButtonLabel(item, editedCount > 0)}
              </button>
            </div>
          </div>

          {/* On-approve summary strip — tinted, no border, high-contrast body */}
          <div
            className="rounded-md px-3.5 py-2.5"
            style={{ background: 'rgba(94,205,245,0.07)' }}
          >
            <div className="flex items-baseline gap-2.5">
              <span
                className="text-[10px] uppercase tracking-[0.12em] text-[#5ecdf5] font-semibold shrink-0"
                style={FONT_BODY}
              >
                On approve
              </span>
              <p
                className="text-[13px] leading-[1.45] text-[#f7f8fc]"
                style={FONT_BODY}
              >
                {onApproveSentence}
              </p>
            </div>
          </div>

          {/* Rationale */}
          <p
            className="text-[12.5px] leading-[1.6] text-[#ecedf4]/90 max-w-[72ch]"
            style={FONT_BODY}
          >
            {item.rationale || buildRationaleFallback(item)}
          </p>

          {/* Proposed changes — full-width, flat, balanced columns */}
          {fieldKeys.length > 0 && (
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-baseline gap-2">
                  <p
                    className="text-[11px] font-semibold uppercase tracking-[0.10em] text-[#ecedf4]/90"
                    style={FONT_BODY}
                  >
                    Proposed changes
                  </p>
                  {editMode && editedCount > 0 && (
                    <span
                      className="text-[10px] uppercase tracking-[0.10em] text-[#f3c969]"
                      style={FONT_BODY}
                    >
                      {editedCount} edited
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setEditMode((v) => !v)}
                  className="inline-flex items-center gap-1 h-6 px-1.5 rounded text-[11px] text-[#ecedf4]/75 hover:text-[#ecedf4] hover:bg-white/[0.05] transition-colors"
                  style={FONT_BODY}
                >
                  <Pencil className="h-3 w-3" /> {editMode ? 'Done' : 'Edit'}
                </button>
              </div>

              <div className="border-t border-b border-white/[0.10]">
                <div className="grid grid-cols-[minmax(7rem,0.65fr)_minmax(0,1fr)_minmax(0,1fr)] gap-x-5 px-0 py-2 border-b border-white/[0.08]">
                  {['Field', 'Current', 'Proposed'].map((h) => (
                    <p
                      key={h}
                      className="text-[10.5px] font-semibold uppercase tracking-[0.10em] text-[#ecedf4]/90"
                      style={FONT_BODY}
                    >
                      {h}
                    </p>
                  ))}
                </div>
                <div className="divide-y divide-white/[0.06]">
                  {fieldKeys.map((k) => {
                    const oldV = oldValues[k];
                    const effectiveOldV =
                      k === 'last_contact_at' && !oldV && resolvedLastContactAt
                        ? resolvedLastContactAt
                        : oldV;
                    const proposedRaw = edits[k] ?? newValues[k];
                    const oldDisplay = formatFieldValue(k, effectiveOldV, lookups);
                    const proposedDisplay = formatFieldValue(k, proposedRaw, lookups);
                    const isOldEmpty = oldDisplay === '';
                    return (
                      <div
                        key={k}
                        className="grid grid-cols-[minmax(7rem,0.65fr)_minmax(0,1fr)_minmax(0,1fr)] gap-x-5 px-0 py-2.5 items-baseline"
                      >
                        <p
                          className="text-[12px] text-[#ecedf4]/90"
                          style={FONT_BODY}
                        >
                          {humanizeFieldKey(k)}
                        </p>
                        <span
                          className={`min-w-0 text-[12.5px] break-words ${
                            isOldEmpty
                              ? 'text-[#ecedf4]/65 italic'
                              : 'text-[#ecedf4]/90'
                          }`}
                          style={FONT_BODY}
                        >
                          {isOldEmpty ? 'No current value' : oldDisplay}
                        </span>
                        {editMode ? (
                          <Input
                            value={proposedRaw == null ? '' : String(proposedRaw)}
                            onChange={(e) =>
                              setEdits((p) => ({ ...p, [k]: e.target.value }))
                            }
                            className="h-7 text-[12.5px] px-2 bg-white/[0.06] border-white/[0.12] text-[#f7f8fc] focus-visible:ring-1 focus-visible:ring-[#5ecdf5]/60 min-w-0"
                            style={FONT_BODY}
                          />
                        ) : (
                          <span
                            className="min-w-0 text-[12.5px] font-medium text-[#f7f8fc] break-words"
                            style={FONT_BODY}
                          >
                            {proposedDisplay || (
                              <span className="text-[#ecedf4]/65 font-normal">—</span>
                            )}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {item.execution_error && (
            <p className="text-[11.5px] text-[#f58aa0]" style={FONT_BODY}>
              Last execution failed: {item.execution_error}
            </p>
          )}
        </div>
      </div>

      {/* Action buttons moved to top-right of the detail header. */}
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

