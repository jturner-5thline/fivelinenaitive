import { useMemo, useState } from 'react';
import { Eye, FileText, TrendingUp, Loader2, ExternalLink, Download, FileSignature, HelpCircle, X, Bookmark, FileCheck, ScrollText, ArrowDownToLine, Video, Unlink, ArrowRightLeft, Link2, Landmark } from 'lucide-react';
import { Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, BarChart, Bar } from 'recharts';
import { useDealActivityStats, useDealActivityChart } from '@/hooks/useDealActivityStats';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

import { FlexEngagementTrendsChart } from './FlexEngagementTrendsChart';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useFlexLenderEngagement } from '@/hooks/useFlexLenderEngagement';
import { format, parseISO, startOfDay, endOfDay, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { useClaapCallActions } from '@/hooks/useClaapCallActions';
import { ClaapDealSelector } from '@/components/claap/ClaapDealSelector';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreVertical } from 'lucide-react';

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

interface DealActivityDetailItem {
  id: string;
  activity_type: string;
  description: string | null;
  created_at: string;
  metadata: Record<string, any> | null;
  user_display_name?: string | null;
  source: 'activity' | 'claap';
}

const FlexStatCard = ({ icon: _icon, label, value, highlight, isLoading, onClick }: FlexStatCardProps) => (
  <div 
    className={`flex flex-col items-center justify-center gap-1.5 p-3 border rounded-lg text-center ${highlight && value > 0 ? 'border-green-500/30 bg-green-500/5' : 'bg-card'} ${onClick ? 'cursor-pointer hover:bg-muted/50 transition-colors' : ''}`}
    onClick={onClick}
    role={onClick ? 'button' : undefined}
    tabIndex={onClick ? 0 : undefined}
    onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); } : undefined}
  >
    {isLoading ? (
      <Skeleton className="h-6 w-8" />
    ) : (
      <span className={`text-xl font-semibold ${highlight && value > 0 ? 'text-green-600' : ''}`}>{value}</span>
    )}
    <p className="text-xs text-muted-foreground">{label}</p>
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
  flex_writeup_viewed: { label: 'Viewed write-up', icon: <ScrollText className="h-3.5 w-3.5" /> },
  flex_writeup_downloaded: { label: 'Downloaded write-up', icon: <ArrowDownToLine className="h-3.5 w-3.5" /> },
  flex_writeup_scrolled: { label: 'Read full write-up', icon: <FileCheck className="h-3.5 w-3.5" /> },
  deal_viewed: { label: 'Viewed deal', icon: <Eye className="h-3.5 w-3.5" /> },
  writeup_viewed: { label: 'Viewed writeup', icon: <FileCheck className="h-3.5 w-3.5" /> },
  claap_recording_linked: { label: 'Call recording', icon: <Video className="h-3.5 w-3.5" /> },
};

// Funding source (lender) lifecycle events surfaced under the "Funding Sources" filter
const FUNDING_SOURCE_ACTIVITY_TYPES = [
  'lender_added',
  'lender_updated',
  'lender_removed',
  'lender_deleted',
  'lender_stage_change',
  'lender_substage_change',
  'lender_status_change',
  'lender_notes_updated',
  'lender_passed',
  'lender_terms_received',
];

const FUNDING_SOURCE_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
  lender_added: { label: 'Funding source added', icon: <Landmark className="h-3.5 w-3.5" /> },
  lender_updated: { label: 'Funding source updated', icon: <Landmark className="h-3.5 w-3.5" /> },
  lender_removed: { label: 'Funding source removed', icon: <Unlink className="h-3.5 w-3.5" /> },
  lender_deleted: { label: 'Funding source removed', icon: <Unlink className="h-3.5 w-3.5" /> },
  lender_stage_change: { label: 'Funding source stage changed', icon: <ArrowRightLeft className="h-3.5 w-3.5" /> },
  lender_substage_change: { label: 'Funding source sub-stage changed', icon: <ArrowRightLeft className="h-3.5 w-3.5" /> },
  lender_status_change: { label: 'Funding source status changed', icon: <ArrowRightLeft className="h-3.5 w-3.5" /> },
  lender_notes_updated: { label: 'Funding source notes updated', icon: <FileText className="h-3.5 w-3.5" /> },
  lender_passed: { label: 'Funding source passed', icon: <X className="h-3.5 w-3.5" /> },
  lender_terms_received: { label: 'Terms received', icon: <FileSignature className="h-3.5 w-3.5" /> },
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

function useLinkedClaapCalls(dealId: string | undefined) {
  return useQuery<DealActivityDetailItem[]>({
    queryKey: ['deal-linked-claap-calls', dealId],
    queryFn: async () => {
      if (!dealId) return [];

      const { data: claapMeetings, error } = await supabase
        .from('claap_meetings')
        .select('id, title, started_at, created_at, duration_seconds, recording_url, call_type, transcript, ai_summary, match_status, match_method, match_confidence, match_reason, manually_locked, claap_meeting_participants(name, email, is_internal)')
        .eq('deal_id', dealId)
        .order('started_at', { ascending: false });

      if (error) throw error;

      const linked: DealActivityDetailItem[] = (claapMeetings || []).map((meeting) => ({
        id: `claap-${meeting.id}`,
        activity_type: 'claap_recording_linked',
        description: meeting.title || 'Untitled call recording',
        created_at: meeting.started_at || meeting.created_at,
        metadata: {
          recording_url: meeting.recording_url,
          transcript: meeting.transcript,
          ai_summary: meeting.ai_summary,
          duration_seconds: meeting.duration_seconds,
          call_type: meeting.call_type,
          claap_meeting_id: meeting.id,
          match_status: (meeting as any).match_status,
          match_method: (meeting as any).match_method,
          match_confidence: (meeting as any).match_confidence,
          match_reason: (meeting as any).match_reason,
          manually_locked: (meeting as any).manually_locked,
          participants: (meeting as any).claap_meeting_participants || [],
        },
        user_display_name: null,
        source: 'claap' as const,
      }));

      // Also surface calls/meetings logged directly against the deal's client contacts.
      const { data: links } = await supabase
        .from('contact_deals')
        .select('contact_id')
        .eq('deal_id', dealId);
      const contactIds = (links || []).map((l: any) => l.contact_id).filter(Boolean);
      if (!contactIds.length) return linked;

      const [{ data: contacts }, { data: contactActivities }] = await Promise.all([
        supabase.from('contacts').select('id, first_name, last_name, full_name, email').in('id', contactIds),
        supabase
          .from('contact_activities')
          .select('id, contact_id, activity_type, subject, body, occurred_at, metadata, deal_id')
          .in('contact_id', contactIds)
          .in('activity_type', ['call', 'meeting', 'claap_call', 'call_logged', 'meeting_logged'])
          .order('occurred_at', { ascending: false })
          .limit(200),
      ]);

      const nameById = new Map<string, string>(
        (contacts || []).map((c: any) => [
          c.id,
          [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || c.full_name || c.email || 'Contact',
        ]),
      );

      // Avoid duplicating Claap-sourced rows already listed above.
      const linkedClaapIds = new Set((claapMeetings || []).map((m: any) => m.id));

      const contactCalls: DealActivityDetailItem[] = (contactActivities || [])
        .filter((a: any) => {
          const claapId = a?.metadata?.claap_meeting_id;
          return !(claapId && linkedClaapIds.has(claapId));
        })
        .map((a: any) => ({
          id: `contact-activity-${a.id}`,
          activity_type: 'claap_recording_linked',
          description:
            a.subject ||
            `${a.activity_type.startsWith('meeting') ? 'Meeting' : 'Call'} with ${nameById.get(a.contact_id) || 'contact'}`,
          created_at: a.occurred_at,
          metadata: {
            call_type: a.activity_type.startsWith('meeting') ? 'Meeting' : 'Call',
            duration_seconds: a?.metadata?.duration_seconds ?? null,
            recording_url: a?.metadata?.recording_url ?? null,
            transcript: a.body ?? null,
            ai_summary: a?.metadata?.ai_summary ?? null,
            contact_id: a.contact_id,
            contact_name: nameById.get(a.contact_id) || null,
            match_reason: `Logged with client contact ${nameById.get(a.contact_id) || ''}`.trim(),
          },
          user_display_name: null,
          source: 'activity' as const,
        }));

      return [...linked, ...contactCalls].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    },
    enabled: !!dealId,
  });
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
          .select('id, title, started_at, created_at, duration_seconds, recording_url, call_type, transcript, ai_summary, match_status, match_method, match_confidence, match_reason, manually_locked, claap_meeting_participants(name, email, is_internal)')
          .eq('deal_id', dealId)
          .order('started_at', { ascending: false }),
      ]);

      if (activityError) throw activityError;
      if (claapError) throw claapError;

      // Only return external activity
      const INTERNAL = [
        'deal_created', 'deal_updated', 'stage_changed', 'status_changed',
        'note_added', 'status_note_added', 'attachment_added', 'attachment_deleted',
        'document_added', 'milestone_added', 'milestone_completed', 'milestone_deleted',
        'value_updated', 'flex_push',
      ].filter((type) => !FUNDING_SOURCE_ACTIVITY_TYPES.includes(type));

      const filteredActivityLogs: DealActivityDetailItem[] = (activityLogs || [])
        .filter((activity) => !INTERNAL.includes(activity.activity_type))
        .map((activity) => ({
          ...activity,
          metadata: activity.metadata && typeof activity.metadata === 'object' && !Array.isArray(activity.metadata)
            ? activity.metadata as Record<string, any>
            : null,
          source: 'activity' as const,
        }));

      const mappedClaapMeetings: DealActivityDetailItem[] = (claapMeetings || [])
        .filter((meeting) => {
          const activityAt = meeting.started_at || meeting.created_at;
          if (!activityAt) return false;
          const createdAt = new Date(activityAt).getTime();
          return createdAt >= dayStart.getTime() && createdAt <= dayEnd.getTime();
        })
        .map((meeting) => ({
          id: `claap-${meeting.id}`,
          activity_type: 'claap_recording_linked',
          description: meeting.title || 'Untitled call recording',
          created_at: meeting.started_at || meeting.created_at,
          metadata: {
            recording_url: meeting.recording_url,
            transcript: meeting.transcript,
            ai_summary: meeting.ai_summary,
            duration_seconds: meeting.duration_seconds,
            call_type: meeting.call_type,
            claap_meeting_id: meeting.id,
            match_status: (meeting as any).match_status,
            match_method: (meeting as any).match_method,
            match_confidence: (meeting as any).match_confidence,
            match_reason: (meeting as any).match_reason,
            manually_locked: (meeting as any).manually_locked,
            participants: (meeting as any).claap_meeting_participants || [],
          },
          user_display_name: null,
          source: 'claap' as const,
        }));

      return [...filteredActivityLogs, ...mappedClaapMeetings].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    },
    enabled: !!dealId && !!date,
  });
}

export function DealActivityTab({ dealId }: DealActivityTabProps) {
  const { data: stats, isLoading: isLoadingStats } = useDealActivityStats(dealId);
  const { data: chartData, isLoading: isLoadingChart } = useDealActivityChart(dealId, 14);
  const { data: lenderEngagement } = useFlexLenderEngagement(dealId);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [activityFilter, setActivityFilter] = useState<'all' | 'calls' | 'activity' | 'funding_sources'>('all');
  const [expandedTranscriptId, setExpandedTranscriptId] = useState<string | null>(null);
  const [unlinkMeetingId, setUnlinkMeetingId] = useState<string | null>(null);
  const [dealSelectorOpen, setDealSelectorOpen] = useState(false);
  const [reassignMeetingId, setReassignMeetingId] = useState<string | null>(null);
  const { changeDeal, unlinkFromDeal } = useClaapCallActions();
  const { data: linkedCalls, isLoading: isLoadingLinkedCalls } = useLinkedClaapCalls(dealId);

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

  const filteredDayActivities = useMemo(() => {
    if (!dayActivities) return [];
    if (activityFilter === 'funding_sources') {
      return dayActivities.filter((activity) => FUNDING_SOURCE_ACTIVITY_TYPES.includes(activity.activity_type));
    }
    if (activityFilter === 'calls') {
      return dayActivities.filter((activity) => activity.activity_type === 'claap_recording_linked');
    }
    if (activityFilter === 'activity') {
      return dayActivities.filter(
        (activity) =>
          activity.activity_type !== 'claap_recording_linked' &&
          !FUNDING_SOURCE_ACTIVITY_TYPES.includes(activity.activity_type),
      );
    }
    return dayActivities;
  }, [activityFilter, dayActivities]);

  const hasActivity = chartData && chartData.some(d => d.views > 0);

  return (
    <div className="w-full overflow-hidden space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Charts column */}
      <div className="space-y-6 min-w-0 lg:order-2">
      {/* FLEx Engagement Trends Chart */}
      <FlexEngagementTrendsChart dealId={dealId} />

      {/* Activity Trend Chart - External/FLEx Activity Only */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-medium">Deal Activity (Last 14 Days)</CardTitle>
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
          <p className="text-xs text-muted-foreground">Click a bar to see activity details, including linked Claap calls</p>
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
                Lender engagement and linked call recordings will appear here.
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
                    name="Deal Activity"
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
                  {filteredDayActivities.length} event{filteredDayActivities.length !== 1 ? 's' : ''}
                </Badge>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {[
                  { value: 'all' as const, label: 'All' },
                  { value: 'calls' as const, label: 'Calls' },
                  { value: 'activity' as const, label: 'Activity' },
                  { value: 'funding_sources' as const, label: 'Funding Sources' },
                ].map((filterOption) => (
                  <Button
                    key={filterOption.value}
                    variant={activityFilter === filterOption.value ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setActivityFilter(filterOption.value)}
                  >
                    {filterOption.label}
                  </Button>
                ))}
              </div>
              {isLoadingDetails ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : !filteredDayActivities.length ? (
                <p className="text-sm text-muted-foreground py-2">No matching activity for this filter on this day.</p>
              ) : (
                <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                  {filteredDayActivities.map((activity) => {
                    const meta = activity.metadata as Record<string, any> | null;
                    const typeInfo = FUNDING_SOURCE_LABELS[activity.activity_type] || ACTIVITY_TYPE_LABELS[activity.activity_type] || {
                      label: activity.activity_type.replace(/_/g, ' '),
                      icon: <ExternalLink className="h-3.5 w-3.5" />,
                    };
                    const lenderName = meta?.lender_name || meta?.lender_email;
                    const isCall = activity.activity_type === 'claap_recording_linked';
                    const transcriptText = meta?.ai_summary || meta?.transcript;

                    return (
                      <div
                        key={activity.id}
                        className="flex items-start gap-3 p-2.5 rounded-md border bg-muted/30 hover:bg-muted/50 transition-colors"
                      >
                        <div className="mt-0.5 text-muted-foreground">{typeInfo.icon}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium capitalize">{isCall ? (activity.description || 'Untitled call recording') : typeInfo.label}</p>
                            {isCall && meta?.call_type && (
                              <Badge variant={getCallTypeBadgeVariant(meta.call_type)} className="text-[10px]">
                                {meta.call_type}
                              </Badge>
                            )}
                            {isCall && meta?.match_status && (
                              <Badge variant="outline" className={`text-[10px] ${
                                meta.match_status === 'manually_linked' ? 'border-blue-500/30 text-blue-600' :
                                meta.match_status === 'matched' ? 'border-green-500/30 text-green-600' :
                                'border-muted'
                              }`}>
                                {meta.match_status === 'manually_linked' ? 'Manual' : 'Auto'}
                              </Badge>
                            )}
                            {isCall && meta?.match_confidence && (
                              <span className={`text-[10px] font-medium ${
                                meta.match_confidence >= 75 ? 'text-green-600' :
                                meta.match_confidence >= 50 ? 'text-amber-600' : 'text-red-600'
                              }`}>
                                {meta.match_confidence}%
                              </span>
                            )}
                          </div>
                          {isCall ? (
                            <div className="mt-1 flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
                              <span>{formatCallDuration(meta?.duration_seconds)}</span>
                              {Array.isArray(meta?.participants) && meta.participants.length > 0 && (
                                <span className="inline-flex items-center gap-1">
                                  <Users className="h-3 w-3" />
                                  {meta.participants.length} attendee{meta.participants.length === 1 ? '' : 's'}
                                </span>
                              )}
                              {meta?.recording_url && (
                                <a
                                  href={meta.recording_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 text-primary hover:underline"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                  Open recording
                                </a>
                              )}
                              {transcriptText && (
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-1 text-primary hover:underline"
                                  onClick={() => setExpandedTranscriptId((current) => current === activity.id ? null : activity.id)}
                                >
                                  <FileText className="h-3 w-3" />
                                  Transcript
                                </button>
                              )}
                            </div>
                          ) : lenderName ? (
                            <p className="text-xs text-muted-foreground">by {lenderName}</p>
                          ) : activity.description && !lenderName ? (
                            <p className="text-xs text-muted-foreground truncate">{activity.description}</p>
                          ) : null}
                          {isCall && meta?.match_reason && (
                            <p className="text-[10px] text-muted-foreground/70 mt-0.5 truncate">{meta.match_reason}</p>
                          )}
                          {isCall && Array.isArray(meta?.participants) && meta.participants.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {meta.participants.slice(0, 8).map((p: any, idx: number) => (
                                <Badge
                                  key={`${activity.id}-p-${idx}`}
                                  variant="outline"
                                  className={`text-[10px] font-normal ${p.is_internal ? 'border-blue-500/30 text-blue-600' : 'border-muted-foreground/20'}`}
                                  title={p.email || undefined}
                                >
                                  {p.name || p.email || 'Unknown'}
                                </Badge>
                              ))}
                              {meta.participants.length > 8 && (
                                <span className="text-[10px] text-muted-foreground">+{meta.participants.length - 8} more</span>
                              )}
                            </div>
                          )}
                          {isCall && expandedTranscriptId === activity.id && transcriptText && (
                            <div className="mt-2 rounded-md border border-border/50 bg-background/80 p-2 text-xs text-muted-foreground whitespace-pre-wrap">
                              {transcriptText}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {format(parseISO(activity.created_at), 'h:mm a')}
                          </span>
                          {isCall && meta?.claap_meeting_id && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-5 w-5 p-0">
                                  <MoreVertical className="h-3 w-3" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => { setReassignMeetingId(meta.claap_meeting_id); setDealSelectorOpen(true); }}>
                                  <ArrowRightLeft className="h-3.5 w-3.5 mr-2" />
                                  Move to Another Deal
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setUnlinkMeetingId(meta.claap_meeting_id)} className="text-destructive">
                                  <Unlink className="h-3.5 w-3.5 mr-2" />
                                  Remove from Deal
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
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

      {/* Engagement Stats Sidebar */}
      <Card id="flex-engagement-section" className="h-fit lg:order-1">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <ExternalLink className="h-4 w-4" />
            Engagement
          </CardTitle>
          <Badge variant="outline" className="text-xs w-fit">
            {stats?.flexUniqueLenders ?? 0} lender{(stats?.flexUniqueLenders ?? 0) !== 1 ? 's' : ''} engaged
          </Badge>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            <Popover>
              <PopoverTrigger asChild>
                <div>
                  <FlexStatCard
                    icon={<Eye className="h-4 w-4" />}
                    label="Views"
                    value={stats?.flexViews ?? 0}
                    isLoading={isLoadingStats}
                    onClick={() => {}}
                  />
                </div>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-3" align="end">
                <h4 className="text-sm font-medium mb-2">Lenders who viewed</h4>
                {(() => {
                  const viewers = lenderEngagement?.filter(l => l.views > 0) || [];
                  if (viewers.length === 0) return <p className="text-xs text-muted-foreground">No lender views yet.</p>;
                  return (
                    <div className="space-y-2 max-h-[200px] overflow-y-auto">
                      {viewers.map((l, i) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <div className="min-w-0">
                            <p className="font-medium truncate">{l.lenderName}</p>
                            {l.lenderEmail && <p className="text-xs text-muted-foreground truncate">{l.lenderEmail}</p>}
                          </div>
                          <Badge variant="secondary" className="text-xs shrink-0 ml-2">{l.views}</Badge>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </PopoverContent>
            </Popover>
            <FlexStatCard
              icon={<Download className="h-4 w-4" />}
              label="Downloads"
              value={stats?.flexDownloads ?? 0}
              isLoading={isLoadingStats}
            />
            <Popover>
              <PopoverTrigger asChild>
                <div>
                  <FlexStatCard
                    icon={<HelpCircle className="h-4 w-4" />}
                    label="Info Requests"
                    value={stats?.flexInfoRequests ?? 0}
                    highlight
                    isLoading={isLoadingStats}
                    onClick={() => {}}
                  />
                </div>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-3" align="end">
                <h4 className="text-sm font-medium mb-2">Lenders who requested info</h4>
                {(() => {
                  const requesters = lenderEngagement?.filter(l => l.infoRequests > 0) || [];
                  if (requesters.length === 0) return <p className="text-xs text-muted-foreground">No info requests yet.</p>;
                  return (
                    <div className="space-y-2 max-h-[200px] overflow-y-auto">
                      {requesters.map((l, i) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <div className="min-w-0">
                            <p className="font-medium truncate">{l.lenderName}</p>
                            {l.lenderEmail && <p className="text-xs text-muted-foreground truncate">{l.lenderEmail}</p>}
                          </div>
                          <Badge variant="secondary" className="text-xs shrink-0 ml-2">{l.infoRequests}</Badge>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </PopoverContent>
            </Popover>
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

            {/* Write-Up Engagement */}
            <div className="border-t pt-3 mt-1 col-span-2">
              <p className="text-xs font-medium text-muted-foreground mb-3 text-center">Write-Up Activity</p>
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <div>
                  <FlexStatCard
                    icon={<ScrollText className="h-4 w-4" />}
                    label="Write-Up Views"
                    value={lenderEngagement?.reduce((sum, l) => sum + l.writeupViews, 0) ?? 0}
                    isLoading={isLoadingStats}
                    onClick={() => {}}
                  />
                </div>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-3" align="end">
                <h4 className="text-sm font-medium mb-2">Lenders who viewed write-up</h4>
                {(() => {
                  const viewers = lenderEngagement?.filter(l => l.writeupViews > 0) || [];
                  if (viewers.length === 0) return <p className="text-xs text-muted-foreground">No write-up views yet.</p>;
                  return (
                    <div className="space-y-2 max-h-[200px] overflow-y-auto">
                      {viewers.map((l, i) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <div className="min-w-0">
                            <p className="font-medium truncate">{l.lenderName}</p>
                            {l.lenderEmail && <p className="text-xs text-muted-foreground truncate">{l.lenderEmail}</p>}
                          </div>
                          <Badge variant="secondary" className="text-xs shrink-0 ml-2">{l.writeupViews}</Badge>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <div>
                  <FlexStatCard
                    icon={<ArrowDownToLine className="h-4 w-4" />}
                    label="Write-Up Downloads"
                    value={lenderEngagement?.reduce((sum, l) => sum + l.writeupDownloads, 0) ?? 0}
                    isLoading={isLoadingStats}
                    onClick={() => {}}
                  />
                </div>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-3" align="end">
                <h4 className="text-sm font-medium mb-2">Lenders who downloaded write-up</h4>
                {(() => {
                  const downloaders = lenderEngagement?.filter(l => l.writeupDownloads > 0) || [];
                  if (downloaders.length === 0) return <p className="text-xs text-muted-foreground">No write-up downloads yet.</p>;
                  return (
                    <div className="space-y-2 max-h-[200px] overflow-y-auto">
                      {downloaders.map((l, i) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <div className="min-w-0">
                            <p className="font-medium truncate">{l.lenderName}</p>
                            {l.lenderEmail && <p className="text-xs text-muted-foreground truncate">{l.lenderEmail}</p>}
                          </div>
                          <Badge variant="secondary" className="text-xs shrink-0 ml-2">{l.writeupDownloads}</Badge>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <div>
                  <FlexStatCard
                    icon={<FileCheck className="h-4 w-4" />}
                    label="Read Full Write-Up"
                    value={lenderEngagement?.reduce((sum, l) => sum + l.writeupFullScrolls, 0) ?? 0}
                    isLoading={isLoadingStats}
                    onClick={() => {}}
                  />
                </div>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-3" align="end">
                <h4 className="text-sm font-medium mb-2">Lenders who read full write-up</h4>
                {(() => {
                  const scrollers = lenderEngagement?.filter(l => l.writeupFullScrolls > 0) || [];
                  if (scrollers.length === 0) return <p className="text-xs text-muted-foreground">No full reads yet.</p>;
                  return (
                    <div className="space-y-2 max-h-[200px] overflow-y-auto">
                      {scrollers.map((l, i) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <div className="min-w-0">
                            <p className="font-medium truncate">{l.lenderName}</p>
                            {l.lenderEmail && <p className="text-xs text-muted-foreground truncate">{l.lenderEmail}</p>}
                          </div>
                          <Badge variant="secondary" className="text-xs shrink-0 ml-2">{l.writeupFullScrolls}</Badge>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </PopoverContent>
            </Popover>
          </div>
        </CardContent>
      </Card>
      </div>

      {/* Linked Claap Calls - always visible */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Video className="h-4 w-4" />
              Linked Calls
            </CardTitle>
            <Badge variant="secondary" className="text-xs">
              {linkedCalls?.length ?? 0} call{(linkedCalls?.length ?? 0) !== 1 ? 's' : ''}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingLinkedCalls ? (
            <div className="space-y-2">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : !linkedCalls?.length ? (
            <div className="flex flex-col items-center justify-center py-6">
              <Video className="h-8 w-8 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground text-center">No calls linked to this deal yet.</p>
              <p className="text-xs text-muted-foreground text-center mt-1">Calls matched via the Claap integration will appear here.</p>
            </div>
          ) : (
            <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
              {linkedCalls.map((activity) => {
                const meta = activity.metadata as Record<string, any> | null;
                const transcriptText = meta?.ai_summary || meta?.transcript;

                return (
                  <div
                    key={activity.id}
                    className="flex items-start gap-3 p-2.5 rounded-md border bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <div className="mt-0.5 text-muted-foreground"><Video className="h-3.5 w-3.5" /></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium">{activity.description || 'Untitled call recording'}</p>
                        {meta?.call_type && (
                          <Badge variant={getCallTypeBadgeVariant(meta.call_type)} className="text-[10px]">
                            {meta.call_type}
                          </Badge>
                        )}
                        {meta?.match_status && (
                          <Badge variant="outline" className={cn("text-[10px]",
                            meta.match_status === 'manually_linked' ? 'border-blue-500/30 text-blue-600' :
                            meta.match_status === 'matched' ? 'border-green-500/30 text-green-600' :
                            'border-muted'
                          )}>
                            {meta.match_status === 'manually_linked' ? 'Manual' : 'Auto'}
                          </Badge>
                        )}
                        {meta?.match_confidence != null && (
                          <span className={cn("text-[10px] font-medium",
                            meta.match_confidence >= 75 ? 'text-green-600' :
                            meta.match_confidence >= 50 ? 'text-amber-600' : 'text-red-600'
                          )}>
                            {meta.match_confidence}%
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
                        <span>{format(parseISO(activity.created_at), 'MMM d, yyyy · h:mm a')}</span>
                        <span>{formatCallDuration(meta?.duration_seconds)}</span>
                        {meta?.recording_url && (
                          <a href={meta.recording_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                            <ExternalLink className="h-3 w-3" /> Open recording
                          </a>
                        )}
                        {transcriptText && (
                          <button type="button" className="inline-flex items-center gap-1 text-primary hover:underline"
                            onClick={() => setExpandedTranscriptId((c) => c === activity.id ? null : activity.id)}>
                            <FileText className="h-3 w-3" /> Transcript
                          </button>
                        )}
                      </div>
                      {meta?.match_reason && (
                        <p className="text-[10px] text-muted-foreground/70 mt-0.5 truncate">{meta.match_reason}</p>
                      )}
                      {expandedTranscriptId === activity.id && transcriptText && (
                        <div className="mt-2 rounded-md border border-border/50 bg-background/80 p-2 text-xs text-muted-foreground whitespace-pre-wrap max-h-[200px] overflow-y-auto">
                          {transcriptText}
                        </div>
                      )}
                    </div>
                    {meta?.claap_meeting_id && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 shrink-0">
                            <MoreVertical className="h-3 w-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => { setReassignMeetingId(meta.claap_meeting_id); setDealSelectorOpen(true); }}>
                            <ArrowRightLeft className="h-3.5 w-3.5 mr-2" /> Move to Another Deal
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setUnlinkMeetingId(meta.claap_meeting_id)} className="text-destructive">
                            <Unlink className="h-3.5 w-3.5 mr-2" /> Remove from Deal
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Claap call management dialogs */}
      <ClaapDealSelector
        open={dealSelectorOpen}
        onOpenChange={setDealSelectorOpen}
        onSelect={(newDealId, newDealName) => {
          if (reassignMeetingId) {
            changeDeal.mutate({ meetingId: reassignMeetingId, newDealId, newDealName });
            setReassignMeetingId(null);
          }
        }}
        title="Move Call to Another Deal"
      />

      <AlertDialog open={!!unlinkMeetingId} onOpenChange={(open) => { if (!open) setUnlinkMeetingId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove call from this deal?</AlertDialogTitle>
            <AlertDialogDescription>
              This will unlink the call from this deal. It will appear as unmatched in the Claap integration settings.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (unlinkMeetingId) { unlinkFromDeal.mutate({ meetingId: unlinkMeetingId }); setUnlinkMeetingId(null); } }}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
