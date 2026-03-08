import { useState } from 'react';
import { Search, BookOpen, ChevronRight, ThumbsUp, Eye } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useHelpArticles, useHelpCategories, type HelpArticle } from '@/hooks/useHelpCenter';
import { cn } from '@/lib/utils';

interface KnowledgeBaseSectionProps {
  onArticleClick?: (article: HelpArticle) => void;
}

export function KnowledgeBaseSection({ onArticleClick }: KnowledgeBaseSectionProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>();
  const { data: articles = [], isLoading } = useHelpArticles(selectedCategory, searchQuery);
  const { data: categories = [] } = useHelpCategories();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search knowledge base..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      </div>

      {categories.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <Badge
            variant={!selectedCategory ? 'default' : 'outline'}
            className="cursor-pointer text-[10px]"
            onClick={() => setSelectedCategory(undefined)}
          >
            All
          </Badge>
          {categories.map((cat) => (
            <Badge
              key={cat}
              variant={selectedCategory === cat ? 'default' : 'outline'}
              className="cursor-pointer text-[10px]"
              onClick={() => setSelectedCategory(cat === selectedCategory ? undefined : cat)}
            >
              {cat}
            </Badge>
          ))}
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground text-center py-8">Loading articles...</p>
      ) : articles.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          {searchQuery ? 'No articles match your search' : 'No articles published yet'}
        </p>
      ) : (
        <ScrollArea className="max-h-[500px]">
          <div className="space-y-2">
            {articles.map((article) => (
              <Card
                key={article.id}
                className="cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => onArticleClick?.(article)}
              >
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <BookOpen className="h-3.5 w-3.5 text-primary shrink-0" />
                        <h3 className="text-sm font-medium truncate">{article.title}</h3>
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <Badge variant="outline" className="text-[9px]">{article.category}</Badge>
                        {article.view_count > 0 && (
                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                            <Eye className="h-3 w-3" /> {article.view_count}
                          </span>
                        )}
                        {article.helpful_count > 0 && (
                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                            <ThumbsUp className="h-3 w-3" /> {article.helpful_count}
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
