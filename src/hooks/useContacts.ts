import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { toast } from 'sonner';
import type { FilterRule, MatchMode } from '@/lib/filterTypes';
import { applyFiltersToQuery } from '@/lib/filterUtils';

export interface Contact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string | null;
  additional_emails: string[];
  phone_work: string | null;
  phone_mobile: string | null;
  phone_other: string | null;
  job_title: string | null;
  department: string | null;
  seniority: string | null;
  timezone: string | null;
  locale: string | null;
  lifecycle_stage: string;
  status: string;
  buying_role: string | null;
  contact_score: number;
  behavioral_score: number;
  fit_score: number;
  owner_user_id: string | null;
  sdr_owner_id: string | null;
  ae_owner_id: string | null;
  primary_company_id: string | null;
  lead_source: string | null;
  lead_source_original: string | null;
  lead_source_latest: string | null;
  campaign: string | null;
  last_activity_date: string | null;
  last_outbound_touch_date: string | null;
  last_inbound_activity_date: string | null;
  next_activity_date: string | null;
  preferred_channel: string | null;
  email_opt_in: boolean;
  phone_opt_in: boolean;
  sms_opt_in: boolean;
  linkedin_url: string | null;
  website_url: string | null;
  contact_type: string | null;
  description: string | null;
  hubspot_contact_id: string | null;
  source_system: string | null;
  migrated_from_hubspot: boolean;
  synced_with_hubspot: boolean;
  custom_fields: Record<string, any>;
  tags: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
  org_company_id: string | null;
  // Dynamic HubSpot columns
  [key: string]: any;
  // Joined
  primary_company?: { id: string; name: string; industry: string | null } | null;
  sdr_owner?: { display_name: string | null; avatar_url: string | null } | null;
  ae_owner?: { display_name: string | null; avatar_url: string | null } | null;
}

const LIST_COLUMNS = 'id, first_name, last_name, full_name, email, phone_work, phone_mobile, job_title, contact_type, linkedin_url, lifecycle_stage, status, contact_score, primary_company_id, lead_source, last_activity_date, last_contact_at, created_at, updated_at, hubspot_contact_id, synced_with_hubspot, crm_company_id, owner_user_id, hs_city, hs_state, hs_industry, hs_contact_status, hs_contact_type, hs_company_name, hs_notes_last_contacted, hs_hs_email_optout, email_domain_normalized, crm_company:crm_companies!crm_company_id(id, name)';

export interface ContactsListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  lifecycleStage?: string;
  status?: string;
  quickFilter?: string;
  advancedFilters?: FilterRule[];
  matchMode?: MatchMode;
  enabled?: boolean;
}

export interface PaginatedResult<T> {
  data: T[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function useContacts(params: ContactsListParams = {}) {
  const { company } = useCompany();
  const { page = 0, pageSize = 50, search, lifecycleStage, status, quickFilter, advancedFilters = [], matchMode = 'all', enabled = true } = params;
  const hasSearch = !!search?.trim();
  const canUseFastSearch = hasSearch
    && advancedFilters.length === 0
    && (!quickFilter || quickFilter === 'all')
    && (!lifecycleStage || lifecycleStage === 'all')
    && (!status || status === 'all');

  return useQuery<PaginatedResult<Contact>>({
    queryKey: ['contacts', company?.id, page, pageSize, search, lifecycleStage, status, quickFilter, advancedFilters, matchMode],
    queryFn: async ({ signal }) => {
      if (canUseFastSearch) {
        const { data, error } = await (supabase.rpc as any)('search_contacts_fast', {
          _search: search!.trim(),
          _limit: pageSize,
          _offset: page * pageSize,
        }).abortSignal(signal);

        if (error) throw error;

        const mapped = ((data || []) as any[]).map(({ crm_company_name, ...contact }) => ({
          ...contact,
          crm_company: contact.crm_company_id && crm_company_name
            ? { id: contact.crm_company_id, name: crm_company_name, industry: null }
            : null,
        })) as Contact[];

        return {
          data: mapped,
          totalCount: mapped.length,
          page,
          pageSize,
          totalPages: 1,
        };
      }

      // Use the planner's row-count estimate instead of an exact COUNT(*).
      // PostgREST's default 'exact' (and 'estimated' when the planner row
      // estimate is below 1000) runs the filtered query a second time
      // without LIMIT just to produce a total — that's what made large
      // ILIKE searches feel slow. 'planned' returns the planner estimate
      // directly, which is effectively free.
      let query = supabase
        .from('contacts')
        .select(LIST_COLUMNS, { count: hasSearch ? undefined : 'planned' })
        .eq('org_company_id', company!.id);

      // Server-side search
      if (search?.trim()) {
        const s = search.trim();
        const parts = s.split(/\s+/).filter(Boolean);
        let ors: string[] = [
          `full_name.ilike.%${s}%`,
          `first_name.ilike.%${s}%`,
          `last_name.ilike.%${s}%`,
          `email.ilike.%${s}%`,
          `job_title.ilike.%${s}%`,
        ];
        // Keep multi-word searches precise so "Mike Ferraro" is not buried behind every Mike or Ferraro.
        if (parts.length >= 2) {
          ors = [
            `full_name.ilike.%${s}%`,
            `email.ilike.%${s}%`,
            `and(first_name.ilike.%${parts[0]}%,last_name.ilike.%${parts[parts.length - 1]}%)`,
          ];
        }
        query = query.or(ors.join(','));
      }

      // Server-side filters
      if (lifecycleStage && lifecycleStage !== 'all') {
        query = query.eq('lifecycle_stage', lifecycleStage as any);
      }
      if (status && status !== 'all') {
        query = query.eq('status', status as any);
      }

      // Quick filters (tab filters from the page)
      if (quickFilter && quickFilter !== 'all') {
        switch (quickFilter) {
          case 'new_leads':
            query = query.eq('status', 'new');
            break;
          case 'meeting_scheduled':
            query = query.eq('status', 'meeting_scheduled');
            break;
          case 'high_score':
            query = query.gte('contact_score', 70);
            break;
          case 'no_activity_7d': {
            const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
            query = query.or(`last_activity_date.is.null,last_activity_date.lt.${sevenDaysAgo}`);
            break;
          }
          case 'no_email':
            query = query.or('email.is.null,email.eq.');
            break;
          case 'no_company':
            query = query.is('crm_company_id', null);
            break;
          case 'missing_name':
            query = query.or(
              'first_name.is.null,first_name.eq.,last_name.is.null,last_name.eq.',
            );
            break;
        }
      }

      // Advanced filters
      if (advancedFilters.length > 0) {
        query = applyFiltersToQuery(query, advancedFilters, matchMode);
      }

      const from = page * pageSize;
      const to = from + pageSize - 1;

      const { data, error, count } = await query
        .order('updated_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .range(from, to)
        .abortSignal(signal);

      if (error) throw error;
      const totalCount = hasSearch ? (data?.length ?? 0) : (count ?? 0);
      return {
        data: (data || []) as unknown as Contact[],
        totalCount,
        page,
        pageSize,
        totalPages: hasSearch ? 1 : Math.ceil(totalCount / pageSize),
      };
    },
    enabled: !!company?.id && enabled,
    placeholderData: (prev) => prev,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });
}

export function useContact(contactId: string | undefined) {
  return useQuery({
    queryKey: ['contact', contactId],
    queryFn: async () => {
      if (!contactId) return null;
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .eq('id', contactId)
        .single();

      if (error) throw error;
      return data as Contact;
    },
    enabled: !!contactId,
  });
}

export function useCreateContact() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { company } = useCompany();

  return useMutation({
    mutationFn: async (contact: Partial<Contact>) => {
      const { data, error } = await supabase
        .from('contacts')
        .insert({
          ...contact,
          created_by: user?.id,
          org_company_id: company?.id,
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      toast.success('Contact created');
      // Fire-and-forget: kick off AI enrichment scan against recent activity.
      if (data?.id) {
        supabase.functions
          .invoke('field-suggestion-engine', {
            body: {
              contact_id: data.id,
              source_type: 'new_contact_enrichment',
              company_id: data.org_company_id,
            },
          })
          .then(() => queryClient.invalidateQueries({ queryKey: ['field-suggestions'] }))
          .catch((e) => console.warn('[contact enrichment] failed', e));
      }
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to create contact');
    },
  });
}

export function useUpdateContact() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Contact> & { id: string }) => {
      const { data, error } = await supabase
        .from('contacts')
        .update({ ...updates, last_modified_by: user?.id } as any)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['contact', vars.id] });
      toast.success('Contact updated');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to update contact');
    },
  });
}

export function useDeleteContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('contacts').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      toast.success('Contact deleted');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to delete contact');
    },
  });
}

export function useContactActivities(contactId: string | undefined) {
  return useQuery({
    queryKey: ['contact-activities', contactId],
    queryFn: async () => {
      if (!contactId) return [];
      // Load logged activities + the contact's email addresses in parallel.
      const [actRes, ctcRes] = await Promise.all([
        supabase
          .from('contact_activities')
          .select('*')
          .eq('contact_id', contactId)
          .order('occurred_at', { ascending: false }),
        supabase
          .from('contacts')
          .select('email, additional_emails')
          .eq('id', contactId)
          .maybeSingle(),
      ]);
      if (actRes.error) throw actRes.error;
      const activities = actRes.data || [];

      // Merge in emails to/from any address associated with the contact.
      const emails = new Set<string>();
      const c: any = ctcRes.data;
      if (c?.email) emails.add(String(c.email).toLowerCase());
      if (Array.isArray(c?.additional_emails)) {
        for (const e of c.additional_emails) if (e) emails.add(String(e).toLowerCase());
      }

      let emailActivities: any[] = [];
      // Skip emails already tagged as activities in the DB (from back-fill or prior tagging).
      const taggedMsgIds = new Set<string>(
        activities
          .map((a: any) => a?.metadata?.gmail_message_id)
          .filter((x: any): x is string => typeof x === 'string' && x.length > 0),
      );
      if (emails.size > 0) {
        const list = Array.from(emails);
        const inList = list.map((e) => `"${e}"`).join(',');
        const arrList = `{${list.join(',')}}`;
        const { data: msgs } = await supabase
          .from('email_cache')
          .select('gmail_message_id, thread_id, subject, snippet, from_email, from_name, to_emails, cc_emails, received_at')
          .or(`from_email.in.(${inList}),to_emails.ov.${arrList},cc_emails.ov.${arrList}`)
          .order('received_at', { ascending: false, nullsFirst: false })
          .limit(300);
        emailActivities = (msgs || [])
          .filter((m: any) => !taggedMsgIds.has(m.gmail_message_id))
          .map((m: any) => {
          const fromLc = String(m.from_email || '').toLowerCase();
          const isInbound = emails.has(fromLc);
          return {
            id: `email:${m.gmail_message_id}`,
            contact_id: contactId,
            activity_type: 'email',
            subject: m.subject || '(no subject)',
            body: m.snippet || '',
            occurred_at: m.received_at,
            created_at: m.received_at,
            source: 'email_cache',
            metadata: {
              gmail_message_id: m.gmail_message_id,
              thread_id: m.thread_id,
              direction: isInbound ? 'inbound' : 'outbound',
              from: m.from_name || m.from_email,
              to: m.to_emails || [],
            },
            __readOnly: true,
          };
        });
      }

      const merged = [...activities, ...emailActivities];

      // Claap recordings where this contact's email is tagged as an attendee.
      let claapActivities: any[] = [];
      if (emails.size > 0) {
        const list = Array.from(emails);
        const { data: participants } = await supabase
          .from('claap_meeting_participants')
          .select('meeting_id, email')
          .in('email', list);
        const meetingIds = Array.from(new Set((participants || []).map((p: any) => p.meeting_id).filter(Boolean)));
        if (meetingIds.length > 0) {
          const { data: meetings } = await supabase
            .from('claap_meetings')
            .select('id, title, started_at, created_at, duration_seconds, recording_url, call_type, ai_summary, deal_id, claap_meeting_participants(name, email, is_internal)')
            .in('id', meetingIds)
            .order('started_at', { ascending: false });
          claapActivities = (meetings || []).map((m: any) => {
            const attendees = (m.claap_meeting_participants || [])
              .map((p: any) => p.name || p.email)
              .filter(Boolean);
            return {
              id: `claap:${m.id}`,
              contact_id: contactId,
              activity_type: 'claap_call',
              subject: m.title || 'Call recording',
              body: m.ai_summary || (attendees.length ? `Attendees: ${attendees.join(', ')}` : ''),
              occurred_at: m.started_at || m.created_at,
              created_at: m.started_at || m.created_at,
              source: 'claap',
              metadata: {
                claap_meeting_id: m.id,
                recording_url: m.recording_url,
                duration_seconds: m.duration_seconds,
                call_type: m.call_type,
                deal_id: m.deal_id,
                attendees: (m.claap_meeting_participants || []).map((p: any) => ({
                  name: p.name, email: p.email, is_internal: p.is_internal,
                })),
              },
              __readOnly: true,
            };
          });
        }
      }

      // Calendar-invite meetings where this contact is an attendee/organizer,
      // even when no Claap recording exists.
      // Claap recordings auto-linked to this contact via the meeting guest list.
      let claapRecordingActivities: any[] = [];
      {
        const { data: links } = await supabase
          .from('claap_recording_links')
          .select('recording_id')
          .eq('entity_type', 'contact')
          .eq('entity_id', contactId);
        const recIds = Array.from(new Set((links || []).map((l: any) => l.recording_id).filter(Boolean)));
        if (recIds.length > 0) {
          const { data: recs } = await supabase
            .from('claap_recordings')
            .select('id, title, started_at, ended_at, created_at, recording_url, transcript_url, summary, participants')
            .in('id', recIds)
            .order('started_at', { ascending: false });
          claapRecordingActivities = (recs || []).map((r: any) => {
            const parts = Array.isArray(r.participants) ? r.participants : [];
            const names = parts.map((p: any) => p?.name || p?.email).filter(Boolean);
            const durationSeconds =
              r.started_at && r.ended_at
                ? Math.max(0, Math.round((new Date(r.ended_at).getTime() - new Date(r.started_at).getTime()) / 1000))
                : undefined;
            return {
              id: `claaprec:${r.id}`,
              contact_id: contactId,
              activity_type: 'claap_call',
              subject: r.title || 'Call recording',
              body: r.summary || (names.length ? `Attendees: ${names.join(', ')}` : ''),
              occurred_at: r.started_at || r.created_at,
              created_at: r.started_at || r.created_at,
              source: 'claap',
              metadata: {
                claap_recording_id: r.id,
                recording_url: r.recording_url,
                transcript_url: r.transcript_url,
                duration_seconds: durationSeconds,
                attendees: parts.map((p: any) => ({ name: p?.name, email: p?.email })),
              },
              __readOnly: true,
            };
          });
          // Drop recordings that duplicate a Claap meeting already in the feed (±30 min).
          const meetingTimes = claapActivities
            .map((a: any) => new Date(a.occurred_at || 0).getTime())
            .filter((t) => Number.isFinite(t) && t > 0);
          claapRecordingActivities = claapRecordingActivities.filter((a: any) => {
            const t = new Date(a.occurred_at || 0).getTime();
            if (!Number.isFinite(t) || t <= 0) return true;
            return !meetingTimes.some((mt) => Math.abs(mt - t) < 30 * 60 * 1000);
          });
        }
      }

      let calendarActivities: any[] = [];
      if (emails.size > 0) {
        const list = Array.from(emails);
        const arrList = `{${list.join(',')}}`;
        const inList = list.map((e) => `"${e}"`).join(',');
        const { data: events } = await supabase
          .from('calendar_events')
          .select('id, event_id, title, start_time, end_time, attendees, organizer_email, location, meeting_url, is_cancelled')
          .or(`attendees.ov.${arrList},organizer_email.in.(${inList})`)
          .order('start_time', { ascending: false })
          .limit(200);

        // Dedupe against Claap meetings covering the same slot (±30 min).
        const claapTimes = [...claapActivities, ...claapRecordingActivities]
          .map((a: any) => new Date(a.occurred_at || 0).getTime())
          .filter((t) => Number.isFinite(t) && t > 0);
        const seenEventIds = new Set<string>();

        calendarActivities = (events || [])
          .filter((e: any) => !e.is_cancelled && e.start_time)
          .filter((e: any) => {
            const key = e.event_id || e.id;
            if (seenEventIds.has(key)) return false;
            seenEventIds.add(key);
            const t = new Date(e.start_time).getTime();
            return !claapTimes.some((ct) => Math.abs(ct - t) < 30 * 60 * 1000);
          })
          .map((e: any) => {
            const attendees: string[] = Array.isArray(e.attendees) ? e.attendees : [];
            const durationSeconds =
              e.end_time && e.start_time
                ? Math.max(0, Math.round((new Date(e.end_time).getTime() - new Date(e.start_time).getTime()) / 1000))
                : undefined;
            return {
              id: `cal:${e.event_id || e.id}`,
              contact_id: contactId,
              activity_type: 'meeting',
              subject: e.title || 'Meeting',
              body: attendees.length ? `Attendees: ${attendees.join(', ')}` : '',
              occurred_at: e.start_time,
              created_at: e.start_time,
              source: 'calendar',
              metadata: {
                calendar_event_id: e.event_id || e.id,
                duration_seconds: durationSeconds,
                location: e.location,
                meeting_url: e.meeting_url,
                organizer_email: e.organizer_email,
                attendees: attendees.map((email: string) => ({ email })),
              },
              __readOnly: true,
            };
          });
      }

      const all = [...merged, ...claapActivities, ...claapRecordingActivities, ...calendarActivities];
      all.sort((a: any, b: any) => {
        const at = new Date(a.occurred_at || a.created_at || 0).getTime();
        const bt = new Date(b.occurred_at || b.created_at || 0).getTime();
        return bt - at;
      });
      return all;
    },
    enabled: !!contactId,
  });
}

export function useCreateContactActivity(options: { updateCache?: boolean; returnInserted?: boolean } = {}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { updateCache = true, returnInserted = true } = options;

  return useMutation({
    mutationFn: async (activity: { contact_id: string; activity_type: string; subject?: string; body?: string; deal_id?: string; occurred_at?: string }) => {
      const query = supabase
        .from('contact_activities')
        .insert({ ...activity, logged_by: user?.id } as any);

      const { data, error } = returnInserted
        ? await query.select().single()
        : await query;

      if (error) throw error;
      return data;
    },
    onSuccess: (data, vars) => {
      if (!updateCache || !data) return;
      queryClient.setQueryData(['contact-activities', vars.contact_id], (old: any[] | undefined) => {
        const current = old || [];
        const next = [data, ...current.filter((item) => item.id !== data.id)];
        return next.sort((a, b) => {
          const aTime = new Date(a.occurred_at || a.created_at || 0).getTime();
          const bTime = new Date(b.occurred_at || b.created_at || 0).getTime();
          return bTime - aTime;
        });
      });
    },
  });
}

export function useUpdateContactActivity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; contact_id: string; subject?: string | null; body?: string | null }) => {
      const { id, contact_id, ...updates } = vars;
      const { data, error } = await supabase
        .from('contact_activities')
        .update(updates as any)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['contact-activities', vars.contact_id] });
    },
  });
}

export function useDeleteContactActivity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; contact_id: string }) => {
      const { error } = await supabase.from('contact_activities').delete().eq('id', vars.id);
      if (error) throw error;
      return vars.id;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['contact-activities', vars.contact_id] });
    },
  });
}

export function useContactDeals(contactId: string | undefined) {
  return useQuery({
    queryKey: ['contact-deals', contactId],
    queryFn: async () => {
      if (!contactId) return [];
      const { data, error } = await supabase
        .from('contact_deals')
        .select('*, deal:deals(id, company, stage, value, closing_date, status)')
        .eq('contact_id', contactId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!contactId,
  });
}

export interface ContactAuditLogEntry {
  id: string;
  contact_id: string;
  actor_user_id: string | null;
  action: 'created' | 'updated' | 'deleted';
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}

export function useContactAuditLog(contactId: string | undefined) {
  return useQuery({
    queryKey: ['contact-audit-log', contactId],
    enabled: !!contactId,
    queryFn: async (): Promise<ContactAuditLogEntry[]> => {
      if (!contactId) return [];
      const { data, error } = await (supabase as any)
        .from('contact_audit_log')
        .select('*')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data || []) as ContactAuditLogEntry[];
    },
  });
}

export const LIFECYCLE_STAGES = [
  { value: 'subscriber', label: 'Subscriber' },
  { value: 'lead', label: 'Lead' },
  { value: 'mql', label: 'MQL' },
  { value: 'sql', label: 'SQL' },
  { value: 'opportunity', label: 'Opportunity' },
  { value: 'customer', label: 'Customer' },
  { value: 'evangelist', label: 'Evangelist' },
  { value: 'other', label: 'Other' },
];

/**
 * Canonical contact status values. Single source of truth for the create-contact
 * modal, the contact detail page, the contacts table filter, and any API mapping.
 * Stored values are the lowercase snake_case `value`.
 */
export const CONTACT_STATUSES = [
  { value: 'active', label: 'Active', dot: 'bg-green-500', badge: 'bg-green-500/10 text-green-500' },
  { value: 'inactive', label: 'Inactive', dot: 'bg-blue-500', badge: 'bg-blue-500/10 text-blue-500' },
  { value: 'went_dark', label: 'Went Dark', dot: 'bg-yellow-500', badge: 'bg-yellow-500/10 text-yellow-500' },
  { value: 'do_not_contact', label: 'Do Not Contact', dot: 'bg-red-500', badge: 'bg-red-500/10 text-red-500' },
] as const;

export const DEFAULT_CONTACT_STATUS = 'active';

/** Legacy/imported status values mapped onto the canonical set. */
const LEGACY_STATUS_MAP: Record<string, string> = {
  new: 'active',
  working: 'active',
  meeting_scheduled: 'active',
  open: 'active',
  nurture: 'inactive',
  no_show: 'went_dark',
  unqualified: 'inactive',
  no_fit: 'inactive',
  bad_data: 'inactive',
  converted: 'active',
  closed: 'inactive',
  opt_out: 'do_not_contact',
  unsubscribed: 'do_not_contact',
  in_progress: 'active',
  client: 'active',
  past_client: 'inactive',
  referred: 'active',
  secondary: 'inactive',
  future_need: 'inactive',
  no_current_need: 'inactive',
  bad_timing: 'inactive',
  closed_won: 'active',
  closed_lost: 'inactive',
  na: 'inactive',
};

/** Normalize any stored/imported status string to a canonical value (or null). */
export function normalizeContactStatus(raw?: string | null): string | null {
  const v = String(raw ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!v) return null;
  if (CONTACT_STATUSES.some((s) => s.value === v)) return v;
  return LEGACY_STATUS_MAP[v] ?? null;
}

export function contactStatusLabel(raw?: string | null): string {
  const v = normalizeContactStatus(raw);
  return CONTACT_STATUSES.find((s) => s.value === v)?.label ?? '—';
}

export const BUYING_ROLES = [
  { value: 'economic_buyer', label: 'Economic Buyer' },
  { value: 'champion', label: 'Champion' },
  { value: 'influencer', label: 'Influencer' },
  { value: 'user', label: 'User' },
  { value: 'blocker', label: 'Blocker' },
  { value: 'legal', label: 'Legal' },
  { value: 'finance', label: 'Finance' },
  { value: 'other', label: 'Other' },
];
