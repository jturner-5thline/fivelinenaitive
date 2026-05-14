import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Activity,
  Send,
  XCircle,
  CheckCircle2,
  CalendarRange,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Search,
  ExternalLink,
  Mail,
  Calendar as CalendarIcon,
  TrendingUp,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { isExcludedDealName } from '@/utils/excludedDeals';
import type { MasterLender } from '@/hooks/useMasterLenders';
import { cn } from '@/lib/utils';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as ReTooltip,
  LineChart,
  Line,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

type DateRange = '30d' | '90d' | 'ytd' | '12m' | 'all';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lenders: MasterLender[];
}

interface DealLenderRow {
  id: string;
  deal_id: string;
  name: string;
  stage: string;
  pass_reason: string | null;
  created_at: string;
  updated_at: string;
  last_contact_at: string | null;
}

interface DealRow {
  id: string;
  company: string | null;
  created_at: string;
}

interface CalendarRow {
  id: string;
  title: string | null;
  start_time: string | null;
  attendees: string[];
}

interface EmailRow {
  id: string;
  subject: string | null;
  from_email: string | null;
  to_emails: string[] | null;
  received_at: string | null;
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
    case '12m': {
      const d = new Date(now); d.setFullYear(d.getFullYear() - 1); return d;
    }
    case 'ytd': return new Date(now.getFullYear(), 0, 1);
    case 'all': return null;
  }
}

function isPassStage(stage: string | null | undefined, pass_reason: string | null | undefined) {
  if (!stage) return !!pass_reason;
  const s = stage.toLowerCase();
  return s.includes('pass') || s.includes('declin') || s.includes('lost') || !!pass_reason;
}

function profileCompletenessScore(l: MasterLender) {
  const fields: Array<unknown> = [
    l.name,
    l.contact_name,
    l.email,
    l.contact_phone,
    l.lender_type,
    l.geo,
    l.min_deal,
    l.max_deal,
    (l.loan_types && l.loan_types.length > 0) || null,
    (l.industries && l.industries.length > 0) || null,
    l.company_requirements || l.deal_structure_notes,
    l.tier,
  ];
  const filled = fields.filter(v => v !== null && v !== undefined && v !== '').length;
  return Math.round((filled / fields.length) * 100);
}

const COLORS = ['hsl(var(--primary))', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

export function LenderAnalyticsDialog({ open, onOpenChange, lenders }: Props) {
  const navigate = useNavigate();
  const [dateRange, setDateRange] = useState<DateRange>('90d');
  const [tierFilter, setTierFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('active');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');

  const [dealLenders, setDealLenders] = useState<DealLenderRow[]>([]);
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [events, setEvents] = useState<CalendarRow[]>([]);
  const [emails, setEmails] = useState<EmailRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [drilldown, setDrilldown] = useState<MasterLender | null>(null);

  // Load data when opened or date range changes
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const start = rangeStart(dateRange);
      const startIso = start?.toISOString();
      try {
        const [dlRes, dRes, evRes, mailRes] = await Promise.all([
          (() => {
            let q = supabase.from('deal_lenders').select('id, deal_id, name, stage, pass_reason, created_at, updated_at, last_contact_at').limit(5000);
            if (startIso) q = q.gte('created_at', startIso);
            return q;
          })(),
          supabase.from('deals').select('id, company, created_at').limit(5000),
          (() => {
            let q = supabase.from('calendar_events').select('id, title, start_time, attendees').limit(2000).order('start_time', { ascending: false });
            if (startIso) q = q.gte('start_time', startIso);
            return q;
          })(),
          (() => {
            let q = supabase.from('gmail_messages').select('id, subject, from_email, to_emails, received_at').limit(2000).order('received_at', { ascending: false });
            if (startIso) q = q.gte('received_at', startIso);
            return q;
          })(),
        ]);
        if (cancelled) return;
        setDealLenders((dlRes.data ?? []) as DealLenderRow[]);
        setDeals((dRes.data ?? []) as DealRow[]);
        setEvents((evRes.data ?? []) as CalendarRow[]);
        setEmails((mailRes.data ?? []) as EmailRow[]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, dateRange]);

  // Build a map of valid deal ids (after exclusion) and id -> name
  const dealMap = useMemo(() => {
    const m = new Map<string, DealRow>();
    for (const d of deals) {
      if (isExcludedDealName(d.company)) continue;
      m.set(d.id, d);
    }
    return m;
  }, [deals]);

  const filteredDealLenders = useMemo(
    () => dealLenders.filter(dl => dealMap.has(dl.deal_id)),
    [dealLenders, dealMap]
  );

  const tiers = useMemo(() => {
    const s = new Set<string>();
    lenders.forEach(l => l.tier && s.add(l.tier));
    return Array.from(s).sort();
  }, [lenders]);

  const visibleLenders = useMemo(() => {
    return lenders.filter(l => {
      if (tierFilter !== 'all' && l.tier !== tierFilter) return false;
      if (search && !l.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [lenders, tierFilter, search]);

  // Aggregate metrics keyed by lender name (deal_lenders use name string)
  const metricsByName = useMemo(() => {
    const map = new Map<string, {
      sent: number;
      passed: number;
      active: number;
      lastContact: string | null;
      dealIds: Set<string>;
    }>();
    for (const dl of filteredDealLenders) {
      const key = dl.name.trim().toLowerCase();
      if (!key) continue;
      let m = map.get(key);
      if (!m) {
        m = { sent: 0, passed: 0, active: 0, lastContact: null, dealIds: new Set() };
        map.set(key, m);
      }
      m.sent++;
      m.dealIds.add(dl.deal_id);
      if (isPassStage(dl.stage, dl.pass_reason)) m.passed++;
      else m.active++;
      const contact = dl.last_contact_at || dl.updated_at || dl.created_at;
      if (contact && (!m.lastContact || contact > m.lastContact)) m.lastContact = contact;
    }
    return map;
  }, [filteredDealLenders]);

  // Visible lender rows enriched
  const enrichedRows = useMemo(() => {
    return visibleLenders.map(l => {
      const key = l.name.trim().toLowerCase();
      const m = metricsByName.get(key);
      const completeness = profileCompletenessScore(l);
      const lenderEmail = (l.email || '').toLowerCase();
      const lenderName = l.name.toLowerCase();
      let meetings = 0;
      if (lenderEmail || lenderName) {
        for (const ev of events) {
          const inAttendees = lenderEmail && ev.attendees?.some(a => (a || '').toLowerCase().includes(lenderEmail));
          const inTitle = lenderName && (ev.title || '').toLowerCase().includes(lenderName);
          if (inAttendees || inTitle) meetings++;
        }
      }
      let emailCount = 0;
      if (lenderEmail || lenderName) {
        for (const em of emails) {
          const matchEmail = lenderEmail && (
            (em.from_email || '').toLowerCase().includes(lenderEmail) ||
            (em.to_emails || []).some(t => (t || '').toLowerCase().includes(lenderEmail))
          );
          const matchSubject = lenderName && (em.subject || '').toLowerCase().includes(lenderName);
          if (matchEmail || matchSubject) emailCount++;
        }
      }
      return {
        lender: l,
        sent: m?.sent ?? 0,
        passed: m?.passed ?? 0,
        active: m?.active ?? 0,
        passRate: m && m.sent > 0 ? m.passed / m.sent : 0,
        lastContact: m?.lastContact ?? null,
        dealCount: m?.dealIds.size ?? 0,
        completeness,
        meetings,
        emails: emailCount,
      };
    });
  }, [visibleLenders, metricsByName, events, emails]);

  const sortedFor = (key: 'sent' | 'passed' | 'active' | 'meetings' | 'completeness') => {
    const rows = [...enrichedRows].sort((a, b) =>
      sortDir === 'desc' ? (b[key] as number) - (a[key] as number) : (a[key] as number) - (b[key] as number)
    );
    return rows;
  };

  const completenessSummary = useMemo(() => {
    let complete = 0, partial = 0, empty = 0;
    for (const r of enrichedRows) {
      if (r.completeness >= 70) complete++;
      else if (r.completeness >= 30) partial++;
      else empty++;
    }
    return [
      { name: 'Complete (≥70%)', value: complete },
      { name: 'Partial (30–69%)', value: partial },
      { name: 'Incomplete (<30%)', value: empty },
    ];
  }, [enrichedRows]);

  // Trend series for Active by month (last 12 months window of the data we loaded)
  const trend = useMemo(() => {
    const buckets = new Map<string, { month: string; sent: number; passed: number }>();
    for (const dl of filteredDealLenders) {
      const d = new Date(dl.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      let b = buckets.get(key);
      if (!b) { b = { month: key, sent: 0, passed: 0 }; buckets.set(key, b); }
      b.sent++;
      if (isPassStage(dl.stage, dl.pass_reason)) b.passed++;
    }
    return Array.from(buckets.values()).sort((a, b) => a.month.localeCompare(b.month));
  }, [filteredDealLenders]);

  const drilldownDeals = useMemo(() => {
    if (!drilldown) return [];
    const key = drilldown.name.trim().toLowerCase();
    const rows = filteredDealLenders.filter(dl => dl.name.trim().toLowerCase() === key);
    return rows.map(r => ({
      ...r,
      dealName: dealMap.get(r.deal_id)?.company ?? '—',
    }));
  }, [drilldown, filteredDealLenders, dealMap]);

  const renderRankingTable = (
    rows: typeof enrichedRows,
    valueKey: 'sent' | 'passed' | 'active' | 'meetings',
    label: string,
  ) => (
    <ScrollArea className="h-[420px] rounded-md border border-white/5 bg-background/40">
      <table className="w-full text-[13px]">
        <thead className="sticky top-0 bg-muted/40 backdrop-blur z-10">
          <tr className="text-left text-muted-foreground">
            <th className="px-3 py-2 font-medium w-10">#</th>
            <th className="px-3 py-2 font-medium">Lender</th>
            <th className="px-3 py-2 font-medium">Tier</th>
            <th className="px-3 py-2 font-medium text-right">
              <button
                className="inline-flex items-center gap-1 hover:text-foreground"
                onClick={() => setSortDir(d => (d === 'desc' ? 'asc' : 'desc'))}
              >
                {label}
                {sortDir === 'desc' ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />}
              </button>
            </th>
            <th className="px-3 py-2 font-medium text-right">Deals</th>
            <th className="px-3 py-2 font-medium text-right">Pass rate</th>
            <th className="px-3 py-2 font-medium text-right">Last contact</th>
            <th className="px-3 py-2 w-8" />
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 100).map((r, i) => (
            <tr
              key={r.lender.id}
              className="border-t border-white/5 hover:bg-white/[0.03] cursor-pointer"
              onClick={() => setDrilldown(r.lender)}
            >
              <td className="px-3 py-2 text-muted-foreground tabular-nums">{i + 1}</td>
              <td className="px-3 py-2">
                <div className="font-medium text-foreground">{r.lender.name}</div>
                <div className="text-[11px] text-muted-foreground truncate max-w-[260px]">
                  {r.lender.lender_type ?? '—'}
                </div>
              </td>
              <td className="px-3 py-2">
                {r.lender.tier ? <Badge variant="secondary" className="text-[10px]">{r.lender.tier}</Badge> : <span className="text-muted-foreground">—</span>}
              </td>
              <td className="px-3 py-2 text-right tabular-nums font-semibold">{r[valueKey]}</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.dealCount}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {r.sent > 0 ? `${Math.round(r.passRate * 100)}%` : '—'}
              </td>
              <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">
                {r.lastContact ? new Date(r.lastContact).toLocaleDateString() : '—'}
              </td>
              <td className="px-3 py-2 text-right">
                <ArrowUpDown className="h-3 w-3 text-muted-foreground/40" />
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={8} className="px-3 py-12 text-center text-muted-foreground text-[12px]">
                No data for the selected filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </ScrollArea>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] h-[92vh] flex flex-col p-0 gap-0 border-white/5 bg-background shadow-[0_24px_64px_-20px_rgba(0,0,0,0.55)] overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-4 shrink-0 space-y-0 bg-gradient-to-b from-muted/20 to-transparent border-b border-white/5">
          <div className="flex items-end justify-between gap-6 flex-wrap">
            <div className="flex items-center gap-4">
              <DialogTitle className="text-[15px] font-semibold tracking-tight text-foreground leading-none flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                Lender Analytics & Insights
              </DialogTitle>
              <div className="flex items-center gap-4 pl-4 border-l border-white/5 text-[11px] text-muted-foreground/80">
                <span>{enrichedRows.length} lenders</span>
                <span>{filteredDealLenders.length} deal placements</span>
                <span>{events.length} meetings · {emails.length} emails (sample)</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
                <SelectTrigger className="h-8 w-[160px] text-[12px] bg-background border-white/10">
                  <CalendarRange className="h-3.5 w-3.5 mr-1.5" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(DATE_LABEL) as DateRange[]).map(k => (
                    <SelectItem key={k} value={k}>{DATE_LABEL[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={tierFilter} onValueChange={setTierFilter}>
                <SelectTrigger className="h-8 w-[130px] text-[12px] bg-background border-white/10">
                  <SelectValue placeholder="All tiers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All tiers</SelectItem>
                  {tiers.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search lenders..."
                  className="h-8 pl-7 w-[220px] text-[12px] bg-background border-white/10"
                />
              </div>
            </div>
          </div>
          <DialogDescription className="sr-only">
            Analyze lender activity, deal flow, profile completeness and meeting history.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex">
          <div className={cn("flex-1 min-w-0 flex flex-col", drilldown ? "border-r border-white/5" : "")}>
            <Tabs value={tab} onValueChange={setTab} className="flex-1 min-h-0 flex flex-col">
              <div className="px-6 pt-3 shrink-0">
                <TabsList className="bg-muted/30">
                  <TabsTrigger value="active" className="gap-1.5"><Activity className="h-3.5 w-3.5" /> Most active</TabsTrigger>
                  <TabsTrigger value="sent" className="gap-1.5"><Send className="h-3.5 w-3.5" /> Most deals sent</TabsTrigger>
                  <TabsTrigger value="passed" className="gap-1.5"><XCircle className="h-3.5 w-3.5" /> Most passes</TabsTrigger>
                  <TabsTrigger value="profiles" className="gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" /> Profile completeness</TabsTrigger>
                  <TabsTrigger value="meetings" className="gap-1.5"><CalendarIcon className="h-3.5 w-3.5" /> Meeting & email insights</TabsTrigger>
                </TabsList>
              </div>

              <div className="flex-1 min-h-0 overflow-auto px-6 py-4 space-y-4">
                <TabsContent value="active" className="m-0 space-y-4">
                  <div className="rounded-md border border-white/5 bg-background/40 p-3">
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground/70 mb-2">Activity trend</div>
                    <div className="h-[180px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={trend}>
                          <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.2} />
                          <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                          <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                          <ReTooltip contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', fontSize: 12 }} />
                          <Line type="monotone" dataKey="sent" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Sent" />
                          <Line type="monotone" dataKey="passed" stroke="#ef4444" strokeWidth={2} dot={false} name="Passed" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  {renderRankingTable(sortedFor('active'), 'active', 'Active placements')}
                </TabsContent>

                <TabsContent value="sent" className="m-0 space-y-4">
                  <div className="rounded-md border border-white/5 bg-background/40 p-3">
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground/70 mb-2">Top 10 by deals sent</div>
                    <div className="h-[200px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={sortedFor('sent').slice(0, 10).map(r => ({ name: r.lender.name, sent: r.sent }))}>
                          <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.2} />
                          <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={60} stroke="hsl(var(--muted-foreground))" />
                          <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                          <ReTooltip contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', fontSize: 12 }} />
                          <Bar dataKey="sent" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  {renderRankingTable(sortedFor('sent'), 'sent', 'Deals sent')}
                </TabsContent>

                <TabsContent value="passed" className="m-0 space-y-4">
                  <div className="rounded-md border border-white/5 bg-background/40 p-3">
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground/70 mb-2">Top 10 by passes</div>
                    <div className="h-[200px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={sortedFor('passed').slice(0, 10).map(r => ({ name: r.lender.name, passed: r.passed }))}>
                          <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.2} />
                          <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={60} stroke="hsl(var(--muted-foreground))" />
                          <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                          <ReTooltip contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', fontSize: 12 }} />
                          <Bar dataKey="passed" fill="#ef4444" radius={[3, 3, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  {renderRankingTable(sortedFor('passed'), 'passed', 'Passes')}
                </TabsContent>

                <TabsContent value="profiles" className="m-0 space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    {completenessSummary.map((s, i) => (
                      <div key={s.name} className="rounded-md border border-white/5 bg-background/40 p-3">
                        <div className="text-[11px] uppercase tracking-wider text-muted-foreground/70">{s.name}</div>
                        <div className="text-2xl font-semibold tabular-nums" style={{ color: COLORS[i] }}>{s.value}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {enrichedRows.length > 0 ? `${Math.round((s.value / enrichedRows.length) * 100)}% of directory` : '—'}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-md border border-white/5 bg-background/40 p-3">
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground/70 mb-2">Profile distribution</div>
                    <div className="h-[200px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={completenessSummary} dataKey="value" nameKey="name" outerRadius={70} innerRadius={40}>
                            {completenessSummary.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                          </Pie>
                          <ReTooltip contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', fontSize: 12 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  {renderRankingTable(
                    [...enrichedRows].sort((a, b) => sortDir === 'desc' ? b.completeness - a.completeness : a.completeness - b.completeness),
                    'sent',
                    'Completeness',
                  )}
                </TabsContent>

                <TabsContent value="meetings" className="m-0 space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-md border border-white/5 bg-background/40 p-3">
                      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground/70">
                        <CalendarIcon className="h-3.5 w-3.5" /> Meetings (matched)
                      </div>
                      <div className="text-2xl font-semibold tabular-nums">
                        {enrichedRows.reduce((s, r) => s + r.meetings, 0)}
                      </div>
                    </div>
                    <div className="rounded-md border border-white/5 bg-background/40 p-3">
                      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground/70">
                        <Mail className="h-3.5 w-3.5" /> Emails (matched)
                      </div>
                      <div className="text-2xl font-semibold tabular-nums">
                        {enrichedRows.reduce((s, r) => s + r.emails, 0)}
                      </div>
                    </div>
                  </div>
                  {renderRankingTable(sortedFor('meetings'), 'meetings', 'Meetings')}
                  <p className="text-[11px] text-muted-foreground/70">
                    Matched on lender contact email and lender name in meeting titles / email subjects within the selected period.
                  </p>
                </TabsContent>
              </div>
            </Tabs>

            {loading && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="text-[12px] text-muted-foreground bg-background/80 px-3 py-1.5 rounded-md border border-white/10">
                  Loading analytics…
                </div>
              </div>
            )}
          </div>

          {drilldown && (
            <aside className="w-[420px] shrink-0 flex flex-col bg-muted/10">
              <div className="px-4 py-3 border-b border-white/5 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground/70">Drilldown</div>
                  <div className="text-[14px] font-semibold text-foreground truncate">{drilldown.name}</div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {[drilldown.lender_type, drilldown.tier, drilldown.geo].filter(Boolean).join(' · ') || '—'}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setDrilldown(null)}>Close</Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1 text-[11px]"
                    onClick={() => navigate(`/lenders?focus=${drilldown.id}`)}
                  >
                    <ExternalLink className="h-3 w-3" /> Open
                  </Button>
                </div>
              </div>
              <ScrollArea className="flex-1">
                <div className="p-4 space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    <Stat label="Sent" value={metricsByName.get(drilldown.name.trim().toLowerCase())?.sent ?? 0} />
                    <Stat label="Passed" value={metricsByName.get(drilldown.name.trim().toLowerCase())?.passed ?? 0} />
                    <Stat label="Active" value={metricsByName.get(drilldown.name.trim().toLowerCase())?.active ?? 0} />
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground/70 mb-1.5">Deals</div>
                    <div className="space-y-1">
                      {drilldownDeals.length === 0 && (
                        <div className="text-[12px] text-muted-foreground">No deal placements in this period.</div>
                      )}
                      {drilldownDeals.map(d => (
                        <button
                          key={d.id}
                          onClick={() => { onOpenChange(false); navigate(`/deals/${d.deal_id}`); }}
                          className="w-full text-left rounded-md border border-white/5 hover:border-white/15 bg-background/40 hover:bg-white/[0.03] p-2 transition-colors"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-[13px] font-medium text-foreground truncate">{d.dealName}</div>
                            <ExternalLink className="h-3 w-3 text-muted-foreground/60 shrink-0" />
                          </div>
                          <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                            <span className="capitalize">{d.stage || '—'}</span>
                            {d.pass_reason && <span className="text-red-400/80">· passed</span>}
                            <span>· {new Date(d.created_at).toLocaleDateString()}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </ScrollArea>
            </aside>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-white/5 bg-background/40 p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70">{label}</div>
      <div className="text-[18px] font-semibold tabular-nums text-foreground">{value}</div>
    </div>
  );
}