import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { format, formatDistanceToNow } from "date-fns";
import { BarChart3, Users, MousePointer, GitBranch, Clock } from "lucide-react";

const FEATURE_LABELS: Record<string, string> = {
  PAGE_VIEW: "Page View",
  SESSION_START: "Session",
  SESSION_END: "Session End",
  AI_CHAT: "AI Chat",
  LENDER_SUBMISSION: "Lenders",
  EMAIL_DRAFT: "Email Draft",
  DEAL_CREATE: "Deal Created",
  ONBOARDING_COMPLETE: "Onboarding",
  FIRST_DEAL: "First Deal",
  FIRST_LENDER_ADDED: "First Lender",
  FIRST_EMAIL_SENT: "First Email",
};

interface Event {
  user_id: string;
  feature_type: string;
  feature_subtype: string | null;
  timestamp: string;
  duration_ms: number | null;
  session_id: string | null;
  metadata: any;
}

const RANGES = [
  { value: 7, label: "Last 7 days" },
  { value: 30, label: "Last 30 days" },
  { value: 90, label: "Last 90 days" },
];

export function UXAnalyticsPanel() {
  const [days, setDays] = useState(30);
  const [events, setEvents] = useState<Event[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const [{ data: ev }, { count }] = await Promise.all([
        supabase
          .from("usage_events")
          .select("user_id, feature_type, feature_subtype, timestamp, duration_ms, session_id, metadata")
          .gte("timestamp", cutoff)
          .order("timestamp", { ascending: false })
          .limit(10000),
        supabase.from("profiles").select("user_id", { count: "exact", head: true }),
      ]);
      setEvents((ev ?? []) as Event[]);
      setTotalUsers(count ?? 0);
      setLoading(false);
    };
    load();
  }, [days]);

  const pageViewData = useMemo(() => {
    const counts: Record<string, number> = {};
    events.forEach((e) => {
      const key = e.feature_type;
      counts[key] = (counts[key] ?? 0) + 1;
    });
    return Object.entries(counts)
      .map(([k, v]) => ({ feature: FEATURE_LABELS[k] ?? k, count: v }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);
  }, [events]);

  const adoption = useMemo(() => {
    const byFeature: Record<string, { users: Set<string>; count: number; first: string; last: string }> = {};
    events.forEach((e) => {
      const f = e.feature_type;
      if (!byFeature[f]) byFeature[f] = { users: new Set(), count: 0, first: e.timestamp, last: e.timestamp };
      byFeature[f].users.add(e.user_id);
      byFeature[f].count += 1;
      if (e.timestamp < byFeature[f].first) byFeature[f].first = e.timestamp;
      if (e.timestamp > byFeature[f].last) byFeature[f].last = e.timestamp;
    });
    return Object.entries(byFeature)
      .map(([feature, v]) => ({
        feature: FEATURE_LABELS[feature] ?? feature,
        userPct: totalUsers ? (v.users.size / totalUsers) * 100 : 0,
        total: v.count,
        avgPerUser: v.users.size ? v.count / v.users.size : 0,
        first: v.first,
        last: v.last,
      }))
      .sort((a, b) => b.total - a.total);
  }, [events, totalUsers]);

  const funnel = useMemo(() => {
    const usersBy = (type: string) => new Set(events.filter((e) => e.feature_type === type).map((e) => e.user_id));
    const signups = new Set(events.map((e) => e.user_id));
    const onboarded = usersBy("ONBOARDING_COMPLETE");
    const firstDeal = usersBy("FIRST_DEAL");
    const firstLender = usersBy("FIRST_LENDER_ADDED");
    const firstEmail = usersBy("FIRST_EMAIL_SENT");
    const base = signups.size || 1;
    return [
      { step: "Signed Up", count: signups.size, pct: 100 },
      { step: "Completed Onboarding", count: onboarded.size, pct: (onboarded.size / base) * 100 },
      { step: "Created First Deal", count: firstDeal.size, pct: (firstDeal.size / base) * 100 },
      { step: "Added Lenders", count: firstLender.size, pct: (firstLender.size / base) * 100 },
      { step: "Sent First Email", count: firstEmail.size, pct: (firstEmail.size / base) * 100 },
    ];
  }, [events]);

  const sessionStats = useMemo(() => {
    const sessions: Record<string, { start?: string; end?: string; pages: number }> = {};
    events.forEach((e) => {
      const sid = e.session_id ?? `${e.user_id}-${e.timestamp.slice(0, 10)}`;
      if (!sessions[sid]) sessions[sid] = { pages: 0 };
      if (e.feature_type === "SESSION_START") sessions[sid].start = e.timestamp;
      else if (e.feature_type === "SESSION_END") sessions[sid].end = e.timestamp;
      else sessions[sid].pages += 1;
    });
    const completed = Object.values(sessions).filter((s) => s.start && s.end);
    const avgDurationMs = completed.length
      ? completed.reduce((acc, s) => acc + (new Date(s.end!).getTime() - new Date(s.start!).getTime()), 0) / completed.length
      : 0;
    const avgPages = Object.values(sessions).length
      ? Object.values(sessions).reduce((acc, s) => acc + s.pages, 0) / Object.values(sessions).length
      : 0;
    const bounced = Object.values(sessions).filter((s) => s.pages <= 1).length;
    const bounceRate = Object.values(sessions).length ? (bounced / Object.values(sessions).length) * 100 : 0;
    return {
      avgDurationMin: avgDurationMs / 60000,
      avgPages,
      bounceRate,
      sessionCount: Object.values(sessions).length,
    };
  }, [events]);

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-40 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">UX Analytics</h2>
          <p className="text-sm text-muted-foreground">How users move through the product</p>
        </div>
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {RANGES.map((r) => (
              <SelectItem key={r.value} value={String(r.value)}>{r.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Session stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardHeader className="pb-2"><CardDescription>Sessions</CardDescription></CardHeader>
          <CardContent><div className="text-2xl font-semibold flex items-center gap-2"><Clock className="h-4 w-4 text-muted-foreground" />{sessionStats.sessionCount}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Avg session</CardDescription></CardHeader>
          <CardContent><div className="text-2xl font-semibold">{sessionStats.avgDurationMin.toFixed(1)} min</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Avg pages / session</CardDescription></CardHeader>
          <CardContent><div className="text-2xl font-semibold">{sessionStats.avgPages.toFixed(1)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Bounce rate</CardDescription></CardHeader>
          <CardContent><div className="text-2xl font-semibold">{sessionStats.bounceRate.toFixed(0)}%</div></CardContent>
        </Card>
      </div>

      {/* Page View Heatmap */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4" />Page Views</CardTitle>
          <CardDescription>Visit counts by feature for the selected range</CardDescription>
        </CardHeader>
        <CardContent>
          {pageViewData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No usage events recorded yet.</p>
          ) : (
            <div className="h-72">
              <ResponsiveContainer>
                <BarChart data={pageViewData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                  <XAxis dataKey="feature" tick={{ fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={70} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Funnel */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><GitBranch className="h-4 w-4" />User Funnel</CardTitle>
          <CardDescription>Conversion through key onboarding milestones</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {funnel.map((s) => (
            <div key={s.step} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="font-medium">{s.step}</span>
                <span className="text-muted-foreground">{s.count} · {s.pct.toFixed(0)}%</span>
              </div>
              <div className="h-2 bg-muted rounded">
                <div className="h-2 bg-primary rounded" style={{ width: `${Math.min(100, s.pct)}%` }} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Feature Adoption */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" />Feature Adoption</CardTitle>
          <CardDescription>How many users have used each feature</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Feature</TableHead>
                <TableHead className="text-right">% of Users</TableHead>
                <TableHead className="text-right">Total Uses</TableHead>
                <TableHead className="text-right">Avg per User</TableHead>
                <TableHead>First Used</TableHead>
                <TableHead>Last Used</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {adoption.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">No data</TableCell></TableRow>
              ) : adoption.map((r) => (
                <TableRow key={r.feature}>
                  <TableCell className="font-medium">{r.feature}</TableCell>
                  <TableCell className="text-right">{r.userPct.toFixed(1)}%</TableCell>
                  <TableCell className="text-right">{r.total}</TableCell>
                  <TableCell className="text-right">{r.avgPerUser.toFixed(1)}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{format(new Date(r.first), "MMM d")}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{formatDistanceToNow(new Date(r.last), { addSuffix: true })}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}