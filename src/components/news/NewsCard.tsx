import { formatDistanceToNow } from 'date-fns';
import { ExternalLink, TrendingUp, DollarSign, Globe, Building2, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { NewsItem } from '@/hooks/useNews';

interface NewsCardProps {
  item: NewsItem;
  featured?: boolean;
}

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
      return 'bg-primary/10 text-primary border-primary/20';
    case 'deals':
      return 'bg-success/10 text-success border-success/20';
    case 'regulation':
      return 'bg-warning/10 text-warning border-warning/20';
    case 'company':
      return 'bg-accent text-accent-foreground border-accent';
  }
};

export function NewsCard({ item, featured = false }: NewsCardProps) {
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block group"
    >
      <Card className={cn(
        'overflow-hidden transition-all duration-300 hover:shadow-lg hover:border-primary/40 h-full',
        featured ? 'p-6' : 'p-4'
      )}>
        <div className="flex flex-col h-full">
          {/* Header with category and source */}
          <div className="flex items-center justify-between gap-2 mb-3">
            <Badge 
              variant="outline" 
              className={cn('text-[10px] px-2 py-0.5 gap-1', getCategoryColor(item.category))}
            >
              {getCategoryIcon(item.category)}
              {item.category}
            </Badge>
            <span className="text-[11px] text-muted-foreground font-medium truncate">
              {item.source}
            </span>
          </div>

          {/* Title */}
          <h3 className={cn(
            'font-semibold text-foreground group-hover:text-primary transition-colors mb-2 line-clamp-2',
            featured ? 'text-xl' : 'text-sm'
          )}>
            {item.title}
          </h3>

          {/* Summary */}
          <p className={cn(
            'text-muted-foreground flex-1',
            featured ? 'text-sm line-clamp-3' : 'text-xs line-clamp-2'
          )}>
            {item.summary}
          </p>

          {/* Footer */}
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/50">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span className="text-[11px]">
                {formatDistanceToNow(new Date(item.publishedAt), { addSuffix: true })}
              </span>
            </div>
            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
      </Card>
    </a>
  );
}
