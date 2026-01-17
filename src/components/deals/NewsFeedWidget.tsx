import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { 
  Newspaper, 
  ExternalLink, 
  ChevronDown,
  ChevronUp,
  TrendingUp,
  Building2,
  Globe,
  DollarSign,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useNews, NewsItem } from '@/hooks/useNews';

const getCategoryIcon = (category: NewsItem['category']) => {
  switch (category) {
    case 'market':
      return <TrendingUp className="h-3 w-3" />;
    case 'deals':
      return <DollarSign className="h-3 w-3" />;
    case 'regulation':
      return <Globe className="h-3 w-3" />;
    case 'company':
      return <Building2 className="h-3 w-3" />;
  }
};

const getCategoryColor = (category: NewsItem['category']) => {
  switch (category) {
    case 'market':
      return 'bg-primary/10 text-primary';
    case 'deals':
      return 'bg-success/10 text-success';
    case 'regulation':
      return 'bg-warning/10 text-warning';
    case 'company':
      return 'bg-accent text-accent-foreground';
  }
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
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="pb-3 cursor-pointer hover:bg-muted/50 transition-colors">
            <CardTitle className="text-lg font-medium flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Newspaper className="h-5 w-5 text-primary" />
                News Feed
              </div>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                {isOpen ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0">
            {/* Refresh button and last fetched info */}
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
                onClick={(e) => {
                  e.stopPropagation();
                  handleRefresh();
                }}
                disabled={isRefreshing}
                className="h-7 px-2 text-xs"
              >
                <RefreshCw className={`h-3 w-3 mr-1 ${isRefreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>

            <ScrollArea className="h-[320px]">
              {isLoading ? (
                <div className="space-y-3 pr-2">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="p-3 rounded-lg border border-border">
                      <div className="flex items-center gap-2 mb-2">
                        <Skeleton className="h-4 w-16" />
                        <Skeleton className="h-3 w-20" />
                      </div>
                      <Skeleton className="h-4 w-full mb-1" />
                      <Skeleton className="h-4 w-3/4 mb-2" />
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-3 w-2/3 mt-1" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3 pr-2">
                  {news.map((item) => (
                    <a
                      key={item.id}
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge 
                              variant="secondary" 
                              className={`text-[10px] px-1.5 py-0 ${getCategoryColor(item.category)}`}
                            >
                              <span className="mr-1">{getCategoryIcon(item.category)}</span>
                              {item.category}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground">
                              {item.source}
                            </span>
                          </div>
                          <h4 className="text-sm font-medium text-foreground line-clamp-2 group-hover:text-primary transition-colors">
                            {item.title}
                          </h4>
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {item.summary}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-1.5">
                            {formatDistanceToNow(new Date(item.publishedAt), { addSuffix: true })}
                          </p>
                        </div>
                        <ExternalLink className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1" />
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
