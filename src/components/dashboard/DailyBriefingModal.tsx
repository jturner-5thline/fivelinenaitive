import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { format, formatDistanceToNow, isPast, isToday } from 'date-fns';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Newspaper, Mail, DollarSign, GitBranch, ListChecks,
  AlertCircle, ArrowRight, ExternalLink, Clock, TrendingUp,
  FileText, X, ChevronRight, RefreshCw,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import {
  useBriefingWindow,
  useCatchUpData,
  useEmailData,
  useFinancialData,
  usePipelineData,
  useOperationalData,
  type NewsItem,
} from '@/hooks/useDailyBriefingData';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface DailyBriefingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ── Glass surface classes ──────────────────────────────────────
const GLASS_SURFACE = 'bg-background/40 backdrop-blur-2xl border border-white/[0.06]';
const GLASS_CARD = 'bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-lg';
const GLASS_ROW = 'bg-white/[0.02] border border-white/[0.05] rounded-lg backdrop-blur-sm';

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
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
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
}: {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
  badge?: string;
  badgeVariant?: 'default' | 'secondary' | 'destructive' | 'outline';
  time?: string;
  onClick?: () => void;
}) {
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={e => { if (onClick && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick(); } }}
      className={cn(
        GLASS_ROW,
        'flex items-start gap-3 p-3',
        'transition-all duration-200',
        onClick && 'cursor-pointer hover:bg-white/[0.06] hover:border-white/[0.1] hover:shadow-[0_2px_12px_hsl(var(--primary)/0.08)]',
      )}
    >
      <div className="p-1.5 rounded-md bg-primary/10 shrink-0 mt-0.5">
        <Icon className="h-3.5 w-3.5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{title}</p>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {badge && (
          <Badge variant={badgeVariant || 'secondary'} className="text-[10px] border-white/[0.08]">
            {badge}
          </Badge>
        )}
        {time && <span className="text-[10px] text-muted-foreground whitespace-nowrap">{time}</span>}
        {onClick && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />}
      </div>
    </div>
  );
}

// ── Section wrapper ────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h4 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-2 px-0.5">{title}</h4>
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
const NEWS_CATEGORY_CONFIG: Record<string, { icon: React.ElementType; badge: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pipeline: { icon: GitBranch, badge: 'Pipeline', variant: 'default' },
  email: { icon: Mail, badge: 'Email', variant: 'secondary' },
  risk: { icon: AlertCircle, badge: 'Risk', variant: 'destructive' },
  milestone: { icon: ListChecks, badge: 'Milestone', variant: 'destructive' },
  general: { icon: Newspaper, badge: 'Update', variant: 'outline' },
};

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
      <div className="absolute inset-0 border border-white/[0.06] rounded-[inherit]" />
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
        'hover:bg-white/[0.06] hover:border-white/[0.1] hover:shadow-[0_4px_20px_hsl(var(--primary)/0.1)]',
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
                TOPIC_COLORS[item.topic] || 'bg-white/[0.05] text-muted-foreground border-white/[0.08]',
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
                TOPIC_COLORS[item.topic] || 'bg-white/[0.05] text-muted-foreground border-white/[0.08]',
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
        'hover:bg-white/[0.06] hover:border-white/[0.1] hover:shadow-[0_2px_12px_hsl(var(--primary)/0.06)]',
        item.url !== '#' && 'cursor-pointer',
      )}
    >
      <NewsImage src={item.image_url} topic={item.topic} className="w-20 min-h-full shrink-0 rounded-l-lg" variant="standard" />
      <div className="p-3 flex flex-col flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1">
          <span className={cn(
            'px-1.5 py-px rounded text-[9px] font-semibold border',
            TOPIC_COLORS[item.topic] || 'bg-white/[0.05] text-muted-foreground border-white/[0.08]',
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
        <Button variant="outline" size="sm" className="border-white/[0.08]" onClick={handleRefresh}>
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
                  : 'bg-white/[0.02] text-muted-foreground/40 border-white/[0.04] hover:bg-white/[0.04]',
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

// ── Email sub-tab types ────────────────────────────────────────
type EmailSubTab = 'all' | 'clients_deals' | 'asana_projects';

function classifyEmail(e: any): EmailSubTab[] {
  const cats: EmailSubTab[] = [];
  const category = e.analysis?.category || '';
  const fromEmail = (e.from_email || '').toLowerCase();
  const subject = (e.subject || '').toLowerCase();

  // Clients & Deals
  if (['deal_update', 'terms_discussion', 'due_diligence', 'lender_communication', 'follow_up_needed'].includes(category) ||
      e.analysis?.deal_name) {
    cats.push('clients_deals');
  }

  // Asana & Projects
  if (fromEmail.includes('asana.com') || fromEmail.includes('mail.asana.com') ||
      subject.includes('asana') || (e.snippet || '').toLowerCase().includes('asana')) {
    cats.push('asana_projects');
  }

  return cats;
}

const EMAIL_SUB_TABS: { key: EmailSubTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'clients_deals', label: 'Clients & Deals' },
  { key: 'asana_projects', label: 'Asana & Projects' },
];

// ── Tab: Email ─────────────────────────────────────────────────
function EmailTab({ enabled, onNavigate }: { enabled: boolean; onNavigate: (path: string) => void }) {
  const { data, isLoading } = useEmailData(enabled);
  const [detail, setDetail] = useState<any>(null);
  const [subTab, setSubTab] = useState<EmailSubTab>('all');

  if (isLoading || !data) return <TabSkeleton />;

  const { emails } = data;

  // Classify each email once
  const classified = emails.map((e: any) => ({ email: e, cats: classifyEmail(e) }));

  // Counts per sub-tab
  const counts: Record<EmailSubTab, number> = {
    all: emails.length,
    clients_deals: classified.filter(c => c.cats.includes('clients_deals')).length,
    asana_projects: classified.filter(c => c.cats.includes('asana_projects')).length,
  };

  // Filtered list
  const filtered = subTab === 'all'
    ? emails
    : classified.filter(c => c.cats.includes(subTab)).map(c => c.email);

  const EMPTY_MESSAGES: Record<EmailSubTab, string> = {
    all: 'No emails found in this window.',
    clients_deals: 'No client or deal emails since yesterday.',
    asana_projects: 'No Asana emails since yesterday.',
  };

  return (
    <div className="relative h-full">
      {detail && (
        <DetailPopup title={detail.subject || 'Email Detail'} onClose={() => setDetail(null)}>
          <div className="space-y-3">
            <div className="text-sm"><strong>From:</strong> {detail.from_name} ({detail.from_email})</div>
            <div className="text-sm"><strong>Subject:</strong> {detail.subject}</div>
            {detail.analysis?.summary && <div className="text-sm"><strong>AI Summary:</strong> {detail.analysis.summary}</div>}
            {detail.analysis?.deal_name && <div className="text-sm"><strong>Related Deal:</strong> {detail.analysis.deal_name}</div>}
            <div className="text-sm text-muted-foreground">{detail.snippet}</div>
            <Button size="sm" variant="outline" className="border-white/[0.08]" onClick={() => onNavigate('/email-intelligence')}>
              Open Email Intelligence <ExternalLink className="h-3 w-3 ml-1" />
            </Button>
          </div>
        </DetailPopup>
      )}

      {/* Sub-tab pills */}
      <div className="flex items-center gap-1.5 mb-4">
        {EMAIL_SUB_TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setSubTab(t.key)}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-medium transition-all duration-150 border',
              subTab === t.key
                ? 'bg-primary/15 text-primary border-primary/30'
                : 'bg-white/[0.03] text-muted-foreground/70 border-white/[0.06] hover:bg-white/[0.06] hover:text-foreground/80',
            )}
          >
            {t.label}
            <span className={cn(
              'ml-1.5 text-[10px] tabular-nums',
              subTab === t.key ? 'text-primary/70' : 'text-muted-foreground/40',
            )}>
              {counts[t.key]}
            </span>
          </button>
        ))}
      </div>

      {/* Email list */}
      {filtered.length === 0 ? (
        <EmptySection message={EMPTY_MESSAGES[subTab]} />
      ) : (
        <div className="space-y-1.5">
          {filtered.map((e: any) => (
            <BriefingRow
              key={e.id}
              icon={Mail}
              title={e.subject || '(no subject)'}
              subtitle={`${e.from_name || e.from_email || 'Unknown'} — ${e.analysis?.summary || e.snippet || ''}`}
              badge={e.analysis?.category?.replace(/_/g, ' ') || 'email'}
              badgeVariant={e.analysis?.priority === 'high' ? 'destructive' : 'secondary'}
              time={e.received_at ? formatDistanceToNow(new Date(e.received_at), { addSuffix: true }) : ''}
              onClick={() => setDetail(e)}
            />
          ))}
        </div>
      )}
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
            <Button size="sm" variant="outline" className="border-white/[0.08]" onClick={() => onNavigate('/metrics')}>
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
function PipelineTab({ enabled, onNavigate }: { enabled: boolean; onNavigate: (path: string) => void }) {
  const { data, isLoading } = usePipelineData(enabled);
  const { data: catchUpData, isLoading: catchUpLoading } = useCatchUpData(enabled);
  const [detail, setDetail] = useState<NewsItem | null>(null);
  const [dealDetail, setDealDetail] = useState<any>(null);

  if ((isLoading && !data) || (catchUpLoading && !catchUpData)) return <TabSkeleton />;

  const { newDeals, riskDeals, stageChanges, recentActivity } = data || { newDeals: [], riskDeals: [], stageChanges: [], recentActivity: [] };
  const highlights = catchUpData?.highlights || [];
  const newsItems = catchUpData?.newsItems || [];
  const dealAlerts = (catchUpData?.alerts || []).filter((a: any) => a.deal_id);

  return (
    <div className="relative h-full">
      {detail && (
        <DetailPopup title={detail.title} onClose={() => setDetail(null)}>
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">{detail.summary}</div>
            {detail.meta?.from_name && <div className="text-sm"><strong>From:</strong> {detail.meta.from_name}</div>}
            {detail.meta?.lender_name && <div className="text-sm"><strong>Lender:</strong> {detail.meta.lender_name}</div>}
            {detail.timestamp && <div className="text-sm"><strong>Time:</strong> {format(new Date(detail.timestamp), 'PPp')}</div>}
            {detail.action && (
              <Button size="sm" variant="outline" className="border-white/[0.08]" onClick={() => onNavigate(detail.action!.path)}>
                {detail.action.label} <ExternalLink className="h-3 w-3 ml-1" />
              </Button>
            )}
          </div>
        </DetailPopup>
      )}
      {dealDetail && !detail && (
        <DetailPopup title={dealDetail.company || dealDetail.description || 'Deal Detail'} onClose={() => setDealDetail(null)}>
          <div className="space-y-3">
            {dealDetail.company && <div className="text-sm"><strong>Company:</strong> {dealDetail.company}</div>}
            {dealDetail.stage && <div className="text-sm"><strong>Stage:</strong> {dealDetail.stage}</div>}
            {dealDetail.manager && <div className="text-sm"><strong>Manager:</strong> {dealDetail.manager}</div>}
            {dealDetail.activity_type && <div className="text-sm"><strong>Type:</strong> {dealDetail.activity_type}</div>}
            {dealDetail.description && <div className="text-sm">{dealDetail.description}</div>}
            {dealDetail.user_display_name && <div className="text-sm"><strong>By:</strong> {dealDetail.user_display_name}</div>}
            {dealDetail.created_at && <div className="text-sm"><strong>Time:</strong> {format(new Date(dealDetail.created_at), 'PPp')}</div>}
            <Button size="sm" variant="outline" className="border-white/[0.08]" onClick={() => onNavigate(`/deal/${dealDetail.id || dealDetail.deal_id}`)}>
              Open Deal <ExternalLink className="h-3 w-3 ml-1" />
            </Button>
          </div>
        </DetailPopup>
      )}

      {dealAlerts.length > 0 && (
        <Section title="Priority Deal Alerts">
          {dealAlerts.map((a: any) => (
            <BriefingRow
              key={a.id}
              icon={AlertCircle}
              title={a.description}
              subtitle={a.user_display_name || undefined}
              badge={a.activity_type}
              badgeVariant="destructive"
              time={formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
              onClick={() => setDetail({
                id: a.id, category: 'general', title: a.description,
                summary: `${a.activity_type} by ${a.user_display_name || 'System'}`,
                timestamp: a.created_at,
                action: a.deal_id ? { label: 'Open Deal', path: `/deal/${a.deal_id}` } : undefined,
              })}
            />
          ))}
        </Section>
      )}

      <Section title="Today's Highlights">
        {highlights.length === 0 ? (
          <EmptySection message="No noteworthy highlights in this window" />
        ) : (
          highlights.map((h: any, i: number) => (
            <BriefingRow key={i} icon={TrendingUp} title={h.label} subtitle={h.value} badge="Summary" badgeVariant="outline" />
          ))
        )}
      </Section>

      <Section title="What Happened — News Feed">
        {newsItems.length === 0 ? (
          <EmptySection message="No deal-related news in this window" />
        ) : (
          newsItems.map((item: NewsItem) => {
            const cfg = NEWS_CATEGORY_CONFIG[item.category] || NEWS_CATEGORY_CONFIG.general;
            return (
              <BriefingRow
                key={item.id}
                icon={cfg.icon}
                title={item.title}
                subtitle={item.summary}
                badge={cfg.badge}
                badgeVariant={cfg.variant}
                time={item.timestamp ? formatDistanceToNow(new Date(item.timestamp), { addSuffix: true }) : ''}
                onClick={() => setDetail(item)}
              />
            );
          })
        )}
      </Section>

      <Section title="New Opportunities">
        {newDeals.length === 0 ? <EmptySection message="No new deals added in this window" /> : newDeals.map((d: any) => (
          <BriefingRow key={d.id} icon={GitBranch} title={d.company} subtitle={`Stage: ${d.stage} • Manager: ${d.manager || 'Unassigned'}`} badge="New" badgeVariant="default" onClick={() => setDealDetail(d)} />
        ))}
      </Section>

      <Section title="Stage Changes">
        {stageChanges.length === 0 ? <EmptySection message="No stage changes in this window" /> : stageChanges.filter((sc: any) => sc.activity_type !== 'deal_created').map((sc: any) => (
          <BriefingRow key={sc.id} icon={ArrowRight} title={sc.description} time={formatDistanceToNow(new Date(sc.created_at), { addSuffix: true })} onClick={() => setDealDetail(sc)} />
        ))}
      </Section>

      <Section title="Potential Pipeline & Client Risks">
        {riskDeals.length === 0 ? <EmptySection message="No risk signals detected" /> : riskDeals.map((d: any) => (
          <BriefingRow key={d.id} icon={AlertCircle} title={d.company} subtitle={`${d.isFlagged ? 'Flagged' : 'Stale'} • Stage: ${d.stage}`} badge={d.isFlagged ? 'Flagged' : 'At Risk'} badgeVariant={d.isFlagged ? 'destructive' : 'secondary'} onClick={() => setDealDetail(d)} />
        ))}
      </Section>

      <Section title="Recent Pipeline Activity">
        {recentActivity.length === 0 ? <EmptySection message="No pipeline activity since 5 PM ET yesterday" /> : recentActivity.map((a: any) => (
          <BriefingRow key={a.id} icon={Clock} title={a.description} subtitle={a.user_display_name || undefined} badge={a.activity_type.replace(/_/g, ' ')} badgeVariant="outline" time={formatDistanceToNow(new Date(a.created_at), { addSuffix: true })} onClick={() => setDealDetail(a)} />
        ))}
      </Section>
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
      colors[status] || 'bg-white/[0.05] text-muted-foreground border-white/[0.08]',
    )}>
      {label}
    </span>
  );
}

// ── Tab: Operational & Projects ────────────────────────────────
function OperationalTab({ enabled, onNavigate }: { enabled: boolean; onNavigate: (path: string) => void }) {
  const { data, isLoading, error, refetch } = useOperationalData(enabled);
  const [detail, setDetail] = useState<any>(null);
  const [drilldown, setDrilldown] = useState<'projects' | 'past_due' | 'today' | 'upcoming' | null>(null);
  const [assigneeFilter, setAssigneeFilter] = useState<string>('__all__');

  const rawOverdue = data?.overdue ?? [];
  const rawToday = data?.today ?? [];
  const rawUpcoming = data?.upcoming ?? [];
  const projects = data?.projects ?? [];
  const rawCounts = data?.counts ?? { projects: 0, overdue: 0, today: 0, upcoming: 0 };

  // Build assignee options from all tasks
  const assigneeOptions = useMemo(() => {
    const all = [...rawOverdue, ...rawToday, ...rawUpcoming];
    const map = new Map<string, number>();
    let unassignedCount = 0;
    for (const t of all) {
      if (t.assignee) {
        map.set(t.assignee, (map.get(t.assignee) || 0) + 1);
      } else {
        unassignedCount++;
      }
    }
    const sorted = Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    const opts: { value: string; label: string }[] = [
      { value: '__all__', label: `All (${all.length})` },
    ];
    if (unassignedCount > 0) opts.push({ value: '__unassigned__', label: `Unassigned (${unassignedCount})` });
    for (const [name, count] of sorted) {
      opts.push({ value: name, label: `${name} (${count})` });
    }
    return opts;
  }, [rawOverdue, rawToday, rawUpcoming]);

  // Apply assignee filter
  const overdue = useMemo(() => {
    if (assigneeFilter === '__all__') return rawOverdue;
    if (assigneeFilter === '__unassigned__') return rawOverdue.filter((t: any) => !t.assignee);
    return rawOverdue.filter((t: any) => t.assignee === assigneeFilter);
  }, [rawOverdue, assigneeFilter]);

  const todayTasks = useMemo(() => {
    if (assigneeFilter === '__all__') return rawToday;
    if (assigneeFilter === '__unassigned__') return rawToday.filter((t: any) => !t.assignee);
    return rawToday.filter((t: any) => t.assignee === assigneeFilter);
  }, [rawToday, assigneeFilter]);

  const upcomingTasks = useMemo(() => {
    if (assigneeFilter === '__all__') return rawUpcoming;
    if (assigneeFilter === '__unassigned__') return rawUpcoming.filter((t: any) => !t.assignee);
    return rawUpcoming.filter((t: any) => t.assignee === assigneeFilter);
  }, [rawUpcoming, assigneeFilter]);

  const counts = useMemo(() => ({
    projects: rawCounts.projects,
    overdue: overdue.length,
    today: todayTasks.length,
    upcoming: upcomingTasks.length,
  }), [rawCounts.projects, overdue.length, todayTasks.length, upcomingTasks.length]);

  if (isLoading || !data) return <TabSkeleton />;

  // Only show full error if we have zero usable data
  const hasUsableData = data?.counts && (data.counts.projects > 0 || data.counts.overdue > 0 || data.counts.today > 0 || data.counts.upcoming > 0);
  if ((error || data?.error || !data?.counts) && !hasUsableData) {
    const rawMsg = data?.error || (error instanceof Error ? error.message : 'Unable to load operational data');
    const isRateLimit = rawMsg.includes('429') || rawMsg.toLowerCase().includes('rate limit');
    const msg = isRateLimit
      ? 'Asana data is temporarily unavailable due to rate limits. Please try again in a moment.'
      : rawMsg;
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <AlertCircle className="w-8 h-8 text-destructive/60" />
        <p className="text-sm text-muted-foreground text-center max-w-xs">{msg}</p>
        <div className="flex gap-3">
          <button onClick={() => refetch()} className="text-xs text-primary hover:underline">Retry</button>
          <button onClick={() => onNavigate('/integrations')} className="text-xs text-muted-foreground hover:underline">Reconnect Asana →</button>
        </div>
      </div>
    );
  }

  const openAsana = (url?: string | null) => {
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="relative h-full">
      {detail && (
        <DetailPopup title={detail.name || 'Item Detail'} onClose={() => setDetail(null)}>
          <div className="space-y-3">
            <div className="text-sm"><strong>Item:</strong> {detail.name}</div>
            {detail.project_name && <div className="text-sm"><strong>Project:</strong> {detail.project_name}</div>}
            {detail.assignee && <div className="text-sm"><strong>Assignee:</strong> {detail.assignee}</div>}
            {detail.owner && <div className="text-sm"><strong>Owner:</strong> {detail.owner}</div>}
            {typeof detail.task_count === 'number' && <div className="text-sm"><strong>Task count:</strong> {detail.task_count}</div>}
            {detail.due_on && <div className="text-sm"><strong>Due:</strong> {format(new Date(detail.due_on + 'T00:00:00'), 'PPP')}</div>}
            {detail.last_activity_at && <div className="text-sm"><strong>Last activity:</strong> {format(new Date(detail.last_activity_at), 'PPP')}</div>}
            {detail.days_overdue > 0 && <div className="text-sm text-destructive"><strong>{detail.days_overdue} day{detail.days_overdue !== 1 ? 's' : ''} overdue</strong></div>}
            {detail.status_type && <div className="flex items-center gap-2 text-sm"><strong>Status:</strong> <StatusChip status={detail.status_type} /></div>}
            {detail.status_text && <div className="text-sm text-muted-foreground mt-1">{detail.status_text}</div>}
            {detail.is_milestone && <Badge variant="outline" className="text-[10px] border-white/[0.08]">Milestone</Badge>}
            {(detail.permalink_url || detail.project_permalink_url) && (
              <button onClick={() => openAsana(detail.permalink_url || detail.project_permalink_url)} className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                Open in Asana <ExternalLink className="h-3 w-3" />
              </button>
            )}
          </div>
        </DetailPopup>
      )}

      {drilldown && (
        <DetailPopup
          title={
            drilldown === 'projects' ? `Projects (${counts.projects})` :
            drilldown === 'past_due' ? `Past Due (${counts.overdue})` :
            drilldown === 'today' ? `Due Today (${counts.today})` :
            `Upcoming (${counts.upcoming})`
          }
          onClose={() => setDrilldown(null)}
        >
          <div className="space-y-1 max-h-[350px] overflow-y-auto">
            {drilldown === 'projects' && (projects.length === 0
              ? <p className="text-xs text-muted-foreground py-4 text-center">No active projects</p>
              : projects.map((p: any) => (
                <a key={p.gid} href={p.permalink_url || `https://app.asana.com/0/${p.gid}`} target="_blank" rel="noopener noreferrer" className={cn(GLASS_CARD, 'p-2.5 flex items-center justify-between hover:border-primary/30 transition-colors cursor-pointer')}>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate">{p.name}</p>
                    <p className="text-[10px] text-muted-foreground">{p.task_count} tasks{p.last_activity_at ? ` • active ${format(new Date(p.last_activity_at), 'MMM d')}` : ''}</p>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0 ml-2" />
                </a>
              ))
            )}
            {drilldown === 'past_due' && (overdue.length === 0
              ? <p className="text-xs text-muted-foreground py-4 text-center">No overdue items</p>
              : overdue.map((t: any) => (
                <a key={t.gid} href={t.permalink_url || `https://app.asana.com/0/0/${t.gid}`} target="_blank" rel="noopener noreferrer" className={cn(GLASS_CARD, 'p-2.5 flex items-center justify-between hover:border-destructive/30 transition-colors cursor-pointer')}>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate">{t.name}</p>
                    <p className="text-[10px] text-muted-foreground">{t.project_name}{t.assignee ? ` • ${t.assignee}` : ''}</p>
                  </div>
                  <div className="text-right ml-2 shrink-0">
                    <p className="text-[10px] text-destructive font-medium">{t.days_overdue}d overdue</p>
                    {t.due_on && <p className="text-[10px] text-muted-foreground/60">{format(new Date(t.due_on + 'T00:00:00'), 'MMM d')}</p>}
                  </div>
                </a>
              ))
            )}
            {drilldown === 'today' && (today.length === 0
              ? <p className="text-xs text-muted-foreground py-4 text-center">No items due today</p>
              : today.map((t: any) => (
                <a key={t.gid} href={t.permalink_url || `https://app.asana.com/0/0/${t.gid}`} target="_blank" rel="noopener noreferrer" className={cn(GLASS_CARD, 'p-2.5 flex items-center justify-between hover:border-primary/30 transition-colors cursor-pointer')}>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate">{t.name}</p>
                    <p className="text-[10px] text-muted-foreground">{t.project_name}{t.assignee ? ` • ${t.assignee}` : ''}</p>
                  </div>
                  <div className="text-right ml-2 shrink-0">
                    <p className="text-[10px] text-muted-foreground">{t.completed ? 'Completed' : 'Open'}</p>
                    <p className="text-[10px] text-muted-foreground/60">Today</p>
                  </div>
                </a>
              ))
            )}
            {drilldown === 'upcoming' && (upcoming.length === 0
              ? <p className="text-xs text-muted-foreground py-4 text-center">No upcoming items</p>
              : upcoming.map((t: any) => (
                <a key={t.gid} href={t.permalink_url || `https://app.asana.com/0/0/${t.gid}`} target="_blank" rel="noopener noreferrer" className={cn(GLASS_CARD, 'p-2.5 flex items-center justify-between hover:border-primary/30 transition-colors cursor-pointer')}>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate">{t.name}</p>
                    <p className="text-[10px] text-muted-foreground">{t.project_name}{t.assignee ? ` • ${t.assignee}` : ''}</p>
                  </div>
                  {t.due_on && <span className="text-[10px] text-muted-foreground/60 ml-2">{format(new Date(t.due_on + 'T00:00:00'), 'MMM d')}</span>}
                </a>
              ))
            )}
          </div>
        </DetailPopup>
      )}

      <Section title="Operational Highlights">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className={cn(GLASS_CARD, 'p-3 text-center cursor-pointer hover:border-primary/30 hover:scale-[1.02] transition-all')} onClick={() => setDrilldown('projects')}>
            <p className="text-xs text-muted-foreground/70">Projects</p>
            <p className="text-xl font-bold text-primary">{counts.projects}</p>
            <p className="text-[10px] text-muted-foreground/50">active</p>
          </div>
          <div className={cn(GLASS_CARD, 'p-3 text-center cursor-pointer hover:border-destructive/30 hover:scale-[1.02] transition-all')} onClick={() => setDrilldown('past_due')}>
            <p className="text-xs text-muted-foreground/70">Past Due</p>
            <p className={cn('text-xl font-bold', counts.overdue > 0 ? 'text-destructive' : 'text-muted-foreground')}>{counts.overdue}</p>
            <p className="text-[10px] text-muted-foreground/50">items</p>
          </div>
          <div className={cn(GLASS_CARD, 'p-3 text-center cursor-pointer hover:border-primary/30 hover:scale-[1.02] transition-all')} onClick={() => setDrilldown('today')}>
            <p className="text-xs text-muted-foreground/70">Due Today</p>
            <p className={cn('text-xl font-bold', counts.today > 0 ? 'text-primary' : 'text-muted-foreground')}>{counts.today}</p>
            <p className="text-[10px] text-muted-foreground/50">items</p>
          </div>
          <div className={cn(GLASS_CARD, 'p-3 text-center cursor-pointer hover:border-primary/30 hover:scale-[1.02] transition-all')} onClick={() => setDrilldown('upcoming')}>
            <p className="text-xs text-muted-foreground/70">Upcoming</p>
            <p className={cn('text-xl font-bold', counts.upcoming > 0 ? 'text-primary' : 'text-muted-foreground')}>{counts.upcoming}</p>
            <p className="text-[10px] text-muted-foreground/50">tasks</p>
          </div>
        </div>
      </Section>

      <Section title="Past Due Items">
        {overdue.length === 0 ? <EmptySection message="No overdue items" /> : overdue.map((item: any) => (
          <BriefingRow
            key={item.gid}
            icon={AlertCircle}
            title={item.name}
            subtitle={`${item.project_name}${item.assignee ? ` • ${item.assignee}` : ''}`}
            badge={`${item.days_overdue}d overdue`}
            badgeVariant="destructive"
            time={item.due_on ? format(new Date(item.due_on + 'T00:00:00'), 'MMM d') : ''}
            onClick={() => item.permalink_url ? openAsana(item.permalink_url) : setDetail(item)}
          />
        ))}
      </Section>

      <Section title="Due Today">
        {today.length === 0 ? <EmptySection message="No items due today" /> : today.map((item: any) => (
          <BriefingRow
            key={item.gid}
            icon={ListChecks}
            title={item.name}
            subtitle={`${item.project_name}${item.assignee ? ` • ${item.assignee}` : ''}`}
            badge={item.completed ? 'Completed' : 'Open'}
            badgeVariant={item.completed ? 'secondary' : 'default'}
            time="Today"
            onClick={() => item.permalink_url ? openAsana(item.permalink_url) : setDetail(item)}
          />
        ))}
      </Section>

      <Section title="Upcoming">
        {upcoming.length === 0 ? <EmptySection message="No upcoming items" /> : upcoming.slice(0, 15).map((item: any) => (
          <BriefingRow
            key={item.gid}
            icon={Clock}
            title={item.name}
            subtitle={`${item.project_name}${item.assignee ? ` • ${item.assignee}` : ''}`}
            badge={item.is_milestone ? 'Milestone' : 'Task'}
            badgeVariant="outline"
            time={item.due_on ? format(new Date(item.due_on + 'T00:00:00'), 'MMM d') : ''}
            onClick={() => item.permalink_url ? openAsana(item.permalink_url) : setDetail(item)}
          />
        ))}
      </Section>

      <Section title="Current Projects">
        {projects.length === 0 ? <EmptySection message="No active projects in portfolio" /> : (
          <div className="space-y-1.5">
            {projects.map((p: any) => (
              <div
                key={p.gid}
                role="button"
                tabIndex={0}
                onClick={() => p.permalink_url ? openAsana(p.permalink_url) : setDetail(p)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); p.permalink_url ? openAsana(p.permalink_url) : setDetail(p); } }}
                className={cn(
                  GLASS_ROW,
                  'p-3 cursor-pointer transition-all duration-200',
                  'hover:bg-white/[0.06] hover:border-white/[0.1]',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                      <StatusChip status={p.status_type} />
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground/60 flex-wrap">
                      {p.owner && <span>Owner: {p.owner}</span>}
                      <span>Tasks: {p.task_count}</span>
                      {p.last_activity_at && <span>Last activity: {format(new Date(p.last_activity_at), 'MMM d')}</span>}
                    </div>
                    {p.status_title && <p className="text-[11px] text-muted-foreground/50 mt-1 truncate">{p.status_title}</p>}
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 mt-1 shrink-0" />
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

// ── Tab icons & labels ─────────────────────────────────────────
const TABS = [
  { value: 'catchup', label: 'Catch Up & News', icon: Newspaper },
  { value: 'email', label: 'Email', icon: Mail },
  { value: 'financial', label: 'Financial', icon: DollarSign },
  { value: 'pipeline', label: 'Pipeline & Clients', icon: GitBranch },
  { value: 'operational', label: 'Operational', icon: ListChecks },
] as const;

// ── Main modal component ───────────────────────────────────────
export function DailyBriefingModal({ open, onOpenChange }: DailyBriefingModalProps) {
  const navigate = useNavigate();
  const window = useBriefingWindow();
  const [activeTab, setActiveTab] = useState('catchup');

  const handleNavigate = (path: string) => {
    onOpenChange(false);
    navigate(path);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'max-w-[95vw] w-[95vw] h-[92vh] max-h-[92vh] p-0 overflow-hidden rounded-2xl',
          'bg-background/60 backdrop-blur-3xl',
          'border border-white/[0.06]',
          'shadow-[0_32px_80px_-20px_hsl(var(--primary)/0.25),inset_0_1px_0_hsl(0_0%_100%/0.04)]',
        )}
        overlayClassName="bg-black/80"
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] bg-white/[0.02]">
            <div>
              <h2 className="text-lg font-bold text-foreground tracking-tight">Daily Briefing</h2>
              <p className="text-xs text-muted-foreground/60 mt-0.5">
                {window.label} • {format(new Date(), 'EEEE, MMMM d, yyyy')}
              </p>
            </div>
          </div>

          {/* Tabs — render shell immediately, no blocking */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
            <div className="px-6 pt-3 bg-white/[0.01]">
              <TabsList className="w-full bg-white/[0.03] border border-white/[0.05] backdrop-blur-xl">
                {TABS.map(tab => {
                  const Icon = tab.icon;
                  return (
                    <TabsTrigger
                      key={tab.value}
                      value={tab.value}
                      className={cn(
                        "gap-1.5 text-xs border-0 transition-all",
                        activeTab === tab.value
                          ? "bg-primary/15 text-foreground shadow-[0_0_12px_hsl(var(--primary)/0.1)]"
                          : "text-muted-foreground"
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">{tab.label}</span>
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </div>

            <div className="flex-1 overflow-hidden">
              <ScrollArea className="h-[calc(92vh-140px)] px-6 pt-4 pb-6">
                {activeTab === 'catchup' && <CatchUpTab enabled={open} onNavigate={handleNavigate} />}
                {activeTab === 'email' && <EmailTab enabled={open} onNavigate={handleNavigate} />}
                {activeTab === 'financial' && <FinancialTab enabled={open} onNavigate={handleNavigate} />}
                {activeTab === 'pipeline' && <PipelineTab enabled={open} onNavigate={handleNavigate} />}
                {activeTab === 'operational' && <OperationalTab enabled={open} onNavigate={handleNavigate} />}
              </ScrollArea>
            </div>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
