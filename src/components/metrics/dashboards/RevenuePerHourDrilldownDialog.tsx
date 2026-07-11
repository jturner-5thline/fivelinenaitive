import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { isExcludedDealName } from '@/utils/excludedDeals';

const DEBT_REALM_ID = '193514877331929';
const ACTIVE_PIPELINE_ID = 'b78ad452-b489-4c89-8a91-789347c05f79';
const IN_DEVELOPMENT_PIPELINE_ID = '40b17dfb-9122-49e0-bf7c-5aa993d5d615';
const PIPELINE_IDS = [ACTIVE_PIPELINE_ID, IN_DEVELOPMENT_PIPELINE_ID];

function fmtUSD(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}MM`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${Math.round(v).toLocaleString()}`;
}
function fmtRate(v: number | null): string {
  if (v == null || !isFinite(v)) return '—';
  return `$${Math.round(v).toLocaleString()}/hr`;
}
function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function monthLabel(d: Date): string {
  return d.toLocaleString('en-US', { month: 'short', year: '2-digit' });
}

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Drilldown for "Revenue per Deal Hour".
 *
 * Displays:
 *  - Summary: trailing-12-month revenue, hours, and $/hr
 *  - Line chart: TTM $/hr computed at the end of each of the last 12 months
 *    (each point = revenue over the trailing 12 months ÷ hours over the same
 *    window, anchored on that month)
 *  - Table: per-deal hours contribution over the trailing 12 months
 */
export function RevenuePerHourDrilldownDialog({ open, onClose }: Props) {
  const { user } = useAuth();

  const anchor = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }, []);

  // Pull 23 months of raw data so we can compute 12 TTM points.
  const rangeStart = useMemo(
    () => new Date(anchor.getFullYear(), anchor.getMonth() - 22, 1),
    [anchor],
  );
  const rangeEnd = useMemo(
    () => new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0),
    [anchor],
  );
  const startStr = rangeStart.toISOString().slice(0, 10);
  const endStr = rangeEnd.toISOString().slice(0, 10);

  const { data, isLoading } = useQuery({
    queryKey: ['revenue-per-hour-drilldown', startStr, endStr],
    enabled: open && !!user,
    staleTime: 60_000,
    queryFn: async () => {
      const [invoicesRes, entriesRes] = await Promise.all([
        supabase
          .from('quickbooks_invoices')
          .select('total_amt, txn_date')
          .eq('realm_id', DEBT_REALM_ID)
          .gte('txn_date', startStr)
          .lte('txn_date', endStr),
        supabase
          .from('weekly_time_entries')
          .select('hours, deal_id, week_start_date')
          .gte('week_start_date', startStr)
          .lte('week_start_date', endStr),
      ]);
      if (invoicesRes.error) throw invoicesRes.error;
      if (entriesRes.error) throw entriesRes.error;

      const rawEntries = (entriesRes.data ?? []) as Array<{
        hours: number | string | null;
        deal_id: string | null;
        week_start_date: string | null;
      }>;
      const dealIds = Array.from(
        new Set(rawEntries.map((e) => e.deal_id).filter(Boolean) as string[]),
      );
      const dealMap = new Map<string, { name: string; pipeline_id: string | null }>();
      if (dealIds.length) {
        const { data: deals, error } = await supabase
          .from('deals')
          .select('id, company, pipeline_id')
          .in('id', dealIds);
        if (error) throw error;
        for (const d of (deals ?? []) as Array<{
          id: string;
          company: string | null;
          pipeline_id: string | null;
        }>) {
          dealMap.set(d.id, { name: d.company ?? 'Unknown', pipeline_id: d.pipeline_id });
        }
      }

      // Revenue per month
      const revByMonth: Record<string, number> = {};
      for (const inv of (invoicesRes.data ?? []) as Array<{
        total_amt: number | string | null;
        txn_date: string | null;
      }>) {
        if (!inv.txn_date) continue;
        const k = inv.txn_date.slice(0, 7);
        revByMonth[k] = (revByMonth[k] ?? 0) + (Number(inv.total_amt) || 0);
      }

      // Hours per month (filtered to eligible pipelines + non-excluded deals)
      const hoursByMonth: Record<string, number> = {};
      // Per-deal hours + monthly breakdown, kept as raw so the table can
      // filter to the trailing-12-month window.
      const dealHours = new Map<
        string,
        { total: number; byMonth: Record<string, number> }
      >();
      for (const e of rawEntries) {
        if (!e.deal_id || !e.week_start_date) continue;
        const info = dealMap.get(e.deal_id);
        if (!info) continue;
        if (!info.pipeline_id || !PIPELINE_IDS.includes(info.pipeline_id)) continue;
        if (isExcludedDealName(info.name)) continue;
        const k = e.week_start_date.slice(0, 7);
        const h = Number(e.hours) || 0;
        hoursByMonth[k] = (hoursByMonth[k] ?? 0) + h;
        const cur = dealHours.get(e.deal_id) ?? { total: 0, byMonth: {} };
        cur.total += h;
        cur.byMonth[k] = (cur.byMonth[k] ?? 0) + h;
        dealHours.set(e.deal_id, cur);
      }

      return { revByMonth, hoursByMonth, dealHours, dealMap };
    },
  });

  const ttmMonths = useMemo(() => {
    // last 12 months (oldest -> newest)
    const out: Array<{ key: string; label: string; anchorDate: Date }> = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(anchor.getFullYear(), anchor.getMonth() - i, 1);
      out.push({ key: monthKey(d), label: monthLabel(d), anchorDate: d });
    }
    return out;
  }, [anchor]);

  const chartData = useMemo(() => {
    if (!data) return [];
    return ttmMonths.map((m) => {
      let rev = 0;
      let hrs = 0;
      for (let j = 0; j < 12; j++) {
        const d = new Date(m.anchorDate.getFullYear(), m.anchorDate.getMonth() - j, 1);
        const k = monthKey(d);
        rev += data.revByMonth[k] ?? 0;
        hrs += data.hoursByMonth[k] ?? 0;
      }
      return {
        key: m.key,
        label: m.label,
        revenue: rev,
        hours: hrs,
        rate: hrs > 0 ? rev / hrs : null,
      };
    });
  }, [data, ttmMonths]);

  const trailing12 = useMemo(() => {
    const monthsInWindow = new Set(ttmMonths.map((m) => m.key));
    let rev = 0;
    let hrs = 0;
    for (const k of monthsInWindow) {
      rev += data?.revByMonth[k] ?? 0;
      hrs += data?.hoursByMonth[k] ?? 0;
    }
    return { rev, hrs, rate: hrs > 0 ? rev / hrs : null, monthsInWindow };
  }, [data, ttmMonths]);

  const dealRows = useMemo(() => {
    if (!data) return [];
    const monthsInWindow = trailing12.monthsInWindow;
    const rows: Array<{ id: string; name: string; hours: number }> = [];
    for (const [id, v] of data.dealHours.entries()) {
      let hrs = 0;
      for (const [mk, h] of Object.entries(v.byMonth)) {
        if (monthsInWindow.has(mk)) hrs += h;
      }
      if (hrs > 0) {
        rows.push({ id, name: data.dealMap.get(id)?.name ?? 'Unknown', hours: hrs });
      }
    }
    rows.sort((a, b) => b.hours - a.hours);
    return rows;
  }, [data, trailing12.monthsInWindow]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Revenue per Deal Hour</DialogTitle>
          <DialogDescription>
            Trailing 12 months of 5th Line Capital Advisors revenue ÷ hours logged on
            Active Pipeline + In Development deals.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <SummaryTile label="TTM Revenue" value={fmtUSD(trailing12.rev)} />
              <SummaryTile label="TTM Hours Logged" value={trailing12.hrs.toLocaleString(undefined, { maximumFractionDigits: 1 })} />
              <SummaryTile label="Deals w/ Hours" value={String(dealRows.length)} />
              <SummaryTile
                label="TTM Revenue / Hour"
                value={fmtRate(trailing12.rate)}
                accent
              />
            </div>

            <div className="rounded-lg border border-border/40 bg-muted/10 p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  TTM Revenue per Hour — anchored at each month-end
                </div>
                <Badge variant="outline" className="text-[10px]">12 periods</Badge>
              </div>
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 8, right: 12, left: 4, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.25} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                      tickFormatter={(v) => (v == null ? '' : `$${Math.round(Number(v) / 1000)}k`)}
                      tickLine={false}
                      axisLine={false}
                      width={54}
                    />
                    <Tooltip
                      wrapperStyle={{ outline: 'none' }}
                      cursor={{ stroke: 'hsl(var(--accent))', strokeOpacity: 0.4 }}
                      content={({ active, payload, label }) => {
                        if (!active || !payload || !payload.length) return null;
                        const p = payload[0].payload as (typeof chartData)[number];
                        return (
                          <div
                            style={{
                              backgroundColor: 'hsl(var(--popover) / 0.96)',
                              border: '1px solid hsl(0 0% 100% / 0.14)',
                              borderRadius: 8,
                              padding: '8px 10px',
                              fontSize: 12,
                              color: 'hsl(0 0% 100%)',
                              boxShadow: 'var(--shadow-xl)',
                              backdropFilter: 'blur(16px)',
                              minWidth: 180,
                            }}
                          >
                            <div style={{ fontWeight: 600, marginBottom: 4 }}>
                              TTM ending {label}
                            </div>
                            <div style={{ color: 'hsl(0 0% 100% / 0.9)' }}>
                              {fmtRate(p.rate)}
                            </div>
                            <div style={{ color: 'hsl(0 0% 100% / 0.72)', marginTop: 2 }}>
                              {fmtUSD(p.revenue)} ÷ {p.hours.toLocaleString(undefined, { maximumFractionDigits: 1 })} hrs
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="rate"
                      stroke="hsl(var(--chart-4))"
                      strokeWidth={2}
                      dot={{ r: 3, fill: 'hsl(var(--chart-4))' }}
                      activeDot={{ r: 5 }}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-[10px] text-muted-foreground">
                <div>Anchor = month end</div>
                <div className="text-center">Numerator = TTM Debt Advisory invoices</div>
                <div className="text-right">Denominator = TTM logged hours</div>
              </div>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b">
                <div className="text-xs font-semibold text-foreground">
                  Deals contributing hours · trailing 12 months
                </div>
                <div className="text-[11px] font-mono text-muted-foreground">
                  {dealRows.length} deal{dealRows.length !== 1 ? 's' : ''} · {trailing12.hrs.toLocaleString(undefined, { maximumFractionDigits: 1 })} hrs
                </div>
              </div>
              {dealRows.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">
                  No hours logged in the trailing 12 months for eligible deals.
                </p>
              ) : (
                <div className="max-h-[360px] overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-muted/20">
                      <tr className="border-b">
                        <th className="text-left px-3 py-1.5 text-[11px] font-medium text-muted-foreground">Deal</th>
                        <th className="text-right px-3 py-1.5 text-[11px] font-medium text-muted-foreground">Hours</th>
                        <th className="text-right px-3 py-1.5 text-[11px] font-medium text-muted-foreground">% of total</th>
                        <th className="text-right px-3 py-1.5 text-[11px] font-medium text-muted-foreground">Implied revenue @ TTM rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dealRows.map((r) => {
                        const pct = trailing12.hrs > 0 ? (r.hours / trailing12.hrs) * 100 : 0;
                        const implied = trailing12.rate != null ? r.hours * trailing12.rate : null;
                        return (
                          <tr key={r.id} className="border-b last:border-0 hover:bg-muted/20">
                            <td className="px-3 py-1.5 font-medium">{r.name}</td>
                            <td className="px-3 py-1.5 text-right font-mono">
                              {r.hours.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                            </td>
                            <td className="px-3 py-1.5 text-right font-mono text-muted-foreground">
                              {pct.toFixed(1)}%
                            </td>
                            <td className="px-3 py-1.5 text-right font-mono text-muted-foreground">
                              {implied != null ? fmtUSD(implied) : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-muted/20">
                        <td className="px-3 py-1.5 text-xs font-medium">Total</td>
                        <td className="px-3 py-1.5 text-right font-mono font-bold">
                          {trailing12.hrs.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono">100.0%</td>
                        <td className="px-3 py-1.5 text-right font-mono font-bold">
                          {fmtUSD(trailing12.rev)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SummaryTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={
        'rounded-md border p-3 ' +
        (accent
          ? 'border-primary/40 bg-primary/10'
          : 'border-border/50 bg-muted/10')
      }
    >
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-foreground">{value}</div>
    </div>
  );
}