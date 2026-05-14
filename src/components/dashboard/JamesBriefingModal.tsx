import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  Newspaper, Calendar as CalIcon, Mail, ListChecks, AlertTriangle,
  Sparkles, ExternalLink, Clock, X, RefreshCw,
} from 'lucide-react';
import { format, formatDistanceToNow, isToday, isPast, differenceInDays, parseISO } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useDealsContext } from '@/contexts/DealsContext';
import { useGoogleCalendar, type CalendarEvent } from '@/hooks/useGoogleCalendar';
import { detectPrioritySignals, getSignalSeverity } from '@/lib/emailPrioritySignals';
import { isExcludedDealName } from '@/utils/excludedDeals';
import type { Task } from '@/hooks/useTasks';
import type { Deal } from '@/types/deal';
import { cn } from '@/lib/utils';

interface JamesBriefingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const GLASS_CARD = 'glass-surface-1 backdrop-blur-xl glass-border-softer rounded-xl';
const GLASS_ROW = 'glass-surface-1 glass-border-softer rounded-lg backdrop-blur-sm';

// ── Helpers ──────────────────────────────────────────────────────────
function isStaleDeal(d: Deal & { lastActivityAt?: string }): { stale: boolean; days: number } {
  const ref = d.lastActivityAt || d.updatedAt || d.createdAt;
  if (!ref) return { stale: false, days: 0 };
  const days = Math.floor((Date.now() - new Date(ref).getTime()) / 86_400_000);
  return { stale: days >= 7, days };
}

function priorityScore(d: Deal & { outstandingCount?: number; lastActivityAt?: string }): number {
  let score = 0;
  if (d.isFlagged) score += 100;
  const { stale, days } = isStaleDeal(d);
  if (stale) score += 40 + Math.min(days, 30);
  score += (d.outstandingCount || 0) * 5;
  if ((d.value || 0) > 0) score += Math.min(20, (d.value || 0) / 1_000_000);
  return score;
}

// ── Pipeline data: deals + outstanding counts + last activity ────────
function usePipelineSummary(enabled: boolean) {
  const { deals } = useDealsContext();
  const activeDeals = useMemo(
    () => deals.filter((d) => {
      const status = (d.status || '').toLowerCase().replace(/_/g, '-');
      // Only include deals in active pipeline statuses. Exclude funded,
      // closed, archived, off-track, and any other terminal/inactive status.
      const allowed = ['on-track', 'at-risk', 'on-hold'];
      return allowed.includes(status)
        && !isExcludedDealName(d.name)
        && !isExcludedDealName(d.company);
    }),
    [deals],
  );
  const dealIds = useMemo(() => activeDeals.map((d) => d.id), [activeDeals]);

  return useQuery({
    queryKey: ['james-pipeline-summary', dealIds.join(',')],
    enabled: enabled && dealIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const [outstandingRes, activityRes, milestoneRes] = await Promise.all([
        supabase
          .from('outstanding_items')
          .select('deal_id, status')
          .in('deal_id', dealIds)
          .neq('status', 'completed'),
        supabase
          .from('activity_logs')
          .select('deal_id, created_at')
          .in('deal_id', dealIds)
          .order('created_at', { ascending: false })
          .limit(500),
        supabase
          .from('deal_milestones')
          .select('deal_id, title, due_date, completed')
          .in('deal_id', dealIds)
          .eq('completed', false),
      ]);

      const outstandingByDeal = new Map<string, number>();
      for (const row of outstandingRes.data || []) {
        outstandingByDeal.set(row.deal_id, (outstandingByDeal.get(row.deal_id) || 0) + 1);
      }
      const lastActivityByDeal = new Map<string, string>();
      for (const row of activityRes.data || []) {
        if (!lastActivityByDeal.has(row.deal_id)) {
          lastActivityByDeal.set(row.deal_id, row.created_at);
        }
      }
      const nextMilestoneByDeal = new Map<string, { title: string; due: string | null }>();
      for (const m of milestoneRes.data || []) {
        const existing = nextMilestoneByDeal.get(m.deal_id);
        const md = m.due_date ? new Date(m.due_date).getTime() : Infinity;
        const ed = existing?.due ? new Date(existing.due).getTime() : Infinity;
        if (!existing || md < ed) {
          nextMilestoneByDeal.set(m.deal_id, { title: m.title, due: m.due_date });
        }
      }

      const enriched = activeDeals.map((d) => ({
        ...d,
        outstandingCount: outstandingByDeal.get(d.id) || 0,
        lastActivityAt: lastActivityByDeal.get(d.id) || d.updatedAt,
        nextMilestone: nextMilestoneByDeal.get(d.id) || null,
      }));

      enriched.sort((a, b) => priorityScore(b) - priorityScore(a));
      return enriched;
    },
  });
}

// ── Calendar (today) ────────────────────────────────────────────────
function useTodaysCalendar(enabled: boolean) {
  const { listEvents, status } = useGoogleCalendar();
  return useQuery({
    queryKey: ['james-cal-today', status?.connected],
    enabled: enabled && status?.connected === true,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      const result = await listEvents({
        timeMin: start.toISOString(),
        timeMax: end.toISOString(),
        maxResults: 50,
      });
      return (result?.events || []) as CalendarEvent[];
    },
  });
}

// ── Email signals (last 24h) ────────────────────────────────────────
function useEmailSignals(enabled: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['james-email-signals', user?.id],
    enabled: enabled && !!user?.id,
    staleTime: 2 * 60_000,
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('email_cache')
        .select('id, subject, snippet, body_text, from_email, from_name, received_at, thread_id')
        .eq('user_id', user!.id)
        .gte('received_at', since)
        .order('received_at', { ascending: false })
        .limit(80);
      if (error) throw error;
      const matched = (data || [])
        .map((e) => {
          const signals = detectPrioritySignals({
            subject: e.subject,
            body: e.body_text || e.snippet,
          });
          return signals.length ? { ...e, signal: signals[0] } : null;
        })
        .filter(Boolean) as Array<any>;
      return matched;
    },
  });
}

// ── Tasks: due today / overdue ──────────────────────────────────────
function useJamesTasks(enabled: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['james-tasks-today', user?.id],
    enabled: enabled && !!user?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const today = new Date();
      const todayStr = today.toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from('tasks')
        .select('*, deal:deals(company)')
        .eq('assigned_to', user!.id)
        .is('archived_at', null)
        .neq('status', 'complete')
        .not('due_date', 'is', null)
        .lte('due_date', todayStr)
        .order('due_date', { ascending: true });
      if (error) throw error;
      return (data || []) as Task[];
    },
  });
}

// ── Email/lender → deal matching ────────────────────────────────────
function matchEmailToDeal(email: any, deals: Deal[]): Deal | null {
  const fromEmail = (email.from_email || '').toLowerCase();
  const fromName = (email.from_name || '').toLowerCase();
  const subj = (email.subject || '').toLowerCase();
  const fromDomain = fromEmail.split('@')[1] || '';
  for (const d of deals) {
    const company = (d.company || '').toLowerCase();
    const name = (d.name || '').toLowerCase();
    if (company && (subj.includes(company) || fromName.includes(company))) return d;
    if (name && subj.includes(name)) return d;
    if (fromDomain && company && fromDomain.includes(company.split(' ')[0])) return d;
  }
  return null;
}

function matchAttendeeToDeal(attendeeEmail: string, deals: Deal[]): Deal | null {
  const e = attendeeEmail.toLowerCase();
  const dom = e.split('@')[1] || '';
  for (const d of deals) {
    const company = (d.company || '').toLowerCase();
    if (!company) continue;
    if (dom && dom.includes(company.split(' ')[0])) return d;
    if ((d.contactInfo || '').toLowerCase().includes(e)) return d;
  }
  return null;
}

// ── Top Priority (AI) ───────────────────────────────────────────────
function useTopPriority(enabled: boolean, snapshot: any) {
  return useQuery({
    queryKey: ['james-top-priority', snapshot?.fingerprint],
    enabled: enabled && !!snapshot,
    staleTime: 5 * 60_000,
    retry: 0,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('james-top-priority', {
        body: { context: snapshot },
      });
      if (error) throw error;
      return (data?.priority as string) || '';
    },
  });
}

// ── Sub-section components ──────────────────────────────────────────
function SectionHeader({ icon: Icon, title, count, subtitle }: any) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold tracking-tight text-foreground">{title}</h3>
        {typeof count === 'number' && (
          <Badge variant="secondary" className="text-[10px] h-5">{count}</Badge>
        )}
      </div>
      {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
    </div>
  );
}

// ── Modal ───────────────────────────────────────────────────────────
export function JamesBriefingModal({ open, onOpenChange }: JamesBriefingModalProps) {
  const navigate = useNavigate();
  const { deals } = useDealsContext();

  const pipelineQ = usePipelineSummary(open);
  const calendarQ = useTodaysCalendar(open);
  const emailQ = useEmailSignals(open);
  const tasksQ = useJamesTasks(open);

  const enrichedDeals = pipelineQ.data || [];
  const events = calendarQ.data || [];
  const signals = emailQ.data || [];
  const tasks = tasksQ.data || [];

  // Matched signals → deals
  const matchedSignals = useMemo(() => {
    return signals.map((e: any) => ({ ...e, linkedDeal: matchEmailToDeal(e, deals) }));
  }, [signals, deals]);
  const topSignals = matchedSignals.slice(0, 5);

  // Tasks grouped by deal
  const tasksByDeal = useMemo(() => {
    const groups = new Map<string, { dealName: string; items: Task[] }>();
    for (const t of tasks) {
      const key = t.deal_id || 'no-deal';
      const dealName = (t as any).deal?.company || 'No Deal';
      const g = groups.get(key) || { dealName, items: [] };
      g.items.push(t);
      groups.set(key, g);
    }
    return Array.from(groups.values());
  }, [tasks]);

  // Snapshot for AI top priority (lightweight)
  const snapshot = useMemo(() => {
    if (!pipelineQ.data || !calendarQ.isFetched || !emailQ.isFetched || !tasksQ.isFetched) return null;
    const top5Deals = enrichedDeals.slice(0, 5).map((d: any) => ({
      name: d.company,
      stage: d.stage,
      flagged: !!d.isFlagged,
      outstanding: d.outstandingCount,
      staleDays: isStaleDeal(d).days,
      nextMilestone: d.nextMilestone,
    }));
    const ctx = {
      deals: top5Deals,
      events: events.slice(0, 5).map((e) => ({ time: e.start, title: e.summary })),
      signals: topSignals.slice(0, 5).map((s: any) => ({
        from: s.from_name || s.from_email,
        subject: s.subject,
        signal: s.signal?.label,
        deal: s.linkedDeal?.company,
      })),
      tasks: tasks.slice(0, 8).map((t) => ({
        title: t.title,
        due: t.due_date,
        deal: (t as any).deal?.company,
      })),
    };
    return { ...ctx, fingerprint: JSON.stringify(ctx).slice(0, 200) };
  }, [enrichedDeals, events, topSignals, tasks, pipelineQ.data, calendarQ.isFetched, emailQ.isFetched, tasksQ.isFetched]);

  const priorityQ = useTopPriority(open, snapshot);

  const isLoading = pipelineQ.isLoading || calendarQ.isLoading || emailQ.isLoading || tasksQ.isLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(
        'popup-shell-surface max-w-[95vw] w-[95vw] h-[92vh] max-h-[92vh] p-0 overflow-hidden rounded-2xl border-transparent',
      )}>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 shrink-0">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center">
                <Newspaper className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-foreground">James's Daily Rundown</h2>
                <p className="text-xs text-muted-foreground">{format(new Date(), 'EEEE, MMMM d')}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost" size="sm"
                onClick={() => {
                  pipelineQ.refetch(); calendarQ.refetch(); emailQ.refetch(); tasksQ.refetch();
                }}
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onOpenChange(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-6 space-y-6">
              {/* 5. TOP PRIORITY (rendered first as a hero callout) */}
              <div className={cn(GLASS_CARD, 'p-5 border-l-4 border-l-primary')}>
                <div className="flex items-start gap-3">
                  <Sparkles className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-primary mb-1">
                      Today's #1 Priority
                    </p>
                    {priorityQ.isLoading || !snapshot ? (
                      <Skeleton className="h-5 w-3/4" />
                    ) : priorityQ.data ? (
                      <p className="text-base font-medium text-foreground leading-snug">
                        {priorityQ.data}
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No urgent priority detected. You're in good shape.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* 1. DEAL PIPELINE SUMMARY */}
              <div className={cn(GLASS_CARD, 'p-5')}>
                <SectionHeader
                  icon={ListChecks}
                  title="Deal Pipeline Summary"
                  count={enrichedDeals.length}
                  subtitle="Sorted by priority"
                />
                {pipelineQ.isLoading ? (
                  <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
                ) : enrichedDeals.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No active deals.</p>
                ) : (
                  <div className="space-y-2">
                    {enrichedDeals.slice(0, 12).map((d: any) => {
                      const { stale, days } = isStaleDeal(d);
                      return (
                        <button
                          key={d.id}
                          onClick={() => { onOpenChange(false); navigate(`/deal/${d.id}`); }}
                          className={cn(GLASS_ROW, 'w-full text-left px-4 py-3 hover:bg-white/[0.03] transition-colors')}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium text-foreground truncate">{d.company}</span>
                                <Badge variant="outline" className="text-[10px] h-5">{d.stage}</Badge>
                                {d.isFlagged && (
                                  <Badge className="text-[10px] h-5 bg-destructive/15 text-destructive border-destructive/30 hover:bg-destructive/15">
                                    <AlertTriangle className="h-2.5 w-2.5 mr-1" /> At Risk
                                  </Badge>
                                )}
                                {stale && (
                                  <Badge className="text-[10px] h-5 bg-amber-500/15 text-amber-500 border-amber-500/30 hover:bg-amber-500/15">
                                    Stale {days}d
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground flex-wrap">
                                <span>{d.outstandingCount} outstanding</span>
                                {d.lastActivityAt && (
                                  <span className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {formatDistanceToNow(new Date(d.lastActivityAt), { addSuffix: true })}
                                  </span>
                                )}
                                {d.nextMilestone?.due && (
                                  <span>Next: {d.nextMilestone.title} · {format(new Date(d.nextMilestone.due), 'MMM d')}</span>
                                )}
                              </div>
                            </div>
                            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 2. TODAY'S CALENDAR */}
              <div className={cn(GLASS_CARD, 'p-5')}>
                <SectionHeader icon={CalIcon} title="Today's Calendar" count={events.length} />
                {calendarQ.isLoading ? (
                  <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
                ) : events.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No events scheduled today.</p>
                ) : (
                  <div className="space-y-2">
                    {events.map((e) => {
                      const linkedDeal = (e.attendees || [])
                        .map((a) => matchAttendeeToDeal(a.email, deals))
                        .find(Boolean);
                      const startStr = e.all_day ? 'All day' : format(parseISO(e.start), 'h:mm a');
                      return (
                        <div key={e.id} className={cn(GLASS_ROW, 'px-4 py-2.5')}>
                          <div className="flex items-start gap-3">
                            <div className="text-xs font-mono text-muted-foreground w-16 shrink-0 mt-0.5">{startStr}</div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium text-foreground truncate">{e.summary || '(no title)'}</span>
                                {linkedDeal && (
                                  <Badge variant="outline" className="text-[10px] h-5 border-primary/40 text-primary">
                                    {linkedDeal.company}
                                  </Badge>
                                )}
                              </div>
                              {e.attendees && e.attendees.length > 0 && (
                                <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                                  {e.attendees.slice(0, 4).map((a) => a.display_name || a.email).join(', ')}
                                  {e.attendees.length > 4 && ` +${e.attendees.length - 4}`}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 3. EMAIL SIGNALS */}
              <div className={cn(GLASS_CARD, 'p-5')}>
                <SectionHeader icon={Mail} title="Email Signals" count={topSignals.length} subtitle="Last 24 hours" />
                {emailQ.isLoading ? (
                  <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
                ) : topSignals.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No deal signals in the last 24 hours.</p>
                ) : (
                  <div className="space-y-2">
                    {topSignals.map((s: any) => {
                      const sev = getSignalSeverity(s.signal.type);
                      return (
                        <div key={s.id} className={cn(GLASS_ROW, 'px-4 py-2.5')}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium text-foreground truncate">
                                  {s.from_name || s.from_email}
                                </span>
                                <Badge className={cn(
                                  'text-[10px] h-5',
                                  sev === 'urgent'
                                    ? 'bg-destructive/15 text-destructive border-destructive/30 hover:bg-destructive/15'
                                    : 'bg-amber-500/15 text-amber-500 border-amber-500/30 hover:bg-amber-500/15',
                                )}>
                                  {s.signal.label}
                                </Badge>
                                {s.linkedDeal && (
                                  <Badge variant="outline" className="text-[10px] h-5 border-primary/40 text-primary">
                                    {s.linkedDeal.company}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-[11px] text-muted-foreground truncate mt-0.5">{s.subject}</p>
                            </div>
                            <span className="text-[10px] text-muted-foreground shrink-0">
                              {s.received_at && formatDistanceToNow(new Date(s.received_at), { addSuffix: true })}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 4. TASKS DUE TODAY / OVERDUE */}
              <div className={cn(GLASS_CARD, 'p-5')}>
                <SectionHeader icon={ListChecks} title="Tasks Due Today / Overdue" count={tasks.length} />
                {tasksQ.isLoading ? (
                  <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
                ) : tasksByDeal.length === 0 ? (
                  <p className="text-sm text-muted-foreground">All caught up — nothing due today.</p>
                ) : (
                  <div className="space-y-3">
                    {tasksByDeal.map((g) => (
                      <div key={g.dealName}>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                          {g.dealName}
                        </p>
                        <div className="space-y-1.5">
                          {g.items.map((t) => {
                            const due = t.due_date ? new Date(t.due_date + 'T00:00:00') : null;
                            const overdue = due && isPast(due) && !isToday(due);
                            return (
                              <button
                                key={t.id}
                                onClick={() => { onOpenChange(false); navigate(`/tasks/${t.id}`); }}
                                className={cn(GLASS_ROW, 'w-full text-left px-4 py-2 hover:bg-white/[0.03] transition-colors')}
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <span className="text-sm text-foreground truncate flex-1">{t.title}</span>
                                  <span className={cn(
                                    'text-[10px] shrink-0',
                                    overdue ? 'text-destructive font-medium' : 'text-muted-foreground',
                                  )}>
                                    {due ? format(due, 'MMM d') : ''}
                                    {overdue && ' · Overdue'}
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}