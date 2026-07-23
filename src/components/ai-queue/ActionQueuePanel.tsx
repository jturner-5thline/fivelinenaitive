import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminRole } from '@/hooks/useAdminRole';
import { useApprovalQueueScope, useMyManagedDealIds } from '@/hooks/useApprovalQueueScope';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  STAGE_CONFIG,
  STATUS_CONFIG,
  LENDER_STATUS_CONFIG,
  LENDER_STAGE_CONFIG,
  LENDER_TRACKING_STATUS_CONFIG,
} from '@/types/deal';
import { useLenderStages } from '@/contexts/LenderStagesContext';
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
import { ClaapRecordingBundleCard } from './ClaapRecordingBundleCard';
import { CreateDealApprovalCard } from './CreateDealApprovalCard';
import { ApprovalReviewExpanded } from './ApprovalReviewExpanded';
import { TaskListEditor, type EditorTask } from './TaskListEditor';
import { usePipelineContext } from '@/contexts/PipelineContext';
import {
  buildOutcomeSentence,
  // buildOnApproveSentence removed — intent now conveyed via the item title
  approveButtonLabel,
  targetSummary,
  buildRationaleFallback,
  toSingleSentence,
  TAG_STYLE_FIELD_KEYS,
  prettifyTagLabel,
} from './approvalCopy';
import { formatEditableDate, isDateFieldName, isIsoDateLike, parseEditableDateToIso } from './editableDate';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  useDealAccessRequests,
  useApproveDealAccessRequest,
  useDeclineDealAccessRequest,
  type DealAccessRequest,
} from '@/hooks/useDealAccessRequests';
import {
  useAllFlexInfoNotifications,
  useApproveFlexAccessRequest,
  useDeclineFlexAccessRequest,
  type FlexAccessRequest,
} from '@/hooks/useAllFlexInfoNotifications';

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

const TYPE_META: Partial<Record<AiActionType | 'draft_email_bundle' | 'update_funding_source_bundle' | 'claap_recording_review_bundle' | 'terms_issued_bundle', { label: string; icon: typeof CheckSquare }>> = {
  create_task: { label: 'Task', icon: CheckSquare },
  update_lender_status: { label: 'Funding source', icon: Building2 },
  save_to_data_room: { label: 'Data room', icon: Save },
  log_note: { label: 'Note', icon: FileText },
  deal_update: { label: 'Deal', icon: Briefcase },
  claap_recording_review: { label: 'Claap recording', icon: Video },
  claap_recording_review_bundle: { label: 'Claap recordings', icon: Video },
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
  draft_email_bundle: { label: 'Email drafts', icon: FileText },
  update_funding_source_bundle: { label: 'Funding sources', icon: Building2 },
  terms_issued_bundle: { label: 'Term Sheet Items', icon: FileText },
  escalate: { label: 'Escalation', icon: ShieldAlert },
  reassign_deal: { label: 'Reassign', icon: Briefcase },
  create_new_deal: { label: 'New deal', icon: Briefcase },
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

function isDisplayDateField(key: string): boolean {
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
  if (isDisplayDateField(key)) {
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

/** Returns dropdown options for enum-style fields ({value, label} pairs), or
 *  null if the field is free-form text. Options are context-aware: the target
 *  object type disambiguates lender substage vs deal substage, etc. */
function getFieldOptions(
  key: string,
  item: QueuedAiAction,
  lookups: { stages?: Record<string, string>; pipelines?: Record<string, string>; lenderStages?: Array<{ id: string; label: string }> },
): Array<{ value: string; label: string }> | null {
  const targetType = (item as any).target_object_type as string | undefined;
  const isLenderCtx =
    targetType === 'deal_lender' ||
    targetType === 'funding_source' ||
    item.action_type === 'update_funding_source' ||
    item.action_type === 'update_lender_status';

  const toOpts = (cfg: Record<string, { label: string }>) =>
    Object.entries(cfg).map(([value, { label }]) => ({ value, label }));

  switch (key) {
    case 'stage':
    case 'stage_id': {
      // For funding source / lender rows, `stage` is the lender pipeline
      // stage — pull from the company-configured lender stages (which include
      // On Deck, Reviewing DRL, Terms Issued, Passed, etc.), NOT the deal stages.
      if (isLenderCtx) {
        const configured = lookups.lenderStages ?? [];
        if (configured.length > 0) {
          return configured.map((s) => ({ value: s.id, label: s.label }));
        }
        return toOpts(LENDER_STAGE_CONFIG);
      }
      // Prefer live pipeline stages when available; fall back to STAGE_CONFIG.
      const stageMap = lookups.stages ?? {};
      const entries = Object.entries(stageMap);
      if (entries.length > 0) {
        return entries.map(([value, label]) => ({ value, label }));
      }
      return toOpts(STAGE_CONFIG);
    }
    case 'pipeline_id': {
      return Object.entries(lookups.pipelines ?? {}).map(([value, label]) => ({ value, label }));
    }
    case 'status':
    case 'deal_status': {
      if (isLenderCtx) return toOpts(LENDER_STATUS_CONFIG);
      return toOpts(STATUS_CONFIG);
    }
    case 'tracking_status':
    case 'lender_tracking_status': {
      const base = toOpts(LENDER_TRACKING_STATUS_CONFIG);
      // Enforced value used by the Deal Admin Agent.
      if (!base.some((o) => o.value === 'unresponsive')) {
        base.push({ value: 'unresponsive', label: 'Unresponsive' });
      }
      return base;
    }
    case 'substage':
    case 'sub_stage':
    case 'lender_status':
    case 'funding_source_status': {
      if (isLenderCtx || key === 'lender_status' || key === 'funding_source_status') {
        const configured = lookups.lenderStages ?? [];
        if (configured.length > 0) {
          return configured.map((s) => ({ value: s.id, label: s.label }));
        }
        return toOpts(LENDER_STAGE_CONFIG);
      }
      return null;
    }
    case 'priority': {
      return [
        { value: 'low', label: 'Low' },
        { value: 'medium', label: 'Medium' },
        { value: 'high', label: 'High' },
        { value: 'urgent', label: 'Urgent' },
      ];
    }
    default:
      return null;
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   Main panel
   ──────────────────────────────────────────────────────────────────────── */

type FilterKey = 'all' | 'low' | 'review' | 'needs_you';

/** Strip em/en dashes from approval queue display text. */
function stripEmDashes<T extends string | null | undefined>(s: T): T {
  if (typeof s !== 'string') return s;
  return s.replace(/\s*[—–]\s*/g, ' - ').replace(/ {2,}/g, ' ') as T;
}

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

  const { data: flexRequests = [] } = useAllFlexInfoNotifications();
  const approveFlexRequest = useApproveFlexAccessRequest();
  const declineFlexRequest = useDeclineFlexAccessRequest();

  // Staged drafts are now shown inline in the left rail (no tab split).
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Admin-only scope filter: "All" vs "Me" (deals where current user is manager).
  const { isAdmin } = useAdminRole();
  const [scope, setScope] = useApprovalQueueScope();
  const { data: myDealIds } = useMyManagedDealIds(isAdmin);

  const scopeActive = isAdmin && scope === 'me';

  const scopedItems = useMemo(() => {
    const base = !scopeActive
      ? items
      : items.filter((it) => {
          const ids = myDealIds ?? new Set<string>();
          return it.deal_id && ids.has(it.deal_id);
        });
    // Strip em dashes from user-facing text on queue items.
    return base.map((it) => ({
      ...it,
      title: stripEmDashes(it.title),
      description: stripEmDashes(it.description),
      rationale: stripEmDashes(it.rationale),
    })) as typeof base;
  }, [items, scopeActive, myDealIds]);

  const scopedAccessRequests = useMemo(() => {
    if (!scopeActive) return accessRequests;
    const ids = myDealIds ?? new Set<string>();
    return accessRequests.filter((r) => r.deal_id && ids.has(r.deal_id));
  }, [accessRequests, scopeActive, myDealIds]);

  const scopedFlexRequests = useMemo(() => {
    if (!scopeActive) return flexRequests;
    const ids = myDealIds ?? new Set<string>();
    return flexRequests.filter((r) => r.deal_id && ids.has(r.deal_id));
  }, [flexRequests, scopeActive, myDealIds]);

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

  // Collect funding_source_ids referenced by any terms_issued:{deal}:{fs}
  // bundle_key in the currently filtered items, then resolve them to lender
  // display names so the Terms Issued bundle card can title itself
  // "{Lender} Term Sheet Items" even when the only surviving sub-item is a
  // save_to_data_room proposal (whose linked_entity_label points at the DEAL,
  // not the lender).
  const termsBundleFundingSourceIds = useMemo(() => {
    const ids = new Set<string>();
    for (const it of filtered) {
      const nv =
        (it as any).new_values ||
        (it as any).payload?.on_approve_execution_payload?.new_values ||
        {};
      const bk = typeof nv.bundle_key === 'string' ? nv.bundle_key : '';
      if (!bk.startsWith('terms_issued:')) continue;
      const fsId = bk.split(':')[2];
      if (fsId) ids.add(fsId);
    }
    return Array.from(ids).sort();
  }, [filtered]);

  const { data: fundingSourceNameMap } = useQuery({
    queryKey: ['terms-bundle-funding-source-names', termsBundleFundingSourceIds],
    enabled: termsBundleFundingSourceIds.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data: lenders } = await (supabase as any)
        .from('deal_lenders')
        .select('id, master_lender_id')
        .in('id', termsBundleFundingSourceIds);
      const masterIds = Array.from(
        new Set(
          (lenders ?? [])
            .map((l: any) => l?.master_lender_id)
            .filter((v: any): v is string => typeof v === 'string' && v.length > 0),
        ),
      );
      let nameByMasterId = new Map<string, string>();
      if (masterIds.length > 0) {
        const { data: masters } = await (supabase as any)
          .from('master_lenders')
          .select('id, name')
          .in('id', masterIds);
        for (const m of masters ?? []) {
          if (m?.id && typeof m.name === 'string') nameByMasterId.set(m.id, m.name);
        }
      }
      const out = new Map<string, string>();
      for (const l of lenders ?? []) {
        if (!l?.id) continue;
        const name = l.master_lender_id ? nameByMasterId.get(l.master_lender_id) : undefined;
        if (name) out.set(l.id, name);
      }
      return out;
    },
  });

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
      // Group by normalized deal name so duplicate deal records that share the
      // same company name (e.g. multiple "Gabb Wireless" deal rows) collapse
      // into a single accordion. Fall back to deal_id when no name exists,
      // then to the "unassigned" bucket.
      const nameKey = (it.deal_name || '').trim().toLowerCase();
      const key = nameKey
        ? `name:${nameKey}`
        : it.deal_id
          ? `id:${it.deal_id}`
          : '__unassigned__';
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
      // Bundle helper: collapses N items of a given action-type into a
      // single synthetic queue entry with __bundle attached.
      const bundleItems = (
        matches: (it: QueuedAiAction) => boolean,
        opts: { idKey: string; actionType: string; title: string; description: string; rationale: string },
      ) => {
        const picks = g.items.filter(matches);
        if (picks.length < 2) return;
        const rest = g.items.filter((it) => !picks.includes(it));
        const bundle: QueuedAiAction = {
          ...picks[0],
          id: `bundle:${opts.idKey}:${g.key}`,
          action_type: opts.actionType as unknown as AiActionType,
          title: opts.title,
          description: opts.description,
          rationale: opts.rationale,
          old_values: {},
          new_values: {},
        } as QueuedAiAction;
        (bundle as any).__bundle = picks;
        g.items = [bundle, ...rest];
      };

      // Collapse 2+ email drafts on the same deal into a single synthetic
      // bundle. Nudge-heavy bundles keep the "Follow up with Lenders" label;
      // otherwise use a generic "Email drafts" label.
      // Terms Issued lender bundle — collapse ALL items sharing the same
      // `new_values.bundle_key` starting with "terms_issued:" into a single
      // per-lender card. This groups the (save PDF + update funding source +
      // add status note + advance stage) proposals emitted by the Deal Admin
      // Agent's Terms Issued rule for one lender on one deal.
      const termsGroups = new Map<string, QueuedAiAction[]>();
      for (const it of g.items) {
        const nv = (it as any).new_values || (it as any).payload?.on_approve_execution_payload?.new_values || {};
        const bk = typeof nv.bundle_key === 'string' ? nv.bundle_key : '';
        if (!bk.startsWith('terms_issued:')) continue;
        if (!termsGroups.has(bk)) termsGroups.set(bk, []);
        termsGroups.get(bk)!.push(it);
      }
      for (const [bk, picks] of termsGroups.entries()) {
        if (picks.length < 1) continue;
        // Pull a lender label from any child. Priority:
        //   1. update_funding_source pick's linked_entity_label ("Lender on Deal" → "Lender").
        //   2. Any pick whose linked_entity_label contains " on " (strip the deal suffix).
        //   3. Extract lender name from an add_status_note title
        //      (e.g. "Add Status Note: Five Crowns Capital Issued Term Sheet ...").
        //   4. Fall back to "Lender".
        const stripOn = (s: string | undefined | null): string => {
          if (!s) return '';
          const m = s.split(/\s+on\s+/i);
          return (m[0] || '').trim();
        };
        const dealNameLc = (g.dealName || '').trim().toLowerCase();
        const isDealName = (s: string) => !!s && s.trim().toLowerCase() === dealNameLc;
        let lenderLabel = '';
        // 0 — authoritative: resolve the funding_source_id encoded in the
        //     bundle_key to the lender's display name via deal_lenders →
        //     master_lenders. This is the only reliable source when the
        //     surviving sub-items don't carry the lender name (e.g. a
        //     save_to_data_room whose linked_entity_label is the DEAL).
        const fsIdFromKey = bk.split(':')[2] || '';
        const nameFromMap = fsIdFromKey ? fundingSourceNameMap?.get(fsIdFromKey) : undefined;
        if (nameFromMap && !isDealName(nameFromMap)) {
          lenderLabel = nameFromMap;
        }
        // 1 & 2 — any pick with a label containing " on "
        if (!lenderLabel)
        for (const p of picks) {
          const raw = (p as any).payload?.linked_entity_label as string | undefined;
          if (raw && /\s+on\s+/i.test(raw)) {
            const candidate = stripOn(raw);
            if (candidate && !isDealName(candidate)) {
              lenderLabel = candidate;
              break;
            }
          }
        }
        // 3 — parse from an add_status_note title
        if (!lenderLabel) {
          const note = picks.find((p) => p.action_type === ('add_status_note' as AiActionType)) as any;
          const title: string = note?.title || '';
          // "Add Status Note: <Lender> Issued Term Sheet on ..." or
          // "Add status note for <Lender> IOI on <Deal>"
          const m1 = title.match(/^Add [Ss]tatus [Nn]ote:\s*(.+?)\s+(?:Issued|IOI|Term|Sent)/);
          const m2 = title.match(/^Add [Ss]tatus [Nn]ote for\s+(.+?)\s+(?:Issued|IOI|Term|Sent)/);
          const parsed = (m1?.[1] || m2?.[1] || '').trim();
          if (parsed && !isDealName(parsed)) lenderLabel = parsed;
        }
        // 4 — last-resort fallback: any non-deal-name label
        if (!lenderLabel) {
          for (const p of picks) {
            const raw = ((p as any).payload?.linked_entity_label as string | undefined) || '';
            const candidate = stripOn(raw) || raw;
            if (candidate && !isDealName(candidate)) {
              lenderLabel = candidate;
              break;
            }
          }
        }
        if (!lenderLabel) lenderLabel = 'Lender';
        const kinds = new Set(picks.map((p) => p.action_type));
        const parts: string[] = [];
        if (kinds.has('save_to_data_room' as AiActionType)) parts.push('Save PDF');
        if (kinds.has('update_funding_source' as AiActionType)) parts.push('Update funding source');
        if (kinds.has('add_status_note' as AiActionType)) parts.push('Add status note');
        // Always render bundled — a per-lender Terms Issued card even with a
        // single sub-item, so the reviewer sees the semantic "Lender — Term
        // Sheet / IOI" grouping consistently. Inline the collapse (bundleItems
        // enforces >=2).
        const rest = g.items.filter((it) => !picks.includes(it));
        const bundle: QueuedAiAction = {
          ...picks[0],
          id: `bundle:terms-issued:${bk}:${g.key}`,
          action_type: 'terms_issued_bundle' as unknown as AiActionType,
          title: `${lenderLabel} Term Sheet Items`,
          description: parts.join(' · ') || `${picks.length} lender action${picks.length === 1 ? '' : 's'}`,
          rationale: `${lenderLabel} sent terms — ${picks.length} related action${picks.length === 1 ? '' : 's'} for review.`,
          old_values: {},
          new_values: {},
        } as QueuedAiAction;
        (bundle as any).__bundle = picks;
        g.items = [bundle, ...rest];
      }

      const drafts = g.items.filter((it) => it.action_type === 'draft_email');
      if (drafts.length >= 2) {
        const nudgeCount = drafts.filter((it) => /nudge/i.test(it.title || '')).length;
        const mostlyNudges = nudgeCount >= Math.ceil(drafts.length / 2);
        bundleItems((it) => it.action_type === 'draft_email', {
          idKey: 'drafts',
          actionType: 'draft_email_bundle',
          title: mostlyNudges ? 'Follow up with Lenders' : 'Email drafts',
          description: `${drafts.length} email drafts`,
          rationale: `${drafts.length} outbound email drafts pending on this deal.`,
        });
      }

      // Collapse 2+ funding-source / lender-status updates into a single
      // "Update Lenders" bundle. Individual updates stay editable via the
      // carousel in the detail pane.
      const fsUpdates = g.items.filter(
        (it) => it.action_type === 'update_funding_source' || it.action_type === 'update_lender_status',
      );
      if (fsUpdates.length >= 2) {
        bundleItems(
          (it) => it.action_type === 'update_funding_source' || it.action_type === 'update_lender_status',
          {
            idKey: 'fs-updates',
            actionType: 'update_funding_source_bundle',
            title: 'Update Lenders',
            description: `${fsUpdates.length} lender updates`,
            rationale: `${fsUpdates.length} funding source / lender updates pending on this deal.`,
          },
        );
      }

      // Collapse 2+ Claap recording match suggestions on the same deal into
      // a single "Link Recordings..." bundle. The detail pane renders a
      // multi-select picker so the user links a subset in one go.
      const claapMatches = g.items.filter((it) => it.action_type === 'claap_recording_review');
      if (claapMatches.length >= 2) {
        bundleItems((it) => it.action_type === 'claap_recording_review', {
          idKey: 'claap-recordings',
          actionType: 'claap_recording_review_bundle',
          title: 'Link Recordings...',
          description: `${claapMatches.length} recordings to link`,
          rationale: `${claapMatches.length} Claap recordings suggested for this deal.`,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.items.length - a.items.length);
  }, [filtered, fundingSourceNameMap]);

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
      data-approval-queue-panel
      className="relative flex flex-col h-full min-h-0 font-sans text-[#ecedf4] motion-reduce:transform-none"
    >
      {/* Ambient glows removed — detail pane matches Deal Details flat surface. */}

      {/* Header */}
      <div className="relative px-4 py-2.5 border-b border-white/[0.20] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <h2 className="text-[18px] leading-none tracking-tight" style={FONT_DISPLAY}>
            Approval Queue
          </h2>
          <span
            className="ml-1 inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full text-[10px] font-semibold bg-red-500 text-white"
          >
            {totalCount}
          </span>
          <span
            className="text-[8px] uppercase text-[#ecedf4]/58"
            style={{ ...FONT_MONO, letterSpacing: '0.10em' }}
          >
            synced just now
          </span>
        </div>
        <div className="flex items-center gap-2">
        </div>
      </div>

      {/* Body */}
      {(items.length + accessRequests.length + flexRequests.length) === 0 ? (
        <EmptyState />
      ) : (
        <div className="relative grid grid-cols-1 md:grid-cols-[392px_1fr] flex-1 min-h-0">
          {/* LEFT RAIL */}
          <aside className="flex flex-col min-h-0 md:border-r border-white/[0.20]">
            <div className="px-3 pt-2 pb-2 space-y-2 shrink-0">
              {/* Search + Me filter */}
              <div className="flex items-center gap-1.5">
                <div className="relative flex-1 min-w-0">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#ecedf4]/40" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search actions, deals…"
                    className="h-8 pl-8 text-[12px] rounded-lg bg-white/[0.035] border-white/[0.20] text-[#ecedf4] placeholder:text-[#ecedf4]/34 focus-visible:ring-1 focus-visible:ring-[#5ecdf5]/60"
                    style={FONT_BODY}
                  />
                </div>
                {isAdmin && (
                  <FilterChip
                    label="Me"
                    count={
                      myDealIds
                        ? items.filter((it) => it.deal_id && myDealIds.has(it.deal_id)).length +
                          accessRequests.filter((r) => r.deal_id && myDealIds.has(r.deal_id)).length +
                          flexRequests.filter((r) => r.deal_id && myDealIds.has(r.deal_id)).length
                        : 0
                    }
                    active={scope === 'me'}
                    onClick={() => setScope(scope === 'me' ? 'all' : 'me')}
                  />
                )}
              </div>
            </div>

            {/* Scrollable row list */}
            <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2 space-y-2">
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

              {scopedFlexRequests.length > 0 && (
                <div className="space-y-1">
                  <p
                    className="px-1 pt-1 text-[9.5px] uppercase text-[#ecedf4]/45"
                    style={{ ...FONT_MONO, letterSpacing: '0.10em' }}
                  >
                    FLEx access requests
                  </p>
                  {scopedFlexRequests.map((req) => (
                    <FlexAccessRequestRow
                      key={req.id}
                      req={req}
                      onApprove={() => approveFlexRequest(req)}
                      onDecline={() => declineFlexRequest(req)}
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
                        const ids: string[] = [];
                        for (const i of g.items) {
                          const children = (i as any).__bundle as QueuedAiAction[] | undefined;
                          if (children && children.length) {
                            for (const c of children) ids.push(c.id);
                          } else if (typeof i.id === 'string' && !i.id.startsWith('bundle:')) {
                            ids.push(i.id);
                          }
                        }
                        await dismissMany(ids);
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
          <section data-approval-queue-detail className="min-h-0 flex flex-col bg-[var(--approval-queue-flat-surface)]">
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
                onApproveChild={async (child, opts) => approve(child, opts)}
                onRejectChild={async (childId) => dismiss(childId)}
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
      className={`group relative overflow-hidden inline-flex items-center gap-2 h-8 px-3 rounded-md border text-[12px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#5ecdf5] ${
        active
          ? 'border-[rgba(126,184,247,0.35)] bg-[rgba(126,184,247,0.12)] text-foreground shadow-glass before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:bg-[linear-gradient(135deg,rgba(126,184,247,0.15)_0%,transparent_50%)] hover:bg-[rgba(126,184,247,0.2)] hover:border-[rgba(126,184,247,0.5)]'
          : 'border-white/[0.24] bg-white/[0.04] text-[#ecedf4]/80 hover:text-[#ecedf4] hover:bg-white/[0.06] hover:border-white/[0.28]'
      }`}
      style={FONT_BODY}
    >
      <span className="relative z-[1]">{label}</span>
      <span
        className={`relative z-[1] inline-flex items-center h-4 px-1.5 rounded-[4px] text-[10px] ${
          active
            ? 'bg-[rgba(126,184,247,0.18)] text-foreground'
            : 'bg-white/[0.06] text-[#ecedf4]/60'
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
          : 'bg-white/[0.025] border-white/[0.20] text-[#ecedf4]/58 hover:text-[#ecedf4] hover:bg-white/[0.05]'
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
  const bundleChildren = (item as any).__bundle as QueuedAiAction[] | undefined;
  const navigate = useNavigate();
  const openDealDetails = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    if (item.deal_id) navigate(`/deals?deal=${item.deal_id}`);
  };

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? 'true' : undefined}
        style={{
          backgroundImage:
            'linear-gradient(135deg, #020208 0%, #050d1f 20%, #040b14 40%, #02080f 60%, #0a0418 80%, #040008 100%)',
        }}
        className={`relative w-full text-left rounded-[13px] pl-3 pr-3 py-2.5 border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#5ecdf5] ${
          selected
            ? 'border-white/[0.28]'
            : 'border-white/[0.20] hover:border-white/[0.32]'
        }`}
      >
        {selected && (
          <span
            className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full"
            style={{ background: 'linear-gradient(180deg, #5ecdf5 0%, #9b6fd4 100%)' }}
          />
        )}
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-[9px] bg-white/[0.04] border border-white/[0.20] shrink-0">
            <Icon className="h-3.5 w-3.5 text-[#ecedf4]/75" />
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span
                className="h-1.5 w-1.5 rounded-full shrink-0"
                style={{ background: dot, boxShadow: `0 0 8px ${dot}66` }}
              />
              <p
                role={item.deal_id ? 'link' : undefined}
                tabIndex={item.deal_id ? 0 : undefined}
                onClick={item.deal_id ? openDealDetails : undefined}
                onKeyDown={
                  item.deal_id
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') openDealDetails(e);
                      }
                    : undefined
                }
                className={`text-[12.5px] text-[#ecedf4] truncate ${
                  item.deal_id ? 'cursor-pointer hover:text-primary hover:underline underline-offset-4' : ''
                }`}
                style={FONT_BODY}
                title={item.deal_id ? `Open ${item.deal_name || 'deal'} details` : item.title}
              >
                {item.title}
              </p>
              {bundleChildren && bundleChildren.length > 0 && (
                <span
                  className="ml-1 inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full text-[9.5px] font-semibold bg-white/[0.08] border border-white/[0.18] text-[#ecedf4]/80 shrink-0"
                  style={FONT_MONO}
                  title={`${bundleChildren.length} sub-actions`}
                >
                  {bundleChildren.length}
                </span>
              )}
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

/* Bundle preview drawer — a lightweight side sheet that lists every
 * sub-action inside a bundled queue card (e.g. a Terms Issued lender
 * bundle: Save PDF, Update funding source, Add status note) so the
 * reviewer can scan what will happen before clicking into the full
 * detail pane to approve. Read-only summary; the primary CTA hands off
 * to the existing detail pane for edits and approvals.
 */
function BundlePreviewDrawer({
  open,
  onOpenChange,
  bundleTitle,
  dealName,
  children,
  onOpenDetail,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  bundleTitle: string;
  dealName: string | null;
  children: QueuedAiAction[];
  onOpenDetail: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[min(480px,95vw)] sm:max-w-[480px] p-0 bg-[#06060a] border-l border-white/[0.12] text-[#ecedf4] flex flex-col"
      >
        <SheetHeader className="px-4 pt-4 pb-3 border-b border-white/[0.10] space-y-1.5 text-left">
          <SheetTitle className="text-[15px] font-semibold text-[#f7f8fc]" style={FONT_DISPLAY}>
            {bundleTitle}
          </SheetTitle>
          <SheetDescription className="text-[11.5px] text-[#ecedf4]/60" style={FONT_BODY}>
            {dealName ? `${dealName} · ` : ''}
            {children.length} sub-action{children.length === 1 ? '' : 's'} to review
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
          {children.map((c, idx) => {
            const cMeta = TYPE_META[c.action_type];
            const CIcon = cMeta?.icon ?? CheckSquare;
            const nv = (c.new_values || {}) as Record<string, any>;
            const summaryEntries = Object.entries(nv)
              .filter(([k]) => k !== 'bundle_key' && k !== '_synthetic')
              .slice(0, 5);
            return (
              <div
                key={c.id}
                className="rounded-[11px] border border-white/[0.14] bg-white/[0.03] px-3 py-2.5"
              >
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-white/[0.05] border border-white/[0.18] shrink-0">
                    <CIcon className="h-3 w-3 text-[#ecedf4]/75" />
                  </span>
                  <p
                    className="text-[11.5px] uppercase tracking-wide text-[#ecedf4]/55"
                    style={FONT_MONO}
                  >
                    Step {idx + 1} · {cMeta?.label ?? c.action_type}
                  </p>
                </div>
                <p
                  className="mt-1.5 text-[13px] text-[#f0f1f6] leading-snug"
                  style={FONT_BODY}
                  title={c.title}
                >
                  {c.title}
                </p>
                {c.description && !(c.action_type === 'create_followup_task' && (c.new_values as any)?._synthetic === 'update_tasks') && (
                  <p
                    className="mt-1 text-[11.5px] text-[#ecedf4]/60 leading-snug line-clamp-3"
                    style={FONT_BODY}
                  >
                    {c.description}
                  </p>
                )}
                {summaryEntries.length > 0 && (
                  <div className="mt-2 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1">
                    {summaryEntries.map(([k, v]) => (
                      <div key={k} className="contents">
                        <span
                          className="text-[10px] uppercase tracking-wide text-[#ecedf4]/45"
                          style={FONT_MONO}
                        >
                          {k}
                        </span>
                        <span
                          className="text-[11.5px] text-[#ecedf4]/85 break-words line-clamp-2"
                          style={FONT_BODY}
                        >
                          {typeof v === 'string'
                            ? v
                            : v == null
                              ? '—'
                              : JSON.stringify(v)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="border-t border-white/[0.10] p-3 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="inline-flex items-center h-7 px-3 rounded-md text-[11.5px] border border-white/[0.18] text-[#ecedf4]/75 hover:bg-white/[0.05]"
            style={FONT_BODY}
          >
            Close
          </button>
          <button
            type="button"
            onClick={onOpenDetail}
            className="inline-flex items-center h-7 px-3 rounded-md text-[11.5px] bg-[#5ecdf5]/15 border border-[#5ecdf5]/40 text-[#5ecdf5] hover:bg-[#5ecdf5]/25"
            style={FONT_BODY}
          >
            Open to approve
          </button>
        </div>
      </SheetContent>
    </Sheet>
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
  const [confirmRejectOpen, setConfirmRejectOpen] = useState(false);
  const count = group.items.length;
  const lowCount = useMemo(
    () => group.items.filter((i) => riskOf(i) === 'low').length,
    [group.items],
  );
  return (
    <li
      style={{
        backgroundImage:
          'linear-gradient(135deg, #020208 0%, #050d1f 20%, #040b14 40%, #02080f 60%, #0a0418 80%, #040008 100%)',
      }}
      className={`rounded-[14px] border transition-colors ${
        expanded
          ? 'border-white/[0.28]'
          : 'border-white/[0.16] hover:border-white/[0.28]'
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
              disabled={busy !== null}
              onClick={() => setConfirmRejectOpen(true)}
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
          <AlertDialog open={confirmRejectOpen} onOpenChange={setConfirmRejectOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reject all pending actions?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will reject {count} pending action{count === 1 ? '' : 's'} for{' '}
                  <span className="font-medium text-foreground">{group.dealName}</span>. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={async () => {
                    setConfirmRejectOpen(false);
                    setBusy('r');
                    await onRejectAll();
                    setBusy(null);
                  }}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Reject all
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
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
          className="h-6 px-2 text-[10px] border border-white/[0.24] bg-white/[0.06] hover:bg-white/[0.10] text-[#ecedf4]"
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

function FlexAccessRequestRow({
  req,
  onApprove,
  onDecline,
}: {
  req: FlexAccessRequest;
  onApprove: () => Promise<unknown>;
  onDecline: () => Promise<unknown>;
}) {
  const [busy, setBusy] = useState<'a' | 'd' | null>(null);
  const lender = req.lender_name || req.company_name || req.user_email || 'Lender';
  return (
    <div className="rounded-[13px] border border-[#5ecdf5]/25 bg-[#5ecdf5]/[0.05] p-2.5">
      <div className="flex items-start gap-2">
        <KeyRound className="h-3.5 w-3.5 text-[#5ecdf5] mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[12px] truncate" style={FONT_BODY}>
            Approve Access for {lender}
          </p>
          <p
            className="text-[10px] text-[#ecedf4]/58 truncate"
            style={{ ...FONT_MONO, letterSpacing: '0.04em' }}
          >
            FLEx request · {req.deal_name || 'Untitled deal'}
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
          className="h-6 px-2 text-[10px] border border-white/[0.24] bg-white/[0.06] hover:bg-white/[0.10] text-[#ecedf4]"
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
  onApproveChild,
  onRejectChild,
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
  onApproveChild?: (child: QueuedAiAction, opts?: { editedValues?: Record<string, any> }) => Promise<unknown>;
  onRejectChild?: (childId: string) => Promise<unknown>;
}) {
  const meta = TYPE_META[item.action_type];
  const target = targetSummary(item);
  const outcome = buildOutcomeSentence(item);
  const [editMode, setEditMode] = useState(false);
  const [busy, setBusy] = useState<'a' | 'r' | null>(null);
  const [edits, setEdits] = useState<Record<string, any>>({});
  const [showTaskErrors, setShowTaskErrors] = useState(false);
  const navigate = useNavigate();
  // Lookup tables to resolve raw UUIDs (stage_id, pipeline_id) into labels.
  const { pipelines } = usePipelineContext();
  const { stages: lenderStagesConfigured } = useLenderStages();
  const lookups = useMemo(() => {
    const stages: Record<string, string> = {};
    const pipelinesMap: Record<string, string> = {};
    for (const p of pipelines ?? []) {
      pipelinesMap[p.id] = p.name;
      for (const s of p.stages ?? []) stages[s.id] = s.label;
    }
    return {
      stages,
      pipelines: pipelinesMap,
      lenderStages: (lenderStagesConfigured ?? []).map((s) => ({ id: s.id, label: s.label })),
    };
  }, [pipelines, lenderStagesConfigured]);
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
      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        <ClaapApprovalCard item={item} />
      </div>
    );
  }

  // Bundled Claap recording matches → multi-select linker.
  if ((item.action_type as string) === 'claap_recording_review_bundle') {
    const bundle = (item as any).__bundle as QueuedAiAction[] | undefined;
    if (bundle && bundle.length > 0) {
      return (
        <div className="flex-1 min-h-0 overflow-y-auto p-3">
          <ClaapRecordingBundleCard items={bundle} />
        </div>
      );
    }
  }

  // Post-sales-call "Create new deal" items get a dedicated card that
  // reuses the standard Create Deal dialog for edit + finalize.
  if (item.action_type === 'create_new_deal') {
    return <CreateDealApprovalCard item={item} />;
  }

  // Bundle view — multiple "Nudge …" email drafts combined into one queue item.
  const bundleChildren = (item as any).__bundle as QueuedAiAction[] | undefined;
  if (bundleChildren && bundleChildren.length > 0) {
    return (
      <BundleDetailPane
        item={item}
        children={bundleChildren}
        onApproveChild={onApproveChild!}
        onRejectChild={onRejectChild!}
        openDeal={openDeal}
      />
    );
  }

  const evidence = Array.isArray(item.evidence) ? item.evidence : [];
  const expires = expiryDaysLabel(item);
  const oldValues = (item.old_values || {}) as Record<string, any>;
  const newValues = (item.new_values || {}) as Record<string, any>;
  const isEmailDraft = item.action_type === 'draft_email';
  const isUpdateTasksPrompt =
    item.action_type === 'create_followup_task' &&
    (newValues as any)?._synthetic === 'update_tasks';
  const tasksIncomplete = (() => {
    if (!isUpdateTasksPrompt) return false;
    const tasks = Array.isArray((edits as any)?.tasks) ? (edits as any).tasks : [];
    if (tasks.length === 0) return true;
    return tasks.some(
      (t: any) => !t || !String(t.title ?? '').trim() || !t.assigned_to,
    );
  })();
  const fieldKeys = (() => {
    if (isEmailDraft || isUpdateTasksPrompt) return [] as string[];
    const norm = (v: any) =>
      v == null || (typeof v === 'string' && v.trim() === '') ? '' : String(v).trim();
    const keys = Array.from(
      new Set<string>([...Object.keys(oldValues), ...Object.keys(newValues)]),
    );
    // Only surface fields with an actual proposed change: proposed must be
    // non-empty AND different from the current value.
    return keys.filter((k) => {
      const proposed = norm(newValues[k]);
      if (!proposed) return false;
      return proposed !== norm(oldValues[k]);
    });
  })();
  const editedCount = Object.keys(edits).length;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {typeof total === 'number' && total > 0 && (
        <div className="flex items-center justify-between gap-2 px-4 pt-1.5 pb-1.5 border-b border-white/[0.16] shrink-0">
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
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/[0.20] bg-white/[0.04] text-[#ecedf4]/75 hover:text-[#ecedf4] hover:bg-white/[0.08] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={!canNext}
              aria-label="Next item (↓/J)"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/[0.20] bg-white/[0.04] text-[#ecedf4]/75 hover:text-[#ecedf4] hover:bg-white/[0.08] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 pt-1.5 pb-2 bg-[var(--approval-queue-flat-surface)]">
        {/* Single neutral card — flat, modern, no nested cards */}
        <div className="rounded-xl border border-white/[0.20] bg-[var(--approval-queue-flat-surface)] p-4 space-y-3 shadow-none">
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
                title={tasksIncomplete ? 'Every task needs a title and an assignee' : undefined}
                onClick={async () => {
                  if (tasksIncomplete) {
                    setShowTaskErrors(true);
                    toast.error('Every task row needs a title and an assignee', {
                      description:
                        'Fill in the highlighted fields before creating tasks.',
                    });
                    return;
                  }
                  setBusy('a');
                  await onApprove(editedCount > 0 ? { editedValues: edits } : undefined);
                  setBusy(null);
                }}
                className="relative overflow-hidden inline-flex items-center gap-2 h-8 px-4 rounded-lg text-[12px] font-semibold text-foreground border border-[rgba(126,184,247,0.35)] bg-[rgba(126,184,247,0.12)] backdrop-blur-xl shadow-glass hover:bg-[rgba(126,184,247,0.2)] hover:border-[rgba(126,184,247,0.5)] hover:shadow-glass-hover before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:bg-[linear-gradient(135deg,rgba(126,184,247,0.15)_0%,transparent_50%)] transition-all duration-200 ease-out disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                style={FONT_BODY}
              >
                {busy === 'a' ? <Loader2 className="relative h-3.5 w-3.5 animate-spin" /> : null}
                <span className="relative">{approveButtonLabel(item, editedCount > 0)}</span>
              </button>
            </div>
          </div>

          {/* Rationale */}
          {!isUpdateTasksPrompt && (
            <p
              className="text-[14px] leading-[1.6] text-white max-w-[72ch]"
              style={FONT_BODY}
            >
              {toSingleSentence(item.rationale || buildRationaleFallback(item))}
            </p>
          )}

          {/* Evidence snippet — short neutral quote of the triggering signal
              (e.g. the connect/schedule language from the inbound lender
              email). Renders only when the agent supplied one. */}
          {(() => {
            const ev = String(
              (item as any).payload?.evidence_summary ?? '',
            ).trim();
            if (!ev) return null;
            return (
              <div
                className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-[13px] leading-[1.55] text-white/85 max-w-[72ch]"
                style={FONT_BODY}
              >
                <div className="mb-0.5 text-[11px] uppercase tracking-wide text-white/50">
                  Evidence
                </div>
                {ev}
              </div>
            );
          })()}

          {/* Proposed changes — stacked review cards, one per field */}
          {isEmailDraft && (
            <EmailDraftPreview
              item={item}
              newValues={newValues}
              editMode={editMode}
              onToggleEditMode={() => setEditMode((v) => !v)}
              edits={edits}
              setEdits={setEdits}
            />
          )}
          {!isEmailDraft && fieldKeys.length > 0 && (
            <div>
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-baseline gap-2">
                  <p
                    className="text-[16px] font-semibold tracking-tight text-[#f7f8fc]"
                    style={FONT_BODY}
                  >
                    Proposed changes
                  </p>
                  {editMode && editedCount > 0 && (
                    <span
                      className="text-[12px] text-[#f3c969]"
                      style={FONT_BODY}
                    >
                      {editedCount} edited
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setEditMode((v) => !v)}
                  className="inline-flex items-center gap-1 h-7 px-2 rounded text-[12px] text-[#ecedf4]/75 hover:text-[#ecedf4] hover:bg-white/[0.05] transition-colors"
                  style={FONT_BODY}
                >
                  <Pencil className="h-3 w-3" /> {editMode ? 'Done' : 'Edit'}
                </button>
              </div>

              <div className="space-y-2.5">
                {fieldKeys.map((k) => {
                  const oldV = oldValues[k];
                  const effectiveOldV =
                    k === 'last_contact_at' && !oldV && resolvedLastContactAt
                      ? resolvedLastContactAt
                      : oldV;
                  const proposedRaw = edits[k] ?? newValues[k];
                  const isEditableDateField = isDateFieldName(k) || isIsoDateLike(proposedRaw) || isIsoDateLike(effectiveOldV);
                  const proposedEditValue = isEditableDateField
                    ? formatEditableDate(proposedRaw)
                    : proposedRaw == null
                      ? ''
                      : String(proposedRaw);
                  const oldDisplay = formatFieldValue(k, effectiveOldV, lookups);
                  const proposedDisplay = formatFieldValue(k, proposedRaw, lookups);
                  const isOldEmpty = oldDisplay === '';
                  const fieldOptions = isEditableDateField ? null : getFieldOptions(k, item, lookups);

                  // Long-form fields render full width, one block above the other.
                  const LONG_TEXT_KEYS = new Set([
                    'body', 'html_body', 'plain_body', 'notes', 'narrative',
                    'description', 'message', 'content', 'summary', 'status_notes',
                    'flag_notes', 'subject',
                  ]);
                  const combinedLen = (oldDisplay?.length || 0) + (proposedDisplay?.length || 0);
                  const hasNewline = /\n/.test(oldDisplay || '') || /\n/.test(proposedDisplay || '');
                  const isLongText =
                    LONG_TEXT_KEYS.has(k) || hasNewline || combinedLen > 120;
                  const stacked = isLongText;

                  const currentBlock = TAG_STYLE_FIELD_KEYS.has(k) && !isOldEmpty ? (
                    <span
                      className="inline-flex items-center h-6 px-2.5 rounded-full text-[12px] font-medium border border-white/[0.28] bg-white/[0.04] text-[#ecedf4]/90"
                      style={FONT_BODY}
                    >
                      {prettifyTagLabel(oldDisplay)}
                    </span>
                  ) : isOldEmpty ? (
                    <span
                      className="inline-flex items-center h-6 px-2.5 rounded-full text-[12px] text-[#ecedf4]/60 border border-white/[0.24] bg-white/[0.03]"
                      style={FONT_BODY}
                    >
                      No current value
                    </span>
                  ) : (
                    <p
                      className="text-[14px] leading-[1.55] text-[#ecedf4]/90 whitespace-pre-wrap break-words"
                      style={FONT_BODY}
                    >
                      {oldDisplay}
                    </p>
                  );

                  const proposedBlock = editMode && fieldOptions && fieldOptions.length > 0 ? (
                    <Select
                      value={
                        typeof proposedRaw === 'string' && proposedRaw
                          ? proposedRaw
                          : undefined
                      }
                      onValueChange={(value) => {
                        setEdits((p) => ({ ...p, [k]: value }));
                      }}
                    >
                      <SelectTrigger
                        className="h-8 text-[13px] px-2.5 bg-white/[0.06] border-white/[0.28] text-[#f7f8fc] focus:ring-1 focus:ring-[#5ecdf5]/60"
                        style={FONT_BODY}
                      >
                        <SelectValue placeholder="Select…" />
                      </SelectTrigger>
                      <SelectContent className="bg-[#0f1420] border-white/[0.28] text-[#f7f8fc]">
                        {fieldOptions.map((opt) => (
                          <SelectItem
                            key={opt.value}
                            value={opt.value}
                            className="text-[13px] focus:bg-white/[0.08] focus:text-[#f7f8fc]"
                          >
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : editMode ? (
                    isLongText ? (
                      <Textarea
                        rows={Math.min(14, Math.max(4, (proposedEditValue.match(/\n/g)?.length ?? 0) + 3))}
                        placeholder={isEditableDateField ? 'MM-DD-YYYY' : undefined}
                        value={proposedEditValue}
                        onChange={(e) => {
                          const value = e.target.value;
                          setEdits((p) => ({ ...p, [k]: value }));
                        }}
                        className="text-[14px] leading-[1.55] px-3 py-2 bg-white/[0.06] border-white/[0.28] text-[#f7f8fc] focus-visible:ring-1 focus-visible:ring-[#5ecdf5]/60"
                        style={FONT_BODY}
                      />
                    ) : (
                      <Input
                        type="text"
                        placeholder={isEditableDateField ? 'MM-DD-YYYY' : undefined}
                        value={proposedEditValue}
                        onChange={(e) => {
                          const value = e.target.value;
                          const nextValue = isEditableDateField
                            ? parseEditableDateToIso(value, newValues[k] ?? effectiveOldV)
                            : value;
                          setEdits((p) => ({ ...p, [k]: nextValue ?? '' }));
                        }}
                        className="h-8 text-[13px] px-2.5 bg-white/[0.06] border-white/[0.28] text-[#f7f8fc] focus-visible:ring-1 focus-visible:ring-[#5ecdf5]/60"
                        style={FONT_BODY}
                      />
                    )
                  ) : TAG_STYLE_FIELD_KEYS.has(k) && proposedDisplay ? (
                    <span
                      className="inline-flex items-center h-6 px-2.5 rounded-full text-[12px] font-semibold border border-white/[0.28] bg-[var(--approval-queue-flat-surface)] text-[#f7f8fc]"
                      style={FONT_BODY}
                    >
                      {prettifyTagLabel(proposedDisplay)}
                    </span>
                  ) : proposedDisplay ? (
                    <p
                      className="text-[14px] leading-[1.55] font-medium text-[#f7f8fc] whitespace-pre-wrap break-words"
                      style={FONT_BODY}
                    >
                      {proposedDisplay}
                    </p>
                  ) : (
                    <span className="text-[13px] text-[#ecedf4]/60" style={FONT_BODY}>—</span>
                  );

                  return (
                    <div
                      key={k}
                      className="rounded-lg border border-white/[0.20] bg-white/[0.02] px-3.5 py-3"
                    >
                      <p
                        className="text-[13px] font-medium text-[#ecedf4]/70 mb-2.5"
                        style={FONT_BODY}
                      >
                        {humanizeFieldKey(k)}
                      </p>
                      {stacked ? (
                        <div className="space-y-2">
                          <div className="rounded-md border border-white/[0.16] bg-white/[0.02] px-3 py-2">
                            <p
                              className="text-[11px] uppercase tracking-[0.08em] text-[#ecedf4]/50 mb-1"
                              style={FONT_BODY}
                            >
                              Current
                            </p>
                            {currentBlock}
                          </div>
                          <div className="rounded-md border border-white/[0.20] bg-[var(--approval-queue-flat-surface)] px-3 py-2 shadow-none">
                            <p
                              className="text-[11px] uppercase tracking-[0.08em] text-[#ecedf4]/50 mb-1"
                              style={FONT_BODY}
                            >
                              New
                            </p>
                            {proposedBlock}
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div className="rounded-md border border-white/[0.16] bg-white/[0.02] px-3 py-2 min-w-0">
                            <p
                              className="text-[11px] uppercase tracking-[0.08em] text-[#ecedf4]/50 mb-1"
                              style={FONT_BODY}
                            >
                              Current
                            </p>
                            {currentBlock}
                          </div>
                          <div className="rounded-md border border-white/[0.20] bg-[var(--approval-queue-flat-surface)] px-3 py-2 min-w-0 shadow-none">
                            <p
                              className="text-[11px] uppercase tracking-[0.08em] text-[#ecedf4]/50 mb-1"
                              style={FONT_BODY}
                            >
                              New
                            </p>
                            {proposedBlock}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {isUpdateTasksPrompt && (
            <div>
              <p
                className="text-[16px] font-semibold tracking-tight text-[#f7f8fc] mb-3"
                style={FONT_BODY}
              >
                Create task
              </p>
              <TaskListEditor
                dealName={item.deal_name || 'this deal'}
                initialTasks={
                  Array.isArray((newValues as any)?.tasks) && (newValues as any).tasks.length > 0
                    ? (newValues as any).tasks.map((t: any) => ({
                        title: String(t?.title ?? ''),
                        due_date: t?.due_date ?? null,
                        assigned_to: t?.assigned_to ?? null,
                      }))
                    : ([
                        {
                          title: '',
                          due_date: (newValues as any)?.due_date ?? null,
                          assigned_to: (newValues as any)?.assigned_to ?? null,
                        },
                      ] as EditorTask[])
                }
                onChange={(tasks) => setEdits((p) => ({ ...p, tasks }))}
              />
            </div>
          )}

          {/* Status note editor for funding source updates. Persisted into
           *  deal_lenders.notes via the executor's `merged.notes` handling. */}
          {editMode && isFundingSource && (
            <div className="space-y-1.5">
              <p
                className="text-[11px] font-semibold uppercase tracking-[0.10em] text-[#ecedf4]/90"
                style={FONT_BODY}
              >
                Status note
              </p>
              <Textarea
                rows={3}
                value={typeof edits.notes === 'string' ? edits.notes : (oldValues.notes ?? '')}
                onChange={(e) => setEdits((p) => ({ ...p, notes: e.target.value }))}
                placeholder="Add context for this status change (optional)…"
                className="text-[12.5px] px-2.5 py-2 bg-white/[0.06] border-white/[0.28] text-[#f7f8fc] placeholder:text-[#ecedf4]/45 focus-visible:ring-1 focus-visible:ring-[#5ecdf5]/60"
                style={FONT_BODY}
              />
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
   Email draft preview — used for action_type='draft_email' (nudges).
   Renders a cohesive "Suggested email" card instead of a diff-style
   Current vs Proposed comparison. Nudges are outbound email proposals,
   not deal-record field updates.
   ──────────────────────────────────────────────────────────────────────── */
function EmailDraftPreview({
  item,
  newValues,
  editMode,
  onToggleEditMode,
  edits,
  setEdits,
}: {
  item: QueuedAiAction;
  newValues: Record<string, any>;
  editMode: boolean;
  onToggleEditMode: () => void;
  edits: Record<string, any>;
  setEdits: (updater: (prev: Record<string, any>) => Record<string, any>) => void;
}) {
  const rawTo = edits.to ?? newValues.to ?? '';
  const toDisplay = Array.isArray(rawTo)
    ? rawTo.filter(Boolean).join(', ')
    : typeof rawTo === 'string'
      ? rawTo
      : String(rawTo || '');
  const subject = String(edits.subject ?? newValues.subject ?? '');
  const body = String(edits.body ?? newValues.body ?? '');

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-3">
        <p
          className="text-[16px] font-semibold tracking-tight text-[#f7f8fc]"
          style={FONT_BODY}
        >
          Suggested email
        </p>
        <button
          type="button"
          onClick={onToggleEditMode}
          className="inline-flex items-center gap-1 h-7 px-2 rounded text-[12px] text-[#ecedf4]/75 hover:text-[#ecedf4] hover:bg-white/[0.05] transition-colors"
          style={FONT_BODY}
        >
          <Pencil className="h-3 w-3" /> {editMode ? 'Done' : 'Edit'}
        </button>
      </div>

      <div className="rounded-lg border border-white/[0.24] bg-white/[0.03] overflow-hidden">
        {/* To */}
        <div className="flex items-baseline gap-3 px-4 py-2.5 border-b border-white/[0.16]">
          <span
            className="text-[12px] font-medium text-[#ecedf4]/55 shrink-0 w-16"
            style={FONT_BODY}
          >
            To
          </span>
          {editMode ? (
            <Input
              type="text"
              value={toDisplay}
              onChange={(e) =>
                setEdits((p) => ({
                  ...p,
                  to: e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                }))
              }
              className="h-7 text-[13px] px-2 bg-white/[0.06] border-white/[0.28] text-[#f7f8fc] focus-visible:ring-1 focus-visible:ring-[#5ecdf5]/60"
              style={FONT_BODY}
            />
          ) : (
            <span
              className="text-[14px] text-[#f7f8fc] break-all"
              style={FONT_BODY}
            >
              {toDisplay || <span className="text-[#ecedf4]/60">—</span>}
            </span>
          )}
        </div>

        {/* Subject */}
        <div className="flex items-baseline gap-3 px-4 py-2.5 border-b border-white/[0.16]">
          <span
            className="text-[12px] font-medium text-[#ecedf4]/55 shrink-0 w-16"
            style={FONT_BODY}
          >
            Subject
          </span>
          {editMode ? (
            <Input
              type="text"
              value={subject}
              onChange={(e) => setEdits((p) => ({ ...p, subject: e.target.value }))}
              className="h-7 text-[13px] px-2 bg-white/[0.06] border-white/[0.28] text-[#f7f8fc] focus-visible:ring-1 focus-visible:ring-[#5ecdf5]/60"
              style={FONT_BODY}
            />
          ) : (
            <span
              className="text-[14px] font-medium text-[#f7f8fc] break-words"
              style={FONT_BODY}
            >
              {subject || <span className="text-[#ecedf4]/60">—</span>}
            </span>
          )}
        </div>

        {/* Message body */}
        <div className="px-4 py-3">
          <p
            className="text-[12px] font-medium text-[#ecedf4]/55 mb-2"
            style={FONT_BODY}
          >
            Message
          </p>
          {editMode ? (
            <Textarea
              rows={Math.min(20, Math.max(8, (body.match(/\n/g)?.length ?? 0) + 4))}
              value={body}
              onChange={(e) => setEdits((p) => ({ ...p, body: e.target.value }))}
              className="text-[14px] leading-[1.6] px-3 py-2 bg-white/[0.06] border-white/[0.28] text-[#f7f8fc] focus-visible:ring-1 focus-visible:ring-[#5ecdf5]/60"
              style={FONT_BODY}
            />
          ) : (
            <p
              className="text-[14px] leading-[1.65] text-[#f0f1f6] whitespace-pre-wrap break-words"
              style={FONT_BODY}
            >
              {body || <span className="text-[#ecedf4]/60">—</span>}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/* useMyManagedDealIds moved to @/hooks/useApprovalQueueScope so the header
   badge can share the same match logic as the queue panel. */

/* ─────────────────────────────────────────────────────────────────────────
   Bundle detail pane — renders N nudge email drafts as a stack of per-recipient
   cards with individual approve/reject controls plus batch actions.
   ──────────────────────────────────────────────────────────────────────── */
function extractRecipientLabel(child: QueuedAiAction): string {
  const nv = (child.new_values || {}) as Record<string, any>;
  const to = nv.to;
  const toStr = Array.isArray(to) ? to.filter(Boolean).join(', ') : (to || '');
  const raw = (child.title || '').trim();
  // Extract the lender/funding source name from titles like:
  //   "Nudge Worthy"
  //   "Draft Worthy Lender Nudge"
  //   "Draft Revtek Nudge follow-up"
  //   "Update Revtek status"
  //   "Update Worthy funding source"
  let namePart = raw || 'Lender';
  const m1 = raw.match(/^\s*nudge\s+(.+?)(?:\s+(?:lender|funding\s+source))?\s*$/i);
  const m2 = raw.match(/^\s*draft\s+(.+?)\s+(?:lender\s+)?nudge\b.*$/i);
  const m3 = raw.match(/^\s*update\s+(.+?)(?:\s+(?:lender|funding\s+source|status|contact|stage))?\s*$/i);
  if (m2) namePart = m2[1].trim();
  else if (m1) namePart = m1[1].trim();
  else if (m3) namePart = m3[1].trim();
  namePart = namePart.replace(/\s+(lender|funding\s+source)$/i, '').trim() || raw;
  return toStr ? `${namePart} · ${toStr}` : namePart;
}

function BundleDetailPane({
  item,
  children,
  onApproveChild,
  onRejectChild,
  openDeal,
}: {
  item: QueuedAiAction;
  children: QueuedAiAction[];
  onApproveChild: (child: QueuedAiAction, opts?: { editedValues?: Record<string, any> }) => Promise<unknown>;
  onRejectChild: (childId: string) => Promise<unknown>;
  openDeal: (tab?: string) => void;
}) {
  const dealId = (item as any).deal_id as string | undefined;
  const [batchBusy, setBatchBusy] = useState<'a' | 'r' | null>(null);
  const [confirmRejectAllOpen, setConfirmRejectAllOpen] = useState(false);
  const isEmailBundle = children[0]?.action_type === 'draft_email';
  const kindLabel = isEmailBundle ? 'drafts' : 'updates';
  const introCopy = isEmailBundle
    ? 'Individual follow-up emails drafted for each lender / funding source. Review, edit, and approve each one separately, or use Approve all / Reject all above.'
    : 'Individual lender / funding-source updates proposed on this deal. Review and approve each one separately, or use Approve all / Reject all above.';

  const approveAll = async () => {
    setBatchBusy('a');
    for (const c of children) {
      try { await onApproveChild(c); } catch (e) { console.error('[bundle approveAll]', e); }
    }
    setBatchBusy(null);
  };
  const rejectAll = async () => {
    setBatchBusy('r');
    for (const c of children) {
      try { await onRejectChild(c.id); } catch (e) { console.error('[bundle rejectAll]', e); }
    }
    setBatchBusy(null);
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex-1 min-h-0 overflow-y-auto px-3 pt-1.5 pb-2 bg-[var(--approval-queue-flat-surface)]">
        <div className="rounded-xl border border-white/[0.20] bg-[var(--approval-queue-flat-surface)] p-4 space-y-4 shadow-none">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h3 className="text-[18px] font-semibold leading-[1.2] tracking-tight text-[#f7f8fc]" style={FONT_DISPLAY}>
                {item.title}
              </h3>
              <div className="mt-1.5 flex items-center gap-2 text-[12px] text-[#ecedf4]/75" style={FONT_BODY}>
                {dealId && item.deal_name ? (
                  <button
                    type="button"
                    onClick={() => openDeal()}
                    className="underline-offset-2 hover:underline hover:text-[#5ecdf5] cursor-pointer"
                    title={`Open ${item.deal_name}`}
                  >
                    {item.deal_name}
                  </button>
                ) : (
                  <span>{item.deal_name || 'Unassigned'}</span>
                )}
                <span className="text-[#ecedf4]/40">·</span>
                <span className="text-[#ecedf4]/65">{children.length} drafts</span>
              </div>
            </div>
            <div className="shrink-0 flex items-center gap-2">
              <button
                type="button"
                disabled={batchBusy !== null}
                onClick={() => setConfirmRejectAllOpen(true)}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[12px] text-[#f58aa0] hover:bg-[#f58aa0]/10 border border-[#f58aa0]/30 disabled:opacity-60"
                style={FONT_BODY}
              >
                {batchBusy === 'r' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                Reject all
              </button>
              <button
                type="button"
                disabled={batchBusy !== null}
                onClick={approveAll}
                className="relative overflow-hidden inline-flex items-center gap-2 h-8 px-4 rounded-lg text-[12px] font-semibold text-foreground border border-[rgba(126,184,247,0.35)] bg-[rgba(126,184,247,0.12)] backdrop-blur-xl shadow-glass hover:bg-[rgba(126,184,247,0.2)] hover:border-[rgba(126,184,247,0.5)] hover:shadow-glass-hover before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:bg-[linear-gradient(135deg,rgba(126,184,247,0.15)_0%,transparent_50%)] transition-all duration-200 ease-out disabled:opacity-60"
                style={FONT_BODY}
              >
                {batchBusy === 'a' ? <Loader2 className="relative h-3.5 w-3.5 animate-spin" /> : null}
                <span className="relative">Approve all</span>
              </button>
            </div>
          </div>

          <p className="text-[14px] leading-[1.6] text-white max-w-[72ch]" style={FONT_BODY}>
            {introCopy}
          </p>

          <BundleChildCarousel
            children={children}
            onApproveChild={onApproveChild}
            onRejectChild={onRejectChild}
          />
        </div>
      </div>
      <AlertDialog open={confirmRejectAllOpen} onOpenChange={setConfirmRejectAllOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject all {kindLabel}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will reject {children.length} lender {kindLabel}. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                setConfirmRejectAllOpen(false);
                await rejectAll();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Reject all
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function BundleChildCarousel({
  children,
  onApproveChild,
  onRejectChild,
}: {
  children: QueuedAiAction[];
  onApproveChild: (child: QueuedAiAction, opts?: { editedValues?: Record<string, any> }) => Promise<unknown>;
  onRejectChild: (childId: string) => Promise<unknown>;
}) {
  const [index, setIndex] = useState(0);
  const safeIndex = Math.min(index, Math.max(0, children.length - 1));
  const current = children[safeIndex];
  const total = children.length;
  const go = (dir: -1 | 1) => setIndex((i) => {
    const next = i + dir;
    if (next < 0) return total - 1;
    if (next >= total) return 0;
    return next;
  });
  if (!current) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => go(-1)}
          disabled={total <= 1}
          aria-label="Previous draft"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/[0.18] bg-white/[0.03] text-[#ecedf4]/75 hover:bg-white/[0.08] hover:text-[#f7f8fc] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <div className="flex items-center gap-1.5">
          {children.map((c, i) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Go to draft ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${i === safeIndex ? 'w-5 bg-[#7eb8f7]' : 'w-1.5 bg-white/25 hover:bg-white/40'}`}
            />
          ))}
          <span className="ml-2 text-[11px] text-[#ecedf4]/55" style={FONT_BODY}>
            {safeIndex + 1} / {total}
          </span>
        </div>
        <button
          type="button"
          onClick={() => go(1)}
          disabled={total <= 1}
          aria-label="Next draft"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/[0.18] bg-white/[0.03] text-[#ecedf4]/75 hover:bg-white/[0.08] hover:text-[#f7f8fc] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
      <BundleChildCard
        key={current.id}
        child={current}
        onApprove={(opts) => onApproveChild(current, opts)}
        onReject={() => onRejectChild(current.id)}
      />
    </div>
  );
}

function BundleChildCard({
  child,
  onApprove,
  onReject,
}: {
  child: QueuedAiAction;
  onApprove: (opts?: { editedValues?: Record<string, any> }) => Promise<unknown>;
  onReject: () => Promise<unknown>;
}) {
  const [editMode, setEditMode] = useState(false);
  const [edits, setEdits] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState<'a' | 'r' | null>(null);
  const [handled, setHandled] = useState<'approved' | 'rejected' | null>(null);
  const newValues = (child.new_values || {}) as Record<string, any>;
  const editedCount = Object.keys(edits).length;

  if (handled) {
    return (
      <div className="rounded-lg border border-white/[0.16] bg-white/[0.02] px-3.5 py-2.5 text-[12px] text-[#ecedf4]/60" style={FONT_BODY}>
        {extractRecipientLabel(child)} · {handled === 'approved' ? 'Approved' : 'Rejected'}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-white/[0.20] bg-white/[0.02] px-3.5 py-3 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-[#f7f8fc] truncate" style={FONT_BODY}>
            {extractRecipientLabel(child).split('·')[0].trim()}
          </p>
        </div>
        <div className="shrink-0 flex items-center gap-1.5">
          {child.action_type !== 'draft_email' && (
            <button
              type="button"
              onClick={() => setEditMode((v) => !v)}
              className="inline-flex items-center gap-1 h-7 px-2 rounded text-[11.5px] text-[#ecedf4]/75 hover:text-[#ecedf4] hover:bg-white/[0.05] transition-colors"
              style={FONT_BODY}
              title={editMode ? 'Done editing' : 'Edit fields'}
            >
              <Pencil className="h-3 w-3" /> {editMode ? 'Done' : 'Edit'}
              {editedCount > 0 && (
                <span className="ml-1 text-[10px] text-[#f3c969]">{editedCount}</span>
              )}
            </button>
          )}
          <button
            type="button"
            disabled={busy !== null}
            onClick={async () => {
              setBusy('r');
              try { await onReject(); setHandled('rejected'); }
              finally { setBusy(null); }
            }}
            className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-[11.5px] text-[#f58aa0] hover:bg-[#f58aa0]/10 border border-[#f58aa0]/25 disabled:opacity-60"
            style={FONT_BODY}
          >
            {busy === 'r' ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
            Reject
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={async () => {
              setBusy('a');
              try { await onApprove(editedCount > 0 ? { editedValues: edits } : undefined); setHandled('approved'); }
              finally { setBusy(null); }
            }}
            className="relative overflow-hidden inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-[11.5px] font-semibold text-foreground border border-[rgba(126,184,247,0.35)] bg-[rgba(126,184,247,0.12)] hover:bg-[rgba(126,184,247,0.2)] hover:border-[rgba(126,184,247,0.5)] before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:bg-[linear-gradient(135deg,rgba(126,184,247,0.15)_0%,transparent_50%)] disabled:opacity-60"
            style={FONT_BODY}
          >
            {busy === 'a' ? <Loader2 className="relative h-3 w-3 animate-spin" /> : null}
            <span className="relative">{approveButtonLabel(child, editedCount > 0)}</span>
          </button>
        </div>
      </div>
      {child.action_type === 'draft_email' ? (
        <EmailDraftPreview
          item={child}
          newValues={newValues}
          editMode={editMode}
          onToggleEditMode={() => setEditMode((v) => !v)}
          edits={edits}
          setEdits={setEdits}
        />
      ) : (
        <BundleFieldEditor
          child={child}
          editMode={editMode}
          edits={edits}
          setEdits={setEdits}
        />
      )}
    </div>
  );
}

/**
 * Editable per-child field editor used inside bundle cards. When `editMode`
 * is on, each changed field renders as an inline Input/Textarea/Select so
 * the reviewer can adjust the proposed stage, milestone, funding-source
 * status, or free-form status note independently before approving the
 * individual sub-action. Edits flow up via `setEdits` and are committed on
 * the per-child Approve button (which sends `editedValues`).
 */
function BundleFieldEditor({
  child,
  editMode,
  edits,
  setEdits,
}: {
  child: QueuedAiAction;
  editMode: boolean;
  edits: Record<string, any>;
  setEdits: React.Dispatch<React.SetStateAction<Record<string, any>>>;
}) {
  const oldValues = (child.old_values || {}) as Record<string, any>;
  const newValues = (child.new_values || {}) as Record<string, any>;
  const { pipelines } = usePipelineContext();
  const { stages: lenderStagesConfigured } = useLenderStages();
  const lookups = useMemo(() => {
    const stages: Record<string, string> = {};
    const pipelinesMap: Record<string, string> = {};
    for (const p of pipelines ?? []) {
      pipelinesMap[p.id] = p.name;
      for (const s of p.stages ?? []) stages[s.id] = s.label;
    }
    return {
      stages,
      pipelines: pipelinesMap,
      lenderStages: (lenderStagesConfigured ?? []).map((s) => ({ id: s.id, label: s.label })),
    };
  }, [pipelines, lenderStagesConfigured]);

  const norm = (v: any) =>
    v == null || (typeof v === 'string' && v.trim() === '') ? '' : String(v).trim();

  const changedKeys = Array.from(
    new Set<string>([...Object.keys(oldValues), ...Object.keys(newValues)]),
  ).filter((k) => {
    if (k === 'bundle_key' || k === '_synthetic') return false;
    const p = norm(newValues[k]);
    return p && p !== norm(oldValues[k]);
  });

  // Always expose a status-note field for the funding-source / stage /
  // milestone sub-actions so the reviewer can add or refine the note
  // independently, even if the agent didn't originally propose one.
  const NOTE_KEYS = ['notes', 'status_notes', 'note'];
  const hasNoteKey = changedKeys.some((k) => NOTE_KEYS.includes(k));
  const supportsNote =
    child.action_type === 'update_funding_source' ||
    child.action_type === 'add_status_note' ||
    child.action_type === 'update_deal_stage' ||
    (child.action_type as string) === 'update_deal_milestone' ||
    child.target_object_type === 'deal_lender' ||
    child.target_object_type === 'funding_source';
  const noteKey = hasNoteKey
    ? (changedKeys.find((k) => NOTE_KEYS.includes(k)) as string)
    : child.action_type === 'add_status_note'
      ? 'note'
      : 'notes';
  const shouldAppendNoteField = editMode && supportsNote && !hasNoteKey;
  const displayKeys = shouldAppendNoteField ? [...changedKeys, noteKey] : changedKeys;

  if (displayKeys.length === 0) {
    return (
      <p className="text-[12px] text-[#ecedf4]/55" style={FONT_BODY}>
        {child.rationale || child.description || 'No field changes proposed.'}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {displayKeys.map((k) => {
        const oldV = oldValues[k];
        const proposedRaw = edits[k] ?? newValues[k];
        const isEditableDateField =
          isDateFieldName(k) || isIsoDateLike(proposedRaw) || isIsoDateLike(oldV);
        const proposedEditValue = isEditableDateField
          ? formatEditableDate(proposedRaw)
          : proposedRaw == null
            ? ''
            : String(proposedRaw);
        const oldDisplay = formatFieldValue(k, oldV, lookups);
        const proposedDisplay = formatFieldValue(k, proposedRaw, lookups);
        const fieldOptions = isEditableDateField ? null : getFieldOptions(k, child, lookups);
        const isNote = NOTE_KEYS.includes(k);
        const isLongText =
          isNote ||
          /\n/.test(String(proposedRaw ?? '')) ||
          (proposedDisplay?.length ?? 0) + (oldDisplay?.length ?? 0) > 120;

        return (
          <div
            key={k}
            className="rounded-md border border-white/[0.16] bg-white/[0.02] px-2.5 py-2"
          >
            <p
              className="text-[10px] font-medium uppercase tracking-wide text-[#ecedf4]/55 mb-1.5"
              style={FONT_BODY}
            >
              {humanizeFieldKey(k)}
            </p>

            {editMode ? (
              fieldOptions && fieldOptions.length > 0 ? (
                <Select
                  value={
                    typeof proposedRaw === 'string' && proposedRaw ? proposedRaw : undefined
                  }
                  onValueChange={(value) => setEdits((p) => ({ ...p, [k]: value }))}
                >
                  <SelectTrigger
                    className="h-8 text-[12.5px] px-2 bg-white/[0.06] border-white/[0.28] text-[#f7f8fc]"
                    style={FONT_BODY}
                  >
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0f1420] border-white/[0.28] text-[#f7f8fc]">
                    {fieldOptions.map((opt) => (
                      <SelectItem
                        key={opt.value}
                        value={opt.value}
                        className="text-[12.5px] focus:bg-white/[0.08] focus:text-[#f7f8fc]"
                      >
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : isLongText ? (
                <Textarea
                  rows={Math.min(8, Math.max(3, (proposedEditValue.match(/\n/g)?.length ?? 0) + 2))}
                  value={proposedEditValue}
                  placeholder={isNote ? 'Add or refine the status note…' : undefined}
                  onChange={(e) => setEdits((p) => ({ ...p, [k]: e.target.value }))}
                  className="text-[12.5px] leading-[1.5] px-2.5 py-1.5 bg-white/[0.06] border-white/[0.28] text-[#f7f8fc] focus-visible:ring-1 focus-visible:ring-[#5ecdf5]/60"
                  style={FONT_BODY}
                />
              ) : (
                <Input
                  type="text"
                  value={proposedEditValue}
                  placeholder={isEditableDateField ? 'MM-DD-YYYY' : undefined}
                  onChange={(e) => {
                    const value = e.target.value;
                    const nextValue = isEditableDateField
                      ? parseEditableDateToIso(value, newValues[k] ?? oldV)
                      : value;
                    setEdits((p) => ({ ...p, [k]: nextValue ?? '' }));
                  }}
                  className="h-8 text-[12.5px] px-2 bg-white/[0.06] border-white/[0.28] text-[#f7f8fc] focus-visible:ring-1 focus-visible:ring-[#5ecdf5]/60"
                  style={FONT_BODY}
                />
              )
            ) : (
              <div className="text-[12px]" style={FONT_BODY}>
                {oldDisplay ? (
                  <>
                    <span className="text-[#ecedf4]/55 line-through mr-1.5">{oldDisplay}</span>
                    <span className="text-[#ecedf4]/40 mr-1.5">→</span>
                  </>
                ) : null}
                <span className="text-[#f7f8fc] font-medium whitespace-pre-wrap break-words">
                  {proposedDisplay || <span className="text-[#ecedf4]/50">—</span>}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Empty state
   ──────────────────────────────────────────────────────────────────────── */
function EmptyState() {
  return (
    <div className="relative flex flex-1 h-full flex-col items-center justify-center gap-3 py-20 text-center">
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-[14px] border border-white/[0.20] bg-white/[0.035]">
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

