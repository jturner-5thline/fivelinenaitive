import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Lock, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useMetricsData } from '@/hooks/useMetricsData';

const formatCurrency = (value: number) => {
  if (Math.abs(value) >= 1000000) return `$${(value / 1000000).toFixed(1)}MM`;
  if (Math.abs(value) >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
};

function KPICard({ title, value, change, changeDirection }: { 
  title: string; 
  value: string; 
  change?: string; 
  changeDirection?: 'up' | 'down' 
}) {
  return (
    <Card>
      <CardContent className="p-4 text-center">
        <p className="text-xs text-muted-foreground mb-1">{title}</p>
        <p className="text-2xl font-bold">{value}</p>
        {change && (
          <div className="flex items-center justify-center gap-1 mt-1">
            <span className={changeDirection === 'up' ? 'text-success' : 'text-destructive'}>
              {change}
            </span>
            {changeDirection === 'up' ? (
              <TrendingUp className="h-3 w-3 text-success" />
            ) : (
              <TrendingDown className="h-3 w-3 text-destructive" />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function NoPermissionCard({ title }: { title: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center justify-center py-6 text-muted-foreground">
        <Lock className="h-8 w-8 mb-2 opacity-50" />
        <p className="text-sm font-medium">No Permission</p>
        <p className="text-xs">You do not have permission to view the data</p>
        <Button variant="default" size="sm" className="mt-3">Request Permission</Button>
      </CardContent>
    </Card>
  );
}

function ErrorCard({ title }: { title: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center justify-center py-6 text-muted-foreground">
        <AlertCircle className="h-8 w-8 mb-2 text-destructive opacity-50" />
        <p className="text-sm text-destructive">Something went wrong</p>
      </CardContent>
    </Card>
  );
}

export function SalesBDROIDashboard() {
  const { data: metrics, isLoading } = useMetricsData();

  if (isLoading) {
    return <div className="animate-pulse">Loading...</div>;
  }

  const salesPnLData = [
    { metric: 'TTM REVENUE', value: '$258K', change: '14%', direction: 'up' as const },
    { metric: 'TTM COST', value: '', change: '0%', direction: 'down' as const },
    { metric: 'TTM PROFIT', value: '$64K', change: '58%', direction: 'up' as const },
  ];

  const performanceTable = [
    { metric: "DOB's #", actual: 7, forecast: 8, variance: -1, variantPct: '-13%' },
    { metric: "DOB's $", actual: '$39.5MM', forecast: '$50.5MM', variance: '- $11.0MM', variantPct: '-22%' },
    { metric: 'Deals Signed', actual: 1, forecast: 3, variance: -2, variantPct: '-67%' },
    { metric: 'Dollars Signed', actual: '$5.0MM', forecast: '$20.0MM', variance: '- $15.0MM', variantPct: '-75%' },
    { metric: 'Revenue', actual: '$33K', forecast: '$95K', variance: '- $62.2K', variantPct: '-66%' },
    { metric: 'Retainer Rev.', actual: '$18K', forecast: '$31K', variance: '- $13.5K', variantPct: '-44%' },
    { metric: 'Milestone', actual: '$15K', forecast: '$64K', variance: '- $48.7K', variantPct: '-76%' },
    { metric: 'Closing Fees', actual: '$0K', forecast: '$0K', variance: '$0.0K', variantPct: '0%' },
  ];

  const expensesTable = [
    { metric: 'Expenses', actual: '$32K', forecast: '$46K', variance: '- $14.4K', variantPct: '-31%' },
    { metric: 'Salaries', actual: '$28K', forecast: '$34K', variance: '- $5.3K', variantPct: '-16%' },
    { metric: 'Commissions', actual: '$3K', forecast: '$4K', variance: '- $0.7K', variantPct: '-17%' },
    { metric: 'Bonuses', actual: '$0K', forecast: '$0K', variance: '$0.0K', variantPct: '0%' },
    { metric: 'Events', actual: '$0K', forecast: '', variance: '', variantPct: '0%' },
  ];

  const repBreakdown = [
    { rep: 'Teresa', revenue: '$125K', roi: '-19%', runRateRoi: '359%', runRateRev: '$417K' },
    { rep: 'Niki', revenue: '$133K', roi: '8%', runRateRoi: '357%', runRateRev: '$1,071K' },
    { rep: 'Paz', revenue: '$-', roi: '0%', runRateRoi: '0%', runRateRev: '$0K' },
  ];

  return (
    <div className="space-y-6">
      {/* Header Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Current Month & Quarter */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Current Month</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="text-3xl font-bold text-primary border-2 border-primary rounded px-4 py-2 inline-block">Oct 2025</div>
              <div className="text-2xl font-bold text-primary">Q3-2025</div>
            </div>
          </CardContent>
        </Card>

        {/* Sales P&L */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Sales P&L</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableBody>
                {salesPnLData.map((row) => (
                  <TableRow key={row.metric}>
                    <TableCell className="font-medium">{row.metric}</TableCell>
                    <TableCell>{row.value}</TableCell>
                    <TableCell className={row.direction === 'up' ? 'text-success' : 'text-destructive'}>
                      {row.change}
                    </TableCell>
                    <TableCell>
                      {row.direction === 'up' ? <TrendingUp className="h-4 w-4 text-success" /> : <TrendingDown className="h-4 w-4 text-destructive" />}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Sales Section Header */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold">Sales</CardTitle>
        </CardHeader>
      </Card>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard title="Sales TTM ROI" value="41.4%" change="vs previous Mo 21% ↑" changeDirection="up" />
        <KPICard title="Run Rate ROI" value="555.1%" change="vs previous Mo 19% ↑" changeDirection="up" />
        <KPICard title="YTD Performance to Plan" value="- $88.0K" />
        <KPICard title="Proj. Performance to Plan" value="- $829.3K" change="vs previous Mo 0.0% ↓" changeDirection="down" />
      </div>

      {/* Performance & Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Sales Performance Table */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Sales Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sales</TableHead>
                  <TableHead className="text-right">Actual</TableHead>
                  <TableHead className="text-right">Forecast</TableHead>
                  <TableHead className="text-right text-destructive">Variance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {performanceTable.map((row) => (
                  <TableRow key={row.metric}>
                    <TableCell className="font-medium text-xs">{row.metric}</TableCell>
                    <TableCell className="text-right text-xs">{row.actual}</TableCell>
                    <TableCell className="text-right text-xs">{row.forecast}</TableCell>
                    <TableCell className="text-right text-xs text-destructive">{row.variance} {row.variantPct}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="mt-4 border-t pt-2">
              <p className="text-xs text-muted-foreground font-semibold">Expenses</p>
              <Table>
                <TableBody>
                  {expensesTable.map((row) => (
                    <TableRow key={row.metric}>
                      <TableCell className="font-medium text-xs">{row.metric}</TableCell>
                      <TableCell className="text-right text-xs">{row.actual}</TableCell>
                      <TableCell className="text-right text-xs">{row.forecast}</TableCell>
                      <TableCell className="text-right text-xs text-destructive">{row.variance} {row.variantPct}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Deals on Board & Dollars */}
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Deals on Board</p>
              <p className="text-4xl font-bold">7</p>
              <p className="text-success text-sm">vs previous Mo <span className="font-semibold">1 ↑</span></p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Dollars on Board</p>
              <p className="text-4xl font-bold">$39.5MM</p>
              <p className="text-success text-sm">vs previous Mo <span className="font-semibold">$5.5MM ↑</span></p>
            </CardContent>
          </Card>
        </div>

        {/* Rep Breakdown */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Rep Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead></TableHead>
                  <TableHead className="text-xs">TTM Revenue</TableHead>
                  <TableHead className="text-xs">TM ROI</TableHead>
                  <TableHead className="text-xs">RunRate ROI</TableHead>
                  <TableHead className="text-xs">RunRate Rev</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {repBreakdown.map((row) => (
                  <TableRow key={row.rep}>
                    <TableCell className="font-medium">{row.rep}</TableCell>
                    <TableCell className="text-xs">{row.revenue}</TableCell>
                    <TableCell className={`text-xs ${row.roi.startsWith('-') ? 'text-destructive' : 'text-success'}`}>{row.roi}</TableCell>
                    <TableCell className="text-xs text-success">{row.runRateRoi}</TableCell>
                    <TableCell className="text-xs">{row.runRateRev}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="mt-4 pt-2 border-t flex justify-between text-xs">
              <div>
                <span className="text-muted-foreground">Top Performer:</span> <span className="font-semibold">Niki</span>
              </div>
              <div>
                <span className="text-muted-foreground">Proj. Top Performer:</span> <span className="font-semibold">Teresa</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* BD Financials Section */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold">BD Financials</CardTitle>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <NoPermissionCard title="BD Financials" />
        <ErrorCard title="TTM BD ROI" />
        <ErrorCard title="BD Run Rate ROI" />
        <ErrorCard title="TTM Cost / Deal on Board" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <NoPermissionCard title="TTM BD ROI vs RunRate ROI" />
        <ErrorCard title="TTM CAC (Debt)" />
      </div>
    </div>
  );
}
