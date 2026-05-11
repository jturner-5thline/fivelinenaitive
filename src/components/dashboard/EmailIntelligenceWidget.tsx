import { useState, useMemo, useCallback, memo, lazy, Suspense } from 'react';
import { Mail, ArrowRight, Inbox, RefreshCw, AlertCircle, Clock, TrendingUp, Zap, CheckCircle2 } from 'lucide-react';
import { NaitiveIcon as Sparkles } from '@/components/NaitiveIcon';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { useDashboardLayout } from '@/contexts/DashboardLayoutContext';
import { useGmail } from '@/hooks/useGmail';
import { useEmailIntelligence, EnrichedEmail } from '@/hooks/useEmailIntelligence';
// Heavy detail modal is lazy-loaded so the widget itself paints
// without dragging in the full email-detail bundle on dashboard mount.
const EmailDetailModal = lazy(() =>
  import('@/components/dashboard/EmailDetailModal').then(m => ({ default: m.EmailDetailModal })),
);
import { formatDistanceToNow } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useWidgetCarouselStore } from '@/stores/widgetCarouselStore';

const CATEGORY_COLORS: Record<string, string> = {
  deal_update: 'bg-primary/10 text-primary border-primary/20',
  lender_communication: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  follow_up_needed: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  terms_discussion: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  due_diligence: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  scheduling: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
  internal: 'bg-muted text-muted-foreground border-muted',
  newsletter: 'bg-muted text-muted-foreground border-muted',
  other: 'bg-muted text-muted-foreground border-muted',
};

const CATEGORY_LABELS: Record<string, string> = {
  deal_update: 'Deal Update',
  lender_communication: 'Lender',
  follow_up_needed: 'Follow-up',
  terms_discussion: 'Terms',
  due_diligence: 'DD',
  scheduling: 'Scheduling',
  internal: 'Internal',
  newsletter: 'Newsletter',
  other: 'Other',
};

const SENTIMENT_ICONS: Record<string, { icon: typeof TrendingUp; className: string }> = {
  positive: { icon: TrendingUp, className: 'text-emerald-400' },
  negative: { icon: AlertCircle, className: 'text-destructive' },
  urgent: { icon: Zap, className: 'text-amber-400' },
  neutral: { icon: Mail, className: 'text-muted-foreground' },
};

const PRIORITY_STYLES: Record<string, string> = {
  high: 'border-l-2 border-l-destructive/50',
  medium: '',
  low: 'opacity-80',
};

// Glass card wrapper class
const GLASS_CARD = 'h-full flex flex-col glass-border-soft bg-card/80 backdrop-blur-md shadow-glass';

/**
 * Lightweight, hover/focus-only "Email Intelligence" affordance.
 *
 * The dashboard no longer renders an "Email Intelligence" title or badge as
 * persistent chrome — instead this chip fades in only when the user hovers
 * the Email widget (or focuses any element inside it for keyboard users).
 * It's positioned over the card's top edge so it reads as widget chrome,
 * not as a separate dashboard section.
 */
function EmailIntelligenceHoverLabel({
  status = 'live',
  analyzing = false,
}: {
  status?: 'live' | 'connecting' | 'offline';
  analyzing?: boolean;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute left-3 top-2 z-10',
        'flex items-center gap-1.5 rounded-full border border-border/40 bg-background/80 backdrop-blur',
        'px-2 py-0.5 text-[10.5px] font-medium text-foreground/80 shadow-sm',
        'opacity-0 -translate-y-0.5 transition-all duration-150',
        'group-hover:opacity-100 group-hover:translate-y-0',
        'group-focus-within:opacity-100 group-focus-within:translate-y-0',
        // Hide on touch devices — there is no hover and the widget is the
        // only interactive surface, so the label would just add noise.
        '[@media(hover:none)]:hidden',
      )}
    >
      <Sparkles className="h-3 w-3 text-primary" />
      <span>Email Intelligence</span>
      {status === 'live' && (
        <span className="ml-0.5 text-[9.5px] text-emerald-400">· Live</span>
      )}
      {analyzing && (
        <span className="ml-0.5 text-[9.5px] text-amber-400 animate-pulse">· Analyzing</span>
      )}
    </div>
  );
}

const EmailRow = memo(function EmailRow({ email, onClick }: { email: EnrichedEmail; onClick: () => void }) {
  const navigate = useNavigate();
  const closeCarousel = useWidgetCarouselStore((s) => s.close);
  const analysis = email.analysis;
  const sentimentInfo = SENTIMENT_ICONS[analysis?.sentiment || 'neutral'] || SENTIMENT_ICONS.neutral;
  const SentimentIcon = sentimentInfo.icon;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      className={cn(
        'flex items-start gap-3 p-2.5 rounded-lg border group cursor-pointer transition-all duration-200',
        'hover:bg-white/[0.04] hover:glass-border-soft hover:shadow-sm',
        'active:scale-[0.995]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        !email.is_read
          ? 'bg-primary/[0.06] border-primary/15'
          : 'bg-white/[0.02] glass-border-soft',
        PRIORITY_STYLES[analysis?.priority || 'medium']
      )}
    >
      <div className="p-1.5 rounded-md bg-primary/10 shrink-0 mt-0.5">
        <SentimentIcon className={cn('h-3.5 w-3.5', sentimentInfo.className)} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className={cn(
            'text-sm truncate',
            !email.is_read ? 'font-semibold text-foreground' : 'font-medium text-foreground'
          )}>
            {email.from_name || email.from_email}
          </p>
          {!email.is_read && (
            <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
          )}
          {analysis?.category && analysis.category !== 'other' && (
            <Badge variant="outline" className={cn('text-[9px] h-4 px-1.5 shrink-0 glass-border-soft', CATEGORY_COLORS[analysis.category])}>
              {CATEGORY_LABELS[analysis.category] || analysis.category}
            </Badge>
          )}
        </div>
        <p className="text-xs font-medium text-foreground/80 truncate mt-0.5">
          {email.subject || '(No subject)'}
        </p>
        {analysis?.summary ? (
          <p className="text-xs text-muted-foreground truncate mt-0.5 italic">
            {analysis.summary}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {email.snippet}
          </p>
        )}
        <div className="flex items-center gap-2 mt-1">
          <p className="text-[10px] text-muted-foreground">
            {email.received_at ? formatDistanceToNow(new Date(email.received_at), { addSuffix: true }) : ''}
          </p>
          {analysis?.deal_name && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (analysis.deal_id) {
                  // Close the dashboard carousel/widget panel synchronously
                  // BEFORE navigating so it never lingers on screen during
                  // the route transition.
                  closeCarousel();
                  navigate(`/deal/${analysis.deal_id}`);
                }
              }}
              className="text-[10px] text-primary hover:underline truncate max-w-[120px]"
            >
              {analysis.deal_name}
            </button>
          )}
          {analysis?.follow_up_needed && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Clock className="h-3 w-3 text-amber-400" />
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  Follow-up needed{analysis.follow_up_by ? ` by ${analysis.follow_up_by}` : ''}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>
      {/* Subtle arrow affordance on hover */}
      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/0 group-hover:text-muted-foreground/50 transition-colors shrink-0 mt-2" />
    </div>
  );
});

function EmailIntelligenceWidgetImpl() {
  const { toggles } = useDashboardLayout();
  const { status, isStatusLoading } = useGmail();
  const { emails, stats, isLoading, isAnalyzing, syncEmails } = useEmailIntelligence();
  const navigate = useNavigate();
  const closeCarousel = useWidgetCarouselStore((s) => s.close);
  // Quick-action launchers must dismiss the dashboard widget panel BEFORE
  // route changes so the panel never lingers on top of the destination.
  const goTo = (path: string) => {
    closeCarousel();
    navigate(path);
  };
  const [selectedEmail, setSelectedEmail] = useState<EnrichedEmail | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleEmailClick = useCallback((email: EnrichedEmail) => {
    setSelectedEmail(email);
    setIsModalOpen(true);
  }, []);

  const handleModalClose = useCallback((open: boolean) => {
    setIsModalOpen(open);
    if (!open) setSelectedEmail(null);
  }, []);

  // Sort: follow-up needed first, then by priority, then by date.
  // Memoized so unrelated parent rerenders don't re-sort every paint.
  // Declared at the top of the component (before any early returns) so
  // hook order is stable across all render branches.
  const displayEmails = useMemo(() => {
    const priorityOrder: Record<string, number> = { high: 3, medium: 2, low: 1 };
    return [...emails]
      .sort((a, b) => {
        const aFollowUp = a.analysis?.follow_up_needed ? 1 : 0;
        const bFollowUp = b.analysis?.follow_up_needed ? 1 : 0;
        if (bFollowUp !== aFollowUp) return bFollowUp - aFollowUp;
        const aPriority = priorityOrder[a.analysis?.priority || 'medium'] || 2;
        const bPriority = priorityOrder[b.analysis?.priority || 'medium'] || 2;
        if (bPriority !== aPriority) return bPriority - aPriority;
        return new Date(b.received_at || 0).getTime() - new Date(a.received_at || 0).getTime();
      })
      .slice(0, 6);
  }, [emails]);

  // Early returns must come AFTER all hook calls above to keep hook
  // order stable when toggles / connection / loading state changes.
  if (toggles.hideEmailHints) return null;

  // Loading state — checking Gmail connection
  if (isStatusLoading) {
    return (
      <Card className={cn(GLASS_CARD, 'group relative')}>
        <EmailIntelligenceHoverLabel status="connecting" />
        <CardHeader className="pb-2 pt-3" />
        <CardContent className="flex-1 flex flex-col gap-3 pt-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  // Not connected state
  if (!status.connected) {
    return (
      <Card className={cn(GLASS_CARD, 'group relative')}>
        <EmailIntelligenceHoverLabel status="offline" />
        <CardHeader className="pb-2 pt-3" />
        <CardContent className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
          <div className="p-3 rounded-full bg-primary/10">
            <Mail className="h-6 w-6 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Connect your Gmail</p>
            <p className="text-xs text-muted-foreground mt-1">
              Link your email in Integrations to see your inbox here.
            </p>
          </div>
          <Button variant="outline" size="sm" className="mt-1 glass-border-soft bg-white/[0.04] hover:bg-white/[0.08]" onClick={() => goTo('/integrations')}>
            Go to Integrations
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Loading
  if (isLoading && emails.length === 0) {
    return (
      <Card className={cn(GLASS_CARD, 'group relative')}>
        <EmailIntelligenceHoverLabel status="live" />
        <CardHeader className="pb-2 pt-3" />
        <CardContent className="space-y-2">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className={cn(GLASS_CARD, 'group relative')}>
        <EmailIntelligenceHoverLabel status="live" analyzing={isAnalyzing} />
        <CardHeader className="pb-2 pt-2">
          <div className="flex items-center justify-end">
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 hover:bg-white/[0.06]"
                onClick={() => syncEmails(true)}
                disabled={isLoading}
              >
                <RefreshCw className={cn('h-3 w-3', isLoading && 'animate-spin')} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1 hover:bg-white/[0.06]"
                onClick={() => goTo('/email-intelligence')}
              >
                <Inbox className="h-3 w-3" />
                Full Inbox
              </Button>
            </div>
          </div>

          {/* Stats bar */}
          {(stats.unreadDealRelated > 0 || stats.needFollowUp > 0 || stats.urgent > 0) && (
            <div className="flex items-center gap-3 mt-1.5">
              {stats.unreadDealRelated > 0 && (
                <span className="text-[10px] text-muted-foreground">
                  <span className="font-medium text-foreground">{stats.unreadDealRelated}</span> unread deal emails
                </span>
              )}
              {stats.needFollowUp > 0 && (
                <span className="text-[10px] text-amber-400">
                  <span className="font-medium">{stats.needFollowUp}</span> need follow-up
                </span>
              )}
              {stats.urgent > 0 && (
                <span className="text-[10px] text-destructive">
                  <span className="font-medium">{stats.urgent}</span> urgent
                </span>
              )}
            </div>
          )}
        </CardHeader>

        <CardContent className="space-y-1.5 overflow-auto flex-1">
          {displayEmails.length === 0 ? (
            <div className="h-full min-h-[140px] flex flex-col items-center justify-center gap-2 text-center px-4">
              <CheckCircle2 className="h-6 w-6 text-emerald-400/80" />
              <p className="text-sm font-medium text-foreground/90">
                No updates — you're all caught up.
              </p>
            </div>
          ) : (
            displayEmails.map(email => (
              <EmailRow key={email.id} email={email} onClick={() => handleEmailClick(email)} />
            ))
          )}
        </CardContent>
      </Card>

      {/* Defer mounting the modal entirely until the user actually opens
          one — keeps initial widget render cheap and avoids paying the
          dialog/portal cost on every dashboard mount. */}
      {(isModalOpen || selectedEmail) && (
        <Suspense fallback={null}>
          <EmailDetailModal
            email={selectedEmail}
            open={isModalOpen}
            onOpenChange={handleModalClose}
          />
        </Suspense>
      )}
    </>
  );
}

// Memoize the widget itself: dashboard layout/scroll/state changes shouldn't
// re-render the email intelligence list when its own inputs are unchanged.
export const EmailIntelligenceWidget = memo(EmailIntelligenceWidgetImpl);
