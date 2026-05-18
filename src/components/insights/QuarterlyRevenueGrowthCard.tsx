import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatDistanceToNow } from "date-fns";
import { Filter, MousePointerClick } from "lucide-react";
import { Link } from "react-router-dom";
import { QBO_ENTITIES } from "@/config/qboEntities";

/* ---------- helpers ---------- */

function formatUSDShort(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}MM`;
  if (abs >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

interface QKey {
  year: number;
  q: number; // 0..3
  key: string; // "2026-Q2"
  label: string; // "Q2 2026"
  startDate: string;
  endDate: string;
}

function makeQuarter(year: number, q: number): QKey {
  const startMonth = q * 3;
  const start = new Date(year, startMonth, 1);
  const end = new Date(year, startMonth + 3, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    year,
    q,
    key: `${year}-Q${q + 1}`,
    label: `Q${q + 1} ${year}`,
    startDate: `${year}-${pad(startMonth + 1)}-01`,
    endDate: `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`,
  };
}

function rollingQuarters(): QKey[] {
  const now = new Date();
  const curY = now.getFullYear();
  const curQ = Math.floor(now.getMonth() / 3);
  const out: QKey[] = [];
  for (let i = 3; i >= 0; i--) {
    let q = curQ - i;
    let y = curY;
    while (q < 0) {
      q += 4;
      y -= 1;
    }
    out.push(makeQuarter(y, q));
  }
  return out;
}

/* ---------- row shape used in chart ---------- */
interface ChartRow {
  key: string;
  label: string;
  shortLabel: string;
  current: number | null;
  prior: number | null;
  yoyPct: number | null;
  currentQ: QKey;
  priorQ: QKey;
  hasCurrent: boolean;
  hasPrior: boolean;
}

/* =============================================================== */

export function QuarterlyRevenueGrowthCard({ bare = false }: { bare?: boolean } = {}) {
  const { user } = useAuth();
  const [selectedRealms, setSelectedRealms] = useState<string[]>([]); // [] = all
  const [drillRow, setDrillRow] = useState<ChartRow | null>(null);

  const quarters = useMemo(rollingQuarters, []);
  // priorYear counterparts of each displayed quarter
  const priorQuarters = useMemo(
    () => quarters.map(q => makeQuarter(q.year - 1, q.q)),
    [quarters],
  );

  const fetchStart = priorQuarters[0].startDate;
  const fetchEnd = quarters[quarters.length - 1].endDate;

  const { data, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ["qb-rolling-quarterly-yoy", user?.id, fetchStart, fetchEnd],
    enabled: !!user,
    staleTime: 15 * 60 * 1000,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("quickbooks_invoices")
        .select("txn_date, total_amt, synced_at, realm_id, customer_name, doc_number, id")
        .gte("txn_date", fetchStart)
        .lte("txn_date", fetchEnd);
      if (error) throw error;
      const realmSet = new Set<string>();
      let lastSync: string | null = null;
      for (const r of rows ?? []) {
        if (r.realm_id) realmSet.add(r.realm_id);
        if (r.synced_at && (!lastSync || r.synced_at > lastSync)) lastSync = r.synced_at;
      }
      return {
        rows: rows ?? [],
        connectedEntities: Array.from(realmSet),
        lastSync,
      };
    },
  });

  const allRows = data?.rows ?? [];
  const connectedEntities = data?.connectedEntities ?? [];
  const hasConnections = connectedEntities.length > 0;

  const entityOptions = useMemo(() => {
    return connectedEntities
      .map(realmId => {
        const known = QBO_ENTITIES.find(e => e.realmId === realmId);
        return { realmId, label: known?.label ?? `Entity ${realmId.slice(-4)}` };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [connectedEntities]);

  const activeRealms = selectedRealms.length === 0 ? null : new Set(selectedRealms);

  // Sum totals per quarter (current + prior) honoring entity filter
  const chartData: ChartRow[] = useMemo(() => {
    const sumIn = (q: QKey) => {
      let total = 0;
      let has = false;
      for (const r of allRows) {
        if (!r.txn_date) continue;
        if (r.txn_date < q.startDate || r.txn_date > q.endDate) continue;
        if (activeRealms && (!r.realm_id || !activeRealms.has(r.realm_id))) continue;
        total += r.total_amt ?? 0;
        has = true;
      }
      return { total, has };
    };
    return quarters.map((q, i) => {
      const cur = sumIn(q);
      const prv = sumIn(priorQuarters[i]);
      const yoyPct =
        cur.has && prv.has && prv.total !== 0
          ? ((cur.total - prv.total) / prv.total) * 100
          : null;
      return {
        key: q.key,
        label: q.label,
        shortLabel: `Q${q.q + 1} '${String(q.year).slice(-2)}`,
        current: cur.has ? cur.total : null,
        prior: prv.has ? prv.total : null,
        yoyPct,
        currentQ: q,
        priorQ: priorQuarters[i],
        hasCurrent: cur.has,
        hasPrior: prv.has,
      };
    });
  }, [allRows, quarters, priorQuarters, activeRealms]);

  const filterLabel =
    selectedRealms.length === 0
      ? "All entities"
      : selectedRealms.length === 1
      ? entityOptions.find(o => o.realmId === selectedRealms[0])?.label ?? "1 entity"
      : `${selectedRealms.length} entities`;

  const isMobile = typeof window !== "undefined" && window.innerWidth < 640;

  return (
    <>
      <div
        className={
          bare
            ? "w-full h-full flex flex-col"
            : "w-full flex flex-col rounded-[10px] overflow-hidden relative"
        }
        style={
          bare
            ? undefined
            : {
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
              }
        }
      >
        {!bare && (
          <div
            className="absolute top-0 left-0 right-0 h-px"
            style={{
              background:
                "linear-gradient(90deg,transparent,hsla(213,90%,70%,0.4),transparent)",
            }}
          />
        )}
        {!bare && (
        <div
          className="px-3 py-2 flex items-center justify-between gap-3"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}
        >
          <div
            style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "1.2px",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.6)",
            }}
          >
            Quarterly Revenue Growth (YoY)
          </div>
          <div className="flex items-center gap-2">
            {entityOptions.length > 1 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 gap-1 text-[10px] font-semibold uppercase tracking-wider bg-transparent border-[rgba(255,255,255,0.15)] text-[rgba(255,255,255,0.75)] hover:bg-[rgba(255,255,255,0.08)]"
                  >
                    <Filter className="h-3 w-3" />
                    {filterLabel}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-popover z-50">
                  <DropdownMenuLabel className="text-xs">Filter entities</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuCheckboxItem
                    checked={selectedRealms.length === 0}
                    onCheckedChange={() => setSelectedRealms([])}
                  >
                    All entities
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuSeparator />
                  {entityOptions.map(o => (
                    <DropdownMenuCheckboxItem
                      key={o.realmId}
                      checked={selectedRealms.includes(o.realmId)}
                      onCheckedChange={checked => {
                        setSelectedRealms(prev =>
                          checked ? [...prev, o.realmId] : prev.filter(r => r !== o.realmId),
                        );
                      }}
                    >
                      {o.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <span
              className="text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap"
              style={{ color: "rgba(255,255,255,0.55)" }}
            >
              QuickBooks ·{" "}
              {data?.lastSync
                ? `synced ${formatDistanceToNow(new Date(data.lastSync), { addSuffix: true })}`
                : dataUpdatedAt
                ? `synced ${formatDistanceToNow(new Date(dataUpdatedAt), { addSuffix: true })}`
                : "—"}
            </span>
          </div>
        </div>
        )}
        <div className={bare ? "flex-1 flex flex-col min-h-0 overflow-hidden" : "p-3 overflow-hidden"}>
          <div
            className="mb-2 text-[10px] tracking-wide"
            style={{ color: "rgba(255,255,255,0.55)" }}
          >
            Rolling last 4 quarters · {filterLabel} ·{" "}
            <span className="inline-flex items-center gap-1">
              <MousePointerClick className="h-3 w-3" /> click a bar to drill in
            </span>
          </div>
          {isLoading ? (
            <Skeleton className={bare ? "flex-1 w-full" : "h-[260px] w-full"} />
          ) : !hasConnections ? (
            <div className={`flex flex-col items-center justify-center gap-3 text-center ${bare ? "flex-1" : "h-[260px]"}`}>
              <p className="text-sm text-muted-foreground">
                Connect QuickBooks to view revenue growth
              </p>
              <Button asChild size="sm">
                <Link to="/integrations">Connect QuickBooks</Link>
              </Button>
            </div>
          ) : (
            <div className={`w-full cursor-pointer ${bare ? "flex-1 min-h-0" : "h-[260px]"}`}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 24, right: 12, left: 0, bottom: 4 }}
                  onClick={(e: any) => {
                    const idx = e?.activeTooltipIndex;
                    if (typeof idx === "number" && chartData[idx]) setDrillRow(chartData[idx]);
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="shortLabel"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                    angle={isMobile ? -30 : 0}
                    textAnchor={isMobile ? "end" : "middle"}
                    height={40}
                  />
                  <YAxis
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={11}
                    tickFormatter={v => formatUSDShort(v)}
                  />
                  <Tooltip
                    cursor={{ fill: "hsl(var(--muted) / 0.3)" }}
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(value: any, name: string) =>
                      value == null ? ["No data", name] : [formatUSDShort(value), name]
                    }
                    labelFormatter={(_l, payload) => {
                      const row = payload?.[0]?.payload as ChartRow | undefined;
                      if (!row) return _l as string;
                      const pct =
                        row.yoyPct == null
                          ? "n/a"
                          : `${row.yoyPct >= 0 ? "+" : ""}${row.yoyPct.toFixed(1)}%`;
                      return `${row.label} — YoY ${pct}`;
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar
                    dataKey="prior"
                    name="Prior year"
                    fill="hsl(var(--muted-foreground) / 0.5)"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="current"
                    name="Current"
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
        </div>
      </div>

      <QuarterDrilldownDialog
        row={drillRow}
        onClose={() => setDrillRow(null)}
        rows={allRows}
        activeRealms={activeRealms}
        entityOptions={entityOptions}
        filterLabel={filterLabel}
      />
    </>
  );
}

/* =============================================================== */

interface DrilldownProps {
  row: ChartRow | null;
  onClose: () => void;
  rows: any[];
  activeRealms: Set<string> | null;
  entityOptions: { realmId: string; label: string }[];
  filterLabel: string;
}

function QuarterDrilldownDialog({
  row,
  onClose,
  rows,
  activeRealms,
  entityOptions,
  filterLabel,
}: DrilldownProps) {
  const composition = useMemo(() => {
    if (!row) return null;
    const within = (date: string, q: QKey) => date >= q.startDate && date <= q.endDate;
    const monthsCur: Record<string, number> = {};
    const byEntityCur: Record<string, number> = {};
    const byEntityPrior: Record<string, number> = {};
    let totalCur = 0;
    let totalPrior = 0;

    for (const r of rows) {
      if (!r.txn_date) continue;
      if (activeRealms && (!r.realm_id || !activeRealms.has(r.realm_id))) continue;
      const inCur = within(r.txn_date, row.currentQ);
      const inPri = within(r.txn_date, row.priorQ);
      if (!inCur && !inPri) continue;
      const amt = r.total_amt ?? 0;
      const label =
        entityOptions.find(o => o.realmId === r.realm_id)?.label ??
        (r.realm_id ? `Entity ${String(r.realm_id).slice(-4)}` : "Unknown");
      if (inCur) {
        totalCur += amt;
        const mk = r.txn_date.slice(0, 7);
        monthsCur[mk] = (monthsCur[mk] ?? 0) + amt;
        byEntityCur[label] = (byEntityCur[label] ?? 0) + amt;
      }
      if (inPri) {
        totalPrior += amt;
        byEntityPrior[label] = (byEntityPrior[label] ?? 0) + amt;
      }
    }

    const months = row.currentQ
      ? [0, 1, 2].map(i => {
          const m = row.currentQ.q * 3 + i;
          const d = new Date(row.currentQ.year, m, 1);
          const key = `${row.currentQ.year}-${String(m + 1).padStart(2, "0")}`;
          return {
            key,
            label: d.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
            amount: monthsCur[key] ?? 0,
          };
        })
      : [];

    const entities = Array.from(
      new Set([...Object.keys(byEntityCur), ...Object.keys(byEntityPrior)]),
    )
      .map(name => ({
        name,
        current: byEntityCur[name] ?? 0,
        prior: byEntityPrior[name] ?? 0,
      }))
      .sort((a, b) => b.current - a.current);

    const yoyDelta = totalCur - totalPrior;
    const yoyPct = totalPrior !== 0 ? (yoyDelta / totalPrior) * 100 : null;

    return { months, entities, totalCur, totalPrior, yoyDelta, yoyPct };
  }, [row, rows, activeRealms, entityOptions]);

  return (
    <Dialog open={!!row} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{row?.label} revenue detail</DialogTitle>
          <DialogDescription>
            {filterLabel} · compared to {row?.priorQ.label}
          </DialogDescription>
        </DialogHeader>
        {row && composition && (
          <div className="space-y-5">
            {/* Summary */}
            <div className="grid grid-cols-3 gap-3">
              <SummaryStat label={row.label} value={formatUSDShort(composition.totalCur)} />
              <SummaryStat
                label={row.priorQ.label}
                value={formatUSDShort(composition.totalPrior)}
                muted
              />
              <SummaryStat
                label="YoY Δ"
                value={
                  composition.yoyPct == null
                    ? "n/a"
                    : `${composition.yoyPct >= 0 ? "+" : ""}${composition.yoyPct.toFixed(1)}%`
                }
                accent={
                  composition.yoyPct == null
                    ? "neutral"
                    : composition.yoyPct >= 0
                    ? "positive"
                    : "negative"
                }
                sub={
                  composition.yoyPct == null
                    ? "No prior-year data"
                    : `${composition.yoyDelta >= 0 ? "+" : ""}${formatUSDShort(
                        composition.yoyDelta,
                      )}`
                }
              />
            </div>

            {/* Monthly breakdown */}
            <div>
              <h4 className="text-sm font-medium mb-2">Monthly breakdown</h4>
              <div className="rounded-md border border-border/60 divide-y divide-border/60">
                {composition.months.map(m => (
                  <div
                    key={m.key}
                    className="flex items-center justify-between px-3 py-2 text-sm"
                  >
                    <span className="text-muted-foreground">{m.label}</span>
                    <span className="font-medium">{formatUSDShort(m.amount)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Entity composition */}
            <div>
              <h4 className="text-sm font-medium mb-2">Contributing entities</h4>
              <div className="rounded-md border border-border/60 divide-y divide-border/60">
                {composition.entities.length === 0 && (
                  <div className="px-3 py-3 text-sm text-muted-foreground">No data</div>
                )}
                {composition.entities.map(e => {
                  const pct =
                    e.prior !== 0 ? ((e.current - e.prior) / e.prior) * 100 : null;
                  const positive = pct != null && pct >= 0;
                  return (
                    <div
                      key={e.name}
                      className="grid grid-cols-4 gap-2 px-3 py-2 text-sm items-center"
                    >
                      <span className="font-medium truncate">{e.name}</span>
                      <span className="text-right">{formatUSDShort(e.current)}</span>
                      <span className="text-right text-muted-foreground">
                        {formatUSDShort(e.prior)}
                      </span>
                      <span
                        className={`text-right text-xs font-medium ${
                          pct == null
                            ? "text-muted-foreground"
                            : positive
                            ? "text-emerald-500"
                            : "text-red-500"
                        }`}
                      >
                        {pct == null
                          ? "n/a"
                          : `${positive ? "+" : ""}${pct.toFixed(1)}%`}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="grid grid-cols-4 gap-2 px-3 pt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                <span>Entity</span>
                <span className="text-right">{row.label}</span>
                <span className="text-right">{row.priorQ.label}</span>
                <span className="text-right">YoY</span>
              </div>
            </div>

            {/* YoY explanation */}
            <div className="rounded-md bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              {composition.yoyPct == null
                ? `No revenue recorded in ${row.priorQ.label}, so YoY comparison is unavailable.`
                : `Revenue ${
                    composition.yoyDelta >= 0 ? "grew" : "declined"
                  } by ${formatUSDShort(Math.abs(composition.yoyDelta))} (${composition.yoyPct.toFixed(
                    1,
                  )}%) versus ${row.priorQ.label}.`}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SummaryStat({
  label,
  value,
  sub,
  muted,
  accent = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  muted?: boolean;
  accent?: "neutral" | "positive" | "negative";
}) {
  const color =
    accent === "positive"
      ? "text-emerald-500"
      : accent === "negative"
      ? "text-red-500"
      : muted
      ? "text-muted-foreground"
      : "text-foreground";
  return (
    <div className="rounded-md border border-border/60 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold ${color}`}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

export default QuarterlyRevenueGrowthCard;