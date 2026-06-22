import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useCompany } from '@/hooks/useCompany'
import { toast } from 'sonner'

export type MatchStatus = 'unmatched' | 'matched' | 'needs_review' | 'ignored'

export interface DomainMatchSettings {
  org_company_id: string
  auto_apply: boolean
  subdomain_matching: boolean
  ignored_domains: string[]
  extra_freemail_domains: string[]
  updated_at: string
}

export function useDomainMatchSettings() {
  const { company } = useCompany()
  return useQuery({
    queryKey: ['domain-match-settings', company?.id],
    enabled: !!company?.id,
    queryFn: async (): Promise<DomainMatchSettings> => {
      const { data, error } = await (supabase as any)
        .from('domain_match_settings')
        .select('*')
        .eq('org_company_id', company!.id)
        .maybeSingle()
      if (error) throw error
      return (
        data ?? {
          org_company_id: company!.id,
          auto_apply: true,
          subdomain_matching: false,
          ignored_domains: [],
          extra_freemail_domains: [],
          updated_at: new Date().toISOString(),
        }
      )
    },
  })
}

export function useUpdateDomainMatchSettings() {
  const qc = useQueryClient()
  const { company } = useCompany()
  return useMutation({
    mutationFn: async (patch: Partial<DomainMatchSettings>) => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      const row = {
        org_company_id: company!.id,
        auto_apply: patch.auto_apply ?? true,
        subdomain_matching: patch.subdomain_matching ?? false,
        ignored_domains: patch.ignored_domains ?? [],
        extra_freemail_domains: patch.extra_freemail_domains ?? [],
        updated_by: user?.id ?? null,
        updated_at: new Date().toISOString(),
      }
      const { error } = await (supabase as any)
        .from('domain_match_settings')
        .upsert(row, { onConflict: 'org_company_id' })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['domain-match-settings'] })
      toast.success('Settings saved')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export interface SyncContactRow {
  id: string
  email: string | null
  full_name: string | null
  email_domain_normalized: string | null
  crm_company_id: string | null
  match_status: MatchStatus
  match_confidence: number | null
  match_source: string | null
  last_match_run_at: string | null
  crm_company?: { id: string; name: string; domain_normalized: string | null } | null
}

export function useSyncContacts(filter: MatchStatus | 'all', searchQuery: string) {
  const { company } = useCompany()
  return useQuery({
    queryKey: ['contact-sync-list', company?.id, filter, searchQuery],
    enabled: !!company?.id,
    queryFn: async (): Promise<SyncContactRow[]> => {
      let q = (supabase as any)
        .from('contacts')
        .select(
          'id, email, full_name, email_domain_normalized, crm_company_id, match_status, match_confidence, match_source, last_match_run_at, crm_company:crm_companies!crm_company_id(id, name, domain_normalized)',
        )
        .eq('org_company_id', company!.id)
        .order('last_match_run_at', { ascending: false, nullsFirst: false })
        .limit(200)
      if (filter !== 'all') q = q.eq('match_status', filter)
      if (searchQuery.trim()) {
        const s = searchQuery.trim()
        q = q.or(
          `email.ilike.%${s}%,full_name.ilike.%${s}%,email_domain_normalized.ilike.%${s}%`,
        )
      }
      const { data, error } = await q
      if (error) throw error
      return (data || []) as SyncContactRow[]
    },
  })
}

export interface MatchSuggestion {
  id: string
  contact_id: string
  proposed_company_id: string | null
  normalized_contact_domain: string | null
  normalized_company_domain: string | null
  decision: string
  reason: string | null
  created_at: string
  proposed_company?: { id: string; name: string; website_url: string | null } | null
}

export function useContactSuggestions(contactId: string | null | undefined) {
  return useQuery({
    queryKey: ['contact-match-suggestions', contactId],
    enabled: !!contactId,
    queryFn: async (): Promise<MatchSuggestion[]> => {
      const { data, error } = await (supabase as any)
        .from('contact_company_match_audit')
        .select(
          'id, contact_id, proposed_company_id, normalized_contact_domain, normalized_company_domain, decision, reason, created_at, proposed_company:crm_companies!proposed_company_id(id, name, website_url)',
        )
        .eq('contact_id', contactId)
        .in('decision', ['suggested', 'auto_matched'])
        .order('created_at', { ascending: false })
        .limit(10)
      if (error) throw error
      return (data || []) as MatchSuggestion[]
    },
  })
}

export function useRunContactSync() {
  const qc = useQueryClient()
  const { company } = useCompany()
  return useMutation({
    mutationFn: async (
      args:
        | { mode: 'single'; contact_id: string }
        | { mode: 'resync_contact'; contact_id: string }
        | { mode: 'bulk_org'; only_unmatched?: boolean; limit?: number }
        | { mode: 'bulk_company'; company_id: string },
    ) => {
      const payload: Record<string, unknown> = { ...args }
      if (args.mode === 'bulk_org') payload.org_company_id = company!.id
      const { data, error } = await supabase.functions.invoke('contact-company-sync', { body: payload })
      if (error) throw error
      return data
    },
    onSuccess: (data: { result?: Record<string, number> }) => {
      qc.invalidateQueries({ queryKey: ['contact-sync-list'] })
      qc.invalidateQueries({ queryKey: ['contacts'] })
      qc.invalidateQueries({ queryKey: ['contact-match-suggestions'] })
      const r = data?.result
      if (r && typeof r.processed === 'number') {
        toast.success(
          `Processed ${r.processed} · matched ${r.matched ?? 0} · review ${r.needs_review ?? 0} · ignored ${r.ignored ?? 0}`,
        )
      } else {
        toast.success('Sync complete')
      }
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useResolveSuggestion() {
  const qc = useQueryClient()
  const { company } = useCompany()
  return useMutation({
    mutationFn: async (args: {
      contactId: string
      companyId: string | null
      decision: 'confirm' | 'reject' | 'reassign' | 'ignore'
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      const auditRow: Record<string, unknown> = {
        org_company_id: company!.id,
        contact_id: args.contactId,
        proposed_company_id: args.companyId,
        decision: args.decision === 'reject' ? 'rejected' : 'manual_override',
        reason: `user_${args.decision}`,
        created_by: user?.id ?? null,
      }
      const updates: Record<string, unknown> = {
        last_match_run_at: new Date().toISOString(),
        match_source: 'manual_override',
      }
      if (args.decision === 'confirm' || args.decision === 'reassign') {
        updates.crm_company_id = args.companyId
        updates.match_status = 'matched'
        updates.match_confidence = 1.0
      } else if (args.decision === 'ignore') {
        updates.match_status = 'ignored'
        updates.match_confidence = 0
      } else if (args.decision === 'reject') {
        updates.match_status = 'unmatched'
        updates.match_confidence = 0
      }
      const { error: upErr } = await (supabase as any)
        .from('contacts')
        .update(updates)
        .eq('id', args.contactId)
      if (upErr) throw upErr
      await (supabase as any).from('contact_company_match_audit').insert(auditRow)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contact-sync-list'] })
      qc.invalidateQueries({ queryKey: ['contact-match-suggestions'] })
      qc.invalidateQueries({ queryKey: ['contacts'] })
      toast.success('Updated')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}