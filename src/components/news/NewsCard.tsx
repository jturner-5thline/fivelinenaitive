import { formatDistanceToNow } from 'date-fns';
import { ExternalLink, Building2, Users, Clock, Bookmark, BookmarkCheck, Eye, EyeOff, Sparkles, Pin } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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
}

const getCategoryIcon = (category: NewsItem['category']) => {
  switch (category) {
    case 'lenders':
      return <Building2 className="h-3 w-3" />;
    case 'clients':
      return <Users className="h-3 w-3" />;
  }
};

const getCategoryColor = (category: NewsItem['category']) => {
  switch (category) {
    case 'lenders':
      return 'bg-primary/10 text-primary border-primary/20';
    case 'clients':
      return 'bg-success/10 text-success border-success/20';
  }
};

const getCategoryGradient = (category: NewsItem['category']) => {
  switch (category) {
    case 'lenders':
      return 'from-primary/20 to-primary/5';
    case 'clients':
      return 'from-success/20 to-success/5';
  }
};

export function NewsCard({ 
  item, 
  featured = false, 
  layout = 'grid',
  isBookmarked = false,
  isRead = false,
  isPinned = false,
  matchingAlerts = [],
  onToggleBookmark,
  onMarkRead,
  onTogglePin,
  onSummarize,
}: NewsCardProps) {
  const isList = layout === 'list';

  return (
    <div className="relative group/card">
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block"
        onClick={() => onMarkRead?.()}
      >
        <Card className={cn(
          'overflow-hidden transition-all duration-300 hover:shadow-lg hover:border-primary/40 h-full',
          featured && !isList ? 'flex flex-col md:flex-row' : '',
          isList ? 'flex flex-row' : '',
          isRead && 'opacity-70',
        )}>
          {/* Image */}
          <div className={cn(
            'relative overflow-hidden bg-muted flex-shrink-0',
            featured && !isList ? 'md:w-2/5 h-48 md:h-auto min-h-[200px]' : '',
            isList ? 'w-24 h-24 md:w-32 md:h-24' : !featured ? 'h-36' : '',
          )}>
            {item.imageUrl ? (
              <img 
                src={item.imageUrl} 
                alt={item.title}
                className="w-full h-full object-cover transition-transform duration-500 group-hover/card:scale-105"
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            ) : (
              <div className={cn(
                'w-full h-full bg-gradient-to-br',
                getCategoryGradient(item.category)
              )} />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-background/40 to-transparent" />
            
            {!isList && (
              <div className="absolute top-3 left-3">
                <Badge 
                  variant="outline" 
                  className={cn(
                    'text-[10px] px-2 py-0.5 gap-1 backdrop-blur-sm bg-background/60',
                    getCategoryColor(item.category)
                  )}
                >
                  {getCategoryIcon(item.category)}
                  {item.category}
                </Badge>
              </div>
            )}

            {isPinned && (
              <div className="absolute top-3 right-3">
                <Pin className="h-3.5 w-3.5 text-primary fill-primary" />
              </div>
            )}
          </div>

          {/* Content */}
          <div className={cn(
            'flex flex-col flex-1 min-w-0',
            isList ? 'p-3' : 'p-4',
            featured && !isList ? 'md:w-3/5 md:p-6' : ''
          )}>
            <div className="flex items-center gap-2 mb-1">
              {isList && (
                <Badge 
                  variant="outline" 
                  className={cn(
                    'text-[10px] px-1.5 py-0 gap-0.5 flex-shrink-0',
                    getCategoryColor(item.category)
                  )}
                >
                  {getCategoryIcon(item.category)}
                  {item.category}
                </Badge>
              )}
              <span className="text-[11px] text-muted-foreground font-medium truncate">
                {item.source}
              </span>
              {matchingAlerts.length > 0 && (
                <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4 gap-0.5 flex-shrink-0">
                  <Sparkles className="h-2.5 w-2.5" />
                  Alert
                </Badge>
              )}
              {isRead && (
                <Eye className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              )}
            </div>

            <h3 className={cn(
              'font-semibold text-foreground group-hover/card:text-primary transition-colors',
              featured && !isList ? 'text-xl line-clamp-2 mb-2' : '',
              isList ? 'text-sm line-clamp-1' : !featured ? 'text-sm line-clamp-2 mb-2' : '',
            )}>
              {item.title}
            </h3>

            {!isList && (
              <p className={cn(
                'text-muted-foreground flex-1',
                featured ? 'text-sm line-clamp-3' : 'text-xs line-clamp-2'
              )}>
                {item.summary}
              </p>
            )}

            <div className={cn(
              'flex items-center justify-between',
              isList ? 'mt-1' : 'mt-4 pt-3 border-t border-border/50'
            )}>
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
      </a>

      {/* Action buttons overlay */}
      <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover/card:opacity-100 transition-opacity z-10">
        <TooltipProvider delayDuration={300}>
          {onSummarize && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="secondary"
                  size="icon"
                  className="h-7 w-7 bg-background/80 backdrop-blur-sm shadow-sm"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); onSummarize(); }}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>AI Summary</TooltipContent>
            </Tooltip>
          )}
          {onTogglePin && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="secondary"
                  size="icon"
                  className={cn("h-7 w-7 bg-background/80 backdrop-blur-sm shadow-sm", isPinned && "text-primary")}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); onTogglePin(); }}
                >
                  <Pin className={cn("h-3.5 w-3.5", isPinned && "fill-current")} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isPinned ? 'Unpin source' : 'Pin source'}</TooltipContent>
            </Tooltip>
          )}
          {onToggleBookmark && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="secondary"
                  size="icon"
                  className={cn("h-7 w-7 bg-background/80 backdrop-blur-sm shadow-sm", isBookmarked && "text-primary")}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleBookmark(); }}
                >
                  {isBookmarked ? <BookmarkCheck className="h-3.5 w-3.5 fill-current" /> : <Bookmark className="h-3.5 w-3.5" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isBookmarked ? 'Remove bookmark' : 'Bookmark'}</TooltipContent>
            </Tooltip>
          )}
        </TooltipProvider>
      </div>
    </div>
  );
}
