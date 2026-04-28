import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, LineChart, Line } from 'recharts';
import { useFlexEngagementTrends } from '@/hooks/useFlexEngagementTrends';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, BarChart3, Activity, Eye, Download, HelpCircle, FileText, FileSignature } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';

interface FlexEngagementTrendsChartProps {
  dealId: string;
}

type MetricKey = 'all' | 'views' | 'downloads' | 'infoRequests' | 'ndaRequests' | 'termSheetRequests';

const CHART_COLORS = {
  views: 'hsl(var(--chart-1))',
  downloads: 'hsl(var(--chart-2))',
  infoRequests: 'hsl(var(--chart-3))',
  ndaRequests: 'hsl(var(--chart-4))',
  termSheetRequests: 'hsl(var(--chart-5))',
  engagementScore: 'hsl(var(--primary))',
};

const METRIC_TABS: { key: MetricKey; label: string; icon: typeof Eye }[] = [
  { key: 'all', label: 'All', icon: Activity },
  { key: 'views', label: 'Views', icon: Eye },
  { key: 'downloads', label: 'Downloads', icon: Download },
  { key: 'infoRequests', label: 'Info Requests', icon: HelpCircle },
  { key: 'ndaRequests', label: 'NDA', icon: FileText },
  { key: 'termSheetRequests', label: 'Term Sheets', icon: FileSignature },
];

export function FlexEngagementTrendsChart({ dealId }: FlexEngagementTrendsChartProps) {
  const [days, setDays] = useState<number>(30);
  const [chartType, setChartType] = useState<'area' | 'bar' | 'line'>('area');
  const [activeMetric, setActiveMetric] = useState<MetricKey>('all');
  const { data: trendData, isLoading } = useFlexEngagementTrends(dealId, days);

  const hasActivity = trendData && trendData.some(d => 
    d.views > 0 || d.downloads > 0 || d.infoRequests > 0 || 
    d.ndaRequests > 0 || d.termSheetRequests > 0
  );

  const visibleMetrics = useMemo(() => {
    if (activeMetric === 'all') return ['views', 'downloads', 'infoRequests', 'ndaRequests', 'termSheetRequests'] as const;
    return [activeMetric] as const;
  }, [activeMetric]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-popover border border-border rounded-lg p-3 shadow-lg">
        <p className="font-semibold mb-2">{label}</p>
        <div className="space-y-1 text-sm">
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
              <span className="text-muted-foreground">{entry.name}:</span>
              <span className="font-medium">{entry.value}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const METRIC_NAMES: Record<string, string> = {
    views: 'Views',
    downloads: 'Downloads',
    infoRequests: 'Info Requests',
    ndaRequests: 'NDA Requests',
    termSheetRequests: 'Term Sheets',
  };

  const commonAxisProps = {
    xAxis: {
      dataKey: "date",
      tick: { fontSize: 11 },
      tickLine: false,
      axisLine: false,
      interval: days > 14 ? Math.floor(days / 7) : 0,
    },
    yAxis: {
      tick: { fontSize: 11 },
      tickLine: false,
      axisLine: false,
      allowDecimals: false,
    },
  };

  const renderChart = () => {
    if (chartType === 'bar') {
      return (
        <BarChart data={trendData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis {...commonAxisProps.xAxis} />
          <YAxis {...commonAxisProps.yAxis} />
          <Tooltip content={<CustomTooltip />} />
          {visibleMetrics.map(m => (
            <Bar key={m} dataKey={m} name={METRIC_NAMES[m]} fill={CHART_COLORS[m as keyof typeof CHART_COLORS]} stackId={activeMetric === 'all' ? 'a' : undefined} radius={[4, 4, 0, 0]} />
          ))}
        </BarChart>
      );
    }

    if (chartType === 'line') {
      return (
        <LineChart data={trendData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis {...commonAxisProps.xAxis} />
          <YAxis {...commonAxisProps.yAxis} />
          <Tooltip content={<CustomTooltip />} />
          {visibleMetrics.map(m => (
            <Line key={m} type="monotone" dataKey={m} name={METRIC_NAMES[m]} stroke={CHART_COLORS[m as keyof typeof CHART_COLORS]} strokeWidth={1} dot={false} />
          ))}
        </LineChart>
      );
    }

    return (
      <AreaChart data={trendData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <defs>
          {visibleMetrics.map(m => (
            <linearGradient key={m} id={`color-${m}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={CHART_COLORS[m as keyof typeof CHART_COLORS]} stopOpacity={0.3}/>
              <stop offset="95%" stopColor={CHART_COLORS[m as keyof typeof CHART_COLORS]} stopOpacity={0}/>
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis {...commonAxisProps.xAxis} />
        <YAxis {...commonAxisProps.yAxis} />
        <Tooltip content={<CustomTooltip />} />
        {visibleMetrics.map(m => (
          <Area key={m} type="monotone" dataKey={m} name={METRIC_NAMES[m]} stroke={CHART_COLORS[m as keyof typeof CHART_COLORS]} fillOpacity={1} fill={`url(#color-${m})`} strokeWidth={1} />
        ))}
      </AreaChart>
    );
  };

  return (
    <Card className="h-full flex flex-col">
      {/* ── Header ── fixed 44px, matches Deal Activity */}
      <CardHeader className="flex flex-row items-center justify-between min-h-[44px] h-[44px] py-0 px-4 space-y-0 shrink-0">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
          Engagement Trends
        </CardTitle>
        <div className="flex items-center gap-1.5">
          <div className="flex h-7 rounded-md border border-border bg-muted/50 p-0.5">
            {(['area', 'bar', 'line'] as const).map(type => {
              const Icon = type === 'area' ? Activity : type === 'bar' ? BarChart3 : TrendingUp;
              return (
                <button
                  key={type}
                  onClick={() => setChartType(type)}
                  className={cn(
                    "flex items-center justify-center h-6 w-6 rounded-sm transition-colors",
                    chartType === type ? "bg-background shadow-sm" : "hover:bg-background/50"
                  )}
                >
                  <Icon className="h-3 w-3" />
                </button>
              );
            })}
          </div>
          <Select value={days.toString()} onValueChange={(v) => setDays(parseInt(v))}>
            <SelectTrigger className="w-[80px] h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 days</SelectItem>
              <SelectItem value="14">14 days</SelectItem>
              <SelectItem value="30">30 days</SelectItem>
              <SelectItem value="60">60 days</SelectItem>
              <SelectItem value="90">90 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      {/* ── Metric filter tabs ── fixed-height row so both chart cards stay aligned */}
      <div className="min-h-[28px] px-4 flex items-center">
        <div className="flex flex-wrap gap-1">
          {METRIC_TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveMetric(key)}
              className={cn(
                "flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors border",
                activeMetric === key
                  ? "bg-primary/10 text-primary border-primary/30"
                  : "bg-muted/50 text-muted-foreground border-transparent hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="h-2.5 w-2.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Body ── chart area with fixed height matching Deal Activity */}
      <CardContent className="flex-1 px-4 pb-4 pt-0">
        {isLoading ? (
          <div style={{ height: 200 }} className="flex items-center justify-center">
            <Skeleton className="h-full w-full" />
          </div>
        ) : !hasActivity ? (
          <div style={{ height: 200 }} className="flex flex-col items-center justify-center">
            <TrendingUp className="h-6 w-6 text-muted-foreground/40 mb-2" />
            <p className="text-xs text-muted-foreground">No engagement in the last {days} days</p>
          </div>
        ) : (
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              {renderChart()}
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
