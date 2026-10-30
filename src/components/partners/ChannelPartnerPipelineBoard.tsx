import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, pointerWithin, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import { useNavigate } from 'react-router-dom';
import { Plus, Building2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { liquidGlassCard, LIQUID_GLASS_SERIES } from '@/components/metrics/liquidGlass';
import { CHANNEL_PARTNER_STAGES, type ChannelPartnerStageKey } from '@/lib/channelPartnerStages';
import { cn } from '@/lib/utils';

const norm = (s: string) => s.trim().toLowerCase();
const STAGE_KEYS = new Set<string>(CHANNEL_PARTNER_STAGES.map(s => s.key));

type Row = { id: string; stage: string; owner_user_id: string | null; crm_company_id: string; name: string };
type CompanyHit = { id: string; name: string; domain: string | null };

const cardClass = 'rounded-md border border-[rgba(126,184,247,0.22)] bg-[#0b1226] px-2.5 py-2';

function CardBody({ r, ownerLabel }: { r: Row; ownerLabel: string }) {
  return (
    <>
      <p className="text-xs font-medium text-foreground leading-tight truncate">{r.name}</p>
      <p className="text-[10px] text-muted-foreground truncate mt-0.5">{ownerLabel}</p>
    </>
  );
}

function DraggableCard({ r, ownerLabel, onOpen, onRemove }: { r: Row; ownerLabel: string; onOpen: () => void; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: r.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={e => { if (e.key === 'Enter') onOpen(); }}
      className={cn(cardClass, 'group relative cursor-grab active:cursor-grabbing touch-none hover:bg-[#101836] hover:border-[rgba(126,184,247,0.4)] transition-colors', isDragging && 'opacity-30')}
    >
      <CardBody r={r} ownerLabel={ownerLabel} />
      <button
        type="button"
        aria-label={`Remove ${r.name} from channel partners`}
        onPointerDown={e => e.stopPropagation()}
        onClick={e => { e.stopPropagation(); onRemove(); }}
        className="absolute right-1.5 top-1.5 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="h-3 w-3" />
      </button>
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

function AddChannelPartnerDialog({ open, onOpenChange, existing }: { open: boolean; onOpenChange: (o: boolean) => void; existing: Set<string> }) {
  const { company } = useCompany();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<CompanyHit[]>([]);
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);

  useEffect(() => { if (!open) { setQ(''); setHits([]); } }, [open]);
  useEffect(() => {
    const term = q.trim();
    if (!open || !company?.id || term.length < 2) { setHits([]); return; }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('crm_companies')
        .select('id, name, domain')
        .eq('org_company_id', company.id)
        .ilike('name', `%${term.replace(/[%_,()]/g, ' ')}%`)
        .order('name')
        .limit(10);
      if (!cancelled) { setHits((data as CompanyHit[]) || []); setSearching(false); }
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, open, company?.id]);

  const add = async (crmCompanyId: string) => {
    if (!company?.id) return;
    const { error } = await supabase.from('channel_partners').insert({
      company_id: company.id, crm_company_id: crmCompanyId, stage: 'prospect', owner_user_id: user?.id ?? null, created_by: user?.id ?? null,
    });
    if (error) throw error;
  };

  const run = async (fn: () => Promise<void>) => {
    setSaving(true);
    try {
      await fn();
      await queryClient.invalidateQueries({ queryKey: ['channel_partners'] });
      toast.success('Channel partner added');
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not add channel partner');
    } finally {
      setSaving(false);
    }
  };

  const createAndAdd = () => run(async () => {
    const { data, error } = await supabase
      .from('crm_companies')
      .insert({ name: q.trim(), company_type: 'partner', created_by: user?.id ?? null, org_company_id: company!.id } as never)
      .select('id')
      .single();
    if (error) throw error;
    queryClient.invalidateQueries({ queryKey: ['crm-companies'] });
    queryClient.invalidateQueries({ queryKey: ['crm-companies-infinite'] });
    await add((data as { id: string }).id);
  });

  const exact = hits.some(h => norm(h.name) === norm(q));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add channel partner</DialogTitle>
          <DialogDescription>Pick a company from your Companies list, or create a new one.</DialogDescription>
        </DialogHeader>
        <Input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search companies…" aria-label="Search companies" />
        <div className="max-h-64 overflow-y-auto space-y-1">
          {hits.map(h => {
            const already = existing.has(h.id);
            return (
              <button
                key={h.id}
                type="button"
                disabled={saving || already}
                onClick={() => run(() => add(h.id))}
                className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-white/[0.05] disabled:opacity-50"
              >
                <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="truncate flex-1">{h.name}</span>
                <span className="text-[10px] text-muted-foreground">{already ? 'Already added' : h.domain}</span>
              </button>
            );
          })}
          {searching && <p className="text-xs text-muted-foreground px-2 py-2">Searching…</p>}
          {!searching && q.trim().length >= 2 && hits.length === 0 && <p className="text-xs text-muted-foreground px-2 py-2">No matching companies.</p>}
        </div>
        <DialogFooter>
          {q.trim().length >= 2 && !exact && (
            <Button onClick={createAndAdd} disabled={saving} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Create “{q.trim()}” and add
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ChannelPartnerPipelineBoard({ search = '' }: { search?: string }) {
  const { company } = useCompany();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const queryKey = ['channel_partners', company?.id];
  const { data: rows = [] } = useQuery({
    queryKey,
    enabled: !!company?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('channel_partners')
        .select('id, stage, owner_user_id, crm_company_id, crm_companies(name)')
        .eq('company_id', company!.id);
      if (error) throw error;
      return ((data ?? []) as Array<Omit<Row, 'name'> & { crm_companies: { name: string } | null }>).map(r => ({
        id: r.id, stage: r.stage, owner_user_id: r.owner_user_id, crm_company_id: r.crm_company_id, name: r.crm_companies?.name ?? 'Unknown company',
      })) as Row[];
    },
  });
  const team = useTeamMembers();
  const ownerName = useMemo(() => new Map(team.map(t => [t.id, t.display_name])), [team]);
  const ownerLabel = (o: string | null) => (o ? ownerName.get(o) || 'Unknown' : 'Unassigned');
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const existing = useMemo(() => new Set(rows.map(r => r.crm_company_id)), [rows]);

  const columns = useMemo(() => {
    const q = norm(search);
    const by = new Map<string, Row[]>(CHANNEL_PARTNER_STAGES.map(s => [s.key, []]));
    for (const r of rows) {
      if (q && !norm(r.name).includes(q)) continue;
      (by.get(r.stage) || by.get('prospect')!).push(r);
    }
    return CHANNEL_PARTNER_STAGES.map((s, i) => ({
      ...s,
      items: (by.get(s.key) || []).sort((a, b) => a.name.localeCompare(b.name)),
      color: LIQUID_GLASS_SERIES[i % LIQUID_GLASS_SERIES.length],
    }));
  }, [search, rows]);

  const total = columns.reduce((n, c) => n + c.items.length, 0);
  const active = activeId ? rows.find(r => r.id === activeId) : null;

  const onDragEnd = async (e: DragEndEvent) => {
    setActiveId(null);
    const id = String(e.active.id);
    const stage = e.over?.id ? String(e.over.id) as ChannelPartnerStageKey : null;
    const row = rows.find(r => r.id === id);
    if (!row || !stage || !STAGE_KEYS.has(stage) || row.stage === stage) return;
    const prev = queryClient.getQueryData<Row[]>(queryKey);
    queryClient.setQueryData<Row[]>(queryKey, old => (old ?? []).map(r => (r.id === id ? { ...r, stage } : r)));
    const { error } = await supabase.from('channel_partners').update({ stage, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) {
      queryClient.setQueryData(queryKey, prev);
      toast.error('Could not move channel partner');
    }
  };

  const remove = async (r: Row) => {
    if (!window.confirm(`Remove ${r.name} from channel partners? The company stays in Companies.`)) return;
    const { error } = await supabase.from('channel_partners').delete().eq('id', r.id);
    if (error) return toast.error('Could not remove channel partner');
    queryClient.invalidateQueries({ queryKey: ['channel_partners'] });
  };

  return (
    <div className={`${liquidGlassCard} p-3 space-y-2.5`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold tracking-tight text-foreground">Channel Partner Pipeline</h3>
          <p className="text-[10px] text-muted-foreground mt-0.5">Drag partners between stages · hover a stage title to see its definition</p>
        </div>
        <Button size="sm" className="h-7 gap-1.5 text-[11px]" onClick={() => setAddOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> Add channel partner
        </Button>
      </div>
      <TooltipProvider delayDuration={150}>
        <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))} onDragCancel={() => setActiveId(null)} onDragEnd={onDragEnd}>
          <div className="grid gap-2 items-start grid-cols-2 lg:grid-cols-4">
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
                    <p className="text-sm font-bold font-mono tabular-nums text-foreground">{stage.items.length}</p>
                  </div>
                  <p className="text-[10px] text-muted-foreground">channel partner{stage.items.length === 1 ? '' : 's'}</p>
                </div>
                <ScrollArea className="h-96">
                  <div className="p-1.5 space-y-1.5 min-h-[23rem]">
                    {stage.items.length === 0 && <p className="text-[10px] text-muted-foreground/70 px-1.5 py-3 text-center">No partners</p>}
                    {stage.items.map(r => (
                      <DraggableCard key={r.id} r={r} ownerLabel={ownerLabel(r.owner_user_id)} onOpen={() => navigate(`/crm-companies/${r.crm_company_id}`)} onRemove={() => remove(r)} />
                    ))}
                  </div>
                </ScrollArea>
              </StageColumn>
            ))}
          </div>
          <DragOverlay>
            {active ? <div className={cn(cardClass, 'shadow-lg cursor-grabbing')}><CardBody r={active} ownerLabel={ownerLabel(active.owner_user_id)} /></div> : null}
          </DragOverlay>
        </DndContext>
      </TooltipProvider>
      <p className="text-[10px] text-muted-foreground">{total} channel partner{total === 1 ? '' : 's'}</p>
      <AddChannelPartnerDialog open={addOpen} onOpenChange={setAddOpen} existing={existing} />
    </div>
  );
}
