import { useState, useMemo, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { CalendarRange, TrendingUp, Download } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { isExcludedDealName } from '@/utils/excludedDeals';
import type { MasterLender } from '@/hooks/useMasterLenders';
import { cn } from '@/lib/utils';
import type { CSSProperties } from 'react';
import {
  ResponsiveContainer,
  Tooltip as ReTooltip,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';

type DateRange = '30d' | '90d' | 'ytd' | '12m' | 'all';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Filtered list of lenders from the Lenders page; analytics scope follows it. */
  lenders: MasterLender[];
  /** Total directory count for the filter summary chip. */
  totalLenderCount?: number;
  /** Short text describing currently applied page filters. */
  filtersSummary?: string;
  originStyle?: CSSProperties;
  originClassName?: string;
}

interface DealLenderRow {
  id: string;
  deal_id: string;
  name: string;
  stage: string | null;
  substage: string | null;
  pass_reason: string | null;
  created_at: string;
  updated_at: string;
}

interface DealRow {
  id: string;
  company: string | null;
  company_id: string | null;
  deal_type: string | null;
  manager: string | null;
  created_at: string;
}

interface StageConfigRow {
  company_id: string | null;
  stages: unknown;
}

const DATE_LABEL: Record<DateRange, string> = {
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  ytd: 'Year to date',
  '12m': 'Last 12 months',
  all: 'All time',
};

function rangeStart(range: DateRange): Date | null {
  const now = new Date();
  switch (range) {
    case '30d': return new Date(now.getTime() - 30 * 86400000);
    case '90d': return new Date(now.getTime() - 90 * 86400000);
    case '12m': { const d = new Date(now); d.setFullYear(d.getFullYear() - 1); return d; }
    case 'ytd': return new Date(now.getFullYear(), 0, 1);
    case 'all': return null;
  }
}

type Bucket = 'Submitted' | 'Management Call' | 'Terms' | 'Unresponsive' | 'Declined / Passed' | 'Other';

const BUCKET_ORDER: Bucket[] = ['Submitted', 'Management Call', 'Terms', 'Unresponsive', 'Declined / Passed', 'Other'];
const BUCKET_COLOR: Record<Bucket, string> = {
  'Submitted': 'hsl(217 91% 60%)',
  'Management Call': 'hsl(262 83% 65%)',
  'Terms': 'hsl(142 71% 45%)',
  'Unresponsive': 'hsl(38 92% 55%)',
  'Declined / Passed': 'hsl(0 72% 55%)',
  'Other': 'hsl(215 16% 55%)',
};

// Shared dark-gradient surfaces — matches the deal pop-up's tonal language
// (radial highlight + soft vertical fade + faint inner sheen).
const MODAL_SHELL_STYLE: CSSProperties = {
  background:
    'radial-gradient(120% 80% at 0% 0%, hsl(220 55% 22% / 0.55) 0%, transparent 55%),' +
    'radial-gradient(120% 80% at 100% 100%, hsl(220 60% 14% / 0.55) 0%, transparent 60%),' +
    'linear-gradient(180deg, hsl(220 40% 11% / 0.96) 0%, hsl(220 45% 7% / 0.98) 100%)',
  borderColor: 'hsl(220 50% 40% / 0.28)',
  boxShadow:
    'inset 0 1px 0 hsl(220 60% 85% / 0.06), 0 24px 60px hsl(220 60% 3% / 0.6)',
};

const PANEL_STYLE: CSSProperties = {
  background:
    'radial-gradient(110% 70% at 0% 0%, hsl(220 60% 30% / 0.18) 0%, transparent 60%),' +
    'linear-gradient(180deg, hsl(220 38% 16% / 0.85) 0%, hsl(220 42% 11% / 0.9) 100%)',
  borderColor: 'hsl(220 45% 45% / 0.22)',
  boxShadow:
    'inset 0 1px 0 hsl(220 60% 85% / 0.05), 0 4px 14px hsl(220 60% 3% / 0.35)',
};

const HEADER_STYLE: CSSProperties = {
  background:
    'linear-gradient(180deg, hsl(220 45% 14% / 0.85) 0%, hsl(220 45% 10% / 0.6) 100%)',
  borderBottom: '1px solid hsl(220 45% 40% / 0.22)',
};

function normalizeLabel(s: string | null | undefined): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Returns ordinal milestone reached (1..7) for a normalized label, or 0 if not on the linear path. */
function stageOrdinal(label: string): number {
  const n = normalizeLabel(label);
  if (!n) return 0;
  if (n.includes('term')) return 7; // term sheet, terms issued, draft terms
  if (n.includes('management call completed') || n.includes('mgmt call completed')) return 6;
  if (n.includes('management call') || n.includes('mgmt call')) return 5;
  if (n.includes('reviewing') || n === 'in review' || n.includes('in review')) return 4;
  if (n.includes('sent drl') || n.includes('drl sent') || n.includes('submitted')) return 3;
  if (n.includes('inquiry')) return 2;
  if (n.includes('outreach') || n.includes('introduced') || n === 'on deck') return 1;
  return 0;
}

function isTerminal(label: string, passReason: string | null): { passed: boolean; unresponsive: boolean; onHold: boolean } {
  const n = normalizeLabel(label);
  const passed = !!passReason || n.includes('pass') || n.includes('declin') || n.includes('not a fit') || n === 'lost';
  const unresponsive = n.includes('unresponsive') || n.includes('stale') || n.includes('no response');
  const onHold = n.includes('on hold');
  return { passed, unresponsive, onHold };
}

function bucketFor(label: string, ord: number, t: ReturnType<typeof isTerminal>): Bucket {
  if (t.passed) return 'Declined / Passed';
  if (t.unresponsive) return 'Unresponsive';
  if (ord === 7) return 'Terms';
  if (ord === 5 || ord === 6) return 'Management Call';
  if (ord >= 1 && ord <= 4) return 'Submitted';
  return 'Other';
}

export function LenderAnalyticsDialog({
  open,
  onOpenChange,
  lenders,
  totalLenderCount,
  filtersSummary,
  originStyle,
  originClassName,
}: Props) {
  const [dateRange, setDateRange] = useState<DateRange>('90d');
  const [dealLenders, setDealLenders] = useState<DealLenderRow[]>([]);
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [stageConfigs, setStageConfigs] = useState<StageConfigRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const start = rangeStart(dateRange);
      const startIso = start?.toISOString();
      try {
        const [dlRes, dRes, scRes] = await Promise.all([
          (() => {
            let q = supabase.from('deal_lenders').select('id, deal_id, name, stage, substage, pass_reason, created_at, updated_at').limit(10000);
            if (startIso) q = q.gte('created_at', startIso);
            return q;
          })(),
          supabase.from('deals').select('id, company, company_id, deal_type, manager, created_at').limit(10000),
          supabase.from('lender_stage_configs').select('company_id, stages').limit(500),
        ]);
        if (cancelled) return;
        if (dlRes.error) throw dlRes.error;
        if (dRes.error) throw dRes.error;
        setDealLenders((dlRes.data ?? []) as DealLenderRow[]);
        setDeals((dRes.data ?? []) as DealRow[]);
        setStageConfigs((scRes.data ?? []) as StageConfigRow[]);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'Failed to load analytics');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, dateRange]);

  // Build stage id -> label map per company (+ global fallback)
  const stageLabelByCompany = useMemo(() => {
    const map = new Map<string, Map<string, string>>();
    const global = new Map<string, string>();
    for (const cfg of stageConfigs) {
      const stages = Array.isArray(cfg.stages) ? cfg.stages as Array<{ id?: string; label?: string }> : [];
      let m = cfg.company_id ? map.get(cfg.company_id) : global;
      if (cfg.company_id && !m) { m = new Map(); map.set(cfg.company_id, m); }
      const target = m ?? global;
      for (const s of stages) {
        if (s?.id && s?.label) {
          target.set(s.id, s.label);
          if (!global.has(s.id)) global.set(s.id, s.label);
        }
      }
    }
    map.set('__global__', global);
    return map;
  }, [stageConfigs]);

  function resolveLabel(stageRaw: string | null, companyId: string | null): string {
    if (!stageRaw) return '';
    // If it's a UUID, look it up
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(stageRaw);
    if (isUuid) {
      const cMap = companyId ? stageLabelByCompany.get(companyId) : null;
      const fromCompany = cMap?.get(stageRaw);
      if (fromCompany) return fromCompany;
      return stageLabelByCompany.get('__global__')?.get(stageRaw) ?? stageRaw;
    }
    return stageRaw;
  }

  // Restrict to non-excluded deals and (if lender list filtered) to lenders in the filtered set
  const dealMap = useMemo(() => {
    const m = new Map<string, DealRow>();
    for (const d of deals) {
      if (isExcludedDealName(d.company)) continue;
      m.set(d.id, d);
    }
    return m;
  }, [deals]);

  const lenderNameSet = useMemo(() => {
    const s = new Set<string>();
    for (const l of lenders) if (l.name) s.add(l.name.trim().toLowerCase());
    return s;
  }, [lenders]);

  // The page-filter scope: if the visible lender count equals the total, treat it as unfiltered (all lenders).
  const lenderScopeActive = totalLenderCount != null && totalLenderCount > lenders.length;

  type Enriched = DealLenderRow & {
    deal: DealRow;
    label: string;
    ord: number;
    terminal: ReturnType<typeof isTerminal>;
    bucket: Bucket;
    everSubmitted: boolean;
    everTerms: boolean;
    manager: string;
    dealType: string;
  };

  const rows: Enriched[] = useMemo(() => {
    const out: Enriched[] = [];
    for (const dl of dealLenders) {
      const deal = dealMap.get(dl.deal_id);
      if (!deal) continue;
      if (lenderScopeActive && !lenderNameSet.has((dl.name || '').trim().toLowerCase())) continue;
      const label = resolveLabel(dl.stage, deal.company_id);
      const ord = stageOrdinal(label);
      const terminal = isTerminal(label, dl.pass_reason);
      const bucket = bucketFor(label, ord, terminal);
      // "Ever reached" — without history we infer from current ordinal.
      const everSubmitted = ord >= 3 || (terminal.passed && (label || '').toLowerCase().includes('drl'));
      const everTerms = ord >= 7;
      out.push({
        ...dl,
        deal,
        label,
        ord,
        terminal,
        bucket,
        everSubmitted,
        everTerms,
        manager: (deal.manager || '').trim() || 'Unassigned',
        dealType: (deal.deal_type || '').trim() || 'Unknown',
      });
    }
    return out;
  }, [dealLenders, dealMap, lenderNameSet, lenderScopeActive, stageLabelByCompany]);

  // KPI metrics — counting grain = unique lender-deal relationship (deal_lenders.id)
  const kpis = useMemo(() => {
    const submittedSet = new Set<string>();
    const termsSet = new Set<string>();
    const activeSet = new Set<string>();
    for (const r of rows) {
      if (r.everSubmitted) submittedSet.add(r.id);
      if (r.everTerms) termsSet.add(r.id);
      if (!r.terminal.passed && !r.terminal.unresponsive && !r.terminal.onHold && r.ord > 0) activeSet.add(r.id);
    }
    const submitted = submittedSet.size;
    const terms = termsSet.size;
    const conv = submitted > 0 ? terms / submitted : 0;
    return { submitted, terms, conv, active: activeSet.size };
  }, [rows]);

  // Donut: current-stage bucket distribution
  const bucketData = useMemo(() => {
    const counts = new Map<Bucket, number>();
    for (const b of BUCKET_ORDER) counts.set(b, 0);
    for (const r of rows) counts.set(r.bucket, (counts.get(r.bucket) || 0) + 1);
    const total = rows.length || 1;
    return BUCKET_ORDER
      .map(name => ({ name, value: counts.get(name) || 0, pct: ((counts.get(name) || 0) / total) * 100 }))
      .filter(d => d.value > 0);
  }, [rows]);

  // Segment helpers
  type Seg = { name: string; submitted: number; terms: number; conv: number; mgmt: number; unresponsive: number; passed: number };

  function segmentBy(getter: (r: Enriched) => string): Seg[] {
    const m = new Map<string, Seg>();
    for (const r of rows) {
      const key = getter(r);
      let s = m.get(key);
      if (!s) { s = { name: key, submitted: 0, terms: 0, conv: 0, mgmt: 0, unresponsive: 0, passed: 0 }; m.set(key, s); }
      if (r.everSubmitted) s.submitted++;
      if (r.everTerms) s.terms++;
      if (r.bucket === 'Management Call') s.mgmt++;
      if (r.bucket === 'Unresponsive') s.unresponsive++;
      if (r.bucket === 'Declined / Passed') s.passed++;
    }
    for (const s of m.values()) s.conv = s.submitted > 0 ? s.terms / s.submitted : 0;
    return Array.from(m.values()).sort((a, b) => b.conv - a.conv || b.submitted - a.submitted);
  }

  const byManager = useMemo(() => segmentBy(r => r.manager), [rows]);
  const byDealType = useMemo(() => segmentBy(r => r.dealType), [rows]);

  const overallSeg: Seg = useMemo(() => ({
    name: 'Overall pipeline',
    submitted: kpis.submitted,
    terms: kpis.terms,
    conv: kpis.conv,
    mgmt: rows.filter(r => r.bucket === 'Management Call').length,
    unresponsive: rows.filter(r => r.bucket === 'Unresponsive').length,
    passed: rows.filter(r => r.bucket === 'Declined / Passed').length,
  }), [kpis, rows]);

  const tableRows: Seg[] = useMemo(() => [overallSeg, ...byManager, ...byDealType], [overallSeg, byManager, byDealType]);

  const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`;

  const isEmpty = !loading && !error && rows.length === 0;

  const subtitleParts = [
    DATE_LABEL[dateRange],
    lenderScopeActive ? `${lenders.length} of ${totalLenderCount} lenders` : `${lenders.length} lenders`,
    filtersSummary,
  ].filter(Boolean) as string[];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        style={{ ...MODAL_SHELL_STYLE, ...originStyle }}
        className={cn(
          'max-w-[1100px] w-[95vw] h-[90vh] flex flex-col p-0 gap-0 overflow-hidden rounded-2xl border text-slate-100',
          originClassName,
        )}
      >
        <DialogHeader className="px-6 pt-5 pb-4 shrink-0 space-y-2" style={HEADER_STYLE}>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <DialogTitle className="text-[15px] font-semibold tracking-tight text-slate-100 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-sky-400" />
                Lender Analytics
              </DialogTitle>
              <DialogDescription className="text-[12px] text-slate-400 mt-1">
                {subtitleParts.join(' · ')}
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
                <SelectTrigger className="h-8 w-[160px] text-[12px] bg-slate-900/60 border-slate-700/60 text-slate-100">
                  <CalendarRange className="h-3.5 w-3.5 mr-1.5" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[1400]">
                  {(Object.keys(DATE_LABEL) as DateRange[]).map(k => (
                    <SelectItem key={k} value={k}>{DATE_LABEL[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" className="h-8 text-[12px] gap-1.5 bg-slate-900/60 border-slate-700/60 text-slate-200 hover:bg-slate-800/70" disabled title="Export coming soon">
                <Download className="h-3.5 w-3.5" /> Export
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-auto px-6 py-5 space-y-5">
          {/* KPI cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard label="Total Submitted" value={kpis.submitted} hint="Lender-deals that ever reached Sent DRL" loading={loading} />
            <KpiCard label="Total Terms Issued" value={kpis.terms} hint="Lender-deals that ever reached Terms Issued" loading={loading} />
            <KpiCard
              label="Sent DRL → Terms Conversion"
              value={fmtPct(kpis.conv)}
              hint={`${kpis.terms} of ${kpis.submitted} submitted`}
              loading={loading}
            />
            <KpiCard label="Active Lenders in Pipeline" value={kpis.active} hint="Currently in active stages" loading={loading} />
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-950/40 p-3 text-[12px] text-red-300">
              Failed to load analytics: {error}
            </div>
          )}

          {isEmpty && (
            <div className="rounded-lg border p-10 text-center text-[13px] text-slate-400" style={PANEL_STYLE}>
              No lender analytics available for current filters
            </div>
          )}

          {/* Donut + segmented bars */}
          {!isEmpty && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <div className="lg:col-span-1 rounded-lg border p-3" style={PANEL_STYLE}>
                <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-2">Current stage distribution</div>
                <div className="h-[240px] relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={bucketData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={58}
                        outerRadius={86}
                        stroke="hsl(220 45% 9%)"
                        strokeWidth={2}
                      >
                        {bucketData.map((d) => (
                          <Cell key={d.name} fill={BUCKET_COLOR[d.name as Bucket]} />
                        ))}
                      </Pie>
                      <ReTooltip
                        contentStyle={{ background: 'hsl(220 45% 10%)', border: '1px solid hsl(220 45% 35% / 0.4)', borderRadius: 8, fontSize: 12, color: 'hsl(220 30% 92%)' }}
                        formatter={(v: number, n: string, p: any) => [`${v} (${p.payload.pct.toFixed(1)}%)`, n]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
                    <div className="text-[10px] uppercase tracking-wider text-slate-400">Records</div>
                    <div className="text-[22px] font-semibold tabular-nums text-slate-100">{rows.length}</div>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  {bucketData.map(d => (
                    <div key={d.name} className="flex items-center gap-1.5 text-[11px] text-slate-400">
                      <span className="h-2 w-2 rounded-sm" style={{ background: BUCKET_COLOR[d.name as Bucket] }} />
                      <span className="truncate">{d.name}</span>
                      <span className="ml-auto tabular-nums text-slate-100">{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-3">
                <SegmentChart title="Conversion by Relationship Owner" data={byManager.slice(0, 8)} />
                <SegmentChart title="Conversion by Deal Type" data={byDealType.slice(0, 8)} />
              </div>
            </div>
          )}

          {/* Detail table */}
          {!isEmpty && (
            <div className="rounded-lg border overflow-hidden" style={PANEL_STYLE}>
              <div className="px-3 py-2 border-b border-slate-700/40 text-[11px] uppercase tracking-wider text-slate-400">
                Detail breakdown
              </div>
              <div className="overflow-auto max-h-[360px]">
                <table className="w-full text-[12px]">
                  <thead className="sticky top-0 z-10 backdrop-blur" style={{ background: 'hsl(220 45% 12% / 0.92)' }}>
                    <tr className="text-left text-slate-400">
                      <th className="px-3 py-2 font-medium">Segment</th>
                      <th className="px-3 py-2 font-medium text-right">Submitted</th>
                      <th className="px-3 py-2 font-medium text-right">Terms Issued</th>
                      <th className="px-3 py-2 font-medium text-right">Conversion %</th>
                      <th className="px-3 py-2 font-medium text-right">Mgmt Calls</th>
                      <th className="px-3 py-2 font-medium text-right">Unresponsive</th>
                      <th className="px-3 py-2 font-medium text-right">Passed/Declined</th>
                    </tr>
                  </thead>
                  <tbody>
                    <SegRow row={overallSeg} bold />
                    {byManager.length > 0 && (
                      <tr><td colSpan={7} className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-wider text-slate-500">By relationship owner / manager</td></tr>
                    )}
                    {byManager.map(s => <SegRow key={`m-${s.name}`} row={s} />)}
                    {byDealType.length > 0 && (
                      <tr><td colSpan={7} className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-wider text-slate-500">By deal type</td></tr>
                    )}
                    {byDealType.map(s => <SegRow key={`t-${s.name}`} row={s} />)}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function KpiCard({ label, value, hint, loading }: { label: string; value: number | string; hint?: string; loading?: boolean }) {
  return (
    <div className="rounded-lg border p-3" style={PANEL_STYLE}>
      <div className="text-[11px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className="text-[22px] font-semibold tabular-nums text-slate-100 mt-0.5">
        {loading ? <span className="inline-block h-5 w-16 bg-slate-700/40 rounded animate-pulse" /> : value}
      </div>
      {hint && <div className="text-[11px] text-slate-500 mt-0.5">{hint}</div>}
    </div>
  );
}

function SegmentChart({ title, data }: { title: string; data: Array<{ name: string; submitted: number; terms: number; conv: number }> }) {
  const chartData = data.map(d => ({ ...d, convPct: +(d.conv * 100).toFixed(1) }));
  return (
    <div className="rounded-lg border p-3 flex flex-col" style={PANEL_STYLE}>
      <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-2">{title}</div>
      <div className="h-[240px]">
        {chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-[12px] text-slate-500">No data</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 32, left: 4, bottom: 4 }}>
              <CartesianGrid stroke="hsl(220 30% 60%)" strokeOpacity={0.12} horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: 'hsl(220 20% 70%)' }} stroke="hsl(220 25% 45%)" domain={[0, 100]} unit="%" />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: 'hsl(220 20% 80%)' }} stroke="hsl(220 25% 45%)" width={120} />
              <ReTooltip
                cursor={{ fill: 'hsl(220 40% 30% / 0.25)' }}
                contentStyle={{ background: 'hsl(220 45% 10%)', border: '1px solid hsl(220 45% 35% / 0.4)', borderRadius: 8, fontSize: 12, color: 'hsl(220 30% 92%)' }}
                formatter={(v: number, _n: string, p: any) => [`${v}% (${p.payload.terms}/${p.payload.submitted})`, 'Conversion']}
              />
              <Bar dataKey="convPct" fill="hsl(210 90% 60%)" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function SegRow({ row, bold }: { row: { name: string; submitted: number; terms: number; conv: number; mgmt: number; unresponsive: number; passed: number }; bold?: boolean }) {
  return (
    <tr className="border-t border-slate-700/40 hover:bg-slate-100/[0.03]">
      <td className={cn('px-3 py-2 text-slate-100', bold && 'font-semibold')}>{row.name}</td>
      <td className="px-3 py-2 text-right tabular-nums text-slate-200">{row.submitted}</td>
      <td className="px-3 py-2 text-right tabular-nums text-slate-200">{row.terms}</td>
      <td className="px-3 py-2 text-right tabular-nums text-slate-200">{row.submitted > 0 ? `${(row.conv * 100).toFixed(1)}%` : '—'}</td>
      <td className="px-3 py-2 text-right tabular-nums text-slate-400">{row.mgmt}</td>
      <td className="px-3 py-2 text-right tabular-nums text-slate-400">{row.unresponsive}</td>
      <td className="px-3 py-2 text-right tabular-nums text-slate-400">{row.passed}</td>
    </tr>
  );
}
