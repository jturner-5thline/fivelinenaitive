import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MICROSOFT_SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
  'User.Read',
  'Mail.ReadWrite',
  'Mail.Send',
  'Calendars.ReadWrite',
  'Contacts.Read',
  'Team.ReadBasic.All',
  'Channel.ReadBasic.All',
  'ChannelMessage.Send',
  'OnlineMeetings.Read',
].join(' ');

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const MICROSOFT_CLIENT_ID = Deno.env.get('MICROSOFT_CLIENT_ID');
  const MICROSOFT_CLIENT_SECRET = Deno.env.get('MICROSOFT_CLIENT_SECRET');
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  try {
    const { action } = await req.clone().json();
    if (!MICROSOFT_CLIENT_ID || !MICROSOFT_CLIENT_SECRET) {
      // For status checks, gracefully return disconnected instead of 500
      if (action === 'check_status') {
        return new Response(JSON.stringify({ connected: false }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ error: 'Microsoft credentials not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (_) {
    // JSON parse will happen again below, let it handle errors there
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { action, code, redirect_uri, user_id } = await req.json();

    if (action === 'get_auth_url') {
      const authUrl = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
      authUrl.searchParams.set('client_id', MICROSOFT_CLIENT_ID);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('redirect_uri', redirect_uri);
      authUrl.searchParams.set('scope', MICROSOFT_SCOPES);
      authUrl.searchParams.set('response_mode', 'query');
      authUrl.searchParams.set('prompt', 'consent');

      return new Response(JSON.stringify({ url: authUrl.toString() }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'exchange_code') {
      // Exchange authorization code for tokens
      const tokenResponse = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: MICROSOFT_CLIENT_ID,
          client_secret: MICROSOFT_CLIENT_SECRET,
          code,
          redirect_uri,
          grant_type: 'authorization_code',
          scope: MICROSOFT_SCOPES,
        }),
      });

      const tokens = await tokenResponse.json();
      if (!tokenResponse.ok) {
        console.error('Token exchange failed:', tokens);
        return new Response(JSON.stringify({ error: 'Token exchange failed', details: tokens }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get user profile from Microsoft Graph
      const profileResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const profile = await profileResponse.json();

      // Store tokens in microsoft_tokens table
      const { error: upsertError } = await supabase
        .from('microsoft_tokens')
        .upsert({
          user_id,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
          email: profile.mail || profile.userPrincipalName,
          display_name: profile.displayName,
          connected_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

      if (upsertError) {
        console.error('Failed to store tokens:', upsertError);
        return new Response(JSON.stringify({ error: 'Failed to store tokens' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ 
        success: true, 
        email: profile.mail || profile.userPrincipalName,
        display_name: profile.displayName,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'check_status') {
      const { data, error } = await supabase
        .from('microsoft_tokens')
        .select('email, display_name, connected_at, expires_at')
        .eq('user_id', user_id)
        .maybeSingle();

      if (error || !data) {
        return new Response(JSON.stringify({ connected: false }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const isExpired = new Date(data.expires_at) < new Date();

      return new Response(JSON.stringify({
        connected: true,
        email: data.email,
        display_name: data.display_name,
        connected_at: data.connected_at,
        is_expired: isExpired,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'disconnect') {
      await supabase
        .from('microsoft_tokens')
        .delete()
        .eq('user_id', user_id);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Microsoft auth error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
