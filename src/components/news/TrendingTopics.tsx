import { TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface TrendingTopicsProps {
  topics: { word: string; count: number }[];
  onTopicClick?: (word: string) => void;
}

export function TrendingTopics({ topics, onTopicClick }: TrendingTopicsProps) {
  if (topics.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-primary" />
        Trending
      </h3>
      <div className="flex flex-wrap gap-1.5">
        {topics.map(({ word, count }) => (
          <Badge
            key={word}
            variant="outline"
            className="cursor-pointer hover:bg-primary/10 transition-colors text-xs"
            onClick={() => onTopicClick?.(word)}
          >
            {word}
            <span className="ml-1 text-muted-foreground">{count}</span>
          </Badge>
        ))}
      </div>
    </div>
  );
}
