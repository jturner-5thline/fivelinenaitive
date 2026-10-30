import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, pointerWithin, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { LIQUID_GLASS_SERIES } from '@/components/metrics/liquidGlass';
import { CHANNEL_PARTNER_STAGES, type ChannelPartnerStageKey } from '@/lib/channelPartnerStages';
import { cn } from '@/lib/utils';

const norm = (s: string) => s.trim().toLowerCase();
const STAGE_KEYS = new Set(CHANNEL_PARTNER_STAGES.map(s => s.key));

type Card = { id: string; name: string; owner: string | null };
type Row = { id: string; name: string; channel_partner_stage: string; relationship_owner_id: string | null };

function CardBody({ r, ownerLabel }: { r: Card; ownerLabel: string }) {
  return (
    <>
      <p className="text-xs font-medium text-foreground leading-tight truncate">{r.name}</p>
      <p className="text-[10px] text-muted-foreground truncate mt-0.5">Referral source · {ownerLabel}</p>
    </>
  );
}

const cardClass = 'rounded-md border border-[rgba(126,184,247,0.22)] bg-[#0b1226] px-2.5 py-2';

function DraggableCard({ r, ownerLabel, onOpen }: { r: Card; ownerLabel: string; onOpen?: (name: string) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: r.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      onClick={() => onOpen?.(r.name)}
      onKeyDown={e => { if (e.key === 'Enter') onOpen?.(r.name); }}
      className={cn(cardClass, 'cursor-grab active:cursor-grabbing touch-none hover:bg-[#101836] hover:border-[rgba(126,184,247,0.4)] transition-colors', isDragging && 'opacity-30')}
    >
      <CardBody r={r} ownerLabel={ownerLabel} />
    </div>
  );
}

function StageColumn({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={cn('rounded-lg border bg-[#0b1226] overflow-hidden transition-colors', isOver ? 'border-primary' : 'border-[rgba(126,184,247,0.22)]')}>
      {children}
    </div>
  );
}

export function ChannelPartnerPipelineBoard({ search = '', ownerFilter = [] as string[], onOpenSource }: {
  search?: string;
  ownerFilter?: string[];
  onOpenPartner?: (id: string) => void;
  onOpenSource?: (name: string) => void;
}) {
  const { company } = useCompany();
  const queryClient = useQueryClient();
  const queryKey = ['channel_partner_referral_sources', company?.id];
  // Only referral sources with the Channel Partner toggle on appear here.
  const { data: flagged = [] } = useQuery({
    queryKey,
    enabled: !!company?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('referral_sources')
        .select('id, name, channel_partner_stage, relationship_owner_id')
        .eq('company_id', company!.id)
        .eq('is_channel_partner', true);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });
  const team = useTeamMembers();
  const ownerName = useMemo(() => new Map(team.map(t => [t.id, t.display_name])), [team]);
  const ownerLabel = (o: string | null) => (o ? ownerName.get(o) || 'Unknown' : 'Unassigned');
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [activeId, setActiveId] = useState<string | null>(null);

  const columns = useMemo(() => {
    const q = norm(search);
    const src = new Map<ChannelPartnerStageKey, Card[]>(CHANNEL_PARTNER_STAGES.map(s => [s.key, []]));
    const seen = new Set<string>();
    for (const r of flagged) {
      const k = norm(r.name);
      if (seen.has(k)) continue;
      seen.add(k);
      if (q && !k.includes(q)) continue;
      if (ownerFilter.length && !ownerFilter.includes(r.relationship_owner_id || '__unassigned__')) continue;
      const key = (r.channel_partner_stage as ChannelPartnerStageKey) || 'prospect';
      (src.get(key) || src.get('prospect')!).push({ id: r.id, name: r.name, owner: r.relationship_owner_id });
    }
    return CHANNEL_PARTNER_STAGES.map((s, i) => ({
      ...s,
      sources: (src.get(s.key) || []).sort((a, b) => a.name.localeCompare(b.name)),
      color: LIQUID_GLASS_SERIES[i % LIQUID_GLASS_SERIES.length],
    }));
  }, [search, ownerFilter, flagged]);

  const total = columns.reduce((n, c) => n + c.sources.length, 0);
  const active = activeId ? flagged.find(r => r.id === activeId) : null;

  const onDragEnd = async (e: DragEndEvent) => {
    setActiveId(null);
    const id = String(e.active.id);
    const stage = e.over?.id ? String(e.over.id) as ChannelPartnerStageKey : null;
    const row = flagged.find(r => r.id === id);
    if (!row || !stage || !STAGE_KEYS.has(stage) || row.channel_partner_stage === stage) return;
    const prev = queryClient.getQueryData<Row[]>(queryKey);
    queryClient.setQueryData<Row[]>(queryKey, old => (old ?? []).map(r => (r.id === id ? { ...r, channel_partner_stage: stage } : r)));
    const { error } = await supabase.from('referral_sources').update({ channel_partner_stage: stage }).eq('id', id);
    if (error) {
      queryClient.setQueryData(queryKey, prev);
      toast.error('Could not move channel partner');
    }
  };

  return (
    <TooltipProvider delayDuration={150}>
      <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))} onDragCancel={() => setActiveId(null)} onDragEnd={onDragEnd}>
        <div className="grid gap-2 items-start grid-cols-4">
          {columns.map(stage => (
            <StageColumn key={stage.key} id={stage.key}>
              <div className="px-2.5 py-2 border-b border-[rgba(126,184,247,0.22)]" style={{ borderTop: `2px solid ${stage.color}` }}>
                <div className="flex items-baseline justify-between gap-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <p className="text-[11px] font-medium text-foreground truncate cursor-help underline decoration-dotted decoration-muted-foreground/50 underline-offset-2">{stage.label}</p>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-56 text-[11px]">{stage.definition}</TooltipContent>
                  </Tooltip>
                  <p className="text-sm font-bold font-mono tabular-nums text-foreground">{stage.sources.length}</p>
                </div>
                <p className="text-[10px] text-muted-foreground">channel partner{stage.sources.length === 1 ? '' : 's'}</p>
              </div>
              <ScrollArea className="h-96">
                <div className="p-1.5 space-y-1.5 min-h-[23rem]">
                  {stage.sources.length === 0 && (
                    <p className="text-[10px] text-muted-foreground/70 px-1.5 py-3 text-center">No partners</p>
                  )}
                  {stage.sources.map(r => (
                    <DraggableCard key={r.id} r={r} ownerLabel={ownerLabel(r.owner)} onOpen={onOpenSource} />
                  ))}
                </div>
              </ScrollArea>
            </StageColumn>
          ))}
        </div>
        <DragOverlay>
          {active ? (
            <div className={cn(cardClass, 'shadow-lg cursor-grabbing')}>
              <CardBody r={{ id: active.id, name: active.name, owner: active.relationship_owner_id }} ownerLabel={ownerLabel(active.relationship_owner_id)} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      <p className="text-[10px] text-muted-foreground mt-2.5">
        {total} channel partner{total === 1 ? '' : 's'}
      </p>
    </TooltipProvider>
  );
}
