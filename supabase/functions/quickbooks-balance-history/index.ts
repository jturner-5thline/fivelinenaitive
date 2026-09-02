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

const QB_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const QB_API_BASE = "https://quickbooks.api.intuit.com/v3/company";

/**
 * Fetch trailing balance-sheet snapshots directly from QuickBooks, as-of each
 * caller-supplied date. This is what powers the Liabilities & Debt Service
 * drilldown so per-month balances are exact (not the stored sync snapshots,
 * which are only captured when a sync happens to run and therefore drift for
 * historical month-ends).
 *
 * Request body: { realmId: string, asOfDates: string[] (YYYY-MM-DD),
 *                 accounting_method?: "Accrual" | "Cash" }
 * Response: { results: Array<{ asOf: string, report: any | null, error?: string }> }
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { realmId, asOfDates, accounting_method } = await req.json();
    if (!realmId || !Array.isArray(asOfDates) || asOfDates.length === 0) {
      return new Response(JSON.stringify({ error: "realmId and asOfDates are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load token for realm. quickbooks_tokens is shared per company, so any
    // member of the company can read balances via this realm.
    const { data: tokenRows } = await supabase
      .from("quickbooks_tokens")
      .select("*")
      .eq("realm_id", realmId)
      .limit(1);
    let tokenData = tokenRows?.[0];
    if (!tokenData) {
      return new Response(JSON.stringify({ error: "QuickBooks not connected for realm" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Refresh access token if expired.
    let accessToken = tokenData.access_token;
    if (new Date(tokenData.expires_at) < new Date()) {
      const refreshResponse = await fetch(QB_TOKEN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Authorization": `Basic ${btoa(`${QUICKBOOKS_CLIENT_ID}:${QUICKBOOKS_CLIENT_SECRET}`)}`,
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: tokenData.refresh_token,
        }),
      });
      if (!refreshResponse.ok) {
        const err = await refreshResponse.text();
        console.error("[qbo-balance-history] refresh failed:", err);
        return new Response(JSON.stringify({ error: "QuickBooks token refresh failed" }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const newTokens = await refreshResponse.json();
      accessToken = newTokens.access_token;
      await supabase.from("quickbooks_tokens").update({
        access_token: newTokens.access_token,
        refresh_token: newTokens.refresh_token || tokenData.refresh_token,
        expires_at: new Date(Date.now() + newTokens.expires_in * 1000).toISOString(),
      }).eq("id", tokenData.id);
    }

    // Fetch balance sheet as-of each supplied date. QBO's BalanceSheet is
    // point-in-time — pass the same date as start_date and end_date so the
    // report resolves to a true "as of <date>" snapshot.
    const dates: string[] = asOfDates.slice(0, 36);
    const results: Array<{ asOf: string; report: any | null; error?: string }> = new Array(dates.length);

    const fetchOne = async (asOf: string, index: number) => {
      const params = new URLSearchParams({
        start_date: asOf,
        end_date: asOf,
        accounting_method: accounting_method || "Accrual",
      });
      const url = `${QB_API_BASE}/${realmId}/reports/BalanceSheet?${params.toString()}`;
      try {
        const res = await fetch(url, {
          headers: { "Authorization": `Bearer ${accessToken}`, "Accept": "application/json" },
          signal: AbortSignal.timeout(20_000),
        });
        if (!res.ok) {
          const errText = await res.text();
          console.error(`[qbo-balance-history] BS ${asOf} failed:`, errText);
          results[index] = { asOf, report: null, error: `HTTP ${res.status}` };
          return;
        }
        results[index] = { asOf, report: await res.json() };
      } catch (e) {
        console.error(`[qbo-balance-history] BS ${asOf} exception:`, e);
        results[index] = { asOf, report: null, error: String(e) };
      }
    };

    // Bounded concurrency — QBO rate-limits ~500 req/min per realm, but 6 in
    // flight keeps us well inside the 150s edge idle timeout for 36 months.
    const CONCURRENCY = 6;
    let cursor = 0;
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, dates.length) }, async () => {
        while (cursor < dates.length) {
          const i = cursor++;
          await fetchOne(dates[i], i);
        }
      }),
    );

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[qbo-balance-history] fatal:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});