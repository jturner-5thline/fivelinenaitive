import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { NewsItem } from './useNews';

export function useNewsBookmarks() {
  const { user } = useAuth();
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
  const [bookmarkedArticles, setBookmarkedArticles] = useState<NewsItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchBookmarks = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    const { data } = await supabase
      .from('news_bookmarks')
      .select('article_id, article_data')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (data) {
      setBookmarkedIds(new Set(data.map(d => d.article_id)));
      setBookmarkedArticles(data.map(d => d.article_data as unknown as NewsItem));
    }
    setIsLoading(false);
  }, [user]);

  useEffect(() => { fetchBookmarks(); }, [fetchBookmarks]);

  const toggleBookmark = useCallback(async (article: NewsItem) => {
    if (!user) return;
    const isBookmarked = bookmarkedIds.has(article.id);

    if (isBookmarked) {
      await supabase
        .from('news_bookmarks')
        .delete()
        .eq('user_id', user.id)
        .eq('article_id', article.id);
      setBookmarkedIds(prev => { const s = new Set(prev); s.delete(article.id); return s; });
      setBookmarkedArticles(prev => prev.filter(a => a.id !== article.id));
    } else {
      await supabase
        .from('news_bookmarks')
        .insert({ user_id: user.id, article_id: article.id, article_data: article as any });
      setBookmarkedIds(prev => new Set(prev).add(article.id));
      setBookmarkedArticles(prev => [article, ...prev]);
    }
  }, [user, bookmarkedIds]);

  const isBookmarked = useCallback((id: string) => bookmarkedIds.has(id), [bookmarkedIds]);

  return { bookmarkedArticles, isBookmarked, toggleBookmark, isLoading };
}
