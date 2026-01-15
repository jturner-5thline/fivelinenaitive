import { Eye, FileText, Mail, Users, TrendingUp, Loader2, ExternalLink, Download, FileSignature, HelpCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, BarChart, Bar } from 'recharts';
import { useDealActivityStats, useDealActivityChart } from '@/hooks/useDealActivityStats';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { FlexLenderInterestPanel } from './FlexLenderInterestPanel';
import { FlexEngagementTrendsChart } from './FlexEngagementTrendsChart';
import { InfoRequestsPanel } from './InfoRequestsPanel';
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

interface FlexStatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  highlight?: boolean;
  isLoading?: boolean;
  onClick?: () => void;
}

const FlexStatCard = ({ icon, label, value, highlight, isLoading, onClick }: FlexStatCardProps) => (
  <div 
    className={`flex items-center gap-3 p-3 border rounded-lg ${highlight && value > 0 ? 'border-green-500/30 bg-green-500/5' : 'bg-card'} ${onClick ? 'cursor-pointer hover:bg-muted/50 transition-colors' : ''}`}
    onClick={onClick}
    role={onClick ? 'button' : undefined}
    tabIndex={onClick ? 0 : undefined}
    onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); } : undefined}
  >
    <div className={`flex items-center justify-center h-10 w-10 rounded-lg ${highlight && value > 0 ? 'bg-green-500/10 text-green-600' : 'bg-muted text-muted-foreground'}`}>
      {icon}
    </div>
    <div>
      {isLoading ? (
        <Skeleton className="h-6 w-8 mb-1" />
      ) : (
        <span className={`text-xl font-semibold ${highlight && value > 0 ? 'text-green-600' : ''}`}>{value}</span>
      )}
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  </div>
);

export function DealActivityTab({ dealId }: DealActivityTabProps) {
  const { data: stats, isLoading: isLoadingStats } = useDealActivityStats(dealId);
  const { data: chartData, isLoading: isLoadingChart } = useDealActivityChart(dealId, 14);

  const hasActivity = chartData && chartData.some(d => d.views > 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Main activity section */}
      <div className="lg:col-span-2 space-y-6">
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

      {/* FLEx Engagement Stats */}
      <Card id="flex-engagement-section">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <ExternalLink className="h-4 w-4" />
              FLEx Engagement
            </CardTitle>
            <Badge variant="outline" className="text-xs">
              {stats?.flexUniqueLenders ?? 0} lender{(stats?.flexUniqueLenders ?? 0) !== 1 ? 's' : ''} engaged
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <FlexStatCard
              icon={<Eye className="h-4 w-4" />}
              label="Views"
              value={stats?.flexViews ?? 0}
              isLoading={isLoadingStats}
            />
            <FlexStatCard
              icon={<Download className="h-4 w-4" />}
              label="Downloads"
              value={stats?.flexDownloads ?? 0}
              isLoading={isLoadingStats}
            />
            <FlexStatCard
              icon={<HelpCircle className="h-4 w-4" />}
              label="Info Requests"
              value={stats?.flexInfoRequests ?? 0}
              highlight
              isLoading={isLoadingStats}
              onClick={() => {
                document.getElementById('info-requests-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            />
            <FlexStatCard
              icon={<FileText className="h-4 w-4" />}
              label="NDA Requests"
              value={stats?.flexNdaRequests ?? 0}
              highlight
              isLoading={isLoadingStats}
            />
            <FlexStatCard
              icon={<FileSignature className="h-4 w-4" />}
              label="Term Sheets"
              value={stats?.flexTermSheetRequests ?? 0}
              highlight
              isLoading={isLoadingStats}
            />
          </div>
        </CardContent>
      </Card>

      {/* FLEx Engagement Trends Chart */}
      <FlexEngagementTrendsChart dealId={dealId} />

      {/* Activity Trend Chart - External/FLEx Activity Only */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">External Activity (Last 14 Days)</CardTitle>
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
                No external activity recorded in the last 14 days.
              </p>
              <p className="text-xs text-muted-foreground text-center mt-1">
                FLEx engagement and external views will appear here.
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
                    name="External Activity"
                    fill="hsl(var(--primary))" 
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
      </div>

      {/* Sidebar - Lender Interest & Info Requests */}
      <div className="lg:col-span-1 space-y-6">
        <InfoRequestsPanel />
        <FlexLenderInterestPanel dealId={dealId} />
      </div>
    </div>
  );
}
