import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface NewsItem {
  id: string;
  title: string;
  source: string;
  category: 'lenders' | 'clients';
  summary: string;
  url: string;
  publishedAt: string;
  imageUrl?: string;
  lenderName?: string;
}

// Fallback dummy data in case API fails
const FALLBACK_NEWS: NewsItem[] = [
  {
    id: 'fallback-1',
    title: 'Private Credit Market Sees Record Growth in Q4',
    source: 'Wall Street Journal',
    category: 'lenders',
    summary: 'Major private credit lenders report unprecedented deal flow as traditional banks pull back from leveraged lending.',
    url: '#',
    publishedAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    imageUrl: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=400&h=300&fit=crop',
  },
  {
    id: 'fallback-2',
    title: 'Mid-Market Companies Seek Alternative Financing',
    source: 'Bloomberg',
    category: 'clients',
    summary: 'Growing number of mid-market companies turn to private credit as bank lending standards tighten.',
    url: '#',
    publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    imageUrl: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=400&h=300&fit=crop',
  },
  {
    id: 'fallback-3',
    title: 'Apollo Global Closes $5B Infrastructure Credit Fund',
    source: 'Financial Times',
    category: 'lenders',
    summary: 'Apollo Global Management has closed its fifth infrastructure credit fund at $5 billion, exceeding its initial target.',
    url: '#',
    publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
    imageUrl: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=400&h=300&fit=crop',
  },
];

const CACHE_KEY = 'news-feed-cache-v4'; // Updated to bust cache
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
      // Fetch lender names from the database
      const { data: lenderData } = await supabase
        .from('master_lenders')
        .select('name')
        .limit(20);

      const lenderNames = lenderData?.map(l => l.name) || [];

      const { data, error: fnError } = await supabase.functions.invoke('fetch-news', {
        body: { lenderNames }
      });

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
