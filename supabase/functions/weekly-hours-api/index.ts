import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const token = authHeader.replace('Bearer ', '')
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token)
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
    }
    const userId = claimsData.claims.sub as string

    const url = new URL(req.url)
    const action = url.searchParams.get('action')

    if (req.method === 'GET' && action === 'weekly-summary') {
      return await getWeeklySummary(supabase, userId, url, corsHeaders)
    }

    if (req.method === 'POST' && action === 'save-entry') {
      const body = await req.json()
      return await saveEntry(supabase, userId, body, corsHeaders)
    }

    if (req.method === 'POST' && action === 'complete-task') {
      const body = await req.json()
      return await completeTask(supabase, userId, body, corsHeaders)
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: corsHeaders })
  } catch (err) {
    console.error('weekly-hours-api error:', err)
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500, headers: corsHeaders })
  }
})

async function getWeeklySummary(supabase: any, userId: string, url: URL, headers: Record<string, string>) {
  const weekParam = url.searchParams.get('week')
  const weekStart = weekParam || getCurrentWeekStart()

  // Get user's display name to match against deal manager/analyst/deal_owner
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, first_name, last_name')
    .eq('user_id', userId)
    .single()

  if (!profile) {
    return new Response(JSON.stringify({ deals: [], week: weekStart }), { headers: { ...headers, 'Content-Type': 'application/json' } })
  }

  const displayName = profile.display_name || `${profile.first_name || ''} ${profile.last_name || ''}`.trim()

  // Get active deals where this user is manager, analyst, or deal_owner
  const { data: deals, error: dealsError } = await supabase
    .from('deals')
    .select('id, company, stage, status, value, manager, analyst, deal_owner, company_id')
    .neq('status', 'archived')
    .or(`manager.ilike.${displayName},analyst.ilike.${displayName},deal_owner.ilike.${displayName}`)

  if (dealsError) {
    console.error('Error fetching deals:', dealsError)
    return new Response(JSON.stringify({ error: 'Failed to fetch deals' }), { status: 500, headers })
  }

  const activeDealIds = (deals || []).map((d: any) => d.id)

  // Get existing time entries for this week
  let entriesMap: Record<string, number> = {}
  if (activeDealIds.length > 0) {
    const { data: entries } = await supabase
      .from('weekly_time_entries')
      .select('deal_id, hours')
      .eq('user_id', userId)
      .eq('week_start_date', weekStart)
      .in('deal_id', activeDealIds)

    if (entries) {
      entries.forEach((e: any) => { entriesMap[e.deal_id] = Number(e.hours) })
    }
  }

  // Get the task status for this week
  const { data: task } = await supabase
    .from('weekly_hours_tasks')
    .select('id, status, deals_submitted, total_deals, completed_at')
    .eq('user_id', userId)
    .eq('week_start_date', weekStart)
    .single()

  const result = (deals || []).map((d: any) => {
    let role = 'Team Member'
    if (d.manager?.toLowerCase() === displayName.toLowerCase()) role = 'Deal Manager'
    else if (d.analyst?.toLowerCase() === displayName.toLowerCase()) role = 'Analyst'
    else if (d.deal_owner?.toLowerCase() === displayName.toLowerCase()) role = 'Deal Owner'

    return {
      dealId: d.id,
      dealName: d.company,
      stage: d.stage,
      status: d.status,
      value: d.value,
      role,
      existingHours: entriesMap[d.id] ?? null,
    }
  })

  return new Response(JSON.stringify({
    deals: result,
    week: weekStart,
    task: task || null,
  }), { headers: { ...headers, 'Content-Type': 'application/json' } })
}

async function saveEntry(supabase: any, userId: string, body: any, headers: Record<string, string>) {
  const { dealId, week, hours } = body
  if (!dealId || !week || hours === undefined || hours === null) {
    return new Response(JSON.stringify({ error: 'Missing dealId, week, or hours' }), { status: 400, headers })
  }

  const numHours = Number(hours)
  if (isNaN(numHours) || numHours < 0 || numHours > 168) {
    return new Response(JSON.stringify({ error: 'Hours must be between 0 and 168' }), { status: 400, headers })
  }

  // Upsert the time entry
  const { data, error } = await supabase
    .from('weekly_time_entries')
    .upsert({
      deal_id: dealId,
      user_id: userId,
      week_start_date: week,
      hours: numHours,
      source: 'weekly_notification',
    }, { onConflict: 'deal_id,user_id,week_start_date' })
    .select()
    .single()

  if (error) {
    console.error('Error saving entry:', error)
    return new Response(JSON.stringify({ error: 'Failed to save entry' }), { status: 500, headers })
  }

  // Update the task's deals_submitted count
  const { data: allEntries } = await supabase
    .from('weekly_time_entries')
    .select('deal_id')
    .eq('user_id', userId)
    .eq('week_start_date', week)

  const submittedCount = allEntries?.length || 0

  await supabase
    .from('weekly_hours_tasks')
    .update({
      deals_submitted: submittedCount,
      status: 'in_progress',
    })
    .eq('user_id', userId)
    .eq('week_start_date', week)

  return new Response(JSON.stringify({ entry: data, dealsSubmitted: submittedCount }), {
    headers: { ...headers, 'Content-Type': 'application/json' },
  })
}

async function completeTask(supabase: any, userId: string, body: any, headers: Record<string, string>) {
  const { week } = body
  if (!week) {
    return new Response(JSON.stringify({ error: 'Missing week' }), { status: 400, headers })
  }

  const { data, error } = await supabase
    .from('weekly_hours_tasks')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('week_start_date', week)
    .select()
    .single()

  if (error) {
    console.error('Error completing task:', error)
    return new Response(JSON.stringify({ error: 'Failed to complete task' }), { status: 500, headers })
  }

  // Mark associated notification as read
  await supabase
    .from('flex_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('alert_type', 'weekly_hours_reminder')
    .is('read_at', null)

  return new Response(JSON.stringify({ task: data }), {
    headers: { ...headers, 'Content-Type': 'application/json' },
  })
}

function getCurrentWeekStart(): string {
  const now = new Date()
  const day = now.getDay()
  const diff = now.getDate() - day + (day === 0 ? -6 : 1) // Monday
  const monday = new Date(now)
  monday.setDate(diff)
  return monday.toISOString().split('T')[0]
}
