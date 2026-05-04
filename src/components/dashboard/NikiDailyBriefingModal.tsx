import { useEffect, useMemo, useState } from 'react';
import { format, formatDistanceToNow, parseISO } from 'date-fns';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Briefcase, ListTodo, Building2, AlertTriangle, Calendar,
  ExternalLink, Clock, RefreshCw, Flag,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

type SectionKey = 'deals' | 'tasks' | 'lenders' | 'outstanding' | 'meetings';

interface NikiBriefingData {
  myDeals: Array<{
    id: string; company: string; stage: string; status: string; role: string;
    outstandingCount: number; lastActivity: string | null; nextMilestone: string | null;
    nextFollowUpAt: string | null; closingDate: string | null;
    atRisk: boolean; stale: boolean;
  }>;
  myTasks: Array<{
    id: string; title: string; dueDate: string | null;
    dealId: string | null; dealName: string | null; overdue: boolean; priority: string;
  }>;
  lenderSignals: Array<{
    kind: 'lender' | 'claap'; lenderName: string; dealId: string;
    dealName: string; change: string; at: string;
  }>;
  outstandingNeedsAttn: Array<{
    id: string; description: string; dealId: string; dealName: string;
    dueDate: string | null; assignedTo: string | null; overdue: boolean;
  }>;
  meetings: Array<{
    id: string; title: string; start: string; end: string;
    attendees: { email: string; name: string | null }[];
    linkedDeal: { id: string; company: string } | null;
  }>;
  calendarConnected: boolean;
  calendarReason: string | null;
  generatedAt: string;
  isSelf: boolean;
}

const GLASS_CARD = 'glass-surface-1 backdrop-blur-xl glass-border-softer rounded-lg';

function SectionHeader({
  icon: Icon, title, count, accent,
}: { icon: any; title: string; count?: number; accent?: string }) {
  return (
    <div className="flex items-center gap-2 mb-3 px-1">
      <div className={cn('p-1.5 rounded-md', accent || 'bg-primary/10')}>
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <h3 className="text-sm font-semibold text-foreground tracking-tight">{title}</h3>
      {typeof count === 'number' && (
        <Badge variant="secondary" className="text-[10px] tabular-nums">{count}</Badge>
      )}
    </div>
  );
}

function EmptyMsg({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs text-muted-foreground/60 py-4 text-center">{children}</div>
  );
}

function fmtDate(d?: string | null) {
  if (!d) return null;
  try { return format(parseISO(d), 'MMM d'); } catch { return null; }
}
function fmtRelative(d?: string | null) {
  if (!d) return null;
  try { return formatDistanceToNow(parseISO(d), { addSuffix: true }); } catch { return null; }
}
function fmtTime(d?: string | null) {
  if (!d) return null;
  try { return format(parseISO(d), 'h:mm a'); } catch { return null; }
}

export function NikiDailyBriefingModal({
  open, onOpenChange, title = "My Daily Briefing",
}: { open: boolean; onOpenChange: (o: boolean) => void; title?: string }) {
  const navigate = useNavigate();
  const [data, setData] = useState<NikiBriefingData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true); setError(null);
    try {
      const { data: res, error: err } = await supabase.functions.invoke('niki-briefing');
      if (err) throw err;
      if (res?.error) throw new Error(res.error);
      setData(res as NikiBriefingData);
    } catch (e: any) {
      setError(e?.message || 'Failed to load briefing');
    } finally { setLoading(false); }
  };

  useEffect(() => {
    if (open) fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const go = (path: string) => { onOpenChange(false); navigate(path); };

  // Group tasks by deal
  const tasksByDeal = useMemo(() => {
    const m = new Map<string, NikiBriefingData['myTasks']>();
    (data?.myTasks || []).forEach((t) => {
      const k = t.dealName || 'No deal';
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(t);
    });
    return Array.from(m.entries());
  }, [data]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'max-w-[95vw] w-[95vw] h-[92vh] max-h-[92vh] p-0 overflow-hidden rounded-2xl',
          'bg-background/60 backdrop-blur-3xl border-transparent glass-border-soft',
          'shadow-[0_32px_80px_-20px_hsl(var(--primary)/0.25),inset_0_1px_0_hsl(0_0%_100%/0.04)]',
        )}
        overlayClassName="bg-black/80"
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="px-6 pt-4 pb-3 glass-divider-b glass-surface-1 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-foreground tracking-tight">{title}</h2>
              <p className="text-xs text-muted-foreground/60 mt-0.5">
                Scoped to deals where Niki is Manager or Analyst • {format(new Date(), 'EEEE, MMM d')}
              </p>
            </div>
            <Button
              variant="ghost" size="sm"
              onClick={fetchData}
              disabled={loading}
              className="text-xs gap-1.5"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
              Refresh
            </Button>
          </div>

          <ScrollArea className="flex-1 px-6 py-5">
            {error && (
              <div className="mb-4 text-xs text-destructive bg-destructive/10 rounded-lg p-3 border border-destructive/30">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

              {/* 1. MY DEALS */}
              <section className={cn(GLASS_CARD, 'p-4')}>
                <SectionHeader icon={Briefcase} title="My Deals" count={data?.myDeals.length} />
                {loading && !data ? (
                  <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 rounded-lg bg-white/[0.04]" />)}</div>
                ) : !data?.myDeals.length ? (
                  <EmptyMsg>No deals assigned to Niki as Manager or Analyst.</EmptyMsg>
                ) : (
                  <div className="space-y-1.5">
                    {data.myDeals.map((d) => (
                      <button
                        key={d.id}
                        onClick={() => go(`/deal/${d.id}`)}
                        className="w-full text-left glass-surface-1 glass-border-softer rounded-lg p-3 hover:bg-white/[0.06] transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-sm font-medium text-foreground truncate">{d.company}</span>
                              <Badge variant="outline" className="text-[9px] py-0 px-1.5 glass-border-soft">{d.role}</Badge>
                              {d.atRisk && (
                                <Badge variant="destructive" className="text-[9px] py-0 px-1.5 gap-0.5">
                                  <Flag className="h-2.5 w-2.5" /> At Risk
                                </Badge>
                              )}
                              {d.stale && (
                                <Badge className="text-[9px] py-0 px-1.5 bg-amber-500/15 text-amber-300 border-amber-500/30">Stale 7d+</Badge>
                              )}
                            </div>
                            <p className="text-[11px] text-muted-foreground/70 mt-1 truncate">
                              {d.stage} · {d.status}
                              {d.nextMilestone ? ` · Next: ${d.nextMilestone}` : ''}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-[10px] text-muted-foreground/60">{fmtRelative(d.lastActivity)}</div>
                            <div className="text-[10px] text-muted-foreground/60 mt-0.5">
                              {d.outstandingCount} open
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </section>

              {/* 2. MY TASKS */}
              <section className={cn(GLASS_CARD, 'p-4')}>
                <SectionHeader icon={ListTodo} title="My Tasks Due Today / Overdue" count={data?.myTasks.length} />
                {loading && !data ? (
                  <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 rounded-lg bg-white/[0.04]" />)}</div>
                ) : !data?.myTasks.length ? (
                  <EmptyMsg>No tasks due today or overdue.</EmptyMsg>
                ) : (
                  <div className="space-y-3">
                    {tasksByDeal.map(([dealName, tasks]) => (
                      <div key={dealName}>
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1.5 px-1">{dealName}</div>
                        <div className="space-y-1">
                          {tasks.map((t) => (
                            <div key={t.id} className="glass-surface-1 glass-border-softer rounded-lg p-2.5 flex items-center justify-between gap-2">
                              <span className="text-sm text-foreground truncate">{t.title}</span>
                              <Badge
                                variant={t.overdue ? 'destructive' : 'secondary'}
                                className="text-[10px] shrink-0"
                              >
                                {t.overdue ? `Overdue · ${fmtDate(t.dueDate)}` : 'Due today'}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* 3. LENDER ACTIVITY */}
              <section className={cn(GLASS_CARD, 'p-4')}>
                <SectionHeader icon={Building2} title="Lender Activity (last 24h)" count={data?.lenderSignals.length} />
                {loading && !data ? (
                  <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 rounded-lg bg-white/[0.04]" />)}</div>
                ) : !data?.lenderSignals.length ? (
                  <EmptyMsg>No lender signals on your deals in the last 24 hours.</EmptyMsg>
                ) : (
                  <div className="space-y-1.5">
                    {data.lenderSignals.slice(0, 20).map((s, i) => (
                      <button
                        key={`${s.kind}-${i}`}
                        onClick={() => go(`/deal/${s.dealId}`)}
                        className="w-full text-left glass-surface-1 glass-border-softer rounded-lg p-2.5 hover:bg-white/[0.06] transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm text-foreground truncate">
                            <span className="font-medium">{s.lenderName}</span>
                            <span className="text-muted-foreground"> on </span>
                            <span className="font-medium">{s.dealName || 'deal'}</span>
                          </span>
                          <span className="text-[10px] text-muted-foreground/60 shrink-0">{fmtRelative(s.at)}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground/70 mt-0.5 truncate">{s.change}</p>
                      </button>
                    ))}
                  </div>
                )}
              </section>

              {/* 4. OUTSTANDING ITEMS */}
              <section className={cn(GLASS_CARD, 'p-4')}>
                <SectionHeader icon={AlertTriangle} title="Outstanding Items Needing Attention" count={data?.outstandingNeedsAttn.length} />
                {loading && !data ? (
                  <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 rounded-lg bg-white/[0.04]" />)}</div>
                ) : !data?.outstandingNeedsAttn.length ? (
                  <EmptyMsg>No overdue or unassigned outstanding items.</EmptyMsg>
                ) : (
                  <div className="space-y-1.5">
                    {data.outstandingNeedsAttn.slice(0, 20).map((it) => (
                      <button
                        key={it.id}
                        onClick={() => go(`/deal/${it.dealId}`)}
                        className="w-full text-left glass-surface-1 glass-border-softer rounded-lg p-2.5 hover:bg-white/[0.06] transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm text-foreground truncate">{it.description}</span>
                          <div className="flex items-center gap-1 shrink-0">
                            {it.overdue && it.dueDate && (
                              <Badge variant="destructive" className="text-[10px]">Overdue · {fmtDate(it.dueDate)}</Badge>
                            )}
                            {!it.assignedTo && (
                              <Badge className="text-[10px] bg-amber-500/15 text-amber-300 border-amber-500/30">Unassigned</Badge>
                            )}
                          </div>
                        </div>
                        <p className="text-[11px] text-muted-foreground/70 mt-0.5 truncate">{it.dealName}</p>
                      </button>
                    ))}
                  </div>
                )}
              </section>

              {/* 5. TODAY'S MEETINGS */}
              <section className={cn(GLASS_CARD, 'p-4 lg:col-span-2')}>
                <SectionHeader icon={Calendar} title="Today's Meetings" count={data?.meetings.length} />
                {loading && !data ? (
                  <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 rounded-lg bg-white/[0.04]" />)}</div>
                ) : data && !data.calendarConnected ? (
                  <div className="text-xs text-muted-foreground/70 py-4 text-center space-y-2">
                    <p>{data.calendarReason || 'Calendar not connected.'}</p>
                    {data.isSelf && (
                      <Button size="sm" variant="outline" onClick={() => go('/integrations')}>
                        <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Connect Google Calendar
                      </Button>
                    )}
                  </div>
                ) : !data?.meetings.length ? (
                  <EmptyMsg>No meetings scheduled today.</EmptyMsg>
                ) : (
                  <div className="space-y-1.5">
                    {data.meetings.map((m) => (
                      <div key={m.id} className="glass-surface-1 glass-border-softer rounded-lg p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-foreground truncate">{m.title}</span>
                              {m.linkedDeal && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] cursor-pointer hover:bg-primary/10"
                                  onClick={() => go(`/deal/${m.linkedDeal!.id}`)}
                                >
                                  Linked: {m.linkedDeal.company}
                                </Badge>
                              )}
                            </div>
                            <p className="text-[11px] text-muted-foreground/70 mt-0.5 truncate">
                              {m.attendees.length
                                ? m.attendees.slice(0, 4).map((a) => a.name || a.email).join(', ')
                                + (m.attendees.length > 4 ? ` +${m.attendees.length - 4}` : '')
                                : 'No attendees'}
                            </p>
                          </div>
                          <div className="text-right shrink-0 text-[11px] text-muted-foreground/80 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {fmtTime(m.start)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default NikiDailyBriefingModal;