import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { Briefcase, ArrowUpRight, ChevronDown, ChevronUp, Filter, Clock, AlertCircle, MessageSquare } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useDealsContext } from '@/contexts/DealsContext';
import { useProfile } from '@/hooks/useProfile';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useDashboardLayout } from '@/contexts/DashboardLayoutContext';
import { Deal, STAGE_CONFIG, STATUS_CONFIG } from '@/types/deal';
import { differenceInDays } from 'date-fns';

type StageFilter = 'all' | 'active' | 'at-risk' | 'stale';

interface MyDealsWidgetProps {
  variant?: 'compact' | 'expanded' | 'table';
  maxItems?: number;
}

export function MyDealsWidget({ variant = 'expanded', maxItems }: MyDealsWidgetProps) {
  const navigate = useNavigate();
  const { deals, isLoading } = useDealsContext();
  const { profile } = useProfile();
  const { preferences } = usePreferences();
  const { toggles } = useDashboardLayout();
  const [filter, setFilter] = useState<StageFilter>('all');
  const [isOpen, setIsOpen] = useState(true);

  const myDeals = useMemo(() => {
    const displayName = profile?.display_name || profile?.first_name || '';
    let filtered = deals.filter(d =>
      d.manager?.toLowerCase() === displayName?.toLowerCase() &&
      d.status !== 'archived'
    );

    // Apply filter
    if (filter === 'active') {
      filtered = filtered.filter(d => d.status === 'on-track');
    } else if (filter === 'at-risk') {
      filtered = filtered.filter(d => d.status === 'at-risk' || d.status === 'off-track');
    } else if (filter === 'stale') {
      const yellowThreshold = preferences?.lenderUpdateYellowDays ?? 7;
      filtered = filtered.filter(d => {
        return d.lenders?.some(l => {
          if (l.trackingStatus !== 'active' || !l.updatedAt) return false;
          return differenceInDays(new Date(), new Date(l.updatedAt)) >= yellowThreshold;
        });
      });
    }

    return filtered.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [deals, profile, filter, preferences]);

  const displayDeals = maxItems ? myDeals.slice(0, maxItems) : myDeals;

  const getStatusDot = (status: string) => {
    const config = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG];
    return config ? config.dotColor : 'bg-muted';
  };

  const getStageLabel = (stage: string) => {
    const config = STAGE_CONFIG[stage as keyof typeof STAGE_CONFIG];
    return config ? config.label : stage;
  };

  const activeLenderCount = (deal: Deal) => deal.lenders?.filter(l => l.trackingStatus === 'active').length || 0;

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </CardContent>
      </Card>
    );
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="pb-2 cursor-pointer hover:bg-muted/50 transition-colors">
            <CardTitle className="text-base font-medium flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-primary" />
                My Deals
                <Badge variant="secondary" className="text-xs">{myDeals.length}</Badge>
              </div>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-3">
            {/* Filters */}
            <ToggleGroup type="single" value={filter} onValueChange={(v) => v && setFilter(v as StageFilter)} className="justify-start">
              <ToggleGroupItem value="all" className="text-xs h-7 px-2.5">All</ToggleGroupItem>
              <ToggleGroupItem value="active" className="text-xs h-7 px-2.5">On Track</ToggleGroupItem>
              <ToggleGroupItem value="at-risk" className="text-xs h-7 px-2.5 gap-1">
                <AlertCircle className="h-3 w-3" />At Risk
              </ToggleGroupItem>
              <ToggleGroupItem value="stale" className="text-xs h-7 px-2.5 gap-1">
                <Clock className="h-3 w-3" />Stale
              </ToggleGroupItem>
            </ToggleGroup>

            <ScrollArea className={variant === 'table' ? 'max-h-[500px]' : 'max-h-[400px]'}>
              <div className="space-y-1">
                {displayDeals.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No deals match this filter.</p>
                ) : displayDeals.map(deal => (
                  <button
                    key={deal.id}
                    onClick={() => navigate(`/deal/${deal.id}`)}
                    className="w-full flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors text-left group"
                  >
                    {/* Status dot */}
                    <div className={`mt-1.5 h-2.5 w-2.5 rounded-full shrink-0 ${getStatusDot(deal.status)}`} />

                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground truncate">{deal.company}</span>
                        <Badge variant="outline" className="text-[10px] shrink-0">{getStageLabel(deal.stage)}</Badge>
                      </div>

                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{activeLenderCount(deal)} active lender{activeLenderCount(deal) !== 1 ? 's' : ''}</span>
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDistanceToNow(new Date(deal.updatedAt), { addSuffix: true })}
                        </span>
                      </div>

                      {/* Status note preview */}
                      {toggles.showStatusNotes && deal.notes && (
                        <div className="flex items-start gap-1.5 mt-1">
                          <MessageSquare className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
                          <p className="text-xs text-muted-foreground line-clamp-1">{deal.notes}</p>
                        </div>
                      )}

                      {/* Next milestone */}
                      {deal.milestones?.filter(m => !m.completed && m.dueDate).sort((a, b) => 
                        new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime()
                      ).slice(0, 1).map(m => (
                        <div key={m.id} className="flex items-center gap-1.5 text-xs text-primary mt-0.5">
                          <span className="font-medium">Next:</span>
                          <span className="truncate">{m.title}</span>
                          {m.dueDate && <span className="text-muted-foreground shrink-0">· {new Date(m.dueDate).toLocaleDateString()}</span>}
                        </div>
                      ))}
                    </div>

                    <ArrowUpRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </button>
                ))}
              </div>
            </ScrollArea>

            {maxItems && myDeals.length > maxItems && (
              <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={() => navigate('/deals')}>
                View all {myDeals.length} deals
                <ArrowUpRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
