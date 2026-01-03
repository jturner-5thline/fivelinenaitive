import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
    const { token } = await req.json()

    if (!token) {
      console.log('No token provided')
      return new Response(
        JSON.stringify({ error: 'Token is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate UUID format to prevent injection
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(token)) {
      console.log('Invalid token format:', token)
      return new Response(
        JSON.stringify({ error: 'Invalid token format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Use service role to bypass RLS
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    console.log('Looking up invitation with token:', token)

    // Query the invitation by token
    const { data: invitation, error } = await supabase
      .from('company_invitations')
      .select('id, email, role, company_id, expires_at, accepted_at, companies(name)')
      .eq('token', token)
      .single() as { data: { id: string; email: string; role: string; company_id: string; expires_at: string; accepted_at: string | null; companies: { name: string } | null } | null; error: any }

    if (error || !invitation) {
      console.log('Invitation not found:', error?.message)
      return new Response(
        JSON.stringify({ status: 'invalid', error: 'Invitation not found' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if already accepted
    if (invitation.accepted_at) {
      console.log('Invitation already accepted')
      return new Response(
        JSON.stringify({ status: 'accepted' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if expired
    if (new Date(invitation.expires_at) < new Date()) {
      console.log('Invitation expired')
      return new Response(
        JSON.stringify({ status: 'expired' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Return invitation details (excluding sensitive data like the token itself)
    console.log('Invitation valid for:', invitation.email)
    const companyName = (invitation.companies as { name: string } | null)?.name || 'Unknown Company'
    
    return new Response(
      JSON.stringify({
        status: 'valid',
        invitation: {
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          company_id: invitation.company_id,
          company_name: companyName,
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error validating invitation:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
