import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const QUICKBOOKS_CLIENT_ID = Deno.env.get("QUICKBOOKS_CLIENT_ID")!;
const QUICKBOOKS_CLIENT_SECRET = Deno.env.get("QUICKBOOKS_CLIENT_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const QB_AUTH_URL = "https://appcenter.intuit.com/connect/oauth2";
const QB_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const QB_API_BASE = "https://quickbooks.api.intuit.com/v3/company";

// Clean URL with NO query params — Intuit Production rejects query strings in redirect URIs
const REDIRECT_URI = "https://tgkksvazruzbghssnxde.supabase.co/functions/v1/quickbooks-auth";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function redirectToApp(params: string) {
  const appUrl = Deno.env.get("APP_URL") || "https://naitive.co";
  return new Response(null, {
    status: 302,
    headers: {
      ...corsHeaders,
      "Location": `${appUrl}/integrations?${params}`,
    },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    console.log(`[QuickBooks Auth] Action: ${action}`);

    async function getUserId(): Promise<string | null> {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return null;
      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) return null;
      return user.id;
    }

    // ── CONNECT: Generate OAuth URL ──
    if (action === "connect" || action === "authorize") {
      const userId = await getUserId();
      if (!userId) return jsonResponse({ error: "Unauthorized" }, 401);

      const state = crypto.randomUUID();
      const { error: stateError } = await supabase
        .from("quickbooks_oauth_states")
        .insert({ user_id: userId, state });

      if (stateError) {
        console.error("[QuickBooks Auth] Failed to store state:", stateError);
        return jsonResponse({ error: "Failed to initiate OAuth" }, 500);
      }

      // Clean up expired states
      await supabase
        .from("quickbooks_oauth_states")
        .delete()
        .lt("expires_at", new Date().toISOString());

      const scope = "com.intuit.quickbooks.accounting";
      const authUrl = `${QB_AUTH_URL}?client_id=${QUICKBOOKS_CLIENT_ID}&response_type=code&scope=${encodeURIComponent(scope)}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&state=${encodeURIComponent(state)}`;

      console.log(`[QuickBooks Auth] Generated auth URL for user ${userId}`);
      return jsonResponse({ authUrl });
    }

    // ── CALLBACK: Detect by presence of 'code' param ──
    if (url.searchParams.has("code")) {
      try {
        const code = url.searchParams.get("code");
        const realmId = url.searchParams.get("realmId");
        const state = url.searchParams.get("state");

        if (!code || !realmId || !state) {
          console.error("[QuickBooks Auth] Missing callback params");
          return redirectToApp("error=missing_params");
        }

        // Validate state
        const { data: stateRecord, error: stateError } = await supabase
          .from("quickbooks_oauth_states")
          .select("user_id, expires_at")
          .eq("state", state)
          .maybeSingle();

        if (stateError || !stateRecord) {
          console.error("[QuickBooks Auth] Invalid state:", state);
          return redirectToApp("error=invalid_state");
        }

        if (new Date(stateRecord.expires_at) < new Date()) {
          await supabase.from("quickbooks_oauth_states").delete().eq("state", state);
          return redirectToApp("error=state_expired");
        }

        const userId = stateRecord.user_id;
        await supabase.from("quickbooks_oauth_states").delete().eq("state", state);

        // Exchange code for tokens
        const tokenResponse = await fetch(QB_TOKEN_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Authorization": `Basic ${btoa(`${QUICKBOOKS_CLIENT_ID}:${QUICKBOOKS_CLIENT_SECRET}`)}`,
          },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            code,
            redirect_uri: REDIRECT_URI,
          }),
        });

        if (!tokenResponse.ok) {
          const errorText = await tokenResponse.text();
          console.error("[QuickBooks Auth] Token exchange failed:", errorText);
          return redirectToApp("error=token_exchange_failed");
        }

        const tokens = await tokenResponse.json();
        const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

        // Fetch the company name from QuickBooks CompanyInfo
        let companyName: string | null = null;
        try {
          const companyInfoRes = await fetch(
            `${QB_API_BASE}/${realmId}/companyinfo/${realmId}`,
            {
              headers: {
                "Authorization": `Bearer ${tokens.access_token}`,
                "Accept": "application/json",
              },
            }
          );
          if (companyInfoRes.ok) {
            const companyInfo = await companyInfoRes.json();
            companyName = companyInfo?.CompanyInfo?.CompanyName || null;
            console.log(`[QuickBooks Auth] Company name: ${companyName}`);
          }
        } catch (e) {
          console.warn("[QuickBooks Auth] Failed to fetch company name:", e);
        }

        // Upsert tokens — supports multiple companies per user via (user_id, realm_id) unique
        const { error: upsertError } = await supabase
          .from("quickbooks_tokens")
          .upsert({
            user_id: userId,
            realm_id: realmId,
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            expires_at: expiresAt,
            token_type: tokens.token_type,
            scope: tokens.scope || "com.intuit.quickbooks.accounting",
            company_name: companyName,
          }, {
            onConflict: "user_id,realm_id",
          });

        if (upsertError) {
          console.error("[QuickBooks Auth] Failed to store tokens:", upsertError);
          return redirectToApp("error=storage_failed");
        }

        console.log(`[QuickBooks Auth] Tokens stored for user ${userId}, realm ${realmId} (${companyName})`);
        return redirectToApp("qb=success");
      } catch (callbackError) {
        console.error("[QuickBooks Auth] Callback error:", callbackError);
        const msg = callbackError instanceof Error ? callbackError.message : "callback_unknown_error";
        return redirectToApp(`error=${encodeURIComponent(msg)}`);
      }
    }

    // ── STATUS: Return ALL connected companies (with auto-refresh) ──
    if (action === "status") {
      const userId = await getUserId();
      if (!userId) return jsonResponse({ connected: false, connections: [] });

      // Resolve all user_ids in the caller's company so any teammate sees
      // QuickBooks as connected once any single member has linked it.
      const { data: companyRows } = await supabase
        .from("company_members")
        .select("company_id")
        .eq("user_id", userId);

      const companyIds = (companyRows ?? []).map((r: { company_id: string }) => r.company_id);
      let memberIds: string[] = [userId];
      if (companyIds.length > 0) {
        const { data: members } = await supabase
          .from("company_members")
          .select("user_id")
          .in("company_id", companyIds);
        const ids = new Set<string>([userId, ...(members ?? []).map((m: { user_id: string }) => m.user_id)]);
        memberIds = Array.from(ids);
      }

      const { data: allTokens } = await supabase
        .from("quickbooks_tokens")
        .select("id, realm_id, company_name, access_token, refresh_token, expires_at, updated_at")
        .in("user_id", memberIds)
        .order("created_at");

      if (!allTokens || allTokens.length === 0) {
        return jsonResponse({ connected: false, connections: [] });
      }

      // Auto-refresh any expired tokens silently
      const connections = [];
      for (const t of allTokens) {
        let isExpired = new Date(t.expires_at) < new Date();

        if (isExpired && t.refresh_token) {
          try {
            console.log(`[QuickBooks Auth] Auto-refreshing expired token for realm ${t.realm_id}`);
            const refreshResponse = await fetch(QB_TOKEN_URL, {
              method: "POST",
              headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Authorization": `Basic ${btoa(`${QUICKBOOKS_CLIENT_ID}:${QUICKBOOKS_CLIENT_SECRET}`)}`,
              },
              body: new URLSearchParams({
                grant_type: "refresh_token",
                refresh_token: t.refresh_token,
              }),
            });

            if (refreshResponse.ok) {
              const newTokens = await refreshResponse.json();
              const newExpiresAt = new Date(Date.now() + newTokens.expires_in * 1000).toISOString();

              await supabase
                .from("quickbooks_tokens")
                .update({
                  access_token: newTokens.access_token,
                  refresh_token: newTokens.refresh_token || t.refresh_token,
                  expires_at: newExpiresAt,
                })
                .eq("id", t.id);

              isExpired = false;
              console.log(`[QuickBooks Auth] Token refreshed successfully for realm ${t.realm_id}`);
            } else {
              console.warn(`[QuickBooks Auth] Token refresh failed for realm ${t.realm_id}: ${refreshResponse.status}`);
            }
          } catch (refreshError) {
            console.warn(`[QuickBooks Auth] Token refresh error for realm ${t.realm_id}:`, refreshError);
          }
        }

        connections.push({
          realmId: t.realm_id,
          companyName: t.company_name,
          isExpired,
          lastSync: t.updated_at,
        });
      }

      return jsonResponse({
        connected: true,
        connections,
        // Backwards compat
        realmId: connections[0].realmId,
        isExpired: connections[0].isExpired,
        lastSync: connections[0].lastSync,
      });
    }

    // ── DISCONNECT: Remove a specific company or all ──
    if (action === "disconnect") {
      const userId = await getUserId();
      if (!userId) return jsonResponse({ error: "Unauthorized" }, 401);

      const realmId = url.searchParams.get("realmId");

      const qbTables = [
        "quickbooks_tokens", "quickbooks_customers", "quickbooks_invoices",
        "quickbooks_payments", "quickbooks_sync_history", "quickbooks_accounts",
        "quickbooks_vendors", "quickbooks_expenses", "quickbooks_bills",
        "quickbooks_purchase_orders", "quickbooks_journal_entries",
        "quickbooks_estimates", "quickbooks_credit_memos",
        "quickbooks_bank_transactions", "quickbooks_reports",
      ];

      if (realmId) {
        for (const table of qbTables) {
          await supabase.from(table).delete().eq("user_id", userId).eq("realm_id", realmId);
        }
        console.log(`[QuickBooks Auth] Disconnected realm ${realmId} for user ${userId}`);
      } else {
        for (const table of qbTables) {
          await supabase.from(table).delete().eq("user_id", userId);
        }
        console.log(`[QuickBooks Auth] Disconnected all for user ${userId}`);
      }

      return jsonResponse({ success: true });
    }

    return jsonResponse({ error: "Invalid action" }, 400);
  } catch (error) {
    console.error("[QuickBooks Auth] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ error: errorMessage }, 500);
  }
});
