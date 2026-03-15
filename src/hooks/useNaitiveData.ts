import { supabase } from '@/integrations/supabase/client';
import { Grain, TimeWindow } from '@/components/widget-editor/widgetTypes';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────
interface NaitiveFetchOpts {
  fieldId: string;
  grain: Grain | undefined;
  dateRange: { start: string; end: string } | null;
  companyId?: string | null;
}

interface NaitiveResult {
  label: string;
  /** key → { period, value } */
  data: Map<string, { period: string; value: number }>;
  /** For "by-X" breakdowns: key → { period, [category]: value } */
  breakdownData?: Map<string, Record<string, string | number>>;
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────
function getWeekMonday(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.getFullYear(), d.getMonth(), diff);
}

function toPeriodKey(dateStr: string, grain: Grain | undefined): string {
  const d = new Date(dateStr + 'T00:00:00');
  switch (grain) {
    case 'day': return dateStr;
    case 'week': return getWeekMonday(d).toISOString().slice(0, 10);
    case 'quarter': return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
    case 'year': return String(d.getFullYear());
    case 'month': default: return dateStr.slice(0, 7);
  }
}

function toPeriodLabel(dateStr: string, grain: Grain | undefined): string {
  const d = new Date(dateStr + 'T00:00:00');
  switch (grain) {
    case 'day': return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    case 'week': {
      const mon = getWeekMonday(d);
      return `Wk ${mon.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    }
    case 'quarter': return `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`;
    case 'year': return String(d.getFullYear());
    case 'month': default: return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Deal fetcher (shared across many metrics)
// ────────────────────────────────────────────────────────────────────────────
async function fetchDeals(dateRange: { start: string; end: string } | null, dateCol: string = 'created_at') {
  let query = supabase.from('deals').select('id, value, total_fee, status, stage, deal_type, deal_owner, company, created_at, closing_date, updated_at, pipeline_id, success_fee_percent, retainer_fee, milestone_fee').order(dateCol, { ascending: true });
  if (dateRange) query = query.gte(dateCol, dateRange.start).lte(dateCol, dateRange.end);
  const { data } = await query;
  return data ?? [];
}

async function fetchDealLenders(dateRange: { start: string; end: string } | null) {
  let query = supabase.from('deal_lenders').select('id, deal_id, name, stage, tracking_status, pass_reason, quote_amount, created_at, updated_at');
  if (dateRange) query = query.gte('created_at', dateRange.start).lte('created_at', dateRange.end);
  const { data } = await query;
  return data ?? [];
}

async function fetchActivityLogs(dateRange: { start: string; end: string } | null) {
  let query = supabase.from('activity_logs').select('id, deal_id, activity_type, user_display_name, created_at');
  if (dateRange) query = query.gte('created_at', dateRange.start).lte('created_at', dateRange.end);
  const { data } = await query;
  return data ?? [];
}

async function fetchMilestones(dateRange: { start: string; end: string } | null) {
  let query = supabase.from('deal_milestones').select('id, deal_id, completed, due_date, completed_at, created_at');
  if (dateRange) query = query.gte('created_at', dateRange.start).lte('created_at', dateRange.end);
  const { data } = await query;
  return data ?? [];
}

// ────────────────────────────────────────────────────────────────────────────
// Aggregation helpers
// ────────────────────────────────────────────────────────────────────────────
function aggregateByPeriod(
  rows: Array<{ date: string; value: number }>,
  grain: Grain | undefined,
  label: string,
): NaitiveResult {
  const data = new Map<string, { period: string; value: number }>();
  for (const row of rows) {
    const key = toPeriodKey(row.date, grain);
    const period = toPeriodLabel(row.date, grain);
    const existing = data.get(key);
    if (existing) {
      existing.value += row.value;
    } else {
      data.set(key, { period, value: row.value });
    }
  }
  return { label, data };
}

function aggregateByCategory(
  rows: Array<{ date: string; category: string; value: number }>,
  grain: Grain | undefined,
  label: string,
): NaitiveResult {
  const breakdownData = new Map<string, Record<string, string | number>>();
  for (const row of rows) {
    const key = toPeriodKey(row.date, grain);
    const period = toPeriodLabel(row.date, grain);
    if (!breakdownData.has(key)) breakdownData.set(key, { period });
    const pt = breakdownData.get(key)!;
    pt[row.category] = ((pt[row.category] as number) ?? 0) + row.value;
  }
  return { label, data: new Map(), breakdownData };
}

function singleValue(value: number, label: string): NaitiveResult {
  const data = new Map<string, { period: string; value: number }>();
  data.set('total', { period: 'Total', value });
  return { label, data };
}

// ────────────────────────────────────────────────────────────────────────────
// Main dispatcher — fetches real data for any naitive field
// ────────────────────────────────────────────────────────────────────────────
export async function fetchNaitiveField(opts: NaitiveFetchOpts): Promise<NaitiveResult | null> {
  const { fieldId, grain, dateRange } = opts;

  switch (fieldId) {
    // ── Pipeline ──
    case 'n-active-pipeline': {
      const deals = await fetchDeals(null);
      const active = deals.filter(d => d.status === 'active');
      const rows = active.map(d => ({ date: d.created_at.slice(0, 10), value: d.value ?? 0 }));
      if (dateRange) return aggregateByPeriod(rows, grain, 'Active Pipeline');
      return singleValue(active.reduce((s, d) => s + (d.value ?? 0), 0), 'Active Pipeline');
    }
    case 'n-active-deal-count': {
      const deals = await fetchDeals(null);
      const active = deals.filter(d => d.status === 'active');
      return singleValue(active.length, 'Active Deals');
    }
    case 'n-pipeline-by-stage': {
      const deals = await fetchDeals(null);
      const active = deals.filter(d => d.status === 'active');
      const rows = active.map(d => ({ date: d.created_at.slice(0, 10), category: d.stage || 'Unknown', value: d.value ?? 0 }));
      return aggregateByCategory(rows, grain, 'Pipeline by Stage');
    }
    case 'n-pipeline-by-type': {
      const deals = await fetchDeals(null);
      const active = deals.filter(d => d.status === 'active');
      const rows = active.map(d => ({ date: d.created_at.slice(0, 10), category: d.deal_type || 'Unknown', value: d.value ?? 0 }));
      return aggregateByCategory(rows, grain, 'Pipeline by Type');
    }
    case 'n-pipeline-by-owner': {
      const deals = await fetchDeals(null);
      const active = deals.filter(d => d.status === 'active');
      const rows = active.map(d => ({ date: d.created_at.slice(0, 10), category: d.deal_owner || 'Unassigned', value: d.value ?? 0 }));
      return aggregateByCategory(rows, grain, 'Pipeline by Owner');
    }
    case 'n-weighted-pipeline': {
      const deals = await fetchDeals(null);
      const active = deals.filter(d => d.status === 'active');
      const total = active.reduce((s, d) => s + (d.value ?? 0) * ((d.success_fee_percent ?? 50) / 100), 0);
      return singleValue(total, 'Weighted Pipeline');
    }
    case 'n-pipeline-growth': {
      const deals = await fetchDeals(null);
      const now = new Date();
      const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const lastMonth = now.getMonth() === 0
        ? `${now.getFullYear() - 1}-12`
        : `${now.getFullYear()}-${String(now.getMonth()).padStart(2, '0')}`;
      const thisVal = deals.filter(d => d.status === 'active' && d.created_at.startsWith(thisMonth)).reduce((s, d) => s + (d.value ?? 0), 0);
      const lastVal = deals.filter(d => d.status === 'active' && d.created_at.startsWith(lastMonth)).reduce((s, d) => s + (d.value ?? 0), 0);
      const growth = lastVal > 0 ? ((thisVal - lastVal) / lastVal) * 100 : 0;
      return singleValue(growth, 'Pipeline Growth %');
    }
    case 'n-new-deals-added': {
      const deals = await fetchDeals(dateRange);
      const rows = deals.map(d => ({ date: d.created_at.slice(0, 10), value: 1 }));
      return aggregateByPeriod(rows, grain, 'New Deals');
    }
    case 'n-deals-lost': {
      const deals = await fetchDeals(null);
      const lost = deals.filter(d => d.status === 'lost' || d.status === 'dead');
      if (dateRange) {
        const filtered = lost.filter(d => d.updated_at >= dateRange.start && d.updated_at <= dateRange.end);
        const rows = filtered.map(d => ({ date: d.updated_at.slice(0, 10), value: 1 }));
        return aggregateByPeriod(rows, grain, 'Deals Lost');
      }
      return singleValue(lost.length, 'Deals Lost');
    }
    case 'n-deals-on-hold': {
      const deals = await fetchDeals(null);
      const onHold = deals.filter(d => d.status === 'on_hold' || d.stage?.toLowerCase().includes('hold'));
      return singleValue(onHold.length, 'Deals On Hold');
    }

    // ── Deal Metrics ──
    case 'n-closed-won-value': {
      const deals = await fetchDeals(dateRange, 'closing_date');
      const won = deals.filter(d => d.status === 'won' || d.status === 'closed');
      const rows = won.map(d => ({ date: (d.closing_date ?? d.updated_at).slice(0, 10), value: d.value ?? 0 }));
      return aggregateByPeriod(rows, grain, 'Closed Won');
    }
    case 'n-closed-won-count': {
      const deals = await fetchDeals(dateRange, 'closing_date');
      const won = deals.filter(d => d.status === 'won' || d.status === 'closed');
      const rows = won.map(d => ({ date: (d.closing_date ?? d.updated_at).slice(0, 10), value: 1 }));
      return aggregateByPeriod(rows, grain, 'Closed Won Count');
    }
    case 'n-closed-lost-value': {
      const deals = await fetchDeals(null);
      const lost = deals.filter(d => d.status === 'lost' || d.status === 'dead');
      if (dateRange) {
        const filtered = lost.filter(d => d.updated_at >= dateRange.start && d.updated_at <= dateRange.end);
        const rows = filtered.map(d => ({ date: d.updated_at.slice(0, 10), value: d.value ?? 0 }));
        return aggregateByPeriod(rows, grain, 'Closed Lost');
      }
      return singleValue(lost.reduce((s, d) => s + (d.value ?? 0), 0), 'Closed Lost');
    }
    case 'n-closed-lost-count': {
      const deals = await fetchDeals(null);
      const lost = deals.filter(d => d.status === 'lost' || d.status === 'dead');
      return singleValue(lost.length, 'Closed Lost Count');
    }
    case 'n-avg-deal-size': {
      const deals = await fetchDeals(dateRange);
      const withValue = deals.filter(d => (d.value ?? 0) > 0);
      const avg = withValue.length > 0 ? withValue.reduce((s, d) => s + (d.value ?? 0), 0) / withValue.length : 0;
      return singleValue(avg, 'Avg Deal Size');
    }
    case 'n-median-deal-size': {
      const deals = await fetchDeals(dateRange);
      const values = deals.map(d => d.value ?? 0).filter(v => v > 0).sort((a, b) => a - b);
      const median = values.length > 0 ? values[Math.floor(values.length / 2)] : 0;
      return singleValue(median, 'Median Deal Size');
    }
    case 'n-total-fees': {
      const deals = await fetchDeals(dateRange);
      const total = deals.reduce((s, d) => s + (d.total_fee ?? 0), 0);
      return singleValue(total, 'Total Fees');
    }
    case 'n-avg-fee': {
      const deals = await fetchDeals(dateRange);
      const withFees = deals.filter(d => (d.total_fee ?? 0) > 0);
      const avg = withFees.length > 0 ? withFees.reduce((s, d) => s + (d.total_fee ?? 0), 0) / withFees.length : 0;
      return singleValue(avg, 'Average Fee');
    }
    case 'n-deal-value': {
      const deals = await fetchDeals(dateRange);
      const rows = deals.map(d => ({ date: d.created_at.slice(0, 10), value: d.value ?? 0 }));
      return aggregateByPeriod(rows, grain, 'Deal Value');
    }
    case 'n-deal-probability': {
      const deals = await fetchDeals(dateRange);
      const probs = deals.map(d => d.success_fee_percent ?? 0).filter(p => p > 0);
      const avg = probs.length > 0 ? probs.reduce((s, p) => s + p, 0) / probs.length : 0;
      return singleValue(avg, 'Avg Probability');
    }
    case 'n-ytd-closed-value': {
      const year = new Date().getFullYear();
      const ytdRange = { start: `${year}-01-01`, end: new Date().toISOString().slice(0, 10) };
      const deals = await fetchDeals(ytdRange, 'closing_date');
      const won = deals.filter(d => d.status === 'won' || d.status === 'closed');
      const rows = won.map(d => ({ date: (d.closing_date ?? d.updated_at).slice(0, 10), value: d.value ?? 0 }));
      return aggregateByPeriod(rows, grain, 'YTD Closed');
    }
    case 'n-qtd-closed-value': {
      const now = new Date();
      const qStart = Math.floor(now.getMonth() / 3) * 3;
      const qtdRange = { start: `${now.getFullYear()}-${String(qStart + 1).padStart(2, '0')}-01`, end: now.toISOString().slice(0, 10) };
      const deals = await fetchDeals(qtdRange, 'closing_date');
      const won = deals.filter(d => d.status === 'won' || d.status === 'closed');
      return singleValue(won.reduce((s, d) => s + (d.value ?? 0), 0), 'QTD Closed');
    }
    case 'n-ttm-closed-value': {
      const now = new Date();
      const ttmStart = new Date(now); ttmStart.setMonth(ttmStart.getMonth() - 12);
      const ttmRange = { start: ttmStart.toISOString().slice(0, 10), end: now.toISOString().slice(0, 10) };
      const deals = await fetchDeals(ttmRange, 'closing_date');
      const won = deals.filter(d => d.status === 'won' || d.status === 'closed');
      const rows = won.map(d => ({ date: (d.closing_date ?? d.updated_at).slice(0, 10), value: d.value ?? 0 }));
      return aggregateByPeriod(rows, grain, 'TTM Closed');
    }
    case 'n-funded-value': {
      const deals = await fetchDeals(dateRange);
      const funded = deals.filter(d => d.stage?.toLowerCase().includes('fund'));
      const rows = funded.map(d => ({ date: (d.closing_date ?? d.updated_at).slice(0, 10), value: d.value ?? 0 }));
      return aggregateByPeriod(rows, grain, 'Funded Value');
    }
    case 'n-funded-count': {
      const deals = await fetchDeals(dateRange);
      const funded = deals.filter(d => d.stage?.toLowerCase().includes('fund'));
      return singleValue(funded.length, 'Funded Count');
    }

    // ── Conversion ──
    case 'n-win-rate': {
      const deals = await fetchDeals(dateRange);
      const won = deals.filter(d => d.status === 'won' || d.status === 'closed').length;
      const lost = deals.filter(d => d.status === 'lost' || d.status === 'dead').length;
      const total = won + lost;
      return singleValue(total > 0 ? (won / total) * 100 : 0, 'Win Rate');
    }
    case 'n-loss-rate': {
      const deals = await fetchDeals(dateRange);
      const won = deals.filter(d => d.status === 'won' || d.status === 'closed').length;
      const lost = deals.filter(d => d.status === 'lost' || d.status === 'dead').length;
      const total = won + lost;
      return singleValue(total > 0 ? (lost / total) * 100 : 0, 'Loss Rate');
    }
    case 'n-stage-conversion': {
      const deals = await fetchDeals(dateRange);
      const total = deals.length;
      const won = deals.filter(d => d.status === 'won' || d.status === 'closed').length;
      return singleValue(total > 0 ? (won / total) * 100 : 0, 'Stage Conversion');
    }
    case 'n-funnel-dropoff': {
      const deals = await fetchDeals(dateRange);
      const total = deals.length;
      const lost = deals.filter(d => d.status === 'lost' || d.status === 'dead').length;
      return singleValue(total > 0 ? (lost / total) * 100 : 0, 'Funnel Drop-off');
    }
    case 'n-proposal-to-close': {
      const deals = await fetchDeals(dateRange);
      const proposed = deals.filter(d => d.stage?.toLowerCase().includes('proposal') || d.stage?.toLowerCase().includes('term'));
      const closed = proposed.filter(d => d.status === 'won' || d.status === 'closed');
      return singleValue(proposed.length > 0 ? (closed.length / proposed.length) * 100 : 0, 'Proposal to Close');
    }
    case 'n-qualified-rate': {
      const deals = await fetchDeals(dateRange);
      const total = deals.length;
      const qualified = deals.filter(d => !['new', 'lead', 'prospect'].includes(d.stage?.toLowerCase() ?? ''));
      return singleValue(total > 0 ? (qualified.length / total) * 100 : 0, 'Qualification Rate');
    }
    case 'n-lender-pass-rate': {
      const lenders = await fetchDealLenders(dateRange);
      const total = lenders.length;
      const passed = lenders.filter(l => l.stage?.toLowerCase() === 'pass' || l.tracking_status === 'Excluded');
      return singleValue(total > 0 ? (passed.length / total) * 100 : 0, 'Lender Pass Rate');
    }
    case 'n-lender-approval-rate': {
      const lenders = await fetchDealLenders(dateRange);
      const total = lenders.length;
      const approved = lenders.filter(l => l.stage?.toLowerCase().includes('approv') || l.stage?.toLowerCase().includes('fund'));
      return singleValue(total > 0 ? (approved.length / total) * 100 : 0, 'Lender Approval Rate');
    }

    // ── Timing ──
    case 'n-avg-days-to-close': {
      const deals = await fetchDeals(dateRange);
      const closed = deals.filter(d => (d.status === 'won' || d.status === 'closed') && d.closing_date);
      const days = closed.map(d => {
        const created = new Date(d.created_at);
        const closedDate = new Date(d.closing_date!);
        return Math.max(0, Math.floor((closedDate.getTime() - created.getTime()) / 86400000));
      });
      const avg = days.length > 0 ? days.reduce((s, d) => s + d, 0) / days.length : 0;
      return singleValue(avg, 'Avg Days to Close');
    }
    case 'n-median-days-to-close': {
      const deals = await fetchDeals(dateRange);
      const closed = deals.filter(d => (d.status === 'won' || d.status === 'closed') && d.closing_date);
      const days = closed.map(d => Math.max(0, Math.floor((new Date(d.closing_date!).getTime() - new Date(d.created_at).getTime()) / 86400000))).sort((a, b) => a - b);
      const median = days.length > 0 ? days[Math.floor(days.length / 2)] : 0;
      return singleValue(median, 'Median Days to Close');
    }
    case 'n-avg-days-in-stage': {
      const deals = await fetchDeals(null);
      const active = deals.filter(d => d.status === 'active');
      const days = active.map(d => Math.floor((Date.now() - new Date(d.updated_at).getTime()) / 86400000));
      const avg = days.length > 0 ? days.reduce((s, d) => s + d, 0) / days.length : 0;
      return singleValue(avg, 'Avg Days in Stage');
    }
    case 'n-deal-velocity': {
      const deals = await fetchDeals(dateRange);
      const closed = deals.filter(d => (d.status === 'won' || d.status === 'closed') && d.closing_date);
      const totalValue = closed.reduce((s, d) => s + (d.value ?? 0), 0);
      const avgDays = closed.length > 0
        ? closed.reduce((s, d) => s + Math.max(1, Math.floor((new Date(d.closing_date!).getTime() - new Date(d.created_at).getTime()) / 86400000)), 0) / closed.length
        : 1;
      return singleValue(totalValue / avgDays, 'Deal Velocity ($/day)');
    }
    case 'n-time-to-first-lender': {
      const deals = await fetchDeals(dateRange);
      const lenders = await fetchDealLenders(null);
      const dealFirstLender = new Map<string, string>();
      for (const l of lenders) {
        const existing = dealFirstLender.get(l.deal_id);
        if (!existing || l.created_at < existing) dealFirstLender.set(l.deal_id, l.created_at);
      }
      const days = deals.filter(d => dealFirstLender.has(d.id)).map(d => {
        const diff = new Date(dealFirstLender.get(d.id)!).getTime() - new Date(d.created_at).getTime();
        return Math.max(0, Math.floor(diff / 86400000));
      });
      const avg = days.length > 0 ? days.reduce((s, d) => s + d, 0) / days.length : 0;
      return singleValue(avg, 'Time to First Lender (days)');
    }
    case 'n-time-to-term-sheet': {
      const lenders = await fetchDealLenders(dateRange);
      const termSheets = lenders.filter(l => l.stage?.toLowerCase().includes('term'));
      return singleValue(termSheets.length, 'Time to Term Sheet');
    }
    case 'n-time-to-funding': {
      const deals = await fetchDeals(dateRange);
      const funded = deals.filter(d => d.stage?.toLowerCase().includes('fund') && d.closing_date);
      const days = funded.map(d => Math.max(0, Math.floor((new Date(d.closing_date!).getTime() - new Date(d.created_at).getTime()) / 86400000)));
      const avg = days.length > 0 ? days.reduce((s, d) => s + d, 0) / days.length : 0;
      return singleValue(avg, 'Time to Funding (days)');
    }
    case 'n-stale-deals': {
      const deals = await fetchDeals(null);
      const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const stale = deals.filter(d => d.status === 'active' && new Date(d.updated_at) < thirtyDaysAgo);
      return singleValue(stale.length, 'Stale Deals');
    }
    case 'n-overdue-milestones': {
      const milestones = await fetchMilestones(null);
      const now = new Date().toISOString().slice(0, 10);
      const overdue = milestones.filter(m => !m.completed && m.due_date && m.due_date < now);
      return singleValue(overdue.length, 'Overdue Milestones');
    }

    // ── Activity ──
    case 'n-total-activities': {
      const logs = await fetchActivityLogs(dateRange);
      const rows = logs.map(l => ({ date: l.created_at.slice(0, 10), value: 1 }));
      return aggregateByPeriod(rows, grain, 'Total Activities');
    }
    case 'n-activities-this-week': {
      const now = new Date();
      const monday = getWeekMonday(now);
      const weekRange = { start: monday.toISOString().slice(0, 10), end: now.toISOString().slice(0, 10) };
      const logs = await fetchActivityLogs(weekRange);
      return singleValue(logs.length, 'Activities This Week');
    }
    case 'n-activities-by-type': {
      const logs = await fetchActivityLogs(dateRange);
      const rows = logs.map(l => ({ date: l.created_at.slice(0, 10), category: l.activity_type || 'Other', value: 1 }));
      return aggregateByCategory(rows, grain, 'Activities by Type');
    }
    case 'n-activities-by-user': {
      const logs = await fetchActivityLogs(dateRange);
      const rows = logs.map(l => ({ date: l.created_at.slice(0, 10), category: l.user_display_name || 'Unknown', value: 1 }));
      return aggregateByCategory(rows, grain, 'Activities by User');
    }
    case 'n-meetings-count': {
      const logs = await fetchActivityLogs(dateRange);
      const meetings = logs.filter(l => l.activity_type?.toLowerCase().includes('meeting'));
      const rows = meetings.map(l => ({ date: l.created_at.slice(0, 10), value: 1 }));
      return aggregateByPeriod(rows, grain, 'Meetings');
    }
    case 'n-emails-sent': {
      const logs = await fetchActivityLogs(dateRange);
      const emails = logs.filter(l => l.activity_type?.toLowerCase().includes('email'));
      const rows = emails.map(l => ({ date: l.created_at.slice(0, 10), value: 1 }));
      return aggregateByPeriod(rows, grain, 'Emails Sent');
    }
    case 'n-notes-created': {
      const logs = await fetchActivityLogs(dateRange);
      const notes = logs.filter(l => l.activity_type?.toLowerCase().includes('note'));
      const rows = notes.map(l => ({ date: l.created_at.slice(0, 10), value: 1 }));
      return aggregateByPeriod(rows, grain, 'Notes Created');
    }
    case 'n-tasks-completed': {
      const milestones = await fetchMilestones(dateRange);
      const completed = milestones.filter(m => m.completed);
      const rows = completed.map(m => ({ date: (m.completed_at ?? m.created_at).slice(0, 10), value: 1 }));
      return aggregateByPeriod(rows, grain, 'Tasks Completed');
    }
    case 'n-tasks-overdue': {
      const milestones = await fetchMilestones(null);
      const now = new Date().toISOString().slice(0, 10);
      const overdue = milestones.filter(m => !m.completed && m.due_date && m.due_date < now);
      return singleValue(overdue.length, 'Tasks Overdue');
    }

    // ── Lenders ──
    case 'n-total-lenders': {
      const lenders = await fetchDealLenders(dateRange);
      const rows = lenders.map(l => ({ date: l.created_at.slice(0, 10), value: 1 }));
      return aggregateByPeriod(rows, grain, 'Total Lenders');
    }
    case 'n-active-lenders': {
      const lenders = await fetchDealLenders(dateRange);
      const active = lenders.filter(l => l.tracking_status !== 'Excluded' && l.stage?.toLowerCase() !== 'pass');
      return singleValue(active.length, 'Active Lenders');
    }
    case 'n-lenders-by-stage': {
      const lenders = await fetchDealLenders(dateRange);
      const rows = lenders.map(l => ({ date: l.created_at.slice(0, 10), category: l.stage || 'Unknown', value: 1 }));
      return aggregateByCategory(rows, grain, 'Lenders by Stage');
    }
    case 'n-lenders-by-tier': {
      // deal_lenders doesn't have tier, use stage as proxy
      const lenders = await fetchDealLenders(dateRange);
      const rows = lenders.map(l => ({ date: l.created_at.slice(0, 10), category: l.stage || 'Unknown', value: 1 }));
      return aggregateByCategory(rows, grain, 'Lenders by Tier');
    }
    case 'n-avg-lenders-per-deal': {
      const lenders = await fetchDealLenders(dateRange);
      const dealCounts = new Map<string, number>();
      for (const l of lenders) dealCounts.set(l.deal_id, (dealCounts.get(l.deal_id) ?? 0) + 1);
      const counts = Array.from(dealCounts.values());
      const avg = counts.length > 0 ? counts.reduce((s, c) => s + c, 0) / counts.length : 0;
      return singleValue(avg, 'Avg Lenders per Deal');
    }
    case 'n-lender-response-time': {
      // Approximate: time from lender creation to first stage update
      const lenders = await fetchDealLenders(dateRange);
      const withUpdates = lenders.filter(l => l.updated_at !== l.created_at);
      const days = withUpdates.map(l => Math.max(0, Math.floor((new Date(l.updated_at).getTime() - new Date(l.created_at).getTime()) / 86400000)));
      const avg = days.length > 0 ? days.reduce((s, d) => s + d, 0) / days.length : 0;
      return singleValue(avg, 'Avg Response Time (days)');
    }
    case 'n-term-sheets-received': {
      const lenders = await fetchDealLenders(dateRange);
      const termSheets = lenders.filter(l => l.stage?.toLowerCase().includes('term'));
      const rows = termSheets.map(l => ({ date: l.created_at.slice(0, 10), value: 1 }));
      return aggregateByPeriod(rows, grain, 'Term Sheets');
    }
    case 'n-term-sheet-rate': {
      const lenders = await fetchDealLenders(dateRange);
      const total = lenders.length;
      const termSheets = lenders.filter(l => l.stage?.toLowerCase().includes('term'));
      return singleValue(total > 0 ? (termSheets.length / total) * 100 : 0, 'Term Sheet Rate');
    }

    default:
      return null;
  }
}

/** Check if a field ID is a naitive field */
export function isNaitiveField(fieldId: string): boolean {
  return fieldId.startsWith('n-');
}
