import { Helmet } from 'react-helmet-async';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, Plus, FileX, Maximize2, Minimize2, ChevronLeft, ChevronRight, Search, X, GripVertical, Diamond, Mail, Send, History } from 'lucide-react';
import { useNaitivePipelineAccess } from '@/hooks/useNaitivePipelineAccess';
import { useNaitivePipelineData } from '@/hooks/useNaitivePipelineData';
import { useNaitivePipelineMetrics } from '@/hooks/useNaitivePipelineMetrics';
import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Deal, DealStatus } from '@/types/deal';
import { DealStageOption } from '@/contexts/DealStagesContext';
import { CreateNaitiveDealDialog } from '@/components/naitive-pipeline/CreateNaitiveDealDialog';
import { NaitiveDealCard } from '@/components/naitive-pipeline/NaitiveDealCard';
import { NaitiveDealOverlay } from '@/components/naitive-pipeline/NaitiveDealOverlay';

import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Info } from 'lucide-react';
import { getStageDescription } from '@/config/naitivePipelineConfig';
import { resolveSystemStageType } from '@/config/naitivePipelineConfig';
import { NaitiveStageTransitionDialog, type PendingTransition } from '@/components/naitive-pipeline/NaitiveStageTransitionDialog';
import { useNaitiveStageMilestones, DealStageMilestone } from '@/hooks/useNaitiveStageMilestones';
import { NaitiveMilestoneDiamonds } from '@/components/naitive-pipeline/NaitiveMilestoneDiamonds';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { NaitiveWeeklyExecutionPulse } from '@/components/naitive-pipeline/NaitiveWeeklyExecutionPulse';
import { useNaitiveStageHistory } from '@/hooks/useNaitiveStageHistory';
import { NaitivePipelineNotifications } from '@/components/naitive-pipeline/NaitivePipelineNotifications';
import { NaitivePipelineHurdles } from '@/components/naitive-pipeline/NaitivePipelineHurdles';
import { NaitivePipelineRecommendations } from '@/components/naitive-pipeline/NaitivePipelineRecommendations';
import { NaitivePipelinePartnerInfluence } from '@/components/naitive-pipeline/NaitivePipelinePartnerInfluence';
import { NaitiveICPLeaderboard } from '@/components/naitive-pipeline/NaitiveICPLeaderboard';
import { NaitiveQualToDemoInsights } from '@/components/naitive-pipeline/NaitiveQualToDemoInsights';
import { NaitiveDidNotMoveInsights } from '@/components/naitive-pipeline/NaitiveDidNotMoveInsights';
import { NaitivePipelineNarrative } from '@/components/naitive-pipeline/NaitivePipelineNarrative';
import { NaitiveCatchUpCard } from '@/components/naitive-pipeline/NaitiveCatchUpCard';
import { NaitivePipelineFilterBar } from '@/components/naitive-pipeline/NaitivePipelineFilterBar';
import { MilestoneConfigModal } from '@/components/naitive-pipeline/MilestoneConfigModal';
import { EmailCadenceConfigModal } from '@/components/naitive-pipeline/EmailCadenceConfigModal';
import { SubmitReportDialog } from '@/components/naitive-pipeline/SubmitReportDialog';
import { Link } from 'react-router-dom';
import { useNaitivePipelineFilters } from '@/hooks/useNaitivePipelineFilters';
import { usePipelineScrollPersistence } from '@/hooks/usePipelineScrollPersistence';
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
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { DashboardPage } from '@/components/layout/DashboardPage';

const CARD_INTERACTIVE_SELECTOR = [
  '[data-milestone-toggle]',
  '[data-no-card-open]',
  'button',
  'a',
  'input',
  'textarea',
  'select',
  'label',
  '[role="button"]',
  '[role="menuitem"]',
  '[role="menu"]',
  '[role="dialog"]',
  '[contenteditable="true"]',
].join(',');

const NAITIVE_PIPELINE_VIEW_STORAGE_KEY = 'naitive-pipeline:active-view';

function readStoredNaitivePipelineView(): 0 | 1 {
  try {
    return sessionStorage.getItem(NAITIVE_PIPELINE_VIEW_STORAGE_KEY) === 'pipeline' ? 1 : 0;
  } catch {
    return 0;
  }
}

function persistNaitivePipelineView(view: 0 | 1) {
  try {
    sessionStorage.setItem(NAITIVE_PIPELINE_VIEW_STORAGE_KEY, view === 1 ? 'pipeline' : 'dashboard');
  } catch {
    // ignore storage failures
  }
}

function shouldIgnoreCardOpen(target: EventTarget | null, currentTarget?: HTMLElement | null) {
  if (!(target instanceof HTMLElement)) return false;
  const interactiveAncestor = target.closest(CARD_INTERACTIVE_SELECTOR);
  if (!interactiveAncestor) return false;
  if (currentTarget && interactiveAncestor === currentTarget) return false;
  return true;
}

function DraggableCard({ deal, onStatusChange, isDragging, milestones, onToggleMilestone, onOpenEdit, onDeleted }: {
  deal: Deal; onStatusChange: (id: string, s: DealStatus) => void; isDragging?: boolean;
  milestones: DealStageMilestone[]; onToggleMilestone: (dealId: string, stage: string, key: string) => void;
  onOpenEdit: (deal: Deal) => void;
  onDeleted?: () => void;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: deal.id, data: { deal } });
  // DragOverlay handles the moving copy — keep the source in place but hide
  // it while dragging so we don't get a flickering double-card and avoid
  // per-frame transform repaints on every card.
  const style: React.CSSProperties = isDragging ? { opacity: 0, pointerEvents: 'none' } : {};

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative w-full min-w-0 touch-none rounded-xl"
      onClick={(e) => {
        if (shouldIgnoreCardOpen(e.target, e.currentTarget)) return;
        onOpenEdit(deal);
      }}
      onKeyDown={(e) => {
        if (shouldIgnoreCardOpen(e.target, e.currentTarget)) return;
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        onOpenEdit(deal);
      }}
      role="button"
      tabIndex={0}
      aria-label={`Open deal details for ${deal.company || deal.name || 'deal'}`}
    >
      <button
        type="button"
        data-no-card-open
        {...listeners}
        {...attributes}
        className="absolute right-2 top-2 z-20 inline-flex h-7 w-7 items-center justify-center rounded-md border border-border/60 bg-background/70 text-muted-foreground shadow-sm transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background cursor-grab active:cursor-grabbing"
        aria-label={`Drag ${deal.company || deal.name || 'deal'}`}
        title="Drag deal"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <NaitiveDealCard deal={deal} disableLink onDeleted={onDeleted}>
        {milestones.length > 0 && (
          <div className="pt-1">
            <NaitiveMilestoneDiamonds
              milestones={milestones}
              onToggle={(key) => onToggleMilestone(deal.id, deal.stage, key)}
              showProgress
            />
          </div>
        )}
      </NaitiveDealCard>
    </div>
  );
}

function StageColumn({
  stage, deals, onStatusChange, onStageChange, activeDealId, isOver, fullscreen,
  getMilestonesForDeal, onToggleMilestone, onOpenEdit, onDeleted,
}: {
  stage: DealStageOption; deals: Deal[];
  onStatusChange: (id: string, s: DealStatus) => void;
  onStageChange?: (id: string, s: string) => void;
  activeDealId: string | null; isOver: boolean; fullscreen?: boolean;
  getMilestonesForDeal: (dealId: string, stage: string) => DealStageMilestone[];
  onToggleMilestone: (dealId: string, stage: string, key: string) => void;
  onOpenEdit: (deal: Deal) => void;
  onDeleted?: () => void;
}) {
  const { setNodeRef } = useDroppable({ id: stage.id });
  const description = getStageDescription(stage);

  return (
    <div ref={setNodeRef} className={cn("flex-shrink-0 w-[300px] bg-muted/30 rounded-lg border transition-colors", isOver && "ring-2 ring-primary bg-primary/5")}>
      <div className="p-3 border-b bg-muted/50 rounded-lg">
        <div className="flex items-center gap-2">
          <span className={cn("h-2.5 w-2.5 rounded-full flex-shrink-0", stage.color)} />
          <h3 className="font-medium text-sm truncate">{stage.label}</h3>
          {description && (
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" data-no-card-open className="text-muted-foreground/70 hover:text-foreground" aria-label={`About ${stage.label}`}>
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs text-xs leading-relaxed">{description}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
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
              onOpenEdit={onOpenEdit}
              onDeleted={onDeleted}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

const VIEWS = ['Dashboard', 'Pipeline'] as const;

export default function NaitivePipeline() {
  const { hasAccess, isLoading: accessLoading } = useNaitivePipelineAccess();
  const { pipelineId, stages, deals, isLoading: dataLoading, refetch, saveStages } = useNaitivePipelineData();
  const { kpis, funnelData, agingData, healthMix, trendData, notifications, recommendations, hurdles } = useNaitivePipelineMetrics(deals, stages);
  const { history: stageHistory } = useNaitiveStageHistory(pipelineId);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const dealIds = useMemo(() => deals.map(d => d.id), [deals]);
  const { getMilestonesForDeal, toggleMilestone } = useNaitiveStageMilestones(dealIds, {
    onDealStageChanged: () => { refetch(); },
  });

  const [activeView, setActiveView] = useState<0 | 1>(() => readStoredNaitivePipelineView());
  const [slideDirection, setSlideDirection] = useState<'left' | 'right' | null>(null);
  const [activeDealId, setActiveDealId] = useState<string | null>(null);
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMilestonesOpen, setIsMilestonesOpen] = useState(false);
  const [isEmailsOpen, setIsEmailsOpen] = useState(false);
  const [isSubmitOpen, setIsSubmitOpen] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');

  // ── Multi-select filter bar (shared between Dashboard & Pipeline views) ─
  const naitiveFilters = useNaitivePipelineFilters(deals, stages);

  const stageLabelById = useMemo(() => {
    const m = new Map<string, string>();
    stages.forEach(s => m.set(s.id, s.label));
    return m;
  }, [stages]);

  const filteredDeals = useMemo(() => {
    // 1) Apply dropdown filters first (cheap, structural).
    const afterFilters = naitiveFilters.apply(deals);
    // 2) Then layer the free-text search on top.
    const q = searchQuery.trim().toLowerCase();
    if (!q) return afterFilters;
    return afterFilters.filter(d => {
      const stageLabel = stageLabelById.get(d.stage) || d.stage || '';
      const haystack = [
        d.name,
        d.company,
        d.contact,
        d.contactEmail,
        d.contactTitle,
        d.contactInfo,
        d.manager,
        d.dealOwner,
        d.analyst,
        d.ownedBy,
        d.icpCategory,
        d.engagementType,
        d.opportunityType,
        d.leadSource,
        d.referralSource,
        d.sourcedVia,
        d.prospectType,
        d.outcome,
        d.keySignal,
        d.nextStep,
        d.nextStepDate,
        d.status,
        d.stage,
        stageLabel,
        ...(d.dealTypes || []),
        ...(d.servicesOffered || []),
      ]
        .filter(Boolean)
        .join(' \u0001 ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [deals, searchQuery, stageLabelById, naitiveFilters.apply]);

  const goTo = useCallback((target: 0 | 1) => {
    if (target === activeView) return;
    setSlideDirection(target > activeView ? 'left' : 'right');
    setActiveView(target);
    setTimeout(() => setSlideDirection(null), 350);
  }, [activeView]);

  // Open the deal in an overlay on top of the kanban (keeps board mounted
  // so users can sweep through deals via ←/→ without losing context).
  const openDealFromPipeline = useCallback((deal: Deal) => {
    persistNaitivePipelineView(1);
    const next = new URLSearchParams(searchParams);
    next.set('deal', deal.id);
    setSearchParams(next, { replace: false });
  }, [searchParams, setSearchParams]);

  const closeDealOverlay = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete('deal');
    setSearchParams(next, { replace: false });
  }, [searchParams, setSearchParams]);

  const navigateOverlayTo = useCallback((deal: Deal) => {
    const next = new URLSearchParams(searchParams);
    next.set('deal', deal.id);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    persistNaitivePipelineView(activeView);
  }, [activeView]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const dealsByStage = useMemo(() => {
    const grouped = new Map<string, Deal[]>();
    stages.forEach(s => grouped.set(s.id, []));
    filteredDeals.forEach(d => {
      const arr = grouped.get(d.stage) || [];
      arr.push(d);
      grouped.set(d.stage, arr);
    });
    grouped.forEach((arr, id) => {
      arr.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      grouped.set(id, arr);
    });
    return grouped;
  }, [filteredDeals, stages]);

  // Flat ordered list (column-by-column, top-to-bottom) used by the overlay
  // for prev/next navigation between deals.
  const orderedDeals = useMemo(() => {
    const out: Deal[] = [];
    stages.forEach(s => {
      const arr = dealsByStage.get(s.id) || [];
      arr.forEach(d => out.push(d));
    });
    return out;
  }, [stages, dealsByStage]);

  const openDealId = searchParams.get('deal');
  const openDeal = useMemo(
    () => {
      if (!openDealId) return null;
      const found = deals.find(d => d.id === openDealId);
      if (found) return found;
      // Deep-link fallback: render a minimal stub so the overlay opens even
      // when the deal isn't in the loaded pipeline (filtered out, different
      // pipeline, or still loading). The embedded /deal/:id page fetches
      // its own data.
      return { id: openDealId, company: 'Deal' } as unknown as Deal;
    },
    [openDealId, deals],
  );

  // Snapshot board scroll positions when the overlay opens and restore them
  // when it closes so the kanban returns to where the user left it.
  const boardScrollRef = useRef<HTMLDivElement | null>(null);
  usePipelineScrollPersistence(boardScrollRef, !!openDealId);

  const handleStageChange = async (dealId: string, newStage: string) => {
    try {
      const { error } = await supabase.from('deals').update({ stage: newStage, updated_at: new Date().toISOString() }).eq('id', dealId);
      if (error) throw error;
      await refetch();
    } catch {
      toast.error('Failed to update deal stage');
    }
  };

  // ---- Stage transition gating (On Hold / Dormant / Closed Lost) ----
  const [pendingTransition, setPendingTransition] = useState<PendingTransition | null>(null);

  const requestStageChange = useCallback((dealId: string, newStage: string) => {
    const deal = deals.find(d => d.id === dealId);
    if (!deal || deal.stage === newStage) return;
    const fromStage = stages.find(s => s.id === deal.stage);
    const toStage = stages.find(s => s.id === newStage);
    if (!toStage) return;
    const canonical = resolveSystemStageType(toStage);
    if (canonical === 'on-hold' || canonical === 'closed-lost' || canonical === 'dormant') {
      setPendingTransition({
        dealId,
        dealName: (deal as any).company || (deal as any).name || 'Deal',
        fromStageId: deal.stage,
        fromStageLabel: fromStage?.label || deal.stage,
        toStageId: newStage,
        toStageLabel: toStage.label,
        canonicalType: canonical,
      });
      return;
    }
    void handleStageChange(dealId, newStage);
  }, [deals, stages]);

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
    requestStageChange(dealId, newStage);
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
      <ScrollArea className="w-full" ref={boardScrollRef as unknown as React.RefObject<HTMLDivElement>}>
        <div className="flex gap-4 pb-4 min-w-max">
          {stages.map(stage => (
            <StageColumn
              key={stage.id}
              stage={stage}
              deals={dealsByStage.get(stage.id) || []}
              onStatusChange={handleStatusChange}
              onStageChange={requestStageChange}
              activeDealId={activeDealId}
              isOver={overId === stage.id}
              fullscreen={fullscreen}
              getMilestonesForDeal={getMilestonesForDeal}
              onToggleMilestone={toggleMilestone}
              onOpenEdit={openDealFromPipeline}
              onDeleted={refetch}
            />
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
      <DragOverlay>
        {activeDeal ? (
          <div className="opacity-90 rotate-2 scale-105">
            <NaitiveDealCard deal={activeDeal} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );

  return (
    <>
      <Helmet>
        <title>naitive Pipeline | naitive</title>
      </Helmet>
      <NaitiveCatchUpCard />
      <div className="bg-transparent">
        <DashboardPage
          padding="sm"
          header={
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">naitive Pipeline</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  {searchQuery.trim()
                    ? `${filteredDeals.length} of ${deals.length} ${deals.length === 1 ? 'deal' : 'deals'} match`
                    : `${deals.length} ${deals.length === 1 ? 'deal' : 'deals'} in pipeline`}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative w-72">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <Input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search Pipeline: deals, contacts, next steps, stage…"
                    aria-label="Search naitive Pipeline"
                    className="h-8 pl-8 pr-8 text-xs"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      aria-label="Clear search"
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 h-5 w-5 inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
                {/* View toggle pills */}
                <div className="flex items-center bg-muted rounded-lg p-0.5">
                  {VIEWS.map((label, i) => (
                    <button
                      key={label}
                      onClick={() => goTo(i as 0 | 1)}
                      className={cn(
                        "px-3.5 py-1.5 text-xs font-medium rounded-md transition-all duration-200",
                        activeView === i
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setIsMilestonesOpen(true)}
                  aria-label="Configure stage milestones"
                >
                  <Diamond className="h-3.5 w-3.5" />
                  Milestones
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setIsEmailsOpen(true)}
                  aria-label="Configure email cadences"
                >
                  <Mail className="h-3.5 w-3.5" />
                  Emails
                </Button>
                <Link to="/naitive-pipeline/reports">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    aria-label="View submitted reports"
                  >
                    <History className="h-3.5 w-3.5" />
                    History
                  </Button>
                </Link>
                <Button
                  variant="gradient"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setIsSubmitOpen(true)}
                  aria-label="Submit naitive Pipeline Report"
                >
                  <Send className="h-3.5 w-3.5" />
                  Submit
                </Button>
              </div>
            </div>
          }
        >
          {/* View container with arrows */}
          <div className="relative">
            {/* Left arrow — visible on Pipeline view */}
            {activeView === 1 && (
              <button
                onClick={() => goTo(0)}
                className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 z-20 h-11 w-11 flex items-center justify-center rounded-full bg-background/80 backdrop-blur border border-border shadow-md hover:shadow-lg hover:bg-background transition-all duration-200"
                aria-label="Go to Dashboard"
              >
                <ChevronLeft className="h-5 w-5 text-foreground" />
              </button>
            )}

            {/* Right arrow — visible on Dashboard view */}
            {activeView === 0 && !isLoading && deals.length > 0 && (
              <button
                onClick={() => goTo(1)}
                className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-20 h-11 w-11 flex items-center justify-center rounded-full bg-background/80 backdrop-blur border border-border shadow-md hover:shadow-lg hover:bg-background transition-all duration-200"
                aria-label="Go to Pipeline"
              >
                <ChevronRight className="h-5 w-5 text-foreground" />
              </button>
            )}

            {/* Animated content area */}
            <div className="overflow-hidden">
              <div
                key={activeView}
                className={cn(
                  "transition-none",
                  slideDirection === 'left' && "animate-[slideInFromRight_0.3s_ease-out]",
                  slideDirection === 'right' && "animate-[slideInFromLeft_0.3s_ease-out]",
                )}
              >
                {activeView === 0 ? (
                  /* ── Dashboard View ── */
                  isLoading ? (
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
                      {pipelineId && (
                        <CreateNaitiveDealDialog
                          pipelineId={pipelineId}
                          stages={stages}
                          defaultStage={stages[0]?.id}
                          onCreated={refetch}
                          trigger={
                            <Button className="mt-4 gap-1.5">
                              <Plus className="h-4 w-4" />
                              Add Your First Deal
                            </Button>
                          }
                        />
                      )}
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <NaitivePipelineFilterBar
                        filters={naitiveFilters.filters}
                        options={naitiveFilters.options}
                        activeCount={naitiveFilters.activeCount}
                        totalCount={deals.length}
                        matchedCount={filteredDeals.length}
                        onSetMulti={naitiveFilters.setMulti}
                        onSetDateRange={naitiveFilters.setDateRange}
                        onSetDateField={naitiveFilters.setDateField}
                        onSetActiveOnly={naitiveFilters.setActiveOnly}
                        onClearAll={naitiveFilters.clearAll}
                        showDateRange
                      />
                      {naitiveFilters.activeCount > 0 && filteredDeals.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center rounded-xl border border-dashed border-border/60 bg-muted/20">
                          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-3">
                            <FileX className="h-6 w-6 text-muted-foreground" />
                          </div>
                          <h3 className="text-sm font-medium">No deals match your current filters</h3>
                          <Button variant="outline" size="sm" className="mt-3" onClick={naitiveFilters.clearAll}>
                            Clear Filters
                          </Button>
                        </div>
                      ) : (
                      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
                        <div className="xl:col-span-5 min-w-0 order-1">
                          <NaitivePipelineNarrative deals={filteredDeals} />
                        </div>
                        <div className="xl:col-span-7 min-w-0 order-2">
                          <NaitiveWeeklyExecutionPulse deals={filteredDeals} history={stageHistory} />
                        </div>
                      </div>
                      )}
                    </div>
                  )
                ) : (
                  /* ── Pipeline Board View ── */
                  isLoading ? (
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
                    </div>
                  ) : (
                    <>
                      <NaitivePipelineFilterBar
                        filters={naitiveFilters.filters}
                        options={naitiveFilters.options}
                        activeCount={naitiveFilters.activeCount}
                        totalCount={deals.length}
                        matchedCount={filteredDeals.length}
                        onSetMulti={naitiveFilters.setMulti}
                        onSetDateRange={naitiveFilters.setDateRange}
                        onSetDateField={naitiveFilters.setDateField}
                        onSetActiveOnly={naitiveFilters.setActiveOnly}
                        onClearAll={naitiveFilters.clearAll}
                      />
                      <div className="flex justify-end mb-2">
                        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setIsFullscreen(true)}>
                          <Maximize2 className="h-3.5 w-3.5" />
                          Expand
                        </Button>
                      </div>
                      {naitiveFilters.activeCount > 0 && filteredDeals.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center rounded-xl border border-dashed border-border/60 bg-muted/20">
                          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-3">
                            <FileX className="h-6 w-6 text-muted-foreground" />
                          </div>
                          <h3 className="text-sm font-medium">No deals match your current filters</h3>
                          <Button variant="outline" size="sm" className="mt-3" onClick={naitiveFilters.clearAll}>
                            Clear Filters
                          </Button>
                        </div>
                      ) : (
                        pipelineContent(false)
                      )}
                    </>
                  )
                )}
              </div>
            </div>
          </div>
        </DashboardPage>
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

      {/* Deal detail overlay — embeds /deal/:id so every existing tab stays
          identical. Backdrop click / Esc / arrow keys handled inside. */}
      <NaitiveDealOverlay
        deal={openDeal}
        orderedDeals={orderedDeals}
        stages={stages}
        onClose={closeDealOverlay}
        onNavigate={navigateOverlayTo}
        onStageChange={requestStageChange}
      />

      <MilestoneConfigModal
        open={isMilestonesOpen}
        onOpenChange={setIsMilestonesOpen}
        stages={stages}
        saveStages={saveStages}
      />

      <EmailCadenceConfigModal
        open={isEmailsOpen}
        onOpenChange={setIsEmailsOpen}
        stages={stages}
      />

      <SubmitReportDialog
        open={isSubmitOpen}
        onOpenChange={setIsSubmitOpen}
        filters={naitiveFilters.filters}
        activeCount={naitiveFilters.activeCount}
        filteredDeals={filteredDeals}
        totalDeals={deals.length}
        stageLabels={stageLabelById}
      />

      <NaitiveStageTransitionDialog
        transition={pendingTransition}
        onCancel={() => setPendingTransition(null)}
        onConfirmed={async () => {
          if (!pendingTransition) return;
          const { dealId, toStageId } = pendingTransition;
          setPendingTransition(null);
          await handleStageChange(dealId, toStageId);
        }}
      />
    </>
  );
}