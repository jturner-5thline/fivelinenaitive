import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const GAMMA_API_BASE = 'https://public-api.gamma.app/v1.0';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const GAMMA_API_KEY = Deno.env.get('GAMMA_API_KEY');
    if (!GAMMA_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'Gamma API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { action, ...params } = await req.json();

    switch (action) {
      case 'generate': {
        const { inputText, format = 'presentation', numCards, themeId } = params;
        
        if (!inputText) {
          return new Response(
            JSON.stringify({ error: 'inputText is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const body: Record<string, unknown> = {
          inputText,
          textMode: 'generate',
          format,
        };
        if (numCards) body.numCards = numCards;
        if (themeId) body.themeId = themeId;

        const response = await fetch(`${GAMMA_API_BASE}/generations`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-KEY': GAMMA_API_KEY,
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Gamma generate error:', response.status, errorText);
          return new Response(
            JSON.stringify({ error: `Gamma API error: ${response.status}`, details: errorText }),
            { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const data = await response.json();
        return new Response(
          JSON.stringify(data),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'status': {
        const { generationId } = params;
        
        if (!generationId) {
          return new Response(
            JSON.stringify({ error: 'generationId is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const response = await fetch(`${GAMMA_API_BASE}/generations/${generationId}`, {
          method: 'GET',
          headers: {
            'X-API-KEY': GAMMA_API_KEY,
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Gamma status error:', response.status, errorText);
          return new Response(
            JSON.stringify({ error: `Gamma API error: ${response.status}` }),
            { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const data = await response.json();
        return new Response(
          JSON.stringify(data),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'themes': {
        const response = await fetch(`${GAMMA_API_BASE}/themes?limit=50`, {
          method: 'GET',
          headers: {
            'X-API-KEY': GAMMA_API_KEY,
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Gamma themes error:', response.status, errorText);
          return new Response(
            JSON.stringify({ error: `Gamma API error: ${response.status}` }),
            { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const data = await response.json();
        return new Response(
          JSON.stringify(data),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error: unknown) {
    console.error('Gamma integration error:', error);
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
