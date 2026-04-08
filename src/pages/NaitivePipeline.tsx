import { Helmet } from 'react-helmet-async';
import { Navigate, useNavigate } from 'react-router-dom';
import { Loader2, Plus, FileX, Maximize2, Minimize2, ChevronDown, ChevronUp } from 'lucide-react';
import { useNaitivePipelineAccess } from '@/hooks/useNaitivePipelineAccess';
import { useNaitivePipelineData } from '@/hooks/useNaitivePipelineData';
import { useNaitivePipelineMetrics } from '@/hooks/useNaitivePipelineMetrics';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Deal, DealStatus } from '@/types/deal';
import { DealStageOption } from '@/contexts/DealStagesContext';
import { CreateDealDialog } from '@/components/deals/CreateDealDialog';
import { DealCard } from '@/components/deals/DealCard';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { useNaitiveStageMilestones, DealStageMilestone } from '@/hooks/useNaitiveStageMilestones';
import { NaitiveMilestoneDiamonds } from '@/components/naitive-pipeline/NaitiveMilestoneDiamonds';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { NaitivePipelineKPIStrip } from '@/components/naitive-pipeline/NaitivePipelineKPIStrip';
import { NaitiveFunnelChart, NaitiveTrendChart, NaitivAgingChart, NaitivHealthMixChart } from '@/components/naitive-pipeline/NaitivePipelineCharts';
import { NaitivePipelineNotifications } from '@/components/naitive-pipeline/NaitivePipelineNotifications';
import { NaitivePipelineHurdles } from '@/components/naitive-pipeline/NaitivePipelineHurdles';
import { NaitivePipelineRecommendations } from '@/components/naitive-pipeline/NaitivePipelineRecommendations';
import { NaitivePipelinePartnerInfluence } from '@/components/naitive-pipeline/NaitivePipelinePartnerInfluence';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
  useDraggable,
  useDroppable,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';

function DraggableCard({ deal, onStatusChange, isDragging, milestones, onToggleMilestone }: {
  deal: Deal; onStatusChange: (id: string, s: DealStatus) => void; isDragging?: boolean;
  milestones: DealStageMilestone[]; onToggleMilestone: (dealId: string, stage: string, key: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: deal.id, data: { deal } });
  const style = { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes} className="touch-none w-full min-w-0">
      <DealCard deal={deal} onStatusChange={onStatusChange} compact />
      {milestones.length > 0 && (
        <div className="px-3 pb-2 -mt-1">
          <NaitiveMilestoneDiamonds
            milestones={milestones}
            onToggle={(key) => onToggleMilestone(deal.id, deal.stage, key)}
          />
        </div>
      )}
    </div>
  );
}

function StageColumn({
  stage, deals, onStatusChange, onStageChange, activeDealId, isOver, fullscreen,
  getMilestonesForDeal, onToggleMilestone,
}: {
  stage: DealStageOption; deals: Deal[];
  onStatusChange: (id: string, s: DealStatus) => void;
  onStageChange?: (id: string, s: string) => void;
  activeDealId: string | null; isOver: boolean; fullscreen?: boolean;
  getMilestonesForDeal: (dealId: string, stage: string) => DealStageMilestone[];
  onToggleMilestone: (dealId: string, stage: string, key: string) => void;
}) {
  const { setNodeRef } = useDroppable({ id: stage.id });

  return (
    <div ref={setNodeRef} className={cn("flex-shrink-0 w-[300px] bg-muted/30 rounded-lg border transition-colors", isOver && "ring-2 ring-primary bg-primary/5")}>
      <div className="p-3 border-b bg-muted/50 rounded-t-lg">
        <div className="flex items-center gap-2">
          <span className={cn("h-2.5 w-2.5 rounded-full flex-shrink-0", stage.color)} />
          <h3 className="font-medium text-sm truncate">{stage.label}</h3>
          <span className="ml-auto text-xs text-muted-foreground bg-background px-1.5 py-0.5 rounded">{deals.length}</span>
        </div>
      </div>
      <ScrollArea className={cn("min-h-[400px] [&>[data-radix-scroll-area-viewport]]:!overflow-x-hidden", fullscreen ? "h-[calc(92vh-120px)]" : "h-[calc(100vh-380px)]")}>
        <div className="p-3 space-y-3 max-w-[calc(300px-2px)]">
          {deals.length === 0 ? (
            <div className={cn("text-center py-8 text-sm text-muted-foreground rounded-lg border-2 border-dashed transition-colors", isOver ? "border-primary bg-primary/5" : "border-transparent")}>
              {isOver ? "Drop here" : "No deals"}
            </div>
          ) : deals.map((deal) => (
            <DraggableCard
              key={deal.id}
              deal={deal}
              onStatusChange={onStatusChange}
              isDragging={activeDealId === deal.id}
              milestones={getMilestonesForDeal(deal.id, deal.stage)}
              onToggleMilestone={onToggleMilestone}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

export default function NaitivePipeline() {
  const { hasAccess, isLoading: accessLoading } = useNaitivePipelineAccess();
  const { pipelineId, stages, deals, isLoading: dataLoading, refetch } = useNaitivePipelineData();
  const { kpis, funnelData, agingData, healthMix, trendData, notifications, recommendations, hurdles } = useNaitivePipelineMetrics(deals, stages);
  const navigate = useNavigate();
  const dealIds = useMemo(() => deals.map(d => d.id), [deals]);
  const { getMilestonesForDeal, toggleMilestone } = useNaitiveStageMilestones(dealIds);

  const [activeDealId, setActiveDealId] = useState<string | null>(null);
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [dashboardCollapsed, setDashboardCollapsed] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const dealsByStage = useMemo(() => {
    const grouped = new Map<string, Deal[]>();
    stages.forEach(s => grouped.set(s.id, []));
    deals.forEach(d => {
      const arr = grouped.get(d.stage) || [];
      arr.push(d);
      grouped.set(d.stage, arr);
    });
    grouped.forEach((arr, id) => {
      arr.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      grouped.set(id, arr);
    });
    return grouped;
  }, [deals, stages]);

  const handleStageChange = async (dealId: string, newStage: string) => {
    try {
      const { error } = await supabase.from('deals').update({ stage: newStage, updated_at: new Date().toISOString() }).eq('id', dealId);
      if (error) throw error;
      await refetch();
    } catch {
      toast.error('Failed to update deal stage');
    }
  };

  const handleStatusChange = async (dealId: string, newStatus: DealStatus) => {
    try {
      const { error } = await supabase.from('deals').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', dealId);
      if (error) throw error;
      await refetch();
    } catch {
      toast.error('Failed to update deal status');
    }
  };

  const handleDragStart = (e: DragStartEvent) => {
    setActiveDealId(e.active.id as string);
    setActiveDeal(e.active.data.current?.deal || null);
  };
  const handleDragOver = (e: DragOverEvent) => setOverId((e.over?.id as string) || null);
  const handleDragEnd = (e: DragEndEvent) => {
    const dealId = e.active.id as string;
    const newStage = e.over?.id as string;
    setActiveDealId(null);
    setActiveDeal(null);
    setOverId(null);
    if (!newStage) return;
    const deal = deals.find(d => d.id === dealId);
    if (!deal || deal.stage === newStage) return;
    handleStageChange(dealId, newStage);
  };
  const handleDragCancel = () => { setActiveDealId(null); setActiveDeal(null); setOverId(null); };

  if (accessLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!hasAccess) {
    return <Navigate to="/deals" replace />;
  }

  const isLoading = dataLoading;

  const pipelineContent = (fullscreen: boolean) => (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd} onDragCancel={handleDragCancel}>
      <ScrollArea className="w-full">
        <div className="flex gap-4 pb-4 min-w-max">
          {stages.map(stage => (
            <StageColumn
              key={stage.id}
              stage={stage}
              deals={dealsByStage.get(stage.id) || []}
              onStatusChange={handleStatusChange}
              onStageChange={handleStageChange}
              activeDealId={activeDealId}
              isOver={overId === stage.id}
              fullscreen={fullscreen}
              getMilestonesForDeal={getMilestonesForDeal}
              onToggleMilestone={toggleMilestone}
            />
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
      <DragOverlay>
        {activeDeal ? (
          <div className="opacity-90 rotate-2 scale-105">
            <DealCard deal={activeDeal} onStatusChange={handleStatusChange} compact />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );

  return (
    <>
      <Helmet>
        <title>naitive Pipeline | nAItive</title>
      </Helmet>
      <div className="bg-background">
        <div className="container mx-auto py-8 px-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">naitive Pipeline</h1>
              <p className="text-sm text-muted-foreground mt-1">
                {deals.length} {deals.length === 1 ? 'deal' : 'deals'} in pipeline
              </p>
            </div>
            <CreateDealDialog
              trigger={
                <Button size="sm" className="gap-1.5">
                  <Plus className="h-4 w-4" />
                  Add Deal
                </Button>
              }
               initialValues={{
                 pipelineId: pipelineId || undefined,
                  dealStage: stages[0]?.id || 'prospects',
                 dealClass: 'naitive',
               }}
            />
          </div>

          {/* Dashboard Command Center */}
          {!isLoading && deals.length > 0 && (
            <div className="mb-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Pipeline Command Center</h2>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1 text-xs text-muted-foreground h-7"
                  onClick={() => setDashboardCollapsed(!dashboardCollapsed)}
                >
                  {dashboardCollapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
                  {dashboardCollapsed ? 'Show' : 'Hide'}
                </Button>
              </div>

              {!dashboardCollapsed && (
                <div className="space-y-4 animate-in fade-in-0 slide-in-from-top-2 duration-300">
                  {/* KPI Strip */}
                  <NaitivePipelineKPIStrip kpis={kpis} />

                  {/* Charts Row */}
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                    <NaitiveFunnelChart data={funnelData} />
                    <NaitiveTrendChart data={trendData} />
                    <NaitivAgingChart data={agingData} />
                    <NaitivHealthMixChart data={healthMix} />
                  </div>

                  {/* Intelligence Row */}
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                    <NaitivePipelineHurdles hurdles={hurdles} />
                    <NaitivePipelineNotifications notifications={notifications} />
                    <NaitivePipelineRecommendations recommendations={recommendations} />
                    <NaitivePipelinePartnerInfluence deals={deals} />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Pipeline Board */}
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : deals.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
                <FileX className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium">No deals yet</h3>
              <p className="mt-1 text-sm text-muted-foreground max-w-md">
                Get started by adding your first deal to the naitive pipeline.
              </p>
              <CreateDealDialog
                trigger={
                  <Button className="mt-4 gap-1.5">
                    <Plus className="h-4 w-4" />
                    Add Your First Deal
                  </Button>
                }
                 initialValues={{
                   pipelineId: pipelineId || undefined,
                   dealStage: stages[0]?.id || 'prospects',
                   dealClass: 'naitive',
                 }}
              />
            </div>
          ) : (
            <>
              <div className="flex justify-end mb-2">
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setIsFullscreen(true)}>
                  <Maximize2 className="h-3.5 w-3.5" />
                  Expand
                </Button>
              </div>
              {pipelineContent(false)}
            </>
          )}
        </div>
      </div>

      {/* Fullscreen Dialog */}
      <Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
        <DialogContent className="max-w-[98vw] w-[98vw] h-[92vh] max-h-[92vh] p-4 flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold">naitive Pipeline</h2>
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setIsFullscreen(false)}>
              <Minimize2 className="h-3.5 w-3.5" />
              Close
            </Button>
          </div>
          <div className="flex-1 overflow-hidden">
            {pipelineContent(true)}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
