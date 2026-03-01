import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { syncType, realmId: targetRealmId } = await req.json();
    console.log(`[QuickBooks Sync] Starting ${syncType || "all"} sync for user ${user.id}, realm: ${targetRealmId || "all"}`);

    // Get stored tokens — either for a specific realm or all
    let tokenQuery = supabase
      .from("quickbooks_tokens")
      .select("*")
      .eq("user_id", user.id);

    if (targetRealmId) {
      tokenQuery = tokenQuery.eq("realm_id", targetRealmId);
    }

    const { data: tokenRows, error: tokenError } = await tokenQuery;

    if (tokenError || !tokenRows || tokenRows.length === 0) {
      return new Response(JSON.stringify({ error: "QuickBooks not connected" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const allResults: Record<string, Record<string, { synced: number; errors: number }>> = {};

    for (const tokenData of tokenRows) {
      const realmId = tokenData.realm_id;
      const companyLabel = tokenData.company_name || realmId;
      console.log(`[QuickBooks Sync] Syncing company: ${companyLabel} (${realmId})`);

      // Refresh token if expired
      let accessToken = tokenData.access_token;
      if (new Date(tokenData.expires_at) < new Date()) {
        console.log("[QuickBooks Sync] Token expired, refreshing...");
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
          console.error(`[QuickBooks Sync] Token refresh failed for realm ${realmId}`);
          allResults[companyLabel] = { _error: { synced: 0, errors: 1 } };
          continue;
        }

        const newTokens = await refreshResponse.json();
        accessToken = newTokens.access_token;

        await supabase
          .from("quickbooks_tokens")
          .update({
            access_token: newTokens.access_token,
            refresh_token: newTokens.refresh_token || tokenData.refresh_token,
            expires_at: new Date(Date.now() + newTokens.expires_in * 1000).toISOString(),
          })
          .eq("id", tokenData.id);
      }

      const results: Record<string, { synced: number; errors: number }> = {};

      // Create sync history record
      const { data: syncRecord } = await supabase
        .from("quickbooks_sync_history")
        .insert({
          user_id: user.id,
          realm_id: realmId,
          sync_type: syncType || "all",
          status: "running",
        })
        .select()
        .single();

      const syncId = syncRecord?.id;

      async function fetchQBData(endpoint: string) {
        const response = await fetch(`${QB_API_BASE}/${realmId}/${endpoint}`, {
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Accept": "application/json",
          },
        });
        if (!response.ok) {
          const error = await response.text();
          console.error(`[QuickBooks Sync] API error for ${endpoint}:`, error);
          throw new Error(`API error: ${response.status}`);
        }
        return response.json();
      }

      try {
        // Sync Customers
        if (!syncType || syncType === "customers" || syncType === "all") {
          try {
            const customersData = await fetchQBData("query?query=SELECT * FROM Customer MAXRESULTS 1000");
            const customers = customersData.QueryResponse?.Customer || [];
            let synced = 0;
            for (const customer of customers) {
              const { error } = await supabase.from("quickbooks_customers").upsert({
                user_id: user.id, realm_id: realmId, qb_id: customer.Id,
                display_name: customer.DisplayName, company_name: customer.CompanyName,
                given_name: customer.GivenName, family_name: customer.FamilyName,
                email: customer.PrimaryEmailAddr?.Address, phone: customer.PrimaryPhone?.FreeFormNumber,
                balance: customer.Balance, active: customer.Active, metadata: customer,
                synced_at: new Date().toISOString(),
              }, { onConflict: "realm_id,qb_id" });
              if (!error) synced++;
            }
            results.customers = { synced, errors: customers.length - synced };
          } catch (e) {
            console.error("[QuickBooks Sync] Customer sync error:", e);
            results.customers = { synced: 0, errors: 1 };
          }
        }

        // Sync Invoices
        if (!syncType || syncType === "invoices" || syncType === "all") {
          try {
            const invoicesData = await fetchQBData("query?query=SELECT * FROM Invoice MAXRESULTS 1000");
            const invoices = invoicesData.QueryResponse?.Invoice || [];
            let synced = 0;
            for (const invoice of invoices) {
              const { error } = await supabase.from("quickbooks_invoices").upsert({
                user_id: user.id, realm_id: realmId, qb_id: invoice.Id,
                doc_number: invoice.DocNumber, customer_id: invoice.CustomerRef?.value,
                customer_name: invoice.CustomerRef?.name, txn_date: invoice.TxnDate,
                due_date: invoice.DueDate, total_amt: invoice.TotalAmt, balance: invoice.Balance,
                status: invoice.Balance === 0 ? "Paid" : invoice.DueDate && new Date(invoice.DueDate) < new Date() ? "Overdue" : "Open",
                email_status: invoice.EmailStatus, metadata: invoice,
                synced_at: new Date().toISOString(),
              }, { onConflict: "realm_id,qb_id" });
              if (!error) synced++;
            }
            results.invoices = { synced, errors: invoices.length - synced };
          } catch (e) {
            console.error("[QuickBooks Sync] Invoice sync error:", e);
            results.invoices = { synced: 0, errors: 1 };
          }
        }

        // Sync Payments
        if (!syncType || syncType === "payments" || syncType === "all") {
          try {
            const paymentsData = await fetchQBData("query?query=SELECT * FROM Payment MAXRESULTS 1000");
            const payments = paymentsData.QueryResponse?.Payment || [];
            let synced = 0;
            for (const payment of payments) {
              const { error } = await supabase.from("quickbooks_payments").upsert({
                user_id: user.id, realm_id: realmId, qb_id: payment.Id,
                customer_id: payment.CustomerRef?.value, customer_name: payment.CustomerRef?.name,
                txn_date: payment.TxnDate, total_amt: payment.TotalAmt,
                payment_method: payment.PaymentMethodRef?.name, metadata: payment,
                synced_at: new Date().toISOString(),
              }, { onConflict: "realm_id,qb_id" });
              if (!error) synced++;
            }
            results.payments = { synced, errors: payments.length - synced };
          } catch (e) {
            console.error("[QuickBooks Sync] Payment sync error:", e);
            results.payments = { synced: 0, errors: 1 };
          }
        }

        const totalSynced = Object.values(results).reduce((acc, r) => acc + r.synced, 0);
        const hasErrors = Object.values(results).some(r => r.errors > 0);

        if (syncId) {
          await supabase.from("quickbooks_sync_history").update({
            status: hasErrors ? "partial" : "success",
            records_synced: totalSynced,
            completed_at: new Date().toISOString(),
          }).eq("id", syncId);
        }

        allResults[companyLabel] = results;
      } catch (error) {
        console.error(`[QuickBooks Sync] Sync error for ${companyLabel}:`, error);
        if (syncId) {
          await supabase.from("quickbooks_sync_history").update({
            status: "failed",
            error_message: error instanceof Error ? error.message : "Unknown error",
            completed_at: new Date().toISOString(),
          }).eq("id", syncId);
        }
        allResults[companyLabel] = { _error: { synced: 0, errors: 1 } };
      }
    }

    // Flatten results for backwards compat if single company
    const companyKeys = Object.keys(allResults);
    const flatResults = companyKeys.length === 1 ? allResults[companyKeys[0]] : undefined;
    const totalSynced = Object.values(allResults).reduce(
      (acc, companyResults) => acc + Object.values(companyResults).reduce((a, r) => a + r.synced, 0), 0
    );

    return new Response(JSON.stringify({
      success: true,
      results: flatResults || allResults,
      companiesResults: allResults,
      totalSynced,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[QuickBooks Sync] Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
