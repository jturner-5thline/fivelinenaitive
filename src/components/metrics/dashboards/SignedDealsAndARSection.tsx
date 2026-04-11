import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Loader2, FileCheck } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { useDealsSignedMonthlySeries, useFinServClientsSignedMonthlySeries, type MonthBucket } from '@/hooks/useSignedDealsMonthly';
import { useOutstandingARByEntity } from '@/hooks/useOutstandingARByEntity';
import type { StageEntryDeal } from '@/hooks/usePipelineStageMetrics';

const formatCurrency = (value: number) => {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
};

const formatCurrencyFull = (value: number) =>
  value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 });

const PIE_COLORS = ['hsl(var(--primary))', 'hsl(var(--chart-2))'];

// ── Bar chart card ──
function SignedBarChart({
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
      <Card className="bg-card/50 backdrop-blur border-border/50">
        <CardHeader className="pb-2"><Skeleton className="h-5 w-32" /><Skeleton className="h-3 w-48 mt-1" /></CardHeader>
        <CardContent><Skeleton className="h-[220px] w-full" /></CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card/50 backdrop-blur border-border/50 hover:border-border transition-colors">
      <CardHeader className="pb-2 flex flex-row items-start justify-between">
        <div>
          <CardTitle className="text-sm font-medium text-foreground">{title}</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-foreground">{total}</p>
          <p className="text-[10px] text-muted-foreground">Last 6 Months</p>
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
                formatter={(v: number) => [v, 'Deals']}
                contentStyle={{
                  backgroundColor: 'hsl(var(--popover))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px',
                  color: 'hsl(var(--popover-foreground))',
                }}
                cursor={{ fill: 'hsl(var(--accent))', fillOpacity: 0.15 }}
              />
              <Bar dataKey="count" radius={[6, 6, 0, 0]} cursor="pointer" onClick={(d: MonthBucket) => onBarClick(d)}>
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
function OutstandingARPieChart() {
  const { slices, total, isLoading } = useOutstandingARByEntity();

  if (isLoading) {
    return (
      <Card className="bg-card/50 backdrop-blur border-border/50">
        <CardHeader className="pb-2"><Skeleton className="h-5 w-32" /><Skeleton className="h-3 w-48 mt-1" /></CardHeader>
        <CardContent><Skeleton className="h-[220px] w-full" /></CardContent>
      </Card>
    );
  }

  const pieData = slices.map(s => ({ name: s.entity, value: s.balance }));

  return (
    <Card className="bg-card/50 backdrop-blur border-border/50 hover:border-border transition-colors">
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
        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="45%"
                outerRadius={70}
                innerRadius={35}
                paddingAngle={3}
                label={({ name, value }: any) => `${name.split(',')[0]}: ${formatCurrency(value)}`}
                labelLine={{ stroke: 'hsl(var(--muted-foreground))', strokeWidth: 1 }}
              >
                {pieData.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i]} fillOpacity={0.85} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number, name: string) => {
                  const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0';
                  return [`${formatCurrencyFull(value)} (${pct}%)`, name];
                }}
                contentStyle={{
                  backgroundColor: 'hsl(var(--popover))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px',
                  color: 'hsl(var(--popover-foreground))',
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Drilldown modal ──
function DealsDrilldownModal({
  open,
  onClose,
  title,
  deals,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  deals: StageEntryDeal[];
}) {
  const total = deals.reduce((s, d) => s + d.value, 0);

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
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
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Deal / Company</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Amount</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Current Stage</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Entered</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Owner</th>
                </tr>
              </thead>
              <tbody>
                {deals.map(deal => (
                  <tr key={deal.deal_id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-3 py-2 text-xs font-medium">{deal.company}</td>
                    <td className="px-3 py-2 text-xs text-right font-mono">{formatCurrencyFull(deal.value)}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {deal.current_stage?.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || '—'}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {new Date(deal.entered_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{deal.manager || '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted/20">
                  <td className="px-3 py-2 text-xs font-medium">Total</td>
                  <td className="px-3 py-2 text-xs text-right font-mono font-bold">{formatCurrencyFull(total)}</td>
                  <td colSpan={3} />
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
export function SignedDealsAndARSection() {
  const debtSigned = useDealsSignedMonthlySeries(6);
  const finservSigned = useFinServClientsSignedMonthlySeries(6);
  const [drilldown, setDrilldown] = useState<{ title: string; deals: StageEntryDeal[] } | null>(null);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Signed Deals & AR</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Rolling last 6 months · Stage-entry based · Click bars for deal detail
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SignedBarChart
          title="Deals Signed"
          subtitle="Active Pipeline → Final Credit Items"
          months={debtSigned.months}
          isLoading={debtSigned.isLoading}
          color="hsl(var(--chart-3))"
          onBarClick={(bucket) => setDrilldown({ title: `Deals Signed — ${bucket.label}`, deals: bucket.deals })}
        />
        <SignedBarChart
          title="FinServ Clients Signed"
          subtitle="FinServ Pipeline → Active Client"
          months={finservSigned.months}
          isLoading={finservSigned.isLoading}
          color="hsl(var(--chart-4))"
          onBarClick={(bucket) => setDrilldown({ title: `FinServ Clients Signed — ${bucket.label}`, deals: bucket.deals })}
        />
        <OutstandingARPieChart />
      </div>

      <DealsDrilldownModal
        open={!!drilldown}
        onClose={() => setDrilldown(null)}
        title={drilldown?.title ?? ''}
        deals={drilldown?.deals ?? []}
      />
    </div>
  );
}
