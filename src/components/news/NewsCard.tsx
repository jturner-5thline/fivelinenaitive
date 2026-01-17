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

const getCategoryGradient = (category: NewsItem['category']) => {
  switch (category) {
    case 'market':
      return 'from-primary/20 to-primary/5';
    case 'deals':
      return 'from-success/20 to-success/5';
    case 'regulation':
      return 'from-warning/20 to-warning/5';
    case 'company':
      return 'from-accent/40 to-accent/10';
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
        featured ? 'flex flex-col md:flex-row' : ''
      )}>
        {/* Image */}
        <div className={cn(
          'relative overflow-hidden',
          featured ? 'md:w-2/5 h-48 md:h-auto' : 'h-36'
        )}>
          {item.imageUrl ? (
            <img 
              src={item.imageUrl} 
              alt={item.title}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              loading="lazy"
            />
          ) : (
            <div className={cn(
              'w-full h-full bg-gradient-to-br',
              getCategoryGradient(item.category)
            )} />
          )}
          {/* Overlay gradient */}
          <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-background/20 to-transparent" />
          
          {/* Category badge on image */}
          <div className="absolute top-3 left-3">
            <Badge 
              variant="outline" 
              className={cn(
                'text-[10px] px-2 py-0.5 gap-1 backdrop-blur-sm bg-background/60',
                getCategoryColor(item.category)
              )}
            >
              {getCategoryIcon(item.category)}
              {item.category}
            </Badge>
          </div>
        </div>

        {/* Content */}
        <div className={cn(
          'flex flex-col p-4',
          featured ? 'md:w-3/5 md:p-6' : ''
        )}>
          {/* Source */}
          <span className="text-[11px] text-muted-foreground font-medium mb-2">
            {item.source}
          </span>

          {/* Title */}
          <h3 className={cn(
            'font-semibold text-foreground group-hover:text-primary transition-colors mb-2',
            featured ? 'text-xl line-clamp-2' : 'text-sm line-clamp-2'
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
