import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Video, Clock, Users, ExternalLink, ChevronDown, ChevronUp,
  CheckCircle, Lightbulb, ArrowRight, MessageSquare, TrendingUp
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { useClaapMeetingsByDeal, useClaapMeetingParticipants, ClaapMeeting } from '@/hooks/useClaapMeetings';
import { cn } from '@/lib/utils';

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  if (mins >= 60) {
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  }
  return `${mins}m`;
}

const SENTIMENT_BADGES: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
  positive: { variant: 'default', label: '🟢 Positive' },
  neutral: { variant: 'secondary', label: '🟡 Neutral' },
  negative: { variant: 'destructive', label: '🔴 Negative' },
};

// ============================================
// Single Meeting Card (used in both tab and timeline)
// ============================================
export function ClaapMeetingCard({ meeting, compact = false }: { meeting: ClaapMeeting; compact?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const sentimentBadge = meeting.sentiment ? SENTIMENT_BADGES[meeting.sentiment] : null;

  return (
    <Card className="transition-all duration-200">
      <CardContent className={cn("space-y-2", compact ? "py-3 px-4" : "py-4 px-5")}>
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Video className="h-4 w-4 text-purple-500 shrink-0" />
            <div className="min-w-0">
              <p className={cn("font-medium truncate", compact ? "text-sm" : "text-base")}>{meeting.title || 'Untitled Meeting'}</p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                {meeting.started_at && (
                  <span>{format(new Date(meeting.started_at), 'MMM d, yyyy • h:mm a')}</span>
                )}
                {meeting.duration_seconds && (
                  <>
                    <span>•</span>
                    <span className="flex items-center gap-0.5">
                      <Clock className="h-3 w-3" />
                      {formatDuration(meeting.duration_seconds)}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {sentimentBadge && (
              <Badge variant={sentimentBadge.variant} className="text-xs">{sentimentBadge.label}</Badge>
            )}
            {meeting.recording_url && (
              <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
                <a href={meeting.recording_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3 w-3 mr-1" /> Watch
                </a>
              </Button>
            )}
          </div>
        </div>

        {/* AI Summary */}
        {meeting.ai_summary && (
          <p className="text-sm text-muted-foreground leading-relaxed">{meeting.ai_summary}</p>
        )}

        {/* Topics */}
        {meeting.topics && meeting.topics.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {meeting.topics.map((topic, i) => (
              <Badge key={i} variant="outline" className="text-xs">{topic}</Badge>
            ))}
          </div>
        )}

        {/* Expandable section */}
        <Collapsible open={expanded} onOpenChange={setExpanded}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 text-xs w-full justify-start gap-1 text-muted-foreground">
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {expanded ? 'Show less' : 'Show details'}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-3 pt-2">
            {/* Key Decisions */}
            {meeting.key_decisions && meeting.key_decisions.length > 0 && (
              <div>
                <p className="text-xs font-medium flex items-center gap-1 mb-1">
                  <CheckCircle className="h-3 w-3 text-emerald-500" /> Key Decisions
                </p>
                <ul className="space-y-0.5">
                  {meeting.key_decisions.map((d, i) => (
                    <li key={i} className="text-xs text-muted-foreground pl-4 relative before:content-['•'] before:absolute before:left-1">{d}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Next Steps */}
            {meeting.next_steps && meeting.next_steps.length > 0 && (
              <div>
                <p className="text-xs font-medium flex items-center gap-1 mb-1">
                  <ArrowRight className="h-3 w-3 text-blue-500" /> Next Steps
                </p>
                <ul className="space-y-0.5">
                  {meeting.next_steps.map((s, i) => (
                    <li key={i} className="text-xs text-muted-foreground pl-4 relative before:content-['•'] before:absolute before:left-1">{s}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Full Transcript preview */}
            {meeting.transcript && (
              <div>
                <p className="text-xs font-medium flex items-center gap-1 mb-1">
                  <MessageSquare className="h-3 w-3" /> Transcript
                </p>
                <div className="bg-muted/50 rounded-lg p-3 max-h-[200px] overflow-y-auto">
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap">{meeting.transcript}</p>
                </div>
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}

// ============================================
// Timeline Entry (compact for activity feed)
// ============================================
export function ClaapMeetingTimelineEntry({ meeting }: { meeting: ClaapMeeting }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <div className="h-8 w-8 rounded-full bg-purple-500/10 flex items-center justify-center shrink-0 mt-0.5">
        <Video className="h-4 w-4 text-purple-500" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium truncate">{meeting.title || 'Claap Meeting'}</p>
          {meeting.sentiment && (
            <Badge variant={SENTIMENT_BADGES[meeting.sentiment]?.variant || 'secondary'} className="text-[10px]">
              {SENTIMENT_BADGES[meeting.sentiment]?.label || meeting.sentiment}
            </Badge>
          )}
        </div>
        {meeting.ai_summary && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{meeting.ai_summary}</p>
        )}
        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
          {meeting.started_at && <span>{format(new Date(meeting.started_at), 'MMM d, yyyy')}</span>}
          {meeting.duration_seconds && (
            <>
              <span>•</span>
              <span>{formatDuration(meeting.duration_seconds)}</span>
            </>
          )}
          {meeting.recording_url && (
            <a href={meeting.recording_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-0.5">
              Watch <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================
// Meetings Tab (for Deal detail page)
// ============================================
export function ClaapMeetingsTab({ dealId }: { dealId: string }) {
  const { data: meetings = [], isLoading } = useClaapMeetingsByDeal(dealId);
  const [filter, setFilter] = useState('');

  const filtered = filter
    ? meetings.filter(m => m.title?.toLowerCase().includes(filter.toLowerCase()) || m.ai_summary?.toLowerCase().includes(filter.toLowerCase()))
    : meetings;

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}
      </div>
    );
  }

  if (meetings.length === 0) {
    return (
      <div className="border-2 border-dashed rounded-lg p-8 text-center">
        <Video className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
        <p className="font-medium">No meetings linked</p>
        <p className="text-sm text-muted-foreground mt-1">
          Claap meetings will appear here once they are routed to this deal.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {meetings.length > 3 && (
        <input
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="Filter meetings..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />
      )}
      <div className="space-y-3">
        {filtered.map(meeting => (
          <ClaapMeetingCard key={meeting.id} meeting={meeting} />
        ))}
      </div>
    </div>
  );
}
