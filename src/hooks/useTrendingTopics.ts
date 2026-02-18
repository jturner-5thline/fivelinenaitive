import { useMemo } from 'react';
import type { NewsItem } from '@/hooks/useNews';

export function useTrendingTopics(news: NewsItem[]) {
  return useMemo(() => {
    const wordCounts = new Map<string, number>();
    const stopWords = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
      'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
      'before', 'after', 'above', 'below', 'between', 'out', 'off', 'over',
      'under', 'again', 'further', 'then', 'once', 'and', 'but', 'or',
      'nor', 'not', 'so', 'yet', 'both', 'either', 'neither', 'each',
      'every', 'all', 'any', 'few', 'more', 'most', 'other', 'some',
      'such', 'no', 'only', 'own', 'same', 'than', 'too', 'very',
      'just', 'because', 'about', 'up', 'its', 'it', 'this', 'that',
      'these', 'those', 'he', 'she', 'they', 'we', 'you', 'me', 'him',
      'her', 'us', 'them', 'my', 'your', 'his', 'our', 'their', 'what',
      'which', 'who', 'whom', 'how', 'where', 'when', 'why', 'new',
      'says', 'said', 'also', 'like', 'get', 'make', 'back', 'see',
    ]);

    news.forEach(item => {
      const text = `${item.title} ${item.summary}`;
      const words = text.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/);
      words.forEach(word => {
        if (word.length > 3 && !stopWords.has(word)) {
          wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
        }
      });
    });

    return Array.from(wordCounts.entries())
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([word, count]) => ({ word, count }));
  }, [news]);
}
