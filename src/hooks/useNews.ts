import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface NewsItem {
  id: string;
  title: string;
  source: string;
  category: 'market' | 'deals' | 'regulation' | 'company';
  summary: string;
  url: string;
  publishedAt: string;
}

// Fallback dummy data in case API fails
const FALLBACK_NEWS: NewsItem[] = [
  {
    id: 'fallback-1',
    title: 'Fed Signals Potential Rate Cuts in 2025 as Inflation Cools',
    source: 'Wall Street Journal',
    category: 'market',
    summary: 'Federal Reserve officials indicated they may begin cutting interest rates later this year as inflation data shows signs of moderating.',
    url: '#',
    publishedAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
  },
  {
    id: 'fallback-2',
    title: 'Private Credit Market Reaches $1.7 Trillion Milestone',
    source: 'Bloomberg',
    category: 'deals',
    summary: 'The private credit market has grown to $1.7 trillion globally, with institutional investors increasingly allocating capital to direct lending.',
    url: '#',
    publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
  },
  {
    id: 'fallback-3',
    title: 'New SEC Regulations to Impact Alternative Lending Disclosure',
    source: 'Reuters',
    category: 'regulation',
    summary: 'The SEC announced new disclosure requirements for alternative lending platforms, set to take effect in Q3 2025.',
    url: '#',
    publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
  },
  {
    id: 'fallback-4',
    title: 'Apollo Global Closes $5B Infrastructure Credit Fund',
    source: 'Financial Times',
    category: 'company',
    summary: 'Apollo Global Management has closed its fifth infrastructure credit fund at $5 billion, exceeding its initial target.',
    url: '#',
    publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
  },
];

const CACHE_KEY = 'news-feed-cache';
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes

interface CachedNews {
  news: NewsItem[];
  timestamp: number;
}

export function useNews() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  const fetchNews = useCallback(async (forceRefresh = false) => {
    // Check cache first
    if (!forceRefresh) {
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const { news: cachedNews, timestamp }: CachedNews = JSON.parse(cached);
          if (Date.now() - timestamp < CACHE_DURATION) {
            setNews(cachedNews);
            setLastFetched(new Date(timestamp));
            setIsLoading(false);
            return;
          }
        }
      } catch (e) {
        console.error('Error reading cache:', e);
      }
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('fetch-news');

      if (fnError) {
        throw new Error(fnError.message);
      }

      if (data?.news && data.news.length > 0) {
        setNews(data.news);
        setLastFetched(new Date());
        
        // Cache the results
        const cacheData: CachedNews = {
          news: data.news,
          timestamp: Date.now(),
        };
        localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
      } else {
        // Use fallback data if no news returned
        setNews(FALLBACK_NEWS);
        setError('Using cached news data');
      }
    } catch (err) {
      console.error('Error fetching news:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch news');
      
      // Try to use cached data even if expired
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const { news: cachedNews }: CachedNews = JSON.parse(cached);
          setNews(cachedNews);
        } else {
          setNews(FALLBACK_NEWS);
        }
      } catch {
        setNews(FALLBACK_NEWS);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNews();
  }, [fetchNews]);

  return {
    news,
    isLoading,
    error,
    lastFetched,
    refetch: () => fetchNews(true),
  };
}