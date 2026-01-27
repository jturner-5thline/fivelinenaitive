import { useMemo, useState, useEffect } from 'react';
import { formatDistanceToNow, differenceInDays } from 'date-fns';
import { AlertTriangle, Clock, ArrowRight, ChevronDown, Users, Building2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Deal } from '@/types/deal';
import { Link } from 'react-router-dom';
import { usePreferences } from '@/contexts/PreferencesContext';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

interface AlertsWidgetProps {
  deals: Deal[];
}

interface AlertItem {
  id: string;
  type: 'stale-deal' | 'stale-lender';
  dealId: string;
  company: string;
  description: string;
  daysSinceUpdate: number;
  severity: 'warning' | 'destructive';
  lenderCount?: number;
}

const STORAGE_KEY = 'alerts-widget-expanded';

export function AlertsWidget({ deals }: AlertsWidgetProps) {
  const { preferences } = usePreferences();
  const staleDealDays = preferences.staleDealsDays;
  const staleLenderDays = preferences.lenderUpdateYellowDays;
  
  const [isExpanded, setIsExpanded] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored !== null ? stored === 'true' : true;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(isExpanded));
  }, [isExpanded]);

  const alerts = useMemo(() => {
    const now = new Date();
    const alertItems: AlertItem[] = [];

    deals.forEach((deal) => {
      if (deal.status === 'archived') return;

      // Check for stale deal
      const dealUpdatedAt = new Date(deal.updatedAt);
      const dealDaysSinceUpdate = differenceInDays(now, dealUpdatedAt);
      
      if (dealDaysSinceUpdate >= staleDealDays) {
        alertItems.push({
          id: `deal-${deal.id}`,
          type: 'stale-deal',
          dealId: deal.id,
          company: deal.company,
          description: `Deal not updated in ${dealDaysSinceUpdate} days`,
          daysSinceUpdate: dealDaysSinceUpdate,
          severity: dealDaysSinceUpdate >= 30 ? 'destructive' : 'warning',
        });
      }

      // Check for stale lenders
      let maxLenderDays = 0;
      let staleLenderCount = 0;
      
      deal.lenders?.forEach(lender => {
        if (lender.trackingStatus === 'active' && lender.updatedAt) {
          const lenderDaysSinceUpdate = differenceInDays(now, new Date(lender.updatedAt));
          if (lenderDaysSinceUpdate >= staleLenderDays) {
            staleLenderCount++;
            maxLenderDays = Math.max(maxLenderDays, lenderDaysSinceUpdate);
          }
        }
      });

      if (staleLenderCount > 0) {
        alertItems.push({
          id: `lender-${deal.id}`,
          type: 'stale-lender',
          dealId: deal.id,
          company: deal.company,
          description: `${staleLenderCount} lender${staleLenderCount !== 1 ? 's' : ''} need update`,
          daysSinceUpdate: maxLenderDays,
          severity: maxLenderDays >= 30 ? 'destructive' : 'warning',
          lenderCount: staleLenderCount,
        });
      }
    });

    // Sort by days since update (most stale first)
    return alertItems
      .sort((a, b) => b.daysSinceUpdate - a.daysSinceUpdate)
      .slice(0, 8);
  }, [deals, staleDealDays, staleLenderDays]);

  const isEmpty = alerts.length === 0;
  const cardClass = isEmpty ? 'border-success/30 bg-success/5' : 'border-warning/30 bg-warning/5';
  const hasDestructive = alerts.some(a => a.severity === 'destructive');

  return (
    <Card className={cn(cardClass, hasDestructive && 'border-destructive/30 bg-destructive/5')}>
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CardHeader className={cn("pb-2", !isExpanded && "pb-4")}>
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 w-full text-left hover:opacity-80 transition-opacity">
              <CardTitle className="text-sm font-medium flex items-center gap-2 flex-1">
                {isEmpty ? (
                  <Clock className="h-4 w-4 text-success" />
                ) : (
                  <AlertTriangle className={cn("h-4 w-4", hasDestructive ? "text-destructive" : "text-warning")} />
                )}
                Alerts
                {!isEmpty && (
                  <Badge 
                    variant="outline" 
                    className={cn(
                      "ml-auto text-[10px]",
                      hasDestructive 
                        ? "bg-destructive/10 text-destructive border-destructive/30"
                        : "bg-warning/10 text-warning border-warning/30"
                    )}
                  >
                    {alerts.length}
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
                All deals and lenders are up to date!
              </p>
            ) : (
              <ScrollArea className="h-[160px] px-4 pb-4">
                <div className="space-y-2">
                  {alerts.map((alert) => (
                    <Link
                      key={alert.id}
                      to={`/deals/${alert.dealId}`}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-background/50 transition-colors group"
                    >
                      <div className={cn(
                        "flex-shrink-0 h-2 w-2 rounded-full",
                        alert.severity === 'destructive' ? 'bg-destructive' : 'bg-warning'
                      )} />
                      <div className="flex-shrink-0">
                        {alert.type === 'stale-deal' ? (
                          <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : (
                          <Users className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">
                          {alert.company}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {alert.description}
                        </p>
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                    </Link>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
