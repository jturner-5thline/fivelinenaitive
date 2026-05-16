import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatDistanceToNow } from "date-fns";
import { TrendingUp } from "lucide-react";

interface QuarterRow {
  key: string;          // "Q1"
  label: string;        // "Q1 2026"
  current: number | null;
  prior: number | null;
  yoyPct: number | null;
  currentLabel: string;
  priorLabel: string;
}

function formatUSDShort(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}MM`;
  if (abs >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

export function QuarterlyRevenueGrowthCard() {
  const { user } = useAuth();

  // FY = calendar year. Pull current year + prior year invoices in one query.
  const now = new Date();
  const currentYear = now.getFullYear();
  const priorYear = currentYear - 1;
  const rangeStart = `${priorYear}-01-01`;
  const rangeEnd = `${currentYear}-12-31`;

  const { data, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ["qb-quarterly-revenue-yoy", user?.id, currentYear],
    enabled: !!user,
    staleTime: 15 * 60 * 1000, // 15 min cache per spec
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("quickbooks_invoices")
        .select("txn_date, total_amt, synced_at, realm_id")
        .gte("txn_date", rangeStart)
        .lte("txn_date", rangeEnd);
      if (error) throw error;

      const realmSet = new Set<string>();
      let lastSync: string | null = null;
      // 8 buckets: [year][quarterIdx]
      const totals: Record<number, number[]> = {
        [priorYear]: [0, 0, 0, 0],
        [currentYear]: [0, 0, 0, 0],
      };
      const hasData: Record<number, boolean[]> = {
        [priorYear]: [false, false, false, false],
        [currentYear]: [false, false, false, false],
      };

      for (const r of rows ?? []) {
        if (r.realm_id) realmSet.add(r.realm_id);
        if (r.synced_at && (!lastSync || r.synced_at > lastSync)) lastSync = r.synced_at;
        if (!r.txn_date) continue;
        const y = Number(r.txn_date.slice(0, 4));
        const m = Number(r.txn_date.slice(5, 7));
        if (!totals[y]) continue;
        const q = Math.floor((m - 1) / 3);
        totals[y][q] += r.total_amt ?? 0;
        hasData[y][q] = true;
      }

      const currentQuarterIdx = Math.floor(now.getMonth() / 3);
      const quarters: QuarterRow[] = [];
      for (let q = 0; q <= currentQuarterIdx; q++) {
        const cur = hasData[currentYear][q] ? totals[currentYear][q] : null;
        const prv = hasData[priorYear][q] ? totals[priorYear][q] : null;
        const yoy = cur != null && prv != null && prv !== 0 ? ((cur - prv) / prv) * 100 : null;
        quarters.push({
          key: `Q${q + 1}`,
          label: `Q${q + 1} ${currentYear}`,
          currentLabel: `Q${q + 1} ${currentYear}`,
          priorLabel: `Q${q + 1} ${priorYear}`,
          current: cur,
          prior: prv,
          yoyPct: yoy,
        });
      }

      return {
        quarters,
        connectedEntities: realmSet.size,
        lastSync,
      };
    },
  });

  const chartData = useMemo(() => data?.quarters ?? [], [data]);
  const hasConnections = (data?.connectedEntities ?? 0) > 0;

  return (
    <Card className="bg-card/60 backdrop-blur border-border/60">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">Quarterly Revenue Growth (YoY)</CardTitle>
        </div>
        <Badge variant="outline" className="text-xs font-normal">
          QuickBooks ·{" "}
          {data?.lastSync
            ? `synced ${formatDistanceToNow(new Date(data.lastSync), { addSuffix: true })}`
            : dataUpdatedAt
            ? `synced ${formatDistanceToNow(new Date(dataUpdatedAt), { addSuffix: true })}`
            : "—"}
        </Badge>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-72 w-full" />
        ) : !hasConnections ? (
          <div className="flex flex-col items-center justify-center h-72 gap-3 text-center">
            <p className="text-sm text-muted-foreground">
              Connect QuickBooks to view revenue growth
            </p>
            <Button asChild size="sm">
              <Link to="/integrations">Connect QuickBooks</Link>
            </Button>
          </div>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 28, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="key"
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                  angle={typeof window !== "undefined" && window.innerWidth < 640 ? -30 : 0}
                  textAnchor={typeof window !== "undefined" && window.innerWidth < 640 ? "end" : "middle"}
                  height={40}
                />
                <YAxis
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={11}
                  tickFormatter={(v) => formatUSDShort(v)}
                />
                <Tooltip
                  cursor={{ fill: "hsl(var(--muted) / 0.3)" }}
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(value: number, name: string, item: any) => {
                    if (value == null) return ["No data", name];
                    return [formatUSDShort(value), name];
                  }}
                  labelFormatter={(l, payload) => {
                    const row = payload?.[0]?.payload as QuarterRow | undefined;
                    if (!row) return l;
                    const pct =
                      row.yoyPct == null ? "n/a" : `${row.yoyPct >= 0 ? "+" : ""}${row.yoyPct.toFixed(1)}%`;
                    return `${row.key} — YoY ${pct}`;
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar
                  dataKey="prior"
                  name={`FY ${priorYear}`}
                  fill="hsl(var(--muted-foreground) / 0.5)"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="current"
                  name={`FY ${currentYear}`}
                  fill="hsl(var(--primary))"
                  radius={[4, 4, 0, 0]}
                >
                  <LabelList
                    dataKey="yoyPct"
                    position="top"
                    content={(props: any) => {
                      const { x, y, width, value } = props;
                      if (value == null) return null;
                      const positive = value >= 0;
                      const color = positive ? "hsl(142 71% 45%)" : "hsl(0 84% 60%)";
                      const text = `${positive ? "+" : ""}${Number(value).toFixed(1)}%`;
                      return (
                        <text
                          x={x + width / 2}
                          y={y - 6}
                          fill={color}
                          fontSize={11}
                          fontWeight={600}
                          textAnchor="middle"
                        >
                          {text}
                        </text>
                      );
                    }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default QuarterlyRevenueGrowthCard;