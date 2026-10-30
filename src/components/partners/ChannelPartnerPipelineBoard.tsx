import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { LIQUID_GLASS_SERIES } from '@/components/metrics/liquidGlass';
import { CHANNEL_PARTNER_STAGES, type ChannelPartnerStageKey } from '@/lib/channelPartnerStages';

const norm = (s: string) => s.trim().toLowerCase();

export function ChannelPartnerPipelineBoard({ search = '', ownerFilter = [] as string[], onOpenPartner, onOpenSource }: {
  search?: string;
  ownerFilter?: string[];
  onOpenPartner?: (id: string) => void;
  onOpenSource?: (name: string) => void;
}) {
  const { company } = useCompany();
  // Only referral sources with the Channel Partner toggle on appear here.
  const { data: flagged = [] } = useQuery({
    queryKey: ['channel_partner_referral_sources', company?.id],
    enabled: !!company?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('referral_sources')
        .select('id, name, channel_partner_stage, relationship_owner_id')
        .eq('company_id', company!.id)
        .eq('is_channel_partner', true);
      if (error) throw error;
      return data ?? [];
    },
  });
  const team = useTeamMembers();
  const ownerName = useMemo(() => new Map(team.map(t => [t.id, t.display_name])), [team]);

  const columns = useMemo(() => {
    const q = norm(search);
    const src = new Map<ChannelPartnerStageKey, { id: string; name: string; owner: string | null }[]>(CHANNEL_PARTNER_STAGES.map(s => [s.key, []]));
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
                <p className="text-sm font-bold font-mono tabular-nums text-foreground">{stage.sources.length}</p>
              </div>
              <p className="text-[10px] text-muted-foreground">channel partner{stage.sources.length === 1 ? '' : 's'}</p>
            </div>
            <ScrollArea className="h-96">
              <div className="p-1.5 space-y-1.5">
                {stage.sources.length === 0 && (
                  <p className="text-[10px] text-muted-foreground/70 px-1.5 py-3 text-center">No partners</p>
                )}
                {stage.sources.map(r => (
                  <div
                    key={r.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onOpenSource?.(r.name)}
                    onKeyDown={e => { if (e.key === 'Enter') onOpenSource?.(r.name); }}
                    className="cursor-pointer rounded-md border border-[rgba(126,184,247,0.22)] bg-[#0b1226] px-2.5 py-2 hover:bg-[#101836] hover:border-[rgba(126,184,247,0.4)] transition-colors"
                  >
                    <p className="text-xs font-medium text-foreground leading-tight truncate">{r.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                      Referral source · {r.owner ? ownerName.get(r.owner) || 'Unknown' : 'Unassigned'}
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
