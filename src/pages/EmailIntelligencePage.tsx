import { useState, useMemo, useRef, memo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ArrowLeft, Mail, RefreshCw, Search, Brain, Clock,
  AlertCircle, TrendingUp, Zap, RotateCw, ExternalLink,
} from 'lucide-react';
import { NaitiveIcon as Sparkles } from '@/components/NaitiveIcon';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { useEmailIntelligence, EnrichedEmail } from '@/hooks/useEmailIntelligence';
import { useGmail } from '@/hooks/useGmail';
import { formatDistanceToNow, format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useVirtualizer } from '@tanstack/react-virtual';

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
  due_diligence: 'Due Diligence',
  scheduling: 'Scheduling',
  internal: 'Internal',
  newsletter: 'Newsletter',
  other: 'Other',
};

const SENTIMENT_ICONS: Record<string, { icon: typeof TrendingUp; className: string; label: string }> = {
  positive: { icon: TrendingUp, className: 'text-emerald-400', label: 'Positive' },
  negative: { icon: AlertCircle, className: 'text-destructive', label: 'Negative' },
  urgent: { icon: Zap, className: 'text-amber-400', label: 'Urgent' },
  neutral: { icon: Mail, className: 'text-muted-foreground', label: 'Neutral' },
};

export default function EmailIntelligencePage() {
  const navigate = useNavigate();
  const { status, isStatusLoading } = useGmail();
  const { emails, stats, isLoading, isAnalyzing, syncEmails, reanalyzeEmail, hasMore, loadMore } = useEmailIntelligence();

  const [searchQuery, setSearchQuery] = useState('');
  // Debounce search input so we don't refilter on every keystroke.
  const debouncedSearch = useDebouncedValue(searchQuery, 300);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [sentimentFilter, setSentimentFilter] = useState<string>('all');
  const [dealFilter, setDealFilter] = useState<string>('all');

  // Get unique deals from analyzed emails
  const dealOptions = useMemo(() => {
    const deals = new Map<string, string>();
    emails.forEach(e => {
      if (e.analysis?.deal_id && e.analysis.deal_name) {
        deals.set(e.analysis.deal_id, e.analysis.deal_name);
      }
    });
    return Array.from(deals.entries()).map(([id, name]) => ({ id, name }));
  }, [emails]);

  // Filter emails
  const filteredEmails = useMemo(() => {
    return emails.filter(e => {
      if (debouncedSearch) {
        const q = debouncedSearch.toLowerCase();
        const matchesSearch =
          e.subject?.toLowerCase().includes(q) ||
          e.from_name?.toLowerCase().includes(q) ||
          e.from_email?.toLowerCase().includes(q) ||
          e.snippet?.toLowerCase().includes(q) ||
          e.analysis?.summary?.toLowerCase().includes(q);
        if (!matchesSearch) return false;
      }
      if (categoryFilter !== 'all' && e.analysis?.category !== categoryFilter) return false;
      if (priorityFilter !== 'all' && e.analysis?.priority !== priorityFilter) return false;
      if (sentimentFilter !== 'all' && e.analysis?.sentiment !== sentimentFilter) return false;
      if (dealFilter !== 'all' && e.analysis?.deal_id !== dealFilter) return false;
      return true;
    }).sort((a, b) => {
      const aFollowUp = a.analysis?.follow_up_needed ? 1 : 0;
      const bFollowUp = b.analysis?.follow_up_needed ? 1 : 0;
      if (bFollowUp !== aFollowUp) return bFollowUp - aFollowUp;
      return new Date(b.received_at || 0).getTime() - new Date(a.received_at || 0).getTime();
    });
  }, [emails, debouncedSearch, categoryFilter, priorityFilter, sentimentFilter, dealFilter]);

  if (isStatusLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="h-6 w-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Checking Gmail connection…</p>
        </div>
      </div>
    );
  }

  if (!status.connected) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <Card className="max-w-md w-full border-white/[0.06] bg-card/80 backdrop-blur-md">
          <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
            <Mail className="h-10 w-10 text-primary" />
            <p className="font-medium">Connect your Gmail</p>
            <p className="text-sm text-muted-foreground">Link your email to access Email Intelligence.</p>
            <Button onClick={() => navigate('/integrations')}>Go to Integrations</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col gap-4 p-4 md:p-6 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="hover:bg-white/[0.06]" onClick={() => navigate('/')}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Dashboard
          </Button>
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Email Intelligence
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              AI-analyzed email feed with deal matching and signal detection
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isAnalyzing && (
            <Badge variant="outline" className="text-[10px] text-amber-400 border-amber-400/20 bg-amber-400/[0.06] animate-pulse">
              Analyzing...
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            className="border-white/[0.1] bg-white/[0.04] hover:bg-white/[0.08]"
            onClick={() => syncEmails(true)}
            disabled={isLoading}
          >
            <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', isLoading && 'animate-spin')} />
            Sync
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Emails" value={stats.total} icon={Mail} />
        <StatCard label="Deal-Related Unread" value={stats.unreadDealRelated} icon={Sparkles} accent />
        <StatCard label="Need Follow-up" value={stats.needFollowUp} icon={Clock} warn={stats.needFollowUp > 0} />
        <StatCard label="Urgent" value={stats.urgent} icon={Zap} danger={stats.urgent > 0} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search emails..."
            className="pl-8 h-8 text-xs border-white/[0.08] bg-white/[0.03] focus:bg-white/[0.05]"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[140px] h-8 text-xs border-white/[0.08] bg-white/[0.03]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent className="border-white/[0.08] bg-card/95 backdrop-blur-xl">
            <SelectItem value="all">All Categories</SelectItem>
            {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-[120px] h-8 text-xs border-white/[0.08] bg-white/[0.03]">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent className="border-white/[0.08] bg-card/95 backdrop-blur-xl">
            <SelectItem value="all">All Priority</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sentimentFilter} onValueChange={setSentimentFilter}>
          <SelectTrigger className="w-[120px] h-8 text-xs border-white/[0.08] bg-white/[0.03]">
            <SelectValue placeholder="Sentiment" />
          </SelectTrigger>
          <SelectContent className="border-white/[0.08] bg-card/95 backdrop-blur-xl">
            <SelectItem value="all">All Sentiment</SelectItem>
            <SelectItem value="positive">Positive</SelectItem>
            <SelectItem value="neutral">Neutral</SelectItem>
            <SelectItem value="negative">Negative</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
          </SelectContent>
        </Select>
        {dealOptions.length > 0 && (
          <Select value={dealFilter} onValueChange={setDealFilter}>
            <SelectTrigger className="w-[160px] h-8 text-xs border-white/[0.08] bg-white/[0.03]">
              <SelectValue placeholder="Deal" />
            </SelectTrigger>
            <SelectContent className="border-white/[0.08] bg-card/95 backdrop-blur-xl">
              <SelectItem value="all">All Deals</SelectItem>
              {dealOptions.map(d => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Email List */}
      {emails.length === 0 && isLoading ? (
        <EmailListSkeleton />
      ) : filteredEmails.length === 0 ? (
        <Card className="border-white/[0.06] bg-card/80 backdrop-blur-md">
          <CardContent className="py-8 text-center">
            <p className="text-sm text-muted-foreground">
              {emails.length === 0 ? 'No emails synced yet.' : 'No emails match your filters.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <VirtualEmailList
          emails={filteredEmails}
          onReanalyze={reanalyzeEmail}
          hasMore={hasMore}
          onLoadMore={loadMore}
        />
      )}
    </div>
  );
}

function EmailListSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i} className="border-white/[0.06] bg-card/80 backdrop-blur-md">
          <CardContent className="p-3 flex gap-3">
            <Skeleton className="h-7 w-7 rounded-md" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-1/3" />
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function VirtualEmailList({
  emails,
  onReanalyze,
  hasMore,
  onLoadMore,
}: {
  emails: EnrichedEmail[];
  onReanalyze: (id: string) => void;
  hasMore: boolean;
  onLoadMore: () => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: emails.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 132,
    overscan: 6,
    getItemKey: (i) => emails[i].id,
  });

  return (
    <>
      <div
        ref={parentRef}
        className="relative overflow-auto"
        style={{ maxHeight: 'calc(100vh - 320px)', minHeight: 400 }}
      >
        <div
          style={{
            height: rowVirtualizer.getTotalSize(),
            width: '100%',
            position: 'relative',
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const email = emails[virtualRow.index];
            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                  paddingBottom: 8,
                }}
              >
                <EmailCard email={email} onReanalyze={onReanalyze} />
              </div>
            );
          })}
        </div>
      </div>
      {hasMore && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            size="sm"
            className="border-white/[0.1] bg-white/[0.04] hover:bg-white/[0.08]"
            onClick={onLoadMore}
          >
            Load older messages
          </Button>
        </div>
      )}
    </>
  );
}

function StatCard({
  label, value, icon: Icon, accent, warn, danger,
}: {
  label: string; value: number; icon: any; accent?: boolean; warn?: boolean; danger?: boolean;
}) {
  return (
    <Card className="border-white/[0.06] bg-card/80 backdrop-blur-md">
      <CardContent className="p-3 flex items-center gap-3">
        <div className={cn(
          'p-2 rounded-lg',
          danger ? 'bg-destructive/10' : warn ? 'bg-amber-500/10' : accent ? 'bg-primary/10' : 'bg-white/[0.04]'
        )}>
          <Icon className={cn(
            'h-4 w-4',
            danger ? 'text-destructive' : warn ? 'text-amber-400' : accent ? 'text-primary' : 'text-muted-foreground'
          )} />
        </div>
        <div>
          <p className="text-lg font-semibold tabular-nums">{value}</p>
          <p className="text-[10px] text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

const EmailCard = memo(function EmailCard({ email, onReanalyze }: { email: EnrichedEmail; onReanalyze: (id: string) => void }) {
  const navigate = useNavigate();
  const analysis = email.analysis;
  const sentimentInfo = SENTIMENT_ICONS[analysis?.sentiment || 'neutral'] || SENTIMENT_ICONS.neutral;
  const SentimentIcon = sentimentInfo.icon;

  return (
    <Card className={cn(
      'transition-all duration-200 border-white/[0.06] bg-card/80 backdrop-blur-md hover:bg-white/[0.04] hover:border-white/[0.1]',
      !email.is_read && 'border-primary/15 bg-primary/[0.04]',
      analysis?.priority === 'high' && 'border-l-2 border-l-destructive/50'
    )}>
      <CardContent className="p-3">
        <div className="flex items-start gap-3">
          <div className="p-1.5 rounded-md bg-primary/10 shrink-0 mt-0.5">
            <SentimentIcon className={cn('h-4 w-4', sentimentInfo.className)} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className={cn('text-sm', !email.is_read ? 'font-semibold' : 'font-medium')}>
                {email.from_name || email.from_email}
              </p>
              {!email.is_read && <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />}
              {analysis?.category && analysis.category !== 'other' && (
                <Badge variant="outline" className={cn('text-[9px] h-4 px-1.5 border-white/[0.08]', CATEGORY_COLORS[analysis.category])}>
                  {CATEGORY_LABELS[analysis.category] || analysis.category}
                </Badge>
              )}
              {analysis?.priority === 'high' && (
                <Badge variant="outline" className="text-[9px] h-4 px-1.5 bg-destructive/10 text-destructive border-destructive/20">
                  High Priority
                </Badge>
              )}
              {analysis?.follow_up_needed && (
                <Badge variant="outline" className="text-[9px] h-4 px-1.5 bg-amber-500/10 text-amber-400 border-amber-500/20">
                  <Clock className="h-2.5 w-2.5 mr-0.5" /> Follow-up
                </Badge>
              )}
              {analysis?.signals && analysis.signals.length > 0 && (
                <Badge variant="outline" className="text-[9px] h-4 px-1.5 bg-violet-500/10 text-violet-400 border-violet-500/20">
                  {analysis.signals.length} signal{analysis.signals.length > 1 ? 's' : ''}
                </Badge>
              )}
            </div>

            <p className="text-xs font-medium text-foreground/80 mt-0.5">{email.subject || '(No subject)'}</p>

            {analysis?.summary ? (
              <p className="text-xs text-muted-foreground mt-1">{analysis.summary}</p>
            ) : (
              <p className="text-xs text-muted-foreground mt-1 truncate">{email.snippet}</p>
            )}

            {analysis?.suggested_action && (
              <p className="text-[11px] text-primary/80 mt-1 italic">→ {analysis.suggested_action}</p>
            )}

            <div className="flex items-center gap-3 mt-2">
              <span className="text-[10px] text-muted-foreground">
                {email.received_at ? format(new Date(email.received_at), 'MMM d, h:mm a') : ''}
              </span>
              <span className="text-[10px] text-muted-foreground/60">
                {email.received_at ? formatDistanceToNow(new Date(email.received_at), { addSuffix: true }) : ''}
              </span>
              {analysis?.deal_name && (
                <button
                  onClick={() => analysis.deal_id && navigate(`/deal/${analysis.deal_id}`)}
                  className="text-[10px] text-primary hover:underline flex items-center gap-0.5"
                >
                  <ExternalLink className="h-2.5 w-2.5" />
                  {analysis.deal_name}
                </button>
              )}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => onReanalyze(email.id)}
                      className="text-[10px] text-muted-foreground hover:text-foreground transition-colors ml-auto"
                    >
                      <RotateCw className="h-3 w-3" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">Re-analyze this email</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            {/* Extracted data */}
            {analysis?.extracted_data && Object.keys(analysis.extracted_data).length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {Object.entries(analysis.extracted_data).slice(0, 5).map(([key, value]) => (
                  <Badge key={key} variant="secondary" className="text-[9px] h-4 bg-white/[0.04] border-white/[0.08]">
                    {key}: {String(value)}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}, (prev, next) =>
  prev.email.id === next.email.id &&
  prev.email.is_read === next.email.is_read &&
  prev.email.subject === next.email.subject &&
  prev.email.snippet === next.email.snippet &&
  prev.email.received_at === next.email.received_at &&
  prev.email.analysis === next.email.analysis &&
  prev.onReanalyze === next.onReanalyze
);
