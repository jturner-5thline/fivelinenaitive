import { useMemo } from 'react';
import { Deal, DealStatus } from '@/types/deal';
import { DealCard } from './DealCard';
import { useDealStages } from '@/contexts/DealStagesContext';
import { useFlexEngagementScores } from '@/hooks/useFlexEngagementScores';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { FileX } from 'lucide-react';

interface DealsPipelineViewProps {
  deals: Deal[];
  onStatusChange: (dealId: string, newStatus: DealStatus) => void;
  onMarkReviewed?: (dealId: string) => void;
  onToggleFlag?: (dealId: string, isFlagged: boolean, flagNotes?: string) => Promise<void>;
}

export function DealsPipelineView({ deals, onStatusChange, onMarkReviewed, onToggleFlag }: DealsPipelineViewProps) {
  const { stages } = useDealStages();
  const dealIds = useMemo(() => deals.map(d => d.id), [deals]);
  const { data: flexEngagementScores } = useFlexEngagementScores(dealIds);

  // Group deals by stage
  const dealsByStage = useMemo(() => {
    const grouped = new Map<string, Deal[]>();
    
    // Initialize all stages with empty arrays
    stages.forEach(stage => {
      grouped.set(stage.id, []);
    });
    
    // Add deals to their respective stages
    deals.forEach(deal => {
      const stageDeals = grouped.get(deal.stage) || [];
      stageDeals.push(deal);
      grouped.set(deal.stage, stageDeals);
    });
    
    return grouped;
  }, [deals, stages]);

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

  return (
    <ScrollArea className="w-full">
      <div className="flex gap-4 pb-4 min-w-max">
        {stages.map((stage) => {
          const stageDeals = dealsByStage.get(stage.id) || [];
          
          return (
            <div 
              key={stage.id} 
              className="flex-shrink-0 w-[300px] bg-muted/30 rounded-lg border"
            >
              {/* Stage Header */}
              <div className="p-3 border-b bg-muted/50 rounded-t-lg">
                <div className="flex items-center gap-2">
                  <span 
                    className={cn(
                      "h-2.5 w-2.5 rounded-full flex-shrink-0",
                      stage.color
                    )} 
                  />
                  <h3 className="font-medium text-sm truncate">{stage.label}</h3>
                  <span className="ml-auto text-xs text-muted-foreground bg-background px-1.5 py-0.5 rounded">
                    {stageDeals.length}
                  </span>
                </div>
              </div>
              
              {/* Stage Deals */}
              <ScrollArea className="h-[calc(100vh-380px)] min-h-[400px]">
                <div className="p-2 space-y-2">
                  {stageDeals.length === 0 ? (
                    <div className="text-center py-8 text-sm text-muted-foreground">
                      No deals
                    </div>
                  ) : (
                    stageDeals.map((deal) => (
                      <DealCard
                        key={deal.id}
                        deal={deal}
                        onStatusChange={onStatusChange}
                        onMarkReviewed={onMarkReviewed}
                        onToggleFlag={onToggleFlag}
                        flexEngagement={flexEngagementScores?.get(deal.id)}
                        compact
                      />
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>
          );
        })}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}
