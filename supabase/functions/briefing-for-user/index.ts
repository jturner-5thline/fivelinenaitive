// Fetches another user's email_cache + email_analysis on behalf of an
// allow-listed caller (currently James Turner). Uses service role to bypass RLS.
//
// This is the MVP authorization model: a small server-side allow-list. The
// long-term plan is to back this with a `delegated_briefing_access` table
// (grantor_user_id, grantee_user_id) and check membership instead. When that
// table is added, replace `isAllowedDelegate(...)` with a DB lookup.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// MVP allow-list: caller email -> set of target user_ids they may view
const DELEGATE_ACCESS: Record<string, Set<string>> = {
  'jturner@5thline.co': new Set([
    'a757f375-7e93-4fc5-a49e-e371abb42fac', // Niki Heikali
  ]),
};

function isAllowedDelegate(callerEmail: string | undefined, targetUserId: string): boolean {
  if (!callerEmail) return false;
  const allowed = DELEGATE_ACCESS[callerEmail.toLowerCase()];
  return !!allowed && allowed.has(targetUserId);
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await anonClient.auth.getUser();
    if (userError || !user) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const targetUserId: string | undefined = body?.targetUserId;
    const startISO: string | undefined = body?.startISO;
    const endISO: string | undefined = body?.endISO;
    const dataset: 'email' | 'catchup' = body?.dataset === 'catchup' ? 'catchup' : 'email';

    if (!targetUserId || !startISO || !endISO) {
      return jsonResponse({ error: 'targetUserId, startISO, endISO required' }, 400);
    }

    if (!isAllowedDelegate(user.email, targetUserId)) {
      // Audit denied access attempt
      console.warn(
        `[briefing-for-user] DENIED: caller=${user.email} (${user.id}) tried to read target=${targetUserId}`
      );
      return jsonResponse({ error: 'Not authorized to view this user\'s briefing' }, 403);
    }

    // Audit allowed access
    console.log(
      `[briefing-for-user] ALLOWED: caller=${user.email} (${user.id}) -> target=${targetUserId} dataset=${dataset}`
    );

    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch the target user's email_cache + email_analysis
    const [emailCacheRes, emailAnalysisRes] = await Promise.all([
      serviceClient
        .from('email_cache')
        .select('id, gmail_message_id, subject, snippet, from_email, from_name, received_at, is_read, labels')
        .eq('user_id', targetUserId)
        .gte('received_at', startISO)
        .lte('received_at', endISO)
        .order('received_at', { ascending: false })
        .limit(50),
      serviceClient
        .from('email_analysis')
        .select('email_cache_id, category, sentiment, priority, summary, deal_name, follow_up_needed')
        .eq('user_id', targetUserId)
        .gte('analyzed_at', startISO)
        .limit(200),
    ]);

    if (emailCacheRes.error) {
      console.error('[briefing-for-user] email_cache query error', emailCacheRes.error);
    }
    if (emailAnalysisRes.error) {
      console.error('[briefing-for-user] email_analysis query error', emailAnalysisRes.error);
    }

    return jsonResponse({
      emailCache: emailCacheRes.data || [],
      emailAnalysis: emailAnalysisRes.data || [],
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[briefing-for-user] error', msg);
    return jsonResponse({ error: msg }, 500);
  }
});
