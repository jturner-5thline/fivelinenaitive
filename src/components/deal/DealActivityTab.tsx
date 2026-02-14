import { useState } from 'react';
import { Eye, FileText, TrendingUp, Loader2, ExternalLink, Download, FileSignature, HelpCircle, X, Bookmark, FileCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, BarChart, Bar } from 'recharts';
import { useDealActivityStats, useDealActivityChart } from '@/hooks/useDealActivityStats';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FlexLenderInterestPanel } from './FlexLenderInterestPanel';
import { FlexEngagementTrendsChart } from './FlexEngagementTrendsChart';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, parseISO, startOfDay, endOfDay } from 'date-fns';
import { cn } from '@/lib/utils';

interface DealActivityTabProps {
  dealId: string;
}

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

const ACTIVITY_TYPE_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
  flex_deal_viewed: { label: 'Viewed deal', icon: <Eye className="h-3.5 w-3.5" /> },
  flex_deal_view: { label: 'Viewed deal', icon: <Eye className="h-3.5 w-3.5" /> },
  flex_file_downloaded: { label: 'Downloaded file', icon: <Download className="h-3.5 w-3.5" /> },
  flex_info_requested: { label: 'Requested info', icon: <HelpCircle className="h-3.5 w-3.5" /> },
  flex_nda_requested: { label: 'Requested NDA', icon: <FileText className="h-3.5 w-3.5" /> },
  flex_term_sheet_requested: { label: 'Requested term sheet', icon: <FileSignature className="h-3.5 w-3.5" /> },
  flex_deal_saved: { label: 'Saved deal', icon: <Bookmark className="h-3.5 w-3.5" /> },
  deal_viewed: { label: 'Viewed deal', icon: <Eye className="h-3.5 w-3.5" /> },
  writeup_viewed: { label: 'Viewed writeup', icon: <FileCheck className="h-3.5 w-3.5" /> },
};

function useActivityDetailsForDate(dealId: string | undefined, date: string | null) {
  return useQuery({
    queryKey: ['deal-activity-details', dealId, date],
    queryFn: async () => {
      if (!dealId || !date) return [];

      const dayStart = startOfDay(parseISO(date));
      const dayEnd = endOfDay(parseISO(date));

      const { data, error } = await supabase
        .from('activity_logs')
        .select('id, activity_type, description, created_at, metadata, user_display_name')
        .eq('deal_id', dealId)
        .gte('created_at', dayStart.toISOString())
        .lte('created_at', dayEnd.toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Only return external activity
      const INTERNAL = [
        'deal_created', 'deal_updated', 'stage_changed', 'status_changed',
        'lender_added', 'lender_updated', 'lender_removed', 'lender_deleted',
        'lender_stage_change', 'lender_substage_change', 'lender_notes_updated',
        'note_added', 'status_note_added', 'attachment_added', 'attachment_deleted',
        'document_added', 'milestone_added', 'milestone_completed', 'milestone_deleted',
        'value_updated', 'flex_push',
      ];
      return (data || []).filter(a => !INTERNAL.includes(a.activity_type));
    },
    enabled: !!dealId && !!date,
  });
}

export function DealActivityTab({ dealId }: DealActivityTabProps) {
  const { data: stats, isLoading: isLoadingStats } = useDealActivityStats(dealId);
  const { data: chartData, isLoading: isLoadingChart } = useDealActivityChart(dealId, 14);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Reverse-map display label (e.g. "Feb 1") back to ISO date
  const displayToIso = chartData?.reduce<Record<string, string>>((acc, d) => {
    // Reconstruct ISO from the chart data's original date format
    // chartData dates are formatted as 'MMM d' but we need the actual date
    return acc;
  }, {}) ?? {};

  // We need the raw ISO dates - let's use a separate approach
  const { data: rawChartDates } = useQuery({
    queryKey: ['deal-activity-chart-dates', dealId, 14],
    queryFn: async () => {
      if (!dealId) return {};
      const map: Record<string, string> = {};
      for (let i = 13; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const iso = format(d, 'yyyy-MM-dd');
        const display = format(d, 'MMM d');
        map[display] = iso;
      }
      return map;
    },
    enabled: !!dealId,
  });

  const handleBarClick = (data: any) => {
    if (data?.activeLabel && rawChartDates) {
      const isoDate = rawChartDates[data.activeLabel];
      if (isoDate) {
        setSelectedDate(prev => prev === isoDate ? null : isoDate);
      }
    }
  };

  const { data: dayActivities, isLoading: isLoadingDetails } = useActivityDetailsForDate(dealId, selectedDate);

  const hasActivity = chartData && chartData.some(d => d.views > 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full overflow-hidden">
      {/* Main activity section */}
      <div className="lg:col-span-2 space-y-6">
      {/* FLEx Engagement Stats */}
      <Card id="flex-engagement-section">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <ExternalLink className="h-4 w-4" />
              Engagement
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
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-medium">Lender Activity (Last 14 Days)</CardTitle>
            {selectedDate && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => setSelectedDate(null)}
              >
                <X className="h-3 w-3" />
                Clear selection
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">Click a bar to see activity details</p>
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
                No lender activity recorded in the last 14 days.
              </p>
              <p className="text-xs text-muted-foreground text-center mt-1">
                Lender engagement and views will appear here.
              </p>
            </div>
          ) : (
            <div className="h-[250px] cursor-pointer">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }} onClick={handleBarClick}>
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
                    name="Lender Activity"
                    fill="hsl(var(--primary))" 
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Activity Details Panel */}
          {selectedDate && (
            <div className="mt-4 border-t pt-4 space-y-2">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium">
                  Activity on {format(parseISO(selectedDate), 'MMMM d, yyyy')}
                </h4>
                <Badge variant="secondary" className="text-xs">
                  {dayActivities?.length ?? 0} event{(dayActivities?.length ?? 0) !== 1 ? 's' : ''}
                </Badge>
              </div>
              {isLoadingDetails ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : !dayActivities?.length ? (
                <p className="text-sm text-muted-foreground py-2">No external activity on this day.</p>
              ) : (
                <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                  {dayActivities.map((activity) => {
                    const meta = activity.metadata as Record<string, any> | null;
                    const typeInfo = ACTIVITY_TYPE_LABELS[activity.activity_type] || {
                      label: activity.activity_type.replace(/_/g, ' '),
                      icon: <ExternalLink className="h-3.5 w-3.5" />,
                    };
                    const lenderName = meta?.lender_name || meta?.lender_email;

                    return (
                      <div
                        key={activity.id}
                        className="flex items-start gap-3 p-2.5 rounded-md border bg-muted/30 hover:bg-muted/50 transition-colors"
                      >
                        <div className="mt-0.5 text-muted-foreground">{typeInfo.icon}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium capitalize">{typeInfo.label}</p>
                          {lenderName && (
                            <p className="text-xs text-muted-foreground">by {lenderName}</p>
                          )}
                          {activity.description && !lenderName && (
                            <p className="text-xs text-muted-foreground truncate">{activity.description}</p>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {format(parseISO(activity.created_at), 'h:mm a')}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      </div>

      {/* Sidebar - Lender Interest */}
      <div className="lg:col-span-1 space-y-6">
        <FlexLenderInterestPanel dealId={dealId} />
      </div>
    </div>
  );
}
