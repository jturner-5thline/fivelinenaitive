import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { X, ArrowRight, AlertTriangle, Clock, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Slack-Mobile-style "Catch Up" card shown in the bottom-right of the
 * Naitive page on the FIRST page load of the day at/after 7:00 AM ET.
 *
 * Strictly gated to:
 *   - jturner@5thline.co
 *   - nheikali@5thline.co
 *
 * Once-per-user-per-day tracking via localStorage:
 *   localStorage['naitive_catchup_shown_<user_id>'] = 'YYYY-MM-DD' (ET)
 */
const ALLOWED_EMAILS = ['jturner@5thline.co', 'nheikali@5thline.co'] as const;

function getEtParts(date = new Date()): { ymd: string; hour: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const get = (t: string) => parts.find(p => p.type === t)?.value || '';
  return {
    ymd: `${get('year')}-${get('month')}-${get('day')}`,
    hour: parseInt(get('hour'), 10) || 0,
  };
}

function greeting(): string {
  const { hour } = getEtParts();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / 86400000);
}

interface PriorityItem {
  icon: 'overdue' | 'stale' | 'milestone';
  text: string;
}

interface Summary {
  active: number;
  atRisk: number;
  items: PriorityItem[];
}

export function NaitiveCatchUpCard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);

  const allowed = useMemo(
    () => !!user?.email && (ALLOWED_EMAILS as readonly string[]).includes(user.email.toLowerCase()),
    [user?.email],
  );

  // Eligibility gate — runs on every page load/refresh.
  useEffect(() => {
    if (!allowed || !user?.id) return;
    const { ymd, hour } = getEtParts();
    if (hour < 7) return;
    const key = `naitive_catchup_shown_${user.id}`;
    if (localStorage.getItem(key) === ymd) return;

    let cancelled = false;
    (async () => {
      const [data, prof] = await Promise.all([
        fetchSummary(user.id),
        supabase.from('profiles').select('display_name').eq('user_id', user.id).maybeSingle(),
      ]);
      if (cancelled) return;
      setSummary(data);
      setDisplayName((prof.data as any)?.display_name || null);
      // Slide up 0.5s after page is ready.
      setTimeout(() => {
        if (cancelled) return;
        setOpen(true);
        localStorage.setItem(key, ymd);
      }, 500);
    })();

    return () => { cancelled = true; };
  }, [allowed, user?.id]);

  // Auto-dismiss after 30s.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => setOpen(false), 30000);
    return () => clearTimeout(t);
  }, [open]);

  if (!allowed || !open || !summary) return null;

  const firstName =
    (displayName?.split(' ')[0]) ||
    user?.email?.split('@')[0] ||
    'there';

  return (
    <div
      className={cn(
        'fixed bottom-6 right-6 z-50 w-[360px] max-w-[calc(100vw-2rem)]',
        'animate-in slide-in-from-bottom-4 fade-in duration-500',
      )}
    >
      <Card className="relative overflow-hidden border border-border/60 bg-card/95 backdrop-blur-xl shadow-2xl">
        <button
          aria-label="Dismiss"
          onClick={() => setOpen(false)}
          className="absolute top-2.5 right-2.5 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="p-5 space-y-4">
          <div>
            <p className="text-base font-semibold">
              {greeting()}, {firstName}.
            </p>
            <p className="text-sm text-muted-foreground mt-0.5">
              You have <span className="text-foreground font-medium">{summary.active}</span> active deals,{' '}
              <span className="text-foreground font-medium">{summary.atRisk}</span> at risk.
            </p>
          </div>

          {summary.items.length > 0 && (
            <ul className="space-y-2">
              {summary.items.map((it, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="mt-0.5 shrink-0 text-muted-foreground">
                    {it.icon === 'overdue' && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
                    {it.icon === 'stale' && <Clock className="h-3.5 w-3.5 text-amber-500" />}
                    {it.icon === 'milestone' && <Calendar className="h-3.5 w-3.5 text-primary" />}
                  </span>
                  <span className="leading-snug">{it.text}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-center justify-between pt-1">
            <button
              onClick={() => setOpen(false)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Dismiss
            </button>
            <Button
              size="sm"
              onClick={() => { setOpen(false); navigate('/dashboard'); }}
              className="h-8"
            >
              Open full briefing
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

async function fetchSummary(userId: string): Promise<Summary> {
  const now = new Date();

  // Active naitive deals owned by this user (or where they're the manager).
  const { data: deals } = await supabase
    .from('deals')
    .select('id, company, status, stage, updated_at, manager, owned_by, user_id')
    .eq('deal_class', 'naitive');

  const userDeals = (deals || []).filter((d: any) => {
    return d.user_id === userId || d.manager === userId || d.owned_by === userId;
  });
  // If we can't match by user_id (stage names like "Paz"/"James" are stored
  // there), fall back to all naitive deals so the summary is at least useful.
  const scopedDeals = userDeals.length > 0 ? userDeals : (deals || []);

  const isClosed = (s: string) => /closed|won|lost|disqualified/i.test(s || '');
  const active = scopedDeals.filter((d: any) => !isClosed(d.stage));
  const atRisk = active.filter((d: any) => d.status === 'at-risk' || d.status === 'off-track').length;

  // Most stale active deal.
  let stale: { name: string; days: number } | null = null;
  for (const d of active) {
    const days = daysBetween(now, new Date(d.updated_at));
    if (days >= 7 && (!stale || days > stale.days)) {
      stale = { name: d.company, days };
    }
  }

  // Most overdue task assigned to this user.
  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, title, due_date, status, deal_id')
    .eq('assigned_to', userId)
    .not('status', 'in', '(complete,completed,cancelled)')
    .not('due_date', 'is', null)
    .lt('due_date', now.toISOString())
    .order('due_date', { ascending: true })
    .limit(1);

  let overdue: { title: string; deal: string; days: number } | null = null;
  if (tasks && tasks.length > 0) {
    const t: any = tasks[0];
    const dealName = scopedDeals.find((d: any) => d.id === t.deal_id)?.company || '';
    overdue = {
      title: t.title || 'Untitled task',
      deal: dealName,
      days: Math.max(1, daysBetween(now, new Date(t.due_date))),
    };
  }

  // Upcoming milestone (next due, not completed) on user's deals.
  let milestone: { title: string; whenLabel: string } | null = null;
  if (scopedDeals.length > 0) {
    const dealIds = scopedDeals.map((d: any) => d.id);
    const { data: ms } = await supabase
      .from('deal_milestones')
      .select('title, due_date, completed, deal_id')
      .in('deal_id', dealIds)
      .eq('completed', false)
      .not('due_date', 'is', null)
      .gte('due_date', now.toISOString().slice(0, 10))
      .order('due_date', { ascending: true })
      .limit(1);
    if (ms && ms.length > 0) {
      const m: any = ms[0];
      const due = new Date(m.due_date);
      const days = Math.max(0, daysBetween(due, now));
      milestone = {
        title: m.title || 'Milestone',
        whenLabel: days === 0 ? 'today' : days === 1 ? 'in 1 day' : `in ${days} days`,
      };
    }
  }

  const items: PriorityItem[] = [];
  if (overdue) {
    items.push({
      icon: 'overdue',
      text: `${overdue.title}${overdue.deal ? ` on ${overdue.deal}` : ''} — overdue by ${overdue.days} day${overdue.days === 1 ? '' : 's'}`,
    });
  }
  if (stale) {
    items.push({ icon: 'stale', text: `${stale.name} — no activity in ${stale.days} days` });
  }
  if (milestone) {
    items.push({ icon: 'milestone', text: `${milestone.title} ${milestone.whenLabel}` });
  }

  return { active: active.length, atRisk, items: items.slice(0, 3) };
}