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

// All supported sync scopes
const ALL_SCOPES = [
  "customers", "invoices", "payments", "accounts", "vendors",
  "expenses", "bills", "purchase_orders", "journal_entries",
  "estimates", "credit_memos", "bank_deposits", "bank_transfers",
  "profit_and_loss", "cash_flow", "balance_sheet", "ar_aging", "ap_aging",
] as const;

type SyncScope = typeof ALL_SCOPES[number];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const authHeader = req.headers.get("Authorization");
    const internalSecret = req.headers.get("x-internal-secret");
    const xSyncUserId = req.headers.get("x-sync-user-id");
    const token = authHeader ? authHeader.replace("Bearer ", "") : "";
    let userId: string | null = null;
    // Allow internal service-role calls (cron / quickbooks-auto-sync) to act on behalf
    // of a specific user via x-internal-secret + x-sync-user-id. The Lovable Cloud
    // gateway rejects service-role JWTs in the Authorization header, so we use a
    // custom header that carries the same secret.
    if (
      (internalSecret && internalSecret === SUPABASE_SERVICE_ROLE_KEY) ||
      (token && token === SUPABASE_SERVICE_ROLE_KEY)
    ) {
      userId = xSyncUserId;
      if (!userId) {
        return new Response(JSON.stringify({ error: "x-sync-user-id required for internal calls" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else if (authHeader) {
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = user.id;
    } else {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const user = { id: userId } as { id: string };

    const { syncType, realmId: targetRealmId, scopes, start_date, end_date, periods, company_id: requestedCompanyId, accounting_method } = await req.json();
    const activeScopes: SyncScope[] = scopes && Array.isArray(scopes) ? scopes : [...ALL_SCOPES];
    console.log(`[QuickBooks Sync] Starting sync for user ${user.id}, realm: ${targetRealmId || "all"}, scopes: ${activeScopes.join(",")}`);

    // Get stored tokens
    const membershipQuery = supabase
      .from("company_members")
      .select("company_id")
      .eq("user_id", user.id);

    const { data: memberships } = await membershipQuery;
    const memberCompanyIds = (memberships ?? []).map((row) => row.company_id).filter(Boolean);
    const effectiveCompanyId = requestedCompanyId ?? memberCompanyIds[0] ?? null;

    let tokenQuery = supabase
      .from("quickbooks_tokens")
      .select("*");

    if (effectiveCompanyId) {
      tokenQuery = tokenQuery.eq("company_id", effectiveCompanyId);
    } else {
      tokenQuery = tokenQuery.eq("user_id", user.id);
    }

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

    const fallbackCompanyId = effectiveCompanyId;

    const parseAmount = (value: unknown) => {
      const parsed = Number(value ?? 0);
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const extractReportRows = (node: any): any[] => {
      if (!node) return [];
      if (Array.isArray(node)) return node.flatMap((item) => extractReportRows(item));
      const rows = Array.isArray(node?.Rows?.Row) ? node.Rows.Row : [];
      return [node, ...rows.flatMap((row: any) => extractReportRows(row))];
    };

    const getPLSummaryValue = (report: any, targetGroups: string[], targetLabels: string[] = []) => {
      const rows = extractReportRows(report?.Rows?.Row ?? report?.Rows);
      if (!Array.isArray(rows) || rows.length === 0) return 0;
      const normalizedGroups = targetGroups.map((group) => group.toLowerCase());
      const normalizedLabels = targetLabels.map((label) => label.toLowerCase());

      for (const row of rows) {
        const group = String(row?.group ?? "").toLowerCase();
        const label = String(row?.Summary?.ColData?.[0]?.value ?? row?.Header?.ColData?.[0]?.value ?? "").toLowerCase();
        if ((group && normalizedGroups.includes(group)) || (label && normalizedLabels.includes(label))) {
          return parseAmount(row?.Summary?.ColData?.[1]?.value);
        }
      }

      return 0;
    };

    const buildCashFlowPeriods = () => {
      if (start_date && end_date) {
        return [{ start_date, end_date }];
      }
      return [null];
    };

    const buildProfitAndLossPeriods = () => {
      if (Array.isArray(periods) && periods.length > 0) {
        return periods
          .filter((period) => period?.start_date && period?.end_date)
          .map((period) => ({ start_date: period.start_date, end_date: period.end_date }));
      }

      if (start_date && end_date) {
        return [{ start_date, end_date }];
      }

      return [null];
    };

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

      async function fetchQBReport(reportName: string, params: Record<string, string> = {}) {
        const qs = new URLSearchParams(params).toString();
        const url = `${QB_API_BASE}/${realmId}/reports/${reportName}${qs ? "?" + qs : ""}`;
        const response = await fetch(url, {
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Accept": "application/json",
          },
        });
        if (!response.ok) {
          const error = await response.text();
          console.error(`[QuickBooks Sync] Report API error for ${reportName}:`, error);
          throw new Error(`Report API error: ${response.status}`);
        }
        return response.json();
      }

      function shouldSync(scope: SyncScope): boolean {
        if (syncType && syncType !== "all") return syncType === scope;
        return activeScopes.includes(scope);
      }

      async function syncQuery<T>(
        scope: SyncScope,
        qbEntity: string,
        tableName: string,
        mapFn: (item: T) => Record<string, unknown>,
        conflictKey: string = "realm_id,qb_id"
      ) {
        if (!shouldSync(scope)) return;
        try {
          console.log(`[QuickBooks Sync] Fetching ${scope}...`);
          const data = await fetchQBData(`query?query=SELECT * FROM ${qbEntity} MAXRESULTS 1000`);
          const items: T[] = data.QueryResponse?.[qbEntity] || [];
          console.log(`[QuickBooks Sync] Got ${items.length} ${scope} records, upserting in batches...`);
          const now = new Date().toISOString();
          const rows = items.map(item => ({ user_id: user.id, realm_id: realmId, ...mapFn(item), synced_at: now }));
          let synced = 0;
          const BATCH_SIZE = 100;
          for (let i = 0; i < rows.length; i += BATCH_SIZE) {
            const batch = rows.slice(i, i + BATCH_SIZE);
            const { error, count } = await supabase.from(tableName).upsert(batch, { onConflict: conflictKey });
            if (!error) synced += batch.length;
            else console.error(`[QuickBooks Sync] Batch upsert error for ${scope}:`, error.message);
          }
          console.log(`[QuickBooks Sync] ${scope}: synced ${synced}/${items.length}`);
          results[scope] = { synced, errors: items.length - synced };
        } catch (e) {
          console.error(`[QuickBooks Sync] ${scope} sync error:`, e);
          results[scope] = { synced: 0, errors: 1 };
        }
      }

      try {
        // ─── Customers ─────────────────────────────────────
        await syncQuery("customers", "Customer", "quickbooks_customers", (c: any) => ({
          qb_id: c.Id, display_name: c.DisplayName, company_name: c.CompanyName,
          given_name: c.GivenName, family_name: c.FamilyName,
          email: c.PrimaryEmailAddr?.Address, phone: c.PrimaryPhone?.FreeFormNumber,
          balance: c.Balance, active: c.Active, metadata: c,
        }));

        // ─── Invoices ──────────────────────────────────────
        await syncQuery("invoices", "Invoice", "quickbooks_invoices", (inv: any) => ({
          qb_id: inv.Id, doc_number: inv.DocNumber,
          customer_id: inv.CustomerRef?.value, customer_name: inv.CustomerRef?.name,
          txn_date: inv.TxnDate, due_date: inv.DueDate,
          total_amt: inv.TotalAmt, balance: inv.Balance,
          status: inv.Balance === 0 ? "Paid" : inv.DueDate && new Date(inv.DueDate) < new Date() ? "Overdue" : "Open",
          email_status: inv.EmailStatus, metadata: inv,
        }));

        // ─── Payments ──────────────────────────────────────
        await syncQuery("payments", "Payment", "quickbooks_payments", (p: any) => ({
          qb_id: p.Id, customer_id: p.CustomerRef?.value, customer_name: p.CustomerRef?.name,
          txn_date: p.TxnDate, total_amt: p.TotalAmt,
          payment_method: p.PaymentMethodRef?.name, metadata: p,
        }));

        // ─── Chart of Accounts ─────────────────────────────
        await syncQuery("accounts", "Account", "quickbooks_accounts", (a: any) => ({
          qb_id: a.Id, name: a.Name, account_type: a.AccountType,
          account_sub_type: a.AccountSubType, classification: a.Classification,
          current_balance: a.CurrentBalance, currency_ref: a.CurrencyRef?.value,
          active: a.Active, fully_qualified_name: a.FullyQualifiedName,
          description: a.Description, metadata: a,
        }));

        // ─── Vendors ───────────────────────────────────────
        await syncQuery("vendors", "Vendor", "quickbooks_vendors", (v: any) => ({
          qb_id: v.Id, display_name: v.DisplayName, company_name: v.CompanyName,
          given_name: v.GivenName, family_name: v.FamilyName,
          email: v.PrimaryEmailAddr?.Address, phone: v.PrimaryPhone?.FreeFormNumber,
          balance: v.Balance, active: v.Active, metadata: v,
        }));

        // ─── Expenses (Purchase) ───────────────────────────
        await syncQuery("expenses", "Purchase", "quickbooks_expenses", (e: any) => ({
          qb_id: e.Id, txn_date: e.TxnDate, total_amt: e.TotalAmt,
          account_ref_id: e.AccountRef?.value, account_ref_name: e.AccountRef?.name,
          vendor_ref_id: e.EntityRef?.value, vendor_ref_name: e.EntityRef?.name,
          payment_type: e.PaymentType, doc_number: e.DocNumber,
          private_note: e.PrivateNote, line_items: e.Line, metadata: e,
        }));

        // ─── Bills ─────────────────────────────────────────
        await syncQuery("bills", "Bill", "quickbooks_bills", (b: any) => ({
          qb_id: b.Id, vendor_ref_id: b.VendorRef?.value, vendor_ref_name: b.VendorRef?.name,
          txn_date: b.TxnDate, due_date: b.DueDate,
          total_amt: b.TotalAmt, balance: b.Balance,
          doc_number: b.DocNumber, private_note: b.PrivateNote,
          line_items: b.Line, metadata: b,
        }));

        // ─── Purchase Orders ───────────────────────────────
        await syncQuery("purchase_orders", "PurchaseOrder", "quickbooks_purchase_orders", (po: any) => ({
          qb_id: po.Id, vendor_ref_id: po.VendorRef?.value, vendor_ref_name: po.VendorRef?.name,
          txn_date: po.TxnDate, total_amt: po.TotalAmt,
          doc_number: po.DocNumber, status: po.POStatus,
          line_items: po.Line, metadata: po,
        }));

        // ─── Journal Entries ───────────────────────────────
        await syncQuery("journal_entries", "JournalEntry", "quickbooks_journal_entries", (je: any) => ({
          qb_id: je.Id, txn_date: je.TxnDate, doc_number: je.DocNumber,
          total_amt: je.TotalAmt, adjustment: je.Adjustment,
          private_note: je.PrivateNote, line_items: je.Line, metadata: je,
        }));

        // ─── Estimates ─────────────────────────────────────
        await syncQuery("estimates", "Estimate", "quickbooks_estimates", (est: any) => ({
          qb_id: est.Id, customer_ref_id: est.CustomerRef?.value, customer_ref_name: est.CustomerRef?.name,
          txn_date: est.TxnDate, expiration_date: est.ExpirationDate,
          total_amt: est.TotalAmt, doc_number: est.DocNumber,
          txn_status: est.TxnStatus, line_items: est.Line, metadata: est,
        }));

        // ─── Credit Memos ──────────────────────────────────
        await syncQuery("credit_memos", "CreditMemo", "quickbooks_credit_memos", (cm: any) => ({
          qb_id: cm.Id, customer_ref_id: cm.CustomerRef?.value, customer_ref_name: cm.CustomerRef?.name,
          txn_date: cm.TxnDate, total_amt: cm.TotalAmt, balance: cm.Balance,
          doc_number: cm.DocNumber, line_items: cm.Line, metadata: cm,
        }));

        // ─── Bank Deposits ─────────────────────────────────
        if (shouldSync("bank_deposits")) {
          try {
            const data = await fetchQBData("query?query=SELECT * FROM Deposit MAXRESULTS 1000");
            const items = data.QueryResponse?.Deposit || [];
            const now = new Date().toISOString();
            const rows = items.map((d: any) => ({
              user_id: user.id, realm_id: realmId, qb_id: d.Id, txn_type: "Deposit",
              txn_date: d.TxnDate, total_amt: d.TotalAmt,
              account_ref_id: d.DepositToAccountRef?.value,
              account_ref_name: d.DepositToAccountRef?.name,
              private_note: d.PrivateNote, line_items: d.Line, metadata: d,
              synced_at: now,
            }));
            let synced = 0;
            const BATCH_SIZE = 100;
            for (let i = 0; i < rows.length; i += BATCH_SIZE) {
              const batch = rows.slice(i, i + BATCH_SIZE);
              const { error } = await supabase.from("quickbooks_bank_transactions").upsert(batch, { onConflict: "realm_id,qb_id,txn_type" });
              if (!error) synced += batch.length;
              else console.error("[QuickBooks Sync] Bank deposit batch error:", error.message);
            }
            results.bank_deposits = { synced, errors: items.length - synced };
          } catch (e) {
            console.error("[QuickBooks Sync] Bank deposit sync error:", e);
            results.bank_deposits = { synced: 0, errors: 1 };
          }
        }

        // ─── Bank Transfers ────────────────────────────────
        if (shouldSync("bank_transfers")) {
          try {
            const data = await fetchQBData("query?query=SELECT * FROM Transfer MAXRESULTS 1000");
            const items = data.QueryResponse?.Transfer || [];
            const now = new Date().toISOString();
            const rows = items.map((t: any) => ({
              user_id: user.id, realm_id: realmId, qb_id: t.Id, txn_type: "Transfer",
              txn_date: t.TxnDate, total_amt: t.Amount,
              account_ref_id: t.FromAccountRef?.value,
              account_ref_name: t.FromAccountRef?.name,
              private_note: t.PrivateNote, metadata: t,
              synced_at: now,
            }));
            let synced = 0;
            const BATCH_SIZE = 100;
            for (let i = 0; i < rows.length; i += BATCH_SIZE) {
              const batch = rows.slice(i, i + BATCH_SIZE);
              const { error } = await supabase.from("quickbooks_bank_transactions").upsert(batch, { onConflict: "realm_id,qb_id,txn_type" });
              if (!error) synced += batch.length;
              else console.error("[QuickBooks Sync] Bank transfer batch error:", error.message);
            }
            results.bank_transfers = { synced, errors: items.length - synced };
          } catch (e) {
            console.error("[QuickBooks Sync] Bank transfer sync error:", e);
            results.bank_transfers = { synced: 0, errors: 1 };
          }
        }

        // ─── Reports: Profit & Loss ────────────────────────
        if (shouldSync("profit_and_loss")) {
          try {
            const plPeriods = buildProfitAndLossPeriods();
            let synced = 0;
            let errors = 0;

            for (const period of plPeriods) {
              try {
                const plParams: Record<string, string> = period
                  ? {
                      accounting_method: "Accrual",
                      start_date: period.start_date,
                      end_date: period.end_date,
                    }
                  : {
                      accounting_method: "Accrual",
                      date_macro: "This Fiscal Year-to-date",
                    };

                const report = await fetchQBReport("ProfitAndLoss", plParams);
                const resolvedStart = period?.start_date ?? report.Header?.StartPeriod;
                const resolvedEnd = period?.end_date ?? report.Header?.EndPeriod;
                const reportDate = new Date().toISOString().split("T")[0];

                await supabase.from("quickbooks_reports").insert({
                  user_id: user.id, realm_id: realmId, report_type: "profit_and_loss",
                  report_date: reportDate,
                  period_start: resolvedStart, period_end: resolvedEnd,
                  report_data: report, metadata: { header: report.Header, accounting_method: "Accrual" },
                });

                if (resolvedStart && resolvedEnd && fallbackCompanyId) {
                  const incomeTotal = getPLSummaryValue(report, ["Income"], ["Total Income", "Total for Income"]);
                  const cogsTotal = getPLSummaryValue(report, ["COGS"], ["Total Cost of Goods Sold"]);
                  const grossProfit = getPLSummaryValue(report, ["GrossProfit"], ["Gross Profit"]);
                  const operatingExpenses = getPLSummaryValue(report, ["Expenses"], ["Total Expenses"]);
                  console.log(`[QuickBooks Sync] [qbo.pnl.fetch] ${realmId} ${resolvedStart}..${resolvedEnd}`, JSON.stringify({
                    params: plParams,
                    incomeTotal,
                    cogsTotal,
                    grossProfit,
                    operatingExpenses,
                    header: report?.Header,
                  }));

                  const { error: snapshotError } = await supabase
                    .from("qbo_pnl_snapshots")
                    .upsert({
                      company_id: fallbackCompanyId,
                      user_id: user.id,
                      realm_id: realmId,
                      period_start: resolvedStart,
                      period_end: resolvedEnd,
                      accounting_method: "Accrual",
                      income_total: incomeTotal,
                      cogs_total: cogsTotal,
                      gross_profit: grossProfit,
                      operating_expenses: operatingExpenses,
                      raw_response: report,
                      fetched_at: new Date().toISOString(),
                    }, { onConflict: "company_id,realm_id,period_start,period_end,accounting_method" });

                  if (snapshotError) {
                    throw snapshotError;
                  }
                }

                synced += 1;
              } catch (periodError) {
                console.error("[QuickBooks Sync] P&L period sync error:", periodError);
                errors += 1;
              }
            }

            results.profit_and_loss = { synced, errors };
          } catch (e) {
            console.error("[QuickBooks Sync] P&L report sync error:", e);
            results.profit_and_loss = { synced: 0, errors: 1 };
          }
        }

        if (shouldSync("cash_flow")) {
          try {
            const cfPeriods = buildCashFlowPeriods();
            let synced = 0;
            let errors = 0;

            for (const period of cfPeriods) {
              try {
                const cfParams: Record<string, string> = period
                  ? {
                      accounting_method: accounting_method || "Accrual",
                      start_date: period.start_date,
                      end_date: period.end_date,
                      summarize_column_by: "Month",
                    }
                  : {
                      accounting_method: accounting_method || "Accrual",
                      date_macro: "This Fiscal Year-to-date",
                      summarize_column_by: "Month",
                    };

                const report = await fetchQBReport("CashFlow", cfParams);
                const resolvedStart = period?.start_date ?? report.Header?.StartPeriod;
                const resolvedEnd = period?.end_date ?? report.Header?.EndPeriod;
                const reportDate = new Date().toISOString().split("T")[0];

                await supabase.from("quickbooks_reports").insert({
                  user_id: user.id, realm_id: realmId, report_type: "cash_flow",
                  report_date: reportDate,
                  period_start: resolvedStart, period_end: resolvedEnd,
                  report_data: report, metadata: { header: report.Header, accounting_method: accounting_method || "Accrual" },
                });

                if (resolvedStart && resolvedEnd && fallbackCompanyId) {
                  const rows = Array.isArray(report?.Rows?.Row) ? report.Rows.Row : [];
                  const columns = Array.isArray(report?.Columns?.Column) ? report.Columns.Column : [];
                  const monthColumns = columns
                    .map((column: any, index: number) => ({ column, index }))
                    .filter(({ index, column }) => index > 0 && column?.ColType === "Money" && column?.ColTitle);

                  const netRow = extractReportRows(rows).find((row: any) => String(row?.group ?? "").toLowerCase() === "netcashprovidedbyoperatingactivities")
                    ?? extractReportRows(rows).find((row: any) => String(row?.Summary?.ColData?.[0]?.value ?? row?.Header?.ColData?.[0]?.value ?? "").toLowerCase().includes("net change in cash"))
                    ?? extractReportRows(rows).find((row: any) => String(row?.Summary?.ColData?.[0]?.value ?? row?.Header?.ColData?.[0]?.value ?? "").toLowerCase().includes("net cash provided by operating activities"));

                  const upsertRows = monthColumns.map(({ column, index }: any) => {
                    const title = String(column?.ColTitle ?? "").trim();
                    const start = title ? `${title}-01` : resolvedStart;
                    const date = new Date(`${start}T00:00:00`);
                    const bucketStart = Number.isNaN(date.getTime()) ? resolvedStart : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
                    const bucketEndDate = Number.isNaN(date.getTime()) ? new Date(`${resolvedEnd}T00:00:00`) : new Date(date.getFullYear(), date.getMonth() + 1, 0);
                    const bucketEnd = `${bucketEndDate.getFullYear()}-${String(bucketEndDate.getMonth() + 1).padStart(2, '0')}-${String(bucketEndDate.getDate()).padStart(2, '0')}`;
                    const value = parseAmount(netRow?.Summary?.ColData?.[index]?.value ?? netRow?.ColData?.[index]?.value);

                    return {
                      company_id: fallbackCompanyId,
                      user_id: user.id,
                      realm_id: realmId,
                      period_start: resolvedStart,
                      period_end: resolvedEnd,
                      accounting_method: accounting_method || "Accrual",
                      bucket_start: bucketStart,
                      bucket_end: bucketEnd,
                      bucket_label: title || bucketStart,
                      net_cash_flow: value,
                      raw_response: report,
                      fetched_at: new Date().toISOString(),
                    };
                  });

                  if (upsertRows.length > 0) {
                    const { error: cashflowSnapshotError } = await supabase
                      .from("qbo_cashflow_snapshots")
                      .upsert(upsertRows, { onConflict: "company_id,realm_id,period_start,period_end,accounting_method,bucket_start,bucket_end" });

                    if (cashflowSnapshotError) throw cashflowSnapshotError;
                  }
                }

                synced += 1;
              } catch (periodError) {
                console.error("[QuickBooks Sync] CashFlow period sync error:", periodError);
                errors += 1;
              }
            }

            results.cash_flow = { synced, errors };
          } catch (e) {
            console.error("[QuickBooks Sync] CashFlow report sync error:", e);
            results.cash_flow = { synced: 0, errors: 1 };
          }
        }

        // ─── Reports: Balance Sheet ────────────────────────
        if (shouldSync("balance_sheet")) {
          try {
            const bsParams: Record<string, string> = start_date && end_date
              ? { start_date: end_date, end_date } // BS is point-in-time, use end_date as the "as of" date
              : { date_macro: "Today" };
            const report = await fetchQBReport("BalanceSheet", bsParams);
            await supabase.from("quickbooks_reports").insert({
              user_id: user.id, realm_id: realmId, report_type: "balance_sheet",
              report_date: new Date().toISOString().split("T")[0],
              period_start: report.Header?.StartPeriod, period_end: report.Header?.EndPeriod,
              report_data: report, metadata: { header: report.Header },
            });
            results.balance_sheet = { synced: 1, errors: 0 };
          } catch (e) {
            console.error("[QuickBooks Sync] Balance Sheet sync error:", e);
            results.balance_sheet = { synced: 0, errors: 1 };
          }
        }

        // ─── Reports: AR Aging ─────────────────────────────
        if (shouldSync("ar_aging")) {
          try {
            const report = await fetchQBReport("AgedReceivables");
            await supabase.from("quickbooks_reports").insert({
              user_id: user.id, realm_id: realmId, report_type: "ar_aging",
              report_date: new Date().toISOString().split("T")[0],
              report_data: report, metadata: { header: report.Header },
            });
            results.ar_aging = { synced: 1, errors: 0 };
          } catch (e) {
            console.error("[QuickBooks Sync] AR Aging sync error:", e);
            results.ar_aging = { synced: 0, errors: 1 };
          }
        }

        // ─── Reports: AP Aging ─────────────────────────────
        if (shouldSync("ap_aging")) {
          try {
            const report = await fetchQBReport("AgedPayables");
            await supabase.from("quickbooks_reports").insert({
              user_id: user.id, realm_id: realmId, report_type: "ap_aging",
              report_date: new Date().toISOString().split("T")[0],
              report_data: report, metadata: { header: report.Header },
            });
            results.ap_aging = { synced: 1, errors: 0 };
          } catch (e) {
            console.error("[QuickBooks Sync] AP Aging sync error:", e);
            results.ap_aging = { synced: 0, errors: 1 };
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
