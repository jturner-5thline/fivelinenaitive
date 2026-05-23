import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import {
  FINSERV_REALM_ID,
  FINSERV_PIPELINE_ID,
  ACTIVE_CLIENT_STAGE,
} from '@/hooks/useFinServFinancialMetrics';
import {
  InsightsDrilldownDrawer,
  type DrilldownContext,
} from '@/components/metrics/insights/InsightsDrilldownDrawer';

// ────────────────────────────────────────────────────────────
// Public types
// ────────────────────────────────────────────────────────────

export type DrilldownKind =
  | 'pnl'           // Total Revenue, GP$, GP%, OP$, OP% — payload.metric tells which
  | 'cashflow'      // Statement of Cash Flows breakdown
  | 'active-clients'// Deals in Active Client stage at end of period
  | 'avg-revenue'   // Avg Revenue / Client (period revenue + denominator clients)
  | 'client-series' // Per-client monthly revenue series
  | 'value';        // Generic single value (fallback)

export interface DrilldownRequest {
  kind: DrilldownKind;
  sourceLabel: string;
  selection: string;
  /** Resolved period start/end the user clicked (ymd). */
  period: { start: string; end: string; label: string };
  /** Granularity of the surrounding board. */
  granularity?: 'monthly' | 'quarterly' | 'yearly';
  /** Per-kind extras. */
  metric?: 'revenue' | 'gross_profit' | 'gross_margin' | 'operating_profit' | 'operating_margin';
  client?: string;
  /** QuickBooks realm id (defaults to FinServ when omitted). */
  realm?: string;
  /** Optional QBO deep link rendered above the body. */
  externalLink?: { href: string; label: string };
  /** Optional generic rows for kind='value'. */
  rows?: Array<{ metric: string; value: string }>;
}

interface DrilldownContextValue {
  open: (req: DrilldownRequest) => void;
}

const Ctx = createContext<DrilldownContextValue | null>(null);

export function useDrilldown() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useDrilldown must be used inside <DrilldownProvider>');
  return ctx;
}

// ────────────────────────────────────────────────────────────
// Formatters
// ────────────────────────────────────────────────────────────

const fmtUsd = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
const fmtUsdSigned = (v: number) => `${v >= 0 ? '+' : ''}${fmtUsd(v)}`;
const fmtPct = (v: number) => `${v.toFixed(1)}%`;

// QBO deep links
function qboPnlLink(start: string, end: string) {
  return `https://qbo.intuit.com/app/report/builder?rptId=sbg:c46c823a-8641-4641-b08a-dda0e499066f&type=system&token=PANDL&start_date=${start}&end_date=${end}`;
}
function qboCashflowLink(start: string, end: string) {
  return `https://qbo.intuit.com/app/report/builder?rptId=sbg:be53cbb0-d2cd-4e59-abf5-5755e22c8c5f&type=system&token=CASH_FLOW&start_date=${start}&end_date=${end}`;
}

// ────────────────────────────────────────────────────────────
// Provider
// ────────────────────────────────────────────────────────────

export function DrilldownProvider({ children }: { children: React.ReactNode }) {
  const [req, setReq] = useState<DrilldownRequest | null>(null);
  const open = useCallback((r: DrilldownRequest) => setReq(r), []);
  const close = useCallback(() => setReq(null), []);

  const value = useMemo(() => ({ open }), [open]);

  const context: DrilldownContext | null = req
    ? {
        sourceId: `drilldown:${req.kind}`,
        sourceLabel: req.sourceLabel,
        selection: req.selection,
        periodLabel: req.period.label,
      }
    : null;

  return (
    <Ctx.Provider value={value}>
      {children}
      <InsightsDrilldownDrawer
        open={!!req}
        onClose={close}
        context={context}
        columns={[]}
        rows={[]}
        body={req ? <DrilldownBody req={req} /> : null}
      />
    </Ctx.Provider>
  );
}

// ────────────────────────────────────────────────────────────
// Body router
// ────────────────────────────────────────────────────────────

function DrilldownBody({ req }: { req: DrilldownRequest }) {
  switch (req.kind) {
    case 'pnl':
      return <PnlBreakdownView req={req} />;
    case 'cashflow':
      return <CashflowBreakdownView req={req} />;
    case 'active-clients':
      return <ActiveClientsView req={req} />;
    case 'avg-revenue':
      return <AvgRevenueView req={req} />;
    case 'client-series':
      return <ClientSeriesView req={req} />;
    case 'value':
    default:
      return <ValueRowsView req={req} />;
  }
}

// ────────────────────────────────────────────────────────────
// Small UI atoms (inherit the drawer's dark palette via inline style)
// ────────────────────────────────────────────────────────────

const sectionStyle: React.CSSProperties = {
  padding: '12px 18px',
  borderBottom: '1px solid rgba(120,170,255,0.12)',
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.10em', color: 'rgba(160,200,255,0.6)', marginBottom: 6 }}>
      {children}
    </div>
  );
}

function ExternalLinkBtn({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12,
        padding: '6px 10px', borderRadius: 6,
        background: 'rgba(80,140,255,0.14)', color: 'rgba(220,235,255,0.95)',
        border: '1px solid rgba(120,170,255,0.28)', textDecoration: 'none',
      }}
    >
      {label} <ExternalLink size={12} />
    </a>
  );
}

function Spinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 28 }}>
      <div className="h-5 w-5 rounded-full border-2 border-current border-t-transparent animate-spin" style={{ opacity: 0.6 }} />
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return (
    <div style={{ padding: 28, textAlign: 'center', color: 'rgba(180,200,230,0.65)', fontSize: 12 }}>{msg}</div>
  );
}

function Table({ rows }: { rows: Array<{ label: string; value: string; pct?: string; muted?: boolean; bold?: boolean }> }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} style={{ borderBottom: '1px solid rgba(120,170,255,0.08)' }}>
            <td style={{ padding: '8px 18px', color: r.muted ? 'rgba(180,200,230,0.65)' : '#dde8f8', fontWeight: r.bold ? 600 : 400 }}>{r.label}</td>
            {r.pct !== undefined && (
              <td style={{ padding: '8px 8px', textAlign: 'right', color: 'rgba(180,200,230,0.65)', fontSize: 12, width: 70 }}>{r.pct}</td>
            )}
            <td style={{ padding: '8px 18px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: r.muted ? 'rgba(180,200,230,0.65)' : '#dde8f8', fontWeight: r.bold ? 600 : 400 }}>{r.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ────────────────────────────────────────────────────────────
// P&L breakdown
// ────────────────────────────────────────────────────────────

type PnlRow = { account: string; amount: number };
type PnlBreakdown = {
  income: PnlRow[];
  cogs: PnlRow[];
  expenses: PnlRow[];
  totals: { income: number; cogs: number; gross_profit: number; opex: number; net_operating_income: number };
};

function walkLeaves(node: any, into: PnlRow[]) {
  if (!node) return;
  if (Array.isArray(node)) {
    node.forEach((n) => walkLeaves(n, into));
    return;
  }
  if (node.type === 'Data' && Array.isArray(node.ColData)) {
    const label = String(node.ColData[0]?.value ?? '').trim();
    const amt = Number(node.ColData[1]?.value ?? 0);
    if (label) into.push({ account: label, amount: amt });
  }
  if (node.Rows?.Row) walkLeaves(node.Rows.Row, into);
}

function parsePnlSnapshot(raw: any): PnlBreakdown {
  const empty: PnlBreakdown = {
    income: [], cogs: [], expenses: [],
    totals: { income: 0, cogs: 0, gross_profit: 0, opex: 0, net_operating_income: 0 },
  };
  if (!raw?.Rows?.Row) return empty;

  const groupRows = (raw.Rows.Row as any[]).filter(Boolean);
  const findGroup = (g: string) => groupRows.find((r) => String(r?.group ?? '').toLowerCase() === g.toLowerCase());
  const sumLeaves = (root: any) => {
    const acc: PnlRow[] = [];
    walkLeaves(root, acc);
    return acc;
  };

  const incomeGroup = findGroup('Income');
  const cogsGroup = findGroup('COGS') || findGroup('CostOfGoodsSold');
  const expensesGroup = findGroup('Expenses');
  const grossProfit = findGroup('GrossProfit');
  const noi = findGroup('NetOperatingIncome');

  const income = incomeGroup ? sumLeaves(incomeGroup) : [];
  const cogs = cogsGroup ? sumLeaves(cogsGroup) : [];
  const expenses = expensesGroup ? sumLeaves(expensesGroup) : [];

  const totalFromSummary = (g: any) => Number(g?.Summary?.ColData?.[1]?.value ?? 0);

  return {
    income, cogs, expenses,
    totals: {
      income: totalFromSummary(incomeGroup),
      cogs: totalFromSummary(cogsGroup),
      gross_profit: totalFromSummary(grossProfit),
      opex: totalFromSummary(expensesGroup),
      net_operating_income: totalFromSummary(noi),
    },
  };
}

function PnlBreakdownView({ req }: { req: DrilldownRequest }) {
  const { company } = useCompany();
  const { data, isLoading } = useQuery({
    queryKey: ['drilldown-pnl', company?.id, req.period.start, req.period.end],
    enabled: !!company?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('qbo_pnl_snapshots')
        .select('raw_response')
        .eq('company_id', company!.id)
        .eq('realm_id', FINSERV_REALM_ID)
        .eq('accounting_method', 'Accrual')
        .eq('period_start', req.period.start)
        .eq('period_end', req.period.end)
        .maybeSingle();
      if (error) throw error;
      return data?.raw_response ? parsePnlSnapshot(data.raw_response) : null;
    },
    staleTime: 60_000,
  });

  if (isLoading) return <Spinner />;
  if (!data) return <Empty msg="No QuickBooks P&L snapshot stored for this period." />;

  const totalIncome = data.totals.income || data.income.reduce((s, r) => s + r.amount, 0);
  const pct = (n: number) => (totalIncome > 0 ? `${((n / totalIncome) * 100).toFixed(1)}%` : '—');

  return (
    <div>
      <div style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12, color: 'rgba(180,200,230,0.75)' }}>
            QuickBooks P&L · Accrual · {req.period.start} → {req.period.end}
          </div>
          <ExternalLinkBtn href={qboPnlLink(req.period.start, req.period.end)} label="View in QuickBooks" />
        </div>
      </div>

      <div style={sectionStyle}>
        <SectionTitle>Income</SectionTitle>
        {data.income.length === 0 ? <Empty msg="No income lines." /> : (
          <Table rows={[
            ...data.income.map(r => ({ label: r.account, value: fmtUsd(r.amount), pct: pct(r.amount) })),
            { label: 'Total Income', value: fmtUsd(totalIncome), pct: '100.0%', bold: true },
          ]} />
        )}
      </div>

      {data.cogs.length > 0 && (
        <div style={sectionStyle}>
          <SectionTitle>Cost of Goods Sold</SectionTitle>
          <Table rows={[
            ...data.cogs.map(r => ({ label: r.account, value: fmtUsd(r.amount), pct: pct(r.amount) })),
            { label: 'Total COGS', value: fmtUsd(data.totals.cogs), pct: pct(data.totals.cogs), bold: true },
          ]} />
        </div>
      )}

      <div style={sectionStyle}>
        <Table rows={[
          { label: 'Gross Profit', value: fmtUsd(data.totals.gross_profit), pct: pct(data.totals.gross_profit), bold: true },
        ]} />
      </div>

      {data.expenses.length > 0 && (
        <div style={sectionStyle}>
          <SectionTitle>Operating Expenses</SectionTitle>
          <Table rows={[
            ...data.expenses.map(r => ({ label: r.account, value: fmtUsd(r.amount), pct: pct(r.amount) })),
            { label: 'Total Operating Expenses', value: fmtUsd(data.totals.opex), pct: pct(data.totals.opex), bold: true },
          ]} />
        </div>
      )}

      <div style={sectionStyle}>
        <Table rows={[
          { label: 'Net Operating Income', value: fmtUsd(data.totals.net_operating_income), pct: pct(data.totals.net_operating_income), bold: true },
        ]} />
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Cashflow breakdown
// ────────────────────────────────────────────────────────────

type CashflowSection = { name: string; total: number; rows: PnlRow[] };

function parseCashflowSnapshot(raw: any): { sections: CashflowSection[]; netIncrease: number } {
  const fallback = { sections: [] as CashflowSection[], netIncrease: 0 };
  if (!raw?.Rows?.Row) return fallback;
  const groupRows = (raw.Rows.Row as any[]).filter(Boolean);
  const sections: CashflowSection[] = [];
  let netIncrease = 0;
  for (const g of groupRows) {
    const groupName = String(g?.group ?? '');
    const headerLabel = String(g?.Header?.ColData?.[0]?.value ?? groupName);
    const totalLabel = String(g?.Summary?.ColData?.[0]?.value ?? headerLabel);
    const total = Number(g?.Summary?.ColData?.[1]?.value ?? 0);
    if (/cashincrease/i.test(groupName) || /net cash/i.test(totalLabel)) {
      netIncrease = total;
      continue;
    }
    const rows: PnlRow[] = [];
    walkLeaves(g, rows);
    sections.push({ name: headerLabel, total, rows });
  }
  return { sections, netIncrease };
}

function CashflowBreakdownView({ req }: { req: DrilldownRequest }) {
  const { company } = useCompany();
  const { data, isLoading } = useQuery({
    queryKey: ['drilldown-cashflow', company?.id, req.period.start, req.period.end],
    enabled: !!company?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('qbo_cashflow_snapshots')
        .select('raw_response, net_cash_flow')
        .eq('company_id', company!.id)
        .eq('realm_id', FINSERV_REALM_ID)
        .eq('accounting_method', 'Accrual')
        .eq('period_start', req.period.start)
        .eq('period_end', req.period.end)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const parsed = data.raw_response ? parseCashflowSnapshot(data.raw_response) : { sections: [], netIncrease: 0 };
      return { ...parsed, netCashFromColumn: Number(data.net_cash_flow ?? 0) };
    },
    staleTime: 60_000,
  });

  if (isLoading) return <Spinner />;
  if (!data) return <Empty msg="No Statement of Cash Flows snapshot for this period." />;

  const finalNet = data.netIncrease || data.netCashFromColumn;

  return (
    <div>
      <div style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12, color: 'rgba(180,200,230,0.75)' }}>
            QuickBooks Statement of Cash Flows · {req.period.start} → {req.period.end}
          </div>
          <ExternalLinkBtn href={qboCashflowLink(req.period.start, req.period.end)} label="View in QuickBooks" />
        </div>
      </div>

      {data.sections.length === 0 ? <Empty msg="No section detail available in stored snapshot." /> : (
        data.sections.map((s, i) => (
          <div key={i} style={sectionStyle}>
            <SectionTitle>{s.name}</SectionTitle>
            <Table rows={[
              ...s.rows.map(r => ({ label: r.account, value: fmtUsdSigned(r.amount) })),
              { label: `Net cash from ${s.name.toLowerCase()}`, value: fmtUsdSigned(s.total), bold: true },
            ]} />
          </div>
        ))
      )}

      <div style={sectionStyle}>
        <Table rows={[
          { label: 'Net Cash Increase for Period', value: fmtUsdSigned(finalNet), bold: true },
        ]} />
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Active Clients
// ────────────────────────────────────────────────────────────

function ActiveClientsView({ req }: { req: DrilldownRequest }) {
  const { company } = useCompany();
  const periodEndIso = req.period.end + 'T23:59:59';
  const { data, isLoading } = useQuery({
    queryKey: ['drilldown-active-clients', company?.id, req.period.end],
    enabled: !!company?.id,
    queryFn: async () => {
      const [{ data: deals, error: dErr }, { data: history, error: hErr }] = await Promise.all([
        supabase
          .from('deals')
          .select('id, company, value, stage, deal_owner, manager, created_at')
          .eq('company_id', company!.id)
          .eq('pipeline_id', FINSERV_PIPELINE_ID),
        supabase
          .from('deal_stage_history')
          .select('deal_id, to_stage, changed_at')
          .eq('company_id', company!.id)
          .eq('pipeline_id', FINSERV_PIPELINE_ID)
          .order('changed_at', { ascending: true }),
      ]);
      if (dErr) throw dErr;
      if (hErr) throw hErr;

      const histByDeal = new Map<string, Array<{ to_stage: string | null; changed_at: string }>>();
      for (const h of history ?? []) {
        const arr = histByDeal.get(h.deal_id) ?? [];
        arr.push({ to_stage: h.to_stage, changed_at: h.changed_at });
        histByDeal.set(h.deal_id, arr);
      }
      const endT = new Date(periodEndIso);

      const stageAt = (deal: any) => {
        if (new Date(deal.created_at) > endT) return null;
        const hist = histByDeal.get(deal.id);
        if (hist?.length) {
          let last: string | null = null;
          let lastTs: Date | null = null;
          for (const h of hist) {
            const t = new Date(h.changed_at);
            if (t <= endT) { last = h.to_stage; lastTs = t; } else break;
          }
          if (last !== null) return { stage: last, since: lastTs };
        }
        return { stage: deal.stage, since: new Date(deal.created_at) };
      };

      const rows = (deals ?? [])
        .map((d) => {
          const s = stageAt(d);
          if (!s || s.stage !== ACTIVE_CLIENT_STAGE) return null;
          return {
            id: d.id,
            name: d.company || '(Untitled deal)',
            owner: d.deal_owner || d.manager || '—',
            since: s.since ? new Date(s.since).toISOString().slice(0, 10) : '—',
            value: Number(d.value ?? 0),
          };
        })
        .filter(Boolean) as Array<{ id: string; name: string; owner: string; since: string; value: number }>;

      rows.sort((a, b) => a.name.localeCompare(b.name));
      return rows;
    },
    staleTime: 30_000,
  });

  if (isLoading) return <Spinner />;
  if (!data || data.length === 0) return <Empty msg="No deals in Active Client stage at end of this period." />;

  return (
    <div>
      <div style={sectionStyle}>
        <div style={{ fontSize: 12, color: 'rgba(180,200,230,0.75)' }}>
          {data.length} active FinServ client{data.length === 1 ? '' : 's'} as of {req.period.end}
        </div>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ color: 'rgba(160,200,255,0.55)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.08em' }}>
            <th style={{ textAlign: 'left', padding: '8px 18px' }}>Deal</th>
            <th style={{ textAlign: 'left', padding: '8px 8px' }}>Owner</th>
            <th style={{ textAlign: 'left', padding: '8px 8px' }}>Active since</th>
            <th style={{ textAlign: 'right', padding: '8px 18px' }}>Value</th>
          </tr>
        </thead>
        <tbody>
          {data.map((r) => (
            <tr key={r.id} style={{ borderBottom: '1px solid rgba(120,170,255,0.08)' }}>
              <td style={{ padding: '8px 18px' }}>
                <a href={`/deals/${r.id}`} style={{ color: '#7cc8f0', textDecoration: 'none' }}>{r.name}</a>
              </td>
              <td style={{ padding: '8px 8px', color: 'rgba(180,200,230,0.85)' }}>{r.owner}</td>
              <td style={{ padding: '8px 8px', color: 'rgba(180,200,230,0.85)' }}>{r.since}</td>
              <td style={{ padding: '8px 18px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.value > 0 ? fmtUsd(r.value) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Average Revenue per Client
// ────────────────────────────────────────────────────────────

function AvgRevenueView({ req }: { req: DrilldownRequest }) {
  const { company } = useCompany();
  const { data, isLoading } = useQuery({
    queryKey: ['drilldown-avg-revenue', company?.id, req.period.start, req.period.end],
    enabled: !!company?.id,
    queryFn: async () => {
      const [{ data: pnl }, invoiceRes] = await Promise.all([
        supabase
          .from('qbo_pnl_snapshots')
          .select('income_total')
          .eq('company_id', company!.id)
          .eq('realm_id', FINSERV_REALM_ID)
          .eq('accounting_method', 'Accrual')
          .eq('period_start', req.period.start)
          .eq('period_end', req.period.end)
          .maybeSingle(),
        supabase
          .from('quickbooks_invoices')
          .select('customer_name, total_amt')
          .eq('realm_id', FINSERV_REALM_ID)
          .gte('txn_date', req.period.start)
          .lte('txn_date', req.period.end),
      ]);
      const revenue = Number(pnl?.income_total ?? 0);
      const byClient: Record<string, number> = {};
      for (const r of invoiceRes.data ?? []) {
        if (!r.customer_name) continue;
        byClient[r.customer_name] = (byClient[r.customer_name] ?? 0) + (Number(r.total_amt) || 0);
      }
      const clients = Object.entries(byClient)
        .map(([name, amount]) => ({ name, amount }))
        .sort((a, b) => b.amount - a.amount);
      return { revenue, clients };
    },
    staleTime: 30_000,
  });

  if (isLoading) return <Spinner />;
  if (!data) return <Empty msg="No data for this period." />;

  const denominator = Math.max(data.clients.length, 1);
  const avg = data.revenue / denominator;

  return (
    <div>
      <div style={sectionStyle}>
        <Table rows={[
          { label: 'Period revenue (QBO Total Income)', value: fmtUsd(data.revenue) },
          { label: 'Billing clients (denominator)', value: String(data.clients.length) },
          { label: 'Average revenue per client', value: fmtUsd(avg), bold: true },
        ]} />
      </div>
      {data.clients.length === 0 ? (
        <Empty msg="No invoiced clients in this period." />
      ) : (
        <div>
          <div style={sectionStyle}><SectionTitle>Per-client revenue (from QuickBooks invoices)</SectionTitle></div>
          <Table rows={data.clients.map(c => ({ label: c.name, value: fmtUsd(c.amount) }))} />
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Per-client monthly series (Revenue Change by Client)
// ────────────────────────────────────────────────────────────

function ClientSeriesView({ req }: { req: DrilldownRequest }) {
  const clientName = req.client ?? '';
  const realm = req.realm ?? FINSERV_REALM_ID;
  const { data, isLoading } = useQuery({
    queryKey: ['drilldown-client-series', realm, clientName, req.period.start, req.period.end],
    enabled: !!clientName,
    queryFn: async () => {
      // Resolve every QBO customer in this realm whose company_name OR
      // display_name matches the clicked label (post-company-name relabel,
      // a single bar can roll up multiple QBO customers).
      const { data: customers, error: cErr } = await supabase
        .from('quickbooks_customers')
        .select('qb_id, display_name, company_name')
        .eq('realm_id', realm)
        .or(`company_name.eq.${clientName},display_name.eq.${clientName}`);
      if (cErr) throw cErr;
      const ids = (customers ?? []).map(c => c.qb_id).filter(Boolean) as string[];

      let query = supabase
        .from('quickbooks_invoices')
        .select('txn_date, total_amt, customer_name')
        .eq('realm_id', realm)
        .order('txn_date', { ascending: true });
      // Match by resolved customer_ids when we found any; otherwise fall back
      // to the legacy customer_name match (covers labels that already equal
      // the QBO display name).
      query = ids.length > 0
        ? query.in('customer_id', ids)
        : query.eq('customer_name', clientName);
      const { data, error } = await query;
      if (error) throw error;
      const monthly: Record<string, number> = {};
      for (const r of data ?? []) {
        if (!r.txn_date) continue;
        const k = r.txn_date.slice(0, 7);
        monthly[k] = (monthly[k] ?? 0) + (Number(r.total_amt) || 0);
      }
      const rows = Object.entries(monthly).sort(([a], [b]) => a.localeCompare(b));
      let prev: number | null = null;
      return rows.map(([k, v]) => {
        const varDollars = prev != null ? v - prev : null;
        const varPct = prev != null && prev !== 0 ? ((v - prev) / prev) * 100 : null;
        prev = v;
        return { month: k, amount: v, varDollars, varPct };
      });
    },
    staleTime: 30_000,
  });

  if (!clientName) return <Empty msg="Select a client bar to view its history." />;
  if (isLoading) return <Spinner />;
  if (!data || data.length === 0) return <Empty msg="No invoices on record for this client." />;

  return (
    <div>
      <div style={sectionStyle}>
        <div style={{ fontSize: 12, color: 'rgba(180,200,230,0.75)' }}>
          {clientName} · monthly invoiced revenue (QuickBooks)
        </div>
        {req.externalLink && (
          <div style={{ marginTop: 8 }}>
            <ExternalLinkBtn href={req.externalLink.href} label={req.externalLink.label} />
          </div>
        )}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ color: 'rgba(160,200,255,0.55)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '.08em' }}>
            <th style={{ textAlign: 'left', padding: '8px 18px' }}>Month</th>
            <th style={{ textAlign: 'right', padding: '8px 8px' }}>Revenue</th>
            <th style={{ textAlign: 'right', padding: '8px 8px' }}>Δ$</th>
            <th style={{ textAlign: 'right', padding: '8px 18px' }}>Δ%</th>
          </tr>
        </thead>
        <tbody>
          {data.map((r) => {
            const sign = r.varDollars == null ? 'rgba(180,200,230,0.6)' : r.varDollars > 0 ? 'hsl(142 71% 50%)' : r.varDollars < 0 ? 'hsl(0 72% 60%)' : 'rgba(180,200,230,0.6)';
            return (
              <tr key={r.month} style={{ borderBottom: '1px solid rgba(120,170,255,0.08)' }}>
                <td style={{ padding: '8px 18px' }}>{r.month}</td>
                <td style={{ padding: '8px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtUsd(r.amount)}</td>
                <td style={{ padding: '8px 8px', textAlign: 'right', color: sign }}>{r.varDollars == null ? '—' : fmtUsdSigned(r.varDollars)}</td>
                <td style={{ padding: '8px 18px', textAlign: 'right', color: sign }}>{r.varPct == null ? '—' : `${r.varPct >= 0 ? '+' : ''}${fmtPct(r.varPct)}`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Generic single-value fallback (for tiles without rich drilldowns yet)
// ────────────────────────────────────────────────────────────

function ValueRowsView({ req }: { req: DrilldownRequest }) {
  if (!req.rows || req.rows.length === 0) {
    return <Empty msg="No detail captured for this datapoint." />;
  }
  return (
    <div>
      {req.externalLink && (
        <div style={sectionStyle}>
          <ExternalLinkBtn href={req.externalLink.href} label={req.externalLink.label} />
        </div>
      )}
      <Table rows={req.rows.map(r => ({ label: r.metric, value: r.value }))} />
    </div>
  );
}