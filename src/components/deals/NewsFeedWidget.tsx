import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { 
  Newspaper, 
  ExternalLink, 
  ChevronDown,
  ChevronUp,
  RefreshCw,
  AlertCircle,
  Diamond,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useNews, type NewsItem, getSourceTier } from '@/hooks/useNews';
import { cn } from '@/lib/utils';

const getCategoryColor = (category: string) => {
  const map: Record<string, string> = {
    lenders: 'bg-primary/10 text-primary',
    clients: 'bg-emerald-500/10 text-emerald-400',
    borrowers: 'bg-emerald-500/10 text-emerald-400',
    competitors: 'bg-amber-500/10 text-amber-400',
    market: 'bg-blue-500/10 text-blue-400',
    regulatory: 'bg-red-500/10 text-red-400',
    sectors: 'bg-purple-500/10 text-purple-400',
  };
  return map[category] || 'bg-muted text-muted-foreground';
};

interface NewsFeedWidgetProps {
  defaultOpen?: boolean;
}

export function NewsFeedWidget({ defaultOpen = true }: NewsFeedWidgetProps) {
  const { news, isLoading, error, lastFetched, refetch } = useNews();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isOpen, setIsOpen] = useState(() => {
    const saved = localStorage.getItem('dashboard-newsfeed-open');
    return saved !== null ? JSON.parse(saved) : defaultOpen;
  });

  const handleToggle = (open: boolean) => {
    setIsOpen(open);
    localStorage.setItem('dashboard-newsfeed-open', JSON.stringify(open));
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  };

  return (
    <Collapsible open={isOpen} onOpenChange={handleToggle}>
      <Card className="deal-glass">
        <CollapsibleTrigger asChild>
          <CardHeader className="pb-3 cursor-pointer hover:bg-muted/50 transition-colors">
            <CardTitle className="text-lg font-medium flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Newspaper className="h-5 w-5 text-primary" />
                News Feed
              </div>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0">
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs text-muted-foreground">
                {lastFetched && (
                  <span>Updated {formatDistanceToNow(lastFetched, { addSuffix: true })}</span>
                )}
                {error && (
                  <span className="flex items-center gap-1 text-warning">
                    <AlertCircle className="h-3 w-3" />
                    {error}
                  </span>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => { e.stopPropagation(); handleRefresh(); }}
                disabled={isRefreshing}
                className="h-7 px-2 text-xs"
              >
                <RefreshCw className={cn("h-3 w-3 mr-1", isRefreshing && "animate-spin")} />
                Refresh
              </Button>
            </div>

            <ScrollArea className="h-[320px]">
              {isLoading ? (
                <div className="space-y-2 pr-2">
                  {[...Array(6)].map((_, i) => (
                    <Skeleton key={i} className="h-10 rounded-md" />
                  ))}
                </div>
              ) : (
                <div className="space-y-1 pr-2">
                  {news.slice(0, 10).map((item) => {
                    const displayCat = item.newsCategory || item.category;
                    const tier = item.sourceTier || getSourceTier(item.source);
                    return (
                      <a
                        key={item.id}
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 transition-colors group"
                      >
                        {tier <= 1 && <Diamond className="h-2.5 w-2.5 text-blue-400 fill-current flex-shrink-0" />}
                        {tier === 2 && <Diamond className="h-2.5 w-2.5 text-muted-foreground fill-current flex-shrink-0" />}
                        <Badge variant="secondary" className={cn('text-[8px] px-1 py-0 h-3.5 flex-shrink-0 uppercase', getCategoryColor(displayCat))}>
                          {displayCat}
                        </Badge>
                        <span className="text-xs font-medium text-foreground truncate flex-1 group-hover:text-primary transition-colors">
                          {item.title}
                        </span>
                        <span className="text-[10px] text-muted-foreground flex-shrink-0 whitespace-nowrap">
                          {formatDistanceToNow(new Date(item.publishedAt), { addSuffix: true })}
                        </span>
                        <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                      </a>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
