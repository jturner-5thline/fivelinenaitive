import { createClient } from 'npm:@supabase/supabase-js@2'

const RECIPIENT_EMAILS = [
  'ppina@5thline.co',
  'jturner@5thline.co',
  'jmoffitt@5thline.co',
]

const PLATFORM_URL = 'https://fivelinenaitive.lovable.app'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function tierLabel(t: number | null | undefined) {
  return t == null ? '—' : `Tier ${t}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
    return json(500, { error: 'server_misconfigured' })
  }

  // Verify caller
  const authHeader = req.headers.get('Authorization') ?? ''
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userData.user) return json(401, { error: 'unauthorized' })

  let historyId: string
  try {
    const body = await req.json()
    historyId = String(body?.historyId || body?.history_id || '')
    if (!historyId) throw new Error('missing')
  } catch {
    return json(400, { error: 'historyId required' })
  }

  const admin = createClient(supabaseUrl, supabaseServiceKey)

  // Load the history entry
  const { data: entry, error: entryErr } = await admin
    .from('partner_tier_history')
    .select('id, company_id, partner_id, from_tier, to_tier, source, thresholds, created_at')
    .eq('id', historyId)
    .maybeSingle()
  if (entryErr || !entry) return json(404, { error: 'history_not_found' })

  // Only auto transitions with a prior tier trigger notifications
  if (entry.source !== 'auto') return json(200, { skipped: 'not_auto' })
  if (entry.from_tier == null) return json(200, { skipped: 'baseline_snapshot' })

  // Confirm caller belongs to the same company as the partner
  const { data: membership } = await admin
    .from('company_members')
    .select('user_id')
    .eq('user_id', userData.user.id)
    .eq('company_id', entry.company_id)
    .maybeSingle()
  if (!membership) return json(403, { error: 'forbidden' })

  // Load partner name for messaging
  const { data: partner } = await admin
    .from('partners')
    .select('id, name')
    .eq('id', entry.partner_id)
    .maybeSingle()
  const partnerName = partner?.name || 'A partner'
  const partnerUrl = `${PLATFORM_URL}/partners-pipeline?partner=${entry.partner_id}`

  // Resolve recipient user IDs by email (auth.users is not selectable via PostgREST;
  // use admin.listUsers with a small filter loop).
  const { data: authList, error: listErr } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  })
  if (listErr) return json(500, { error: 'user_lookup_failed', details: listErr.message })
  const recipientUsers = (authList.users || []).filter((u) =>
    u.email && RECIPIENT_EMAILS.includes(u.email.toLowerCase()),
  )

  const thresholds = (entry.thresholds || {}) as Record<string, any>
  const title = `Partner tier updated: ${partnerName}`
  const body = `${partnerName} moved ${tierLabel(entry.from_tier)} → ${tierLabel(entry.to_tier)}`

  // In-app notifications (service role insert)
  const notifRows = recipientUsers.map((u) => ({
    trigger_key: 'partner.tier.auto_changed',
    recipient_user_id: u.id,
    channel_type: 'in_app' as const,
    status: 'sent' as const,
    title,
    body,
    rendered_data: {},
    context: {
      partner_id: entry.partner_id,
      partner_name: partnerName,
      from_tier: entry.from_tier,
      to_tier: entry.to_tier,
      history_id: entry.id,
      url: partnerUrl,
    },
    actor_user_id: userData.user.id,
    sent_at: new Date().toISOString(),
  }))

  if (notifRows.length > 0) {
    const { error: notifErr } = await admin.from('notification_instances').insert(notifRows)
    if (notifErr) console.error('notification insert failed', notifErr)
  }

  // Email notifications — invoke the shared transactional sender per recipient
  const changedAt = new Date(entry.created_at).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })

  const emailResults = await Promise.allSettled(
    RECIPIENT_EMAILS.map((email) =>
      admin.functions.invoke('send-app-email', {
        body: {
          templateName: 'partner-tier-changed',
          recipientEmail: email,
          idempotencyKey: `partner-tier-changed-${entry.id}-${email}`,
          templateData: {
            partnerName,
            fromTier: entry.from_tier,
            toTier: entry.to_tier,
            qualifiedTrailing3mo: thresholds.qualifiedTrailing3mo,
            signedTrailing3mo: thresholds.signedTrailing3mo,
            addedToBoardTrailing12mo: thresholds.addedToBoardTrailing12mo,
            totalDeals: thresholds.totalDeals,
            changedAt,
            partnerUrl,
          },
        },
      }),
    ),
  )

  const emailFailed = emailResults.filter((r) => r.status === 'rejected').length
  if (emailFailed > 0) console.error('some partner tier emails failed to enqueue', { emailFailed })

  return json(200, {
    ok: true,
    inApp: notifRows.length,
    emailQueued: RECIPIENT_EMAILS.length - emailFailed,
    emailFailed,
  })
})