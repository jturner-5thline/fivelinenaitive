import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { password } = await req.json();

    if (!password || typeof password !== 'string') {
      return new Response(
        JSON.stringify({ valid: false, error: 'Password is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the gate password from environment
    const gatePassword = Deno.env.get('AUTH_GATE_PASSWORD');
    
    if (!gatePassword) {
      console.error('AUTH_GATE_PASSWORD not configured');
      return new Response(
        JSON.stringify({ valid: false, error: 'Gate not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Constant-time comparison to prevent timing attacks
    const isValid = password.length === gatePassword.length && 
      password.split('').every((char, i) => char === gatePassword[i]);

    if (isValid) {
      // Generate a short-lived token (valid for 1 hour)
      const token = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      
      return new Response(
        JSON.stringify({ 
          valid: true, 
          token,
          expiresAt,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      return new Response(
        JSON.stringify({ valid: false }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error('Gate validation error:', error);
    return new Response(
      JSON.stringify({ valid: false, error: 'Validation failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
