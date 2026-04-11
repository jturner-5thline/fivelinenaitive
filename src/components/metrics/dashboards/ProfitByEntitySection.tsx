import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';
import { useMonthlyEntityProfit, type ProfitMonthBucket } from '@/hooks/useMonthlyEntityProfit';

const formatCurrency = (value: number) => {
  const neg = value < 0;
  const abs = Math.abs(value);
  let formatted: string;
  if (abs >= 1_000_000) formatted = `$${(abs / 1_000_000).toFixed(1)}M`;
  else if (abs >= 1_000) formatted = `$${(abs / 1_000).toFixed(1)}k`;
  else formatted = `$${abs.toFixed(0)}`;
  return neg ? `(${formatted})` : formatted;
};

const formatCurrencyFull = (value: number) =>
  value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 });

function ProfitBarChart({
  title,
  entityName,
  months,
  isLoading,
  total,
  color,
}: {
  title: string;
  entityName: string;
  months: ProfitMonthBucket[];
  isLoading: boolean;
  total: number;
  color: string;
}) {
  if (isLoading) {
    return (
      <Card className="bg-card/50 backdrop-blur border-border/50">
        <CardHeader className="pb-2"><Skeleton className="h-5 w-32" /><Skeleton className="h-3 w-48 mt-1" /></CardHeader>
        <CardContent><Skeleton className="h-[220px] w-full" /></CardContent>
      </Card>
    );
  }

  const hasNegative = months.some(m => m.profit < 0);

  return (
    <Card className="bg-card/50 backdrop-blur border-border/50 hover:border-border transition-colors">
      <CardHeader className="pb-2 flex flex-row items-start justify-between">
        <div>
          <CardTitle className="text-sm font-medium text-foreground">{title}</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">Operating Profit · {entityName.split(',')[0]}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-foreground">{formatCurrency(total)}</p>
          <p className="text-[10px] text-muted-foreground">Last 3 Months</p>
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
                tickFormatter={formatCurrency}
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                formatter={(v: number) => [formatCurrencyFull(v), 'Profit']}
                labelFormatter={(label) => `${label} · ${entityName}`}
                contentStyle={{
                  backgroundColor: 'hsl(var(--popover))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px',
                  color: 'hsl(var(--popover-foreground))',
                }}
                cursor={{ fill: 'hsl(var(--accent))', fillOpacity: 0.15 }}
              />
              {hasNegative && (
                <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={1} />
              )}
              <Bar dataKey="profit" radius={[6, 6, 0, 0]}>
                {months.map((m, i) => (
                  <Cell
                    key={i}
                    fill={m.profit >= 0 ? color : 'hsl(0, 72%, 51%)'}
                    fillOpacity={0.85}
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

export function ProfitByEntitySection() {
  const debt = useMonthlyEntityProfit('5th Line Capital Advisors, LLC', 3);
  const finserv = useMonthlyEntityProfit('5th Line Financial Services, LLC', 3);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Profit by Entity</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Rolling last 3 months · QuickBooks operating profit / EBITDA
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ProfitBarChart
          title="Debt Profit"
          entityName="5th Line Capital Advisors, LLC"
          months={debt.months}
          isLoading={debt.isLoading}
          total={debt.total}
          color="hsl(var(--primary))"
        />
        <ProfitBarChart
          title="FinServ Profit"
          entityName="5th Line Financial Services, LLC"
          months={finserv.months}
          isLoading={finserv.isLoading}
          total={finserv.total}
          color="hsl(var(--chart-4))"
        />
      </div>
    </div>
  );
}
