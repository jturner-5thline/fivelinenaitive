import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sun, AlertTriangle, Clock, ListChecks, Star, X, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useDealsContext } from '@/contexts/DealsContext';
import { useMyTasks } from '@/hooks/useTasks';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { differenceInDays, format, isPast, isToday, parseISO } from 'date-fns';

/** Marker prefix used to identify Morning Intelligence Brief messages in the chat. */
export const INTEL_BRIEF_MARKER = '___MORNING_INTEL_BRIEF___';

export function isIntelBriefMessage(content: string): boolean {
  return content.startsWith(INTEL_BRIEF_MARKER);
}

/** localStorage key for the last delivery date (per user, ET-day). */
export function intelBriefStorageKey(userId: string | undefined | null): string {
  return `intelBrief:lastShown:${userId || 'anon'}`;
}

/** Returns YYYY-MM-DD in America/New_York for the given moment. */
export function etDateKey(d: Date = new Date()): string {
  // en-CA gives ISO YYYY-MM-DD format
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** Returns the current hour (0-23) in America/New_York. */
export function etHour(d: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const h = parts.find((p) => p.type === 'hour')?.value || '0';
  const n = parseInt(h, 10);
  return Number.isFinite(n) ? n % 24 : 0;
}

/**
 * Decide whether to auto-fire the Morning Intelligence Brief on chat mount.
 * Rules:
 *  - Only once per ET day per user
 *  - Trigger if currently between 6am–9am ET, OR on first open later in the day
 *  - Do not trigger before 6am ET (user is asleep)
 */
export function shouldAutoShowIntelBrief(userId: string | undefined | null, now: Date = new Date()): boolean {
  if (!userId) return false;
  const hour = etHour(now);
  if (hour < 6) return false;
  try {
    const last = window.localStorage.getItem(intelBriefStorageKey(userId));
    if (last === etDateKey(now)) return false;
  } catch {
    // ignore storage errors
  }
  return true;
}

export function markIntelBriefShown(userId: string | undefined | null, now: Date = new Date()) {
  if (!userId) return;
  try {
    window.localStorage.setItem(intelBriefStorageKey(userId), etDateKey(now));
  } catch {
    // ignore
  }
}

// ─── Types ───────────────────────────────────────────────────────────────

type DealItem = {
  id: string;
  company: string;
  reason: string;
  reasonKind: 'status_overdue' | 'lender_stale' | 'milestone' | 'stage_stale' | 'flagged';
  daysSince?: number;
};

type StaleLenderItem = {
  dealId: string;
  dealName: string;
  lenderName: string;
  daysSince: number;
};

type IntelBriefData = {
  loading: boolean;
  deals: DealItem[];
  staleLenders: StaleLenderItem[];
  overdueTaskCount: number;
  topPriority: { label: string; href?: string; prompt?: string } | null;
};

const STATUS_NOTE_OVERDUE_DAYS = 5;
const LENDER_STALE_DAYS = 7;
const STAGE_STALE_DAYS = 14;

// ─── Hook: aggregates data for the brief ─────────────────────────────────

function useIntelBriefData(): IntelBriefData {
  const { deals } = useDealsContext();
  const { tasks = [], isLoading: tasksLoading } = useMyTasks('mine');
  const [staleLenders, setStaleLenders] = useState<StaleLenderItem[]>([]);
  const [staleNoteByDeal, setStaleNoteByDeal] = useState<Record<string, number>>({});
  const [lendersLoading, setLendersLoading] = useState(true);

  const activeDeals = useMemo(() => {
    return (deals || []).filter((d: any) => {
      const stage = (d.stage || '').toLowerCase();
      if (stage === 'closed-won' || stage === 'closed-lost') return false;
      const dc = (d.deal_class || d.dealClass || 'standard').toString().toLowerCase();
      // Match dashboard deal scope: exclude internal naitive/finserv classes
      if (dc === 'naitive' || dc === 'finserv') return false;
      const name = (d.company || d.name || '').toString().toLowerCase();
      // Apply global test/exclude rules
      if (name === "test-niki's store" || name === 'example deal' || name.startsWith('test ')) return false;
      return true;
    });
  }, [deals]);

  const dealIds = useMemo(() => activeDeals.map((d: any) => d.id), [activeDeals]);

  // Fetch stale lender activity + last status note dates
  useEffect(() => {
    let cancelled = false;
    if (dealIds.length === 0) {
      setStaleLenders([]);
      setStaleNoteByDeal({});
      setLendersLoading(false);
      return;
    }
    setLendersLoading(true);
    (async () => {
      try {
        const [{ data: lenders }, { data: notes }] = await Promise.all([
          supabase
            .from('deal_lenders')
            .select('deal_id, name, last_contact_at, tracking_status, substage, updated_at, created_at')
            .in('deal_id', dealIds)
            .limit(2000),
          supabase
            .from('deal_status_notes')
            .select('deal_id, created_at')
            .in('deal_id', dealIds)
            .order('created_at', { ascending: false })
            .limit(2000),
        ]);

        if (cancelled) return;

        const now = Date.now();
        const dealNameById: Record<string, string> = {};
        activeDeals.forEach((d: any) => {
          dealNameById[d.id] = d.company || d.name || 'Untitled deal';
        });

        // Stale lenders: still in active engagement (not passed/won/lost), last touch >= 7 days
        const stale: StaleLenderItem[] = [];
        (lenders || []).forEach((l: any) => {
          const status = ((l.substage || l.tracking_status || '') as string).toLowerCase();
          if (
            status.includes('pass') ||
            status.includes('declin') ||
            status.includes('won') ||
            status.includes('lost') ||
            status.includes('funded') ||
            status === 'closed'
          ) {
            return;
          }
          const ts = l.last_contact_at || l.updated_at || l.created_at;
          if (!ts) return;
          const days = Math.floor((now - new Date(ts).getTime()) / 86_400_000);
          if (days < LENDER_STALE_DAYS) return;
          stale.push({
            dealId: l.deal_id,
            dealName: dealNameById[l.deal_id] || 'Deal',
            lenderName: l.name || 'Lender',
            daysSince: days,
          });
        });
        // Sort by stalest first, cap to keep UI tight
        stale.sort((a, b) => b.daysSince - a.daysSince);
        setStaleLenders(stale.slice(0, 8));

        // Most recent status note per deal
        const noteMap: Record<string, number> = {};
        (notes || []).forEach((n: any) => {
          if (noteMap[n.deal_id]) return; // already have most recent (ordered desc)
          const ts = n.created_at ? new Date(n.created_at).getTime() : 0;
          if (ts) noteMap[n.deal_id] = Math.floor((now - ts) / 86_400_000);
        });
        setStaleNoteByDeal(noteMap);
      } catch (err) {
        console.warn('[IntelBrief] failed to load lenders/notes', err);
        if (!cancelled) {
          setStaleLenders([]);
          setStaleNoteByDeal({});
        }
      } finally {
        if (!cancelled) setLendersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealIds.join(',')]);

  const dealItems = useMemo<DealItem[]>(() => {
    const now = Date.now();
    const out: DealItem[] = [];
    const lenderStaleByDeal: Record<string, number> = {};
    staleLenders.forEach((l) => {
      lenderStaleByDeal[l.dealId] = Math.max(lenderStaleByDeal[l.dealId] || 0, l.daysSince);
    });

    activeDeals.forEach((d: any) => {
      const company = d.company || d.name || 'Untitled deal';
      const reasons: { kind: DealItem['reasonKind']; text: string; days?: number }[] = [];

      const noteDays = staleNoteByDeal[d.id];
      const updatedTs = d.updatedAt || d.updated_at;
      const updatedDays = updatedTs ? Math.floor((now - new Date(updatedTs).getTime()) / 86_400_000) : null;
      const lastTouchDays = noteDays !== undefined ? noteDays : updatedDays;
      if (lastTouchDays !== null && lastTouchDays !== undefined && lastTouchDays >= STATUS_NOTE_OVERDUE_DAYS) {
        reasons.push({
          kind: 'status_overdue',
          text: `status note overdue (${lastTouchDays}d)`,
          days: lastTouchDays,
        });
      }

      const lenderDays = lenderStaleByDeal[d.id];
      if (lenderDays) {
        reasons.push({
          kind: 'lender_stale',
          text: `lender stale (${lenderDays}d)`,
          days: lenderDays,
        });
      }

      const stageDays = d.daysInCurrentStage ?? d.daysInStage;
      if (typeof stageDays === 'number' && stageDays >= STAGE_STALE_DAYS) {
        reasons.push({ kind: 'stage_stale', text: `${stageDays}d in ${d.stage || 'stage'}`, days: stageDays });
      }

      if (d.isFlagged) reasons.push({ kind: 'flagged', text: 'flagged for review' });

      if (reasons.length === 0) return;
      // Pick the most severe reason (prefer status > lender > milestone > stage > flag)
      const order: Record<DealItem['reasonKind'], number> = {
        status_overdue: 0,
        lender_stale: 1,
        milestone: 2,
        stage_stale: 3,
        flagged: 4,
      };
      reasons.sort((a, b) => order[a.kind] - order[b.kind]);
      const top = reasons[0];
      out.push({
        id: d.id,
        company,
        reason: reasons.map((r) => r.text).join(' · '),
        reasonKind: top.kind,
        daysSince: top.days,
      });
    });

    // Sort by severity then days
    out.sort((a, b) => (b.daysSince ?? 0) - (a.daysSince ?? 0));
    return out;
  }, [activeDeals, staleLenders, staleNoteByDeal]);

  const overdueTaskCount = useMemo(() => {
    return (tasks || []).filter((t) => {
      if (t.status === 'done') return false;
      if (!t.due_date) return false;
      const d = parseISO(t.due_date);
      return isPast(d) && !isToday(d);
    }).length;
  }, [tasks]);

  const topPriority = useMemo<IntelBriefData['topPriority']>(() => {
    if (dealItems.length > 0) {
      const top = dealItems[0];
      const verb =
        top.reasonKind === 'status_overdue'
          ? 'Send a status update on'
          : top.reasonKind === 'lender_stale'
          ? 'Follow up with stale lenders on'
          : top.reasonKind === 'milestone'
          ? 'Confirm the upcoming milestone on'
          : top.reasonKind === 'stage_stale'
          ? 'Move forward on'
          : 'Review';
      return {
        label: `${verb} ${top.company}`,
        href: `/deal/${top.id}`,
        prompt: `Help me ${verb.toLowerCase()} ${top.company}.`,
      };
    }
    if (overdueTaskCount > 0) {
      return {
        label: `Clear ${overdueTaskCount} overdue task${overdueTaskCount === 1 ? '' : 's'}`,
        href: '/tasks',
      };
    }
    if (staleLenders.length > 0) {
      const l = staleLenders[0];
      return {
        label: `Follow up with ${l.lenderName} on ${l.dealName}`,
        href: `/deal/${l.dealId}`,
        prompt: `Draft a follow-up email to ${l.lenderName} for ${l.dealName} — it's been ${l.daysSince} days.`,
      };
    }
    return null;
  }, [dealItems, overdueTaskCount, staleLenders]);

  return {
    loading: tasksLoading || lendersLoading,
    deals: dealItems,
    staleLenders,
    overdueTaskCount,
    topPriority,
  };
}

// ─── Component ───────────────────────────────────────────────────────────

interface MorningIntelligenceBriefProps {
  /** Called when the user clicks an actionable item that should seed a chat prompt. */
  onAction?: (prompt: string) => void;
}

function reasonForDeal(d: DealItem): string {
  switch (d.reasonKind) {
    case 'status_overdue':
      return 'status note overdue';
    case 'lender_stale':
      return 'lender stale';
    case 'milestone':
      return 'milestone approaching';
    case 'stage_stale':
      return 'stage stale';
    case 'flagged':
      return 'flagged';
    default:
      return d.reason;
  }
}

function actionPromptForDeal(d: DealItem): string {
  switch (d.reasonKind) {
    case 'status_overdue':
      return `Draft a status update for ${d.company}.`;
    case 'lender_stale':
      return `Draft a funding source follow-up for ${d.company}.`;
    case 'milestone':
      return `Show me the upcoming milestone and outstanding items on ${d.company}.`;
    case 'stage_stale':
      return `What's blocking ${d.company} from moving to the next stage?`;
    case 'flagged':
      return `What needs review on ${d.company}?`;
    default:
      return `What needs my attention on ${d.company}?`;
  }
}

export function MorningIntelligenceBrief({ onAction }: MorningIntelligenceBriefProps) {
  const { user } = useAuth();
  const { loading, deals, staleLenders, overdueTaskCount, topPriority } = useIntelBriefData();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const firstName = useMemo(() => {
    const meta = (user?.user_metadata || {}) as Record<string, any>;
    const full =
      meta.full_name ||
      meta.name ||
      [meta.first_name, meta.last_name].filter(Boolean).join(' ') ||
      user?.email?.split('@')[0] ||
      '';
    return (full as string).split(/\s+/)[0] || 'there';
  }, [user]);

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Sun className="h-4 w-4 text-amber-400" />
          <span className="text-sm font-semibold text-foreground">Morning Intelligence Brief</span>
        </div>
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  const visibleDeals = deals.filter((d) => !dismissed.has(`deal:${d.id}`)).slice(0, 5);
  const visibleLenders = staleLenders.filter((l) => !dismissed.has(`lender:${l.dealId}:${l.lenderName}`)).slice(0, 5);
  const showTaskRow = overdueTaskCount > 0 && !dismissed.has('tasks');
  const showTopPriority = !!topPriority && !dismissed.has('top');

  const allClean =
    visibleDeals.length === 0 && visibleLenders.length === 0 && !showTaskRow && !showTopPriority;

  if (allClean) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Sun className="h-4 w-4 text-amber-400" />
          <span className="text-sm font-semibold text-foreground">
            Good morning, {firstName} — {format(new Date(), 'EEEE, MMM d')}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          Pipeline looks clean — no urgent items today. ✅
        </p>
      </div>
    );
  }

  const dismiss = (key: string) => setDismissed((prev) => new Set(prev).add(key));

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <span className="text-base">📊</span>
          <span className="text-sm font-semibold text-foreground">
            Good morning, {firstName}. Here's what needs your attention today.
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground pl-6 mt-0.5">
          {format(new Date(), 'EEEE, MMMM d')}
        </p>
      </div>

      {/* Deals needing action */}
      {visibleDeals.length > 0 && (
        <Section icon={<AlertTriangle className="h-4 w-4 text-amber-500" />} title="Deals Needing Action" count={visibleDeals.length}>
          {visibleDeals.map((d) => (
            <BriefRow
              key={`deal-${d.id}`}
              onDismiss={() => dismiss(`deal:${d.id}`)}
              onClick={() => onAction?.(actionPromptForDeal(d))}
              href={`/deal/${d.id}`}
              primary={d.company}
              secondary={reasonForDeal(d)}
            />
          ))}
        </Section>
      )}

      {/* Stale lenders */}
      {visibleLenders.length > 0 && (
        <Section icon={<Clock className="h-4 w-4 text-amber-500" />} title="Stale Lenders" count={visibleLenders.length} hint="7+ days no response">
          {visibleLenders.map((l) => (
            <BriefRow
              key={`lender-${l.dealId}-${l.lenderName}`}
              onDismiss={() => dismiss(`lender:${l.dealId}:${l.lenderName}`)}
              onClick={() =>
                onAction?.(
                  `Draft a follow-up email to ${l.lenderName} for ${l.dealName} — last contact was ${l.daysSince} days ago.`
                )
              }
              href={`/deal/${l.dealId}`}
              primary={`${l.lenderName} on ${l.dealName}`}
              secondary={`${l.daysSince} days since last contact`}
            />
          ))}
        </Section>
      )}

      {/* Overdue tasks */}
      {showTaskRow && (
        <Section icon={<ListChecks className="h-4 w-4 text-destructive" />} title="Overdue Tasks">
          <div className="pl-6">
            <div className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/40 transition-colors group">
              <Link to="/tasks" className="flex-1 text-xs text-foreground hover:underline">
                {overdueTaskCount} task{overdueTaskCount === 1 ? '' : 's'} overdue —
                <span className="text-primary ml-1">open Tasks view</span>
              </Link>
              <button
                type="button"
                onClick={() => dismiss('tasks')}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
                aria-label="Dismiss"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>
        </Section>
      )}

      {/* Top priority */}
      {showTopPriority && topPriority && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Star className="h-4 w-4 text-primary" />
              <span className="text-xs font-semibold uppercase tracking-wide text-primary">Top Priority</span>
            </div>
            <button
              type="button"
              onClick={() => dismiss('top')}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Dismiss top priority"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-foreground">{topPriority.label}</p>
            <div className="flex items-center gap-1.5 shrink-0">
              {topPriority.prompt && (
                <Button
                  size="sm"
                  variant="default"
                  className="h-7 px-2 text-[11px]"
                  onClick={() => onAction?.(topPriority.prompt!)}
                >
                  Draft
                </Button>
              )}
              {topPriority.href && (
                <Link to={topPriority.href}>
                  <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]">
                    Open <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function Section({
  icon,
  title,
  count,
  hint,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count?: number;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {typeof count === 'number' && (
          <Badge variant="secondary" className="text-[10px] h-5">
            {count}
          </Badge>
        )}
        {hint && <span className="text-[10px] text-muted-foreground">{hint}</span>}
      </div>
      <div className="space-y-0.5 pl-6">{children}</div>
    </div>
  );
}

function BriefRow({
  primary,
  secondary,
  href,
  onClick,
  onDismiss,
}: {
  primary: string;
  secondary: string;
  href?: string;
  onClick?: () => void;
  onDismiss?: () => void;
}) {
  return (
    <div className="group flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/40 transition-colors">
      <button
        type="button"
        onClick={onClick}
        className={cn('flex-1 min-w-0 text-left', !onClick && 'cursor-default')}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-foreground truncate">{primary}</span>
        </div>
        <p className="text-[10px] text-muted-foreground truncate">{secondary}</p>
      </button>
      {href && (
        <Link to={href} className="shrink-0 text-muted-foreground hover:text-foreground" aria-label={`Open ${primary}`}>
          <ArrowRight className="h-3 w-3" />
        </Link>
      )}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
          aria-label="Dismiss"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}