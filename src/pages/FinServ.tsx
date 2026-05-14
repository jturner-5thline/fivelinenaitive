import { Helmet } from 'react-helmet-async';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, Plus, FileX, Maximize2, Minimize2 } from 'lucide-react';
import { useNaitivePipelineAccess } from '@/hooks/useNaitivePipelineAccess';
import { useFinServPipelineData } from '@/hooks/useFinServPipelineData';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Deal, DealStatus } from '@/types/deal';
import { DealStageOption } from '@/contexts/DealStagesContext';
import { FinServCreateDealDialog, FINSERV_OWNERS } from '@/components/finserv/FinServCreateDealDialog';
import { DealCard } from '@/components/deals/DealCard';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { FinServDashboard } from '@/components/finserv/FinServDashboard';
import { NaitiveDealOverlay } from '@/components/naitive-pipeline/NaitiveDealOverlay';
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
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { DashboardPage } from '@/components/layout/DashboardPage';

function DraggableCard({ deal, onStatusChange, isDragging }: {
  deal: Deal; onStatusChange: (id: string, s: DealStatus) => void; isDragging?: boolean;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: deal.id, data: { deal } });
  // Source stays put; DragOverlay handles the moving copy. Hiding (vs.
  // half-opacity + transform) avoids the lagging "ghost" double card.
  const style: React.CSSProperties = isDragging ? { opacity: 0, pointerEvents: 'none' } : {};

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn(
        'touch-none w-full min-w-0 relative',
        deal.onHold && 'opacity-60',
      )}
    >
      {deal.onHold && (
        <Badge
          variant="amber"
          className="absolute top-2 right-2 z-10 text-[10px] px-1.5 py-0.5 pointer-events-none"
        >
          On Hold
        </Badge>
      )}
      <DealCard deal={deal} onStatusChange={onStatusChange} compact hideStatus />
    </div>
  );
}

function StageColumn({
  stage, deals, onStatusChange, activeDealId, isOver, fullscreen,
}: {
  stage: DealStageOption; deals: Deal[];
  onStatusChange: (id: string, s: DealStatus) => void;
  activeDealId: string | null; isOver: boolean; fullscreen?: boolean;
}) {
  const { setNodeRef } = useDroppable({ id: stage.id });

  return (
    <div ref={setNodeRef} className={cn("flex-shrink-0 w-[300px] bg-muted/30 rounded-lg border transition-colors", isOver && "ring-2 ring-primary bg-primary/5")}>
      <div className="p-3 border-b bg-muted/50 rounded-lg">
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
          ) : deals.map(deal => (
            <DraggableCard
              key={deal.id}
              deal={deal}
              onStatusChange={onStatusChange}
              isDragging={activeDealId === deal.id}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

export default function FinServ() {
  const { hasAccess, isLoading: accessLoading } = useNaitivePipelineAccess();
  const { pipelineId, stages, deals, isLoading: dataLoading, refetch } = useFinServPipelineData();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [activeTab, setActiveTab] = useState<'dashboard' | 'pipeline'>('dashboard');
  const [activeDealId, setActiveDealId] = useState<string | null>(null);
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [ownerFilter, setOwnerFilter] = useState<string>('all');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const dealsByStage = useMemo(() => {
    const grouped = new Map<string, Deal[]>();
    stages.forEach(s => grouped.set(s.id, []));
    const filtered = ownerFilter === 'all'
      ? deals
      : deals.filter(d => (d.dealOwner || '') === ownerFilter);
    filtered.forEach(d => {
      const arr = grouped.get(d.stage) || [];
      arr.push(d);
      grouped.set(d.stage, arr);
    });
    grouped.forEach((arr) => {
      arr.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    });
    return grouped;
  }, [deals, stages, ownerFilter]);

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
  const handleDragOver = (e: DragOverEvent) => {
    const next = (e.over?.id as string) || null;
    setOverId((prev) => (prev === next ? prev : next));
  };
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
              activeDealId={activeDealId}
              isOver={overId === stage.id}
              fullscreen={fullscreen}
            />
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
      <DragOverlay>
        {activeDeal ? (
          <div className="opacity-90 rotate-2 scale-105">
            <DealCard deal={activeDeal} onStatusChange={handleStatusChange} compact hideStatus />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );

  return (
    <>
      <Helmet>
        <title>FinServ | naitive</title>
      </Helmet>
      {/* Transparent canvas — lets the shared diagonal gradient backdrop
          rendered by <AppLayout> show through, matching the /deals page. */}
      <div className="bg-transparent">
        <DashboardPage
          padding="sm"
          wrapper={(children) => (
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
              {children}
            </Tabs>
          )}
          header={
            <>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight">FinServ</h1>
                  <p className="text-sm text-muted-foreground mt-1">
                    {deals.length} {deals.length === 1 ? 'deal' : 'deals'} in pipeline
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                    <SelectTrigger className="h-9 w-[180px]">
                      <SelectValue placeholder="All owners" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Owners</SelectItem>
                      {FINSERV_OWNERS.map(o => (
                        <SelectItem key={o} value={o}>{o}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FinServCreateDealDialog
                    pipelineId={pipelineId}
                    onCreated={refetch}
                    trigger={
                      <Button size="sm" className="gap-1.5">
                        <Plus className="h-4 w-4" />
                        Add Deal
                      </Button>
                    }
                  />
                </div>
              </div>
              <TabsList>
                <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
                <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
              </TabsList>
            </>
          }
        >
            <TabsContent value="dashboard">
              {isLoading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <FinServDashboard deals={deals} stages={stages} />
              )}
            </TabsContent>

            <TabsContent value="pipeline">
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
                    Get started by adding your first deal to the FinServ pipeline.
                  </p>
                  <FinServCreateDealDialog
                    pipelineId={pipelineId}
                    onCreated={refetch}
                    trigger={
                      <Button className="mt-4 gap-1.5">
                        <Plus className="h-4 w-4" />
                        Add Your First Deal
                      </Button>
                    }
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
            </TabsContent>
        </DashboardPage>
      </div>

      {/* Fullscreen Dialog */}
      <Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
        <DialogContent className="max-w-[98vw] w-[98vw] h-[92vh] max-h-[92vh] p-4 flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold">FinServ Pipeline</h2>
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

      {/* Animated deal pop-up overlay — same component used by /deals so the
          open animation, keyboard nav, and perceived performance match.
          Opens immediately on click via the ?deal=<id> query param the
          DealCard sets; data hydrates inside the overlay's lazy DealDetail
          while the shell is already painted. */}
      <NaitiveDealOverlay
        deal={(() => {
          const id = searchParams.get('deal');
          if (!id) return null;
          const found = deals.find((d) => d.id === id);
          if (found) return found;
          // Deep-link fallback: render the overlay shell immediately even
          // before the FinServ deals list has loaded the matching record.
          return { id, company: 'Deal' } as unknown as Deal;
        })()}
        orderedDeals={deals}
        stages={stages}
        onClose={() => {
          const next = new URLSearchParams(searchParams);
          next.delete('deal');
          setSearchParams(next, { replace: false });
        }}
        onNavigate={(d) => {
          const next = new URLSearchParams(searchParams);
          next.set('deal', d.id);
          setSearchParams(next, { replace: true });
        }}
        onStageChange={handleStageChange}
      />
    </>
  );
}
