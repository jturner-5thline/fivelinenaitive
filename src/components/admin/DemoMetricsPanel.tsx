import { useMemo, useState } from "react";
import { formatDistanceToNow, differenceInDays, format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { BarChart3, Search, Users, Sparkles, LogIn, Briefcase, Clock, ArrowUpDown, Calendar, TrendingUp } from "lucide-react";
import { useDemoAccounts, type DemoAccountRow } from "@/hooks/useDemoAccountMetrics";
import { DemoAccountDetailSheet } from "./DemoAccountDetailSheet";
import { StandardDemoPanel } from "./StandardDemoPanel";

type SortKey = 'name' | 'created_at' | 'last_event_at' | 'sign_ins' | 'distinct_active_users' | 'deals' | 'trial_ends_at' | 'status';

const STATUS_BADGE: Record<DemoAccountRow['status'], string> = {
  active: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  expired: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  revoked: "bg-red-500/20 text-red-400 border-red-500/30",
  converted: "bg-blue-500/20 text-blue-300 border-blue-500/30",
};

export const DemoMetricsPanel = () => {
  const { data: accounts, isLoading } = useDemoAccounts();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>('last_event_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [selected, setSelected] = useState<DemoAccountRow | null>(null);

  const filtered = useMemo(() => {
    let rows = accounts ?? [];
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(r => r.name.toLowerCase().includes(q));
    }
    if (typeFilter !== 'all') rows = rows.filter(r => (r.account_type || '').toLowerCase() === typeFilter);
    if (statusFilter !== 'all') rows = rows.filter(r => r.status === statusFilter);
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = (a as any)[sortKey];
      const bv = (b as any)[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [accounts, search, typeFilter, statusFilter, sortKey, sortDir]);

  // KPIs
  const kpis = useMemo(() => {
    const rows = accounts ?? [];
    const total = rows.length;
    const active7d = rows.filter(r => r.active_last_7d).length;
    const totalSignIns = rows.reduce((s, r) => s + r.sign_ins, 0);
    const avgSignIns = total ? Math.round(totalSignIns / total) : 0;
    const converted = rows.filter(r => r.status === 'converted').length;
    const conversionRate = total ? Math.round((converted / total) * 100) : 0;
    // Time-to-first-login = first event - created_at, in hours, avg across accounts that have any event.
    const ttfls = rows
      .filter(r => r.last_event_at)
      .map(r => Math.max(0, (new Date(r.last_event_at!).getTime() - new Date(r.created_at).getTime()) / 36e5));
    const avgTtfl = ttfls.length ? Math.round(ttfls.reduce((s, v) => s + v, 0) / ttfls.length) : null;
    return { total, active7d, avgSignIns, conversionRate, avgTtfl };
  }, [accounts]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir('desc'); }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <StandardDemoPanel />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  const rows = accounts ?? [];
  if (rows.length === 0) {
    return (
      <div className="space-y-4">
        <StandardDemoPanel />
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
            No per-user demo accounts yet. Use the standard demo above for admin preview.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <StandardDemoPanel />
      <p className="text-xs text-muted-foreground rounded-md border border-border/60 bg-muted/20 px-3 py-2">
        Use <strong>Open TEMPLATE Demo Workspace</strong> above for the canonical demo
        experience. The TEMPLATE workspace is the framework/source for all future demo
        accounts. Per-user actions in the table below are diagnostics only for individual
        seeded tenants and never feed the primary admin demo flow.
      </p>
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <Kpi icon={Briefcase} label="Demo accounts" value={kpis.total} />
        <Kpi icon={Users} label="Active 7d" value={kpis.active7d} hint={`of ${kpis.total}`} />
        <Kpi icon={LogIn} label="Avg sign-ins" value={kpis.avgSignIns} />
        <Kpi icon={Clock} label="Avg time-to-first-activity" value={kpis.avgTtfl == null ? '—' : `${kpis.avgTtfl}h`} />
        <Kpi icon={TrendingUp} label="Conversion to pilot" value={`${kpis.conversionRate}%`} />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search accounts..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8" />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All plans</SelectItem>
            <SelectItem value="demo">Demo</SelectItem>
            <SelectItem value="pilot">Pilot</SelectItem>
            <SelectItem value="trial">Trial</SelectItem>
            <SelectItem value="partner">Partner</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="revoked">Revoked</SelectItem>
            <SelectItem value="converted">Converted</SelectItem>
          </SelectContent>
        </Select>
        <div className="text-xs text-muted-foreground ml-auto">{filtered.length} of {rows.length} shown</div>
      </div>

      {/* Table */}
      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <Sortable label="Account" k="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <TableHead>Plan</TableHead>
              <Sortable label="Status" k="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <Sortable label="Created" k="created_at" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <Sortable label="Trial" k="trial_ends_at" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <Sortable label="Users" k="distinct_active_users" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="text-right" />
              <Sortable label="Sign-ins" k="sign_ins" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="text-right" />
              <Sortable label="Deals" k="deals" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="text-right" />
              <Sortable label="Last active" k="last_event_at" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(r => {
              const trialDays = r.trial_ends_at ? differenceInDays(new Date(r.trial_ends_at), new Date()) : null;
              return (
                <TableRow key={r.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setSelected(r)}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell><Badge variant="secondary" className="text-[10px]">{r.account_type || 'Demo'}</Badge></TableCell>
                  <TableCell><Badge variant="outline" className={STATUS_BADGE[r.status]}>{r.status}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{format(new Date(r.created_at), 'MMM d, yyyy')}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    {trialDays == null ? <span className="text-muted-foreground">—</span>
                      : trialDays < 0 ? <span className="text-red-400">Expired {Math.abs(trialDays)}d</span>
                      : <span className={trialDays <= 7 ? 'text-amber-300' : 'text-muted-foreground'}>{trialDays}d left</span>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.distinct_active_users}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.sign_ins}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.deals}</TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {r.last_event_at ? formatDistanceToNow(new Date(r.last_event_at), { addSuffix: true }) : 'Never'}
                  </TableCell>
                </TableRow>
              );
            })}
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-6">No accounts match filters</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
        <Calendar className="h-3 w-3" />
        Engagement tracking is enabled only for demo, pilot, trial and partner tenants. Production tenants are not logged at this level of detail.
      </p>

      <DemoAccountDetailSheet
        account={selected}
        open={!!selected}
        onOpenChange={(o) => !o && setSelected(null)}
      />
    </div>
  );
};

const Kpi = ({ icon: Icon, label, value, hint }: { icon: any; label: string; value: number | string; hint?: string }) => (
  <div className="rounded-lg border bg-card/40 p-3">
    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
      <Icon className="h-3 w-3" />{label}
    </div>
    <div className="text-xl font-semibold tabular-nums mt-1">{typeof value === 'number' ? value.toLocaleString() : value}</div>
    {hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
  </div>
);

const Sortable = ({ label, k, sortKey, sortDir, onSort, className }: {
  label: string; k: SortKey; sortKey: SortKey; sortDir: 'asc' | 'desc';
  onSort: (k: SortKey) => void; className?: string;
}) => (
  <TableHead className={className}>
    <Button variant="ghost" size="sm" className="-ml-2 h-auto py-1 font-medium" onClick={() => onSort(k)}>
      {label}
      <ArrowUpDown className={`ml-1 h-3 w-3 ${sortKey === k ? 'opacity-100' : 'opacity-30'}`} />
      {sortKey === k && <span className="ml-0.5 text-[9px]">{sortDir === 'asc' ? '↑' : '↓'}</span>}
    </Button>
  </TableHead>
);