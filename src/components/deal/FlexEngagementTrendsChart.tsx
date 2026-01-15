import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, BarChart, Bar, LineChart, Line } from 'recharts';
import { useFlexEngagementTrends } from '@/hooks/useFlexEngagementTrends';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, BarChart3, Activity } from 'lucide-react';

interface FlexEngagementTrendsChartProps {
  dealId: string;
}

const CHART_COLORS = {
  views: 'hsl(var(--chart-1))',
  downloads: 'hsl(var(--chart-2))',
  infoRequests: 'hsl(var(--chart-3))',
  ndaRequests: 'hsl(var(--chart-4))',
  termSheetRequests: 'hsl(var(--chart-5))',
  engagementScore: 'hsl(var(--primary))',
};

export function FlexEngagementTrendsChart({ dealId }: FlexEngagementTrendsChartProps) {
  const [days, setDays] = useState<number>(30);
  const [chartType, setChartType] = useState<'area' | 'bar' | 'line'>('area');
  const { data: trendData, isLoading } = useFlexEngagementTrends(dealId, days);

  const hasActivity = trendData && trendData.some(d => 
    d.views > 0 || d.downloads > 0 || d.infoRequests > 0 || 
    d.ndaRequests > 0 || d.termSheetRequests > 0
  );

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    
    return (
      <div className="bg-popover border border-border rounded-lg p-3 shadow-lg">
        <p className="font-semibold mb-2">{label}</p>
        <div className="space-y-1 text-sm">
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center gap-2">
              <div 
                className="w-3 h-3 rounded-full" 
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-muted-foreground">{entry.name}:</span>
              <span className="font-medium">{entry.value}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderChart = () => {
    if (chartType === 'bar') {
      return (
        <BarChart data={trendData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis 
            dataKey="date" 
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            interval={days > 14 ? Math.floor(days / 7) : 0}
          />
          <YAxis 
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ paddingTop: '10px' }} iconType="circle" />
          <Bar dataKey="views" name="Views" fill={CHART_COLORS.views} stackId="a" />
          <Bar dataKey="downloads" name="Downloads" fill={CHART_COLORS.downloads} stackId="a" />
          <Bar dataKey="infoRequests" name="Info Requests" fill={CHART_COLORS.infoRequests} stackId="a" />
          <Bar dataKey="ndaRequests" name="NDA Requests" fill={CHART_COLORS.ndaRequests} stackId="a" />
          <Bar dataKey="termSheetRequests" name="Term Sheets" fill={CHART_COLORS.termSheetRequests} stackId="a" />
        </BarChart>
      );
    }

    if (chartType === 'line') {
      return (
        <LineChart data={trendData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis 
            dataKey="date" 
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            interval={days > 14 ? Math.floor(days / 7) : 0}
          />
          <YAxis 
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ paddingTop: '10px' }} iconType="circle" />
          <Line type="monotone" dataKey="engagementScore" name="Engagement Score" stroke={CHART_COLORS.engagementScore} strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="uniqueLenders" name="Unique Lenders" stroke={CHART_COLORS.views} strokeWidth={2} dot={false} />
        </LineChart>
      );
    }

    // Default: Area chart
    return (
      <AreaChart data={trendData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <defs>
          <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={CHART_COLORS.views} stopOpacity={0.3}/>
            <stop offset="95%" stopColor={CHART_COLORS.views} stopOpacity={0}/>
          </linearGradient>
          <linearGradient id="colorDownloads" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={CHART_COLORS.downloads} stopOpacity={0.3}/>
            <stop offset="95%" stopColor={CHART_COLORS.downloads} stopOpacity={0}/>
          </linearGradient>
          <linearGradient id="colorInfo" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={CHART_COLORS.infoRequests} stopOpacity={0.3}/>
            <stop offset="95%" stopColor={CHART_COLORS.infoRequests} stopOpacity={0}/>
          </linearGradient>
          <linearGradient id="colorNda" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={CHART_COLORS.ndaRequests} stopOpacity={0.3}/>
            <stop offset="95%" stopColor={CHART_COLORS.ndaRequests} stopOpacity={0}/>
          </linearGradient>
          <linearGradient id="colorTermSheet" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={CHART_COLORS.termSheetRequests} stopOpacity={0.3}/>
            <stop offset="95%" stopColor={CHART_COLORS.termSheetRequests} stopOpacity={0}/>
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis 
          dataKey="date" 
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          interval={days > 14 ? Math.floor(days / 7) : 0}
        />
        <YAxis 
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend wrapperStyle={{ paddingTop: '10px' }} iconType="circle" />
        <Area 
          type="monotone" 
          dataKey="views" 
          name="Views" 
          stroke={CHART_COLORS.views} 
          fillOpacity={1}
          fill="url(#colorViews)" 
          strokeWidth={2}
        />
        <Area 
          type="monotone" 
          dataKey="downloads" 
          name="Downloads" 
          stroke={CHART_COLORS.downloads} 
          fillOpacity={1}
          fill="url(#colorDownloads)" 
          strokeWidth={2}
        />
        <Area 
          type="monotone" 
          dataKey="infoRequests" 
          name="Info Requests" 
          stroke={CHART_COLORS.infoRequests} 
          fillOpacity={1}
          fill="url(#colorInfo)" 
          strokeWidth={2}
        />
        <Area 
          type="monotone" 
          dataKey="ndaRequests" 
          name="NDA Requests" 
          stroke={CHART_COLORS.ndaRequests} 
          fillOpacity={1}
          fill="url(#colorNda)" 
          strokeWidth={2}
        />
        <Area 
          type="monotone" 
          dataKey="termSheetRequests" 
          name="Term Sheets" 
          stroke={CHART_COLORS.termSheetRequests} 
          fillOpacity={1}
          fill="url(#colorTermSheet)" 
          strokeWidth={2}
        />
      </AreaChart>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            FLEx Engagement Trends
          </CardTitle>
          <div className="flex items-center gap-2">
            <Tabs value={chartType} onValueChange={(v) => setChartType(v as 'area' | 'bar' | 'line')} className="h-8">
              <TabsList className="h-8">
                <TabsTrigger value="area" className="h-7 px-2">
                  <Activity className="h-3.5 w-3.5" />
                </TabsTrigger>
                <TabsTrigger value="bar" className="h-7 px-2">
                  <BarChart3 className="h-3.5 w-3.5" />
                </TabsTrigger>
                <TabsTrigger value="line" className="h-7 px-2">
                  <TrendingUp className="h-3.5 w-3.5" />
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Select value={days.toString()} onValueChange={(v) => setDays(parseInt(v))}>
              <SelectTrigger className="w-[100px] h-8">
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
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-[280px] flex items-center justify-center">
            <Skeleton className="h-full w-full" />
          </div>
        ) : !hasActivity ? (
          <div className="h-[280px] flex flex-col items-center justify-center">
            <TrendingUp className="h-8 w-8 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground text-center">
              No FLEx engagement recorded in the last {days} days.
            </p>
            <p className="text-xs text-muted-foreground text-center mt-1">
              Engagement will appear here as lenders interact with this deal on FLEx.
            </p>
          </div>
        ) : (
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              {renderChart()}
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
