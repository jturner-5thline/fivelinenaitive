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
    // Use service role for cron jobs
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const weekStart = getCurrentWeekStart()
    console.log(`[weekly-hours-reminder] Generating reminders for week: ${weekStart}`)

    // Get all profiles with their display names
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('user_id, display_name, first_name, last_name, email')

    if (profilesError || !profiles?.length) {
      console.log('No profiles found or error:', profilesError)
      return new Response(JSON.stringify({ message: 'No profiles found' }), { headers: corsHeaders })
    }

    // Get all active deals
    const { data: deals, error: dealsError } = await supabase
      .from('deals')
      .select('id, company, manager, analyst, deal_owner, company_id')
      .neq('status', 'archived')

    if (dealsError || !deals?.length) {
      console.log('No active deals found or error:', dealsError)
      return new Response(JSON.stringify({ message: 'No active deals' }), { headers: corsHeaders })
    }

    // Build a map of display_name -> user_id -> company_id
    const userDealMap: Record<string, { userId: string; companyId: string | null; dealCount: number }> = {}

    for (const profile of profiles) {
      const displayName = (profile.display_name || `${profile.first_name || ''} ${profile.last_name || ''}`.trim()).toLowerCase()
      if (!displayName) continue

      const userDeals = deals.filter(d =>
        d.manager?.toLowerCase() === displayName ||
        d.analyst?.toLowerCase() === displayName ||
        d.deal_owner?.toLowerCase() === displayName
      )

      if (userDeals.length > 0) {
        userDealMap[profile.user_id] = {
          userId: profile.user_id,
          companyId: userDeals[0].company_id,
          dealCount: userDeals.length,
        }
      }
    }

    const userIds = Object.keys(userDealMap)
    console.log(`[weekly-hours-reminder] Found ${userIds.length} users with active deals`)

    // Check existing tasks for this week
    const { data: existingTasks } = await supabase
      .from('weekly_hours_tasks')
      .select('user_id')
      .eq('week_start_date', weekStart)

    const existingUserIds = new Set((existingTasks || []).map((t: any) => t.user_id))

    let created = 0
    for (const uid of userIds) {
      if (existingUserIds.has(uid)) continue

      const info = userDealMap[uid]

      // Create the weekly hours task
      await supabase.from('weekly_hours_tasks').insert({
        user_id: uid,
        company_id: info.companyId,
        week_start_date: weekStart,
        status: 'open',
        total_deals: info.dealCount,
        deals_submitted: 0,
      })

      // Create a notification
      await supabase.from('flex_notifications').insert({
        user_id: uid,
        alert_type: 'weekly_hours_reminder',
        title: 'Submit your weekly hours',
        message: `Log your hours for the week of ${formatWeekLabel(weekStart)} across ${info.dealCount} deal${info.dealCount > 1 ? 's' : ''}.`,
        deal_id: null,
        metadata: { week_start_date: weekStart, deal_count: info.dealCount },
      })

      created++
    }

    console.log(`[weekly-hours-reminder] Created ${created} new tasks/notifications`)
    return new Response(JSON.stringify({ created, total_users: userIds.length, week: weekStart }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[weekly-hours-reminder] Error:', err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders })
  }
})

function getCurrentWeekStart(): string {
  const now = new Date()
  const day = now.getDay()
  const diff = now.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(now)
  monday.setDate(diff)
  return monday.toISOString().split('T')[0]
}

function formatWeekLabel(weekStart: string): string {
  const start = new Date(weekStart + 'T00:00:00')
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${fmt(start)} – ${fmt(end)}`
}
