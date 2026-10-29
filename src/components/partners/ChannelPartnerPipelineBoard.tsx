import { useMemo } from 'react';
import { usePartners, usePipelineStages } from '@/hooks/usePartnersPipeline';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { LIQUID_GLASS_SERIES } from '@/components/metrics/liquidGlass';
import { CHANNEL_PARTNER_STAGES, channelPartnerStageFor, type ChannelPartnerStageKey } from '@/lib/channelPartnerStages';

const norm = (s: string) => s.trim().toLowerCase();

export function ChannelPartnerPipelineBoard({ search = '', ownerFilter = [] as string[], onOpenPartner }: {
  search?: string;
  ownerFilter?: string[];
  onOpenPartner?: (id: string) => void;
}) {
  const { data: partners = [] } = usePartners();
  const { data: stages = [] } = usePipelineStages();
  const team = useTeamMembers();
  const ownerName = useMemo(() => new Map(team.map(t => [t.id, t.display_name])), [team]);

  const columns = useMemo(() => {
    const stageName = new Map(stages.map(s => [s.id, s.name]));
    const by = new Map<ChannelPartnerStageKey, typeof partners>(CHANNEL_PARTNER_STAGES.map(s => [s.key, []]));
    const q = norm(search);
    for (const p of partners) {
      const key = channelPartnerStageFor(p.stage_id ? stageName.get(p.stage_id) : null);
      if (!key) continue;
      if (q && !norm(p.name).includes(q) && !norm(p.firm_type || '').includes(q)) continue;
      if (ownerFilter.length && !ownerFilter.includes(p.owner_id || '__unassigned__')) continue;
      by.get(key)!.push(p);
    }
    return CHANNEL_PARTNER_STAGES.map((s, i) => ({
      ...s,
      cards: (by.get(s.key) || []).slice().sort((a, b) => a.name.localeCompare(b.name)),
      color: LIQUID_GLASS_SERIES[i % LIQUID_GLASS_SERIES.length],
    }));
  }, [partners, stages, search, ownerFilter]);

  const total = columns.reduce((n, c) => n + c.cards.length, 0);

  return (
    <TooltipProvider delayDuration={150}>
      <div className="grid gap-2 items-start grid-cols-4">
        {columns.map(stage => (
          <div key={stage.key} className="rounded-lg border border-[rgba(126,184,247,0.22)] bg-[#0b1226] overflow-hidden">
            <div className="px-2.5 py-2 border-b border-[rgba(126,184,247,0.22)]" style={{ borderTop: `2px solid ${stage.color}` }}>
              <div className="flex items-baseline justify-between gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <p className="text-[11px] font-medium text-foreground truncate cursor-help underline decoration-dotted decoration-muted-foreground/50 underline-offset-2">{stage.label}</p>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-56 text-[11px]">{stage.definition}</TooltipContent>
                </Tooltip>
                <p className="text-sm font-bold font-mono tabular-nums text-foreground">{stage.cards.length}</p>
              </div>
              <p className="text-[10px] text-muted-foreground">channel partner{stage.cards.length === 1 ? '' : 's'}</p>
            </div>
            <ScrollArea className="h-96">
              <div className="p-1.5 space-y-1.5">
                {stage.cards.length === 0 && (
                  <p className="text-[10px] text-muted-foreground/70 px-1.5 py-3 text-center">No partners</p>
                )}
                {stage.cards.map(p => (
                  <div
                    key={p.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onOpenPartner?.(p.id)}
                    onKeyDown={e => { if (e.key === 'Enter') onOpenPartner?.(p.id); }}
                    className="cursor-pointer rounded-md border border-[rgba(126,184,247,0.22)] bg-[#0b1226] px-2.5 py-2 hover:bg-[#101836] hover:border-[rgba(126,184,247,0.4)] transition-colors"
                  >
                    <p className="text-xs font-medium text-foreground leading-tight truncate">{p.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                      {p.firm_type || 'Other'} · {p.owner_id ? ownerName.get(p.owner_id) || 'Unknown' : 'Unassigned'}
                    </p>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground mt-2.5">
        {total} channel partner{total === 1 ? '' : 's'}
      </p>
    </TooltipProvider>
  );
}
