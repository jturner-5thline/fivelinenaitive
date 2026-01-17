import { useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { RefreshCw, AlertCircle, Newspaper, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { NewsFilters, type NewsCategory } from './NewsFilters';
import { NewsCard } from './NewsCard';
import { useNews } from '@/hooks/useNews';

export function NewsGrid() {
  const { news, isLoading, error, lastFetched, refetch } = useNews();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<NewsCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  };

  const filteredNews = useMemo(() => {
    return news.filter((item) => {
      const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
      const matchesSearch = searchQuery === '' || 
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.source.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [news, selectedCategory, searchQuery]);

  const featuredNews = filteredNews[0];
  const remainingNews = filteredNews.slice(1);

  if (isLoading && news.length === 0) {
    return (
      <div className="space-y-6">
        <NewsFilters
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />
        
        <div className="grid gap-6">
          {/* Featured skeleton */}
          <Skeleton className="h-48 rounded-lg" />
          
          {/* Grid skeletons */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-40 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <NewsFilters
        selectedCategory={selectedCategory}
        onCategoryChange={setSelectedCategory}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      {/* Status bar */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-4">
          <span className="text-muted-foreground">
            {filteredNews.length} {filteredNews.length === 1 ? 'article' : 'articles'}
          </span>
          {error && (
            <span className="flex items-center gap-1.5 text-warning">
              <AlertCircle className="h-3.5 w-3.5" />
              {error}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {lastFetched && (
            <span className="text-xs text-muted-foreground">
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
        </div>
      </div>

      {/* No results */}
      {filteredNews.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Newspaper className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-1">No articles found</h3>
          <p className="text-sm text-muted-foreground">
            Try adjusting your filters or search query
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Featured article */}
          {featuredNews && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <NewsCard item={featuredNews} featured />
              
              {/* Secondary featured articles */}
              {remainingNews.slice(0, 2).length > 0 && (
                <div className="grid gap-4">
                  {remainingNews.slice(0, 2).map((item) => (
                    <NewsCard key={item.id} item={item} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Remaining articles grid */}
          {remainingNews.slice(2).length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {remainingNews.slice(2).map((item) => (
                <NewsCard key={item.id} item={item} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
