import { useState, useMemo } from 'react';
import { Handshake, Plus, Settings, MoreHorizontal, GripVertical, Users, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent, DragOverlay, type DragStartEvent, DragOverEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { usePipelineStages, usePartners, useUpdatePartner, type Partner, type PipelineStage } from '@/hooks/usePartnersPipeline';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { ConfigureStagesModal } from '@/components/partners/ConfigureStagesModal';
import { AddPartnerDialog } from '@/components/partners/AddPartnerDialog';
import { PartnerDetailPanel } from '@/components/partners/PartnerDetailPanel';
import { PartnerPromotionDialog, getPromotionMode, type PromotionResult, type PromotionMode } from '@/components/partners/PartnerPromotionDialog';
import { usePartnerPromotionCriteria } from '@/hooks/usePartnerPromotionCriteria';
import { usePartnerTier } from '@/hooks/usePartnerTier';
import { PartnerTierBadge, PartnerTier4WarningBadge } from '@/components/partners/PartnerTierBadge';
import { PartnerTierExplainer } from '@/components/partners/PartnerTierExplainer';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { toast } from 'sonner';
import { useOptionalSalesBdDateRange } from '@/contexts/SalesBdDateRangeContext';



function SortablePartnerCard({ partner, owners, onClick }: { partner: Partner; owners: Map<string, { display_name: string; avatar_url?: string }>; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: partner.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  const owner = partner.owner_id ? owners.get(partner.owner_id) : null;
  const { data: criteria } = usePartnerPromotionCriteria(partner.name);
  const { data: tierInfo } = usePartnerTier(partner);
  const daysSince = Math.max(0, Math.floor((Date.now() - new Date(partner.created_at).getTime()) / (1000 * 60 * 60 * 24)));

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group bg-slate-800 border border-slate-600 rounded-md p-3 cursor-grab hover:border-slate-500 transition-colors"
      onClick={(e) => { if (!(e.target as HTMLElement).closest('[data-drag-handle]')) onClick(); }}
      {...attributes}
      {...listeners}
    >
      <div className="flex items-start justify-between">
        <span className="font-medium text-sm text-white truncate">{partner.name}</span>
        <GripVertical data-drag-handle className="h-4 w-4 text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
      </div>
      <p className="text-xs text-slate-400 mt-0.5">{partner.firm_type || 'Other'}</p>
      <div className="flex items-center flex-wrap gap-1.5 mt-2">
        <PartnerTierBadge info={tierInfo} />
        <PartnerTierExplainer info={tierInfo} />
        <PartnerTier4WarningBadge info={tierInfo} />
        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-700/60 text-slate-300 border border-slate-600/60">
          {criteria?.metCount ?? 0} of 3 AP criteria met
        </span>
        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-700/60 text-slate-400 border border-slate-600/60">
          {daysSince}d in pipeline
        </span>
      </div>
      <div className="flex items-center gap-1.5 mt-2">
        <User className="h-3.5 w-3.5 shrink-0" style={{ color: owner ? 'hsl(var(--primary))' : undefined }} />
        {owner ? (
          <span className="text-xs font-medium truncate" style={{ color: 'hsl(var(--primary))' }}>{owner.display_name}</span>
        ) : (
          <span className="text-xs text-slate-500">Unassigned</span>
        )}
      </div>
      <p className="text-xs text-slate-500 mt-1.5">0 active deals</p>
    </div>
  );
}

function StageColumn({
  stage, partners, owners, onAddPartnerHere, onClickPartner,
}: {
  stage: PipelineStage;
  partners: Partner[];
  owners: Map<string, { display_name: string }>;
  onAddPartnerHere: (stageId: string) => void;
  onClickPartner: (p: Partner) => void;
}) {
  return (
    <div className="w-72 min-w-[288px] flex flex-col bg-slate-800/50 rounded-lg border border-slate-700">
      <div className="flex items-center gap-2 p-3 border-b border-slate-700">
        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
        <span className="text-sm font-medium text-white truncate">{stage.name}</span>
        <span className="text-xs text-slate-400 bg-slate-700 rounded px-1.5 ml-auto">{partners.length}</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="text-slate-400 hover:text-white"><MoreHorizontal className="h-4 w-4" /></button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onAddPartnerHere(stage.id)}>Add Partner Here</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="p-2 space-y-2 max-h-[calc(100vh-280px)] overflow-y-auto flex-1">
        <SortableContext items={partners.map(p => p.id)} strategy={verticalListSortingStrategy}>
          {partners.map(p => (
            <SortablePartnerCard key={p.id} partner={p} owners={owners} onClick={() => onClickPartner(p)} />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}

export default function PartnersPipeline() {
  const dateCtx = useOptionalSalesBdDateRange();
  const rangeStart = dateCtx?.start ?? null;
  const rangeEnd = dateCtx?.end ?? null;
  const granularity = dateCtx?.range.granularity ?? null;
  const { data: stages = [], isLoading: stagesLoading } = usePipelineStages();
  const { data: partners = [], isLoading: partnersLoading } = usePartners({ start: rangeStart, end: rangeEnd, granularity });
  const teamMembers = useTeamMembers();
  const updatePartner = useUpdatePartner();
  const { user } = useAuth();
  const { company } = useCompany();

  const [showConfigure, setShowConfigure] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [addStageId, setAddStageId] = useState<string | null>(null);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);
  const selectedPartner = useMemo(() => partners.find(p => p.id === selectedPartnerId) || null, [partners, selectedPartnerId]);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Promotion dialog state for drag-to-Trial / Active Partner
  const [promo, setPromo] = useState<{ partner: Partner; targetStageId: string; mode: PromotionMode } | null>(null);
  const [promoSubmitting, setPromoSubmitting] = useState(false);

  const owners = useMemo(() => {
    const map = new Map<string, { display_name: string; avatar_url?: string }>();
    teamMembers.forEach((m) => map.set(m.id, { display_name: m.display_name || m.email || '', avatar_url: m.avatar_url || undefined }));
    return map;
  }, [teamMembers]);

  const partnersByStage = useMemo(() => {
    const map = new Map<string, Partner[]>();
    stages.forEach(s => map.set(s.id, []));
    partners.forEach(p => {
      const list = map.get(p.stage_id || '') || [];
      list.push(p);
      map.set(p.stage_id || '', list);
    });
    // Sort within each stage
    map.forEach((list) => list.sort((a, b) => a.sort_order_in_stage - b.sort_order_in_stage));
    return map;
  }, [stages, partners]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleDragStart = (event: DragStartEvent) => setActiveId(event.active.id as string);

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const draggedPartner = partners.find(p => p.id === active.id);
    if (!draggedPartner) return;

    // Check if dropped on a stage column or on another partner
    const overPartner = partners.find(p => p.id === over.id);
    const targetStageId = overPartner ? overPartner.stage_id : (stages.find(s => s.id === over.id)?.id || draggedPartner.stage_id);

    // If moving into Trial or Active Partner, intercept with criteria dialog
    if (targetStageId && targetStageId !== draggedPartner.stage_id) {
      const targetStage = stages.find(s => s.id === targetStageId);
      const mode = getPromotionMode(targetStage?.name);
      if (mode) {
        setPromo({ partner: draggedPartner, targetStageId, mode });
        return;
      }
    }

    updatePartner.mutate({
      id: draggedPartner.id,
      stage_id: targetStageId,
      sort_order_in_stage: overPartner ? overPartner.sort_order_in_stage : 0,
    });
  };

  const handlePromotionConfirm = async (result: PromotionResult) => {
    if (!promo || !user?.id || !company?.id) return;
    setPromoSubmitting(true);
    try {
      await supabase.from('partner_stage_notes' as any).insert({
        partner_id: promo.partner.id,
        user_id: user.id,
        company_id: company.id,
        from_stage: promo.partner.stage_id || null,
        to_stage: promo.targetStageId,
        note: result.note,
      });
      const existingMeta = (promo.partner.metadata || {}) as Record<string, any>;
      const promotions = { ...(existingMeta.promotions || {}) };
      promotions[result.mode] = {
        at: new Date().toISOString(),
        by: user.id,
        trialChecks: result.trialChecks,
        publicConfirmed: result.publicConfirmed,
        override: result.override,
        overrideReason: result.overrideReason,
        autoCriteriaSnapshot: result.autoCriteriaSnapshot,
      };
      updatePartner.mutate(
        { id: promo.partner.id, stage_id: promo.targetStageId, metadata: { ...existingMeta, promotions } },
        { onSuccess: () => toast.success(`Moved to ${promo.mode === 'trial' ? 'Trial' : 'Active Partner'}`) },
      );
      setPromo(null);
    } catch (e: any) {
      toast.error(e.message || 'Failed to promote partner');
    } finally {
      setPromoSubmitting(false);
    }
  };

  const handleAddPartnerHere = (stageId: string) => {
    setAddStageId(stageId);
    setShowAdd(true);
  };

  const isLoading = stagesLoading || partnersLoading;
  const activePartner = activeId ? partners.find(p => p.id === activeId) : null;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Partners Pipeline</h2>
          <p className="text-sm text-slate-400">Track and manage partner relationships through pipeline stages</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowConfigure(true)} className="gap-1.5">
            <Settings className="h-3.5 w-3.5" /> Configure Stages
          </Button>
          <Button size="sm" onClick={() => { setAddStageId(null); setShowAdd(true); }} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Add Partner
          </Button>
        </div>
      </div>


      {/* Kanban Board */}
      {isLoading ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-64 w-72 min-w-[288px]" />)}
        </div>
      ) : partners.length === 0 && stages.length > 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-700 p-16 text-center">
          <Handshake className="h-12 w-12 text-slate-500 mb-4" />
          <h3 className="text-lg font-semibold text-white">No partners yet</h3>
          <p className="text-slate-400 mt-1 mb-4">Add your first partner to start tracking relationships!</p>
          <Button onClick={() => { setAddStageId(null); setShowAdd(true); }} className="gap-1.5">
            <Plus className="h-4 w-4" /> Add Partner
          </Button>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {stages.map(stage => (
              <StageColumn
                key={stage.id}
                stage={stage}
                partners={partnersByStage.get(stage.id) || []}
                owners={owners}
                onAddPartnerHere={handleAddPartnerHere}
                onClickPartner={(p) => setSelectedPartnerId(p.id)}
              />
            ))}
          </div>
          <DragOverlay>
            {activePartner ? (
              <div className="bg-slate-800 border border-slate-500 rounded-md p-3 shadow-lg scale-[1.02] w-64 opacity-90">
                <span className="font-medium text-sm text-white">{activePartner.name}</span>
                <p className="text-xs text-slate-400 mt-0.5">{activePartner.firm_type}</p>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* Modals */}
      <ConfigureStagesModal open={showConfigure} onOpenChange={setShowConfigure} />
      <AddPartnerDialog open={showAdd} onOpenChange={setShowAdd} defaultStageId={addStageId} />
      <PartnerDetailPanel partner={selectedPartner} onClose={() => setSelectedPartnerId(null)} />
      {promo && (
        <PartnerPromotionDialog
          open={!!promo}
          mode={promo.mode}
          partnerName={promo.partner.name}
          onCancel={() => setPromo(null)}
          onConfirm={handlePromotionConfirm}
          submitting={promoSubmitting}
        />
      )}
    </div>
  );
}
