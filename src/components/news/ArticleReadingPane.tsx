import { useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';
import {
  X, ExternalLink, Bookmark, BookmarkCheck, Share2, Archive,
  Lightbulb,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SourceTierIndicator } from './SourceTierIndicator';
import { LinkToDealPopover } from './LinkToDealPopover';
import { cn } from '@/lib/utils';
import type { NewsItem } from '@/hooks/useNews';

interface ArticleReadingPaneProps {
  article: NewsItem;
  isBookmarked: boolean;
  onToggleBookmark: () => void;
  onClose: () => void;
}

// Mock related pipeline entities
const MOCK_PIPELINE_MATCHES = [
  { name: 'Athyna', type: 'Deal', stage: 'Due Diligence' },
  { name: 'Summit Healthcare Partners', type: 'Deal', stage: 'Origination' },
];

export function ArticleReadingPane({ article, isBookmarked, onToggleBookmark, onClose }: ArticleReadingPaneProps) {
  // Handle ESC key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Generate mock AI bullet points from summary
  const bullets = article.summary
    ? [
        article.summary,
        article.whyItMatters || 'This development could impact private credit deal flow and pricing dynamics.',
        'Market participants should monitor follow-on announcements for portfolio implications.',
      ]
    : [];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-background/60 backdrop-blur-sm z-40"
        onClick={onClose}
      />
      {/* Pane */}
      <div className="fixed top-0 right-0 h-full w-full sm:w-[55%] lg:w-[45%] bg-card border-l border-border z-50 shadow-2xl animate-in slide-in-from-right duration-300 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <SourceTierIndicator tier={article.sourceTier || 3} />
            <span className="font-medium">{article.source}</span>
            {article.author && <span>· {article.author}</span>}
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <ScrollArea className="flex-1 px-6 py-5">
          <div className="space-y-5 pb-6">
            {/* Category + Time */}
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary" className="text-[10px]">
                {article.newsCategory || article.category}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(article.publishedAt), { addSuffix: true })}
              </span>
            </div>

            {/* Headline */}
            <h2 className="text-xl font-bold text-foreground leading-tight">
              {article.title}
            </h2>

            {/* Relevance tag */}
            {article.relevanceReason && (
              <div className="flex items-center gap-1.5 text-xs text-primary italic">
                <Lightbulb className="h-3 w-3" />
                {article.relevanceReason}
              </div>
            )}

            {/* AI Summary Box */}
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-2">
              <p className="text-xs font-semibold text-primary uppercase tracking-wide">AI Summary</p>
              <ul className="space-y-1.5">
                {bullets.map((b, i) => (
                  <li key={i} className="text-sm text-foreground flex gap-2">
                    <span className="text-primary mt-0.5">•</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Related to pipeline */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Related to Your Pipeline</p>
              <div className="space-y-1.5">
                {MOCK_PIPELINE_MATCHES.map(match => (
                  <div key={match.name} className="flex items-center justify-between rounded-md border border-border p-2.5 text-sm">
                    <div>
                      <span className="font-medium text-foreground">{match.name}</span>
                      <span className="text-muted-foreground ml-2 text-xs">({match.type})</span>
                    </div>
                    <Badge variant="outline" className="text-[10px]">{match.stage}</Badge>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Article image */}
            {article.imageUrl && (
              <img
                src={article.imageUrl}
                alt={article.title}
                className="w-full rounded-lg object-cover max-h-[240px]"
              />
            )}

            {/* Full preview */}
            <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
              <p>{article.summary}</p>
              <p className="text-xs italic">Full article available at the source.</p>
            </div>

            {/* Read full article */}
            <Button asChild className="w-full gap-2">
              <a href={article.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" />
                Read Full Article
              </a>
            </Button>
          </div>
        </ScrollArea>

        {/* Bottom actions */}
        <div className="border-t border-border px-6 py-3 flex items-center gap-2 flex-wrap">
          <Button
            variant={isBookmarked ? 'secondary' : 'outline'}
            size="sm"
            className="gap-1.5"
            onClick={onToggleBookmark}
          >
            {isBookmarked ? <BookmarkCheck className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />}
            {isBookmarked ? 'Saved' : 'Save'}
          </Button>
          <LinkToDealPopover articleTitle={article.title} variant="button" />
          <Button variant="outline" size="sm" className="gap-1.5">
            <Share2 className="h-3.5 w-3.5" />
            Share with Team
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5">
            <Archive className="h-3.5 w-3.5" />
            Archive
          </Button>
        </div>
      </div>
    </>
  );
}
