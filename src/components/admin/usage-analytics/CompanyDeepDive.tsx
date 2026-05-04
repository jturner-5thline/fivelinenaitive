import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, BarChart3, Download, Search, Sparkles, TrendingUp, DollarSign,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  LIQUID_GLASS_SERIES, INSIGHTS_TOOLTIP_STYLE, INSIGHTS_AXIS_TICK,
} from "@/components/metrics/liquidGlass";
import {
  classifyUsageTier, tierBadgeClass, DEFAULT_AI_RATE_PER_1K_TOKENS,
} from "./usageTiers";
import { buildDateRange, type UsageDateRange, type UsageDateRangeKey } from "./useCompanyUsageOverview";
import { sendClaudeMessage } from "@/services/claude";

interface Props {
  companyId: string;
  companyName: string;
  range: UsageDateRange;
  onBack: () => void;
}

interface EventRow {
  id: string;
  user_id: string | null;
  feature_type: string;
  feature_subtype: string | null;
  timestamp: string;
  deal_id: string | null;
  token_count: number | null;
  duration_ms: number | null;
}

const AI_FEATURE_TYPES = new Set([
  "AI_CHAT", "DEAL_SPACE_AI_LOOKUP", "WRITE_UP_GENERATED", "AGENT_RUN",
]);

const FEATURE_LABELS: Record<string, string> = {
  AI_CHAT: "AI Chat",
  EMAIL_DRAFT: "Email Draft",
  LENDER_SUBMISSION: "Lender Submission",
  DEAL_SPACE_AI_LOOKUP: "Deal Space AI",
  WRITE_UP_GENERATED: "Write-Up",
  AGENT_RUN: "Agent Run",
  DATA_ROOM_UPLOAD: "Data Room Upload",
  DATA_ROOM_DOWNLOAD: "Data Room Download",
  SCHEDULED_REPORT_SENT: "Scheduled Report",
  SESSION_START: "Session Start",
  SESSION_END: "Session End",
};

const numberFmt = new Intl.NumberFormat("en-US");
const currencyFmt = new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD", maximumFractionDigits: 2,
});
const dateFmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });
const dateTimeFmt = new Intl.DateTimeFormat("en-US", {
  dateStyle: "short", timeStyle: "short",
});

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

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function buildDayBuckets(start: Date, end: Date): string[] {
  const days: string[] = [];
  const d = new Date(start);
  d.setHours(0, 0, 0, 0);
  const last = new Date(end);
  last.setHours(0, 0, 0, 0);
  while (d.getTime() <= last.getTime()) {
    days.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

export function CompanyDeepDive({ companyId, companyName, range: initialRange, onBack }: Props) {
  const [rangeKey, setRangeKey] = useState<UsageDateRangeKey>(initialRange.key);
  const [customStart, setCustomStart] = useState<string>(
    initialRange.key === "custom" ? initialRange.start.toISOString().slice(0, 10) : "",
  );
  const [customEnd, setCustomEnd] = useState<string>(
    initialRange.key === "custom" ? initialRange.end.toISOString().slice(0, 10) : "",
  );
  const range = useMemo(
    () => buildDateRange(
      rangeKey,
      customStart ? new Date(customStart) : undefined,
      customEnd ? new Date(customEnd) : undefined,
    ),
    [rangeKey, customStart, customEnd],
  );
  const [events, setEvents] = useState<EventRow[]>([]);
  const [userMap, setUserMap] = useState<Map<string, { name: string; email: string }>>(new Map());
  const [dealMap, setDealMap] = useState<Map<string, string>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aiRate, setAiRate] = useState(DEFAULT_AI_RATE_PER_1K_TOKENS);

  // Log filters
  const [logSearch, setLogSearch] = useState("");
  const [logFeature, setLogFeature] = useState<string>("all");
  const [logUser, setLogUser] = useState<string>("all");
  const [logPage, setLogPage] = useState(1);
  const PAGE_SIZE = 25;

  // Pricing recommendation
  const [pricingText, setPricingText] = useState<string>("");
  const [pricingLoading, setPricingLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const PAGE = 1000;
        const HARD_CAP = 50000;
        const all: EventRow[] = [];
        let from = 0;
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { data, error: qErr } = await supabase
            .from("usage_events")
            .select("id, user_id, feature_type, feature_subtype, timestamp, deal_id, token_count, duration_ms")
            .eq("company_id", companyId)
            .gte("timestamp", range.start.toISOString())
            .lte("timestamp", range.end.toISOString())
            .order("timestamp", { ascending: false })
            .range(from, from + PAGE - 1);
          if (qErr) throw qErr;
          const batch = (data ?? []) as EventRow[];
          all.push(...batch);
          if (batch.length < PAGE || all.length >= HARD_CAP) break;
          from += PAGE;
        }

        // Resolve users
        const userIds = Array.from(new Set(all.map((e) => e.user_id).filter((v): v is string => !!v)));
        const um = new Map<string, { name: string; email: string }>();
        if (userIds.length > 0) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("user_id, display_name, email")
            .in("user_id", userIds);
          (profiles ?? []).forEach((p) => {
            um.set(p.user_id, {
              name: p.display_name || p.email || "Unknown",
              email: p.email || "",
            });
          });
        }

        // Resolve deals
        const dealIds = Array.from(new Set(all.map((e) => e.deal_id).filter((v): v is string => !!v)));
        const dm = new Map<string, string>();
        if (dealIds.length > 0) {
          const { data: deals } = await supabase
            .from("deals")
            .select("id, company")
            .in("id", dealIds);
          (deals ?? []).forEach((d) => dm.set(d.id, d.company || "Unnamed deal"));
        }

        if (!cancelled) {
          setEvents(all);
          setUserMap(um);
          setDealMap(dm);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("[CompanyDeepDive]", err);
          setError(err instanceof Error ? err.message : "Failed to load");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [companyId, range.start.getTime(), range.end.getTime()]);

  // Header KPIs
  const totalAi = useMemo(
    () => events.filter((e) => AI_FEATURE_TYPES.has(e.feature_type)).length,
    [events],
  );
  const totalTokens = useMemo(
    () => events.reduce((s, e) => s + (AI_FEATURE_TYPES.has(e.feature_type) ? (e.token_count ?? 0) : 0), 0),
    [events],
  );
  const estCost = (totalTokens / 1000) * aiRate;
  const tier = classifyUsageTier(totalAi);

  // Section 1 — daily trend
  const trendData = useMemo(() => {
    const days = buildDayBuckets(range.start, range.end);
    const featureSet = Array.from(new Set(events.map((e) => e.feature_type)));
    const map = new Map<string, Record<string, number>>();
    days.forEach((d) => map.set(d, { date: 0 } as unknown as Record<string, number>));
    events.forEach((e) => {
      if (!AI_FEATURE_TYPES.has(e.feature_type)) return;
      const k = dayKey(e.timestamp);
      const row = map.get(k) || {};
      row[e.feature_type] = (row[e.feature_type] || 0) + 1;
      row.total = (row.total || 0) + 1;
      map.set(k, row);
    });
    return {
      data: days.map((d) => ({ date: d, total: 0, ...map.get(d) })),
      features: featureSet.filter((f) => AI_FEATURE_TYPES.has(f)),
    };
  }, [events, range.start, range.end]);

  // Section 2 — feature breakdown (donut)
  const breakdown = useMemo(() => {
    const counts = new Map<string, number>();
    events.forEach((e) => counts.set(e.feature_type, (counts.get(e.feature_type) || 0) + 1));
    const total = events.length || 1;
    const arr = Array.from(counts.entries()).map(([k, v]) => ({
      key: k,
      label: FEATURE_LABELS[k] || k,
      value: v,
      pct: (v / total) * 100,
    }));
    arr.sort((a, b) => b.value - a.value);
    return arr;
  }, [events]);

  // Section 3 — power users
  const powerUsers = useMemo(() => {
    const map = new Map<string, {
      user_id: string; ai: number; emails: number; lenders: number;
      total: number; last: string;
    }>();
    events.forEach((e) => {
      if (!e.user_id) return;
      let row = map.get(e.user_id);
      if (!row) {
        row = { user_id: e.user_id, ai: 0, emails: 0, lenders: 0, total: 0, last: e.timestamp };
        map.set(e.user_id, row);
      }
      row.total += 1;
      if (AI_FEATURE_TYPES.has(e.feature_type)) row.ai += 1;
      if (e.feature_type === "EMAIL_DRAFT") row.emails += 1;
      if (e.feature_type === "LENDER_SUBMISSION") row.lenders += 1;
      if (e.timestamp > row.last) row.last = e.timestamp;
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [events]);

  // Section 4 — deals
  const dealActivity = useMemo(() => {
    const map = new Map<string, {
      deal_id: string; ai: number; emails: number; lenders: number;
      dataRoom: number; last: string;
    }>();
    events.forEach((e) => {
      if (!e.deal_id) return;
      let row = map.get(e.deal_id);
      if (!row) {
        row = { deal_id: e.deal_id, ai: 0, emails: 0, lenders: 0, dataRoom: 0, last: e.timestamp };
        map.set(e.deal_id, row);
      }
      if (AI_FEATURE_TYPES.has(e.feature_type)) row.ai += 1;
      if (e.feature_type === "EMAIL_DRAFT") row.emails += 1;
      if (e.feature_type === "LENDER_SUBMISSION") row.lenders += 1;
      if (e.feature_type === "DATA_ROOM_UPLOAD" || e.feature_type === "DATA_ROOM_DOWNLOAD") row.dataRoom += 1;
      if (e.timestamp > row.last) row.last = e.timestamp;
    });
    return Array.from(map.values())
      .sort((a, b) => (b.ai + b.emails + b.lenders + b.dataRoom) - (a.ai + a.emails + a.lenders + a.dataRoom));
  }, [events]);

  // Section 5 — full log
  const filteredLog = useMemo(() => {
    const q = logSearch.trim().toLowerCase();
    return events.filter((e) => {
      if (logFeature !== "all" && e.feature_type !== logFeature) return false;
      if (logUser !== "all" && e.user_id !== logUser) return false;
      if (q) {
        const u = e.user_id ? userMap.get(e.user_id) : null;
        const hay = `${e.feature_type} ${e.feature_subtype ?? ""} ${u?.name ?? ""} ${u?.email ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [events, logSearch, logFeature, logUser, userMap]);

  const pageCount = Math.max(1, Math.ceil(filteredLog.length / PAGE_SIZE));
  const pagedLog = filteredLog.slice((logPage - 1) * PAGE_SIZE, logPage * PAGE_SIZE);
  useEffect(() => { setLogPage(1); }, [logSearch, logFeature, logUser]);

  const featureOptions = useMemo(
    () => Array.from(new Set(events.map((e) => e.feature_type))),
    [events],
  );

  const handleExportLog = () => {
    const header = ["Timestamp", "User", "Email", "Feature Type", "Feature Subtype", "Deal", "Token Count", "Duration (ms)"];
    const body = filteredLog.map((e) => {
      const u = e.user_id ? userMap.get(e.user_id) : null;
      return [
        new Date(e.timestamp).toISOString(),
        u?.name ?? "",
        u?.email ?? "",
        e.feature_type,
        e.feature_subtype ?? "",
        e.deal_id ? dealMap.get(e.deal_id) ?? e.deal_id : "",
        e.token_count ?? "",
        e.duration_ms ?? "",
      ];
    });
    downloadCsv(`${companyName}_ai-call-log_${range.start.toISOString().slice(0,10)}_${range.end.toISOString().slice(0,10)}.csv`, [header, ...body]);
  };

  // Section 6 — pricing recommendation
  const generatePricing = async () => {
    setPricingLoading(true);
    setPricingText("");
    const avgTokens = totalAi > 0 ? Math.round(totalTokens / totalAi) : 0;
    const days = Math.max(1, Math.round((range.end.getTime() - range.start.getTime()) / (1000 * 60 * 60 * 24)));
    const monthlyAi = Math.round((totalAi / days) * 30);
    const monthlyCost = (monthlyAi * avgTokens / 1000) * aiRate;
    const prompt = `You are a SaaS pricing analyst for naitive, an AI deal-management platform.

Company: ${companyName}
Reporting period: ${dateFmt.format(range.start)} → ${dateFmt.format(range.end)} (${days} days)
Total AI calls in period: ${totalAi}
Total tokens consumed: ${totalTokens}
Average tokens per call: ${avgTokens}
Projected monthly AI calls: ${monthlyAi}
Estimated monthly cost to serve (at $${aiRate}/1K tokens): $${monthlyCost.toFixed(2)}
Current usage tier: ${tier}
Active users: ${powerUsers.length}

Write a concise 3-4 sentence pricing recommendation in this exact form:
"Based on ${companyName}'s usage of [N] AI calls/month averaging [X] tokens/call, they fall in the [Tier] tier. Estimated monthly cost to serve: $[X]. Suggested pricing: $[Y]/month."
Pick a Suggested pricing that yields a healthy 60-75% gross margin over the cost-to-serve, rounded to a sensible price point ($49, $99, $199, $499, $999, $1,999). Add one short sentence of justification.`;
    try {
      const res = await sendClaudeMessage({
        messages: [{ role: "user", content: prompt }],
        context: "chat",
        max_tokens: 400,
        usage: { feature_subtype: "pricing-recommendation" },
      });
      setPricingText(res.success ? res.response : `Failed: ${res.error}`);
    } catch (err) {
      setPricingText(err instanceof Error ? err.message : "Failed to generate");
    } finally {
      setPricingLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardContent className="pt-5 pb-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-2 min-w-0">
              <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2 h-7">
                <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back to overview
              </Button>
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-2xl font-semibold truncate">{companyName}</h2>
                <Badge variant="outline" className={tierBadgeClass(tier)}>{tier}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {dateFmt.format(range.start)} → {dateFmt.format(range.end)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Kpi label="Total AI Calls" value={numberFmt.format(totalAi)} icon={TrendingUp} />
              <Kpi label="Est. Cost" value={currencyFmt.format(estCost)} icon={DollarSign} />
              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Date range</label>
                <Select value={rangeKey} onValueChange={(v) => setRangeKey(v as UsageDateRangeKey)}>
                  <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="this-week">This Week</SelectItem>
                    <SelectItem value="this-month">This Month</SelectItem>
                    <SelectItem value="last-30">Last 30 Days</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {rangeKey === "custom" && (
                <>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Start</label>
                    <Input type="date" value={customStart}
                      onChange={(e) => setCustomStart(e.target.value)}
                      className="h-8 w-36" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] uppercase tracking-wide text-muted-foreground">End</label>
                    <Input type="date" value={customEnd}
                      onChange={(e) => setCustomEnd(e.target.value)}
                      className="h-8 w-36" />
                  </div>
                </>
              )}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase tracking-wide text-muted-foreground">$ / 1K tok</label>
                <Input type="number" min={0} step="0.0001" value={aiRate}
                  onChange={(e) => setAiRate(Number(e.target.value) || 0)}
                  className="h-8 w-24" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card><CardContent className="pt-4 text-sm text-destructive">{error}</CardContent></Card>
      )}

      {/* Section 1 — Trend */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" /> Daily AI Calls
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={trendData.data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis dataKey="date" tick={INSIGHTS_AXIS_TICK} />
                <YAxis tick={INSIGHTS_AXIS_TICK} allowDecimals={false} />
                <Tooltip contentStyle={INSIGHTS_TOOLTIP_STYLE}
                  formatter={(val: number, name: string) => [val, FEATURE_LABELS[name] || name]} />
                <Line type="monotone" dataKey="total" stroke={LIQUID_GLASS_SERIES[0]}
                  strokeWidth={2} dot={false} name="Total AI" />
                {trendData.features.map((f, i) => (
                  <Line key={f} type="monotone" dataKey={f}
                    stroke={LIQUID_GLASS_SERIES[(i + 1) % LIQUID_GLASS_SERIES.length]}
                    strokeWidth={1.5} dot={false} strokeDasharray="4 3" />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Section 2 — Breakdown */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Feature Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : breakdown.length === 0 ? (
            <div className="text-sm text-muted-foreground">No events.</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={breakdown} dataKey="value" nameKey="label" cx="50%" cy="50%"
                  innerRadius={55} outerRadius={90} paddingAngle={2}>
                  {breakdown.map((_, i) => (
                    <Cell key={i} fill={LIQUID_GLASS_SERIES[i % LIQUID_GLASS_SERIES.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={INSIGHTS_TOOLTIP_STYLE}
                  formatter={(val: number, name: string) => [numberFmt.format(val), name]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Top Use Cases</div>
            {breakdown.slice(0, 10).map((b, i) => (
              <div key={b.key} className="flex items-center justify-between text-sm border-b border-border/30 py-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="h-2 w-2 rounded-full shrink-0"
                    style={{ background: LIQUID_GLASS_SERIES[i % LIQUID_GLASS_SERIES.length] }} />
                  <span className="truncate">{b.label}</span>
                </div>
                <div className="text-muted-foreground tabular-nums">
                  {numberFmt.format(b.value)} <span className="opacity-60">({b.pct.toFixed(1)}%)</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Section 3 — Power Users */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Power Users</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="text-right">AI Calls</TableHead>
                <TableHead className="text-right">Email Drafts</TableHead>
                <TableHead className="text-right">Lender Subs</TableHead>
                <TableHead className="text-right">Total Actions</TableHead>
                <TableHead>Last Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {powerUsers.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">No user activity.</TableCell></TableRow>
              ) : powerUsers.map((u) => {
                const profile = userMap.get(u.user_id);
                return (
                  <TableRow key={u.user_id}>
                    <TableCell className="font-medium">{profile?.name ?? "Unknown"}</TableCell>
                    <TableCell className="text-muted-foreground">{profile?.email ?? "—"}</TableCell>
                    <TableCell className="text-right">{numberFmt.format(u.ai)}</TableCell>
                    <TableCell className="text-right">{numberFmt.format(u.emails)}</TableCell>
                    <TableCell className="text-right">{numberFmt.format(u.lenders)}</TableCell>
                    <TableCell className="text-right font-semibold">{numberFmt.format(u.total)}</TableCell>
                    <TableCell className="text-muted-foreground">{dateTimeFmt.format(new Date(u.last))}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Section 4 — Deal Activity */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Deal-Level Activity</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Deal</TableHead>
                <TableHead className="text-right">AI Interactions</TableHead>
                <TableHead className="text-right">Emails</TableHead>
                <TableHead className="text-right">Lender Subs</TableHead>
                <TableHead className="text-right">Data Room</TableHead>
                <TableHead>Last Activity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dealActivity.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No deal-tagged events.</TableCell></TableRow>
              ) : dealActivity.map((d) => (
                <TableRow key={d.deal_id}>
                  <TableCell className="font-medium">{dealMap.get(d.deal_id) ?? d.deal_id.slice(0, 8)}</TableCell>
                  <TableCell className="text-right">{numberFmt.format(d.ai)}</TableCell>
                  <TableCell className="text-right">{numberFmt.format(d.emails)}</TableCell>
                  <TableCell className="text-right">{numberFmt.format(d.lenders)}</TableCell>
                  <TableCell className="text-right">{numberFmt.format(d.dataRoom)}</TableCell>
                  <TableCell className="text-muted-foreground">{dateTimeFmt.format(new Date(d.last))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Section 5 — Full log */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-base">Full AI Call Log</CardTitle>
          <Button variant="outline" size="sm" onClick={handleExportLog} disabled={!filteredLog.length}>
            <Download className="h-4 w-4 mr-1.5" /> Export CSV
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input value={logSearch} onChange={(e) => setLogSearch(e.target.value)}
                placeholder="Search…" className="pl-8 h-9" />
            </div>
            <Select value={logFeature} onValueChange={setLogFeature}>
              <SelectTrigger className="h-9 w-44"><SelectValue placeholder="Feature" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All features</SelectItem>
                {featureOptions.map((f) => (
                  <SelectItem key={f} value={f}>{FEATURE_LABELS[f] || f}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={logUser} onValueChange={setLogUser}>
              <SelectTrigger className="h-9 w-52"><SelectValue placeholder="User" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All users</SelectItem>
                {Array.from(userMap.entries()).map(([uid, p]) => (
                  <SelectItem key={uid} value={uid}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Feature</TableHead>
                  <TableHead>Subtype</TableHead>
                  <TableHead>Deal</TableHead>
                  <TableHead className="text-right">Tokens</TableHead>
                  <TableHead className="text-right">Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedLog.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">No matching events.</TableCell></TableRow>
                ) : pagedLog.map((e) => {
                  const u = e.user_id ? userMap.get(e.user_id) : null;
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="text-xs">{dateTimeFmt.format(new Date(e.timestamp))}</TableCell>
                      <TableCell>{u?.name ?? "—"}</TableCell>
                      <TableCell>{FEATURE_LABELS[e.feature_type] || e.feature_type}</TableCell>
                      <TableCell className="text-muted-foreground">{e.feature_subtype ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{e.deal_id ? dealMap.get(e.deal_id) ?? "—" : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{e.token_count ? numberFmt.format(e.token_count) : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{e.duration_ms ? `${numberFmt.format(e.duration_ms)}ms` : "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{numberFmt.format(filteredLog.length)} events · page {logPage} of {pageCount}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={logPage <= 1}
                onClick={() => setLogPage((p) => Math.max(1, p - 1))}>Prev</Button>
              <Button variant="outline" size="sm" disabled={logPage >= pageCount}
                onClick={() => setLogPage((p) => Math.min(pageCount, p + 1))}>Next</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 6 — Pricing recommendation */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Pricing Recommendation
          </CardTitle>
          <Button size="sm" onClick={generatePricing} disabled={pricingLoading || isLoading}>
            {pricingLoading ? "Generating…" : pricingText ? "Regenerate" : "Generate"}
          </Button>
        </CardHeader>
        <CardContent>
          {pricingText ? (
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{pricingText}</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Click Generate to produce an AI-driven pricing recommendation based on this company's usage profile.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value, icon: Icon }: {
  label: string; value: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-border/40 bg-muted/20">
      <div className="p-1.5 rounded bg-primary/10 text-primary">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-sm font-semibold tabular-nums">{value}</div>
      </div>
    </div>
  );
}