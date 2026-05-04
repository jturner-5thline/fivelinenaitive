import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Loader2, FileCheck } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from 'recharts';
import { createGlassBarShape } from '@/components/metrics/charts/LiquidGlassBar';
import { PieGlassDefs, GlassActiveShape } from '@/components/metrics/charts/LiquidGlassPie';
import { Skeleton } from '@/components/ui/skeleton';
import { useDealsSignedMonthlySeries, useFinServClientsSignedMonthlySeries, type MonthBucket } from '@/hooks/useSignedDealsMonthly';
import { useOutstandingARByEntity } from '@/hooks/useOutstandingARByEntity';
import type { StageEntryDeal } from '@/hooks/usePipelineStageMetrics';
import type {
  DealOrigin,
  DealOriginLocationState,
} from '@/lib/dealOriginContext';
import { consumePendingReopen } from '@/lib/dealOriginContext';

const formatCurrency = (value: number) => {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
};

const formatCurrencyFull = (value: number) =>
  value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 });

const PIE_COLORS = ['hsl(var(--primary))', 'hsl(var(--chart-2))'];

// Pretty-print stage / pipeline identifiers used in stage_change activity logs.
const ACTIVE_PIPELINE_ID = 'b78ad452-b489-4c89-8a91-789347c05f79';
const FINSERV_PIPELINE_ID = 'eb9db15a-62cc-4b99-adcf-24e57a2a46ce';

const prettyStage = (slug?: string | null) =>
  slug ? slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : '—';

const prettyPipeline = (id?: string | null) => {
  if (id === ACTIVE_PIPELINE_ID) return 'Active Pipeline';
  if (id === FINSERV_PIPELINE_ID) return 'FinServ Pipeline';
  return id ?? '—';
};

// ── Bar chart card ──
export function SignedBarChart({
  title,
  subtitle,
  months,
  isLoading,
  color,
  onBarClick,
}: {
  title: string;
  subtitle: string;
  months: MonthBucket[];
  isLoading: boolean;
  color: string;
  onBarClick: (bucket: MonthBucket) => void;
}) {
  const total = months.reduce((s, m) => s + m.count, 0);

  if (isLoading) {
    return (
      <Card className="glass-module">
        <CardHeader className="pb-2"><Skeleton className="h-5 w-32" /><Skeleton className="h-3 w-48 mt-1" /></CardHeader>
        <CardContent><Skeleton className="h-[220px] w-full" /></CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-module glass-module-interactive">
      <CardHeader className="pb-2 flex flex-row items-start justify-between">
        <div>
          <CardTitle className="text-sm font-medium text-foreground">{title}</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-foreground">{total}</p>
          <p className="text-[10px] text-muted-foreground">{months.length} Months</p>
        </div>
      </CardHeader>
      <CardContent>
        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={months} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={{ stroke: 'hsl(var(--border))' }}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload || !payload.length) return null;
                  const bucket = payload[0].payload as MonthBucket;
                  return (
                    <div
                      style={{
                        backgroundColor: 'hsl(var(--popover) / 0.96)',
                        border: '1px solid hsl(0 0% 100% / 0.14)',
                        borderRadius: 8,
                        padding: '8px 10px',
                        fontSize: 12,
                        color: 'hsl(0 0% 100%)',
                        maxWidth: 260,
                        boxShadow: 'var(--shadow-xl)',
                        backdropFilter: 'blur(16px)',
                      }}
                    >
                      <div style={{ fontWeight: 600, marginBottom: 4, color: 'hsl(0 0% 100%)' }}>
                        {bucket.label} · {bucket.count} deal{bucket.count !== 1 ? 's' : ''}
                      </div>
                      {bucket.deals.length > 0 ? (
                        <ul style={{ margin: 0, paddingLeft: 14, lineHeight: 1.4 }}>
                          {bucket.deals.slice(0, 8).map(d => (
                            <li key={d.deal_id} style={{ color: 'hsl(0 0% 100% / 0.88)' }}>
                              {d.company}
                            </li>
                          ))}
                          {bucket.deals.length > 8 && (
                            <li style={{ color: 'hsl(0 0% 100% / 0.78)' }}>
                              +{bucket.deals.length - 8} more
                            </li>
                          )}
                        </ul>
                      ) : (
                        <div style={{ color: 'hsl(0 0% 100% / 0.78)' }}>No deals</div>
                      )}
                    </div>
                  );
                }}
                wrapperStyle={{ outline: 'none' }}
                cursor={{ fill: 'hsl(var(--accent))', fillOpacity: 0.15 }}
              />
              <Bar dataKey="count" shape={createGlassBarShape({ radius: 3 })} cursor="pointer" onClick={(d: MonthBucket) => onBarClick(d)}>
                {months.map((m, i) => (
                  <Cell key={i} fill={m.count > 0 ? color : 'hsl(var(--muted))'} fillOpacity={m.count > 0 ? 0.85 : 0.3} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Outstanding AR pie chart ──
export function OutstandingARPieChart() {
  const { slices, total, isLoading } = useOutstandingARByEntity();

  if (isLoading) {
    return (
      <Card className="glass-module">
        <CardHeader className="pb-2"><Skeleton className="h-5 w-32" /><Skeleton className="h-3 w-48 mt-1" /></CardHeader>
        <CardContent><Skeleton className="h-[220px] w-full" /></CardContent>
      </Card>
    );
  }

  const pieData = slices.map(s => ({ name: s.entity, value: s.balance }));

  const legendItems = pieData.map((d, i) => ({
    label: d.name,
    value: formatCurrency(d.value),
    color: PIE_COLORS[i],
  }));

  return (
    <Card className="glass-module glass-module-interactive">
      <CardHeader className="pb-2 flex flex-row items-start justify-between">
        <div>
          <CardTitle className="text-sm font-medium text-foreground">Outstanding A/R</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">By entity · QuickBooks balance</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-foreground">{formatCurrency(total)}</p>
          <p className="text-[10px] text-muted-foreground">Total Outstanding</p>
        </div>
      </CardHeader>
      <CardContent>
        <div style={{ height: 170 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <PieGlassDefs colors={PIE_COLORS} />
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={65}
                innerRadius={30}
                paddingAngle={3}
                activeShape={GlassActiveShape}
              >
                {pieData.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i]} fillOpacity={0.75} stroke={PIE_COLORS[i]} strokeWidth={0.5} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number, name: string) => {
                  const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0';
                  return [`${formatCurrencyFull(value)} (${pct}%)`, name];
                }}
                contentStyle={{
                  backgroundColor: 'hsl(var(--popover) / 0.96)',
                  border: '1px solid hsl(0 0% 100% / 0.14)',
                  borderRadius: '8px',
                  fontSize: '12px',
                  color: 'hsl(0 0% 100%)',
                  boxShadow: 'var(--shadow-xl)',
                  backdropFilter: 'blur(16px)',
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        {/* Below-chart legend */}
        <div className="mt-2 space-y-1.5">
          {legendItems.map((item, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: item.color, opacity: 0.75 }} />
              <span className="text-muted-foreground truncate flex-1" title={item.label}>{item.label}</span>
              <span className="font-medium text-foreground flex-shrink-0">{item.value}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Drilldown modal ──
export function SignedDealsDrilldownModal({
  open,
  onClose,
  title,
  deals,
  origin,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  deals: StageEntryDeal[];
  /** Back-navigation context handed to each deal-id link. */
  origin: DealOrigin | null;
}) {
  const total = deals.reduce((s, d) => s + d.value, 0);

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileCheck className="h-4 w-4" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-3 mb-4">
          <Badge variant="outline" className="text-xs">{deals.length} deal{deals.length !== 1 ? 's' : ''}</Badge>
          <Badge variant="secondary" className="text-xs font-mono">{formatCurrencyFull(total)}</Badge>
          <span className="text-xs text-muted-foreground">Stage-entry based · First entry only</span>
        </div>

        {deals.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No deals found for this month.</p>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Company</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Amount</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Move date</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">From stage</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">To stage</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Pipeline</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Deal ID</th>
                </tr>
              </thead>
              <tbody>
                {deals.map(deal => (
                  <tr key={deal.deal_id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-3 py-2 text-xs font-medium">{deal.company}</td>
                    <td className="px-3 py-2 text-xs text-right font-mono">{formatCurrencyFull(deal.value)}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {new Date(deal.entered_at).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric',
                      })}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{prettyStage(deal.from_stage)}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{prettyStage(deal.to_stage ?? deal.current_stage)}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{prettyPipeline(deal.pipeline_id)}</td>
                    <td className="px-3 py-2 text-[11px] font-mono truncate max-w-[120px]">
                      <Link
                        to={`/deal/${deal.deal_id}`}
                        state={
                          origin
                            ? ({ dealOrigin: origin } satisfies DealOriginLocationState)
                            : undefined
                        }
                        className="text-primary hover:underline focus:underline focus:outline-none rounded-sm"
                        title={`Open deal ${deal.deal_id}`}
                        onClick={onClose}
                      >
                        {deal.deal_id.slice(0, 8)}…
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted/20">
                  <td className="px-3 py-2 text-xs font-medium">Total</td>
                  <td className="px-3 py-2 text-xs text-right font-mono font-bold">{formatCurrencyFull(total)}</td>
                  <td colSpan={5} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Main section ──
export function SignedDealsAndARSection({ selectedQuarter }: { selectedQuarter: import('@/hooks/useQBQuarterlyRevenue').QuarterOption }) {
  const debtSigned = useDealsSignedMonthlySeries(selectedQuarter.months);
  const finservSigned = useFinServClientsSignedMonthlySeries(selectedQuarter.months);
  const [drilldown, setDrilldown] = useState<{
    title: string;
    deals: StageEntryDeal[];
    origin: DealOrigin;
  } | null>(null);

  /** Build a back-navigation origin describing this exact drilldown. */
  const buildOrigin = (
    chart: 'deals-signed' | 'finserv-clients-signed',
    bucket: MonthBucket,
  ): DealOrigin => {
    const chartLabel = chart === 'deals-signed' ? 'Signed Deals' : 'FinServ Clients Signed';
    return {
      label: `Back to ${chartLabel} (${bucket.label})`,
      returnTo: '/insights',
      reopen: {
        source: 'insights.signed-deals-and-ar',
        bucketKey: `${chart}|${bucket.key}`,
        bucketLabel: bucket.label,
        quarterId: selectedQuarter.value,
      },
    };
  };

  // Re-open the originating drilldown when returning from the Deal Details page.
  useEffect(() => {
    if (debtSigned.isLoading || finservSigned.isLoading) return;
    const reopen = consumePendingReopen(
      (r) =>
        r.source === 'insights.signed-deals-and-ar' &&
        r.quarterId === selectedQuarter.value,
    );
    if (!reopen) return;
    const [chart, monthKey] = reopen.bucketKey.split('|');
    const series = chart === 'deals-signed' ? debtSigned : finservSigned;
    const bucket = series.months.find((m) => m.key === monthKey);
    if (!bucket) return;
    const chartLabel = chart === 'deals-signed' ? 'Deals Signed' : 'FinServ Clients Signed';
    setDrilldown({
      title: `${chartLabel} — ${bucket.label}`,
      deals: bucket.deals,
      origin: buildOrigin(chart as 'deals-signed' | 'finserv-clients-signed', bucket),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debtSigned.isLoading, finservSigned.isLoading, selectedQuarter.value]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Signed Deals & AR</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          {selectedQuarter.label} · Stage-entry based · Click bars for deal detail
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SignedBarChart
          title="Deals Signed"
          subtitle="Active Pipeline → Final Credit Items"
          months={debtSigned.months}
          isLoading={debtSigned.isLoading}
          color="hsl(var(--chart-3))"
          onBarClick={(bucket) =>
            setDrilldown({
              title: `Deals Signed — ${bucket.label}`,
              deals: bucket.deals,
              origin: buildOrigin('deals-signed', bucket),
            })
          }
        />
        <SignedBarChart
          title="FinServ Clients Signed"
          subtitle="FinServ Pipeline → Active Client"
          months={finservSigned.months}
          isLoading={finservSigned.isLoading}
          color="hsl(var(--chart-4))"
          onBarClick={(bucket) =>
            setDrilldown({
              title: `FinServ Clients Signed — ${bucket.label}`,
              deals: bucket.deals,
              origin: buildOrigin('finserv-clients-signed', bucket),
            })
          }
        />
        <OutstandingARPieChart />
      </div>

      <DealsDrilldownModal
        open={!!drilldown}
        onClose={() => setDrilldown(null)}
        title={drilldown?.title ?? ''}
        deals={drilldown?.deals ?? []}
        origin={drilldown?.origin ?? null}
      />
    </div>
  );
}
