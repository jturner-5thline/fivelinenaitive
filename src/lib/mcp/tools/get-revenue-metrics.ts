import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
import { groupAggregate, sum } from "../insights";

type Invoice = {
  id: string;
  realm_id: string | null;
  customer_name: string | null;
  txn_date: string | null;
  total_amt: number | null;
  balance: number | null;
  status: string | null;
};

export default defineTool({
  name: "get_revenue_metrics",
  title: "Get revenue metrics (QuickBooks / Insights financial widgets)",
  description:
    "Return the accounting data behind the Insights financial dashboards: invoiced revenue by month, by customer, and by QuickBooks entity (realm), plus outstanding balances, and the P&L snapshots (income, COGS, gross profit, operating expenses, net operating income) for the requested window. Use from/to to bound the period and realm_id to scope to a single entity.",
  inputSchema: {
    from: z.string().trim().max(40).optional().describe("ISO date lower bound (inclusive) on invoice txn_date / snapshot period."),
    to: z.string().trim().max(40).optional().describe("ISO date upper bound (exclusive)."),
    realm_id: z.string().trim().max(64).optional().describe("QuickBooks entity/realm id to scope to."),
    include_invoices: z.boolean().default(false).describe("Also return the underlying invoice rows."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ from, to, realm_id, include_invoices }, ctx) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    const sb = supabaseForUser(ctx);

    const invoices: Invoice[] = [];
    const pageSize = 1000;
    for (let offset = 0; ; offset += pageSize) {
      let q = sb
        .from("quickbooks_invoices")
        .select("id, realm_id, customer_name, txn_date, total_amt, balance, status")
        .order("txn_date", { ascending: false })
        .range(offset, offset + pageSize - 1);
      if (from) q = q.gte("txn_date", from);
      if (to) q = q.lt("txn_date", to);
      if (realm_id) q = q.eq("realm_id", realm_id);
      const { data, error } = await q;
      if (error) return errorResult(error.message);
      const page = (data ?? []) as unknown as Invoice[];
      invoices.push(...page);
      if (page.length < pageSize) break;
    }

    let pnlQuery = sb
      .from("qbo_pnl_snapshots")
      .select(
        "realm_id, period_start, period_end, accounting_method, income_total, cogs_total, gross_profit, operating_expenses, net_operating_income",
      )
      .order("period_start", { ascending: true })
      .limit(500);
    if (from) pnlQuery = pnlQuery.gte("period_start", from);
    if (to) pnlQuery = pnlQuery.lt("period_end", to);
    if (realm_id) pnlQuery = pnlQuery.eq("realm_id", realm_id);
    const { data: pnl, error: pnlError } = await pnlQuery;
    if (pnlError) return errorResult(pnlError.message);

    const amount = (i: Invoice) => Number(i.total_amt) || 0;
    const payload = {
      timeframe: { from: from ?? null, to: to ?? null, realm_id: realm_id ?? null },
      summary: {
        invoice_count: invoices.length,
        invoiced_total: sum(invoices.map(amount)),
        outstanding_balance: sum(invoices.map((i) => i.balance)),
      },
      by_month: groupAggregate(invoices, (i) => (i.txn_date ?? "").slice(0, 7) || "unknown", amount).sort((a, b) =>
        a.key.localeCompare(b.key),
      ),
      by_customer: groupAggregate(invoices, (i) => i.customer_name ?? "unknown", amount).slice(0, 100),
      by_entity: groupAggregate(invoices, (i) => i.realm_id ?? "unknown", amount),
      pnl_snapshots: pnl ?? [],
      ...(include_invoices ? { invoices } : {}),
    };

    return textResult(payload, payload as unknown as Record<string, unknown>);
  },
});
