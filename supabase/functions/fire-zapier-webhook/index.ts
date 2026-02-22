import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const { event_type, user_id, payload } = await req.json()

    if (!event_type || !user_id) {
      return new Response(
        JSON.stringify({ error: 'Missing event_type or user_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Find all active webhooks for this user that subscribe to this event type
    const { data: webhooks, error: fetchError } = await supabase
      .from('zapier_webhooks')
      .select('*')
      .eq('user_id', user_id)
      .eq('is_active', true)

    if (fetchError) {
      console.error('Error fetching webhooks:', fetchError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch webhooks' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Filter webhooks that subscribe to this event type (empty array = all events)
    const matchingWebhooks = (webhooks || []).filter(w => 
      w.event_types.length === 0 || w.event_types.includes(event_type)
    )

    if (matchingWebhooks.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No matching webhooks found', fired: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const results = await Promise.allSettled(
      matchingWebhooks.map(async (webhook) => {
        const zapierPayload = {
          event_type,
          timestamp: new Date().toISOString(),
          triggered_from: supabaseUrl,
          ...payload,
        }

        try {
          const response = await fetch(webhook.webhook_url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(zapierPayload),
          })

          const responseBody = await response.text()

          // Log the delivery
          await supabase.from('zapier_webhook_logs').insert({
            webhook_id: webhook.id,
            event_type,
            payload: zapierPayload,
            status_code: response.status,
            response_body: responseBody.substring(0, 1000),
            success: response.ok,
          })

          return { webhook_id: webhook.id, success: response.ok, status: response.status }
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Unknown error'

          await supabase.from('zapier_webhook_logs').insert({
            webhook_id: webhook.id,
            event_type,
            payload: zapierPayload,
            success: false,
            error_message: errorMessage,
          })

          return { webhook_id: webhook.id, success: false, error: errorMessage }
        }
      })
    )

    return new Response(
      JSON.stringify({ fired: matchingWebhooks.length, results }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error in fire-zapier-webhook:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
