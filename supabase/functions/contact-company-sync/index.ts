import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
    const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const authHeader = req.headers.get('Authorization') || ''
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData, error: userErr } = await userClient.auth.getUser()
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json().catch(() => ({} as Record<string, unknown>))
    const mode = String(body.mode || 'single')
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE)

    // Verify caller is a member of the target org for any org-scoped op
    const ensureMember = async (orgId: string) => {
      const { data } = await admin
        .from('company_members')
        .select('user_id')
        .eq('company_id', orgId)
        .eq('user_id', userData.user!.id)
        .maybeSingle()
      if (!data) throw new Error('forbidden')
    }

    if (mode === 'single' || mode === 'resync_contact') {
      const contactId = String(body.contact_id || '')
      if (!contactId) throw new Error('contact_id required')
      const { data: c } = await admin
        .from('contacts').select('org_company_id').eq('id', contactId).maybeSingle()
      if (!c?.org_company_id) throw new Error('contact_not_found')
      await ensureMember(c.org_company_id)
      const { data, error } = await userClient.rpc('run_contact_company_match', {
        p_contact_id: contactId,
        p_source: mode === 'resync_contact' ? 'manual_override' : 'auto_trigger',
        p_force: mode === 'resync_contact',
      })
      if (error) throw error
      return new Response(JSON.stringify({ ok: true, result: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (mode === 'bulk_org') {
      const orgId = String(body.org_company_id || '')
      if (!orgId) throw new Error('org_company_id required')
      await ensureMember(orgId)
      const onlyUnmatched = body.only_unmatched !== false
      const limit = Math.min(Number(body.limit) || 1000, 5000)
      const { data, error } = await userClient.rpc('bulk_contact_company_match', {
        p_org_company_id: orgId,
        p_only_unmatched: onlyUnmatched,
        p_limit: limit,
      })
      if (error) throw error
      return new Response(JSON.stringify({ ok: true, result: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (mode === 'bulk_company') {
      const companyId = String(body.company_id || '')
      if (!companyId) throw new Error('company_id required')
      const { data: co } = await admin
        .from('crm_companies')
        .select('org_company_id, domain_normalized')
        .eq('id', companyId).maybeSingle()
      if (!co?.org_company_id) throw new Error('company_not_found')
      await ensureMember(co.org_company_id)
      if (!co.domain_normalized) {
        return new Response(JSON.stringify({ ok: true, result: { processed: 0 } }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const { data: contacts } = await admin
        .from('contacts')
        .select('id')
        .eq('org_company_id', co.org_company_id)
        .is('crm_company_id', null)
        .eq('email_domain_normalized', co.domain_normalized)
        .limit(2000)
      let processed = 0, matched = 0, review = 0
      for (const row of contacts || []) {
        const { data } = await admin.rpc('run_contact_company_match', {
          p_contact_id: row.id, p_source: 'bulk_resync', p_force: false,
        })
        processed++
        const s = (data as { status?: string } | null)?.status
        if (s === 'matched') matched++
        else if (s === 'needs_review') review++
      }
      return new Response(JSON.stringify({ ok: true, result: { processed, matched, needs_review: review } }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'unknown_mode' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const status = msg === 'unauthorized' ? 401 : msg === 'forbidden' ? 403 : 400
    return new Response(JSON.stringify({ error: msg }), {
      status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})