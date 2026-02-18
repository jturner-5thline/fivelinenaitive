import { useMemo, useState } from 'react';
import { formatDistanceToNow, isToday, isThisWeek, isThisMonth } from 'date-fns';
import { RefreshCw, AlertCircle, Newspaper, Loader2, LayoutGrid, List, Columns, Bookmark, Settings2 } from 'lucide-react';
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
import { NewsFilters, type NewsCategory, type DateRange, type ViewLayout } from './NewsFilters';
import { NewsCard } from './NewsCard';
import { TrendingTopics } from './TrendingTopics';
import { ChannelManager } from './ChannelManager';
import { AlertsAndDigestPanel } from './AlertsAndDigestPanel';
import { AiSummaryPanel } from './AiSummaryPanel';
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

export function NewsGrid() {
  const { news, isLoading, error, lastFetched, refetch } = useNews();
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
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [viewLayout, setViewLayout] = useState<ViewLayout>(() => {
    return (localStorage.getItem('news-view-layout') as ViewLayout) || 'grid';
  });
  const [activeTab, setActiveTab] = useState('for-you');
  const [summaryArticle, setSummaryArticle] = useState<NewsItem | null>(null);

  const setLayout = (layout: ViewLayout) => {
    setViewLayout(layout);
    localStorage.setItem('news-view-layout', layout);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  };

  // Get active channel for filtering
  const activeChannel = channels.find(c => c.id === activeChannelId);

  const filterByDateRange = (items: NewsItem[]) => {
    if (dateRange === 'all') return items;
    return items.filter(item => {
      const date = new Date(item.publishedAt);
      if (dateRange === 'today') return isToday(date);
      if (dateRange === 'week') return isThisWeek(date);
      if (dateRange === 'month') return isThisMonth(date);
      return true;
    });
  };

  const filteredNews = useMemo(() => {
    let items = news;

    // Channel-based filtering
    if (activeChannel) {
      items = items.filter(item => {
        const text = `${item.title} ${item.summary} ${item.source}`.toLowerCase();
        const matchesKeywords = activeChannel.keywords.length === 0 || 
          activeChannel.keywords.some(k => text.includes(k.toLowerCase()));
        const matchesSources = activeChannel.sources.length === 0 || 
          activeChannel.sources.some(s => item.source.toLowerCase().includes(s.toLowerCase()));
        return matchesKeywords && (activeChannel.sources.length === 0 || matchesSources);
      });
    } else {
      // Category filtering
      items = items.filter(item => selectedCategory === 'all' || item.category === selectedCategory);
    }

    // Search
    items = items.filter(item => {
      return searchQuery === '' ||
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.source.toLowerCase().includes(searchQuery.toLowerCase());
    });

    // Date range
    items = filterByDateRange(items);

    // Boost pinned sources to top
    items.sort((a, b) => {
      const aPinned = isPinned(a.source) ? 1 : 0;
      const bPinned = isPinned(b.source) ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;
      return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    });

    return items;
  }, [news, selectedCategory, searchQuery, dateRange, activeChannel, isPinned]);

  // "For You" tab: articles matching alerts, from pinned sources, or deal-related
  const forYouNews = useMemo(() => {
    return filteredNews.filter(item => {
      const text = `${item.title} ${item.summary}`;
      const hasAlert = getMatchingAlerts(text).length > 0;
      const hasPinnedSource = isPinned(item.source);
      return hasAlert || hasPinnedSource;
    });
  }, [filteredNews, getMatchingAlerts, isPinned]);

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
      onSummarize={() => setSummaryArticle(item)}
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
        <div className="space-y-2">
          {items.map(item => renderArticleCard(item))}
        </div>
      );
    }

    // Grid or magazine layout
    const featuredItem = items[0];
    const remaining = items.slice(1);

    return (
      <div className="space-y-6">
        {viewLayout === 'magazine' && featuredItem && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {renderArticleCard(featuredItem, true)}
            {remaining.slice(0, 2).length > 0 && (
              <div className="grid gap-4">
                {remaining.slice(0, 2).map(item => renderArticleCard(item))}
              </div>
            )}
          </div>
        )}

        <div className={cn(
          'grid gap-4',
          viewLayout === 'magazine' ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
        )}>
          {(viewLayout === 'magazine' ? remaining.slice(2) : items).map(item => renderArticleCard(item))}
        </div>
      </div>
    );
  };

  if (isLoading && news.length === 0) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 rounded-lg w-full" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* AI Summary Panel */}
      {summaryArticle && (
        <AiSummaryPanel article={summaryArticle} onClose={() => setSummaryArticle(null)} />
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
          channels={channels}
          activeChannelId={activeChannelId}
          onChannelSelect={setActiveChannelId}
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
            <div className="flex items-center border rounded-md">
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
                  <Settings2 className="h-3.5 w-3.5" />
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

      {/* Tabbed Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-muted/50">
          <TabsTrigger value="for-you" className="gap-1.5">
            For You
            {forYouNews.length > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{forYouNews.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="all">All News</TabsTrigger>
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
            renderArticleGrid(forYouNews)
          )}
        </TabsContent>

        <TabsContent value="all" className="mt-4">
          <div className="flex items-center gap-2 mb-3 text-sm text-muted-foreground">
            <span>{filteredNews.length} {filteredNews.length === 1 ? 'article' : 'articles'}</span>
          </div>
          {renderArticleGrid(filteredNews)}
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
