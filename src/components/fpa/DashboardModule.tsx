import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  TrendingUp, TrendingDown, Minus, ArrowUpRight, ArrowDownRight,
  DollarSign, BarChart3, PieChart, Download, Share2, Filter,
  ChevronDown, Maximize2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, Legend, Area, AreaChart,
  PieChart as RePieChart, Pie, Cell
} from 'recharts';

// Demo KPI data
const KPI_CARDS = [
  { label: 'Total Revenue', value: '$9.5M', change: '+6.2%', trend: 'up' as const, period: 'MoM', detail: '$8.94M → $9.5M' },
  { label: 'Total COGS', value: '$2.85M', change: '-13.1%', trend: 'down' as const, period: 'MoM', detail: '$3.28M → $2.85M' },
  { label: 'Gross Margin', value: '70.0%', change: '+5.3pp', trend: 'up' as const, period: 'MoM', detail: '63.3% → 70.0%' },
  { label: 'Runway', value: '22 mo', change: '-4.3%', trend: 'down' as const, period: 'MoM', detail: '23 → 22 months' },
  { label: 'Net Income', value: '$1.2M', change: '+18.4%', trend: 'up' as const, period: 'MoM', detail: '$1.01M → $1.2M' },
  { label: 'OPEX', value: '$5.45M', change: '+2.1%', trend: 'up' as const, period: 'MoM', detail: '$5.34M → $5.45M' },
];

// Demo P&L table
const PNL_DATA = [
  { account: 'Revenue', actuals: 9500, bodTarget: 9200, forecast: 9600, variance: 300, variancePct: 3.3 },
  { account: '  Product Revenue', actuals: 6800, bodTarget: 6500, forecast: 6900, variance: 300, variancePct: 4.6 },
  { account: '  Service Revenue', actuals: 2700, bodTarget: 2700, forecast: 2700, variance: 0, variancePct: 0 },
  { account: 'COGS', actuals: -2850, bodTarget: -3100, forecast: -2900, variance: 250, variancePct: -8.1 },
  { account: 'Gross Profit', actuals: 6650, bodTarget: 6100, forecast: 6700, variance: 550, variancePct: 9.0 },
  { account: 'Operating Expenses', actuals: -5450, bodTarget: -5200, forecast: -5500, variance: -250, variancePct: 4.8 },
  { account: '  S&M', actuals: -2100, bodTarget: -2000, forecast: -2150, variance: -100, variancePct: 5.0 },
  { account: '  R&D', actuals: -1800, bodTarget: -1750, forecast: -1800, variance: -50, variancePct: 2.9 },
  { account: '  G&A', actuals: -1550, bodTarget: -1450, forecast: -1550, variance: -100, variancePct: 6.9 },
  { account: 'EBITDA', actuals: 1200, bodTarget: 900, forecast: 1200, variance: 300, variancePct: 33.3 },
  { account: 'Net Income', actuals: 1200, bodTarget: 850, forecast: 1200, variance: 350, variancePct: 41.2 },
];

// Revenue by segment
const REVENUE_SEGMENT = [
  { month: 'Jul', Enterprise: 3200, 'Mid-market': 2100, SMB: 1800 },
  { month: 'Aug', Enterprise: 3400, 'Mid-market': 2200, SMB: 1900 },
  { month: 'Sep', Enterprise: 3500, 'Mid-market': 2300, SMB: 1850 },
  { month: 'Oct', Enterprise: 3600, 'Mid-market': 2400, SMB: 1900 },
  { month: 'Nov', Enterprise: 3700, 'Mid-market': 2500, SMB: 1950 },
  { month: 'Dec', Enterprise: 3900, 'Mid-market': 2600, SMB: 2000 },
];

// OPEX by department
const OPEX_DEPARTMENT = [
  { month: 'Jul', 'S&M': 1900, 'R&D': 1700, 'G&A': 1400 },
  { month: 'Aug', 'S&M': 1950, 'R&D': 1720, 'G&A': 1420 },
  { month: 'Sep', 'S&M': 2000, 'R&D': 1750, 'G&A': 1450 },
  { month: 'Oct', 'S&M': 2020, 'R&D': 1780, 'G&A': 1480 },
  { month: 'Nov', 'S&M': 2050, 'R&D': 1790, 'G&A': 1510 },
  { month: 'Dec', 'S&M': 2100, 'R&D': 1800, 'G&A': 1550 },
];

// Top vendors
const TOP_VENDORS = [
  { dept: 'Engineering', vendor: 'AWS', spend: [42, 44, 45, 46, 48, 50] },
  { dept: 'Marketing', vendor: 'Google Ads', spend: [35, 38, 40, 42, 41, 43] },
  { dept: 'Sales', vendor: 'Salesforce', spend: [18, 18, 18, 18, 18, 18] },
  { dept: 'G&A', vendor: 'WeWork', spend: [25, 25, 25, 25, 25, 25] },
  { dept: 'Engineering', vendor: 'GitHub', spend: [8, 8, 8, 9, 9, 9] },
];

const COLORS = ['hsl(var(--primary))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

export function DashboardModule() {
  const [scenario, setScenario] = useState('actuals');
  const [dateRange, setDateRange] = useState('6m');
  const [dashboardTab, setDashboardTab] = useState('overview');

  const fmt = (v: number) => {
    if (Math.abs(v) >= 1000) return `$${(v / 1000).toFixed(1)}M`;
    return `$${v}K`;
  };

  return (
    <div className="space-y-4">
      {/* Global Filters */}
      <div className="flex items-center justify-between">
        <Tabs value={dashboardTab} onValueChange={setDashboardTab}>
          <TabsList>
            <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
            <TabsTrigger value="expenses" className="text-xs">Expenses by Vendor</TabsTrigger>
            <TabsTrigger value="pnl" className="text-xs">P&L</TabsTrigger>
            <TabsTrigger value="balance" className="text-xs">Balance Sheet</TabsTrigger>
            <TabsTrigger value="cashflow" className="text-xs">Cash Flow</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-2">
          <Select value={scenario} onValueChange={setScenario}>
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="actuals">Actuals</SelectItem>
              <SelectItem value="budget">Budget</SelectItem>
              <SelectItem value="forecast">Forecast</SelectItem>
            </SelectContent>
          </Select>
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="h-8 w-28 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="3m">Last 3M</SelectItem>
              <SelectItem value="6m">Last 6M</SelectItem>
              <SelectItem value="12m">Last 12M</SelectItem>
              <SelectItem value="ytd">YTD</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="h-8 gap-1 text-xs">
            <Download className="h-3.5 w-3.5" /> Export
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {KPI_CARDS.map((kpi) => (
          <Card key={kpi.label} className="cursor-pointer hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{kpi.label}</p>
              <div className="flex items-end gap-2 mt-1">
                <span className="text-xl font-bold">{kpi.value}</span>
                <span className={cn(
                  "text-xs font-medium flex items-center gap-0.5 mb-0.5",
                  kpi.trend === 'up' && kpi.label !== 'Total COGS' && kpi.label !== 'OPEX' ? 'text-emerald-600' : '',
                  kpi.trend === 'down' && (kpi.label === 'Total COGS') ? 'text-emerald-600' : '',
                  kpi.trend === 'down' && kpi.label === 'Runway' ? 'text-amber-600' : '',
                  kpi.trend === 'up' && kpi.label === 'OPEX' ? 'text-amber-600' : '',
                )}>
                  {kpi.trend === 'up' ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                  {kpi.change}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">{kpi.period} · {kpi.detail}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* P&L Summary Table */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">P&L — Actuals vs BoD Target vs Forecast ($K)</CardTitle>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0"><Maximize2 className="h-3.5 w-3.5" /></Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px]">Account</TableHead>
                  <TableHead className="text-[10px] text-right">Actuals</TableHead>
                  <TableHead className="text-[10px] text-right">BoD Target</TableHead>
                  <TableHead className="text-[10px] text-right">Forecast</TableHead>
                  <TableHead className="text-[10px] text-right">Δ ($K)</TableHead>
                  <TableHead className="text-[10px] text-right">Δ (%)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {PNL_DATA.map((row, i) => {
                  const isBold = !row.account.startsWith('  ');
                  return (
                    <TableRow key={i} className={cn(isBold && 'font-medium', 'cursor-pointer hover:bg-muted/50')}>
                      <TableCell className={cn("text-xs", !isBold && "pl-6")}>{row.account.trim()}</TableCell>
                      <TableCell className="text-xs text-right font-mono">{fmt(row.actuals)}</TableCell>
                      <TableCell className="text-xs text-right font-mono text-muted-foreground">{fmt(row.bodTarget)}</TableCell>
                      <TableCell className="text-xs text-right font-mono text-muted-foreground">{fmt(row.forecast)}</TableCell>
                      <TableCell className={cn("text-xs text-right font-mono", row.variance > 0 ? 'text-emerald-600' : row.variance < 0 ? 'text-destructive' : '')}>
                        {row.variance > 0 ? '+' : ''}{fmt(row.variance)}
                      </TableCell>
                      <TableCell className={cn("text-xs text-right font-mono", row.variancePct > 0 ? 'text-emerald-600' : row.variancePct < 0 ? 'text-destructive' : '')}>
                        {row.variancePct > 0 ? '+' : ''}{row.variancePct.toFixed(1)}%
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Revenue by Segment */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Revenue by Segment</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={REVENUE_SEGMENT}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `$${v/1000}M`} />
                <RechartsTooltip contentStyle={{ fontSize: 11, background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))' }} />
                <Area type="monotone" dataKey="Enterprise" stackId="1" stroke={COLORS[0]} fill={COLORS[0]} fillOpacity={0.6} />
                <Area type="monotone" dataKey="Mid-market" stackId="1" stroke={COLORS[1]} fill={COLORS[1]} fillOpacity={0.6} />
                <Area type="monotone" dataKey="SMB" stackId="1" stroke={COLORS[2]} fill={COLORS[2]} fillOpacity={0.6} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* OPEX & Vendors Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* OPEX by Department */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Trended OPEX by Department ($K)</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={OPEX_DEPARTMENT}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <RechartsTooltip contentStyle={{ fontSize: 11, background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))' }} />
                <Bar dataKey="S&M" stackId="a" fill={COLORS[0]} />
                <Bar dataKey="R&D" stackId="a" fill={COLORS[1]} />
                <Bar dataKey="G&A" stackId="a" fill={COLORS[2]} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top Vendors */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Top Vendors by Spend</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px]">Dept</TableHead>
                  <TableHead className="text-[10px]">Vendor</TableHead>
                  {['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map(m => (
                    <TableHead key={m} className="text-[10px] text-right">{m}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {TOP_VENDORS.map((v, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-[10px] text-muted-foreground">{v.dept}</TableCell>
                    <TableCell className="text-[10px] font-medium">{v.vendor}</TableCell>
                    {v.spend.map((s, j) => (
                      <TableCell key={j} className="text-[10px] text-right font-mono">${s}K</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
