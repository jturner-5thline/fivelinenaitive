import { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from 'react';
import { format, formatDistanceToNow, isPast, isToday } from 'date-fns';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useCarouselSwipeClass } from '@/hooks/useCarouselSwipeClass';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Newspaper, Mail, DollarSign, GitBranch, ListChecks,
  AlertCircle, ExternalLink, TrendingUp,
  FileText, X, ChevronRight, ChevronLeft, RefreshCw,
  Check, Clock, ArrowUpRight,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import {
  useBriefingWindow,
  useEmailData,
  useFinancialData,
  usePipelineData,
  useOperationalData,
} from '@/hooks/useDailyBriefingData';
import { OperationalDashboard } from './operational/OperationalDashboard';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useDailyDismissals } from '@/hooks/useDailyDismissals';

// Reused from the main Email widget pop-up so the AI Assist experience
// (prompts, actions, summaries, suggested replies) is identical here.
import { AiAssistInlinePanel } from '@/components/deal/email/AiAssistInlinePanel';
import { EmailBodyRenderer } from '@/components/deal/email/EmailBodyRenderer';
import { useFullEmailMessage, useFullEmailThread } from '@/components/deal/email/useFullEmailMessage';
import type { EmailThread, MockEmail } from '@/components/deal/email/mockEmailData';
import { EmailAttachmentsStrip, detectAttachmentFallbackReason } from '@/components/deal/email/EmailAttachmentsStrip';
// Reuse the exact same right-click menu the main Email pop-up uses so
// behavior, actions, ordering, and label wiring stay identical between
// Daily Briefing email rows and the Email widget pop-up.
import { EmailContextMenu } from '@/components/deal/email/EmailContextMenu';
import { useGmail } from '@/hooks/useGmail';
import { toast } from 'sonner';
// Code-split: keeps the Memo view (and @tanstack/react-virtual) out of the
// initial Daily Briefing bundle. Only loaded when the user actually opens the
// Pipeline & Clients tab in Memo mode.
const PipelineMemoView = lazy(() =>
  import('@/pages/pipeline/PipelineMemoView').then(m => ({ default: m.PipelineMemoView })),
);
import { useAuth } from '@/contexts/AuthContext';
import { useMorningFollowups, useFollowupActions, type FollowupDealGroup, type FollowupItem } from '@/hooks/useMorningFollowups';
import { useDealsContext } from '@/contexts/DealsContext';
import type { Deal } from '@/types/deal';
import { RecentPipelineActivitySection } from './briefingPrimitives';
import { formatSlug } from '@/utils/dealTypeLabels';

interface DailyBriefingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Title shown in the modal header. Defaults to "Daily Briefing".
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
  excludeTabs?: Array<'catchup' | 'email' | 'financial' | 'pipeline' | 'operational'>;
  /**
   * Tab to select when the modal opens (and re-opens). If the value is
   * excluded or unknown, falls back to the first available tab.
   */
  initialTab?: 'catchup' | 'email' | 'financial' | 'pipeline' | 'operational';
}

// Initial tab to open with. Defaults to the first available tab.
export type BriefingTabValue = 'catchup' | 'email' | 'financial' | 'pipeline' | 'operational';

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
function FeaturedNewsTile({ item }: { item: NewsfeedItem }) {
  const hasImage = !!item.image_url;
  return (
    <a
      href={item.url !== '#' ? item.url : undefined}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        GLASS_CARD,
        'group overflow-hidden flex flex-col transition-all duration-200',
        'hover:bg-white/[0.06] hover:glass-border-soft hover:shadow-[0_4px_20px_hsl(var(--primary)/0.1)]',
        item.url !== '#' && 'cursor-pointer',
      )}
    >
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
function StandardNewsTile({ item }: { item: NewsfeedItem }) {
  return (
    <a
      href={item.url !== '#' ? item.url : undefined}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        GLASS_ROW,
        'group overflow-hidden flex gap-0 transition-all duration-200',
        'hover:bg-white/[0.06] hover:glass-border-soft hover:shadow-[0_2px_12px_hsl(var(--primary)/0.06)]',
        item.url !== '#' && 'cursor-pointer',
      )}
    >
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

  const filtered = items.filter(item => activeTopics.has(item.topic));
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
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin')} />
        </Button>
      </div>

      {filtered.length === 0 ? (
        <EmptySection message="No news items match your selected topics" />
      ) : (
        <>
          {/* Featured tiles — top 2 stories */}
          {featured.length > 0 && (
            <div className={cn('grid gap-3', featured.length === 1 ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2')}>
              {featured.map(item => <FeaturedNewsTile key={item.id} item={item} />)}
            </div>
          )}

          {/* Standard compact grid */}
          {standard.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {standard.map(item => <StandardNewsTile key={item.id} item={item} />)}
            </div>
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
  const { data, isLoading } = useEmailData(enabled, targetUserId);
  const [detail, setDetail] = useState<any>(null);
  const { entities: classifierEntities, orgCtx } = useEmailClassifierData();
  const { evaluate: evaluateAutoLabels } = useAutoEmailLabelEvaluator();
  const { markRead: providerMarkRead, toggleStar: providerToggleStar, trashMessage: providerTrash } = useGmail();
  // Local hide-set so archive/delete actions remove rows immediately even
  // before the next briefing data refetch lands. Behavior parity with the
  // main Email pop-up which optimistically removes the affected row.
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set());
  // Local read/star overrides so the row reflects the action instantly.
  const [overrides, setOverrides] = useState<Record<string, { is_read?: boolean; is_starred?: boolean }>>({});

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

  const { emails } = data;

  // Apply the unread-only visibility filter BEFORE classification/grouping
  // so counts, groupings, and the rendered list all stay consistent.
  const withOverrides = emails
    .filter((e: any) => !hiddenIds.has(e.id))
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
                  >
                    <div>
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
function PipelineTab({
  enabled,
  onNavigate,
  targetDealOwnerName,
}: {
  enabled: boolean;
  onNavigate: (path: string) => void;
  targetDealOwnerName?: string;
}) {
  const { data, isLoading } = usePipelineData(enabled, targetDealOwnerName);

  // Today's Follow-Ups — fully replaces the legacy "Your follow-ups for today"
  // email (permanently disabled platform-wide on 2026-04-29). Same source
  // data, now grouped by deal and surfaced in-app for every user.
  const { user } = useAuth();
  // Only show the current user's own follow-ups (not the delegated view).
  const showOwnFollowups = enabled && !targetDealOwnerName;
  const { data: followupGroups = [] } = useMorningFollowups(showOwnFollowups);
  const showFollowups = showOwnFollowups && followupGroups.length > 0;

  // One-time cleanup of the legacy Grid/Memo view-mode preference.
  // The Grid view was removed; Memo is now the only render path.
  // We sweep the localStorage cache so a stale 'grid' value can't surface
  // anywhere else. The DB row (if any) is harmless — nothing reads the key.
  useEffect(() => {
    try { localStorage.removeItem('ui_pref_briefing_pipeline_view_mode'); } catch { /* ignore */ }
  }, []);

  if (isLoading && !data) return <TabSkeleton />;

  const { scopedDeals, newDeals, riskDeals, stageChanges, recentActivity } = data || {
    newDeals: [], riskDeals: [], stageChanges: [], recentActivity: [], scopedDeals: [],
  };

  // Empty state for delegated view with no owned/managed deals.
  const isDelegated = !!targetDealOwnerName;
  const hasAnyContent =
    newDeals.length + riskDeals.length + stageChanges.length + recentActivity.length > 0
    || (scopedDeals as any[]).length > 0;
  if (isDelegated && !hasAnyContent) {
    return (
      <div className="p-1">
        <EmptySection message={`No deals assigned to ${targetDealOwnerName} as Owner or Manager`} />
      </div>
    );
  }

  return (
    <div className="relative h-full flex flex-col lg:flex-row min-h-0">
      {/* LEFT: Deals (primary focus) — full width on mobile/tablet, 75% on desktop */}
      <div className="w-full lg:w-3/4 min-h-0 overflow-y-auto lg:pr-3">
        <Suspense
          fallback={
            <div className="pipeline-memo-page rounded-xl py-12 px-4 text-center">
              <p className="text-[#4a6070] text-sm font-light italic">Loading memo view…</p>
            </div>
          }
        >
          <PipelineMemoView
            deals={scopedDeals as any}
            emptyMessage={
              isDelegated
                ? `No active deals for ${targetDealOwnerName}.`
                : 'No active deals to summarize.'
            }
            onOpenDeal={id => onNavigate(`/deal/${id}`)}
          />
        </Suspense>
      </div>

      {/* RIGHT: 25% sidebar on desktop, stacks under deals below lg */}
      <div className="w-full lg:w-1/4 min-h-0 flex flex-col border-t lg:border-t-0 lg:border-l border-white/10 pt-3 lg:pt-0 lg:pl-3 mt-3 lg:mt-0">
        <div className="flex-1 min-h-0 overflow-y-auto pr-1 border-l-2 border-l-purple-500 pl-2">
          <Section title="Today's Follow-Ups">
            {showFollowups ? (
              <FollowupTiles
                groups={followupGroups}
                onNavigate={onNavigate}
                assigneeName={
                  (user?.user_metadata as any)?.full_name ||
                  user?.email?.split('@')[0] ||
                  'You'
                }
              />
            ) : (
              <EmptySection message="No follow-ups for today" />
            )}
          </Section>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto pr-1 border-t border-white/10 pt-3 mt-3">
          {recentActivity.length > 0 ? (
            <RecentPipelineActivitySection
              recentActivity={recentActivity}
              onRowClick={(a) => a?.deal_id && onNavigate(`/deal/${a.deal_id}`)}
              onNavigate={onNavigate}
            />
          ) : (
            <Section title="Recent Pipeline Activity">
              <EmptySection message="No pipeline activity since 5 PM ET yesterday" />
            </Section>
          )}
        </div>
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
}: {
  groups: FollowupDealGroup[];
  onNavigate: (path: string) => void;
  assigneeName: string;
}) {
  const { dismiss, isDismissed } = useDailyDismissals('rundown-followup');
  const allTiles = groups.flatMap(g =>
    g.items.map(it => ({ ...it, company: g.company, stage: g.stage })),
  );
  const tiles = allTiles.filter(t => !isDismissed(t.key));
  if (tiles.length === 0 && allTiles.length > 0) {
    return (
      <p className="text-xs italic text-muted-foreground px-1 py-2">
        All follow-ups dismissed for today. They’ll return after the 5 AM ET reset.
      </p>
    );
  }
  return (
    <div>
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

// ── Tab icons & labels ─────────────────────────────────────────
const ALL_TABS = [
  { value: 'catchup', label: 'Catch Up & News', icon: Newspaper },
  { value: 'email', label: 'Email', icon: Mail },
  { value: 'financial', label: 'Financial', icon: DollarSign },
  { value: 'pipeline', label: 'Deals', icon: GitBranch },
  { value: 'operational', label: 'Operational', icon: ListChecks },
] as const;

// ── Main modal component ───────────────────────────────────────
export function DailyBriefingModal({ open, onOpenChange, title = 'Daily Briefing', targetUserId, targetAssigneeName, excludeTabs, initialTab }: DailyBriefingModalProps) {
  const navigate = useNavigate();
  const window = useBriefingWindow();
  const TABS = useMemo(
    () => ALL_TABS.filter(t => !excludeTabs?.includes(t.value as any)),
    [excludeTabs],
  );
  const resolveInitialTab = () => {
    if (initialTab && TABS.find(t => t.value === initialTab)) return initialTab;
    return TABS[0]?.value ?? 'catchup';
  };
  const [activeTab, setActiveTab] = useState<string>(resolveInitialTab());
  const [slideDirection, setSlideDirection] = useState<'left' | 'right' | null>(null);

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
    setActiveTab(TABS[next].value);
    // Clear animation class after transition
    setTimeout(() => setSlideDirection(null), 300);
  }, [currentIndex]);

  const handleTabChange = useCallback((value: string) => {
    const newIdx = TABS.findIndex(t => t.value === value);
    setSlideDirection(newIdx > currentIndex ? 'left' : 'right');
    setActiveTab(value);
    setTimeout(() => setSlideDirection(null), 300);
  }, [currentIndex]);

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
          'max-w-[95vw] w-[95vw] h-[92vh] max-h-[92vh] p-0 overflow-hidden rounded-2xl',
          'bg-background/60 backdrop-blur-3xl',
          'border-transparent glass-border-soft',
          'shadow-[0_32px_80px_-20px_hsl(var(--primary)/0.25),inset_0_1px_0_hsl(0_0%_100%/0.04)]',
        )}
        overlayClassName="bg-black/80"
      >
        <div className="flex flex-col h-full relative">
          {/* Unified top header — title + date on the left, primary tab
              navigation on the right. When the Email tab is active, a second
              row beneath surfaces the email sub-tabs and the unread/all
              segmented control so all navigation lives in one cohesive band. */}
          <Tabs value={activeTab} onValueChange={handleTabChange} className="flex-1 flex flex-col overflow-hidden">
            <div className="px-6 pt-4 pb-3 glass-divider-b glass-surface-1 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-foreground tracking-tight">{title}</h2>
                  <p className="text-xs text-muted-foreground/60 mt-0.5 truncate">
                    {window.label} • {format(new Date(), 'EEEE, MMMM d, yyyy')}
                  </p>
                </div>
                <TabsList className="h-auto flex flex-nowrap gap-1 overflow-x-auto whitespace-nowrap max-w-full">
                  {TABS.map(tab => {
                    const Icon = tab.icon;
                    return (
                      <TabsTrigger
                        key={tab.value}
                        value={tab.value}
                        className="shrink-0 gap-1.5 text-xs px-3 py-1.5"
                      >
                        <Icon className="h-3.5 w-3.5" />
                        <span>{tab.label}</span>
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
              </div>

              {isEmailActive && (
                <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto whitespace-nowrap">
                  {EMAIL_CATEGORY_TABS.map(t => (
                    <button
                      key={t.key}
                      onClick={() => setEmailSubTab(t.key)}
                      className={cn(
                        'shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-all duration-150 border',
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

            <div className="flex-1 overflow-hidden relative">
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

              <ScrollArea className={cn('px-6 pt-4 pb-6', isEmailActive ? 'h-[calc(92vh-180px)]' : 'h-[calc(92vh-120px)]')}>
                <div
                  key={activeTab}
                  className={cn(
                    slideDirection === 'left' && 'animate-slide-in-from-right',
                    slideDirection === 'right' && 'animate-slide-in-from-left',
                  )}
                >
                  {activeTab === 'catchup' && <CatchUpTab enabled={open} onNavigate={handleNavigate} />}
                  {activeTab === 'email' && (
                    <EmailTab
                      enabled={open}
                      onNavigate={handleNavigate}
                      targetUserId={targetUserId}
                      subTab={emailSubTab}
                      unreadOnly={emailUnreadOnly}
                    />
                  )}
                  {activeTab === 'financial' && <FinancialTab enabled={open} onNavigate={handleNavigate} />}
                  {activeTab === 'pipeline' && <PipelineTab enabled={open} onNavigate={handleNavigate} targetDealOwnerName={targetAssigneeName} />}
                  {activeTab === 'operational' && <OperationalTab enabled={open} onNavigate={handleNavigate} targetAssigneeName={targetAssigneeName} />}
                </div>
              </ScrollArea>
            </div>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
