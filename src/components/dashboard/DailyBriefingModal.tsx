import { useState, useEffect, useCallback, useRef, useMemo, useTransition, lazy, Suspense } from 'react';
import { format, formatDistanceToNow, isPast, isToday } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useCarouselSwipeClass } from '@/hooks/useCarouselSwipeClass';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AgendaIntel } from './AgendaIntel';
import { MoffittDealRundown } from './MoffittDealRundown';
import { MOFFITT_USER_ID } from '@/constants/moffittBriefing';
import { TodayTab } from './TodayTab';
import { ActionQueuePanel } from '@/components/ai-queue/ActionQueuePanel';
import { useAiActionQueue } from '@/hooks/useAiActionQueue';
import { useApprovalQueueAccess } from '@/hooks/useApprovalQueueAccess';
import { useDealAccessRequests } from '@/hooks/useDealAccessRequests';
import { useTaskNotifications } from '@/hooks/useTaskNotifications';
import { consolidatedAiQueueCount } from '@/lib/consolidatedAiQueueCount';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Newspaper, Mail, DollarSign, GitBranch, ListChecks, CalendarDays,
  AlertCircle, ExternalLink, TrendingUp,
  FileText, X, ChevronRight, ChevronLeft, RefreshCw,
  Check, Clock, ArrowUpRight, Sunset, EyeOff, LayoutDashboard,
  Settings, Sunrise, GripVertical, Inbox,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import {
  useBriefingWindow,
  useEmailData,
  useFinancialData,
  usePipelineData,
  useOperationalData,
  useActivePipelineId,
  filterRundownEligibleDeals,
  getDealsForUserName,
} from '@/hooks/useDailyBriefingData';
import { OperationalDashboard } from './operational/OperationalDashboard';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useDailyDismissals } from '@/hooks/useDailyDismissals';
import { useEndOfDayOutstandingCount } from '@/hooks/useEndOfDayOutstandingCount';
import { useDbPersistentClears } from '@/hooks/useDbPersistentClears';
import { AddToDealCalendarProvider } from '@/components/calendar/AddToDealCalendarProvider';
import { useNaitivePipelineAccess } from '@/hooks/useNaitivePipelineAccess';
import { DashboardModalLazyHost } from './DashboardModalLazyHost';

// Lazy: the Dashboard tab embeds the full DashboardModal body. Only
// loaded when the Dashboard tab is first activated.
const LazyTasksPage = lazy(() => import('@/pages/Tasks'));

// Reused from the main Email widget pop-up so the AI Assist experience
// (prompts, actions, summaries, suggested replies) is identical here.
import { AiAssistInlinePanel } from '@/components/deal/email/AiAssistInlinePanel';
import { EmailBodyRenderer } from '@/components/deal/email/EmailBodyRenderer';
import { useFullEmailMessage, useFullEmailThread } from '@/components/deal/email/useFullEmailMessage';
import type { EmailThread, MockEmail } from '@/components/deal/email/mockEmailData';
import { EmailAttachmentsStrip, detectAttachmentFallbackReason } from '@/components/deal/email/EmailAttachmentsStrip';
// Reuse the exact same right-click menu the main Email pop-up uses so
// behavior, actions, ordering, and label wiring stay identical between
// Daily Rundown email rows and the Email widget pop-up.
import { EmailContextMenu } from '@/components/deal/email/EmailContextMenu';
import { CreateTaskFromEmailDialog, type CreateTaskFromEmailSource } from '@/components/tasks/CreateTaskFromEmailDialog';
import { useGmail } from '@/hooks/useGmail';
import { toast } from 'sonner';
// Code-split: keeps the Memo view (and @tanstack/react-virtual) out of the
// initial Daily Rundown bundle. Only loaded when the user actually opens the
// Pipeline & Clients tab in Memo mode.
const PipelineMemoView = lazy(() =>
  import('@/pages/pipeline/PipelineMemoView').then(m => ({ default: m.PipelineMemoView })),
);
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { useMorningFollowups, useFollowupActions, type FollowupDealGroup, type FollowupItem } from '@/hooks/useMorningFollowups';
import { useDealsContext } from '@/contexts/DealsContext';
import { useProfile } from '@/hooks/useProfile';
import type { Deal } from '@/types/deal';
import { RecentPipelineActivitySection } from './briefingPrimitives';
import { formatSlug } from '@/utils/dealTypeLabels';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { WeeklyRundownReadOnlyCashflow } from '@/components/metrics/dashboards/WeeklyRundownReadOnlyCashflow';
import { useIsDemoAccount } from '@/hooks/useIsDemoAccount';

// Users for whom the Daily Rundown hides "Today's Follow-Ups" entirely and
// collapses "Recent Pipeline Activity" behind a button that opens a side
// drawer. Scoped to these three emails only — every other user keeps the
// existing two-section sidebar layout untouched.
const COLLAPSED_ACTIVITY_EMAILS = new Set<string>([
  'jturner@5thline.co',
  'nheikali@5thline.co',
  'jmoffitt@5thline.co',
]);

// Users for whom the Daily Rundown > Financial tab swaps the compact
// weekly summary for an embedded, read-only render of the full Finance
// Cashflow section (charts + table). Clicking the embed routes to the
// full Finance > Cashflow page for editing.
const CASHFLOW_EMBED_EMAILS = new Set<string>([
  'jturner@5thline.co',
  'jmoffitt@5thline.co',
]);

interface DailyBriefingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Title shown in the modal header. Defaults to "Daily Rundown".
   */
  title?: string;
  /**
   * If set, the briefing's user-scoped sections (Email, Operational) will be
   * loaded for this target user instead of the current user. The caller must
   * be allow-listed server-side (see briefing-for-user / briefing-operational
   * edge functions). Org-wide sections (Catch Up, Pipeline, Financial) remain
   * shared regardless.
   */
  targetUserId?: string;
  /**
   * Asana assignee display name for the Operational tab when delegating
   * (e.g., "Niki Heikali"). Required only when targetUserId is set and you
   * want the Operational tab to filter by that person.
   */
  targetAssigneeName?: string;
  /**
   * Tab values to hide from this briefing instance (e.g., ['financial']).
   * Hidden tabs do not render their content and skip data fetching entirely.
   */
  excludeTabs?: Array<'dashboard' | 'daily_rundown' | 'agenda' | 'catchup' | 'email' | 'financial' | 'pipeline' | 'operational'>;
  /**
   * Tab to select when the modal opens (and re-opens). If the value is
   * excluded or unknown, falls back to the first available tab.
   */
  initialTab?: 'dashboard' | 'daily_rundown' | 'agenda' | 'catchup' | 'email' | 'financial' | 'pipeline' | 'operational' | 'today';
  /**
   * Identifies which briefing surface this modal represents. Used to scope
   * per-day dismissal state so dismissing an item in one briefing surface
   * (e.g. the regular Daily Rundown) does NOT also hide it in another
   * surface (e.g. Niki's Daily Rundown). Both still read the same live
   * underlying deal activity. Defaults to 'daily_briefing'.
   */
  briefingType?: string;
}

// Initial tab to open with. Defaults to the first available tab.
export type BriefingTabValue = 'dashboard' | 'daily_rundown' | 'agenda' | 'catchup' | 'email' | 'financial' | 'pipeline' | 'operational';

// ── Glass surface classes ──────────────────────────────────────
// Borders are intentionally near-invisible — depth comes from translucent
// surface tint + blur + soft shadow, not bright outlines. `glass-border-soft`
// / `glass-border-softer` are theme-aware so they don't appear as harsh
// white outlines on light backgrounds.
const GLASS_SURFACE = 'bg-background/40 backdrop-blur-2xl glass-border-softer';
const GLASS_CARD = 'glass-surface-1 backdrop-blur-xl glass-border-softer rounded-lg';
const GLASS_ROW = 'glass-surface-1 glass-border-softer rounded-lg backdrop-blur-sm';

// ── Loading skeleton for tab content ───────────────────────────
function TabSkeleton() {
  return (
    <div className="space-y-3 p-1">
      {[...Array(5)].map((_, i) => (
        <Skeleton key={i} className="h-14 w-full rounded-lg bg-white/[0.04]" />
      ))}
    </div>
  );
}

// ── Detail pop-up (nested inside the modal) ────────────────────
function DetailPopup({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
      <div className="absolute inset-0 z-10 bg-background/90 backdrop-blur-2xl flex flex-col rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 glass-divider-b">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <ScrollArea className="flex-1 p-5">{children}</ScrollArea>
    </div>
  );
}

// ── Empty state ────────────────────────────────────────────────
function EmptySection({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 text-muted-foreground/70 text-sm py-6 justify-center">
      <AlertCircle className="h-4 w-4 opacity-40" />
      <span>{message}</span>
    </div>
  );
}

// ── Row component for clickable list items ─────────────────────
function BriefingRow({
  icon: Icon,
  title,
  subtitle,
  badge,
  badgeVariant,
  time,
  onClick,
  extras,
  borderless,
  selected,
}: {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
  badge?: string;
  badgeVariant?: 'default' | 'secondary' | 'destructive' | 'outline';
  time?: string;
  onClick?: () => void;
  extras?: React.ReactNode;
  /**
   * Drop the standard `glass-border-softer` outline so rows in dense list
   * surfaces (e.g. the Email tab) read as a clean stack separated by spacing
   * and very light surface contrast instead of boxed white-bordered tiles.
   */
  borderless?: boolean;
  /** Selected state for borderless lists — soft fill + left accent rail. */
  selected?: boolean;
}) {
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={e => { if (onClick && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick(); } }}
      className={cn(
        borderless
          ? cn(
              // Borderless variant: no outline, rely on spacing + subtle bg.
              'relative rounded-lg border border-transparent bg-transparent',
              'flex items-start gap-3 p-3 transition-colors duration-150',
              onClick && 'cursor-pointer hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
              selected && 'bg-primary/[0.06] before:absolute before:left-0 before:top-2 before:bottom-2 before:w-[2px] before:rounded-full before:bg-primary/70',
            )
          : cn(
              GLASS_ROW,
              'flex items-start gap-3 p-3',
              'transition-all duration-200',
              onClick && 'cursor-pointer hover:bg-white/[0.06] hover:glass-border-soft hover:shadow-[0_2px_12px_hsl(var(--primary)/0.08)]',
            ),
      )}
    >
      <div className="p-1.5 rounded-md bg-primary/10 shrink-0 mt-0.5">
        <Icon className="h-3.5 w-3.5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm text-foreground truncate', selected ? 'font-semibold' : 'font-medium')}>{title}</p>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{subtitle}</p>}
        {extras && <div className="flex items-center gap-1 mt-1 flex-wrap">{extras}</div>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {badge && (
          <Badge variant={badgeVariant || 'secondary'} className="text-[10px] glass-border-soft">
            {badge}
          </Badge>
        )}
        {time && <span className="text-[10px] text-muted-foreground whitespace-nowrap">{time}</span>}
        {onClick && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />}
      </div>
    </div>
  );
}

// ── Deal link chip ─────────────────────────────────────────────
// Resolves a deal/company reference from a briefing row (email, activity, etc.)
// against the user's DealsContext and renders a clickable chip that navigates
// to the matching deal page. Falls back gracefully when no match is found.
function useResolveDealForEmail(email: Record<string, any>): Deal | null {
  const { deals } = useDealsContext();
  return useMemo(() => {
    if (!deals?.length) return null;
    const dealName: string | undefined = email?.analysis?.deal_name || email?.deal_name;
    const norm = (s?: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (dealName) {
      const target = norm(dealName);
      const exact = deals.find(d => norm(d.company) === target || norm(d.name) === target);
      if (exact) return exact;
      const partial = deals.find(d => {
        const c = norm(d.company);
        const n = norm(d.name);
        return (c && (c.includes(target) || target.includes(c)))
          || (n && (n.includes(target) || target.includes(n)));
      });
      if (partial) return partial;
    }
    // Fallback: sender domain ↔ deal.companyUrl
    const fromEmail: string | undefined = email?.from_email;
    const senderDomain = fromEmail?.split('@')[1]?.toLowerCase();
    if (senderDomain && !COMMON_EMAIL_DOMAINS.has(senderDomain)) {
      const byDomain = deals.find(d => {
        try {
          const url = d.companyUrl;
          if (!url) return false;
          const host = new URL(url.startsWith('http') ? url : `https://${url}`).hostname.toLowerCase().replace(/^www\./, '');
          return host === senderDomain || senderDomain.endsWith(`.${host}`) || host.endsWith(`.${senderDomain}`);
        } catch { return false; }
      });
      if (byDomain) return byDomain;
    }
    return null;
  }, [deals, email]);
}

const COMMON_EMAIL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com',
  'me.com', 'aol.com', 'proton.me', 'protonmail.com', 'live.com', 'msn.com',
]);

function DealLinkChip({ email, onNavigate }: { email: Record<string, any>; onNavigate: (path: string) => void }) {
  const deal = useResolveDealForEmail(email);
  if (!deal) return null;
  const label = deal.company || deal.name;
  return (
    <Badge
      variant="outline"
      role="button"
      tabIndex={0}
      onClick={(e) => { e.stopPropagation(); onNavigate(`/deal/${deal.id}`); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          onNavigate(`/deal/${deal.id}`);
        }
      }}
      title={`Open deal: ${label}`}
      className="text-[9px] h-[16px] px-1 gap-0.5 shrink-0 font-medium cursor-pointer bg-primary/10 text-primary border-primary/30 hover:bg-primary/20 hover:border-primary/50 transition-colors inline-flex items-center"
    >
      <GitBranch className="h-2.5 w-2.5" />
      <span className="truncate max-w-[140px]">{label}</span>
      <ArrowUpRight className="h-2.5 w-2.5" />
    </Badge>
  );
}

// ── Section wrapper ────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h4 className="text-base font-bold uppercase tracking-wide text-white mb-2 px-0.5">{title}</h4>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

// ── Glass stat card ────────────────────────────────────────────
function GlassStatCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: 'primary' | 'destructive' }) {
  return (
    <div className={cn(GLASS_CARD, 'p-4 text-center')}>
      <p className="text-xs text-muted-foreground/70">{label}</p>
      <p className={cn('text-xl font-bold', color === 'primary' ? 'text-primary' : 'text-destructive')}>{value}</p>
      <p className="text-[10px] text-muted-foreground/50">{sub}</p>
    </div>
  );
}

// ── News item icon/badge helpers ────────────────────────────────
// ── Topic badge colors ─────────────────────────────────────────
const TOPIC_COLORS: Record<string, string> = {
  'Venture Debt': 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  'Interest Rates': 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  'Venture Capital': 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  'AI & Technology': 'bg-violet-500/20 text-violet-300 border-violet-500/30',
  'AI in Finance': 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  'Agentic AI': 'bg-rose-500/20 text-rose-300 border-rose-500/30',
};

// Topic-based gradient backgrounds for image placeholders
const TOPIC_GRADIENTS: Record<string, string> = {
  'Venture Debt': 'from-blue-900/80 via-blue-800/40 to-slate-900/60',
  'Interest Rates': 'from-amber-900/80 via-amber-800/40 to-slate-900/60',
  'Venture Capital': 'from-emerald-900/80 via-emerald-800/40 to-slate-900/60',
  'AI & Technology': 'from-violet-900/80 via-violet-800/40 to-slate-900/60',
  'AI in Finance': 'from-cyan-900/80 via-cyan-800/40 to-slate-900/60',
  'Agentic AI': 'from-rose-900/80 via-rose-800/40 to-slate-900/60',
};

const TOPIC_ICONS: Record<string, string> = {
  'Venture Debt': '💰',
  'Interest Rates': '📊',
  'Venture Capital': '🚀',
  'AI & Technology': '⚡',
  'AI in Finance': '🏦',
  'Agentic AI': '🤖',
};

const ALL_TOPICS = ['Venture Debt', 'Interest Rates', 'Venture Capital', 'AI & Technology', 'AI in Finance', 'Agentic AI'];

interface NewsfeedItem {
  id: string;
  headline: string;
  source: string;
  published_at: string;
  summary: string;
  url: string;
  topic: string;
  image_url?: string | null;
}

// Session-level cache
let newsfeedCache: { items: NewsfeedItem[]; fetchedAt: number } | null = null;

function useNewsfeedData(enabled: boolean) {
  const [items, setItems] = useState<NewsfeedItem[]>(newsfeedCache?.items || []);
  const [isLoading, setIsLoading] = useState(!newsfeedCache);
  const [error, setError] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  const fetchFeed = useCallback(async (force = false) => {
    if (!force && newsfeedCache && Date.now() - newsfeedCache.fetchedAt < 30 * 60 * 1000) {
      setItems(newsfeedCache.items);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('briefing-newsfeed');
      if (fnError) throw new Error(fnError.message);
      if (data?.error) throw new Error(data.error);
      const fetched = data?.items || [];
      newsfeedCache = { items: fetched, fetchedAt: Date.now() };
      setItems(fetched);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load newsfeed');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled && !fetchedRef.current) {
      fetchedRef.current = true;
      fetchFeed();
    }
  }, [enabled, fetchFeed]);

  return { items, isLoading, error, refresh: () => fetchFeed(true) };
}

// ── Image with fallback ─────────────────────────────────────────
function NewsImage({ src, topic, className, variant = 'standard' }: { src?: string | null; topic: string; className?: string; variant?: 'featured' | 'standard' }) {
  const [failed, setFailed] = useState(false);
  const gradient = TOPIC_GRADIENTS[topic] || 'from-slate-800/80 via-slate-700/40 to-slate-900/60';
  const icon = TOPIC_ICONS[topic] || '📰';
  const hasImage = src && !failed;

  return (
    <div className={cn('relative overflow-hidden bg-gradient-to-br', gradient, className)}>
      {hasImage ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <>
          <div className="absolute inset-0 opacity-[0.07]" style={{
            backgroundImage: 'radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px), radial-gradient(circle at 60% 80%, white 1px, transparent 1px)',
            backgroundSize: '40px 40px, 60px 60px, 50px 50px',
          }} />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={cn('opacity-40 select-none', variant === 'featured' ? 'text-4xl' : 'text-2xl')}>{icon}</span>
          </div>
        </>
      )}
      {variant === 'featured' && hasImage && (
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
      )}
      <div className="absolute inset-0 glass-border-soft rounded-[inherit]" />
    </div>
  );
}

// ── Featured news tile ─────────────────────────────────────────
function FeaturedNewsTile({ item, onDismiss }: { item: NewsfeedItem; onDismiss: (id: string) => void }) {
  const hasImage = !!item.image_url;
  return (
    <a
      href={item.url !== '#' ? item.url : undefined}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        GLASS_CARD,
        'group relative overflow-hidden flex flex-col transition-all duration-200',
        'hover:bg-white/[0.06] hover:glass-border-soft hover:shadow-[0_4px_20px_hsl(var(--primary)/0.1)]',
        item.url !== '#' && 'cursor-pointer',
      )}
    >
      <button
        type="button"
        aria-label="Dismiss for today"
        title="Dismiss for today"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDismiss(item.id); }}
        className="absolute top-2 right-2 z-10 h-6 w-6 rounded-full flex items-center justify-center bg-black/40 text-white/70 hover:text-white hover:bg-black/60 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <div className="relative">
        <NewsImage src={item.image_url} topic={item.topic} className="w-full aspect-[2.4/1] rounded-t-lg" variant="featured" />
        {hasImage && (
          <div className="absolute bottom-0 left-0 right-0 p-4">
            <div className="flex items-center gap-2 mb-1.5">
              <span className={cn(
                'px-2 py-0.5 rounded text-[10px] font-semibold border backdrop-blur-sm',
                TOPIC_COLORS[item.topic] || 'bg-white/[0.05] text-muted-foreground glass-border-soft',
              )}>
                {item.topic}
              </span>
              <span className="text-[10px] text-white/60">{item.source}</span>
              <span className="text-[10px] text-white/40 ml-auto">
                {formatDistanceToNow(new Date(item.published_at), { addSuffix: true })}
              </span>
            </div>
            <h4 className="text-sm font-semibold text-white leading-snug line-clamp-2 drop-shadow-sm">
              {item.headline}
              {item.url !== '#' && <ExternalLink className="inline h-3 w-3 ml-1.5 text-white/40" />}
            </h4>
          </div>
        )}
      </div>
      <div className="p-4 flex flex-col flex-1">
        {!hasImage && (
          <>
            <div className="flex items-center gap-2 mb-2">
              <span className={cn(
                'px-2 py-0.5 rounded text-[10px] font-semibold border',
                TOPIC_COLORS[item.topic] || 'bg-white/[0.05] text-muted-foreground glass-border-soft',
              )}>
                {item.topic}
              </span>
              <span className="text-[10px] text-muted-foreground/50">{item.source}</span>
              <span className="text-[10px] text-muted-foreground/40 ml-auto">
                {formatDistanceToNow(new Date(item.published_at), { addSuffix: true })}
              </span>
            </div>
            <h4 className="text-sm font-semibold text-foreground leading-snug mb-1.5 line-clamp-2 group-hover:text-primary/90 transition-colors">
              {item.headline}
              {item.url !== '#' && <ExternalLink className="inline h-3 w-3 ml-1.5 text-muted-foreground/30 group-hover:text-primary/50" />}
            </h4>
          </>
        )}
        <p className="text-xs text-muted-foreground/60 line-clamp-2 flex-1">{item.summary}</p>
      </div>
    </a>
  );
}

// ── Standard grid news tile ────────────────────────────────────
function StandardNewsTile({ item, onDismiss }: { item: NewsfeedItem; onDismiss: (id: string) => void }) {
  return (
    <a
      href={item.url !== '#' ? item.url : undefined}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        GLASS_ROW,
        'group relative overflow-hidden flex gap-0 transition-all duration-200',
        'hover:bg-white/[0.06] hover:glass-border-soft hover:shadow-[0_2px_12px_hsl(var(--primary)/0.06)]',
        item.url !== '#' && 'cursor-pointer',
      )}
    >
      <button
        type="button"
        aria-label="Dismiss for today"
        title="Dismiss for today"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDismiss(item.id); }}
        className="absolute top-1.5 right-1.5 z-10 h-5 w-5 rounded-full flex items-center justify-center bg-black/40 text-white/70 hover:text-white hover:bg-black/60 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <X className="h-3 w-3" />
      </button>
      <NewsImage src={item.image_url} topic={item.topic} className="w-20 min-h-full shrink-0 rounded-l-lg" variant="standard" />
      <div className="p-3 flex flex-col flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1">
          <span className={cn(
            'px-1.5 py-px rounded text-[9px] font-semibold border',
            TOPIC_COLORS[item.topic] || 'bg-white/[0.05] text-muted-foreground glass-border-soft',
          )}>
            {item.topic}
          </span>
          <span className="text-[9px] text-muted-foreground/40 truncate">{item.source}</span>
          <span className="text-[9px] text-muted-foreground/30 ml-auto shrink-0">
            {formatDistanceToNow(new Date(item.published_at), { addSuffix: true })}
          </span>
        </div>
        <h5 className="text-[13px] font-medium text-foreground leading-snug line-clamp-2 mb-0.5 group-hover:text-primary/90 transition-colors">
          {item.headline}
        </h5>
        <p className="text-[11px] text-muted-foreground/50 line-clamp-1">{item.summary}</p>
      </div>
    </a>
  );
}



// ── Newsfeed grid skeleton ─────────────────────────────────────
function NewsfeedSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[0, 1].map(i => (
          <div key={i} className={cn(GLASS_CARD, 'overflow-hidden')}>
            <Skeleton className="w-full aspect-[2.4/1] bg-white/[0.04]" />
            <div className="p-4 space-y-2">
              <div className="flex gap-2">
                <Skeleton className="h-4 w-16 rounded bg-white/[0.06]" />
                <Skeleton className="h-4 w-20 rounded bg-white/[0.04]" />
              </div>
              <Skeleton className="h-4 w-full bg-white/[0.06]" />
              <Skeleton className="h-3 w-3/4 bg-white/[0.04]" />
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {[...Array(6)].map((_, i) => (
          <div key={i} className={cn(GLASS_ROW, 'flex gap-0 overflow-hidden')}>
            <Skeleton className="w-20 h-20 shrink-0 bg-white/[0.04]" />
            <div className="p-3 space-y-1.5 flex-1">
              <Skeleton className="h-3 w-16 rounded bg-white/[0.06]" />
              <Skeleton className="h-3.5 w-full bg-white/[0.06]" />
              <Skeleton className="h-2.5 w-2/3 bg-white/[0.04]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tab: Catch Up & News (AI-powered newsfeed) ─────────────────
function CatchUpTab({ enabled }: { enabled: boolean; onNavigate: (path: string) => void }) {
  const { items, isLoading, error, refresh } = useNewsfeedData(enabled);
  const [activeTopics, setActiveTopics] = useState<Set<string>>(new Set(ALL_TOPICS));
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { dismissed, dismiss, isDismissed } = useDailyDismissals('news');
  const [showDismissed, setShowDismissed] = useState(false);
  const [compIntelActive, setCompIntelActive] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refresh();
    setIsRefreshing(false);
  };

  const toggleTopic = (topic: string) => {
    setActiveTopics(prev => {
      const next = new Set(prev);
      if (next.has(topic)) next.delete(topic);
      else next.add(topic);
      return next;
    });
  };

  const topicFiltered = items.filter(item => activeTopics.has(item.topic));
  const filtered = showDismissed ? topicFiltered : topicFiltered.filter(item => !isDismissed(item.id));
  const hiddenCount = topicFiltered.length - (showDismissed ? topicFiltered.length : filtered.length);
  const featured = filtered.slice(0, 2);
  const standard = filtered.slice(2);

  if (isLoading && items.length === 0) return <NewsfeedSkeleton />;

  if (error && items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <AlertCircle className="h-8 w-8 text-destructive/60" />
        <p className="text-sm text-muted-foreground text-center max-w-xs">{error}</p>
        <Button variant="outline" size="sm" className="glass-border-soft" onClick={handleRefresh}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter chips + refresh */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {ALL_TOPICS.map(topic => (
            <button
              key={topic}
              onClick={() => toggleTopic(topic)}
              className={cn(
                'px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all duration-150',
                activeTopics.has(topic)
                  ? TOPIC_COLORS[topic] || 'bg-primary/20 text-primary border-primary/30'
                  : 'bg-white/[0.02] text-muted-foreground/40 glass-border-softer hover:bg-white/[0.04]',
              )}
            >
              {topic}
            </button>
          ))}
          <button
            key="comp-intel"
            onClick={() => setCompIntelActive(v => !v)}
            className={cn(
              'px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all duration-150',
              compIntelActive
                ? 'bg-amber-500/20 text-amber-300 border-amber-400/40'
                : 'bg-white/[0.02] text-muted-foreground/60 glass-border-softer hover:bg-white/[0.04]',
            )}
          >
            Comp Intel
          </button>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={handleRefresh}
          disabled={isRefreshing || compIntelActive}
        >
          <RefreshCw className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin')} />
        </Button>
      </div>

      {compIntelActive ? (
        <div className="flex flex-col items-center justify-center py-20 gap-2 rounded-xl border border-amber-400/20 bg-amber-500/[0.04]">
          <div className="text-xs uppercase tracking-[0.2em] text-amber-300/80 font-semibold">
            Comp Intel
          </div>
          <div className="text-2xl font-semibold text-foreground">COMING SOON</div>
          <p className="text-xs text-muted-foreground max-w-xs text-center">
            Competitive intelligence briefings will surface here shortly.
          </p>
        </div>
      ) : (
      <>
      {dismissed.size > 0 && (
        <div className="flex items-center justify-end -mt-1">
          <button
            type="button"
            onClick={() => setShowDismissed(v => !v)}
            className="text-[11px] text-muted-foreground/60 hover:text-foreground transition-colors"
          >
            {showDismissed ? `Hide ${dismissed.size} dismissed` : `Show ${dismissed.size} dismissed`}
          </button>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptySection message={hiddenCount > 0 ? "All articles dismissed for today" : "No news items match your selected topics"} />
      ) : (
        <>
          {/* Featured tiles — top 2 stories */}
          {featured.length > 0 && (
            <div className={cn('grid gap-3', featured.length === 1 ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2')}>
              {featured.map(item => <FeaturedNewsTile key={item.id} item={item} onDismiss={dismiss} />)}
            </div>
          )}

          {/* Standard compact grid */}
          {standard.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {standard.map(item => <StandardNewsTile key={item.id} item={item} onDismiss={dismiss} />)}
            </div>
          )}
        </>
      )}
      </>
      )}
    </div>
  );
}

// ── Email sub-tab types (shared classifier) ────────────────────
import { classifyEmail, filterEmailsByCategory, EMAIL_CATEGORY_TABS, type EmailCategoryTab } from '@/utils/emailClassifier';
import { useEmailClassifierData } from '@/hooks/useEmailClassifierData';
import { useAutoEmailLabelEvaluator } from '@/hooks/useAutoEmailLabelEvaluator';
import { EmailCategoryChips } from '@/components/deal/email/EmailCategoryChips';

// Build a minimal EmailThread from a Daily-Briefing email row so we can pass
// it to the same `AiAssistInlinePanel` the main Email widget uses. Briefing
// rows are single emails (not real threads), but the panel only needs the
// fields it reads for its prompt — subject, from, body preview, participants.
function briefingRowToThread(e: any): EmailThread {
  const fromName = e.from_name || e.from_email || 'Unknown';
  const fromEmail = e.from_email || '';
  const bodyPreview =
    e.body_text || e.body_html || e.snippet || e.analysis?.summary || '';
  const email: MockEmail = {
    id: e.id || e.gmail_message_id,
    threadId: e.thread_id || e.id || e.gmail_message_id,
    subject: e.subject || '(no subject)',
    from_name: fromName,
    from_email: fromEmail,
    to_name: 'You',
    to_email: '',
    snippet: e.snippet || '',
    body_preview: bodyPreview,
    body_html: e.body_html || undefined,
    body_text: e.body_text || undefined,
    body_loaded: !!(e.body_html || e.body_text),
    received_at: e.received_at || new Date().toISOString(),
    is_read: !!e.is_read,
    is_starred: false,
    folder: 'inbox',
    labels: e.labels || [],
    has_attachments: !!e.has_attachments || (Array.isArray(e.attachments) && e.attachments.length > 0),
    attachments: Array.isArray(e.attachments) ? e.attachments : undefined,
    is_linked_to_deal: false,
    is_follow_up: false,
    needs_response: !e.is_read,
    category: 'deal',
    deal_name: e.analysis?.deal_name,
    ai_summary: e.analysis?.summary,
  };
  return {
    threadId: email.threadId,
    subject: email.subject,
    emails: [email],
    latestEmail: email,
    participants: [fromName],
    hasUnread: !email.is_read,
    isStarred: false,
    isLinked: false,
    hasAttachments: false,
    needsResponse: email.needs_response,
    dealName: email.deal_name,
    category: 'deal',
  };
}

// Middle-column detail pane for a single selected briefing email.
// Lazy-loads the full body via `useFullEmailMessage` (the same hook the
// Email widget uses), then renders it through `EmailBodyRenderer`.
function BriefingEmailDetailPane({
  email,
  onBack,
  onOpenIntelligence,
}: {
  email: any;
  onBack: () => void;
  onOpenIntelligence: () => void;
}) {
  const messageId: string = email.gmail_message_id || email.id;
  const alreadyLoaded = !!(email.body_html || email.body_text);
  const { data: full, loading, error } = useFullEmailMessage(
    messageId,
    /* enabled */ true,
    alreadyLoaded,
  );
  const providerThreadId: string | undefined = email.thread_id || full?.thread_id;
  const { data: threadMessages, loading: threadLoading } = useFullEmailThread(providerThreadId, !!providerThreadId);

  const html = full?.body_html ?? email.body_html;
  const text = full?.body_text ?? email.body_text ?? email.snippet;

  // Build a single-message "thread" so we can reuse the same
  // <EmailAttachmentsStrip> the main Email widget renders. The strip itself
  // will additionally lazy-fetch attachments if `has_attachments` is true and
  // the list is still empty (e.g. before the body call has resolved).
  const stripThread: { emails: MockEmail[] } = {
    emails: threadMessages && threadMessages.length > 0
      ? threadMessages.map((message) => ({
          ...briefingRowToThread({
            ...email,
            id: message.id,
            gmail_message_id: message.id,
            thread_id: message.thread_id || providerThreadId,
            subject: message.subject || email.subject,
            from_name: message.from_name || email.from_name,
            from_email: message.from_email || email.from_email,
            received_at: message.received_at || email.received_at,
            body_html: message.body_html,
            body_text: message.body_text,
            attachments: message.attachments,
            has_attachments: (message.attachments?.length ?? 0) > 0,
          }).latestEmail,
        }))
      : [
          {
            ...briefingRowToThread({ ...email, thread_id: providerThreadId }).latestEmail,
            attachments: full?.attachments ?? email.attachments ?? [],
            has_attachments:
              (full?.attachments?.length ?? 0) > 0 ||
              !!email.has_attachments ||
              (Array.isArray(email.attachments) && email.attachments.length > 0),
          },
        ],
  };
  const attachmentFallbackReason = detectAttachmentFallbackReason(stripThread.emails);
  const shouldRenderAttachmentsRow =
    stripThread.emails.some((threadEmail) => threadEmail.has_attachments || (threadEmail.attachments?.length ?? 0) > 0) ||
    !!attachmentFallbackReason ||
    // Keep the header attachments row mounted while we hydrate the message and
    // thread so users see a loading state in the chip strip instead of an
    // empty band that pops in only after the fetches resolve.
    loading ||
    threadLoading;

  return (
    <div className="flex flex-col h-full min-h-0 rounded-xl border border-border/40 bg-white/[0.02] overflow-hidden">
      {/* Header */}
      <div className="flex items-start gap-2 px-4 py-3 border-b border-border/30">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={onBack}
          aria-label="Back to email list"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-foreground truncate">
            {email.subject || '(no subject)'}
          </div>
          <div className="text-xs text-muted-foreground truncate mt-0.5">
            <strong className="text-foreground/80">{email.from_name || 'Unknown'}</strong>
            {email.from_email && <span> &lt;{email.from_email}&gt;</span>}
            {email.received_at && (
              <span className="ml-2">
                · {formatDistanceToNow(new Date(email.received_at), { addSuffix: true })}
              </span>
            )}
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="glass-border-soft shrink-0 h-7"
          onClick={onOpenIntelligence}
        >
          Open in Intelligence <ExternalLink className="h-3 w-3 ml-1" />
        </Button>
      </div>

      {shouldRenderAttachmentsRow && (
        <div className="px-4 py-3 border-b border-border/30 bg-card/20">
          <EmailAttachmentsStrip
            thread={stripThread}
            forceVisible
            loadingOverride={loading || threadLoading}
            fallbackReason={attachmentFallbackReason}
          />
        </div>
      )}

      {/* Body */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="px-5 py-4">
          {(loading || threadLoading) && !html && !text ? (
            <div className="space-y-2">
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-3 w-5/6" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ) : error && !html && !text ? (
            <div className="text-sm text-destructive">{error}</div>
          ) : (
            <EmailBodyRenderer
              html={html}
              text={text}
              messageId={messageId}
              inlineAttachments={full?.inline_attachments}
              attachments={full?.attachments}
              className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed"
            />
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// ── Tab: Email ─────────────────────────────────────────────────
function EmailTab({
  enabled,
  onNavigate,
  targetUserId,
  subTab,
  unreadOnly,
}: {
  enabled: boolean;
  onNavigate: (path: string) => void;
  targetUserId?: string;
  subTab: EmailCategoryTab;
  unreadOnly: boolean;
}) {
  const { data, isLoading, isFetching } = useEmailData(enabled, targetUserId);
  const [detail, setDetail] = useState<any>(null);
  const { entities: classifierEntities, orgCtx } = useEmailClassifierData();
  const { evaluate: evaluateAutoLabels } = useAutoEmailLabelEvaluator();
  const { markRead: providerMarkRead, toggleStar: providerToggleStar, trashMessage: providerTrash } = useGmail();
  // Local hide-set so archive/delete actions remove rows immediately even
  // before the next briefing data refetch lands. Behavior parity with the
  // main Email pop-up which optimistically removes the affected row.
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set());
  // Persistent, per-user "Hide from Rundown" dismissals. These DO NOT
  // touch the underlying Gmail item — they only suppress the row from this
  // surface. Reuses the same DB-backed clears table as End of Day so the
  // pattern stays consistent across rundown tabs.
  const rundownClears = useDbPersistentClears('daily_rundown_email');
  // Stable identity for an email row: prefer provider IDs so the same
  // message stays hidden across refreshes and re-fetches.
  const rundownKey = (e: any): string =>
    (e?.gmail_message_id || e?.thread_id || e?.id || '').toString();
  // Local read/star overrides so the row reflects the action instantly.
  const [overrides, setOverrides] = useState<Record<string, { is_read?: boolean; is_starred?: boolean }>>({});
  // Email-to-task creation modal state (one shared modal per tab).
  const [taskEmail, setTaskEmail] = useState<CreateTaskFromEmailSource | null>(null);

  const setReadState = useCallback(async (e: any, read: boolean) => {
    setOverrides(prev => ({ ...prev, [e.id]: { ...prev[e.id], is_read: read } }));
    const providerId = e.gmail_message_id || e.id;
    if (providerId) {
      const ok = await providerMarkRead(providerId, read);
      if (!ok) toast.error(read ? "Couldn't mark as read" : "Couldn't mark as unread");
    }
  }, [providerMarkRead]);

  const setStarState = useCallback(async (e: any) => {
    const current = overrides[e.id]?.is_starred ?? e.is_starred ?? false;
    const next = !current;
    setOverrides(prev => ({ ...prev, [e.id]: { ...prev[e.id], is_starred: next } }));
    const providerId = e.gmail_message_id || e.id;
    if (providerId) {
      const ok = await providerToggleStar(providerId, next);
      if (!ok) toast.error(next ? "Couldn't star" : "Couldn't unstar");
    }
  }, [providerToggleStar, overrides]);

  const archiveOrDelete = useCallback(async (e: any, kind: 'archive' | 'delete') => {
    setHiddenIds(prev => {
      const next = new Set(prev);
      next.add(e.id);
      return next;
    });
    if (detail && (detail.id === e.id || detail.gmail_message_id === e.gmail_message_id)) {
      setDetail(null);
    }
    const providerId = e.gmail_message_id || e.id;
    if (providerId) {
      // Gmail trash covers both archive and delete from the briefing list.
      // The main Email pop-up does the same on these actions when no
      // separate "archive" endpoint is wired.
      const ok = await providerTrash(providerId);
      if (!ok) {
        // Roll back optimistic hide so the row reappears on failure.
        setHiddenIds(prev => {
          const next = new Set(prev);
          next.delete(e.id);
          return next;
        });
        toast.error(kind === 'archive' ? "Couldn't archive" : "Couldn't delete");
      } else {
        toast.success(kind === 'archive' ? 'Archived' : 'Deleted');
      }
    }
  }, [providerTrash, detail]);

  if (isLoading || !data) return <TabSkeleton />;

  const { emails, syncFailed } = data;

  // Apply the unread-only visibility filter BEFORE classification/grouping
  // so counts, groupings, and the rendered list all stay consistent.
  const withOverrides = emails
    .filter((e: any) => !hiddenIds.has(e.id))
    .filter((e: any) => !rundownClears.isCleared(rundownKey(e)))
    .map((e: any) => {
      const ov = overrides[e.id];
      return ov ? { ...e, ...ov } : e;
    });
  const visibleEmails = unreadOnly ? withOverrides.filter((e: any) => !e.is_read) : withOverrides;

  // Classify each email once
  const classified = visibleEmails.map((e: any) => ({ email: e, cats: classifyEmail(e, classifierEntities, orgCtx) }));

  // Filtered list
  const filtered = subTab === 'all'
    ? visibleEmails
    : classified.filter(c => c.cats.includes(subTab)).map(c => c.email);

  const EMPTY_MESSAGES: Record<EmailCategoryTab, string> = unreadOnly
    ? {
        all: 'No unread emails in this window.',
        clients_deals: 'No unread client or deal emails in this section.',
        asana_projects: 'No unread Asana emails in this section.',
        calendar: 'No unread calendar notifications in this section.',
      }
    : {
        all: 'No emails found in this window.',
        clients_deals: 'No client or deal emails since yesterday.',
        asana_projects: 'No Asana emails since yesterday.',
        calendar: 'No calendar notifications since yesterday.',
      };

  return (
    <div className="relative h-full flex flex-col min-h-0">
      <CreateTaskFromEmailDialog
        open={!!taskEmail}
        onOpenChange={(o) => { if (!o) setTaskEmail(null); }}
        email={taskEmail}
      />
      {/* Live-sync status: subtle inline indicator while a background Gmail
          refresh is in flight, plus a warning banner when the live fetch
          failed and we're showing cached results. */}
      {isFetching && (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground/70 px-1 pb-2">
          <RefreshCw className="h-3 w-3 animate-spin" />
          <span>Syncing latest emails…</span>
        </div>
      )}
      {syncFailed && !isFetching && (
        <div className="flex items-center gap-2 text-[11px] text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded-md px-2 py-1 mb-2">
          <AlertCircle className="h-3 w-3" />
          <span>Email sync may be delayed</span>
        </div>
      )}
      {/* Email list */}
      {/* Workspace: when no email is selected, the grouped list takes the full
          width. When an email IS selected, we switch to the same 3-column
          layout the main Email widget uses — list (left) / message (middle) /
          AI Assist (right) — without leaving the Email tab or opening a modal. */}
      <div
        className={cn(
          'flex-1 min-h-0 grid gap-3',
          detail
            ? 'grid-cols-[280px_minmax(0,1fr)_360px]'
            : 'grid-cols-1',
        )}
      >
        {/* LEFT — grouped briefing email list (preserves grouping/filters/counts) */}
        <div className="min-w-0 min-h-0 overflow-y-auto pr-1">
          {filtered.length === 0 ? (
            <EmptySection message={EMPTY_MESSAGES[subTab]} />
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {filtered.map((e: any) => {
                const autoLabels = evaluateAutoLabels(e);
                const isSelected =
                  detail && (detail.id === e.id || detail.gmail_message_id === e.gmail_message_id);
                return (
                  <EmailContextMenu
                      key={e.id}
                      isRead={!!e.is_read}
                      isStarred={!!e.is_starred}
                      threadId={e.thread_id || e.gmail_message_id || e.id}
                      onMarkRead={() => setReadState(e, true)}
                      onMarkUnread={() => setReadState(e, false)}
                      onToggleStar={() => setStarState(e)}
                      onArchive={() => archiveOrDelete(e, 'archive')}
                      onDelete={() => archiveOrDelete(e, 'delete')}
                      onCreateTask={() => setTaskEmail({
                        messageId: e.gmail_message_id || e.id,
                        threadId: e.thread_id || null,
                        subject: e.subject || null,
                        fromName: e.from_name || null,
                        fromEmail: e.from_email || null,
                        snippet: e.analysis?.summary || e.snippet || null,
                        receivedAt: e.received_at || null,
                      })}
                  >
                    <div className="relative group/rundown-email">
                    <BriefingRow
                      borderless
                      selected={!!isSelected}
                      icon={Mail}
                      title={e.subject || '(no subject)'}
                      subtitle={`${e.from_name || e.from_email || 'Unknown'} — ${e.analysis?.summary || e.snippet || ''}`}
                      badge={e.analysis?.category?.replace(/_/g, ' ') || 'email'}
                      badgeVariant={e.analysis?.priority === 'high' ? 'destructive' : 'secondary'}
                      time={e.received_at ? formatDistanceToNow(new Date(e.received_at), { addSuffix: true }) : ''}
                      onClick={() => setDetail(e)}
                      extras={
                        <>
                          <EmailCategoryChips email={e} />
                          <DealLinkChip email={e} onNavigate={onNavigate} />
                          {autoLabels.map(lbl => (
                            <Badge
                              key={lbl.id}
                              variant="outline"
                              className="text-[9px] h-[16px] px-1 border"
                              style={{
                                borderColor: `${lbl.color}55`,
                                backgroundColor: `${lbl.color}1F`,
                                color: lbl.color,
                              }}
                              title={lbl.description || lbl.name}
                            >
                              {lbl.name}
                            </Badge>
                          ))}
                        </>
                      }
                    />
                    <button
                      type="button"
                      aria-label="Hide from Rundown"
                      title="Hide from Rundown (does not mark as read)"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        const key = rundownKey(e);
                        if (!key) return;
                        if (detail && (detail.id === e.id || detail.gmail_message_id === e.gmail_message_id)) {
                          setDetail(null);
                        }
                        rundownClears.clear(key);
                        toast.success('Hidden from Rundown', {
                          description: 'Email is unchanged in your inbox.',
                          action: {
                            label: 'Undo',
                            onClick: () => rundownClears.restore(key),
                          },
                        });
                      }}
                      onPointerDown={(ev) => ev.stopPropagation()}
                      onMouseDown={(ev) => ev.stopPropagation()}
                      className="absolute top-2 right-2 inline-flex items-center justify-center h-6 w-6 rounded-full
                        border border-border/60 bg-background/70 text-muted-foreground opacity-0
                        group-hover/rundown-email:opacity-100 focus-visible:opacity-100 transition-opacity
                        hover:border-primary/50 hover:bg-primary/10 hover:text-primary
                        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    >
                      <EyeOff className="h-3 w-3" />
                    </button>
                    </div>
                  </EmailContextMenu>
                );
              })}
            </div>
          )}
        </div>

        {/* MIDDLE — selected email body. Only rendered in open state. */}
        {detail && (
          <BriefingEmailDetailPane
            key={detail.id || detail.gmail_message_id}
            email={detail}
            onBack={() => setDetail(null)}
            onOpenIntelligence={() => onNavigate('/email-intelligence')}
          />
        )}

        {/* RIGHT — same AI Assist panel used by the main Email pop-up. */}
        {detail && (
          <div className="min-w-0 min-h-0 overflow-y-auto rounded-xl border border-border/40 bg-white/[0.02]">
            <AiAssistInlinePanel
              key={`ai-${detail.id || detail.gmail_message_id}`}
              thread={briefingRowToThread(detail)}
              onClose={() => setDetail(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tab: Financial ─────────────────────────────────────────────
function FinancialTab({ enabled, onNavigate }: { enabled: boolean; onNavigate: (path: string) => void }) {
  const { user } = useAuth();
  const useCashflowEmbed = CASHFLOW_EMBED_EMAILS.has((user?.email || '').toLowerCase());

  if (useCashflowEmbed) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => onNavigate('/finance#dashboards')}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onNavigate('/finance#dashboards'); }}
        className="cursor-pointer rounded-lg ring-1 ring-transparent hover:ring-primary/30 transition"
        title="Open full Finance · Cashflow"
      >
        <WeeklyRundownReadOnlyCashflow />
      </div>
    );
  }

  const { data, isLoading } = useFinancialData(enabled);
  const [detail, setDetail] = useState<any>(null);

  if (isLoading || !data) return <TabSkeleton />;

  const { recentInvoices, recentExpenses } = data;
  const totalRev = recentInvoices.reduce((s: number, i: any) => s + (i.total_amt || 0), 0);
  const totalExp = recentExpenses.reduce((s: number, e: any) => s + (e.total_amt || 0), 0);

  return (
    <div className="relative h-full">
      {detail && (
        <DetailPopup title={detail.customer_name || detail.vendor_name || 'Financial Detail'} onClose={() => setDetail(null)}>
          <div className="space-y-3">
            <div className="text-sm"><strong>Amount:</strong> ${(detail.total_amt || 0).toLocaleString()}</div>
            <div className="text-sm"><strong>Date:</strong> {detail.txn_date}</div>
            {detail.doc_number && <div className="text-sm"><strong>Invoice #:</strong> {detail.doc_number}</div>}
            <Button size="sm" variant="outline" className="glass-border-soft" onClick={() => onNavigate('/metrics')}>
              Open Financial Dashboard <ExternalLink className="h-3 w-3 ml-1" />
            </Button>
          </div>
        </DetailPopup>
      )}

      <div className="grid grid-cols-2 gap-3 mb-5">
        <GlassStatCard label="Revenue (window)" value={`$${totalRev.toLocaleString()}`} sub={`${recentInvoices.length} invoices`} color="primary" />
        <GlassStatCard label="Expenses (window)" value={`$${totalExp.toLocaleString()}`} sub={`${recentExpenses.length} items`} color="destructive" />
      </div>

      <Section title="Weekly Cashflow">
        {recentInvoices.length === 0 && recentExpenses.length === 0 ? (
          <EmptySection message="No financial transactions in this window" />
        ) : (
          <>
            {recentInvoices.map((inv: any) => (
              <BriefingRow key={inv.id} icon={TrendingUp} title={`${inv.customer_name || 'Client'} — $${(inv.total_amt || 0).toLocaleString()}`} subtitle={inv.doc_number ? `Invoice #${inv.doc_number}` : undefined} badge="Revenue" badgeVariant="default" time={inv.txn_date} onClick={() => setDetail(inv)} />
            ))}
            {recentExpenses.map((exp: any) => (
              <BriefingRow key={exp.id} icon={DollarSign} title={`${exp.vendor_name || 'Expense'} — $${(exp.total_amt || 0).toLocaleString()}`} badge="Expense" badgeVariant="destructive" time={exp.txn_date} onClick={() => setDetail(exp)} />
            ))}
          </>
        )}
      </Section>

      <Section title="Tracking to Plan">
        <EmptySection message="Live plan-tracking data not yet connected — view full financial dashboard for details" />
      </Section>
    </div>
  );
}

// ── Tab: Pipeline & Clients ────────────────────────────────────
export function PipelineTab({
  enabled,
  onNavigate,
  targetDealOwnerName,
  targetUserId,
  briefingType = 'daily_briefing',
}: {
  enabled: boolean;
  onNavigate: (path: string) => void;
  targetDealOwnerName?: string;
  targetUserId?: string;
  briefingType?: string;
}) {
  const { data, isLoading } = usePipelineData(enabled, targetDealOwnerName);

  // Today's Follow-Ups — fully replaces the legacy "Your follow-ups for today"
  // email (permanently disabled platform-wide on 2026-04-29). Same source
  // data, now grouped by deal and surfaced in-app for every user.
  const { user } = useAuth();
  const { profile } = useProfile();
  const { isAdmin } = useCompany();
  // Demo account: treat every deal as assigned to the current user so the
  // Deal Rundown surfaces the full demo dataset instead of just owned
  // deals. Scoped strictly to the demo tenant — production unaffected.
  const isDemoAccount = useIsDemoAccount();
  // Only show the current user's own follow-ups (not the delegated view).
  const showOwnFollowups = enabled && !targetDealOwnerName;
  const { data: followupGroups = [] } = useMorningFollowups(showOwnFollowups);
  const showFollowups = showOwnFollowups && followupGroups.length > 0;

  // Per-user layout: hide Follow-Ups + collapse Recent Pipeline Activity
  // behind a drawer trigger for the allowlisted users.
  const useCollapsedActivityLayout = COLLAPSED_ACTIVITY_EMAILS.has(
    (user?.email || '').toLowerCase(),
  );

  // One-time cleanup of the legacy Grid/Memo view-mode preference.
  // The Grid view was removed; Memo is now the only render path.
  // We sweep the localStorage cache so a stale 'grid' value can't surface
  // anywhere else. The DB row (if any) is harmless — nothing reads the key.
  useEffect(() => {
    try { localStorage.removeItem('ui_pref_briefing_pipeline_view_mode'); } catch { /* ignore */ }
  }, []);

  const { scopedDeals, newDeals, riskDeals, stageChanges, recentActivity } = data || {
    newDeals: [], riskDeals: [], stageChanges: [], recentActivity: [], scopedDeals: [],
  };

  // Perf: derive tile-rendering deals synchronously from the in-memory
  // DealsContext so the memo list paints immediately on first open without
  // waiting on the activity_logs round-trip inside usePipelineData. Once the
  // query resolves, we prefer its scopedDeals (which match exactly).
  const { deals: allDealsCtx } = useDealsContext();
  const activePipelineIdSync = useActivePipelineId();
  const syncScopedDeals = useMemo(() => {
    if (!activePipelineIdSync) return [] as any[];
    const base = targetDealOwnerName
      ? getDealsForUserName(allDealsCtx as any[], targetDealOwnerName)
      : (allDealsCtx as any[]);
    const eligible = filterRundownEligibleDeals(base as any[], activePipelineIdSync, isAdmin);
    if (isAdmin) return eligible;
    const suppressed = ['archived', 'closed-lost', 'closed_lost', 'closedlost'];
    return eligible.filter((d: any) => !suppressed.includes((d.status || '').toLowerCase()));
  }, [allDealsCtx, activePipelineIdSync, targetDealOwnerName, isAdmin]);
  const effectiveScopedDeals = (scopedDeals as any[])?.length ? (scopedDeals as any[]) : syncScopedDeals;

  // ── Rundown-only "owner or has-active-task" filter ──
  // The Deals tab inside Daily/Niki Rundown surfaces should ONLY show deals
  // where the target user is the deal owner OR has at least one open task
  // assigned to them on that deal. This narrowing is intentionally local to
  // the Rundown surface — the main /deals pipeline and other pages are
  // unaffected.
  // IMPORTANT: only narrow when an explicit rundown target is passed in.
  // Without this guard, mounting PipelineTab on /deals or the standalone
  // Deals overlay (where no target is provided) would silently fall back to
  // the current user's profile name and hide every deal they don't own —
  // exactly the "No deals found" regression that surfaced after unifying
  // the Deals modal/tab implementations.
  // Admin bypass: on the main deals surfaces (/deals page + standalone Deals
  // overlay) no rundown target is passed, so admins must always receive the
  // full org-scoped active-deal set without owner narrowing. This guard makes
  // that explicit and decouples admin visibility from
  // targetDealOwnerName/targetUserId. Daily Rundown still narrows when an
  // explicit target is passed (intentional rundown scoping), even for admins.
  const hasRundownTarget = !!(targetDealOwnerName || targetUserId);
  const isRundownScope = hasRundownTarget;
  const effectiveUserId = isRundownScope ? (targetUserId ?? user?.id ?? null) : null;
  const effectiveOwnerName = isRundownScope
    ? (targetDealOwnerName ?? '').toString().trim().toLowerCase()
    : '';

  const { data: assignedTaskDealIds } = useQuery({
    queryKey: ['rundown-pipeline-task-deal-ids', effectiveUserId],
    enabled: enabled && isRundownScope && !!effectiveUserId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: rows } = await supabase
        .from('tasks')
        .select('deal_id')
        .eq('assigned_to', effectiveUserId!)
        .neq('status', 'complete')
        .is('archived_at', null)
        .not('deal_id', 'is', null);
      return new Set((rows || []).map(r => r.deal_id as string));
    },
  });

  const filteredDeals = useMemo(() => {
    const all = (effectiveScopedDeals as any[]) || [];
    // Admins on non-rundown surfaces always see the full active-deal set.
    if (isAdmin && !hasRundownTarget) return all;
    if (isDemoAccount) return all;
    if (!isRundownScope) return all;
    const taskSet = assignedTaskDealIds || new Set<string>();
    if (!effectiveOwnerName && taskSet.size === 0) return all;
    return all.filter(d => {
      const owner = (d.dealOwner || d.deal_owner || '').toString().trim().toLowerCase();
      return (effectiveOwnerName && owner === effectiveOwnerName) || taskSet.has(d.id);
    });
  }, [effectiveScopedDeals, effectiveOwnerName, assignedTaskDealIds, isRundownScope, isAdmin, hasRundownTarget, isDemoAccount]);

  // Dev diagnostic: surface unexpected empty results for authenticated users.
  useEffect(() => {
    if (!enabled || isLoading) return;
    if (filteredDeals.length === 0 && user?.id) {
      // eslint-disable-next-line no-console
      console.warn('[PipelineTab] empty deals result', {
        user: user.email,
        isAdmin,
        isRundownScope,
        targetDealOwnerName,
        targetUserId,
        scopedDealsCount: (scopedDeals as any[])?.length ?? 0,
      });
    }
  }, [enabled, isLoading, filteredDeals.length, user?.id, user?.email, isAdmin, isRundownScope, targetDealOwnerName, targetUserId, scopedDeals]);

  // All hooks above this line. Conditional early returns are safe below.
  // Only show the full skeleton if we genuinely have nothing to render —
  // i.e., the query is still loading AND we have no synchronous deals
  // (cold start before DealsContext hydrates).
  if (isLoading && !data && syncScopedDeals.length === 0) return <TabSkeleton />;

  // Empty state for delegated view with no owned/managed deals.
  const isDelegated = !!targetDealOwnerName;
  const hasAnyContent =
    newDeals.length + riskDeals.length + stageChanges.length + recentActivity.length > 0
    || filteredDeals.length > 0;
  if (isDelegated && !hasAnyContent) {
    return (
      <div className="p-1">
        <EmptySection message="No active deals assigned to you" />
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-0 max-w-full overflow-hidden">
      {/* Deals tab: single-region layout — right Follow-Ups column removed
          so the master/detail split inside PipelineMemoView fills the
          full width of the briefing modal. */}
      <div className="h-full min-w-0 max-w-full min-h-0 overflow-hidden">
        <Suspense
          fallback={
            <div className="pipeline-memo-page rounded-xl py-12 px-4 text-center">
              <p className="text-[#4a6070] text-sm font-light italic">Loading memo view…</p>
            </div>
          }
        >
          <PipelineMemoView
            deals={filteredDeals as any}
            dismissalScope={`rundown-deal:${briefingType}`}
            emptyMessage="No active deals assigned to you"
            onOpenDeal={id => onNavigate(`/deal/${id}`)}
          />
        </Suspense>
      </div>
    </div>
  );
}

// ── Status badge color mapping (matches deals pipeline color system) ──
function followupStatusBadgeClass(raw: string): string {
  const s = raw.toLowerCase().replace(/_/g, '-').trim();
  if (s === 'live-deal' || s === 'active' || s === 'on-track' || s === 'live') {
    return 'bg-green-500/20 text-green-400 border-green-500/30';
  }
  if (s === 'on-hold' || s === 'hold' || s === 'paused') {
    return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
  }
  if (s === 'at-risk') {
    return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
  }
  if (s === 'in-review' || s === 'reviewing' || s === 'review' || s.includes('review')) {
    return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
  }
  if (s === 'closed-lost' || s === 'archived' || s === 'off-track' || s === 'lost') {
    return 'bg-red-500/20 text-red-400 border-red-500/30';
  }
  return 'bg-white/10 text-white/60 border-white/10';
}

// ── Today's Follow-Ups — one tile per task ─────────────────────
function FollowupTiles({
  groups,
  onNavigate,
  assigneeName,
  briefingType = 'daily_briefing',
}: {
  groups: FollowupDealGroup[];
  onNavigate: (path: string) => void;
  assigneeName: string;
  briefingType?: string;
}) {
  const { dismiss, isDismissed, restore } = useDailyDismissals(`rundown-followup:${briefingType}`);
  const allTiles = groups.flatMap(g =>
    g.items.map(it => ({ ...it, company: g.company, stage: g.stage })),
  );
  const tiles = allTiles.filter(t => !isDismissed(t.key));
  const clearedTiles = allTiles.filter(t => isDismissed(t.key));
  return (
    <div>
      {tiles.length === 0 && clearedTiles.length > 0 && (
        <p className="text-xs italic text-muted-foreground px-1 py-2">
          All follow-ups cleared for today. See the Cleared section below — they’ll return after the 5 AM ET reset.
        </p>
      )}
      {tiles.map(t => {
        const due = t.dueAt ? new Date(t.dueAt) : null;
        const overdue = due ? isPast(due) && !isToday(due) : false;
        return (
          <div key={t.key} className="relative group/dismiss mb-2">
            <button
              type="button"
              aria-label="Dismiss for today"
              title="Dismiss for today (returns at 5 AM ET)"
              onClick={(e) => {
                e.stopPropagation();
                dismiss(t.key);
              }}
              className="absolute top-1.5 right-1.5 z-10 inline-flex items-center justify-center h-5 w-5 rounded-full text-white/50 hover:text-white hover:bg-white/10 opacity-0 group-hover/dismiss:opacity-100 focus:opacity-100 transition-opacity"
            >
              <X className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => t.dealId && onNavigate(`/deal/${t.dealId}`)}
              className="block w-full text-left rounded-lg bg-white/5 border border-white/10 p-3 pr-7 hover:bg-white/[0.08] transition-colors"
            >
            {/* Top: company + stage badge */}
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-sm font-semibold text-white truncate">{t.company}</span>
              {t.stage && (
                <span
                  className={cn(
                    'px-1.5 py-0.5 rounded text-[10px] font-medium border whitespace-nowrap',
                    followupStatusBadgeClass(t.stage),
                  )}
                >
                  {formatSlug(t.stage)}
                </span>
              )}
            </div>
            {/* Middle: task title */}
            <div className="text-sm font-medium text-white truncate mb-1.5">
              {t.title}
            </div>
            {/* Bottom: due date + assignee */}
            <div className="flex items-center justify-between gap-2">
              <span className={cn('text-xs', overdue ? 'text-red-400' : 'text-muted-foreground')}>
                {due ? `Due ${format(due, 'MMM d, h:mm a')}` : 'No due date'}
              </span>
              <span className="text-xs text-muted-foreground truncate max-w-[50%]">
                {assigneeName}
              </span>
            </div>
            </button>
          </div>
        );
      })}
      {clearedTiles.length > 0 && (
        <div className="mt-3 pt-3 border-t border-white/10">
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Cleared today ({clearedTiles.length})
            </span>
            <span className="text-[10px] text-muted-foreground/70">Resets 5 AM ET</span>
          </div>
          {clearedTiles.map(t => {
            const due = t.dueAt ? new Date(t.dueAt) : null;
            return (
              <div key={t.key} className="relative group/restore mb-2">
                <button
                  type="button"
                  aria-label="Restore"
                  title="Restore to active follow-ups"
                  onClick={(e) => {
                    e.stopPropagation();
                    restore(t.key);
                  }}
                  className="absolute top-1.5 right-1.5 z-10 text-[10px] text-white/60 hover:text-white px-1.5 py-0.5 rounded hover:bg-white/10 opacity-0 group-hover/restore:opacity-100 focus:opacity-100 transition-opacity"
                >
                  Restore
                </button>
                <button
                  type="button"
                  onClick={() => t.dealId && onNavigate(`/deal/${t.dealId}`)}
                  className="block w-full text-left rounded-lg bg-white/[0.02] border border-white/5 p-3 pr-16 hover:bg-white/[0.05] transition-colors opacity-60"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-sm font-semibold text-white/80 truncate line-through decoration-white/30">
                      {t.company}
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium border border-white/15 text-white/60 whitespace-nowrap">
                      Cleared
                    </span>
                  </div>
                  <div className="text-sm text-white/70 truncate mb-1.5">{t.title}</div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">
                      {due ? `Due ${format(due, 'MMM d, h:mm a')}` : 'No due date'}
                    </span>
                    <span className="text-xs text-muted-foreground truncate max-w-[50%]">
                      {assigneeName}
                    </span>
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Asana status chip ──────────────────────────────────────────
function StatusChip({ status }: { status: string | null }) {
  if (!status) return null;
  const colors: Record<string, string> = {
    on_track: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    at_risk: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    off_track: 'bg-red-500/20 text-red-300 border-red-500/30',
    on_hold: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
    complete: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  };
  const label = status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return (
    <span className={cn(
      'px-1.5 py-0.5 rounded text-[10px] font-semibold border whitespace-nowrap',
      colors[status] || 'bg-white/[0.05] text-muted-foreground glass-border-soft',
    )}>
      {label}
    </span>
  );
}

// ── Tab: Operational & Projects ────────────────────────────────
function OperationalTab({ enabled, onNavigate, targetAssigneeName }: { enabled: boolean; onNavigate: (path: string) => void; targetAssigneeName?: string }) {
  const { data, isLoading, error, refetch } = useOperationalData(enabled, targetAssigneeName);
  return <OperationalDashboard data={data ?? null} isLoading={isLoading} error={error as Error | null} onRefetch={refetch} />;
}

// ── Tab: Daily Rundown (combined swipe-through of sub-views) ──
type DailyRundownSubKey = 'agenda' | 'email' | 'deals' | 'catchup' | 'financial';
const DAILY_RUNDOWN_SUBS: { key: DailyRundownSubKey; label: string; icon: React.ElementType }[] = [
  { key: 'agenda', label: 'Agenda', icon: CalendarDays },
  { key: 'email', label: 'Email', icon: Mail },
  { key: 'deals', label: 'Deals', icon: GitBranch },
  { key: 'catchup', label: 'Catch Up & News', icon: Newspaper },
  { key: 'financial', label: 'Financial', icon: DollarSign },
];
const DAILY_RUNDOWN_PREF_KEY = 'daily_rundown_subviews_v1';

interface DailyRundownPref {
  order: DailyRundownSubKey[];
  hidden: DailyRundownSubKey[];
}

function loadDailyRundownPref(): DailyRundownPref {
  const fallback: DailyRundownPref = {
    order: DAILY_RUNDOWN_SUBS.map(s => s.key),
    hidden: [],
  };
  if (typeof globalThis === 'undefined' || !globalThis.localStorage) return fallback;
  try {
    const raw = globalThis.localStorage.getItem(DAILY_RUNDOWN_PREF_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<DailyRundownPref>;
    const valid = new Set(DAILY_RUNDOWN_SUBS.map(s => s.key));
    const order = (parsed.order ?? []).filter((k): k is DailyRundownSubKey => valid.has(k as DailyRundownSubKey));
    for (const k of fallback.order) if (!order.includes(k)) order.push(k);
    const hidden = (parsed.hidden ?? []).filter((k): k is DailyRundownSubKey => valid.has(k as DailyRundownSubKey));
    return { order, hidden };
  } catch {
    return fallback;
  }
}

function DailyRundownTab({
  enabled,
  onNavigate,
  targetUserId,
  targetAssigneeName,
  briefingType,
}: {
  enabled: boolean;
  onNavigate: (path: string) => void;
  targetUserId?: string;
  targetAssigneeName?: string;
  briefingType?: string;
}) {
  const { user: rundownUser } = useAuth();
  const canSeeFinancialSub = !!rundownUser?.email && new Set([
    'swilliams@5thline.co',
    'jturner@5thline.co',
    'jmoffitt@5thline.co',
  ]).has(rundownUser.email.toLowerCase());
  const [pref, setPref] = useState<DailyRundownPref>(() => loadDailyRundownPref());
  const [configOpen, setConfigOpen] = useState(false);
  const visible = useMemo(
    () => pref.order.filter(k => !pref.hidden.includes(k) && (k !== 'financial' || canSeeFinancialSub)),
    [pref, canSeeFinancialSub],
  );
  const [active, setActive] = useState<DailyRundownSubKey>(() => visible[0] ?? 'agenda');

  useEffect(() => {
    if (!visible.includes(active)) setActive(visible[0] ?? 'agenda');
  }, [visible, active]);

  const savePref = useCallback((next: DailyRundownPref) => {
    setPref(next);
    try {
      globalThis.localStorage?.setItem(DAILY_RUNDOWN_PREF_KEY, JSON.stringify(next));
    } catch { /* ignore */ }
  }, []);

  const toggleHidden = (k: DailyRundownSubKey) => {
    const isHidden = pref.hidden.includes(k);
    const hidden = isHidden ? pref.hidden.filter(x => x !== k) : [...pref.hidden, k];
    if (!isHidden && pref.hidden.length + 1 >= pref.order.length) return; // keep at least one
    savePref({ ...pref, hidden });
  };

  const move = (k: DailyRundownSubKey, dir: -1 | 1) => {
    const idx = pref.order.indexOf(k);
    const next = idx + dir;
    if (idx < 0 || next < 0 || next >= pref.order.length) return;
    const order = [...pref.order];
    [order[idx], order[next]] = [order[next], order[idx]];
    savePref({ ...pref, order });
  };

  const currentIdx = visible.indexOf(active);
  const canPrev = currentIdx > 0;
  const canNext = currentIdx >= 0 && currentIdx < visible.length - 1;
  const goPrev = () => { if (canPrev) setActive(visible[currentIdx - 1]); };
  const goNext = () => { if (canNext) setActive(visible[currentIdx + 1]); };

  const currentMeta = DAILY_RUNDOWN_SUBS.find(s => s.key === active);

  return (
    <div className="flex flex-col h-[78vh] min-h-[500px] min-w-0">
      {/* Sub-tab strip (folder / browser-style tabs) + gear */}
      <div className="flex items-end gap-2 min-w-0 border-b border-white/10 pl-1">
        <div className="flex items-end gap-1 flex-wrap min-w-0 flex-1 -mb-px">
          {visible.map(k => {
            const meta = DAILY_RUNDOWN_SUBS.find(s => s.key === k)!;
            const Icon = meta.icon;
            const isActive = k === active;
            return (
              <button
                key={k}
                onClick={() => setActive(k)}
                className={cn(
                  'relative inline-flex items-center gap-1.5 px-3.5 pt-2 pb-2 text-xs font-medium transition-colors',
                  'rounded-t-md border border-b-0 -mb-px',
                  isActive
                    ? 'bg-[#0a1428] text-foreground border-white/15 shadow-[0_-1px_0_0_rgba(190,220,255,0.08)_inset]'
                    : 'bg-white/[0.02] text-muted-foreground/70 border-transparent hover:bg-white/[0.05] hover:text-foreground/80',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {meta.label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute left-0 right-0 -bottom-px h-px bg-[#0a1428]"
                  />
                )}
              </button>
            );
          })}
        </div>
        <div className="pb-1.5">
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setConfigOpen(o => !o)}
            aria-label="Configure Daily Rundown views"
            className={cn(
              'h-8 w-8 inline-flex items-center justify-center rounded-full border',
              configOpen
                ? 'bg-primary/15 text-primary border-primary/30'
                : 'bg-white/[0.03] text-muted-foreground/70 glass-border-soft hover:bg-white/[0.06] hover:text-foreground/80',
            )}
          >
            <Settings className="h-3.5 w-3.5" />
          </button>
          {configOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setConfigOpen(false)} />
              <div className="absolute right-0 top-full mt-2 z-40 w-72 rounded-lg border border-border/60 bg-popover shadow-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-foreground">Configure views</p>
                  <button
                    type="button"
                    onClick={() => setConfigOpen(false)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground/70 mb-2">Toggle visibility and reorder.</p>
                <ul className="space-y-1">
                  {pref.order
                    .filter(k => k !== 'financial' || canSeeFinancialSub)
                    .map((k, idx) => {
                    const meta = DAILY_RUNDOWN_SUBS.find(s => s.key === k)!;
                    const Icon = meta.icon;
                    const isHidden = pref.hidden.includes(k);
                    return (
                      <li
                        key={k}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white/[0.04]"
                      >
                        <GripVertical className="h-3.5 w-3.5 text-muted-foreground/50" />
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className={cn('flex-1 text-xs', isHidden ? 'text-muted-foreground/50 line-through' : 'text-foreground')}>
                          {meta.label}
                        </span>
                        <button
                          type="button"
                          onClick={() => move(k, -1)}
                          disabled={idx === 0}
                          className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                          aria-label={`Move ${meta.label} up`}
                        >
                          <ChevronLeft className="h-3 w-3 rotate-90" />
                        </button>
                        <button
                          type="button"
                          onClick={() => move(k, 1)}
                          disabled={idx === pref.order.length - 1}
                          className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                          aria-label={`Move ${meta.label} down`}
                        >
                          <ChevronRight className="h-3 w-3 rotate-90" />
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleHidden(k)}
                          className={cn(
                            'ml-1 inline-flex items-center justify-center h-5 w-5 rounded border',
                            isHidden
                              ? 'border-border/50 text-muted-foreground/50'
                              : 'border-primary/40 bg-primary/15 text-primary',
                          )}
                          aria-label={isHidden ? `Show ${meta.label}` : `Hide ${meta.label}`}
                        >
                          {isHidden ? <EyeOff className="h-3 w-3" /> : <Check className="h-3 w-3" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </>
          )}
        </div>
        </div>
      </div>

      {/* Sub-view body with left/right scroll arrows */}
      <div className="relative flex-1 min-h-0 min-w-0">
        {canPrev && (
          <button
            onClick={goPrev}
            aria-label="Previous view"
            className="absolute left-1 top-1/2 -translate-y-1/2 z-20 h-9 w-9 flex items-center justify-center rounded-full bg-white/[0.08] backdrop-blur-md glass-border-soft text-muted-foreground hover:text-foreground hover:bg-white/[0.15]"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
        {canNext && (
          <button
            onClick={goNext}
            aria-label="Next view"
            className="absolute right-1 top-1/2 -translate-y-1/2 z-20 h-9 w-9 flex items-center justify-center rounded-full bg-white/[0.08] backdrop-blur-md glass-border-soft text-muted-foreground hover:text-foreground hover:bg-white/[0.15]"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        )}

        <div key={active} className="h-full w-full min-h-0 min-w-0 overflow-hidden flex flex-col">
          {active === 'agenda' && (
            <div className="flex-1 min-h-0 overflow-y-auto pr-1">
              <AgendaIntel />
            </div>
          )}
          {active === 'email' && (
            <div className="flex-1 min-h-0 overflow-y-auto pr-1">
              <EmailTab
                enabled={enabled}
                onNavigate={onNavigate}
                targetUserId={targetUserId}
                subTab="all"
                unreadOnly
              />
            </div>
          )}
          {active === 'deals' && (
            <AddToDealCalendarProvider>
              <div className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden">
                <PipelineTab
                  enabled={enabled}
                  onNavigate={onNavigate}
                  targetDealOwnerName={targetAssigneeName}
                  targetUserId={targetUserId}
                  briefingType={briefingType}
                />
              </div>
            </AddToDealCalendarProvider>
          )}
          {active === 'catchup' && (
            <div className="flex-1 min-h-0 overflow-y-auto pr-1">
              <CatchUpTab enabled={enabled} onNavigate={onNavigate} />
            </div>
          )}
          {active === 'financial' && (
            <div className="flex-1 min-h-0 overflow-y-auto pr-1">
              <FinancialTab enabled={enabled} onNavigate={onNavigate} />
            </div>
          )}
          {!currentMeta && (
            <EmptySection message="Enable a view from the gear menu to begin." />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Tab icons & labels ─────────────────────────────────────────
const ALL_TABS = [
  { value: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { value: 'daily_rundown', label: 'Daily Rundown', icon: Sunrise },
  { value: 'agenda', label: 'Agenda', icon: CalendarDays },
  { value: 'catchup', label: 'Catch Up & News', icon: Newspaper },
  { value: 'email', label: 'Email', icon: Mail },
  { value: 'financial', label: 'Financial', icon: DollarSign },
  { value: 'pipeline', label: 'Deals', icon: GitBranch },
  { value: 'operational', label: 'Tasks', icon: ListChecks },
  // Approval Queue + End of Day are consolidated into a single "Today"
  // surface (decisions, wrap-ups, and the today slice of tasks).
  { value: 'today', label: 'Today', icon: Sunset },
] as const;

// ── Main modal component ───────────────────────────────────────
export function DailyBriefingModal({ open, onOpenChange, title = 'Dashboard', targetUserId, targetAssigneeName, excludeTabs, initialTab, briefingType = 'daily_briefing' }: DailyBriefingModalProps) {
  const navigate = useNavigate();
  const window = useBriefingWindow();
  const { user: currentUser } = useAuth();
  const END_OF_DAY_ALLOWLIST = useMemo(
    () => new Set([
      'jmoffitt@5thline.co',
      'swilliams@5thline.co',
      'jturner@5thline.co',
      'nheikali@5thline.co',
      'ppina@5thline.co',
      'ffustinoni@5thline.co',
    ]),
    [],
  );
  const canSeeEndOfDay = !!currentUser?.email && END_OF_DAY_ALLOWLIST.has(currentUser.email.toLowerCase());
  const { hasAccess: isFifthLine } = useNaitivePipelineAccess();
  // Financial tab/section is restricted to a small allowlist —
  // swilliams, jturner, jmoffitt only. Hides both the standalone
  // Financial sidebar tab AND the Daily Rundown > Financial sub-view.
  const FINANCIAL_ALLOWLIST = useMemo(
    () => new Set(['swilliams@5thline.co', 'jturner@5thline.co', 'jmoffitt@5thline.co']),
    [],
  );
  const canSeeFinancial = !!currentUser?.email && FINANCIAL_ALLOWLIST.has(currentUser.email.toLowerCase());
  // Users who keep the legacy "Operational" projects dashboard. Everyone
  // else sees the "My Tasks" experience (same as the My Tasks pop-up).
  const OPERATIONAL_FULL_ALLOWLIST = useMemo(
    () => new Set([
      'jturner@5thline.co',
      'jmoffitt@5thline.co',
      'mclark@5thline.co',
      'swilliams@5thline.co',
    ]),
    [],
  );
  const canSeeOperationalFull = !!currentUser?.email && OPERATIONAL_FULL_ALLOWLIST.has(currentUser.email.toLowerCase());
  const eodOutstandingCount = useEndOfDayOutstandingCount();
  const { enabled: queueEnabled } = useApprovalQueueAccess();
  const { data: queueItems = [] } = useAiActionQueue();
  const { data: dealAccessRequests = [] } = useDealAccessRequests();
  const queueBadgeCount = queueEnabled
    ? consolidatedAiQueueCount(queueItems) + (dealAccessRequests?.length || 0)
    : 0;
  const { overdueCount: tasksOverdueCount, dueTodayCount: tasksDueTodayCount } = useTaskNotifications();
  const tasksBadgeCount = tasksOverdueCount + tasksDueTodayCount;
  const TABS = useMemo(
    () =>
      ALL_TABS.map(t => {
        if (t.value === 'operational' && !canSeeOperationalFull) {
          return { ...t, label: 'Tasks' };
        }
        return t;
      }).filter(t => {
        if (excludeTabs?.includes(t.value as any)) return false;
        if (t.value === 'today' && !canSeeEndOfDay && !queueEnabled) return false;
        if (t.value === 'dashboard' && !isFifthLine) return false;
        if (t.value === 'financial' && !canSeeFinancial) return false;
        // Agenda, Catch Up & News, and Email are now hosted exclusively
        // inside the Daily Rundown tab — hide them from the left sidebar.
        if (t.value === 'agenda' || t.value === 'catchup' || t.value === 'email') return false;
        // "Deals" (pipeline) tab retired from the dashboard pop-up.
        if (t.value === 'pipeline') return false;
        return true;
      }),
    [excludeTabs, canSeeEndOfDay, isFifthLine, canSeeFinancial, canSeeOperationalFull, queueEnabled],
  );
  const resolveInitialTab = () => {
    if (initialTab && TABS.find(t => t.value === initialTab)) return initialTab;
    return TABS[0]?.value ?? 'catchup';
  };
  const [activeTab, setActiveTab] = useState<string>(resolveInitialTab());
  const [slideDirection, setSlideDirection] = useState<'left' | 'right' | null>(null);
  const [, startTabTransition] = useTransition();
  const [operationalView, setOperationalView] = useState<'operations' | 'mytasks'>('mytasks');

  // Render tab bodies immediately on open — the shell + sidebar + header
  // and the active tab's first paint must all happen on the same frame
  // so the Daily Rundown feels instant. Reconciliation of the heavy
  // subtree is wrapped in `startTabTransition` on tab change so it never
  // blocks user interaction, and the modal-wide Dialog animation has been
  // shortened (see DialogContent className overrides below).
  const contentReady = open;

  // When the modal (re)opens, honor `initialTab` so callers can deep-link
  // into a specific tab (e.g., "Pipeline & Clients" from the Deal Rundown
  // dashboard tile).
  useEffect(() => {
    if (open && initialTab && TABS.find(t => t.value === initialTab)) {
      setActiveTab(initialTab);
    }
  }, [open, initialTab, TABS]);

  // Email sub-tab + unread filter state lifted to the parent so the controls
  // can render inside the unified top header band (alongside the page title /
  // date and the primary tab strip), instead of sitting lower in the body.
  const [emailSubTab, setEmailSubTab] = useState<EmailCategoryTab>('all');
  const [emailUnreadOnly, setEmailUnreadOnly] = useState<boolean>(true);

  // Reset unread-only to ON every time the modal (re)opens, matching the
  // documented default behavior for the Email tab.
  useEffect(() => {
    if (open) {
      setEmailUnreadOnly(true);
      setEmailSubTab('all');
    }
  }, [open]);

  // Fetch email + classifier data at the parent level (cached via React Query
  // — calling these hooks here and inside <EmailTab> shares the same cache)
  // so we can compute live sub-tab counts in the header without prop-drilling
  // them up from the tab body.
  const isEmailActive = activeTab === 'email';
  const { data: emailHeaderData } = useEmailData(open && isEmailActive, targetUserId);
  const { entities: classifierEntities, orgCtx } = useEmailClassifierData();

  const emailCounts = useMemo<Record<EmailCategoryTab, number>>(() => {
    const empty = { all: 0, clients_deals: 0, asana_projects: 0, calendar: 0 } as Record<EmailCategoryTab, number>;
    if (!emailHeaderData?.emails) return empty;
    const visible = emailUnreadOnly
      ? emailHeaderData.emails.filter((e: any) => !e.is_read)
      : emailHeaderData.emails;
    const classified = visible.map((e: any) => classifyEmail(e, classifierEntities, orgCtx));
    return {
      all: visible.length,
      clients_deals: classified.filter(c => c.includes('clients_deals')).length,
      asana_projects: classified.filter(c => c.includes('asana_projects')).length,
      calendar: classified.filter(c => c.includes('calendar')).length,
    };
  }, [emailHeaderData, emailUnreadOnly, classifierEntities, orgCtx]);

  // If active tab gets excluded (prop change), fall back to first available
  useEffect(() => {
    if (!TABS.find(t => t.value === activeTab)) {
      setActiveTab(TABS[0]?.value ?? 'catchup');
    }
  }, [TABS, activeTab]);

  const currentIndex = TABS.findIndex(t => t.value === activeTab);
  const canGoLeft = currentIndex > 0;
  const canGoRight = currentIndex < TABS.length - 1;

  const goTo = useCallback((direction: 'left' | 'right') => {
    const next = direction === 'right' ? currentIndex + 1 : currentIndex - 1;
    if (next < 0 || next >= TABS.length) return;
    setSlideDirection(direction === 'right' ? 'left' : 'right');
    // Commit tab switches synchronously — wrapping in `useTransition`
    // caused subsequent tab clicks to be dropped when the previously
    // active tab's subtree (e.g., Approval Queue) rendered heavily,
    // leaving the user stuck on that tab.
    setActiveTab(TABS[next].value);
    setTimeout(() => setSlideDirection(null), 300);
  }, [currentIndex, TABS]);

  const handleTabChange = useCallback((value: string) => {
    const newIdx = TABS.findIndex(t => t.value === value);
    setSlideDirection(newIdx > currentIndex ? 'left' : 'right');
    setActiveTab(value);
    setTimeout(() => setSlideDirection(null), 300);
  }, [currentIndex, TABS]);

  const handleNavigate = (path: string) => {
    // Open deal/company links in a new tab so the briefing modal stays open
    // and preserves its current state.
    if (typeof globalThis !== 'undefined' && path.startsWith('/deal/')) {
      globalThis.open?.(path, '_blank', 'noopener,noreferrer');
      return;
    }
    onOpenChange(false);
    navigate(path);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          useCarouselSwipeClass(),
          'popup-shell-surface w-[min(95vw,1600px)] max-w-[95vw] h-[min(92dvh,1000px)] max-h-[92dvh] p-0 overflow-hidden rounded-2xl border-transparent',
          // Fast, no-shudder open: skip zoom/slide and run a brief fade only.
          // The base Dialog applies zoom-in-95 + slide-in + duration-200; we
          // override with explicit identity transforms and a shorter duration
          // so the modal feels instant on click.
          '!duration-100 data-[state=open]:!zoom-in-100 data-[state=open]:!slide-in-from-top-0 data-[state=open]:!slide-in-from-left-0',
        )}
        overlayClassName="bg-black/80 !duration-100"
      >
        <div className="flex flex-col h-full min-h-0 min-w-0 relative max-w-full overflow-hidden">
          <Tabs value={activeTab} onValueChange={handleTabChange} className="flex-1 min-h-0 min-w-0 flex flex-row overflow-hidden">
            {/* Left vertical icon rail */}
            <TooltipProvider delayDuration={150}>
              <TabsPrimitive.List
                aria-orientation="vertical"
                className="shrink-0 flex flex-col items-center gap-2 w-14 sm:w-16 py-3 border-r border-border/40 bg-white/[0.02]"
              >
                {TABS.map(tab => {
                  const Icon = tab.icon;
                  const badgeCount =
                    tab.value === 'today'
                      ? eodOutstandingCount + queueBadgeCount
                      : tab.value === 'operational'
                        ? tasksBadgeCount
                        : 0;
                  return (
                    <Tooltip key={tab.value}>
                      <TooltipTrigger asChild>
                        <TabsPrimitive.Trigger
                          value={tab.value}
                          aria-label={tab.label}
                          className={cn(
                            'relative h-10 w-10 inline-flex items-center justify-center rounded-lg',
                            'text-muted-foreground/70 hover:text-foreground hover:bg-white/[0.06]',
                            'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                            'data-[state=active]:bg-primary/15 data-[state=active]:text-primary',
                          )}
                        >
                          <Icon className="h-5 w-5" />
                          {badgeCount > 0 && (
                            <span
                              aria-label={`${tab.label} has ${badgeCount} outstanding`}
                              className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold leading-none ring-2 ring-background tabular-nums pointer-events-none"
                            >
                              {badgeCount > 99 ? '99+' : badgeCount}
                            </span>
                          )}
                        </TabsPrimitive.Trigger>
                      </TooltipTrigger>
                      <TooltipContent side="right" align="center" sideOffset={6}>
                        {tab.label}{badgeCount > 0 ? ` (${badgeCount})` : ''}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </TabsPrimitive.List>
            </TooltipProvider>

            {/* Main column: single-row header + content */}
            <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
              <div
                className="glass-divider-b glass-surface-1 min-w-0"
                style={{
                  paddingLeft: 'clamp(0.75rem, 1.4vw, 1.5rem)',
                  paddingRight: 'clamp(2.5rem, 3vw, 3.25rem)',
                  paddingTop: 'clamp(0.5rem, 1vw, 1rem)',
                  paddingBottom: 'clamp(0.5rem, 0.9vw, 0.75rem)',
                  rowGap: 'clamp(0.5rem, 0.9vw, 0.75rem)',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <h2 className="text-base sm:text-lg font-bold text-foreground tracking-tight whitespace-nowrap">{title}</h2>
                  <span aria-hidden="true" className="h-4 w-px bg-border/60 shrink-0" />
                  <p className="text-[11px] sm:text-xs text-muted-foreground/70 truncate min-w-0">
                    {window.label} • {format(new Date(), 'EEEE, MMMM d, yyyy')}
                  </p>
                </div>

              {isEmailActive && (
                <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                  {EMAIL_CATEGORY_TABS.map(t => (
                    <button
                      key={t.key}
                      onClick={() => setEmailSubTab(t.key)}
                      className={cn(
                        'px-3 py-1 rounded-full text-xs font-medium transition-all duration-150 border',
                        emailSubTab === t.key
                          ? 'bg-primary/15 text-primary border-primary/30'
                          : 'bg-white/[0.03] text-muted-foreground/70 glass-border-soft hover:bg-white/[0.06] hover:text-foreground/80',
                      )}
                    >
                      {t.label}
                      <span className={cn(
                        'ml-1.5 text-[10px] tabular-nums',
                        emailSubTab === t.key ? 'text-primary/70' : 'text-muted-foreground/40',
                      )}>
                        {emailCounts[t.key]}
                      </span>
                    </button>
                  ))}

                  <div
                    className="ml-auto inline-flex items-center rounded-full border border-border/40 bg-white/[0.03] p-0.5"
                    role="group"
                    aria-label="Filter emails by read state"
                  >
                    <button
                      type="button"
                      onClick={() => setEmailUnreadOnly(true)}
                      aria-pressed={emailUnreadOnly}
                      className={cn(
                        'px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-colors',
                        emailUnreadOnly
                          ? 'bg-primary/20 text-primary'
                          : 'text-muted-foreground/70 hover:text-foreground/80',
                      )}
                    >
                      Unread only
                    </button>
                    <button
                      type="button"
                      onClick={() => setEmailUnreadOnly(false)}
                      aria-pressed={!emailUnreadOnly}
                      className={cn(
                        'px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-colors',
                        !emailUnreadOnly
                          ? 'bg-primary/20 text-primary'
                          : 'text-muted-foreground/70 hover:text-foreground/80',
                      )}
                    >
                      All emails
                    </button>
                  </div>
                </div>
              )}
              </div>

              <div className="flex-1 min-h-0 min-w-0 overflow-hidden relative">
              {/* Left arrow */}
              {canGoLeft && (
                <button
                  onClick={() => goTo('left')}
                  className={cn(
                    'absolute left-1.5 top-1/2 -translate-y-1/2 z-20',
                    'h-9 w-9 sm:h-10 sm:w-10 min-h-[44px] min-w-[44px] flex items-center justify-center',
                    'rounded-full bg-white/[0.08] backdrop-blur-md glass-border-soft',
                    'text-muted-foreground hover:text-foreground hover:bg-white/[0.15] hover:shadow-lg',
                    'transition-all duration-200',
                  )}
                  aria-label="Previous tab"
                >
                  <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5" />
                </button>
              )}

              {/* Right arrow */}
              {canGoRight && (
                <button
                  onClick={() => goTo('right')}
                  className={cn(
                    'absolute right-1.5 top-1/2 -translate-y-1/2 z-20',
                    'h-9 w-9 sm:h-10 sm:w-10 min-h-[44px] min-w-[44px] flex items-center justify-center',
                    'rounded-full bg-white/[0.08] backdrop-blur-md glass-border-soft',
                    'text-muted-foreground hover:text-foreground hover:bg-white/[0.15] hover:shadow-lg',
                    'transition-all duration-200',
                  )}
                  aria-label="Next tab"
                >
                  <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5" />
                </button>
              )}

              {activeTab === 'pipeline' || activeTab === 'today' ? (
                // Pipeline and End of Day tabs manage their own master/detail
                // scrolling (left list + right pane). Wrapping them in the
                // outer ScrollArea collapses the inner scroll regions, so we
                // render directly inside a bounded flex container.
                <div
                  className="h-full w-full max-w-full flex flex-col min-h-0 min-w-0 overflow-hidden"
                  style={{
                    paddingLeft: 'clamp(0.75rem, 1.4vw, 1.5rem)',
                    paddingRight: 'clamp(0.75rem, 1.4vw, 1.5rem)',
                    paddingTop: 'clamp(0.5rem, 1vw, 1rem)',
                    paddingBottom: activeTab === 'today' ? '0.125rem' : 'clamp(0.75rem, 1.2vw, 1.5rem)',
                  }}
                >
                  <AddToDealCalendarProvider>
                    <div
                      key={activeTab}
                      className={cn(
                        'flex-1 min-h-0 min-w-0 max-w-full flex flex-col overflow-hidden',
                        slideDirection === 'left' && 'animate-slide-in-from-right',
                        slideDirection === 'right' && 'animate-slide-in-from-left',
                      )}
                    >
                      {contentReady && activeTab === 'pipeline' && (
                        <PipelineTab
                          enabled={open}
                          onNavigate={handleNavigate}
                          targetDealOwnerName={targetAssigneeName}
                          targetUserId={targetUserId}
                          briefingType={briefingType}
                        />
                      )}
                      {contentReady && activeTab === 'today' && (
                        <TodayTab
                          enabled={open}
                          onClose={() => onOpenChange(false)}
                          onNavigate={handleNavigate}
                          targetAssigneeName={targetAssigneeName}
                          targetUserId={targetUserId}
                          briefingType={briefingType}
                        />
                      )}
                    </div>
                  </AddToDealCalendarProvider>
                </div>
              ) : (
              <ScrollArea
                className="h-full w-full max-w-full"
                style={{
                  paddingLeft: 'clamp(0.75rem, 1.4vw, 1.5rem)',
                  paddingRight: 'clamp(0.75rem, 1.4vw, 1.5rem)',
                  paddingTop: 'clamp(0.5rem, 1vw, 1rem)',
                  paddingBottom: activeTab === 'today' ? '0.125rem' : 'clamp(0.5rem, 1vw, 1rem)',
                }}
              >
                <AddToDealCalendarProvider>
                  <div
                    key={activeTab}
                    className={cn(
                      'min-w-0 max-w-full',
                      activeTab === 'today' && 'h-full min-h-0',
                      slideDirection === 'left' && 'animate-slide-in-from-right',
                      slideDirection === 'right' && 'animate-slide-in-from-left',
                    )}
                  >
                  {contentReady && activeTab === 'agenda' && (
                    <div className="h-[70vh] min-h-[500px] flex flex-col min-h-0">
                      {targetUserId === MOFFITT_USER_ID && (
                        <MoffittDealRundown enabled={open} />
                      )}
                      <div className="flex-1 min-h-0"><AgendaIntel /></div>
                    </div>
                  )}
                  {contentReady && activeTab === 'catchup' && <CatchUpTab enabled={open} onNavigate={handleNavigate} />}
                  {contentReady && activeTab === 'dashboard' && (
                    <>
                      <div className="h-[78vh] min-h-[500px] flex flex-col min-h-0 -mx-3 -my-2">
                        <DashboardModalLazyHost embedded open onOpenChange={() => {}} fallback={<TabSkeleton />} />
                      </div>
                    </>
                  )}
                  {contentReady && activeTab === 'daily_rundown' && (
                    <DailyRundownTab
                      enabled={open}
                      onNavigate={handleNavigate}
                      targetUserId={targetUserId}
                      targetAssigneeName={targetAssigneeName}
                      briefingType={briefingType}
                    />
                  )}
                  {contentReady && activeTab === 'email' && (
                    <EmailTab
                      enabled={open}
                      onNavigate={handleNavigate}
                      targetUserId={targetUserId}
                      subTab={emailSubTab}
                      unreadOnly={emailUnreadOnly}
                    />
                  )}
                  {contentReady && activeTab === 'financial' && <FinancialTab enabled={open} onNavigate={handleNavigate} />}
                  {contentReady && activeTab === 'operational' && (
                    canSeeOperationalFull ? (
                      <div className="flex flex-col h-full min-h-0">
                        <div className="flex items-center gap-1 p-1 mb-3 rounded-lg bg-white/[0.03] glass-border-softer self-start">
                          <button
                            type="button"
                            onClick={() => setOperationalView('mytasks')}
                            className={cn(
                              'px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                              operationalView === 'mytasks'
                                ? 'bg-white/[0.08] text-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground',
                            )}
                          >
                            My Tasks
                          </button>
                          <button
                            type="button"
                            onClick={() => setOperationalView('operations')}
                            className={cn(
                              'px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                              operationalView === 'operations'
                                ? 'bg-white/[0.08] text-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground',
                            )}
                          >
                            Operations
                          </button>
                        </div>
                        <div className="flex-1 min-h-0">
                          {operationalView === 'operations' ? (
                            <OperationalTab enabled={open} onNavigate={handleNavigate} targetAssigneeName={targetAssigneeName} />
                          ) : (
                            <Suspense
                              fallback={
                                <div className="flex h-full w-full items-center justify-center">
                                  <Skeleton className="h-6 w-40" />
                                </div>
                              }
                            >
                              <div className="h-full w-full overflow-hidden">
                                <LazyTasksPage overlayMode />
                              </div>
                            </Suspense>
                          )}
                        </div>
                      </div>
                    ) : (
                      <Suspense
                        fallback={
                          <div className="flex h-full w-full items-center justify-center">
                            <Skeleton className="h-6 w-40" />
                          </div>
                        }
                      >
                        <div className="h-full w-full overflow-hidden">
                          <LazyTasksPage overlayMode />
                        </div>
                      </Suspense>
                    )
                  )}
                  </div>
                </AddToDealCalendarProvider>
              </ScrollArea>
              )}
              </div>
            </div>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
