import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, CheckSquare, AlertTriangle, Clock, Video, Users, ExternalLink, ArrowRight, Sun } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useMyTasks, type Task } from '@/hooks/useTasks';
import { useGoogleCalendar, type CalendarEvent } from '@/hooks/useGoogleCalendar';
import { useDealsContext } from '@/contexts/DealsContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useClientContactStaleness } from '@/hooks/useClientContactStaleness';
import { formatSlug } from '@/utils/dealTypeLabels';
import { isToday, parseISO, isPast, format, differenceInDays } from 'date-fns';

/** Marker prefix used to identify briefing messages in the chat */
export const BRIEFING_MARKER = '___MORNING_BRIEFING___';

/** Check if a chat message content string is a morning briefing */
export function isBriefingMessage(content: string): boolean {
  return content.startsWith(BRIEFING_MARKER);
}

/** Check if a user prompt is requesting a morning briefing */
export function isBriefingPrompt(prompt: string): boolean {
  return /\b(morning\s*briefing|daily\s*briefing|my\s*briefing|catch\s*me\s*up|catchup|catch\s*up)\b/i.test(prompt);
}

// ─── Section Components ────────────────────────────────────────

function TasksSection({ tasks }: { tasks: Task[] }) {
  const todayTasks = useMemo(() => {
    return tasks.filter(t => {
      if (t.status === 'done') return false;
      if (!t.due_date) return false;
      return isToday(parseISO(t.due_date));
    }).sort((a, b) => {
      const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
      return (priorityOrder[a.priority] ?? 4) - (priorityOrder[b.priority] ?? 4);
    });
  }, [tasks]);

  const overdueTasks = useMemo(() => {
    return tasks.filter(t => {
      if (t.status === 'done') return false;
      if (!t.due_date) return false;
      return isPast(parseISO(t.due_date)) && !isToday(parseISO(t.due_date));
    });
  }, [tasks]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <CheckSquare className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Today's Tasks</h3>
        <Badge variant="secondary" className="text-[10px] h-5">{todayTasks.length}</Badge>
      </div>

      {overdueTasks.length > 0 && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-2">
          <p className="text-xs font-medium text-destructive mb-1">
            ⚠️ {overdueTasks.length} overdue task{overdueTasks.length !== 1 ? 's' : ''}
          </p>
          {overdueTasks.slice(0, 3).map(task => (
            <Link key={task.id} to={`/tasks/${task.id}`} className="block">
              <div className="flex items-center justify-between py-1 hover:bg-destructive/5 rounded px-1 transition-colors">
                <span className="text-xs text-foreground truncate">{task.title}</span>
                <span className="text-[10px] text-destructive shrink-0 ml-2">
                  {differenceInDays(new Date(), parseISO(task.due_date!))}d overdue
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {todayTasks.length === 0 ? (
        <p className="text-xs text-muted-foreground pl-6">No tasks due today.</p>
      ) : (
        <div className="space-y-1 pl-6">
          {todayTasks.slice(0, 5).map(task => (
            <Link key={task.id} to={`/tasks/${task.id}`} className="block">
              <div className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors">
                <div className={cn(
                  'h-1.5 w-1.5 rounded-full shrink-0',
                  task.priority === 'urgent' || task.priority === 'high' ? 'bg-destructive' :
                  task.priority === 'medium' ? 'bg-amber-500' : 'bg-muted-foreground/40'
                )} />
                <span className="text-xs text-foreground truncate flex-1">{task.title}</span>
                {task.deal?.company && (
                  <Badge variant="outline" className="text-[9px] h-4 px-1.5 shrink-0">{task.deal.company}</Badge>
                )}
              </div>
            </Link>
          ))}
          {todayTasks.length > 5 && (
            <Link to="/tasks" className="text-[10px] text-primary hover:underline pl-2">
              +{todayTasks.length - 5} more →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function MeetingsSection({ events, calendarConnected }: { events: CalendarEvent[]; calendarConnected: boolean }) {
  const todayEvents = useMemo(() => {
    return events
      .filter(e => isToday(parseISO(e.start)))
      .sort((a, b) => parseISO(a.start).getTime() - parseISO(b.start).getTime());
  }, [events]);

  if (!calendarConnected) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Today's Meetings</h3>
        </div>
        <div className="rounded-lg border border-border/40 bg-muted/20 p-3 ml-6">
          <p className="text-xs text-muted-foreground">
            Connect Google Calendar to see your meetings here.
          </p>
          <Link to="/integrations" className="text-xs text-primary hover:underline mt-1 inline-block">
            Connect Calendar →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Calendar className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Today's Meetings</h3>
        <Badge variant="secondary" className="text-[10px] h-5">{todayEvents.length}</Badge>
      </div>

      {todayEvents.length === 0 ? (
        <p className="text-xs text-muted-foreground pl-6">No meetings scheduled for today.</p>
      ) : (
        <div className="space-y-1 pl-6">
          {todayEvents.slice(0, 6).map(event => {
            const hasVideo = !!(event.hangout_link || event.conference_data);
            const externalAttendees = event.attendees?.filter(a => !a.self) || [];

            return (
              <div key={event.id} className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors">
                <span className="text-[11px] text-muted-foreground shrink-0 w-14 text-right font-mono" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {format(parseISO(event.start), 'h:mm a')}
                </span>
                <div className="h-4 w-0.5 rounded-full bg-primary/40 shrink-0" />
                <span className="text-xs text-foreground truncate flex-1">{event.summary}</span>
                {hasVideo && <Video className="h-3 w-3 text-muted-foreground shrink-0" />}
                {externalAttendees.length > 0 && (
                  <span className="text-[10px] text-muted-foreground shrink-0 flex items-center gap-0.5">
                    <Users className="h-2.5 w-2.5" />
                    {externalAttendees.length}
                  </span>
                )}
              </div>
            );
          })}
          {todayEvents.length > 6 && (
            <p className="text-[10px] text-primary pl-2">+{todayEvents.length - 6} more</p>
          )}
        </div>
      )}
    </div>
  );
}

function DealsAttentionSection({ deals }: { deals: { id: string; company: string; status: string; stage: string; reason: string; lastUpdated: string }[] }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-500" />
        <h3 className="text-sm font-semibold text-foreground">Deals Needing Attention</h3>
        {deals.length > 0 && <Badge variant="secondary" className="text-[10px] h-5">{deals.length}</Badge>}
      </div>

      {deals.length === 0 ? (
        <p className="text-xs text-muted-foreground pl-6">All deals are on track. ✅</p>
      ) : (
        <div className="space-y-1.5 pl-6">
          {deals.slice(0, 5).map(deal => (
            <Link key={deal.id} to={`/deal/${deal.id}`} className="block">
              <div className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-foreground truncate">{deal.company}</span>
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[9px] h-4 px-1.5 shrink-0',
                        deal.status === 'at-risk' && 'border-destructive/40 text-destructive',
                        deal.status === 'off-track' && 'border-amber-500/40 text-amber-500'
                      )}
                    >
                      {formatSlug(deal.stage)}
                    </Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate">{deal.reason}</p>
                </div>
                <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
              </div>
            </Link>
          ))}
          {deals.length > 5 && (
            <Link to="/deals" className="text-[10px] text-primary hover:underline pl-2">
              +{deals.length - 5} more →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────

interface MorningBriefingProps {
  /** Optional AI-generated summary to layer on top */
  aiSummary?: string;
}

export function MorningBriefing({ aiSummary }: MorningBriefingProps) {
  const { tasks = [], isLoading: tasksLoading } = useMyTasks('mine');
  const { events, status: calendarStatus, isLoading: calLoading } = useGoogleCalendar();
  const { deals } = useDealsContext();
  const { preferences } = usePreferences();

  const staleDays = preferences.staleDealsDays ?? 14;

  const cadenceInputs = useMemo(
    () => deals
      .filter(d => d.stage !== 'closed-won' && d.stage !== 'closed-lost' && d.contactEmail)
      .map(d => ({ dealId: d.id, contactEmail: d.contactEmail })),
    [deals],
  );
  const staleness = useClientContactStaleness(cadenceInputs);

  const dealsNeedingAttention = useMemo(() => {
    const now = new Date();
    const results: { id: string; company: string; status: string; stage: string; reason: string; lastUpdated: string }[] = [];

    deals.forEach(deal => {
      if (deal.stage === 'closed-won' || deal.stage === 'closed-lost') return;

      const reasons: string[] = [];

      if (deal.status === 'at-risk') reasons.push('Marked at risk');
      if (deal.status === 'off-track') reasons.push('Marked off track');

      if (deal.isFlagged) reasons.push('Flagged for review');

      const daysSinceUpdate = deal.updatedAt ? differenceInDays(now, new Date(deal.updatedAt)) : 999;
      if (daysSinceUpdate >= staleDays) reasons.push(`No update in ${daysSinceUpdate} days`);

      // Check for overdue tasks on this deal
      const dealOverdueTasks = (tasks || []).filter(t =>
        t.deal_id === deal.id && t.status !== 'done' && t.due_date && isPast(parseISO(t.due_date)) && !isToday(parseISO(t.due_date))
      );
      if (dealOverdueTasks.length > 0) reasons.push(`${dealOverdueTasks.length} overdue task${dealOverdueTasks.length !== 1 ? 's' : ''}`);

      const stale = staleness.get(deal.id);
      if (stale?.businessDaysSince != null && stale.businessDaysSince >= 8) {
        reasons.push(`No client contact in ${stale.businessDaysSince} business days — relationship risk`);
      }

      if (reasons.length > 0) {
        results.push({
          id: deal.id,
          company: deal.company || deal.name,
          status: deal.status,
          stage: deal.stage,
          reason: reasons.join(' · '),
          lastUpdated: deal.updatedAt || '',
        });
      }
    });

    // Sort: at-risk first, then by days since update
    return results.sort((a, b) => {
      if (a.status === 'at-risk' && b.status !== 'at-risk') return -1;
      if (b.status === 'at-risk' && a.status !== 'at-risk') return 1;
      return 0;
    });
  }, [deals, tasks, staleDays, staleness]);

  const isLoading = tasksLoading || calLoading;

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <Sun className="h-4 w-4 text-amber-400" />
          <span className="text-sm font-semibold text-foreground">Morning Briefing</span>
        </div>
        {[1, 2, 3].map(i => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-3/4" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Briefing header */}
      <div className="flex items-center gap-2">
        <Sun className="h-4 w-4 text-amber-400" />
        <span className="text-sm font-semibold text-foreground">
          Morning Briefing — {format(new Date(), 'EEEE, MMMM d')}
        </span>
      </div>

      {/* AI summary (optional enhancement) */}
      {aiSummary && (
        <p className="text-xs text-muted-foreground italic border-l-2 border-primary/30 pl-3">
          {aiSummary}
        </p>
      )}

      {/* Structured sections */}
      <div className="space-y-4">
        <TasksSection tasks={tasks} />
        <div className="border-t border-border/20" />
        <MeetingsSection events={events} calendarConnected={calendarStatus.connected} />
        <div className="border-t border-border/20" />
        <DealsAttentionSection deals={dealsNeedingAttention} />
      </div>
    </div>
  );
}
