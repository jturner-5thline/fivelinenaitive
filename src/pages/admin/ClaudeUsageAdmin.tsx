import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Internal-only Claude usage observability. Gated in two places:
//   1. This page short-circuits to /pipeline when the current user is not a
//      5th Line internal admin (public.is_fifth_line_internal_admin()).
//   2. The underlying RPCs are SECURITY DEFINER and re-check the same flag,
//      so revealing the route can't leak data even if the client is bypassed.

interface Totals {
  request_count: number;
  cache_hits: number;
  error_count: number;
  input_tokens: number;
  output_tokens: number;
  avg_latency_ms: number | null;
  distinct_users: number;
  distinct_features: number;
}

interface DailyRow {
  day: string;
  feature: string;
  request_count: number;
  cache_hits: number;
  error_count: number;
  input_tokens: number;
  output_tokens: number;
  avg_latency_ms: number | null;
}

interface SignatureRow {
  signature: string;
  feature: string | null;
  prompt_mode: string | null;
  cache_mode: string | null;
  request_count: number;
  cache_hits: number;
  distinct_users: number;
  distinct_deals: number;
  last_seen_at: string;
  avg_latency_ms: number | null;
  total_output_tokens: number;
}

const RANGE_OPTIONS = [
  { label: "24h", days: 1 },
  { label: "7d", days: 7 },
  { label: "14d", days: 14 },
  { label: "30d", days: 30 },
];

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US").format(Math.round(n));
}
function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString();
}

export default function ClaudeUsageAdmin() {
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [days, setDays] = useState(7);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [signatures, setSignatures] = useState<SignatureRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("is_fifth_line_internal_admin");
      if (cancelled) return;
      if (error) {
        setAllowed(false);
      } else {
        setAllowed(!!data);
      }
      setChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [totalsRes, dailyRes, sigRes] = await Promise.all([
          supabase.rpc("claude_usage_totals", { _days: days }),
          supabase.rpc("claude_usage_daily_by_feature", { _days: days }),
          supabase.rpc("claude_usage_top_signatures", { _days: days, _limit: 25 }),
        ]);
        if (cancelled) return;
        if (totalsRes.error) throw totalsRes.error;
        if (dailyRes.error) throw dailyRes.error;
        if (sigRes.error) throw sigRes.error;
        setTotals(((totalsRes.data as Totals[]) ?? [])[0] ?? null);
        setDaily((dailyRes.data as DailyRow[]) ?? []);
        setSignatures((sigRes.data as SignatureRow[]) ?? []);
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load usage");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [allowed, days]);

  const cacheHitRate = useMemo(() => {
    if (!totals || !totals.request_count) return "—";
    return `${((totals.cache_hits / totals.request_count) * 100).toFixed(1)}%`;
  }, [totals]);

  const errorRate = useMemo(() => {
    if (!totals || !totals.request_count) return "—";
    return `${((totals.error_count / totals.request_count) * 100).toFixed(1)}%`;
  }, [totals]);

  const dailyByDay = useMemo(() => {
    const map = new Map<string, DailyRow[]>();
    for (const row of daily) {
      const arr = map.get(row.day) ?? [];
      arr.push(row);
      map.set(row.day, arr);
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [daily]);

  if (checking) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Loader2 className="animate-spin mr-2 h-4 w-4" /> Checking access…
      </div>
    );
  }
  if (!allowed) {
    return <Navigate to="/pipeline" replace />;
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Claude Usage</h1>
          <p className="text-sm text-muted-foreground">
            Internal observability for every request routed through claude-gateway.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {RANGE_OPTIONS.map((r) => (
            <Button
              key={r.days}
              size="sm"
              variant={days === r.days ? "default" : "outline"}
              onClick={() => setDays(r.days)}
            >
              {r.label}
            </Button>
          ))}
        </div>
      </div>

      {error && (
        <Card className="p-4 border-red-500/40 text-red-300 text-sm">{error}</Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Requests" value={fmt(totals?.request_count)} sub={loading ? "loading…" : `${totals?.distinct_users ?? 0} users`} />
        <KpiCard label="Cache hit rate" value={cacheHitRate} sub={`${fmt(totals?.cache_hits)} hits`} />
        <KpiCard label="Error rate" value={errorRate} sub={`${fmt(totals?.error_count)} errors`} />
        <KpiCard label="Avg latency" value={totals?.avg_latency_ms != null ? `${Math.round(totals.avg_latency_ms)} ms` : "—"} sub={`${fmt(totals?.output_tokens)} out tokens`} />
      </div>

      <Tabs defaultValue="daily">
        <TabsList>
          <TabsTrigger value="daily">Daily by feature</TabsTrigger>
          <TabsTrigger value="repeated">Top repeated requests</TabsTrigger>
        </TabsList>

        <TabsContent value="daily" className="mt-4">
          <Card className="p-0 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Day</TableHead>
                  <TableHead>Feature</TableHead>
                  <TableHead className="text-right">Requests</TableHead>
                  <TableHead className="text-right">Cache hits</TableHead>
                  <TableHead className="text-right">Errors</TableHead>
                  <TableHead className="text-right">In tokens</TableHead>
                  <TableHead className="text-right">Out tokens</TableHead>
                  <TableHead className="text-right">Avg ms</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && daily.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-6">
                      Loading…
                    </TableCell>
                  </TableRow>
                )}
                {!loading && daily.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-6">
                      No requests in this range.
                    </TableCell>
                  </TableRow>
                )}
                {dailyByDay.map(([day, rows]) =>
                  rows
                    .sort((a, b) => b.request_count - a.request_count)
                    .map((r, i) => (
                      <TableRow key={`${day}-${r.feature}`}>
                        <TableCell className="whitespace-nowrap">
                          {i === 0 ? day : ""}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{r.feature}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono">{fmt(r.request_count)}</TableCell>
                        <TableCell className="text-right font-mono">{fmt(r.cache_hits)}</TableCell>
                        <TableCell className="text-right font-mono">
                          {r.error_count > 0 ? (
                            <span className="text-red-400">{fmt(r.error_count)}</span>
                          ) : (
                            fmt(r.error_count)
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono">{fmt(r.input_tokens)}</TableCell>
                        <TableCell className="text-right font-mono">{fmt(r.output_tokens)}</TableCell>
                        <TableCell className="text-right font-mono">
                          {r.avg_latency_ms != null ? Math.round(r.avg_latency_ms) : "—"}
                        </TableCell>
                      </TableRow>
                    )),
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="repeated" className="mt-4 space-y-2">
          <p className="text-xs text-muted-foreground">
            Signatures that repeated more than once in the window — these are
            the clearest candidates for response caching or upstream memoization.
          </p>
          <Card className="p-0 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Feature</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead className="text-right">Requests</TableHead>
                  <TableHead className="text-right">Cache hits</TableHead>
                  <TableHead className="text-right">Users</TableHead>
                  <TableHead className="text-right">Deals</TableHead>
                  <TableHead className="text-right">Avg ms</TableHead>
                  <TableHead className="text-right">Out tokens</TableHead>
                  <TableHead>Last seen</TableHead>
                  <TableHead>Signature</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && signatures.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground py-6">
                      Loading…
                    </TableCell>
                  </TableRow>
                )}
                {!loading && signatures.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground py-6">
                      No repeated signatures in this range.
                    </TableCell>
                  </TableRow>
                )}
                {signatures.map((s) => (
                  <TableRow key={s.signature}>
                    <TableCell>
                      <Badge variant="outline">{s.feature ?? "—"}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {[s.prompt_mode, s.cache_mode].filter(Boolean).join(" / ") || "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono">{fmt(s.request_count)}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(s.cache_hits)}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(s.distinct_users)}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(s.distinct_deals)}</TableCell>
                    <TableCell className="text-right font-mono">
                      {s.avg_latency_ms != null ? Math.round(s.avg_latency_ms) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono">{fmt(s.total_output_tokens)}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{fmtDate(s.last_seen_at)}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {s.signature.slice(0, 12)}…
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </Card>
  );
}