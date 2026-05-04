import { useMemo, useState } from "react";
import {
  ArrowDown, ArrowUp, ArrowUpDown, BarChart3, Download, DollarSign,
  Search, TrendingUp, Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  buildDateRange, useCompanyUsageOverview,
  type CompanyUsageRow, type UsageDateRangeKey,
} from "./useCompanyUsageOverview";
import type { UsageTier } from "./usageTiers";
import {
  classifyUsageTier, tierBadgeClass, isPaidTier,
  DEFAULT_AI_RATE_PER_1K_TOKENS,
} from "./usageTiers";

type SortKey =
  | "company_name" | "active_users" | "ai_chat_calls" | "email_drafts"
  | "lender_submissions" | "deal_space_lookups" | "write_ups" | "agents_run"
  | "data_room_actions" | "total_ai_calls" | "token_usage" | "est_cost" | "tier";

const RANGE_OPTIONS: { value: UsageDateRangeKey; label: string }[] = [
  { value: "this-week", label: "This Week" },
  { value: "this-month", label: "This Month" },
  { value: "last-30", label: "Last 30 Days" },
  { value: "custom", label: "Custom" },
];

const numberFmt = new Intl.NumberFormat("en-US");
const currencyFmt = new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD", maximumFractionDigits: 2,
});
const dateFmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const escape = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = rows.map((r) => r.map(escape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function UsageAnalyticsPanel() {
  const [rangeKey, setRangeKey] = useState<UsageDateRangeKey>("last-30");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("total_ai_calls");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [aiRate, setAiRate] = useState<number>(DEFAULT_AI_RATE_PER_1K_TOKENS);
  type EnrichedRow = CompanyUsageRow & { est_cost: number; tier: UsageTier };
  const [drilldown, setDrilldown] = useState<EnrichedRow | null>(null);

  const range = useMemo(
    () => buildDateRange(
      rangeKey,
      customStart ? new Date(customStart) : undefined,
      customEnd ? new Date(customEnd) : undefined,
    ),
    [rangeKey, customStart, customEnd],
  );

  const { rows, isLoading, error } = useCompanyUsageOverview(range);

  const enrichedRows = useMemo(
    () => rows.map((r) => {
      const est_cost = (r.token_usage / 1000) * aiRate;
      const tier = classifyUsageTier(r.total_ai_calls);
      return { ...r, est_cost, tier };
    }),
    [rows, aiRate],
  );

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? enrichedRows.filter((r) => r.company_name.toLowerCase().includes(q)) : enrichedRows;
  }, [enrichedRows, search]);

  const sortedRows = useMemo(() => {
    const sorted = [...filteredRows].sort((a, b) => {
      const aVal = (a as Record<string, unknown>)[sortKey];
      const bVal = (b as Record<string, unknown>)[sortKey];
      let cmp = 0;
      if (typeof aVal === "string" && typeof bVal === "string") {
        cmp = aVal.localeCompare(bVal);
      } else {
        cmp = (Number(aVal) || 0) - (Number(bVal) || 0);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [filteredRows, sortKey, sortDir]);

  const summary = useMemo(() => {
    const totalAi = enrichedRows.reduce((s, r) => s + r.total_ai_calls, 0);
    const totalCost = enrichedRows.reduce((s, r) => s + r.est_cost, 0);
    const mostActive = enrichedRows.reduce<EnrichedRow | null>(
      (best, r) => (!best || r.total_ai_calls > best.total_ai_calls ? r : best),
      null,
    );
    const paidCount = enrichedRows.filter((r) => isPaidTier(r.tier)).length;
    return { totalAi, totalCost, mostActive, paidCount };
  }, [enrichedRows]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  const handleExport = () => {
    const header = [
      "Company", "Active Users", "AI Chat Calls", "Email Drafts",
      "Lender Submissions", "Deal Space AI Lookups", "Write-Ups Generated",
      "Agents Run", "Data Room Actions", "Total AI Calls",
      "Est. Token Usage", "Est. AI Cost (USD)", "Usage Tier",
    ];
    const body = sortedRows.map((r) => [
      r.company_name, r.active_users, r.ai_chat_calls, r.email_drafts,
      r.lender_submissions, r.deal_space_lookups, r.write_ups,
      r.agents_run, r.data_room_actions, r.total_ai_calls,
      r.token_usage, r.est_cost.toFixed(4), r.tier,
    ]);
    const filename = `usage-analytics_${range.start.toISOString().slice(0,10)}_${range.end.toISOString().slice(0,10)}.csv`;
    downloadCsv(filename, [header, ...body]);
  };

  const SortHeader = ({ label, k, align = "left" }: { label: string; k: SortKey; align?: "left" | "right" }) => {
    const isActive = sortKey === k;
    const Icon = !isActive ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
    return (
      <button
        onClick={() => toggleSort(k)}
        className={`flex items-center gap-1 text-xs font-medium uppercase tracking-wide hover:text-foreground transition-colors ${
          isActive ? "text-foreground" : "text-muted-foreground"
        } ${align === "right" ? "ml-auto" : ""}`}
      >
        {label}
        <Icon className="h-3 w-3 opacity-70" />
      </button>
    );
  };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="h-4 w-4 text-primary" />
            Usage Analytics
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted-foreground">Date range</label>
            <Select value={rangeKey} onValueChange={(v) => setRangeKey(v as UsageDateRangeKey)}>
              <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                {RANGE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {rangeKey === "custom" && (
            <>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-muted-foreground">Start</label>
                <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="h-9 w-40" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-muted-foreground">End</label>
                <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="h-9 w-40" />
              </div>
            </>
          )}
          <div className="flex flex-col gap-1.5 flex-1 min-w-[200px]">
            <label className="text-xs text-muted-foreground">Search company</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter…" className="pl-8 h-9" />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted-foreground">$ / 1K tokens</label>
            <Input type="number" min={0} step="0.0001" value={aiRate}
              onChange={(e) => setAiRate(Number(e.target.value) || 0)}
              className="h-9 w-28" />
          </div>
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={handleExport} disabled={!sortedRows.length}>
            <Download className="h-4 w-4 mr-1.5" /> Export CSV
          </Button>
        </CardContent>
        <CardContent className="pt-0 text-xs text-muted-foreground">
          {dateFmt.format(range.start)} → {dateFmt.format(range.end)}
        </CardContent>
      </Card>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard label="Total AI Calls" value={numberFmt.format(summary.totalAi)} icon={TrendingUp} loading={isLoading} />
        <SummaryCard label="Total Est. Cost" value={currencyFmt.format(summary.totalCost)} icon={DollarSign} loading={isLoading} />
        <SummaryCard
          label="Most Active Company"
          value={summary.mostActive ? summary.mostActive.company_name : "—"}
          subline={summary.mostActive ? `${numberFmt.format(summary.mostActive.total_ai_calls)} AI calls` : undefined}
          icon={Users}
          loading={isLoading}
        />
        <SummaryCard label="Paid Tier Companies" value={String(summary.paidCount)} subline="Growth and above" icon={BarChart3} loading={isLoading} />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="pt-6 overflow-x-auto">
          {error && (
            <div className="text-sm text-destructive mb-3">Failed to load: {error}</div>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead><SortHeader label="Company" k="company_name" /></TableHead>
                <TableHead className="text-right"><SortHeader label="Active Users" k="active_users" align="right" /></TableHead>
                <TableHead className="text-right"><SortHeader label="AI Chat" k="ai_chat_calls" align="right" /></TableHead>
                <TableHead className="text-right"><SortHeader label="Email Drafts" k="email_drafts" align="right" /></TableHead>
                <TableHead className="text-right"><SortHeader label="Lender Subs" k="lender_submissions" align="right" /></TableHead>
                <TableHead className="text-right"><SortHeader label="DS AI Lookups" k="deal_space_lookups" align="right" /></TableHead>
                <TableHead className="text-right"><SortHeader label="Write-Ups" k="write_ups" align="right" /></TableHead>
                <TableHead className="text-right"><SortHeader label="Agents" k="agents_run" align="right" /></TableHead>
                <TableHead className="text-right"><SortHeader label="Data Room" k="data_room_actions" align="right" /></TableHead>
                <TableHead className="text-right"><SortHeader label="Total AI" k="total_ai_calls" align="right" /></TableHead>
                <TableHead className="text-right"><SortHeader label="Est. Tokens" k="token_usage" align="right" /></TableHead>
                <TableHead className="text-right"><SortHeader label="Est. Cost" k="est_cost" align="right" /></TableHead>
                <TableHead><SortHeader label="Tier" k="tier" /></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 13 }).map((__, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : sortedRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={13} className="text-center text-muted-foreground py-8">
                    No usage events recorded for this period.
                  </TableCell>
                </TableRow>
              ) : (
                sortedRows.map((r) => (
                  <TableRow key={r.company_id}
                    onClick={() => setDrilldown(r)}
                    className="cursor-pointer hover:bg-muted/30">
                    <TableCell className="font-medium">{r.company_name}</TableCell>
                    <TableCell className="text-right">{numberFmt.format(r.active_users)}</TableCell>
                    <TableCell className="text-right">{numberFmt.format(r.ai_chat_calls)}</TableCell>
                    <TableCell className="text-right">{numberFmt.format(r.email_drafts)}</TableCell>
                    <TableCell className="text-right">{numberFmt.format(r.lender_submissions)}</TableCell>
                    <TableCell className="text-right">{numberFmt.format(r.deal_space_lookups)}</TableCell>
                    <TableCell className="text-right">{numberFmt.format(r.write_ups)}</TableCell>
                    <TableCell className="text-right">{numberFmt.format(r.agents_run)}</TableCell>
                    <TableCell className="text-right">{numberFmt.format(r.data_room_actions)}</TableCell>
                    <TableCell className="text-right font-semibold">{numberFmt.format(r.total_ai_calls)}</TableCell>
                    <TableCell className="text-right">{numberFmt.format(r.token_usage)}</TableCell>
                    <TableCell className="text-right">{currencyFmt.format(r.est_cost)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={tierBadgeClass(r.tier)}>{r.tier}</Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Drill-down placeholder (Company Deep Dive ships in Prompt 3) */}
      <Dialog open={!!drilldown} onOpenChange={(open) => { if (!open) setDrilldown(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{drilldown?.company_name ?? "Company"}</DialogTitle>
            <DialogDescription>
              Company Deep Dive opens here. (Coming in Prompt 3.)
            </DialogDescription>
          </DialogHeader>
          {drilldown && (
            <div className="text-xs text-muted-foreground space-y-1 font-mono">
              <div>company_id: {drilldown.company_id}</div>
              <div>range: {dateFmt.format(range.start)} → {dateFmt.format(range.end)}</div>
              <div>total_ai_calls: {drilldown.total_ai_calls}</div>
              <div>tier: {drilldown.tier}</div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryCard({
  label, value, subline, icon: Icon, loading,
}: {
  label: string;
  value: string;
  subline?: string;
  icon: React.ComponentType<{ className?: string }>;
  loading?: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1 min-w-0">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
            {loading ? (
              <Skeleton className="h-7 w-24" />
            ) : (
              <p className="text-2xl font-semibold truncate">{value}</p>
            )}
            {subline && !loading && (
              <p className="text-xs text-muted-foreground truncate">{subline}</p>
            )}
          </div>
          <div className="p-2 rounded-md bg-primary/10 text-primary shrink-0">
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}