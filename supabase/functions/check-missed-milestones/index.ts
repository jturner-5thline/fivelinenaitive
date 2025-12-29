import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    console.log('Checking for missed milestones...')

    // Get all incomplete milestones with due dates in the past
    // that haven't already been marked as missed (no activity log entry)
    const now = new Date().toISOString()
    
    const { data: overdueMilestones, error: milestonesError } = await supabase
      .from('deal_milestones')
      .select(`
        id,
        title,
        deal_id,
        due_date,
        user_id,
        deals!inner(company, user_id)
      `)
      .eq('completed', false)
      .not('due_date', 'is', null)
      .lt('due_date', now)

    if (milestonesError) {
      console.error('Error fetching overdue milestones:', milestonesError)
      throw milestonesError
    }

    console.log(`Found ${overdueMilestones?.length || 0} overdue milestones`)

    if (!overdueMilestones || overdueMilestones.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No overdue milestones found', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check which milestones already have a missed notification
    const milestoneIds = overdueMilestones.map(m => m.id)
    
    const { data: existingNotifications, error: notifError } = await supabase
      .from('activity_logs')
      .select('metadata')
      .eq('activity_type', 'milestone_missed')
      .in('metadata->>milestone_id', milestoneIds)

    if (notifError) {
      console.error('Error checking existing notifications:', notifError)
    }

    // Get set of milestone IDs that already have notifications
    const notifiedMilestoneIds = new Set(
      existingNotifications?.map(n => (n.metadata as any)?.milestone_id) || []
    )

    // Filter to only new missed milestones
    const newMissedMilestones = overdueMilestones.filter(
      m => !notifiedMilestoneIds.has(m.id)
    )

    console.log(`${newMissedMilestones.length} milestones need notifications`)

    // Create activity log entries for each newly missed milestone
    const activityLogs = newMissedMilestones.map(milestone => ({
      deal_id: milestone.deal_id,
      user_id: (milestone.deals as any).user_id,
      activity_type: 'milestone_missed',
      description: `Milestone "${milestone.title}" is overdue`,
      metadata: {
        milestone_id: milestone.id,
        milestone_title: milestone.title,
        due_date: milestone.due_date,
        deal_company: (milestone.deals as any).company,
      },
    }))

    if (activityLogs.length > 0) {
      const { error: insertError } = await supabase
        .from('activity_logs')
        .insert(activityLogs)

      if (insertError) {
        console.error('Error inserting activity logs:', insertError)
        throw insertError
      }

      console.log(`Created ${activityLogs.length} milestone missed notifications`)
    }

    return new Response(
      JSON.stringify({ 
        message: 'Missed milestones check completed',
        processed: activityLogs.length,
        milestones: newMissedMilestones.map(m => ({
          id: m.id,
          title: m.title,
          due_date: m.due_date,
        }))
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('Error in check-missed-milestones:', error)
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
