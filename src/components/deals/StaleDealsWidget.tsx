import { useMemo, useState, useEffect } from 'react';
import { formatDistanceToNow, differenceInDays } from 'date-fns';
import { AlertTriangle, Clock, ArrowRight, ChevronDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Deal } from '@/types/deal';
import { Link } from 'react-router-dom';
import { usePreferences } from '@/contexts/PreferencesContext';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

interface StaleDealsWidgetProps {
  deals: Deal[];
}

const STORAGE_KEY = 'stale-deals-widget-expanded';

export function StaleDealsWidget({ deals }: StaleDealsWidgetProps) {
  const { preferences } = usePreferences();
  const staleDays = preferences.staleDealsDays;
  const [isExpanded, setIsExpanded] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored !== null ? stored === 'true' : true;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(isExpanded));
  }, [isExpanded]);

  const staleDeals = useMemo(() => {
    const now = new Date();
    return deals
      .filter((deal) => {
        if (deal.status === 'archived') return false;
        const updatedAt = new Date(deal.updatedAt);
        const daysSinceUpdate = differenceInDays(now, updatedAt);
        return daysSinceUpdate >= staleDays;
      })
      .sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime())
      .slice(0, 6);
  }, [deals, staleDays]);

  const getSeverity = (updatedAt: string): 'warning' | 'destructive' => {
    const daysSince = differenceInDays(new Date(), new Date(updatedAt));
    return daysSince >= 30 ? 'destructive' : 'warning';
  };

  const isEmpty = staleDeals.length === 0;
  const cardClass = isEmpty ? 'border-success/30 bg-success/5' : 'border-warning/30 bg-warning/5';

  return (
    <Card className={cardClass}>
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CardHeader className={cn("pb-2", !isExpanded && "pb-4")}>
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 w-full text-left hover:opacity-80 transition-opacity">
              <CardTitle className="text-sm font-medium flex items-center gap-2 flex-1">
                {isEmpty ? (
                  <Clock className="h-4 w-4 text-success" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-warning" />
                )}
                Stale Deals Alert
                {!isEmpty && (
                  <Badge variant="outline" className="ml-auto text-[10px] bg-warning/10 text-warning border-warning/30">
                    {staleDeals.length} {staleDeals.length === 1 ? 'deal' : 'deals'}
                  </Badge>
                )}
              </CardTitle>
              <ChevronDown className={cn("h-4 w-4 transition-transform text-muted-foreground", isExpanded && "rotate-180")} />
            </button>
          </CollapsibleTrigger>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="p-0">
            {isEmpty ? (
              <p className="text-sm text-success text-center py-4 px-4">
                All deals are up to date!
              </p>
            ) : (
              <ScrollArea className="h-[160px] px-4 pb-4">
                <div className="space-y-2">
                  {staleDeals.map((deal) => {
                    const severity = getSeverity(deal.updatedAt);
                    return (
                      <Link
                        key={deal.id}
                        to={`/deals/${deal.id}`}
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-background/50 transition-colors group"
                      >
                        <div className={`flex-shrink-0 h-2 w-2 rounded-full ${severity === 'destructive' ? 'bg-destructive' : 'bg-warning'}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">
                            {deal.company}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            Last updated {formatDistanceToNow(new Date(deal.updatedAt), { addSuffix: true })}
                          </p>
                        </div>
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                      </Link>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}