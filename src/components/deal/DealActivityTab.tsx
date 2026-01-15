import { Eye, FileText, Mail, Users, TrendingUp, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, BarChart, Bar } from 'recharts';
import { useDealActivityStats, useDealActivityChart } from '@/hooks/useDealActivityStats';
import { Skeleton } from '@/components/ui/skeleton';

interface DealActivityTabProps {
  dealId: string;
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  isLoading?: boolean;
}

const StatCard = ({ icon, label, value, isLoading }: StatCardProps) => (
  <div className="flex flex-col items-center justify-center p-4 border rounded-lg bg-card">
    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
      {icon}
      <span>{label}</span>
    </div>
    {isLoading ? (
      <Skeleton className="h-8 w-12" />
    ) : (
      <span className="text-3xl font-semibold">{value}</span>
    )}
  </div>
);

export function DealActivityTab({ dealId }: DealActivityTabProps) {
  const { data: stats, isLoading: isLoadingStats } = useDealActivityStats(dealId);
  const { data: chartData, isLoading: isLoadingChart } = useDealActivityChart(dealId, 14);

  const hasActivity = chartData && chartData.some(d => d.views > 0);

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={<Eye className="h-4 w-4" />}
          label="Activity"
          value={stats?.views ?? 0}
          isLoading={isLoadingStats}
        />
        <StatCard
          icon={<FileText className="h-4 w-4" />}
          label="Data Room"
          value={stats?.dataRoomAccess ?? 0}
          isLoading={isLoadingStats}
        />
        <StatCard
          icon={<Mail className="h-4 w-4" />}
          label="Info Requests"
          value={stats?.infoRequests ?? 0}
          isLoading={isLoadingStats}
        />
        <StatCard
          icon={<Users className="h-4 w-4" />}
          label="Unique Users"
          value={stats?.uniqueUsers ?? 0}
          isLoading={isLoadingStats}
        />
      </div>

      {/* Activity Trend Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Activity Trend (Last 14 Days)</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingChart ? (
            <div className="h-[250px] flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !hasActivity ? (
            <div className="h-[250px] flex flex-col items-center justify-center">
              <TrendingUp className="h-8 w-8 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground text-center">
                No activity recorded in the last 14 days.
              </p>
              <p className="text-xs text-muted-foreground text-center mt-1">
                Activity will appear here as users interact with this deal.
              </p>
            </div>
          ) : (
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    className="text-muted-foreground"
                  />
                  <YAxis 
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    className="text-muted-foreground"
                    allowDecimals={false}
                  />
                  <Tooltip 
                    contentStyle={{
                      backgroundColor: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                    labelStyle={{ fontWeight: 600, marginBottom: 4 }}
                  />
                  <Legend 
                    wrapperStyle={{ paddingTop: '10px' }}
                    iconType="circle"
                  />
                  <Bar 
                    dataKey="views" 
                    name="Total Activity"
                    fill="hsl(var(--primary))" 
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Activity Breakdown */}
      {hasActivity && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">Activity Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    className="text-muted-foreground"
                  />
                  <YAxis 
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    className="text-muted-foreground"
                    allowDecimals={false}
                  />
                  <Tooltip 
                    contentStyle={{
                      backgroundColor: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Legend 
                    wrapperStyle={{ paddingTop: '10px' }}
                    iconType="circle"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="updates" 
                    name="Deal Updates"
                    stroke="hsl(var(--primary))" 
                    strokeWidth={2}
                    dot={{ fill: 'hsl(var(--primary))', strokeWidth: 0, r: 3 }}
                    activeDot={{ r: 5, strokeWidth: 0 }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="lenderActions" 
                    name="Lender Actions"
                    stroke="hsl(var(--chart-2))" 
                    strokeWidth={2}
                    dot={{ fill: 'hsl(var(--chart-2))', strokeWidth: 0, r: 3 }}
                    activeDot={{ r: 5, strokeWidth: 0 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
