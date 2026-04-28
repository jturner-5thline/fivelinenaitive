import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Maximize2, Minimize2, TrendingUp, TrendingDown, ArrowUpRight
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, Legend, Area, AreaChart, Cell,
  ComposedChart
} from 'recharts';
import { type ChartConfig, type ChartType, COLOR_THEMES, DEFAULT_CHART_CONFIG } from './ChartConfigPanel';

const DEFAULT_COLORS = ['hsl(var(--primary))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

// Revenue by segment
const REVENUE_SEGMENT = [
  { month: 'Jul', Enterprise: 3200, 'Mid-market': 2100, SMB: 1800, Total: 7100 },
  { month: 'Aug', Enterprise: 3400, 'Mid-market': 2200, SMB: 1900, Total: 7500 },
  { month: 'Sep', Enterprise: 3500, 'Mid-market': 2300, SMB: 1850, Total: 7650 },
  { month: 'Oct', Enterprise: 3600, 'Mid-market': 2400, SMB: 1900, Total: 7900 },
  { month: 'Nov', Enterprise: 3700, 'Mid-market': 2500, SMB: 1950, Total: 8150 },
  { month: 'Dec', Enterprise: 3900, 'Mid-market': 2600, SMB: 2000, Total: 8500 },
  { month: 'Jan', Enterprise: 4000, 'Mid-market': 2650, SMB: 2050, Total: 8700 },
  { month: 'Feb', Enterprise: 4200, 'Mid-market': 2800, SMB: 2100, Total: 9100 },
];

// Revenue waterfall
const REVENUE_WATERFALL = [
  { name: 'Prior Month', value: 8940, fill: 'hsl(var(--muted-foreground))' },
  { name: 'New Logo', value: 320, fill: 'hsl(var(--chart-2))' },
  { name: 'Expansion', value: 280, fill: 'hsl(var(--chart-2))' },
  { name: 'Churn', value: -180, fill: 'hsl(var(--destructive))' },
  { name: 'Contraction', value: -60, fill: 'hsl(var(--chart-5))' },
  { name: 'FX Impact', value: 20, fill: 'hsl(var(--chart-4))' },
  { name: 'Other', value: 180, fill: 'hsl(var(--chart-3))' },
  { name: 'Current Month', value: 9500, fill: 'hsl(var(--primary))' },
];

// OPEX by department
const OPEX_COMPARISON = [
  { dept: 'S&M', actuals: 2100, budget: 2000 },
  { dept: 'R&D', actuals: 1800, budget: 1750 },
  { dept: 'G&A', actuals: 1550, budget: 1450 },
];

// Margin trends
const MARGIN_TRENDS = [
  { month: 'Jul', 'Gross Margin': 63.2, 'EBITDA Margin': 9.2, 'Net Margin': 7.1 },
  { month: 'Aug', 'Gross Margin': 64.0, 'EBITDA Margin': 10.1, 'Net Margin': 7.8 },
  { month: 'Sep', 'Gross Margin': 64.5, 'EBITDA Margin': 10.5, 'Net Margin': 8.2 },
  { month: 'Oct', 'Gross Margin': 65.0, 'EBITDA Margin': 11.0, 'Net Margin': 8.5 },
  { month: 'Nov', 'Gross Margin': 64.7, 'EBITDA Margin': 10.8, 'Net Margin': 8.3 },
  { month: 'Dec', 'Gross Margin': 66.2, 'EBITDA Margin': 11.5, 'Net Margin': 9.0 },
  { month: 'Jan', 'Gross Margin': 67.5, 'EBITDA Margin': 12.0, 'Net Margin': 9.5 },
  { month: 'Feb', 'Gross Margin': 70.0, 'EBITDA Margin': 12.6, 'Net Margin': 10.2 },
];

// Top vendors
const TOP_VENDORS = [
  { dept: 'Engineering', vendor: 'AWS', spend: '$50K', mom: '+4.2%', isUp: true },
  { dept: 'Marketing', vendor: 'Google Ads', spend: '$43K', mom: '+4.9%', isUp: true },
  { dept: 'G&A', vendor: 'WeWork', spend: '$25K', mom: '0%', isUp: false },
  { dept: 'Sales', vendor: 'Salesforce', spend: '$18K', mom: '0%', isUp: false },
  { dept: 'Engineering', vendor: 'GitHub Enterprise', spend: '$9K', mom: '+5.9%', isUp: true },
  { dept: 'HR', vendor: 'Gusto', spend: '$8K', mom: '0%', isUp: false },
];

const tooltipStyle = { fontSize: 11, background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 6 };

export interface ChartVisibilityConfig {
  revenueChart: boolean;
  marginTrends: boolean;
  opexComparison: boolean;
  topVendors: boolean;
  waterfallBridge: boolean;
}

interface RevenueOPEXChartsProps {
  onDrillDown?: (metric: string, segment: string) => void;
  chartConfig?: ChartConfig;
  visibilityConfig?: ChartVisibilityConfig;
}

function getColors(config?: ChartConfig): string[] {
  if (!config) return DEFAULT_COLORS;
  const theme = COLOR_THEMES.find(t => t.id === config.colorTheme);
  return theme?.colors || DEFAULT_COLORS;
}

function renderRevenueChart(chartType: ChartType, colors: string[], config: ChartConfig) {
  const gridProps = config.showGridLines
    ? { strokeDasharray: "3 3", stroke: "hsl(var(--border))" }
    : { stroke: "transparent" };

  const segments = ['Enterprise', 'Mid-market', 'SMB'];

  if (chartType === 'bar') {
    return (
      <BarChart data={REVENUE_SEGMENT}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
        <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `$${(v/1000).toFixed(0)}M`} />
        <RechartsTooltip contentStyle={tooltipStyle} formatter={(v: number) => [`$${v}K`, undefined]} />
        {segments.map((seg, i) => (
          <Bar key={seg} dataKey={seg} stackId="1" fill={colors[i]} radius={i === segments.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]} isAnimationActive={config.animationEnabled} />
        ))}
        {config.showLegend && <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />}
      </BarChart>
    );
  }

  if (chartType === 'line') {
    return (
      <LineChart data={REVENUE_SEGMENT}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
        <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `$${(v/1000).toFixed(0)}M`} />
        <RechartsTooltip contentStyle={tooltipStyle} formatter={(v: number) => [`$${v}K`, undefined]} />
        {segments.map((seg, i) => (
          <Line key={seg} type={config.curveType} dataKey={seg} stroke={colors[i]} strokeWidth={1} dot={{ r: 2 }} isAnimationActive={config.animationEnabled} />
        ))}
        {config.showLegend && <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />}
      </LineChart>
    );
  }

  if (chartType === 'composed') {
    return (
      <ComposedChart data={REVENUE_SEGMENT}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
        <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `$${(v/1000).toFixed(0)}M`} />
        <RechartsTooltip contentStyle={tooltipStyle} formatter={(v: number) => [`$${v}K`, undefined]} />
        <Bar dataKey="Enterprise" fill={colors[0]} barSize={20} isAnimationActive={config.animationEnabled} />
        <Line type={config.curveType} dataKey="Mid-market" stroke={colors[1]} strokeWidth={1} isAnimationActive={config.animationEnabled} />
        <Area type={config.curveType} dataKey="SMB" fill={colors[2]} fillOpacity={0.3} stroke={colors[2]} isAnimationActive={config.animationEnabled} />
        {config.showLegend && <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />}
      </ComposedChart>
    );
  }

  // Default: area
  return (
    <AreaChart data={REVENUE_SEGMENT}>
      <CartesianGrid {...gridProps} />
      <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
      <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `$${(v/1000).toFixed(0)}M`} />
      <RechartsTooltip contentStyle={tooltipStyle} formatter={(v: number) => [`$${v}K`, undefined]} />
      {segments.map((seg, i) => (
        <Area key={seg} type={config.curveType} dataKey={seg} stackId="1" stroke={colors[i]} fill={colors[i]} fillOpacity={0.6} isAnimationActive={config.animationEnabled} />
      ))}
      {config.showLegend && <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />}
    </AreaChart>
  );
}

function renderMarginChart(chartType: ChartType, colors: string[], config: ChartConfig) {
  const gridProps = config.showGridLines
    ? { strokeDasharray: "3 3", stroke: "hsl(var(--border))" }
    : { stroke: "transparent" };

  const metrics = ['Gross Margin', 'EBITDA Margin', 'Net Margin'];

  if (chartType === 'bar') {
    return (
      <BarChart data={MARGIN_TRENDS}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
        <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `${v}%`} />
        <RechartsTooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v}%`, undefined]} />
        {metrics.map((m, i) => (
          <Bar key={m} dataKey={m} fill={colors[i]} barSize={10} isAnimationActive={config.animationEnabled} />
        ))}
        {config.showLegend && <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />}
      </BarChart>
    );
  }

  if (chartType === 'area') {
    return (
      <AreaChart data={MARGIN_TRENDS}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
        <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `${v}%`} />
        <RechartsTooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v}%`, undefined]} />
        {metrics.map((m, i) => (
          <Area key={m} type={config.curveType} dataKey={m} stroke={colors[i]} fill={colors[i]} fillOpacity={0.15} strokeWidth={1} isAnimationActive={config.animationEnabled} />
        ))}
        {config.showLegend && <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />}
      </AreaChart>
    );
  }

  // Default: line
  return (
    <LineChart data={MARGIN_TRENDS}>
      <CartesianGrid {...gridProps} />
      <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
      <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `${v}%`} />
      <RechartsTooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v}%`, undefined]} />
      {metrics.map((m, i) => (
        <Line key={m} type={config.curveType} dataKey={m} stroke={colors[i]} strokeWidth={1} dot={{ r: 2 }} isAnimationActive={config.animationEnabled} />
      ))}
      {config.showLegend && <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />}
    </LineChart>
  );
}

function renderOpexChart(chartType: ChartType, colors: string[], config: ChartConfig) {
  const gridProps = config.showGridLines
    ? { strokeDasharray: "3 3", stroke: "hsl(var(--border))" }
    : { stroke: "transparent" };

  if (chartType === 'line' || chartType === 'area') {
    return (
      <BarChart data={OPEX_COMPARISON} layout="vertical">
        <CartesianGrid {...gridProps} />
        <XAxis type="number" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `$${v}K`} />
        <YAxis type="category" dataKey="dept" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" width={40} />
        <RechartsTooltip contentStyle={tooltipStyle} formatter={(v: number) => [`$${v}K`, undefined]} />
        <Bar dataKey="budget" fill="hsl(var(--muted-foreground))" opacity={0.3} barSize={16} radius={[0, 3, 3, 0]} name="Budget" isAnimationActive={config.animationEnabled} />
        <Bar dataKey="actuals" fill={colors[0]} barSize={16} radius={[0, 3, 3, 0]} name="Actuals" isAnimationActive={config.animationEnabled} />
        {config.showLegend && <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />}
      </BarChart>
    );
  }

  // Default: bar (horizontal)
  return (
    <BarChart data={OPEX_COMPARISON} layout="vertical">
      <CartesianGrid {...gridProps} />
      <XAxis type="number" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `$${v}K`} />
      <YAxis type="category" dataKey="dept" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" width={40} />
      <RechartsTooltip contentStyle={tooltipStyle} formatter={(v: number) => [`$${v}K`, undefined]} />
      <Bar dataKey="budget" fill="hsl(var(--muted-foreground))" opacity={0.3} barSize={16} radius={[0, 3, 3, 0]} name="Budget" isAnimationActive={config.animationEnabled} />
      <Bar dataKey="actuals" fill={colors[0]} barSize={16} radius={[0, 3, 3, 0]} name="Actuals" isAnimationActive={config.animationEnabled} />
      {config.showLegend && <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />}
    </BarChart>
  );
}

export function RevenueOPEXCharts({ onDrillDown, chartConfig, visibilityConfig }: RevenueOPEXChartsProps) {
  const [revenueView, setRevenueView] = useState<'trend' | 'waterfall'>('trend');
  const [expandedChart, setExpandedChart] = useState<string | null>(null);
  const cfg = chartConfig || DEFAULT_CHART_CONFIG;
  const colors = getColors(cfg);
  const vis = visibilityConfig || { revenueChart: true, marginTrends: true, opexComparison: true, topVendors: true, waterfallBridge: true };

  const renderExpandedContent = () => {
    if (!expandedChart) return null;
    const height = 450;
    switch (expandedChart) {
      case 'revenue':
        return revenueView === 'trend' || !vis.waterfallBridge ? (
          <ResponsiveContainer width="100%" height={height}>
            {renderRevenueChart(cfg.revenueChartType, colors, cfg)}
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height={height}>
            <BarChart data={REVENUE_WATERFALL}>
              <CartesianGrid strokeDasharray="3 3" stroke={cfg.showGridLines ? "hsl(var(--border))" : "transparent"} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `$${(v/1000).toFixed(1)}M`} domain={[0, 10000]} />
              <RechartsTooltip contentStyle={tooltipStyle} formatter={(v: number) => [`$${v}K`, undefined]} />
              <Bar dataKey="value" radius={[3, 3, 0, 0]} isAnimationActive={cfg.animationEnabled}>
                {REVENUE_WATERFALL.map((entry, index) => (
                  <Cell key={index} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        );
      case 'margins':
        return (
          <ResponsiveContainer width="100%" height={height}>
            {renderMarginChart(cfg.marginChartType, colors, cfg)}
          </ResponsiveContainer>
        );
      case 'opex':
        return (
          <ResponsiveContainer width="100%" height={height}>
            {renderOpexChart(cfg.opexChartType, colors, cfg)}
          </ResponsiveContainer>
        );
      default:
        return null;
    }
  };

  const chartTitles: Record<string, string> = {
    revenue: 'Revenue',
    margins: 'Margin Trends',
    opex: 'OPEX — Actuals vs Budget',
  };

  return (
    <div className="space-y-4" role="region" aria-label="Financial Charts">
      {/* Expanded Chart Dialog */}
      <Dialog open={!!expandedChart} onOpenChange={(open) => { if (!open) setExpandedChart(null); }}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center justify-between">
              {expandedChart ? chartTitles[expandedChart] || 'Chart' : 'Chart'}
            </DialogTitle>
          </DialogHeader>
          <div className="pt-2">
            {renderExpandedContent()}
          </div>
        </DialogContent>
      </Dialog>
      {/* Row 1: Revenue + Margins */}
      {(vis.revenueChart || vis.marginTrends) && (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Revenue Chart */}
        {vis.revenueChart && (
        <Card className={vis.marginTrends ? "lg:col-span-2" : "lg:col-span-3"} role="figure" aria-label="Revenue chart showing monthly revenue by segment">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm">Revenue</CardTitle>
                {vis.waterfallBridge && (
                <div className="flex gap-1">
                  <Button
                    variant={revenueView === 'trend' ? 'default' : 'ghost'}
                    size="sm" className="h-5 text-[9px] px-2"
                    onClick={() => setRevenueView('trend')}
                  >Trend</Button>
                  <Button
                    variant={revenueView === 'waterfall' ? 'default' : 'ghost'}
                    size="sm" className="h-5 text-[9px] px-2"
                    onClick={() => setRevenueView('waterfall')}
                  >Bridge</Button>
                </div>
                )}
              </div>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setExpandedChart('revenue')} aria-label="Expand revenue chart">
                <Maximize2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {revenueView === 'trend' || !vis.waterfallBridge ? (
              <ResponsiveContainer width="100%" height={240}>
                {renderRevenueChart(cfg.revenueChartType, colors, cfg)}
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={REVENUE_WATERFALL}>
                  <CartesianGrid strokeDasharray="3 3" stroke={cfg.showGridLines ? "hsl(var(--border))" : "transparent"} />
                  <XAxis dataKey="name" tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" angle={-20} textAnchor="end" height={50} />
                  <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `$${(v/1000).toFixed(1)}M`} domain={[0, 10000]} />
                  <RechartsTooltip contentStyle={tooltipStyle} formatter={(v: number) => [`$${v}K`, undefined]} />
                  <Bar dataKey="value" radius={[3, 3, 0, 0]} isAnimationActive={cfg.animationEnabled}>
                    {REVENUE_WATERFALL.map((entry, index) => (
                      <Cell key={index} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        )}

        {/* Margin Trends */}
        {vis.marginTrends && (
        <Card className={vis.revenueChart ? undefined : "lg:col-span-3"} role="figure" aria-label="Margin trends showing Gross Margin, EBITDA Margin, and Net Margin over time">
           <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Margin Trends</CardTitle>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setExpandedChart('margins')} aria-label="Expand margin trends chart">
                <Maximize2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <ResponsiveContainer width="100%" height={240}>
              {renderMarginChart(cfg.marginChartType, colors, cfg)}
            </ResponsiveContainer>
          </CardContent>
        </Card>
        )}
      </div>
      )}

      {/* Row 2: OPEX Comparison + Top Vendors */}
      {(vis.opexComparison || vis.topVendors) && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {vis.opexComparison && (
        <Card role="figure" aria-label="Operating expenses comparison showing actuals versus budget by department">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">OPEX — Actuals vs Budget ($K)</CardTitle>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setExpandedChart('opex')} aria-label="Expand OPEX chart">
                <Maximize2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <ResponsiveContainer width="100%" height={200}>
              {renderOpexChart(cfg.opexChartType, colors, cfg)}
            </ResponsiveContainer>
            <div className="flex items-center gap-4 mt-2 text-[10px] text-muted-foreground">
              {OPEX_COMPARISON.map(d => {
                const over = d.actuals - d.budget;
                return (
                  <span key={d.dept}>
                    {d.dept}: <span className={cn("font-mono", over > 0 ? "text-destructive" : "text-emerald-600")}>
                      {over > 0 ? '+' : ''}{over}K ({((over / d.budget) * 100).toFixed(1)}%)
                    </span>
                  </span>
                );
              })}
            </div>
          </CardContent>
        </Card>
        )}

        {/* Top Vendors */}
        {vis.topVendors && (
        <Card role="figure" aria-label="Top vendors by spend for current period">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Top Vendors by Spend</CardTitle>
              <Badge variant="outline" className="text-[9px]">Feb 2026</Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px]">Dept</TableHead>
                  <TableHead className="text-[10px]">Vendor</TableHead>
                  <TableHead className="text-[10px] text-right">Spend</TableHead>
                  <TableHead className="text-[10px] text-right">MoM</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {TOP_VENDORS.map((v, i) => (
                  <TableRow key={i} className="cursor-pointer hover:bg-muted/50">
                    <TableCell className="text-[10px] text-muted-foreground py-1.5">{v.dept}</TableCell>
                    <TableCell className="text-xs font-medium py-1.5">{v.vendor}</TableCell>
                    <TableCell className="text-xs text-right font-mono py-1.5">{v.spend}</TableCell>
                    <TableCell className={cn("text-[10px] text-right font-mono py-1.5", v.isUp ? "text-amber-600" : "text-muted-foreground")}>
                      {v.mom}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        )}
      </div>
      )}
    </div>
  );
}
