import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow, differenceInDays } from 'date-fns';
import { AlertCircle, Bell, Clock, FileText, Users, X, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useDealsContext } from '@/contexts/DealsContext';
import { useProfile } from '@/hooks/useProfile';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useDashboardLayout } from '@/contexts/DashboardLayoutContext';
import { cn } from '@/lib/utils';

interface Alert {
  id: string;
  type: 'stale_lender' | 'missing_followup' | 'at_risk' | 'milestone_overdue';
  title: string;
  description: string;
  dealId: string;
  dealName: string;
  priority: 'high' | 'medium' | 'low';
  timestamp: Date;
}

export function KeyAlertsWidget() {
  const navigate = useNavigate();
  const { deals } = useDealsContext();
  const { profile } = useProfile();
  const { preferences } = usePreferences();
  const { toggles } = useDashboardLayout();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [isOpen, setIsOpen] = useState(true);

  const alerts = useMemo(() => {
    const displayName = profile?.display_name || profile?.first_name || '';
    const myDeals = deals.filter(d => d.manager?.toLowerCase() === displayName?.toLowerCase() && d.status !== 'archived');
    const yellowThreshold = preferences?.lenderUpdateYellowDays ?? 7;
    const result: Alert[] = [];

    myDeals.forEach(deal => {
      // Stale lender alerts
      deal.lenders?.forEach(lender => {
        if (lender.trackingStatus === 'active' && lender.updatedAt) {
          const daysSince = differenceInDays(new Date(), new Date(lender.updatedAt));
          if (daysSince >= yellowThreshold) {
            result.push({
              id: `stale-${deal.id}-${lender.id}`,
              type: 'stale_lender',
              title: `${lender.name} needs an update`,
              description: `No update in ${daysSince} days on ${deal.company}`,
              dealId: deal.id,
              dealName: deal.company,
              priority: daysSince >= yellowThreshold * 2 ? 'high' : 'medium',
              timestamp: new Date(lender.updatedAt),
            });
          }
        }
      });

      // At-risk deals
      if (deal.status === 'at-risk' || deal.status === 'off-track') {
        result.push({
          id: `risk-${deal.id}`,
          type: 'at_risk',
          title: `${deal.company} is ${deal.status === 'at-risk' ? 'at risk' : 'off track'}`,
          description: `Deal status requires attention`,
          dealId: deal.id,
          dealName: deal.company,
          priority: deal.status === 'off-track' ? 'high' : 'medium',
          timestamp: new Date(deal.updatedAt),
        });
      }

      // Overdue milestones
      deal.milestones?.forEach(m => {
        if (!m.completed && m.dueDate && new Date(m.dueDate) < new Date()) {
          result.push({
            id: `milestone-${m.id}`,
            type: 'milestone_overdue',
            title: `"${m.title}" is overdue`,
            description: `Due ${formatDistanceToNow(new Date(m.dueDate), { addSuffix: true })} · ${deal.company}`,
            dealId: deal.id,
            dealName: deal.company,
            priority: differenceInDays(new Date(), new Date(m.dueDate)) > 7 ? 'high' : 'medium',
            timestamp: new Date(m.dueDate),
          });
        }
      });
    });

    // Sort by priority then timestamp
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    let filtered = result
      .filter(a => !dismissed.has(a.id))
      .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority] || b.timestamp.getTime() - a.timestamp.getTime());

    if (toggles.onlyUrgentAlerts) {
      filtered = filtered.filter(a => a.priority === 'high');
    }

    return filtered;
  }, [deals, profile, preferences, dismissed, toggles.onlyUrgentAlerts]);

  const PRIORITY_STYLES = {
    high: 'border-l-2 border-destructive',
    medium: 'border-l-2 border-amber-500',
    low: '',
  };

  const TYPE_ICONS = {
    stale_lender: Clock,
    missing_followup: FileText,
    at_risk: AlertCircle,
    milestone_overdue: AlertCircle,
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="pb-2 cursor-pointer hover:bg-muted/50 transition-colors">
            <CardTitle className="text-base font-medium flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-primary" />
                Key Alerts
                {alerts.length > 0 && <Badge variant="destructive" className="text-[10px] h-5">{alerts.length}</Badge>}
              </div>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0">
            <ScrollArea className="max-h-[300px]">
              {alerts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No alerts — everything looks good.</p>
              ) : (
                <div className="space-y-1">
                  {alerts.map(alert => {
                    const Icon = TYPE_ICONS[alert.type];
                    return (
                      <div
                        key={alert.id}
                        className={cn('flex items-start gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors group', PRIORITY_STYLES[alert.priority])}
                      >
                        <Icon className={cn('h-4 w-4 mt-0.5 shrink-0', alert.priority === 'high' ? 'text-destructive' : 'text-amber-500')} />
                        <button onClick={() => navigate(`/deal/${alert.dealId}`)} className="flex-1 min-w-0 text-left">
                          <p className="text-sm text-foreground">{alert.title}</p>
                          <p className="text-xs text-muted-foreground">{alert.description}</p>
                        </button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                          onClick={() => setDismissed(prev => new Set(prev).add(alert.id))}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
