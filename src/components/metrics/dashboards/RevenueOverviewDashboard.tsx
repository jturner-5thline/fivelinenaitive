import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { DollarSign, TrendingUp, Building2, Loader2, Inbox, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton as RowSkeleton } from '@/components/ui/skeleton';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend,
} from 'recharts';
import { createGlassBarShape } from '@/components/metrics/charts/LiquidGlassBar';
import { useQBStackedDebtRevenue, STACKED_CATEGORIES, type StackedDebtMonth } from '@/hooks/useQBStackedDebtRevenue';
import { useQBStackedFinServRevenue, FINSERV_STACKED_CATEGORIES, type StackedFinServMonth } from '@/hooks/useQBStackedFinServRevenue';
import {
  useQBQuarterlyRevenue,
  useQBCombinedQuarterlyRevenue,
  type QuarterOption,
  type MonthlyRevenue,
} from '@/hooks/useQBQuarterlyRevenue';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

// Entity realm IDs
const DEBT_REALM_ID = '193514877331929';
const FINSERV_REALM_ID = '9341451968897660';

const REALM_LABELS: Record<string, string> = {
  [DEBT_REALM_ID]: 'Debt (5th Line Capital Advisors)',
  [FINSERV_REALM_ID]: 'FinServ (5th Line Financial Services)',
};

const formatCurrency = (value: number) => {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
};

const formatCurrencyFull = (value: number) =>
  value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

interface DrilldownData {
  title: string;
  monthKey: string;
  realmIds: string[];
}

interface InvoiceRow {
  id: string;
  txn_date: string;
  customer_name: string | null;
  total_amt: number | null;
  doc_number: string | null;
  realm_id: string;
}

function RevenueBarChart({
  title,
  subtitle,
  data,
  isLoading,
  total,
  color,
  onBarClick,
}: {
  title: string;
  subtitle: string;
  data: MonthlyRevenue[];
  isLoading: boolean;
  total: number;
  color: string;
  onBarClick: (monthKey: string) => void;
}) {
  if (isLoading) {
    return (
      <Card className="glass-module">
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-3 w-48 mt-1" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[220px] w-full" />
        </CardContent>
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
          <p className="text-lg font-bold text-foreground">{formatCurrency(total)}</p>
          <p className="text-[10px] text-muted-foreground">Quarter Total</p>
        </div>
      </CardHeader>
      <CardContent>
        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 8, right: 8, left: -10, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
                strokeOpacity={0.4}
                vertical={false}
              />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={{ stroke: 'hsl(var(--border))' }}
                tickLine={false}
              />
              <YAxis
                tickFormatter={formatCurrency}
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                formatter={(v: number) => [formatCurrencyFull(v), 'Revenue']}
                contentStyle={{
                  backgroundColor: 'hsl(var(--popover))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px',
                  color: 'hsl(var(--popover-foreground))',
                }}
                labelStyle={{ color: 'hsl(var(--muted-foreground))', fontWeight: 500 }}
                cursor={{ fill: 'hsl(var(--accent))', fillOpacity: 0.15 }}
              />
              <Bar
                dataKey="amount"
                shape={createGlassBarShape({ radius: 6 })}
                cursor="pointer"
                onClick={(d: MonthlyRevenue) => onBarClick(d.monthKey)}
              >
                {data.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={entry.amount > 0 ? color : 'hsl(var(--muted))'}
                    fillOpacity={entry.amount > 0 ? 0.85 : 0.3}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function DrilldownModal({
  open,
  onClose,
  drilldown,
  quarter,
}: {
  open: boolean;
  onClose: () => void;
  drilldown: DrilldownData | null;
  quarter: QuarterOption;
}) {
  const { user } = useAuth();

  // Local filter state, seeded from the clicked bar
  const [monthKey, setMonthKey] = useState<string>('');
  const [realmFilter, setRealmFilter] = useState<string>('all');

  // Reseed filters whenever a new drilldown is opened
  const drilldownKey = `${drilldown?.title ?? ''}-${drilldown?.monthKey ?? ''}`;
  const [seededFor, setSeededFor] = useState<string>('');
  if (drilldown && seededFor !== drilldownKey) {
    setSeededFor(drilldownKey);
    setMonthKey(drilldown.monthKey);
    setRealmFilter(drilldown.realmIds.length === 1 ? drilldown.realmIds[0] : 'all');
  }

  const month = quarter.months.find(m => m.key === monthKey);
  const availableRealms = drilldown?.realmIds ?? [];
  const effectiveRealms =
    realmFilter === 'all' ? availableRealms : [realmFilter];

  const { data: invoices, isLoading } = useQuery({
    queryKey: ['qb-drilldown-invoices', effectiveRealms, monthKey],
    queryFn: async () => {
      if (!month || !drilldown) return [];
      const { data, error } = await supabase
        .from('quickbooks_invoices')
        .select('id, txn_date, customer_name, total_amt, doc_number, realm_id')
        .in('realm_id', effectiveRealms)
        .gte('txn_date', month.start)
        .lte('txn_date', month.end)
        .order('txn_date', { ascending: true });
      if (error) throw error;
      return (data ?? []) as InvoiceRow[];
    },
    enabled: open && !!drilldown && !!month && !!user && effectiveRealms.length > 0,
  });

  const total = (invoices ?? []).reduce((s, r) => s + (r.total_amt ?? 0), 0);

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            {drilldown?.title} — {month?.label} Detail
          </DialogTitle>
        </DialogHeader>

        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Month</Label>
            <Select value={monthKey} onValueChange={setMonthKey}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select month" />
              </SelectTrigger>
              <SelectContent>
                {quarter.months.map(m => (
                  <SelectItem key={m.key} value={m.key} className="text-xs">
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Entity (Realm)</Label>
            <Select value={realmFilter} onValueChange={setRealmFilter}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select entity" />
              </SelectTrigger>
              <SelectContent>
                {availableRealms.length > 1 && (
                  <SelectItem value="all" className="text-xs">All entities</SelectItem>
                )}
                {availableRealms.map(r => (
                  <SelectItem key={r} value={r} className="text-xs">
                    {REALM_LABELS[r] ?? r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <Badge variant="outline" className="text-xs">
            {invoices?.length ?? 0} invoices
          </Badge>
          <Badge variant="secondary" className="text-xs font-mono">
            {formatCurrencyFull(total)}
          </Badge>
          <span className="text-xs text-muted-foreground">Accrual basis · Invoice date</span>
        </div>

        {isLoading ? (
          <div className="border rounded-lg overflow-hidden" aria-busy="true" aria-live="polite">
            <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Loading invoices for {month?.label ?? 'selected month'}…</span>
            </div>
            <div className="divide-y">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2">
                  <RowSkeleton className="h-3 w-20" />
                  <RowSkeleton className="h-3 w-16" />
                  <RowSkeleton className="h-3 flex-1" />
                  <RowSkeleton className="h-3 w-20" />
                </div>
              ))}
            </div>
          </div>
        ) : !invoices?.length ? (
          <div className="border border-dashed rounded-lg flex flex-col items-center justify-center text-center py-10 px-6">
            <div className="rounded-full bg-muted/40 p-3 mb-3">
              <Inbox className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">No invoices match these filters</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              Nothing was billed in <span className="font-medium text-foreground">{month?.label ?? 'this month'}</span>
              {realmFilter !== 'all' && (
                <> for <span className="font-medium text-foreground">{REALM_LABELS[realmFilter] ?? realmFilter}</span></>
              )}
              . Try a different month{availableRealms.length > 1 && ' or entity'}.
            </p>
            {(realmFilter !== 'all' && availableRealms.length > 1) && (
              <Button
                variant="outline"
                size="sm"
                className="mt-3 h-7 text-xs"
                onClick={() => setRealmFilter('all')}
              >
                <RotateCcw className="h-3 w-3 mr-1.5" />
                Show all entities
              </Button>
            )}
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Date</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Invoice #</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Customer</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map(inv => (
                  <tr key={inv.id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-3 py-2 text-xs text-muted-foreground">{inv.txn_date}</td>
                    <td className="px-3 py-2 text-xs font-mono">{inv.doc_number || '—'}</td>
                    <td className="px-3 py-2 text-xs">{inv.customer_name || '—'}</td>
                    <td className="px-3 py-2 text-xs text-right font-mono">
                      {formatCurrencyFull(inv.total_amt ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted/20">
                  <td colSpan={3} className="px-3 py-2 text-xs font-medium">Total</td>
                  <td className="px-3 py-2 text-xs text-right font-mono font-bold">
                    {formatCurrencyFull(total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StackedDebtRevenueChart({
  data,
  isLoading,
  total,
  onBarClick,
}: {
  data: StackedDebtMonth[];
  isLoading: boolean;
  total: number;
  onBarClick: (monthKey: string, category?: string) => void;
}) {
  if (isLoading) {
    return (
      <Card className="glass-module">
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-3 w-48 mt-1" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[220px] w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-module glass-module-interactive">
      <CardHeader className="pb-2 flex flex-row items-start justify-between">
        <div>
          <CardTitle className="text-sm font-medium text-foreground">Debt Revenue</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">5th Line Capital Advisors, LLC</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-foreground">{formatCurrency(total)}</p>
          <p className="text-[10px] text-muted-foreground">Quarter Total</p>
        </div>
      </CardHeader>
      <CardContent>
        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 8, right: 8, left: -10, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
                strokeOpacity={0.4}
                vertical={false}
              />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={{ stroke: 'hsl(var(--border))' }}
                tickLine={false}
              />
              <YAxis
                tickFormatter={formatCurrency}
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const monthTotal = payload.reduce((s, p) => s + (Number(p.value) || 0), 0);
                  return (
                    <div
                      style={{
                        backgroundColor: 'hsl(var(--popover) / 0.96)',
                        border: '1px solid hsl(0 0% 100% / 0.14)',
                        borderRadius: '8px',
                        padding: '8px 12px',
                        fontSize: '12px',
                        color: 'hsl(0 0% 100%)',
                        boxShadow: 'var(--shadow-xl)',
                        backdropFilter: 'blur(16px)',
                      }}
                    >
                      <p style={{ fontWeight: 600, marginBottom: 4, color: 'hsl(0 0% 100%)' }}>{label}</p>
                      {payload.filter(p => (Number(p.value) || 0) !== 0).map((p, i) => (
                        <div key={i} className="flex items-center gap-2 py-0.5">
                          <span
                            className="inline-block w-2 h-2 rounded-full"
                            style={{ backgroundColor: p.color }}
                          />
                          <span className="text-xs text-white/88">{STACKED_CATEGORIES.find(c => c.key === p.dataKey)?.label ?? p.dataKey}</span>
                          <span className="ml-auto font-mono text-xs font-semibold text-white">{formatCurrencyFull(Number(p.value))}</span>
                        </div>
                      ))}
                      <div className="border-t mt-1 pt-1 flex justify-between text-xs font-semibold text-white" style={{ borderColor: 'hsl(0 0% 100% / 0.12)' }}>
                        <span>Total</span>
                        <span className="font-mono text-white">{formatCurrencyFull(monthTotal)}</span>
                      </div>
                    </div>
                  );
                }}
                cursor={{ fill: 'hsl(var(--accent))', fillOpacity: 0.15 }}
              />
              <Legend
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: 10, paddingTop: 4 }}
                formatter={(value) => STACKED_CATEGORIES.find(c => c.key === value)?.label ?? value}
              />
              {STACKED_CATEGORIES.map((cat, catIdx) => (
                <Bar
                  key={cat.key}
                  dataKey={cat.key}
                  stackId="debt"
                  fill={cat.color}
                  fillOpacity={0.85}
                  cursor="pointer"
                  onClick={(d: StackedDebtMonth) => onBarClick(d.monthKey, cat.key)}
                  shape={createGlassBarShape({
                    radius: 3,
                    topSegmentKey: STACKED_CATEGORIES[STACKED_CATEGORIES.length - 1].key,
                    dataKey: cat.key,
                  })}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
function StackedGenericRevenueChart({
  title,
  subtitle,
  data,
  isLoading,
  total,
  categories,
  onBarClick,
}: {
  title: string;
  subtitle: string;
  data: any[];
  isLoading: boolean;
  total: number;
  categories: readonly { key: string; label: string; color: string }[];
  onBarClick: (monthKey: string, category?: string) => void;
}) {
  if (isLoading) {
    return (
      <Card className="glass-module">
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-3 w-48 mt-1" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[220px] w-full" />
        </CardContent>
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
          <p className="text-lg font-bold text-foreground">{formatCurrency(total)}</p>
          <p className="text-[10px] text-muted-foreground">Quarter Total</p>
        </div>
      </CardHeader>
      <CardContent>
        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={{ stroke: 'hsl(var(--border))' }} tickLine={false} />
              <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const monthTotal = payload.reduce((s, p) => s + (Number(p.value) || 0), 0);
                  return (
                    <div style={{ backgroundColor: 'hsl(var(--popover) / 0.96)', border: '1px solid hsl(0 0% 100% / 0.14)', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', color: 'hsl(0 0% 100%)', boxShadow: 'var(--shadow-xl)', backdropFilter: 'blur(16px)' }}>
                      <p style={{ fontWeight: 600, marginBottom: 4, color: 'hsl(0 0% 100%)' }}>{label}</p>
                      {payload.filter(p => (Number(p.value) || 0) !== 0).map((p, i) => (
                        <div key={i} className="flex items-center gap-2 py-0.5">
                          <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                          <span className="text-xs text-white/88">{categories.find(c => c.key === p.dataKey)?.label ?? p.dataKey}</span>
                          <span className="ml-auto font-mono text-xs font-semibold text-white">{formatCurrencyFull(Number(p.value))}</span>
                        </div>
                      ))}
                      <div className="border-t mt-1 pt-1 flex justify-between text-xs font-semibold text-white" style={{ borderColor: 'hsl(0 0% 100% / 0.12)' }}>
                        <span>Total</span>
                        <span className="font-mono text-white">{formatCurrencyFull(monthTotal)}</span>
                      </div>
                    </div>
                  );
                }}
                cursor={{ fill: 'hsl(var(--accent))', fillOpacity: 0.15 }}
              />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10, paddingTop: 4 }} formatter={(value) => categories.find(c => c.key === value)?.label ?? value} />
              {categories.map(cat => (
                <Bar key={cat.key} dataKey={cat.key} stackId="stack" fill={cat.color} fillOpacity={0.85} cursor="pointer" onClick={(d: Record<string, unknown>) => onBarClick(d.monthKey as string, cat.key)}
                  shape={createGlassBarShape({
                    radius: 3,
                    topSegmentKey: categories[categories.length - 1].key,
                    dataKey: cat.key,
                  })}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

export function RevenueQuarterlySection({ selectedQuarter }: { selectedQuarter: QuarterOption }) {
  const [drilldown, setDrilldown] = useState<DrilldownData | null>(null);

  // Stacked Debt Revenue: 5th Line Capital Advisors LLC
  const debtRevenue = useQBStackedDebtRevenue(selectedQuarter);

  // Stacked FinServ Revenue: 5th Line Financial Services, LLC
  const finservRevenue = useQBStackedFinServRevenue(selectedQuarter);

  // Total Revenue: Debt + FinServ combined
  const totalRevenue = useQBCombinedQuarterlyRevenue(
    [DEBT_REALM_ID, FINSERV_REALM_ID],
    selectedQuarter,
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-foreground">Revenue Overview</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Monthly revenue by entity · QuickBooks accrual basis · {selectedQuarter.label} · Click bars for detail
        </p>
      </div>

      {/* 3 charts in a row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <StackedDebtRevenueChart
          data={debtRevenue.months}
          isLoading={debtRevenue.isLoading}
          total={debtRevenue.total}
          onBarClick={(monthKey) =>
            setDrilldown({ title: 'Debt Revenue', monthKey, realmIds: [DEBT_REALM_ID] })
          }
        />
        <StackedGenericRevenueChart
          title="FinServ Revenue"
          subtitle="5th Line Financial Services, LLC"
          data={finservRevenue.months}
          isLoading={finservRevenue.isLoading}
          total={finservRevenue.total}
          categories={FINSERV_STACKED_CATEGORIES}
          onBarClick={(monthKey) =>
            setDrilldown({ title: 'FinServ Revenue', monthKey, realmIds: [FINSERV_REALM_ID] })
          }
        />
        {/* Third grid slot intentionally left empty so Debt Revenue and
            FinServ Revenue retain their original column widths and do not
            reflow after the Total Revenue chart was removed. */}
        <div aria-hidden="true" />
      </div>

      {/* Drilldown Modal */}
      <DrilldownModal
        open={!!drilldown}
        onClose={() => setDrilldown(null)}
        drilldown={drilldown}
        quarter={selectedQuarter}
      />
    </div>
  );
}
