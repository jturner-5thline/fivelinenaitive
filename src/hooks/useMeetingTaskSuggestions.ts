import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { toast } from 'sonner';
import { stripClaapTimestamps } from '@/types/claap';
import { parseClaapActionItemText } from '@/lib/claap-format';

export type SuggestionStatus = 'pending' | 'approved' | 'dismissed' | 'converted';
export type SuggestionSource = 'claap' | 'synthesized';

/**
 * Thrown by approve() when a suggestion has no resolved internal
 * assignee. Callers must either pre-gate the UI or catch and surface
 * a "choose an assignee first" message — no task row is ever created
 * unassigned.
 */
export class MissingAssigneeError extends Error {
  constructor(public readonly suggestionId: string) {
    super('Suggestion has no assignee — choose one before creating a task.');
    this.name = 'MissingAssigneeError';
  }
}

export interface RawActionItem {
  text: string;
  assignee_name: string | null;
  assignee_email: string | null;
  due_date: string | null; // YYYY-MM-DD
}

export interface MeetingTaskSuggestion {
  id: string | null;            // row id once persisted
  suggestion_id: string;        // stable hash
  text: string;
  assignee_name: string | null;
  assignee_email: string | null;
  /** Resolved internal tenant user (company_member). Null when the
   *  mention is an external contact or no unique internal match. */
  assignee_user_id: string | null;
  /** Raw external @mention preserved for context when no internal match. */
  external_mention: string | null;
  /** How the assignee was resolved: by mention, by deal-manager fallback,
   *  by manual user pick, or unassigned. Drives the UI chip styling. */
  assignment_source: 'mention' | 'deal-manager' | 'manual' | 'viewer' | null;
  due_date: string | null;
  status: SuggestionStatus;
  created_task_id: string | null;
  source: SuggestionSource;
}

export interface UseMeetingTaskSuggestionsInput {
  eventId: string;
  meetingRowId: string | null;
  recordingRowId: string | null;
  source: SuggestionSource | 'none';
  /** Action item strings rendered to the textarea (for synthesized fallback). */
  fallbackActionItems?: string[];
}

const SLUG_RE = /[^a-z0-9]+/g;
function slug(s: string): string {
  return (s || '').toLowerCase().replace(SLUG_RE, '-').replace(/^-|-$/g, '').slice(0, 60);
}
function suggestionIdFor(scopeKey: string, index: number, text: string): string {
  return `${scopeKey}#${index}#${slug(text)}`;
}

function parseDueDate(input: unknown): string | null {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  // Accept YYYY-MM-DD as-is, otherwise try Date parsing.
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function normalizeAssignee(input: unknown): string | null {
  if (!input || typeof input !== 'string') return null;
  const t = input.trim();
  return t || null;
}

function normalizeRawItems(items: unknown): RawActionItem[] {
  if (!Array.isArray(items)) return [];
  const out: RawActionItem[] = [];
  for (const it of items) {
    if (it == null) continue;
    if (typeof it === 'string') {
      const parsed = parseClaapActionItemText(stripClaapTimestamps(it));
      if (parsed.text) {
        out.push({
          text: parsed.text,
          assignee_name: parsed.assigneeName ?? null,
          assignee_email: null,
          due_date: null,
        });
      }
      continue;
    }
    if (typeof it !== 'object') continue;
    const rec = it as Record<string, unknown>;
    const rawText =
      (typeof rec.text === 'string' && rec.text) ||
      (typeof rec.content === 'string' && rec.content) ||
      (typeof rec.description === 'string' && rec.description) ||
      null;
    if (!rawText) continue;
    const parsed = parseClaapActionItemText(stripClaapTimestamps(rawText));
    if (!parsed.text) continue;
    const existingAssignee = normalizeAssignee(rec.assignee ?? rec.owner ?? rec.assignee_email);
    out.push({
      text: parsed.text,
      assignee_name: parsed.assigneeName ?? existingAssignee ?? null,
      assignee_email: existingAssignee && existingAssignee.includes('@') ? existingAssignee : null,
      due_date: parseDueDate(rec.due ?? rec.deadline ?? rec.dueDate ?? rec.due_date),
    });
  }
  return out;
}

const qk = (eventId: string, meetingRowId: string | null) => ['meeting-task-suggestions', eventId, meetingRowId];

function nameTokens(s: string): string[] {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

export interface InternalMember {
  user_id: string;
  email: string | null;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
}

/**
 * Match an external mention (name or email) to a single internal tenant
 * user. Returns null on no match or on ambiguous tie. Never falls back
 * to external contacts.
 */
export function resolveInternalAssignee(
  mention: string | null | undefined,
  members: InternalMember[],
): InternalMember | null {
  if (!mention) return null;
  const raw = String(mention).trim();
  if (!raw) return null;

  if (raw.includes('@')) {
    const lower = raw.toLowerCase();
    const byEmail = members.filter((m) => (m.email || '').toLowerCase() === lower);
    return byEmail.length === 1 ? byEmail[0] : null;
  }

  const tokens = nameTokens(raw);
  if (tokens.length === 0) return null;

  const scored = members
    .map((m) => {
      const memberTokens = new Set([
        ...nameTokens(m.display_name || ''),
        ...nameTokens(m.first_name || ''),
        ...nameTokens(m.last_name || ''),
      ]);
      const overlap = tokens.filter((t) => memberTokens.has(t)).length;
      return { m, overlap };
    })
    .filter((x) => x.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap);

  if (scored.length === 0) return null;
  if (scored.length > 1 && scored[0].overlap === scored[1].overlap) return null;
  return scored[0].m;
}

/**
 * Pure resolver: prefer the internal user matched from the @mention; if
 * none, fall back to the linked deal's manager (must be an internal
 * tenant member). Returns null when neither is available.
 */
export function resolveAssigneeWithDealManagerFallback(
  mention: string | null | undefined,
  members: InternalMember[],
  dealManager: InternalMember | null,
): { member: InternalMember | null; source: 'mention' | 'deal-manager' | null } {
  const resolved = resolveInternalAssignee(mention, members);
  if (resolved) return { member: resolved, source: 'mention' };
  if (dealManager) return { member: dealManager, source: 'deal-manager' };
  return { member: null, source: null };
}

export function useMeetingTaskSuggestions(input: UseMeetingTaskSuggestionsInput) {
  const { user } = useAuth();
  const { company } = useCompany();
  const queryClient = useQueryClient();
  const { eventId, meetingRowId, recordingRowId, source, fallbackActionItems } = input;

  const scopeKey = meetingRowId ? `meeting:${meetingRowId}` : `event:${eventId}`;

  // Internal tenant members (company_members ∩ profiles). Gates assignee
  // resolution — external contact names are never auto-assigned.
  const membersQuery = useQuery({
    queryKey: ['internal-members', company?.id],
    enabled: !!company?.id,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<InternalMember[]> => {
      const { data: cm } = await supabase
        .from('company_members')
        .select('user_id')
        .eq('company_id', company!.id);
      if (!cm?.length) return [];
      const userIds = cm.map((r) => r.user_id);
      const { data: profs } = await supabase
        .from('profiles')
        .select('user_id, email, first_name, last_name, display_name')
        .in('user_id', userIds);
      return (profs || []).map((p) => ({
        user_id: p.user_id,
        email: p.email,
        first_name: p.first_name,
        last_name: p.last_name,
        display_name:
          p.display_name ||
          [p.first_name, p.last_name].filter(Boolean).join(' ') ||
          p.email ||
          'Member',
      }));
    },
  });
  const internalMembers = membersQuery.data ?? [];

  // Resolve the linked deal's manager to an internal tenant user.
  // Used as the fallback assignee when a task @mention does not match an
  // internal team member. Manager is stored as a text display name on
  // public.deals, so we map name -> profile -> verify company_member.
  const dealManagerQuery = useQuery({
    queryKey: ['mts-deal-manager', meetingRowId, company?.id, internalMembers.length],
    enabled: !!meetingRowId && !!company?.id && internalMembers.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<InternalMember | null> => {
      const { data: meeting } = await supabase
        .from('claap_meetings')
        .select('deal_id')
        .eq('id', meetingRowId!)
        .maybeSingle();
      const dealId = (meeting as { deal_id?: string | null } | null)?.deal_id;
      if (!dealId) return null;
      const { data: deal } = await supabase
        .from('deals')
        .select('manager')
        .eq('id', dealId)
        .maybeSingle();
      const managerName = (deal as { manager?: string | null } | null)?.manager;
      if (!managerName || !managerName.trim()) return null;
      // Re-use the same internal resolver so behavior is consistent
      // (must match a unique internal company_member).
      return resolveInternalAssignee(managerName, internalMembers);
    },
  });
  const dealManager = dealManagerQuery.data ?? null;

  // 1) Load raw items from canonical sources.
  const rawQuery = useQuery({
    queryKey: ['mts-raw', recordingRowId, meetingRowId, source, eventId],
    enabled: !!eventId && !!company?.id && source === 'claap' && !!recordingRowId,
    staleTime: 60_000,
    queryFn: async (): Promise<RawActionItem[]> => {
      // Claap path: read raw structured action_items from claap_recordings.
      if (source === 'claap' && recordingRowId) {
        const { data, error } = await supabase
          .from('claap_recordings')
          .select('action_items')
          .eq('id', recordingRowId)
          .maybeSingle();
        if (error) throw error;
        return normalizeRawItems(data?.action_items);
      }
      // No synthesized / fallback path — only render suggestions backed by a
      // real Claap recording with parsed action items.
      return [];
    },
  });

  const rawItems = rawQuery.data ?? [];

  // 2) Load persisted suggestions for this scope.
  const persistedQuery = useQuery({
    queryKey: qk(eventId, meetingRowId),
    enabled: !!eventId && !!company?.id,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meeting_task_suggestions')
        .select('id, suggestion_id, text, assignee_email, external_mention, due_date, status, created_task_id, source')
        .eq('scope_key', scopeKey);
      if (error) throw error;
      return data ?? [];
    },
  });

  // 3) Upsert new pending rows for any raw items we haven't seen yet.
  useEffect(() => {
    if (!company?.id || !user?.id) return;
    if (rawQuery.isLoading || persistedQuery.isLoading) return;
    if (rawItems.length === 0) return;
    const persisted = persistedQuery.data ?? [];
    const knownIds = new Set(persisted.map((r) => r.suggestion_id));

    const toInsert = rawItems
      .map((it, idx) => {
        const mention = it.assignee_name || it.assignee_email || null;
        const resolved = resolveInternalAssignee(mention, internalMembers);
        return {
          org_company_id: company.id,
          scope_key: scopeKey,
          meeting_id: meetingRowId,
          event_id: eventId,
          recording_id: source === 'claap' ? recordingRowId : null,
          suggestion_id: suggestionIdFor(scopeKey, idx, it.text),
          text: it.text,
          // Persist the resolved internal email when we matched a mention;
          // otherwise fall back to the linked deal's manager. The render-
          // time resolver re-derives this anyway, but persisting it keeps
          // downstream consumers (e.g. SQL exports) consistent.
          assignee_email: resolved
            ? resolved.email
            : (dealManager ? dealManager.email : null),
          external_mention: resolved ? null : mention,
          due_date: it.due_date,
          source: source === 'synthesized' ? 'synthesized' : 'claap',
        };
      })
      .filter((row) => !knownIds.has(row.suggestion_id));

    if (toInsert.length === 0) return;

    void supabase
      .from('meeting_task_suggestions')
      .insert(toInsert)
      .then(({ error }) => {
        if (error) {
          // Unique-violation across concurrent renders is expected; ignore.
          if (!String(error.message || '').includes('duplicate')) {
            console.warn('[meeting-task-suggestions] insert failed', error);
          }
        }
        queryClient.invalidateQueries({ queryKey: qk(eventId, meetingRowId) });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.id, user?.id, rawItems.length, persistedQuery.data?.length, scopeKey, source, internalMembers.length, dealManager?.user_id]);

  // 4) Merge raw + persisted into the public list, preserving raw order.
  const suggestions: MeetingTaskSuggestion[] = useMemo(() => {
    const persisted = persistedQuery.data ?? [];
    const byId = new Map(persisted.map((r) => [r.suggestion_id, r]));
    const viewer: InternalMember | null = user?.id
      ? internalMembers.find((m) => m.user_id === user.id) ?? null
      : null;
    return rawItems.map((it, idx) => {
      const sid = suggestionIdFor(scopeKey, idx, it.text);
      const row = byId.get(sid);
      // Render-time fallback: historic rows may have stored the unsanitized
      // markdown (e.g. "**James Turner**: send NDA..."). Re-parse so display
      // is clean even before backfill lands.
      const persistedText = row?.text ?? null;
      const reparsed = persistedText ? parseClaapActionItemText(persistedText) : null;
      const displayText = reparsed?.text || it.text;
      const displayAssignee = reparsed?.assigneeName || it.assignee_name;
      const mention = displayAssignee || it.assignee_email || (row as any)?.external_mention || null;
      const resolved = resolveInternalAssignee(mention, internalMembers);
      // Manual override: if the persisted row has an assignee_email that
      // matches an internal member, treat that as the canonical assignee
      // (covers picks made via the Unassigned chip / bulk-assign picker).
      const persistedEmail = ((row as any)?.assignee_email as string | null) || null;
      // Only treat the persisted email as an assignment if it resolves to
      // a known internal tenant member. External emails (e.g. an outside
      // attendee like neilb@dnbadvisory.com) must never appear as the
      // assignee — they fall through to the deal-manager / viewer fallback.
      const manualMember = persistedEmail
        ? internalMembers.find(
            (m) => (m.email || '').toLowerCase() === persistedEmail.toLowerCase(),
          ) ?? null
        : null;
      // Fallback chain: manual pick > mention resolution > linked deal
      // manager > current viewer. External mention text is preserved as
      // muted context unless the mention itself resolved to an internal
      // member. Falling back to the viewer guarantees the row is never
      // un-actionable: the signed-in user can always Approve and the task
      // is auto-assigned to them, just like the "Assign to me" picker.
      const effective = manualMember ?? resolved ?? dealManager ?? viewer;
      const assignmentSource: 'mention' | 'deal-manager' | 'manual' | null = manualMember
        ? (resolved && resolved.user_id === manualMember.user_id ? 'mention' : 'manual')
        : resolved
          ? 'mention'
          : dealManager
            ? 'deal-manager'
            : viewer
              ? 'viewer'
              : null;
      return {
        id: row?.id ?? null,
        suggestion_id: sid,
        text: displayText,
        assignee_name: effective ? effective.display_name : null,
        assignee_email: effective ? effective.email : null,
        assignee_user_id: effective ? effective.user_id : null,
        external_mention: resolved ? null : (mention || null),
        assignment_source: assignmentSource as MeetingTaskSuggestion['assignment_source'],
        due_date: row?.due_date ?? it.due_date,
        status: ((row?.status as SuggestionStatus | undefined) ?? 'pending'),
        created_task_id: row?.created_task_id ?? null,
        source: ((row?.source as SuggestionSource | undefined) ?? (source === 'synthesized' ? 'synthesized' : 'claap')),
      };
    });
  }, [rawItems, persistedQuery.data, scopeKey, source, internalMembers, dealManager, user?.id]);

  const approve = async (s: MeetingTaskSuggestion): Promise<{ taskId: string } | null> => {
    if (!user?.id) {
      toast.error('You must be signed in to create a task');
      return null;
    }
    // 1) Gate: require an internal assignee. Defense-in-depth so the
    //    tasks insert path never produces an unassigned task. We throw a
    //    typed error so any direct caller (not just the UI button) is
    //    forced to handle it; the UI catches and shows an inline toast.
    if (!s.assignee_user_id) {
      throw new MissingAssigneeError(s.suggestion_id);
    }
    const assignedTo = s.assignee_user_id;
    const assigneeEmail = s.assignee_email;

    // Optional recording url footer for description.
    let recordingUrl: string | null = null;
    if (source === 'claap' && recordingRowId) {
      const { data } = await supabase
        .from('claap_recordings')
        .select('recording_url, url:external_id')
        .eq('id', recordingRowId)
        .maybeSingle();
      recordingUrl = (data as any)?.recording_url ?? null;
    }
    const descParts: string[] = [];
    if (s.external_mention) descParts.push(`Mentioned: ${s.external_mention}`);
    descParts.push(
      recordingUrl
        ? `From Claap recording — [Watch](${recordingUrl})`
        : 'From Claap recording',
    );

    const dueAtIso = s.due_date ? new Date(`${s.due_date}T17:00:00Z`).toISOString() : null;
    const { data: taskRow, error: taskErr } = await supabase
      .from('tasks')
      .insert({
        title: s.text,
        assigned_to: assignedTo,
        assigned_by: user.id,
        created_by: user.id,
        status: 'not_started',
        task_type: 'task',
        due_at: dueAtIso,
        due_date: s.due_date,
        description: descParts.join('\n\n'),
        tags: ['claap-suggestion'],
      })
      .select('id')
      .single();
    if (taskErr || !taskRow) {
      toast.error(taskErr?.message || 'Failed to create task');
      return null;
    }
    // 2) Upsert the suggestion row so it persists as 'converted'.
    const baseRow = {
      org_company_id: company!.id,
      scope_key: scopeKey,
      meeting_id: meetingRowId,
      event_id: eventId,
      recording_id: source === 'claap' ? recordingRowId : null,
      suggestion_id: s.suggestion_id,
      text: s.text,
      assignee_email: assigneeEmail,
      external_mention: s.external_mention,
      due_date: s.due_date,
      source: s.source,
      status: 'converted' as SuggestionStatus,
      created_task_id: taskRow.id,
      decided_at: new Date().toISOString(),
      decided_by: user.id,
    };
    const { error: upErr } = await supabase
      .from('meeting_task_suggestions')
      .upsert(baseRow, { onConflict: 'scope_key,suggestion_id' });
    if (upErr) console.warn('[meeting-task-suggestions] upsert on approve failed', upErr);
    queryClient.invalidateQueries({ queryKey: qk(eventId, meetingRowId) });
    queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
    return { taskId: taskRow.id };
  };

  const approveAll = async (subset?: MeetingTaskSuggestion[]): Promise<number> => {
    const pool = (subset ?? suggestions).filter((s) => s.status === 'pending');
    // Gate: refuse the whole batch if any row has no assignee. The UI
    // already disables the button in this case; this is defense in depth.
    if (pool.some((s) => !s.assignee_user_id)) {
      toast.error('One or more selected tasks have no assignee. Choose assignees first.');
      return 0;
    }
    let count = 0;
    for (const s of pool) {
      try {
        const res = await approve(s);
        if (res) count++;
      } catch (err) {
        if (err instanceof MissingAssigneeError) continue;
        throw err;
      }
    }
    if (count > 0) toast.success(`Created ${count} task${count === 1 ? '' : 's'}`);
    return count;
  };

  /**
   * Manually assign an internal member to a suggestion (from the
   * Unassigned chip picker or the bulk-assign flow). Persists the pick
   * to the suggestion row via assignee_email; the render-time resolver
   * picks it up as a 'manual' assignment.
   */
  const assignManually = async (
    s: MeetingTaskSuggestion,
    member: InternalMember,
  ): Promise<boolean> => {
    if (!user?.id || !company?.id) return false;
    const row = {
      org_company_id: company.id,
      scope_key: scopeKey,
      meeting_id: meetingRowId,
      event_id: eventId,
      recording_id: source === 'claap' ? recordingRowId : null,
      suggestion_id: s.suggestion_id,
      text: s.text,
      assignee_email: member.email,
      external_mention: s.external_mention,
      due_date: s.due_date,
      source: s.source,
      status: s.status,
      created_task_id: s.created_task_id,
    };
    const { error } = await supabase
      .from('meeting_task_suggestions')
      .upsert(row, { onConflict: 'scope_key,suggestion_id' });
    if (error) {
      toast.error('Failed to assign');
      return false;
    }
    queryClient.invalidateQueries({ queryKey: qk(eventId, meetingRowId) });
    return true;
  };

  const bulkAssignUnassigned = async (
    subset: MeetingTaskSuggestion[],
    member: InternalMember,
  ): Promise<number> => {
    const targets = subset.filter((s) => s.status === 'pending' && !s.assignee_user_id);
    let n = 0;
    for (const s of targets) {
      const ok = await assignManually(s, member);
      if (ok) n++;
    }
    if (n > 0) toast.success(`Assigned ${n} task${n === 1 ? '' : 's'} to ${member.display_name}`);
    return n;
  };

  const dismiss = async (s: MeetingTaskSuggestion) => {
    if (!user?.id || !company?.id) return;
    const row = {
      org_company_id: company.id,
      scope_key: scopeKey,
      meeting_id: meetingRowId,
      event_id: eventId,
      recording_id: source === 'claap' ? recordingRowId : null,
      suggestion_id: s.suggestion_id,
      text: s.text,
      assignee_email: s.assignee_email,
      due_date: s.due_date,
      source: s.source,
      status: 'dismissed' as SuggestionStatus,
      decided_at: new Date().toISOString(),
      decided_by: user.id,
    };
    const { error } = await supabase
      .from('meeting_task_suggestions')
      .upsert(row, { onConflict: 'scope_key,suggestion_id' });
    if (error) {
      toast.error('Failed to dismiss');
      return;
    }
    queryClient.invalidateQueries({ queryKey: qk(eventId, meetingRowId) });
  };

  const dismissAll = async () => {
    const pending = suggestions.filter((s) => s.status === 'pending');
    for (const s of pending) await dismiss(s);
  };

  const undo = async (s: MeetingTaskSuggestion) => {
    if (!user?.id || !company?.id) return;
    // If a task was created, delete it.
    if (s.created_task_id) {
      await supabase.from('tasks').delete().eq('id', s.created_task_id);
    }
    const row = {
      org_company_id: company.id,
      scope_key: scopeKey,
      meeting_id: meetingRowId,
      event_id: eventId,
      recording_id: source === 'claap' ? recordingRowId : null,
      suggestion_id: s.suggestion_id,
      text: s.text,
      assignee_email: s.assignee_email,
      due_date: s.due_date,
      source: s.source,
      status: 'pending' as SuggestionStatus,
      created_task_id: null,
      decided_at: null,
      decided_by: null,
    };
    const { error } = await supabase
      .from('meeting_task_suggestions')
      .upsert(row, { onConflict: 'scope_key,suggestion_id' });
    if (error) {
      toast.error('Undo failed');
      return;
    }
    queryClient.invalidateQueries({ queryKey: qk(eventId, meetingRowId) });
    queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
  };

  return {
    suggestions,
    isLoading: rawQuery.isLoading || persistedQuery.isLoading,
    pendingCount: suggestions.filter((s) => s.status === 'pending').length,
    internalMembers,
    approve,
    approveAll,
    assignManually,
    bulkAssignUnassigned,
    dismiss,
    dismissAll,
    undo,
  };
}