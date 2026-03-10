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
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Verify JWT and extract user_id from the token, not the body
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid Authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const token = authHeader.replace('Bearer ', '')
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token)
    if (claimsError || !claimsData?.claims?.sub) {
      console.error('JWT verification failed:', claimsError)
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const user_id = claimsData.claims.sub as string
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const body = await req.json()
    const { event_type, payload } = body
    console.log('Received webhook request:', JSON.stringify({ event_type, user_id }))

    if (!event_type) {
      console.log('Missing event_type')
      return new Response(
        JSON.stringify({ error: 'Missing event_type' }),
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

    console.log('Found webhooks:', webhooks?.length || 0)

    // Filter webhooks that subscribe to this event type (empty array = all events)
    const matchingWebhooks = (webhooks || []).filter(w => 
      w.event_types.length === 0 || w.event_types.includes(event_type)
    )

    console.log('Matching webhooks for event', event_type, ':', matchingWebhooks.length)

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
