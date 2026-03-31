import { useMemo, useState } from 'react';
import { Eye, FileText, TrendingUp, Loader2, ExternalLink, Download, FileSignature, HelpCircle, X, Bookmark, FileCheck, ScrollText, ArrowDownToLine, Video } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { useDealActivityChart } from '@/hooks/useDealActivityStats';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, parseISO, startOfDay, endOfDay } from 'date-fns';

interface DealActivityChartProps {
  dealId: string;
}

interface DealActivityDetailItem {
  id: string;
  activity_type: string;
  description: string | null;
  created_at: string;
  metadata: Record<string, any> | null;
  user_display_name?: string | null;
  source: 'activity' | 'claap';
}

const ACTIVITY_TYPE_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
  flex_deal_viewed: { label: 'Viewed deal', icon: <Eye className="h-3.5 w-3.5" /> },
  flex_deal_view: { label: 'Viewed deal', icon: <Eye className="h-3.5 w-3.5" /> },
  flex_file_downloaded: { label: 'Downloaded file', icon: <Download className="h-3.5 w-3.5" /> },
  flex_info_requested: { label: 'Requested info', icon: <HelpCircle className="h-3.5 w-3.5" /> },
  flex_nda_requested: { label: 'Requested NDA', icon: <FileText className="h-3.5 w-3.5" /> },
  flex_term_sheet_requested: { label: 'Requested term sheet', icon: <FileSignature className="h-3.5 w-3.5" /> },
  flex_deal_saved: { label: 'Saved deal', icon: <Bookmark className="h-3.5 w-3.5" /> },
  flex_writeup_viewed: { label: 'Viewed write-up', icon: <ScrollText className="h-3.5 w-3.5" /> },
  flex_writeup_downloaded: { label: 'Downloaded write-up', icon: <ArrowDownToLine className="h-3.5 w-3.5" /> },
  flex_writeup_scrolled: { label: 'Read full write-up', icon: <FileCheck className="h-3.5 w-3.5" /> },
  deal_viewed: { label: 'Viewed deal', icon: <Eye className="h-3.5 w-3.5" /> },
  writeup_viewed: { label: 'Viewed writeup', icon: <FileCheck className="h-3.5 w-3.5" /> },
  claap_recording_linked: { label: 'Call recording', icon: <Video className="h-3.5 w-3.5" /> },
};

function formatCallDuration(seconds: number | null | undefined) {
  if (!seconds || seconds <= 0) return '—';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${remainingSeconds > 0 ? `${remainingSeconds}s` : ''}`.trim();
  return `${remainingSeconds}s`;
}

function getCallTypeBadgeVariant(callType: string | null | undefined): 'default' | 'secondary' | 'outline' {
  if (!callType) return 'outline';
  const normalized = callType.toLowerCase();
  if (normalized.includes('deal')) return 'default';
  if (normalized.includes('lender')) return 'secondary';
  return 'outline';
}

function useActivityDetailsForDate(dealId: string | undefined, date: string | null) {
  return useQuery<DealActivityDetailItem[]>({
    queryKey: ['deal-activity-details', dealId, date],
    queryFn: async () => {
      if (!dealId || !date) return [];
      const dayStart = startOfDay(parseISO(date));
      const dayEnd = endOfDay(parseISO(date));
      const [
        { data: activityLogs, error: activityError },
        { data: claapMeetings, error: claapError },
      ] = await Promise.all([
        supabase
          .from('activity_logs')
          .select('id, activity_type, description, created_at, metadata, user_display_name')
          .eq('deal_id', dealId)
          .gte('created_at', dayStart.toISOString())
          .lte('created_at', dayEnd.toISOString())
          .order('created_at', { ascending: false }),
        supabase
          .from('claap_meetings')
          .select('id, title, started_at, created_at, duration_seconds, recording_url, call_type, transcript, ai_summary')
          .eq('deal_id', dealId)
          .order('started_at', { ascending: false }),
      ]);
      if (activityError) throw activityError;
      if (claapError) throw claapError;
      const INTERNAL = [
        'deal_created', 'deal_updated', 'stage_changed', 'status_changed',
        'lender_added', 'lender_updated', 'lender_removed', 'lender_deleted',
        'lender_stage_change', 'lender_substage_change', 'lender_notes_updated',
        'note_added', 'status_note_added', 'attachment_added', 'attachment_deleted',
        'document_added', 'milestone_added', 'milestone_completed', 'milestone_deleted',
        'value_updated', 'flex_push',
      ];
      const filteredActivityLogs: DealActivityDetailItem[] = (activityLogs || [])
        .filter((a) => !INTERNAL.includes(a.activity_type))
        .map((a) => ({
          ...a,
          metadata: a.metadata && typeof a.metadata === 'object' && !Array.isArray(a.metadata) ? a.metadata as Record<string, any> : null,
          source: 'activity',
        }));
      const mappedClaapMeetings: DealActivityDetailItem[] = (claapMeetings || [])
        .filter((m) => {
          const at = m.started_at || m.created_at;
          if (!at) return false;
          const t = new Date(at).getTime();
          return t >= dayStart.getTime() && t <= dayEnd.getTime();
        })
        .map((m) => ({
          id: `claap-${m.id}`,
          activity_type: 'claap_recording_linked',
          description: m.title || 'Untitled call recording',
          created_at: m.started_at || m.created_at,
          metadata: { recording_url: m.recording_url, transcript: m.transcript, ai_summary: m.ai_summary, duration_seconds: m.duration_seconds, call_type: m.call_type },
          user_display_name: null,
          source: 'claap',
        }));
      return [...filteredActivityLogs, ...mappedClaapMeetings].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    },
    enabled: !!dealId && !!date,
  });
}

export function DealActivityChart({ dealId }: DealActivityChartProps) {
  const { data: chartData, isLoading: isLoadingChart } = useDealActivityChart(dealId, 14);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [activityFilter, setActivityFilter] = useState<'all' | 'calls' | 'activity'>('all');
  const [expandedTranscriptId, setExpandedTranscriptId] = useState<string | null>(null);

  const { data: rawChartDates } = useQuery({
    queryKey: ['deal-activity-chart-dates', dealId, 14],
    queryFn: async () => {
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
      if (isoDate) setSelectedDate(prev => prev === isoDate ? null : isoDate);
    }
  };

  const { data: dayActivities, isLoading: isLoadingDetails } = useActivityDetailsForDate(dealId, selectedDate);

  const filteredDayActivities = useMemo(() => {
    if (!dayActivities) return [];
    if (activityFilter === 'calls') return dayActivities.filter((a) => a.activity_type === 'claap_recording_linked');
    if (activityFilter === 'activity') return dayActivities.filter((a) => a.activity_type !== 'claap_recording_linked');
    return dayActivities;
  }, [activityFilter, dayActivities]);

  const hasActivity = chartData && chartData.some(d => d.views > 0);

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between py-3 px-4 space-y-0">
        <div>
          <CardTitle className="text-sm font-medium">Deal Activity</CardTitle>
          <p className="text-[10px] text-muted-foreground mt-0.5">Last 14 days · Click bar for details</p>
        </div>
        {selectedDate && (
          <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1 px-2" onClick={() => setSelectedDate(null)}>
            <X className="h-2.5 w-2.5" /> Clear
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex-1 px-4 pb-4 pt-0">
        {isLoadingChart ? (
          <div className="h-[200px] flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !hasActivity ? (
          <div className="h-[200px] flex flex-col items-center justify-center">
            <TrendingUp className="h-6 w-6 text-muted-foreground/40 mb-2" />
            <p className="text-xs text-muted-foreground">No activity in the last 14 days</p>
          </div>
        ) : (
          <div className="h-[200px] cursor-pointer">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 5, right: 5, left: -10, bottom: 5 }} onClick={handleBarClick}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} className="text-muted-foreground" />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} className="text-muted-foreground" allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px',
                    fontSize: '11px',
                  }}
                />
                <Bar dataKey="views" name="Activity" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {selectedDate && (
          <div className="mt-3 border-t border-border/50 pt-3 space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-medium">{format(parseISO(selectedDate), 'MMMM d, yyyy')}</h4>
              <Badge variant="secondary" className="text-[10px] h-4">{filteredDayActivities.length} events</Badge>
            </div>
            <div className="flex items-center gap-1">
              {(['all', 'calls', 'activity'] as const).map((f) => (
                <Button key={f} variant={activityFilter === f ? 'default' : 'outline'} size="sm" className="h-5 px-2 text-[10px]" onClick={() => setActivityFilter(f)}>
                  {f === 'all' ? 'All' : f === 'calls' ? 'Calls' : 'Activity'}
                </Button>
              ))}
            </div>
            {isLoadingDetails ? (
              <div className="space-y-1.5"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div>
            ) : !filteredDayActivities.length ? (
              <p className="text-xs text-muted-foreground py-2">No matching activity.</p>
            ) : (
              <div className="space-y-1 max-h-[200px] overflow-y-auto">
                {filteredDayActivities.map((activity) => {
                  const meta = activity.metadata;
                  const typeInfo = ACTIVITY_TYPE_LABELS[activity.activity_type] || { label: activity.activity_type.replace(/_/g, ' '), icon: <ExternalLink className="h-3 w-3" /> };
                  const lenderName = meta?.lender_name || meta?.lender_email;
                  const isCall = activity.activity_type === 'claap_recording_linked';
                  const transcriptText = meta?.ai_summary || meta?.transcript;
                  return (
                    <div key={activity.id} className="flex items-start gap-2 p-2 rounded-md border border-border/50 bg-muted/20 text-xs">
                      <div className="mt-0.5 text-muted-foreground shrink-0">{typeInfo.icon}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-medium capitalize">{isCall ? (activity.description || 'Call') : typeInfo.label}</span>
                          {isCall && meta?.call_type && <Badge variant={getCallTypeBadgeVariant(meta.call_type)} className="text-[9px] h-3.5">{meta.call_type}</Badge>}
                        </div>
                        {isCall ? (
                          <div className="mt-0.5 flex items-center gap-2 text-muted-foreground">
                            <span>{formatCallDuration(meta?.duration_seconds)}</span>
                            {meta?.recording_url && (
                              <a href={meta.recording_url} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-0.5">
                                <ExternalLink className="h-2.5 w-2.5" /> Open
                              </a>
                            )}
                            {transcriptText && (
                              <button type="button" className="text-primary hover:underline inline-flex items-center gap-0.5" onClick={() => setExpandedTranscriptId(c => c === activity.id ? null : activity.id)}>
                                <FileText className="h-2.5 w-2.5" /> Transcript
                              </button>
                            )}
                          </div>
                        ) : lenderName ? (
                          <p className="text-muted-foreground">by {lenderName}</p>
                        ) : activity.description ? (
                          <p className="text-muted-foreground truncate">{activity.description}</p>
                        ) : null}
                        {isCall && expandedTranscriptId === activity.id && transcriptText && (
                          <div className="mt-1.5 rounded border border-border/50 bg-background/80 p-1.5 text-[10px] text-muted-foreground whitespace-pre-wrap max-h-[120px] overflow-y-auto">
                            {transcriptText}
                          </div>
                        )}
                      </div>
                      <span className="text-muted-foreground whitespace-nowrap shrink-0">{format(parseISO(activity.created_at), 'h:mm a')}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
