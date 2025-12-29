import { useMemo } from 'react';
import { formatDistanceToNow, differenceInDays } from 'date-fns';
import { AlertTriangle, Clock, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Deal } from '@/types/deal';
import { Link } from 'react-router-dom';
import { usePreferences } from '@/contexts/PreferencesContext';

interface StaleDealsWidgetProps {
  deals: Deal[];
}

export function StaleDealsWidget({ deals }: StaleDealsWidgetProps) {
  const { preferences } = usePreferences();
  const staleDays = preferences.staleDealsDays;

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

  if (staleDeals.length === 0) {
    return (
      <Card className="border-success/30 bg-success/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Clock className="h-4 w-4 text-success" />
            Stale Deals Alert
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-success text-center py-4">
            All deals are up to date!
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-warning/30 bg-warning/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-warning" />
          Stale Deals Alert
          <Badge variant="outline" className="ml-auto text-[10px] bg-warning/10 text-warning border-warning/30">
            {staleDeals.length} {staleDeals.length === 1 ? 'deal' : 'deals'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
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
      </CardContent>
    </Card>
  );
}