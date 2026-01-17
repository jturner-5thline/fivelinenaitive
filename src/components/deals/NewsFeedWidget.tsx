import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { 
  Newspaper, 
  ExternalLink, 
  ChevronDown,
  ChevronUp,
  TrendingUp,
  Building2,
  Globe,
  DollarSign
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface NewsItem {
  id: string;
  title: string;
  source: string;
  category: 'market' | 'deals' | 'regulation' | 'company';
  summary: string;
  url: string;
  publishedAt: Date;
}

// Dummy news data
const DUMMY_NEWS: NewsItem[] = [
  {
    id: '1',
    title: 'Fed Signals Potential Rate Cuts in 2025 as Inflation Cools',
    source: 'Wall Street Journal',
    category: 'market',
    summary: 'Federal Reserve officials indicated they may begin cutting interest rates later this year as inflation data shows signs of moderating.',
    url: '#',
    publishedAt: new Date(Date.now() - 1000 * 60 * 30), // 30 mins ago
  },
  {
    id: '2',
    title: 'Private Credit Market Reaches $1.7 Trillion Milestone',
    source: 'Bloomberg',
    category: 'deals',
    summary: 'The private credit market has grown to $1.7 trillion globally, with institutional investors increasingly allocating capital to direct lending.',
    url: '#',
    publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
  },
  {
    id: '3',
    title: 'New SEC Regulations to Impact Alternative Lending Disclosure',
    source: 'Reuters',
    category: 'regulation',
    summary: 'The SEC announced new disclosure requirements for alternative lending platforms, set to take effect in Q3 2025.',
    url: '#',
    publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 4), // 4 hours ago
  },
  {
    id: '4',
    title: 'Apollo Global Closes $5B Infrastructure Credit Fund',
    source: 'Financial Times',
    category: 'company',
    summary: 'Apollo Global Management has closed its fifth infrastructure credit fund at $5 billion, exceeding its initial target.',
    url: '#',
    publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 6), // 6 hours ago
  },
  {
    id: '5',
    title: 'SBA Loan Volume Surges 25% in January',
    source: 'American Banker',
    category: 'market',
    summary: 'Small Business Administration loan approvals jumped 25% year-over-year in January, signaling strong demand from small businesses.',
    url: '#',
    publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 8), // 8 hours ago
  },
  {
    id: '6',
    title: 'Ares Management Launches $3B Direct Lending Vehicle',
    source: 'Private Equity News',
    category: 'deals',
    summary: 'Ares Management has launched a new $3 billion direct lending vehicle targeting middle-market companies across North America.',
    url: '#',
    publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 12), // 12 hours ago
  },
  {
    id: '7',
    title: 'European Banks Tighten Lending Standards Amid Economic Uncertainty',
    source: 'The Economist',
    category: 'regulation',
    summary: 'Major European banks are tightening lending standards as economic uncertainty persists, creating opportunities for alternative lenders.',
    url: '#',
    publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1 day ago
  },
  {
    id: '8',
    title: 'KKR Credit Expands Healthcare Lending Practice',
    source: 'PitchBook',
    category: 'company',
    summary: 'KKR Credit has hired three senior professionals to expand its healthcare-focused lending practice.',
    url: '#',
    publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 36), // 1.5 days ago
  },
];

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
      return 'bg-primary/10 text-primary';
    case 'deals':
      return 'bg-success/10 text-success';
    case 'regulation':
      return 'bg-warning/10 text-warning';
    case 'company':
      return 'bg-accent text-accent-foreground';
  }
};

interface NewsFeedWidgetProps {
  defaultOpen?: boolean;
}

export function NewsFeedWidget({ defaultOpen = true }: NewsFeedWidgetProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="pb-3 cursor-pointer hover:bg-muted/50 transition-colors">
            <CardTitle className="text-lg font-medium flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Newspaper className="h-5 w-5 text-primary" />
                News Feed
              </div>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                {isOpen ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0">
            <ScrollArea className="h-[320px]">
              <div className="space-y-3 pr-2">
                {DUMMY_NEWS.map((news) => (
                  <a
                    key={news.id}
                    href={news.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge 
                            variant="secondary" 
                            className={`text-[10px] px-1.5 py-0 ${getCategoryColor(news.category)}`}
                          >
                            <span className="mr-1">{getCategoryIcon(news.category)}</span>
                            {news.category}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">
                            {news.source}
                          </span>
                        </div>
                        <h4 className="text-sm font-medium text-foreground line-clamp-2 group-hover:text-primary transition-colors">
                          {news.title}
                        </h4>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {news.summary}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-1.5">
                          {formatDistanceToNow(news.publishedAt, { addSuffix: true })}
                        </p>
                      </div>
                      <ExternalLink className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1" />
                    </div>
                  </a>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
