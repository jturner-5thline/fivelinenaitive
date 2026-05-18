// Fetches another user's email_cache + email_analysis on behalf of an
// authorized caller. Uses service role to bypass RLS.
//
// Authorization model (MVP): a small server-side allow-list mirrored in
// `src/constants/nikiBriefing.ts`. Callers in NIKI_BRIEFING_ALLOWED_EMAILS
// may view Niki's briefing. Niki herself is included so she can self-view
// through this same parameterized path. The long-term plan is to back this
// with a `delegated_briefing_access` table and check membership instead.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Mirror of src/constants/nikiBriefing.ts — keep in sync.
const NIKI_BRIEFING_ALLOWED_EMAILS = new Set<string>([
  'jturner@5thline.co',
  'nheikali@5thline.co',
]);
const NIKI_USER_ID = 'a757f375-7e93-4fc5-a49e-e371abb42fac';

// Mirror of src/constants/moffittBriefing.ts — keep in sync.
const MOFFITT_BRIEFING_ALLOWED_EMAILS = new Set<string>([
  'jturner@5thline.co',
  'jmoffitt@5thline.co',
]);
const MOFFITT_USER_ID = 'bb211b16-282f-4eb5-a461-4168d6459154';

function isAuthorizedCaller(
  callerEmail: string | undefined,
  callerUserId: string,
  targetUserId: string,
): boolean {
  if (!callerEmail) return false;
  const email = callerEmail.toLowerCase();
  // Self-view: caller is the target user (e.g., Niki viewing her own briefing).
  if (callerUserId === targetUserId) {
    return (
      NIKI_BRIEFING_ALLOWED_EMAILS.has(email) ||
      MOFFITT_BRIEFING_ALLOWED_EMAILS.has(email)
    );
  }
  // Delegated view: caller on the matching allow-list for the requested target.
  if (targetUserId === NIKI_USER_ID) {
    return NIKI_BRIEFING_ALLOWED_EMAILS.has(email);
  }
  if (targetUserId === MOFFITT_USER_ID) {
    return MOFFITT_BRIEFING_ALLOWED_EMAILS.has(email);
  }
  return false;
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

    if (!isAuthorizedCaller(user.email, user.id, targetUserId)) {
      // Audit denied access attempt
      console.warn(
        `[briefing-for-user] DENIED: caller=${user.email} (${user.id}) tried to read target=${targetUserId}`
      );
      return jsonResponse({ error: 'Not authorized to view this user\'s briefing' }, 403);
    }

    const isSelfView = user.id === targetUserId;
    // Audit allowed access (distinguish self vs delegated)
    console.log(
      `[briefing-for-user] ALLOWED (${isSelfView ? 'self' : 'delegated'}): caller=${user.email} (${user.id}) -> target=${targetUserId} dataset=${dataset}`
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
