import { useState, useMemo, useCallback, useEffect } from 'react';
import { format, parseISO, differenceInMinutes, isBefore } from 'date-fns';
import { Phone, Users, Building2, ChevronDown, ChevronUp, RefreshCw, ExternalLink, Copy, Sparkles, Video, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useGoogleCalendar, CalendarEvent } from '@/hooks/useGoogleCalendar';
import DOMPurify from 'dompurify';
import { useDealsContext } from '@/contexts/DealsContext';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface CallBrief {
  eventId: string;
  summary: string;
  loading: boolean;
  error?: string;
}

export function SalesCallPrepWidget() {
  const { events, isLoading: calendarLoading, status: calendarStatus } = useGoogleCalendar();
  const { deals } = useDealsContext();
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(true);
  const [briefs, setBriefs] = useState<Record<string, CallBrief>>({});
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);

  // Get today's events that look like calls/meetings (not all-day)
  const todayCalls = useMemo(() => {
    if (!events?.length) return [];
    const now = new Date();
    const todayStr = format(now, 'yyyy-MM-dd');

    return events
      .filter(e => {
        if (e.all_day) return false;
        const start = parseISO(e.start);
        return format(start, 'yyyy-MM-dd') === todayStr;
      })
      .sort((a, b) => parseISO(a.start).getTime() - parseISO(b.start).getTime());
  }, [events]);

  const getTimeUntil = (event: CalendarEvent) => {
    const now = new Date();
    const start = parseISO(event.start);
    const end = parseISO(event.end);

    if (isBefore(end, now)) return 'Ended';
    if (isBefore(start, now)) return 'Now';

    const mins = differenceInMinutes(start, now);
    if (mins < 60) return `in ${mins}m`;
    const hrs = Math.floor(mins / 60);
    const remainMins = mins % 60;
    return remainMins > 0 ? `in ${hrs}h ${remainMins}m` : `in ${hrs}h`;
  };

  const findRelatedDeal = (event: CalendarEvent) => {
    const summary = (event.summary || '').toLowerCase();
    const attendeeEmails = (event.attendees || []).map(a => a.email?.toLowerCase() || '');
    return deals.find(d => {
      const companyLower = d.company.toLowerCase();
      return summary.includes(companyLower) ||
        attendeeEmails.some(e => e.includes(companyLower.split(' ')[0]));
    });
  };

  const generateBrief = useCallback(async (event: CalendarEvent) => {
    if (!user) return;

    const cacheKey = `call-prep-${event.id}-${format(new Date(), 'yyyy-MM-dd')}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      setBriefs(prev => ({ ...prev, [event.id]: { eventId: event.id, summary: cached, loading: false } }));
      setExpandedEvent(event.id);
      return;
    }

    setBriefs(prev => ({ ...prev, [event.id]: { eventId: event.id, summary: '', loading: true } }));
    setExpandedEvent(event.id);

    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      const attendees = (event.attendees || []).filter(a => !a.self);
      const relatedDeal = findRelatedDeal(event);

      const context = [
        `Meeting: ${event.summary || 'Untitled'}`,
        `Time: ${format(parseISO(event.start), 'h:mm a')} - ${format(parseISO(event.end), 'h:mm a')}`,
        attendees.length > 0 ? `Attendees: ${attendees.map(a => `${a.display_name || a.email}`).join(', ')}` : '',
        event.description ? `Description: ${event.description.slice(0, 500)}` : '',
        relatedDeal ? `Related Deal: ${relatedDeal.company} ($${((relatedDeal.value || 0) / 1e6).toFixed(1)}M) - Stage: ${relatedDeal.stage} - Status: ${relatedDeal.status}` : '',
      ].filter(Boolean).join('\n');

      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/dashboard-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: [{
            role: 'user',
            content: `Generate a concise pre-call briefing for this meeting. Include:
1. **Who** - attendee roles/context if available
2. **Context** - any related deals or history
3. **Talking Points** - 3-5 suggested questions or topics
4. **Prep Notes** - anything to review before the call

Meeting details:
${context}

Keep it concise and actionable. Format with markdown headers.`,
          }],
        }),
      });

      if (!resp.ok) throw new Error('Failed to generate briefing');

      const contentType = resp.headers.get('content-type') || '';
      let content = '';

      if (contentType.includes('application/json')) {
        const json = await resp.json();
        content = json.choices?.[0]?.message?.content || 'No briefing generated.';
      } else if (resp.body) {
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let idx: number;
          while ((idx = buffer.indexOf('\n')) !== -1) {
            let line = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 1);
            if (line.endsWith('\r')) line = line.slice(0, -1);
            if (!line.startsWith('data: ')) continue;
            const jsonStr = line.slice(6).trim();
            if (jsonStr === '[DONE]') break;
            try {
              const parsed = JSON.parse(jsonStr);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                content += delta;
                setBriefs(prev => ({ ...prev, [event.id]: { eventId: event.id, summary: content, loading: true } }));
              }
            } catch {}
          }
        }
      }

      sessionStorage.setItem(cacheKey, content);
      setBriefs(prev => ({ ...prev, [event.id]: { eventId: event.id, summary: content, loading: false } }));
    } catch (err) {
      console.error('Brief generation error:', err);
      setBriefs(prev => ({ ...prev, [event.id]: { eventId: event.id, summary: '', loading: false, error: 'Failed to generate briefing' } }));
    }
  }, [user, deals]);

  const copyBrief = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Prep notes copied');
  };

  if (!calendarStatus?.connected) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Phone className="h-4 w-4 text-primary" />
            Sales Call Prep
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            Connect your calendar in Integrations to see today's calls and AI-generated prep briefs.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (calendarLoading) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-3"><Skeleton className="h-5 w-40" /></CardHeader>
        <CardContent className="space-y-3">
          {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
        </CardContent>
      </Card>
    );
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="h-full">
      <Card className="h-full flex flex-col">
        <CollapsibleTrigger asChild>
          <CardHeader className="pb-2 cursor-pointer hover:bg-muted/50 transition-colors">
            <CardTitle className="text-base font-medium flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-primary" />
                Sales Call Prep
                <Badge variant="secondary" className="text-xs">
                  {todayCalls.length} call{todayCalls.length !== 1 ? 's' : ''}
                </Badge>
              </div>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent className="flex-1 min-h-0 flex flex-col">
          <CardContent className="pt-0 flex-1 min-h-0">
            <ScrollArea className="h-full">
              {todayCalls.length === 0 ? (
                <div className="text-center py-8">
                  <Phone className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No calls scheduled today.</p>
                  <p className="text-xs text-muted-foreground mt-1">Check your calendar for upcoming meetings.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {todayCalls.map(event => {
                    const timeUntil = getTimeUntil(event);
                    const relatedDeal = findRelatedDeal(event);
                    const mainAttendees = (event.attendees || []).filter(a => !a.self);
                    const brief = briefs[event.id];
                    const isExpanded = expandedEvent === event.id;
                    const hasVideo = !!(event.hangout_link || event.conference_data);
                    const isPast = timeUntil === 'Ended';
                    const isNow = timeUntil === 'Now';

                    return (
                      <div
                        key={event.id}
                        className={cn(
                          'rounded-lg border p-3 space-y-2 transition-colors',
                          isNow && 'border-primary/30 bg-primary/5',
                          isPast && 'opacity-50'
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium truncate">{event.summary || 'Untitled'}</p>
                              {hasVideo && <Video className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                            </div>
                            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              <span>{format(parseISO(event.start), 'h:mm a')} – {format(parseISO(event.end), 'h:mm a')}</span>
                              <Badge variant={isNow ? 'default' : 'outline'} className="text-[10px] h-4">
                                {timeUntil}
                              </Badge>
                            </div>
                          </div>
                        </div>

                        {/* Attendees */}
                        {mainAttendees.length > 0 && (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Users className="h-3 w-3 shrink-0" />
                            <span className="truncate">
                              {mainAttendees.slice(0, 3).map(a => a.display_name || a.email).join(', ')}
                              {mainAttendees.length > 3 && ` +${mainAttendees.length - 3}`}
                            </span>
                          </div>
                        )}

                        {/* Related deal */}
                        {relatedDeal && (
                          <Badge variant="outline" className="text-[10px] gap-1">
                            <Building2 className="h-3 w-3" />
                            {relatedDeal.company} · {relatedDeal.stage}
                          </Badge>
                        )}

                        {/* Brief */}
                        {isExpanded && brief && (
                          <div className="mt-2 pt-2 border-t space-y-2">
                            {brief.loading && !brief.summary && (
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <RefreshCw className="h-3 w-3 animate-spin" />
                                Generating briefing...
                              </div>
                            )}
                            {brief.error && (
                              <p className="text-xs text-destructive">{brief.error}</p>
                            )}
                            {brief.summary && (
                              <div className="prose prose-xs max-w-none text-xs [&>h1]:text-sm [&>h2]:text-xs [&>h3]:text-xs [&>p]:text-xs [&>ul]:text-xs">
                                <div dangerouslySetInnerHTML={{ 
                                  __html: DOMPurify.sanitize(
                                    brief.summary
                                      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                                      .replace(/\n/g, '<br/>'),
                                    { USE_PROFILES: { html: true } }
                                  )
                                }} />
                              </div>
                            )}
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex items-center gap-1.5 pt-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            onClick={() => {
                              if (isExpanded && brief) {
                                setExpandedEvent(null);
                              } else {
                                generateBrief(event);
                              }
                            }}
                          >
                            <Sparkles className="h-3 w-3" />
                            {isExpanded ? 'Hide Brief' : 'AI Brief'}
                          </Button>
                          {brief?.summary && isExpanded && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs gap-1"
                                onClick={() => copyBrief(brief.summary)}
                              >
                                <Copy className="h-3 w-3" />
                                Copy
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs gap-1"
                                onClick={() => generateBrief(event)}
                              >
                                <RefreshCw className="h-3 w-3" />
                                Refresh
                              </Button>
                            </>
                          )}
                          {hasVideo && !isPast && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs gap-1 ml-auto"
                              onClick={() => window.open(event.hangout_link || '', '_blank')}
                            >
                              Join
                              <ExternalLink className="h-3 w-3" />
                            </Button>
                          )}
                          {relatedDeal && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => window.location.href = `/deal/${relatedDeal.id}`}
                            >
                              Open Deal
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
