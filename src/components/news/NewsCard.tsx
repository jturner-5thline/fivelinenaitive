import { formatDistanceToNow } from 'date-fns';
import { ExternalLink, Bookmark, BookmarkCheck, Share2, Eye, Clock, Lightbulb, X as DismissIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { SourceTierIndicator } from './SourceTierIndicator';
import { LinkToDealPopover } from './LinkToDealPopover';
import { NaitiveIcon as Sparkles } from '@/components/NaitiveIcon';
import type { NewsItem } from '@/hooks/useNews';
import type { ViewLayout } from './NewsFilters';

interface NewsCardProps {
  item: NewsItem;
  featured?: boolean;
  layout?: ViewLayout;
  isBookmarked?: boolean;
  isRead?: boolean;
  isPinned?: boolean;
  matchingAlerts?: string[];
  onToggleBookmark?: () => void;
  onMarkRead?: () => void;
  onTogglePin?: () => void;
  onSummarize?: () => void;
  onArticleClick?: () => void;
}

const getCategoryColor = (category: string) => {
  const map: Record<string, string> = {
    lenders: 'bg-primary/10 text-primary border-primary/20',
    clients: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    borrowers: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    competitors: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    market: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    regulatory: 'bg-red-500/10 text-red-400 border-red-500/20',
    sectors: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    watchlist: 'bg-primary/10 text-primary border-primary/20',
    'active-deals': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  };
  return map[category] || 'bg-muted text-muted-foreground';
};

const getCategoryGradient = (category: string) => {
  const map: Record<string, string> = {
    lenders: 'from-primary/20 to-primary/5',
    clients: 'from-emerald-500/20 to-emerald-500/5',
    borrowers: 'from-emerald-500/20 to-emerald-500/5',
    competitors: 'from-amber-500/20 to-amber-500/5',
    market: 'from-blue-500/20 to-blue-500/5',
    regulatory: 'from-red-500/20 to-red-500/5',
    sectors: 'from-purple-500/20 to-purple-500/5',
  };
  return map[category] || 'from-muted/20 to-muted/5';
};

export function NewsCard({
  item,
  featured = false,
  layout = 'list',
  isBookmarked = false,
  isRead = false,
  isPinned = false,
  matchingAlerts = [],
  onToggleBookmark,
  onMarkRead,
  onTogglePin,
  onSummarize,
  onArticleClick,
}: NewsCardProps) {
  const isList = layout === 'list';
  const displayCategory = item.newsCategory || item.category;

  // ── COMPACT LIST ROW ─────────────────────────────────
  if (isList) {
    return (
      <div
        className={cn(
          'group/row flex items-center gap-3 px-3 py-2 rounded-md border border-border/20 hover:bg-muted/50 hover:border-border/40 cursor-pointer transition-all',
          isRead && 'opacity-60',
        )}
        onClick={(e) => {
          e.preventDefault();
          onMarkRead?.();
          onArticleClick?.();
        }}
      >
        {/* Source tier */}
        <SourceTierIndicator tier={item.sourceTier || 3} />

        {/* Category pill */}
        <Badge
          variant="outline"
          className={cn('text-[9px] px-1.5 py-0 h-4 flex-shrink-0 uppercase font-semibold tracking-wider', getCategoryColor(displayCategory))}
        >
          {displayCategory === 'borrowers' ? 'borrower' : displayCategory === 'active-deals' ? 'deal' : displayCategory}
        </Badge>

        {/* Headline */}
        <span className="flex-1 text-sm text-foreground font-medium truncate group-hover/row:text-primary transition-colors">
          {item.title}
        </span>

        {/* Relevance reason */}
        {item.relevanceReason && (
          <span className="hidden lg:flex items-center gap-1 text-[10px] text-primary/70 italic flex-shrink-0 max-w-[180px] truncate">
            <Lightbulb className="h-2.5 w-2.5 flex-shrink-0" />
            {item.relevanceReason}
          </span>
        )}

        {/* Source */}
        <span className="text-[11px] text-muted-foreground flex-shrink-0 hidden md:block max-w-[120px] truncate">
          {item.source}
        </span>

        {/* Time */}
        <span className="text-[10px] text-muted-foreground flex-shrink-0 whitespace-nowrap">
          {formatDistanceToNow(new Date(item.publishedAt), { addSuffix: true })}
        </span>

        {/* Quick actions */}
        <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover/row:opacity-100 transition-opacity">
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={(e) => { e.stopPropagation(); onToggleBookmark?.(); }}
                >
                  {isBookmarked ? <BookmarkCheck className="h-3 w-3 text-primary fill-current" /> : <Bookmark className="h-3 w-3" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isBookmarked ? 'Remove' : 'Save'}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <LinkToDealPopover articleTitle={item.title} variant="icon" className="h-6 w-6" />
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={(e) => { e.stopPropagation(); }}
                >
                  <Share2 className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Share</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    );
  }

  // ── GRID / MAGAZINE CARD ─────────────────────────────
  return (
    <div className="relative group/card">
      <div
        className="block cursor-pointer"
        onClick={(e) => {
          e.preventDefault();
          onMarkRead?.();
          onArticleClick?.();
        }}
      >
        <Card className={cn(
          'overflow-hidden transition-all duration-300 hover:shadow-lg hover:border-primary/40 h-full',
          featured ? 'flex flex-col md:flex-row' : '',
          isRead && 'opacity-70',
        )}>
          {/* Image */}
          <div className={cn(
            'relative overflow-hidden bg-muted flex-shrink-0',
            featured ? 'md:w-2/5 h-48 md:h-auto min-h-[200px]' : 'h-36',
          )}>
            {item.imageUrl ? (
              <img
                src={item.imageUrl}
                alt={item.title}
                className="w-full h-full object-cover transition-transform duration-500 group-hover/card:scale-105"
                loading="lazy"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            ) : (
              <div className={cn('w-full h-full bg-gradient-to-br', getCategoryGradient(displayCategory))} />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-background/40 to-transparent" />

            <div className="absolute top-3 left-3 flex items-center gap-1.5">
              <SourceTierIndicator tier={item.sourceTier || 3} className="bg-background/60 rounded p-0.5" />
              <Badge
                variant="outline"
                className={cn('text-[10px] px-2 py-0.5 gap-1 backdrop-blur-sm bg-background/60', getCategoryColor(displayCategory))}
              >
                {displayCategory}
              </Badge>
            </div>
          </div>

          {/* Content */}
          <div className={cn('flex flex-col flex-1 min-w-0 p-4', featured && 'md:w-3/5 md:p-6')}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] text-muted-foreground font-medium truncate">{item.source}</span>
              {matchingAlerts.length > 0 && (
                <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4 gap-0.5 flex-shrink-0">
                  <Sparkles className="h-2.5 w-2.5" />
                  Alert
                </Badge>
              )}
            </div>

            <h3 className={cn(
              'font-semibold text-foreground group-hover/card:text-primary transition-colors',
              featured ? 'text-xl line-clamp-2 mb-2' : 'text-sm line-clamp-2 mb-2',
            )}>
              {item.title}
            </h3>

            {item.whyItMatters && (
              <p className="text-xs text-muted-foreground italic mb-2 line-clamp-1">
                Why it matters: {item.whyItMatters}
              </p>
            )}

            <p className={cn('text-muted-foreground flex-1', featured ? 'text-sm line-clamp-3' : 'text-xs line-clamp-2')}>
              {item.summary}
            </p>

            {item.relevanceReason && (
              <div className="flex items-center gap-1 mt-2 text-[10px] text-primary/80 italic">
                <Lightbulb className="h-2.5 w-2.5" />
                {item.relevanceReason}
              </div>
            )}

            <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/50">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span className="text-[11px]">
                  {formatDistanceToNow(new Date(item.publishedAt), { addSuffix: true })}
                </span>
              </div>
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover/card:opacity-100 transition-opacity" />
            </div>
          </div>
        </Card>
      </div>

      {/* Action buttons overlay */}
      <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover/card:opacity-100 transition-opacity z-10">
        <TooltipProvider delayDuration={300}>
          {onSummarize && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="secondary" size="icon" className="h-7 w-7 bg-background/80 backdrop-blur-sm shadow-sm" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onSummarize(); }}>
                  <Sparkles className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>AI Summary</TooltipContent>
            </Tooltip>
          )}
          {onToggleBookmark && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="secondary" size="icon" className={cn("h-7 w-7 bg-background/80 backdrop-blur-sm shadow-sm", isBookmarked && "text-primary")} onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleBookmark(); }}>
                  {isBookmarked ? <BookmarkCheck className="h-3.5 w-3.5 fill-current" /> : <Bookmark className="h-3.5 w-3.5" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isBookmarked ? 'Remove' : 'Save'}</TooltipContent>
            </Tooltip>
          )}
        </TooltipProvider>
      </div>
    </div>
  );
}
