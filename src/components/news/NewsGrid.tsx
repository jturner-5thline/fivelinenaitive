import { useMemo, useState } from 'react';
import { formatDistanceToNow, subHours, subDays } from 'date-fns';
import { RefreshCw, AlertCircle, Newspaper, Loader2, LayoutGrid, List, Columns, Bookmark, Bell, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { NewsFilters, type NewsCategory, type DateRange, type ViewLayout, type NewsTab, type SourceTierFilter, type EntityTypeFilter } from './NewsFilters';
import { NewsCard } from './NewsCard';
import { ArticleReadingPane } from './ArticleReadingPane';
import { TrendingTopics } from './TrendingTopics';
import { ChannelManager } from './ChannelManager';
import { AlertsAndDigestPanel } from './AlertsAndDigestPanel';
import { useNews } from '@/hooks/useNews';
import { useNewsBookmarks } from '@/hooks/useNewsBookmarks';
import { useNewsReadStatus } from '@/hooks/useNewsReadStatus';
import { useNewsChannels } from '@/hooks/useNewsChannels';
import { useNewsPinnedSources } from '@/hooks/useNewsPinnedSources';
import { useNewsAlerts } from '@/hooks/useNewsAlerts';
import { useNewsDigestSettings } from '@/hooks/useNewsDigestSettings';
import { useTrendingTopics } from '@/hooks/useTrendingTopics';
import { cn } from '@/lib/utils';
import type { NewsItem } from '@/hooks/useNews';

interface NewsGridProps {
  defaultLayout?: ViewLayout;
  defaultTab?: string;
}

export function NewsGrid({ defaultLayout, defaultTab }: NewsGridProps) {
  const { news, allNews, isLoading, error, lastFetched, refetch, hasMore, loadMore } = useNews({ pageSize: 8 });
  const { bookmarkedArticles, isBookmarked, toggleBookmark } = useNewsBookmarks();
  const { isRead, markAsRead } = useNewsReadStatus();
  const { channels, createChannel, updateChannel, deleteChannel } = useNewsChannels();
  const { isPinned, togglePin } = useNewsPinnedSources();
  const { alerts, createAlert, updateAlert, deleteAlert, getMatchingAlerts } = useNewsAlerts();
  const { settings: digestSettings, updateSettings: updateDigestSettings } = useNewsDigestSettings();
  const trendingTopics = useTrendingTopics(news);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<NewsCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateRange, setDateRange] = useState<DateRange>('all');
  const [sourceTierFilter, setSourceTierFilter] = useState<SourceTierFilter>('all');
  const [entityTypeFilter, setEntityTypeFilter] = useState<EntityTypeFilter>('all');
  const [viewLayout, setViewLayout] = useState<ViewLayout>(() => {
    return defaultLayout || (localStorage.getItem('news-view-layout') as ViewLayout) || 'list';
  });
  const [activeTab, setActiveTab] = useState<NewsTab>((defaultTab as NewsTab) || 'for-you');
  const [selectedArticle, setSelectedArticle] = useState<NewsItem | null>(null);
  const [featuredOpen, setFeaturedOpen] = useState(true);

  const setLayout = (layout: ViewLayout) => {
    setViewLayout(layout);
    localStorage.setItem('news-view-layout', layout);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  };

  // Date filter
  const filterByDateRange = (items: NewsItem[]) => {
    if (dateRange === 'all') return items;
    const now = new Date();
    let cutoff: Date;
    switch (dateRange) {
      case '24h': cutoff = subHours(now, 24); break;
      case '7d': cutoff = subDays(now, 7); break;
      case '30d': cutoff = subDays(now, 30); break;
      case '90d': cutoff = subDays(now, 90); break;
      default: return items;
    }
    return items.filter(item => new Date(item.publishedAt) >= cutoff);
  };

  // Category counts (use full list so badges reflect totals, not page size)
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: allNews.length };
    allNews.forEach(item => {
      const cat = item.newsCategory || item.category;
      counts[cat] = (counts[cat] || 0) + 1;
    });
    counts['watchlist'] = allNews.filter(item => {
      const text = `${item.title} ${item.summary}`;
      return getMatchingAlerts(text).length > 0 || isPinned(item.source);
    }).length;
    counts['active-deals'] = allNews.filter(item =>
      item.newsCategory === 'active-deals' || item.relevanceReason?.toLowerCase().includes('deal')
    ).length;
    return counts;
  }, [allNews, getMatchingAlerts, isPinned]);

  // Main filtering
  const filteredNews = useMemo(() => {
    let items = [...news];

    // Category
    if (selectedCategory !== 'all') {
      if (selectedCategory === 'watchlist') {
        items = items.filter(item => {
          const text = `${item.title} ${item.summary}`;
          return getMatchingAlerts(text).length > 0 || isPinned(item.source) || item.newsCategory === 'watchlist';
        });
      } else if (selectedCategory === 'active-deals') {
        items = items.filter(item =>
          item.newsCategory === 'active-deals' || item.relevanceReason?.toLowerCase().includes('deal')
        );
      } else if (selectedCategory === 'borrowers') {
        items = items.filter(item =>
          item.newsCategory === 'borrowers' || item.category === 'clients'
        );
      } else {
        items = items.filter(item => item.newsCategory === selectedCategory || item.category === selectedCategory);
      }
    }

    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      items = items.filter(item =>
        item.title.toLowerCase().includes(q) ||
        item.summary.toLowerCase().includes(q) ||
        item.source.toLowerCase().includes(q) ||
        (item.author?.toLowerCase().includes(q)) ||
        (item.relevanceReason?.toLowerCase().includes(q))
      );
    }

    // Date range
    items = filterByDateRange(items);

    // Source tier
    if (sourceTierFilter !== 'all') {
      const tier = parseInt(sourceTierFilter) as 1 | 2 | 3;
      items = items.filter(item => (item.sourceTier || 3) === tier);
    }

    // Sort: pinned first, then by date
    items.sort((a, b) => {
      const aPinned = isPinned(a.source) ? 1 : 0;
      const bPinned = isPinned(b.source) ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;
      return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    });

    return items;
  }, [news, selectedCategory, searchQuery, dateRange, sourceTierFilter, entityTypeFilter, getMatchingAlerts, isPinned]);

  // For You: personalized
  const forYouNews = useMemo(() => {
    return filteredNews.filter(item => {
      const text = `${item.title} ${item.summary}`;
      return getMatchingAlerts(text).length > 0 || isPinned(item.source) || item.relevanceReason;
    });
  }, [filteredNews, getMatchingAlerts, isPinned]);

  // Watchlist alerts
  const watchlistNews = useMemo(() => {
    return filteredNews.filter(item => {
      const text = `${item.title} ${item.summary}`;
      return getMatchingAlerts(text).length > 0 || item.newsCategory === 'watchlist' || isPinned(item.source);
    });
  }, [filteredNews, getMatchingAlerts, isPinned]);

  // Featured top stories (top 3 from tier-1 sources)
  const featuredStories = useMemo(() => {
    return news
      .filter(item => (item.sourceTier || 3) <= 1 && item.imageUrl)
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
      .slice(0, 3);
  }, [news]);

  const renderArticleCard = (item: NewsItem, featured = false) => (
    <NewsCard
      key={item.id}
      item={item}
      featured={featured}
      layout={viewLayout}
      isBookmarked={isBookmarked(item.id)}
      isRead={isRead(item.id)}
      isPinned={isPinned(item.source)}
      matchingAlerts={getMatchingAlerts(`${item.title} ${item.summary}`).map(a => a.keyword)}
      onToggleBookmark={() => toggleBookmark(item)}
      onMarkRead={() => markAsRead(item.id)}
      onTogglePin={() => togglePin(item.source)}
      onSummarize={() => setSelectedArticle(item)}
      onArticleClick={() => setSelectedArticle(item)}
    />
  );

  const renderArticleGrid = (items: NewsItem[]) => {
    if (items.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Newspaper className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-1">No articles found</h3>
          <p className="text-sm text-muted-foreground">
            Try adjusting your filters or search query
          </p>
        </div>
      );
    }

    if (viewLayout === 'list') {
      return (
        <div className="space-y-1">
          {items.map(item => renderArticleCard(item))}
        </div>
      );
    }

    // Grid or magazine layout
    if (viewLayout === 'magazine') {
      const featuredItem = items[0];
      const remaining = items.slice(1);
      return (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {renderArticleCard(featuredItem, true)}
            {remaining.slice(0, 2).length > 0 && (
              <div className="grid gap-4">
                {remaining.slice(0, 2).map(item => renderArticleCard(item))}
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {remaining.slice(2).map(item => renderArticleCard(item))}
          </div>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map(item => renderArticleCard(item))}
      </div>
    );
  };

  if (isLoading && news.length === 0) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 rounded-lg w-full" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="rounded-lg border border-border p-4 space-y-3 animate-pulse">
              <Skeleton className="h-32 w-full rounded-md" />
              <Skeleton className="h-3 w-1/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Hard error with no cached data — surface retry CTA per spec.
  if (error && allNews.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertCircle className="h-10 w-10 text-warning mb-3" />
        <h3 className="text-lg font-medium text-foreground mb-1">
          News is taking longer than usual to load.
        </h3>
        <p className="text-sm text-muted-foreground mb-4">Try refreshing.</p>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
          {isRefreshing ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Article Reading Pane */}
      {selectedArticle && (
        <ArticleReadingPane
          article={selectedArticle}
          isBookmarked={isBookmarked(selectedArticle.id)}
          onToggleBookmark={() => toggleBookmark(selectedArticle)}
          onClose={() => setSelectedArticle(null)}
        />
      )}

      {/* Filters + Controls */}
      <div className="flex flex-col gap-3">
        <NewsFilters
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          sourceTierFilter={sourceTierFilter}
          onSourceTierChange={setSourceTierFilter}
          entityTypeFilter={entityTypeFilter}
          onEntityTypeChange={setEntityTypeFilter}
          categoryCounts={categoryCounts}
        />

        {/* Status bar */}
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-4">
            {error && (
              <span className="flex items-center gap-1.5 text-warning">
                <AlertCircle className="h-3.5 w-3.5" />
                {error}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Layout Toggle */}
            <div className="flex items-center border border-border rounded-md">
              <Button
                variant={viewLayout === 'magazine' ? 'secondary' : 'ghost'}
                size="icon"
                className="h-8 w-8 rounded-none rounded-l-md"
                onClick={() => setLayout('magazine')}
              >
                <Columns className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant={viewLayout === 'grid' ? 'secondary' : 'ghost'}
                size="icon"
                className="h-8 w-8 rounded-none"
                onClick={() => setLayout('grid')}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant={viewLayout === 'list' ? 'secondary' : 'ghost'}
                size="icon"
                className="h-8 w-8 rounded-none rounded-r-md"
                onClick={() => setLayout('list')}
              >
                <List className="h-3.5 w-3.5" />
              </Button>
            </div>

            {lastFetched && (
              <span className="text-xs text-muted-foreground hidden sm:inline">
                Updated {formatDistanceToNow(lastFetched, { addSuffix: true })}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="h-8"
            >
              {isRefreshing ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              )}
              Refresh
            </Button>

            {/* Settings Sheet */}
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1.5">
                  Settings
                </Button>
              </SheetTrigger>
              <SheetContent className="w-[380px] sm:w-[420px]">
                <SheetHeader>
                  <SheetTitle>News Settings</SheetTitle>
                </SheetHeader>
                <ScrollArea className="h-[calc(100vh-100px)] pr-4 mt-4">
                  <div className="space-y-6">
                    <TrendingTopics topics={trendingTopics} onTopicClick={(word) => setSearchQuery(word)} />
                    <Separator />
                    <ChannelManager
                      channels={channels}
                      onCreateChannel={createChannel}
                      onUpdateChannel={updateChannel}
                      onDeleteChannel={deleteChannel}
                    />
                    <Separator />
                    <AlertsAndDigestPanel
                      alerts={alerts}
                      onCreateAlert={createAlert}
                      onUpdateAlert={updateAlert}
                      onDeleteAlert={deleteAlert}
                      digestSettings={digestSettings}
                      onUpdateDigestSettings={updateDigestSettings}
                    />
                  </div>
                </ScrollArea>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>

      {/* Featured / Top Stories */}
      {featuredStories.length > 0 && viewLayout === 'list' && (
        <Collapsible open={featuredOpen} onOpenChange={setFeaturedOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1.5 h-7 text-xs text-muted-foreground hover:text-foreground w-full justify-start">
              {featuredOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              Top Stories
              <Badge variant="secondary" className="h-4 px-1 text-[9px]">{featuredStories.length}</Badge>
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              {featuredStories.map(item => (
                <div
                  key={item.id}
                  className="group/feat rounded-lg border border-border overflow-hidden cursor-pointer hover:border-primary/40 transition-all"
                  onClick={() => setSelectedArticle(item)}
                >
                  {item.imageUrl && (
                    <div className="h-28 overflow-hidden">
                      <img
                        src={item.imageUrl}
                        alt={item.title}
                        className="w-full h-full object-cover group-hover/feat:scale-105 transition-transform duration-300"
                      />
                    </div>
                  )}
                  <div className="p-3 space-y-1">
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5">{item.source}</Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {formatDistanceToNow(new Date(item.publishedAt), { addSuffix: true })}
                      </span>
                    </div>
                    <h4 className="text-sm font-medium text-foreground line-clamp-2 group-hover/feat:text-primary transition-colors">
                      {item.title}
                    </h4>
                    {item.whyItMatters && (
                      <p className="text-[10px] text-muted-foreground italic line-clamp-1">
                        Why it matters: {item.whyItMatters}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Tabbed Content */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as NewsTab)}>
        <TabsList className="bg-muted/50">
          <TabsTrigger value="for-you" className="gap-1.5">
            For You
            {forYouNews.length > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{forYouNews.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="all">All News</TabsTrigger>
          <TabsTrigger value="watchlist-alerts" className="gap-1.5">
            <Bell className="h-3.5 w-3.5" />
            Watchlist Alerts
            {watchlistNews.length > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{watchlistNews.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="saved" className="gap-1.5">
            <Bookmark className="h-3.5 w-3.5" />
            Saved
            {bookmarkedArticles.length > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{bookmarkedArticles.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="for-you" className="mt-4">
          {forYouNews.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Newspaper className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-1">No personalized news yet</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                Set up keyword alerts or pin your favorite sources in Settings to see personalized articles here.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-3 text-sm text-muted-foreground">
                <span>{forYouNews.length} personalized {forYouNews.length === 1 ? 'article' : 'articles'}</span>
              </div>
              {renderArticleGrid(forYouNews)}
            </>
          )}
        </TabsContent>

        <TabsContent value="all" className="mt-4">
          <div className="flex items-center gap-2 mb-3 text-sm text-muted-foreground">
            <span>{filteredNews.length} {filteredNews.length === 1 ? 'article' : 'articles'}</span>
          </div>
          {renderArticleGrid(filteredNews)}
        </TabsContent>

        <TabsContent value="watchlist-alerts" className="mt-4">
          {watchlistNews.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Bell className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-1">No watchlist alerts</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                Add companies, people, or keywords to your watchlist to get alerts when they appear in news.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-3 text-sm text-muted-foreground">
                <span>{watchlistNews.length} {watchlistNews.length === 1 ? 'alert' : 'alerts'}</span>
              </div>
              {renderArticleGrid(watchlistNews)}
            </>
          )}
        </TabsContent>

        <TabsContent value="saved" className="mt-4">
          {bookmarkedArticles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Bookmark className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-1">No saved articles</h3>
              <p className="text-sm text-muted-foreground">
                Bookmark articles to save them for later reading
              </p>
            </div>
          ) : (
            renderArticleGrid(bookmarkedArticles)
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
