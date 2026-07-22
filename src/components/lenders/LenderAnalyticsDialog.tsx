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
import { CalendarRange, TrendingUp, Download, Search, Target } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { isExcludedDealName } from '@/utils/excludedDeals';
import type { MasterLender } from '@/hooks/useMasterLenders';
import {
  useNaitivePipelineAccess,
  FIFTH_LINE_COMPANY_ID,
} from '@/hooks/useNaitivePipelineAccess';
import {
  FundingSourcePlanModal,
  useAcquisitionPlan,
} from '@/components/lenders/FundingSourcePlanModal';
import { FundingSourcePerformanceCard } from '@/components/lenders/FundingSourcePerformanceCard';
import { cn } from '@/lib/utils';
import { formatUSD } from '@/lib/formatters/currency';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
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

type DateRange = '30d' | '90d' | 'ytd' | '6m' | '12m' | 'all' | `y${number}`;

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
  value: number | null;
}

interface StageConfigRow {
  company_id: string | null;
  stages: unknown;
}

const STATIC_DATE_LABEL: Record<Exclude<DateRange, `y${number}`>, string> = {
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  ytd: 'Year to date',
  '6m': 'Last 6 months',
  '12m': 'Last 12 months',
  all: 'All time',
};

function dateRangeLabel(range: DateRange): string {
  if (typeof range === 'string' && range.startsWith('y')) return range.slice(1);
  return STATIC_DATE_LABEL[range as Exclude<DateRange, `y${number}`>];
}

function rangeStart(range: DateRange): Date | null {
  const now = new Date();
  if (typeof range === 'string' && range.startsWith('y')) {
    const yr = Number(range.slice(1));
    if (Number.isFinite(yr)) return new Date(yr, 0, 1);
    return null;
  }
  switch (range) {
    case '30d': return new Date(now.getTime() - 30 * 86400000);
    case '90d': return new Date(now.getTime() - 90 * 86400000);
    case '6m': { const d = new Date(now); d.setMonth(d.getMonth() - 6); return d; }
    case '12m': { const d = new Date(now); d.setFullYear(d.getFullYear() - 1); return d; }
    case 'ytd': return new Date(now.getFullYear(), 0, 1);
    case 'all': return null;
  }
  return null;
}

function rangeEnd(range: DateRange): Date | null {
  if (typeof range === 'string' && range.startsWith('y')) {
    const yr = Number(range.slice(1));
    if (Number.isFinite(yr)) return new Date(yr + 1, 0, 1);
  }
  return null;
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

/**
 * Render a lender/funding-source stage as a coloured tag.
 *  - Red   : "Not a Fit", "Passed", "Declined", "Lost"
 *  - Blue  : "On Deck", "On Hold"
 *  - Green : everything else with content (Submitted, In Review, Terms, etc.)
 * Also converts kebab/snake slugs like "not-a-fit" into "Not a Fit" title case.
 */
function prettifyStageLabel(raw: string | null | undefined): string {
  const s = (raw || '').trim();
  if (!s) return '';
  // Preserve labels that already look human-formatted (contain a space and
  // at least one uppercase letter).
  if (/\s/.test(s) && /[A-Z]/.test(s)) return s;
  return s
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((w) => {
      const lc = w.toLowerCase();
      // Preserve short connecting words in the middle of a phrase.
      if (['a', 'of', 'the', 'and', 'to'].includes(lc)) return lc;
      return lc.charAt(0).toUpperCase() + lc.slice(1);
    })
    .join(' ')
    .replace(/^./, (c) => c.toUpperCase());
}

type StageTagTone = 'red' | 'blue' | 'green' | 'neutral';

function stageTagTone(label: string): StageTagTone {
  const n = normalizeLabel(label);
  if (!n) return 'neutral';
  if (n.includes('not a fit') || n === 'passed' || n.includes('declin') || n === 'lost' || n.includes('no go')) {
    return 'red';
  }
  if (n.includes('on deck') || n.includes('on hold')) return 'blue';
  return 'green';
}

function StageTag({ label }: { label: string | null | undefined }) {
  const pretty = prettifyStageLabel(label);
  if (!pretty) return <span className="text-slate-500">—</span>;
  const tone = stageTagTone(pretty);
  const styles: Record<StageTagTone, CSSProperties> = {
    red: { background: 'rgba(248, 113, 113, 0.14)', color: '#f87171', borderColor: 'rgba(248, 113, 113, 0.35)' },
    blue: { background: 'rgba(96, 165, 250, 0.14)', color: '#60a5fa', borderColor: 'rgba(96, 165, 250, 0.35)' },
    green: { background: 'rgba(77, 217, 172, 0.14)', color: '#4dd9ac', borderColor: 'rgba(77, 217, 172, 0.35)' },
    neutral: { background: 'rgba(148, 163, 184, 0.12)', color: '#cbd5e1', borderColor: 'rgba(148, 163, 184, 0.3)' },
  };
  return (
    <span
      className="inline-flex items-center rounded-md border px-2 py-0.5 text-[10.5px] font-medium leading-none whitespace-nowrap"
      style={styles[tone]}
    >
      {pretty}
    </span>
  );
}

/** Returns ordinal milestone reached (1..7) for a normalized label, or 0 if not on the linear path.
 *  Ordinal 7 = "Draft Terms" or any later stage (terms issued, due diligence, agreement pending,
 *  funded/invoiced, closed/won). Conversion rate = (ord >= 7) / (added to deal). */
function stageOrdinal(label: string): number {
  const n = normalizeLabel(label);
  if (!n) return 0;
  // Post-terms progression counts as "reached Draft Terms or later".
  if (
    n.includes('term') ||
    n.includes('due diligence') ||
    n.includes('diligence') ||
    n.includes('agreement') ||
    n.includes('funded') ||
    n.includes('invoiced') ||
    n.includes('closed') ||
    n === 'won'
  ) return 7;
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

function downloadCsv(filename: string, rows: Array<Array<string | number>>) {
  const escape = (v: string | number) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = rows.map(r => r.map(escape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename.replace(/[^a-z0-9\-_]+/gi, '_')}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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
  const [dateRange, setDateRange] = useState<DateRange>('ytd');
  const [dealLenders, setDealLenders] = useState<DealLenderRow[]>([]);
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [stageConfigs, setStageConfigs] = useState<StageConfigRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [planOpen, setPlanOpen] = useState(false);

  // 5th Line tenant-only gating (tenant id, not email)
  const { hasAccess: isFifthLine } = useNaitivePipelineAccess();
  const now = new Date();
  const currentYear = now.getFullYear();
  // Always load both cadences so we can show whichever matches the user's view.
  const { data: monthlyPlan } = useAcquisitionPlan(
    isFifthLine ? FIFTH_LINE_COMPANY_ID : null,
    currentYear,
    'monthly',
  );
  const { data: quarterlyPlan } = useAcquisitionPlan(
    isFifthLine ? FIFTH_LINE_COMPANY_ID : null,
    currentYear,
    'quarterly',
  );

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [dlRes, dRes, scRes] = await Promise.all([
          // Fetch all deal_lenders; timeframe filtering happens client-side
          // against the parent deal's created_at. deal_lenders.created_at was
          // backfilled during migration, so all rows share ~identical
          // timestamps and can't drive cohort filtering.
          supabase.from('deal_lenders').select('id, deal_id, name, stage, substage, pass_reason, created_at, updated_at').limit(10000),
          supabase.from('deals').select('id, company, company_id, deal_type, manager, created_at, value').limit(10000),
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
      // Conversion rate definition:
      //   Denominator (`everSubmitted`) = lender was ADDED to a deal.
      //     Every deal_lenders row counts, regardless of current stage.
      //   Numerator   (`everTerms`)     = reached "Draft Terms" or any later
      //     stage (terms issued, due diligence, agreement pending, funded,
      //     closed / won).
      const everSubmitted = true;
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

  // KPI metrics — "Deals Sent" counts unique deals (not deal_lenders rows),
  // so a deal fanned out to many funding sources still counts once. Conversion
  // = unique deals that reached Draft Terms or later / unique deals sent.
  const kpis = useMemo(() => {
    const submittedSet = new Set<string>();
    const termsSet = new Set<string>();
    const activeSet = new Set<string>();
    for (const r of rows) {
      if (r.everSubmitted) submittedSet.add(r.deal_id);
      if (r.everTerms) termsSet.add(r.deal_id);
      if (!r.terminal.passed && !r.terminal.unresponsive && !r.terminal.onHold && r.ord > 0) activeSet.add(r.deal_id);
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

  // ─────────────────────────────────────────────────────────────────────────
  // Widget state
  // ─────────────────────────────────────────────────────────────────────────
  const [showNewLenders, setShowNewLenders] = useState(false);
  const [openLenderDeals, setOpenLenderDeals] = useState<string | null>(null);
  const [openPassReason, setOpenPassReason] = useState<string | null>(null);
  const [volumeSort, setVolumeSort] = useState<'volume' | 'count'>('volume');
  const [showAllVolume, setShowAllVolume] = useState(false);
  const [lenderDrawerSearch, setLenderDrawerSearch] = useState('');
  const [reasonDrawerSearch, setReasonDrawerSearch] = useState('');

  // KPI drill-down (top 4 widgets)
  type KpiDrill = 'active' | 'sent' | 'conv' | 'flex' | null;
  const [openKpi, setOpenKpi] = useState<KpiDrill>(null);
  const [kpiDrillSearch, setKpiDrillSearch] = useState('');
  useEffect(() => { if (!openKpi) setKpiDrillSearch(''); }, [openKpi]);

  // Widget 1: New Funding Sources
  const newLenders = useMemo(() => {
    const start = rangeStart(dateRange);
    const end = rangeEnd(dateRange);
    if (!start) {
      return { current: lenders.slice(), previous: [] as MasterLender[], delta: null as number | null };
    }
    const startMs = start.getTime();
    const now = end ? end.getTime() : Date.now();
    const windowMs = now - startMs;
    const prevStart = startMs - windowMs;
    const current: MasterLender[] = [];
    const previous: MasterLender[] = [];
    for (const l of lenders) {
      const t = new Date(l.created_at).getTime();
      if (isNaN(t)) continue;
      if (t >= startMs && t <= now) current.push(l);
      else if (t >= prevStart && t < startMs) previous.push(l);
    }
    return { current, previous, delta: current.length - previous.length };
  }, [lenders, dateRange]);

  // Widget 2: Deal Volume & Count by Funding Source
  type FundingAgg = { name: string; volume: number; count: number; rows: Enriched[]; dealIds: Set<string> };
  const byFundingSource: FundingAgg[] = useMemo(() => {
    const m = new Map<string, FundingAgg>();
    for (const r of rows) {
      const key = (r.name || '').trim() || 'Unknown';
      let agg = m.get(key);
      if (!agg) { agg = { name: key, volume: 0, count: 0, rows: [], dealIds: new Set() }; m.set(key, agg); }
      agg.rows.push(r);
      if (!agg.dealIds.has(r.deal_id)) {
        agg.dealIds.add(r.deal_id);
        agg.count += 1;
        agg.volume += Number(r.deal.value) || 0;
      }
    }
    return Array.from(m.values());
  }, [rows]);

  const totalFundingVolume = useMemo(
    () => byFundingSource.reduce((s, x) => s + x.volume, 0),
    [byFundingSource],
  );

  const sortedFundingSources = useMemo(() => {
    const arr = [...byFundingSource];
    arr.sort((a, b) =>
      volumeSort === 'volume'
        ? b.volume - a.volume || b.count - a.count
        : b.count - a.count || b.volume - a.volume,
    );
    return arr;
  }, [byFundingSource, volumeSort]);

  const visibleFundingSources = showAllVolume ? sortedFundingSources : sortedFundingSources.slice(0, 15);

  // ─── 5th Line acquisition plan vs actual ───────────────────────────────
  // Sum plan targets for months in the current date-range window (current
  // year only). Prefer monthly granularity; fall back to quarterly if no
  // monthly targets have been set.
  const planTarget = useMemo(() => {
    if (!isFifthLine) return null;
    const start = rangeStart(dateRange) ?? new Date(currentYear, 0, 1);
    const startD = new Date(
      Math.max(start.getTime(), new Date(currentYear, 0, 1).getTime()),
    );
    const endD = now;
    const startMonth = startD.getMonth() + 1; // 1..12
    const endMonth = endD.getMonth() + 1;
    const monthlySum = (monthlyPlan ?? [])
      .filter((p) => p.period >= startMonth && p.period <= endMonth)
      .reduce((s, p) => s + (Number(p.target_count) || 0), 0);
    if (monthlySum > 0) return monthlySum;
    const startQ = Math.ceil(startMonth / 3);
    const endQ = Math.ceil(endMonth / 3);
    const quarterlySum = (quarterlyPlan ?? [])
      .filter((p) => p.period >= startQ && p.period <= endQ)
      .reduce((s, p) => s + (Number(p.target_count) || 0), 0);
    return quarterlySum;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFifthLine, dateRange, monthlyPlan, quarterlyPlan, currentYear]);

  // Widget 3: Most Common Pass Reasons
  const passReasonsAgg = useMemo(() => {
    const passed = rows.filter(r => r.terminal.passed);
    const withReason = passed.filter(r => (r.pass_reason || '').trim().length > 0);
    const m = new Map<string, { reason: string; key: string; count: number; rows: Enriched[] }>();
    for (const r of withReason) {
      const raw = (r.pass_reason || '').trim();
      const key = raw.toLowerCase();
      let agg = m.get(key);
      if (!agg) { agg = { reason: raw, key, count: 0, rows: [] }; m.set(key, agg); }
      agg.count++;
      agg.rows.push(r);
    }
    const list = Array.from(m.values()).sort((a, b) => b.count - a.count);
    const coverage = passed.length > 0 ? withReason.length / passed.length : 0;
    return { list, totalPassed: passed.length, withReason: withReason.length, coverage };
  }, [rows]);

  const activePassReason = openPassReason
    ? passReasonsAgg.list.find(p => p.key === openPassReason)
    : null;

  const activeLenderRows = openLenderDeals
    ? byFundingSource.find(f => f.name === openLenderDeals)
    : null;

  const isEmpty = !loading && !error && rows.length === 0;

  // ─── Redesigned Lender Intelligence Dashboard derived data ────────────
  const [hoverLender, setHoverLender] = useState<string | null>(null);

  const lenderMeta = useMemo(() => {
    const tier = new Map<string, 'T1' | 'T2' | 'T3'>();
    const flex = new Set<string>();
    for (const l of lenders) {
      const key = (l.name || '').trim().toLowerCase();
      if (!key) continue;
      const rawTier = String((l as any).tier || '').trim().toUpperCase();
      if (rawTier === 'T1' || rawTier === 'TIER 1' || rawTier === '1') tier.set(key, 'T1');
      else if (rawTier === 'T2' || rawTier === 'TIER 2' || rawTier === '2') tier.set(key, 'T2');
      else if (rawTier === 'T3' || rawTier === 'TIER 3' || rawTier === '3') tier.set(key, 'T3');
      if ((l as any).flex_lender_id) flex.add(key);
    }
    return { tier, flex };
  }, [lenders]);

  type LenderStat = {
    name: string;
    key: string;
    tier: 'T1' | 'T2' | 'T3' | null;
    count: number;
    submitted: number;
    terms: number;
    conv: number;
    avgRespDays: number | null;
    flexActive: number; // rows updated in past 30d
    isFlex: boolean;
  };

  const lenderStats: LenderStat[] = useMemo(() => {
    const m = new Map<string, LenderStat & { _respSum: number; _respN: number; _dealIds: Set<string> }>();
    // Tie "flex active" activity window to the popup's timeframe selector so
    // every widget in the dialog reflects the same period (TTM, YTD, prior
    // year, etc.) instead of a fixed 30-day rolling window.
    const activityStart = rangeStart(dateRange)?.getTime() ?? 0;
    const activityEnd = rangeEnd(dateRange)?.getTime() ?? Date.now();
    for (const r of rows) {
      const name = (r.name || '').trim() || 'Unknown';
      const key = name.toLowerCase();
      let s = m.get(key);
      if (!s) {
        s = {
          name,
          key,
          tier: lenderMeta.tier.get(key) ?? null,
          count: 0,
          submitted: 0,
          terms: 0,
          conv: 0,
          avgRespDays: null,
          flexActive: 0,
          isFlex: lenderMeta.flex.has(key),
          _respSum: 0,
          _respN: 0,
          _dealIds: new Set(),
        };
        m.set(key, s);
      }
      if (!s._dealIds.has(r.deal_id)) {
        s._dealIds.add(r.deal_id);
        s.count += 1;
      }
      if (r.everSubmitted) s.submitted += 1;
      if (r.everTerms) s.terms += 1;
      const c = new Date(r.created_at).getTime();
      const u = new Date(r.updated_at).getTime();
      if (!isNaN(c) && !isNaN(u) && u >= c) {
        s._respSum += (u - c) / 86400000;
        s._respN += 1;
      }
      if (!isNaN(u) && u >= activityStart && u <= activityEnd) s.flexActive += 1;
    }
    const out: LenderStat[] = [];
    for (const s of m.values()) {
      s.conv = s.submitted > 0 ? s.terms / s.submitted : 0;
      s.avgRespDays = s._respN > 0 ? s._respSum / s._respN : null;
      out.push(s);
    }
    return out.sort((a, b) => b.count - a.count);
  }, [rows, lenderMeta, dateRange]);

  const activeLenderCount = lenderStats.length;
  const flexActiveLenderCount = useMemo(
    () => lenderStats.filter((l) => l.isFlex).length,
    [lenderStats],
  );

  // Deals sent delta vs prior period
  const priorSubmittedCount = useMemo(() => {
    const start = rangeStart(dateRange);
    const end = rangeEnd(dateRange);
    if (!start) return null;
    const startMs = start.getTime();
    const windowMs = (end ? end.getTime() : Date.now()) - startMs;
    const prevStart = startMs - windowMs;
    const prevEnd = startMs;
    const dealSet = new Set<string>();
    for (const dl of dealLenders) {
      const t = new Date(dl.created_at).getTime();
      if (isNaN(t)) continue;
      if (t < prevStart || t >= prevEnd) continue;
      const deal = dealMap.get(dl.deal_id);
      if (!deal) continue;
      const label = resolveLabel(dl.stage, deal.company_id);
      const ord = stageOrdinal(label);
      const term = isTerminal(label, dl.pass_reason);
      const ever = ord >= 3 || (term.passed && (label || '').toLowerCase().includes('drl'));
      if (ever) dealSet.add(dl.deal_id);
    }
    return dealSet.size;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealLenders, dealMap, dateRange, stageLabelByCompany]);

  const submittedDelta =
    priorSubmittedCount == null ? null : kpis.submitted - priorSubmittedCount;

  const passReasonsRanked = useMemo(() => {
    const total = passReasonsAgg.totalPassed || 1;
    return passReasonsAgg.list.slice(0, 8).map((p) => ({
      reason: p.reason,
      key: p.key,
      count: p.count,
      pct: (p.count / total) * 100,
    }));
  }, [passReasonsAgg]);

  // Data for the vertical Lender Conversion Rate bar chart. Ranks lenders by
  // absolute conversions (reached Draft Terms or later) so high-performing
  // partners surface even when higher-volume lenders never issued terms.
  // Tiebreak on conversion rate, then submitted volume. Coloured by tier.
  const conversionChartData = useMemo(() => {
    return lenderStats
      .filter((s) => s.terms > 0)
      .slice()
      .sort(
        (a, b) =>
          b.terms - a.terms ||
          b.conv - a.conv ||
          b.submitted - a.submitted,
      )
      .slice(0, 8)
      .map((s) => ({
        key: s.key,
        name: s.name,
        short: s.name.length > 10 ? s.name.slice(0, 10) + '…' : s.name,
        pct: +(s.conv * 100).toFixed(1),
        color: s.tier === 'T1' || s.tier === 'T2' ? '#4dd9ac' : '#60a5fa',
      }));
  }, [lenderStats]);

  const subtitleParts = [
    dateRangeLabel(dateRange),
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
              <DialogTitle className="text-[16px] font-semibold tracking-tight text-slate-100 flex items-baseline gap-2">
                <span>naitive</span>
                <span className="text-[13px] font-medium" style={{ color: '#4dd9ac' }}>Lender Intelligence Dashboard</span>
              </DialogTitle>
              <DialogDescription className="text-[12px] text-slate-400 mt-1">
                {subtitleParts.join(' · ')}
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
                <SelectTrigger
                  className="h-8 w-[168px] text-[12px] text-slate-200 hover:brightness-110"
                  style={{
                    background: 'hsl(220 45% 12%)',
                    borderColor: 'hsl(220 45% 40% / 0.28)',
                  }}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent
                  className="text-slate-100"
                  style={{
                    background: 'hsl(220 45% 12%)',
                    borderColor: 'hsl(220 45% 40% / 0.28)',
                  }}
                >
                  <SelectItem value="ytd">YTD</SelectItem>
                  <SelectItem value="6m">Last 6 Months</SelectItem>
                  <SelectItem value="12m">TTM (Trailing 12 Months)</SelectItem>
                  {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 1 - i).map((yr) => (
                    <SelectItem key={yr} value={`y${yr}`}>{yr}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isFifthLine && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-[12px] gap-1.5 bg-slate-900/60 border-slate-700/60 text-slate-200 hover:bg-slate-800/70"
                  onClick={() => setPlanOpen(true)}
                  title="Set acquisition targets for new qualified lenders"
                >
                  <Target className="h-3.5 w-3.5" /> Plan
                </Button>
              )}
              <Button variant="outline" size="sm" className="h-8 text-[12px] gap-1.5 bg-slate-900/60 border-slate-700/60 text-slate-200 hover:bg-slate-800/70" disabled title="Export coming soon">
                <Download className="h-3.5 w-3.5" /> Export
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-auto px-6 py-5 space-y-4" style={{ background: '#0f1117' }}>
          {/* KPI Row — big teal numbers */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <IntelKpi
              label="Active Lenders"
              value={activeLenderCount}
              hint="across all deals"
              loading={loading}
              onClick={() => setOpenKpi('active')}
            />
            <IntelKpi
              label="Deals Sent"
              value={kpis.submitted}
              hint="deal_lenders in selected timeframe"
              loading={loading}
              onClick={() => setOpenKpi('sent')}
            />
            <IntelKpi
              label="Conversion Rate"
              value={fmtPct(kpis.conv)}
              hint="added to deal → Draft Terms or later"
              loading={loading}
              onClick={() => setOpenKpi('conv')}
            />
            <IntelKpi
              label="Flex Active Lenders"
              value={flexActiveLenderCount}
              hint={
                activeLenderCount > 0
                  ? `${Math.round((flexActiveLenderCount / activeLenderCount) * 100)}% of total · active in Flex`
                  : 'active in Flex'
              }
              loading={loading}
              onClick={() => setOpenKpi('flex')}
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-950/40 p-3 text-[12px] text-red-300">
              Failed to load analytics: {error}
            </div>
          )}

          {isFifthLine && (
            <FundingSourcePerformanceCard
              tenantId={FIFTH_LINE_COMPANY_ID}
              lenders={lenders}
              onOpenPlan={() => setPlanOpen(true)}
              year={
                typeof dateRange === 'string' && dateRange.startsWith('y')
                  ? Number(dateRange.slice(1))
                  : currentYear
              }
            />
          )}

          {isEmpty && (
            <IntelPanel title="No data">
              <div className="p-8 text-center text-[13px] text-slate-400">
                No lender analytics available for current filters
              </div>
            </IntelPanel>
          )}

          {!isEmpty && (
            <>
              {/* Row 2 — narrow left volume list + right stacked (conversion chart + pass reasons) */}
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(240px,300px)_1fr] gap-3">
                <IntelPanel title="Deal Volume by Lender">
                  <div className="p-2">
                    {lenderStats.length === 0 ? (
                      <div className="py-6 text-center text-[12px] text-slate-500">No lender activity</div>
                    ) : (
                      <ul className="divide-y" style={{ borderColor: '#2a2f3d' }}>
                        {lenderStats.slice(0, 12).map((s) => {
                          const highlighted = hoverLender === s.key;
                          return (
                            <li
                              key={s.key}
                              onMouseEnter={() => setHoverLender(s.key)}
                              onMouseLeave={() => setHoverLender(null)}
                              className={cn(
                                'flex items-center gap-2 px-2 py-2 rounded transition-colors cursor-pointer',
                                highlighted ? 'bg-white/[0.04]' : 'hover:bg-white/[0.03]',
                              )}
                              onClick={() => setOpenLenderDeals(s.name)}
                            >
                              <span className="flex-1 truncate text-[12.5px] text-slate-100">{s.name}</span>
                              <span className="tabular-nums text-[12.5px] text-slate-300 w-6 text-right">{s.count}</span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </IntelPanel>

                <div className="flex flex-col gap-3 min-w-0">
                  <IntelPanel
                    title="Lender Conversion Rate"
                    subtitle="added to deal → terms issued"
                    subtitleTone="accent"
                  >
                    <div className="px-3 pb-3 pt-2 h-[240px]">
                      {conversionChartData.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-[12px] text-slate-500">
                          No conversion data
                        </div>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={conversionChartData}
                            margin={{ top: 4, right: 8, left: -12, bottom: 4 }}
                            onClick={(e: any) => {
                              const name = e?.activePayload?.[0]?.payload?.name;
                              if (name) setOpenLenderDeals(name);
                            }}
                          >
                            <CartesianGrid stroke="#2a2f3d" strokeDasharray="0" vertical={false} />
                            <XAxis
                              dataKey="short"
                              tick={{ fontSize: 11, fill: '#94a3b8' }}
                              stroke="#2a2f3d"
                              tickLine={false}
                              interval={0}
                            />
                            <YAxis
                              tick={{ fontSize: 10, fill: '#94a3b8' }}
                              stroke="#2a2f3d"
                              tickLine={false}
                              axisLine={false}
                              tickFormatter={(v) => `${v}%`}
                              domain={[0, (dataMax: number) => {
                                const m = Math.max(10, Math.ceil((dataMax || 0) / 10) * 10);
                                return Math.min(100, m);
                              }]}
                              allowDecimals={false}
                            />
                            <ReTooltip
                              cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                              contentStyle={{
                                background: '#1a1d27',
                                border: '1px solid #2a2f3d',
                                borderRadius: 6,
                                fontSize: 12,
                                color: '#e2e8f0',
                              }}
                              formatter={(v: number, _n, p: any) => [`${v}%`, p.payload.name]}
                              labelFormatter={() => ''}
                            />
                            <Bar dataKey="pct" radius={[3, 3, 0, 0]} cursor="pointer">
                              {conversionChartData.map((d) => (
                                <Cell
                                  key={d.key}
                                  fill={d.color}
                                  onClick={() => setOpenLenderDeals(d.name)}
                                  style={{ cursor: 'pointer' }}
                                />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </IntelPanel>

                  <IntelPanel title="Top 5 Pass Reasons">
                    <div className="px-4 py-3">
                      {passReasonsRanked.length === 0 ? (
                        <div className="py-4 text-center text-[12px] text-slate-500">
                          No passed deals with reasons captured
                        </div>
                      ) : (
                        <>
                          <ul className="space-y-2 list-disc pl-5 marker:text-[#4dd9ac]">
                            {passReasonsRanked.slice(0, 5).map((p) => (
                              <li
                                key={p.key}
                                className="text-[12.5px] text-slate-100 cursor-pointer hover:text-white"
                                onClick={() => setOpenPassReason(p.key)}
                              >
                                <div className="flex items-baseline justify-between gap-3">
                                  <span className="flex-1 min-w-0">{p.reason}</span>
                                  <span className="text-[11px] tabular-nums text-slate-400 shrink-0">
                                    {p.count} <span className="text-slate-500">({p.pct.toFixed(0)}%)</span>
                                  </span>
                                </div>
                              </li>
                            ))}
                          </ul>
                          <div className="mt-3 text-[11px] italic text-slate-500">
                            Based on {passReasonsAgg.totalPassed} lender pass{passReasonsAgg.totalPassed === 1 ? '' : 'es'} · {dateRangeLabel(dateRange)}
                          </div>
                        </>
                      )}
                    </div>
                  </IntelPanel>
                </div>
              </div>

              {/* Row 3 — Flex Engagement + Responsiveness Ratio */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <IntelPanel
                  title="Flex Engagement by Lender"
                  subtitle={`active sessions · ${dateRangeLabel(dateRange)}`}
                  subtitleTone="accent"
                  badge="live"
                >
                  <div className="px-4 pb-3 pt-1">
                    <div className="text-[11px] text-slate-500 mb-3">
                      Activity counted within the selected timeframe
                    </div>
                    {lenderStats.filter((s) => s.isFlex).length === 0 ? (
                      <div className="py-4 text-center text-[12px] text-slate-500">No Flex-connected lenders</div>
                    ) : (
                      <ul className="space-y-1.5 max-h-[220px] overflow-auto pr-1">
                        {lenderStats.filter((s) => s.isFlex).slice(0, 8).map((s) => {
                          const filled = Math.max(0, Math.min(5, s.flexActive));
                          const highlighted = hoverLender === s.key;
                          return (
                            <li
                              key={s.key}
                              onMouseEnter={() => setHoverLender(s.key)}
                              onMouseLeave={() => setHoverLender(null)}
                              className={cn(
                                'flex items-center gap-2 rounded px-2 py-1.5 transition-colors',
                                highlighted ? 'bg-white/[0.04]' : '',
                              )}
                            >
                              <span className="flex-1 truncate text-[12.5px] text-slate-100">{s.name}</span>
                              <div className="flex items-center gap-1">
                                {[0, 1, 2, 3, 4].map((i) => (
                                  <span
                                    key={i}
                                    className="h-2 w-2 rounded-full"
                                    style={{
                                      background: i < filled ? '#4dd9ac' : 'transparent',
                                      border: i < filled ? 'none' : '1px solid #3a4152',
                                    }}
                                  />
                                ))}
                              </div>
                              <span className="text-[11px] tabular-nums text-slate-500 w-8 text-right">{filled}/5</span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </IntelPanel>

                <IntelPanel
                  title="Responsiveness Ratio"
                  subtitle="emails received + emails sent · per lender"
                  badge="auto-filled"
                >
                  <div className="px-4 pb-3 pt-1">
                    {lenderStats.filter((s) => s.avgRespDays != null).length === 0 ? (
                      <div className="py-6 text-center text-[12px] text-slate-500">No response data</div>
                    ) : (
                      <ul className="space-y-2 max-h-[220px] overflow-auto pr-1">
                        {lenderStats.filter((s) => s.avgRespDays != null).slice(0, 8).map((s) => {
                          const d = s.avgRespDays as number;
                          const color = d <= 3 ? '#4dd9ac' : d <= 6 ? '#f5a623' : '#f87171';
                          const barW = Math.max(4, Math.min(100, (d / 14) * 100));
                          const highlighted = hoverLender === s.key;
                          return (
                            <li
                              key={s.key}
                              onMouseEnter={() => setHoverLender(s.key)}
                              onMouseLeave={() => setHoverLender(null)}
                              className={cn(
                                'rounded px-2 py-1 transition-colors',
                                highlighted ? 'bg-white/[0.04]' : '',
                              )}
                            >
                              <div className="flex items-center justify-between gap-2 text-[12.5px]">
                                <span className="text-slate-100 truncate">{s.name}</span>
                                <span className="tabular-nums text-slate-300 shrink-0">{d.toFixed(1)}d</span>
                              </div>
                              <div className="mt-1 h-1.5 rounded" style={{ background: '#2a2f3d' }}>
                                <div className="h-full rounded" style={{ width: `${barW}%`, background: color }} />
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </IntelPanel>
              </div>

              {/* Coming Soon — Next phases */}
              <div className="pt-2">
                <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500 mb-2 px-1">
                  Coming soon — next phases
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <PhaseCard title="Response Times by Lender" description="avg business days to reply · pulled from email data" phase={2} />
                  <PhaseCard title="Terms Quality Score" description="scored from post-deal survey · feeds tiering formula" phase={2} />
                  <PhaseCard title="Lender Activity Heat Map" description="weekly activity grid · darker = more active" phase={3} />
                </div>
              </div>
            </>
          )}
        </div>

        {/* Widget 1 drawer — New Funding Sources */}
        <Sheet open={showNewLenders} onOpenChange={setShowNewLenders}>
          <SheetContent side="right" className="w-[480px] sm:max-w-[520px] z-[1500] bg-slate-950 text-slate-100 border-slate-700/60">
            <SheetHeader>
              <SheetTitle className="text-slate-100">New Funding Sources</SheetTitle>
              <SheetDescription className="text-slate-400">
                {newLenders.current.length} added · {dateRangeLabel(dateRange)}
              </SheetDescription>
            </SheetHeader>
            <div className="mt-3 flex justify-end">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-[11px] bg-slate-900/60 border-slate-700/60 text-slate-200 hover:bg-slate-800/70 gap-1.5"
                onClick={() => downloadCsv('new-funding-sources', [
                  ['name', 'type', 'owner', 'created_at'],
                  ...newLenders.current.map(l => [l.name, l.lender_type || '', l.relationship_owners || '', l.created_at]),
                ])}
                disabled={newLenders.current.length === 0}
              >
                <Download className="h-3.5 w-3.5" /> CSV
              </Button>
            </div>
            <div className="mt-3 max-h-[calc(100vh-180px)] overflow-auto">
              {newLenders.current.length === 0 ? (
                <div className="p-6 text-center text-[12px] text-slate-500">No new funding sources in this window</div>
              ) : (
                <table className="w-full text-[12px]">
                  <thead className="text-left text-slate-400">
                    <tr><th className="py-1.5">Name</th><th>Type</th><th>Owner</th><th className="text-right">Created</th></tr>
                  </thead>
                  <tbody>
                    {newLenders.current.map(l => (
                      <tr key={l.id} className="border-t border-slate-700/40">
                        <td className="py-1.5 text-slate-100">{l.name}</td>
                        <td className="text-slate-300">{l.lender_type || '—'}</td>
                        <td className="text-slate-300 truncate max-w-[120px]">{l.relationship_owners || '—'}</td>
                        <td className="text-right text-slate-400 tabular-nums">{new Date(l.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </SheetContent>
        </Sheet>

        {/* Widget 2 drawer — Deals tied to a funding source */}
        <Sheet open={!!openLenderDeals} onOpenChange={(o) => { if (!o) { setOpenLenderDeals(null); setLenderDrawerSearch(''); } }}>
          <SheetContent side="right" className="w-[560px] sm:max-w-[640px] z-[1500] bg-slate-950 text-slate-100 border-slate-700/60">
            <SheetHeader>
              <SheetTitle className="text-slate-100 truncate">{openLenderDeals}</SheetTitle>
              <SheetDescription className="text-slate-400">
                {activeLenderRows
                  ? `${activeLenderRows.count} deal${activeLenderRows.count === 1 ? '' : 's'} · ${formatUSD(activeLenderRows.volume)} volume`
                  : ''}
              </SheetDescription>
            </SheetHeader>
            <div className="mt-3 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
                <Input
                  value={lenderDrawerSearch}
                  onChange={(e) => setLenderDrawerSearch(e.target.value)}
                  placeholder="Search deals…"
                  className="h-8 pl-7 text-[12px] bg-slate-900/60 border-slate-700/60"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-[11px] bg-slate-900/60 border-slate-700/60 text-slate-200 hover:bg-slate-800/70 gap-1.5"
                onClick={() => {
                  if (!activeLenderRows) return;
                  downloadCsv(`funding-source-${activeLenderRows.name}`, [
                    ['deal_title', 'stage', 'amount', 'owner', 'last_activity'],
                    ...activeLenderRows.rows.map(r => [
                      r.deal.company || '',
                      r.label || '',
                      String(r.deal.value ?? ''),
                      r.deal.manager || '',
                      r.updated_at,
                    ]),
                  ]);
                }}
                disabled={!activeLenderRows || activeLenderRows.rows.length === 0}
              >
                <Download className="h-3.5 w-3.5" /> CSV
              </Button>
            </div>
            <div className="mt-3 max-h-[calc(100vh-220px)] overflow-auto">
              {!activeLenderRows || activeLenderRows.rows.length === 0 ? (
                <div className="p-6 text-center text-[12px] text-slate-500">No deals</div>
              ) : (
                <table className="w-full text-[12px]">
                  <thead className="text-left text-slate-400">
                    <tr>
                      <th className="py-1.5">Deal</th><th>Stage</th>
                      <th className="text-right pr-4 whitespace-nowrap">Amount</th>
                      <th className="pl-4 whitespace-nowrap">Owner</th>
                      <th className="text-right pl-4 whitespace-nowrap">Last Activity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeLenderRows.rows
                      .filter(r => {
                        const q = lenderDrawerSearch.trim().toLowerCase();
                        if (!q) return true;
                        return [r.deal.company, r.label, r.deal.manager].some(s => (s || '').toLowerCase().includes(q));
                      })
                      .map(r => (
                        <tr key={r.id} className="border-t border-slate-700/40">
                          <td className="py-1.5 text-slate-100 truncate max-w-[180px]">{r.deal.company || '—'}</td>
                          <td className="max-w-[160px]"><StageTag label={r.label} /></td>
                          <td className="text-right pr-4 text-slate-200 tabular-nums whitespace-nowrap">{r.deal.value != null ? formatUSD(Number(r.deal.value)) : '—'}</td>
                          <td className="pl-4 text-slate-300 truncate max-w-[120px]">{r.deal.manager || '—'}</td>
                          <td className="text-right pl-4 text-slate-400 tabular-nums whitespace-nowrap">{new Date(r.updated_at).toLocaleDateString()}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>
          </SheetContent>
        </Sheet>

        {/* Widget 3 drawer — Pass reason drilldown */}
        <Sheet open={!!openPassReason} onOpenChange={(o) => { if (!o) { setOpenPassReason(null); setReasonDrawerSearch(''); } }}>
          <SheetContent side="right" className="w-[640px] sm:max-w-[720px] z-[1500] bg-slate-950 text-slate-100 border-slate-700/60">
            <SheetHeader>
              <SheetTitle className="text-slate-100">Pass reason</SheetTitle>
              <SheetDescription className="text-slate-400 break-words">
                {activePassReason?.reason}
              </SheetDescription>
            </SheetHeader>
            {activePassReason && (() => {
              const total = activePassReason.count;
              const byLender = new Map<string, number>();
              for (const r of activePassReason.rows) {
                const k = (r.name || 'Unknown').trim() || 'Unknown';
                byLender.set(k, (byLender.get(k) || 0) + 1);
              }
              const lenderList = Array.from(byLender.entries())
                .map(([name, count]) => ({ name, count, pct: total > 0 ? (count / total) * 100 : 0 }))
                .sort((a, b) => b.count - a.count);
              const q = reasonDrawerSearch.trim().toLowerCase();
              const filteredLenders = q
                ? lenderList.filter(l => l.name.toLowerCase().includes(q))
                : lenderList;
              const filteredDeals = q
                ? activePassReason.rows.filter(r =>
                    [r.deal.company, r.name, r.deal.manager].some(s => (s || '').toLowerCase().includes(q)))
                : activePassReason.rows;
              return (
                <>
                  <div className="mt-3 flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
                      <Input
                        value={reasonDrawerSearch}
                        onChange={(e) => setReasonDrawerSearch(e.target.value)}
                        placeholder="Search lender or deal…"
                        className="h-8 pl-7 text-[12px] bg-slate-900/60 border-slate-700/60"
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-[11px] bg-slate-900/60 border-slate-700/60 text-slate-200 hover:bg-slate-800/70 gap-1.5"
                      onClick={() => downloadCsv(`pass-reason-${activePassReason.reason.slice(0, 40)}`, [
                        ['section', 'lender', 'deal', 'amount', 'owner', 'date'],
                        ...lenderList.map(l => ['by_lender', l.name, '', '', '', '']),
                        ...activePassReason.rows.map(r => ['by_deal', r.name || '', r.deal.company || '', String(r.deal.value ?? ''), r.deal.manager || '', r.updated_at]),
                      ])}
                    >
                      <Download className="h-3.5 w-3.5" /> CSV
                    </Button>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-3 max-h-[calc(100vh-220px)] overflow-auto">
                    <div className="rounded-lg border border-slate-700/40 p-2">
                      <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-1.5 px-1">By Lender</div>
                      <table className="w-full text-[12px]">
                        <thead className="text-left text-slate-500">
                          <tr><th className="py-1 px-1">Lender</th><th className="text-right px-1">Count</th><th className="text-right px-1">%</th></tr>
                        </thead>
                        <tbody>
                          {filteredLenders.map(l => (
                            <tr key={l.name} className="border-t border-slate-700/40">
                              <td className="py-1 px-1 text-slate-100 truncate max-w-[260px]">{l.name}</td>
                              <td className="py-1 px-1 text-right text-slate-200 tabular-nums">{l.count}</td>
                              <td className="py-1 px-1 text-right text-slate-400 tabular-nums">{l.pct.toFixed(1)}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="rounded-lg border border-slate-700/40 p-2">
                      <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-1.5 px-1">By Deal</div>
                      <table className="w-full text-[12px]">
                        <thead className="text-left text-slate-500">
                          <tr>
                            <th className="py-1 px-1">Deal</th><th className="px-1">Lender</th>
                            <th className="text-right px-1 pr-4 whitespace-nowrap">Amount</th>
                            <th className="px-1 pl-3 whitespace-nowrap">Owner</th>
                            <th className="text-right px-1 pl-3 whitespace-nowrap">Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredDeals.map(r => (
                            <tr key={r.id} className="border-t border-slate-700/40">
                              <td className="py-1 px-1 text-slate-100 truncate max-w-[160px]">{r.deal.company || '—'}</td>
                              <td className="py-1 px-1 text-slate-300 truncate max-w-[120px]">{r.name || '—'}</td>
                              <td className="py-1 px-1 pr-4 text-right text-slate-200 tabular-nums whitespace-nowrap">{r.deal.value != null ? formatUSD(Number(r.deal.value)) : '—'}</td>
                              <td className="py-1 px-1 pl-3 text-slate-300 truncate max-w-[110px]">{r.deal.manager || '—'}</td>
                              <td className="py-1 px-1 pl-3 text-right text-slate-400 tabular-nums whitespace-nowrap">{new Date(r.updated_at).toLocaleDateString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              );
            })()}
          </SheetContent>
        </Sheet>
      </DialogContent>
      {/* KPI drill-down sheet — Active Lenders / Deals Sent / Conversion / Flex Active */}
      <Sheet open={!!openKpi} onOpenChange={(o) => { if (!o) setOpenKpi(null); }}>
        <SheetContent side="right" className="w-[640px] sm:max-w-[720px] z-[1600] bg-slate-950 text-slate-100 border-slate-700/60">
          {openKpi && (() => {
            const title =
              openKpi === 'active' ? 'Active Lenders' :
              openKpi === 'sent' ? 'Deals Sent' :
              openKpi === 'conv' ? 'Conversion Rate' :
              'Flex Active Lenders';
            const subtitle =
              openKpi === 'active' ? `${activeLenderCount} lenders · ${dateRangeLabel(dateRange)}` :
              openKpi === 'sent' ? `${kpis.submitted} unique deals sent · ${dateRangeLabel(dateRange)}` :
              openKpi === 'conv' ? `${kpis.terms} of ${kpis.submitted} deals reached terms (${fmtPct(kpis.conv)}) · ${dateRangeLabel(dateRange)}` :
              `${flexActiveLenderCount} Flex-linked lenders active · ${dateRangeLabel(dateRange)}`;
            const q = kpiDrillSearch.trim().toLowerCase();
            // Build rows for the table view depending on drill type
            let mode: 'lenders' | 'deals' = 'lenders';
            let lenderRows: LenderStat[] = [];
            let dealRows: Enriched[] = [];
            // Collapse deal_lenders rows to one row per deal so a deal fanned
            // out to many funding sources isn't listed multiple times. Prefer
            // the furthest-along stage (highest ord), tiebreak on most recent.
            const dedupeByDeal = (list: Enriched[]): Enriched[] => {
              const best = new Map<string, Enriched>();
              for (const r of list) {
                const prev = best.get(r.deal_id);
                if (
                  !prev ||
                  r.ord > prev.ord ||
                  (r.ord === prev.ord &&
                    new Date(r.updated_at).getTime() >
                      new Date(prev.updated_at).getTime())
                ) {
                  best.set(r.deal_id, r);
                }
              }
              return Array.from(best.values());
            };
            if (openKpi === 'active') {
              mode = 'lenders';
              lenderRows = lenderStats;
            } else if (openKpi === 'flex') {
              mode = 'lenders';
              lenderRows = lenderStats.filter((l) => l.isFlex);
            } else if (openKpi === 'sent') {
              mode = 'deals';
              dealRows = dedupeByDeal(rows.filter((r) => r.everSubmitted));
            } else {
              // conversion: show terms rows
              mode = 'deals';
              dealRows = dedupeByDeal(rows.filter((r) => r.everTerms));
            }
            const filteredLenders = q
              ? lenderRows.filter((l) => l.name.toLowerCase().includes(q))
              : lenderRows;
            const filteredDeals = q
              ? dealRows.filter((r) =>
                  [r.deal.company, r.name, r.deal.manager, r.label].some((s) =>
                    (s || '').toLowerCase().includes(q),
                  ),
                )
              : dealRows;
            const csvExport = () => {
              if (mode === 'lenders') {
                downloadCsv(`kpi-${openKpi}`, [
                  ['lender', 'tier', 'deals', 'submitted', 'terms', 'conv_pct', 'flex'],
                  ...filteredLenders.map((l) => [
                    l.name,
                    l.tier ?? '',
                    l.count,
                    l.submitted,
                    l.terms,
                    (l.conv * 100).toFixed(1),
                    l.isFlex ? 'yes' : 'no',
                  ]),
                ]);
              } else {
                downloadCsv(`kpi-${openKpi}`, [
                  ['deal', 'lender', 'stage', 'amount', 'owner', 'last_activity'],
                  ...filteredDeals.map((r) => [
                    r.deal.company || '',
                    r.name || '',
                    r.label || '',
                    String(r.deal.value ?? ''),
                    r.deal.manager || '',
                    r.updated_at,
                  ]),
                ]);
              }
            };
            return (
              <>
                <SheetHeader>
                  <SheetTitle className="text-slate-100">{title}</SheetTitle>
                  <SheetDescription className="text-slate-400">{subtitle}</SheetDescription>
                </SheetHeader>
                <div className="mt-3 flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
                    <Input
                      value={kpiDrillSearch}
                      onChange={(e) => setKpiDrillSearch(e.target.value)}
                      placeholder={mode === 'lenders' ? 'Search lender…' : 'Search deal or lender…'}
                      className="h-8 pl-7 text-[12px] bg-slate-900/60 border-slate-700/60"
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-[11px] bg-slate-900/60 border-slate-700/60 text-slate-200 hover:bg-slate-800/70 gap-1.5"
                    onClick={csvExport}
                    disabled={mode === 'lenders' ? filteredLenders.length === 0 : filteredDeals.length === 0}
                  >
                    <Download className="h-3.5 w-3.5" /> CSV
                  </Button>
                </div>
                <div className="mt-3 max-h-[calc(100vh-200px)] overflow-auto">
                  {mode === 'lenders' ? (
                    filteredLenders.length === 0 ? (
                      <div className="p-6 text-center text-[12px] text-slate-500">No lenders</div>
                    ) : (
                      <table className="w-full text-[12px]">
                        <thead className="text-left text-slate-400">
                          <tr>
                            <th className="py-1.5">Lender</th>
                            <th className="text-right pr-3">Tier</th>
                            <th className="text-right pr-3">Deals</th>
                            <th className="text-right pr-3">Submitted</th>
                            <th className="text-right pr-3">Terms</th>
                            <th className="text-right pr-3">Conv</th>
                            <th className="text-right">Flex</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredLenders.map((l) => (
                            <tr key={l.key} className="border-t border-slate-700/40">
                              <td className="py-1.5 text-slate-100 truncate max-w-[220px]">{l.name}</td>
                              <td className="text-right pr-3 text-slate-300 tabular-nums">{l.tier ?? '—'}</td>
                              <td className="text-right pr-3 text-slate-200 tabular-nums">{l.count}</td>
                              <td className="text-right pr-3 text-slate-200 tabular-nums">{l.submitted}</td>
                              <td className="text-right pr-3 text-slate-200 tabular-nums">{l.terms}</td>
                              <td className="text-right pr-3 text-slate-300 tabular-nums">
                                {l.submitted > 0 ? `${(l.conv * 100).toFixed(1)}%` : '—'}
                              </td>
                              <td className="text-right text-slate-300">{l.isFlex ? 'Yes' : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )
                  ) : filteredDeals.length === 0 ? (
                    <div className="p-6 text-center text-[12px] text-slate-500">No deals</div>
                  ) : (
                    <table className="w-full text-[12px]">
                      <thead className="text-left text-slate-400">
                        <tr>
                          <th className="py-1.5">Deal</th>
                          <th>Lender</th>
                          <th>Stage</th>
                          <th className="text-right pr-3 whitespace-nowrap">Amount</th>
                          <th className="whitespace-nowrap">Owner</th>
                          <th className="text-right whitespace-nowrap">Last Activity</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredDeals.map((r) => (
                          <tr key={r.id} className="border-t border-slate-700/40">
                            <td className="py-1.5 text-slate-100 truncate max-w-[160px]">{r.deal.company || '—'}</td>
                            <td className="text-slate-300 truncate max-w-[140px]">{r.name || '—'}</td>
                            <td className="max-w-[140px]"><StageTag label={r.label} /></td>
                            <td className="text-right pr-3 text-slate-200 tabular-nums whitespace-nowrap">
                              {r.deal.value != null ? formatUSD(Number(r.deal.value)) : '—'}
                            </td>
                            <td className="text-slate-300 truncate max-w-[120px]">{r.deal.manager || '—'}</td>
                            <td className="text-right text-slate-400 tabular-nums whitespace-nowrap">
                              {new Date(r.updated_at).toLocaleDateString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>
      {isFifthLine && (
        <FundingSourcePlanModal
          open={planOpen}
          onOpenChange={setPlanOpen}
          tenantId={FIFTH_LINE_COMPANY_ID}
        />
      )}
    </Dialog>
  );
}

function KpiCard({
  label,
  value,
  hint,
  loading,
  onClick,
  deltaDir,
}: {
  label: string;
  value: number | string;
  hint?: string;
  loading?: boolean;
  onClick?: () => void;
  deltaDir?: 'up' | 'down' | 'flat';
}) {
  const hintColor =
    deltaDir === 'up' ? 'text-emerald-400'
    : deltaDir === 'down' ? 'text-rose-400'
    : 'text-slate-500';
  const Inner = (
    <>
      <div className="text-[11px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className="text-[22px] font-semibold tabular-nums text-slate-100 mt-0.5">
        {loading ? <span className="inline-block h-5 w-16 bg-slate-700/40 rounded animate-pulse" /> : value}
      </div>
      {hint && <div className={cn('text-[11px] mt-0.5', hintColor)}>{hint}</div>}
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="rounded-lg border p-3 text-left transition-colors hover:border-sky-500/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60"
        style={PANEL_STYLE}
      >
        {Inner}
      </button>
    );
  }
  return (
    <div className="rounded-lg border p-3" style={PANEL_STYLE}>
      {Inner}
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

// ─── Lender Intelligence Dashboard primitives ─────────────────────────────
const INTEL_CARD_STYLE: CSSProperties = {
  background: '#1a1d27',
  borderColor: '#2a2f3d',
};

function IntelKpi({
  label,
  value,
  hint,
  hintTone = 'muted',
  loading,
  onClick,
}: {
  label: string;
  value: number | string;
  hint?: string;
  hintTone?: 'muted' | 'good' | 'bad';
  loading?: boolean;
  onClick?: () => void;
}) {
  const hintColor = hintTone === 'good' ? '#4dd9ac' : hintTone === 'bad' ? '#f87171' : '#94a3b8';
  const Inner = (
    <>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500 font-medium">{label}</div>
        {onClick && (
          <span className="text-[10px] text-slate-500 group-hover:text-sky-300 transition-colors">Drill →</span>
        )}
      </div>
      <div className="text-[38px] leading-none font-semibold tabular-nums" style={{ color: '#4dd9ac' }}>
        {loading ? <span className="inline-block h-9 w-16 rounded animate-pulse" style={{ background: '#2a2f3d' }} /> : value}
      </div>
      {hint && <div className="text-[11px] leading-snug mt-0.5" style={{ color: hintColor }}>{hint}</div>}
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="group rounded-lg border p-4 flex flex-col gap-1.5 text-left transition-colors hover:border-sky-500/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60"
        style={INTEL_CARD_STYLE}
      >
        {Inner}
      </button>
    );
  }
  return (
    <div className="rounded-lg border p-4 flex flex-col gap-1.5" style={INTEL_CARD_STYLE}>
      {Inner}
    </div>
  );
}

function IntelPanel({
  title,
  subtitle,
  subtitleTone = 'muted',
  badge,
  children,
}: {
  title: string;
  subtitle?: string;
  subtitleTone?: 'muted' | 'accent';
  badge?: 'live' | 'auto-filled';
  children: React.ReactNode;
}) {
  const badgeStyle =
    badge === 'auto-filled'
      ? { background: 'rgba(96, 165, 250, 0.15)', color: '#60a5fa', border: '1px solid rgba(96, 165, 250, 0.4)' }
      : { background: 'rgba(77, 217, 172, 0.15)', color: '#4dd9ac', border: '1px solid rgba(77, 217, 172, 0.4)' };
  const badgeLabel = badge === 'auto-filled' ? 'AUTO-FILLED' : 'LIVE';
  const subtitleColor = subtitleTone === 'accent' ? '#4dd9ac' : '#64748b';
  return (
    <div className="rounded-lg border overflow-hidden" style={INTEL_CARD_STYLE}>
      <div className="flex items-start justify-between gap-2 px-4 pt-3 pb-2">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.14em] font-medium text-slate-400 truncate">
            {title}
          </div>
          {subtitle && (
            <div className="text-[11.5px] mt-1 truncate" style={{ color: subtitleColor }}>
              {subtitle}
            </div>
          )}
        </div>
        {badge && (
          <span
            className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-semibold tracking-wider shrink-0"
            style={badgeStyle}
          >
            {badgeLabel}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function PhaseCard({
  title,
  description,
  phase,
}: {
  title: string;
  description: string;
  phase: number;
}) {
  return (
    <div
      className="rounded-lg border p-4 flex flex-col gap-2 opacity-70"
      style={{ background: '#151822', borderColor: '#242835' }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-[10px] uppercase tracking-[0.14em] font-medium text-slate-400">
          {title}
        </div>
        <span
          className="text-[10px] font-medium rounded px-1.5 py-0.5 shrink-0"
          style={{ background: '#242835', color: '#94a3b8', border: '1px solid #2a2f3d' }}
        >
          Phase {phase}
        </span>
      </div>
      <div className="text-[11.5px] text-slate-500 leading-snug">{description}</div>
    </div>
  );
}
