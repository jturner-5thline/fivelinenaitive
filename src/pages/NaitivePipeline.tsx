import { Helmet } from 'react-helmet-async';
import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useNaitivePipelineAccess } from '@/hooks/useNaitivePipelineAccess';
import { useDealsContext } from '@/contexts/DealsContext';
import { DealsPipelineView } from '@/components/deals/DealsPipelineView';
import { DealStatus } from '@/types/deal';
import { useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';

export default function NaitivePipeline() {
  const { hasAccess, isLoading } = useNaitivePipelineAccess();
  const { deals, isLoading: dealsLoading, updateDealStatus, updateDeal } = useDealsContext();
  const { toast } = useToast();

  const handleStatusChange = useCallback(async (dealId: string, newStatus: DealStatus) => {
    await updateDealStatus(dealId, newStatus);
  }, [updateDealStatus]);

  const handleStageChange = useCallback(async (dealId: string, newStage: string) => {
    try {
      await updateDeal(dealId, { stage: newStage });
      toast({ title: "Deal stage updated", description: "The deal has been moved to a new stage." });
    } catch {
      toast({ title: "Failed to update deal stage", description: "Please try again.", variant: "destructive" });
    }
  }, [updateDeal, toast]);

  const handleMarkReviewed = useCallback(async (dealId: string) => {
    try {
      await updateDeal(dealId, { updatedAt: new Date().toISOString() });
      toast({ title: "Deal marked as reviewed" });
    } catch {
      toast({ title: "Failed to update deal", variant: "destructive" });
    }
  }, [updateDeal, toast]);

  const handleToggleFlag = useCallback(async (dealId: string, isFlagged: boolean, flagNotes?: string) => {
    await updateDeal(dealId, { isFlagged, flagNotes: flagNotes ?? '' });
  }, [updateDeal]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!hasAccess) {
    return <Navigate to="/deals" replace />;
  }

  // Filter to only active deals for the pipeline view
  const pipelineDeals = deals.filter(d => d.status !== 'archived');

  return (
    <>
      <Helmet>
        <title>naitive Pipeline | nAItive</title>
      </Helmet>
      <div className="bg-background">
        <div className="w-full px-4 py-6 sm:px-6">
          <h1 className="text-2xl font-bold tracking-tight mb-4">naitive Pipeline</h1>
          {dealsLoading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <DealsPipelineView
              deals={pipelineDeals}
              onStatusChange={handleStatusChange}
              onStageChange={handleStageChange}
              onMarkReviewed={handleMarkReviewed}
              onToggleFlag={handleToggleFlag}
            />
          )}
        </div>
      </div>
    </>
  );
}
