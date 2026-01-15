import { useState, useMemo } from 'react';
import { Deal, DealStatus, STATUS_CONFIG } from '@/types/deal';
import { DealCard } from './DealCard';
import { FileX, ChevronDown, ChevronRight } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { HintTooltip } from '@/components/ui/hint-tooltip';
import { useFirstTimeHints } from '@/hooks/useFirstTimeHints';
import { useFlexEngagementScores } from '@/hooks/useFlexEngagementScores';

interface DealsListProps {
  deals: Deal[];
  onStatusChange: (dealId: string, newStatus: DealStatus) => void;
  onMarkReviewed?: (dealId: string) => void;
  onToggleFlag?: (dealId: string, isFlagged: boolean) => void;
  groupByStatus?: boolean;
}

const STATUS_ORDER: DealStatus[] = ['on-track', 'at-risk', 'off-track', 'on-hold', 'archived'];

export function DealsList({ deals, onStatusChange, onMarkReviewed, onToggleFlag, groupByStatus = true }: DealsListProps) {
  const { isHintVisible, dismissHint } = useFirstTimeHints();
  const [collapsedGroups, setCollapsedGroups] = useState<Set<DealStatus>>(new Set());
  
  // Fetch FLEx engagement scores for all visible deals
  const dealIds = useMemo(() => deals.map(d => d.id), [deals]);
  const { data: flexEngagementScores } = useFlexEngagementScores(dealIds);

  const toggleGroup = (status: DealStatus) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  };

  if (deals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
          <FileX className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium bg-brand-gradient bg-clip-text text-transparent dark:bg-gradient-to-b dark:from-white dark:to-[hsl(292,46%,72%)]">No deals found</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Try adjusting your filters or create a new deal to get started.
        </p>
      </div>
    );
  }

  // If not grouping, show flat grid
  if (!groupByStatus) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {deals.map((deal, index) => (
          index === 0 ? (
            <HintTooltip
              key={deal.id}
              hint="Click any deal card to view details, manage lenders, and track progress."
              visible={isHintVisible('deal-card')}
              onDismiss={() => dismissHint('deal-card')}
              side="right"
              align="start"
              showDelay={3500}
            >
              <div>
                <DealCard 
                  deal={deal} 
                  onStatusChange={onStatusChange} 
                  onMarkReviewed={onMarkReviewed} 
                  onToggleFlag={onToggleFlag} 
                  flexEngagement={flexEngagementScores?.get(deal.id)}
                />
              </div>
            </HintTooltip>
          ) : (
            <DealCard 
              key={deal.id} 
              deal={deal} 
              onStatusChange={onStatusChange} 
              onMarkReviewed={onMarkReviewed} 
              onToggleFlag={onToggleFlag} 
              flexEngagement={flexEngagementScores?.get(deal.id)}
            />
          )
        ))}
      </div>
    );
  }

  // Group deals by status
  const groupedDeals = STATUS_ORDER.reduce((acc, status) => {
    const dealsForStatus = deals.filter((deal) => deal.status === status);
    if (dealsForStatus.length > 0) {
      acc.push({ status, deals: dealsForStatus });
    }
    return acc;
  }, [] as { status: DealStatus; deals: Deal[] }[]);

  return (
    <div className="space-y-6">
      {groupedDeals.map(({ status, deals: statusDeals }) => {
        const isCollapsed = collapsedGroups.has(status);
        
        return (
          <Collapsible
            key={status}
            open={!isCollapsed}
            onOpenChange={() => toggleGroup(status)}
          >
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className="w-full justify-start gap-2 px-2 py-2 h-auto hover:bg-muted/50"
              >
                {isCollapsed ? (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
                <span className={`h-2.5 w-2.5 rounded-full ${STATUS_CONFIG[status].dotColor}`} />
                <h2 className="text-lg font-semibold bg-brand-gradient bg-clip-text text-transparent dark:bg-gradient-to-b dark:from-white dark:to-[hsl(292,46%,72%)]">
                  {STATUS_CONFIG[status].label}
                </h2>
                <span className="text-sm text-muted-foreground">({statusDeals.length})</span>
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {statusDeals.map((deal, index) => {
                  // Show hint only on the very first deal card across all groups
                  const isFirstDealOverall = groupedDeals[0].status === status && index === 0;
                  
                  if (isFirstDealOverall) {
                    return (
                      <HintTooltip
                        key={deal.id}
                        hint="Click any deal card to view details, manage lenders, and track progress."
                        visible={isHintVisible('deal-card')}
                        onDismiss={() => dismissHint('deal-card')}
                        side="right"
                        align="start"
                        showDelay={3500}
                      >
                        <div>
                          <DealCard 
                            deal={deal} 
                            onStatusChange={onStatusChange} 
                            onMarkReviewed={onMarkReviewed} 
                            onToggleFlag={onToggleFlag} 
                            flexEngagement={flexEngagementScores?.get(deal.id)}
                          />
                        </div>
                      </HintTooltip>
                    );
                  }
                  
                  return (
                    <DealCard 
                      key={deal.id} 
                      deal={deal} 
                      onStatusChange={onStatusChange} 
                      onMarkReviewed={onMarkReviewed} 
                      onToggleFlag={onToggleFlag} 
                      flexEngagement={flexEngagementScores?.get(deal.id)}
                    />
                  );
                })}
              </div>
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
}
