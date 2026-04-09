import { Deal, DealStatus } from '@/types/deal';
import { format } from 'date-fns';

export interface DashboardDealRow {
  name: string;
  nameColor: string;
  size: string;
  fee: string;
  gross: string;
  billed: string;
  referral: string;
  origination: string;
  assocDir: string;
  dirMd: string;
  profit: string;
  profitCls: string;
  milestone: string;
  closing: string;
  closingPill: string;
  // raw values for aggregation & sorting
  _value: number;
  _totalFee: number;
  _successFeePercent: number;
  _billedAtClose: number;
  _referralComm: number;
  _originationComm: number;
  _assocDirComm: number;
  _dirMdComm: number;
  _profit: number;
  _status: DealStatus;
  _closingDate: string | null;
  _name: string; // lowercase name for sorting
  _closingTs: number; // timestamp for date sorting (Infinity if TBD)
  _milestoneTs: number;
}

// Commission rates
const COMM_RATES = {
  referral: 0.10,
  origination: 0.025,
  assocDir: 0.035,
  dirMd: 0.05,
};

// ── Formatting helpers ──

function fmtMM(v: number): string {
  if (v === 0) return '$0.0MM';
  return '$' + (v / 1_000_000).toFixed(2) + 'MM';
}

function fmtK(v: number): string {
  if (v === 0) return '$0.0K';
  if (Math.abs(v) >= 1_000_000) return '$' + (v / 1_000).toFixed(0) + 'K';
  return '$' + (v / 1_000).toFixed(1) + 'K';
}

function fmtKInt(v: number): string {
  if (v === 0) return '$0K';
  return '$' + Math.round(v / 1_000) + 'K';
}

function fmtPct(v: number | undefined): string {
  if (v === undefined || v === null || v === 0) return '—';
  return v.toFixed(2) + '%';
}

function statusColor(s: DealStatus): string {
  if (s === 'on-track') return '#4de8a0';
  if (s === 'at-risk') return '#f0c84a';
  if (s === 'off-track') return '#ff8a96';
  return 'rgba(130,165,190,0.6)';
}

function statusPill(s: DealStatus): string {
  if (s === 'on-track') return 'db-pill-on';
  if (s === 'at-risk') return 'db-pill-risk';
  if (s === 'off-track') return 'db-pill-off';
  return 'db-pill-risk';
}

function closingLabel(d: Deal): string {
  if (d.closingDate) {
    try { return format(new Date(d.closingDate), 'MMM yyyy'); } catch { return 'TBD'; }
  }
  return 'TBD';
}

function safeTs(dateStr: string | null | undefined): number {
  if (!dateStr) return Infinity;
  try { return new Date(dateStr).getTime(); } catch { return Infinity; }
}

// ── Filtering ──

const EXCLUDED_NAMES = new Set(['test - niki\'s store', 'example deal']);

export function filterDashboardDeals(deals: Deal[]): Deal[] {
  return deals.filter(d => {
    const stage = (d.stage || '').toLowerCase().trim();
    const status = (d.status || '').toLowerCase().trim();
    if (stage.includes('on hold') || stage.includes('on-hold')) return false;
    if (status.includes('on hold') || status.includes('on-hold')) return false;

    const name = (d.company || d.name || '').toLowerCase().trim();
    if (EXCLUDED_NAMES.has(name)) return false;
    if (name.startsWith('test ') || name === 'test') return false;

    return true;
  });
}

// ── Row mapper ──

export function mapDealToDashboardRow(deal: Deal): DashboardDealRow {
  const gross = deal.totalFee || 0;
  const billed = deal.retainerFee || 0;
  const referral = gross * COMM_RATES.referral;
  const actualReferral = deal.referredBy ? referral : 0;
  const origination = gross * COMM_RATES.origination;
  const assocDir = gross * COMM_RATES.assocDir;
  const dirMd = gross * COMM_RATES.dirMd;
  const totalComm = actualReferral + origination + assocDir + dirMd;
  const profit = gross > 0 ? gross - totalComm : 0;
  const closing = closingLabel(deal);
  const hasData = gross > 0;
  const closingTs = safeTs(deal.closingDate);

  return {
    name: deal.company || deal.name,
    nameColor: statusColor(deal.status),
    size: fmtMM(deal.value),
    fee: fmtPct(deal.successFeePercent),
    gross: fmtK(gross),
    billed: fmtK(billed),
    referral: fmtK(actualReferral),
    origination: fmtK(origination),
    assocDir: fmtK(assocDir),
    dirMd: fmtK(dirMd),
    profit: hasData ? fmtK(profit) : '—',
    profitCls: hasData && profit > 0 ? 'db-up' : '',
    milestone: deal.closingDate ? (() => { try { return format(new Date(deal.closingDate), 'MMM yyyy'); } catch { return '—'; } })() : '—',
    closing,
    closingPill: statusPill(deal.status),
    _value: deal.value || 0,
    _totalFee: gross,
    _successFeePercent: deal.successFeePercent || 0,
    _billedAtClose: billed,
    _referralComm: actualReferral,
    _originationComm: origination,
    _assocDirComm: assocDir,
    _dirMdComm: dirMd,
    _profit: profit,
    _status: deal.status,
    _closingDate: deal.closingDate || null,
    _name: (deal.company || deal.name || '').toLowerCase(),
    _closingTs: closingTs,
    _milestoneTs: closingTs,
  };
}

// ── Sorting ──

export type SortColumn =
  | 'name' | 'size' | 'fee' | 'gross' | 'billed'
  | 'referral' | 'origination' | 'assocDir' | 'dirMd'
  | 'profit' | 'milestone' | 'closing';

export type SortDir = 'asc' | 'desc';

function getSortableValue(row: DashboardDealRow, col: SortColumn): number | string {
  switch (col) {
    case 'name': return row._name;
    case 'size': return row._value;
    case 'fee': return row._successFeePercent;
    case 'gross': return row._totalFee;
    case 'billed': return row._billedAtClose;
    case 'referral': return row._referralComm;
    case 'origination': return row._originationComm;
    case 'assocDir': return row._assocDirComm;
    case 'dirMd': return row._dirMdComm;
    case 'profit': return row._profit;
    case 'milestone': return row._milestoneTs;
    case 'closing': return row._closingTs;
    default: return 0;
  }
}

export function sortDashboardRows(rows: DashboardDealRow[], col: SortColumn, dir: SortDir): DashboardDealRow[] {
  const sorted = [...rows].sort((a, b) => {
    const va = getSortableValue(a, col);
    const vb = getSortableValue(b, col);
    if (typeof va === 'string' && typeof vb === 'string') {
      return dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    }
    const na = va as number;
    const nb = vb as number;
    // Push Infinity (TBD) to the bottom regardless of direction
    if (na === Infinity && nb === Infinity) return 0;
    if (na === Infinity) return 1;
    if (nb === Infinity) return -1;
    return dir === 'asc' ? na - nb : nb - na;
  });
  return sorted;
}

// ── Metrics ──

export interface DashboardMetrics {
  dealCount: number;
  totalVolume: string;
  avgDealSize: string;
  grossRevenue: string;
  billedAtClose: string;
  referralTotal: string;
  liveRevenue: string;
  totalProfit: string;
  totalPipeline: string;
  onTrack: { count: number; volume: number; volumeStr: string; pct: string; feeTotal: number; feeTotalStr: string };
  atRisk: { count: number; volume: number; volumeStr: string; pct: string; feeTotal: number; feeTotalStr: string };
  offTrack: { count: number; volume: number; volumeStr: string; pct: string; feeTotal: number; feeTotalStr: string };
  donutData: number[];
  months: string[];
  monthlyRevenue: number[];
  monthlyCommissions: number[];
  monthlyProfit: number[];
  forecast: Array<{ rev: string; revColor: string; comm: string; commColor: string; prof: string; profColor: string }>;
}

export function buildDashboardMetrics(rows: DashboardDealRow[]): DashboardMetrics {
  const totalVolume = rows.reduce((s, r) => s + r._value, 0);
  const grossRevenue = rows.reduce((s, r) => s + r._totalFee, 0);
  const billedAtClose = rows.reduce((s, r) => s + r._billedAtClose, 0);
  const referralTotal = rows.reduce((s, r) => s + r._referralComm, 0);
  const totalProfit = rows.reduce((s, r) => s + r._profit, 0);
  const liveRevenue = grossRevenue - referralTotal;

  const groupBy = (status: DealStatus) => {
    const g = rows.filter(r => r._status === status);
    const vol = g.reduce((s, r) => s + r._value, 0);
    const fee = g.reduce((s, r) => s + r._totalFee, 0);
    const pct = totalVolume > 0 ? Math.round((vol / totalVolume) * 100) : 0;
    return { count: g.length, volume: vol, volumeStr: fmtMM(vol), pct: pct + '%', feeTotal: fee, feeTotalStr: fmtKInt(fee) };
  };

  const onTrack = groupBy('on-track');
  const atRisk = groupBy('at-risk');
  const offTrack = groupBy('off-track');

  const monthMap = new Map<string, { rev: number; comm: number; prof: number }>();
  for (const r of rows) {
    if (r._closingDate && r._totalFee > 0) {
      try {
        const key = format(new Date(r._closingDate), 'MMM yyyy');
        const existing = monthMap.get(key) || { rev: 0, comm: 0, prof: 0 };
        const comm = r._referralComm + r._originationComm + r._assocDirComm + r._dirMdComm;
        existing.rev += r._totalFee;
        existing.comm += comm;
        existing.prof += r._profit;
        monthMap.set(key, existing);
      } catch { /* skip */ }
    }
  }

  const sortedMonths = Array.from(monthMap.entries()).sort((a, b) => {
    try { return new Date(a[0]).getTime() - new Date(b[0]).getTime(); } catch { return 0; }
  }).slice(0, 6);

  while (sortedMonths.length < 6) {
    sortedMonths.push(['—', { rev: 0, comm: 0, prof: 0 }]);
  }

  const months = sortedMonths.map(([m]) => m);
  const monthlyRevenue = sortedMonths.map(([, d]) => Math.round(d.rev / 1000));
  const monthlyCommissions = sortedMonths.map(([, d]) => Math.round(d.comm / 1000));
  const monthlyProfit = sortedMonths.map(([, d]) => Math.round(d.prof / 1000));

  const zeroColor = 'rgba(160,190,210,0.35)';
  const zeroCommColor = 'rgba(160,190,210,0.25)';
  const zeroProfColor = 'rgba(160,190,210,0.3)';

  const forecast = sortedMonths.map(([, d]) => {
    const hasVal = d.rev > 0;
    return {
      rev: fmtKInt(d.rev),
      revColor: hasVal ? '#e8f4ff' : zeroColor,
      comm: fmtKInt(d.comm),
      commColor: hasVal ? 'rgba(220,70,85,0.7)' : zeroCommColor,
      prof: fmtKInt(d.prof),
      profColor: hasVal ? '#3de89a' : zeroProfColor,
    };
  });

  return {
    dealCount: rows.length,
    totalVolume: fmtMM(totalVolume),
    avgDealSize: fmtMM(rows.length > 0 ? totalVolume / rows.length : 0),
    grossRevenue: fmtKInt(grossRevenue),
    billedAtClose: fmtKInt(billedAtClose),
    referralTotal: fmtKInt(referralTotal),
    liveRevenue: fmtKInt(liveRevenue),
    totalProfit: fmtKInt(totalProfit),
    totalPipeline: fmtMM(grossRevenue),
    onTrack,
    atRisk,
    offTrack,
    donutData: [onTrack.volume / 1_000_000, atRisk.volume / 1_000_000, offTrack.volume / 1_000_000],
    months,
    monthlyRevenue,
    monthlyCommissions,
    monthlyProfit,
    forecast,
  };
}
